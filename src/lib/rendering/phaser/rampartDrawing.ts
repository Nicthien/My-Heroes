import { lerpPoint } from "@/lib/rendering/phaser/pointMath";
import { Position } from "@/lib/game/types";

/**
 * Pure rampart-drawing helpers extracted from `PhaserMapScene`. They only touch
 * the passed `graphics` object and geometry, so they live as free functions per
 * the renderer's "free function sibling" convention.
 */

export function drawRampartFace(
  graphics: Phaser.GameObjects.Graphics,
  topA: Position,
  topB: Position,
  bottomA: Position,
  bottomB: Position,
  color: number
) {
  graphics.fillStyle(color, 1);
  graphics.lineStyle(1, 0x2f2922, 0.72);
  graphics.beginPath();
  graphics.moveTo(topA.x, topA.y);
  graphics.lineTo(topB.x, topB.y);
  graphics.lineTo(bottomB.x, bottomB.y);
  graphics.lineTo(bottomA.x, bottomA.y);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();

  graphics.lineStyle(1, 0x2b261f, 0.28);
  for (const t of [0.28, 0.52, 0.76]) {
    const left = lerpPoint(topA, bottomA, t);
    const right = lerpPoint(topB, bottomB, t);
    graphics.beginPath();
    graphics.moveTo(left.x + 2, left.y);
    graphics.lineTo(right.x - 2, right.y);
    graphics.strokePath();
  }

  graphics.lineStyle(1, 0xd4c69f, 0.18);
  const highlightA = lerpPoint(topA, bottomA, 0.12);
  const highlightB = lerpPoint(topB, bottomB, 0.12);
  graphics.beginPath();
  graphics.moveTo(highlightA.x + 2, highlightA.y);
  graphics.lineTo(highlightB.x - 2, highlightB.y);
  graphics.strokePath();
}

export function drawRampartTopStones(
  graphics: Phaser.GameObjects.Graphics,
  topA: Position,
  topB: Position,
  topC: Position,
  topD: Position
) {
  graphics.lineStyle(1, 0x594f40, 0.45);
  for (const t of [0.25, 0.5, 0.75]) {
    const near = lerpPoint(topD, topC, t);
    const far = lerpPoint(topA, topB, t);
    graphics.beginPath();
    graphics.moveTo(near.x, near.y);
    graphics.lineTo(far.x, far.y);
    graphics.strokePath();
  }

  graphics.lineStyle(1, 0xd9cba4, 0.28);
  graphics.beginPath();
  graphics.moveTo(topA.x + (topB.x - topA.x) * 0.08, topA.y + (topB.y - topA.y) * 0.08 + 1);
  graphics.lineTo(topA.x + (topB.x - topA.x) * 0.92, topA.y + (topB.y - topA.y) * 0.92 + 1);
  graphics.strokePath();
}

export function drawRampartCrenels(
  graphics: Phaser.GameObjects.Graphics,
  topA: Position,
  topB: Position,
  topC: Position,
  topD: Position,
  count: number
) {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : (i + 0.5) / count;
    const front = lerpPoint(topD, topC, t);
    const back = lerpPoint(topA, topB, t);
    const center = lerpPoint(front, back, 0.22);
    drawRampartCrenel(graphics, center.x, center.y - 8);
  }
}

function drawRampartCrenel(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
  const top = { x, y: y - 10 };
  const right = { x: x + 7, y: y - 6 };
  const bottom = { x, y: y - 1 };
  const left = { x: x - 7, y: y - 6 };
  const drop = 11;

  drawRampartFace(graphics, left, bottom, { x: left.x, y: left.y + drop }, { x: bottom.x, y: bottom.y + drop }, 0x6d6556);
  drawRampartFace(graphics, bottom, right, { x: bottom.x, y: bottom.y + drop }, { x: right.x, y: right.y + drop }, 0x514a40);

  graphics.fillStyle(0xb0a286, 1);
  graphics.lineStyle(1, 0x302921, 0.9);
  graphics.beginPath();
  graphics.moveTo(top.x, top.y);
  graphics.lineTo(right.x, right.y);
  graphics.lineTo(bottom.x, bottom.y);
  graphics.lineTo(left.x, left.y);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}
