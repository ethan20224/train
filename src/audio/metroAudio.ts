import * as THREE from 'three';
import {
  DISC, ESCALATOR, FUNICULAR, LIFTS, METRO_TRAIN, OCULUS, PORTALS, THRESHOLD, WATER_WALL,
} from '../layoutMetro';
import { timeToPortalMouth, trackIndexOf } from '../metro/choreography';
import { disc } from '../metro/disc';
import { escalators } from '../metro/escalators';
import { funicular } from '../metro/funicular';
import { lifts } from '../metro/lifts';
import type { TrainState } from '../metro/timetable';
import { trackOf } from '../metro/tracks';

/**
 * Procedural Web Audio soundscape for Meridian Deep (Phase 5, P5-1).
 *
 * Rules honoured strictly:
 *  - Zero music, zero spoken announcements, zero door chimes. Architecture and precision machinery only.
 *  - 100 % procedural synthesis (no audio files).
 *  - Strictly <= 12 persistent positional voices (3 escalators + 1 disc + 2 lifts + 1 funicular + 1 water wall + 4 trains).
 *  - Voices beyond ~40 m fade out cleanly; zero per-frame heap allocations.
 */

type Ctx = BaseAudioContext;

export interface MetroAudioBus {
  readonly ctx: Ctx;
  readonly dry: GainNode;
  readonly send: GainNode;
  readonly white: AudioBuffer;
  readonly brown: AudioBuffer;
}

const HALF_TRAIN_LEN = METRO_TRAIN.length / 2;
const MAX_DIST = 42;
const ESC_SLOTS = 3;
const TRAIN_SLOTS = 4;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Seamless pink-noise buffer (Paul Kellet filter, prime durations so water/air never reveal a loop). */
function makePinkNoise(ctx: Ctx, seconds: number, seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const fade = Math.floor(0.5 * sr);
  const raw = new Float32Array(n + fade);
  const r = rng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = raw[i]!;
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    out[i] = raw[i]! * w + raw[n + i]! * (1 - w);
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += out[i]! * out[i]!;
  const k = 0.25 / Math.sqrt(sum / n + 1e-12);
  for (let i = 0; i < n; i++) out[i] = out[i]! * k;
  const buf = ctx.createBuffer(1, n, sr);
  buf.copyToChannel(out, 0);
  return buf;
}

/** Shorter, brighter, crisper honed-limestone & glass cavern impulse response (~2.2 s RT60). */
export function makeDeepImpulse(ctx: Ctx): AudioBuffer {
  const sr = ctx.sampleRate;
  const seconds = 2.6;
  const n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const RT60 = 2.2;
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n);
    const r = rng(4409 + ch * 6131);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp((-6.9078 * t) / RT60);
      // Limestone & glass keep crisp upper-mid air (11 kHz -> 2.4 kHz, noticeably cleaner than hall's 650 Hz tail).
      const fc = 2400 + 8600 * Math.exp(-t / 0.85);
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      y = (1 - a) * (r() * 2 - 1) + a * y;
      const onset = Math.min(1, Math.max(0, (t - 0.008) / 0.035));
      d[i] = y * env * onset * 2.4;
    }
    // Crisp architectural early reflections (smooth stone panels & glass balustrade returns at 14..110 ms)
    for (let k = 0; k < 16; k++) {
      const t = 0.014 + r() * 0.095;
      const idx = Math.floor(t * sr);
      const amp = (0.48 * (1 - t / 0.14)) * (r() < 0.5 ? -1 : 1);
      for (let j = 0; j < 4; j++) if (idx + j < n) d[idx + j] = d[idx + j]! + amp * Math.exp(-j * 0.85);
    }
    buf.copyToChannel(d, ch);
  }
  return buf;
}

function setPannerPos(p: PannerNode, x: number, y: number, z: number): void {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else {
    (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
  }
}

function makePanner(ctx: Ctx, refDist: number, maxDist: number, rolloff = 1.25): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = refDist;
  p.rolloffFactor = rolloff;
  p.maxDistance = maxDist;
  p.coneInnerAngle = 360;
  return p;
}

function connectPositional(bus: MetroAudioBus, p: PannerNode, out: GainNode, reverbSend: number): void {
  p.connect(out);
  out.connect(bus.dry);
  const sg = bus.ctx.createGain();
  sg.gain.value = reverbSend;
  out.connect(sg).connect(bus.send);
}

// ---- Individual pooled voice structures ----

interface EscalatorVoice {
  panner: PannerNode;
  out: GainNode;
  humOsc: OscillatorNode;
  humGain: GainNode;
  tickGain: GainNode;
  tickBp: BiquadFilterNode;
  phase: number;
  active: boolean;
}

interface LiftVoice {
  panner: PannerNode;
  out: GainNode;
  motorOsc: OscillatorNode;
  motorGain: GainNode;
  cableOsc: OscillatorNode;
  cableGain: GainNode;
  prevDoorOpen: number;
  active: boolean;
}

