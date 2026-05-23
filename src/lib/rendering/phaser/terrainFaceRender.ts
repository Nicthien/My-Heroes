import Phaser from "phaser";
import { GameMap, MapTile, type Position, TerrainType } from "@/lib/game/types";
import { BASE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";
import {
  type CubeFace,
  type CubeFaceQuad,
  getCubeCorners,
  getCubeFacePoints,
} from "@/lib/rendering/phaser/isoCube";
import {
  TERRAIN_FACE_RENDER_ORDER,
  VISUAL_ELEVATION_SCALE,
} from "@/lib/rendering/phaser/mapRenderSettings";
import { hashTile, lerpPoint } from "@/lib/rendering/phaser/pointMath";
import { TERRAIN_TOP } from "@/lib/rendering/phaser/terrainColors";

export type TerrainSideExposure = {
  bottomDepth: number;
  neighborTerrain?: TerrainType;
};

export type TerrainSideVisibility = {
  SW: TerrainSideExposure | null;
  SE: TerrainSideExposure | null;
};

export type TerrainSideFacePoints = CubeFaceQuad;

export function getTileDepth(tile: MapTile) {
  if (tile.terrain === TerrainType.WATER) return BASE_HEIGHT;

  const elevation = tile.worldEdge?.rimHeight ?? tile.elevation;
  return BASE_HEIGHT + Math.max(0, elevation) * VISUAL_ELEVATION_SCALE;
}

export function getMaxTileDepth(map: GameMap) {
  let maxDepth = 0;
  for (const row of map.tiles) {
    for (const tile of row) {
      maxDepth = Math.max(maxDepth, getTileDepth(tile));
    }
  }
  return maxDepth || BASE_HEIGHT;
}

export function getTerrainSideExposure(depth: number, neighbor: MapTile | undefined): TerrainSideExposure | null {
  const bottomDepth = neighbor ? getTileDepth(neighbor) : 0;
  return bottomDepth < depth ? { bottomDepth, neighborTerrain: neighbor?.terrain } : null;
}

export function getTerrainSideFaceColor(terrain: TerrainType, baseColor: number, exposure: TerrainSideExposure) {
  const surfaceColor = TERRAIN_TOP[terrain] ?? baseColor;
  const neighborColor = exposure.neighborTerrain ? TERRAIN_TOP[exposure.neighborTerrain] ?? surfaceColor : surfaceColor;
  const surfaceBlend = terrain === TerrainType.MOUNTAIN ? 0.28 : 0.18;
  const neighborBlend = terrain === TerrainType.MOUNTAIN ? 0.08 : 0.05;
  return blendRgb(blendRgb(baseColor, surfaceColor, surfaceBlend), neighborColor, neighborBlend);
}

export function getTerrainTopStroke(terrain: TerrainType) {
  if (terrain === TerrainType.WATER) return { width: 0, color: 0x000000, alpha: 0 };
  if (terrain === TerrainType.MOUNTAIN) return { width: 0.8, color: 0x384144, alpha: 0.34 };
  if (terrain === TerrainType.SAND) return { width: 0.8, color: 0x7b5b2d, alpha: 0.24 };
  return { width: 0.8, color: 0x1f241f, alpha: 0.28 };
}

export function drawTerrainSideDetails(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  visibleSides: TerrainSideVisibility,
  isoX: number,
  isoY: number,
  depth: number
) {
  for (const face of TERRAIN_FACE_RENDER_ORDER) {
    const exposure = visibleSides[face];
    if (!exposure) continue;
    drawTerrainSideDetailLines(graphics, tile, face, isoX, isoY, depth, exposure.bottomDepth);
  }
}

export function drawTerrainSideEdges(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  visibleSides: TerrainSideVisibility,
  isoX: number,
  isoY: number,
  depth: number
) {
  const edgeColor = tile.terrain === TerrainType.MOUNTAIN ? 0x303a3d : tile.terrain === TerrainType.WATER ? 0x0b5f8c : 0x1f241f;
  const lipColor = tile.terrain === TerrainType.MOUNTAIN ? 0xe0e5e1 : tile.terrain === TerrainType.WATER ? 0x9ce8ff : 0xffffff;
  const bottomColor = tile.terrain === TerrainType.MOUNTAIN ? 0x151b1d : tile.terrain === TerrainType.WATER ? 0x063655 : 0x161916;
  const edgeAlpha = tile.terrain === TerrainType.MOUNTAIN ? 0.5 : tile.terrain === TerrainType.WATER ? 0.42 : 0.56;
  const bottomAlpha = tile.terrain === TerrainType.MOUNTAIN ? 0.28 : tile.terrain === TerrainType.WATER ? 0.34 : 0.32;
  const lipAlpha = tile.terrain === TerrainType.MOUNTAIN ? 0.24 : tile.terrain === TerrainType.WATER ? 0.52 : 0.32;

  for (const face of TERRAIN_FACE_RENDER_ORDER) {
    const exposure = visibleSides[face];
    if (!exposure) continue;

    const points = getCubeFacePoints(face, getCubeCorners(isoX, isoY, depth, exposure.bottomDepth));

    graphics.lineStyle(1.1, edgeColor, edgeAlpha);
    graphics.beginPath();
    graphics.moveTo(points.topA.x, points.topA.y);
    graphics.lineTo(points.bottomA.x, points.bottomA.y);
    graphics.moveTo(points.topB.x, points.topB.y);
    graphics.lineTo(points.bottomB.x, points.bottomB.y);
    graphics.strokePath();

    graphics.lineStyle(1, bottomColor, bottomAlpha);
    graphics.beginPath();
    graphics.moveTo(points.bottomA.x, points.bottomA.y);
    graphics.lineTo(points.bottomB.x, points.bottomB.y);
    graphics.strokePath();

    graphics.lineStyle(1, lipColor, lipAlpha);
    graphics.beginPath();
    graphics.moveTo(points.topA.x, points.topA.y);
    graphics.lineTo(points.topB.x, points.topB.y);
    graphics.strokePath();
  }
}

function drawTerrainSideDetailLines(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  face: CubeFace,
  isoX: number,
  isoY: number,
  depth: number,
  bottomDepth: number
) {
  const drop = depth - bottomDepth;
  if (drop <= 0) return;

  const { topA, topB, bottomA, bottomB } = getCubeFacePoints(face, getCubeCorners(isoX, isoY, depth, bottomDepth));

  const palette = getTerrainSideDetailPalette(tile.terrain);
  const seed = hashTile(tile.x + (face === "SW" ? 17 : 43), tile.y + (face === "SW" ? 61 : 29));

  graphics.lineStyle(1, palette.highlight, face === "SW" ? palette.highlightAlpha : palette.highlightAlpha * 0.82);
  graphics.beginPath();
  graphics.moveTo(topA.x, topA.y);
  graphics.lineTo(topB.x, topB.y);
  graphics.strokePath();

  if (tile.terrain === TerrainType.MOUNTAIN) {
    drawMountainCliffDetails(graphics, topA, topB, bottomA, bottomB, seed, face);
    return;
  }

  if (tile.terrain === TerrainType.WATER) {
    drawWaterVolumeDetails(graphics, topA, topB, bottomA, bottomB, seed, face);
    return;
  }

  graphics.lineStyle(1, palette.strata, palette.strataAlpha);
  graphics.beginPath();
  for (const t of [0.22, 0.38, 0.55, 0.72, 0.86]) {
    const offset = (seed - 0.5) * 0.05;
    const left = lerpPoint(topA, bottomA, Math.max(0.08, Math.min(0.94, t + offset)));
    const right = lerpPoint(topB, bottomB, Math.max(0.08, Math.min(0.94, t - offset)));
    const inset = 3 + ((Math.floor(seed * 100 + t * 37) % 3) * 2);
    graphics.moveTo(Phaser.Math.Linear(left.x, right.x, inset / TILE_WIDTH), Phaser.Math.Linear(left.y, right.y, inset / TILE_WIDTH));
    graphics.lineTo(Phaser.Math.Linear(right.x, left.x, inset / TILE_WIDTH), Phaser.Math.Linear(right.y, left.y, inset / TILE_WIDTH));
  }
  graphics.strokePath();

  const chipCount = 3;
  for (let i = 0; i < chipCount; i++) {
    const t = 0.18 + ((seed * 13 + i * 0.23) % 0.64);
    const u = 0.2 + ((seed * 19 + i * 0.31) % 0.58);
    const left = lerpPoint(topA, bottomA, t);
    const right = lerpPoint(topB, bottomB, t + 0.05);
    const center = lerpPoint(left, right, u);
    const width = 3 + ((i + Math.floor(seed * 10)) % 3);
    const height = 1.5 + (i % 2);

    graphics.fillStyle(i % 2 === 0 ? palette.chipLight : palette.chipDark, i % 2 === 0 ? palette.chipLightAlpha : palette.chipDarkAlpha);
    graphics.beginPath();
    graphics.moveTo(center.x - width, center.y);
    graphics.lineTo(center.x, center.y - height);
    graphics.lineTo(center.x + width, center.y);
    graphics.lineTo(center.x, center.y + height);
    graphics.closePath();
    graphics.fillPath();
  }
}

function drawMountainCliffDetails(
  graphics: Phaser.GameObjects.Graphics,
  topA: Position,
  topB: Position,
  bottomA: Position,
  bottomB: Position,
  seed: number,
  face: CubeFace
) {
  const point = (u: number, v: number) => {
    const left = lerpPoint(topA, bottomA, v);
    const right = lerpPoint(topB, bottomB, v);
    return lerpPoint(left, right, u);
  };

  const facets = [
    { u: 0.18, v: 0.18, w: 0.18, h: 0.16, color: 0xb9c0bc, alpha: 0.28 },
    { u: 0.48, v: 0.24, w: 0.22, h: 0.19, color: 0x495154, alpha: 0.22 },
    { u: 0.76, v: 0.2, w: 0.16, h: 0.17, color: 0xcbd0cc, alpha: 0.22 },
    { u: 0.26, v: 0.54, w: 0.24, h: 0.2, color: 0x3c4447, alpha: 0.2 },
    { u: 0.61, v: 0.58, w: 0.24, h: 0.22, color: 0xa7afab, alpha: 0.24 },
    { u: 0.82, v: 0.72, w: 0.16, h: 0.14, color: 0x2f373a, alpha: 0.18 },
  ];

  for (const [index, facet] of facets.entries()) {
    const drift = ((seed * 31 + index * 0.137) % 0.08) - 0.04;
    const skew = face === "SW" ? 0.05 : -0.05;
    const a = point(Math.max(0.04, facet.u - facet.w / 2 + drift), Math.max(0.06, facet.v - facet.h / 2));
    const b = point(Math.min(0.96, facet.u + facet.w / 2 + drift + skew), Math.max(0.08, facet.v - facet.h * 0.2));
    const c = point(Math.min(0.96, facet.u + facet.w * 0.2 + drift), Math.min(0.94, facet.v + facet.h / 2));
    const d = point(Math.max(0.04, facet.u - facet.w * 0.45 + drift - skew), Math.min(0.92, facet.v + facet.h * 0.2));

    graphics.fillStyle(facet.color, facet.alpha);
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.lineTo(c.x, c.y);
    graphics.lineTo(d.x, d.y);
    graphics.closePath();
    graphics.fillPath();
  }

  graphics.lineStyle(1, 0x242b2d, 0.26);
  graphics.beginPath();
  for (const [startU, startV, endU, endV] of [
    [0.12, 0.22, 0.34, 0.5],
    [0.44, 0.14, 0.37, 0.42],
    [0.66, 0.32, 0.88, 0.58],
    [0.28, 0.64, 0.56, 0.82],
  ] as const) {
    const start = point(startU, startV);
    const end = point(endU, endV);
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
  }
  graphics.strokePath();

  graphics.lineStyle(1, 0xd9dfdc, 0.2);
  graphics.beginPath();
  const lipA = point(0.08, 0.1);
  const lipB = point(0.88, 0.08);
  graphics.moveTo(lipA.x, lipA.y);
  graphics.lineTo(lipB.x, lipB.y);
  graphics.strokePath();
}

function drawWaterVolumeDetails(
  graphics: Phaser.GameObjects.Graphics,
  topA: Position,
  topB: Position,
  bottomA: Position,
  bottomB: Position,
  seed: number,
  face: CubeFace
) {
  const waveColor = face === "SW" ? 0x98ecff : 0x6fd5f4;
  const shadowColor = face === "SW" ? 0x0d6f9f : 0x083f68;

  graphics.lineStyle(1, waveColor, face === "SW" ? 0.34 : 0.26);
  graphics.beginPath();
  for (const t of [0.18, 0.36, 0.54, 0.72]) {
    const offset = (seed - 0.5) * 0.04;
    const left = lerpPoint(topA, bottomA, Math.max(0.08, Math.min(0.9, t + offset)));
    const right = lerpPoint(topB, bottomB, Math.max(0.08, Math.min(0.9, t - offset)));
    graphics.moveTo(Phaser.Math.Linear(left.x, right.x, 0.12), Phaser.Math.Linear(left.y, right.y, 0.12));
    graphics.lineTo(Phaser.Math.Linear(right.x, left.x, 0.16), Phaser.Math.Linear(right.y, left.y, 0.16));
  }
  graphics.strokePath();

  graphics.lineStyle(1, shadowColor, 0.2);
  graphics.beginPath();
  for (const u of [0.22, 0.48, 0.74]) {
    const top = lerpPoint(topA, topB, u);
    const bottom = lerpPoint(bottomA, bottomB, Math.min(0.92, u + (face === "SW" ? 0.06 : -0.06)));
    graphics.moveTo(top.x, top.y + 2);
    graphics.lineTo(bottom.x, bottom.y - 2);
  }
  graphics.strokePath();
}

function getTerrainSideDetailPalette(terrain: TerrainType) {
  switch (terrain) {
    case TerrainType.MOUNTAIN:
      return {
        highlight: 0xd7ddd9,
        highlightAlpha: 0.38,
        strata: 0x2e3638,
        strataAlpha: 0.22,
        chipLight: 0xc2c8c3,
        chipLightAlpha: 0.28,
        chipDark: 0x2e3435,
        chipDarkAlpha: 0.22,
      };
    case TerrainType.WATER:
      return {
        highlight: 0x9ce8ff,
        highlightAlpha: 0.42,
        strata: 0x0b5f8c,
        strataAlpha: 0.18,
        chipLight: 0xc9f6ff,
        chipLightAlpha: 0.2,
        chipDark: 0x063655,
        chipDarkAlpha: 0.18,
      };
    case TerrainType.SNOW:
      return {
        highlight: 0xffffff,
        highlightAlpha: 0.32,
        strata: 0x8db0c1,
        strataAlpha: 0.16,
        chipLight: 0xffffff,
        chipLightAlpha: 0.22,
        chipDark: 0x81a6b8,
        chipDarkAlpha: 0.16,
      };
    case TerrainType.SAND:
      return {
        highlight: 0xffe2a0,
        highlightAlpha: 0.26,
        strata: 0x88652e,
        strataAlpha: 0.14,
        chipLight: 0xf6d17c,
        chipLightAlpha: 0.22,
        chipDark: 0x7c5b27,
        chipDarkAlpha: 0.14,
      };
    default:
      return {
        highlight: 0xffffff,
        highlightAlpha: 0.24,
        strata: 0x1f241f,
        strataAlpha: 0.14,
        chipLight: 0xd4d0b0,
        chipLightAlpha: 0.16,
        chipDark: 0x1f241f,
        chipDarkAlpha: 0.12,
      };
  }
}

function blendRgb(from: number, to: number, amount: number) {
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;

  return (
    (Math.round(Phaser.Math.Linear(fromR, toR, amount)) << 16) |
    (Math.round(Phaser.Math.Linear(fromG, toG, amount)) << 8) |
    Math.round(Phaser.Math.Linear(fromB, toB, amount))
  );
}
