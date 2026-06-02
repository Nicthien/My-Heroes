// Headless tactical-combat calibration harness.
// Runs full AI-vs-AI battles through the real combat engine (no DB) to sanity-
// check the tactical weights (G1 retaliation, G3 threat positioning): do fights
// terminate, do shooters survive, does an army advantage convert to a win with
// proportional losses? Run: npx tsx scripts/calibrate-combat.ts

import { makeRng } from "../src/lib/game/engine/rng";
import { buildTurnQueue, executeManualCombatAction } from "../src/lib/game/combat/persistent";
import { chooseAiCombatAction } from "../src/lib/game/ai/combat-tactics";
import { getUnitRule } from "../src/lib/game/units";
import { UnitType, type CombatBoardUnit } from "../src/lib/game/types";

// Deterministic rolls for reproducible runs.
Math.random = makeRng("combat-calib-seed");

const STATS = { attacker: { attack: 3, defense: 3 }, defender: { attack: 3, defense: 3 } };

function unit(id: string, side: "attacker" | "defender", type: UnitType, count: number, q: number, r: number): CombatBoardUnit {
  const rule = getUnitRule(type);
  return {
    id, side, unitType: type, count,
    health: count * rule.health, maxHealth: rule.health,
    q, r, speed: rule.speed, ranged: Boolean(rule.ranged), shots: rule.shots ?? 0,
    minDamage: rule.minDamage, maxDamage: rule.maxDamage,
    ownerPlayerId: side === "attacker" ? "p1" : "p2",
    heroId: side === "attacker" ? "h1" : "h2",
    defended: false, waited: false, hasRetaliated: false, joinsRound: 0, position: 0, morale: 0, luck: 0,
  } as CombatBoardUnit;
}

function armyPower(units: CombatBoardUnit[], side: "attacker" | "defender"): number {
  return units.filter((u) => u.side === side).reduce((sum, u) => sum + getUnitRule(u.unitType).power * u.count, 0);
}

function simulate(makeArmy: () => CombatBoardUnit[]) {
  let units = makeArmy();
  const startA = armyPower(units, "attacker");
  const startD = armyPower(units, "defender");
  let round = 1;
  let turnQueue = buildTurnQueue(units, round);
  let currentUnitId: string | null = turnQueue[0] ?? null;
  let result: "attacker" | "defender" | null = null;
  let steps = 0;

  for (; steps < 4000 && currentUnitId && !result; steps++) {
    const actor = units.find((u) => u.id === currentUnitId && u.count > 0);
    if (!actor) break;
    const action = chooseAiCombatAction(actor, units, [], STATS);
    const exec = executeManualCombatAction({
      units, terrain: [], turnQueue, round, currentUnitId, action,
      attackerStats: STATS.attacker, defenderStats: STATS.defender,
    });
    units = exec.units;
    turnQueue = exec.turnQueue;
    round = exec.round;
    currentUnitId = exec.currentUnitId;
    result = exec.result;
  }

  return {
    result,
    round,
    steps,
    aLossPct: Math.round((1 - armyPower(units, "attacker") / Math.max(1, startA)) * 100),
    dLossPct: Math.round((1 - armyPower(units, "defender") / Math.max(1, startD)) * 100),
    archerSurvA: units.filter((u) => u.side === "attacker" && u.ranged).reduce((s, u) => s + u.count, 0),
    archerSurvD: units.filter((u) => u.side === "defender" && u.ranged).reduce((s, u) => s + u.count, 0),
  };
}

function runMatchup(name: string, makeArmy: () => CombatBoardUnit[], n: number) {
  let aWins = 0;
  let dWins = 0;
  let stalemates = 0;
  let roundsSum = 0;
  let aLossSum = 0;
  let dLossSum = 0;
  let archerSurvSum = 0;
  let archerStart = 0;
  for (let i = 0; i < n; i++) {
    const sim = simulate(makeArmy);
    if (sim.result === "attacker") aWins++;
    else if (sim.result === "defender") dWins++;
    else stalemates++;
    roundsSum += sim.round;
    aLossSum += sim.aLossPct;
    dLossSum += sim.dLossPct;
    archerSurvSum += sim.archerSurvA;
  }
  archerStart = makeArmy().filter((u) => u.side === "attacker" && u.ranged).reduce((s, u) => s + u.count, 0);
  console.log(`\n=== ${name} (n=${n}) ===`);
  console.log(`attacker wins ${aWins} | defender wins ${dWins} | unresolved ${stalemates}`);
  console.log(`avg rounds ${(roundsSum / n).toFixed(1)} | avg loss A ${(aLossSum / n).toFixed(0)}% D ${(dLossSum / n).toFixed(0)}%`);
  console.log(`attacker archers survived avg ${(archerSurvSum / n).toFixed(1)} / ${archerStart}`);
}

// Symmetric: same AI both sides → ~50/50, must terminate with non-trivial losses.
runMatchup("Symmetric (30 pike + 15 archer each)", () => [
  unit("a-pike", "attacker", UnitType.PIKEMAN, 30, 1, 2),
  unit("a-arch", "attacker", UnitType.ARCHER, 15, 0, 4),
  unit("a-cav", "attacker", UnitType.SWORDSMAN, 12, 1, 6),
  unit("d-pike", "defender", UnitType.PIKEMAN, 30, 11, 2),
  unit("d-arch", "defender", UnitType.ARCHER, 15, 12, 4),
  unit("d-cav", "defender", UnitType.SWORDSMAN, 12, 11, 6),
], 25);

// Advantage: attacker ~1.6x → should win most and keep a meaningful army.
runMatchup("Attacker advantage (~1.6x)", () => [
  unit("a-pike", "attacker", UnitType.PIKEMAN, 48, 1, 2),
  unit("a-arch", "attacker", UnitType.ARCHER, 24, 0, 4),
  unit("a-cav", "attacker", UnitType.SWORDSMAN, 20, 1, 6),
  unit("d-pike", "defender", UnitType.PIKEMAN, 30, 11, 2),
  unit("d-arch", "defender", UnitType.ARCHER, 15, 12, 4),
  unit("d-cav", "defender", UnitType.SWORDSMAN, 12, 11, 6),
], 25);
