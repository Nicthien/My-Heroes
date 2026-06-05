import Phaser from "phaser";
import { TerrainType, type GameMap, type MapTile } from "@/lib/game/types";
import { getTerrainSideTexturePath } from "@/lib/rendering/phaser/assets";
import { cartToIso } from "@/lib/rendering/phaser/iso";
import {
  type CubeFaceQuad,
  getCubeCorners,
  getCubeFacePoints,
} from "@/lib/rendering/phaser/isoCube";
import { getMapOuterCorners } from "@/lib/rendering/phaser/mapRenderHelpers";
import { VISUAL_ELEVATION_SCALE } from "@/lib/rendering/phaser/mapRenderSettings";
import { getTileDepth } from "@/lib/rendering/phaser/terrainFaceRender";

const STARFIELD_PADDING = 520;
const WORLD_EDGE_DROP_CUBE_HEIGHT = Math.round(VISUAL_ELEVATION_SCALE * 1.7);
const WORLD_EDGE_STONE_TEXTURE = "/assets/textures/terrain/mountain/mountain-cracked-rock.webp";
const WORLD_EDGE_STONE_TEXTURE_ALPHA = 0.72;
const WATER_DROP_FADE_SEGMENTS = 14;
const WATER_DROP_BOTTOM_ALPHA_RATIO = 0.14;

// For each map edge, the outward face is the cube face visible from the camera that
// faces away from the map interior. The return face is the other camera-visible face,
// orthogonal to the wall direction; it picks up the cap color at kind transitions.
const RETURN_FACE: Record<"SE" | "SW", "SE" | "SW"> = {
  SE: "SW",
  SW: "SE",
};

export function renderFlatWorldEdge(
  scene: Phaser.Scene,
  map: GameMap,
  underLayer: Phaser.GameObjects.Container,
  lipLayer: Phaser.GameObjects.Container
): void {
  drawWorldBackdrop(scene, map, underLayer);
  drawWorldEdgeVoxelDrops(scene, map, underLayer);

  underLayer.sort("depth");
  lipLayer.sort("depth");
  void lipLayer;
}

function drawWorldBackdrop(
  scene: Phaser.Scene,
  map: GameMap,
  layer: Phaser.GameObjects.Container
) {
  const corners = getMapOuterCorners(map, 6);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs) - STARFIELD_PADDING;
  const maxX = Math.max(...xs) + STARFIELD_PADDING;
  const minY = Math.min(...ys) - STARFIELD_PADDING;
  const maxY = Math.max(...ys) + STARFIELD_PADDING;

  const backdrop = scene.add.graphics();
  backdrop.setDepth(-10000);
  backdrop.fillStyle(0x020510, 1);
  backdrop.fillRect(minX, minY, maxX - minX, maxY - minY);

  const width = maxX - minX;
  const height = maxY - minY;
  const starCount = Math.max(180, Math.floor((width * height) / 18000));
  for (let i = 0; i < starCount; i++) {
    const x = minX + pseudoStar(i, 17) * width;
    const y = minY + pseudoStar(i, 31) * height;
    const bright = 0.35 + pseudoStar(i, 47) * 0.55;
    const radius = pseudoStar(i, 61) > 0.94 ? 1.25 : 0.75;
    backdrop.fillStyle(0xdbeafe, bright);
    backdrop.fillCircle(x, y, radius);
  }

  layer.add(backdrop);
}

function pseudoStar(index: number, salt: number) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function drawWorldEdgeVoxelDrops(
  scene: Phaser.Scene,
  map: GameMap,
  underLayer: Phaser.GameObjects.Container
): void {
  // East column (x = width - 1): outward face is SE; cap transition is the SW neighbor at y+1.
  for (let y = 0; y < map.height; y++) {
    const tile = map.tiles[y]?.[map.width - 1];
    if (!tile) continue;
    const capTransition = isKindTransition(tile, map.tiles[y + 1]?.[map.width - 1]);
    drawVoxelDropForFace(scene, tile, "SE", underLayer, capTransition);
  }

  // South row (y = height - 1): outward face is SW; cap transition is the SE neighbor at x+1.
  for (let x = 0; x < map.width; x++) {
    const tile = map.tiles[map.height - 1]?.[x];
    if (!tile) continue;
    const capTransition = isKindTransition(tile, map.tiles[map.height - 1]?.[x + 1]);
    drawVoxelDropForFace(scene, tile, "SW", underLayer, capTransition);
  }
}

