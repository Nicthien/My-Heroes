"use client";

import type { GameActionLogEntry } from "@/lib/game/server/action-log";
import type { Player } from "@/lib/game/types";
import { categoryLabel, formatActionLogTooltip, formatActor, formatLogTime, getKnownActionLogEntries } from "./actionLogDisplay";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";

export function PlayerJournalPanel({
  entries,
  player,
  playersById,
}: {
  entries: GameActionLogEntry[] | undefined;
  player: Player;
  playersById: Map<string, Player>;
}) {
  const { t, locale } = useI18n();
  const knownEntries = getKnownActionLogEntries(entries, player.id);

  if (knownEntries.length === 0) {
    return (
      <div className="rounded-lg border border-amber-700/30 bg-black/30 px-3 py-4 text-center text-sm font-semibold text-amber-200/60">
        {t("journal.noActions")}
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
            title={formatActionLogTooltip(entry, actor, locale)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold leading-snug text-amber-50">{localizedServerMessage(entry.summary, locale)}</div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-amber-200/55">
                  {t("journal.meta", { actor: formatActor(entry, actor, locale), turn: entry.turnNumber, category: categoryLabel(entry.category, locale) })}
                </div>
              </div>
              <time className="shrink-0 font-mono text-[10px] text-amber-200/55">{formatLogTime(entry.createdAt, locale)}</time>
            </div>
          </article>
        );
      })}
    </div>
  );
}
