import type { Resources, UnitStack, UnitType } from "@/lib/game/types";
import type { ResourceCost } from "@/lib/game/economy";
import { HERO_ARMY_STACK_LIMIT, UNIT_STACK_COUNT_CAP, addUnitsToStacks } from "@/lib/game/army-stacks";

export function addUnitsToLocalStackList(
  stacks: UnitStack[],
  unitType: UnitType,
  count: number,
  maxHealth: number
) {
  return addUnitsToStacks(
    stacks,
    unitType,
    count,
    maxHealth,
    (position) => `local-${Date.now()}-${position}`,
    Math.max(HERO_ARMY_STACK_LIMIT, stacks.length + Math.ceil(count / UNIT_STACK_COUNT_CAP)),
  ).stacks;
}

export function getMaxRecruitCount(resources: Resources, cost: ResourceCost, available: number) {
  const byResources = Object.entries(cost).reduce((max, [resource, amount]) => {
    if (!amount || amount <= 0) return max;
    const owned = resources[resource as keyof Resources] ?? 0;
    return Math.min(max, Math.floor(owned / amount));
  }, Number.POSITIVE_INFINITY);

  const resourceLimit = Number.isFinite(byResources) ? byResources : available;
  return Math.max(0, Math.min(available, resourceLimit));
}

export function getUpgradeCost(baseCost: ResourceCost, upgradedCost: ResourceCost): ResourceCost {
  const resources: Array<keyof Resources> = ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"];
  return Object.fromEntries(
    resources.map((resource) => [
      resource,
      Math.max(0, (upgradedCost[resource] ?? 0) - (baseCost[resource] ?? 0)),
    ])
  ) as ResourceCost;
}

export function multiplyCost(cost: ResourceCost, count: number): ResourceCost {
  return Object.fromEntries(
    Object.entries(cost).map(([resource, amount]) => [resource, (amount ?? 0) * count])
  ) as ResourceCost;
}

export function removeUnitsFromLocalStackList(
  stacks: UnitStack[],
  unitType: UnitType,
  count: number,
  maxHealth: number
) {
  let remaining = Math.max(0, Math.floor(count));
  return stacks
    .map((unit) => {
      if (unit.unitType !== unitType || remaining <= 0) return unit;
      const removed = Math.min(unit.count, remaining);
      remaining -= removed;
      return { ...unit, count: unit.count - removed, health: Math.max(0, unit.health - maxHealth * removed) };
    })
    .filter((unit) => unit.count > 0)
    .map((unit, position) => ({ ...unit, position }));
}
