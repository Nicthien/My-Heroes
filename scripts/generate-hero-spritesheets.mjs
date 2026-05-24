import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = path.join(ROOT, "assets", "source", "sprites", "heroes", "master");
const OUT_ROOT = path.join(ROOT, "public", "assets", "sprites", "heroes");

const SOURCE_FRAME_WIDTH = 128;
const SOURCE_FRAME_HEIGHT = 128;
const SOURCE_COLUMNS = 12;
const SOURCE_ROWS = 8;
const SOURCE_CROP_PADDING_X = 48;
const SOURCE_CROP_PADDING_Y = 36;

const FRAME_WIDTH = 80;
const FRAME_HEIGHT = 80;
const WIDTH = FRAME_WIDTH * SOURCE_COLUMNS;
const HEIGHT = FRAME_HEIGHT * SOURCE_ROWS;

const FACTIONS = [
  "castle",
  "rampart",
  "tower",
  "inferno",
  "necropolis",
  "dungeon",
  "stronghold",
  "fortress",
  "conflux",
];

await assertSourcesExist();

for (const faction of FACTIONS) {
  await writeFactionSheet(faction);
}

async function assertSourcesExist() {
  const missing = [];

  for (const faction of FACTIONS) {
    const file = sourceFileForFaction(faction);
    try {
      await access(file);
    } catch {
      missing.push(path.relative(ROOT, file));
    }
  }

  if (missing.length === 0) return;

  throw new Error([
    "Missing hero master spritesheets.",
    "Add one PNG source per faction before generating hero sprites:",
    ...missing.map((file) => `- ${file}`),
    "",
    "Each source must be a complete 12x8 faction sheet on a black background.",
  ].join("\n"));
}

function sourceFileForFaction(faction) {
  return path.join(SOURCE_ROOT, `${faction}.png`);
}

