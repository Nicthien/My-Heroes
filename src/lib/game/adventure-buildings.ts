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
    description: "Révèle le terrain autour du héros.",
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
    description: "Signale la côte et prépare un bonus de navigation.",
    visitMode: "once_per_player",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW],
    rarity: 0.6,
  },
  [AdventureBuildingType.STARGATE]: {
    type: AdventureBuildingType.STARGATE,
    label: "Stargate",
    description: "Téléporte le héros vers la Stargate liée.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.35,
  },
  [AdventureBuildingType.SUBTERRANEAN_GATE]: {
    type: AdventureBuildingType.SUBTERRANEAN_GATE,
    label: "Entrée souterraine",
    description: "Relie la surface au souterrain.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.DIRT, TerrainType.MOUNTAIN, TerrainType.SWAMP, TerrainType.GRASS],
    rarity: 0.4,
  },
  [AdventureBuildingType.EXTERNAL_DWELLING]: {
    type: AdventureBuildingType.EXTERNAL_DWELLING,
    label: "Demeure externe",
    description: "Permet de recruter des créatures sur la carte.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.SWAMP, TerrainType.MOUNTAIN],
    rarity: 0.8,
  },
  [AdventureBuildingType.ARENA]: {
    type: AdventureBuildingType.ARENA,
    label: "Arène",
    description: "Permet au héros de choisir +2 Attaque ou +2 Défense.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.MOUNTAIN],
    rarity: 0.55,
  },
  [AdventureBuildingType.MERCENARY_CAMP]: {
    type: AdventureBuildingType.MERCENARY_CAMP,
    label: "Camp de mercenaires",
    description: "Accorde +1 Attaque au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.FOREST],
    rarity: 0.9,
  },
  [AdventureBuildingType.MARLETTO_TOWER]: {
    type: AdventureBuildingType.MARLETTO_TOWER,
    label: "Tour de Marletto",
    description: "Accorde +1 Défense au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.8,
  },
  [AdventureBuildingType.STAR_AXIS]: {
    type: AdventureBuildingType.STAR_AXIS,
    label: "Axe étoilé",
    description: "Accorde +1 Pouvoir au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.MOUNTAIN, TerrainType.SNOW, TerrainType.LAVA],
    rarity: 0.75,
  },
  [AdventureBuildingType.GARDEN_OF_REVELATION]: {
    type: AdventureBuildingType.GARDEN_OF_REVELATION,
    label: "Jardin de révélation",
    description: "Accorde +1 Savoir au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SWAMP],
    rarity: 0.75,
  },
  [AdventureBuildingType.LEARNING_STONE]: {
    type: AdventureBuildingType.LEARNING_STONE,
    label: "Pierre de savoir",
    description: "Accorde 1000 XP au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 1.0,
  },
  [AdventureBuildingType.SCHOOL_OF_WAR]: {
    type: AdventureBuildingType.SCHOOL_OF_WAR,
    label: "École de guerre",
    description: "Permet de payer 1000 Or pour choisir +1 Attaque ou +1 Défense.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND],
    rarity: 0.45,
  },
  [AdventureBuildingType.SCHOOL_OF_MAGIC]: {
    type: AdventureBuildingType.SCHOOL_OF_MAGIC,
    label: "École de magie",
    description: "Permet de payer 1000 Or pour choisir +1 Pouvoir ou +1 Savoir.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.45,
  },
  [AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT]: {
    type: AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT,
    label: "Bibliothèque d'illumination",
    description: "Accorde +2 aux quatre caractéristiques principales aux héros de niveau 10 ou plus.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.25,
  },
  [AdventureBuildingType.CARTOGRAPHER]: {
    type: AdventureBuildingType.CARTOGRAPHER,
    label: "Cartographe",
    description: "Permet de payer 10000 Or pour révéler toute la carte.",
    visitMode: "once_per_player",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW],
    rarity: 0.25,
  },
  [AdventureBuildingType.REDWOOD_OBSERVATORY]: {
    type: AdventureBuildingType.REDWOOD_OBSERVATORY,
    label: "Observatoire sylvestre",
    description: "Révèle une tres grande zone autour du bâtiment.",
    visitMode: "once_per_player",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST],
    rarity: 0.5,
  },
  [AdventureBuildingType.MYSTICAL_GARDEN]: {
    type: AdventureBuildingType.MYSTICAL_GARDEN,
    label: "Jardin mystique",
    description: "Offre une récompense hebdomadaire en Or ou Gemmes.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SWAMP],
    rarity: 0.65,
  },
  [AdventureBuildingType.STABLES]: {
    type: AdventureBuildingType.STABLES,
    label: "Écuries",
    description: "Accorde un bonus de mouvement au héros pour la semaine.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND],
    rarity: 0.8,
  },
  [AdventureBuildingType.TEMPLE]: {
    type: AdventureBuildingType.TEMPLE,
    label: "Temple",
    description: "Accorde +1 Moral au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.7,
  },
  [AdventureBuildingType.FOUNTAIN_OF_FORTUNE]: {
    type: AdventureBuildingType.FOUNTAIN_OF_FORTUNE,
    label: "Fontaine de fortune",
    description: "Accorde +1 Chance au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SNOW],
    rarity: 0.7,
  },
  [AdventureBuildingType.IDOL_OF_FORTUNE]: {
    type: AdventureBuildingType.IDOL_OF_FORTUNE,
    label: "Idole de fortune",
    description: "Accorde +1 Moral et +1 Chance au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SWAMP, TerrainType.MOUNTAIN],
    rarity: 0.45,
  },
  [AdventureBuildingType.MAGIC_WELL]: {
    type: AdventureBuildingType.MAGIC_WELL,
    label: "Puits magique",
    description: "Restaure la mana du héros une fois par semaine.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SNOW, TerrainType.SWAMP],
    rarity: 0.8,
  },
  [AdventureBuildingType.MAGIC_SHRINE]: {
    type: AdventureBuildingType.MAGIC_SHRINE,
    label: "Sanctuaire magique",
    description: "Restaure 20 mana au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.55,
  },
  [AdventureBuildingType.WATER_MILL]: {
    type: AdventureBuildingType.WATER_MILL,
    label: "Moulin à eau",
    description: "Offre une récompense hebdomadaire en Or.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SWAMP],
    rarity: 0.85,
  },
  [AdventureBuildingType.WATER_WHEEL]: {
    type: AdventureBuildingType.WATER_WHEEL,
    label: "Roue hydraulique",
    description: "Offre une petite récompense hebdomadaire en Or.",
    visitMode: "repeatable",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SWAMP],
    rarity: 0.8,
  },
  [AdventureBuildingType.ABANDONED_WAGON]: {
    type: AdventureBuildingType.ABANDONED_WAGON,
    label: "Wagon abandonné",
    description: "Offre une récompense aléatoire, puis se vide.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW],
    rarity: 1.0,
  },
  [AdventureBuildingType.CRATE]: {
    type: AdventureBuildingType.CRATE,
    label: "Caisse abandonnée",
    description: "Offre quelques ressources, puis se vide.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.SWAMP],
    rarity: 1.1,
  },
  [AdventureBuildingType.SKELETON]: {
    type: AdventureBuildingType.SKELETON,
    label: "Squelette",
    description: "Peut cacher de l'Or ou des Gemmes.",
    visitMode: "once",
    preferredTerrain: [TerrainType.DIRT, TerrainType.SAND, TerrainType.SWAMP, TerrainType.LAVA],
    rarity: 0.9,
  },
  [AdventureBuildingType.OBELISK]: {
    type: AdventureBuildingType.OBELISK,
    label: "Obélisque",
    description: "Révèle une grande zone autour du bâtiment.",
    visitMode: "once_per_player",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.MOUNTAIN],
    rarity: 0.4,
  },
  [AdventureBuildingType.WARRIOR_TOMB]: {
    type: AdventureBuildingType.WARRIOR_TOMB,
    label: "Tombe du guerrier",
    description: "Offre un trésor et de l'expérience, mais fait perdre du Moral.",
    visitMode: "once",
    preferredTerrain: [TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.65,
  },
  [AdventureBuildingType.CURSED_ALTAR]: {
    type: AdventureBuildingType.CURSED_ALTAR,
    label: "Autel maudit",
    description: "Accorde +1 Pouvoir au héros, mais lui retire 1 Chance.",
    visitMode: "once",
    preferredTerrain: [TerrainType.DIRT, TerrainType.SWAMP, TerrainType.MOUNTAIN],
    rarity: 0.5,
  },
  [AdventureBuildingType.SPELL_SHRINE_1]: {
    type: AdventureBuildingType.SPELL_SHRINE_1,
    label: "Sanctuaire de sort I",
    description: "Enseigne un sort de niveau 1 au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN],
    rarity: 0.7,
  },
  [AdventureBuildingType.SPELL_SHRINE_2]: {
    type: AdventureBuildingType.SPELL_SHRINE_2,
    label: "Sanctuaire de sort II",
    description: "Enseigne un sort de niveau 2 au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.DIRT, TerrainType.MOUNTAIN],
    rarity: 0.55,
  },
  [AdventureBuildingType.SPELL_SHRINE_3]: {
    type: AdventureBuildingType.SPELL_SHRINE_3,
    label: "Sanctuaire de sort III",
    description: "Enseigne un sort de niveau 3 au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.SNOW, TerrainType.MOUNTAIN, TerrainType.SWAMP],
    rarity: 0.4,
  },
  [AdventureBuildingType.TREE_OF_KNOWLEDGE]: {
    type: AdventureBuildingType.TREE_OF_KNOWLEDGE,
    label: "Arbre de connaissance",
    description: "Accorde 2000 XP contre 2000 Or.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST],
    rarity: 0.45,
  },
  [AdventureBuildingType.SEER_HUT]: {
    type: AdventureBuildingType.SEER_HUT,
    label: "Hutte d'érudit",
    description: "Accorde 1000 XP et restaure un peu de mana.",
    visitMode: "once",
    preferredTerrain: [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SWAMP],
    rarity: 0.55,
  },
  [AdventureBuildingType.MERMAID]: {
    type: AdventureBuildingType.MERMAID,
    label: "Sirene",
    description: "Accorde +1 Chance au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.SAND, TerrainType.SWAMP, TerrainType.GRASS],
    rarity: 0.55,
  },
  [AdventureBuildingType.BUOY]: {
    type: AdventureBuildingType.BUOY,
    label: "Bouée",
    description: "Accorde +1 Moral au héros.",
    visitMode: "once",
    preferredTerrain: [TerrainType.SAND, TerrainType.GRASS, TerrainType.SWAMP],
    rarity: 0.65,
  },
  [AdventureBuildingType.FLOTSAM]: {
    type: AdventureBuildingType.FLOTSAM,
    label: "Debris flottants",
    description: "Contient une petite récompense de ressources.",
    visitMode: "once",
    preferredTerrain: [TerrainType.SAND, TerrainType.SWAMP, TerrainType.GRASS],
    rarity: 0.9,
  },
  [AdventureBuildingType.SEA_CHEST]: {
    type: AdventureBuildingType.SEA_CHEST,
    label: "Coffre marin",
    description: "Contient de l'Or ou des Gemmes.",
    visitMode: "once",
    preferredTerrain: [TerrainType.SAND, TerrainType.SWAMP, TerrainType.GRASS],
    rarity: 0.7,
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
  return getAdventureBuildingRule(type)?.label ?? "Bâtiment d'aventure";
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

export function isSingleMapRewardBuilding(subtype: string | undefined) {
  return subtype === AdventureBuildingType.ABANDONED_WAGON ||
    subtype === AdventureBuildingType.CRATE ||
    subtype === AdventureBuildingType.SKELETON ||
    subtype === AdventureBuildingType.WARRIOR_TOMB ||
    subtype === AdventureBuildingType.FLOTSAM ||
    subtype === AdventureBuildingType.SEA_CHEST;
}

export function getAdventureWeekKey(turnNumber: number) {
  return `week-${Math.max(1, Math.floor((turnNumber - 1) / 7) + 1)}`;
}

export interface AdventureBuildingExhaustionContext {
  buildingId: string;
  subtype: string | undefined;
  playerId: string;
  selectedHeroId?: string | null;
  turnNumber: number;
  visitedAdventureBuildings: Set<string>;
  playerAdventureVisits: Record<string, string[]>;
  heroAdventureVisits: Record<string, string[]>;
  weeklyAdventureVisits: Record<string, string>;
  mysticalGardenVisits: Record<string, string>;
}

const ONCE_PER_PLAYER_SUBTYPES = new Set<string>([
  AdventureBuildingType.OBSERVATORY,
  AdventureBuildingType.LIGHTHOUSE,
  AdventureBuildingType.CARTOGRAPHER,
  AdventureBuildingType.OBELISK,
  AdventureBuildingType.REDWOOD_OBSERVATORY,
]);

export function getAdventureBuildingExhaustion(ctx: AdventureBuildingExhaustionContext): { exhausted: boolean; reason?: string } {
  const { buildingId, subtype, playerId, selectedHeroId, turnNumber } = ctx;
  if (!subtype) return { exhausted: false };

  if (ctx.visitedAdventureBuildings.has(buildingId)) {
    return { exhausted: true, reason: "Déjà fouillé." };
  }

  if (ONCE_PER_PLAYER_SUBTYPES.has(subtype) && (ctx.playerAdventureVisits[playerId] ?? []).includes(buildingId)) {
    return { exhausted: true, reason: "Déjà visité." };
  }

  if (selectedHeroId && (ctx.heroAdventureVisits[selectedHeroId] ?? []).includes(buildingId)) {
    return { exhausted: true, reason: "Déjà visité par ce héros." };
  }

  const currentWeek = getAdventureWeekKey(turnNumber);
  const currentDay = `day-${turnNumber}`;

  if (selectedHeroId && (subtype === AdventureBuildingType.STABLES || subtype === AdventureBuildingType.MAGIC_WELL)) {
    const visitKey = `${buildingId}:${selectedHeroId}`;
    const cooldown = subtype === AdventureBuildingType.MAGIC_WELL ? currentDay : currentWeek;
    if (ctx.weeklyAdventureVisits[visitKey] === cooldown) {
      return {
        exhausted: true,
        reason: subtype === AdventureBuildingType.MAGIC_WELL ? "Disponible demain." : "Disponible la semaine prochaine.",
      };
    }
  }

  if (subtype === AdventureBuildingType.WATER_MILL || subtype === AdventureBuildingType.WATER_WHEEL) {
    const visitKey = `${buildingId}:${playerId}`;
    if (ctx.weeklyAdventureVisits[visitKey] === currentWeek) {
      return { exhausted: true, reason: "Disponible la semaine prochaine." };
    }
  }

  if (subtype === AdventureBuildingType.MYSTICAL_GARDEN) {
    const visitKey = `${buildingId}:${playerId}`;
    if (ctx.mysticalGardenVisits[visitKey] === currentWeek) {
      return { exhausted: true, reason: "Disponible la semaine prochaine." };
    }
  }

  return { exhausted: false };
}
