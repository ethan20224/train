import * as THREE from 'three';
import type { AudioEngine, FrameInfo, TrainVoice } from '../core/types';
import { CONCIERGE, CROSS_PLATFORM, KIOSK } from '../layout';

/**
 * Fully procedural Web Audio for Grand Meridian Terminal. No sound files, nothing plays before start().
 *
 * Graph (all in one AudioContext):
 *   sources -> dryBus ----------------------------> master -> compressor -> destination
 *   sources -> reverbSend -> ConvolverNode(IR) -> reverbReturn -> master
 *   - Hall reverb: generated stereo-decorrelated IR, ~5.5 s exponential decay with a darkening tail and sparse early reflections.
 *   - Room tone: brown noise (low-passed, slowly breathing) + two barely audible drone sines + a whisper of air.
 *   - Footsteps: click transient + low body thump + heel knock; marble (bright) vs platform stone (dull).
 *   - Kiosk clock: PannerNode at the kiosk; tick on every integer second of FrameInfo.time, softer tock at +0.5 s.
 *   - Train voices: HRTF panner at the train root + distance low-pass (haze muffles far trains); rumble, rail-joint
 *     clacks (18 m joints), pneumatic brake hiss + squeal, departure release + hum.
 *
 * `createAudioEngine(camera, options?)`: the optional second argument exists so the graph can be rendered offline
 * (OfflineAudioContext) for verification; the game calls it with the camera only.
 */

type Ctx = BaseAudioContext;

export interface AudioEngineOptions {
  /** Supply a context (e.g. an OfflineAudioContext) instead of creating a real AudioContext in start(). */
  context?: BaseAudioContext;
}

const JOINT_SPACING = 18; // m between rail joints
const BOGIE_SPACING = 2.6; // m between the two axles of a bogie (the "clack-clack")
const CLOCK_POS = new THREE.Vector3(KIOSK.center[0], KIOSK.clockY, KIOSK.center[1]);

// ---------------------------------------------------------------------------------------------------------------------
// Buffers
// ---------------------------------------------------------------------------------------------------------------------

/** Deterministic PRNG so noise buffers (and tests) are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function makeNoise(ctx: Ctx, seconds: number, kind: 'white' | 'brown', seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const fade = Math.floor(0.4 * sr);
  const raw = new Float32Array(n + fade);
  const r = rng(seed);
  if (kind === 'white') {
    for (let i = 0; i < raw.length; i++) raw[i] = r() * 2 - 1;
  } else {
    let y = 0;
    for (let i = 0; i < raw.length; i++) {
      y = (y + 0.02 * (r() * 2 - 1)) / 1.02; // leaky integrator = brown noise without DC drift
      raw[i] = y;
    }
  }
  // Seamless loop: cross-fade the tail past n into the head.
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = raw[i] ?? 0;
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    out[i] = (raw[i] ?? 0) * w + (raw[n + i] ?? 0) * (1 - w);
  }
  // Normalise to RMS 0.25.
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (out[i] ?? 0) ** 2;
  const k = 0.25 / Math.sqrt(sum / n + 1e-12);
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) * k;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  buf.copyToChannel(out, 0);
  return buf;
}

/** Vast stone hall: ~5.5 s RT60, stereo-decorrelated, darkening tail, sparse early reflections. */
function makeHallImpulse(ctx: Ctx): AudioBuffer {
  const sr = ctx.sampleRate;
  const seconds = 6.2;
  const n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const RT60 = 5.5;
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n);
    const r = rng(9001 + ch * 7919);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp((-6.9078 * t) / RT60);
      // High frequencies die faster: cutoff glides 9 kHz -> 650 Hz.
      const fc = 650 + 8350 * Math.exp(-t / 1.1);
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      y = (1 - a) * (r() * 2 - 1) + a * y;
      const onset = Math.min(1, Math.max(0, (t - 0.018) / 0.07)); // pre-delay + soft build-up
      d[i] = y * env * onset * 3.2;
    }
    // Early reflections: walls 30 m away -> ~175 ms round trip, vault, columns. Different per channel.
    for (let k = 0; k < 14; k++) {
      const t = 0.028 + r() * 0.2;
      const idx = Math.floor(t * sr);
      const amp = (0.55 * (1 - t / 0.26)) * (r() < 0.5 ? -1 : 1);
      for (let j = 0; j < 6; j++) if (idx + j < n) d[idx + j] = (d[idx + j] ?? 0) + amp * Math.exp(-j * 0.6);
    }
    buf.copyToChannel(d, ch);
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------------

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Percussive envelope: instant attack, exponential decay. */
function pluck(g: GainNode, t: number, peak: number, decay: number, attack = 0.001): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.00001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.00001, t + attack + decay);
}

