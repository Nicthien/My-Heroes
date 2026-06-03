import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "./types";

export const LANGUAGE_KEY = "my-heroes:language";
export const LANGUAGE_PREFERENCE_EVENT = "my-heroes:language-preference-change";

export function getSavedLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const saved = window.localStorage.getItem(LANGUAGE_KEY);
  return normalizeLocale(saved);
}

export function saveLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_KEY, locale);
  window.dispatchEvent(
    new CustomEvent(LANGUAGE_PREFERENCE_EVENT, { detail: locale }),
  );
}
