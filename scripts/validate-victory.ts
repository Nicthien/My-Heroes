import assert from "node:assert/strict";
import {
  DEFAULT_GOLD_TARGET,
  DEFAULT_TURN_LIMIT,
  GOLD_TARGET_BOUNDS,
  TURN_LIMIT_BOUNDS,
  describeVictoryCondition,
  evaluateVictory,
  normalizeVictoryCondition,
  type VictoryContenderSnapshot,
} from "../src/lib/game/victory";

function contender(overrides: Partial<VictoryContenderSnapshot>): VictoryContenderSnapshot {
  return { id: "p", gold: 0, towns: [], score: 0, ...overrides };
}

function testNormalizeDefaultsToDomination() {
  assert.equal(normalizeVictoryCondition(undefined).type, "DOMINATION", "missing config => domination");
  assert.equal(normalizeVictoryCondition({ type: "bogus" }).type, "DOMINATION", "unknown type => domination");
  // A capture objective without a resolvable target degrades to domination.
  assert.equal(normalizeVictoryCondition({ type: "CAPTURE_TOWN" }).type, "DOMINATION", "no target => domination");
}

function testNormalizeClampsParams() {
  const lowGold = normalizeVictoryCondition({ type: "GOLD", goldTarget: 1 });
  assert.equal(lowGold.goldTarget, GOLD_TARGET_BOUNDS.min, "gold target clamps to min");
  const highTurns = normalizeVictoryCondition({ type: "TURN_LIMIT", turnLimit: 99999 });
  assert.equal(highTurns.turnLimit, TURN_LIMIT_BOUNDS.max, "turn limit clamps to max");
  assert.equal(normalizeVictoryCondition({ type: "GOLD" }).goldTarget, DEFAULT_GOLD_TARGET, "gold default applied");
  assert.equal(normalizeVictoryCondition({ type: "TURN_LIMIT" }).turnLimit, DEFAULT_TURN_LIMIT, "turn default applied");
}

function testNormalizeKeepsValidCapture() {
  const condition = normalizeVictoryCondition({
    type: "CAPTURE_TOWN",
    targetTown: { x: 5, y: 7, mapLevel: "surface" },
    targetTownName: "Citadelle",
  });
  assert.equal(condition.type, "CAPTURE_TOWN");
  assert.deepEqual(condition.targetTown, { x: 5, y: 7, mapLevel: "surface" });
  assert.equal(condition.targetTownName, "Citadelle");
}

function testDominationLastStandingAndDraw() {
  const base = { turnNumber: 1, roundComplete: false };
  const win = evaluateVictory({ condition: { type: "DOMINATION" }, contenders: [contender({ id: "solo" })], ...base });
  assert.deepEqual(win, { type: "completed", winnerId: "solo" }, "lone contender wins");
  const draw = evaluateVictory({ condition: { type: "DOMINATION" }, contenders: [], ...base });
  assert.deepEqual(draw, { type: "completed", winnerId: null }, "no contender => draw");
  const ongoing = evaluateVictory({
    condition: { type: "DOMINATION" },
    contenders: [contender({ id: "a" }), contender({ id: "b" })],
    ...base,
  });
  assert.deepEqual(ongoing, { type: "continue" }, "two contenders keep playing");
}

function testGoldObjective() {
  const condition = { type: "GOLD" as const, goldTarget: 100_000 };
  const contenders = [contender({ id: "rich", gold: 120_000 }), contender({ id: "poor", gold: 5_000 })];
  const outcome = evaluateVictory({ condition, contenders, turnNumber: 3, roundComplete: false });
  assert.deepEqual(outcome, { type: "completed", winnerId: "rich" }, "reaching the gold target wins");
  const below = evaluateVictory({
    condition,
    contenders: [contender({ id: "a", gold: 50_000 }), contender({ id: "b", gold: 10_000 })],
    turnNumber: 3,
    roundComplete: false,
  });
  assert.deepEqual(below, { type: "continue" }, "below target keeps playing");
}

function testCaptureTownObjective() {
  const condition = {
    type: "CAPTURE_TOWN" as const,
    targetTown: { x: 4, y: 9, mapLevel: "surface" },
  };
  const holder = contender({ id: "holder", towns: [{ x: 4, y: 9, mapLevel: "surface" }] });
  const other = contender({ id: "other", towns: [{ x: 1, y: 1, mapLevel: "surface" }] });
  const outcome = evaluateVictory({ condition, contenders: [other, holder], turnNumber: 5, roundComplete: false });
  assert.deepEqual(outcome, { type: "completed", winnerId: "holder" }, "owning the target town wins");
  // Same coords on a different level must not count.
  const wrongLevel = evaluateVictory({
    condition,
    contenders: [contender({ id: "x", towns: [{ x: 4, y: 9, mapLevel: "underground" }] }), other],
    turnNumber: 5,
    roundComplete: false,
  });
  assert.deepEqual(wrongLevel, { type: "continue" }, "target only counts on its own level");
}

function testTurnLimitNeedsCompletedRound() {
  const condition = { type: "TURN_LIMIT" as const, turnLimit: 10 };
  const contenders = [contender({ id: "lead", score: 9000 }), contender({ id: "trail", score: 100 })];
  const tooEarly = evaluateVictory({ condition, contenders, turnNumber: 9, roundComplete: true });
  assert.deepEqual(tooEarly, { type: "continue" }, "limit not yet reached");
  const midRound = evaluateVictory({ condition, contenders, turnNumber: 10, roundComplete: false });
  assert.deepEqual(midRound, { type: "continue" }, "limit reached but round unfinished");
  const settled = evaluateVictory({ condition, contenders, turnNumber: 10, roundComplete: true });
  assert.deepEqual(settled, { type: "completed", winnerId: "lead" }, "highest score wins at the limit");
}

function testObjectiveBeatsDomination() {
  // Gold win fires even with multiple contenders still alive.
  const condition = { type: "GOLD" as const, goldTarget: 100_000 };
  const outcome = evaluateVictory({
    condition,
    contenders: [contender({ id: "a", gold: 200_000 }), contender({ id: "b", gold: 1 }), contender({ id: "c", gold: 1 })],
    turnNumber: 2,
    roundComplete: false,
  });
  assert.deepEqual(outcome, { type: "completed", winnerId: "a" });
}

function testDescribe() {
  assert.match(describeVictoryCondition({ type: "DOMINATION" }), /Dernier/);
  assert.match(describeVictoryCondition({ type: "GOLD", goldTarget: 100_000 }), /or/);
  assert.match(describeVictoryCondition({ type: "TURN_LIMIT", turnLimit: 50 }), /50/);
  assert.match(describeVictoryCondition({ type: "CAPTURE_TOWN", targetTownName: "Avlee" }), /Avlee/);
}

testNormalizeDefaultsToDomination();
testNormalizeClampsParams();
testNormalizeKeepsValidCapture();
testDominationLastStandingAndDraw();
testGoldObjective();
testCaptureTownObjective();
testTurnLimitNeedsCompletedRound();
testObjectiveBeatsDomination();
testDescribe();

console.log("Victory validation passed.");
