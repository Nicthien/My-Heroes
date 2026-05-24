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
    density: 0.34,
    blockingRatio: 0.06,
    scenicKinds: ["flower", "bush", "grass-tuft", "tree-oak", "rock-small"],
    obstacleKinds: ["grove-oak", "boulder-cluster"],
  },
  [TerrainType.FOREST]: {
    density: 0.72,
    blockingRatio: 0.2,
    scenicKinds: ["tree-pine", "tree-oak", "bush", "flower", "grass-tuft"],
    obstacleKinds: ["grove-pine", "grove-oak"],
  },
  [TerrainType.DIRT]: {
    density: 0.28,
    blockingRatio: 0.06,
    scenicKinds: ["bush", "rock-small", "grass-tuft", "flower"],
    obstacleKinds: ["boulder-cluster"],
  },
  [TerrainType.SAND]: {
    density: 0.2,
    blockingRatio: 0.04,
    scenicKinds: ["rock-small", "grass-tuft"],
    obstacleKinds: ["boulder-cluster"],
  },
  [TerrainType.SNOW]: {
    density: 0.44,
    blockingRatio: 0.13,
    scenicKinds: ["tree-pine", "rock-small", "tree-dead", "grass-tuft"],
    obstacleKinds: ["grove-pine", "boulder-cluster"],
  },
  [TerrainType.MOUNTAIN]: {
    density: 0.54,
    blockingRatio: 0.14,
    scenicKinds: ["rock-small", "tree-dead", "grass-tuft"],
    obstacleKinds: ["boulder-cluster"],
  },
  [TerrainType.SWAMP]: {
    density: 0.42,
    blockingRatio: 0.16,
    scenicKinds: ["tree-dead", "bush", "grass-tuft", "rock-small"],
    obstacleKinds: ["grove-dead", "boulder-cluster"],
  },
  [TerrainType.LAVA]: {
    density: 0.16,
    blockingRatio: 0.05,
    scenicKinds: ["rock-small"],
    obstacleKinds: ["boulder-cluster"],
  },
  [TerrainType.WATER]: {
    density: 0,
    blockingRatio: 0,
    scenicKinds: [],
    obstacleKinds: [],
  },
};

const NATURAL_WALL_DECOR_CHANCE = 0.18;

export function placeDecor(
  tiles: MapTile[][],
  width: number,
  height: number,
  rng: RNG,
): void {
  placeObjectScenery(tiles, width, height, rng);

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

      const conf = BIOME_DECOR[tile.terrain];
      if (!conf) continue;
      if (rng() > conf.density) continue;

      const blocking = rng() < conf.blockingRatio && !hasRoadOrObjectNearby(tiles, width, height, x, y, 1);
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

      const radius = tile.object.type === "town" ? 2 : tile.object.type === "building" ? 2 : 1;
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
  if (type === "town") return 0.28;
  if (type === "building") return 0.42;
  if (type === "resource") return 0.18;
  if (type === "monster") return 0.34;
  return 0.14;
}

function pickSceneryForTerrain(t: TerrainType, rng: RNG): DecorKind {
  switch (t) {
    case TerrainType.MOUNTAIN:
      return pick(rng, ["rock-small", "tree-dead", "grass-tuft"] as DecorKind[]);
    case TerrainType.SAND:
      return pick(rng, ["rock-small", "grass-tuft"] as DecorKind[]);
    case TerrainType.FOREST:
      return pick(rng, ["tree-pine", "tree-oak", "bush", "flower", "grass-tuft"] as DecorKind[]);
    case TerrainType.SWAMP:
      return pick(rng, ["tree-dead", "bush", "grass-tuft", "rock-small"] as DecorKind[]);
    case TerrainType.LAVA:
      return pick(rng, ["rock-small"] as DecorKind[]);
    default:
      return pick(rng, ["bush", "flower", "grass-tuft", "rock-small", "tree-oak"] as DecorKind[]);
  }
}

function pickBlockingForTerrain(t: TerrainType, rng: RNG): DecorKind | null {
  const conf = BIOME_DECOR[t];
  if (!conf || conf.obstacleKinds.length === 0) {
    return pick(rng, ["boulder-cluster", "grove-dead"] as DecorKind[]);
  }
  return pick(rng, conf.obstacleKinds);
}
