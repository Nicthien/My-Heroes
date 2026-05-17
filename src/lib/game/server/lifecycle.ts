import { getGameWithRelations, type SupabaseAdmin } from "@/lib/supabase/game-db";

type LifecyclePlayer = {
  id: string;
  isAlive?: boolean;
  turnOrder?: number;
  heroes?: unknown[];
  towns?: unknown[];
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

function pickNextTurnPlayer(players: LifecyclePlayer[], turnNumber: number, turns: LifecycleTurn[]) {
  const completedPlayerIds = new Set(
    (turns ?? [])
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );
  const sorted = [...players].sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0));
  return sorted.find((player) => !completedPlayerIds.has(player.id)) ?? sorted[0] ?? null;
}
