"use client";

import type { LeaderboardEntry } from "@/app/api/leaderboard/route";
import { CornerOrnaments, OrnateHeader, ParchmentBackground, goldText, ornateFrame } from "@/components/game/hud/theme";
import { useI18n } from "@/lib/i18n/I18nProvider";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const { t, locale } = useI18n();
  const numberLocale = locale === "en" ? "en-US" : "fr-FR";
  return (
    <div className={`relative ${ornateFrame}`}>
      <CornerOrnaments />
      <ParchmentBackground />
      <OrnateHeader>{t("leaderboard.title")}</OrnateHeader>
      <div className="p-4">
        {entries.length === 0 ? (
          <div className="py-10 text-center italic text-amber-200/40">
            {t("leaderboard.empty")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-amber-200/60">
                <th className="px-2 py-1 font-bold">{t("leaderboard.rank")}</th>
                <th className="px-2 py-1 font-bold">{t("leaderboard.player")}</th>
                <th className="px-2 py-1 text-right font-bold">{t("leaderboard.games")}</th>
                <th className="px-2 py-1 text-right font-bold">{t("leaderboard.wins")}</th>
                <th className="px-2 py-1 text-right font-bold">{t("leaderboard.bestScore")}</th>
                <th className="px-2 py-1 text-right font-bold">{t("leaderboard.totalScore")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr
                  key={entry.userId}
                  className="border-t border-amber-700/20 text-amber-100/90 transition hover:bg-amber-900/15"
                >
                  <td className="px-2 py-1.5 font-black tabular-nums text-amber-300/90">
                    {RANK_MEDALS[index] ?? `#${index + 1}`}
                  </td>
                  <td className={`px-2 py-1.5 font-bold ${goldText}`}>{entry.name ?? t("leaderboard.unknownPlayer")}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{entry.gamesPlayed}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{entry.gamesWon}</td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                    {entry.bestScore.toLocaleString(numberLocale)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-amber-200/80">
                    {entry.totalScore.toLocaleString(numberLocale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
