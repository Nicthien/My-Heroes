import { DEFAULT_LOCALE, isLocale, normalizeLocale, type Locale } from "./types";

export const LANGUAGE_KEY = "my-heroes:language";
export const LANGUAGE_PREFERENCE_EVENT = "my-heroes:language-preference-change";

export function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;

  try {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function getBrowserLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const primary = language.toLowerCase().split("-")[0];
    if (isLocale(primary)) return primary;
  }

  return DEFAULT_LOCALE;
}

export function hasSavedLocalePreference(): boolean {
  return getStoredLocale() !== null;
}

export function getSavedLocale(): Locale {
  return getStoredLocale() ?? getBrowserLocale();
}

export function saveLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, normalizeLocale(locale));
  } catch {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(LANGUAGE_PREFERENCE_EVENT, { detail: normalizeLocale(locale) }),
  );
}
