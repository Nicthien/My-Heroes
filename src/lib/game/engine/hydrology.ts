import { MapTile, TerrainType } from "../types";
import { RNG, randInt, shuffle } from "./rng";

export function carveHydrology(
  tiles: MapTile[][],
  width: number,
  height: number,
  rng: RNG,
): void {
  const riverCount = Math.max(1, Math.floor((width * height) / 1400));
  const sources = findRiverSources(tiles, width, height, rng).slice(0, riverCount);

  for (const source of sources) {
    carveRiver(tiles, width, height, source.x, source.y, rng);
  }

  const lakeCount = Math.max(1, Math.floor((width * height) / 1800));
  carveLakes(tiles, width, height, rng, lakeCount);
}

function findRiverSources(
  tiles: MapTile[][],
  width: number,
  height: number,
  rng: RNG,
): { x: number; y: number }[] {
  const candidates: { x: number; y: number }[] = [];
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const tile = tiles[y][x];
      if (tile.terrain === TerrainType.MOUNTAIN || tile.elevation >= 2) {
        if (!hasNearbyWater(tiles, width, height, x, y, 3)) candidates.push({ x, y });
      }
    }
  }
  return shuffle(rng, candidates);
}

function carveRiver(
  tiles: MapTile[][],
  width: number,
  height: number,
  startX: number,
  startY: number,
  rng: RNG,
): void {
  let x = startX;
  let y = startY;
  const visited = new Set<string>();
  const maxSteps = width + height;

  for (let step = 0; step < maxSteps; step++) {
    const tile = tiles[y]?.[x];
    if (!tile) return;
    if (tile.terrain === TerrainType.WATER && step > 2) return;

    setWater(tile, step < 2 ? -1 : -2);
    softenBanks(tiles, width, height, x, y, rng);

    const key = `${x},${y}`;
    if (visited.has(key)) return;
    visited.add(key);

    const next = pickRiverNext(tiles, width, height, x, y, rng);
    if (!next) return;
    x = next.x;
    y = next.y;
  }
}

function pickRiverNext(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
  rng: RNG,
): { x: number; y: number } | null {
  const neighbors = shuffle(rng, [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ]).filter((p) => p.x > 0 && p.x < width - 1 && p.y > 0 && p.y < height - 1);

  if (neighbors.length === 0) return null;

  const scored = neighbors
    .map((p) => {
      const tile = tiles[p.y][p.x];
      const edgeDistance = Math.min(p.x, p.y, width - 1 - p.x, height - 1 - p.y);
      const waterBonus = tile.terrain === TerrainType.WATER ? -8 : 0;
      const coastPull = edgeDistance * 0.18;
      const relief = tile.elevation * 1.5;
      const jitter = rng() * 1.4;
      return { p, score: relief + coastPull + waterBonus + jitter };
    })
    .sort((a, b) => a.score - b.score);

  return scored[0]?.p ?? null;
}

function carveLakes(
  tiles: MapTile[][],
  width: number,
  height: number,
  rng: RNG,
  count: number,
): void {
  const candidates: { x: number; y: number }[] = [];
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      const tile = tiles[y][x];
      if (tile.terrain === TerrainType.GRASS || tile.terrain === TerrainType.SWAMP || tile.terrain === TerrainType.DIRT) {
        if (!hasNearbyWater(tiles, width, height, x, y, 2)) candidates.push({ x, y });
      }
    }
  }

  for (const center of shuffle(rng, candidates).slice(0, count)) {
    const radius = randInt(rng, 1, 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) continue;
        if (Math.abs(dx) + Math.abs(dy) <= radius + (rng() > 0.55 ? 1 : 0)) {
          setWater(tiles[y][x], -2);
          softenBanks(tiles, width, height, x, y, rng);
        }
      }
    }
  }
}

function softenBanks(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
  rng: RNG,
): void {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const tile = tiles[ny][nx];
    if (tile.terrain === TerrainType.GRASS && rng() > 0.45) {
      tile.terrain = TerrainType.SWAMP;
      tile.elevation = 0;
      tile.movementCost = 175;
    } else if (tile.terrain === TerrainType.DIRT && rng() > 0.5) {
      tile.terrain = TerrainType.GRASS;
      tile.elevation = 0;
      tile.movementCost = 100;
    }
  }
}

function setWater(tile: MapTile, elevation: number): void {
  if (tile.object) return;
  tile.terrain = TerrainType.WATER;
  tile.elevation = elevation;
  tile.isPassable = true;
  tile.movementCost = 200;
}

function hasNearbyWater(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (tiles[ny][nx].terrain === TerrainType.WATER) return true;
    }
  }
  return false;
}
