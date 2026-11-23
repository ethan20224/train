// Live map wall & running clock invariants (Phase 4, P4-5). Run: npm run metro-map-test
import assert from 'node:assert/strict';
import {
  clockHandAngles, lineStationsUV, MAP_CLOCK_CENTER_Y, MAP_PANEL, MAP_TEX_H, MAP_TEX_W,
  mapTrainToUV, mapUVToWorldXY, sampleLineUV, trackMapSpan, worldXYToMapPixel,
} from '../src/metro/mapLayout';
import { createTimetable } from '../src/metro/timetable';
import type { LineId } from '../src/metro/tracks';

let passed = 0;
const test = (name: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${name}`); };
const LINES: readonly LineId[] = ['meridian', 'vesper', 'halcyon'];

test('all three lines pass through exact centre (0.5, 0.5) and place 9 distinct stations inside panel bounds', () => {
  for (const line of LINES) {
    const mid = sampleLineUV(line, 0.5);
    assert.ok(Math.abs(mid.u - 0.5) < 1e-9 && Math.abs(mid.v - 0.5) < 1e-9, `${line} centre`);
    const sts = lineStationsUV(line);
    assert.equal(sts.length, 9);
    for (const st of sts) {
      assert.ok(st.u >= 0.04 && st.u <= 0.96 && st.v >= 0.10 && st.v <= 0.90, `${line}/${st.name} in bounds`);
      if (!st.isInterchange) {
        const [wx, wy] = mapUVToWorldXY(st.u, st.v);
        const r = Math.hypot(wx, wy - MAP_CLOCK_CENTER_Y);
        assert.ok(r > MAP_PANEL.interchangeRingR + 0.5, `${line}/${st.name} clears clock ring (r=${r.toFixed(2)})`);
      }
    }
  }
});

test('s -> map-UV -> world -> pixel roundtrip sits strictly within 1 map pixel across all 6 tracks', () => {
  let maxPxErr = 0;
  for (const line of LINES) {
    for (const track of [0, 1] as const) {
      const span = trackMapSpan(line, track);
      for (let i = -20; i <= 20; i++) {
        const s = (i / 20) * span;
        const uv = mapTrainToUV(line, track, s);
        const [wx, wy] = mapUVToWorldXY(uv.u, uv.v);
        const [px, py] = worldXYToMapPixel(wx, wy);
        const err = Math.hypot(px - uv.u * MAP_TEX_W, py - (1 - uv.v) * MAP_TEX_H);
        if (err > maxPxErr) maxPxErr = err;
        assert.ok(err < 1.0, `pixel error ${err} >= 1 px on ${line}${track} s=${s}`);
        // Never occluded behind the 2.4 m white onyx clock (r = 1.20 m)
        const rClock = Math.hypot(wx, wy - MAP_CLOCK_CENTER_Y);
        assert.ok(rClock >= MAP_PANEL.interchangeRingR - 1e-6, `dot occluded behind clock: r=${rClock}`);
      }
      // Opposing tracks travel in opposite directions across the map
      const start = mapTrainToUV(line, track, -span);
      const end = mapTrainToUV(line, track, +span);
      if (track === 0) assert.ok(end.u > start.u, `${line}0 travels left->right`);
      else assert.ok(end.u < start.u, `${line}1 travels right->left`);
    }
  }
  // Opposing stopped trains at s = 0 sit on opposite sides of the interchange ring (never overlapping)
  for (const line of LINES) {
    const a = mapUVToWorldXY(mapTrainToUV(line, 0, 0).u, mapTrainToUV(line, 0, 0).v);
    const b = mapUVToWorldXY(mapTrainToUV(line, 1, 0).u, mapTrainToUV(line, 1, 0).v);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= MAP_PANEL.interchangeRingR * 1.9, `${line} stopped dots separated`);
  }
  console.log(`     max map-pixel roundtrip error: ${maxPxErr.toExponential(2)} px (< 1 px)`);
});

test('live timetable trains stay smoothly mapped inside the 2048x512 panel over 10 min simulation', () => {
  const tt = createTimetable({ seed: 42 });
  let samples = 0;
  for (let i = 0; i < 600 * 10; i++) {
    tt.update(0.1);
    for (const t of tt.trains()) {
      const uv = mapTrainToUV(t.line, t.track, t.s);
      assert.ok(uv.u >= 0.02 && uv.u <= 0.98 && uv.v >= 0.05 && uv.v <= 0.95);
      samples++;
    }
  }
  assert.ok(samples > 5000);
});

test('running clock computes exact continuous sweeping hand angles from Date (including milliseconds)', () => {
  // 3:00:00.000 -> hour = pi/2, minute = 0, second = 0
  const d3 = new Date(2035, 5, 1, 3, 0, 0, 0);
  const a3 = clockHandAngles(d3);
  assert.ok(Math.abs(a3.hour - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(a3.minute) < 1e-9);
  assert.ok(Math.abs(a3.second) < 1e-9);

  // 6:30:15.500 -> continuous sweep (second = 15.5/60 * 2pi, minute = 30.2583/60 * 2pi, hour = 6.5043/12 * 2pi)
  const d6 = new Date(2035, 5, 1, 6, 30, 15, 500);
  const a6 = clockHandAngles(d6);
  assert.ok(Math.abs(a6.second - (15.5 / 60) * Math.PI * 2) < 1e-9);
  assert.ok(Math.abs(a6.minute - ((30 + 15.5 / 60) / 60) * Math.PI * 2) < 1e-9);
  assert.ok(Math.abs(a6.hour - ((6 + (30 + 15.5 / 60) / 60) / 12) * Math.PI * 2) < 1e-9);
});

console.log(`\n${passed} map wall checks passed`);
