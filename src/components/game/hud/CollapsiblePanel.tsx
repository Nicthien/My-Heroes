"use client";

import { ReactNode, useState } from "react";
import {
  CornerOrnaments,
  FleurDeLis,
  ParchmentBackground,
  goldText,
  ornateFrame,
} from "./theme";

type CollapsiblePanelProps = {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  defaultCollapsed?: boolean;
  right?: ReactNode;
};

export default function CollapsiblePanel({
  title,
  children,
  className,
  bodyClassName,
  defaultCollapsed = false,
  right,
}: CollapsiblePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const collapseLabel = collapsed ? "Déplier" : "Replier";

  return (
    <div className={`relative ${className ?? ornateFrame}`}>
      <CornerOrnaments />
      <ParchmentBackground />
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-amber-700/40 px-4 py-2">
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={`${collapseLabel} ${String(title)}`}
          title={collapseLabel}
        >
          <FleurDeLis className="h-3 w-3 shrink-0 text-amber-400" />
          <span className={`truncate text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>
            {title}
          </span>
          <FleurDeLis className="h-3 w-3 shrink-0 text-amber-400" />
          <svg
            viewBox="0 0 24 24"
            className={`ml-auto h-4 w-4 shrink-0 text-amber-300/80 transition group-hover:text-amber-100 ${
              collapsed ? "rotate-180" : ""
            }`}
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
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </div>
      {!collapsed && <div className={bodyClassName}>{children}</div>}
    </div>
  );
}
