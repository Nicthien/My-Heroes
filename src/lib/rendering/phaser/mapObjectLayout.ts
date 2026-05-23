import { getAdventureBuildingLabel } from "@/lib/game/adventure-buildings";
import { getExternalDwellingLabel, isExternalDwellingType } from "@/lib/game/external-dwellings";
import { getResourceBuildingLabel } from "@/lib/game/economy";
import { MapObject, MapTile } from "@/lib/game/types";
import { UNIT_RULES } from "@/lib/game/units";
import { TILE_HEIGHT } from "@/lib/rendering/phaser/iso";
import type { MapObjectData } from "@/lib/rendering/mapRenderer";

export const RESOURCE_LABELS: Record<string, string> = {
  gold: "Or",
  wood: "Bois",
  ore: "Minerai",
  mercury: "Mercure",
  crystals: "Cristaux",
  gems: "Gemmes",
  sulfur: "Soufre",
};

export type SpriteOrigin = {
  originX: number;
  originY: number;
};

export const TILE_FOOT_OFFSET_Y = TILE_HEIGHT / 2;
export const RESOURCE_BUILDING_SCALE = 1.24;
export const RESOURCE_BUILDING_OFFSET_Y = TILE_FOOT_OFFSET_Y;
export const RESOURCE_BUILDING_DISPLAY_SIZE = Math.round(52 * RESOURCE_BUILDING_SCALE);
export const MAP_OBJECT_ORIGIN_X = 0.5;
export const MAP_OBJECT_ORIGIN_Y = 1;
export const MAP_OBJECT_FOOT_OFFSET_Y = TILE_FOOT_OFFSET_Y;
export const RESOURCE_PICKUP_OFFSET_Y = -4;
export const MONSTER_OFFSET_Y = 6;
// Gate artwork is 298x248 (aspect 1.202); keep that ratio. Width is chosen so
// the structure spans ~3 tiles across the road (towers on the side tiles).
// 3-tile footprint along the wall diagonal: outer corners of tiles -1..+1
// span 128 game-px horizontally (TILE_WIDTH 64; per-tile step 32; ±64 outer).
export const GATE_DISPLAY_WIDTH = 128;
export const GATE_DISPLAY_HEIGHT = Math.round(GATE_DISPLAY_WIDTH / 1.202);
// Sprite point pinned to the road tile centre. The gate's foundation sits on
// the road tile, with the portcullis arch hovering above (you pass under it).
export const GATE_ORIGIN_X = 0.5;
export const GATE_ORIGIN_Y = 0.7;
export const GATE_OFFSET_Y = 0;
export const GATE_DEPTH_CLEARANCE = 256;
export const TOWN_OFFSET_Y = TILE_FOOT_OFFSET_Y + 7;
export const HERO_OFFSET_Y = 6;
export const BOAT_OFFSET_Y = 6;
export const TOWN_HERO_OFFSET_Y = TOWN_OFFSET_Y + 12;
export const ADVENTURE_BUILDING_OFFSET_Y = 8;

export const DEFAULT_SPRITE_ORIGIN: SpriteOrigin = { originX: MAP_OBJECT_ORIGIN_X, originY: MAP_OBJECT_ORIGIN_Y };
export const HERO_SPRITE_ORIGIN: SpriteOrigin = { originX: 0.5, originY: 0.988 };
export const BOAT_SPRITE_ORIGIN: SpriteOrigin = { originX: 0.5, originY: 0.925 };
export const MONSTER_SPRITE_ORIGIN: SpriteOrigin = { originX: 0.507, originY: 0.865 };
export const RESOURCE_BUILDING_ORIGIN: SpriteOrigin = { originX: 0.5, originY: 0.988 };

export const RESOURCE_PICKUP_ORIGINS: Record<string, SpriteOrigin> = {
  gold: { originX: 0.51, originY: 0.576 },
  wood: { originX: 0.504, originY: 0.543 },
  ore: { originX: 0.498, originY: 0.557 },
  mercury: { originX: 0.488, originY: 0.561 },
  crystals: { originX: 0.5, originY: 0.506 },
  gems: { originX: 0.498, originY: 0.572 },
  sulfur: { originX: 0.48, originY: 0.586 },
};

