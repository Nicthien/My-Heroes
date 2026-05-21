import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SOURCE_WIDTH = 256;
const SOURCE_HEIGHT = 128;
const SOURCE_SIDE_WIDTH = 256;
const SOURCE_SIDE_HEIGHT = 192;
const OUTPUT_WIDTH = 128;
const OUTPUT_HEIGHT = 64;
const OUTPUT_SIDE_WIDTH = 128;
const OUTPUT_SIDE_HEIGHT = 96;
const OUT_DIR = path.join(process.cwd(), "public", "assets", "textures", "terrain");

const terrainCatalog = {
  grass: {
    base: ["#4f8f3d", "#74b85a", "#2e6d2d"],
    variants: [
      ["clean", ["soft-grain"]],
      ["dense-herb", ["soft-grain", "grass"]],
      ["flowers", ["soft-grain", "flowers"]],
      ["small-rocks", ["soft-grain", "rocks"]],
      ["herb-flowers", ["grass", "flowers"]],
      ["herb-rocks", ["grass", "rocks"]],
      ["clover-moss", ["moss", "clover"]],
      ["dirt-transition", ["soft-grain", "dirt-patches", "grass"]],
    ],
  },
  forest: {
    base: ["#275b2d", "#3f7d39", "#17381f"],
    variants: [
      ["leafy-floor", ["leaves", "soft-grain"]],
      ["dead-leaves", ["dead-leaves", "twigs"]],
      ["low-roots", ["roots", "moss"]],
      ["moss", ["moss", "soft-grain"]],
      ["ferns", ["fern", "grass"]],
      ["pine-needles", ["needles", "twigs"]],
      ["rare-flowers", ["leaves", "flowers"]],
      ["shaded-rocks", ["leaves", "rocks"]],
    ],
  },
  dirt: {
    base: ["#8f6435", "#b4834b", "#5a351d"],
    variants: [
      ["bare", ["soft-grain"]],
      ["dry", ["cracks", "soft-grain"]],
      ["small-rocks", ["rocks", "soft-grain"]],
      ["rare-grass", ["grass", "soft-grain"]],
      ["light-mud", ["mud", "puddles"]],
      ["ruts", ["ruts", "soft-grain"]],
      ["dark", ["dark-grain", "soft-grain"]],
    ],
  },
  sand: {
    base: ["#d6a95b", "#f1cc7e", "#9c7336"],
    variants: [
      ["clean", ["soft-grain"]],
      ["ripples", ["ripples"]],
      ["small-rocks", ["rocks", "soft-grain"]],
      ["shells", ["shells", "soft-grain"]],
      ["dry", ["ripples", "soft-grain"]],
      ["packed", ["packed", "soft-grain"]],
      ["rare-grass", ["grass", "soft-grain"]],
    ],
  },
  snow: {
    base: ["#cfe7f0", "#ffffff", "#94b7c5"],
    variants: [
      ["clean", ["snow-sparkle"]],
      ["packed", ["packed", "snow-sparkle"]],
      ["small-rocks", ["rocks", "snow-sparkle"]],
      ["blue", ["blue-ice", "snow-sparkle"]],
      ["frozen-grass", ["frozen-grass", "snow-sparkle"]],
      ["soft-tracks", ["tracks", "snow-sparkle"]],
      ["hard-ice", ["ice-lines", "blue-ice"]],
    ],
  },
  swamp: {
    base: ["#3f5932", "#6f7b45", "#22351f"],
    variants: [
      ["green-mud", ["mud", "soft-grain"]],
      ["wet-moss", ["moss", "puddles"]],
      ["low-reeds", ["reeds", "puddles"]],
      ["dark-puddles", ["puddles", "dark-grain"]],
      ["roots", ["roots", "mud"]],
      ["marsh-grass", ["grass", "reeds"]],
      ["wet-rocks", ["rocks", "puddles"]],
    ],
  },
  mountain: {
    base: ["#6d7371", "#a6aaa4", "#3f4648"],
    variants: [
      ["clean-rock", ["stone-grain"]],
      ["cracked-rock", ["cracks", "stone-grain"]],
      ["small-rocks", ["rocks", "stone-grain"]],
      ["rare-moss", ["moss", "stone-grain"]],
      ["dark-rock", ["dark-grain", "stone-grain"]],
      ["light-rock", ["light-grain", "stone-grain"]],
      ["gravel", ["gravel", "stone-grain"]],
    ],
  },
  lava: {
    base: ["#321b19", "#5d2d22", "#130d0c"],
    variants: [
      ["volcanic-rock", ["stone-grain", "dark-grain"]],
      ["ash", ["ash", "soft-grain"]],
      ["hot-cracks", ["hot-cracks", "stone-grain"]],
      ["embers", ["embers", "dark-grain"]],
      ["black-rock", ["dark-grain", "stone-grain"]],
      ["dry-flow", ["lava-flow", "dark-grain"]],
      ["burnt-edge", ["burnt-edge", "embers"]],
    ],
  },
};

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [terrain, spec] of Object.entries(terrainCatalog)) {
  const terrainDir = path.join(OUT_DIR, terrain);
  fs.mkdirSync(terrainDir, { recursive: true });

  for (const [slug, features] of spec.variants) {
    const svg = terrainSvg(terrain, slug, spec.base, features);
    const output = path.join(terrainDir, `${terrain}-${slug}.webp`);
    await writeTerrainTopTexture(svg, output, terrain);
    console.log(`Generated ${path.relative(process.cwd(), output)}`);

    for (const side of ["left", "right"]) {
      const sideSvg = terrainSideSvg(terrain, slug, spec.base, features, side);
      const sideOutput = path.join(terrainDir, `${terrain}-${slug}-side-${side}.webp`);
      await sharp(Buffer.from(sideSvg))
        .resize(OUTPUT_SIDE_WIDTH, OUTPUT_SIDE_HEIGHT, { fit: "fill" })
        .webp({ lossless: true, effort: 6 })
        .toFile(sideOutput);
      console.log(`Generated ${path.relative(process.cwd(), sideOutput)}`);
    }
  }
}

