// Display/visual preferences persisted in localStorage. Mirrors the pattern used
// by `audio/musicPreferences.ts`: simple getters/setters plus a custom window
// event so any listener (React components, the Phaser renderer) can sync live.

export const ANIMATIONS_ENABLED_KEY = "my-heroes:display:animations-enabled";
export const RENDER_QUALITY_KEY = "my-heroes:display:render-quality";
export const FPS_DISPLAY_KEY = "my-heroes:display:fps-enabled";
export const DISPLAY_PREFERENCE_EVENT = "my-heroes:display-preference-change";

// Render quality mode. "auto" lets the renderer self-adjust (detects software
// WebGL / sustained low frame rate and suspends ambient effects); "high" forces
// full quality and never auto-degrades; "performance" permanently suspends the
// costly ambient effects for the best frame rate on weak GPUs.
export type RenderQualityMode = "auto" | "high" | "performance";
const RENDER_QUALITY_VALUES: RenderQualityMode[] = ["auto", "high", "performance"];

// Cached so the per-frame Phaser render loop never has to touch localStorage.
let animationsEnabledCache: boolean | null = null;
let renderQualityCache: RenderQualityMode | null = null;

function readAnimationsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(ANIMATIONS_ENABLED_KEY);
  if (raw === null) return true;
  return raw !== "false";
}

export function getSavedAnimationsEnabled(): boolean {
  return readAnimationsEnabled();
}

export function saveAnimationsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ANIMATIONS_ENABLED_KEY, String(enabled));
  animationsEnabledCache = enabled;
  window.dispatchEvent(new CustomEvent(DISPLAY_PREFERENCE_EVENT));
}

/**
 * Cheap, allocation-free read for the render loop. Kept in sync with the stored
 * value via the preference event and cross-tab `storage` events below.
 */
export function areAnimationsEnabled(): boolean {
  if (animationsEnabledCache === null) animationsEnabledCache = readAnimationsEnabled();
  return animationsEnabledCache;
}

function readRenderQuality(): RenderQualityMode {
  if (typeof window === "undefined") return "auto";
  const raw = window.localStorage.getItem(RENDER_QUALITY_KEY);
  return RENDER_QUALITY_VALUES.includes(raw as RenderQualityMode) ? (raw as RenderQualityMode) : "auto";
}

export function getSavedRenderQuality(): RenderQualityMode {
  return readRenderQuality();
}

export function saveRenderQuality(mode: RenderQualityMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RENDER_QUALITY_KEY, mode);
  renderQualityCache = mode;
  window.dispatchEvent(new CustomEvent(DISPLAY_PREFERENCE_EVENT));
}

/** Cheap, allocation-free read for the render loop (same caching as animations). */
export function getRenderQuality(): RenderQualityMode {
  if (renderQualityCache === null) renderQualityCache = readRenderQuality();
  return renderQualityCache;
}

// FPS overlay toggle. Read only on mount / preference change (not per frame),
// so no module-level cache is needed. Off by default.
function readFpsDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FPS_DISPLAY_KEY) === "true";
}

export function getSavedFpsDisplay(): boolean {
  return readFpsDisplay();
}

export function saveFpsDisplay(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FPS_DISPLAY_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(DISPLAY_PREFERENCE_EVENT));
}

if (typeof window !== "undefined") {
  const refresh = () => {
    animationsEnabledCache = readAnimationsEnabled();
    renderQualityCache = readRenderQuality();
  };
  window.addEventListener(DISPLAY_PREFERENCE_EVENT, refresh);
  window.addEventListener("storage", refresh);
}
