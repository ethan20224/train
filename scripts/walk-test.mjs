// Phase 4: lounge -> stair -> gates blocked without a ticket -> booking window (E) -> ticket card -> gate lane -> platform
// -> train arrives -> bridge stair -> deck -> descend another island's stair.
// Walk test through the REAL controls: node scripts/walk-test.mjs [--headed] [--out=walk]
// Loads / (no ?cam), clicks the intro, requests pointer lock via that click, then holds W/A/D/Shift and steers with
// mouse-movement events (PointerLockControls) along: balcony -> down the stair -> around the kiosk -> centre arch ->
// island B to the far end. Asserts stair descent, no collisions with columns / kiosk / tracks, reaches z > 300.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launch, open } from './lib.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const headed = process.argv.includes('--headed');
const outDir = path.join(root, 'shots', arg('out', 'walk'));
await fs.mkdir(outDir, { recursive: true });

const COLS_X = [-23, 23], COLS_Z = [20, 32, 44, 56, 68, 80];
const KIOSK = [0, 50, 3.5];
const OBSTACLES = JSON.parse(execFileSync(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'scripts/dump-obstacles.ts')], { encoding: 'utf8' }));
const browser = await launch({ headed });
const { page, errors } = await open(browser, 'q=med', { noHmr: true });
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log(`FAIL ${m}`); } };

await page.evaluate(() => window.__meridian.setRequireTicket(true)); // gated mode under test (the shipped switch may be off)
// Enter through the real intro button (a trusted click = user gesture => pointer lock + audio start).
await page.click('#intro .prompt');
await page.waitForTimeout(2500); // fade
let locked = await page.evaluate(() => window.__meridian.locked());
console.log(`pointer lock after intro click: ${locked}`);
if (!locked) {
  await page.mouse.click(720, 450);
  await page.waitForTimeout(300);
  locked = await page.evaluate(() => window.__meridian.locked());
  console.log(`pointer lock after extra click: ${locked}`);
}
if (!locked) {
  console.log('NOTE: pointer lock NOT obtained; movement keys are ignored by the controller when unlocked.');
  await browser.close();
  process.exit(2);
}

const state = () => page.evaluate(() => {
  const m = window.__meridian;
  return { x: m.camera.position.x, y: m.camera.position.y, z: m.camera.position.z, yaw: m.camera.rotation.y, fx: m.feet.x, fy: m.feet.y, fz: m.feet.z };
});
const look = async (dyaw) => { // positive dyaw = turn left (yaw increases); mouse right => yaw decreases
  const mx = -dyaw / 0.002;
  await page.evaluate((mx) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: 0 })), mx);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const samples = [];
let shotN = 0;
const shot = async (name) => page.screenshot({ path: path.join(outDir, `${String(++shotN).padStart(2, '0')}_${name}.png`) });

/** Walk toward (tx,tz) holding W (+ optional Shift / strafe), steering by mouse. Stops within `tol` m. */
async function goto(tx, tz, { run = false, tol = 0.8, strafe = null, maxMs = 60000, label = '', bump = false } = {}) {
  await page.keyboard.down('KeyW');
  if (run) await page.keyboard.down('ShiftLeft');
  if (strafe) await page.keyboard.down(strafe);
  const t0 = Date.now();
  let last = null;
  let still = Date.now(), stillPos = null;
  for (;;) {
    const s = await state();
    // bump runs end when the player has stopped moving for 2 s (robust to slow frame rates), not on a fixed wall clock
    if (bump) {
      if (!stillPos || Math.hypot(s.fx - stillPos.fx, s.fz - stillPos.fz) > 0.05) { stillPos = s; still = Date.now(); }
      else if (Date.now() - still > 2000) break;
    }
    samples.push({ ...s, label });
    const dx = tx - s.fx, dz = tz - s.fz;
    if (Math.hypot(dx, dz) < tol) break;
    if (Date.now() - t0 > (bump ? Math.max(maxMs, 40000) : maxMs)) { if (!bump) check(false, `timeout walking to (${tx},${tz}) from (${s.fx.toFixed(1)},${s.fz.toFixed(1)})`); break; }
    const want = Math.atan2(-dx, -dz);
    let err = wrap(want - s.yaw);
    // Strafing offsets the heading: compensate so the net travel still points at the target.
    if (strafe) err = wrap(err + (strafe === 'KeyA' ? -0.5 : 0.5) * 0.0);
    await look(Math.max(-0.12, Math.min(0.12, err)));
    last = s;
    await page.waitForTimeout(40);
  }
  if (strafe) await page.keyboard.up(strafe);
  if (run) await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
}

