import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCurrentUser } from "@/lib/auth";
import {
  getFactionBuildingRules,
} from "@/lib/game/economy";
import { isCreatureBankType, PendingCreatureBankReward } from "@/lib/game/creature-banks";
import { calculateArmyPower } from "@/lib/game/combat/autoResolve";
import {
  HERO_ARMY_STACK_LIMIT,
  UNIT_STACK_COUNT_CAP,
  addUnitsToStacks,
  sortedStacks,
} from "@/lib/game/army-stacks";
import { getCreature } from "@/lib/game/creature-catalog";
import { makeRng } from "@/lib/game/engine/rng";
import {
  ARTIFACT_SLOTS,
  getArtifact,
  getEffectiveHeroStatsFromValues,
  normalizeArtifactBag,
  pickArtifactId,
  type ArtifactSlot,
} from "@/lib/game/artifacts";
import { AdventureBuildingType, BuildingType, Faction, GameMap, MapObject, Position, Resources, UnitType } from "@/lib/game/types";
import { normalizeMapLevel, SURFACE_LEVEL } from "@/lib/game/map-levels";
import {
  canMoveAdventureStep,
  canMoveAdventureStepForMode,
  computeVisibleTiles,
  getAdventurePathCost,
  getAdventurePathCostForMode,
  getAdventureStepCost,
  getAdventureStepCostForMode,
  getPlayerVisionCenters,
  getRequiredAdventureMovement,
  getRequiredAdventureMovementForMode,
  getUsableAdventureMovement,
  isTileTraversable,
  type AdventureMovementMode,
  type HeroAdventureSpellEffect,
} from "@/lib/game/engine";
import { isTownCoastalForBoats } from "@/lib/game/engine/town-coast";
import { getGrailLocation, getObeliskIds, normalizeObeliskCount, pickGrailLocation } from "@/lib/game/grail";
import { createNeutralArmyStacksForTile } from "@/lib/game/neutral-armies";
import { createNeutralTownGarrison } from "@/lib/game/neutral-towns";
import { getUnitRule } from "@/lib/game/units";
import { SPELLS, getHeroMana } from "@/lib/game/spells";
import { isFaction, pickTownFactionForTerrain, pickTownName } from "@/lib/game/town-generation";
import { buildActionLogInput, recordGameAction } from "@/lib/game/server/action-log";
import { applyScoreDelta, scoreDeltaForAction } from "@/lib/game/server/score-stats";
import { computePlayerScore, scorableFromDbPlayer, type DbScorablePlayer, type ScoreBreakdown } from "@/lib/game/score";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";
import { handleAdventureAction } from "./adventureActions";
import { handleArmyAction } from "./armyActions";
import { handleArtifactAction } from "./artifactActions";
import { handleBoatAction } from "./boatActions";
import { handleCaptureAction } from "./captureActions";
import { handleDevAction } from "./devActions";
import { handleEconomyAction } from "./economyActions";
import { handleGarrisonAction } from "./garrisonActions";
import { handleRewardAction } from "./rewardActions";
import { handleSkillAction } from "./skillActions";
import { handleTownAction } from "./townActions";
import { handleTurnAction } from "./turnActions";
import { runAdventureBuildingVisit } from "./adventureBuildingVisit";
import { handleMoveHeroAction } from "./moveHeroActions";
import { getAdventureWeekKey, getLatestMapState } from "./actionHelpers";
import type {
  CaptureTownRow,
  HeroStatKey,
  MinimalArmy,
  MinimalBoat,
  MinimalBuilding,
  MinimalGate,
  MinimalHero,
  MinimalPlayer,
  MinimalTown,
  MinimalTurn,
  SupabaseAdminClient,
} from "./types";

const HERO_IN_COMBAT_ERROR = "Ce héros est déjà engagé dans un combat.";

/**
 * Thin wrapper injecting the route-owned resource helpers into the extracted
 * adventure-building visit flow (see ./adventureBuildingVisit). Keeps existing
 * call sites and the helper passed to handleAdventureAction unchanged.
 */
function handleAdventureBuildingVisit(
  params: Omit<Parameters<typeof runAdventureBuildingVisit>[0], "helpers">,
) {
  return runAdventureBuildingVisit({
    ...params,
    helpers: { playerResources, updatePlayerResources, addUnitsToHeroArmy },
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireCurrentUser(request);
    if (!user) return response;
    if (user.role === "admin") {
      return NextResponse.json({ error: "Un administrateur peut seulement consulter la partie." }, { status: 403 });
    }

    const { id } = await params;
    const action = await request.json();
    const supabase = createAdminClient();
    const gamePlayer = await getGamePlayer(supabase, id, user.id) as unknown as MinimalPlayer | null;
    const game = await getGameWithRelations(supabase, id);

    if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
    if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
    if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });
    if (!gamePlayer.isAlive) return NextResponse.json({ error: "Vous avez perdu cette partie" }, { status: 403 });

    // Self-heal games created before the Grail feature (or before its later
    // tweaks): normalize the Obelisk count (2×–3× players) once, and ensure a
    // reachable buried tile exists. Guarded by a flag so it runs at most once.
    {
      const config = (game.gameConfig as Record<string, unknown> | null) ?? {};
      const grailDug = Boolean((game.mapState as Record<string, unknown> | null)?.grailFound);
      const needsObelisks = !config.obelisksNormalized;
      const needsGrail = !getGrailLocation(game.gameConfig) && !grailDug;
      if (needsObelisks || needsGrail) {
        const map = game.mapData as GameMap;
        const playerCount = Array.isArray(game.players) && game.players.length > 0
          ? game.players.length
          : Number(game.maxPlayers ?? 2);
        if (needsObelisks) normalizeObeliskCount(map, playerCount);
        // Re-pick the buried tile while healing (only if it has never been dug),
        // so legacy games also get the reachable-tile guarantee.
        const grail = grailDug ? getGrailLocation(game.gameConfig) : pickGrailLocation(map);
        const obelisksTotal = getObeliskIds(map).length;
        const nextConfig = { ...config, obelisksNormalized: true, obelisksTotal, ...(grail ? { grail } : {}) };
        await supabase.from("games").update({ game_config: nextConfig, map_data: map }).eq("id", id);
        (game as { gameConfig?: unknown }).gameConfig = nextConfig;
      }
    }

    const devResponse = await handleDevAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      getActionPosition,
      getLatestMapState,
      logPlayerAction,
      updatePlayerResources,
    });
    if (devResponse) return devResponse;

    const players = game.players as unknown as Array<{
      id: string;
      isAlive: boolean;
      turnOrder: number;
      resourceBuildings: MinimalBuilding[];
      towns: MinimalTown[];
      heroes?: MinimalHero[];
    }>;
    const gates = (game.gates ?? []) as unknown as MinimalGate[];
    const boats = (game.boats ?? []) as unknown as MinimalBoat[];
    const turns = game.turns as MinimalTurn[];
    const completedTurn = turns.find((turn) =>
      turn.gamePlayerId === gamePlayer.id && turn.turnNumber === game.turnNumber && turn.isCompleted
    );
    if (completedTurn && action.type !== "END_TURN" && action.type !== "CANCEL_END_TURN" && action.type !== "SURRENDER_GAME") {
      return NextResponse.json({ error: "Vous avez déjà terminé votre tour" }, { status: 403 });
    }

    const artifactResponse = await handleArtifactAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      addArtifactToBag,
      canTransferArtifactsBetweenHeroes,
      equipHeroArtifact,
      getActionPosition,
      logPlayerAction,
      transferHeroArtifact,
      unequipHeroArtifact,
      validateAndApplyArtifactApproach,
    });
    if (artifactResponse) return artifactResponse;

    const moveHeroResponse = await handleMoveHeroAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      players,
      gates,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        getEffectiveGates,
        validateMovePath,
        getDefeatedCreatureBanks,
        findFirstMoveStop,
        getPathMovementCost,
        getResourcePileAmount,
        incrementPlayerResource,
        resolveDiplomacyOnMonster,
        findGate,
        getResourceBuilding,
        findResourceBuildingOwner,
        captureGate,
        applyOwnTownVisitBonuses,
        logPlayerAction,
        handleAdventureBuildingVisit,
      },
    });
    if (moveHeroResponse) return moveHeroResponse;

    const boatResponse = await handleBoatAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      boats,
      players,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        areAdjacentOrSame,
        getActionPosition,
        isOccupiedByAnyHero,
        logPlayerAction,
        playerResources,
      },
    });
    if (boatResponse) return boatResponse;

    const adventureResponse = await handleAdventureAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      players,
      boats,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        applyAdventureSpell,
        areAdjacentOrSame,
        findAdventureBuildingById,
        handleAdventureBuildingVisit,
        logPlayerAction,
        normalizeHeroStatChoice,
      },
    });
    if (adventureResponse) return adventureResponse;

    const captureResponse = await handleCaptureAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      players,
      gates,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        areAdjacentOrSame,
        captureGate,
        createNeutralTownForMapTile,
        ensureNeutralTownGarrison,
        findTownForCapture,
        getActionPathDestination,
        getActionPosition,
        getEffectiveGates,
        getResourceBuilding,
        logPlayerAction,
        validateAndApplyActionPath,
      },
    });
    if (captureResponse) return captureResponse;

    const townResponse = await handleTownAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      helpers: {
        addRecruitGrowth,
        applyOwnTownVisitBonuses,
        getArtifactMerchantBuilding,
        isMissingSpellSchemaError,
        isTownCoastalForBoats,
        logPlayerAction,
        playerResources,
        rollMageGuildSpells,
        rollMageGuildSpellsForLevel,
        rollTownArtifactOffer,
      },
    });
    if (townResponse) return townResponse;

    const armyResponse = await handleArmyAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        addUnitsToHeroArmy,
        addUnitsToStackList,
        logPlayerAction,
        persistHeroArmyDiff,
        playerResources,
        removeUnitsFromHeroArmy,
        removeUnitsFromStackList,
        updatePlayerResources,
      },
    });
    if (armyResponse) return armyResponse;

    const rewardResponse = await handleRewardAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      helpers: {
        addUnitsToHeroArmy,
        getCreatureBankStateMap,
        getLatestMapState,
        logPlayerAction,
        normalizeCreatureRewardSelection,
        playerResources,
        updatePlayerResources,
      },
    });
    if (rewardResponse) return rewardResponse;

    const garrisonResponse = await handleGarrisonAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      gates,
      action,
      helpers: {
        addUnitsToGateGarrison,
        addUnitsToHeroArmy,
        addUnitsToStackList,
        areAdjacentOrSame,
        compactGateStackPositions,
        logPlayerAction,
        removeUnitsFromHeroArmy,
        removeUnitsFromStackList,
      },
    });
    if (garrisonResponse) return garrisonResponse;

    const economyResponse = await handleEconomyAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      helpers: {
        addArtifactToBag,
        getArtifactMerchantBuilding,
        logPlayerAction,
        playerResources,
        removeUnitsFromStackList,
        updatePlayerResources,
      },
    });
    if (economyResponse) return economyResponse;

    const skillResponse = await handleSkillAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      helpers: {
        logPlayerAction,
        updatePlayerResources,
      },
    });
    if (skillResponse) return skillResponse;

    const turnResponse = await handleTurnAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      logPlayerAction,
    });
    if (turnResponse) return turnResponse;

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
    console.error("Action error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function playerResources(player: {
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems?: number;
  sulfur: number;
}): Resources {
  return {
    gold: player.gold,
    wood: player.wood,
    ore: player.ore,
    mercury: player.mercury,
    crystals: player.crystals,
    gems: player.gems ?? 0,
    sulfur: player.sulfur,
  };
}

