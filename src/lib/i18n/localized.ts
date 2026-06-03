import type { Locale } from "./types";

/**
 * Picks a localized display string from colocated FR/EN game-data fields.
 * Game data (creatures, factions, spells, skills, buildings…) keeps its French
 * value as the canonical field and carries an optional English variant; pure
 * engine/AI code keeps using the French field harmlessly while UI render points
 * resolve through this helper.
 */
export function pickLocale(fr: string, en: string | undefined | null, locale: Locale): string {
  return locale === "en" && en ? en : fr;
}