function drawVoxelDropForFace(
  scene: Phaser.Scene,
  tile: MapTile,
  outwardFace: "SE" | "SW",
  layer: Phaser.GameObjects.Container,
  capTransition: boolean
): void {
  if (!tile.worldEdge) return;

  const iso = cartToIso(tile.x, tile.y);
  const depth = getTileDepth(tile);
  const dropDepth = Math.max(1, Math.min(30, tile.worldEdge.dropDepth));
  const layerDepth = iso.y + (outwardFace === "SW" ? 0.12 : 0.08);

  const graphics = scene.add.graphics();
  graphics.setDepth(layerDepth);
  const frameIndex = tile.terrain === TerrainType.WATER
    ? Math.floor(((tile.worldEdge.variant ?? 0) + tile.x * 5 + tile.y * 11) % 6)
    : 0;
  if (tile.terrain === TerrainType.WATER) {
    drawWaterDropFace(graphics, tile, outwardFace, iso.x, iso.y, depth, dropDepth, frameIndex, capTransition);
  } else {
    drawVoxelDropColumn(scene, graphics, tile, outwardFace, iso.x, iso.y, depth, dropDepth, frameIndex, capTransition, layer, layerDepth);
  }
  layer.add(graphics);
}

function drawWaterDropFace(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  outwardFace: "SE" | "SW",
  isoX: number,
  isoY: number,
  depth: number,
  dropDepth: number,
  frameIndex: number,
  capTransition: boolean
) {
  const topDepth = depth;
  const bottomDepth = depth - dropDepth * WORLD_EDGE_DROP_CUBE_HEIGHT;
  const corners = getCubeCorners(isoX, isoY, topDepth, bottomDepth);
  const returnFace = RETURN_FACE[outwardFace];
  const outwardQuad = getCubeFacePoints(outwardFace, corners);
  const returnQuad = getCubeFacePoints(returnFace, corners);
  const palette = getVoxelDropPalette(tile, outwardFace, 0);

  fillFadedWaterDropQuad(graphics, returnQuad, capTransition ? palette.capFill : palette.returnFill, 0.82);
  fillFadedWaterDropQuad(graphics, outwardQuad, palette.mainFill, 0.86);

  graphics.lineStyle(1, palette.edge, 0.12);
  strokeQuad(graphics, outwardQuad);
  strokeQuad(graphics, returnQuad);

  drawCheapWaterDropDetails(
    graphics,
    outwardQuad,
    returnQuad,
    tile.worldEdge?.variant ?? 0,
    frameIndex,
    outwardFace
  );
}

function drawCheapWaterDropDetails(
  graphics: Phaser.GameObjects.Graphics,
  outwardQuad: CubeFaceQuad,
  returnQuad: CubeFaceQuad,
  variant: number,
  frameIndex: number,
  outwardFace: "SE" | "SW"
) {
  const phase = (frameIndex / 6 + (variant % 13) / 13) % 1;
  const waveColor = outwardFace === "SW" ? 0xb9f2ff : 0x91e8ff;
  const shadowColor = outwardFace === "SW" ? 0x064b76 : 0x083f68;

  for (const v of [0.16, 0.32, 0.48, 0.64, 0.8]) {
    const drift = (phase - 0.5) * 0.05;
    const a = pointOnFace(quadToPolygon(outwardQuad), 0.08, Math.min(0.94, v + drift));
    const b = pointOnFace(quadToPolygon(outwardQuad), 0.92, Math.max(0.06, v - drift));
    graphics.lineStyle(1, waveColor, 0.18 * getWaterDropAlphaRatio(v));
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.strokePath();
  }

  for (const u of [0.22, 0.5, 0.78]) {
    const a = pointOnFace(quadToPolygon(returnQuad), u, 0.08);
    const b = pointOnFace(quadToPolygon(returnQuad), Math.min(0.9, u + 0.08), 0.94);
    graphics.lineStyle(1, shadowColor, 0.16 * getWaterDropAlphaRatio(0.51));
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.strokePath();
  }
}

