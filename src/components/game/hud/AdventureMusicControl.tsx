"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  MUSIC_PREFERENCE_EVENT,
  getSavedAdventureMusicVolume,
  getSavedAudioMuted,
} from "@/lib/audio/musicPreferences";
import {
  createAdventureMusicEngine,
  getAdventureMusicProfile,
  getAdventureNightProfile,
  type AdventureMusicEngine,
} from "@/lib/audio/adventureMusic";
import type { Faction } from "@/lib/game/types";
import AudioSettingsButton from "@/components/game/audio/AudioSettingsButton";

type MusicStatus = "idle" | "waiting" | "playing" | "error";

type AdventureMusicControlProps = {
  /** Local player's faction — selects the per-faction musical theme. */
  faction?: Faction | null;
  /** True while the player waits for others after ending their turn — plays the
   *  darker night variant of the faction theme. */
  night?: boolean;
  /** When false, the component runs the music engine headlessly without
   *  rendering the speaker button — audio controls live in the Options dialog. */
  showControl?: boolean;
};

export default function AdventureMusicControl({ faction, night = false, showControl = true }: AdventureMusicControlProps) {
  const activeCombat = useGameStore((state) => state.activeCombat);
  const [muted, setMuted] = useState(getSavedAudioMuted);
  const [volume, setVolume] = useState(getSavedAdventureMusicVolume);
  const [status, setStatus] = useState<MusicStatus>("idle");
  const engineRef = useRef<AdventureMusicEngine | null>(null);
  // Identity (faction + day/night) the live engine was built for, so we can
  // rebuild it whenever either changes.
  const profileKey = `${faction ?? "default"}|${night ? "night" : "day"}`;
  const engineKeyRef = useRef<string | undefined>(undefined);

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    engineKeyRef.current = undefined;
  }, []);

  const getEngine = useCallback((initialVolume = volume) => {
    // Rebuild the engine if the faction or day/night state changed.
    if (engineRef.current && engineKeyRef.current !== profileKey) {
      stopEngine();
    }
    if (!engineRef.current) {
      const profile = night ? getAdventureNightProfile(faction) : getAdventureMusicProfile(faction);
      engineRef.current = createAdventureMusicEngine(profile, initialVolume);
      engineKeyRef.current = profileKey;
    }
    return engineRef.current;
  }, [faction, night, profileKey, stopEngine, volume]);

  const startMusic = useCallback(async (targetVolume = getSavedAdventureMusicVolume()) => {
    if (activeCombat || getSavedAudioMuted() || targetVolume <= 0) return;
    try {
      const engine = getEngine(targetVolume);
      setVolume(targetVolume);
      engine.setVolume(targetVolume);
      engine.setSuppressed(false);
      await engine.start();
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }, [activeCombat, getEngine]);

  const stopMusic = useCallback(() => {
    stopEngine();
    setStatus("idle");
  }, [stopEngine]);

  useEffect(() => {
    if (activeCombat || muted || volume <= 0) {
      stopEngine();
      return;
    }

    if (engineRef.current || status === "error") return;

    const resume = () => {
      void startMusic();
    };

    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [activeCombat, muted, startMusic, status, stopEngine, volume]);

  useEffect(() => {
    if (muted || activeCombat || volume <= 0) {
      stopEngine();
      return;
    }

    engineRef.current?.setVolume(volume);
  }, [activeCombat, muted, stopEngine, volume]);

  // When the faction or day/night state changes (or first resolves), restart the
  // theme so the right variant plays. Status is only set after start() resolves,
  // so no state is mutated synchronously inside the effect.
  useEffect(() => {
    if (engineKeyRef.current === undefined || engineKeyRef.current === profileKey) return;
    if (muted || activeCombat || volume <= 0) {
      stopEngine();
      return;
    }
    const engine = getEngine(volume);
    engine.setVolume(volume);
    engine.setSuppressed(false);
    engine.start().then(() => setStatus("playing"), () => setStatus("error"));
  }, [activeCombat, getEngine, muted, profileKey, stopEngine, volume]);

  useEffect(() => () => stopEngine(), [stopEngine]);

  useEffect(() => {
    const syncPreferences = () => {
      const nextMuted = getSavedAudioMuted();
      const nextVolume = getSavedAdventureMusicVolume();
      setMuted(nextMuted);
      setVolume(nextVolume);

      if (activeCombat || nextMuted || nextVolume <= 0) {
        stopMusic();
        return;
      }

      engineRef.current?.setVolume(nextVolume);
      setStatus("waiting");
      void startMusic(nextVolume);
    };

    window.addEventListener(MUSIC_PREFERENCE_EVENT, syncPreferences);
    window.addEventListener("storage", syncPreferences);

    return () => {
      window.removeEventListener(MUSIC_PREFERENCE_EVENT, syncPreferences);
      window.removeEventListener("storage", syncPreferences);
    };
  }, [activeCombat, startMusic, stopMusic]);

  if (!showControl) return null;

  return (
    <AudioSettingsButton
      dataTestId="adventure-music-control"
      error={status === "error"}
      tone="adventure"
    />
  );
}
