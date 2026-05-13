import { DecorKind, MapTile, TerrainType } from "../types";
import { RNG, pick, randInt } from "./rng";

interface BiomeDecor {
  density: number; // 0..1 probabilité par tile
  blockingRatio: number; // proportion du décor qui est bloquant
  kinds: DecorKind[];
  blockingKinds: DecorKind[];
}

const BIOME_DECOR: Partial<Record<TerrainType, BiomeDecor>> = {
  [TerrainType.GRASS]: {
    density: 0.24,
    blockingRatio: 0.15,
    kinds: ["flower", "bush", "grass-tuft", "tree-oak", "rock-small"],
    blockingKinds: ["tree-oak", "rock-small"],
  },
  [TerrainType.FOREST]: {
    density: 0.75,
    blockingRatio: 0.55,
    kinds: ["tree-pine", "tree-oak", "bush", "flower", "grass-tuft"],
    blockingKinds: ["tree-pine", "tree-oak", "rock-large"],
  },
  [TerrainType.DIRT]: {
    density: 0.18,
    blockingRatio: 0.2,
    kinds: ["bush", "rock-small", "grass-tuft", "flower"],
    blockingKinds: ["rock-small", "rock-large"],
  },
  [TerrainType.SAND]: {
    density: 0.12,
    blockingRatio: 0.12,
    kinds: ["rock-small", "grass-tuft"],
    blockingKinds: ["rock-large"],
  },
  [TerrainType.SNOW]: {
    density: 0.35,
    blockingRatio: 0.4,
    kinds: ["tree-pine", "rock-small", "tree-dead", "grass-tuft"],
    blockingKinds: ["tree-pine", "rock-large"],
  },
  [TerrainType.MOUNTAIN]: {
    density: 0.5,
    blockingRatio: 0.75,
    kinds: ["rock-large", "rock-small", "tree-dead", "grass-tuft"],
    blockingKinds: ["rock-large", "rock-small"],
  },
  [TerrainType.SWAMP]: {
    density: 0.32,
    blockingRatio: 0.35,
    kinds: ["tree-dead", "bush", "grass-tuft", "rock-small"],
    blockingKinds: ["tree-dead", "rock-small"],
  },
  [TerrainType.LAVA]: {
    density: 0.18,
    blockingRatio: 0.15,
    kinds: ["rock-small", "rock-large"],
    blockingKinds: ["rock-large"],
  },
  [TerrainType.WATER]: {
    density: 0,
    blockingRatio: 0,
    kinds: [],
    blockingKinds: [],
  },
};

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
        if (tile.object.type === "wall" && tile.object.subtype === "natural") {
          const kind = pickBlockingForTerrain(tile.terrain, rng);
          if (kind) tile.decor = { type: kind, blocking: true, variant: randInt(rng, 0, 2) };
        }
        continue;
      }
      if (tile.road) continue;

      const conf = BIOME_DECOR[tile.terrain];
      if (!conf) continue;
      if (rng() > conf.density) continue;

      const blocking = rng() < conf.blockingRatio;
      const palette = blocking ? conf.blockingKinds : conf.kinds;
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
      return pick(rng, ["rock-small", "rock-large", "tree-dead", "grass-tuft"] as DecorKind[]);
    case TerrainType.SAND:
      return pick(rng, ["rock-small", "grass-tuft"] as DecorKind[]);
    case TerrainType.FOREST:
      return pick(rng, ["tree-pine", "tree-oak", "bush", "flower", "grass-tuft"] as DecorKind[]);
    case TerrainType.SWAMP:
      return pick(rng, ["tree-dead", "bush", "grass-tuft", "rock-small"] as DecorKind[]);
    case TerrainType.LAVA:
      return pick(rng, ["rock-small", "rock-large"] as DecorKind[]);
    default:
      return pick(rng, ["bush", "flower", "grass-tuft", "rock-small", "tree-oak"] as DecorKind[]);
  }
}

function pickBlockingForTerrain(t: TerrainType, rng: RNG): DecorKind | null {
  const conf = BIOME_DECOR[t];
  if (!conf || conf.blockingKinds.length === 0) {
    return pick(rng, ["rock-large", "tree-dead"] as DecorKind[]);
  }
  return pick(rng, conf.blockingKinds);
}
