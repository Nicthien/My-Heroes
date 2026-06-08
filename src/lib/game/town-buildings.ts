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
  grail?: boolean;
  goldInterestPercent?: number;
  weeklyRandomRareResource?: number;
  permanentVisitBonus?: { attack?: number; defense?: number; spellPower?: number; knowledge?: number };
  weeklyVisitBonus?: { movement?: number; luck?: number; fullMana?: boolean; doubleMana?: boolean };
  townVisionBonus?: number;
  boatMovementBonus?: number;
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
  grail?: boolean;
  goldInterestPercent?: number;
  weeklyRandomRareResource?: number;
  permanentVisitBonus?: { attack?: number; defense?: number; spellPower?: number; knowledge?: number };
  weeklyVisitBonus?: { movement?: number; luck?: number; fullMana?: boolean; doubleMana?: boolean };
  townVisionBonus?: number;
  boatMovementBonus?: number;
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

const TOWN_CENTER_PRODUCTION: Array<{ type: BuildingType; gold: number; level: number }> = [
  { type: BuildingType.CAPITOL, gold: 4000, level: 4 },
  { type: BuildingType.CITY_HALL, gold: 2000, level: 3 },
  { type: BuildingType.TOWN_HALL, gold: 1000, level: 2 },
  { type: BuildingType.VILLAGE_HALL, gold: 500, level: 1 },
  { type: BuildingType.CASTLE, gold: 500, level: 1 },
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
  [Faction.NECROPOLIS]: { mercury: 1 },
  [Faction.DUNGEON]: { sulfur: 1 },
  [Faction.STRONGHOLD]: { wood: 1, ore: 1 },
  [Faction.FORTRESS]: { wood: 1, ore: 1 },
  [Faction.CONFLUX]: { mercury: 1 },
};