async function logPlayerAction(
  supabase: SupabaseAdminClient,
  game: { turnNumber?: unknown },
  gameId: string,
  gamePlayer: MinimalPlayer,
  action: Record<string, unknown>,
) {
  const actorName = gamePlayer.isAi ? gamePlayer.aiName || "IA" : gamePlayer.user?.name || "Joueur";
  await recordGameAction(supabase, buildActionLogInput({
    gameId,
    gamePlayerId: gamePlayer.id,
    actorKind: gamePlayer.isAi ? "ai" : "player",
    turnNumber: Number(game.turnNumber ?? 0),
    actorName,
    action: action as never,
  }));
  await applyScoreDelta(supabase, gamePlayer.id, scoreDeltaForAction(action));
}

function addRecruitGrowth(
  availableRecruits: Record<string, number>,
  growth: Partial<Record<UnitType, number>>,
) {
  const next = { ...availableRecruits };
  for (const [unitType, amount] of Object.entries(growth)) {
    const count = Math.floor(Number(amount ?? 0));
    if (count <= 0) continue;
    next[unitType] = Math.max(0, Math.floor(Number(next[unitType] ?? 0))) + count;
  }
  return next;
}

function addUnitsToStackList(stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) {
  return addUnitsToStacks(
    stacks,
    unitType,
    count,
    maxHealth,
    () => randomUUID(),
    Math.max(HERO_ARMY_STACK_LIMIT, stacks.length + Math.ceil(count / UNIT_STACK_COUNT_CAP)),
  ).stacks;
}

function removeUnitsFromStackList(stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) {
  let remaining = Math.max(0, Math.floor(count));
  return stacks
    .map((unit) => {
      if (unit.unitType !== unitType || remaining <= 0) return unit;
      const removed = Math.min(unit.count, remaining);
      remaining -= removed;
      return { ...unit, count: unit.count - removed, health: Math.max(0, unit.health - maxHealth * removed) };
    })
    .filter((unit) => unit.count > 0)
    .map((unit, position) => ({ ...unit, position }));
}

function findGate(gates: MinimalGate[], gateId: string, position: Position) {
  return gates.find((gate) =>
    gate.id === gateId || (gate.x === position.x && gate.y === position.y)
  );
}

function getEffectiveGates(gates: MinimalGate[], mapData: GameMap) {
  const byId = new Map(gates.map((gate) => [gate.id, gate]));
  const byPosition = new Map(gates.map((gate) => [`${gate.x},${gate.y}`, gate]));

  for (const row of mapData.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (object?.type !== "gate") continue;
      const key = `${tile.x},${tile.y}`;
      if (byId.has(object.id) || byPosition.has(key)) continue;

      const garrison = createNeutralArmyStacksForTile(tile, object.guardianPower ?? 100, object.id)
        .map((stack): MinimalArmy => ({
          id: `${object.id}-stack-${stack.position}`,
          unitType: stack.unitType,
          count: stack.count,
          health: stack.health,
          maxHealth: stack.maxHealth,
          position: stack.position,
        }));
      const gate: MinimalGate = {
        id: object.id,
        gamePlayerId: object.ownerId ?? null,
        x: tile.x,
        y: tile.y,
        guardianPower: object.guardianPower ?? 0,
        garrison,
      };
      byId.set(gate.id, gate);
      byPosition.set(key, gate);
    }
  }

  return [...byId.values()];
}

function areAdjacentOrSame(a: Position, b: Position) {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

function adjacentPositions(position: Position): Position[] {
  const positions: Position[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      positions.push({ x: position.x + dx, y: position.y + dy });
    }
  }
  return positions;
}

function findFreeAdjacentWaterTile(map: GameMap, position: Position, boats: MinimalBoat[]) {
  const occupied = new Set(boats.filter((boat) => !boat.heroId && normalizeMapLevel(boat.mapLevel) === SURFACE_LEVEL).map((boat) => `${boat.x},${boat.y}`));
  return adjacentPositions(position).find((candidate) => {
    const tile = map.tiles[candidate.y]?.[candidate.x];
    return tile?.terrain === "water" && isTileTraversable(tile) && !occupied.has(`${candidate.x},${candidate.y}`);
  }) ?? null;
}

function findNearestEmptyBoat(boats: MinimalBoat[], position: Position) {
  return boats
    .filter((boat) => !boat.heroId && normalizeMapLevel(boat.mapLevel) === SURFACE_LEVEL)
    .sort((a, b) =>
      Math.max(Math.abs(a.x - position.x), Math.abs(a.y - position.y)) -
      Math.max(Math.abs(b.x - position.x), Math.abs(b.y - position.y))
    )[0] ?? null;
}

