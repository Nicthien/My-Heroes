import fs from "node:fs/promises";
import sharp from "sharp";

await fs.mkdir("tmp/unit-sprite-previews/generated-factions/juggernaut", { recursive: true });

const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <g fill="#e0b34f" stroke="#151515" stroke-width="6" stroke-linejoin="round">
    <path d="M130 170 L95 120 L156 144 Z"/>
    <path d="M218 98 L246 48 L270 112 Z"/>
    <path d="M358 158 L420 120 L392 190 Z"/>
    <path d="M380 330 L450 354 L392 392 Z"/>
  </g>
  <g fill="#b85a2b" opacity=".18">
    <ellipse cx="260" cy="260" rx="180" ry="190"/>
  </g>
  <g fill="none" stroke="#f3cf7a" stroke-width="8" stroke-linecap="round" opacity=".75">
    <path d="M146 250 C222 210 330 214 398 260"/>
    <path d="M188 328 C250 360 328 356 382 320"/>
  </g>
</svg>`);

const buffer = await sharp("public/assets/sprites/units/dreadnought.webp")
  .modulate({ saturation: 1.18, brightness: 0.96 })
  .composite([{ input: overlay, blend: "over" }])
  .webp({ lossless: true, quality: 100, effort: 6 })
  .toBuffer();

await fs.writeFile("public/assets/sprites/units/juggernaut.webp", buffer);
await sharp(buffer)
  .flatten({ background: "#000000" })
  .png()
  .toFile("tmp/unit-sprite-previews/generated-factions/juggernaut/black.png");
await sharp(buffer)
  .flatten({ background: "#303030" })
  .png()
  .toFile("tmp/unit-sprite-previews/generated-factions/juggernaut/grid.png");

const metadata = await sharp(buffer).metadata();
console.log(JSON.stringify({ width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha }, null, 2));
