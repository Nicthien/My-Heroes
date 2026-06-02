import { getGameWithRelations, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { computePlayerScore, scorableFromDbPlayer, type DbScorablePlayer } from "@/lib/game/score";
import { evaluateVictory, normalizeVictoryCondition, type VictoryContenderSnapshot } from "@/lib/game/victory";
import { recordRoundScoreSnapshots } from "./scoreHistory";

type LifecycleTown = { x?: number; y?: number; mapLevel?: string };

type LifecyclePlayer = {
  id: string;
  isAlive?: boolean;
  turnOrder?: number;
  gold?: number;
  heroes?: unknown[];
  towns?: LifecycleTown[];
};

type ScoreSourcePlayer = DbScorablePlayer & { id: string; userId?: string | null; surrendered?: boolean };

type LifecycleTurn = {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
};

export async function evaluateGameLifecycle(supabase: SupabaseAdmin, gameId: string) {
  const game = await getGameWithRelations(supabase, gameId);
  if (!game || game.status !== "ACTIVE") {
    return { status: game?.status ?? null, winnerId: game?.winnerId ?? null };
  }

  const sourcePlayers = game.players as unknown as ScoreSourcePlayer[];
  const victory = normalizeVictoryCondition((game.gameConfig as Record<string, unknown> | null)?.victory);
  const players = (game.players as unknown as LifecyclePlayer[]).filter((player) => player.isAlive);
  const eliminated = players.filter((player) => !hasPlayerSeat(player));

  for (const player of eliminated) {
    await supabase.from("game_players").update({ is_alive: false }).eq("id", player.id);
    await supabase
      .from("resource_buildings")
      .update({ game_player_id: null })
      .eq("game_id", gameId)
      .eq("game_player_id", player.id);
  }

  const eliminatedIds = new Set(eliminated.map((player) => player.id));
  const contenders = players.filter((player) => !eliminatedIds.has(player.id) && hasPlayerSeat(player));

  const turnNumber = Number(game.turnNumber ?? 1);
  const turns = game.turns as LifecycleTurn[];
  const scoreById = new Map(sourcePlayers.map((player) => [player.id, computePlayerScore(scorableFromDbPlayer(player)).total]));
  const snapshots: VictoryContenderSnapshot[] = contenders.map((player) => ({
    id: player.id,
    gold: Number(player.gold ?? 0),
    towns: (player.towns ?? []).map((town) => ({
      x: Number(town.x ?? NaN),
      y: Number(town.y ?? NaN),
      mapLevel: town.mapLevel ?? "surface",
    })),
    score: scoreById.get(player.id) ?? 0,
  }));

  const outcome = evaluateVictory({
    condition: victory,
    contenders: snapshots,
    turnNumber,
    roundComplete: isRoundComplete(contenders, turnNumber, turns),
  });
  if (outcome.type === "completed") {
    return finalizeGame(supabase, gameId, sourcePlayers, outcome.winnerId, turnNumber);
  }

  if (eliminatedIds.has(String(game.currentTurnPlayerId ?? ""))) {
    const nextPlayer = pickNextTurnPlayer(contenders, game.turnNumber as number, game.turns as LifecycleTurn[]);
    await supabase
      .from("games")
      .update({ current_turn_player_id: nextPlayer?.id ?? null })
      .eq("id", gameId);
  }

  return { status: "ACTIVE", winnerId: null };
}

/** Finalize the game as COMPLETED with the given winner (null = draw) and record stats. */
async function finalizeGame(
  supabase: SupabaseAdmin,
  gameId: string,
  sourcePlayers: ScoreSourcePlayer[],
  winnerId: string | null,
  turnNumber: number,
) {
  await supabase
    .from("games")
    .update({
      status: "COMPLETED",
      winner_id: winnerId,
      current_turn_player_id: null,
      ai_runner_locked_at: null,
    })
    .eq("id", gameId);
  // Capture the final score point so the progression chart includes the last
  // round even when the game ends mid-round (a domination/objective win).
  await recordRoundScoreSnapshots(supabase, gameId, turnNumber, sourcePlayers);
  await recordCompletedGameStats(supabase, sourcePlayers, winnerId);
  return { status: "COMPLETED" as const, winnerId };
}

/** True when every still-alive contender has completed their turn for `turnNumber`. */
function isRoundComplete(contenders: LifecyclePlayer[], turnNumber: number, turns: LifecycleTurn[]) {
  const completed = new Set(
    (turns ?? [])
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );
  return contenders.length > 0 && contenders.every((player) => completed.has(player.id));
}

function hasPlayerSeat(player: LifecyclePlayer) {
  return (player.heroes?.length ?? 0) > 0 || (player.towns?.length ?? 0) > 0;
}

/** Upsert cross-game leaderboard aggregates for every human player when a game completes. */
async function recordCompletedGameStats(supabase: SupabaseAdmin, players: ScoreSourcePlayer[], winnerId: string | null) {
  for (const player of players) {
    const userId = player.userId ?? null;
    if (!userId) continue; // AI players are not ranked
    if (player.surrendered) continue; // forfeited games never count toward leaderboard stats

    const score = computePlayerScore(scorableFromDbPlayer(player)).total;
    const won = player.id === winnerId;

    const { data: existing, error } = await supabase
      .from("player_stats")
      .select("games_played, games_won, best_score, total_score")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && !isMissingPlayerStatsTable(error)) {
      console.error("player_stats read failed", error);
      continue;
    }

    const prev = existing ?? { games_played: 0, games_won: 0, best_score: 0, total_score: 0 };
    const { error: upsertError } = await supabase.from("player_stats").upsert(
      {
        user_id: userId,
        games_played: Number(prev.games_played ?? 0) + 1,
        games_won: Number(prev.games_won ?? 0) + (won ? 1 : 0),
        best_score: Math.max(Number(prev.best_score ?? 0), score),
        total_score: Number(prev.total_score ?? 0) + score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError && !isMissingPlayerStatsTable(upsertError)) {
      console.error("player_stats upsert failed", upsertError);
    }
  }
}

function isMissingPlayerStatsTable(error: { code?: string; message?: string; details?: string | null }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("player_stats");
}

function pickNextTurnPlayer(players: LifecyclePlayer[], turnNumber: number, turns: LifecycleTurn[]) {
  const completedPlayerIds = new Set(
    (turns ?? [])
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );
  const sorted = [...players].sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0));
  return sorted.find((player) => !completedPlayerIds.has(player.id)) ?? sorted[0] ?? null;
}
