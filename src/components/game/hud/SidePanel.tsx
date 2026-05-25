"use client";

import Image from "next/image";
import { useSession } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";
import { RESOURCE_BUILDING_RULES, formatResourceProduction } from "@/lib/game/economy";
import { MAP_SPRITES } from "@/lib/rendering/phaser/assets";
import {
  HourglassIcon,
  PortraitSeal,
  TowerIcon,
  goldText,
  ornateFrame,
} from "./theme";
import ActiveCombatsPanel from "../combat/ActiveCombatsPanel";
import CollapsiblePanel from "./CollapsiblePanel";

export default function SidePanel() {
  const { data: session } = useSession();
  const gameState = useGameStore((s) => s.gameState);
  const selectedHeroId = useGameStore((s) => s.selectedHeroId);
  const selectedTownId = useGameStore((s) => s.selectedTownId);

  if (!gameState) return null;
  const me = gameState.players.find((p) => p.userId === session?.user?.id);
  if (!me) return null;

  const focusTile = useGameStore.getState().focusTile;
  const selectHero = useGameStore.getState().selectHero;
  const selectTown = useGameStore.getState().selectTown;

  const heroes = me.heroes;
  const towns = me.towns;
  const mines = me.resourceBuildings;

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-3">
      {heroes.length > 0 && (
        <Section title={`Héros (${heroes.length})`}>
          {heroes.map((h) => {
            const active = h.id === selectedHeroId;
            const townAtHero = towns.find((town) =>
              town.position.x === h.position.x &&
              town.position.y === h.position.y
            );
            return (
              <Row
                key={h.id}
                active={active}
                onClick={() => {
                  selectHero(h.id);
                  focusTile(h.position.x, h.position.y);
                }}
                left={
                  <PortraitSeal
                    color={me.color}
                    label={h.name.slice(0, 2)}
                    active={active}
                    size={40}
                  />
                }
                title={h.name}
                subtitle={townAtHero ? `Niveau ${h.level} · Au château` : `Niveau ${h.level}`}
                meta={
                  <div className="flex items-center gap-2 text-[10px] text-amber-200/80">
                    {townAtHero && (
                      <button
                        type="button"
                        className="grid h-5 w-5 place-items-center rounded border border-sky-500/40 bg-sky-950/50 text-sky-200 transition hover:border-sky-300/70 hover:bg-sky-900/60 hover:text-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
                        title={`Au château : ${townAtHero.name}`}
                        aria-label={`Sélectionner le château ${townAtHero.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectTown(townAtHero.id);
                          focusTile(townAtHero.position.x, townAtHero.position.y);
                        }}
                      >
                        <TowerIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <MiniMovementGauge movement={h.movement} maxMovement={h.maxMovement} />
                  </div>
                }
              />
            );
          })}
        </Section>
      )}

      {towns.length > 0 && (
        <Section title={`Châteaux (${towns.length})`}>
          {towns.map((t) => {
            const active = t.id === selectedTownId;
            const factionKey = (t.townType ?? t.faction) as string;
            const sprite = MAP_SPRITES.towns[factionKey] ?? MAP_SPRITES.town;
            return (
              <Row
                key={t.id}
                active={active}
                onClick={() => {
                  selectTown(t.id);
                  focusTile(t.position.x, t.position.y);
                }}
                left={
                  <div
                    className={`grid h-10 w-10 place-items-center overflow-hidden rounded-lg border ${
                      active
                        ? "border-amber-300 bg-amber-700/40"
                        : "border-amber-700/60 bg-stone-900/80"
                    }`}
                  >
                    <Image
                      src={sprite}
                      alt={t.name}
                      width={40}
                      height={40}
                      className="h-full w-full object-contain"
                      style={{ imageRendering: "pixelated" }}
                      draggable={false}
                    />
                  </div>
                }
                title={t.name}
                subtitle={`Niveau ${t.level}`}
              />
            );
          })}
        </Section>
      )}

      {mines.length > 0 && (
        <Section title={`Mines (${mines.length})`}>
          {mines.map((m) => {
            const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === m.type);
            const label = rule?.label ?? m.type;
            const prod = rule ? formatResourceProduction(rule.production) : "";
            const sprite = MAP_SPRITES.buildings[m.type];
            return (
              <Row
                key={m.id}
                onClick={() => focusTile(m.position.x, m.position.y)}
                left={
                  <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-amber-700/60 bg-stone-900/80">
                    {sprite ? (
                      <Image
                        src={sprite}
                        alt={label}
                        width={40}
                        height={40}
                        className="h-full w-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                        draggable={false}
                      />
                    ) : (
                      <span className="text-lg font-black text-amber-300">?</span>
                    )}
                  </div>
                }
                title={label}
                subtitle={prod}
              />
            );
          })}
        </Section>
      )}

      <ActiveCombatsPanel />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <CollapsiblePanel
      title={title}
      className={ornateFrame}
      expandedClassName="shrink-0 overflow-hidden"
      collapsedClassName="shrink-0 overflow-hidden"
      bodyClassName="max-h-32 space-y-1 overflow-y-auto overscroll-contain px-2 py-2"
    >
      {children}
    </CollapsiblePanel>
  );
}

function MiniMovementGauge({ movement, maxMovement }: { movement: number; maxMovement: number }) {
  const ratio = maxMovement > 0 ? Math.max(0, Math.min(1, movement / maxMovement)) : 0;
  const fillColor = ratio > 0.35 ? "bg-emerald-300" : ratio > 0 ? "bg-amber-300" : "bg-red-400";

  return (
    <span className="min-w-20">
      <span className="flex items-center gap-1 tabular-nums">
        <HourglassIcon className="h-3 w-3" />
        {movement}/{maxMovement}
      </span>
      <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-black/60">
        <span className={`block h-full rounded-full ${fillColor}`} style={{ width: `${ratio * 100}%` }} />
      </span>
    </span>
  );
}

function Row({
  left,
  title,
  subtitle,
  meta,
  active,
  onClick,
}: {
  left: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onClick();
      }}
      className={`group flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
        active
          ? "border-amber-400/70 bg-amber-700/15 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.25)]"
          : "border-amber-700/20 bg-black/30 hover:border-amber-500/50 hover:bg-amber-900/15"
      }`}
    >
      {left}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-bold ${active ? goldText : "text-amber-100"}`}>
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-[11px] text-amber-200/60">{subtitle}</div>
        )}
      </div>
      {meta}
    </div>
  );
}
