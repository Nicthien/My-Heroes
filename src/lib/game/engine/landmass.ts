import { createNoise2D } from "simplex-noise";
import { LandStyle } from "./template";
import { RNG, randRange } from "./rng";

export interface Landmass {
  land: boolean[][];
  coast: boolean[][];
  water: boolean[][];
}

interface IslandBlob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  power: number;
}

export function generateLandmass(width: number, height: number, rng: RNG, style: LandStyle = "islands"): Landmass {
  const noise = createNoise2D(rng);
  const blobs = style === "volcanic-crown"
    ? buildVolcanicCrownBlobs(rng)
    : buildIslandBlobs(width, height, rng);

  const land: boolean[][] = [];
  const water: boolean[][] = [];
  const coast: boolean[][] = [];

  for (let y = 0; y < height; y++) {
    land[y] = [];
    water[y] = [];
    coast[y] = [];
    for (let x = 0; x < width; x++) {
      const nx = width <= 1 ? 0.5 : x / (width - 1);
      const ny = height <= 1 ? 0.5 : y / (height - 1);
      const edge = Math.min(nx, ny, 1 - nx, 1 - ny);
      const edgeFade = smoothstep(0.01, 0.18, edge);
      const shape = blobs.reduce((best, blob) => {
        const dx = (nx - blob.cx) / blob.rx;
        const dy = (ny - blob.cy) / blob.ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        return Math.max(best, (1 - d) * blob.power);
      }, -1);
      const detail =
        noise(x * 0.095, y * 0.095) * 0.18 +
        noise(x * 0.23 + 41.7, y * 0.23 - 12.4) * 0.06;
      const threshold = style === "volcanic-crown" ? 0.11 : 0.08;
      const isLand = shape + detail + edgeFade * 0.16 > threshold && edge > 0.03;
      land[y][x] = isLand;
      water[y][x] = !isLand;
      coast[y][x] = false;
    }
  }

  addSmallIslands(land, water, width, height, rng, noise, style === "volcanic-crown" ? 2.2 : 1);
  smoothSingles(land, water, width, height);
  markCoast(land, coast, width, height);

  return { land, coast, water };
}

function buildIslandBlobs(width: number, height: number, rng: RNG): IslandBlob[] {
  const area = width * height;
  const blobCount = area >= 3600 ? 5 : area >= 1600 ? 4 : 3;
  const blobs: IslandBlob[] = [
    {
      cx: randRange(rng, 0.42, 0.58),
      cy: randRange(rng, 0.42, 0.58),
      rx: randRange(rng, 0.35, 0.48),
      ry: randRange(rng, 0.32, 0.46),
      power: randRange(rng, 0.92, 1.12),
    },
  ];

  for (let i = 1; i < blobCount; i++) {
    const angle = randRange(rng, 0, Math.PI * 2);
    const distance = randRange(rng, 0.2, 0.38);
    blobs.push({
      cx: clamp(0.5 + Math.cos(angle) * distance + randRange(rng, -0.08, 0.08), 0.16, 0.84),
      cy: clamp(0.5 + Math.sin(angle) * distance + randRange(rng, -0.08, 0.08), 0.16, 0.84),
      rx: randRange(rng, 0.18, 0.34),
      ry: randRange(rng, 0.16, 0.31),
      power: randRange(rng, 0.78, 1.05),
    });
  }

  return blobs;
}

function buildVolcanicCrownBlobs(rng: RNG): IslandBlob[] {
  return [
    { cx: randRange(rng, 0.47, 0.53), cy: randRange(rng, 0.46, 0.55), rx: 0.27, ry: 0.35, power: 1.14 },
    { cx: 0.19, cy: 0.18, rx: 0.18, ry: 0.17, power: 0.98 },
    { cx: 0.8, cy: 0.18, rx: 0.18, ry: 0.17, power: 0.98 },
    { cx: 0.17, cy: 0.78, rx: 0.2, ry: 0.17, power: 1.02 },
    { cx: 0.82, cy: 0.78, rx: 0.2, ry: 0.17, power: 1.02 },
    { cx: 0.13, cy: 0.5, rx: 0.11, ry: 0.12, power: 0.85 },
    { cx: 0.87, cy: 0.5, rx: 0.11, ry: 0.12, power: 0.85 },
  ];
}

function addSmallIslands(
  land: boolean[][],
  water: boolean[][],
  width: number,
  height: number,
  rng: RNG,
  noise: ReturnType<typeof createNoise2D>,
  multiplier = 1,
): void {
  const count = Math.max(2, Math.floor((width * height) / 900) * multiplier);
  for (let i = 0; i < count; i++) {
    const cx = randRange(rng, 0.06, 0.94) * (width - 1);
    const cy = randRange(rng, 0.06, 0.94) * (height - 1);
    const radius = randRange(rng, 2.2, Math.max(3, Math.min(width, height) * 0.09));
    for (let y = Math.max(1, Math.floor(cy - radius)); y <= Math.min(height - 2, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(1, Math.floor(cx - radius)); x <= Math.min(width - 2, Math.ceil(cx + radius)); x++) {
        const d = Math.hypot((x - cx) / radius, (y - cy) / (radius * randRange(rng, 0.75, 1.2)));
        if (d + noise(x * 0.31, y * 0.31) * 0.16 < 1) {
          land[y][x] = true;
          water[y][x] = false;
        }
      }
    }
  }
}

function smoothSingles(land: boolean[][], water: boolean[][], width: number, height: number): void {
  const next = land.map((row) => row.slice());
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const neighbors = countLandNeighbors(land, width, height, x, y);
      if (land[y][x] && neighbors <= 1) next[y][x] = false;
      if (!land[y][x] && neighbors >= 6) next[y][x] = true;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      land[y][x] = next[y][x];
      water[y][x] = !next[y][x];
    }
  }
}

function markCoast(land: boolean[][], coast: boolean[][], width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      coast[y][x] = land[y][x] && countLandNeighbors(land, width, height, x, y) < 8;
    }
  }
}

function countLandNeighbors(land: boolean[][], width: number, height: number, x: number, y: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (land[ny][nx]) count++;
    }
  }
  return count;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
