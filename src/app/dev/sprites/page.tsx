"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import {
  ARTIFACTS,
  ARTIFACT_GUARDIAN_POWER,
  artifactClassLabel,
  type ArtifactDefinition,
  type ArtifactStatsBonus,
} from "@/lib/game/artifacts";
import { CREATURE_GROUPS } from "@/lib/game/creature-catalog";
import {
  CREATURE_BANK_DEFINITIONS,
  CREATURE_BANK_TYPES,
  type CreatureBankDefinition,
} from "@/lib/game/creature-banks";
import {
  EXTERNAL_DWELLING_UNIT_TYPES,
  getExternalDwellingLabel,
  getExternalDwellingSprite,
} from "@/lib/game/external-dwellings";
import {
  FACTION_UPGRADED_UNITS,
  FACTION_TOWN_NAMES,
  RESOURCE_BUILDING_RULES,
  RESOURCE_LABELS,
  UNIT_RULES as UNIT_ECON_RULES,
  formatResourceProduction,
  getFactionBuildingRules,
  type ResourceBuildingRule,
} from "@/lib/game/economy";
import type { TownBuildingRule } from "@/lib/game/town-buildings";
import {
  COMMON_TOWN_BUILDING_SPRITES,
  UNIQUE_TOWN_BUILDING_SPRITES,
} from "@/lib/game/town-building-sprites";
import { UNIT_RULES } from "@/lib/game/units";
import type { UnitRule } from "@/lib/game/units";
import {
  Faction,
  ResourceBuildingType,
  TerrainType,
  UnitType,
  type CombatBoardUnit,
  type Resources,
} from "@/lib/game/types";
import {
  BOAT_SPRITESHEETS,
  HERO_DIRECTIONS,
  HERO_SPRITESHEETS,
  KING_SPRITE_FACTIONS,
  ROAD_TEXTURES,
  TERRAIN_TOP_TEXTURES,
  getKingUnitSpritePath,
  getTerrainSideTexturePath,
  getUnitSpritePath,
  type BoatSpritesheet,
  type DirectionalSpritesheet,
  type HeroDirection,
  type HeroSpritesheet,
  type TerrainTopTexture,
} from "@/lib/rendering/phaser/assets";
import {
  type UnitModelKind,
  getUnitModel,
} from "@/components/game/combat/CombatScreen";
import { localizedBuildingDescription } from "@/lib/game/buildings-i18n";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedLabelFromId, localizedUnitLabel } from "@/lib/i18n/gameLabels";
import type { Locale } from "@/lib/i18n/types";

type SpriteKind =
  | "unit"
  | "artifact"
  | "creatureBank"
  | "townBuilding"
  | "resourceBuilding"
  | "externalDwelling"
  | "adventureBuilding"
  | "obstacle"
  | "resource"
  | "factionTown"
  | "heroSheet"
  | "boatSheet"
  | "terrainTexture"
  | "roadTexture"
  | "generic";

type SpriteEntry = {
  kind: SpriteKind;
  path: string;
  label: string;
  detail?: string;
  width: number;
  height: number;
  unitType?: UnitType;
  unit?: { model: string; rule: UnitRule };
  artifact?: ArtifactDefinition;
  creatureBank?: CreatureBankDefinition;
  townBuilding?: { rule: TownBuildingRule; faction: Faction };
  resourceBuilding?: ResourceBuildingRule;
  externalDwelling?: { unitType: UnitType; rule: UnitRule };
  adventure?: { description: string };
  obstacle?: { description: string };
  factionTown?: { faction: Faction; description: string };
  terrainTexture?: { terrain: TerrainType; face: "top" | "SW" | "SE"; tags: readonly string[] };
  roadTexture?: { kind: string; mask: number };
};

type Selection = { entries: SpriteEntry[]; index: number } | null;

const MODEL_LABELS: Record<UnitModelKind, string> = {
  infantry: "Infanterie",
  archer: "Tireur",
  cavalry: "Cavalerie",
  winged: "Volant",
  large: "Colosse",
  caster: "Lanceur",
  beast: "Bête",
  undead: "Mort-vivant",
};

const TERRAIN_LABELS: Partial<Record<TerrainType, string>> = {
  [TerrainType.GRASS]: "Plaine",
  [TerrainType.DIRT]: "Terre",
  [TerrainType.SAND]: "Sable",
  [TerrainType.SNOW]: "Neige",
  [TerrainType.SWAMP]: "Marais",
  [TerrainType.LAVA]: "Lave",
  [TerrainType.MOUNTAIN]: "Montagne",
  [TerrainType.FOREST]: "Forêt",
  [TerrainType.WATER]: "Eau",
};

const ARTIFACT_SLOT_LABELS: Record<string, string> = {
  weapon: "Arme",
  shield: "Bouclier",
  torso: "Torse",
  helmet: "Heaume",
  necklace: "Collier",
  feet: "Pieds",
  ringLeft: "Anneau",
  ringRight: "Anneau",
  misc1: "Divers",
  misc2: "Divers",
  misc3: "Divers",
  misc4: "Divers",
};

const ARTIFACT_BONUS_LABELS: Record<keyof ArtifactStatsBonus, string> = {
  attack: "Attaque",
  defense: "Défense",
  spellPower: "Puissance",
  knowledge: "Connaissance",
  morale: "Moral",
  luck: "Chance",
  movement: "Déplacement",
  seaMovement: "Déplacement mer",
};

const ARTIFACT_COMBO_LABELS: Record<string, string> = {
  armor_of_the_damned: "Armure des damnés",
  power_of_the_dragon_father: "Pouvoir du père-dragon",
  titans_thunder: "Tonnerre des titans",
  angelic_alliance: "Alliance angélique",
};

const ADVENTURE_BUILDING_DETAILS: Record<string, { label: string; description: string }> = {
  "adventure-observatory": {
    label: "Observatoire",
    description: "Révèle une grande zone autour de la position visitée. Visitable une seule fois par héros.",
  },
  "adventure-campfire": {
    label: "Feu de camp",
    description: "Offre un petit gain d'or et d'une ressource aléatoire. Disparaît une fois visité.",
  },
  "adventure-lighthouse": {
    label: "Phare",
    description: "Une fois capturé, augmente le mouvement maritime de tous les héros du joueur.",
  },
  "adventure-stargate": {
    label: "Stargate",
    description: "Téléporte le héros vers une autre stargate appartenant au même joueur.",
  },
  "adventure-arena": {
    label: "Arène",
    description: "Permet de choisir un entraînement : +2 Attaque ou +2 Défense pour le héros.",
  },
  "adventure-mercenary-camp": {
    label: "Camp de mercenaires",
    description: "Accorde +1 Attaque au héros qui le visite.",
  },
  "adventure-marletto-tower": {
    label: "Tour de Marletto",
    description: "Accorde +1 Défense au héros qui la visite.",
  },
  "adventure-star-axis": {
    label: "Axe étoilé",
    description: "Accorde +1 Pouvoir au héros qui le visite.",
  },
  "adventure-garden-of-revelation": {
    label: "Jardin de révélation",
    description: "Accorde +1 Savoir au héros qui le visite.",
  },
  "adventure-learning-stone": {
    label: "Pierre de savoir",
    description: "Accorde 1000 XP au héros qui la visite.",
  },
  "adventure-school-of-war": {
    label: "École de guerre",
    description: "Permet de payer 1000 Or pour choisir +1 Attaque ou +1 Défense.",
  },
  "adventure-school-of-magic": {
    label: "École de magie",
    description: "Permet de payer 1000 Or pour choisir +1 Pouvoir ou +1 Savoir.",
  },
  "adventure-library-of-enlightenment": {
    label: "Bibliothèque d'illumination",
    description: "Accorde +2 aux quatre caractéristiques principales aux héros de niveau 10 ou plus.",
  },
  "adventure-cartographer": {
    label: "Cartographe",
    description: "Permet de payer 10000 Or pour révéler toute la carte.",
  },
  "adventure-redwood-observatory": {
    label: "Observatoire sylvestre",
    description: "Révèle une très grande zone autour du bâtiment.",
  },
  "adventure-mystical-garden": {
    label: "Jardin mystique",
    description: "Offre une récompense hebdomadaire en Or ou Gemmes.",
  },
};

ADVENTURE_BUILDING_DETAILS["adventure-stables"] = {
  label: "Ecuries",
  description: "Accorde un bonus hebdomadaire de déplacement au héros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-temple"] = {
  label: "Temple",
  description: "Accorde +1 Moral au héros qui le visite.",
};
ADVENTURE_BUILDING_DETAILS["adventure-fountain-of-fortune"] = {
  label: "Fontaine de fortune",
  description: "Accorde +1 Chance au héros qui la visite.",
};
ADVENTURE_BUILDING_DETAILS["adventure-idol-of-fortune"] = {
  label: "Idole de fortune",
  description: "Accorde +1 Moral et +1 Chance au héros qui la visite.",
};
ADVENTURE_BUILDING_DETAILS["adventure-magic-well"] = {
  label: "Puits magique",
  description: "Restaure la mana du héros une fois par semaine.",
};
ADVENTURE_BUILDING_DETAILS["adventure-magic-shrine"] = {
  label: "Sanctuaire magique",
  description: "Restaure 20 mana au héros qui le visite.",
};
ADVENTURE_BUILDING_DETAILS["adventure-water-mill"] = {
  label: "Moulin à eau",
  description: "Produit 1000 Or une fois par semaine pour le joueur.",
};
ADVENTURE_BUILDING_DETAILS["adventure-water-wheel"] = {
  label: "Roue à eau",
  description: "Produit 500 Or une fois par semaine pour le joueur.",
};
ADVENTURE_BUILDING_DETAILS["adventure-abandoned-wagon"] = {
  label: "Chariot abandonne",
  description: "Contient une petite récompense de carte fouillable une seule fois.",
};
ADVENTURE_BUILDING_DETAILS["adventure-crate"] = {
  label: "Caisse",
  description: "Contient de l'Or, du Bois ou du Minerai une seule fois.",
};
ADVENTURE_BUILDING_DETAILS["adventure-skeleton"] = {
  label: "Squelette",
  description: "Peut contenir de l'Or ou quelques Gemmes.",
};
ADVENTURE_BUILDING_DETAILS["adventure-obelisk"] = {
  label: "Obelisque",
  description: "Révèle une grande region autour du bâtiment.",
};
ADVENTURE_BUILDING_DETAILS["adventure-warrior-tomb"] = {
  label: "Tombe du guerrier",
  description: "Offre Or et XP, mais retire 1 Moral au héros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-cursed-altar"] = {
  label: "Autel maudit",
  description: "Accorde +1 Pouvoir au héros, mais retire 1 Chance.",
};
ADVENTURE_BUILDING_DETAILS["adventure-spell-shrine-1"] = {
  label: "Sanctuaire de sort I",
  description: "Enseigne un sort de niveau 1 au héros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-spell-shrine-2"] = {
  label: "Sanctuaire de sort II",
  description: "Enseigne un sort de niveau 2 au héros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-spell-shrine-3"] = {
  label: "Sanctuaire de sort III",
  description: "Enseigne un sort de niveau 3 au héros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-tree-of-knowledge"] = {
  label: "Arbre de connaissance",
  description: "Accorde 2000 XP contre 2000 Or.",
};
ADVENTURE_BUILDING_DETAILS["adventure-seer-hut"] = {
  label: "Hutte d'érudit",
  description: "Accorde 1000 XP et restaure un peu de mana.",
};
ADVENTURE_BUILDING_DETAILS["adventure-mermaid"] = {
  label: "Sirene",
  description: "Accorde +1 Chance au héros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-buoy"] = {
  label: "Bouée",
  description: "Accorde +1 Moral au héros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-flotsam"] = {
  label: "Debris flottants",
  description: "Contient de l'Or et du Bois.",
};
ADVENTURE_BUILDING_DETAILS["adventure-sea-chest"] = {
  label: "Coffre marin",
  description: "Contient de l'Or ou des Gemmes.",
};

