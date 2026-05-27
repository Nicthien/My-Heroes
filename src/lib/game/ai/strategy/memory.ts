import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import type { AiGame, AiPlayer } from "../types";
import { normalizeDifficulty } from "../context";
import { AI_PERSONALITIES, type AiPersonality, rollAiPersonality } from "./personality";

export type AiPosture = "EXPLORE" | "EXPAND" | "CONSOLIDATE" | "DEFEND" | "FINISH";

export interface AiMultiTurnPlan {
  heroId: string;
  goal: "RAID_TOWN" | "CAPTURE_RESOURCE_NODE" | "RALLY_AT" | "RETREAT_TO" | "SCOUT_FRONTIER";
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
  };
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
