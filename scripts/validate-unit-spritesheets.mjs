import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "src", "lib", "game", "creature-catalog.json");
const UNIT_DIR = path.join(ROOT, "public", "assets", "sprites", "units");
const EXPECTED_SIZE = 160;
const MIN_VISIBLE_PIXELS = 900;
const MIN_VISIBLE_HEIGHT = 56;
const MAX_VISIBLE_ASPECT = 2.25;
const EDGE_MARGIN = 3;

const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
const onlyUnit = getArgValue("--unit");
const creatures = onlyUnit
  ? catalog.creatures.filter((creature) => creature.type === onlyUnit)
  : catalog.creatures;
const failures = [];
let validated = 0;
let skipped = 0;

if (onlyUnit && creatures.length === 0) {
  throw new Error(`Unknown unit type: ${onlyUnit}`);
}

for (const creature of creatures) {
  const file = path.join(UNIT_DIR, `${creature.type}.webp`);
  try {
    await access(file);
    validated++;
    const metadata = await sharp(file).metadata();
    if (metadata.width !== EXPECTED_SIZE || metadata.height !== EXPECTED_SIZE) {
      failures.push(`${creature.type}: expected ${EXPECTED_SIZE}x${EXPECTED_SIZE}, got ${metadata.width}x${metadata.height}`);
      continue;
    }
    if (!metadata.hasAlpha) failures.push(`${creature.type}: missing alpha channel`);

    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = getVisibleBounds(data, info.width, info.height);
    if (!bounds) {
      failures.push(`${creature.type}: empty portrait`);
      continue;
    }
    if (bounds.visiblePixels < MIN_VISIBLE_PIXELS) {
      failures.push(`${creature.type}: weak portrait (${bounds.visiblePixels} visible pixels)`);
    }
    const visibleWidth = bounds.right - bounds.left + 1;
    const visibleHeight = bounds.bottom - bounds.top + 1;
    if (visibleHeight < MIN_VISIBLE_HEIGHT) {
      failures.push(`${creature.type}: portrait is too flat/cropped (${visibleWidth}x${visibleHeight})`);
    }
    if (visibleWidth / visibleHeight > MAX_VISIBLE_ASPECT) {
      failures.push(`${creature.type}: portrait is too wide for a single unit (${visibleWidth}x${visibleHeight})`);
    }
    if (bounds.left <= EDGE_MARGIN || bounds.right >= EXPECTED_SIZE - EDGE_MARGIN - 1 || bounds.top <= EDGE_MARGIN || bounds.bottom >= EXPECTED_SIZE - EDGE_MARGIN - 1) {
      failures.push(`${creature.type}: portrait touches the safety margin (${bounds.left},${bounds.top}-${bounds.right},${bounds.bottom})`);
    }
  } catch (error) {
    if (!onlyUnit && error instanceof Error && "code" in error && error.code === "ENOENT") {
      skipped++;
      continue;
    }
    failures.push(`${creature.type}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`Unit portrait validation failed (${failures.length} issue(s))`);
  for (const failure of failures.slice(0, 60)) console.error(`- ${failure}`);
  if (failures.length > 60) console.error(`...and ${failures.length - 60} more`);
  process.exit(1);
}

console.log(`Validated ${validated} unit portrait(s) (${EXPECTED_SIZE}x${EXPECTED_SIZE}, alpha, safe margins). Skipped ${skipped} unit(s) without WebP.`);

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function getVisibleBounds(data, width, height) {
  const bounds = { left: width, top: height, right: -1, bottom: -1, visiblePixels: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 24) continue;
      bounds.visiblePixels++;
      bounds.left = Math.min(bounds.left, x);
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x);
      bounds.bottom = Math.max(bounds.bottom, y);
    }
  }
  return bounds.right >= 0 ? bounds : null;
}
