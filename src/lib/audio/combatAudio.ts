import { getSavedAudioMuted, getSavedEffectsVolume } from "@/lib/audio/musicPreferences";
import type { CombatEnvironmentTheme } from "@/lib/game/types";

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

// Martial brass melody layered over alternate 32-step phrases for a memorable
// hook. Values index into the *current* war-horn chord (see scheduleStep) and are
// raised an octave, so the lead always agrees with the harmony. `null` = rest.
// Shared across battlefields — only the chords underneath change, so the lead
// stays consonant everywhere.
//
// Syncopated heroic line: notes land on off-beats with an undulating
// rise/fall contour — a different character from both the bugle-style fanfare
// and the flowing adventure lead.
const WAR_LEAD_PATTERN = [
  null, 2, null, 2, null, null, 1, null, 2, null, null, null, 1, null, 0, null,
  null, 2, null, 2, null, null, 1, null, 0, null, 1, null, 2, null, null, null,
] as const;

// Per-battlefield musical identity. Melodic voices (lead/ostinato) sit on the
// chord tones below, so only harmony/tempo/timbre differ between battlefields.
export type CombatMusicProfile = {
  key: string;
  /** Short French label, surfaced in the /dev/sound tester. */
  label: string;
  bpm: number;
  bassPattern: readonly number[];
  hornPattern: readonly (readonly number[])[];
  ostinatoPattern: readonly (number | null)[];
  horn: { type: OscillatorType; cutoff: number; cutoffPeak: number };
  ostinato: { type: OscillatorType; filterHz: number };
  drum: { gain: number; metal: boolean };
};

