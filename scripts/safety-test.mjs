// Platform-safety live test: node scripts/safety-test.mjs [--timescale=4] [--trains=3]
// A per-frame in-page recorder samples trains() phases against safety() (door openness, edge-light level) and asserts:
//  doors open only during dwell (never otherwise), first open ~1.5 s after dwell start, fully shut >= 5 s before departure,
//  edge-light level rises during approach (cruiseIn near / brake) and decays after the train stops.
import { launch, open } from './lib.mjs';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const TS = Number(arg('timescale', 4));
const NEED = Number(arg('trains', 3));
const browser = await launch();
const { page, errors } = await open(browser, `autostart=1&timescale=${TS}&q=low`, { noHmr: true });
await page.mouse.click(720, 450).catch(() => {});
await page.evaluate(() => {
  const rec = (window.__rec = { rows: [], departed: 0 });
  const names = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
  const loop = () => {
    const m = window.__meridian;
    const tr = m.trains();
    const sf = m.safety();
    for (const x of tr.trains) if (x.active) rec.rows.push([m.time, x.track, x.phase, x.noseZ, sf.open[names.indexOf(x.track)], sf.level[names.indexOf(x.track)], x.slot]);
    rec.despawns = tr.despawns;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const d = await page.evaluate(() => window.__rec.despawns ?? 0);
  if (d >= NEED) break;
  await page.waitForTimeout(1000);
}
const rows = await page.evaluate(() => window.__rec.rows);
console.log('rows', rows.length, 'phases', [...new Set(rows.map((r) => r[2]))].join(','));
let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
// group per (slot, track, visit): visits split when the phase goes back to cruiseIn or time gap
const visits = [];
const open_ = new Map();
for (const r of rows) {
  const [t, track, phase, , , , slot] = r;
  const key = `${slot}:${track}`;
  let cur = open_.get(key);
  if (!cur || (phase === 'cruiseIn' && cur.seenDwell) || t - cur.last > 3) { cur = { slot, track, rows: [], seenDwell: false, last: t }; open_.set(key, cur); visits.push(cur); }
  cur.rows.push(r); cur.last = t; if (phase === 'dwell') cur.seenDwell = true;
}
for (const v of visits) {
  const dw = v.rows.filter((r) => r[2] === 'dwell');
  if (dw.length < 5) continue; // incomplete visit
  const accel = v.rows.find((r) => r[2] === 'accel');
  if (!accel) continue;
  const tDwell0 = dw[0][0], tDepart = accel[0];
  const openRows = dw.filter((r) => r[4] > 0.01);
  const nonDwellOpen = Math.max(0, ...v.rows.filter((r) => r[2] !== 'dwell').map((r) => r[4]));
  const firstOpen = openRows[0]?.[0] - tDwell0;
  const full = dw.find((r) => r[4] >= 0.999)?.[0] - tDwell0;
  const lastOpen = openRows.length ? tDepart - openRows[openRows.length - 1][0] : null;
  const shut = dw.filter((r) => r[4] <= 0.001 && r[0] > tDwell0 + 3).sort((a, b) => a[0] - b[0])[0];
  const approach = v.rows.filter((r) => r[2] === 'brake' || (r[2] === 'cruiseIn' && r[3] < 111 + 600));
  const maxApproach = Math.max(0, ...approach.map((r) => r[5]));
  const firstApproachLevel = approach[0]?.[5] ?? 0;
  const lateDwell = dw.filter((r) => r[0] > tDwell0 + 4);
  const dwellLevelEnd = lateDwell.length ? lateDwell[Math.min(lateDwell.length - 1, 0)][5] : null;
  const lvlAfterStop = dw.find((r) => r[0] >= tDwell0 + 2.5)?.[5];
  const depLevel = Math.max(0, ...v.rows.filter((r) => r[2] === 'accel' || r[2] === 'cruiseOut').map((r) => r[5]));
  console.log(JSON.stringify({ track: v.track, firstOpenAfterStopS: +firstOpen.toFixed(2), fullyOpenAfterStopS: +full.toFixed(2), shutBeforeDepartureS: lastOpen === null ? null : +lastOpen.toFixed(2), maxOpenOutsideDwell: +nonDwellOpen.toFixed(3), edgeLevelStartApproach: +firstApproachLevel.toFixed(2), edgeLevelMaxApproach: +maxApproach.toFixed(2), edgeLevelAfterStop2_5s: +(lvlAfterStop ?? -1).toFixed(2), edgeLevelDeparture: +depLevel.toFixed(2) }));
  check(nonDwellOpen < 0.001, `${v.track}: doors open outside dwell (${nonDwellOpen})`);
  check(firstOpen >= 1.3 && firstOpen <= 1.9, `${v.track}: first open ${firstOpen}`);
  check(lastOpen === null || lastOpen >= 5, `${v.track}: shut only ${lastOpen} s before departure`);
  check(maxApproach > 0.9 && firstApproachLevel < 0.5, `${v.track}: edge level did not rise on approach (${firstApproachLevel}->${maxApproach})`);
  check((lvlAfterStop ?? 1) < 0.3, `${v.track}: edge level not fading after stop (${lvlAfterStop})`);
  check(depLevel > 0.9, `${v.track}: edge level did not rise on departure`);
  void shut;
}
check(visits.filter((v) => v.rows.some((r) => r[2] === 'accel') && v.rows.filter((r) => r[2] === 'dwell').length >= 5).length >= 1, 'no complete visits sampled');
console.log('errors', errors.length ? errors.join('\n') : 'none');
console.log(fails ? `FAILED ${fails}` : 'PASS');
await browser.close();
process.exit(fails ? 1 : 0);
