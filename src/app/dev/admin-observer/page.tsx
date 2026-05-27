"use client";

import { useEffect } from "react";
import AdminObserverPanel from "@/components/game/admin/AdminObserverPanel";
import { AuthContext } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";
import { buildMockState, mockAuthValue } from "../hud/mockState";

const adminAuthValue = {
  ...mockAuthValue,
  data: {
    user: {
      ...mockAuthValue.data.user,
      role: "admin",
    },
  },
};

export default function DevAdminObserverPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mockState = buildMockState();
    useGameStore.getState().setAdminObserverMode(true);
    useGameStore.getState().setGameState({
      ...mockState,
      status: params.get("status") === "pending" ? "PENDING" : mockState.status,
    });
    return () => {
      useGameStore.getState().setAdminObserverMode(false);
    };
  }, []);

  return (
    <AuthContext.Provider value={adminAuthValue}>
      <div className="game-shell relative bg-gradient-to-br from-slate-950 via-cyan-950 to-stone-950">
        <div
          aria-hidden
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgba(14,116,144,0.35) 25%, transparent 25%), linear-gradient(-45deg, rgba(15,23,42,0.7) 25%, transparent 25%)",
            backgroundSize: "96px 96px",
          }}
        />
        <AdminObserverPanel />
      </div>
    </AuthContext.Provider>
  );
}
