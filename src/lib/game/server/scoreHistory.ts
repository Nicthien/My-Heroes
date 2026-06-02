import { computePlayerScore, scorableFromDbPlayer, type DbScorablePlayer } from "@/lib/game/score";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";

type SnapshotPlayer = DbScorablePlayer & { id: string };

/**
 * Persist one score point per player for a finished round. Idempotent through the
 * (game_id, game_player_id, turn_number) unique constraint, so the same round can
 * be recorded again (e.g. round close then game finalize) without duplicating.
 * Failures (including a not-yet-migrated table) are logged, never thrown — the
 * progression chart is cosmetic and must not break turn processing.
 */
export async function recordRoundScoreSnapshots(
  supabase: SupabaseAdmin,
  gameId: string,
  turnNumber: number,
  players: SnapshotPlayer[],
) {
  const rows = players.map((player) => ({
    game_id: gameId,
    game_player_id: player.id,
    turn_number: turnNumber,
    score: computePlayerScore(scorableFromDbPlayer(player)).total,
  }));
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("score_snapshots")
    .upsert(rows, { onConflict: "game_id,game_player_id,turn_number" });

  if (error && !isMissingScoreSnapshotsTable(error)) {
    console.error("score_snapshots upsert failed", error);
  }
}

function isMissingScoreSnapshotsTable(error: { code?: string; message?: string; details?: string | null }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("score_snapshots");
}
