import { BuildingType, Faction } from "./types";
import { getExternalDwellingSprite } from "./external-dwellings";
import type { TownBuildingRule } from "./town-buildings";

export const COMMON_TOWN_BUILDING_SPRITES: Partial<Record<BuildingType, string>> = {
  [BuildingType.TOWN_HALL]: "/assets/sprites/town-buildings/town_hall.webp",
  [BuildingType.CITY_HALL]: "/assets/sprites/town-buildings/city_hall.webp",
  [BuildingType.CAPITOL]: "/assets/sprites/town-buildings/capitol.webp",
  [BuildingType.TAVERN]: "/assets/sprites/town-buildings/tavern.webp",
  [BuildingType.MARKET]: "/assets/sprites/town-buildings/market.webp",
  [BuildingType.MAGE_GUILD]: "/assets/sprites/town-buildings/mage_guild.webp",
  [BuildingType.RESOURCE_SILO]: "/assets/sprites/town-buildings/resource_silo.webp",
};

export const UNIQUE_BUILDING_TYPES = [
  BuildingType.UNIQUE_1,
  BuildingType.UNIQUE_2,
  BuildingType.UNIQUE_3,
  BuildingType.UNIQUE_4,
  BuildingType.UNIQUE_5,
  BuildingType.UNIQUE_6,
];

export const UNIQUE_TOWN_BUILDING_SPRITES: Partial<Record<Faction, Partial<Record<BuildingType, string>>>> = {
  [Faction.CASTLE]: uniqueSpritesForFaction(Faction.CASTLE, 6),
  [Faction.RAMPART]: uniqueSpritesForFaction(Faction.RAMPART, 6),
  [Faction.TOWER]: uniqueSpritesForFaction(Faction.TOWER, 6),
  [Faction.INFERNO]: uniqueSpritesForFaction(Faction.INFERNO, 6),
  [Faction.NECROPOLIS]: uniqueSpritesForFaction(Faction.NECROPOLIS, 5),
  [Faction.DUNGEON]: uniqueSpritesForFaction(Faction.DUNGEON, 6),
  [Faction.STRONGHOLD]: uniqueSpritesForFaction(Faction.STRONGHOLD, 6),
  [Faction.FORTRESS]: uniqueSpritesForFaction(Faction.FORTRESS, 4),
  [Faction.CONFLUX]: uniqueSpritesForFaction(Faction.CONFLUX, 5),
};

export function getTownBuildingSprite(rule: TownBuildingRule, faction: Faction): string | undefined {
  if (rule.unlocksUnit) {
    if (rule.category === "dwelling_upgrade") {
      return `/assets/sprites/town-buildings/dwellings/upgraded/${rule.unlocksUnit}.webp`;
    }
    return getExternalDwellingSprite(rule.unlocksUnit) ?? getExternalDwellingSprite(rule.replacesUnit);
  }
  if (rule.category === "unique") {
    return UNIQUE_TOWN_BUILDING_SPRITES[faction]?.[rule.type];
  }
  return COMMON_TOWN_BUILDING_SPRITES[rule.type];
}

function uniqueSpritesForFaction(faction: Faction, count: number): Partial<Record<BuildingType, string>> {
  return Object.fromEntries(
    UNIQUE_BUILDING_TYPES.slice(0, count).map((type) => [
      type,
      `/assets/sprites/town-buildings/unique/${faction}-${type}.webp`,
    ]),
  ) as Partial<Record<BuildingType, string>>;
}
