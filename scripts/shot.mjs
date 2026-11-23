// Screenshot + perf harness. Usage:
//   npm run shot -- <preset|all> [more presets] [--headed] [--bundled] [--q=high|med|low|auto] [--wait=3000] [--out=<subdir of shots/>]
// Starts the Vite dev server on :5173 if it is not already running (and stops it afterwards),
// opens /?cam=<preset>&autostart=1&debug=1&q=<q>, waits for window.__meridian.ready, waits ~3 s,
// saves shots/<preset>.png at 1440x900 and prints fps / draw calls / triangles + the WebGL renderer string.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5173;
const BASE = `http://localhost:${PORT}`;

// Keep in sync with PRESET_NAMES in src/core/presets.ts (read from the source to avoid drift).
const presetSrc = await fs.readFile(path.join(root, 'src/core/presets.ts'), 'utf8');
const names = [...(presetSrc.match(/PRESET_NAMES\s*=\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (names.length === 0) throw new Error('could not read PRESET_NAMES from src/core/presets.ts');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const p = `--${n}=`; const a = args.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : d; };
const positional = args.filter((a) => !a.startsWith('--'));
const wanted = positional.length === 0 || positional.includes('all') ? names : positional;
for (const w of wanted) if (!names.includes(w)) throw new Error(`unknown preset "${w}". Known: ${names.join(', ')}`);
const quality = opt('q', 'high');
const settleMs = Number(opt('wait', '3000'));
const extra = opt('extra', '');

async function serverUp() {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  console.log(`starting vite dev server on :${PORT}`);
  server = spawn(path.join(root, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  for (let i = 0; i < 100 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 200));
  if (!(await serverUp())) {
    server.kill();
    throw new Error('vite dev server did not start');
  }
}
const stopServer = () => {
  if (server && !server.killed) server.kill('SIGTERM');
};
process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

// Real-GPU launch args (ANGLE -> Metal on macOS). Falls back to bundled chromium if Chrome is absent.
const gpuArgs = [
  '--use-angle=metal',
  '--use-gl=angle',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-zero-copy',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];
const headless = !flag('headed');
let browser;
let launched = '';
if (!flag('bundled')) {
  try {
    browser = await chromium.launch({ channel: 'chrome', headless, args: gpuArgs });
    launched = 'Google Chrome (channel: chrome)';
  } catch (e) {
    console.warn(`Chrome channel unavailable (${String(e).split('\n')[0]}); falling back to bundled chromium`);
  }
}
if (!browser) {
  browser = await chromium.launch({ headless, args: gpuArgs });
  launched = 'Playwright bundled chromium';
}
console.log(`browser: ${launched}, ${headless ? 'headless' : 'headed'}, quality=${quality}`);

const outDir = path.join(root, 'shots', opt('out', ''));
await fs.mkdir(outDir, { recursive: true });
let exitCode = 0;
try {
  let printedGpu = false;
  for (const name of wanted) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const logs = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

    const qs = extra ? `&${extra}` : '';
    await page.goto(`${BASE}/?cam=${name}&autostart=1&debug=1&q=${quality}${qs}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__meridian?.ready === true, undefined, { timeout: 180000 });
    await page.waitForTimeout(settleMs);

    if (!printedGpu) {
      const gpu = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return 'no webgl2';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? `${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)} | ${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}` : gl.getParameter(gl.RENDERER);
      });
      console.log(`WebGL renderer: ${gpu}${/swiftshader|llvmpipe|software/i.test(gpu) ? '   <-- SOFTWARE rendering, fps not representative' : ''}`);
      printedGpu = true;
    }

    const out = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: out });
    const m = await page.evaluate(() => window.__meridian);
    console.log(
      `${name.padEnd(10)} fps ${m.fps.toFixed(1).padStart(5)}  draw calls ${String(m.drawCalls).padStart(4)}  triangles ${m.triangles.toLocaleString('en-US').padStart(9)}  -> ${path.relative(root, out)}`,
    );
    for (const l of logs) console.log(`    ${l}`);
    if (logs.some((l) => l.startsWith('[pageerror]'))) exitCode = 1;
    await context.close();
  }
} finally {
  await browser.close();
  stopServer();
}
process.exit(exitCode);
