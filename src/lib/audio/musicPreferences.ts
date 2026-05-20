export const MUSIC_ENABLED_KEY = "my-heroes:music:enabled";
export const MUSIC_VOLUME_KEY = "my-heroes:music:volume";
export const MUSIC_PREFERENCE_EVENT = "my-heroes:music-preference-change";
export const DEFAULT_MUSIC_VOLUME = 0.36;

const LEGACY_ENABLED_KEYS = [
  "my-heroes:adventure-music:enabled",
  "my-heroes:combat-music:enabled",
];
const LEGACY_VOLUME_KEYS = [
  "my-heroes:adventure-music:volume",
  "my-heroes:combat-music:volume",
];

export function clampMusicVolume(volume: number) {
  return Math.max(0, Math.min(1, volume));
}

export function getSavedMusicVolume() {
  if (typeof window === "undefined") return DEFAULT_MUSIC_VOLUME;

  const savedVolume = Number(window.localStorage.getItem(MUSIC_VOLUME_KEY));
  if (Number.isFinite(savedVolume)) return clampMusicVolume(savedVolume);

  for (const key of LEGACY_VOLUME_KEYS) {
    const legacyVolume = Number(window.localStorage.getItem(key));
    if (Number.isFinite(legacyVolume)) return clampMusicVolume(legacyVolume);
  }

  return DEFAULT_MUSIC_VOLUME;
}

export function getSavedMusicEnabled() {
  if (typeof window === "undefined") return false;

  const savedEnabled = window.localStorage.getItem(MUSIC_ENABLED_KEY);
  if (savedEnabled !== null) return savedEnabled === "true";

  for (const key of LEGACY_ENABLED_KEYS) {
    const legacyEnabled = window.localStorage.getItem(key);
    if (legacyEnabled !== null) return legacyEnabled === "true";
  }

  return false;
}

export function saveMusicEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUSIC_ENABLED_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(MUSIC_PREFERENCE_EVENT));
}

export function saveMusicVolume(volume: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUSIC_VOLUME_KEY, String(clampMusicVolume(volume)));
  window.dispatchEvent(new CustomEvent(MUSIC_PREFERENCE_EVENT));
}