const OBSTACLE_DETAILS: Record<string, { label: string; description: string }> = {
  "bramble-thicket": { label: "Roncier epais", description: "Vegetation epineuse impassable. Bloque le mouvement." },
  "fallen-log-barricade": { label: "Barricade de troncs", description: "Troncs moussus et branches compactes, infranchissables." },
  "willow-swamp-grove": { label: "Bosquet de saules", description: "Bosquet humide et dense, infranchissable." },
  "birch-grove": { label: "Bosquet de bouleaux", description: "Rideau de bouleaux compact, infranchissable." },
  "deadwood-thicket": { label: "Fourre de bois mort", description: "Racines mortes et troncs tordus, infranchissables." },
  "flowering-hedge": { label: "Haie fleurie", description: "Haie fleurie dense, infranchissable." },
  "grass-oak-copse": { label: "Plaine - chenaie dense", description: "Obstacle vegetal de plaine impassable." },
  "grass-bramble-mound": { label: "Plaine - monticule de ronces", description: "Obstacle vegetal de plaine impassable." },
  "grass-flowering-hedge": { label: "Plaine - haie fleurie", description: "Obstacle vegetal de plaine impassable." },
  "grass-reed-thicket": { label: "Plaine - fourre de roseaux", description: "Obstacle vegetal de plaine impassable." },
  "grass-root-barricade": { label: "Plaine - barricade de racines", description: "Obstacle vegetal de plaine impassable." },
  "grass-sapling-grove": { label: "Plaine - jeunes arbres", description: "Obstacle vegetal de plaine impassable." },
  "forest-pine-grove": { label: "Foret - bosquet de pins", description: "Obstacle forestier impassable." },
  "forest-broadleaf-grove": { label: "Foret - bosquet feuillu", description: "Obstacle forestier impassable." },
  "forest-underwood-thicket": { label: "Foret - sous-bois dense", description: "Obstacle forestier impassable." },
  "forest-stump-ferns": { label: "Foret - souches et fougeres", description: "Obstacle forestier impassable." },
  "forest-birch-pine-screen": { label: "Foret - ecran bouleaux-pins", description: "Obstacle forestier impassable." },
  "forest-deadfall": { label: "Foret - chablis sombre", description: "Obstacle forestier impassable." },
  "dirt-thorn-scrub": { label: "Terre - broussailles seches", description: "Obstacle de friche impassable." },
  "dirt-dead-brush": { label: "Terre - tas de branches mortes", description: "Obstacle de friche impassable." },
  "dirt-dry-log-barrier": { label: "Terre - barriere de troncs secs", description: "Obstacle de friche impassable." },
  "dirt-root-snarl": { label: "Terre - noeud de racines", description: "Obstacle de friche impassable." },
  "dirt-cactus-brush": { label: "Terre - cactus et broussailles", description: "Obstacle de friche impassable." },
  "dirt-bramble-ravine": { label: "Terre - roncier ravine", description: "Obstacle de friche impassable." },
  "sand-cactus-cluster": { label: "Sable - cactus serres", description: "Obstacle desertique impassable." },
  "sand-desert-scrub": { label: "Sable - broussailles desertiques", description: "Obstacle desertique impassable." },
  "sand-palm-stump": { label: "Sable - souches de palmiers", description: "Obstacle desertique impassable." },
  "sand-agave-barrier": { label: "Sable - barriere d'agaves", description: "Obstacle desertique impassable." },
  "sand-tumbleweed-heap": { label: "Sable - amas de virevoltants", description: "Obstacle desertique impassable." },
  "sand-saltbush-clump": { label: "Sable - touffe de salicornes", description: "Obstacle desertique impassable." },
  "snow-pine-grove": { label: "Neige - pins enneiges", description: "Obstacle hivernal impassable." },
  "snow-birch-thicket": { label: "Neige - fourre de bouleaux", description: "Obstacle hivernal impassable." },
  "snow-deadwood-barrier": { label: "Neige - bois mort gele", description: "Obstacle hivernal impassable." },
  "snow-bramble-mound": { label: "Neige - roncier gele", description: "Obstacle hivernal impassable." },
  "snow-evergreen-drift": { label: "Neige - coniferes et congeres", description: "Obstacle hivernal impassable." },
  "snow-shrub-wall": { label: "Neige - mur d'arbustes", description: "Obstacle hivernal impassable." },
  "mountain-pine-rock": { label: "Montagne - pins et rochers", description: "Obstacle alpin impassable." },
  "mountain-cliff-brush": { label: "Montagne - broussailles de falaise", description: "Obstacle alpin impassable." },
  "mountain-deadwood": { label: "Montagne - bois tordu", description: "Obstacle alpin impassable." },
  "mountain-mossy-roots": { label: "Montagne - racines moussues", description: "Obstacle alpin impassable." },
  "mountain-fir-grove": { label: "Montagne - sapins courbes", description: "Obstacle alpin impassable." },
  "mountain-rhododendron": { label: "Montagne - rhododendrons", description: "Obstacle alpin impassable." },
  "swamp-willow-grove": { label: "Marais - saules pleureurs", description: "Obstacle marecageux impassable." },
  "swamp-mangrove-tangle": { label: "Marais - racines de mangrove", description: "Obstacle marecageux impassable." },
  "swamp-reed-thicket": { label: "Marais - roseaux denses", description: "Obstacle marecageux impassable." },
  "swamp-cypress-cluster": { label: "Marais - cypres morts", description: "Obstacle marecageux impassable." },
  "swamp-bog-bramble": { label: "Marais - roncier de tourbiere", description: "Obstacle marecageux impassable." },
  "swamp-fungus-log": { label: "Marais - tronc fongique", description: "Obstacle marecageux impassable." },
  "lava-charred-thorns": { label: "Lave - epines carbonisees", description: "Obstacle volcanique impassable." },
  "lava-ember-roots": { label: "Lave - racines braisantes", description: "Obstacle volcanique impassable." },
  "lava-ash-fungus": { label: "Lave - champignons de cendre", description: "Obstacle volcanique impassable." },
  "lava-scorched-deadwood": { label: "Lave - bois calcine", description: "Obstacle volcanique impassable." },
  "lava-sulfur-shrub": { label: "Lave - buisson sulfureux", description: "Obstacle volcanique impassable." },
  "lava-obsidian-bramble": { label: "Lave - ronces d'obsidienne", description: "Obstacle volcanique impassable." },
  "massif-mountain-granite-2x2": { label: "Massif 2x2 - granite", description: "Grand obstacle mineral couvrant quatre cases." },
  "massif-mountain-snowcap-2x2": { label: "Massif 2x2 - enneige", description: "Grand obstacle alpin couvrant quatre cases." },
  "massif-mountain-pine-2x2": { label: "Massif 2x2 - pins", description: "Grand obstacle rocheux et boise couvrant quatre cases." },
  "massif-mountain-volcanic-2x2": { label: "Massif 2x2 - volcanique", description: "Grand obstacle d'obsidienne couvrant quatre cases." },
  "massif-mountain-desert-2x2": { label: "Massif 2x2 - mesa", description: "Grand obstacle desertique couvrant quatre cases." },
  "massif-mountain-mossy-2x2": { label: "Massif 2x2 - moussu", description: "Grand obstacle de falaise moussue couvrant quatre cases." },
  "boulder-cluster": { label: "Amas de rochers", description: "Tas de rochers impassable." },
};

const FACTION_TOWN_DESCRIPTIONS: Partial<Record<Faction, string>> = {
  [Faction.CASTLE]: "Faction humaine équilibrée : pikemen, archers, griffons, chevaliers, anges.",
  [Faction.RAMPART]: "Faction sylvestre : centaures, elfes, pégases, licornes, dragons verts.",
  [Faction.TOWER]: "Faction mage : gremlins, gargouilles, golems, mages, génies, titans.",
  [Faction.INFERNO]: "Faction démoniaque : diablotins, démons, efreets, diables.",
  [Faction.NECROPOLIS]: "Faction morts-vivants : squelettes, vampires, liches, dragons d'os.",
  [Faction.DUNGEON]: "Faction souterraine : troglodytes, méduses, manticores, dragons rouges.",
  [Faction.STRONGHOLD]: "Faction barbare : gobelins, ogres, cyclopes, behemoths.",
  [Faction.FORTRESS]: "Faction des marais : lézards, basilics, gorgones, wyvernes, hydres.",
  [Faction.CONFLUX]: "Faction élémentaire : pixies, élémentaires, oiseaux de feu.",
};

const FACTION_BY_TOWN_SLUG: Record<string, Faction> = {
  "town-castle": Faction.CASTLE,
  "town-rampart": Faction.RAMPART,
  "town-tower": Faction.TOWER,
  "town-inferno": Faction.INFERNO,
  "town-necropolis": Faction.NECROPOLIS,
  "town-dungeon": Faction.DUNGEON,
  "town-stronghold": Faction.STRONGHOLD,
  "town-fortress": Faction.FORTRESS,
  "town-conflux": Faction.CONFLUX,
};

const RESOURCE_BUILDING_BY_SLUG: Record<string, ResourceBuildingType> = {
  "gold-mine": ResourceBuildingType.GOLD_MINE,
  "sawmill": ResourceBuildingType.SAWMILL,
  "ore-pit": ResourceBuildingType.ORE_PIT,
  "alchemist-lab": ResourceBuildingType.ALCHEMIST_LAB,
  "crystal-cavern": ResourceBuildingType.CRYSTAL_CAVERN,
  "gem-pond": ResourceBuildingType.GEM_POND,
  "sulfur-dune": ResourceBuildingType.SULFUR_DUNE,
};

const RESOURCE_DESCRIPTIONS: Record<string, string> = {
  gold: "Monnaie principale. Sert à recruter, construire, négocier.",
  wood: "Bois - matériau de construction de base.",
  ore: "Minerai - matériau de construction de base.",
  mercury: "Mercure - ressource rare pour bâtiments et sorts avancés.",
  crystals: "Cristaux - ressource rare pour bâtiments et sorts avancés.",
  gems: "Gemmes - ressource rare pour bâtiments et sorts avancés.",
  sulfur: "Soufre - ressource rare pour bâtiments et sorts avancés.",
};

// ---------------------------------------------------------------------------
// Localization (dev-only gallery). The FR strings above stay canonical (used as
// React keys / open-group matching). At display time, `tr()` swaps to English
// when the locale is "en", via a flat literal map plus ordered fragment rules
// for composed labels. Kept inline so the shared dictionaries aren't bloated
// with ~250 dev-only keys.
// ---------------------------------------------------------------------------

