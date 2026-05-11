"use client";

import { useSession } from "next-auth/react";
import { useGameStore } from "@/lib/stores/gameStore";
import { getUnitRule } from "@/lib/game/units";

export default function CombatResultModal() {
  const { data: session } = useSession();
  const result = useGameStore((state) => state.lastCombatResult);
  const gameState = useGameStore((state) => state.gameState);
  const setCombatResult = useGameStore((state) => state.setCombatResult);
  if (!result) return null;

  const myPlayer = gameState?.players.find((p) => p.userId === session?.user?.id);
  const iWon = Boolean(myPlayer && result.winnerPlayerId === myPlayer.id);
  const heroDied = Boolean(result.attackerDied && myPlayer && result.winnerPlayerId !== myPlayer.id);

  const borderColor = heroDied ? "border-red-700" : iWon ? "border-green-600" : "border-yellow-600";
  const tagColor = heroDied ? "text-red-400" : iWon ? "text-green-400" : "text-yellow-500";
  const titleColor = heroDied ? "text-red-100" : iWon ? "text-green-100" : "text-yellow-100";
  const title = heroDied ? "Votre héros a péri au combat" : iWon ? "Victoire !" : "Combat terminé";
  const tag = heroDied ? "Défaite" : iWon ? "Victoire" : "Résultat";
  const buttonColor = heroDied ? "bg-red-800 hover:bg-red-700" : iWon ? "bg-green-800 hover:bg-green-700" : "bg-yellow-700 hover:bg-yellow-600";

  const winnerName = getWinnerPlayerName(result, gameState);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 pointer-events-auto">
      <div className={`w-[min(92vw,38rem)] rounded-xl border ${borderColor} bg-stone-950 p-6 text-white shadow-2xl`}>
        <div className={`text-xs uppercase tracking-[0.3em] ${tagColor}`}>{tag}</div>
        <h2 className={`mt-2 text-2xl font-bold ${titleColor}`}>{title}</h2>
        <div className="mt-4 rounded bg-black/40 p-3 text-sm text-stone-300">
          Vainqueur : <span className="font-bold text-green-300">{winnerName}</span>
          {iWon && result.experienceGained > 0 && <span> | XP +{result.experienceGained}</span>}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Losses title="Pertes attaquant" losses={aggregateLosses(result.attackerLosses)} />
          <Losses title="Pertes défenseur" losses={aggregateLosses(result.defenderLosses)} />
        </div>
        {result.log.length > 0 && (
          <div className="mt-5 max-h-36 overflow-y-auto rounded bg-black/40 p-3 text-sm text-stone-300">
            {result.log.slice(-8).map((line, index) => <div key={index}>{line}</div>)}
          </div>
        )}
        <button className={`mt-6 rounded px-5 py-2 font-bold text-white ${buttonColor}`} onClick={() => setCombatResult(null)}>
          Retour à la carte
        </button>
      </div>
    </div>
  );
}

function getWinnerPlayerName(result: NonNullable<ReturnType<typeof useGameStore.getState>["lastCombatResult"]>, gameState: ReturnType<typeof useGameStore.getState>["gameState"]) {
  const winnerPlayer = gameState?.players.find((player) => player.id === result.winnerPlayerId);
  if (winnerPlayer) return winnerPlayer.name;

  const owner = gameState?.players.find((player) => player.id === result.winnerId || player.heroes.some((hero) => hero.id === result.winnerId));
  if (owner) return owner.name;

  if (result.winnerId === "attacker") return "Camp attaquant";
  if (result.winnerId === "defender") return "Camp défenseur";
  for (const player of gameState?.players ?? []) {
    if (player.id === result.winnerId) return player.name;
  }

  return "Monstres errants";
}

function aggregateLosses(losses: { unitType: string; lost: number }[]) {
  const totals = new Map<string, number>();
  for (const loss of losses) {
    totals.set(loss.unitType, (totals.get(loss.unitType) ?? 0) + loss.lost);
  }

  return Array.from(totals, ([unitType, lost]) => ({ unitType, lost })).filter((loss) => loss.lost > 0);
}

function Losses({ title, losses }: { title: string; losses: { unitType: string; lost: number }[] }) {
  return (
    <div className="rounded border border-stone-700 bg-stone-900/80 p-3">
      <div className="font-bold text-stone-100">{title}</div>
      <div className="mt-2 space-y-1 text-sm text-stone-300">
        {losses.length === 0 ? <div>Aucune perte</div> : losses.map((loss) => (
          <div key={loss.unitType} className="flex justify-between">
            <span>{getUnitRule(loss.unitType).label}</span>
            <span className="font-bold text-red-300">-{loss.lost}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
