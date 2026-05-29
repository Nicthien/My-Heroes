import Phaser from "phaser";
import { DecorKind, MapTile, TerrainType } from "@/lib/game/types";
import { TERRAIN_TOP_TEXTURE_CROP_INSET } from "@/lib/rendering/phaser/mapRenderSettings";
import { hashTile } from "@/lib/rendering/phaser/pointMath";

export function getTerrainTopTextureTransform(tile: MapTile) {
  const value = Math.floor(hashTile(tile.x + 101, tile.y + 211) * 8);
  return {
    angle: value >= 4 ? 180 : 0,
    flipX: value % 2 === 1,
    flipY: value % 4 >= 2,
  };
}

export function applyTerrainTopTextureCrop(sprite: Phaser.GameObjects.Image) {
  const frameWidth = sprite.frame.width;
  const frameHeight = sprite.frame.height;
  const cropInsetX = Math.min(TERRAIN_TOP_TEXTURE_CROP_INSET, Math.max(0, Math.floor(frameWidth / 8)));
  const cropInsetY = Math.min(TERRAIN_TOP_TEXTURE_CROP_INSET, Math.max(0, Math.floor(frameHeight / 8)));

  if (cropInsetX <= 0 && cropInsetY <= 0) return;

  const cropWidth = Math.max(1, frameWidth - cropInsetX * 2);
  const cropHeight = Math.max(1, frameHeight - cropInsetY * 2);
  sprite.setCrop(cropInsetX, cropInsetY, cropWidth, cropHeight);
}

export function drawTileTexture(graphics: Phaser.GameObjects.Graphics, tile: MapTile, isoX: number, isoY: number) {
  const jitter = hashTile(tile.x, tile.y);
  if (tile.terrain === TerrainType.WATER) {
    graphics.lineStyle(1, 0x6fb7d8, 0.22);
    graphics.beginPath();
    graphics.moveTo(isoX - 13, isoY - 1 + jitter * 2);
    graphics.lineTo(isoX + 13, isoY - 1 + jitter * 2);
    graphics.moveTo(isoX - 8, isoY + 5 - jitter * 2);
    graphics.lineTo(isoX + 8, isoY + 5 - jitter * 2);
    graphics.strokePath();
    return;
  }

  if (tile.terrain === TerrainType.SAND) {
    graphics.fillStyle(0x7b5b37, 0.18);
    graphics.fillCircle(isoX - 8 + jitter * 4, isoY + 3, 1.5);
    graphics.fillCircle(isoX + 7, isoY - 4 + jitter * 3, 1.2);
    drawScenicDecorTexture(graphics, tile, isoX, isoY, jitter);
    return;
  }

  if (tile.terrain === TerrainType.MOUNTAIN) {
    graphics.lineStyle(1, 0x3f3f3f, 0.32);
    graphics.beginPath();
    graphics.moveTo(isoX - 12, isoY + 3);
    graphics.lineTo(isoX - 2, isoY - 7);
    graphics.lineTo(isoX + 10, isoY + 4);
    graphics.strokePath();
    drawScenicDecorTexture(graphics, tile, isoX, isoY, jitter);
    return;
  }

  if (tile.terrain === TerrainType.FOREST) {
    graphics.fillStyle(0x17461f, 0.24);
    graphics.fillCircle(isoX - 7, isoY, 3);
    graphics.fillCircle(isoX + 4, isoY - 3, 2.5);
    drawScenicDecorTexture(graphics, tile, isoX, isoY, jitter);
    return;
  }

  if (tile.terrain === TerrainType.LAVA) {
    graphics.lineStyle(2, 0xff5a1f, 0.35);
    graphics.beginPath();
    graphics.moveTo(isoX - 11, isoY + 2);
    graphics.lineTo(isoX - 2, isoY - 2);
    graphics.lineTo(isoX + 9, isoY + 3);
    graphics.strokePath();
    return;
  }

  drawScenicDecorTexture(graphics, tile, isoX, isoY, jitter);
}

