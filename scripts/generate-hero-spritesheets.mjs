import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "public", "assets", "sprites", "heroes", "source", "castle-ai-reference.png");
const OUT_ROOT = path.join(ROOT, "public", "assets", "sprites", "heroes");
const WIDTH = 960;
const HEIGHT = 640;
const FRAME_WIDTH = 80;
const FRAME_HEIGHT = 80;
const COLUMNS = 12;
const ROWS = 8;
const SOURCE_TOP_MARGIN = 32;
const IDLE_SOURCE_COLUMNS = [1, 0, 1, 9];
const WALK_SOURCE_COLUMNS = [1, 0, 1, 9, 1, 0, 1, 9];

const FACTIONS = [
  { faction: "castle", clothHue: 218, clothSat: 1.1, clothLight: 1, accentHue: 44, horseHue: 30, horseSat: 1, horseLight: 1 },
  { faction: "rampart", clothHue: 142, clothSat: 1.02, clothLight: 0.92, accentHue: 78, horseHue: 28, horseSat: 0.9, horseLight: 0.98 },
  { faction: "tower", clothHue: 196, clothSat: 0.78, clothLight: 1.12, accentHue: 188, horseHue: 210, horseSat: 0.22, horseLight: 1.28 },
  { faction: "inferno", clothHue: 3, clothSat: 1.2, clothLight: 0.78, accentHue: 28, horseHue: 8, horseSat: 1.1, horseLight: 0.62 },
  { faction: "necropolis", clothHue: 220, clothSat: 0.16, clothLight: 0.66, accentHue: 154, horseHue: 215, horseSat: 0.14, horseLight: 0.52 },
  { faction: "dungeon", clothHue: 266, clothSat: 1.06, clothLight: 0.78, accentHue: 188, horseHue: 270, horseSat: 0.38, horseLight: 0.66 },
  { faction: "stronghold", clothHue: 27, clothSat: 1.18, clothLight: 0.82, accentHue: 45, horseHue: 22, horseSat: 1, horseLight: 0.78 },
  { faction: "fortress", clothHue: 88, clothSat: 0.74, clothLight: 0.72, accentHue: 82, horseHue: 92, horseSat: 0.38, horseLight: 0.68 },
  { faction: "conflux", clothHue: 188, clothSat: 0.92, clothLight: 1.16, accentHue: 48, horseHue: 258, horseSat: 0.42, horseLight: 1.08 },
];

const IDLE_MOTION = [
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
];

const WALK_MOTION = [
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
  { x: 0, y: 0, scale: 1 },
];

const sourceCells = await loadSourceCells();
for (const spec of FACTIONS) {
  await writeFactionSheet(spec);
}

async function loadSourceCells() {
  const keyed = await createKeyedBase();
  const cells = [];

  for (let row = 0; row < ROWS; row++) {
    cells.push({
      idle: await Promise.all(IDLE_SOURCE_COLUMNS.map((column) => extractCell(keyed, row, column))),
      walk: await Promise.all(WALK_SOURCE_COLUMNS.map((column) => extractCell(keyed, row, column))),
    });
  }

  cells[3] = await mirrorSourceCell(cells[5]);
  cells[6] = await mirrorSourceCell(cells[2]);

  return cells;
}

async function mirrorSourceCell(cell) {
  return {
    idle: await Promise.all(cell.idle.map((frame) => sharp(frame).flop().png().toBuffer())),
    walk: await Promise.all(cell.walk.map((frame) => sharp(frame).flop().png().toBuffer())),
  };
}

async function createKeyedBase() {
  const { data, info } = await sharp(SOURCE)
    .resize(WIDTH, HEIGHT, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== WIDTH || info.height !== HEIGHT) {
    throw new Error(`Invalid source dimensions after resize: ${info.width}x${info.height}`);
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const greenDominance = g - Math.max(r, b);

    if (g > 86 && greenDominance > 18) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    } else if (greenDominance > 8) {
      data[i + 1] = Math.round(g * 0.55);
    }
  }

  return Buffer.from(data);
}

