import type { createAdminClient } from "@/lib/supabase/admin";
import type { GameMap, MapObject, Position, Resources, UnitType } from "@/lib/game/types";
import type { TavernOffer } from "@/lib/game/heroes";
import type { HeroSkills } from "@/lib/game/skills";

export type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export interface MinimalBuilding {
  id: string;
  x: number;
  y: number;
  buildingType?: string;
  guardianPower?: number;
}

export interface MinimalTown {
  id: string;
  gamePlayerId?: string | null;
  x: number;
  y: number;
  mapLevel?: string | null;
  level?: number;
  townType?: string;
  buildings?: string[];
  garrison?: MinimalArmy[];
  availableRecruits?: Record<string, number>;
  tavernOffer?: TavernOffer[];
  isNeutral?: boolean;
  neutralGarrison?: unknown[];
  lastBuiltTurn?: number | null;
}

export interface MinimalResourceBuilding {
  id: string;
  buildingType: string;
}

export interface MinimalGate {
  id: string;
  gamePlayerId?: string | null;
  x: number;
  y: number;
  guardianPower?: number;
  garrison?: MinimalArmy[];
}

export interface MinimalBoat {
  id: string;
  ownerId?: string | null;
  heroId?: string | null;
  faction?: string | null;
  x: number;
  y: number;
  mapLevel?: string | null;
}

export interface MinimalTurn {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
}

export interface MinimalArmy {
  id: string;
  unitType: UnitType;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

export interface MinimalHero {
  id: string;
  name?: string | null;
  class?: string | null;
  specialty?: string | null;
  x: number;
  y: number;
  mapLevel?: string | null;
  level?: number;
  movement: number;
  mana?: number | null;
  hasSpellBook?: boolean;
  knownSpellIds?: string[] | null;
  activeSpellEffects?: Array<{ spellId: string }> | null;
  attack?: number;
  defense?: number;
  morale?: number;
  luck?: number;
  artifacts?: unknown;
  spellPower?: number;
  knowledge?: number;
  skills?: HeroSkills | null;
  experience: number;
  armies: MinimalArmy[];
}

export interface MinimalPlayer {
  id: string;
  isAi?: boolean;
  aiName?: string | null;
  user?: { name?: string | null };
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
  heroes: MinimalHero[];
  towns: MinimalTown[];
  resourceBuildings: MinimalResourceBuilding[];
}

export type MoveInteraction =
  | { type: "COLLECT"; resource: string; amount: number; gold?: number; destination: Position }
  | { type: "ADVENTURE_BUILDING"; buildingType: string; reward?: { gold?: number; resources?: Record<string, number> }; recruited?: { unitType: UnitType; count: number }; message?: string; destination: Position; choices?: AdventureBuildingChoice[]; buildingId?: string; alreadyVisited?: boolean }
  | { type: "TELEPORT"; buildingType: "stargate" | "subterranean_gate"; from: Position; to: Position; message?: string; destination: Position }
  | { type: "COMBAT"; targetId: string; targetType: "hero" | "monster" | "building" | "town" | "gate" | "creature_bank" | "artifact"; destination: Position; targetPosition?: Position }
  | { type: "ARTIFACT"; artifactId: string; label: string; destination: Position }
  | { type: "CAPTURE_BUILDING"; buildingType?: string; destination: Position }
  | { type: "CAPTURE_TOWN"; destination: Position }
  | { type: "CAPTURE_GATE"; gateId: string; destination: Position }
  | { type: "STOP"; message: string; destination: Position };

export type HeroStatKey = "attack" | "defense" | "spellPower" | "knowledge";

export type AdventureBuildingChoice = {
  value: HeroStatKey | "gold" | "experience";
  label: string;
};

export interface CaptureTownRow {
  id: string;
  game_player_id?: string | null;
  x: number;
  y: number;
  level?: number | null;
  map_level?: string | null;
  town_type?: string | null;
  buildings?: string[] | null;
  garrison?: unknown[] | null;
  available_recruits?: Record<string, number> | null;
  is_neutral?: boolean | null;
  neutral_garrison?: unknown[] | null;
}

export type MapBuildingLocation = { object: MapObject; position: Position };
export type MapStateRecord = Record<string, unknown>;
export type ResourcesLike = Pick<Resources, "gold" | "wood" | "ore" | "mercury" | "crystals" | "gems" | "sulfur">;
export type GameMapWithState = GameMap;