function fillFadedWaterDropQuad(
  graphics: Phaser.GameObjects.Graphics,
  quad: CubeFaceQuad,
  color: number,
  topAlpha: number
) {
  for (let index = 0; index < WATER_DROP_FADE_SEGMENTS; index++) {
    const topT = index / WATER_DROP_FADE_SEGMENTS;
    const bottomT = (index + 1) / WATER_DROP_FADE_SEGMENTS;
    const alpha = topAlpha * getWaterDropAlphaRatio((topT + bottomT) / 2);
    const topA = lerpPoint(quad.topA, quad.bottomA, topT);
    const topB = lerpPoint(quad.topB, quad.bottomB, topT);
    const bottomA = lerpPoint(quad.topA, quad.bottomA, bottomT);
    const bottomB = lerpPoint(quad.topB, quad.bottomB, bottomT);

    graphics.fillStyle(color, alpha);
    graphics.beginPath();
    graphics.moveTo(topA.x, topA.y);
    graphics.lineTo(topB.x, topB.y);
    graphics.lineTo(bottomB.x, bottomB.y);
    graphics.lineTo(bottomA.x, bottomA.y);
    graphics.closePath();
    graphics.fillPath();
  }
}

function getWaterDropAlphaRatio(v: number) {
  return Phaser.Math.Linear(1, WATER_DROP_BOTTOM_ALPHA_RATIO, Phaser.Math.Clamp(v, 0, 1));
}

function drawVoxelDropColumn(
  scene: Phaser.Scene,
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  outwardFace: "SE" | "SW",
  isoX: number,
  isoY: number,
  depth: number,
  dropDepth: number,
  frameIndex: number,
  capTransition: boolean,
  layer: Phaser.GameObjects.Container,
  layerDepth: number
) {
  for (let step = 0; step < dropDepth; step++) {
    const topDepth = depth - step * WORLD_EDGE_DROP_CUBE_HEIGHT;
    const bottomDepth = depth - (step + 1) * WORLD_EDGE_DROP_CUBE_HEIGHT;
    drawVoxelDropCube(scene, graphics, tile, outwardFace, isoX, isoY, topDepth, bottomDepth, step, frameIndex, capTransition, layer, layerDepth);
  }
}

function drawVoxelDropCube(
  scene: Phaser.Scene,
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  outwardFace: "SE" | "SW",
  isoX: number,
  isoY: number,
  topDepth: number,
  bottomDepth: number,
  step: number,
  frameIndex: number,
  capTransition: boolean,
  layer: Phaser.GameObjects.Container,
  layerDepth: number
) {
  const corners = getCubeCorners(isoX, isoY, topDepth, bottomDepth);
  const returnFace = RETURN_FACE[outwardFace];
  const outwardQuad = getCubeFacePoints(outwardFace, corners);
  const returnQuad = getCubeFacePoints(returnFace, corners);
  const palette = getVoxelDropPalette(tile, outwardFace, step);

  graphics.fillStyle(capTransition ? palette.capFill : palette.returnFill, palette.returnAlpha);
  fillQuad(graphics, returnQuad);

  graphics.fillStyle(palette.mainFill, palette.mainAlpha);
  fillQuad(graphics, outwardQuad);

  addProjectedStoneTexture(scene, layer, returnQuad, returnFace, layerDepth + 0.001 + step * 0.00001);
  addProjectedStoneTexture(scene, layer, outwardQuad, outwardFace, layerDepth + 0.002 + step * 0.00001);

  graphics.lineStyle(1, palette.edge, palette.edgeAlpha);
  strokeQuad(graphics, outwardQuad);
  strokeQuad(graphics, returnQuad);

  if (tile.terrain === TerrainType.WATER) {
    drawWaterVoxelDetails(graphics, outwardQuad, returnQuad, tile.worldEdge?.variant ?? 0, step, frameIndex);
  } else {
    drawRockVoxelDetails(graphics, outwardQuad, returnQuad, palette, tile.worldEdge?.variant ?? 0, step);
  }
}

