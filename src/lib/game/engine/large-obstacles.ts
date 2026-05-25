import { DecorKind, MapTile, TerrainType } from "../types";
import type { PlacementContext } from "./placement";
import type { RNG } from "./rng";

const MASSIF_FOOTPRINT = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
] as const;

const MASSIF_KINDS = {
  granite: "massif-mountain-granite-2x2",
  snowcap: "massif-mountain-snowcap-2x2",
  pine: "massif-mountain-pine-2x2",
  volcanic: "massif-mountain-volcanic-2x2",
  desert: "massif-mountain-desert-2x2",
  mossy: "massif-mountain-mossy-2x2",
} satisfies Record<string, DecorKind>;

interface Candidate {
  x: number;
  y: number;
  kind: DecorKind;
  score: number;
}

export function placeLargeMountainMassifs(ctx: PlacementContext): void {
  for (const zone of ctx.zoneGrid.meta) {
    const candidates = collectCandidates(ctx, zone.id);
    if (candidates.length === 0) continue;

    const freeLandTiles = candidates.length * 4;
    const target = getTargetMassifCount(freeLandTiles, zone.type, zone.baseTerrain);
    if (target <= 0) continue;

    candidates.sort((a, b) => b.score - a.score);

    let placed = 0;
    for (const candidate of candidates) {
      if (placed >= target) break;
      if (!canPlaceMassif(ctx, candidate.x, candidate.y, zone.id)) continue;
      placeMassif(ctx.tiles, candidate.x, candidate.y, candidate.kind, placed);
      placed++;
    }
  }
}

function collectCandidates(ctx: PlacementContext, zoneId: number): Candidate[] {
  const candidates: Candidate[] = [];
  const zone = ctx.zoneGrid.meta[zoneId];

  for (let y = 2; y < ctx.height - 3; y++) {
    for (let x = 2; x < ctx.width - 3; x++) {
      if (ctx.zoneGrid.tilesZone[y][x] !== zoneId) continue;
      if (!canPlaceMassif(ctx, x, y, zoneId)) continue;

      const terrain = dominantFootprintTerrain(ctx.tiles, x, y);
      const kind = pickMassifKind(terrain, zone.baseTerrain, ctx.rng);
      const score = scoreMassifCandidate(ctx, x, y, terrain, zone.baseTerrain);
      candidates.push({ x, y, kind, score });
    }
  }

  return candidates;
}

function getTargetMassifCount(freeLandTiles: number, zoneType: string, baseTerrain: TerrainType): number {
  const divisor = zoneType === "treasure" ? 70 : zoneType === "junction" ? 95 : 170;
  const terrainBonus =
    baseTerrain === TerrainType.MOUNTAIN || baseTerrain === TerrainType.SNOW || baseTerrain === TerrainType.FOREST
      ? 2
      : baseTerrain === TerrainType.SAND || baseTerrain === TerrainType.SWAMP
        ? 1
        : 0;
  const raw = Math.floor(freeLandTiles / divisor) + terrainBonus;
  const cap = zoneType === "player" ? 4 : zoneType === "junction" ? 7 : 11;
  return clamp(raw, 0, cap);
}

function canPlaceMassif(ctx: PlacementContext, x: number, y: number, zoneId: number): boolean {
  for (const offset of MASSIF_FOOTPRINT) {
    const tx = x + offset.x;
    const ty = y + offset.y;
    const tile = ctx.tiles[ty]?.[tx];
    if (!tile) return false;
    if (ctx.zoneGrid.tilesZone[ty][tx] !== zoneId) return false;
    if (!isOpenLandTile(tile)) return false;
  }

  if (hasNearbyRoadOrObject(ctx.tiles, ctx.width, ctx.height, x, y, 2)) return false;
  if (hasNearbyWorldEdge(ctx.tiles, ctx.width, ctx.height, x, y, 2)) return false;
  if (countOpenRingTiles(ctx.tiles, ctx.width, ctx.height, x, y) < 8) return false;

  return true;
}

function isOpenLandTile(tile: MapTile): boolean {
  return (
    tile.isPassable &&
    !tile.worldEdge &&
    tile.terrain !== TerrainType.WATER &&
    tile.terrain !== TerrainType.LAVA &&
    !tile.object &&
    !tile.decor &&
    !tile.road
  );
}

function hasNearbyRoadOrObject(tiles: MapTile[][], width: number, height: number, x: number, y: number, radius: number): boolean {
  for (let yy = y - radius; yy <= y + 1 + radius; yy++) {
    for (let xx = x - radius; xx <= x + 1 + radius; xx++) {
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      const tile = tiles[yy][xx];
      if (tile.road || tile.object || tile.decor?.blocking) return true;
    }
  }
  return false;
}

function hasNearbyWorldEdge(tiles: MapTile[][], width: number, height: number, x: number, y: number, radius: number): boolean {
  for (let yy = y - radius; yy <= y + 1 + radius; yy++) {
    for (let xx = x - radius; xx <= x + 1 + radius; xx++) {
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) return true;
      if (tiles[yy][xx].worldEdge) return true;
    }
  }
  return false;
}

