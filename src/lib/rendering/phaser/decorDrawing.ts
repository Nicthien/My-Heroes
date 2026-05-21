import Phaser from "phaser";
import type { DecorKind } from "@/lib/game/types";
import { drawDiamondPath } from "@/lib/rendering/phaser/pointMath";

export function drawDecorShadow(graphics: Phaser.GameObjects.Graphics, x: number, y: number, kind: DecorKind) {
  const width = kind.includes("tree") ? 18 : kind === "rock-large" ? 20 : 14;
  const alpha = kind === "flower" || kind === "grass-tuft" ? 0.1 : 0.18;
  graphics.fillStyle(0x16210f, alpha);
  graphics.fillEllipse(x, y - 1, width, 7);
}

export function drawPineTree(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  graphics.fillStyle(0x5d3a1f, 1);
  graphics.fillRect(x - 2, y - 8 * scale, 4, 8 * scale);

  drawPineTier(graphics, x, y - 23 * scale, 10 * scale, 0x1f5a2d, 0x2f7a3b);
  drawPineTier(graphics, x, y - 16 * scale, 13 * scale, 0x246a32, 0x3f9148);
  drawPineTier(graphics, x, y - 9 * scale, 16 * scale, 0x2b7a3a, 0x4aa653);
}

export function drawPineTier(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, dark: number, light: number) {
  graphics.fillStyle(dark, 1);
  graphics.fillTriangle(x, y - size, x - size, y + size * 0.45, x + size, y + size * 0.45);
  graphics.fillStyle(light, 0.45);
  graphics.fillTriangle(x - 1, y - size * 0.7, x - size * 0.55, y + size * 0.25, x + 2, y + size * 0.2);
}

export function drawOakTree(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  graphics.fillStyle(0x6d4523, 1);
  graphics.fillRect(x - 2, y - 11 * scale, 4, 11 * scale);
  graphics.fillStyle(0x2f6f32, 1);
  graphics.fillCircle(x - 7 * scale, y - 14 * scale, 7 * scale);
  graphics.fillCircle(x + 6 * scale, y - 15 * scale, 8 * scale);
  graphics.fillCircle(x, y - 20 * scale, 8 * scale);
  graphics.fillStyle(0x4ca64f, 0.55);
  graphics.fillCircle(x - 4 * scale, y - 19 * scale, 4 * scale);
  graphics.fillCircle(x + 4 * scale, y - 17 * scale, 4 * scale);
}

export function drawDeadTree(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  graphics.lineStyle(4, 0x4a2e1b, 1);
  graphics.beginPath();
  graphics.moveTo(x, y);
  graphics.lineTo(x, y - 20 * scale);
  graphics.strokePath();
  graphics.lineStyle(2, 0x6c4628, 1);
  graphics.beginPath();
  graphics.moveTo(x, y - 10 * scale);
  graphics.lineTo(x - 8 * scale, y - 17 * scale);
  graphics.moveTo(x, y - 13 * scale);
  graphics.lineTo(x + 9 * scale, y - 22 * scale);
  graphics.moveTo(x + 1, y - 7 * scale);
  graphics.lineTo(x + 6 * scale, y - 11 * scale);
  graphics.strokePath();
}

export function drawPineGrove(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  drawObstacleBase(graphics, x, y + 1, scale, 0x29471f, 0x182d16, 0x102410);
  drawPineTree(graphics, x - 10 * scale, y + 1, scale * 0.92);
  drawPineTree(graphics, x + 9 * scale, y + 1, scale * 0.98);
  drawPineTree(graphics, x, y - 4 * scale, scale * 1.15);
  graphics.lineStyle(2, 0x123417, 0.75);
  graphics.beginPath();
  graphics.moveTo(x - 17 * scale, y - 4 * scale);
  graphics.lineTo(x, y - 33 * scale);
  graphics.lineTo(x + 18 * scale, y - 4 * scale);
  graphics.strokePath();
}

export function drawOakGrove(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  drawObstacleBase(graphics, x, y + 1, scale, 0x315625, 0x1b3518, 0x132911);
  drawOakTree(graphics, x - 10 * scale, y + 1, scale * 0.9);
  drawOakTree(graphics, x + 9 * scale, y + 1, scale);
  drawOakTree(graphics, x, y - 4 * scale, scale * 1.08);
  graphics.fillStyle(0x173f1d, 0.7);
  graphics.fillEllipse(x, y - 17 * scale, 31 * scale, 21 * scale);
  graphics.fillStyle(0x5da85d, 0.28);
  graphics.fillEllipse(x - 6 * scale, y - 22 * scale, 15 * scale, 8 * scale);
}

export function drawDeadGrove(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  drawObstacleBase(graphics, x, y + 1, scale, 0x4b3522, 0x2b1d13, 0x21150e);
  drawDeadTree(graphics, x - 10 * scale, y + 1, scale * 0.9);
  drawDeadTree(graphics, x + 9 * scale, y + 1, scale);
  drawDeadTree(graphics, x, y - 3 * scale, scale * 1.12);
  graphics.lineStyle(2, 0x21150d, 0.78);
  graphics.beginPath();
  graphics.moveTo(x - 17 * scale, y - 5 * scale);
  graphics.lineTo(x + 16 * scale, y - 7 * scale);
  graphics.strokePath();
}

