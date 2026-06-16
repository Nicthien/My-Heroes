"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";
import {
  KEYBOARD_PREFERENCE_EVENT,
  SHORTCUT_ACTIONS,
  getSavedBindings,
  getSavedLayout,
  keyCodeLabel,
  resetBindings,
  saveBindings,
  saveLayout,
  type KeyboardLayout,
  type ShortcutAction,
  type ShortcutBindings,
} from "@/lib/settings/keyboardPreferences";

const ACTION_LABEL_KEYS: Record<ShortcutAction, TranslationKey> = {
  cameraUp: "shortcut.cameraUp",
  cameraDown: "shortcut.cameraDown",
  cameraLeft: "shortcut.cameraLeft",
  cameraRight: "shortcut.cameraRight",
  centerSelection: "shortcut.centerSelection",
  cycleHero: "shortcut.cycleHero",
  cycleTown: "shortcut.cycleTown",
  endTurn: "shortcut.endTurn",
  zoomIn: "shortcut.zoomIn",
  zoomOut: "shortcut.zoomOut",
  toggleMenu: "shortcut.toggleMenu",
};

const LAYOUT_OPTIONS: { value: KeyboardLayout; labelKey: TranslationKey }[] = [
  { value: "fr", labelKey: "options.keyboardLayoutFr" },
  { value: "en", labelKey: "options.keyboardLayoutEn" },
];

/**
 * Options section to pick the keyboard layout (FR/EN, drives how keys are
 * displayed) and rebind every shortcut. Bindings persist through
 * `keyboardPreferences` and broadcast so the live shortcuts hook resyncs.
 */
export default function KeyboardShortcutsPanel() {
  const { t } = useI18n();
  const [layout, setLayout] = useState<KeyboardLayout>(getSavedLayout);
  const [bindings, setBindings] = useState<ShortcutBindings>(getSavedBindings);
  const [listeningAction, setListeningAction] = useState<ShortcutAction | null>(null);

  // Keep in sync with changes made elsewhere (other tabs, reset).
  useEffect(() => {
    const sync = () => {
      setLayout(getSavedLayout());
      setBindings(getSavedBindings());
    };
    window.addEventListener(KEYBOARD_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(KEYBOARD_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Capture the next key press while rebinding an action.
  useEffect(() => {
    if (!listeningAction) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      // Escape cancels the capture without rebinding.
      if (event.code === "Escape") {
        setListeningAction(null);
        return;
      }
      // Ignore lone modifier presses; wait for a real key.
      if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(event.code)) {
        return;
      }
      const next: ShortcutBindings = { ...bindings };
      // Free this code from any other action so two actions can't share a key.
      for (const action of SHORTCUT_ACTIONS) {
        if (next[action] === event.code) next[action] = "";
      }
      next[listeningAction] = event.code;
      setBindings(next);
      saveBindings(next);
      setListeningAction(null);
    };
    window.addEventListener("keydown", capture, { capture: true });
    return () => window.removeEventListener("keydown", capture, { capture: true });
  }, [listeningAction, bindings]);

  const changeLayout = (value: KeyboardLayout) => {
    setLayout(value);
    saveLayout(value);
  };

  const handleReset = () => {
    setBindings(resetBindings());
    setListeningAction(null);
  };

  return (
    <div className="mt-2 rounded border border-amber-700/35 bg-black/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{t("options.keyboardLayout")}</p>
        <button
          type="button"
          className="touch-target rounded border border-amber-700/40 bg-stone-950/60 px-2 py-1 text-[11px] font-bold text-amber-200/80 transition hover:border-amber-400/70 hover:text-amber-100"
          onClick={handleReset}
        >
          {t("options.keyboardReset")}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t("options.keyboardLayout")}>
        {LAYOUT_OPTIONS.map(({ value, labelKey }) => {
          const active = layout === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => changeLayout(value)}
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

      <p className="mt-2.5 text-[11px] font-semibold text-amber-200/60">{t("options.keyboardHint")}</p>

      <ul className="mt-2 space-y-1">
        {SHORTCUT_ACTIONS.map((action) => {
          const listening = listeningAction === action;
          const code = bindings[action];
          return (
            <li key={action} className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-amber-100/90">{t(ACTION_LABEL_KEYS[action])}</span>
              <button
                type="button"
                onClick={() => setListeningAction(listening ? null : action)}
                className={`touch-target min-w-[4.5rem] rounded border px-2 py-1 text-center text-[12px] font-black uppercase tracking-wider transition ${
                  listening
                    ? "animate-pulse border-amber-300 bg-amber-500/30 text-amber-50"
                    : "border-amber-700/50 bg-stone-950/70 text-amber-100 hover:border-amber-400/70 hover:bg-amber-950/40"
                }`}
              >
                {listening ? t("options.keyboardListening") : keyCodeLabel(code, layout)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