export const ADVENTURE_BUILDING_ORIGINS: Record<string, SpriteOrigin> = {
  campfire: { originX: 0.502, originY: 0.891 },
  external_dwelling: { originX: 0.5, originY: 0.9 },
  lighthouse: { originX: 0.49, originY: 0.898 },
  observatory: { originX: 0.475, originY: 0.938 },
  stargate: { originX: 0.48, originY: 0.918 },
  ancient_altar: { originX: 0.5, originY: 0.84 },
  beholders_sanctuary: { originX: 0.5, originY: 0.84 },
  black_tower: { originX: 0.5, originY: 0.88 },
  churchyard: { originX: 0.5, originY: 0.84 },
  crypt: { originX: 0.5, originY: 0.84 },
  cyclops_stockpile: { originX: 0.5, originY: 0.84 },
  derelict_ship: { originX: 0.5, originY: 0.84 },
  dragon_fly_hive: { originX: 0.5, originY: 0.84 },
  dragon_utopia: { originX: 0.5, originY: 0.86 },
  dwarven_treasury: { originX: 0.5, originY: 0.84 },
  experimental_shop: { originX: 0.5, originY: 0.84 },
  griffin_conservatory: { originX: 0.5, originY: 0.84 },
  imp_cache: { originX: 0.5, originY: 0.84 },
  ivory_tower: { originX: 0.5, originY: 0.88 },
  mansion: { originX: 0.5, originY: 0.84 },
  medusa_stores: { originX: 0.5, originY: 0.84 },
  naga_bank: { originX: 0.5, originY: 0.84 },
  pirate_cavern: { originX: 0.5, originY: 0.84 },
  red_tower: { originX: 0.5, originY: 0.88 },
  ruins: { originX: 0.5, originY: 0.84 },
  shipwreck: { originX: 0.5, originY: 0.84 },
  spit: { originX: 0.5, originY: 0.84 },
  temple_of_the_sea: { originX: 0.5, originY: 0.86 },
  wolf_raider_picket: { originX: 0.5, originY: 0.84 },
};

export const TOWN_ORIGINS: Record<string, SpriteOrigin> = {
  castle: { originX: 0.495, originY: 0.904 },
  rampart: { originX: 0.502, originY: 0.901 },
  tower: { originX: 0.495, originY: 0.93 },
  inferno: { originX: 0.495, originY: 0.909 },
  necropolis: { originX: 0.497, originY: 0.898 },
  dungeon: { originX: 0.5, originY: 0.919 },
  stronghold: { originX: 0.498, originY: 0.927 },
  fortress: { originX: 0.499, originY: 0.919 },
  conflux: { originX: 0.498, originY: 0.927 },
};

export function getMapObjectHoverText(object: MapObject) {
  if (object.type === "resource" && object.subtype) {
    return RESOURCE_LABELS[object.subtype] ?? object.subtype.slice(0, 3).toUpperCase();
  }

  if (object.type === "monster") return object.subtype && object.subtype in UNIT_RULES
    ? UNIT_RULES[object.subtype as keyof typeof UNIT_RULES].label
    : "Armée neutre";
  if (object.type === "building" && object.subtype) return getResourceBuildingLabel(object.subtype) ?? object.subtype;
  if (object.type === "adventure_building") {
    if (isExternalDwellingType(object.subtype)) return getExternalDwellingLabel(object.targetId);
    return getAdventureBuildingLabel(object.subtype);
  }
  if (object.type === "artifact") return "Artefact";
  if (object.type === "gate") return object.ownerId ? "Porte controlee" : "Porte neutre";

  return null;
}

export function getMapObjectHoverY(object: MapObject, surfaceY: number) {
  if (object.type === "building") {
    return surfaceY + RESOURCE_BUILDING_OFFSET_Y - RESOURCE_BUILDING_DISPLAY_SIZE - 8;
  }

  if (object.type === "resource") return surfaceY + RESOURCE_PICKUP_OFFSET_Y - 38 - 6;
  if (object.type === "monster") return surfaceY + MONSTER_OFFSET_Y - 46 - 8;
  if (object.type === "gate") return surfaceY - 58;

  return surfaceY - 34;
}

export function getOriginForMapTileObject(object: MapObject): SpriteOrigin {
  if (object.type === "resource" && object.subtype) {
    return RESOURCE_PICKUP_ORIGINS[object.subtype] ?? DEFAULT_SPRITE_ORIGIN;
  }
  if (object.type === "monster") return MONSTER_SPRITE_ORIGIN;
  return DEFAULT_SPRITE_ORIGIN;
}

export function getOriginForObject(object: MapObjectData): SpriteOrigin {
  if (object.type === "hero") return object.onWater ? BOAT_SPRITE_ORIGIN : HERO_SPRITE_ORIGIN;
  if (object.type === "town") return TOWN_ORIGINS[object.faction] ?? DEFAULT_SPRITE_ORIGIN;
  if (object.type === "building") return RESOURCE_BUILDING_ORIGIN;
  if (object.type === "gate") return { originX: GATE_ORIGIN_X, originY: GATE_ORIGIN_Y };
  if (object.type === "adventure_building" && object.buildingType) {
    return ADVENTURE_BUILDING_ORIGINS[object.buildingType] ?? DEFAULT_SPRITE_ORIGIN;
  }
  return DEFAULT_SPRITE_ORIGIN;
}

export function isEmptyPassableTile(tile: MapTile) {
  return tile.isPassable && !tile.object && !tile.decor?.blocking;
}
