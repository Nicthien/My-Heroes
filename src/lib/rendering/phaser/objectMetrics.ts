import { isCreatureBankType } from "@/lib/game/creature-banks";
import {
  ADVENTURE_BUILDING_OFFSET_Y,
  GATE_DISPLAY_HEIGHT,
  GATE_DISPLAY_WIDTH,
  GATE_OFFSET_Y,
  HERO_OFFSET_Y,
  MAP_OBJECT_FOOT_OFFSET_Y,
  RESOURCE_BUILDING_DISPLAY_SIZE,
  RESOURCE_BUILDING_OFFSET_Y,
  TOWN_HERO_OFFSET_Y,
  TOWN_OFFSET_Y,
} from "@/lib/rendering/phaser/mapObjectLayout";
import { MAP_SPRITES, getBoatSpritesheet, getHeroSpritesheet } from "@/lib/rendering/phaser/assets";
import type { MapObjectData } from "@/lib/rendering/mapRenderer";

export function getObjectMetrics(object: MapObjectData) {
  if (object.type === "hero") {
    const sheet = object.onWater ? getBoatSpritesheet(object.faction) : getHeroSpritesheet(object.faction);
    if (sheet) return object.inTown
      ? { width: sheet.townDisplayWidth, height: sheet.townDisplayHeight, offsetY: TOWN_HERO_OFFSET_Y }
      : { width: sheet.displayWidth, height: sheet.displayHeight, offsetY: object.onWater ? MAP_OBJECT_FOOT_OFFSET_Y : HERO_OFFSET_Y };
    return object.inTown
      ? { width: 30, height: 30, offsetY: TOWN_HERO_OFFSET_Y }
      : { width: 44, height: 44, offsetY: HERO_OFFSET_Y };
  }
  if (object.type === "town") return { width: 146, height: 110, offsetY: TOWN_OFFSET_Y };
  if (object.type === "building") return { width: RESOURCE_BUILDING_DISPLAY_SIZE, height: RESOURCE_BUILDING_DISPLAY_SIZE, offsetY: RESOURCE_BUILDING_OFFSET_Y };
  if (object.type === "gate") return { width: GATE_DISPLAY_WIDTH, height: GATE_DISPLAY_HEIGHT, offsetY: GATE_OFFSET_Y };
  if (object.type === "adventure_building") {
    if (object.buildingType === "stargate") return { width: 56, height: 56, offsetY: ADVENTURE_BUILDING_OFFSET_Y };
    if (isCreatureBankType(object.buildingType)) {
      return { width: 66, height: 66, offsetY: ADVENTURE_BUILDING_OFFSET_Y + 3 };
    }
    return { width: 50, height: 50, offsetY: ADVENTURE_BUILDING_OFFSET_Y };
  }
  if (object.type === "combat") return { width: 48, height: 48, offsetY: MAP_OBJECT_FOOT_OFFSET_Y };
  return null;
}

export function getObjectHitboxScale(object: MapObjectData) {
  if (object.type === "town") return { width: 0.62, height: 0.58 };
  if (object.type === "hero") return object.inTown
    ? { width: 0.72, height: 0.88 }
    : { width: 0.64, height: 0.82 };
  if (object.type === "building") return { width: 0.72, height: 0.74 };
  if (object.type === "adventure_building") return { width: 0.72, height: 0.72 };
  if (object.type === "combat") return { width: 0.78, height: 0.78 };
  return { width: 0.8, height: 0.8 };
}

export function getHeroTravelMetrics(object: MapObjectData) {
  return getObjectMetrics({ ...object, inTown: false }) ?? getObjectMetrics(object)!;
}

export function getHeroBannerMetrics(object: MapObjectData) {
  if (object.inTown) return { xOffset: 7, baseOffsetY: 10, poleHeight: 27, width: 7, height: 5 };
  return { xOffset: 10, baseOffsetY: 8, poleHeight: 42, width: 9, height: 6 };
}

export function getGateBannerPlacement(textureKey: string) {
  return textureKey === MAP_SPRITES.gates.diagonalUp
    ? { xRatio: 0.77, yRatio: 0.18 }
    : { xRatio: 0.23, yRatio: 0.18 };
}