function isKindTransition(tile: MapTile, neighbor: MapTile | undefined) {
  if (!tile.worldEdge) return false;
  if (!neighbor?.worldEdge) return true;
  return neighbor.worldEdge.kind !== tile.worldEdge.kind;
}

function getVoxelDropPalette(tile: MapTile, outwardFace: "SE" | "SW", step: number) {
  const shade = Math.min(0.2, step * 0.018);

  if (tile.terrain === TerrainType.WATER) {
    return {
      mainFill: outwardFace === "SW" ? darken(0x168bc2, shade) : darken(0x0f72a8, shade),
      returnFill: outwardFace === "SW" ? darken(0x0a5e8e, shade) : darken(0x2aa6cf, shade),
      edge: 0x9be9ff,
      mainAlpha: 1,
      returnAlpha: 1,
      edgeAlpha: 0.16,
      detail: 0xb9f2ff,
      detailAlpha: 0.18,
      capFill: outwardFace === "SW" ? darken(0x0d6694, shade) : darken(0x197fa9, shade),
      capAlpha: 1,
    };
  }

  return {
    mainFill: outwardFace === "SW" ? darken(0x9ca3a3, shade) : darken(0x737b7d, shade),
    returnFill: outwardFace === "SW" ? darken(0x687073, shade) : darken(0xb6bcba, shade),
    edge: 0x2f373a,
    mainAlpha: 1,
    returnAlpha: 1,
    edgeAlpha: 0.3,
    detail: 0xd8ddda,
    detailAlpha: 0.18,
    capFill: outwardFace === "SW" ? darken(0x7d8587, shade) : darken(0x959d9d, shade),
    capAlpha: 1,
  };
}

function drawWaterVoxelDetails(
  graphics: Phaser.GameObjects.Graphics,
  outwardQuad: CubeFaceQuad,
  returnQuad: CubeFaceQuad,
  variant: number,
  step: number,
  frameIndex: number
) {
  const phase = (frameIndex / 6 + ((variant + step * 13) % 17) / 17) % 1;
  drawWaterFaceTexture(graphics, quadToPolygon(outwardQuad), variant + step * 41, phase, false);
  drawWaterFaceTexture(graphics, quadToPolygon(returnQuad), variant + step * 53 + 19, (phase + 0.37) % 1, true);
}

function drawWaterFaceTexture(
  graphics: Phaser.GameObjects.Graphics,
  face: { x: number; y: number }[],
  seed: number,
  phase: number,
  isReturnFace: boolean
) {
  drawWaterDepthClouds(graphics, face, seed, phase, isReturnFace);
  drawWaterCausticCells(graphics, face, seed + 101, phase, isReturnFace);
  drawWaterFoamPixels(graphics, face, seed + 211, phase, isReturnFace);
}

