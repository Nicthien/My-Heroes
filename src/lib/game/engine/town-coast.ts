import { GameMap, MapTile, Position } from "@/lib/game/types";

export const TOWN_BOAT_LAUNCH_RADIUS = 5;

function isBoatLaunchTile(tile: MapTile | undefined) {
  return Boolean(tile && tile.terrain === "water" && tile.movementCost < 999 && tile.object?.type !== "wall");
}

export function findTownBoatLaunchTile(
  map: GameMap,
  townPosition: Position,
  occupiedPositions: Position[] = [],
) {
  const occupied = new Set(occupiedPositions.map((position) => `${position.x},${position.y}`));
  const candidates: Position[] = [];

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

    const launch = candidates.find((position) =>
      isBoatLaunchTile(map.tiles[position.y]?.[position.x]) && !occupied.has(`${position.x},${position.y}`)
    );
    if (launch) return launch;
  }

  return null;
}

export function isTownCoastalForBoats(map: GameMap, townPosition: Position) {
  return Boolean(findTownBoatLaunchTile(map, townPosition));
}