async function extractCell(sheetData, row, column) {
  const nominalTop = row * FRAME_HEIGHT;
  const top = Math.max(0, nominalTop - SOURCE_TOP_MARGIN);
  const nominalOffsetTop = nominalTop - top;
  const height = Math.min(HEIGHT - top, nominalOffsetTop + FRAME_HEIGHT);
  const cell = await sharp(sheetData, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .extract({
      left: column * FRAME_WIDTH,
      top,
      width: FRAME_WIDTH,
      height,
    })
    .png()
    .toBuffer();
  const cleaned = await cleanCell(cell, nominalOffsetTop);
  return normalizeCellToFrame(cleaned);
}

async function cleanCell(cell, nominalOffsetTop = 0) {
  const { data, info } = await sharp(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const visited = new Uint8Array(info.width * info.height);
  const keep = new Uint8Array(info.width * info.height);
  const minHeroBottom = nominalOffsetTop + Math.round(FRAME_HEIGHT * 0.45);
  const maxHeroTop = nominalOffsetTop + Math.round(FRAME_HEIGHT * 0.35);
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const start = y * info.width + x;
      if (visited[start] || data[start * 4 + 3] <= 24) continue;

      const queue = [start];
      const component = [];
      visited[start] = 1;
      let componentMinY = y;
      let componentMaxY = y;

      for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        const cx = current % info.width;
        const cy = Math.floor(current / info.width);
        component.push(current);
        componentMinY = Math.min(componentMinY, cy);
        componentMaxY = Math.max(componentMaxY, cy);

        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue;
          const next = ny * info.width + nx;
          if (visited[next] || data[next * 4 + 3] <= 24) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }

      if (component.length >= 140 && componentMinY <= maxHeroTop && componentMaxY >= minHeroBottom) {
        for (const index of component) keep[index] = 1;
      }
    }
  }

  for (let i = 0; i < keep.length; i++) {
    if (keep[i]) continue;
    const offset = i * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function normalizeCellToFrame(cell) {
  const { data, info } = await sharp(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = getAlphaBounds(data, info.width, info.height);
  if (!bounds) return cell;

  const boundsWidth = bounds.maxX - bounds.minX + 1;
  const boundsHeight = bounds.maxY - bounds.minY + 1;

  if (boundsWidth > FRAME_WIDTH || boundsHeight > FRAME_HEIGHT) {
    const cropped = await sharp(cell)
      .extract({
        left: bounds.minX,
        top: bounds.minY,
        width: boundsWidth,
        height: boundsHeight,
      })
      .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: "inside" })
      .png()
      .toBuffer();

    const metadata = await sharp(cropped).metadata();
    const left = Math.round((FRAME_WIDTH - (metadata.width ?? FRAME_WIDTH)) / 2);
    const top = FRAME_HEIGHT - (metadata.height ?? FRAME_HEIGHT);
    return sharp({
      create: {
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: cropped, left, top }])
      .png()
      .toBuffer();
  }

  const aligned = Buffer.alloc(FRAME_WIDTH * FRAME_HEIGHT * 4);
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    const targetY = FRAME_HEIGHT - boundsHeight + y - bounds.minY;

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const sourceOffset = (y * info.width + x) * 4;
      if (data[sourceOffset + 3] <= 24) continue;

      const targetX = Math.round((FRAME_WIDTH - boundsWidth) / 2) + x - bounds.minX;
      const targetOffset = (targetY * FRAME_WIDTH + targetX) * 4;
      aligned[targetOffset] = data[sourceOffset];
      aligned[targetOffset + 1] = data[sourceOffset + 1];
      aligned[targetOffset + 2] = data[sourceOffset + 2];
      aligned[targetOffset + 3] = data[sourceOffset + 3];
    }
  }

  return sharp(aligned, { raw: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4 } }).png().toBuffer();
}

function getAlphaBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 24) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) return undefined;
  return { minX, minY, maxX, maxY };
}

async function writeFactionSheet(spec) {
  const outDir = path.join(OUT_ROOT, spec.faction);
  const outFile = path.join(outDir, "adventure.png");
  const frameBuffers = [];

  for (let row = 0; row < ROWS; row++) {
    for (let index = 0; index < IDLE_MOTION.length; index++) {
      frameBuffers.push(await createAnimatedFrame(sourceCells[row].idle[index], spec, IDLE_MOTION[index]));
    }
    for (let index = 0; index < WALK_MOTION.length; index++) {
      frameBuffers.push(await createAnimatedFrame(sourceCells[row].walk[index], spec, WALK_MOTION[index]));
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

  await sharp(sheet).png().toFile(outFile);

  const metadata = await sharp(outFile).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
    throw new Error(`${outFile} has invalid dimensions ${metadata.width}x${metadata.height}`);
  }

  console.log(`Generated ${path.relative(ROOT, outFile)} (${metadata.width}x${metadata.height})`);
}

async function createAnimatedFrame(source, spec, motion) {
  const scaledSize = Math.round(FRAME_WIDTH * motion.scale);
  const scaled = await sharp(source)
    .resize(scaledSize, scaledSize, { fit: "contain" })
    .png()
    .toBuffer();

  const left = Math.round((FRAME_WIDTH - scaledSize) / 2 + motion.x);
  const top = Math.round((FRAME_HEIGHT - scaledSize) / 2 + motion.y);

  const frame = await sharp({
    create: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, left, top }])
    .png()
    .toBuffer();

  return recolorFrame(frame, spec);
}

