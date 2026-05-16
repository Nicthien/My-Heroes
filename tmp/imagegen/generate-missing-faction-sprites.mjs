import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import sharp from "sharp";
import catalog from "../../src/lib/game/creature-catalog.json" with { type: "json" };

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "assets", "sprites", "units");
const PREVIEW_DIR = path.join(ROOT, "tmp", "unit-sprite-previews", "missing-factions");
const requestedGroups = process.env.GROUPS
  ? process.env.GROUPS.split(",").map((group) => group.trim()).filter(Boolean)
  : ["cove", "factory", "bulwark", "neutral"];
const GROUPS = new Set(requestedGroups);
const FORCE = process.env.FORCE === "1";
const CANVAS = 512;

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.mkdir(PREVIEW_DIR, { recursive: true });

const missing = catalog.creatures.filter((unit) => (
  GROUPS.has(unit.group) &&
  (FORCE || !fsSync.existsSync(path.join(OUT_DIR, `${unit.type}.webp`)))
));

const results = [];
for (const unit of missing) {
  const svg = spriteSvg(unit);
  const output = path.join(OUT_DIR, `${unit.type}.webp`);
  await sharp(Buffer.from(svg))
    .resize(CANVAS, CANVAS)
    .webp({ lossless: true, quality: 100, effort: 6 })
    .toFile(output);

  const previewDir = path.join(PREVIEW_DIR, unit.type);
  await fs.mkdir(previewDir, { recursive: true });
  await sharp(output).flatten({ background: "#000000" }).png().toFile(path.join(previewDir, "black.png"));
  await sharp(await checkerboard()).composite([{ input: output }]).png().toFile(path.join(previewDir, "grid.png"));

  const bounds = await alphaBounds(output);
  const coverage = await alphaCoverage(output);
  const metadata = await sharp(output).metadata();
  results.push({
    unit: unit.type,
    group: unit.group,
    output: path.relative(ROOT, output),
    bounds: `${bounds.width}x${bounds.height}`,
    coverage: `${coverage}%`,
    alpha: metadata.hasAlpha,
  });
}

console.table(results);

function spriteSvg(unit) {
  const kind = classify(unit);
  const palette = paletteFor(unit);
  const weapon = weaponFor(unit);
  const extra = extraFor(unit);
  const title = escapeXml(unit.label);

  if (kind === "dragon") return dragonSvg(title, palette, extra);
  if (kind === "quadruped") return quadrupedSvg(title, palette, extra);
  if (kind === "serpent") return serpentSvg(title, palette, extra);
  if (kind === "machine") return machineSvg(title, palette, extra);
  if (kind === "giant") return giantSvg(title, palette, weapon, extra);
  return humanoidSvg(title, palette, weapon, extra);
}

function classify(unit) {
  const t = unit.type;
  if (["angel", "archangel", "devil", "arch_devil", "efreet", "efreet_sultan", "harpy", "harpy_hag", "sprite", "pixie", "firebird", "phoenix", "air_elemental", "storm_elemental"].includes(t)) return "dragon";
  if (t.includes("dragon") || t.includes("couatl")) return "dragon";
  if (["boar", "mammoth", "war_mammoth", "mountain_ram", "argali", "centaur", "centaur_captain", "unicorn", "war_unicorn", "pegasus", "silver_pegasus", "cavalier", "champion", "hell_hound", "cerberus", "wolf_rider", "wolf_raider", "roc", "thunderbird", "basilisk", "greater_basilisk", "gorgon", "mighty_gorgon", "wyvern", "wyvern_monarch"].includes(t)) return "quadruped";
  if (["fangarm", "hydra", "chaos_hydra", "sea_serpent", "haspid"].includes(t)) return "serpent";
  if (t.includes("golem") || ["gargoyle", "obsidian_gargoyle", "dreadnought", "juggernaut"].includes(t)) return "machine";
  if (t.includes("jotunn") || t.includes("yeti") || t === "troll" || t.includes("behemoth") || t.includes("cyclops") || t.includes("ogre") || t.includes("giant") || t.includes("titan") || t.includes("minotaur")) return "giant";
  if (["skeleton", "skeleton_warrior", "walking_dead", "zombie", "wight", "wraith", "vampire", "vampire_lord", "lich", "power_lich", "ghost_dragon", "bone_dragon"].includes(t)) return t.includes("dragon") ? "dragon" : "humanoid";
  if (t.includes("elemental")) return "giant";
  return "humanoid";
}

