"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import CombatChoiceModal from "@/components/game/combat/CombatChoiceModal";
import CombatResultModal from "@/components/game/combat/CombatResultModal";
import CombatScreen from "@/components/game/combat/CombatScreen";
import JoinCombatModal from "@/components/game/combat/JoinCombatModal";
import AdminObserverPanel from "@/components/game/admin/AdminObserverPanel";
import HUD from "@/components/game/hud/HUD";
import { getCachedStaticGameMap, mapApiToGameState, setCachedStaticGameMap } from "@/lib/game/api";
import { findActiveCombatTruce } from "@/lib/game/combat/truce";
import { readCachedGameState, writeCachedGameState } from "@/lib/game/local-cache";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";
import { createClient, isUsingSupabaseProxy } from "@/lib/supabase/browser";

const GameMapComponent = dynamic(
  () => import("@/components/game/map/GameMap"),
  { ssr: false }
);

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameId = params?.id as string;
  const { data: session } = useSession();
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const userId = session?.user?.id;
  const adminRequested = searchParams.get("admin") === "1";
  const adminObserverMode = session?.user?.role === "admin" && adminRequested;
  const setGameState = useGameStore((state) => state.setGameState);
  const isLoading = useGameStore((state) => state.isLoading);
  const loadingMessage = useGameStore((state) => state.loadingMessage);
  const loadingProgress = useGameStore((state) => state.loadingProgress);
  const gameState = useGameStore((state) => state.gameState);
  const activeCombat = useGameStore((state) => state.activeCombat);
  const minimizedCombatIds = useGameStore((state) => state.minimizedCombatIds);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const lastCombatResult = useGameStore((state) => state.lastCombatResult);
  const beginLoading = useGameStore((state) => state.beginLoading);
  const setLoading = useGameStore((state) => state.setLoading);
  const [error, setError] = useState("");
  const loadRequestIdRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const nextSyncAllowedAtRef = useRef(0);
  const syncFailureCountRef = useRef(0);

  useEffect(() => {
    useGameStore.getState().setAdminObserverMode(adminObserverMode);
    const revealMap = devRevealMap || adminObserverMode;
    const supabase = createClient();
    let cancelled = false;
    const hasExistingGame = useGameStore.getState().gameState?.id === gameId;
    let restoredCachedGame = false;

    if (!hasExistingGame) {
      useGameStore.getState().resetGame();
      useGameStore.getState().setAdminObserverMode(adminObserverMode);
      const cached = readCachedGameState(gameId, userId, { revealMap });
      if (cached) {
        beginLoading(tRef.current("game.loadingRestore"), 24);
        setCachedStaticGameMap(gameId, cached.staticMap);
        setGameState(cached.gameState);
        restoredCachedGame = true;
      } else {
        beginLoading(tRef.current("game.loadingConnect"), 8);
      }
    }

    const bootstrapGame = async () => {
      if (!gameId) return;

      setError("");
      const requestId = ++loadRequestIdRef.current;

      try {
        useGameStore.getState().updateLoadingProgress(18, tRef.current("game.loadingSync"));
        const res = await fetchWithSupabaseAuth(`/api/games/${gameId}${adminRequested ? "?admin=1&resumeAi=1" : ""}`, { cache: "no-store" });
        if (cancelled || requestId !== loadRequestIdRef.current) return;

        if (res.ok) {
          useGameStore.getState().updateLoadingProgress(38, tRef.current("game.loadingReadMap"));
          const data = await res.json();

          if (!data.mapData) {
            useGameStore.getState().updateLoadingProgress(48, tRef.current("game.loadingGenMap"));
            const { generateMap } = await import("@/lib/game/engine");
            data.mapData = generateMap(data.mapWidth, data.mapHeight);
          }

          useGameStore.getState().updateLoadingProgress(62, tRef.current("game.loadingPrepare"));
          const responseIsAdminObserver = data.viewerMode === "admin";
          useGameStore.getState().setAdminObserverMode(responseIsAdminObserver);
          const nextGameState = mapApiToGameState(data, userId, { revealMap: devRevealMap || responseIsAdminObserver });
          if (nextGameState.id === gameId) {
            setGameState(nextGameState);
            writeCachedGameState(nextGameState, userId, getCachedStaticGameMap(gameId), { revealMap: devRevealMap || responseIsAdminObserver });
            useGameStore.getState().updateLoadingProgress(72, tRef.current("game.loadingRender"));
          }
        } else {
          useGameStore.getState().resetGame();
          setError(tRef.current("game.notFound"));
        }
      } catch {
        if (cancelled) return;
        setError(tRef.current("game.loadError"));
      }

      if (!cancelled && !useGameStore.getState().gameState) {
        setLoading(false);
      }
    };

    const syncGame = async (resumeAi = false) => {
      if (!gameId) return;
      if (useGameStore.getState().isMovePending) return;
      if (syncInFlightRef.current) return;
      if (Date.now() < nextSyncAllowedAtRef.current) return;

      try {
        syncInFlightRef.current = true;
        const nextGameState = await refreshGameState(gameId, userId, { revealMap, adminObserver: adminRequested, resumeAi });
        if (cancelled || !nextGameState) {
          syncFailureCountRef.current += 1;
          nextSyncAllowedAtRef.current = Date.now() + Math.min(30_000, 2_000 * syncFailureCountRef.current);
          return;
        }
        syncFailureCountRef.current = 0;
        nextSyncAllowedAtRef.current = 0;
        if (nextGameState.id === gameId) {
          setGameState(nextGameState);
          writeCachedGameState(nextGameState, userId, getCachedStaticGameMap(gameId), { revealMap });
        }
      } catch {
        syncFailureCountRef.current += 1;
        nextSyncAllowedAtRef.current = Date.now() + Math.min(30_000, 2_000 * syncFailureCountRef.current);
        if (!cancelled && !useGameStore.getState().gameState) {
          setError(tRef.current("game.loadError"));
        }
      } finally {
        syncInFlightRef.current = false;
      }
    };

    const shouldResumeAdminAi = () => {
      if (!adminObserverMode) return false;
      const currentState = useGameStore.getState().gameState;
      if (!currentState || currentState.id !== gameId) return true;
      if (currentState.status !== "ACTIVE") return false;
      const currentPlayer = currentState.players.find((player) => player.id === currentState.currentTurnPlayerId);
      const hasActiveCombat = (currentState.activeCombats ?? []).some((combat) => combat.status === "ACTIVE");
      return Boolean(currentPlayer?.isAi || hasActiveCombat);
    };

    if (hasExistingGame || restoredCachedGame) {
      void syncGame(shouldResumeAdminAi());
    } else {
      void bootstrapGame();
    }
    // Realtime is notification-only: we subscribe to the lightweight `game_events`
    // row for this game (game_id + updated_at) and re-fetch the sanitized /sync
    // endpoint on any bump. Raw game tables are no longer streamed — see
    // migration 20260609000200_realtime_notify_only.sql.
    const channel = isUsingSupabaseProxy()
      ? null
      : supabase
          .channel(`game:${gameId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "game_events", filter: `game_id=eq.${gameId}` }, () => void syncGame(shouldResumeAdminAi()))
          .subscribe();

    const interval = setInterval(() => void syncGame(shouldResumeAdminAi()), adminObserverMode ? 3000 : isUsingSupabaseProxy() ? 5000 : 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [adminObserverMode, adminRequested, beginLoading, devRevealMap, gameId, setGameState, setLoading, userId]);

  useEffect(() => {
    if (!gameState || activeCombat || lastCombatResult) return;

    if (adminObserverMode) return;
    const myPlayer = gameState.players.find((player) => player.userId === userId);
    if (!myPlayer) return;

    const combat = gameState.activeCombats?.find((item) => {
      if (item.status !== "ACTIVE") return false;
      if (minimizedCombatIds.includes(item.id)) return false;
      if (item.visibility === "joinable_summary") return false;
      const activeTruce = findActiveCombatTruce(item.truces, gameState.turnNumber);
      if (activeTruce?.acknowledgedPlayerIds.includes(myPlayer.id)) return false;
      return item.attackerPlayerId === myPlayer.id
        || item.defenderPlayerId === myPlayer.id
        || item.participants?.some((participant) => participant.playerId === myPlayer.id);
    });

    if (combat) setActiveCombat(combat);
  }, [adminObserverMode, gameState, userId, activeCombat, minimizedCombatIds, setActiveCombat, lastCombatResult]);

  if (error) {
    const handleBack = () => {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/dashboard");
      }
    };

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="text-red-400 text-xl">{error}</div>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg border border-amber-700/50 bg-stone-950/80 px-5 py-2 text-sm font-black uppercase tracking-wider text-amber-200/90 shadow-inner shadow-black/40 transition hover:border-amber-400/70 hover:bg-amber-950/40 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300/70"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  const progressValue = clampProgress(loadingProgress);
  const showLoadingOverlay = isLoading || !gameState || gameState.id !== gameId;

  return (
    <div className="game-shell relative bg-gray-900">
      {gameState && gameState.id === gameId ? (
        <>
          <GameMapComponent />
          <HUD />
          {adminObserverMode && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-[70] -translate-x-1/2 rounded-md border border-cyan-300/50 bg-slate-950/80 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-cyan-100 shadow-2xl shadow-black/50">
              Mode observation
            </div>
          )}
          <AdminObserverPanel />
          <CombatChoiceModal />
          <JoinCombatModal />
          <CombatResultModal />
          {activeCombat && <CombatScreen />}
        </>
      ) : null}

      {showLoadingOverlay ? (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-gray-950/88 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-600/30 bg-slate-900/95 p-6 shadow-2xl shadow-black/60">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-300/80">
                  {t("game.loadingHeader")}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {loadingMessage}
                </p>
              </div>
              <div className="text-2xl font-bold text-amber-200 tabular-nums">
                {progressValue}%
              </div>
            </div>

            <div
              className="h-3 overflow-hidden rounded-full border border-amber-700/40 bg-black/60"
              role="progressbar"
              aria-label={t("game.loadingMapAria")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressValue}
            >
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,rgba(245,158,11,0.9)_0%,rgba(250,204,21,0.95)_45%,rgba(254,240,138,0.95)_100%)] transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(6, progressValue)}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
