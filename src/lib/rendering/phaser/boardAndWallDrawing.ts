import Phaser from "phaser";
import type { Position } from "@/lib/game/types";
import { getPolygonCenter } from "@/lib/rendering/phaser/mapRenderHelpers";
import { hashTile, lerpPoint } from "@/lib/rendering/phaser/pointMath";
import type { RoadRenderStyle } from "@/lib/rendering/phaser/roadConstants";
import { fillRoadStrip, offsetPoint } from "@/lib/rendering/phaser/roadGeometry";

export function drawRoadSegment(
  graphics: Phaser.GameObjects.Graphics,
  start: Position,
  end: Position,
  style: RoadRenderStyle
) {
  const shadowOffset = { x: 0, y: 1.3 };
  fillRoadStrip(graphics, offsetPoint(start, shadowOffset), offsetPoint(end, shadowOffset), style.halfWidth + style.outline * 0.45, 0x000000, style.shadowAlpha);
  fillRoadStrip(graphics, start, end, style.halfWidth + style.outline, style.edge, 1);
  fillRoadStrip(graphics, start, end, style.halfWidth, style.fill, 1);
  fillRoadStrip(graphics, start, end, style.halfWidth * 0.2, style.highlight, 0.12);
}

export function drawWoodGrain(graphics: Phaser.GameObjects.Graphics, outer: Position[], inner: Position[]) {
  const grainColor = 0x2d1709;
  const highlightColor = 0xb98245;

  for (let i = 0; i < outer.length; i++) {
    const next = (i + 1) % outer.length;
    const edgeLength = Phaser.Math.Distance.Between(outer[i].x, outer[i].y, outer[next].x, outer[next].y);
    const plankCount = Math.max(3, Math.floor(edgeLength / 72));

    for (let p = 1; p < plankCount; p++) {
      const t = p / plankCount;
      const outside = lerpPoint(outer[i], outer[next], t);
      const inside = lerpPoint(inner[i], inner[next], t);
      graphics.lineStyle(1, grainColor, 0.34);
      graphics.beginPath();
      graphics.moveTo(outside.x, outside.y);
      graphics.lineTo(inside.x, inside.y);
      graphics.strokePath();
    }

    const grainLines = Math.max(4, Math.floor(edgeLength / 46));
    for (let g = 0; g < grainLines; g++) {
      const t = (g + 0.5) / grainLines;
      const outside = lerpPoint(outer[i], outer[next], t);
      const inside = lerpPoint(inner[i], inner[next], t);
      const start = lerpPoint(outside, inside, 0.24 + hashTile(i, g) * 0.14);
      const end = lerpPoint(outside, inside, 0.66 + hashTile(g, i) * 0.14);
      const bow = (hashTile(i + 9, g + 3) - 0.5) * 8;

      graphics.lineStyle(1, g % 3 === 0 ? highlightColor : grainColor, g % 3 === 0 ? 0.2 : 0.3);
      graphics.beginPath();
      graphics.moveTo(start.x, start.y);
      graphics.lineTo((start.x + end.x) / 2 + bow, (start.y + end.y) / 2 - bow * 0.35);
      graphics.lineTo(end.x, end.y);
      graphics.strokePath();
    }
  }
}

export function drawCornerBolts(graphics: Phaser.GameObjects.Graphics, outer: Position[]) {
  const center = getPolygonCenter(outer);
  for (const corner of outer) {
    const bolt = lerpPoint(corner, center, 0.12);
    graphics.fillStyle(0x2b1a10, 0.9);
    graphics.fillCircle(bolt.x, bolt.y, 4);
    graphics.fillStyle(0xd0a66d, 0.35);
    graphics.fillCircle(bolt.x - 1, bolt.y - 1, 1.5);
  }
}
export function drawNaturalWallStructuralFace(
  graphics: Phaser.GameObjects.Graphics,
  topA: Position,
  topB: Position,
  bottomA: Position,
  bottomB: Position,
  color: number,
  alpha: number
) {
  graphics.fillStyle(color, alpha);
  graphics.lineStyle(0.8, 0x0f2410, 0.24);
  graphics.beginPath();
  graphics.moveTo(topA.x, topA.y);
  graphics.lineTo(topB.x, topB.y);
  graphics.lineTo(bottomB.x, bottomB.y);
  graphics.lineTo(bottomA.x, bottomA.y);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();

  graphics.fillStyle(0x0d260f, 0.18);
  graphics.fillEllipse((topA.x + topB.x + bottomA.x + bottomB.x) / 4, (topA.y + topB.y + bottomA.y + bottomB.y) / 4 + 4, 24, 12);
}

