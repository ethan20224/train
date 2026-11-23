// P4-3 Arrival choreography: PSD door-sync remapping, 12-bore tunnel light-wave & departure wake, and transom display text.
// Pure (no three.js, no DOM) so every timing and alignment invariant is tested in Node.
import { METRO_TRAIN, PORTAL } from '../layoutMetro';
import { destinationOf, lineLabelOf } from './network';
import { BRAKE_DIST, BRAKE_TIME, TIMING, type TrainState } from './timetable';
import { doorOffsets, TRACKS, trackOf, type LineId, type MetroTrack } from './tracks';

const HALF_LEN = METRO_TRAIN.length / 2;
const DEFAULT_DOOR_OFFSETS = doorOffsets();

/** Opening lag / closing lead of platform screen doors relative to car doors (seconds). */
export const PSD_DOOR_OFFSET_SEC = 0.3;
const PSD_LAG_FRAC = PSD_DOOR_OFFSET_SEC / TIMING.doorAnim; // 0.3 / 1.5 = 0.2

/** Tunnel arrival light-wave constants. */
export const WAVE_LEAD_SEC = 4.0;          // crest hits bore mouth 4 s before the train nose
export const WAVE_SPEED_MPS = 36.0;        // travelling speed down the bore (6 segments/s)
export const WAVE_AFTERGLOW_SEC = 2.0;     // afterglow decays over ~2 s
export const DEPARTURE_WAKE_PEAK = 0.40;   // departure wake peak intensity (~40 %)
export const RING_FIRST_DEPTH = 3.0;
export const RING_PITCH = PORTAL.ringPitch; // 6.0 m

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const smooth = (x: number): number => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};

// ---- 1. Screen door timing & alignment (Ruling 30: remap timetable doors01, no timetable changes) ----

/** Exact analytic inverse of smoothstep(u) = 3u^2 - 2u^3 for doors01 in [0, 1]. */
export function recoverDoorLinearRamp(doors01: number): number {
  if (doors01 <= 0) return 0;
  if (doors01 >= 1) return 1;
  const arg = clamp(1 - 2 * doors01, -1, 1);
  return clamp(0.5 - Math.sin(Math.asin(arg) / 3), 0, 1);
}

/**
 * Remaps the train's smoothed `doors01` to the platform screen doors:
 * opens 0.3 s AFTER the car doors start opening and finishes closing 0.3 s BEFORE them.
 */
export function psdOpenFromTrainDoors(doors01: number): number {
  if (doors01 <= 0) return 0;
  if (doors01 >= 1) return 1;
  const u = recoverDoorLinearRamp(doors01);
  if (u <= PSD_LAG_FRAC + 1e-12) return 0;
  return smooth((u - PSD_LAG_FRAC) / (1 - PSD_LAG_FRAC));
}

/**
 * Target opening (0..1) for a single PSD doorway at track coordinate `psdDoorS` on a track:
 * opens ONLY when a stopped train on that track has a car door aligned alongside `psdDoorS` (<= 0.25 m).
 */
export function alignedPsdDoorOpen(
  psdDoorS: number,
  train: TrainState | null,
  trainDoors: readonly number[] = DEFAULT_DOOR_OFFSETS,
): number {
  if (!train || train.phase !== 'stopped' || train.doors01 <= 0) return 0;
  for (let i = 0; i < trainDoors.length; i++) {
    if (Math.abs(psdDoorS - (train.s + trainDoors[i]!)) <= 0.25) {
      return psdOpenFromTrainDoors(train.doors01);
    }
  }
  return 0;
}

// ---- 2. Exact jerk-limited arrival mouth ETA (matches timetable.ts brake profile) ----

const { cruise: V0, decel: A, jerk: J } = TIMING;
const T1 = A / J;
const T2 = (V0 - (A * A) / J) / A;
const SEGS: ReadonlyArray<readonly [number, number]> = [[T1, -J], [T2, 0], [T1, J]];

function brakeDistAt(t: number): number {
  if (t >= BRAKE_TIME) return BRAKE_DIST;
  let s = 0, v = V0, a = 0, left = Math.max(0, t);
  for (const [dur, jk] of SEGS) {
    const d = Math.min(left, dur);
    s += v * d + (a * d * d) / 2 + (jk * d * d * d) / 6;
    v += a * d + (jk * d * d) / 2;
    a += jk * d;
    left -= d;
    if (left <= 0) break;
  }
  return s;
}

