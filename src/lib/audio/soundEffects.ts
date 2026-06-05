import { getSavedAudioMuted, getSavedEffectsVolume } from "@/lib/audio/musicPreferences";
import { AdventureBuildingType } from "@/lib/game/types";

// One-shot game-event sound effects, synthesized with the Web Audio API (no
// audio files), following the same conventions as `playCombatDamageHit` in
// combatAudio.ts: a lazily-created shared AudioContext, gated by the saved mute
// state and "Effects" volume, with every error swallowed so audio can never
// crash the game.
//
// A shared convolution reverb gives every effect a spacious, cinematic tail so
// the SFX read as "heroic fantasy" rather than dry beeps. Metallic/brass timbres
// use inharmonic partials and octave-stacked saws for character.
//
// Each `playX(volume?)` accepts an optional explicit volume. When omitted the
// saved effects volume is used and the mute state is respected (in-game
// behaviour). When provided (e.g. the /dev/sound tester) the mute state is
// ignored so the effect always plays for auditioning.

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedContext: AudioContext | null = null;
let sharedOutput: GainNode | null = null;
let sharedReverb: ConvolverNode | null = null;

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
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
  sharedReverb = null;
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

function createImpulseResponse(context: AudioContext) {
  // Smooth exponential-decay noise tail — a generic hall reverb.
  const duration = 1.8;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      data[index] = (Math.random() * 2 - 1) * (1 - progress) ** 2.4 * 0.5;
    }
  }

  return impulse;
}

/** Shared convolver input node; the wet signal is mixed back to the output once. */
function getReverbInput(context: AudioContext) {
  if (!sharedReverb) {
    sharedReverb = context.createConvolver();
    sharedReverb.buffer = createImpulseResponse(context);
    const wet = context.createGain();
    wet.gain.value = 0.9;
    sharedReverb.connect(wet);
    wet.connect(getOutput(context));
  }
  return sharedReverb;
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

/**
 * Resolves the effective gain for an effect. Returns null when nothing should
 * play (muted with no explicit override, or volume at zero).
 */
function resolveVolume(volume: number | undefined): number | null {
  if (volume === undefined && getSavedAudioMuted()) return null;
  const vol = volume ?? getSavedEffectsVolume();
  if (vol <= 0) return null;
  return Math.max(0, Math.min(1, vol));
}

/**
 * Runs `build` against the shared context on an isolated bus. The bus feeds the
 * dry output plus a reverb send (proportional to `reverbSend`), and is
 * auto-disconnected after `lifetimeMs`; the reverb tail rings out on its own.
 */
function withEffectBus(
  volume: number | undefined,
  busGain: number,
  reverbSend: number,
  lifetimeMs: number,
  build: (context: AudioContext, bus: GainNode, now: number) => void
) {
  const vol = resolveVolume(volume);
  if (vol === null) return;

  try {
    const context = getAudioContext();
    void context.resume();

    const now = context.currentTime;
    const bus = context.createGain();
    bus.gain.value = busGain * vol;
    bus.connect(getOutput(context));

    if (reverbSend > 0) {
      const send = context.createGain();
      send.gain.value = reverbSend;
      bus.connect(send);
      send.connect(getReverbInput(context));
    }

    build(context, bus, now);

    window.setTimeout(() => bus.disconnect(), lifetimeMs);
  } catch {
    // Audio must never crash the game.
  }
}

/** Plucked tone with a configurable waveform and exponential decay. */
function scheduleTone(
  context: AudioContext,
  bus: GainNode,
  options: {
    type: OscillatorType;
    midi: number;
    start: number;
    duration: number;
    gain: number;
    attack?: number;
    pan?: number;
    detune?: number;
    filterHz?: number;
  }
) {
  const { type, midi, start, duration, gain, attack = 0.008, pan = 0, detune = 0, filterHz } = options;
  const oscillator = context.createOscillator();
  const amp = context.createGain();
  const stop = start + duration;

  oscillator.type = type;
  oscillator.frequency.value = midiToFrequency(midi);
  oscillator.detune.value = detune;

  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, stop);

  let tail: AudioNode = amp;
  if (filterHz) {
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterHz;
    amp.connect(filter);
    tail = filter;
  }

  const panner = context.createStereoPanner();
  panner.pan.value = pan;
  oscillator.connect(amp);
  tail.connect(panner);
  panner.connect(bus);
  oscillator.start(start);
  oscillator.stop(stop + 0.02);
}

