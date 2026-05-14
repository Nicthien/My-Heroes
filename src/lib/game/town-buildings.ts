import { BuildingType, Faction, Resources, UnitType } from "./types";

export type ResourceCost = Partial<Resources>;

export type TownBuildingCategory =
  | "common"
  | "mage_guild"
  | "dwelling"
  | "dwelling_upgrade"
  | "unique";

export interface TownBuildingRule {
  type: BuildingType;
  label: string;
  description: string;
  category: TownBuildingCategory;
  cost: ResourceCost;
  requires?: BuildingType[];
  unlocksUnit?: UnitType;
  replacesUnit?: UnitType;
  dailyProduction?: ResourceCost;
  growthBonus?: Partial<Record<UnitType, number>>;
}

interface DwellingName {
  base: string;
  upgraded: string;
}

interface UniqueBuildingTemplate {
  label: string;
  description: string;
  cost?: ResourceCost;
  requires?: BuildingType[];
  dailyProduction?: ResourceCost;
  growthBonus?: Partial<Record<UnitType, number>>;
}

export const BASE_DWELLING_TYPES: BuildingType[] = [
  BuildingType.DWELLING_1,
  BuildingType.DWELLING_2,
  BuildingType.DWELLING_3,
  BuildingType.DWELLING_4,
  BuildingType.DWELLING_5,
  BuildingType.DWELLING_6,
  BuildingType.DWELLING_7,
];

export const UPGRADED_DWELLING_TYPES: BuildingType[] = [
  BuildingType.UPG_DWELLING_1,
  BuildingType.UPG_DWELLING_2,
  BuildingType.UPG_DWELLING_3,
  BuildingType.UPG_DWELLING_4,
  BuildingType.UPG_DWELLING_5,
  BuildingType.UPG_DWELLING_6,
  BuildingType.UPG_DWELLING_7,
];

const UNIQUE_TYPES: BuildingType[] = [
  BuildingType.UNIQUE_1,
  BuildingType.UNIQUE_2,
  BuildingType.UNIQUE_3,
  BuildingType.UNIQUE_4,
  BuildingType.UNIQUE_5,
  BuildingType.UNIQUE_6,
];

const BASE_DWELLING_COSTS: ResourceCost[] = [
  { gold: 1000, wood: 5 },
  { gold: 1500, wood: 10 },
  { gold: 2500, ore: 10 },
  { gold: 4000, ore: 15, wood: 5 },
  { gold: 6000, ore: 10, wood: 10, mercury: 5 },
  { gold: 10000, ore: 20, crystals: 5 },
  { gold: 20000, ore: 20, crystals: 10, sulfur: 10 },
];

const UPGRADED_DWELLING_COSTS: ResourceCost[] = [
  { gold: 1000 },
  { gold: 1500 },
  { gold: 2000, ore: 5 },
  { gold: 3000, wood: 5, ore: 5 },
  { gold: 4000, mercury: 3, sulfur: 3 },
  { gold: 6000, crystals: 5 },
  { gold: 10000, crystals: 5, sulfur: 5 },
];

