export interface Position {
  x: number;
  y: number;
}

export enum TerrainType {
  GRASS = "grass",
  WATER = "water",
  MOUNTAIN = "mountain",
  FOREST = "forest",
  DIRT = "dirt",
  SAND = "sand",
  SNOW = "snow",
  SWAMP = "swamp",
  LAVA = "lava",
}

export enum BuildingType {
  CASTLE = "castle",
  TAVERN = "tavern",
  MARKET = "market",
  BARRACKS = "barracks",
  MAGE_GUILD = "mage_guild",
  RESOURCE_SILO = "resource_silo",
  DWELLING_1 = "dwelling_1",
  DWELLING_2 = "dwelling_2",
  DWELLING_3 = "dwelling_3",
  DWELLING_4 = "dwelling_4",
  DWELLING_5 = "dwelling_5",
  DWELLING_6 = "dwelling_6",
  DWELLING_7 = "dwelling_7",
}

export enum Faction {
  CASTLE = "castle",
  RAMPART = "rampart",
  TOWER = "tower",
  INFERNO = "inferno",
  NECROPOLIS = "necropolis",
  DUNGEON = "dungeon",
  STRONGHOLD = "stronghold",
  FORTRESS = "fortress",
}

export enum HeroClass {
  KNIGHT = "knight",
  CLERIC = "cleric",
  RANGER = "ranger",
  DRUID = "druid",
  ALCHEMIST = "alchemist",
  WIZARD = "wizard",
  DEMONIAC = "demoniac",
  HERETIC = "heretic",
  DEATH_KNIGHT = "death_knight",
  NECROMANCER = "necromancer",
  OVERLORD = "overlord",
  WARLOCK = "warlock",
  BARBARIAN = "barbarian",
  BATTLE_MAGE = "battle_mage",
  BEASTMASTER = "beastmaster",
  WITCH = "witch",
}

export enum UnitType {
  PIKEMAN = "pikeman",
  HALBERDIER = "halberdier",
  ARCHER = "archer",
  MARKSMAN = "marksman",
  GRIFFIN = "griffin",
  ROYAL_GRIFFIN = "royal_griffin",
  SWORDSMAN = "swordsman",
  CRUSADER = "crusader",
  MONK = "monk",
  ZEALOT = "zealot",
  CAVALIER = "cavalier",
  CHAMPION = "champion",
  ANGEL = "angel",
  ARCHANGEL = "archangel",
}

export interface Resources {
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  sulfur: number;
}

export interface HeroStats {
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
}

export interface UnitStack {
  id: string;
  unitType: UnitType;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

export interface Hero {
  id: string;
  name: string;
  class: HeroClass;
  level: number;
  experience: number;
  stats: HeroStats;
  position: Position;
  movement: number;
  maxMovement: number;
  armies: UnitStack[];
}

export interface Town {
  id: string;
  name: string;
  faction: Faction;
  position: Position;
  level: number;
  buildings: BuildingType[];
  garrison: UnitStack[];
}

export interface MapTile {
  x: number;
  y: number;
  terrain: TerrainType;
  elevation: number;
  isPassable: boolean;
  movementCost: number;
  object?: MapObject;
}

export interface MapObject {
  type: "town" | "hero" | "resource" | "artifact" | "monster" | "building";
  id: string;
  subtype?: string;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: MapTile[][];
}

export interface Player {
  id: string;
  userId: string;
  name: string;
  faction: Faction;
  color: string;
  resources: Resources;
  heroes: Hero[];
  towns: Town[];
  isAlive: boolean;
  turnOrder: number;
  exploredTiles: string[];
}

export type GameAction =
  | { type: "MOVE_HERO"; heroId: string; path: Position[] }
  | { type: "ATTACK"; heroId: string; targetId: string }
  | { type: "CAPTURE_TOWN"; heroId: string; townId: string }
  | { type: "RECRUIT_UNIT"; townId: string; unitType: UnitType; count: number }
  | { type: "BUILD"; townId: string; building: BuildingType }
  | { type: "COLLECT_RESOURCE"; heroId: string; position: Position }
  | { type: "FIGHT_MONSTER"; heroId: string; position: Position }
  | { type: "END_TURN" };

export interface CombatState {
  board: (UnitStack | null)[][];
  currentUnitId: string;
  round: number;
  attackerHeroId: string;
  defenderHeroId: string;
  isFinished: boolean;
  winnerId?: string;
}

export interface GameState {
  id: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "ABANDONED";
  players: Player[];
  map: GameMap;
  turnNumber: number;
  currentTurnPlayerId: string;
  winnerId?: string;
}
