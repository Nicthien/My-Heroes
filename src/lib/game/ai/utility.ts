import {
  findPath,
  findPathToAdjacent,
  getAdventurePathCost,
  getAdventurePathCostAvoiding,
  getHeroAdventureMovementMode,
  isLandTile,
  isTileTraversable,
  isWaterTile,
} from "@/lib/game/engine";
import {
  findGateObjectOnAnyLevel,
  getSubterraneanGateTarget,
} from "@/lib/game/engine/level-transition";
import { mapLevels, normalizeMapLevel, SURFACE_LEVEL, withActiveMapLayer } from "@/lib/game/map-levels";
import { getAdventureBuildingExhaustion, getAdventureBuildingRule } from "@/lib/game/adventure-buildings";
import { addUnitsToStacks, sortedStacks } from "@/lib/game/army-stacks";
import { tierForUnit, UNIT_RULES, type ResourceCost } from "@/lib/game/economy";
import { createExternalDwellingState, isExternalDwellingType, normalizeExternalDwellingState, type ExternalDwellingStateMap } from "@/lib/game/external-dwellings";
import { AdventureBuildingType, ResourceBuildingType, type GameMap, type MapLevelId, type MapObject, type Position, type Resources } from "@/lib/game/types";
import {
  activeLevelExploredSet,
  countNewVisibleTiles,
  frontierScore,
  getResourceBuildingValue,
  getResourcePileAmount,
  getResourceValue,
  hasAdjacentUnexplored,
  isTownOwnedByPlayer,
  playerResources,
  tileKey,
} from "./context";
import { calculateHeroPower, calculateStacksPower, canAiWinAutoCombat, createBuildingGuardStacks, estimateAttackLossRatio } from "./combat";
import { roleMultiplier } from "./roles";
import { getGarrisonPickupStacks } from "./strategy/army-transfers";
import { generateDefenseObjectives } from "./strategy/defense";
import { jitterAmplitude, scoringJitter } from "./strategy/scoring-noise";
import type { AiPersonality } from "./strategy/personality";
import type { AiContext, AiHero, AiObjective, AiRole, AiUtilityScore } from "./types";

const MINIMUM_AUTO_RESOLVE_ATTACK_RATIO = 1.13;
const NEUTRAL_TOWN_BASE_VALUE = 12500;
const GARRISON_PICKUP_MIN_POWER = 220;
const ADJACENT = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 1;

export function chooseAiObjective(context: AiContext, hero: AiHero, role: AiRole): AiUtilityScore | null {
  const objectives = generateObjectives(context, hero);
  const heroPower = calculateHeroPower(hero);
  const scored = objectives
    .map((objective) => scoreObjective(context, hero, role, objective, heroPower))
    .filter((score): score is AiUtilityScore => score !== null)
    .sort((a, b) =>
      b.score - a.score ||
      a.objective.pathCost - b.objective.pathCost ||
      // Départage non-spatial : un hash stable de l'id évite le biais haut-gauche
      // (`y → x`) qui faisait zigzaguer l'IA de façon mécanique.
      stableHash(a.objective.id) - stableHash(b.objective.id)
    );

  return scored[0] ?? null;
}