function isOccupiedByAnyHero(players: Array<{ heroes?: MinimalHero[] }>, movingHeroId: string, destination: Position) {
  return players.some((player) => (player.heroes ?? []).some((hero) =>
    hero.id !== movingHeroId && hero.x === destination.x && hero.y === destination.y
  ));
}

async function captureGate(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  gate: MinimalGate,
  playerId: string,
) {
  await supabase
    .from("gates")
    .upsert({
      id: gate.id,
      game_id: gameId,
      game_player_id: playerId,
      x: gate.x,
      y: gate.y,
      guardian_power: 0,
    }, { onConflict: "id" });
  await supabase.from("gate_stacks").delete().eq("gate_id", gate.id);
}

async function addUnitsToHeroArmy(
  supabase: ReturnType<typeof createAdminClient>,
  hero: MinimalHero,
  unitType: UnitType,
  count: number,
  maxHealth: number,
) {
  const { data } = await supabase
    .from("armies")
    .select("id,unit_type,count,health,max_health,position")
    .eq("hero_id", hero.id)
    .order("position", { ascending: true });
  const current = sortedStacks(
    ((data ?? []) as Array<{ id: string; unit_type: UnitType; count: number; health: number; max_health: number; position: number }>)
      .map((stack) => ({
        id: stack.id,
        unitType: stack.unit_type,
        count: Number(stack.count ?? 0),
        health: Number(stack.health ?? 0),
        maxHealth: Number(stack.max_health ?? maxHealth),
        position: Number(stack.position ?? 0),
      }))
  );
  const next = addUnitsToStacks(current, unitType, count, maxHealth, () => randomUUID()).stacks;
  await persistHeroArmyDiff(supabase, hero.id, current, next);
}

async function removeUnitsFromHeroArmy(
  supabase: ReturnType<typeof createAdminClient>,
  source: MinimalArmy,
  count: number,
  maxHealth: number,
) {
  if (source.count === count) {
    await supabase.from("armies").delete().eq("id", source.id);
    return;
  }

  await supabase.from("armies").update({
    count: source.count - count,
    health: Math.max(0, source.health - maxHealth * count),
  }).eq("id", source.id);
}

async function persistHeroArmyDiff(
  supabase: ReturnType<typeof createAdminClient>,
  heroId: string,
  before: MinimalArmy[],
  after: MinimalArmy[],
) {
  const afterById = new Map(after.map((stack) => [stack.id, stack]));
  for (const stack of before) {
    if (!afterById.has(stack.id)) {
      await supabase.from("armies").delete().eq("id", stack.id).eq("hero_id", heroId);
    }
  }

  const beforeIds = new Set(before.map((stack) => stack.id));
  for (const stack of after) {
    if (beforeIds.has(stack.id)) {
      await supabase.from("armies").update({
        unit_type: stack.unitType,
        count: stack.count,
        health: stack.health,
        max_health: stack.maxHealth,
        position: stack.position,
      }).eq("id", stack.id).eq("hero_id", heroId);
    } else {
      await supabase.from("armies").insert({
        id: stack.id,
        hero_id: heroId,
        unit_type: stack.unitType,
        count: stack.count,
        health: stack.health,
        max_health: stack.maxHealth,
        position: stack.position,
      });
    }
  }
}

async function addUnitsToGateGarrison(
  supabase: ReturnType<typeof createAdminClient>,
  gate: MinimalGate,
  unitType: UnitType,
  count: number,
  maxHealth: number,
) {
  const existing = (gate.garrison ?? []).find((unit) => unit.unitType === unitType);
  if (existing) {
    await supabase.from("gate_stacks").update({
      count: existing.count + count,
      health: existing.health + maxHealth * count,
    }).eq("id", existing.id);
    return;
  }

  await supabase.from("gate_stacks").insert({
    gate_id: gate.id,
    unit_type: unitType,
    count,
    health: maxHealth * count,
    max_health: maxHealth,
    position: gate.garrison?.length ?? 0,
  });
}

async function compactGateStackPositions(supabase: ReturnType<typeof createAdminClient>, gateId: string) {
  const { data } = await supabase
    .from("gate_stacks")
    .select("id,position")
    .eq("gate_id", gateId)
    .order("position", { ascending: true });
  for (let position = 0; position < (data ?? []).length; position++) {
    const stack = data?.[position];
    if (stack && stack.position !== position) {
      await supabase.from("gate_stacks").update({ position }).eq("id", stack.id);
    }
  }
}

async function incrementPlayerResource(supabase: ReturnType<typeof createAdminClient>, playerId: string, resource: string, amount: number) {
  const game = await getGameRowForPlayer(supabase, playerId);
  if (!game) return;
  const current = Number(game[resource] ?? 0);
  await supabase.from("game_players").update({ [resource]: current + amount }).eq("id", playerId);
}

function getResourcePileAmount(object: MapObject) {
  const amount = Number(object.amount);
  if (Number.isFinite(amount) && amount > 0) return amount;

  switch (object.subtype) {
    case "gold":
      return 500;
    case "wood":
    case "ore":
      return 5;
    case "mercury":
    case "crystals":
    case "gems":
    case "sulfur":
      return 3;
    default:
      return 1;
  }
}

async function getGameRowForPlayer(supabase: ReturnType<typeof createAdminClient>, playerId: string) {
  const { data } = await supabase.from("game_players").select("*").eq("id", playerId).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getResourceBuilding(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  buildingId: string
): Promise<MinimalBuilding | null> {
  const { data } = await supabase
    .from("resource_buildings")
    .select("id,x,y,building_type,guardian_power")
    .eq("game_id", gameId)
    .eq("id", buildingId)
    .maybeSingle();

  return data
    ? { id: data.id, x: data.x, y: data.y, buildingType: data.building_type, guardianPower: data.guardian_power }
    : null;
}

function normalizeHeroStatChoice(value: unknown): HeroStatKey | undefined {
  return value === "attack" || value === "defense" || value === "spellPower" || value === "knowledge"
    ? value
    : undefined;
}

function findAdventureBuildingById(map: GameMap, buildingId: string): { object: MapObject; position: Position } | null {
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "adventure_building" && tile.object.id === buildingId) {
        return { object: tile.object, position: { x: tile.x, y: tile.y } };
      }
    }
  }
  return null;
}

