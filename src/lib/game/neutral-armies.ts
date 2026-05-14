import { MapTile, TerrainType, UnitType } from "./types";
import { UNIT_RULES } from "./units";

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

const TERRAIN_UNIT_POOLS: Record<TerrainType, UnitType[]> = {
  [TerrainType.GRASS]: [
    UnitType.PIKEMAN,
    UnitType.ARCHER,
    UnitType.GRIFFIN,
    UnitType.SWORDSMAN,
    UnitType.CAVALIER,
    UnitType.ANGEL,
  ],
  [TerrainType.DIRT]: [
    UnitType.GOBLIN,
    UnitType.WOLF_RIDER,
    UnitType.ORC,
    UnitType.OGRE,
    UnitType.ROC,
    UnitType.CYCLOPS,
    UnitType.BEHEMOTH,
  ],
  [TerrainType.FOREST]: [
    UnitType.CENTAUR,
    UnitType.DWARF,
    UnitType.WOOD_ELF,
    UnitType.PEGASUS,
    UnitType.DENDROID,
    UnitType.UNICORN,
    UnitType.GREEN_DRAGON,
  ],
  [TerrainType.SAND]: [
    UnitType.TROGLODYTE,
    UnitType.HARPY,
    UnitType.BEHOLDER,
    UnitType.MEDUSA,
    UnitType.MINOTAUR,
    UnitType.MANTICORE,
    UnitType.RED_DRAGON,
  ],
  [TerrainType.SNOW]: [
    UnitType.GREMLIN,
    UnitType.GARGOYLE,
    UnitType.GOLEM,
    UnitType.MAGE,
    UnitType.GENIE,
    UnitType.NAGA,
    UnitType.GIANT,
  ],
  [TerrainType.SWAMP]: [
    UnitType.GNOLL,
    UnitType.LIZARDMAN,
    UnitType.SERPENT_FLY,
    UnitType.BASILISK,
    UnitType.GORGON,
    UnitType.WYVERN,
    UnitType.HYDRA,
  ],
  [TerrainType.MOUNTAIN]: [
    UnitType.GARGOYLE,
    UnitType.GOLEM,
    UnitType.HARPY,
    UnitType.MINOTAUR,
    UnitType.ROC,
    UnitType.GIANT,
    UnitType.RED_DRAGON,
  ],
  [TerrainType.LAVA]: [
    UnitType.IMP,
    UnitType.GOG,
    UnitType.HELL_HOUND,
    UnitType.DEMON,
    UnitType.PIT_FIEND,
    UnitType.EFREET,
    UnitType.DEVIL,
  ],
  [TerrainType.WATER]: [
    UnitType.LIZARDMAN,
    UnitType.SERPENT_FLY,
    UnitType.WYVERN,
    UnitType.HYDRA,
  ],
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
