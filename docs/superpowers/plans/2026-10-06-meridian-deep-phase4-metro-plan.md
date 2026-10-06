# Meridian Deep — Phase 4: The Metro (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Bring the Crossing to life:
- driverless mirror trains on six tracks
- a light-wave in each tunnel ahead of every arrival
- screen doors that open for stopped trains
- the kinetic droplet ceiling rippling with arrivals
- the live map wall tracking real trains under a clock that shows your real time

**Spec:** `docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md` §2.5–2.6, §5.5–5.6. **Master plan Global Constraints apply.** Depends on Phase 3: portals with a `uWave` hook, PSDs with a `setDoors` hook, map wall placeholder.

## Global constraints (Phase 4)
- **Train budget:** at most 4 trains moving at once.
  - ≤ 10 draw calls per train: body, glass, interior, bogies/underframe and stripe merged per material, one train-shared material set.
  - ≤ 60k triangles per train.
- **Droplets:** 1–2 draw calls in total.
- **Map wall:** ≤ 4 draw calls.
- **Light-wave:** no extra draw calls (uniforms only).
- **Lighting:** no real lights.
- **Time:** trains run on simulation time (respect `?timescale`). Doors and droplets follow the trains. The clock uses real local time.
- **Independence:** the mainline train system (`src/trains`, `src/tracks`) is untouched.
- **Performance:** deep views still ≥ 50 fps with 4 trains present. Every task ends with shots plus a fast-forward cycle test.

## Review focus
1. Trains must stop with every car door aligned to a PSD door pair, on all six tracks and in both directions.
2. A train must never appear or vanish inside the visible portal mouth. Spawn and despawn happen ≥ 250 m into the darkness.
3. The timetable must keep arrivals spread out: never more than 4 moving, no two trains on the same track closer than a full dwell plus clearance.
4. The light-wave, door, droplet and map states must stay consistent with the timetable bus after `?timescale=20` runs and tab hide/show.
5. Mirror trains must reflect the cavern (deep env map) and not look grey or black.

---

### Task P4-1: Timetable bus and scheduler (pure, tested)
**Files:** create `src/metro/timetable.ts`, `src/metro/tracks.ts` (six straight track lines from layoutMetro: endpoints, stop position, direction, portal distances), `scripts/metro-train-test.ts`, and an npm script.

- [ ] **Track model:** each track has a parametric line s ∈ [−250 − L, platform + 250 + L] through its portals. `stopS` aligns the train centre to the platform centre so the doors align with the PSD offsets. Add the PSD door offsets to layoutMetro if Phase 3 hasn't.
- [ ] **Per train state machine:**
  1. `approaching`: spawn in darkness at cruise 20 m/s, with a jerk-limited stop (reuse the motion profile idea from `src/trains/motion.ts` without importing mainline modules).
  2. `stopped`: doors open after 1.0 s, dwell 20–30 s, doors close 3 s before departure.
  3. `departing`: accelerate.
  4. `gone`: despawn.
  
  Trains run through the station; both directions alternate on each line's two tracks.
- [ ] **Scheduler:** headway per track is random in 60–150 s, with a seeded PRNG for tests. At most 4 trains moving at once (excess arrivals are deferred). The first arrival comes within ~10 s of the player first reaching the cavern zone (`DepthLook.airlock.zone === 'deep'`), but the simulation always runs.
- [ ] **Bus:**
  - `subscribe(fn)`
  - `trains(): readonly TrainState[]`: `{id, line, track, s, v, phase, doors01, eta}`
  - events: `approaching(eta)`, `arrived`, `doorsOpen`, `doorsClosed`, `departing`, `gone`
- [ ] **Tests (seeded, simulated 2 h at fixed dt):**
  - no overlap on a track
  - never more than 4 moving
  - every train stops at `stopS` ± 0.05 m with doors aligned
  - door timings as specified
  - ETA monotone
  - no spawn or despawn within 250 m of a portal
- [ ] Commit.

### Task P4-2: Mirror train model
**Files:** create `src/metro/trainModel.ts`, `src/world/metro/trainsView.ts`; wire into `src/world/metro.ts` (deep group).

- [ ] **Exterior:**
  - **Form:** a 4-car driverless set, 20 m cars with 0.5 m gaps, 2.9 m wide, 4.0 m tall. Sides have a smooth monocoque section with a slight tumblehome. Ends have a flush full-width glass front and no cab: you can see straight into the lit saloon. A thin line-colour stripe runs at window-sill level, plus a light-colour edge on the front glass surround.
  - **Body:** mirror-polished stainless (metalness 1, roughness 0.06) using the deep env map. It must "almost vanish" by reflecting the station: verify against the cavern env, not the hall.
  - **Openings:** 3 door pairs per side per car, positioned to match the PSDs. Doors slide (pocket) driven by `doors01`. Continuous band glazing.
  - **Underframe:** a dark skirt and bogies.
  - **Light:** a soft white headlight emissive at the front, a dim red one at the rear.
