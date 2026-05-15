import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "src", "lib", "game", "creature-catalog.json");
const SOURCE_ROOT = path.join(ROOT, "assets", "source", "sprites", "units");
const OUT_ROOT = path.join(ROOT, "public", "assets", "sprites", "units");

const OUTPUT_SIZE = 160;
const PORTRAIT_BOTTOM_MARGIN = 24;
const PORTRAIT_INNER_PADDING_X = 16;
const PORTRAIT_INNER_PADDING_TOP = 14;
const SOURCE_ROWS = 6;
const PORTRAIT_ROW_PREFERENCE = [0, 5, 3, 4, 1, 2];
const PORTRAIT_COLUMN_PREFERENCE = [4, 5, 6, 7, 0, 1, 2, 3, 8, 9, 10, 11];
const SOURCE_NAMES = ["ai-sheet.png", "ai-sheet.webp", "ai-sheet.jpg", "ai-sheet.jpeg"];

const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
const missing = [];
const onlyUnit = getArgValue("--unit");
const creatures = onlyUnit
  ? catalog.creatures.filter((creature) => creature.type === onlyUnit)
  : catalog.creatures;

if (onlyUnit && creatures.length === 0) {
  throw new Error(`Unknown unit type: ${onlyUnit}`);
}

await mkdir(OUT_ROOT, { recursive: true });

for (const creature of creatures) {
  const source = await findSource(creature.type);
  if (!source) {
    missing.push(creature.type);
    continue;
  }

  const outFile = path.join(OUT_ROOT, `${creature.type}.webp`);
  const portrait = await extractStaticUnitPortrait(source);
  await sharp(portrait).webp({ lossless: true, effort: 6 }).toFile(outFile);
  console.log(`Generated ${path.relative(ROOT, outFile)} from ${path.relative(ROOT, source)}`);
}

