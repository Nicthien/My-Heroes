"use client";

import type { GameActionLogEntry } from "@/lib/game/server/action-log";
import type { Player } from "@/lib/game/types";
import { categoryLabel, formatActionLogTooltip, formatActor, formatLogTime, getKnownActionLogEntries } from "./actionLogDisplay";

export function PlayerJournalPanel({
  entries,
  player,
  playersById,
}: {
  entries: GameActionLogEntry[] | undefined;
  player: Player;
  playersById: Map<string, Player>;
}) {
  const knownEntries = getKnownActionLogEntries(entries, player.id);

  if (knownEntries.length === 0) {
    return (
      <div className="rounded-lg border border-amber-700/30 bg-black/30 px-3 py-4 text-center text-sm font-semibold text-amber-200/60">
        Aucune action connue.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {knownEntries.map((entry) => {
        const actor = entry.gamePlayerId ? playersById.get(entry.gamePlayerId) : undefined;
        return (
          <article
            key={entry.id}
            className="rounded-lg border border-amber-700/30 bg-black/30 px-3 py-2 text-amber-50/85"
            title={formatActionLogTooltip(entry, actor)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold leading-snug text-amber-50">{entry.summary}</div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-amber-200/55">
                  {formatActor(entry, actor)} - Tour {entry.turnNumber} - {categoryLabel(entry.category)}
                </div>
              </div>
              <time className="shrink-0 font-mono text-[10px] text-amber-200/55">{formatLogTime(entry.createdAt)}</time>
            </div>
          </article>
        );
      })}
    </div>
  );
}
