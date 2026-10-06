# Grand Meridian Ticket Kiosks and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two keyboard-operated machines that physically print assigned tickets, preserve ticket/train consistency until collection, and certify the complete expansion.

**Architecture:** A shared ticket service prepares an allocation lease, then atomically collects or cancels it. A pure kiosk controller owns the paper/timer states; rendering and audio reflect those states. Existing booking windows use immediate prepare/collect, and railway route interlocking remains the movement authority.

**Tech Stack:** Existing TypeScript/Three.js/Web Audio/tsx/Playwright. Execute after Environment E1–E5 and Grounds G1–G5; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-grand-meridian-river-city-expansion-design.md`, sections 7–10; also read master and environment/grounds interface contracts.

## Global Constraints

- Assigned destination, no chooser/payment; E prints, E again collects; native key repeat cannot issue/collect twice.
- Two machines at (-52,0,14), facing west, and (-19,0,84), facing south; footprint 1.1×0.8 m, height 2.0 m.
- Printing 2.5 real seconds, ready expiry 45 real seconds, retraction 0.5 seconds; pause/hidden tab stops these timers; timescale does not speed them up.
- Only one pending print globally; held ticket, board, and existing reservation change only after successful collection.
- Preparing protects a platform/pool slot or eligible existing train; an accepted ticket request must survive temporary route conflicts.
- Preserve Ticket fields, `requestTrain(track):boolean`, trackStates, existing board/UI/gate/safety/audio consumers and pre-existing train/debug work.
- Full acceptance: headed actual-GPU Chrome, ≥50 fps settled average, p95 ≤25 ms, no repeated >100 ms adjustment frames, 5-minute route, master scene/resource caps.

## Review Focus

1. Existing train has already committed a departure route: printing must choose another valid allocation or show unavailable (K1).
2. Duplicate/spent tokens or allocation failure cannot update the board or replace the player's old ticket (K2).
3. Walk away, pause or use the other kiosk/window while paper is pending: no duplicate ticket or accidental collection (K2/K3).
4. Route blockage lasts beyond the original 400 retries: committed allocation persists until fulfilled/superseded (K1).
5. Clear exterior weather exposes ticket-train teleport or pool recycling that used to be hidden in golden haze (K4).

---

## File ownership and shared interfaces

Create `src/trains/ticketAllocations.ts` for the small lease record/type helper, `src/core/ticketService.ts` for ticket transaction orchestration, `src/core/kiosk.ts` for pure printing states, and `src/world/ticketKiosks.ts` with `ticketKiosks/model.ts` and `ticketKiosks/paper.ts` for world geometry. Existing traffic owns train/pool mutation; the helper is not a second scheduler. Physical paper uses a CanvasTexture derived from the assigned Ticket; keep card layout helper reuse surgical, without rewriting existing UI.

Fixed signatures:

```ts
type TicketLeaseToken = string;
interface TicketAllocation { token: TicketLeaseToken; track: number }
// Add to Traffic and TrainControl; keep existing methods compatible.
prepareTicketAllocation(): TicketAllocation | null;
commitTicketAllocation(token: TicketLeaseToken): boolean;
cancelTicketAllocation(token: TicketLeaseToken): void;

type TicketSource = 'booking' | 'courtKiosk' | 'concourseKiosk';
interface PreparedTicket { token: TicketLeaseToken; source: TicketSource; ticket: Ticket }
type PrepareResult =
  | { ok: true; prepared: PreparedTicket }
  | { ok: false; reason: 'busy' | 'unavailable'; source?: TicketSource };
