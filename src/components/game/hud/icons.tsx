"use client";

import type { ReactNode } from "react";

export type TownTab = "summary" | "build" | "recruit" | "garrison" | "tavern";

export function TownTabButton({
  active,
  badge,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  badge?: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group relative flex h-9 w-12 shrink-0 items-center justify-center rounded-md border px-2 outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/70 ${
        active
          ? "border-amber-300/80 bg-gradient-to-b from-amber-700/45 to-amber-950/70 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.22)]"
          : "border-amber-800/50 bg-black/35 text-amber-300/75 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)] hover:border-amber-500/60 hover:bg-amber-950/35 hover:text-amber-100"
      }`}
    >
      <span className="grid h-5 w-5 place-items-center" aria-hidden="true">
        {icon}
      </span>
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-amber-500/60 bg-amber-950 px-1 text-[10px] font-black leading-none text-amber-100">
          {badge}
        </span>
      )}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-amber-600/60 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-amber-100 opacity-0 shadow-lg shadow-black/50 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

export function TownTabIcon({ tab }: { tab: TownTab }) {
  const common = "h-5 w-5";
  switch (tab) {
    case "summary":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      );
    case "build":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <path d="M5 21V8l7-5 7 5v13" />
          <path d="M9 21v-6h6v6" />
          <path d="M10 10h4" />
        </svg>
      );
    case "recruit":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </svg>
      );
    case "garrison":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="M9 12l2 2 4-5" />
        </svg>
      );
    case "tavern":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 22h8" />
          <path d="M12 11v11" />
          <path d="M7 3h10l-1 8a4 4 0 0 1-8 0L7 3Z" />
        </svg>
      );
  }
}

export function TransferToHeroIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h11" />
      <path d="m12 8 4 4-4 4" />
      <circle cx="7" cy="7" r="3" />
      <path d="M2.5 20a4.5 4.5 0 0 1 9 0" />
    </svg>
  );
}

export function TransferToTownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12H10" />
      <path d="m14 8-4 4 4 4" />
      <path d="M3 21h12" />
      <path d="M5 21V9l4-3 4 3v12" />
      <path d="M8 21v-5h2v5" />
    </svg>
  );
}

export function RecruitUnitsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </svg>
  );
}