async function writeTerrainTopTexture(svg, output, terrain) {
  const image = sharp(Buffer.from(svg))
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "fill" });

  if (terrain !== "sand") {
    await image
      .webp({ lossless: true, effort: 6 })
      .toFile(output);
    return;
  }

  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) data[i] = 255;
  }

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .webp({ lossless: true, effort: 6 })
    .toFile(output);
}

function terrainSvg(terrain, slug, colors, features) {
  const seed = hashString(`${terrain}:${slug}`);
  const detail = [
    grain(seed, features),
    featureLayer(seed + 11, colors, features),
    signatureLayer(terrain, slug, seed + 19),
    terrain === "mountain" ? mountainFacetLayer(seed + 29, slug) : "",
    highlightLayer(seed + 23, colors),
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" viewBox="0 0 ${SOURCE_WIDTH} ${SOURCE_HEIGHT}">
  <defs>
    <clipPath id="diamond"><path d="M128 0 256 64 128 128 0 64Z"/></clipPath>
    <linearGradient id="base" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${colors[1]}"/>
      <stop offset=".58" stop-color="${colors[0]}"/>
      <stop offset="1" stop-color="${colors[2]}"/>
    </linearGradient>
    <filter id="paint" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="${seed % 997}" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 .18 0"/>
      <feBlend in="SourceGraphic" mode="multiply"/>
    </filter>
  </defs>
  <g clip-path="url(#diamond)">
    <path d="M128 0 256 64 128 128 0 64Z" fill="url(#base)" filter="url(#paint)"/>
    ${detail}
    <path d="M0 64 128 0 256 64" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/>
    <path d="M0 64 128 128 256 64" fill="none" stroke="#000000" stroke-opacity=".18" stroke-width="2"/>
    <path d="M128 0 256 64 128 128 0 64Z" fill="none" stroke="#1b2324" stroke-opacity=".22" stroke-width="1.5"/>
  </g>
</svg>`;
}

function terrainSideSvg(terrain, slug, colors, features, side) {
  const seed = hashString(`${terrain}:${slug}:side:${side}`);
  const shade = side === "left" ? 0.72 : 0.52;
  const shaded = colors.map((color) => shadeColor(color, shade));
  const facePath = side === "left"
    ? `M0 0 256 96 256 192 0 96Z`
    : `M0 96 256 0 256 96 0 192Z`;
  const detail = [
    verticalGrain(seed, side),
    sideFeatureLayer(seed + 17, features, side),
    sideEdgeLight(side),
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SOURCE_SIDE_WIDTH}" height="${SOURCE_SIDE_HEIGHT}" viewBox="0 0 ${SOURCE_SIDE_WIDTH} ${SOURCE_SIDE_HEIGHT}">
  <defs>
    <clipPath id="face"><path d="${facePath}"/></clipPath>
    <linearGradient id="side-base" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${shaded[1]}"/>
      <stop offset=".55" stop-color="${shaded[0]}"/>
      <stop offset="1" stop-color="${shaded[2]}"/>
    </linearGradient>
    <filter id="side-paint" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".052" numOctaves="3" seed="${seed % 997}" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.45 0 0 0 0 0.45 0 0 0 0 0.45 0 0 0 .2 0"/>
      <feBlend in="SourceGraphic" mode="multiply"/>
    </filter>
  </defs>
  <g clip-path="url(#face)">
    <path d="${facePath}" fill="url(#side-base)" filter="url(#side-paint)"/>
    ${detail}
    <path d="${facePath}" fill="none" stroke="#000000" stroke-opacity=".26" stroke-width="4"/>
  </g>
</svg>`;
}

function grain(seed, features) {
  const rng = makeRng(seed);
  const count = features.includes("stone-grain") || features.includes("gravel") ? 34 : 22;
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = 18 + rng() * 220;
    const y = 18 + rng() * 92;
    const w = 3 + rng() * 18;
    const opacity = features.includes("dark-grain") ? 0.22 : 0.12;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w)}" ry="${f(1 + rng() * 3)}" fill="#000000" opacity="${f(opacity * rng())}" transform="rotate(${f(-22 + rng() * 44)} ${f(x)} ${f(y)})"/>`;
  }
  return out;
}

