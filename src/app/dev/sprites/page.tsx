"use client";

import { useEffect, useState } from "react";
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
  type CombatBoardUnit,
  type Resources,
  type UnitType,
} from "@/lib/game/types";
import {
  BOAT_SPRITESHEETS,
  HERO_DIRECTIONS,
  HERO_SPRITESHEETS,
  getUnitSpritePath,
  type BoatSpritesheet,
  type DirectionalSpritesheet,
  type HeroDirection,
  type HeroSpritesheet,
} from "@/lib/rendering/phaser/assets";
import {
  type UnitModelKind,
  getUnitModel,
} from "@/components/game/combat/CombatScreen";

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
  description: "Accorde un bonus hebdomadaire de deplacement au heros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-temple"] = {
  label: "Temple",
  description: "Accorde +1 Moral au heros qui le visite.",
};
ADVENTURE_BUILDING_DETAILS["adventure-fountain-of-fortune"] = {
  label: "Fontaine de fortune",
  description: "Accorde +1 Chance au heros qui la visite.",
};
ADVENTURE_BUILDING_DETAILS["adventure-idol-of-fortune"] = {
  label: "Idole de fortune",
  description: "Accorde +1 Moral et +1 Chance au heros qui la visite.",
};
ADVENTURE_BUILDING_DETAILS["adventure-magic-well"] = {
  label: "Puits magique",
  description: "Restaure la mana du heros une fois par semaine.",
};
ADVENTURE_BUILDING_DETAILS["adventure-magic-shrine"] = {
  label: "Sanctuaire magique",
  description: "Restaure 20 mana au heros qui le visite.",
};
ADVENTURE_BUILDING_DETAILS["adventure-water-mill"] = {
  label: "Moulin a eau",
  description: "Produit 1000 Or une fois par semaine pour le joueur.",
};
ADVENTURE_BUILDING_DETAILS["adventure-water-wheel"] = {
  label: "Roue a eau",
  description: "Produit 500 Or une fois par semaine pour le joueur.",
};
ADVENTURE_BUILDING_DETAILS["adventure-abandoned-wagon"] = {
  label: "Chariot abandonne",
  description: "Contient une petite recompense de carte fouillable une seule fois.",
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
  description: "Revele une grande region autour du batiment.",
};
ADVENTURE_BUILDING_DETAILS["adventure-warrior-tomb"] = {
  label: "Tombe du guerrier",
  description: "Offre Or et XP, mais retire 1 Moral au heros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-cursed-altar"] = {
  label: "Autel maudit",
  description: "Accorde +1 Pouvoir au heros, mais retire 1 Chance.",
};
ADVENTURE_BUILDING_DETAILS["adventure-spell-shrine-1"] = {
  label: "Sanctuaire de sort I",
  description: "Enseigne un sort de niveau 1 au heros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-spell-shrine-2"] = {
  label: "Sanctuaire de sort II",
  description: "Enseigne un sort de niveau 2 au heros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-spell-shrine-3"] = {
  label: "Sanctuaire de sort III",
  description: "Enseigne un sort de niveau 3 au heros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-tree-of-knowledge"] = {
  label: "Arbre de connaissance",
  description: "Accorde 2000 XP contre 2000 Or.",
};
ADVENTURE_BUILDING_DETAILS["adventure-seer-hut"] = {
  label: "Hutte d'erudit",
  description: "Accorde 1000 XP et restaure un peu de mana.",
};
ADVENTURE_BUILDING_DETAILS["adventure-mermaid"] = {
  label: "Sirene",
  description: "Accorde +1 Chance au heros.",
};
ADVENTURE_BUILDING_DETAILS["adventure-buoy"] = {
  label: "Bouee",
  description: "Accorde +1 Moral au heros.",
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
  "wall-brick": { label: "Mur de pierre", description: "Décor minéral impassable. Bloque le mouvement." },
  "wall-vegetal": { label: "Mur végétal", description: "Haie dense impassable. Bloque le mouvement." },
  "grove-pine": { label: "Bosquet de pins", description: "Bosquet dense d'arbres conifères, infranchissable." },
  "grove-oak": { label: "Bosquet de chênes", description: "Bosquet feuillu massif, infranchissable." },
  "grove-dead": { label: "Bosquet mort", description: "Arbres morts compacts, infranchissables." },
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

const WEBP_GROUPS: WebpGroup[] = [
  { label: "Factions", entries: FACTION_TOWNS_GROUP },
  { label: "Bâtiments de ressources", entries: RESOURCE_BUILDING_GROUP },
  { label: "Aventures", entries: ADVENTURE_BUILDING_GROUP },
  { label: "Machines de guerre", entries: WAR_MACHINE_GROUP },
  { label: "Fortifications de siege", entries: SIEGE_FORTIFICATION_GROUP },
  { label: "Demeures externes", entries: EXTERNAL_DWELLING_GROUP },
  { label: "Bâtiments de ville - communs", entries: TOWN_BUILDING_COMMON_GROUP },
  { label: "Bâtiments de ville - demeures améliorées", entries: TOWN_BUILDING_UPGRADED_DWELLING_GROUP },
  { label: "Bâtiments de ville - uniques", entries: TOWN_BUILDING_UNIQUE_GROUP },
  ...ARTIFACT_GROUPS,
  { label: "Banques de creatures", entries: CREATURE_BANK_GROUP },
  { label: "Obstacles", entries: OBSTACLE_GROUP },
  { label: "Ressources", entries: RESOURCE_GROUP },
];

const WEBP_FLAT: SpriteEntry[] = WEBP_GROUPS.flatMap((group) => group.entries);

const UNIT_COUNT = UNIT_ENTRIES.length;
const SPRITESHEET_COUNT = SHEET_ENTRIES.length;
const WEBP_COUNT = WEBP_FLAT.length;

type GalleryTab = "units" | "spritesheets" | "webp" | "svg";

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
          className="h-[124px] w-[124px] object-contain drop-shadow-[0_6px_5px_rgba(0,0,0,0.65)]"
          unoptimized
        />
      </div>
      <div className="text-center">
        <div className="text-sm font-black text-amber-200">{rule.label}</div>
        <div className="text-[10px] uppercase tracking-wider text-stone-400">{entry.unit!.model}</div>
        <div className="mt-1 text-[10px] text-stone-500">
          Att/Déf {rule.attack}/{rule.defense} · Dégâts {rule.minDamage}-{rule.maxDamage}
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
        <div className="text-sm font-bold text-amber-200">{entry.label}</div>
        {entry.detail ? <div className="text-[10px] text-stone-500">{entry.detail}</div> : null}
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
  return (
    <div className="rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-amber-200">{label}</div>
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
  return (
    <div className="rounded border border-stone-800 bg-black/30 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 text-sm font-black text-amber-100">{value}</div>
    </div>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="mt-3 rounded border border-stone-800 bg-black/30 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{title}</div>
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

function formatCost(cost: Partial<Resources>) {
  const entries = Object.entries(cost).filter(([, amount]) => Boolean(amount));
  if (entries.length === 0) return "Gratuit";
  return entries.map(([resource, amount]) => `${amount} ${RESOURCE_LABELS[resource as keyof Resources]}`).join(" · ");
}

function UnitDetails({ unit }: { unit: NonNullable<SpriteEntry["unit"]> }) {
  const { rule } = unit;
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Type</div>
          <div className="text-sm font-black text-amber-100">{unit.model}</div>
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
  const bonuses = (Object.entries(artifact.bonus) as [keyof ArtifactStatsBonus, number][])
    .filter(([, value]) => value);
  const slotLabels = Array.from(new Set(artifact.slots.map((slot) => ARTIFACT_SLOT_LABELS[slot] ?? slot)));
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Classe</div>
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
                <span className="text-xs text-stone-300">{ARTIFACT_BONUS_LABELS[stat]}</span>
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
          <Badge>{ARTIFACT_COMBO_LABELS[artifact.combo] ?? artifact.combo}</Badge>
        </Section>
      ) : null}
    </>
  );
}

