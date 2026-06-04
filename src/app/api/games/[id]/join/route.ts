import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { isPlayableFaction } from "@/lib/game/playable-factions";
import { GameMap } from "@/lib/game/types";
import { createGamePlayerSetup, PLAYER_COLORS } from "@/lib/game/server/player-setup";
import { normalizeVictoryCondition } from "@/lib/game/victory";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameWithRelations } from "@/lib/supabase/game-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;
  if (user.role === "admin") {
    return NextResponse.json({ error: "Un administrateur peut observer les parties, mais ne peut pas les rejoindre comme joueur." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const faction = (body.faction || "castle") as string;
  if (!isPlayableFaction(faction)) {
    return NextResponse.json({ error: "Cette faction n'est pas jouable." }, { status: 400 });
  }
  const supabase = createAdminClient();

  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    name: user.name ?? user.email ?? "Joueur",
  }, { onConflict: "id" });

  const game = await getGameWithRelations(supabase, id);
  if (!game) return NextResponse.json({ error: "Partie non trouvee" }, { status: 404 });
  const players = game.players as unknown as Array<{ id: string; userId: string | null; turnOrder: number }>;

  if (players.some((player) => player.userId === user.id)) {
    return NextResponse.json({ error: "Deja dans cette partie" }, { status: 400 });
  }
  if (game.status !== "PENDING") {
    return NextResponse.json({ error: "La partie a déjà commencé" }, { status: 400 });
  }
  if (players.length >= Number(game.maxPlayers)) {
    return NextResponse.json({ error: "La partie est pleine" }, { status: 400 });
  }

  const usedTurnOrders = new Set(players.map((player) => Number(player.turnOrder)));
  const turnOrder = Array.from({ length: Number(game.maxPlayers) }, (_, index) => index)
    .find((index) => !usedTurnOrders.has(index)) ?? players.length;
  const mapData = game.mapData as GameMap;
  const victory = normalizeVictoryCondition((game.gameConfig as Record<string, unknown> | null)?.victory);
  let playerRow;
  try {
    playerRow = await createGamePlayerSetup({
      supabase,
      gameId: id,
      userId: user.id,
      faction,
      color: PLAYER_COLORS[turnOrder] || "#ffffff",
      turnOrder,
      mapData,
      victoryType: victory.type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de rejoindre la partie";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ gamePlayer: playerRow, gameStarted: false }, { status: 201 });
}
