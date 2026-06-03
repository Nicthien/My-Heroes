"use client";

import type { Hero, Player, Town } from "@/lib/game/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";

const MACHINES: Array<{ key: "ballista" | "firstAid" | "ammoCart"; labelKey: TranslationKey; descKey: TranslationKey; cost: number; requiresBallistaYard: boolean }> = [
  { key: "ballista", labelKey: "ballista.ballistaLabel", descKey: "ballista.ballistaDesc", cost: 2500, requiresBallistaYard: true },
  { key: "firstAid", labelKey: "ballista.tentLabel", descKey: "ballista.tentDesc", cost: 750, requiresBallistaYard: false },
  { key: "ammoCart", labelKey: "ballista.ammoLabel", descKey: "ballista.ammoDesc", cost: 1000, requiresBallistaYard: false },
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
  const { t } = useI18n();
  const hero = heroesAtSelectedTown[0];
  if (!hero) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        {t("ballista.noHero")}
      </div>
    );
  }
  const wm = hero.warMachines ?? {};

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/70">
        {t("ballista.hero", { name: hero.name })}
      </div>
      {MACHINES.map((m) => {
        const alreadyOwned = Boolean(wm[m.key]);
        const tooPoor = !myPlayer || myPlayer.resources.gold < m.cost;
        const disabled = alreadyOwned || tooPoor || !canAct || !isMyTown || isPending;
        return (
          <div key={m.key} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-100">{t(m.labelKey)}</div>
                <div className="text-xs text-amber-200/60">{t(m.descKey)}</div>
                <div className="mt-1 text-xs text-amber-300">{t("tavern.goldCost", { n: m.cost })}</div>
                {alreadyOwned && <div className="mt-1 text-xs text-emerald-300">{t("ballista.alreadyEquipped")}</div>}
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
                {t("ballista.buy")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
