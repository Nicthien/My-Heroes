"use client";

import { useEffect } from "react";
import { AuthContext } from "@/lib/auth/client";
import { HeroMeetDialog } from "@/components/game/hud/HeroMeetDialog";
import { useGameStore } from "@/lib/stores/gameStore";
import { Faction } from "@/lib/game/types";
import { buildMockState, mockAuthValue } from "../hud/mockState";

export default function DevHeroMeetPage() {
  useEffect(() => {
    const state = buildMockState();
    const p1 = state.players[0];
    const adjusted = {
      ...state,
      players: state.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              heroes: player.heroes.map((hero, hi) =>
                hi === 0
                  ? { ...hero, position: { x: 5, y: 5 }, armies: hero.armies.slice(0, 4) }
                  : hi === 1
                  ? { ...hero, position: { x: 5, y: 6 } }
                  : hero,
              ),
            }
          : player,
      ),
    };
    useGameStore.getState().setGameState(adjusted);
    useGameStore.getState().setPendingHeroMeet({ leftHeroId: p1.heroes[0].id, rightHeroId: p1.heroes[1].id });
    return () => {
      useGameStore.getState().setPendingHeroMeet(null);
    };
  }, []);

  const gameState = useGameStore((state) => state.gameState);
  const meet = useGameStore((state) => state.pendingHeroMeet);
  const setPendingHeroMeet = useGameStore((state) => state.setPendingHeroMeet);

  const player = gameState?.players[0];
  const left = player?.heroes.find((h) => h.id === meet?.leftHeroId);
  const right = player?.heroes.find((h) => h.id === meet?.rightHeroId);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-emerald-900 via-stone-800 to-slate-900 text-amber-100">
        <div className="text-center text-sm font-bold text-amber-200/60">
          Page de prévisualisation : Rencontre de héros
        </div>
        {left && right && (
          <HeroMeetDialog
            leftHero={left}
            rightHero={right}
            ownerFaction={Faction.CASTLE}
            onClose={() => setPendingHeroMeet(null)}
          />
        )}
      </div>
    </AuthContext.Provider>
  );
}
