import { createNoise2D } from "simplex-noise";
import { MapTile, TerrainType, ZoneMeta } from "../types";
import { Landmass } from "./landmass";
import { RNG, randInt, randRange } from "./rng";
import { MapTemplate } from "./template";

export interface ZoneGrid {
  /** `tilesZone[y][x] = zoneId` (index dans `meta`) */
  tilesZone: number[][];
  meta: ZoneMeta[];
}

/** Place les centres Voronoi + assigne chaque tile a la zone la plus proche. */
export function buildZoneGrid(
  template: MapTemplate,
  width: number,
  height: number,
  rng?: RNG,
  landmass?: Landmass,
): ZoneGrid {
  const meta: ZoneMeta[] = template.zones.map((z, idx) => ({
    id: idx,
    templateZoneId: z.id,
    type: z.type,
    ownerIndex: z.ownerIndex,
    centerX: Math.round(jitterNormalized(z.nx, rng) * (width - 1)),
    centerY: Math.round(jitterNormalized(z.ny, rng) * (height - 1)),
    baseTerrain: z.baseTerrain,
    value: z.value,
    hasTown: z.hasTown,
    townIsNeutral: z.townIsNeutral,
  }));

  if (landmass) {
    for (const zone of meta) {
      const snapped = snapToLand(landmass, width, height, zone.centerX, zone.centerY, rng);
      zone.centerX = snapped.x;
      zone.centerY = snapped.y;
    }
  }

  const tilesZone: number[][] = [];
  for (let y = 0; y < height; y++) {
    tilesZone[y] = [];
    for (let x = 0; x < width; x++) {
      let bestId = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let i = 0; i < meta.length; i++) {
        const zone = meta[i];
        const tpl = template.zones[i];
        const dx = x - zone.centerX;
        const dy = y - zone.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy) / Math.max(0.1, tpl.sizeWeight);
        if (dist < bestScore) {
          bestScore = dist;
          bestId = i;
        }
      }
      tilesZone[y][x] = bestId;
    }
  }

  return { tilesZone, meta };
}

/** Genere le terrain de chaque tile selon sa zone, puis applique la silhouette archipel. */
export function generateZoneTerrain(
  tiles: MapTile[][],
  zoneGrid: ZoneGrid,
  width: number,
  height: number,
  rng: RNG,
  landmass?: Landmass,
): void {
  const noise = createNoise2D(rng);
  const scale = 0.18;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const zone = zoneGrid.meta[zoneGrid.tilesZone[y][x]];
      const base = zone.baseTerrain;
      const n = (noise(x * scale, y * scale) + 1) / 2;

      let terrain = base;
      let elevation = baseElevation(base);

      if (landmass?.water[y]?.[x]) {
        terrain = TerrainType.WATER;
        elevation = -2;
      } else if (landmass?.coast[y]?.[x]) {
        terrain = TerrainType.SAND;
        elevation = 0;
      } else if (base === TerrainType.GRASS) {
        if (n > 0.79) {
          terrain = TerrainType.FOREST;
          elevation = 1;
        } else if (n < 0.13) {
          terrain = TerrainType.DIRT;
        }
      } else if (base === TerrainType.FOREST) {
        if (n < 0.18) {
          terrain = TerrainType.GRASS;
          elevation = 0;
        } else if (n > 0.82) {
          terrain = TerrainType.MOUNTAIN;
          elevation = 3;
        }
      } else if (base === TerrainType.SAND) {
        const coastDistance = landmass ? distanceToCoast(landmass, width, height, x, y, 3) : 4;
        if (n > 0.85 && coastDistance > 1) {
          terrain = TerrainType.MOUNTAIN;
          elevation = 3;
        } else if (n < 0.18 && coastDistance > 2) {
          terrain = TerrainType.DIRT;
        }
      } else if (base === TerrainType.SNOW) {
        if (n > 0.78) {
          terrain = TerrainType.MOUNTAIN;
          elevation = 3;
        }
      } else if (base === TerrainType.DIRT) {
        if (n > 0.82) {
          terrain = TerrainType.GRASS;
        } else if (n < 0.1) {
          terrain = TerrainType.MOUNTAIN;
          elevation = 2;
        }
      } else if (base === TerrainType.SWAMP) {
        if (n > 0.84) {
          terrain = TerrainType.WATER;
          elevation = -1;
        } else if (n < 0.18) {
          terrain = TerrainType.FOREST;
          elevation = 1;
        }
      } else if (base === TerrainType.MOUNTAIN) {
        if (n < 0.16) {
          terrain = TerrainType.DIRT;
          elevation = 1;
        } else if (n > 0.9) {
          terrain = TerrainType.LAVA;
          elevation = 1;
        }
      } else if (base === TerrainType.LAVA) {
        if (n < 0.42) {
          terrain = TerrainType.DIRT;
          elevation = 0;
        } else if (n < 0.72) {
          terrain = TerrainType.MOUNTAIN;
          elevation = 3;
        } else {
          terrain = TerrainType.LAVA;
          elevation = 1;
        }
      }

      tiles[y][x] = {
        x,
        y,
        terrain,
        elevation,
        isPassable: isPassableTerrain(terrain),
        movementCost: movementCostFor(terrain),
        zoneId: zoneGrid.tilesZone[y][x],
      };
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      if ((tile.terrain === TerrainType.GRASS || tile.terrain === TerrainType.DIRT) && !landmass?.coast[y]?.[x]) {
        if (randRange(rng, 0, 1) > 0.92) tile.elevation = 1;
      }
    }
  }
}

