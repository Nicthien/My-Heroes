import type { Position } from "@/lib/game/types";
import type { Diagonal4 } from "@/lib/rendering/phaser/directions";
import { TILE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";

export type CubeFace = Diagonal4;

export type CubeCorners = {
  topN: Position;
  topE: Position;
  topS: Position;
  topW: Position;
  bottomN: Position;
  bottomE: Position;
  bottomS: Position;
  bottomW: Position;
};

export type CubeFaceQuad = {
  topA: Position;
  topB: Position;
  bottomA: Position;
  bottomB: Position;
};

export function getCubeCorners(
  isoX: number,
  isoY: number,
  topDepth: number,
  bottomDepth: number
): CubeCorners {
  return {
    topN: { x: isoX, y: isoY - TILE_HEIGHT / 2 - topDepth },
    topE: { x: isoX + TILE_WIDTH / 2, y: isoY - topDepth },
    topS: { x: isoX, y: isoY + TILE_HEIGHT / 2 - topDepth },
    topW: { x: isoX - TILE_WIDTH / 2, y: isoY - topDepth },
    bottomN: { x: isoX, y: isoY - TILE_HEIGHT / 2 - bottomDepth },
    bottomE: { x: isoX + TILE_WIDTH / 2, y: isoY - bottomDepth },
    bottomS: { x: isoX, y: isoY + TILE_HEIGHT / 2 - bottomDepth },
    bottomW: { x: isoX - TILE_WIDTH / 2, y: isoY - bottomDepth },
  };
}

export function getCubeFacePoints(face: CubeFace, corners: CubeCorners): CubeFaceQuad {
  switch (face) {
    case "NE":
      return {
        topA: corners.topN,
        topB: corners.topE,
        bottomA: corners.bottomN,
        bottomB: corners.bottomE,
      };
    case "SE":
      return {
        topA: corners.topS,
        topB: corners.topE,
        bottomA: corners.bottomS,
        bottomB: corners.bottomE,
      };
    case "SW":
      return {
        topA: corners.topW,
        topB: corners.topS,
        bottomA: corners.bottomW,
        bottomB: corners.bottomS,
      };
    case "NW":
      return {
        topA: corners.topW,
        topB: corners.topN,
        bottomA: corners.bottomW,
        bottomB: corners.bottomN,
      };
  }
}
