import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const DEFAULT_OUT_DIR = path.join(ROOT, "public", "assets", "sprites", "units");
const DEFAULT_PREVIEW_DIR = path.join(ROOT, "tmp", "unit-sprite-previews");
const CANVAS = 512;
const TARGET = {
  bboxHeight: 384,
  centerX: 259.5,
  centerY: 251.5,
};
const ALPHA_THRESHOLD = 10;

const args = parseArgs(process.argv.slice(2));

if (args.help || args.inputs.length === 0) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

const outDir = path.resolve(args.outDir ?? DEFAULT_OUT_DIR);
const previewDir = path.resolve(args.previewDir ?? DEFAULT_PREVIEW_DIR);
const keyMode = args.key ?? "auto";
const writePreviews = args.preview !== false;

await fs.mkdir(outDir, { recursive: true });
if (writePreviews) {
  await fs.mkdir(previewDir, { recursive: true });
}

const results = [];
for (const inputSpec of args.inputs) {
  const result = await processSprite(inputSpec);
  results.push(result);
}

if (writePreviews && results.length > 0) {
  await writeContactSheet(results, path.join(previewDir, "contact-sheet.png"));
}

console.table(results.map((result) => ({
  unit: result.unit,
  source: path.relative(ROOT, result.input),
  output: path.relative(ROOT, result.output),
  bounds: `${result.bounds.width}x${result.bounds.height}`,
  coverage: `${result.coveragePercent}%`,
  warnings: result.warnings.join(", "),
})));

async function processSprite(inputSpec) {
  const input = path.resolve(inputSpec.input);
  const unit = inputSpec.unit ?? unitNameFromPath(input);
  const output = path.join(outDir, `${unit}.webp`);
  const source = await fs.readFile(input);
  const cutout = await removeBackground(source, keyMode);
  const normalized = await normalizeSprite(cutout);
  const bounds = await getAlphaBounds(normalized);

  await sharp(normalized)
    .webp({ lossless: true, quality: 100, effort: 6 })
    .toFile(output);

  const metadata = await sharp(output).metadata();
  const coveragePercent = await alphaCoverage(output);
  const warnings = validateOutput({ metadata, bounds, coveragePercent });

  let previewBlack = null;
  let previewGrid = null;
  if (writePreviews) {
    previewBlack = path.join(previewDir, `${unit}-black.png`);
    previewGrid = path.join(previewDir, `${unit}-grid.png`);
    await renderPreview(output, previewBlack, "black");
    await renderPreview(output, previewGrid, "grid");
  }

  return {
    unit,
    input,
    output,
    previewBlack,
    previewGrid,
    bounds,
    coveragePercent,
    warnings,
  };
}

