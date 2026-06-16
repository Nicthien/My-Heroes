import { BuildingType, Faction, Resources, ResourceBuildingType, UnitType } from "./types";
import { CREATURES } from "./creature-catalog";
import type { CreatureGroupKey } from "./creature-catalog";
import {
  BASE_DWELLING_TYPES,
  UPGRADED_DWELLING_TYPES,
  getTownBuildingRules,
  getTownFortLevel,
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

export const RESOURCE_LABELS_EN: Record<keyof Resources, string> = {
  gold: "gold",
  wood: "wood",
  ore: "ore",
  mercury: "mercury",
  crystals: "crystals",
  gems: "gems",
  sulfur: "sulfur",
};

/** Localized resource name. Defaults to French to keep existing callers intact. */
export function resourceLabel(resource: string, locale: "fr" | "en" = "fr") {
  const map = locale === "en" ? RESOURCE_LABELS_EN : RESOURCE_LABELS;
  return map[resource as keyof Resources] ?? resource;
}

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

export function getResourceBuildingProduction(type: string | undefined): Partial<Resources> | undefined {
  if (!type) return undefined;
  return RESOURCE_BUILDING_RULES.find((rule) => rule.type === type)?.production;
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
  [Faction.CASTLE]: "Couronnes d'Acier",
  [Faction.RAMPART]: "Pacte des Sylves",
  [Faction.TOWER]: "Cercle d'Azur",
  [Faction.INFERNO]: "Braises Profanes",
  [Faction.NECROPOLIS]: "Voile d'Os",
  [Faction.DUNGEON]: "Royaume Sous-Roche",
  [Faction.STRONGHOLD]: "Marteaux Rouges",
  [Faction.FORTRESS]: "Serments du Marais",
  [Faction.CONFLUX]: "Orbe Primordial",
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

// Locates a unit within the faction unit tables, distinguishing the base
// dwelling unit from its upgraded variant (the two keep separate recruit pools).
function unitTierAndUpgrade(unitType: UnitType): { tier: number; upgraded: boolean } | null {
  for (const faction of Object.keys(FACTION_UNITS) as Faction[]) {
    const baseIdx = FACTION_UNITS[faction].indexOf(unitType);
    if (baseIdx >= 0) return { tier: baseIdx, upgraded: false };
    const upgIdx = FACTION_UPGRADED_UNITS[faction].indexOf(unitType);
    if (upgIdx >= 0) return { tier: upgIdx, upgraded: true };
  }
  return null;
}

// Re-keys an availableRecruits pool when a town changes faction: each pending
// recruit count moves to the equivalent tier (and base/upgraded variant) of the
// target faction, so a captured town's accumulated growth carries over to the
// new faction's creatures instead of being stranded under stale unit keys.
export function remapRecruitsToFaction(
  available: Partial<Record<UnitType, number>>,
  faction: Faction,
): Partial<Record<UnitType, number>> {
  const baseUnits = FACTION_UNITS[faction] ?? FACTION_UNITS[Faction.CASTLE];
  const upgradedUnits = FACTION_UPGRADED_UNITS[faction] ?? FACTION_UPGRADED_UNITS[Faction.CASTLE];
  const result: Partial<Record<UnitType, number>> = {};
  for (const [unit, count] of Object.entries(available) as Array<[UnitType, number]>) {
    if (!count) continue;
    const info = unitTierAndUpgrade(unit);
    if (!info) continue;
    const target = info.upgraded ? upgradedUnits[info.tier] : baseUnits[info.tier];
    result[target] = (result[target] ?? 0) + count;
  }
  return result;
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
  const rules = getFactionBuildingRules(faction);
  const growth: Partial<Record<UnitType, number>> = {};
  // Base and upgraded dwellings of a tier each keep their OWN recruit pool and grow
  // independently: a town with both built produces base growth + upgraded growth
  // every week (separate counters), not a single shared pool.
  let hasGrail = false;
  for (const building of buildings) {
    const rule = rules.find((r) => r.type === building);
    if (rule?.grail) hasGrail = true;
  }

  // The fortification ladder and the Grail multiply each dwelling's growth before
  // any flat per-creature bonuses. Citadel ×1.5, Castle ×2 (Fort alone = no growth
  // bonus), Grail an additional ×1.5.
  const fortLevel = getTownFortLevel(buildings);
  const fortMultiplier = fortLevel >= 3 ? 2 : fortLevel === 2 ? 1.5 : 1;
  const baseMultiplier = fortMultiplier * (hasGrail ? 1.5 : 1);

  // 1) Per-dwelling growth (base AND upgraded each count), scaled by the fort/Grail multiplier.
  for (const building of buildings) {
    const rule = rules.find((r) => r.type === building);
    if (!rule?.unlocksUnit) continue;
    const unitRule = UNIT_RULES[rule.unlocksUnit];
    if (unitRule) growth[rule.unlocksUnit] = (growth[rule.unlocksUnit] ?? 0) + Math.floor(unitRule.growth * baseMultiplier);
  }
  // 2) Flat per-creature growth bonuses from special buildings, added after the multipliers.
  for (const building of buildings) {
    const rule = rules.find((r) => r.type === building);
    for (const [unitType, amount] of Object.entries(rule?.growthBonus ?? {})) {
      const key = unitType as UnitType;
      growth[key] = (growth[key] ?? 0) + (amount ?? 0);
    }
  }
  return growth;
}

function dwellingForTier(tier: number): BuildingType {
  const index = Math.min(Math.max(Math.floor(tier), 1), DWELLING_TIERS.length) - 1;
  return DWELLING_TIERS[index];
}

export const UNIT_RULES = Object.fromEntries([
  ...CREATURES.map((creature) => [
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
  [UnitType.BALLISTA, { type: UnitType.BALLISTA, label: "Baliste", cost: { gold: 2500 }, health: 250, dwelling: BuildingType.DWELLING_1, growth: 0 }],
  [UnitType.FIRST_AID_TENT, { type: UnitType.FIRST_AID_TENT, label: "Tente de premiers secours", cost: { gold: 750 }, health: 75, dwelling: BuildingType.DWELLING_1, growth: 0 }],
  [UnitType.AMMO_CART, { type: UnitType.AMMO_CART, label: "Chariot de munitions", cost: { gold: 1000 }, health: 100, dwelling: BuildingType.DWELLING_1, growth: 0 }],
  [UnitType.CATAPULT, { type: UnitType.CATAPULT, label: "Catapulte", cost: { gold: 0 }, health: 500, dwelling: BuildingType.DWELLING_1, growth: 0 }],
  // King mode unique unit: not recruitable (absent from CREATURES/FACTION_UNITS), but
  // needs an economy entry so garrison/army transfers and lookups resolve it.
  [UnitType.KING, { type: UnitType.KING, label: "Roi", cost: { gold: 0 }, health: 100, dwelling: BuildingType.DWELLING_1, growth: 0 }],
]) as Record<UnitType, UnitRule>;

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
