"use client";

import type { CSSProperties } from "react";
import type { ScoreBreakdown } from "@/lib/game/score";
import { goldDivider, goldText, ornateFramePolished } from "./theme";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";

const SCORE_CAT_KEY: Record<string, TranslationKey> = {
  towns: "score.cat.towns",
  heroes: "score.cat.heroes",
  army: "score.cat.army",
  mines: "score.cat.mines",
  artifacts: "score.cat.artifacts",
  resources: "score.cat.resources",
  defeated: "score.cat.defeated",
  captures: "score.cat.captures",
};

/**
 * Detailed score card shown on hover over a player row in the Players panel.
 * Positioning is controlled by the parent (fixed-position to escape the scroll
 * container); this component is purely presentational.
 */
export function PlayerScoreTooltip({
  total,
  breakdown,
  rank,
  playerCount,
  style,
}: {
  total: number;
  /** Per-category detail. Only provided for the viewer's own player; opponents
   * show the total alone, since their composition stays hidden by fog of war. */
  breakdown?: ScoreBreakdown;
  rank: number;
  playerCount: number;
  style?: CSSProperties;
}) {
  const { t, locale } = useI18n();
  const numberLocale = locale === "en" ? "en-US" : "fr-FR";
  return (
    <div
      className={`${ornateFramePolished} pointer-events-none z-50 w-56 px-3 py-2 text-left shadow-xl shadow-black/60`}
      style={style}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-xs font-black uppercase tracking-wider ${goldText}`}>{t("score.title")}</span>
        <span className="text-[11px] font-bold text-amber-300/80">
          {t("score.rank", { rank, count: playerCount })}
        </span>
      </div>
      <div className={`my-1 ${goldDivider}`} />
      {breakdown ? (
        <ul className="space-y-0.5">
          {breakdown.categories
            .filter((category) => category.points !== 0)
            .map((category) => (
              <li key={category.key} className="flex items-center justify-between text-[11px] text-amber-100/90">
                <span>{SCORE_CAT_KEY[category.key] ? t(SCORE_CAT_KEY[category.key]) : category.label}</span>
                <span className="font-bold tabular-nums">{category.points.toLocaleString(numberLocale)}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-[11px] italic text-amber-200/55">{t("score.detailHidden")}</p>
      )}
      <div className={`my-1 ${goldDivider}`} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider text-amber-200">{t("score.total")}</span>
        <span className={`text-sm font-black tabular-nums ${goldText}`}>
          {total.toLocaleString(numberLocale)}
        </span>
      </div>
    </div>
  );
}
