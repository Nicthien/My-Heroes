import { isTileTraversable } from "@/lib/game/engine";
import {
  getMapLayer,
  mapLevels,
  normalizeMapLevel,
  withActiveMapLayer,
} from "@/lib/game/map-levels";
import { AdventureBuildingType, type GameMap, type MapLevelId, type MapObject, type Position } from "@/lib/game/types";

/**
 * Vertical-transport adventure buildings (stargates and subterranean gates) that
 * teleport a hero to a paired object, possibly on the other map level.
 */
function isVerticalTransport(object: MapObject | undefined): boolean {
  return Boolean(
    object?.type === "adventure_building" &&
      (object.subtype === AdventureBuildingType.SUBTERRANEAN_GATE ||
        object.subtype === AdventureBuildingType.STARGATE),
  );
}

/**
 * Resolves the destination level + position for a subterranean gate / stargate
 * tile object, mirroring the human flow in moveHeroActions.ts: it reads the
 * object's `targetLevel` / `targetPosition` and only returns a result when the
 * target tile on the destination layer is passable.
 */
export function getSubterraneanGateTarget(
  fullMap: GameMap,
  object: MapObject | undefined,
): { level: MapLevelId; position: Position } | null {
  if (!isVerticalTransport(object) || !object?.targetPosition) return null;
  const level = normalizeMapLevel(object.targetLevel);
  const target = object.targetPosition;
  const targetMap = withActiveMapLayer(fullMap, level);
  const targetTile = targetMap.tiles[target.y]?.[target.x];
  if (!targetTile?.isPassable) return null;
  return { level, position: { x: target.x, y: target.y, level } };
}

/**
 * Finds a traversable landing tile around `target` on the given layer map. Used
 * after a teleport so the hero lands on a passable tile (the gate tile itself,
 * or one of its 4-neighbours if blocked).
 */
export function findTeleportLandingOnLayer(layerMap: GameMap, target: Position): Position | null {
  const positions: Position[] = [
    target,
    { x: target.x + 1, y: target.y },
    { x: target.x - 1, y: target.y },
    { x: target.x, y: target.y + 1 },
    { x: target.x, y: target.y - 1 },
  ];
  for (const position of positions) {
    const tile = layerMap.tiles[position.y]?.[position.x];
    if (isTileTraversable(tile)) return position;
  }
  return null;
}

/**
 * Locates a vertical-transport destination object by id across BOTH map levels.
 * Generalizes the former surface-only stargate lookup so paired objects on the
 * underground layer resolve correctly.
 */
export function findGateObjectOnAnyLevel(
  fullMap: GameMap,
  targetId: string | undefined,
): { level: MapLevelId; position: Position } | null {
  if (!targetId) return null;
  for (const layer of mapLevels(fullMap)) {
    for (const row of layer.tiles) {
      for (const tile of row) {
        if (tile.object?.id === targetId) {
          return { level: layer.id, position: { x: tile.x, y: tile.y, level: layer.id } };
        }
      }
    }
  }
  return null;
}

/** Re-export for callers that only need a layer's tiles by level. */
export { getMapLayer };