const SPRITES_EN: Record<string, string> = {
  // Model / terrain / artifact label maps
  Infanterie: "Infantry", Tireur: "Shooter", Cavalerie: "Cavalry", Volant: "Flying",
  Colosse: "Colossus", Lanceur: "Caster", "Bête": "Beast", "Mort-vivant": "Undead",
  Plaine: "Grassland", Terre: "Dirt", Sable: "Sand", Neige: "Snow", Marais: "Swamp",
  Lave: "Lava", Montagne: "Mountain", "Forêt": "Forest", Eau: "Water",
  Arme: "Weapon", Bouclier: "Shield", Torse: "Torso", Heaume: "Helmet", Collier: "Necklace",
  Pieds: "Feet", Anneau: "Ring", Divers: "Misc",
  Attaque: "Attack", "Défense": "Defense", Puissance: "Spell Power", Connaissance: "Knowledge",
  Moral: "Morale", Chance: "Luck", "Déplacement": "Movement", "Déplacement mer": "Sea movement",
  "Armure des damnés": "Armor of the Damned",
  "Pouvoir du père-dragon": "Power of the Dragon Father",
  "Tonnerre des titans": "Titan's Thunder",
  "Alliance angélique": "Angelic Alliance",

  // Adventure building labels
  Observatoire: "Observatory", "Feu de camp": "Campfire", Phare: "Lighthouse", Stargate: "Stargate",
  "Arène": "Arena", "Camp de mercenaires": "Mercenary Camp", "Tour de Marletto": "Marletto Tower",
  "Axe étoilé": "Star Axis", "Jardin de révélation": "Garden of Revelation", "Pierre de savoir": "Learning Stone",
  "École de guerre": "School of War", "École de magie": "School of Magic",
  "Bibliothèque d'illumination": "Library of Enlightenment", Cartographe: "Cartographer",
  "Observatoire sylvestre": "Redwood Observatory", "Jardin mystique": "Mystical Garden",
  Ecuries: "Stables", Temple: "Temple", "Fontaine de fortune": "Fountain of Fortune",
  "Idole de fortune": "Idol of Fortune", "Puits magique": "Magic Well", "Sanctuaire magique": "Magic Shrine",
  "Moulin à eau": "Water Mill", "Roue à eau": "Water Wheel", "Chariot abandonne": "Abandoned Wagon",
  Caisse: "Crate", Squelette: "Skeleton", Obelisque: "Obelisk", "Tombe du guerrier": "Warrior's Tomb",
  "Autel maudit": "Cursed Altar", "Sanctuaire de sort I": "Spell Shrine I",
  "Sanctuaire de sort II": "Spell Shrine II", "Sanctuaire de sort III": "Spell Shrine III",
  "Arbre de connaissance": "Tree of Knowledge", "Hutte d'érudit": "Seer's Hut", Sirene: "Mermaid",
  "Bouée": "Buoy", "Debris flottants": "Flotsam", "Coffre marin": "Sea Chest",

  // Adventure building descriptions
  "Révèle une grande zone autour de la position visitée. Visitable une seule fois par héros.":
    "Reveals a large area around the visited position. Visitable once per hero.",
  "Offre un petit gain d'or et d'une ressource aléatoire. Disparaît une fois visité.":
    "Grants a small amount of gold and a random resource. Vanishes once visited.",
  "Une fois capturé, augmente le mouvement maritime de tous les héros du joueur.":
    "Once captured, increases the sea movement of all the player's heroes.",
  "Téléporte le héros vers une autre stargate appartenant au même joueur.":
    "Teleports the hero to another stargate owned by the same player.",
  "Permet de choisir un entraînement : +2 Attaque ou +2 Défense pour le héros.":
    "Lets you pick a training: +2 Attack or +2 Defense for the hero.",
  "Accorde +1 Attaque au héros qui le visite.": "Grants +1 Attack to the visiting hero.",
  "Accorde +1 Défense au héros qui la visite.": "Grants +1 Defense to the visiting hero.",
  "Accorde +1 Pouvoir au héros qui le visite.": "Grants +1 Spell Power to the visiting hero.",
  "Accorde +1 Savoir au héros qui le visite.": "Grants +1 Knowledge to the visiting hero.",
  "Accorde 1000 XP au héros qui la visite.": "Grants 1000 XP to the visiting hero.",
  "Permet de payer 1000 Or pour choisir +1 Attaque ou +1 Défense.":
    "Lets you pay 1000 Gold to pick +1 Attack or +1 Defense.",
  "Permet de payer 1000 Or pour choisir +1 Pouvoir ou +1 Savoir.":
    "Lets you pay 1000 Gold to pick +1 Spell Power or +1 Knowledge.",
  "Accorde +2 aux quatre caractéristiques principales aux héros de niveau 10 ou plus.":
    "Grants +2 to the four main stats to heroes level 10 or higher.",
  "Permet de payer 10000 Or pour révéler toute la carte.":
    "Lets you pay 10000 Gold to reveal the whole map.",
  "Révèle une très grande zone autour du bâtiment.": "Reveals a very large area around the building.",
  "Offre une récompense hebdomadaire en Or ou Gemmes.": "Grants a weekly reward of Gold or Gems.",
  "Accorde un bonus hebdomadaire de déplacement au héros.": "Grants the hero a weekly movement bonus.",
  "Accorde +1 Moral au héros qui le visite.": "Grants +1 Morale to the visiting hero.",
  "Accorde +1 Chance au héros qui la visite.": "Grants +1 Luck to the visiting hero.",
  "Accorde +1 Moral et +1 Chance au héros qui la visite.": "Grants +1 Morale and +1 Luck to the visiting hero.",
  "Restaure la mana du héros une fois par semaine.": "Restores the hero's mana once per week.",
  "Restaure 20 mana au héros qui le visite.": "Restores 20 mana to the visiting hero.",
  "Produit 1000 Or une fois par semaine pour le joueur.": "Produces 1000 Gold once per week for the player.",
  "Produit 500 Or une fois par semaine pour le joueur.": "Produces 500 Gold once per week for the player.",
  "Contient une petite récompense de carte fouillable une seule fois.":
    "Contains a small map reward searchable once.",
  "Contient de l'Or, du Bois ou du Minerai une seule fois.": "Contains Gold, Wood or Ore once.",
  "Peut contenir de l'Or ou quelques Gemmes.": "May contain Gold or a few Gems.",
  "Révèle une grande region autour du bâtiment.": "Reveals a large region around the building.",
  "Offre Or et XP, mais retire 1 Moral au héros.": "Grants Gold and XP, but removes 1 Morale from the hero.",
  "Accorde +1 Pouvoir au héros, mais retire 1 Chance.": "Grants +1 Spell Power to the hero, but removes 1 Luck.",
  "Enseigne un sort de niveau 1 au héros.": "Teaches the hero a level 1 spell.",
  "Enseigne un sort de niveau 2 au héros.": "Teaches the hero a level 2 spell.",
  "Enseigne un sort de niveau 3 au héros.": "Teaches the hero a level 3 spell.",
  "Accorde 2000 XP contre 2000 Or.": "Grants 2000 XP for 2000 Gold.",
  "Accorde 1000 XP et restaure un peu de mana.": "Grants 1000 XP and restores a little mana.",
  "Accorde +1 Chance au héros.": "Grants +1 Luck to the hero.",
  "Accorde +1 Moral au héros.": "Grants +1 Morale to the hero.",
  "Contient de l'Or et du Bois.": "Contains Gold and Wood.",
  "Contient de l'Or ou des Gemmes.": "Contains Gold or Gems.",
  "Bâtiment d'aventure.": "Adventure building.",

  // Faction town descriptions
  "Faction humaine équilibrée : pikemen, archers, griffons, chevaliers, anges.":
    "Balanced human faction: pikemen, archers, griffins, knights, angels.",
  "Faction sylvestre : centaures, elfes, pégases, licornes, dragons verts.":
    "Sylvan faction: centaurs, elves, pegasi, unicorns, green dragons.",
  "Faction mage : gremlins, gargouilles, golems, mages, génies, titans.":
    "Mage faction: gremlins, gargoyles, golems, mages, genies, titans.",
  "Faction démoniaque : diablotins, démons, efreets, diables.":
    "Demonic faction: imps, demons, efreets, devils.",
  "Faction morts-vivants : squelettes, vampires, liches, dragons d'os.":
    "Undead faction: skeletons, vampires, liches, bone dragons.",
  "Faction souterraine : troglodytes, méduses, manticores, dragons rouges.":
    "Subterranean faction: troglodytes, medusas, manticores, red dragons.",
  "Faction barbare : gobelins, ogres, cyclopes, behemoths.":
    "Barbarian faction: goblins, ogres, cyclopes, behemoths.",
  "Faction des marais : lézards, basilics, gorgones, wyvernes, hydres.":
    "Swamp faction: lizardmen, basilisks, gorgons, wyverns, hydras.",
  "Faction élémentaire : pixies, élémentaires, oiseaux de feu.":
    "Elemental faction: pixies, elementals, firebirds.",

  // Resource descriptions
  "Monnaie principale. Sert à recruter, construire, négocier.":
    "Main currency. Used to recruit, build and trade.",
  "Bois - matériau de construction de base.": "Wood - basic construction material.",
  "Minerai - matériau de construction de base.": "Ore - basic construction material.",
  "Mercure - ressource rare pour bâtiments et sorts avancés.":
    "Mercury - rare resource for advanced buildings and spells.",
  "Cristaux - ressource rare pour bâtiments et sorts avancés.":
    "Crystals - rare resource for advanced buildings and spells.",
  "Gemmes - ressource rare pour bâtiments et sorts avancés.":
    "Gems - rare resource for advanced buildings and spells.",
  "Soufre - ressource rare pour bâtiments et sorts avancés.":
    "Sulfur - rare resource for advanced buildings and spells.",

  // Detail categories / misc labels
  "Banque de créatures": "Creature bank", "Bâtiment de ville": "Town building",
  "Bâtiment de ressource": "Resource building", "Demeure externe": "External dwelling",
  "Bâtiment d'aventure": "Adventure building", Obstacle: "Obstacle", Ressource: "Resource",
  Faction: "Faction", "Machine de guerre": "War machine", "Fortification de siege": "Siege fortification",
  "Mur de carte aventure": "Adventure map wall", "Porte de carte aventure": "Adventure map gate",
  "Sprite générique": "Generic sprite", "Texture de terrain": "Terrain texture",
  "Décor impassable.": "Impassable decor.",
  "Demeure externe générique": "Generic external dwelling", Baliste: "Ballista",
  "Tente de premiers secours": "First aid tent", "Chariot de munitions": "Ammo cart",
  Catapulte: "Catapult", Tour: "Tower", Porte: "Gate", "Mur de rempart": "Rampart wall",
  "Porte générique": "Generic gate", "Porte N_S": "Gate N_S", "Porte E_W": "Gate E_W",

  // Group labels
  "Machines de guerre": "War machines", "Fortifications de siège": "Siege fortifications",
  "Villes de faction": "Faction towns", "Bâtiments de ressources": "Resource buildings",
  "Bâtiments d'aventure": "Adventure buildings", "Banques de créatures": "Creature banks",
  "Demeures externes": "External dwellings", "Murs et portes": "Walls and gates",
  Obstacles: "Obstacles", Ressources: "Resources", "Bâtiments communs": "Common buildings",
  "Demeures améliorées": "Upgraded dwellings", "Bâtiments uniques": "Unique buildings",
  "Onglets ville (HUD)": "Town tabs (HUD)",

  // Subtitles
  "Unités de combat": "Combat units",
  "Spritesheets animés : idle et marche par direction": "Animated spritesheets: idle and walk per direction",
  "Galions complets par faction : idle et navigation par direction":
    "Full galleons per faction: idle and sailing per direction",
  "Héros aventure": "Adventure heroes", "Bateaux aventure": "Adventure boats",

  // Tabs
  Aventure: "Adventure", Villes: "Towns", Artefacts: "Artifacts",

  // SVG items
  "Marché": "Market", "Marchands d'artefacts": "Artifact merchants", "Francs-tireurs": "Free shooters",
  "Porte des Braises": "Ember gate", "Université de magie": "Magic university", "Cour des balistes": "Ballista yard",
  "Échange ressources (taux selon nb marchés)": "Trade resources (rate based on # markets)",
  "Achat artefacts (Cercle d'Azur/Royaume Sous-Roche/Orbe Primordial)": "Buy artifacts (Azure Circle/Understone Realm/Primordial Orb)",
  "Vendre créatures de garnison (Marteaux Rouges)": "Sell garrison creatures (Red Hammers)",
  "Transfert garnison entre villes des Braises Profanes": "Transfer garrison between Profane Embers towns",
  "Apprendre écoles élémentaires (Orbe Primordial)": "Learn elemental schools (Primordial Orb)",
  "Achat machines de guerre (Marteaux Rouges)": "Buy war machines (Red Hammers)",

  // Stat labels
  PV: "HP", Type: "Type", Classe: "Class", Description: "Description", Effet: "Effect",
  "Garde (puissance)": "Guard (power)", Slots: "Slots", "Nom original": "Original name",
  "Rareté": "Rarity", Aquatique: "Aquatic", "Croissance / semaine": "Growth / week",
  "Coût unitaire": "Unit cost", "Att/Déf": "Att/Def", "Production / jour": "Production / day",
  "Garde (puissance de base)": "Guard (base power)", "Prérequis": "Requirements",
  "Unité débloquée": "Unlocked unit", Remplace: "Replaces", "Face cube": "Cube face",
  Terrain: "Terrain", Masque: "Mask", "Unité produite": "Produced unit", "Coût": "Cost",
  Tirs: "Shots", "Dégâts": "Damage",

  // Section titles
  "Capacités": "Abilities", Bonus: "Bonus", "Effets supplémentaires": "Additional effects",
  Combo: "Combo", "Terrains préférés": "Preferred terrains", Variantes: "Variants",
  "Bonus de croissance": "Growth bonus", Fonctionnement: "How it works",
  "Unités élite (palier 7+)": "Elite units (tier 7+)", Spritesheet: "Spritesheet", Tags: "Tags",
  Gardiens: "Guardians", "Récompense": "Reward", Variante: "Variant", garde: "guard",
  Recrute: "Recruit", Artefact: "Artifact",
  or: "gold", bois: "wood", minerai: "ore", mercure: "mercury", cristaux: "crystals",
  gemmes: "gems", soufre: "sulfur",

  // Value strings
  Distance: "Ranged", "Mêlée": "Melee", Oui: "Yes", Non: "No", Gratuit: "Free", Dessus: "Top",

  // Prose
  "Une fois capturé, le bâtiment ajoute sa production aux revenus quotidiens du joueur. Il est défendu par des gardiens dont la force dépend de la valeur de base ci-dessus, ajustée par la difficulté de la carte.":
    "Once captured, the building adds its production to the player's daily income. It is defended by guardians whose strength depends on the base value above, adjusted by map difficulty.",
  "La demeure externe produit chaque semaine son nombre de créatures. Un héros du propriétaire peut venir les recruter sur place avec les ressources nécessaires.":
    "The external dwelling produces its number of creatures each week. A hero of the owner can come recruit them on site with the required resources.",
  "Animation directionnelle utilisée par le moteur Phaser pour les héros et bateaux d'aventure (idle + marche par orientation).":
    "Directional animation used by the Phaser engine for adventure heroes and boats (idle + walk per orientation).",

  // Header
  "Galerie des sprites": "Sprites gallery",
  "Inspection métier des sprites du jeu. Ouvrez une carte pour vérifier le rendu, les détails et la navigation au clavier.":
    "Production inspection of the game's sprites. Open a card to check rendering, details and keyboard navigation.",
};

