"use client";

import Image from "next/image";
import type { CombatBoardUnit } from "@/lib/game/types";
import { UnitSilhouette, getUnitModel, getUnitPalette } from "./unitSvg";
import { getUnitRenderOffsetX, getUnitRenderOffsetY } from "./combatLayout";

// The unit silhouette art sits a fixed ~44px (in the unit's local, pre-scale
// coordinate space) to the LEFT of its 125px box centre — consistent across
// every sprite and row. Status badges (luck/morale) anchor to this so they sit
// centred above the creature's head rather than over the empty right of the box.
const STATUS_BADGE_SPRITE_OFFSET_X = 44;

export function UnitModel({
  unit,
  active,
  attackable,
  damaged = false,
  attacking = null,
  lifted = false,
  depthScale = 1,
  interactive = false,
  ownerFaction,
  persistentLuckIcon = false,
  onClick,
  onContextMenu,
}: {
  unit: CombatBoardUnit;
  active: boolean;
  attackable: boolean;
  damaged?: boolean;
  attacking?: "mêlée" | "ranged" | null;
  lifted?: boolean;
  depthScale?: number;
  interactive?: boolean;
  ownerFaction?: string;
  persistentLuckIcon?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLSpanElement>) => void;
}) {
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const sideFlip = unit.side === "defender" ? "scaleX(-1)" : "scaleX(1)";
  const renderOffsetX = getUnitRenderOffsetX(unit);
  const renderOffsetY = getUnitRenderOffsetY(unit);
  const attackClass = attacking
    ? `combat-unit-attacking-${attacking}-${unit.side}`
    : "";
  const moraleIcon = unit.moraleTriggered
    ? {
        src: unit.moraleTriggered === "good" ? "/assets/sprites/artifacts/badge_courage.webp" : "/assets/sprites/artifacts/skull_helmet.webp",
        glow: unit.moraleTriggered === "good" ? "bg-emerald-200/25" : "bg-red-300/25",
        className: unit.moraleTriggered === "good" ? "combat-morale-icon-good" : "combat-morale-icon-bad",
      }
    : null;

  return (
    <span
      data-testid={`combat-unit-${unit.id}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={interactive ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      } : undefined}
      className={`${interactive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"} absolute block h-[159px] w-[125px] ${damaged ? "combat-unit-damaged" : ""} ${
        active ? "drop-shadow-[0_0_12px_rgba(252,211,77,0.75)]" : attackable ? "drop-shadow-[0_0_12px_rgba(248,113,113,0.65)]" : ""
      }`}
      style={{
        left: `calc(50% + ${renderOffsetX}px)`,
        top: (lifted ? -64 : 4) + renderOffsetY,
        transform: `translateX(-50%) scale(${depthScale})`,
        transformOrigin: "50% 100%",
      }}
    >
      <span className={`pointer-events-none absolute inset-0 block ${attackClass}`}>
        <span
          className="pointer-events-none absolute left-1/2 top-0 block h-[140px] w-[107px] -translate-x-1/2 drop-shadow-[0_10px_8px_rgba(0,0,0,0.55)]"
          style={{ transform: `translateX(-50%) ${sideFlip}` }}
        >
          <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitFaction={ownerFaction} unitType={unit.unitType} />
        </span>
      </span>
      {damaged && <span className="combat-unit-hit-flash absolute left-1/2 top-4 h-24 w-24 -translate-x-1/2 rounded-full bg-red-500/35 blur-sm" />}
      {unit.luckTriggered && (
        <span
          className={`${persistentLuckIcon ? "combat-luck-icon-static h-12 w-12" : "combat-luck-icon h-10 w-10"} absolute top-[-20px] grid -translate-x-1/2 place-items-center`}
          style={{ left: `calc(50% - ${STATUS_BADGE_SPRITE_OFFSET_X}px)` }}
          aria-hidden="true"
        >
          <span className="absolute inset-0 rounded-full bg-amber-200/25 blur-sm" />
          <Image
            src="/assets/sprites/artifacts/clover_fortune.webp"
            alt=""
            width={40}
            height={40}
            unoptimized
            className={`${persistentLuckIcon ? "h-12 w-12" : "h-10 w-10"} relative object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,0.75)]`}
            style={{ height: "auto" }}
          />
        </span>
      )}
      {moraleIcon && (
        <span
          className={`${moraleIcon.className} absolute top-[-22px] grid h-10 w-10 -translate-x-1/2 place-items-center`}
          style={{ left: `calc(50% - ${STATUS_BADGE_SPRITE_OFFSET_X}px)` }}
          aria-hidden="true"
        >
          <span className={`absolute inset-0 rounded-full ${moraleIcon.glow} blur-sm`} />
          <Image
            src={moraleIcon.src}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="relative h-10 w-10 object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,0.75)]"
            style={{ height: "auto" }}
          />
        </span>
      )}
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
  const renderOffsetY = getUnitRenderOffsetY(unit);
  const badgeOffsetX = renderOffsetX / depthScale;

  return (
    <span
      className="absolute block h-[159px] w-[125px]"
      style={{
        left: `calc(50% + ${renderOffsetX}px)`,
        top: (lifted ? -64 : 4) + renderOffsetY,
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