export function isAllowedDecor(kind: DecorKind) {
  return (
    kind === "tree-pine" ||
    kind === "tree-oak" ||
    kind === "tree-dead" ||
    kind === "bramble-thicket" ||
    kind === "fallen-log-barricade" ||
    kind === "willow-swamp-grove" ||
    kind === "birch-grove" ||
    kind === "deadwood-thicket" ||
    kind === "flowering-hedge" ||
    kind === "grass-oak-copse" ||
    kind === "grass-bramble-mound" ||
    kind === "grass-flowering-hedge" ||
    kind === "grass-reed-thicket" ||
    kind === "grass-root-barricade" ||
    kind === "grass-sapling-grove" ||
    kind === "forest-pine-grove" ||
    kind === "forest-broadleaf-grove" ||
    kind === "forest-underwood-thicket" ||
    kind === "forest-stump-ferns" ||
    kind === "forest-birch-pine-screen" ||
    kind === "forest-deadfall" ||
    kind === "dirt-thorn-scrub" ||
    kind === "dirt-dead-brush" ||
    kind === "dirt-dry-log-barrier" ||
    kind === "dirt-root-snarl" ||
    kind === "dirt-cactus-brush" ||
    kind === "dirt-bramble-ravine" ||
    kind === "sand-cactus-cluster" ||
    kind === "sand-desert-scrub" ||
    kind === "sand-palm-stump" ||
    kind === "sand-agave-barrier" ||
    kind === "sand-tumbleweed-heap" ||
    kind === "sand-saltbush-clump" ||
    kind === "snow-pine-grove" ||
    kind === "snow-birch-thicket" ||
    kind === "snow-deadwood-barrier" ||
    kind === "snow-bramble-mound" ||
    kind === "snow-evergreen-drift" ||
    kind === "snow-shrub-wall" ||
    kind === "mountain-pine-rock" ||
    kind === "mountain-cliff-brush" ||
    kind === "mountain-deadwood" ||
    kind === "mountain-mossy-roots" ||
    kind === "mountain-fir-grove" ||
    kind === "mountain-rhododendron" ||
    kind === "swamp-willow-grove" ||
    kind === "swamp-mangrove-tangle" ||
    kind === "swamp-reed-thicket" ||
    kind === "swamp-cypress-cluster" ||
    kind === "swamp-bog-bramble" ||
    kind === "swamp-fungus-log" ||
    kind === "lava-charred-thorns" ||
    kind === "lava-ember-roots" ||
    kind === "lava-ash-fungus" ||
    kind === "lava-scorched-deadwood" ||
    kind === "lava-sulfur-shrub" ||
    kind === "lava-obsidian-bramble" ||
    kind === "underground-stalagmite-cluster" ||
    kind === "underground-crystal-ribs" ||
    kind === "underground-mushroom-thicket" ||
    kind === "underground-rubble-pillar" ||
    kind === "underground-root-snarl" ||
    kind === "massif-mountain-granite-2x2" ||
    kind === "massif-mountain-snowcap-2x2" ||
    kind === "massif-mountain-pine-2x2" ||
    kind === "massif-mountain-volcanic-2x2" ||
    kind === "massif-mountain-desert-2x2" ||
    kind === "massif-mountain-mossy-2x2" ||
    kind === "rock-large" ||
    kind === "rock-small" ||
    kind === "boulder-cluster" ||
    kind === "bush" ||
    kind === "flower" ||
    kind === "grass-tuft"
  );
}

function drawScenicDecorTexture(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  isoX: number,
  isoY: number,
  jitter: number
) {
  const decor = tile.decor;
  if (!decor || decor.blocking || !isAllowedDecor(decor.type)) return;

  const variant = decor.variant ?? 0;
  const offset = ((variant % 3) - 1) * 3;
  const lean = jitter > 0.5 ? 1 : -1;

  switch (decor.type) {
    case "tree-pine":
      drawNeedleTexture(graphics, isoX + offset, isoY, lean);
      break;
    case "tree-oak":
      drawLeafTexture(graphics, isoX + offset, isoY, 0x2f7a34, 0x7fc96a);
      break;
    case "tree-dead":
      drawTwigTexture(graphics, isoX + offset, isoY, lean);
      break;
    case "rock-large":
      drawRockTexture(graphics, isoX + offset, isoY, 1);
      break;
    case "rock-small":
      drawRockTexture(graphics, isoX + offset, isoY, 0.62);
      break;
    case "bush":
      drawLeafTexture(graphics, isoX + offset, isoY + 1, 0x2d7430, 0x9ad877);
      break;
    case "flower":
      drawFlowerTexture(graphics, isoX + offset, isoY, variant);
      break;
    case "grass-tuft":
      drawGrassTexture(graphics, isoX + offset, isoY, variant);
      break;
  }
}

function drawNeedleTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, lean: number) {
  graphics.fillStyle(0x174d22, 0.28);
  graphics.fillEllipse(isoX, isoY + 3, 30, 9);
  graphics.lineStyle(2, 0x2f8b3f, 0.6);
  graphics.beginPath();
  graphics.moveTo(isoX - 16, isoY + 4);
  graphics.lineTo(isoX - 6 + lean, isoY - 4);
  graphics.lineTo(isoX + 3, isoY + 5);
  graphics.moveTo(isoX - 6, isoY + 6);
  graphics.lineTo(isoX + 6 + lean, isoY - 5);
  graphics.lineTo(isoX + 17, isoY + 4);
  graphics.strokePath();
  graphics.lineStyle(1, 0xa8d483, 0.22);
  graphics.beginPath();
  graphics.moveTo(isoX - 12, isoY + 2);
  graphics.lineTo(isoX + 13, isoY + 2);
  graphics.strokePath();
}

