"use client";

import type { Faction, Player, Town, UnitType } from "@/lib/game/types";
import { formatCost, getRecruitableUnitsForFaction } from "@/lib/game/economy";

type RecruitableUnitEntry = ReturnType<typeof getRecruitableUnitsForFaction>[number];
import { buildingTypeLabel } from "./helpers";
import { RecruitUnitsIcon } from "./icons";
import { UnitSprite } from "./UnitSprite";
import { getMaxRecruitCount } from "./recruitHelpers";

export function TownRecruitTab({
  selectedTown,
  selectedTownFaction,
  displayedRecruitEntries,
  hideMissingRecruitRequirements,
  setHideMissingRecruitRequirements,
  myPlayer,
  canAct,
  isPending,
  isMyTown,
  recruitDialog,
  setRecruitDialog,
}: {
  selectedTown: Town;
  selectedTownFaction: Faction;
  displayedRecruitEntries: RecruitableUnitEntry[];
  hideMissingRecruitRequirements: boolean;
  setHideMissingRecruitRequirements: (next: boolean) => void;
  myPlayer: Player | undefined;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  recruitDialog: { townId: string; unitType: UnitType; count: number } | null;
  setRecruitDialog: (next: { townId: string; unitType: UnitType; count: number } | null) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-md border border-amber-700/30 bg-black/35 px-3 py-2 text-xs font-bold text-amber-100">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-amber-500"
          checked={hideMissingRecruitRequirements}
          onChange={(event) => setHideMissingRecruitRequirements(event.currentTarget.checked)}
        />
        <span>Masquer les prerequis manquants</span>
      </label>
      {displayedRecruitEntries.map(({ rule, tier, dwelling, upgraded }) => {
        const hasDwelling = selectedTown.buildings.includes(dwelling);
        const available = selectedTown.availableRecruits[rule.type] ?? 0;
        const maxRecruitable = myPlayer ? getMaxRecruitCount(myPlayer.resources, rule.cost, available) : 0;
        const activeRecruitDialog = recruitDialog?.townId === selectedTown.id && recruitDialog.unitType === rule.type ? recruitDialog : null;
        const disabled =
          !hasDwelling ||
          maxRecruitable <= 0 ||
          !myPlayer ||
          !canAct ||
          !isMyTown ||
          isPending;

        return (
          <div key={rule.type} className="relative rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <UnitSprite unitType={rule.type} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-amber-100">{rule.label}</div>
                  <div className="text-xs text-amber-200/60">PV {rule.health} · {formatCost(rule.cost)} / unité</div>
                  {hasDwelling && <div className="mt-1 text-xs text-emerald-300">Disponible : {available}</div>}
                  {upgraded && <div className="mt-1 text-xs text-sky-300">Amélioration palier {tier + 1}</div>}
                  {!hasDwelling && <div className="mt-1 text-xs text-red-300">Prérequis : {buildingTypeLabel(dwelling, selectedTownFaction)}</div>}
                </div>
              </div>
              <button
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border transition ${
                  disabled
                    ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                    : "border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] hover:from-emerald-500 hover:to-emerald-700"
                }`}
                disabled={disabled}
                title="Recruter"
                aria-label={`Recruter ${rule.label}`}
                onClick={() => setRecruitDialog(activeRecruitDialog ? null : { townId: selectedTown.id, unitType: rule.type, count: maxRecruitable })}
              >
                <RecruitUnitsIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
