import { ReactNode } from "react";

export const ornateFrame =
  "rounded-xl border border-amber-700/50 bg-gradient-to-b from-stone-900/95 via-[#1a1208]/95 to-stone-950/95 shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset,0_8px_30px_rgba(0,0,0,0.6)]";

export const ornateFramePolished =
  "rounded-xl border border-amber-600/60 bg-gradient-to-b from-[#231708]/95 via-[#15100a]/95 to-[#0c0805]/95 shadow-[0_0_0_1px_rgba(252,211,77,0.18)_inset,0_8px_30px_rgba(0,0,0,0.65)]";

export const goldDivider =
  "h-px w-full bg-gradient-to-r from-transparent via-amber-500/70 to-transparent";

export const goldText =
  "bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_1px_0_rgba(0,0,0,0.6)]";

export const sealRing =
  "relative grid place-items-center rounded-full border-2 border-amber-500/80 bg-gradient-to-br from-amber-900/40 via-stone-900 to-black shadow-[0_0_0_1px_rgba(252,211,77,0.25)_inset,0_4px_12px_rgba(0,0,0,0.65)]";

export const sealRingActive =
  "relative grid place-items-center rounded-full border-2 border-amber-300 bg-gradient-to-br from-amber-700/60 via-amber-900/40 to-black shadow-[0_0_0_2px_rgba(252,211,77,0.45)_inset,0_0_18px_rgba(252,211,77,0.45)]";

export function CornerOrnaments() {
  return (
    <>
      <CornerSVG className="absolute -top-1 -left-1 h-4 w-4" />
      <CornerSVG className="absolute -top-1 -right-1 h-4 w-4 scale-x-[-1]" />
      <CornerSVG className="absolute -bottom-1 -left-1 h-4 w-4 scale-y-[-1]" />
      <CornerSVG className="absolute -bottom-1 -right-1 h-4 w-4 scale-x-[-1] scale-y-[-1]" />
    </>
  );
}

function CornerSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cornerGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
      </defs>
      <path
        d="M2 2 L10 2 L10 4 L4 4 L4 10 L2 10 Z"
        fill="url(#cornerGold)"
        stroke="#000"
        strokeOpacity="0.6"
        strokeWidth="0.5"
      />
      <circle cx="3" cy="3" r="1" fill="#fde68a" />
    </svg>
  );
}

export function OrnateHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-amber-700/40 px-4 py-2">
      <div className="flex items-center gap-2">
        <FleurDeLis className="h-3 w-3 text-amber-400" />
        <span className={`text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>
          {children}
        </span>
        <FleurDeLis className="h-3 w-3 text-amber-400" />
      </div>
      {right}
    </div>
  );
}

export function FleurDeLis({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        d="M8 1 L8 15 M8 8 C 5 8 3 6 3 4 C 5 5 7 6 8 8 C 9 6 11 5 13 4 C 13 6 11 8 8 8 Z M4 12 L12 12"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ParchmentBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.07] mix-blend-overlay"
      style={{
        backgroundImage:
          "radial-gradient(circle at 20% 10%, #fde68a 0%, transparent 35%), radial-gradient(circle at 80% 90%, #d97706 0%, transparent 40%)",
      }}
    />
  );
}

export function PortraitSeal({
  color,
  label,
  active,
  size = 44,
}: {
  color: string;
  label: string;
  active?: boolean;
  size?: number;
}) {
  return (
    <div
      className={active ? sealRingActive : sealRing}
      style={{ width: size, height: size }}
    >
      <div
        className="grid place-items-center rounded-full text-[10px] font-black uppercase text-white drop-shadow"
        style={{
          width: size - 10,
          height: size - 10,
          background: `radial-gradient(circle at 35% 30%, ${color}cc, ${color}66 60%, #000 100%)`,
          boxShadow: "inset 0 0 6px rgba(0,0,0,0.6)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function TowerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M4 22 L4 10 L7 10 L7 6 L9 6 L9 3 L11 5 L13 5 L15 3 L15 6 L17 6 L17 10 L20 10 L20 22 Z M10 14 L14 14 L14 22 L10 22 Z" />
    </svg>
  );
}

export function HeroIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 22 C5 16 8 14 12 14 C16 14 19 16 19 22 Z" />
    </svg>
  );
}

export function MineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M3 20 L12 6 L21 20 Z" />
      <rect x="10" y="14" width="4" height="6" fill="#000" fillOpacity="0.5" />
    </svg>
  );
}

export function HourglassIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M6 2 L18 2 L18 4 L17 8 L13 11 L13 13 L17 16 L18 20 L18 22 L6 22 L6 20 L7 16 L11 13 L11 11 L7 8 L6 4 Z" />
    </svg>
  );
}
