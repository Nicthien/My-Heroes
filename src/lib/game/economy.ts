import { BuildingType, Faction, Resources, ResourceBuildingType, UnitType } from "./types";
import { CREATURES } from "./creature-catalog";
import type { CreatureGroupKey } from "./creature-catalog";
import {
  BASE_DWELLING_TYPES,
  UPGRADED_DWELLING_TYPES,
  getTownBuildingRules,
  type TownBuildingRule,
} from "./town-buildings";

export type ResourceCost = Partial<Resources>;

export interface BuildingRule {
  type: BuildingType;
  label: string;
  description: string;
  cost: ResourceCost;
  requires?: BuildingType[];
}

export interface ResourceBuildingRule {
  type: ResourceBuildingType;
  label: string;
  production: Partial<Resources>;
  guardianBasePower: number;
}

export const RESOURCE_LABELS: Record<keyof Resources, string> = {
  gold: "or",
  wood: "bois",
  ore: "minerai",
  mercury: "mercure",
  crystals: "cristaux",
  gems: "gemmes",
  sulfur: "soufre",
};

export const RESOURCE_BUILDING_RULES: ResourceBuildingRule[] = [
  {
    type: ResourceBuildingType.GOLD_MINE,
    label: "Mine d'or",
    production: { gold: 1000 },
    guardianBasePower: 300,
  },
  {
    type: ResourceBuildingType.SAWMILL,
    label: "Scierie",
    production: { wood: 2 },
    guardianBasePower: 200,
  },
  {
    type: ResourceBuildingType.ORE_PIT,
    label: "Mine de minerai",
    production: { ore: 2 },
    guardianBasePower: 250,
  },
  {
    type: ResourceBuildingType.ALCHEMIST_LAB,
    label: "Laboratoire d'alchimiste",
    production: { mercury: 1 },
    guardianBasePower: 350,
  },
  {
    type: ResourceBuildingType.CRYSTAL_CAVERN,
    label: "Caverne de cristaux",
    production: { crystals: 1 },
    guardianBasePower: 350,
  },
  {
    type: ResourceBuildingType.GEM_POND,
    label: "Bassin de gemmes",
    production: { gems: 1 },
    guardianBasePower: 350,
  },
  {
    type: ResourceBuildingType.SULFUR_DUNE,
    label: "Dune de soufre",
    production: { sulfur: 1 },
    guardianBasePower: 350,
  },
];

export function formatResourceName(resource: string) {
  return RESOURCE_LABELS[resource as keyof Resources] ?? resource;
}

export function formatResourceProduction(production: Partial<Resources>) {
  return Object.entries(production)
    .filter(([, amount]) => Boolean(amount))
    .map(([resource, amount]) => `+${amount} ${formatResourceName(resource)}`)
    .join(", ");
}

export function getResourceBuildingLabel(type: string | undefined) {
  if (!type) return undefined;
  return RESOURCE_BUILDING_RULES.find((rule) => rule.type === type)?.label;
}

export interface UnitRule {
  type: UnitType;
  label: string;
  cost: ResourceCost;
  health: number;
  dwelling: BuildingType;
  growth: number;
}

export const DWELLING_TIERS: BuildingType[] = [
  BuildingType.DWELLING_1,
  BuildingType.DWELLING_2,
  BuildingType.DWELLING_3,
  BuildingType.DWELLING_4,
  BuildingType.DWELLING_5,
  BuildingType.DWELLING_6,
  BuildingType.DWELLING_7,
];

export const UPGRADED_DWELLING_TIERS: BuildingType[] = UPGRADED_DWELLING_TYPES;

type SevenTierUnits = [UnitType, UnitType, UnitType, UnitType, UnitType, UnitType, UnitType];

const FACTION_GROUP_KEYS: Record<Faction, CreatureGroupKey> = {
  [Faction.CASTLE]: "castle",
  [Faction.RAMPART]: "rampart",
  [Faction.TOWER]: "tower",
  [Faction.INFERNO]: "inferno",
  [Faction.NECROPOLIS]: "necropolis",
  [Faction.DUNGEON]: "dungeon",
  [Faction.STRONGHOLD]: "stronghold",
  [Faction.FORTRESS]: "fortress",
  [Faction.CONFLUX]: "conflux",
};

