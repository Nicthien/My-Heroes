"use client";

import { useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
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
          <Stat label="Attaque" value={hero.stats.attack} color="text-red-300" />
          <Stat label="Defense" value={hero.stats.defense} color="text-blue-300" />
          <Stat label="Pouvoir" value={hero.stats.spellPower} color="text-violet-300" />
          <Stat label="Savoir" value={hero.stats.knowledge} color="text-cyan-300" />
          <Stat label="Moral" value={formatSignedMorale(hero.stats.morale)} color={moraleStatColor(hero.stats.morale)} />
          <Stat label="Mana" value={hero.mana} color="text-violet-200" />
        </div>
        <MovementGauge movement={hero.movement} maxMovement={hero.maxMovement} />
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

function moraleStatColor(value: number | undefined) {
  const v = Number.isFinite(value) ? Math.trunc(value as number) : 0;
  if (v > 0) return "text-emerald-300";
  if (v < 0) return "text-rose-300";
  return "text-amber-200/80";
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