const UNIQUE_BUILDINGS: Record<Faction, UniqueBuildingTemplate[]> = {
  [Faction.CASTLE]: [
    { label: "Garde d'honneur", description: "+2 au moral des défenseurs de la ville.", cost: { gold: 500, wood: 5 }, requires: [BuildingType.TAVERN] },
    { label: "Chantier naval", description: "Permet d'acheter un bateau si la ville borde l'eau.", cost: { gold: 2000, wood: 20 } },
    { label: "Phare", description: "+500 mouvement naval par phare possédé.", cost: { gold: 2000, wood: 10 }, requires: [BuildingType.UNIQUE_2], boatMovementBonus: 500 },
    { label: "Écuries", description: "+400 mouvement au héros en visite pour la semaine.", cost: { gold: 2000, wood: 10 }, requires: [BuildingType.DWELLING_4], weeklyVisitBonus: { movement: 400 } },
    { label: "Volière des griffons", description: "+3 à la croissance hebdomadaire des griffons.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_3], growthBonus: { [UnitType.GRIFFIN]: 3, [UnitType.ROYAL_GRIFFIN]: 3 } },
    { label: "Colosse", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
  [Faction.RAMPART]: [
    { label: "Bassin enchanté", description: "Produit une petite ressource rare aléatoire chaque semaine.", cost: { gold: 2000, mercury: 2, crystals: 2, gems: 2, sulfur: 2 }, weeklyRandomRareResource: 1 },
    { label: "Source de fortune", description: "+1 Chance au héros en visite pour la semaine.", cost: { gold: 1500 }, requires: [BuildingType.UNIQUE_1], weeklyVisitBonus: { luck: 1 } },
    { label: "Trésorerie", description: "Ajoute des intérêts à la réserve d'or du royaume.", cost: { gold: 5000, wood: 10, ore: 10 }, requires: [BuildingType.UNIQUE_4], goldInterestPercent: 10 },
    { label: "Guilde des mineurs", description: "+1 à la croissance hebdomadaire des nains.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_2], growthBonus: { [UnitType.DWARF]: 1, [UnitType.BATTLE_DWARF]: 1 } },
    { label: "Jeunes dendroïdes", description: "+2 à la croissance hebdomadaire des dendroïdes.", cost: { gold: 2000 }, requires: [BuildingType.DWELLING_5], growthBonus: { [UnitType.DENDROID]: 2, [UnitType.DENDROID_SOLDIER]: 2 } },
    { label: "Gardien des esprits", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
  [Faction.TOWER]: [
    { label: "Tour de guet", description: "+4 portée de reconnaissance de la ville.", cost: { gold: 1000, wood: 5 }, requires: [BuildingType.FORT], townVisionBonus: 4 },
    { label: "Bibliothèque", description: "Ajoute des sorts à la guilde des mages.", cost: { gold: 1500, wood: 5, ore: 5 }, requires: [BuildingType.MAGE_GUILD] },
    { label: "Stèle du savoir", description: "+1 Connaissance définitif au héros en visite (une fois).", cost: { gold: 1000 }, requires: [BuildingType.MAGE_GUILD], permanentVisitBonus: { knowledge: 1 } },
    { label: "Marchands d'artefacts", description: "Permet aux héros en visite d'acheter des artefacts.", cost: { gold: 10000 }, requires: [BuildingType.MARKET] },
    { label: "Atelier du sculpteur", description: "+4 à la croissance hebdomadaire des gargouilles.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_2], growthBonus: { [UnitType.GARGOYLE]: 4, [UnitType.OBSIDIAN_GARGOYLE]: 4 } },
    { label: "Vaisseau céleste", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
  [Faction.INFERNO]: [
    { label: "Porte des Braises", description: "Relie les villes des Braises Profanes pour transférer des créatures.", cost: { gold: 10000, wood: 5, ore: 5 }, requires: [BuildingType.CITADEL] },
    { label: "Culte de la flamme", description: "+1 Puissance magique définitif au héros en visite (une fois).", cost: { gold: 1000 }, requires: [BuildingType.MAGE_GUILD], permanentVisitBonus: { spellPower: 1 } },
    { label: "Nuages de soufre", description: "Ajoute des dégâts de feu aux défenses de la ville.", cost: { gold: 2000, sulfur: 5 }, requires: [BuildingType.FORT] },
    { label: "Bassin de naissance", description: "+8 à la croissance hebdomadaire des diablotins.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_1], growthBonus: { [UnitType.IMP]: 8, [UnitType.FAMILIAR]: 8 } },
    { label: "Cages", description: "+2 à la croissance hebdomadaire des démons.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_4], growthBonus: { [UnitType.DEMON]: 2, [UnitType.HORNED_DEMON]: 2 } },
    { label: "Divinité du feu", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
  [Faction.NECROPOLIS]: [
    { label: "Linceul d'ombre", description: "Réduit la reconnaissance ennemie autour de la ville.", cost: { gold: 1000, wood: 5 }, requires: [BuildingType.CITADEL] },
    { label: "Autel de nécromancie", description: "Améliore la nécromancie des héros alliés.", cost: { gold: 1000, ore: 5 }, requires: [BuildingType.MAGE_GUILD] },
    { label: "Ossuaire transmutateur", description: "Transforme les créatures vivantes en squelettes.", cost: { gold: 1000, mercury: 5 }, requires: [BuildingType.DWELLING_1] },
    { label: "Tombes ouvertes", description: "+6 à la croissance hebdomadaire des squelettes.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_1], growthBonus: { [UnitType.SKELETON]: 6, [UnitType.SKELETON_WARRIOR]: 6 } },
    { label: "Geôle des âmes", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
  [Faction.DUNGEON]: [
    { label: "Tourbillon de mana", description: "Double les points de magie du héros en visite (1×/semaine).", cost: { gold: 1000, ore: 5 }, requires: [BuildingType.MAGE_GUILD], weeklyVisitBonus: { doubleMana: true } },
    { label: "Académie martiale", description: "+1 Attaque et +1 Défense définitifs au héros en visite (une fois).", cost: { gold: 1000 }, permanentVisitBonus: { attack: 1, defense: 1 } },
    { label: "Marchands d'artefacts", description: "Permet aux héros en visite d'acheter des artefacts.", cost: { gold: 10000 }, requires: [BuildingType.MARKET] },
    { label: "Cercle d'invocation", description: "Invoque des créatures supplémentaires depuis les demeures extérieures.", cost: { gold: 2500, wood: 5, ore: 5 } },
    { label: "Anneaux de champignons", description: "+7 à la croissance hebdomadaire des troglodytes.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_1], growthBonus: { [UnitType.TROGLODYTE]: 7, [UnitType.INFERNAL_TROGLODYTE]: 7 } },
    { label: "Gardien de la terre", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
  [Faction.STRONGHOLD]: [
    { label: "Galerie secrète", description: "Permet aux défenseurs de fuir les combats de ville.", cost: { gold: 500, ore: 5 }, requires: [BuildingType.FORT] },
    { label: "Comptoir des mercenaires", description: "Permet de vendre des créatures contre des ressources.", cost: { gold: 1000, wood: 5 }, requires: [BuildingType.MARKET] },
    { label: "Cour des balistes", description: "Permet d'acheter une baliste.", cost: { gold: 1000, wood: 5 }, requires: [BuildingType.BLACKSMITH] },
    { label: "Hall des champions", description: "+1 Attaque définitif au héros en visite (une fois).", cost: { gold: 1000 }, requires: [BuildingType.FORT], permanentVisitBonus: { attack: 1 } },
    { label: "Réfectoire", description: "+8 à la croissance hebdomadaire des gobelins.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_1], growthBonus: { [UnitType.GOBLIN]: 8, [UnitType.HOBGOBLIN]: 8 } },
    { label: "Monument des seigneurs de guerre", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
  [Faction.FORTRESS]: [
    { label: "Cage des seigneurs de guerre", description: "+1 Défense définitif au héros en visite (une fois).", cost: { gold: 1000, wood: 5 }, requires: [BuildingType.TOWN_HALL], permanentVisitBonus: { defense: 1 } },
    { label: "Quartiers du capitaine", description: "+6 à la croissance hebdomadaire des gnolls.", cost: { gold: 1000 }, requires: [BuildingType.CITADEL], growthBonus: { [UnitType.GNOLL]: 6, [UnitType.GNOLL_MARAUDER]: 6 } },
    { label: "Totems de terreur", description: "Affaiblit les assaillants pendant un siège.", cost: { gold: 1000, mercury: 5 }, requires: [BuildingType.FORT] },
    { label: "Stèle sanglante", description: "Bâtiment du Graal : +5000 or/jour et +50% de croissance des créatures.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
  [Faction.CONFLUX]: [
    { label: "Université de magie", description: "Permet au héros en visite d'apprendre les écoles de magie élémentaire.", cost: { gold: 5000, wood: 10 }, requires: [BuildingType.MAGE_GUILD] },
    { label: "Chantier naval", description: "Permet d'acheter un bateau si la ville borde l'eau.", cost: { gold: 2000, wood: 20 } },
    { label: "Marchands d'artefacts", description: "Permet aux héros en visite d'acheter des artefacts.", cost: { gold: 10000 }, requires: [BuildingType.MARKET] },
    { label: "Jardin de vie", description: "+10 à la croissance hebdomadaire des pixies.", cost: { gold: 1000 }, requires: [BuildingType.DWELLING_1], growthBonus: { [UnitType.PIXIE]: 10, [UnitType.SPRITE]: 10 } },
    { label: "Aurore boréale", description: "Bâtiment du Graal : +5000 or/jour, +50% de croissance et tous les sorts.", cost: { gold: 10000 }, dailyProduction: { gold: 5000 }, grail: true },
  ],
};

// Fortification line (Fort → Citadelle → Château) + Blacksmith, present in every
// town. The Fort is a prerequisite for ALL creature dwellings (enforced
// via DWELLING_REQUIRES_OVERRIDE), the Citadel/Castle add defenses and growth, and
// the Blacksmith forges the faction war machine (and gates a few barracks).
const FORTIFICATION_BUILDINGS: TownBuildingRule[] = [
  {
    type: BuildingType.FORT,
    label: "Fort",
    description: "Érige les remparts de la ville et débloque les demeures de créatures.",
    category: "common",
    cost: { gold: 5000, wood: 20, ore: 20 },
  },
  {
    type: BuildingType.CITADEL,
    label: "Citadelle",
    description: "Renforce les remparts et ajoute une tour de tir défensive.",
    category: "common",
    cost: { gold: 2500, ore: 5 },
    requires: [BuildingType.FORT],
  },
  {
    type: BuildingType.CASTLE_KEEP,
    label: "Château",
    description: "Fortification maximale : deux tours de tir supplémentaires.",
    category: "common",
    cost: { gold: 5000, wood: 10, ore: 10 },
    requires: [BuildingType.CITADEL],
  },
  {
    type: BuildingType.BLACKSMITH,
    label: "Forgeron",
    description: "Forge les machines de guerre et prépare certaines casernes.",
    category: "common",
    cost: { gold: 1000, wood: 5 },
  },
];

// Per-faction overrides of base dwelling prerequisites, transcribed from the
// canonical building trees (docs/mermaid/<faction>.mmd). The Fort gates
// every faction's creature tree: the tier-1 dwelling requires the Fort, and the
// higher tiers chain off lower dwellings / the Mage Guild / faction buildings,
// so the Fort requirement propagates transitively. When a faction is absent
// here it falls back to the generic linear chain (tier N requires tier N-1).
const DWELLING_REQUIRES_OVERRIDE: Partial<Record<Faction, Partial<Record<BuildingType, BuildingType[]>>>> = {
  [Faction.CASTLE]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Corps de garde ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Tour des archers ← Corps de garde
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_4], // Tour des griffons ← Caserne
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_1, BuildingType.BLACKSMITH], // Caserne ← Corps de garde + Forgeron
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_4, BuildingType.MAGE_GUILD], // Monastère ← Caserne + Guilde des mages Nv1
    [BuildingType.DWELLING_6]: [BuildingType.UNIQUE_4], // Terrain d'entraînement ← Écuries
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_5], // Portail de gloire ← Monastère
  },
  [Faction.RAMPART]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Centaures ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Nains ← Centaures
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_1], // Elfes ← Centaures
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_3], // Pégases ← Elfes
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_3], // Dendroïdes ← Elfes
    [BuildingType.DWELLING_6]: [BuildingType.DWELLING_4, BuildingType.DWELLING_5], // Licornes ← Pégases + Dendroïdes
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_6, BuildingType.MAGE_GUILD_2], // Dragons ← Licornes + Guilde Nv2
  },
  [Faction.TOWER]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Gremlins ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Gargouilles ← Gremlins
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_1], // Golems ← Gremlins
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_3, BuildingType.UNIQUE_2], // Mages ← Golems + Bibliothèque
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_4], // Génies ← Mages
    [BuildingType.DWELLING_6]: [BuildingType.DWELLING_4], // Nagas ← Mages
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_5, BuildingType.DWELLING_6], // Titans ← Génies + Nagas
  },
  [Faction.INFERNO]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Diablotins ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Gogs ← Diablotins
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_2], // Chiens de l'enfer ← Gogs
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_2], // Démons ← Gogs
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_4], // Démons abyssaux ← Démons
    [BuildingType.DWELLING_6]: [BuildingType.DWELLING_4, BuildingType.MAGE_GUILD], // Efreets ← Démons + Guilde Nv1
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_5, BuildingType.DWELLING_6], // Diables ← Abyssaux + Efreets
  },
  [Faction.NECROPOLIS]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Squelettes ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Zombis ← Squelettes
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_2], // Spectres ← Zombis
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_2], // Vampires ← Zombis
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_4, BuildingType.MAGE_GUILD], // Liches ← Vampires + Guilde Nv1
    [BuildingType.DWELLING_6]: [BuildingType.DWELLING_4], // Chevaliers noirs ← Vampires
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_5, BuildingType.DWELLING_6], // Dragons d'os ← Liches + Chevaliers noirs
  },
  [Faction.DUNGEON]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Troglodytes ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Harpies ← Troglodytes
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_1], // Yeux maléfiques ← Troglodytes
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_2, BuildingType.DWELLING_3], // Méduses ← Harpies + Yeux
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_4], // Minotaures ← Méduses
    [BuildingType.DWELLING_6]: [BuildingType.DWELLING_3], // Manticores ← Yeux maléfiques
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_5, BuildingType.DWELLING_6, BuildingType.MAGE_GUILD_2], // Dragons rouges ← Minotaures + Manticores + Guilde Nv2
  },
  [Faction.STRONGHOLD]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Gobelins ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Chevaucheurs de loups ← Gobelins
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_1], // Orcs ← Gobelins
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_3], // Ogres ← Orcs
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_2], // Rocs ← Chevaucheurs
    [BuildingType.DWELLING_6]: [BuildingType.DWELLING_4], // Cyclopes ← Ogres
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_5], // Béhémoths ← Rocs
  },
  [Faction.FORTRESS]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Gnolls ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Hommes-lézards ← Gnolls
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_1], // Mouches serpents ← Gnolls
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_3], // Basilics ← Mouches serpents
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_3], // Gorgones ← Mouches serpents
    [BuildingType.DWELLING_6]: [BuildingType.DWELLING_2], // Wyvernes ← Hommes-lézards
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_5, BuildingType.DWELLING_4], // Hydres ← Gorgones + Basilics
  },
  [Faction.CONFLUX]: {
    [BuildingType.DWELLING_1]: [BuildingType.FORT], // Fées ← Fort
    [BuildingType.DWELLING_2]: [BuildingType.DWELLING_1], // Élémentaires d'air ← Fées
    [BuildingType.DWELLING_3]: [BuildingType.DWELLING_1], // Élémentaires d'eau ← Fées
    [BuildingType.DWELLING_4]: [BuildingType.DWELLING_2, BuildingType.DWELLING_3], // Élémentaires de feu ← Air + Eau
    [BuildingType.DWELLING_5]: [BuildingType.DWELLING_1], // Élémentaires de terre ← Fées
    [BuildingType.DWELLING_6]: [BuildingType.DWELLING_4, BuildingType.DWELLING_5], // Élémentaires de magie ← Feu + Terre
    [BuildingType.DWELLING_7]: [BuildingType.DWELLING_6], // Oiseaux de feu ← Magie
  },
};

