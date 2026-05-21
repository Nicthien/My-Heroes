"use client";

import { type FormEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";
import { goldDivider, goldText } from "./theme";
import {
  DEV_PANEL_MARGIN,
  DevPerformancePanel,
  type DevPanelPosition,
  clampDevPanelPosition,
  getDevPanelCollapsed,
  getDevPanelPosition,
  getDevPanelVisible,
  saveDevPanelPosition,
  setDevPanelCollapsedStorage,
  setDevPanelVisibilityStorage,
  useDevPerformanceStats,
} from "./DevPerformancePanel";

void DEV_PANEL_MARGIN;

export function useDevPanel(gameId: string | undefined) {
  const { data: session } = useSession();
  const setGameState = useGameStore((state) => state.setGameState);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const setDevRevealMap = useGameStore((state) => state.setDevRevealMap);

  const [showDevPassword, setShowDevPassword] = useState(false);
  const [devPassword, setDevPassword] = useState("");
  const [devPasswordError, setDevPasswordError] = useState<string | null>(null);
  const [showDevPanel, setShowDevPanel] = useState(getDevPanelVisible);
  const [devPanelCollapsed, setDevPanelCollapsed] = useState(getDevPanelCollapsed);
  const [devPanelPosition, setDevPanelPosition] = useState(getDevPanelPosition);
  const devPerformanceStats = useDevPerformanceStats(showDevPanel);
  const devPanelRef = useRef<HTMLDivElement | null>(null);
  const devPanelDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    latestPosition: DevPanelPosition;
  } | null>(null);

  const openPassword = useCallback(() => {
    setDevPassword("");
    setDevPasswordError(null);
    setShowDevPassword(true);
  }, []);

  const setDevPanelVisibility = useCallback((visible: boolean) => {
    setShowDevPanel(visible);
    setDevPanelVisibilityStorage(visible);
  }, []);

  const setDevPanelCollapse = useCallback((collapsed: boolean) => {
    setDevPanelCollapsed(collapsed);
    setDevPanelCollapsedStorage(collapsed);
  }, []);

  const getDevPanelSize = useCallback(() => {
    const panel = devPanelRef.current;
    return {
      width: panel?.offsetWidth ?? 320,
      height: panel?.offsetHeight ?? (devPanelCollapsed ? 56 : 520),
    };
  }, [devPanelCollapsed]);

  const handleDevPanelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    devPanelDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: devPanelPosition.x,
      originY: devPanelPosition.y,
      latestPosition: devPanelPosition,
    };
  };

  const handleDevPanelPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = devPanelDragRef.current;
    if (!drag) return;

    const nextPosition = clampDevPanelPosition(
      {
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      },
      getDevPanelSize()
    );

    drag.latestPosition = nextPosition;
    setDevPanelPosition(nextPosition);
  };

  const stopDevPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = devPanelDragRef.current;
    if (!drag) return;
    devPanelDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    saveDevPanelPosition(drag.latestPosition);
  };

  const unlockDevPanel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (devPassword === "godmode") {
      setShowDevPassword(false);
      setDevPanelVisibility(true);
      setDevPassword("");
      setDevPasswordError(null);
      return;
    }
    setDevPasswordError("Mauvais mot de passe.");
  };

  const setDevReveal = async (reveal: boolean) => {
    setDevRevealMap(reveal);
    if (!gameId) return;
    const refreshedState = await refreshGameState(gameId, session?.user?.id, { revealMap: reveal });
    if (refreshedState) setGameState(refreshedState);
  };

  useEffect(() => {
    if (!showDevPanel) return;
    if (typeof window === "undefined") return;

    const clampPosition = () => {
      setDevPanelPosition((current) => {
        const nextPosition = clampDevPanelPosition(current, getDevPanelSize());
        saveDevPanelPosition(nextPosition);
        return nextPosition;
      });
    };

    clampPosition();
    window.addEventListener("resize", clampPosition);

    return () => window.removeEventListener("resize", clampPosition);
  }, [showDevPanel, getDevPanelSize]);

  const overlay = (
    <>
      {showDevPassword && (
        <div className="pointer-events-auto absolute left-1/2 top-24 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-amber-500/60 bg-stone-950/95 p-4 text-amber-100 shadow-2xl shadow-black/70">
          <div className={`text-sm font-black uppercase tracking-[0.2em] ${goldText}`}>Mode dieu</div>
          <div className={goldDivider + " my-3"} />
          <form onSubmit={unlockDevPanel} className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-200/80">
              Mot de passe
              <input
                autoFocus
                type="password"
                value={devPassword}
                onChange={(event) => {
                  setDevPassword(event.target.value);
                  setDevPasswordError(null);
                }}
                className="mt-2 w-full rounded-md border border-amber-700/50 bg-black/70 px-3 py-2 text-sm text-amber-50 outline-none ring-0 transition focus:border-amber-300"
              />
            </label>
            {devPasswordError && <div className="text-xs font-bold text-red-300">{devPasswordError}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-stone-600 bg-stone-900 px-3 py-2 text-xs font-black uppercase tracking-wider text-stone-200 transition hover:border-stone-400"
                onClick={() => setShowDevPassword(false)}
              >
                Fermer
              </button>
              <button
                type="submit"
                className="rounded-md border border-amber-400/70 bg-amber-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-stone-950 transition hover:bg-amber-300"
              >
                Entrer
              </button>
            </div>
          </form>
        </div>
      )}

      {showDevPanel && (
        <div
          ref={devPanelRef}
          className="pointer-events-auto absolute z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-amber-500/60 bg-stone-950/95 text-amber-100 shadow-2xl shadow-black/70"
          style={{
            left: devPanelPosition.x,
            top: devPanelPosition.y,
            maxHeight: "calc(100vh - 1.5rem)",
          }}
        >
          <div
            className="flex cursor-move touch-none items-center justify-between gap-3 px-4 py-3"
            onPointerDown={handleDevPanelPointerDown}
            onPointerMove={handleDevPanelPointerMove}
            onPointerUp={stopDevPanelDrag}
            onPointerCancel={stopDevPanelDrag}
          >
            <div className={`min-w-0 truncate text-sm font-black uppercase tracking-[0.2em] ${goldText}`}>Mode DEV</div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md border border-amber-700/50 text-amber-200 transition hover:border-amber-300"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setDevPanelCollapse(!devPanelCollapsed)}
                aria-expanded={!devPanelCollapsed}
                aria-label={devPanelCollapsed ? "Deplier le mode DEV" : "Replier le mode DEV"}
                title={devPanelCollapsed ? "Deplier" : "Replier"}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 transition ${devPanelCollapsed ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md border border-amber-700/50 text-sm font-black text-amber-200 transition hover:border-amber-300"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setDevPanelVisibility(false)}
                aria-label="Fermer le mode DEV"
              >
                X
              </button>
            </div>
          </div>
          {!devPanelCollapsed && (
            <div className="max-h-[calc(100vh-6rem)] overflow-y-auto px-4 pb-4">
              <div className={goldDivider + " mb-3"} />
              <DevPerformancePanel stats={devPerformanceStats} />
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  className="w-full rounded-md border border-amber-400/70 bg-amber-500 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-stone-950 transition hover:bg-amber-300 disabled:cursor-default disabled:border-emerald-400/50 disabled:bg-emerald-900/70 disabled:text-emerald-100"
                  onClick={() => void setDevReveal(true)}
                  disabled={devRevealMap}
                >
                  {devRevealMap ? "Brouillard supprimé" : "Supprimer le brouillard"}
                </button>
                <button
                  type="button"
                  className="w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-amber-100 transition hover:border-amber-300"
                  onClick={() => void setDevReveal(false)}
                >
                  Remettre le brouillard
                </button>
                <a
                  href="/dev/map-showcase"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-amber-100 transition hover:border-amber-300"
                >
                  Showcase carte
                </a>
                <a
                  href="/dev/sprites"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-amber-100 transition hover:border-amber-300"
                >
                  Galerie des sprites
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return { openPassword, overlay };
}
