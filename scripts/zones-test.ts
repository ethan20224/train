// Depth zones + directional-light mask (Task 5). Run: npx tsx scripts/zones-test.ts
import assert from 'node:assert/strict';
import { ShaderChunk } from 'three';
import { ZONES } from '../src/layout';
import { Airlock, lookFactor, sunWeights } from '../src/core/zones';
import { stripDirectionalBlock } from '../src/lighting/sunMask';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
test('look factor: 0 at the hall, 1 at the Threshold, monotone between', () => {
  assert.equal(lookFactor(1.7), 0); assert.equal(lookFactor(-30), 1);
  let prev = 0;
  for (let y = -4; y >= -30; y -= 0.5) { const f = lookFactor(y); assert.ok(f >= prev - 1e-12); prev = f; }
});
test('both suns are fully off wherever the airlock can switch', () => {
  for (const y of [ZONES.switchY - ZONES.hysteresis, ZONES.switchY, ZONES.switchY + ZONES.hysteresis]) {
    const w = sunWeights(y); assert.equal(w.surface, 0, `surface at ${y}`); assert.equal(w.deep, 0, `deep at ${y}`);
  }
  assert.equal(sunWeights(0).surface, 1); assert.equal(sunWeights(-30).deep, 1);
});
test('airlock hysteresis: oscillating ±0.5 m around the switch toggles once per real crossing', () => {
  const a = new Airlock(1.7); let toggles = 0;
  for (let i = 0; i < 400; i++) if (a.update(ZONES.switchY + (i % 2 ? 0.5 : -0.5))) toggles++;
  assert.equal(toggles, 0, 'no flicker');
  assert.ok(a.update(-20)); assert.equal(a.zone, 'deep');
  for (let i = 0; i < 400; i++) if (a.update(ZONES.switchY + (i % 2 ? 0.5 : -0.5))) toggles++;
  assert.equal(toggles, 0, 'no flicker coming back up');
  assert.ok(a.update(-10)); assert.equal(a.zone, 'surface');
});
test('directional block stripped; point/spot/hemisphere lighting kept', () => {
  const src = ShaderChunk.lights_fragment_begin;
  const out = stripDirectionalBlock(src);
  assert.ok(!out.includes('NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'), 'dir block gone');
  assert.ok(out.includes('NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'), 'point kept');
  assert.ok(out.includes('NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'), 'spot kept');
  assert.ok(out.includes('NUM_HEMI_LIGHTS'), 'hemisphere kept');
  const balance = (s: string) => (s.match(/^\s*#if/gm) ?? []).length - (s.match(/^\s*#endif/gm) ?? []).length;
  assert.equal(balance(out), balance(src), 'preprocessor balanced');
});
console.log(`\n${passed} zone checks passed`);
