import { AdventureBuildingType, AdventureBuildingVisitMode, Resources, TerrainType } from "./types";
import { RNG, randInt } from "./engine/rng";
import { getCreatureBankLabel } from "./creature-banks";
import { getExternalDwellingLabel, isExternalDwellingType } from "./external-dwellings";

export interface AdventureBuildingRule {
  type: AdventureBuildingType;
  label: string;
  description: string;
  visitMode: AdventureBuildingVisitMode;
  preferredTerrain: TerrainType[];
  rarity: number;
}

export interface CampfireReward {
  gold: number;
  resources: Partial<Omit<Resources, "gold">>;
}

export const ADVENTURE_BUILDING_RULES: Record<AdventureBuildingType, AdventureBuildingRule> = {
  [AdventureBuildingType.OBSERVATORY]: {
    type: AdventureBuildingType.OBSERVATORY,
    label: "Observatoire",
    description: "Revele le terrain autour du heros.",
    visitMode: "once_per_player",
    preferredTerrain: [TerrainType.MOUNTAIN, TerrainType.GRASS, TerrainType.SNOW],
    rarity: 0.9,
  },
  [AdventureBuildingType.CAMPFIRE]: {
    type: AdventureBuildingType.CAMPFIRE,
    label: "Feu de camp",
    description: "Offre de l'or et quelques ressources, puis disparait.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.DIRT, TerrainType.SWAMP],
    rarity: 1.35,
  },
  [AdventureBuildingType.LIGHTHOUSE]: {
    type: AdventureBuildingType.LIGHTHOUSE,
    label: "Phare",
    description: "Signale la cote et prepare un bonus de navigation.",
    visitMode: "once_per_player",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW],
    rarity: 0.6,
  },
  [AdventureBuildingType.STARGATE]: {
    type: AdventureBuildingType.STARGATE,
    label: "Stargate",
    description: "Teleporte le heros vers la Stargate liee.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.35,
  },
  [AdventureBuildingType.EXTERNAL_DWELLING]: {
    type: AdventureBuildingType.EXTERNAL_DWELLING,
    label: "Demeure externe",
    description: "Permet de recruter des creatures sur la carte.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.SWAMP, TerrainType.MOUNTAIN],
    rarity: 0.8,
  },
};

export const ADVENTURE_BUILDING_TYPES = Object.values(AdventureBuildingType);

export function getAdventureBuildingRule(type: string | undefined): AdventureBuildingRule | undefined {
  return ADVENTURE_BUILDING_RULES[type as AdventureBuildingType];
}

export function getAdventureBuildingLabel(type: string | undefined): string {
  const creatureBankLabel = getCreatureBankLabel(type);
  if (creatureBankLabel) return creatureBankLabel;
  if (isExternalDwellingType(type)) return getExternalDwellingLabel(undefined);
  return getAdventureBuildingRule(type)?.label ?? "Batiment d'aventure";
}

export function createCampfireReward(rng: RNG): CampfireReward {
  const resources: Partial<Omit<Resources, "gold">> = {};
  const resourceTypes: Array<keyof Omit<Resources, "gold">> = ["wood", "ore", "mercury", "crystals", "gems", "sulfur"];
  const picks = randInt(rng, 4, 6);

  for (let i = 0; i < picks; i++) {
    const type = resourceTypes[randInt(rng, 0, resourceTypes.length - 1)];
    resources[type] = (resources[type] ?? 0) + 1;
  }

  return {
    gold: randInt(rng, 400, 600),
    resources,
  };
}

export function addVisit(visits: Record<string, string[]> | undefined, playerId: string, buildingId: string) {
  const next = { ...(visits ?? {}) };
  next[playerId] = Array.from(new Set([...(next[playerId] ?? []), buildingId]));
  return next;
}

export function hasPlayerVisited(visits: Record<string, string[]> | undefined, playerId: string, buildingId: string) {
  return visits?.[playerId]?.includes(buildingId) ?? false;
}
