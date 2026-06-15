import {
  RESOURCE_BUILDING_RULES,
  getFactionBuildingRule,
  getTownWeeklyGrowth,
  UNIT_RULES,
} from "@/lib/game/economy";
import { canRegenerateHealth } from "@/lib/game/units";
import { makeRng } from "@/lib/game/engine/rng";
import {
  createExternalDwellingState,
  isExternalDwellingType,
  normalizeExternalDwellingState,
  type ExternalDwellingStateMap,
} from "@/lib/game/external-dwellings";
import { BOAT_DAILY_MOVEMENT, getDailyAdventureMovement } from "@/lib/game/engine";
import { getEffectiveHeroMovementBonus } from "@/lib/game/artifacts";
import { getEstatesGold, getLogisticsPercent, getMysticismRegen, getNavigationPercent, type HeroSkills } from "@/lib/game/skills";
import { getHeroMaxMana } from "@/lib/game/spells";
import {
  TAVERN_OFFER_SIZE,
  getRecruitedHeroTemplateIds,
  pickTavernOffer,
  type TavernOffer,
} from "@/lib/game/heroes";
import { getTownGoldProduction } from "@/lib/game/town-buildings";
import { BuildingType, Faction, GameMap, Resources, UnitType } from "@/lib/game/types";
import { mapLevels } from "@/lib/game/map-levels";
import { getGameWithRelations, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { evaluateGameLifecycle } from "./lifecycle";
import { recordRoundScoreSnapshots } from "./scoreHistory";
import type { DbScorablePlayer } from "@/lib/game/score";

interface MinimalTurn {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
}

interface MinimalArmy {
  id?: string;
  unitType: UnitType;
  count?: number;
  health?: number;
  maxHealth?: number;
}

interface MinimalHero {
  id: string;
  name?: string | null;
  class?: string | null;
  specialty?: string | null;
  x: number;
  y: number;
  armies: MinimalArmy[];
  artifacts?: unknown;
  skills?: HeroSkills | null;
}

interface MinimalTown {
  id: string;
  x?: number;
  y?: number;
  townType?: string;
  buildings?: string[];
  availableRecruits?: Record<string, number>;
  tavernOffer?: TavernOffer[];
}

const MAGE_GUILD_BUILDINGS: ReadonlySet<string> = new Set([
  BuildingType.MAGE_GUILD,
  BuildingType.MAGE_GUILD_2,
  BuildingType.MAGE_GUILD_3,
  BuildingType.MAGE_GUILD_4,
  BuildingType.MAGE_GUILD_5,
]);

function townHasMageGuild(buildings: string[]) {
  return buildings.some((b) => MAGE_GUILD_BUILDINGS.has(b));
}

interface MinimalResourceBuilding {
  buildingType: string;
}

interface MinimalPlayer {
  id: string;
  isAlive?: boolean;
  turnOrder?: number;
  faction?: string;
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems: number;
  sulfur: number;
  heroes: MinimalHero[];
  towns: MinimalTown[];
  resourceBuildings: MinimalResourceBuilding[];
}

export async function completePlayerTurn(
  supabase: SupabaseAdmin,
  gameId: string,
  turnNumber: number,
  gamePlayerId: string
) {
  // Record the absolute start of this player's turn, so a later CANCEL_END_TURN
  // resumes the timer from the original deadline — the clock keeps running during
  // the waiting window, it does not pause.
  const { data: gameTimerRow } = await supabase
    .from("games")
    .select("current_turn_started_at")
    .eq("id", gameId)
    .maybeSingle();
  const turnStartedAt = gameTimerRow?.current_turn_started_at ?? null;

  await supabase.from("turns").upsert({
    game_id: gameId,
    game_player_id: gamePlayerId,
    turn_number: turnNumber,
    actions: [],
    is_completed: true,
    started_at: turnStartedAt,
  }, { onConflict: "game_id,game_player_id,turn_number" });

  const lifecycle = await evaluateGameLifecycle(supabase, gameId);
  if (lifecycle.status !== "ACTIVE") return;

  const game = await getGameWithRelations(supabase, gameId);
  if (!game) return;
  const alivePlayers = (game.players as unknown as MinimalPlayer[]).filter((player) => player.isAlive);
  const turns = game.turns as MinimalTurn[];
  const completedPlayerIds = new Set(
    turns
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );

  if (completedPlayerIds.size < alivePlayers.length) {
    const sortedPlayers = [...alivePlayers].sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0));
    const currentIndex = sortedPlayers.findIndex((player) => player.id === gamePlayerId);
    const nextPlayer = sortedPlayers
      .slice(currentIndex + 1)
      .concat(sortedPlayers.slice(0, Math.max(0, currentIndex + 1)))
      .find((player) => !completedPlayerIds.has(player.id));

    await supabase.from("games").update({
      current_turn_player_id: nextPlayer?.id ?? null,
      current_turn_started_at: new Date().toISOString(),
    }).eq("id", gameId);
    return;
  }

  // The round just closed (every alive player completed their turn): record one
  // score point per player for the progression chart before the day advances.
  await recordRoundScoreSnapshots(
    supabase,
    gameId,
    turnNumber,
    game.players as unknown as (DbScorablePlayer & { id: string })[],
  );

  const nextTurnNumber = turnNumber + 1;
  const shouldApplyWeeklyGrowth = isStartOfWeek(nextTurnNumber);
  const mapState = (game.mapState as Record<string, unknown>) ?? {};
  const signaledLighthouses = (mapState.signaledLighthouses as Record<string, string[]> | undefined) ?? {};
  const mapData = game.mapData as GameMap | undefined;
  const embarkedHeroIds = new Set(((game.boats as Array<{ heroId?: string | null }> | undefined) ?? []).map((boat) => boat.heroId).filter(Boolean));
  let nextExternalDwellings: ExternalDwellingStateMap | null = null;

  for (const player of alivePlayers) {
    let goldIncome = 0, woodIncome = 0, oreIncome = 0;
    let mercuryIncome = 0, crystalsIncome = 0, gemsIncome = 0, sulfurIncome = 0;

    for (const building of player.resourceBuildings ?? []) {
      const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === building.buildingType);
      if (rule) {
        goldIncome += rule.production.gold ?? 0;
        woodIncome += rule.production.wood ?? 0;
        oreIncome += rule.production.ore ?? 0;
        mercuryIncome += rule.production.mercury ?? 0;
        crystalsIncome += rule.production.crystals ?? 0;
        gemsIncome += rule.production.gems ?? 0;
        sulfurIncome += rule.production.sulfur ?? 0;
      }
    }

    let totalGoldInterestPercent = 0;
    for (const town of player.towns ?? []) {
      const buildings = (town.buildings ?? []) as string[];
      const townFaction = ((town.townType ?? player.faction ?? Faction.CASTLE) as Faction);
      goldIncome += getTownGoldProduction(buildings);
      for (const building of buildings) {
        const rule = getFactionBuildingRule(townFaction, building);
        goldIncome += rule?.dailyProduction?.gold ?? 0;
        woodIncome += rule?.dailyProduction?.wood ?? 0;
        oreIncome += rule?.dailyProduction?.ore ?? 0;
        mercuryIncome += rule?.dailyProduction?.mercury ?? 0;
        crystalsIncome += rule?.dailyProduction?.crystals ?? 0;
        gemsIncome += rule?.dailyProduction?.gems ?? 0;
        sulfurIncome += rule?.dailyProduction?.sulfur ?? 0;
        if (rule?.goldInterestPercent) totalGoldInterestPercent += rule.goldInterestPercent;
      }
    }
    if (totalGoldInterestPercent > 0) {
      goldIncome += Math.floor(player.gold * (totalGoldInterestPercent / 100));
    }

    for (const hero of player.heroes ?? []) {
      goldIncome += getEstatesGold(hero.skills);
    }

    await updatePlayerResources(supabase, player.id, {
      gold: player.gold + goldIncome,
      wood: player.wood + woodIncome,
      ore: player.ore + oreIncome,
      mercury: player.mercury + mercuryIncome,
      crystals: player.crystals + crystalsIncome,
      gems: (player.gems ?? 0) + gemsIncome,
      sulfur: player.sulfur + sulfurIncome,
    });

    const lighthouseCount = new Set(signaledLighthouses[player.id] ?? []).size;
    let townLighthouseBonus = 0;
    for (const town of player.towns ?? []) {
      const buildings = (town.buildings ?? []) as string[];
      const townFaction = ((town.townType ?? player.faction ?? Faction.CASTLE) as Faction);
      for (const building of buildings) {
        const rule = getFactionBuildingRule(townFaction, building);
        if (rule?.boatMovementBonus) townLighthouseBonus += rule.boatMovementBonus;
      }
    }
    const mageGuildTowns = (player.towns ?? []).filter((town) =>
      townHasMageGuild((town.buildings ?? []) as string[])
    );

    for (const hero of player.heroes ?? []) {
      const isOnWater = embarkedHeroIds.has(hero.id);
      const base = isOnWater ? BOAT_DAILY_MOVEMENT : getDailyAdventureMovement(hero.armies);
      const seaTownBonus = isOnWater ? lighthouseCount * 500 + townLighthouseBonus : 0;
      const artifactBonus = getEffectiveHeroMovementBonus(hero, isOnWater);
      const logisticsPct = getLogisticsPercent(hero.skills);
      const navigationPct = isOnWater ? getNavigationPercent(hero.skills) : 0;
      const skillBonus = Math.floor(base * (logisticsPct + navigationPct) / 100);
      const dailyMovement = base + seaTownBonus + artifactBonus + skillBonus;
      const heroUpdate: Record<string, unknown> = {
        movement: dailyMovement,
        max_movement: dailyMovement,
        // Adventure spell effects (fly / water_walk / disguise) expire at the start of the hero's next turn.
        active_spell_effects: null,
      };
      const visitingMageGuildTown = mageGuildTowns.some(
        (town) => town.x === hero.x && town.y === hero.y
      );
      const knowledge = Number((hero as unknown as { knowledge?: number }).knowledge ?? 0);
      const maxMana = getHeroMaxMana({ knowledge, skills: hero.skills });
      if (visitingMageGuildTown) {
        // A town with a Mage Guild fully restores spell points (Intelligence-aware ceiling).
        heroUpdate.mana = maxMana;
      } else {
        // Mysticism passively regenerates spell points each day, capped at the maximum.
        const mysticismRegen = getMysticismRegen(hero.skills);
        if (mysticismRegen > 0) {
          const currentMana = Math.max(0, Number((hero as unknown as { mana?: number }).mana ?? maxMana));
          heroUpdate.mana = Math.min(maxMana, currentMana + mysticismRegen);
        }
      }
      const { error: heroResetError } = await supabase.from("heroes").update(heroUpdate).eq("id", hero.id);
      if (heroResetError) {
        // A failed daily reset must not be silent: it leaves the hero with stale (often 0) movement
        // while the day still advances, so surface it instead of swallowing the error.
        console.error("heroes daily reset failed:", heroResetError, { heroId: hero.id });
      }

      // First Aid skill : régénération d'armée chaque jour
      const firstAidLvl = ((hero.skills?.first_aid ?? null) as string | null);
      const firstAidPct = firstAidLvl === "expert" ? 15 : firstAidLvl === "advanced" ? 10 : firstAidLvl === "basic" ? 5 : 0;
      if (firstAidPct > 0) {
        for (const army of hero.armies ?? []) {
          if (!canRegenerateHealth(army.unitType)) continue; // the King never heals
          const fullHealth = (army.count ?? 0) * (army.maxHealth ?? 0);
          if (fullHealth <= 0) continue;
          const currentHealth = army.health ?? 0;
          if (currentHealth >= fullHealth) continue;
          const heal = Math.floor(fullHealth * firstAidPct / 100);
          const nextHealth = Math.min(fullHealth, currentHealth + heal);
          await supabase.from("armies").update({ health: nextHealth }).eq("id", army.id);
        }
      }
    }

    if (shouldApplyWeeklyGrowth) {
      const reservedHeroTemplateIds = new Set(getRecruitedHeroTemplateIds(player.heroes ?? []));
      const RARE_RESOURCES: Array<keyof Resources> = ["mercury", "crystals", "gems", "sulfur"];
      const bonusRare: Partial<Resources> = {};
      for (const town of player.towns ?? []) {
        const buildings = (town.buildings ?? []) as string[];
        const recruits: Record<string, number> = { ...(town.availableRecruits ?? {}) };
        const townFaction = ((town.townType ?? player.faction ?? Faction.CASTLE) as Faction);
        const growth = getTownWeeklyGrowth(townFaction, buildings);
        for (const [unitType, amount] of Object.entries(growth)) {
          recruits[unitType] = (recruits[unitType] ?? 0) + (amount ?? 0);
        }
        for (const building of buildings) {
          const rule = getFactionBuildingRule(townFaction, building);
          if (rule?.weeklyRandomRareResource) {
            const rng = makeRng(`${gameId}:${town.id}:week:${nextTurnNumber}`);
            const resource = RARE_RESOURCES[Math.floor(rng() * RARE_RESOURCES.length)];
            bonusRare[resource] = (bonusRare[resource] ?? 0) + rule.weeklyRandomRareResource;
          }
        }
        // Portail d'invocation (Royaume Sous-Roche UNIQUE_4) : tire 50% des unités des demeures externes du joueur vers les recrues de cette ville.
        if (townFaction === Faction.DUNGEON && buildings.includes(BuildingType.UNIQUE_4)) {
          const externalDwellings = ((mapState.externalDwellings as Record<string, { ownerId?: string | null; unitType?: string; available?: number }> | undefined) ?? {});
          const pulledByType: Record<string, number> = {};
          const updates: Record<string, { ownerId?: string | null; unitType?: string; available?: number }> = {};
          for (const [id, state] of Object.entries(externalDwellings)) {
            if (state.ownerId !== player.id || !state.unitType || (state.available ?? 0) <= 0) continue;
            const transferred = Math.floor((state.available ?? 0) * 0.5);
            if (transferred <= 0) continue;
            pulledByType[state.unitType] = (pulledByType[state.unitType] ?? 0) + transferred;
            updates[id] = { ...state, available: (state.available ?? 0) - transferred };
          }
          for (const [unitType, amount] of Object.entries(pulledByType)) {
            recruits[unitType] = (recruits[unitType] ?? 0) + amount;
          }
          if (Object.keys(updates).length > 0) {
            const nextMapState = {
              ...mapState,
              externalDwellings: { ...externalDwellings, ...updates },
            };
            await supabase.from("games").update({ map_state: nextMapState }).eq("id", gameId);
            (mapState as Record<string, unknown>).externalDwellings = nextMapState.externalDwellings;
          }
        }
        const townUpdate: Record<string, unknown> = { available_recruits: recruits };
        if (buildings.includes(BuildingType.TAVERN)) {
          const offer = pickTavernOffer(townFaction, Array.from(reservedHeroTemplateIds), TAVERN_OFFER_SIZE);
          for (const entry of offer) reservedHeroTemplateIds.add(entry.templateId);
          townUpdate.tavern_offer = offer;
        }
        await supabase.from("towns").update(townUpdate).eq("id", town.id);
      }
      if (Object.values(bonusRare).some((v) => (v ?? 0) > 0)) {
        const { data: refreshed } = await supabase
          .from("game_players")
          .select("gold,wood,ore,mercury,crystals,gems,sulfur")
          .eq("id", player.id)
          .single();
        if (refreshed) {
          await updatePlayerResources(supabase, player.id, {
            mercury: (refreshed.mercury ?? 0) + (bonusRare.mercury ?? 0),
            crystals: (refreshed.crystals ?? 0) + (bonusRare.crystals ?? 0),
            gems: (refreshed.gems ?? 0) + (bonusRare.gems ?? 0),
            sulfur: (refreshed.sulfur ?? 0) + (bonusRare.sulfur ?? 0),
          });
        }
      }
    }
  }

  let neutralGrowthChangedMapData = false;
  if (shouldApplyWeeklyGrowth) {
    // Undefeated neutral guards harden over time: every week each surviving neutral
    // (monster army, guarded mine, gate, neutral town garrison, artifact guard) gains
    // +25%, compounding but capped at ×3 of its base. Counterpart to the soft start from
    // the halved GUARD_STRENGTH_MULTIPLIER in `neutral-armies.ts`.
    neutralGrowthChangedMapData = await applyWeeklyNeutralGrowth(supabase, gameId, nextTurnNumber, mapData);
  }

  if (shouldApplyWeeklyGrowth && mapData?.tiles) {
    nextExternalDwellings = applyExternalDwellingGrowth(mapData, mapState);
  }

  const firstPlayer = alivePlayers.sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0))[0];
  const gameUpdate: Record<string, unknown> = {
    turn_number: nextTurnNumber,
    current_turn_player_id: firstPlayer?.id ?? null,
    current_turn_started_at: new Date().toISOString(),
  };
  if (nextExternalDwellings) {
    gameUpdate.map_state = { ...mapState, externalDwellings: nextExternalDwellings };
  }
  if (neutralGrowthChangedMapData) {
    // Weekly neutral growth scaled mine/artifact guardianPower in the map blob — persist it
    // so the display source stays in sync with the (already-written) combat-side values.
    gameUpdate.map_data = mapData;
  }
  await supabase.from("games").update(gameUpdate).eq("id", gameId);
}

