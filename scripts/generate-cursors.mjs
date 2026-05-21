import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join("public", "assets", "cursors");
const SOURCE = path.join(OUT_DIR, "source-imagegen-cursors.png");
const COLS = 8;
const ROWS = 5;
const OUTPUT_SIZE = 64;

const CURSORS = [
  ["cursor-adventure-arrive-land.webp", 0],
  ["cursor-adventure-arrive-land-2.webp", 1],
  ["cursor-adventure-arrive-land-3.webp", 2],
  ["cursor-adventure-arrive-land-4.webp", 3],
  ["cursor-adventure-arrive-sea.webp", 4],
  ["cursor-adventure-arrive-sea-hota.webp", 5],
  ["cursor-adventure-attack.webp", 6],
  ["cursor-adventure-dimension-door.webp", 7],
  ["cursor-adventure-move-air-hota.webp", 11],
  ["cursor-adventure-dimension-door-attack-hota.webp", 16],
  ["cursor-adventure-disembark.webp", 9],
  ["cursor-adventure-hero.webp", 10],
  ["cursor-adventure-move-land.webp", 30],
  ["cursor-adventure-move-sea.webp", 13],
  ["cursor-adventure-move-sea-hota.webp", 14],
  ["cursor-adventure-scroll-map.webp", 15],
  ["cursor-adventure-scuttle.webp", 12],
  ["cursor-adventure-scuttle-hota.webp", 17],
  ["cursor-adventure-town.webp", 18],
  ["cursor-adventure-trade.webp", 19],
  ["cursor-combat-attack-wall.webp", 20],
  ["cursor-combat-attack.webp", 21],
  ["cursor-combat-death-cloud-hota.webp", 22],
  ["cursor-combat-devour-hota.webp", 23],
  ["cursor-combat-fireball-hota.webp", 24],
  ["cursor-combat-first-aid.webp", 25],
  ["cursor-combat-heat-stroke-hota.webp", 26],
  ["cursor-combat-info.webp", 27],
  ["cursor-combat-invalid.webp", 28],
  ["cursor-combat-move-fly.webp", 29],
  ["cursor-combat-move-walk.webp", 30],
  ["cursor-combat-repair-hota.webp", 31],
  ["cursor-combat-sacrifice.webp", 32],
  ["cursor-combat-shot-bad.webp", 33],
  ["cursor-combat-shot-good.webp", 34],
  ["cursor-combat-spell.webp", 35],
  ["cursor-wait.webp", 37],
];

const ALIASES = new Map([
  ["adventure-horse.webp", "cursor-adventure-move-land.webp"],
  ["adventure-building.webp", "cursor-adventure-arrive-land.webp"],
  ["adventure-resource.webp", "cursor-adventure-arrive-land.webp"],
  ["adventure-castle.webp", "cursor-adventure-town.webp"],
  ["combat-melee.webp", "cursor-combat-attack.webp"],
  ["combat-move-flying.webp", "cursor-combat-move-fly.webp"],
  ["combat-move-ground.webp", "cursor-combat-move-walk.webp"],
  ["combat-ranged.webp", "cursor-combat-shot-good.webp"],
]);

function cellBounds(index, width, height) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const left = Math.round((col * width) / COLS);
  const right = Math.round(((col + 1) * width) / COLS);
  const top = Math.round((row * height) / ROWS);
  const bottom = Math.round(((row + 1) * height) / ROWS);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function removeChromaKey(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const greenDominance = g - Math.max(r, b);
    if (g > 70 && r < 110 && b < 110 && greenDominance > 20) {
      const hard = g > 110 && greenDominance > 32;
      data[i + 3] = hard ? 0 : Math.max(0, 255 - greenDominance * 8);
      if (data[i + 3] < 190) {
        data[i] = Math.min(r, 245);
        data[i + 1] = Math.min(Math.max(r, b), 245);
        data[i + 2] = Math.min(b, 245);
      }
    }
  }
}

function removeEdgeFragments(data, width, height) {
  const visited = new Uint8Array(width * height);
  const stack = [];
  const keep = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start] || data[start * 4 + 3] < 24) continue;

      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const pixels = [];

      visited[start] = 1;
      stack.push(start);

      while (stack.length > 0) {
        const item = stack.pop();
        pixels.push(item);
        area += 1;

        const px = item % width;
        const py = Math.floor(item / width);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);

        const neighbors = [item - 1, item + 1, item - width, item + width];
        for (const next of neighbors) {
          if (next < 0 || next >= width * height || visited[next]) continue;
          const nx = next % width;
          if ((next === item - 1 && nx !== px - 1) || (next === item + 1 && nx !== px + 1)) continue;
          if (data[next * 4 + 3] < 24) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }

      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      const touchesSide = minX <= 2 || maxX >= width - 3;
      const isFragment = area < 420 || (touchesSide && componentWidth < 26) || componentHeight < 18;
      if (!isFragment) keep.push(...pixels);
    }
  }

  const keepMask = new Uint8Array(width * height);
  for (const index of keep) keepMask[index] = 1;
  for (let i = 0; i < width * height; i++) {
    if (!keepMask[i]) data[i * 4 + 3] = 0;
  }
}

async function renderCursor(source, metadata, filename, index) {
  const bounds = cellBounds(index, metadata.width, metadata.height);
  const { data, info } = await source
    .clone()
    .extract(bounds)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  removeChromaKey(data);
  removeEdgeFragments(data, info.width, info.height);

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: "contain",
      kernel: "lanczos3",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ lossless: true, quality: 100 })
    .toFile(path.join(OUT_DIR, filename));
}

async function generate() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const source = sharp(SOURCE);
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Unable to read ${SOURCE}`);

  for (const [filename, index] of CURSORS) {
    await renderCursor(source, metadata, filename, index);
  }

  for (const [alias, target] of ALIASES) {
    await fs.copyFile(path.join(OUT_DIR, target), path.join(OUT_DIR, alias));
  }

  await fs.rm(path.join(OUT_DIR, "cursor-normal.webp"), { force: true });

  console.log(`Generated ${CURSORS.length} imagegen cursors and ${ALIASES.size} compatibility aliases.`);
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
