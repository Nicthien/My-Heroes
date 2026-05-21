import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "assets", "sprites", "map");

fs.mkdirSync(OUT_DIR, { recursive: true });

const HEAVY_FRAMES = 6;

await writeWebp("world-edge-cliff.webp", makeCliff(80, 228));
await writeWebp("world-edge-mist.webp", makeMist(128, 80, 17));
await writeWebp("world-edge-foam.webp", makeFoam(96, 28, 29));

for (let frame = 0; frame < HEAVY_FRAMES; frame++) {
  await writeWebp(`world-edge-waterfall-heavy-${frame}.webp`, makeWaterfall(72, 268, frame, "heavy"));
}

async function writeWebp(name, image) {
  const output = path.join(OUT_DIR, name);
  await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .webp({ lossless: true, effort: 6 })
    .toFile(output);
  console.log(`Generated ${path.relative(process.cwd(), output)}`);
}

function makeImage(width, height, fill = [0, 0, 0, 0]) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { width, height, data };
}

function makeCliff(width, height) {
  const img = makeImage(width, height);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const left = 6 + Math.floor(noise(y * 0.051, 0, 31) * 9 + Math.sin(y * 0.07) * 4);
    const right = width - 7 - Math.floor(noise(y * 0.047, 0, 47) * 9 + Math.cos(y * 0.06) * 4);
    for (let x = 0; x < width; x++) {
      const edgeFade = Math.min((x - left) / 8, (right - x) / 8, 1);
      if (edgeFade <= 0) continue;
      const column = Math.floor((x + noise(x * 0.07, y * 0.012, 5) * 18) / 11);
      const grain = noise(x * 0.18, y * 0.12, 23);
      const crack = Math.abs(((x + column * 7 + Math.floor(y * 0.18)) % 19) - 9) < 1.1 ? 0.45 : 0;
      const light = x < width * 0.44 ? 1.12 : 0.74;
      const shade = (0.62 + grain * 0.35 - t * 0.24 - crack) * light;
      const i = (y * width + x) * 4;
      img.data[i] = clamp8(107 * shade + 28);
      img.data[i + 1] = clamp8(91 * shade + 25);
      img.data[i + 2] = clamp8(67 * shade + 22);
      img.data[i + 3] = clamp8(235 * Math.min(1, edgeFade));
    }
  }

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < width; x++) {
      if (random(x + y * 73, 61) < 0.18) continue;
      blendPixel(img, x, y, [184, 164, 124, 140 - y * 6]);
    }
  }

  return img;
}

function makeWaterfall(width, height, frame, kind) {
  const img = makeImage(width, height);
  const heavy = kind === "heavy";
  const streamCount = heavy ? 8 : 4;
  const baseAlpha = heavy ? 168 : 82;
  const edge = heavy ? 8 : 12;
  const fallSpeed = heavy ? 13 : 8;

  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const bottomFade = 1 - smoothstep(0.78, 1, t) * 0.55;
    const topFade = smoothstep(0, 0.07, t);
    for (let x = 0; x < width; x++) {
      const centerFade = Math.min((x - edge) / 10, (width - edge - x) / 10, 1);
      if (centerFade <= 0) continue;
      let stream = 0;
      for (let s = 0; s < streamCount; s++) {
        const cx = ((s + 0.5) / streamCount) * width + Math.sin((y + s * 23 + frame * fallSpeed) * 0.045) * (heavy ? 4 : 2.5);
        const d = Math.abs(x - cx);
        stream += Math.max(0, 1 - d / (heavy ? 6 : 4.5));
      }
      const streak = noise(x * 0.11 + frame * 1.7, y * 0.08 - frame * 0.65, heavy ? 101 : 211);
      const foam = Math.max(0, 1 - y / (heavy ? 34 : 24));
      const alpha = (baseAlpha * Math.min(1, stream * 0.72 + streak * 0.42) + foam * 72) * centerFade * bottomFade * topFade;
      if (alpha < 4) continue;
      const i = (y * width + x) * 4;
      const glow = Math.min(1, stream * 0.55 + foam);
      img.data[i] = clamp8(146 + glow * 94);
      img.data[i + 1] = clamp8(204 + glow * 45);
      img.data[i + 2] = clamp8(226 + glow * 29);
      img.data[i + 3] = clamp8(alpha);
    }
  }

  const sprayHeight = heavy ? 58 : 36;
  for (let y = height - sprayHeight; y < height; y++) {
    const t = (y - (height - sprayHeight)) / sprayHeight;
    for (let x = 0; x < width; x++) {
      const cloud = noise(x * 0.08 + frame, y * 0.13, 311);
      const alpha = (1 - t) * cloud * (heavy ? 76 : 36);
      if (alpha > 5) blendPixel(img, x, y, [218, 244, 255, alpha]);
    }
  }

  return img;
}

function makeMist(width, height, seed) {
  const img = makeImage(width, height);
  const puffs = [
    [0.25, 0.55, 0.3, 0.26],
    [0.5, 0.46, 0.38, 0.32],
    [0.72, 0.6, 0.34, 0.26],
    [0.48, 0.72, 0.5, 0.2],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let alpha = 0;
      for (const [px, py, rx, ry] of puffs) {
        const dx = (x / width - px) / rx;
        const dy = (y / height - py) / ry;
        alpha += Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)) * 68;
      }
      alpha *= 0.68 + noise(x * 0.13, y * 0.13, seed) * 0.55;
      if (alpha > 4) blendPixel(img, x, y, [202, 235, 255, alpha]);
    }
  }
  return img;
}

function makeFoam(width, height, seed) {
  const img = makeImage(width, height);
  for (let y = 0; y < height; y++) {
    const vertical = 1 - y / height;
    for (let x = 0; x < width; x++) {
      const ripple = Math.sin(x * 0.34 + noise(x * 0.1, y * 0.2, seed) * 3) * 0.5 + 0.5;
      const alpha = Math.max(0, vertical * 150 - y * 4 + ripple * 54);
      if (alpha > 8) blendPixel(img, x, y, [221, 250, 255, alpha]);
    }
  }
  return img;
}

function blendPixel(img, x, y, color) {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return;
  const i = (Math.floor(y) * img.width + Math.floor(x)) * 4;
  const a = clamp(color[3] / 255, 0, 1);
  const ia = 1 - a;
  img.data[i] = clamp8(color[0] * a + img.data[i] * ia);
  img.data[i + 1] = clamp8(color[1] * a + img.data[i + 1] * ia);
  img.data[i + 2] = clamp8(color[2] * a + img.data[i + 2] * ia);
  img.data[i + 3] = clamp8(color[3] + img.data[i + 3] * ia);
}

function noise(x, y, seed) {
  const a = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  const b = Math.sin((x + 19.19) * 4.898 + (y - 7.7) * 33.233 + seed * 11.131) * 24634.6345;
  return (fract(a) * 0.65 + fract(b) * 0.35);
}

function random(n, seed) {
  return fract(Math.sin(n * 127.1 + seed * 311.7) * 43758.5453123);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function fract(value) {
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp8(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
