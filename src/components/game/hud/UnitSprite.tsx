"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { UnitSilhouette, getUnitModel, getUnitPalette } from "@/components/game/combat/CombatScreen";
import { UNIT_RULES as COMBAT_UNIT_RULES } from "@/lib/game/units";
import { getCreatureEntry } from "@/lib/game/creature-catalog";
import { getUnitRule } from "@/lib/game/units";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizeCreatureAbilities, localizeCreatureSpecial } from "@/lib/i18n/creatureAbilities";
import type { CombatBoardUnit, UnitType } from "@/lib/game/types";
import { unitTypeLabel } from "./helpers";

export function UnitSprite({
  unitType,
  side = "attacker",
  size = "sm",
  describe = false,
}: {
  unitType: UnitType;
  side?: "attacker" | "defender";
  size?: "xs" | "sm";
  /** When true, hovering the sprite reveals a tooltip with the unit's description. */
  describe?: boolean;
}) {
  const [anchor, setAnchor] = useState<{ cx: number; top: number; bottom: number } | null>(null);
  const rule = COMBAT_UNIT_RULES[unitType];
  const unit: CombatBoardUnit = {
    id: `preview-${unitType}`,
    unitType,
    count: 1,
    health: rule?.health ?? 1,
    maxHealth: rule?.health ?? 1,
    position: 0,
    side,
    ownerPlayerId: null,
    heroId: null,
    participantId: null,
    joinsRound: 1,
    q: 0,
    r: 0,
    speed: rule?.speed ?? 4,
    minDamage: rule?.minDamage ?? 1,
    maxDamage: rule?.maxDamage ?? 1,
    ranged: rule?.ranged ?? false,
    shots: rule?.shots ?? 0,
    hasRetaliated: false,
    defended: false,
    waited: false,
  };
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const frameSize = size === "xs" ? "h-10 w-10" : "h-12 w-12";
  const spriteSize = size === "xs" ? "h-[42px] w-[32px]" : "h-[52px] w-[40px]";

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black shadow-inner shadow-black/50 ${frameSize}`}
      onMouseEnter={describe ? (event) => {
        const r = event.currentTarget.getBoundingClientRect();
        setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
      } : undefined}
      onMouseLeave={describe ? () => setAnchor(null) : undefined}
    >
      <span
        className={`block drop-shadow-[0_5px_5px_rgba(0,0,0,0.55)] ${spriteSize}`}
        style={{ transform: side === "defender" ? "scaleX(-1)" : undefined }}
      >
        <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitType={unitType} />
      </span>
      {describe && anchor && typeof document !== "undefined" && createPortal(
        <div className="pointer-events-none fixed z-[100]" style={tooltipStyle(anchor)}>
          <UnitDescriptionCard unitType={unitType} />
        </div>,
        document.body
      )}
    </span>
  );
}

// Card is w-56 (224px). Centre it on the sprite but clamp horizontally so it never
// spills past the viewport edges (the hero/town windows sit hard against the left),
// and flip it below the sprite when there isn't room above near the top of the screen.
const TOOLTIP_WIDTH = 224;
const TOOLTIP_MARGIN = 8;

function tooltipStyle(anchor: { cx: number; top: number; bottom: number }): CSSProperties {
  const half = TOOLTIP_WIDTH / 2;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : TOOLTIP_WIDTH;
  const minX = half + TOOLTIP_MARGIN;
  const maxX = Math.max(minX, viewportWidth - half - TOOLTIP_MARGIN);
  const left = Math.min(Math.max(anchor.cx, minX), maxX);
  const placeBelow = anchor.top < 200;
  return placeBelow
    ? { left, top: anchor.bottom + 8, transform: "translateX(-50%)" }
    : { left, top: anchor.top - 8, transform: "translate(-50%, -100%)" };
}

function UnitDescriptionCard({ unitType }: { unitType: UnitType }) {
  const { t, locale } = useI18n();
  const rule = getUnitRule(unitType);
  const creature = getCreatureEntry(unitType);
  const abilities = rule.abilities ?? [];
  return (
    <div className="w-56 rounded-md border border-amber-500/60 bg-stone-950/95 p-3 text-amber-100 shadow-xl shadow-black/60">
      <div className="font-black text-amber-200">{unitTypeLabel(unitType, locale)}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-amber-100/85">
        <span>{t("combat.statAttack", { v: rule.attack })}</span>
        <span>{t("combat.statDefense", { v: rule.defense })}</span>
        <span>{t("combat.statSpeed", { v: rule.speed })}</span>
        <span>{t("combat.statDamage", { min: rule.minDamage, max: rule.maxDamage })}</span>
        <span>{t("combat.statHpPerUnit", { v: rule.health })}</span>
        {rule.ranged && <span>{t("combat.statShots", { n: rule.shots ?? 0 })}</span>}
      </div>
      {abilities.length > 0 && (
        <div className="mt-2 text-[11px] text-amber-100/70">{localizeCreatureAbilities(abilities, locale)}</div>
      )}
      {creature?.special && <div className="mt-1 text-[11px] text-amber-200/80">{localizeCreatureSpecial(creature.special, locale)}</div>}
    </div>
  );
}