function tierUnits(group: CreatureGroupKey, upgradeLevel: number): SevenTierUnits {
  const units = CREATURES
    .filter((creature) => creature.group === group && creature.upgradeLevel === upgradeLevel && creature.tier >= 1 && creature.tier <= 7)
    .sort((a, b) => a.tier - b.tier)
    .map((creature) => creature.type);

  if (units.length !== 7) {
    throw new Error(`Expected 7 tier units for faction group ${group} upgrade ${upgradeLevel}, got ${units.length}`);
  }

  return units as SevenTierUnits;
}

export const FACTION_UNITS = Object.fromEntries(
  Object.entries(FACTION_GROUP_KEYS).map(([faction, group]) => [faction, tierUnits(group, 0)]),
) as Record<Faction, SevenTierUnits>;

export const FACTION_UPGRADED_UNITS = Object.fromEntries(
  Object.entries(FACTION_GROUP_KEYS).map(([faction, group]) => [faction, tierUnits(group, 2)]),
) as Record<Faction, SevenTierUnits>;

export const FACTION_TOWN_NAMES: Record<Faction, string> = {
  [Faction.CASTLE]: "Château",
  [Faction.RAMPART]: "Rempart",
  [Faction.TOWER]: "Tour d'Ivoire",
  [Faction.INFERNO]: "Hadès",
  [Faction.NECROPOLIS]: "Nécropole",
  [Faction.DUNGEON]: "Donjon",
  [Faction.STRONGHOLD]: "Bastion",
  [Faction.FORTRESS]: "Forteresse",
  [Faction.CONFLUX]: "Conflux",
};

export function tierForUnit(unitType: UnitType): { faction: Faction; tier: number } | null {
  for (const faction of Object.keys(FACTION_UNITS) as Faction[]) {
    const idx = FACTION_UNITS[faction].indexOf(unitType);
    if (idx >= 0) return { faction, tier: idx };
  }
  return null;
}

export function dwellingForUnit(unitType: UnitType): BuildingType | null {
  const info = tierForUnit(unitType);
  return info ? DWELLING_TIERS[info.tier] : null;
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
    description: "Prépare le recrutement des troupes.",
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
    description: "Produit une ressource selon la faction de la ville chaque jour.",
    cost: { gold: 1500, wood: 5, ore: 5 },
    requires: [BuildingType.MARKET],
  },
  {
    type: BuildingType.DWELLING_1,
    label: "Habitat (palier 1)",
    description: "Permet de recruter les unités de palier 1 de la faction.",
    cost: { gold: 1000, wood: 5 },
    requires: [BuildingType.BARRACKS],
  },
  {
    type: BuildingType.DWELLING_2,
    label: "Habitat (palier 2)",
    description: "Permet de recruter les unités de palier 2.",
    cost: { gold: 1500, wood: 10 },
    requires: [BuildingType.DWELLING_1],
  },
  {
    type: BuildingType.DWELLING_3,
    label: "Habitat (palier 3)",
    description: "Permet de recruter les unités de palier 3.",
    cost: { gold: 2500, ore: 10 },
    requires: [BuildingType.DWELLING_2],
  },
  {
    type: BuildingType.DWELLING_4,
    label: "Habitat (palier 4)",
    description: "Permet de recruter les unités de palier 4.",
    cost: { gold: 4000, ore: 15, wood: 5 },
    requires: [BuildingType.DWELLING_3],
  },
  {
    type: BuildingType.DWELLING_5,
    label: "Habitat (palier 5)",
    description: "Permet de recruter les unités de palier 5.",
    cost: { gold: 6000, ore: 10, wood: 10, mercury: 5 },
    requires: [BuildingType.DWELLING_4],
  },
  {
    type: BuildingType.DWELLING_6,
    label: "Habitat (palier 6)",
    description: "Permet de recruter les unités de palier 6.",
    cost: { gold: 10000, ore: 20, crystals: 5 },
    requires: [BuildingType.DWELLING_5],
  },
  {
    type: BuildingType.DWELLING_7,
    label: "Habitat (palier 7)",
    description: "Permet de recruter les unités d'élite (palier 7).",
    cost: { gold: 20000, ore: 20, crystals: 10, sulfur: 10 },
    requires: [BuildingType.DWELLING_6],
  },
];

