"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useGameStore } from "@/lib/stores/gameStore";
import HUD from "@/components/game/hud/HUD";
import { mapApiToGameState } from "@/lib/game/api";

const GameMapComponent = dynamic(
  () => import("@/components/game/map/GameMap"),
  { ssr: false }
);

export default function GamePage() {
  const params = useParams();
  const gameId = params?.id as string;
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { setGameState, isLoading, gameState } = useGameStore();
  const [error, setError] = useState("");

  useEffect(() => {
    const loadGame = async () => {
      if (!gameId) return;
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
    const interval = setInterval(loadGame, 10000);
    return () => clearInterval(interval);
  }, [gameId, setGameState, userId]);

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
    </div>
  );
}
