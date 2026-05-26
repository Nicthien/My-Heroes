import type { UnitStack, UnitType } from "./types";

export const HERO_ARMY_STACK_LIMIT = 20;
export const UNIT_STACK_COUNT_CAP = 999;

export interface AddUnitsToStacksResult {
  stacks: UnitStack[];
  added: number;
  remainder: number;
}

export function sortedStacks(stacks: UnitStack[]) {
  return [...stacks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function getNextStackPosition(stacks: UnitStack[]) {
  const used = new Set(stacks.map((stack) => stack.position));
  for (let position = 0; position < HERO_ARMY_STACK_LIMIT; position++) {
    if (!used.has(position)) return position;
  }
  return stacks.length;
}

export function addUnitsToStacks(
  stacks: UnitStack[],
  unitType: UnitType,
  count: number,
  maxHealth: number,
  createId: (position: number) => string,
  limit = HERO_ARMY_STACK_LIMIT,
): AddUnitsToStacksResult {
  let remaining = Math.max(0, Math.floor(count));
  let nextStacks = sortedStacks(stacks).map((stack) => ({ ...stack }));
  let added = 0;

  nextStacks = nextStacks.map((stack) => {
    if (stack.unitType !== unitType || remaining <= 0 || stack.count >= UNIT_STACK_COUNT_CAP) return stack;
    const moved = Math.min(remaining, UNIT_STACK_COUNT_CAP - stack.count);
    remaining -= moved;
    added += moved;
    return {
      ...stack,
      count: stack.count + moved,
      health: Math.min((stack.count + moved) * maxHealth, stack.health + moved * maxHealth),
      maxHealth,
    };
  });

  while (remaining > 0 && nextStacks.length < limit) {
    const position = getNextStackPosition(nextStacks);
    const moved = Math.min(remaining, UNIT_STACK_COUNT_CAP);
    nextStacks.push({
      id: createId(position),
      unitType,
      count: moved,
      health: moved * maxHealth,
      maxHealth,
      position,
    });
    remaining -= moved;
    added += moved;
  }

  return {
    stacks: sortedStacks(nextStacks).map((stack, position) => ({ ...stack, position })),
    added,
    remainder: remaining,
  };
}

export function removeUnitsFromStack(stack: UnitStack, count: number) {
  const removed = Math.max(0, Math.min(stack.count, Math.floor(count)));
  if (removed <= 0) return { removed: 0, removedHealth: 0, remaining: stack };
  const removedHealth = Math.min(stack.health, Math.round(stack.health * (removed / stack.count)));
  return {
    removed,
    removedHealth,
    remaining: {
      ...stack,
      count: stack.count - removed,
      health: Math.max(0, stack.health - removedHealth),
    },
  };
}
