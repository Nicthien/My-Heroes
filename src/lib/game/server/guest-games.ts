import "server-only";

import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import {
  evaluateEphemeralGameCleanup,
  GUEST_GAME_INACTIVITY_MS,
  GUEST_PRESENCE_TIMEOUT_MS,
} from "./guest-game-policy";

type PresenceRow = {
  user_id?: unknown;
  last_seen_at?: unknown;
  left_at?: unknown;
};

type PlayerRow = { user_id?: unknown };

type EphemeralGameRow = {
  id: string;
  created_at?: unknown;
  preservation_pending_until?: unknown;
  game_events?: unknown;
  game_presence?: unknown;
  game_players?: unknown;
};

export async function updateGamePresence(
  supabase: SupabaseAdmin,
  options: {
    gameId: string;
    userId: string;
    sessionId: string;
    state: "heartbeat" | "leave";
    now?: Date;
  },
) {
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id,is_ephemeral,preservation_pending_until")
    .eq("id", options.gameId)
    .maybeSingle();
  if (gameError) throw gameError;
  if (!game) return { status: "not_found" as const };
  if (!game.is_ephemeral) return { status: "permanent" as const };

  const { data: membership, error: membershipError } = await supabase
    .from("game_players")
    .select("id")
    .eq("game_id", options.gameId)
    .eq("user_id", options.userId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return { status: "forbidden" as const };

  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const { error: presenceError } = await supabase.from("game_presence").upsert({
    game_id: options.gameId,
    user_id: options.userId,
    session_id: options.sessionId,
    last_seen_at: nowIso,
    left_at: options.state === "leave" ? nowIso : null,
  }, { onConflict: "game_id,user_id,session_id" });
  if (presenceError) throw presenceError;

  if (options.state === "leave") {
    const deleted = await deleteGameIfEmpty(supabase, options.gameId, now);
    return { status: "ok" as const, deleted };
  }
  return { status: "ok" as const, deleted: false };
}

export async function cleanupEphemeralGames(
  supabase: SupabaseAdmin,
  now = new Date(),
) {
  const { data, error } = await supabase
    .from("games")
    .select("id,created_at,preservation_pending_until,game_events(updated_at),game_presence(user_id,last_seen_at,left_at),game_players!game_players_game_id_fkey(user_id)")
    .eq("is_ephemeral", true);
  if (error) throw error;

  const deletedGameIds: string[] = [];
  for (const raw of data ?? []) {
    const game = raw as unknown as EphemeralGameRow;
    const presences = asRows<PresenceRow>(game.game_presence);
    const eventUpdatedAt = readEventUpdatedAt(game.game_events);
    const policy = evaluateEphemeralGameCleanup({
      nowMs: now.getTime(),
      createdAt: typeof game.created_at === "string" ? game.created_at : null,
      eventUpdatedAt: typeof eventUpdatedAt === "string" ? eventUpdatedAt : null,
      preservationPendingUntil: typeof game.preservation_pending_until === "string" ? game.preservation_pending_until : null,
      presences: presences.map((presence) => ({
        lastSeenAt: typeof presence.last_seen_at === "string" ? presence.last_seen_at : null,
        leftAt: typeof presence.left_at === "string" ? presence.left_at : null,
      })),
    });

    if (!policy.shouldDelete) continue;
    const userIds = humanUserIds(game.game_players);
    if (await deleteEphemeralGame(supabase, game.id)) {
      deletedGameIds.push(game.id);
      await cleanupGuestUsers(supabase, userIds, now, true);
    }
  }

  await cleanupGuestUsers(supabase, [], now, false);
  return { deletedGameIds };
}

async function deleteGameIfEmpty(supabase: SupabaseAdmin, gameId: string, now: Date) {
  const { data: game, error } = await supabase
    .from("games")
    .select("id,is_ephemeral,preservation_pending_until,game_presence(user_id,last_seen_at,left_at),game_players!game_players_game_id_fkey(user_id)")
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw error;
  if (!game?.is_ephemeral) return false;
  if (dateMs(game.preservation_pending_until) > now.getTime()) return false;

  const presences = asRows<PresenceRow>(game.game_presence);
  if (hasActivePresence(presences, now)) return false;
  const userIds = humanUserIds(game.game_players);
  const deleted = await deleteEphemeralGame(supabase, gameId);
  if (deleted) await cleanupGuestUsers(supabase, userIds, now, true);
  return deleted;
}

async function deleteEphemeralGame(supabase: SupabaseAdmin, gameId: string) {
  const { data, error } = await supabase
    .from("games")
    .delete()
    .eq("id", gameId)
    .eq("is_ephemeral", true)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function cleanupGuestUsers(
  supabase: SupabaseAdmin,
  preferredUserIds: string[],
  now: Date,
  allowImmediate: boolean,
) {
  let profileQuery = supabase.from("profiles").select("id,created_at").eq("is_guest", true);
  if (preferredUserIds.length > 0) profileQuery = profileQuery.in("id", [...new Set(preferredUserIds)]);
  const { data: profiles, error: profilesError } = await profileQuery;
  if (profilesError) throw profilesError;

  for (const profile of profiles ?? []) {
    if (!allowImmediate && dateMs(profile.created_at) > now.getTime() - GUEST_GAME_INACTIVITY_MS) continue;

    const [membershipResult, confirmationResult] = await Promise.all([
      supabase.from("game_players").select("id").eq("user_id", profile.id).limit(1).maybeSingle(),
      supabase.from("email_confirmations").select("expires_at").eq("user_id", profile.id).maybeSingle(),
    ]);
    if (membershipResult.error || confirmationResult.error) {
      console.warn(
        "guest auth cleanup skipped after lookup failure",
        profile.id,
        membershipResult.error?.message ?? confirmationResult.error?.message,
      );
      continue;
    }
    const membership = membershipResult.data;
    const confirmation = confirmationResult.data;
    if (membership) continue;
    if (confirmation && dateMs(confirmation.expires_at) > now.getTime()) continue;

    const { error } = await supabase.auth.admin.deleteUser(profile.id);
    if (error) console.warn("guest auth cleanup failed", profile.id, error.message);
  }
}

function hasActivePresence(presences: PresenceRow[], now: Date) {
  const cutoff = now.getTime() - GUEST_PRESENCE_TIMEOUT_MS;
  return presences.some((presence) => !presence.left_at && dateMs(presence.last_seen_at) >= cutoff);
}

function humanUserIds(value: unknown) {
  return asRows<PlayerRow>(value)
    .map((player) => typeof player.user_id === "string" ? player.user_id : null)
    .filter((userId): userId is string => Boolean(userId));
}

function readEventUpdatedAt(value: unknown) {
  if (Array.isArray(value)) return value[0]?.updated_at;
  if (value && typeof value === "object") return (value as { updated_at?: unknown }).updated_at;
  return null;
}

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function dateMs(value: unknown) {
  if (typeof value !== "string") return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
