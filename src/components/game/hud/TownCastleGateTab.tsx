"use client";

import { useState } from "react";
import { BuildingType, Faction, type Player, type Town, type UnitType } from "@/lib/game/types";
import { UNIT_RULES } from "@/lib/game/economy";

export function TownCastleGateTab({
  selectedTown,
  myPlayer,
  canAct,
  isPending,
  isMyTown,
  onTransferGate,
}: {
  selectedTown: Town;
  myPlayer: Player | undefined;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  onTransferGate: (fromTownId: string, toTownId: string, unitType: UnitType, count: number) => Promise<void>;
}) {
  const compatibleTowns = (myPlayer?.towns ?? []).filter((t) =>
    t.id !== selectedTown.id &&
    (t.townType ?? t.faction) === Faction.INFERNO &&
    (t.buildings ?? []).includes(BuildingType.UNIQUE_1)
  );
  const [targetTownId, setTargetTownId] = useState<string>(compatibleTowns[0]?.id ?? "");
  const [counts, setCounts] = useState<Record<string, number>>({});

  const garrison = selectedTown.garrison ?? [];

  if (compatibleTowns.length === 0) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        Vous devez posséder une autre ville Hadès équipée de la Porte du château pour transférer des unités.
      </div>
    );
  }

  if (garrison.length === 0) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        Aucune créature en garnison à transférer.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/70">
        Transférez instantanément les créatures de la garnison vers une autre ville Hadès équipée.
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-amber-300/80">Destination</label>
        <select
          className="mt-1 w-full rounded-md border border-amber-700/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
          value={targetTownId}
          onChange={(e) => setTargetTownId(e.target.value)}
        >
          {compatibleTowns.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {garrison.map((stack) => {
        const rule = UNIT_RULES[stack.unitType];
        if (!rule) return null;
        const desired = Math.min(stack.count, Math.max(1, counts[stack.unitType] ?? 1));
        const disabled = !canAct || !isMyTown || isPending || !targetTownId;
        return (
          <div key={stack.id} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-100">{rule.label} × {stack.count}</div>
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
                  onClick={() => void onTransferGate(selectedTown.id, targetTownId, stack.unitType, desired)}
                  className={`rounded-md border px-3 py-1 text-sm font-black uppercase tracking-wider transition ${
                    disabled
                      ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                      : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 hover:from-amber-500 hover:to-amber-700"
                  }`}
                >
                  Transférer
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
