import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameRow } from "@/lib/supabase/game-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const gamePlayer = await getGamePlayer(supabase, id, user.id);

  if (!gamePlayer) {
    return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  }

  const game = await getGameRow(supabase, id);
  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });

  // Finished games are kept only until every human has dismissed them, then
  // removed. AI players never "leave", so they don't keep the game alive.
  if (game.status === "COMPLETED" || game.status === "ABANDONED") {
    return leaveFinishedGame(supabase, id, game, String(gamePlayer.id));
  }

  if (gamePlayer.turnOrder === 0) {
    return NextResponse.json({ error: "Le createur doit supprimer la partie au lieu de la quitter" }, { status: 400 });
  }
  if (game.status !== "PENDING") {
    return NextResponse.json({ error: "Impossible de quitter une partie en cours." }, { status: 400 });
  }

  const { error } = await supabase.from("game_players").delete().eq("id", gamePlayer.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

async function leaveFinishedGame(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  game: Record<string, unknown>,
  playerId: string,
) {
  const { data: allPlayers, error: playersError } = await supabase
    .from("game_players")
    .select("id,user_id")
    .eq("game_id", gameId);
  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 });

  const humanIds = (allPlayers ?? []).filter((player) => player.user_id).map((player) => String(player.id));
  const config = (game.game_config && typeof game.game_config === "object" ? game.game_config : {}) as Record<string, unknown>;
  const leftIds = new Set<string>(Array.isArray(config.leftPlayerIds) ? (config.leftPlayerIds as string[]) : []);
  leftIds.add(playerId);

  // Once every human player has left, drop the game (cascades to all relations).
  if (humanIds.every((humanId) => leftIds.has(humanId))) {
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deleted: true });
  }

  const { error } = await supabase
    .from("games")
    .update({ game_config: { ...config, leftPlayerIds: Array.from(leftIds) } })
    .eq("id", gameId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: false });
}