function generateObjectives(context: AiContext, hero: AiHero): AiObjective[] {
  const objectives: AiObjective[] = [];
  const start = { x: hero.x, y: hero.y };
  const heroPower = calculateHeroPower(hero);

  for (const town of context.player.towns ?? []) {
    if (normalizeMapLevel(town.mapLevel) !== context.activeLevel) continue;
    if (ADJACENT(hero.x, hero.y, town.x, town.y)) continue;
    const pickupStacks = getGarrisonPickupStacks(town, context.posture === "DEFEND");
    const pickupPower = calculateStacksPower(pickupStacks);
    if (!shouldReturnForGarrison(context, hero, town.id, pickupPower, heroPower)) continue;

    const townPosition = { x: town.x, y: town.y };
    const directPath = findPath(context.map, start, townPosition, hero.movement);
    const directPathCost = getAdventurePathCost(context.map, directPath);
    const adjacentPath = directPath.length > 1 && Number.isFinite(directPathCost) && directPathCost <= hero.movement
      ? directPath
      : findPathToAdjacent(context.map, start, townPosition, hero.movement);
    const pathCost = getAdventurePathCost(context.map, adjacentPath);
    if (adjacentPath.length <= 1 || !Number.isFinite(pathCost) || pathCost > hero.movement) continue;

    objectives.push({
      type: "pickup_garrison",
      id: `pickup-garrison:${town.id}`,
      position: townPosition,
      path: adjacentPath,
      pathCost,
      baseValue: 850 + Math.min(4200, pickupPower * 0.75),
      targetPower: 0,
      targetTownId: town.id,
    });
  }

  for (const row of context.map.tiles) {
    for (const tile of row) {
      const position = { x: tile.x, y: tile.y };
      if (!context.explored.has(tileKey(position))) continue;
      if (position.x === start.x && position.y === start.y) continue;
      if (!isTileTraversable(tile)) continue;

      const path = findPath(context.map, start, position, hero.movement);
      if (path.length <= 1) continue;
      const pathCost = getAdventurePathCost(context.map, path);
      if (!Number.isFinite(pathCost) || pathCost > hero.movement) continue;

      const objectObjective = getObjectObjective(context, hero, tile.object, position, path, pathCost, start, hero.movement);
      if (objectObjective) {
        objectives.push(objectObjective);
        continue;
      }
      if (tile.object) continue;

      const revealScore = countNewVisibleTiles(context.map, context.explored, position);
      const frontierBonus = hasAdjacentUnexplored(context.map, context.explored, position) ? 1 : 0;
      const fScore = frontierScore(context.map, context.explored, position);
      if (revealScore <= 0 && frontierBonus <= 0 && fScore <= 0) continue;

      // Valeurs réduites : explorer une case ne doit jamais valoir plus qu'attraper une mine voisine.
      const pushBonus = fScore * 25;
      objectives.push({
        type: "exploration",
        id: `explore:${position.x},${position.y}`,
        position,
        path,
        pathCost,
        baseValue: revealScore * 80 + frontierBonus * 200 + pushBonus,
        targetPower: 0,
      });
    }
  }

  for (const army of context.game.neutralArmies ?? []) {
    if (army.status !== "ACTIVE" || context.killedNeutralArmies.has(army.id)) continue;
    if (normalizeMapLevel(army.mapLevel) !== context.activeLevel) continue;
    const position = { x: army.x, y: army.y };
    if (!context.explored.has(tileKey(position))) continue;
    const path = findPathToAdjacent(context.map, start, position, hero.movement);
    const pathCost = getAdventurePathCostAvoiding(context.map, path, [position]);
    if (path.length < 1 || !Number.isFinite(pathCost) || pathCost > hero.movement) continue;
    const targetPower = calculateStacksPower(army.stacks);
    const defender = { id: army.id, attack: 1, defense: 1, armies: army.stacks };
    objectives.push(attachLoss({
      type: "neutral_army",
      id: army.id,
      position,
      path,
      pathCost,
      baseValue: 500 + targetPower * 0.45,
      targetPower,
      canAutoWin: canAiWinAutoCombat(hero, defender),
    }, hero, heroPower, defender));
  }

  for (const gate of context.game.gates ?? []) {
    if (gate.gamePlayerId === context.player.id) continue;
    if (normalizeMapLevel(gate.mapLevel) !== context.activeLevel) continue;
    const position = { x: gate.x, y: gate.y };
    if (!context.explored.has(tileKey(position))) continue;
    const stacks = gate.garrison ?? [];
    const targetPower = calculateStacksPower(stacks);
    const objectivePath = targetPower > 0
      ? findPathToAdjacent(context.map, start, position, hero.movement)
      : findPath(context.map, start, position, hero.movement);
    const objectivePathCost = targetPower > 0
      ? getAdventurePathCostAvoiding(context.map, objectivePath, [position])
      : getAdventurePathCost(context.map, objectivePath);
    if (objectivePath.length < 1 || !Number.isFinite(objectivePathCost) || objectivePathCost > hero.movement) continue;
    const defender = { id: gate.id, attack: 1, defense: 1, armies: stacks };
    objectives.push(attachLoss({
      type: "gate",
      id: gate.id,
      position,
      path: objectivePath,
      pathCost: objectivePathCost,
      baseValue: targetPower > 0 ? 900 + targetPower * 0.5 : 700,
      targetPower,
      canAutoWin: targetPower <= 0 || canAiWinAutoCombat(hero, defender),
    }, hero, heroPower, targetPower > 0 ? defender : null));
  }

  for (const opponent of context.visibleOpponents) {
    for (const target of opponent.heroes ?? []) {
      const position = { x: target.x, y: target.y };
      const path = findPathToAdjacent(context.map, start, position, hero.movement);
      const pathCost = getAdventurePathCostAvoiding(context.map, path, [position]);
      if (path.length < 1 || !Number.isFinite(pathCost) || pathCost > hero.movement) continue;
      const targetPower = calculateHeroPower(target);
      const isPrimary = context.memory.primaryEnemyId === opponent.id;
      const defender = {
        id: target.id,
        attack: target.attack,
        defense: target.defense,
        morale: target.morale,
        luck: target.luck,
        armies: target.armies,
      };
      objectives.push(attachLoss({
        type: "enemy_hero",
        id: target.id,
        position,
        path,
        pathCost,
        baseValue: (650 + targetPower * 0.85) * (isPrimary ? 1.3 : 1),
        targetPower,
        targetPlayerId: opponent.id,
        targetHeroId: target.id,
        canAutoWin: canAiWinAutoCombat(hero, defender),
      }, hero, heroPower, defender));
    }
    for (const town of opponent.towns ?? []) {
      const position = { x: town.x, y: town.y };
      const garrisonPower = calculateStacksPower((town.garrison as typeof town.garrison) ?? []);
      const path = garrisonPower > 0
        ? findPathToAdjacent(context.map, start, position, hero.movement)
        : findPath(context.map, start, position, hero.movement);
      const pathCost = garrisonPower > 0
        ? getAdventurePathCostAvoiding(context.map, path, [position])
        : getAdventurePathCost(context.map, path);
      if (path.length < 1 || !Number.isFinite(pathCost) || pathCost > hero.movement) continue;
      const isPrimary = context.memory.primaryEnemyId === opponent.id;
      const defender = { id: town.id, attack: 1, defense: 1, armies: town.garrison ?? [] };
      objectives.push(attachLoss({
        type: "enemy_town",
        id: town.id,
        position,
        path,
        pathCost,
        baseValue: (2400 + garrisonPower * 0.5) * (isPrimary ? 1.4 : 1),
        targetPower: garrisonPower,
        targetPlayerId: opponent.id,
        targetTownId: town.id,
        canAutoWin: garrisonPower <= 0 || canAiWinAutoCombat(hero, defender),
      }, hero, heroPower, garrisonPower > 0 ? defender : null));
    }
  }

  for (const transition of generateLevelTransitionObjectives(context, hero, start)) {
    objectives.push(transition);
  }

  for (const boatObjective of generateBoatObjectives(context, hero, start)) {
    objectives.push(boatObjective);
  }

  for (const defense of generateDefenseObjectives(context, hero)) {
    objectives.push(defense);
  }

  const plan = context.memory.multiTurnPlans.find((p) => p.heroId === hero.id);
  if (plan) {
    const targetPos = { x: plan.targetX, y: plan.targetY };
    const path = findPath(context.map, start, targetPos, hero.movement);
    const usefulPath = path.length > 1
      ? path
      : findPathToAdjacent(context.map, start, targetPos, hero.movement);
    const pathCost = getAdventurePathCost(context.map, usefulPath);
    if (usefulPath.length > 1 && Number.isFinite(pathCost) && pathCost <= hero.movement) {
      objectives.push({
        type: "plan_waypoint",
        id: `plan:${hero.id}`,
        position: usefulPath[usefulPath.length - 1],
        path: usefulPath,
        pathCost,
        baseValue: plan.goal === "RAID_TOWN" ? 3200 : plan.goal === "RETREAT_TO" ? 2800 : 2400,
        targetPower: 0,
      });
    }
  }

  return objectives;
}