export function getFactionBuildingRules(faction: Faction): TownBuildingRule[] {
  return getTownBuildingRules(
    faction,
    FACTION_UNITS[faction] ?? FACTION_UNITS[Faction.CASTLE],
    FACTION_UPGRADED_UNITS[faction] ?? FACTION_UPGRADED_UNITS[Faction.CASTLE],
  );
}

export function getFactionBuildingRule(faction: Faction, building: BuildingType | string): TownBuildingRule | undefined {
  return getFactionBuildingRules(faction).find((rule) => rule.type === building);
}

export function getRecruitableUnitsForFaction(faction: Faction) {
  const baseUnits = FACTION_UNITS[faction] ?? FACTION_UNITS[Faction.CASTLE];
  const upgradedUnits = FACTION_UPGRADED_UNITS[faction] ?? FACTION_UPGRADED_UNITS[Faction.CASTLE];
  return [
    ...baseUnits.map((unitType, tier) => ({
      unitType,
      tier,
      dwelling: BASE_DWELLING_TYPES[tier],
      rule: UNIT_RULES[unitType],
      upgraded: false,
    })),
    ...upgradedUnits.map((unitType, tier) => ({
      unitType,
      tier,
      dwelling: UPGRADED_DWELLING_TYPES[tier],
      rule: UNIT_RULES[unitType],
      upgraded: true,
    })),
  ];
}

export function getGrowthForBuiltTownBuilding(faction: Faction, building: BuildingType | string) {
  const rule = getFactionBuildingRule(faction, building);
  const growth: Partial<Record<UnitType, number>> = {};
  if (rule?.unlocksUnit) {
    const unitRule = UNIT_RULES[rule.unlocksUnit];
    if (unitRule) growth[rule.unlocksUnit] = unitRule.growth;
  }
  for (const [unitType, amount] of Object.entries(rule?.growthBonus ?? {})) {
    growth[unitType as UnitType] = (growth[unitType as UnitType] ?? 0) + (amount ?? 0);
  }
  return growth;
}

export function getTownWeeklyGrowth(faction: Faction, buildings: Array<BuildingType | string>): Partial<Record<UnitType, number>> {
  const builtSet = new Set(buildings);
  const rules = getFactionBuildingRules(faction);
  const upgradedReplaced = new Set<UnitType>();
  for (const rule of rules) {
    if (rule.category === "dwelling_upgrade" && rule.replacesUnit && builtSet.has(rule.type)) {
      upgradedReplaced.add(rule.replacesUnit);
    }
  }
  const growth: Partial<Record<UnitType, number>> = {};
  let hasGrail = false;
  for (const building of buildings) {
    const rule = rules.find((r) => r.type === building);
    if (!rule) continue;
    if (rule.grail) hasGrail = true;
    if (rule.unlocksUnit && !upgradedReplaced.has(rule.unlocksUnit)) {
      const unitRule = UNIT_RULES[rule.unlocksUnit];
      if (unitRule) growth[rule.unlocksUnit] = (growth[rule.unlocksUnit] ?? 0) + unitRule.growth;
    }
    for (const [unitType, amount] of Object.entries(rule.growthBonus ?? {})) {
      const key = unitType as UnitType;
      if (upgradedReplaced.has(key)) continue;
      growth[key] = (growth[key] ?? 0) + (amount ?? 0);
    }
  }
  if (hasGrail) {
    for (const key of Object.keys(growth) as UnitType[]) {
      growth[key] = Math.floor((growth[key] ?? 0) * 1.5);
    }
  }
  return growth;
}

function dwellingForTier(tier: number): BuildingType {
  const index = Math.min(Math.max(Math.floor(tier), 1), DWELLING_TIERS.length) - 1;
  return DWELLING_TIERS[index];
}

export const UNIT_RULES = Object.fromEntries(
  CREATURES.map((creature) => [
    creature.type,
    {
      type: creature.type,
      label: creature.label,
      cost: creature.cost,
      health: creature.health,
      dwelling: dwellingForTier(creature.tier),
      growth: creature.growth,
    },
  ]),
) as Record<UnitType, UnitRule>;

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
    gems: resources.gems - (cost.gems ?? 0),
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
  if (cost.gems) parts.push(`${cost.gems} gemmes`);
  if (cost.sulfur) parts.push(`${cost.sulfur} soufre`);
  return parts.join(" ");
}