function rollMageGuildSpells(seed: string, count: number): string[] {
  const rng = makeRng(seed);
  const pool = SPELLS.filter((s) => s.context === "combat" && s.implemented).map((s) => s.id);
  const picked: string[] = [];
  const remaining = [...pool];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = Math.floor(rng() * remaining.length);
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

function rollMageGuildSpellsForLevel(seed: string, count: number, spellLevel: number): string[] {
  const rng = makeRng(seed);
  const pool = SPELLS.filter((s) => s.implemented && (s.level ?? 1) === spellLevel).map((s) => s.id);
  // Si pas assez de sorts de ce niveau, fallback vers niveaux adjacents
  const fallback = SPELLS.filter((s) => s.implemented).map((s) => s.id);
  const source = pool.length >= count ? pool : [...pool, ...fallback.filter((s) => !pool.includes(s))];
  const picked: string[] = [];
  const remaining = [...source];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = Math.floor(rng() * remaining.length);
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

function rollTownArtifactOffer(seed: string, count: number): string[] {
  const rng = makeRng(seed);
  const tokens = ["random_treasure", "random_minor", "random_minor", "random_major"];
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const token = tokens[i % tokens.length];
    picked.push(pickArtifactId(token, `${seed}:${i}:${rng()}`));
  }
  return picked;
}

function getArtifactMerchantBuilding(faction: Faction): BuildingType | null {
  if (faction === Faction.TOWER) return BuildingType.UNIQUE_4;
  if (faction === Faction.DUNGEON) return BuildingType.UNIQUE_3;
  if (faction === Faction.CONFLUX) return BuildingType.UNIQUE_3;
  return null;
}

async function resolveDiplomacyOnMonster(params: {
  supabase: SupabaseAdminClient;
  gameId: string;
  gamePlayerId: string;
  playerFaction?: string;
  playerGold: number;
  heroId: string;
  monsterId: string;
  neutralArmies: Array<{ id: string; status: string; stacks?: Array<{ unitType: UnitType; count: number }> }>;
  killedSet: Set<string>;
  mapState: Record<string, unknown>;
}): Promise<{ outcome: "flee" | "join"; joinedCount?: number; goldCost?: number; remainder?: number } | null> {
  void params.gameId;
  void params.mapState;
  const army = params.neutralArmies.find((a) => a.id === params.monsterId);
  if (!army || army.status !== "ACTIVE" || !army.stacks?.length) return null;

  const { data: heroRow } = await params.supabase
    .from("heroes")
    .select("attack,defense,morale,luck,skills,armies(*)")
    .eq("id", params.heroId)
    .maybeSingle();
  if (!heroRow) return null;

  const heroArmies = (((heroRow as { armies?: unknown[] }).armies ?? []) as Array<{
    id: string;
    unit_type: UnitType;
    count: number;
    health: number;
    max_health: number;
    position: number;
  }>).map((stack) => ({
    id: stack.id,
    unitType: stack.unit_type,
    count: Number(stack.count ?? 0),
    health: Number(stack.health ?? 0),
    maxHealth: Number(stack.max_health ?? getUnitRule(stack.unit_type).health),
    position: Number(stack.position ?? 0),
  }));
  const diplomacyLevel = getDiplomacyLevel((heroRow?.skills as Record<string, string> | null)?.diplomacy);
  const neutralStacks = army.stacks.map((stack, position) => {
    const rule = getUnitRule(stack.unitType);
    const count = Math.max(0, Number(stack.count ?? 0));
    return {
      id: `${army.id}:${position}`,
      unitType: stack.unitType,
      count,
      health: rule.health * count,
      maxHealth: rule.health,
      position,
    };
  });

  const heroPower = calculateArmyPower({
    id: params.heroId,
    attack: Number((heroRow as { attack?: number }).attack ?? 1),
    defense: Number((heroRow as { defense?: number }).defense ?? 1),
    morale: Number((heroRow as { morale?: number }).morale ?? 0),
    luck: Number((heroRow as { luck?: number }).luck ?? 0),
    armies: heroArmies,
  });
  const neutralPower = calculateArmyPower({ id: army.id, attack: 1, defense: 1, morale: 0, armies: neutralStacks });
  const mood = getNeutralArmyMood(params.monsterId);
  const alignment = getNeutralAlignmentModifier(params.playerFaction, neutralStacks);
  const strengthRatio = heroPower / Math.max(1, neutralPower);
  const moodBonus = NEUTRAL_MOOD_PROFILES[mood].joinModifier;
  const joinThreshold = Math.max(1.12, 2.2 - diplomacyLevel * 0.28 - moodBonus - alignment);
  const fleeThreshold = Math.max(1.35, 2.65 - moodBonus * 0.55 - alignment * 0.35);

  if (diplomacyLevel > 0 && strengthRatio >= joinThreshold) {
    const goldCost = getDiplomacyGoldCost(neutralStacks, diplomacyLevel, mood, alignment);
    if (params.playerGold < goldCost) {
      if (strengthRatio >= fleeThreshold) return markNeutralArmyAsFled(params);
      return null;
    }

    let nextArmies = sortedStacks(heroArmies);
    let joinedCount = 0;
    let remainder = 0;
    for (const stack of neutralStacks) {
      const rule = getUnitRule(stack.unitType);
      const result = addUnitsToStacks(nextArmies, stack.unitType, stack.count, rule.health, () => randomUUID());
      nextArmies = result.stacks;
      joinedCount += result.added;
      remainder += result.remainder;
    }
    if (joinedCount <= 0) return null;
    await persistHeroArmyDiff(params.supabase, params.heroId, sortedStacks(heroArmies), nextArmies);
    if (goldCost > 0) {
      await params.supabase.from("game_players").update({ gold: params.playerGold - goldCost }).eq("id", params.gamePlayerId);
    }
    await params.supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", army.id);
    params.killedSet.add(params.monsterId);
    return { outcome: "join", joinedCount, goldCost, remainder };
  }

  if (strengthRatio >= fleeThreshold) return markNeutralArmyAsFled(params);
  return null;
}

async function markNeutralArmyAsFled(params: {
  supabase: SupabaseAdminClient;
  monsterId: string;
  killedSet: Set<string>;
  neutralArmies: Array<{ id: string; status: string }>;
}): Promise<{ outcome: "flee" }> {
  const army = params.neutralArmies.find((a) => a.id === params.monsterId);
  if (army) await params.supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", army.id);
  params.killedSet.add(params.monsterId);
  return { outcome: "flee" };
}

const NEUTRAL_MOOD_ORDER = ["savage", "hostile", "neutral", "friendly", "compliant"] as const;
type NeutralArmyMood = (typeof NEUTRAL_MOOD_ORDER)[number];

const NEUTRAL_MOOD_PROFILES: Record<NeutralArmyMood, { joinModifier: number; costModifier: number }> = {
  savage: { joinModifier: -0.45, costModifier: 1.35 },
  hostile: { joinModifier: -0.2, costModifier: 1.15 },
  neutral: { joinModifier: 0, costModifier: 1 },
  friendly: { joinModifier: 0.35, costModifier: 0.85 },
  compliant: { joinModifier: 0.65, costModifier: 0.65 },
};

function getDiplomacyLevel(level: string | undefined) {
  if (level === "expert") return 3;
  if (level === "advanced") return 2;
  if (level === "basic") return 1;
  return 0;
}

function getNeutralArmyMood(monsterId: string): NeutralArmyMood {
  return NEUTRAL_MOOD_ORDER[Math.abs(hashString(monsterId)) % NEUTRAL_MOOD_ORDER.length];
}

function getNeutralAlignmentModifier(playerFaction: string | undefined, stacks: MinimalArmy[]) {
  if (!playerFaction) return 0;
  const dominant = [...stacks].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return 0;
  const group = getCreature(dominant.unitType).group;
  if (group === "neutral") return 0.08;
  if (group === playerFaction) return 0.35;
  if ((playerFaction === Faction.NECROPOLIS && group !== "necropolis") || (group === "necropolis" && playerFaction !== Faction.NECROPOLIS)) return -0.3;
  return 0;
}

function getDiplomacyGoldCost(stacks: MinimalArmy[], diplomacyLevel: number, mood: NeutralArmyMood, alignment: number) {
  const value = stacks.reduce((total, stack) => total + getUnitRule(stack.unitType).power * stack.count, 0);
  const diplomacyModifier = diplomacyLevel === 3 ? 0.35 : diplomacyLevel === 2 ? 0.55 : 0.75;
  const alignmentModifier = alignment > 0 ? 0.9 : alignment < 0 ? 1.15 : 1;
  return Math.max(0, Math.ceil(value * diplomacyModifier * NEUTRAL_MOOD_PROFILES[mood].costModifier * alignmentModifier));
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

async function applyOwnTownVisitBonuses({
  supabase,
  gameId,
  mapState,
  hero,
  town,
  playerFaction,
  turnNumber,
}: {
  supabase: SupabaseAdminClient;
  gameId: string;
  mapState: Record<string, unknown>;
  hero: MinimalHero;
  town: MinimalTown;
  playerFaction: Faction;
  turnNumber: number;
}) {
  const buildings = (town.buildings ?? []) as string[];
  if (buildings.length === 0) return;
  const townFaction = ((town.townType ?? playerFaction) as Faction);
  const rules = getFactionBuildingRules(townFaction);

  const heroTownVisits = (mapState.heroTownVisits as Record<string, string[]> | undefined) ?? {};
  const weeklyHeroTownVisits = (mapState.weeklyHeroTownVisits as Record<string, string> | undefined) ?? {};
  const visitedKey = (b: string) => `${town.id}:${b}`;
  const heroVisited = new Set<string>(heroTownVisits[hero.id] ?? []);
  const weekKey = getAdventureWeekKey(turnNumber);

  const heroPatch: Record<string, unknown> = {};
  let attack = Number(hero.attack ?? 0);
  let defense = Number(hero.defense ?? 0);
  let spellPower = Number(hero.spellPower ?? 0);
  let knowledge = Number(hero.knowledge ?? 0);
  let luck = Number(hero.luck ?? 0);
  let movement = Number(hero.movement ?? 0);
  let mana = hero.mana ?? null;
  let manaTouched = false;
  let mutated = false;
  const nextHeroVisited = new Set(heroVisited);
  const nextWeeklyVisits = { ...weeklyHeroTownVisits };

  for (const building of buildings) {
    const rule = rules.find((r) => r.type === building);
    if (!rule) continue;

    if (rule.permanentVisitBonus && !heroVisited.has(visitedKey(building))) {
      const bonus = rule.permanentVisitBonus;
      if (bonus.attack) attack += bonus.attack;
      if (bonus.defense) defense += bonus.defense;
      if (bonus.spellPower) spellPower += bonus.spellPower;
      if (bonus.knowledge) knowledge += bonus.knowledge;
      nextHeroVisited.add(visitedKey(building));
      mutated = true;
    }

    if (rule.weeklyVisitBonus) {
      const visitKey = `${hero.id}:${town.id}:${building}`;
      if (nextWeeklyVisits[visitKey] !== weekKey) {
        const bonus = rule.weeklyVisitBonus;
        if (bonus.movement) movement += bonus.movement;
        if (bonus.luck) luck += bonus.luck;
        if (bonus.fullMana || bonus.doubleMana) {
          const effective = getEffectiveHeroStatsFromValues(hero);
          const maxMana = getHeroMana({ mana: null, knowledge: effective.knowledge });
          const currentMana = getHeroMana({ mana: hero.mana ?? null, knowledge: effective.knowledge });
          mana = bonus.doubleMana ? Math.min(maxMana * 2, currentMana * 2) : maxMana;
          manaTouched = true;
        }
        nextWeeklyVisits[visitKey] = weekKey;
        mutated = true;
      }
    }
  }

  // Apprentissage de sorts depuis la guilde des mages (limité par Wisdom)
  if (buildings.includes(BuildingType.MAGE_GUILD) && hero.hasSpellBook !== false) {
    const townSpellLibraries = (mapState.townSpellLibraries as Record<string, string[]> | undefined) ?? {};
    const library = townSpellLibraries[town.id] ?? [];
    if (library.length > 0) {
      const wisdomLvl = (() => {
        const skills = (hero as unknown as { skills?: Record<string, string> }).skills;
        const v = skills?.wisdom;
        return v === "expert" ? 3 : v === "advanced" ? 2 : v === "basic" ? 1 : 0;
      })();
      const maxSpellLevel = 2 + wisdomLvl; // 2 / 3 / 4 / 5
      const known = new Set(hero.knownSpellIds ?? []);
      const newlyLearned = library
        .filter((s) => !known.has(s))
        .filter((spellId) => {
          const spell = SPELLS.find((sp) => sp.id === spellId);
          return spell ? (spell.level ?? 1) <= maxSpellLevel : false;
        });
      if (newlyLearned.length > 0) {
        heroPatch.has_spell_book = true;
        heroPatch.known_spells = [...(hero.knownSpellIds ?? []), ...newlyLearned];
        mutated = true;
      }
    }
  }

  if (!mutated) return;

  if (attack !== Number(hero.attack ?? 0)) heroPatch.attack = attack;
  if (defense !== Number(hero.defense ?? 0)) heroPatch.defense = defense;
  if (spellPower !== Number(hero.spellPower ?? 0)) heroPatch.spell_power = spellPower;
  if (knowledge !== Number(hero.knowledge ?? 0)) heroPatch.knowledge = knowledge;
  if (luck !== Number(hero.luck ?? 0)) heroPatch.luck = luck;
  if (movement !== Number(hero.movement ?? 0)) heroPatch.movement = movement;
  if (manaTouched) heroPatch.mana = mana;

  if (Object.keys(heroPatch).length > 0) {
    await supabase.from("heroes").update(heroPatch).eq("id", hero.id);
  }
  await supabase.from("games").update({
    map_state: {
      ...mapState,
      heroTownVisits: { ...heroTownVisits, [hero.id]: Array.from(nextHeroVisited) },
      weeklyHeroTownVisits: nextWeeklyVisits,
    },
  }).eq("id", gameId);
}

async function findTownForCapture(
  supabase: SupabaseAdminClient,
  gameId: string,
  townId: string,
  positions: Array<Position | null>
): Promise<CaptureTownRow | null> {
  const selectFields = "id,game_player_id,x,y,level,town_type,buildings,neutral_garrison,is_neutral";

  if (isUuid(townId)) {
    const { data } = await supabase
      .from("towns")
      .select(selectFields)
      .eq("game_id", gameId)
      .eq("id", townId)
      .maybeSingle();
    if (data) return data as CaptureTownRow;
  }

  const seen = new Set<string>();
  for (const position of positions) {
    if (!position) continue;
    const key = `${position.x},${position.y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { data } = await supabase
      .from("towns")
      .select(selectFields)
      .eq("game_id", gameId)
      .eq("x", position.x)
      .eq("y", position.y)
      .maybeSingle();
    if (data) return data as CaptureTownRow;
  }

  return null;
}

async function createNeutralTownForMapTile(
  supabase: SupabaseAdminClient,
  gameId: string,
  mapData: GameMap,
  tile: GameMap["tiles"][number][number]
): Promise<CaptureTownRow | null> {
  if (tile.object?.type !== "town") return null;

  const seed = `${mapData.seed ?? gameId}:${tile.object.id}:${tile.x}:${tile.y}`;
  const terrain = tile.zoneId !== undefined
    ? mapData.zones?.[tile.zoneId]?.baseTerrain ?? tile.terrain
    : tile.terrain;
  const townType = isFaction(tile.object.subtype)
    ? tile.object.subtype
    : pickTownFactionForTerrain(terrain, seed);
  const name = tile.object.name ?? pickTownName(townType, seed);

  const { data, error } = await supabase
    .from("towns")
    .insert({
      game_id: gameId,
      game_player_id: null,
      name,
      town_type: townType,
      x: tile.x,
      y: tile.y,
      buildings: [BuildingType.VILLAGE_HALL],
      garrison: [],
      is_neutral: true,
      neutral_garrison: createNeutralTownGarrison(townType),
    })
    .select("id,game_player_id,x,y,level,town_type,buildings,neutral_garrison,is_neutral")
    .maybeSingle();

  if (!error && data) return data as CaptureTownRow;

  const { data: existing } = await supabase
    .from("towns")
    .select("id,game_player_id,x,y,level,town_type,buildings,neutral_garrison,is_neutral")
    .eq("game_id", gameId)
    .eq("x", tile.x)
    .eq("y", tile.y)
    .maybeSingle();

  return (existing as CaptureTownRow | null) ?? null;
}

async function ensureNeutralTownGarrison(
  supabase: SupabaseAdminClient,
  town: CaptureTownRow
): Promise<CaptureTownRow> {
  const townType = isFaction(town.town_type) ? town.town_type : Faction.CASTLE;
  const neutralGarrison = createNeutralTownGarrison(townType);

  const { data } = await supabase
    .from("towns")
    .update({ neutral_garrison: neutralGarrison })
    .eq("id", town.id)
    .eq("is_neutral", true)
    .select("id,game_player_id,x,y,level,town_type,buildings,neutral_garrison,is_neutral")
    .maybeSingle();

  return (data as CaptureTownRow | null) ?? { ...town, neutral_garrison: neutralGarrison };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getActionPosition(value: unknown): Position | null {
  if (!value || typeof value !== "object") return null;
  const position = value as { x?: unknown; y?: unknown };
  const x = Number(position.x);
  const y = Number(position.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function getActionPathDestination(path: unknown): Position | null {
  if (!Array.isArray(path) || path.length === 0) return null;
  const destination = path[path.length - 1] as { x?: unknown; y?: unknown };
  const x = Number(destination?.x);
  const y = Number(destination?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

async function updatePlayerResources(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
  resources: Partial<Resources>,
) {
  const { error } = await supabase.from("game_players").update(resources).eq("id", playerId);
  if (!error) return;
  throw error;
}

async function applyAdventureSpell({
  supabase,
  gamePlayer,
  players,
  boats,
  hero,
  spellId,
  target,
  mapData,
  explored,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  gamePlayer: MinimalPlayer;
  players: Array<{ id: string; isAlive?: boolean; heroes?: MinimalHero[]; towns?: MinimalTown[] }>;
  boats: MinimalBoat[];
  hero: MinimalHero;
  spellId: string;
  target: unknown;
  mapData: GameMap;
  mapState: Record<string, unknown>;
  explored: Set<string>;
}): Promise<{ ok: true; interaction: { type: "ADVENTURE_SPELL"; spellId: string; message: string; destination?: Position; revealedTiles?: Position[]; revealHints?: Array<Position & { kind: string; subtype?: string }>; revealedScores?: Array<{ playerId: string; breakdown: ScoreBreakdown }> } } | { ok: false; error: string }> {
  const heroPosition = { x: hero.x, y: hero.y };

  if (spellId === "view_air" || spellId === "view_earth") {
    const radius = spellId === "view_air" ? 14 : 12;
    const visibleArea = computeVisibleTiles(mapData, [heroPosition], radius);
    const revealHints = getAdventureSpellRevealTargets(mapData, visibleArea, spellId, players, hero.id);
    const revealedTiles = revealHints.map(({ x, y }) => ({ x, y }));
    return {
      ok: true,
      interaction: {
        type: "ADVENTURE_SPELL",
        spellId,
        message: spellId === "view_air"
          ? `Vue de l'air : ${revealedTiles.length} position(s) notable(s) detectee(s).`
          : `Vue de la terre : ${revealedTiles.length} ressource(s) ou mine(s) detectee(s).`,
        revealedTiles,
        revealHints,
      },
    };
  }

  if (spellId === "visions") {
    const VISIONS_RADIUS = 6;
    const within = (x: number, y: number) =>
      Math.max(Math.abs(x - hero.x), Math.abs(y - hero.y)) <= VISIONS_RADIUS;
    const nearbyObjects = mapData.tiles
      .flatMap((row) => row)
      .filter((tile) => within(tile.x, tile.y) && (
        tile.object?.type === "monster" ||
        tile.object?.type === "hero" ||
        tile.object?.type === "gate" ||
        tile.object?.type === "town"
      ));
    // Reveal the full score breakdown of each rival whose hero or town sits within
    // range, computed from authoritative (un-sanitized) server data. The client
    // gates it to the current turn only — fog of war re-hides it next turn.
    const revealedScores: Array<{ playerId: string; breakdown: ScoreBreakdown }> = [];
    for (const player of players) {
      if (player.id === gamePlayer.id || player.isAlive === false) continue;
      const seen =
        (player.heroes ?? []).some((other) => within(other.x, other.y)) ||
        (player.towns ?? []).some((town) => within(town.x, town.y));
      if (!seen) continue;
      revealedScores.push({
        playerId: player.id,
        breakdown: computePlayerScore(scorableFromDbPlayer(player as unknown as DbScorablePlayer)),
      });
    }
    return {
      ok: true,
      interaction: {
        type: "ADVENTURE_SPELL",
        spellId,
        message: revealedScores.length > 0
          ? `Visions : ${nearbyObjects.length} presence(s) notable(s) ; score de ${revealedScores.length} rival(aux) devoile.`
          : `Visions : ${nearbyObjects.length} presence(s) notable(s) detectee(s).`,
        ...(revealedScores.length > 0 ? { revealedScores } : {}),
      },
    };
  }

  if (spellId === "dimension_door") {
    if (boats.some((boat) => boat.heroId === hero.id)) return { ok: false, error: "Debarquez avant de lancer ce sort" };
    const destination = getActionPosition(target);
    if (!destination) return { ok: false, error: "Destination invalide" };
    if (!explored.has(`${destination.x},${destination.y}`)) return { ok: false, error: "La destination doit être visible" };
    const tile = mapData.tiles[destination.y]?.[destination.x];
    if (!tile || !isTileTraversable(tile)) return { ok: false, error: "Destination infranchissable" };
    if (isOccupiedByHero(gamePlayer.heroes, hero.id, destination)) return { ok: false, error: "Destination occupee" };

    await supabase.from("heroes").update({ x: destination.x, y: destination.y }).eq("id", hero.id);
    for (const key of computeVisibleTiles(mapData, [destination], 5)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: "Porte dimensionnelle : teleportation effectuee.", destination },
    };
  }

  if (spellId === "town_portal") {
    if (boats.some((boat) => boat.heroId === hero.id)) return { ok: false, error: "Debarquez avant de lancer ce sort" };
    const townId = typeof target === "object" && target !== null ? String((target as { townId?: unknown }).townId ?? "") : "";
    const town = (townId ? gamePlayer.towns.find((item) => item.id === townId) : gamePlayer.towns[0]) ?? null;
    if (!town) return { ok: false, error: "Aucune ville alliee disponible" };
    const destination = findTownPortalLanding(mapData, { x: town.x, y: town.y }, gamePlayer.heroes, hero.id);
    if (!destination) return { ok: false, error: "La ville cible est bloquée" };

    await supabase.from("heroes").update({ x: destination.x, y: destination.y }).eq("id", hero.id);
    for (const key of computeVisibleTiles(mapData, [destination], 5)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: `Portail de ville : arrivee a ${town.id}.`, destination },
    };
  }

  if (spellId === "summon_boat") {
    if (normalizeMapLevel(hero.mapLevel) !== SURFACE_LEVEL) return { ok: false, error: "Impossible d'invoquer un bateau dans le souterrain" };
    if (boats.some((boat) => boat.heroId === hero.id)) return { ok: false, error: "Ce héros est déjà embarqué" };
    const landing = findFreeAdjacentWaterTile(mapData, heroPosition, boats);
    if (!landing) return { ok: false, error: "Aucune eau adjacente libre" };
    const boat = findNearestEmptyBoat(boats, heroPosition);
    if (!boat) return { ok: false, error: "Aucun bateau disponible" };
    await supabase.from("boats").update({
      x: landing.x,
      y: landing.y,
      owner_player_id: gamePlayer.id,
      map_level: SURFACE_LEVEL,
    }).eq("id", boat.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: "Invocation de bateau : un bateau approche de la rive.", destination: landing },
    };
  }

  if (spellId === "scuttle_boat") {
    if (normalizeMapLevel(hero.mapLevel) !== SURFACE_LEVEL) return { ok: false, error: "Impossible de saborder un bateau dans le souterrain" };
    const targetPosition = getActionPosition(target);
    const boat = targetPosition
      ? boats.find((item) => !item.heroId && normalizeMapLevel(item.mapLevel) === SURFACE_LEVEL && item.x === targetPosition.x && item.y === targetPosition.y)
      : boats.find((item) => !item.heroId && normalizeMapLevel(item.mapLevel) === SURFACE_LEVEL && areAdjacentOrSame(heroPosition, { x: item.x, y: item.y }));
    if (!boat) return { ok: false, error: "Aucun bateau vide à saborder" };
    if (!areAdjacentOrSame(heroPosition, { x: boat.x, y: boat.y })) return { ok: false, error: "Le bateau est trop eloigne" };
    await supabase.from("boats").delete().eq("id", boat.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: "Sabordage : le bateau sombre.", destination: { x: boat.x, y: boat.y } },
    };
  }

  if (spellId === "fly" || spellId === "water_walk" || spellId === "disguise") {
    const existing = ((hero as unknown as { activeSpellEffects?: HeroAdventureSpellEffect[] | null }).activeSpellEffects) ?? [];
    const nextEffects = [...existing.filter((effect) => effect.spellId !== spellId), { spellId }];
    await supabase.from("heroes").update({ active_spell_effects: nextEffects }).eq("id", hero.id);
    const message = spellId === "fly"
      ? "Vol : le héros survole l'eau et les obstacles jusqu'à son prochain tour."
      : spellId === "water_walk"
        ? "Marche sur l'eau : le héros peut traverser l'eau jusqu'à son prochain tour."
        : "Déguisement : l'armée du héros est masquée aux adversaires jusqu'à son prochain tour.";
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message },
    };
  }

  return { ok: false, error: "Sort indisponible" };
}

