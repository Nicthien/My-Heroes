"use client";

import { ReactNode, useState } from "react";
import { goldDivider, goldText } from "@/components/game/hud/theme";
import { RESOURCE_BY_KEY, type ResourceKey } from "./guideData";
import type { ResourceCost } from "@/lib/game/economy";

/**
 * Shared building blocks for the in-game guide (`/guide`). These mirror the HUD’s
 * amber / parchment aesthetic so the wiki feels part of the game, while staying
 * plain presentational components (no game state, no store access).
 */

/** A small public-asset sprite with a graceful glyph fallback when missing. */
export function Sprite({
  src,
  alt,
  size = 48,
  fallback = "◆",
  className,
}: {
  src: string;
  alt: string;
  size?: number;
  fallback?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md border border-amber-700/40 bg-stone-950/70 shadow-inner shadow-black/40 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span className="text-amber-300/70" aria-hidden="true">
          {fallback}
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- static public sprites, fixed tiny dimensions. */
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-contain [image-rendering:auto]"
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/** A guide section: an anchor target + ornate card wrapper with a header. */
export function GuideSection({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-xl border border-amber-700/40 bg-gradient-to-b from-[#1a1208]/85 via-[#140e07]/85 to-[#0c0805]/90 shadow-[0_0_0_1px_rgba(252,211,77,0.1)_inset,0_8px_30px_rgba(0,0,0,0.5)]"
    >
      <header className="flex items-center gap-3 border-b border-amber-700/30 px-5 py-4 sm:px-7">
        {icon && <span className="text-2xl leading-none">{icon}</span>}
        <h2 className={`text-lg font-black uppercase tracking-[0.14em] sm:text-xl ${goldText}`}>
          {title}
        </h2>
      </header>
      <div className="space-y-4 px-5 py-5 text-[15px] leading-relaxed text-amber-100/90 sm:px-7 sm:py-6">
        {children}
      </div>
    </section>
  );
}

/** An emphasised intro line under a section header. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-amber-100/85">{children}</p>;
}

/** A titled sub-block inside a section. */
export function SubBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-amber-300/90">{title}</h3>
      {children}
    </div>
  );
}

type CalloutKind = "tip" | "do" | "dont" | "info" | "warn";

const CALLOUT_STYLE: Record<CalloutKind, { border: string; bg: string; text: string; icon: string; label: string }> = {
  tip: { border: "border-amber-500/50", bg: "bg-amber-950/40", text: "text-amber-100", icon: "💡", label: "Astuce" },
  do: { border: "border-emerald-500/50", bg: "bg-emerald-950/35", text: "text-emerald-100", icon: "✅", label: "À faire" },
  dont: { border: "border-rose-500/50", bg: "bg-rose-950/35", text: "text-rose-100", icon: "⛔", label: "À éviter" },
  info: { border: "border-sky-500/45", bg: "bg-sky-950/35", text: "text-sky-100", icon: "ℹ️", label: "Bon à savoir" },
  warn: { border: "border-orange-500/50", bg: "bg-orange-950/35", text: "text-orange-100", icon: "⚠️", label: "Attention" },
};

export function Callout({
  kind = "tip",
  title,
  children,
}: {
  kind?: CalloutKind;
  title?: string;
  children: ReactNode;
}) {
  const style = CALLOUT_STYLE[kind];
  return (
    <div className={`rounded-lg border-l-4 ${style.border} ${style.bg} px-4 py-3 ${style.text}`}>
      <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]">
        <span aria-hidden="true">{style.icon}</span>
        <span>{title ?? style.label}</span>
      </div>
      <div className="text-sm leading-relaxed opacity-95">{children}</div>
    </div>
  );
}

/** A responsive, themed data table. Cells accept any ReactNode. */
export function GuideTable({
  headers,
  rows,
  align,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  /** Optional per-column text alignment. */
  align?: Array<"left" | "center" | "right">;
}) {
  const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;
  const alignFor = (i: number) => ALIGN_CLASS[align?.[i] ?? "left"];
  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-amber-600/40">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2 ${alignFor(i)} text-xs font-black uppercase tracking-[0.12em] text-amber-300/90`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr
              key={r}
              className="border-b border-amber-900/30 odd:bg-amber-950/10 hover:bg-amber-900/15"
            >
              {row.map((cell, c) => (
                <td key={c} className={`px-3 py-2 ${alignFor(c)} align-middle text-amber-100/90`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A compact pill, e.g. for a faction alignment or a tag. */
export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold"
      style={
        color
          ? { borderColor: `${color}66`, color, backgroundColor: `${color}1a` }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function GoldDivider() {
  return <div className={goldDivider} />;
}

/** Renders a resource cost (or production) as inline icons + amounts. */
export function CostInline({ cost, size = 18 }: { cost: ResourceCost; size?: number }) {
  const entries = (Object.entries(cost) as Array<[ResourceKey, number | undefined]>).filter(
    ([, amount]) => Boolean(amount),
  );
  if (entries.length === 0) return <span className="text-amber-200/60">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {entries.map(([key, amount]) => (
        <span key={key} className="inline-flex items-center gap-1 whitespace-nowrap">
          <Sprite
            src={RESOURCE_BY_KEY[key].sprite}
            alt={RESOURCE_BY_KEY[key].label}
            size={size}
            className="!border-0 !bg-transparent !shadow-none"
          />
          <span className="tabular-nums">{amount}</span>
        </span>
      ))}
    </span>
  );
}
