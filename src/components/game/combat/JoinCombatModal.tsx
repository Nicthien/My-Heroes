"use client";

import { useCallback, useEffect, useRef } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";

export default function JoinCombatModal() {
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const pendingJoinCombat = useGameStore((state) => state.pendingJoinCombat);
  const setPendingJoinCombat = useGameStore((state) => state.setPendingJoinCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const setGameState = useGameStore((state) => state.setGameState);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const autoJoinRef = useRef<string | null>(null);

  const join = useCallback(async (side: "attacker" | "defender") => {
    if (!gameState || !pendingJoinCombat) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/combats/${pendingJoinCombat.combatId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heroId: pendingJoinCombat.heroId, side }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setCombatMessage(data?.error ?? "Impossible de rejoindre le combat.");
      setPendingJoinCombat(null);
      return;
    }
    const data = await response.json();
    const combatPayload = data.combat ?? data;
    if (combatPayload) setActiveCombat(mapCombat(combatPayload));
    setPendingJoinCombat(null);
    const refreshed = await refreshGameState(gameState.id, session?.user?.id);
    if (refreshed) setGameState(refreshed);
  }, [gameState, pendingJoinCombat, session?.user?.id, setActiveCombat, setCombatMessage, setGameState, setPendingJoinCombat]);

  useEffect(() => {
    if (!pendingJoinCombat) return;
    if (!pendingJoinCombat.side) return;
    const key = `${pendingJoinCombat.combatId}:${pendingJoinCombat.heroId}:${pendingJoinCombat.side}`;
    if (autoJoinRef.current === key) return;
    autoJoinRef.current = key;
    void join(pendingJoinCombat.side);
  }, [pendingJoinCombat, join]);

  if (!gameState || !pendingJoinCombat) return null;

  if (pendingJoinCombat.side) return null;

  const combat = gameState.activeCombats?.find((c) => c.id === pendingJoinCombat.combatId);
  const attackerPlayer = gameState.players.find((p) => p.id === combat?.attackerPlayerId);
  const defenderPlayer = combat?.defenderPlayerId
    ? gameState.players.find((p) => p.id === combat.defenderPlayerId)
    : null;
  const attackerLabel = attackerPlayer?.name ?? "Attaquant";
  const defenderLabel = defenderPlayer?.name ?? (combat?.neutralArmyId ? "Armée neutre" : "Défenseur");

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-auto">
      <div className="w-[min(92vw,32rem)] rounded-xl border border-yellow-700 bg-stone-950 p-6 text-white shadow-2xl">
        <div className="text-xs uppercase tracking-[0.28em] text-yellow-500">Renfort</div>
        <h2 className="mt-2 text-2xl font-bold text-yellow-100">Choisir le camp à soutenir</h2>
        <p className="mt-3 text-sm text-stone-300">Les unités de ce héros rejoindront le combat au prochain round.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-lg border border-blue-500 bg-blue-950/80 p-4 font-bold hover:bg-blue-900"
            onClick={() => join("attacker")}
          >
            <div>Soutenir l&apos;attaquant</div>
            <div className="mt-1 text-xs font-normal text-blue-200/80">{attackerLabel}</div>
          </button>
          <button
            className="rounded-lg border border-red-500 bg-red-950/80 p-4 font-bold hover:bg-red-900"
            onClick={() => join("defender")}
          >
            <div>Soutenir le défenseur</div>
            <div className="mt-1 text-xs font-normal text-red-200/80">{defenderLabel}</div>
          </button>
        </div>
        <button className="mt-5 text-sm text-stone-400 hover:text-white" onClick={() => setPendingJoinCombat(null)}>Annuler</button>
      </div>
    </div>
  );
}

function mapCombat(combat: Record<string, unknown>) {
  return {
    id: combat.id as string,
    gameId: combat.gameId as string,
    mode: combat.mode as "AUTO" | "MANUAL",
    status: combat.status as "ACTIVE" | "RESOLVED",
    attackerPlayerId: combat.attackerPlayerId as string,
    defenderPlayerId: combat.defenderPlayerId as string | null,
    attackerHeroId: combat.attackerHeroId as string,
    defenderHeroId: combat.defenderHeroId as string | null,
    neutralArmyId: combat.neutralArmyId as string | null,
    currentPlayerId: combat.currentPlayerId as string | null,
    currentUnitId: combat.currentUnitId as string | null,
    round: combat.round as number,
    position: { x: combat.x as number, y: combat.y as number },
    boardState: combat.boardState as never,
    turnQueue: combat.turnQueue as string[],
    actionLog: combat.actionLog as string[],
    participants: (combat.participants as never[]) ?? [],
    result: combat.result as never,
    visibility: (combat.visibility as "full" | "joinable_summary" | undefined) ?? "full",
  };
}
