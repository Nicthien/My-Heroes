import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "assets", "sprites", "map");
const WIDTH = 512;
const HEIGHT = 384;
const SCALE = 2;

const FACTIONS = {
  castle: {
    stone: "#d7e7f2",
    stoneDark: "#879bae",
    roof: "#315aaa",
    roofDark: "#172554",
    trim: "#f4c95d",
    accent: "#8b1e2d",
    glow: "#fff7ad",
    gate: "#2a1710",
  },
  rampart: {
    stone: "#8fbf8a",
    stoneDark: "#477449",
    roof: "#2f6f3b",
    roofDark: "#12391f",
    trim: "#d6e68b",
    accent: "#7a4f25",
    glow: "#bbf7d0",
    gate: "#2b1609",
  },
  tower: {
    stone: "#dceeff",
    stoneDark: "#8fa9c6",
    roof: "#8ed4ff",
    roofDark: "#2563a8",
    trim: "#e5f6ff",
    accent: "#7259c8",
    glow: "#b9f2ff",
    gate: "#1c2440",
  },
  inferno: {
    stone: "#4a1b1a",
    stoneDark: "#1d0b0b",
    roof: "#111013",
    roofDark: "#060506",
    trim: "#ff8a2b",
    accent: "#9c1c16",
    glow: "#ffd166",
    gate: "#110607",
  },
  necropolis: {
    stone: "#59616b",
    stoneDark: "#20252e",
    roof: "#2b2334",
    roofDark: "#0c0b11",
    trim: "#9ce6b0",
    accent: "#5b1b43",
    glow: "#7dffb0",
    gate: "#0b0d12",
  },
  dungeon: {
    stone: "#584072",
    stoneDark: "#1f1730",
    roof: "#2d2148",
    roofDark: "#0d0920",
    trim: "#c084fc",
    accent: "#9d3b55",
    glow: "#e9d5ff",
    gate: "#100817",
  },
  stronghold: {
    stone: "#a86d34",
    stoneDark: "#523119",
    roof: "#7f1d1d",
    roofDark: "#34100e",
    trim: "#e7c36a",
    accent: "#3d2716",
    glow: "#ffd089",
    gate: "#211105",
  },
  fortress: {
    stone: "#6f7f50",
    stoneDark: "#334020",
    roof: "#465f36",
    roofDark: "#1f2f1a",
    trim: "#b8c77a",
    accent: "#5c3a21",
    glow: "#b6ff92",
    gate: "#1b1d0d",
  },
  conflux: {
    stone: "#9ad4e6",
    stoneDark: "#477f92",
    roof: "#f3f0ff",
    roofDark: "#6d5dd3",
    trim: "#ffd166",
    accent: "#ec4899",
    glow: "#d9fff6",
    gate: "#19223a",
  },
};

class Canvas {
  constructor(width, height, scale = 1) {
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.scale = scale;
    this.width = width * scale;
    this.height = height * scale;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }

  px(x, y, color, alpha = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const [r, g, b, a] = parseColor(color, alpha);
    const i = (y * this.width + x) * 4;
    const da = this.data[i + 3] / 255;
    const sa = a / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    this.data[i] = (r * sa + this.data[i] * da * (1 - sa)) / outA;
    this.data[i + 1] = (g * sa + this.data[i + 1] * da * (1 - sa)) / outA;
    this.data[i + 2] = (b * sa + this.data[i + 2] * da * (1 - sa)) / outA;
    this.data[i + 3] = outA * 255;
  }

