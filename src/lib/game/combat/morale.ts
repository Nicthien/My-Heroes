import type { CombatBoardUnit, CombatSide } from "../types";
import { TerrainType } from "../types";
import { getCreature, type CreatureGroupKey } from "../creature-catalog";

export const MORALE_MIN = -3;
export const MORALE_MAX = 3;
export const MORALE_GOOD_CHANCE_PER_POINT = 1 / 24;
export const MORALE_BAD_CHANCE_PER_POINT = 1 / 12;

const UNDEAD_GROUP: CreatureGroupKey = "necropolis";

const FACTION_NATIVE_TERRAIN: Partial<Record<CreatureGroupKey, TerrainType>> = {
  castle: TerrainType.GRASS,
  rampart: TerrainType.GRASS,
  tower: TerrainType.SNOW,
  inferno: TerrainType.LAVA,
  necropolis: TerrainType.DIRT,
  dungeon: TerrainType.MOUNTAIN,
  stronghold: TerrainType.DIRT,
  fortress: TerrainType.SWAMP,
  conflux: TerrainType.GRASS,
  cove: TerrainType.SAND,
  factory: TerrainType.SAND,
  bulwark: TerrainType.SNOW,
};

export interface MoraleContext {
  attackerHeroMorale?: number;
  defenderHeroMorale?: number;
  attackerHeroLuck?: number;
  defenderHeroLuck?: number;
  terrain?: TerrainType;
}

export function isUndeadUnit(unit: CombatBoardUnit) {
  return getCreature(unit.unitType).group === UNDEAD_GROUP;
}

export function getNativeTerrain(group: CreatureGroupKey): TerrainType | undefined {
  return FACTION_NATIVE_TERRAIN[group];
}

export function computeUnitMorale(
  unit: CombatBoardUnit,
  sideUnits: CombatBoardUnit[],
  context: MoraleContext = {}
) {
  if (isUndeadUnit(unit)) return 0;

  const livingAllies = sideUnits.filter((other) => other.count > 0);
  const factions = new Set<string>();
  let hasUndeadAlly = false;
  let hasLivingAlly = false;
  for (const ally of livingAllies) {
    if (isUndeadUnit(ally)) {
      hasUndeadAlly = true;
    } else {
      hasLivingAlly = true;
      factions.add(getCreature(ally.unitType).group);
    }
  }

  let morale = 0;
  if (factions.size <= 1) morale = 1;
  else if (factions.size === 2) morale = 0;
  else if (factions.size === 3) morale = -1;
  else morale = -2;

  if (hasUndeadAlly && hasLivingAlly) morale -= 1;

  const heroBonus =
    unit.side === "attacker"
      ? Number(context.attackerHeroMorale ?? 0)
      : Number(context.defenderHeroMorale ?? 0);
  morale += Number.isFinite(heroBonus) ? heroBonus : 0;

  if (context.terrain) {
    const native = getNativeTerrain(getCreature(unit.unitType).group);
    if (native && native === context.terrain) morale += 1;
  }

  return clampMorale(morale);
}

export function clampMorale(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(MORALE_MIN, Math.min(MORALE_MAX, Math.trunc(value)));
}

export function assignMoraleToBoard(units: CombatBoardUnit[], context: MoraleContext = {}) {
  const attackerSide = units.filter((unit) => unit.side === "attacker");
  const defenderSide = units.filter((unit) => unit.side === "defender");
  for (const unit of units) {
    const sideUnits = unit.side === "attacker" ? attackerSide : defenderSide;
    unit.morale = computeUnitMorale(unit, sideUnits, context);
    unit.moraleApplied = false;
    unit.moraleBonus = false;
  }
}

export function refreshMoraleForRound(units: CombatBoardUnit[], context: MoraleContext = {}) {
  const attackerSide = units.filter((unit) => unit.side === "attacker" && unit.count > 0);
  const defenderSide = units.filter((unit) => unit.side === "defender" && unit.count > 0);
  return units.map((unit) => ({
    ...unit,
    morale: computeUnitMorale(unit, unit.side === "attacker" ? attackerSide : defenderSide, context),
    moraleApplied: false,
    moraleBonus: false,
  }));
}

export type MoraleRollResult = "good" | "bad" | "neutral";

export function rollMorale(morale: number, random: () => number = Math.random): MoraleRollResult {
  const value = clampMorale(morale);
  if (value === 0) return "neutral";
  const roll = random();
  if (value > 0) {
    return roll < value * MORALE_GOOD_CHANCE_PER_POINT ? "good" : "neutral";
  }
  return roll < Math.abs(value) * MORALE_BAD_CHANCE_PER_POINT ? "bad" : "neutral";
}

export function getSideMorale(units: CombatBoardUnit[], side: CombatSide, context: MoraleContext = {}) {
  const sample = units.find((unit) => unit.side === side && unit.count > 0 && !isUndeadUnit(unit));
  if (sample) return computeUnitMorale(sample, units.filter((unit) => unit.side === side), context);
  return 0;
}