/**
 * A metallic "clink" built from inharmonic partials plus a bright transient —
 * the building block of coin/treasure sounds.
 */
function scheduleClink(
  context: AudioContext,
  bus: GainNode,
  options: { start: number; baseFreq: number; gain: number; pan?: number }
) {
  const { start, baseFreq, gain, pan = 0 } = options;
  const panner = context.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(bus);

  // Inharmonic ratios give the bell-like, metallic ring of struck metal. The
  // highest partial is kept low so coins ring warm rather than piercing.
  const partials: Array<[number, number, number]> = [
    [1, gain, 0.18],
    [2.76, gain * 0.38, 0.1],
    [5.4, gain * 0.12, 0.05],
  ];
  for (const [ratio, peak, decay] of partials) {
    const oscillator = context.createOscillator();
    const amp = context.createGain();
    const stop = start + decay;
    oscillator.type = ratio === 1 ? "triangle" : "sine";
    oscillator.frequency.value = baseFreq * ratio;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(peak, start + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, stop);
    oscillator.connect(amp);
    amp.connect(panner);
    oscillator.start(start);
    oscillator.stop(stop + 0.02);
  }

  // Tiny transient = the initial "tick" of the strike (kept fairly soft/dark).
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const noiseAmp = context.createGain();
  noise.buffer = createNoiseBuffer(context, 0.03);
  filter.type = "bandpass";
  filter.frequency.value = Math.max(2200, baseFreq * 1.4);
  filter.Q.value = 0.8;
  noiseAmp.gain.setValueAtTime(gain * 0.28, start);
  noiseAmp.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);
  noise.connect(filter);
  filter.connect(noiseAmp);
  noiseAmp.connect(panner);
  noise.start(start);
  noise.stop(start + 0.05);
}

/** Short filtered noise burst (impacts, rolls, breaths). */
function scheduleNoise(
  context: AudioContext,
  bus: GainNode,
  options: {
    start: number;
    duration: number;
    gain: number;
    type: BiquadFilterType;
    filterHz: number;
    q?: number;
    pan?: number;
  }
) {
  const { start, duration, gain, type, filterHz, q = 1, pan = 0 } = options;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const amp = context.createGain();
  const panner = context.createStereoPanner();
  const stop = start + duration;

  source.buffer = createNoiseBuffer(context, duration);
  filter.type = type;
  filter.frequency.value = filterHz;
  filter.Q.value = q;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, stop);
  panner.pan.value = pan;

  source.connect(filter);
  filter.connect(amp);
  amp.connect(panner);
  panner.connect(bus);
  source.start(start);
  source.stop(stop + 0.02);
}

// --- Public effects --------------------------------------------------------

