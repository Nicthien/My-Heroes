import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { resumeAiActivityUntilHuman } from "@/lib/game/ai/simple-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameSyncWithRelations } from "@/lib/supabase/game-db";
import { buildViewerGrailHint, computeTurnProgressRatio, getAllTileKeys, sanitizeCombatForViewer, sanitizePlayerForViewer, stripGrailFromGameConfig } from "../shared";
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
  const game = await getGameSyncWithRelations(supabase, id);

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
      id: game.id,
      status: game.status,
      turnNumber: game.turnNumber,
      currentTurnPlayerId: game.currentTurnPlayerId,
      updatedAt: game.updatedAt,
      mapState: game.mapState,
      gameConfig: stripGrailFromGameConfig(game.gameConfig),
      grailHint: buildViewerGrailHint(game, player?.id, true),
      players: players.map((item) => ({
        ...item,
        score: computeDbPlayerScore(item as unknown as DbScorablePlayer),
        turnProgressRatio: computeTurnProgressRatio(item, Number(game.turnNumber ?? 0)),
      })),
      turns: game.turns,
      actionLogs: game.actionLogs,
      combats: ((game.combats as Array<Record<string, unknown>> | undefined) ?? []).map((combat) => ({
        ...combat,
        visibility: "full",
      })),
      neutralArmies: game.neutralArmies ?? [],
      gates: game.gates ?? [],
      boats: game.boats ?? [],
      viewerMode: "admin",
    });
  }
  const isSpectator = Boolean(player && !player.isAlive);
  const allTileKeys = isSpectator ? getAllTileKeys(Number(game.mapWidth ?? 0), Number(game.mapHeight ?? 0)) : [];

  return NextResponse.json({
    id: game.id,
    status: game.status,
    turnNumber: game.turnNumber,
    currentTurnPlayerId: game.currentTurnPlayerId,
    updatedAt: game.updatedAt,
    mapState: game.mapState,
    gameConfig: stripGrailFromGameConfig(game.gameConfig),
    grailHint: buildViewerGrailHint(game, player?.id, isSpectator),
    players: players.map((item) => ({
      ...sanitizePlayerForViewer(item, player?.id),
      score: computeDbPlayerScore(item as unknown as DbScorablePlayer),
      turnProgressRatio: computeTurnProgressRatio(item, Number(game.turnNumber ?? 0)),
      exploredTiles: item.id === player?.id ? (isSpectator ? allTileKeys : item.exploredTiles) : [],
    })),
    turns: game.turns,
    actionLogs: game.actionLogs,
    combats: ((game.combats as Array<Record<string, unknown>> | undefined) ?? []).map((combat) =>
      sanitizeCombatForViewer(combat, player?.id, isSpectator)
    ),
    neutralArmies: game.neutralArmies ?? [],
    gates: game.gates ?? [],
    boats: game.boats ?? [],
  });
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
