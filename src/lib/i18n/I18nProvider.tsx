"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useSession, fetchWithSupabaseAuth } from "@/lib/auth/client";
import { translate, type TranslateParams, type TranslationKey } from "./translate";
import {
  LANGUAGE_PREFERENCE_EVENT,
  getSavedLocale,
  saveLocale,
} from "./preferences";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "./types";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslateParams) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => translate(DEFAULT_LOCALE, key),
});

// Subscribe to the localStorage-backed locale preference. Using
// useSyncExternalStore keeps SSR (server snapshot = default) and the client in
// sync without setState-in-effect, and reacts to changes from any tab/component.
function subscribe(callback: () => void) {
  window.addEventListener(LANGUAGE_PREFERENCE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LANGUAGE_PREFERENCE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { data, status } = useSession();

  const locale = useSyncExternalStore(
    subscribe,
    () => getSavedLocale(),
    () => DEFAULT_LOCALE,
  );

  // Keep the <html lang> attribute in sync with the active locale.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Once the session is known, adopt the server-stored language (the choice made
  // at registration / on other devices). Writing through saveLocale dispatches
  // the preference event, which re-reads the external store above.
  const serverLocale = data?.user?.language;
  useEffect(() => {
    if (status !== "authenticated" || !serverLocale) return;
    const normalized = normalizeLocale(serverLocale);
    if (normalized !== getSavedLocale()) {
      saveLocale(normalized);
    }
  }, [status, serverLocale]);

  const setLocale = useCallback((next: Locale) => {
    const normalized = normalizeLocale(next);
    saveLocale(normalized);
    // Persist server-side (best effort) when signed in.
    void fetchWithSupabaseAuth("/api/auth/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: normalized }),
    }).catch(() => {});
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
