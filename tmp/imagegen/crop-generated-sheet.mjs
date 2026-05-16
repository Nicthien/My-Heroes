import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [input, spec] = process.argv.slice(2);
if (!input || !spec) {
  throw new Error("Usage: node tmp/imagegen/crop-generated-sheet.mjs <sheet.png> unit,unit,unit[,unit]");
}

const units = spec.split(",").map((unit) => unit.trim()).filter(Boolean);
if (![1, 2, 3, 4].includes(units.length)) {
  throw new Error("Pass 1 to 4 units.");
}

const metadata = await sharp(input).metadata();
const cellW = Math.floor(metadata.width / 2);
const cellH = Math.floor(metadata.height / 2);
const positions = [
  [0, 0],
  [cellW, 0],
  [0, cellH],
  [cellW, cellH],
];

await fs.mkdir("tmp/imagegen/generated-factions/raw", { recursive: true });

for (const [index, unit] of units.entries()) {
  const [left, top] = positions[index];
  const output = path.join("tmp", "imagegen", "generated-factions", "raw", `${unit}.png`);
  await sharp(input)
    .extract({ left, top, width: cellW, height: cellH })
    .png()
    .toFile(output);
  console.log(`${unit} -> ${output}`);
}
