import fs from "node:fs/promises";
import sharp from "sharp";

const OUT = "public/assets/sprites/units";
const PREVIEW = "tmp/unit-sprite-previews/generated-factions";
await fs.mkdir(OUT, { recursive: true });

const sprites = {
  fangarm: fangarm(),
  diamond_golem: diamondGolem(),
  enchanter: enchanter(),
  faerie_dragon: dragon("Dragon feerique", "#7fd8e8", "#f0d36a", "#eefcff", true),
  rust_dragon: dragon("Dragon rouille", "#b46d3b", "#5b3627", "#f0a45c", false),
  crystal_dragon: dragon("Dragon de cristal", "#d8f7ff", "#82cfe2", "#ffffff", true),
  azure_dragon: dragon("Dragon azur", "#3693d0", "#164d7d", "#bdefff", false),
};

for (const [unit, svg] of Object.entries(sprites)) {
  const webp = await sharp(Buffer.from(svg))
    .resize(512, 512)
    .webp({ lossless: true, quality: 100, effort: 6 })
    .toBuffer();
  await fs.writeFile(`${OUT}/${unit}.webp`, webp);
  await fs.mkdir(`${PREVIEW}/${unit}`, { recursive: true });
  await sharp(webp).flatten({ background: "#000000" }).png().toFile(`${PREVIEW}/${unit}/black.png`);
  await sharp(webp).flatten({ background: "#303030" }).png().toFile(`${PREVIEW}/${unit}/grid.png`);
  console.log(unit);
}

