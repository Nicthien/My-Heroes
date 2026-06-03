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
                ? "border-blue-500 bg-blue-600/30 text-white"
                : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
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
