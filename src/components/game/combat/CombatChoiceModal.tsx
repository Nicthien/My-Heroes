"use client";

import { useCallback, useEffect, useRef } from "react";
import { fetchWithSupabaseAuth } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";

export default function CombatChoiceModal() {
  const { gameState, pendingCombat, setPendingCombat, setActiveCombat, setCombatResult, setGameState, setCombatMessage } = useGameStore();
  const autoStartedRef = useRef<string | null>(null);
  const pendingKey = pendingCombat ? `${pendingCombat.attackerHeroId}:${pendingCombat.targetId}:${pendingCombat.targetType}` : null;

  const startCombat = useCallback(async (mode: "AUTO" | "MANUAL") => {
    if (!gameState || !pendingCombat) return;

    // Optimistic hero movement to combat destination
    if (pendingCombat.destination && pendingCombat.path) {
      const { destination, path } = pendingCombat;
      const usedMovement = path.slice(1).reduce((total, p) => {
        const t = gameState.map.tiles[p.y]?.[p.x];
        return total + (t?.movementCost ?? 1);
      }, 0);
      setGameState({
        ...gameState,
        players: gameState.players.map((player) => ({
          ...player,
          heroes: player.heroes.map((hero) =>
            hero.id === pendingCombat.attackerHeroId
              ? { ...hero, position: destination, movement: Math.max(0, (hero.movement ?? 0) - usedMovement) }
              : hero
          ),
        })),
      });
    }

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/combats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        attackerHeroId: pendingCombat.attackerHeroId,
        targetId: pendingCombat.targetId,
        targetType: pendingCombat.targetType,
        destination: pendingCombat.destination,
        path: pendingCombat.path,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setCombatMessage(data?.error ?? "Combat impossible.");
      setPendingCombat(null);
      return;
    }

    const data = await response.json();
    setPendingCombat(null);
    const combatPayload = data.combat ?? data;
    if (data.result) setCombatResult(data.result);
    if (mode === "MANUAL" && combatPayload) setActiveCombat(mapCombat(combatPayload));
    // No refreshGameState — the heroes table update triggers realtime → loadGame handles full sync
  }, [gameState, pendingCombat, setActiveCombat, setCombatMessage, setCombatResult, setGameState, setPendingCombat]);

  useEffect(() => {
    if (!pendingCombat || !pendingKey) return;
    if (pendingCombat.targetType !== "hero") return;
    if (autoStartedRef.current === pendingKey) return;
    autoStartedRef.current = pendingKey;
    void startCombat("MANUAL");
  }, [pendingCombat, pendingKey, startCombat]);

  if (!gameState || !pendingCombat) return null;

  if (pendingCombat.targetType === "hero") {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-auto">
        <div className="rounded-xl border border-red-700 bg-stone-950 p-6 text-white shadow-2xl">
          <div className="text-xs uppercase tracking-[0.28em] text-red-400">Combat joueur contre joueur</div>
          <div className="mt-2 text-xl font-bold text-red-100">Ouverture du combat manuel...</div>
          <div className="mt-2 text-sm text-stone-300">Les combats entre joueurs ne peuvent pas être résolus automatiquement.</div>
        </div>
      </div>
    );
  }

  const isBuilding = pendingCombat.targetType === "building";

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-auto">
      <div className="w-[min(92vw,34rem)] rounded-xl border border-yellow-700 bg-stone-950 p-6 shadow-2xl shadow-black text-white">
        <div className="text-xs uppercase tracking-[0.28em] text-yellow-500">
          {isBuilding ? "Gardiens du bâtiment" : "Engagement"}
        </div>
        <h2 className="mt-2 text-2xl font-bold text-yellow-100">Choisir la résolution du combat</h2>
        <p className="mt-3 text-sm text-stone-300">
          {isBuilding
            ? "Ce bâtiment est défendu par des gardiens. Battez-les pour en prendre le contrôle."
            : "Le combat sera visible sur la carte générale. En mode manuel, les deux joueurs rejoignent le plateau tactique synchrone."}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button className="rounded-lg border border-blue-500 bg-blue-950/80 p-4 text-left hover:bg-blue-900" onClick={() => startCombat("AUTO")}>
            <div className="font-bold text-blue-100">Automatique</div>
            <div className="mt-1 text-sm text-blue-200/80">Résolution immédiate selon les puissances, pertes et héros.</div>
          </button>
          <button className="rounded-lg border border-red-500 bg-red-950/80 p-4 text-left hover:bg-red-900" onClick={() => startCombat("MANUAL")}>
            <div className="font-bold text-red-100">Manuel</div>
            <div className="mt-1 text-sm text-red-200/80">Plateau hexagonal, tours par vitesse, attaques et ripostes.</div>
          </button>
        </div>
        <button className="mt-5 text-sm text-stone-400 hover:text-white" onClick={() => setPendingCombat(null)}>
          Annuler
        </button>
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
  };
}
