
const sharp = require('sharp');
const input = process.argv[2];
const output = process.argv[3];
(async () => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  const transparentThreshold = 82;
  const opaqueThreshold = 170;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const a = data[i + 3];
    const dist = Math.hypot(r, g - 255, b);
    let alphaFactor = Math.max(0, Math.min(1, (dist - transparentThreshold) / (opaqueThreshold - transparentThreshold)));
    alphaFactor = alphaFactor * alphaFactor * (3 - 2 * alphaFactor);
    let alpha = Math.round(a * alphaFactor);
    const greenish = g > r + 24 && g > b + 24;
    const maxRb = Math.max(r, b);
    if (greenish) { if (alpha < 238) alpha = 0; g = maxRb; }
    else if (g > maxRb + 18) { const spill = Math.min(1, (g - maxRb - 18) / 180); g = Math.round(g * (1 - spill) + maxRb * spill); }
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = alpha;
  }
  await sharp(out, { raw: info }).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90, alphaQuality: 100, smartSubsample: true }).toFile(output);
})();
