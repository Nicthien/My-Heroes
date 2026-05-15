import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = path.join(ROOT, "assets", "source", "sprites", "boats", "master");
const OUT_ROOT = path.join(ROOT, "public", "assets", "sprites", "boats");
const FRAME_WIDTH = 80;
const FRAME_HEIGHT = 80;
const COLUMNS = 12;
const ROWS = 8;
const WIDTH = FRAME_WIDTH * COLUMNS;
const HEIGHT = FRAME_HEIGHT * ROWS;

const DIRECTIONS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"];

const FACTIONS = [
  { faction: "castle", hue: 218, saturation: 0.78, lightness: 0.42 },
  { faction: "rampart", hue: 137, saturation: 0.56, lightness: 0.34 },
  { faction: "tower", hue: 196, saturation: 0.34, lightness: 0.55 },
  { faction: "inferno", hue: 5, saturation: 0.72, lightness: 0.34 },
  { faction: "necropolis", hue: 166, saturation: 0.28, lightness: 0.36 },
  { faction: "dungeon", hue: 267, saturation: 0.56, lightness: 0.42 },
  { faction: "stronghold", hue: 28, saturation: 0.72, lightness: 0.38 },
  { faction: "fortress", hue: 92, saturation: 0.42, lightness: 0.34 },
  { faction: "conflux", hue: 188, saturation: 0.58, lightness: 0.45 },
];

const IDLE_MOTION = [
  { y: 0, scale: 1 },
  { y: -1, scale: 1 },
  { y: 0, scale: 1 },
  { y: 1, scale: 1 },
];

const WALK_MOTION = Array.from({ length: 8 }, (_, index) => ({
  y: Math.round(Math.sin((index / 8) * Math.PI * 2)),
  scale: 1,
  wake: index,
}));

await assertSourcesExist();
const sourceFrames = await loadSourceFrames();

for (const faction of FACTIONS) {
  await writeFactionSheet(faction);
}

async function assertSourcesExist() {
  const missing = [];
  for (const direction of DIRECTIONS) {
    const file = path.join(SOURCE_ROOT, `${direction}.png`);
    try {
      await access(file);
    } catch {
      missing.push(path.relative(ROOT, file));
    }
  }

  if (missing.length > 0) {
    throw new Error([
      "Missing complete boat source assets.",
      "Add one transparent PNG per direction before generating boats:",
      ...missing.map((file) => `- ${file}`),
      "",
      "Each PNG must contain one complete 2.5D isometric galion, not separated parts.",
      "See assets/source/sprites/boats/README.md for the asset brief.",
    ].join("\n"));
  }
}

async function loadSourceFrames() {
  const frames = new Map();
  for (const direction of DIRECTIONS) {
    const input = path.join(SOURCE_ROOT, `${direction}.png`);
    const normalized = await normalizeSource(input);
    await assertHasVisiblePixels(normalized, input);
    frames.set(direction, normalized);
  }
  return frames;
}

async function normalizeSource(input) {
  const resized = await sharp(input)
    .ensureAlpha()
    .resize(FRAME_WIDTH, FRAME_HEIGHT, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return addGroundShadow(resized);
}

async function assertHasVisiblePixels(buffer, input) {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 24) visible += 1;
  }
  if (visible < 200) {
    throw new Error(`${path.relative(ROOT, input)} looks empty after normalization`);
  }
}

async function writeFactionSheet(faction) {
  const outDir = path.join(OUT_ROOT, faction.faction);
  const outFile = path.join(outDir, "adventure.webp");
  const frameBuffers = [];

  for (const direction of DIRECTIONS) {
    const source = sourceFrames.get(direction);
    for (const motion of [...IDLE_MOTION, ...WALK_MOTION]) {
      const animated = await createAnimatedFrame(source, motion, direction);
      frameBuffers.push(await recolorFrame(animated, faction));
    }
  }

  await mkdir(outDir, { recursive: true });

  const sheet = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frameBuffers.map((input, index) => ({
      input,
      left: (index % COLUMNS) * FRAME_WIDTH,
      top: Math.floor(index / COLUMNS) * FRAME_HEIGHT,
    })))
    .png()
    .toBuffer();

  await sharp(sheet).webp({ lossless: true, effort: 6 }).toFile(outFile);

  const metadata = await sharp(outFile).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
    throw new Error(`${outFile} has invalid dimensions ${metadata.width}x${metadata.height}`);
  }

  console.log(`Generated ${path.relative(ROOT, outFile)} (${metadata.width}x${metadata.height})`);
}

async function createAnimatedFrame(source, motion, direction) {
  const shifted = await sharp({
    create: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: source, left: 0, top: motion.y }])
    .png()
    .toBuffer();

  if (motion.wake === undefined) return shifted;
  return addWake(shifted, direction, motion.wake);
}

async function addWake(frame, direction, index) {
  const wake = wakeSvg(direction, index);
  return sharp(Buffer.from(wake))
    .composite([{ input: frame, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function wakeSvg(direction, index) {
  const vector = wakeVector(direction);
  const x = 40 - vector.x * (18 + (index % 4) * 2);
  const y = 60 - vector.y * (10 + (index % 4));
  const alpha = 0.22 + (index % 3) * 0.04;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" viewBox="0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}">
    <ellipse cx="${round(x)}" cy="${round(y)}" rx="5" ry="1.3" fill="#d4fbff" opacity="${round(alpha)}"/>
    <ellipse cx="${round(x - vector.x * 8)}" cy="${round(y - vector.y * 4)}" rx="3.4" ry="1.1" fill="#8ed7ef" opacity="${round(alpha * 0.65)}"/>
  </svg>`;
}

function wakeVector(direction) {
  switch (direction) {
    case "s": return { x: 0, y: 1 };
    case "sw": return { x: -0.86, y: 0.5 };
    case "w": return { x: -1, y: 0 };
    case "nw": return { x: -0.86, y: -0.5 };
    case "n": return { x: 0, y: -1 };
    case "ne": return { x: 0.86, y: -0.5 };
    case "e": return { x: 1, y: 0 };
    default: return { x: 0.86, y: 0.5 };
  }
}

async function recolorFrame(frame, faction) {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 24) continue;

    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (!isHullPixel(h, s, l)) continue;

    const [r, g, b] = hslToRgb(faction.hue, faction.saturation, clamp(l * 0.85 + faction.lightness * 0.25, 0.12, 0.72));
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

function isHullPixel(h, s, l) {
  return h >= 190 && h <= 250 && s > 0.18 && l > 0.08 && l < 0.68;
}

async function addGroundShadow(frame) {
  const shadow = Buffer.alloc(FRAME_WIDTH * FRAME_HEIGHT * 4);
  const cx = Math.round(FRAME_WIDTH / 2);
  const cy = FRAME_HEIGHT - 11;
  const rx = 24;
  const ry = 6;

  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (x < 0 || x >= FRAME_WIDTH || y < 0 || y >= FRAME_HEIGHT) continue;
      const distance = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (distance > 1) continue;
      const alpha = Math.round((1 - distance) * 64);
      const index = (y * FRAME_WIDTH + x) * 4;
      shadow[index + 3] = alpha;
    }
  }

  return sharp(shadow, { raw: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4 } })
    .composite([{ input: frame, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r1, g1, b1] = [0, 0, 0];

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