function verticalGrain(seed, side) {
  const rng = makeRng(seed + 2101);
  let out = "";
  for (let i = 0; i < 20; i++) {
    const x = 10 + rng() * 236;
    const y = 20 + rng() * 146;
    const lean = side === "left" ? 12 : -12;
    out += `<path d="M${f(x)} ${f(y)} q${f(lean * rng())} ${f(18 + rng() * 34)} ${f(lean * .25)} ${f(42 + rng() * 48)}" fill="none" stroke="#000000" stroke-width="${f(1 + rng() * 2.5)}" stroke-linecap="round" opacity="${f(.08 + rng() * .14)}"/>`;
  }
  return out;
}

function sideFeatureLayer(seed, features, side) {
  let out = "";
  if (features.includes("rocks") || features.includes("gravel") || features.includes("stone-grain")) out += sidePebbles(seed);
  if (features.includes("grass") || features.includes("moss") || features.includes("reeds")) out += sideRoots(seed, "#1d3b1d", side);
  if (features.includes("leaves") || features.includes("dead-leaves") || features.includes("needles")) out += sideRoots(seed, "#402719", side);
  if (features.includes("cracks")) out += sideCracks(seed, side, "#19100d");
  if (features.includes("hot-cracks") || features.includes("embers")) out += sideCracks(seed, side, "#ff8a2b", 0.72);
  if (features.includes("snow-sparkle") || features.includes("blue-ice")) out += sideCracks(seed, side, "#dff8ff", 0.24);
  if (features.includes("puddles") || features.includes("mud")) out += sideDamp(seed);
  return out;
}

function sidePebbles(seed) {
  const rng = makeRng(seed + 2201);
  let out = "";
  for (let i = 0; i < 16; i++) {
    const x = 20 + rng() * 216;
    const y = 34 + rng() * 124;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(2 + rng() * 5)}" ry="${f(1.2 + rng() * 3)}" fill="${i % 2 ? "#1a1d1e" : "#e1dfd0"}" opacity="${i % 2 ? ".18" : ".16"}"/>`;
  }
  return out;
}

function sideRoots(seed, color, side) {
  return strokes(seed + 2301, color, 8, 2, 0.22).replaceAll("<path", `<path transform="skewY(${side === "left" ? 12 : -12})"`);
}

function sideCracks(seed, side, color, opacity = 0.36) {
  const rng = makeRng(seed + 2401);
  let out = "";
  for (let i = 0; i < 7; i++) {
    const x = 28 + rng() * 200;
    const y = 28 + rng() * 130;
    const dx = (side === "left" ? 1 : -1) * (12 + rng() * 28);
    out += `<path d="M${f(x)} ${f(y)} l${f(dx * .45)} ${f(18 + rng() * 18)} l${f(dx * -.28)} ${f(15 + rng() * 20)}" fill="none" stroke="${color}" stroke-width="${f(1.2 + rng() * 1.8)}" stroke-linecap="round" opacity="${f(opacity)}"/>`;
  }
  return out;
}

function sideDamp(seed) {
  const rng = makeRng(seed + 2501);
  let out = "";
  for (let i = 0; i < 5; i++) {
    const x = 34 + rng() * 188;
    const y = 40 + rng() * 110;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(12 + rng() * 28)}" ry="${f(4 + rng() * 11)}" fill="#0c1f1c" opacity=".18"/>`;
  }
  return out;
}

function sideEdgeLight(side) {
  return side === "left"
    ? `<path d="M0 0 256 96" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="5"/>`
    : `<path d="M256 0 0 96" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="4"/>`;
}

function featureLayer(seed, colors, features) {
  let out = "";
  if (features.includes("grass")) out += blades(seed, "#235f28", "#a6da75", 18);
  if (features.includes("frozen-grass")) out += blades(seed, "#7c9a8e", "#e7f6fb", 12);
  if (features.includes("flowers")) out += flowers(seed);
  if (features.includes("rocks")) out += rocks(seed);
  if (features.includes("moss")) out += moss(seed);
  if (features.includes("clover")) out += clover(seed);
  if (features.includes("dirt-patches")) out += patches(seed, "#7f4d27", 0.34);
  if (features.includes("leaves")) out += leaves(seed, "#8f7638", "#d1a34e");
  if (features.includes("dead-leaves")) out += leaves(seed, "#7a4d25", "#c37a35");
  if (features.includes("twigs")) out += strokes(seed, "#3a2518", 8);
  if (features.includes("roots")) out += strokes(seed, "#2a1d11", 7, 3);
  if (features.includes("fern")) out += fern(seed);
  if (features.includes("needles")) out += strokes(seed, "#17391e", 18, 1.5);
  if (features.includes("cracks")) out += strokes(seed, "#241814", 6, 2);
  if (features.includes("mud")) out += patches(seed, "#3c2f1f", 0.28);
  if (features.includes("puddles")) out += puddles(seed);
  if (features.includes("ruts")) out += ruts(seed);
  if (features.includes("ripples")) out += ripples(seed);
  if (features.includes("shells")) out += shells(seed);
  if (features.includes("packed")) out += strokes(seed, "#ffffff", 6, 1, 0.18);
  if (features.includes("snow-sparkle")) out += sparkles(seed);
  if (features.includes("blue-ice")) out += strokes(seed, "#9fd8ff", 8, 1.5, 0.32);
  if (features.includes("tracks")) out += tracks(seed);
  if (features.includes("ice-lines")) out += strokes(seed, "#6fbce5", 9, 1, 0.38);
  if (features.includes("reeds")) out += blades(seed, "#2d4c25", "#87995e", 10);
  if (features.includes("light-grain")) out += strokes(seed, "#edf0e7", 7, 1.2, 0.22);
  if (features.includes("gravel")) out += gravel(seed);
  if (features.includes("ash")) out += patches(seed, "#88817b", 0.24);
  if (features.includes("hot-cracks")) out += hotCracks(seed);
  if (features.includes("embers")) out += embers(seed);
  if (features.includes("lava-flow")) out += lavaFlow(seed);
  if (features.includes("burnt-edge")) out += burntEdge();
  return out;
}

