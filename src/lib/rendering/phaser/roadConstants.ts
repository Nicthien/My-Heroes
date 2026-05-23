import type { RoadType } from "@/lib/game/types";
import type { Diagonal4 } from "@/lib/rendering/phaser/directions";

export type RoadSide = Diagonal4;

export type RoadRenderStyle = {
  edge: number;
  fill: number;
  highlight: number;
  detail: number;
  shadowAlpha: number;
  halfWidth: number;
  outline: number;
  hubScale: number;
  detailDensity: number;
};

export type RoadStampSpec = {
  texturePath: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  displayWidth: number;
  displayHeight: number;
  alpha: number;
};

export const ROAD_RENDER_STYLES: Record<RoadType | "bridge", RoadRenderStyle> = {
  dirt: {
    edge: 0x5e3c1e,
    fill: 0xb68445,
    highlight: 0xe3bb72,
    detail: 0x6a4520,
    shadowAlpha: 0.16,
    halfWidth: 5.8,
    outline: 2.3,
    hubScale: 1,
    detailDensity: 1,
  },
  gravel: {
    edge: 0x4d493f,
    fill: 0xb6afa4,
    highlight: 0xe9e3d3,
    detail: 0x716b61,
    shadowAlpha: 0.14,
    halfWidth: 5.4,
    outline: 2.1,
    hubScale: 0.96,
    detailDensity: 0.9,
  },
  paved: {
    edge: 0x4f463c,
    fill: 0xd8ccb7,
    highlight: 0xf4edde,
    detail: 0x887a68,
    shadowAlpha: 0.12,
    halfWidth: 5.1,
    outline: 2,
    hubScale: 0.94,
    detailDensity: 0.72,
  },
  bridge: {
    edge: 0x4c2d15,
    fill: 0x9e6a36,
    highlight: 0xc79253,
    detail: 0x6d4422,
    shadowAlpha: 0.18,
    halfWidth: 6.2,
    outline: 2.1,
    hubScale: 1.06,
    detailDensity: 1.05,
  },
};

export const ROAD_STAMP_MASK_BY_SIDE: Record<RoadSide, 5 | 10> = {
  NE: 5,
  SE: 10,
  SW: 5,
  NW: 10,
};

export const ROAD_TEXTURE_BITS: Record<RoadSide, number> = {
  NE: 1,
  SE: 2,
  SW: 4,
  NW: 8,
};

export const ROAD_SIDE_SEEDS: Record<RoadSide, number> = {
  NE: 11,
  SE: 29,
  SW: 47,
  NW: 71,
};
