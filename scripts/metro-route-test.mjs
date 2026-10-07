// Meridian Deep Phase 1 route through the REAL controls: node scripts/metro-route-test.mjs [--headed]
// balcony -> oculus gangway -> disc ride (frame timing across the airlock) -> F6 down/up -> F5/F4/F3/F2/F1 up the up units -> hall.
import { launch, open } from './lib.mjs';
const headed = process.argv.includes('--headed');
const browser = await launch({ headed });
const { page, errors } = await open(browser, 'q=med', { noHmr: true });
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log(`FAIL ${m}`); } else console.log(`ok   ${m}`); };
await page.click('#intro .prompt');
await page.waitForTimeout(2500);
if (!(await page.evaluate(() => window.__meridian.locked()))) { await page.mouse.click(720, 450); await page.waitForTimeout(300); }
if (!(await page.evaluate(() => window.__meridian.locked()))) { console.log('NOTE: no pointer lock'); await browser.close(); process.exit(2); }
const state = () => page.evaluate(() => { const m = window.__meridian; return { yaw: m.camera.rotation.y, fx: m.feet.x, fy: m.feet.y, fz: m.feet.z, metro: m.metro(), prompt: m.ticketUi().prompt }; });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const look = (dyaw) => page.evaluate((mx) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: 0 })), -dyaw / 0.002);
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
await via([[-50, 72], [-10, 70], [-5, 68], [7.0, 68.5]]);
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
