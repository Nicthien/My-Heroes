import {
  findPath,
  findPathToAdjacent,
  getAdventurePathCost,
  getAdventurePathCostAvoiding,
  isTileTraversable,
} from "@/lib/game/engine";
import { getAdventureBuildingRule } from "@/lib/game/adventure-buildings";
import { ResourceBuildingType, type MapObject, type Position, type Resources } from "@/lib/game/types";
import {
  countNewVisibleTiles,
  getResourceBuildingValue,
  getResourcePileAmount,
  getResourceValue,
  hasAdjacentUnexplored,
  isTownOwnedByPlayer,
  tileKey,
} from "./context";
import { calculateHeroPower, calculateStacksPower, createBuildingGuardStacks } from "./combat";
import { roleMultiplier } from "./roles";
import type { AiContext, AiHero, AiObjective, AiRole, AiUtilityScore } from "./types";

export function chooseAiObjective(context: AiContext, hero: AiHero, role: AiRole): AiUtilityScore | null {
  const objectives = generateObjectives(context, hero);
  const heroPower = calculateHeroPower(hero);
  const scored = objectives
    .map((objective) => scoreObjective(context, hero, role, objective, heroPower))
    .filter((score): score is AiUtilityScore => score !== null)
    .sort((a, b) =>
      b.score - a.score ||
      a.objective.pathCost - b.objective.pathCost ||
      a.objective.position.y - b.objective.position.y ||
      a.objective.position.x - b.objective.position.x
    );

  return scored[0] ?? null;
}

function generateObjectives(context: AiContext, hero: AiHero): AiObjective[] {
  const objectives: AiObjective[] = [];
  const start = { x: hero.x, y: hero.y };

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

      const objectObjective = getObjectObjective(context, tile.object, position, path, pathCost, start, hero.movement);
      if (objectObjective) {
        objectives.push(objectObjective);
        continue;
      }

      const revealScore = countNewVisibleTiles(context.map, context.explored, position);
      const frontierBonus = hasAdjacentUnexplored(context.map, context.explored, position) ? 1 : 0;
      if (revealScore <= 0 && frontierBonus <= 0) continue;

      objectives.push({
        type: "exploration",
        id: `explore:${position.x},${position.y}`,
        position,
        path,
        pathCost,
        baseValue: revealScore * 280 + frontierBonus * 450,
        targetPower: 0,
      });
    }
  }

  for (const army of context.game.neutralArmies ?? []) {
    if (army.status !== "ACTIVE" || context.killedNeutralArmies.has(army.id)) continue;
    const position = { x: army.x, y: army.y };
    if (!context.explored.has(tileKey(position))) continue;
    const path = findPathToAdjacent(context.map, start, position, hero.movement);
    const pathCost = getAdventurePathCostAvoiding(context.map, path, [position]);
    if (path.length < 1 || !Number.isFinite(pathCost) || pathCost > hero.movement) continue;
    objectives.push({
      type: "neutral_army",
      id: army.id,
      position,
      path,
      pathCost,
      baseValue: 500 + calculateStacksPower(army.stacks) * 0.45,
      targetPower: calculateStacksPower(army.stacks),
    });
  }

  for (const gate of context.game.gates ?? []) {
    if (gate.gamePlayerId === context.player.id) continue;
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
    objectives.push({
      type: "gate",
      id: gate.id,
      position,
      path: objectivePath,
      pathCost: objectivePathCost,
      baseValue: targetPower > 0 ? 900 + targetPower * 0.5 : 700,
      targetPower,
    });
  }

  for (const opponent of context.visibleOpponents) {
    for (const target of opponent.heroes ?? []) {
      const position = { x: target.x, y: target.y };
      const path = findPathToAdjacent(context.map, start, position, hero.movement);
      const pathCost = getAdventurePathCostAvoiding(context.map, path, [position]);
      if (path.length < 1 || !Number.isFinite(pathCost) || pathCost > hero.movement) continue;
      const targetPower = calculateHeroPower(target);
      objectives.push({
        type: "enemy_hero",
        id: target.id,
        position,
        path,
        pathCost,
        baseValue: 650 + targetPower * 0.85,
        targetPower,
        targetPlayerId: opponent.id,
        targetHeroId: target.id,
      });
    }
  }

  return objectives;
}

