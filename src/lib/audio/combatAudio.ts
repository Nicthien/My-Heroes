import { getSavedAudioMuted, getSavedEffectsVolume } from "@/lib/audio/musicPreferences";

const COMBAT_BPM = 92;
const COMBAT_STEP_SECONDS = 60 / COMBAT_BPM / 2;
const COMBAT_LOOKAHEAD_SECONDS = 1.6;

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export type CombatMusicEngine = {
  start: () => Promise<void>;
  stop: () => void;
  setVolume: (volume: number) => void;
};

let sharedContext: AudioContext | null = null;
let sharedOutput: GainNode | null = null;

const BASS_PATTERN = [34, 34, 37, 34, 32, 32, 29, 32] as const;
const WAR_HORN_PATTERN = [
  [46, 53, 58],
  [44, 51, 56],
  [41, 48, 53],
  [43, 50, 55],
] as const;
const OSTINATO_PATTERN = [58, null, 53, 56, 61, null, 56, 53, 56, null, 51, 55, 60, null, 55, 51] as const;

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function clampVolume(volume: number) {
  return Math.max(0, Math.min(1, volume));
}

function getAudioContext() {
  if (sharedContext && sharedContext.state !== "closed") return sharedContext;

  const AudioContextCtor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio is not available in this browser.");
  }

  sharedContext = new AudioContextCtor();
  sharedOutput = sharedContext.createGain();
  sharedOutput.gain.value = 0.92;
  sharedOutput.connect(sharedContext.destination);
  return sharedContext;
}

function getOutput(context: AudioContext) {
  if (!sharedOutput) {
    sharedOutput = context.createGain();
    sharedOutput.gain.value = 0.92;
    sharedOutput.connect(context.destination);
  }
  return sharedOutput;
}

function createNoiseBuffer(context: AudioContext, duration: number) {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function connectWithPan(node: AudioNode, gain: GainNode, pan = 0, destination?: AudioNode) {
  const context = node.context as AudioContext;
  const panner = context.createStereoPanner();
  panner.pan.value = pan;
  node.connect(gain);
  gain.connect(panner);
  panner.connect(destination ?? getOutput(context));
}

function scheduleDrum(context: AudioContext, time: number, kind: "low" | "mid" | "metal", destination: AudioNode) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const duration = kind === "low" ? 0.52 : kind === "mid" ? 0.24 : 0.18;
  const stop = time + duration;

  source.buffer = createNoiseBuffer(context, duration);
  filter.type = kind === "metal" ? "highpass" : "lowpass";
  filter.frequency.setValueAtTime(kind === "low" ? 95 : kind === "mid" ? 360 : 1600, time);
  filter.Q.value = kind === "low" ? 3.8 : 1.2;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(kind === "low" ? 0.3 : kind === "mid" ? 0.12 : 0.075, time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  source.connect(filter);
  connectWithPan(filter, gain, kind === "metal" ? 0.34 : kind === "mid" ? -0.24 : 0, destination);
  source.start(time);
  source.stop(stop);

  if (kind === "low") {
    const oscillator = context.createOscillator();
    const thump = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(74, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.18);
    thump.gain.setValueAtTime(0.0001, time);
    thump.gain.linearRampToValueAtTime(0.24, time + 0.008);
    thump.gain.exponentialRampToValueAtTime(0.0001, time + 0.48);
    oscillator.connect(thump);
    thump.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + 0.5);
  }
}

function scheduleBass(context: AudioContext, time: number, midi: number, destination: AudioNode) {
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const stop = time + COMBAT_STEP_SECONDS * 2.8;

  oscillator.type = "sawtooth";
  oscillator.frequency.value = midiToFrequency(midi);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(180, time);
  filter.Q.value = 1.6;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(0.095, time + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  oscillator.connect(filter);
  connectWithPan(filter, gain, -0.08, destination);
  oscillator.start(time);
  oscillator.stop(stop);
}

function scheduleHorn(context: AudioContext, time: number, chord: readonly number[], destination: AudioNode) {
  chord.forEach((midi, index) => {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const stop = time + COMBAT_STEP_SECONDS * 5.5;

    oscillator.type = "sawtooth";
    oscillator.frequency.value = midiToFrequency(midi);
    oscillator.detune.value = index === 1 ? 4 : -3;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(460, time);
    filter.frequency.setTargetAtTime(820, time + 0.2, 0.8);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.033, time + 0.55 + index * 0.04);
    gain.gain.setTargetAtTime(0.0001, time + COMBAT_STEP_SECONDS * 3.5, 0.9);

    oscillator.connect(filter);
    connectWithPan(filter, gain, [-0.2, 0, 0.24][index] ?? 0, destination);
    oscillator.start(time);
    oscillator.stop(stop);
  });
}

function scheduleOstinato(context: AudioContext, time: number, midi: number, step: number, destination: AudioNode) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const stop = time + 0.7;

  oscillator.type = "triangle";
  oscillator.frequency.value = midiToFrequency(midi);
  filter.type = "bandpass";
  filter.frequency.value = 1450;
  filter.Q.value = 3.4;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(step % 8 === 0 ? 0.07 : 0.045, time + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  oscillator.connect(filter);
  connectWithPan(filter, gain, Math.sin(step * 0.9) * 0.3, destination);
  oscillator.start(time);
  oscillator.stop(stop);
}

