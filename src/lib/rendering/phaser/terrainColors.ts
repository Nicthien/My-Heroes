import { TerrainType } from "@/lib/game/types";

export const TERRAIN_TOP: Record<TerrainType, number> = {
  grass: 0x6dbf58,
  water: 0x167fb4,
  mountain: 0x9a9ea0,
  forest: 0x4a8f4b,
  dirt: 0xb0934a,
  sand: 0xf2cc7e,
  snow: 0xffffff,
  swamp: 0x6d7d4e,
  lava: 0xd04030,
  rough: 0xa98c5f,
  subterranean: 0x5a4a3c,
};

export const TERRAIN_SIDE_LIT: Record<TerrainType, number> = {
  grass: 0x7ecf68,
  water: 0x1c88bd,
  mountain: 0xb0b4b6,
  forest: 0x5aaf5b,
  dirt: 0xc0a35a,
  sand: 0xffdc8e,
  snow: 0xffffff,
  swamp: 0x7d8d5e,
  lava: 0xe05040,
  rough: 0xbb9d6e,
  subterranean: 0x6e5a48,
};

export const TERRAIN_SIDE_DARK: Record<TerrainType, number> = {
  grass: 0x4a7c3f,
  water: 0x0c4f78,
  mountain: 0x606568,
  forest: 0x2a6f2b,
  dirt: 0x7b5924,
  sand: 0xc4a44a,
  snow: 0xc0c0c0,
  swamp: 0x4d5d2e,
  lava: 0xa03020,
  rough: 0x6f5436,
  subterranean: 0x3a2f26,
};
