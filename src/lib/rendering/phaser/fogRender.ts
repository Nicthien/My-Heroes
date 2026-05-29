import Phaser from "phaser";
import { createNoise2D } from "simplex-noise";
import type { Position } from "@/lib/game/types";
import { TILE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";
import {
  FOG_STAMP_HEIGHT,
  FOG_STAMP_TEXTURE_KEYS,
  FOG_STAMP_WIDTH,
  UNDERGROUND_FOG_STAMP_TEXTURE_KEYS,
  type FogTheme,
  type FogEdgeSide,
  type FogStampKey,
} from "@/lib/rendering/phaser/fogConstants";
import { lerpPoint } from "@/lib/rendering/phaser/pointMath";

export function generateFogStampTextures(scene: Phaser.Scene) {
  generateFogStampTextureSet(scene, "surface", FOG_STAMP_TEXTURE_KEYS);
  generateFogStampTextureSet(scene, "underground", UNDERGROUND_FOG_STAMP_TEXTURE_KEYS);
}

function generateFogStampTextureSet(
  scene: Phaser.Scene,
  theme: FogTheme,
  textureSet: Record<FogStampKey, string[]>,
) {
  const centerX = FOG_STAMP_WIDTH / 2;
  const centerY = FOG_STAMP_HEIGHT / 2;

  for (const [stampKey, textureKeys] of Object.entries(textureSet) as [FogStampKey, string[]][]) {
    textureKeys.forEach((textureKey, variant) => {
      if (scene.textures.exists(textureKey)) return;

      // Unexplored cloud stamps use pixel-level Simplex noise — circles-stacked
      // approaches gave a "plaster bumps" look. Noise produces real organic
      // cloud patterns.
      if (stampKey === "fog-unexplored") {
        generateUnexploredCloudTexture(scene, textureKey, variant, theme);
        return;
      }

      const graphics = scene.add.graphics();
      switch (stampKey) {
        case "fog-near":
          drawFogNearTileVisual(graphics, centerX, centerY, variant, theme);
          break;
        case "fog-explored":
          drawFogTileVisual(graphics, centerX, centerY, true, variant, theme);
          break;
        case "fog-edge-nw":
          drawFogFrontierEdgeVisual(graphics, centerX, centerY, "NW", theme);
          break;
        case "fog-edge-ne":
          drawFogFrontierEdgeVisual(graphics, centerX, centerY, "NE", theme);
          break;
        case "fog-edge-se":
          drawFogFrontierEdgeVisual(graphics, centerX, centerY, "SE", theme);
          break;
        case "fog-edge-sw":
          drawFogFrontierEdgeVisual(graphics, centerX, centerY, "SW", theme);
          break;
      }
      graphics.generateTexture(textureKey, FOG_STAMP_WIDTH, FOG_STAMP_HEIGHT);
      graphics.destroy();
    });
  }
}

// Pixel-level cloud stamp. Multi-octave Simplex noise produces an organic
// pattern; a smooth elliptical envelope fades the stamp at its edges so
// adjacent stamps blend without visible seams. Variants differ via offset
// in the noise sample space — same algorithm, different region of the
// infinite noise field.
function generateUnexploredCloudTexture(scene: Phaser.Scene, textureKey: string, variant: number, theme: FogTheme) {
  const w = FOG_STAMP_WIDTH;
  const h = FOG_STAMP_HEIGHT;

  // Off-DOM canvas so it doesn't show up in the page.
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const seed = 0x85ebca6b ^ ((variant + 1) * 0x27d4eb2d);
  const rng = createSeededRng(seed);
  const noise2D = createNoise2D(rng);

  // Per-variant offset into the noise field — each variant gets a different
  // patch of the infinite noise plane.
  const noiseOffsetX = rng() * 10000;
  const noiseOffsetY = rng() * 10000;

  const cx = w / 2;
  const cy = h / 2;
  // Elliptical envelope wider than the tile so stamps overlap their
  // neighbours — at midpoints between tiles the envelope still has value
  // ~0.5-0.7, giving smooth coverage from accumulated alpha.
  const envRx = TILE_WIDTH * 0.85;
  const envRy = TILE_HEIGHT * 0.85;

  const palette = theme === "underground"
    ? {
        base: [0x00, 0x01, 0x03],
        cloud: [0x12, 0x13, 0x17],
        highlight: [0x2a, 0x2c, 0x32],
        alpha: 1.08,
      }
    : {
        base: [0x32, 0x3e, 0x52],
        cloud: [0xd0, 0xd8, 0xe2],
        highlight: [0xee, 0xf1, 0xf7],
        alpha: 1,
      };
  const [baseR, baseG, baseB] = palette.base;
  const [cloudR, cloudG, cloudB] = palette.cloud;
  const [highlightR, highlightG, highlightB] = palette.highlight;

  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;

      // Elliptical envelope, smoothstep falloff from centre to edge.
      const dx = (px - cx) / envRx;
      const dy = (py - cy) / envRy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= 1) {
        data[idx + 3] = 0;
        continue;
      }
      const envLinear = 1 - r;
      const envelope = envLinear * envLinear * (3 - 2 * envLinear);

      // Multi-octave Simplex noise — 3 octaves give large structure +
      // medium detail + fine grain without being too busy.
      const nx = px + noiseOffsetX;
      const ny = py + noiseOffsetY;
      let n = 0;
      let amp = 1;
      let freq = 0.045;
      let totalAmp = 0;
      for (let o = 0; o < 3; o++) {
        n += noise2D(nx * freq, ny * freq) * amp;
        totalAmp += amp;
        amp *= 0.55;
        freq *= 2.1;
      }
      n = (n / totalAmp + 1) * 0.5; // normalize to 0..1

      // Cloud density: smoothstep above a low threshold so MOST of the area
      // is cloud, with only the deepest noise valleys revealing the dark base.
      const cloudT = clamp01((n - 0.20) / 0.30);
      const cloudDensity = cloudT * cloudT * (3 - 2 * cloudT);

      // Highlight density: applied broadly so the cloud reads as well-lit
      // cumulonimbus rather than dim haze.
      const hiT = clamp01((n - 0.55) / 0.25);
      const highlightDensity = hiT * hiT * (3 - 2 * hiT);

      // Compose: base → cloud body → highlight.
      let rOut = baseR + (cloudR - baseR) * cloudDensity;
      let gOut = baseG + (cloudG - baseG) * cloudDensity;
      let bOut = baseB + (cloudB - baseB) * cloudDensity;
      rOut = rOut + (highlightR - rOut) * highlightDensity;
      gOut = gOut + (highlightG - gOut) * highlightDensity;
      bOut = bOut + (highlightB - bOut) * highlightDensity;

      data[idx] = rOut;
      data[idx + 1] = gOut;
      data[idx + 2] = bOut;
      data[idx + 3] = Math.round(clamp01(envelope * palette.alpha) * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  scene.textures.addCanvas(textureKey, canvas);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Explored = "remembered terrain". Soft circle, not diamond, so neighbouring
// tiles blend without showing a grid. Low alpha because ~4 tiles overlap at
// any pixel — compounded effective opacity lands near 50%, keeping the
// terrain readable.
function drawFogTileVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, _explored: boolean, variant: number, theme: FogTheme) {
  const variantSeedShift = (variant + 1) * 0x27d4eb2d;
  const underground = theme === "underground";

  drawSoftCircularFill(graphics, x, y, 0x000000, underground ? 0.10 : 0.04, TILE_WIDTH / 2);

  scatterFogClouds(graphics, x, y, {
    seed: 0x9e3779b1 ^ variantSeedShift,
    count: 2,
    radiusMin: 10,
    radiusMax: 16,
    color: underground ? 0x020203 : 0x05080d,
    alpha: underground ? 0.055 : 0.02,
  });
}

function drawFogNearTileVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, variant: number, theme: FogTheme) {
  const variantSeedShift = (variant + 1) * 0x27d4eb2d;
  const underground = theme === "underground";

  // Same circular treatment as the explored tile so the semi-fog frontier
  // doesn't ghost a diamond grid. Even lighter than explored — this state
  // sits next to visible tiles, it should feel like haze, not shadow.
  drawSoftCircularFill(graphics, x, y, 0x000000, underground ? 0.075 : 0.025, TILE_WIDTH / 2);

  scatterFogClouds(graphics, x, y, {
    seed: 0xc2b2ae35 ^ variantSeedShift,
    count: 2,
    radiusMin: 10,
    radiusMax: 16,
    color: underground ? 0x040405 : 0x0a1320,
    alpha: underground ? 0.05 : 0.025,
  });
}

function drawFogFrontierEdgeVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, side: FogEdgeSide, theme: FogTheme) {
  const points = getDiamondPoints(x, y);
  const edge = getFogEdge(points, side);
  const center = { x, y };

  // Smooth feathered gradient from the visible-side highlight inward.
  const featherSteps: { amount: number; color: number; alpha: number }[] = theme === "underground"
    ? [
        { amount: 0.72, color: 0x000000, alpha: 0.10 },
        { amount: 0.56, color: 0x000000, alpha: 0.13 },
        { amount: 0.42, color: 0x020203, alpha: 0.15 },
        { amount: 0.30, color: 0x14161a, alpha: 0.08 },
        { amount: 0.20, color: 0x24272e, alpha: 0.05 },
        { amount: 0.10, color: 0x30343c, alpha: 0.035 },
      ]
    : [
        { amount: 0.72, color: 0x02060d, alpha: 0.05 },
        { amount: 0.56, color: 0x02060d, alpha: 0.08 },
        { amount: 0.42, color: 0x02060d, alpha: 0.10 },
        { amount: 0.30, color: 0x6f8490, alpha: 0.07 },
        { amount: 0.20, color: 0xb9c9d0, alpha: 0.05 },
        { amount: 0.10, color: 0xd8edf2, alpha: 0.04 },
      ];

  for (const step of featherSteps) {
    fillEdgeStrip(graphics, edge.a, edge.b, center, step.amount, step.color, step.alpha);
  }
}

