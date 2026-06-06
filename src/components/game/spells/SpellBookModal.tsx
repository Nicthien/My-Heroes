"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Hero } from "@/lib/game/types";
import {
  SPELLS,
  getHeroMana,
  getHeroMaxMana,
  getSpellCost,
  heroKnowsSpell,
  spellRequiresAdventureTarget,
  spellRequiresCombatTarget,
  type SpellContext,
  type SpellDefinition,
  type SpellSchool,
} from "@/lib/game/spells";
import { goldText, ornateFramePolished } from "@/components/game/hud/theme";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";
import { localizedSpellLabel, localizedSpellEffect } from "@/lib/game/spells-i18n";

const SCHOOL_TABS: Array<{ id: SpellSchool | "all_schools"; labelKey: TranslationKey }> = [
  { id: "all_schools", labelKey: "spell.schoolAll" },
  { id: "air", labelKey: "spell.schoolAir" },
  { id: "earth", labelKey: "spell.schoolEarth" },
  { id: "fire", labelKey: "spell.schoolFire" },
  { id: "water", labelKey: "spell.schoolWater" },
];

const SCHOOL_LABEL_KEY: Record<SpellSchool, TranslationKey> = {
  air: "spell.schoolAir",
  earth: "spell.schoolEarth",
  fire: "spell.schoolFire",
  water: "spell.schoolWater",
  all: "spell.schoolAll",
};

export function SpellBookButton({ onClick, label, disabled = false, tooltipAlign = "center" }: { onClick: () => void; label?: string; disabled?: boolean; tooltipAlign?: "center" | "right" }) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t("spell.book");
  // Right-anchor the tooltip when the button sits at a container's right edge so
  // the wide label doesn't overflow and get clipped by an overflow-hidden panel.
  const tooltipPosition = tooltipAlign === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={resolvedLabel}
      title={resolvedLabel}
      className="group relative grid h-9 w-9 shrink-0 place-items-center rounded-md border border-violet-400/50 bg-violet-950/70 text-violet-100 shadow-[0_0_0_1px_rgba(221,214,254,0.14)_inset] transition hover:border-violet-200 hover:bg-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-violet-400/50 disabled:hover:bg-violet-950/70"
    >
      <BookIcon className="h-5 w-5" />
      <span className={`pointer-events-none absolute bottom-full ${tooltipPosition} z-50 mb-2 whitespace-nowrap rounded-md border border-violet-400/50 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-violet-100 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100`}>
        {resolvedLabel}
      </span>
    </button>
  );
}

