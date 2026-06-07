// Import a ComfyUI-generated (or any) square source image into the game's isometric
// terrain-tile format: a diamond top plus two shaded side faces, as .webp, matching
// the geometry produced by scripts/generate-terrain-textures.mjs.
//
// Usage:
//   node scripts/import-terrain-texture.mjs --terrain rough --variant clean \
//     --src assets/generated/rough.png --tags clean
//
// Writes to public/assets/textures/terrain/<terrain>/:
//   <terrain>-<variant>.webp            (top, 128x64, diamond-clipped)
//   <terrain>-<variant>-side-SW.webp    (camera-left face, 128x96)
//   <terrain>-<variant>-side-SE.webp    (camera-right face, 128x96)
// then prints the TERRAIN_TOP_TEXTURES entry to paste into
// src/lib/rendering/phaser/assets.ts.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Geometry mirrors generate-terrain-textures.mjs.
const SOURCE_TOP = { w: 256, h: 128 };
const OUTPUT_TOP = { w: 128, h: 64 };
const SOURCE_SIDE = { w: 256, h: 192 };
const OUTPUT_SIDE = { w: 128, h: 96 };
const DIAMOND_PATH = "M128 0 256 64 128 128 0 64Z";
const FACE_SW = "M0 0 256 96 256 192 0 96Z"; // camera-left (brighter)
const FACE_SE = "M0 96 256 0 256 96 0 192Z"; // camera-right (darker)
const SHADE_SW = 0.72;
const SHADE_SE = 0.52;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function maskSvg(width, height, d) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="${d}" fill="#fff"/></svg>`
  );
}

// Drop the outer INSET of the source on every side before clipping. ComfyUI often
// composes a centered "slab" with a border (edge rocks, vignette, or white
// background); the actual tileable material is in the center, so we keep only that.
const INSET = 0.14;

async function writeClippedFace({ src, canvas, output, clipPath, brightness }) {
  const meta = await sharp(src).metadata();
  const left = Math.round(meta.width * INSET);
  const top = Math.round(meta.height * INSET);
  const width = meta.width - left * 2;
  const height = meta.height - top * 2;
  const base = sharp(src).extract({ left, top, width, height }).resize(canvas.w, canvas.h, { fit: "fill" });
  const filled = brightness === 1 ? base : base.modulate({ brightness });
  const masked = await filled
    .composite([{ input: maskSvg(canvas.w, canvas.h, clipPath), blend: "dest-in" }])
    .png()
    .toBuffer();
  await sharp(masked)
    .resize(output.w, output.h, { fit: "fill" })
    .webp({ lossless: true, effort: 6 })
    .toFile(output.path);
  console.log(`  -> ${path.relative(process.cwd(), output.path)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const terrain = args.terrain;
  const variant = args.variant ?? "clean";
  const src = args.src;
  const tags = (args.tags ?? "clean").split(",").map((t) => t.trim()).filter(Boolean);

  if (!terrain || !src) {
    console.error("Usage: node scripts/import-terrain-texture.mjs --terrain <name> --variant <slug> --src <image> [--tags a,b]");
    process.exit(1);
  }
  if (!fs.existsSync(src)) {
    console.error(`Source image not found: ${src}`);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "public", "assets", "textures", "terrain", terrain);
  fs.mkdirSync(outDir, { recursive: true });
  const stem = `${terrain}-${variant}`;

  console.log(`Importing ${src} -> ${terrain}/${variant}`);
  await writeClippedFace({
    src, canvas: SOURCE_TOP, output: { ...OUTPUT_TOP, path: path.join(outDir, `${stem}.webp`) },
    clipPath: DIAMOND_PATH, brightness: 1,
  });
  await writeClippedFace({
    src, canvas: SOURCE_SIDE, output: { ...OUTPUT_SIDE, path: path.join(outDir, `${stem}-side-SW.webp`) },
    clipPath: FACE_SW, brightness: SHADE_SW,
  });
  await writeClippedFace({
    src, canvas: SOURCE_SIDE, output: { ...OUTPUT_SIDE, path: path.join(outDir, `${stem}-side-SE.webp`) },
    clipPath: FACE_SE, brightness: SHADE_SE,
  });

  const tagList = tags.map((t) => `"${t}"`).join(", ");
  console.log("\nAdd this entry to TERRAIN_TOP_TEXTURES in src/lib/rendering/phaser/assets.ts:");
  console.log(`    { path: "/assets/textures/terrain/${terrain}/${stem}.webp", tags: [${tagList}] },`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