// Soft circular fill — concentric circles with falling alpha. Used for
// low-opacity fog states (explored, fog-near) and the dark base of unexplored
// where diamond edges would otherwise show as a grid where adjacent tiles
// meet.
//
// Important: every fog tile contributes to the same pixels its neighbours
// cover, so per-stamp alpha COMPOUNDS. For semi-transparent fog states keep
// centerAlpha low (≲ 0.12); for the opaque unexplored base ~0.55 is enough
// to reach near-full coverage when stacked.
//
// Uses BLOB_FALLOFF_LAYERS (10 fine steps) so the circle fades smoothly with
// no visible concentric rings, even at zoom.
function drawSoftCircularFill(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  color: number,
  centerAlpha: number,
  radius: number
) {
  for (const layer of BLOB_FALLOFF_LAYERS) {
    graphics.fillStyle(color, centerAlpha * layer.alpha);
    graphics.fillCircle(cx, cy, radius * layer.scale);
  }
}

type CloudOptions = {
  seed: number;
  count: number;
  radiusMin: number;
  radiusMax: number;
  color: number;
  alpha: number;
};

// Per-blob falloff layers — many small alpha steps so each blob fades
// gradually into its surroundings instead of reading as a distinct circle.
// 10 layers with very small alpha jumps approximate a smooth Gaussian
// falloff and eliminate the visible "rings" the previous 6-layer set left.
const BLOB_FALLOFF_LAYERS: { scale: number; alpha: number }[] = [
  { scale: 2.20, alpha: 0.03 },
  { scale: 1.95, alpha: 0.07 },
  { scale: 1.70, alpha: 0.12 },
  { scale: 1.50, alpha: 0.19 },
  { scale: 1.30, alpha: 0.28 },
  { scale: 1.10, alpha: 0.40 },
  { scale: 0.90, alpha: 0.55 },
  { scale: 0.70, alpha: 0.72 },
  { scale: 0.50, alpha: 0.88 },
  { scale: 0.30, alpha: 1.00 },
];

function drawSoftBlob(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  radius: number,
  color: number,
  alpha: number
) {
  for (const layer of BLOB_FALLOFF_LAYERS) {
    graphics.fillStyle(color, alpha * layer.alpha);
    graphics.fillCircle(cx, cy, radius * layer.scale);
  }
}

// Place a few big soft blobs near the tile center, deliberately unclipped so
// they bleed across tile borders. The bleed is what hides the grid.
function scatterFogClouds(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  opts: CloudOptions
) {
  const rng = createSeededRng(opts.seed);
  const spreadX = TILE_WIDTH * 0.6;
  const spreadY = TILE_HEIGHT * 0.6;

  for (let i = 0; i < opts.count; i++) {
    const dx = (rng() * 2 - 1) * spreadX;
    const dy = (rng() * 2 - 1) * spreadY;
    const radius = opts.radiusMin + rng() * (opts.radiusMax - opts.radiusMin);
    drawSoftBlob(graphics, cx + dx, cy + dy, radius, opts.color, opts.alpha);
  }
}

// mulberry32 — deterministic per-seed RNG so fog textures stay stable across reloads.
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getDiamondPoints(x: number, y: number) {
  return {
    north: { x, y: y - TILE_HEIGHT / 2 },
    east: { x: x + TILE_WIDTH / 2, y },
    south: { x, y: y + TILE_HEIGHT / 2 },
    west: { x: x - TILE_WIDTH / 2, y },
  };
}

function getFogEdge(points: ReturnType<typeof getDiamondPoints>, side: FogEdgeSide) {
  switch (side) {
    case "NW":
      return { a: points.north, b: points.west };
    case "NE":
      return { a: points.north, b: points.east };
    case "SE":
      return { a: points.east, b: points.south };
    case "SW":
      return { a: points.south, b: points.west };
  }
}

function fillEdgeStrip(
  graphics: Phaser.GameObjects.Graphics,
  a: Position,
  b: Position,
  center: Position,
  amount: number,
  color: number,
  alpha: number
) {
  const innerA = lerpPoint(a, center, amount);
  const innerB = lerpPoint(b, center, amount);

  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(a.x, a.y);
  graphics.lineTo(b.x, b.y);
  graphics.lineTo(innerB.x, innerB.y);
  graphics.lineTo(innerA.x, innerA.y);
  graphics.closePath();
  graphics.fillPath();
}
