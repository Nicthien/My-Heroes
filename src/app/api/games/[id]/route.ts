import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
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
  const isSpectator = Boolean(player && !player.isAlive);
  const allTileKeys = isSpectator ? getAllTileKeys(game.mapData as { width?: number; height?: number } | null) : [];
  const filteredGame = {
    ...game,
    players: players.map((item) => ({
      ...sanitizePlayerForViewer(item, player?.id),
      exploredTiles: item.id === player?.id ? (isSpectator ? allTileKeys : item.exploredTiles) : [],
    })),
    combats: ((game.combats as Array<Record<string, unknown>> | undefined) ?? []).map((combat) =>
      sanitizeCombatForViewer(combat, player?.id, isSpectator)
    ),
  };

  return NextResponse.json(filteredGame);
}

function sanitizePlayerForViewer<T extends {
  id: string;
  heroes?: Array<Record<string, unknown>>;
  towns?: Array<Record<string, unknown>>;
}>(player: T, viewerPlayerId?: string) {
  if (player.id === viewerPlayerId) return player;

  return {
    ...player,
    heroes: (player.heroes ?? []).map((hero) => ({
      ...hero,
      movement: 0,
      maxMovement: 0,
      attack: 0,
      defense: 0,
      spellPower: 0,
      knowledge: 0,
      armies: [],
    })),
    towns: (player.towns ?? []).map((town) => ({
      ...town,
      buildings: [],
      garrison: [],
      availableRecruits: {},
      tavernOffer: [],
    })),
  };
}

function sanitizeCombatForViewer(combat: Record<string, unknown>, viewerPlayerId?: string, isSpectator = false) {
  if (!viewerPlayerId) return summarizeCombat(combat);
  if (isSpectator || combatInvolvesPlayer(combat, viewerPlayerId)) {
    return { ...combat, visibility: "full" };
  }
  return summarizeCombat(combat);
}

function summarizeCombat(combat: Record<string, unknown>) {
  return {
    ...combat,
    visibility: "joinable_summary",
    boardState: { units: [] },
    turnQueue: [],
    actionLog: [],
    result: null,
  };
}

function combatInvolvesPlayer(combat: Record<string, unknown>, playerId: string) {
  const participants = Array.isArray(combat.participants) ? combat.participants : [];
  return (
    combat.attackerPlayerId === playerId ||
    combat.defenderPlayerId === playerId ||
    participants.some((participant) => (participant as { playerId?: string }).playerId === playerId)
  );
}

function getAllTileKeys(mapData: { width?: number; height?: number } | null) {
  const keys: string[] = [];
  const width = Number(mapData?.width ?? 0);
  const height = Number(mapData?.height ?? 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      keys.push(`${x},${y}`);
    }
  }
  return keys;
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

  if (!hostPlayer || hostPlayer.turnOrder !== 0) {
    return NextResponse.json({ error: "Seul le createur peut supprimer cette partie" }, { status: 403 });
  }

  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
