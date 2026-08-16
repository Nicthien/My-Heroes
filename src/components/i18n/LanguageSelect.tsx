"use client";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";

const LABEL_KEYS: Record<Locale, TranslationKey> = {
  fr: "language.fr",
  en: "language.en",
};

const FLAGS: Record<Locale, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
};

interface LanguageSelectProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
  compactOnMobile?: boolean;
}

export default function LanguageSelect({ value, onChange, className, compactOnMobile = false }: LanguageSelectProps) {
  const { t } = useI18n();

  return (
    <div className={`flex gap-2 ${className ?? ""}`} role="group" aria-label={t("language.label")}>
      {SUPPORTED_LOCALES.map((locale) => {
        const active = locale === value;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => onChange(locale)}
            aria-pressed={active}
            aria-label={t(LABEL_KEYS[locale])}
            className={`flex flex-1 items-center justify-center gap-2 rounded border text-sm font-semibold transition ${compactOnMobile ? "p-2 sm:p-3" : "p-3"} ${
              active
                ? "border-amber-400/70 bg-amber-700/35 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.2)]"
                : "border-amber-800/45 bg-stone-950/55 text-amber-100/65 hover:border-amber-500/60 hover:text-amber-100"
            }`}
          >
            <span aria-hidden>{FLAGS[locale]}</span>
            <span className={compactOnMobile ? "hidden sm:inline" : undefined}>{t(LABEL_KEYS[locale])}</span>
          </button>
        );
      })}
    </div>
  );
}
