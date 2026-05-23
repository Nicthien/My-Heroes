import type { Position } from "@/lib/game/types";
import { TILE_HEIGHT, TILE_WIDTH } from "@/lib/rendering/phaser/iso";

export type CubeFace = "NE" | "SE" | "SW" | "NW";

export type CubeCorners = {
  northTop: Position;
  eastTop: Position;
  southTop: Position;
  westTop: Position;
  northBottom: Position;
  eastBottom: Position;
  southBottom: Position;
  westBottom: Position;
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
    northTop: { x: isoX, y: isoY - TILE_HEIGHT / 2 - topDepth },
    eastTop: { x: isoX + TILE_WIDTH / 2, y: isoY - topDepth },
    southTop: { x: isoX, y: isoY + TILE_HEIGHT / 2 - topDepth },
    westTop: { x: isoX - TILE_WIDTH / 2, y: isoY - topDepth },
    northBottom: { x: isoX, y: isoY - TILE_HEIGHT / 2 - bottomDepth },
    eastBottom: { x: isoX + TILE_WIDTH / 2, y: isoY - bottomDepth },
    southBottom: { x: isoX, y: isoY + TILE_HEIGHT / 2 - bottomDepth },
    westBottom: { x: isoX - TILE_WIDTH / 2, y: isoY - bottomDepth },
  };
}

export function getCubeFacePoints(face: CubeFace, corners: CubeCorners): CubeFaceQuad {
  switch (face) {
    case "NE":
      return {
        topA: corners.northTop,
        topB: corners.eastTop,
        bottomA: corners.northBottom,
        bottomB: corners.eastBottom,
      };
    case "SE":
      return {
        topA: corners.southTop,
        topB: corners.eastTop,
        bottomA: corners.southBottom,
        bottomB: corners.eastBottom,
      };
    case "SW":
      return {
        topA: corners.westTop,
        topB: corners.southTop,
        bottomA: corners.westBottom,
        bottomB: corners.southBottom,
      };
    case "NW":
      return {
        topA: corners.westTop,
        topB: corners.northTop,
        bottomA: corners.westBottom,
        bottomB: corners.northBottom,
      };
  }
}
