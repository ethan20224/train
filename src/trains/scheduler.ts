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

/** A ticket-reserved train dwells this long (s). */
const RESERVED_DWELL = 90;
/** A requested train begins its braking (arrival) this many seconds after the request (it is spawned in the fog). */
const REQUEST_ARRIVAL_DELAY = 7;

/**
 * Phase 4: ticket-driven control of the scheduler. Set by buildTrains(); methods are safe no-ops before that.
 * Track indices are indices into TRACKS.
 */
export interface TrainControl {
  /** Tracks with no train present (arriving, dwelling or departing) and no reservation. */
  freeTracks(): number[];
  /** Tracks whose train is stopped or braking (a fallback when no slot is free for a new train). */
  occupiedTracks(): number[];
  /** True if a free pool slot exists to spawn a train. */
  hasFreeSlot(): boolean;
  /** Reserve the track: extend its dwelling train, or spawn one that arrives promptly. Returns false if impossible. */
  requestTrain(track: number): boolean;
  /** Currently reserved track indices. */
  reservedTracks(): number[];
  /** Phase 4D: read-only per-track state, one entry per TRACKS index (reused buffer, no allocation). */
  trackStates(): TrackState[];
}
export const trainControl: TrainControl = {
  freeTracks: () => [],
  occupiedTracks: () => [],
  hasFreeSlot: () => false,
  requestTrain: () => false,
  reservedTracks: () => [],
  trackStates: () => [],
};

/** Phase 4D: read-only per-track train state (index = TRACKS index). The returned array and its entries are reused; do not retain. */
export interface TrackState {
  track: number;
  /** null when no train is on this track. */
  phase: Phase | null;
  /** Seconds elapsed in the current phase. */
  t: number;
  /** Total dwell duration of the current train (s). */
  dwell: number;
  nose: number;
  speed: number;
}

export type Phase = 'cruiseIn' | 'brake' | 'dwell' | 'accel' | 'cruiseOut';

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
  /** Reserved by a ticket: keeps its track, dwells RESERVED_DWELL s. */
  reserved: boolean;
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
    slots.push({ root: holder, anchor, model, voice: null, active: false, track: null, t: 0, phase: 'cruiseIn', v0: 22, brakeTime: 0, dwell: 30, cruiseInTime: 0, speed: 0, nose: 0, reserved: false });
  }

  let nextArrival = FIRST_ARRIVAL;
  let lastTrack: TrackDef | null = null;
  let livery = 0;

  const freeTrack = (): TrackDef | null => {
    const used = new Set(slots.filter((s) => s.active).map((s) => s.track));
    const free = TRACKS.filter((t) => !used.has(t) && !slots.some((s) => s.reserved && s.track === t));
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

  /** Debug / test counters, exposed through window.__meridian.trains (see main.ts). */
  const stats = { spawns: 0, despawns: 0, voicesCreated: 0, voicesDisposed: 0 };

  const deactivate = (s: Slot): void => {
    if (s.voice) stats.voicesDisposed++;
    stats.despawns++;
    s.voice?.dispose();
    s.voice = null;
    s.active = false;
    s.track = null;
    s.reserved = false;
    s.root.visible = false;
  };

  const activate = (s: Slot, track: TrackDef, opts: { phase?: Phase; t?: number; dwell?: number } = {}): void => {
    s.active = true;
    s.track = track;
    s.v0 = rand(21, 23.5);
    s.brakeTime = (2 * BRAKE_DIST) / s.v0;
    s.cruiseInTime = (TRAIN_ROUTE.spawnZ - (RAIL.trainStopNoseZ + BRAKE_DIST)) / s.v0;
    s.dwell = opts.dwell ?? rand(25, 40);
    s.reserved = false;
    s.phase = opts.phase ?? 'cruiseIn';
    s.t = opts.t ?? 0;
    setLivery(s.model, livery++);
    s.root.visible = true;
    s.root.position.x = track.centerX;
    s.voice = ctx.audio.createTrainVoice(s.anchor);
    stats.voicesCreated++;
    stats.spawns++;
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

  const trackIndex = (t: TrackDef | null): number => (t ? TRACKS.indexOf(t) : -1);

  trainControl.freeTracks = () =>
    TRACKS.map((_, i) => i).filter((i) => !slots.some((s) => s.active && trackIndex(s.track) === i));
  trainControl.occupiedTracks = () =>
    slots.filter((s) => s.active && (s.phase === 'dwell' || s.phase === 'brake')).map((s) => trackIndex(s.track));
  trainControl.hasFreeSlot = () => slots.some((s) => !s.active);
  const stateBuf: TrackState[] = TRACKS.map((_, i) => ({ track: i, phase: null, t: 0, dwell: 0, nose: 0, speed: 0 }));
  trainControl.trackStates = () => {
    for (const st of stateBuf) {
      st.phase = null;
      st.t = st.dwell = st.nose = st.speed = 0;
    }
    for (const x of slots) {
      if (!x.active) continue;
      const st = stateBuf[trackIndex(x.track)];
      if (!st) continue;
      st.phase = x.phase;
      st.t = x.t;
      st.dwell = x.dwell;
      st.nose = x.nose;
      st.speed = x.speed;
    }
    return stateBuf;
  };
  trainControl.reservedTracks = () => slots.filter((s) => s.active && s.reserved).map((s) => trackIndex(s.track));
  trainControl.requestTrain = (track: number): boolean => {
    const def = TRACKS[track];
    if (!def) return false;
    // A new ticket replaces the old reservation (that train just keeps its current dwell).
    const onTrack = slots.find((s) => s.active && s.track === def);
    for (const s of slots) if (s !== onTrack) s.reserved = false;
    if (onTrack) {
      onTrack.reserved = true;
      if (onTrack.phase === 'dwell') onTrack.dwell = Math.max(onTrack.dwell, onTrack.t + RESERVED_DWELL);
      else if (onTrack.phase === 'brake' || onTrack.phase === 'cruiseIn') {
        onTrack.dwell = RESERVED_DWELL;
        // A train still in the far haze is brought closer (invisible in the fog) so it arrives promptly.
        if (onTrack.phase === 'cruiseIn') onTrack.t = Math.max(onTrack.t, onTrack.cruiseInTime - REQUEST_ARRIVAL_DELAY);
      } else return false; // already leaving: cannot be held
      return true;
    }
    let slot = slots.find((s) => !s.active);
    if (!slot) {
      // Pool exhausted: recycle a train that is already departing far away in the fog.
      slot = slots.find((s) => s.active && s.phase === 'cruiseOut' && s.nose > 500);
      if (slot) deactivate(slot);
    }
    if (!slot) return false;
    activate(slot, def, { phase: 'cruiseIn', t: 0, dwell: RESERVED_DWELL });
    // Spawn nearer than TRAIN_ROUTE.spawnZ: braking begins REQUEST_ARRIVAL_DELAY s from now (still ~800 m out, in fog).
    slot.t = Math.max(0, slot.cruiseInTime - REQUEST_ARRIVAL_DELAY);
    evaluate(slot);
    slot.root.position.z = slot.nose;
    slot.reserved = true;
    return true;
  };

  window.__meridian.trains = () => ({
    ...stats,
    reserved: trainControl.reservedTracks().map((i) => TRACKS[i]?.id),
    trains: slots.map((s, i) => ({
      slot: i,
      active: s.active,
      track: s.track?.id ?? null,
      phase: s.phase,
      noseZ: s.nose,
      speed: s.speed,
      visible: s.root.visible,
      reserved: s.reserved,
    })),
  });

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
