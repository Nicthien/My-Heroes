"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession, getSupabaseAccessToken } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";
import HUD from "@/components/game/hud/HUD";
import CombatChoiceModal from "@/components/game/combat/CombatChoiceModal";
import CombatResultModal from "@/components/game/combat/CombatResultModal";
import CombatScreen from "@/components/game/combat/CombatScreen";
import JoinCombatModal from "@/components/game/combat/JoinCombatModal";
import { mapApiToGameState } from "@/lib/game/api";
import { createClient } from "@/lib/supabase/browser";

const GameMapComponent = dynamic(
  () => import("@/components/game/map/GameMap"),
  { ssr: false }
);

export default function GamePage() {
  const params = useParams();
  const gameId = params?.id as string;
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { setGameState, isLoading, gameState, activeCombat, minimizedCombatIds, setActiveCombat } = useGameStore();
  const [error, setError] = useState("");
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    useGameStore.getState().setLoading(true);
    if (useGameStore.getState().gameState?.id !== gameId) {
      useGameStore.getState().resetGame();
      useGameStore.getState().setLoading(true);
    }
    const fetchWithAuth = async (input: RequestInfo, init?: RequestInit) => {
      const token = await getSupabaseAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "include" });
    };

    const loadGame = async () => {
      if (!gameId) return;
      if (useGameStore.getState().isMovePending) return;
      setError("");
      const requestId = ++loadRequestIdRef.current;
      try {
        const res = await fetchWithAuth(`/api/games/${gameId}`, { cache: "no-store" });
        if (cancelled) return;
        if (requestId !== loadRequestIdRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (!data.mapData) {
            const { generateMap } = await import("@/lib/game/engine");
            data.mapData = generateMap(data.mapWidth, data.mapHeight);
          }
          const nextGameState = mapApiToGameState(data, userId);
          if (nextGameState.id === gameId) {
            setGameState(nextGameState);
          }
        } else {
          useGameStore.getState().resetGame();
          setError("Partie non trouvée");
        }
      } catch {
        if (cancelled) return;
        setError("Erreur de chargement");
      }
      if (!cancelled) {
        useGameStore.getState().setLoading(false);
      }
    };

    loadGame();
    const channel = supabase
      .channel(`game:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, loadGame)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` }, loadGame)
      .on("postgres_changes", { event: "*", schema: "public", table: "heroes" }, loadGame)
      .on("postgres_changes", { event: "*", schema: "public", table: "armies" }, loadGame)
      .on("postgres_changes", { event: "*", schema: "public", table: "towns" }, loadGame)
      .on("postgres_changes", { event: "*", schema: "public", table: "resource_buildings", filter: `game_id=eq.${gameId}` }, loadGame)
      .on("postgres_changes", { event: "*", schema: "public", table: "combats", filter: `game_id=eq.${gameId}` }, loadGame)
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_participants" }, loadGame)
      .subscribe();

    const interval = setInterval(loadGame, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [gameId, setGameState, userId]);

  useEffect(() => {
    if (!gameState || activeCombat) return;
    const myPlayer = gameState.players.find((player) => player.userId === userId);
    if (!myPlayer) return;
    const combat = gameState.activeCombats?.find((item) => {
      if (minimizedCombatIds.includes(item.id)) return false;
      return item.attackerPlayerId === myPlayer.id || item.defenderPlayerId === myPlayer.id || item.participants?.some((participant) => participant.playerId === myPlayer.id);
    });
    if (combat) setActiveCombat(combat);
  }, [gameState, userId, activeCombat, minimizedCombatIds, setActiveCombat]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">{error}</div>
      </div>
    );
  }

  if (isLoading || !gameState || gameState.id !== gameId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Chargement de la partie...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-900 relative overflow-hidden">
      <GameMapComponent />
      <HUD />
      <CombatChoiceModal />
      <JoinCombatModal />
      <CombatResultModal />
      {activeCombat && <CombatScreen />}
    </div>
  );
}
