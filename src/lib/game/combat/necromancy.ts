import { UnitType, BuildingType, Faction } from "../types";
import type { HeroSkills } from "../skills";
import { getNecromancyPercent } from "../skills";

const UNDEAD_UNITS: ReadonlySet<UnitType> = new Set([
  UnitType.SKELETON,
  UnitType.SKELETON_WARRIOR,
  UnitType.WALKING_DEAD,
  UnitType.ZOMBIE,
  UnitType.WIGHT,
  UnitType.WRAITH,
  UnitType.VAMPIRE,
  UnitType.VAMPIRE_LORD,
  UnitType.LICH,
  UnitType.POWER_LICH,
  UnitType.BLACK_KNIGHT,
  UnitType.DREAD_KNIGHT,
  UnitType.BONE_DRAGON,
  UnitType.GHOST_DRAGON,
]);

const NON_LIVING_UNITS: ReadonlySet<UnitType> = new Set([
  ...UNDEAD_UNITS,
  // Constructs/elementals — Heroes 3 treats these as non-living, not eligible
  UnitType.GARGOYLE,
  UnitType.OBSIDIAN_GARGOYLE,
  UnitType.IRON_GOLEM,
  UnitType.STEEL_GOLEM,
]);

export function isUndead(unit: UnitType): boolean {
  return UNDEAD_UNITS.has(unit);
}

export function canBeRaised(unit: UnitType, hasTransformer: boolean): boolean {
  if (isUndead(unit)) return false;
  if (hasTransformer) return true;
  return !NON_LIVING_UNITS.has(unit);
}

export function hasAmplifier(playerTowns: Array<{ townType?: string | null; buildings?: string[] | null }>): boolean {
  return playerTowns.some((town) =>
    (town.townType ?? Faction.CASTLE) === Faction.NECROPOLIS &&
    (town.buildings ?? []).includes(BuildingType.UNIQUE_2)
  );
}

export function hasTransformer(playerTowns: Array<{ townType?: string | null; buildings?: string[] | null }>): boolean {
  return playerTowns.some((town) =>
    (town.townType ?? Faction.CASTLE) === Faction.NECROPOLIS &&
    (town.buildings ?? []).includes(BuildingType.UNIQUE_3)
  );
}

export function computeRaisedSkeletons(
  killsByType: Partial<Record<UnitType, number>>,
  attackerSkills: HeroSkills | null | undefined,
  attackerTowns: Array<{ townType?: string | null; buildings?: string[] | null }>,
): { unitType: UnitType; count: number } | null {
  const amplifierBonus = hasAmplifier(attackerTowns) ? 10 : 0;
  const pct = getNecromancyPercent(attackerSkills, amplifierBonus);
  if (pct <= 0) return null;
  const transformer = hasTransformer(attackerTowns);

  let totalEligibleKills = 0;
  for (const [unit, count] of Object.entries(killsByType)) {
    if (!count) continue;
    const u = unit as UnitType;
    if (canBeRaised(u, transformer)) totalEligibleKills += count;
  }
  if (totalEligibleKills <= 0) return null;

  const raised = Math.floor((totalEligibleKills * pct) / 100);
  if (raised <= 0) return null;
  // Upgraded skeleton if transformer or amplifier — small QoL
  const unitType = transformer || hasAmplifier(attackerTowns) ? UnitType.SKELETON_WARRIOR : UnitType.SKELETON;
  return { unitType, count: raised };
}