function paletteFor(unit) {
  if (unit.group === "factory") {
    return { a: "#c58a3d", b: "#7a4b2a", c: "#166d70", d: "#e7d0a4", metal: "#d6a542", dark: "#1e2024", skin: "#d59b68" };
  }
  if (unit.group === "bulwark") {
    return { a: "#d9edf2", b: "#4b6e88", c: "#6aa0b6", d: "#f3f8fb", metal: "#a7c7d9", dark: "#1c2d3a", skin: "#d6b08a" };
  }
  if (unit.group === "castle") {
    return { a: "#f2f0e6", b: "#34598a", c: "#c63f32", d: "#fff7d2", metal: "#d8dce6", dark: "#1d2a3a", skin: "#d8a47a" };
  }
  if (unit.group === "rampart") {
    return { a: "#5f9b52", b: "#315c35", c: "#d7b86d", d: "#eff8d8", metal: "#b4c58a", dark: "#172818", skin: "#d3a06f" };
  }
  if (unit.group === "tower") {
    return { a: "#71a9c8", b: "#2e5878", c: "#d6b66d", d: "#f2fbff", metal: "#cdd7df", dark: "#182d40", skin: "#c69a72" };
  }
  if (unit.group === "inferno") {
    return { a: "#b63b2e", b: "#4a1d1b", c: "#f0a040", d: "#ffd18a", metal: "#7d6b5b", dark: "#1d1110", skin: "#b95e43" };
  }
  if (unit.group === "necropolis") {
    return { a: "#b7c2bd", b: "#46524d", c: "#73a28c", d: "#eef4e8", metal: "#9aa8a0", dark: "#151b18", skin: "#cfc7b7" };
  }
  if (unit.group === "dungeon") {
    return { a: "#6f5aa8", b: "#2d2345", c: "#56a0a8", d: "#dfd5ff", metal: "#a39ac2", dark: "#171225", skin: "#b58a78" };
  }
  if (unit.group === "stronghold") {
    return { a: "#b9793e", b: "#5a3522", c: "#d0a44f", d: "#f1d39a", metal: "#9e8b6c", dark: "#26160e", skin: "#b86d47" };
  }
  if (unit.group === "fortress") {
    return { a: "#5f8c50", b: "#293f2d", c: "#c7a75a", d: "#dce8bd", metal: "#8fa47e", dark: "#142015", skin: "#80a45f" };
  }
  if (unit.group === "conflux") {
    return { a: "#68c9d0", b: "#2f6f92", c: "#e2bc5d", d: "#f4ffff", metal: "#c7dbe0", dark: "#143042", skin: "#94d8c8" };
  }
  if (unit.group === "neutral") {
    return neutralPalette(unit.type);
  }
  return { a: "#2f9aa0", b: "#155866", c: "#cda765", d: "#f5ead0", metal: "#d7b56d", dark: "#10282d", skin: "#d69a76" };
}

