import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const unitsDir = path.join(process.cwd(), "public/assets/sprites/units");
const target = {
  canvasWidth: 512,
  canvasHeight: 512,
  bboxHeight: 384,
  centerX: 259.5,
  centerY: 251.5,
};
const alphaThreshold = 10;
const useGitIndex = process.argv.includes("--from-index");
const explicitFiles = process.argv
  .filter((arg) => arg.startsWith("--files="))
  .flatMap((arg) => arg.slice("--files=".length).split(","))
  .filter(Boolean)
  .map((fileName) => fileName.endsWith(".webp") ? fileName : `${fileName}.webp`);

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
      if (alpha > alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("No visible pixels found in sprite");
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function readSource(fileName) {
  const filePath = path.join(unitsDir, fileName);
  if (!useGitIndex) {
    return fs.promises.readFile(filePath);
  }

  const relativePath = `public/assets/sprites/units/${fileName}`;
  try {
    return execFileSync("git", ["show", `:${relativePath}`], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 100 * 1024 * 1024,
    });
  } catch {
    return fs.promises.readFile(filePath);
  }
}

async function renderNormalizedSprite(source, bounds, scale) {
  const resizedWidth = Math.round(bounds.width * scale);
  const resizedHeight = Math.round(bounds.height * scale);
  const left = Math.round(target.centerX - resizedWidth / 2);
  const top = Math.round(target.centerY - resizedHeight / 2);

  const resizedBuffer = await sharp(source)
    .extract(bounds)
    .resize(resizedWidth, resizedHeight, {
      fit: "fill",
      kernel: "lanczos3",
    })
    .webp({ quality: 95 })
    .toBuffer();

  const output = await sharp({
    create: {
      width: target.canvasWidth,
      height: target.canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedBuffer, left, top }])
    .webp({ quality: 95 })
    .toBuffer();

  return {
    output,
    resizedWidth,
    resizedHeight,
    croppedX: false,
  };
}

async function normalizeSprite(fileName) {
  const filePath = path.join(unitsDir, fileName);
  const source = await readSource(fileName);
  const bounds = await getAlphaBounds(source);
  const scale = Math.min(target.bboxHeight / bounds.height, target.canvasWidth / bounds.width);
  const rendered = await renderNormalizedSprite(source, bounds, scale);
  let outputBounds = await getAlphaBounds(rendered.output);

  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tempPath, rendered.output);
  await fs.promises.copyFile(tempPath, filePath);
  await fs.promises.rm(tempPath);

  return {
    file: fileName,
    before: `${bounds.width}x${bounds.height}`,
    after: `${outputBounds.width}x${outputBounds.height}`,
    croppedX: rendered.croppedX,
    scale: Number(scale.toFixed(3)),
  };
}

const files = (await fs.promises.readdir(unitsDir))
  .filter((fileName) => fileName.endsWith(".webp"))
  .filter((fileName) => explicitFiles.length === 0 || explicitFiles.includes(fileName))
  .filter((fileName) => fileName !== "pikeman.webp")
  .sort();

const results = [];
for (const fileName of files) {
  results.push(await normalizeSprite(fileName));
}

console.table(results);
