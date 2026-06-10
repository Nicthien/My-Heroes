import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function bucketRowsPerDay(rows: DbRow[], days: number) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.created_at);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const series: { date: string; count: number }[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

function tallyBy<T extends string>(rows: DbRow[], field: string): { key: T; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row[field];
    const key = typeof raw === "string" && raw ? raw : "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key: key as T, count }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const supabase = createAdminClient();

  const [
    profilesResult,
    gamesResult,
    playersResult,
    statsResult,
    combatsCount,
    heroesCount,
  ] = await Promise.all([
    supabase.from("profiles").select("id, role, created_at"),
    supabase.from("games").select("id, status, turn_number, max_players, created_at"),
    supabase.from("game_players").select("faction, is_ai, game_id"),
    supabase
      .from("player_stats")
      .select("user_id, games_played, games_won, best_score, profiles(name)"),
    supabase.from("combats").select("id", { count: "exact", head: true }),
    supabase.from("heroes").select("id", { count: "exact", head: true }),
  ]);

  const firstError =
    profilesResult.error ||
    gamesResult.error ||
    playersResult.error ||
    statsResult.error ||
    combatsCount.error ||
    heroesCount.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const profiles = (profilesResult.data ?? []) as DbRow[];
  const games = (gamesResult.data ?? []) as DbRow[];
  const players = (playersResult.data ?? []) as DbRow[];
  const stats = (statsResult.data ?? []) as DbRow[];

  const gamesByStatus = tallyBy(games, "status");
  const statusTotal = (status: string) =>
    gamesByStatus.find((entry) => entry.key === status)?.count ?? 0;

  const completedGames = games.filter((game) => game.status === "COMPLETED");
  const turnSum = games.reduce((sum, game) => sum + num(game.turn_number), 0);
  const completedTurnSum = completedGames.reduce((sum, game) => sum + num(game.turn_number), 0);

  const aiPlayers = players.filter((player) => Boolean(player.is_ai)).length;
  const humanPlayers = players.length - aiPlayers;

  const adminCount = profiles.filter((profile) => profile.role === "admin").length;

  const topPlayers = stats
    .map((row) => {
      const profile =
        row.profiles && typeof row.profiles === "object" && !Array.isArray(row.profiles)
          ? (row.profiles as DbRow)
          : null;
      return {
        name: (profile?.name as string | null) ?? "—",
        gamesPlayed: num(row.games_played),
        gamesWon: num(row.games_won),
        bestScore: num(row.best_score),
      };
    })
    .sort((a, b) => b.gamesWon - a.gamesWon || b.bestScore - a.bestScore)
    .slice(0, 10);

  return NextResponse.json({
    totals: {
      users: profiles.length,
      admins: adminCount,
      games: games.length,
      pendingGames: statusTotal("PENDING"),
      activeGames: statusTotal("ACTIVE"),
      completedGames: completedGames.length,
      abandonedGames: statusTotal("ABANDONED"),
      players: players.length,
      humanPlayers,
      aiPlayers,
      combats: combatsCount.count ?? 0,
      heroes: heroesCount.count ?? 0,
    },
    averages: {
      turnsPerGame: games.length ? turnSum / games.length : 0,
      turnsPerCompletedGame: completedGames.length ? completedTurnSum / completedGames.length : 0,
      playersPerGame: games.length ? players.length / games.length : 0,
    },
    gamesByStatus,
    factionDistribution: tallyBy(players, "faction"),
    gamesOverTime: bucketRowsPerDay(games, 30),
    usersOverTime: bucketRowsPerDay(profiles, 30),
    topPlayers,
  });
}