// Routes a hero to a subterranean gate / stargate when the OTHER map level holds
// worthwhile objectives (or is largely unexplored). The hero walks to the gate
// on the active layer; visitAdventureBuilding performs the actual transition.
function generateLevelTransitionObjectives(context: AiContext, hero: AiHero, start: Position): AiObjective[] {
  const objectives: AiObjective[] = [];
  const otherLevels = mapLevels(context.fullMap)
    .map((layer) => layer.id)
    .filter((level) => level !== context.activeLevel);
  if (otherLevels.length === 0) return objectives;

  // Pre-evaluate each other level once (bounded: one scan per level, not per gate).
  const opportunity = new Map<MapLevelId, number>();
  for (const level of otherLevels) opportunity.set(level, evaluateLayerOpportunity(context, level));

  for (const row of context.map.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (!object || object.type !== "adventure_building") continue;
      if (object.subtype !== AdventureBuildingType.STARGATE && object.subtype !== AdventureBuildingType.SUBTERRANEAN_GATE) continue;
      const position = { x: tile.x, y: tile.y };
      if (!context.explored.has(tileKey(position))) continue;

      const target = object.subtype === AdventureBuildingType.SUBTERRANEAN_GATE
        ? getSubterraneanGateTarget(context.fullMap, object)
        : findGateObjectOnAnyLevel(context.fullMap, object.targetId);
      if (!target || target.level === context.activeLevel) continue;
      const value = opportunity.get(target.level) ?? 0;
      if (value <= 0) continue;

      const path = findPath(context.map, start, position, hero.movement);
      if (path.length <= 1) continue;
      const pathCost = getAdventurePathCost(context.map, path);
      if (!Number.isFinite(pathCost) || pathCost > hero.movement) continue;

      objectives.push({
        type: "level_transition",
        id: `level-transition:${object.id}`,
        position,
        path,
        pathCost,
        baseValue: value,
        targetPower: 0,
        object,
        gateObject: object,
        targetLevel: target.level,
      });
    }
  }

  return objectives;
}

// Best discovered reward on a given layer plus an exploration incentive when the
// layer is largely unknown. Discounted to account for the extra hop/turn.
function evaluateLayerOpportunity(context: AiContext, level: MapLevelId): number {
  const layer = withActiveMapLayer(context.fullMap, level);
  const explored = activeLevelExploredSet(context.player.exploredTiles, level);
  let best = 0;
  let unexplored = 0;
  let total = 0;
  for (const row of layer.tiles) {
    for (const tile of row) {
      total++;
      if (!explored.has(`${tile.x},${tile.y}`)) {
        unexplored++;
        continue;
      }
      if (tile.object) best = Math.max(best, estimateObjectValue(context, tile.object));
    }
  }
  const unexploredRatio = total > 0 ? unexplored / total : 0;
  const explorationBonus = unexploredRatio > 0.5 ? 1500 : unexploredRatio > 0.2 ? 700 : 0;
  return best * 0.6 + explorationBonus;
}

function estimateObjectValue(context: AiContext, object: MapObject): number {
  switch (object.type) {
    case "resource":
      return getResourceValue(normalizeResource(object.subtype), getResourcePileAmount(object), context.resourceNeeds);
    case "building":
      return getResourceBuildingValue(object.subtype, context.resourceNeeds);
    case "adventure_building":
      return getAdventureBuildingBaseValue(object.subtype);
    case "town":
      return NEUTRAL_TOWN_BASE_VALUE * 0.5;
    case "monster":
      return 500 + Number(object.guardianPower ?? 0) * 0.45;
    default:
      return 0;
  }
}

const BOAT_VALUE_DISCOUNT = 0.5;
const NEIGHBOR8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

