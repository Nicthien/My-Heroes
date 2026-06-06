"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import {
  ARTIFACT_SLOTS,
  ARTIFACTS_BY_ID,
  getArtifact,
  getArtifactStatsBonus,
  getEffectiveHeroStats,
  normalizeArtifactBag,
  type ArtifactSlot,
} from "@/lib/game/artifacts";
import { getHeroMaxMana, spellRequiresAdventureTarget, type SpellDefinition } from "@/lib/game/spells";
import { SKILL_DEFINITIONS, type SkillId, type SkillLevel } from "@/lib/game/skills";
import { localizedSkillDescription } from "@/lib/game/skills-i18n";
import { HERO_ARMY_STACK_LIMIT, UNIT_STACK_COUNT_CAP } from "@/lib/game/army-stacks";
import { UnitType, type Hero, type Town, type UnitStack } from "@/lib/game/types";
import { refreshGameState } from "@/lib/game/refresh";
import { normalizeMapLevel } from "@/lib/game/map-levels";
import { useGameStore } from "@/lib/stores/gameStore";
import { SpellBookButton, SpellBookModal } from "@/components/game/spells/SpellBookModal";
import CollapsiblePanel from "./CollapsiblePanel";
import { KingHealthGauge, MovementGauge, Stat } from "./gauges";
import { UnitSprite } from "./UnitSprite";
import { unitTypeLabel } from "./helpers";
import { goldDivider, ornateFramePolished } from "./theme";
import { useDraggableWindow } from "./useDraggableWindow";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedLabelFromId } from "@/lib/i18n/gameLabels";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

type HeroTab = "profile" | "army" | "artifacts" | "skills";

