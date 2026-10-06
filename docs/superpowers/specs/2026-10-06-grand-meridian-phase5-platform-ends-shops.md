# Grand Meridian — Phase 5 & 6: Platform Ends, Shops, and the Station Throat

Date: 2026-10-06 · Extends the base spec and the Phase 4 addendum (all rules still bind:
quality bar, uncanny emptiness — no people, no steam-from-cups, no announcements; budgets; tooling).

## Phase 5A — Realistic platform ends (`PLATFORM_END` in layout.ts)
At the far end (z = 380) of each island:
- **Staff ramp** (centred on the island, 1.6 m wide, z 380 → 388, y 0 → -1.1) down to track-bed level,
  closed at its head by a **locked black iron gate** with an enamel sign
  "AUTHORISED PERSONNEL ONLY — NO PUBLIC ACCESS BEYOND THIS POINT". An end railing closes the rest of the
  island end (replace/integrate the existing end guard rails in `world/shed/furniture.ts`). The player
  can walk up to it, never through (navigation already ends islands at z 379.5).
- **Warning signage**: enamel "PASSENGERS MUST NOT CROSS THE LINE" on the end railing; platform-end lamp.
- **Starter signals** beyond the end (z ≈ 386), one per track, on the cess side: period colour-light or
  semaphore; RED by default, GREEN while that track's train is departing (read
  `trainControl.trackStates()`), with smooth lamp transitions.
- **Driver's convex dispatch mirrors** on posts near each served platform edge (z ≈ 372, ~1.1 m inside
  the edge — clear of the 4D barrier line at 0.35 and edge light at 0.7).
- **STOP car-marker boards** at the stopping point (z ≈ 110.6) beside each track, facing arriving drivers.
- **Signal box**: two-storey brick-and-timber cabin west of T1 beyond the platform ends
  (x −40…−33, z 388…397): glazed upper operating floor, faint warm light, lever frame silhouettes,
  nobody inside. **Lamp hut**: small brick hut east of T6 (x 33…36.5, z 386…390.5).
- **Platform furniture with stories** on the islands: brass luggage barrows with steamer trunks,
  hatboxes and canvas mail sacks, left as if someone just stepped away. Keep ≥ 2.5 m walkways, clear of
  footbridge stairs/piers, the 4D barrier/edge-light lines, and door zones. Register in
  `PLATFORM_OBSTACLES` (level 0).

## Phase 5B — Shops & conveniences (`SHOPS` in layout.ts)
"The last stop before you board": open, lit, fully stocked, **unattended** (uncanny).
- Concourse arcade: four shopfronts set into the windowless side bays (z 38 and 62), depth 2.8 m from the
  side wall, height 3.6 m, ±4.6 m along z:
  - West bay 38: **Newsagent & Tobacconist** — racks of newspapers/magazines with period mastheads,
    cigarette tins, postcards, a brass till.
  - West bay 62: **Florist & Confectioner** — buckets of roses/lilies, jars of boiled sweets, boxed chocolates.
  - East bay 38: **Coffee & Pastries** — Deco counter, polished brass espresso machine, cake stands under
    glass domes, cups set out on saucers (no steam).
  - East bay 62: **Travellers' Conveniences** — brass luggage lockers, wooden telephone booths, red post
    box, shoeshine chair, penny weighing machine.
  Walnut + brass + glass shopfronts with gilt fascia lettering, warm interior glow. Relocate the
  hotel's aisle armchair groups out of bays 38/62 (into window bays 26/74 if they fit, else remove) and
  any benches that clash. Aisle walkway between shopfront and colonnade stays ≥ 3 m.
- Cross platform (past the gates): one combined **newsstand + coffee kiosk** within
  x 7.5…12.5, z 102.6…105.4.
- Register everything in `SHOP_OBSTACLES` (level 0). Not enterable; walk-up only.

## Phase 6 — The station throat (user decisions)
- Trains **follow real routes** through pointwork: switch blades visibly move before a train; carriages
  articulate along curves (each car placed from its two bogie points on the path).
- **Maximum complexity** throat beyond the platform ends (z ≥ ~392):
  - The six platform tracks (T1–T6, centres as in layout) run straight to ~z 392, then a dense throat
    of turnouts, **scissors crossovers and diamond crossings** (like a real big-terminus throat) merges
    them onto **4 main lines** (~4.5 m track centres) by ~z 650.
  - The main lines then **fan out in different directions**: two curve away west, two curve east
    (gentle radii, ≥ 400 m), disappearing into the haze by ~z 1100–1300, as if bound for different cities.
  - A **carriage yard** with 4–5 sidings fanned off via a ladder (west side, beyond the signal box —
    keep its footprint x −40…−33, z 388…397 clear) with **dead-end buffer stops**.
  - **Catch points** at siding exits and short dead-end spurs with buffers.
- Details: **point machines** (motor boxes beside each switch + rodding), **red/white marker posts**,
  numbered switch plates; **signal gantries** spanning the throat with route signals that change as
  routes are set.
- **Interlocking**: a route (set of graph edges + conflicting crossings) must be reserved before a train
  may use it; arrivals wait (out of sight in the haze) and departures hold at the platform (doors stay
  closed) until their route is free. Points throw (blade animation ~2 s) when a route is set.
  Speed restriction through pointwork (~10–12 m/s), smooth acceleration profiles, no snapping.
- APIs that other modules depend on stay intact: `trainControl.trackStates()` (per platform track:
  phase, t, dwell, nose = world z on the platform track, speed), `trainControl.requestTrain(track)`,
  `window.__meridian.trains()`, audio TrainVoice calls. Train meshes keep `userData.noShadow`.
- Budget for the throat + yard (all track, pointwork, details): ≤ 25 draw calls, ≤ 450 k triangles.

## Verification
- nav-test unchanged-pass (+ any new obstacle checks); walk-test pass; safety-test pass.
- New `scripts/route-test.mjs`: at high timescale, ≥ 8 arrivals/departures across all platforms;
  assert no two trains ever reserve conflicting routes, every car stays on its path (bogie points within
  2 cm of the graph), stops at nose z 111 ± 0.05, no NaN, pooled objects reused, 0 console errors.
- Screens: platform ends, shops, throat from the platform end, from the footbridge, from the signal box.