/** A bright cascade of metallic coins for gold; a leather/wood pouch for the rest. */
export function playResourcePickup(resource: string, volume?: number) {
  const isGold = resource === "gold";
  withEffectBus(volume, 0.6, isGold ? 0.22 : 0.16, 900, (context, bus, now) => {
    if (isGold) {
      // Rising triple coin clink (A5 → E6 → A6) + a soft shimmer tail. An octave
      // lower than a typical coin ping so it reads warm, not piercing.
      scheduleClink(context, bus, { start: now, baseFreq: 880, gain: 0.24, pan: -0.16 });
      scheduleClink(context, bus, { start: now + 0.075, baseFreq: 1318, gain: 0.22, pan: 0.18 });
      scheduleClink(context, bus, { start: now + 0.155, baseFreq: 1760, gain: 0.14, pan: -0.05 });
      scheduleTone(context, bus, { type: "sine", midi: 88, start: now + 0.12, duration: 0.5, gain: 0.05, pan: 0.2 });
    } else {
      // Pouch drop: a soft low thump, a muffled sack rustle, and one metallic accent.
      scheduleTone(context, bus, { type: "sine", midi: 46, start: now, duration: 0.2, gain: 0.2, filterHz: 700 });
      scheduleNoise(context, bus, { start: now, duration: 0.14, gain: 0.05, type: "lowpass", filterHz: 520, pan: 0.05 });
      scheduleClink(context, bus, { start: now + 0.06, baseFreq: 1175, gain: 0.12, pan: -0.1 });
      scheduleTone(context, bus, { type: "triangle", midi: 76, start: now + 0.1, duration: 0.34, gain: 0.08, pan: 0.12, filterHz: 4200 });
    }
  });
}

/** Magical ascending arpeggio with a sparkle — treasure / adventure reward. */
export function playTreasureReward(volume?: number) {
  withEffectBus(volume, 0.55, 0.32, 1600, (context, bus, now) => {
    const arpeggio = [72, 76, 79, 84, 88]; // C E G C E
    arpeggio.forEach((midi, index) => {
      scheduleTone(context, bus, {
        type: "triangle",
        midi,
        start: now + index * 0.07,
        duration: 0.55,
        gain: index === arpeggio.length - 1 ? 0.2 : 0.16,
        pan: Math.sin(index * 0.9) * 0.32,
        filterHz: 6000,
      });
    });
    // Bell-like top sparkle and a couple of coin clinks (kept in a warm register).
    scheduleClink(context, bus, { start: now + 0.3, baseFreq: 1568, gain: 0.12, pan: 0.2 });
    scheduleClink(context, bus, { start: now + 0.42, baseFreq: 2093, gain: 0.1, pan: -0.18 });
    scheduleTone(context, bus, { type: "sine", midi: 88, start: now + 0.34, duration: 0.7, gain: 0.07, pan: 0.1 });
  });
}

/** Short rising brass fanfare — capturing a mine, town or gate. */
export function playCaptureFlourish(volume?: number) {
  withEffectBus(volume, 0.55, 0.32, 1300, (context, bus, now) => {
    const fanfare = [62, 67, 71, 74]; // D G B D
    fanfare.forEach((midi, index) => {
      [0, -12].forEach((octave, layer) => {
        scheduleTone(context, bus, {
          type: layer === 0 ? "sawtooth" : "triangle",
          midi: midi + octave,
          start: now + index * 0.09,
          duration: 0.6,
          gain: layer === 0 ? 0.12 : 0.07,
          attack: 0.02,
          pan: layer === 0 ? 0.08 : -0.08,
          filterHz: 3400,
        });
      });
    });
    // A timpani thump under the flourish for weight.
    scheduleTone(context, bus, { type: "sine", midi: 38, start: now, duration: 0.4, gain: 0.16, attack: 0.005 });
    scheduleNoise(context, bus, { start: now, duration: 0.4, gain: 0.05, type: "lowpass", filterHz: 180 });
  });
}

