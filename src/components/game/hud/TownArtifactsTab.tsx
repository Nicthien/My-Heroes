"use client";

import type { Hero, Player, Town } from "@/lib/game/types";
import { getArtifact } from "@/lib/game/artifacts";

export function TownArtifactsTab({
  selectedTown,
  myPlayer,
  canAct,
  isPending,
  isMyTown,
  heroesAtSelectedTown,
  onBuyArtifact,
}: {
  selectedTown: Town;
  myPlayer: Player | undefined;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  heroesAtSelectedTown: Hero[];
  onBuyArtifact: (townId: string, heroId: string, artifactId: string) => Promise<void>;
}) {
  const offer = selectedTown.artifactOffer ?? [];
  const buyer = heroesAtSelectedTown[0];

  if (offer.length === 0) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        Stock de marchands d&apos;artefacts épuisé. Reviendra à la prochaine reconstruction.
      </div>
    );
  }

  if (!buyer) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        Aucun héros présent dans le château pour acheter.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/70">
        Héros acheteur : <span className="font-bold text-amber-100">{buyer.name}</span>
      </div>
      {offer.map((artifactId) => {
        const artifact = getArtifact(artifactId);
        if (!artifact) return null;
        const price = artifact.cost ?? 5000;
        const tooPoor = !myPlayer || myPlayer.resources.gold < price;
        const disabled = !canAct || !isMyTown || isPending || tooPoor;
        return (
          <div key={artifactId} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-100">{artifact.name}</div>
                <div className="text-xs text-amber-200/60 capitalize">{artifact.class}</div>
                <div className="mt-1 text-xs text-amber-300">{price} or</div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onBuyArtifact(selectedTown.id, buyer.id, artifactId)}
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
