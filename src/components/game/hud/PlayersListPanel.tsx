"use client";

import { useState } from "react";
import type { GameState, Player } from "@/lib/game/types";
import { rankPlayers } from "@/lib/game/score";
import CollapsiblePanel from "./CollapsiblePanel";
import { PlayerProgressGauge, TurnStatusIcon } from "./topBar";
import { PlayerScoreTooltip } from "./PlayerScoreTooltip";
import { ornateFrame } from "./theme";

export function PlayersListPanel({
  gameState,
  myPlayer,
  embedded = false,
}: {
  gameState: GameState;
  myPlayer: Player | undefined;
  embedded?: boolean;
}) {
  const ranked = rankPlayers(gameState.players);
  const rankByPlayerId = new Map(ranked.map((entry) => [entry.player.id, entry]));
  const playerCount = gameState.players.length;

  // Tooltip is fixed-positioned (anchored to the hovered row) so it escapes the
  // panel's scroll/overflow clipping. Tracks the hovered row's screen rectangle.
  const [hovered, setHovered] = useState<{ playerId: string; top: number; right: number } | null>(null);
  const hoveredEntry = hovered ? rankByPlayerId.get(hovered.playerId) : undefined;

  const content = (
    <>
      {[...gameState.players]
        .sort((a, b) => {
          if (a.id === myPlayer?.id) return -1;
          if (b.id === myPlayer?.id) return 1;
          return a.turnOrder - b.turnOrder;
        })
        .map((p) => {
          const entry = rankByPlayerId.get(p.id);
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1 transition ${
                p.id === myPlayer?.id
                  ? "bg-amber-700/15 ring-1 ring-amber-500/40"
                  : "hover:bg-amber-900/15"
              }`}
              onMouseEnter={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setHovered({ playerId: p.id, top: rect.top, right: window.innerWidth - rect.left + 8 });
              }}
              onMouseLeave={() => setHovered((current) => (current?.playerId === p.id ? null : current))}
            >
              <div
                className="h-3 w-3 shrink-0 rounded-full ring-1 ring-amber-200/60 shadow"
                style={{ backgroundColor: p.color }}
              />
              <span className={p.isAlive ? "min-w-0 flex-1 truncate text-amber-100" : "min-w-0 flex-1 truncate text-stone-600 line-through"}>
                {p.name}
              </span>
              {p.isAi && <span className="shrink-0 rounded border border-cyan-400/40 px-1 text-[10px] font-black text-cyan-200">IA</span>}
              {entry && (
                <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] font-black tabular-nums text-amber-300/90">
                  #{entry.rank}
                </span>
              )}
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-amber-300/70">
                {p.heroes.length}H / {p.towns.length}C
              </span>
              <PlayerProgressGauge
                player={p}
                gameState={gameState}
                className="h-2.5 w-20 shrink-0"
              />
              <TurnStatusIcon ended={p.hasEndedTurn} />
            </div>
          );
        })}
      {hovered && hoveredEntry && (
        <PlayerScoreTooltip
          breakdown={hoveredEntry.breakdown}
          rank={hoveredEntry.rank}
          playerCount={playerCount}
          style={{ position: "fixed", top: hovered.top, right: hovered.right }}
        />
      )}
    </>
  );

  if (embedded) return <div className="space-y-0.5">{content}</div>;

  return (
    <CollapsiblePanel
      title="Joueurs"
      className={`${ornateFrame} pointer-events-auto shrink-0 overflow-hidden`}
      bodyClassName="max-h-32 space-y-0.5 overflow-y-auto overscroll-contain px-2 py-2 text-sm"
    >
      {content}
    </CollapsiblePanel>
  );
}
