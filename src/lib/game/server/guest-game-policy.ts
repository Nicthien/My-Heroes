export const GUEST_HEARTBEAT_INTERVAL_MS = 30_000;
export const GUEST_PRESENCE_TIMEOUT_MS = 2 * 60_000;
export const GUEST_GAME_INACTIVITY_MS = 24 * 60 * 60_000;

export type GuestPresenceSnapshot = {
  lastSeenAt?: string | null;
  leftAt?: string | null;
};

export function evaluateEphemeralGameCleanup(options: {
  nowMs: number;
  createdAt?: string | null;
  eventUpdatedAt?: string | null;
  preservationPendingUntil?: string | null;
  presences: GuestPresenceSnapshot[];
}) {
  const createdAtMs = dateMs(options.createdAt);
  const lastActivityMs = Math.max(
    createdAtMs,
    dateMs(options.eventUpdatedAt),
    ...options.presences.map((presence) => dateMs(presence.lastSeenAt)),
  );
  const cutoff = options.nowMs - GUEST_PRESENCE_TIMEOUT_MS;
  const hasLivePresence = options.presences.some((presence) =>
    !presence.leftAt && dateMs(presence.lastSeenAt) >= cutoff
  );
  const preservationPending = dateMs(options.preservationPendingUntil) > options.nowMs;
  const oldEnoughForPresenceDecision = createdAtMs <= cutoff;
  const inactive = lastActivityMs <= options.nowMs - GUEST_GAME_INACTIVITY_MS;
  const empty = oldEnoughForPresenceDecision && !hasLivePresence && !preservationPending;

  return {
    shouldDelete: inactive || empty,
    reason: inactive ? "inactive" as const : empty ? "empty" as const : null,
    hasLivePresence,
    lastActivityMs,
  };
}

function dateMs(value: unknown) {
  if (typeof value !== "string") return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
