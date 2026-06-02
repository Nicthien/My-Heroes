import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer } from "@/lib/supabase/game-db";

/**
 * Per-round score history for the end-of-game progression chart. Membership-gated
 * like every other game route; returns an empty series if the table is missing
 * (not yet migrated) so the end screen still renders the final podium.
 */
export async function GET(
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

  const { data, error } = await supabase
    .from("score_snapshots")
    .select("game_player_id,turn_number,score")
    .eq("game_id", id)
    .order("turn_number", { ascending: true });

  if (error) {
    return NextResponse.json({ snapshots: [] });
  }

  return NextResponse.json({
    snapshots: (data ?? []).map((row) => ({
      gamePlayerId: row.game_player_id as string,
      turnNumber: Number(row.turn_number),
      score: Number(row.score),
    })),
  });
}
