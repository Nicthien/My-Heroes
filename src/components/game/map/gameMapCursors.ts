import { MapObjectData, MapRenderer } from "@/lib/rendering/mapRenderer";
import { findPathToAdjacent, isTileTraversable } from "@/lib/game/engine";
import { GameState, Gate, Position } from "@/lib/game/types";
import { GAME_CURSORS } from "@/lib/ui/cursors";

export const ADVENTURE_CURSORS = {
  default: GAME_CURSORS.default,
  dragging: GAME_CURSORS.dragging,
  move: GAME_CURSORS.adventure.moveLand,
  visit: GAME_CURSORS.adventure.arriveLand,
  town: GAME_CURSORS.adventure.town,
  attack: GAME_CURSORS.adventure.attack,
  trade: GAME_CURSORS.adventure.trade,
  hero: GAME_CURSORS.adventure.hero,
  forbidden: GAME_CURSORS.forbidden,
} as const;

export function findGateAt(gameState: GameState, gateId: string, position: Position): Gate | undefined {
  const fromState = gameState.gates?.find((gate) =>
    gate.id === gateId || (gate.position.x === position.x && gate.position.y === position.y)
  );
  if (fromState) return fromState;

  const tile = gameState.map.tiles[position.y]?.[position.x];
  const object = tile?.object;
  if (object?.type !== "gate") return undefined;
  return {
    id: object.id,
    ownerId: object.ownerId ?? null,
    position: { x: position.x, y: position.y },
    guardianPower: object.guardianPower ?? 0,
    garrison: [],
  };
}

