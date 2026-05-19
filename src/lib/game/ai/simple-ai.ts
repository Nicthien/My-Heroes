import { addVisit, createCampfireReward } from "@/lib/game/adventure-buildings";
import { computeVisibleTiles, getAdventurePathCost, getPlayerVisionCenters, getUsableAdventureMovement, isTileTraversable, MINIMUM_ADVENTURE_STEP_COST } from "@/lib/game/engine";
import { makeRng } from "@/lib/game/engine/rng";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { completePlayerTurn } from "@/lib/game/server/turns";
import { AdventureBuildingType, GameMap, Position, Resources, UnitStack } from "@/lib/game/types";
import { getGameWithRelations, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { buildAiContext, getResourcePileAmount, playerResources } from "./context";
import { calculateHeroPower, calculateStacksPower, createBuildingGuardStacks, resolveAiAutoCombat } from "./combat";
import { runAiEconomy } from "./economy";
import { assignHeroRole } from "./roles";
import { chooseAiObjective } from "./utility";
import type { AiContext, AiDecision, AiGame, AiHero, AiObjective, AiPlayer } from "./types";

const AI_TURN_START_DELAY_MS = 500;
const AI_MOVE_DELAY_MS = 450;
const AI_TURN_END_DELAY_MS = 2300;
const MAX_HERO_OBJECTIVES_PER_TURN = 16;

export async function runAiTurnsUntilHuman(supabase: SupabaseAdmin, gameId: string) {
  if (!(await acquireAiRunnerLock(supabase, gameId))) return;

  try {
    const initialGame = await getGameWithRelations(supabase, gameId);
    const maxSteps = Math.max(2, Number(initialGame?.maxPlayers ?? 0) + 2);

    for (let step = 0; step < maxSteps; step++) {
      const game = await getGameWithRelations(supabase, gameId) as unknown as AiGame | null;
      if (!game || game.status !== "ACTIVE" || !game.currentTurnPlayerId) return;

      const currentPlayer = game.players.find((player) => player.id === game.currentTurnPlayerId && player.isAlive);
      if (!currentPlayer?.isAi) return;

      await sleep(AI_TURN_START_DELAY_MS);
      await runUtilityAiTurn(supabase, game, currentPlayer);
      await sleep(AI_TURN_END_DELAY_MS);
      await completePlayerTurn(supabase, game.id, Number(game.turnNumber), currentPlayer.id);
    }
  } finally {
    await supabase.from("games").update({ ai_runner_locked_at: null }).eq("id", gameId);
  }
}

async function acquireAiRunnerLock(supabase: SupabaseAdmin, gameId: string) {
  const { data: game, error: fetchError } = await supabase
    .from("games")
    .select("ai_runner_locked_at")
    .eq("id", gameId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const lockedAt = game?.ai_runner_locked_at ? Date.parse(String(game.ai_runner_locked_at)) : 0;
  if (lockedAt && Date.now() - lockedAt < 2 * 60 * 1000) return false;

  const { error } = await supabase
    .from("games")
    .update({ ai_runner_locked_at: new Date().toISOString() })
    .eq("id", gameId)
    .select("id")
    .single();

  if (error) throw error;
  return true;
}

async function runUtilityAiTurn(supabase: SupabaseAdmin, game: AiGame, player: AiPlayer) {
  await runAiEconomy(supabase, game, player);

  let freshGame = await getGameWithRelations(supabase, game.id) as unknown as AiGame | null;
  let freshPlayer = freshGame?.players.find((item) => item.id === player.id);
  if (!freshGame || !freshPlayer) return;

  const heroIds = [...(freshPlayer.heroes ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((hero) => hero.id);

  for (let heroIndex = 0; heroIndex < heroIds.length; heroIndex++) {
    for (let step = 0; step < MAX_HERO_OBJECTIVES_PER_TURN; step++) {
      freshGame = await getGameWithRelations(supabase, game.id) as unknown as AiGame | null;
      freshPlayer = freshGame?.players.find((item) => item.id === player.id);
      const hero = freshPlayer?.heroes.find((item) => item.id === heroIds[heroIndex]);
      if (!freshGame || !freshPlayer || !hero || hero.movement < MINIMUM_ADVENTURE_STEP_COST) break;
      if (isHeroInActiveCombat(freshGame, hero.id)) break;

      const context = buildAiContext(freshGame, freshPlayer);
      const role = assignHeroRole(context, hero, heroIndex);
      const score = chooseAiObjective(context, hero, role);
      if (!score) break;

      const decision: AiDecision = { heroId: hero.id, role, score };
      const result = await applyAiDecision(supabase, context, hero, decision);
      if (!result.moved || result.heroRemoved) break;
      await sleep(AI_MOVE_DELAY_MS);
    }
  }
}

async function applyAiDecision(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  decision: AiDecision,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const objective = decision.score.objective;
  const movement = await moveHeroToObjective(supabase, context, hero, objective);
  if (!movement.moved) return { moved: false };

  if (objective.type === "resource") {
    await collectResource(supabase, context, objective);
  } else if (objective.type === "adventure_building") {
    await visitAdventureBuilding(supabase, context, hero, objective);
  } else if (objective.type === "resource_building") {
    return captureOrFightResourceBuilding(supabase, context, movement.hero, objective);
  } else if (objective.type === "neutral_army") {
    return fightNeutralArmy(supabase, context, movement.hero, objective);
  } else if (objective.type === "enemy_hero") {
    return fightEnemyHero(supabase, context, movement.hero, objective);
  } else if (objective.type === "neutral_town") {
    return captureOrFightNeutralTown(supabase, context, movement.hero, objective);
  }

  return { moved: true };
}

async function moveHeroToObjective(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean; hero: AiHero }> {
  const destination = objective.path[objective.path.length - 1];
  const usedMovement = getAdventurePathCost(context.map, objective.path);
  if (!destination || objective.path.length < 1 || !Number.isFinite(usedMovement) || usedMovement > hero.movement) {
    return { moved: false, hero };
  }
  if (destination.x === hero.x && destination.y === hero.y) {
    return { moved: true, hero };
  }

  const nextMovement = getUsableAdventureMovement(context.map, destination, hero.movement - usedMovement);
  const { error } = await supabase.from("heroes").update({
    x: destination.x,
    y: destination.y,
    movement: nextMovement,
  }).eq("id", hero.id);
  if (error) throw error;

  await updateExploration(supabase, context, destination);
  return {
    moved: true,
    hero: { ...hero, x: destination.x, y: destination.y, movement: nextMovement },
  };
}

async function updateExploration(supabase: SupabaseAdmin, context: AiContext, destination: Position) {
  const explored = new Set(context.explored);
  const otherHeroes = (context.player.heroes ?? [])
    .filter((hero) => hero.x !== destination.x || hero.y !== destination.y)
    .map((hero) => ({ position: { x: hero.x, y: hero.y } }));
  const visible = computeVisibleTiles(
    context.map,
    getPlayerVisionCenters({
      heroes: [...otherHeroes, { position: destination }],
      towns: context.player.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
    }),
    5,
  );
  for (const key of visible) explored.add(key);
  await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", context.player.id);
}

async function collectResource(supabase: SupabaseAdmin, context: AiContext, objective: AiObjective) {
  const object = objective.object;
  if (!object || context.collected.has(object.id)) return;

  const resourceType = normalizeResource(object.subtype);
  const amount = getResourcePileAmount(object);
  const resources = playerResources(context.player);
  const nextResources = { ...resources, [resourceType]: Number(resources[resourceType] ?? 0) + amount };
  const nextCollected = Array.from(new Set([...context.collected, object.id]));

  await supabase.from("game_players").update({
    [resourceType]: nextResources[resourceType],
  }).eq("id", context.player.id);
  await supabase.from("games").update({
    map_state: { ...context.mapState, collected: nextCollected },
  }).eq("id", context.game.id);
}

async function visitAdventureBuilding(supabase: SupabaseAdmin, context: AiContext, hero: AiHero, objective: AiObjective) {
  const object = objective.object;
  const buildingType = object?.subtype as AdventureBuildingType | undefined;
  if (!object || !buildingType) return;

  if (buildingType === AdventureBuildingType.CAMPFIRE) {
    const reward = createCampfireReward(makeRng(`${context.game.id}:${object.id}:${context.player.id}`));
    const resources = playerResources(context.player);
    const update: Partial<Resources> = { gold: resources.gold + reward.gold };
    for (const [resource, amount] of Object.entries(reward.resources)) {
      const key = resource as keyof Resources;
      update[key] = Number(resources[key] ?? 0) + Number(amount ?? 0);
    }
    await supabase.from("game_players").update(update).eq("id", context.player.id);
    await supabase.from("games").update({
      map_state: {
        ...context.mapState,
        visitedAdventureBuildings: Array.from(new Set([...context.visitedAdventureBuildings, object.id])),
      },
    }).eq("id", context.game.id);
    return;
  }

  if (buildingType === AdventureBuildingType.OBSERVATORY) {
    const explored = new Set(context.explored);
    for (const key of computeVisibleTiles(context.map, [objective.position], 20)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", context.player.id);
  }

  if (buildingType === AdventureBuildingType.STARGATE) {
    const target = findStargateDestination(context.map, object.targetId);
    const landing = target ? findTeleportLanding(context.map, target) : null;
    if (landing) {
      await supabase.from("heroes").update({ x: landing.x, y: landing.y }).eq("id", hero.id);
      const explored = new Set(context.explored);
      for (const key of computeVisibleTiles(context.map, [landing], 5)) explored.add(key);
      await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", context.player.id);
    }
  }

  await supabase.from("games").update({
    map_state: {
      ...context.mapState,
      playerAdventureVisits: addVisit(context.playerAdventureVisits, context.player.id, object.id),
    },
  }).eq("id", context.game.id);
}

async function captureOrFightResourceBuilding(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const guardianPower = Number(objective.targetPower ?? 0);
  if (guardianPower <= 0) {
    await captureResourceBuilding(supabase, context, objective);
    return { moved: true };
  }

  const defender = {
    id: objective.id,
    attack: 1,
    defense: 1,
    armies: createBuildingGuardStacks(objective.id, guardianPower),
  };
  const result = await resolveAiAutoCombat({
    supabase,
    attacker: hero,
    defender,
    experience: 150,
    onAttackerWon: async () => captureResourceBuilding(supabase, context, objective),
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  return { moved: true, heroRemoved: !result.attackerWon };
}

async function captureResourceBuilding(supabase: SupabaseAdmin, context: AiContext, objective: AiObjective) {
  await supabase.from("resource_buildings").update({
    game_player_id: context.player.id,
    guardian_power: 0,
  }).eq("game_id", context.game.id).eq("id", objective.id);
  await supabase.from("resource_buildings").update({
    game_player_id: context.player.id,
    guardian_power: 0,
  }).eq("game_id", context.game.id).eq("x", objective.position.x).eq("y", objective.position.y);
}

async function fightNeutralArmy(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const army = (context.game.neutralArmies ?? []).find((item) =>
    item.id === objective.id ||
    (item.x === objective.position.x && item.y === objective.position.y)
  );
  const stacks = army?.stacks ?? createBuildingGuardStacks(objective.id, objective.targetPower);
  const defender = {
    id: army?.id ?? objective.id,
    attack: 1,
    defense: 1,
    armies: stacks,
  };

  const result = await resolveAiAutoCombat({
    supabase,
    attacker: hero,
    defender,
    onAttackerWon: async () => {
      if (army?.id) {
        await supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", army.id);
      }
      await supabase.from("games").update({
        map_state: {
          ...context.mapState,
          killed: Array.from(new Set([...context.killedNeutralArmies, objective.id])),
        },
      }).eq("id", context.game.id);
    },
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  return { moved: true, heroRemoved: !result.attackerWon };
}

async function fightEnemyHero(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const defenderPlayer = context.game.players.find((player) => player.id === objective.targetPlayerId);
  const defenderHero = defenderPlayer?.heroes.find((item) => item.id === objective.targetHeroId);
  if (!defenderHero) return { moved: true };

  const result = await resolveAiAutoCombat({
    supabase,
    attacker: hero,
    defender: {
      id: defenderHero.id,
      attack: defenderHero.attack,
      defense: defenderHero.defense,
      armies: defenderHero.armies,
    },
    onAttackerWon: async () => {
      await supabase.from("armies").delete().eq("hero_id", defenderHero.id);
      await supabase.from("heroes").delete().eq("id", defenderHero.id);
    },
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  return { moved: true, heroRemoved: !result.attackerWon };
}

async function captureOrFightNeutralTown(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const town = await findNeutralTown(supabase, context.game.id, objective.id, objective.position);
  if (!town) return { moved: true };

  const garrison = (town.neutral_garrison ?? []) as UnitStack[];
  if (garrison.length === 0) {
    await captureNeutralTown(supabase, town.id, context.player.id);
    return { moved: true };
  }

  const targetPower = calculateStacksPower(garrison);
  if (calculateHeroPower(hero) < targetPower * context.profile.neutralPowerRatio) return { moved: true };

  const result = await resolveAiAutoCombat({
    supabase,
    attacker: hero,
    defender: {
      id: town.id,
      attack: 1,
      defense: 1,
      armies: garrison,
    },
    experience: 250,
    onAttackerWon: async () => captureNeutralTown(supabase, town.id, context.player.id),
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  return { moved: true, heroRemoved: !result.attackerWon };
}

async function findNeutralTown(supabase: SupabaseAdmin, gameId: string, townId: string, position: Position) {
  const selectFields = "id,neutral_garrison";
  const byId = await supabase
    .from("towns")
    .select(selectFields)
    .eq("game_id", gameId)
    .eq("id", townId)
    .eq("is_neutral", true)
    .maybeSingle();
  if (byId.data) return byId.data as { id: string; neutral_garrison: UnitStack[] };

  const byPosition = await supabase
    .from("towns")
    .select(selectFields)
    .eq("game_id", gameId)
    .eq("x", position.x)
    .eq("y", position.y)
    .eq("is_neutral", true)
    .maybeSingle();
  return byPosition.data as { id: string; neutral_garrison: UnitStack[] } | null;
}

async function captureNeutralTown(supabase: SupabaseAdmin, townId: string, playerId: string) {
  await supabase.from("towns").update({
    game_player_id: playerId,
    is_neutral: false,
    neutral_garrison: [],
  }).eq("id", townId).eq("is_neutral", true);
}

function findStargateDestination(map: GameMap, targetId: string | undefined): Position | null {
  if (!targetId) return null;
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "adventure_building" && tile.object.id === targetId) {
        return { x: tile.x, y: tile.y };
      }
    }
  }
  return null;
}

function findTeleportLanding(map: GameMap, target: Position): Position | null {
  const positions = [
    target,
    { x: target.x + 1, y: target.y },
    { x: target.x - 1, y: target.y },
    { x: target.x, y: target.y + 1 },
    { x: target.x, y: target.y - 1 },
  ];

  for (const position of positions) {
    const tile = map.tiles[position.y]?.[position.x];
    if (isTileTraversable(tile)) return position;
  }
  return null;
}

function normalizeResource(resource: string | undefined): keyof Resources {
  if (
    resource === "wood" ||
    resource === "ore" ||
    resource === "mercury" ||
    resource === "crystals" ||
    resource === "gems" ||
    resource === "sulfur"
  ) {
    return resource;
  }
  return "gold";
}

function isHeroInActiveCombat(game: AiGame, heroId: string) {
  return (game.combats ?? []).some((combat) => {
    if (combat.status !== "ACTIVE") return false;
    if (combat.attackerHeroId === heroId || combat.defenderHeroId === heroId) return true;
    return (combat.participants ?? []).some((participant) => participant.heroId === heroId);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
