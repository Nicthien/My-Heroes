import { GameMap, MapTile, Position } from "@/lib/game/types";

export const TOWN_BOAT_LAUNCH_RADIUS = 5;

// A boat dropped into a tiny puddle is stranded, so a launch tile must belong to
// a body of water at least this many connected tiles large before we prefer it.
export const MIN_NAVIGABLE_WATER_TILES = 6;

function isBoatLaunchTile(tile: MapTile | undefined) {
  return Boolean(tile && tile.terrain === "water" && tile.movementCost < 999 && tile.object?.type !== "wall");
}

function tileAt(map: GameMap, x: number, y: number) {
  return map.tiles[y]?.[x];
}

// Flood-fills the connected water body containing `start`, using the same
// 8-direction + diagonal corner-blocking rules as adventure movement (a boat
// can only slip diagonally when both orthogonal side tiles are also water).
// Returns the number of reachable water tiles, capped at `cap` for cheapness.
function navigableWaterSize(map: GameMap, start: Position, cap: number): number {
  const startTile = tileAt(map, start.x, start.y);
  if (!isBoatLaunchTile(startTile)) return 0;

  const seen = new Set<string>([`${start.x},${start.y}`]);
  const stack: Position[] = [start];
  let count = 0;

  while (stack.length > 0 && count < cap) {
    const { x, y } = stack.pop()!;
    count++;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        if (!isBoatLaunchTile(tileAt(map, nx, ny))) continue;
        // Diagonal corner blocking: both orthogonal side tiles must be water too.
        if (dx !== 0 && dy !== 0) {
          if (!isBoatLaunchTile(tileAt(map, x + dx, y)) || !isBoatLaunchTile(tileAt(map, x, y + dy))) continue;
        }
        seen.add(key);
        stack.push({ x: nx, y: ny });
      }
    }
  }

  return count;
}

export function findTownBoatLaunchTile(
  map: GameMap,
  townPosition: Position,
  occupiedPositions: Position[] = [],
) {
  const occupied = new Set(occupiedPositions.map((position) => `${position.x},${position.y}`));
  const candidates: Position[] = [];
  // Closest free water tile of any size — used as a fallback when no large
  // enough body of water is in range, so a boat can still be built.
  let fallback: Position | null = null;

  for (let radius = 1; radius <= TOWN_BOAT_LAUNCH_RADIUS; radius++) {
    candidates.length = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const position = { x: townPosition.x + dx, y: townPosition.y + dy };
        if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) continue;
        candidates.push(position);
      }
    }

    candidates.sort((a, b) =>
      Math.abs(a.x - townPosition.x) + Math.abs(a.y - townPosition.y) -
      (Math.abs(b.x - townPosition.x) + Math.abs(b.y - townPosition.y))
    );

    for (const position of candidates) {
      if (occupied.has(`${position.x},${position.y}`)) continue;
      if (!isBoatLaunchTile(map.tiles[position.y]?.[position.x])) continue;
      if (!fallback) fallback = position;
      if (navigableWaterSize(map, position, MIN_NAVIGABLE_WATER_TILES) >= MIN_NAVIGABLE_WATER_TILES) {
        return position;
      }
    }
  }

  return fallback;
}

export function isTownCoastalForBoats(map: GameMap, townPosition: Position) {
  return Boolean(findTownBoatLaunchTile(map, townPosition));
}
