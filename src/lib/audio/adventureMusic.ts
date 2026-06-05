import { clampMusicVolume } from "@/lib/audio/musicPreferences";
import { Faction } from "@/lib/game/types";

// Procedural adventure-music engine. The composition is generated with the Web
// Audio API (no audio files) and driven by a per-faction `AdventureMusicProfile`
// describing the key/mode, tempo and instrument timbres. Melodic voices
// (arpeggio, lead, bells) read their notes out of the *current* chord so they
// can never clash with the harmony — only the chords/tempo/timbre change between
// factions, which is what gives each one its own identity.

const LOOKAHEAD_SECONDS = 2.2;

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export type AdventureMusicEngine = {
  start: () => Promise<void>;
  stop: () => void;
  setVolume: (volume: number) => void;
  setSuppressed: (suppressed: boolean) => void;
};

export type AdventureMusicProfile = {
  /** Faction this profile belongs to (or "default" for the menu/fallback bed). */
  faction: Faction | "default";
  /** Short French mood label, surfaced in the /dev/sound tester. */
  label: string;
  bpm: number;
  /** Four-note chord voicings (MIDI). The progression loops via modulo. */
  chords: readonly (readonly number[])[];
  /** One bass root per chord (MIDI), aligned with `chords`. */
  bassPattern: readonly number[];
  pad: { types: readonly [OscillatorType, OscillatorType]; cutoff: number; cutoffPeak: number };
  pluck: { type: OscillatorType; cutoff: number };
  lead: { type: OscillatorType; gain: number; cutoff: number; cutoffPeak: number; vibratoRate: number };
  bell: boolean;
  /** Reverb (convolver) wet level, 0..1. */
  reverbWet: number;
  /** Tempo-synced delay feedback, 0..1. */
  delayFeedback: number;
  /** Arpeggio rhythm (indices into the chord, null = rest). Defaults to the busy day pattern. */
  arpPattern?: readonly (number | null)[];
  /** Lead melody rhythm (indices into the chord). Defaults to the day pattern. */
  leadPattern?: readonly (number | null)[];
  /** When true the lead plays on every cycle (used by the sparse night theme). */
  leadEveryCycle?: boolean;
};

// Day arpeggio/lead: busy, flowing — the signature of the active-turn theme.
// Sequences of *indices* into the active chord voicing (null = rest).
const DAY_ARP_PATTERN = [0, 2, 1, 3, 2, null, 3, 1, 0, 2, 1, 3, 2, null, 1, 2] as const;
const DAY_LEAD_PATTERN = [
  null, null, 3, null, 2, null, 3, 2,
  null, null, 1, null, 3, null, null, null,
  null, null, 2, null, 3, null, 2, 1,
  null, null, 3, null, 2, null, null, null,
] as const;

// Night arpeggio/lead: sparse and ambient — bell-like droplets and a slow, spare
// melody, a deliberately different texture from the day theme (not a slowdown).
const NIGHT_ARP_PATTERN = [
  3, null, null, null, null, null, 2, null, null, null, null, null, 3, null, null, null,
  null, null, 2, null, null, null, null, null, 3, null, null, null, null, null, 2, null,
] as const;
const NIGHT_LEAD_PATTERN = [
  null, null, null, 2, null, null, null, null, null, null, 3, null, null, null, null, null,
  null, null, null, 1, null, null, null, null, null, null, 2, null, null, null, null, null,
] as const;

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
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

