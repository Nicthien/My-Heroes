"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CornerOrnaments,
  ParchmentBackground,
  goldText,
  ornateFramePolished,
} from "@/components/game/hud/theme";
import { useSupabaseUser } from "@/lib/auth/client";
import { KOFI_URL } from "./dashboardConstants";
import type { TranslationKey } from "@/lib/i18n/translate";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 21s-6.7-4.35-9.33-8.05C.9 10.4 1.5 7.1 4.1 5.9c1.9-.88 4.07-.2 5.2 1.43L12 10l2.7-2.67c1.13-1.63 3.3-2.31 5.2-1.43 2.6 1.2 3.2 4.5 1.43 7.05C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}

interface SupportPromptState {
  logins: number;
  shown: boolean;
  lastSignIn: string | null;
}

/**
 * Persisted, per-user nudge that opens the Ko-fi prompt the second time a player
 * signs in, then never again. A "login" is detected by a change of the Supabase
 * `last_sign_in_at` timestamp, which updates on each real sign-in but stays stable
 * across token refreshes and dashboard re-mounts — so logging out and back in
 * (even in the same tab) correctly counts as a new connection.
 */
export function useSupportPrompt() {
  const user = useSupabaseUser();
  const userId = user?.id;
  const lastSignIn = user?.last_sign_in_at ?? null;
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    const persistKey = `myheroes:support-prompt:${userId}`;

    let state: SupportPromptState = { logins: 0, shown: false, lastSignIn: null };
    try {
      const raw = window.localStorage.getItem(persistKey);
      if (raw) state = { ...state, ...JSON.parse(raw) };
    } catch {
      // Corrupt/inaccessible storage — fall back to defaults.
    }

    // Count a connection only when the sign-in timestamp changes (new session).
    if (lastSignIn && lastSignIn !== state.lastSignIn) {
      state = { ...state, logins: state.logins + 1, lastSignIn };
      try {
        window.localStorage.setItem(persistKey, JSON.stringify(state));
      } catch {
        // Ignore write failures (private mode, quota, etc.).
      }
    }

    if (!state.shown && state.logins >= 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldShow(true);
    }
  }, [userId, lastSignIn]);

  const dismiss = useCallback(() => {
    setShouldShow(false);
    if (!userId || typeof window === "undefined") return;
    const persistKey = `myheroes:support-prompt:${userId}`;
    try {
      const raw = window.localStorage.getItem(persistKey);
      const prev = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(persistKey, JSON.stringify({ ...prev, shown: true }));
    } catch {
      // Ignore write failures.
    }
  }, [userId]);

  return { shouldShow, dismiss };
}

/** Discreet "Support the game" link-button. */
export function SupportButton({ t }: { t: TFn }) {
  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-rose-400/50 bg-stone-950/70 px-4 py-2 text-sm font-bold uppercase tracking-wider text-rose-200/90 transition hover:border-rose-300/70 hover:bg-rose-950/40 hover:text-rose-100"
    >
      <HeartIcon className="h-4 w-4 text-rose-400" />
      {t("support.button")}
    </a>
  );
}

/** One-time modal nudging the player toward the Ko-fi page. */
export function SupportPromptModal({ t, onClose }: { t: TFn; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-prompt-title"
        className={`relative ${ornateFramePolished} w-full max-w-md p-5 sm:p-6 text-center`}
        onClick={(event) => event.stopPropagation()}
      >
        <CornerOrnaments />
        <ParchmentBackground />
        <HeartIcon className="mx-auto mb-3 h-10 w-10 text-rose-400 drop-shadow" />
        <h2 id="support-prompt-title" className={`mb-3 text-xl font-black uppercase tracking-[0.18em] ${goldText}`}>
          {t("support.promptTitle")}
        </h2>
        <p className="mb-6 text-sm leading-6 text-amber-100/85">
          {t("support.promptBody")}
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-700/40 bg-stone-950/70 px-5 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100"
          >
            {t("support.promptDismiss")}
          </button>
          <a
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-400/60 bg-gradient-to-b from-rose-600 to-rose-800 px-5 py-2 text-sm font-black uppercase tracking-wider text-rose-50 shadow-[inset_0_0_0_1px_rgba(254,205,211,0.25)] transition hover:from-rose-500 hover:to-rose-700"
          >
            <HeartIcon className="h-4 w-4" />
            {t("support.promptConfirm")}
          </a>
        </div>
      </div>
    </div>
  );
}
