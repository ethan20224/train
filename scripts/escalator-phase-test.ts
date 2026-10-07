import assert from 'node:assert/strict';
import { ESCALATOR, ESCALATOR_VIS } from '../src/layoutMetro';
import { Escalators } from '../src/metro/escalators';
import { pathAt, pathLength } from '../src/world/metro/escalators';

let n = 0;
const ok = (name: string, fn: () => void): void => { fn(); n++; console.log(`ok   ${name}`); };
const pitch = ESCALATOR_VIS.pitch;
const far = { x: 1e4, y: 0, z: 1e4 };

ok('phase: down units advance +, up units -, magnitude = integral of speed dt (mod pitch)', () => {
  const e = new Escalators();
  const sum = new Float64Array(e.units.length);
  const prev = Float64Array.from(e.units, (u) => e.speed(u.id));
  // sensing: stand at the first unit so it accelerates; the rest idle
  const p = { x: e.units[0]!.across, y: e.units[0]!.yFrom, z: e.units[0]!.from };
  for (let k = 0; k < 120; k++) {
    e.update(0.05, p);
    e.units.forEach((u, i) => {
      const s = e.speed(u.id);
      sum[i]! += ((prev[i]! + s) / 2) * 0.05; prev[i] = s;
    });
  }
  e.units.forEach((u, i) => {
    const dirA = Math.sign(u.to - u.from) || 1;
    const expect = (u.dir === 'down' ? 1 : -1) * sum[i]!;
    assert.ok(Math.sign(u.sign * dirA) === (u.dir === 'down' ? 1 : -1), `${u.id} sign`);
    const wrapped = ((expect % pitch) + pitch) % pitch;
    const d = Math.abs(e.phase[i]! - wrapped);
    assert.ok(Math.min(d, pitch - d) < 1e-4, `${u.id}: phase ${e.phase[i]} vs ${wrapped}`);
    assert.ok(e.phase[i]! >= 0 && e.phase[i]! <= pitch + 1e-6, `${u.id} range`);
  });
});

ok('phase: wrap is continuous (per-frame step equals speed*dt modulo pitch, never a jump)', () => {
  const e = new Escalators();
  const i = e.units.findIndex((u) => u.dir === 'up');
  let last = e.phase[i]!;
  for (let k = 0; k < 600; k++) {
    e.update(1 / 60, far);
    const cur = e.phase[i]!;
    let d = cur - last; // up unit: phase decreases by speed*dt, wrapping 0 -> pitch
    if (d > pitch / 2) d -= pitch;
    assert.ok(Math.abs(d + ESCALATOR.idleSpeed / 60) < 1e-4, `step ${k}: ${d}`);
    last = cur;
  }
});

ok('pathAt: C0 and C1 continuous at the arc/incline joints, flat ends, ends reach the unit extents', () => {
  for (const drop of [10, 16, 24]) {
    const linc = drop / Math.sin((ESCALATOR.angleDeg * Math.PI) / 180);
    const L = pathLength(linc);
    const h = 1e-5;
    let prevP = pathAt(0, linc, false);
    let prevT: [number, number] | null = null;
    for (let s = h; s <= L - h; s += 0.01) {
      const a = pathAt(s - h, linc, false), b = pathAt(s + h, linc, false), p = pathAt(s, linc, false);
      assert.ok(Math.hypot(p.u - prevP.u, p.v - prevP.v) < 0.0101, `C0 at s=${s}`);
      const l = Math.hypot(b.u - a.u, b.v - a.v);
      const t: [number, number] = [(b.u - a.u) / l, (b.v - a.v) / l];
      assert.ok(Math.abs(l / (2 * h) - 1) < 1e-3, `unit speed at s=${s}`);
      if (prevT) assert.ok(Math.hypot(t[0] - prevT[0], t[1] - prevT[1]) < 0.02, `C1 at s=${s}`);
      prevT = t; prevP = p;
    }
    const top = pathAt(0, linc, false), bot = pathAt(L, linc, false);
    assert.ok(Math.abs(top.v) < 1e-9 && Math.abs(bot.v + drop) < 1e-9, 'flat ends at the end levels');
    assert.ok(pathAt(0, linc).v < -ESCALATOR_VIS.sink + 1e-9, 'sunk at the far end');
  }
});

console.log(`${n} escalator phase checks passed`);