// Ordered fragment rules for composed labels (applied only for "en"). Longer /
// more specific fragments first so they don't get partially clobbered.
const SPRITES_FRAGMENTS: Array<[string, string]> = [
  [" - bâtiment unique", " - unique building"],
  [" - demeure améliorée", " - upgraded dwelling"],
  ["Terrain - ", "Terrain - "],
  ["Routes - ", "Roads - "],
  ["Artefacts - ", "Artifacts - "],
  ["Ville ", "Town "],
  ["bateau ", "boat "],
  [" par frame", " per frame"],
  ["Masque route ", "Road mask "],
  ["côte ", "side "],
  ["Variante ", "Variant "],
  [" · garde ", " · guard "],
  ["Recrute ", "Recruit "],
  ["Artefact ", "Artifact "],
  ["/semaine", "/week"],
  [" or", " gold"],
  ["Trésor", "Treasure"],
  ["Mineur", "Minor"],
  ["Majeur", "Major"],
  ["Relique", "Relic"],
];

function localize(locale: Locale, s: string | undefined): string {
  if (!s || locale !== "en") return s ?? "";
  if (SPRITES_EN[s]) return SPRITES_EN[s];
  let out = s;
  for (const [fr, en] of SPRITES_FRAGMENTS) {
    if (out.includes(fr)) out = out.split(fr).join(en);
  }
  return out;
}

// Locale flows through context so the leaf cards/panels can localize at display
// time without re-plumbing the module-scope FR entry constants.
const SpritesLocaleContext = createContext<Locale>("fr");
type Tr = (s: string | undefined) => string;
function useTr(): Tr {
  const locale = useContext(SpritesLocaleContext);
  return (s) => localize(locale, s);
}

function mockUnit(unitType: UnitType, side: "attacker" | "defender"): CombatBoardUnit {
  const rule = UNIT_RULES[unitType];
  return {
    id: `${unitType}-${side}`,
    unitType,
    count: 1,
    side,
    q: 0,
    r: 0,
    health: rule.health,
    maxHealth: rule.health,
    position: 0,
    ownerPlayerId: "p",
    heroId: "h",
    participantId: null,
    joinsRound: 1,
    speed: rule.speed,
    minDamage: rule.minDamage,
    maxDamage: rule.maxDamage,
    ranged: rule.ranged ?? false,
    shots: rule.shots ?? 0,
    hasRetaliated: false,
    defended: false,
    waited: false,
  };
}

function buildUnitEntry(unitType: UnitType): SpriteEntry {
  const rule = UNIT_RULES[unitType];
  const model = getUnitModel(mockUnit(unitType, "attacker"));
  return {
    kind: "unit",
    path: getUnitSpritePath(unitType),
    label: rule.label,
    detail: MODEL_LABELS[model],
    width: 480,
    height: 480,
    unitType,
    unit: { model: MODEL_LABELS[model], rule },
  };
}

function buildKingEntry(faction: Faction): SpriteEntry {
  const rule = UNIT_RULES[UnitType.KING];
  return {
    kind: "unit",
    path: getKingUnitSpritePath(faction),
    label: `Roi - ${FACTION_TOWN_NAMES[faction] ?? faction}`,
    detail: "Mode Roi",
    width: 480,
    height: 480,
    unitType: UnitType.KING,
    unit: { model: "Infanterie", rule },
  };
}

function buildArtifactEntry(artifact: ArtifactDefinition): SpriteEntry {
  return {
    kind: "artifact",
    path: `/assets/sprites/artifacts/${artifact.id}.webp`,
    label: artifact.name,
    detail: `Artefact ${artifactClassLabel(artifact.class)}`,
    width: 480,
    height: 480,
    artifact,
  };
}

function buildCreatureBankEntry(type: (typeof CREATURE_BANK_TYPES)[number]): SpriteEntry {
  const def = CREATURE_BANK_DEFINITIONS[type];
  return {
    kind: "creatureBank",
    path: `/assets/sprites/map/creature-bank-${type.replace(/_/g, "-")}.webp`,
    label: def.label,
    detail: "Banque de créatures",
    width: 560,
    height: 560,
    creatureBank: def,
  };
}

function buildTownBuildingEntry(
  faction: Faction,
  rule: TownBuildingRule,
  path: string,
): SpriteEntry {
  const detail = rule.category === "unique"
    ? `${FACTION_TOWN_NAMES[faction]} - bâtiment unique`
    : rule.category === "dwelling_upgrade"
      ? `${FACTION_TOWN_NAMES[faction]} - demeure améliorée`
      : "Bâtiment de ville";
  return {
    kind: "townBuilding",
    path,
    label: rule.category === "common" ? rule.label : `${FACTION_TOWN_NAMES[faction]} - ${rule.label}`,
    detail,
    width: 480,
    height: 480,
    townBuilding: { rule, faction },
  };
}

function buildResourceBuildingEntry(rule: ResourceBuildingRule, path: string): SpriteEntry {
  return {
    kind: "resourceBuilding",
    path,
    label: rule.label,
    detail: "Bâtiment de ressource",
    width: 480,
    height: 480,
    resourceBuilding: rule,
  };
}

function buildExternalDwellingEntry(unitType: UnitType): SpriteEntry {
  const rule = UNIT_RULES[unitType];
  return {
    kind: "externalDwelling",
    path: getExternalDwellingSprite(unitType) ?? "/assets/sprites/map/external-dwelling.webp",
    label: `${getExternalDwellingLabel(unitType)} - ${rule.label}`,
    detail: "Demeure externe",
    width: 480,
    height: 480,
    externalDwelling: { unitType, rule },
  };
}

function buildAdventureBuildingEntry(slug: string): SpriteEntry {
  const def = ADVENTURE_BUILDING_DETAILS[slug];
  return {
    kind: "adventureBuilding",
    path: `/assets/sprites/map/${slug}.webp`,
    label: def?.label ?? slug,
    detail: "Bâtiment d'aventure",
    width: 480,
    height: 480,
    adventure: { description: def?.description ?? "Bâtiment d'aventure." },
  };
}

function buildObstacleEntry(slug: string): SpriteEntry {
  const def = OBSTACLE_DETAILS[slug];
  return {
    kind: "obstacle",
    path: `/assets/sprites/map/${slug}.webp`,
    label: def?.label ?? slug,
    detail: "Obstacle",
    width: 480,
    height: 480,
    obstacle: { description: def?.description ?? "Décor impassable." },
  };
}

function buildResourceEntry(resource: keyof Resources): SpriteEntry {
  return {
    kind: "resource",
    path: `/assets/sprites/resources/${resource}.webp`,
    label: RESOURCE_LABELS[resource],
    detail: "Ressource",
    width: 320,
    height: 320,
    adventure: { description: RESOURCE_DESCRIPTIONS[resource] ?? "" },
  };
}

function buildFactionTownEntry(slug: string): SpriteEntry {
  const faction = FACTION_BY_TOWN_SLUG[slug];
  return {
    kind: "factionTown",
    path: `/assets/sprites/map/${slug}.webp`,
    label: `Ville ${FACTION_TOWN_NAMES[faction] ?? faction}`,
    detail: "Faction",
    width: 560,
    height: 560,
    factionTown: { faction, description: FACTION_TOWN_DESCRIPTIONS[faction] ?? "" },
  };
}

function buildHeroSheetEntry(sheet: HeroSpritesheet): SpriteEntry {
  return {
    kind: "heroSheet",
    path: sheet.path,
    label: sheet.faction,
    detail: `${sheet.frameWidth}x${sheet.frameHeight} par frame`,
    width: 960,
    height: 640,
  };
}