function CreatureBankDetails({ bank }: { bank: CreatureBankDefinition }) {
  return (
    <>
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Description</div>
        <p className="mt-1 text-sm text-stone-200">{bank.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Rareté" value={bank.rarity} />
        <Stat label="Aquatique" value={bank.aquatic ? "Oui" : "Non"} />
      </div>
      <Section title="Terrains préférés">
        <div className="flex flex-wrap gap-2">
          {bank.preferredTerrain.map((terrain) => (
            <Badge key={terrain}>{TERRAIN_LABELS[terrain] ?? terrain}</Badge>
          ))}
        </div>
      </Section>
      <Section title="Variantes">
        <div className="space-y-3">
          {bank.variants.map((variant, idx) => (
            <div key={idx} className="rounded border border-stone-800 bg-black/40 p-2">
              <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-stone-400">
                <span>Variante {idx + 1}</span>
                <span className="font-mono">
                  {variant.chance}% · garde {variant.guardPower}
                </span>
              </div>
              <div className="mb-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-300/80">Gardiens</div>
                <ul className="mt-1 space-y-0.5 text-xs text-stone-200">
                  {variant.guards.map((guard, gIdx) => (
                    <li key={gIdx}>
                      {guard.count}× {UNIT_RULES[guard.unitType]?.label ?? guard.unitType}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300/80">Récompense</div>
                <ul className="mt-1 space-y-0.5 text-xs text-stone-200">
                  {variant.reward.gold ? <li>{variant.reward.gold} or</li> : null}
                  {variant.reward.experience ? <li>{variant.reward.experience} XP</li> : null}
                  {variant.reward.resources ? (
                    <li>
                      {Object.entries(variant.reward.resources)
                        .filter(([, amount]) => Boolean(amount))
                        .map(([res, amount]) => `${amount} ${RESOURCE_LABELS[res as keyof Resources]}`)
                        .join(", ")}
                    </li>
                  ) : null}
                  {variant.reward.creatures?.map((c, cIdx) => (
                    <li key={cIdx}>
                      Recrute {c.count}× {UNIT_RULES[c.unitType]?.label ?? c.unitType}
                    </li>
                  ))}
                  {variant.reward.artifactTokens?.length ? (
                    <li>
                      {variant.reward.artifactTokens.map((token) => `Artefact ${token}`).join(", ")}
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
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Faction</div>
          <div className="text-sm font-black text-amber-100">{FACTION_TOWN_NAMES[faction]}</div>
        </div>
        <div className="rounded border border-amber-700/40 bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-100">
          {rule.category}
        </div>
      </div>
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Effet</div>
        <p className="mt-1 text-sm text-stone-200">{rule.description}</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Stat label="Coût" value={formatCost(rule.cost)} />
        {rule.requires?.length ? (
          <Stat label="Prérequis" value={rule.requires.join(", ")} />
        ) : null}
        {rule.dailyProduction ? (
          <Stat label="Production / jour" value={formatResourceProduction(rule.dailyProduction)} />
        ) : null}
        {rule.unlocksUnit ? (
          <Stat label="Unité débloquée" value={UNIT_RULES[rule.unlocksUnit]?.label ?? rule.unlocksUnit} />
        ) : null}
        {rule.replacesUnit ? (
          <Stat label="Remplace" value={UNIT_RULES[rule.replacesUnit]?.label ?? rule.replacesUnit} />
        ) : null}
      </div>
      {rule.growthBonus ? (
        <Section title="Bonus de croissance">
          <ul className="space-y-0.5 text-xs text-stone-200">
            {Object.entries(rule.growthBonus).map(([unitType, bonus]) => (
              <li key={unitType}>
                +{bonus} {UNIT_RULES[unitType as UnitType]?.label ?? unitType}/semaine
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function ResourceBuildingDetails({ rule }: { rule: ResourceBuildingRule }) {
  return (
    <>
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Bâtiment de ressource</div>
        <div className="text-sm font-black text-amber-100">{rule.label}</div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Stat label="Production / jour" value={formatResourceProduction(rule.production)} />
        <Stat label="Garde (puissance de base)" value={rule.guardianBasePower} />
      </div>
      <Section title="Fonctionnement">
        <p className="text-xs text-stone-300">
          Une fois capturé, le bâtiment ajoute sa production aux revenus quotidiens du joueur. Il est défendu par des gardiens
          dont la force dépend de la valeur de base ci-dessus, ajustée par la difficulté de la carte.
        </p>
      </Section>
    </>
  );
}

function ExternalDwellingDetails({ unitType, rule }: { unitType: UnitType; rule: UnitRule }) {
  const econ = UNIT_ECON_RULES[unitType];
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Unité produite</div>
          <div className="text-sm font-black text-amber-100">{rule.label}</div>
        </div>
        <div className="rounded border border-amber-700/40 bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-100">
          {unitType}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Croissance / semaine" value={econ?.growth ?? "-"} />
        <Stat label="Coût unitaire" value={econ ? formatCost(econ.cost) : "-"} />
        <Stat label="PV" value={rule.health} />
        <Stat label="Att/Déf" value={`${rule.attack}/${rule.defense}`} />
      </div>
      <Section title="Fonctionnement">
        <p className="text-xs text-stone-300">
          La demeure externe produit chaque semaine son nombre de créatures. Un héros du propriétaire peut venir les recruter
          sur place avec les ressources nécessaires.
        </p>
      </Section>
    </>
  );
}

function PlainDescription({ description }: { description: string }) {
  if (!description) return null;
  return (
    <Section title="Description">
      <p className="text-xs text-stone-300">{description}</p>
    </Section>
  );
}

function FactionDetails({ faction, description }: { faction: Faction; description: string }) {
  const baseUnits = FACTION_UPGRADED_UNITS[faction];
  return (
    <>
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Faction</div>
        <div className="text-sm font-black text-amber-100">{FACTION_TOWN_NAMES[faction]}</div>
      </div>
      {description ? (
        <Section title="Description">
          <p className="text-xs text-stone-300">{description}</p>
        </Section>
      ) : null}
      {baseUnits ? (
        <Section title="Unités élite (palier 7+)">
          <div className="flex flex-wrap gap-2">
            {baseUnits.slice(-2).map((unitType) => (
              <Badge key={unitType}>{UNIT_RULES[unitType]?.label ?? unitType}</Badge>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function SpriteDetails({ entry }: { entry: SpriteEntry }) {
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
            Animation directionnelle utilisée par le moteur Phaser pour les héros et bateaux d&apos;aventure (idle + marche par
            orientation).
          </p>
        </Section>
      );
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
      aria-label={`Apercu agrandi de ${entry.label}`}
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
      {label}
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
  return (
    <details className="border-t border-stone-800 py-4 last:border-b" open={defaultOpen}>
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-3 rounded px-2 py-2 hover:bg-stone-900/70">
        <span className="grid h-7 w-7 place-items-center rounded border border-stone-700 bg-stone-900 text-sm font-black text-amber-300">
          &rsaquo;
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black uppercase tracking-[0.18em] text-amber-200">{title}</span>
          {subtitle ? <span className="mt-0.5 block truncate text-xs text-stone-500">{subtitle}</span> : null}
        </span>
        <span className="rounded border border-stone-700 bg-stone-950 px-2 py-1 font-mono text-xs text-stone-400">
          {count}
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function UnitsTab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <section>
      {FACTION_GROUPS.map((group, index) => (
        <CollapsibleGroup
          key={group.label}
          count={group.units.length}
          defaultOpen={index < 2 || FEATURED_UNIT_GROUPS.has(group.key)}
          title={group.label}
          subtitle="Unités WebP"
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
              alt={`Spritesheet heros ${sheet.faction}`}
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
      { id: "town-market", label: "Marché", description: "Échange ressources (taux H3 selon nb marchés)", render: <TownTabMarketSvg /> },
      { id: "town-artifacts", label: "Marchands d'artefacts", description: "Achat artefacts (Tour/Donjon/Conflux)", render: <TownTabArtifactsSvg /> },
      { id: "town-mercenary", label: "Francs-tireurs", description: "Vendre créatures de garnison (Bastion)", render: <TownTabMercenarySvg /> },
      { id: "town-gate", label: "Porte du château", description: "Transfert garnison entre villes Hadès", render: <TownTabGateSvg /> },
      { id: "town-university", label: "Université de magie", description: "Apprendre écoles élémentaires (Conflux)", render: <TownTabUniversitySvg /> },
      { id: "town-ballista", label: "Cour des balistes", description: "Achat machines de guerre (Bastion)", render: <TownTabBallistaSvg /> },
    ],
  },
];

const SVG_COUNT = SVG_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

function SvgCard({ item }: { item: SvgItem }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3 text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset]">
      <div className="grid h-[120px] w-[120px] place-items-center rounded bg-[linear-gradient(45deg,#1f1f1f_25%,transparent_25%),linear-gradient(-45deg,#1f1f1f_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1f1f1f_75%),linear-gradient(-45deg,transparent_75%,#1f1f1f_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]">
        <div className="h-20 w-20 text-amber-200">{item.render}</div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-amber-100">{item.label}</div>
        <div className="text-[10px] text-amber-200/60">{item.description}</div>
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

function WebpTab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <section>
      {WEBP_GROUPS.map((group, index) => {
        if (group.entries.length === 0) return null;
        const defaultOpen =
          index < 2 ||
          group.label === "Machines de guerre" ||
          group.label === "Fortifications de siege";
        return (
          <CollapsibleGroup key={group.label} count={group.entries.length} defaultOpen={defaultOpen} title={group.label}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {group.entries.map((entry) => {
                const flatIndex = findFlatIndex(WEBP_FLAT, entry);
                return (
                  <StaticCard key={`${group.label}-${entry.path}-${entry.label}`} entries={WEBP_FLAT} index={flatIndex} onSelect={onSelect} />
                );
              })}
            </div>
          </CollapsibleGroup>
        );
      })}
    </section>
  );
}

export default function SpritesGalleryPage() {
  const [activeTab, setActiveTab] = useState<GalleryTab>("units");
  const [selection, setSelection] = useState<Selection>(null);

  const navigate = (offset: number) => {
    if (!selection) return;
    const total = selection.entries.length;
    if (total <= 1) return;
    const nextIndex = (selection.index + offset + total) % total;
    setSelection({ entries: selection.entries, index: nextIndex });
  };

  const selectedEntry = selection ? selection.entries[selection.index] : null;

  return (
    <div className="h-screen overflow-y-auto bg-[#151712] px-4 py-6 text-stone-100 sm:px-8 sm:py-10">
      <header className="sticky top-0 z-10 mx-auto max-w-7xl border-b border-stone-800 bg-[#151712]/95 pb-4 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-amber-200">Galerie des sprites</h1>
            <p className="mt-1 text-sm text-stone-400">
              Inventaire visuel : unités WebP, spritesheets et fichiers statiques de <code>public/</code>. Navigation au clavier
              (← →) et boutons dans la fenêtre pour parcourir une catégorie.
            </p>
          </div>
          <nav aria-label="Types de ressources" className="flex flex-wrap gap-2">
            <TabButton active={activeTab === "units"} count={UNIT_COUNT} label="Unités" onClick={() => setActiveTab("units")} />
            <TabButton active={activeTab === "spritesheets"} count={SPRITESHEET_COUNT} label="Spritesheets" onClick={() => setActiveTab("spritesheets")} />
            <TabButton active={activeTab === "webp"} count={WEBP_COUNT} label="Images WebP" onClick={() => setActiveTab("webp")} />
            <TabButton active={activeTab === "svg"} count={SVG_COUNT} label="Icônes SVG" onClick={() => setActiveTab("svg")} />
          </nav>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl">
        {activeTab === "units" ? <UnitsTab onSelect={setSelection} /> : null}
        {activeTab === "spritesheets" ? <SpritesheetsTab onSelect={setSelection} /> : null}
        {activeTab === "webp" ? <WebpTab onSelect={setSelection} /> : null}
        {activeTab === "svg" ? <SvgTab /> : null}
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
  );
}
