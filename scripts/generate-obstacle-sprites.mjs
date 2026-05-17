import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "public", "assets", "sprites", "map");
const size = 256;

const assets = {
  "wall-brick": wallBrickSvg(),
  "wall-vegetal": wallVegetalSvg(),
  "grove-pine": grovePineSvg(),
  "grove-oak": groveOakSvg(),
  "grove-dead": groveDeadSvg(),
  "boulder-cluster": boulderClusterSvg(),
};

for (const [name, svg] of Object.entries(assets)) {
  const output = path.join(outDir, `${name}.webp`);
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "contain" })
    .webp({ lossless: true, effort: 6 })
    .toFile(output);
  console.log(`Generated ${path.relative(projectRoot, output)}`);
}

function svg(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">${defs()}${content}</svg>`;
}

function defs() {
  return `
  <defs>
    <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="5" result="offset"/>
      <feComponentTransfer><feFuncA type="linear" slope=".36"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="stone-top" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#aeb3ae"/>
      <stop offset=".48" stop-color="#777f80"/>
      <stop offset="1" stop-color="#4b5357"/>
    </linearGradient>
    <linearGradient id="stone-face" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#7d8586"/>
      <stop offset="1" stop-color="#343b3f"/>
    </linearGradient>
    <linearGradient id="pine-light" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#78c96f"/>
      <stop offset=".45" stop-color="#2f8341"/>
      <stop offset="1" stop-color="#12391e"/>
    </linearGradient>
    <linearGradient id="oak-light" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#8fd46d"/>
      <stop offset=".52" stop-color="#3f8e3d"/>
      <stop offset="1" stop-color="#1c4a23"/>
    </linearGradient>
    <linearGradient id="dead-wood" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#8a6844"/>
      <stop offset=".55" stop-color="#4c3522"/>
      <stop offset="1" stop-color="#22170f"/>
    </linearGradient>
  </defs>`;
}

function groundShadow(cx = 128, cy = 186, rx = 72, ry = 18, opacity = 0.34) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#030604" opacity="${opacity}"/>`;
}

function pineTree(x, y, s, hue = 0) {
  const trunk = "#6f4729";
  return `
    <g filter="url(#soft-shadow)" transform="translate(${x} ${y}) scale(${s})">
      <rect x="-5" y="30" width="10" height="45" rx="3" fill="${trunk}"/>
      <path d="M0-76-36 18h72z" fill="#133d1e"/>
      <path d="M0-52-43 45h86z" fill="#1f642f"/>
      <path d="M0-25-36 62h72z" fill="${hue ? "#2d7436" : "url(#pine-light)"}"/>
      <path d="M-18-36 0-70l18 34H7L0-55l-9 19z" fill="#a4e085" opacity=".32"/>
      <path d="M-31 41 0 70l31-29-31 8z" fill="#082411" opacity=".5"/>
      <path d="M-26 12c14 8 35 7 50-1" fill="none" stroke="#7bc76d" stroke-width="4" opacity=".28"/>
    </g>`;
}

function oakBlob(x, y, rx, ry, color, opacity = 1) {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${opacity}"/>`;
}

function oakTree(x, y, s) {
  return `
    <g filter="url(#soft-shadow)" transform="translate(${x} ${y}) scale(${s})">
      <rect x="-6" y="18" width="12" height="52" rx="4" fill="#704728"/>
      <path d="M-28 28c-26-11-24-45 4-50-5-28 31-42 48-20 26-3 44 25 27 47 19 18 4 45-23 41-12 18-42 14-48-6-5-1-6-3-8-12z" fill="#1f5b2b"/>
      ${oakBlob(-18, -2, 31, 25, "#3b8b3b")}
      ${oakBlob(14, -11, 35, 28, "url(#oak-light)")}
      ${oakBlob(0, -32, 31, 25, "#5aa94a")}
      ${oakBlob(-8, -24, 16, 10, "#b5e989", .24)}
      ${oakBlob(18, -16, 18, 11, "#c7f09b", .22)}
      <path d="M-37 34c25 18 51 22 78 1" fill="none" stroke="#0d2a13" stroke-width="7" opacity=".45"/>
    </g>`;
}

