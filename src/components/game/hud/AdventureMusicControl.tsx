"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  MUSIC_PREFERENCE_EVENT,
  clampMusicVolume,
  getSavedMusicEnabled,
  getSavedMusicVolume,
  saveMusicEnabled,
  saveMusicVolume,
} from "@/lib/audio/musicPreferences";

const BPM = 74;
const STEP_SECONDS = 60 / BPM / 2;
const LOOKAHEAD_SECONDS = 2.2;

type MusicStatus = "idle" | "waiting" | "playing" | "error";
type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type AdventureMusicEngine = {
  start: () => Promise<void>;
  stop: () => void;
  setVolume: (volume: number) => void;
  setSuppressed: (suppressed: boolean) => void;
};

const PLUCK_PATTERN = [
  74, null, 69, 72, 77, null, 72, 69,
  70, null, 65, 69, 74, null, 69, 65,
  72, null, 67, 71, 76, null, 71, 67,
  69, null, 65, 72, 74, null, 72, 69,
] as const;

const CHORDS = [
  [50, 57, 62, 65],
  [46, 53, 58, 62],
  [48, 55, 60, 64],
  [45, 52, 57, 60],
] as const;

const BASS_PATTERN = [38, 34, 36, 33] as const;

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function clampVolume(volume: number) {
  return clampMusicVolume(volume);
}

function createImpulseResponse(context: AudioContext) {
  const duration = 2.8;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      data[index] = (Math.random() * 2 - 1) * (1 - progress) ** 2.6 * 0.42;
    }
  }

  return impulse;
}

function createNoiseBuffer(context: AudioContext, duration: number) {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length);
  }

  return buffer;
}