function signatureLayer(terrain, slug, seed) {
  if (terrain === "grass") {
    if (slug === "flowers") return heroFlowers(seed, 3);
    if (slug === "herb-flowers") return blades(seed, "#235f28", "#b8e986", 16) + heroFlowers(seed + 1, 3);
    if (slug === "small-rocks") return heroRocks(seed, 2);
    if (slug === "herb-rocks") return blades(seed, "#235f28", "#b8e986", 14) + heroRocks(seed + 1, 2);
    if (slug === "clover-moss") return heroMoss(seed);
    if (slug === "dirt-transition") return boldDirtPatch(seed);
  }

  if (terrain === "sand") {
    if (slug === "small-rocks") return heroRocks(seed, 2, "#8b8170", "#d8d1bb");
    if (slug === "shells") return heroShells(seed);
    if (slug === "rare-grass") return heroGrassClumps(seed, "#6d7f3b", "#b8c76b");
    if (slug === "ripples" || slug === "dry") return boldRipples(seed);
  }

  if (terrain === "snow") {
    if (slug === "small-rocks") return heroRocks(seed, 2, "#68777e", "#dce5e7");
    if (slug === "frozen-grass") return heroGrassClumps(seed, "#79918c", "#f1fbff");
    if (slug === "soft-tracks") return boldTracks(seed);
    if (slug === "hard-ice" || slug === "blue") return boldIce(seed);
  }

  if (terrain === "dirt") {
    if (slug === "small-rocks") return heroRocks(seed, 2, "#6f6a5c", "#c9c1a8");
    if (slug === "rare-grass") return heroGrassClumps(seed, "#315b29", "#9dc867");
    if (slug === "ruts") return boldRuts(seed);
    if (slug === "light-mud") return boldMud(seed);
  }

  if (terrain === "forest") {
    if (slug === "low-roots") return boldRoots(seed);
    if (slug === "ferns") return heroFern(seed);
    if (slug === "rare-flowers") return heroFlowers(seed, 2);
    if (slug === "shaded-rocks") return heroRocks(seed, 2, "#606963", "#b9c0b3");
  }

  if (terrain === "swamp") {
    if (slug === "low-reeds" || slug === "marsh-grass") return heroGrassClumps(seed, "#243b1f", "#9ba65f");
    if (slug === "dark-puddles") return boldPuddles(seed);
    if (slug === "wet-rocks") return heroRocks(seed, 2, "#4f5b54", "#aeb8a6");
    if (slug === "roots") return boldRoots(seed);
  }

  if (terrain === "mountain") {
    if (slug === "small-rocks" || slug === "gravel") return heroRocks(seed, 3, "#596063", "#c8cbc2");
    if (slug === "cracked-rock") return boldCracks(seed, "#252727");
    if (slug === "rare-moss") return heroMoss(seed);
  }

  if (terrain === "lava") {
    if (slug === "hot-cracks") return boldCracks(seed, "#ff9a2b", 0.9);
    if (slug === "embers") return boldEmbers(seed);
    if (slug === "dry-flow") return boldLavaFlow(seed);
    if (slug === "burnt-edge") return burntEdge();
  }

  return "";
}

function mountainFacetLayer(seed, slug) {
  const rng = makeRng(seed + 3101);
  const baseAlpha = slug === "dark-rock" ? 0.2 : slug === "light-rock" ? 0.16 : 0.18;
  const facets = [
    { points: [[42, 53], [82, 30], [111, 44], [71, 65]], fill: "#c8cfcc", opacity: baseAlpha },
    { points: [[83, 30], [136, 18], [164, 37], [112, 44]], fill: "#eef1ea", opacity: baseAlpha * 0.85 },
    { points: [[112, 45], [164, 38], [205, 60], [153, 75]], fill: "#3b4447", opacity: baseAlpha * 0.9 },
    { points: [[71, 66], [112, 46], [153, 76], [108, 94]], fill: "#596265", opacity: baseAlpha * 0.76 },
    { points: [[30, 66], [72, 67], [108, 95], [71, 106]], fill: "#252c2e", opacity: baseAlpha * 0.65 },
    { points: [[153, 76], [205, 61], [226, 68], [178, 91]], fill: "#d8ddd8", opacity: baseAlpha * 0.55 },
  ];

  let out = "";
  for (const facet of facets) {
    const driftX = (rng() - 0.5) * 5;
    const driftY = (rng() - 0.5) * 3;
    const points = facet.points
      .map(([x, y]) => `${f(x + driftX)} ${f(y + driftY)}`)
      .join(" ");
    out += `<polygon points="${points}" fill="${facet.fill}" opacity="${f(facet.opacity)}"/>`;
  }

  out += `<path d="M39 54 81 31 112 44 M84 31 136 19 165 38 M111 45 153 75 205 61 M72 67 108 94 153 76" fill="none" stroke="#20282a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".18"/>`;
  out += `<path d="M44 52 82 31 M86 31 136 20 M154 74 204 61" fill="none" stroke="#f5f7f0" stroke-width="1.6" stroke-linecap="round" opacity=".16"/>`;
  return out;
}

