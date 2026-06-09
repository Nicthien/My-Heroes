"use client";

import { FormEvent, useState } from "react";
import {
  CornerOrnaments,
  ParchmentBackground,
  goldText,
  ornateFramePolished,
} from "@/components/game/hud/theme";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

interface ReportBugModalProps {
  onClose: () => void;
  fetchWithAuth: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  t: TFn;
  locale: Locale;
  appVersion: string;
  /** Extra context lines joined to the report (e.g. in-game: game id, turn, faction). */
  extraContext?: Record<string, string>;
}

export function BugIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 6a3 3 0 0 1 6 0" />
      <rect x="8" y="6" width="8" height="11" rx="4" />
      <path d="M12 17v3M4 11h4M16 11h4M4.5 6.5 7 8M19.5 6.5 17 8M4.5 16.5 7 15M19.5 16.5 17 15" />
    </svg>
  );
}

export function ReportBugModal({ onClose, fetchWithAuth, t, locale, appVersion, extraContext }: ReportBugModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      setMessage({ kind: "error", text: t("dashboard.report.titleRequired") });
      return;
    }
    if (!trimmedDescription) {
      setMessage({ kind: "error", text: t("dashboard.report.descriptionRequired") });
      return;
    }

    setSending(true);
    setMessage(null);

    try {
      const response = await fetchWithAuth("/api/report-bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: trimmedDescription,
          context: {
            ...extraContext,
            appVersion,
            url: typeof window !== "undefined" ? window.location.href : "",
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          },
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("dashboard.report.error") });
        setSending(false);
        return;
      }

      setMessage({ kind: "success", text: t("dashboard.report.success") });
      setTitle("");
      setDescription("");
      setSending(false);
    } catch (error) {
      console.error("Report bug network error:", error);
      setMessage({ kind: "error", text: t("dashboard.report.error") });
      setSending(false);
    }
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={() => {
        if (!sending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-bug-title"
        className={`relative ${ornateFramePolished} my-auto w-full max-w-lg p-4 sm:p-6`}
        onClick={(event) => event.stopPropagation()}
      >
        <CornerOrnaments />
        <ParchmentBackground />
        <div className="relative">
          <h2 id="report-bug-title" className={`mb-2 flex items-center gap-2 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
            <BugIcon className="h-6 w-6" />
            {t("dashboard.report.title")}
          </h2>
          <p className="mb-4 text-sm leading-6 text-amber-100/75">{t("dashboard.report.intro")}</p>

          {message && (
            <div
              role="status"
              className={`mb-4 rounded-md border px-4 py-3 text-sm font-semibold ${
                message.kind === "success"
                  ? "border-emerald-400/50 bg-emerald-950/45 text-emerald-100"
                  : "border-red-400/50 bg-red-950/45 text-red-100"
              }`}
            >
              {message.text}
            </div>
          )}

          {message?.kind === "success" ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700"
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="report-title" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                  {t("dashboard.report.fieldTitle")}
                </label>
                <input
                  id="report-title"
                  type="text"
                  value={title}
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("dashboard.report.titlePlaceholder")}
                  className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label htmlFor="report-description" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                  {t("dashboard.report.fieldDescription")}
                </label>
                <textarea
                  id="report-description"
                  value={description}
                  rows={6}
                  maxLength={5000}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("dashboard.report.descriptionPlaceholder")}
                  className="w-full resize-y rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                  required
                />
              </div>
              <div className="flex flex-wrap justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={sending}
                  onClick={onClose}
                  className="rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? t("dashboard.report.sending") : t("dashboard.report.submit")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
