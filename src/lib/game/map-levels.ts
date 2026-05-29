import type { GameMap, MapLayer, MapLevelId, Position } from "./types";

export const SURFACE_LEVEL: MapLevelId = "surface";
export const UNDERGROUND_LEVEL: MapLevelId = "underground";

export function normalizeMapLevel(level: unknown): MapLevelId {
  return level === UNDERGROUND_LEVEL ? UNDERGROUND_LEVEL : SURFACE_LEVEL;
}

export function positionLevel(position: Position | undefined | null): MapLevelId {
  return normalizeMapLevel(position?.level);
}

export function levelPosition(position: Position, level: MapLevelId = positionLevel(position)): Position {
  return { x: position.x, y: position.y, level };
}

export function tileKey(position: Position, level: MapLevelId = positionLevel(position)): string {
  return `${level}:${position.x},${position.y}`;
}

export function legacyTileKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function normalizeExploredTileKey(key: string): string {
  return key.includes(":") ? key : `${SURFACE_LEVEL}:${key}`;
}

export function normalizeExploredTiles(keys: Iterable<string> | undefined | null): Set<string> {
  const result = new Set<string>();
  for (const key of keys ?? []) result.add(normalizeExploredTileKey(String(key)));
  return result;
}

export function getMapLayer(map: GameMap, level: MapLevelId = SURFACE_LEVEL): MapLayer {
  const selected = map.levels?.[level];
  if (selected) return selected;
  return {
    id: SURFACE_LEVEL,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    zones: map.zones,
  };
}

export function withActiveMapLayer(map: GameMap, level: MapLevelId = SURFACE_LEVEL): GameMap {
  const layer = getMapLayer(map, level);
  return {
    ...map,
    width: layer.width,
    height: layer.height,
    tiles: layer.tiles,
    activeLevel: layer.id,
    zones: layer.zones,
  };
}

export function mapLevels(map: GameMap): MapLayer[] {
  if (!map.levels?.underground) return [getMapLayer(map, SURFACE_LEVEL)];
  return [getMapLayer(map, SURFACE_LEVEL), getMapLayer(map, UNDERGROUND_LEVEL)];
}