// Maximum Mage Guild level per faction (canonical). Levels above the cap
// are simply not offered for that town.
const MAGE_GUILD_MAX: Record<Faction, number> = {
  [Faction.CASTLE]: 4,
  [Faction.RAMPART]: 5,
  [Faction.TOWER]: 5,
  [Faction.INFERNO]: 5,
  [Faction.NECROPOLIS]: 5,
  [Faction.DUNGEON]: 5,
  [Faction.STRONGHOLD]: 3,
  [Faction.FORTRESS]: 3,
  [Faction.CONFLUX]: 5,
};

const MAGE_GUILD_RULES: TownBuildingRule[] = [
  {
    type: BuildingType.MAGE_GUILD,
    label: "Guilde des mages (niveau 1)",
    description: "Apprend 5 sorts de niveau 1 aux héros en visite.",
    category: "mage_guild",
    cost: { gold: 2000, wood: 5, ore: 5 },
  },
  {
    type: BuildingType.MAGE_GUILD_2,
    label: "Guilde des mages (niveau 2)",
    description: "Ajoute 4 sorts de niveau 2.",
    category: "mage_guild",
    cost: { gold: 1000, wood: 5, ore: 5, mercury: 4, crystals: 4, gems: 4, sulfur: 4 },
    requires: [BuildingType.MAGE_GUILD],
  },
  {
    type: BuildingType.MAGE_GUILD_3,
    label: "Guilde des mages (niveau 3)",
    description: "Ajoute 3 sorts de niveau 3.",
    category: "mage_guild",
    cost: { gold: 1000, wood: 5, ore: 5, mercury: 6, crystals: 6, gems: 6, sulfur: 6 },
    requires: [BuildingType.MAGE_GUILD_2],
  },
  {
    type: BuildingType.MAGE_GUILD_4,
    label: "Guilde des mages (niveau 4)",
    description: "Ajoute 2 sorts de niveau 4.",
    category: "mage_guild",
    cost: { gold: 1000, wood: 5, ore: 5, mercury: 8, crystals: 8, gems: 8, sulfur: 8 },
    requires: [BuildingType.MAGE_GUILD_3],
  },
  {
    type: BuildingType.MAGE_GUILD_5,
    label: "Guilde des mages (niveau 5)",
    description: "Ajoute 1 sort de niveau 5 (le plus puissant).",
    category: "mage_guild",
    cost: { gold: 1000, wood: 5, ore: 5, mercury: 10, crystals: 10, gems: 10, sulfur: 10 },
    requires: [BuildingType.MAGE_GUILD_4],
  },
];