function buildBoatSheetEntry(sheet: BoatSpritesheet): SpriteEntry {
  return {
    kind: "boatSheet",
    path: sheet.path,
    label: `bateau ${sheet.faction}`,
    detail: `${sheet.frameWidth}x${sheet.frameHeight} par frame`,
    width: 960,
    height: 640,
  };
}

function buildTerrainTextureEntry(
  terrain: TerrainType,
  texture: TerrainTopTexture,
  face: "top" | "SW" | "SE",
): SpriteEntry {
  const terrainLabel = TERRAIN_LABELS[terrain] ?? terrain;
  const labelFace = face === "top" ? "dessus" : `côte ${face}`;
  return {
    kind: "terrainTexture",
    path: face === "top" ? texture.path : getTerrainSideTexturePath(texture.path, face),
    label: `${terrainLabel} - ${labelFace}`,
    detail: texture.tags.length > 0 ? texture.tags.join(", ") : "Texture de terrain",
    width: 160,
    height: 112,
    terrainTexture: { terrain, face, tags: texture.tags },
  };
}

function buildRoadTextureEntry(kind: string, mask: number, path: string): SpriteEntry {
  return {
    kind: "roadTexture",
    path,
    label: `${kind} ${mask}`,
    detail: `Masque route ${mask}`,
    width: 160,
    height: 112,
    roadTexture: { kind, mask },
  };
}

const FACTION_GROUPS: { key: string; label: string; units: UnitType[] }[] = CREATURE_GROUPS.map((group) => ({
  key: group.key,
  label: group.label,
  units: group.units,
}));
const FEATURED_UNIT_GROUPS = new Set(["cove", "factory", "bulwark", "neutral"]);
const UNIT_TYPES = FACTION_GROUPS.flatMap((group) => group.units);
const UNIT_ENTRIES: SpriteEntry[] = UNIT_TYPES.map(buildUnitEntry);

const HERO_SHEET_ENTRIES = Object.values(HERO_SPRITESHEETS);
const BOAT_SHEET_ENTRIES = Object.values(BOAT_SPRITESHEETS);
const SHEET_ENTRIES: SpriteEntry[] = [
  ...HERO_SHEET_ENTRIES.map(buildHeroSheetEntry),
  ...BOAT_SHEET_ENTRIES.map(buildBoatSheetEntry),
];

type WebpGroup = { label: string; entries: SpriteEntry[] };

const TOWN_BUILDING_COMMON_GROUP: SpriteEntry[] = Object.entries(COMMON_TOWN_BUILDING_SPRITES)
  .map(([buildingType, path]) => {
    const rule = getFactionBuildingRules(Faction.CASTLE).find((r) => r.type === buildingType);
    if (!rule || !path) return null;
    return buildTownBuildingEntry(Faction.CASTLE, rule, path);
  })
  .filter((entry): entry is SpriteEntry => entry !== null);

const TOWN_BUILDING_UPGRADED_DWELLING_GROUP: SpriteEntry[] = Object.entries(FACTION_UPGRADED_UNITS)
  .flatMap(([faction, units]) => {
    const rules = getFactionBuildingRules(faction as Faction).filter((r) => r.category === "dwelling_upgrade");
    return units.map((unitType) => {
      const rule = rules.find((r) => r.unlocksUnit === unitType);
      if (!rule) return null;
      return buildTownBuildingEntry(
        faction as Faction,
        rule,
        `/assets/sprites/town-buildings/dwellings/upgraded/${unitType}.webp`,
      );
    });
  })
  .filter((entry): entry is SpriteEntry => entry !== null);

const TOWN_BUILDING_UNIQUE_GROUP: SpriteEntry[] = Object.entries(UNIQUE_TOWN_BUILDING_SPRITES)
  .flatMap(([faction, sprites]) => {
    const rules = getFactionBuildingRules(faction as Faction).filter((r) => r.category === "unique");
    return Object.entries(sprites ?? {})
      .map(([buildingType, path]) => {
        const rule = rules.find((r) => r.type === buildingType);
        if (!rule || !path) return null;
        return buildTownBuildingEntry(faction as Faction, rule, path);
      })
      .filter((entry): entry is SpriteEntry => entry !== null);
  });

const RESOURCE_BUILDING_GROUP: SpriteEntry[] = RESOURCE_BUILDING_RULES.map((rule) => {
  const slug = Object.entries(RESOURCE_BUILDING_BY_SLUG).find(([, type]) => type === rule.type)?.[0];
  if (!slug) return null;
  return buildResourceBuildingEntry(rule, `/assets/sprites/map/${slug}.webp`);
}).filter((entry): entry is SpriteEntry => entry !== null);

const FACTION_TOWNS_GROUP: SpriteEntry[] = Object.keys(FACTION_BY_TOWN_SLUG).map(buildFactionTownEntry);

const ADVENTURE_BUILDING_GROUP: SpriteEntry[] = Object.keys(ADVENTURE_BUILDING_DETAILS).map(buildAdventureBuildingEntry);

const EXTERNAL_DWELLING_GROUP: SpriteEntry[] = [
  {
    kind: "generic",
    path: "/assets/sprites/map/external-dwelling.webp",
    label: "Demeure externe générique",
    detail: "Sprite générique",
    width: 480,
    height: 480,
  },
  ...EXTERNAL_DWELLING_UNIT_TYPES.map(buildExternalDwellingEntry),
];

const CREATURE_BANK_GROUP: SpriteEntry[] = CREATURE_BANK_TYPES.map(buildCreatureBankEntry);

const ARTIFACT_GROUPS: WebpGroup[] = (["treasure", "minor", "major", "relic"] as const).map((cls) => ({
  label: `Artefacts - ${artifactClassLabel(cls)}`,
  entries: ARTIFACTS.filter((artifact) => artifact.class === cls).map(buildArtifactEntry),
}));

const OBSTACLE_GROUP: SpriteEntry[] = Object.keys(OBSTACLE_DETAILS).map(buildObstacleEntry);

const RESOURCE_GROUP: SpriteEntry[] = (Object.keys(RESOURCE_LABELS) as (keyof Resources)[]).map(buildResourceEntry);

const WAR_MACHINE_GROUP: SpriteEntry[] = [
  {
    kind: "generic",
    path: "/assets/sprites/units/ballista.webp",
    label: "Baliste",
    detail: "Machine de guerre",
    width: 480,
    height: 480,
  },
  {
    kind: "generic",
    path: "/assets/sprites/units/first_aid_tent.webp",
    label: "Tente de premiers secours",
    detail: "Machine de guerre",
    width: 480,
    height: 480,
  },
  {
    kind: "generic",
    path: "/assets/sprites/units/ammo_cart.webp",
    label: "Chariot de munitions",
    detail: "Machine de guerre",
    width: 480,
    height: 480,
  },
  {
    kind: "generic",
    path: "/assets/sprites/units/catapult.webp",
    label: "Catapulte",
    detail: "Machine de guerre",
    width: 480,
    height: 480,
  },
];

const KING_UNIT_GROUP: SpriteEntry[] = KING_SPRITE_FACTIONS.map(buildKingEntry);

const SIEGE_FORTIFICATION_GROUP: SpriteEntry[] = [
  {
    kind: "generic",
    path: "/assets/sprites/siege/tower-castle.webp",
    label: "Tour",
    detail: "Fortification de siege",
    width: 560,
    height: 560,
  },
  {
    kind: "generic",
    path: "/assets/sprites/siege/gate-castle.webp",
    label: "Porte",
    detail: "Fortification de siege",
    width: 560,
    height: 560,
  },
];

const MAP_WALL_GATE_GROUP: SpriteEntry[] = [
  {
    kind: "generic",
    path: "/assets/sprites/map/wall-rampart-cube.png",
    label: "Mur de rempart",
    detail: "Mur de carte aventure",
    width: 512,
    height: 512,
  },
  {
    kind: "generic",
    path: "/assets/sprites/map/gate.webp",
    label: "Porte générique",
    detail: "Porte de carte aventure",
    width: 512,
    height: 512,
  },
  {
    kind: "generic",
    path: "/assets/sprites/map/gate-N-S.webp",
    label: "Porte N_S",
    detail: "Porte de carte aventure",
    width: 512,
    height: 512,
  },
  {
    kind: "generic",
    path: "/assets/sprites/map/gate-E-W.webp",
    label: "Porte E_W",
    detail: "Porte de carte aventure",
    width: 512,
    height: 512,
  },
];

const TERRAIN_TEXTURE_GROUPS: WebpGroup[] = Object.entries(TERRAIN_TOP_TEXTURES).map(([terrain, textures]) => ({
  label: `Terrain - ${TERRAIN_LABELS[terrain as TerrainType] ?? terrain}`,
  entries: (textures as readonly TerrainTopTexture[]).flatMap((texture) => [
    buildTerrainTextureEntry(terrain as TerrainType, texture, "top"),
    buildTerrainTextureEntry(terrain as TerrainType, texture, "SW"),
    buildTerrainTextureEntry(terrain as TerrainType, texture, "SE"),
  ]),
}));

const ROAD_TEXTURE_GROUPS: WebpGroup[] = Object.entries(ROAD_TEXTURES).map(([kind, textures]) => ({
  label: `Routes - ${kind}`,
  entries: Object.entries(textures).map(([mask, path]) => buildRoadTextureEntry(kind, Number(mask), path)),
}));

const TEXTURE_GROUPS: WebpGroup[] = [
  ...TERRAIN_TEXTURE_GROUPS,
  ...ROAD_TEXTURE_GROUPS,
];

const COMBAT_GROUPS: WebpGroup[] = [
  { label: "Rois de faction", entries: KING_UNIT_GROUP },
  { label: "Machines de guerre", entries: WAR_MACHINE_GROUP },
  { label: "Fortifications de siège", entries: SIEGE_FORTIFICATION_GROUP },
];

const ADVENTURE_GROUPS: WebpGroup[] = [
  { label: "Villes de faction", entries: FACTION_TOWNS_GROUP },
  { label: "Bâtiments de ressources", entries: RESOURCE_BUILDING_GROUP },
  { label: "Bâtiments d'aventure", entries: ADVENTURE_BUILDING_GROUP },
  { label: "Banques de créatures", entries: CREATURE_BANK_GROUP },
  { label: "Demeures externes", entries: EXTERNAL_DWELLING_GROUP },
  { label: "Murs et portes", entries: MAP_WALL_GATE_GROUP },
  { label: "Obstacles", entries: OBSTACLE_GROUP },
  { label: "Ressources", entries: RESOURCE_GROUP },
];

const TOWN_GROUPS: WebpGroup[] = [
  { label: "Bâtiments communs", entries: TOWN_BUILDING_COMMON_GROUP },
  { label: "Demeures améliorées", entries: TOWN_BUILDING_UPGRADED_DWELLING_GROUP },
  { label: "Bâtiments uniques", entries: TOWN_BUILDING_UNIQUE_GROUP },
];

const ARTIFACT_FLAT = ARTIFACT_GROUPS.flatMap((group) => group.entries);
const COMBAT_FLAT = [...UNIT_ENTRIES, ...COMBAT_GROUPS.flatMap((group) => group.entries)];
const ADVENTURE_FLAT = ADVENTURE_GROUPS.flatMap((group) => group.entries);
const TOWN_FLAT = TOWN_GROUPS.flatMap((group) => group.entries);
const TEXTURE_FLAT = TEXTURE_GROUPS.flatMap((group) => group.entries);

