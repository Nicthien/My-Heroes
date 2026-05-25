import { MapTile, Position, RoadType, TerrainType } from "../types";

interface RoadBuildOptions {
  allowWaterRoads?: boolean;
}

type InvisibleAccessObjectType = NonNullable<MapTile["object"]>["type"];

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
      const roadReuseBonus = t.road ? -75 : 0;
      const cost = Math.max(1, (t.movementCost === 999 ? 5 : t.movementCost) + bridgeCost + roadReuseBonus + wobble);
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
      const roadReuseBonus = tile.road ? -75 : 0;
      const cost = Math.max(1, (tile.movementCost === 999 ? 3 : tile.movementCost) + waterCost + wallCost + blockingDecorCost + roadReuseBonus);
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
    if (townPositions.length === 0) continue;

    const { town: bestTown, distance: bestDist } = findBestTownForMine(tiles, townPositions, mine);

    const mineTile = tiles[mine.y][mine.x];
    const shouldForceFallback = bestDist <= maxDistance || !mineTile.road;
    if (isPrimaryStartingMine(tiles[mine.y][mine.x])) {
      const primaryPath = findForcedRoadPath(tiles, width, height, bestTown, mine, { ...options, allowWaterRoads: true });
      if (primaryPath.length > 0) {
        paintLandRoad(tiles, primaryPath, "dirt", options);
        ensureLocalRoadAccess(tiles, width, height, mine, "dirt", options);
        continue;
      }
    }

    const pathToRoad = findPathToNearestRoad(tiles, width, height, mine, options);
    if (pathToRoad.length > 0) {
      paintRoad(tiles, pathToRoad, "dirt", options);
      continue;
    }

    const path = findRoadPath(tiles, width, height, mine, bestTown, options);
    if (path.length > 0) {
      paintRoad(tiles, path, "dirt", options);
    } else if (shouldForceFallback) {
      const forcedPath = findForcedRoadPath(tiles, width, height, mine, bestTown, options);
      if (forcedPath.length > 0) {
        paintRoad(tiles, forcedPath, "dirt", options);
      } else {
        ensureLocalRoadAccess(tiles, width, height, mine, "dirt", options);
      }
    } else {
      ensureLocalRoadAccess(tiles, width, height, mine, "dirt", options);
    }
  }
}

function isPrimaryStartingMine(tile: MapTile | undefined): boolean {
  const role = tile?.object?.strategicRole;
  return role === "start_wood" || role === "start_ore";
}

function paintLandRoad(
  tiles: MapTile[][],
  path: Position[],
  type: RoadType,
  options: RoadBuildOptions,
): void {
  for (const position of path) {
    const tile = tiles[position.y][position.x];
    if (tile.terrain === TerrainType.WATER) {
      tile.terrain = TerrainType.GRASS;
      tile.elevation = 0;
      tile.isPassable = true;
      tile.movementCost = 100;
    }
  }
  paintRoad(tiles, path, type, { ...options, allowWaterRoads: true });
}

function findBestTownForMine(
  tiles: MapTile[][],
  townPositions: Position[],
  mine: Position,
): { town: Position; distance: number } {
  const mineOwner = tiles[mine.y]?.[mine.x]?.object?.ownerIndex;
  const ownerTown = typeof mineOwner === "number"
    ? townPositions.find((town) => tiles[town.y]?.[town.x]?.object?.subtype === `player-${mineOwner}`)
    : undefined;
  const candidates = ownerTown ? [ownerTown] : townPositions;

  let bestTown = candidates[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const town of candidates) {
    const distance = Math.abs(town.x - mine.x) + Math.abs(town.y - mine.y);
    if (distance < bestDist) {
      bestDist = distance;
      bestTown = town;
    }
  }

  return { town: bestTown, distance: bestDist };
}

export function ensureInvisibleAccessToObjects(
  tiles: MapTile[][],
  width: number,
  height: number,
  anchors: Position[],
  options: RoadBuildOptions = {},
): void {
  const landAnchors = anchors.filter((anchor) => isUsableInvisibleAccessTile(tiles[anchor.y]?.[anchor.x], options));
  if (landAnchors.length === 0) return;
  const roadPositions = collectRoadPositions(tiles, width, height);

  const objectTypes = new Set<InvisibleAccessObjectType>([
    "adventure_building",
    "artifact",
    "resource",
    "monster",
  ]);

  for (const row of tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (!object || !objectTypes.has(object.type)) continue;
      if (tile.terrain === TerrainType.WATER || tile.worldEdge) continue;

      const target = findBestInvisibleAccessTarget(tiles, width, height, tile, options, roadPositions);
      if (!target) continue;

      const start = findNearestAnchor(target, landAnchors);
      const path = findInvisibleAccessPath(tiles, width, height, start, target, options);
      if (path.length > 0) clearInvisibleAccessPath(tiles, path, options);
    }
  }
}

