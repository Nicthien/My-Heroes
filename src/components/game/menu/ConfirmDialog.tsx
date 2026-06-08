"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * In-game styled confirmation modal — replaces native `window.confirm`. Matches
 * the combat truce/retreat modal look so it feels native to the game shell.
 */
export default function ConfirmDialog({
  open,
  title,
  eyebrow,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const accent =
    tone === "danger"
      ? { border: "border-red-700", eyebrow: "text-red-400", title: "text-red-100", confirm: "border-red-400 bg-red-900 text-red-50 hover:bg-red-800" }
      : { border: "border-amber-700", eyebrow: "text-amber-400", title: "text-amber-100", confirm: "border-amber-400 bg-amber-900 text-amber-50 hover:bg-amber-800" };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      data-testid="confirm-dialog"
    >
      <div className={`w-[min(92vw,32rem)] rounded-xl border ${accent.border} bg-stone-950 p-6 text-white shadow-2xl`}>
        {eyebrow && <div className={`text-xs font-black uppercase tracking-[0.28em] ${accent.eyebrow}`}>{eyebrow}</div>}
        <h2 className={`mt-2 text-2xl font-bold ${accent.title}`}>{title}</h2>
        {description && <p className="mt-3 text-sm leading-6 text-stone-300">{description}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-stone-600 px-4 py-2 text-sm font-bold text-stone-200 transition hover:bg-stone-800"
            onClick={onCancel}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            className={`rounded-md border px-5 py-2 text-sm font-bold transition ${accent.confirm}`}
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