const COMBAT_COUNT = COMBAT_FLAT.length;
const ADVENTURE_COUNT = ADVENTURE_FLAT.length;
const TOWN_COUNT = TOWN_FLAT.length;
const ARTIFACT_COUNT = ARTIFACT_FLAT.length;
const SPRITESHEET_COUNT = SHEET_ENTRIES.length;
const TEXTURE_COUNT = TEXTURE_FLAT.length;

type GalleryTab = "combat" | "adventure" | "towns" | "artifacts" | "spritesheets" | "textures" | "svg";
type GalleryTabDefinition = {
  id: GalleryTab;
  label: string;
  count: number;
  render: (onSelect: (selection: Selection) => void) => ReactNode;
};

function findFlatIndex(entries: SpriteEntry[], target: SpriteEntry): number {
  const byPath = entries.findIndex((entry) => entry.path === target.path && entry.label === target.label);
  return byPath >= 0 ? byPath : 0;
}

function UnitCard({
  entries,
  index,
  onSelect,
}: {
  entries: SpriteEntry[];
  index: number;
  onSelect: (selection: Selection) => void;
}) {
  const entry = entries[index];
  const rule = entry.unit!.rule;
  const tr = useTr();
  const locale = useContext(SpritesLocaleContext);

  return (
    <button
      type="button"
      onClick={() => onSelect({ entries, index })}
      className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3 text-left shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset] transition hover:border-amber-400/70 hover:shadow-[0_0_22px_rgba(251,191,36,0.14)] focus:outline-none focus:ring-2 focus:ring-amber-300/60"
    >
      <div className="grid h-[148px] w-[112px] place-items-center rounded bg-[linear-gradient(45deg,#1f1f1f_25%,transparent_25%),linear-gradient(-45deg,#1f1f1f_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1f1f1f_75%),linear-gradient(-45deg,transparent_75%,#1f1f1f_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]">
        <Image
          src={entry.path}
          alt={rule.label}
          width={124}
          height={124}
          loading="eager"
          className="h-[124px] w-[124px] object-contain drop-shadow-[0_6px_5px_rgba(0,0,0,0.65)]"
          style={{ height: "auto" }}
          unoptimized
        />
      </div>
      <div className="text-center">
        <div className="text-sm font-black text-amber-200">{localizedUnitLabel(rule.type, rule.label, locale)}</div>
        <div className="text-[10px] uppercase tracking-wider text-stone-400">{tr(entry.unit!.model)}</div>
        <div className="mt-1 text-[10px] text-stone-500">
          {tr("Att/Déf")} {rule.attack}/{rule.defense} · {tr("Dégâts")} {rule.minDamage}-{rule.maxDamage}
        </div>
      </div>
    </button>
  );
}

function StaticCard({
  entries,
  index,
  onSelect,
}: {
  entries: SpriteEntry[];
  index: number;
  onSelect: (selection: Selection) => void;
}) {
  const entry = entries[index];
  const tr = useTr();
  return (
    <button
      type="button"
      onClick={() => onSelect({ entries, index })}
      className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3 text-center transition hover:border-amber-400/70 hover:shadow-[0_0_22px_rgba(251,191,36,0.14)] focus:outline-none focus:ring-2 focus:ring-amber-300/60"
    >
      <div className="grid h-[96px] w-[96px] place-items-center rounded bg-stone-950/60">
        <Image src={entry.path} alt={entry.label} width={80} height={80} unoptimized />
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-amber-200">{tr(entry.label)}</div>
        {entry.detail ? <div className="text-[10px] text-stone-500">{tr(entry.detail)}</div> : null}
      </div>
    </button>
  );
}

