# 06 — Phase 4: The Metro comes alive

**Goal:**
- driverless mirror trains on all six tracks
- a light-wave in each tunnel announcing every arrival
- screen doors opening with the train doors
- the kinetic droplet ceiling rippling with arrivals
- the live map wall tracking real trains, under the one clock in the station that runs (real local time)

**Depends on Phase 3:** the 12 bores with their wave `DataTexture`, screen doors with `setOpen`, the map-wall zone free, deep env capture of the finished cavern.

**Already done:**
- **P4-1, timetable** (`src/metro/timetable.ts`, `src/metro/tracks.ts`): pure, tested over a 2-hour simulation, 344 trains, ≤ 4 present, no overlaps, doors timed. First arrival is about 28 s after `enteredDeep()`, accepted (ruling in `08`).
- **P4-2, mirror train** (`src/metro/trainModel.ts`, `src/world/metro/trainsView.ts`): approved form (`refs/good-06`). 9 calls and about 39 k triangles near per train, 8 calls and about 22 k far, pooled ×4, no per-frame allocation.

**Phase budget:** deep views with 4 trains ≥ 50 fps at both sizes; trains ≤ 10 calls each; droplets ≤ 2; map ≤ 4; light-wave 0 extra (uniforms only).

---

## P4-W — Wire the trains into the scene (do this first)

**Files:** `src/world/metro.ts`, `package.json`.

- [ ] **Create the timetable:** `createTimetable({ seed })` in the metro module. Drive it with `update(f.dt)` in the module's **simulation-time** `update` (so `?timescale` works).
- [ ] **Create the view:** `createTrainsView(kit)`. Add `view.object` to the **deep group**. Every frame, call `view.update(timetable.trains(), camera.position)`. The module `update(f)` receives the camera in `f.camera`.
- [ ] **Register materials:** `view.pbrMaterials` in `metro.userData.deepMaterials` **before** `captureMetro` runs (the metro module builds before it, so registering at build time is correct). The bodies must reflect the cavern: mirror-silver, not the brown hall seen in `good-06`.
- [ ] **First arrival:** call `timetable.enteredDeep()` the first time `DepthLook.airlock.zone` becomes `'deep'` (expose a small hook or poll in a real-time hook; one call only).
- [ ] **Precompile:** the train pool exists at boot, so `captureMetro`'s precompile covers its programs. Verify there is no hitch on the first train (route test).
- [ ] **Tests:** add `scripts/metro-train-test.ts` and `scripts/metro-trainmodel-test.ts` to the `metro-test` chain in `package.json`.
- [ ] **Debug handle:** extend `window.__meridian.metro()` (in `src/main.ts`) with `trains: timetable.trains()` (id, line, track, s, phase, doors01), so the route test and perf script can wait for trains.
- [ ] **Shots:** `crossing meridian deep` with `?timescale=8` so trains are present. Add the preset `train`: on the Crossing floor near the Vesper screen doors, a train dwelling with doors open, looking along it.
- [ ] **Tunnel darkness on trains:** a train deep in the tunnel still gets the full cavern env map, and the pale deep fog makes it *lighter* with distance. Without this fix it shows as a pale silhouette that pops.
  - Give each pool slot its own instances of the train's PBR materials (clone once at build: same program, separate uniforms).
  - Inject a `uTunnel` factor (`onBeforeCompile`, chained, cache key extended) that scales the env reflection, the emissive interior and the headlights from 1 at the bore mouth down to 0 about 120 m inside, and disables fog for train materials while inside.
  - Set it per slot every frame from the train's distance inside its bore.
  - Register every clone in `deepMaterials`.
- [ ] **Acceptance:** trains emerge out of real darkness inside the bores and never pop (check with two shots, the nose at 150 m and at 40 m inside). The mirror bodies read as polished stainless reflecting the cavern and nearly vanish. The interiors glow warm and empty through the glass.

## P4-3 — Doors, light-wave, arrival choreography

