"use client";

import { Faction, type Player, type Town } from "@/lib/game/types";
import { HERO_RECRUIT_COST_GOLD, MAX_HEROES_PER_PLAYER } from "@/lib/game/heroes";
import { factionLabel } from "./helpers";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function TownTavernTab({
  selectedTown,
  myPlayer,
  canAct,
  isPending,
  isMyTown,
  onRecruitHero,
}: {
  selectedTown: Town;
  myPlayer: Player | undefined;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  onRecruitHero: (templateId: string) => void;
}) {
  const { t, locale } = useI18n();
  const offer = selectedTown.tavernOffer ?? [];
  const returningHeroes = myPlayer?.tavernHeroes ?? [];
  const visibleOffer = [...returningHeroes, ...offer];

  return (
    <div className="space-y-2">
      {visibleOffer.length === 0 ? (
        <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">{t("tavern.noHeroes")}</div>
      ) : (
        visibleOffer.map((hero) => {
          const atMax = myPlayer ? myPlayer.heroes.length >= MAX_HEROES_PER_PLAYER : true;
          const tooPoor = !myPlayer || myPlayer.resources.gold < HERO_RECRUIT_COST_GOLD;
          const disabled = !canAct || !isMyTown || isPending || atMax || tooPoor;
          return (
            <div key={hero.templateId} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-amber-100">{hero.name}</div>
                  <div className="text-xs text-amber-200/60">{hero.class} · {factionLabel(hero.faction as Faction, locale)}</div>
                  <div className="text-xs text-amber-300/80">{t("tavern.specialty", { s: hero.specialty })}</div>
                  {hero.returning && <div className="text-xs text-emerald-300">{t("tavern.returningHero", { level: hero.level ?? 1, army: hero.armyCount ?? 0 })}</div>}
                  <div className="mt-1 text-xs text-amber-300">{t("tavern.goldCost", { n: HERO_RECRUIT_COST_GOLD })}</div>
                  {atMax && <div className="mt-1 text-xs text-red-300">{t("tavern.maxHeroes", { n: MAX_HEROES_PER_PLAYER })}</div>}
                </div>
                <button
                  className={`shrink-0 rounded-md border px-3 py-1 text-sm font-black uppercase tracking-wider transition ${
                    disabled
                      ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                      : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] hover:from-amber-500 hover:to-amber-700"
                  }`}
                  disabled={disabled}
                  onClick={() => onRecruitHero(hero.heroId ? `hero:${hero.heroId}` : hero.templateId)}
                >
                  {t("tavern.hire")}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