function deadTree(x, y, s, flip = 1) {
  return `
    <g filter="url(#soft-shadow)" transform="translate(${x} ${y}) scale(${s * flip} ${s})">
      <path d="M0 70C-5 25 1-18 8-58" fill="none" stroke="url(#dead-wood)" stroke-width="13" stroke-linecap="round"/>
      <path d="M4-20-28-47M5 0 35-34M1 22-24 5M4-39 27-62" fill="none" stroke="#6b4b30" stroke-width="8" stroke-linecap="round"/>
      <path d="M0 67c-15 7-28 7-41 0M3 66c17 6 31 5 45-3" fill="none" stroke="#2a1c12" stroke-width="6" stroke-linecap="round"/>
      <path d="M-2-28C8-6 9 28 5 54" fill="none" stroke="#b08a58" stroke-width="3" opacity=".42"/>
    </g>`;
}

function grovePineSvg() {
  return svg(`
    ${groundShadow(128, 188, 72, 19)}
    ${pineTree(82, 110, .86)}
    ${pineTree(126, 91, 1.08)}
    ${pineTree(174, 116, .9, 1)}
    ${pineTree(115, 136, .72, 1)}
    <path d="M65 178c45 24 85 25 128 0" fill="none" stroke="#071507" stroke-width="9" opacity=".35"/>
    <circle cx="80" cy="151" r="5" fill="#9bdc7b" opacity=".55"/>
    <circle cx="176" cy="154" r="4" fill="#a9e686" opacity=".42"/>
  `);
}

function groveOakSvg() {
  return svg(`
    ${groundShadow(128, 188, 76, 20)}
    ${oakTree(83, 122, .82)}
    ${oakTree(130, 100, 1.02)}
    ${oakTree(177, 125, .84)}
    ${oakTree(122, 141, .68)}
    <path d="M61 178c43 26 91 27 134 1" fill="none" stroke="#09200d" stroke-width="10" opacity=".38"/>
    <path d="M72 136c34-29 83-32 119-2" fill="none" stroke="#d2f1a3" stroke-width="4" opacity=".2"/>
  `);
}

function groveDeadSvg() {
  return svg(`
    ${groundShadow(128, 188, 70, 18, .36)}
    ${deadTree(83, 117, .86)}
    ${deadTree(126, 100, 1.04, -1)}
    ${deadTree(175, 124, .84)}
    ${deadTree(111, 143, .66, -1)}
    <path d="M58 181c44 22 91 24 139 1" fill="none" stroke="#120c08" stroke-width="10" opacity=".42"/>
    <path d="M78 157 181 133M98 126l73 38" stroke="#9b7047" stroke-width="4" stroke-linecap="round" opacity=".45"/>
    <circle cx="181" cy="161" r="4" fill="#c39154" opacity=".5"/>
  `);
}

