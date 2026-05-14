import { Faction, TerrainType } from "./types";

const ALL_FACTIONS: Faction[] = [
  Faction.CASTLE,
  Faction.RAMPART,
  Faction.TOWER,
  Faction.INFERNO,
  Faction.NECROPOLIS,
  Faction.DUNGEON,
  Faction.STRONGHOLD,
  Faction.FORTRESS,
  Faction.CONFLUX,
];

const TERRAIN_FACTION_POOLS: Partial<Record<TerrainType, Faction[]>> = {
  [TerrainType.GRASS]: [Faction.CASTLE, Faction.RAMPART, Faction.CONFLUX],
  [TerrainType.FOREST]: [Faction.RAMPART],
  [TerrainType.SNOW]: [Faction.TOWER],
  [TerrainType.LAVA]: [Faction.INFERNO],
  [TerrainType.SWAMP]: [Faction.FORTRESS],
  [TerrainType.SAND]: [Faction.DUNGEON, Faction.STRONGHOLD],
  [TerrainType.DIRT]: [Faction.STRONGHOLD, Faction.CASTLE],
  [TerrainType.MOUNTAIN]: [Faction.DUNGEON, Faction.TOWER, Faction.STRONGHOLD, Faction.CONFLUX],
  [TerrainType.WATER]: [Faction.FORTRESS],
};

const TOWN_NAME_POOLS: Record<Faction, string[]> = {
  [Faction.CASTLE]: [
    "Valclaire",
    "Hautegarde",
    "Pierrelion",
    "Lysandre",
    "Blanchetour",
    "Cornebrume",
  ],
  [Faction.RAMPART]: [
    "Sylveracine",
    "Vertbois",
    "Feuilledor",
    "Lunedor",
    "Brisefutaie",
    "Aubefrene",
  ],
  [Faction.TOWER]: [
    "Cristalys",
    "Nivemage",
    "Glacetour",
    "Astralys",
    "Mirargent",
    "Hautespires",
  ],
  [Faction.INFERNO]: [
    "Rougefaille",
    "Cendregouffre",
    "Brasecorne",
    "Flammepuits",
    "Noirbrasier",
    "Sangdefeu",
  ],
  [Faction.NECROPOLIS]: [
    "Ossuaire",
    "Noctepierre",
    "Deuilfort",
    "Crypteval",
    "Mornelune",
    "Tomberive",
  ],
  [Faction.DUNGEON]: [
    "Sombrecrag",
    "Noirpuits",
    "Vifroc",
    "Ombrefosse",
    "Basaltheim",
    "Profondelame",
  ],
  [Faction.STRONGHOLD]: [
    "Kragmar",
    "Rougecrin",
    "Brisehache",
    "Porteorc",
    "Rochefer",
    "Gorhane",
  ],
  [Faction.FORTRESS]: [
    "Maraisvert",
    "Vasecorne",
    "Moussefort",
    "Fangegarde",
    "Roseauval",
    "Hydrelac",
  ],
  [Faction.CONFLUX]: [
    "Aetheris",
    "Briseplan",
    "Pyrelune",
    "Ondeclaire",
    "Vortexia",
    "Auroracime",
  ],
};

export function isFaction(value: unknown): value is Faction {
  return typeof value === "string" && ALL_FACTIONS.includes(value as Faction);
}

export function pickTownFactionForTerrain(
  terrain: TerrainType | string | undefined,
  seed: string,
): Faction {
  const pool = TERRAIN_FACTION_POOLS[terrain as TerrainType] ?? ALL_FACTIONS;
  return pickFrom(pool, seed);
}

export function pickTownName(faction: Faction, seed: string): string {
  return pickFrom(TOWN_NAME_POOLS[faction] ?? TOWN_NAME_POOLS[Faction.CASTLE], `${faction}:${seed}`);
}

function pickFrom<T>(items: T[], seed: string): T {
  return items[hashString(seed) % items.length];
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
