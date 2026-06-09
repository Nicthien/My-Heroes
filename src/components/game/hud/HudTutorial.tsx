"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { useGameStore } from "@/lib/stores/gameStore";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";
import { setTutorialSeen } from "./helpers";
import {
  CornerOrnaments,
  ParchmentBackground,
  goldText,
  ornateFramePolished,
} from "./theme";

interface TutorialStep {
  icon: string;
  /** CSS selector of the real HUD element to spotlight (absent = centered card). */
  target?: string;
  /** Opens the matching panel (selecting the player's first hero/town) on enter. */
  select?: "hero" | "town";
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

// Ordered tour of the main HUD elements. Each step points at a real element via
// a stable selector; when that element is hidden (e.g. desktop-only windows on
// mobile) the step gracefully falls back to a centered card. The hero/town steps
// open their panel first so it can be highlighted.
const STEPS: TutorialStep[] = [
  { icon: "🗺️", titleKey: "tutorial.welcomeTitle", bodyKey: "tutorial.welcomeBody" },
  { icon: "💰", target: '[data-tutorial="resources"]', titleKey: "tutorial.resourcesTitle", bodyKey: "tutorial.resourcesBody" },
  { icon: "⏳", target: '[data-tutorial="turn-status"]', titleKey: "tutorial.turnTitle", bodyKey: "tutorial.turnBody" },
  { icon: "🧭", target: '[data-testid="hud-map-window"]', titleKey: "tutorial.minimapTitle", bodyKey: "tutorial.minimapBody" },
  { icon: "🛡️", target: '[data-testid="hud-players-window"]', titleKey: "tutorial.playersTitle", bodyKey: "tutorial.playersBody" },
  { icon: "📜", target: '[data-testid="hud-overview-window"]', titleKey: "tutorial.overviewTitle", bodyKey: "tutorial.overviewBody" },
  { icon: "🦸", target: '[data-testid="hud-hero-panel"]', select: "hero", titleKey: "tutorial.heroTitle", bodyKey: "tutorial.heroBody" },
  { icon: "🏯", target: '[data-testid="hud-town-panel"]', select: "town", titleKey: "tutorial.townTitle", bodyKey: "tutorial.townBody" },
  { icon: "⚔️", target: '[data-tutorial="end-turn"]', titleKey: "tutorial.endTurnTitle", bodyKey: "tutorial.endTurnBody" },
  { icon: "🏰", target: '[data-tutorial="menu"]', titleKey: "tutorial.menuTitle", bodyKey: "tutorial.menuBody" },
  { icon: "✨", select: "hero", titleKey: "tutorial.doneTitle", bodyKey: "tutorial.doneBody" },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 340;
const CARD_ESTIMATED_HEIGHT = 250;
const CARD_GAP = 16;
// The hero/town panels mount a frame or two after selection; retry the measure
// across a handful of animation frames before giving up and centering the card.
const MEASURE_RETRIES = 15;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Guided HUD tour with a moving spotlight. Dims the screen, cuts a hole over the
 * current element (via a large box-shadow) and shows an explanatory card next to
 * it. Offers Previous/Next, a "don't show again" checkbox and a Skip button.
 *
 * `heroId` / `townId` are the player's first hero/town: the matching steps open
 * those panels so they can be highlighted, and the prior selection is restored
 * when the tour closes.
 */
export function HudTutorial({
  heroId,
  townId,
  onClose,
}: {
  heroId?: string;
  townId?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  // Snapshot the selection at mount so the tour can restore it on close.
  const [initialSelection] = useState(() => ({
    hero: useGameStore.getState().selectedHeroId,
    town: useGameStore.getState().selectedTownId,
  }));

  const step = STEPS[index];
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  // Open the relevant panel, then measure the target after layout and keep it in
  // sync on resize/scroll. setState runs from rAF / listener callbacks (not
  // synchronously in the effect body) so the spotlight tracks the live DOM.
  useEffect(() => {
    const current = STEPS[index];
    if (current.select === "hero" && heroId) {
      useGameStore.getState().selectTown(null);
      useGameStore.getState().selectHero(heroId);
    } else if (current.select === "town" && townId) {
      useGameStore.getState().selectHero(null);
      useGameStore.getState().selectTown(townId);
    }

    let raf = 0;
    let attempts = 0;
    const measure = () => {
      const selector = current.target;
      if (!selector) {
        setRect(null);
        return;
      }
      const element = document.querySelector(selector);
      const r = element?.getBoundingClientRect();
      const visible =
        r &&
        r.width >= 4 &&
        r.height >= 4 &&
        r.bottom > 0 &&
        r.right > 0 &&
        r.top < window.innerHeight &&
        r.left < window.innerWidth;
      if (!visible) {
        if (attempts < MEASURE_RETRIES) {
          attempts += 1;
          raf = requestAnimationFrame(measure);
          return;
        }
        setRect(null);
        return;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [index, heroId, townId]);

  const close = () => {
    if (dontShowAgain) setTutorialSeen(true);
    // Leave the player on their hero, ready to explore, rather than restoring a
    // possibly-empty initial selection or the town panel from the previous step.
    if (heroId) {
      useGameStore.getState().selectTown(null);
      useGameStore.getState().selectHero(heroId);
    } else {
      useGameStore.getState().selectHero(initialSelection.hero);
      useGameStore.getState().selectTown(initialSelection.town);
    }
    onClose();
  };
  const next = () => (isLast ? close() : setIndex((i) => i + 1));
  const previous = () => setIndex((i) => Math.max(0, i - 1));

  const holeStyle: CSSProperties | null = rect
    ? {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  const cardStyle = computeCardStyle(rect);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[80]" data-testid="hud-tutorial">
      {holeStyle ? (
        <div
          className="absolute rounded-xl ring-2 ring-amber-300/80 transition-all duration-300 ease-out"
          style={{ ...holeStyle, boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)", pointerEvents: "none" }}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-black/72" aria-hidden="true" />
      )}

      <div
        className={`${ornateFramePolished} absolute flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
      >
        <CornerOrnaments />
        <ParchmentBackground />

        <div className="relative flex items-center gap-2 border-b border-amber-700/40 px-4 py-2.5">
          <span className="text-xl leading-none">{step.icon}</span>
          <span className={`flex-1 text-sm font-black uppercase tracking-[0.16em] ${goldText}`}>
            {t(step.titleKey)}
          </span>
          <span className="shrink-0 rounded border border-amber-700/40 bg-black/40 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-amber-200/80">
            {t("tutorial.step", { current: index + 1, total: STEPS.length })}
          </span>
        </div>

        <div className="relative flex-1 overflow-y-auto px-4 py-3">
          <p className="text-sm leading-snug text-amber-100/90">{t(step.bodyKey)}</p>

          <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-4 bg-amber-400" : "w-1.5 bg-amber-700/50"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative flex flex-col gap-2.5 border-t border-amber-700/30 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-amber-200/80">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
              data-testid="tutorial-dont-show"
              className="h-4 w-4 accent-amber-500"
            />
            {t("tutorial.dontShowAgain")}
          </label>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={close}
              data-testid="tutorial-skip"
              className="rounded-md border border-amber-700/40 bg-stone-950/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100"
            >
              {t("tutorial.skip")}
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={previous}
                  data-testid="tutorial-prev"
                  className="rounded-md border border-amber-700/40 bg-stone-950/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-200/80 transition hover:border-amber-500/50 hover:text-amber-100"
                >
                  {t("tutorial.previous")}
                </button>
              )}
              <button
                onClick={next}
                data-testid={isLast ? "tutorial-finish" : "tutorial-next"}
                className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700"
              >
                {isLast ? t("tutorial.finish") : t("tutorial.next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Position the explanatory card next to the spotlit element (below if there's
 * room, otherwise above), clamped to the viewport. With no target the card is
 * centered. Falls back to a centered position during SSR (no `window`).
 */
function computeCardStyle(rect: Rect | null): CSSProperties {
  if (typeof window === "undefined") {
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_WIDTH };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: Math.min(CARD_WIDTH, vw - 24) };
  }

  const hole = {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
  const width = Math.min(CARD_WIDTH, vw - 24);
  const fitsBelow = hole.top + hole.height + CARD_GAP + CARD_ESTIMATED_HEIGHT < vh;
  const top = fitsBelow
    ? hole.top + hole.height + CARD_GAP
    : Math.max(12, hole.top - CARD_GAP - CARD_ESTIMATED_HEIGHT);
  const left = clamp(rect.left + rect.width / 2 - width / 2, 12, vw - width - 12);

  return { top, left, width };
}