export const COMBAT_MUSIC_PROFILES: Record<string, CombatMusicProfile> = {
  plains: {
    key: "plains",
    label: "Plaines (martial)",
    bpm: 92,
    bassPattern: [34, 34, 37, 34, 32, 32, 29, 32],
    hornPattern: [[46, 53, 58], [44, 51, 56], [41, 48, 53], [43, 50, 55]],
    ostinatoPattern: [58, null, 53, 56, 61, null, 56, 53, 56, null, 51, 55, 60, null, 55, 51],
    horn: { type: "sawtooth", cutoff: 460, cutoffPeak: 820 },
    ostinato: { type: "triangle", filterHz: 1450 },
    drum: { gain: 1, metal: true },
  },
  forest: {
    key: "forest",
    label: "Forêt (organique)",
    bpm: 88,
    bassPattern: [40, 36, 43, 38, 40, 36, 43, 38],
    hornPattern: [[52, 55, 59], [48, 55, 60], [50, 55, 59], [50, 54, 57]],
    ostinatoPattern: [59, null, 55, 52, 55, null, 59, 55, 60, null, 55, 52, 55, null, 52, 55],
    horn: { type: "triangle", cutoff: 600, cutoffPeak: 1100 },
    ostinato: { type: "triangle", filterHz: 1800 },
    drum: { gain: 0.7, metal: false },
  },
  sand: {
    key: "sand",
    label: "Désert (exotique)",
    bpm: 96,
    bassPattern: [40, 41, 38, 40, 40, 41, 38, 40],
    hornPattern: [[52, 56, 59], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
    ostinatoPattern: [59, null, 56, 57, 60, null, 57, 56, 53, null, 52, 56, 57, null, 56, 52],
    horn: { type: "sawtooth", cutoff: 520, cutoffPeak: 1000 },
    ostinato: { type: "sawtooth", filterHz: 1600 },
    drum: { gain: 0.85, metal: true },
  },
  frost: {
    key: "frost",
    label: "Neige & montagne (épique froid)",
    bpm: 80,
    bassPattern: [38, 34, 31, 33, 38, 34, 31, 33],
    hornPattern: [[50, 53, 57], [46, 53, 58], [50, 55, 58], [45, 52, 57]],
    ostinatoPattern: [57, null, null, 53, 58, null, null, 57, 55, null, null, 52, 57, null, null, 55],
    horn: { type: "sawtooth", cutoff: 400, cutoffPeak: 760 },
    ostinato: { type: "triangle", filterHz: 2000 },
    drum: { gain: 1.05, metal: false },
  },
  swamp: {
    key: "swamp",
    label: "Marais (trouble)",
    bpm: 76,
    bassPattern: [38, 39, 38, 34, 38, 39, 38, 34],
    hornPattern: [[50, 53, 57], [51, 55, 58], [50, 53, 57], [46, 53, 58]],
    ostinatoPattern: [57, null, 53, null, 58, null, 55, null, 57, null, 53, null, 55, null, 53, null],
    horn: { type: "sawtooth", cutoff: 360, cutoffPeak: 620 },
    ostinato: { type: "triangle", filterHz: 900 },
    drum: { gain: 0.8, metal: false },
  },
  volcano: {
    key: "volcano",
    label: "Lave (agressif)",
    bpm: 104,
    bassPattern: [36, 32, 31, 36, 36, 32, 31, 36],
    hornPattern: [[48, 51, 55], [44, 51, 56], [43, 50, 55], [48, 51, 55]],
    ostinatoPattern: [55, null, 51, 48, 55, null, 51, 55, 56, null, 51, 55, 55, null, 50, 55],
    horn: { type: "sawtooth", cutoff: 600, cutoffPeak: 1300 },
    ostinato: { type: "sawtooth", filterHz: 1500 },
    drum: { gain: 1.15, metal: true },
  },
  naval: {
    key: "naval",
    label: "Naval (roulis)",
    bpm: 90,
    bassPattern: [38, 36, 34, 33, 38, 36, 34, 33],
    hornPattern: [[50, 53, 57], [48, 55, 60], [46, 53, 58], [45, 52, 57]],
    ostinatoPattern: [57, null, 53, 57, 60, null, 57, 53, 58, null, 53, 58, 57, null, 52, 57],
    horn: { type: "triangle", cutoff: 500, cutoffPeak: 950 },
    ostinato: { type: "triangle", filterHz: 1600 },
    drum: { gain: 0.85, metal: false },
  },
  siege: {
    key: "siege",
    label: "Siège & ville (cérémonial)",
    bpm: 84,
    bassPattern: [43, 36, 38, 43, 43, 36, 38, 43],
    hornPattern: [[50, 55, 59], [48, 55, 60], [50, 54, 57], [50, 55, 59]],
    ostinatoPattern: [59, null, 55, 59, 62, null, 59, 55, 60, null, 55, 60, 59, null, 54, 59],
    horn: { type: "sawtooth", cutoff: 520, cutoffPeak: 1050 },
    ostinato: { type: "triangle", filterHz: 2200 },
    drum: { gain: 1.1, metal: true },
  },
};

const COMBAT_THEME_TO_PROFILE: Record<CombatEnvironmentTheme, string> = {
  grass: "plains",
  dirt: "plains",
  road: "plains",
  coast: "plains",
  forest: "forest",
  sand: "sand",
  snow: "frost",
  mountain: "frost",
  swamp: "swamp",
  lava: "volcano",
  water: "naval",
  settlement: "siege",
  building: "siege",
};

export const COMBAT_MUSIC_PROFILE_KEYS: readonly string[] = Object.keys(COMBAT_MUSIC_PROFILES);

export function getCombatMusicProfile(theme: CombatEnvironmentTheme | null | undefined): CombatMusicProfile {
  const key = theme ? COMBAT_THEME_TO_PROFILE[theme] : undefined;
  return COMBAT_MUSIC_PROFILES[key ?? "plains"] ?? COMBAT_MUSIC_PROFILES.plains;
}

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

function scheduleDrum(context: AudioContext, time: number, kind: "low" | "mid" | "metal", destination: AudioNode, drumGain: number) {
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
  gain.gain.linearRampToValueAtTime((kind === "low" ? 0.3 : kind === "mid" ? 0.12 : 0.075) * drumGain, time + 0.012);
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
    thump.gain.linearRampToValueAtTime(0.24 * drumGain, time + 0.008);
    thump.gain.exponentialRampToValueAtTime(0.0001, time + 0.48);
    oscillator.connect(thump);
    thump.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + 0.5);
  }
}

function scheduleBass(context: AudioContext, time: number, midi: number, destination: AudioNode, stepSeconds: number) {
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const stop = time + stepSeconds * 2.8;

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

function scheduleHorn(
  context: AudioContext,
  time: number,
  chord: readonly number[],
  destination: AudioNode,
  stepSeconds: number,
  timbre: CombatMusicProfile["horn"]
) {
  chord.forEach((midi, index) => {
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const stop = time + stepSeconds * 5.5;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(timbre.cutoff, time);
    filter.frequency.setTargetAtTime(timbre.cutoffPeak, time + 0.2, 0.8);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.03, time + 0.55 + index * 0.04);
    gain.gain.setTargetAtTime(0.0001, time + stepSeconds * 3.5, 0.9);

    // Root note plus an octave below: gives the war horns weight and a brassier
    // body than a single oscillator.
    const baseFrequency = midiToFrequency(midi);
    const fundamental = context.createOscillator();
    fundamental.type = timbre.type;
    fundamental.frequency.value = baseFrequency;
    fundamental.detune.value = index === 1 ? 4 : -3;
    fundamental.connect(filter);
    fundamental.start(time);
    fundamental.stop(stop);

    const sub = context.createOscillator();
    const subGain = context.createGain();
    sub.type = timbre.type;
    sub.frequency.value = baseFrequency / 2;
    sub.detune.value = 5;
    subGain.gain.value = 0.5;
    sub.connect(subGain);
    subGain.connect(filter);
    sub.start(time);
    sub.stop(stop);

    connectWithPan(filter, gain, [-0.2, 0, 0.24][index] ?? 0, destination);
  });
}

