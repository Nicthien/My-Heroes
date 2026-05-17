import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, toCombat } from "@/lib/supabase/game-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id, combatId } = await params;
  const supabase = createAdminClient();
  const gamePlayer = await getGamePlayer(supabase, id, user.id);
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });

  const { data, error } = await supabase
    .from("combats")
    .select("*, combat_participants(*)")
    .eq("id", combatId)
    .eq("game_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Combat introuvable" }, { status: 404 });
  if (gamePlayer.isAlive && !combatInvolvesPlayer(data, String(gamePlayer.id))) {
    return NextResponse.json({ error: "Vous ne participez pas a ce combat" }, { status: 403 });
  }
  return NextResponse.json(toCombat(data));
}

function combatInvolvesPlayer(
  combat: { attacker_player_id: string; defender_player_id?: string | null; combat_participants?: Array<{ player_id: string }> },
  playerId: string
) {
  return (
    combat.attacker_player_id === playerId ||
    combat.defender_player_id === playerId ||
    Boolean(combat.combat_participants?.some((participant) => participant.player_id === playerId))
  );
}