export function drawNaturalWallFace(
  graphics: Phaser.GameObjects.Graphics,
  topA: Position,
  topB: Position,
  bottomA: Position,
  bottomB: Position,
  color: number,
  alpha: number
) {
  graphics.fillStyle(color, alpha * 0.28);
  graphics.lineStyle(0.8, 0x13280f, 0.28);
  graphics.beginPath();
  graphics.moveTo(topA.x, topA.y);
  graphics.lineTo(topB.x, topB.y);
  graphics.lineTo(bottomB.x, bottomB.y);
  graphics.lineTo(bottomA.x, bottomA.y);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();

  const leafColors = [color, 0x3f7d38, 0x6ba851, 0x224a22];
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    const top = lerpPoint(topA, topB, t);
    const bottom = lerpPoint(bottomA, bottomB, t);
    const center = lerpPoint(top, bottom, 0.34 + (i % 3) * 0.16);
    const wobble = (i % 2 === 0 ? -1 : 1) * 3;
    graphics.fillStyle(leafColors[i % leafColors.length], 0.72);
    graphics.fillEllipse(center.x + wobble, center.y, 18 - (i % 3) * 2, 11 + (i % 2) * 3);
    graphics.fillStyle(0xb7df8a, 0.16);
    graphics.fillEllipse(center.x - 4 + wobble, center.y - 3, 8, 4);
  }

  graphics.lineStyle(1.2, 0x143010, 0.24);
  graphics.beginPath();
  for (const t of [0.24, 0.52, 0.78]) {
    const a = lerpPoint(topA, bottomA, t);
    const b = lerpPoint(topB, bottomB, t + 0.04);
    graphics.moveTo(a.x, a.y);
    graphics.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 3);
    graphics.lineTo(b.x, b.y);
  }
  graphics.strokePath();
}

export function drawNaturalWallCrown(
  graphics: Phaser.GameObjects.Graphics,
  north: Position,
  east: Position,
  south: Position,
  west: Position,
  jitter: number
) {
  const center = getPolygonCenter([north, east, south, west]);
  graphics.fillStyle(0x183c1a, 0.48);
  graphics.beginPath();
  graphics.moveTo(north.x, north.y + 8 - jitter * 2);
  graphics.lineTo((north.x + east.x) / 2 + 6, (north.y + east.y) / 2 - 8);
  graphics.lineTo(east.x - 5, east.y + 5);
  graphics.lineTo((east.x + south.x) / 2 + 7, (east.y + south.y) / 2 + 4);
  graphics.lineTo(south.x + 2, south.y + 4);
  graphics.lineTo((south.x + west.x) / 2 - 4, (south.y + west.y) / 2 + 9);
  graphics.lineTo(west.x + 5, west.y + 4);
  graphics.lineTo((west.x + north.x) / 2 - 8, (west.y + north.y) / 2 - 4);
  graphics.closePath();
  graphics.fillPath();

  graphics.fillStyle(0x77b65a, 0.2);
  graphics.fillEllipse(center.x - 3, center.y + 2, 44, 22);
}

export function drawNaturalWallTop(
  graphics: Phaser.GameObjects.Graphics,
  north: Position,
  east: Position,
  south: Position,
  west: Position,
  jitter: number
) {
  const center = getPolygonCenter([north, east, south, west]);
  const blobs = [
    { x: north.x, y: north.y + 12, w: 20, h: 13, c: 0x6aa34d },
    { x: west.x + 17, y: west.y + 5, w: 23, h: 15, c: 0x578f43 },
    { x: center.x - 8, y: center.y - 1, w: 28, h: 18, c: 0x73ad55 },
    { x: center.x + 10, y: center.y + 1 + jitter * 2, w: 28, h: 18, c: 0x619b49 },
    { x: east.x - 16, y: east.y + 6, w: 23, h: 15, c: 0x79b85a },
    { x: south.x - 6, y: south.y - 8, w: 30, h: 17, c: 0x4f823e },
    { x: south.x + 9, y: south.y - 7, w: 24, h: 14, c: 0x5d9446 },
  ];

  for (const blob of blobs) {
    graphics.fillStyle(0x142a12, 0.5);
    graphics.fillEllipse(blob.x, blob.y + 1, blob.w + 3, blob.h + 3);
    graphics.fillStyle(blob.c, 1);
    graphics.fillEllipse(blob.x, blob.y, blob.w, blob.h);
    graphics.fillStyle(0x9fca7b, 0.24);
    graphics.fillEllipse(blob.x - blob.w * 0.16, blob.y - blob.h * 0.18, blob.w * 0.45, blob.h * 0.34);
  }

  graphics.fillStyle(0x2f5f2b, 0.38);
  graphics.fillEllipse(center.x - 2, center.y + 9, 34, 9);

  graphics.fillStyle(0xb7dd8d, 0.78);
  graphics.fillCircle(west.x + 15, west.y + 3, 2);
  graphics.fillCircle(east.x - 13, east.y + 4 + jitter * 2, 1.7);
  graphics.fillCircle(center.x + 4, center.y - 5, 1.8);

  graphics.lineStyle(1.4, 0xc4e79b, 0.34);
  graphics.beginPath();
  graphics.moveTo(west.x + 13, west.y + 3);
  graphics.lineTo(center.x - 1, center.y - 6);
  graphics.lineTo(east.x - 11, east.y + 3);
  graphics.strokePath();
}
