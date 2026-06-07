import assert from "node:assert/strict";
import { applyLossesToArmies, autoResolveCombat } from "../src/lib/game/combat/autoResolve";
import { buildConcessionBoardState, findNextPrimaryParticipant, getHeroCombatUnits, sideHasActivePlayerUnits } from "../src/lib/game/combat/concession";
import { buildCombatEnvironment } from "../src/lib/game/combat/environment";
import { findHexPath, getBlockedCombatCells, getOccupiedCombatCells, getReachableCombatCells } from "../src/lib/game/combat/movement";
import { buildTurnQueue, createCombatBoard, executeManualCombatAction } from "../src/lib/game/combat/persistent";
import { applyTowerVolleyInRound, createCastleSiegeState, damageSiegeWithCatapult, filterSiegeTerrain, isGateEffectivelyOpen } from "../src/lib/game/combat/siege";
import { computeSurrenderGoldCost } from "../src/lib/game/combat/surrender";
import { executeCombatSpell, hasHeroCastCombatSpell, markHeroCombatSpellCast } from "../src/lib/game/combat/spells";
import { findActiveCombatTruce, hasPlayerUsedTruce } from "../src/lib/game/combat/truce";
import {
  applyDamageToStack,
  calculateCombatDamageRange,
  getAttackDefenseMultiplier,
  rollCombatDamage,
} from "../src/lib/game/combat/rules";
import { getTownWeeklyGrowth } from "../src/lib/game/economy";
import { SPELLS_BY_ID, calculateSpellDamage, getHeroMaxMana } from "../src/lib/game/spells";
import { BuildingType, CombatBoardUnit, CombatTruce, Faction, GameMap, TerrainType, UnitType } from "../src/lib/game/types";

function unit(params: Partial<CombatBoardUnit> & Pick<CombatBoardUnit, "id" | "unitType" | "side" | "q" | "r">): CombatBoardUnit {
  const count = params.count ?? 10;
  const maxHealth = params.maxHealth ?? 10;
  return {
    count,
    health: params.health ?? count * maxHealth,
    maxHealth,
    position: params.position ?? 0,
    ownerPlayerId: params.ownerPlayerId ?? (params.side === "attacker" ? "p1" : "p2"),
    heroId: null,
    participantId: null,
    joinsRound: params.joinsRound ?? 1,
    speed: params.speed ?? 5,
    minDamage: params.minDamage ?? 2,
    maxDamage: params.maxDamage ?? 4,
    ranged: params.ranged ?? false,
    shots: params.shots ?? 0,
    hasRetaliated: params.hasRetaliated ?? false,
    defended: params.defended ?? false,
    waited: params.waited ?? false,
    morale: params.morale ?? 0,
    moraleApplied: params.moraleApplied ?? false,
    moraleBonus: params.moraleBonus ?? false,
    luck: params.luck ?? 0,
    luckTriggered: params.luckTriggered ?? false,
    ...params,
  };
}

function stats(attack = 0, defense = 0) {
  return { attack, defense };
}

function testCombatEnvironmentUsesBuildingTileTerrain() {
  const map: GameMap = {
    width: 1,
    height: 1,
    tiles: [[{
      x: 0,
      y: 0,
      terrain: TerrainType.GRASS,
      elevation: 0,
      isPassable: true,
      movementCost: 100,
      object: {
        id: "sawmill-1",
        type: "building",
        subtype: "sawmill",
      },
    }]],
  };

  const environment = buildCombatEnvironment(map, { x: 0, y: 0 });
  assert.equal(environment.terrain, TerrainType.GRASS);
  assert.equal(environment.theme, "grass");
}

function testCombatEnvironmentKeepsSnowOnRoadNearWater() {
  const makeTile = (x: number, y: number, terrain: TerrainType) => ({
    x,
    y,
    terrain,
    elevation: 0,
    isPassable: terrain !== TerrainType.WATER,
    movementCost: terrain === TerrainType.WATER ? 999 : 100,
  });
  const map: GameMap = {
    width: 3,
    height: 3,
    tiles: [
      [makeTile(0, 0, TerrainType.GRASS), makeTile(1, 0, TerrainType.GRASS), makeTile(2, 0, TerrainType.GRASS)],
      [makeTile(0, 1, TerrainType.GRASS), { ...makeTile(1, 1, TerrainType.SNOW), road: "dirt" }, makeTile(2, 1, TerrainType.WATER)],
      [makeTile(0, 2, TerrainType.GRASS), makeTile(1, 2, TerrainType.GRASS), makeTile(2, 2, TerrainType.GRASS)],
    ],
  };

  const environment = buildCombatEnvironment(map, { x: 1, y: 1 });
  assert.equal(environment.terrain, TerrainType.SNOW);
  assert.equal(environment.road, "dirt");
  assert.equal(environment.hasNearbyWater, true);
  assert.equal(environment.theme, "snow");
}