export function createAdventureMusicEngine(
  profile: AdventureMusicProfile,
  initialVolume: number
): AdventureMusicEngine {
  const stepSeconds = 60 / profile.bpm / 2;

  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let dry: GainNode | null = null;
  let wet: GainNode | null = null;
  let delay: DelayNode | null = null;
  let intervalId = 0;
  let stepIndex = 0;
  let nextStepTime = 0;
  let volume = clampMusicVolume(initialVolume);
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
      const filter = targetContext.createBiquadFilter();
      const gain = targetContext.createGain();
      const pan = targetContext.createStereoPanner();
      const start = time + index * 0.03;
      const stop = time + stepSeconds * 10;

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(profile.pad.cutoff, start);
      filter.frequency.setTargetAtTime(profile.pad.cutoffPeak, start + 0.5, 1.4);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.034, start + 1.25);
      gain.gain.setTargetAtTime(0.0001, start + stepSeconds * 6.6, 1.4);
      pan.pan.value = [-0.34, -0.12, 0.15, 0.32][index] ?? 0;

      // Two slightly detuned oscillators per note give the pad a warm, chorused
      // body instead of a single sterile tone.
      const baseFrequency = midiToFrequency(note);
      [-6, 6].forEach((detune, layer) => {
        const oscillator = targetContext.createOscillator();
        oscillator.type = profile.pad.types[(index + layer) % 2];
        oscillator.frequency.value = baseFrequency;
        oscillator.detune.value = detune;
        oscillator.connect(filter);
        oscillator.start(start);
        oscillator.stop(stop);
      });

      filter.connect(gain);
      gain.connect(pan);
      connectVoice(pan, 0.12);
    });
  };

  const schedulePluck = (targetContext: AudioContext, time: number, midi: number, step: number) => {
    const oscillator = targetContext.createOscillator();
    const filter = targetContext.createBiquadFilter();
    const gain = targetContext.createGain();
    const pan = targetContext.createStereoPanner();
    const stop = time + 1.35;

    oscillator.type = profile.pluck.type;
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), time);
    oscillator.detune.setValueAtTime(step % 8 === 0 ? -5 : 4, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(profile.pluck.cutoff, time);
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

    // Soft sine an octave below thickens the pluck without muddying the mix.
    const sub = targetContext.createOscillator();
    const subGain = targetContext.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(midiToFrequency(midi - 12), time);
    subGain.gain.setValueAtTime(0.0001, time);
    subGain.gain.linearRampToValueAtTime(step % 8 === 0 ? 0.05 : 0.032, time + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
    sub.connect(subGain);
    subGain.connect(pan);
    sub.start(time);
    sub.stop(time + 0.9);
  };

  // Expressive lead voice with gentle vibrato, sitting above the arpeggio. Used
  // sparingly to carry a melodic line. Timbre/level come from the profile.
  const scheduleLead = (targetContext: AudioContext, time: number, midi: number) => {
    const oscillator = targetContext.createOscillator();
    const filter = targetContext.createBiquadFilter();
    const gain = targetContext.createGain();
    const pan = targetContext.createStereoPanner();
    const vibrato = targetContext.createOscillator();
    const vibratoGain = targetContext.createGain();
    const stop = time + stepSeconds * 3.4;

    oscillator.type = profile.lead.type;
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), time);
    vibrato.type = "sine";
    vibrato.frequency.value = profile.lead.vibratoRate;
    vibratoGain.gain.value = 6;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(oscillator.detune);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(profile.lead.cutoff, time);
    filter.frequency.setTargetAtTime(profile.lead.cutoffPeak, time + 0.08, 0.5);
    filter.Q.value = 2;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(profile.lead.gain, time + 0.07);
    gain.gain.setTargetAtTime(0.0001, time + stepSeconds * 1.8, 0.7);
    pan.pan.value = -0.08;

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    connectVoice(pan, 0.4);
    oscillator.start(time);
    oscillator.stop(stop);
    vibrato.start(time);
    vibrato.stop(stop);
  };

  const scheduleBass = (targetContext: AudioContext, time: number, midi: number) => {
    const oscillator = targetContext.createOscillator();
    const filter = targetContext.createBiquadFilter();
    const gain = targetContext.createGain();
    const stop = time + stepSeconds * 5.5;

    oscillator.type = "sine";
    oscillator.frequency.value = midiToFrequency(midi);
    filter.type = "lowpass";
    filter.frequency.value = 240;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.08, time + 0.08);
    gain.gain.setTargetAtTime(0.0001, time + stepSeconds * 3.2, 0.62);

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
    const stop = time + stepSeconds * 7.5;

    source.buffer = createNoiseBuffer(targetContext, stepSeconds * 7.5);
    filter.type = "bandpass";
    filter.frequency.value = 760;
    filter.Q.value = 0.35;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.018, time + 1.2);
    gain.gain.setTargetAtTime(0.0001, time + stepSeconds * 4.7, 1.1);

    source.connect(filter);
    filter.connect(gain);
    connectVoice(gain, 0.18);
    source.start(time);
    source.stop(stop);
  };

  const scheduleStep = (targetContext: AudioContext, step: number, time: number) => {
    const patternStep = step % 32;
    // Chord/bass advance every 8 steps and walk the full progression using the
    // absolute step. Every other voice reads notes out of this chord, which is
    // what keeps the texture consonant.
    const harmonyIndex = Math.floor(step / 8);
    const chord = profile.chords[harmonyIndex % profile.chords.length];

    if (step % 8 === 0) {
      schedulePad(targetContext, time, chord);
      scheduleBass(targetContext, time, profile.bassPattern[harmonyIndex % profile.bassPattern.length]);
    }

    // Arpeggio: roll through the current chord's tones, an octave up.
    const arpPattern = profile.arpPattern ?? DAY_ARP_PATTERN;
    const arpStep = step % arpPattern.length;
    const arpIndex = arpPattern[arpStep];
    if (arpIndex !== null) {
      schedulePluck(targetContext, time, chord[arpIndex] + 12, arpStep);
    }

    // Lead melody. The day theme alternates cycles (texture opens/settles); the
    // sparse night theme plays every cycle. Notes are chord tones an octave up.
    const leadPattern = profile.leadPattern ?? DAY_LEAD_PATTERN;
    if (profile.leadEveryCycle || Math.floor(step / 32) % 2 === 1) {
      const leadIndex = leadPattern[patternStep];
      if (leadIndex !== null) {
        scheduleLead(targetContext, time, chord[leadIndex] + 12);
      }
    }

    // Bells ring the top of the chord, two octaves up, for a soft shimmer.
    if (profile.bell && (patternStep === 14 || patternStep === 30)) {
      scheduleBell(targetContext, time + stepSeconds * 0.35, chord[patternStep === 14 ? 3 : 2] + 24);
    }

    if (patternStep === 4 || patternStep === 20) {
      scheduleBreath(targetContext, time);
    }
  };

  const scheduler = () => {
    if (!context) return;

    while (nextStepTime < context.currentTime + LOOKAHEAD_SECONDS) {
      scheduleStep(context, stepIndex, nextStepTime);
      nextStepTime += stepSeconds;
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
    dry.gain.value = 1 - profile.reverbWet;
    wet.gain.value = profile.reverbWet;
    delay.delayTime.value = stepSeconds * 3;
    feedback.gain.value = profile.delayFeedback;
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
      volume = clampMusicVolume(nextVolume);
      if (context) setMasterVolume(context);
    },
    setSuppressed: (nextSuppressed: boolean) => {
      suppressed = nextSuppressed;
      if (context) setMasterVolume(context, 0.24);
    },
  };
}

