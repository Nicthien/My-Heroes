import { runAiTurnsUntilHuman } from "@/lib/game/ai/simple-ai";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { autoResolveActiveCombat } from "./autoResolveActiveCombat";
import { completePlayerTurn } from "./turns";

/**
 * The per-turn time budget (seconds) configured at game creation, or `null` when
 * the game has no turn timer. Stored in game_config.turnTimeLimit; any value <= 0
 * (or absent) means "no limit".
 */
export function getTurnTimeLimitSeconds(
  gameConfig: Record<string, unknown> | null | undefined
): number | null {
  const raw = Number(gameConfig?.turnTimeLimit);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

interface TimeoutGame {
  id: unknown;
  status?: unknown;
  turnNumber?: unknown;
  currentTurnPlayerId?: unknown;
  currentTurnStartedAt?: unknown;
  gameConfig?: unknown;
  combats?: unknown;
}

/**
 * Auto-end the current player's turn when its time budget has elapsed.
 *
 * This is called from the polled read endpoints (sync + game fetch), so *any*
 * connected client — including opponents waiting on the timed-out player —
 * drives the enforcement. That keeps a turn from stalling forever when the
 * active player simply closes their tab.
 *
 * Concurrency-safe: the claim is an atomic conditional UPDATE on
 * current_turn_started_at, so simultaneous pollers can't double-advance.
 *
 * @returns true when a turn was actually ended (caller should re-fetch state).
 */
export async function enforceTurnTimeout(
  supabase: SupabaseAdmin,
  game: TimeoutGame
): Promise<boolean> {
  if (game.status !== "ACTIVE" || typeof game.id !== "string") return false;
  const gameId = game.id;

  const limitSeconds = getTurnTimeLimitSeconds(
    (game.gameConfig ?? null) as Record<string, unknown> | null
  );
  if (limitSeconds === null) return false;

  const currentPlayerId = typeof game.currentTurnPlayerId === "string" ? game.currentTurnPlayerId : null;
  if (!currentPlayerId) return false;

  const startedAt = typeof game.currentTurnStartedAt === "string" ? game.currentTurnStartedAt : null;
  if (!startedAt) {
    // Legacy / freshly-migrated game with no start stamp yet: seed it now so the
    // clock starts on this observation instead of ending the turn instantly.
    await supabase
      .from("games")
      .update({ current_turn_started_at: new Date().toISOString() })
      .eq("id", gameId)
      .is("current_turn_started_at", null);
    return false;
  }

  const elapsedSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < limitSeconds) return false;

  // Atomically claim the timeout: only rows whose start stamp is still older than
  // the deadline are updated. The first writer wins and bumps the stamp to now(),
  // so any concurrent writer's WHERE no longer matches and updates zero rows.
  const thresholdIso = new Date(Date.now() - limitSeconds * 1000).toISOString();
  const { data: claimed, error } = await supabase
    .from("games")
    .update({ current_turn_started_at: new Date().toISOString() })
    .eq("id", gameId)
    .eq("current_turn_player_id", currentPlayerId)
    .lt("current_turn_started_at", thresholdIso)
    .select("id");

  if (error || !claimed || claimed.length === 0) return false;

  // The timed-out player may have left a battle unresolved (ending a turn is
  // blocked during combat). Auto-resolve their active combats by power before
  // advancing, so combat can't be used to freeze the clock indefinitely.
  for (const combatId of getActiveCombatIdsForPlayer(game.combats, currentPlayerId)) {
    try {
      await autoResolveActiveCombat(supabase, gameId, combatId);
    } catch (err) {
      console.error("auto-resolve on turn timeout failed", { gameId, combatId, err });
    }
  }

  await completePlayerTurn(supabase, gameId, Number(game.turnNumber ?? 0), currentPlayerId);
  await runAiTurnsUntilHuman(supabase, gameId);
  return true;
}

/** ACTIVE combats the given player is part of (attacker, defender, or reinforcement). */
function getActiveCombatIdsForPlayer(rawCombats: unknown, playerId: string): string[] {
  if (!Array.isArray(rawCombats)) return [];
  const combats = rawCombats as Array<{
    id?: unknown;
    status?: unknown;
    attackerPlayerId?: unknown;
    defenderPlayerId?: unknown;
    participants?: Array<{ playerId?: unknown }> | null;
  }>;
  return combats
    .filter(
      (combat) =>
        combat.status === "ACTIVE" &&
        (combat.attackerPlayerId === playerId ||
          combat.defenderPlayerId === playerId ||
          (Array.isArray(combat.participants) &&
            combat.participants.some((participant) => participant?.playerId === playerId)))
    )
    .map((combat) => combat.id)
    .filter((id): id is string => typeof id === "string");
}