export function SpellBookModal({
  hero,
  context,
  title,
  onClose,
  onCast,
  canCast = true,
  ignoreManaCost = false,
  grantAllSpells = false,
  targetLabel,
}: {
  hero: Hero;
  context: SpellContext;
  title?: string;
  onClose: () => void;
  onCast?: (spell: SpellDefinition, target?: { x: number; y: number }) => Promise<void> | void;
  canCast?: boolean;
  ignoreManaCost?: boolean;
  /** Dev cheat: list and allow every spell regardless of what the hero knows. */
  grantAllSpells?: boolean;
  targetLabel?: string | null;
}) {
  const { t, locale } = useI18n();
  const resolvedTitle = title ?? t("spell.book");
  const [activeSchool, setActiveSchool] = useState<SpellSchool | "all_schools">("all_schools");
  const [pendingSpellId, setPendingSpellId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mana = getHeroMana(hero);
  const maxMana = getHeroMaxMana(hero);
  const portalTarget = typeof document === "undefined" ? null : document.body;

  const spells = useMemo(() => {
    return SPELLS
      .filter((spell) => spell.context === context)
      .filter((spell) => grantAllSpells || heroKnowsSpell(hero, spell.id))
      .filter((spell) => activeSchool === "all_schools" || spell.school === activeSchool || spell.school === "all")
      .sort((a, b) => a.level - b.level || a.school.localeCompare(b.school) || a.label.localeCompare(b.label));
  }, [activeSchool, context, hero, grantAllSpells]);

  async function castSpell(spell: SpellDefinition) {
    if (!onCast) return;
    setPendingSpellId(spell.id);
    setMessage(null);
    try {
      await onCast(spell);
      if (!spellRequiresAdventureTarget(spell) && !spellRequiresCombatTarget(spell)) {
        setMessage(t("spell.castDone", { label: localizedSpellLabel(spell, locale) }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("msg.actionImpossible"));
    } finally {
      setPendingSpellId(null);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[999] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={resolvedTitle}>
      <section className={`${ornateFramePolished} relative flex max-h-[min(42rem,calc(100vh-2rem))] w-[min(58rem,calc(100vw-2rem))] flex-col overflow-hidden text-amber-50`}>
        <header className="flex items-center gap-3 border-b border-amber-700/50 bg-stone-950/90 px-4 py-3">
          <BookIcon className="h-6 w-6 shrink-0 text-violet-200" />
          <div className="min-w-0 flex-1">
            <h2 className={`truncate text-lg font-black ${goldText}`}>{resolvedTitle}</h2>
            <div className="text-xs text-amber-200/70">
              {t("spell.manaLine", { name: hero.name, mana, max: maxMana })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-700/50 bg-black/35 px-3 py-1 text-sm font-bold text-amber-100 transition hover:border-amber-300"
          >
            {t("common.close")}
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 border-b border-amber-900/40 bg-black/35 px-4 py-3" aria-label={t("spell.schoolAll")}>
          {SCHOOL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSchool(tab.id)}
              className={`rounded-md border px-3 py-1.5 text-sm font-black transition ${
                activeSchool === tab.id
                  ? "border-amber-300/80 bg-amber-800/55 text-amber-50"
                  : "border-amber-800/50 bg-stone-950/65 text-amber-200/70 hover:border-amber-500/70"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>

        {targetLabel && (
          <div className="border-b border-amber-900/40 bg-violet-950/30 px-4 py-2 text-sm text-violet-100">
            {t("hero.target", { label: targetLabel })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {spells.length === 0 ? (
            <p className="rounded-md border border-amber-800/40 bg-stone-950/55 px-4 py-6 text-center text-sm text-amber-200/70">
              {t("spell.noSpells")}
            </p>
          ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {spells.map((spell) => {
              const known = grantAllSpells || heroKnowsSpell(hero, spell.id);
              const cost = getSpellCost(spell);
              const disabledReason = getDisabledReason({ spell, known, mana, cost, canCast, hasSpellBook: hero.hasSpellBook || grantAllSpells, ignoreManaCost, t });
              const disabled = Boolean(disabledReason) || pendingSpellId !== null;
              return (
                <article
                  key={spell.id}
                  className={`rounded-md border p-3 shadow-[0_0_0_1px_rgba(0,0,0,0.25)_inset] ${
                    spell.implemented
                      ? "border-amber-700/55 bg-stone-950/72"
                      : "border-stone-700/60 bg-stone-950/45 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded border text-xs font-black ${schoolClass(spell.school)}`}>
                      {schoolInitial(spell.school)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-amber-100">{localizedSpellLabel(spell, locale)}</h3>
                      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-amber-200/55">
                        {t("spell.meta", { school: t(SCHOOL_LABEL_KEY[spell.school]), level: spell.level, cost })}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 min-h-10 text-sm leading-snug text-stone-200/85">{localizedSpellEffect(spell, locale)}</p>
                  {spell.damage && (
                    <div className="mt-2 rounded border border-red-700/30 bg-red-950/25 px-2 py-1 text-xs text-red-100/85">
                      {t("spell.damage", { base: spell.damage.base[0], mult: spell.damage.multiplier })}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`text-xs ${!spell.implemented ? "font-black text-red-300" : "text-amber-200/55"}`}>
                      {disabledReason ?? t("spell.ready")}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void castSpell(spell)}
                      className="rounded-md border border-violet-400/55 bg-violet-950/80 px-3 py-1.5 text-sm font-black text-violet-50 transition hover:bg-violet-900 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-500"
                    >
                      {pendingSpellId === spell.id ? "..." : t("spell.cast")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          )}
        </div>
        {message && <div className="border-t border-amber-900/40 bg-black/45 px-4 py-2 text-sm text-amber-100">{message}</div>}
      </section>
    </div>
  );

  return portalTarget ? createPortal(modal, portalTarget) : modal;
}

function getDisabledReason({
  spell,
  known,
  mana,
  cost,
  canCast,
  hasSpellBook,
  ignoreManaCost,
  t,
}: {
  spell: SpellDefinition;
  known: boolean;
  mana: number;
  cost: number;
  canCast: boolean;
  hasSpellBook: boolean;
  ignoreManaCost: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  if (!canCast) return t("spell.reasonUnavailable");
  if (!hasSpellBook) return t("spell.reasonBookRequired");
  if (!known) return t("spell.reasonUnknown");
  if (!spell.implemented) return t("spell.reasonNotImplemented");
  if (!ignoreManaCost && mana < cost) return t("spell.reasonNoMana");
  return null;
}

function schoolInitial(school: SpellSchool) {
  if (school === "all") return "*";
  return school[0].toUpperCase();
}

function schoolClass(school: SpellSchool) {
  switch (school) {
    case "air":
      return "border-sky-300/50 bg-sky-950/70 text-sky-100";
    case "earth":
      return "border-emerald-300/50 bg-emerald-950/70 text-emerald-100";
    case "fire":
      return "border-red-300/50 bg-red-950/70 text-red-100";
    case "water":
      return "border-cyan-300/50 bg-cyan-950/70 text-cyan-100";
    default:
      return "border-violet-300/50 bg-violet-950/70 text-violet-100";
  }
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
      <path d="M8 7h7" />
      <path d="M8 11h6" />
    </svg>
  );
}
