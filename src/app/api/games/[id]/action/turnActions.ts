import { NextResponse } from "next/server";
import { runAiTurnsUntilHuman } from "@/lib/game/ai/simple-ai";
import { cancelPlayerTurnCompletion, completePlayerTurn } from "@/lib/game/server/turns";
import type { MinimalPlayer, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;

type HandleTurnActionParams = {
  supabase: SupabaseAdminClient;
  game: { turnNumber?: unknown };
  gameId: string;
  gamePlayer: MinimalPlayer;
  action: ActionRecord;
  logPlayerAction: (supabase: SupabaseAdminClient, game: { turnNumber?: unknown }, gameId: string, gamePlayer: MinimalPlayer, action: ActionRecord) => Promise<void>;
};

export async function handleTurnAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  action,
  logPlayerAction,
}: HandleTurnActionParams) {
  if (action.type === "END_TURN") {
    await completePlayerTurn(supabase, gameId, Number(game.turnNumber), gamePlayer.id);
    await runAiTurnsUntilHuman(supabase, gameId);
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  if (action.type === "SURRENDER_GAME") {
    // Forfeit: drop the player's seat and release their mines, then let the
    // shared turn logic re-evaluate the lifecycle (possible winner) and advance
    // off the now-dead player so the game never stalls.
    await supabase.from("game_players").update({ is_alive: false }).eq("id", gamePlayer.id);
    await supabase
      .from("resource_buildings")
      .update({ game_player_id: null })
      .eq("game_id", gameId)
      .eq("game_player_id", gamePlayer.id);
    await completePlayerTurn(supabase, gameId, Number(game.turnNumber), gamePlayer.id);
    await runAiTurnsUntilHuman(supabase, gameId);
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  if (action.type === "CANCEL_END_TURN") {
    const result = await cancelPlayerTurnCompletion(supabase, gameId, Number(game.turnNumber), gamePlayer.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  return null;
}
