import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { resumeAiActivityUntilHuman } from "@/lib/game/ai/simple-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";
import { computeTurnProgressRatio, getAllTileKeys, sanitizeCombatForViewer, sanitizePlayerForViewer } from "./shared";
import { computeDbPlayerScore, type DbScorablePlayer } from "@/lib/game/score";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const isAdminObserver = user.role === "admin" && searchParams.get("admin") === "1";
  const shouldResumeAi = isAdminObserver && searchParams.get("resumeAi") === "1";
  const supabase = createAdminClient();
  const game = await getGameWithRelations(supabase, id);

  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });

  const players = game.players as unknown as Array<{
    id: string;
    userId: string | null;
    isAlive?: boolean;
    exploredTiles: string[];
    heroes?: Array<Record<string, unknown>>;
    towns?: Array<Record<string, unknown>>;
  }>;
  const player = players.find((item) => item.userId === user.id);
  if (!player && !isAdminObserver) {
    return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  }
  if (isAdminObserver) {
    if (shouldResumeAi) kickAiRunnerForAdminObserver(supabase, game);
    return NextResponse.json({
      ...game,
      players: players.map((item) => ({
        ...item,
        score: computeDbPlayerScore(item as unknown as DbScorablePlayer),
        turnProgressRatio: computeTurnProgressRatio(item, Number(game.turnNumber ?? 0)),
      })),
      combats: ((game.combats as Array<Record<string, unknown>> | undefined) ?? []).map((combat) => ({
        ...combat,
        visibility: "full",
      })),
      viewerMode: "admin",
    });
  }
  const isSpectator = Boolean(player && !player.isAlive);
  const allTileKeys = isSpectator ? getAllTileKeys(Number(game.mapWidth ?? 0), Number(game.mapHeight ?? 0)) : [];
  const filteredGame = {
    ...game,
    players: players.map((item) => ({
      ...sanitizePlayerForViewer(item, player?.id),
      score: computeDbPlayerScore(item as unknown as DbScorablePlayer),
      turnProgressRatio: computeTurnProgressRatio(item, Number(game.turnNumber ?? 0)),
      exploredTiles: item.id === player?.id ? (isSpectator ? allTileKeys : item.exploredTiles) : [],
    })),
    combats: ((game.combats as Array<Record<string, unknown>> | undefined) ?? []).map((combat) =>
      sanitizeCombatForViewer(combat, player?.id, isSpectator)
    ),
  };

  return NextResponse.json(filteredGame);
}

function kickAiRunnerForAdminObserver(
  supabase: ReturnType<typeof createAdminClient>,
  game: { id: unknown; status?: unknown; currentTurnPlayerId?: unknown; players?: unknown; combats?: unknown }
) {
  if (game.status !== "ACTIVE") return;
  const players = Array.isArray(game.players)
    ? game.players as Array<{ id?: unknown; userId?: unknown; isAi?: unknown; aiName?: unknown; isAlive?: unknown }>
    : [];
  const currentPlayer = players.find((player) => player.id === game.currentTurnPlayerId && player.isAlive !== false);
  const hasActiveCombat = Array.isArray(game.combats)
    && (game.combats as Array<{ status?: unknown }>).some((combat) => combat.status === "ACTIVE");
  const currentPlayerLooksAi = Boolean(currentPlayer?.isAi || currentPlayer?.aiName);
  if ((!currentPlayerLooksAi && !hasActiveCombat) || typeof game.id !== "string") return;
  const gameId = game.id;
  void resumeAiActivityUntilHuman(supabase, gameId).catch((error) => {
    console.error("admin observer AI runner failed", error);
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();
  const gamePlayer = await getGamePlayer(supabase, id, user.id);

  if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  if (!gamePlayer.isAlive) return NextResponse.json({ error: "Vous avez perdu cette partie" }, { status: 403 });

  const game = await getGameWithRelations(supabase, id);
  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

  const { error: turnError } = await supabase.from("turns").upsert({
    game_id: id,
    game_player_id: gamePlayer.id,
    turn_number: game.turnNumber,
    actions: body.actions || [],
    is_completed: true,
  }, {
    onConflict: "game_id,game_player_id,turn_number",
  });
  if (turnError) return NextResponse.json({ error: turnError.message }, { status: 500 });

  const updatedGame = await getGameWithRelations(supabase, id);
  return NextResponse.json(updatedGame);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const hostPlayer = await getGamePlayer(supabase, id, user.id);

  if (user.role !== "admin" && (!hostPlayer || hostPlayer.turnOrder !== 0)) {
    return NextResponse.json({ error: "Seul le createur peut supprimer cette partie" }, { status: 403 });
  }

  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
