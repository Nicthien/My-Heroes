"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";
import { goldDivider, goldText } from "./theme";
import {
  DEV_PANEL_MARGIN,
  DevPerformancePanel,
  type DevPanelPosition,
  clampDevPanelPosition,
  getDevPanelCollapsed,
  getDevPanelPosition,
  saveDevPanelPosition,
  setDevPanelCollapsedStorage,
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
  { href: "/dev/hud-build", label: "HUD construction" },
  { href: "/dev/combat", label: "Combats de test" },
  { href: "/dev/combat-modals", label: "Modals de combat" },
  { href: "/dev/map-showcase", label: "Carte des tests" },
  { href: "/dev/sprites", label: "Galerie de sprites" },
  { href: "/dev/rmg", label: "RMG" },
  { href: "/dev/ai", label: "IA" },
  { href: "/dev/sound", label: "Banc d'essai audio" },
  { href: "/dev/leaderboard", label: "Classement" },
  { href: "/dev/admin-observer", label: "Observateur admin" },
];

export function useDevPanel(gameId: string | undefined) {
  const { data: session } = useSession();
  const { t } = useI18n();
  const [profileGodModeEnabled, setProfileGodModeEnabled] = useState(Boolean(session?.user?.godModeEnabled));
  const isGodModeEnabled = profileGodModeEnabled;
  const gameState = useGameStore((state) => state.gameState);
  const setGameState = useGameStore((state) => state.setGameState);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const setDevRevealMap = useGameStore((state) => state.setDevRevealMap);
  const devInfiniteMana = useGameStore((state) => state.devInfiniteMana);
  const setDevInfiniteMana = useGameStore((state) => state.setDevInfiniteMana);
  const devTeleportArmed = useGameStore((state) => state.devTeleportArmed);
  const setDevTeleportArmed = useGameStore((state) => state.setDevTeleportArmed);
  const devGodMode = useGameStore((state) => state.devGodMode);
  const setDevGodMode = useGameStore((state) => state.setDevGodMode);

  const [devPanelCollapsed, setDevPanelCollapsed] = useState(getDevPanelCollapsed);
  const [devPanelPosition, setDevPanelPosition] = useState(getDevPanelPosition);
  const [activeTab, setActiveTab] = useState<DevPanelTab>("performances");
  const devPerformanceStats = useDevPerformanceStats(true);
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

  useEffect(() => {
    if (!session?.user?.id) {
      const timeout = window.setTimeout(() => setProfileGodModeEnabled(false), 0);
      return () => window.clearTimeout(timeout);
    }

    let cancelled = false;
    const loadGodMode = async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/auth/profile", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json().catch(() => null);
        if (!cancelled) setProfileGodModeEnabled(Boolean(data?.godModeEnabled));
      } catch {
        // Keep the last known value; profile polling must not disrupt the HUD.
      }
    };

    const syncTimeout = window.setTimeout(() => setProfileGodModeEnabled(Boolean(session.user.godModeEnabled)), 0);
    void loadGodMode();
    const interval = window.setInterval(() => void loadGodMode(), 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(syncTimeout);
      window.clearInterval(interval);
    };
  }, [session?.user?.id, session?.user?.godModeEnabled]);

  const setDevPanelCollapse = useCallback((collapsed: boolean) => {
    setDevPanelCollapsed(collapsed);
    setDevPanelCollapsedStorage(collapsed);
  }, []);

  const getDevPanelSize = useCallback(() => {
    const panel = devPanelRef.current;
    return {
      width: panel?.offsetWidth ?? (devPanelCollapsed ? 220 : 320),
      height: panel?.offsetHeight ?? (devPanelCollapsed ? 44 : 520),
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
      setCombatMessage(t("dev.resourcesFailed"));
      return;
    }
    const refreshedState = await refreshGameState(gameId, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
    setCombatMessage(t("dev.resourcesDone"));
  };

  const grantHeroExperience = async () => {
    if (!gameId || !selectedHeroId) {
      setCombatMessage(t("dev.selectHeroXp"));
      return;
    }
    const response = await fetchWithSupabaseAuth(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DEV_GRANT_HERO_XP", heroId: selectedHeroId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCombatMessage(data.error ?? t("dev.xpFailed"));
      return;
    }
    const refreshedState = await refreshGameState(gameId, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
    setCombatMessage(t("dev.xpDone"));
  };

  const grantHeroSkills = async () => {
    if (!gameId || !selectedHeroId) {
      setCombatMessage(t("dev.selectHeroSkills"));
      return;
    }
    const response = await fetchWithSupabaseAuth(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DEV_GRANT_HERO_SKILLS", heroId: selectedHeroId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCombatMessage(data.error ?? t("dev.skillsFailed"));
      return;
    }
    const refreshedState = await refreshGameState(gameId, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
    setCombatMessage(t("dev.skillsAllExpert"));
  };

  const toggleTeleport = () => {
    if (!selectedHeroId) {
      setCombatMessage(t("dev.selectHeroTeleport"));
      return;
    }
    setDevTeleportArmed(!devTeleportArmed);
  };

  useEffect(() => {
    if (!isGodModeEnabled) return;
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
  }, [isGodModeEnabled, getDevPanelSize]);

  const overlay = (
    <>
      {isGodModeEnabled && (
        <div
          ref={devPanelRef}
          className={`pointer-events-auto absolute z-50 max-w-[calc(100vw-1.5rem)] overflow-hidden border border-amber-500/60 bg-stone-950/95 text-amber-100 shadow-2xl shadow-black/70 ${
            devPanelCollapsed ? "w-fit rounded-lg" : "w-80 rounded-xl"
          }`}
          style={{
            left: devPanelPosition.x,
            top: devPanelPosition.y,
            maxHeight: "calc(100vh - 1.5rem)",
          }}
        >
          <div
            className={`flex cursor-move touch-none items-center justify-between ${
              devPanelCollapsed ? "gap-2 px-2.5 py-2" : "gap-3 px-4 py-3"
            }`}
            onPointerDown={handleDevPanelPointerDown}
            onPointerMove={handleDevPanelPointerMove}
            onPointerUp={stopDevPanelDrag}
            onPointerCancel={stopDevPanelDrag}
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className={`min-w-0 truncate font-black uppercase ${goldText} ${
                devPanelCollapsed ? "text-[10px] tracking-[0.14em]" : "text-xs tracking-[0.18em]"
              }`}>{t("hud.devMode")}</div>
              <div className={`shrink-0 rounded border border-amber-700/50 bg-black/35 font-mono font-black leading-none text-amber-100 ${
                devPanelCollapsed ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
              }`}>
                {devFpsText}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className={`grid place-items-center rounded-md border border-amber-700/50 text-amber-200 transition hover:border-amber-300 ${
                  devPanelCollapsed ? "h-6 w-6" : "h-7 w-7"
                }`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setDevPanelCollapse(!devPanelCollapsed)}
                aria-expanded={!devPanelCollapsed}
                aria-label={devPanelCollapsed ? t("dev.expandPanel") : t("dev.collapsePanel")}
                title={devPanelCollapsed ? t("panel.expand") : t("panel.collapse")}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`${devPanelCollapsed ? "h-3.5 w-3.5 rotate-180" : "h-4 w-4"} transition`}
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
                      {devRevealMap ? t("dev.hideMap") : t("dev.showMap")}
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
                      {devInfiniteMana ? t("dev.manaActive") : t("dev.manaEnable")}
                    </button>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide transition ${
                        devGodMode
                          ? "border-rose-300/70 bg-rose-950 text-rose-100 hover:border-rose-100"
                          : "border-amber-700/50 bg-stone-900 text-amber-100 hover:border-amber-300"
                      }`}
                      onClick={() => setDevGodMode(!devGodMode)}
                    >
                      {devGodMode ? t("dev.godModeActive") : t("dev.godModeEnable")}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide text-amber-100 transition hover:border-amber-300 disabled:cursor-default disabled:opacity-50"
                      onClick={() => void grantResources()}
                      disabled={!gameId}
                    >
                      {t("dev.giveResources")}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide text-amber-100 transition hover:border-amber-300 disabled:cursor-default disabled:opacity-50"
                      onClick={() => void grantHeroExperience()}
                      disabled={!gameId || !selectedHeroId}
                    >
                      {t("dev.giveXp")}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-1.5 text-left text-[10px] font-black uppercase leading-snug tracking-wide text-amber-100 transition hover:border-amber-300 disabled:cursor-default disabled:opacity-50"
                      onClick={() => void grantHeroSkills()}
                      disabled={!gameId || !selectedHeroId}
                    >
                      {t("dev.giveSkills")}
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
                      {devTeleportArmed ? t("dev.teleportArmed") : t("dev.teleportNextClick")}
                    </button>
                    <div className="rounded-md border border-amber-900/45 bg-black/30 px-2.5 py-1.5 text-[10px] font-semibold leading-snug text-amber-200/75">
                      {t("dev.targetHero", { name: getSelectedHeroName(gameState, selectedHeroId, t) })}
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

  return { fpsText: devFpsText, overlay };
}

function getSelectedHeroName(
  gameState: ReturnType<typeof useGameStore.getState>["gameState"],
  selectedHeroId: string | null,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
) {
  if (!selectedHeroId) return t("dev.noneHero");
  const hero = gameState?.players.flatMap((player) => player.heroes).find((item) => item.id === selectedHeroId);
  return hero?.name ?? selectedHeroId;
}
