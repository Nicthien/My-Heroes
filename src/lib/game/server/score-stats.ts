import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { normalizeScoreStats, type ScoreStats } from "@/lib/game/score";

type DbError = { code?: string; message?: string; details?: string | null };

/** Tolerate databases where the `score_stats` column has not been migrated yet. */
function isMissingScoreColumn(error: DbError) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("score_stats");
}

/**
 * Read, merge and persist cumulative score counters for a single game player.
 * Deltas are added to the current values; missing/zero deltas are ignored.
 */
export async function applyScoreDelta(
  supabase: SupabaseAdmin,
  gamePlayerId: string | null | undefined,
  deltas: Partial<ScoreStats>
) {
  if (!gamePlayerId) return;
  const entries = Object.entries(deltas).filter(([, value]) => Number(value) > 0) as [keyof ScoreStats, number][];
  if (entries.length === 0) return;

  const { data, error } = await supabase
    .from("game_players")
    .select("score_stats")
    .eq("id", gamePlayerId)
    .maybeSingle();

  if (error) {
    if (!isMissingScoreColumn(error)) console.error("score_stats read failed", error);
    return;
  }

  const next = normalizeScoreStats((data as { score_stats?: unknown } | null)?.score_stats);
  for (const [key, value] of entries) {
    next[key] += Math.floor(value);
  }

  const { error: updateError } = await supabase
    .from("game_players")
    .update({ score_stats: next })
    .eq("id", gamePlayerId);

  if (updateError && !isMissingScoreColumn(updateError)) {
    console.error("score_stats update failed", updateError);
  }
}

/** Map an adventure/economy action to its cumulative score contribution (if any). */
export function scoreDeltaForAction(action: Record<string, unknown>): Partial<ScoreStats> {
  switch (String(action.type ?? "")) {
    case "CAPTURE_TOWN":
      return { townsCaptured: 1 };
    case "CAPTURE_BUILDING":
      return { buildingsCaptured: 1 };
    case "CAPTURE_GATE":
      return { gatesCaptured: 1 };
    case "COLLECT_ARTIFACT":
    case "BUY_TOWN_ARTIFACT":
      return { artifactsCollected: 1 };
    case "COLLECT_RESOURCE": {
      const amount = Number(action.amount ?? 0);
      return amount > 0 ? { resourcesCollected: amount } : {};
    }
    default:
      return {};
  }
}

interface CombatScoreContext {
  attacker_player_id: string;
  defender_player_id: string | null;
  defender_hero_id: string | null;
}

/**
 * Increment defeat/victory counters for the winner of a resolved combat.
 * Player-vs-player wins also bump `playersDefeated` when the loser is now eliminated.
 */
export async function applyCombatScoreOutcome(
  supabase: SupabaseAdmin,
  combat: CombatScoreContext,
  winnerSide: "attacker" | "defender" | null
) {
  if (!winnerSide) return;
  const winnerPlayerId = winnerSide === "attacker" ? combat.attacker_player_id : combat.defender_player_id;
  if (!winnerPlayerId) return; // neutral defender victory — nothing to credit

  const deltas: Partial<ScoreStats> = { combatsWon: 1 };
  let loserPlayerId: string | null = null;

  if (winnerSide === "attacker") {
    if (combat.defender_player_id && combat.defender_hero_id) {
      deltas.heroesDefeated = 1;
      loserPlayerId = combat.defender_player_id;
    } else {
      deltas.monstersDefeated = 1;
    }
  } else {
    // Defender won: the attacker hero (always a player hero) is destroyed.
    deltas.heroesDefeated = 1;
    loserPlayerId = combat.attacker_player_id;
  }

  await applyScoreDelta(supabase, winnerPlayerId, deltas);

  if (loserPlayerId && (await isPlayerEliminated(supabase, loserPlayerId))) {
    await applyScoreDelta(supabase, winnerPlayerId, { playersDefeated: 1 });
  }
}

/** A player is eliminated when they hold no active hero and no town. Mirrors lifecycle `hasPlayerSeat`. */
async function isPlayerEliminated(supabase: SupabaseAdmin, gamePlayerId: string) {
  const { count: heroCount } = await supabase
    .from("heroes")
    .select("id", { count: "exact", head: true })
    .eq("game_player_id", gamePlayerId)
    .neq("status", "TAVERN");
  if ((heroCount ?? 0) > 0) return false;

  const { count: townCount } = await supabase
    .from("towns")
    .select("id", { count: "exact", head: true })
    .eq("game_player_id", gamePlayerId);
  return (townCount ?? 0) === 0;
}