interface ValuableLandTarget {
  id: string;
  position: Position;
  value: number;
}

// Generates embark / sail / disembark objectives so the AI can cross water to
// reach land objectives separated from its current landmass. Surface only,
// mirroring the boatActions.ts level guards.
function generateBoatObjectives(context: AiContext, hero: AiHero, start: Position): AiObjective[] {
  if (context.activeLevel !== SURFACE_LEVEL) return [];
  const objectives: AiObjective[] = [];
  const embarked = getHeroAdventureMovementMode(context.boats, hero.id) === "boat";

  if (embarked) {
    const boat = context.boats.find((item) => item.heroId === hero.id);
    for (const target of collectValuableLandTargets(context)) {
      const landing = findLandingForObjective(context, target.position);
      if (!landing) continue;
      const value = target.value * BOAT_VALUE_DISCOUNT;
      if (value <= 0) continue;
      // Already next to the shore: disembark this turn.
      if (ADJACENT(hero.x, hero.y, landing.land.x, landing.land.y)) {
        objectives.push({
          type: "disembark_boat",
          id: `disembark:${target.id}`,
          position: landing.land,
          path: [start],
          pathCost: 0,
          baseValue: value,
          targetPower: 0,
          boatId: boat?.id,
          disembarkPosition: landing.land,
        });
        continue;
      }
      // Otherwise sail toward the water tile next to the shore; disembark next turn.
      const sailPath = findPath(context.map, start, landing.water, hero.movement);
      if (sailPath.length <= 1) continue;
      const pathCost = getAdventurePathCost(context.map, sailPath);
      if (!Number.isFinite(pathCost) || pathCost > hero.movement) continue;
      objectives.push({
        type: "sail",
        id: `sail:${target.id}`,
        position: landing.water,
        path: sailPath,
        pathCost,
        baseValue: value,
        targetPower: 0,
        boatId: boat?.id,
        disembarkPosition: landing.land,
      });
    }
    return objectives;
  }

  // Not embarked: walk to an empty boat only when a worthwhile target sits on a
  // landmass we cannot reach on foot.
  const landReachable = computeLandReachable(context.map, start);
  let bestSeparatedValue = 0;
  for (const target of collectValuableLandTargets(context)) {
    if (landReachable.has(`${target.position.x},${target.position.y}`)) continue;
    bestSeparatedValue = Math.max(bestSeparatedValue, target.value);
  }
  if (bestSeparatedValue <= 0) return objectives;

  for (const boat of context.boats) {
    if (boat.heroId || normalizeMapLevel(boat.mapLevel) !== SURFACE_LEVEL) continue;
    const approach = findPathToAdjacent(context.map, start, { x: boat.x, y: boat.y }, hero.movement);
    if (approach.length < 1) continue;
    const pathCost = getAdventurePathCost(context.map, approach);
    if (!Number.isFinite(pathCost) || pathCost > hero.movement) continue;
    objectives.push({
      type: "embark_boat",
      id: `embark:${boat.id}`,
      position: { x: boat.x, y: boat.y },
      path: approach,
      pathCost,
      baseValue: bestSeparatedValue * BOAT_VALUE_DISCOUNT,
      targetPower: 0,
      boatId: boat.id,
    });
  }

  return objectives;
}

function collectValuableLandTargets(context: AiContext): ValuableLandTarget[] {
  const targets: ValuableLandTarget[] = [];
  for (const row of context.map.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (!object || !isLandTile(tile)) continue;
      if (!context.explored.has(tileKey({ x: tile.x, y: tile.y }))) continue;
      const value = estimateObjectValue(context, object);
      if (value > 0) targets.push({ id: object.id, position: { x: tile.x, y: tile.y }, value });
    }
  }
  return targets;
}

// A land tile adjacent to the objective to disembark onto, plus an adjacent water
// tile to sail to. Never disembarks onto the objective tile itself (which may be
// guarded), only beside it.
function findLandingForObjective(context: AiContext, objectivePos: Position): { land: Position; water: Position } | null {
  for (const [lx, ly] of NEIGHBOR8) {
    const land = { x: objectivePos.x + lx, y: objectivePos.y + ly };
    const landTile = context.map.tiles[land.y]?.[land.x];
    if (!isTileTraversable(landTile) || !isLandTile(landTile)) continue;
    for (const [wx, wy] of NEIGHBOR8) {
      const water = { x: land.x + wx, y: land.y + wy };
      const waterTile = context.map.tiles[water.y]?.[water.x];
      if (isTileTraversable(waterTile) && isWaterTile(waterTile)) return { land, water };
    }
  }
  return null;
}

// Flood-fills the land tiles reachable on foot from `start` (8-directional with
// diagonal corner blocking) to tell whether a target requires a boat.
function computeLandReachable(map: GameMap, start: Position): Set<string> {
  const seen = new Set<string>();
  if (!map.tiles[start.y]?.[start.x]) return seen;
  seen.add(`${start.x},${start.y}`);
  const queue: Position[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dx, dy] of NEIGHBOR8) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      const tile = map.tiles[ny]?.[nx];
      if (!isTileTraversable(tile) || !isLandTile(tile)) continue;
      if (dx !== 0 && dy !== 0 && (!isTileTraversable(map.tiles[current.y]?.[nx]) || !isTileTraversable(map.tiles[ny]?.[current.x]))) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// Annotates a winning combat objective with its expected army-loss ratio/value
