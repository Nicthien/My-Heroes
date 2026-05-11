"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { CombatBoardUnit, PersistentCombat } from "@/lib/game/types";
import { getUnitRule } from "@/lib/game/units";
import { COMBAT_COLS, COMBAT_ROWS, getHexDistance } from "@/lib/game/combat/persistent";
import { useGameStore } from "@/lib/stores/gameStore";
import { refreshGameState } from "@/lib/game/refresh";

export default function CombatScreen() {
  const { data: session } = useSession();
  const { activeCombat, setActiveCombat, setCombatResult, setGameState, gameState, minimizeCombat } = useGameStore();

  useEffect(() => {
    if (!activeCombat) return;
    const interval = setInterval(async () => {
      const response = await fetch(`/api/games/${activeCombat.gameId}/combats/${activeCombat.id}`);
      if (!response.ok) return;
      const data = await response.json();
      const mapped = mapCombat(data);
      if (mapped.status === "RESOLVED") {
        setActiveCombat(null);
        if (mapped.result) setCombatResult(mapped.result);
        const refreshed = await refreshGameState(activeCombat.gameId, session?.user?.id);
        if (refreshed) setGameState(refreshed);
        return;
      }
      setActiveCombat(mapped);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeCombat, session?.user?.id, setActiveCombat, setCombatResult, setGameState]);

  if (!activeCombat || !gameState) return null;
  const myPlayer = gameState.players.find((player) => player.userId === session?.user?.id);
  const units = activeCombat.boardState.units;
  const currentUnit = units.find((unit) => unit.id === activeCombat.currentUnitId);
  const isMyAction = Boolean(myPlayer && activeCombat.currentPlayerId === myPlayer.id);

  const submitAction = async (action: Record<string, unknown>) => {
    const response = await fetch(`/api/games/${activeCombat.gameId}/combats/${activeCombat.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (!response.ok) return;
    const data = await response.json();
    const mapped = mapCombat(data.combat);
    if (data.result) {
      setActiveCombat(null);
      setCombatResult(data.result);
      const refreshed = await refreshGameState(activeCombat.gameId, session?.user?.id);
      if (refreshed) setGameState(refreshed);
    } else {
      setActiveCombat(mapped);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[radial-gradient(circle_at_center,#273c24,#10160f_70%)] text-white">
      <div className="flex items-center justify-between border-b border-yellow-800/70 bg-black/70 px-5 py-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-yellow-500">Combat manuel</div>
          <div className="text-lg font-bold">Round {activeCombat.round}</div>
        </div>
        <div className={`rounded px-3 py-1 text-sm font-bold ${isMyAction ? "bg-green-800 text-green-100" : "bg-red-950 text-red-200"}`}>
          {isMyAction ? "À vous de jouer" : "En attente de l'adversaire"}
        </div>
        <button className="rounded bg-stone-800 px-3 py-1 text-sm font-bold text-stone-200 hover:bg-stone-700" onClick={() => minimizeCombat(activeCombat.id)}>
          Réduire
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 items-center justify-center overflow-auto p-6">
          <HexGrid combat={activeCombat} isMyAction={isMyAction} onAction={submitAction} />
        </div>
        <aside className="w-80 border-l border-yellow-900/60 bg-black/60 p-4">
          <div className="font-bold text-yellow-100">Unité active</div>
          <div className="mt-2 rounded bg-stone-900 p-3 text-sm text-stone-300">
            {currentUnit ? <UnitDetails unit={currentUnit} /> : "Aucune"}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button disabled={!isMyAction} onClick={() => submitAction({ type: "WAIT" })} className="rounded bg-stone-700 px-3 py-2 font-bold disabled:opacity-40">Attendre</button>
            <button disabled={!isMyAction} onClick={() => submitAction({ type: "DEFEND" })} className="rounded bg-blue-800 px-3 py-2 font-bold disabled:opacity-40">Défendre</button>
          </div>
          <div className="mt-6 font-bold text-yellow-100">Journal</div>
          <div className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto text-sm text-stone-300">
            {activeCombat.actionLog.slice(-20).map((line, index) => <div key={index}>{line}</div>)}
          </div>
        </aside>
      </div>
    </div>
  );
}

function HexGrid({ combat, isMyAction, onAction }: { combat: PersistentCombat; isMyAction: boolean; onAction: (action: Record<string, unknown>) => void }) {
  const [pendingMove, setPendingMove] = useState<{ unitId: string; q: number; r: number; path: { q: number; r: number }[] } | null>(null);
  const units = combat.boardState.units;
  const currentUnit = units.find((unit) => unit.id === combat.currentUnitId);
  const occupied = new Set(units.map((unit) => `${unit.q},${unit.r}`));
  const activePendingMove = pendingMove?.unitId === combat.currentUnitId ? pendingMove : null;

  const cells = [];
  for (let r = 0; r < COMBAT_ROWS; r++) {
    for (let q = 0; q < COMBAT_COLS; q++) {
      const unit = units.find((item) => item.q === q && item.r === r);
      const distance = currentUnit ? getHexDistance(currentUnit, { q, r }) : 999;
      const path = currentUnit && !unit ? findHexPath(currentUnit, { q, r }, occupied) : [];
      const reachable = isMyAction && currentUnit && !unit && path.length > 1 && path.length - 1 <= currentUnit.speed;
      const isPendingDestination = activePendingMove?.q === q && activePendingMove.r === r;
      const isPendingPath = Boolean(activePendingMove?.path.some((step) => step.q === q && step.r === r));
      const attackable = isMyAction && currentUnit && unit && unit.side !== currentUnit.side && (distance <= 1 || (currentUnit.ranged && currentUnit.shots > 0));
      cells.push(
        <button
          key={`${q}-${r}`}
          className={`absolute flex h-12 w-14 items-center justify-center text-xs font-bold transition [clip-path:polygon(25%_0,75%_0,100%_50%,75%_100%,25%_100%,0_50%)] ${unit ? unit.side === "attacker" ? "bg-blue-700" : "bg-red-700" : isPendingDestination ? "bg-yellow-500 text-black ring-2 ring-white" : isPendingPath ? "bg-yellow-700/90" : reachable ? "bg-green-700/70 hover:bg-green-600" : "bg-black/35"} ${attackable ? "ring-2 ring-yellow-300" : ""} ${combat.currentUnitId === unit?.id ? "outline outline-2 outline-white" : ""}`}
          style={{ left: q * 45 + (r % 2) * 22, top: r * 42 }}
          disabled={!isMyAction || (!reachable && !attackable)}
          onClick={() => {
            if (attackable && unit) {
              setPendingMove(null);
              onAction({ type: distance <= 1 ? "ATTACK" : "SHOOT", targetUnitId: unit.id });
            } else if (reachable) {
              if (isPendingDestination) {
                setPendingMove(null);
                onAction({ type: "MOVE", q, r });
                return;
              }
              setPendingMove({ unitId: currentUnit.id, q, r, path });
            }
          }}
          title={unit ? getUnitTitle(unit) : `${q},${r}`}
        >
          {unit ? <UnitToken unit={unit} /> : ""}
        </button>
      );
    }
  }
  return <div className="relative h-[390px] w-[620px]">{cells}</div>;
}

function findHexPath(
  start: { q: number; r: number },
  end: { q: number; r: number },
  occupied: Set<string>
) {
  const startKey = `${start.q},${start.r}`;
  const endKey = `${end.q},${end.r}`;
  const queue: { q: number; r: number; path: { q: number; r: number }[] }[] = [
    { q: start.q, r: start.r, path: [{ q: start.q, r: start.r }] },
  ];
  const seen = new Set([startKey]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (`${current.q},${current.r}` === endKey) return current.path;

    for (const neighbor of getHexNeighbors(current.q, current.r)) {
      const key = `${neighbor.q},${neighbor.r}`;
      if (seen.has(key)) continue;
      if (occupied.has(key) && key !== startKey && key !== endKey) continue;
      seen.add(key);
      queue.push({ ...neighbor, path: [...current.path, neighbor] });
    }
  }

  return [];
}

function getHexNeighbors(q: number, r: number) {
  const even = r % 2 === 0;
  const deltas = even
    ? [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]]
    : [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];

  return deltas
    .map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
    .filter((cell) => cell.q >= 0 && cell.q < COMBAT_COLS && cell.r >= 0 && cell.r < COMBAT_ROWS);
}

function UnitToken({ unit }: { unit: CombatBoardUnit }) {
  return (
    <div className="text-center leading-none">
      <div>{getUnitRule(unit.unitType).label.slice(0, 3)}</div>
      <div className="mt-1 rounded bg-black/50 px-1">{unit.count}</div>
      {unit.ranged && <div className="mt-1 rounded bg-yellow-950/80 px-1 text-[10px] text-yellow-100">F {unit.shots}</div>}
    </div>
  );
}

function UnitDetails({ unit }: { unit: CombatBoardUnit }) {
  return (
    <div>
      <div>{getUnitRule(unit.unitType).label} x{unit.count}</div>
      {unit.ranged && <div className="mt-1 text-yellow-200">Flèches : {unit.shots}</div>}
    </div>
  );
}

function getUnitTitle(unit: CombatBoardUnit) {
  const base = `${getUnitRule(unit.unitType).label} x${unit.count}`;
  return unit.ranged ? `${base} | Flèches : ${unit.shots}` : base;
}

function mapCombat(combat: Record<string, unknown>): PersistentCombat {
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
    boardState: combat.boardState as PersistentCombat["boardState"],
    turnQueue: combat.turnQueue as string[],
    actionLog: combat.actionLog as string[],
    participants: (combat.participants as PersistentCombat["participants"]) ?? [],
    result: combat.result as PersistentCombat["result"],
  };
}
