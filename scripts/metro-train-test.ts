// Metro timetable bus + scheduler (Phase 4, P4-1). Pure logic: seeded 2 h simulation at fixed dt.
import assert from 'node:assert/strict';
import { CAVERN, METRO_TRAIN } from '../src/layoutMetro';
import { TRACKS, doorOffsets, trackPoint } from '../src/metro/tracks';
import { createTimetable, TIMING, type MetroEvent, type TrainState } from '../src/metro/timetable';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
const L = METRO_TRAIN.length;

test('six tracks, two per line, opposite travel directions', () => {
  assert.equal(TRACKS.length, 6);
  for (const line of ['meridian', 'vesper', 'halcyon'] as const) {
    const [a, b] = TRACKS.filter((t) => t.line === line);
    assert.ok(a && b);
    assert.ok(Math.abs(a.dir[0] + b.dir[0]) < 1e-9 && Math.abs(a.dir[1] + b.dir[1]) < 1e-9, `${line} directions opposite`);
    assert.ok(Math.abs(Math.hypot(a.dir[0], a.dir[1]) - 1) < 1e-9);
  }
  const m = TRACKS.find((t) => t.line === 'meridian' && t.track === 0)!;
  assert.deepEqual(trackPoint(m, 0).slice(0, 3).map((v) => +v.toFixed(3)), [-10.55, -47.1, 74]);
  assert.equal(m.portalIn, 74 - CAVERN.nave.zMin); assert.equal(m.portalOut, CAVERN.nave.zMax - 74);
  assert.equal(TRACKS.find((t) => t.line === 'vesper')!.portalIn, -CAVERN.transept.xMin);
  assert.equal(TRACKS.find((t) => t.line === 'halcyon')!.portalIn, 55);
});

test('door offsets: 12, symmetric, 3 per car, spaced evenly inside each car', () => {
  const o = doorOffsets();
  assert.equal(o.length, METRO_TRAIN.cars * METRO_TRAIN.doorsPerSidePerCar);
  for (let i = 0; i < o.length; i++) assert.ok(Math.abs(o[i] + o[o.length - 1 - i]) < 1e-9);
  for (let i = 1; i < 3; i++) assert.ok(Math.abs(o[i] - o[i - 1] - 20 / 3) < 1e-9);
  assert.ok(Math.abs(o[3] - o[2] - (20 / 3 + 0.5)) < 1e-9);
});

// ---- 2 h seeded simulation ----
const DT = 1 / 30, HOURS2 = 2 * 3600;
const run = (seed: number) => {
  const tt = createTimetable({ seed });
  const events: MetroEvent[] = [];
  tt.subscribe((e) => events.push(e));
  const stats = { maxMoving: 0, maxPresent: 0, overlap: 0, badStop: 0, etaBad: 0, spawned: new Set<number>() };
  const lastEta = new Map<number, number>();
  const stopErr: number[] = [];
  const nearestOverlap: string[] = [];
  const steps = Math.round(HOURS2 / DT);
  for (let i = 0; i < steps; i++) {
    tt.update(DT);
    const ts = tt.trains();
    const moving = ts.filter((t) => t.phase === 'approaching' || t.phase === 'departing').length;
    stats.maxMoving = Math.max(stats.maxMoving, moving);
    stats.maxPresent = Math.max(stats.maxPresent, ts.length);
    const byTrack = new Map<string, TrainState[]>();
    for (const t of ts) {
      stats.spawned.add(t.id);
      const k = `${t.line}${t.track}`; (byTrack.get(k) ?? byTrack.set(k, []).get(k)!).push(t);
      if (t.phase === 'approaching') {
        const p = lastEta.get(t.id); if (p !== undefined && t.eta > p + 1e-9) stats.etaBad++; lastEta.set(t.id, t.eta);
      }
      if (t.phase === 'stopped') { stopErr.push(Math.abs(t.s)); if (Math.abs(t.s) > 0.05 || t.v !== 0) stats.badStop++; }
    }
    for (const [k, list] of byTrack) {
      list.sort((a, b) => a.s - b.s);
      for (let j = 1; j < list.length; j++) if (list[j].s - list[j - 1].s < L) { stats.overlap++; nearestOverlap.push(k); }
    }
  }
  return { tt, events, stats, stopErr };
};

const A = run(12345);

