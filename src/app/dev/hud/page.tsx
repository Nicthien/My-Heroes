"use client";

import { useEffect } from "react";
import AdminObserverPanel from "@/components/game/admin/AdminObserverPanel";
import HUD from "@/components/game/hud/HUD";
import { AuthContext } from "@/lib/auth/client";
import { gameRulesSeenKey, TUTORIAL_SEEN_KEY } from "@/components/game/hud/helpers";
import { useGameStore } from "@/lib/stores/gameStore";
import { buildMockState, mockAuthValue } from "./mockState";

export default function DevHudPage() {
  const adminObserverMode = useGameStore((state) => state.adminObserverMode);

  useEffect(() => {
    const mockState = buildMockState();
    const params = new URLSearchParams(window.location.search);
    const adminObserver = params.get("admin") === "1";
    // The rules popup and the guided tutorial would both cover the HUD; suppress
    // them by default so HUD previews/tests aren't blocked. `?rules=1` shows the
    // rules popup; `?tutorial=1` shows the guided tour (with rules suppressed).
    const rulesKey = gameRulesSeenKey(mockState.id, "p1");
    const showRules = params.get("rules") === "1";
    const showTutorial = params.get("tutorial") === "1";
    if (showRules) window.localStorage.removeItem(rulesKey);
    else window.localStorage.setItem(rulesKey, "true");
    if (showTutorial) window.localStorage.removeItem(TUTORIAL_SEEN_KEY);
    else window.localStorage.setItem(TUTORIAL_SEEN_KEY, "true");
    const gameState = adminObserver
      ? {
          ...mockState,
          players: mockState.players.map((player) => ({
            ...player,
            userId: player.userId === mockAuthValue.data.user.id ? "observed-user" : player.userId,
          })),
        }
      : mockState;
    useGameStore.getState().setAdminObserverMode(adminObserver);
    useGameStore.getState().setGameState({
      ...gameState,
      status: params.get("status") === "pending" ? "PENDING" : gameState.status,
    });
    useGameStore.getState().selectHero("h1");
    return () => {
      useGameStore.getState().setAdminObserverMode(false);
    };
  }, []);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <div className="game-shell relative bg-gradient-to-br from-emerald-900 via-stone-800 to-slate-900">
        {/* Fake map backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 40%, #65a30d 0, transparent 40%), radial-gradient(circle at 70% 60%, #1e3a8a 0, transparent 35%), radial-gradient(circle at 50% 80%, #78350f 0, transparent 40%)",
          }}
        />
        <HUD />
        {adminObserverMode && <AdminObserverPanel />}
      </div>
    </AuthContext.Provider>
  );
}
