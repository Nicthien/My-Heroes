"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseAuth } from "@/lib/auth/client";
import { rankPlayers } from "@/lib/game/score";
import { describeVictoryCondition } from "@/lib/game/victory";
import type { GameState, Player } from "@/lib/game/types";
import { CornerOrnaments, ParchmentBackground, goldText, ornateFramePolished } from "./theme";

interface ScoreSnapshot {
  gamePlayerId: string;
  turnNumber: number;
  score: number;
}

interface GameOverScreenProps {
  gameState: GameState;
  myPlayer?: Player;
  /** Leaves the game (server is told, then we return to the dashboard). */
  onLeave: () => void;
}

/**
 * Full-screen end-of-game review. Replaces the entire HUD once the game is
 * COMPLETED: heroes/towns/mines can no longer be selected, the (now fully
 * revealed) map sits dimmed behind, and the final ranking plus a per-round
 * score progression chart are shown.
 */
export function GameOverScreen({ gameState, myPlayer, onLeave }: GameOverScreenProps) {
  const [snapshots, setSnapshots] = useState<ScoreSnapshot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/scores`);
        if (!res.ok) {
          if (!cancelled) setSnapshots([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
      } catch {
        if (!cancelled) setSnapshots([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameState.id]);

  const ranked = useMemo(() => rankPlayers(gameState.players), [gameState.players]);
  const playersById = useMemo(
    () => new Map(gameState.players.map((player) => [player.id, player])),
    [gameState.players]
  );

  const winner = gameState.players.find((player) => player.id === gameState.winnerId);
  const isDraw = !winner;
  const iWon = Boolean(myPlayer && winner && winner.id === myPlayer.id);

  const title = isDraw ? "Match nul" : iWon ? "Victoire !" : "Défaite";
  const titleColor = isDraw ? "text-amber-200" : iWon ? "text-emerald-300" : "text-red-300";
  const titleIcon = isDraw ? "🤝" : iWon ? "🏆" : "💀";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className={`relative ${ornateFramePolished} flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden`}>
        <CornerOrnaments />
        <ParchmentBackground />

        <div className="relative flex flex-col items-center px-6 pt-6 text-center">
          <div className="text-5xl">{titleIcon}</div>
          <h2 className={`mt-2 text-3xl font-black uppercase tracking-[0.15em] ${titleColor}`}>{title}</h2>
          {!isDraw && (
            <p className="mt-1 text-sm uppercase tracking-wider text-amber-200/80">
              Vainqueur : <span className="font-bold text-amber-100">{winner?.name}</span>
            </p>
          )}
          <p className="mt-1 text-xs uppercase tracking-wider text-amber-200/55">
            🏆 {describeVictoryCondition(gameState.victoryCondition ?? { type: "DOMINATION" })}
          </p>
        </div>

        <div className="relative flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
            {/* Progression chart */}
            <div className="rounded-lg border border-amber-700/40 bg-black/30 p-3">
              <div className={`mb-2 text-xs font-black uppercase tracking-[0.18em] ${goldText}`}>
                Progression des scores
              </div>
              <ProgressionChart snapshots={snapshots} playersById={playersById} />
            </div>

            {/* Final ranking */}
            <div className="rounded-lg border border-amber-700/40 bg-black/30 p-3">
              <div className={`mb-2 text-xs font-black uppercase tracking-[0.18em] ${goldText}`}>
                Classement final
              </div>
              <ol className="flex flex-col gap-1.5">
                {ranked.map(({ player, breakdown, rank }) => (
                  <li
                    key={player.id}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                      player.id === myPlayer?.id
                        ? "border-amber-400/60 bg-amber-950/40"
                        : "border-amber-800/30 bg-black/20"
                    }`}
                  >
                    <span className="w-6 text-center text-sm font-black text-amber-200/80">{rankLabel(rank)}</span>
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-black/40"
                      style={{ backgroundColor: player.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-amber-50">
                      {player.name}
                      {!player.isAlive && <span className="ml-1 text-[0.65rem] uppercase text-red-300/70">éliminé</span>}
                    </span>
                    <span className="text-sm font-black tabular-nums text-amber-200">
                      {breakdown.total.toLocaleString("fr-FR")}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="relative flex justify-center border-t border-amber-700/30 px-6 py-4">
          <button
            onClick={onLeave}
            className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700"
          >
            Retour au menu
          </button>
        </div>
      </div>
    </div>
  );
}

