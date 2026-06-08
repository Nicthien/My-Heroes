"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";

export type GameMenuItem = {
  key: string;
  label: string;
  hint?: string;
  tone?: "default" | "danger";
  onClick: () => void;
  dataTestId?: string;
};

type GameMenuButtonProps = {
  items: GameMenuItem[];
  align?: "left" | "right";
  compact?: boolean;
  dataTutorial?: string;
  dataTestId?: string;
};

/**
 * Expandable menu button: a single "Menu" trigger that reveals a dropdown of
 * actions (Options / Aide / Quitter on the adventure HUD, Options / Réduire /
 * Quitter in combat). Shared by both screens so they stay consistent.
 */
export default function GameMenuButton({
  items,
  align = "right",
  compact = false,
  dataTutorial,
  dataTestId = "game-menu-button",
}: GameMenuButtonProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const select = (item: GameMenuItem) => {
    setOpen(false);
    item.onClick();
  };

  return (
    <div ref={rootRef} className="relative flex shrink-0" data-tutorial={dataTutorial}>
      <button
        type="button"
        className={`touch-target flex h-full w-full shrink-0 flex-col items-center justify-center rounded-lg border border-amber-700/50 bg-stone-950/80 text-amber-200/90 shadow-inner shadow-black/40 transition hover:border-amber-400/70 hover:bg-amber-950/40 hover:text-amber-100 ${
          compact ? "px-3 py-1" : "px-2 md:px-3"
        }`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("hud.menu")}
        data-testid={dataTestId}
      >
        <MenuGlyph className="h-4 w-4" />
        <span className="mt-0.5 text-[0.6rem] font-black uppercase tracking-[0.2em] leading-none">
          {t("hud.menu")}
        </span>
      </button>

      {open && (
        <div
          className={`absolute top-[calc(100%+0.5rem)] z-[55] w-52 overflow-hidden rounded-md border border-amber-600/60 bg-stone-950/95 p-1 text-amber-100 shadow-2xl shadow-black/70 backdrop-blur ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`flex w-full flex-col items-start gap-0.5 rounded px-3 py-2 text-left transition ${
                item.tone === "danger"
                  ? "hover:bg-red-950/50 hover:text-red-100"
                  : "hover:bg-amber-950/50 hover:text-amber-50"
              }`}
              onClick={() => select(item)}
              data-testid={item.dataTestId}
            >
              <span className="text-sm font-bold uppercase tracking-wider">{item.label}</span>
              {item.hint && (
                <span className="text-[11px] font-semibold text-amber-200/55">{item.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}
