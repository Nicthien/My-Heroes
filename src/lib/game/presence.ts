import { fetchWithSupabaseAuth } from "@/lib/auth/client";

const PRESENCE_SESSION_PREFIX = "myheroes:game-presence:";
export const GAME_PRESENCE_HEARTBEAT_MS = 30_000;

export function getGamePresenceSessionId(gameId: string) {
  if (typeof window === "undefined") return "";
  const key = `${PRESENCE_SESSION_PREFIX}${gameId}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  window.sessionStorage.setItem(key, sessionId);
  return sessionId;
}

export async function sendGamePresence(gameId: string, state: "heartbeat" | "leave") {
  const sessionId = getGamePresenceSessionId(gameId);
  if (!sessionId) return null;
  return fetchWithSupabaseAuth(`/api/games/${gameId}/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, state }),
    keepalive: state === "leave",
  });
}

export function sendGamePresenceOnPageHide(gameId: string) {
  const sessionId = getGamePresenceSessionId(gameId);
  if (!sessionId) return;
  void fetch(`/api/games/${gameId}/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Record a final timestamp, but do not mark an explicit leave: pagehide also
    // fires on reload, where immediate deletion would race the next page load.
    body: JSON.stringify({ sessionId, state: "heartbeat" }),
    credentials: "include",
    keepalive: true,
  });
}
