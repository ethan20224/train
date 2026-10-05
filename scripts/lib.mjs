// Shared Playwright launch for the test scripts (real-GPU Chrome via ANGLE/Metal; requires the dev server on :5173).
import { chromium } from 'playwright';
export const BASE = 'http://localhost:5173';
export const GPU_ARGS = ['--use-angle=metal', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
export async function launch({ headed = false } = {}) {
  return chromium.launch({ channel: 'chrome', headless: !headed, args: GPU_ARGS });
}
export async function open(browser, query, { w = 1440, h = 900, dpr = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(`${BASE}/?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__meridian?.ready === true, undefined, { timeout: 180000 });
  return { context, page, errors };
}
