import type { CombatBoardUnit, CombatSide } from "../types";
import { TerrainType, UnitType } from "../types";
import { getCreature, type CreatureGroupKey } from "../creature-catalog";
import { getNativeTerrainForGroup } from "../native-terrain";

export const MORALE_MIN = -3;
export const MORALE_MAX = 3;
export const MORALE_GOOD_CHANCE_PER_POINT = 1 / 24;
export const MORALE_BAD_CHANCE_PER_POINT = 1 / 12;

/** The King always rallies his troops: his morale is guaranteed to stay positive. */
export const KING_MIN_MORALE = 1;

const UNDEAD_GROUP: CreatureGroupKey = "necropolis";

function isKingUnit(unit: CombatBoardUnit) {
  return unit.unitType === UnitType.KING;
}

/**
 * The faction group used for morale faction-mixing and native terrain. Honours the
 * board-stamped {@link CombatBoardUnit.factionGroup} override (the King adopts its
 * owner's faction) and falls back to the catalog group for normal creatures.
 */
function unitFactionGroup(unit: CombatBoardUnit): CreatureGroupKey {
  return (unit.factionGroup as CreatureGroupKey | undefined) ?? getCreature(unit.unitType).group;
}

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
  return getNativeTerrainForGroup(group);
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
      factions.add(unitFactionGroup(ally));
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
    const native = getNativeTerrain(unitFactionGroup(unit));
    if (native && native === context.terrain) morale += 1;
  }

  if (isKingUnit(unit)) morale = Math.max(KING_MIN_MORALE, morale);

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
    unit.moraleTriggered = undefined;
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
    moraleTriggered: undefined,
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
