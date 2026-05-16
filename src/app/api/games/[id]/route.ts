import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const game = await getGameWithRelations(supabase, id);

  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });

  const players = game.players as unknown as Array<{ id: string; userId: string | null; exploredTiles: string[] }>;
  const player = players.find((item) => item.userId === user.id);
  const filteredGame = {
    ...game,
    players: players.map((item) => ({
      ...item,
      exploredTiles: item.id === player?.id ? item.exploredTiles : [],
    })),
  };

  return NextResponse.json(filteredGame);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();
  const gamePlayer = await getGamePlayer(supabase, id, user.id);

  if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });

  const game = await getGameWithRelations(supabase, id);
  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

  const { error: turnError } = await supabase.from("turns").upsert({
    game_id: id,
    game_player_id: gamePlayer.id,
    turn_number: game.turnNumber,
    actions: body.actions || [],
    is_completed: true,
  }, {
    onConflict: "game_id,game_player_id,turn_number",
  });
  if (turnError) return NextResponse.json({ error: turnError.message }, { status: 500 });

  const updatedGame = await getGameWithRelations(supabase, id);
  return NextResponse.json(updatedGame);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const hostPlayer = await getGamePlayer(supabase, id, user.id);

  if (!hostPlayer || hostPlayer.turnOrder !== 0) {
    return NextResponse.json({ error: "Seul le createur peut supprimer cette partie" }, { status: 403 });
  }

  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