function boulderClusterSvg() {
  return svg(`
    <ellipse cx="128" cy="184" rx="70" ry="20" fill="#050707" opacity=".36"/>
    <g filter="url(#soft-shadow)">
      <path d="M66 174 82 134l25-17 25 14 13 34-21 25H89z" fill="#596467"/>
      <path d="M82 134 107 110l25 21-28 13z" fill="#a7ada9"/>
      <path d="M66 174 91 151l13-7-15 46z" fill="#798385"/>
      <path d="M104 144 132 131l13 34-21 25z" fill="#465055"/>
      <path d="M88 151 124 190H89z" fill="#687276"/>
      <path d="M88 134c12-8 24-10 36-5" fill="none" stroke="#eef0df" stroke-width="4" stroke-linecap="round" opacity=".28"/>

      <path d="M107 179 124 127l34-18 34 18 10 45-31 28h-41z" fill="#4f5a5e"/>
      <path d="M124 127 158 97l34 30-34 15z" fill="#9aa19e"/>
      <path d="M107 179 134 149l24-7-28 58z" fill="#717b7f"/>
      <path d="M158 142 192 127l10 45-31 28z" fill="#3d474c"/>
      <path d="M134 149 171 200h-41z" fill="#5f6a6f"/>
      <path d="M138 125c14-7 29-6 43 3" fill="none" stroke="#f3f4e8" stroke-width="4" stroke-linecap="round" opacity=".26"/>

      <path d="M45 178 59 148l23-11 24 15 5 30-24 18H63z" fill="#6a7477"/>
      <path d="M59 148 83 130l23 22-24 10z" fill="#b0b6b1"/>
      <path d="M45 178 66 160l16 2-19 38z" fill="#858e90"/>
      <path d="M82 162 106 152l5 30-24 18z" fill="#4c565c"/>

      <path d="M154 180 172 151l25-7 20 21-8 29-27 14z" fill="#727b7c"/>
      <path d="M172 151 198 136l19 29-28 7z" fill="#b8bdb7"/>
      <path d="M154 180 189 172l-7 36z" fill="#899192"/>
      <path d="M189 172 217 165l-8 29-27 14z" fill="#505a5c"/>

      <path d="M56 187c39 22 97 25 145 2" fill="none" stroke="#151b1d" stroke-width="8" stroke-linecap="round" opacity=".4"/>
      <circle cx="69" cy="174" r="4" fill="#c4c8c0" opacity=".28"/>
      <circle cx="128" cy="185" r="5" fill="#9ca4a4" opacity=".3"/>
      <circle cx="201" cy="179" r="4" fill="#d4d8ce" opacity=".24"/>
    </g>
  `);
}

function wallBrickSvg() {
  return svg(`
    ${groundShadow(128, 190, 78, 17, .32)}
    <g filter="url(#soft-shadow)">
      <path d="M46 132 128 88l82 44-82 45z" fill="#8d8069"/>
      <path d="M46 132v25l82 45v-25z" fill="#4c4338"/>
      <path d="M210 132v25l-82 45v-25z" fill="#332d28"/>
      <path d="M64 124 128 90l64 34-64 35z" fill="#a99a7e"/>
      <path d="M56 143h144M72 156h112M91 171h74M80 139l-1 26M113 121v62M151 121v62M180 139v26" stroke="#28221c" stroke-width="5" opacity=".66"/>
      <path d="M62 126 128 92l65 34" fill="none" stroke="#d8c69a" stroke-width="4" opacity=".38"/>
      <path d="M48 132 128 177l82-45" fill="none" stroke="#1f1913" stroke-width="6"/>
    </g>
  `);
}

function wallVegetalSvg() {
  return svg(`
    ${groundShadow(128, 190, 84, 20, .34)}
    <g filter="url(#soft-shadow)">
      <path d="M50 142c42-45 113-45 156-2-30 28-125 30-156 2z" fill="#184d24"/>
      <path d="M56 126c42-38 102-38 145 0-27 24-116 27-145 0z" fill="url(#oak-light)"/>
      ${oakBlob(86, 121, 31, 22, "#2e7a32")}
      ${oakBlob(121, 102, 39, 27, "#4d9d42")}
      ${oakBlob(164, 122, 35, 23, "#26702e")}
      ${oakBlob(139, 132, 46, 20, "#3d8d38")}
      <path d="M64 150c39 22 86 25 130 0" fill="none" stroke="#0a240d" stroke-width="9" opacity=".44"/>
      <path d="M73 113c38-22 75-23 113-1" fill="none" stroke="#d0f2a0" stroke-width="4" opacity=".28"/>
      <circle cx="91" cy="103" r="5" fill="#b9ec8d" opacity=".55"/>
      <circle cx="154" cy="96" r="4" fill="#d3f5a6" opacity=".45"/>
    </g>
  `);
}