function createAdventureMusicEngine(initialVolume: number): AdventureMusicEngine {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let dry: GainNode | null = null;
  let wet: GainNode | null = null;
  let delay: DelayNode | null = null;
  let intervalId = 0;
  let stepIndex = 0;
  let nextStepTime = 0;
  let volume = clampVolume(initialVolume);
  let suppressed = false;

  const getTargetVolume = () => volume * (suppressed ? 0.18 : 1);

  const setMasterVolume = (targetContext: AudioContext, ramp = 0.18) => {
    if (!master) return;
    master.gain.cancelScheduledValues(targetContext.currentTime);
    master.gain.setTargetAtTime(getTargetVolume(), targetContext.currentTime, ramp);
  };

  const connectVoice = (node: AudioNode, delayAmount = 0.24) => {
    if (!dry || !wet || !delay) return;

    const delaySend = node.context.createGain();
    delaySend.gain.value = delayAmount;
    node.connect(dry);
    node.connect(wet);
    node.connect(delaySend);
    delaySend.connect(delay);
  };

  const schedulePad = (targetContext: AudioContext, time: number, chord: readonly number[]) => {
    chord.forEach((note, index) => {
      const oscillator = targetContext.createOscillator();
      const filter = targetContext.createBiquadFilter();
      const gain = targetContext.createGain();
      const pan = targetContext.createStereoPanner();
      const start = time + index * 0.03;
      const stop = time + STEP_SECONDS * 10;

      oscillator.type = index % 2 === 0 ? "sine" : "triangle";
      oscillator.frequency.value = midiToFrequency(note);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(520, start);
      filter.frequency.setTargetAtTime(920, start + 0.5, 1.4);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.042, start + 1.15);
      gain.gain.setTargetAtTime(0.0001, start + STEP_SECONDS * 6.6, 1.4);
      pan.pan.value = [-0.34, -0.12, 0.15, 0.32][index] ?? 0;

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      connectVoice(pan, 0.12);
      oscillator.start(start);
      oscillator.stop(stop);
    });
  };

  const schedulePluck = (targetContext: AudioContext, time: number, midi: number, step: number) => {
    const oscillator = targetContext.createOscillator();
    const filter = targetContext.createBiquadFilter();
    const gain = targetContext.createGain();
    const pan = targetContext.createStereoPanner();
    const stop = time + 1.35;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), time);
    oscillator.detune.setValueAtTime(step % 8 === 0 ? -5 : 4, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3100, time);
    filter.Q.value = 5;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(step % 8 === 0 ? 0.11 : 0.072, time + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    pan.pan.value = Math.sin(step * 0.85) * 0.42;

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    connectVoice(pan, 0.32);
    oscillator.start(time);
    oscillator.stop(stop);
  };

  const scheduleBass = (targetContext: AudioContext, time: number, midi: number) => {
    const oscillator = targetContext.createOscillator();
    const filter = targetContext.createBiquadFilter();
    const gain = targetContext.createGain();
    const stop = time + STEP_SECONDS * 5.5;

    oscillator.type = "sine";
    oscillator.frequency.value = midiToFrequency(midi);
    filter.type = "lowpass";
    filter.frequency.value = 240;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.08, time + 0.08);
    gain.gain.setTargetAtTime(0.0001, time + STEP_SECONDS * 3.2, 0.62);

    oscillator.connect(filter);
    filter.connect(gain);
    connectVoice(gain, 0.05);
    oscillator.start(time);
    oscillator.stop(stop);
  };

  const scheduleBell = (targetContext: AudioContext, time: number, midi: number) => {
    const oscillator = targetContext.createOscillator();
    const gain = targetContext.createGain();
    const pan = targetContext.createStereoPanner();
    const stop = time + 2.8;

    oscillator.type = "sine";
    oscillator.frequency.value = midiToFrequency(midi);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.058, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    pan.pan.value = midi % 2 === 0 ? -0.28 : 0.28;

    oscillator.connect(gain);
    gain.connect(pan);
    connectVoice(pan, 0.44);
    oscillator.start(time);
    oscillator.stop(stop);
  };

  const scheduleBreath = (targetContext: AudioContext, time: number) => {
    const source = targetContext.createBufferSource();
    const filter = targetContext.createBiquadFilter();
    const gain = targetContext.createGain();
    const stop = time + STEP_SECONDS * 7.5;

    source.buffer = createNoiseBuffer(targetContext, STEP_SECONDS * 7.5);
    filter.type = "bandpass";
    filter.frequency.value = 760;
    filter.Q.value = 0.35;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.018, time + 1.2);
    gain.gain.setTargetAtTime(0.0001, time + STEP_SECONDS * 4.7, 1.1);

    source.connect(filter);
    filter.connect(gain);
    connectVoice(gain, 0.18);
    source.start(time);
    source.stop(stop);
  };

  const scheduleStep = (targetContext: AudioContext, step: number, time: number) => {
    const patternStep = step % PLUCK_PATTERN.length;
    const pluckNote = PLUCK_PATTERN[patternStep];

    if (patternStep % 8 === 0) {
      schedulePad(targetContext, time, CHORDS[Math.floor(patternStep / 8) % CHORDS.length]);
    }

    if (patternStep % 16 === 0) {
      scheduleBass(targetContext, time, BASS_PATTERN[Math.floor(patternStep / 8) % BASS_PATTERN.length]);
    }

    if (pluckNote !== null) {
      schedulePluck(targetContext, time, pluckNote, patternStep);
    }

    if (patternStep === 14 || patternStep === 30) {
      scheduleBell(targetContext, time + STEP_SECONDS * 0.35, patternStep === 14 ? 81 : 79);
    }

    if (patternStep === 4 || patternStep === 20) {
      scheduleBreath(targetContext, time);
    }
  };

  const scheduler = () => {
    if (!context) return;

    while (nextStepTime < context.currentTime + LOOKAHEAD_SECONDS) {
      scheduleStep(context, stepIndex, nextStepTime);
      nextStepTime += STEP_SECONDS;
      stepIndex += 1;
    }
  };

  const ensureGraph = () => {
    if (context) return context;

    const AudioContextCtor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("Web Audio is not available in this browser.");
    }

    context = new AudioContextCtor();
    master = context.createGain();
    dry = context.createGain();
    wet = context.createGain();
    delay = context.createDelay(1.5);
    const feedback = context.createGain();
    const convolver = context.createConvolver();
    const compressor = context.createDynamicsCompressor();

    master.gain.value = 0.0001;
    dry.gain.value = 0.72;
    wet.gain.value = 0.28;
    delay.delayTime.value = STEP_SECONDS * 3;
    feedback.gain.value = 0.23;
    convolver.buffer = createImpulseResponse(context);
    compressor.threshold.value = -22;
    compressor.knee.value = 22;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.4;

    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    dry.connect(master);
    wet.connect(convolver);
    convolver.connect(master);
    master.connect(compressor);
    compressor.connect(context.destination);

    return context;
  };

  return {
    start: async () => {
      const targetContext = ensureGraph();
      await targetContext.resume();

      if (!intervalId) {
        stepIndex = 0;
        nextStepTime = targetContext.currentTime + 0.12;
        scheduler();
        intervalId = window.setInterval(scheduler, 180);
      }

      setMasterVolume(targetContext, 0.12);
    },
    stop: () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = 0;
      }

      const targetContext = context;
      if (!targetContext || !master) return;

      master.gain.cancelScheduledValues(targetContext.currentTime);
      master.gain.setTargetAtTime(0.0001, targetContext.currentTime, 0.08);
      window.setTimeout(() => {
        void targetContext.close().catch(() => undefined);
      }, 360);

      context = null;
      master = null;
      dry = null;
      wet = null;
      delay = null;
    },
    setVolume: (nextVolume: number) => {
      volume = clampVolume(nextVolume);
      if (context) setMasterVolume(context);
    },
    setSuppressed: (nextSuppressed: boolean) => {
      suppressed = nextSuppressed;
      if (context) setMasterVolume(context, 0.24);
    },
  };
}

