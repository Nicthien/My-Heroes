"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  MUSIC_PREFERENCE_EVENT,
  clampAudioVolume,
  getSavedAdventureMusicVolume,
  getSavedAudioMuted,
  getSavedCombatMusicVolume,
  getSavedEffectsVolume,
  saveAdventureMusicVolume,
  saveAudioMuted,
  saveCombatMusicVolume,
  saveEffectsVolume,
} from "@/lib/audio/musicPreferences";

type AudioSettingsButtonProps = {
  align?: "left" | "right";
  compact?: boolean;
  dataTestId?: string;
  error?: boolean;
  tone?: "adventure" | "combat";
};

export default function AudioSettingsButton({
  align = "left",
  compact = false,
  dataTestId,
  error = false,
  tone = "adventure",
}: AudioSettingsButtonProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(getSavedAudioMuted);
  const [adventureVolume, setAdventureVolume] = useState(getSavedAdventureMusicVolume);
  const [combatVolume, setCombatVolume] = useState(getSavedCombatMusicVolume);
  const [effectsVolume, setEffectsVolume] = useState(getSavedEffectsVolume);

  useEffect(() => {
    const syncPreferences = () => {
      setMuted(getSavedAudioMuted());
      setAdventureVolume(getSavedAdventureMusicVolume());
      setCombatVolume(getSavedCombatMusicVolume());
      setEffectsVolume(getSavedEffectsVolume());
    };

    window.addEventListener(MUSIC_PREFERENCE_EVENT, syncPreferences);
    window.addEventListener("storage", syncPreferences);
    return () => {
      window.removeEventListener(MUSIC_PREFERENCE_EVENT, syncPreferences);
      window.removeEventListener("storage", syncPreferences);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const changeMuted = (event: ChangeEvent<HTMLInputElement>) => {
    const nextMuted = event.currentTarget.checked;
    setMuted(nextMuted);
    saveAudioMuted(nextMuted);
  };

  const changeAdventureVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = clampAudioVolume(Number(event.currentTarget.value));
    setAdventureVolume(nextVolume);
    saveAdventureMusicVolume(nextVolume);
  };

  const changeCombatVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = clampAudioVolume(Number(event.currentTarget.value));
    setCombatVolume(nextVolume);
    saveCombatMusicVolume(nextVolume);
  };

  const changeEffectsVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = clampAudioVolume(Number(event.currentTarget.value));
    setEffectsVolume(nextVolume);
    saveEffectsVolume(nextVolume);
  };

  const buttonTone = muted
    ? "border-amber-700/50 bg-stone-950/80 text-amber-200/90"
    : tone === "combat"
      ? "border-red-300/50 bg-red-950/55 text-red-100"
      : "border-emerald-400/50 bg-emerald-950/35 text-emerald-100";
  const buttonSize = compact ? "h-8 w-8 rounded" : "h-10 w-10 rounded-md";

  return (
    <div ref={rootRef} className="relative shrink-0" data-testid={dataTestId}>
      <button
        type="button"
        className={`grid ${buttonSize} shrink-0 place-items-center border ${buttonTone} shadow-inner shadow-black/40 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/80`}
        onClick={() => setOpen((value) => !value)}
        aria-label={t("audio.settings")}
        aria-expanded={open}
        title={t("audio.settings")}
      >
        {muted ? <SpeakerOffIcon className={compact ? "h-4 w-4" : "h-5 w-5"} /> : <SpeakerOnIcon className={compact ? "h-4 w-4" : "h-5 w-5"} />}
      </button>

      {open && (
        <div
          className={`absolute top-[calc(100%+0.5rem)] z-50 w-72 rounded-md border border-amber-600/60 bg-stone-950/95 p-3 text-amber-100 shadow-2xl shadow-black/70 backdrop-blur ${align === "right" ? "right-0" : "left-0"}`}
          role="dialog"
          aria-label={t("audio.settings")}
        >
          <label className="flex items-center gap-2 rounded border border-amber-700/35 bg-black/30 px-2 py-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={muted}
              onChange={changeMuted}
              className="h-4 w-4 accent-amber-300"
            />
            <span>{t("audio.muted")}</span>
          </label>

          <div className="mt-3 space-y-3">
            <VolumeSlider
              label={t("audio.musicAdventure")}
              value={adventureVolume}
              onChange={changeAdventureVolume}
              accent="accent-emerald-300"
            />
            <VolumeSlider
              label={t("audio.musicCombat")}
              value={combatVolume}
              onChange={changeCombatVolume}
              accent="accent-red-300"
            />
            <VolumeSlider
              label={t("audio.effects")}
              value={effectsVolume}
              onChange={changeEffectsVolume}
              accent="accent-amber-300"
            />
          </div>

          {error && (
            <div className="mt-3 rounded border border-red-400/45 bg-red-950/50 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-red-100">
              Audio indisponible
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VolumeSlider({
  accent,
  label,
  onChange,
  value,
}: {
  accent: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  value: number;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.14em] text-amber-200/85">
        <span>{label}</span>
        <span className="tabular-nums text-amber-100">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={onChange}
        aria-label={label}
        className={`mt-1 h-2 w-full ${accent}`}
      />
    </label>
  );
}

function SpeakerOnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function SpeakerOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m3 3 18 18" />
      <path d="M16 9.5a5 5 0 0 1 1.1 4.2" />
    </svg>
  );
}
