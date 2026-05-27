import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

function rows(value: unknown): DbRow[] {
  return Array.isArray(value) ? (value as DbRow[]) : [];
}

function object(value: unknown): DbRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : null;
}

function getPlayerStatus(row: DbRow, game: DbRow) {
  const gameStatus = String(game.status ?? "");
  if (gameStatus === "PENDING") return Boolean(row.is_ready) ? "Pret au lancement" : "Pas pret";
  if (gameStatus === "COMPLETED") return "Partie terminee";
  if (gameStatus !== "ACTIVE") return gameStatus || "-";

  const playerId = String(row.id ?? "");
  const turnNumber = Number(game.turn_number ?? 1);
  const completed = rows(game.turns).some((turn) =>
    turn.game_player_id === playerId &&
    Number(turn.turn_number) === turnNumber &&
    Boolean(turn.is_completed)
  );
  if (completed) return "A fini son tour";
  if (game.current_turn_player_id === playerId) return "Doit jouer maintenant";
  return "Attend son tour";
}

function toAdminPlayer(row: DbRow, game: DbRow, authUsersById: Map<string, { email: string | null; lastSignInAt: string | null }>) {
  const profile = object(row.profiles);
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  const authUser = userId ? authUsersById.get(userId) : undefined;
  const isAi = Boolean(row.is_ai);
  return {
    id: row.id,
    gameId: row.game_id,
    userId,
    user: profile
      ? {
          name: profile.name ?? null,
          email: profile.email ?? authUser?.email ?? null,
        }
      : undefined,
    email: profile?.email ?? authUser?.email ?? null,
    isAi,
    aiName: row.ai_name ?? null,
    faction: row.faction,
    color: row.color,
    isReady: row.is_ready,
    isAlive: row.is_alive,
    turnOrder: row.turn_order,
    turnStatus: getPlayerStatus(row, game),
    joinedAt: row.created_at ?? null,
    lastSignInAt: isAi ? null : authUser?.lastSignInAt ?? null,
  };
}

function toAdminGame(row: DbRow, authUsersById: Map<string, { email: string | null; lastSignInAt: string | null }>) {
  const players = rows(row.game_players ?? row.players)
    .map((player) => toAdminPlayer(player, row, authUsersById))
    .sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0));
  const creatorProfile = object(row.created_by);
  const createdByUserId = typeof row.created_by_user_id === "string" ? row.created_by_user_id : null;
  const createdByAuth = createdByUserId ? authUsersById.get(createdByUserId) : undefined;

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    maxPlayers: row.max_players,
    mapWidth: row.map_width,
    mapHeight: row.map_height,
    turnNumber: row.turn_number,
    currentTurnPlayerId: row.current_turn_player_id,
    winnerId: row.winner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: createdByUserId
      ? {
          id: createdByUserId,
          userId: createdByUserId,
          user: {
            name: creatorProfile?.name ?? null,
            email: creatorProfile?.email ?? createdByAuth?.email ?? null,
          },
          email: creatorProfile?.email ?? createdByAuth?.email ?? null,
          isAi: false,
          aiName: null,
        }
      : players.find((player) => Number(player.turnOrder ?? 0) === 0) ?? players[0] ?? null,
    players,
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const supabase = createAdminClient();
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  const authUsersById = new Map(
    authUsers.users.map((authUser) => [
      authUser.id,
      {
        email: authUser.email ?? null,
        lastSignInAt: authUser.last_sign_in_at ?? null,
      },
    ]),
  );

  const { data, error } = await fetchAdminGames(supabase);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).map((row) => toAdminGame(row as DbRow, authUsersById)));
}

async function fetchAdminGames(supabase: ReturnType<typeof createAdminClient>) {
  const withCreator = await supabase
    .from("games")
    .select("*, created_by:profiles!games_created_by_user_id_fkey(id,name,email), game_players!game_players_game_id_fkey(*, profiles(name,email)), turns(*)")
    .order("created_at", { ascending: false });

  if (!withCreator.error || !isMissingCreatedBySchemaError(withCreator.error)) return withCreator;

  return supabase
    .from("games")
    .select("*, game_players!game_players_game_id_fkey(*, profiles(name,email)), turns(*)")
    .order("created_at", { ascending: false });
}

function isMissingCreatedBySchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("created_by") ||
    text.includes("created_by_user_id") ||
    text.includes("games_created_by_user_id_fkey") ||
    text.includes("relationship");
}

export async function DELETE(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("id");
  if (!gameId) return NextResponse.json({ error: "Partie requise" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("games").delete().eq("id", gameId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