- [ ] **Interior** (seen through the glass): warm 3500 K light, longitudinal champagne-aluminium seats with leather-like dark upholstery, stainless grab poles, open gangways between cars (one continuous saloon), and hairline displays above the doors. Empty, which is uncanny. Emissive ceiling light strips. Interior geometry is shared across cars (instanced or merged per set).
- [ ] **LOD:** beyond 120 m from the camera, drop interior detail and render a simplified emissive interior card.
- [ ] **Shots:** `crossing` and `meridian` with a train stopped at each, a close-up preset `train` (platform edge, train dwelling, doors open), and `deep`. Acceptance: it reads as a 2035 premium driverless train, mirror-bright and luxurious, never toy-like.
- [ ] Commit.

### Task P4-3: Doors, light-wave, arrivals choreography
**Files:** modify `src/world/metro/trainsView.ts`, the Phase 3 PSD and portal modules, and `src/world/metro.ts`.

- [ ] **PSDs:** they follow the stopped train's `doors01` per door pair (only the pairs alongside the train's doors), with a 0.3 s lag behind the car doors on opening and 0.3 s ahead on closing.
- [ ] **Light-wave:**
  - Each portal's ring segments brighten in a travelling wave that runs from deep in the tunnel toward the mouth, timed so its crest reaches the mouth about 4 s before the train's nose.
  - Afterglow decays over 2 s.
  - Departure: a fainter wave follows the train out.
  - Colour: neutral white, with the line colour tinting the last 3 segments at the mouth.
- [ ] **PSD transom displays:** show the line, the destination (dreamlike names shared with the map) and "ARRIVING / DOORS OPENING / DEPARTING" in the hairline dot-matrix.
- [ ] **Shots:** a sequence (`?timescale` plus fixed times) at a portal: wave approaching, train emerging, doors open. Acceptance: arrivals are announced by light alone and feel choreographed.
- [ ] Commit.

### Task P4-4: Kinetic droplet ceiling
**Files:** create `src/world/metro/droplets.ts`; wire into the deep group.

- [ ] **Instancing:** one `InstancedMesh` of ≈ 2,400 polished champagne-metal droplets (teardrop lathe, ~0.18 m, about 200 triangles) on hairline cables (one merged thin-quad mesh, faded with distance).
  - Placement: an annulus r [12, 38] around the sky hole, excluding the bridge corridor (|x| < 12.5 over the nave), the lift tubes and the funicular corridor.
  - Hang: from the sky; bottoms at y [−33, −42] following a gentle base surface.
- [ ] **Vertex-shader motion:**
  - Slow layered waves (Changi Kinetic Rain), heights changing over 30–60 s cycles, forming soft sculptural shapes: a wave crest, then a slow vortex around the hole, then a flat calm.
  - Up to 4 arrival pulses (`uPulse[4]`: centre, time, line colour weight) ripple outward from the arriving train's portal direction.
  - Real time is used for the base motion, simulation time for pulses.
- [ ] **Materials and shadows:** the deep champagne material with env reflections. No shadows (droplets are `noShadow`).
- [ ] **Shots:** `skyhole`, `crossing`, plus a new preset `droplets` (from the Threshold bridge looking out across the ring), and a 3-frame motion strip. Acceptance: mesmerising, precise, luxurious.
- [ ] Commit.

### Task P4-5: Live map wall and the running clock
**Files:** create `src/world/metro/mapWall.ts`; replace the greybox map plane.

- [ ] **Map** (south nave wall, x ±20, y −41..−34):
  - Construction: a backlit glass panel with a stainless frame.
  - Network: the three lines drawn as clean geometric strokes (ink blue, jade, oxblood) on a dark field.
  - Stations: about 8–10 dreamlike station names per line (shared list with the PSD displays: e.g. Meridian Deep, Vesper Falls, Halcyon, Hollow Bay, Ashgrove, Elsewhere, The Last Summer, Nowhere Junction …). This station is marked as the interchange.
  - Resolution: a canvas texture at 2048 × 512, drawn once.
- [ ] **Live train points:** one instanced quad per train (≤ 6 visible), positioned along its line on the map from the bus `s`, with a soft pulse while stopped. They must be within one map-pixel of the real position mapping.
- [ ] **Running clock:**
  - Placement and size: at the map's centre, a 2.4 m diameter clock (white onyx dial, no numerals, hairline stainless hands, a thin sweeping second hand).
  - Time: driven by `new Date()` (real local time), updated every frame.
  - Contrast: upstairs stays frozen at 6:47. Make sure nothing shares state with the hall clock.
- [ ] **Shots:** `mapwall`, `floor`. Acceptance: functional, beautiful, and the points match the trains (verify with the bus).
- [ ] Commit.

### Task P4-6: Phase 4 gate
- [ ] **`metro-train-test`:** green.
- [ ] **`metro-route-test`:** extended with a 3-minute dwell on the Crossing floor at `?timescale=4`, asserting trains arrive on all three lines, PSD doors open only at stopped trains, and no frame exceeds 50 ms when a train spawns.
- [ ] **Perf shots with 4 trains:** deep ≤ 220 + 40 calls, ≥ 50 fps.
- [ ] **Ledger:** update `docs/TASKS.md`.
- [ ] Commit.