function heroFlowers(seed, count) {
  const rng = makeRng(seed + 2601);
  const centers = pickHeroPoints(rng, count);
  const colors = ["#ffd34d", "#ff6f9b", "#fff1a8"];
  let out = "";
  for (let i = 0; i < centers.length; i++) {
    const { x, y } = centers[i];
    const petal = 4.2 + rng() * 1.4;
    const color = colors[i % colors.length];
    out += `<g opacity=".96">
      <circle cx="${f(x)}" cy="${f(y - petal)}" r="${f(petal)}" fill="${color}"/>
      <circle cx="${f(x + petal)}" cy="${f(y)}" r="${f(petal)}" fill="${color}"/>
      <circle cx="${f(x)}" cy="${f(y + petal)}" r="${f(petal)}" fill="${color}"/>
      <circle cx="${f(x - petal)}" cy="${f(y)}" r="${f(petal)}" fill="${color}"/>
      <circle cx="${f(x)}" cy="${f(y)}" r="${f(petal * .52)}" fill="#6b4a1a"/>
      <circle cx="${f(x - petal * .28)}" cy="${f(y - petal * .3)}" r="${f(petal * .22)}" fill="#fff7d6" opacity=".7"/>
    </g>`;
  }
  return out;
}

function heroRocks(seed, count, base = "#777f80", light = "#d6d8cc") {
  const rng = makeRng(seed + 2701);
  const centers = pickHeroPoints(rng, count);
  let out = "";
  for (const { x, y } of centers) {
    const w = 13 + rng() * 8;
    const h = 7 + rng() * 5;
    out += `<g opacity=".92">
      <ellipse cx="${f(x)}" cy="${f(y + h * .9)}" rx="${f(w * 1.08)}" ry="${f(h * .5)}" fill="#050606" opacity=".18"/>
      <path d="M${f(x - w)} ${f(y)} ${f(x - w * .42)} ${f(y - h)} ${f(x + w * .38)} ${f(y - h * .86)} ${f(x + w)} ${f(y - h * .08)} ${f(x + w * .62)} ${f(y + h)} ${f(x - w * .54)} ${f(y + h)}Z" fill="${base}"/>
      <path d="M${f(x - w * .42)} ${f(y - h)} ${f(x + w * .38)} ${f(y - h * .86)} ${f(x + w * .1)} ${f(y - h * .1)} ${f(x - w * .68)} ${f(y + h * .08)}Z" fill="${light}" opacity=".42"/>
      <path d="M${f(x + w * .1)} ${f(y - h * .1)} ${f(x + w)} ${f(y - h * .08)} ${f(x + w * .62)} ${f(y + h)} ${f(x - w * .12)} ${f(y + h * .6)}Z" fill="#20282a" opacity=".26"/>
    </g>`;
  }
  return out;
}

function heroGrassClumps(seed, dark, light) {
  const rng = makeRng(seed + 2801);
  const centers = pickHeroPoints(rng, 2);
  let out = "";
  for (const { x, y } of centers) {
    out += `<ellipse cx="${f(x)}" cy="${f(y + 6)}" rx="18" ry="5" fill="#11180a" opacity=".18"/>`;
    for (let i = 0; i < 15; i++) {
      const offset = (i - 7) * 2.3;
      const h = 10 + rng() * 12;
      const lean = -5 + rng() * 10;
      out += `<path d="M${f(x + offset)} ${f(y + 6)} q${f(lean)} ${f(-h * .55)} ${f(lean * .28)} ${f(-h)}" fill="none" stroke="${i % 3 === 0 ? light : dark}" stroke-width="${f(1.5 + rng() * 1.6)}" stroke-linecap="round" opacity="${i % 3 === 0 ? ".68" : ".9"}"/>`;
    }
  }
  return out;
}

function heroMoss(seed) {
  const rng = makeRng(seed + 2901);
  let out = "";
  for (let i = 0; i < 5; i++) {
    const x = 38 + rng() * 180;
    const y = 26 + rng() * 70;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(14 + rng() * 20)}" ry="${f(5 + rng() * 8)}" fill="${i % 2 ? "#8fc46b" : "#5f9f54"}" opacity=".62"/>`;
  }
  return out;
}

function boldDirtPatch(seed) {
  return patches(seed + 3001, "#7c4b25", 0.55) + patches(seed + 3002, "#b1763a", 0.24);
}

function heroShells(seed) {
  const rng = makeRng(seed + 3101);
  const centers = pickHeroPoints(rng, 3);
  let out = "";
  for (const { x, y } of centers) {
    out += `<g opacity=".78">
      <path d="M${f(x - 8)} ${f(y + 5)}q8-17 18 0z" fill="#fff0c7"/>
      <path d="M${f(x - 5)} ${f(y + 2)}l12 5M${f(x)} ${f(y - 2)}l5 10" stroke="#b58c58" stroke-width="1.4" opacity=".55"/>
    </g>`;
  }
  return out;
}