export function areAdjacentOrSame(a: Position, b: Position) {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

export function setMapContainerCursor(container: HTMLDivElement | null, cursor: string) {
  if (!container) return;
  container.style.cursor = cursor;
  container.querySelectorAll("canvas").forEach((canvas) => {
    canvas.style.cursor = cursor;
  });
}

export function getAdventureMapCursor({
  renderer,
  gameState,
  selectedHeroId,
  selectedTownId,
  currentPlayerId,
  visibleTiles,
  reachableTileKeys,
  activeCombatHeroIds,
  screenX,
  screenY,
}: {
  renderer: MapRenderer;
  gameState: GameState | null;
  selectedHeroId: string | null;
  selectedTownId: string | null;
  currentPlayerId: string | null;
  visibleTiles: Set<string> | null;
  reachableTileKeys: Set<string> | null;
  activeCombatHeroIds: Set<string>;
  screenX: number;
  screenY: number;
}) {
  if (!gameState || !selectedHeroId) return ADVENTURE_CURSORS.default;

  const hero = gameState.players.flatMap((player) => player.heroes).find((item) => item.id === selectedHeroId);
  if (!hero) return ADVENTURE_CURSORS.default;
  if (activeCombatHeroIds.has(hero.id)) return ADVENTURE_CURSORS.forbidden;

  const tile = renderer.getTileAtScreen(screenX, screenY);
  if (!tile) return ADVENTURE_CURSORS.default;

  const targetTile = gameState.map.tiles[tile.y]?.[tile.x];
  if (!targetTile) return ADVENTURE_CURSORS.forbidden;

  const tileKey = `${tile.x},${tile.y}`;
  const isReachableTile = reachableTileKeys?.has(tileKey) ?? false;

  const objects = filterClickThroughTownSpriteHits(
    renderer.getObjectsAtScreen(screenX, screenY),
    tile,
    targetTile,
    selectedHeroId
  );
  const selectedObject = selectObjectOnTile(objects, selectedHeroId, selectedTownId);
  const objectCursor = selectedObject
    ? getAdventureObjectCursor(selectedObject, gameState, currentPlayerId)
    : null;

  if (objectCursor) return objectCursor;

  if (targetTile.object?.type === "gate") {
    const gate = findGateAt(gameState, targetTile.object.id, tile);
    if (gate?.ownerId === currentPlayerId) return ADVENTURE_CURSORS.town;
    return (gate?.garrison ?? []).some((unit) => unit.count > 0) ? ADVENTURE_CURSORS.attack : ADVENTURE_CURSORS.move;
  }

  const tileObjectCursor = getAdventureTileObjectCursor(targetTile.object?.type);
  if (tileObjectCursor) return tileObjectCursor;

  if (isReachableTile) return ADVENTURE_CURSORS.move;
  if (visibleTiles && !visibleTiles.has(tileKey)) return ADVENTURE_CURSORS.forbidden;

  return isTileTraversable(targetTile)
    ? ADVENTURE_CURSORS.move
    : ADVENTURE_CURSORS.forbidden;
}

export function getCombatApproach(
  map: GameState["map"],
  start: Position,
  target: Position,
  movement: number
): { destination: Position; path: Position[]; targetPosition: Position } | null {
  const path = findPathToAdjacent(map, start, target, movement);
  const destination = path[path.length - 1];
  return destination ? { destination, path, targetPosition: target } : null;
}

function getAdventureObjectCursor(
  object: MapObjectData,
  gameState: GameState,
  currentPlayerId: string | null
) {
  if (object.type === "combat") return ADVENTURE_CURSORS.attack;
  if (object.type === "boat") return ADVENTURE_CURSORS.move;
  if (object.type === "gate") {
    const gate = findGateAt(gameState, object.id, { x: object.x, y: object.y });
    if (gate?.ownerId === currentPlayerId) return ADVENTURE_CURSORS.town;
    return (gate?.garrison ?? []).some((unit) => unit.count > 0) ? ADVENTURE_CURSORS.attack : ADVENTURE_CURSORS.move;
  }
  if (object.type === "adventure_building") return ADVENTURE_CURSORS.visit;
  if (object.type === "building") return ADVENTURE_CURSORS.visit;
  if (object.type === "town") {
    return object.playerId === currentPlayerId
      ? ADVENTURE_CURSORS.town
      : ADVENTURE_CURSORS.attack;
  }
  if (object.type === "hero" && currentPlayerId && object.playerId !== currentPlayerId) {
    return ADVENTURE_CURSORS.attack;
  }
  if (object.type === "hero") {
    return object.playerId === currentPlayerId ? ADVENTURE_CURSORS.hero : ADVENTURE_CURSORS.trade;
  }

  return null;
}

function getAdventureTileObjectCursor(type: string | undefined) {
  if (type === "monster" || type === "combat" || type === "gate") return ADVENTURE_CURSORS.attack;
  if (type === "resource") return ADVENTURE_CURSORS.visit;
  if (type === "building") return ADVENTURE_CURSORS.visit;
  if (type === "adventure_building") return ADVENTURE_CURSORS.visit;
  if (type === "wall" || type === "town_footprint") return ADVENTURE_CURSORS.forbidden;

  return null;
}

export function selectObjectOnTile(
  objects: MapObjectData[],
  selectedHeroId: string | null,
  selectedTownId: string | null
) {
  if (objects.length === 1) return objects[0];

  const combat = objects.find((obj) => obj.type === "combat");
  if (combat) return combat;

  const gate = objects.find((obj) => obj.type === "gate");
  if (gate) return gate;

  const boat = objects.find((obj) => obj.type === "boat");
  if (boat) return boat;

  const enemyBuilding = objects.find((obj) => obj.type === "building" && !obj.playerId);
  if (enemyBuilding) return enemyBuilding;

  const adventureBuilding = objects.find((obj) => obj.type === "adventure_building");
  if (adventureBuilding) return adventureBuilding;

  const hero = objects.find((obj) => obj.type === "hero");
  const town = objects.find((obj) => obj.type === "town");

  if (selectedTownId && hero) return hero;
  if (selectedHeroId && town) return town;

  return hero ?? town ?? objects[0];
}

export function filterClickThroughTownSpriteHits(
  objects: MapObjectData[],
  tile: Position | null,
  targetTile: GameState["map"]["tiles"][number][number] | undefined,
  selectedHeroId: string | null
) {
  if (!selectedHeroId || !tile || !targetTile || !isTileTraversable(targetTile)) return objects;

  return objects.filter((object) =>
    (object.type !== "town" && object.type !== "gate") ||
    (object.x === tile.x && object.y === tile.y)
  );
}
