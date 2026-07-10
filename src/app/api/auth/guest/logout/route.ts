import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  // Permanent accounts and conversions awaiting email confirmation keep their
  // profile when they sign out.
  if (!user.isGuest || !user.isAnonymous) {
    return NextResponse.json({ released: false });
  }

  const supabase = createAdminClient();
  const { data: membership, error: membershipError } = await supabase
    .from("game_players")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  // A guest involved in a game must keep its identity so the game and its
  // player slot remain recoverable from the current browser session.
  if (membership) {
    return NextResponse.json({ released: false, hasGames: true });
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ released: true });
}
