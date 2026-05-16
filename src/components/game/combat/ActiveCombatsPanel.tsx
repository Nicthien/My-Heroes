"use client";

import { useSession } from "@/lib/auth/client";
import { getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import { PersistentCombat } from "@/lib/game/types";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  goldText,
  ornateFrame,
} from "../hud/theme";
import CollapsiblePanel from "../hud/CollapsiblePanel";

export default function ActiveCombatsPanel() {
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const restoreCombat = useGameStore((state) => state.restoreCombat);
  const focusTile = useGameStore.getState().focusTile;
  const combats = gameState?.activeCombats ?? [];
  if (combats.length === 0) return null;

  const myPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);

  return (
    <CollapsiblePanel
      title={`Combats (${combats.length})`}
      className={ornateFrame}
      expandedClassName="shrink-0 overflow-hidden"
      collapsedClassName="shrink-0 overflow-hidden"
      bodyClassName="max-h-32 space-y-1 overflow-y-auto overscroll-contain px-2 py-2"
    >
      {combats.map((combat) => (
        <CombatRow
          key={combat.id}
          combat={combat}
          myPlayerId={myPlayer?.id}
          onOpen={() => restoreCombat(combat)}
          onFocus={() => focusTile(combat.position.x, combat.position.y)}
        />
      ))}
    </CollapsiblePanel>
  );
}

function CombatRow({
  combat,
  myPlayerId,
  onOpen,
  onFocus,
}: {
  combat: PersistentCombat;
  myPlayerId?: string;
  onOpen: () => void;
  onFocus: () => void;
}) {
  const isParticipant = Boolean(
    myPlayerId &&
    (combat.attackerPlayerId === myPlayerId ||
      combat.defenderPlayerId === myPlayerId ||
      combat.participants?.some((participant) => participant.playerId === myPlayerId))
  );
  const currentPlayerId = getCurrentCombatPlayerId(combat.boardState, combat.currentUnitId, combat.currentPlayerId);
  const isMyTurn = currentPlayerId === myPlayerId;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-700/20 bg-black/30 px-2 py-1.5 transition hover:border-amber-500/50 hover:bg-amber-900/15">
      <button
        onClick={onFocus}
        className="min-w-0 flex-1 text-left"
      >
        <div className={`truncate text-sm font-bold ${goldText}`}>
          Combat {combat.position.x},{combat.position.y}
        </div>
        <div
          className={`truncate text-[11px] uppercase tracking-wider ${
            isMyTurn
              ? "text-emerald-300"
              : isParticipant
              ? "text-amber-200/70"
              : "text-amber-200/50"
          }`}
        >
          {isMyTurn ? "À vous de jouer" : isParticipant ? "En attente" : "Observable"}
        </div>
      </button>
      <button
        className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700"
        onClick={onOpen}
      >
        Ouvrir
      </button>
    </div>
  );
}
