"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import AudioSettingsPanel from "@/components/game/audio/AudioSettingsPanel";
import KeyboardShortcutsPanel from "@/components/game/menu/KeyboardShortcutsPanel";
import {
  DISPLAY_PREFERENCE_EVENT,
  getSavedAnimationsEnabled,
  getSavedFpsDisplay,
  getSavedRenderQuality,
  saveAnimationsEnabled,
  saveFpsDisplay,
  saveRenderQuality,
  type RenderQualityMode,
} from "@/lib/settings/displayPreferences";
import type { TranslationKey } from "@/lib/i18n/translate";

const RENDER_QUALITY_OPTIONS: { mode: RenderQualityMode; labelKey: TranslationKey }[] = [
  { mode: "auto", labelKey: "options.renderQualityAuto" },
  { mode: "performance", labelKey: "options.renderQualityPerformance" },
  { mode: "high", labelKey: "options.renderQualityHigh" },
];

type OptionsTab = "audio" | "display" | "keyboard";

const OPTIONS_TABS: { id: OptionsTab; labelKey: TranslationKey }[] = [
  { id: "audio", labelKey: "options.tabAudio" },
  { id: "display", labelKey: "options.tabDisplay" },
  { id: "keyboard", labelKey: "options.tabKeyboard" },
];

type OptionsDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Full in-game options menu opened from the HUD/combat menu. Organised into
 * tabs — Sound, Graphics, Keyboard — each hosting its own settings panel.
 */
export default function OptionsDialog({ open, onClose }: OptionsDialogProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<OptionsTab>("audio");
  const [animationsEnabled, setAnimationsEnabled] = useState(getSavedAnimationsEnabled);
  const [renderQuality, setRenderQuality] = useState(getSavedRenderQuality);
  const [fpsEnabled, setFpsEnabled] = useState(getSavedFpsDisplay);

  useEffect(() => {
    const sync = () => {
      setAnimationsEnabled(getSavedAnimationsEnabled());
      setRenderQuality(getSavedRenderQuality());
      setFpsEnabled(getSavedFpsDisplay());
    };
    window.addEventListener(DISPLAY_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISPLAY_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const toggleAnimations = () => {
    const next = !animationsEnabled;
    setAnimationsEnabled(next);
    saveAnimationsEnabled(next);
  };

  const changeRenderQuality = (mode: RenderQualityMode) => {
    setRenderQuality(mode);
    saveRenderQuality(mode);
  };

  const toggleFps = () => {
    const next = !fpsEnabled;
    setFpsEnabled(next);
    saveFpsDisplay(next);
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("options.title")}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="options-dialog"
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-amber-600/60 bg-gradient-to-b from-[#1a1208] via-stone-950 to-black/95 text-amber-100 shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between border-b border-amber-700/40 px-5 pt-5 pb-3">
          <h2 className="text-lg font-black uppercase tracking-[0.18em] text-amber-200">
            {t("options.title")}
          </h2>
          <button
            type="button"
            className="touch-target rounded-md border border-amber-700/50 bg-stone-950/80 px-3 text-sm font-black text-amber-100 transition hover:border-amber-400/70 hover:bg-amber-950/40"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3" role="tablist" aria-label={t("options.title")}>
          {OPTIONS_TABS.map(({ id, labelKey }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                data-testid={`options-tab-${id}`}
                className={`touch-target flex-1 rounded-t-md border-b-2 px-2 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                  active
                    ? "border-amber-400 bg-amber-500/15 text-amber-100"
                    : "border-transparent text-amber-200/55 hover:bg-amber-950/30 hover:text-amber-100"
                }`}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          {tab === "audio" && (
            <section role="tabpanel" aria-label={t("options.tabAudio")}>
              <AudioSettingsPanel />
            </section>
          )}

          {tab === "display" && (
            <section role="tabpanel" aria-label={t("options.tabDisplay")}>
              <div className="rounded border border-amber-700/35 bg-black/30 px-3 py-2.5">
                <p className="text-sm font-bold">{t("options.renderQuality")}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t("options.renderQuality")}>
                  {RENDER_QUALITY_OPTIONS.map(({ mode, labelKey }) => {
                    const active = renderQuality === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => changeRenderQuality(mode)}
                        className={`touch-target rounded border px-1.5 py-1.5 text-[11px] font-bold leading-tight transition ${
                          active
                            ? "border-amber-400/80 bg-amber-500/20 text-amber-100"
                            : "border-amber-700/40 bg-stone-950/60 text-amber-200/70 hover:border-amber-500/60 hover:text-amber-100"
                        }`}
                      >
                        {t(labelKey)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-amber-200/60">{t("options.renderQualityHint")}</p>
              </div>
              <label className="mt-2 flex cursor-pointer items-start gap-3 rounded border border-amber-700/35 bg-black/30 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={animationsEnabled}
                  onChange={toggleAnimations}
                  className="mt-0.5 h-4 w-4 accent-amber-300"
                />
                <span className="text-sm">
                  <span className="font-bold">{t("options.animations")}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-amber-200/60">
                    {t("options.animationsHint")}
                  </span>
                </span>
              </label>
              <label className="mt-2 flex cursor-pointer items-start gap-3 rounded border border-amber-700/35 bg-black/30 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={fpsEnabled}
                  onChange={toggleFps}
                  className="mt-0.5 h-4 w-4 accent-amber-300"
                />
                <span className="text-sm">
                  <span className="font-bold">{t("options.showFps")}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-amber-200/60">
                    {t("options.showFpsHint")}
                  </span>
                </span>
              </label>
            </section>
          )}

          {tab === "keyboard" && (
            <section role="tabpanel" aria-label={t("options.tabKeyboard")}>
              <KeyboardShortcutsPanel />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
