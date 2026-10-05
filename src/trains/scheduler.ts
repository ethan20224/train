import * as THREE from 'three';
import type { BuildContext, FrameInfo, TrainVoice, WorldModule } from '../core/types';
import { RAIL, TRACKS, TRAIN_ROUTE, type TrackDef } from '../layout';
import { buildTrainModel, setLivery, LIVERY_COUNT } from './trainModel';

/**
 * Arrive / dwell / depart state machine. Every position is evaluated analytically from a smootherstep
 * velocity profile (C2: zero acceleration and zero jerk at the ends), so motion is jitter-free and the nose
 * stops at exactly RAIL.trainStopNoseZ.
 */
const POOL = 4;
const BRAKE_DIST = 500; // m of deceleration, ~0.9 m/s^2 peak at 22 m/s
const ACCEL_TIME = 40; // s
const FIRST_ARRIVAL = 6; // s after load
const VOICE_ANCHOR_Z = 18; // roughly the cab / locomotive

type Phase = 'cruiseIn' | 'brake' | 'dwell' | 'accel' | 'cruiseOut';

/** Smootherstep and its integral. */
const sstep = (u: number): number => u * u * u * (10 + u * (-15 + 6 * u));
const sstepInt = (u: number): number => u ** 4 * (2.5 + u * (-3 + u));

interface Slot {
  root: THREE.Group;
  anchor: THREE.Object3D;
  model: THREE.Group;
  voice: TrainVoice | null;
  active: boolean;
  track: TrackDef | null;
  t: number;
  phase: Phase;
  v0: number;
  brakeTime: number;
  dwell: number;
  cruiseInTime: number;
  speed: number;
  nose: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export async function buildTrains(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'trains';
  const screenshotMode = new URLSearchParams(window.location.search).has('cam');


  const slots: Slot[] = [];
  for (let i = 0; i < POOL; i++) {
    const model = buildTrainModel(ctx, i % LIVERY_COUNT);
    const holder = new THREE.Group();
    holder.name = `train-${i}`;
    holder.add(model);
    const anchor = new THREE.Object3D();
    anchor.name = 'voiceAnchor';
    anchor.position.set(0, 1, VOICE_ANCHOR_Z);
    holder.add(anchor);
    // Parked far in the haze but visible until finalize(): the one-time shader compile must see these materials.
    holder.position.set(0, 0, TRAIN_ROUTE.despawnZ + 200);
    root.add(holder);
    slots.push({ root: holder, anchor, model, voice: null, active: false, track: null, t: 0, phase: 'cruiseIn', v0: 22, brakeTime: 0, dwell: 30, cruiseInTime: 0, speed: 0, nose: 0 });
  }

  let nextArrival = FIRST_ARRIVAL;
  let lastTrack: TrackDef | null = null;
  let livery = 0;

  const freeTrack = (): TrackDef | null => {
    const used = new Set(slots.filter((s) => s.active).map((s) => s.track));
    const free = TRACKS.filter((t) => !used.has(t));
    if (free.length === 0) return null;
    const pool = free.length > 1 ? free.filter((t) => t !== lastTrack) : free;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  };

  const evaluate = (s: Slot): void => {
    const stop = RAIL.trainStopNoseZ;
    if (s.phase === 'cruiseIn') {
      s.nose = TRAIN_ROUTE.spawnZ - s.v0 * s.t;
      s.speed = s.v0;
      if (s.t >= s.cruiseInTime) {
        s.phase = 'brake';
        s.t -= s.cruiseInTime;
        s.voice?.brake();
      }
    }
    if (s.phase === 'brake') {
      const u = Math.min(1, s.t / s.brakeTime);
      s.nose = stop + BRAKE_DIST - s.v0 * s.brakeTime * (u - sstepInt(u));
      s.speed = s.v0 * (1 - sstep(u));
      if (s.t >= s.brakeTime) {
        s.phase = 'dwell';
        s.t -= s.brakeTime;
      }
    }
    if (s.phase === 'dwell') {
      s.nose = stop;
      s.speed = 0;
      if (s.t >= s.dwell) {
        s.phase = 'accel';
        s.t -= s.dwell;
        s.voice?.depart();
      }
    }
    if (s.phase === 'accel') {
      const u = Math.min(1, s.t / ACCEL_TIME);
      s.nose = stop + s.v0 * ACCEL_TIME * sstepInt(u);
      s.speed = s.v0 * sstep(u);
      if (s.t >= ACCEL_TIME) {
        s.phase = 'cruiseOut';
        s.t -= ACCEL_TIME;
      }
    }
    if (s.phase === 'cruiseOut') {
      s.nose = stop + (s.v0 * ACCEL_TIME) / 2 + s.v0 * s.t;
      s.speed = s.v0;
    }
  };

  const deactivate = (s: Slot): void => {
    s.voice?.dispose();
    s.voice = null;
    s.active = false;
    s.track = null;
    s.root.visible = false;
  };

  const activate = (s: Slot, track: TrackDef, opts: { phase?: Phase; t?: number; dwell?: number } = {}): void => {
    s.active = true;
    s.track = track;
    s.v0 = rand(21, 23.5);
    s.brakeTime = (2 * BRAKE_DIST) / s.v0;
    s.cruiseInTime = (TRAIN_ROUTE.spawnZ - (RAIL.trainStopNoseZ + BRAKE_DIST)) / s.v0;
    s.dwell = opts.dwell ?? rand(25, 40);
    s.phase = opts.phase ?? 'cruiseIn';
    s.t = opts.t ?? 0;
    setLivery(s.model, livery++);
    s.root.visible = true;
    s.root.position.x = track.centerX;
    s.voice = ctx.audio.createTrainVoice(s.anchor);
    if (s.phase === 'brake') s.voice.brake();
    evaluate(s);
    s.root.position.z = s.nose;
    s.voice.setSpeed(s.speed);
    lastTrack = track;
  };

  if (screenshotMode) {
    // Screenshots: platform 3 already dwelling (long, so it is still there), platform 5 mid-deceleration.
    const t3 = TRACKS.find((t) => t.id === 'T3');
    const t5 = TRACKS.find((t) => t.id === 'T5');
    const a = slots[0];
    const b = slots[1];
    if (t3 && a) activate(a, t3, { phase: 'dwell', t: 1, dwell: 150 });
    if (t5 && b) {
      const v = 22;
      activate(b, t5, { phase: 'brake', t: ((2 * BRAKE_DIST) / v) * 0.5 });
    }
    nextArrival = 70;
  }

  return {
    name: 'trains',
    object: root,
    finalize() {
      for (const s of slots) if (!s.active) s.root.visible = false;
    },
    update(f: FrameInfo) {
      const dt = f.dt;
      nextArrival -= dt;
      if (nextArrival <= 0) {
        const free = slots.find((s) => !s.active);
        const track = free ? freeTrack() : null;
        if (free && track) {
          activate(free, track);
          nextArrival = rand(45, 90);
        } else nextArrival = 5;
      }
      for (const s of slots) {
        if (!s.active) continue;
        s.t += dt;
        evaluate(s);
        s.root.position.z = s.nose;
        s.voice?.setSpeed(s.speed);
        if (s.phase === 'cruiseOut' && s.nose > TRAIN_ROUTE.despawnZ) deactivate(s);
      }
    },
  };
}