// ---------------------------------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------------------------------

interface Bus {
  ctx: Ctx;
  dry: GainNode;
  send: GainNode;
  white: AudioBuffer;
  brown: AudioBuffer;
}

class Voice implements TrainVoice {
  private readonly engine: Engine;
  private readonly obj: THREE.Object3D;
  private bus: Bus | null = null;
  private disposed = false;

  private speed = 0;
  private smoothSpeed = 0;
  private braking = false;
  private departed = false;
  private jointPhase = 0;
  private prevPos = new THREE.Vector3();
  private havePrev = false;
  private wantBrakeHiss = false;
  private wantDepartPuff = false;

  // nodes
  private out: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private panner: PannerNode | null = null;
  private rumbleGain: GainNode | null = null;
  private rumbleLp: BiquadFilterNode | null = null;
  private whooshGain: GainNode | null = null;
  private bodyOsc: OscillatorNode | null = null;
  private bodyGain: GainNode | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private squealOsc: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;
  private squealBp: BiquadFilterNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private wasMoving = false;
  private releaseDone = false;

  constructor(engine: Engine, obj: THREE.Object3D) {
    this.engine = engine;
    this.obj = obj;
  }

  setSpeed(mps: number): void {
    this.speed = Math.max(0, mps);
  }
  brake(): void {
    this.braking = true;
    this.departed = false;
    this.releaseDone = false;
    this.wantBrakeHiss = true;
  }
  depart(): void {
    this.departed = true;
    this.braking = false;
    this.wantDepartPuff = true;
  }

  /** Build the node graph once the context exists. */
  attach(bus: Bus): void {
    if (this.bus || this.disposed) return;
    this.bus = bus;
    const { ctx } = bus;
    const track = <T extends AudioNode>(n: T): T => (this.nodes.push(n), n);
    const noiseSrc = (buf: AudioBuffer): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      this.sources.push(s);
      return s;
    };

    this.out = track(ctx.createGain());
    this.out.gain.value = 0;
    this.lp = track(ctx.createBiquadFilter());
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 12000;
    this.lp.Q.value = 0.3;
    this.panner = track(ctx.createPanner());
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 8;
    this.panner.rolloffFactor = 1.1;
    this.panner.maxDistance = 1500;
    this.panner.coneInnerAngle = 360;

    // Rumble: low-passed brown noise.
    const rumble = noiseSrc(bus.brown);
    this.rumbleLp = track(ctx.createBiquadFilter());
    this.rumbleLp.type = 'lowpass';
    this.rumbleLp.frequency.value = 160;
    this.rumbleLp.Q.value = 0.7;
    this.rumbleGain = track(ctx.createGain());
    this.rumbleGain.gain.value = 0;
    rumble.connect(this.rumbleLp).connect(this.rumbleGain).connect(this.lp);

    // Airy mid whoosh of the passing train (band-passed brown/white blend).
    const whoosh = noiseSrc(bus.white);
    const whooshBp = track(ctx.createBiquadFilter());
    whooshBp.type = 'bandpass';
    whooshBp.frequency.value = 650;
    whooshBp.Q.value = 0.6;
    this.whooshGain = track(ctx.createGain());
    this.whooshGain.gain.value = 0;
    whoosh.connect(whooshBp).connect(this.whooshGain).connect(this.lp);

    // Low sine body (motors / diesel-electric hum).
    this.bodyOsc = ctx.createOscillator();
    this.bodyOsc.type = 'sine';
    this.bodyOsc.frequency.value = 42;
    this.sources.push(this.bodyOsc);
    this.bodyGain = track(ctx.createGain());
    this.bodyGain.gain.value = 0;
    this.bodyOsc.connect(this.bodyGain).connect(this.lp);

