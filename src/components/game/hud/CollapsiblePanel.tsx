"use client";

import { type CSSProperties, type HTMLAttributes, type Ref, ReactNode, useState } from "react";
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
  expandedClassName?: string;
  collapsedClassName?: string;
  defaultCollapsed?: boolean;
  right?: ReactNode;
  beforeReset?: ReactNode;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  onResetPosition?: () => void;
  rootRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  testId?: string;
};

export default function CollapsiblePanel({
  title,
  children,
  className,
  bodyClassName,
  expandedClassName,
  collapsedClassName,
  defaultCollapsed = false,
  right,
  beforeReset,
  dragHandleProps,
  onResetPosition,
  rootRef,
  style,
  testId,
}: CollapsiblePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const collapseLabel = collapsed ? "Déplier" : "Replier";
  const draggable = Boolean(dragHandleProps);

  const rootClassName = [
    "relative",
    className ?? ornateFrame,
    collapsed ? collapsedClassName : expandedClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={rootClassName} style={style} data-testid={testId}>
      <CornerOrnaments />
      <ParchmentBackground />
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-amber-700/40 px-4 py-2">
        <div
          {...dragHandleProps}
          className={`group flex min-w-0 flex-1 items-center gap-2 text-left outline-none ${
            draggable ? "cursor-move touch-none select-none" : ""
          }`}
        >
          <FleurDeLis className="h-3 w-3 shrink-0 text-amber-400" />
          <span className={`truncate text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>
            {title}
          </span>
          <FleurDeLis className="h-3 w-3 shrink-0 text-amber-400" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {beforeReset}
          {onResetPosition && (
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md border border-amber-700/50 text-amber-200 transition hover:border-amber-300 hover:text-amber-100"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onResetPosition();
              }}
              aria-label={`Réinitialiser la position ${String(title)}`}
              title="Position initiale"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-md border border-amber-700/50 text-amber-200 transition hover:border-amber-300 hover:text-amber-100"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={`${collapseLabel} ${String(title)}`}
            title={collapseLabel}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 shrink-0 transition ${collapsed ? "rotate-180" : ""}`}
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
          {right}
        </div>
      </div>
      {!collapsed && <div className={bodyClassName}>{children}</div>}
    </div>
  );
}
