import { BuildingType, Resources, UnitType } from "./types";

export type ResourceCost = Partial<Resources>;

export interface BuildingRule {
  type: BuildingType;
  label: string;
  description: string;
  cost: ResourceCost;
  requires?: BuildingType[];
}

export interface UnitRule {
  type: UnitType;
  label: string;
  cost: ResourceCost;
  health: number;
  dwelling: BuildingType;
}

export const BUILDING_RULES: BuildingRule[] = [
  {
    type: BuildingType.TAVERN,
    label: "Taverne",
    description: "Débloquera plus tard le recrutement de héros.",
    cost: { gold: 500, wood: 5 },
  },
  {
    type: BuildingType.BARRACKS,
    label: "Caserne",
    description: "Prépare le recrutement de piquiers.",
    cost: { gold: 1000, wood: 5, ore: 5 },
  },
  {
    type: BuildingType.MARKET,
    label: "Marché",
    description: "Débloquera plus tard l'échange de ressources.",
    cost: { gold: 750, wood: 5 },
  },
  {
    type: BuildingType.RESOURCE_SILO,
    label: "Silo de ressources",
    description: "+500 pièces d'or à chaque nouveau jour.",
    cost: { gold: 1500, wood: 5, ore: 5 },
    requires: [BuildingType.MARKET],
  },
  {
    type: BuildingType.DWELLING_1,
    label: "Corps de garde",
    description: "Permet de recruter des piquiers.",
    cost: { gold: 1000, wood: 5 },
    requires: [BuildingType.BARRACKS],
  },
  {
    type: BuildingType.DWELLING_2,
    label: "Champ de tir",
    description: "Permet de recruter des archers.",
    cost: { gold: 1500, wood: 10 },
    requires: [BuildingType.DWELLING_1],
  },
  {
    type: BuildingType.DWELLING_3,
    label: "Tour des griffons",
    description: "Permet de recruter des griffons.",
    cost: { gold: 2500, ore: 10 },
    requires: [BuildingType.DWELLING_2],
  },
];

export const UNIT_RULES: UnitRule[] = [
  {
    type: UnitType.PIKEMAN,
    label: "Piquier",
    cost: { gold: 60 },
    health: 12,
    dwelling: BuildingType.DWELLING_1,
  },
  {
    type: UnitType.ARCHER,
    label: "Archer",
    cost: { gold: 100 },
    health: 12,
    dwelling: BuildingType.DWELLING_2,
  },
  {
    type: UnitType.GRIFFIN,
    label: "Griffon",
    cost: { gold: 200 },
    health: 30,
    dwelling: BuildingType.DWELLING_3,
  },
];

export function canAfford(resources: Resources, cost: ResourceCost) {
  return Object.entries(cost).every(([resource, amount]) => {
    const key = resource as keyof Resources;
    return resources[key] >= (amount ?? 0);
  });
}

export function subtractCost(resources: Resources, cost: ResourceCost): Resources {
  return {
    gold: resources.gold - (cost.gold ?? 0),
    wood: resources.wood - (cost.wood ?? 0),
    ore: resources.ore - (cost.ore ?? 0),
    mercury: resources.mercury - (cost.mercury ?? 0),
    crystals: resources.crystals - (cost.crystals ?? 0),
    sulfur: resources.sulfur - (cost.sulfur ?? 0),
  };
}

export function formatCost(cost: ResourceCost) {
  const parts: string[] = [];
  if (cost.gold) parts.push(`${cost.gold} or`);
  if (cost.wood) parts.push(`${cost.wood} bois`);
  if (cost.ore) parts.push(`${cost.ore} minerai`);
  if (cost.mercury) parts.push(`${cost.mercury} mercure`);
  if (cost.crystals) parts.push(`${cost.crystals} cristaux`);
  if (cost.sulfur) parts.push(`${cost.sulfur} soufre`);
  return parts.join(" ");
}