// --- route ---------------------------------------------------------------------------------------------------
const TRACK_ISLAND_X = [-20, -20, 0, 0, 20, 20]; // TRACKS[i] -> island centre x
const TRACK_ID = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const ui = () => page.evaluate(() => window.__meridian.ticketUi());
const waitFor = async (fn, ms, label, arg) => {
  const t0 = Date.now();
  for (;;) {
    const r = await page.evaluate(fn, arg);
    if (r) return r;
    if (Date.now() - t0 > ms) { check(false, `timeout waiting for ${label}`); return null; }
    await page.waitForTimeout(150);
  }
};

// 0. lounge start: balcony, y = 6, facing the hall
const s0 = await state();
check(Math.abs(s0.fy - 6) < 1e-6 && Math.abs(s0.fz - 3) < 1e-6, `start pose feet (${s0.fx}, ${s0.fy}, ${s0.fz})`);
check(await page.evaluate(() => window.__meridian.ticket === null), 'starts without a ticket');
await shot('balcony_start');
// 1. balcony: strafe with D (right = -X) and A a little (real keys), then walk to the stair head
await page.keyboard.down('KeyA'); await page.waitForTimeout(500); await page.keyboard.up('KeyA');
await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
await goto(0, 6.5, { label: 'balcony' });
// 2. down the stair (z 8 -> 20), walking at normal pace
await goto(0, 19.5, { label: 'stair' });
await shot('stair_foot');
// 3. to the concourse, run (Shift) to the kiosk, bump into it, bump into a column, around the kiosk
await goto(0, 35, { run: true, label: 'concourse' });
await goto(0, 50, { run: true, bump: true, maxMs: 4000, label: 'bump-kiosk' }); // straight into the kiosk
const k = await state();
console.log(`bump into kiosk: stopped ${Math.hypot(k.fx, k.fz - 50).toFixed(2)} m from its centre (footprint 3.5)`);
check(Math.hypot(k.fx, k.fz - 50) > 3.5, 'walked into the kiosk');
await goto(-12, 32, { run: true, label: 'to-column' });
await goto(-23, 32, { run: true, bump: true, maxMs: 3500, label: 'bump-column' }); // straight into a column
const c = await state();
console.log(`bump into column: stopped ${Math.hypot(c.fx + 23, c.fz - 32).toFixed(2)} m from its axis (shaft r 1.0)`);
check(Math.hypot(c.fx + 23, c.fz - 32) > 1.0, 'walked into a column');
await goto(-7, 36, { run: true, label: 'concourse2' });
await goto(-7, 50, { run: true, label: 'kiosk-west' });
await shot('kiosk_west');
await goto(-3, 60, { run: true, label: 'kiosk-north' });
await goto(-14, 62, { run: true, label: 'skirt-oculus' }); await goto(-14, 85, { run: true, label: 'skirt-oculus' }); // Meridian Deep: the oculus now sits on the straight line north (x -12..-8.4 throat also avoided)
await goto(0, 85, { run: true, label: 'to-gates' });

