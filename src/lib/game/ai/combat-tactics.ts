import { getHexDistance } from "@/lib/game/combat/persistent";
import { findMeleeApproach, getReachableCombatCells } from "@/lib/game/combat/movement";
import { calculateCombatDamageRange, hasAdjacentEnemy, type CombatSideStats } from "@/lib/game/combat/rules";
import { getUnitRule } from "@/lib/game/units";
import type { CombatBoardUnit, CombatTerrainFeature } from "@/lib/game/types";
import type { SiegeState } from "@/lib/game/combat/siege";

export type AiCombatAction = {
  type: "MOVE" | "ATTACK" | "SHOOT" | "WAIT" | "DEFEND";
  q?: number;
  r?: number;
  targetUnitId?: string;
};

export interface AiCombatSideStats extends CombatSideStats {
  attack: number;
  defense: number;
}

const WAR_MACHINE_TYPES = new Set(["catapult", "first_aid_tent", "ammo_cart"]);

export function chooseAiCombatAction(
  actor: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", AiCombatSideStats>,
  siege?: SiegeState | null,
): AiCombatAction {
  const enemies = units.filter((unit) => unit.count > 0 && unit.side !== actor.side);
  if (enemies.length === 0) return { type: "DEFEND" };

  const allies = units.filter((unit) => unit.count > 0 && unit.side === actor.side && unit.id !== actor.id);

  const adjacent = enemies
    .filter((unit) => getHexDistance(actor, unit) <= 1)
    .sort(
      (a, b) =>
        targetPriority(actor, b, units, terrain, sideStats) - targetPriority(actor, a, units, terrain, sideStats),
    )[0];
  if (adjacent) return { type: "ATTACK", targetUnitId: adjacent.id };

  if (actor.ranged && actor.shots > 0 && !hasAdjacentEnemy(actor, units)) {
    const target = [...enemies].sort(
      (a, b) =>
        targetPriority(actor, b, units, terrain, sideStats) - targetPriority(actor, a, units, terrain, sideStats),
    )[0];
    return { type: "SHOOT", targetUnitId: target.id };
  }

  const target = [...enemies].sort(
    (a, b) =>
      targetPriority(actor, b, units, terrain, sideStats) - targetPriority(actor, a, units, terrain, sideStats),
  )[0];
  const approach = findMeleeApproach(actor, target, units, terrain, siege);
  if (approach) return { type: "ATTACK", targetUnitId: target.id };

  const reachable = getReachableCombatCells(actor, units, terrain, siege);
  if (reachable.length === 0) {
    if (shouldWaitForAlly(actor, target, allies, units, terrain, sideStats)) return { type: "WAIT" };
    return { type: "DEFEND" };
  }

  const destination = reachable.sort((a, b) => getHexDistance(a, target) - getHexDistance(b, target))[0];

  if (shouldWaitForAlly(actor, target, allies, units, terrain, sideStats)) return { type: "WAIT" };

  return destination ? { type: "MOVE", q: destination.q, r: destination.r } : { type: "DEFEND" };
}

function shouldWaitForAlly(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  allies: CombatBoardUnit[],
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", AiCombatSideStats>,
): boolean {
  if (target.health <= 0) return false;
  const myRange = calculateCombatDamageRange({
    attacker: actor,
    defender: target,
    attackerStats: sideStats[actor.side],
    defenderStats: sideStats[target.side],
    actionType: "ATTACK",
    terrain,
    actorAdjacentToEnemy: false,
  });
  const myAvg = (myRange.minDamage + myRange.maxDamage) / 2;
  if (myAvg >= target.health) return false;
  for (const ally of allies) {
    if (ally.side !== actor.side) continue;
    if (getHexDistance(ally, target) > 1) continue;
    const allyRange = calculateCombatDamageRange({
      attacker: ally,
      defender: target,
      attackerStats: sideStats[ally.side],
      defenderStats: sideStats[target.side],
      actionType: "ATTACK",
      terrain,
      actorAdjacentToEnemy: false,
    });
    const allyAvg = (allyRange.minDamage + allyRange.maxDamage) / 2;
    if (allyAvg >= target.health) return true;
  }
  return false;
}

function targetPriority(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", AiCombatSideStats>,
): number {
  const rule = getUnitRule(target.unitType);
  const distance = getHexDistance(actor, target);
  const range = calculateCombatDamageRange({
    attacker: actor,
    defender: target,
    attackerStats: sideStats[actor.side],
    defenderStats: sideStats[target.side],
    actionType: distance <= 1 ? "ATTACK" : "SHOOT",
    terrain,
    actorAdjacentToEnemy: hasAdjacentEnemy(actor, units),
  });
  const averageDamage = Math.floor((range.minDamage + range.maxDamage) / 2);
  const canKill = target.health <= averageDamage;
  return (
    (canKill ? 1200 : 0) +
    (target.ranged ? 600 : 0) +
    ((rule.abilities?.length ?? 0) > 0 ? 250 : 0) +
    rule.power * target.count * 0.08 +
    Math.max(0, 400 - target.health * 0.05)
  );
}

export interface AiTacticsPlacement {
  unitId: string;
  q: number;
  r: number;
}

export function planAiTacticsPlacements(
  units: CombatBoardUnit[],
  side: "attacker" | "defender",
  bounds: { maxColumn?: number; minColumn?: number },
): AiTacticsPlacement[] {
  const result: AiTacticsPlacement[] = [];
  const occupied = new Set(units.map((u) => `${u.q},${u.r}`));
  const myUnits = units.filter(
    (u) =>
      u.side === side &&
      u.count > 0 &&
      !u.ranged &&
      !WAR_MACHINE_TYPES.has(u.unitType as unknown as string),
  );
  for (const unit of myUnits) {
    const targetQ =
      side === "attacker"
        ? Math.min((bounds.maxColumn ?? unit.q) - 1, unit.q + 2)
        : Math.max((bounds.minColumn ?? unit.q) + 1, unit.q - 2);
    if (targetQ === unit.q) continue;
    const oldKey = `${unit.q},${unit.r}`;
    const targetKey = `${targetQ},${unit.r}`;
    if (occupied.has(targetKey)) continue;
    occupied.delete(oldKey);
    occupied.add(targetKey);
    result.push({ unitId: unit.id, q: targetQ, r: unit.r });
  }
  return result;
}
