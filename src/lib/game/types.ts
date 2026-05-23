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
  VILLAGE_HALL = "village_hall",
  TOWN_HALL = "town_hall",
  CITY_HALL = "city_hall",
  CAPITOL = "capitol",
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
  UPG_DWELLING_1 = "upg_dwelling_1",
  UPG_DWELLING_2 = "upg_dwelling_2",
  UPG_DWELLING_3 = "upg_dwelling_3",
  UPG_DWELLING_4 = "upg_dwelling_4",
  UPG_DWELLING_5 = "upg_dwelling_5",
  UPG_DWELLING_6 = "upg_dwelling_6",
  UPG_DWELLING_7 = "upg_dwelling_7",
  UNIQUE_1 = "unique_1",
  UNIQUE_2 = "unique_2",
  UNIQUE_3 = "unique_3",
  UNIQUE_4 = "unique_4",
  UNIQUE_5 = "unique_5",
  UNIQUE_6 = "unique_6",
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
  CONFLUX = "conflux",
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
  PLANESWALKER = "planeswalker",
  ELEMENTALIST = "elementalist",
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
  CENTAUR = "centaur",
  CENTAUR_CAPTAIN = "centaur_captain",
  DWARF = "dwarf",
  BATTLE_DWARF = "battle_dwarf",
  WOOD_ELF = "wood_elf",
  GRAND_ELF = "grand_elf",
  PEGASUS = "pegasus",
  SILVER_PEGASUS = "silver_pegasus",
  DENDROID = "dendroid",
  DENDROID_SOLDIER = "dendroid_soldier",
  UNICORN = "unicorn",
  WAR_UNICORN = "war_unicorn",
  GREEN_DRAGON = "green_dragon",
  GOLD_DRAGON = "gold_dragon",
  GREMLIN = "gremlin",
  MASTER_GREMLIN = "master_gremlin",
  GARGOYLE = "gargoyle",
  OBSIDIAN_GARGOYLE = "obsidian_gargoyle",
  GOLEM = "golem",
  IRON_GOLEM = "iron_golem",
  MAGE = "mage",
  ARCH_MAGE = "arch_mage",
  GENIE = "genie",
  MASTER_GENIE = "master_genie",
  NAGA = "naga",
  NAGA_QUEEN = "naga_queen",
  GIANT = "giant",
  TITAN = "titan",
  IMP = "imp",
  FAMILIAR = "familiar",
  GOG = "gog",
  MAGOG = "magog",
  HELL_HOUND = "hell_hound",
  CERBERUS = "cerberus",
  DEMON = "demon",
  HORNED_DEMON = "horned_demon",
  PIT_FIEND = "pit_fiend",
  PIT_LORD = "pit_lord",
  EFREET = "efreet",
  EFREET_SULTAN = "efreet_sultan",
  DEVIL = "devil",
  ARCH_DEVIL = "arch_devil",
  SKELETON = "skeleton",
  SKELETON_WARRIOR = "skeleton_warrior",
  WALKING_DEAD = "walking_dead",
  ZOMBIE = "zombie",
  WIGHT = "wight",
  WRAITH = "wraith",
  VAMPIRE = "vampire",
  VAMPIRE_LORD = "vampire_lord",
  LICH = "lich",
  POWER_LICH = "power_lich",
  BLACK_KNIGHT = "black_knight",
  DREAD_KNIGHT = "dread_knight",
  BONE_DRAGON = "bone_dragon",
  GHOST_DRAGON = "ghost_dragon",
  TROGLODYTE = "troglodyte",
  INFERNAL_TROGLODYTE = "infernal_troglodyte",
  HARPY = "harpy",
  HARPY_HAG = "harpy_hag",
  BEHOLDER = "beholder",
  EVIL_EYE = "evil_eye",
  MEDUSA = "medusa",
  MEDUSA_QUEEN = "medusa_queen",
  MINOTAUR = "minotaur",
  MINOTAUR_KING = "minotaur_king",
  MANTICORE = "manticore",
  SCORPICORE = "scorpicore",
  RED_DRAGON = "red_dragon",
  BLACK_DRAGON = "black_dragon",
  GOBLIN = "goblin",
  HOBGOBLIN = "hobgoblin",
  WOLF_RIDER = "wolf_rider",
  WOLF_RAIDER = "wolf_raider",
  ORC = "orc",
  ORC_CHIEFTAIN = "orc_chieftain",
  OGRE = "ogre",
  OGRE_MAGE = "ogre_mage",
  ROC = "roc",
  THUNDERBIRD = "thunderbird",
  CYCLOPS = "cyclops",
  CYCLOPS_KING = "cyclops_king",
  BEHEMOTH = "behemoth",
  ANCIENT_BEHEMOTH = "ancient_behemoth",
  GNOLL = "gnoll",
  GNOLL_MARAUDER = "gnoll_marauder",
  LIZARDMAN = "lizardman",
  LIZARD_WARRIOR = "lizard_warrior",
  SERPENT_FLY = "serpent_fly",
  DRAGON_FLY = "dragon_fly",
  BASILISK = "basilisk",
  GREATER_BASILISK = "greater_basilisk",
  GORGON = "gorgon",
  MIGHTY_GORGON = "mighty_gorgon",
  WYVERN = "wyvern",
  WYVERN_MONARCH = "wyvern_monarch",
  HYDRA = "hydra",
  CHAOS_HYDRA = "chaos_hydra",
  PIXIE = "pixie",
  SPRITE = "sprite",
  AIR_ELEMENTAL = "air_elemental",
  STORM_ELEMENTAL = "storm_elemental",
  WATER_ELEMENTAL = "water_elemental",
  ICE_ELEMENTAL = "ice_elemental",
  FIRE_ELEMENTAL = "fire_elemental",
  ENERGY_ELEMENTAL = "energy_elemental",
  EARTH_ELEMENTAL = "earth_elemental",
  MAGMA_ELEMENTAL = "magma_elemental",
  PSYCHIC_ELEMENTAL = "psychic_elemental",
  MAGIC_ELEMENTAL = "magic_elemental",
  FIREBIRD = "firebird",
  PHOENIX = "phoenix",
  NYMPH = "nymph",
  OCEANID = "oceanid",
  CREW_MATE = "crew_mate",
  SEAMAN = "seaman",
  PIRATE = "pirate",
  CORSAIR = "corsair",
  SEA_DOG = "sea_dog",
  STORMBIRD = "stormbird",
  AYSSID = "ayssid",
  SEA_WITCH = "sea_witch",
  SORCERESS = "sorceress",
  NIX = "nix",
  NIX_WARRIOR = "nix_warrior",
  SEA_SERPENT = "sea_serpent",
  HASPID = "haspid",
  HALFLING_FACTORY = "halfling_factory",
  HALFLING_GRENADIER = "halfling_grenadier",
  MECHANIC = "mechanic",
  ENGINEER = "engineer",
  ARMADILLO = "armadillo",
  BELLWETHER_ARMADILLO = "bellwether_armadillo",
  AUTOMATON = "automaton",
  SENTINEL_AUTOMATON = "sentinel_automaton",
  SANDWORM = "sandworm",
  OLGOI_KHORKHOI = "olgoi_khorkhoi",
  GUNSLINGER = "gunslinger",
  BOUNTY_HUNTER = "bounty_hunter",
  COUATL = "couatl",
  CRIMSON_COUATL = "crimson_couatl",
  DREADNOUGHT = "dreadnought",
  JUGGERNAUT = "juggernaut",
  KOBOLD = "kobold",
  KOBOLD_FOREMAN = "kobold_foreman",
  MOUNTAIN_RAM = "mountain_ram",
  ARGALI = "argali",
  SNOW_ELF = "snow_elf",
  STEEL_ELF = "steel_elf",
  YETI = "yeti",
  YETI_RUNEMASTER = "yeti_runemaster",
  SHAMAN = "shaman",
  GREAT_SHAMAN = "great_shaman",
  MAMMOTH = "mammoth",
  WAR_MAMMOTH = "war_mammoth",
  JOTUNN = "jotunn",
  JOTUNN_WARLORD = "jotunn_warlord",
  PEASANT = "peasant",
  HALFLING = "halfling",
  BOAR = "boar",
  ROGUE = "rogue",
  LEPRECHAUN = "leprechaun",
  MUMMY = "mummy",
  NOMAD = "nomad",
  SHARPSHOOTER = "sharpshooter",
  SATYR = "satyr",
  STEEL_GOLEM = "steel_golem",
  TROLL = "troll",
  GOLD_GOLEM = "gold_golem",
  FANGARM = "fangarm",
  DIAMOND_GOLEM = "diamond_golem",
  ENCHANTER = "enchanter",
  FAERIE_DRAGON = "faerie_dragon",
  RUST_DRAGON = "rust_dragon",
  CRYSTAL_DRAGON = "crystal_dragon",
  AZURE_DRAGON = "azure_dragon",
}