/** War horn plus a drum roll — the battle screen appears before combat. */
export function playBattleStart(volume?: number) {
  withEffectBus(volume, 0.6, 0.26, 1800, (context, bus, now) => {
    // Low war horn swell (root + fifth + octave), saw through an opening filter.
    [41, 48, 53].forEach((midi, index) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const amp = context.createGain();
      const stop = now + 1.15;
      oscillator.type = "sawtooth";
      oscillator.frequency.value = midiToFrequency(midi);
      oscillator.detune.value = index === 0 ? -4 : index === 1 ? 4 : -2;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(320, now);
      filter.frequency.setTargetAtTime(950, now + 0.15, 0.5);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.linearRampToValueAtTime(index === 2 ? 0.08 : 0.15, now + 0.2);
      amp.gain.setTargetAtTime(0.0001, now + 0.7, 0.42);
      oscillator.connect(filter);
      filter.connect(amp);
      amp.connect(bus);
      oscillator.start(now);
      oscillator.stop(stop);
    });
    // Accelerating drum roll into a final hit.
    for (let index = 0; index < 8; index += 1) {
      const t = now + 0.1 + index * (0.12 - index * 0.008);
      scheduleNoise(context, bus, { start: t, duration: 0.1, gain: 0.07 + index * 0.01, type: "lowpass", filterHz: 220, pan: index % 2 === 0 ? -0.1 : 0.1 });
    }
    scheduleNoise(context, bus, { start: now + 0.95, duration: 0.45, gain: 0.24, type: "lowpass", filterHz: 160 });
    scheduleTone(context, bus, { type: "sine", midi: 31, start: now + 0.95, duration: 0.5, gain: 0.22 });
  });
}

/** Triumphant major brass fanfare — combat or game victory. */
export function playVictoryFanfare(volume?: number) {
  withEffectBus(volume, 0.6, 0.34, 2600, (context, bus, now) => {
    // Rhythmic heroic call.
    const call: Array<[number, number]> = [
      [67, 0], [67, 0.16], [67, 0.32], [72, 0.52], [76, 0.86],
    ];
    call.forEach(([midi, offset]) => {
      [0, -12, 7].forEach((interval, layer) => {
        scheduleTone(context, bus, {
          type: layer === 1 ? "triangle" : "sawtooth",
          midi: midi + interval,
          start: now + offset,
          duration: midi === 76 ? 1.2 : 0.34,
          gain: layer === 0 ? 0.12 : layer === 1 ? 0.06 : 0.05,
          attack: 0.02,
          pan: layer === 0 ? 0.06 : layer === 1 ? -0.06 : 0.16,
          filterHz: 3800,
        });
      });
    });
    // Sustained major chord underneath the final note (C E G C).
    [60, 64, 67, 72].forEach((midi, index) => {
      scheduleTone(context, bus, {
        type: "triangle",
        midi,
        start: now + 0.86,
        duration: 1.4,
        gain: 0.07,
        attack: 0.05,
        pan: [-0.3, -0.1, 0.12, 0.3][index] ?? 0,
        filterHz: 4200,
      });
    });
    // Timpani roll into the resolution.
    scheduleTone(context, bus, { type: "sine", midi: 36, start: now + 0.86, duration: 0.5, gain: 0.16 });
    scheduleNoise(context, bus, { start: now + 0.84, duration: 0.5, gain: 0.05, type: "lowpass", filterHz: 170 });
  });
}

/** Somber descending minor stinger — combat or game defeat. */
export function playDefeatStinger(volume?: number) {
  withEffectBus(volume, 0.55, 0.34, 2400, (context, bus, now) => {
    // Descending minor line, brass-like.
    const line = [57, 53, 50, 45]; // A F D A (down)
    line.forEach((midi, index) => {
      [0, -12].forEach((octave, layer) => {
        scheduleTone(context, bus, {
          type: layer === 0 ? "sawtooth" : "triangle",
          midi: midi + octave,
          start: now + index * 0.24,
          duration: 0.9,
          gain: layer === 0 ? 0.1 : 0.05,
          attack: 0.04,
          pan: index % 2 === 0 ? -0.1 : 0.1,
          filterHz: 1300,
        });
      });
    });
    // Low minor chord drone fading out (Dm: D F A) + a hollow tam-tam.
    [38, 41, 45].forEach((midi) => {
      scheduleTone(context, bus, { type: "triangle", midi, start: now + 0.7, duration: 1.5, gain: 0.07, attack: 0.06, filterHz: 1100 });
    });
    scheduleNoise(context, bus, { start: now, duration: 0.6, gain: 0.04, type: "lowpass", filterHz: 220 });
  });
}

