import Phaser from "phaser";
import { WATER_TILE_FRAME_PATHS } from "@/lib/rendering/phaser/assets";
import {
  LAVA_TEXTURE_PREFIX,
  TERRAIN_ANIMATION_FRAME_COUNT,
  TERRAIN_ANIMATION_INTERVAL_MS,
  TERRAIN_TEXTURE_HEIGHT,
  TERRAIN_TEXTURE_WIDTH,
} from "@/lib/rendering/phaser/mapRenderSettings";
import { drawDiamondPath, hashTile } from "@/lib/rendering/phaser/pointMath";

export type WaterTileEffect = {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  frameOffset: number;
  frameIndex: number;
};

export type LavaTileEffect = {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  frameOffset: number;
  frameIndex: number;
};

export function generateTerrainAnimationTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(getTerrainTextureKey(LAVA_TEXTURE_PREFIX, 0))) {
    generateTerrainTextureFrames(scene, LAVA_TEXTURE_PREFIX, drawLavaAnimation);
  }
}

function generateTerrainTextureFrames(
  scene: Phaser.Scene,
  prefix: string,
  drawFrame: (graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, seed: number, time: number) => void
) {
  const centerX = TERRAIN_TEXTURE_WIDTH / 2;
  const centerY = TERRAIN_TEXTURE_HEIGHT / 2;

  for (let frame = 0; frame < TERRAIN_ANIMATION_FRAME_COUNT; frame++) {
    const key = getTerrainTextureKey(prefix, frame);
    if (scene.textures.exists(key)) continue;

    const graphics = scene.add.graphics();
    drawFrame(graphics, centerX, centerY, 0, frame * TERRAIN_ANIMATION_INTERVAL_MS);
    graphics.generateTexture(key, TERRAIN_TEXTURE_WIDTH, TERRAIN_TEXTURE_HEIGHT);
    graphics.destroy();
  }
}

export function updateTerrainEffectFrame(
  effect: WaterTileEffect | LavaTileEffect,
  texturePrefix: string,
  baseFrameIndex: number
) {
  const nextFrameIndex = (baseFrameIndex + effect.frameOffset) % TERRAIN_ANIMATION_FRAME_COUNT;
  if (effect.frameIndex === nextFrameIndex) return;

  effect.frameIndex = nextFrameIndex;
  effect.sprite.setTexture(getTerrainTextureKey(texturePrefix, nextFrameIndex));
}

export function updateWaterEffectFrame(effect: WaterTileEffect, baseFrameIndex: number) {
  const nextFrameIndex = (baseFrameIndex + effect.frameOffset) % WATER_TILE_FRAME_PATHS.length;
  if (effect.frameIndex === nextFrameIndex) return;

  effect.frameIndex = nextFrameIndex;
  effect.sprite.setTexture(WATER_TILE_FRAME_PATHS[nextFrameIndex]);
}

export function getTerrainFrameOffset(x: number, y: number) {
  return Math.floor(hashTile(x, y) * TERRAIN_ANIMATION_FRAME_COUNT) % TERRAIN_ANIMATION_FRAME_COUNT;
}

export function getTerrainTextureKey(prefix: string, frame: number) {
  return `${prefix}-${frame}`;
}

function drawLavaAnimation(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, seed: number, time: number) {
  const phase = time * 0.0017 + seed * Math.PI * 2;
  const pulse = (Math.sin(phase * 2.1) + 1) / 2;
  const ember = (Math.sin(phase * 3.4 + seed * 5) + 1) / 2;

  graphics.clear();
  graphics.fillStyle(0xff7a1f, 0.08 + pulse * 0.1);
  drawDiamondPath(graphics, isoX, isoY);
  graphics.fillPath();

  graphics.lineStyle(2, 0xffd15c, 0.32 + pulse * 0.28);
  graphics.beginPath();
  graphics.moveTo(isoX - 24, isoY - 1 + Math.sin(phase) * 2);
  graphics.lineTo(isoX - 12, isoY - 6 + Math.cos(phase * 0.9) * 2);
  graphics.lineTo(isoX + 1, isoY - 2 + Math.sin(phase + 1.1) * 2);
  graphics.lineTo(isoX + 20, isoY - 8 + Math.cos(phase + 0.8) * 2);
  graphics.moveTo(isoX - 15, isoY + 8 + Math.cos(phase + 1.7) * 2);
  graphics.lineTo(isoX - 2, isoY + 3 + Math.sin(phase * 1.1) * 2);
  graphics.lineTo(isoX + 15, isoY + 9 + Math.cos(phase + 2.4) * 2);
  graphics.strokePath();

  graphics.lineStyle(1, 0x6f170f, 0.3);
  graphics.beginPath();
  graphics.moveTo(isoX - 28, isoY + 11 + Math.sin(phase + 0.5));
  graphics.lineTo(isoX - 8, isoY + 15 + Math.cos(phase + 0.2));
  graphics.lineTo(isoX + 24, isoY + 10 + Math.sin(phase + 1.8));
  graphics.strokePath();

  graphics.fillStyle(0xfff0a3, 0.2 + ember * 0.28);
  graphics.fillCircle(isoX - 9 + Math.sin(phase * 1.6) * 3, isoY - 3 + Math.cos(phase) * 2, 1.4);
  graphics.fillCircle(isoX + 10 + Math.cos(phase * 1.2) * 3, isoY + 4 + Math.sin(phase * 1.3) * 2, 1.1);
}