export interface Resources {
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems: number;
  sulfur: number;
}

export interface HeroStats {
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
  morale: number;
  luck: number;
}

export type HeroArtifactSlot =
  | "weapon"
  | "shield"
  | "torso"
  | "helmet"
  | "necklace"
  | "feet"
  | "ringLeft"
  | "ringRight"
  | "misc1"
  | "misc2"
  | "misc3"
  | "misc4";

export interface HeroArtifactBag {
  inventory: string[];
  equipment: Partial<Record<HeroArtifactSlot, string>>;
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
  mana: number;
  hasSpellBook: boolean;
  knownSpellIds?: string[] | null;
  artifacts: HeroArtifactBag;
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
  townType?: Faction;
  position: Position;
  level: number;
  buildings: BuildingType[];
  garrison: UnitStack[];
  availableRecruits: Partial<Record<UnitType, number>>;
  tavernOffer?: TavernHeroOffer[];
  lastBuiltTurn?: number | null;
  isNeutral?: boolean;
  neutralGarrison?: UnitStack[];
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
  zoneId?: number;
  decor?: DecorItem;
  road?: RoadType;
  worldEdge?: WorldEdgeTile;
}

export type RoadType = "paved" | "gravel" | "dirt";

export interface WorldEdgeTile {
  kind: "rock" | "water";
  rimHeight: number;
  dropDepth: number;
  variant: number;
  retainsWater?: boolean;
}