async function removeBackground(buffer, mode) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const classifier = backgroundClassifier(data, info, mode);
  const backgroundMask = floodBackground(data, info, classifier);
  softenBackgroundEdge(data, info, backgroundMask, classifier);

  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 4;
    if (backgroundMask[pixel]) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
    } else {
      data[offset + 3] = 255;
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

function backgroundClassifier(data, info, mode) {
  if (mode !== "auto") {
    return pixelClassifier(mode);
  }

  const samples = [];
  const sampleCount = 24;
  for (let i = 0; i < sampleCount; i += 1) {
    const x = Math.round((info.width - 1) * (i / (sampleCount - 1)));
    samples.push(readRgb(data, info.width, x, 0));
    samples.push(readRgb(data, info.width, x, info.height - 1));
    const y = Math.round((info.height - 1) * (i / (sampleCount - 1)));
    samples.push(readRgb(data, info.width, 0, y));
    samples.push(readRgb(data, info.width, info.width - 1, y));
  }

  const avg = samples.reduce((sum, rgb) => ({
    r: sum.r + rgb.r,
    g: sum.g + rgb.g,
    b: sum.b + rgb.b,
  }), { r: 0, g: 0, b: 0 });
  avg.r /= samples.length;
  avg.g /= samples.length;
  avg.b /= samples.length;

  if (avg.r > 200 && avg.g > 200 && avg.b > 200) {
    return pixelClassifier("white");
  }
  if (avg.r > 170 && avg.b > 150 && avg.g < 110) {
    return pixelClassifier("magenta");
  }
  return pixelClassifier("edge", avg);
}

function pixelClassifier(mode, edgeColor = null) {
  if (mode === "white") {
    return (r, g, b) => Math.min(r, g, b) > 205 && colorSpread(r, g, b) < 48;
  }
  if (mode === "magenta") {
    return (r, g, b) => {
      const closeKey = Math.abs(r - 250) < 55 && g < 45 && Math.abs(b - 245) < 65;
      const purple = g < 110 && r > g + 18 && b > g + 18 && Math.abs(r - b) < 160;
      return closeKey || purple;
    };
  }
  if (mode === "edge" && edgeColor) {
    return (r, g, b) => colorDistance({ r, g, b }, edgeColor) < 62;
  }
  throw new Error(`Unknown --key mode "${mode}". Use auto, white, or magenta.`);
}

function floodBackground(data, info, isBackground) {
  const pixelCount = info.width * info.height;
  const seen = new Uint8Array(pixelCount);
  const stack = [];

  function tryPush(x, y) {
    if (x < 0 || x >= info.width || y < 0 || y >= info.height) return;
    const pixel = y * info.width + x;
    if (seen[pixel]) return;

    const offset = pixel * 4;
    if (!isBackground(data[offset], data[offset + 1], data[offset + 2])) return;

    seen[pixel] = 1;
    stack.push(pixel);
  }

  for (let x = 0; x < info.width; x += 1) {
    tryPush(x, 0);
    tryPush(x, info.height - 1);
  }
  for (let y = 0; y < info.height; y += 1) {
    tryPush(0, y);
    tryPush(info.width - 1, y);
  }

  while (stack.length > 0) {
    const pixel = stack.pop();
    const x = pixel % info.width;
    const y = (pixel - x) / info.width;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  return seen;
}

function softenBackgroundEdge(data, info, backgroundMask, isBackground) {
  const additions = [];
  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const pixel = y * info.width + x;
      if (backgroundMask[pixel]) continue;

      const touchesBackground =
        backgroundMask[pixel - 1] ||
        backgroundMask[pixel + 1] ||
        backgroundMask[pixel - info.width] ||
        backgroundMask[pixel + info.width];
      if (!touchesBackground) continue;

      const offset = pixel * 4;
      if (isBackground(data[offset], data[offset + 1], data[offset + 2])) {
        additions.push(pixel);
      }
    }
  }

  for (const pixel of additions) {
    backgroundMask[pixel] = 1;
  }
}

async function normalizeSprite(buffer) {
  const bounds = await getAlphaBounds(buffer);
  const scale = Math.min(TARGET.bboxHeight / bounds.height, CANVAS / bounds.width);
  const resizedWidth = Math.round(bounds.width * scale);
  const resizedHeight = Math.round(bounds.height * scale);
  const left = Math.round(TARGET.centerX - resizedWidth / 2);
  const top = Math.round(TARGET.centerY - resizedHeight / 2);

  const cropped = await sharp(buffer)
    .extract(bounds)
    .resize(resizedWidth, resizedHeight, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cropped, left, top }])
    .png()
    .toBuffer();
}

async function getAlphaBounds(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("No visible pixels found after background removal.");
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function alphaCoverage(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let visible = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > ALPHA_THRESHOLD) visible += 1;
  }
  return Number(((visible / (info.width * info.height)) * 100).toFixed(1));
}