export async function cancelPlayerTurnCompletion(
  supabase: SupabaseAdmin,
  gameId: string,
  turnNumber: number,
  gamePlayerId: string
) {
  const { data: turn, error: turnError } = await supabase
    .from("turns")
    .select("id,is_completed,started_at")
    .eq("game_id", gameId)
    .eq("game_player_id", gamePlayerId)
    .eq("turn_number", turnNumber)
    .maybeSingle();

  if (turnError) throw turnError;
  if (!turn?.is_completed) {
    return { ok: false, error: "Votre tour est déjà actif." };
  }

  const { error: updateError } = await supabase
    .from("turns")
    .update({ is_completed: false })
    .eq("id", turn.id);
  if (updateError) throw updateError;

  // Resume the timer from the turn's ORIGINAL start, so the time spent while the
  // turn was ended still counts down — cancelling does not pause or refill it.
  const resumedStartedAt = (turn.started_at as string | null) ?? new Date().toISOString();
  const { error: gameError } = await supabase
    .from("games")
    .update({ current_turn_player_id: gamePlayerId, current_turn_started_at: resumedStartedAt })
    .eq("id", gameId)
    .eq("turn_number", turnNumber);
  if (gameError) throw gameError;

  return { ok: true };
}

function isStartOfWeek(dayNumber: number) {
  return dayNumber > 1 && (dayNumber - 1) % 7 === 0;
}