function drawWaterDepthClouds(
  graphics: Phaser.GameObjects.Graphics,
  face: { x: number; y: number }[],
  seed: number,
  phase: number,
  isReturnFace: boolean
) {
  const cloudCount = isReturnFace ? 3 : 5;
  for (let i = 0; i < cloudCount; i++) {
    const u = 0.16 + pseudo01(seed, i * 7 + 1) * 0.68;
    const v = (0.12 + pseudo01(seed, i * 7 + 2) * 0.74 + phase * (0.08 + i * 0.012)) % 0.86;
    const center = pointOnFace(face, u, v);
    const width = 7 + pseudo01(seed, i * 7 + 3) * (isReturnFace ? 7 : 13);
    const height = 4 + pseudo01(seed, i * 7 + 4) * 8;
    const drift = (phase - 0.5) * (isReturnFace ? 3 : 5);

    graphics.fillStyle(i % 2 === 0 ? 0x064b76 : 0x20a4cc, i % 2 === 0 ? 0.1 : 0.08);
    graphics.beginPath();
    graphics.moveTo(center.x - width * 0.55 + drift, center.y - height * 0.2);
    graphics.lineTo(center.x - width * 0.08 + drift * 0.4, center.y - height);
    graphics.lineTo(center.x + width * 0.55, center.y - height * 0.12);
    graphics.lineTo(center.x + width * 0.34 - drift * 0.3, center.y + height * 0.72);
    graphics.lineTo(center.x - width * 0.45, center.y + height * 0.48);
    graphics.closePath();
    graphics.fillPath();
  }
}

function drawWaterCausticCells(
  graphics: Phaser.GameObjects.Graphics,
  face: { x: number; y: number }[],
  seed: number,
  phase: number,
  isReturnFace: boolean
) {
  const cellCount = isReturnFace ? 5 : 8;
  for (let i = 0; i < cellCount; i++) {
    const baseU = 0.08 + pseudo01(seed, i * 11 + 1) * 0.84;
    const baseV = 0.08 + ((pseudo01(seed, i * 11 + 2) + phase * (0.18 + pseudo01(seed, i * 11 + 3) * 0.12)) % 0.84);
    const width = 0.08 + pseudo01(seed, i * 11 + 4) * (isReturnFace ? 0.1 : 0.15);
    const height = 0.08 + pseudo01(seed, i * 11 + 5) * 0.13;
    const skew = (pseudo01(seed, i * 11 + 6) - 0.5) * 0.08;
    const a = pointOnFace(face, baseU - width * 0.45, baseV - height * 0.15);
    const b = pointOnFace(face, baseU + width * 0.32, baseV - height * 0.48 + skew);
    const c = pointOnFace(face, baseU + width * 0.52, baseV + height * 0.18);
    const d = pointOnFace(face, baseU - width * 0.18, baseV + height * 0.44 - skew);

    graphics.lineStyle(1, i % 3 === 0 ? 0xd8fbff : 0x91e8ff, 0.16 + pseudo01(seed, i * 11 + 7) * 0.14);
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.lineTo(c.x, c.y);
    graphics.lineTo(d.x, d.y);
    graphics.strokePath();
  }
}

function drawWaterFoamPixels(
  graphics: Phaser.GameObjects.Graphics,
  face: { x: number; y: number }[],
  seed: number,
  phase: number,
  isReturnFace: boolean
) {
  const pixelCount = isReturnFace ? 8 : 14;
  graphics.fillStyle(0xd6fbff, 0.22);
  for (let i = 0; i < pixelCount; i++) {
    const u = 0.08 + pseudo01(seed, i * 5 + 1) * 0.84;
    const v = 0.08 + ((pseudo01(seed, i * 5 + 2) + phase * 0.24) % 0.84);
    const point = pointOnFace(face, u, v);
    const size = pseudo01(seed, i * 5 + 3) > 0.68 ? 1.4 : 0.9;
    graphics.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  }
}

function pointOnFace(face: { x: number; y: number }[], u: number, v: number) {
  const clampedU = Phaser.Math.Clamp(u, 0.03, 0.97);
  const clampedV = Phaser.Math.Clamp(v, 0.03, 0.97);
  const top = lerpPoint(face[0], face[1], clampedU);
  const bottom = lerpPoint(face[3], face[2], clampedU);
  return lerpPoint(top, bottom, clampedV);
}