function getAdventureSpellRevealTargets(
  mapData: GameMap,
  visibleArea: Set<string>,
  spellId: string,
  players: Array<{ id: string; isAlive?: boolean; heroes?: MinimalHero[] }> = [],
  casterHeroId?: string
) {
  const targets: Array<Position & { kind: string; subtype?: string }> = [];
  const targetKeys = new Set<string>();
  const addTarget = (target: Position & { kind: string; subtype?: string }) => {
    const key = `${target.x},${target.y}:${target.kind}:${target.subtype ?? ""}`;
    if (targetKeys.has(key)) return;
    targetKeys.add(key);
    targets.push(target);
  };

  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (!visibleArea.has(`${tile.x},${tile.y}`)) continue;
      const object = tile.object;
      if (!object) continue;
      if (spellId === "view_earth" && (object.type === "resource" || object.type === "building")) {
        addTarget({ x: tile.x, y: tile.y, kind: object.type, subtype: object.subtype });
      }
      if (spellId === "view_air" && (object.type === "artifact" || object.type === "hero" || object.type === "town")) {
        addTarget({ x: tile.x, y: tile.y, kind: object.type, subtype: object.subtype });
      }
    }
  }

  if (spellId === "view_air") {
    for (const player of players) {
      if (player.isAlive === false) continue;
      for (const targetHero of player.heroes ?? []) {
        if (targetHero.id === casterHeroId) continue;
        if (!visibleArea.has(`${targetHero.x},${targetHero.y}`)) continue;
        addTarget({ x: targetHero.x, y: targetHero.y, kind: "hero" });
      }
    }
  }

  return targets;
}