// Per-faction musical identities. Melodic voices are chord-tone-derived, so only
// the harmony/tempo/timbre differ here — that is enough to make each faction's
// adventure theme recognisable.
const ADVENTURE_MUSIC_PROFILES: Record<Faction | "default", AdventureMusicProfile> = {
  default: {
    faction: "default",
    label: "Thème neutre",
    bpm: 74,
    chords: [[50, 53, 57, 62], [46, 53, 58, 62], [53, 57, 60, 65], [48, 55, 60, 64]],
    bassPattern: [38, 34, 41, 36],
    pad: { types: ["sine", "triangle"], cutoff: 520, cutoffPeak: 920 },
    pluck: { type: "triangle", cutoff: 3100 },
    lead: { type: "sawtooth", gain: 0.027, cutoff: 1300, cutoffPeak: 2200, vibratoRate: 5.2 },
    bell: true,
    reverbWet: 0.28,
    delayFeedback: 0.23,
  },
  [Faction.CASTLE]: {
    faction: Faction.CASTLE,
    label: "Noble & héroïque (Couronnes d'Acier)",
    bpm: 76,
    chords: [[50, 53, 57, 62], [50, 55, 59, 62], [48, 55, 60, 64], [53, 57, 60, 65]],
    bassPattern: [38, 43, 36, 41],
    pad: { types: ["sine", "triangle"], cutoff: 560, cutoffPeak: 980 },
    pluck: { type: "triangle", cutoff: 3200 },
    lead: { type: "sawtooth", gain: 0.027, cutoff: 1300, cutoffPeak: 2200, vibratoRate: 5.2 },
    bell: true,
    reverbWet: 0.28,
    delayFeedback: 0.23,
  },
  [Faction.RAMPART]: {
    faction: Faction.RAMPART,
    label: "Pastoral & boisé (Pacte des Sylves)",
    bpm: 72,
    chords: [[50, 55, 59, 62], [52, 55, 59, 64], [48, 55, 60, 64], [50, 54, 57, 62]],
    bassPattern: [43, 40, 36, 38],
    pad: { types: ["sine", "triangle"], cutoff: 520, cutoffPeak: 900 },
    pluck: { type: "triangle", cutoff: 2800 },
    lead: { type: "triangle", gain: 0.034, cutoff: 1200, cutoffPeak: 2200, vibratoRate: 4.8 },
    bell: true,
    reverbWet: 0.34,
    delayFeedback: 0.26,
  },
  [Faction.TOWER]: {
    faction: Faction.TOWER,
    label: "Cristallin & arcanique (Cercle d'Azur)",
    bpm: 70,
    chords: [[45, 52, 57, 60], [48, 55, 60, 64], [50, 55, 59, 62], [52, 55, 59, 64]],
    bassPattern: [45, 48, 43, 40],
    pad: { types: ["sine", "sine"], cutoff: 700, cutoffPeak: 1200 },
    pluck: { type: "triangle", cutoff: 3600 },
    lead: { type: "triangle", gain: 0.03, cutoff: 1600, cutoffPeak: 2800, vibratoRate: 5.6 },
    bell: true,
    reverbWet: 0.4,
    delayFeedback: 0.3,
  },
  [Faction.INFERNO]: {
    faction: Faction.INFERNO,
    label: "Sombre & menaçant (Braises Profanes)",
    bpm: 66,
    chords: [[47, 52, 55, 59], [41, 48, 53, 57], [50, 53, 57, 62], [48, 55, 60, 64]],
    bassPattern: [40, 41, 38, 36],
    pad: { types: ["triangle", "sawtooth"], cutoff: 380, cutoffPeak: 640 },
    pluck: { type: "sawtooth", cutoff: 2200 },
    lead: { type: "sawtooth", gain: 0.028, cutoff: 1000, cutoffPeak: 1700, vibratoRate: 5 },
    bell: false,
    reverbWet: 0.22,
    delayFeedback: 0.2,
  },
  [Faction.NECROPOLIS]: {
    faction: Faction.NECROPOLIS,
    label: "Glacial & funèbre (Voile d'Os)",
    bpm: 60,
    chords: [[50, 53, 57, 62], [51, 55, 58, 63], [46, 53, 58, 62], [50, 55, 58, 62]],
    bassPattern: [38, 39, 34, 43],
    pad: { types: ["sine", "triangle"], cutoff: 440, cutoffPeak: 700 },
    pluck: { type: "sine", cutoff: 2400 },
    lead: { type: "sine", gain: 0.03, cutoff: 1000, cutoffPeak: 1700, vibratoRate: 4.4 },
    bell: true,
    reverbWet: 0.46,
    delayFeedback: 0.34,
  },
  [Faction.DUNGEON]: {
    faction: Faction.DUNGEON,
    label: "Lugubre & souterrain (Royaume Sous-Roche)",
    bpm: 64,
    chords: [[45, 52, 57, 60], [46, 53, 58, 62], [53, 57, 60, 65], [50, 53, 57, 62]],
    bassPattern: [45, 46, 41, 38],
    pad: { types: ["triangle", "sawtooth"], cutoff: 400, cutoffPeak: 680 },
    pluck: { type: "sawtooth", cutoff: 2000 },
    lead: { type: "sawtooth", gain: 0.026, cutoff: 950, cutoffPeak: 1600, vibratoRate: 4.6 },
    bell: false,
    reverbWet: 0.3,
    delayFeedback: 0.26,
  },
  [Faction.STRONGHOLD]: {
    faction: Faction.STRONGHOLD,
    label: "Primal & martial (Marteaux Rouges)",
    bpm: 82,
    chords: [[52, 55, 59, 64], [50, 55, 59, 62], [50, 54, 57, 62], [45, 52, 57, 61]],
    bassPattern: [40, 43, 38, 45],
    pad: { types: ["sawtooth", "triangle"], cutoff: 600, cutoffPeak: 1000 },
    pluck: { type: "sawtooth", cutoff: 3000 },
    lead: { type: "sawtooth", gain: 0.028, cutoff: 1250, cutoffPeak: 2100, vibratoRate: 5.4 },
    bell: false,
    reverbWet: 0.18,
    delayFeedback: 0.16,
  },
  [Faction.FORTRESS]: {
    faction: Faction.FORTRESS,
    label: "Marécageux & modal (Serments du Marais)",
    bpm: 68,
    chords: [[52, 55, 59, 64], [45, 49, 52, 57], [50, 54, 57, 62], [50, 55, 59, 62]],
    bassPattern: [40, 45, 38, 43],
    pad: { types: ["triangle", "sine"], cutoff: 460, cutoffPeak: 780 },
    pluck: { type: "triangle", cutoff: 2400 },
    lead: { type: "triangle", gain: 0.034, cutoff: 1100, cutoffPeak: 1900, vibratoRate: 4.6 },
    bell: false,
    reverbWet: 0.36,
    delayFeedback: 0.3,
  },
  [Faction.CONFLUX]: {
    faction: Faction.CONFLUX,
    label: "Éthéré & lumineux (Orbe Primordial)",
    bpm: 74,
    chords: [[48, 55, 60, 64], [50, 54, 57, 62], [52, 55, 59, 64], [50, 55, 59, 62]],
    bassPattern: [36, 38, 40, 43],
    pad: { types: ["sine", "sine"], cutoff: 760, cutoffPeak: 1300 },
    pluck: { type: "sine", cutoff: 3800 },
    lead: { type: "sine", gain: 0.03, cutoff: 1700, cutoffPeak: 3000, vibratoRate: 5.8 },
    bell: true,
    reverbWet: 0.42,
    delayFeedback: 0.32,
  },
};