/** Shimmering filtered swoosh — teleport / Stargate. */
export function playTeleportWhoosh(volume?: number) {
  withEffectBus(volume, 0.6, 0.4, 1400, (context, bus, now) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();
    const panner = context.createStereoPanner();
    const stop = now + 0.85;

    source.buffer = createNoiseBuffer(context, 0.85);
    filter.type = "bandpass";
    filter.Q.value = 7;
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(4400, now + 0.35);
    filter.frequency.exponentialRampToValueAtTime(600, now + 0.8);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(0.18, now + 0.18);
    amp.gain.exponentialRampToValueAtTime(0.0001, stop);
    panner.pan.setValueAtTime(-0.4, now);
    panner.pan.linearRampToValueAtTime(0.4, stop);

    source.connect(filter);
    filter.connect(amp);
    amp.connect(panner);
    panner.connect(bus);
    source.start(now);
    source.stop(stop + 0.02);

    // Rising magical overtone pair with the swoosh.
    scheduleTone(context, bus, { type: "sine", midi: 84, start: now + 0.1, duration: 0.6, gain: 0.06, pan: 0.2 });
    scheduleTone(context, bus, { type: "sine", midi: 91, start: now + 0.28, duration: 0.5, gain: 0.05, pan: -0.2 });
  });
}

/** Airy swell + rising shimmer — vision/map buildings (observatory, lighthouse…). */
export function playRevealChime(volume?: number) {
  withEffectBus(volume, 0.5, 0.4, 1600, (context, bus, now) => {
    // Soft airy swell that opens up.
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();
    const stop = now + 0.9;
    source.buffer = createNoiseBuffer(context, 0.9);
    filter.type = "bandpass";
    filter.Q.value = 2.5;
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(4200, now + 0.6);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(0.05, now + 0.3);
    amp.gain.exponentialRampToValueAtTime(0.0001, stop);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(bus);
    source.start(now);
    source.stop(stop + 0.02);
    // Ascending bright tones like a horizon opening up.
    [79, 83, 86, 91].forEach((midi, index) => {
      scheduleTone(context, bus, {
        type: "sine",
        midi,
        start: now + 0.05 + index * 0.1,
        duration: 0.7,
        gain: 0.06,
        pan: Math.sin(index * 1.1) * 0.35,
        filterHz: 7000,
      });
    });
  });
}

/** Warm celesta-like major arpeggio — knowledge/stat buildings (schools, library…). */
export function playKnowledgeChime(volume?: number) {
  withEffectBus(volume, 0.55, 0.36, 1800, (context, bus, now) => {
    [60, 64, 67, 71, 72].forEach((midi, index) => {
      scheduleTone(context, bus, {
        type: "triangle",
        midi,
        start: now + index * 0.08,
        duration: 0.85,
        gain: index === 4 ? 0.14 : 0.11,
        pan: Math.sin(index * 0.8) * 0.28,
        filterHz: 4500,
      });
    });
    // Warm low root underneath for gravitas.
    scheduleTone(context, bus, { type: "sine", midi: 48, start: now, duration: 1.1, gain: 0.06, attack: 0.04, filterHz: 1200 });
  });
}

/** Ethereal shimmering chord — magical buildings (wells, shrines, fountains…). */
export function playMysticAura(volume?: number) {
  withEffectBus(volume, 0.55, 0.42, 2000, (context, bus, now) => {
    // Suspended, slow-attack chord.
    [62, 69, 74].forEach((midi, index) => {
      scheduleTone(context, bus, {
        type: "sine",
        midi,
        start: now,
        duration: 1.4,
        gain: 0.07,
        attack: 0.15,
        pan: [-0.22, 0, 0.22][index] ?? 0,
        filterHz: 3500,
      });
    });
    // High sparkle dust drifting over it.
    [86, 89, 93].forEach((midi, index) => {
      scheduleTone(context, bus, {
        type: "triangle",
        midi,
        start: now + 0.15 + index * 0.13,
        duration: 0.6,
        gain: 0.05,
        pan: Math.sin(index * 1.3) * 0.4,
        filterHz: 7500,
      });
    });
  });
}

