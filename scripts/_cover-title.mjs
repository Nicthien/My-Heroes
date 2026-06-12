import sharp from "sharp";

const W = 1344, H = 768;
const src = "assets/generated/cover-v2.png";
const out = process.argv[2] ?? "assets/generated/cover-final.png";

// Title typography overlay — fantasy gold lettering with dark stroke + soft glow,
// plus a subtle bottom gradient so the title reads against the artwork.
const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff4c2"/>
      <stop offset="45%" stop-color="#f5c542"/>
      <stop offset="100%" stop-color="#b8801f"/>
    </linearGradient>
    <linearGradient id="vign" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.62)"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#000000" flood-opacity="0.85"/>
    </filter>
  </defs>

  <rect x="0" y="${H * 0.5}" width="${W}" height="${H * 0.5}" fill="url(#vign)"/>

  <g filter="url(#glow)" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" text-anchor="middle">
    <text x="${W / 2}" y="${H - 96}" font-size="118"
          fill="url(#gold)" stroke="#3a2406" stroke-width="5"
          paint-order="stroke" letter-spacing="6"
          style="font-variant: small-caps;">My Heroes</text>
  </g>
</svg>`;

await sharp(src)
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toFile(out);
console.log("Saved ->", out);