  ellipse(cx, cy, rx, ry, color, alpha = 1) {
    cx *= this.scale; cy *= this.scale; rx *= this.scale; ry *= this.scale;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const v = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
        if (v <= 1) this.px(x, y, color, alpha);
      }
    }
  }

  rect(x, y, w, h, color, alpha = 1) {
    x *= this.scale; y *= this.scale; w *= this.scale; h *= this.scale;
    for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
      for (let px = Math.floor(x); px < Math.ceil(x + w); px++) this.px(px, py, color, alpha);
    }
  }

  polygon(points, color, alpha = 1) {
    const p = points.map(([x, y]) => [x * this.scale, y * this.scale]);
    const minX = Math.floor(Math.min(...p.map(([x]) => x)));
    const maxX = Math.ceil(Math.max(...p.map(([x]) => x)));
    const minY = Math.floor(Math.min(...p.map(([, y]) => y)));
    const maxY = Math.ceil(Math.max(...p.map(([, y]) => y)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, p)) this.px(x, y, color, alpha);
      }
    }
  }

  line(x1, y1, x2, y2, width, color, alpha = 1) {
    x1 *= this.scale; y1 *= this.scale; x2 *= this.scale; y2 *= this.scale; width *= this.scale;
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      this.ellipse(x1 / this.scale + (x2 - x1) * t / this.scale, y1 / this.scale + (y2 - y1) * t / this.scale, width / this.scale / 2, width / this.scale / 2, color, alpha);
    }
  }

  downsample() {
    const out = new Uint8ClampedArray(this.logicalWidth * this.logicalHeight * 4);
    for (let y = 0; y < this.logicalHeight; y++) {
      for (let x = 0; x < this.logicalWidth; x++) {
        const acc = [0, 0, 0, 0];
        for (let sy = 0; sy < this.scale; sy++) {
          for (let sx = 0; sx < this.scale; sx++) {
            const i = ((y * this.scale + sy) * this.width + (x * this.scale + sx)) * 4;
            acc[0] += this.data[i];
            acc[1] += this.data[i + 1];
            acc[2] += this.data[i + 2];
            acc[3] += this.data[i + 3];
          }
        }
        const samples = this.scale * this.scale;
        const o = (y * this.logicalWidth + x) * 4;
        out[o] = acc[0] / samples;
        out[o + 1] = acc[1] / samples;
        out[o + 2] = acc[2] / samples;
        out[o + 3] = acc[3] / samples;
      }
    }
    return out;
  }
}

function parseColor(hex, alpha = 1) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    Math.round(alpha * 255),
  ];
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawCommonFort(c, p, kind) {
  c.ellipse(256, 332, 178, 34, "#000000", 0.28);
  isoBlock(c, 256, 306, 282, 142, 34, {
    top: shade(p.stone, 10),
    left: p.stoneDark,
    right: shade(p.stoneDark, -28),
    stroke: shade(p.stoneDark, -55),
  });
  c.polygon([[112, 302], [256, 228], [400, 302], [256, 360]], "#000000", 0.1);

  keep(c, 256, 238, 156, 82, 112, p, kind);
  tower(c, 157, 260, 74, 46, 94, p, kind);
  tower(c, 355, 260, 74, 46, 94, p, kind);
  tower(c, 256, 188, 70, 42, 118, p, kind);

  for (const [x, y] of [[214, 236], [298, 236], [170, 272], [342, 272]]) windowSlit(c, x, y, p.glow);
  gate(c, 256, 326, 78, 54, p);
}

function tower(c, x, y, w, d, h, p, kind) {
  isoBlock(c, x, y, w, d, h, {
    top: shade(p.stone, 8),
    left: p.stoneDark,
    right: shade(p.stoneDark, -24),
    stroke: shade(p.stoneDark, -58),
  });
  const topY = y - h;
  if (kind === "stronghold") {
    for (let i = -1; i <= 1; i++) spike(c, x + i * 16, topY + 9, 20, p.trim, p.accent);
  } else if (kind === "inferno" || kind === "necropolis" || kind === "dungeon") {
    isoRoof(c, x, topY + 4, w + 28, d + 22, 54, p.roofDark, shade(p.roofDark, -28));
  } else {
    isoRoof(c, x, topY + 4, w + 22, d + 18, 46, p.roof, p.roofDark);
  }
  windowSlit(c, x - 8, y - h * 0.48, p.glow);
}

function keep(c, x, y, w, d, h, p, kind) {
  isoBlock(c, x, y, w, d, h, {
    top: shade(p.stone, 10),
    left: p.stoneDark,
    right: shade(p.stoneDark, -26),
    stroke: shade(p.stoneDark, -58),
  });
  const topY = y - h;
  if (kind === "tower") {
    isoRoof(c, x, topY + 2, w + 36, d + 24, 72, p.roof, p.roofDark);
    c.polygon([[x - 22, topY - 56], [x, topY - 98], [x + 22, topY - 56], [x, topY - 42]], p.trim, 0.82);
  } else if (kind === "conflux") {
    c.ellipse(x, topY + 2, 92, 28, p.glow, 0.36);
    isoRoof(c, x, topY + 2, w + 26, d + 18, 60, p.roof, p.roofDark);
  } else {
    isoRoof(c, x, topY + 2, w + 34, d + 22, kind === "castle" ? 62 : 54, p.roof, p.roofDark);
  }
  c.line(x - 62, y - 58, x, y - 28, 5, p.trim, 0.75);
  c.line(x + 62, y - 58, x, y - 28, 5, p.trim, 0.45);
}

