import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const game = await getGameWithRelations(supabase, id);

  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });

  const players = game.players as unknown as Array<{ id: string; userId: string; exploredTiles: string[] }>;
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
  const { user, response } = await requireCurrentUser();
  if (!user) return response;

  const { id } = await params;
  const body = await request.json();
  const supabase = createAdminClient();
  const gamePlayer = await getGamePlayer(supabase, id, user.id);

  if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });

  const game = await getGameWithRelations(supabase, id);
  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  if (game.currentTurnPlayerId !== gamePlayer.id) {
    return NextResponse.json({ error: "Ce n'est pas votre tour" }, { status: 403 });
  }

  const players = (game.players as unknown as Array<{ id: string; isAlive: boolean; turnOrder: number }>)
    .filter((player: { isAlive: boolean }) => player.isAlive)
    .sort((a: { turnOrder: number }, b: { turnOrder: number }) => a.turnOrder - b.turnOrder);
  const currentIndex = players.findIndex((player: { id: string }) => player.id === game.currentTurnPlayerId);
  const nextPlayerId = players[(currentIndex + 1) % players.length]?.id;

  if (!nextPlayerId || body.nextPlayerId !== nextPlayerId) {
    return NextResponse.json({ error: "Prochain joueur invalide" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("games")
    .update({ current_turn_player_id: nextPlayerId })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("turns").insert({
    game_id: id,
    game_player_id: gamePlayer.id,
    turn_number: game.turnNumber,
    actions: body.actions || [],
    is_completed: true,
  });

  const updatedGame = await getGameWithRelations(supabase, id);
  return NextResponse.json(updatedGame);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser();
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
