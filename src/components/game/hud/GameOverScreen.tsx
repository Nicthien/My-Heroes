"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseAuth } from "@/lib/auth/client";
import { rankPlayers } from "@/lib/game/score";
import { describeVictoryCondition } from "@/lib/game/victory";
import type { GameState, Player } from "@/lib/game/types";
import { CornerOrnaments, ParchmentBackground, goldText, ornateFramePolished } from "./theme";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";

interface ScoreSnapshot {
  gamePlayerId: string;
  turnNumber: number;
  score: number;
}

type KeyMomentKind = "town" | "mine" | "combat";

interface KeyMoment {
  gamePlayerId: string;
  turnNumber: number;
  kind: KeyMomentKind;
  summary: string;
}

const KEY_MOMENT_ICON: Record<KeyMomentKind, string> = {
  town: "🏰",
  mine: "⛏️",
  combat: "⚔️",
};

const KEY_MOMENT_LABEL_KEY: Record<KeyMomentKind, TranslationKey> = {
  town: "gameover.momentTown",
  mine: "gameover.momentMine",
  combat: "gameover.momentCombat",
};

interface GameOverScreenProps {
  gameState: GameState;
  myPlayer?: Player;
  /** Leaves the game (server is told, then we return to the dashboard). */
  onLeave: () => void;
  /** When provided (admin observers), shows a button to close the review and inspect the board. */
  onDismiss?: () => void;
}

/**
 * Full-screen end-of-game review. Replaces the entire HUD once the game is
 * COMPLETED: heroes/towns/mines can no longer be selected, the (now fully
 * revealed) map sits dimmed behind, and the final ranking plus a per-round
 * score progression chart are shown.
 */
export function GameOverScreen({ gameState, myPlayer, onLeave, onDismiss }: GameOverScreenProps) {
  const { t, locale } = useI18n();
  const [snapshots, setSnapshots] = useState<ScoreSnapshot[] | null>(null);
  const [events, setEvents] = useState<KeyMoment[]>([]);

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
        if (!cancelled) {
          setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
          setEvents(Array.isArray(data.events) ? data.events : []);
        }
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
  // Admin observers have no seat in the game: show a neutral outcome, not "Défaite".
  const isObserver = !myPlayer;
  const iWon = Boolean(myPlayer && winner && winner.id === myPlayer.id);

  const title = isDraw ? t("gameover.draw") : isObserver ? t("gameover.finished") : iWon ? t("gameover.victory") : t("gameover.defeat");
  const titleColor = isDraw || isObserver ? "text-amber-200" : iWon ? "text-emerald-300" : "text-red-300";
  const titleIcon = isDraw ? "🤝" : isObserver || iWon ? "🏆" : "💀";

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
              {t("gameover.winner")} <span className="font-bold text-amber-100">{winner?.name}</span>
            </p>
          )}
          <p className="mt-1 text-xs uppercase tracking-wider text-amber-200/55">
            🏆 {describeVictoryCondition(gameState.victoryCondition ?? { type: "DOMINATION" }, locale)}
          </p>
        </div>

        <div className="relative flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
            {/* Progression chart */}
            <div className="rounded-lg border border-amber-700/40 bg-black/30 p-3">
              <div className={`mb-2 text-xs font-black uppercase tracking-[0.18em] ${goldText}`}>
                {t("gameover.scoreProgression")}
              </div>
              <ProgressionChart snapshots={snapshots} events={events} playersById={playersById} />
              <ChartLegend hasEvents={events.length > 0} />
            </div>

            {/* Final ranking */}
            <div className="rounded-lg border border-amber-700/40 bg-black/30 p-3">
              <div className={`mb-2 text-xs font-black uppercase tracking-[0.18em] ${goldText}`}>
                {t("gameover.finalRanking")}
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
                    <span className="w-6 text-center text-sm font-black text-amber-200/80">{rankLabel(rank, t)}</span>
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-black/40"
                      style={{ backgroundColor: player.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-amber-50">
                      {player.name}
                      {!player.isAlive && <span className="ml-1 text-[0.65rem] uppercase text-red-300/70">{t("gameover.eliminated")}</span>}
                    </span>
                    <span className="text-sm font-black tabular-nums text-amber-200">
                      {breakdown.total.toLocaleString(locale === "en" ? "en-US" : "fr-FR")}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="relative flex flex-wrap justify-center gap-3 border-t border-amber-700/30 px-6 py-4">
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 font-bold uppercase tracking-wider text-amber-200/80 transition hover:border-amber-500/60 hover:text-amber-100"
            >
              {t("gameover.inspectBoard")}
            </button>
          )}
          <button
            onClick={onLeave}
            className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700"
          >
            {t("gameover.backToMenu")}
          </button>
        </div>
      </div>
    </div>
  );
}

