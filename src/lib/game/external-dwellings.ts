import { Faction, TerrainType, UnitType, type MapObject, type MapTile } from "./types";
import { FACTION_UNITS, UNIT_RULES } from "./economy";
import { makeRng, randInt } from "./engine/rng";

export const EXTERNAL_DWELLING_TYPE = "external_dwelling";

export const EXTERNAL_DWELLING_UNIT_TYPES = Object.values(FACTION_UNITS).flat();

export const EXTERNAL_DWELLING_NAMES: Partial<Record<UnitType, string>> = {
  [UnitType.PIKEMAN]: "Corps de garde",
  [UnitType.ARCHER]: "Tour des archers",
  [UnitType.GRIFFIN]: "Tour des griffons",
  [UnitType.SWORDSMAN]: "Caserne",
  [UnitType.MONK]: "Monastere",
  [UnitType.CAVALIER]: "Terrain d'entrainement",
  [UnitType.ANGEL]: "Portail de gloire",
  [UnitType.CENTAUR]: "Ecuries de centaures",
  [UnitType.DWARF]: "Chaumiere des nains",
  [UnitType.WOOD_ELF]: "Habitation",
  [UnitType.PEGASUS]: "Source enchantee",
  [UnitType.DENDROID]: "Arches dendroides",
  [UnitType.UNICORN]: "Clairiere des licornes",
  [UnitType.GREEN_DRAGON]: "Falaises des dragons",
  [UnitType.GREMLIN]: "Atelier",
  [UnitType.GARGOYLE]: "Parapet",
  [UnitType.GOLEM]: "Fabrique de golems",
  [UnitType.MAGE]: "Tour des mages",
  [UnitType.GENIE]: "Autel des souhaits",
  [UnitType.NAGA]: "Pavillon dore",
  [UnitType.GIANT]: "Temple des nuages",
  [UnitType.IMP]: "Creuset des diablotins",
  [UnitType.GOG]: "Salle des peches",
  [UnitType.HELL_HOUND]: "Chenils",
  [UnitType.DEMON]: "Porte des demons",
  [UnitType.PIT_FIEND]: "Trou infernal",
  [UnitType.EFREET]: "Lac de feu",
  [UnitType.DEVIL]: "Palais abandonne",
  [UnitType.SKELETON]: "Temple maudit",
  [UnitType.WALKING_DEAD]: "Cimetiere",
  [UnitType.WIGHT]: "Tombeau des ames",
  [UnitType.VAMPIRE]: "Domaine",
  [UnitType.LICH]: "Mausolee",
  [UnitType.BLACK_KNIGHT]: "Salle des tenebres",
  [UnitType.BONE_DRAGON]: "Caveau des dragons",
  [UnitType.TROGLODYTE]: "Terrier",
  [UnitType.HARPY]: "Perchoir des harpies",
  [UnitType.BEHOLDER]: "Pilier des yeux",
  [UnitType.MEDUSA]: "Chapelle des voix eteintes",
  [UnitType.MINOTAUR]: "Labyrinthe",
  [UnitType.MANTICORE]: "Repaire des manticores",
  [UnitType.RED_DRAGON]: "Caverne des dragons",
  [UnitType.GOBLIN]: "Caserne des gobelins",
  [UnitType.WOLF_RIDER]: "Enclos des loups",
  [UnitType.ORC]: "Tour des orcs",
  [UnitType.OGRE]: "Fort des ogres",
  [UnitType.ROC]: "Nid des rocs",
  [UnitType.CYCLOPS]: "Grotte des cyclopes",
  [UnitType.BEHEMOTH]: "Rocher des behemoths",
  [UnitType.GNOLL]: "Hutte des gnolls",
  [UnitType.LIZARDMAN]: "Taniere des lezards",
  [UnitType.SERPENT_FLY]: "Ruche des mouches serpents",
  [UnitType.BASILISK]: "Fosse des basilics",
  [UnitType.GORGON]: "Repaire des gorgones",
  [UnitType.WYVERN]: "Nid des wyvernes",
  [UnitType.HYDRA]: "Etang des hydres",
  [UnitType.PIXIE]: "Lanterne magique",
  [UnitType.AIR_ELEMENTAL]: "Autel de l'air",
  [UnitType.WATER_ELEMENTAL]: "Autel de l'eau",
  [UnitType.FIRE_ELEMENTAL]: "Autel du feu",
  [UnitType.EARTH_ELEMENTAL]: "Autel de la terre",
  [UnitType.PSYCHIC_ELEMENTAL]: "Autel de la pensee",
  [UnitType.FIREBIRD]: "Bucher sacre",
};