test('2 h sim: many trains run on all six tracks', () => {
  assert.ok(A.stats.spawned.size > 100, `spawned ${A.stats.spawned.size}`);
  const tracks = new Set(A.events.filter((e) => e.type === 'arrived').map((e) => `${e.train.line}${e.train.track}`));
  assert.equal(tracks.size, 6);
});
test('no overlap on a track', () => assert.equal(A.stats.overlap, 0));
test('never more than 4 moving', () => assert.ok(A.stats.maxMoving <= 4 && A.stats.maxPresent <= 4 && A.stats.maxMoving >= 3, `max ${A.stats.maxMoving}`));
test('every train stops at stopS +- 0.05 with v = 0 (doors align with PSD offsets)', () => {
  assert.equal(A.stats.badStop, 0);
  const arrived = A.events.filter((e) => e.type === 'arrived');
  assert.ok(arrived.length > 100);
  for (const e of arrived) assert.ok(Math.abs(e.train.s) <= 0.05 && e.train.v === 0);
});
test('ETA is monotone non-increasing while approaching and ends at 0', () => {
  assert.equal(A.stats.etaBad, 0);
  for (const e of A.events.filter((x) => x.type === 'arrived')) assert.equal(e.train.eta, 0);
  for (const e of A.events.filter((x) => x.type === 'approaching')) assert.ok(e.eta! > 10 && e.eta! < 60, `eta ${e.eta}`);
});
test('door timings: open 1.0 s after arrival, dwell 20-30 s, closed 3.0 s before departure', () => {
  const at = new Map<string, number>();
  const stamp = (e: MetroEvent) => at.set(`${e.type}${e.train.id}`, e.t);
  A.events.forEach(stamp);
  let n = 0;
  for (const e of A.events.filter((x) => x.type === 'departing')) {
    const id = e.train.id, arr = at.get(`arrived${id}`)!, op = at.get(`doorsOpen${id}`)!, cl = at.get(`doorsClosed${id}`)!;
    assert.ok(Math.abs(op - arr - TIMING.doorOpenDelay) <= DT + 1e-9, `open ${op - arr}`);
    const dwell = e.t - arr; assert.ok(dwell >= 20 - DT && dwell <= 30 + DT, `dwell ${dwell}`);
    assert.ok(Math.abs(e.t - cl - TIMING.doorsClosedBeforeDeparture) <= DT + 1e-9, `close ${e.t - cl}`);
    assert.ok(op < cl); n++;
  }
  assert.ok(n > 100);
  // doors01 stays 0 while moving, 1 mid-dwell
  const tt = createTimetable({ seed: 7 });
  let sawOpen = false;
  for (let i = 0; i < 20 * 60 * 30; i++) {
    tt.update(DT);
    for (const t of tt.trains()) {
      if (t.phase !== 'stopped') assert.equal(t.doors01, 0);
      if (t.phase === 'stopped' && t.doors01 === 1) sawOpen = true;
    }
  }
  assert.ok(sawOpen);
});
test('no spawn or despawn within 250 m of a portal', () => {
  for (const e of A.events.filter((x) => x.type === 'approaching' || x.type === 'gone')) {
    const tr = TRACKS.find((t) => t.line === e.train.line && t.track === e.train.track)!;
    const extent = e.type === 'approaching' ? e.train.s + L / 2 + tr.portalIn : e.train.s - L / 2 - tr.portalOut;
    // spawn: head is >= 250 before the entry portal; gone: tail is >= 250 beyond the exit portal
    if (e.type === 'approaching') assert.ok(-extent >= 250 - 1e-6, `spawn head ${extent}`);
    else assert.ok(extent >= 250 - 1e-6, `gone tail ${extent}`);
  }
});
test('headway per track 60-150 s (spawn to spawn, deferral only lengthens)', () => {
  const last = new Map<string, number>(); let min = 1e9;
  for (const e of A.events.filter((x) => x.type === 'approaching')) {
    const k = `${e.train.line}${e.train.track}`; const p = last.get(k);
    if (p !== undefined) min = Math.min(min, e.t - p); last.set(k, e.t);
  }
  assert.ok(min >= 60 - 1e-6, `min headway ${min}`);
});
test('deterministic per seed, different across seeds', () => {
  const B = run(12345), C = run(999);
  assert.deepEqual(B.events.map((e) => [e.type, e.train.id, +e.t.toFixed(3)]), A.events.map((e) => [e.type, e.train.id, +e.t.toFixed(3)]));
  assert.notDeepEqual(C.events.slice(0, 20).map((e) => e.t), A.events.slice(0, 20).map((e) => e.t));
});
test('enteredDeep(): a train is arriving soon after the player reaches the cavern', () => {
  const tt = createTimetable({ seed: 3 });
  const evs: MetroEvent[] = []; tt.subscribe((e) => evs.push(e));
  tt.update(200); // sim ran before the player arrived
  const t0 = tt.time; tt.enteredDeep();
  for (let i = 0; i < 60 * 30; i++) tt.update(DT);
  const first = evs.find((e) => e.type === 'arrived' && e.t >= t0);
  assert.ok(first && first.t - t0 <= TIMING.firstArrivalMax, `first arrival ${first && first.t - t0}`);
});
test('unsubscribe stops delivery', () => {
  const tt = createTimetable({ seed: 1 }); let n = 0; const off = tt.subscribe(() => n++); off();
  for (let i = 0; i < 3000; i++) tt.update(DT); assert.equal(n, 0);
});