    // Departure hum (electrical, rising).
    this.humOsc = ctx.createOscillator();
    this.humOsc.type = 'triangle';
    this.humOsc.frequency.value = 96;
    this.sources.push(this.humOsc);
    this.humGain = track(ctx.createGain());
    this.humGain.gain.value = 0;
    this.humOsc.connect(this.humGain).connect(this.lp);

    // Brake squeal: thin band-passed saw, driven by speed during the last seconds of braking.
    this.squealOsc = ctx.createOscillator();
    this.squealOsc.type = 'sawtooth';
    this.squealOsc.frequency.value = 2400;
    this.sources.push(this.squealOsc);
    this.squealBp = track(ctx.createBiquadFilter());
    this.squealBp.type = 'bandpass';
    this.squealBp.frequency.value = 2600;
    this.squealBp.Q.value = 9;
    this.squealGain = track(ctx.createGain());
    this.squealGain.gain.value = 0;
    this.squealOsc.connect(this.squealBp).connect(this.squealGain).connect(this.lp);

    this.lp.connect(this.panner);
    this.panner.connect(this.out);
    this.out.connect(bus.dry);
    const send = track(ctx.createGain());
    send.gain.value = 0.35;
    this.out.connect(send);
    send.connect(bus.send);

    const t0 = ctx.currentTime;
    const r = rng((Math.random() * 1e9) | 0);
    rumble.start(t0, r() * bus.brown.duration);
    whoosh.start(t0, r() * bus.white.duration);
    this.bodyOsc.start(t0);
    this.humOsc.start(t0);
    this.squealOsc.start(t0);
    this.out.gain.setTargetAtTime(1, t0, 0.5);
  }

  update(dt: number, listener: THREE.Vector3): void {
    const bus = this.bus;
    if (!bus || this.disposed || !this.panner || !this.lp) return;
    const { ctx } = bus;
    const now = ctx.currentTime;

    const p = this.obj.getWorldPosition(new THREE.Vector3());
    const dist = p.distanceTo(listener);
    const pn = this.panner;
    if (pn.positionX) {
      pn.positionX.value = p.x;
      pn.positionY.value = p.y + 2;
      pn.positionZ.value = p.z;
    } else {
      (pn as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y + 2, p.z);
    }
    // Haze muffles distant trains.
    const cutoff = Math.max(420, 16000 * Math.exp(-dist / 190));
    this.lp.frequency.setTargetAtTime(cutoff, now, 0.12);

    // Speed: prefer the explicit setSpeed, fall back to measured movement if the owner never calls it.
    if (this.havePrev && this.speed === 0 && dt > 0) {
      const measured = p.distanceTo(this.prevPos) / dt;
      if (measured < 80) this.speed = measured;
    }
    this.prevPos.copy(p);
    this.havePrev = true;

    const k = 1 - Math.exp(-dt * 2.5);
    this.smoothSpeed += (this.speed - this.smoothSpeed) * k;
    const v = this.smoothSpeed;
    const vn = clamp01(v / 24);

    // Rumble body scales with speed; even at standstill a very faint idle remains (the train is alive).
    const idle = 0.0025;
    const rumbleLevel = idle + 0.55 * vn ** 1.25;
    this.rumbleGain?.gain.setTargetAtTime(rumbleLevel, now, 0.15);
    this.rumbleLp?.frequency.setTargetAtTime(110 + 260 * vn, now, 0.2);
    this.whooshGain?.gain.setTargetAtTime(0.16 * vn ** 1.8, now, 0.2);
    this.bodyOsc?.frequency.setTargetAtTime(38 + 34 * vn, now, 0.3);
    this.bodyGain?.gain.setTargetAtTime(0.02 + 0.18 * vn, now, 0.3);
    this.humOsc?.frequency.setTargetAtTime(90 + 140 * vn, now, 0.4);
    const humTarget = this.departed ? 0.035 * smooth(0.5, 12, v) * (1 - smooth(14, 24, v)) : 0;
    this.humGain?.gain.setTargetAtTime(humTarget, now, 0.4);

    // Squeal: only while braking, only during the final slow crawl.
    if (this.squealOsc && this.squealGain && this.squealBp) {
      const crawl = this.braking ? smooth(0.15, 0.9, v) * (1 - smooth(3.2, 5.5, v)) : 0;
      this.squealGain.gain.setTargetAtTime(0.05 * crawl, now, 0.08);
      const f = 1700 + 520 * v + 90 * Math.sin(now * 7);
      this.squealOsc.frequency.setTargetAtTime(f, now, 0.05);
      this.squealBp.frequency.setTargetAtTime(f * 1.5, now, 0.05);
    }

    // Wheel clacks at the rail joints (two bogie hits per joint).
    if (v > 1.5) {
      this.jointPhase += (v * dt) / JOINT_SPACING;
      while (this.jointPhase >= 1) {
        this.jointPhase -= 1;
        const lead = this.jointPhase * (JOINT_SPACING / v); // how long ago the joint was crossed
        const when = Math.max(now, now - lead);
        this.clack(when, clamp01(v / 12));
        this.clack(when + BOGIE_SPACING / v, clamp01(v / 12) * 0.8);
      }
    }

    // Stop: pneumatic release when the train comes to rest after braking.
    if (v > 1.2) this.wasMoving = true;
    if (this.braking && this.wasMoving && v < 0.25 && !this.releaseDone) {
      this.releaseDone = true;
      this.hiss(now, 1.4, 0.16, 3200);
    }

    if (this.wantBrakeHiss) {
      this.wantBrakeHiss = false;
      this.hiss(now + 0.05, 4.2, 0.22, 4800); // long pneumatic hiss
    }
    if (this.wantDepartPuff) {
      this.wantDepartPuff = false;
      this.hiss(now + 0.05, 1.6, 0.18, 2600); // air release puff
    }
  }

  /** One wheel-on-rail-joint clack: bright bandpassed noise tick + low thump. */
  private clack(when: number, level: number): void {
    const bus = this.bus;
    if (!bus || !this.lp) return;
    const { ctx } = bus;
    const r = Math.random();
    const src = ctx.createBufferSource();
    src.buffer = bus.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 850 + r * 500;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    pluck(g, when, 0.5 * level, 0.07);
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, when);
    thump.frequency.exponentialRampToValueAtTime(70, when + 0.08);
    const tg = ctx.createGain();
    pluck(tg, when, 0.45 * level, 0.11);
    src.connect(bp).connect(g).connect(this.lp);
    thump.connect(tg).connect(this.lp);
    src.start(when, r * 1.5, 0.12);
    thump.start(when);
    thump.stop(when + 0.2);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
      thump.disconnect();
      tg.disconnect();
    };
  }

  /** Pneumatic hiss: band-passed noise with a swell and a long fade. */
  private hiss(when: number, seconds: number, peak: number, centre: number): void {
    const bus = this.bus;
    if (!bus || !this.lp) return;
    const { ctx } = bus;
    const src = ctx.createBufferSource();
    src.buffer = bus.white;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(centre * 1.15, when);
    bp.frequency.exponentialRampToValueAtTime(centre * 0.7, when + seconds);
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.00001, when);
    g.gain.linearRampToValueAtTime(peak, when + Math.min(0.35, seconds * 0.12));
    g.gain.setTargetAtTime(0.00001, when + seconds * 0.25, seconds * 0.28);
    src.connect(hp).connect(bp).connect(g).connect(this.lp);
    src.start(when, Math.random() * 0.5, seconds + 0.2);
    src.stop(when + seconds + 0.3);
    src.onended = () => {
      src.disconnect();
      hp.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.removeVoice(this);
    const bus = this.bus;
    if (!bus || !this.out) return;
    const now = bus.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, 0.15);
    const nodes = this.nodes;
    const sources = this.sources;
    const stopAt = now + 1.2;
    for (const s of sources) {
      try {
        s.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    // Disconnect after the fade (OfflineAudioContext has no wall clock use; harmless there).
    setTimeout(() => {
      for (const s of sources) s.disconnect();
      for (const n of nodes) n.disconnect();
    }, 1600);
    this.sources = [];
    this.nodes = [];
    this.bus = null;
  }
}