function shell(title, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${title}">
    <title>${title}</title>
    <defs>${defs}</defs>
    ${body}
  </svg>`;
}

function fangarm() {
  return shell("Fangarm", `
    <linearGradient id="fg-body" x1="0" x2="1"><stop stop-color="#2f9b79"/><stop offset="1" stop-color="#b9d764"/></linearGradient>
    <linearGradient id="fg-wing" x1="0" x2="1"><stop stop-color="#7cc7a2"/><stop offset="1" stop-color="#dff1a3"/></linearGradient>
  `, `
    <g transform="translate(256 262) rotate(-8)" stroke="#10231d" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
      <path d="M-92 -48 C-178 -138 -230 -24 -172 62 C-124 22 -88 4 -42 -2 Z" fill="url(#fg-wing)"/>
      <path d="M76 -58 C150 -150 222 -44 174 52 C126 28 90 2 46 -8 Z" fill="url(#fg-wing)"/>
      <path d="M-102 28 C-88 -62 -6 -104 84 -68 C160 -38 172 64 104 124 C34 188 -86 150 -102 28 Z" fill="url(#fg-body)"/>
      <ellipse cx="26" cy="2" rx="62" ry="52" fill="#e8f4c4"/>
      <circle cx="30" cy="2" r="25" fill="#101a18"/>
      <circle cx="40" cy="-8" r="8" fill="#ffffff" stroke="none"/>
      <path d="M-100 78 C-178 118 -194 184 -140 204" fill="none"/>
      <path d="M-56 128 C-110 184 -88 226 -38 202" fill="none"/>
      <path d="M8 148 C-10 218 44 230 68 176" fill="none"/>
      <path d="M70 138 C98 204 154 192 148 132" fill="none"/>
      <path d="M106 92 C176 116 208 64 172 28" fill="none"/>
      <path d="M-58 -66 L-112 -122 M-10 -82 L-22 -150 M42 -76 L86 -134" fill="none"/>
      <path d="M-70 2 C-20 34 48 38 116 0" fill="none" stroke="#dcefa2" stroke-width="6"/>
      <path d="M-40 68 C4 92 64 86 106 54" fill="none" stroke="#dcefa2" stroke-width="5"/>
    </g>
  `);
}

function diamondGolem() {
  return shell("Golem de diamant", `
    <linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset=".45" stop-color="#bcefff"/><stop offset="1" stop-color="#6fb9dc"/></linearGradient>
  `, `
    <g transform="translate(260 260)" stroke="#152c3a" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
      <path d="M-54 -134 L18 -160 L80 -110 L54 -36 L-22 -28 L-86 -76 Z" fill="url(#dg)"/>
      <path d="M-80 -30 L-130 36 L-98 104 L-34 66 Z" fill="url(#dg)"/>
      <path d="M78 -30 L136 18 L114 96 L46 62 Z" fill="url(#dg)"/>
      <path d="M-36 -18 L58 -24 L92 68 L34 130 L-42 112 L-82 42 Z" fill="url(#dg)"/>
      <path d="M-42 110 L-82 190 L-34 202 L16 126 Z" fill="url(#dg)"/>
      <path d="M42 112 L88 184 L132 160 L68 116 Z" fill="url(#dg)"/>
      <path d="M-92 196 L-16 196 M78 174 L150 174" fill="none" stroke-width="13"/>
      <path d="M-54 -134 L-22 -28 L18 -160 M80 -110 L54 -36 L18 -160 M-82 42 L34 130 M92 68 L-42 112" fill="none" stroke="#ffffff" stroke-width="4" opacity=".8"/>
      <circle cx="16" cy="-88" r="10" fill="#2f8cc0"/>
    </g>
  `);
}

function enchanter() {
  return shell("Enchanteur", `
    <linearGradient id="robe" x1="0" x2="1"><stop stop-color="#2f6f79"/><stop offset="1" stop-color="#80b89b"/></linearGradient>
  `, `
    <g transform="translate(258 262) rotate(-7)" stroke="#172421" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
      <path d="M-70 -104 C-122 -38 -106 84 -42 148 L52 140 C102 58 88 -54 48 -114 Z" fill="url(#robe)"/>
      <path d="M-48 -82 C-10 -42 18 -42 50 -90 L36 96 C4 118 -28 100 -50 72 Z" fill="#d7c88e"/>
      <circle cx="-4" cy="-142" r="40" fill="#d7a278"/>
      <path d="M-44 -154 C-16 -200 34 -182 54 -148 C18 -160 -16 -158 -44 -154 Z" fill="#efe6b5"/>
      <circle cx="10" cy="-146" r="4" fill="#172421"/>
      <path d="M-24 -132 C-4 -122 18 -126 34 -140" fill="none"/>
      <path d="M-42 -54 L-106 10 L-84 42 L-32 -20 Z" fill="#d7a278"/>
      <path d="M42 -62 L94 -30 L80 6 L34 -28 Z" fill="#d7a278"/>
      <path d="M-24 126 L-52 192 L-18 200 L18 132 Z" fill="#254c54"/>
      <path d="M34 124 L66 190 L104 176 L58 126 Z" fill="#254c54"/>
      <path d="M-112 96 L132 -132" stroke="#6a4a2f" stroke-width="11"/>
      <circle cx="136" cy="-136" r="22" fill="#e9d778"/>
      <circle cx="136" cy="-136" r="10" fill="#3faec7"/>
      <path d="M-68 -104 L-104 -138 M46 -108 L88 -142" fill="none" stroke="#e9d778" stroke-width="6"/>
      <path d="M-28 -44 L44 -60 M-34 10 L52 -2 M-24 64 L40 54" fill="none" stroke="#b7e0cf" stroke-width="5"/>
      <path d="M-78 -20 L-128 12 L-120 56 L-70 32 Z" fill="#2b5459"/>
      <path d="M76 -22 L118 12 L104 50 L64 24 Z" fill="#2b5459"/>
    </g>
  `);
}

function dragon(title, main, dark, light, fae) {
  return shell(title, `
    <linearGradient id="dr" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".45" stop-color="${main}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="wing" x1="0" x2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${main}"/></linearGradient>
  `, `
    <g transform="translate(256 268) rotate(-5)" stroke="#10202a" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
      <path d="M-118 30 C-174 50 -200 104 -158 138 C-88 108 -46 92 -4 82" fill="none" stroke="${dark}" stroke-width="18"/>
      <path d="M-92 -40 C-42 -124 70 -122 132 -54 C174 -8 162 72 98 110 C28 152 -88 120 -126 44 Z" fill="url(#dr)"/>
      <path d="M-54 -76 L-184 -178 L-136 -30 Z" fill="url(#wing)"/>
      <path d="M-20 -90 L-126 -152 L-82 -24 Z" fill="${light}" opacity=".9"/>
      <path d="M42 -90 L130 -190 L140 -32 Z" fill="url(#wing)"/>
      <path d="M70 -92 L118 -154 L116 -36 Z" fill="${light}" opacity=".9"/>
      <path d="M98 -82 C134 -112 190 -102 196 -62 C202 -28 170 -16 136 -30 Z" fill="url(#dr)"/>
      <path d="M174 -72 L218 -88 L198 -50 Z" fill="${light}"/>
      <circle cx="162" cy="-66" r="6" fill="#081014"/>
      <path d="M168 -44 L216 -34" fill="none"/>
      <path d="M-50 92 L-88 182 L-38 188 L6 106 Z" fill="${dark}"/>
      <path d="M48 102 L82 180 L130 160 L82 102 Z" fill="${dark}"/>
      <path d="M-104 184 L-34 184 M76 170 L140 164" fill="none" stroke="#10202a" stroke-width="10"/>
      <path d="M-90 -86 L-62 -146 L-42 -84 M-24 -112 L6 -174 L28 -106 M52 -100 L90 -154 L102 -82" fill="${light}"/>
      <path d="M-42 34 C8 66 70 58 118 24" fill="none" stroke="${light}" stroke-width="8" opacity=".8"/>
      <path d="M-22 72 C30 96 82 84 126 50" fill="none" stroke="${light}" stroke-width="5" opacity=".7"/>
      ${fae ? `<circle cx="-136" cy="-116" r="9" fill="#ffffff"/><circle cx="118" cy="-132" r="8" fill="#ffffff"/><path d="M-164 -168 C-130 -140 -102 -96 -86 -54" fill="none" stroke="#ffffff" stroke-width="5" opacity=".9"/>` : ""}
    </g>
  `);
}
