import Phaser from "phaser";
import { DecorItem, GameMap, MapTile, Position, TerrainType } from "@/lib/game/types";
import type { MapObjectData } from "@/lib/rendering/mapRenderer";
import { MAP_SPRITES, TERRAIN_TOP_TEXTURES, type TerrainTopTexture } from "@/lib/rendering/phaser/assets";
import { TILE_HEIGHT, TILE_WIDTH, cartToIso } from "@/lib/rendering/phaser/iso";
import { TERRAIN_EFFECT_VIEW_PADDING } from "@/lib/rendering/phaser/mapRenderSettings";
import { hashTile } from "@/lib/rendering/phaser/pointMath";
import type { LavaTileEffect } from "@/lib/rendering/phaser/terrainAnimation";

export type BrickWallOrientation = "NW_SE" | "NE_SW" | "N_S" | "E_W";

export function getBrickRampartPlacement() {
  return {
    width: 58,
    height: 64,
    originX: 0.5,
    offsetX: 0,
    offsetY: 16,
  };
}

export function getBrickWallAxis(orientation: BrickWallOrientation): {
  along: Position;
  across: Position;
  long: number;
  thick: number;
  shadowWidth: number;
  crenelCount: number;
} {
  switch (orientation) {
    case "N_S":
      return {
        along: { x: 0, y: 1 },
        across: { x: 1, y: 0 },
        long: 18,
        thick: 13,
        shadowWidth: 38,
        crenelCount: 3,
      };
    case "E_W":
      return {
        along: { x: 1, y: 0 },
        across: { x: 0, y: 1 },
        long: 24,
        thick: 10,
        shadowWidth: 58,
        crenelCount: 3,
      };
    case "NE_SW":
      return {
        along: { x: -0.9, y: 0.46 },
        across: { x: 0.46, y: 0.9 },
        long: 25,
        thick: 10,
        shadowWidth: 58,
        crenelCount: 3,
      };
    case "NW_SE":
    default:
      return {
        along: { x: 0.9, y: 0.46 },
        across: { x: -0.46, y: 0.9 },
        long: 25,
        thick: 10,
        shadowWidth: 58,
        crenelCount: 3,
      };
  }
}

export function getBrickWallVectors(orientation: BrickWallOrientation): { dir: Position; normal: Position } {
  switch (orientation) {
    case "NE_SW":
      return { dir: { x: -26, y: 13 }, normal: { x: 10, y: 5 } };
    case "N_S":
      return { dir: { x: 0, y: 25 }, normal: { x: 14, y: 0 } };
    case "E_W":
      return { dir: { x: 28, y: 0 }, normal: { x: 0, y: 10 } };
    case "NW_SE":
    default:
      return { dir: { x: 26, y: 13 }, normal: { x: -10, y: 5 } };
  }
}

export function isTerrainEffectInView(
  effect: LavaTileEffect,
  view: Phaser.Geom.Rectangle
) {
  return (
    effect.x >= view.x - TERRAIN_EFFECT_VIEW_PADDING &&
    effect.x <= view.x + view.width + TERRAIN_EFFECT_VIEW_PADDING &&
    effect.y >= view.y - TERRAIN_EFFECT_VIEW_PADDING &&
    effect.y <= view.y + view.height + TERRAIN_EFFECT_VIEW_PADDING
  );
}

export function isSpritePointInView(x: number, y: number, view: Phaser.Geom.Rectangle) {
  return (
    x >= view.x - TERRAIN_EFFECT_VIEW_PADDING &&
    x <= view.x + view.width + TERRAIN_EFFECT_VIEW_PADDING &&
    y >= view.y - TERRAIN_EFFECT_VIEW_PADDING &&
    y <= view.y + view.height + TERRAIN_EFFECT_VIEW_PADDING
  );
}

export function areObjectsRenderEquivalent(left: MapObjectData, right: MapObjectData) {
  return (
    left.type === right.type &&
    left.id === right.id &&
    left.playerId === right.playerId &&
    left.x === right.x &&
    left.y === right.y &&
    left.faction === right.faction &&
    left.color === right.color &&
    left.name === right.name &&
    Boolean(left.onWater) === Boolean(right.onWater) &&
    Boolean(left.inTown) === Boolean(right.inTown) &&
    (left.renderOffsetX ?? 0) === (right.renderOffsetX ?? 0) &&
    (left.renderOffsetY ?? 0) === (right.renderOffsetY ?? 0) &&
    (left.buildingType ?? "") === (right.buildingType ?? "") &&
    (left.dwellingUnitType ?? "") === (right.dwellingUnitType ?? "") &&
    (left.guardianPower ?? 0) === (right.guardianPower ?? 0)
  );
}

export function shouldRebuildHero(left: MapObjectData, right: MapObjectData) {
  return (
    left.type !== right.type ||
    left.id !== right.id ||
    left.faction !== right.faction ||
    left.color !== right.color ||
    Boolean(left.onWater) !== Boolean(right.onWater) ||
    Boolean(left.inTown) !== Boolean(right.inTown)
  );
}