function boldRipples(seed) {
  const rng = makeRng(seed + 3201);
  let out = "";
  for (let i = 0; i < 7; i++) {
    const x = 36 + rng() * 170;
    const y = 24 + rng() * 72;
    out += `<path d="M${f(x - 20)} ${f(y)} q20 ${f(-8 + rng() * 16)} 42 0" fill="none" stroke="#8a6735" stroke-width="2.4" opacity=".28"/>`;
  }
  return out;
}

function boldTracks(seed) {
  const rng = makeRng(seed + 3301);
  let out = "";
  for (let i = 0; i < 8; i++) {
    const x = 62 + i * 15;
    const y = 44 + Math.sin(i * .9) * 10 + rng() * 2;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="8" ry="4" fill="#7da8ba" opacity=".28" transform="rotate(-24 ${f(x)} ${f(y)})"/>`;
  }
  return out;
}

function boldIce(seed) {
  return strokes(seed + 3401, "#71c7f0", 8, 2.2, 0.46) + strokes(seed + 3402, "#ffffff", 4, 1.2, 0.32);
}

function boldRuts(seed) {
  const rng = makeRng(seed + 3501);
  let out = "";
  for (let i = 0; i < 3; i++) {
    const y = 42 + i * 12 + rng() * 4;
    out += `<path d="M44 ${f(y)} q46 ${f(-12 + rng() * 20)} 92 0 t74 1" fill="none" stroke="#4a2b16" stroke-width="5" opacity=".34"/>`;
  }
  return out;
}

function boldMud(seed) {
  return puddles(seed + 3601) + patches(seed + 3602, "#3c2c1f", 0.38);
}

function boldRoots(seed) {
  return strokes(seed + 3701, "#2a1a0d", 8, 4, 0.5) + strokes(seed + 3702, "#6b4828", 5, 2, 0.34);
}

function heroFern(seed) {
  const rng = makeRng(seed + 3801);
  let out = "";
  for (const { x, y } of pickHeroPoints(rng, 3)) {
    out += `<path d="M${f(x - 16)} ${f(y + 8)} q18 -22 42 -18 M${f(x - 7)} ${f(y - 3)}l-9 -10 M${f(x + 2)} ${f(y - 7)}l0 -13 M${f(x + 11)} ${f(y - 8)}l10 -10 M${f(x + 20)} ${f(y - 5)}l14 -4" fill="none" stroke="#9fdd72" stroke-width="2.8" stroke-linecap="round" opacity=".72"/>`;
  }
  return out;
}

function boldPuddles(seed) {
  const rng = makeRng(seed + 3901);
  let out = "";
  for (const { x, y } of pickHeroPoints(rng, 2)) {
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(24 + rng() * 12)}" ry="${f(8 + rng() * 4)}" fill="#102d2e" opacity=".58"/><ellipse cx="${f(x - 6)}" cy="${f(y - 2)}" rx="12" ry="3" fill="#a7d1bb" opacity=".22"/>`;
  }
  return out;
}

function boldCracks(seed, color, opacity = 0.52) {
  const rng = makeRng(seed + 4001);
  let out = "";
  for (let i = 0; i < 5; i++) {
    const x = 40 + rng() * 170;
    const y = 28 + rng() * 64;
    out += `<path d="M${f(x)} ${f(y)} l${f(12 + rng() * 24)} ${f(7 + rng() * 10)} l${f(-8 - rng() * 15)} ${f(10 + rng() * 12)} m${f(6 + rng() * 10)} ${f(-6 - rng() * 4)} l${f(16 + rng() * 20)} ${f(-8 + rng() * 16)}" fill="none" stroke="${color}" stroke-width="${f(2.4 + rng() * 1.6)}" stroke-linecap="round" opacity="${f(opacity)}"/>`;
  }
  return out;
}

function boldEmbers(seed) {
  const rng = makeRng(seed + 4101);
  let out = "";
  for (let i = 0; i < 11; i++) {
    const x = 30 + rng() * 196;
    const y = 22 + rng() * 80;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2.2 + rng() * 3.4)}" fill="${i % 2 ? "#ff8a2b" : "#ffd166"}" opacity=".86"/>`;
  }
  return out;
}

function boldLavaFlow(seed) {
  const rng = makeRng(seed + 4201);
  let out = "";
  for (let i = 0; i < 3; i++) {
    const y = 34 + rng() * 48;
    out += `<path d="M30 ${f(y)} q48 ${f(-22 + rng() * 34)} 98 0 t98 2" fill="none" stroke="#bd3a24" stroke-width="${f(8 + rng() * 6)}" opacity=".58"/><path d="M34 ${f(y - 1)} q45 ${f(-18 + rng() * 28)} 90 0 t90 1" fill="none" stroke="#ff8a2b" stroke-width="2.4" opacity=".48"/>`;
  }
  return out;
}

