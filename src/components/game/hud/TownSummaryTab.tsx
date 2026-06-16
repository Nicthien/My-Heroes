"use client";

import type { Faction, Hero, Town } from "@/lib/game/types";
import { useGameStore } from "@/lib/stores/gameStore";
import { buildingTypeLabel } from "./helpers";
import { goldText } from "./theme";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function TownSummaryTab({
  selectedTown,
  selectedTownFaction,
  buildableBuildings,
  recruitableUnits,
  heroesAtSelectedTown,
  conversion,
}: {
  selectedTown: Town;
  selectedTownFaction: Faction;
  buildableBuildings: number;
  recruitableUnits: number;
  heroesAtSelectedTown: Hero[];
  conversion?: {
    cost: number;
    canAfford: boolean;
    disabled: boolean;
    onConvert: () => void;
  };
}) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-4">
      <div>
        <div className={`mb-2 text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>{t("town.buildings")}</div>
        {selectedTown.buildings.length === 0 ? (
          <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">{t("town.noBuildings")}</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedTown.buildings.map((b, i) => (
              <span key={i} className="rounded-md border border-amber-700/40 bg-black/50 px-2 py-0.5 text-[11px] text-amber-200/90">
                {buildingTypeLabel(b, selectedTownFaction, locale)}
              </span>
            ))}
          </div>
        )}
      </div>
      {conversion && (
        <div className="rounded-md border border-amber-600/40 bg-amber-950/30 px-3 py-2">
          <div className="mb-2 text-[11px] text-amber-200/70">{t("town.convertHint")}</div>
          <button
            type="button"
            disabled={conversion.disabled || !conversion.canAfford}
            onClick={conversion.onConvert}
            className="w-full rounded-md border border-amber-500/60 bg-gradient-to-b from-amber-700/70 to-amber-900/70 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-50 transition hover:from-amber-600/70 hover:to-amber-800/70 disabled:cursor-not-allowed disabled:border-stone-600/40 disabled:from-stone-800/60 disabled:to-stone-900/60 disabled:text-stone-400"
          >
            {t("town.convert", { n: conversion.cost })}
          </button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md border border-amber-700/30 bg-black/40 px-2 py-2">
          <div className="text-lg font-black text-amber-100">{buildableBuildings}</div>
          <div className="text-amber-200/60">{t("town.buildableCount")}</div>
        </div>
        <div className="rounded-md border border-amber-700/30 bg-black/40 px-2 py-2">
          <div className="text-lg font-black text-amber-100">{recruitableUnits}</div>
          <div className="text-amber-200/60">{t("town.recruitableCount")}</div>
        </div>
        <div className="rounded-md border border-amber-700/30 bg-black/40 px-2 py-2">
          <div className="text-lg font-black text-amber-100">{selectedTown.garrison.length}</div>
          <div className="text-amber-200/60">{t("town.garrisonCount")}</div>
        </div>
      </div>
      {heroesAtSelectedTown.length > 0 && (
        <div className="rounded-md border border-sky-500/40 bg-sky-950/50 px-3 py-2 text-sm text-sky-100">
          <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-sky-200/70">
            {t("town.heroesAtTown")}
          </div>
          <div className="space-y-1">
            {heroesAtSelectedTown.map((hero) => (
              <button
                key={hero.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md border border-sky-400/20 bg-black/30 px-2 py-1 text-left transition hover:border-sky-300/60 hover:bg-sky-900/50"
                onClick={() => useGameStore.getState().selectHero(hero.id)}
              >
                <span className="truncate font-black">{hero.name}</span>
                <span className="shrink-0 text-xs text-sky-200/70">
                  {t("town.stacks", { n: hero.armies.length })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