function rankLabel(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}e`;
}

const CHART_W = 560;
const CHART_H = 240;
const PAD = { left: 52, right: 14, top: 14, bottom: 26 };

function ProgressionChart({
  snapshots,
  playersById,
}: {
  snapshots: ScoreSnapshot[] | null;
  playersById: Map<string, Player>;
}) {
  if (snapshots === null) {
    return <div className="grid h-[240px] place-items-center text-sm text-amber-200/60">Chargement du graphique…</div>;
  }
  if (snapshots.length === 0) {
    return (
      <div className="grid h-[240px] place-items-center text-center text-sm text-amber-200/60">
        Pas assez de données pour tracer la progression.
      </div>
    );
  }

  // Group points per player, ordered by turn.
  const seriesByPlayer = new Map<string, ScoreSnapshot[]>();
  for (const snap of snapshots) {
    const list = seriesByPlayer.get(snap.gamePlayerId) ?? [];
    list.push(snap);
    seriesByPlayer.set(snap.gamePlayerId, list);
  }

  const turns = [...new Set(snapshots.map((s) => s.turnNumber))].sort((a, b) => a - b);
  const minTurn = turns[0];
  const maxTurn = turns[turns.length - 1];
  const maxScore = Math.max(1, ...snapshots.map((s) => s.score));

  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const turnSpan = Math.max(1, maxTurn - minTurn);

  const xFor = (turn: number) => PAD.left + ((turn - minTurn) / turnSpan) * plotW;
  const yFor = (score: number) => PAD.top + (1 - score / maxScore) * plotH;

  const yTicks = 4;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = (maxScore / yTicks) * i;
    return { value, y: yFor(value) };
  });

  const xTickCount = Math.min(turns.length, 6);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const turn = Math.round(minTurn + (turnSpan * i) / Math.max(1, xTickCount - 1));
    return { turn, x: xFor(turn) };
  });

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-auto w-full" role="img" aria-label="Progression des scores par tour">
      {/* Y grid + labels */}
      {gridLines.map((line) => (
        <g key={`y-${line.value}`}>
          <line x1={PAD.left} y1={line.y} x2={CHART_W - PAD.right} y2={line.y} stroke="rgba(252,211,77,0.12)" strokeWidth={1} />
          <text x={PAD.left - 6} y={line.y + 3} textAnchor="end" fontSize={9} fill="rgba(252,211,77,0.55)">
            {Math.round(line.value).toLocaleString("fr-FR")}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xTicks.map((tick) => (
        <text key={`x-${tick.turn}`} x={tick.x} y={CHART_H - 8} textAnchor="middle" fontSize={9} fill="rgba(252,211,77,0.55)">
          J{tick.turn}
        </text>
      ))}

      {/* One polyline per player */}
      {[...seriesByPlayer.entries()].map(([playerId, points]) => {
        const player = playersById.get(playerId);
        const color = player?.color ?? "#facc15";
        const ordered = [...points].sort((a, b) => a.turnNumber - b.turnNumber);
        const path = ordered.map((p) => `${xFor(p.turnNumber)},${yFor(p.score)}`).join(" ");
        return (
          <g key={playerId}>
            {ordered.length > 1 && (
              <polyline points={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}
            {ordered.map((p) => (
              <circle key={p.turnNumber} cx={xFor(p.turnNumber)} cy={yFor(p.score)} r={2.5} fill={color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
