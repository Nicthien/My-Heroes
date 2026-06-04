"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { HourglassIcon } from "./theme";

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3 8l3.5 3L12 4l5.5 7L21 8l-1.6 10H4.6L3 8Zm1.9 12h14.2v1.6H4.9V20Z" />
    </svg>
  );
}

/**
 * Permanent King life bar shown on the hero/town windows so the player can watch
 * their King's (never-healing) HP at a glance. Mirrors MovementGauge's styling.
 */
export function KingHealthGauge({ health, maxHealth }: { health: number; maxHealth: number }) {
  const { t } = useI18n();
  const ratio = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  const tone = ratio > 0.5
    ? {
      border: "border-amber-400/60",
      text: "text-amber-100",
      track: "bg-amber-950/70",
      fill: "from-amber-300 via-yellow-300 to-amber-200",
      glow: "shadow-[0_0_18px_rgba(251,191,36,0.28)]",
    }
    : ratio > 0.25
      ? {
        border: "border-orange-500/60",
        text: "text-orange-100",
        track: "bg-orange-950/70",
        fill: "from-orange-300 via-orange-400 to-amber-300",
        glow: "shadow-[0_0_18px_rgba(251,146,60,0.24)]",
      }
      : {
        border: "border-red-500/60",
        text: "text-red-100",
        track: "bg-red-950/70",
        fill: "from-red-400 via-red-500 to-rose-400",
        glow: "shadow-[0_0_18px_rgba(248,113,113,0.24)]",
      };

  return (
    <div className={`relative overflow-hidden rounded-lg border ${tone.border} ${tone.track} px-3 py-2 ${tone.text}`}>
      <div
        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${tone.fill} opacity-40 transition-[width] duration-500 ease-out ${tone.glow}`}
        style={{ width: `${ratio * 100}%` }}
      />
      <div className="relative flex items-center justify-between gap-3 text-xs font-bold">
        <span className="flex min-w-0 items-center gap-2">
          <CrownIcon className="h-4 w-4 flex-none text-amber-300" />
          <span className="truncate">{t("hud.kingHealth")}</span>
        </span>
        <span className="flex-none tabular-nums">{Math.max(0, Math.round(health))}/{maxHealth}</span>
      </div>
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-amber-700/30 bg-black/40 px-2 py-1">
      <span className="text-[11px] uppercase tracking-wider text-amber-200/60">{label}</span>
      <span className={`text-base font-black tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export function MovementGauge({ movement, maxMovement }: { movement: number; maxMovement: number }) {
  const { t } = useI18n();
  const ratio = maxMovement > 0 ? Math.max(0, Math.min(1, movement / maxMovement)) : 0;
  const tone = ratio > 0.35
    ? {
      border: "border-emerald-500/55",
      text: "text-emerald-100",
      track: "bg-emerald-950/70",
      fill: "from-emerald-300 via-emerald-400 to-teal-300",
      glow: "shadow-[0_0_18px_rgba(52,211,153,0.25)]",
    }
    : ratio > 0
      ? {
        border: "border-amber-500/55",
        text: "text-amber-100",
        track: "bg-amber-950/70",
        fill: "from-amber-300 via-yellow-300 to-orange-300",
        glow: "shadow-[0_0_18px_rgba(251,191,36,0.24)]",
      }
      : {
        border: "border-red-500/55",
        text: "text-red-100",
        track: "bg-red-950/70",
        fill: "from-red-400 via-red-500 to-rose-400",
        glow: "shadow-[0_0_18px_rgba(248,113,113,0.22)]",
      };

  return (
    <div className={`relative overflow-hidden rounded-lg border ${tone.border} ${tone.track} px-3 py-2 ${tone.text}`}>
      <div
        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${tone.fill} opacity-35 transition-[width] duration-500 ease-out ${tone.glow}`}
        style={{ width: `${ratio * 100}%` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:12px_100%] opacity-25" />
      <div className="relative flex items-center justify-between gap-3 text-xs font-bold">
        <span className="flex min-w-0 items-center gap-2">
          <HourglassIcon className="h-4 w-4 flex-none" />
          <span className="truncate">{t("hud.movement")}</span>
        </span>
        <span className="flex-none tabular-nums">{movement}/{maxMovement}</span>
      </div>
    </div>
  );
}
