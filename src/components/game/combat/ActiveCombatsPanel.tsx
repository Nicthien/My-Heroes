"use client";

import { useSession } from "@/lib/auth/client";
import { PersistentCombat } from "@/lib/game/types";
import { useGameStore } from "@/lib/stores/gameStore";

export default function ActiveCombatsPanel() {
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const restoreCombat = useGameStore((state) => state.restoreCombat);
  const combats = gameState?.activeCombats ?? [];
  if (combats.length === 0) return null;

  const myPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);

  return (
    <div className="absolute right-4 top-32 z-20 w-72 rounded-lg border border-yellow-800/70 bg-black/80 p-3 text-white shadow-xl pointer-events-auto">
      <div className="font-bold text-yellow-100">Combats en cours</div>
      <div className="mt-2 space-y-2">
        {combats.map((combat) => (
          <CombatRow key={combat.id} combat={combat} myPlayerId={myPlayer?.id} onOpen={() => restoreCombat(combat)} />
        ))}
      </div>
    </div>
  );
}

function CombatRow({ combat, myPlayerId, onOpen }: { combat: PersistentCombat; myPlayerId?: string; onOpen: () => void }) {
  const isParticipant = Boolean(
    myPlayerId &&
    (combat.attackerPlayerId === myPlayerId ||
      combat.defenderPlayerId === myPlayerId ||
      combat.participants?.some((participant) => participant.playerId === myPlayerId))
  );
  const isMyTurn = combat.currentPlayerId === myPlayerId;

  return (
    <div className="rounded bg-stone-900/90 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-bold">Combat {combat.position.x},{combat.position.y}</div>
          <div className={isMyTurn ? "text-green-300" : "text-stone-400"}>
            {isMyTurn ? "À vous de jouer" : isParticipant ? "En attente" : "Observable"}
          </div>
        </div>
        <button className="rounded bg-yellow-700 px-2 py-1 font-bold hover:bg-yellow-600" onClick={onOpen}>
          Ouvrir
        </button>
      </div>
    </div>
  );
}