export const TOWN_DWELLING_NAMES: Record<Faction, DwellingName[]> = {
  [Faction.CASTLE]: [
    { base: "Corps de garde", upgraded: "Corps de garde amélioré" },
    { base: "Tour des archers", upgraded: "Tour des archers améliorée" },
    { base: "Tour des griffons", upgraded: "Tour des griffons améliorée" },
    { base: "Caserne", upgraded: "Caserne améliorée" },
    { base: "Monastère", upgraded: "Monastère amélioré" },
    { base: "Terrain d'entraînement", upgraded: "Terrain d'entraînement amélioré" },
    { base: "Portail de gloire", upgraded: "Portail de gloire amélioré" },
  ],
  [Faction.RAMPART]: [
    { base: "Écuries de centaures", upgraded: "Écuries de centaures améliorées" },
    { base: "Chaumière des nains", upgraded: "Chaumière des nains améliorée" },
    { base: "Habitation", upgraded: "Habitation améliorée" },
    { base: "Source enchantée", upgraded: "Source enchantée améliorée" },
    { base: "Arches dendroïdes", upgraded: "Arches dendroïdes améliorées" },
    { base: "Clairière des licornes", upgraded: "Clairière des licornes améliorée" },
    { base: "Falaises des dragons", upgraded: "Falaises des dragons améliorées" },
  ],
  [Faction.TOWER]: [
    { base: "Atelier", upgraded: "Atelier amélioré" },
    { base: "Parapet", upgraded: "Parapet amélioré" },
    { base: "Fabrique de golems", upgraded: "Fabrique de golems améliorée" },
    { base: "Tour des mages", upgraded: "Tour des mages améliorée" },
    { base: "Autel des vœux", upgraded: "Autel des vœux amélioré" },
    { base: "Pavillon doré", upgraded: "Pavillon doré amélioré" },
    { base: "Temple des nuages", upgraded: "Temple des nuages amélioré" },
  ],
  [Faction.INFERNO]: [
    { base: "Creuset des diablotins", upgraded: "Creuset des diablotins amélioré" },
    { base: "Salle des péchés", upgraded: "Salle des péchés améliorée" },
    { base: "Chenils", upgraded: "Chenils améliorés" },
    { base: "Porte démoniaque", upgraded: "Porte démoniaque améliorée" },
    { base: "Gouffre infernal", upgraded: "Gouffre infernal amélioré" },
    { base: "Lac de feu", upgraded: "Lac de feu amélioré" },
    { base: "Palais abandonné", upgraded: "Palais abandonné amélioré" },
  ],
  [Faction.NECROPOLIS]: [
    { base: "Temple maudit", upgraded: "Temple maudit amélioré" },
    { base: "Cimetière", upgraded: "Cimetière amélioré" },
    { base: "Tombeau des âmes", upgraded: "Tombeau des âmes amélioré" },
    { base: "Domaine", upgraded: "Domaine amélioré" },
    { base: "Mausolée", upgraded: "Mausolée amélioré" },
    { base: "Salle des ténèbres", upgraded: "Salle des ténèbres améliorée" },
    { base: "Crypte des dragons", upgraded: "Crypte des dragons améliorée" },
  ],
  [Faction.DUNGEON]: [
    { base: "Terrier", upgraded: "Terrier amélioré" },
    { base: "Perchoir des harpies", upgraded: "Perchoir des harpies amélioré" },
    { base: "Pilier des yeux", upgraded: "Pilier des yeux amélioré" },
    { base: "Chapelle des voix éteintes", upgraded: "Chapelle des voix éteintes améliorée" },
    { base: "Labyrinthe", upgraded: "Labyrinthe amélioré" },
    { base: "Repaire des manticores", upgraded: "Repaire des manticores amélioré" },
    { base: "Caverne des dragons", upgraded: "Caverne des dragons améliorée" },
  ],
  [Faction.STRONGHOLD]: [
    { base: "Caserne des gobelins", upgraded: "Caserne des gobelins améliorée" },
    { base: "Enclos des loups", upgraded: "Enclos des loups amélioré" },
    { base: "Tour des orcs", upgraded: "Tour des orcs améliorée" },
    { base: "Fort des ogres", upgraded: "Fort des ogres amélioré" },
    { base: "Nid de falaise", upgraded: "Nid de falaise amélioré" },
    { base: "Caverne des cyclopes", upgraded: "Caverne des cyclopes améliorée" },
    { base: "Repaire des béhémoths", upgraded: "Repaire des béhémoths amélioré" },
  ],
  [Faction.FORTRESS]: [
    { base: "Hutte des gnolls", upgraded: "Hutte des gnolls améliorée" },
    { base: "Tanière des lézards", upgraded: "Tanière des lézards améliorée" },
    { base: "Ruche des mouches serpents", upgraded: "Ruche des mouches serpents améliorée" },
    { base: "Fosse aux basilics", upgraded: "Fosse aux basilics améliorée" },
    { base: "Repaire des gorgones", upgraded: "Repaire des gorgones amélioré" },
    { base: "Nid des wyvernes", upgraded: "Nid des wyvernes amélioré" },
    { base: "Étang des hydres", upgraded: "Étang des hydres amélioré" },
  ],
  [Faction.CONFLUX]: [
    { base: "Lanterne magique", upgraded: "Lanterne magique améliorée" },
    { base: "Autel de l'air", upgraded: "Autel de l'air amélioré" },
    { base: "Autel de l'eau", upgraded: "Autel de l'eau amélioré" },
    { base: "Autel du feu", upgraded: "Autel du feu amélioré" },
    { base: "Autel de la terre", upgraded: "Autel de la terre amélioré" },
    { base: "Autel de la pensée", upgraded: "Autel de la pensée amélioré" },
    { base: "Bûcher", upgraded: "Bûcher amélioré" },
  ],
};

