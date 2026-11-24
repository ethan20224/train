// Metro timetable: per-train state machine + seeded scheduler + event bus. Pure (no three.js, no DOM).
// Independent of the mainline train system. Drive it with update(simDt) (sim time, so ?timescale works).
import { METRO_TRAIN } from '../layoutMetro';
import { TRACKS, type LineId, type MetroTrack } from './tracks';

export const TIMING = {
  cruise: 20,                 // m/s
  decel: 1.0,                 // m/s^2 peak (comfort)
  jerk: 0.6,                  // m/s^3
  spawnClearance: 250,        // m between a portal and the nearest train end at spawn / despawn
  doorOpenDelay: 1.0,         // s after arrival until the doors start opening
  doorAnim: 1.5,              // s to open or close fully
  dwellMin: 20, dwellMax: 30, // s from arrival to departure
  doorsClosedBeforeDeparture: 3.0, // doors are fully closed this long before departure
  headwayMin: 60, headwayMax: 150, // s between spawns on one track
  maxTrains: 4,               // present at once (moving or stopped): bounds moving trains too
  firstArrivalMax: 32,        // s: bound from enteredDeep() to the first arrival (see enteredDeep)
} as const;

export type MetroPhase = 'approaching' | 'stopped' | 'departing' | 'gone';
export interface TrainState {
  readonly id: number;
  readonly line: LineId;
  readonly track: 0 | 1;
  /** Train-centre position along the track (m); 0 = platform centre. */
  readonly s: number;
  readonly v: number;
  readonly phase: MetroPhase;
  /** 0 closed .. 1 open (smooth). */
  readonly doors01: number;
  /** Seconds until the train stops at the platform (approaching only, else 0). */
  readonly eta: number;
}
export type MetroEventType = 'approaching' | 'arrived' | 'doorsOpen' | 'doorsClosed' | 'departing' | 'gone';
export interface MetroEvent { readonly type: MetroEventType; readonly train: TrainState; /** sim time of the event (s) */ readonly t: number; /** approaching only */ readonly eta?: number }
export interface Timetable {
  subscribe(fn: (e: MetroEvent) => void): () => void;
  trains(): readonly TrainState[];
  update(dt: number): void;
  /** Call once when DepthLook.airlock.zone first becomes 'deep'. */
  enteredDeep(): void;
  readonly time: number;
  /** Independent copy (same state, same PRNG position); advancing it never touches this timetable. */
  fork(): Timetable;
  /**
   * Seconds until the next train stops on this track: 0 while one stands in, the exact eta of one that is approaching, otherwise a
   * lookahead from a forked timetable (refreshed every few simulated seconds). Null only if none arrives within the lookahead bound.
   */
  nextArrivalIn(line: LineId, track: 0 | 1): number | null;
}

/** Lookahead tuning: fork step (s), how far ahead to look (s), how often the forecast is recomputed (simulated s). */
export const FORECAST = { step: 0.5, horizon: 420, refresh: 4 } as const;

interface TimetableSnapshot { rnd: number; live: unknown[]; nextSpawn: number[]; time: number; nextId: number }

// ---- jerk-limited brake profile: v0 -> 0, peak decel a, jerk j (closed-form, three segments) ----
const { cruise: V0, decel: A, jerk: J } = TIMING;
const T1 = A / J, T2 = (V0 - (A * A) / J) / A;
export const BRAKE_TIME = 2 * T1 + T2;
const SEGS: ReadonlyArray<readonly [number, number]> = [[T1, -J], [T2, 0], [T1, J]];
/** Distance and speed after t seconds of braking from cruise. */
function brake(t: number): { s: number; v: number } {
  if (t >= BRAKE_TIME) return { s: BRAKE_DIST, v: 0 };
  let s = 0, v = V0, a = 0, left = Math.max(0, t);
  for (const [dur, jk] of SEGS) {
    const d = Math.min(left, dur);
    s += v * d + (a * d * d) / 2 + (jk * d * d * d) / 6;
    v += a * d + (jk * d * d) / 2; a += jk * d; left -= d;
    if (left <= 0) break;
  }
  return { s, v: Math.max(0, v) };
}
function brakeDistance(): number {
  let s = 0, v = V0, a = 0;
  for (const [dur, jk] of SEGS) { s += v * dur + (a * dur * dur) / 2 + (jk * dur * dur * dur) / 6; v += a * dur + (jk * dur * dur) / 2; a += jk * dur; }
  return s;
}
export const BRAKE_DIST = brakeDistance();