export function drawPolygonPath(graphics: Phaser.GameObjects.Graphics, points: Position[]) {
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath();
}

export function drawRingPath(graphics: Phaser.GameObjects.Graphics, outer: Position[], inner: Position[]) {
  for (let i = 0; i < outer.length; i++) {
    const next = (i + 1) % outer.length;
    graphics.beginPath();
    graphics.moveTo(outer[i].x, outer[i].y);
    graphics.lineTo(outer[next].x, outer[next].y);
    graphics.lineTo(inner[next].x, inner[next].y);
    graphics.lineTo(inner[i].x, inner[i].y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }
}

export function getMapOuterCorners(map: GameMap, paddingTiles = 0): Position[] {
  const min = -paddingTiles;
  const maxX = map.width - 1 + paddingTiles;
  const maxY = map.height - 1 + paddingTiles;
  const top = cartToIso(min, min);
  const right = cartToIso(maxX, min);
  const bottom = cartToIso(maxX, maxY);
  const left = cartToIso(min, maxY);

  return [
    { x: top.x, y: top.y - TILE_HEIGHT / 2 },
    { x: right.x + TILE_WIDTH / 2, y: right.y },
    { x: bottom.x, y: bottom.y + TILE_HEIGHT / 2 },
    { x: left.x - TILE_WIDTH / 2, y: left.y },
  ];
}

export function liftPolygon(points: Position[], height: number): Position[] {
  return points.map((point) => ({ x: point.x, y: point.y - height }));
}

export function getPolygonCenter(points: Position[]): Position {
  return points.reduce(
    (center, point) => ({
      x: center.x + point.x / points.length,
      y: center.y + point.y / points.length,
    }),
    { x: 0, y: 0 }
  );
}

export function parseHexColor(color: string): number | null {
  const normalized = color.trim().replace(/^#/, "");
  const hex = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

export function pickTerrainTexture(tile: MapTile): TerrainTopTexture | null {
  if (tile.terrain === TerrainType.WATER) return null;

  const textures = TERRAIN_TOP_TEXTURES[tile.terrain] as readonly TerrainTopTexture[] | undefined;
  if (!textures || textures.length === 0) return null;

  if (tile.road) {
    return findTextureByTag(textures, "clean") ?? textures[0];
  }

  const decorTags = getDecorTextureTags(tile.decor);
  const matchingTextures = decorTags.length > 0
    ? textures.filter((texture) => decorTags.some((tag) => texture.tags.includes(tag)))
    : [];
  const pool = matchingTextures.length > 0 ? matchingTextures : textures;
  const variantOffset = tile.decor && !tile.decor.blocking ? (tile.decor.variant ?? 0) : 0;
  const index = Math.floor(hashTile(tile.x + variantOffset * 11, tile.y + pool.length * 7) * pool.length);

  return pool[index] ?? textures[0];
}

function findTextureByTag(textures: readonly TerrainTopTexture[], tag: string) {
  return textures.find((texture) => texture.tags.includes(tag));
}

function getDecorTextureTags(decor: DecorItem | undefined): string[] {
  if (!decor || decor.blocking) return [];

  switch (decor.type) {
    case "grass-tuft":
      return ["grass"];
    case "flower":
      return ["flower"];
    case "rock-small":
    case "rock-large":
      return ["rock"];
    case "bush":
      return ["grass", "moss"];
    case "tree-pine":
      return ["needle", "moss"];
    case "tree-oak":
      return ["leaf", "moss"];
    case "tree-dead":
      return ["root", "leaf"];
    default:
      return [];
  }
}

export function pickNaturalWallTreeSprite(tile: MapTile) {
  const roll = hashTile(tile.x + 37, tile.y + 73);

  if (tile.terrain === TerrainType.SNOW || tile.terrain === TerrainType.MOUNTAIN) {
    return roll > 0.82 ? MAP_SPRITES.decor.mountain_deadwood : MAP_SPRITES.decor.mountain_pine_rock;
  }

  if (tile.terrain === TerrainType.SWAMP || tile.terrain === TerrainType.LAVA) {
    return tile.terrain === TerrainType.LAVA
      ? roll > 0.5
        ? MAP_SPRITES.decor.lava_scorched_deadwood
        : MAP_SPRITES.decor.lava_obsidian_bramble
      : roll > 0.72
        ? MAP_SPRITES.decor.swamp_cypress_cluster
        : MAP_SPRITES.decor.swamp_willow_grove;
  }

  if (tile.terrain === TerrainType.FOREST) {
    return roll > 0.45 ? MAP_SPRITES.decor.forest_pine_grove : MAP_SPRITES.decor.forest_broadleaf_grove;
  }

  return roll > 0.64 ? MAP_SPRITES.decor.grass_oak_copse : MAP_SPRITES.decor.grass_bramble_mound;
}
