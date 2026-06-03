"use client";

import type { Hero, Player, Town } from "@/lib/game/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedLabelFromId } from "@/lib/i18n/gameLabels";

const SCHOOLS: Array<{ id: "fire_magic" | "water_magic" | "earth_magic" | "air_magic"; label: string; color: string }> = [
  { id: "fire_magic", label: "Magie du feu", color: "text-red-300" },
  { id: "water_magic", label: "Magie de l'eau", color: "text-sky-300" },
  { id: "earth_magic", label: "Magie de la terre", color: "text-emerald-300" },
  { id: "air_magic", label: "Magie de l'air", color: "text-yellow-300" },
];
const LEARN_COST = 2000;

export function TownMageUniversityTab({
  selectedTown,
  myPlayer,
  canAct,
  isPending,
  isMyTown,
  heroesAtSelectedTown,
  onLearnSchool,
}: {
  selectedTown: Town;
  myPlayer: Player | undefined;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  heroesAtSelectedTown: Hero[];
  onLearnSchool: (townId: string, heroId: string, school: "fire_magic" | "water_magic" | "earth_magic" | "air_magic") => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const hero = heroesAtSelectedTown[0];

  if (!hero) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        {t("mage.noHero")}
      </div>
    );
  }

  const skills = hero.skills ?? {};
  const tooPoor = !myPlayer || myPlayer.resources.gold < LEARN_COST;

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/70">
        {t("mage.heroLearns", { name: hero.name, cost: LEARN_COST })}
      </div>
      {SCHOOLS.map((school) => {
        const alreadyKnown = Boolean(skills[school.id]);
        const disabled = alreadyKnown || tooPoor || !canAct || !isMyTown || isPending;
        return (
          <div key={school.id} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className={`text-sm font-bold ${school.color}`}>{localizedLabelFromId(school.id, school.label, locale)}</div>
                {alreadyKnown && <div className="text-xs text-emerald-300">{t("mage.alreadyKnown", { level: String(skills[school.id]) })}</div>}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onLearnSchool(selectedTown.id, hero.id, school.id)}
                className={`shrink-0 rounded-md border px-3 py-1 text-sm font-black uppercase tracking-wider transition ${
                  disabled
                    ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                    : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 hover:from-amber-500 hover:to-amber-700"
                }`}
              >
                {t("mage.learn")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
