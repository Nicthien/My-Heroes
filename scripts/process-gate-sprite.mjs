import path from "node:path";
import sharp from "sharp";

// Turn the Gemini gate artwork (painted gray checkerboard, no alpha) into
// clean transparent .webp game sprites. The checkerboard is keyed out by a
// border flood-fill so the gray iron portcullis *inside* the gate is kept.
//
// Source orientation: the wall runs along the screen "/" diagonal (near tower
// lower-left, far tower upper-right). That is perpendicular to a "\" road, for
// which the renderer requests gate-diagonal-up.webp. The mirrored copy serves
// the "/" road (gate-diagonal-down.webp / gate.webp).

const SRC = process.argv[2] ?? "C:/Users/nicol/Downloads/Gemini_Generated_Image_k4bcdvk4bcdvk4bc.png";
const OUT_DIR = path.join(process.cwd(), "public", "assets", "sprites", "map");
const TARGET_H = 248; // logical sprite height after downscale

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const a = new Uint8ClampedArray(data); // working RGBA

const idx = (x, y) => (y * W + x) * 4;
function isChecker(i) {
  const r = a[i], g = a[i + 1], b = a[i + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn <= 26 && mx >= 96 && mn <= 210; // low-saturation gray in checker range
}

// Border flood fill: only checker pixels connected to an edge become transparent.
const seen = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) { stack.push(x, 0, x, H - 1); }
for (let y = 0; y < H; y++) { stack.push(0, y, W - 1, y); }
while (stack.length) {
  const y = stack.pop(), x = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (seen[p]) continue;
  const i = p * 4;
  if (!isChecker(i)) continue;
  seen[p] = 1;
  a[i + 3] = 0;
  stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}

// Feather: opaque pixels touching a hole get partial alpha to kill the gray
// fringe; also neutralise any leftover gray tint on that 1px ring.
const out = new Uint8ClampedArray(a);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4;
    if (a[i + 3] === 0) continue;
    let holeNbr = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || a[(ny * W + nx) * 4 + 3] === 0) holeNbr++;
    }
    if (holeNbr && isChecker(i)) { out[i + 3] = 0; continue; } // stray gray on the edge
    if (holeNbr) out[i + 3] = 150; // soften the silhouette edge
  }

// Tight bounding box of opaque content.
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (out[(y * W + x) * 4 + 3] > 16) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
const bw = maxX - minX + 1, bh = maxY - minY + 1;
console.log(`content bbox ${bw}x${bh} at (${minX},${minY}) of ${W}x${H}`);

const cropped = sharp(Buffer.from(out.buffer), { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: minX, top: minY, width: bw, height: bh });
const scale = TARGET_H / bh;
const finalW = Math.round(bw * scale), finalH = TARGET_H;
const base = cropped.resize(finalW, finalH, { kernel: "lanczos3" });
console.log(`output ${finalW}x${finalH} (aspect ${(finalW / finalH).toFixed(3)})`);

for (const [file, flop] of [
  ["gate-diagonal-up.webp", false],   // wall "/"  → serves "\" road
  ["gate-diagonal-down.webp", true],  // wall "\"  → serves "/" road
  ["gate.webp", true],
]) {
  let img = base.clone();
  if (flop) img = img.flop();
  await img.webp({ lossless: true, effort: 6 }).toFile(path.join(OUT_DIR, file));
  console.log(`wrote ${file}${flop ? " (mirrored)" : ""}`);
}