function testCombatBoardAddsOrganicBlockingTerrain() {
  const randomValues = [
    0.2, 0.1, 0.1, 0.5,
    0.7, 0.4, 0.4, 0.2,
    0.5,
    0.0, 0.0, 0.0,
    0.3, 0.3, 0.3,
    0.6, 0.6, 0.6,
    0.9, 0.9, 0.9,
  ];
  let randomIndex = 0;
  const originalRandom = Math.random;
  Math.random = () => randomValues[randomIndex++ % randomValues.length] ?? 0.5;
  try {
    const board = createCombatBoard(
      {
        id: "attacker",
        playerId: "p1",
        attack: 0,
        defense: 0,
        armies: [{ id: "a", unitType: UnitType.PIKEMAN, count: 1, health: 10, maxHealth: 10, position: 0 }],
      },
      {
        id: "defender",
        playerId: null,
        attack: 0,
        defense: 0,
        armies: [{ id: "d", unitType: UnitType.PIKEMAN, count: 1, health: 10, maxHealth: 10, position: 0 }],
      },
      { environment: { terrain: TerrainType.GRASS, elevation: 0, nearbyTerrains: {}, hasNearbyWater: false, hasNearbyForest: false, hasNearbyMountain: false, theme: "grass" } },
    );
    assert.ok(board.boardState.terrain.some((feature) => feature.type !== "rock" && feature.type !== "water"));
  } finally {
    Math.random = originalRandom;
  }
}

function testSnowCombatBoardAddsVisibleBlockingTerrain() {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const board = createCombatBoard(
      {
        id: "attacker",
        playerId: "p1",
        attack: 0,
        defense: 0,
        armies: [{ id: "a", unitType: UnitType.PIKEMAN, count: 1, health: 10, maxHealth: 10, position: 0 }],
      },
      {
        id: "defender",
        playerId: null,
        attack: 0,
        defense: 0,
        armies: [{ id: "d", unitType: UnitType.PIKEMAN, count: 1, health: 10, maxHealth: 10, position: 0 }],
      },
      { environment: { terrain: TerrainType.SNOW, elevation: 0, road: "dirt", nearbyTerrains: { [TerrainType.WATER]: 1 }, hasNearbyWater: true, hasNearbyForest: false, hasNearbyMountain: false, theme: "snow" } },
    );
    assert.ok(board.boardState.terrain.some((feature) => feature.type !== "rock" && feature.type !== "water"));
  } finally {
    Math.random = originalRandom;
  }
}

function testPositiveMoraleGrantsOnlyOneBonusAction() {
  const griffin = unit({
    id: "griffin",
    unitType: UnitType.GRIFFIN,
    side: "attacker",
    q: 5,
    r: 1,
    count: 4,
    health: 100,
    maxHealth: 25,
    morale: 3,
  });
  const pikeman = unit({
    id: "pikeman",
    unitType: UnitType.PIKEMAN,
    side: "defender",
    q: 6,
    r: 1,
    count: 50,
    health: 500,
    maxHealth: 10,
  });
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const first = executeManualCombatAction({
      units: [griffin, pikeman],
      turnQueue: ["griffin", "pikeman"],
      round: 1,
      currentUnitId: "griffin",
      action: { type: "ATTACK", targetUnitId: "pikeman" },
      attackerStats: stats(),
      defenderStats: stats(),
    });
    assert.equal(first.currentUnitId, "griffin");
    assert.equal(first.units.find((item) => item.id === "griffin")?.moraleApplied, true);
    assert.equal(first.units.find((item) => item.id === "griffin")?.moraleBonus, false);
    assert.equal(first.units.find((item) => item.id === "griffin")?.moraleTriggered, "good");
    assert.ok(first.log.some((line) => line.includes("moral positif")));

    const second = executeManualCombatAction({
      units: first.units,
      turnQueue: first.turnQueue,
      round: first.round,
      currentUnitId: first.currentUnitId,
      action: { type: "ATTACK", targetUnitId: "pikeman" },
      attackerStats: stats(),
      defenderStats: stats(),
    });
    assert.equal(second.currentUnitId, "pikeman");
    assert.equal(second.units.find((item) => item.id === "griffin")?.moraleTriggered, undefined);
    assert.equal(second.log.some((line) => line.includes("moral positif")), false);
  } finally {
    Math.random = originalRandom;
  }
}

function testInitiativeOrder() {
  const units = [
    unit({ id: "slow-attacker", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, speed: 4, position: 1 }),
    unit({ id: "fast-defender", unitType: UnitType.PIKEMAN, side: "defender", q: 8, r: 1, speed: 7, position: 0 }),
    unit({ id: "tie-attacker", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 2, speed: 5, position: 2 }),
    unit({ id: "tie-defender", unitType: UnitType.PIKEMAN, side: "defender", q: 8, r: 2, speed: 5, position: 1 }),
  ];
  assert.deepEqual(buildTurnQueue(units, 1), ["fast-defender", "tie-attacker", "tie-defender", "slow-attacker"]);
}

