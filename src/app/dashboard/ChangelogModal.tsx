"use client";

import { Fragment } from "react";
import {
  CornerOrnaments,
  ParchmentBackground,
  goldText,
  ornateFramePolished,
} from "@/components/game/hud/theme";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";
import { CHANGELOG, type ChangelogCategory } from "./changelogData";

const CATEGORY_KEY: Record<ChangelogCategory, TranslationKey> = {
  added: "changelog.added",
  changed: "changelog.changed",
  fixed: "changelog.fixed",
  removed: "changelog.removed",
};

const CATEGORY_DOT: Record<ChangelogCategory, string> = {
  added: "bg-emerald-400",
  changed: "bg-amber-400",
  fixed: "bg-sky-400",
  removed: "bg-rose-400",
};

// Renders **bold** spans inside an otherwise plain changelog line.
function renderItem(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-black text-amber-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function formatDate(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    dateStyle: "long",
  }).format(date);
}

export function ChangelogModal({ onClose }: { onClose: () => void }) {
  const { locale, t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        className={`relative ${ornateFramePolished} my-auto w-full max-w-2xl p-4 sm:p-6`}
        onClick={(event) => event.stopPropagation()}
      >
        <CornerOrnaments />
        <ParchmentBackground />

        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="changelog-title" className={`text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
            {t("changelog.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-700/40 bg-stone-950/70 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          {CHANGELOG.map((release) => (
            <section key={release.version}>
              <div className="flex items-baseline gap-3 border-b border-amber-700/30 pb-1">
                <h3 className={`text-lg font-black tracking-wider ${goldText}`}>v{release.version}</h3>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/55">
                  {formatDate(release.date, locale)}
                </span>
              </div>

              {release.summary && (
                <p className="mt-2 text-sm leading-6 text-amber-100/80">{release.summary}</p>
              )}

              {release.sections.map((section) => (
                <div key={section.category} className="mt-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${CATEGORY_DOT[section.category]}`} aria-hidden />
                    <h4 className="text-xs font-black uppercase tracking-[0.18em] text-amber-200/80">
                      {t(CATEGORY_KEY[section.category])}
                    </h4>
                  </div>
                  <ul className="mt-1.5 space-y-1.5 pl-4">
                    {section.items.map((item, index) => (
                      <li
                        key={index}
                        className="list-disc text-sm leading-6 text-amber-100/85 marker:text-amber-500/70"
                      >
                        {renderItem(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
