import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, toCombat } from "@/lib/supabase/game-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;

  const { id, combatId } = await params;
  const body = await request.json();
  const supabase = createAdminClient();
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("status")
    .eq("id", id)
    .single();
  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

  const gamePlayer = await getGamePlayer(supabase, id, user.id) as unknown as { id: string; heroes: Array<{ id: string }> } | null;
  const hero = gamePlayer?.heroes.find((item) => item.id === String(body.heroId));

  if (!gamePlayer || !hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });

  const { error: insertError } = await supabase.from("combat_participants").upsert({
    combat_id: combatId,
    player_id: gamePlayer.id,
    hero_id: hero.id,
    side: body.side ?? "attacker",
  }, { onConflict: "combat_id,hero_id" });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data, error } = await supabase
    .from("combats")
    .select("*, combat_participants(*)")
    .eq("id", combatId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ combat: toCombat(data), result: null });
}