const RESOURCE_SILO_PRODUCTION: Record<Faction, ResourceCost> = {
  [Faction.CASTLE]: { wood: 1, ore: 1 },
  [Faction.RAMPART]: { crystals: 1 },
  [Faction.TOWER]: { gems: 1 },
  [Faction.INFERNO]: { sulfur: 1 },
  [Faction.NECROPOLIS]: { wood: 1, ore: 1 },
  [Faction.DUNGEON]: { sulfur: 1 },
  [Faction.STRONGHOLD]: { wood: 1, ore: 1 },
  [Faction.FORTRESS]: { wood: 1, ore: 1 },
  [Faction.CONFLUX]: { mercury: 1 },
};

const UNIQUE_BUILDINGS: Record<Faction, UniqueBuildingTemplate[]> = {
  [Faction.CASTLE]: [
    { label: "Confrérie de l'épée", description: "+2 au moral des défenseurs de la ville.", cost: { gold: 500, wood: 5 } },
    { label: "Chantier naval", description: "Permet d'acheter un bateau si la ville borde l'eau.", cost: { gold: 2000, wood: 20 } },
    { label: "Phare", description: "Améliore les déplacements alliés en mer.", cost: { gold: 2000, wood: 10 } },
    { label: "Écuries", description: "Améliore le déplacement du héros en visite pour la semaine.", cost: { gold: 2000, wood: 10 } },
    { label: "Bastion des griffons", description: "+3 à la croissance hebdomadaire des griffons.", cost: { gold: 1000 }, growthBonus: { [UnitType.GRIFFIN]: 3, [UnitType.ROYAL_GRIFFIN]: 3 } },
    { label: "Colosse", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 } },
  ],
  [Faction.RAMPART]: [
    { label: "Étang mystique", description: "Produit une petite ressource rare aléatoire chaque semaine.", cost: { gold: 2000, mercury: 2, crystals: 2, gems: 2, sulfur: 2 } },
    { label: "Fontaine de fortune", description: "Améliore la chance du héros en visite.", cost: { gold: 1500 } },
    { label: "Trésorerie", description: "Ajoute des intérêts à la réserve d'or du royaume.", cost: { gold: 5000, wood: 10, ore: 10 } },
    { label: "Guilde des mineurs", description: "+1 à la croissance hebdomadaire des nains.", cost: { gold: 1000 }, growthBonus: { [UnitType.DWARF]: 1, [UnitType.BATTLE_DWARF]: 1 } },
    { label: "Jeunes dendroïdes", description: "+2 à la croissance hebdomadaire des dendroïdes.", cost: { gold: 2000 }, growthBonus: { [UnitType.DENDROID]: 2, [UnitType.DENDROID_SOLDIER]: 2 } },
    { label: "Gardien des esprits", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 } },
  ],
  [Faction.TOWER]: [
    { label: "Tour de guet", description: "Augmente la portée de reconnaissance de la ville.", cost: { gold: 1000, wood: 5 } },
    { label: "Bibliothèque", description: "Ajoute des sorts à la guilde des mages.", cost: { gold: 1500, wood: 5, ore: 5 } },
    { label: "Mur de connaissance", description: "+1 en connaissance au héros en visite.", cost: { gold: 1000 } },
    { label: "Marchands d'artefacts", description: "Permet aux héros en visite d'acheter des artefacts.", cost: { gold: 10000 } },
    { label: "Ailes du sculpteur", description: "+4 à la croissance hebdomadaire des gargouilles.", cost: { gold: 1000 }, growthBonus: { [UnitType.GARGOYLE]: 4, [UnitType.OBSIDIAN_GARGOYLE]: 4 } },
    { label: "Vaisseau céleste", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 } },
  ],
  [Faction.INFERNO]: [
    { label: "Porte du château", description: "Relie les villes Hadès pour transférer des créatures.", cost: { gold: 10000, wood: 5, ore: 5 } },
    { label: "Ordre du feu", description: "+1 en puissance magique au héros en visite.", cost: { gold: 1000 } },
    { label: "Nuages de soufre", description: "Ajoute des dégâts de feu aux défenses de la ville.", cost: { gold: 2000, sulfur: 5 } },
    { label: "Bassin de naissance", description: "+8 à la croissance hebdomadaire des diablotins.", cost: { gold: 1000 }, growthBonus: { [UnitType.IMP]: 8, [UnitType.FAMILIAR]: 8 } },
    { label: "Cages", description: "+2 à la croissance hebdomadaire des démons.", cost: { gold: 1000 }, growthBonus: { [UnitType.DEMON]: 2, [UnitType.HORNED_DEMON]: 2 } },
    { label: "Divinité du feu", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 } },
  ],
  [Faction.NECROPOLIS]: [
    { label: "Voile des ténèbres", description: "Réduit la reconnaissance ennemie autour de la ville.", cost: { gold: 1000, wood: 5 } },
    { label: "Amplificateur de nécromancie", description: "Améliore la nécromancie des héros alliés.", cost: { gold: 1000, ore: 5 } },
    { label: "Transformateur de squelettes", description: "Transforme les créatures vivantes en squelettes.", cost: { gold: 1000, mercury: 5 } },
    { label: "Tombes ouvertes", description: "+6 à la croissance hebdomadaire des squelettes.", cost: { gold: 1000 }, growthBonus: { [UnitType.SKELETON]: 6, [UnitType.SKELETON_WARRIOR]: 6 } },
    { label: "Prison des âmes", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 } },
  ],
  [Faction.DUNGEON]: [
    { label: "Vortex de mana", description: "Double les points de magie du prochain héros en visite.", cost: { gold: 1000, ore: 5 } },
    { label: "Académie des érudits de guerre", description: "+1 en attaque et +1 en défense au héros en visite.", cost: { gold: 1000 } },
    { label: "Marchands d'artefacts", description: "Permet aux héros en visite d'acheter des artefacts.", cost: { gold: 10000 } },
    { label: "Portail d'invocation", description: "Invoque des créatures supplémentaires depuis les demeures extérieures.", cost: { gold: 2500, wood: 5, ore: 5 } },
    { label: "Anneaux de champignons", description: "+7 à la croissance hebdomadaire des troglodytes.", cost: { gold: 1000 }, growthBonus: { [UnitType.TROGLODYTE]: 7, [UnitType.INFERNAL_TROGLODYTE]: 7 } },
    { label: "Gardien de la terre", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 } },
  ],
  [Faction.STRONGHOLD]: [
    { label: "Tunnel d'évasion", description: "Permet aux défenseurs de fuir les combats de ville.", cost: { gold: 500, ore: 5 } },
    { label: "Guilde des francs-tireurs", description: "Permet de vendre des créatures contre des ressources.", cost: { gold: 1000, wood: 5 } },
    { label: "Cour des balistes", description: "Permet d'acheter une baliste.", cost: { gold: 1000, wood: 5 } },
    { label: "Hall du Valhalla", description: "+1 en attaque au héros en visite.", cost: { gold: 1000 } },
    { label: "Réfectoire", description: "+8 à la croissance hebdomadaire des gobelins.", cost: { gold: 1000 }, growthBonus: { [UnitType.GOBLIN]: 8, [UnitType.HOBGOBLIN]: 8 } },
    { label: "Monument des seigneurs de guerre", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 } },
  ],
  [Faction.FORTRESS]: [
    { label: "Cage des seigneurs de guerre", description: "+1 en défense au héros en visite.", cost: { gold: 1000, wood: 5 } },
    { label: "Quartiers du capitaine", description: "+6 à la croissance hebdomadaire des gnolls.", cost: { gold: 1000 }, growthBonus: { [UnitType.GNOLL]: 6, [UnitType.GNOLL_MARAUDER]: 6 } },
    { label: "Glyphes de peur", description: "Affaiblit les assaillants pendant un siège.", cost: { gold: 1000, mercury: 5 } },
    { label: "Obélisque de sang", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 } },
  ],
  [Faction.CONFLUX]: [
    { label: "Université de magie", description: "Permet au héros en visite d'apprendre les écoles de magie élémentaire.", cost: { gold: 5000, wood: 10 } },
    { label: "Chantier naval", description: "Permet d'acheter un bateau si la ville borde l'eau.", cost: { gold: 2000, wood: 20 } },
    { label: "Marchands d'artefacts", description: "Permet aux héros en visite d'acheter des artefacts.", cost: { gold: 10000 } },
    { label: "Jardin de vie", description: "+10 à la croissance hebdomadaire des pixies.", cost: { gold: 1000 }, growthBonus: { [UnitType.PIXIE]: 10, [UnitType.SPRITE]: 10 } },
    { label: "Aurore boréale", description: "Bâtiment du Graal : +5000 or/jour, +50% de croissance et tous les sorts.", cost: { gold: 10000 } },
  ],
};