// Lead brass line over the battle groove: stacked saw + square through a bright
// lowpass with vibrato, for a cutting, heroic timbre.
function scheduleWarLead(context: AudioContext, time: number, midi: number, destination: AudioNode, stepSeconds: number) {
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const vibrato = context.createOscillator();
  const vibratoGain = context.createGain();
  const stop = time + stepSeconds * 1.9;
  const baseFrequency = midiToFrequency(midi);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(640, time);
  filter.frequency.setTargetAtTime(1100, time + 0.06, 0.4);
  filter.Q.value = 1.4;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(0.03, time + 0.04);
  gain.gain.setTargetAtTime(0.0001, time + stepSeconds * 1.2, 0.5);

  vibrato.type = "sine";
  vibrato.frequency.value = 5;
  vibratoGain.gain.value = 6;
  vibrato.connect(vibratoGain);

  // Per-oscillator level: the saw carries the body, the square only adds a touch
  // of bite. With the lead now in a low register, keep the square very quiet so
  // it stays warm/dark rather than buzzy.
  (["sawtooth", "square"] as const).forEach((type, layer) => {
    const oscillator = context.createOscillator();
    const oscGain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = baseFrequency;
    oscillator.detune.value = layer === 0 ? -4 : 4;
    oscGain.gain.value = layer === 0 ? 0.65 : 0.08;
    vibratoGain.connect(oscillator.detune);
    oscillator.connect(oscGain);
    oscGain.connect(filter);
    oscillator.start(time);
    oscillator.stop(stop);
  });

  connectWithPan(filter, gain, -0.06, destination);
  vibrato.start(time);
  vibrato.stop(stop);
}

function scheduleOstinato(
  context: AudioContext,
  time: number,
  midi: number,
  step: number,
  destination: AudioNode,
  timbre: CombatMusicProfile["ostinato"]
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const stop = time + 0.7;

  oscillator.type = timbre.type;
  oscillator.frequency.value = midiToFrequency(midi);
  filter.type = "bandpass";
  filter.frequency.value = timbre.filterHz;
  filter.Q.value = 3.4;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(step % 8 === 0 ? 0.07 : 0.045, time + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  oscillator.connect(filter);
  connectWithPan(filter, gain, Math.sin(step * 0.9) * 0.3, destination);
  oscillator.start(time);
  oscillator.stop(stop);
}

function scheduleStep(
  context: AudioContext,
  step: number,
  time: number,
  destination: AudioNode,
  profile: CombatMusicProfile,
  stepSeconds: number
) {
  const phraseStep = step % 32;
  const { bassPattern, hornPattern, ostinatoPattern, drum } = profile;
  const ostinatoNote = ostinatoPattern[step % ostinatoPattern.length];

  if (phraseStep % 4 === 0) scheduleBass(context, time, bassPattern[Math.floor(phraseStep / 4) % bassPattern.length], destination, stepSeconds);
  if (phraseStep === 0 || phraseStep === 16) scheduleHorn(context, time, hornPattern[Math.floor(phraseStep / 8) % hornPattern.length], destination, stepSeconds, profile.horn);
  if (phraseStep % 4 === 0 || phraseStep === 10 || phraseStep === 22) scheduleDrum(context, time, "low", destination, drum.gain);
  if (phraseStep === 6 || phraseStep === 14 || phraseStep === 24 || phraseStep === 30) scheduleDrum(context, time, "mid", destination, drum.gain);
  if (drum.metal && (phraseStep === 7 || phraseStep === 15 || phraseStep === 23 || phraseStep === 31)) scheduleDrum(context, time, "metal", destination, drum.gain);
  if (ostinatoNote !== null) scheduleOstinato(context, time, ostinatoNote, phraseStep, destination, profile.ostinato);

  // Brass lead enters on every other 32-step phrase so the theme builds and
  // releases. It tracks the current horn chord (one octave up) to stay in key.
  if (Math.floor(step / 32) % 2 === 1) {
    const leadIndex = WAR_LEAD_PATTERN[phraseStep];
    if (leadIndex !== null) {
      const hornChord = hornPattern[Math.floor(phraseStep / 8) % hornPattern.length];
      // Lead sits in the horn register (no octave lift) for a darker, graver
      // voice that doesn't pierce over the groove.
      scheduleWarLead(context, time, hornChord[leadIndex], destination, stepSeconds);
    }
  }
}

export function createCombatMusicEngine(profile: CombatMusicProfile, initialVolume: number): CombatMusicEngine {
  const stepSeconds = 60 / profile.bpm / 2;
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
      scheduleStep(context, stepIndex, nextStepTime, voiceBus, profile, stepSeconds);
      window.setTimeout(() => voiceBus.disconnect(), 5000);
      nextStepTime += stepSeconds;
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
