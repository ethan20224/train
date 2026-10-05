// Adaptive-quality perf test: node scripts/perf-test.mjs [presets=balcony,concourse,platform] [--sizes=1440x900@1,1470x956@2] [--secs=20] [--q=auto]
// Loads /?cam=<preset>&autostart=1 (no ?q => adaptive controller) and logs fps + pixelRatio + rung once per second.
import { launch, open } from './lib.mjs';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const presets = (pos[0] ?? 'balcony,concourse,platform').split(',');
const sizes = arg('sizes', '1440x900@1,1470x956@2').split(',').map((s) => { const [wh, d] = s.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: Number(d) }; });
const secs = Number(arg('secs', 20));
const q = arg('q', '');
const browser = await launch();
const rows = [];
for (const sz of sizes) for (const preset of presets) {
  const { page, errors, context } = await open(browser, `cam=${preset}&autostart=1${q ? `&q=${q}` : ''}`, sz);
  const series = [];
  for (let i = 0; i < secs; i++) {
    await page.waitForTimeout(1000);
    series.push(await page.evaluate(() => ({ fps: window.__meridian.fps, pr: window.__meridian.quality.pixelRatio, lvl: window.__meridian.quality.level })));
  }
  const tail = series.slice(-5);
  const avg = tail.reduce((a, b) => a + b.fps, 0) / tail.length;
  const changes = series.filter((s, i) => i > 0 && s.lvl !== series[i - 1].lvl).length;
  console.log(`${sz.w}x${sz.h}@${sz.dpr} ${preset.padEnd(9)} fps(last5 avg) ${avg.toFixed(1)}  final rung ${series.at(-1).lvl} pr ${series.at(-1).pr}  rung changes ${changes}  errors ${errors.length}`);
  console.log('   ' + series.map((s) => `${s.fps.toFixed(0)}/${s.pr}`).join(' '));
  rows.push({ sz, preset, avg, rung: series.at(-1).lvl, pr: series.at(-1).pr, changes });
  await context.close();
}
await browser.close();