// ---- seeded PRNG (mulberry32) ----
interface Prng { (): number; get(): number; set(v: number): void }
function prng(seed: number): Prng {
  let a = seed >>> 0;
  const f = ((): number => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }) as Prng;
  f.get = () => a;
  f.set = (v: number) => { a = v >>> 0; };
  return f;
}
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

interface Train { id: number; trackIdx: number; tr: MetroTrack; phase: MetroPhase; s: number; v: number; doors01: number; mode: 'cruise' | 'brake'; tB: number; tS: number; dwell: number; openFired: boolean; closedFired: boolean; tD: number }

const L = METRO_TRAIN.length;

export function createTimetable(opts: { seed?: number; restore?: TimetableSnapshot } = {}): Timetable {
  const rnd = prng(opts.seed ?? 1);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const listeners = new Set<(e: MetroEvent) => void>();
  const live: Train[] = [];
  let snapshot: TrainState[] = [];
  let time = 0, nextId = 1;
  const trackIndex = (line: LineId, track: 0 | 1): number => TRACKS.findIndex((t) => t.line === line && t.track === track);
  const nextSpawn = TRACKS.map(() => between(2, TIMING.headwayMin));
  if (opts.restore) {
    const r = opts.restore;
    rnd.set(r.rnd);
    for (const t of r.live as Train[]) live.push({ ...t });
    r.nextSpawn.forEach((v, i) => { nextSpawn[i] = v; });
    time = r.time; nextId = r.nextId;
  }

  const state = (t: Train): TrainState => ({
    id: t.id, line: t.tr.line, track: t.tr.track, s: t.s, v: t.v, phase: t.phase, doors01: t.doors01,
    eta: t.phase === 'approaching' ? (t.mode === 'cruise' ? (-BRAKE_DIST - t.s) / V0 + BRAKE_TIME : BRAKE_TIME - t.tB) : 0,
  });
  const emit = (type: MetroEventType, t: Train, at: number, withEta = false): void => {
    if (!listeners.size) return;
    const train = state(t); const e: MetroEvent = withEta ? { type, train, t: at, eta: train.eta } : { type, train, t: at };
    for (const fn of listeners) fn(e);
  };

  const canSpawn = (idx: number): boolean => {
    if (live.length >= TIMING.maxTrains) return false;
    // a train still approaching or standing on this track blocks it (no overlap at the platform)
    return !live.some((t) => t.trackIdx === idx && (t.phase === 'approaching' || t.phase === 'stopped'));
  };
  const spawn = (idx: number): void => {
    const tr = TRACKS[idx]!;
    const t: Train = { id: nextId++, trackIdx: idx, tr, phase: 'approaching', s: -(tr.portalIn + TIMING.spawnClearance) - L / 2, v: V0, doors01: 0, mode: 'cruise', tB: 0, tS: 0, dwell: between(TIMING.dwellMin, TIMING.dwellMax), openFired: false, closedFired: false, tD: 0 };
    live.push(t);
    nextSpawn[idx] = time + between(TIMING.headwayMin, TIMING.headwayMax);
    emit('approaching', t, time, true);
  };

  /** Advance one train by dt; `base` is the sim time at the start of this step. Returns false when it despawns. */
  const step = (t: Train, dt: number, base: number): boolean => {
    let rem = dt;
    while (rem > 1e-12) {
      const now = base + (dt - rem);
      if (t.phase === 'approaching') {
        if (t.mode === 'cruise') {
          const toBrake = (-BRAKE_DIST - t.s) / V0;
          if (rem < toBrake) { t.s += V0 * rem; rem = 0; break; }
          t.s = -BRAKE_DIST; rem -= Math.max(0, toBrake); t.mode = 'brake'; t.tB = 0;
        } else {
          const left = BRAKE_TIME - t.tB;
          if (rem < left) { t.tB += rem; const b = brake(t.tB); t.s = -BRAKE_DIST + b.s; t.v = b.v; rem = 0; break; }
          rem -= left; t.s = 0; t.v = 0; t.phase = 'stopped'; t.tS = 0; emit('arrived', t, now + left);
        }
      } else if (t.phase === 'stopped') {
        const openAt = TIMING.doorOpenDelay, closeEnd = t.dwell - TIMING.doorsClosedBeforeDeparture, closeStart = closeEnd - TIMING.doorAnim;
        const next = t.tS < openAt ? openAt : !t.closedFired && t.tS < closeEnd ? closeEnd : t.dwell;
        const d = Math.min(rem, Math.max(0, next - t.tS));
        t.tS += d; rem -= d;
        const at = base + (dt - rem);
        if (t.tS >= openAt && !t.openFired) { t.openFired = true; emit('doorsOpen', t, at); }
        t.doors01 = t.tS < openAt ? 0 : t.tS < closeStart ? smooth((t.tS - openAt) / TIMING.doorAnim) : t.tS < closeEnd ? 1 - smooth((t.tS - closeStart) / TIMING.doorAnim) : 0;
        if (t.tS >= closeEnd && !t.closedFired) { t.closedFired = true; t.doors01 = 0; emit('doorsClosed', t, at); }
        if (t.tS >= t.dwell) { t.phase = 'departing'; t.tD = 0; emit('departing', t, at); }
        else if (d === 0 && rem > 0) break;
      } else if (t.phase === 'departing') {
        t.tD += rem; rem = 0;
        if (t.tD < BRAKE_TIME) { const b = brake(BRAKE_TIME - t.tD); t.s = BRAKE_DIST - b.s; t.v = b.v; }
        else { t.s = BRAKE_DIST + V0 * (t.tD - BRAKE_TIME); t.v = V0; }
        if (t.s - L / 2 >= t.tr.portalOut + TIMING.spawnClearance) { t.phase = 'gone'; emit('gone', t, base + dt); return false; }
      } else return false;
    }
    return true;
  };

  if (opts.restore) snapshot = live.map(state);

  const fork = (): Timetable => createTimetable({
    seed: opts.seed,
    restore: { rnd: rnd.get(), live: live.map((t) => ({ ...t })), nextSpawn: [...nextSpawn], time, nextId },
  });
  let forecast: { at: number; arrivals: Array<number | null> } = { at: -1e9, arrivals: TRACKS.map(() => null) };
  const refreshForecast = (): void => {
    const f = fork();
    const arrivals: Array<number | null> = TRACKS.map(() => null);
    f.subscribe((e) => {
      if (e.type !== 'arrived') return;
      const i = trackIndex(e.train.line, e.train.track);
      if (arrivals[i] === null) arrivals[i] = e.t;
    });
    for (let t = 0; t < FORECAST.horizon && arrivals.some((a) => a === null); t += FORECAST.step) f.update(FORECAST.step);
    forecast = { at: time, arrivals };
  };

  return {
    fork,
    nextArrivalIn(line, track) {
      const idx = trackIndex(line, track);
      let eta: number | null = null;
      for (const t of live) {
        if (t.trackIdx !== idx) continue;
        if (t.phase === 'stopped') return 0;
        if (t.phase === 'approaching') { const e = state(t).eta; if (eta === null || e < eta) eta = e; }
      }
      if (eta !== null) return eta;
      if (time - forecast.at >= FORECAST.refresh) refreshForecast();
      const a = forecast.arrivals[idx];
      return a === null || a === undefined ? null : Math.max(0, a - time);
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    trains: () => snapshot,
    get time() { return time; },
    update(dt) {
      if (dt <= 0) return;
      const base = time;
      for (let i = live.length - 1; i >= 0; i--) if (!step(live[i]!, dt, base)) live.splice(i, 1);
      time = base + dt;
      // spawn the most overdue tracks first; deferred spawns keep their due time and retry next tick
      const due = TRACKS.map((_, i) => i).filter((i) => nextSpawn[i]! <= time).sort((a, b) => nextSpawn[a]! - nextSpawn[b]!);
      for (const i of due) if (canSpawn(i)) spawn(i);
      snapshot = live.map(state);
    },
    /**
     * The simulation always runs; this guarantees something is arriving once the player reaches the
     * cavern. If no train is approaching, spawn one at once on the most overdue track. Trains spawn
     * >= 250 m outside the portal (in tunnel darkness) so the soonest possible arrival is ~28 s
     * (TIMING.firstArrivalMax), not the spec's ~10 s, unless a train was already approaching.
     */
    enteredDeep() {
      if (live.some((t) => t.phase === 'approaching')) return;
      const order = TRACKS.map((_, i) => i).sort((a, b) => nextSpawn[a]! - nextSpawn[b]!);
      for (const i of order) if (canSpawn(i)) { spawn(i); break; }
      snapshot = live.map(state);
    },
  };
}
