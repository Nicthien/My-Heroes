import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  throw new Error("Usage: node tmp/imagegen/keep-main-alpha-component.mjs <image.webp> [...]");
}

for (const input of inputs) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const visited = new Uint8Array(pixelCount);
  const components = [];

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (visited[pixel] || data[pixel * 4 + 3] <= 10) continue;
    const stack = [pixel];
    visited[pixel] = 1;
    const pixels = [];

    while (stack.length) {
      const current = stack.pop();
      pixels.push(current);
      const x = current % info.width;
      const y = (current - x) / info.width;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (visited[next] || data[next * 4 + 3] <= 10) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    components.push(pixels);
  }

  components.sort((a, b) => b.length - a.length);
  const keep = new Uint8Array(pixelCount);
  for (const pixel of components[0] ?? []) keep[pixel] = 1;
  let removed = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (!keep[pixel] && data[pixel * 4 + 3] > 0) {
      data[pixel * 4] = 0;
      data[pixel * 4 + 1] = 0;
      data[pixel * 4 + 2] = 0;
      data[pixel * 4 + 3] = 0;
      removed += 1;
    }
  }

  const output = await sharp(data, { raw: info })
    .webp({ lossless: true, quality: 100, effort: 6 })
    .toBuffer();
  const temp = path.join(path.dirname(input), `${path.basename(input)}.tmp`);
  await fs.writeFile(temp, output);
  await fs.unlink(input);
  await fs.rename(temp, input);
  console.log(`${input}: removed ${removed}`);
}
