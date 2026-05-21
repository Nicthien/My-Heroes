export const MUSIC_ENABLED_KEY = "my-heroes:music:enabled";
export const MUSIC_VOLUME_KEY = "my-heroes:music:volume";
export const MUSIC_PREFERENCE_EVENT = "my-heroes:music-preference-change";
export const AUDIO_MUTED_KEY = "my-heroes:audio:muted";
export const ADVENTURE_MUSIC_VOLUME_KEY = "my-heroes:audio:adventure-music-volume";
export const COMBAT_MUSIC_VOLUME_KEY = "my-heroes:audio:combat-music-volume";
export const EFFECTS_VOLUME_KEY = "my-heroes:audio:effects-volume";
export const DEFAULT_MUSIC_VOLUME = 0.36;
export const DEFAULT_EFFECTS_VOLUME = 0.55;

const LEGACY_ENABLED_KEYS = [
  "my-heroes:adventure-music:enabled",
  "my-heroes:combat-music:enabled",
];
const LEGACY_ADVENTURE_VOLUME_KEY = "my-heroes:adventure-music:volume";
const LEGACY_COMBAT_VOLUME_KEY = "my-heroes:combat-music:volume";

export function clampAudioVolume(volume: number) {
  return Math.max(0, Math.min(1, volume));
}

export function clampMusicVolume(volume: number) {
  return clampAudioVolume(volume);
}

function getSavedVolume(keys: readonly string[], fallback: number) {
  if (typeof window === "undefined") return fallback;

  for (const key of keys) {
    const rawVolume = window.localStorage.getItem(key);
    if (rawVolume === null) continue;
    const savedVolume = Number(rawVolume);
    if (Number.isFinite(savedVolume)) return clampAudioVolume(savedVolume);
  }

  return fallback;
}

function saveVolume(key: string, volume: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(clampAudioVolume(volume)));
  window.dispatchEvent(new CustomEvent(MUSIC_PREFERENCE_EVENT));
}

export function getSavedAudioMuted() {
  if (typeof window === "undefined") return false;

  const savedMuted = window.localStorage.getItem(AUDIO_MUTED_KEY);
  if (savedMuted !== null) return savedMuted === "true";

  const savedMusicEnabled = window.localStorage.getItem(MUSIC_ENABLED_KEY);
  if (savedMusicEnabled !== null) return savedMusicEnabled !== "true";

  for (const key of LEGACY_ENABLED_KEYS) {
    const legacyEnabled = window.localStorage.getItem(key);
    if (legacyEnabled !== null) return legacyEnabled !== "true";
  }

  return false;
}

export function saveAudioMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUDIO_MUTED_KEY, String(muted));
  window.dispatchEvent(new CustomEvent(MUSIC_PREFERENCE_EVENT));
}

export function getSavedAdventureMusicVolume() {
  return getSavedVolume(
    [ADVENTURE_MUSIC_VOLUME_KEY, MUSIC_VOLUME_KEY, LEGACY_ADVENTURE_VOLUME_KEY],
    DEFAULT_MUSIC_VOLUME
  );
}

export function saveAdventureMusicVolume(volume: number) {
  saveVolume(ADVENTURE_MUSIC_VOLUME_KEY, volume);
}

export function getSavedCombatMusicVolume() {
  return getSavedVolume(
    [COMBAT_MUSIC_VOLUME_KEY, MUSIC_VOLUME_KEY, LEGACY_COMBAT_VOLUME_KEY],
    DEFAULT_MUSIC_VOLUME
  );
}

export function saveCombatMusicVolume(volume: number) {
  saveVolume(COMBAT_MUSIC_VOLUME_KEY, volume);
}

export function getSavedEffectsVolume() {
  return getSavedVolume([EFFECTS_VOLUME_KEY], DEFAULT_EFFECTS_VOLUME);
}

export function saveEffectsVolume(volume: number) {
  saveVolume(EFFECTS_VOLUME_KEY, volume);
}

export function getSavedMusicVolume() {
  return getSavedAdventureMusicVolume();
}

export function getSavedMusicEnabled() {
  return !getSavedAudioMuted();
}

export function saveMusicEnabled(enabled: boolean) {
  saveAudioMuted(!enabled);
}

export function saveMusicVolume(volume: number) {
  saveAdventureMusicVolume(volume);
}