export interface DecorItem {
  type: DecorKind;
  blocking: boolean;
  variant?: number;
}

export type DecorKind =
  | "tree-pine"
  | "tree-oak"
  | "tree-dead"
  | "grove-pine"
  | "grove-oak"
  | "grove-dead"
  | "rock-large"
  | "rock-small"
  | "boulder-cluster"
  | "bush"
  | "flower"
  | "cactus"
  | "skull"
  | "log"
  | "grass-tuft"
  | "reef"
  | "kelp"
  | "driftwood"
  | "crystal-spire"
  | "obelisk"
  | "ruins"
  | "campfire";

export enum ResourceBuildingType {
  GOLD_MINE = "gold_mine",
  SAWMILL = "sawmill",
  ORE_PIT = "ore_pit",
  ALCHEMIST_LAB = "alchemist_lab",
  CRYSTAL_CAVERN = "crystal_cavern",
  GEM_POND = "gem_pond",
  SULFUR_DUNE = "sulfur_dune",
}

export interface ResourceBuilding {
  id: string;
  type: ResourceBuildingType;
  position: Position;
  ownerId: string | null;
  guardianPower: number;
}

export interface Gate {
  id: string;
  position: Position;
  ownerId: string | null;
  garrison: UnitStack[];
  guardianPower: number;
}

export enum AdventureBuildingType {
  OBSERVATORY = "observatory",
  CAMPFIRE = "campfire",
  LIGHTHOUSE = "lighthouse",
  STARGATE = "stargate",
  EXTERNAL_DWELLING = "external_dwelling",
}

export type AdventureBuildingVisitMode = "once" | "once_per_player" | "repeatable";

export interface AdventureBuildingState {
  visitedAdventureBuildings?: string[];
  playerAdventureVisits?: Record<string, string[]>;
  signaledLighthouses?: Record<string, string[]>;
}

export interface NeutralArmy {
  id: string;
  status: "ACTIVE" | "DEFEATED" | string;
  position: Position;
  stacks: UnitStack[];
}