function HeroSheetPreview({
  sheet,
  direction,
  state,
}: {
  sheet: DirectionalSpritesheet;
  direction: HeroDirection;
  state: "idle" | "walk";
}) {
  const [tick, setTick] = useState(0);
  const directionIndex = HERO_DIRECTIONS.indexOf(direction);
  const frames = state === "idle" ? [0, 1, 2, 3, 2, 1] : [4, 5, 6, 7, 8, 9, 10, 11];
  const frame = frames[tick % frames.length];
  const previewSize = 52;
  const previewScale = previewSize / sheet.frameWidth;

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), state === "idle" ? 180 : 90);
    return () => window.clearInterval(interval);
  }, [state]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="h-[52px] w-[52px]"
        style={{
          backgroundImage: `url(${sheet.path})`,
          backgroundPosition: `-${frame * sheet.frameWidth * previewScale}px -${directionIndex * sheet.frameHeight * previewScale}px`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${sheet.frameWidth * sheet.columns * previewScale}px ${sheet.frameHeight * HERO_DIRECTIONS.length * previewScale}px`,
        }}
      />
      <span className="text-[10px] uppercase tracking-wider text-stone-500">{state}</span>
    </div>
  );
}

function DirectionalSheetCard({
  alt,
  label,
  entries,
  index,
  onSelect,
  sheet,
}: {
  alt: string;
  label: string;
  entries: SpriteEntry[];
  index: number;
  onSelect: (selection: Selection) => void;
  sheet: DirectionalSpritesheet;
}) {
  const tr = useTr();
  return (
    <div className="rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-amber-200">{tr(label)}</div>
          <button
            type="button"
            onClick={() => onSelect({ entries, index })}
            className="rounded border border-stone-700 bg-stone-950 transition hover:border-amber-400/70 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
          >
            <Image src={sheet.path} alt={alt} width={240} height={160} className="rounded" unoptimized />
          </button>
          <div className="mt-1 max-w-[240px] break-all text-[10px] text-stone-500">{sheet.path}</div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {HERO_DIRECTIONS.map((direction) => (
            <div key={direction} className="rounded border border-stone-800 bg-stone-950/60 p-2">
              <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-amber-300">{direction}</div>
              <div className="grid grid-cols-2 gap-2">
                <HeroSheetPreview sheet={sheet} direction={direction} state="idle" />
                <HeroSheetPreview sheet={sheet} direction={direction} state="walk" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  const tr = useTr();
  return (
    <div className="rounded border border-stone-800 bg-black/30 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr(label)}</div>
      <div className="mt-1 text-sm font-black text-amber-100">{typeof value === "string" ? tr(value) : value}</div>
    </div>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  const tr = useTr();
  return (
    <div className="mt-3 rounded border border-stone-800 bg-black/30 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr(title)}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-stone-700 bg-stone-900 px-2 py-1 text-xs font-bold text-stone-200">
      {children}
    </span>
  );
}

function formatCost(cost: Partial<Resources>, locale: Locale) {
  const entries = Object.entries(cost).filter(([, amount]) => Boolean(amount));
  if (entries.length === 0) return localize(locale, "Gratuit");
  return entries.map(([resource, amount]) => `${amount} ${localize(locale, RESOURCE_LABELS[resource as keyof Resources])}`).join(" · ");
}

function UnitDetails({ unit }: { unit: NonNullable<SpriteEntry["unit"]> }) {
  const { rule } = unit;
  const tr = useTr();
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr("Type")}</div>
          <div className="text-sm font-black text-amber-100">{tr(unit.model)}</div>
        </div>
        <div className="rounded border border-amber-700/40 bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-100">
          {rule.type}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="PV" value={rule.health} />
        <Stat label="Déplacement" value={rule.speed} />
        <Stat label="Attaque" value={rule.attack} />
        <Stat label="Défense" value={rule.defense} />
        <Stat label="Dégâts" value={`${rule.minDamage}-${rule.maxDamage}`} />
        <Stat label="Puissance" value={rule.power} />
        <Stat label="Combat" value={rule.ranged ? "Distance" : "Mêlée"} />
        <Stat label="Tirs" value={rule.ranged ? (rule.shots ?? 0) : "-"} />
      </div>
      {rule.abilities?.length ? (
        <Section title="Capacités">
          <div className="flex flex-wrap gap-2">
            {rule.abilities.map((ability) => (
              <Badge key={ability}>{ability}</Badge>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function ArtifactDetails({ artifact }: { artifact: ArtifactDefinition }) {
  const tr = useTr();
  const bonuses = (Object.entries(artifact.bonus) as [keyof ArtifactStatsBonus, number][])
    .filter(([, value]) => value);
  const slotLabels = Array.from(new Set(artifact.slots.map((slot) => tr(ARTIFACT_SLOT_LABELS[slot] ?? slot))));
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr("Classe")}</div>
          <div className="text-sm font-black text-amber-100">{artifactClassLabel(artifact.class)}</div>
        </div>
        <div className="rounded border border-amber-700/40 bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-100">
          {artifact.id}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Coût" value={`${artifact.cost} or`} />
        <Stat label="Garde (puissance)" value={ARTIFACT_GUARDIAN_POWER[artifact.class]} />
        <Stat label="Slots" value={slotLabels.join(", ")} />
        <Stat label="Nom original" value={<span className="text-xs">{artifact.originalName}</span>} />
      </div>
      {bonuses.length ? (
        <Section title="Bonus">
          <div className="grid grid-cols-2 gap-2">
            {bonuses.map(([stat, value]) => (
              <div key={stat} className="flex items-center justify-between rounded border border-stone-800 bg-black/40 px-2 py-1">
                <span className="text-xs text-stone-300">{tr(ARTIFACT_BONUS_LABELS[stat])}</span>
                <span className={`font-mono text-xs font-black ${value > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {value > 0 ? `+${value}` : value}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      {artifact.unsupportedEffects?.length ? (
        <Section title="Effets supplémentaires">
          <div className="flex flex-wrap gap-2">
            {artifact.unsupportedEffects.map((effect) => (
              <Badge key={effect}>{effect}</Badge>
            ))}
          </div>
        </Section>
      ) : null}
      {artifact.combo ? (
        <Section title="Combo">
          <Badge>{tr(ARTIFACT_COMBO_LABELS[artifact.combo] ?? artifact.combo)}</Badge>
        </Section>
      ) : null}
    </>
  );
}

function CreatureBankDetails({ bank }: { bank: CreatureBankDefinition }) {
  const tr = useTr();
  const locale = useContext(SpritesLocaleContext);
  return (
    <>
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr("Description")}</div>
        <p className="mt-1 text-sm text-stone-200">{localizedBuildingDescription(bank.description, locale)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Rareté" value={bank.rarity} />
        <Stat label="Aquatique" value={bank.aquatic ? "Oui" : "Non"} />
      </div>
      <Section title="Terrains préférés">
        <div className="flex flex-wrap gap-2">
          {bank.preferredTerrain.map((terrain) => (
            <Badge key={terrain}>{tr(TERRAIN_LABELS[terrain] ?? terrain)}</Badge>
          ))}
        </div>
      </Section>
      <Section title="Variantes">
        <div className="space-y-3">
          {bank.variants.map((variant, idx) => (
            <div key={idx} className="rounded border border-stone-800 bg-black/40 p-2">
              <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-stone-400">
                <span>{tr("Variante")} {idx + 1}</span>
                <span className="font-mono">
                  {variant.chance}% · {tr("garde")} {variant.guardPower}
                </span>
              </div>
              <div className="mb-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-300/80">{tr("Gardiens")}</div>
                <ul className="mt-1 space-y-0.5 text-xs text-stone-200">
                  {variant.guards.map((guard, gIdx) => (
                    <li key={gIdx}>
                      {guard.count}× {localizedUnitLabel(guard.unitType, UNIT_RULES[guard.unitType]?.label ?? guard.unitType, locale)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300/80">{tr("Récompense")}</div>
                <ul className="mt-1 space-y-0.5 text-xs text-stone-200">
                  {variant.reward.gold ? <li>{variant.reward.gold} {tr("or")}</li> : null}
                  {variant.reward.experience ? <li>{variant.reward.experience} XP</li> : null}
                  {variant.reward.resources ? (
                    <li>
                      {Object.entries(variant.reward.resources)
                        .filter(([, amount]) => Boolean(amount))
                        .map(([res, amount]) => `${amount} ${tr(RESOURCE_LABELS[res as keyof Resources])}`)
                        .join(", ")}
                    </li>
                  ) : null}
                  {variant.reward.creatures?.map((c, cIdx) => (
                    <li key={cIdx}>
                      {tr("Recrute")} {c.count}× {localizedUnitLabel(c.unitType, UNIT_RULES[c.unitType]?.label ?? c.unitType, locale)}
                    </li>
                  ))}
                  {variant.reward.artifactTokens?.length ? (
                    <li>
                      {variant.reward.artifactTokens.map((token) => `${tr("Artefact")} ${token}`).join(", ")}
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function TownBuildingDetails({ rule, faction }: { rule: TownBuildingRule; faction: Faction }) {
  const tr = useTr();
  const locale = useContext(SpritesLocaleContext);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr("Faction")}</div>
          <div className="text-sm font-black text-amber-100">{FACTION_TOWN_NAMES[faction]}</div>
        </div>
        <div className="rounded border border-amber-700/40 bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-100">
          {rule.category}
        </div>
      </div>
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr("Effet")}</div>
        <p className="mt-1 text-sm text-stone-200">{localizedBuildingDescription(rule.description, locale)}</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Stat label="Coût" value={formatCost(rule.cost, locale)} />
        {rule.requires?.length ? (
          <Stat label="Prérequis" value={rule.requires.join(", ")} />
        ) : null}
        {rule.dailyProduction ? (
          <Stat label="Production / jour" value={formatResourceProduction(rule.dailyProduction)} />
        ) : null}
        {rule.unlocksUnit ? (
          <Stat label="Unité débloquée" value={localizedUnitLabel(rule.unlocksUnit, UNIT_RULES[rule.unlocksUnit]?.label ?? rule.unlocksUnit, locale)} />
        ) : null}
        {rule.replacesUnit ? (
          <Stat label="Remplace" value={localizedUnitLabel(rule.replacesUnit, UNIT_RULES[rule.replacesUnit]?.label ?? rule.replacesUnit, locale)} />
        ) : null}
      </div>
      {rule.growthBonus ? (
        <Section title="Bonus de croissance">
          <ul className="space-y-0.5 text-xs text-stone-200">
            {Object.entries(rule.growthBonus).map(([unitType, bonus]) => (
              <li key={unitType}>
                +{bonus} {localizedUnitLabel(unitType, UNIT_RULES[unitType as UnitType]?.label ?? unitType, locale)}{tr("/semaine")}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function ResourceBuildingDetails({ rule }: { rule: ResourceBuildingRule }) {
  const tr = useTr();
  const locale = useContext(SpritesLocaleContext);
  return (
    <>
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr("Bâtiment de ressource")}</div>
        <div className="text-sm font-black text-amber-100">{localizedLabelFromId(rule.type, rule.label, locale)}</div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Stat label="Production / jour" value={formatResourceProduction(rule.production)} />
        <Stat label="Garde (puissance de base)" value={rule.guardianBasePower} />
      </div>
      <Section title="Fonctionnement">
        <p className="text-xs text-stone-300">
          {tr("Une fois capturé, le bâtiment ajoute sa production aux revenus quotidiens du joueur. Il est défendu par des gardiens dont la force dépend de la valeur de base ci-dessus, ajustée par la difficulté de la carte.")}
        </p>
      </Section>
    </>
  );
}

function ExternalDwellingDetails({ unitType, rule }: { unitType: UnitType; rule: UnitRule }) {
  const econ = UNIT_ECON_RULES[unitType];
  const tr = useTr();
  const locale = useContext(SpritesLocaleContext);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr("Unité produite")}</div>
          <div className="text-sm font-black text-amber-100">{localizedUnitLabel(unitType, rule.label, locale)}</div>
        </div>
        <div className="rounded border border-amber-700/40 bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-100">
          {unitType}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Croissance / semaine" value={econ?.growth ?? "-"} />
        <Stat label="Coût unitaire" value={econ ? formatCost(econ.cost, locale) : "-"} />
        <Stat label="PV" value={rule.health} />
        <Stat label="Att/Déf" value={`${rule.attack}/${rule.defense}`} />
      </div>
      <Section title="Fonctionnement">
        <p className="text-xs text-stone-300">
          {tr("La demeure externe produit chaque semaine son nombre de créatures. Un héros du propriétaire peut venir les recruter sur place avec les ressources nécessaires.")}
        </p>
      </Section>
    </>
  );
}

function PlainDescription({ description }: { description: string }) {
  const tr = useTr();
  if (!description) return null;
  return (
    <Section title="Description">
      <p className="text-xs text-stone-300">{tr(description)}</p>
    </Section>
  );
}

function FactionDetails({ faction, description }: { faction: Faction; description: string }) {
  const baseUnits = FACTION_UPGRADED_UNITS[faction];
  const tr = useTr();
  const locale = useContext(SpritesLocaleContext);
  return (
    <>
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{tr("Faction")}</div>
        <div className="text-sm font-black text-amber-100">{FACTION_TOWN_NAMES[faction]}</div>
      </div>
      {description ? (
        <Section title="Description">
          <p className="text-xs text-stone-300">{tr(description)}</p>
        </Section>
      ) : null}
      {baseUnits ? (
        <Section title="Unités élite (palier 7+)">
          <div className="flex flex-wrap gap-2">
            {baseUnits.slice(-2).map((unitType) => (
              <Badge key={unitType}>{localizedUnitLabel(unitType, UNIT_RULES[unitType]?.label ?? unitType, locale)}</Badge>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function SpriteDetails({ entry }: { entry: SpriteEntry }) {
  const tr = useTr();
  switch (entry.kind) {
    case "unit":
      return entry.unit ? <UnitDetails unit={entry.unit} /> : null;
    case "artifact":
      return entry.artifact ? <ArtifactDetails artifact={entry.artifact} /> : null;
    case "creatureBank":
      return entry.creatureBank ? <CreatureBankDetails bank={entry.creatureBank} /> : null;
    case "townBuilding":
      return entry.townBuilding ? (
        <TownBuildingDetails rule={entry.townBuilding.rule} faction={entry.townBuilding.faction} />
      ) : null;
    case "resourceBuilding":
      return entry.resourceBuilding ? <ResourceBuildingDetails rule={entry.resourceBuilding} /> : null;
    case "externalDwelling":
      return entry.externalDwelling ? (
        <ExternalDwellingDetails unitType={entry.externalDwelling.unitType} rule={entry.externalDwelling.rule} />
      ) : null;
    case "adventureBuilding":
      return entry.adventure ? <PlainDescription description={entry.adventure.description} /> : null;
    case "obstacle":
      return entry.obstacle ? <PlainDescription description={entry.obstacle.description} /> : null;
    case "resource":
      return entry.adventure ? <PlainDescription description={entry.adventure.description} /> : null;
    case "factionTown":
      return entry.factionTown ? (
        <FactionDetails faction={entry.factionTown.faction} description={entry.factionTown.description} />
      ) : null;
    case "heroSheet":
    case "boatSheet":
      return (
        <Section title="Spritesheet">
          <p className="text-xs text-stone-300">
            {tr("Animation directionnelle utilisée par le moteur Phaser pour les héros et bateaux d'aventure (idle + marche par orientation).")}
          </p>
        </Section>
      );
    case "terrainTexture":
      return entry.terrainTexture ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Terrain" value={TERRAIN_LABELS[entry.terrainTexture.terrain] ?? entry.terrainTexture.terrain} />
            <Stat label="Face cube" value={entry.terrainTexture.face === "top" ? "Dessus" : entry.terrainTexture.face} />
          </div>
          <Section title="Tags">
            <div className="flex flex-wrap gap-2">
              {entry.terrainTexture.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </Section>
        </>
      ) : null;
    case "roadTexture":
      return entry.roadTexture ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Type" value={entry.roadTexture.kind} />
          <Stat label="Masque" value={entry.roadTexture.mask} />
        </div>
      ) : null;
    default:
      return null;
  }
}

function SpriteLightbox({
  onClose,
  onNext,
  onPrevious,
  entry,
  position,
  total,
}: {
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  entry: SpriteEntry;
  position?: { index: number; total: number };
  total?: number;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft" && onPrevious) {
        onPrevious();
      } else if (event.key === "ArrowRight" && onNext) {
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrevious]);

  const showNav = Boolean(onPrevious && onNext && (total ?? 0) > 1);
  const showAside = entry.kind !== "generic";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu agrandi de ${entry.label}`}
      onClick={onClose}
    >
      <div
        className="grid max-h-[92vh] w-full max-w-5xl grid-rows-[auto_1fr_auto] gap-4 rounded-md border border-amber-500/40 bg-stone-950 p-4 shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-amber-100">{entry.label}</h2>
            {entry.detail ? <p className="mt-1 text-xs uppercase tracking-wider text-stone-500">{entry.detail}</p> : null}
            {position ? (
              <p className="mt-1 font-mono text-[11px] text-stone-500">
                {position.index + 1} / {position.total}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded border border-stone-700 bg-stone-900 text-xl leading-none text-stone-300 transition hover:border-amber-400/70 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
            aria-label="Fermer l'apercu"
          >
            x
          </button>
        </div>
        <div className={["grid min-h-0 gap-4 overflow-auto", showAside ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""].join(" ")}>
          <div className="relative grid min-h-[280px] place-items-center rounded bg-stone-900/80 p-4">
            {showNav ? (
              <button
                type="button"
                onClick={onPrevious}
                className="absolute left-6 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded border border-stone-700 bg-black/70 text-3xl leading-none text-amber-100 shadow-lg transition hover:border-amber-400/70 hover:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
                aria-label="Sprite precedent"
                title="Sprite precedent"
              >
                &lsaquo;
              </button>
            ) : null}
            <Image
              src={entry.path}
              alt={entry.label}
              width={entry.width}
              height={entry.height}
              className="h-auto max-h-[64vh] w-auto max-w-full object-contain"
              unoptimized
            />
            {showNav ? (
              <button
                type="button"
                onClick={onNext}
                className="absolute right-6 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded border border-stone-700 bg-black/70 text-3xl leading-none text-amber-100 shadow-lg transition hover:border-amber-400/70 hover:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
                aria-label="Sprite suivant"
                title="Sprite suivant"
              >
                &rsaquo;
              </button>
            ) : null}
          </div>
          {showAside ? (
            <aside className="rounded border border-stone-800 bg-stone-950/80 p-3">
              <SpriteDetails entry={entry} />
            </aside>
          ) : null}
        </div>
        <div className="break-all rounded border border-stone-800 bg-black/40 px-3 py-2 font-mono text-xs text-stone-400">{entry.path}</div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  const tr = useTr();
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "h-10 rounded border px-4 text-sm font-black uppercase tracking-wider transition",
        active
          ? "border-amber-400 bg-amber-400/15 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.18)_inset]"
          : "border-stone-700 bg-stone-900/70 text-stone-400 hover:border-amber-700/70 hover:text-amber-200",
      ].join(" ")}
    >
      {tr(label)}
      <span className="ml-2 font-mono text-[11px] text-stone-500">{count}</span>
    </button>
  );
}

function CollapsibleGroup({
  children,
  count,
  defaultOpen = true,
  subtitle,
  title,
}: {
  children: ReactNode;
  count: number;
  defaultOpen?: boolean;
  subtitle?: string;
  title: string;
}) {
  const tr = useTr();
  return (
    <details className="border-t border-stone-800 py-4 last:border-b" open={defaultOpen}>
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-3 rounded px-2 py-2 hover:bg-stone-900/70">
        <span className="grid h-7 w-7 place-items-center rounded border border-stone-700 bg-stone-900 text-sm font-black text-amber-300">
          &rsaquo;
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black uppercase tracking-[0.18em] text-amber-200">{tr(title)}</span>
          {subtitle ? <span className="mt-0.5 block truncate text-xs text-stone-500">{tr(subtitle)}</span> : null}
        </span>
        <span className="rounded border border-stone-700 bg-stone-950 px-2 py-1 font-mono text-xs text-stone-400">
          {count}
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function CombatTab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <section>
      {FACTION_GROUPS.map((group, index) => (
        <CollapsibleGroup
          key={group.label}
          count={group.units.length}
          defaultOpen={index < 2 || FEATURED_UNIT_GROUPS.has(group.key)}
          title={group.label}
          subtitle="Unités de combat"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
            {group.units.map((unitType) => {
              const indexInFlat = UNIT_TYPES.indexOf(unitType);
              return (
                <UnitCard
                  key={unitType}
                  entries={UNIT_ENTRIES}
                  index={indexInFlat}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </CollapsibleGroup>
      ))}
      <GroupedSpritesSections
        groups={COMBAT_GROUPS}
        onSelect={onSelect}
        openLabels={new Set(["Machines de guerre", "Fortifications de siège"])}
      />
    </section>
  );
}

function GroupedSpritesSections({
  groups,
  onSelect,
  openLabels,
}: {
  groups: WebpGroup[];
  onSelect: (selection: Selection) => void;
  openLabels?: Set<string>;
}) {
  const flatEntries = groups.flatMap((group) => group.entries);
  return (
    <>
      {groups.map((group, index) => {
        if (group.entries.length === 0) return null;
        const defaultOpen = openLabels ? openLabels.has(group.label) : index < 2;
        return (
          <CollapsibleGroup key={group.label} count={group.entries.length} defaultOpen={defaultOpen} title={group.label}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {group.entries.map((entry) => {
                const flatIndex = findFlatIndex(flatEntries, entry);
                return (
                  <StaticCard
                    key={`${group.label}-${entry.path}-${entry.label}`}
                    entries={flatEntries}
                    index={flatIndex}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          </CollapsibleGroup>
        );
      })}
    </>
  );
}

function AdventureTab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <section>
      <GroupedSpritesSections
        groups={ADVENTURE_GROUPS}
        onSelect={onSelect}
        openLabels={new Set(["Villes de faction", "Bâtiments de ressources", "Bâtiments d'aventure"])}
      />
    </section>
  );
}

function TownsTab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <section>
      <GroupedSpritesSections
        groups={TOWN_GROUPS}
        onSelect={onSelect}
        openLabels={new Set(["Bâtiments communs", "Demeures améliorées"])}
      />
    </section>
  );
}

function ArtifactsTab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <section>
      <GroupedSpritesSections groups={ARTIFACT_GROUPS} onSelect={onSelect} />
    </section>
  );
}

function SpritesheetsTab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <section>
      <CollapsibleGroup count={HERO_SHEET_ENTRIES.length} title="Héros aventure" subtitle="Spritesheets animés : idle et marche par direction">
        <div className="grid gap-4">
          {HERO_SHEET_ENTRIES.map((sheet, i) => (
            <DirectionalSheetCard
              key={sheet.faction}
              alt={`Spritesheet héros ${sheet.faction}`}
              label={sheet.faction}
              entries={SHEET_ENTRIES}
              index={i}
              onSelect={onSelect}
              sheet={sheet}
            />
          ))}
        </div>
      </CollapsibleGroup>
      <CollapsibleGroup count={BOAT_SHEET_ENTRIES.length} title="Bateaux aventure" subtitle="Galions complets par faction : idle et navigation par direction">
        <div className="grid gap-4">
          {BOAT_SHEET_ENTRIES.map((sheet, i) => (
            <DirectionalSheetCard
              key={sheet.faction}
              alt={`Spritesheet bateau ${sheet.faction}`}
              label={`bateau ${sheet.faction}`}
              entries={SHEET_ENTRIES}
              index={HERO_SHEET_ENTRIES.length + i}
              onSelect={onSelect}
              sheet={sheet}
            />
          ))}
        </div>
      </CollapsibleGroup>
    </section>
  );
}

function TexturesTab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <section>
      <GroupedSpritesSections
        groups={TEXTURE_GROUPS}
        onSelect={onSelect}
        openLabels={new Set(["Terrain - Plaine", "Terrain - Foret", "Routes - dirt"])}
      />
    </section>
  );
}

type SvgItem = { id: string; label: string; description: string; render: ReactNode };

function TownTabMarketSvg() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-4h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M8 13h8" />
    </svg>
  );
}
function TownTabArtifactsSvg() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6 6 .9-4.5 4.4 1 6.2L12 16.8 6.5 19.5l1-6.2L3 8.9 9 8z" />
    </svg>
  );
}
function TownTabMercenarySvg() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h3M18 12h3M12 3v3M12 18v3" />
    </svg>
  );
}
function TownTabGateSvg() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V6l8-3 8 3v16" />
      <path d="M9 22v-9h6v9" />
    </svg>
  );
}
function TownTabUniversitySvg() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10L12 3 2 10l10 7z" />
      <path d="M6 12v5c3 2 9 2 12 0v-5" />
    </svg>
  );
}
function TownTabBallistaSvg() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l18-18" />
      <path d="M14 4h6v6" />
      <path d="M5 15a4 4 0 1 0 4 4" />
    </svg>
  );
}

const SVG_GROUPS: Array<{ label: string; items: SvgItem[] }> = [
  {
    label: "Onglets ville (HUD)",
    items: [
      { id: "town-market", label: "Marché", description: "Échange ressources (taux selon nb marchés)", render: <TownTabMarketSvg /> },
      { id: "town-artifacts", label: "Marchands d'artefacts", description: "Achat artefacts (Cercle d'Azur/Royaume Sous-Roche/Orbe Primordial)", render: <TownTabArtifactsSvg /> },
      { id: "town-mercenary", label: "Francs-tireurs", description: "Vendre créatures de garnison (Marteaux Rouges)", render: <TownTabMercenarySvg /> },
      { id: "town-gate", label: "Porte des Braises", description: "Transfert garnison entre villes des Braises Profanes", render: <TownTabGateSvg /> },
      { id: "town-university", label: "Université de magie", description: "Apprendre écoles élémentaires (Orbe Primordial)", render: <TownTabUniversitySvg /> },
      { id: "town-ballista", label: "Cour des balistes", description: "Achat machines de guerre (Marteaux Rouges)", render: <TownTabBallistaSvg /> },
    ],
  },
];

const SVG_COUNT = SVG_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

function SvgCard({ item }: { item: SvgItem }) {
  const tr = useTr();
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3 text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset]">
      <div className="grid h-[120px] w-[120px] place-items-center rounded bg-[linear-gradient(45deg,#1f1f1f_25%,transparent_25%),linear-gradient(-45deg,#1f1f1f_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1f1f1f_75%),linear-gradient(-45deg,transparent_75%,#1f1f1f_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]">
        <div className="h-20 w-20 text-amber-200">{item.render}</div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-amber-100">{tr(item.label)}</div>
        <div className="text-[10px] text-amber-200/60">{tr(item.description)}</div>
        <code className="mt-1 inline-block text-[10px] text-stone-500">{item.id}</code>
      </div>
    </div>
  );
}

function SvgTab() {
  return (
    <section>
      {SVG_GROUPS.map((group) => (
        <CollapsibleGroup key={group.label} count={group.items.length} defaultOpen title={group.label}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {group.items.map((item) => (
              <SvgCard key={item.id} item={item} />
            ))}
          </div>
        </CollapsibleGroup>
      ))}
    </section>
  );
}

const GALLERY_TABS: GalleryTabDefinition[] = [
  {
    id: "combat",
    label: "Combat",
    count: COMBAT_COUNT,
    render: (onSelect) => <CombatTab onSelect={onSelect} />,
  },
  {
    id: "adventure",
    label: "Aventure",
    count: ADVENTURE_COUNT,
    render: (onSelect) => <AdventureTab onSelect={onSelect} />,
  },
  {
    id: "towns",
    label: "Villes",
    count: TOWN_COUNT,
    render: (onSelect) => <TownsTab onSelect={onSelect} />,
  },
  {
    id: "artifacts",
    label: "Artefacts",
    count: ARTIFACT_COUNT,
    render: (onSelect) => <ArtifactsTab onSelect={onSelect} />,
  },
  {
    id: "spritesheets",
    label: "Spritesheets",
    count: SPRITESHEET_COUNT,
    render: (onSelect) => <SpritesheetsTab onSelect={onSelect} />,
  },
  {
    id: "textures",
    label: "Textures",
    count: TEXTURE_COUNT,
    render: (onSelect) => <TexturesTab onSelect={onSelect} />,
  },
  {
    id: "svg",
    label: "UI / SVG",
    count: SVG_COUNT,
    render: () => <SvgTab />,
  },
];

export default function SpritesGalleryPage() {
  const { locale } = useI18n();
  const [activeTab, setActiveTab] = useState<GalleryTab>("combat");
  const [selection, setSelection] = useState<Selection>(null);
  const activeTabDefinition = GALLERY_TABS.find((tab) => tab.id === activeTab) ?? GALLERY_TABS[0];

  const navigate = (offset: number) => {
    if (!selection) return;
    const total = selection.entries.length;
    if (total <= 1) return;
    const nextIndex = (selection.index + offset + total) % total;
    setSelection({ entries: selection.entries, index: nextIndex });
  };

  const selectedEntry = selection ? selection.entries[selection.index] : null;

  return (
    <SpritesLocaleContext.Provider value={locale}>
      <div className="h-screen overflow-y-auto bg-[#151712] px-4 py-6 text-stone-100 sm:px-8 sm:py-10">
        <header className="sticky top-0 z-10 mx-auto max-w-7xl border-b border-stone-800 bg-[#151712]/95 pb-4 backdrop-blur">
          <div className="grid gap-4">
            <div>
              <h1 className="text-3xl font-black text-amber-200">{localize(locale, "Galerie des sprites")}</h1>
              <p className="mt-1 max-w-3xl text-sm text-stone-400">
                {localize(locale, "Inspection métier des sprites du jeu. Ouvrez une carte pour vérifier le rendu, les détails et la navigation au clavier.")}
              </p>
            </div>
            <nav aria-label="Types de ressources" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {GALLERY_TABS.map((tab) => (
                <TabButton
                  key={tab.id}
                  active={activeTab === tab.id}
                  count={tab.count}
                  label={tab.label}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelection(null);
                  }}
                />
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto mt-6 max-w-7xl">
          {activeTabDefinition.render(setSelection)}
        </main>
        {selection && selectedEntry ? (
          <SpriteLightbox
            entry={selectedEntry}
            position={{ index: selection.index, total: selection.entries.length }}
            total={selection.entries.length}
            onClose={() => setSelection(null)}
            onPrevious={() => navigate(-1)}
            onNext={() => navigate(1)}
          />
        ) : null}
      </div>
    </SpritesLocaleContext.Provider>
  );
}
