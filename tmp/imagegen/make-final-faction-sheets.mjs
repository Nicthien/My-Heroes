import fs from "node:fs/promises";
import sharp from "sharp";
import catalog from "../../src/lib/game/creature-catalog.json" with { type: "json" };

const outDir = "tmp/unit-sprite-previews/final-faction-sheets";
await fs.mkdir(outDir, { recursive: true });

const groups = process.env.GROUPS
  ? process.env.GROUPS.split(",").map((group) => group.trim()).filter(Boolean)
  : catalog.groups.map((group) => group.key);

for (const group of groups) {
  const units = catalog.creatures.filter((unit) => unit.group === group);
  const tile = 160;
  const labelH = 28;
  const pad = 12;
  const cols = Math.min(5, units.length);
  const rows = Math.ceil(units.length / cols);
  const composites = [];

  for (const [index, unit] of units.entries()) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = pad + col * (tile + pad);
    const top = pad + row * (tile + labelH + pad);
    const image = await sharp(`public/assets/sprites/units/${unit.type}.webp`)
      .resize(tile, tile, { fit: "contain" })
      .flatten({ background: "#111111" })
      .png()
      .toBuffer();
    composites.push({ input: image, left, top });
    composites.push({
      input: Buffer.from(labelSvg(unit.type, tile, labelH)),
      left,
      top: top + tile,
    });
  }

  const width = pad + cols * (tile + pad);
  const height = pad + rows * (tile + labelH + pad);
  const output = `${outDir}/${group}.png`;
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
  console.log(output);
}

function labelSvg(text, width, height) {
  const safe = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#202020"/>
    <text x="${width / 2}" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#f8fafc">${safe}</text>
  </svg>`;
}