**Files:** `src/world/metro/psd.ts` (Phase 3), `src/world/metro/portals.ts`, `src/world/metro/trainsView.ts` (if needed), `src/world/metro.ts`.

- [ ] **Screen doors:**
  - Each screen-door row listens to the stopped train on its track. The pairs alongside the train's doors open **0.3 s after** the car doors start opening and finish closing **0.3 s before** them.
  - **No timetable change needed.** `doors01` is `smooth(u)` of a linear 1.5 s ramp `u` (`timetable.ts:134`). Invert the smoothstep to recover `u` (inverse: `u = 0.5 − sin(asin(1 − 2·doors01) / 3)`, with the `asin` argument clamped to [−1, 1]). While opening, `u` rises 0 → 1; while closing, the timetable uses `1 − smooth(u')`, which equals `smooth(1 − u')`, so the recovered `u` falls 1 → 0. Then drive the screen doors with `smooth(clamp((u − 0.2) / 0.8, 0, 1))`, where 0.2 = 0.3 s ÷ 1.5 s. The same mapping gives the opening lag and the closing lead. Add a Node test for the mapping.
  - Door centres come from `doorOffsets()`; the train's door aperture is `METRO_TRAIN.doorHalf` 0.72 → 1.44 m (moved into the layout in P3-3).
  - Pairs with no train door alongside stay shut.
