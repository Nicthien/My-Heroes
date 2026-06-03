"use client";

import type { Hero, Town, UnitType } from "@/lib/game/types";
import { unitTypeLabel } from "./helpers";
import { TransferToHeroIcon, TransferToTownIcon, UpgradeUnitsIcon } from "./icons";
import { UnitSprite } from "./UnitSprite";
import { useI18n } from "@/lib/i18n/I18nProvider";

type TransferDialog = { townId: string; heroId: string; unitType: UnitType; count: number };
type UpgradeDialog = { townId: string; heroId?: string; unitType: UnitType; count: number };

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
  upgradeDialog,
  setUpgradeDialog,
  getUpgradeOption,
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
  upgradeDialog: UpgradeDialog | null;
  setUpgradeDialog: (next: UpgradeDialog | null) => void;
  getUpgradeOption: (unitType: UnitType, available: number) => { label: string; max: number } | null;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-2">
      {isMyTown && heroesAtSelectedTown.length === 0 && (
        <div className="rounded-md border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          {t("garrison.noHeroForReceive")}
        </div>
      )}
      {isMyTown && heroesAtSelectedTown.length > 0 && (
        <div className="rounded-md border border-sky-500/30 bg-sky-950/40 px-3 py-2">
          <label className="block text-[11px] font-black uppercase tracking-wider text-sky-200/70">
            {t("town.heroesAtTown")}
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
        <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">{t("garrison.empty")}</div>
      ) : (
        <div className="space-y-2">
          {garrisonTargetHero && (
            <div className="text-[11px] font-black uppercase tracking-wider text-sky-200/70">
              {t("garrison.garrisonTo", { name: garrisonTargetHero.name })}
            </div>
          )}
          {selectedTown.garrison.map((unit) => {
            const disabled = !canAct || !isMyTown || !garrisonTargetHero || isPending;
            const upgradeOption = getUpgradeOption(unit.unitType, unit.count);
            const upgradeDisabled = !canAct || !isMyTown || isPending || !upgradeOption || upgradeOption.max <= 0;
            const activeUpgradeDialog = upgradeDialog?.townId === selectedTown.id &&
              !upgradeDialog.heroId &&
              upgradeDialog.unitType === unit.unitType
                ? upgradeDialog
                : null;
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
                      <div className="truncate text-sm font-bold text-amber-100">{unitTypeLabel(unit.unitType, locale)}</div>
                      <div className="text-xs text-amber-200/60">{t("garrison.inGarrison", { n: unit.count })}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className={`group relative grid h-10 w-10 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-sky-200/80 ${
                        upgradeDisabled
                          ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                          : "border-sky-400/60 bg-gradient-to-b from-sky-600 to-sky-800 text-sky-50 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.3)] hover:from-sky-500 hover:to-sky-700"
                      }`}
                      disabled={upgradeDisabled}
                      onClick={() => {
                        setTransferDialog(null);
                        setReturnDialog(null);
                        setUpgradeDialog(activeUpgradeDialog ? null : { townId: selectedTown.id, unitType: unit.unitType, count: upgradeOption?.max ?? unit.count });
                      }}
                      aria-label={t("garrison.upgradeAria", { name: unitTypeLabel(unit.unitType, locale) })}
                      title={upgradeOption ? t("garrison.upgradeTo", { name: upgradeOption.label }) : t("garrison.upgradeRequires")}
                    >
                      <UpgradeUnitsIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className={`group relative grid h-10 w-10 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-sky-200/80 ${
                        disabled
                          ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                          : "border-sky-400/60 bg-gradient-to-b from-sky-600 to-sky-800 text-sky-50 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.3)] hover:from-sky-500 hover:to-sky-700"
                      }`}
                      disabled={disabled}
                      onClick={() => {
                        setReturnDialog(null);
                        setUpgradeDialog(null);
                        setTransferDialog(activeTransferDialog || !garrisonTargetHero
                          ? null
                          : { townId: selectedTown.id, heroId: garrisonTargetHero.id, unitType: unit.unitType, count: unit.count });
                      }}
                      aria-label={t("garrison.sendTo", { name: garrisonTargetHero?.name ?? t("common.hero") })}
                      title={t("garrison.sendTo", { name: garrisonTargetHero?.name ?? t("common.hero") })}
                    >
                      <TransferToHeroIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {garrisonTargetHero && (
        <div className="mt-3 rounded-md border border-amber-700/30 bg-black/30 p-2">
          <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-amber-300/80">
            {t("garrison.armyOf", { name: garrisonTargetHero.name })}
          </div>
          {garrisonTargetHero.armies.length === 0 ? (
            <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">{t("garrison.heroNoUnits")}</div>
          ) : (
            <div className="space-y-2">
              {garrisonTargetHero.armies.map((unit) => {
                const disabled = !canAct || !isMyTown || isPending;
                const upgradeOption = getUpgradeOption(unit.unitType, unit.count);
                const upgradeDisabled = !canAct || !isMyTown || isPending || !upgradeOption || upgradeOption.max <= 0;
                const activeUpgradeDialog = upgradeDialog?.townId === selectedTown.id &&
                  upgradeDialog.heroId === garrisonTargetHero.id &&
                  upgradeDialog.unitType === unit.unitType
                    ? upgradeDialog
                    : null;
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
                          <div className="truncate text-sm font-bold text-amber-100">{unitTypeLabel(unit.unitType, locale)}</div>
                          <div className="text-xs text-amber-200/60">{t("garrison.withHero", { n: unit.count })}</div>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className={`group relative grid h-10 w-10 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-sky-200/80 ${
                            upgradeDisabled
                              ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                              : "border-sky-400/60 bg-gradient-to-b from-sky-600 to-sky-800 text-sky-50 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.3)] hover:from-sky-500 hover:to-sky-700"
                          }`}
                          disabled={upgradeDisabled}
                          onClick={() => {
                            setTransferDialog(null);
                            setReturnDialog(null);
                            setUpgradeDialog(activeUpgradeDialog ? null : { townId: selectedTown.id, heroId: garrisonTargetHero.id, unitType: unit.unitType, count: upgradeOption?.max ?? unit.count });
                          }}
                          aria-label={t("garrison.upgradeAria", { name: unitTypeLabel(unit.unitType, locale) })}
                          title={upgradeOption ? t("garrison.upgradeTo", { name: upgradeOption.label }) : t("garrison.upgradeRequires")}
                        >
                          <UpgradeUnitsIcon className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          className={`group relative grid h-10 w-10 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/80 ${
                            disabled
                              ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                              : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] hover:from-amber-500 hover:to-amber-700"
                          }`}
                          disabled={disabled}
                          onClick={() => {
                            setTransferDialog(null);
                            setUpgradeDialog(null);
                            setReturnDialog(activeReturnDialog
                              ? null
                              : { townId: selectedTown.id, heroId: garrisonTargetHero.id, unitType: unit.unitType, count: unit.count });
                          }}
                          aria-label={t("garrison.depositToGarrison")}
                          title={t("garrison.depositToGarrison")}
                        >
                          <TransferToTownIcon className="h-5 w-5" />
                        </button>
                      </div>
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
