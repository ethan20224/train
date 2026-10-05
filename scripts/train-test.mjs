// Live train cycle test: node scripts/train-test.mjs [--timescale=25] [--cycles=3]
// Runs the real scheduler at ?timescale=N (debug) and asserts the arrive / brake / dwell / depart / despawn cycle.
import assert from 'node:assert/strict';
import { launch, open } from './lib.mjs';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const TS = Number(arg('timescale', 25));
const CYCLES = Number(arg('cycles', 3));
const browser = await launch();
const { page, errors } = await open(browser, `autostart=1&timescale=${TS}&q=low`);
// Start audio via the pause overlay click (user gesture) so real voices attach.
await page.mouse.click(720, 450).catch(() => {});
await page.waitForTimeout(500);
const mem0 = await page.evaluate(() => ({ ...window.__meridian.renderer.info.memory }));
const log = [];
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log(`FAIL ${msg}`); } };
const t0 = Date.now();
const seen = new Map(); // slot -> last sample
const dwellNose = [];
const accelSamples = new Map(); // slot -> [{speed, noseZ}] for the CURRENT departure
const departures = []; // finished departure sample lists (one per train)
let maxActive = 0, memMid = null;
while (Date.now() - t0 < 180000) {
  const snap = await page.evaluate(() => ({ ...window.__meridian.trains(), t: window.__meridian.time, mem: { ...window.__meridian.renderer.info.memory } }));
  const act = snap.trains.filter((x) => x.active);
  maxActive = Math.max(maxActive, act.length);
  const tracks = act.map((x) => x.track);
  check(new Set(tracks).size === tracks.length, `two trains on one track at t=${snap.t.toFixed(1)}: ${tracks}`);
  for (const tr of snap.trains) {
    if (tr.active && tr.phase === 'dwell') dwellNose.push(tr.noseZ);
    if (tr.active && (tr.phase === 'accel' || tr.phase === 'cruiseOut')) {
      const a = accelSamples.get(tr.slot) ?? [];
      a.push({ speed: tr.speed, noseZ: tr.noseZ, t: snap.t });
      accelSamples.set(tr.slot, a);
    } else if (accelSamples.has(tr.slot)) {
      departures.push(accelSamples.get(tr.slot));
      accelSamples.delete(tr.slot);
    }
    if (tr.active && (tr.phase === 'brake')) check(tr.noseZ >= 111 - 0.05, `nose overshoot ${tr.noseZ}`);
    check(tr.active === tr.visible, `slot ${tr.slot} active=${tr.active} visible=${tr.visible}`);
  }
  log.push({ t: snap.t, act: act.map((x) => `${x.track}:${x.phase}:${x.noseZ.toFixed(1)}`) });
  if (snap.despawns >= 1 && !memMid) memMid = snap.mem;
  if (snap.despawns >= CYCLES) {
    const final = snap;
    console.log(`spawns ${final.spawns} despawns ${final.despawns} voices created ${final.voicesCreated} disposed ${final.voicesDisposed} (active ${act.length}), sim time ${final.t.toFixed(0)} s, max concurrent ${maxActive}`);
    check(final.voicesCreated - final.voicesDisposed === act.length, 'voice leak: created - disposed != active');
    check(final.spawns >= 3, 'fewer than 3 spawns');
    const worst = Math.max(...dwellNose.map((z) => Math.abs(z - 111)));
    console.log(`dwell samples ${dwellNose.length}, max |noseZ - 111| = ${worst.toExponential(2)}`);
    check(dwellNose.length > 0 && worst <= 0.05, 'dwell nose not at 111 +- 0.05');
    // Departure smoothness: speed monotone non-decreasing, nose monotone increasing, per-sample speed step bounded.
    for (const a of [...departures, ...accelSamples.values()]) {
      const slot = departures.indexOf(a);
      let maxStep = 0;
      for (let i = 1; i < a.length; i++) {
        check(a[i].speed >= a[i - 1].speed - 1e-6, `slot ${slot}: speed decreased in departure`);
        check(a[i].noseZ >= a[i - 1].noseZ - 1e-6, `slot ${slot}: nose moved backward in departure`);
        maxStep = Math.max(maxStep, Math.abs(a[i].speed - a[i - 1].speed) / Math.max(1e-3, a[i].t - a[i - 1].t));
      }
      console.log(`slot ${slot}: departure samples ${a.length}, final speed ${a.at(-1).speed.toFixed(1)} m/s, max accel ${maxStep.toFixed(2)} m/s^2`);
      check(maxStep < 1.2, `slot ${slot}: departure accel too high (${maxStep})`);
    }
    const m1 = final.mem;
    console.log(`renderer.info.memory  start ${JSON.stringify(mem0)}  after 1st despawn ${JSON.stringify(memMid)}  end ${JSON.stringify(m1)}`);
    check(m1.geometries === mem0.geometries && m1.textures === mem0.textures, 'GPU geometry/texture count changed over cycles');
    break;
  }
  await page.waitForTimeout(150);
}
check(errors.length === 0, `console errors: ${errors.join(' | ')}`);
console.log(failures === 0 ? 'TRAIN TEST PASS' : `TRAIN TEST FAIL (${failures})`);
await browser.close();
process.exit(failures ? 1 : 0);