function rankLabel(rank: number, t: (key: TranslationKey, params?: Record<string, string | number>) => string) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return t("gameover.rankOrdinal", { rank });
}

const CHART_W = 560;
const CHART_H = 240;
const PAD = { left: 52, right: 14, top: 14, bottom: 26 };
const MAX_ZOOM = 6; // smallest viewBox width = CHART_W / MAX_ZOOM

interface ChartView {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL_VIEW: ChartView = { x: 0, y: 0, w: CHART_W, h: CHART_H };

/** Keep the view inside the chart bounds and at the locked CHART_W:CHART_H aspect. */
function clampView(view: ChartView): ChartView {
  const w = Math.min(CHART_W, Math.max(CHART_W / MAX_ZOOM, view.w));
  const h = w * (CHART_H / CHART_W);
  const x = Math.min(CHART_W - w, Math.max(0, view.x));
  const y = Math.min(CHART_H - h, Math.max(0, view.y));
  return { x, y, w, h };
}

function ChartLegend({ hasEvents }: { hasEvents: boolean }) {
  const { t } = useI18n();
  if (!hasEvents) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-amber-200/70">
      <span className="font-semibold uppercase tracking-wider text-amber-200/55">{t("gameover.keyMoments")}</span>
      <span>{t("gameover.legendTown")}</span>
      <span>{t("gameover.legendMine")}</span>
      <span>{t("gameover.legendCombat")}</span>
    </div>
  );
}

