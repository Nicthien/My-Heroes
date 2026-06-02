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

  // Sécurité des tireurs : un tireur bloqué au contact (qui ne peut pas achever
  // son assaillant) se replie vers une case sûre d'où tirer, au lieu de taper en
  // mêlée à dégâts réduits.
  if (actor.ranged && actor.shots > 0 && hasAdjacentEnemy(actor, units)) {
    const canKillBlocker = enemies
      .filter((enemy) => getHexDistance(actor, enemy) <= 1)
      .some((enemy) => {
        const range = calculateCombatDamageRange({
          attacker: actor,
          defender: enemy,
          attackerStats: sideStats[actor.side],
          defenderStats: sideStats[enemy.side],
          actionType: "ATTACK",
          terrain,
          actorAdjacentToEnemy: true,
        });
        return enemy.health <= Math.floor((range.minDamage + range.maxDamage) / 2);
      });
    if (!canKillBlocker) {
      const safe = findSafeShootingCell(actor, enemies, units, terrain, sideStats, siege);
      if (safe) return { type: "MOVE", q: safe.q, r: safe.r };
    }
  }

  const adjacent = enemies
    .filter((unit) => getHexDistance(actor, unit) <= 1)
    .sort(
      (a, b) =>
        targetPriority(actor, b, units, terrain, sideStats, true) - targetPriority(actor, a, units, terrain, sideStats, true),
    )[0];
  if (adjacent) return { type: "ATTACK", targetUnitId: adjacent.id };

  if (actor.ranged && actor.shots > 0 && !hasAdjacentEnemy(actor, units)) {
    const target = [...enemies].sort(
      (a, b) =>
        targetPriority(actor, b, units, terrain, sideStats, false) - targetPriority(actor, a, units, terrain, sideStats, false),
    )[0];
    return { type: "SHOOT", targetUnitId: target.id };
  }

  // Melee units (and blocked shooters) will strike on arrival → judge by net trade.
  const meleeContext = !actor.ranged;
  const target = [...enemies].sort(
    (a, b) =>
      targetPriority(actor, b, units, terrain, sideStats, meleeContext) - targetPriority(actor, a, units, terrain, sideStats, meleeContext),
  )[0];
  const approach = findMeleeApproach(actor, target, units, terrain, siege);
  if (approach) return { type: "ATTACK", targetUnitId: target.id };

  const reachable = getReachableCombatCells(actor, units, terrain, siege);
  if (reachable.length === 0) {
    if (shouldWaitForAlly(actor, target, allies, units, terrain, sideStats)) return { type: "WAIT" };
    return { type: "DEFEND" };
  }

  // Approche anti-menace : on avance vers la cible tout en évitant de se planter
  // sous le feu croisé ennemi (un humain ne charge pas au milieu des tireurs).
  const destination = [...reachable].sort(
    (a, b) => approachScore(a, actor, target, enemies, units, terrain, sideStats) - approachScore(b, actor, target, enemies, units, terrain, sideStats),
  )[0];

  if (shouldWaitForAlly(actor, target, allies, units, terrain, sideStats)) return { type: "WAIT" };

  return destination ? { type: "MOVE", q: destination.q, r: destination.r } : { type: "DEFEND" };
}

// A reachable cell with no adjacent enemy (so the shooter can fire) and the
// lowest incoming-threat. Null when every reachable cell stays in melee contact.
function findSafeShootingCell(
  actor: CombatBoardUnit,
  enemies: CombatBoardUnit[],
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", AiCombatSideStats>,
  siege?: SiegeState | null,
): { q: number; r: number } | null {
  const reachable = getReachableCombatCells(actor, units, terrain, siege);
  const safe = reachable.filter((cell) => enemies.every((enemy) => getHexDistance(enemy, cell) > 1));
  if (safe.length === 0) return null;
  return safe.sort(
    (a, b) => cellThreat(a, actor, enemies, units, terrain, sideStats) - cellThreat(b, actor, enemies, units, terrain, sideStats),
  )[0];
}

// Lower is better: closeness to the target plus a penalty for the damage the
// actor would take next turn standing on that cell.
const THREAT_WEIGHT = 2.5;

function approachScore(
  cell: { q: number; r: number },
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  enemies: CombatBoardUnit[],
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", AiCombatSideStats>,
): number {
  return getHexDistance(cell, target) + cellThreat(cell, actor, enemies, units, terrain, sideStats) * THREAT_WEIGHT;
}

// Expected number of `actor` units lost next turn if it stands on `cell`, summed
// over every enemy that could reach/shoot it.
function cellThreat(
  cell: { q: number; r: number },
  actor: CombatBoardUnit,
  enemies: CombatBoardUnit[],
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", AiCombatSideStats>,
): number {
  const actorAtCell: CombatBoardUnit = { ...actor, q: cell.q, r: cell.r };
  let threat = 0;
  for (const enemy of enemies) {
    const canShoot = enemy.ranged && enemy.shots > 0 && !hasAdjacentEnemy(enemy, units);
    const canMelee = getHexDistance(enemy, cell) <= (enemy.speed ?? 0) + 1;
    if (!canShoot && !canMelee) continue;
    const range = calculateCombatDamageRange({
      attacker: enemy,
      defender: actorAtCell,
      attackerStats: sideStats[enemy.side],
      defenderStats: sideStats[actor.side],
      actionType: canShoot ? "SHOOT" : "ATTACK",
      terrain,
      actorAdjacentToEnemy: false,
    });
    threat += (range.minKills + range.maxKills) / 2;
  }
  return threat;
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

// Weight applied to expected retaliation losses when judging a melee strike.
const RETALIATION_WEIGHT = 1.2;

function targetPriority(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", AiCombatSideStats>,
  meleeContext: boolean,
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
  // Net trade: a melee strike that leaves the target alive draws retaliation.
  // Killing outright (no retaliation) or hitting an already-retaliated stack
  // costs nothing — so those naturally rise to the top.
  const retaliationPenalty = meleeContext
    ? estimateRetaliationValue(actor, target, averageDamage, terrain, sideStats) * RETALIATION_WEIGHT
    : 0;
  return (
    (canKill ? 1200 : 0) +
    (target.ranged ? 600 : 0) +
    ((rule.abilities?.length ?? 0) > 0 ? 250 : 0) +
    rule.power * target.count * 0.08 +
    Math.max(0, 400 - target.health * 0.05) -
    retaliationPenalty
  );
}

// Expected value of the attacker's units lost to the target's retaliation after a
// melee strike. Zero when the strike kills the target, when the target already
// retaliated this round, or when it cannot strike back.
function estimateRetaliationValue(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  expectedDamageToTarget: number,
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", AiCombatSideStats>,
): number {
  if (target.hasRetaliated) return 0;
  if (target.health <= expectedDamageToTarget) return 0; // dead → no retaliation
  const back = calculateCombatDamageRange({
    attacker: target,
    defender: actor,
    attackerStats: sideStats[target.side],
    defenderStats: sideStats[actor.side],
    actionType: "ATTACK",
    terrain,
    actorAdjacentToEnemy: true,
  });
  const avgKills = (back.minKills + back.maxKills) / 2;
  return avgKills * getUnitRule(actor.unitType).power * 0.08;
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
