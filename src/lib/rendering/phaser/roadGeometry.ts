import Phaser from "phaser";
import type { Position, RoadType } from "@/lib/game/types";
import { ROAD_TEXTURES } from "@/lib/rendering/phaser/assets";
import { TILE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";
import {
  ROAD_STAMP_MASK_BY_SIDE,
  ROAD_TEXTURE_BITS,
  type RoadSide,
  type RoadStampSpec,
} from "@/lib/rendering/phaser/roadConstants";

export function getRoadStampSpec(kind: RoadType | "bridge", side: RoadSide): RoadStampSpec {
  const mask = ROAD_STAMP_MASK_BY_SIDE[side];
  const texturePath = ROAD_TEXTURES[kind][mask];

  if (kind === "paved") {
    return {
      texturePath,
      cropX: mask === 5 ? 38 : 30,
      cropY: 17,
      cropWidth: 58,
      cropHeight: 24,
      displayWidth: 44,
      displayHeight: 18,
      alpha: 0.92,
    };
  }

  if (kind === "bridge") {
    return {
      texturePath,
      cropX: mask === 5 ? 32 : 24,
      cropY: 18,
      cropWidth: 64,
      cropHeight: 28,
      displayWidth: 48,
      displayHeight: 21,
      alpha: 0.95,
    };
  }

  return {
    texturePath,
    cropX: mask === 5 ? 34 : 26,
    cropY: 18,
    cropWidth: 64,
    cropHeight: 28,
    displayWidth: kind === "gravel" ? 46 : 47,
    displayHeight: kind === "gravel" ? 20 : 21,
    alpha: 0.9,
  };
}

export function getRoadCenterStampSpec(kind: RoadType | "bridge", connections: RoadSide[]): RoadStampSpec {
  const mask = connections.reduce((value, side) => value | ROAD_TEXTURE_BITS[side], 0);
  const texturePath = ROAD_TEXTURES[kind][mask] ?? ROAD_TEXTURES[kind][5];

  if (kind === "paved") {
    return {
      texturePath,
      cropX: 40,
      cropY: 16,
      cropWidth: 48,
      cropHeight: 28,
      displayWidth: 31,
      displayHeight: 18,
      alpha: 0.96,
    };
  }

  if (kind === "bridge") {
    return {
      texturePath,
      cropX: 38,
      cropY: 15,
      cropWidth: 52,
      cropHeight: 30,
      displayWidth: 34,
      displayHeight: 20,
      alpha: 0.96,
    };
  }

  return {
    texturePath,
    cropX: 38,
    cropY: 16,
    cropWidth: 52,
    cropHeight: 30,
    displayWidth: kind === "gravel" ? 33 : 34,
    displayHeight: kind === "gravel" ? 19 : 20,
    alpha: 0.94,
  };
}

export function getRoadAnchorPoints(x: number, y: number): Record<RoadSide, Position> {
  return {
    NE: { x: x + TILE_WIDTH * 0.25, y: y - TILE_HEIGHT * 0.25 },
    SE: { x: x + TILE_WIDTH * 0.25, y: y + TILE_HEIGHT * 0.25 },
    SW: { x: x - TILE_WIDTH * 0.25, y: y + TILE_HEIGHT * 0.25 },
    NW: { x: x - TILE_WIDTH * 0.25, y: y - TILE_HEIGHT * 0.25 },
  };
}

export function getRoadVector(from: Position, to: Position) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    direction: { x: dx / length, y: dy / length },
    normal: { x: -dy / length, y: dx / length },
    length,
  };
}

export function extendRoadPoint(from: Position, to: Position, amount: number): Position {
  const vector = getRoadVector(from, to);
  return {
    x: to.x + vector.direction.x * amount,
    y: to.y + vector.direction.y * amount,
  };
}

export function offsetPoint(point: Position, offset: Position): Position {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

export function scalePoint(point: Position, amount: number): Position {
  return {
    x: point.x * amount,
    y: point.y * amount,
  };
}

export function fillRoadStrip(
  graphics: Phaser.GameObjects.Graphics,
  from: Position,
  to: Position,
  halfWidth: number,
  color: number,
  alpha: number
) {
  const vector = getRoadVector(from, to);
  const normal = scalePoint(vector.normal, halfWidth);
  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(from.x + normal.x, from.y + normal.y);
  graphics.lineTo(to.x + normal.x, to.y + normal.y);
  graphics.lineTo(to.x - normal.x, to.y - normal.y);
  graphics.lineTo(from.x - normal.x, from.y - normal.y);
  graphics.closePath();
  graphics.fillPath();
}
