import { MapTile, TerrainType, UnitType } from "./types";
import { UNIT_RULES } from "./units";
import { CREATURE_GROUPS } from "./creature-catalog";
import type { CreatureGroupKey } from "./creature-catalog";

export interface NeutralArmyStackInput {
  unitType: UnitType;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

type CountedUnit = {
  unitType?: UnitType | string;
  count?: number;
  position?: number;
};

function groupUnits(group: CreatureGroupKey): UnitType[] {
  return CREATURE_GROUPS.find((entry) => entry.key === group)?.units ?? [];
}

const NEUTRAL_UNITS = groupUnits("neutral");

const TERRAIN_UNIT_POOLS: Record<TerrainType, UnitType[]> = {
  [TerrainType.GRASS]: [...groupUnits("castle"), ...groupUnits("conflux"), ...NEUTRAL_UNITS.slice(0, 8)],
  [TerrainType.DIRT]: [...groupUnits("stronghold"), ...groupUnits("factory"), ...NEUTRAL_UNITS.slice(0, 8)],
  [TerrainType.FOREST]: [...groupUnits("rampart"), ...groupUnits("bulwark"), ...NEUTRAL_UNITS.slice(4, 12)],
  [TerrainType.SAND]: [...groupUnits("dungeon"), ...groupUnits("cove"), ...groupUnits("factory"), ...NEUTRAL_UNITS.slice(6, 14)],
  [TerrainType.SNOW]: [...groupUnits("tower"), ...groupUnits("bulwark"), ...NEUTRAL_UNITS.slice(8, 16)],
  [TerrainType.SWAMP]: [...groupUnits("fortress"), ...groupUnits("cove"), ...NEUTRAL_UNITS.slice(4, 13)],
  [TerrainType.MOUNTAIN]: [...groupUnits("tower"), ...groupUnits("dungeon"), ...groupUnits("stronghold"), ...groupUnits("bulwark"), ...NEUTRAL_UNITS.slice(8)],
  [TerrainType.LAVA]: [...groupUnits("inferno"), UnitType.FIRE_ELEMENTAL, UnitType.ENERGY_ELEMENTAL, UnitType.FIREBIRD, UnitType.PHOENIX],
  [TerrainType.WATER]: [...groupUnits("cove"), UnitType.NYMPH, UnitType.OCEANID, UnitType.WATER_ELEMENTAL, UnitType.ICE_ELEMENTAL],
};

export function getNeutralArmyUnitPool(terrain: TerrainType | string | undefined): UnitType[] {
  return TERRAIN_UNIT_POOLS[terrain as TerrainType] ?? TERRAIN_UNIT_POOLS[TerrainType.GRASS];
}

export function createNeutralArmyStacksForTile(
  tile: Pick<MapTile, "x" | "y" | "terrain">,
  guardianPower: number,
  armyId: string,
): NeutralArmyStackInput[] {
  const pool = getNeutralArmyUnitPool(tile.terrain);
  const budget = Math.max(120, Math.floor(guardianPower));
  const maxIndex = getMaxPoolIndex(pool, budget);
  const stackCount = Math.min(getStackCount(budget), maxIndex + 1);
  const weights = stackCount === 1 ? [1] : stackCount === 2 ? [0.65, 0.35] : [0.55, 0.3, 0.15];
  const seed = hashString(`${armyId}:${tile.x}:${tile.y}:${tile.terrain}:${budget}`);
  const selected = selectUnitTypes(pool, maxIndex, stackCount, seed);

  return selected.map((unitType, position) => {
    const rule = UNIT_RULES[unitType];
    const allocatedPower = Math.max(rule.power, Math.floor(budget * weights[position]));
    const count = Math.max(1, Math.floor(allocatedPower / rule.power));

    return {
      unitType,
      count,
      health: rule.health * count,
      maxHealth: rule.health,
      position,
    };
  });
}

export function getDominantUnitType(stacks: CountedUnit[] | undefined | null): UnitType | null {
  if (!stacks?.length) return null;

  let best: CountedUnit | null = null;
  for (const stack of stacks) {
    if (!isUnitType(stack.unitType)) continue;
    if (!best || (stack.count ?? 0) > (best.count ?? 0)) {
      best = stack;
    }
  }

  return isUnitType(best?.unitType) ? best.unitType : null;
}

export function isUnitType(value: unknown): value is UnitType {
  return typeof value === "string" && value in UNIT_RULES;
}

function getStackCount(budget: number) {
  if (budget >= 1800) return 3;
  if (budget >= 700) return 2;
  return 1;
}

function getMaxPoolIndex(pool: UnitType[], budget: number) {
  if (budget < 450) return Math.min(1, pool.length - 1);
  if (budget < 1000) return Math.min(2, pool.length - 1);
  if (budget < 2200) return Math.min(4, pool.length - 1);
  return pool.length - 1;
}

function selectUnitTypes(pool: UnitType[], maxIndex: number, count: number, seed: number) {
  const selected: UnitType[] = [];

  for (let i = 0; i < count; i++) {
    const bandStart = Math.floor((i * (maxIndex + 1)) / count);
    const bandEnd = Math.max(bandStart, Math.floor(((i + 1) * (maxIndex + 1)) / count) - 1);
    let index = bandStart + ((seed + i * 17) % (bandEnd - bandStart + 1));

    while (selected.includes(pool[index]) && index < maxIndex) index++;
    while (selected.includes(pool[index]) && index > 0) index--;
    selected.push(pool[index]);
  }

  return selected;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
