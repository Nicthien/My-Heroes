// Display/visual preferences persisted in localStorage. Mirrors the pattern used
// by `audio/musicPreferences.ts`: simple getters/setters plus a custom window
// event so any listener (React components, the Phaser renderer) can sync live.

export const ANIMATIONS_ENABLED_KEY = "my-heroes:display:animations-enabled";
export const DISPLAY_PREFERENCE_EVENT = "my-heroes:display-preference-change";

// Cached so the per-frame Phaser render loop never has to touch localStorage.
let animationsEnabledCache: boolean | null = null;

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

if (typeof window !== "undefined") {
  const refresh = () => {
    animationsEnabledCache = readAnimationsEnabled();
  };
  window.addEventListener(DISPLAY_PREFERENCE_EVENT, refresh);
  window.addEventListener("storage", refresh);
}
