"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";

type Tone = "emerald" | "sky" | "amber";

const TONE_STYLES: Record<Tone, {
  border: string;
  inputBorder: string;
  inputFocus: string;
  labelText: string;
  maxText: string;
  footerText: string;
  submitBorder: string;
  submitBg: string;
  submitHover: string;
  submitText: string;
  cancelHover: string;
}> = {
  emerald: {
    border: "border-emerald-400/50",
    inputBorder: "border-amber-700/60",
    inputFocus: "focus:border-emerald-400",
    labelText: "text-amber-100",
    maxText: "text-emerald-300",
    footerText: "text-amber-200/70",
    submitBorder: "border-emerald-400/60",
    submitBg: "from-emerald-600 to-emerald-800",
    submitHover: "hover:from-emerald-500 hover:to-emerald-700",
    submitText: "text-emerald-50",
    cancelHover: "hover:border-amber-700 hover:text-amber-100",
  },
  sky: {
    border: "border-sky-400/50",
    inputBorder: "border-sky-700/70",
    inputFocus: "focus:border-sky-300",
    labelText: "text-sky-100",
    maxText: "text-sky-300",
    footerText: "text-sky-200/70",
    submitBorder: "border-sky-400/60",
    submitBg: "from-sky-600 to-sky-800",
    submitHover: "hover:from-sky-500 hover:to-sky-700",
    submitText: "text-sky-50",
    cancelHover: "hover:border-sky-700 hover:text-sky-100",
  },
  amber: {
    border: "border-amber-400/50",
    inputBorder: "border-amber-700/70",
    inputFocus: "focus:border-amber-300",
    labelText: "text-amber-100",
    maxText: "text-amber-300",
    footerText: "text-amber-200/70",
    submitBorder: "border-amber-400/60",
    submitBg: "from-amber-600 to-amber-800",
    submitHover: "hover:from-amber-500 hover:to-amber-700",
    submitText: "text-amber-50",
    cancelHover: "hover:border-amber-700 hover:text-amber-100",
  },
};

export function CountDialog({
  tone,
  max,
  count,
  onCountChange,
  onSubmit,
  onClose,
  footer,
  submitLabel,
}: {
  tone: Tone;
  max: number;
  count: number;
  onCountChange: (next: number) => void;
  onSubmit: () => void;
  onClose: () => void;
  footer: ReactNode;
  submitLabel: string;
}) {
  const { t } = useI18n();
  const styles = TONE_STYLES[tone];
  const inputTextColor = tone === "sky" ? "text-sky-50" : "text-amber-50";

  return (
    <form
      className={`pointer-events-auto absolute left-[21.75rem] top-[18rem] z-50 w-56 rounded-md border ${styles.border} bg-stone-950/95 p-3 shadow-2xl shadow-black/70 max-[620px]:bottom-24 max-[620px]:left-4 max-[620px]:right-4 max-[620px]:top-auto max-[620px]:w-auto`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={`mb-2 flex items-center justify-between gap-3 text-xs font-bold ${styles.labelText}`}>
        <span>{t("common.count")}</span>
        <span className={styles.maxText}>Max {max}</span>
      </div>
      <input
        type="number"
        min={1}
        max={max}
        value={count}
        onChange={(event) => {
          const next = Math.min(
            Math.max(1, Math.floor(Number(event.currentTarget.value) || 1)),
            max
          );
          onCountChange(next);
        }}
        className={`h-10 w-full rounded-md border ${styles.inputBorder} bg-black/70 px-3 text-center text-sm font-black tabular-nums ${inputTextColor} outline-none ${styles.inputFocus}`}
      />
      <div className={`mt-2 text-center text-[11px] font-bold ${styles.footerText}`}>
        {footer}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`h-9 rounded-md border border-stone-700 bg-stone-900 text-xs font-black text-stone-300 ${styles.cancelHover}`}
          onClick={onClose}
        >
          Annuler
        </button>
        <button
          type="submit"
          className={`h-9 rounded-md border ${styles.submitBorder} bg-gradient-to-b ${styles.submitBg} text-xs font-black ${styles.submitText} ${styles.submitHover}`}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
