"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCombatMusicEngine,
  getCombatMusicProfile,
  type CombatMusicEngine,
} from "@/lib/audio/combatAudio";
import {
  MUSIC_PREFERENCE_EVENT,
  getSavedAudioMuted,
  getSavedCombatMusicVolume,
} from "@/lib/audio/musicPreferences";
import { useGameStore } from "@/lib/stores/gameStore";
import type { CombatEnvironmentTheme } from "@/lib/game/types";
import AudioSettingsButton from "@/components/game/audio/AudioSettingsButton";

type MusicStatus = "idle" | "waiting" | "playing" | "error";

export default function CombatAudioControl() {
  // Battlefield theme of the active combat selects the musical profile.
  const theme = useGameStore(
    (state) => state.activeCombat?.boardState?.environment?.theme
  ) as CombatEnvironmentTheme | undefined;
  const [muted, setMuted] = useState(getSavedAudioMuted);
  const [volume, setVolume] = useState(getSavedCombatMusicVolume);
  const [status, setStatus] = useState<MusicStatus>("idle");
  const engineRef = useRef<CombatMusicEngine | null>(null);
  // The theme the live engine was built for, so we can rebuild it on change.
  const engineThemeRef = useRef<CombatEnvironmentTheme | undefined>(undefined);

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    engineThemeRef.current = undefined;
  }, []);

  const getEngine = useCallback((initialVolume = volume) => {
    // Rebuild the engine if the battlefield theme changed.
    if (engineRef.current && engineThemeRef.current !== theme) {
      stopEngine();
    }
    if (!engineRef.current) {
      engineRef.current = createCombatMusicEngine(getCombatMusicProfile(theme), initialVolume);
      engineThemeRef.current = theme;
    }
    return engineRef.current;
  }, [stopEngine, theme, volume]);

  const startMusic = useCallback(async (targetVolume = getSavedCombatMusicVolume()) => {
    if (getSavedAudioMuted() || targetVolume <= 0) return;
    try {
      const engine = getEngine(targetVolume);
      setVolume(targetVolume);
      engine.setVolume(targetVolume);
      await engine.start();
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }, [getEngine]);

  const stopMusic = useCallback(() => {
    stopEngine();
    setStatus("idle");
  }, [stopEngine]);

  useEffect(() => {
    if (muted || volume <= 0 || status === "playing" || status === "error") return;

    const resume = () => {
      void startMusic();
    };

    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [muted, startMusic, status, volume]);

  useEffect(() => {
    if (muted || volume <= 0) {
      stopEngine();
      return;
    }

    engineRef.current?.setVolume(volume);
  }, [muted, stopEngine, volume]);

  // Restart the theme when the battlefield changes mid-session. Status is set
  // only after start() resolves, so no state is mutated synchronously here.
  useEffect(() => {
    if (engineThemeRef.current === undefined || engineThemeRef.current === theme) return;
    if (muted || volume <= 0) {
      stopEngine();
      return;
    }
    const engine = getEngine(volume);
    engine.setVolume(volume);
    engine.start().then(() => setStatus("playing"), () => setStatus("error"));
  }, [getEngine, muted, stopEngine, theme, volume]);

  useEffect(() => () => stopEngine(), [stopEngine]);

  useEffect(() => {
    const syncPreferences = () => {
      const nextMuted = getSavedAudioMuted();
      const nextVolume = getSavedCombatMusicVolume();
      setMuted(nextMuted);
      setVolume(nextVolume);

      if (nextMuted || nextVolume <= 0) {
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
  }, [startMusic, stopMusic]);

  return (
    <AudioSettingsButton
      align="right"
      compact
      dataTestId="combat-audio-control"
      error={status === "error"}
      tone="combat"
    />
  );
}
