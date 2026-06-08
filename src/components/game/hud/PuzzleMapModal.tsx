"use client";

import { createPortal } from "react-dom";
import type { GrailHint } from "@/lib/game/grail";
import { hashSeed } from "@/lib/game/engine/rng";
import { TerrainType, type GameMap } from "@/lib/game/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { goldText, ornateFramePolished } from "./theme";

const TERRAIN_COLORS: Record<string, string> = {
  [TerrainType.GRASS]: "#3f7f3b",
  [TerrainType.WATER]: "#1f5f8f",
  [TerrainType.MOUNTAIN]: "#68635b",
  [TerrainType.FOREST]: "#245d34",
  [TerrainType.DIRT]: "#8a623c",
  [TerrainType.SAND]: "#b89b55",
  [TerrainType.SNOW]: "#d7e2e4",
  [TerrainType.SWAMP]: "#496737",
  [TerrainType.LAVA]: "#8d2f1e",
};

/**
 * The Grail puzzle map. It shows a FIXED fragment of the adventure
 * map; each visited Obelisk uncovers one piece of that fragment, and the last
 * Obelisk uncovers the last piece. The exact buried tile is only pinpointed once
 * the reveal threshold is reached. Read-only: digging happens on the adventure
 * map via the hero's Dig action.
 */
export function PuzzleMapModal({
  hint,
  map,
  onClose,
}: {
  hint: GrailHint;
  map: GameMap;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const portalTarget = typeof document === "undefined" ? null : document.body;

  const win = hint.zone ?? null;
  const winW = win ? win.maxX - win.minX + 1 : map.width;
  const winH = win ? win.maxY - win.minY + 1 : map.height;

  const visibleTiles: Array<{ x: number; y: number; color: string }> = [];
  if (win) {
    for (let y = win.minY; y <= win.maxY; y++) {
      for (let x = win.minX; x <= win.maxX; x++) {
        const terrain = map.tiles[y]?.[x]?.terrain;
        if (terrain) visibleTiles.push({ x, y, color: TERRAIN_COLORS[terrain] ?? "#3f7f3b" });
      }
    }
  }

  // Split the fixed fragment into a grid of covering pieces. Each Obelisk visited
  // uncovers a proportional share; the last visit uncovers the final piece. The
  // uncovering order is deterministic (seeded by the window) and stable.
  const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, hint.obelisksTotal))));
  const rows = cols;
  const cellCount = cols * rows;
  const total = Math.max(1, hint.obelisksTotal);
  const revealedCells = hint.obelisksVisited >= total
    ? cellCount
    : Math.floor((cellCount * hint.obelisksVisited) / total);
  const pieceSeed = win ? `${win.minX},${win.minY},${win.maxX},${win.maxY}` : "grail";
  const revealOrder = Array.from({ length: cellCount }, (_, index) => index)
    .sort((a, b) => hashSeed(`${pieceSeed}:${a}`) - hashSeed(`${pieceSeed}:${b}`));
  const coveredCells = new Set(revealOrder.slice(revealedCells));

  const pct = (value: number, span: number) => `${span > 0 ? (value / span) * 100 : 0}%`;

  const modal = (
    <div
      className="fixed inset-0 z-[999] grid place-items-center bg-black/75 p-4 text-amber-50"
      role="dialog"
      aria-modal="true"
      aria-label={t("grail.puzzleTitle")}
      onClick={onClose}
    >
      <section
        className={`${ornateFramePolished} flex max-h-[calc(100vh-2rem)] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-amber-700/50 bg-stone-950/90 px-4 py-3">
          <h2 className={`flex-1 truncate text-lg font-black ${goldText}`}>{t("grail.puzzleTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-700/50 bg-black/35 px-3 py-1 text-sm font-bold text-amber-100 transition hover:border-amber-300"
          >
            {t("common.close")}
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
          <div className="text-center text-sm font-bold text-amber-200/80">
            {t("grail.obeliskProgress", { visited: hint.obelisksVisited, total: hint.obelisksTotal })}
          </div>

          <div
            className="relative mx-auto w-full overflow-hidden rounded-md border border-amber-700/50 bg-black"
            style={{ aspectRatio: `${winW} / ${winH}` }}
          >
            {/* Only the probable region (the puzzle window) fills the view. */}
            <svg
              viewBox={win ? `${win.minX} ${win.minY} ${winW} ${winH}` : `0 0 ${map.width} ${map.height}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {visibleTiles.map((tile) => (
                <rect key={`${tile.x},${tile.y}`} x={tile.x} y={tile.y} width={1} height={1} fill={tile.color} />
              ))}
              {win && Array.from({ length: cellCount }, (_, index) => {
                if (!coveredCells.has(index)) return null;
                const cx = index % cols;
                const cy = Math.floor(index / cols);
                const cellW = winW / cols;
                const cellH = winH / rows;
                return (
                  <rect
                    key={`cover-${index}`}
                    x={win.minX + cx * cellW}
                    y={win.minY + cy * cellH}
                    width={cellW}
                    height={cellH}
                    fill="#0c0a09"
                    stroke="rgba(120,113,108,0.35)"
                    strokeWidth={0.15}
                  />
                );
              })}
            </svg>

            {hint.revealed && hint.tile && win && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: pct(hint.tile.x + 0.5 - win.minX, winW), top: pct(hint.tile.y + 0.5 - win.minY, winH) }}
              >
                <span className="block h-4 w-4 animate-pulse rounded-full border-2 border-amber-200 bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.9)]" />
              </div>
            )}
          </div>

          <div className="rounded-md border border-amber-800/40 bg-black/35 px-3 py-2 text-center text-xs leading-snug text-amber-200/80">
            {hint.revealed && hint.tile
              ? t("grail.revealed", { x: hint.tile.x, y: hint.tile.y })
              : hint.obelisksTotal === 0
                ? t("grail.noObelisks")
                : hint.zone
                  ? t("grail.zoneHint")
                  : t("grail.noClue")}
          </div>
        </div>
      </section>
    </div>
  );

  return portalTarget ? createPortal(modal, portalTarget) : modal;
}
