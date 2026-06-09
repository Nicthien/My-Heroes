import { GameMap, TerrainType } from "@/lib/game/types";

export const MAP_SIZES = {
  S: 36,
  M: 72,
  L: 108,
  XL: 144,
} as const;

export type MapSizeKey = keyof typeof MAP_SIZES;

// Ko-fi donation page for the project.
export const KOFI_URL = "https://ko-fi.com/nthstudio";

export const TURN_TIMER_UNITS = ["minutes", "hours", "days"] as const;
export type TurnTimerUnit = (typeof TURN_TIMER_UNITS)[number];

const TURN_TIMER_UNIT_SECONDS: Record<TurnTimerUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

// Convert a creation-form turn-timer value to seconds, clamped to [1 min, 7 days].
export function turnTimerToSeconds(value: number, unit: TurnTimerUnit): number {
  const seconds = Math.round(Math.max(1, value) * TURN_TIMER_UNIT_SECONDS[unit]);
  return Math.min(Math.max(60, seconds), 7 * 86400);
}

export function randomSeedValue() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < 8; i++) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}

export function summarizeMap(map: GameMap) {
  const terrain: Record<string, number> = {};
  const objects: Record<string, number> = {};
  let objectTotal = 0;
  let roads = 0;
  let bridges = 0;
  let decor = 0;
  let blockingDecor = 0;
  let towns = 0;
  let neutralTowns = 0;

  for (const row of map.tiles) {
    for (const tile of row) {
      terrain[tile.terrain] = (terrain[tile.terrain] ?? 0) + 1;
      if (tile.road) {
        roads++;
        if (tile.terrain === TerrainType.WATER) bridges++;
      }
      if (tile.decor) {
        decor++;
        if (tile.decor.blocking) blockingDecor++;
      }
      if (tile.object) {
        objectTotal++;
        objects[tile.object.type] = (objects[tile.object.type] ?? 0) + 1;
        if (tile.object.type === "town") {
          towns++;
          if (tile.object.subtype === "neutral") neutralTowns++;
        }
      }
    }
  }

  return {
    terrain,
    objects,
    objectTotal,
    details: {
      zones: map.zones?.length ?? 0,
      roads,
      bridges,
      decor,
      blockingDecor,
      towns,
      neutralTowns,
    },
  };
}

export type PreviewStats = ReturnType<typeof summarizeMap>;