function countOpenRingTiles(tiles: MapTile[][], width: number, height: number, x: number, y: number): number {
  let open = 0;
  for (let yy = y - 1; yy <= y + 2; yy++) {
    for (let xx = x - 1; xx <= x + 2; xx++) {
      const insideFootprint = xx >= x && xx <= x + 1 && yy >= y && yy <= y + 1;
      if (insideFootprint || xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      if (isOpenLandTile(tiles[yy][xx])) open++;
    }
  }
  return open;
}

function dominantFootprintTerrain(tiles: MapTile[][], x: number, y: number): TerrainType {
  const counts = new Map<TerrainType, number>();
  for (const offset of MASSIF_FOOTPRINT) {
    const terrain = tiles[y + offset.y][x + offset.x].terrain;
    counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
  }

  let best = tiles[y][x].terrain;
  let bestCount = 0;
  for (const [terrain, count] of counts) {
    if (count > bestCount) {
      best = terrain;
      bestCount = count;
    }
  }
  return best;
}

function pickMassifKind(terrain: TerrainType, baseTerrain: TerrainType, rng: RNG): DecorKind {
  const effectiveTerrain = terrain === TerrainType.GRASS ? baseTerrain : terrain;
  switch (effectiveTerrain) {
    case TerrainType.SNOW:
      return rng() < 0.75 ? MASSIF_KINDS.snowcap : MASSIF_KINDS.granite;
    case TerrainType.FOREST:
      return rng() < 0.78 ? MASSIF_KINDS.pine : MASSIF_KINDS.mossy;
    case TerrainType.SAND:
      return MASSIF_KINDS.desert;
    case TerrainType.SWAMP:
      return rng() < 0.62 ? MASSIF_KINDS.mossy : MASSIF_KINDS.granite;
    case TerrainType.DIRT:
      return rng() < 0.42 ? MASSIF_KINDS.desert : MASSIF_KINDS.granite;
    case TerrainType.MOUNTAIN:
      return rng() < 0.58 ? MASSIF_KINDS.granite : MASSIF_KINDS.pine;
    case TerrainType.LAVA:
      return MASSIF_KINDS.volcanic;
    default:
      return rng() < 0.5 ? MASSIF_KINDS.granite : MASSIF_KINDS.mossy;
  }
}

function scoreMassifCandidate(ctx: PlacementContext, x: number, y: number, terrain: TerrainType, baseTerrain: TerrainType): number {
  const mountainAffinity =
    terrain === TerrainType.MOUNTAIN ? 5 : terrain === TerrainType.FOREST || terrain === TerrainType.SNOW ? 3 : terrain === baseTerrain ? 2 : 0;
  const roughNeighbors = countRoughNeighbors(ctx.tiles, ctx.width, ctx.height, x, y);
  const centerDistance = Math.hypot(x - ctx.zoneGrid.meta[ctx.zoneGrid.tilesZone[y][x]].centerX, y - ctx.zoneGrid.meta[ctx.zoneGrid.tilesZone[y][x]].centerY);
  const centerPenalty = Math.max(0, 5 - centerDistance) * 0.12;
  const organicNoise = tileNoise(x, y, 707) * 2.4 + tileNoise(x + 4, y - 3, 911) * 1.2;
  return mountainAffinity + roughNeighbors * 0.45 + organicNoise - centerPenalty;
}

function countRoughNeighbors(tiles: MapTile[][], width: number, height: number, x: number, y: number): number {
  let count = 0;
  for (let yy = y - 3; yy <= y + 4; yy++) {
    for (let xx = x - 3; xx <= x + 4; xx++) {
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      const terrain = tiles[yy][xx].terrain;
      if (terrain === TerrainType.MOUNTAIN || terrain === TerrainType.FOREST || terrain === TerrainType.SNOW) count++;
    }
  }
  return count;
}

function placeMassif(tiles: MapTile[][], x: number, y: number, kind: DecorKind, index: number): void {
  const id = `large-mountain-${x}-${y}-${index}`;
  const anchorX = x + 1;
  const anchorY = y + 1;

  for (const offset of MASSIF_FOOTPRINT) {
    const tx = x + offset.x;
    const ty = y + offset.y;
    const tile = tiles[ty][tx];
    const isAnchor = tx === anchorX && ty === anchorY;

    tile.isPassable = false;
    tile.movementCost = 999;
    tile.road = undefined;
    tile.decor = isAnchor ? { type: kind, blocking: true, variant: index % 3 } : undefined;
    tile.object = {
      type: "wall",
      id: isAnchor ? id : `${id}-footprint-${tx}-${ty}`,
      subtype: isAnchor ? "large_mountain_anchor" : "large_mountain_footprint",
      targetId: id,
      name: "Massif",
    };
  }
}

function tileNoise(x: number, y: number, salt: number): number {
  let value = 2166136261;
  const input = `${x}:${y}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  value += value << 13;
  value ^= value >>> 7;
  value += value << 3;
  value ^= value >>> 17;
  value += value << 5;
  return (value >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
