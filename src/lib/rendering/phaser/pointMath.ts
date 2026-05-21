import Phaser from "phaser";
import type { Position } from "@/lib/game/types";
import { TILE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";

export function drawDiamondPath(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
  graphics.beginPath();
  graphics.moveTo(x, y - TILE_HEIGHT / 2);
  graphics.lineTo(x + TILE_WIDTH / 2, y);
  graphics.lineTo(x, y + TILE_HEIGHT / 2);
  graphics.lineTo(x - TILE_WIDTH / 2, y);
  graphics.closePath();
}

export function lerpPoint(from: Position, to: Position, amount: number): Position {
  return {
    x: Phaser.Math.Linear(from.x, to.x, amount),
    y: Phaser.Math.Linear(from.y, to.y, amount),
  };
}

export function hashTile(x: number, y: number): number {
  const n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967295;
}

export function pseudoRandom(seed: number, index: number) {
  const value = Math.sin((seed + index * 17.371) * 43758.5453123);
  return value - Math.floor(value);
}
