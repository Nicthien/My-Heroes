import type { Locale } from "./types";

/**
 * Unit `type` identifiers are canonical English names in snake_case
 * (e.g. "royal_griffin", "first_aid_tent"), so the English display label can be
 * derived directly. This localizes all ~190 creatures + war machines without
 * duplicating names into a dictionary or editing the catalog JSON.
 */
export function unitTypeToEnglishLabel(type: string): string {
  return type
    .split("_")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Returns the FR catalog label, or the derived EN name when locale is "en". */
export function localizedUnitLabel(type: string, frLabel: string, locale: Locale): string {
  return locale === "en" ? unitTypeToEnglishLabel(type) : frLabel;
}

/**
 * Generic id-based label localization for game data whose `id`/`type` is a
 * canonical English snake_case token (skills, spells, …). Falls back to the FR
 * label for any id that wouldn't read well when derived.
 */
export function localizedLabelFromId(id: string, frLabel: string, locale: Locale): string {
  return locale === "en" ? unitTypeToEnglishLabel(id) : frLabel;
}
