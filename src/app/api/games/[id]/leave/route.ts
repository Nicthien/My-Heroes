import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameRow } from "@/lib/supabase/game-db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const gamePlayer = await getGamePlayer(supabase, id, user.id);

  if (!gamePlayer) {
    return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  }
  if (gamePlayer.turnOrder === 0) {
    return NextResponse.json({ error: "Le createur doit supprimer la partie au lieu de la quitter" }, { status: 400 });
  }

  const game = await getGameRow(supabase, id);
  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  if (game.status !== "PENDING") {
    return NextResponse.json({ error: "Impossible de quitter une partie en cours." }, { status: 400 });
  }

  const { error } = await supabase.from("game_players").delete().eq("id", gamePlayer.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