function pseudo01(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function drawRockVoxelDetails(
  graphics: Phaser.GameObjects.Graphics,
  outwardQuad: CubeFaceQuad,
  returnQuad: CubeFaceQuad,
  palette: ReturnType<typeof getVoxelDropPalette>,
  variant: number,
  step: number
) {
  const t = 0.22 + ((variant + step * 17) % 47) / 100;
  const upper = lerpPoint(outwardQuad.topA, outwardQuad.topB, t);
  const lower = lerpPoint(outwardQuad.bottomA, outwardQuad.bottomB, Math.min(0.85, t + 0.18));

  graphics.lineStyle(1, palette.detail, palette.detailAlpha);
  graphics.beginPath();
  graphics.moveTo(upper.x, upper.y + 1);
  graphics.lineTo(lower.x, lower.y - 1);
  graphics.strokePath();

  graphics.lineStyle(1, 0x1f2729, 0.18);
  graphics.beginPath();
  graphics.moveTo(returnQuad.topA.x, returnQuad.topA.y + 1);
  graphics.lineTo(returnQuad.bottomB.x, returnQuad.bottomB.y - 1);
  graphics.strokePath();
}

function addProjectedStoneTexture(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  quad: CubeFaceQuad,
  face: "SE" | "SW",
  depth: number
) {
  const texturePath = getTerrainSideTexturePath(WORLD_EDGE_STONE_TEXTURE, face);
  if (!scene.textures.exists(texturePath)) return;

  const minX = Math.min(quad.topA.x, quad.topB.x, quad.bottomA.x, quad.bottomB.x);
  const maxX = Math.max(quad.topA.x, quad.topB.x, quad.bottomA.x, quad.bottomB.x);
  const minY = Math.min(quad.topA.y, quad.topB.y, quad.bottomA.y, quad.bottomB.y);
  const maxY = Math.max(quad.topA.y, quad.topB.y, quad.bottomA.y, quad.bottomB.y);
  const width = Math.max(1, Math.ceil(maxX - minX));
  const height = Math.max(1, Math.ceil(maxY - minY));
  const localQuad = {
    topA: { x: quad.topA.x - minX, y: quad.topA.y - minY },
    topB: { x: quad.topB.x - minX, y: quad.topB.y - minY },
    bottomA: { x: quad.bottomA.x - minX, y: quad.bottomA.y - minY },
    bottomB: { x: quad.bottomB.x - minX, y: quad.bottomB.y - minY },
  };
  const textureKey = getProjectedStoneTextureKey(scene, texturePath, face, localQuad, width, height);
  if (!textureKey) return;

  const sprite = scene.add.image(minX, minY, textureKey);
  sprite.setOrigin(0);
  sprite.setAlpha(WORLD_EDGE_STONE_TEXTURE_ALPHA);
  sprite.setDepth(depth);
  layer.add(sprite);
}

function getProjectedStoneTextureKey(
  scene: Phaser.Scene,
  texturePath: string,
  face: "SE" | "SW",
  localQuad: CubeFaceQuad,
  width: number,
  height: number
) {
  const shapeKey = [
    localQuad.topA.x, localQuad.topA.y,
    localQuad.topB.x, localQuad.topB.y,
    localQuad.bottomA.x, localQuad.bottomA.y,
    localQuad.bottomB.x, localQuad.bottomB.y,
  ].map((value) => Math.round(value * 10) / 10).join(",");
  const key = `world-edge-stone:${texturePath}:${face}:${width}x${height}:${shapeKey}`;
  if (scene.textures.exists(key)) return key;

  const frame = scene.textures.getFrame(texturePath);
  const source = frame?.source.image as CanvasImageSource | undefined;
  const sourceWidth = frame?.width ?? 0;
  const sourceHeight = frame?.height ?? 0;
  if (!source || sourceWidth <= 0 || sourceHeight <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const sourcePoints = getSourceSideTextureProjectionPoints(face, sourceWidth, sourceHeight);
  const matrix = getAffineTextureProjection(sourcePoints, localQuad);
  if (!matrix) return null;

  context.save();
  context.beginPath();
  context.moveTo(localQuad.topA.x, localQuad.topA.y);
  context.lineTo(localQuad.topB.x, localQuad.topB.y);
  context.lineTo(localQuad.bottomB.x, localQuad.bottomB.y);
  context.lineTo(localQuad.bottomA.x, localQuad.bottomA.y);
  context.closePath();
  context.clip();
  context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  context.drawImage(source, 0, 0);
  context.restore();

  return scene.textures.addCanvas(key, canvas) ? key : null;
}

function getSourceSideTextureProjectionPoints(face: "SE" | "SW", width: number, height: number) {
  return face === "SW"
    ? {
        topA: { x: 0, y: 0 },
        topB: { x: width, y: height / 2 },
        bottomA: { x: 0, y: height / 2 },
      }
    : {
        topA: { x: 0, y: height / 2 },
        topB: { x: width, y: 0 },
        bottomA: { x: 0, y: height },
      };
}

function getAffineTextureProjection(
  source: { topA: { x: number; y: number }; topB: { x: number; y: number }; bottomA: { x: number; y: number } },
  target: { topA: { x: number; y: number }; topB: { x: number; y: number }; bottomA: { x: number; y: number } }
) {
  const sourceX = {
    x: source.topB.x - source.topA.x,
    y: source.topB.y - source.topA.y,
  };
  const sourceY = {
    x: source.bottomA.x - source.topA.x,
    y: source.bottomA.y - source.topA.y,
  };
  const targetX = {
    x: target.topB.x - target.topA.x,
    y: target.topB.y - target.topA.y,
  };
  const targetY = {
    x: target.bottomA.x - target.topA.x,
    y: target.bottomA.y - target.topA.y,
  };
  const determinant = sourceX.x * sourceY.y - sourceX.y * sourceY.x;
  if (Math.abs(determinant) < 0.0001) return null;

  const a = (targetX.x * sourceY.y - targetY.x * sourceX.y) / determinant;
  const b = (targetX.y * sourceY.y - targetY.y * sourceX.y) / determinant;
  const c = (-targetX.x * sourceY.x + targetY.x * sourceX.x) / determinant;
  const d = (-targetX.y * sourceY.x + targetY.y * sourceX.x) / determinant;
  const e = target.topA.x - a * source.topA.x - c * source.topA.y;
  const f = target.topA.y - b * source.topA.x - d * source.topA.y;

  return { a, b, c, d, e, f };
}

function fillQuad(graphics: Phaser.GameObjects.Graphics, quad: CubeFaceQuad) {
  graphics.beginPath();
  graphics.moveTo(quad.topA.x, quad.topA.y);
  graphics.lineTo(quad.topB.x, quad.topB.y);
  graphics.lineTo(quad.bottomB.x, quad.bottomB.y);
  graphics.lineTo(quad.bottomA.x, quad.bottomA.y);
  graphics.closePath();
  graphics.fillPath();
}

function strokeQuad(graphics: Phaser.GameObjects.Graphics, quad: CubeFaceQuad) {
  graphics.beginPath();
  graphics.moveTo(quad.topA.x, quad.topA.y);
  graphics.lineTo(quad.topB.x, quad.topB.y);
  graphics.lineTo(quad.bottomB.x, quad.bottomB.y);
  graphics.lineTo(quad.bottomA.x, quad.bottomA.y);
  graphics.closePath();
  graphics.strokePath();
}

function quadToPolygon(quad: CubeFaceQuad) {
  return [quad.topA, quad.topB, quad.bottomB, quad.bottomA];
}

function lerpPoint(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return {
    x: Phaser.Math.Linear(a.x, b.x, t),
    y: Phaser.Math.Linear(a.y, b.y, t),
  };
}

function darken(color: number, amount: number) {
  const factor = Math.max(0, 1 - amount);
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
