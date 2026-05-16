import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toGame } from "@/lib/supabase/game-db";

export async function GET(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("games")
    .select("*, game_players!game_players_game_id_fkey(*, profiles(name))")
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const games = (data ?? [])
    .map(toGame)
    .filter((game) => !(game.players as unknown as Array<{ userId: string | null }>).some((player) => player.userId === user.id));

  return NextResponse.json(games);
}
