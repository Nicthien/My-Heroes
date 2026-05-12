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
  // Château
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
  // Rempart
  CENTAUR = "centaur",
  DWARF = "dwarf",
  WOOD_ELF = "wood_elf",
  PEGASUS = "pegasus",
  DENDROID = "dendroid",
  UNICORN = "unicorn",
  GREEN_DRAGON = "green_dragon",
  // Tour
  GREMLIN = "gremlin",
  GARGOYLE = "gargoyle",
  GOLEM = "golem",
  MAGE = "mage",
  GENIE = "genie",
  NAGA = "naga",
  GIANT = "giant",
  // Hadès
  IMP = "imp",
  GOG = "gog",
  HELL_HOUND = "hell_hound",
  DEMON = "demon",
  PIT_FIEND = "pit_fiend",
  EFREET = "efreet",
  DEVIL = "devil",
  // Nécropole
  SKELETON = "skeleton",
  ZOMBIE = "zombie",
  WIGHT = "wight",
  VAMPIRE = "vampire",
  LICH = "lich",
  BLACK_KNIGHT = "black_knight",
  BONE_DRAGON = "bone_dragon",
  // Donjon
  TROGLODYTE = "troglodyte",
  HARPY = "harpy",
  BEHOLDER = "beholder",
  MEDUSA = "medusa",
  MINOTAUR = "minotaur",
  MANTICORE = "manticore",
  RED_DRAGON = "red_dragon",
  // Bastion
  GOBLIN = "goblin",
  WOLF_RIDER = "wolf_rider",
  ORC = "orc",
  OGRE = "ogre",
  ROC = "roc",
  CYCLOPS = "cyclops",
  BEHEMOTH = "behemoth",
  // Forteresse
  GNOLL = "gnoll",
  LIZARDMAN = "lizardman",
  SERPENT_FLY = "serpent_fly",
  BASILISK = "basilisk",
  GORGON = "gorgon",
  WYVERN = "wyvern",
  HYDRA = "hydra",
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
  specialty?: string;
  level: number;
  experience: number;
  stats: HeroStats;
  position: Position;
  movement: number;
  maxMovement: number;
  armies: UnitStack[];
}

export interface TavernHeroOffer {
  templateId: string;
  name: string;
  class: HeroClass;
  faction: Faction;
  specialty: string;
}

export interface Town {
  id: string;
  name: string;
  faction: Faction;
  position: Position;
  level: number;
  buildings: BuildingType[];
  garrison: UnitStack[];
  availableRecruits: Partial<Record<UnitType, number>>;
  tavernOffer?: TavernHeroOffer[];
  lastBuiltTurn?: number | null;
}

export interface GameCalendar {
  dayNumber: number;
  dayOfWeek: number;
  weekNumber: number;
  weekOfMonth: number;
  monthNumber: number;
  monthOfYear: number;
  yearNumber: number;
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

export enum ResourceBuildingType {
  GOLD_MINE = "gold_mine",
  SAWMILL = "sawmill",
  ORE_PIT = "ore_pit",
  ALCHEMIST_LAB = "alchemist_lab",
  CRYSTAL_CAVERN = "crystal_cavern",
  SULFUR_DUNE = "sulfur_dune",
}

export interface ResourceBuilding {
  id: string;
  type: ResourceBuildingType;
  position: Position;
  ownerId: string | null;
  guardianPower: number;
}

export interface MapObject {
  type: "town" | "hero" | "resource" | "artifact" | "monster" | "building" | "combat";
  id: string;
  subtype?: string;
  guardianPower?: number;
}

export type CombatMode = "AUTO" | "MANUAL";
export type PersistentCombatStatus = "ACTIVE" | "RESOLVED";
export type CombatSide = "attacker" | "defender";

export interface CombatBoardUnit extends UnitStack {
  side: CombatSide;
  ownerPlayerId: string | null;
  heroId?: string | null;
  participantId?: string | null;
  joinsRound: number;
  q: number;
  r: number;
  speed: number;
  minDamage: number;
  maxDamage: number;
  ranged: boolean;
  shots: number;
  hasRetaliated: boolean;
  defended: boolean;
  waited: boolean;
}

export type CombatTerrainType = "rock" | "water";

export interface CombatTerrainFeature {
  type: CombatTerrainType;
  q: number;
  r: number;
}

export interface CombatParticipant {
  id: string;
  playerId: string;
  heroId: string;
  side: CombatSide;
}

export interface PersistentCombat {
  id: string;
  gameId: string;
  mode: CombatMode;
  status: PersistentCombatStatus;
  attackerPlayerId: string;
  defenderPlayerId?: string | null;
  attackerHeroId: string;
  defenderHeroId?: string | null;
  neutralArmyId?: string | null;
  currentPlayerId?: string | null;
  currentUnitId?: string | null;
  round: number;
  position: Position;
  boardState: { units: CombatBoardUnit[]; terrain?: CombatTerrainFeature[] };
  turnQueue: string[];
  actionLog: string[];
  participants?: CombatParticipant[];
  result?: CombatSummary | null;
}

export interface CombatLoss {
  unitType: UnitType;
  lost: number;
}

export interface CombatSummary {
  winnerId: string;
  winnerPlayerId?: string | null;
  loserId?: string;
  attackerLosses: CombatLoss[];
  defenderLosses: CombatLoss[];
  experienceGained: number;
  log: string[];
  attackerDied?: boolean;
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
  resourceBuildings: ResourceBuilding[];
  isAlive: boolean;
  turnOrder: number;
  exploredTiles: string[];
  hasEndedTurn: boolean;
}

export type GameAction =
  | { type: "MOVE_HERO"; heroId: string; path: Position[] }
  | { type: "ATTACK"; heroId: string; targetId: string }
  | { type: "CAPTURE_TOWN"; heroId: string; townId: string }
  | { type: "CAPTURE_BUILDING"; heroId: string; buildingId: string }
  | { type: "RECRUIT_UNIT"; townId: string; unitType: UnitType; count: number }
  | { type: "RECRUIT_HERO"; townId: string; templateId: string }
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
  maxPlayers: number;
  players: Player[];
  map: GameMap;
  turnNumber: number;
  calendar: GameCalendar;
  currentTurnPlayerId: string;
  winnerId?: string;
  activeCombats?: PersistentCombat[];
}
