"use client";

import type { Hero, Town, UnitType } from "@/lib/game/types";
import { unitTypeLabel } from "./helpers";
import { TransferToHeroIcon, TransferToTownIcon } from "./icons";
import { UnitSprite } from "./UnitSprite";

type TransferDialog = { townId: string; heroId: string; unitType: UnitType; count: number };

export function TownGarrisonTab({
  selectedTown,
  isMyTown,
  canAct,
  isPending,
  heroesAtSelectedTown,
  garrisonTargetHero,
  setGarrisonTargetHeroId,
  transferDialog,
  setTransferDialog,
  returnDialog,
  setReturnDialog,
}: {
  selectedTown: Town;
  isMyTown: boolean;
  canAct: boolean;
  isPending: boolean;
  heroesAtSelectedTown: Hero[];
  garrisonTargetHero: Hero | undefined;
  setGarrisonTargetHeroId: (id: string | null) => void;
  transferDialog: TransferDialog | null;
  setTransferDialog: (next: TransferDialog | null) => void;
  returnDialog: TransferDialog | null;
  setReturnDialog: (next: TransferDialog | null) => void;
}) {
  return (
    <div className="space-y-2">
      {isMyTown && heroesAtSelectedTown.length === 0 && (
        <div className="rounded-md border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          Aucun héros au château pour recevoir la garnison.
        </div>
      )}
      {isMyTown && heroesAtSelectedTown.length > 0 && (
        <div className="rounded-md border border-sky-500/30 bg-sky-950/40 px-3 py-2">
          <label className="block text-[11px] font-black uppercase tracking-wider text-sky-200/70">
            Héros au château
            <select
              className="mt-2 w-full rounded-md border border-sky-500/40 bg-black/60 px-2 py-1.5 text-sm font-bold text-sky-50 outline-none transition focus:border-sky-300"
              value={garrisonTargetHero?.id ?? ""}
              onChange={(event) => {
                setGarrisonTargetHeroId(event.target.value || null);
                setTransferDialog(null);
                setReturnDialog(null);
              }}
            >
              {heroesAtSelectedTown.map((hero) => (
                <option key={hero.id} value={hero.id}>
                  {hero.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {selectedTown.garrison.length === 0 ? (
        <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">Aucune unité en garnison.</div>
      ) : (
        <div className="space-y-2">
          {garrisonTargetHero && (
            <div className="text-[11px] font-black uppercase tracking-wider text-sky-200/70">
              Garnison vers {garrisonTargetHero.name}
            </div>
          )}
          {selectedTown.garrison.map((unit) => {
            const disabled = !canAct || !isMyTown || !garrisonTargetHero || isPending;
            const activeTransferDialog = transferDialog?.townId === selectedTown.id &&
              transferDialog.heroId === garrisonTargetHero?.id &&
              transferDialog.unitType === unit.unitType
                ? transferDialog
                : null;
            return (
              <div key={unit.id} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <UnitSprite unitType={unit.unitType} side="defender" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-amber-100">{unitTypeLabel(unit.unitType)}</div>
                      <div className="text-xs text-amber-200/60">En garnison : {unit.count}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`group relative grid h-10 w-10 shrink-0 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-sky-200/80 ${
                      disabled
                        ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                        : "border-sky-400/60 bg-gradient-to-b from-sky-600 to-sky-800 text-sky-50 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.3)] hover:from-sky-500 hover:to-sky-700"
                    }`}
                    disabled={disabled}
                    onClick={() => {
                      setReturnDialog(null);
                      setTransferDialog(activeTransferDialog || !garrisonTargetHero
                        ? null
                        : { townId: selectedTown.id, heroId: garrisonTargetHero.id, unitType: unit.unitType, count: unit.count });
                    }}
                    aria-label={`Envoyer vers ${garrisonTargetHero?.name ?? "héros"}`}
                    title={`Envoyer vers ${garrisonTargetHero?.name ?? "héros"}`}
                  >
                    <TransferToHeroIcon className="h-5 w-5" />
                    <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md border border-sky-400/50 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-sky-100 opacity-0 shadow-lg shadow-black/50 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                      Envoyer
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {garrisonTargetHero && (
        <div className="mt-3 rounded-md border border-amber-700/30 bg-black/30 p-2">
          <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-amber-300/80">
            Armée de {garrisonTargetHero.name}
          </div>
          {garrisonTargetHero.armies.length === 0 ? (
            <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">Ce héros n&apos;a pas d&apos;unités à déposer.</div>
          ) : (
            <div className="space-y-2">
              {garrisonTargetHero.armies.map((unit) => {
                const disabled = !canAct || !isMyTown || isPending;
                const activeReturnDialog = returnDialog?.townId === selectedTown.id &&
                  returnDialog.heroId === garrisonTargetHero.id &&
                  returnDialog.unitType === unit.unitType
                    ? returnDialog
                    : null;
                return (
                  <div key={unit.id} className="rounded-lg border border-amber-700/35 bg-gradient-to-b from-stone-900/75 to-black/55 p-3 shadow-inner shadow-black/35">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <UnitSprite unitType={unit.unitType} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-amber-100">{unitTypeLabel(unit.unitType)}</div>
                          <div className="text-xs text-amber-200/60">Avec le héros : {unit.count}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`group relative grid h-10 w-10 shrink-0 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/80 ${
                          disabled
                            ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                            : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] hover:from-amber-500 hover:to-amber-700"
                        }`}
                        disabled={disabled}
                        onClick={() => {
                          setTransferDialog(null);
                          setReturnDialog(activeReturnDialog
                            ? null
                            : { townId: selectedTown.id, heroId: garrisonTargetHero.id, unitType: unit.unitType, count: unit.count });
                        }}
                        aria-label="Déposer dans la garnison"
                        title="Déposer dans la garnison"
                      >
                        <TransferToTownIcon className="h-5 w-5" />
                        <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md border border-amber-400/50 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-amber-100 opacity-0 shadow-lg shadow-black/50 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                          Déposer
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