/** Short rising horn muster — recruitment buildings (external dwellings). */
export function playMusterCall(volume?: number) {
  withEffectBus(volume, 0.55, 0.3, 1200, (context, bus, now) => {
    [50, 57, 62].forEach((midi, index) => {
      [0, -12].forEach((octave, layer) => {
        scheduleTone(context, bus, {
          type: layer === 0 ? "sawtooth" : "triangle",
          midi: midi + octave,
          start: now + index * 0.1,
          duration: 0.5,
          gain: layer === 0 ? 0.11 : 0.06,
          attack: 0.02,
          pan: layer === 0 ? 0.06 : -0.06,
          filterHz: 3000,
        });
      });
    });
    // Light marching drum under the call.
    scheduleNoise(context, bus, { start: now, duration: 0.3, gain: 0.07, type: "lowpass", filterHz: 200 });
  });
}

// Map each adventure-building type to the most fitting sound. Buildings not in a
// special category (campfires, crates, wagons, sea chests, wrecks…) fall back to
// the treasure jingle. Travel gates use the teleport swoosh.
const REVEAL_BUILDINGS = new Set<string>([
  AdventureBuildingType.OBSERVATORY,
  AdventureBuildingType.REDWOOD_OBSERVATORY,
  AdventureBuildingType.CARTOGRAPHER,
  AdventureBuildingType.LIGHTHOUSE,
  AdventureBuildingType.OBELISK,
  AdventureBuildingType.BUOY,
]);
const KNOWLEDGE_BUILDINGS = new Set<string>([
  AdventureBuildingType.LEARNING_STONE,
  AdventureBuildingType.SCHOOL_OF_WAR,
  AdventureBuildingType.SCHOOL_OF_MAGIC,
  AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT,
  AdventureBuildingType.TREE_OF_KNOWLEDGE,
  AdventureBuildingType.MARLETTO_TOWER,
  AdventureBuildingType.STAR_AXIS,
  AdventureBuildingType.GARDEN_OF_REVELATION,
  AdventureBuildingType.ARENA,
  AdventureBuildingType.MERCENARY_CAMP,
  AdventureBuildingType.WARRIOR_TOMB,
  AdventureBuildingType.SEER_HUT,
]);
const MYSTIC_BUILDINGS = new Set<string>([
  AdventureBuildingType.MAGIC_WELL,
  AdventureBuildingType.MAGIC_SHRINE,
  AdventureBuildingType.SPELL_SHRINE_1,
  AdventureBuildingType.SPELL_SHRINE_2,
  AdventureBuildingType.SPELL_SHRINE_3,
  AdventureBuildingType.MYSTICAL_GARDEN,
  AdventureBuildingType.FOUNTAIN_OF_FORTUNE,
  AdventureBuildingType.IDOL_OF_FORTUNE,
  AdventureBuildingType.TEMPLE,
  AdventureBuildingType.CURSED_ALTAR,
  AdventureBuildingType.MERMAID,
  AdventureBuildingType.STABLES,
]);
const RECRUIT_BUILDINGS = new Set<string>([
  AdventureBuildingType.EXTERNAL_DWELLING,
]);
const TRAVEL_BUILDINGS = new Set<string>([
  AdventureBuildingType.STARGATE,
  AdventureBuildingType.SUBTERRANEAN_GATE,
]);

/** Plays the sound that best matches an adventure building's nature. */
export function playAdventureBuildingVisit(buildingType: string, volume?: number) {
  if (REVEAL_BUILDINGS.has(buildingType)) return playRevealChime(volume);
  if (KNOWLEDGE_BUILDINGS.has(buildingType)) return playKnowledgeChime(volume);
  if (MYSTIC_BUILDINGS.has(buildingType)) return playMysticAura(volume);
  if (RECRUIT_BUILDINGS.has(buildingType)) return playMusterCall(volume);
  if (TRAVEL_BUILDINGS.has(buildingType)) return playTeleportWhoosh(volume);
  return playTreasureReward(volume);
}
