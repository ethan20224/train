// Ad-hoc experiment runner: node scripts/exp.mjs "<query>" <out.png> [--eval=<js file run in page before the shot>] [--w=1440] [--h=900] [--dpr=1] [--wait=3000]
// Requires the dev server on :5173. Real-GPU Chrome (ANGLE/Metal).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const pos = args.filter((a) => !a.startsWith('--'));
const [query, out] = pos;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const ctx = await browser.newContext({ viewport: { width: +opt('w', 1440), height: +opt('h', 900) }, deviceScaleFactor: +opt('dpr', 1) });
const page = await ctx.newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5173/?${query}&autostart=1&debug=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__meridian?.ready === true, undefined, { timeout: 180000 });
if (opt('eval')) console.log(JSON.stringify(await page.evaluate(await fs.readFile(opt('eval'), 'utf8'))));
await page.waitForTimeout(+opt('wait', 3000));
await fs.mkdir(path.dirname(path.join(root, out)), { recursive: true });
await page.screenshot({ path: path.join(root, out) });
console.log('fps', (await page.evaluate(() => window.__meridian.fps)).toFixed(1), '->', out);
await browser.close();
