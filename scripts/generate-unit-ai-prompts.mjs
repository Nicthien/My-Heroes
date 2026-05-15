import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "src", "lib", "game", "creature-catalog.json");
const OUT_DIR = path.join(ROOT, "assets", "source", "sprites", "units");
const OUT_FILE = path.join(OUT_DIR, "unit-ai-prompts.jsonl");

const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
await mkdir(OUT_DIR, { recursive: true });

const prompts = catalog.creatures.map((creature) => ({
  unitType: creature.type,
  output: `assets/source/sprites/units/${creature.type}/ai-sheet.png`,
  prompt: buildPrompt(creature),
}));

await writeFile(OUT_FILE, `${prompts.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} (${prompts.length} prompts)`);

function buildPrompt(creature) {
  const role = creature.ranged ? "ranged unit" : "melee unit";
  const abilities = creature.abilities.length > 0 ? creature.abilities.join(", ") : "none";
  return [
    "Create a production-ready fantasy strategy game unit spritesheet.",
    "Style reference: match the existing My Heroes mounted hero sprites: realistic hand-painted fantasy miniature, crisp dark outline, high contrast readable silhouette, detailed armor/materials, transparent or flat chroma-key background, no text.",
    `Subject: ${creature.label} (${creature.type.replace(/_/g, " ")}), ${role}, faction/group ${creature.group}, tier ${creature.tier}, upgrade level ${creature.upgradeLevel}.`,
    `Combat identity: attack ${creature.attack}, defense ${creature.defense}, damage ${creature.minDamage}-${creature.maxDamage}, health ${creature.health}, speed ${creature.speed}, shots ${creature.shots}, abilities: ${abilities}.`,
    "Use the unit name literally: make the creature visually distinct and recognizable from its name, not a generic soldier.",
    "Spritesheet layout must be exact: 1280x480 pixels, 80x80 pixel cells, 16 columns by 6 rows.",
    "Rows are directions in this exact order: E, NE, NW, W, SW, SE.",
    "Columns 0-3 are idle frames, columns 4-9 are walk frames, columns 10-15 are attack frames.",
    "Each frame must show the full unit centered on the same ground anchor, with consistent scale across all directions.",
    "Background must be transparent. If transparency is not possible, use a perfectly flat #00ff00 chroma-key background with no shadows, gradients, or texture.",
    "Avoid UI, labels, watermarks, cropped limbs, duplicate merged frames, blurry tiny details, or perspective changes between frames.",
  ].join("\n");
}
