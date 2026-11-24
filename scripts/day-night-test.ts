// Day / golden hour / night 3-mode cycle tests. Run: npx tsx scripts/day-night-test.ts
import assert from 'node:assert/strict';
import { DAY_NIGHT, DayNight, evaluateDayNight } from '../src/metro/dayNight';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };

const advance = (dn: DayNight, seconds: number, step = 0.05): void => {
  const n = Math.ceil(seconds / step);
  for (let i = 0; i < n; i++) dn.update(step);
};

test('N cycles day -> golden -> night -> day and holds at each mode', () => {
  const dn = new DayNight('day');
  assert.equal(dn.mode, 'day');
  assert.equal(dn.state.s, 0);
  assert.equal(dn.isNightTarget, false);

  // 1st N: day -> golden hour
  dn.toggle();
  assert.equal(dn.mode, 'golden');
  assert.equal(dn.isNightTarget, false);
  advance(dn, DAY_NIGHT.transitionSec);
  assert.equal(dn.state.s, DAY_NIGHT.goldenPos);
  assert.equal(dn.state.golden, 1);
  assert.equal(dn.state.night, 0);
  assert.equal(dn.state.moon, false);
  // Holds indefinitely in golden hour while realTime continues for clouds
  const t0 = dn.realTime;
  advance(dn, 30);
  assert.equal(dn.state.s, DAY_NIGHT.goldenPos);
  assert.equal(dn.state.golden, 1);
  assert.ok(dn.realTime > t0 + 29);

  // 2nd N: golden hour -> night
  dn.toggle();
  assert.equal(dn.mode, 'night');
  assert.equal(dn.isNightTarget, true);
  advance(dn, DAY_NIGHT.transitionSec);
  assert.equal(dn.state.s, 1);
  assert.equal(dn.state.golden, 0);
  assert.equal(dn.state.night, 1);
  assert.equal(dn.state.moon, true);

  // 3rd N: night -> day (glides straight back to day)
  dn.toggle();
  assert.equal(dn.mode, 'day');
  assert.equal(dn.isNightTarget, false);
  advance(dn, DAY_NIGHT.transitionSec + 0.1);
  assert.equal(dn.state.s, 0);
  assert.equal(dn.state.golden, 0);
  assert.equal(dn.state.night, 0);
  assert.equal(dn.state.moon, false);
});

test('double-tapping N from day glides smoothly to night in transitionSec without snapping', () => {
  const dn = new DayNight('day');
  dn.toggle(); // golden
  dn.update(0.2);
  const sAfterFirst = dn.state.s;
  dn.toggle(); // night
  assert.equal(dn.mode, 'night');
  dn.update(0.05);
  assert.ok(dn.state.s > sAfterFirst && dn.state.s - sAfterFirst < 0.01, 'no jump on rapid second N');
  advance(dn, DAY_NIGHT.transitionSec);
  assert.equal(dn.state.s, 1);
});

test('mid-transition N while returning night -> day redirects smoothly to golden', () => {
  const dn = new DayNight('night');
  dn.toggle(); // day
  advance(dn, 3); // s ~ 0.786, above goldenPos
  assert.ok(dn.state.s > DAY_NIGHT.goldenPos);
  dn.toggle(); // golden
  assert.equal(dn.mode, 'golden');
  advance(dn, 10);
  assert.equal(dn.state.s, DAY_NIGHT.goldenPos);
});

test('initial ?golden=1 and ?night=1 modes start settled and advance cleanly', () => {
  const g = new DayNight('golden');
  assert.equal(g.mode, 'golden');
  assert.equal(g.state.s, DAY_NIGHT.goldenPos);
  assert.equal(g.state.golden, 1);
  g.toggle();
  assert.equal(g.mode, 'night');

  const n = new DayNight('night');
  assert.equal(n.mode, 'night');
  assert.equal(n.state.s, 1);
  n.toggle();
  assert.equal(n.mode, 'day');
});

test('day (s = 0) and night (s = 1) evaluation outputs match exact original curves', () => {
  const day = evaluateDayNight(0, 0);
  assert.equal(day.golden, 0);
  assert.equal(day.night, 0);
  assert.equal(day.moon, false);
  assert.equal(day.ambientGain, 1);
  assert.equal(day.exposureGain, 1);
  assert.deepEqual(day.lightColor, [1, 0.97, 0.92]);

  const night = evaluateDayNight(1, 0);
  assert.equal(night.golden, 0);
  assert.equal(night.night, 1);
  assert.equal(night.moon, true);
  assert.ok(Math.abs(night.lightGain - DAY_NIGHT.moonGain) < 1e-12);
  assert.ok(Math.abs(night.ambientGain - 0.14) < 1e-12);
  assert.ok(Math.abs(night.exposureGain - 1.55) < 1e-12);
  assert.deepEqual(night.lightColor, [0.62, 0.74, 1.0]);
});

console.log(`\n${passed} day/night checks passed`);