function ProgressionChart({
  snapshots,
  events,
  playersById,
}: {
  snapshots: ScoreSnapshot[] | null;
  events: KeyMoment[];
  playersById: Map<string, Player>;
}) {
  const { t, locale } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);
  const [view, setView] = useState<ChartView>(FULL_VIEW);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panState = useRef<{ clientX: number; clientY: number; viewX: number; viewY: number } | null>(null);
  const isZoomed = view.w < CHART_W - 0.5;

  // Wheel = zoom centred on the cursor. Native non-passive listener so we can
  // preventDefault and stop the surrounding modal from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / rect.width;
      const fy = (event.clientY - rect.top) / rect.height;
      setView((prev) => {
        const factor = event.deltaY < 0 ? 0.85 : 1 / 0.85;
        const nextW = Math.min(CHART_W, Math.max(CHART_W / MAX_ZOOM, prev.w * factor));
        const nextH = nextW * (CHART_H / CHART_W);
        const svgX = prev.x + fx * prev.w;
        const svgY = prev.y + fy * prev.h;
        return clampView({ x: svgX - fx * nextW, y: svgY - fy * nextH, w: nextW, h: nextH });
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [snapshots]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panState.current = { clientX: event.clientX, clientY: event.clientY, viewX: view.x, viewY: view.y };
    setDragging(true);
  }, [view.x, view.y]);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const pan = panState.current;
    const svg = svgRef.current;
    if (!pan || !svg) return;
    const rect = svg.getBoundingClientRect();
    const dxSvg = ((event.clientX - pan.clientX) / rect.width) * view.w;
    const dySvg = ((event.clientY - pan.clientY) / rect.height) * view.h;
    setView((prev) => clampView({ ...prev, x: pan.viewX - dxSvg, y: pan.viewY - dySvg }));
  }, [view.w, view.h]);

  const endPan = useCallback(() => {
    panState.current = null;
    setDragging(false);
  }, []);

  if (snapshots === null) {
    return <div className="grid h-[240px] place-items-center text-sm text-amber-200/60">{t("gameover.loadingChart")}</div>;
  }
  if (snapshots.length === 0) {
    return (
      <div className="grid h-[240px] place-items-center text-center text-sm text-amber-200/60">
        {t("gameover.notEnoughData")}
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

  // Place each key moment on its player's line, using that player's score on the
  // closest snapshotted turn (events can land on a turn without an exact point).
  const scoreAt = (playerId: string, turn: number): number | null => {
    const series = seriesByPlayer.get(playerId);
    if (!series || series.length === 0) return null;
    let best = series[0];
    for (const snap of series) {
      if (Math.abs(snap.turnNumber - turn) < Math.abs(best.turnNumber - turn)) best = snap;
    }
    return best.score;
  };
  const eventMarkers = events
    .map((event, index) => {
      const score = scoreAt(event.gamePlayerId, event.turnNumber);
      if (score === null) return null;
      return { ...event, index, x: xFor(event.turnNumber), y: yFor(score) };
    })
    .filter((marker): marker is NonNullable<typeof marker> => marker !== null);
  const hoveredMarker = hovered === null ? null : eventMarkers.find((marker) => marker.index === hovered) ?? null;

  return (
    <div className="relative">
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className="h-auto w-full touch-none select-none"
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      role="img"
      aria-label={t("gameover.chartAria")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerLeave={endPan}
    >
      {/* Y grid + labels */}
      {gridLines.map((line) => (
        <g key={`y-${line.value}`}>
          <line x1={PAD.left} y1={line.y} x2={CHART_W - PAD.right} y2={line.y} stroke="rgba(252,211,77,0.12)" strokeWidth={1} />
          <text x={PAD.left - 6} y={line.y + 3} textAnchor="end" fontSize={9} fill="rgba(252,211,77,0.55)">
            {Math.round(line.value).toLocaleString(locale === "en" ? "en-US" : "fr-FR")}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xTicks.map((tick) => (
        <text key={`x-${tick.turn}`} x={tick.x} y={CHART_H - 8} textAnchor="middle" fontSize={9} fill="rgba(252,211,77,0.55)">
          {t("gameover.dayShort", { turn: tick.turn })}
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

      {/* Key moment markers on each player's line */}
      {eventMarkers.map((marker) => (
        <text
          key={`event-${marker.index}`}
          x={marker.x}
          y={marker.y - 7}
          textAnchor="middle"
          fontSize={marker.index === hovered ? 14 : 11}
          style={{ cursor: "pointer", transition: "font-size 0.1s" }}
          onMouseEnter={() => setHovered(marker.index)}
          onMouseLeave={() => setHovered((current) => (current === marker.index ? null : current))}
        >
          {KEY_MOMENT_ICON[marker.kind]}
        </text>
      ))}
    </svg>

    {/* Zoom hint + reset */}
    <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-2">
      <span className="rounded bg-black/40 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-amber-200/45">
        {t("gameover.zoomHint")}
      </span>
      {isZoomed && (
        <button
          type="button"
          onClick={() => setView(FULL_VIEW)}
          className="pointer-events-auto rounded border border-amber-500/50 bg-stone-950/80 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-amber-200/85 transition hover:border-amber-300/70 hover:text-amber-100"
        >
          {t("gameover.reset")}
        </button>
      )}
    </div>

    {hoveredMarker && !dragging && (
      <KeyMomentTooltip marker={hoveredMarker} player={playersById.get(hoveredMarker.gamePlayerId)} view={view} />
    )}
    </div>
  );
}

function KeyMomentTooltip({
  marker,
  player,
  view,
}: {
  marker: KeyMoment & { x: number; y: number };
  player: Player | undefined;
  view: ChartView;
}) {
  const { t } = useI18n();
  // Map the marker's viewBox coordinates to a percentage of the (possibly
  // zoomed/panned) visible area, so the HTML tooltip tracks the SVG content.
  const leftPct = ((marker.x - view.x) / view.w) * 100;
  const topPct = ((marker.y - view.y) / view.h) * 100;
  if (leftPct < 0 || leftPct > 100 || topPct < 0 || topPct > 100) return null;
  const left = `${leftPct}%`;
  const top = `${topPct}%`;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[14rem] -translate-x-1/2 -translate-y-full rounded-md border border-amber-500/50 bg-stone-950/95 px-2.5 py-1.5 text-left shadow-lg shadow-black/50"
      style={{ left, top, marginTop: "-0.6rem" }}
    >
      <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-100">
        <span className="text-sm">{KEY_MOMENT_ICON[marker.kind]}</span>
        {t(KEY_MOMENT_LABEL_KEY[marker.kind])}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-amber-200/80">
        <span className="h-2 w-2 shrink-0 rounded-full border border-black/40" style={{ backgroundColor: player?.color ?? "#facc15" }} />
        <span className="font-semibold text-amber-100">{player?.name ?? t("common.player")}</span>
        <span className="text-amber-200/50">·</span>
        <span>{t("gameover.day", { n: marker.turnNumber })}</span>
      </div>
      {marker.summary && <div className="mt-0.5 text-[0.68rem] italic text-amber-200/60">{marker.summary}</div>}
    </div>
  );
}
