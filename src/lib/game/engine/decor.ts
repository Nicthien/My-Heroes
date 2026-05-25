import { DecorKind, MapTile, TerrainType } from "../types";
import { RNG, pick, randInt } from "./rng";

interface BiomeDecor {
  density: number; // 0..1 probabilité par tile
  blockingRatio: number; // proportion du décor qui est bloquant
  scenicKinds: DecorKind[];
  obstacleKinds: DecorKind[];
}

const BIOME_DECOR: Partial<Record<TerrainType, BiomeDecor>> = {
  [TerrainType.GRASS]: {
    density: 0.78,
    blockingRatio: 0.24,
    scenicKinds: ["flower", "bush", "grass-tuft", "tree-oak", "tree-pine", "rock-small"],
    obstacleKinds: [
      "grass-oak-copse",
      "grass-bramble-mound",
      "grass-flowering-hedge",
      "grass-reed-thicket",
      "grass-root-barricade",
      "grass-sapling-grove",
    ],
  },
  [TerrainType.FOREST]: {
    density: 0.94,
    blockingRatio: 0.36,
    scenicKinds: ["tree-pine", "tree-oak", "tree-dead", "bush", "flower", "grass-tuft"],
    obstacleKinds: [
      "forest-pine-grove",
      "forest-broadleaf-grove",
      "forest-underwood-thicket",
      "forest-stump-ferns",
      "forest-birch-pine-screen",
      "forest-deadfall",
    ],
  },
  [TerrainType.DIRT]: {
    density: 0.66,
    blockingRatio: 0.23,
    scenicKinds: ["bush", "rock-small", "grass-tuft", "flower", "tree-dead"],
    obstacleKinds: [
      "dirt-thorn-scrub",
      "dirt-dead-brush",
      "dirt-dry-log-barrier",
      "dirt-root-snarl",
      "dirt-cactus-brush",
      "dirt-bramble-ravine",
    ],
  },
  [TerrainType.SAND]: {
    density: 0.48,
    blockingRatio: 0.19,
    scenicKinds: ["rock-small", "grass-tuft"],
    obstacleKinds: [
      "sand-cactus-cluster",
      "sand-desert-scrub",
      "sand-palm-stump",
      "sand-agave-barrier",
      "sand-tumbleweed-heap",
      "sand-saltbush-clump",
    ],
  },
  [TerrainType.SNOW]: {
    density: 0.82,
    blockingRatio: 0.34,
    scenicKinds: ["tree-pine", "tree-oak", "rock-small", "tree-dead", "grass-tuft"],
    obstacleKinds: [
      "snow-pine-grove",
      "snow-birch-thicket",
      "snow-deadwood-barrier",
      "snow-bramble-mound",
      "snow-evergreen-drift",
      "snow-shrub-wall",
    ],
  },
  [TerrainType.MOUNTAIN]: {
    density: 0.78,
    blockingRatio: 0.38,
    scenicKinds: ["rock-small", "tree-dead", "grass-tuft"],
    obstacleKinds: [
      "mountain-pine-rock",
      "mountain-cliff-brush",
      "mountain-deadwood",
      "mountain-mossy-roots",
      "mountain-fir-grove",
      "mountain-rhododendron",
    ],
  },
  [TerrainType.SWAMP]: {
    density: 0.74,
    blockingRatio: 0.31,
    scenicKinds: ["tree-dead", "tree-oak", "bush", "grass-tuft", "rock-small"],
    obstacleKinds: [
      "swamp-willow-grove",
      "swamp-mangrove-tangle",
      "swamp-reed-thicket",
      "swamp-cypress-cluster",
      "swamp-bog-bramble",
      "swamp-fungus-log",
    ],
  },
  [TerrainType.LAVA]: {
    density: 0.24,
    blockingRatio: 0.08,
    scenicKinds: ["rock-small"],
    obstacleKinds: [
      "lava-charred-thorns",
      "lava-ember-roots",
      "lava-ash-fungus",
      "lava-scorched-deadwood",
      "lava-sulfur-shrub",
      "lava-obsidian-bramble",
    ],
  },
  [TerrainType.WATER]: {
    density: 0,
    blockingRatio: 0,
    scenicKinds: [],
    obstacleKinds: [],
  },
};