export function getTownBuildingRules(
  faction: Faction,
  baseUnits: UnitType[],
  upgradedUnits: UnitType[],
): TownBuildingRule[] {
  const safeFaction = TOWN_DWELLING_NAMES[faction] ? faction : Faction.CASTLE;
  const dwellings = TOWN_DWELLING_NAMES[safeFaction];

  const common: TownBuildingRule[] = [
    {
      type: BuildingType.TAVERN,
      label: "Taverne",
      description: "Permet de recruter des héros.",
      category: "common",
      cost: { gold: 500, wood: 5 },
    },
    {
      type: BuildingType.MARKET,
      label: "Marché",
      description: "Prépare l'échange de ressources et débloque le silo.",
      category: "common",
      cost: { gold: 750, wood: 5 },
    },
    {
      type: BuildingType.MAGE_GUILD,
      label: "Guilde des mages",
      description: "Prépare l'apprentissage des sorts dans cette ville.",
      category: "mage_guild",
      cost: { gold: 2000, wood: 5, ore: 5 },
    },
    {
      type: BuildingType.RESOURCE_SILO,
      label: "Silo de ressources",
      description: `Produit ${formatProduction(RESOURCE_SILO_PRODUCTION[safeFaction])} chaque jour.`,
      category: "common",
      cost: { gold: 1500, wood: 5, ore: 5 },
      requires: [BuildingType.MARKET],
      dailyProduction: RESOURCE_SILO_PRODUCTION[safeFaction],
    },
  ];

  const baseDwellingRules = BASE_DWELLING_TYPES.map((type, index): TownBuildingRule => ({
    type,
    label: dwellings[index].base,
    description: `Permet de recruter les créatures de palier ${index + 1}.`,
    category: "dwelling",
    cost: dwellingCost(safeFaction, index, false),
    requires: index === 0 ? undefined : [BASE_DWELLING_TYPES[index - 1]],
    unlocksUnit: baseUnits[index],
  }));

  const upgradedDwellingRules = UPGRADED_DWELLING_TYPES.map((type, index): TownBuildingRule => ({
    type,
    label: dwellings[index].upgraded,
    description: `Permet de recruter les créatures améliorées de palier ${index + 1}.`,
    category: "dwelling_upgrade",
    cost: dwellingCost(safeFaction, index, true),
    requires: [BASE_DWELLING_TYPES[index]],
    unlocksUnit: upgradedUnits[index],
    replacesUnit: baseUnits[index],
  }));

  const uniqueRules = (UNIQUE_BUILDINGS[safeFaction] ?? []).map((template, index): TownBuildingRule => ({
    type: UNIQUE_TYPES[index],
    label: template.label,
    description: template.description,
    category: "unique",
    cost: template.cost ?? { gold: 1000 },
    requires: template.requires,
    dailyProduction: template.dailyProduction,
    growthBonus: template.growthBonus,
  }));

  return [...common, ...baseDwellingRules, ...upgradedDwellingRules, ...uniqueRules];
}

function formatProduction(production: ResourceCost) {
  return Object.entries(production)
    .filter(([, amount]) => Boolean(amount))
    .map(([resource, amount]) => `+${amount} ${formatResourceForDescription(resource)}`)
    .join(", ");
}

function formatResourceForDescription(resource: string) {
  const labels: Record<string, string> = {
    gold: "or",
    wood: "bois",
    ore: "minerai",
    mercury: "mercure",
    crystals: "cristaux",
    gems: "gemmes",
    sulfur: "soufre",
  };
  return labels[resource] ?? resource;
}

function dwellingCost(faction: Faction, index: number, upgraded: boolean): ResourceCost {
  const baseCost = upgraded ? UPGRADED_DWELLING_COSTS[index] : BASE_DWELLING_COSTS[index];
  if (faction === Faction.TOWER && index === 6) {
    const rest = { ...baseCost };
    delete rest.crystals;
    return { ...rest, gems: baseCost.crystals ?? 0 };
  }
  return baseCost;
}
