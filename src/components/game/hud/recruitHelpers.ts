import type { Resources, UnitStack, UnitType } from "@/lib/game/types";
import type { ResourceCost } from "@/lib/game/economy";

export function addUnitsToLocalStackList(
  stacks: UnitStack[],
  unitType: UnitType,
  count: number,
  maxHealth: number
) {
  const existing = stacks.find((unit) => unit.unitType === unitType);
  if (existing) {
    return stacks.map((unit) =>
      unit.id === existing.id
        ? { ...unit, count: unit.count + count, health: unit.health + maxHealth * count }
        : unit
    );
  }

  return [
    ...stacks,
    {
      id: `local-${Date.now()}`,
      unitType,
      count,
      health: maxHealth * count,
      maxHealth,
      position: stacks.length,
    },
  ];
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
  return stacks
    .map((unit) =>
      unit.unitType === unitType
        ? { ...unit, count: unit.count - count, health: Math.max(0, unit.health - maxHealth * count) }
        : unit
    )
    .filter((unit) => unit.count > 0)
    .map((unit, position) => ({ ...unit, position }));
}
