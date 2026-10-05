// Walk test through the REAL controls: node scripts/walk-test.mjs [--headed] [--out=walk]
// Loads / (no ?cam), clicks the intro, requests pointer lock via that click, then holds W/A/D/Shift and steers with
// mouse-movement events (PointerLockControls) along: balcony -> down the stair -> around the kiosk -> centre arch ->
// island B to the far end. Asserts stair descent, no collisions with columns / kiosk / tracks, reaches z > 300.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launch, open } from './lib.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const headed = process.argv.includes('--headed');
const outDir = path.join(root, 'shots', arg('out', 'walk'));
await fs.mkdir(outDir, { recursive: true });

const COLS_X = [-23, 23], COLS_Z = [20, 32, 44, 56, 68, 80];
const KIOSK = [0, 50, 3.5];
const OBSTACLES = JSON.parse(execFileSync(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'scripts/dump-obstacles.ts')], { encoding: 'utf8' }));
const browser = await launch({ headed });
const { page, errors } = await open(browser, 'q=med');
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log(`FAIL ${m}`); } };

// Enter through the real intro button (a trusted click = user gesture => pointer lock + audio start).
await page.click('#intro .prompt');
await page.waitForTimeout(2500); // fade
let locked = await page.evaluate(() => window.__meridian.locked());
console.log(`pointer lock after intro click: ${locked}`);
if (!locked) {
  await page.mouse.click(720, 450);
  await page.waitForTimeout(300);
  locked = await page.evaluate(() => window.__meridian.locked());
  console.log(`pointer lock after extra click: ${locked}`);
}
if (!locked) {
  console.log('NOTE: pointer lock NOT obtained; movement keys are ignored by the controller when unlocked.');
  await browser.close();
  process.exit(2);
}

const state = () => page.evaluate(() => {
  const m = window.__meridian;
  return { x: m.camera.position.x, y: m.camera.position.y, z: m.camera.position.z, yaw: m.camera.rotation.y, fx: m.feet.x, fy: m.feet.y, fz: m.feet.z };
});
const look = async (dyaw) => { // positive dyaw = turn left (yaw increases); mouse right => yaw decreases
  const mx = -dyaw / 0.002;
  await page.evaluate((mx) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: 0 })), mx);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const samples = [];
let shotN = 0;
const shot = async (name) => page.screenshot({ path: path.join(outDir, `${String(++shotN).padStart(2, '0')}_${name}.png`) });

/** Walk toward (tx,tz) holding W (+ optional Shift / strafe), steering by mouse. Stops within `tol` m. */
async function goto(tx, tz, { run = false, tol = 0.8, strafe = null, maxMs = 60000, label = '', bump = false } = {}) {
  await page.keyboard.down('KeyW');
  if (run) await page.keyboard.down('ShiftLeft');
  if (strafe) await page.keyboard.down(strafe);
  const t0 = Date.now();
  let last = null;
  for (;;) {
    const s = await state();
    samples.push({ ...s, label });
    const dx = tx - s.fx, dz = tz - s.fz;
    if (Math.hypot(dx, dz) < tol) break;
    if (Date.now() - t0 > maxMs) { if (!bump) check(false, `timeout walking to (${tx},${tz}) from (${s.fx.toFixed(1)},${s.fz.toFixed(1)})`); break; }
    const want = Math.atan2(-dx, -dz);
    let err = wrap(want - s.yaw);
    // Strafing offsets the heading: compensate so the net travel still points at the target.
    if (strafe) err = wrap(err + (strafe === 'KeyA' ? -0.5 : 0.5) * 0.0);
    await look(Math.max(-0.12, Math.min(0.12, err)));
    last = s;
    await page.waitForTimeout(40);
  }
  if (strafe) await page.keyboard.up(strafe);
  if (run) await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
}

