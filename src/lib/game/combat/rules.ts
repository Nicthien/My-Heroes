import type { CombatBoardUnit, CombatTerrainFeature } from "../types";
import { getUnitRule } from "../units";
import { getHexDistance } from "./movement";

export const COMBAT_LONG_RANGE_HEXES = 6;

export type ManualCombatActionType = "ATTACK" | "SHOOT";

export interface CombatSideStats {
  attack: number;
  defense: number;
  skills?: Partial<Record<string, "basic" | "advanced" | "expert">>;
}

export interface CombatAttackProfile {
  actionLabel: string;
  canStrike: boolean;
  damagePenalty: number;
  penaltyReasons: string[];
  distance: number;
  isMelee: boolean;
  isShot: boolean;
}

export interface CombatDamageRange {
  minDamage: number;
  maxDamage: number;
  minKills: number;
  maxKills: number;
  profile: CombatAttackProfile;
}

export interface CombatDamageRoll {
  damage: number;
  baseDamagePerUnit: number;
  kills: number;
  profile: CombatAttackProfile;
}

export function normalizeCombatUnit(unit: CombatBoardUnit): CombatBoardUnit {
  const rule = getUnitRule(unit.unitType);
  return {
    ...unit,
    speed: Number.isFinite(unit.speed) ? unit.speed : rule.speed,
    minDamage: Number.isFinite(unit.minDamage) ? unit.minDamage : rule.minDamage,
    maxDamage: Number.isFinite(unit.maxDamage) ? unit.maxDamage : rule.maxDamage,
    ranged: typeof unit.ranged === "boolean" ? unit.ranged : Boolean(rule.ranged),
    shots: Number.isFinite(unit.shots) ? unit.shots : rule.shots ?? 0,
    hasRetaliated: Boolean(unit.hasRetaliated),
    defended: Boolean(unit.defended),
    waited: Boolean(unit.waited),
    morale: Number.isFinite(unit.morale) ? unit.morale : 0,
    moraleApplied: Boolean(unit.moraleApplied),
    moraleBonus: Boolean(unit.moraleBonus),
  };
}

export function getAttackProfile(params: {
  actor: CombatBoardUnit;
  target: CombatBoardUnit;
  actionType: ManualCombatActionType;
  terrain?: CombatTerrainFeature[];
  actorAdjacentToEnemy?: boolean;
}): CombatAttackProfile {
  const actor = normalizeCombatUnit(params.actor);
  const target = normalizeCombatUnit(params.target);
  const distance = getHexDistance(actor, target);
  const penaltyReasons: string[] = [];
  const isMelee = params.actionType === "ATTACK";
  const isShot = params.actionType === "SHOOT";

  if (isMelee && distance > 1) {
    return {
      actionLabel: "Hors portee",
      canStrike: false,
      damagePenalty: 0,
      penaltyReasons,
      distance,
      isMelee,
      isShot,
    };
  }

  if (isShot) {
    if (!actor.ranged || actor.shots <= 0 || distance <= 1 || params.actorAdjacentToEnemy) {
      return {
        actionLabel: "Hors portee",
        canStrike: false,
        damagePenalty: 0,
        penaltyReasons,
        distance,
        isMelee,
        isShot,
      };
    }
    if (distance > COMBAT_LONG_RANGE_HEXES) penaltyReasons.push("longue portee");
    if (isLineBlockedByTerrain(actor, target, params.terrain ?? [])) penaltyReasons.push("obstacle");
  }

  if (isMelee && actor.ranged) penaltyReasons.push("corps-a-corps");

  const damagePenalty = penaltyReasons.length > 0 ? 0.5 : 1;
  return {
    actionLabel: getActionLabel(isMelee, isShot, penaltyReasons.length > 0),
    canStrike: true,
    damagePenalty,
    penaltyReasons,
    distance,
    isMelee,
    isShot,
  };
}