function getObjectObjective(
  context: AiContext,
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
    const targetPower = Number(object.guardianPower ?? findVisibleBuildingPower(context, object.id, position) ?? 0);
    const buildingType = object.subtype ?? findVisibleBuildingType(context, object.id, position);
    const objectivePath = targetPower > 0 ? findPathToAdjacent(context.map, start, position, movement) : path;
    const objectivePathCost = targetPower > 0 ? getAdventurePathCostAvoiding(context.map, objectivePath, [position]) : pathCost;
    if (objectivePath.length < 1 || !Number.isFinite(objectivePathCost) || objectivePathCost > movement) return null;
    return {
      type: "resource_building",
      id: object.id,
      position,
      path: objectivePath,
      pathCost: objectivePathCost,
      baseValue: getResourceBuildingValue(buildingType, context.resourceNeeds),
      targetPower,
      object,
      buildingType,
    };
  }

  if (object.type === "adventure_building") {
    if (object.subtype === "campfire" && context.visitedAdventureBuildings.has(object.id)) return null;
    if ((context.playerAdventureVisits[context.player.id] ?? []).includes(object.id)) return null;
    const rule = getAdventureBuildingRule(object.subtype);
    const baseValue = object.subtype === "observatory" ? 1500 : object.subtype === "campfire" ? 900 : 650;
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
    return {
      type: "neutral_town",
      id: object.targetId ?? object.id,
      position,
      path,
      pathCost,
      baseValue: 2200,
      targetPower: Number(object.guardianPower ?? 0),
      object,
    };
  }

  if (object.type === "monster") {
    if (context.killedNeutralArmies.has(object.id)) return null;
    const objectivePath = findPathToAdjacent(context.map, start, position, movement);
    const objectivePathCost = getAdventurePathCostAvoiding(context.map, objectivePath, [position]);
    if (objectivePath.length < 1 || !Number.isFinite(objectivePathCost) || objectivePathCost > movement) return null;
    return {
      type: "neutral_army",
      id: object.id,
      position,
      path: objectivePath,
      pathCost: objectivePathCost,
      baseValue: 500 + Number(object.guardianPower ?? 0) * 0.45,
      targetPower: Number(object.guardianPower ?? 0),
      object,
    };
  }

  return null;
}

function scoreObjective(
  context: AiContext,
  hero: AiHero,
  role: AiRole,
  objective: AiObjective,
  heroPower: number,
): AiUtilityScore | null {
  if (objective.type === "neutral_army" && objective.targetPower > 0) {
    if (heroPower < objective.targetPower * context.profile.neutralPowerRatio) return null;
  }
  if (objective.type === "resource_building" && objective.targetPower > 0) {
    if (heroPower < objective.targetPower * context.profile.neutralPowerRatio) return null;
  }
  if (objective.type === "gate" && objective.targetPower > 0) {
    if (heroPower < objective.targetPower * context.profile.neutralPowerRatio) return null;
  }
  if (objective.type === "enemy_hero") {
    if (heroPower < objective.targetPower * context.profile.humanPowerRatio) return null;
  }

  const needMultiplier = getNeedMultiplier(context, objective);
  const objectiveRoleMultiplier = roleMultiplier(role, objective.type);
  const threatPenalty = getThreatPenalty(context, objective.path, heroPower);
  const movementPenalty = objective.pathCost * 0.35;
  const guardianPenalty = Math.max(0, objective.targetPower - heroPower * 0.75) * 0.85;
  const explorationBoost = objective.type === "exploration" ? context.profile.explorationWeight : 1;
  const aggressionBoost = objective.type === "enemy_hero" ? context.profile.aggressionWeight : 1;
  const economyBoost = objective.type === "resource" || objective.type === "resource_building" ? context.profile.economyWeight : 1;
  const score = objective.baseValue * needMultiplier * objectiveRoleMultiplier * explorationBoost * aggressionBoost * economyBoost
    - movementPenalty
    - threatPenalty
    - guardianPenalty;

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
  return createBuildingGuardStacks(objective.id, objective.targetPower);
}
