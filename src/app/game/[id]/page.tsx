"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";
import HUD from "@/components/game/hud/HUD";
import CombatChoiceModal from "@/components/game/combat/CombatChoiceModal";
import CombatResultModal from "@/components/game/combat/CombatResultModal";
import CombatScreen from "@/components/game/combat/CombatScreen";
import ActiveCombatsPanel from "@/components/game/combat/ActiveCombatsPanel";
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

  useEffect(() => {
    const supabase = createClient();
    const loadGame = async () => {
      if (!gameId) return;
      setError("");
      const hadGameState = Boolean(useGameStore.getState().gameState);
      if (!hadGameState) {
        useGameStore.getState().setLoading(true);
      }
      try {
        const res = await fetch(`/api/games/${gameId}`);
        if (res.ok) {
          const data = await res.json();
          if (!data.mapData) {
            const { generateMap } = await import("@/lib/game/engine");
            data.mapData = generateMap(data.mapWidth, data.mapHeight);
          }
          setGameState(mapApiToGameState(data, userId));
        } else {
          useGameStore.getState().resetGame();
          setError("Partie non trouvée");
        }
      } catch {
        setError("Erreur de chargement");
      }
      if (!hadGameState) {
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

    const interval = setInterval(loadGame, 30000);
    return () => {
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

  if (isLoading || !gameState) {
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
      <ActiveCombatsPanel />
      <CombatChoiceModal />
      <JoinCombatModal />
      <CombatResultModal />
      {activeCombat && <CombatScreen />}
    </div>
  );
}
