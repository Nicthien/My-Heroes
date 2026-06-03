export type Locale = "fr" | "en";

export const DEFAULT_LOCALE: Locale = "fr";

export const SUPPORTED_LOCALES: readonly Locale[] = ["fr", "en"] as const;

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
