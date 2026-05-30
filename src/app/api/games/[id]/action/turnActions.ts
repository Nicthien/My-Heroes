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

  if (action.type === "CANCEL_END_TURN") {
    const result = await cancelPlayerTurnCompletion(supabase, gameId, Number(game.turnNumber), gamePlayer.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  return null;
}
