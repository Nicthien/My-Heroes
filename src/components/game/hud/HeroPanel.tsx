"use client";

import type { Hero, Town } from "@/lib/game/types";
import { useGameStore } from "@/lib/stores/gameStore";
import CollapsiblePanel from "./CollapsiblePanel";
import { MovementGauge, Stat } from "./gauges";
import { UnitSprite } from "./UnitSprite";
import { unitTypeLabel } from "./helpers";
import { goldDivider, ornateFramePolished } from "./theme";

export function HeroPanel({ hero, townAtHero }: { hero: Hero; townAtHero: Town | undefined }) {
  return (
    <CollapsiblePanel
      title={hero.name}
      className={`${ornateFramePolished} pointer-events-auto absolute left-4 top-[7rem] flex max-h-[min(32rem,calc(100vh-9rem))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden`}
      bodyClassName="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4"
      right={
        <button
          className="rounded text-amber-300/60 transition hover:text-amber-100"
          onClick={(event) => {
            event.stopPropagation();
            useGameStore.getState().selectHero(null);
          }}
          aria-label="Fermer"
        >
          ✕
        </button>
      }
    >
      <div className="text-xs uppercase tracking-wider text-amber-200/60">
        Niveau {hero.level} · XP {hero.experience}
      </div>
      {townAtHero && (
        <button
          type="button"
          className="w-full rounded-md border border-sky-500/40 bg-sky-950/50 px-3 py-2 text-left text-sm text-sky-100 transition hover:border-sky-300/70 hover:bg-sky-900/60"
          onClick={() => useGameStore.getState().selectTown(townAtHero.id)}
        >
          Au château : <span className="font-black">{townAtHero.name}</span>
        </button>
      )}
      <div className={goldDivider} />
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="Attaque" value={hero.stats.attack} color="text-red-300" />
        <Stat label="Défense" value={hero.stats.defense} color="text-blue-300" />
        <Stat label="Pouvoir" value={hero.stats.spellPower} color="text-violet-300" />
        <Stat label="Savoir" value={hero.stats.knowledge} color="text-cyan-300" />
      </div>
      <MovementGauge movement={hero.movement} maxMovement={hero.maxMovement} />
      {hero.armies.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">Armée</div>
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
  );
}
