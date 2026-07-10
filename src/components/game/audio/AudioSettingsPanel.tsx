"use client";

import { ChangeEvent, useEffect, useState } from "react";
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

/**
 * Live, persisted audio preferences. Shared by the compact `AudioSettingsButton`
 * dropdown and the full Options dialog so both stay in sync via the
 * `MUSIC_PREFERENCE_EVENT` broadcast and cross-tab `storage` events.
 */
export function useAudioPreferences() {
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

  return {
    muted,
    adventureVolume,
    combatVolume,
    effectsVolume,
    changeMuted,
    changeAdventureVolume,
    changeCombatVolume,
    changeEffectsVolume,
  };
}

type AudioSettingsPanelProps = {
  error?: boolean;
};

/** Mute toggle + the three volume sliders. Presentational; owns no chrome. */
export default function AudioSettingsPanel({ error = false }: AudioSettingsPanelProps) {
  const { t } = useI18n();
  const {
    muted,
    adventureVolume,
    combatVolume,
    effectsVolume,
    changeMuted,
    changeAdventureVolume,
    changeCombatVolume,
    changeEffectsVolume,
  } = useAudioPreferences();

  return (
    <div>
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
          {t("audio.unavailable")}
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