// --- route ---------------------------------------------------------------------------------------------------
await shot('balcony_start');
// 1. balcony: stay facing north, strafe with D (right = -X) and A a little (real keys), then walk to the stair head
await page.keyboard.down('KeyA'); await page.waitForTimeout(500); await page.keyboard.up('KeyA');
await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
await goto(0, 6.5, { label: 'balcony' });
// 2. down the stair (z 8 -> 20), walking at normal pace
await goto(0, 19.5, { label: 'stair' });
await shot('stair_foot');
// 3. to the concourse, run (Shift) to the kiosk's south-west, around the kiosk (radius 7), to the north side
await goto(0, 35, { run: true, label: 'concourse' });
await goto(0, 50, { run: true, bump: true, maxMs: 4000, label: 'bump-kiosk' }); // straight into the kiosk
const k = await state();
console.log(`bump into kiosk: stopped ${Math.hypot(k.fx, k.fz - 50).toFixed(2)} m from its centre (footprint 3.5)`);
check(Math.hypot(k.fx, k.fz - 50) > 3.5, 'walked into the kiosk');
await goto(-12, 32, { run: true, label: 'to-column' });
await goto(-23, 32, { run: true, bump: true, maxMs: 3500, label: 'bump-column' }); // straight into a column
const c = await state();
console.log(`bump into column: stopped ${Math.hypot(c.fx + 23, c.fz - 32).toFixed(2)} m from its axis (shaft r 1.0)`);
check(Math.hypot(c.fx + 23, c.fz - 32) > 1.0, 'walked into a column');
await goto(-7, 36, { run: true, label: 'concourse2' });
await goto(-7, 50, { run: true, label: 'kiosk-west' });
await shot('kiosk_west');
await goto(-3, 60, { run: true, label: 'kiosk-north' });
await goto(0, 85, { run: true, label: 'to-arch' });
// 4. centre arch and onto island B (x in [-5,5], z from 108), then to its far end
await goto(0, 99, { label: 'arch' });
await shot('arch');
await goto(0, 130, { run: true, label: 'cross' });
await shot('island_b_start');
await goto(0, 250, { run: true, label: 'island-b' });
await shot('island_b_mid');
await goto(0, 360, { run: true, strafe: null, label: 'island-b-far' });
await shot('island_b_far');
// pressing into the end: must stop before z 380
await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
// --- bump tests: deliberately walk INTO obstacles with the real controls; collisions must hold ---------------------
await goto(0, 250, { label: 'bump-setup' });
await goto(7.5, 250, { run: true, bump: true, maxMs: 3500, label: 'bump-track' }); // into the track T4 side of island B
const trackSide = await state();
console.log(`bump into track edge: stopped at x=${trackSide.fx.toFixed(2)} (island edge at +-5)`);
check(Math.abs(trackSide.fx) <= 5, 'walked off island B onto the track');

// --- assertions ----------------------------------------------------------------------------------------------
const stair = samples.filter((s) => s.label === 'stair' || (s.label === 'balcony' && s.fz > 7.9));
const ys = samples.filter((s) => s.fz >= 8 && s.fz <= 20 && s.label !== 'balcony' || s.label === 'stair').map((s) => s.fy);
let monotone = true, maxDrop = 0;
for (let i = 1; i < ys.length; i++) { if (ys[i] > ys[i - 1] + 1e-6) monotone = false; maxDrop = Math.max(maxDrop, ys[i - 1] - ys[i]); }
const eyes = samples.filter((s) => s.label === 'stair' || s.label === 'balcony').map((s) => s.y);
console.log(`stair: feet y ${ys[0]?.toFixed(2)} -> ${ys.at(-1)?.toFixed(2)} over ${ys.length} samples; monotone=${monotone}; max single-sample drop ${maxDrop.toFixed(3)} m; eye y first ${eyes[0]?.toFixed(2)} last ${eyes.at(-1)?.toFixed(2)}`);
check(monotone, 'feet y not monotonic on the stair');
check(Math.abs(ys[0] - 6) < 0.3 && Math.abs(ys.at(-1) - 0) < 0.3, 'stair did not go 6 -> 0');
let minObs = Infinity, minCol = Infinity, minKiosk = Infinity, maxZ = -Infinity, offTrack = 0;
for (const s of samples) {
  for (const cx of COLS_X) for (const cz of COLS_Z) minCol = Math.min(minCol, Math.hypot(s.fx - cx, s.fz - cz));
  minKiosk = Math.min(minKiosk, Math.hypot(s.fx - KIOSK[0], s.fz - KIOSK[1]));
  for (const o of OBSTACLES) minObs = Math.min(minObs, Math.hypot(s.fx - o.x, s.fz - o.z) - o.r);
  maxZ = Math.max(maxZ, s.fz);
  if (s.fz > 108 && Math.abs(s.fx) > 5.0) offTrack++;
}
console.log(`min distance to a column axis ${minCol.toFixed(2)} m (shaft r 1.0), to kiosk centre ${minKiosk.toFixed(2)} m (footprint 3.5), max z ${maxZ.toFixed(1)}, samples off island B in the shed: ${offTrack}`);
check(minCol > 1.0, 'entered a column');
console.log(`closest approach to any prop obstacle (benches, lamps, signs; ${OBSTACLES.length} circles): ${minObs.toFixed(2)} m clear of footprint`);
check(minObs > 0, 'entered a prop obstacle');
check(minKiosk > 3.5, 'entered the kiosk');
check(offTrack === 0, 'left island B (track side)');
check(maxZ > 300, 'did not reach z > 300');
const fin = await state();
console.log(`final feet (${fin.fx.toFixed(1)}, ${fin.fy.toFixed(2)}, ${fin.fz.toFixed(1)})`);
check(fin.fz < 381 && Math.abs(fin.fx) <= 5, 'ended outside island B');
console.log(`console errors: ${errors.length}${errors.length ? '\n' + errors.join('\n') : ''}`);
check(errors.length === 0, 'console errors');
console.log(failures === 0 ? 'WALK TEST PASS' : `WALK TEST FAIL (${failures})`);
await browser.close();
process.exit(failures ? 1 : 0);
