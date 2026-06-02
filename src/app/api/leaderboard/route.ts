import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const LEADERBOARD_LIMIT = 20;

export interface LeaderboardEntry {
  userId: string;
  name: string | null;
  gamesPlayed: number;
  gamesWon: number;
  bestScore: number;
  totalScore: number;
}

export async function GET(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("player_stats")
    .select("user_id, games_played, games_won, best_score, total_score, profiles(name)")
    .order("best_score", { ascending: false })
    .order("games_won", { ascending: false })
    .limit(LEADERBOARD_LIMIT);

  if (error) {
    // Table not migrated yet → empty leaderboard rather than a hard failure.
    if (error.message?.toLowerCase().includes("player_stats")) {
      return NextResponse.json<LeaderboardEntry[]>([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries: LeaderboardEntry[] = (data ?? []).map((row) => {
    const profile = row.profiles as { name: string | null } | { name: string | null }[] | null;
    const name = Array.isArray(profile) ? profile[0]?.name ?? null : profile?.name ?? null;
    return {
      userId: String(row.user_id),
      name,
      gamesPlayed: Number(row.games_played ?? 0),
      gamesWon: Number(row.games_won ?? 0),
      bestScore: Number(row.best_score ?? 0),
      totalScore: Number(row.total_score ?? 0),
    };
  });

  return NextResponse.json(entries);
}