class Engine implements AudioEngine {
  private ctx: Ctx | null = null;
  private readonly options: AudioEngineOptions;

  private master: GainNode | null = null;
  private bus: Bus | null = null;
  private started = false;

  private readonly voices = new Set<Voice>();
  private readonly listenerPos = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private clockOut: GainNode | null = null;
  private lastSecondHalf = -1;
  private footSide = 1;

  constructor(options: AudioEngineOptions = {}) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = this.options.context ?? new AC({ latencyHint: 'interactive' });
      this.build(this.ctx);
    }
    if (typeof AudioContext !== 'undefined' && this.ctx instanceof AudioContext && this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      const t = this.ctx.currentTime;
      const m = this.master;
      if (m) {
        m.gain.cancelScheduledValues(t);
        m.gain.setValueAtTime(0, t);
        m.gain.linearRampToValueAtTime(0.9, t + 2); // gentle 2 s fade-in
      }
    }
  }

  /** The AudioContext (null before start()); exposed for verification. */
  get context(): Ctx | null {
    return this.ctx;
  }

  private build(ctx: Ctx): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.35;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    const dry = ctx.createGain();
    dry.connect(this.master);

    const send = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = makeHallImpulse(ctx);
    const ret = ctx.createGain();
    ret.gain.value = 0.85;
    send.connect(convolver).connect(ret).connect(this.master);

    this.bus = { ctx, dry, send, white: makeNoise(ctx, 3, 'white', 11), brown: makeNoise(ctx, 9, 'brown', 23) };
    this.buildAmbient(this.bus);
    this.buildClock(this.bus);
  }

  /** Room tone: the sound of a huge empty space. Very low level, slowly breathing. */
  private buildAmbient(bus: Bus): void {
    const { ctx } = bus;
    const t0 = ctx.currentTime;
    const rand = rng(77);

    const air = ctx.createBufferSource();
    air.buffer = bus.brown;
    air.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.085;
    air.connect(lp).connect(g);
    g.connect(bus.dry);
    const gs = ctx.createGain();
    gs.gain.value = 0.7;
    g.connect(gs).connect(bus.send);
    air.start(t0, rand() * 5);

    // Slow breathing: LFO on the cutoff and level.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoCut = ctx.createGain();
    lfoCut.gain.value = 90;
    lfo.connect(lfoCut).connect(lp.frequency);
    const lfoLvl = ctx.createGain();
    lfoLvl.gain.value = 0.02;
    lfo.connect(lfoLvl).connect(g.gain);
    lfo.start(t0);

    // Faint high air (ventilation, distant doors) - almost nothing.
    const hiss = ctx.createBufferSource();
    hiss.buffer = bus.white;
    hiss.loop = true;
    const hbp = ctx.createBiquadFilter();
    hbp.type = 'bandpass';
    hbp.frequency.value = 3800;
    hbp.Q.value = 0.5;
    const hg = ctx.createGain();
    hg.gain.value = 0.0018;
    hiss.connect(hbp).connect(hg).connect(bus.dry);
    hg.connect(bus.send);
    hiss.start(t0, rand() * 2);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.031;
    const l2g = ctx.createGain();
    l2g.gain.value = 0.0009;
    lfo2.connect(l2g).connect(hg.gain);
    lfo2.start(t0);

    // Barely-there drone: two detuned low sines (a fifth apart), breathing out of phase.
    for (const [f, lvl, rate] of [
      [54.7, 0.011, 0.037],
      [82.6, 0.006, 0.052],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = lvl;
      const l = ctx.createOscillator();
      l.frequency.value = rate;
      const lg = ctx.createGain();
      lg.gain.value = lvl * 0.6;
      l.connect(lg).connect(og.gain);
      o.connect(og);
      og.connect(bus.dry);
      og.connect(bus.send);
      o.start(t0);
      l.start(t0);
    }
  }

  private buildClock(bus: Bus): void {
    const { ctx } = bus;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.25;
    p.maxDistance = 400;
    if (p.positionX) {
      p.positionX.value = CLOCK_POS.x;
      p.positionY.value = CLOCK_POS.y;
      p.positionZ.value = CLOCK_POS.z;
    } else {
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(CLOCK_POS.x, CLOCK_POS.y, CLOCK_POS.z);
    }
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(p);
    p.connect(bus.dry);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    p.connect(send).connect(bus.send);
    this.clockOut = out;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Footsteps
  // -------------------------------------------------------------------------------------------------------------------

  /** `when` is optional (defaults to now) so tests can lay steps out on an offline timeline. */
  footstep(when?: number): void {
    const bus = this.bus;
    if (!bus || !this.started) return;
    const { ctx } = bus;
    const t = when ?? ctx.currentTime;
    const onPlatform = this.listenerPos.z > CROSS_PLATFORM.zMin;
    const r = Math.random;
    const level = (0.72 + r() * 0.28) * (onPlatform ? 0.62 : 1);
    const pitch = 0.9 + r() * 0.22;
    this.footSide = -this.footSide;

    const pan = ctx.createStereoPanner();
    pan.pan.value = this.footSide * (0.06 + r() * 0.08);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    pan.connect(mix);
    mix.connect(bus.dry);
    const sendG = ctx.createGain();
    sendG.gain.value = onPlatform ? 0.75 : 1.15; // polished marble throws the step into the hall
    mix.connect(sendG).connect(bus.send);

    // Click: short bandpassed noise transient (the leather/hard sole hitting stone).
    const click = ctx.createBufferSource();
    click.buffer = bus.white;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = onPlatform ? 500 : 1400;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (onPlatform ? 1500 : 3300) * pitch;
    bp.Q.value = onPlatform ? 0.8 : 1.3;
    const cg = ctx.createGain();
    pluck(cg, t, 0.55 * level, onPlatform ? 0.03 : 0.022);
    click.connect(hp).connect(bp).connect(cg).connect(pan);
    click.start(t, r() * 2, 0.08);

    // Heel knock: mid-band body of the shoe.
    const knock = ctx.createBufferSource();
    knock.buffer = bus.white;
    const kb = ctx.createBiquadFilter();
    kb.type = 'bandpass';
    kb.frequency.value = (onPlatform ? 520 : 780) * pitch;
    kb.Q.value = 2.2;
    const kg = ctx.createGain();
    pluck(kg, t + 0.002, 0.5 * level, 0.055);
    knock.connect(kb).connect(kg).connect(pan);
    knock.start(t, r() * 2, 0.1);

    // Body thump: low sine dropping in pitch (the step through the floor / chest).
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const f0 = (onPlatform ? 85 : 118) * pitch;
    thump.frequency.setValueAtTime(f0, t);
    thump.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.09);
    const tg = ctx.createGain();
    pluck(tg, t, 0.42 * level, 0.13, 0.002);
    thump.connect(tg).connect(pan);
    thump.start(t);
    thump.stop(t + 0.25);

    click.onended = () => {
      click.disconnect();
      hp.disconnect();
      bp.disconnect();
      cg.disconnect();
      knock.disconnect();
      kb.disconnect();
      kg.disconnect();
      thump.disconnect();
      tg.disconnect();
      pan.disconnect();
      mix.disconnect();
      sendG.disconnect();
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------------------------------------------------

  /** `tock` = the softer half-second event (second hand snapping back). */
  private clockTick(when: number, tock: boolean): void {
    const bus = this.bus;
    const out = this.clockOut;
    if (!bus || !out) return;
    const { ctx } = bus;
    const n = ctx.createBufferSource();
    n.buffer = bus.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = tock ? 1800 : 3600;
    bp.Q.value = tock ? 1.4 : 2.2;
    const g = ctx.createGain();
    pluck(g, when, tock ? 0.16 : 0.34, tock ? 0.022 : 0.016);
    n.connect(bp).connect(g).connect(out);
    n.start(when, Math.random() * 2, 0.05);

    // Metallic ring of the escapement.
    const ring = ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.value = tock ? 1150 : 2350;
    const rg = ctx.createGain();
    pluck(rg, when, tock ? 0.05 : 0.11, tock ? 0.05 : 0.07);
    ring.connect(rg).connect(out);
    ring.start(when);
    ring.stop(when + 0.12);

    // Little wooden-case body knock.
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.value = tock ? 210 : 320;
    const bg = ctx.createGain();
    pluck(bg, when, tock ? 0.07 : 0.1, 0.03);
    body.connect(bg).connect(out);
    body.start(when);
    body.stop(when + 0.08);

    n.onended = () => {
      n.disconnect();
      bp.disconnect();
      g.disconnect();
      ring.disconnect();
      rg.disconnect();
      body.disconnect();
      bg.disconnect();
    };
  }

  /** Called every frame with the visual time: tick at every integer second, tock at +0.5 s. Never drifts. */
  private scheduleClock(time: number): void {
    const bus = this.bus;
    if (!bus || !this.started) return;
    const now = bus.ctx.currentTime;
    const idxNow = Math.floor(time * 2);
    if (this.lastSecondHalf < 0) {
      this.lastSecondHalf = idxNow; // do not replay the past
      return;
    }
    // Fire every half-second boundary that this frame crossed (normally 0 or 1), aligned to the visual time.
    for (let i = this.lastSecondHalf + 1; i <= idxNow; i++) {
      const eventTime = i / 2;
      const when = now + Math.max(0, eventTime - time);
      this.clockTick(when, i % 2 === 1);
    }
    this.lastSecondHalf = idxNow;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Phase 4 one-shots (STUB no-ops — implemented by Phase 4A)
  // -------------------------------------------------------------------------------------------------------------------

  /** Positional one-shot output: HRTF panner at `pos` feeding the dry bus and (scaled) the hall reverb. */
  private oneShotOut(bus: Bus, pos: THREE.Vector3, refDistance: number, reverbSend: number): GainNode {
    const { ctx } = bus;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = 1.2;
    p.maxDistance = 300;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
    }
    const input = ctx.createGain();
    input.connect(p);
    p.connect(bus.dry);
    const sg = ctx.createGain();
    sg.gain.value = reverbSend;
    p.connect(sg).connect(bus.send);
    return input;
  }

  /** Concierge brass service bell: a struck bell, inharmonic partials, thrown hard into the hall. */
  bell(): void {
    const bus = this.bus;
    if (!bus || !this.started) return;
    const { ctx } = bus;
    const t = ctx.currentTime + 0.005;
    const r = Math.random;
    const f0 = 1620 + r() * 380; // small desk bell
    const out = this.oneShotOut(bus, new THREE.Vector3(...CONCIERGE.bell), 2.5, 2.4);

    // Struck partials (hemispherical bell: ~1 : 2.76 : 5.4 : 8.9), higher ones die faster. Each pair is slightly
    // detuned so the bell has the gentle beating shimmer of real brass.
    const partials: ReadonlyArray<readonly [ratio: number, level: number, decay: number]> = [
      [1, 0.32, 2.7],
      [2.76, 0.2, 1.7],
      [5.4, 0.11, 0.9],
      [8.93, 0.045, 0.45],
    ];
    for (const [ratio, level, decay] of partials) {
      for (const detune of [1, 1.0045]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f0 * ratio * detune;
        const g = ctx.createGain();
        pluck(g, t, level * 0.55, decay, 0.0012);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + decay + 0.2);
      }
    }
    // Strike transient: a tiny bright tick (clapper on brass).
    const tick = ctx.createBufferSource();
    tick.buffer = bus.white;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const tg = ctx.createGain();
    pluck(tg, t, 0.22, 0.012, 0.0005);
    tick.connect(hp).connect(tg).connect(out);
    tick.start(t, r() * 2, 0.04);
  }

  /** Ticket collected: soft paper slide (filtered noise sweep) then a muffled rubber-stamp thump. */
  ticket(): void {
    const bus = this.bus;
    if (!bus || !this.started) return;
    const { ctx } = bus;
    const t = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(bus.dry);
    const sg = ctx.createGain();
    sg.gain.value = 0.45;
    out.connect(sg).connect(bus.send);

    // Paper slide: bandpassed noise whose centre rises, with a soft swell and a faint dry "fibre" high band.
    const paper = ctx.createBufferSource();
    paper.buffer = bus.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(1100, t);
    bp.frequency.exponentialRampToValueAtTime(3600, t + 0.34);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.00001, t);
    pg.gain.linearRampToValueAtTime(0.2, t + 0.09);
    pg.gain.linearRampToValueAtTime(0.14, t + 0.24);
    pg.gain.exponentialRampToValueAtTime(0.00001, t + 0.4);
    paper.connect(bp).connect(pg).connect(out);
    paper.start(t, Math.random() * 2, 0.45);

    // Stamp: low rubber thump + a dull, low-passed "pad on paper" noise burst.
    const ts = t + 0.46;
    const th = ctx.createOscillator();
    th.type = 'sine';
    th.frequency.setValueAtTime(150, ts);
    th.frequency.exponentialRampToValueAtTime(58, ts + 0.12);
    const thg = ctx.createGain();
    pluck(thg, ts, 0.5, 0.16, 0.003);
    th.connect(thg).connect(out);
    th.start(ts);
    th.stop(ts + 0.25);
    const pad = ctx.createBufferSource();
    pad.buffer = bus.white;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    const pdg = ctx.createGain();
    pluck(pdg, ts, 0.38, 0.07, 0.002);
    pad.connect(lp).connect(pdg).connect(out);
    pad.start(ts, Math.random() * 2, 0.12);
  }

  /** Gate paddles: a short pneumatic swish and a soft mechanical clunk, positional. */
  gate(position: THREE.Vector3, open: boolean): void {
    const bus = this.bus;
    if (!bus || !this.started) return;
    const { ctx } = bus;
    const t = ctx.currentTime + 0.005;
    const out = this.oneShotOut(bus, position, 3, 0.7);

    const air = ctx.createBufferSource();
    air.buffer = bus.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    const [f1, f2] = open ? [900, 2600] : [2400, 800];
    bp.frequency.setValueAtTime(f1, t);
    bp.frequency.exponentialRampToValueAtTime(f2, t + 0.26);
    const ag = ctx.createGain();
    ag.gain.setValueAtTime(0.00001, t);
    ag.gain.linearRampToValueAtTime(0.22, t + 0.06);
    ag.gain.exponentialRampToValueAtTime(0.00001, t + 0.3);
    air.connect(bp).connect(ag).connect(out);
    air.start(t, Math.random() * 2, 0.35);

    // Clunk when the paddles reach their stops: opening = end of the swing, closing = end of the swing too.
    const tc = t + 0.24;
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(open ? 130 : 105, tc);
    body.frequency.exponentialRampToValueAtTime(60, tc + 0.1);
    const bg = ctx.createGain();
    pluck(bg, tc, 0.32, 0.12, 0.002);
    body.connect(bg).connect(out);
    body.start(tc);
    body.stop(tc + 0.2);
    const click = ctx.createBufferSource();
    click.buffer = bus.white;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    const cg = ctx.createGain();
    pluck(cg, tc, 0.2, 0.03, 0.001);
    click.connect(lp).connect(cg).connect(out);
    click.start(tc, Math.random() * 2, 0.05);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Trains, listener, update
  // -------------------------------------------------------------------------------------------------------------------

  createTrainVoice(obj: THREE.Object3D): TrainVoice {
    const v = new Voice(this, obj);
    this.voices.add(v);
    if (this.bus && this.started) v.attach(this.bus);
    return v;
  }

  removeVoice(v: Voice): void {
    this.voices.delete(v);
  }

  update(f: FrameInfo): void {
    const bus = this.bus;
    if (!bus || !this.started) return;
    const ctx = bus.ctx;
    const cam = f.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(this.listenerPos);
    cam.getWorldDirection(this.fwd);
    this.up.set(0, 1, 0).applyQuaternion(cam.quaternion);

    const l = ctx.listener;
    const p = this.listenerPos;
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = this.fwd.x;
      l.forwardY.value = this.fwd.y;
      l.forwardZ.value = this.fwd.z;
      l.upX.value = this.up.x;
      l.upY.value = this.up.y;
      l.upZ.value = this.up.z;
    } else {
      const lg = l as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
      };
      lg.setPosition(p.x, p.y, p.z);
      lg.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
    }

    this.scheduleClock(f.time);
    for (const v of this.voices) {
      v.attach(bus);
      v.update(f.dt, this.listenerPos);
    }
  }
}

export function createAudioEngine(_camera: THREE.PerspectiveCamera, options?: AudioEngineOptions): AudioEngine {
  // The listener follows FrameInfo.camera each frame (same camera); the constructor argument is kept for the contract.
  return new Engine(options);
}
