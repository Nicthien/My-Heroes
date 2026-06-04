"use client";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/types";

const LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};

const FLAGS: Record<Locale, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
};

interface LanguageSelectProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
}

export default function LanguageSelect({ value, onChange, className }: LanguageSelectProps) {
  return (
    <div className={`flex gap-2 ${className ?? ""}`} role="group" aria-label="Language">
      {SUPPORTED_LOCALES.map((locale) => {
        const active = locale === value;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => onChange(locale)}
            aria-pressed={active}
            className={`flex flex-1 items-center justify-center gap-2 rounded border p-3 text-sm font-semibold transition ${
              active
                ? "border-amber-400/70 bg-amber-700/35 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.2)]"
                : "border-amber-800/45 bg-stone-950/55 text-amber-100/65 hover:border-amber-500/60 hover:text-amber-100"
            }`}
          >
            <span aria-hidden>{FLAGS[locale]}</span>
            {LABELS[locale]}
          </button>
        );
      })}
    </div>
  );
}