export function getAdventureMusicProfile(faction: Faction | null | undefined): AdventureMusicProfile {
  if (faction && ADVENTURE_MUSIC_PROFILES[faction]) return ADVENTURE_MUSIC_PROFILES[faction];
  return ADVENTURE_MUSIC_PROFILES.default;
}

/**
 * Night theme played while the player waits for the others after ending their
 * turn. This is a genuinely different, ambient nocturne — NOT the day theme
 * slowed down: a slow two-chord oscillation, the busy arpeggio replaced by
 * sparse bell droplets, and a spare slow melody. It keeps the faction's own key
 * and timbre (drawn from the day profile) so each faction's night still sounds
 * like that faction.
 */
export function getAdventureNightProfile(faction: Faction | null | undefined): AdventureMusicProfile {
  const base = getAdventureMusicProfile(faction);
  // Slow oscillation between the tonic and a contrasting chord of the faction's
  // own progression — a different harmonic motion from the day's 4-chord cycle.
  const chordA = base.chords[0];
  const chordB = base.chords[2 % base.chords.length];
  const bassA = base.bassPattern[0];
  const bassB = base.bassPattern[2 % base.bassPattern.length];
  return {
    ...base,
    label: `${base.label} — nuit`,
    bpm: Math.round(base.bpm * 0.82),
    chords: [chordA, chordB],
    bassPattern: [bassA, bassB],
    pad: {
      types: ["sine", base.pad.types[1]],
      cutoff: Math.round(base.pad.cutoff * 0.6),
      cutoffPeak: Math.round(base.pad.cutoffPeak * 0.65),
    },
    // Pluck is reused only for the sparse bell-droplet arpeggio, softened.
    pluck: { type: "sine", cutoff: Math.round(base.pluck.cutoff * 0.7) },
    lead: {
      type: "sine",
      gain: base.lead.gain * 0.7,
      cutoff: Math.round(base.lead.cutoff * 0.7),
      cutoffPeak: Math.round(base.lead.cutoffPeak * 0.7),
      vibratoRate: base.lead.vibratoRate * 0.7,
    },
    bell: true,
    reverbWet: Math.min(0.6, base.reverbWet + 0.16),
    delayFeedback: Math.min(0.5, base.delayFeedback + 0.08),
    arpPattern: NIGHT_ARP_PATTERN,
    leadPattern: NIGHT_LEAD_PATTERN,
    leadEveryCycle: true,
  };
}

export const ADVENTURE_MUSIC_FACTIONS: readonly (Faction | "default")[] = [
  "default",
  ...Object.values(Faction),
];