if (missing.length > 0) {
  const message = [
    `${onlyUnit ? "Missing" : "Skipped"} AI raster source sheets for ${missing.length} unit(s).`,
    `Expected one of ${SOURCE_NAMES.join(", ")} in assets/source/sprites/units/{unitType}/.`,
    `First missing units: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "..." : ""}`,
  ].join("\n");

  if (onlyUnit) {
    console.error(message);
    process.exit(1);
  }

  console.warn(message);
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

async function findSource(unitType) {
  for (const name of SOURCE_NAMES) {
    const file = path.join(SOURCE_ROOT, unitType, name);
    try {
      await access(file);
      return file;
    } catch {
      // Try the next supported raster source name.
    }
  }
  return null;
}

async function extractStaticUnitPortrait(source) {
  const metadata = await sharp(source).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  const sourceRows = sourceHeight >= 64 * SOURCE_ROWS ? SOURCE_ROWS : 1;

  if (sourceWidth < 32 || sourceHeight < 32) {
    throw new Error(`${source} is not a usable unit source image`);
  }

  const sourceBuffer = await removeFrameGreenSpill(await removeChromaBackdrop(await sharp(source).ensureAlpha().png().toBuffer()));
  const rowOrder = orderedIndexes(sourceRows, PORTRAIT_ROW_PREFERENCE);
  const candidates = [];

  for (const [rowRank, row] of rowOrder.entries()) {
    const rowTop = Math.round(row * sourceHeight / sourceRows);
    const rowBottom = Math.round((row + 1) * sourceHeight / sourceRows);
    const rowHeight = Math.max(1, rowBottom - rowTop);
    const rowBuffer = await sharp(sourceBuffer)
      .extract({ left: 0, top: rowTop, width: sourceWidth, height: rowHeight })
      .png()
      .toBuffer();
    const ranges = groupLooseSpriteRanges(await detectSpriteRanges(rowBuffer));
    const columnOrder = orderedIndexes(ranges.length, PORTRAIT_COLUMN_PREFERENCE);

    for (const [columnRank, column] of columnOrder.entries()) {
      const candidate = await buildPortraitCandidate(rowBuffer, sourceWidth, rowHeight, ranges[column], rowRank, columnRank);
      if (candidate) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Detected unit bounds are empty in ${source}`);
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const padded = padBounds(best.bounds, best.width, best.height);
  const cropped = await sharp(best.buffer)
    .extract({
      left: padded.left,
      top: padded.top,
      width: padded.right - padded.left + 1,
      height: padded.bottom - padded.top + 1,
    })
    .png()
    .toBuffer();

  return fitPortrait(cropped);
}

function orderedIndexes(count, preferred) {
  const preferredSet = new Set(preferred.filter((index) => index >= 0 && index < count));
  return [
    ...preferred.filter((index) => index >= 0 && index < count),
    ...Array.from({ length: count }, (_, index) => index).filter((index) => !preferredSet.has(index)),
  ];
}

async function buildPortraitCandidate(rowBuffer, sourceWidth, rowHeight, range, rowRank, columnRank) {
  const padding = Math.max(4, Math.round((range.right - range.left + 1) * 0.08));
  const left = Math.max(0, range.left - padding);
  const right = Math.min(sourceWidth - 1, range.right + padding);
  const frame = await sharp(rowBuffer)
    .extract({ left, top: 0, width: right - left + 1, height: rowHeight })
    .png()
    .toBuffer();
  const cleanedFrame = await removeFrameGreenSpill(frame);
  const { data, info } = await sharp(cleanedFrame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = getPrimaryVisibleBounds(data, info.width, info.height, 0, info.width - 1);
  if (!bounds || bounds.visiblePixels < 500) return null;
  const boundsWidth = bounds.right - bounds.left + 1;
  const boundsHeight = bounds.bottom - bounds.top + 1;
  if (boundsHeight < Math.max(34, rowHeight * 0.25) || boundsWidth / boundsHeight > 2.25) return null;

  return {
    buffer: cleanedFrame,
    bounds,
    height: info.height,
    score: scorePortraitCandidate(data, info.width, info.height, bounds, rowRank, columnRank),
    width: info.width,
  };
}

async function detectSpriteRanges(rowBuffer) {
  const { data, info } = await sharp(rowBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = [];
  for (let x = 0; x < info.width; x++) {
    let count = 0;
    for (let y = 0; y < info.height; y++) {
      if (data[(y * info.width + x) * 4 + 3] > 24) count++;
    }
    counts.push(count);
  }

  const active = counts.map((count) => count > Math.max(2, info.height * 0.015));
  const ranges = [];
  let start = -1;
  let lastActive = -1;
  const maxGap = Math.max(8, Math.round(info.width / 180));

  for (let x = 0; x < active.length; x++) {
    if (active[x]) {
      if (start < 0) start = x;
      lastActive = x;
      continue;
    }
    if (start >= 0 && x - lastActive > maxGap) {
      ranges.push({ left: start, right: lastActive });
      start = -1;
      lastActive = -1;
    }
  }
  if (start >= 0) ranges.push({ left: start, right: lastActive });

  return ranges
    .map((range) => expandRangeToVisibleBounds(data, info.width, info.height, range))
    .filter((range) => range.right - range.left > 8)
    .sort((a, b) => a.left - b.left);
}

function groupLooseSpriteRanges(ranges) {
  const groups = [];

  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index];
    const width = range.right - range.left + 1;
    const previous = groups[groups.length - 1];
    const next = ranges[index + 1];

    if (previous && range.left - previous.right <= 64 && range.right - previous.left + 1 <= 190) {
      previous.right = range.right;
      continue;
    }

    if (width <= 34 && previous && range.left - previous.right <= 48 && range.right - previous.left + 1 <= 150) {
      previous.right = range.right;
      continue;
    }

    if (width <= 34 && next && next.left - range.right <= 48 && next.right - range.left + 1 <= 150) {
      groups.push({ left: range.left, right: next.right });
      index++;
      continue;
    }

    groups.push({ left: range.left, right: range.right });
  }

  return groups;
}

function expandRangeToVisibleBounds(data, width, height, range) {
  let left = range.left;
  let right = range.right;
  for (let x = range.left; x >= 0; x--) {
    if (!columnHasAlpha(data, width, height, x)) break;
    left = x;
  }
  for (let x = range.right; x < width; x++) {
    if (!columnHasAlpha(data, width, height, x)) break;
    right = x;
  }
  return { left, right };
}

function columnHasAlpha(data, width, height, x) {
  for (let y = 0; y < height; y++) {
    if (data[(y * width + x) * 4 + 3] > 16) return true;
  }
  return false;
}

function scorePortraitCandidate(data, width, height, bounds, rowRank, columnRank) {
  const boundsHeight = bounds.bottom - bounds.top + 1;
  const lowerTop = Math.max(bounds.top, bounds.bottom - Math.max(8, Math.round(boundsHeight * 0.24)));
  const lowerBand = getVisibleBandStats(data, width, lowerTop, bounds.bottom, bounds.left, bounds.right);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerPenalty = Math.abs(centerX - width / 2) * 1.4;
  const edgePenalty =
    (bounds.left <= 1 ? 220 : 0) +
    (bounds.right >= width - 2 ? 220 : 0) +
    (bounds.top <= 1 ? 120 : 0) +
    (bounds.bottom >= height - 1 ? 70 : 0);

  return (
    bounds.visiblePixels * 0.055 +
    boundsHeight * 4.4 +
    lowerBand.visiblePixels * 0.2 +
    lowerBand.width * 4.2 -
    centerPenalty -
    edgePenalty -
    rowRank * 520 -
    columnRank * 75
  );
}

function getVisibleBandStats(data, width, top, bottom, left, right) {
  let visiblePixels = 0;
  let minX = right;
  let maxX = left;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (data[(y * width + x) * 4 + 3] <= 24) continue;
      visiblePixels++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }

  return {
    visiblePixels,
    width: visiblePixels > 0 ? maxX - minX + 1 : 0,
  };
}

function getPrimaryVisibleBounds(data, width, height, leftLimit, rightLimit) {
  const components = getVisibleComponents(data, width, height, leftLimit, rightLimit)
    .filter((component) => component.visiblePixels >= 18);
  if (components.length === 0) return null;

  const primary = components
    .map((component) => {
      const centerX = (component.left + component.right) / 2;
      const componentHeight = component.bottom - component.top + 1;
      return {
        component,
        score: component.visiblePixels + componentHeight * 9 - Math.abs(centerX - width / 2) * 7,
      };
    })
    .sort((a, b) => b.score - a.score)[0].component;

  const merged = { ...primary };
  for (const component of components) {
    if (component === primary) continue;
    if (getBoxDistance(primary, component) > 12) continue;
    merged.left = Math.min(merged.left, component.left);
    merged.top = Math.min(merged.top, component.top);
    merged.right = Math.max(merged.right, component.right);
    merged.bottom = Math.max(merged.bottom, component.bottom);
    merged.visiblePixels += component.visiblePixels;
  }

  return merged;
}

function getVisibleComponents(data, width, height, leftLimit, rightLimit) {
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let y = 0; y < height; y++) {
    for (let x = leftLimit; x <= rightLimit; x++) {
      const startPixel = y * width + x;
      if (visited[startPixel] || data[startPixel * 4 + 3] <= 24) continue;

      const component = { left: x, top: y, right: x, bottom: y, visiblePixels: 0 };
      const stack = [startPixel];
      visited[startPixel] = 1;

      while (stack.length > 0) {
        const pixel = stack.pop();
        const px = pixel % width;
        const py = Math.floor(pixel / width);
        component.visiblePixels++;
        component.left = Math.min(component.left, px);
        component.top = Math.min(component.top, py);
        component.right = Math.max(component.right, px);
        component.bottom = Math.max(component.bottom, py);

        for (let ny = Math.max(0, py - 1); ny <= Math.min(height - 1, py + 1); ny++) {
          for (let nx = Math.max(leftLimit, px - 1); nx <= Math.min(rightLimit, px + 1); nx++) {
            const nextPixel = ny * width + nx;
            if (visited[nextPixel] || data[nextPixel * 4 + 3] <= 24) continue;
            visited[nextPixel] = 1;
            stack.push(nextPixel);
          }
        }
      }

      components.push(component);
    }
  }

  return components;
}

function getBoxDistance(a, b) {
  const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return Math.hypot(dx, dy);
}

function padBounds(bounds, width, height) {
  const frameWidth = bounds.right - bounds.left + 1;
  const frameHeight = bounds.bottom - bounds.top + 1;
  const padding = Math.max(10, Math.round(Math.max(frameWidth, frameHeight) * 0.08));
  return {
    left: Math.max(0, bounds.left - padding),
    top: Math.max(0, bounds.top - padding),
    right: Math.min(width - 1, bounds.right + padding),
    bottom: Math.min(height - 1, bounds.bottom + padding),
  };
}

async function fitPortrait(buffer) {
  const visibleInput = await sharp(buffer)
    .resize(OUTPUT_SIZE - PORTRAIT_INNER_PADDING_X * 2, OUTPUT_SIZE - PORTRAIT_BOTTOM_MARGIN - PORTRAIT_INNER_PADDING_TOP, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(visibleInput).metadata();
  const width = metadata.width ?? OUTPUT_SIZE;
  const height = metadata.height ?? OUTPUT_SIZE;
  const left = Math.max(0, Math.round((OUTPUT_SIZE - width) / 2));
  const top = Math.max(0, OUTPUT_SIZE - height - PORTRAIT_BOTTOM_MARGIN);

  return sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: visibleInput, left, top }])
    .png()
    .toBuffer();
}

async function removeChromaBackdrop(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const key = sampleBorderKey(data, info.width, info.height);
  if (!key || key.alpha < 220 || key.g < 140 || key.g - Math.max(key.r, key.b) < 45) return buffer;

  const visited = new Uint8Array(info.width * info.height);
  const queue = [];
  const push = (x, y) => {
    const pixel = y * info.width + x;
    if (visited[pixel] || !isBackdropGreen(data, pixel * 4, key)) return;
    visited[pixel] = 1;
    queue.push(pixel);
  };

  for (let x = 0; x < info.width; x++) {
    push(x, 0);
    push(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y++) {
    push(0, y);
    push(info.width - 1, y);
  }

  for (let head = 0; head < queue.length; head++) {
    const pixel = queue[head];
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    if (x > 0) push(x - 1, y);
    if (x < info.width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < info.height - 1) push(x, y + 1);
  }

  for (const pixel of queue) {
    const index = pixel * 4;
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function removeFrameGreenSpill(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha <= 24) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
      continue;
    }

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const greenDominance = green - Math.max(red, blue);
    const vividGreen = green > 110 && greenDominance > 38 && green > red * 1.55 && green > blue * 1.45;
    const matteGreen = green > 75 && greenDominance > 8 && green > red * 1.22 && green > blue * 1.08;
    const paleKeyEdge = green > 220 && greenDominance > 16 && red > 150 && blue > 140;
    if (!vividGreen && !matteGreen && !paleKeyEdge) continue;

    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

function isBackdropGreen(data, index, key) {
  if (data[index + 3] < 16) return true;
  const distance = Math.hypot(data[index] - key.r, data[index + 1] - key.g, data[index + 2] - key.b);
  const greenDominance = data[index + 1] - Math.max(data[index], data[index + 2]);
  return distance < 185 && data[index + 1] > 70 && greenDominance > 12;
}

function sampleBorderKey(data, width, height) {
  const samples = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const colors = samples.map(([x, y]) => {
    const index = (y * width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2], alpha: data[index + 3] };
  });
  return colors.reduce((total, color) => ({
    r: total.r + color.r / colors.length,
    g: total.g + color.g / colors.length,
    b: total.b + color.b / colors.length,
    alpha: total.alpha + color.alpha / colors.length,
  }), { r: 0, g: 0, b: 0, alpha: 0 });
}
