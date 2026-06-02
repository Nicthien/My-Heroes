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
  // Players read their own game's history; admins may read any game's (observer mode).
  if (user.role !== "admin") {
    const gamePlayer = await getGamePlayer(supabase, id, user.id);
    if (!gamePlayer) {
      return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("score_snapshots")
    .select("game_player_id,turn_number,score")
    .eq("game_id", id)
    .order("turn_number", { ascending: true });

  if (error) {
    return NextResponse.json({ snapshots: [], events: [] });
  }

  return NextResponse.json({
    snapshots: (data ?? []).map((row) => ({
      gamePlayerId: row.game_player_id as string,
      turnNumber: Number(row.turn_number),
      score: Number(row.score),
    })),
    events: await getKeyMoments(supabase, id),
  });
}

const KEY_MOMENT_KIND: Record<string, "town" | "mine" | "combat"> = {
  CAPTURE_TOWN: "town",
  CAPTURE_BUILDING: "mine",
  COMBAT_WON: "combat",
};

const KEY_MOMENT_ACTION_TYPES = Object.keys(KEY_MOMENT_KIND);

/** Key moments overlaid on the progression chart: town / mine captures + combat wins. */
async function getKeyMoments(supabase: ReturnType<typeof createAdminClient>, gameId: string) {
  const { data, error } = await supabase
    .from("game_action_logs")
    .select("game_player_id,turn_number,action_type,summary")
    .eq("game_id", gameId)
    .in("action_type", KEY_MOMENT_ACTION_TYPES)
    .order("turn_number", { ascending: true });

  if (error) return [];

  return (data ?? [])
    .map((row) => {
      const kind = KEY_MOMENT_KIND[String(row.action_type)];
      if (!kind || !row.game_player_id) return null;
      return {
        gamePlayerId: row.game_player_id as string,
        turnNumber: Number(row.turn_number),
        kind,
        summary: String(row.summary ?? ""),
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null);
}
