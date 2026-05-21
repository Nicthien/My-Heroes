import { MapTile, Position, RoadType, TerrainType } from "../types";

interface RoadBuildOptions {
  allowWaterRoads?: boolean;
}

/** A* tolérant aux murs/objets : on cherche un chemin qui passe par les tiles passables. */
function findRoadPath(
  tiles: MapTile[][],
  width: number,
  height: number,
  start: Position,
  end: Position,
  options: RoadBuildOptions = {},
): Position[] {
  const allowWaterRoads = options.allowWaterRoads !== false;
  const openSet: { pos: Position; g: number; f: number; path: Position[] }[] = [];
  const closed = new Set<string>();
  const best = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
  const h = (a: Position, b: Position) => (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) * 50;
  openSet.push({ pos: start, g: 0, f: h(start, end), path: [start] });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const cur = openSet.shift()!;
    if (cur.pos.x === end.x && cur.pos.y === end.y) return cur.path;
    const key = `${cur.pos.x},${cur.pos.y}`;
    if (closed.has(key)) continue;
    closed.add(key);

    const neighbors: Position[] = [
      { x: cur.pos.x + 1, y: cur.pos.y },
      { x: cur.pos.x - 1, y: cur.pos.y },
      { x: cur.pos.x, y: cur.pos.y + 1 },
      { x: cur.pos.x, y: cur.pos.y - 1 },
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      const t = tiles[n.y][n.x];
      const isStartOrEnd =
        (n.x === start.x && n.y === start.y) || (n.x === end.x && n.y === end.y);
      // On peut traverser une tile non-passable seulement si c'est le départ/arrivée (château)
      if (!t.isPassable && !isStartOrEnd) continue;
      // Préfère terrain plat et déjà passable
      if (!allowWaterRoads && t.terrain === TerrainType.WATER && !isStartOrEnd) continue;
      if (t.terrain === TerrainType.WATER && !isStartOrEnd && !canBridgeWater(tiles, width, height, n.x, n.y)) continue;
      const wobble = ((n.x * 928371 + n.y * 523111) % 7) * 0.035;
      const bridgeCost = t.terrain === TerrainType.WATER ? 6 : 0;
      const cost = (t.movementCost === 999 ? 5 : t.movementCost) + bridgeCost + wobble;
      const g = cur.g + cost;
      const nKey = `${n.x},${n.y}`;
      if (g >= (best.get(nKey) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(nKey, g);
      openSet.push({
        pos: n,
        g,
        f: g + h(n, end),
        path: [...cur.path, n],
      });
    }
  }
  return [];
}

function findForcedRoadPath(
  tiles: MapTile[][],
  width: number,
  height: number,
  start: Position,
  end: Position,
  options: RoadBuildOptions = {},
): Position[] {
  const allowWaterRoads = options.allowWaterRoads !== false;
  const openSet: { pos: Position; g: number; f: number; path: Position[] }[] = [];
  const best = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
  const h = (a: Position, b: Position) => (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) * 50;
  openSet.push({ pos: start, g: 0, f: h(start, end), path: [start] });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const cur = openSet.shift()!;
    if (cur.pos.x === end.x && cur.pos.y === end.y) return cur.path;

    const key = `${cur.pos.x},${cur.pos.y}`;
    if (cur.g > (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
    best.set(key, cur.g);

    const neighbors: Position[] = [
      { x: cur.pos.x + 1, y: cur.pos.y },
      { x: cur.pos.x - 1, y: cur.pos.y },
      { x: cur.pos.x, y: cur.pos.y + 1 },
      { x: cur.pos.x, y: cur.pos.y - 1 },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      const tile = tiles[n.y][n.x];
      const isStartOrEnd =
        (n.x === start.x && n.y === start.y) || (n.x === end.x && n.y === end.y);
      if (tile.worldEdge && !isStartOrEnd) continue;
      if (isTownFootprint(tile)) continue;
      if (tile.object?.type === "wall" && isProtectedGateFlank(tiles, n.x, n.y)) continue;
      if (!allowWaterRoads && tile.terrain === TerrainType.WATER) continue;
      const waterCost = tile.terrain === TerrainType.WATER ? 4 : 0;
      const wallCost = tile.object?.type === "wall" ? 8 : 0;
      const blockingDecorCost = tile.decor?.blocking ? 4 : 0;
      const cost = (tile.movementCost === 999 ? 3 : tile.movementCost) + waterCost + wallCost + blockingDecorCost;
      const g = cur.g + cost;
      const nKey = `${n.x},${n.y}`;
      if (g >= (best.get(nKey) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(nKey, g);
      openSet.push({ pos: n, g, f: g + h(n, end), path: [...cur.path, n] });
    }
  }

  return [];
}

function findPathToNearestRoad(
  tiles: MapTile[][],
  width: number,
  height: number,
  start: Position,
  options: RoadBuildOptions = {},
): Position[] {
  const allowWaterRoads = options.allowWaterRoads !== false;
  const openSet: { pos: Position; g: number; path: Position[] }[] = [];
  const best = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
  openSet.push({ pos: start, g: 0, path: [start] });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.g - b.g);
    const cur = openSet.shift()!;
    const key = `${cur.pos.x},${cur.pos.y}`;
    if (cur.g > (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
    best.set(key, cur.g);

    const tile = tiles[cur.pos.y][cur.pos.x];
    const isStart = cur.pos.x === start.x && cur.pos.y === start.y;
    if (!isStart && tile.road) return cur.path;

    const neighbors: Position[] = [
      { x: cur.pos.x + 1, y: cur.pos.y },
      { x: cur.pos.x - 1, y: cur.pos.y },
      { x: cur.pos.x, y: cur.pos.y + 1 },
      { x: cur.pos.x, y: cur.pos.y - 1 },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      const nextTile = tiles[n.y][n.x];
      if (nextTile.worldEdge) continue;
      if (!nextTile.isPassable) continue;
      if (!allowWaterRoads && nextTile.terrain === TerrainType.WATER) continue;
      if (nextTile.terrain === TerrainType.WATER && !canBridgeWater(tiles, width, height, n.x, n.y)) continue;
      const wobble = ((n.x * 928371 + n.y * 523111) % 7) * 0.035;
      const bridgeCost = nextTile.terrain === TerrainType.WATER ? 6 : 0;
      const cost = (nextTile.movementCost === 999 ? 5 : nextTile.movementCost) + bridgeCost + wobble;
      const g = cur.g + cost;
      const nKey = `${n.x},${n.y}`;
      if (g >= (best.get(nKey) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(nKey, g);
      openSet.push({ pos: n, g, path: [...cur.path, n] });
    }
  }

  return [];
}

function canBridgeWater(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2) return false;

  const horizontalBanks = isLandForBridge(tiles[y][x - 1]) && isLandForBridge(tiles[y][x + 1]);
  const verticalBanks = isLandForBridge(tiles[y - 1][x]) && isLandForBridge(tiles[y + 1][x]);
  if (!horizontalBanks && !verticalBanks) return false;

  let nearbyWater = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (tiles[y + dy]?.[x + dx]?.terrain === TerrainType.WATER) nearbyWater++;
    }
  }

  return nearbyWater <= 9;
}

function isLandForBridge(tile: MapTile | undefined): boolean {
  return Boolean(tile && tile.terrain !== TerrainType.WATER && tile.isPassable);
}

function isTownFootprint(tile: MapTile | undefined): boolean {
  return tile?.object?.type === "town_footprint";
}

export function paintRoad(
  tiles: MapTile[][],
  path: Position[],
  type: RoadType,
  options: RoadBuildOptions = {},
): void {
  const allowWaterRoads = options.allowWaterRoads !== false;
  for (const p of path) {
    const tile = tiles[p.y][p.x];
    if (tile.worldEdge) continue;
    if (!allowWaterRoads && tile.terrain === TerrainType.WATER) continue;
    if (isTownFootprint(tile)) continue;
    if (isProtectedGateFlank(tiles, p.x, p.y)) continue;
    if (tile.object?.type === "wall") tile.object = undefined;
    if (tile.decor?.blocking) tile.decor = undefined;
    tile.isPassable = true;
    if (tile.movementCost === 999) tile.movementCost = tile.terrain === TerrainType.WATER ? 200 : 100;
    // N'overwrite pas une route paved par une dirt
    if (tile.road === "paved" && type === "dirt") continue;
    tile.road = type;
  }
}

function isProtectedGateFlank(tiles: MapTile[][], x: number, y: number): boolean {
  for (const neighbor of [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ]) {
    const object = tiles[neighbor.y]?.[neighbor.x]?.object;
    if (object?.type !== "gate" || !object.roadAxis) continue;
    const dx = x - neighbor.x;
    const dy = y - neighbor.y;
    if (object.roadAxis === "x" && dx === 0 && Math.abs(dy) === 1) return true;
    if (object.roadAxis === "y" && dy === 0 && Math.abs(dx) === 1) return true;
  }

  return false;
}

/** Trace une route entre tous les châteaux donnés. */
export function buildRoads(
  tiles: MapTile[][],
  width: number,
  height: number,
  townPositions: Position[],
  type: RoadType = "paved",
  options: RoadBuildOptions = {},
): void {
  for (const town of townPositions) ensureLocalRoadAccess(tiles, width, height, town, type, options);
  if (townPositions.length < 2) return;
  // MST simple : relier chaque ville à la plus proche déjà connectée
  const connected = [townPositions[0]];
  const remaining = townPositions.slice(1);

  while (remaining.length > 0) {
    let bestFrom = connected[0];
    let bestTo = remaining[0];
    let bestDist = Number.POSITIVE_INFINITY;
    let bestToIdx = 0;
    for (const c of connected) {
      for (let i = 0; i < remaining.length; i++) {
        const r = remaining[i];
        const d = Math.abs(c.x - r.x) + Math.abs(c.y - r.y);
        if (d < bestDist) {
          bestDist = d;
          bestFrom = c;
          bestTo = r;
          bestToIdx = i;
        }
      }
    }
    const path = findRoadPath(tiles, width, height, bestFrom, bestTo, options);
    if (path.length > 0) {
      paintRoad(tiles, path, type, options);
    } else {
      const forcedPath = findForcedRoadPath(tiles, width, height, bestFrom, bestTo, options);
      if (forcedPath.length > 0) paintRoad(tiles, forcedPath, type, options);
    }
    connected.push(bestTo);
    remaining.splice(bestToIdx, 1);
  }
}

/** Routes secondaires (dirt) entre château et mines proches. */
export function buildSecondaryRoads(
  tiles: MapTile[][],
  width: number,
  height: number,
  townPositions: Position[],
  miningPositions: Position[],
  maxDistance: number = 8,
  options: RoadBuildOptions = {},
): void {
  for (const mine of miningPositions) {
    const pathToRoad = findPathToNearestRoad(tiles, width, height, mine, options);
    if (pathToRoad.length > 0) {
      paintRoad(tiles, pathToRoad, "dirt", options);
      continue;
    }

    if (townPositions.length === 0) continue;

    let bestTown = townPositions[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const t of townPositions) {
      const d = Math.abs(t.x - mine.x) + Math.abs(t.y - mine.y);
      if (d < bestDist) {
        bestDist = d;
        bestTown = t;
      }
    }

    const shouldForceFallback = bestDist <= maxDistance || !tiles[mine.y][mine.x].road;
    const path = findRoadPath(tiles, width, height, bestTown, mine, options);
    if (path.length > 0) {
      paintRoad(tiles, path, "dirt", options);
    } else if (shouldForceFallback) {
      const forcedPath = findForcedRoadPath(tiles, width, height, bestTown, mine, options);
      if (forcedPath.length > 0) {
        paintRoad(tiles, forcedPath, "dirt", options);
      } else if (options.allowWaterRoads === false) {
        ensureLocalRoadAccess(tiles, width, height, mine, "dirt", options);
      }
    } else if (options.allowWaterRoads === false) {
      ensureLocalRoadAccess(tiles, width, height, mine, "dirt", options);
    }
  }
}

function ensureLocalRoadAccess(
  tiles: MapTile[][],
  width: number,
  height: number,
  start: Position,
  type: RoadType,
  options: RoadBuildOptions,
): void {
  const local: Position[] = [start];
  const queue: { pos: Position; distance: number }[] = [{ pos: start, distance: 0 }];
  const seen = new Set<string>([`${start.x},${start.y}`]);

  while (queue.length > 0 && local.length < 4) {
    const current = queue.shift()!;
    if (current.distance >= 3) continue;

    for (const next of [
      { x: current.pos.x + 1, y: current.pos.y },
      { x: current.pos.x - 1, y: current.pos.y },
      { x: current.pos.x, y: current.pos.y + 1 },
      { x: current.pos.x, y: current.pos.y - 1 },
    ]) {
      if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const tile = tiles[next.y][next.x];
      if (!tile.isPassable || isTownFootprint(tile) || tile.object?.type === "wall" || tile.decor?.blocking) continue;
      if (options.allowWaterRoads === false && tile.terrain === TerrainType.WATER) continue;

      local.push(next);
      queue.push({ pos: next, distance: current.distance + 1 });
      if (local.length >= 4) break;
    }
  }

  paintRoad(tiles, local, type, options);
}
