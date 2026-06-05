"use client";

import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { useReportWebVitals } from "next/web-vitals";
import {
  getDevPerformanceGaugesSnapshot,
  getDevPerformanceMeasuresSnapshot,
  setDevPerformanceMetricsEnabled,
  type DevPerformanceGauge,
  type DevPerformanceMeasure,
} from "@/lib/dev/performanceMetrics";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

const DEV_PANEL_COLLAPSED_KEY = "my-heroes:dev-panel-collapsed";
const DEV_PANEL_POSITION_KEY = "my-heroes:dev-panel-position";
const DEV_PANEL_DEFAULT_POSITION = { x: 12, y: 112 };
const PERFORMANCE_SAMPLE_MS = 1000;
const SLOW_FRAME_MS = 34;

export const DEV_PANEL_MARGIN = 12;

export type DevPanelPosition = { x: number; y: number };

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];
type DevWebVital = {
  name: string;
  value: number;
  rating?: string;
  navigationType?: string;
};
export type DevPerformanceStats = {
  hasFrameSample: boolean;
  fps: number;
  avgFrameMs: number;
  worstFrameMs: number;
  droppedFrames: number;
  longTasks: number;
  longTaskMs: number;
  longTaskTotal: number;
  longTaskTotalMs: number;
  heapUsedMb: number | null;
  heapLimitMb: number | null;
  vitals: Record<string, DevWebVital>;
  measures: DevPerformanceMeasure[];
  gauges: DevPerformanceGauge[];
};
type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

const DEFAULT_DEV_PERFORMANCE_STATS: DevPerformanceStats = {
  hasFrameSample: false,
  fps: 0,
  avgFrameMs: 0,
  worstFrameMs: 0,
  droppedFrames: 0,
  longTasks: 0,
  longTaskMs: 0,
  longTaskTotal: 0,
  longTaskTotalMs: 0,
  heapUsedMb: null,
  heapLimitMb: null,
  vitals: {},
  measures: [],
  gauges: [],
};

export function getDevPanelCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEV_PANEL_COLLAPSED_KEY) === "true";
}

export function clampDevPanelPosition(
  position: DevPanelPosition,
  size = { width: 320, height: 56 }
): DevPanelPosition {
  if (typeof window === "undefined") return position;
  const maxX = Math.max(DEV_PANEL_MARGIN, window.innerWidth - size.width - DEV_PANEL_MARGIN);
  const maxY = Math.max(DEV_PANEL_MARGIN, window.innerHeight - size.height - DEV_PANEL_MARGIN);

  return {
    x: Math.min(Math.max(DEV_PANEL_MARGIN, position.x), maxX),
    y: Math.min(Math.max(DEV_PANEL_MARGIN, position.y), maxY),
  };
}

export function getDevPanelPosition(): DevPanelPosition {
  if (typeof window === "undefined") return DEV_PANEL_DEFAULT_POSITION;
  const savedPosition = window.localStorage.getItem(DEV_PANEL_POSITION_KEY);
  if (!savedPosition) return clampDevPanelPosition(DEV_PANEL_DEFAULT_POSITION);

  try {
    const parsed = JSON.parse(savedPosition) as Partial<DevPanelPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return clampDevPanelPosition(DEV_PANEL_DEFAULT_POSITION);
    }
    return clampDevPanelPosition({ x: parsed.x, y: parsed.y });
  } catch {
    return clampDevPanelPosition(DEV_PANEL_DEFAULT_POSITION);
  }
}

export function saveDevPanelPosition(position: DevPanelPosition) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEV_PANEL_POSITION_KEY, JSON.stringify(position));
}

export function setDevPanelCollapsedStorage(collapsed: boolean) {
  if (typeof window === "undefined") return;
  if (collapsed) {
    window.localStorage.setItem(DEV_PANEL_COLLAPSED_KEY, "true");
  } else {
    window.localStorage.removeItem(DEV_PANEL_COLLAPSED_KEY);
  }
}

function readHeapMemoryStats() {
  if (typeof performance === "undefined") {
    return { heapUsedMb: null, heapLimitMb: null };
  }

  const memory = (performance as PerformanceWithMemory).memory;
  if (!memory) {
    return { heapUsedMb: null, heapLimitMb: null };
  }

  return {
    heapUsedMb: memory.usedJSHeapSize / 1024 / 1024,
    heapLimitMb: memory.jsHeapSizeLimit / 1024 / 1024,
  };
}