function drawLeafTexture(
  graphics: Phaser.GameObjects.Graphics,
  isoX: number,
  isoY: number,
  baseColor: number,
  highlightColor: number
) {
  graphics.fillStyle(0x0d2a12, 0.2);
  graphics.fillEllipse(isoX, isoY + 4, 32, 9);
  graphics.fillStyle(baseColor, 0.42);
  graphics.fillCircle(isoX - 9, isoY + 1, 5);
  graphics.fillCircle(isoX + 1, isoY - 3, 6);
  graphics.fillCircle(isoX + 11, isoY + 2, 4.5);
  graphics.fillEllipse(isoX + 1, isoY + 4, 25, 8);
  graphics.fillStyle(highlightColor, 0.22);
  graphics.fillCircle(isoX - 3, isoY - 4, 2.2);
  graphics.fillCircle(isoX + 9, isoY, 1.8);
}

function drawTwigTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, lean: number) {
  graphics.fillStyle(0x1f130b, 0.18);
  graphics.fillEllipse(isoX, isoY + 5, 34, 7);
  graphics.lineStyle(2, 0x6f4b2d, 0.62);
  graphics.beginPath();
  graphics.moveTo(isoX - 15, isoY + 4);
  graphics.lineTo(isoX - 4, isoY - 2);
  graphics.lineTo(isoX + 13, isoY + 4);
  graphics.moveTo(isoX - 4, isoY - 2);
  graphics.lineTo(isoX + lean * 2, isoY - 9);
  graphics.moveTo(isoX + 4, isoY + 1);
  graphics.lineTo(isoX + 14, isoY - 5);
  graphics.strokePath();
  graphics.lineStyle(1, 0xb98955, 0.32);
  graphics.beginPath();
  graphics.moveTo(isoX - 10, isoY + 2);
  graphics.lineTo(isoX + 8, isoY + 3);
  graphics.strokePath();
}

function drawRockTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, scale: number) {
  drawFlatRock(graphics, isoX - 9 * scale, isoY + 2, 9 * scale, 4 * scale, 0x7d8587);
  drawFlatRock(graphics, isoX + 3 * scale, isoY - 2, 12 * scale, 5 * scale, 0xa1aaa9);
  drawFlatRock(graphics, isoX + 13 * scale, isoY + 4, 7 * scale, 3.5 * scale, 0x626b6e);
}

function drawFlatRock(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number
) {
  graphics.fillStyle(0x101516, 0.16);
  graphics.fillEllipse(x, y + height * 0.8, width * 2, height * 1.2);
  graphics.fillStyle(color, 0.72);
  graphics.beginPath();
  graphics.moveTo(x - width, y + height * 0.2);
  graphics.lineTo(x - width * 0.35, y - height);
  graphics.lineTo(x + width * 0.35, y - height * 0.75);
  graphics.lineTo(x + width, y);
  graphics.lineTo(x + width * 0.55, y + height);
  graphics.lineTo(x - width * 0.55, y + height);
  graphics.closePath();
  graphics.fillPath();
  graphics.fillStyle(0xffffff, 0.16);
  graphics.fillCircle(x - width * 0.25, y - height * 0.35, Math.max(1, height * 0.25));
}

function drawFlowerTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, variant: number) {
  drawGrassTexture(graphics, isoX, isoY, variant);
  const colors = [0xff7da2, 0xffd166, 0x9ad7ff, 0xf6f7a8];
  const points = [
    [isoX - 9, isoY + 2],
    [isoX - 1, isoY - 2],
    [isoX + 8, isoY + 3],
    [isoX + 15, isoY + 6],
  ];
  for (let i = 0; i < points.length; i++) {
    graphics.fillStyle(colors[(i + variant) % colors.length], 0.88);
    graphics.fillCircle(points[i][0], points[i][1], 1.4);
  }
}

function drawGrassTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, variant: number) {
  graphics.fillStyle(0x0a2a0d, 0.14);
  graphics.fillEllipse(isoX, isoY + 6, 32, 6);
  graphics.lineStyle(1, 0x2f7d34, 0.7);
  graphics.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = isoX - 16 + i * 4;
    const h = 5 + ((i + variant) % 4);
    const lean = i % 2 === 0 ? -2 : 2;
    graphics.moveTo(x, isoY + 6);
    graphics.lineTo(x + lean, isoY + 6 - h);
  }
  graphics.strokePath();
  graphics.lineStyle(1, 0x9bd36d, 0.22);
  graphics.beginPath();
  graphics.moveTo(isoX - 13, isoY + 4);
  graphics.lineTo(isoX + 13, isoY + 5);
  graphics.strokePath();
}
