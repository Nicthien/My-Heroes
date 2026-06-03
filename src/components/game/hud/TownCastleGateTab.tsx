"use client";

import { useState } from "react";
import { BuildingType, Faction, type Player, type Town, type UnitType } from "@/lib/game/types";
import { UNIT_RULES } from "@/lib/game/economy";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedUnitLabel } from "@/lib/i18n/gameLabels";

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
  const { t, locale } = useI18n();
  const compatibleTowns = (myPlayer?.towns ?? []).filter((town) =>
    town.id !== selectedTown.id &&
    (town.townType ?? town.faction) === Faction.INFERNO &&
    (town.buildings ?? []).includes(BuildingType.UNIQUE_1)
  );
  const [targetTownId, setTargetTownId] = useState<string>(compatibleTowns[0]?.id ?? "");
  const [counts, setCounts] = useState<Record<string, number>>({});

  const garrison = selectedTown.garrison ?? [];

  if (compatibleTowns.length === 0) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        {t("gate.needAnother")}
      </div>
    );
  }

  if (garrison.length === 0) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        {t("gate.noCreatures")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/70">
        {t("gate.info")}
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-amber-300/80">{t("gate.destination")}</label>
        <select
          className="mt-1 w-full rounded-md border border-amber-700/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
          value={targetTownId}
          onChange={(e) => setTargetTownId(e.target.value)}
        >
          {compatibleTowns.map((town) => (
            <option key={town.id} value={town.id}>{town.name}</option>
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
                <div className="text-sm font-bold text-amber-100">{localizedUnitLabel(stack.unitType, rule.label, locale)} × {stack.count}</div>
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
                  {t("gate.transfer")}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