export function calculateCombatDamageRange(params: {
  attacker: CombatBoardUnit;
  defender: CombatBoardUnit;
  attackerStats: CombatSideStats;
  defenderStats: CombatSideStats;
  actionType: ManualCombatActionType;
  terrain?: CombatTerrainFeature[];
  actorAdjacentToEnemy?: boolean;
}): CombatDamageRange {
  const attacker = normalizeCombatUnit(params.attacker);
  const defender = normalizeCombatUnit(params.defender);
  const profile = getAttackProfile({
    actor: attacker,
    target: defender,
    actionType: params.actionType,
    terrain: params.terrain,
    actorAdjacentToEnemy: params.actorAdjacentToEnemy,
  });

  if (!profile.canStrike) {
    return { minDamage: 0, maxDamage: 0, minKills: 0, maxKills: 0, profile };
  }

  const multiplier = getAttackDefenseMultiplier(attacker, defender, params.attackerStats, params.defenderStats);
  const skillMultiplier = getSkillDamageMultiplier(attacker, params.attackerStats, params.defenderStats, profile);
  const minDamage = Math.max(1, Math.floor(attacker.count * attacker.minDamage * multiplier * profile.damagePenalty * skillMultiplier));
  const maxDamage = Math.max(1, Math.floor(attacker.count * attacker.maxDamage * multiplier * profile.damagePenalty * skillMultiplier));

  return {
    minDamage,
    maxDamage,
    minKills: getLossesForDamage(defender, minDamage),
    maxKills: getLossesForDamage(defender, maxDamage),
    profile,
  };
}

export function rollCombatDamage(params: {
  attacker: CombatBoardUnit;
  defender: CombatBoardUnit;
  attackerStats: CombatSideStats;
  defenderStats: CombatSideStats;
  actionType: ManualCombatActionType;
  terrain?: CombatTerrainFeature[];
  actorAdjacentToEnemy?: boolean;
  random?: () => number;
}): CombatDamageRoll {
  const attacker = normalizeCombatUnit(params.attacker);
  const defender = normalizeCombatUnit(params.defender);
  const profile = getAttackProfile({
    actor: attacker,
    target: defender,
    actionType: params.actionType,
    terrain: params.terrain,
    actorAdjacentToEnemy: params.actorAdjacentToEnemy,
  });
  if (!profile.canStrike) return { damage: 0, baseDamagePerUnit: 0, kills: 0, profile };

  const baseDamagePerUnit = randomInt(attacker.minDamage, attacker.maxDamage, params.random);
  const multiplier = getAttackDefenseMultiplier(attacker, defender, params.attackerStats, params.defenderStats);
  const skillMultiplier = getSkillDamageMultiplier(attacker, params.attackerStats, params.defenderStats, profile);
  const damage = Math.max(1, Math.floor(attacker.count * baseDamagePerUnit * multiplier * profile.damagePenalty * skillMultiplier));
  return {
    damage,
    baseDamagePerUnit,
    kills: getLossesForDamage(defender, damage),
    profile,
  };
}

export function applyDamageToStack(defender: CombatBoardUnit, damage: number) {
  const nextHealth = Math.max(0, defender.health - damage);
  const nextCount = nextHealth > 0 ? Math.ceil(nextHealth / defender.maxHealth) : 0;
  const lost = Math.max(0, defender.count - nextCount);
  defender.health = nextHealth;
  defender.count = nextCount;
  return { lost, nextHealth, nextCount };
}

export function getAttackDefenseMultiplier(
  attacker: CombatBoardUnit,
  defender: CombatBoardUnit,
  attackerStats: CombatSideStats,
  defenderStats: CombatSideStats
) {
  const attackValue = getUnitRule(attacker.unitType).attack + attackerStats.attack;
  const baseDefenseValue = getUnitRule(defender.unitType).defense + defenderStats.defense;
  const defenseValue = defender.defended ? Math.ceil(baseDefenseValue * 1.2) : baseDefenseValue;
  const diff = attackValue - defenseValue;
  if (diff > 0) return Math.min(5, 1 + 0.05 * diff);
  if (diff < 0) return Math.max(0.3, 1 - 0.025 * Math.abs(diff));
  return 1;
}

