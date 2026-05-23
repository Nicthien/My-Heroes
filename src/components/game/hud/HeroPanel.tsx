"use client";

import { useState } from "react";
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
import type { Hero, Town } from "@/lib/game/types";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";
import { SpellBookButton, SpellBookModal } from "@/components/game/spells/SpellBookModal";
import CollapsiblePanel from "./CollapsiblePanel";
import { MovementGauge, Stat } from "./gauges";
import { UnitSprite } from "./UnitSprite";
import { unitTypeLabel } from "./helpers";
import { goldDivider, ornateFramePolished } from "./theme";

export function HeroPanel({ hero, townAtHero }: { hero: Hero; townAtHero: Town | undefined }) {
  const { data: session } = useSession();
  const [spellBookOpen, setSpellBookOpen] = useState(false);
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
        bodyClassName="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4"
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
        <div className="text-xs uppercase tracking-wider text-amber-200/60">
          Niveau {hero.level} - XP {hero.experience}
        </div>
        {pendingAdventureSpell?.heroId === hero.id && (
          <button
            type="button"
            onClick={() => {
              setPendingAdventureSpell(null);
              setCombatMessage(null);
            }}
            className="w-full rounded-md border border-violet-400/50 bg-violet-950/65 px-3 py-2 text-left text-sm font-black text-violet-100 transition hover:border-violet-200"
          >
            Cible: {pendingAdventureSpell.label}
          </button>
        )}
        {townAtHero && (
          <button
            type="button"
            className="w-full rounded-md border border-sky-500/40 bg-sky-950/50 px-3 py-2 text-left text-sm text-sky-100 transition hover:border-sky-300/70 hover:bg-sky-900/60"
            onClick={() => useGameStore.getState().selectTown(townAtHero.id)}
          >
            Au chateau : <span className="font-black">{townAtHero.name}</span>
          </button>
        )}
        <div className={goldDivider} />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Attaque" value={formatStatBonus(effectiveStats.attack, artifactBonus.attack)} color="text-red-300" />
          <Stat label="Defense" value={formatStatBonus(effectiveStats.defense, artifactBonus.defense)} color="text-blue-300" />
          <Stat label="Pouvoir" value={formatStatBonus(effectiveStats.spellPower, artifactBonus.spellPower)} color="text-violet-300" />
          <Stat label="Savoir" value={formatStatBonus(effectiveStats.knowledge, artifactBonus.knowledge)} color="text-cyan-300" />
          <Stat label="Moral" value={formatStatBonus(effectiveStats.morale, artifactBonus.morale, true)} color={moraleStatColor(effectiveStats.morale)} />
          <Stat label="Chance" value={formatStatBonus(effectiveStats.luck, artifactBonus.luck, true)} color={luckStatColor(effectiveStats.luck)} />
          <Stat label="Mana" value={hero.mana} color="text-violet-200" />
        </div>
        <MovementGauge movement={hero.movement} maxMovement={hero.maxMovement} />
        <ArtifactPanel
          hero={hero}
          eligibleTransferHeroes={eligibleTransferHeroes}
          onEquip={(artifactId, slot) => performArtifactAction({ type: "EQUIP_ARTIFACT", heroId: hero.id, artifactId, slot })}
          onUnequip={(slot) => performArtifactAction({ type: "UNEQUIP_ARTIFACT", heroId: hero.id, slot })}
          onTransfer={(artifactId, toHeroId) => performArtifactAction({ type: "TRANSFER_ARTIFACT", fromHeroId: hero.id, toHeroId, artifactId })}
        />
        {hero.armies.length > 0 && (
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
        )}
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
