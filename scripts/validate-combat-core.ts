import assert from "node:assert/strict";
import { buildTurnQueue, executeManualCombatAction } from "../src/lib/game/combat/persistent";
import {
  applyDamageToStack,
  calculateCombatDamageRange,
  getAttackDefenseMultiplier,
  rollCombatDamage,
} from "../src/lib/game/combat/rules";
import { CombatBoardUnit, UnitType } from "../src/lib/game/types";

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
    ...params,
  };
}

function stats(attack = 0, defense = 0) {
  return { attack, defense };
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
  assert.ok(melee.log.some((line) => line.includes("corps-a-corps")));
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

testInitiativeOrder();
testWaitAndDefendTiming();
testDamageFormulaCapsAndPartials();
testRetaliationOnce();
testRangedRestrictionsAndPenalties();
testMoveAndMeleeAttack();
testBlockedMoveAndMeleeAttack();
testRangedShotAndMoveMeleeAttack();
testMoveDoesNotAttack();

console.log("Combat core validation passed.");
