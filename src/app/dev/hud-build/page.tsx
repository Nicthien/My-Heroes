"use client";

import { useEffect } from "react";
import HUD from "@/components/game/hud/HUD";
import { AuthContext } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";
import { buildMockState, mockAuthValue } from "../hud/mockState";

export default function DevHudBuildPage() {
  useEffect(() => {
    useGameStore.getState().setGameState(buildMockState());
    useGameStore.getState().selectTown("t1");
  }, []);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <div className="relative h-screen w-screen overflow-hidden bg-gradient-to-br from-emerald-900 via-stone-800 to-slate-900">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 40%, #65a30d 0, transparent 40%), radial-gradient(circle at 70% 60%, #1e3a8a 0, transparent 35%), radial-gradient(circle at 50% 80%, #78350f 0, transparent 40%)",
          }}
        />
        <HUD />
      </div>
    </AuthContext.Provider>
  );
}