export const EXTERNAL_DWELLING_SPRITES: Partial<Record<UnitType, string>> = Object.fromEntries(
  EXTERNAL_DWELLING_UNIT_TYPES.map((unitType) => [
    unitType,
    `/assets/sprites/map/dwellings/external-dwelling-${unitType}.webp`,
  ]),
) as Partial<Record<UnitType, string>>;

export interface ExternalDwellingState {
  ownerId: string | null;
  unitType: UnitType;
  available: number;
}

export type ExternalDwellingStateMap = Record<string, ExternalDwellingState>;

const TERRAIN_FACTIONS: Partial<Record<TerrainType, Faction[]>> = {
  [TerrainType.GRASS]: [Faction.CASTLE, Faction.RAMPART],
  [TerrainType.FOREST]: [Faction.RAMPART, Faction.FORTRESS],
  [TerrainType.DIRT]: [Faction.STRONGHOLD, Faction.CASTLE],
  [TerrainType.SAND]: [Faction.TOWER, Faction.STRONGHOLD],
  [TerrainType.SNOW]: [Faction.TOWER, Faction.NECROPOLIS],
  [TerrainType.SWAMP]: [Faction.FORTRESS, Faction.DUNGEON],
  [TerrainType.LAVA]: [Faction.INFERNO, Faction.DUNGEON],
  [TerrainType.MOUNTAIN]: [Faction.DUNGEON, Faction.STRONGHOLD],
};

export function isExternalDwellingType(type: string | undefined): type is typeof EXTERNAL_DWELLING_TYPE {
  return type === EXTERNAL_DWELLING_TYPE;
}

export function getExternalDwellingLabel(unitType: string | undefined): string {
  const dwellingName = unitType ? EXTERNAL_DWELLING_NAMES[unitType as UnitType] : undefined;
  const rule = unitType ? UNIT_RULES[unitType as UnitType] : undefined;
  if (dwellingName) return dwellingName;
  return rule ? `Demeure externe : ${rule.label}` : "Demeure externe";
}

export function getExternalDwellingSprite(unitType: string | undefined): string | undefined {
  return unitType ? EXTERNAL_DWELLING_SPRITES[unitType as UnitType] : undefined;
}

export function getExternalDwellingUnit(object: MapObject): UnitType | null {
  const unitType = object.targetId as UnitType | undefined;
  return unitType && UNIT_RULES[unitType] ? unitType : null;
}

export function createExternalDwellingState(object: MapObject): ExternalDwellingState | null {
  const unitType = getExternalDwellingUnit(object);
  if (!unitType) return null;
  return {
    ownerId: object.ownerId ?? null,
    unitType,
    available: UNIT_RULES[unitType].growth,
  };
}

export function normalizeExternalDwellingState(
  object: MapObject,
  state: Partial<ExternalDwellingState> | undefined,
): ExternalDwellingState | null {
  const fallback = createExternalDwellingState(object);
  if (!fallback) return null;
  const unitType = state?.unitType && UNIT_RULES[state.unitType] ? state.unitType : fallback.unitType;
  return {
    ownerId: state?.ownerId ?? fallback.ownerId,
    unitType,
    available: Math.max(0, Math.floor(Number(state?.available ?? fallback.available))),
  };
}

export function pickExternalDwellingUnit(
  tile: Pick<MapTile, "terrain" | "x" | "y">,
  seed: string,
  maxTier = 6,
): UnitType {
  const rng = makeRng(`${seed}:external-dwelling:${tile.x}:${tile.y}`);
  const factions = TERRAIN_FACTIONS[tile.terrain] ?? [Faction.CASTLE, Faction.RAMPART, Faction.STRONGHOLD];
  const faction = factions[randInt(rng, 0, factions.length - 1)] ?? Faction.CASTLE;
  const tier = randInt(rng, 0, Math.max(0, Math.min(6, maxTier)));
  return FACTION_UNITS[faction][tier];
}