export function getTownBuildingRules(
  faction: Faction,
  baseUnits: UnitType[],
  upgradedUnits: UnitType[],
): TownBuildingRule[] {
  const safeFaction = TOWN_DWELLING_NAMES[faction] ? faction : Faction.CASTLE;
  const dwellings = TOWN_DWELLING_NAMES[safeFaction];
  const dwellingRequiresOverride = DWELLING_REQUIRES_OVERRIDE[safeFaction];

  const common: TownBuildingRule[] = [
    {
      type: BuildingType.TOWN_HALL,
      label: "Mairie",
      description: "Améliore le revenu de cette ville à +1000 or par jour.",
      category: "common",
      cost: { gold: 2500 },
      requires: [BuildingType.TAVERN],
    },
    {
      type: BuildingType.CITY_HALL,
      label: "Hôtel de ville",
      description: "Améliore le revenu de cette ville à +2000 or par jour.",
      category: "common",
      cost: { gold: 5000 },
      requires: [BuildingType.TOWN_HALL, BuildingType.MARKET, BuildingType.MAGE_GUILD, BuildingType.BLACKSMITH],
    },
    {
      type: BuildingType.CAPITOL,
      label: "Capitole",
      description: "Améliore le revenu de cette ville à +4000 or par jour. Limité à un par joueur.",
      category: "common",
      cost: { gold: 10000 },
      requires: [BuildingType.CITY_HALL],
    },
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
    ...MAGE_GUILD_RULES.slice(0, MAGE_GUILD_MAX[safeFaction]),
    {
      type: BuildingType.SHIPYARD,
      label: "Chantier naval",
      description: "Permet de construire un bateau dans une eau adjacente.",
      category: "common",
      cost: { gold: 1000, wood: 10 },
    },
    {
      type: BuildingType.RESOURCE_SILO,
      label: "Silo de ressources",
      description: `Produit ${formatProduction(RESOURCE_SILO_PRODUCTION[safeFaction])} chaque jour.`,
      category: "common",
      cost: { gold: 5000, wood: 5, ore: 5 },
      requires: [BuildingType.MARKET],
      dailyProduction: RESOURCE_SILO_PRODUCTION[safeFaction],
    },
  ];

  const baseDwellingRules = BASE_DWELLING_TYPES.map((type, index): TownBuildingRule => {
    const override = dwellingRequiresOverride?.[type];
    const requires = override !== undefined
      ? (override.length > 0 ? override : undefined)
      : index === 0 ? undefined : [BASE_DWELLING_TYPES[index - 1]];
    return {
      type,
      label: dwellings[index].base,
      description: `Permet de recruter les créatures de palier ${index + 1}.`,
      category: "dwelling",
      cost: dwellingCost(safeFaction, index, false),
      requires,
      unlocksUnit: baseUnits[index],
    };
  });

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
    grail: template.grail,
    goldInterestPercent: template.goldInterestPercent,
    weeklyRandomRareResource: template.weeklyRandomRareResource,
    permanentVisitBonus: template.permanentVisitBonus,
    weeklyVisitBonus: template.weeklyVisitBonus,
    townVisionBonus: template.townVisionBonus,
    boatMovementBonus: template.boatMovementBonus,
  }));

  return [...common, ...FORTIFICATION_BUILDINGS, ...baseDwellingRules, ...upgradedDwellingRules, ...uniqueRules];
}

