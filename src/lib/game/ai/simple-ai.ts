import { randomUUID } from "crypto";
import { addVisit, createCampfireReward } from "@/lib/game/adventure-buildings";
import { addUnitsToStacks, sortedStacks } from "@/lib/game/army-stacks";
import { computeVisibleTiles, getAdventurePathCost, getPlayerVisionCenters, getUsableAdventureMovement, MINIMUM_ADVENTURE_STEP_COST } from "@/lib/game/engine";
import { normalizeMapLevel, SURFACE_LEVEL, withActiveMapLayer } from "@/lib/game/map-levels";
import {
  findGateObjectOnAnyLevel,
  findTeleportLandingOnLayer,
  getSubterraneanGateTarget,
} from "@/lib/game/engine/level-transition";
import { canDisembark, canEmbark } from "@/lib/game/boats/boat-ops";
import { makeRng } from "@/lib/game/engine/rng";
import { UNIT_RULES, tierForUnit, type ResourceCost } from "@/lib/game/economy";
import { createExternalDwellingState, isExternalDwellingType, normalizeExternalDwellingState, type ExternalDwellingStateMap } from "@/lib/game/external-dwellings";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { completePlayerTurn } from "@/lib/game/server/turns";
import { recordGameAction } from "@/lib/game/server/action-log";
import { AdventureBuildingType, GameMap, MapObject, Position, Resources, UnitStack } from "@/lib/game/types";
import { SPELLS } from "@/lib/game/spells";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { getGameWithRelations, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { buildAiContext, getResourcePileAmount, playerResources } from "./context";
import { canAiWinAutoCombat, createBuildingGuardStacks, resolveAiAutoCombat } from "./combat";
import { runAiEconomy } from "./economy";
import { runAiCombatTurns } from "./combat-runner";
import { assignHeroRole } from "./roles";
import { chooseAiObjective } from "./utility";
import { saveAiMemory, updateOpponentIntel } from "./strategy/memory";
import { pickChampion } from "./strategy/champion";
import { executeArmyTransfers, pickupNearbyGarrisonForHero } from "./strategy/army-transfers";
import { selectPrimaryEnemy } from "./strategy/enemy";
import { updateMultiTurnPlans } from "./strategy/planner";
import { maybeRecruitHero } from "./strategy/recruit-hero";
import { maybeBuildBoat } from "./strategy/build-boat";
import { consumePendingSkillChoices } from "./strategy/skill-choice";
import type { AiContext, AiDecision, AiGame, AiHero, AiObjective, AiPlayer } from "./types";

const AI_TURN_START_DELAY_MS = 500;
const AI_MOVE_DELAY_MS = 450;
const AI_TURN_END_DELAY_MS = 2300;
const AI_RUNNER_LOCK_STALE_MS = 45_000;
const MAX_HERO_OBJECTIVES_PER_TURN = 16;

export async function runAiTurnsUntilHuman(supabase: SupabaseAdmin, gameId: string) {
  if (!(await acquireAiRunnerLock(supabase, gameId))) return;

  try {
    await runAiTurnsUntilHumanWithLock(supabase, gameId);
  } finally {
    await supabase.from("games").update({ ai_runner_locked_at: null }).eq("id", gameId);
  }
}

export async function resumeAiActivityUntilHuman(supabase: SupabaseAdmin, gameId: string) {
  if (!(await acquireAiRunnerLock(supabase, gameId))) return;

  try {
    await runActiveAiCombats(supabase, gameId);
    await runAiTurnsUntilHumanWithLock(supabase, gameId);
  } finally {
    await supabase.from("games").update({ ai_runner_locked_at: null }).eq("id", gameId);
  }
}

async function runAiTurnsUntilHumanWithLock(supabase: SupabaseAdmin, gameId: string) {
  const initialGame = await getGameWithRelations(supabase, gameId);
  const maxSteps = Math.max(2, Number(initialGame?.maxPlayers ?? 0) + 2);

  for (let step = 0; step < maxSteps; step++) {
    const game = await getGameWithRelations(supabase, gameId) as unknown as AiGame | null;
    if (!game || game.status !== "ACTIVE" || !game.currentTurnPlayerId) return;

    const currentPlayer = game.players.find((player) => player.id === game.currentTurnPlayerId && player.isAlive);
    if (!isRunnableAiPlayer(currentPlayer)) return;

    await sleep(AI_TURN_START_DELAY_MS);
    await runActiveAiCombats(supabase, gameId);
    const latestGame = await getGameWithRelations(supabase, gameId) as unknown as AiGame | null;
    if (!latestGame || latestGame.status !== "ACTIVE" || latestGame.currentTurnPlayerId !== currentPlayer.id) return;
    const latestPlayer = latestGame.players.find((player) => player.id === currentPlayer.id && player.isAlive);
    if (!isRunnableAiPlayer(latestPlayer)) return;

    await logAiAction(supabase, latestGame, latestPlayer, "AI_TURN_START", "turn", `${latestPlayer.aiName || "IA"} commence son tour.`);
    await runUtilityAiTurn(supabase, latestGame, latestPlayer);
    await runActiveAiCombats(supabase, gameId);
    await sleep(AI_TURN_END_DELAY_MS);
    const gameBeforeEnd = await getGameWithRelations(supabase, gameId) as unknown as AiGame | null;
    if (!gameBeforeEnd || gameBeforeEnd.status !== "ACTIVE" || gameBeforeEnd.currentTurnPlayerId !== latestPlayer.id) return;

    await completePlayerTurn(supabase, gameBeforeEnd.id, Number(gameBeforeEnd.turnNumber), latestPlayer.id);
    await logAiAction(supabase, gameBeforeEnd, latestPlayer, "END_TURN", "turn", `${latestPlayer.aiName || "IA"} termine son tour.`);
  }
}

function isRunnableAiPlayer(player: AiPlayer | undefined): player is AiPlayer {
  return Boolean(player && (player.isAi || player.aiName));
}

async function runActiveAiCombats(supabase: SupabaseAdmin, gameId: string) {
  const { data: combats, error } = await supabase
    .from("combats")
    .select("id")
    .eq("game_id", gameId)
    .eq("status", "ACTIVE");
  if (error) throw error;

  for (const combat of combats ?? []) {
    if (typeof combat.id !== "string") continue;
    await runAiCombatTurns(supabase, gameId, combat.id);
  }
}

async function acquireAiRunnerLock(supabase: SupabaseAdmin, gameId: string) {
  const staleBefore = new Date(Date.now() - AI_RUNNER_LOCK_STALE_MS).toISOString();
  const { data, error } = await supabase
    .from("games")
    .update({ ai_runner_locked_at: new Date().toISOString() })
    .eq("id", gameId)
    .or(`ai_runner_locked_at.is.null,ai_runner_locked_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function runUtilityAiTurn(supabase: SupabaseAdmin, game: AiGame, player: AiPlayer) {
  const initialContext = buildAiContext(game, player);
  const turnNumber = Number(game.turnNumber ?? 1);
  // Désigne / met à jour le champion dans la mémoire avant tout le reste.
  initialContext.memory.championHeroId = pickChampion(initialContext, initialContext.memory);
  // Choisit / met à jour l'ennemi principal.
  const nextPrimary = selectPrimaryEnemy(initialContext, initialContext.memory);
  if (nextPrimary !== initialContext.memory.primaryEnemyId) {
    initialContext.memory.primaryEnemyId = nextPrimary;
    initialContext.memory.primaryEnemyRefreshedAtTurn = turnNumber;
  }
  // Met à jour les plans multi-tours.
  initialContext.memory.multiTurnPlans = updateMultiTurnPlans(initialContext, initialContext.memory);
  // Met à jour le renseignement sur les adversaires (puissance vue, dernière apparition).
  initialContext.memory.opponentIntel = updateOpponentIntel(
    initialContext.memory.opponentIntel,
    game,
    initialContext.visibleOpponents,
    turnNumber,
  );

  await runAiEconomy(supabase, game, player, initialContext);
  await maybeBuildBoat(supabase, initialContext);
  await maybeRecruitHero(supabase, initialContext);
  await consumePendingSkillChoices(supabase, initialContext);
  // Transferts d'armée : héros secondaires adjacents au champion lui donnent leurs piles ;
  // si posture DEFEND, ils déposent en garnison d'une ville propre adjacente.
  await executeArmyTransfers(supabase, initialContext, initialContext.memory.championHeroId);

  let freshGame = await getGameWithRelations(supabase, game.id) as unknown as AiGame | null;
  let freshPlayer = freshGame?.players.find((item) => item.id === player.id);
  if (!freshGame || !freshPlayer) return;

  const heroIds = [...(freshPlayer.heroes ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((hero) => hero.id);
  if (heroIds.length === 0) {
    await logAiAction(supabase, game, player, "AI_NO_HEROES", "turn", `${player.aiName || "IA"} n'a aucun heros actif.`);
  }

  let lastContext: AiContext | null = initialContext;
  let actionCount = 0;
  let idleCount = 0;
  const championOverride = initialContext.memory.championHeroId;
  const primaryEnemyOverride = initialContext.memory.primaryEnemyId;
  const plansOverride = initialContext.memory.multiTurnPlans;
  const intelOverride = initialContext.memory.opponentIntel;
  const heroObjectives: Record<string, string> = { ...initialContext.memory.heroObjectives };
  for (let heroIndex = 0; heroIndex < heroIds.length; heroIndex++) {
    for (let step = 0; step < MAX_HERO_OBJECTIVES_PER_TURN; step++) {
      freshGame = await getGameWithRelations(supabase, game.id) as unknown as AiGame | null;
      freshPlayer = freshGame?.players.find((item) => item.id === player.id);
      const hero = freshPlayer?.heroes.find((item) => item.id === heroIds[heroIndex]);
      if (!freshGame || !freshPlayer || !hero || hero.movement < MINIMUM_ADVENTURE_STEP_COST) break;
      if (isHeroInActiveCombat(freshGame, hero.id)) break;

      const context = buildAiContext(freshGame, freshPlayer, normalizeMapLevel(hero.mapLevel));
      // Conserve les directives stratégiques durant tout le tour, même si la mémoire n'a pas encore été persistée.
      if (championOverride && (freshPlayer.heroes ?? []).some((h) => h.id === championOverride)) {
        context.memory.championHeroId = championOverride;
      }
      context.memory.primaryEnemyId = primaryEnemyOverride;
      context.memory.multiTurnPlans = plansOverride;
      context.memory.opponentIntel = intelOverride;
      context.memory.heroObjectives = heroObjectives;
      lastContext = context;
      const role = assignHeroRole(context, hero, heroIndex);
      const score = chooseAiObjective(context, hero, role);
      if (!score) {
        idleCount++;
        await logAiAction(supabase, context.game, context.player, "AI_NO_OBJECTIVE", "strategy", `${context.player.aiName || "IA"} ne trouve pas d'objectif utile.`, {
          heroId: hero.id,
          role,
          movement: hero.movement,
        });
        break;
      }

      const decision: AiDecision = { heroId: hero.id, role, score };
      const result = await applyAiDecision(supabase, context, hero, decision);
      if (!result.moved) {
        idleCount++;
        break;
      }
      // Mémorise l'objectif poursuivi (hystérésis) et toute défaite subie (prudence).
      heroObjectives[hero.id] = score.objective.id;
      if (result.heroRemoved && score.objective.targetPlayerId) {
        const prior = intelOverride[score.objective.targetPlayerId];
        intelOverride[score.objective.targetPlayerId] = {
          maxPowerSeen: prior?.maxPowerSeen ?? score.objective.targetPower,
          lastSeenPower: prior?.lastSeenPower ?? score.objective.targetPower,
          lastSeenTurn: prior?.lastSeenTurn ?? turnNumber,
          lostToAtTurn: turnNumber,
        };
      }
      actionCount++;
      if (result.heroRemoved) break;
      await sleep(AI_MOVE_DELAY_MS);
    }
  }

  if (lastContext) {
    const finalGame = await getGameWithRelations(supabase, game.id) as unknown as AiGame | null;
    const finalMapState = (finalGame?.mapState as Record<string, unknown> | undefined) ?? lastContext.mapState;
    const livingHeroIds = new Set((lastContext.player.heroes ?? []).map((h) => h.id));
    const prunedHeroObjectives: Record<string, string> = {};
    for (const [heroId, objectiveId] of Object.entries(heroObjectives)) {
      if (livingHeroIds.has(heroId)) prunedHeroObjectives[heroId] = objectiveId;
    }
    const updatedMemory = {
      ...lastContext.memory,
      championHeroId: championOverride ?? lastContext.memory.championHeroId,
      primaryEnemyId: primaryEnemyOverride ?? lastContext.memory.primaryEnemyId,
      multiTurnPlans: plansOverride,
      opponentIntel: intelOverride,
      heroObjectives: prunedHeroObjectives,
      lastTurn: Number(game.turnNumber ?? 0),
    };
    await saveAiMemory(supabase, game.id, player.id, updatedMemory, finalMapState);
    const savedGame = await getGameWithRelations(supabase, game.id) as unknown as AiGame | null;
    const savedPlayer = savedGame?.players.find((item) => item.id === player.id);
    if (savedGame && savedPlayer) {
      const skillContext = buildAiContext(savedGame, savedPlayer);
      skillContext.memory = updatedMemory;
      await consumePendingSkillChoices(supabase, skillContext);
    }
  }
  await logAiAction(supabase, game, player, "AI_TURN_SUMMARY", "turn", `${player.aiName || "IA"} termine ses decisions.`, {
    actionCount,
    idleCount,
    heroCount: heroIds.length,
  });
}

async function applyAiDecision(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  decision: AiDecision,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const objective = decision.score.objective;
  const movement = await moveHeroToObjective(supabase, context, hero, objective);
  if (!movement.moved) {
    await logAiAction(supabase, context.game, context.player, "AI_MOVE_BLOCKED", "movement", `${context.player.aiName || "IA"} ne peut pas rejoindre son objectif.`, {
      heroId: hero.id,
      objectiveType: objective.type,
      targetId: objective.id,
      destination: objective.position,
    });
    return { moved: false };
  }
  await logAiAction(supabase, context.game, context.player, "MOVE_HERO", "movement", `${context.player.aiName || "IA"} deplace un heros.`,
  {
    heroId: hero.id,
    destination: objective.position,
    objectiveType: objective.type,
  });

  if (objective.type === "resource") {
    await collectResource(supabase, context, objective.object);
    await logAiAction(supabase, context.game, context.player, "COLLECT_RESOURCE", "adventure", `${context.player.aiName || "IA"} collecte des ressources.`, {
      objectId: objective.id,
      position: objective.position,
    });
  } else if (objective.type === "adventure_building" || objective.type === "level_transition") {
    await visitAdventureBuilding(supabase, context, movement.hero, objective);
    await logAiAction(supabase, context.game, context.player, "VISIT_ADVENTURE_BUILDING", "adventure", `${context.player.aiName || "IA"} visite un lieu d'aventure.`, {
      objectId: objective.id,
      position: objective.position,
      subtype: objective.object?.subtype,
    });
  } else if (objective.type === "resource_building") {
    return captureOrFightResourceBuilding(supabase, context, movement.hero, objective);
  } else if (objective.type === "neutral_army") {
    return fightNeutralArmy(supabase, context, movement.hero, objective);
  } else if (objective.type === "gate") {
    return captureOrFightGate(supabase, context, movement.hero, objective);
  } else if (objective.type === "enemy_hero") {
    return fightEnemyHero(supabase, context, movement.hero, objective);
  } else if (objective.type === "neutral_town") {
    return captureOrFightNeutralTown(supabase, context, movement.hero, objective);
  } else if (objective.type === "enemy_town") {
    return fightEnemyTown(supabase, context, movement.hero, objective);
  } else if (objective.type === "embark_boat") {
    return embarkBoat(supabase, context, movement.hero, objective);
  } else if (objective.type === "sail") {
    // The sail leg is movement-only; moveHeroToObjective already relocated the
    // hero (the boat follows via hero_id, so the boats row is left untouched).
    return { moved: true };
  } else if (objective.type === "disembark_boat") {
    return disembarkBoat(supabase, context, movement.hero, objective);
  } else if (objective.type === "pickup_garrison") {
    await pickupNearbyGarrisonForHero(supabase, context, movement.hero, objective.targetTownId);
    await logAiAction(supabase, context.game, context.player, "AI_PICKUP_GARRISON", "recruitment", `${context.player.aiName || "IA"} recupere une garnison.`, {
      heroId: hero.id,
      targetTownId: objective.targetTownId,
    });
    return { moved: true };
  } else if (objective.type === "defend_town" || objective.type === "plan_waypoint") {
    await pickupNearbyGarrisonForHero(supabase, context, movement.hero);
    await logAiAction(supabase, context.game, context.player, objective.type === "defend_town" ? "AI_DEFEND_TOWN" : "AI_PLAN_WAYPOINT", "strategy", `${context.player.aiName || "IA"} repositionne un heros.`, {
      heroId: hero.id,
      objectiveType: objective.type,
      destination: objective.position,
    });
    // Le mouvement seul suffit : le héros se rapproche de l'objectif.
    return { moved: true };
  }

  return { moved: true };
}

async function fightEnemyTown(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const targetPlayer = context.game.players.find((p) => p.id === objective.targetPlayerId);
  const town = (targetPlayer?.towns ?? []).find((t) => t.id === objective.targetTownId || (t.x === objective.position.x && t.y === objective.position.y));
  if (!town) return { moved: true };
  const garrison = town.garrison ?? [];
  if (garrison.length === 0) {
    await captureEnemyTown(supabase, town.id, context.player.id);
    await logAiAction(supabase, context.game, context.player, "CAPTURE_TOWN", "capture", `${context.player.aiName || "IA"} capture un chateau.`, {
      townId: town.id,
      targetPlayerId: objective.targetPlayerId,
    });
    return { moved: true };
  }
  const defender = {
    id: town.id,
    attack: 1,
    defense: 1,
    armies: garrison,
  };
  if (!canAiWinAutoCombat(hero, defender)) return { moved: false };

  const result = await resolveAiAutoCombat({
    supabase,
    gameId: context.game.id,
    attacker: hero,
    defender,
    experience: 400,
    onAttackerWon: async () => captureEnemyTown(supabase, town.id, context.player.id),
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  if (result.attackerWon) {
    await logAiAction(supabase, context.game, context.player, "CAPTURE_TOWN", "capture", `${context.player.aiName || "IA"} capture un chateau.`, {
      townId: town.id,
      targetPlayerId: objective.targetPlayerId,
    });
  }
  await logAiAction(supabase, context.game, context.player, "AI_AUTO_COMBAT", "combat", `${context.player.aiName || "IA"} resout un combat automatiquement.`, {
    targetType: objective.type,
    targetId: objective.id,
    attackerWon: result.attackerWon,
  });
  return { moved: true, heroRemoved: !result.attackerWon };
}

async function captureEnemyTown(supabase: SupabaseAdmin, townId: string, playerId: string) {
  await supabase.from("towns").update({
    game_player_id: playerId,
    is_neutral: false,
    neutral_garrison: [],
  }).eq("id", townId);
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

  // Ramassage en-route : on récupère une pile de ressources traversée plutôt que
  // de « téléporter » par-dessus (la collecte de la case d'arrivée reste gérée
  // par l'effet de l'objectif lui-même).
  await collectResource(supabase, context, findEnRoutePickup(context, objective.path, destination) ?? undefined);

  await updateExploration(supabase, context, destination);
  return {
    moved: true,
    hero: { ...hero, x: destination.x, y: destination.y, movement: nextMovement },
  };
}

async function updateExploration(supabase: SupabaseAdmin, context: AiContext, destination: Position) {
  const level = context.activeLevel;
  const otherHeroes = (context.player.heroes ?? [])
    .filter((hero) => normalizeMapLevel(hero.mapLevel) === level && (hero.x !== destination.x || hero.y !== destination.y))
    .map((hero) => ({ position: { x: hero.x, y: hero.y } }));
  const towns = (context.player.towns ?? [])
    .filter((town) => normalizeMapLevel(town.mapLevel) === level)
    .map((town) => ({ position: { x: town.x, y: town.y } }));
  const visible = computeVisibleTiles(
    context.map,
    getPlayerVisionCenters({ heroes: [...otherHeroes, { position: destination }], towns }),
    5,
  );
  await persistExploredTiles(supabase, context, visible);
}

/**
 * Merges newly visible tiles into the player's explored set on the active level,
 * preserving the other level's tiles and writing the `${level}:${x},${y}` scheme
 * used by the human flow. Starts from the fresh DB snapshot so concurrent-level
 * exploration is never wiped.
 */
async function persistExploredTiles(
  supabase: SupabaseAdmin,
  context: AiContext,
  visibleKeys: Iterable<string>,
  level = context.activeLevel,
) {
  const explored = new Set(context.player.exploredTiles ?? []);
  for (const key of visibleKeys) explored.add(key.includes(":") ? key : `${level}:${key}`);
  await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", context.player.id);
}

async function embarkBoat(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean }> {
  const boat = context.boats.find((item) => item.id === objective.boatId);
  const check = canEmbark({ hero, boat, boats: context.boats, mapData: context.map });
  if (!check.ok || !boat) {
    // The hero already advanced toward the boat this turn; embarking can resume next turn.
    return { moved: true };
  }
  await supabase.from("heroes").update({ x: boat.x, y: boat.y, movement: 0 }).eq("id", hero.id);
  await supabase.from("boats").update({ hero_id: hero.id, owner_player_id: context.player.id }).eq("id", boat.id);
  await persistExploredTiles(supabase, context, computeVisibleTiles(context.map, [{ x: boat.x, y: boat.y }], 5));
  await logAiAction(supabase, context.game, context.player, "EMBARK_BOAT", "movement", `${context.player.aiName || "IA"} embarque sur un bateau.`, {
    heroId: hero.id,
    boatId: boat.id,
    position: { x: boat.x, y: boat.y },
  });
  return { moved: true };
}

async function disembarkBoat(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean }> {
  const destination = objective.disembarkPosition ?? objective.position;
  const boat = context.boats.find((item) => item.heroId === hero.id);
  const check = canDisembark({
    hero,
    boat,
    destination,
    mapData: context.map,
    isOccupied: (position) => isPositionOccupiedByHero(context, hero.id, position),
  });
  if (!check.ok || !boat) return { moved: true };
  await supabase.from("heroes").update({ x: destination.x, y: destination.y, movement: 0 }).eq("id", hero.id);
  // The boat is freed at the hero's prior water tile (mirrors boatActions.ts).
  await supabase.from("boats").update({ hero_id: null, x: hero.x, y: hero.y, map_level: SURFACE_LEVEL }).eq("id", boat.id);
  await persistExploredTiles(supabase, context, computeVisibleTiles(context.map, [destination], 5));
  await logAiAction(supabase, context.game, context.player, "DISEMBARK_BOAT", "movement", `${context.player.aiName || "IA"} débarque sur la côte.`, {
    heroId: hero.id,
    boatId: boat.id,
    position: destination,
  });
  return { moved: true };
}

function isPositionOccupiedByHero(context: AiContext, movingHeroId: string, position: Position): boolean {
  return (context.game.players ?? []).some((player) =>
    (player.heroes ?? []).some((hero) =>
      hero.id !== movingHeroId &&
      hero.x === position.x &&
      hero.y === position.y &&
      normalizeMapLevel(hero.mapLevel) === context.activeLevel
    )
  );
}

async function collectResource(supabase: SupabaseAdmin, context: AiContext, object: MapObject | undefined) {
  if (!object || context.collected.has(object.id)) return;

  const resourceType = normalizeResource(object.subtype);
  const amount = getResourcePileAmount(object);
  const nextAmount = Number(playerResources(context.player)[resourceType] ?? 0) + amount;

  // Mutate the context so chained collects in the same decision (en-route pile +
  // destination pile) stay consistent instead of overwriting each other.
  context.collected.add(object.id);
  context.player[resourceType] = nextAmount;
  context.mapState = { ...context.mapState, collected: Array.from(context.collected) };

  await supabase.from("game_players").update({ [resourceType]: nextAmount }).eq("id", context.player.id);
  await supabase.from("games").update({ map_state: context.mapState }).eq("id", context.game.id);
}

// First uncollected resource pile the path crosses before its final tile — the
// loot a human grabs on the way instead of walking past it.
function findEnRoutePickup(context: AiContext, path: Position[], destination: Position): MapObject | null {
  for (let i = 1; i < path.length - 1; i++) {
    const step = path[i];
    if (step.x === destination.x && step.y === destination.y) continue;
    const object = context.map.tiles[step.y]?.[step.x]?.object;
    if (object?.type === "resource" && !context.collected.has(object.id)) return object;
  }
  return null;
}

async function visitAdventureBuilding(supabase: SupabaseAdmin, context: AiContext, hero: AiHero, objective: AiObjective) {
  const object = objective.object;
  const buildingType = object?.subtype as AdventureBuildingType | undefined;
  if (!object || !buildingType) return;
  const currentWeek = getAdventureWeekKey(Number(context.game.turnNumber ?? 1));
  const weeklyHeroKey = `${object.id}:${hero.id}`;
  const weeklyPlayerKey = `${object.id}:${context.player.id}`;

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
    await persistExploredTiles(supabase, context, computeVisibleTiles(context.map, [objective.position], 20));
  }

  if (buildingType === AdventureBuildingType.STARGATE || buildingType === AdventureBuildingType.SUBTERRANEAN_GATE) {
    // Both teleport the hero to a paired object, possibly on the other map level.
    const target = buildingType === AdventureBuildingType.SUBTERRANEAN_GATE
      ? getSubterraneanGateTarget(context.fullMap, object)
      : findGateObjectOnAnyLevel(context.fullMap, object.targetId);
    if (target) {
      const targetLayerMap = withActiveMapLayer(context.fullMap, target.level);
      const landing = findTeleportLandingOnLayer(targetLayerMap, target.position);
      if (landing) {
        const nextMovement = getUsableAdventureMovement(targetLayerMap, landing, hero.movement);
        await supabase.from("heroes").update({ x: landing.x, y: landing.y, map_level: target.level, movement: nextMovement }).eq("id", hero.id);
        await persistExploredTiles(supabase, context, computeVisibleTiles(targetLayerMap, [landing], 5), target.level);
      }
    }
    return;
  }

  if (isExternalDwellingType(buildingType)) {
    await visitExternalDwelling(supabase, context, hero, object);
    return;
  }

  if (buildingType === AdventureBuildingType.MERCENARY_CAMP || buildingType === AdventureBuildingType.ARENA || buildingType === AdventureBuildingType.SCHOOL_OF_WAR) {
    const costPaid = buildingType === AdventureBuildingType.SCHOOL_OF_WAR;
    if (!costPaid || context.player.gold >= 1000) {
      if (costPaid) await supabase.from("game_players").update({ gold: context.player.gold - 1000 }).eq("id", context.player.id);
      await supabase.from("heroes").update({ attack: Number(hero.attack ?? 0) + (buildingType === AdventureBuildingType.ARENA ? 2 : 1) }).eq("id", hero.id);
      await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
      return;
    }
  }

  if (buildingType === AdventureBuildingType.MARLETTO_TOWER) {
    await supabase.from("heroes").update({ defense: Number(hero.defense ?? 0) + 1 }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.STAR_AXIS || buildingType === AdventureBuildingType.SCHOOL_OF_MAGIC) {
    const costPaid = buildingType === AdventureBuildingType.SCHOOL_OF_MAGIC;
    if (!costPaid || context.player.gold >= 1000) {
      if (costPaid) await supabase.from("game_players").update({ gold: context.player.gold - 1000 }).eq("id", context.player.id);
      await supabase.from("heroes").update({ spell_power: Number(hero.spellPower ?? 0) + 1 }).eq("id", hero.id);
      await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
      return;
    }
  }

  if (buildingType === AdventureBuildingType.GARDEN_OF_REVELATION) {
    await supabase.from("heroes").update({ knowledge: Number(hero.knowledge ?? 0) + 1 }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.LEARNING_STONE) {
    await grantAiHeroExperience(supabase, context, hero, 1000);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT && Number(hero.level ?? 1) >= 10) {
    await supabase.from("heroes").update({
      attack: Number(hero.attack ?? 0) + 2,
      defense: Number(hero.defense ?? 0) + 2,
      spell_power: Number(hero.spellPower ?? 0) + 2,
      knowledge: Number(hero.knowledge ?? 0) + 2,
    }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.CARTOGRAPHER && context.player.gold >= 10000) {
    await supabase.from("game_players").update({ gold: context.player.gold - 10000, explored_tiles: getAllMapTileKeys(context.map) }).eq("id", context.player.id);
  }

  if (buildingType === AdventureBuildingType.REDWOOD_OBSERVATORY) {
    const explored = new Set(context.explored);
    for (const key of computeVisibleTiles(context.map, [objective.position], 28)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", context.player.id);
  }

  if (buildingType === AdventureBuildingType.MYSTICAL_GARDEN) {
    if (context.weeklyAdventureVisits[weeklyPlayerKey] === currentWeek) return;
    const resourceUpdate = makeRng(`${context.game.id}:${object.id}:${context.player.id}:${context.game.turnNumber ?? 1}`)() > 0.55
      ? { gems: context.player.gems + 5 }
      : { gold: context.player.gold + 1000 };
    await supabase.from("game_players").update(resourceUpdate).eq("id", context.player.id);
    await markAiWeeklyAdventureVisit(supabase, context, weeklyPlayerKey, currentWeek);
    return;
  }

  if (buildingType === AdventureBuildingType.STABLES) {
    if (context.weeklyAdventureVisits[weeklyHeroKey] !== currentWeek) {
      await supabase.from("heroes").update({ movement: hero.movement + 400 }).eq("id", hero.id);
      await markAiWeeklyAdventureVisit(supabase, context, weeklyHeroKey, currentWeek);
    }
    return;
  }

  if (buildingType === AdventureBuildingType.TEMPLE) {
    await supabase.from("heroes").update({ morale: Number(hero.morale ?? 0) + 1 }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.FOUNTAIN_OF_FORTUNE) {
    await supabase.from("heroes").update({ luck: Number(hero.luck ?? 0) + 1 }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.IDOL_OF_FORTUNE) {
    await supabase.from("heroes").update({
      morale: Number(hero.morale ?? 0) + 1,
      luck: Number(hero.luck ?? 0) + 1,
    }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.MAGIC_WELL) {
    const currentDay = `day-${Number(context.game.turnNumber ?? 1)}`;
    if (context.weeklyAdventureVisits[weeklyHeroKey] !== currentDay) {
      await supabase.from("heroes").update({ mana: Math.max(0, Number(hero.knowledge ?? 0) * 10) }).eq("id", hero.id);
      await markAiWeeklyAdventureVisit(supabase, context, weeklyHeroKey, currentDay);
    }
    return;
  }

  if (buildingType === AdventureBuildingType.MAGIC_SHRINE) {
    const maxMana = Math.max(0, Number(hero.knowledge ?? 0) * 10);
    const currentMana = Number.isFinite(hero.mana) ? Number(hero.mana) : maxMana;
    await supabase.from("heroes").update({ mana: Math.min(maxMana, currentMana + 20) }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.WATER_MILL || buildingType === AdventureBuildingType.WATER_WHEEL) {
    if (context.weeklyAdventureVisits[weeklyPlayerKey] !== currentWeek) {
      const gold = context.player.gold + (buildingType === AdventureBuildingType.WATER_MILL ? 1000 : 500);
      await supabase.from("game_players").update({ gold }).eq("id", context.player.id);
      await markAiWeeklyAdventureVisit(supabase, context, weeklyPlayerKey, currentWeek);
    }
    return;
  }

  if (buildingType === AdventureBuildingType.ABANDONED_WAGON && !context.visitedAdventureBuildings.has(object.id)) {
    await supabase.from("game_players").update({ gold: context.player.gold + 500 }).eq("id", context.player.id);
    await markAiVisitedAdventureBuilding(supabase, context, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.CRATE && !context.visitedAdventureBuildings.has(object.id)) {
    await supabase.from("game_players").update({ wood: context.player.wood + 3, ore: context.player.ore + 3 }).eq("id", context.player.id);
    await markAiVisitedAdventureBuilding(supabase, context, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.SKELETON && !context.visitedAdventureBuildings.has(object.id)) {
    await supabase.from("game_players").update({ gold: context.player.gold + 300 }).eq("id", context.player.id);
    await markAiVisitedAdventureBuilding(supabase, context, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.WARRIOR_TOMB && !context.visitedAdventureBuildings.has(object.id)) {
    await supabase.from("game_players").update({ gold: context.player.gold + 700 }).eq("id", context.player.id);
    await supabase.from("heroes").update({ morale: Number(hero.morale ?? 0) - 1 }).eq("id", hero.id);
    await grantAiHeroExperience(supabase, context, hero, 750);
    await markAiVisitedAdventureBuilding(supabase, context, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.CURSED_ALTAR) {
    await supabase.from("heroes").update({
      spell_power: Number(hero.spellPower ?? 0) + 1,
      luck: Number(hero.luck ?? 0) - 1,
    }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (
    buildingType === AdventureBuildingType.SPELL_SHRINE_1 ||
    buildingType === AdventureBuildingType.SPELL_SHRINE_2 ||
    buildingType === AdventureBuildingType.SPELL_SHRINE_3
  ) {
    const level = buildingType === AdventureBuildingType.SPELL_SHRINE_1 ? 1 : buildingType === AdventureBuildingType.SPELL_SHRINE_2 ? 2 : 3;
    const spell = pickAiShrineSpell(level, `${context.game.id}:${object.id}:${hero.id}`);
    await supabase.from("heroes").update({
      has_spell_book: true,
      known_spells: Array.from(new Set([...(hero.knownSpellIds ?? []), spell.id])),
    }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.TREE_OF_KNOWLEDGE) {
    if (context.player.gold >= 2000) {
      await supabase.from("game_players").update({ gold: context.player.gold - 2000 }).eq("id", context.player.id);
      await grantAiHeroExperience(supabase, context, hero, 2000);
      await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    }
    return;
  }

  if (buildingType === AdventureBuildingType.SEER_HUT) {
    const maxMana = Math.max(0, Number(hero.knowledge ?? 0) * 10);
    const currentMana = Number.isFinite(hero.mana) ? Number(hero.mana) : maxMana;
    await supabase.from("heroes").update({ mana: Math.min(maxMana, currentMana + 10) }).eq("id", hero.id);
    await grantAiHeroExperience(supabase, context, hero, 1000);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.MERMAID) {
    await supabase.from("heroes").update({ luck: Number(hero.luck ?? 0) + 1 }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.BUOY) {
    await supabase.from("heroes").update({ morale: Number(hero.morale ?? 0) + 1 }).eq("id", hero.id);
    await markAiHeroAdventureVisit(supabase, context, hero.id, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.FLOTSAM && !context.visitedAdventureBuildings.has(object.id)) {
    await supabase.from("game_players").update({ gold: context.player.gold + 250, wood: context.player.wood + 5 }).eq("id", context.player.id);
    await markAiVisitedAdventureBuilding(supabase, context, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.SEA_CHEST && !context.visitedAdventureBuildings.has(object.id)) {
    await supabase.from("game_players").update({ gold: context.player.gold + 600 }).eq("id", context.player.id);
    await markAiVisitedAdventureBuilding(supabase, context, object.id);
    return;
  }

  if (buildingType === AdventureBuildingType.OBELISK) {
    const explored = new Set(context.explored);
    for (const key of computeVisibleTiles(context.map, [objective.position], 24)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", context.player.id);
  }

  await supabase.from("games").update({
    map_state: {
      ...context.mapState,
      playerAdventureVisits: addVisit(context.playerAdventureVisits, context.player.id, object.id),
    },
  }).eq("id", context.game.id);
}

async function markAiHeroAdventureVisit(
  supabase: SupabaseAdmin,
  context: AiContext,
  heroId: string,
  buildingId: string,
) {
  await supabase.from("games").update({
    map_state: {
      ...context.mapState,
      heroAdventureVisits: addVisit(context.heroAdventureVisits, heroId, buildingId),
    },
  }).eq("id", context.game.id);
}

async function grantAiHeroExperience(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  amount: number,
) {
  const nextExperience = Number(hero.experience ?? 0) + amount;
  await applyHeroExperienceGain(supabase, context.game.id, hero.id, nextExperience);
  hero.experience = nextExperience;
}

async function markAiWeeklyAdventureVisit(
  supabase: SupabaseAdmin,
  context: AiContext,
  visitKey: string,
  weekKey: string,
) {
  await supabase.from("games").update({
    map_state: {
      ...context.mapState,
      weeklyAdventureVisits: {
        ...context.weeklyAdventureVisits,
        [visitKey]: weekKey,
      },
    },
  }).eq("id", context.game.id);
}

async function markAiVisitedAdventureBuilding(
  supabase: SupabaseAdmin,
  context: AiContext,
  buildingId: string,
) {
  await supabase.from("games").update({
    map_state: {
      ...context.mapState,
      visitedAdventureBuildings: Array.from(new Set([...context.visitedAdventureBuildings, buildingId])),
    },
  }).eq("id", context.game.id);
}

async function visitExternalDwelling(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  object: NonNullable<AiObjective["object"]>,
) {
  const externalDwellings = ((context.mapState.externalDwellings as ExternalDwellingStateMap | undefined) ?? {});
  const current = normalizeExternalDwellingState(object, externalDwellings[object.id]) ?? createExternalDwellingState(object);
  if (!current || current.available <= 0) return;

  const unitRule = UNIT_RULES[current.unitType];
  if (!unitRule) return;
  const recruitCost: ResourceCost = tierForUnit(current.unitType)?.tier === 0 ? {} : unitRule.cost;
  const resources = playerResources(context.player);
  const affordable = getAffordableCount(resources, recruitCost, current.available);
  if (affordable <= 0) return;

  const capacity = addUnitsToStacks(
    sortedStacks(hero.armies),
    current.unitType,
    affordable,
    unitRule.health,
    () => randomUUID(),
  );
  if (capacity.added <= 0) return;

  await persistAiHeroArmyStacks(supabase, hero.id, hero.armies, capacity.stacks);
  const nextResources = subtractCost(resources, multiplyCost(recruitCost, capacity.added));
  await supabase.from("game_players").update(nextResources).eq("id", context.player.id);

  const nextState = {
    ...current,
    ownerId: context.player.id,
    available: Math.max(0, current.available - capacity.added),
  };
  await supabase.from("games").update({
    map_state: {
      ...context.mapState,
      externalDwellings: {
        ...externalDwellings,
        [object.id]: nextState,
      },
    },
  }).eq("id", context.game.id);
}

async function persistAiHeroArmyStacks(
  supabase: SupabaseAdmin,
  heroId: string,
  previousStacks: UnitStack[],
  nextStacks: UnitStack[],
) {
  const previousIds = new Set(previousStacks.map((stack) => stack.id));
  for (const stack of nextStacks) {
    if (previousIds.has(stack.id)) {
      await supabase.from("armies").update({
        count: stack.count,
        health: stack.health,
        max_health: stack.maxHealth,
        position: stack.position,
      }).eq("id", stack.id).eq("hero_id", heroId);
      continue;
    }

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

function getAffordableCount(resources: Resources, cost: ResourceCost, available: number) {
  let limit = Math.max(0, Math.floor(available));
  for (const [resource, amount] of Object.entries(cost)) {
    const unitCost = Number(amount ?? 0);
    if (unitCost <= 0) continue;
    const owned = Number(resources[resource as keyof Resources] ?? 0);
    limit = Math.min(limit, Math.floor(owned / unitCost));
  }
  return Math.max(0, limit);
}

function multiplyCost(cost: ResourceCost, count: number): ResourceCost {
  return Object.fromEntries(
    Object.entries(cost).map(([resource, amount]) => [resource, (amount ?? 0) * count])
  ) as ResourceCost;
}

function subtractCost(resources: Resources, cost: ResourceCost): Resources {
  return {
    gold: Math.max(0, resources.gold - Number(cost.gold ?? 0)),
    wood: Math.max(0, resources.wood - Number(cost.wood ?? 0)),
    ore: Math.max(0, resources.ore - Number(cost.ore ?? 0)),
    mercury: Math.max(0, resources.mercury - Number(cost.mercury ?? 0)),
    crystals: Math.max(0, resources.crystals - Number(cost.crystals ?? 0)),
    gems: Math.max(0, resources.gems - Number(cost.gems ?? 0)),
    sulfur: Math.max(0, resources.sulfur - Number(cost.sulfur ?? 0)),
  };
}

function getAdventureWeekKey(turnNumber: number) {
  return `week-${Math.max(1, Math.floor((turnNumber - 1) / 7) + 1)}`;
}

function pickAiShrineSpell(level: number, seed: string) {
  const candidates = SPELLS.filter((spell) => spell.level === level && spell.context === "combat");
  const pool = candidates.length > 0 ? candidates : SPELLS.filter((spell) => spell.level === level);
  return pool[Math.floor(makeRng(seed)() * pool.length)] ?? SPELLS[0];
}

function getAllMapTileKeys(map: GameMap) {
  const keys: string[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      keys.push(`${x},${y}`);
    }
  }
  return keys;
}

async function captureOrFightResourceBuilding(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const guardianPower = Number(objective.guardianPower ?? objective.targetPower ?? 0);
  if (guardianPower <= 0) {
    await captureResourceBuilding(supabase, context, objective);
    await logAiAction(supabase, context.game, context.player, "CAPTURE_BUILDING", "capture", `${context.player.aiName || "IA"} capture une mine.`, {
      buildingId: objective.id,
      position: objective.position,
    });
    return { moved: true };
  }

  const defender = {
    id: objective.id,
    attack: 1,
    defense: 1,
    armies: createBuildingGuardStacks(objective.id, guardianPower),
  };
  if (!canAiWinAutoCombat(hero, defender)) return { moved: false };
  const result = await resolveAiAutoCombat({
    supabase,
    gameId: context.game.id,
    attacker: hero,
    defender,
    experience: 150,
    onAttackerWon: async () => captureResourceBuilding(supabase, context, objective),
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  await logAiAction(supabase, context.game, context.player, "AI_AUTO_COMBAT", "combat", `${context.player.aiName || "IA"} resout un combat automatiquement.`, {
    targetType: objective.type,
    targetId: objective.id,
    attackerWon: result.attackerWon,
  });
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

async function captureOrFightGate(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  objective: AiObjective,
): Promise<{ moved: boolean; heroRemoved?: boolean }> {
  const gate = (context.game.gates ?? []).find((item) =>
    item.id === objective.id || (item.x === objective.position.x && item.y === objective.position.y)
  );
  if (!gate || gate.gamePlayerId === context.player.id) return { moved: true };

  const garrison = gate.garrison ?? [];
  if (garrison.length === 0) {
    await captureGate(supabase, context.game.id, gate.id, context.player.id);
    await logAiAction(supabase, context.game, context.player, "CAPTURE_GATE", "capture", `${context.player.aiName || "IA"} capture une porte.`, {
      gateId: gate.id,
      position: objective.position,
    });
    return { moved: true };
  }

  const defender = {
    id: gate.id,
    attack: 1,
    defense: 1,
    armies: garrison,
  };
  if (!canAiWinAutoCombat(hero, defender)) return { moved: false };

  const result = await resolveAiAutoCombat({
    supabase,
    gameId: context.game.id,
    attacker: hero,
    defender,
    experience: 150,
    onAttackerWon: async () => {
      await captureGate(supabase, context.game.id, gate.id, context.player.id);
      await supabase.from("gate_stacks").delete().eq("gate_id", gate.id);
    },
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  await logAiAction(supabase, context.game, context.player, "AI_AUTO_COMBAT", "combat", `${context.player.aiName || "IA"} resout un combat automatiquement.`, {
    targetType: objective.type,
    targetId: objective.id,
    attackerWon: result.attackerWon,
  });
  return { moved: true, heroRemoved: !result.attackerWon };
}

async function captureGate(supabase: SupabaseAdmin, gameId: string, gateId: string, playerId: string) {
  await supabase
    .from("gates")
    .update({ game_player_id: playerId, guardian_power: 0 })
    .eq("game_id", gameId)
    .eq("id", gateId);
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
  const stacks = army?.stacks ?? createBuildingGuardStacks(objective.id, objective.guardianPower ?? objective.targetPower);
  const defender = {
    id: army?.id ?? objective.id,
    attack: 1,
    defense: 1,
    armies: stacks,
  };
  if (!canAiWinAutoCombat(hero, defender)) return { moved: false };

  const result = await resolveAiAutoCombat({
    supabase,
    gameId: context.game.id,
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
  await logAiAction(supabase, context.game, context.player, "AI_AUTO_COMBAT", "combat", `${context.player.aiName || "IA"} resout un combat automatiquement.`, {
    targetType: objective.type,
    targetId: objective.id,
    attackerWon: result.attackerWon,
  });
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

  const defender = {
    id: defenderHero.id,
    attack: defenderHero.attack,
    defense: defenderHero.defense,
    morale: defenderHero.morale,
    luck: defenderHero.luck,
    armies: defenderHero.armies,
  };
  if (!canAiWinAutoCombat(hero, defender)) return { moved: false };

  const result = await resolveAiAutoCombat({
    supabase,
    gameId: context.game.id,
    attacker: hero,
    defender,
    onAttackerWon: async () => {
      await supabase.from("armies").delete().eq("hero_id", defenderHero.id);
      await supabase.from("heroes").delete().eq("id", defenderHero.id);
    },
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  if (result.attackerWon) {
    await logAiAction(supabase, context.game, context.player, "COMBAT_WON", "combat", `${context.player.aiName || "IA"} vainc un heros ennemi.`, {
      targetPlayerId: objective.targetPlayerId,
      targetHeroId: objective.targetHeroId,
    });
  }
  await logAiAction(supabase, context.game, context.player, "AI_AUTO_COMBAT", "combat", `${context.player.aiName || "IA"} resout un combat automatiquement.`, {
    targetType: objective.type,
    targetId: objective.id,
    attackerWon: result.attackerWon,
  });
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
    await logAiAction(supabase, context.game, context.player, "CAPTURE_TOWN", "capture", `${context.player.aiName || "IA"} capture un chateau neutre.`, {
      townId: town.id,
      position: objective.position,
    });
    return { moved: true };
  }

  const defender = {
    id: town.id,
    attack: 1,
    defense: 1,
    armies: garrison,
  };
  if (!canAiWinAutoCombat(hero, defender)) return { moved: false };

  const result = await resolveAiAutoCombat({
    supabase,
    gameId: context.game.id,
    attacker: hero,
    defender,
    experience: 250,
    onAttackerWon: async () => captureNeutralTown(supabase, town.id, context.player.id),
  });
  await evaluateGameLifecycle(supabase, context.game.id);
  if (result.attackerWon) {
    await logAiAction(supabase, context.game, context.player, "CAPTURE_TOWN", "capture", `${context.player.aiName || "IA"} capture un chateau neutre.`, {
      townId: town.id,
      position: objective.position,
    });
  }
  await logAiAction(supabase, context.game, context.player, "AI_AUTO_COMBAT", "combat", `${context.player.aiName || "IA"} resout un combat automatiquement.`, {
    targetType: objective.type,
    targetId: objective.id,
    attackerWon: result.attackerWon,
  });
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

async function logAiAction(
  supabase: SupabaseAdmin,
  game: { id: string; turnNumber?: unknown },
  player: { id: string; aiName?: string | null },
  actionType: string,
  category: string,
  summary: string,
  details: Record<string, unknown> = {},
) {
  await recordGameAction(supabase, {
    gameId: game.id,
    gamePlayerId: player.id,
    actorKind: "ai",
    turnNumber: Number(game.turnNumber ?? 0),
    actionType,
    category,
    summary,
    details,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
