import { MapTile, TerrainType, UnitType } from "./types";
import { UNIT_RULES } from "./units";
import { CREATURE_GROUPS, getCreature, getUpgradedVariant } from "./creature-catalog";
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
  [TerrainType.ROUGH]: [...groupUnits("stronghold"), ...groupUnits("factory"), ...NEUTRAL_UNITS.slice(8)],
  [TerrainType.SUBTERRANEAN]: [...groupUnits("dungeon"), ...groupUnits("bulwark"), ...NEUTRAL_UNITS.slice(8)],
};

export function getNeutralArmyUnitPool(terrain: TerrainType | string | undefined): UnitType[] {
  return TERRAIN_UNIT_POOLS[terrain as TerrainType] ?? TERRAIN_UNIT_POOLS[TerrainType.GRASS];
}

// Difficulty tuning for neutral guards. GUARD_STRENGTH_MULTIPLIER scales the budget
// into a unit count: a base of ~1.3 offsets aiValue being ~1.3× the legacy gold-cost
// basis the guardianPower budgets were calibrated against, and the extra headroom on
// top is a deliberate difficulty boost so early mines/wandering monsters are an actual
// fight instead of a thin handful of units. It only affects the *count* (uniformly
// across every guard source — mines, zone guardians, patrols, gates), not the unit
// tier or the creature band. GUARD_BAND_LOW/HIGH bound which slice of the eligible
// creature band is drawn from (lower-mid = more units, sturdier-feeling fights).
// Difficulty boost history: 2.1 (legacy) → 9.45 → 7.5 → 3.75 → 2.8125 → 4.5. Cut hard in
// response to "too hard" feedback (down to 2.8125 = -62.5%), then partly walked back to 4.5
// (= 7.5 × 0.6, i.e. ~-40% off the old basis) once the early game read as *too easy* — the
// starting hero's first gate should be a "medium" fight, not "easy". Paired with a steeper
// compression curve (see below) so this higher multiplier lifts the early/mid game without
// sending the central gate back toward suicidal. The world still ramps over time via the
// weekly neutral growth in `server/turns.ts` (undefeated neutrals gain +25%/week, capped at
// ×3). Affects newly generated stacks only (in-progress games keep their seeded stacks).
const GUARD_STRENGTH_MULTIPLIER = 4.5;
const GUARD_BAND_LOW = 0.15;
const GUARD_BAND_HIGH = 0.6;

// Difficulty-curve compression. Raw guardianPower budgets span a huge range (~120 for a
// wandering pack to ~7800 for a central gate), and a flat multiplier preserves that ~40:1
// ratio — so starting wood/ore mines are trivial while gold/crystal mines, zone buildings
// and gates feel brutal-to-suicidal. We compress the whole budget (which then drives unit
// tier, creature band AND count): values at or below the anchor are untouched, larger ones
// grow only by a fractional power. High-end guards thus ease in both tier and number, so
// the unit-count curve flattens from ~40:1 to ~9:1 — a smooth ramp instead of a cliff.
const GUARD_BUDGET_ANCHOR = 300;
const GUARD_BUDGET_COMPRESSION = 0.40;

function compressGuardBudget(budget: number): number {
  if (budget <= GUARD_BUDGET_ANCHOR) return budget;
  return GUARD_BUDGET_ANCHOR * (budget / GUARD_BUDGET_ANCHOR) ** GUARD_BUDGET_COMPRESSION;
}

/**
 * Builds a classic homogeneous neutral guard: a single creature type is picked
 * once, the total count is derived from the difficulty budget / the creature's
 * aiValue, then that count is split across identical stacks (slots).
 */
export function createNeutralArmyStacksForTile(
  tile: Pick<MapTile, "x" | "y"> & { terrain?: TerrainType | string },
  guardianPower: number,
  armyId: string,
): NeutralArmyStackInput[] {
  const pool = getNeutralArmyUnitPool(tile.terrain);
  // Compress the difficulty budget BEFORE anything derives from it (unit tier, creature
  // band, count), so high-end guards drop in both tier and number together — a smooth,
  // gentle ramp rather than a cliff — and never degenerate into "1 lone elite".
  const budget = Math.max(120, Math.floor(compressGuardBudget(Math.max(120, Math.floor(guardianPower)))));
  const maxIndex = getMaxPoolIndex(pool, budget);
  const seed = hashString(`${armyId}:${tile.x}:${tile.y}:${tile.terrain}:${budget}`);

  // Phase 1: draw a single creature type (once), biased toward the lower-mid of the
  // eligible band. Picking cheaper-than-top creatures yields more units (so guards
  // are not a thin handful of elites that die in two hits) while the band still
  // scales up with the budget.
  let unitType = selectSingleUnitType(pool, maxIndex, seed);

  // Classic upgrade flag: ~25% chance the whole troop becomes its upgraded variant.
  // Use the well-mixed high bits so this roll is independent of the type selection.
  if ((seed >>> 8) % 100 < 25) {
    unitType = getUpgradedVariant(unitType) ?? unitType;
  }

  const rule = UNIT_RULES[unitType];
  const aiValue = getCreature(unitType).aiValue;

  // Phase 2: total count = (budget × difficulty multiplier) / AI value, then split
  // into identical stacks. The multiplier compensates for aiValue being higher than
  // the legacy gold-cost basis the guardianPower budgets were tuned against, so
  // guards keep their intended strength.
  const totalCount = Math.max(1, Math.round((budget * GUARD_STRENGTH_MULTIPLIER) / aiValue));
  const stackCount = calculateStackCount(totalCount);
  const baseCount = Math.floor(totalCount / stackCount);
  const remainder = totalCount % stackCount;

  return Array.from({ length: stackCount }, (_, position) => {
    const count = baseCount + (position < remainder ? 1 : 0);
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

// Number of stacks the total count is split into. Splitting a guard into MORE, smaller
// stacks (~5 units each, capped at the classic 7 army slots) makes it easier to chew
// through: each stack the player wipes removes a smaller slice of the guard's damage, so
// its output falls off faster than one or two big blocks would. Tiny guards stay as a
// single stack to avoid silly 1-unit slivers. NB: this does NOT change the raw power /
// displayed threat (same total units) — it only affects how the fight plays out.
function calculateStackCount(totalCount: number) {
  if (totalCount < 4) return 1;
  return Math.min(7, Math.ceil(totalCount / 5));
}

function getMaxPoolIndex(pool: UnitType[], budget: number) {
  if (budget < 450) return Math.min(1, pool.length - 1);
  if (budget < 1000) return Math.min(2, pool.length - 1);
  if (budget < 2200) return Math.min(4, pool.length - 1);
  return pool.length - 1;
}

// Picks one creature type from the lower-mid of the eligible band. The band already
// scales up with the budget (getMaxPoolIndex), so staying below its top end keeps the
// creature affordable enough to field a meaningful number of units instead of a few
// elites, closer to the intended feel and to the legacy army sizes.
function selectSingleUnitType(pool: UnitType[], maxIndex: number, seed: number): UnitType {
  const lowerBound = Math.floor(maxIndex * GUARD_BAND_LOW);
  const upperBound = Math.max(lowerBound, Math.floor(maxIndex * GUARD_BAND_HIGH));
  const span = upperBound - lowerBound + 1;
  const index = lowerBound + (seed % span);
  return pool[index];
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