interface MetroTrainVoice {
  panner: PannerNode;
  out: GainNode;
  lp: BiquadFilterNode;
  airGain: GainNode;
  airBp: BiquadFilterNode;
  rumbleGain: GainNode;
  rumbleLp: BiquadFilterNode;
  hissGain: GainNode;
  whineOsc: OscillatorNode;
  whineOsc2: OscillatorNode;
  whineGain: GainNode;
  trainId: number;
  prevPhase: string;
  prevDoors: number;
  active: boolean;
}

export class MetroAudio {
  private readonly bus: MetroAudioBus;
  private readonly pinkA: AudioBuffer;
  private readonly pinkB: AudioBuffer;

  // Deep hushed room tone (~ -40 dB)
  readonly deepAmbientGain: GainNode;

  // Pooled positional voices (strictly <= 12 total: 3 esc + 1 disc + 2 lifts + 1 funicular + 1 water + 4 trains)
  private readonly escVoices: EscalatorVoice[] = [];
  private readonly discPanner: PannerNode;
  private readonly discOut: GainNode;
  private readonly discMotorOsc: OscillatorNode;
  private readonly discMotorGain: GainNode;
  private readonly discAirGain: GainNode;
  private discPrevY: number = DISC.topY;
  private discPrevTopOpen = true;
  private discPrevBotOpen = false;
  private discActive = false;

  private readonly liftVoices: LiftVoice[] = [];

  private readonly funPanner: PannerNode;
  private readonly funOut: GainNode;
  private readonly funMotorOsc: OscillatorNode;
  private readonly funMotorGain: GainNode;
  private readonly funRollGain: GainNode;
  private readonly funRollBp: BiquadFilterNode;
  private funPrevDoor = 1;
  private funActive = false;

  private readonly waterPanner: PannerNode;
  private readonly waterOut: GainNode;
  private waterActive = false;

  private readonly trainVoices: MetroTrainVoice[] = [];

  // Preallocated zero-GC scratch tables for nearest-3 escalator selection & train slot tracking
  private readonly escDist = new Float64Array(escalators.units.length);
  private readonly escCx = new Float64Array(escalators.units.length);
  private readonly escCy = new Float64Array(escalators.units.length);
  private readonly escCz = new Float64Array(escalators.units.length);
  private readonly nearestIdx = new Int32Array(ESC_SLOTS);
  private readonly trainSeen = new Uint8Array(TRAIN_SLOTS);

  private trainsProvider: (() => readonly TrainState[]) | null = null;
  private prevAudioNow = 0;