export interface MapObject {
  type:
    | "town"
    | "hero"
    | "resource"
    | "artifact"
    | "monster"
    | "building"
    | "combat"
    | "wall"
    | "gate"
    | "town_footprint"
    | "adventure_building";
  id: string;
  subtype?: string;
  name?: string;
  guardianPower?: number;
  ownerId?: string | null;
  amount?: number;
  targetId?: string;
  roadAxis?: "x" | "y";
  ownerIndex?: number;
  strategicRole?: "start_wood" | "start_ore" | "start_gold" | "start_rare";
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
  morale?: number;
  moraleApplied?: boolean;
  moraleBonus?: boolean;
}

export type CombatTerrainType = "rock" | "water";

export interface CombatTerrainFeature {
  type: CombatTerrainType;
  q: number;
  r: number;
}

export type CombatEnvironmentTheme =
  | "grass"
  | "forest"
  | "dirt"
  | "sand"
  | "snow"
  | "swamp"
  | "lava"
  | "mountain"
  | "water"
  | "coast"
  | "road"
  | "settlement"
  | "building";

export interface CombatEnvironment {
  terrain: TerrainType;
  elevation: number;
  road?: RoadType;
  objectType?: MapObject["type"];
  objectSubtype?: string;
  nearbyTerrains: Partial<Record<TerrainType, number>>;
  hasNearbyWater: boolean;
  hasNearbyForest: boolean;
  hasNearbyMountain: boolean;
  theme: CombatEnvironmentTheme;
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
  gateId?: string | null;
  currentPlayerId?: string | null;
  currentUnitId?: string | null;
  round: number;
  position: Position;
  boardState: {
    units: CombatBoardUnit[];
    initialUnits?: CombatBoardUnit[];
    terrain?: CombatTerrainFeature[];
    environment?: CombatEnvironment;
    spellCastsByRound?: Record<string, string[]>;
    moraleContext?: { attackerHeroMorale?: number; defenderHeroMorale?: number };
  };
  turnQueue: string[];
  actionLog: string[];
  participants?: CombatParticipant[];
  result?: CombatSummary | null;
  visibility?: "full" | "joinable_summary";
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
  creatureBankReward?: import("./creature-banks").PendingCreatureBankReward;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: MapTile[][];
  seed?: string;
  templateId?: string;
  zones?: ZoneMeta[];
}

export interface ZoneMeta {
  id: number;
  templateZoneId: string;
  type: "player" | "treasure" | "junction";
  ownerIndex?: number;
  centerX: number;
  centerY: number;
  baseTerrain: TerrainType;
  value: number;
  hasTown?: boolean;
  townIsNeutral?: boolean;
}

export interface Player {
  id: string;
  userId: string | null;
  name: string;
  isAi: boolean;
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
  | { type: "CAST_ADVENTURE_SPELL"; heroId: string; spellId: string; target?: Position | { townId?: string } }
  | { type: "ATTACK"; heroId: string; targetId: string }
  | { type: "CAPTURE_TOWN"; heroId: string; townId: string }
  | { type: "CAPTURE_BUILDING"; heroId: string; buildingId: string }
  | { type: "RECRUIT_UNIT"; townId: string; unitType: UnitType; count: number }
  | { type: "TRANSFER_GARRISON_TO_HERO"; townId: string; heroId: string; unitType: UnitType; count: number }
  | { type: "TRANSFER_HERO_TO_GARRISON"; townId: string; heroId: string; unitType: UnitType; count: number }
  | { type: "TRANSFER_GATE_GARRISON_TO_HERO"; gateId: string; heroId: string; unitType: UnitType; count: number }
  | { type: "TRANSFER_HERO_TO_GATE_GARRISON"; gateId: string; heroId: string; unitType: UnitType; count: number }
  | { type: "EQUIP_ARTIFACT"; heroId: string; artifactId: string; slot?: HeroArtifactSlot }
  | { type: "UNEQUIP_ARTIFACT"; heroId: string; slot: HeroArtifactSlot }
  | { type: "TRANSFER_ARTIFACT"; fromHeroId: string; toHeroId: string; artifactId: string }
  | { type: "RECRUIT_HERO"; townId: string; templateId: string }
  | { type: "BUILD"; townId: string; building: BuildingType }
  | { type: "CLAIM_CREATURE_BANK_REWARD"; bankId: string; heroId: string; creatures?: Partial<Record<UnitType, number>> }
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
  neutralArmies?: NeutralArmy[];
  gates?: Gate[];
}
