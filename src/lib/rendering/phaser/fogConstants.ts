import Phaser from "phaser";
import { TILE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";

export type FogTileState = 0 | 1 | 2;
export type FogEdgeSide = "northWest" | "northEast" | "southEast" | "southWest";
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
export const FOG_STAMP_WIDTH = TILE_WIDTH + 16;
export const FOG_STAMP_HEIGHT = TILE_HEIGHT + 16;
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

export const FOG_STAMP_TEXTURE_KEYS: Record<FogStampKey, string> = {
  "fog-near": "my-heroes-fog-near",
  "fog-unexplored": "my-heroes-fog-unexplored",
  "fog-explored": "my-heroes-fog-explored",
  "fog-edge-nw": "my-heroes-fog-edge-nw",
  "fog-edge-ne": "my-heroes-fog-edge-ne",
  "fog-edge-se": "my-heroes-fog-edge-se",
  "fog-edge-sw": "my-heroes-fog-edge-sw",
};