async function recolorFrame(frame, spec) {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const [r, g, b] = stylizePixel(h, s, l, spec);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  const stylized = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const outlined = await addSpriteOutline(stylized);
  return addGroundShadow(outlined);
}

function stylizePixel(h, s, l, spec) {
  if (l < 0.07) return [17, 22, 27];
  if (isBlueCloth(h, s, l)) return hslToRgb(spec.clothHue, 0.72, toonLight(l, 0.17, 0.31, 0.46, 0.62) * spec.clothLight);
  if (isHorse(h, s, l)) return hslToRgb(spec.horseHue, 0.54 * spec.horseSat, toonLight(l, 0.17, 0.27, 0.39, 0.52) * spec.horseLight);
  if (isGoldTrim(h, s, l)) return hslToRgb(spec.accentHue, 0.66, toonLight(l, 0.28, 0.4, 0.54, 0.68));
  if (isSkin(h, s, l)) return hslToRgb(28, 0.58, toonLight(l, 0.38, 0.51, 0.64, 0.78));
  if (isMetal(h, s, l)) return hslToRgb(212, 0.18, toonLight(l, 0.34, 0.48, 0.64, 0.82));
  if (s < 0.18) return hslToRgb(h, 0.12, toonLight(l, 0.18, 0.3, 0.43, 0.6));
  return hslToRgb(h, Math.min(0.76, s * 0.82), toonLight(l, 0.18, 0.32, 0.48, 0.64));
}

function toonLight(l, shadow, mid, light, highlight) {
  if (l < 0.24) return shadow;
  if (l < 0.48) return mid;
  if (l < 0.72) return light;
  return highlight;
}

async function addSpriteOutline(frame) {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const outline = Buffer.alloc(info.width * info.height * 4);
  const radius = 1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const index = (y * info.width + x) * 4;
      if (data[index + 3] > 32) continue;

      let nearSprite = false;
      for (let oy = -radius; oy <= radius && !nearSprite; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue;
          if (data[(ny * info.width + nx) * 4 + 3] > 64) {
            nearSprite = true;
            break;
          }
        }
      }

      if (!nearSprite) continue;
      outline[index] = 20;
      outline[index + 1] = 24;
      outline[index + 2] = 30;
      outline[index + 3] = 210;
    }
  }

  return sharp(outline, { raw: { width: info.width, height: info.height, channels: 4 } })
    .composite([{ input: frame, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function addGroundShadow(frame) {
  const { info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const shadow = Buffer.alloc(info.width * info.height * 4);
  const cx = Math.round(info.width / 2);
  const cy = info.height - 8;
  const rx = 23;
  const ry = 6;

  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (x < 0 || x >= info.width || y < 0 || y >= info.height) continue;
      const distance = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (distance > 1) continue;
      const alpha = Math.round((1 - distance) * 72);
      const index = (y * info.width + x) * 4;
      shadow[index] = 0;
      shadow[index + 1] = 0;
      shadow[index + 2] = 0;
      shadow[index + 3] = alpha;
    }
  }

  return sharp(shadow, { raw: { width: info.width, height: info.height, channels: 4 } })
    .composite([{ input: frame, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function isBlueCloth(h, s, l) {
  return h >= 190 && h <= 252 && s > 0.22 && l > 0.06 && l < 0.82;
}

function isGoldTrim(h, s, l) {
  return h >= 38 && h <= 62 && s > 0.28 && l > 0.26 && l < 0.88;
}

function isHorse(h, s, l) {
  return h >= 12 && h <= 38 && s > 0.18 && l > 0.06 && l < 0.48;
}

function isSkin(h, s, l) {
  return h >= 8 && h <= 42 && s > 0.18 && l >= 0.48 && l < 0.86;
}

function isMetal(h, s, l) {
  return s < 0.24 && l >= 0.42;
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