class TicketService {
  constructor(deps: TicketServiceDeps);
  readonly pending: PreparedTicket | null;
  prepare(source: TicketSource): PrepareResult;
  collect(token: TicketLeaseToken): Ticket | null;
  cancel(token: TicketLeaseToken): void;
}
type KioskId = 'courtKiosk' | 'concourseKiosk';
type KioskPhase = 'idle' | 'printing' | 'ready' | 'retracting';
interface KioskState {
  phase: KioskPhase; ticket: Ticket | null; paperProgress: number;
  readyRemaining: number;
}
class KioskController {
  constructor(service: TicketService);
  state(id: KioskId): Readonly<KioskState>;
  press(id: KioskId): 'print' | 'collect' | 'busy' | 'unavailable' | null;
  update(realDt: number, active: boolean): void;
}
```

TicketServiceDeps is defined in K2; do not import browser interaction/UI into the service. Main constructs one service/controller shared by both kiosk models and Interaction. Register kiosk realUpdate once; do not advance timers once per machine or train substep.

### K1: Ticket allocation leases without route-system replacement

**Files:** Create `src/trains/ticketAllocations.ts`, `scripts/ticket-allocation-test.ts`; modify `src/trains/traffic.ts`, `src/trains/scheduler.ts`, and traffic-sim cases only where needed. Preserve the existing scheduler routeCheck hook/untracked live tests exactly.

**Interfaces:** Produce the Traffic/TrainControl prepare/commit/cancel signatures above and diagnostic `ticketAllocations():readonly {token:string;track:number;slot:number|null;trainId:number|null;committed:boolean}[]` for tests. Leases remain distinct from `Interlocking` reservations; do not modify graph topology or conflict rules.

- [ ] Write seeded Traffic tests: prepare free allocation protects track/slot from ambient arrival/shunt selection; cancel restores it; prepare bound arrival/shuntOut/dwell prevents departure; reject dwell after nextRoute exists or departure lead has begun; old reserved ticket train is unchanged until commit. Test two attempts cannot claim the same slot/platform and invalid token commit has no side effects.

```ts
const offer=traffic.prepareTicketAllocation(); assert.ok(offer);
assert.equal(traffic.prepareTicketAllocation(),null);
assert.equal(traffic.commitTicketAllocation('invalid-token'),false);
traffic.cancelTicketAllocation(offer.token);
assert.equal(traffic.commitTicketAllocation(offer.token),false);
```

- [ ] Run `./node_modules/.bin/tsx scripts/ticket-allocation-test.ts`; expect missing lease APIs to fail.
- [ ] Add one pending lease record and one committed ticket-request record. Prefer a free platform+inactive pool slot; otherwise choose an incoming arrival/shuntOut or uncommitted dwell with at least DEPART_LEAD remaining. Store bound train identity, original dwell/remaining time, track, slot and token. Ambient free-platform/free-slot selection excludes these holds. Incoming trains move normally; once dwelling, skip dwell time advancement and departure planning while a pending lease binds them. Cancel resumes saved remaining dwell; commit applies RESERVED_DWELL and existing reserved semantics.
- [ ] For an empty platform, commit transfers its slot/track into the pending ticket request before releasing the lease. Allow only that owner to consume the held slot through an additive internal spawnArrival allocationToken option. Keep trying route allocation with existing interlocking until fulfilled or superseded; remove the fixed 400-try expiry for accepted ticket requests. Failure to validate an allocation cannot clear an earlier reservation. After a successful commit, release/supersede the old committed request without touching unrelated route locks.
- [ ] Make cancellation and repeated token operations idempotent; test cancellation before/after incoming train reaches dwell, collection while every other slot is occupied, temporary interlocking blockage for >400 updates, and expiry releasing only its own hold. Add finite state/pool/edge-owner assertions through the existing simulation. Do not fix unrelated train motion measurements in this task.
- [ ] Run allocation test, traffic-sim, graph-test and build; expect exit 0. Run original train/safety/route live tests sequentially to confirm leases did not change track phases or safety timing. Inspect selected scheduler hunks before committing: `feat: add staged ticket train allocations`.

### K2: Shared ticket transaction and real-time paper state

**Files:** Create `src/core/ticketService.ts`, `src/core/kiosk.ts`, `scripts/ticket-service-test.ts`, `scripts/kiosk-test.ts`; modify `src/core/interaction.ts`, `src/core/ticket.ts` only if needed to reuse existing printed fields, `src/main.ts`, and `src/ui/ticketUi.ts` for temporary unavailable messages.

**Interfaces:** Produce service/controller contracts above. TicketServiceDeps contains `allocator` (K1's 3 methods), `held():Ticket|null`, `setHeld(ticket:Ticket):void`, `destinationsOnBoard():readonly string[]`, `onCollected(ticket:Ticket,source:TicketSource):void`, and injected `random:()=>number`. onCollected invokes board forceRow and ticket audio exactly once; visual ticket presentation stays in Interaction after successful collection. Add `TicketUI.showNote(message:string):void` reusing the existing note element.

- [ ] Write tests with a fake allocator and spies for held/board/audio. Assert prepare has zero held/board/audio effects, collection uses the same platform/serial as paper, failed commit retains the old ticket, duplicate token collect returns null, and cancel is idempotent. Destination assignment uses DESTS excluding current board entries where possible, with the existing fallback list and buildTicket output.

```ts
const result=service.prepare('courtKiosk'); assert.ok(result.ok);
assert.equal(setHeldCalls.length,0); assert.equal(onCollectedCalls.length,0);
fakeAllocator.commitTicketAllocation=()=>false;
assert.equal(service.collect(result.prepared.token),null);
assert.equal(held(),oldTicket); assert.equal(onCollectedCalls.length,0);
```

- [ ] Run `./node_modules/.bin/tsx scripts/ticket-service-test.ts` and `./node_modules/.bin/tsx scripts/kiosk-test.ts`; expect missing files/APIs to fail.
- [ ] Implement TicketService with a single pending prepared ticket and the injected allocation adapter. Validate token/owner before commit, publish held/board/audio only after allocator success, and clear pending state exactly once. Booking windows use prepare('booking') then immediate collect; while any print is pending, show the named machine's printing/collection message instead of issuing a competing ticket. Bind service after board/traffic builders are ready; startup handlers never dereference incomplete dependencies.
- [ ] Implement one KioskController holding both states. press on idle prepares; printing ignores press; ready collects only its owned token; expiry cancels and retracts. Failed collect retracts and returns unavailable, retaining the old held ticket. Set paperProgress from printing/ready/retracting time; no per-frame allocation. Disposal cancels any remaining prepared offer. Incoming/ready paper always retains its assigned Ticket object; never regenerate its serial for a texture redraw.
- [ ] Pin real-time timing with injected deltas:

```ts
assert.equal(k.press('courtKiosk'), 'print');
k.update(2.49, true); assert.equal(k.state('courtKiosk').phase, 'printing');
k.update(0.01, true); assert.equal(k.state('courtKiosk').phase, 'ready');
assert.equal(k.press('concourseKiosk'), 'busy');
k.update(100, false); assert.equal(k.state('courtKiosk').readyRemaining, 45);
k.update(45, true); assert.equal(k.state('courtKiosk').phase, 'retracting');
k.update(0.5, true); assert.equal(k.state('courtKiosk').phase, 'idle');
```

- [ ] Extend interaction Target with `{kind:'kiosk';id:KioskId}` and currentTarget proximity/facing (≤2 m from its front, same floor, facing dot >0.5). Preserve E card-dismiss priority and no-repeat rule. Window issueTicket becomes a service call; existing bell/gate behaviour remains. Add `window.__meridian.kiosks()` state snapshots to main; realUpdate calls update once with active=entered&&pointerLocked&&!document.hidden. Do not use browser setTimeout for machine progression.
- [ ] Run all allocation/service/kiosk tests, build, original walk and safety tests; confirm original window ticket card/board still work. Commit task paths: `feat: share ticket issuance and kiosk printing states`.

### K3: Two physical printers, assigned paper and positional sound

**Files:** Create `src/world/ticketKiosks.ts`, `ticketKiosks/model.ts`, `ticketKiosks/paper.ts`, `scripts/kiosk-walk-test.mjs`; modify G1 placement data/obstacles, `src/audio/environment.ts`, `src/audio/audio.ts`, `src/main.ts`, `src/core/presets.ts`, `src/ui/ticketUi.ts` (copy only).

**Interfaces:** Produce `buildTicketKiosks(ctx:BuildContext, kiosks:KioskController):Promise<WorldModule>`, `makeTicketTexture(ticket:Ticket):THREE.CanvasTexture`, and implement E5 AudioEngine.kiosk(position). Kiosk model update consumes KioskState; it never calls allocation or issues a ticket itself.

- [ ] Write a live test for each machine through real E presses: idle prompt, 2.5 s feed, ready prompt, E collection, matching physical/UI serial/platform, gate passage, board row and requested train. Test held E, E during print, walking away/returning, second kiosk/window lockout, paused countdown, expiry, and failed print. At timescale=10, paper still requires 2.5 real seconds.

```ts
assert.equal(heldAfter.serial,printedTicket.serial);
assert.equal(heldAfter.track,printedTicket.track);
assert.equal(collectionCount,1);
assert.ok(readyWallSeconds>=2.5 && readyWallSeconds<3.0);
assert.equal(pageErrors.length,0);
```

- [ ] Run `node scripts/kiosk-walk-test.mjs`; expect missing world machines/targets to fail.
- [ ] Build each complete 1.1×0.8×2.0 m machine at the approved position/yaw: enamel casing/panels, bevelled brass trim, mechanical control, illuminated status window and recessed slot. Use the same authored machine model twice, not a different visual language. Activate its G1 collision footprint now; keep a ≥3 m approach route. Animate the physical control when E prints, with no clickable DOM.
- [ ] Render the paper as a small double-sided sheet sliding from the slot over 2.5 s; show the prepared serial/platform/destination in a CanvasTexture and retain it until collection/expiry. Dispose replaced paper textures; reuse sheet geometry/materials. No hands/first-person body are required. Collection retracts/removes the world sheet and shows existing ticket-card UI with exact copy **Your ticket has been printed.**
- [ ] Add positional procedural motor/feed/cutter sound once at print start and paper collection sound through the service's existing ticket audio. Sound remains silent before audio.start. Kiosks are beneath shelters and their paper/casing never receive rain wetness. Add ticketkiosk camera preset; confirm night lighting makes the control/slot readable.
- [ ] Run kiosk-walk, all pure kiosk/lease/service tests, build and old walk/train/safety tests; capture both machines idle/printing/ready in clear/rain/night. Inspect paper emergence, slot depth, text, corridor clearances, sound location and exact one-ticket activation. Commit task paths: `feat: add physical self-service ticket kiosks`.

### K4: Visibility-safe railway behaviour and full acceptance

**Files:** Modify `src/trains/traffic.ts`, `src/trains/scheduler.ts` only for measured visibility assumptions, `scripts/perf-test.mjs`, `scripts/lib.mjs`, `scripts/site-look-test.mjs`, `scripts/grounds-walk-test.mjs`, `docs/TASKS.md`; create `scripts/expansion-acceptance.mjs`, `docs/superpowers/reports/2026-10-06-grand-meridian-expansion-acceptance.md`. Preserve pre-existing route scripts; selected hunks only.

**Interfaces:** Add optional `TrafficHooks.canHideTrain?(route:RoutePath,u:number):boolean`, defaulting to current pure simulation criteria when no browser hook is provided. The scheduler supplies camera/frustum/current-fog-aware whole-consist visibility. Performance CLI adds `--headed`, `--warmup=30`, `--secs=60`; output includes per-frame raw-rAF statistics and resource estimates. Debug recorder `frameSamples():readonly {dt:number;transition:boolean;capture:boolean}[]` is bounded to the latest 6000 frames; frame samples exclude hidden-tab intervals but retain visible transition hitches.

- [ ] Write browser assertions from galleryterrace/river in clear noon: no requested train teleports while visible, no visible far departure is recycled, and ordinary spawns/despawns are obscured. Exercise ticket requests while looking toward their entire route and when looking away. Pure traffic tests run without camera hooks and preserve existing expectations.

```ts
assert.equal(visibleRelocations.length,0); // compare consist motion/phase changes against camera visibility
assert.ok(samples.length>=1000); // sustained run cannot pass with an empty recorder
assert.ok(settledFps>=50 && settledP95Ms<=25);
assert.ok(adjustmentFrames.filter(f=>f.dt>0.1).length<=1); // per normal adjustment/refresh window
assert.ok(sceneCalls<=250 && sceneTriangles<=2_500_000 && estimatedGpuBytes<=450*1024*1024);
```

- [ ] Run the new visibility cases to reproduce current haze-dependent behaviour. For hidden checks, include all consist endpoints and frustum intersection; estimated fog transmittance must be <0.01 for an object considered obscured while in view. Pass the same predicate to arrival-placement selection, existing incoming-train fast-forward, departure recycling and final removal. If a requested near spawn/fast-forward position is visible, keep its normal far arrival; never create a visible train near the station to satisfy a convenience delay. Use the full model bounds rather than one nose point. If no far spawn position is obscured, defer that spawn until safe instead of popping it into view. Do not alter route geometry or accelerate a visible train.
- [ ] Implement acceptance orchestration that runs build/nav/graph/traffic, environment/input/lighting/reflection/weather/site/river/allocation/service/kiosk pure/live suites, grounds/gallery/kiosk walks and original train/safety/route regressions sequentially. Preserve independent script errors and fail if any required scenario never completed; no empty recorder can pass. Test the 4 weather ×5 daylight matrix and all eight new plus representative original viewpoints. Store screenshots/raw frame/console/resource reports under ignored shots/river-city/final/.
- [ ] Expand the perf harness to headed actual-GPU capture, 30 s warmup plus 60 s raw-rAF sampling for each demanding scenario at 1440×900@1 and 1470×956@2: golden hall, clear river, rainy winter garden, rainy gallery terrace, night forecourt. Require ≥50 fps settled mean and p95≤25 ms; record quality rung/pixel ratio and transition/capture samples separately. Normal adjustments must not repeatedly exceed 100 ms; don't filter these out as generic hitches. Estimate resident texture/target memory from dimensions/formats/mips, separately labelling it an estimate. Software rendering cannot certify performance.
- [ ] Perform a 5-minute mixed-route headed walkthrough with actual keys, weather changes, night stairs, both kiosk journeys and return to hall. Record frame statistics, geometry/texture/target counts, thermal/memory drift and console errors. Confirm full scene ≤250 calls/2.5M visible triangles/450 MB estimated memory and new geometry/rain budgets. Use measured culling/batching/effect adjustments if necessary and rerun only affected gates; do not silently shrink the agreed product or lower quality floors.
- [ ] Independently inspect final screenshots and the live walk for architectural finish, planting quality, city composition, water, glass, night readability, rain protection, paper animation, and preserved originals. Write the concise acceptance report with separate functional, visual and performance verdicts, baseline/final measurements and limitations. Unavailable hardware/manual checks stay explicitly unverified, never PASS. Update task ledger, inspect final diff and perform the selected execution method's fresh whole-branch review. Commit only task fixes/evidence docs: `test: certify river-city expansion and ticket ritual`.

## Final completion rule

The expansion is complete only when its required checks pass or a material verification gap is clearly reported. This plan does not authorize deployment, package changes, boardable trains, new exploration mechanics, or a wider city. Evidence of a performance or visual blocker calls for a concrete report and targeted correction, not unsupported completion claims.