function jitterNormalized(value: number, rng?: RNG): number {
  if (!rng) return value;
  return Math.min(0.9, Math.max(0.1, value + randRange(rng, -0.055, 0.055)));
}

function snapToLand(
  landmass: Landmass,
  width: number,
  height: number,
  x: number,
  y: number,
  rng?: RNG,
): { x: number; y: number } {
  if (landmass.land[y]?.[x] && !landmass.coast[y]?.[x]) return { x, y };
  for (let r = 1; r < Math.max(width, height); r++) {
    const candidates: { x: number; y: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (landmass.land[ny]?.[nx] && !landmass.coast[ny]?.[nx]) candidates.push({ x: nx, y: ny });
      }
    }
    if (candidates.length > 0) {
      return rng ? candidates[randInt(rng, 0, candidates.length - 1)] : candidates[0];
    }
  }
  return { x, y };
}

function distanceToCoast(
  landmass: Landmass,
  width: number,
  height: number,
  x: number,
  y: number,
  maxRadius: number,
): number {
  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (landmass.coast[ny]?.[nx]) return r;
      }
    }
  }
  return maxRadius + 1;
}

function baseElevation(t: TerrainType): number {
  switch (t) {
    case TerrainType.WATER:
      return -2;
    case TerrainType.MOUNTAIN:
      return 3;
    case TerrainType.SNOW:
      return 2;
    case TerrainType.LAVA:
      return 2;
    case TerrainType.FOREST:
      return 1;
    default:
      return 0;
  }
}

function isPassableTerrain(t: TerrainType): boolean {
  return t !== TerrainType.LAVA;
}

function movementCostFor(t: TerrainType): number {
  switch (t) {
    case TerrainType.GRASS:
    case TerrainType.DIRT:
      return 1;
    case TerrainType.SAND:
    case TerrainType.FOREST:
      return 1.5;
    case TerrainType.SWAMP:
    case TerrainType.SNOW:
    case TerrainType.WATER:
      return 2;
    case TerrainType.MOUNTAIN:
      return 2.5;
    default:
      return 999;
  }
}

/** Tiles d'une zone qui touchent une autre zone donnee (frontiere). */
export function findBorderTiles(
  zoneGrid: ZoneGrid,
  width: number,
  height: number,
  zoneA: number,
  zoneB: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (zoneGrid.tilesZone[y][x] !== zoneA) continue;
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (zoneGrid.tilesZone[ny][nx] === zoneB) {
          out.push({ x, y });
          break;
        }
      }
    }
  }
  return out;
}

export function tilesInZone(
  zoneGrid: ZoneGrid,
  width: number,
  height: number,
  zoneId: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (zoneGrid.tilesZone[y][x] === zoneId) out.push({ x, y });
    }
  }
  return out;
}