export function useDevPerformanceStats(enabled: boolean) {
  const [stats, setStats] = useState<DevPerformanceStats>(DEFAULT_DEV_PERFORMANCE_STATS);
  const longTaskRef = useRef({ count: 0, durationMs: 0, totalCount: 0, totalDurationMs: 0 });

  useEffect(() => {
    setDevPerformanceMetricsEnabled(enabled);
    return () => setDevPerformanceMetricsEnabled(false);
  }, [enabled]);

  const handleWebVitals = useCallback<ReportWebVitalsCallback>((metric) => {
    setStats((current) => ({
      ...current,
      vitals: {
        ...current.vitals,
        [metric.name]: {
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          navigationType: metric.navigationType,
        },
      },
    }));
  }, []);

  useReportWebVitals(handleWebVitals);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let animationFrameId = 0;
    let lastFrameAt: number | null = null;
    let sampleStartedAt = performance.now();
    let frames = 0;
    let totalFrameMs = 0;
    let worstFrameMs = 0;
    let droppedFrames = 0;

    const tick = (now: number) => {
      if (lastFrameAt === null) {
        setStats((current) => ({
          ...current,
          hasFrameSample: false,
          fps: 0,
          avgFrameMs: 0,
          worstFrameMs: 0,
          droppedFrames: 0,
          longTasks: 0,
          longTaskMs: 0,
          longTaskTotal: 0,
          longTaskTotalMs: 0,
          measures: getDevPerformanceMeasuresSnapshot(),
          gauges: getDevPerformanceGaugesSnapshot(),
          ...readHeapMemoryStats(),
        }));
        longTaskRef.current = { count: 0, durationMs: 0, totalCount: 0, totalDurationMs: 0 };
        lastFrameAt = now;
        sampleStartedAt = now;
        animationFrameId = window.requestAnimationFrame(tick);
        return;
      }

      const frameMs = now - lastFrameAt;
      lastFrameAt = now;
      frames += 1;
      totalFrameMs += frameMs;
      worstFrameMs = Math.max(worstFrameMs, frameMs);

      if (frameMs > SLOW_FRAME_MS) {
        droppedFrames += Math.max(1, Math.round(frameMs / 16.67) - 1);
      }

      const sampleMs = now - sampleStartedAt;
      if (sampleMs >= PERFORMANCE_SAMPLE_MS) {
        const memoryStats = readHeapMemoryStats();
        const nextFps = frames > 0 ? frames * 1000 / sampleMs : 0;
        const nextAvgFrameMs = frames > 0 ? totalFrameMs / frames : 0;
        const nextWorstFrameMs = Math.max(worstFrameMs, nextAvgFrameMs);
        const longTaskSnapshot = longTaskRef.current;
        longTaskRef.current = {
          ...longTaskRef.current,
          count: 0,
          durationMs: 0,
        };

        setStats((current) => ({
          ...current,
          hasFrameSample: true,
          fps: current.fps > 0 ? current.fps * 0.55 + nextFps * 0.45 : nextFps,
          avgFrameMs: current.avgFrameMs > 0 ? current.avgFrameMs * 0.55 + nextAvgFrameMs * 0.45 : nextAvgFrameMs,
          worstFrameMs: nextWorstFrameMs,
          droppedFrames,
          longTasks: longTaskSnapshot.count,
          longTaskMs: longTaskSnapshot.durationMs,
          longTaskTotal: longTaskSnapshot.totalCount,
          longTaskTotalMs: longTaskSnapshot.totalDurationMs,
          measures: getDevPerformanceMeasuresSnapshot(),
          gauges: getDevPerformanceGaugesSnapshot(),
          ...memoryStats,
        }));

        sampleStartedAt = now;
        frames = 0;
        totalFrameMs = 0;
        worstFrameMs = 0;
        droppedFrames = 0;
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof PerformanceObserver === "undefined") return;
    if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) return;

    const observer = new PerformanceObserver((list) => {
      let taskCount = 0;
      let taskMs = 0;

      for (const entry of list.getEntries()) {
        taskCount += 1;
        taskMs += entry.duration;
      }

      if (taskCount === 0) return;
      longTaskRef.current = {
        count: longTaskRef.current.count + taskCount,
        durationMs: longTaskRef.current.durationMs + taskMs,
        totalCount: longTaskRef.current.totalCount + taskCount,
        totalDurationMs: longTaskRef.current.totalDurationMs + taskMs,
      };
    });

    observer.observe({ type: "longtask" });
    return () => observer.disconnect();
  }, [enabled]);

  return stats;
}