function isOccupiedByHero(heroes: MinimalHero[], movingHeroId: string, destination: Position) {
  return heroes.some((item) => item.id !== movingHeroId && item.x === destination.x && item.y === destination.y);
}

function findTownPortalLanding(mapData: GameMap, townPosition: Position, heroes: MinimalHero[], movingHeroId: string) {
  const candidates = [
    townPosition,
    { x: townPosition.x + 1, y: townPosition.y },
    { x: townPosition.x - 1, y: townPosition.y },
    { x: townPosition.x, y: townPosition.y + 1 },
    { x: townPosition.x, y: townPosition.y - 1 },
    { x: townPosition.x + 1, y: townPosition.y + 1 },
    { x: townPosition.x - 1, y: townPosition.y - 1 },
  ];
  return candidates.find((position) => {
    const tile = mapData.tiles[position.y]?.[position.x];
    return tile && isTileTraversable(tile) && !isOccupiedByHero(heroes, movingHeroId, position);
  }) ?? null;
}

function getCreatureBankStateMap(mapState: Record<string, unknown>) {
  return ((mapState.creatureBanks as Record<string, unknown> | undefined) ?? {}) as Record<string, {
    defeated?: boolean;
    claimed?: boolean;
    pendingReward?: PendingCreatureBankReward | null;
  }>;
}