const NATURAL_WALL_DECOR_CHANCE = 0.26;
const MAZE_OBSTACLE_MIN_NEIGHBORS = 1;
const MAZE_OBJECT_CLEARANCE = 2;
const MAZE_ROAD_CLEARANCE_FOR_TOWNS = 2;

export function placeDecor(
  tiles: MapTile[][],
  width: number,
  height: number,
  rng: RNG,
): void {
  placeObjectScenery(tiles, width, height, rng);
  placeMazeObstacles(tiles, width, height, rng);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      // Ne pas mettre de décor sur les objets gameplay, ni sur les routes, ni sur les murs
      if (tile.object) {
        // Sur les murs naturels : ajoute un gros décor bloquant pour la lisibilité
        if (tile.object.type === "wall" && tile.object.subtype === "natural" && rng() < NATURAL_WALL_DECOR_CHANCE) {
          const kind = pickBlockingForTerrain(tile.terrain, rng);
          if (kind) tile.decor = { type: kind, blocking: true, variant: randInt(rng, 0, 2) };
        }
        continue;
      }
      if (tile.road) continue;
      // Préserve uniquement le décor BLOQUANT volontaire (sealing de pocket / maze obstacles
      // posés en amont). Les marqueurs scenic non-bloquants se laissent réécrire par la passe
      // principale pour conserver la richesse visuelle autour des objets.
      if (tile.decor?.blocking) continue;

      const conf = BIOME_DECOR[tile.terrain];
      if (!conf) continue;
      const organicDensity = getOrganicDecorDensity(conf.density, x, y, tile.terrain);
      if (rng() > organicDensity) continue;

      const nearRoadOrObject = hasRoadOrObjectNearby(tiles, width, height, x, y, 1);
      const blockingRatio = getOrganicBlockingRatio(conf.blockingRatio, x, y, tile.terrain);
      const blocking = rng() < blockingRatio && !nearRoadOrObject && !isInClearing(x, y, tile.terrain);
      const palette = blocking ? conf.obstacleKinds : conf.scenicKinds;
      if (palette.length === 0) continue;
      const kind = pick(rng, palette);
      tile.decor = { type: kind, blocking, variant: randInt(rng, 0, 2) };

      // Si bloquant : tile devient impassable
      if (blocking) {
        tile.isPassable = false;
        tile.movementCost = 999;
      }
    }
  }
}

