import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { finalizeStartingRareMines, repairStartingEconomy } from "@/lib/game/engine";
import { runAiTurnsUntilHuman } from "@/lib/game/ai/simple-ai";
import { recordGameAction } from "@/lib/game/server/action-log";
import { createGamePlayerSetup, PLAYER_COLORS, pickAiFaction, pickAiName } from "@/lib/game/server/player-setup";
import { syncResourceBuildingsFromMap } from "@/lib/game/server/resource-buildings";
import { normalizeVictoryCondition } from "@/lib/game/victory";
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
  const isAdminStarter = user.role === "admin";
  if (!currentUserPlayer && !isAdminStarter) {
    return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  }
  if (game.status !== "PENDING") {
    return NextResponse.json(game);
  }
  if (!isAdminStarter && currentUserPlayer?.turnOrder !== 0) {
    return NextResponse.json({ error: "Seul le createur peut demarrer la partie" }, { status: 403 });
  }

  const maxPlayers = Number(game.maxPlayers);
  const existingTurnOrders = new Set(players.map((player) => Number(player.turnOrder)));
  const mapData = game.mapData as GameMap;
  const victory = normalizeVictoryCondition((game.gameConfig as Record<string, unknown> | null)?.victory);

  for (let turnOrder = 0; turnOrder < maxPlayers; turnOrder++) {
    if (existingTurnOrders.has(turnOrder)) continue;
    const aiName = pickAiName(turnOrder);
    const faction = pickAiFaction(turnOrder);
    try {
      await createGamePlayerSetup({
        supabase,
        gameId: id,
        mapData,
        turnOrder,
        isAi: true,
        aiName,
        aiDifficulty: "simple",
        faction,
        color: PLAYER_COLORS[turnOrder] || "#ffffff",
        victoryType: victory.type,
      });
      await recordGameAction(supabase, {
        gameId: id,
        actorKind: "system",
        turnNumber: Number(game.turnNumber ?? 1),
        actionType: "CREATE_AI_PLAYER",
        category: "setup",
        summary: `${aiName} rejoint la partie comme IA.`,
        details: { turnOrder, faction },
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

  // Safety net before the game goes ACTIVE: maps are generated before players
  // join, so re-guarantee every player's home zone owns one mine of each starting
  // role and force any missing one back onto the map (constrained to its zone).
  const mapToFinalize = gameWithAi.mapData as GameMap;
  const economyRepairs = repairStartingEconomy(mapToFinalize);
  // Type the freshly re-added rare mines (still generic) to each owner's faction.
  const finalizedMapData = finalizeStartingRareMines(
    mapToFinalize,
    new Map(activePlayers.map((player) => [Number(player.turnOrder), player.faction])),
  );
  await syncResourceBuildingsFromMap(supabase, id, finalizedMapData);

  if (economyRepairs.length > 0) {
    const unresolved = economyRepairs.filter((repair) => !repair.resolved).length;
    await recordGameAction(supabase, {
      gameId: id,
      actorKind: "system",
      turnNumber: Number(game.turnNumber ?? 1),
      actionType: "REPAIR_STARTING_ECONOMY",
      category: "setup",
      summary: `Filet de sécurité : ${economyRepairs.length - unresolved} mine(s) de départ rétablie(s)${
        unresolved > 0 ? `, ${unresolved} non rétablie(s)` : ""
      }.`,
      details: { repairs: economyRepairs },
    });
  }

  const { error } = await supabase
    .from("games")
    .update({ status: "ACTIVE", current_turn_player_id: firstPlayer.id, current_turn_started_at: new Date().toISOString(), map_data: finalizedMapData })
    .eq("id", id)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recordGameAction(supabase, {
    gameId: id,
    actorKind: "system",
    turnNumber: Number(gameWithAi.turnNumber ?? 1),
    actionType: "START_GAME",
    category: "setup",
    summary: "La partie demarre.",
    details: { firstPlayerId: firstPlayer.id, playerCount: activePlayers.length },
  });
  await runAiTurnsUntilHuman(supabase, id);
  const updatedGame = await getGameWithRelations(supabase, id);
  return NextResponse.json(updatedGame);
}