function getDefeatedCreatureBanks(mapState: Record<string, unknown>): Set<string> {
  return new Set(
    Object.entries(getCreatureBankStateMap(mapState))
      .filter(([, state]) => state.defeated || state.claimed)
      .map(([bankId]) => bankId)
  );
}

function isMissingSpellSchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("mana") || text.includes("has_spell_book") || text.includes("known_spells") || text.includes("morale") || text.includes("luck") || text.includes("artifacts") || text.includes("schema cache");
}

function normalizeCreatureRewardSelection(
  value: unknown,
  available: Array<{ unitType: UnitType; count: number }>,
): Partial<Record<UnitType, number>> {
  const requested = (value as Record<string, unknown> | undefined) ?? {};
  const out: Partial<Record<UnitType, number>> = {};
  for (const entry of available) {
    const raw = requested[entry.unitType];
    const count = raw === undefined
      ? entry.count
      : Math.min(entry.count, Math.max(0, Math.floor(Number(raw) || 0)));
    if (count > 0) out[entry.unitType] = count;
  }
  return out;
}

function findFirstMoveStop({
  path,
  map,
  movingHeroId,
  movingPlayerId,
  players,
  gates,
  collected,
  killed,
  visitedAdventureBuildings,
  defeatedCreatureBanks,
}: {
  path: Position[];
  map: GameMap;
  movingHeroId: string;
  movingPlayerId: string;
  players: Array<{
    id: string;
    resourceBuildings: MinimalBuilding[];
    towns?: MinimalTown[];
    heroes?: MinimalHero[];
  }>;
  gates: MinimalGate[];
  collected: Set<string>;
  killed: Set<string>;
  visitedAdventureBuildings: Set<string>;
  defeatedCreatureBanks: Set<string>;
}): { pathIndex: number; stopBefore?: boolean; object?: MapObject; hero?: MinimalHero & { playerId: string }; targetPosition?: Position } | null {
  for (let i = 1; i < path.length; i++) {
    const position = path[i];
    const hero = players
      .flatMap((player) => (player.heroes ?? []).map((item) => ({ ...item, playerId: player.id })))
      .find((item) => item.id !== movingHeroId && item.x === position.x && item.y === position.y);
    if (hero) return { pathIndex: i, stopBefore: true, hero, targetPosition: position };

    const object = map.tiles[position.y]?.[position.x]?.object;
    if (!object) continue;
    if (object.type === "resource" && collected.has(object.id)) continue;
    if (object.type === "artifact" && collected.has(object.id)) continue;
    if (object.type === "monster" && killed.has(object.id)) continue;
    if (object.type === "adventure_building" && object.subtype === AdventureBuildingType.CAMPFIRE && visitedAdventureBuildings.has(object.id)) continue;
    if (object.type === "adventure_building" && isCreatureBankType(object.subtype)) {
      if (defeatedCreatureBanks.has(object.id)) continue;
      return { pathIndex: i, stopBefore: true, object, targetPosition: position };
    }
    if (object.type === "wall") continue;
    if (object.type === "monster") return { pathIndex: i, stopBefore: true, object, targetPosition: position };
    if (object.type === "artifact") return { pathIndex: i, stopBefore: true, object, targetPosition: position };
    if (object.type === "town") {
      const owner = findTownOwner(players, object, position);
      if (owner?.id === movingPlayerId) continue;
      return { pathIndex: i, object };
    }
    if (object.type === "building") {
      const owner = findResourceBuildingOwner(players, object, position);
      if (owner?.id === movingPlayerId) continue;
      if (Number(object.guardianPower ?? 0) > 0) {
        return { pathIndex: i, stopBefore: true, object, targetPosition: position };
      }
      return { pathIndex: i, object };
    }
    if (object.type === "gate") {
      const gate = findGate(gates, object.id, position);
      if (gate?.gamePlayerId === movingPlayerId) continue;
      if ((gate?.garrison ?? []).some((unit) => unit.count > 0)) {
        return { pathIndex: i, stopBefore: true, object, targetPosition: position };
      }
      return { pathIndex: i, object, targetPosition: position };
    }
    return { pathIndex: i, object };
  }

  return null;
}

function findTownOwner(
  players: Array<{ id: string; towns?: MinimalTown[] }>,
  object: MapObject,
  position: Position
) {
  return players.find((player) =>
    (player.towns ?? []).some((town) =>
      town.id === object.id || (town.x === position.x && town.y === position.y)
    )
  );
}

function findResourceBuildingOwner(
  players: Array<{ id: string; resourceBuildings: MinimalBuilding[] }>,
  object: MapObject,
  position: Position
) {
  return players.find((player) =>
    player.resourceBuildings.some((building) =>
      building.id === object.id || (building.x === position.x && building.y === position.y)
    )
  );
}

function addArtifactToBag(value: unknown, artifactId: string) {
  const bag = normalizeArtifactBag(value);
  return { ...bag, inventory: [...bag.inventory, artifactId] };
}

function equipHeroArtifact(hero: MinimalHero, artifactId: string, requestedSlot: unknown):
  | { ok: true; artifacts: ReturnType<typeof normalizeArtifactBag> }
  | { ok: false; error: string } {
  const artifact = getArtifact(artifactId);
  if (!artifact) return { ok: false, error: "Artefact inconnu" };
  const bag = normalizeArtifactBag(hero.artifacts);
  if (!bag.inventory.includes(artifactId)) return { ok: false, error: "Artefact absent de l'inventaire" };
  const slot = normalizeArtifactSlot(requestedSlot) ?? artifact.slots.find((candidate) => !bag.equipment[candidate]) ?? artifact.slots[0];
  if (!slot || !artifact.slots.includes(slot)) return { ok: false, error: "Emplacement invalide" };

  const inventory = bag.inventory.filter((id, index) => id !== artifactId || index !== bag.inventory.indexOf(artifactId));
  const replaced = bag.equipment[slot];
  return {
    ok: true,
    artifacts: {
      inventory: replaced ? [...inventory, replaced] : inventory,
      equipment: { ...bag.equipment, [slot]: artifactId },
    },
  };
}

