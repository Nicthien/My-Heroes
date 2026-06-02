import { getGameWithRelations, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { computePlayerScore, normalizeScoreStats, type ScorablePlayer } from "@/lib/game/score";
import type { Resources } from "@/lib/game/types";

type LifecyclePlayer = {
  id: string;
  isAlive?: boolean;
  turnOrder?: number;
  heroes?: unknown[];
  towns?: unknown[];
};

type ScoreSourcePlayer = {
  id: string;
  userId?: string | null;
  gold?: number; wood?: number; ore?: number; mercury?: number; crystals?: number; gems?: number; sulfur?: number;
  scoreStats?: unknown;
  heroes?: Array<{
    level?: number; experience?: number;
    attack?: number; defense?: number; spellPower?: number; knowledge?: number;
    artifacts?: { inventory?: string[]; equipment?: Record<string, unknown> };
    armies?: Array<{ unitType: string; count: number }>;
  }>;
  towns?: Array<{ level?: number; buildings?: unknown[]; garrison?: Array<{ unitType: string; count: number }> }>;
  resourceBuildings?: unknown[];
};

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

  if (contenders.length === 1) {
    const winnerId = contenders[0].id;
    await supabase
      .from("games")
      .update({
        status: "COMPLETED",
        winner_id: winnerId,
        current_turn_player_id: null,
        ai_runner_locked_at: null,
      })
      .eq("id", gameId);
    await recordCompletedGameStats(supabase, game.players as unknown as ScoreSourcePlayer[], winnerId);
    return { status: "COMPLETED", winnerId };
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

function hasPlayerSeat(player: LifecyclePlayer) {
  return (player.heroes?.length ?? 0) > 0 || (player.towns?.length ?? 0) > 0;
}

function scorableFromSource(player: ScoreSourcePlayer): ScorablePlayer {
  const resources: Resources = {
    gold: Number(player.gold ?? 0),
    wood: Number(player.wood ?? 0),
    ore: Number(player.ore ?? 0),
    mercury: Number(player.mercury ?? 0),
    crystals: Number(player.crystals ?? 0),
    gems: Number(player.gems ?? 0),
    sulfur: Number(player.sulfur ?? 0),
  };
  return {
    towns: (player.towns ?? []).map((town) => ({ level: town.level, buildings: town.buildings })),
    heroes: (player.heroes ?? []).map((hero) => ({
      level: hero.level,
      experience: hero.experience,
      statTotal:
        Number(hero.attack ?? 0) + Number(hero.defense ?? 0) + Number(hero.spellPower ?? 0) + Number(hero.knowledge ?? 0),
      artifactCount:
        (hero.artifacts?.inventory?.length ?? 0) + Object.keys(hero.artifacts?.equipment ?? {}).length,
      armies: (hero.armies ?? []).map((stack) => ({ unitType: stack.unitType, count: stack.count })),
    })),
    garrisons: (player.towns ?? []).flatMap((town) =>
      (town.garrison ?? []).map((stack) => ({ unitType: stack.unitType, count: stack.count }))
    ),
    mineCount: (player.resourceBuildings ?? []).length,
    resources,
    scoreStats: normalizeScoreStats(player.scoreStats),
  };
}

/** Upsert cross-game leaderboard aggregates for every human player when a game completes. */
async function recordCompletedGameStats(supabase: SupabaseAdmin, players: ScoreSourcePlayer[], winnerId: string) {
  for (const player of players) {
    const userId = player.userId ?? null;
    if (!userId) continue; // AI players are not ranked

    const score = computePlayerScore(scorableFromSource(player)).total;
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
