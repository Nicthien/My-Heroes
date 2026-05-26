"use client";

import { type FormEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
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

type DevPanelTab = "performances" | "dev" | "cheats";

const DEV_TABS: Array<{ id: DevPanelTab; label: string }> = [
  { id: "performances", label: "Performances" },
  { id: "dev", label: "Dev" },
  { id: "cheats", label: "Cheats" },
];

const DEV_ROUTES = [
  { href: "/dev/dashboard", label: "Dashboard dev" },
  { href: "/dev/hud", label: "HUD de test" },
  { href: "/dev/combat", label: "Combats de test" },
  { href: "/dev/map-showcase", label: "Carte des tests" },
  { href: "/dev/sprites", label: "Galerie de sprites" },
  { href: "/dev/rmg", label: "RMG" },
];

export function useDevPanel(gameId: string | undefined) {
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const setGameState = useGameStore((state) => state.setGameState);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const setDevRevealMap = useGameStore((state) => state.setDevRevealMap);
  const devGodMode = useGameStore((state) => state.devGodMode);
  const setDevGodMode = useGameStore((state) => state.setDevGodMode);
  const devInfiniteMana = useGameStore((state) => state.devInfiniteMana);
  const setDevInfiniteMana = useGameStore((state) => state.setDevInfiniteMana);
  const devTeleportArmed = useGameStore((state) => state.devTeleportArmed);
  const setDevTeleportArmed = useGameStore((state) => state.setDevTeleportArmed);

  const [showDevPassword, setShowDevPassword] = useState(false);
  const [devPassword, setDevPassword] = useState("");
  const [devPasswordError, setDevPasswordError] = useState<string | null>(null);
  const [showDevPanel, setShowDevPanel] = useState(getDevPanelVisible);
  const [devPanelCollapsed, setDevPanelCollapsed] = useState(getDevPanelCollapsed);
  const [devPanelPosition, setDevPanelPosition] = useState(getDevPanelPosition);
  const [activeTab, setActiveTab] = useState<DevPanelTab>("performances");
  const devPerformanceStats = useDevPerformanceStats(showDevPanel);
  const devFpsText = devPerformanceStats.hasFrameSample
    ? `${Math.round(devPerformanceStats.fps)} FPS`
    : "-- FPS";
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

  const toggleDevReveal = () => void setDevReveal(!devRevealMap);

  const grantResources = async () => {
    if (!gameId) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DEV_GRANT_RESOURCES" }),
    });
    if (!response.ok) {
      setCombatMessage("Impossible d'ajouter les ressources.");
      return;
    }
    const refreshedState = await refreshGameState(gameId, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
    setCombatMessage("+1000 pour chaque ressource.");
  };

  const grantHeroExperience = async () => {
    if (!gameId || !selectedHeroId) {
      setCombatMessage("Sélectionnez un héros avant d'ajouter de l'XP.");
      return;
    }
    const response = await fetchWithSupabaseAuth(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DEV_GRANT_HERO_XP", heroId: selectedHeroId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCombatMessage(data.error ?? "Impossible d'ajouter l'XP.");
      return;
    }
    const refreshedState = await refreshGameState(gameId, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
    setCombatMessage("+500 XP pour le héros sélectionné.");
  };

  const grantHeroSkills = async () => {
    if (!gameId || !selectedHeroId) {
      setCombatMessage("Sélectionnez un héros avant d'ajouter les compétences.");
      return;
    }
    const response = await fetchWithSupabaseAuth(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DEV_GRANT_HERO_SKILLS", heroId: selectedHeroId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCombatMessage(data.error ?? "Impossible d'ajouter les compétences.");
      return;
    }
    const refreshedState = await refreshGameState(gameId, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
    setCombatMessage("Toutes les compétences du héros sont au niveau expert.");
  };

  const toggleTeleport = () => {
    if (!selectedHeroId) {
      setCombatMessage("Sélectionnez un héros avant d'armer la téléportation.");
      return;
    }
    setDevTeleportArmed(!devTeleportArmed);
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
                className="rounded-md border border-stone-600 bg-stone-900 px-3 py-1.5 text-[10px] font-black uppercase leading-snug tracking-wide text-stone-200 transition hover:border-stone-400"
                onClick={() => setShowDevPassword(false)}
              >
                Fermer
              </button>
              <button
                type="submit"
                className="rounded-md border border-amber-400/70 bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase leading-snug tracking-wide text-stone-950 transition hover:bg-amber-300"
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
            <div className="flex min-w-0 items-center gap-2">
              <div className={`min-w-0 truncate text-xs font-black uppercase tracking-[0.18em] ${goldText}`}>Mode DEV</div>
              <div className="shrink-0 rounded border border-amber-700/50 bg-black/35 px-2 py-0.5 font-mono text-[10px] font-black leading-none text-amber-100">
                {devFpsText}
              </div>
            </div>
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
              <div className="grid grid-cols-3 gap-1 rounded-md border border-amber-900/45 bg-black/30 p-1">
                {DEV_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`min-w-0 rounded px-1 py-1.5 text-[8px] font-black uppercase leading-none tracking-normal transition ${
                      activeTab === tab.id
                        ? "bg-amber-500 text-stone-950"
                        : "text-amber-200/75 hover:bg-amber-950/60 hover:text-amber-100"
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {activeTab === "performances" && <DevPerformancePanel stats={devPerformanceStats} />}

                {activeTab === "dev" && (
                  <div className="space-y-2">
                    {DEV_ROUTES.map((route) => (
                      <a
                        key={route.href}
                        href={route.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide text-amber-100 transition hover:border-amber-300"
                      >
                        {route.label}
                      </a>
                    ))}
                  </div>
                )}

                {activeTab === "cheats" && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className={`w-full rounded-md border px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide transition ${
                        devRevealMap
                          ? "border-emerald-400/50 bg-emerald-900/70 text-emerald-100 hover:border-emerald-200"
                          : "border-amber-400/70 bg-amber-500 text-stone-950 hover:bg-amber-300"
                      }`}
                      onClick={toggleDevReveal}
                    >
                      {devRevealMap ? "Masquer la carte" : "Afficher la carte"}
                    </button>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide transition ${
                        devGodMode
                          ? "border-emerald-400/50 bg-emerald-900/70 text-emerald-100 hover:border-emerald-200"
                          : "border-amber-700/50 bg-stone-900 text-amber-100 hover:border-amber-300"
                      }`}
                      onClick={() => setDevGodMode(!devGodMode)}
                    >
                      {devGodMode ? "Mode dieu actif" : "Activer le mode dieu"}
                    </button>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide transition ${
                        devInfiniteMana
                          ? "border-violet-300/70 bg-violet-950 text-violet-100 hover:border-violet-100"
                          : "border-amber-700/50 bg-stone-900 text-amber-100 hover:border-amber-300"
                      }`}
                      onClick={() => setDevInfiniteMana(!devInfiniteMana)}
                    >
                      {devInfiniteMana ? "Mana infini actif" : "Activer mana infini"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide text-amber-100 transition hover:border-amber-300 disabled:cursor-default disabled:opacity-50"
                      onClick={() => void grantResources()}
                      disabled={!gameId}
                    >
                      Donner +1000 ressources
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide text-amber-100 transition hover:border-amber-300 disabled:cursor-default disabled:opacity-50"
                      onClick={() => void grantHeroExperience()}
                      disabled={!gameId || !selectedHeroId}
                    >
                      Donner +500 XP au héros
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide text-amber-100 transition hover:border-amber-300 disabled:cursor-default disabled:opacity-50"
                      onClick={() => void grantHeroSkills()}
                      disabled={!gameId || !selectedHeroId}
                    >
                      Donner tous les skills
                    </button>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide transition ${
                        devTeleportArmed
                          ? "border-sky-300/70 bg-sky-950 text-sky-100 hover:border-sky-100"
                          : "border-amber-700/50 bg-stone-900 text-amber-100 hover:border-amber-300"
                      }`}
                      onClick={toggleTeleport}
                    >
                      {devTeleportArmed ? "Téléportation armée" : "Téléporter au prochain clic"}
                    </button>
                    <div className="rounded-md border border-amber-900/45 bg-black/30 px-2.5 py-1.5 text-[10px] font-semibold leading-snug text-amber-200/75">
                      Héros cible : {getSelectedHeroName(gameState, selectedHeroId)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return { openPassword, overlay };
}

function getSelectedHeroName(
  gameState: ReturnType<typeof useGameStore.getState>["gameState"],
  selectedHeroId: string | null
) {
  if (!selectedHeroId) return "aucun";
  const hero = gameState?.players.flatMap((player) => player.heroes).find((item) => item.id === selectedHeroId);
  return hero?.name ?? selectedHeroId;
}
