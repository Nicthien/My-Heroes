import Phaser from "phaser";
import type { Position } from "@/lib/game/types";
import { TILE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";
import {
  FOG_STAMP_HEIGHT,
  FOG_STAMP_TEXTURE_KEYS,
  FOG_STAMP_WIDTH,
  type FogEdgeSide,
  type FogStampKey,
} from "@/lib/rendering/phaser/fogConstants";
import { lerpPoint } from "@/lib/rendering/phaser/pointMath";

export function generateFogStampTextures(scene: Phaser.Scene) {
  const centerX = FOG_STAMP_WIDTH / 2;
  const centerY = FOG_STAMP_HEIGHT / 2;

  for (const [stampKey, textureKey] of Object.entries(FOG_STAMP_TEXTURE_KEYS) as [FogStampKey, string][]) {
    if (scene.textures.exists(textureKey)) continue;

    const graphics = scene.add.graphics();
    switch (stampKey) {
      case "fog-near":
        drawFogNearTileVisual(graphics, centerX, centerY);
        break;
      case "fog-unexplored":
        drawFogTileVisual(graphics, centerX, centerY, false);
        break;
      case "fog-explored":
        drawFogTileVisual(graphics, centerX, centerY, true);
        break;
      case "fog-edge-nw":
        drawFogFrontierEdgeVisual(graphics, centerX, centerY, "northWest");
        break;
      case "fog-edge-ne":
        drawFogFrontierEdgeVisual(graphics, centerX, centerY, "northEast");
        break;
      case "fog-edge-se":
        drawFogFrontierEdgeVisual(graphics, centerX, centerY, "southEast");
        break;
      case "fog-edge-sw":
        drawFogFrontierEdgeVisual(graphics, centerX, centerY, "southWest");
        break;
    }
    graphics.generateTexture(textureKey, FOG_STAMP_WIDTH, FOG_STAMP_HEIGHT);
    graphics.destroy();
  }
}

function drawFogTileVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, explored: boolean) {
  if (explored) {
    graphics.fillStyle(0x000000, 0.28);
    drawFogDiamondPath(graphics, x, y, 0);
    graphics.fillPath();
  } else {
    const jitter = 0.5;
    graphics.fillStyle(0x010205, 1);
    drawFogDiamondPath(graphics, x, y, 4);
    graphics.fillPath();

    graphics.fillStyle(0x030611, 1);
    graphics.fillEllipse(x - 12 + jitter * 18, y - 4, 44, 17);
    graphics.fillEllipse(x + 10 - jitter * 16, y + 5, 36, 13);

    graphics.lineStyle(1, 0x0a1020, 0.9);
    drawFogDiamondPath(graphics, x, y, 4);
    graphics.strokePath();
  }
}

function drawFogNearTileVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
  graphics.fillStyle(0x000000, 0.18);
  drawFogDiamondPath(graphics, x, y, 0);
  graphics.fillPath();
}

function drawFogFrontierEdgeVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, side: FogEdgeSide) {
  const points = getDiamondPoints(x, y);
  const edge = getFogEdge(points, side);

  fillEdgeStrip(graphics, edge.a, edge.b, { x, y }, 0.42, 0xb9c9d0, 0.06);
  fillEdgeStrip(graphics, edge.a, edge.b, { x, y }, 0.26, 0x6f8490, 0.08);
  fillEdgeStrip(graphics, edge.a, edge.b, { x, y }, 0.12, 0xf4fbff, 0.04);
}

function drawFogDiamondPath(graphics: Phaser.GameObjects.Graphics, x: number, y: number, padding: number) {
  graphics.beginPath();
  graphics.moveTo(x, y - TILE_HEIGHT / 2 - padding * 0.5);
  graphics.lineTo(x + TILE_WIDTH / 2 + padding, y);
  graphics.lineTo(x, y + TILE_HEIGHT / 2 + padding * 0.5);
  graphics.lineTo(x - TILE_WIDTH / 2 - padding, y);
  graphics.closePath();
}

function getDiamondPoints(x: number, y: number) {
  return {
    north: { x, y: y - TILE_HEIGHT / 2 },
    east: { x: x + TILE_WIDTH / 2, y },
    south: { x, y: y + TILE_HEIGHT / 2 },
    west: { x: x - TILE_WIDTH / 2, y },
  };
}

function getFogEdge(points: ReturnType<typeof getDiamondPoints>, side: FogEdgeSide) {
  switch (side) {
    case "northWest":
      return { a: points.north, b: points.west };
    case "northEast":
      return { a: points.north, b: points.east };
    case "southEast":
      return { a: points.east, b: points.south };
    case "southWest":
      return { a: points.south, b: points.west };
  }
}

function fillEdgeStrip(
  graphics: Phaser.GameObjects.Graphics,
  a: Position,
  b: Position,
  center: Position,
  amount: number,
  color: number,
  alpha: number
) {
  const innerA = lerpPoint(a, center, amount);
  const innerB = lerpPoint(b, center, amount);

  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(a.x, a.y);
  graphics.lineTo(b.x, b.y);
  graphics.lineTo(innerB.x, innerB.y);
  graphics.lineTo(innerA.x, innerA.y);
  graphics.closePath();
  graphics.fillPath();
}