  constructor(bus: MetroAudioBus) {
    this.bus = bus;
    const { ctx } = bus;
    const t0 = ctx.currentTime;
    const rand = rng(31337);
    this.pinkA = makePinkNoise(ctx, 7.3, 101);
    this.pinkB = makePinkNoise(ctx, 11.1, 211);

    // 1. Deep room tone (~ -40 dB quiet broadband architectural "air", crossfaded in by Engine via lookFactor)
    this.deepAmbientGain = ctx.createGain();
    this.deepAmbientGain.gain.value = 0;
    this.deepAmbientGain.connect(bus.dry);

    const airSrc = ctx.createBufferSource();
    airSrc.buffer = this.pinkA;
    airSrc.loop = true;
    const airHp = ctx.createBiquadFilter();
    airHp.type = 'highpass';
    airHp.frequency.value = 140;
    const airLp = ctx.createBiquadFilter();
    airLp.type = 'lowpass';
    airLp.frequency.value = 1800;
    airLp.Q.value = 0.45;
    const airLvl = ctx.createGain();
    airLvl.gain.value = 0.032; // rms ~0.009 (~ -40 dB hushed clean subterranean air)
    airSrc.connect(airHp).connect(airLp).connect(airLvl).connect(this.deepAmbientGain);
    airSrc.start(t0, rand() * 5);

    // Slow gentle breath on the deep air bed (40 s cycle)
    const airLfo = ctx.createOscillator();
    airLfo.frequency.value = 0.025;
    const airLfoG = ctx.createGain();
    airLfoG.gain.value = 0.005;
    airLfo.connect(airLfoG).connect(airLvl.gain);
    airLfo.start(t0);

    // Whisper-soft deep stone sub-presence (48 Hz, ~ -54 dB)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 48.0;
    const subG = ctx.createGain();
    subG.gain.value = 0.0022;
    sub.connect(subG).connect(this.deepAmbientGain);
    sub.start(t0);

    // 2. Three pooled positional escalator voices (nearest 3 units within 40 m)
    for (let i = 0; i < ESC_SLOTS; i++) {
      const panner = makePanner(ctx, 2.5, MAX_DIST, 1.4);
      const out = ctx.createGain();
      out.gain.value = 0;
      connectPositional(bus, panner, out, 0.32);

      const humOsc = ctx.createOscillator();
      humOsc.type = 'triangle';
      humOsc.frequency.value = 58 + i * 1.3;
      const humLp = ctx.createBiquadFilter();
      humLp.type = 'lowpass';
      humLp.frequency.value = 160;
      const humGain = ctx.createGain();
      humGain.gain.value = 0.018;
      humOsc.connect(humLp).connect(humGain).connect(panner);
      humOsc.start(t0);

      // Step-chain tick source (filtered white noise gated gently at step-pass rate in update)
      const tickSrc = ctx.createBufferSource();
      tickSrc.buffer = bus.white;
      tickSrc.loop = true;
      const tickBp = ctx.createBiquadFilter();
      tickBp.type = 'bandpass';
      tickBp.frequency.value = 920 + i * 70;
      tickBp.Q.value = 2.4;
      const tickGain = ctx.createGain();
      tickGain.gain.value = 0;
      tickSrc.connect(tickBp).connect(tickGain).connect(panner);
      tickSrc.start(t0, rand() * 2);

      this.escVoices.push({ panner, out, humOsc, humGain, tickGain, tickBp, phase: rand(), active: false });
    }

    // 3. Sinking Floor disc voice (1 positional slot)
    this.discPanner = makePanner(ctx, 4.0, MAX_DIST, 1.3);
    this.discOut = ctx.createGain();
    this.discOut.gain.value = 0;
    connectPositional(bus, this.discPanner, this.discOut, 0.45);

    this.discMotorOsc = ctx.createOscillator();
    this.discMotorOsc.type = 'sine';
    this.discMotorOsc.frequency.value = 66;
    this.discMotorGain = ctx.createGain();
    this.discMotorGain.gain.value = 0;
    this.discMotorOsc.connect(this.discMotorGain).connect(this.discPanner);
    this.discMotorOsc.start(t0);

    const discAir = ctx.createBufferSource();
    discAir.buffer = this.pinkB;
    discAir.loop = true;
    const discBp = ctx.createBiquadFilter();
    discBp.type = 'bandpass';
    discBp.frequency.value = 340;
    discBp.Q.value = 0.65;
    this.discAirGain = ctx.createGain();
    this.discAirGain.gain.value = 0;
    discAir.connect(discBp).connect(this.discAirGain).connect(this.discPanner);
    discAir.start(t0, rand() * 6);

    // 4. Twin glass capsule lifts (2 positional slots — passing twin is subtly audible in stereo)
    for (let i = 0; i < LIFTS.positions.length; i++) {
      const panner = makePanner(ctx, 2.5, MAX_DIST, 1.35);
      const out = ctx.createGain();
      out.gain.value = 0;
      connectPositional(bus, panner, out, 0.35);

      const motorOsc = ctx.createOscillator();
      motorOsc.type = 'sine';
      motorOsc.frequency.value = 88 + i * 4;
      const motorGain = ctx.createGain();
      motorGain.gain.value = 0;
      motorOsc.connect(motorGain).connect(panner);
      motorOsc.start(t0);

      // Faint steel cable hum
      const cableOsc = ctx.createOscillator();
      cableOsc.type = 'triangle';
      cableOsc.frequency.value = 224 + i * 9;
      const cableBp = ctx.createBiquadFilter();
      cableBp.type = 'bandpass';
      cableBp.frequency.value = 230;
      cableBp.Q.value = 3.0;
      const cableGain = ctx.createGain();
      cableGain.gain.value = 0;
      cableOsc.connect(cableBp).connect(cableGain).connect(panner);
      cableOsc.start(t0);

      this.liftVoices.push({
        panner, out, motorOsc, motorGain, cableOsc, cableGain,
        prevDoorOpen: lifts.cabin(i).doorOpen01,
        active: false,
      });
    }

    // 5. Inclined glass funicular (1 positional slot: soft rail roll + motor)
    this.funPanner = makePanner(ctx, 3.0, MAX_DIST, 1.35);
    this.funOut = ctx.createGain();
    this.funOut.gain.value = 0;
    connectPositional(bus, this.funPanner, this.funOut, 0.38);

    this.funMotorOsc = ctx.createOscillator();
    this.funMotorOsc.type = 'sine';
    this.funMotorOsc.frequency.value = 74;
    this.funMotorGain = ctx.createGain();
    this.funMotorGain.gain.value = 0;
    this.funMotorOsc.connect(this.funMotorGain).connect(this.funPanner);
    this.funMotorOsc.start(t0);

    const funRoll = ctx.createBufferSource();
    funRoll.buffer = this.pinkA;
    funRoll.loop = true;
    this.funRollBp = ctx.createBiquadFilter();
    this.funRollBp.type = 'bandpass';
    this.funRollBp.frequency.value = 320;
    this.funRollBp.Q.value = 0.9;
    this.funRollGain = ctx.createGain();
    this.funRollGain.gain.value = 0;
    funRoll.connect(this.funRollBp).connect(this.funRollGain).connect(this.funPanner);
    funRoll.start(t0, rand() * 5);

    // 6. Living west water wall (1 positional slot, two prime-length bandpassed pink-noise layers, gone by mid-floor)
    this.waterPanner = makePanner(ctx, 5.0, 44, 1.5);
    this.waterOut = ctx.createGain();
    this.waterOut.gain.value = 0;
    connectPositional(bus, this.waterPanner, this.waterOut, 0.42);

    const wLow = ctx.createBufferSource();
    wLow.buffer = this.pinkA;
    wLow.loop = true;
    const wLowBp = ctx.createBiquadFilter();
    wLowBp.type = 'bandpass';
    wLowBp.frequency.value = 380;
    wLowBp.Q.value = 0.65;
    const wLowG = ctx.createGain();
    wLowG.gain.value = 0.17;
    wLow.connect(wLowBp).connect(wLowG).connect(this.waterPanner);
    wLow.start(t0, rand() * 6);

    const wHigh = ctx.createBufferSource();
    wHigh.buffer = this.pinkB;
    wHigh.loop = true;
    const wHighBp = ctx.createBiquadFilter();
    wHighBp.type = 'bandpass';
    wHighBp.frequency.value = 1850;
    wHighBp.Q.value = 0.85;
    const wHighG = ctx.createGain();
    wHighG.gain.value = 0.075;
    wHigh.connect(wHighBp).connect(wHighG).connect(this.waterPanner);
    wHigh.start(t0, rand() * 8);

    // 7. Four pooled positional metro train voices (matching POOL_SIZE = 4)
    for (let i = 0; i < TRAIN_SLOTS; i++) {
      const panner = makePanner(ctx, 8.5, 76, 1.1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 10000;
      lp.Q.value = 0.35;
      const out = ctx.createGain();
      out.gain.value = 0;
      lp.connect(panner);
      connectPositional(bus, panner, out, 0.44);

      // (a) Tunnel rush of air on approach
      const air = ctx.createBufferSource();
      air.buffer = this.pinkB;
      air.loop = true;
      const airBp = ctx.createBiquadFilter();
      airBp.type = 'bandpass';
      airBp.frequency.value = 240;
      airBp.Q.value = 0.65;
      const airGain = ctx.createGain();
      airGain.gain.value = 0;
      air.connect(airBp).connect(airGain).connect(lp);
      air.start(t0, rand() * 9);

      // (b) Quiet 2035 steel glide: soft low rumble + silky wheel hiss
      const rumble = ctx.createBufferSource();
      rumble.buffer = bus.brown;
      rumble.loop = true;
      const rumbleLp = ctx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.value = 140;
      rumbleLp.Q.value = 0.6;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0;
      rumble.connect(rumbleLp).connect(rumbleGain).connect(lp);
      rumble.start(t0, rand() * 7);

      const hiss = ctx.createBufferSource();
      hiss.buffer = bus.white;
      hiss.loop = true;
      const hissBp = ctx.createBiquadFilter();
      hissBp.type = 'bandpass';
      hissBp.frequency.value = 2200;
      hissBp.Q.value = 0.7;
      const hissGain = ctx.createGain();
      hissGain.gain.value = 0;
      hiss.connect(hissBp).connect(hissGain).connect(lp);
      hiss.start(t0, rand() * 2);

      // (c) Tasteful electric-motor whine rising with speed on departure (fundamental + soft fifth harmonic)
      const whineOsc = ctx.createOscillator();
      whineOsc.type = 'sine';
      whineOsc.frequency.value = 160;
      const whineOsc2 = ctx.createOscillator();
      whineOsc2.type = 'triangle';
      whineOsc2.frequency.value = 240;
      const whineGain2 = ctx.createGain();
      whineGain2.gain.value = 0.25;
      const whineGain = ctx.createGain();
      whineGain.gain.value = 0;
      whineOsc.connect(whineGain).connect(lp);
      whineOsc2.connect(whineGain2).connect(whineGain);
      whineOsc.start(t0);
      whineOsc2.start(t0);

      this.trainVoices.push({
        panner, out, lp, airGain, airBp, rumbleGain, rumbleLp, hissGain,
        whineOsc, whineOsc2, whineGain,
        trainId: -1, prevPhase: '', prevDoors: 0, active: false,
      });
    }
  }

  setTrainsProvider(fn: () => readonly TrainState[]): void {
    this.trainsProvider = fn;
  }

  /** Number of currently audible positional voices (strictly <= 12). */
  activeVoiceCount(): number {
    let n = 0;
    for (let i = 0; i < this.escVoices.length; i++) if (this.escVoices[i]!.active) n++;
    if (this.discActive) n++;
    for (let i = 0; i < this.liftVoices.length; i++) if (this.liftVoices[i]!.active) n++;
    if (this.funActive) n++;
    if (this.waterActive) n++;
    for (let i = 0; i < this.trainVoices.length; i++) if (this.trainVoices[i]!.active) n++;
    return n;
  }

  /** Soft pneumatic glass slide one-shot (speed gates, disc well gate, lift doors, funicular doors, train doors — NO chime). */
  pneumaticSlide(x: number, y: number, z: number, open: boolean, dur = 0.36, peak = 0.095): void {
    const { ctx } = this.bus;
    const t = ctx.currentTime + 0.005;
    const p = makePanner(ctx, 2.5, 42, 1.35);
    setPannerPos(p, x, y, z);
    const out = ctx.createGain();
    out.gain.value = 1;
    p.connect(out);
    out.connect(this.bus.dry);
    const sg = ctx.createGain();
    sg.gain.value = 0.38;
    out.connect(sg).connect(this.bus.send);

    const src = ctx.createBufferSource();
    src.buffer = this.bus.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    const f0 = open ? 1250 : 2300;
    const f1 = open ? 2450 : 1050;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.00001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.07, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.00001, t + dur);
    src.connect(bp).connect(g).connect(p);
    src.start(t, Math.random() * 2, dur + 0.06);
    src.onended = () => {
      src.disconnect(); bp.disconnect(); g.disconnect(); p.disconnect(); out.disconnect(); sg.disconnect();
    };
  }