/** Seconds from when a braking train is `distBeforeStop` m short of s = 0 until it stops at s = 0. */
function etaAtDistBeforeStop(distBeforeStop: number): number {
  if (distBeforeStop >= BRAKE_DIST) return BRAKE_TIME + (distBeforeStop - BRAKE_DIST) / V0;
  const targetBrakeS = BRAKE_DIST - distBeforeStop; // distance travelled since braking began
  let lo = 0, hi = BRAKE_TIME;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) * 0.5;
    if (brakeDistAt(mid) < targetBrakeS) lo = mid;
    else hi = mid;
  }
  return BRAKE_TIME - (lo + hi) * 0.5;
}

const MOUTH_ETA_BY_TRACK: readonly number[] = TRACKS.map((tr) => etaAtDistBeforeStop(tr.portalIn + HALF_LEN));

export function trackIndexOf(line: LineId, track: 0 | 1): number {
  return (line === 'meridian' ? 0 : line === 'vesper' ? 2 : 4) + track;
}

/** Exact seconds until an approaching train's nose reaches its entry portal mouth (negative after nose exits bore). */
export function timeToPortalMouth(train: TrainState): number {
  const idx = trackIndexOf(train.line, train.track);
  return train.eta - MOUTH_ETA_BY_TRACK[idx]!;
}

// ---- 3. 12-bore arrival light-wave and departure wake ----

/**
 * Arrival wave intensity (0..1) at tunnel depth `segDepthM` (m inside entry bore) given `timeToMouthSec` (s until nose
 * reaches mouth). Crest hits depth = 0 at timeToMouth = WAVE_LEAD_SEC (4 s), ~4 segments wide, afterglow decays ~2 s.
 */
export function arrivalWaveIntensity(segDepthM: number, timeToMouthSec: number): number {
  const crestDepth = RING_FIRST_DEPTH + (timeToMouthSec - WAVE_LEAD_SEC) * WAVE_SPEED_MPS;
  // Ahead of crest (closer to mouth than crest): crisp leading Gaussian (sigma = 1.4 seg = 8.4 m)
  // Behind crest (already passed): core tail (sigma = 2.1 seg = 12.6 m) + 2 s decaying afterglow
  const deltaSeg = (crestDepth - segDepthM) / RING_PITCH;
  if (deltaSeg > 0) {
    // Leading side: segment has not yet been reached by the crest
    if (deltaSeg > 7) return 0;
    return Math.exp(-0.5 * (deltaSeg / 1.4) * (deltaSeg / 1.4));
  }
  // Trailing side: crest has already passed this segment dtPassed seconds ago
  const dtPassed = (segDepthM - crestDepth) / WAVE_SPEED_MPS;
  if (dtPassed >= 2.55) return 0;
  const trailSeg = -deltaSeg;
  const core = Math.exp(-0.5 * (trailSeg / 2.1) * (trailSeg / 2.1));
  const afterglowFade = smooth((2.55 - dtPassed) / 1.35);
  const afterglow = 0.72 * Math.exp(-dtPassed / 1.0) * afterglowFade;
  return Math.max(core, afterglow);
}

/**
 * Departure wake intensity (0..0.40) at tunnel depth `segDepthM` (m inside exit bore) given `tailDepthM` (m the train's
 * tail has travelled past the exit mouth; negative while tail is still in the cavern).
 */
export function departureWakeIntensity(segDepthM: number, tailDepthM: number): number {
  if (tailDepthM < -24 || tailDepthM > 235) return 0;
  // Swells smoothly 0 -> 1 as tail approaches the exit mouth (-24 -> 0 m), then fades out deep in the tunnel (30 -> 230 m)
  const enter = smooth((tailDepthM + 24) / 24);
  const deepFade = smooth((230 - tailDepthM) / 200);
  const amp = DEPARTURE_WAKE_PEAK * enter * deepFade;
  if (amp < 1e-4) return 0;
  // Wake crest follows just behind the retreating tail (~6 m behind tail, clamped >= 0 at mouth)
  const wakeDepth = Math.max(0, tailDepthM - 6);
  const deltaSeg = (segDepthM - wakeDepth) / RING_PITCH;
  // Slightly longer trailing tail behind the train toward the mouth, tighter leading falloff into the train body
  const sigma = deltaSeg > 0 ? 1.5 : 2.5;
  if (Math.abs(deltaSeg) > sigma * 4.5) return 0;
  return amp * Math.exp(-0.5 * (deltaSeg / sigma) * (deltaSeg / sigma));
}

