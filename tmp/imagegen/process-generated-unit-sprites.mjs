import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "assets", "sprites", "units");
const PREVIEW_DIR = path.join(ROOT, "tmp", "unit-sprite-previews", "generated-factions");
const CANVAS = 512;
const TARGET = {
  bboxHeight: 384,
  centerX: 259.5,
  centerY: 251.5,
};
const ALPHA_THRESHOLD = 10;

const inputs = process.argv.slice(2).map((arg) => {
  const [unit, input] = arg.split(/=(.*)/s);
  if (!unit || !input) {
    throw new Error(`Usage: node tmp/imagegen/process-generated-unit-sprites.mjs unit=source.png [...]`);
  }
  return { unit, input: path.resolve(input) };
});

if (inputs.length === 0) {
  throw new Error("No inputs provided.");
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.mkdir(PREVIEW_DIR, { recursive: true });

const results = [];
for (const input of inputs) {
  results.push(await processUnit(input));
}

console.table(results.map((result) => ({
  unit: result.unit,
  output: path.relative(ROOT, result.output),
  bounds: `${result.bounds.width}x${result.bounds.height}`,
  coverage: `${result.coverage}%`,
  magenta: result.magentaVisible,
  warnings: result.warnings.join(", "),
})));

async function processUnit({ unit, input }) {
  const output = path.join(OUT_DIR, `${unit}.webp`);
  const cutout = await removeMagenta(await fs.readFile(input));
  const normalized = await normalize(cutout);
  const cleaned = await removeResidualMagenta(normalized);

  await sharp(cleaned)
    .webp({ lossless: true, quality: 100, effort: 6 })
    .toFile(output);

  const previewUnitDir = path.join(PREVIEW_DIR, unit);
  await fs.mkdir(previewUnitDir, { recursive: true });
  await sharp(output)
    .flatten({ background: "#000000" })
    .png()
    .toFile(path.join(previewUnitDir, "black.png"));
  await sharp(await checkerboard())
    .composite([{ input: output }])
    .png()
    .toFile(path.join(previewUnitDir, "grid.png"));

  const metadata = await sharp(output).metadata();
  const bounds = await alphaBounds(output);
  const coverage = await alphaCoverage(output);
  const magentaVisible = await visibleMagentaCount(output);
  const warnings = [];
  if (metadata.width !== CANVAS || metadata.height !== CANVAS) warnings.push("not-512");
  if (!metadata.hasAlpha) warnings.push("no-alpha");
  if (bounds.height < 330) warnings.push("small");
  if (coverage < 10 || coverage > 45) warnings.push("coverage");
  if (magentaVisible > 0) warnings.push("magenta");

  return { unit, output, bounds, coverage, magentaVisible, warnings };
}

async function removeMagenta(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    const g = data[i + 1];
    let b = data[i + 2];
    const a = data[i + 3];
    const magenta =
      r > 130 &&
      b > 115 &&
      g < 150 &&
      r > g + 22 &&
      b > g + 18;
    const strongMagenta =
      r > 170 &&
      b > 140 &&
      g < 115 &&
      r > g + 35 &&
      b > g + 30;

    let alpha = a;
    if (strongMagenta) {
      alpha = 0;
      r = 0;
      b = 0;
    } else if (magenta) {
      alpha = Math.round(a * 0.25);
      const neutral = Math.max(g, Math.min(r, b) - 40);
      r = Math.round(r * 0.25 + neutral * 0.75);
      b = Math.round(b * 0.25 + neutral * 0.75);
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = alpha;
  }

  return sharp(out, { raw: info }).png().toBuffer();
}

async function removeResidualMagenta(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const a = out[i + 3];
    if (
      a > 0 &&
      r > 140 &&
      b > 110 &&
      g < 130 &&
      r > g + 28 &&
      b > g + 22
    ) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    }
  }

  return sharp(out, { raw: info }).png().toBuffer();
}

async function normalize(inputBuffer) {
  const bounds = await alphaBounds(inputBuffer);
  const scale = Math.min(TARGET.bboxHeight / bounds.height, CANVAS / bounds.width);
  const resizedWidth = Math.round(bounds.width * scale);
  const resizedHeight = Math.round(bounds.height * scale);
  const left = Math.round(TARGET.centerX - resizedWidth / 2);
  const top = Math.round(TARGET.centerY - resizedHeight / 2);
  const cropped = await sharp(inputBuffer)
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

async function alphaBounds(input) {
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
      if (data[(y * info.width + x) * 4 + 3] > ALPHA_THRESHOLD) {
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

  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
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

async function visibleMagentaCount(input) {
  const { data } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i + 3] > ALPHA_THRESHOLD &&
      data[i] > 180 &&
      data[i + 2] > 140 &&
      data[i + 1] < 80
    ) {
      count += 1;
    }
  }
  return count;
}

async function checkerboard() {
  const tile = 32;
  let rects = "";
  for (let y = 0; y < CANVAS / tile; y += 1) {
    for (let x = 0; x < CANVAS / tile; x += 1) {
      const fill = (x + y) % 2 === 0 ? "#242424" : "#343434";
      rects += `<rect x="${x * tile}" y="${y * tile}" width="${tile}" height="${tile}" fill="${fill}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">${rects}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