export function HeroPanel({
  hero,
  townAtHero,
  readOnly = false,
  storagePlayerId,
}: {
  hero: Hero;
  townAtHero: Town | undefined;
  readOnly?: boolean;
  storagePlayerId?: string;
}) {
  const { data: session } = useSession();
  const { t, locale } = useI18n();
  const [spellBookOpen, setSpellBookOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HeroTab>("profile");
  const gameState = useGameStore((state) => state.gameState);
  const setGameState = useGameStore((state) => state.setGameState);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const devInfiniteMana = useGameStore((state) => state.devInfiniteMana);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const setPendingAdventureSpell = useGameStore((state) => state.setPendingAdventureSpell);
  const pendingAdventureSpell = useGameStore((state) => state.pendingAdventureSpell);
  const setSpellRevealHighlight = useGameStore((state) => state.setSpellRevealHighlight);
  const heroDraggable = useDraggableWindow({
    storageKey: `my-heroes:hud-window-position:v3:${gameState?.id ?? "dev"}:${storagePlayerId ?? "viewer"}:selected-hero`,
    defaultPosition: { x: 16, y: 112 },
    fallbackSize: { width: 352, height: 520 },
  });
  const displayHero = devInfiniteMana ? { ...hero, mana: getHeroMaxMana(hero) } : hero;
  const kingStack = hero.armies.find((stack) => stack.unitType === UnitType.KING) ?? null;
  const effectiveStats = getEffectiveHeroStats(hero);
  const artifactBonus = getArtifactStatsBonus(hero);
  const eligibleTransferHeroes = gameState?.players
    .find((player) => player.heroes.some((item) => item.id === hero.id))
    ?.heroes.filter((candidate) => candidate.id !== hero.id && canTransferArtifacts(hero, candidate, gameState.players.flatMap((player) => player.towns))) ?? [];
  const heroArtifactBag = normalizeArtifactBag(hero.artifacts);
  const artifactCount = heroArtifactBag.inventory.length + Object.values(heroArtifactBag.equipment).filter(Boolean).length;
  const skillEntries = getHeroSkillEntries(hero, t, locale);
  const heroTabs: { id: HeroTab; label: string; badge?: number }[] = [
    { id: "profile", label: t("hero.tabProfile") },
    { id: "skills", label: t("hero.tabSkills"), badge: skillEntries.length },
    { id: "army", label: t("hero.tabArmy"), badge: hero.armies.length },
    { id: "artifacts", label: t("hero.tabArtifacts"), badge: artifactCount },
  ];

  async function castAdventureSpell(spell: SpellDefinition, target?: { x: number; y: number }) {
    if (!gameState) throw new Error(t("msg.gameUnavailable"));
    if (spellRequiresAdventureTarget(spell) && !target) {
      setPendingAdventureSpell({ heroId: hero.id, spellId: spell.id, label: spell.label });
      setSpellBookOpen(false);
      setCombatMessage(t("hero.spellPickTarget", { label: spell.label }));
      return;
    }
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CAST_ADVENTURE_SPELL",
        heroId: hero.id,
        spellId: spell.id,
        target,
        ...(devInfiniteMana ? { devInfiniteManaHeroId: hero.id } : {}),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(localizedServerMessage(data.error, locale) ?? t("msg.actionImpossible"));
    setPendingAdventureSpell(null);
    if (typeof data?.interaction?.message === "string") setCombatMessage(localizedServerMessage(data.interaction.message, locale));
    const revealedTiles = normalizeRevealedTiles(data?.interaction?.revealedTiles);
    const revealHints = normalizeRevealHints(data?.interaction?.revealHints);
    if (revealedTiles.length > 0 && gameState) {
      setSpellRevealHighlight({ turnNumber: gameState.turnNumber, tiles: revealedTiles, hints: revealHints, label: spell.label });
    }
    const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshed) setGameState(refreshed);
  }

  async function performArtifactAction(body: Record<string, unknown>) {
    if (!gameState) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCombatMessage(localizedServerMessage(data.error, locale) ?? t("msg.actionImpossible"));
      return;
    }
    const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshed) setGameState(refreshed);
  }

  async function performHeroStackAction(body: Record<string, unknown>) {
    if (!gameState) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCombatMessage(localizedServerMessage(data.error, locale) ?? t("msg.actionImpossible"));
      return;
    }
    if (data?.moved) setCombatMessage(t("hero.mergeResult", { n: data.moved }));
    const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshed) setGameState(refreshed);
  }

  return (
    <>
      <CollapsiblePanel
        title={hero.name}
        className={`${ornateFramePolished} mobile-bottom-sheet pointer-events-auto absolute left-4 top-[7rem] flex max-h-[min(32rem,calc(100vh-9rem))] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden`}
        bodyClassName="flex min-h-0 flex-1 flex-col"
        dragHandleProps={heroDraggable.isEnabled ? heroDraggable.dragHandleProps : undefined}
        onResetPosition={heroDraggable.isEnabled ? heroDraggable.resetPosition : undefined}
        rootRef={heroDraggable.ref}
        style={heroDraggable.style}
        testId="hud-hero-panel"
        right={
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-md border border-amber-700/50 text-amber-200 transition hover:border-amber-300 hover:text-amber-100"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              useGameStore.getState().selectHero(null);
            }}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            X
          </button>
        }
      >
        <div className="border-b border-amber-700/30 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-amber-200/60">
            {t("hero.levelXp", { level: hero.level, xp: hero.experience })}
          </div>
          {kingStack && (
            <div className="mt-2">
              <KingHealthGauge health={kingStack.health} maxHealth={kingStack.maxHealth} />
            </div>
          )}
          {(hero.warMachines?.ballista || hero.warMachines?.firstAid || hero.warMachines?.ammoCart) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {hero.warMachines.ballista && (
                <span className="inline-flex rounded-full border border-orange-600/50 bg-orange-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-200">{t("hero.machineBallista")}</span>
              )}
              {hero.warMachines.firstAid && (
                <span className="inline-flex rounded-full border border-emerald-600/50 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">{t("hero.machineTent")}</span>
              )}
              {hero.warMachines.ammoCart && (
                <span className="inline-flex rounded-full border border-sky-600/50 bg-sky-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-200">{t("hero.machineAmmo")}</span>
              )}
            </div>
          )}
          {!readOnly && (hero.pendingSkillChoices?.length ?? 0) > 0 && (
            <PendingSkillChoiceBlock
              hero={hero}
              t={t}
              locale={locale}
              onPicked={async (level, skillId) => {
                if (!gameState) return;
                const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ type: "LEARN_SKILL", heroId: hero.id, level, skillId }),
                });
                if (!response.ok) {
                  setCombatMessage((await response.json())?.error ?? t("hero.skillChoiceImpossible"));
                  return;
                }
                const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
                if (refreshed) setGameState(refreshed);
              }}
            />
          )}
          {!readOnly && pendingAdventureSpell?.heroId === hero.id && (
            <button
              type="button"
              onClick={() => {
                setPendingAdventureSpell(null);
                setCombatMessage(null);
              }}
              className="mt-2 w-full rounded-md border border-violet-400/50 bg-violet-950/65 px-3 py-2 text-left text-sm font-black text-violet-100 transition hover:border-violet-200"
            >
              {t("hero.target", { label: pendingAdventureSpell.label })}
            </button>
          )}
          {townAtHero && (
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-sky-500/40 bg-sky-950/50 px-3 py-2 text-left text-sm text-sky-100 transition hover:border-sky-300/70 hover:bg-sky-900/60"
              onClick={() => useGameStore.getState().selectTown(townAtHero.id)}
            >
              {t("hero.atTown")} <span className="font-black">{townAtHero.name}</span>
            </button>
          )}
        </div>

        <div className="mobile-hero-tabs flex gap-1.5 overflow-visible border-b border-amber-700/30 px-3 py-2">
          {heroTabs.map((tab) => (
            <HeroTabButton
              key={tab.id}
              active={activeTab === tab.id}
              badge={tab.badge}
              icon={<HeroTabIcon tab={tab.id} />}
              label={tab.label}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
          {!readOnly && (
            <div className="ml-auto shrink-0">
              <SpellBookButton onClick={() => setSpellBookOpen(true)} />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {activeTab === "profile" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat label={t("stat.attack")} value={formatStatBonus(effectiveStats.attack, artifactBonus.attack)} color="text-red-300" />
                <Stat label={t("stat.defense")} value={formatStatBonus(effectiveStats.defense, artifactBonus.defense)} color="text-blue-300" />
                <Stat label={t("stat.spellPower")} value={formatStatBonus(effectiveStats.spellPower, artifactBonus.spellPower)} color="text-violet-300" />
                <Stat label={t("stat.knowledge")} value={formatStatBonus(effectiveStats.knowledge, artifactBonus.knowledge)} color="text-cyan-300" />
                <Stat label={t("stat.morale")} value={formatStatBonus(effectiveStats.morale, artifactBonus.morale, true)} color={moraleStatColor(effectiveStats.morale)} />
                <Stat label={t("stat.luck")} value={formatStatBonus(effectiveStats.luck, artifactBonus.luck, true)} color={luckStatColor(effectiveStats.luck)} />
                <Stat label={t("stat.mana")} value={hero.mana} color="text-violet-200" />
              </div>
              <div className={goldDivider} />
              <div className="rounded-md border border-amber-800/35 bg-black/35 px-3 py-2 text-xs text-amber-200/70">
                {t("hero.position")} <span className="font-black text-amber-100">{hero.position.x}, {hero.position.y}</span>
              </div>
            </div>
          )}

          {activeTab === "skills" && <HeroSkillsPanel hero={hero} t={t} locale={locale} />}

          {activeTab === "army" && <HeroArmyPanel hero={hero} readOnly={readOnly} onAction={performHeroStackAction} t={t} locale={locale} />}

          {activeTab === "artifacts" && (
            <ArtifactPanel
              hero={hero}
              readOnly={readOnly}
              t={t}
              eligibleTransferHeroes={eligibleTransferHeroes}
              onEquip={(artifactId, slot) => performArtifactAction({ type: "EQUIP_ARTIFACT", heroId: hero.id, artifactId, slot })}
              onUnequip={(slot) => performArtifactAction({ type: "UNEQUIP_ARTIFACT", heroId: hero.id, slot })}
              onTransfer={(artifactId, toHeroId) => performArtifactAction({ type: "TRANSFER_ARTIFACT", fromHeroId: hero.id, toHeroId, artifactId })}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-amber-700/30 bg-stone-950/65 p-3">
          <MovementGauge movement={hero.movement} maxMovement={hero.maxMovement} />
        </div>
      </CollapsiblePanel>
      {!readOnly && spellBookOpen && (
        <SpellBookModal
          hero={displayHero}
          context="adventure"
          title={t("spell.bookAdventure")}
          ignoreManaCost={devInfiniteMana}
          onClose={() => setSpellBookOpen(false)}
          onCast={castAdventureSpell}
        />
      )}
    </>
  );
}

function formatSignedMorale(value: number | undefined) {
  const v = Number.isFinite(value) ? Math.trunc(value as number) : 0;
  return v > 0 ? `+${v}` : String(v);
}

function formatStatBonus(value: number, bonus: number, signed = false) {
  const formatValue = signed ? formatSignedMorale : (stat: number | undefined) => String(stat ?? 0);
  if (!bonus) return formatValue(value);
  const base = value - bonus;
  return `${formatValue(base)} (${bonus > 0 ? "+" : ""}${bonus})`;
}

function moraleStatColor(value: number | undefined) {
  const v = Number.isFinite(value) ? Math.trunc(value as number) : 0;
  if (v > 0) return "text-emerald-300";
  if (v < 0) return "text-rose-300";
  return "text-amber-200/80";
}

function luckStatColor(value: number | undefined) {
  const v = Number.isFinite(value) ? Math.trunc(value as number) : 0;
  if (v > 0) return "text-yellow-300";
  if (v < 0) return "text-slate-300";
  return "text-amber-200/80";
}

function HeroSkillsPanel({ hero, t, locale }: { hero: Hero; t: TFn; locale: Locale }) {
  const skills = getHeroSkillEntries(hero, t, locale);
  if (skills.length === 0) {
    return (
      <div className="rounded-md border border-amber-900/40 bg-black/30 px-3 py-2 text-xs text-amber-200/55">
        {t("hero.noSkills")}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">{t("hero.tabSkills")}</div>
      <div className="space-y-1">
        {skills.map(({ id, label, description, levelLabel }) => (
          <div key={id} className="rounded-md border border-amber-700/35 bg-black/45 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-black text-amber-100">{label}</span>
              <span className="shrink-0 rounded border border-amber-600/45 bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-200">
                {levelLabel}
              </span>
            </div>
            <div className="mt-1 text-[11px] leading-snug text-amber-200/65">{description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getHeroSkillEntries(hero: Hero, t: TFn, locale: Locale) {
  return Object.entries(hero.skills ?? {})
    .filter((entry): entry is [SkillId, SkillLevel] => isSkillId(entry[0]) && isSkillLevel(entry[1]))
    .map(([id, level]) => {
      const definition = SKILL_DEFINITIONS.find((skill) => skill.id === id);
      return {
        id,
        label: localizedLabelFromId(id, definition?.label ?? id.replace(/_/g, " "), locale),
        description: localizedSkillDescription(id, level, locale),
        level,
        levelLabel: skillLevelLabel(level, t),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function isSkillId(value: string): value is SkillId {
  return SKILL_DEFINITIONS.some((skill) => skill.id === value);
}

function isSkillLevel(value: unknown): value is SkillLevel {
  return value === "basic" || value === "advanced" || value === "expert";
}

function skillLevelLabel(level: SkillLevel, t: TFn) {
  if (level === "basic") return t("skill.levelBasic");
  if (level === "advanced") return t("skill.levelAdvanced");
  return t("skill.levelExpert");
}

function HeroTabButton({
  active,
  badge,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  badge?: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group relative flex h-9 w-12 shrink-0 items-center justify-center rounded-md border px-2 outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/70 ${
        active
          ? "border-amber-300/80 bg-gradient-to-b from-amber-700/45 to-amber-950/70 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.22)]"
          : "border-amber-800/50 bg-black/35 text-amber-300/75 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)] hover:border-amber-500/60 hover:bg-amber-950/35 hover:text-amber-100"
      }`}
    >
      <span className="grid h-5 w-5 place-items-center" aria-hidden="true">
        {icon}
      </span>
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-amber-500/60 bg-amber-950 px-1 text-[10px] font-black leading-none text-amber-100">
          {badge}
        </span>
      )}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-amber-600/60 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-amber-100 opacity-0 shadow-lg shadow-black/50 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

function HeroTabIcon({ tab }: { tab: HeroTab }) {
  const common = "h-5 w-5";
  switch (tab) {
    case "profile":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="7" r="4" />
          <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "skills":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.39 4.84L20 7.6l-3.8 3.7.9 5.24L12 14.77 6.9 16.54l.9-5.24L4 7.6l5.61-.76L12 2z" />
        </svg>
      );
    case "army":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="M9 12l2 2 4-5" />
        </svg>
      );
    case "artifacts":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12l2 6-8 12L4 9l2-6Z" />
          <path d="M4 9h16" />
          <path d="M10 3 8 9l4 12 4-12-2-6" />
        </svg>
      );
  }
}

function HeroArmyPanel({ hero, readOnly, onAction, t, locale }: { hero: Hero; readOnly?: boolean; onAction: (body: Record<string, unknown>) => Promise<void>; t: TFn; locale: Locale }) {
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [splitCount, setSplitCount] = useState(1);
  const sortedArmies = [...hero.armies].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const selected = sortedArmies.find((stack) => stack.id === selectedStackId) ?? null;
  const splitMax = selected ? Math.max(1, selected.count - 1) : 1;
  const canSplit = Boolean(!readOnly && selected && selected.count > 1 && sortedArmies.length < HERO_ARMY_STACK_LIMIT);

  async function mergeInto(target: UnitStack) {
    if (!selected || selected.id === target.id || selected.unitType !== target.unitType) return;
    await onAction({ type: "MERGE_HERO_STACKS", heroId: hero.id, sourceStackId: selected.id, targetStackId: target.id });
    setSelectedStackId(null);
  }

  async function splitSelected() {
    if (!selected || !canSplit) return;
    await onAction({
      type: "SPLIT_HERO_STACK",
      heroId: hero.id,
      sourceStackId: selected.id,
      count: Math.min(splitMax, Math.max(1, Math.floor(splitCount))),
    });
    setSelectedStackId(null);
    setSplitCount(1);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300/80">{t("hero.tabArmy")}</div>
        <div className="text-[10px] font-black text-amber-200/60">{sortedArmies.length}/{HERO_ARMY_STACK_LIMIT}</div>
      </div>
      {selected && (
        <div className="mb-3 rounded-md border border-amber-700/35 bg-black/40 p-2">
          <div className="flex items-center gap-2 text-xs text-amber-100">
            <UnitSprite unitType={selected.unitType} size="xs" describe />
            <span className="min-w-0 flex-1 truncate font-black">{unitTypeLabel(selected.unitType, locale)}</span>
            <span>{selected.count}/{UNIT_STACK_COUNT_CAP}</span>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
            <input
              type="range"
              min={1}
              max={splitMax}
              value={Math.min(splitMax, splitCount)}
              disabled={!canSplit}
              onChange={(event) => setSplitCount(Math.max(1, Math.floor(Number(event.target.value || 1))))}
              className="min-w-0 accent-amber-400"
            />
            <input
              type="number"
              min={1}
              max={splitMax}
              value={Math.min(splitMax, splitCount)}
              disabled={!canSplit}
              onChange={(event) => setSplitCount(Math.max(1, Math.floor(Number(event.target.value || 1))))}
              className="h-8 w-16 rounded border border-amber-700/45 bg-stone-950 px-2 text-right text-xs font-black text-amber-100"
            />
          </div>
          <button
            type="button"
            disabled={!canSplit}
            onClick={() => void splitSelected()}
            className="mt-2 w-full rounded-md border border-amber-600/50 bg-amber-950/55 px-3 py-1.5 text-xs font-black text-amber-100 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t("hero.split")}
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {sortedArmies.map((unit) => {
          const selectedUnit = unit.id === selected?.id;
          const mergeTarget = Boolean(selected && unit.id !== selected.id && unit.unitType === selected.unitType && unit.count < UNIT_STACK_COUNT_CAP);
          return (
            <button
              key={unit.id}
              type="button"
              disabled={readOnly}
              onClick={() => {
                if (mergeTarget) void mergeInto(unit);
                else setSelectedStackId(selectedUnit ? null : unit.id);
              }}
              className={`grid min-h-[4.75rem] min-w-0 grid-cols-[2.75rem_1fr] items-center gap-2 rounded-md border px-2 py-2 text-left transition ${
                selectedUnit
                  ? "border-amber-200 bg-amber-900/65 text-amber-50"
                : mergeTarget
                  ? "border-emerald-300/75 bg-emerald-950/55 text-emerald-100 hover:bg-emerald-900/60"
                  : `border-amber-700/40 bg-black/50 text-amber-100 ${readOnly ? "cursor-default" : "hover:border-amber-400/70"}`
              }`}
              title={`${unitTypeLabel(unit.unitType, locale)} x ${unit.count}`}
            >
              <UnitSprite unitType={unit.unitType} size="xs" describe />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-black leading-tight text-amber-100">{unitTypeLabel(unit.unitType, locale)}</span>
                <span className="mt-1 block text-sm font-black leading-none text-amber-50">{unit.count}</span>
              </span>
            </button>
          );
        })}
      </div>
      {hero.armies.length === 0 && (
        <div className="mt-2 rounded-md border border-amber-900/40 bg-black/30 px-3 py-2 text-xs text-amber-200/55">
          {t("hero.armyEmpty")}
        </div>
      )}
    </div>
  );
}

function ArtifactPanel({
  hero,
  readOnly,
  eligibleTransferHeroes,
  onEquip,
  onUnequip,
  onTransfer,
  t,
}: {
  hero: Hero;
  readOnly?: boolean;
  eligibleTransferHeroes: Hero[];
  onEquip: (artifactId: string, slot?: ArtifactSlot) => void;
  onUnequip: (slot: ArtifactSlot) => void;
  onTransfer: (artifactId: string, toHeroId: string) => void;
  t: TFn;
}) {
  const bag = normalizeArtifactBag(hero.artifacts);
  const equippedEntries = ARTIFACT_SLOTS.map((slot) => ({ slot, artifactId: bag.equipment[slot] }));
  const transferTargetId = eligibleTransferHeroes[0]?.id;

  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-300/80">{t("hero.tabArtifacts")}</div>
      <div className="grid grid-cols-4 gap-1">
        {equippedEntries.map(({ slot, artifactId }) => {
          const artifact = artifactId ? getArtifact(artifactId) : null;
          return (
            <button
              key={slot}
              type="button"
              className={`group flex h-12 flex-col rounded-md border px-1 py-1 text-left text-[8px] leading-none transition ${
                artifact
                  ? "border-amber-500/55 bg-gradient-to-b from-amber-950/35 to-black/55 text-amber-100 shadow-[inset_0_0_12px_rgba(251,191,36,0.08)] hover:border-amber-300/80"
                  : "border-amber-900/45 bg-black/30 text-amber-200/45 hover:border-amber-700/65"
              }`}
              title={artifact ? artifactTooltip(artifact.id, t) : slotLabel(slot, t)}
              onClick={() => artifactId && !readOnly && onUnequip(slot)}
            >
              <span className="block w-full truncate font-bold uppercase tracking-normal text-amber-300/75">{slotLabel(slot, t)}</span>
              {artifact ? (
                <span className="grid min-h-0 flex-1 place-items-center">
                  <ArtifactIcon artifactId={artifact.id} size="slot" />
                </span>
              ) : (
                <span className="grid min-h-0 flex-1 place-items-center text-xs font-black text-amber-200/20">-</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {bag.inventory.length === 0 && (
          <div className="rounded-md border border-amber-900/40 bg-black/30 px-2 py-1 text-[11px] text-amber-200/55">{t("hero.inventoryEmpty")}</div>
        )}
        {bag.inventory.map((artifactId, index) => {
          const artifact = ARTIFACTS_BY_ID[artifactId];
          if (!artifact) return null;
          const freeSlot = artifact.slots.find((slot) => !bag.equipment[slot]) ?? artifact.slots[0];
          return (
            <div key={`${artifactId}-${index}`} className="flex items-center gap-1 rounded-md border border-amber-700/35 bg-black/45 px-2 py-1 text-xs">
              <ArtifactIcon artifactId={artifactId} size="row" />
              <span className="min-w-0 flex-1 truncate text-amber-100" title={artifactTooltip(artifactId, t)}>{artifact.name}</span>
              {!readOnly && <button type="button" className="rounded border border-emerald-500/40 px-2 py-0.5 font-bold text-emerald-200" onClick={() => onEquip(artifactId, freeSlot)}>
                {t("hero.equip")}
              </button>}
              {!readOnly && transferTargetId && (
                <button type="button" className="rounded border border-sky-500/40 px-2 py-0.5 font-bold text-sky-200" onClick={() => onTransfer(artifactId, transferTargetId)}>
                  {t("hero.give")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArtifactIcon({ artifactId, size }: { artifactId: string; size: "row" | "slot" }) {
  const boxClass = size === "row" ? "h-7 w-7" : "h-9 w-9";
  const imageClass = size === "row" ? "h-5 w-5" : "h-7 w-7";
  return (
    <span className={`${boxClass} grid shrink-0 place-items-center rounded border border-amber-700/45 bg-stone-950/70 shadow-inner shadow-black/40`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- HUD sprites use direct public asset paths and fixed tiny dimensions. */}
      <img
        src={`/assets/sprites/artifacts/${artifactId}.webp`}
        alt=""
        className={`${imageClass} object-contain [image-rendering:auto]`}
        loading="lazy"
        draggable={false}
      />
    </span>
  );
}

function slotLabel(slot: ArtifactSlot, t: TFn) {
  const keys: Record<ArtifactSlot, TranslationKey> = {
    weapon: "slot.weapon",
    shield: "slot.shield",
    torso: "slot.torso",
    helmet: "slot.helmet",
    necklace: "slot.necklace",
    feet: "slot.feet",
    ringLeft: "slot.ring",
    ringRight: "slot.ring",
    misc1: "slot.bag",
    misc2: "slot.bag",
    misc3: "slot.bag",
    misc4: "slot.bag",
  };
  return t(keys[slot]);
}

function artifactTooltip(artifactId: string, t: TFn) {
  const artifact = getArtifact(artifactId);
  if (!artifact) return artifactId;
  const bonus = Object.entries(artifact.bonus)
    .filter(([, value]) => value)
    .map(([key, value]) => `${bonusLabel(key, t)} ${Number(value) > 0 ? "+" : ""}${value}`)
    .join(", ");
  const unsupported = artifact.unsupportedEffects?.length ? ` | ${t("hero.artifactInactive")} ${artifact.unsupportedEffects.join(", ")}` : "";
  return `${artifact.name} (${artifact.originalName})${bonus ? ` | ${bonus}` : ""}${unsupported}`;
}

function bonusLabel(key: string, t: TFn) {
  if (key === "attack") return t("bonus.attack");
  if (key === "defense") return t("bonus.defense");
  if (key === "spellPower") return t("bonus.spellPower");
  if (key === "knowledge") return t("bonus.knowledge");
  if (key === "morale") return t("bonus.morale");
  if (key === "luck") return t("bonus.luck");
  if (key === "movement") return t("bonus.movement");
  return key;
}

function canTransferArtifacts(hero: Hero, candidate: Hero, towns: Town[]) {
  if (normalizeMapLevel(hero.position.level) !== normalizeMapLevel(candidate.position.level)) return false;
  const adjacent = Math.max(Math.abs(hero.position.x - candidate.position.x), Math.abs(hero.position.y - candidate.position.y)) <= 1;
  if (adjacent) return true;
  return towns.some((town) =>
    town.position.x === hero.position.x &&
    town.position.y === hero.position.y &&
    town.position.x === candidate.position.x &&
    town.position.y === candidate.position.y &&
    normalizeMapLevel(town.position.level) === normalizeMapLevel(hero.position.level)
  );
}

function normalizeRevealedTiles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const x = Number((item as { x?: unknown })?.x);
    const y = Number((item as { y?: unknown })?.y);
    return Number.isInteger(x) && Number.isInteger(y) ? [{ x, y }] : [];
  });
}

function normalizeRevealHints(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const x = Number((item as { x?: unknown })?.x);
    const y = Number((item as { y?: unknown })?.y);
    const kind = String((item as { kind?: unknown })?.kind ?? "");
    const subtype = (item as { subtype?: unknown })?.subtype;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return [];
    if (!["resource", "building", "artifact", "hero", "town"].includes(kind)) return [];
    return [{ x, y, kind: kind as "resource" | "building" | "artifact" | "hero" | "town", subtype: typeof subtype === "string" ? subtype : undefined }];
  });
}

function PendingSkillChoiceBlock({
  hero,
  onPicked,
  t,
  locale,
}: {
  hero: Hero;
  onPicked: (level: number, skillId: SkillId) => Promise<void>;
  t: TFn;
  locale: Locale;
}) {
  const next = hero.pendingSkillChoices?.[0];
  if (!next) return null;
  const labelFor = (id: string) => localizedLabelFromId(id, SKILL_DEFINITIONS.find((s) => s.id === id)?.label ?? id, locale);
  const descriptionFor = (id: string, level: SkillLevel) =>
    localizedSkillDescription(id as SkillId, level, locale);
  const currentLevel = (id: string) => (hero.skills?.[id] as SkillLevel | undefined);
  return (
    <div className="mt-3 rounded-md border border-amber-400/70 bg-gradient-to-b from-amber-900/60 to-stone-950/80 p-3 shadow-inner shadow-black/40">
      <div className="text-xs font-bold uppercase tracking-wider text-amber-200">{t("hero.levelUpChoice", { level: next.level })}</div>
      <div className="mt-2 space-y-2">
        {next.options.map((id) => {
          const known = currentLevel(id);
          const nextLevel = known === "advanced" ? "expert" : known === "basic" ? "advanced" : "basic";
          return (
            <button
              key={id}
              type="button"
              onClick={() => void onPicked(next.level, id as SkillId)}
              className="w-full rounded-md border border-amber-700/60 bg-stone-950/70 px-3 py-2 text-left text-amber-100 transition hover:border-amber-300 hover:bg-amber-950/60"
            >
              <div className="text-sm font-bold">{labelFor(id)} → <span className="text-amber-300">{nextLevel}</span></div>
              <div className="text-[11px] text-amber-200/70">{descriptionFor(id, nextLevel)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
