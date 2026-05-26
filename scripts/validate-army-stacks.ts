import assert from "node:assert/strict";
import {
  HERO_ARMY_STACK_LIMIT,
  UNIT_STACK_COUNT_CAP,
  addUnitsToStacks,
  removeUnitsFromStack,
} from "../src/lib/game/army-stacks";
import { UnitType, type UnitStack } from "../src/lib/game/types";

function stack(id: string, unitType: UnitType, count: number, position: number): UnitStack {
  return { id, unitType, count, health: count * 10, maxHealth: 10, position };
}

{
  const result = addUnitsToStacks([stack("a", UnitType.ARCHER, 990, 0)], UnitType.ARCHER, 20, 10, (position) => `n-${position}`);
  assert.equal(result.added, 20);
  assert.equal(result.remainder, 0);
  assert.equal(result.stacks[0].count, UNIT_STACK_COUNT_CAP);
  assert.equal(result.stacks[1].count, 11);
}

{
  const full = Array.from({ length: HERO_ARMY_STACK_LIMIT }, (_, index) => stack(`s-${index}`, UnitType.PIKEMAN, UNIT_STACK_COUNT_CAP, index));
  const result = addUnitsToStacks(full, UnitType.ARCHER, 1, 10, (position) => `n-${position}`);
  assert.equal(result.added, 0);
  assert.equal(result.remainder, 1);
  assert.equal(result.stacks.length, HERO_ARMY_STACK_LIMIT);
}

{
  const source = { ...stack("injured", UnitType.ARCHER, 100, 0), health: 550 };
  const result = removeUnitsFromStack(source, 40);
  assert.equal(result.removed, 40);
  assert.equal(result.removedHealth, 220);
  assert.equal(result.remaining.count, 60);
  assert.equal(result.remaining.health, 330);
}

console.log("Army stack validation passed.");
