"use client";

import { useState } from "react";
import type { Town, UnitType } from "@/lib/game/types";
import { UNIT_RULES } from "@/lib/game/economy";

export function TownMercenaryTab({
  selectedTown,
  canAct,
  isPending,
  isMyTown,
  onSellCreatures,
}: {
  selectedTown: Town;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  onSellCreatures: (townId: string, unitType: UnitType, count: number) => Promise<void>;
}) {
  const garrison = selectedTown.garrison ?? [];
  const [counts, setCounts] = useState<Record<string, number>>({});

  if (garrison.length === 0) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        Aucune créature dans la garnison à vendre.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/70">
        Vendez les créatures de la garnison à 50% de leur coût en or.
      </div>
      {garrison.map((stack) => {
        const rule = UNIT_RULES[stack.unitType];
        if (!rule) return null;
        const unitGold = Math.max(10, Math.floor((rule.cost.gold ?? 100) * 0.5));
        const desired = Math.min(stack.count, Math.max(1, counts[stack.unitType] ?? 1));
        const disabled = !canAct || !isMyTown || isPending || desired <= 0;
        return (
          <div key={stack.id} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-100">{rule.label} × {stack.count}</div>
                <div className="text-xs text-amber-300">{unitGold} or / unité</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={stack.count}
                  value={desired}
                  onChange={(e) => setCounts((prev) => ({ ...prev, [stack.unitType]: Math.max(1, Math.floor(Number(e.target.value || 1))) }))}
                  className="w-16 rounded-md border border-amber-700/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onSellCreatures(selectedTown.id, stack.unitType, desired)}
                  className={`rounded-md border px-3 py-1 text-sm font-black uppercase tracking-wider transition ${
                    disabled
                      ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                      : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 hover:from-amber-500 hover:to-amber-700"
                  }`}
                >
                  Vendre
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
