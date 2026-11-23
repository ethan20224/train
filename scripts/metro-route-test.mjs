// Meridian Deep route through the REAL controls: node scripts/metro-route-test.mjs [--headed]
// balcony -> oculus gangway -> disc ride -> F6 down/up -> lift -70/-82/-70 -> funicular -70/-30/-70 ->
// 3-min sim dwell on Crossing floor (?timescale=4: all 3 lines arrive, PSD sync, <= 50 ms) -> F5/F4/F3/F2/F1 -> hall.
import { launch, open } from './lib.mjs';
const headed = process.argv.includes('--headed');
const browser = await launch({ headed });
const { page, errors } = await open(browser, 'q=med&timescale=4', { noHmr: true });
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log(`FAIL ${m}`); } else console.log(`ok   ${m}`); };
await page.click('#intro .prompt');
await page.waitForTimeout(2500);
if (!(await page.evaluate(() => window.__meridian.locked()))) { await page.mouse.click(720, 450); await page.waitForTimeout(300); }
if (!(await page.evaluate(() => window.__meridian.locked()))) { console.log('NOTE: no pointer lock'); await browser.close(); process.exit(2); }
const state = () => page.evaluate(() => { const m = window.__meridian; return { yaw: m.camera.rotation.y, pitch: m.camera.rotation.x, ey: m.camera.position.y, fx: m.feet.x, fy: m.feet.y, fz: m.feet.z, metro: m.metro(), prompt: m.ticketUi().prompt }; });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const look = (dyaw, dpitch = 0) => page.evaluate(([mx, my]) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: my })), [-dyaw / 0.002, -dpitch / 0.002]);
async function aimAt(tx, ty, tz) {
  for (let i = 0; i < 4; i++) {
    const s = await state();
    const dx = tx - s.fx, dy = ty - s.ey, dz = tz - s.fz;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1);
    await look(wrap(yaw - s.yaw), pitch - s.pitch);
    await page.waitForTimeout(40);
  }
}
async function levelPitch() {
  const s = await state();
  await look(0, -s.pitch);
  await page.waitForTimeout(40);
}
async function goto(tx, tz, { tol = 0.3, maxMs = 90000 } = {}) {
  await page.keyboard.down('KeyW');
  const t0 = Date.now(); let ok = false; let last = null; let lastT = Date.now();
  for (;;) {
    const s = await state(); const dx = tx - s.fx; const dz = tz - s.fz;
    if (Math.hypot(dx, dz) < tol) { ok = true; break; }
    if (Date.now() - t0 > maxMs) break;
    if (!last || Math.hypot(s.fx - last.fx, s.fz - last.fz) > 0.05) { last = s; lastT = Date.now(); } else if (Date.now() - lastT > 5000) break;
    await look(wrap(Math.atan2(-dx, -dz) - s.yaw) * 0.6);
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('KeyW'); await page.waitForTimeout(300);
  const s = await state();
  check(ok, `reach (${tx}, ${tz}) -> (${s.fx.toFixed(2)}, ${s.fy.toFixed(2)}, ${s.fz.toFixed(2)})`);
  return s;
}
const waitFor = async (pred, ms, label) => { const t0 = Date.now(); for (;;) { const s = await state(); if (pred(s)) return s; if (Date.now() - t0 > ms) { check(false, label); return s; } await page.waitForTimeout(200); } };

const marks = [];
const mark = async (name) => { marks.push({ name, i: await page.evaluate(() => window.__frames.length) }); };
await page.evaluate(() => { const d = []; window.__frames = d; let last = performance.now(); const f = (t) => { d.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
await mark('start');
for (const [x, z] of [[0, 22], [9, 50], [0, 60], [0, 63.4]]) await goto(x, z, { tol: 0.6 });
await mark('hall walk');
await waitFor((s) => s.metro.disc.docked === 'top', 40000, 'disc docked at the top');
await goto(0, 74, { tol: 0.4 });
const f0 = await page.evaluate(() => window.__frames.length);
const arrived = await waitFor((s) => s.metro.disc.docked === 'bottom' && s.fy < -69.9, 60000, 'disc arrived at the Crossing floor');
const frames = await page.evaluate((i) => window.__frames.slice(i), f0);
const sorted = [...frames].sort((a, b) => a - b);
console.log(`disc ride frames: n=${frames.length} p95=${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(1)} ms max=${sorted.at(-1)?.toFixed(1)} ms`);
check(sorted.at(-1) <= 50, `no frame > 50 ms across the airlock (max ${sorted.at(-1)?.toFixed(1)})`);
await mark('disc ride');
check(arrived.metro.zone === 'deep', 'zone is deep at the bottom');
// Waypoints skirt the disc well (r 4.4), the F6 floor opening (x -46.7..-40.6, z 65.6..70), the lift tubes, the F5/F4
// footprints and the F5 deck opening; escalators are boarded at their correct ends (tol 0.1 = on the 0.3 m corridor).
const via = async (pts, tol = 0.5) => { for (const [x, z] of pts) await goto(x, z, { tol }); };
await via([[0, 67], [-30, 72], [-50, 72], [-50, 66.8]]);
await goto(-25.2, 66.8, { tol: 0.4 });                                   // F6 down unit
check((await state()).fy < -81.9, 'F6 down to Halcyon');
await goto(-25.2, 68.8, { tol: 0.1 }); await goto(-50, 68.8);            // F6 up unit
check(Math.abs((await state()).fy + 70) < 0.01, 'F6 up to the Crossing floor');
await mark('deep: F6 down/up');

// Capsule lift leg (P3-8a): Crossing (-70) -> Halcyon (-82) -> Crossing (-70) via real E controls
await via([[-50, 71.2], [-14.2, 71.2], [-14.2, 80.0]]);
{
  let s = await state();
  if (!(s.metro.lifts[1].docked === 1 && s.metro.lifts[1].state === 'open')) {
    const a = -0.52;
    await aimAt(-17 + 1.48 * Math.cos(a), -70 + 1.15, 80 + 1.48 * Math.sin(a));
    await page.waitForTimeout(100);
    s = await state();
    check(s.prompt.toLowerCase().includes('call lift'), `lift call prompt visible (${s.prompt})`);
    await page.keyboard.press('KeyE');
    await levelPitch();
    await waitFor((st) => st.metro.lifts[1].docked === 1 && st.metro.lifts[1].state === 'open', 45000, 'lift 1 arrived & opened at Crossing (-70)');
  }
  await goto(-17.0, 80.0, { tol: 0.2 });
  s = await state();
  const a0 = s.metro.lifts[1].doorAngle - 0.64;
  await aimAt(-17 + 1.17 * Math.cos(a0), -70 + 1.06, 80 + 1.17 * Math.sin(a0));
  await page.waitForTimeout(100);
  s = await state();
  check(s.prompt.toLowerCase().includes('halcyon'), `lift Halcyon button prompt visible (${s.prompt})`);
  await page.keyboard.press('KeyE');
  await levelPitch();
  const atHal = await waitFor((st) => st.metro.lifts[1].docked === 2 && st.metro.lifts[1].state === 'open' && st.fy < -81.9, 30000, 'lift 1 rode down to Halcyon (-82)');
  check(atHal.fy < -81.9, 'lift 1 carried rider to Halcyon (-82)');
  await goto(-15.0, 78.0, { tol: 0.35 });                                  // step onto Halcyon island centre line
  check((await state()).fy < -81.9, 'stepped out of lift onto Halcyon island');
  s = await state();
  if (!(s.metro.lifts[1].docked === 2 && s.metro.lifts[1].state === 'open')) {
    const aCall = -Math.PI / 4 - 0.52;
    await aimAt(-17 + 1.48 * Math.cos(aCall), -82 + 1.15, 80 + 1.48 * Math.sin(aCall));
    await page.waitForTimeout(100);
    await page.keyboard.press('KeyE');
    await levelPitch();
    await waitFor((st) => st.metro.lifts[1].docked === 2 && st.metro.lifts[1].state === 'open', 45000, 'lift 1 re-opened at Halcyon (-82)');
  }
  await goto(-17.0, 80.0, { tol: 0.2 });                                   // re-board lift 1
  s = await state();
  const a1 = s.metro.lifts[1].doorAngle - 0.64;
  await aimAt(-17 + 1.17 * Math.cos(a1), -82 + 1.24, 80 + 1.17 * Math.sin(a1));
  await page.waitForTimeout(100);
  s = await state();
  check(s.prompt.toLowerCase().includes('crossing'), `lift Crossing button prompt visible (${s.prompt})`);
  await page.keyboard.press('KeyE');
  await levelPitch();
  const backCrs = await waitFor((st) => st.metro.lifts[1].docked === 1 && st.metro.lifts[1].state === 'open' && Math.abs(st.fy + 70) < 0.05, 30000, 'lift 1 rode up to Crossing (-70)');
  check(Math.abs(backCrs.fy + 70) < 0.05, 'lift 1 carried rider back up to Crossing (-70)');
  await goto(-14.2, 80.0, { tol: 0.35 });
}
await mark('lift -70/-82/-70');

// Inclined funicular leg (P3-8b): Crossing (-70) -> Threshold (-30) -> Crossing (-70)
await via([[-14.2, 71.0], [-10, 66.0], [55.0, 66.0], [55.0, 71.0]]);
await waitFor((st) => st.metro.funicular.docked === 'bottom' && st.metro.funicular.state === 'docked', 45000, 'funicular docked at Crossing (-70)');
await goto(55.0, 74.0, { tol: 0.3 });
const atFunTop = await waitFor((st) => st.metro.funicular.docked === 'top' && st.metro.funicular.state === 'docked' && Math.abs(st.fy + 30) < 0.05, 45000, 'funicular carried rider up to Threshold (-30)');
check(Math.abs(atFunTop.fy + 30) < 0.05, 'funicular arrived flush at Threshold (-30)');
await via([[22.3, 76.6], [18.5, 76.6], [22.3, 76.6]], 0.35);               // step onto Threshold annulus & return
await goto(22.3, 74.0, { tol: 0.3 });                                      // re-board funicular
const atFunBot = await waitFor((st) => st.metro.funicular.docked === 'bottom' && st.metro.funicular.state === 'docked' && Math.abs(st.fy + 70) < 0.05, 45000, 'funicular carried rider back down to Crossing (-70)');
check(Math.abs(atFunBot.fy + 70) < 0.05, 'funicular returned flush to Crossing (-70)');
await via([[55.0, 71.0], [55.0, 66.0], [7.0, 66.0], [7.0, 68.5]]);
await mark('funicular -70/-30');

// Phase 4 (P4-6): 3-minute simulated dwell on the Crossing floor at ?timescale=4 (45 s real time -> 180 s sim time).
// Assert trains arrive on all three lines, screen doors open ONLY alongside stopped trains, and max frame <= 50 ms on spawn/wave.
{
  await aimAt(-24, -64, 70);
  const fDwell0 = await page.evaluate(() => window.__frames.length);
  const tSim0 = await page.evaluate(() => window.__meridian.time ?? 0);
  const arrivedLines = new Set();
  const openedPsdLines = new Set();
  let badPsdOpen = 0;
  let badPsdDetail = '';
  let maxTrainsSeen = 0;
  const wallStart = Date.now();
  while (Date.now() - wallStart < 90000) {
    const snap = await page.evaluate(() => ({ t: window.__meridian.time ?? 0, m: window.__meridian.metro() }));
    const ts = snap.m.trains ?? [];
    const psds = snap.m.psd ?? [];
    if (ts.length > maxTrainsSeen) maxTrainsSeen = ts.length;
    for (const tr of ts) if (tr.phase === 'stopped') arrivedLines.add(tr.line);
    for (const p of psds) {
      if (p.maxOpen > 0.01) {
        openedPsdLines.add(p.line);
        const hasStopped = ts.some((tr) => tr.line === p.line && tr.track === p.track && tr.phase === 'stopped');
        if (!hasStopped) {
          badPsdOpen++;
          badPsdDetail = `${p.line}${p.track} open=${p.maxOpen.toFixed(2)}`;
        }
      }
    }
    if (snap.t - tSim0 >= 180) break;
    await page.waitForTimeout(100);
  }
  const dwellFrames = await page.evaluate((i) => window.__frames.slice(i), fDwell0);
  const ds = [...dwellFrames].sort((a, b) => a - b);
  const dwellMax = ds.at(-1) ?? 0;
  const dwellP95 = ds[Math.floor(ds.length * 0.95)] ?? 0;
  console.log(`crossing 3-min dwell: arrived=[${[...arrivedLines].sort().join(',')}] psdOpen=[${[...openedPsdLines].sort().join(',')}] maxTrains=${maxTrainsSeen} frames=${dwellFrames.length} p95=${dwellP95.toFixed(1)} ms max=${dwellMax.toFixed(1)} ms`);
  check(arrivedLines.size === 3, `trains arrived on all three lines (${[...arrivedLines].sort().join(', ')})`);
  check(openedPsdLines.size === 3, `screen doors opened on all three lines (${[...openedPsdLines].sort().join(', ')})`);
  check(badPsdOpen === 0, `screen doors opened only alongside stopped trains (violations=${badPsdOpen} ${badPsdDetail})`);
  check(dwellMax <= 50, `no frame > 50 ms during 3-min Crossing train dwell (max ${dwellMax.toFixed(1)})`);
  await levelPitch();
}
await mark('Crossing 3m dwell');

await goto(7.0, 71.4, { tol: 0.1 }); await goto(7.0, 114.3, { tol: 0.3 }); // F5 up to the Meridian island
check(Math.abs((await state()).fy + 46) < 0.01, 'F5 up to the Meridian island');
await mark('F5');
await via([[1.0, 114.5], [1.0, 106], [6.5, 100], [6.5, 66], [2.0, 60], [2.0, 51]]);
await goto(7.0, 51.0, { tol: 0.1 }); await goto(7.0, 80.5, { tol: 0.3 });  // F4 up through the sky
check(Math.abs((await state()).fy + 30) < 0.01, 'F4 up to the Threshold');
await mark('F4');
await goto(0, 93.0, { tol: 0.5 });                                        // Threshold north edge, facing north
check((await state()).prompt === '', 'no surface prompt at the Threshold north edge');
await goto(11.2, 84, { tol: 0.5 });
await goto(11.2, 80.5, { tol: 0.1 }); await goto(11.2, 61.9, { tol: 0.3 }); // F3 up
await goto(7.0, 61.9, { tol: 0.1 }); await goto(7.0, 80.5, { tol: 0.3 });   // F2 up
await goto(11.2, 80.5, { tol: 0.1 }); await goto(11.2, 61.9, { tol: 0.3 }); // F1 up
await mark('F3/F2/F1');
const top = await state();
check(Math.abs(top.fy) < 0.01 && top.metro.zone === 'surface', 'back on the hall floor, zone surface');
await goto(0, 60, { tol: 0.8 });
await mark('hall return');
{
  const all = await page.evaluate(() => window.__frames.slice(1)); // frame 0 spans page load / first rAF
  const stat = (a) => { const t = [...a].sort((x, y) => x - y); return { n: t.length, p95: t[Math.floor(t.length * 0.95)] ?? 0, max: t.at(-1) ?? 0 }; };
  let prev = 1; let worst = 0;
  for (const m of marks.slice(1)) {
    const st = stat(all.slice(prev - 1, m.i - 1)); prev = m.i; worst = Math.max(worst, st.max);
    console.log(`leg ${m.name.padEnd(18)} n=${String(st.n).padStart(5)} p95=${st.p95.toFixed(1)} ms max=${st.max.toFixed(1)} ms`);
  }
  const whole = stat(all);
  console.log(`WHOLE ROUTE n=${whole.n} p95=${whole.p95.toFixed(1)} ms max=${whole.max.toFixed(1)} ms`);
  check(whole.max <= 50, `no frame > 50 ms over the whole route (max ${whole.max.toFixed(1)})`);
}
check(errors.length === 0, `no console errors (${errors.join(' | ')})`);
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nPASS');
process.exit(failures ? 1 : 0);