function placeMazeObstacles(
  tiles: MapTile[][],
  width: number,
  height: number,
  rng: RNG,
): void {
  const candidates: Array<{ x: number; y: number; score: number }> = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tile = tiles[y][x];
      if (!canPlaceMazeObstacle(tiles, width, height, x, y)) continue;

      const score = mazeObstacleScore(tiles, width, height, x, y);
      if (score < mazeThreshold(tile.terrain)) continue;
      candidates.push({ x, y, score: score + rng() * 0.08 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    const tile = tiles[candidate.y][candidate.x];
    if (!canPlaceMazeObstacle(tiles, width, height, candidate.x, candidate.y)) continue;
    if (countBlockingNeighbors(tiles, width, height, candidate.x, candidate.y) < MAZE_OBSTACLE_MIN_NEIGHBORS && rng() < 0.3) continue;

    const kind = pickBlockingForTerrain(tile.terrain, rng);
    if (!kind) continue;
    tile.decor = { type: kind, blocking: true, variant: randInt(rng, 0, 2) };
    tile.isPassable = false;
    tile.movementCost = 999;
  }
}

function canPlaceMazeObstacle(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  const tile = tiles[y]?.[x];
  if (!tile || !tile.isPassable || tile.worldEdge || tile.object || tile.decor || tile.road) return false;
  if (tile.terrain === TerrainType.WATER || tile.terrain === TerrainType.LAVA) return false;
  if (hasTownOrGateNearby(tiles, width, height, x, y, MAZE_ROAD_CLEARANCE_FOR_TOWNS)) return false;
  if (hasObjectNearby(tiles, width, height, x, y, MAZE_OBJECT_CLEARANCE)) return false;
  if (wouldSealTinyPocket(tiles, width, height, x, y)) return false;
  return true;
}

function mazeObstacleScore(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const tile = tiles[y][x];
  const ridgeA = 1 - Math.abs(smoothTileNoise(x, y, 307) - 0.5) * 2;
  const ridgeB = 1 - Math.abs(smoothTileNoise(x + 11, y - 7, 401) - 0.5) * 2;
  const corridor = Math.max(ridgeA, ridgeB);
  const roughness = tile.terrain === TerrainType.FOREST || tile.terrain === TerrainType.SWAMP
    ? 0.12
    : tile.terrain === TerrainType.MOUNTAIN || tile.terrain === TerrainType.SNOW
      ? 0.08
      : 0;
  const roadPressure = hasRoadNearby(tiles, width, height, x, y, 2) ? -0.08 : 0.04;
  const neighborPressure = Math.min(countBlockingNeighbors(tiles, width, height, x, y), 5) * 0.045;
  return corridor + roughness + roadPressure + neighborPressure;
}

function mazeThreshold(terrain: TerrainType): number {
  switch (terrain) {
    case TerrainType.FOREST:
      return 0.36;
    case TerrainType.SWAMP:
      return 0.40;
    case TerrainType.SNOW:
    case TerrainType.MOUNTAIN:
      return 0.43;
    case TerrainType.GRASS:
      return 0.46;
    case TerrainType.DIRT:
      return 0.49;
    case TerrainType.SAND:
      return 0.54;
    default:
      return 0.72;
  }
}

function wouldSealTinyPocket(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  let openOrthogonal = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const tile = tiles[y + dy]?.[x + dx];
    if (tile && tile.isPassable && !tile.object && !tile.decor?.blocking && !tile.worldEdge) openOrthogonal++;
  }
  if (openOrthogonal <= 1) return true;

  let openAround = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tile = tiles[y + dy]?.[x + dx];
      if (tile && tile.isPassable && !tile.object && !tile.decor?.blocking && !tile.worldEdge) openAround++;
    }
  }
  return openAround <= 3;
}

function countBlockingNeighbors(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  let count = 0;
  for (let yy = y - 1; yy <= y + 1; yy++) {
    for (let xx = x - 1; xx <= x + 1; xx++) {
      if (xx === x && yy === y) continue;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      const tile = tiles[yy][xx];
      if (tile.object?.type === "wall" || tile.decor?.blocking || !tile.isPassable) count++;
    }
  }
  return count;
}

function hasObjectNearby(
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
      const object = tiles[ny][nx].object;
      if (object && object.type !== "wall") return true;
    }
  }
  return false;
}

function hasTownOrGateNearby(
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
      const object = tiles[ny][nx].object;
      if (object?.type === "town" || object?.type === "town_footprint" || object?.type === "gate") return true;
    }
  }
  return false;
}

function hasRoadNearby(
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
      if (tiles[ny][nx].road) return true;
    }
  }
  return false;
}

function hasRoadOrObjectNearby(
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
      const tile = tiles[ny][nx];
      if (tile.road || tile.object) return true;
    }
  }
  return false;
}

function getOrganicDecorDensity(base: number, x: number, y: number, terrain: TerrainType): number {
  const groveNoise = smoothTileNoise(x, y, 19);
  const clearingNoise = smoothTileNoise(x, y, 53);
  const terrainBoost = terrain === TerrainType.FOREST ? 0.14 : terrain === TerrainType.GRASS || terrain === TerrainType.SWAMP ? 0.1 : 0.05;
  const clustered = base + (groveNoise - 0.5) * 0.28 + terrainBoost;
  const clearing = clearingNoise > 0.9 ? 0.12 : 0;
  return clamp(clustered - clearing, 0.08, 0.97);
}