// 4. WITHOUT a ticket the player is stopped at the gates
await goto(0, 99, { bump: true, maxMs: 6000, label: 'gate-bump' });
const g0 = await state();
console.log(`no ticket: pressed into the gates, stopped at z=${g0.fz.toFixed(2)} (band starts 94.4)`);
check(g0.fz < 94.4, 'crossed the gate band without a ticket');
await page.waitForTimeout(500);
const gp = await ui();
console.log(`gate prompt: "${gp.prompt}"`);
check(/Ticket required/.test(gp.prompt), 'no "Ticket required" prompt at the gates');
await shot('gates_no_ticket');
// ... and an E press there does nothing
await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
check(await page.evaluate(() => window.__meridian.ticket === null), 'E at the gates issued a ticket');

// 5. back to the booking office window (west frontage), collect the ticket with E
await goto(-14, 85, { run: true, label: 'skirt-oculus3' }); await goto(-14, 62, { run: true, label: 'skirt-oculus3' });
await goto(-10, 40, { run: true, label: 'to-booking' });
await goto(-20.5, 14, { run: true, label: 'to-booking' });
await goto(-20.5, 9.4, { tol: 0.3, label: 'window' });
await page.waitForTimeout(500);
const ws = await state();
console.log(`at window: feet (${ws.fx.toFixed(2)}, ${ws.fy.toFixed(2)}, ${ws.fz.toFixed(2)}) yaw ${ws.yaw.toFixed(2)}`);
const wp = await ui();
console.log(`window prompt: "${wp.prompt}"`);
check(/Collect ticket/.test(wp.prompt), 'no "Collect ticket" prompt at the window');
await shot('window_prompt');
await page.keyboard.press('KeyE');
await waitFor(() => window.__meridian.ticket !== null, 3000, 'ticket issued');
const ticket = await page.evaluate(() => window.__meridian.ticket);
console.log(`ticket: ${JSON.stringify(ticket)}`);
check(ticket && ticket.platform >= 1 && ticket.platform <= 6 && ticket.car >= 1 && ticket.car <= 5 && ticket.seat >= 1 && ticket.seat <= 40 && /^GM-\d{6}$/.test(ticket.serial), 'ticket fields');
check(ticket && /^6:5\d$/.test(ticket.departs), `departs ${ticket?.departs}`);
await page.waitForTimeout(2300);
const cardUi = await ui();
check(cardUi.card === 'holding' || cardUi.card === 'entering', `ticket card not visible: ${cardUi.card}`);
const cardBox = await page.evaluate(() => { const r = document.getElementById('gm-ticket-card').getBoundingClientRect(); return { w: r.width, h: r.height, opacity: getComputedStyle(document.getElementById('gm-ticket-card')).opacity }; });
check(cardBox.w > 300 && Number(cardBox.opacity) > 0.9, `ticket card geometry ${JSON.stringify(cardBox)}`);
await shot('ticket_card');
const bd = await page.evaluate(() => window.__meridian.trains().reserved);
console.log(`reserved tracks after issue: ${JSON.stringify(bd)}`);
check(bd.includes(TRACK_ID[ticket.track]), 'ticket track is not reserved');
// E dismisses the card into the corner badge
await page.keyboard.press('KeyE');
await page.waitForTimeout(1900);
const badgeUi = await ui();
check(badgeUi.card === 'idle' && badgeUi.badge, `badge state after dismiss: ${JSON.stringify(badgeUi)}`);
await shot('ticket_badge');
const tk2 = await page.evaluate(() => window.__meridian.ticket);
check(tk2 && tk2.serial === ticket.serial, 'E that dismissed the card must not issue a second ticket');

// 6. with the ticket: through a gate lane (centre bank, lane centre x = 0)
await goto(-8, 40, { run: true, label: 'to-gates2' });
await goto(-14, 62, { run: true, label: 'skirt-oculus2' }); await goto(-14, 85, { run: true, label: 'skirt-oculus2' });
await goto(0, 85, { run: true, label: 'to-gates2' });
await shot('gates_approach');
await goto(0, 94.2, { tol: 0.5, label: 'lane-approach' });
await goto(0, 99.5, { tol: 0.5, bump: true, maxMs: 9000, label: 'lane' });
const g1 = await state();
console.log(`with ticket: through the lane to z=${g1.fz.toFixed(2)}`);
check(g1.fz > 96, 'could not pass through a gate lane with a ticket');
await shot('gates_passed');

