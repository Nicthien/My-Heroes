import { GameMap, TerrainType } from "@/lib/game/types";

export const MAP_SIZES = {
  S: 36,
  M: 72,
  L: 108,
  XL: 144,
} as const;

export type MapSizeKey = keyof typeof MAP_SIZES;

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