function formatNumber(value: number, digits: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function formatWebVitalValue(name: string, value: number) {
  if (name === "CLS") return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${value.toFixed(0)}ms`;
}

function formatGaugeValue(gauge: DevPerformanceGauge) {
  const value = Number.isInteger(gauge.value) ? gauge.value.toString() : formatNumber(gauge.value, 1);
  return gauge.unit ? `${value} ${gauge.unit}` : value;
}

function getVitalToneClasses(rating: string | undefined) {
  if (rating === "good") return "border-emerald-500/35 bg-emerald-950/25 text-emerald-100";
  if (rating === "poor") return "border-red-500/40 bg-red-950/25 text-red-100";
  if (rating === "needs-improvement") return "border-amber-500/45 bg-amber-950/25 text-amber-100";
  return "border-amber-900/45 bg-black/25 text-amber-200/70";
}

function getWebVitalDescription(name: string, t: TFn) {
  const keys: Record<string, TranslationKey> = {
    LCP: "perf.descLCP",
    INP: "perf.descINP",
    CLS: "perf.descCLS",
    FCP: "perf.descFCP",
    TTFB: "perf.descTTFB",
  };
  return keys[name] ? t(keys[name]) : name;
}

function formatWebVitalRating(rating: string | undefined, t: TFn) {
  if (rating === "good") return t("perf.ratingGood");
  if (rating === "needs-improvement") return t("perf.ratingNeedsImprovement");
  if (rating === "poor") return t("perf.ratingPoor");
  return "n/a";
}

export function DevPerformancePanel({ stats }: { stats: DevPerformanceStats }) {
  const { t } = useI18n();
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const fpsTone = stats.fps >= 50 ? "good" : stats.fps >= 30 ? "warn" : "bad";
  const frameTone = stats.worstFrameMs <= SLOW_FRAME_MS ? "good" : stats.worstFrameMs <= 55 ? "warn" : "bad";
  const droppedTone = stats.droppedFrames === 0 ? "good" : stats.droppedFrames <= 3 ? "warn" : "bad";
  const fpsText = stats.hasFrameSample ? formatNumber(stats.fps, 0) : "--";
  const avgFrameText = stats.hasFrameSample ? `${formatNumber(stats.avgFrameMs, 1)} ms` : "--";
  const worstFrameText = stats.hasFrameSample ? `${formatNumber(stats.worstFrameMs, 1)} ms` : "--";
  const droppedText = stats.hasFrameSample ? `${stats.droppedFrames}/s` : "--";
  const longTaskRateText = stats.hasFrameSample ? `${stats.longTasks}/s (${formatNumber(stats.longTaskMs, 0)} ms)` : "--";
  const memoryText = stats.heapUsedMb === null
    ? "n/a"
    : `${formatNumber(stats.heapUsedMb, 0)} / ${formatNumber(stats.heapLimitMb ?? 0, 0)} MB`;
  const vitalNames = ["LCP", "INP", "CLS", "FCP", "TTFB"];
  const showTooltip = (text: string) => (event: SyntheticEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = 260;
    const x = Math.min(Math.max(12, rect.left), window.innerWidth - tooltipWidth - 12);
    const y = rect.top > 88 ? rect.top - 8 : rect.bottom + 8;

    setTooltip({ text, x, y });
  };

  return (
    <>
      <section className="space-y-2 border-y border-amber-800/45 py-3" aria-label={t("perf.title")}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-200/80">{t("perf.title")}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80">live</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DevPerformanceStat
            label="FPS"
            value={fpsText}
            tone={stats.hasFrameSample ? fpsTone : "idle"}
            description={t("perf.descFps")}
            onTooltip={showTooltip}
            onTooltipClose={() => setTooltip(null)}
          />
          <DevPerformanceStat
            label={t("perf.labelFrame")}
            value={avgFrameText}
            tone={stats.hasFrameSample ? frameTone : "idle"}
            description={t("perf.descFrame")}
            onTooltip={showTooltip}
            onTooltipClose={() => setTooltip(null)}
          />
          <DevPerformanceStat
            label={t("perf.labelPeak")}
            value={worstFrameText}
            tone={stats.hasFrameSample ? frameTone : "idle"}
            description={t("perf.descPeak")}
            onTooltip={showTooltip}
            onTooltipClose={() => setTooltip(null)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DevPerformanceStat
            label={t("perf.labelStutter")}
            value={droppedText}
            tone={stats.hasFrameSample ? droppedTone : "idle"}
            description={t("perf.descStutter")}
            onTooltip={showTooltip}
            onTooltipClose={() => setTooltip(null)}
          />
          <DevPerformanceStat
            label={t("perf.labelTasks")}
            value={longTaskRateText}
            tone={!stats.hasFrameSample ? "idle" : stats.longTasks === 0 ? "good" : "warn"}
            description={t("perf.descTasks")}
            onTooltip={showTooltip}
            onTooltipClose={() => setTooltip(null)}
          />
        </div>
        <DevPerformanceRow
          label={t("perf.labelTotalTasks")}
          value={`${stats.longTaskTotal} (${formatNumber(stats.longTaskTotalMs, 0)} ms)`}
          description={t("perf.descTotalTasks")}
          onTooltip={showTooltip}
          onTooltipClose={() => setTooltip(null)}
        />
        <DevPerformanceRow
          label={t("perf.labelMemory")}
          value={memoryText}
          description={t("perf.descMemory")}
          onTooltip={showTooltip}
          onTooltipClose={() => setTooltip(null)}
        />
        {stats.measures.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-300/70">{t("perf.mapMeasures")}</div>
            {stats.measures.slice(0, 8).map((measure) => (
              <DevPerformanceRow
                key={measure.name}
                label={measure.name}
                value={t("perf.measureValue", { avg: formatNumber(measure.avgMs, 1), max: formatNumber(measure.maxMs, 1) })}
                description={t("perf.measureDesc", { count: measure.count, total: formatNumber(measure.totalMs, 1) })}
                onTooltip={showTooltip}
                onTooltipClose={() => setTooltip(null)}
              />
            ))}
          </div>
        )}
        {stats.gauges.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-300/70">{t("perf.phaserCounters")}</div>
            {stats.gauges.slice(0, 12).map((gauge) => (
              <DevPerformanceRow
                key={gauge.name}
                label={gauge.name}
                value={formatGaugeValue(gauge)}
                description={t("perf.gaugeDesc", { name: gauge.name })}
                onTooltip={showTooltip}
                onTooltipClose={() => setTooltip(null)}
              />
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <div
            className="cursor-help text-[10px] font-black uppercase tracking-wider text-amber-300/70"
            onPointerEnter={showTooltip(t("perf.webVitalsDesc"))}
            onPointerLeave={() => setTooltip(null)}
            onFocus={showTooltip(t("perf.webVitalsDesc"))}
            onBlur={() => setTooltip(null)}
            tabIndex={0}
          >
            Web Vitals
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {vitalNames.map((name) => {
              const vital = stats.vitals[name];
              const description = getWebVitalDescription(name, t);
              const valueText = vital ? formatWebVitalValue(name, vital.value) : "--";
              const ratingText = vital ? t("perf.currentRating", { rating: formatWebVitalRating(vital.rating, t) }) : "";

              return (
                <div
                  key={name}
                  className={`cursor-help rounded-md border px-1.5 py-1 text-center ${getVitalToneClasses(vital?.rating)}`}
                  aria-label={description}
                  onPointerEnter={showTooltip(`${description}${ratingText}`)}
                  onPointerLeave={() => setTooltip(null)}
                  onFocus={showTooltip(`${description}${ratingText}`)}
                  onBlur={() => setTooltip(null)}
                  tabIndex={0}
                >
                  <div className="text-[9px] font-black uppercase leading-none">{name}</div>
                  <div className="mt-1 font-mono text-[10px] font-bold leading-none">
                    {valueText}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      {tooltip && (
        <div
          className="pointer-events-none fixed z-[100] w-[260px] rounded-md border border-amber-500/55 bg-stone-950/98 px-2.5 py-2 text-[11px] font-semibold leading-snug text-amber-100 shadow-xl shadow-black/60"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: tooltip.y > 96 ? "translateY(-100%)" : undefined,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  );
}

function DevPerformanceStat({
  label,
  value,
  tone,
  description,
  onTooltip,
  onTooltipClose,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "idle";
  description: string;
  onTooltip: (text: string) => (event: SyntheticEvent<HTMLElement>) => void;
  onTooltipClose: () => void;
}) {
  const toneClass = tone === "good"
    ? "border-emerald-500/35 text-emerald-100"
    : tone === "warn"
      ? "border-amber-500/45 text-amber-100"
      : tone === "bad"
        ? "border-red-500/45 text-red-100"
        : "border-amber-900/45 text-amber-200/70";

  return (
    <div
      className={`cursor-help rounded-md border bg-black/30 px-2 py-1.5 ${toneClass}`}
      aria-label={description}
      onPointerEnter={onTooltip(description)}
      onPointerLeave={onTooltipClose}
      onFocus={onTooltip(description)}
      onBlur={onTooltipClose}
      tabIndex={0}
    >
      <div className="text-[9px] font-black uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 font-mono text-[11px] font-bold leading-none">{value}</div>
    </div>
  );
}

function DevPerformanceRow({
  label,
  value,
  description,
  onTooltip,
  onTooltipClose,
}: {
  label: string;
  value: string;
  description: string;
  onTooltip: (text: string) => (event: SyntheticEvent<HTMLElement>) => void;
  onTooltipClose: () => void;
}) {
  return (
    <div
      className="flex cursor-help items-center justify-between gap-3 rounded-md border border-amber-900/45 bg-black/30 px-2.5 py-2"
      aria-label={description}
      onPointerEnter={onTooltip(description)}
      onPointerLeave={onTooltipClose}
      onFocus={onTooltip(description)}
      onBlur={onTooltipClose}
      tabIndex={0}
    >
      <span className="text-[10px] font-black uppercase tracking-wider text-amber-300/70">{label}</span>
      <span className="font-mono text-[11px] font-bold text-amber-100">{value}</span>
    </div>
  );
}