- [ ] **Light-wave (the bores' wave `DataTexture`):**
  - **Arrival, in the train's `portalIn` bore:** a travelling crest runs from deep in the tunnel toward the mouth, timed so **the crest reaches the mouth about 4 s before the train's nose**. Width about 4 segments. Afterglow decays over 2 s.
  - **Departure, in its `portalOut` bore:** a fainter wake (about 40 % intensity) follows the tail into the tunnel and fades.
  - Two waves in one bore combine with `max`, never a sum, so there's no flicker or overshoot.
  - **Colour:** neutral white; the line colour tints only the last 3 segments at the mouth.
  - **Source data:** from the timetable (`eta` on `approaching`, the train's `s` and `v`), in simulation time.
  - **The light announces the train. There is no sound announcement and no text.**
- [ ] **Transom displays:**
  - Text: line + destination + `ARRIVING` / `DOORS OPENING` / `DEPARTING` in the hairline dot-matrix.
  - Destinations, shared list with the map: `Vesper Falls`, `Halcyon`, `Hollow Bay`, `Ashgrove`, `Elsewhere`, `The Last Summer`, `Nowhere Junction`, `Meridian Deep`.
  - Update the canvas only when the text changes, never per frame.
- [ ] **Shots:** a sequence at the `portal` preset with `?timescale` and fixed waits:
  1. the wave approaching
  2. the train emerging
  3. the train stopped, doors open
- [ ] **Acceptance:** arrivals feel choreographed, announced by light alone. Doors align perfectly on all six tracks. All 12 bores show their role (arrival wave or departure wake). There's no flicker when two trains overlap in one bore.

## P4-4 — Kinetic droplet ceiling

**Files:** new `src/world/metro/droplets.ts` (deep group).

- [ ] **Instancing:**
  - **Droplets:** one `InstancedMesh` of `DROPLETS.count` (2,400) polished champagne teardrops (lathe, about 0.18 m, ≤ 200 triangles).
  - **Cables:** each hangs from the sky on a hairline cable, one merged thin-quad mesh fading with distance.
  - **Placement:** an annulus around the sky hole at (0, 74), **clipped to the cross outline with 2 m clearance from every wall**, excluding:
    - the bridge corridor (|x| < 12.5 over the nave)
    - the lift tubes (keep 2 m clear)
    - the funicular corridor (z 74 ± 3 for x > 16)
  - Change `DROPLETS.rInner` from 12 to 21. Under r 20 is the Threshold deck's footprint above the sky plane; droplets there would hang from the wrong surface. Keep `rOuter` 38 and recompute the count so density is unchanged (the count is a budget, ≤ 2,400).
  - **Hang height:** bottoms between y −33 and −42, following a gentle base surface.
- [ ] **Vertex-shader motion:**
  - **Base:** slow layered waves (like Changi "Kinetic Rain"), heights changing over 30–60 s cycles, through soft sculptural states: a wave crest → a slow vortex around the hole → a flat calm. **Real time** for the base motion.
  - **Arrival pulses:** up to 4 (`uPulse[4]`: origin direction from the arriving train's portal, start time, line weight), ripple outward across the field. **Simulation time.**
  - Movement is slow, heavy and graceful, never jittery.
- [ ] **Material, shadows, compile:** `kit.deep.champagne` (env-mapped), `noShadow`. The cables don't cast either. Precompiled at boot.
- [ ] **Shots:**
  - new preset `droplets`: from the Meridian island near its north end, looking up and outward across the field, with the sky behind it and the eclipse at the frame edge. (The Threshold deck hides most of the field from above.)
  - `skyhole` and `crossing`.
  - a 3-frame motion strip 1 s apart.
- [ ] **Acceptance:** mesmerising, precise, luxurious; a sculpture, not particles. ≤ 2 draw calls. No frame cost visible in perf (re-measure `crossing` and `skyhole`).

## P4-5 — Live map wall and the running clock

**Files:** new `src/world/metro/mapWall.ts` (deep group); remove the greybox map box (if P3-9 hasn't already).

- [ ] **Map panel** (south nave wall z 20, x ±20, y −41…−34, just under the sky and above the Meridian south portal):
  - **Construction:** a backlit glass panel in a brushed stainless frame.
  - **Network:** a dark field with the three lines as clean geometric strokes in their accent colours, 8–10 dreamlike stations per line (the shared list), Meridian Deep marked as the interchange.
  - **Resolution:** a canvas texture of 2048 × 512, drawn once.
- [ ] **Live train dots:** one instanced quad per present train (≤ 4), placed along its line on the map from the timetable `s`, with a soft pulse while stopped. Each must sit within one map pixel of the true mapped position (add a Node test for the `s` → map-UV mapping).
- [ ] **Running clock:** at the map's centre, a 2.4 m clock.
  - Dial: white onyx, no numerals, slim stainless indices.
  - Hands: hairline stainless, plus a thin sweeping second hand (continuous, not ticking).
  - Driven by `new Date()` (real local time) every displayed frame.
  - It shares **nothing** with the hall clock: **upstairs stays frozen at 6:47. That contrast is the point.**
- [ ] **Shots:** `mapwall`, `floor`, plus a check that the dots match the trains (log `timetable.trains()` against dot positions).
- [ ] **Acceptance:** beautiful and functional. The clock reads as the one living clock in the station.

## P4-6 — Phase 4 gate

- [ ] `npm run metro-test` (now including both train tests) green; `nav-test`, `graph-test` and `traffic-sim` green.
- [ ] **Route test:** extend `scripts/metro-route-test.mjs` with a 3-minute dwell on the Crossing floor at `?timescale=4`. Assert:
  - trains arrive on all three lines
  - screen doors open only alongside stopped trains
  - no frame exceeds 50 ms when a train spawns or a light-wave runs
- [ ] **Perf:** `perf-presets.mjs` on `crossing,meridian,glassup,mapwall,droplets,train,deep` at both sizes with trains present: all ≥ 50 fps at a final pixel ratio ≥ 1.0. Deep calls ≤ 220 + 46 (4 trains × ≤ 10, droplets ≤ 2, map ≤ 4).
  - The script currently opens only `cam=<preset>&autostart=1`. Add an `--extra=<query>` option (e.g. `--extra=timescale=8`) so the run has trains, and wait until `window.__meridian` reports 3–4 trains present before sampling.
- [ ] **Paperwork:** update `docs/TASKS.md` and `LEDGER.md`, push, and send Ethan the report with links.
