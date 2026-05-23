import Phaser from "phaser";
import { TILE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";

import type { Diagonal4 } from "@/lib/rendering/phaser/directions";

export type FogTileState = 0 | 1 | 2;
export type FogEdgeSide = Diagonal4;
export type FogStampKey = "fog-near" | "fog-unexplored" | "fog-explored" | "fog-edge-nw" | "fog-edge-ne" | "fog-edge-se" | "fog-edge-sw";

export type FogChunkBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FogChunk = {
  chunkX: number;
  chunkY: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  bounds: FogChunkBounds;
  baseTexture: Phaser.GameObjects.RenderTexture;
  edgeTexture: Phaser.GameObjects.RenderTexture;
};

export const FOG_CHUNK_SIZE = 16;
export const FOG_TILE_VISIBLE: FogTileState = 0;
export const FOG_TILE_EXPLORED: FogTileState = 1;
export const FOG_TILE_UNEXPLORED: FogTileState = 2;
export const FOG_TILE_UNINITIALIZED = 255;
// Stamp size deliberately exceeds the tile by a wide margin so that the soft
// fog blobs from neighbouring tiles overlap heavily — that overlap is what
// breaks the per-tile grid pattern and gives a continuous cloud feel.
export const FOG_STAMP_WIDTH = TILE_WIDTH + 48;
export const FOG_STAMP_HEIGHT = TILE_HEIGHT + 48;
export const FOG_STAMP_HALF_WIDTH = FOG_STAMP_WIDTH / 2;
export const FOG_STAMP_HALF_HEIGHT = FOG_STAMP_HEIGHT / 2;
export const FOG_CHUNK_MARGIN = 2;
export const FOG_PLANE_CLEARANCE = 1;

export const FOG_STAMP_CONFIG: Phaser.Types.Textures.StampConfig = {
  originX: 0.5,
  originY: 0.5,
};

export const FOG_UNEXPLORED_STAMP_CONFIG: Phaser.Types.Textures.StampConfig = {
  originX: 0.5,
  originY: 0.5,
  scaleX: 1.12,
  scaleY: 1.12,
};

// Base fog tiles (near / unexplored / explored) ship multiple variants so the
// same noisy stamp doesn't tile visibly across the map. Edge stamps stay single
// because their pattern is positional (one strip per side) and adding variants
// wouldn't change the perceived edge.
export const FOG_BASE_VARIANT_COUNT = 6;

const baseVariantKeys = (base: string): string[] =>
  Array.from({ length: FOG_BASE_VARIANT_COUNT }, (_, i) => `${base}-${i}`);

export const FOG_STAMP_TEXTURE_KEYS: Record<FogStampKey, string[]> = {
  "fog-near": baseVariantKeys("my-heroes-fog-near"),
  "fog-unexplored": baseVariantKeys("my-heroes-fog-unexplored"),
  "fog-explored": baseVariantKeys("my-heroes-fog-explored"),
  "fog-edge-nw": ["my-heroes-fog-edge-nw"],
  "fog-edge-ne": ["my-heroes-fog-edge-ne"],
  "fog-edge-se": ["my-heroes-fog-edge-se"],
  "fog-edge-sw": ["my-heroes-fog-edge-sw"],
};