async function writeFactionSheet(faction) {
  const source = sourceFileForFaction(faction);
  const frameBuffers = await extractFrames(source);
  const outDir = path.join(OUT_ROOT, faction);
  const outFile = path.join(outDir, "adventure.webp");

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
      left: (index % SOURCE_COLUMNS) * FRAME_WIDTH,
      top: Math.floor(index / SOURCE_COLUMNS) * FRAME_HEIGHT,
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

async function extractFrames(source) {
  const rows = [];
  const padded = await sharp(source)
    .ensureAlpha()
    .extend({
      top: SOURCE_CROP_PADDING_Y,
      bottom: SOURCE_CROP_PADDING_Y,
      left: SOURCE_CROP_PADDING_X,
      right: SOURCE_CROP_PADDING_X,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    })
    .png()
    .toBuffer();
  const cropWidth = SOURCE_FRAME_WIDTH + SOURCE_CROP_PADDING_X * 2;
  const cropHeight = SOURCE_FRAME_HEIGHT + SOURCE_CROP_PADDING_Y * 2;

  for (let row = 0; row < SOURCE_ROWS; row += 1) {
    const rowFrames = [];
    for (let column = 0; column < SOURCE_COLUMNS; column += 1) {
      const cell = await sharp(padded)
        .ensureAlpha()
        .extract({
          left: column * SOURCE_FRAME_WIDTH,
          top: row * SOURCE_FRAME_HEIGHT,
          width: cropWidth,
          height: cropHeight,
        })
        .png()
        .toBuffer();

      const keyed = await removeBlackBackground(cell);
      const cleaned = await keepHeroComponents(keyed, {
        centerX: cropWidth / 2,
        centerY: cropHeight / 2,
      });
      rowFrames.push(await normalizeCellToFrame(cleaned));
    }
    rowFrames[SOURCE_COLUMNS - 1] = rowFrames[SOURCE_COLUMNS - 2];
    rows.push(rowFrames);
  }

  rows[5] = await mirrorRow(rows[3]);
  rows[6] = await mirrorRow(rows[2]);
  rows[7] = await mirrorRow(rows[1]);

  return rows.flat();
}

async function mirrorRow(row) {
  return Promise.all(row.map((frame) => sharp(frame).flop().png().toBuffer()));
}

async function removeBlackBackground(cell) {
  const { data, info } = await sharp(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] <= 12 && data[i + 1] <= 12 && data[i + 2] <= 12) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function keepHeroComponents(cell, target) {
  const { data, info } = await sharp(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const visited = new Uint8Array(info.width * info.height);
  const keep = new Uint8Array(info.width * info.height);
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  const components = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const start = y * info.width + x;
      if (visited[start] || data[start * 4 + 3] <= 24) continue;

      const queue = [start];
      const component = [];
      visited[start] = 1;
      let componentMinY = y;
      let componentMaxY = y;
      let componentMinX = x;
      let componentMaxX = x;
      let sumX = 0;
      let sumY = 0;

      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head];
        const cx = current % info.width;
        const cy = Math.floor(current / info.width);
        component.push(current);
        sumX += cx;
        sumY += cy;
        componentMinX = Math.min(componentMinX, cx);
        componentMaxX = Math.max(componentMaxX, cx);
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

      components.push({
        pixels: component,
        size: component.length,
        minX: componentMinX,
        maxX: componentMaxX,
        minY: componentMinY,
        maxY: componentMaxY,
        centerX: sumX / component.length,
        centerY: sumY / component.length,
      });
    }
  }

  const best = pickTargetComponent(components, target);
  if (best) {
    for (const component of components) {
      if (!shouldKeepWithTarget(component, best, target)) continue;
      for (const index of component.pixels) keep[index] = 1;
    }
  }

  for (let i = 0; i < keep.length; i += 1) {
    if (keep[i]) continue;
    const offset = i * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

function pickTargetComponent(components, target) {
  let best = null;
  let bestScore = -Infinity;

  for (const component of components) {
    if (component.size < 24) continue;
    const dx = component.centerX - target.centerX;
    const dy = component.centerY - target.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const edgePenalty = component.minX <= 1 || component.maxX >= SOURCE_FRAME_WIDTH + SOURCE_CROP_PADDING_X * 2 - 2
      ? 600
      : 0;
    const score = component.size - distance * 18 - edgePenalty;
    if (score <= bestScore) continue;
    best = component;
    bestScore = score;
  }

  return best ?? [...components].sort((a, b) => b.size - a.size)[0] ?? null;
}

function shouldKeepWithTarget(component, targetComponent, target) {
  if (component === targetComponent) return true;
  if (component.size < 8 || component.size > 120) return false;

  const touchesHorizontalEdge = component.minX <= 1 || component.maxX >= SOURCE_FRAME_WIDTH + SOURCE_CROP_PADDING_X * 2 - 2;
  if (touchesHorizontalEdge && component.size > 16) return false;

  const dx = Math.abs(component.centerX - target.centerX);
  const dy = Math.abs(component.centerY - target.centerY);
  if (dx > SOURCE_FRAME_WIDTH * 0.52 || dy > SOURCE_FRAME_HEIGHT * 0.58) return false;

  const gapX = Math.max(0, Math.max(targetComponent.minX - component.maxX, component.minX - targetComponent.maxX));
  const gapY = Math.max(0, Math.max(targetComponent.minY - component.maxY, component.minY - targetComponent.maxY));
  if (Math.sqrt(gapX * gapX + gapY * gapY) > 6) return false;

  const insideExpandedTarget =
    component.minX >= targetComponent.minX - 10 &&
    component.maxX <= targetComponent.maxX + 10 &&
    component.minY >= targetComponent.minY - 10 &&
    component.maxY <= targetComponent.maxY + 10;
  return insideExpandedTarget;
}

async function normalizeCellToFrame(cell) {
  const { data, info } = await sharp(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = getAlphaBounds(data, info.width, info.height);
  if (!bounds) return cell;

  const boundsWidth = bounds.maxX - bounds.minX + 1;
  const boundsHeight = bounds.maxY - bounds.minY + 1;
  const cropped = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({
      left: bounds.minX,
      top: bounds.minY,
      width: boundsWidth,
      height: boundsHeight,
    })
    .resize(FRAME_WIDTH, FRAME_HEIGHT, {
      fit: "inside",
      kernel: sharp.kernel.nearest,
      withoutEnlargement: false,
    })
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

function getAlphaBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 24) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return { minX, minY, maxX, maxY };
}