// (Lanchester model via estimateAttackLossRatio). No-op for unwinnable or
// non-combat objectives so scoring stays unchanged there.
function attachLoss(
  objective: AiObjective,
  hero: AiHero,
  heroPower: number,
  defender: Parameters<typeof estimateAttackLossRatio>[1] | null,
): AiObjective {
  if (!defender || objective.canAutoWin === false) return objective;
  const ratio = estimateAttackLossRatio(hero, defender);
  objective.expectedLossRatio = ratio;
  objective.expectedLossValue = heroPower * ratio;
  return objective;
}

// How much the AI dislikes army losses, per personality (weights the penalty).
function lossAversion(personality: AiPersonality): number {
  switch (personality) {
    case "AGGRESSIVE": return 0.2;
    case "ECONOMIC": return 0.55;
    case "OPPORTUNIST": return 0.35;
    default: return 0.4;
  }
}

// Loss ratio above which a non-high-value win is rejected as Pyrrhic.
function pyrrhicThreshold(personality: AiPersonality): number {
  switch (personality) {
    case "AGGRESSIVE": return 0.75;
    case "ECONOMIC": return 0.35;
    case "OPPORTUNIST": return 0.55;
    default: return 0.5;
  }
}

// Uses remembered intel to be cautious against a rival that recently beat us, and
// to press an advantage when we clearly outgrow the strongest force we've seen.
function opponentIntelMultiplier(context: AiContext, objective: AiObjective, heroPower: number): number {
  if (objective.type !== "enemy_hero" && objective.type !== "enemy_town") return 1;
  const intel = objective.targetPlayerId ? context.memory.opponentIntel?.[objective.targetPlayerId] : undefined;
  if (!intel) return 1;
  let multiplier = 1;
  const turn = Number(context.game.turnNumber ?? 1);
  if (intel.lostToAtTurn && turn - intel.lostToAtTurn <= 5) multiplier *= 0.5;
  if (heroPower > intel.maxPowerSeen * 1.3) multiplier *= 1.2;
  return multiplier;
}

function getObjectObjective(
  context: AiContext,
  hero: AiHero,
  object: MapObject | undefined,
  position: Position,
  path: Position[],
  pathCost: number,
  start: Position,
  movement: number,
): AiObjective | null {
  if (!object) return null;

  if (object.type === "resource") {
    if (context.collected.has(object.id)) return null;
    const resource = normalizeResource(object.subtype);
    const amount = getResourcePileAmount(object);
    return {
      type: "resource",
      id: object.id,
      position,
      path,
      pathCost,
      baseValue: getResourceValue(resource, amount, context.resourceNeeds),
      targetPower: 0,
      object,
    };
  }

  if (object.type === "building") {
    const ownedBySelf = (context.player.resourceBuildings ?? []).some((building) =>
      building.id === object.id || (building.x === position.x && building.y === position.y)
    );
    if (ownedBySelf) return null;
    const rawGuardianPower = Number(object.guardianPower ?? findVisibleBuildingPower(context, object.id, position) ?? 0);
    const guardStacks = rawGuardianPower > 0 ? createBuildingGuardStacks(object.id, rawGuardianPower) : [];
    const targetPower = rawGuardianPower > 0 ? calculateStacksPower(guardStacks) : 0;
    const buildingType = object.subtype ?? findVisibleBuildingType(context, object.id, position);
    const objectivePath = rawGuardianPower > 0 ? findPathToAdjacent(context.map, start, position, movement) : path;
    const objectivePathCost = rawGuardianPower > 0 ? getAdventurePathCostAvoiding(context.map, objectivePath, [position]) : pathCost;
    if (objectivePath.length < 1 || !Number.isFinite(objectivePathCost) || objectivePathCost > movement) return null;
    const defender = { id: object.id, attack: 1, defense: 1, armies: guardStacks };
    return attachLoss({
      type: "resource_building",
      id: object.id,
      position,
      path: objectivePath,
      pathCost: objectivePathCost,
      baseValue: getResourceBuildingValue(buildingType, context.resourceNeeds),
      targetPower,
      object,
      buildingType,
      guardianPower: rawGuardianPower,
      canAutoWin: rawGuardianPower <= 0 || canAiWinAutoCombat(hero, defender),
    }, hero, calculateHeroPower(hero), rawGuardianPower > 0 ? defender : null);
  }

  if (object.type === "adventure_building") {
    const exhaustion = getAdventureBuildingExhaustion({
      buildingId: object.id,
      subtype: object.subtype,
      playerId: context.player.id,
      selectedHeroId: hero.id,
      turnNumber: Number(context.game.turnNumber ?? 1),
      visitedAdventureBuildings: context.visitedAdventureBuildings,
      playerAdventureVisits: context.playerAdventureVisits,
      heroAdventureVisits: context.heroAdventureVisits,
      weeklyAdventureVisits: context.weeklyAdventureVisits,
      mysticalGardenVisits: context.mysticalGardenVisits,
    });
    if (exhaustion.exhausted) return null;
    if (!canAiUseAdventureBuilding(context, hero, object)) return null;

    const rule = getAdventureBuildingRule(object.subtype);
    const baseValue = getAdventureBuildingBaseValue(object.subtype);
    return {
      type: "adventure_building",
      id: object.id,
      position,
      path,
      pathCost,
      baseValue: baseValue * (rule ? rule.rarity : 1),
      targetPower: 0,
      object,
    };
  }

  if (object.type === "town") {
    if (isTownOwnedByPlayer(context.player, position, object.id)) return null;
    const rawGuardianPower = Number(object.guardianPower ?? 0);
    const guardStacks = rawGuardianPower > 0 ? createBuildingGuardStacks(object.id, rawGuardianPower) : [];
    const defender = { id: object.id, attack: 1, defense: 1, armies: guardStacks };
    return attachLoss({
      type: "neutral_town",
      id: object.targetId ?? object.id,
      position,
      path,
      pathCost,
      baseValue: NEUTRAL_TOWN_BASE_VALUE,
      targetPower: rawGuardianPower,
      object,
    }, hero, calculateHeroPower(hero), rawGuardianPower > 0 ? defender : null);
  }

  if (object.type === "monster") {
    if (context.killedNeutralArmies.has(object.id)) return null;
    const objectivePath = findPathToAdjacent(context.map, start, position, movement);
    const objectivePathCost = getAdventurePathCostAvoiding(context.map, objectivePath, [position]);
    if (objectivePath.length < 1 || !Number.isFinite(objectivePathCost) || objectivePathCost > movement) return null;
    const rawGuardianPower = Number(object.guardianPower ?? 0);
    const guardStacks = createBuildingGuardStacks(object.id, rawGuardianPower);
    const targetPower = calculateStacksPower(guardStacks);
    const defender = { id: object.id, attack: 1, defense: 1, armies: guardStacks };
    return attachLoss({
      type: "neutral_army",
      id: object.id,
      position,
      path: objectivePath,
      pathCost: objectivePathCost,
      baseValue: 500 + rawGuardianPower * 0.45,
      targetPower,
      object,
      guardianPower: rawGuardianPower,
      canAutoWin: canAiWinAutoCombat(hero, defender),
    }, hero, calculateHeroPower(hero), defender);
  }

  return null;
}

