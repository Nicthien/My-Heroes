import { ResourceBuildingType, TerrainType } from "../types";

export type ResourceSubtype = "gold" | "wood" | "ore" | "mercury" | "crystals" | "gems" | "sulfur";

export interface PileSpec {
  kind: "pile";
  subtype: ResourceSubtype;
  amount: number;
  value: number;
}

export interface BuildingSpec {
  kind: "building";
  buildingType: ResourceBuildingType;
  value: number;
  preferredTerrain: TerrainType[];
  clusterResource: ResourceSubtype;
  clusterCount: [number, number];
}

export type ObjectSpec = PileSpec | BuildingSpec;

export const PILE_VALUE: Record<ResourceSubtype, number> = {
  gold: 500,
  wood: 200,
  ore: 200,
  mercury: 350,
  crystals: 350,
  gems: 350,
  sulfur: 350,
};

export const PILE_AMOUNT: Record<ResourceSubtype, number> = {
  gold: 500,
  wood: 5,
  ore: 5,
  mercury: 3,
  crystals: 3,
  gems: 3,
  sulfur: 3,
};

export const NEUTRAL_CASTLE_VALUE = 6000;

export const BUILDING_SPECS: BuildingSpec[] = [
  {
    kind: "building",
    buildingType: ResourceBuildingType.GOLD_MINE,
    value: 3000,
    preferredTerrain: [TerrainType.MOUNTAIN, TerrainType.GRASS, TerrainType.DIRT],
    clusterResource: "gold",
    clusterCount: [1, 2],
  },
  {
    kind: "building",
    buildingType: ResourceBuildingType.SAWMILL,
    value: 1500,
    preferredTerrain: [TerrainType.FOREST, TerrainType.GRASS],
    clusterResource: "wood",
    clusterCount: [1, 2],
  },
  {
    kind: "building",
    buildingType: ResourceBuildingType.ORE_PIT,
    value: 1500,
    preferredTerrain: [TerrainType.MOUNTAIN, TerrainType.GRASS, TerrainType.DIRT],
    clusterResource: "ore",
    clusterCount: [1, 2],
  },
  {
    kind: "building",
    buildingType: ResourceBuildingType.ALCHEMIST_LAB,
    value: 2000,
    preferredTerrain: [TerrainType.SNOW, TerrainType.MOUNTAIN, TerrainType.GRASS],
    clusterResource: "mercury",
    clusterCount: [1, 2],
  },
  {
    kind: "building",
    buildingType: ResourceBuildingType.CRYSTAL_CAVERN,
    value: 2000,
    preferredTerrain: [TerrainType.MOUNTAIN, TerrainType.SNOW, TerrainType.GRASS],
    clusterResource: "crystals",
    clusterCount: [1, 2],
  },
  {
    kind: "building",
    buildingType: ResourceBuildingType.GEM_POND,
    value: 2000,
    preferredTerrain: [TerrainType.SNOW, TerrainType.GRASS, TerrainType.MOUNTAIN],
    clusterResource: "gems",
    clusterCount: [1, 2],
  },
  {
    kind: "building",
    buildingType: ResourceBuildingType.SULFUR_DUNE,
    value: 2000,
    preferredTerrain: [TerrainType.SAND, TerrainType.GRASS, TerrainType.LAVA],
    clusterResource: "sulfur",
    clusterCount: [1, 2],
  },
];

export function buildingSpec(type: ResourceBuildingType): BuildingSpec {
  const s = BUILDING_SPECS.find((b) => b.buildingType === type);
  if (!s) throw new Error(`Missing building spec: ${type}`);
  return s;
}

export function makePileSpec(subtype: ResourceSubtype): PileSpec {
  return {
    kind: "pile",
    subtype,
    amount: PILE_AMOUNT[subtype],
    value: PILE_VALUE[subtype],
  };
}