function gate(c, x, y, w, h, p) {
  c.polygon([[x - w / 2, y - h / 2], [x, y - h], [x + w / 2, y - h / 2], [x + w / 2, y + 8], [x, y + 26], [x - w / 2, y + 8]], "#090604", 1);
  c.polygon([[x - w / 2 + 9, y - h / 2 + 5], [x, y - h + 10], [x + w / 2 - 9, y - h / 2 + 5], [x + w / 2 - 9, y + 4], [x, y + 18], [x - w / 2 + 9, y + 4]], p.gate, 1);
  c.line(x, y - h + 13, x, y + 18, 3, shade(p.accent, 25), 0.72);
  c.line(x - 27, y - 22, x + 27, y - 22, 3, shade(p.accent, 25), 0.72);
}

function windowSlit(c, x, y, glow) {
  c.polygon([[x - 9, y - 8], [x, y - 13], [x + 9, y - 8], [x + 7, y + 10], [x, y + 14], [x - 7, y + 10]], "#08070a", 1);
  c.polygon([[x - 4, y - 5], [x, y - 8], [x + 4, y - 5], [x + 3, y + 7], [x, y + 10], [x - 3, y + 7]], glow, 0.8);
}

function isoBlock(c, x, y, w, d, h, colors) {
  const top = {
    n: [x, y - h - d / 2],
    e: [x + w / 2, y - h],
    s: [x, y - h + d / 2],
    w: [x - w / 2, y - h],
  };
  const base = {
    e: [x + w / 2, y],
    s: [x, y + d / 2],
    w: [x - w / 2, y],
  };
  c.polygon([top.e, top.s, base.s, base.e], colors.right, 1);
  c.polygon([top.s, top.w, base.w, base.s], colors.left, 1);
  c.polygon([top.n, top.e, top.s, top.w], colors.top, 1);
  for (const [a, b] of [[top.n, top.e], [top.e, top.s], [top.s, top.w], [top.w, top.n], [top.e, base.e], [top.s, base.s], [top.w, base.w]]) {
    c.line(a[0], a[1], b[0], b[1], 3, colors.stroke, 0.75);
  }
}

function isoRoof(c, x, y, w, d, h, color, dark) {
  const eaveN = [x, y - d / 2];
  const eaveE = [x + w / 2, y];
  const eaveS = [x, y + d / 2];
  const eaveW = [x - w / 2, y];
  const peak = [x, y - h];
  c.polygon([eaveN, eaveE, peak], shade(color, 12), 1);
  c.polygon([eaveE, eaveS, peak], color, 1);
  c.polygon([eaveS, eaveW, peak], dark, 1);
  c.polygon([eaveW, eaveN, peak], shade(color, -8), 1);
  for (const p of [eaveN, eaveE, eaveS, eaveW]) c.line(peak[0], peak[1], p[0], p[1], 2, shade(dark, -35), 0.72);
}

function spike(c, x, y, h, fill, stroke) {
  c.polygon([[x - 8, y + 8], [x, y - h], [x + 8, y + 8], [x, y + 15]], fill, 1);
  c.line(x - 8, y + 8, x, y - h, 2, stroke, 0.8);
  c.line(x + 8, y + 8, x, y - h, 2, stroke, 0.8);
}

