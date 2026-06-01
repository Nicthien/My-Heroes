import type { SupabaseAdminClient } from "./types";

/**
 * Re-reads the latest `map_state` from the DB before a write, so concurrent
 * updates within the same turn don't clobber each other. Falls back to the
 * provided snapshot if the row can't be read.
 */
export async function getLatestMapState(
  supabase: SupabaseAdminClient,
  gameId: string,
  fallback: Record<string, unknown>,
) {
  const { data } = await supabase.from("games").select("map_state").eq("id", gameId).maybeSingle();
  return (data?.map_state as Record<string, unknown> | undefined) ?? fallback;
}

/** Week bucket key derived from the turn number (7 turns per week). */
export function getAdventureWeekKey(turnNumber: number) {
  return `week-${Math.max(1, Math.floor((turnNumber - 1) / 7) + 1)}`;
}