  /** Quiet pneumatic brake sigh when a metro train comes to a smooth rest. */
  private brakeSigh(x: number, y: number, z: number): void {
    const { ctx } = this.bus;
    const t = ctx.currentTime + 0.01;
    const p = makePanner(ctx, 5.0, 52, 1.2);
    setPannerPos(p, x, y, z);
    const out = ctx.createGain();
    out.gain.value = 1;
    p.connect(out);
    out.connect(this.bus.dry);
    const sg = ctx.createGain();
    sg.gain.value = 0.45;
    out.connect(sg).connect(this.bus.send);

    const src = ctx.createBufferSource();
    src.buffer = this.pinkA;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.85;
    bp.frequency.setValueAtTime(1900, t);
    bp.frequency.exponentialRampToValueAtTime(750, t + 1.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.00001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.00001, t + 1.25);
    src.connect(bp).connect(g).connect(p);
    src.start(t, Math.random() * 4, 1.35);
    src.onended = () => {
      src.disconnect(); bp.disconnect(); g.disconnect(); p.disconnect(); out.disconnect(); sg.disconnect();
    };
  }

  /** Called once per frame from Engine.update(). Zero heap allocations. */
  update(dt: number, listener: THREE.Vector3, depthFactor: number): void {
    const { ctx } = this.bus;
    const now = ctx.currentTime;
    const safeDt = dt > 1e-4 ? Math.min(0.05, dt) : (now > this.prevAudioNow ? Math.min(0.05, now - this.prevAudioNow) : 1 / 60);
    this.prevAudioNow = now;
    const lx = listener.x, ly = listener.y, lz = listener.z;

    // 1. Deep room tone gain (crossfaded cleanly by depthFactor = lookFactor(camY))
    this.deepAmbientGain.gain.setTargetAtTime(depthFactor, now, 0.18);

    // Master metro machinery fade: quiet while on the surface floor, smoothly awake as you approach/descend the oculus
    const metroHear = smooth(-0.2, -6.5, ly) + 0.25 * (1 - smooth(12, 26, Math.hypot(lx - OCULUS.cx, lz - OCULUS.cz))) * (ly > -2 ? 1 : 0);
    const metroGain = clamp01(metroHear);

    // 2. Escalators — find nearest 3 units (zero-alloc selection over 22 units)
    const units = escalators.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i]!;
      const ax = u.axis === 'z' ? u.across : u.from;
      const ay = u.yFrom;
      const az = u.axis === 'z' ? u.from : u.across;
      const bx = u.axis === 'z' ? u.across : u.to;
      const by = u.yTo;
      const bz = u.axis === 'z' ? u.to : u.across;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const lenSq = dx * dx + dy * dy + dz * dz || 1;
      const t = clamp01(((lx - ax) * dx + (ly - ay) * dy + (lz - az) * dz) / lenSq);
      const cx = ax + dx * t, cy = ay + dy * t, cz = az + dz * t;
      this.escCx[i] = cx; this.escCy[i] = cy; this.escCz[i] = cz;
      this.escDist[i] = Math.hypot(lx - cx, ly - cy, lz - cz);
    }
    this.nearestIdx[0] = -1; this.nearestIdx[1] = -1; this.nearestIdx[2] = -1;
    for (let s = 0; s < ESC_SLOTS; s++) {
      let best = -1, bestD = MAX_DIST;
      for (let i = 0; i < units.length; i++) {
        if (i === this.nearestIdx[0] || i === this.nearestIdx[1] || i === this.nearestIdx[2]) continue;
        const d = this.escDist[i]!;
        if (d < bestD) { bestD = d; best = i; }
      }
      this.nearestIdx[s] = best;
    }
    for (let s = 0; s < ESC_SLOTS; s++) {
      const ev = this.escVoices[s]!;
      const ui = this.nearestIdx[s]!;
      if (ui < 0 || metroGain < 0.005) {
        ev.active = false;
        ev.out.gain.setTargetAtTime(0, now, 0.18);
        continue;
      }
      const u = units[ui]!;
      const d = this.escDist[ui]!;
      const att = (1 - smooth(24, MAX_DIST, d)) * metroGain;
      ev.active = att > 0.004;
      setPannerPos(ev.panner, this.escCx[ui]!, this.escCy[ui]!, this.escCz[ui]!);
      ev.out.gain.setTargetAtTime(att, now, 0.12);
      const spd = escalators.speed(u.id);
      const act = clamp01((spd - ESCALATOR.idleSpeed) / Math.max(0.01, ESCALATOR.activeSpeed - ESCALATOR.idleSpeed));
      ev.humOsc.frequency.setTargetAtTime(54 + 14 * act, now, 0.2);
      ev.humGain.gain.setTargetAtTime(0.012 + 0.016 * act, now, 0.2);
      // Faint rhythmic step-chain pulse (speed / treadDepth Hz: 0.5 Hz idle -> 1.625 Hz active)
      ev.phase = (ev.phase + (spd / ESCALATOR.treadDepth) * safeDt) % 1;
      const pulse = Math.exp(-ev.phase * 14);
      ev.tickGain.gain.setTargetAtTime((0.006 + 0.012 * act) * pulse, now, 0.025);
    }

    // 3. Sinking Floor disc voice + quiet gate glides
    {
      const dy = disc.y;
      const dVel = Math.abs(dy - this.discPrevY) / safeDt;
      this.discPrevY = dy;
      const dist = Math.hypot(lx - OCULUS.cx, ly - dy, lz - OCULUS.cz);
      const att = (1 - smooth(26, MAX_DIST, dist)) * metroGain;
      const move = clamp01(dVel / DISC.vmax);
      this.discActive = att > 0.004 && move > 0.01;
      setPannerPos(this.discPanner, OCULUS.cx, dy, OCULUS.cz);
      this.discOut.gain.setTargetAtTime(att, now, 0.12);
      this.discMotorOsc.frequency.setTargetAtTime(64 + 34 * move, now, 0.18);
      this.discMotorGain.gain.setTargetAtTime(0.045 * move, now, 0.15);
      this.discAirGain.gain.setTargetAtTime(0.055 * move * move, now, 0.18);

      const topOpen = disc.gateOpen('top');
      if (topOpen !== this.discPrevTopOpen) {
        this.discPrevTopOpen = topOpen;
        if (Math.hypot(lx - OCULUS.cx, ly - DISC.topY, lz - (OCULUS.cz - OCULUS.curbOuterR)) < 32) {
          this.pneumaticSlide(OCULUS.cx, DISC.topY + 0.9, OCULUS.cz - OCULUS.curbOuterR, topOpen, 0.42, 0.085);
        }
      }
      const botOpen = disc.gateOpen('bottom');
      if (botOpen !== this.discPrevBotOpen) {
        this.discPrevBotOpen = botOpen;
        if (Math.hypot(lx - OCULUS.cx, ly - DISC.bottomY, lz - (OCULUS.cz - DISC.wellR)) < 35) {
          this.pneumaticSlide(OCULUS.cx, DISC.bottomY + 1.0, OCULUS.cz - DISC.wellR, botOpen, 0.42, 0.085);
        }
      }
    }

    // 4. Twin glass capsule lifts (Lift 0 & Lift 1 — including empty twin passing nearby!)
    for (let i = 0; i < this.liftVoices.length; i++) {
      const lv = this.liftVoices[i]!;
      const snap = lifts.cabin(i);
      const [px, pz] = LIFTS.positions[i]!;
      const py = snap.y + 1.2;
      const dist = Math.hypot(lx - px, ly - py, lz - pz);
      const att = (1 - smooth(24, MAX_DIST, dist)) * depthFactor;
      const spN = clamp01(Math.abs(snap.speed) / 4.2);
      lv.active = att > 0.004 && spN > 0.01;
      setPannerPos(lv.panner, px, py, pz);
      lv.out.gain.setTargetAtTime(att, now, 0.1);
      lv.motorOsc.frequency.setTargetAtTime(84 + 82 * spN, now, 0.16);
      lv.motorGain.gain.setTargetAtTime(0.036 * spN, now, 0.12);
      lv.cableOsc.frequency.setTargetAtTime(215 + 75 * spN, now, 0.18);
      lv.cableGain.gain.setTargetAtTime(0.018 * spN, now, 0.14);

      // Curved glass door glide one-shot when starting open or close
      if (lv.prevDoorOpen <= 0.02 && snap.doorOpen01 > 0.02 && dist < 34) {
        this.pneumaticSlide(px, py, pz, true, 0.52, 0.075);
      } else if (lv.prevDoorOpen >= 0.98 && snap.doorOpen01 < 0.98 && dist < 34) {
        this.pneumaticSlide(px, py, pz, false, 0.52, 0.075);
      }
      lv.prevDoorOpen = snap.doorOpen01;
    }

    // 5. Inclined glass funicular (soft rail roll + motor + quiet door glide)
    {
      const fSnap = funicular.snapshot();
      const fx = fSnap.x + FUNICULAR.cabinLength / 2;
      const fy = fSnap.y + 1.2;
      const fz = fSnap.z;
      const dist = Math.hypot(lx - fx, ly - fy, lz - fz);
      const att = (1 - smooth(26, MAX_DIST, dist)) * depthFactor;
      const spN = clamp01(Math.abs(fSnap.speed) / FUNICULAR.vmax);
      this.funActive = att > 0.004 && spN > 0.01;
      setPannerPos(this.funPanner, fx, fy, fz);
      this.funOut.gain.setTargetAtTime(att, now, 0.1);
      this.funMotorOsc.frequency.setTargetAtTime(72 + 56 * spN, now, 0.16);
      this.funMotorGain.gain.setTargetAtTime(0.032 * spN, now, 0.14);
      this.funRollBp.frequency.setTargetAtTime(260 + 280 * spN, now, 0.18);
      this.funRollGain.gain.setTargetAtTime(0.055 * spN, now, 0.14);

      if (this.funPrevDoor <= 0.02 && fSnap.doorOpen01 > 0.02 && dist < 34) {
        this.pneumaticSlide(fx, fy, fz, true, 0.55, 0.075);
      } else if (this.funPrevDoor >= 0.98 && fSnap.doorOpen01 < 0.98 && dist < 34) {
        this.pneumaticSlide(fx, fy, fz, false, 0.55, 0.075);
      }
      this.funPrevDoor = fSnap.doorOpen01;
    }

    // 6. Living west water wall (positional, loudest at wall x=-60, gone by mid-floor dist >= 42 m)
    {
      const wx = WATER_WALL.x;
      const wy = Math.max(WATER_WALL.yMin, Math.min(WATER_WALL.yMax, ly));
      const wz = Math.max(WATER_WALL.zMin, Math.min(WATER_WALL.zMax, lz));
      const dist = Math.hypot(lx - wx, ly - wy, lz - wz);
      // Smoothly vanishes by 42 m (so standing at mid-Crossing x = -18..0 it is completely gone)
      const wGain = (1 - smooth(10, 42, dist)) * depthFactor;
      this.waterActive = wGain > 0.004;
      setPannerPos(this.waterPanner, wx + 0.5, wy, wz);
      this.waterOut.gain.setTargetAtTime(wGain, now, 0.16);
    }

    // 7. Four pooled positional metro train voices
    const trains = this.trainsProvider ? this.trainsProvider() : null;
    if (trains && depthFactor > 0.01) {
      this.trainSeen.fill(0);
      for (let k = 0; k < trains.length; k++) {
        const t = trains[k]!;
        if (t.phase === 'gone') continue;
        for (let i = 0; i < TRAIN_SLOTS; i++) {
          if (this.trainVoices[i]!.trainId === t.id) { this.trainSeen[i] = 1; break; }
        }
      }
      for (let i = 0; i < TRAIN_SLOTS; i++) {
        if (!this.trainSeen[i] && this.trainVoices[i]!.trainId !== -1) {
          const tv = this.trainVoices[i]!;
          tv.trainId = -1;
          tv.prevPhase = '';
          tv.prevDoors = 0;
          tv.active = false;
          tv.out.gain.setTargetAtTime(0, now, 0.2);
        }
      }
      for (let k = 0; k < trains.length; k++) {
        const t = trains[k]!;
        if (t.phase === 'gone') continue;
        let slot = -1;
        for (let i = 0; i < TRAIN_SLOTS; i++) if (this.trainVoices[i]!.trainId === t.id) { slot = i; break; }
        if (slot < 0) {
          for (let i = 0; i < TRAIN_SLOTS; i++) if (this.trainVoices[i]!.trainId === -1) { slot = i; break; }
          if (slot < 0) continue;
          const tv = this.trainVoices[slot]!;
          tv.trainId = t.id;
          tv.prevPhase = t.phase;
          tv.prevDoors = t.doors01;
        }
        const tv = this.trainVoices[slot]!;
        const tr = trackOf(t.line, t.track);
        const cx = tr.origin[0] + tr.dir[0] * t.s;
        const cz = tr.origin[1] + tr.dir[1] * t.s;
        const cy = tr.railY + 2.0;

        // Nearest point along the 81.5 m consist to the listener (clamped inside cavern/bore mouth for natural stereo)
        let px = cx, py = cy, pz = cz;
        const along = Math.max(-HALF_TRAIN_LEN, Math.min(HALF_TRAIN_LEN, (lx - cx) * tr.dir[0] + (lz - cz) * tr.dir[1]));
        px = cx + tr.dir[0] * along;
        pz = cz + tr.dir[1] * along;

        // While nose is still deep inside entry bore, anchor the approaching tunnel air-rush at the entry bore mouth!
        let airRush = 0;
        let inCavernVis = 1;
        if (t.phase === 'approaching') {
          const tMouth = timeToPortalMouth(t); // 4 s = wave crest at mouth, 0 s = nose emerges
          if (tMouth > 0) {
            const bore = PORTALS[trackIndexOf(t.line, t.track) * 2]!;
            px = bore.centre[0]; py = bore.centre[1]; pz = bore.centre[2];
            // Air rush rises smoothly as the arrival light-wave races toward the mouth (tMouth 10 -> 0 s)
            airRush = smooth(10.5, 0.2, tMouth);
            inCavernVis = smooth(5.5, 0.0, tMouth);
          } else {
            // Brief residual tunnel pressure breath right as the train emerges
            airRush = (1 - smooth(0, -3.5, tMouth)) * 0.55;
            inCavernVis = 1;
          }
        } else if (t.phase === 'departing') {
          const tailDepth = t.s - HALF_TRAIN_LEN - tr.portalOut;
          inCavernVis = 1 - smooth(0, 120, tailDepth);
        }

        const dist = Math.hypot(lx - px, ly - py, lz - pz);
        const distAtt = 1 - smooth(36, 70, dist);
        const outGain = distAtt * depthFactor;
        const vn = clamp01(t.v / 20);
        tv.active = outGain > 0.005 && (airRush > 0.01 || vn > 0.01);

        setPannerPos(tv.panner, px, py, pz);
        tv.out.gain.setTargetAtTime(outGain, now, 0.1);
        tv.lp.frequency.setTargetAtTime(Math.max(520, 11000 * Math.exp(-dist / 55)), now, 0.14);

        // 1. Tunnel rush of air
        tv.airBp.frequency.setTargetAtTime(180 + 380 * airRush, now, 0.14);
        tv.airGain.gain.setTargetAtTime(0.36 * airRush, now, 0.14);

        // 2. Quiet 2035 welded-rail steel glide (soft rumble + silky high wheel hiss)
        tv.rumbleLp.frequency.setTargetAtTime(100 + 150 * vn, now, 0.16);
        tv.rumbleGain.gain.setTargetAtTime(0.44 * Math.pow(vn, 1.15) * inCavernVis, now, 0.15);
        tv.hissGain.gain.setTargetAtTime(0.105 * Math.pow(vn, 1.5) * inCavernVis, now, 0.16);

        // 5. Departure electric-motor whine rising cleanly with speed
        const isDep = t.phase === 'departing';
        const depEnv = isDep ? smooth(0.3, 4.5, t.v) * (1 - smooth(15, 20, t.v) * 0.45) * inCavernVis : 0;
        const fWhine = 155 + 360 * vn;
        tv.whineOsc.frequency.setTargetAtTime(fWhine, now, 0.14);
        tv.whineOsc2.frequency.setTargetAtTime(fWhine * 1.5, now, 0.14);
        tv.whineGain.gain.setTargetAtTime(0.052 * depEnv, now, 0.18);

        // 3. Brake sigh one-shot on arrival standstill
        if (tv.prevPhase === 'approaching' && t.phase === 'stopped' && dist < 48) {
          this.brakeSigh(px, py, pz);
        }
        // 4. Pneumatic door slide one-shots (NO chime!)
        if (t.phase === 'stopped' && dist < 42) {
          if (tv.prevDoors <= 0.01 && t.doors01 > 0.01) {
            this.pneumaticSlide(px, py, pz, true, 0.55, 0.13);
          } else if (tv.prevDoors >= 0.99 && t.doors01 < 0.99) {
            this.pneumaticSlide(px, py, pz, false, 0.55, 0.13);
          }
        }
        tv.prevPhase = t.phase;
        tv.prevDoors = t.doors01;
      }
    } else {
      for (let i = 0; i < TRAIN_SLOTS; i++) {
        const tv = this.trainVoices[i]!;
        tv.active = false;
        tv.out.gain.setTargetAtTime(0, now, 0.2);
      }
    }

    void THRESHOLD; // layout anchor referenced by speed gates via speedGate()
  }
}
