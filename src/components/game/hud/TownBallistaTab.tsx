"use client";

import type { Hero, Player, Town } from "@/lib/game/types";

const MACHINES: Array<{ key: "ballista" | "firstAid" | "ammoCart"; label: string; description: string; cost: number; requiresBallistaYard: boolean }> = [
  { key: "ballista", label: "Baliste", description: "Machine à distance qui tire chaque round (réservé à la Cour des balistes).", cost: 2500, requiresBallistaYard: true },
  { key: "firstAid", label: "Tente de soins", description: "Soigne les unités adjacentes en début de tour.", cost: 750, requiresBallistaYard: false },
  { key: "ammoCart", label: "Chariot de munitions", description: "Fournit des munitions illimitées aux tireurs alliés.", cost: 1000, requiresBallistaYard: false },
];

export function TownBallistaTab({
  selectedTown,
  myPlayer,
  canAct,
  isPending,
  isMyTown,
  heroesAtSelectedTown,
  onBuyMachine,
}: {
  selectedTown: Town;
  myPlayer: Player | undefined;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  heroesAtSelectedTown: Hero[];
  onBuyMachine: (townId: string, heroId: string, machine: "ballista" | "firstAid" | "ammoCart") => Promise<void>;
}) {
  const hero = heroesAtSelectedTown[0];
  if (!hero) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        Aucun héros présent dans le château pour recevoir une machine.
      </div>
    );
  }
  const wm = hero.warMachines ?? {};

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/70">
        Héros : <span className="font-bold text-amber-100">{hero.name}</span>
      </div>
      {MACHINES.map((m) => {
        const alreadyOwned = Boolean(wm[m.key]);
        const tooPoor = !myPlayer || myPlayer.resources.gold < m.cost;
        const disabled = alreadyOwned || tooPoor || !canAct || !isMyTown || isPending;
        return (
          <div key={m.key} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-100">{m.label}</div>
                <div className="text-xs text-amber-200/60">{m.description}</div>
                <div className="mt-1 text-xs text-amber-300">{m.cost} or</div>
                {alreadyOwned && <div className="mt-1 text-xs text-emerald-300">Déjà équipée.</div>}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onBuyMachine(selectedTown.id, hero.id, m.key)}
                className={`shrink-0 rounded-md border px-3 py-1 text-sm font-black uppercase tracking-wider transition ${
                  disabled
                    ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                    : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 hover:from-amber-500 hover:to-amber-700"
                }`}
              >
                Acheter
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
