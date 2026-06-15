import catalogJson from "./creature-catalog.json";
import { UnitType } from "./types";
import type { Resources } from "./types";

export type CreatureGroupKey =
  | "castle"
  | "rampart"
  | "tower"
  | "inferno"
  | "necropolis"
  | "dungeon"
  | "stronghold"
  | "fortress"
  | "conflux"
  | "cove"
  | "factory"
  | "bulwark"
  | "neutral";

export interface CreatureCatalogEntry {
  type: UnitType;
  label: string;
  group: CreatureGroupKey;
  tier: number;
  upgradeLevel: number;
  attack: number;
  defense: number;
  minDamage: number;
  maxDamage: number;
  health: number;
  speed: number;
  growth: number;
  aiValue: number;
  cost: Partial<Resources>;
  ranged: boolean;
  shots: number;
  abilities: string[];
  special: string;
}

export interface CreatureCatalogGroup {
  key: CreatureGroupKey;
  label: string;
  units: UnitType[];
}

const catalog = catalogJson as {
  source: string;
  sourceRetrievedAt: string;
  groups: CreatureCatalogGroup[];
  creatures: CreatureCatalogEntry[];
};

export const CREATURE_CATALOG_SOURCE = catalog.source;
export const CREATURE_CATALOG_SOURCE_RETRIEVED_AT = catalog.sourceRetrievedAt;
export const CREATURE_GROUPS = catalog.groups;
export const CREATURES = catalog.creatures;

export const CREATURE_BY_TYPE = Object.fromEntries(
  CREATURES.map((creature) => [creature.type, creature]),
) as Record<UnitType, CreatureCatalogEntry>;

export function getCreature(unitType: UnitType | string): CreatureCatalogEntry {
  return CREATURE_BY_TYPE[unitType as UnitType] ?? CREATURE_BY_TYPE[UnitType.PIKEMAN];
}

/**
 * Like {@link getCreature} but returns null instead of the Pikeman fallback when the
 * unit isn't a catalog creature (war machines, the special "Roi"). Use this for display
 * fields (abilities / special flavor) so non-catalog units don't borrow Pikeman's text.
 */
export function getCreatureEntry(unitType: UnitType | string): CreatureCatalogEntry | null {
  return CREATURE_BY_TYPE[unitType as UnitType] ?? null;
}

/**
 * Returns the upgraded variant of a creature (same group + tier, higher upgradeLevel),
 * mirroring the classic neutral "upgrade flag". Returns null when no upgrade exists
 * (e.g. the `neutral` group has no upgrades), so callers keep the base creature.
 */
export function getUpgradedVariant(unitType: UnitType | string): UnitType | null {
  const base = CREATURE_BY_TYPE[unitType as UnitType];
  if (!base) return null;
  const upgrade = CREATURES.find(
    (creature) =>
      creature.group === base.group &&
      creature.tier === base.tier &&
      creature.upgradeLevel > base.upgradeLevel,
  );
  return upgrade?.type ?? null;
}