export default function AdventureMusicControl() {
  const activeCombat = useGameStore((state) => state.activeCombat);
  const [enabled, setEnabled] = useState(getSavedMusicEnabled);
  const [volume, setVolume] = useState(getSavedMusicVolume);
  const [status, setStatus] = useState<MusicStatus>("idle");
  const engineRef = useRef<AdventureMusicEngine | null>(null);

  const getEngine = useCallback(() => {
    engineRef.current ??= createAdventureMusicEngine(volume);
    return engineRef.current;
  }, [volume]);

  const startMusic = useCallback(async () => {
    if (activeCombat) return;
    try {
      const savedVolume = getSavedMusicVolume();
      const engine = getEngine();
      setVolume(savedVolume);
      engine.setVolume(savedVolume);
      engine.setSuppressed(false);
      await engine.start();
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }, [activeCombat, getEngine]);

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
  }, []);

  const stopMusic = useCallback(() => {
    stopEngine();
    setStatus("idle");
  }, [stopEngine]);

  useEffect(() => {
    if (activeCombat || !enabled) {
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
  }, [activeCombat, enabled, startMusic, status, stopEngine]);

  useEffect(() => {
    if (!enabled || activeCombat) {
      stopEngine();
      return;
    }

    engineRef.current?.setVolume(volume);
  }, [activeCombat, enabled, stopEngine, volume]);

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

  const label = activeCombat
    ? "Combat"
    : status === "playing"
      ? "Ambiance"
      : enabled
        ? "Pret"
        : "Muet";
  const title = enabled ? "Couper la musique" : "Lancer la musique d'aventure";

  return (
    <div
      className={`flex h-[3.5rem] shrink-0 items-center gap-2 rounded-lg border px-2 shadow-inner shadow-black/40 transition ${
        enabled
          ? "border-emerald-400/50 bg-emerald-950/35 text-emerald-100"
          : "border-amber-700/50 bg-stone-950/80 text-amber-200/90"
      }`}
      data-testid="adventure-music-control"
    >
      <button
        type="button"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-current/35 bg-black/35 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/80"
        onClick={toggleMusic}
        aria-label={title}
        aria-pressed={enabled}
        title={title}
      >
        {enabled ? <MusicOnIcon className="h-5 w-5" /> : <MusicOffIcon className="h-5 w-5" />}
      </button>
      <div className="hidden min-w-24 flex-col gap-1 sm:flex">
        <span className="text-[10px] font-black uppercase leading-none tracking-[0.18em]">
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
          className="h-2 w-24 accent-amber-300"
        />
      </div>
      {status === "error" && (
        <span className="hidden text-[10px] font-bold uppercase tracking-wider text-red-200 lg:inline">
          Audio indisponible
        </span>
      )}
    </div>
  );
}

function MusicOnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none" />
      <circle cx="17" cy="16" r="3" fill="currentColor" stroke="none" />
      <path d="M9 9l11-2" />
    </svg>
  );
}

function MusicOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l8.5-1.55" />
      <path d="M17 10v6" />
      <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
