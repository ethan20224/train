// Metro arrival choreography unit tests (Phase 4, P4-3):
// PSD smoothstep inversion & 0.3 s open lag / close lead, door alignment, 12-bore arrival light-wave,
// departure wake, max-combination (no overshoot), and shared destination transom strings.
import assert from 'node:assert/strict';
import { METRO_TRAIN } from '../src/layoutMetro';
import {
  alignedPsdDoorOpen,
  arrivalWaveIntensity,
  DEPARTURE_WAKE_PEAK,
  departureWakeIntensity,
  evaluatePortalWaves,
  formatTransomText,
  psdOpenFromTrainDoors,
  recoverDoorLinearRamp,
  RING_FIRST_DEPTH,
  RING_PITCH,
  timeToPortalMouth,
  trackIndexOf,
  WAVE_LEAD_SEC,
} from '../src/metro/choreography';
import { METRO_NETWORK } from '../src/metro/network';
import { createTimetable, TIMING, type TrainState } from '../src/metro/timetable';
import { doorOffsets, TRACKS } from '../src/metro/tracks';

let passed = 0;
const test = (name: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${name}`); };
const smooth = (x: number): number => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

test('smoothstep inverse recovers linear ramp u to < 1e-12 across [0, 1]', () => {
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    const d = smooth(u);
    const rec = recoverDoorLinearRamp(d);
    assert.ok(Math.abs(rec - u) < 1e-12, `u=${u} d=${d} rec=${rec}`);
  }
});

test('PSD mapping gives exact 0.3 s open lag and 0.3 s close lead without modifying timetable', () => {
  const anim = TIMING.doorAnim; // 1.5 s
  // Opening ramp: t in [0, 1.5]
  for (let t = 0; t <= 0.300001; t += 0.05) {
    const car = smooth(t / anim);
    assert.equal(psdOpenFromTrainDoors(car), 0, `opening t=${t} must stay 0`);
  }
  assert.ok(psdOpenFromTrainDoors(smooth(0.32 / anim)) > 0, 'opening must start right after 0.3 s');
  let prev = 0;
  for (let i = 0; i <= 150; i++) {
    const p = psdOpenFromTrainDoors(smooth(i / 150));
    assert.ok(p >= prev - 1e-12, 'monotone non-decreasing while opening');
    prev = p;
  }
  assert.equal(psdOpenFromTrainDoors(1), 1);

  // Closing ramp: timetable uses 1 - smooth(tClose / 1.5)
  // At tClose = 1.2 s (0.3 s BEFORE car doors finish closing at 1.5 s), PSD must already be 0!
  assert.equal(psdOpenFromTrainDoors(1 - smooth(0)), 1);
  assert.ok(psdOpenFromTrainDoors(1 - smooth(1.15 / anim)) > 0, 'still closing at 1.15 s');
  for (let t = 1.20; t <= 1.500001; t += 0.05) {
    const car = 1 - smooth(t / anim);
    assert.equal(psdOpenFromTrainDoors(car), 0, `closing t=${t} must already be shut`);
  }
});

test('alignedPsdDoorOpen opens only pairs alongside a stopped train door; unaligned or moving stay shut', () => {
  const doors = doorOffsets();
  const stopped: TrainState = { id: 1, line: 'vesper', track: 0, s: 0, v: 0, phase: 'stopped', doors01: 1, eta: 0 };
  const moving: TrainState = { id: 2, line: 'vesper', track: 0, s: 0, v: 5, phase: 'approaching', doors01: 1, eta: 2 };
  const shifted: TrainState = { id: 3, line: 'vesper', track: 0, s: 3.0, v: 0, phase: 'stopped', doors01: 1, eta: 0 };
  for (const dc of doors) {
    assert.equal(alignedPsdDoorOpen(dc, stopped), 1);
    assert.equal(alignedPsdDoorOpen(dc, moving), 0);
    assert.equal(alignedPsdDoorOpen(dc, null), 0);
    assert.equal(alignedPsdDoorOpen(dc, shifted), 0);
  }
  // Extra PSD doorway outside the 81.5 m consist stays strictly closed
  assert.equal(alignedPsdDoorOpen(44.0, stopped), 0);
  assert.equal(alignedPsdDoorOpen(-44.0, stopped), 0);
});

test('timeToPortalMouth matches actual nose crossing on all 6 tracks within 0.05 s', () => {
  const tt = createTimetable({ seed: 42 });
  const half = METRO_TRAIN.length / 2;
  const checked = new Set<number>();
  const crossErr: number[] = [];
  const prevNoseDepth = new Map<number, number>();
  const dt = 0.02;
  for (let step = 0; step < 300 / dt; step++) {
    tt.update(dt);
    for (const t of tt.trains()) {
      if (t.phase !== 'approaching') continue;
      const idx = trackIndexOf(t.line, t.track);
      const tr = TRACKS[idx]!;
      const noseDepth = -tr.portalIn - (t.s + half);
      const prev = prevNoseDepth.get(t.id);
      if (prev !== undefined && prev > 0 && noseDepth <= 0) {
        const tm = timeToPortalMouth(t);
        crossErr.push(Math.abs(tm));
        checked.add(idx);
      }
      prevNoseDepth.set(t.id, noseDepth);
    }
  }
  assert.equal(checked.size, 6, `checked ${checked.size}/6 tracks`);
  const maxErr = Math.max(...crossErr);
  assert.ok(maxErr < 0.05, `mouth crossing timing error ${maxErr.toFixed(4)} s`);
});

test('arrival light-wave peaks at mouth 4 s before nose, ~4 segments wide, ~2 s afterglow', () => {
  // Peak at mouth (depth = RING_FIRST_DEPTH) occurs at timeToMouth = WAVE_LEAD_SEC (4.0 s)
  assert.equal(arrivalWaveIntensity(RING_FIRST_DEPTH, WAVE_LEAD_SEC), 1);
  // Width at half-maximum while running mid-tunnel (e.g. timeToMouth = 8.0 s -> crest at depth 147 m)
  let aboveHalf = 0;
  for (let s = 0; s < 57; s++) {
    if (arrivalWaveIntensity(RING_FIRST_DEPTH + s * RING_PITCH, 8.0) >= 0.5) aboveHalf++;
  }
  assert.ok(aboveHalf >= 3 && aboveHalf <= 6, `wave FWHM = ${aboveHalf} segments`);
  // Afterglow at mouth decays smoothly over ~2 s after crest (timeToMouth = 4 -> 2 -> 1.5 s)
  const a1 = arrivalWaveIntensity(RING_FIRST_DEPTH, WAVE_LEAD_SEC - 1.0);
  const a2 = arrivalWaveIntensity(RING_FIRST_DEPTH, WAVE_LEAD_SEC - 2.0);
  const a3 = arrivalWaveIntensity(RING_FIRST_DEPTH, WAVE_LEAD_SEC - 2.6);
  assert.ok(a1 > 0.15 && a1 < 0.45, `1 s afterglow = ${a1}`);
  assert.ok(a2 > 0.0 && a2 < 0.10, `2 s afterglow = ${a2}`);
  assert.equal(a3, 0, `2.6 s afterglow = ${a3}`);
});

test('departure wake peaks at ~40 % in portalOut bore and fades into deep tunnel', () => {
  assert.equal(departureWakeIntensity(RING_FIRST_DEPTH, -30), 0);
  const atMouth = departureWakeIntensity(RING_FIRST_DEPTH, 6);
  assert.ok(Math.abs(atMouth - DEPARTURE_WAKE_PEAK) < 0.04, `wake at mouth = ${atMouth}`);
  const mid = departureWakeIntensity(80, 86);
  const far = departureWakeIntensity(200, 206);
  assert.ok(mid > 0.15 && mid < atMouth, `mid wake = ${mid}`);
  assert.ok(far < 0.08 && far >= 0, `far wake = ${far}`);
});

test('overlapping waves in the same bore combine via max (never sum or overshoot > 1)', () => {
  const segCount = 57;
  const buf = new Float32Array(12 * segCount);
  // Two approaching trains on the same bore (meridian track 0 -> bore 0) at exact same peak eta
  const m0 = TRACKS[0]!;
  const half = METRO_TRAIN.length / 2;
  // Find exact eta where timeToPortalMouth === WAVE_LEAD_SEC
  const probe: TrainState = { id: 1, line: 'meridian', track: 0, s: -m0.portalIn - half, v: 15, phase: 'approaching', doors01: 0, eta: 0 };
  const mouthEta = -timeToPortalMouth(probe);
  const a: TrainState = { ...probe, id: 10, eta: mouthEta + WAVE_LEAD_SEC };
  const b: TrainState = { ...probe, id: 11, eta: mouthEta + WAVE_LEAD_SEC };
  evaluatePortalWaves([a, b], 0, segCount, buf, false);
  assert.equal(buf[0], 1, 'max combination stays at exact 1.0 without overshoot');
  assert.equal(buf[1 * segCount], 0, 'unrelated exit bore stays 0');
});

test('shared destination list covers all 8 canonical names and transom states format cleanly', () => {
  const allNames = new Set(Object.values(METRO_NETWORK).flatMap((l) => l.stations));
  for (const want of ['Vesper Falls', 'Halcyon', 'Hollow Bay', 'Ashgrove', 'Elsewhere', 'The Last Summer', 'Nowhere Junction', 'Meridian Deep']) {
    assert.ok(allNames.has(want), `missing canonical station: ${want}`);
  }
  for (const l of Object.values(METRO_NETWORK)) {
    assert.ok(l.stations.length >= 8 && l.stations.length <= 10);
    assert.equal(l.stations[l.interchangeIndex], 'Meridian Deep');
  }
  assert.equal(formatTransomText('vesper', 0, null, false), 'VESPER · ELSEWHERE');
  const arriving: TrainState = { id: 1, line: 'vesper', track: 0, s: -120, v: 16, phase: 'approaching', doors01: 0, eta: 18 };
  const open: TrainState = { id: 1, line: 'vesper', track: 0, s: 0, v: 0, phase: 'stopped', doors01: 0.8, eta: 0 };
  const closingDone: TrainState = { id: 1, line: 'vesper', track: 0, s: 0, v: 0, phase: 'stopped', doors01: 0, eta: 0 };
  const departing: TrainState = { id: 1, line: 'vesper', track: 0, s: 25, v: 10, phase: 'departing', doors01: 0, eta: 0 };
  assert.equal(formatTransomText('vesper', 0, arriving, false), 'VESPER · ELSEWHERE · ARRIVING');
  assert.equal(formatTransomText('vesper', 0, open, true), 'VESPER · ELSEWHERE · DOORS OPENING');
  assert.equal(formatTransomText('vesper', 0, closingDone, true), 'VESPER · ELSEWHERE · DEPARTING');
  assert.equal(formatTransomText('vesper', 0, departing, false), 'VESPER · ELSEWHERE · DEPARTING');
});

console.log(`\n${passed} choreography checks passed`);
