"use client";

import type { CSSProperties } from "react";
import type { ScoreBreakdown } from "@/lib/game/score";
import { goldDivider, goldText, ornateFramePolished } from "./theme";

/**
 * Detailed score card shown on hover over a player row in the Players panel.
 * Positioning is controlled by the parent (fixed-position to escape the scroll
 * container); this component is purely presentational.
 */
export function PlayerScoreTooltip({
  breakdown,
  rank,
  playerCount,
  style,
}: {
  breakdown: ScoreBreakdown;
  rank: number;
  playerCount: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`${ornateFramePolished} pointer-events-none z-50 w-56 px-3 py-2 text-left shadow-xl shadow-black/60`}
      style={style}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-xs font-black uppercase tracking-wider ${goldText}`}>Score</span>
        <span className="text-[11px] font-bold text-amber-300/80">
          Rang #{rank}/{playerCount}
        </span>
      </div>
      <div className={`my-1 ${goldDivider}`} />
      <ul className="space-y-0.5">
        {breakdown.categories
          .filter((category) => category.points !== 0)
          .map((category) => (
            <li key={category.key} className="flex items-center justify-between text-[11px] text-amber-100/90">
              <span>{category.label}</span>
              <span className="font-bold tabular-nums">{category.points.toLocaleString("fr-FR")}</span>
            </li>
          ))}
      </ul>
      <div className={`my-1 ${goldDivider}`} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider text-amber-200">Total</span>
        <span className={`text-sm font-black tabular-nums ${goldText}`}>
          {breakdown.total.toLocaleString("fr-FR")}
        </span>
      </div>
    </div>
  );
}
