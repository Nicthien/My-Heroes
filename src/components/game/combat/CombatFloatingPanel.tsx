"use client";

import { useState } from "react";
import { CornerOrnaments, FleurDeLis, ParchmentBackground, goldText } from "@/components/game/hud/theme";

export function CombatFloatingPanel({
  title,
  children,
  className,
  expandedClassName,
  bodyClassName,
  defaultCollapsed = false,
}: {
  title: string;
  children: React.ReactNode;
  className: string;
  expandedClassName?: string;
  bodyClassName?: string;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className={`pointer-events-auto relative overflow-hidden ${className} ${collapsed ? "" : expandedClassName ?? ""}`}>
      <CornerOrnaments />
      <ParchmentBackground />
      <button
        type="button"
        className="relative z-10 flex w-full min-w-0 items-center gap-2 border-b border-amber-700/40 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        title={collapsed ? "Deplier" : "Replier"}
      >
        <FleurDeLis className="h-3 w-3 shrink-0 text-amber-400" />
        <span className={`min-w-0 flex-1 truncate text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>{title}</span>
        <FleurDeLis className="h-3 w-3 shrink-0 text-amber-400" />
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-amber-300/80 transition ${collapsed ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {!collapsed && (
        <div className={`relative z-10 ${bodyClassName ?? ""}`}>
          {children}
        </div>
      )}
    </section>
  );
}
