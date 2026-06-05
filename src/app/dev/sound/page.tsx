"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ADVENTURE_MUSIC_FACTIONS,
  createAdventureMusicEngine,
  getAdventureMusicProfile,
  getAdventureNightProfile,
  type AdventureMusicEngine,
} from "@/lib/audio/adventureMusic";
import {
  COMBAT_MUSIC_PROFILES,
  COMBAT_MUSIC_PROFILE_KEYS,
  createCombatMusicEngine,
  type CombatMusicEngine,
} from "@/lib/audio/combatAudio";
import {
  playBattleStart,
  playCaptureFlourish,
  playDefeatStinger,
  playKnowledgeChime,
  playMusterCall,
  playMysticAura,
  playResourcePickup,
  playRevealChime,
  playTeleportWhoosh,
  playTreasureReward,
  playVictoryFanfare,
} from "@/lib/audio/soundEffects";
import { MOVEMENT_SOUNDS, type MovementSoundKind } from "@/lib/rendering/phaser/mapRenderSettings";
import { FACTION_META } from "@/app/dashboard/factionMeta";
import { Faction } from "@/lib/game/types";

// Movement sounds are .wav files played by Phaser in-game; here we play them with
// a plain Audio element, scaled by the configured volume and the dev slider.
function playMovementSample(kind: MovementSoundKind, volume: number) {
  try {
    const config = MOVEMENT_SOUNDS[kind];
    const audio = new Audio(config.path);
    audio.volume = Math.max(0, Math.min(1, config.volume * volume));
    void audio.play().catch(() => undefined);
  } catch {
    // Audio must never crash the page.
  }
}

// SFX auditioning. The dev slider volume is passed explicitly so effects play
// even when the game is muted.
const SOUND_EFFECTS: { id: string; label: string; play: (volume: number) => void }[] = [
  { id: "pickup-gold", label: "💰 Or ramassé", play: (v) => playResourcePickup("gold", v) },
  { id: "pickup-wood", label: "🪵 Ressource ramassée", play: (v) => playResourcePickup("wood", v) },
  { id: "treasure", label: "📦 Trésor / récompense", play: (v) => playTreasureReward(v) },
  { id: "capture", label: "🚩 Prise (mine/ville)", play: (v) => playCaptureFlourish(v) },
  { id: "bld-reveal", label: "🔭 Bâtiment vision", play: (v) => playRevealChime(v) },
  { id: "bld-knowledge", label: "📚 Bâtiment savoir", play: (v) => playKnowledgeChime(v) },
  { id: "bld-mystic", label: "✨ Bâtiment magique", play: (v) => playMysticAura(v) },
  { id: "bld-muster", label: "🎺 Demeure (recrutement)", play: (v) => playMusterCall(v) },
  { id: "battle-start", label: "⚔ Début de bataille", play: (v) => playBattleStart(v) },
  { id: "victory", label: "🏆 Victoire", play: (v) => playVictoryFanfare(v) },
  { id: "defeat", label: "💀 Défaite", play: (v) => playDefeatStinger(v) },
  { id: "teleport", label: "🌀 Téléportation", play: (v) => playTeleportWhoosh(v) },
  { id: "move-horse", label: "🐎 Cheval (trot)", play: (v) => playMovementSample("horse", v) },
  { id: "move-boat", label: "⛵ Bateau (eau)", play: (v) => playMovementSample("boat", v) },
];

type FactionKey = Faction | "default";

const DEFAULT_VOLUME = 0.5;

function factionDisplay(key: FactionKey) {
  if (key === "default") return { label: "Neutre", color: "#94a3b8", emblem: "♪" };
  const meta = FACTION_META[key];
  return { label: meta?.label ?? key, color: meta?.color ?? "#94a3b8", emblem: meta?.emblem ?? "♪" };
}

