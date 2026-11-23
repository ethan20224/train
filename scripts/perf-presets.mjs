// Headed real-GPU frame-time measurement per preset, auto quality:
//   node scripts/perf-presets.mjs [presets] [--sizes=1440x900@1,1470x956@2] [--warm=10] [--secs=20] [--extra=timescale=8] [--wait-trains=3]
// Reports avg fps, p95 / max frame ms (rAF deltas), draw calls, triangles, final quality rung.
import { launch, open } from './lib.mjs';
const arg = (n, d) => { const p = `--${n}=`; const a = process.argv.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : d; };
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const presets = (pos[0] ?? 'balcony,concourse,oculus,rim,void,strata,escalator,threshold,crossing').split(',');
const sizes = arg('sizes', '1440x900@1,1470x956@2').split(',').map((s) => { const [wh, d] = s.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: Number(d) }; });
const warm = Number(arg('warm', 10)); const secs = Number(arg('secs', 20));
const extra = arg('extra', '');
const waitTrains = Number(arg('wait-trains', extra ? '3' : '0'));
const browser = await launch({ headed: true });
for (const sz of sizes) for (const preset of presets) {
  const qs = `cam=${preset}&autostart=1${extra ? `&${extra}` : ''}`;
  const { page, errors, context } = await open(browser, qs, sz);
  await page.waitForTimeout(warm * 1000);
  if (waitTrains > 0) {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const n = await page.evaluate(() => window.__meridian?.metro?.()?.trains?.length ?? 0);
      if (n >= waitTrains) break;
      await page.waitForTimeout(200);
    }
  }
  await page.evaluate(() => { const d = []; window.__pf = d; let last = performance.now(); const f = (t) => { d.push(t - last); last = t; window.__pfid = requestAnimationFrame(f); }; window.__pfid = requestAnimationFrame(f); });
  await page.waitForTimeout(secs * 1000);
  const r = await page.evaluate(() => {
    cancelAnimationFrame(window.__pfid);
    const m = window.__meridian;
    return { d: window.__pf.slice(1), calls: m.drawCalls, tris: m.triangles, lvl: m.quality.level, pr: m.quality.pixelRatio, trains: m.metro?.()?.trains?.length ?? 0 };
  });
  const t = [...r.d].sort((a, b) => a - b);
  const avg = 1000 / (r.d.reduce((a, b) => a + b, 0) / r.d.length);
  console.log(`${sz.w}x${sz.h}@${sz.dpr} ${preset.padEnd(10)} avg ${avg.toFixed(1)} fps  p95 ${t[Math.floor(t.length * 0.95)].toFixed(1)} ms  max ${t.at(-1).toFixed(1)} ms  calls ${r.calls}  tris ${(r.tris / 1e6).toFixed(2)}M  trains ${r.trains}  rung ${r.lvl} pr ${r.pr.toFixed?.(2) ?? r.pr}  err ${errors.length}`);
  await context.close();
}
await browser.close();