// Fortification ladder: Fort (walls + gate) → Citadel (+1 shooting tower) →
// Castle Keep (+2 more towers, 3 total). Drives siege defenses in combat — kept
// separate from the town-center ladder (Village/Town/City Hall/Capitol), which
// only governs daily gold income.
const FORT_LEVELS: Array<{ type: BuildingType; level: number }> = [
  { type: BuildingType.CASTLE_KEEP, level: 3 },
  { type: BuildingType.CITADEL, level: 2 },
  { type: BuildingType.FORT, level: 1 },
];

export function getTownFortLevel(buildings: Array<BuildingType | string>): number {
  const built = new Set(buildings);
  return FORT_LEVELS.find((entry) => built.has(entry.type))?.level ?? 0;
}

export function getTownGoldProduction(buildings: Array<BuildingType | string>) {
  const built = new Set(buildings);
  return TOWN_CENTER_PRODUCTION.find((entry) => built.has(entry.type))?.gold ?? 500;
}

export function getTownCenterLevel(buildings: Array<BuildingType | string>) {
  const built = new Set(buildings);
  return TOWN_CENTER_PRODUCTION.find((entry) => built.has(entry.type))?.level ?? 1;
}

export function hasTownBuilding(buildings: Array<BuildingType | string>, building: BuildingType | string) {
  const built = new Set(buildings);
  if (building === BuildingType.VILLAGE_HALL) {
    return built.has(BuildingType.VILLAGE_HALL) || built.has(BuildingType.CASTLE);
  }
  return built.has(building);
}

export function isShipyardBuilding(faction: Faction | string | undefined, building: BuildingType | string) {
  return building === BuildingType.SHIPYARD ||
    ((faction === Faction.CASTLE || faction === Faction.CONFLUX) && building === BuildingType.UNIQUE_2);
}

export function hasShipyardBuilding(faction: Faction | string | undefined, buildings: Array<BuildingType | string>) {
  return buildings.some((building) => isShipyardBuilding(faction, building));
}

export function normalizeTownBuildings(buildings: Array<BuildingType | string>) {
  const normalized = buildings.filter((building) => building !== BuildingType.CASTLE) as BuildingType[];
  const hasTownCenter = normalized.some((building) =>
    building === BuildingType.VILLAGE_HALL ||
    building === BuildingType.TOWN_HALL ||
    building === BuildingType.CITY_HALL ||
    building === BuildingType.CAPITOL
  );
  return hasTownCenter ? normalized : [BuildingType.VILLAGE_HALL, ...normalized];
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
