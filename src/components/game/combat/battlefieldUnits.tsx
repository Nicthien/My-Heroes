"use client";

import type { CombatBoardUnit } from "@/lib/game/types";
import { UnitSilhouette, getUnitModel, getUnitPalette } from "./unitSvg";
import { getUnitRenderOffsetX } from "./combatLayout";

export function UnitModel({
  unit,
  active,
  attackable,
  damaged = false,
  attacking = null,
  lifted = false,
  depthScale = 1,
}: {
  unit: CombatBoardUnit;
  active: boolean;
  attackable: boolean;
  damaged?: boolean;
  attacking?: "mêlée" | "ranged" | null;
  lifted?: boolean;
  depthScale?: number;
}) {
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const sideFlip = unit.side === "defender" ? "scaleX(-1)" : "scaleX(1)";
  const renderOffsetX = getUnitRenderOffsetX(unit);
  const attackClass = attacking
    ? `combat-unit-attacking-${attacking}-${unit.side}`
    : "";

  return (
    <span
      className={`pointer-events-none absolute block h-[159px] w-[125px] ${damaged ? "combat-unit-damaged" : ""} ${
        active ? "drop-shadow-[0_0_12px_rgba(252,211,77,0.75)]" : attackable ? "drop-shadow-[0_0_12px_rgba(248,113,113,0.65)]" : ""
      }`}
      style={{
        left: `calc(50% + ${renderOffsetX}px)`,
        top: lifted ? -64 : 4,
        transform: `translateX(-50%) scale(${depthScale})`,
        transformOrigin: "50% 100%",
      }}
    >
      <span className={`absolute inset-0 block ${attackClass}`}>
        <span
          className="absolute left-1/2 top-0 block h-[140px] w-[107px] -translate-x-1/2 drop-shadow-[0_10px_8px_rgba(0,0,0,0.55)]"
          style={{ transform: `translateX(-50%) ${sideFlip}` }}
        >
          <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitType={unit.unitType} />
        </span>
      </span>
      {damaged && <span className="combat-unit-hit-flash absolute left-1/2 top-4 h-24 w-24 -translate-x-1/2 rounded-full bg-red-500/35 blur-sm" />}
    </span>
  );
}

export function UnitBadges({
  unit,
  damaged = false,
  lifted = false,
  depthScale = 1,
}: {
  unit: CombatBoardUnit;
  damaged?: boolean;
  lifted?: boolean;
  depthScale?: number;
}) {
  const renderOffsetX = getUnitRenderOffsetX(unit);
  const badgeOffsetX = renderOffsetX / depthScale;

  return (
    <span
      className="absolute block h-[159px] w-[125px]"
      style={{
        left: `calc(50% + ${renderOffsetX}px)`,
        top: lifted ? -64 : 4,
        transform: `translateX(-50%) scale(${depthScale})`,
        transformOrigin: "50% 100%",
      }}
    >
      <span
        className={`absolute top-[108px] grid h-[18px] min-w-8 -translate-x-1/2 place-items-center rounded-sm border px-1 text-center text-[10px] font-black leading-none shadow-lg ${damaged ? "combat-unit-count-damaged" : ""} ${unit.side === "attacker" ? "border-blue-200/70 bg-blue-950/95 text-blue-50" : "border-red-200/70 bg-red-950/95 text-red-50"}`}
        style={{ left: `calc(50% - ${badgeOffsetX}px)` }}
      >
        {unit.count}
      </span>
      {unit.ranged && (
        <span
          className="absolute top-[91px] grid h-[14px] min-w-6 -translate-x-1/2 place-items-center rounded-sm border border-amber-300/60 bg-amber-950/90 px-1 text-[9px] font-black leading-none text-amber-100"
          style={{ left: `calc(50% - ${badgeOffsetX}px)` }}
        >
          {unit.shots}
        </span>
      )}
    </span>
  );
}