function neutralPalette(type) {
  if (type.includes("golem") || type.includes("crystal")) return { a: "#cfd8dc", b: "#607d8b", c: "#90a4ae", d: "#ffffff", metal: "#e0e0e0", dark: "#263238", skin: "#b0bec5" };
  if (type.includes("dragon")) return { a: "#5aa6c8", b: "#31516b", c: "#d6b56d", d: "#e9f8ff", metal: "#c7a45a", dark: "#152535", skin: "#5aa6c8" };
  if (type === "mummy") return { a: "#d8c7a3", b: "#8f7d60", c: "#c6b68f", d: "#f6ecd4", metal: "#b08d57", dark: "#2d241d", skin: "#cdbb94" };
  if (type === "troll") return { a: "#6f9b67", b: "#3d5c3c", c: "#b6c28f", d: "#e4e8c6", metal: "#9a8d65", dark: "#1d2a1c", skin: "#78a66d" };
  return { a: "#8aa35c", b: "#4d5f35", c: "#c89f58", d: "#f2dfb7", metal: "#b99a57", dark: "#25251c", skin: "#d4a06f" };
}

function weaponFor(unit) {
  if (unit.type.includes("angel") || unit.type.includes("devil")) return "spear";
  if (unit.type.includes("swordsman") || unit.type.includes("crusader") || unit.type.includes("dwarf") || unit.type.includes("minotaur")) return "spear";
  if (unit.ranged) return unit.type.includes("shaman") || unit.type === "enchanter" || unit.type === "leprechaun" ? "staff" : "bow";
  if (unit.type.includes("mage") || unit.type.includes("genie") || unit.type.includes("lich") || unit.type.includes("monk") || unit.type.includes("zealot")) return "staff";
  if (unit.type.includes("kobold") || unit.type === "rogue") return "dagger";
  if (unit.type.includes("elf")) return "bow";
  if (unit.type.includes("shaman")) return "staff";
  return "spear";
}

function extraFor(unit) {
  if (unit.type.includes("foreman")) return "foreman";
  if (unit.type.includes("runemaster") || unit.type.includes("shaman") || unit.type === "enchanter" || unit.type === "leprechaun") return "caster";
  if (unit.type.includes("war_") || unit.type.includes("warlord") || unit.type.includes("steel") || unit.type.includes("gold") || unit.type.includes("diamond")) return "elite";
  if (unit.type.includes("crimson") || unit.type.includes("rust") || unit.type.includes("azure")) return "elite";
  return "base";
}

function humanoidSvg(title, p, weapon, extra) {
  const caster = extra === "caster";
  const elite = extra === "elite";
  return baseSvg(title, `
    <g transform="translate(260 262) rotate(-8)">
      ${shadowlessCape(p)}
      <path d="M-38 -108 C-62 -86 -70 -20 -58 78 L-20 122 L22 120 C42 54 48 -36 30 -108 Z" fill="${p.a}" stroke="${p.dark}" stroke-width="7" stroke-linejoin="round"/>
      <path d="M-28 -88 C-16 -70 14 -68 28 -92 L18 66 C0 80 -20 76 -36 62 Z" fill="${p.c}" opacity=".9"/>
      <circle cx="-6" cy="-137" r="42" fill="${p.skin}" stroke="${p.dark}" stroke-width="7"/>
      <path d="M-44 -152 C-14 -188 30 -174 45 -145 C18 -154 -8 -150 -44 -152 Z" fill="${p.b}" stroke="${p.dark}" stroke-width="6"/>
      <path d="M-30 -132 C-16 -124 4 -124 22 -135" fill="none" stroke="${p.dark}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="9" cy="-140" r="4" fill="${p.dark}"/>
      <path d="M28 -126 L55 -116 L34 -105" fill="${p.skin}" stroke="${p.dark}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M-46 -72 L-98 -20 L-84 4 L-36 -42 Z" fill="${p.skin}" stroke="${p.dark}" stroke-width="7" stroke-linejoin="round"/>
      <path d="M38 -76 L88 -30 L74 -6 L28 -42 Z" fill="${p.skin}" stroke="${p.dark}" stroke-width="7" stroke-linejoin="round"/>
      <path d="M-22 112 L-48 188 L-20 196 L6 126 Z" fill="${p.b}" stroke="${p.dark}" stroke-width="7"/>
      <path d="M26 112 L48 188 L78 182 L42 118 Z" fill="${p.b}" stroke="${p.dark}" stroke-width="7"/>
      <path d="M-58 190 L-8 190" stroke="${p.dark}" stroke-width="12" stroke-linecap="round"/>
      <path d="M42 190 L92 190" stroke="${p.dark}" stroke-width="12" stroke-linecap="round"/>
      ${weaponShape(weapon, p)}
      ${caster ? `<circle cx="88" cy="-64" r="18" fill="${p.d}" stroke="${p.dark}" stroke-width="5"/><path d="M76 -64 L100 -64 M88 -76 L88 -52" stroke="${p.c}" stroke-width="5"/>` : ""}
      ${elite ? `<path d="M-46 -110 L-70 -150 L-34 -130" fill="${p.metal}" stroke="${p.dark}" stroke-width="5"/><path d="M34 -110 L68 -150 L54 -116" fill="${p.metal}" stroke="${p.dark}" stroke-width="5"/>` : ""}
    </g>
  `);
}

