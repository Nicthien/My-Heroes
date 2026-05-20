"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { createCombatMusicEngine, type CombatMusicEngine } from "@/lib/audio/combatAudio";
import {
  MUSIC_PREFERENCE_EVENT,
  clampMusicVolume,
  getSavedMusicEnabled,
  getSavedMusicVolume,
  saveMusicEnabled,
  saveMusicVolume,
} from "@/lib/audio/musicPreferences";

type MusicStatus = "idle" | "waiting" | "playing" | "error";

function clampVolume(volume: number) {
  return clampMusicVolume(volume);
}

export default function CombatAudioControl() {
  const [enabled, setEnabled] = useState(getSavedMusicEnabled);
  const [volume, setVolume] = useState(getSavedMusicVolume);
  const [status, setStatus] = useState<MusicStatus>("idle");
  const engineRef = useRef<CombatMusicEngine | null>(null);

  const getEngine = useCallback(() => {
    engineRef.current ??= createCombatMusicEngine(volume);
    return engineRef.current;
  }, [volume]);

  const startMusic = useCallback(async () => {
    try {
      const savedVolume = getSavedMusicVolume();
      const engine = getEngine();
      setVolume(savedVolume);
      engine.setVolume(savedVolume);
      await engine.start();
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }, [getEngine]);

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
  }, []);

  const stopMusic = useCallback(() => {
    stopEngine();
    setStatus("idle");
  }, [stopEngine]);

  useEffect(() => {
    if (!enabled || status === "playing" || status === "error") return;

    const resume = () => {
      void startMusic();
    };

    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [enabled, startMusic, status]);

  useEffect(() => {
    if (!enabled) {
      stopEngine();
      return;
    }

    engineRef.current?.setVolume(volume);
  }, [enabled, stopEngine, volume]);

  useEffect(() => () => stopEngine(), [stopEngine]);

  useEffect(() => {
    const syncPreferences = () => {
      setEnabled(getSavedMusicEnabled());
      setVolume(getSavedMusicVolume());
    };

    window.addEventListener(MUSIC_PREFERENCE_EVENT, syncPreferences);
    window.addEventListener("storage", syncPreferences);

    return () => {
      window.removeEventListener(MUSIC_PREFERENCE_EVENT, syncPreferences);
      window.removeEventListener("storage", syncPreferences);
    };
  }, []);

  const toggleMusic = () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    saveMusicEnabled(nextEnabled);

    if (nextEnabled) {
      setStatus("waiting");
      void startMusic();
      return;
    }

    stopMusic();
  };

  const changeVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = clampVolume(Number(event.currentTarget.value));
    setVolume(nextVolume);
    saveMusicVolume(nextVolume);
    engineRef.current?.setVolume(nextVolume);
  };

  const label = status === "playing" ? "Bataille" : enabled ? "Pret" : "Muet";
  const title = enabled ? "Couper la musique de combat" : "Lancer la musique de combat";

  return (
    <div
      className={`flex h-10 shrink-0 items-center gap-2 rounded-md border px-2 shadow-[0_0_0_1px_rgba(0,0,0,0.35)_inset] transition ${
        enabled
          ? "border-red-300/50 bg-red-950/55 text-red-100"
          : "border-amber-700/50 bg-stone-950/70 text-amber-100"
      }`}
      data-testid="combat-audio-control"
    >
      <button
        type="button"
        className="grid h-7 w-7 shrink-0 place-items-center rounded border border-current/35 bg-black/30 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/80"
        onClick={toggleMusic}
        aria-label={title}
        aria-pressed={enabled}
        title={title}
      >
        {enabled ? <CombatMusicOnIcon className="h-4 w-4" /> : <CombatMusicOffIcon className="h-4 w-4" />}
      </button>
      <div className="hidden min-w-20 flex-col gap-0.5 md:flex">
        <span className="text-[9px] font-black uppercase leading-none tracking-[0.18em]">
          {label}
        </span>
        <input
          type="range"
          min={0}
          max={0.65}
          step={0.01}
          value={volume}
          onChange={changeVolume}
          aria-label="Volume de la musique"
          className="h-1.5 w-20 accent-red-300"
        />
      </div>
      {status === "error" && (
        <span className="hidden text-[9px] font-bold uppercase tracking-wider text-red-200 lg:inline">
          Audio indisponible
        </span>
      )}
    </div>
  );
}

function CombatMusicOnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16" />
      <path d="M7 20V8l5-4 5 4v12" />
      <path d="M9 13h6" />
      <path d="M10 16h4" />
    </svg>
  );
}

function CombatMusicOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16" />
      <path d="M7 20V8l5-4 5 4v7" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
