// Adaptive render quality.
//
// Chrome and Edge are both Chromium and run identical code, yet players report
// the iso map "lagging on Edge but not Chrome". The usual culprits are GPU-side,
// not code-side:
//   1. Edge silently falls back to software WebGL (SwiftShader / Microsoft WARP)
//      when it can't acquire the high-performance GPU. Every frame is then
//      rasterized on the CPU and the map crawls. Chrome keeps hardware accel.
//   2. A weak or power-throttled GPU (Edge "Efficiency mode", integrated chips).
//
// We can't force the browser's GPU choice from JS beyond `powerPreference`, so
// the only lever is making the scene cheaper at runtime. This module:
//   - detects the software-rendering case from `WEBGL_debug_renderer_info`, and
//   - watches real frame cadence to drop ambient animations under sustained lag.
//
// Phaser 4 quirks ruled out other levers: its ScaleManager never multiplies the
// canvas by `devicePixelRatio` (so a "DPR clamp" is a no-op — we already render
// at 1x), and the fps limiter / RESIZE drawing-buffer size are locked at startup,
// so a runtime resolution downscale or fps cap would fight the engine.

export interface GpuRendererInfo {
  renderer: string;
  vendor: string;
  isSoftware: boolean;
}

// Substrings that mark a CPU/software WebGL backend across browsers/platforms.
const SOFTWARE_RENDERER_PATTERNS = [
  "swiftshader",
  "software",
  "llvmpipe",
  "microsoft basic render",
  "basic render driver",
  "warp",
];

export function detectGpuRenderer(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
): GpuRendererInfo | null {
  if (!gl) return null;

  let renderer = "";
  let vendor = "";
  try {
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? "");
      vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? "");
    } else {
      // Extension can be hidden for privacy; fall back to the masked values.
      renderer = String(gl.getParameter(gl.RENDERER) ?? "");
      vendor = String(gl.getParameter(gl.VENDOR) ?? "");
    }
  } catch {
    return null;
  }

  const haystack = `${renderer} ${vendor}`.toLowerCase();
  const isSoftware = SOFTWARE_RENDERER_PATTERNS.some((pattern) => haystack.includes(pattern));
  return { renderer, vendor, isSoftware };
}

export interface GpuProbeResult extends GpuRendererInfo {
  /** Browser flagged that a hardware context would carry a major perf penalty. */
  majorPerformanceCaveat: boolean;
  /** Convenience flag: software backend or a major performance caveat. */
  likelyLaggy: boolean;
}

// Probe the GPU backend with a throwaway WebGL context — usable before any game
// loads (e.g. on the dashboard). Mirrors the game's context request
// (`powerPreference: "high-performance"`) so the verdict reflects what the
// renderer will actually get. Contexts are released immediately.
export function probeGpuRenderer(): GpuProbeResult | null {
  if (typeof document === "undefined") return null;

  const base: WebGLContextAttributes = { powerPreference: "high-performance" };
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl2", base) ||
    canvas.getContext("webgl", base)) as WebGLRenderingContext | WebGL2RenderingContext | null;
  const info = detectGpuRenderer(gl);
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  if (!info) return null;

  // A context that refuses major performance caveats failing (while the normal
  // one above succeeded) means the browser would only offer a slow backend.
  let majorPerformanceCaveat = false;
  try {
    const strictCanvas = document.createElement("canvas");
    const strictAttrs: WebGLContextAttributes = { ...base, failIfMajorPerformanceCaveat: true };
    const strict = (strictCanvas.getContext("webgl2", strictAttrs) ||
      strictCanvas.getContext("webgl", strictAttrs)) as WebGLRenderingContext | null;
    majorPerformanceCaveat = !strict;
    strict?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Probe must never throw; treat as no caveat.
  }

  return { ...info, majorPerformanceCaveat, likelyLaggy: info.isSoftware || majorPerformanceCaveat };
}

// Frame-cadence sampling thresholds. We measure the wall-clock period between
// rendered frames (not CPU work alone), so the signal reflects what the player
// actually feels regardless of whether the bottleneck is CPU or GPU.
const SAMPLE_WINDOW = 120; // ~2s worth of frames at 60fps
const MIN_SAMPLES = 60; // wait for a near-full window before reacting
const DEGRADE_AVG_MS = 30; // sustained avg period > 30ms (~<33fps) → degrade
const RECOVER_AVG_MS = 19; // sustained avg period < 19ms (~>52fps) → recover
const MAX_PLAUSIBLE_PERIOD_MS = 1000; // ignore tab-hidden / debugger pauses

// Rolling monitor with hysteresis: the degrade/recover gap prevents flapping
// when the device hovers right around the threshold.
export class AdaptiveQualityMonitor {
  private periods: number[] = [];
  private lastFrameAt: number | null = null;
  private rollingDegraded = false;
  private forced = false;

  /** True once software rendering is detected (sticky) or sustained lag is seen. */
  get degraded(): boolean {
    return this.forced || this.rollingDegraded;
  }

  /** Permanently degrade — used when software rendering is detected. */
  forceDegraded(): void {
    this.forced = true;
  }

  reset(): void {
    this.periods = [];
    this.lastFrameAt = null;
    this.rollingDegraded = false;
  }

  /** Feed one rendered-frame timestamp (performance.now()). Returns `degraded`. */
  sample(now: number): boolean {
    if (this.forced) return true;

    if (this.lastFrameAt !== null) {
      const period = now - this.lastFrameAt;
      if (period > 0 && period < MAX_PLAUSIBLE_PERIOD_MS) {
        this.periods.push(period);
        if (this.periods.length > SAMPLE_WINDOW) this.periods.shift();
      }
    }
    this.lastFrameAt = now;

    if (this.periods.length >= MIN_SAMPLES) {
      const avg = this.periods.reduce((sum, value) => sum + value, 0) / this.periods.length;
      if (!this.rollingDegraded && avg > DEGRADE_AVG_MS) {
        this.rollingDegraded = true;
      } else if (this.rollingDegraded && avg < RECOVER_AVG_MS) {
        this.rollingDegraded = false;
      }
    }

    return this.degraded;
  }
}
