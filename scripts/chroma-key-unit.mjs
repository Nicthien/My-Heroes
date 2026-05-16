import path from "node:path";
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error("Usage: node scripts/chroma-key-unit.mjs <input> <output>");
}

const key = { r: 255, g: 0, b: 255 };
const transparentThreshold = 50;
const opaqueThreshold = 155;

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const out = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  let r = data[i];
  let g = data[i + 1];
  let b = data[i + 2];
  const a = data[i + 3];
  const dist = Math.hypot(r - key.r, g - key.g, b - key.b);
  let t = Math.max(0, Math.min(1, (dist - transparentThreshold) / (opaqueThreshold - transparentThreshold)));
  t = t * t * (3 - 2 * t);
  let alpha = Math.round(a * t);

  const magentaSpill = r > g + 30 && b > g + 30;
  if (magentaSpill && alpha < 245) {
    const neutral = Math.max(g, Math.min(r, b) - 20);
    r = Math.round(r * 0.35 + neutral * 0.65);
    b = Math.round(b * 0.35 + neutral * 0.65);
  }

  out[i] = r;
  out[i + 1] = g;
  out[i + 2] = b;
  out[i + 3] = alpha;
}

await sharp(out, { raw: info })
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
  .resize(512, 512, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .webp({ quality: 95, alphaQuality: 100, smartSubsample: true })
  .toFile(path.resolve(output));
