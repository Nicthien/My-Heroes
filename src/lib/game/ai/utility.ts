import {
  findPath,
  findPathToAdjacent,
  getAdventurePathCost,
  getAdventurePathCostAvoiding,
  isTileTraversable,
} from "@/lib/game/engine";
import { getAdventureBuildingExhaustion, getAdventureBuildingRule } from "@/lib/game/adventure-buildings";
import { addUnitsToStacks, sortedStacks } from "@/lib/game/army-stacks";
import { tierForUnit, UNIT_RULES, type ResourceCost } from "@/lib/game/economy";
import { createExternalDwellingState, isExternalDwellingType, normalizeExternalDwellingState, type ExternalDwellingStateMap } from "@/lib/game/external-dwellings";
import { ResourceBuildingType, type MapObject, type Position, type Resources } from "@/lib/game/types";
import {
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
import { calculateHeroPower, calculateStacksPower, canAiWinAutoCombat, createBuildingGuardStacks } from "./combat";
import { roleMultiplier } from "./roles";
import { getGarrisonPickupStacks } from "./strategy/army-transfers";
import { generateDefenseObjectives } from "./strategy/defense";
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
      a.objective.position.y - b.objective.position.y ||
      a.objective.position.x - b.objective.position.x
    );

  return scored[0] ?? null;
}

function generateObjectives(context: AiContext, hero: AiHero): AiObjective[] {
  const objectives: AiObjective[] = [];
  const start = { x: hero.x, y: hero.y };
  const heroPower = calculateHeroPower(hero);

  for (const town of context.player.towns ?? []) {
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
    const position = { x: army.x, y: army.y };
    if (!context.explored.has(tileKey(position))) continue;
    const path = findPathToAdjacent(context.map, start, position, hero.movement);
    const pathCost = getAdventurePathCostAvoiding(context.map, path, [position]);
    if (path.length < 1 || !Number.isFinite(pathCost) || pathCost > hero.movement) continue;
    const targetPower = calculateStacksPower(army.stacks);
    objectives.push({
      type: "neutral_army",
      id: army.id,
      position,
      path,
      pathCost,
      baseValue: 500 + targetPower * 0.45,
      targetPower,
      canAutoWin: canAiWinAutoCombat(hero, {
        id: army.id,
        attack: 1,
        defense: 1,
        armies: army.stacks,
      }),
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
      canAutoWin: targetPower <= 0 || canAiWinAutoCombat(hero, {
        id: gate.id,
        attack: 1,
        defense: 1,
        armies: stacks,
      }),
    });
  }

  for (const opponent of context.visibleOpponents) {
    for (const target of opponent.heroes ?? []) {
      const position = { x: target.x, y: target.y };
      const path = findPathToAdjacent(context.map, start, position, hero.movement);
      const pathCost = getAdventurePathCostAvoiding(context.map, path, [position]);
      if (path.length < 1 || !Number.isFinite(pathCost) || pathCost > hero.movement) continue;
      const targetPower = calculateHeroPower(target);
      const isPrimary = context.memory.primaryEnemyId === opponent.id;
      objectives.push({
        type: "enemy_hero",
        id: target.id,
        position,
        path,
        pathCost,
        baseValue: (650 + targetPower * 0.85) * (isPrimary ? 1.3 : 1),
        targetPower,
        targetPlayerId: opponent.id,
        targetHeroId: target.id,
        canAutoWin: canAiWinAutoCombat(hero, {
          id: target.id,
          attack: target.attack,
          defense: target.defense,
          morale: target.morale,
          luck: target.luck,
          armies: target.armies,
        }),
      });
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
      objectives.push({
        type: "enemy_town",
        id: town.id,
        position,
        path,
        pathCost,
        baseValue: (2400 + garrisonPower * 0.5) * (isPrimary ? 1.4 : 1),
        targetPower: garrisonPower,
        targetPlayerId: opponent.id,
        targetTownId: town.id,
        canAutoWin: garrisonPower <= 0 || canAiWinAutoCombat(hero, {
          id: town.id,
          attack: 1,
          defense: 1,
          armies: town.garrison ?? [],
        }),
      });
    }
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
      guardianPower: rawGuardianPower,
      canAutoWin: rawGuardianPower <= 0 || canAiWinAutoCombat(hero, {
        id: object.id,
        attack: 1,
        defense: 1,
        armies: guardStacks,
      }),
    };
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
    return {
      type: "neutral_town",
      id: object.targetId ?? object.id,
      position,
      path,
      pathCost,
      baseValue: NEUTRAL_TOWN_BASE_VALUE,
      targetPower: Number(object.guardianPower ?? 0),
      object,
    };
  }

  if (object.type === "monster") {
    if (context.killedNeutralArmies.has(object.id)) return null;
    const objectivePath = findPathToAdjacent(context.map, start, position, movement);
    const objectivePathCost = getAdventurePathCostAvoiding(context.map, objectivePath, [position]);
    if (objectivePath.length < 1 || !Number.isFinite(objectivePathCost) || objectivePathCost > movement) return null;
    const rawGuardianPower = Number(object.guardianPower ?? 0);
    const guardStacks = createBuildingGuardStacks(object.id, rawGuardianPower);
    const targetPower = calculateStacksPower(guardStacks);
    return {
      type: "neutral_army",
      id: object.id,
      position,
      path: objectivePath,
      pathCost: objectivePathCost,
      baseValue: 500 + rawGuardianPower * 0.45,
      targetPower,
      object,
      guardianPower: rawGuardianPower,
      canAutoWin: canAiWinAutoCombat(hero, {
        id: object.id,
        attack: 1,
        defense: 1,
        armies: guardStacks,
      }),
    };
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

  const needMultiplier = getNeedMultiplier(context, objective);
  const objectiveRoleMultiplier = roleMultiplier(role, objective.type);
  const threatPenalty = getThreatPenalty(context, objective.path, heroPower);
  const movementPenalty = objective.pathCost * 0.35;
  const guardianPenalty = Math.max(0, objective.targetPower - heroPower * 0.75) * 0.85;
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
  const score = objective.baseValue * needMultiplier * objectiveRoleMultiplier * explorationBoost * aggressionBoost * conquestBoost * economyBoost * opportunityMul
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
  ]);
  if (!graspableTypes.has(objective.type)) return 1;

  const maxMove = Math.max(1, hero.movement);
  const movementRatio = objective.pathCost / maxMove;
  if (movementRatio > 0.85) return 1;

  // FREE PICKUP : aucun combat (targetPower === 0) ET atteignable ce tour.
  // Inclut piles de ressources, mines non gardées, bâtiments d'aventure, gates ouverts.
  // Priorité absolue : un héros à côté d'une pile d'or doit toujours la ramasser.
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
    const proximityFactor = 1 - movementRatio; // 1.0 si adjacent
    const freeBonus = 15 + proximityFactor * 10;
    const valueWeight = objective.type === "resource" ? 1.2
      : objective.type === "resource_building" ? 1.3
      : objective.type === "neutral_town" ? 1.4
      : 1;
    return freeBonus * valueWeight;
  }

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
