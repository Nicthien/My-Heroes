import { useEffect, useRef, useState } from "react";

/** Human-readable countdown: "2j 3h", "3h 05m", or "4:09" for sub-hour. */
export function formatTurnRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Per-turn countdown anchored to an absolute `startedAt` (ISO) and a
 * `limitSeconds` budget. The remaining time is derived from a once-a-second
 * clock tick, so it keeps counting down continuously — including while the
 * player has ended their turn and is waiting. When it reaches zero AND the local
 * player can still act, onExpire() is called once to optimistically end the
 * turn. The server enforces the same deadline independently.
 */
export function useTurnTimer({
  startedAt,
  limitSeconds,
  active,
  canAct,
  turnKey,
  onExpire,
}: {
  startedAt: string | null | undefined;
  limitSeconds: number | null | undefined;
  active: boolean;
  canAct: boolean;
  /** Stable identifier for the current turn, so onExpire fires at most once per turn. */
  turnKey: string;
  onExpire: () => void;
}) {
  const hasTimer = Boolean(active && startedAt && limitSeconds);
  const deadlineMs =
    hasTimer && startedAt && limitSeconds ? new Date(startedAt).getTime() + limitSeconds * 1000 : null;

  const [nowMs, setNowMs] = useState(() => Date.now());
  const remainingMs = deadlineMs !== null ? Math.max(0, deadlineMs - nowMs) : null;
  // Fraction of the budget still left (1 = full, 0 = empty), for a progress ring.
  const fraction =
    remainingMs !== null && limitSeconds
      ? Math.min(1, Math.max(0, remainingMs / (limitSeconds * 1000)))
      : null;

  // Tick the clock every second while a timer is active.
  useEffect(() => {
    if (deadlineMs === null) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [deadlineMs]);

  // Keep the latest onExpire callback without resubscribing the expiry effect.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  // Fire onExpire exactly once per turn when our own time runs out.
  const firedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasTimer || !canAct || remainingMs === null || remainingMs > 0) return;
    if (firedKeyRef.current === turnKey) return;
    firedKeyRef.current = turnKey;
    onExpireRef.current();
  }, [hasTimer, canAct, remainingMs, turnKey]);

  return { remainingMs, fraction, hasTimer };
}
