import { getAdventureBuildingLabel, getAdventureBuildingRule } from "@/lib/game/adventure-buildings";
import { getArtifact, getArtifactMapLabel } from "@/lib/game/artifacts";
import { getCreatureBankDefinition, isCreatureBankType } from "@/lib/game/creature-banks";
import { getResourceBuildingLabel, getResourceBuildingProduction, resourceLabel, UNIT_RULES as ECONOMY_UNIT_RULES } from "@/lib/game/economy";
import { getExternalDwellingLabel, isExternalDwellingType } from "@/lib/game/external-dwellings";
import { localizedBuildingDescription } from "@/lib/game/buildings-i18n";
import { MapObject, MapTile } from "@/lib/game/types";
import { UNIT_RULES } from "@/lib/game/units";
import { localizedLabelFromId, localizedUnitLabel } from "@/lib/i18n/gameLabels";
import { translate, type TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";
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

const ARTIFACT_BONUS_KEYS: Record<string, TranslationKey> = {
  attack: "bonus.attack",
  defense: "bonus.defense",
  spellPower: "bonus.spellPower",
  knowledge: "bonus.knowledge",
  morale: "bonus.morale",
  luck: "bonus.luck",
  movement: "bonus.movement",
  seaMovement: "bonus.seaMovement",
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
// Gate artwork is authored as a compact single-tile isometric gatehouse.
export const GATE_DISPLAY_WIDTH = 64;
export const GATE_DISPLAY_HEIGHT = 64;
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
export const HERO_SPRITE_ORIGINS: Record<string, SpriteOrigin> = {
  castle: { originX: 0.5, originY: 0.962 },
  rampart: { originX: 0.5, originY: 0.93 },
  tower: { originX: 0.5, originY: 0.966 },
  inferno: { originX: 0.5, originY: 0.98 },
  necropolis: { originX: 0.5, originY: 0.962 },
  dungeon: { originX: 0.5, originY: 0.964 },
  stronghold: { originX: 0.5, originY: 0.91 },
  fortress: { originX: 0.5, originY: 0.948 },
  conflux: { originX: 0.5, originY: 0.958 },
};
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
  subterranean_gate: { originX: 0.5, originY: 0.9 },
  arena: { originX: 0.5, originY: 0.9 },
  mercenary_camp: { originX: 0.5, originY: 0.9 },
  marletto_tower: { originX: 0.5, originY: 0.92 },
  star_axis: { originX: 0.5, originY: 0.9 },
  garden_of_revelation: { originX: 0.5, originY: 0.9 },
  learning_stone: { originX: 0.5, originY: 0.88 },
  school_of_war: { originX: 0.5, originY: 0.9 },
  school_of_magic: { originX: 0.5, originY: 0.9 },
  library_of_enlightenment: { originX: 0.5, originY: 0.9 },
  cartographer: { originX: 0.5, originY: 0.9 },
  redwood_observatory: { originX: 0.5, originY: 0.92 },
  mystical_garden: { originX: 0.5, originY: 0.9 },
  stables: { originX: 0.5, originY: 0.9 },
  temple: { originX: 0.5, originY: 0.9 },
  fountain_of_fortune: { originX: 0.5, originY: 0.9 },
  idol_of_fortune: { originX: 0.5, originY: 0.88 },
  magic_well: { originX: 0.5, originY: 0.88 },
  magic_shrine: { originX: 0.5, originY: 0.9 },
  water_mill: { originX: 0.5, originY: 0.9 },
  water_wheel: { originX: 0.5, originY: 0.9 },
  abandoned_wagon: { originX: 0.5, originY: 0.86 },
  crate: { originX: 0.5, originY: 0.82 },
  treasure_chest: { originX: 0.5, originY: 0.82 },
  pandora_box: { originX: 0.5, originY: 0.82 },
  skeleton: { originX: 0.5, originY: 0.8 },
  obelisk: { originX: 0.5, originY: 0.92 },
  warrior_tomb: { originX: 0.5, originY: 0.86 },
  cursed_altar: { originX: 0.5, originY: 0.9 },
  spell_shrine_1: { originX: 0.5, originY: 0.9 },
  spell_shrine_2: { originX: 0.5, originY: 0.9 },
  spell_shrine_3: { originX: 0.5, originY: 0.9 },
  tree_of_knowledge: { originX: 0.5, originY: 0.92 },
  seer_hut: { originX: 0.5, originY: 0.9 },
  mermaid: { originX: 0.5, originY: 0.86 },
  buoy: { originX: 0.5, originY: 0.82 },
  flotsam: { originX: 0.5, originY: 0.82 },
  sea_chest: { originX: 0.5, originY: 0.82 },
  ancient_altar: { originX: 0.5, originY: 0.84 },
  bandit_camp: { originX: 0.5, originY: 0.84 },
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

export function getMapObjectHoverText(object: MapObject, locale: Locale = "fr") {
  const title = getMapObjectHoverTitle(object, locale);
  if (!title) return null;

  const description = getMapObjectHoverDescription(object, locale);
  return description ? `${title}\n${description}` : title;
}

export function getMapObjectHoverTitle(object: MapObject, locale: Locale = "fr") {
  if (object.type === "resource" && object.subtype) {
    return localizedLabelFromId(object.subtype, RESOURCE_LABELS[object.subtype] ?? object.subtype.slice(0, 3).toUpperCase(), locale);
  }

  if (object.type === "monster") return object.subtype && object.subtype in UNIT_RULES
    ? localizedUnitLabel(object.subtype, UNIT_RULES[object.subtype as keyof typeof UNIT_RULES].label, locale)
    : translate(locale, "map.neutralArmy");
  if (object.type === "building" && object.subtype) {
    return localizedLabelFromId(object.subtype, getResourceBuildingLabel(object.subtype) ?? object.subtype, locale);
  }
  if (object.type === "adventure_building") {
    if (isExternalDwellingType(object.subtype)) {
      return localizedLabelFromId(object.targetId ?? "", getExternalDwellingLabel(object.targetId), locale);
    }
    return localizedLabelFromId(object.subtype ?? "", getAdventureBuildingLabel(object.subtype), locale);
  }
  if (object.type === "artifact") return localizedLabelFromId(object.subtype ?? "", getArtifactMapLabel(object.subtype), locale);
  if (object.type === "gate") return translate(locale, object.ownerId ? "map.gateOwned" : "map.gateNeutral");
  if (object.type === "boat") return translate(locale, "build.boat");

  return null;
}

export function getMapObjectHoverDescription(object: MapObject, locale: Locale = "fr"): string | null {
  if (object.type === "building" && object.subtype) {
    const production = getResourceBuildingProduction(object.subtype);
    if (!production) return null;
    const parts = Object.entries(production)
      .filter(([, amount]) => Boolean(amount))
      .map(([resource, amount]) => `+${amount} ${resourceLabel(resource, locale)}`);
    if (parts.length === 0) return null;
    return translate(locale, "map.resourceBuildingProduction", { production: parts.join(", ") });
  }

  if (object.type === "artifact") {
    const artifact = getArtifact(object.subtype);
    if (!artifact) return null;
    const parts = Object.entries(artifact.bonus)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${translate(locale, ARTIFACT_BONUS_KEYS[key] ?? (`bonus.${key}` as TranslationKey))} ${Number(value) > 0 ? "+" : ""}${value}`);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (object.type !== "adventure_building") return null;

  if (isExternalDwellingType(object.subtype)) {
    const unit = object.targetId ? ECONOMY_UNIT_RULES[object.targetId as keyof typeof ECONOMY_UNIT_RULES] : undefined;
    if (!unit) return translate(locale, "map.dwellingGeneric");
    return translate(locale, "map.dwellingRecruit", {
      unit: localizedUnitLabel(object.targetId ?? "", unit.label, locale),
      growth: unit.growth,
    });
  }

  if (isCreatureBankType(object.subtype)) {
    const description = getCreatureBankDefinition(object.subtype)?.description;
    return description ? localizedBuildingDescription(description, locale) : translate(locale, "map.creatureBankGeneric");
  }

  const ruleDescription = getAdventureBuildingRule(object.subtype)?.description;
  return ruleDescription ? localizedBuildingDescription(ruleDescription, locale) : null;
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
  if (object.type === "boat") return BOAT_SPRITE_ORIGIN;
  if (object.type === "hero") return object.onWater
    ? BOAT_SPRITE_ORIGIN
    : HERO_SPRITE_ORIGINS[object.faction] ?? HERO_SPRITE_ORIGIN;
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
