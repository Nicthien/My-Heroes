import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameSyncWithRelations } from "@/lib/supabase/game-db";
import { getAllTileKeys, sanitizeCombatForViewer, sanitizePlayerForViewer } from "../shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
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
  const isSpectator = Boolean(player && !player.isAlive);
  const allTileKeys = isSpectator ? getAllTileKeys(Number(game.mapWidth ?? 0), Number(game.mapHeight ?? 0)) : [];

  return NextResponse.json({
    id: game.id,
    status: game.status,
    turnNumber: game.turnNumber,
    currentTurnPlayerId: game.currentTurnPlayerId,
    updatedAt: game.updatedAt,
    mapState: game.mapState,
    players: players.map((item) => ({
      ...sanitizePlayerForViewer(item, player?.id),
      exploredTiles: item.id === player?.id ? (isSpectator ? allTileKeys : item.exploredTiles) : [],
    })),
    turns: game.turns,
    combats: ((game.combats as Array<Record<string, unknown>> | undefined) ?? []).map((combat) =>
      sanitizeCombatForViewer(combat, player?.id, isSpectator)
    ),
    neutralArmies: game.neutralArmies ?? [],
  });
}