function pickHeroPoints(rng, count) {
  const anchors = [
    { x: 96, y: 43 },
    { x: 139, y: 62 },
    { x: 174, y: 79 },
    { x: 77, y: 74 },
  ];
  return anchors.slice(0, count).map((point) => ({
    x: point.x + (rng() - .5) * 10,
    y: point.y + (rng() - .5) * 8,
  }));
}

function highlightLayer(seed) {
  const rng = makeRng(seed);
  let out = "";
  for (let i = 0; i < 7; i++) {
    const x = 32 + rng() * 190;
    const y = 18 + rng() * 76;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(12 + rng() * 24)}" ry="${f(2 + rng() * 4)}" fill="#ffffff" opacity=".055" transform="rotate(${f(-18 + rng() * 36)} ${f(x)} ${f(y)})"/>`;
  }
  return out;
}

function blades(seed, dark, light, count) {
  const rng = makeRng(seed + 101);
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = 24 + rng() * 208;
    const y = 24 + rng() * 76;
    const h = 6 + rng() * 12;
    const lean = -4 + rng() * 8;
    out += `<path d="M${f(x)} ${f(y)} q${f(lean)} ${f(-h * 0.55)} ${f(lean * 0.35)} ${f(-h)}" fill="none" stroke="${i % 3 === 0 ? light : dark}" stroke-width="${f(1.2 + rng() * 1.4)}" stroke-linecap="round" opacity="${i % 3 === 0 ? ".52" : ".78"}"/>`;
  }
  return out;
}

function flowers(seed) {
  const rng = makeRng(seed + 201);
  const colors = ["#ffd166", "#ff7da2", "#f8f3a5", "#c7f08a"];
  let out = "";
  for (let i = 0; i < 12; i++) {
    const x = 30 + rng() * 196;
    const y = 24 + rng() * 78;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.4 + rng())}" fill="${colors[i % colors.length]}" opacity=".9"/>`;
  }
  return out;
}

function rocks(seed) {
  const rng = makeRng(seed + 301);
  let out = "";
  for (let i = 0; i < 9; i++) {
    const x = 28 + rng() * 200;
    const y = 20 + rng() * 86;
    const w = 5 + rng() * 10;
    const h = 2.4 + rng() * 5;
    out += `<path d="M${f(x - w)} ${f(y)} ${f(x - w * .35)} ${f(y - h)} ${f(x + w * .4)} ${f(y - h * .8)} ${f(x + w)} ${f(y)} ${f(x + w * .45)} ${f(y + h)} ${f(x - w * .55)} ${f(y + h)}Z" fill="#7f8989" opacity=".82"/><ellipse cx="${f(x - w * .22)}" cy="${f(y - h * .3)}" rx="${f(w * .28)}" ry="${f(h * .24)}" fill="#f1f0df" opacity=".22"/>`;
  }
  return out;
}

function moss(seed) {
  const rng = makeRng(seed + 401);
  let out = "";
  for (let i = 0; i < 13; i++) {
    const x = 24 + rng() * 208;
    const y = 20 + rng() * 88;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(6 + rng() * 12)}" ry="${f(2 + rng() * 5)}" fill="#76a95a" opacity=".34"/>`;
  }
  return out;
}

function clover(seed) {
  const rng = makeRng(seed + 501);
  let out = "";
  for (let i = 0; i < 12; i++) {
    const x = 30 + rng() * 190;
    const y = 26 + rng() * 72;
    out += `<g opacity=".7"><circle cx="${f(x - 2)}" cy="${f(y)}" r="2.5" fill="#91ca68"/><circle cx="${f(x + 2)}" cy="${f(y)}" r="2.5" fill="#78b55c"/><circle cx="${f(x)}" cy="${f(y - 2)}" r="2.5" fill="#a5dd75"/></g>`;
  }
  return out;
}

function patches(seed, color, opacity) {
  const rng = makeRng(seed + 601);
  let out = "";
  for (let i = 0; i < 7; i++) {
    const x = 28 + rng() * 200;
    const y = 22 + rng() * 82;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(12 + rng() * 28)}" ry="${f(4 + rng() * 9)}" fill="${color}" opacity="${f(opacity)}" transform="rotate(${f(-22 + rng() * 44)} ${f(x)} ${f(y)})"/>`;
  }
  return out;
}

function leaves(seed, a, b) {
  const rng = makeRng(seed + 701);
  let out = "";
  for (let i = 0; i < 24; i++) {
    const x = 22 + rng() * 212;
    const y = 18 + rng() * 88;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(2 + rng() * 5)}" ry="${f(1 + rng() * 2.4)}" fill="${i % 2 ? a : b}" opacity=".55" transform="rotate(${f(rng() * 180)} ${f(x)} ${f(y)})"/>`;
  }
  return out;
}

function strokes(seed, color, count, width = 2, opacity = 0.42) {
  const rng = makeRng(seed + 801);
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = 28 + rng() * 200;
    const y = 20 + rng() * 84;
    const dx = -16 + rng() * 32;
    const dy = -7 + rng() * 14;
    out += `<path d="M${f(x)} ${f(y)} q${f(dx * .45)} ${f(dy - 5)} ${f(dx)} ${f(dy)}" fill="none" stroke="${color}" stroke-width="${f(width)}" stroke-linecap="round" opacity="${f(opacity)}"/>`;
  }
  return out;
}