function validateOutput({ metadata, bounds, coveragePercent }) {
  const warnings = [];
  if (metadata.width !== CANVAS || metadata.height !== CANVAS) {
    warnings.push("not-512");
  }
  if (!metadata.hasAlpha) {
    warnings.push("no-alpha");
  }
  if (bounds.width > CANVAS || bounds.height > CANVAS) {
    warnings.push("cropped");
  }
  if (bounds.height < 320) {
    warnings.push("small-bounds");
  }
  if (coveragePercent < 12 || coveragePercent > 42) {
    warnings.push("coverage");
  }
  return warnings;
}

async function renderPreview(input, output, mode) {
  if (mode === "black") {
    await sharp(input)
      .flatten({ background: "#000000" })
      .png()
      .toFile(output);
    return;
  }

  const checker = await checkerboard(CANVAS, CANVAS);
  await sharp(checker)
    .composite([{ input }])
    .png()
    .toFile(output);
}

async function writeContactSheet(results, output) {
  const tileWidth = 256;
  const tileHeight = 306;
  const padding = 16;
  const columns = Math.min(4, results.length);
  const rows = Math.ceil(results.length / columns);
  const width = columns * tileWidth + (columns + 1) * padding;
  const height = rows * tileHeight + (rows + 1) * padding;
  const composites = [];

  for (const [index, result] of results.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (tileWidth + padding);
    const top = padding + row * (tileHeight + padding);
    const sprite = await sharp(result.output)
      .resize(224, 224, { fit: "contain" })
      .flatten({ background: "#111111" })
      .png()
      .toBuffer();
    composites.push({ input: sprite, left: left + 16, top: top + 12 });
    composites.push({
      input: Buffer.from(labelSvg(result.unit, tileWidth, 54)),
      left,
      top: top + 244,
    });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#181818",
    },
  })
    .composite(composites)
    .png()
    .toFile(output);
}

async function checkerboard(width, height) {
  const tile = 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#242424"/>
    ${Array.from({ length: Math.ceil(height / tile) }, (_, y) => (
      Array.from({ length: Math.ceil(width / tile) }, (__, x) => (
        (x + y) % 2 === 0 ? `<rect x="${x * tile}" y="${y * tile}" width="${tile}" height="${tile}" fill="#303030"/>` : ""
      )).join("")
    )).join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function labelSvg(text, width, height) {
  const safe = escapeXml(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#202020"/>
    <text x="${width / 2}" y="23" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#f8fafc">${safe}</text>
    <text x="${width / 2}" y="43" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#a3a3a3">512 WebP alpha</text>
  </svg>`;
}

function parseArgs(argv) {
  const parsed = {
    inputs: [],
    preview: true,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--no-preview") parsed.preview = false;
    else if (arg.startsWith("--out-dir=")) parsed.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--preview-dir=")) parsed.previewDir = arg.slice("--preview-dir=".length);
    else if (arg.startsWith("--key=")) parsed.key = arg.slice("--key=".length);
    else if (arg.includes("=")) {
      const [unit, input] = arg.split(/=(.*)/s);
      parsed.inputs.push({ unit, input });
    } else {
      parsed.inputs.push({ input: arg });
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`Usage:
  node scripts/process-unit-sprites.mjs [options] <unit=input.png> [more...]
  node scripts/process-unit-sprites.mjs [options] tmp/imagegen/centaur.png

Options:
  --key=auto|white|magenta       Background mode. Default: auto.
  --out-dir=<path>               Default: public/assets/sprites/units
  --preview-dir=<path>           Default: tmp/unit-sprite-previews
  --no-preview                   Skip black/grid previews and contact sheet.

Recommended source generation:
  Generate the sprite on a perfectly flat pure white (#ffffff) background.
  Avoid checkerboards, panels, shadows, floors, and backdrop elements.`);
}

function unitNameFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .replace(/[-_](source|white|transparent|alpha|final|sprite)$/i, "")
    .replace(/-/g, "_");
}

function readRgb(data, width, x, y) {
  const offset = (y * width + x) * 4;
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
}

function colorSpread(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function colorDistance(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