function shade(hex, amount) {
  const [r, g, b] = parseColor(hex);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  return `#${[clamp(r + amount), clamp(g + amount), clamp(b + amount)].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function drawFactionDetails(c, faction, p) {
  if (faction === "castle") {
    c.line(256, 74, 256, 128, 5, p.trim, 1);
    c.polygon([[256, 74], [310, 95], [256, 112]], p.accent, 1);
    c.polygon([[198, 270], [224, 258], [224, 288], [198, 300]], p.accent, 1);
    c.polygon([[314, 258], [340, 270], [340, 300], [314, 288]], p.accent, 1);
  }
  if (faction === "rampart") {
    for (const [x, y] of [[104, 278], [408, 278], [159, 229], [353, 229]]) {
      c.line(x, y + 28, x + 4, y - 36, 15, "#5b351a", 1);
      c.ellipse(x, y - 42, 46, 30, "#2f6f3b", 1);
      c.ellipse(x - 14, y - 50, 24, 18, "#6bbd62", 0.85);
    }
    c.line(174, 258, 256, 218, 7, p.trim, 0.65);
    c.line(338, 258, 256, 218, 7, p.trim, 0.45);
  }
  if (faction === "tower") {
    for (const [x, y] of [[178, 288], [334, 288], [256, 205]]) {
      c.polygon([[x - 18, y], [x, y - 58], [x + 22, y], [x + 5, y + 42]], p.glow, 0.72);
      c.line(x, y - 54, x + 5, y + 34, 3, "#ffffff", 0.75);
    }
    c.ellipse(256, 318, 126, 18, "#ffffff", 0.32);
  }
  if (faction === "inferno") {
    for (const [x, y] of [[145, 318], [210, 294], [304, 294], [370, 318]]) {
      c.polygon([[x - 13, y], [x, y - 58], [x + 15, y], [x + 2, y + 10]], "#ff4a1f", 0.85);
      c.polygon([[x - 6, y - 2], [x + 2, y - 36], [x + 8, y - 2]], "#ffd166", 0.85);
    }
    c.line(182, 270, 256, 235, 7, p.trim, 0.5);
    c.line(330, 270, 256, 235, 7, p.trim, 0.42);
  }
  if (faction === "necropolis") {
    for (const [x, y] of [[124, 320], [388, 320], [256, 286]]) {
      c.polygon([[x - 10, y], [x, y - 38], [x + 10, y], [x, y + 9]], "#e5e7eb", 0.9);
      c.ellipse(x, y - 40, 8, 8, "#e5e7eb", 0.9);
    }
    c.line(162, 248, 224, 279, 6, p.trim, 0.5);
    c.line(350, 248, 288, 279, 6, p.trim, 0.5);
  }
  if (faction === "dungeon") {
    for (const [x, y] of [[104, 318], [155, 298], [358, 298], [410, 318]]) {
      c.polygon([[x - 26, y], [x + 8, y - 74], [x + 28, y + 10], [x + 3, y + 30]], "#2d2148", 1);
      c.polygon([[x - 10, y - 18], [x + 8, y - 74], [x + 16, y - 4]], p.trim, 0.55);
    }
    c.ellipse(256, 236, 34, 18, p.trim, 0.72);
  }
  if (faction === "stronghold") {
    for (let x = 102; x <= 410; x += 28) {
      const y = x < 256 ? 302 - (x - 102) * 0.32 : 254 + (x - 256) * 0.32;
      c.polygon([[x - 9, y], [x, y - 76], [x + 9, y], [x, y + 13]], p.accent, 1);
      c.line(x - 7, y - 46, x + 7, y - 39, 5, p.trim, 0.7);
    }
    c.polygon([[213, 205], [256, 162], [299, 205], [256, 226]], "#f4e4ba", 1);
  }
  if (faction === "fortress") {
    c.ellipse(256, 334, 196, 24, "#244f46", 0.55);
    for (const [x, y] of [[112, 318], [150, 300], [382, 300], [420, 318]]) {
      c.line(x, y, x + 8, y - 62, 7, p.trim, 0.7);
      c.line(x + 16, y, x + 5, y - 50, 5, p.trim, 0.7);
    }
    c.ellipse(256, 205, 72, 32, "#7c5b2b", 0.8);
  }
  if (faction === "conflux") {
    const orbs = [
      [174, 242, "#7dd3fc"],
      [338, 242, "#fb923c"],
      [211, 146, "#86efac"],
      [301, 146, "#c4b5fd"],
    ];
    for (const [x, y, color] of orbs) {
      c.ellipse(x, y, 22, 22, color, 0.85);
      c.ellipse(x - 6, y - 7, 7, 6, "#ffffff", 0.65);
    }
    c.ellipse(256, 206, 116, 24, p.glow, 0.32);
    c.line(174, 242, 338, 242, 5, p.trim, 0.4);
    c.line(211, 146, 301, 146, 5, p.trim, 0.4);
  }
}

function drawSprite(faction) {
  const palette = FACTIONS[faction];
  const c = new Canvas(WIDTH, HEIGHT, SCALE);
  drawCommonFort(c, palette, faction);
  drawFactionDetails(c, faction, palette);
  addHighlights(c);
  return c.downsample();
}

function addHighlights(c) {
  c.line(144, 304, 256, 250, 4, "#ffffff", 0.22);
  c.line(256, 250, 368, 304, 3, "#000000", 0.12);
  c.line(146, 268, 214, 236, 3, "#ffffff", 0.18);
  c.ellipse(256, 340, 124, 8, "#ffffff", 0.08);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const faction of Object.keys(FACTIONS)) {
  const file = path.join(OUT_DIR, `town-${faction}.webp`);
  const rgba = drawSprite(faction);
  await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width: WIDTH, height: HEIGHT, channels: 4 },
  })
    .webp({ lossless: true, effort: 6 })
    .toFile(file);
  console.log(`generated ${path.relative(process.cwd(), file)}`);
}