test('fork is an independent, bit-identical copy of the schedule', () => {
  const tt = createTimetable({ seed: 7 });
  for (let i = 0; i < 3000; i++) tt.update(0.1);
  const before = JSON.stringify(tt.trains());
  const f = tt.fork();
  for (let i = 0; i < 6000; i++) f.update(0.1);
  assert.equal(JSON.stringify(tt.trains()), before, 'advancing the fork must not touch the original');
  const g = tt.fork();
  for (let i = 0; i < 6000; i++) { tt.update(0.1); g.update(0.1); }
  assert.equal(JSON.stringify(g.trains()), JSON.stringify(tt.trains()), 'fork and original stay identical under identical steps');
});

test('nextArrivalIn: 0 standing, exact eta approaching, lookahead otherwise; matches reality within +-10 s for 20 arrivals per track', () => {
  const tt = createTimetable({ seed: 42 });
  const pending: Array<Array<number>> = TRACKS.map(() => []); // predicted absolute arrival times, made when the previous train departed
  const errs: number[][] = TRACKS.map(() => []);
  const idxOf = (t: TrainState): number => TRACKS.findIndex((x) => x.line === t.line && x.track === t.track);
  tt.subscribe((e) => {
    if (e.type !== 'arrived') return;
    const i = idxOf(e.train);
    const pred = pending[i]!.shift();
    if (pred !== undefined && errs[i]!.length < 20) errs[i]!.push(Math.abs(pred - e.t));
  });
  const departed = new Set<number>();
  const dt = 1 / 30;
  for (let step = 0; step < 3 * 3600 / dt && errs.some((e) => e.length < 20); step++) {
    tt.update(dt);
    for (const t of tt.trains()) {
      const i = idxOf(t);
      const tr = TRACKS[i]!;
      if (t.phase === 'stopped') assert.equal(tt.nextArrivalIn(tr.line, tr.track), 0);
      if (t.phase === 'departing' && !departed.has(t.id)) {
        departed.add(t.id);
        if (!tt.trains().some((x) => idxOf(x) === i && (x.phase === 'approaching' || x.phase === 'stopped'))) {
          const n = tt.nextArrivalIn(tr.line, tr.track);
          assert.ok(n !== null && n >= 0, 'lookahead always finds the next arrival');
          pending[i]!.push(tt.time + n!);
        }
      }
      if (t.phase === 'approaching') assert.ok(Math.abs(tt.nextArrivalIn(tr.line, tr.track)! - t.eta) < 1e-9 || tt.trains().filter((x) => idxOf(x) === i && x.phase === 'approaching').length > 1);
    }
  }
  for (let i = 0; i < TRACKS.length; i++) {
    assert.ok(errs[i]!.length >= 20, `track ${i}: only ${errs[i]!.length} checked arrivals`);
    const worst = Math.max(...errs[i]!);
    assert.ok(worst <= 10, `track ${i}: worst prediction error ${worst.toFixed(2)} s`);
  }
});

console.log(`\n${passed} passed | trains ${A.stats.spawned.size} | max moving ${A.stats.maxMoving} | max present ${A.stats.maxPresent} | max stop err ${A.stopErr.reduce((m, x) => Math.max(m, x), 0).toFixed(4)} m`);