// 7. to the island of the ticket's platform
const islx = TRACK_ISLAND_X[ticket.track];
const sideX = islx + (ticket.track % 2 === 0 ? -3 : 3); // the walkway on the ticket's track side
await goto(0, 104, { label: 'cross' });
await goto(sideX, 112, { run: true, label: 'cross' });
await goto(sideX, 150, { run: true, label: 'island-ticket' });
await shot('island_waiting');
// 8. the train arrives on the ticket's track (reserved, dwelling for 90 s)
const arrived = await waitFor((id) => window.__meridian.trains().trains.some((t) => t.active && t.track === id && t.phase === 'dwell'), 150000, `train on ${TRACK_ID[ticket.track]}`, TRACK_ID[ticket.track]);
const tr = await page.evaluate(() => window.__meridian.trains());
console.log(`train state: ${JSON.stringify(tr.trains.filter((t) => t.active).map((t) => `${t.track}:${t.phase}:${t.reserved}:${t.noseZ.toFixed(1)}`))}`);
const mine = tr.trains.find((t) => t.active && t.track === TRACK_ID[ticket.track]);
check(mine && mine.phase === 'dwell' && mine.reserved && Math.abs(mine.noseZ - 111) < 0.05, 'ticket train is not reserved + dwelling at the stop');
await shot('train_arrived');

// 9. climb the bridge stair of this island, cross the deck, descend another island's stair
await goto(sideX, 205, { run: true, label: 'to-stair' });
await goto(islx, 212, { label: 'to-stair' });
await goto(islx, 220, { label: 'bridge-stair' });
await shot('bridge_stair');
await goto(islx, 227.5, { tol: 0.5, label: 'bridge-stair' });
const dk = await state();
console.log(`on the deck: feet (${dk.fx.toFixed(2)}, ${dk.fy.toFixed(2)}, ${dk.fz.toFixed(2)})`);
check(Math.abs(dk.fy - 7) < 0.05, 'did not reach the deck (y 7)');
const otherX = islx === 20 ? -20 : 20;
// Walk the deck's centre line (z 228) at walking pace: running overshoots the target and can wander onto a
// stair head, which is a legitimate exit, not a fall.
await goto(otherX, 228.2, { tol: 0.5, label: 'deck' });
await shot('bridge_deck');
// pressing into the deck rail (south) must stop us on the deck. Push from mid-span (x = +-10), well clear
// of every stair head (stairs at x 0 / +-20, half-width 1.4): pushing south above a stair head walks down it.
const railX = otherX > 0 ? 10 : -10;
await goto(railX, 227.5, { tol: 0.5, label: 'deck' });
await goto(railX, 215, { bump: true, maxMs: 2500, label: 'deck-rail' });
const rail = await state();
check(Math.abs(rail.fy - 7) < 0.05 && rail.fz >= 226.2, `fell off / crossed the deck rail: ${rail.fy.toFixed(2)} z=${rail.fz.toFixed(2)}`);
await goto(otherX, 228.2, { tol: 0.5, label: 'deck' });
await goto(otherX, 226.4, { label: 'stair-head' });
await goto(otherX, 215, { label: 'descend' });
await goto(otherX, 208, { label: 'descend' });
const dn = await state();
console.log(`descended: feet (${dn.fx.toFixed(2)}, ${dn.fy.toFixed(2)}, ${dn.fz.toFixed(2)})`);
check(Math.abs(dn.fy) < 0.05, 'did not come back down to y 0');
await shot('descended');
// 10. far end of that island, pressing into the end and into the track edge
await goto(otherX + 3, 250, { run: true, label: 'island-far' });
await goto(otherX + 3, 360, { run: true, label: 'island-far' });
await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
await goto(otherX + 3, 250, { label: 'bump-setup' });
await goto(otherX + 12, 250, { run: true, bump: true, maxMs: 3500, label: 'bump-track' });
const trackSide = await state();
console.log(`bump into track edge: stopped at x=${trackSide.fx.toFixed(2)} (island ${otherX} +-5)`);
check(Math.abs(trackSide.fx - otherX) <= 5, 'walked off the island onto the track');

