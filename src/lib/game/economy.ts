import { BuildingType, Faction, Resources, ResourceBuildingType, UnitType } from "./types";

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
    production: { wood: 5 },
    guardianBasePower: 200,
  },
  {
    type: ResourceBuildingType.ORE_PIT,
    label: "Mine de minerai",
    production: { ore: 5 },
    guardianBasePower: 250,
  },
  {
    type: ResourceBuildingType.ALCHEMIST_LAB,
    label: "Laboratoire d'alchimiste",
    production: { mercury: 3 },
    guardianBasePower: 350,
  },
  {
    type: ResourceBuildingType.CRYSTAL_CAVERN,
    label: "Caverne de cristaux",
    production: { crystals: 3 },
    guardianBasePower: 350,
  },
  {
    type: ResourceBuildingType.SULFUR_DUNE,
    label: "Dune de soufre",
    production: { sulfur: 3 },
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

export const FACTION_UNITS: Record<Faction, [UnitType, UnitType, UnitType, UnitType, UnitType, UnitType, UnitType]> = {
  [Faction.CASTLE]: [
    UnitType.PIKEMAN,
    UnitType.ARCHER,
    UnitType.GRIFFIN,
    UnitType.SWORDSMAN,
    UnitType.MONK,
    UnitType.CAVALIER,
    UnitType.ANGEL,
  ],
  [Faction.RAMPART]: [
    UnitType.CENTAUR,
    UnitType.DWARF,
    UnitType.WOOD_ELF,
    UnitType.PEGASUS,
    UnitType.DENDROID,
    UnitType.UNICORN,
    UnitType.GREEN_DRAGON,
  ],
  [Faction.TOWER]: [
    UnitType.GREMLIN,
    UnitType.GARGOYLE,
    UnitType.GOLEM,
    UnitType.MAGE,
    UnitType.GENIE,
    UnitType.NAGA,
    UnitType.GIANT,
  ],
  [Faction.INFERNO]: [
    UnitType.IMP,
    UnitType.GOG,
    UnitType.HELL_HOUND,
    UnitType.DEMON,
    UnitType.PIT_FIEND,
    UnitType.EFREET,
    UnitType.DEVIL,
  ],
  [Faction.NECROPOLIS]: [
    UnitType.SKELETON,
    UnitType.ZOMBIE,
    UnitType.WIGHT,
    UnitType.VAMPIRE,
    UnitType.LICH,
    UnitType.BLACK_KNIGHT,
    UnitType.BONE_DRAGON,
  ],
  [Faction.DUNGEON]: [
    UnitType.TROGLODYTE,
    UnitType.HARPY,
    UnitType.BEHOLDER,
    UnitType.MEDUSA,
    UnitType.MINOTAUR,
    UnitType.MANTICORE,
    UnitType.RED_DRAGON,
  ],
  [Faction.STRONGHOLD]: [
    UnitType.GOBLIN,
    UnitType.WOLF_RIDER,
    UnitType.ORC,
    UnitType.OGRE,
    UnitType.ROC,
    UnitType.CYCLOPS,
    UnitType.BEHEMOTH,
  ],
  [Faction.FORTRESS]: [
    UnitType.GNOLL,
    UnitType.LIZARDMAN,
    UnitType.SERPENT_FLY,
    UnitType.BASILISK,
    UnitType.GORGON,
    UnitType.WYVERN,
    UnitType.HYDRA,
  ],
};

export const FACTION_TOWN_NAMES: Record<Faction, string> = {
  [Faction.CASTLE]: "Château",
  [Faction.RAMPART]: "Rempart",
  [Faction.TOWER]: "Tour d'Ivoire",
  [Faction.INFERNO]: "Hadès",
  [Faction.NECROPOLIS]: "Nécropole",
  [Faction.DUNGEON]: "Donjon",
  [Faction.STRONGHOLD]: "Bastion",
  [Faction.FORTRESS]: "Forteresse",
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
    description: "+500 pièces d'or à chaque nouveau jour.",
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

export const UNIT_RULES: Record<UnitType, UnitRule> = {
  // Château
  [UnitType.PIKEMAN]:    { type: UnitType.PIKEMAN,    label: "Piquier",        cost: { gold: 60 },                          health: 12,  dwelling: BuildingType.DWELLING_1, growth: 14 },
  [UnitType.HALBERDIER]: { type: UnitType.HALBERDIER, label: "Hallebardier",   cost: { gold: 75 },                          health: 12,  dwelling: BuildingType.DWELLING_1, growth: 14 },
  [UnitType.ARCHER]:     { type: UnitType.ARCHER,     label: "Archer",         cost: { gold: 100 },                         health: 10,  dwelling: BuildingType.DWELLING_2, growth: 9 },
  [UnitType.MARKSMAN]:   { type: UnitType.MARKSMAN,   label: "Tireur d'élite", cost: { gold: 150 },                         health: 10,  dwelling: BuildingType.DWELLING_2, growth: 9 },
  [UnitType.GRIFFIN]:    { type: UnitType.GRIFFIN,    label: "Griffon",        cost: { gold: 200 },                         health: 25,  dwelling: BuildingType.DWELLING_3, growth: 7 },
  [UnitType.ROYAL_GRIFFIN]: { type: UnitType.ROYAL_GRIFFIN, label: "Griffon royal", cost: { gold: 240 },                    health: 25,  dwelling: BuildingType.DWELLING_3, growth: 7 },
  [UnitType.SWORDSMAN]:  { type: UnitType.SWORDSMAN,  label: "Épéiste",        cost: { gold: 300 },                         health: 35,  dwelling: BuildingType.DWELLING_4, growth: 4 },
  [UnitType.CRUSADER]:   { type: UnitType.CRUSADER,   label: "Croisé",         cost: { gold: 400 },                         health: 35,  dwelling: BuildingType.DWELLING_4, growth: 4 },
  [UnitType.MONK]:       { type: UnitType.MONK,       label: "Moine",          cost: { gold: 400 },                         health: 30,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.ZEALOT]:     { type: UnitType.ZEALOT,     label: "Zélote",         cost: { gold: 450 },                         health: 30,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.CAVALIER]:   { type: UnitType.CAVALIER,   label: "Cavalier",       cost: { gold: 1000 },                        health: 100, dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.CHAMPION]:   { type: UnitType.CHAMPION,   label: "Champion",       cost: { gold: 1200 },                        health: 100, dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.ANGEL]:      { type: UnitType.ANGEL,      label: "Ange",           cost: { gold: 3000, crystals: 1 },           health: 200, dwelling: BuildingType.DWELLING_7, growth: 1 },
  [UnitType.ARCHANGEL]:  { type: UnitType.ARCHANGEL,  label: "Archange",       cost: { gold: 5000, crystals: 3 },           health: 250, dwelling: BuildingType.DWELLING_7, growth: 1 },

  // Rempart
  [UnitType.CENTAUR]:      { type: UnitType.CENTAUR,      label: "Centaure",       cost: { gold: 70 },                       health: 8,   dwelling: BuildingType.DWELLING_1, growth: 14 },
  [UnitType.DWARF]:        { type: UnitType.DWARF,        label: "Nain",           cost: { gold: 120 },                      health: 20,  dwelling: BuildingType.DWELLING_2, growth: 8 },
  [UnitType.WOOD_ELF]:     { type: UnitType.WOOD_ELF,     label: "Elfe sylvestre", cost: { gold: 200 },                      health: 15,  dwelling: BuildingType.DWELLING_3, growth: 7 },
  [UnitType.PEGASUS]:      { type: UnitType.PEGASUS,      label: "Pégase",         cost: { gold: 250, mercury: 1 },          health: 30,  dwelling: BuildingType.DWELLING_4, growth: 5 },
  [UnitType.DENDROID]:     { type: UnitType.DENDROID,     label: "Dendroïde",      cost: { gold: 350, wood: 1 },             health: 55,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.UNICORN]:      { type: UnitType.UNICORN,      label: "Licorne",        cost: { gold: 850, crystals: 1 },         health: 80,  dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.GREEN_DRAGON]: { type: UnitType.GREEN_DRAGON, label: "Dragon vert",    cost: { gold: 2400, crystals: 1 },        health: 180, dwelling: BuildingType.DWELLING_7, growth: 1 },

  // Tour
  [UnitType.GREMLIN]:  { type: UnitType.GREMLIN,  label: "Gremlin",         cost: { gold: 30 },                       health: 4,   dwelling: BuildingType.DWELLING_1, growth: 16 },
  [UnitType.GARGOYLE]: { type: UnitType.GARGOYLE, label: "Gargouille",      cost: { gold: 130 },                      health: 16,  dwelling: BuildingType.DWELLING_2, growth: 9 },
  [UnitType.GOLEM]:    { type: UnitType.GOLEM,    label: "Golem de pierre", cost: { gold: 150 },                      health: 30,  dwelling: BuildingType.DWELLING_3, growth: 6 },
  [UnitType.MAGE]:     { type: UnitType.MAGE,     label: "Mage",            cost: { gold: 350, mercury: 2 },          health: 25,  dwelling: BuildingType.DWELLING_4, growth: 4 },
  [UnitType.GENIE]:    { type: UnitType.GENIE,    label: "Génie",           cost: { gold: 550, mercury: 1 },          health: 40,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.NAGA]:     { type: UnitType.NAGA,     label: "Naga",            cost: { gold: 1100, mercury: 1 },         health: 110, dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.GIANT]:    { type: UnitType.GIANT,    label: "Géant",           cost: { gold: 2000, crystals: 1 },        health: 150, dwelling: BuildingType.DWELLING_7, growth: 1 },

  // Hadès
  [UnitType.IMP]:        { type: UnitType.IMP,        label: "Lutin",             cost: { gold: 50 },                    health: 4,   dwelling: BuildingType.DWELLING_1, growth: 15 },
  [UnitType.GOG]:        { type: UnitType.GOG,        label: "Gog",               cost: { gold: 125 },                   health: 13,  dwelling: BuildingType.DWELLING_2, growth: 8 },
  [UnitType.HELL_HOUND]: { type: UnitType.HELL_HOUND, label: "Chien des enfers",  cost: { gold: 200 },                   health: 15,  dwelling: BuildingType.DWELLING_3, growth: 5 },
  [UnitType.DEMON]:      { type: UnitType.DEMON,      label: "Démon",             cost: { gold: 250 },                   health: 35,  dwelling: BuildingType.DWELLING_4, growth: 4 },
  [UnitType.PIT_FIEND]:  { type: UnitType.PIT_FIEND,  label: "Suppôt du Tartare", cost: { gold: 500, sulfur: 1 },        health: 45,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.EFREET]:     { type: UnitType.EFREET,     label: "Efrit",             cost: { gold: 900, sulfur: 1 },        health: 90,  dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.DEVIL]:      { type: UnitType.DEVIL,      label: "Diable",            cost: { gold: 2700, mercury: 1 },      health: 160, dwelling: BuildingType.DWELLING_7, growth: 1 },

  // Nécropole
  [UnitType.SKELETON]:     { type: UnitType.SKELETON,     label: "Squelette",       cost: { gold: 60 },                    health: 6,   dwelling: BuildingType.DWELLING_1, growth: 12 },
  [UnitType.ZOMBIE]:       { type: UnitType.ZOMBIE,       label: "Zombie",          cost: { gold: 100 },                   health: 15,  dwelling: BuildingType.DWELLING_2, growth: 8 },
  [UnitType.WIGHT]:        { type: UnitType.WIGHT,        label: "Spectre",         cost: { gold: 230 },                   health: 18,  dwelling: BuildingType.DWELLING_3, growth: 7 },
  [UnitType.VAMPIRE]:      { type: UnitType.VAMPIRE,      label: "Vampire",         cost: { gold: 360 },                   health: 30,  dwelling: BuildingType.DWELLING_4, growth: 4 },
  [UnitType.LICH]:         { type: UnitType.LICH,         label: "Liche",           cost: { gold: 550 },                   health: 30,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.BLACK_KNIGHT]: { type: UnitType.BLACK_KNIGHT, label: "Chevalier noir",  cost: { gold: 1200 },                  health: 120, dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.BONE_DRAGON]:  { type: UnitType.BONE_DRAGON,  label: "Dragon-os",       cost: { gold: 1800, mercury: 1 },      health: 150, dwelling: BuildingType.DWELLING_7, growth: 1 },

  // Donjon
  [UnitType.TROGLODYTE]: { type: UnitType.TROGLODYTE, label: "Troglodyte",  cost: { gold: 50 },                  health: 5,   dwelling: BuildingType.DWELLING_1, growth: 14 },
  [UnitType.HARPY]:      { type: UnitType.HARPY,      label: "Harpie",      cost: { gold: 130 },                 health: 14,  dwelling: BuildingType.DWELLING_2, growth: 8 },
  [UnitType.BEHOLDER]:   { type: UnitType.BEHOLDER,   label: "Tyrannœil",   cost: { gold: 250 },                 health: 22,  dwelling: BuildingType.DWELLING_3, growth: 7 },
  [UnitType.MEDUSA]:     { type: UnitType.MEDUSA,     label: "Méduse",      cost: { gold: 300 },                 health: 25,  dwelling: BuildingType.DWELLING_4, growth: 4 },
  [UnitType.MINOTAUR]:   { type: UnitType.MINOTAUR,   label: "Minotaure",   cost: { gold: 500, crystals: 1 },    health: 50,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.MANTICORE]:  { type: UnitType.MANTICORE,  label: "Manticore",   cost: { gold: 850, sulfur: 1 },      health: 80,  dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.RED_DRAGON]: { type: UnitType.RED_DRAGON, label: "Dragon rouge", cost: { gold: 2500, sulfur: 1 },    health: 180, dwelling: BuildingType.DWELLING_7, growth: 1 },

  // Bastion
  [UnitType.GOBLIN]:     { type: UnitType.GOBLIN,     label: "Gobelin",          cost: { gold: 40 },                  health: 5,   dwelling: BuildingType.DWELLING_1, growth: 14 },
  [UnitType.WOLF_RIDER]: { type: UnitType.WOLF_RIDER, label: "Monteur de loup",  cost: { gold: 100 },                 health: 10,  dwelling: BuildingType.DWELLING_2, growth: 9 },
  [UnitType.ORC]:        { type: UnitType.ORC,        label: "Orc",              cost: { gold: 150 },                 health: 15,  dwelling: BuildingType.DWELLING_3, growth: 7 },
  [UnitType.OGRE]:       { type: UnitType.OGRE,       label: "Ogre",             cost: { gold: 300 },                 health: 40,  dwelling: BuildingType.DWELLING_4, growth: 4 },
  [UnitType.ROC]:        { type: UnitType.ROC,        label: "Roc",              cost: { gold: 600 },                 health: 60,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.CYCLOPS]:    { type: UnitType.CYCLOPS,    label: "Cyclope",          cost: { gold: 750, crystals: 1 },    health: 70,  dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.BEHEMOTH]:   { type: UnitType.BEHEMOTH,   label: "Béhémoth",         cost: { gold: 1500 },                health: 160, dwelling: BuildingType.DWELLING_7, growth: 1 },

  // Forteresse
  [UnitType.GNOLL]:       { type: UnitType.GNOLL,       label: "Gnoll",         cost: { gold: 50 },                  health: 6,   dwelling: BuildingType.DWELLING_1, growth: 12 },
  [UnitType.LIZARDMAN]:   { type: UnitType.LIZARDMAN,   label: "Homme-lézard",  cost: { gold: 110 },                 health: 14,  dwelling: BuildingType.DWELLING_2, growth: 9 },
  [UnitType.SERPENT_FLY]: { type: UnitType.SERPENT_FLY, label: "Mouche-dragon", cost: { gold: 220 },                 health: 20,  dwelling: BuildingType.DWELLING_3, growth: 8 },
  [UnitType.BASILISK]:    { type: UnitType.BASILISK,    label: "Basilic",       cost: { gold: 325 },                 health: 35,  dwelling: BuildingType.DWELLING_4, growth: 5 },
  [UnitType.GORGON]:      { type: UnitType.GORGON,      label: "Gorgone",       cost: { gold: 525 },                 health: 70,  dwelling: BuildingType.DWELLING_5, growth: 3 },
  [UnitType.WYVERN]:      { type: UnitType.WYVERN,      label: "Wyverne",       cost: { gold: 800 },                 health: 70,  dwelling: BuildingType.DWELLING_6, growth: 2 },
  [UnitType.HYDRA]:       { type: UnitType.HYDRA,       label: "Hydre",         cost: { gold: 2200, sulfur: 1 },     health: 175, dwelling: BuildingType.DWELLING_7, growth: 1 },
};

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