// Weekly escalation for undefeated neutral guards.
const NEUTRAL_WEEKLY_GROWTH = 1.25; // +25% per week
const NEUTRAL_GROWTH_CAP = 3; // never grow past ×3 of the base strength

/**
 * Growth factor to apply at a given week-start so that the *cumulative* growth follows
 * `min(×3, 1.25^weeksElapsed)`. Returns 1 once the ×3 ceiling is reached (≈ week 6), which
 * lets callers skip the work entirely. Caller guarantees `isStartOfWeek(dayNumber)`, so
 * `(dayNumber - 1) / 7` is an integer week index (1 on day 8, 2 on day 15, …).
 */
function neutralWeeklyGrowthFactor(dayNumber: number): number {
  const week = (dayNumber - 1) / 7;
  const prev = Math.min(NEUTRAL_GROWTH_CAP, NEUTRAL_WEEKLY_GROWTH ** (week - 1));
  const curr = Math.min(NEUTRAL_GROWTH_CAP, NEUTRAL_WEEKLY_GROWTH ** week);
  return curr / prev;
}

function grownCount(count: number, factor: number): number {
  return Math.max(1, Math.round((count ?? 0) * factor));
}

/**
 * Grows every undefeated neutral guard by `factor`, harmonising the three storage shapes
 * so the displayed threat badge and the actual fight always agree:
 *  - DB stacks (monster armies, gate garrisons) and the neutral-town garrison blob are
 *    scaled in place — both the preview and combat read these directly.
 *  - Mines store their strength as `resource_buildings.guardian_power` (the value the
 *    server fights with); the displayed badge instead reads `mapData.object.guardianPower`.
 *    We scale the table value and MIRROR it back into mapData (by id) so the two can't drift.
 *  - Map-object artifact guards live only in mapData (read by both preview and combat) and
 *    are scaled there too.
 * Returns whether mapData was mutated, so the caller knows to persist `map_data`.
 */
