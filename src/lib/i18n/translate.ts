import { fr, type TranslationKey } from "./locales/fr";
import { en } from "./locales/en";
import { DEFAULT_LOCALE, type Locale } from "./types";

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  fr,
  en,
};

export type TranslateParams = Record<string, string | number>;

/**
 * Pure, isomorphic translation lookup. Falls back to the default locale (fr)
 * when a key is missing in the requested locale, then to the raw key.
 * Interpolates {token} placeholders from `params`.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: TranslateParams,
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  const template =
    dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? (key as string);

  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

export type { TranslationKey };