function unequipHeroArtifact(hero: MinimalHero, rawSlot: unknown):
  | { ok: true; artifacts: ReturnType<typeof normalizeArtifactBag> }
  | { ok: false; error: string } {
  const slot = normalizeArtifactSlot(rawSlot);
  if (!slot) return { ok: false, error: "Emplacement invalide" };
  const bag = normalizeArtifactBag(hero.artifacts);
  const artifactId = bag.equipment[slot];
  if (!artifactId) return { ok: false, error: "Aucun artefact équipé" };
  const equipment = { ...bag.equipment };
  delete equipment[slot];
  return { ok: true, artifacts: { inventory: [...bag.inventory, artifactId], equipment } };
}

function transferHeroArtifact(fromHero: MinimalHero, toHero: MinimalHero, artifactId: string):
  | { ok: true; fromArtifacts: ReturnType<typeof normalizeArtifactBag>; toArtifacts: ReturnType<typeof normalizeArtifactBag> }
  | { ok: false; error: string } {
  if (!getArtifact(artifactId)) return { ok: false, error: "Artefact inconnu" };
  const fromBag = normalizeArtifactBag(fromHero.artifacts);
  const toBag = normalizeArtifactBag(toHero.artifacts);
  const inventoryIndex = fromBag.inventory.indexOf(artifactId);
  let fromArtifacts = fromBag;
  if (inventoryIndex >= 0) {
    fromArtifacts = {
      ...fromBag,
      inventory: fromBag.inventory.filter((_, index) => index !== inventoryIndex),
    };
  } else {
    const slot = ARTIFACT_SLOTS.find((candidate) => fromBag.equipment[candidate] === artifactId);
    if (!slot) return { ok: false, error: "Artefact absent du héros source" };
    const equipment = { ...fromBag.equipment };
    delete equipment[slot];
    fromArtifacts = { ...fromBag, equipment };
  }
  return { ok: true, fromArtifacts, toArtifacts: { ...toBag, inventory: [...toBag.inventory, artifactId] } };
}

function normalizeArtifactSlot(value: unknown): ArtifactSlot | null {
  return typeof value === "string" && ARTIFACT_SLOTS.includes(value as ArtifactSlot) ? value as ArtifactSlot : null;
}

function canTransferArtifactsBetweenHeroes(fromHero: MinimalHero, toHero: MinimalHero, towns: MinimalTown[]) {
  const adjacent = Math.max(Math.abs(fromHero.x - toHero.x), Math.abs(fromHero.y - toHero.y)) <= 1;
  if (adjacent) return true;
  return towns.some((town) => town.x === fromHero.x && town.y === fromHero.y && town.x === toHero.x && town.y === toHero.y);
}

async function validateAndApplyArtifactApproach({
  supabase,
  mapData,
  gamePlayer,
  hero,
  path,
  target,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  mapData: GameMap;
  gamePlayer: MinimalPlayer;
  hero: MinimalHero;
  path: unknown;
  target: Position;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (Math.max(Math.abs(hero.x - target.x), Math.abs(hero.y - target.y)) <= 1) return { ok: true };
  if (!Array.isArray(path) || path.length < 1) return { ok: false, error: "Le héros doit s'arrêter devant l'artefact" };
  const typedPath = path as Position[];
  const destination = typedPath[typedPath.length - 1];
  if (Math.max(Math.abs(destination.x - target.x), Math.abs(destination.y - target.y)) > 1) {
    return { ok: false, error: "Le chemin doit finir devant l'artefact" };
  }
  return validateAndApplyActionPath({ supabase, mapData, gamePlayer, hero, path, destination });
}

async function validateAndApplyActionPath({
  supabase,
  mapData,
  gamePlayer,
  hero,
  path,
  destination,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  mapData: GameMap;
  gamePlayer: MinimalPlayer;
  hero: MinimalHero;
  path: unknown;
  destination: Position;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(path) || path.length < 2) {
    if (hero.x === destination.x && hero.y === destination.y) return { ok: true };
    return { ok: false, error: "Chemin requis pour cette capture" };
  }

  const typedPath = path as Array<{ x: number; y: number }>;
  const lastPos = typedPath[typedPath.length - 1];
  if (lastPos?.x !== destination.x || lastPos?.y !== destination.y) {
    return { ok: false, error: "Le chemin ne termine pas sur la cible" };
  }

  const validation = validateMovePath(mapData, { x: hero.x, y: hero.y }, typedPath, hero.movement);
  if (!validation.ok) return validation;

  const { error: heroUpdateError } = await supabase.from("heroes").update({
    x: destination.x,
    y: destination.y,
    movement: getUsableAdventureMovement(mapData, destination, hero.movement - validation.usedMovement),
  }).eq("id", hero.id);
  if (heroUpdateError) return { ok: false, error: `Erreur mise à jour héros: ${heroUpdateError.message}` };

  const movedHeroes: MinimalHero[] = gamePlayer.heroes.map((item) =>
    item.id === hero.id ? { ...hero, x: destination.x, y: destination.y } : item
  );
  const newlyVisible = computeVisibleTiles(
    mapData,
    getPlayerVisionCenters({
      heroes: movedHeroes.map((h) => ({ position: { x: h.x, y: h.y } })),
      towns: gamePlayer.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
    }),
    5
  );
  const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
  for (const key of newlyVisible) explored.add(key);
  await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);

  return { ok: true };
}

function getPathMovementCost(map: GameMap, path: Position[], skills?: Record<string, string>, mode?: AdventureMovementMode) {
  const base = mode ? getAdventurePathCostForMode(map, path, mode) : getAdventurePathCost(map, path);
  if (!skills) return base;
  const lvl = skills.pathfinding === "expert" ? 3 : skills.pathfinding === "advanced" ? 2 : skills.pathfinding === "basic" ? 1 : 0;
  if (lvl <= 0) return base;
  // Pathfinding réduit le coût sur terrain rude (forêt, sable, neige, marais, montagne)
  // Approximation : −10% / −20% / −30% sur le total des cases hors herbe/route
  const reduction = lvl === 1 ? 0.10 : lvl === 2 ? 0.20 : 0.30;
  let roughPortion = 0;
  for (let i = 1; i < path.length; i++) {
    const t = map.tiles?.[path[i].y]?.[path[i].x];
    if (!t) continue;
    const terrain = t.terrain;
    if (terrain === "forest" || terrain === "sand" || terrain === "snow" || terrain === "swamp" || terrain === "mountain") {
      roughPortion += 1;
    }
  }
  if (path.length <= 1) return base;
  const roughRatio = roughPortion / (path.length - 1);
  return Math.max(0, Math.floor(base * (1 - reduction * roughRatio)));
}

function validateMovePath(
  map: GameMap,
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
  movement: number,
  mode?: AdventureMovementMode
): { ok: true; usedMovement: number } | { ok: false; error: string } {
  if (!Array.isArray(path) || path.length < 2) return { ok: false, error: "Chemin invalide" };
  if (path[0]?.x !== start.x || path[0]?.y !== start.y) return { ok: false, error: "Le chemin ne commence pas sur le héros" };

  let usedMovement = 0;
  for (let i = 1; i < path.length; i++) {
    const previous = path[i - 1];
    const current = path[i];
    const stepOk = mode ? canMoveAdventureStepForMode(map, previous, current, mode) : canMoveAdventureStep(map, previous, current);
    if (!stepOk) {
      return { ok: false, error: "Chemin invalide" };
    }
    const stepCost = mode ? getAdventureStepCostForMode(map, previous, current, mode) : getAdventureStepCost(map, previous, current);
    if (!Number.isFinite(stepCost)) return { ok: false, error: "Terrain infranchissable" };
    usedMovement += stepCost;
  }
  const requiredMovement = mode
    ? getRequiredAdventureMovementForMode(map, path as Position[], mode)
    : getRequiredAdventureMovement(map, path as Position[]);
  if (requiredMovement > movement) return { ok: false, error: "Deplacement insuffisant" };
  return { ok: true, usedMovement };
}
