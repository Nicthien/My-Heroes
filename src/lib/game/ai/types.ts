import type { BuildingType, Faction, GameMap, MapLevelId, MapObject, Position, Resources, UnitStack, UnitType } from "@/lib/game/types";
import type { AiPersonality } from "./strategy/personality";
import type { AiPlayerMemory, AiPosture } from "./strategy/memory";

export type AiDifficulty = "simple" | "normal" | "hard";
export type AiRole = "SCOUT" | "BUILDER" | "CONQUEROR" | "CHAMPION" | "DEFENDER";
export type AiObjectiveType =
  | "resource"
  | "resource_building"
  | "adventure_building"
  | "neutral_army"
  | "gate"
  | "neutral_town"
  | "enemy_hero"
  | "enemy_town"
  | "pickup_garrison"
  | "exploration"
  | "defend_town"
  | "plan_waypoint"
  | "level_transition"
  | "embark_boat"
  | "sail"
  | "disembark_boat";

export interface AiArmy extends UnitStack {
  unitType: UnitType;
}

export interface AiHero {
  id: string;
  x: number;
  y: number;
  mapLevel?: MapLevelId;
  movement: number;
  level?: number;
  attack?: number;
  defense?: number;
  spellPower?: number;
  knowledge?: number;
  morale?: number;
  luck?: number;
  mana?: number | null;
  knownSpellIds?: string[] | null;
  experience?: number;
  armies: AiArmy[];
}

export interface AiTown {
  id: string;
  gamePlayerId?: string | null;
  x: number;
  y: number;
  mapLevel?: MapLevelId;
  townType?: string;
  buildings?: string[];
  garrison?: AiArmy[];
  neutralGarrison?: AiArmy[];
  availableRecruits?: Record<string, number>;
  lastBuiltTurn?: number | null;
  isNeutral?: boolean;
}

export interface AiResourceBuilding {
  id: string;
  gamePlayerId?: string | null;
  x: number;
  y: number;
  mapLevel?: MapLevelId;
  buildingType?: string;
  guardianPower?: number;
}

export interface AiPlayer {
  id: string;
  userId: string | null;
  isAi?: boolean;
  aiName?: string | null;
  aiDifficulty?: string | null;
  isAlive?: boolean;
  turnOrder?: number;
  faction?: string;
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems: number;
  sulfur: number;
  exploredTiles: string[];
  heroes: AiHero[];
  towns: AiTown[];
  resourceBuildings?: AiResourceBuilding[];
}

export interface AiNeutralArmy {
  id: string;
  x: number;
  y: number;
  mapLevel?: MapLevelId;
  status: string;
  stacks: AiArmy[];
}

export interface AiGate {
  id: string;
  gamePlayerId?: string | null;
  x: number;
  y: number;
  mapLevel?: MapLevelId;
  guardianPower?: number;
  garrison?: AiArmy[];
}

export interface AiBoat {
  id: string;
  ownerId?: string | null;
  heroId?: string | null;
  faction?: string | null;
  x: number;
  y: number;
  mapLevel?: MapLevelId;
}

export interface AiCombat {
  id: string;
  status: string;
  attackerHeroId?: string | null;
  defenderHeroId?: string | null;
  participants?: Array<{ heroId?: string | null }>;
}

export interface AiGame {
  id: string;
  status: string;
  maxPlayers: number;
  turnNumber: number;
  currentTurnPlayerId?: string | null;
  mapData: unknown;
  mapState?: unknown;
  players: AiPlayer[];
  neutralArmies?: AiNeutralArmy[];
  gates?: AiGate[];
  boats?: AiBoat[];
  combats?: AiCombat[];
}

export interface AiDifficultyProfile {
  neutralPowerRatio: number;
  humanPowerRatio: number;
  threatWeight: number;
  explorationWeight: number;
  economyWeight: number;
  aggressionWeight: number;
}

export interface AiThreat {
  id: string;
  position: Position;
  power: number;
  ownerPlayerId?: string | null;
  kind: "neutral" | "human" | "building" | "town";
}

export interface AiContext {
  game: AiGame;
  player: AiPlayer;
  /** The map layer the current frame operates on (heroes/objectives/pathing). */
  map: GameMap;
  /** The full multi-level map container (`.levels`) for cross-level logic. */
  fullMap: GameMap;
  /** Which map level `map` represents (surface by default). */
  activeLevel: MapLevelId;
  /** All boats in the game (surface only today). */
  boats: AiBoat[];
  mapState: Record<string, unknown>;
  collected: Set<string>;
  visitedAdventureBuildings: Set<string>;
  playerAdventureVisits: Record<string, string[]>;
  heroAdventureVisits: Record<string, string[]>;
  weeklyAdventureVisits: Record<string, string>;
  mysticalGardenVisits: Record<string, string>;
  killedNeutralArmies: Set<string>;
  explored: Set<string>;
  difficulty: AiDifficulty;
  profile: AiDifficultyProfile;
  visibleOpponents: AiPlayer[];
  threats: AiThreat[];
  resourceNeeds: Partial<Record<keyof Resources, number>>;
  memory: AiPlayerMemory;
  personality: AiPersonality;
  posture: AiPosture;
}

export interface AiObjective {
  type: AiObjectiveType;
  id: string;
  position: Position;
  path: Position[];
  pathCost: number;
  baseValue: number;
  targetPower: number;
  object?: MapObject;
  targetPlayerId?: string | null;
  targetHeroId?: string;
  targetTownId?: string;
  buildingType?: string;
  guardianPower?: number;
  canAutoWin?: boolean;
  /** Destination level for a `level_transition` objective. */
  targetLevel?: MapLevelId;
  /** The gate/stargate object to route to for a `level_transition`. */
  gateObject?: MapObject;
  /** Boat id for `embark_boat` / `sail` / `disembark_boat` objectives. */
  boatId?: string;
  /** Landing tile for a `disembark_boat` objective. */
  disembarkPosition?: Position;
}

export interface AiUtilityScore {
  objective: AiObjective;
  role: AiRole;
  score: number;
  needMultiplier: number;
  roleMultiplier: number;
  threatPenalty: number;
  movementPenalty: number;
  guardianPenalty: number;
}

export interface AiDecision {
  heroId: string;
  role: AiRole;
  score: AiUtilityScore;
}

export type AiBuildChoice = {
  town: AiTown;
  building: BuildingType;
  faction: Faction;
};
