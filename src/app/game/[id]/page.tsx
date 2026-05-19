"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import CombatChoiceModal from "@/components/game/combat/CombatChoiceModal";
import CombatResultModal from "@/components/game/combat/CombatResultModal";
import CombatScreen from "@/components/game/combat/CombatScreen";
import JoinCombatModal from "@/components/game/combat/JoinCombatModal";
import HUD from "@/components/game/hud/HUD";
import { getCachedStaticGameMap, mapApiToGameState, setCachedStaticGameMap } from "@/lib/game/api";
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
  const gameId = params?.id as string;
  const { data: session } = useSession();
  const userId = session?.user?.id;
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

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const hasExistingGame = useGameStore.getState().gameState?.id === gameId;
    let restoredCachedGame = false;

    if (!hasExistingGame) {
      useGameStore.getState().resetGame();
      const cached = readCachedGameState(gameId, userId, { revealMap: devRevealMap });
      if (cached) {
        beginLoading("Restauration de la partie locale...", 24);
        setCachedStaticGameMap(gameId, cached.staticMap);
        setGameState(cached.gameState);
        restoredCachedGame = true;
      } else {
        beginLoading("Connexion a la partie...", 8);
      }
    }

    const bootstrapGame = async () => {
      if (!gameId) return;

      setError("");
      const requestId = ++loadRequestIdRef.current;

      try {
        useGameStore.getState().updateLoadingProgress(18, "Synchronisation de la partie...");
        const res = await fetchWithSupabaseAuth(`/api/games/${gameId}`, { cache: "no-store" });
        if (cancelled || requestId !== loadRequestIdRef.current) return;

        if (res.ok) {
          useGameStore.getState().updateLoadingProgress(38, "Lecture des donnees de carte...");
          const data = await res.json();

          if (!data.mapData) {
            useGameStore.getState().updateLoadingProgress(48, "Generation de la carte...");
            const { generateMap } = await import("@/lib/game/engine");
            data.mapData = generateMap(data.mapWidth, data.mapHeight);
          }

          useGameStore.getState().updateLoadingProgress(62, "Preparation de la partie...");
          const nextGameState = mapApiToGameState(data, userId, { revealMap: devRevealMap });
          if (nextGameState.id === gameId) {
            setGameState(nextGameState);
            writeCachedGameState(nextGameState, userId, getCachedStaticGameMap(gameId), { revealMap: devRevealMap });
            useGameStore.getState().updateLoadingProgress(72, "Initialisation du rendu...");
          }
        } else {
          useGameStore.getState().resetGame();
          setError("Partie non trouvee");
        }
      } catch {
        if (cancelled) return;
        setError("Erreur de chargement");
      }

      if (!cancelled && !useGameStore.getState().gameState) {
        setLoading(false);
      }
    };

    const syncGame = async () => {
      if (!gameId) return;
      if (useGameStore.getState().isMovePending) return;

      const requestId = ++loadRequestIdRef.current;

      try {
        const nextGameState = await refreshGameState(gameId, userId, { revealMap: devRevealMap });
        if (cancelled || requestId !== loadRequestIdRef.current || !nextGameState) return;
        if (nextGameState.id === gameId) {
          setGameState(nextGameState);
          writeCachedGameState(nextGameState, userId, getCachedStaticGameMap(gameId), { revealMap: devRevealMap });
        }
      } catch {
        if (!cancelled && !useGameStore.getState().gameState) {
          setError("Erreur de chargement");
        }
      }
    };

    if (hasExistingGame || restoredCachedGame) {
      void syncGame();
    } else {
      void bootstrapGame();
    }
    const channel = isUsingSupabaseProxy()
      ? null
      : supabase
          .channel(`game:${gameId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "heroes" }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "armies" }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "towns" }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "resource_buildings", filter: `game_id=eq.${gameId}` }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "gates", filter: `game_id=eq.${gameId}` }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "gate_stacks" }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "combats", filter: `game_id=eq.${gameId}` }, () => void syncGame())
          .on("postgres_changes", { event: "*", schema: "public", table: "combat_participants" }, () => void syncGame())
          .subscribe();

    const interval = setInterval(syncGame, isUsingSupabaseProxy() ? 1000 : 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [beginLoading, devRevealMap, gameId, setGameState, setLoading, userId]);

  useEffect(() => {
    if (!gameState || activeCombat || lastCombatResult) return;

    const myPlayer = gameState.players.find((player) => player.userId === userId);
    if (!myPlayer) return;

    const combat = gameState.activeCombats?.find((item) => {
      if (item.status !== "ACTIVE") return false;
      if (minimizedCombatIds.includes(item.id)) return false;
      if (item.visibility === "joinable_summary") return false;
      return item.attackerPlayerId === myPlayer.id
        || item.defenderPlayerId === myPlayer.id
        || item.participants?.some((participant) => participant.playerId === myPlayer.id);
    });

    if (combat) setActiveCombat(combat);
  }, [gameState, userId, activeCombat, minimizedCombatIds, setActiveCombat, lastCombatResult]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">{error}</div>
      </div>
    );
  }

  const progressValue = clampProgress(loadingProgress);
  const showLoadingOverlay = isLoading || !gameState || gameState.id !== gameId;

  return (
    <div className="h-screen w-screen bg-gray-900 relative overflow-hidden">
      {gameState && gameState.id === gameId ? (
        <>
          <GameMapComponent />
          <HUD />
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
                  Chargement
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
              aria-label="Chargement de la carte"
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
