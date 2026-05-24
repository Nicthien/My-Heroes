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
import type { Hero, Town } from "@/lib/game/types";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";
import { SpellBookButton, SpellBookModal } from "@/components/game/spells/SpellBookModal";
import CollapsiblePanel from "./CollapsiblePanel";
import { MovementGauge, Stat } from "./gauges";
import { UnitSprite } from "./UnitSprite";
import { unitTypeLabel } from "./helpers";
import { goldDivider, ornateFramePolished } from "./theme";

type HeroTab = "profile" | "army" | "artifacts";

export function HeroPanel({ hero, townAtHero }: { hero: Hero; townAtHero: Town | undefined }) {
  const { data: session } = useSession();
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
  const displayHero = devInfiniteMana ? { ...hero, mana: getHeroMaxMana(hero) } : hero;
  const effectiveStats = getEffectiveHeroStats(hero);
  const artifactBonus = getArtifactStatsBonus(hero);
  const eligibleTransferHeroes = gameState?.players
    .find((player) => player.heroes.some((item) => item.id === hero.id))
    ?.heroes.filter((candidate) => candidate.id !== hero.id && canTransferArtifacts(hero, candidate, gameState.players.flatMap((player) => player.towns))) ?? [];
  const heroArtifactBag = normalizeArtifactBag(hero.artifacts);
  const artifactCount = heroArtifactBag.inventory.length + Object.values(heroArtifactBag.equipment).filter(Boolean).length;
  const heroTabs: { id: HeroTab; label: string; badge?: number }[] = [
    { id: "profile", label: "Profil" },
    { id: "army", label: "Armee", badge: hero.armies.length },
    { id: "artifacts", label: "Artefacts", badge: artifactCount },
  ];
  const skillEntries = getHeroSkillEntries(hero);

  async function castAdventureSpell(spell: SpellDefinition, target?: { x: number; y: number }) {
    if (!gameState) throw new Error("Partie indisponible.");
    if (spellRequiresAdventureTarget(spell) && !target) {
      setPendingAdventureSpell({ heroId: hero.id, spellId: spell.id, label: spell.label });
      setSpellBookOpen(false);
      setCombatMessage(`${spell.label} : choisissez une case cible.`);
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
    if (!response.ok) throw new Error(data.error ?? "Action impossible.");
    setPendingAdventureSpell(null);
    if (typeof data?.interaction?.message === "string") setCombatMessage(data.interaction.message);
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
      setCombatMessage(data.error ?? "Action impossible.");
      return;
    }
    const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshed) setGameState(refreshed);
  }

  return (
    <>
      <CollapsiblePanel
        title={hero.name}
        className={`${ornateFramePolished} pointer-events-auto absolute left-4 top-[7rem] flex max-h-[min(32rem,calc(100vh-9rem))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden`}
        bodyClassName="flex min-h-0 flex-1 flex-col"
        right={
          <div className="flex items-center gap-2">
            <SpellBookButton onClick={() => setSpellBookOpen(true)} />
            <button
              className="rounded text-amber-300/60 transition hover:text-amber-100"
              onClick={(event) => {
                event.stopPropagation();
                useGameStore.getState().selectHero(null);
              }}
              aria-label="Fermer"
            >
              x
            </button>
          </div>
        }
      >
        <div className="border-b border-amber-700/30 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-amber-200/60">
            Niveau {hero.level} - XP {hero.experience}
          </div>
          {skillEntries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skillEntries.map(({ id, label, levelLabel }) => (
                <span key={id} className="rounded-full border border-amber-600/50 bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                  {label} - {levelLabel}
                </span>
              ))}
            </div>
          )}
          {(hero.warMachines?.ballista || hero.warMachines?.firstAid || hero.warMachines?.ammoCart) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {hero.warMachines.ballista && (
                <span className="inline-flex rounded-full border border-orange-600/50 bg-orange-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-200">Baliste</span>
              )}
              {hero.warMachines.firstAid && (
                <span className="inline-flex rounded-full border border-emerald-600/50 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">Tente</span>
              )}
              {hero.warMachines.ammoCart && (
                <span className="inline-flex rounded-full border border-sky-600/50 bg-sky-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-200">Munitions</span>
              )}
            </div>
          )}
          {(hero.pendingSkillChoices?.length ?? 0) > 0 && (
            <PendingSkillChoiceBlock
              hero={hero}
              onPicked={async (level, skillId) => {
                if (!gameState) return;
                const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ type: "LEARN_SKILL", heroId: hero.id, level, skillId }),
                });
                if (!response.ok) {
                  setCombatMessage((await response.json())?.error ?? "Choix de compétence impossible.");
                  return;
                }
                const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
                if (refreshed) setGameState(refreshed);
              }}
            />
          )}
          {pendingAdventureSpell?.heroId === hero.id && (
            <button
              type="button"
              onClick={() => {
                setPendingAdventureSpell(null);
                setCombatMessage(null);
              }}
              className="mt-2 w-full rounded-md border border-violet-400/50 bg-violet-950/65 px-3 py-2 text-left text-sm font-black text-violet-100 transition hover:border-violet-200"
            >
              Cible: {pendingAdventureSpell.label}
            </button>
          )}
          {townAtHero && (
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-sky-500/40 bg-sky-950/50 px-3 py-2 text-left text-sm text-sky-100 transition hover:border-sky-300/70 hover:bg-sky-900/60"
              onClick={() => useGameStore.getState().selectTown(townAtHero.id)}
            >
              Au chateau : <span className="font-black">{townAtHero.name}</span>
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-visible border-b border-amber-700/30 px-3 py-2">
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {activeTab === "profile" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat label="Attaque" value={formatStatBonus(effectiveStats.attack, artifactBonus.attack)} color="text-red-300" />
                <Stat label="Defense" value={formatStatBonus(effectiveStats.defense, artifactBonus.defense)} color="text-blue-300" />
                <Stat label="Pouvoir" value={formatStatBonus(effectiveStats.spellPower, artifactBonus.spellPower)} color="text-violet-300" />
                <Stat label="Savoir" value={formatStatBonus(effectiveStats.knowledge, artifactBonus.knowledge)} color="text-cyan-300" />
                <Stat label="Moral" value={formatStatBonus(effectiveStats.morale, artifactBonus.morale, true)} color={moraleStatColor(effectiveStats.morale)} />
                <Stat label="Chance" value={formatStatBonus(effectiveStats.luck, artifactBonus.luck, true)} color={luckStatColor(effectiveStats.luck)} />
                <Stat label="Mana" value={hero.mana} color="text-violet-200" />
              </div>
              <div className={goldDivider} />
              <HeroSkillsPanel hero={hero} />
              <div className={goldDivider} />
              <div className="rounded-md border border-amber-800/35 bg-black/35 px-3 py-2 text-xs text-amber-200/70">
                Position : <span className="font-black text-amber-100">{hero.position.x}, {hero.position.y}</span>
              </div>
            </div>
          )}

          {activeTab === "army" && <HeroArmyPanel hero={hero} />}

          {activeTab === "artifacts" && (
            <ArtifactPanel
              hero={hero}
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
      {spellBookOpen && (
        <SpellBookModal
          hero={displayHero}
          context="adventure"
          title="Livre de sorts - Aventure"
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
  const base = signed ? formatSignedMorale(value) : String(value);
  return bonus ? `${base} (${bonus > 0 ? "+" : ""}${bonus})` : base;
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

function HeroSkillsPanel({ hero }: { hero: Hero }) {
  const skills = getHeroSkillEntries(hero);
  if (skills.length === 0) {
    return (
      <div className="rounded-md border border-amber-900/40 bg-black/30 px-3 py-2 text-xs text-amber-200/55">
        Aucune compétence
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">Compétences</div>
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

function getHeroSkillEntries(hero: Hero) {
  return Object.entries(hero.skills ?? {})
    .filter((entry): entry is [SkillId, SkillLevel] => isSkillId(entry[0]) && isSkillLevel(entry[1]))
    .map(([id, level]) => {
      const definition = SKILL_DEFINITIONS.find((skill) => skill.id === id);
      return {
        id,
        label: definition?.label ?? id.replace(/_/g, " "),
        description: definition?.description ?? "",
        level,
        levelLabel: skillLevelLabel(level),
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

function skillLevelLabel(level: SkillLevel) {
  if (level === "basic") return "Base";
  if (level === "advanced") return "Avancé";
  return "Expert";
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

function HeroArmyPanel({ hero }: { hero: Hero }) {
  if (hero.armies.length === 0) {
    return (
      <div className="rounded-md border border-amber-900/40 bg-black/30 px-3 py-2 text-xs text-amber-200/55">
        Armee vide
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">Armee</div>
      <div className="grid grid-cols-2 gap-1">
        {hero.armies.map((unit) => (
          <div
            key={unit.id}
            className="flex items-center gap-2 rounded-md border border-amber-700/40 bg-black/50 px-2 py-1 text-sm"
          >
            <UnitSprite unitType={unit.unitType} size="xs" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-amber-200/70">{unitTypeLabel(unit.unitType)}</span>
            <span className="font-black text-amber-100">{unit.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtifactPanel({
  hero,
  eligibleTransferHeroes,
  onEquip,
  onUnequip,
  onTransfer,
}: {
  hero: Hero;
  eligibleTransferHeroes: Hero[];
  onEquip: (artifactId: string, slot?: ArtifactSlot) => void;
  onUnequip: (slot: ArtifactSlot) => void;
  onTransfer: (artifactId: string, toHeroId: string) => void;
}) {
  const bag = normalizeArtifactBag(hero.artifacts);
  const equippedEntries = ARTIFACT_SLOTS.map((slot) => ({ slot, artifactId: bag.equipment[slot] }));
  const transferTargetId = eligibleTransferHeroes[0]?.id;

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">Artefacts</div>
      <div className="grid grid-cols-3 gap-1">
        {equippedEntries.map(({ slot, artifactId }) => {
          const artifact = artifactId ? getArtifact(artifactId) : null;
          return (
            <button
              key={slot}
              type="button"
              className="min-h-12 rounded-md border border-amber-700/40 bg-black/45 px-1 py-1 text-left text-[10px] text-amber-100 transition hover:border-amber-300/70"
              title={artifact ? artifactTooltip(artifact.id) : slotLabel(slot)}
              onClick={() => artifactId && onUnequip(slot)}
            >
              <span className="block truncate text-amber-300/70">{slotLabel(slot)}</span>
              <span className="block truncate font-black">{artifact?.name ?? "-"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {bag.inventory.length === 0 && (
          <div className="rounded-md border border-amber-900/40 bg-black/30 px-2 py-1 text-xs text-amber-200/55">Inventaire vide</div>
        )}
        {bag.inventory.map((artifactId, index) => {
          const artifact = ARTIFACTS_BY_ID[artifactId];
          if (!artifact) return null;
          const freeSlot = artifact.slots.find((slot) => !bag.equipment[slot]) ?? artifact.slots[0];
          return (
            <div key={`${artifactId}-${index}`} className="flex items-center gap-1 rounded-md border border-amber-700/35 bg-black/45 px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate text-amber-100" title={artifactTooltip(artifactId)}>{artifact.name}</span>
              <button type="button" className="rounded border border-emerald-500/40 px-2 py-0.5 font-bold text-emerald-200" onClick={() => onEquip(artifactId, freeSlot)}>
                Éq.
              </button>
              {transferTargetId && (
                <button type="button" className="rounded border border-sky-500/40 px-2 py-0.5 font-bold text-sky-200" onClick={() => onTransfer(artifactId, transferTargetId)}>
                  Don
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function slotLabel(slot: ArtifactSlot) {
  const labels: Record<ArtifactSlot, string> = {
    weapon: "Arme",
    shield: "Bouclier",
    torso: "Torse",
    helmet: "Tête",
    necklace: "Cou",
    feet: "Pieds",
    ringLeft: "Anneau",
    ringRight: "Anneau",
    misc1: "Sac",
    misc2: "Sac",
    misc3: "Sac",
    misc4: "Sac",
  };
  return labels[slot];
}

function artifactTooltip(artifactId: string) {
  const artifact = getArtifact(artifactId);
  if (!artifact) return artifactId;
  const bonus = Object.entries(artifact.bonus)
    .filter(([, value]) => value)
    .map(([key, value]) => `${bonusLabel(key)} ${Number(value) > 0 ? "+" : ""}${value}`)
    .join(", ");
  const unsupported = artifact.unsupportedEffects?.length ? ` | Non actif: ${artifact.unsupportedEffects.join(", ")}` : "";
  return `${artifact.name} (${artifact.originalName})${bonus ? ` | ${bonus}` : ""}${unsupported}`;
}

function bonusLabel(key: string) {
  if (key === "attack") return "Att.";
  if (key === "defense") return "Déf.";
  if (key === "spellPower") return "Pouvoir";
  if (key === "knowledge") return "Savoir";
  if (key === "morale") return "Moral";
  if (key === "luck") return "Chance";
  if (key === "movement") return "Mouv.";
  return key;
}

function canTransferArtifacts(hero: Hero, candidate: Hero, towns: Town[]) {
  const adjacent = Math.max(Math.abs(hero.position.x - candidate.position.x), Math.abs(hero.position.y - candidate.position.y)) <= 1;
  if (adjacent) return true;
  return towns.some((town) =>
    town.position.x === hero.position.x &&
    town.position.y === hero.position.y &&
    town.position.x === candidate.position.x &&
    town.position.y === candidate.position.y
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
}: {
  hero: Hero;
  onPicked: (level: number, skillId: SkillId) => Promise<void>;
}) {
  const next = hero.pendingSkillChoices?.[0];
  if (!next) return null;
  const labelFor = (id: string) => SKILL_DEFINITIONS.find((s) => s.id === id)?.label ?? id;
  const descriptionFor = (id: string) => SKILL_DEFINITIONS.find((s) => s.id === id)?.description ?? "";
  const currentLevel = (id: string) => (hero.skills?.[id] as string | undefined);
  return (
    <div className="mt-3 rounded-md border border-amber-400/70 bg-gradient-to-b from-amber-900/60 to-stone-950/80 p-3 shadow-inner shadow-black/40">
      <div className="text-xs font-bold uppercase tracking-wider text-amber-200">Montée de niveau {next.level} : choisis une compétence</div>
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
              <div className="text-[11px] text-amber-200/70">{descriptionFor(id)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
