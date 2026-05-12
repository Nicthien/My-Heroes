import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameWithRelations } from "@/lib/supabase/game-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const game = await getGameWithRelations(supabase, id);

  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });

  const players = game.players as unknown as Array<{ id: string; userId: string; turnOrder: number }>;
  const currentUserPlayer = players.find((player) => player.userId === user.id);
  if (!currentUserPlayer) {
    return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  }
  if (game.status !== "PENDING") {
    return NextResponse.json({ error: "La partie est deja demarree" }, { status: 400 });
  }
  if (currentUserPlayer.turnOrder !== 0) {
    return NextResponse.json({ error: "Seul le createur peut demarrer la partie" }, { status: 403 });
  }

  const firstPlayer = [...players].sort((a, b) => a.turnOrder - b.turnOrder)[0];
  if (!firstPlayer) return NextResponse.json({ error: "Aucun joueur dans la partie" }, { status: 400 });

  const { error } = await supabase
    .from("games")
    .update({ status: "ACTIVE", current_turn_player_id: firstPlayer.id })
    .eq("id", id)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const updatedGame = await getGameWithRelations(supabase, id);
  return NextResponse.json(updatedGame);
}
