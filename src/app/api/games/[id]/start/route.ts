import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { finalizeStartingRareMines } from "@/lib/game/engine";
import { runAiTurnsUntilHuman } from "@/lib/game/ai/simple-ai";
import { createGamePlayerSetup, PLAYER_COLORS, pickAiFaction, pickAiName } from "@/lib/game/server/player-setup";
import { syncResourceBuildingsFromMap } from "@/lib/game/server/resource-buildings";
import { GameMap } from "@/lib/game/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameWithRelations } from "@/lib/supabase/game-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const game = await getGameWithRelations(supabase, id);

  if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });

  const players = game.players as unknown as Array<{ id: string; userId: string | null; isAi?: boolean; turnOrder: number }>;
  const currentUserPlayer = players.find((player) => player.userId === user.id);
  if (!currentUserPlayer) {
    return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  }
  if (game.status !== "PENDING") {
    return NextResponse.json({ error: "La partie est deja demarree" }, { status: 400 });
  }
  if (currentUserPlayer.turnOrder !== 0) {
    return NextResponse.json({ error: "Seul le createur peut demarrer la partie" }, { status: 403 });
  }

  const maxPlayers = Number(game.maxPlayers);
  const existingTurnOrders = new Set(players.map((player) => Number(player.turnOrder)));
  const mapData = game.mapData as GameMap;

  for (let turnOrder = 0; turnOrder < maxPlayers; turnOrder++) {
    if (existingTurnOrders.has(turnOrder)) continue;
    try {
      await createGamePlayerSetup({
        supabase,
        gameId: id,
        mapData,
        turnOrder,
        isAi: true,
        aiName: pickAiName(turnOrder),
        aiDifficulty: "simple",
        faction: pickAiFaction(turnOrder),
        color: PLAYER_COLORS[turnOrder] || "#ffffff",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de creer les joueurs IA";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const gameWithAi = await getGameWithRelations(supabase, id);
  if (!gameWithAi) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  const activePlayers = gameWithAi.players as unknown as Array<{ id: string; turnOrder: number; faction?: string }>;
  const firstPlayer = [...activePlayers].sort((a, b) => a.turnOrder - b.turnOrder)[0];
  if (!firstPlayer) return NextResponse.json({ error: "Aucun joueur dans la partie" }, { status: 400 });

  const finalizedMapData = finalizeStartingRareMines(
    gameWithAi.mapData as GameMap,
    new Map(activePlayers.map((player) => [Number(player.turnOrder), player.faction])),
  );
  await syncResourceBuildingsFromMap(supabase, id, finalizedMapData);

  const { error } = await supabase
    .from("games")
    .update({ status: "ACTIVE", current_turn_player_id: firstPlayer.id, map_data: finalizedMapData })
    .eq("id", id)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await runAiTurnsUntilHuman(supabase, id);
  const updatedGame = await getGameWithRelations(supabase, id);
  return NextResponse.json(updatedGame);
}