function shouldReturnForGarrison(
  context: AiContext,
  hero: AiHero,
  townId: string,
  pickupPower: number,
  heroPower: number,
) {
  if (pickupPower < GARRISON_PICKUP_MIN_POWER) return false;
  const turn = Number(context.game.turnNumber ?? 1);
  const weakHeroBoost = heroPower < 600 && pickupPower >= 120;
  const largeReinforcement = pickupPower >= Math.max(GARRISON_PICKUP_MIN_POWER, heroPower * 0.35);
  const strategicPosture = context.posture === "CONSOLIDATE" || context.posture === "DEFEND";
  const cadence = (turn + stableHash(`${context.game.id}:${hero.id}:${townId}`)) % 4 === 0;
  return weakHeroBoost || largeReinforcement || strategicPosture || cadence;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getAdventureBuildingBaseValue(subtype: string | undefined) {
  if (subtype === "observatory" || subtype === "redwood_observatory") return 1500;
  if (subtype === "obelisk") return 1200;
  if (subtype === "cartographer" || subtype === "library_of_enlightenment") return 1200;
  if (subtype === "stables" || subtype === "magic_well") return 1100;
  if (subtype === "water_mill" || subtype === "water_wheel" || subtype === "abandoned_wagon" || subtype === "crate" || subtype === "skeleton") return 900;
  if (subtype === "campfire" || subtype === "mystical_garden") return 900;
  if (subtype === "temple" || subtype === "fountain_of_fortune" || subtype === "idol_of_fortune" || subtype === "magic_shrine") return 750;
  if (subtype === "warrior_tomb") return 850;
  if (subtype === "cursed_altar") return 700;
  if (subtype === "spell_shrine_1" || subtype === "spell_shrine_2" || subtype === "spell_shrine_3") return 950;
  if (subtype === "tree_of_knowledge") return 1050;
  if (subtype === "seer_hut") return 900;
  if (subtype === "mermaid" || subtype === "buoy") return 700;
  if (subtype === "flotsam" || subtype === "sea_chest") return 850;
  return 650;
}

function canAiUseAdventureBuilding(context: AiContext, hero: AiHero, object: MapObject) {
  const subtype = object.subtype;
  if (isExternalDwellingType(subtype)) return canAiUseExternalDwelling(context, hero, object);
  if (subtype === "magic_well") return needsMana(hero);
  if (subtype === "magic_shrine") return needsMana(hero);
  if (subtype === "library_of_enlightenment") return Number(hero.level ?? 1) >= 10;
  if (subtype === "cartographer") return context.player.gold >= 10000;
  if (subtype === "tree_of_knowledge") return context.player.gold >= 2000;
  if (subtype === "school_of_war" || subtype === "school_of_magic") return context.player.gold >= 1000;
  return true;
}

function canAiUseExternalDwelling(context: AiContext, hero: AiHero, object: MapObject) {
  const externalDwellings = (context.mapState.externalDwellings as ExternalDwellingStateMap | undefined) ?? {};
  const current = normalizeExternalDwellingState(object, externalDwellings[object.id]) ?? createExternalDwellingState(object);
  if (!current || current.available <= 0) return false;

  const unitRule = UNIT_RULES[current.unitType];
  if (!unitRule) return false;
  const recruitCost: ResourceCost = tierForUnit(current.unitType)?.tier === 0 ? {} : unitRule.cost;
  const recruitCount = getAffordableCount(playerResources(context.player), recruitCost, current.available);
  if (recruitCount <= 0) return false;

  const capacity = addUnitsToStacks(
    sortedStacks(hero.armies),
    current.unitType,
    recruitCount,
    unitRule.health,
    (position) => `ai-capacity-check-${object.id}-${position}`,
  );
  return capacity.added > 0;
}

function needsMana(hero: AiHero) {
  const maxMana = Math.max(0, Number(hero.knowledge ?? 0) * 10);
  const currentMana = Number.isFinite(hero.mana) ? Number(hero.mana) : maxMana;
  return currentMana < maxMana;
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

function scoreObjective(
  context: AiContext,
  hero: AiHero,
  role: AiRole,
  objective: AiObjective,
  heroPower: number,
): AiUtilityScore | null {
  if (objective.type === "neutral_army" && objective.targetPower > 0) {
    if (objective.canAutoWin === false) return null;
    if (heroPower < objective.targetPower * getRequiredPowerRatio(context, objective)) return null;
  }
  if (objective.type === "resource_building" && objective.targetPower > 0) {
    if (objective.canAutoWin === false) return null;
  }
  if (objective.type === "gate" && objective.targetPower > 0) {
    if (objective.canAutoWin === false) return null;
    if (heroPower < objective.targetPower * getRequiredPowerRatio(context, objective)) return null;
  }
  if (objective.type === "enemy_hero") {
    if (objective.canAutoWin === false) return null;
    if (heroPower < objective.targetPower * getRequiredPowerRatio(context, objective)) return null;
  }
  if (objective.type === "enemy_town" && objective.targetPower > 0) {
    if (objective.canAutoWin === false) return null;
    if (heroPower < objective.targetPower * getRequiredPowerRatio(context, objective)) return null;
  }

  // Combat conscient des pertes : véto des victoires à la Pyrrhus sur cibles
  // mineures, modulé par la personnalité. Les villes (haute valeur) sont exemptées.
  const lossRatio = objective.expectedLossRatio ?? 0;
  if (lossRatio > 0) {
    const highValue = objective.type === "enemy_town" || objective.type === "neutral_town";
    if (lossRatio > pyrrhicThreshold(context.personality) && !highValue) return null;
  }

  const needMultiplier = getNeedMultiplier(context, objective);
  const objectiveRoleMultiplier = roleMultiplier(role, objective.type);
  const threatPenalty = getThreatPenalty(context, objective.path, heroPower);
  const movementPenalty = objective.pathCost * 0.35;
  const guardianPenalty = Math.max(0, objective.targetPower - heroPower * 0.75) * 0.85;
  const lossPenalty = (objective.expectedLossValue ?? 0) * lossAversion(context.personality);
  const postureExploreBoost = context.posture === "EXPLORE" ? 1.3 : 1;
  const explorationBoost = objective.type === "exploration"
    ? context.profile.explorationWeight * postureExploreBoost
    : 1;
  const aggressionBoost = objective.type === "enemy_hero" || objective.type === "enemy_town" ? context.profile.aggressionWeight : 1;
  const conquestBoost = objective.type === "neutral_town" ? 1.15 : 1;
  const economyBoost = objective.type === "resource" || objective.type === "resource_building"
    ? context.profile.economyWeight
    : 1;
  // Multiplicateur d'opportunité : tout ce qui est proche, battable, et "rapporte" dépasse de loin l'exploration.
  // Sans ça l'IA ignore les mines voisines pour aller scouter au loin (comportement non-organique).
  const opportunityMul = opportunityMultiplier(context, objective, hero, heroPower);
  const intelMultiplier = opponentIntelMultiplier(context, objective, heroPower);
  // Hystérésis : on s'engage sur l'objectif déjà poursuivi plutôt que d'osciller.
  const continuityBonus = context.memory.heroObjectives?.[hero.id] === objective.id ? 1.12 : 1;
  const rawScore = (objective.baseValue * needMultiplier * objectiveRoleMultiplier * explorationBoost * aggressionBoost * conquestBoost * economyBoost * opportunityMul * intelMultiplier * continuityBonus)
    - movementPenalty
    - threatPenalty
    - guardianPenalty
    - lossPenalty;

  // Imprévisibilité déterministe : un léger bruit seedé par (partie, héros, tour,
  // objectif) casse les égalités et le style robotique, sans casser la rejouabilité.
  const jitter = scoringJitter(
    [context.game.id, hero.id, Number(context.game.turnNumber ?? 0), objective.id],
    jitterAmplitude(context.personality),
  );
  const score = rawScore * jitter;

  if (score <= 0) return null;
  return {
    objective,
    role,
    score,
    needMultiplier,
    roleMultiplier: objectiveRoleMultiplier,
    threatPenalty,
    movementPenalty,
    guardianPenalty,
  };
}

// Donne un multiplicateur jusqu'à ~6x pour les captures faciles à portée immédiate.
// Cas spécial : objectif sans combat à portée → multiplicateur massif (free pickup).
// Une mine adjacente non gardée doit toujours battre une exploration lointaine.
function opportunityMultiplier(
  context: AiContext,
  objective: AiObjective,
  hero: AiHero,
  heroPower: number,
): number {
  const graspableTypes = new Set([
    "resource",
    "resource_building",
    "adventure_building",
    "neutral_army",
    "gate",
    "neutral_town",
    "pickup_garrison",
    "level_transition",
  ]);
  if (!graspableTypes.has(objective.type)) return 1;

  const maxMove = Math.max(1, hero.movement);
  const movementRatio = objective.pathCost / maxMove;

  // FREE PICKUP : aucun combat (targetPower === 0) ET atteignable ce tour.
  // Inclut piles de ressources, mines non gardées, bâtiments d'aventure, gates ouverts.
  // Priorité absolue : un héros à côté d'une pile d'or doit toujours la ramasser.
  // On teste le free-pickup AVANT le garde des 0.85 : ramasser du butin gratuit
  // atteignable ce tour vaut toujours le détour, même s'il consomme presque tout
  // le mouvement restant. Sinon un héros qui vient de capturer une mine (mouvement
  // quasi épuisé) laisse les piles d'or voisines au sol pour partir explorer —
  // exactement le comportement non-organique qu'on veut éviter.
  const isFreePickup = objective.targetPower <= 0 && (
    objective.type === "resource" ||
    objective.type === "resource_building" ||
    objective.type === "adventure_building" ||
    objective.type === "gate" ||
    objective.type === "neutral_town" ||
    objective.type === "pickup_garrison"
  );
  if (isFreePickup) {
    // Multiplicateur d'au moins 15 si adjacent (movementRatio ~0), jusqu'à ~25 pour les ressources.
    const proximityFactor = Math.max(0, 1 - movementRatio); // 1.0 si adjacent, jamais négatif
    const freeBonus = 15 + proximityFactor * 10;
    const valueWeight = objective.type === "resource" ? 1.2
      : objective.type === "resource_building" ? 1.3
      : objective.type === "neutral_town" ? 1.4
      : 1;
    return freeBonus * valueWeight;
  }

  // Cibles gardées (combat) : on évite de cramer tout le mouvement pour un assaut
  // sans suite possible ce tour-ci.
  if (movementRatio > 0.85) return 1;

  // Cible gardée : on n'attaque que si on a la puissance requise.
  const requiredRatio = getRequiredPowerRatio(context, objective);
  if (heroPower < objective.targetPower * requiredRatio) return 1;

  const overkill = heroPower / objective.targetPower;
  const proximityFactor = 1 - movementRatio;
  const overkillFactor = Math.min(3, overkill / 2);
  const bonus = proximityFactor * overkillFactor * 1.7;
  const valueWeight = objective.type === "resource_building" ? 1.2
    : objective.type === "neutral_town" ? 1.2
    : 1;
  return 1 + bonus * valueWeight;
}

function getRequiredPowerRatio(context: AiContext, objective: AiObjective) {
  const profileRatio = objective.type === "enemy_hero" || objective.type === "enemy_town"
    ? context.profile.humanPowerRatio
    : context.profile.neutralPowerRatio;
  return Math.max(profileRatio, MINIMUM_AUTO_RESOLVE_ATTACK_RATIO);
}

function getThreatPenalty(context: AiContext, path: Position[], heroPower: number) {
  let penalty = 0;
  for (const threat of context.threats) {
    for (const step of path) {
      const distance = Math.max(Math.abs(threat.position.x - step.x), Math.abs(threat.position.y - step.y));
      if (distance > 3) continue;
      const pressure = Math.max(0, threat.power - heroPower * 0.8);
      penalty += (pressure + threat.power * 0.12) * (4 - distance) * 0.25 * context.profile.threatWeight;
    }
  }
  return penalty;
}

function getNeedMultiplier(context: AiContext, objective: AiObjective) {
  if (objective.type === "resource" && objective.object?.subtype) {
    const resource = normalizeResource(objective.object.subtype);
    return context.resourceNeeds[resource] ? 2.1 : 1;
  }
  if (objective.type === "resource_building" && objective.buildingType) {
    const type = objective.buildingType as ResourceBuildingType;
    if ((type === ResourceBuildingType.SAWMILL && context.resourceNeeds.wood) ||
      (type === ResourceBuildingType.ORE_PIT && context.resourceNeeds.ore) ||
      (type === ResourceBuildingType.GOLD_MINE && context.resourceNeeds.gold) ||
      (type === ResourceBuildingType.ALCHEMIST_LAB && context.resourceNeeds.mercury) ||
      (type === ResourceBuildingType.CRYSTAL_CAVERN && context.resourceNeeds.crystals) ||
      (type === ResourceBuildingType.GEM_POND && context.resourceNeeds.gems) ||
      (type === ResourceBuildingType.SULFUR_DUNE && context.resourceNeeds.sulfur)) {
      return 1.8;
    }
  }
  return 1;
}

function findVisibleBuildingPower(context: AiContext, id: string, position: Position) {
  const building = context.game.players
    .flatMap((player) => player.resourceBuildings ?? [])
    .find((item) => item.id === id || (item.x === position.x && item.y === position.y));
  return building?.guardianPower;
}

function findVisibleBuildingType(context: AiContext, id: string, position: Position) {
  const building = context.game.players
    .flatMap((player) => player.resourceBuildings ?? [])
    .find((item) => item.id === id || (item.x === position.x && item.y === position.y));
  return building?.buildingType;
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

export function objectiveGuardStacks(objective: AiObjective) {
  return createBuildingGuardStacks(objective.id, objective.guardianPower ?? objective.targetPower);
}
