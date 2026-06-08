import type { GameState, Player } from "@/lib/game/types";
import { formatTurnRemaining, useTurnTimer } from "./useTurnTimer";

/**
 * Compact adventure turn-timer chip (mini gold progress ring + countdown) for
 * use in horizontal chrome such as the combat header. Display-only: it never
 * auto-ends the turn (the main HUD owns that), so it is safe to mount anywhere.
 * Renders nothing when the game has no turn timer.
 */
export function TurnTimerBadge({
  gameState,
  myPlayer,
  className,
}: {
  gameState: GameState;
  myPlayer?: Player;
  className?: string;
}) {
  const canAct = Boolean(
    myPlayer && gameState.status === "ACTIVE" && myPlayer.isAlive && !myPlayer.hasEndedTurn
  );
  const startedAt = canAct ? gameState.currentTurnStartedAt : (myPlayer?.turnStartedAt ?? null);

  const { remainingMs, fraction, hasTimer } = useTurnTimer({
    startedAt,
    limitSeconds: gameState.turnTimeLimit ?? null,
    active: gameState.status === "ACTIVE",
    canAct: false, // display-only — the main HUD instance handles auto-end
    turnKey: `${gameState.id}:${gameState.turnNumber}:${gameState.currentTurnPlayerId}`,
    onExpire: () => {},
  });

  if (!hasTimer || remainingMs === null) return null;

  const urgent = remainingMs <= 30000;
  const circumference = 2 * Math.PI * 16;

  return (
    <div
      title={formatTurnRemaining(remainingMs)}
      className={`flex items-center gap-2 rounded-full border px-2.5 py-1 shadow-[0_0_0_1px_rgba(0,0,0,0.4)_inset] ${
        urgent ? "border-red-400/60 bg-red-950/75" : "border-amber-500/50 bg-stone-950/75"
      } ${className ?? ""}`}
    >
      <svg viewBox="0 0 40 40" className="h-7 w-7 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="turnBadgeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={urgent ? "#fee2e2" : "#fef3c7"} />
            <stop offset="55%" stopColor={urgent ? "#f87171" : "#fbbf24"} />
            <stop offset="100%" stopColor={urgent ? "#dc2626" : "#d97706"} />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="url(#turnBadgeGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (fraction ?? 0))}
          className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${urgent ? "animate-pulse" : ""}`}
        />
      </svg>
      <span
        className={`font-mono text-sm font-black tabular-nums tracking-tight [text-shadow:_0_1px_3px_rgba(0,0,0,0.6)] ${
          urgent ? "animate-pulse text-red-100" : "text-amber-100"
        }`}
      >
        {formatTurnRemaining(remainingMs)}
      </span>
    </div>
  );
}
