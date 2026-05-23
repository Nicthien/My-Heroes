"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CombatBoardUnit, GameState, PersistentCombat } from "@/lib/game/types";
import { buildTurnQueue } from "@/lib/game/combat/persistent";
import { getCreature } from "@/lib/game/creature-catalog";
import { getUnitRule } from "@/lib/game/units";
import { goldText } from "@/components/game/hud/theme";
import { type DamagePreview, formatRange, getCenteredInitiativeSlots } from "./combatLayout";
import { UnitSilhouette, getUnitModel, getUnitPalette } from "./unitSvg";

export function DamagePreviewPanel({ preview, actor, target }: { preview: DamagePreview; actor?: CombatBoardUnit; target?: CombatBoardUnit }) {
  if (!actor || !target) return null;
  const actorRule = getUnitRule(actor.unitType);
  const targetRule = getUnitRule(target.unitType);
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-30 w-64 rounded-md border border-amber-500/45 bg-black/65 p-3 text-xs text-stone-200 shadow-xl">
      <div className={`text-[11px] font-black uppercase tracking-[0.2em] ${goldText}`}>Preview tactique</div>
      <div className="mt-2 font-bold text-amber-100">{actorRule.label} vers {targetRule.label}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <span className="rounded-sm border border-stone-600/60 bg-stone-950/70 px-2 py-1">{preview.actionLabel}</span>
        <span className="rounded-sm border border-red-500/50 bg-red-950/60 px-2 py-1">{formatRange(preview.minDamage, preview.maxDamage)} deg.</span>
        <span className="rounded-sm border border-amber-500/50 bg-amber-950/60 px-2 py-1">{formatRange(preview.minKills, preview.maxKills)} pertes</span>
      </div>
    </div>
  );
}

