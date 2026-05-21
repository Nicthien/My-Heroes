"use client";

import { UnitSilhouette, getUnitModel, getUnitPalette } from "@/components/game/combat/CombatScreen";
import { UNIT_RULES as COMBAT_UNIT_RULES } from "@/lib/game/units";
import type { CombatBoardUnit, UnitType } from "@/lib/game/types";

export function UnitSprite({
  unitType,
  side = "attacker",
  size = "sm",
}: {
  unitType: UnitType;
  side?: "attacker" | "defender";
  size?: "xs" | "sm";
}) {
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
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black shadow-inner shadow-black/50 ${frameSize}`}>
      <span
        className={`block drop-shadow-[0_5px_5px_rgba(0,0,0,0.55)] ${spriteSize}`}
        style={{ transform: side === "defender" ? "scaleX(-1)" : undefined }}
      >
        <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitType={unitType} />
      </span>
    </span>
  );
}
