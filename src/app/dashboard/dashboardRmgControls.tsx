import { OBJECT_COLOR, TERRAIN_COLOR } from "@/components/game/map/RmgMapPreview";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function RmgTuningSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-md border border-amber-700/30 bg-stone-950/55 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-100">{label}</span>
        <span className="rounded border border-amber-700/40 bg-black/40 px-2 py-1 text-xs font-black text-amber-200">
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-amber-500"
      />
    </label>
  );
}

export function GearIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21a2 2 0 1 1-4 0v-.09A1.8 1.8 0 0 0 8.7 19.25a1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.25 15a1.8 1.8 0 0 0-1.66-1.1H2.5a2 2 0 1 1 0-4h.09A1.8 1.8 0 0 0 4.25 8.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.8 1.8 0 0 0 8.7 4.35a1.8 1.8 0 0 0 1.1-1.66V2.6a2 2 0 1 1 4 0v.09a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.66 1.1h.09a2 2 0 1 1 0 4h-.09A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}

export function BookIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M20 19H6a2 2 0 0 0-2 2" />
      <path d="M9 7h6" />
      <path d="M9 11h4" />
    </svg>
  );
}

export function SignOutIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
      <path d="M14 21h5a2 2 0 0 0 2-2" />
    </svg>
  );
}

export function RmgLegend() {
  const { t } = useI18n();
  const terrainItems = [
    [t("rmg.water"), TERRAIN_COLOR.water],
    [t("rmg.beach"), TERRAIN_COLOR.sand],
    [t("rmg.grass"), TERRAIN_COLOR.grass],
    [t("rmg.forest"), TERRAIN_COLOR.forest],
    [t("rmg.mountain"), TERRAIN_COLOR.mountain],
    [t("rmg.swamp"), TERRAIN_COLOR.swamp],
    [t("rmg.bridge"), "#8b5a2b"],
  ];

  const objectItems = [
    [t("rmg.town"), OBJECT_COLOR.town],
    [t("rmg.mine"), OBJECT_COLOR.building],
    [t("rmg.monster"), OBJECT_COLOR.monster],
    [t("rmg.resource"), OBJECT_COLOR.resource],
    [t("rmg.wall"), OBJECT_COLOR.wall],
  ];

  return (
    <div className="border border-stone-800 bg-stone-900/80 p-3">
      <h4 className="mb-2 text-sm font-semibold text-amber-100">{t("rmg.legend")}</h4>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-1.5">
          {terrainItems.map(([label, color]) => (
            <RmgLegendItem key={label} label={label} color={color} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 border-t border-stone-800 pt-2">
          {objectItems.map(([label, color]) => (
            <RmgLegendItem key={label} label={label} color={color} round />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RmgLegendItem({ label, color, round = false }: { label: string; color: string; round?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-stone-300">
      <span
        className={round ? "h-3 w-3 shrink-0 rounded-full" : "h-3 w-3 shrink-0 rounded-sm"}
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{label}</span>
    </div>
  );
}

export function RmgGenerationProgress({ progress, className = "" }: { progress: number; className?: string }) {
  const { t } = useI18n();
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className={`flex min-h-[260px] min-w-0 items-center justify-center overflow-hidden border border-stone-800 bg-stone-900 p-6 ${className}`}>
      <div className="w-full max-w-sm">
        <div className="mb-3 flex items-end justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("rmg.mapGeneration")}</span>
          <span className="font-mono text-sm font-bold text-amber-100">{safeProgress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={t("rmg.mapGeneration")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safeProgress}
          className="h-3 overflow-hidden rounded-sm border border-amber-600/50 bg-black/50 shadow-inner shadow-black"
        >
          <div
            className="h-full bg-gradient-to-r from-amber-700 via-amber-400 to-yellow-200 transition-[width] duration-200 ease-out"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-stone-400">{t("rmg.assembling")}</p>
      </div>
    </div>
  );
}

export function RmgStatBlock({
  title,
  values,
  total,
}: {
  title: string;
  values: Record<string, number>;
  total?: number;
}) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  return (
    <div className="border border-stone-800 bg-stone-900/80 p-3">
      <h4 className="mb-2 text-sm font-semibold text-amber-100">{title}</h4>
      <div className="grid gap-1.5">
        {entries.map(([key, value]) => {
          const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
          return (
            <div key={key} className="grid grid-cols-[1fr_auto] gap-3 text-xs">
              <span className="truncate text-stone-300">{key}</span>
              <span className="font-mono text-stone-100">{pct === null ? value : `${value} - ${pct}%`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