function scheduleStep(context: AudioContext, step: number, time: number, destination: AudioNode) {
  const phraseStep = step % 32;
  const ostinatoNote = OSTINATO_PATTERN[step % OSTINATO_PATTERN.length];

  if (phraseStep % 4 === 0) scheduleBass(context, time, BASS_PATTERN[Math.floor(phraseStep / 4) % BASS_PATTERN.length], destination);
  if (phraseStep === 0 || phraseStep === 16) scheduleHorn(context, time, WAR_HORN_PATTERN[Math.floor(phraseStep / 8) % WAR_HORN_PATTERN.length], destination);
  if (phraseStep % 4 === 0 || phraseStep === 10 || phraseStep === 22) scheduleDrum(context, time, "low", destination);
  if (phraseStep === 6 || phraseStep === 14 || phraseStep === 24 || phraseStep === 30) scheduleDrum(context, time, "mid", destination);
  if (phraseStep === 7 || phraseStep === 15 || phraseStep === 23 || phraseStep === 31) scheduleDrum(context, time, "metal", destination);
  if (ostinatoNote !== null) scheduleOstinato(context, time, ostinatoNote, phraseStep, destination);
}

export function createCombatMusicEngine(initialVolume: number): CombatMusicEngine {
  let master: GainNode | null = null;
  let intervalId = 0;
  let stepIndex = 0;
  let nextStepTime = 0;
  let volume = clampVolume(initialVolume);

  const setMasterVolume = (context: AudioContext, ramp = 0.14) => {
    if (!master) return;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(volume, context.currentTime, ramp);
  };

  const scheduler = () => {
    const context = sharedContext;
    if (!context || !master) return;

    while (nextStepTime < context.currentTime + COMBAT_LOOKAHEAD_SECONDS) {
      const voiceBus = context.createGain();
      voiceBus.connect(master);
      scheduleStep(context, stepIndex, nextStepTime, voiceBus);
      window.setTimeout(() => voiceBus.disconnect(), 5000);
      nextStepTime += COMBAT_STEP_SECONDS;
      stepIndex += 1;
    }
  };

  return {
    start: async () => {
      const context = getAudioContext();
      await context.resume();

      if (!master) {
        master = context.createGain();
        master.gain.value = 0.0001;
        master.connect(getOutput(context));
      }

      if (!intervalId) {
        stepIndex = 0;
        nextStepTime = context.currentTime + 0.1;
        scheduler();
        intervalId = window.setInterval(scheduler, 150);
      }

      setMasterVolume(context, 0.1);
    },
    stop: () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = 0;
      }

      const context = sharedContext;
      if (!context || !master) return;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0.0001, context.currentTime, 0.08);
    },
    setVolume: (nextVolume: number) => {
      volume = clampVolume(nextVolume);
      if (sharedContext) setMasterVolume(sharedContext);
    },
  };
}

export async function playCombatDamageHit(intensity = 0.75) {
  if (getSavedAudioMuted()) return;

  const effectsVolume = getSavedEffectsVolume();
  if (effectsVolume <= 0) return;

  const context = getAudioContext();
  await context.resume();

  const hitIntensity = Math.max(0.35, Math.min(1.35, intensity));
  const now = context.currentTime;
  const output = getOutput(context);
  const impactBus = context.createGain();
  impactBus.gain.value = 0.62 * hitIntensity * effectsVolume;
  impactBus.connect(output);

  const low = context.createOscillator();
  const lowGain = context.createGain();
  low.type = "sine";
  low.frequency.setValueAtTime(110, now);
  low.frequency.exponentialRampToValueAtTime(42, now + 0.12);
  lowGain.gain.setValueAtTime(0.0001, now);
  lowGain.gain.linearRampToValueAtTime(0.48, now + 0.008);
  lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  low.connect(lowGain);
  lowGain.connect(impactBus);
  low.start(now);
  low.stop(now + 0.28);

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = createNoiseBuffer(context, 0.22);
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(760, now);
  noiseFilter.Q.value = 1.4;
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.linearRampToValueAtTime(0.34, now + 0.012);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(impactBus);
  noise.start(now);
  noise.stop(now + 0.22);

  const metal = context.createOscillator();
  const metalGain = context.createGain();
  const metalFilter = context.createBiquadFilter();
  metal.type = "square";
  metal.frequency.setValueAtTime(1260, now);
  metal.frequency.exponentialRampToValueAtTime(820, now + 0.09);
  metalFilter.type = "highpass";
  metalFilter.frequency.value = 600;
  metalGain.gain.setValueAtTime(0.0001, now);
  metalGain.gain.linearRampToValueAtTime(0.12, now + 0.006);
  metalGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  metal.connect(metalFilter);
  metalFilter.connect(metalGain);
  metalGain.connect(impactBus);
  metal.start(now);
  metal.stop(now + 0.13);

  window.setTimeout(() => impactBus.disconnect(), 420);
}
