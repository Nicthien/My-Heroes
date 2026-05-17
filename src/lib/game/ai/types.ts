import type { BuildingType, Faction, GameMap, MapObject, Position, Resources, UnitStack, UnitType } from "@/lib/game/types";

export type AiDifficulty = "simple" | "normal" | "hard";
export type AiRole = "SCOUT" | "BUILDER" | "CONQUEROR";
export type AiObjectiveType =
  | "resource"
  | "resource_building"
  | "adventure_building"
  | "neutral_army"
  | "neutral_town"
  | "enemy_hero"
  | "exploration";

export interface AiArmy extends UnitStack {
  unitType: UnitType;
}

export interface AiHero {
  id: string;
  x: number;
  y: number;
  movement: number;
  attack?: number;
  defense?: number;
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
  killedNeutralArmies: Set<string>;
  explored: Set<string>;
  difficulty: AiDifficulty;
  profile: AiDifficultyProfile;
  visibleOpponents: AiPlayer[];
  threats: AiThreat[];
  resourceNeeds: Partial<Record<keyof Resources, number>>;
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
  buildingType?: string;
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