function fern(seed) {
  const rng = makeRng(seed + 901);
  let out = "";
  for (let i = 0; i < 8; i++) {
    const x = 34 + rng() * 188;
    const y = 30 + rng() * 66;
    out += `<path d="M${f(x)} ${f(y)} q10 -7 20 -3 M${f(x + 5)} ${f(y - 3)}l-4 -6 M${f(x + 10)} ${f(y - 5)}l2 -7 M${f(x + 15)} ${f(y - 4)}l5 -5" fill="none" stroke="#8fcf69" stroke-width="1.7" stroke-linecap="round" opacity=".58"/>`;
  }
  return out;
}

function puddles(seed) {
  const rng = makeRng(seed + 1001);
  let out = "";
  for (let i = 0; i < 5; i++) {
    const x = 38 + rng() * 180;
    const y = 24 + rng() * 78;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(10 + rng() * 22)}" ry="${f(3 + rng() * 7)}" fill="#102d2e" opacity=".42"/><ellipse cx="${f(x - 3)}" cy="${f(y - 1)}" rx="${f(5 + rng() * 9)}" ry="${f(1.2 + rng() * 2)}" fill="#a7d1bb" opacity=".18"/>`;
  }
  return out;
}

function ruts(seed) {
  return strokes(seed + 1101, "#4d2e18", 7, 3, 0.38);
}

function ripples(seed) {
  const rng = makeRng(seed + 1201);
  let out = "";
  for (let i = 0; i < 12; i++) {
    const x = 24 + rng() * 206;
    const y = 20 + rng() * 84;
    out += `<path d="M${f(x - 12)} ${f(y)} q12 ${f(-4 + rng() * 8)} 24 0" fill="none" stroke="#8a6735" stroke-width="1.4" opacity=".22"/>`;
  }
  return out;
}

function shells(seed) {
  const rng = makeRng(seed + 1301);
  let out = "";
  for (let i = 0; i < 6; i++) {
    const x = 34 + rng() * 188;
    const y = 24 + rng() * 78;
    out += `<path d="M${f(x - 4)} ${f(y + 2)}q4-8 9 0z" fill="#fff0c7" opacity=".52"/><path d="M${f(x - 2)} ${f(y)}l5 3" stroke="#b58c58" stroke-width="1" opacity=".38"/>`;
  }
  return out;
}

function sparkles(seed) {
  const rng = makeRng(seed + 1401);
  let out = "";
  for (let i = 0; i < 16; i++) {
    const x = 20 + rng() * 216;
    const y = 16 + rng() * 92;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(.8 + rng() * 1.2)}" fill="#ffffff" opacity="${f(.25 + rng() * .35)}"/>`;
  }
  return out;
}

function tracks(seed) {
  const rng = makeRng(seed + 1501);
  let out = "";
  for (let i = 0; i < 7; i++) {
    const x = 66 + i * 14;
    const y = 38 + Math.sin(i) * 8 + rng() * 4;
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="5" ry="2.5" fill="#8cb2c1" opacity=".22" transform="rotate(-22 ${f(x)} ${f(y)})"/>`;
  }
  return out;
}

function gravel(seed) {
  const rng = makeRng(seed + 1601);
  let out = "";
  for (let i = 0; i < 34; i++) {
    const x = 20 + rng() * 216;
    const y = 16 + rng() * 92;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + rng() * 2.5)}" fill="${i % 2 ? "#4d5557" : "#b0b4ae"}" opacity=".45"/>`;
  }
  return out;
}

function hotCracks(seed) {
  return strokes(seed + 1701, "#ff8a2b", 7, 2.4, 0.72) + strokes(seed + 1705, "#ffd166", 3, 1.1, 0.82);
}

function embers(seed) {
  const rng = makeRng(seed + 1801);
  let out = "";
  for (let i = 0; i < 14; i++) {
    const x = 26 + rng() * 204;
    const y = 22 + rng() * 82;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.2 + rng() * 2.2)}" fill="${i % 2 ? "#ff8a2b" : "#ffd166"}" opacity=".72"/>`;
  }
  return out;
}

function lavaFlow(seed) {
  const rng = makeRng(seed + 1901);
  let out = "";
  for (let i = 0; i < 4; i++) {
    const y = 34 + rng() * 50;
    out += `<path d="M28 ${f(y)} q42 ${f(-18 + rng() * 28)} 86 0 t94 1" fill="none" stroke="#b93824" stroke-width="${f(5 + rng() * 5)}" opacity=".48"/>`;
  }
  return out;
}

function burntEdge() {
  return `<path d="M0 64 128 128 256 64" fill="none" stroke="#050403" stroke-opacity=".52" stroke-width="9"/>`;
}

function makeRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shadeColor(color, factor) {
  const normalized = color.replace("#", "");
  const r = Math.max(0, Math.min(255, Math.round(Number.parseInt(normalized.slice(0, 2), 16) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(Number.parseInt(normalized.slice(2, 4), 16) * factor)));
  const b = Math.max(0, Math.min(255, Math.round(Number.parseInt(normalized.slice(4, 6), 16) * factor)));
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hex(value) {
  return value.toString(16).padStart(2, "0");
}

function f(value) {
  return Number(value).toFixed(2);
}
