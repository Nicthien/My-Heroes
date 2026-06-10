"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { probeGpuRenderer } from "@/lib/rendering/phaser/adaptiveQuality";

const DISMISSED_KEY = "my-heroes:dashboard:perf-warning-dismissed";

// Probes the GPU backend on the dashboard (before any game loads) and warns the
// player in a modal if WebGL is likely to run slow — typically Edge falling
// back to software rendering when hardware acceleration is off. "Ne plus
// afficher" persists the dismissal so the modal never shows again on this device.
export function RenderPerformanceWarning() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISSED_KEY) === "true") return;
    const result = probeGpuRenderer();
    if (!result?.likelyLaggy) return;
    // Defer out of the synchronous effect body (rule: no setState in effect).
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVisible(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [visible]);

  if (!visible) return null;

  const dismissForever = () => {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("dashboard.perfWarningTitle")}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setVisible(false);
      }}
      data-testid="perf-warning-modal"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-600/60 bg-gradient-to-b from-[#1a1208] via-stone-950 to-black/95 p-5 text-amber-100 shadow-2xl shadow-black/70">
        <div className="flex items-start gap-3 border-b border-amber-700/40 pb-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            ⚠️
          </span>
          <h2 className="text-base font-black uppercase tracking-[0.14em] text-amber-200">
            {t("dashboard.perfWarningTitle")}
          </h2>
        </div>
        <p className="mt-4 text-sm leading-snug text-amber-100/85">{t("dashboard.perfWarningBody")}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={dismissForever}
            className="rounded-md border border-amber-700/40 bg-transparent px-3 py-2 text-sm font-semibold text-amber-200/70 transition hover:border-amber-500/60 hover:text-amber-100"
          >
            {t("dashboard.perfWarningDismiss")}
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded-md border border-amber-400/60 bg-amber-950/50 px-4 py-2 text-sm font-black uppercase tracking-wide text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-900/50"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