export function drawBoulderCluster(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  drawObstacleBase(graphics, x, y + 1, scale, 0x62686a, 0x3e4446, 0x2f3538);
  drawRockCluster(graphics, x - 4 * scale, y, scale * 1.1);
  graphics.fillStyle(0x4f5558, 1);
  graphics.fillCircle(x - 13 * scale, y - 5 * scale, 8 * scale);
  graphics.fillStyle(0x777d7e, 1);
  graphics.fillCircle(x + 12 * scale, y - 6 * scale, 9 * scale);
  graphics.fillStyle(0xa5a8a6, 0.42);
  graphics.fillCircle(x + 8 * scale, y - 10 * scale, 3 * scale);
  graphics.lineStyle(2, 0x2b2d2d, 0.9);
  graphics.beginPath();
  graphics.moveTo(x - 21 * scale, y - 2 * scale);
  graphics.lineTo(x - 8 * scale, y - 14 * scale);
  graphics.lineTo(x + 8 * scale, y - 15 * scale);
  graphics.lineTo(x + 22 * scale, y - 3 * scale);
  graphics.strokePath();
}

export function drawObstacleBase(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale: number,
  top: number,
  left: number,
  right: number
) {
  const halfW = 24 * scale;
  const halfH = 11 * scale;
  const drop = 7 * scale;

  graphics.fillStyle(0x070806, 0.32);
  graphics.fillEllipse(x, y + drop + 1, 56 * scale, 14 * scale);

  graphics.fillStyle(left, 1);
  graphics.beginPath();
  graphics.moveTo(x - halfW, y);
  graphics.lineTo(x, y + halfH);
  graphics.lineTo(x, y + halfH + drop);
  graphics.lineTo(x - halfW, y + drop);
  graphics.closePath();
  graphics.fillPath();

  graphics.fillStyle(right, 1);
  graphics.beginPath();
  graphics.moveTo(x + halfW, y);
  graphics.lineTo(x, y + halfH);
  graphics.lineTo(x, y + halfH + drop);
  graphics.lineTo(x + halfW, y + drop);
  graphics.closePath();
  graphics.fillPath();

  graphics.fillStyle(top, 1);
  drawDiamondPath(graphics, x, y);
  graphics.fillPath();
  graphics.lineStyle(1.5, 0x0b1209, 0.78);
  drawDiamondPath(graphics, x, y);
  graphics.strokePath();
}

export function drawRockCluster(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  drawRock(graphics, x - 6 * scale, y - 4 * scale, 7 * scale, 5 * scale, 0x767d80);
  drawRock(graphics, x + 3 * scale, y - 6 * scale, 9 * scale, 7 * scale, 0x8b9294);
  drawRock(graphics, x + 9 * scale, y - 3 * scale, 5 * scale, 4 * scale, 0x686f72);
}

export function drawSmallRock(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  drawRock(graphics, x, y - 4 * scale, 6 * scale, 4 * scale, 0x868d8f);
}

export function drawRock(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, color: number) {
  graphics.fillStyle(color, 1);
  graphics.fillEllipse(x, y, width * 2, height * 2);
  graphics.fillStyle(0xb7bec0, 0.38);
  graphics.fillEllipse(x - width * 0.28, y - height * 0.35, width * 0.72, height * 0.5);
  graphics.lineStyle(1, 0x4f5759, 0.45);
  graphics.strokeEllipse(x, y, width * 2, height * 2);
}

export function drawBush(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  graphics.fillStyle(0x2e682f, 1);
  graphics.fillCircle(x - 6 * scale, y - 5 * scale, 5 * scale);
  graphics.fillCircle(x, y - 8 * scale, 6 * scale);
  graphics.fillCircle(x + 6 * scale, y - 5 * scale, 5 * scale);
  graphics.fillStyle(0x55a34e, 0.45);
  graphics.fillCircle(x - 2 * scale, y - 10 * scale, 3 * scale);
  graphics.fillCircle(x + 5 * scale, y - 7 * scale, 2.5 * scale);
}

export function drawFlowers(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, variant: number) {
  drawGrassTuft(graphics, x, y, scale * 0.85, variant);
  const colors = [0xff6f91, 0xffd166, 0xf6f7a8];
  for (let i = 0; i < 3; i++) {
    const px = x + (i - 1) * 4 * scale + (variant - 1);
    const py = y - (5 + (i % 2) * 2) * scale;
    graphics.fillStyle(colors[(variant + i) % colors.length], 1);
    graphics.fillCircle(px, py, 1.6 * scale);
    graphics.fillStyle(0xfff4b8, 0.7);
    graphics.fillCircle(px - 0.4, py - 0.4, 0.6 * scale);
  }
}

export function drawGrassTuft(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, variant: number) {
  const blades = 5 + variant;
  graphics.lineStyle(1.5, 0x356f2f, 1);
  graphics.beginPath();
  for (let i = 0; i < blades; i++) {
    const offset = (i - (blades - 1) / 2) * 2.2 * scale;
    const lean = (i % 2 === 0 ? -1 : 1) * (1.4 + variant * 0.2) * scale;
    graphics.moveTo(x + offset, y);
    graphics.lineTo(x + offset + lean, y - (5 + (i % 3)) * scale);
  }
  graphics.strokePath();
  graphics.lineStyle(1, 0x6fbf5a, 0.6);
  graphics.beginPath();
  graphics.moveTo(x - 3 * scale, y - 1);
  graphics.lineTo(x - 4 * scale, y - 5 * scale);
  graphics.moveTo(x + 2 * scale, y - 1);
  graphics.lineTo(x + 3 * scale, y - 6 * scale);
  graphics.strokePath();
}