function findBestInvisibleAccessTarget(
  tiles: MapTile[][],
  width: number,
  height: number,
  objectTile: MapTile,
  options: RoadBuildOptions,
  roadPositions: Position[],
): Position | null {
  const candidates = getOrthogonalNeighbors(objectTile)
    .filter((position) => position.x >= 0 && position.x < width && position.y >= 0 && position.y < height)
    .filter((position) => canClearForInvisibleAccess(tiles[position.y][position.x], options));

  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => {
    const leftRoadDistance = distanceToNearestRoad(left, roadPositions);
    const rightRoadDistance = distanceToNearestRoad(right, roadPositions);
    return leftRoadDistance - rightRoadDistance;
  })[0];
}

function findNearestAnchor(target: Position, anchors: Position[]): Position {
  return anchors.reduce((best, anchor) =>
    manhattan(anchor, target) < manhattan(best, target) ? anchor : best
  , anchors[0]);
}

function findInvisibleAccessPath(
  tiles: MapTile[][],
  width: number,
  height: number,
  start: Position,
  end: Position,
  options: RoadBuildOptions,
): Position[] {
  const openSet: { pos: Position; g: number; f: number; path: Position[] }[] = [];
  const best = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
  openSet.push({ pos: start, g: 0, f: manhattan(start, end), path: [start] });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    const currentKey = `${current.pos.x},${current.pos.y}`;
    if (current.g > (best.get(currentKey) ?? Number.POSITIVE_INFINITY)) continue;
    if (current.pos.x === end.x && current.pos.y === end.y) return current.path;

    for (const next of getOrthogonalNeighbors(current.pos)) {
      if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
      const tile = tiles[next.y][next.x];
      if (!canClearForInvisibleAccess(tile, options)) continue;

      const cost = invisibleAccessCost(tile);
      const nextG = current.g + cost;
      const nextKey = `${next.x},${next.y}`;
      if (nextG >= (best.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(nextKey, nextG);
      openSet.push({
        pos: next,
        g: nextG,
        f: nextG + manhattan(next, end),
        path: [...current.path, next],
      });
    }
  }

  return [];
}

function clearInvisibleAccessPath(
  tiles: MapTile[][],
  path: Position[],
  options: RoadBuildOptions,
): void {
  for (const position of path) {
    const tile = tiles[position.y][position.x];
    if (!canClearForInvisibleAccess(tile, options)) continue;
    if (tile.decor?.blocking) tile.decor = undefined;
    tile.isPassable = true;
    if (tile.movementCost === 999) tile.movementCost = baseMovementCost(tile.terrain);
  }
}

function getOrthogonalNeighbors(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function canClearForInvisibleAccess(tile: MapTile | undefined, options: RoadBuildOptions): tile is MapTile {
  if (!tile || tile.worldEdge || isTownFootprint(tile)) return false;
  if (tile.object && tile.object.type !== "wall") return false;
  if (tile.object?.type === "wall") return false;
  if (tile.terrain === TerrainType.LAVA) return false;
  if (tile.terrain === TerrainType.WATER && options.allowWaterRoads === false) return false;
  if (tile.terrain === TerrainType.WATER) return false;
  return tile.isPassable || tile.decor?.blocking === true;
}

function isUsableInvisibleAccessTile(tile: MapTile | undefined, options: RoadBuildOptions): tile is MapTile {
  if (!tile || tile.worldEdge || !tile.isPassable || tile.decor?.blocking) return false;
  if (tile.object && tile.object.type !== "gate" && tile.object.type !== "town") return false;
  if (tile.terrain === TerrainType.WATER && options.allowWaterRoads === false) return false;
  return tile.terrain !== TerrainType.WATER && tile.terrain !== TerrainType.LAVA;
}

function invisibleAccessCost(tile: MapTile): number {
  const decorPenalty = tile.decor?.blocking ? 350 : 0;
  const roadBonus = tile.road ? -40 : 0;
  return Math.max(10, baseMovementCost(tile.terrain) + decorPenalty + roadBonus);
}

function baseMovementCost(terrain: TerrainType): number {
  switch (terrain) {
    case TerrainType.SAND:
    case TerrainType.FOREST:
    case TerrainType.SNOW:
      return 150;
    case TerrainType.SWAMP:
      return 175;
    case TerrainType.MOUNTAIN:
      return 250;
    case TerrainType.WATER:
      return 100;
    default:
      return 100;
  }
}

function collectRoadPositions(tiles: MapTile[][], width: number, height: number): Position[] {
  const roads: Position[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].road) roads.push({ x, y });
    }
  }
  return roads;
}

function distanceToNearestRoad(
  position: Position,
  roads: Position[],
): number {
  if (roads.length === 0) return 0;
  return roads.reduce((best, road) => Math.min(best, manhattan(position, road)), Number.POSITIVE_INFINITY);
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function ensureLocalRoadAccess(
  tiles: MapTile[][],
  width: number,
  height: number,
  start: Position,
  type: RoadType,
  options: RoadBuildOptions,
): void {
  const startTile = tiles[start.y]?.[start.x];
  if (startTile?.road && getOrthogonalNeighbors(start).some((neighbor) => tiles[neighbor.y]?.[neighbor.x]?.road)) {
    return;
  }

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