export function InitiativeQueue({
  combat,
  gameState,
  inspectedUnitId,
  onInspectUnit,
}: {
  combat: PersistentCombat;
  gameState: GameState;
  inspectedUnitId: string | null;
  onInspectUnit: (unitId: string) => void;
}) {
  const queueRef = useRef<HTMLDivElement>(null);
  const [visibleRadius, setVisibleRadius] = useState(3);
  const unitsById = new Map(combat.boardState.units.map((unit) => [unit.id, unit]));
  const currentRoundOrder = (combat.turnQueue.length > 0 ? combat.turnQueue : buildTurnQueue(combat.boardState.units, combat.round))
    .filter((id) => unitsById.get(id)?.count);
  const nextRoundOrder = buildTurnQueue(combat.boardState.units, combat.round + 1)
    .filter((id) => unitsById.get(id)?.count);
  const initiativeOrder = [...currentRoundOrder, ...nextRoundOrder];
  const queue = getCenteredInitiativeSlots(initiativeOrder, combat.currentUnitId, visibleRadius, currentRoundOrder.length)
    .map((slot) => {
      const unit = unitsById.get(slot.id);
      return unit && unit.count > 0 ? { ...slot, unit } : null;
    })
    .filter((slot): slot is { id: string; offset: number; startsNextRound: boolean; unit: CombatBoardUnit } => Boolean(slot));

  useEffect(() => {
    const element = queueRef.current;
    if (!element) return;

    const updateRadius = () => {
      const width = element.clientWidth;
      setVisibleRadius(width < 230 ? 1 : width < 420 ? 2 : 3);
    };

    updateRadius();
    const observer = new ResizeObserver(updateRadius);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (queue.length === 0) return null;

  return (
    <div ref={queueRef} className="mx-auto flex max-w-full items-center justify-center overflow-hidden">
      <div className="flex max-w-full items-center gap-1.5 overflow-hidden rounded-md border border-amber-700/50 bg-black/55 px-2 py-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.5),0_0_0_1px_rgba(252,211,77,0.12)_inset] backdrop-blur-sm">
        {queue.map(({ unit, offset, startsNextRound }) => {
          const rule = getUnitRule(unit.unitType);
          const active = offset === 0;
          const inspected = inspectedUnitId === unit.id;
          const previous = offset < 0;
          const buttonStyle = getInitiativeButtonStyle(unit, gameState, active, inspected);
          return (
            <div key={`${unit.id}-${offset}`} className="flex shrink-0 items-center gap-1.5">
              {startsNextRound && (
                <span
                  className="h-14 w-1 shrink-0 rounded-full border border-amber-200/70 bg-gradient-to-b from-amber-100 via-amber-300 to-orange-700 shadow-[0_0_12px_rgba(251,191,36,0.72)]"
                  title="Debut du prochain round"
                  aria-label="Debut du prochain round"
                />
              )}
              <button
                type="button"
                className={`group relative shrink-0 overflow-hidden rounded-md border transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 ${active ? "h-16 w-14" : "h-14 w-12"} ${previous ? "opacity-55 saturate-75" : ""}`}
                style={buttonStyle}
                title={`${offset === 0 ? "Actuel" : offset < 0 ? `${Math.abs(offset)} precedent` : `${offset} suivant`} - ${rule.label} x${unit.count} / v${unit.speed}`}
                onClick={() => onInspectUnit(unit.id)}
              >
                <span className={`${active ? "h-12" : "h-10"} absolute inset-x-0 top-0 overflow-hidden bg-gradient-to-b from-stone-900/55 to-black/30`}>
                  <InitiativeMiniature unit={unit} />
                </span>
                {active && <span className="absolute inset-x-1 bottom-4 h-px bg-amber-200/80" />}
                <span className="absolute inset-x-0 bottom-0 grid h-4 place-items-center bg-black/72 px-1 text-[10px] font-black leading-none text-stone-100">
                  x{unit.count}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getInitiativeButtonStyle(unit: CombatBoardUnit, gameState: GameState, active: boolean, inspected: boolean): CSSProperties {
  const color = getCombatUnitAccentColor(unit, gameState);
  const colorStrong = hexToRgba(color, 0.95);
  const colorSoft = hexToRgba(color, 0.32);
  const colorDim = hexToRgba(color, 0.16);
  const focusGlow = active
    ? `0 0 18px rgba(251,191,36,0.68), 0 0 0 2px rgba(251,191,36,0.32), inset 0 0 0 1px ${colorSoft}`
    : inspected
      ? `0 0 12px rgba(125,211,252,0.42), inset 0 0 0 1px ${colorSoft}`
      : `inset 0 0 0 1px ${colorDim}`;

  return {
    borderColor: active ? "#fde68a" : colorStrong,
    background: `linear-gradient(180deg, ${hexToRgba(color, active ? 0.36 : 0.28)}, rgba(2,6,23,0.88))`,
    boxShadow: focusGlow,
  };
}

function getCombatUnitAccentColor(unit: CombatBoardUnit, gameState: GameState) {
  const ownerColor = unit.ownerPlayerId
    ? gameState.players.find((player) => player.id === unit.ownerPlayerId)?.color
    : null;
  if (ownerColor && /^#[0-9a-fA-F]{6}$/.test(ownerColor)) return ownerColor;
  return unit.side === "attacker" ? "#2563eb" : "#dc2626";
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#64748b";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function InitiativeMiniature({ unit }: { unit: CombatBoardUnit }) {
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const sideFlip = unit.side === "defender" ? "scaleX(-1)" : "scaleX(1)";

  return (
    <span
      className="absolute left-1/2 top-1/2 block h-14 w-12 drop-shadow-[0_6px_5px_rgba(0,0,0,0.65)]"
      style={{ transform: `translate(-50%, -45%) scale(0.9) ${sideFlip}`, transformOrigin: "50% 50%" }}
    >
      <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitType={unit.unitType} />
    </span>
  );
}


export function UnitDetails({ unit }: { unit: CombatBoardUnit }) {
  const rule = getUnitRule(unit.unitType);
  const creature = getCreature(unit.unitType);
  const states = [
    unit.defended ? "Defend" : null,
    unit.waited ? "Attend" : null,
    unit.hasRetaliated ? "Riposte utilisee" : null,
  ].filter(Boolean);

  return (
    <div className="flex gap-3">
      <div className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-md border border-amber-700/60 bg-gradient-to-b from-stone-900 to-black shadow-[0_0_0_1px_rgba(252,211,77,0.15)_inset]">
        <UnitPortrait unit={unit} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-black ${goldText}`}>{rule.label} x{unit.count}</div>
        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-stone-400">
          {unit.side === "attacker" ? "Attaquant" : "Defenseur"}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-300">
          <span>Att. {rule.attack}</span>
          <span>Def. {rule.defense}</span>
          <span>Vit. {unit.speed}</span>
          <span>Deg. {unit.minDamage}-{unit.maxDamage}</span>
          <span>PV/u {unit.maxHealth}</span>
          <span>PV {unit.health}/{unit.maxHealth * unit.count}</span>
          <span className={moraleClass(unit.morale)}>Moral. {formatMorale(unit.morale)}</span>
        </div>
        {unit.ranged && <div className="mt-2 text-xs font-bold text-amber-200">Tirs : {unit.shots}</div>}
        {creature.abilities.length > 0 && (
          <div className="mt-2 text-xs text-stone-300">{creature.abilities.join(", ")}</div>
        )}
        {creature.special && <div className="mt-1 text-xs text-amber-100/85">{creature.special}</div>}
        {states.length > 0 && <div className="mt-2 text-xs font-bold text-sky-200">{states.join(" | ")}</div>}
      </div>
    </div>
  );
}

function formatMorale(value: number | undefined) {
  const v = Number.isFinite(value) ? Math.trunc(value as number) : 0;
  if (v > 0) return `+${v}`;
  return String(v);
}

function moraleClass(value: number | undefined) {
  const v = Number.isFinite(value) ? Math.trunc(value as number) : 0;
  if (v > 0) return "text-emerald-300";
  if (v < 0) return "text-rose-300";
  return "text-stone-300";
}

function UnitPortrait({ unit }: { unit: CombatBoardUnit }) {
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const sideFlip = unit.side === "defender" ? "scaleX(-1)" : "scaleX(1)";

  return (
    <div className="relative h-full w-full">
      <span
        className="absolute left-1/2 top-1/2 block h-[104px] w-[80px] drop-shadow-[0_8px_8px_rgba(0,0,0,0.55)]"
        style={{ transform: `translate(-50%, -50%) scale(0.95) ${sideFlip}`, transformOrigin: "50% 50%" }}
      >
        <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitType={unit.unitType} />
      </span>
    </div>
  );
}
