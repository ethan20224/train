// Live route / interlocking test: node scripts/route-test.mjs [--timescale=10] [--arrivals=8]
// Runs the real scheduler in the browser at ?timescale=N, forces tickets onto all six platforms and samples every frame:
//  no two trains hold the same edge / node, every rendered bogie point stays within 2 cm of its route path, platform stops at
//  nose z = 111 +- 0.05, speed <= 11.5 m/s while any end of a train is in the throat zone (z 392..870), no NaN, pooled GPU
//  objects stable across cycles, voices created - disposed = active, no console errors.
import { launch, open } from './lib.mjs';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const TS = Number(arg('timescale', 10));
const NEED = Number(arg('arrivals', 8));
const browser = await launch();
const { page, errors } = await open(browser, `autostart=1&timescale=${TS}&q=low`, { noHmr: true });
await page.mouse.click(720, 450).catch(() => {});
await page.waitForTimeout(500);
const mem0 = await page.evaluate(() => ({ ...window.__meridian.renderer.info.memory }));
await page.evaluate(() => {
  const rec = (window.__rec = { frames: 0, conflicts: new Set(), throatMaxV: 0, nan: false, dev: 0, devPoints: 0, stopErr: 0, stops: 0, dwellPlatforms: new Set(), maxActive: 0, kinds: {} });
  let nextReq = 0;
  let reqIdx = 0;
  const loop = () => {
    const m = window.__meridian;
    const rc = m.routeCheck();
    rec.frames++;
    for (const c of rc.conflicts) rec.conflicts.add(c);
    rec.throatMaxV = Math.max(rec.throatMaxV, rc.throatMaxV);
    rec.nan ||= rc.nan;
    const bd = m.bogieDeviation();
    rec.dev = Math.max(rec.dev, bd.max);
    rec.devPoints += bd.points;
    const tr = m.trains();
    let act = 0;
    for (const t of tr.trains) {
      if (t.active) act++;
      if (t.active) rec.kinds[t.kind] = (rec.kinds[t.kind] ?? 0) + 1;
      if (t.active && t.kind === 'dwell') {
        rec.stops++;
        rec.stopErr = Math.max(rec.stopErr, Math.abs(t.noseZ - 111));
        rec.dwellPlatforms.add(t.track);
      }
    }
    rec.maxActive = Math.max(rec.maxActive, act);
    // ticket ritual on every platform in turn
    if (m.time > nextReq) {
      m.traffic.requestTrain(reqIdx++ % 6);
      nextReq = m.time + 22;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const t0 = Date.now();
let snap;
while (Date.now() - t0 < 300000) {
  snap = await page.evaluate(() => ({ ...window.__meridian.trains(), rec: { ...window.__rec, conflicts: [...window.__rec.conflicts], dwellPlatforms: [...window.__rec.dwellPlatforms] }, mem: { ...window.__meridian.renderer.info.memory }, t: window.__meridian.time }));
  if (snap.arrivals >= NEED && snap.departures >= NEED && snap.rec.dwellPlatforms.length === 6 && snap.shuntsIn + snap.shuntsOut >= 1) break;
  await page.waitForTimeout(1000);
}
const act = snap.trains.filter((x) => x.active).length;
let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const r = snap.rec;
console.log(JSON.stringify({ simTime: +snap.t.toFixed(0), frames: r.frames, arrivals: snap.arrivals, departures: snap.departures, shuntsIn: snap.shuntsIn, shuntsOut: snap.shuntsOut, blocked: snap.blockedArrivals, held: snap.heldDepartures, maxActive: r.maxActive, platformsSeen: r.dwellPlatforms.sort(), kinds: r.kinds }));
console.log(`conflicts ${r.conflicts.length}, bogie deviation max ${(r.dev * 100).toExponential(2)} cm over ${r.devPoints} samples, stop error ${r.stopErr.toExponential(2)} m over ${r.stops} dwell samples, max speed in throat zone ${r.throatMaxV.toFixed(2)} m/s`);
console.log(`renderer.info.memory start ${JSON.stringify(mem0)} end ${JSON.stringify(snap.mem)}; voices created ${snap.voicesCreated} disposed ${snap.voicesDisposed} active ${act}`);
check(snap.arrivals >= NEED && snap.departures >= NEED, `only ${snap.arrivals} arrivals / ${snap.departures} departures`);
check(r.dwellPlatforms.length === 6, `platforms served: ${r.dwellPlatforms}`);
check(snap.shuntsIn + snap.shuntsOut >= 1, 'no yard shunt happened');
check(r.conflicts.length === 0, `conflicting reservations: ${r.conflicts.slice(0, 5)}`);
check(r.dev <= 0.02, `bogie deviation ${r.dev} m`);
check(r.stops > 0 && r.stopErr <= 0.05, `stop error ${r.stopErr}`);
check(r.throatMaxV <= 11.5, `throat speed ${r.throatMaxV}`);
check(!r.nan, 'NaN in train state');
check(snap.mem.geometries === mem0.geometries && snap.mem.textures === mem0.textures, 'GPU geometry / texture count changed');
check(snap.voicesCreated - snap.voicesDisposed === act, 'voice leak');
check(errors.length === 0, `console errors: ${errors.join(' | ')}`);
console.log(fails === 0 ? 'ROUTE TEST PASS' : `ROUTE TEST FAIL (${fails})`);
await browser.close();
process.exit(fails ? 1 : 0);