// --- assertions ----------------------------------------------------------------------------------------------
const ys = samples.filter((s) => s.fz >= 8 && s.fz <= 20 && s.label !== 'balcony' || s.label === 'stair').map((s) => s.fy);
let monotone = true, maxDrop = 0;
for (let i = 1; i < ys.length; i++) { if (ys[i] > ys[i - 1] + 1e-6) monotone = false; maxDrop = Math.max(maxDrop, ys[i - 1] - ys[i]); }
const eyes = samples.filter((s) => s.label === 'stair' || s.label === 'balcony').map((s) => s.y);
console.log(`stair: feet y ${ys[0]?.toFixed(2)} -> ${ys.at(-1)?.toFixed(2)} over ${ys.length} samples; monotone=${monotone}; max single-sample drop ${maxDrop.toFixed(3)} m; eye y first ${eyes[0]?.toFixed(2)} last ${eyes.at(-1)?.toFixed(2)}`);
check(monotone, 'feet y not monotonic on the stair');
check(Math.abs(ys[0] - 6) < 0.3 && Math.abs(ys.at(-1) - 0) < 0.3, 'stair did not go 6 -> 0');
let minObs = Infinity, minCol = Infinity, minKiosk = Infinity, maxZ = -Infinity, offTrack = 0;
for (const s of samples) {
  for (const cx of COLS_X) for (const cz of COLS_Z) minCol = Math.min(minCol, Math.hypot(s.fx - cx, s.fz - cz));
  minKiosk = Math.min(minKiosk, Math.hypot(s.fx - KIOSK[0], s.fz - KIOSK[1]));
  for (const o of OBSTACLES) if (o.level === undefined || Math.abs(s.fy - o.level) < 1.0) minObs = Math.min(minObs, Math.hypot(s.fx - o.x, s.fz - o.z) - o.r);
  maxZ = Math.max(maxZ, s.fz);
  if (s.fz > 110 && s.fy < 1 && ![-20, 0, 20].some((cx) => Math.abs(s.fx - cx) <= 5.0)) offTrack++;
}
console.log(`min distance to a column axis ${minCol.toFixed(2)} m (shaft r 1.0), to kiosk centre ${minKiosk.toFixed(2)} m (footprint 3.5), max z ${maxZ.toFixed(1)}, samples off every island in the shed: ${offTrack}`);
check(minCol > 1.0, 'entered a column');
console.log(`closest approach to any prop obstacle (benches, lamps, signs; ${OBSTACLES.length} circles): ${minObs.toFixed(2)} m clear of footprint`);
check(minObs > 0, 'entered a prop obstacle');
check(minKiosk > 3.5, 'entered the kiosk');
check(offTrack === 0, 'left an island (track side)');
check(maxZ > 300, 'did not reach z > 300');
const deckSamples = samples.filter((s) => s.label === 'deck');
const offDeck = deckSamples.filter((s) => Math.abs(s.fy - 7) >= 0.05);
check(deckSamples.length > 5 && offDeck.length === 0, `deck samples left y 7: ${offDeck.slice(0, 5).map((s) => `(${s.fx.toFixed(2)}, ${s.fy.toFixed(2)}, ${s.fz.toFixed(2)})`).join(' ')}`);
const fin = await state();
console.log(`final feet (${fin.fx.toFixed(1)}, ${fin.fy.toFixed(2)}, ${fin.fz.toFixed(1)})`);
check(fin.fz < 381 && Math.abs(fin.fx - otherX) <= 5, 'ended outside the island');
console.log(`console errors: ${errors.length}${errors.length ? '\n' + errors.join('\n') : ''}`);
check(errors.length === 0, 'console errors');
console.log(failures === 0 ? 'WALK TEST PASS' : `WALK TEST FAIL (${failures})`);
await browser.close();
process.exit(failures ? 1 : 0);