function getOrganicBlockingRatio(base: number, x: number, y: number, terrain: TerrainType): number {
  const obstacleNoise = smoothTileNoise(x, y, 91);
  const terrainBoost = terrain === TerrainType.FOREST ? 0.05 : terrain === TerrainType.SWAMP ? 0.03 : 0;
  return clamp(base + (obstacleNoise - 0.5) * 0.14 + terrainBoost, 0.03, 0.46);
}

function isInClearing(x: number, y: number, terrain: TerrainType): boolean {
  if (terrain !== TerrainType.GRASS && terrain !== TerrainType.FOREST && terrain !== TerrainType.SNOW && terrain !== TerrainType.SWAMP) {
    return false;
  }
  return smoothTileNoise(x, y, 131) > 0.93;
}

function smoothTileNoise(x: number, y: number, salt: number): number {
  let total = 0;
  let weight = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const w = dx === 0 && dy === 0 ? 4 : Math.abs(dx) + Math.abs(dy) === 1 ? 2 : 1;
      total += tileNoise(x + dx * 3, y + dy * 3, salt) * w;
      weight += w;
    }
  }
  return total / weight;
}

function tileNoise(x: number, y: number, salt: number): number {
  let value = 2166136261;
  const input = `${x}:${y}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function placeObjectScenery(
  tiles: MapTile[][],
  width: number,
  height: number,
  rng: RNG,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      if (!tile.object || tile.object.type === "wall") continue;

      const radius = tile.object.type === "town" ? 3 : tile.object.type === "building" ? 3 : 2;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (Math.abs(dx) + Math.abs(dy) > radius + 1) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const target = tiles[ny][nx];
          if (target.object || target.decor || target.road || target.terrain === TerrainType.WATER) continue;
          if (rng() > sceneryChance(tile.object.type)) continue;

          const kind = pickSceneryForTerrain(target.terrain, rng);
          target.decor = { type: kind, blocking: false, variant: randInt(rng, 0, 2) };
        }
      }
    }
  }
}

function sceneryChance(type: string): number {
  if (type === "town") return 0.48;
  if (type === "building") return 0.66;
  if (type === "resource") return 0.34;
  if (type === "monster") return 0.52;
  if (type === "adventure_building") return 0.46;
  return 0.28;
}

function pickSceneryForTerrain(t: TerrainType, rng: RNG): DecorKind {
  switch (t) {
    case TerrainType.MOUNTAIN:
      return pick(rng, ["rock-small", "tree-dead", "grass-tuft"] as DecorKind[]);
    case TerrainType.SAND:
      return pick(rng, ["rock-small", "grass-tuft"] as DecorKind[]);
    case TerrainType.FOREST:
      return pick(rng, ["tree-pine", "tree-oak", "tree-dead", "bush", "flower", "grass-tuft"] as DecorKind[]);
    case TerrainType.SWAMP:
      return pick(rng, ["tree-dead", "tree-oak", "bush", "grass-tuft", "rock-small"] as DecorKind[]);
    case TerrainType.LAVA:
      return pick(rng, ["rock-small"] as DecorKind[]);
    default:
      return pick(rng, ["bush", "flower", "grass-tuft", "rock-small", "tree-oak"] as DecorKind[]);
  }
}

function pickBlockingForTerrain(t: TerrainType, rng: RNG): DecorKind | null {
  const conf = BIOME_DECOR[t];
  if (!conf || conf.obstacleKinds.length === 0) {
    return pick(rng, ["boulder-cluster", "deadwood-thicket", "bramble-thicket"] as DecorKind[]);
  }
  return pick(rng, conf.obstacleKinds);
}