function testWaitAndDefendTiming() {
  const units = [
    unit({ id: "a", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, speed: 7 }),
    unit({ id: "b", unitType: UnitType.PIKEMAN, side: "defender", q: 8, r: 1, speed: 6 }),
    unit({ id: "c", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 2, speed: 5 }),
  ];
  const queue = buildTurnQueue(units, 1);
  const afterWait = executeManualCombatAction({
    units,
    turnQueue: queue,
    round: 1,
    currentUnitId: "a",
    action: { type: "WAIT" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  assert.equal(afterWait.currentUnitId, "b");
  assert.deepEqual(afterWait.turnQueue, ["b", "c", "a"]);
  assert.equal(afterWait.units.find((item) => item.id === "a")?.waited, true);

  const afterDefend = executeManualCombatAction({
    units: afterWait.units,
    turnQueue: afterWait.turnQueue,
    round: afterWait.round,
    currentUnitId: "b",
    action: { type: "DEFEND" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  assert.equal(afterDefend.units.find((item) => item.id === "b")?.defended, true);

  const afterC = executeManualCombatAction({
    units: afterDefend.units,
    turnQueue: afterDefend.turnQueue,
    round: afterDefend.round,
    currentUnitId: "c",
    action: { type: "DEFEND" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  assert.equal(afterC.currentUnitId, "a");
  assert.equal(afterC.units.find((item) => item.id === "b")?.defended, true);

  const secondWait = executeManualCombatAction({
    units: afterC.units,
    turnQueue: afterC.turnQueue,
    round: afterC.round,
    currentUnitId: "a",
    action: { type: "WAIT" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  assert.equal(secondWait.currentUnitId, "a");
  assert.deepEqual(secondWait.log, ["Action impossible."]);
}

function testDamageFormulaCapsAndPartials() {
  const attacker = unit({ id: "attacker", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, minDamage: 10, maxDamage: 10 });
  const defender = unit({ id: "defender", unitType: UnitType.PIKEMAN, side: "defender", q: 2, r: 1, health: 35, maxHealth: 10 });

  assert.equal(getAttackDefenseMultiplier(attacker, defender, stats(100, 0), stats(0, 0)), 5);
  assert.equal(getAttackDefenseMultiplier(attacker, defender, stats(0, 0), stats(0, 100)), 0.3);

  const roll = rollCombatDamage({
    attacker,
    defender,
    attackerStats: stats(1, 0),
    defenderStats: stats(),
    actionType: "ATTACK",
    random: () => 0,
  });
  assert.equal(roll.damage, 100);

  const target = unit({ id: "partial", unitType: UnitType.PIKEMAN, side: "defender", q: 2, r: 1, count: 4, health: 35, maxHealth: 10 });
  const first = applyDamageToStack(target, 6);
  assert.equal(first.lost, 1);
  assert.equal(target.health, 29);
  assert.equal(target.count, 3);
  const second = applyDamageToStack(target, 9);
  assert.equal(second.lost, 1);
  assert.equal(target.health, 20);
  assert.equal(target.count, 2);
}

function testRetaliationOnce() {
  const units = [
    unit({ id: "a1", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, count: 20, health: 200 }),
    unit({ id: "a2", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 2, count: 20, health: 200 }),
    unit({ id: "d", unitType: UnitType.PIKEMAN, side: "defender", q: 2, r: 1, count: 20, health: 200 }),
  ];
  const first = executeManualCombatAction({
    units,
    turnQueue: ["a1", "a2", "d"],
    round: 1,
    currentUnitId: "a1",
    action: { type: "ATTACK", targetUnitId: "d" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  const a1Health = first.units.find((item) => item.id === "a1")?.health ?? 0;
  assert.ok(a1Health < 200);
  assert.equal(first.units.find((item) => item.id === "d")?.hasRetaliated, true);

  const second = executeManualCombatAction({
    units: first.units,
    turnQueue: first.turnQueue,
    round: first.round,
    currentUnitId: "a2",
    action: { type: "ATTACK", targetUnitId: "d" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  assert.equal(second.units.find((item) => item.id === "a2")?.health, 200);
}

function testRangedRestrictionsAndPenalties() {
  const shooter = unit({
    id: "shooter",
    unitType: UnitType.ARCHER,
    side: "attacker",
    q: 1,
    r: 1,
    ranged: true,
    shots: 12,
    minDamage: 10,
    maxDamage: 10,
  });
  const adjacentEnemy = unit({ id: "adjacent", unitType: UnitType.PIKEMAN, side: "defender", q: 2, r: 1 });
  const farEnemy = unit({ id: "far", unitType: UnitType.PIKEMAN, side: "defender", q: 10, r: 1 });

  const blockedShot = executeManualCombatAction({
    units: [shooter, adjacentEnemy, farEnemy],
    turnQueue: ["shooter"],
    round: 1,
    currentUnitId: "shooter",
    action: { type: "SHOOT", targetUnitId: "far" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  assert.deepEqual(blockedShot.log, ["Action impossible."]);

  const meleeRange = calculateCombatDamageRange({
    attacker: shooter,
    defender: adjacentEnemy,
    attackerStats: stats(),
    defenderStats: stats(),
    actionType: "ATTACK",
  });
  assert.equal(meleeRange.profile.damagePenalty, 0.5);

  const longRange = calculateCombatDamageRange({
    attacker: shooter,
    defender: farEnemy,
    attackerStats: stats(),
    defenderStats: stats(),
    actionType: "SHOOT",
  });
  assert.equal(longRange.profile.damagePenalty, 0.5);

  const obstacle = calculateCombatDamageRange({
    attacker: shooter,
    defender: unit({ id: "mid", unitType: UnitType.PIKEMAN, side: "defender", q: 5, r: 1 }),
    attackerStats: stats(),
    defenderStats: stats(),
    actionType: "SHOOT",
    terrain: [{ type: "rock", q: 3, r: 1 }],
  });
  assert.equal(obstacle.profile.damagePenalty, 0.5);
}

function testMoveAndMeleeAttack() {
  const units = [
    unit({ id: "charger", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, speed: 4, minDamage: 10, maxDamage: 10 }),
    unit({ id: "target", unitType: UnitType.PIKEMAN, side: "defender", q: 4, r: 1, health: 100, maxHealth: 10 }),
  ];

  const result = executeManualCombatAction({
    units,
    turnQueue: ["charger", "target"],
    round: 1,
    currentUnitId: "charger",
    action: { type: "ATTACK", targetUnitId: "target" },
    attackerStats: stats(),
    defenderStats: stats(),
  });

  const charger = result.units.find((item) => item.id === "charger");
  const target = result.units.find((item) => item.id === "target");
  assert.deepEqual({ q: charger?.q, r: charger?.r }, { q: 3, r: 1 });
  assert.ok((target?.health ?? 100) < 100);
  assert.equal(result.currentUnitId, "target");
}

function testBlockedMoveAndMeleeAttack() {
  const units = [
    unit({ id: "charger", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 4, speed: 10 }),
    unit({ id: "target", unitType: UnitType.PIKEMAN, side: "defender", q: 4, r: 4 }),
  ];
  const terrain = [
    { type: "rock" as const, q: 5, r: 4 },
    { type: "rock" as const, q: 3, r: 4 },
    { type: "rock" as const, q: 4, r: 3 },
    { type: "rock" as const, q: 3, r: 3 },
    { type: "rock" as const, q: 4, r: 5 },
    { type: "rock" as const, q: 3, r: 5 },
  ];

  const result = executeManualCombatAction({
    units,
    terrain,
    turnQueue: ["charger", "target"],
    round: 1,
    currentUnitId: "charger",
    action: { type: "ATTACK", targetUnitId: "target" },
    attackerStats: stats(),
    defenderStats: stats(),
  });

  assert.deepEqual(result.log, ["Action impossible."]);
  assert.deepEqual(result.units.find((item) => item.id === "charger"), units[0]);
}

function testRangedShotAndMoveMeleeAttack() {
  const shooter = unit({
    id: "shooter",
    unitType: UnitType.ARCHER,
    side: "attacker",
    q: 1,
    r: 1,
    speed: 4,
    ranged: true,
    shots: 3,
    minDamage: 10,
    maxDamage: 10,
  });
  const target = unit({ id: "target", unitType: UnitType.PIKEMAN, side: "defender", q: 4, r: 1, health: 100, maxHealth: 10 });

  const shot = executeManualCombatAction({
    units: [shooter, target],
    turnQueue: ["shooter", "target"],
    round: 1,
    currentUnitId: "shooter",
    action: { type: "SHOOT", targetUnitId: "target" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  assert.deepEqual({ q: shot.units.find((item) => item.id === "shooter")?.q, r: shot.units.find((item) => item.id === "shooter")?.r }, { q: 1, r: 1 });
  assert.equal(shot.units.find((item) => item.id === "shooter")?.shots, 2);

  const melee = executeManualCombatAction({
    units: [shooter, target],
    turnQueue: ["shooter", "target"],
    round: 1,
    currentUnitId: "shooter",
    action: { type: "ATTACK", targetUnitId: "target" },
    attackerStats: stats(),
    defenderStats: stats(),
  });
  assert.deepEqual({ q: melee.units.find((item) => item.id === "shooter")?.q, r: melee.units.find((item) => item.id === "shooter")?.r }, { q: 3, r: 1 });
  assert.equal(melee.units.find((item) => item.id === "shooter")?.shots, 3);
  assert.ok(melee.log.some((line) => line.toLowerCase().includes("corps-a-corps")));
}

function testFlyingUnitsCrossBlockingTerrain() {
  const flyer = unit({ id: "flyer", unitType: UnitType.GRIFFIN, side: "attacker", q: 1, r: 1, speed: 2 });
  const walker = unit({ id: "walker", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, speed: 2 });
  const terrain = [
    { type: "rock" as const, q: 2, r: 1 },
    { type: "rock" as const, q: 2, r: 0 },
    { type: "rock" as const, q: 2, r: 2 },
  ];
  const destination = { q: 3, r: 1 };
  const blocked = getBlockedCombatCells(terrain);
  const occupied = getOccupiedCombatCells([flyer], flyer.id);

  assert.equal(findHexPath(flyer, destination, occupied, blocked).length, 3);
  assert.ok(findHexPath(walker, destination, occupied, blocked).length > walker.speed + 1);
  assert.ok(getReachableCombatCells(flyer, [flyer], terrain).some((cell) => cell.q === destination.q && cell.r === destination.r));
  assert.ok(!getReachableCombatCells(walker, [walker], terrain).some((cell) => cell.q === destination.q && cell.r === destination.r));
  assert.ok(!getReachableCombatCells(flyer, [flyer], terrain).some((cell) => cell.q === 2 && cell.r === 1));
}

function testSiegeWallsGateAndFlyers() {
  const siege = createCastleSiegeState({ towerCount: 3, towerDamage: 30 });
  const walker = unit({ id: "walker", unitType: UnitType.PIKEMAN, side: "attacker", q: 6, r: 2, speed: 8 });
  const flyer = unit({ id: "flyer", unitType: UnitType.GRIFFIN, side: "attacker", q: 6, r: 2, speed: 8 });

  assert.ok(!getReachableCombatCells(walker, [walker], [], siege).some((cell) => cell.q === 9 && cell.r === 2));
  assert.ok(getReachableCombatCells(flyer, [flyer], [], siege).some((cell) => cell.q === 9 && cell.r === 2));
  assert.ok(!getReachableCombatCells(flyer, [flyer], [], siege).some((cell) => cell.q === 8 && cell.r === 2));

  const damagedWallSiege = { ...siege, walls: siege.walls.map((wall) => wall.id === "wall-mid-upper" ? { ...wall, hp: 1 as const } : wall) };
  assert.ok(!getReachableCombatCells(walker, [walker], [], damagedWallSiege).some((cell) => cell.q === 10 && cell.r === 2));

  const brokenWallSiege = { ...siege, walls: siege.walls.map((wall) => wall.id === "wall-mid-upper" ? { ...wall, hp: 0 as const } : wall) };
  assert.ok(getReachableCombatCells(walker, [walker], [], brokenWallSiege).some((cell) => cell.q === 9 && cell.r === 2));
}

function testSiegeGateRules() {
  const siege = createCastleSiegeState({ towerCount: 3, towerDamage: 30 });
  const attacker = unit({ id: "attacker", unitType: UnitType.PIKEMAN, side: "attacker", q: 6, r: 4, speed: 5 });
  const defender = unit({ id: "defender", unitType: UnitType.PIKEMAN, side: "defender", q: 10, r: 4, speed: 5 });

  assert.ok(!getReachableCombatCells(attacker, [attacker], [], siege).some((cell) => cell.q === 9 && cell.r === 4));
  assert.ok(getReachableCombatCells(defender, [defender], [], siege).some((cell) => cell.q === 8 && cell.r === 4));

  const damagedGateSiege = { ...siege, gate: { ...siege.gate, hp: 1 as const } };
  assert.ok(!getReachableCombatCells(attacker, [attacker], [], damagedGateSiege).some((cell) => cell.q === 9 && cell.r === 4));

  const brokenGateSiege = { ...siege, gate: { ...siege.gate, hp: 0 as const } };
  assert.ok(getReachableCombatCells(attacker, [attacker], [], brokenGateSiege).some((cell) => cell.q === 9 && cell.r === 4));

  const unitOnGate = unit({ id: "gate-blocker", unitType: UnitType.PIKEMAN, side: "defender", q: 8, r: 4, speed: 5 });
  assert.equal(isGateEffectivelyOpen(siege, [attacker, unitOnGate]), true);
}

function testSiegeMoatStopsGroundOnly() {
  const siege = createCastleSiegeState({ towerCount: 0, towerDamage: 0 });
  const openSiege = {
    ...siege,
    gate: { ...siege.gate, hp: 0 as const },
    walls: siege.walls.map((wall) => ({ ...wall, hp: 0 as const })),
  };
  const walker = unit({ id: "walker", unitType: UnitType.PIKEMAN, side: "attacker", q: 6, r: 3, speed: 8, count: 10, health: 100, maxHealth: 10 });
  const flyer = unit({ id: "flyer", unitType: UnitType.GRIFFIN, side: "attacker", q: 6, r: 3, speed: 8, count: 10, health: 100, maxHealth: 10 });

  const stopped = executeManualCombatAction({
    units: [walker],
    turnQueue: ["walker"],
    round: 1,
    currentUnitId: "walker",
    action: { type: "MOVE", q: 10, r: 3 },
    attackerStats: stats(),
    defenderStats: stats(),
    siege: openSiege,
  });
  const stoppedWalker = stopped.units.find((item) => item.id === "walker");
  assert.deepEqual({ q: stoppedWalker?.q, r: stoppedWalker?.r }, { q: 7, r: 3 });
  assert.equal(stoppedWalker?.health, 75);
  assert.equal(stoppedWalker?.defensePenalty, 3);

  const flying = executeManualCombatAction({
    units: [flyer],
    turnQueue: ["flyer"],
    round: 1,
    currentUnitId: "flyer",
    action: { type: "MOVE", q: 10, r: 3 },
    attackerStats: stats(),
    defenderStats: stats(),
    siege: openSiege,
  });
  const movedFlyer = flying.units.find((item) => item.id === "flyer");
  assert.deepEqual({ q: movedFlyer?.q, r: movedFlyer?.r }, { q: 10, r: 3 });
  assert.equal(movedFlyer?.health, 100);
  assert.equal(movedFlyer?.defensePenalty ?? 0, 0);
}

function testSiegeTerrainFiltering() {
  const siege = createCastleSiegeState({ towerCount: 3, towerDamage: 30 });
  const terrain = [
    { type: "rock" as const, q: 7, r: 6 },
    { type: "rock" as const, q: 8, r: 2 },
    { type: "rock" as const, q: 8, r: 9 },
    { type: "water" as const, q: 7, r: 9 },
    { type: "water" as const, q: 5, r: 5 },
  ];

  const filtered = filterSiegeTerrain(terrain, siege);
  assert.equal(filtered.some((feature) => feature.q === 7 && feature.r === 6), false);
  assert.equal(filtered.some((feature) => feature.q === 8 && feature.r === 2), false);
  assert.equal(filtered.some((feature) => feature.q === 8 && feature.r === 9), false);
  assert.equal(filtered.some((feature) => feature.q === 7 && feature.r === 9), false);
  assert.equal(filtered.some((feature) => feature.q === 5 && feature.r === 5), true);
}

function testSiegeCatapultAndTowerShots() {
  const siege = createCastleSiegeState({ towerCount: 3, towerDamage: 30 });
  const firstHit = damageSiegeWithCatapult(siege, 0, () => 0.5);
  assert.equal(firstHit.hit?.kind, "gate");
  assert.equal(firstHit.siege?.gate.hp, 1);

  const criticalHit = damageSiegeWithCatapult(firstHit.siege, 0, () => 0.1);
  assert.equal(criticalHit.siege?.gate.hp, 0);
  assert.equal(criticalHit.hit?.damage, 2);

  const towerSiege = {
    ...siege,
    towers: siege.towers.map((tower, index) => ({ ...tower, hp: ([0, 1, 2] as const)[index] })),
  };
  const attacker = unit({ id: "attacker", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, count: 20, health: 200 });
  const volley = applyTowerVolleyInRound([attacker], towerSiege);
  assert.equal(volley.shots.length, 2);
  assert.ok(!volley.shots.some((shot) => shot.towerId === towerSiege.towers[0]?.id));
  assert.ok((volley.units.find((item) => item.id === "attacker")?.health ?? 200) < 200);
}

function testMoveDoesNotAttack() {
  const units = [
    unit({ id: "mover", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, speed: 4, minDamage: 10, maxDamage: 10 }),
    unit({ id: "target", unitType: UnitType.PIKEMAN, side: "defender", q: 4, r: 1, health: 100, maxHealth: 10 }),
  ];

  const result = executeManualCombatAction({
    units,
    turnQueue: ["mover", "target"],
    round: 1,
    currentUnitId: "mover",
    action: { type: "MOVE", q: 3, r: 1 },
    attackerStats: stats(),
    defenderStats: stats(),
  });

  assert.deepEqual({ q: result.units.find((item) => item.id === "mover")?.q, r: result.units.find((item) => item.id === "mover")?.r }, { q: 3, r: 1 });
  assert.equal(result.units.find((item) => item.id === "target")?.health, 100);
  assert.equal(result.currentUnitId, "target");
}

function testSpellDamageAndMana() {
  assert.equal(getHeroMaxMana({ knowledge: 4 }), 40);
  assert.equal(calculateSpellDamage(SPELLS_BY_ID.implosion, 10, 2), 1050);
  assert.equal(calculateSpellDamage(SPELLS_BY_ID.lightning_bolt, 4, 0), 110);
}

function testCombatSpellOncePerRoundAndDamage() {
  const units = [
    unit({ id: "caster-stack", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, heroId: "h1", ownerPlayerId: "p1" }),
    unit({ id: "target", unitType: UnitType.PIKEMAN, side: "defender", q: 4, r: 1, count: 20, health: 200 }),
  ];
  const result = executeCombatSpell({
    units,
    caster: { heroId: "h1", playerId: "p1", side: "attacker", spellPower: 3 },
    action: { type: "CAST_COMBAT_SPELL", spellId: "magic_arrow", targetUnitId: "target" },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.units.find((item) => item.id === "target")?.health, 160);
  }

  const marked = markHeroCombatSpellCast(undefined, 1, "h1");
  assert.equal(hasHeroCastCombatSpell(marked, 1, "h1"), true);
  assert.equal(hasHeroCastCombatSpell(marked, 1, "h2"), false);
  assert.equal(hasHeroCastCombatSpell(marked, 2, "h1"), false);
}

function testCombatTruceLifecycle() {
  const truces: CombatTruce[] = [{
    id: "truce-1",
    combatId: "combat-1",
    requestedByPlayerId: "p1",
    requestedByHeroId: "h1",
    side: "attacker",
    pauseUntilTurn: 3,
    acknowledgedPlayerIds: ["p1"],
    status: "ACTIVE",
  }];

  assert.equal(findActiveCombatTruce(truces, 2)?.id, "truce-1");
  assert.equal(findActiveCombatTruce(truces, 3), null);
  assert.equal(hasPlayerUsedTruce(truces, "p1"), true);
  assert.equal(hasPlayerUsedTruce(truces, "p2"), false);
}

function testIndividualConcessionOnlyRemovesCurrentHero() {
  const units = [
    unit({ id: "main", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, ownerPlayerId: "p1", heroId: "h-main" }),
    unit({ id: "reinforcement", unitType: UnitType.ARCHER, side: "attacker", q: 0, r: 2, ownerPlayerId: "p3", heroId: "h-reinforcement" }),
    unit({ id: "defender", unitType: UnitType.PIKEMAN, side: "defender", q: 8, r: 1, ownerPlayerId: "p2", heroId: "h-defender" }),
  ];
  const concession = buildConcessionBoardState({
    units,
    heroId: "h-reinforcement",
    playerId: "p3",
    round: 1,
    currentUnitId: "reinforcement",
  });

  assert.equal(concession.units.find((item) => item.id === "reinforcement")?.count, 0);
  assert.equal(concession.units.find((item) => item.id === "main")?.count, 10);
  assert.equal(sideHasActivePlayerUnits(concession.units, "attacker"), true);
  assert.ok(!concession.turnQueue.includes("reinforcement"));
}

function testPrimaryConcessionPromotesFirstReinforcement() {
  const units = [
    unit({ id: "main", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, ownerPlayerId: "p1", heroId: "h-main" }),
    unit({ id: "late", unitType: UnitType.PIKEMAN, side: "attacker", q: 0, r: 2, ownerPlayerId: "p4", heroId: "h-late" }),
    unit({ id: "early", unitType: UnitType.PIKEMAN, side: "attacker", q: 0, r: 3, ownerPlayerId: "p3", heroId: "h-early" }),
  ];
  const afterMainLeaves = buildConcessionBoardState({
    units,
    heroId: "h-main",
    playerId: "p1",
    round: 1,
    currentUnitId: "main",
  });
  const promoted = findNextPrimaryParticipant([
    { id: "late-participant", player_id: "p4", hero_id: "h-late", side: "attacker", joined_at: "2026-01-01T00:02:00Z" },
    { id: "early-participant", player_id: "p3", hero_id: "h-early", side: "attacker", joined_at: "2026-01-01T00:01:00Z" },
  ], afterMainLeaves.units, "attacker");

  assert.equal(promoted?.id, "early-participant");
  assert.equal(promoted?.player_id, "p3");
}

function testIndividualSurrenderCostUsesOnlyCurrentHeroUnits() {
  const units = [
    unit({ id: "main", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, ownerPlayerId: "p1", heroId: "h-main", count: 20 }),
    unit({ id: "reinforcement", unitType: UnitType.ARCHER, side: "attacker", q: 0, r: 2, ownerPlayerId: "p3", heroId: "h-reinforcement", count: 5 }),
  ];
  const reinforcementUnits = getHeroCombatUnits(units, "h-reinforcement", "p3");
  const reinforcementCost = computeSurrenderGoldCost(reinforcementUnits, "attacker");
  const wholeSideCost = computeSurrenderGoldCost(units, "attacker");

  assert.ok(reinforcementCost > 0);
  assert.ok(reinforcementCost < wholeSideCost);
}

function testLastPlayerConcessionLeavesNoActiveSide() {
  const units = [
    unit({ id: "only-attacker", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1, ownerPlayerId: "p1", heroId: "h-main" }),
    unit({ id: "defender", unitType: UnitType.PIKEMAN, side: "defender", q: 8, r: 1, ownerPlayerId: "p2", heroId: "h-defender" }),
  ];
  const concession = buildConcessionBoardState({
    units,
    heroId: "h-main",
    playerId: "p1",
    round: 1,
    currentUnitId: "only-attacker",
  });

  assert.equal(sideHasActivePlayerUnits(concession.units, "attacker"), false);
  assert.equal(sideHasActivePlayerUnits(concession.units, "defender"), true);
}

function testCombatSpellImmunityAndMitigation() {
  const blackDragon = unit({ id: "dragon", unitType: UnitType.BLACK_DRAGON, side: "defender", q: 4, r: 1, count: 1, health: 300, maxHealth: 300 });
  const immune = executeCombatSpell({
    units: [unit({ id: "caster", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1 }), blackDragon],
    caster: { heroId: "h1", playerId: "p1", side: "attacker", spellPower: 10 },
    action: { type: "CAST_COMBAT_SPELL", spellId: "lightning_bolt", targetUnitId: "dragon" },
  });
  assert.equal(immune.ok, true);
  if (immune.ok) assert.equal(immune.units.find((item) => item.id === "dragon")?.health, 300);

  const ironGolem = unit({ id: "golem", unitType: UnitType.IRON_GOLEM, side: "defender", q: 4, r: 1, count: 10, health: 350, maxHealth: 35 });
  const mitigated = executeCombatSpell({
    units: [unit({ id: "caster", unitType: UnitType.PIKEMAN, side: "attacker", q: 1, r: 1 }), ironGolem],
    caster: { heroId: "h1", playerId: "p1", side: "attacker", spellPower: 4 },
    action: { type: "CAST_COMBAT_SPELL", spellId: "magic_arrow", targetUnitId: "golem" },
  });
  assert.equal(mitigated.ok, true);
  if (mitigated.ok) assert.equal(mitigated.units.find((item) => item.id === "golem")?.health, 338);
}

function testAutoResolveIsNotEasierAtEqualPower() {
  const attacker = {
    id: "attacker",
    attack: 1,
    defense: 1,
    armies: [{ id: "a", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
  };
  const defender = {
    id: "defender",
    attack: 1,
    defense: 1,
    armies: [{ id: "d", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
  };
  const result = autoResolveCombat(attacker, defender);
  // With the round-by-round simulation, equal armies grind each other down: whoever
  // wins (the attacker edges it on initiative) walks away with crippling losses. The
  // property under test is that an equal fight is never a cheap win.
  assert.ok([attacker.id, defender.id].includes(result.winnerHeroId));
  assert.ok(result.winnerLossRatio >= 0.6, `expected Pyrrhic losses, got ${result.winnerLossRatio}`);
}

function testLopsidedAutoResolveIsCheapForTheStronger() {
  const strong = {
    id: "strong",
    attack: 1,
    defense: 1,
    armies: [{ id: "s", unitType: UnitType.PIKEMAN, count: 100, health: 1000, maxHealth: 10, position: 0 }],
  };
  const weak = {
    id: "weak",
    attack: 1,
    defense: 1,
    armies: [{ id: "w", unitType: UnitType.PIKEMAN, count: 30, health: 300, maxHealth: 10, position: 0 }],
  };
  const result = autoResolveCombat(strong, weak);
  assert.equal(result.winnerHeroId, "strong");
  // A ~3x stronger army should walk away with light casualties (Lanchester),
  // far below the old linear pressure * 0.7 (~0.21 here).
  assert.ok(result.winnerLossRatio < 0.1, `expected light losses, got ${result.winnerLossRatio}`);
}

function testRangedUnitsAreShieldedByMelee() {
  const armies = [
    { id: "front", unitType: UnitType.PIKEMAN, count: 50, health: 500, maxHealth: 10, position: 0 },
    { id: "back", unitType: UnitType.ARCHER, count: 50, health: 500, maxHealth: 10, position: 1 },
  ];
  // A moderate loss the melee line can fully absorb: archers must stay intact.
  const shielded = applyLossesToArmies(armies, 0.3, false);
  assert.equal(shielded.find((s) => s.id === "back")?.count, 50);
  assert.ok((shielded.find((s) => s.id === "front")?.count ?? 0) < 50);

  // Once the melee budget is exceeded, the overflow finally bites the archers.
  const overrun = applyLossesToArmies(armies, 0.8, false);
  assert.equal(overrun.find((s) => s.id === "front")?.count, 0);
  assert.ok((overrun.find((s) => s.id === "back")?.count ?? 0) < 50);
}

function testCombatBoardNormalizesStackStats() {
  const board = createCombatBoard(
    {
      id: "attacker",
      playerId: "p1",
      attack: 0,
      defense: 0,
      armies: [{ id: "a", unitType: UnitType.PIKEMAN, count: 20, health: 4000, maxHealth: 200, position: 0 }],
    },
    {
      id: "defender",
      playerId: null,
      attack: 0,
      defense: 0,
      armies: [{ id: "d", unitType: UnitType.PIKEMAN, count: 20, health: 4000, maxHealth: 200, position: 0 }],
    },
  );
  for (const unit of board.boardState.units) {
    assert.equal(unit.maxHealth, 10);
    assert.equal(unit.health, 200);
    assert.equal(unit.minDamage, 1);
    assert.equal(unit.maxDamage, 3);
  }
}

function testPositiveLuckDoublesDamageAndMarksAttacker() {
  const attacker = unit({
    id: "lucky",
    unitType: UnitType.PIKEMAN,
    side: "attacker",
    q: 1,
    r: 1,
    count: 10,
    minDamage: 2,
    maxDamage: 2,
    luck: 3,
  });
  const defender = unit({
    id: "target",
    unitType: UnitType.PIKEMAN,
    side: "defender",
    q: 2,
    r: 1,
    count: 10,
    health: 100,
  });
  const roll = rollCombatDamage({
    attacker,
    defender,
    attackerStats: stats(),
    defenderStats: stats(),
    actionType: "ATTACK",
    random: () => 0,
  });
  assert.equal(roll.luckTriggered, true);
  assert.equal(roll.damage, 39);

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const result = executeManualCombatAction({
      units: [attacker, defender],
      turnQueue: ["lucky", "target"],
      round: 1,
      currentUnitId: "lucky",
      action: { type: "ATTACK", targetUnitId: "target" },
      attackerStats: stats(),
      defenderStats: stats(),
    });
    assert.equal(result.units.find((item) => item.id === "lucky")?.luckTriggered, true);
  } finally {
    Math.random = originalRandom;
  }
}

function testUpgradedDwellingsKeepBaseGrowth() {
  const growth = getTownWeeklyGrowth(Faction.RAMPART, [BuildingType.DWELLING_1, BuildingType.UPG_DWELLING_1]);
  assert.ok((growth[UnitType.CENTAUR] ?? 0) > 0);
  assert.ok((growth[UnitType.CENTAUR_CAPTAIN] ?? 0) > 0);
}

testInitiativeOrder();
testCombatEnvironmentUsesBuildingTileTerrain();
testCombatEnvironmentKeepsSnowOnRoadNearWater();
testCombatBoardAddsOrganicBlockingTerrain();
testSnowCombatBoardAddsVisibleBlockingTerrain();
testPositiveMoraleGrantsOnlyOneBonusAction();
testCombatTruceLifecycle();
testWaitAndDefendTiming();
testDamageFormulaCapsAndPartials();
testRetaliationOnce();
testRangedRestrictionsAndPenalties();
testMoveAndMeleeAttack();
testBlockedMoveAndMeleeAttack();
testRangedShotAndMoveMeleeAttack();
testFlyingUnitsCrossBlockingTerrain();
testSiegeWallsGateAndFlyers();
testSiegeGateRules();
testSiegeMoatStopsGroundOnly();
testSiegeTerrainFiltering();
testSiegeCatapultAndTowerShots();
testMoveDoesNotAttack();
testSpellDamageAndMana();
testCombatSpellOncePerRoundAndDamage();
testIndividualConcessionOnlyRemovesCurrentHero();
testPrimaryConcessionPromotesFirstReinforcement();
testIndividualSurrenderCostUsesOnlyCurrentHeroUnits();
testLastPlayerConcessionLeavesNoActiveSide();
testCombatSpellImmunityAndMitigation();
testAutoResolveIsNotEasierAtEqualPower();
testLopsidedAutoResolveIsCheapForTheStronger();
testRangedUnitsAreShieldedByMelee();
testCombatBoardNormalizesStackStats();
testPositiveLuckDoublesDamageAndMarksAttacker();
testUpgradedDwellingsKeepBaseGrowth();

console.log("Combat core validation passed.");
