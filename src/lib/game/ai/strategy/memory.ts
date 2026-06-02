import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import type { AiGame, AiPlayer } from "../types";
import { normalizeDifficulty } from "../context";
import { calculateHeroPower, calculateStacksPower } from "../combat";
import { AI_PERSONALITIES, type AiPersonality, rollAiPersonality } from "./personality";

export type AiPosture = "EXPLORE" | "EXPAND" | "CONSOLIDATE" | "DEFEND" | "FINISH";

/** What the AI remembers about a rival across turns. */
export interface OpponentIntel {
  maxPowerSeen: number;
  lastSeenPower: number;
  lastSeenTurn: number;
  /** Turn at which this opponent destroyed one of our heroes (drives caution). */
  lostToAtTurn?: number;
}

export interface AiMultiTurnPlan {
  heroId: string;
  goal: "RAID_TOWN" | "CAPTURE_RESOURCE_NODE" | "RALLY_AT" | "RETREAT_TO" | "SCOUT_FRONTIER" | "RALLY_TO_CHAMPION";
  targetX: number;
  targetY: number;
  etaTurns: number;
  expiresAtTurn: number;
  enemyPlayerId?: string | null;
}

export interface AiPlayerMemory {
  personality: AiPersonality;
  posture: AiPosture;
  primaryEnemyId: string | null;
  championHeroId: string | null;
  multiTurnPlans: AiMultiTurnPlan[];
  primaryEnemyRefreshedAtTurn: number;
  lastTurn: number;
  /** Per-rival intelligence, keyed by player id. */
  opponentIntel: Record<string, OpponentIntel>;
  /** Last objective id pursued per hero (drives commitment / anti-oscillation). */
  heroObjectives: Record<string, string>;
}

const ROOT_KEY = "aiMemory";

export function loadAiMemory(game: AiGame, player: AiPlayer): AiPlayerMemory {
  const mapState = (game.mapState as Record<string, unknown> | undefined) ?? {};
  const root = (mapState[ROOT_KEY] as Record<string, unknown> | undefined) ?? {};
  const existing = root[player.id] as Partial<AiPlayerMemory> | undefined;
  const difficulty = normalizeDifficulty(player.aiDifficulty);
  const fallbackPersonality = rollAiPersonality(`${game.id}:${player.id}`, difficulty);

  const personality = isValidPersonality(existing?.personality) ? existing.personality : fallbackPersonality;
  return {
    personality,
    posture: isValidPosture(existing?.posture) ? existing.posture : "EXPLORE",
    primaryEnemyId: typeof existing?.primaryEnemyId === "string" ? existing.primaryEnemyId : null,
    championHeroId: typeof existing?.championHeroId === "string" ? existing.championHeroId : null,
    multiTurnPlans: Array.isArray(existing?.multiTurnPlans)
      ? (existing.multiTurnPlans as AiMultiTurnPlan[]).filter(isValidPlan)
      : [],
    primaryEnemyRefreshedAtTurn: Number(existing?.primaryEnemyRefreshedAtTurn ?? 0),
    lastTurn: Number(existing?.lastTurn ?? 0),
    opponentIntel: isRecord(existing?.opponentIntel) ? (existing!.opponentIntel as Record<string, OpponentIntel>) : {},
    heroObjectives: isRecord(existing?.heroObjectives) ? (existing!.heroObjectives as Record<string, string>) : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Refreshes per-rival intelligence from the currently visible opponents, keeping
 * the strongest force ever seen and the latest sighting. Dead players are purged
 * to keep map_state bounded.
 */
export function updateOpponentIntel(
  previous: Record<string, OpponentIntel>,
  game: AiGame,
  visibleOpponents: AiPlayer[],
  turn: number,
): Record<string, OpponentIntel> {
  const alive = new Set((game.players ?? []).filter((p) => p.isAlive).map((p) => p.id));
  const next: Record<string, OpponentIntel> = {};
  for (const [id, intel] of Object.entries(previous)) {
    if (alive.has(id)) next[id] = intel;
  }
  for (const opponent of visibleOpponents) {
    const power =
      (opponent.heroes ?? []).reduce((sum, hero) => sum + calculateHeroPower(hero), 0) +
      (opponent.towns ?? []).reduce((sum, town) => sum + calculateStacksPower(town.garrison ?? []), 0);
    const prior = next[opponent.id];
    next[opponent.id] = {
      maxPowerSeen: Math.max(prior?.maxPowerSeen ?? 0, power),
      lastSeenPower: power,
      lastSeenTurn: turn,
      lostToAtTurn: prior?.lostToAtTurn,
    };
  }
  return next;
}

export async function saveAiMemory(
  supabase: SupabaseAdmin,
  gameId: string,
  playerId: string,
  memory: AiPlayerMemory,
  currentMapState: Record<string, unknown>,
) {
  const root = (currentMapState[ROOT_KEY] as Record<string, unknown> | undefined) ?? {};
  const nextRoot = { ...root, [playerId]: memory };
  const nextMapState = { ...currentMapState, [ROOT_KEY]: nextRoot };
  await supabase.from("games").update({ map_state: nextMapState }).eq("id", gameId);
  return nextMapState;
}

function isValidPersonality(value: unknown): value is AiPersonality {
  return typeof value === "string" && (AI_PERSONALITIES as readonly string[]).includes(value);
}

function isValidPosture(value: unknown): value is AiPosture {
  return (
    value === "EXPLORE" ||
    value === "EXPAND" ||
    value === "CONSOLIDATE" ||
    value === "DEFEND" ||
    value === "FINISH"
  );
}

function isValidPlan(value: unknown): value is AiMultiTurnPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<AiMultiTurnPlan>;
  return (
    typeof plan.heroId === "string" &&
    typeof plan.goal === "string" &&
    typeof plan.targetX === "number" &&
    typeof plan.targetY === "number" &&
    typeof plan.etaTurns === "number" &&
    typeof plan.expiresAtTurn === "number"
  );
}