async function applyWeeklyNeutralGrowth(
  supabase: SupabaseAdmin,
  gameId: string,
  dayNumber: number,
  mapData: GameMap | undefined,
): Promise<boolean> {
  const factor = neutralWeeklyGrowthFactor(dayNumber);
  if (factor <= 1.0001) return false; // ×3 ceiling reached — neutrals no longer grow

  const writes: PromiseLike<unknown>[] = [];

  // 1. Wandering / zone / pocket monster armies still alive.
  const { data: armies } = await supabase
    .from("neutral_armies")
    .select("id, neutral_army_stacks(id, count, max_health)")
    .eq("game_id", gameId)
    .eq("status", "ACTIVE");
  for (const army of (armies ?? []) as Array<{ neutral_army_stacks?: Array<{ id: string; count: number; max_health: number }> }>) {
    for (const stack of army.neutral_army_stacks ?? []) {
      const count = grownCount(stack.count, factor);
      writes.push(
        supabase
          .from("neutral_army_stacks")
          .update({ count, health: count * (stack.max_health ?? 0) })
          .eq("id", stack.id),
      );
    }
  }

  // 2. Guarded resource buildings (mines) still in neutral hands. resource_buildings holds
  //    the value the server fights with; we capture each new value to mirror into mapData
  //    (the display source) afterwards so the badge and the fight stay in lockstep.
  const nextBuildingPower = new Map<string, number>();
  const { data: buildings } = await supabase
    .from("resource_buildings")
    .select("id, guardian_power")
    .eq("game_id", gameId)
    .is("game_player_id", null)
    .gt("guardian_power", 0);
  for (const building of (buildings ?? []) as Array<{ id: string; guardian_power: number }>) {
    const next = Math.max(1, Math.round((building.guardian_power ?? 0) * factor));
    nextBuildingPower.set(building.id, next);
    writes.push(
      supabase.from("resource_buildings").update({ guardian_power: next }).eq("id", building.id),
    );
  }

  // 3. Gate guards: scale both the guardian_power budget and any persisted gate_stacks.
  const { data: gates } = await supabase
    .from("gates")
    .select("id, guardian_power, gate_stacks(id, count, max_health)")
    .eq("game_id", gameId)
    .is("game_player_id", null)
    .gt("guardian_power", 0);
  for (const gate of (gates ?? []) as Array<{ id: string; guardian_power: number; gate_stacks?: Array<{ id: string; count: number; max_health: number }> }>) {
    writes.push(
      supabase
        .from("gates")
        .update({ guardian_power: Math.round((gate.guardian_power ?? 0) * factor) })
        .eq("id", gate.id),
    );
    for (const stack of gate.gate_stacks ?? []) {
      const count = grownCount(stack.count, factor);
      writes.push(
        supabase
          .from("gate_stacks")
          .update({ count, health: count * (stack.max_health ?? 0) })
          .eq("id", stack.id),
      );
    }
  }

  // 4. Neutral town garrisons (stored as a camelCase UnitStack[] jsonb blob).
  const { data: towns } = await supabase
    .from("towns")
    .select("id, neutral_garrison")
    .eq("game_id", gameId)
    .eq("is_neutral", true);
  for (const town of (towns ?? []) as Array<{ id: string; neutral_garrison?: Array<{ count: number; health?: number; maxHealth?: number }> }>) {
    const garrison = town.neutral_garrison ?? [];
    if (garrison.length === 0) continue;
    const grown = garrison.map((stack) => {
      const count = grownCount(stack.count, factor);
      return { ...stack, count, health: count * (stack.maxHealth ?? stack.health ?? 0) };
    });
    writes.push(supabase.from("towns").update({ neutral_garrison: grown }).eq("id", town.id));
  }

  await Promise.all(writes);

  // 5. mapData pass: mirror the new mine power into the display source, and grow map-object
  //    artifact guards (which live only in mapData, read by both their preview and combat).
  let mapDataChanged = false;
  if (mapData) {
    for (const layer of mapLevels(mapData)) {
      for (const row of layer.tiles) {
        for (const tile of row) {
          const object = tile.object;
          if (!object) continue;
          if (object.type === "building") {
            const next = nextBuildingPower.get(object.id);
            if (next !== undefined && next !== object.guardianPower) {
              object.guardianPower = next;
              mapDataChanged = true;
            }
          } else if (object.type === "artifact" && (object.guardianPower ?? 0) > 0) {
            object.guardianPower = Math.max(1, Math.round((object.guardianPower ?? 0) * factor));
            mapDataChanged = true;
          }
        }
      }
    }
  }

  return mapDataChanged;
}

async function updatePlayerResources(
  supabase: SupabaseAdmin,
  playerId: string,
  resources: Partial<Resources>
) {
  const { error } = await supabase.from("game_players").update(resources).eq("id", playerId);
  if (error) throw error;
}

function applyExternalDwellingGrowth(mapData: GameMap, mapState: Record<string, unknown>): ExternalDwellingStateMap {
  const current = ((mapState.externalDwellings as ExternalDwellingStateMap | undefined) ?? {});
  const next: ExternalDwellingStateMap = { ...current };

  for (const row of mapData.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (object?.type !== "adventure_building" || !isExternalDwellingType(object.subtype)) continue;
      const state = normalizeExternalDwellingState(object, next[object.id]) ?? createExternalDwellingState(object);
      if (!state) continue;
      next[object.id] = {
        ...state,
        available: state.available + (UNIT_RULES[state.unitType]?.growth ?? 0),
      };
    }
  }

  return next;
}
