"use client";

import type { LeaderboardEntry } from "@/app/api/leaderboard/route";
import { CornerOrnaments, OrnateHeader, ParchmentBackground, goldText, ornateFrame } from "@/components/game/hud/theme";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className={`relative ${ornateFrame}`}>
      <CornerOrnaments />
      <ParchmentBackground />
      <OrnateHeader>Meilleurs joueurs</OrnateHeader>
      <div className="p-4">
        {entries.length === 0 ? (
          <div className="py-10 text-center italic text-amber-200/40">
            Aucun score enregistré pour le moment. Terminez une partie pour apparaître au classement !
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-amber-200/60">
                <th className="px-2 py-1 font-bold">Rang</th>
                <th className="px-2 py-1 font-bold">Joueur</th>
                <th className="px-2 py-1 text-right font-bold">Parties</th>
                <th className="px-2 py-1 text-right font-bold">Victoires</th>
                <th className="px-2 py-1 text-right font-bold">Meilleur score</th>
                <th className="px-2 py-1 text-right font-bold">Score total</th>
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
                  <td className={`px-2 py-1.5 font-bold ${goldText}`}>{entry.name ?? "Joueur inconnu"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{entry.gamesPlayed}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{entry.gamesWon}</td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                    {entry.bestScore.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-amber-200/80">
                    {entry.totalScore.toLocaleString("fr-FR")}
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
