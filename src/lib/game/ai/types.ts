import type { BuildingType, Faction, GameMap, MapObject, Position, Resources, UnitStack, UnitType } from "@/lib/game/types";
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
  | "plan_waypoint";

export interface AiArmy extends UnitStack {
  unitType: UnitType;
}

export interface AiHero {
  id: string;
  x: number;
  y: number;
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
  status: string;
  stacks: AiArmy[];
}

export interface AiGate {
  id: string;
  gamePlayerId?: string | null;
  x: number;
  y: number;
  guardianPower?: number;
  garrison?: AiArmy[];
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
  map: GameMap;
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