function skillLevelValue(skills: CombatSideStats["skills"], id: string): number {
  const lvl = skills?.[id];
  return lvl === "expert" ? 3 : lvl === "advanced" ? 2 : lvl === "basic" ? 1 : 0;
}

export function getSkillDamageMultiplier(
  attacker: CombatBoardUnit,
  attackerStats: CombatSideStats,
  defenderStats: CombatSideStats,
  profile: CombatAttackProfile,
): number {
  let attackerBoost = 1;
  if (profile.isShot) {
    const archery = skillLevelValue(attackerStats.skills, "archery");
    if (archery === 1) attackerBoost *= 1.10;
    else if (archery === 2) attackerBoost *= 1.25;
    else if (archery === 3) attackerBoost *= 1.50;
  } else if (profile.isMelee) {
    const offense = skillLevelValue(attackerStats.skills, "offense");
    if (offense === 1) attackerBoost *= 1.10;
    else if (offense === 2) attackerBoost *= 1.20;
    else if (offense === 3) attackerBoost *= 1.30;
  }
  let defenderReduction = 1;
  if (!attacker.unitType.toString().includes("ballista")) {
    const armorer = skillLevelValue(defenderStats.skills, "armorer");
    if (armorer === 1) defenderReduction *= 0.95;
    else if (armorer === 2) defenderReduction *= 0.90;
    else if (armorer === 3) defenderReduction *= 0.85;
  }
  return attackerBoost * defenderReduction;
}

export function getLossesForDamage(defender: CombatBoardUnit, damage: number) {
  const nextHealth = Math.max(0, defender.health - damage);
  const nextCount = nextHealth > 0 ? Math.ceil(nextHealth / defender.maxHealth) : 0;
  return Math.max(0, defender.count - nextCount);
}

export function hasAdjacentEnemy(actor: CombatBoardUnit, units: CombatBoardUnit[]) {
  return units.some((unit) => unit.id !== actor.id && unit.count > 0 && unit.side !== actor.side && getHexDistance(actor, unit) <= 1);
}

function randomInt(min: number, max: number, random = Math.random) {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return low + Math.floor(random() * (high - low + 1));
}

function getActionLabel(isMelee: boolean, isShot: boolean, penalized: boolean) {
  if (isMelee && penalized) return "Corps-a-corps penalise";
  if (isMelee) return "Melee";
  if (isShot && penalized) return "Tir penalise";
  return "Tir";
}

function isLineBlockedByTerrain(actor: CombatBoardUnit, target: CombatBoardUnit, terrain: CombatTerrainFeature[]) {
  if (terrain.length === 0) return false;
  const terrainKeys = new Set(terrain.map((feature) => `${feature.q},${feature.r}`));
  const samples = getLineSamples(actor, target);
  return samples.some((cell) => terrainKeys.has(`${cell.q},${cell.r}`));
}

function getLineSamples(actor: CombatBoardUnit, target: CombatBoardUnit) {
  const distance = getHexDistance(actor, target);
  if (distance <= 1) return [];

  const a = offsetToCube(actor.q, actor.r);
  const b = offsetToCube(target.q, target.r);
  const samples: Array<{ q: number; r: number }> = [];

  for (let index = 1; index < distance; index++) {
    const t = index / distance;
    samples.push(cubeToOffset(cubeRound({
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
    })));
  }

  return samples;
}

function offsetToCube(q: number, r: number) {
  const x = q - (r - (r & 1)) / 2;
  const z = r;
  const y = -x - z;
  return { x, y, z };
}

function cubeToOffset(cube: { x: number; z: number }) {
  return {
    q: cube.x + (cube.z - (cube.z & 1)) / 2,
    r: cube.z,
  };
}

function cubeRound(cube: { x: number; y: number; z: number }) {
  let rx = Math.round(cube.x);
  let ry = Math.round(cube.y);
  let rz = Math.round(cube.z);
  const xDiff = Math.abs(rx - cube.x);
  const yDiff = Math.abs(ry - cube.y);
  const zDiff = Math.abs(rz - cube.z);

  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;

  return { x: rx, y: ry, z: rz };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
