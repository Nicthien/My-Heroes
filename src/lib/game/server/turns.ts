import {
  RESOURCE_BUILDING_RULES,
  getFactionBuildingRule,
  getGrowthForBuiltTownBuilding,
  UNIT_RULES,
} from "@/lib/game/economy";
import {
  createExternalDwellingState,
  isExternalDwellingType,
  normalizeExternalDwellingState,
  type ExternalDwellingStateMap,
} from "@/lib/game/external-dwellings";
import { getDailyAdventureMovement } from "@/lib/game/engine";
import {
  TAVERN_OFFER_SIZE,
  getRecruitedHeroTemplateIds,
  pickTavernOffer,
  type TavernOffer,
} from "@/lib/game/heroes";
import { getTownGoldProduction } from "@/lib/game/town-buildings";
import { BuildingType, Faction, GameMap, Resources, UnitType } from "@/lib/game/types";
import { getGameWithRelations, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { evaluateGameLifecycle } from "./lifecycle";

interface MinimalTurn {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
}

interface MinimalArmy {
  unitType: UnitType;
}

interface MinimalHero {
  id: string;
  name?: string | null;
  class?: string | null;
  specialty?: string | null;
  x: number;
  y: number;
  armies: MinimalArmy[];
}

interface MinimalTown {
  id: string;
  townType?: string;
  buildings?: string[];
  availableRecruits?: Record<string, number>;
  tavernOffer?: TavernOffer[];
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
  await supabase.from("turns").upsert({
    game_id: gameId,
    game_player_id: gamePlayerId,
    turn_number: turnNumber,
    actions: [],
    is_completed: true,
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
    }).eq("id", gameId);
    return;
  }

  const nextTurnNumber = turnNumber + 1;
  const shouldApplyWeeklyGrowth = isStartOfWeek(nextTurnNumber);
  const mapState = (game.mapState as Record<string, unknown>) ?? {};
  const signaledLighthouses = (mapState.signaledLighthouses as Record<string, string[]> | undefined) ?? {};
  const mapData = game.mapData as GameMap | undefined;
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
      }
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
    for (const hero of player.heroes ?? []) {
      const isOnWater = mapData?.tiles?.[hero.y]?.[hero.x]?.terrain === "water";
      const dailyMovement = getDailyAdventureMovement(hero.armies) + (isOnWater ? lighthouseCount * 500 : 0);
      await supabase.from("heroes").update({
        movement: dailyMovement,
        max_movement: dailyMovement,
      }).eq("id", hero.id);
    }

    if (shouldApplyWeeklyGrowth) {
      const reservedHeroTemplateIds = new Set(getRecruitedHeroTemplateIds(player.heroes ?? []));
      for (const town of player.towns ?? []) {
        const buildings = (town.buildings ?? []) as string[];
        const recruits: Record<string, number> = { ...(town.availableRecruits ?? {}) };
        const townFaction = ((town.townType ?? player.faction ?? Faction.CASTLE) as Faction);
        for (const building of buildings) {
          const growth = getGrowthForBuiltTownBuilding(townFaction, building);
          for (const [unitType, amount] of Object.entries(growth)) {
            recruits[unitType] = (recruits[unitType] ?? 0) + (amount ?? 0);
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
    }
  }

  if (shouldApplyWeeklyGrowth && mapData?.tiles) {
    nextExternalDwellings = applyExternalDwellingGrowth(mapData, mapState);
  }

  const firstPlayer = alivePlayers.sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0))[0];
  const gameUpdate: Record<string, unknown> = {
    turn_number: nextTurnNumber,
    current_turn_player_id: firstPlayer?.id ?? null,
  };
  if (nextExternalDwellings) {
    gameUpdate.map_state = { ...mapState, externalDwellings: nextExternalDwellings };
  }
  await supabase.from("games").update(gameUpdate).eq("id", gameId);
}

function isStartOfWeek(dayNumber: number) {
  return dayNumber > 1 && (dayNumber - 1) % 7 === 0;
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