export default function DevSoundPage() {
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [night, setNight] = useState(false);
  const [activeFaction, setActiveFaction] = useState<FactionKey | null>(null);
  const [activeCombatProfile, setActiveCombatProfile] = useState<string | null>(null);

  const adventureEngineRef = useRef<AdventureMusicEngine | null>(null);
  const combatEngineRef = useRef<CombatMusicEngine | null>(null);

  const stopAdventure = useCallback(() => {
    adventureEngineRef.current?.stop();
    adventureEngineRef.current = null;
    setActiveFaction(null);
  }, []);

  const stopCombat = useCallback(() => {
    combatEngineRef.current?.stop();
    combatEngineRef.current = null;
    setActiveCombatProfile(null);
  }, []);

  const playFaction = useCallback(
    async (key: FactionKey) => {
      // Only one adventure theme at a time: swap engines so timbres/key change.
      adventureEngineRef.current?.stop();
      const faction = key === "default" ? null : key;
      const profile = night ? getAdventureNightProfile(faction) : getAdventureMusicProfile(faction);
      const engine = createAdventureMusicEngine(profile, volume);
      adventureEngineRef.current = engine;
      engine.setVolume(volume);
      engine.setSuppressed(false);
      await engine.start();
      setActiveFaction(key);
    },
    [night, volume]
  );

  const playCombat = useCallback(
    async (profileKey: string) => {
      // One battlefield theme at a time: swap engines so tempo/timbre change.
      combatEngineRef.current?.stop();
      const engine = createCombatMusicEngine(COMBAT_MUSIC_PROFILES[profileKey], volume);
      combatEngineRef.current = engine;
      engine.setVolume(volume);
      await engine.start();
      setActiveCombatProfile(profileKey);
    },
    [volume]
  );

  // Keep both live engines in sync with the volume slider.
  useEffect(() => {
    adventureEngineRef.current?.setVolume(volume);
    combatEngineRef.current?.setVolume(volume);
  }, [volume]);

  // Stop everything when leaving the page.
  useEffect(
    () => () => {
      adventureEngineRef.current?.stop();
      combatEngineRef.current?.stop();
    },
    []
  );

  const anythingPlaying = activeFaction !== null || activeCombatProfile !== null;

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-10 text-stone-100">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-amber-200">Banc d&apos;essai audio</h1>
          <p className="text-sm text-stone-400">
            Écoute la musique d&apos;aventure de chaque faction et le thème de combat. Tout est généré
            par code (Web Audio, aucun fichier). Clique une faction pour lancer son thème — il s&apos;arrête
            automatiquement quand tu en choisis un autre.
          </p>
        </header>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="dev-sound-volume" className="text-xs font-bold uppercase tracking-wide text-stone-400">
              Volume
            </label>
            <span className="text-xs tabular-nums text-stone-400">{Math.round(volume * 100)}%</span>
          </div>
          <input
            id="dev-sound-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="w-full accent-amber-400"
            data-testid="dev-sound-volume"
          />
          {anythingPlaying ? (
            <button
              type="button"
              onClick={() => {
                stopAdventure();
                stopCombat();
              }}
              className="rounded-md border border-rose-600/50 bg-rose-900/40 px-3 py-1.5 text-xs font-black text-rose-100 transition hover:border-rose-400"
              data-testid="dev-sound-stop-all"
            >
              ⏹ Tout arrêter
            </button>
          ) : (
            <p className="text-xs text-stone-500">Rien ne joue.</p>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-stone-400">Musique d&apos;aventure</h2>
            <button
              type="button"
              onClick={() => setNight((current) => !current)}
              data-testid="dev-sound-night-toggle"
              data-active={night}
              className={`rounded-md border px-3 py-1 text-xs font-black transition ${
                night
                  ? "border-indigo-300 bg-indigo-900/50 text-indigo-100"
                  : "border-stone-700/70 bg-stone-900/70 text-stone-300 hover:border-indigo-400"
              }`}
            >
              🌙 Nuit {night ? "ON" : "OFF"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ADVENTURE_MUSIC_FACTIONS.map((key) => {
              const display = factionDisplay(key);
              const profile = night
                ? getAdventureNightProfile(key === "default" ? null : key)
                : getAdventureMusicProfile(key === "default" ? null : key);
              const isActive = activeFaction === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => void playFaction(key)}
                  data-testid={`dev-sound-faction-${key}`}
                  data-active={isActive}
                  className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition ${
                    isActive
                      ? "border-amber-300 bg-amber-900/40 shadow-lg"
                      : "border-stone-700/70 bg-stone-900/70 hover:border-stone-500"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-black" style={{ color: display.color }}>
                    <span aria-hidden>{display.emblem}</span>
                    {display.label}
                  </span>
                  <span className="text-[11px] text-stone-400">{profile.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-stone-500">
                    {profile.bpm} BPM{isActive ? " · ▶ en lecture" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-400">Musique de combat</h2>
          <p className="text-xs text-stone-500">Une musique distincte par champ de bataille.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COMBAT_MUSIC_PROFILE_KEYS.map((key) => {
              const profile = COMBAT_MUSIC_PROFILES[key];
              const isActive = activeCombatProfile === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => void playCombat(key)}
                  data-testid={`dev-sound-combat-${key}`}
                  data-active={isActive}
                  className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition ${
                    isActive
                      ? "border-rose-300 bg-rose-900/40 shadow-lg"
                      : "border-stone-700/70 bg-stone-900/70 hover:border-rose-400"
                  }`}
                >
                  <span className="text-sm font-black text-rose-100">⚔ {profile.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-stone-500">
                    {profile.bpm} BPM{isActive ? " · ▶ en lecture" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-400">Effets sonores</h2>
          <p className="text-xs text-stone-500">
            Effets ponctuels (joués au volume du slider, audibles même si le jeu est en sourdine).
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SOUND_EFFECTS.map((effect) => (
              <button
                key={effect.id}
                type="button"
                onClick={() => effect.play(volume)}
                data-testid={`dev-sound-sfx-${effect.id}`}
                className="rounded-lg border border-stone-700/70 bg-stone-900/70 px-3 py-2 text-left text-sm font-bold text-stone-100 transition hover:border-amber-400"
              >
                {effect.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
