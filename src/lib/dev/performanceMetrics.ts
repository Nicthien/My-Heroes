export type DevPerformanceMeasure = {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
};

export type DevPerformanceGauge = {
  name: string;
  value: number;
  unit?: string;
};

const MAX_MEASURE_NAMES = 24;
const MAX_GAUGE_NAMES = 48;

let enabled = false;
let measures = new Map<string, { count: number; totalMs: number; maxMs: number }>();
let gauges = new Map<string, { value: number; unit?: string }>();

function canMeasure() {
  return enabled && typeof performance !== "undefined";
}

export function setDevPerformanceMetricsEnabled(nextEnabled: boolean) {
  enabled = nextEnabled;
  if (!enabled) {
    measures = new Map();
    gauges = new Map();
  }
}

export function measureDevPerformance<T>(name: string, work: () => T): T {
  if (!canMeasure()) return work();

  const startedAt = performance.now();
  try {
    return work();
  } finally {
    recordDevPerformanceMeasure(name, performance.now() - startedAt);
  }
}

export function recordDevPerformanceMeasure(name: string, durationMs: number) {
  if (!canMeasure() || !Number.isFinite(durationMs) || durationMs < 0) return;

  const current = measures.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
  if (!measures.has(name) && measures.size >= MAX_MEASURE_NAMES) {
    const firstKey = measures.keys().next().value;
    if (firstKey) measures.delete(firstKey);
  }
  measures.set(name, {
    count: current.count + 1,
    totalMs: current.totalMs + durationMs,
    maxMs: Math.max(current.maxMs, durationMs),
  });
}

export function recordDevPerformanceGauge(name: string, value: number, unit?: string) {
  if (!canMeasure() || !Number.isFinite(value)) return;

  if (!gauges.has(name) && gauges.size >= MAX_GAUGE_NAMES) {
    const firstKey = gauges.keys().next().value;
    if (firstKey) gauges.delete(firstKey);
  }
  gauges.set(name, { value, unit });
}

export function getDevPerformanceMeasuresSnapshot(): DevPerformanceMeasure[] {
  if (!enabled || measures.size === 0) return [];

  return Array.from(measures, ([name, measure]) => ({
    name,
    count: measure.count,
    totalMs: measure.totalMs,
    avgMs: measure.count > 0 ? measure.totalMs / measure.count : 0,
    maxMs: measure.maxMs,
  })).sort((left, right) => right.totalMs - left.totalMs);
}

export function getDevPerformanceGaugesSnapshot(): DevPerformanceGauge[] {
  if (!enabled || gauges.size === 0) return [];

  return Array.from(gauges, ([name, gauge]) => ({
    name,
    value: gauge.value,
    unit: gauge.unit,
  })).sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
}