function weaponShape(weapon, p) {
  if (weapon === "bow") {
    return `<path d="M78 -88 C128 -40 128 70 72 124" fill="none" stroke="${p.dark}" stroke-width="8"/><path d="M82 -86 C116 -28 116 52 78 122" fill="none" stroke="${p.c}" stroke-width="5"/><path d="M-118 38 L132 -70" stroke="${p.dark}" stroke-width="7" stroke-linecap="round"/><path d="M-118 38 L132 -70" stroke="${p.metal}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (weapon === "staff") {
    return `<path d="M-112 94 L122 -120" stroke="${p.dark}" stroke-width="10" stroke-linecap="round"/><path d="M-112 94 L122 -120" stroke="${p.metal}" stroke-width="5" stroke-linecap="round"/><circle cx="124" cy="-122" r="18" fill="${p.d}" stroke="${p.dark}" stroke-width="6"/>`;
  }
  if (weapon === "dagger") {
    return `<path d="M64 -38 L126 -72" stroke="${p.dark}" stroke-width="10" stroke-linecap="round"/><path d="M88 -52 L138 -92 L128 -58 Z" fill="${p.d}" stroke="${p.dark}" stroke-width="6"/>`;
  }
  return `<path d="M-128 104 L142 -130" stroke="${p.dark}" stroke-width="10" stroke-linecap="round"/><path d="M-128 104 L142 -130" stroke="${p.metal}" stroke-width="5" stroke-linecap="round"/><path d="M134 -142 L182 -178 L160 -120 Z" fill="${p.d}" stroke="${p.dark}" stroke-width="7" stroke-linejoin="round"/>`;
}

function machineSvg(title, p, extra) {
  return baseSvg(title, `
    <g transform="translate(258 266) rotate(-5)">
      <path d="M-72 -118 L36 -132 L92 -60 L70 78 L-12 126 L-86 68 L-104 -48 Z" fill="${p.a}" stroke="${p.dark}" stroke-width="8" stroke-linejoin="round"/>
      <circle cx="-6" cy="-154" r="38" fill="${p.metal}" stroke="${p.dark}" stroke-width="8"/>
      <circle cx="8" cy="-154" r="13" fill="${p.c}" stroke="${p.dark}" stroke-width="5"/>
      <path d="M-86 -38 L-150 22 L-128 66 L-72 18 Z" fill="${p.metal}" stroke="${p.dark}" stroke-width="8"/>
      <path d="M78 -38 L150 10 L136 68 L70 24 Z" fill="${p.metal}" stroke="${p.dark}" stroke-width="8"/>
      <path d="M-42 112 L-62 188 L-20 194 L8 118 Z" fill="${p.b}" stroke="${p.dark}" stroke-width="8"/>
      <path d="M38 108 L60 186 L102 176 L70 104 Z" fill="${p.b}" stroke="${p.dark}" stroke-width="8"/>
      <path d="M-72 194 L0 194 M52 188 L124 188" stroke="${p.dark}" stroke-width="14" stroke-linecap="round"/>
      <circle cx="-38" cy="-62" r="18" fill="${p.c}" stroke="${p.dark}" stroke-width="5"/>
      <circle cx="38" cy="-58" r="18" fill="${p.c}" stroke="${p.dark}" stroke-width="5"/>
      <path d="M106 -24 L170 -78 L188 -46 L128 14 Z" fill="${p.metal}" stroke="${p.dark}" stroke-width="7"/>
      ${extra === "elite" ? `<path d="M-90 -120 L-122 -174 L-62 -142 Z" fill="${p.d}" stroke="${p.dark}" stroke-width="6"/><path d="M70 -120 L118 -170 L104 -102 Z" fill="${p.d}" stroke="${p.dark}" stroke-width="6"/>` : ""}
    </g>
  `);
}

function giantSvg(title, p, weapon, extra) {
  return baseSvg(title, `
    <g transform="translate(260 258)">
      <path d="M-72 -92 C-98 -36 -90 74 -34 130 L42 130 C92 62 92 -52 56 -104 Z" fill="${p.a}" stroke="${p.dark}" stroke-width="9"/>
      <circle cx="-2" cy="-154" r="54" fill="${p.skin}" stroke="${p.dark}" stroke-width="9"/>
      <path d="M-54 -164 C-24 -214 42 -198 62 -154 C16 -170 -16 -168 -54 -164 Z" fill="${p.d}" stroke="${p.dark}" stroke-width="7"/>
      <circle cx="18" cy="-164" r="5" fill="${p.dark}"/>
      <path d="M-24 -140 C2 -126 26 -134 40 -150" fill="none" stroke="${p.dark}" stroke-width="6" stroke-linecap="round"/>
      <path d="M-70 -58 L-142 6 L-116 42 L-52 -16 Z" fill="${p.skin}" stroke="${p.dark}" stroke-width="9"/>
      <path d="M64 -66 L138 -2 L108 36 L48 -20 Z" fill="${p.skin}" stroke="${p.dark}" stroke-width="9"/>
      <path d="M-42 120 L-76 190 L-34 204 L4 132 Z" fill="${p.b}" stroke="${p.dark}" stroke-width="9"/>
      <path d="M42 120 L82 188 L124 170 L70 126 Z" fill="${p.b}" stroke="${p.dark}" stroke-width="9"/>
      ${weaponShape(weapon, p)}
      ${extra === "caster" ? `<path d="M-38 -210 L0 -242 L40 -208" fill="${p.c}" stroke="${p.dark}" stroke-width="7"/>` : ""}
    </g>
  `);
}

function quadrupedSvg(title, p, extra) {
  return baseSvg(title, `
    <g transform="translate(258 278) rotate(-4)">
      <path d="M-154 6 C-126 -92 -4 -120 104 -74 C160 -48 182 20 136 72 C74 130 -62 124 -138 66 Z" fill="${p.a}" stroke="${p.dark}" stroke-width="9"/>
      <path d="M82 -80 C132 -112 188 -82 188 -28 C174 -48 146 -50 120 -32 Z" fill="${p.skin}" stroke="${p.dark}" stroke-width="8"/>
      <path d="M-104 70 L-126 168 M-34 82 L-44 178 M52 82 L50 178 M116 62 L142 158" stroke="${p.dark}" stroke-width="18" stroke-linecap="round"/>
      <path d="M-126 168 L-92 168 M-44 178 L-8 178 M50 178 L86 178 M142 158 L176 158" stroke="${p.dark}" stroke-width="12" stroke-linecap="round"/>
      <path d="M-164 8 L-220 -18" stroke="${p.dark}" stroke-width="12" stroke-linecap="round"/>
      <path d="M-96 -80 C-50 -118 42 -116 100 -74" fill="none" stroke="${p.metal}" stroke-width="18" stroke-linecap="round"/>
      ${extra === "elite" ? `<path d="M-118 -86 L-102 -134 L-78 -88 M-44 -108 L-28 -158 L-4 -110 M38 -104 L58 -150 L78 -94" fill="${p.d}" stroke="${p.dark}" stroke-width="6"/>` : ""}
    </g>
  `);
}

function serpentSvg(title, p) {
  return baseSvg(title, `
    <g transform="translate(258 270)">
      <path d="M-134 72 C-58 150 108 120 104 22 C100 -72 -40 -30 -10 42 C18 104 142 96 166 12" fill="none" stroke="${p.dark}" stroke-width="72" stroke-linecap="round"/>
      <path d="M-134 72 C-58 150 108 120 104 22 C100 -72 -40 -30 -10 42 C18 104 142 96 166 12" fill="none" stroke="${p.a}" stroke-width="56" stroke-linecap="round"/>
      <path d="M126 -58 L194 -82 L178 -12 Z" fill="${p.a}" stroke="${p.dark}" stroke-width="8"/>
      <circle cx="160" cy="-48" r="5" fill="${p.dark}"/>
      <path d="M166 -26 L204 -16" stroke="${p.dark}" stroke-width="7" stroke-linecap="round"/>
      <path d="M-74 106 C-12 132 76 118 108 64" fill="none" stroke="${p.c}" stroke-width="12" stroke-linecap="round"/>
    </g>
  `);
}

function dragonSvg(title, p, extra) {
  return baseSvg(title, `
    <g transform="translate(258 270) rotate(-4)">
      <path d="M-76 -38 C-44 -106 58 -120 116 -58 C154 -16 140 52 82 88 C20 128 -82 100 -110 34 Z" fill="${p.a}" stroke="${p.dark}" stroke-width="8"/>
      <path d="M-48 -72 L-156 -158 L-126 -42 Z" fill="${p.c}" stroke="${p.dark}" stroke-width="8"/>
      <path d="M48 -78 L120 -184 L132 -48 Z" fill="${p.c}" stroke="${p.dark}" stroke-width="8"/>
      <path d="M96 -78 L170 -98 L158 -34 Z" fill="${p.a}" stroke="${p.dark}" stroke-width="8"/>
      <circle cx="132" cy="-68" r="5" fill="${p.dark}"/>
      <path d="M142 -48 L182 -40" stroke="${p.dark}" stroke-width="7" stroke-linecap="round"/>
      <path d="M-102 34 L-168 92" stroke="${p.dark}" stroke-width="16" stroke-linecap="round"/>
      <path d="M-52 82 L-80 168 M42 88 L70 164" stroke="${p.dark}" stroke-width="15" stroke-linecap="round"/>
      <path d="M-84 166 L-36 166 M70 164 L116 164" stroke="${p.dark}" stroke-width="10" stroke-linecap="round"/>
      <path d="M-88 -82 L-70 -130 L-50 -84 M-20 -102 L0 -150 L22 -100 M54 -90 L82 -134 L92 -78" fill="${p.d}" stroke="${p.dark}" stroke-width="5"/>
      ${extra === "elite" ? `<path d="M104 -94 L136 -142 L144 -82" fill="${p.d}" stroke="${p.dark}" stroke-width="6"/>` : ""}
    </g>
  `);
}

function shadowlessCape(p) {
  return `<path d="M-60 -92 C-116 -52 -124 48 -62 122 C-26 86 -20 -20 -34 -100 Z" fill="${p.b}" stroke="${p.dark}" stroke-width="6" opacity=".95"/>`;
}

function baseSvg(title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-label="${title}">
    <title>${title}</title>
    <rect width="${CANVAS}" height="${CANVAS}" fill="none"/>
    ${body}
  </svg>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function alphaBounds(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function alphaCoverage(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 10) visible += 1;
  return Number(((visible / (info.width * info.height)) * 100).toFixed(1));
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
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">${rects}</svg>`)).png().toBuffer();
}