/**
 * Evaluates all 12 bores × `segCount` ring intensities into `out` (zero allocations).
 * Combines subtle idle shimmer, arrival waves (`portalIn` bore = trackIdx*2), and departure wakes (`portalOut` bore =
 * trackIdx*2 + 1) using `Math.max` (never sum) so overlapping trains never overshoot or flicker.
 */
export function evaluatePortalWaves(
  trains: readonly TrainState[],
  realTimeSec: number,
  segCount: number,
  out: Float32Array,
  includeIdle = true,
): void {
  const boreCount = 12;
  // 1. Base idle floor (2 % breathing shimmer)
  for (let b = 0; b < boreCount; b++) {
    const base = b * segCount;
    for (let s = 0; s < segCount; s++) {
      out[base + s] = includeIdle ? 0.02 + 0.006 * Math.sin(realTimeSec * 0.7 + b * 1.15 - s * 0.42) : 0;
    }
  }
  // 2. Superpose train arrival waves & departure wakes via Math.max
  for (let i = 0; i < trains.length; i++) {
    const tr = trains[i]!;
    if (tr.phase === 'gone') continue;
    const tIdx = trackIndexOf(tr.line, tr.track);
    if (tr.phase === 'approaching') {
      const boreIdx = tIdx * 2; // 'in' bore
      const base = boreIdx * segCount;
      const tMouth = timeToPortalMouth(tr);
      // Skip if crest is still far past tunnel end or afterglow has fully finished
      if (tMouth < -3.5) continue;
      for (let s = 0; s < segCount; s++) {
        const depth = RING_FIRST_DEPTH + s * RING_PITCH;
        const w = arrivalWaveIntensity(depth, tMouth);
        if (w > out[base + s]!) out[base + s] = w;
      }
    } else if (tr.phase === 'departing') {
      const boreIdx = tIdx * 2 + 1; // 'out' bore
      const base = boreIdx * segCount;
      const track: MetroTrack = trackOf(tr.line, tr.track);
      const tailDepth = tr.s - HALF_LEN - track.portalOut;
      if (tailDepth < -24 || tailDepth > 235) continue;
      for (let s = 0; s < segCount; s++) {
        const depth = RING_FIRST_DEPTH + s * RING_PITCH;
        const w = departureWakeIntensity(depth, tailDepth);
        if (w > out[base + s]!) out[base + s] = w;
      }
    }
  }
}

// ---- 4. Transom display text ----

/**
 * Formats the hairline dot-matrix transom display string for a track.
 * Quiet idle: `LINE · DESTINATION`; active train: `LINE · DESTINATION · ARRIVING | DOORS OPENING | DEPARTING`.
 */
export function formatTransomText(
  line: LineId,
  track: 0 | 1,
  train: TrainState | null,
  hadDoorsOpen: boolean,
): string {
  const prefix = `${lineLabelOf(line)} · ${destinationOf(line, track).toUpperCase()}`;
  if (!train || train.phase === 'gone') return prefix;
  if (train.phase === 'approaching') {
    // Announce ARRIVING once the arrival light-wave starts sweeping down the bore (timeToMouth <= 12 s)
    return timeToPortalMouth(train) <= 12.0 ? `${prefix} · ARRIVING` : prefix;
  }
  if (train.phase === 'stopped') {
    if (train.doors01 > 0.01) return `${prefix} · DOORS OPENING`;
    return hadDoorsOpen ? `${prefix} · DEPARTING` : `${prefix} · ARRIVING`;
  }
  if (train.phase === 'departing') {
    const tr = trackOf(line, track);
    // Show DEPARTING while the train is still clearing the cavern
    return train.s - HALF_LEN < tr.portalOut + 15 ? `${prefix} · DEPARTING` : prefix;
  }
  return prefix;
}
