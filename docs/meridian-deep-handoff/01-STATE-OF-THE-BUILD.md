# 01 — State of the Build (as of the handoff, 2026-11-22)

Branch `meridian-deep` (from `main` @ `87366ba`), pushed to `https://github.com/ethan20224/train`. `main` is the untouched pre-metro station.

## 1. The metro in one paragraph

An 82 m deep interchange under the Grand Hall. You enter through an **oculus** (an 18 m round well in the hall floor north of the clock kiosk). You descend either by **crisscross escalators** through a bell-shaped **void** whose walls pass through three eras (1910 carved stone → raw rock strata → 2035 honed limestone and onyx), or by the **Sinking Floor** (a marble disc that sinks 70 m). You pass the **Threshold** (y −30, speed gates) and ride the last escalator **down through an artificial noon sky** into **the Crossing**: a cross-shaped cavern where three lines cross at three depths and three angles, all visible at once.

| Line | Accent | Level | Runs | Platform |
|---|---|---|---|---|
| Meridian | ink blue | −46 | north–south | floating island bridge hung from the sky |
| Vesper | jade | −70 | east–west | the Crossing floor, between its two tracks |
| Halcyon | oxblood | −82 | 45° diagonal | the deep hall, seen through a glass floor panel |

## 2. What is finished (Phases 0–2, all gates passed)

| Area | Files | Status |
|---|---|---|
| Layout contract | `src/layoutMetro.ts` (re-exported from `src/layout.ts`) | Done. 13 geometry invariants in `scripts/metro-layout-test.ts` |
| Navigation | `src/player/regions.ts`, `src/player/navigation.ts`, `src/metro/navData.ts`, `src/player/walk.ts` | Done. Circles, oriented boxes, scoped holes, x/z ramps, connectors, conveyors, movers |
| Metro runtime | `src/metro/escalators.ts`, `src/metro/disc.ts`, `src/metro/runtime.ts` | Done. Escalator sensing, Sinking Floor, real-time visual hooks (`onMetroFrame`) |
| Depth looks / airlock / sun | `src/core/zones.ts`, `src/lighting/looks.ts`, `src/lighting/sunMask.ts` | Done. Look blend by depth, airlock at camera y −16, single-sun swap, void ignores sun, env captures, shader precompile |
| NaN guard | `src/lighting/grade.ts` (`NanGuardEffect`), `src/core/postfx.ts` | Done. Fixed a pre-existing bug on `main` (black block in hall views) |
| Material kit | `src/world/metro/materials.ts`, `src/world/metro/glow.ts` | Done. Void set (sun-masked) + `deep` set; strata texture fetched (CC0, Poly Haven `dark_rock_02`) |
| **The oculus** (hall side) | `src/world/metro/oculus.ts` | **Finished, approved.** Moulded curb, bronze baluster ring, gangway + gates, throats, dome ribs |
| **The void** | `src/world/metro/void.ts`, `strata.ts`, `voidLight.ts` | **Finished, approved.** Three eras, light rings, landings with cove light, Threshold deck |
| **Escalators** (all 22, F1–F6) | `src/world/metro/escalators.ts` | **Finished, approved.** Instanced animated steps, real-time phase per unit |
| **Sinking Floor + well gate** | `src/world/metro/disc.ts` | Disc finished, approved. **The −70 well gate is in the wrong vocabulary (bronze); re-skin in Phase 3** |
| **Threshold fixtures** | `src/world/metro/gates.ts` | Speed gates + lift-head lanterns done. Gate finish has a look-dev residual (reads painted) |
| Train timetable (logic) | `src/metro/timetable.ts`, `src/metro/tracks.ts` | Done and tested (P4-1), **not wired into the scene yet** |
| Mirror train model | `src/metro/trainModel.ts`, `src/world/metro/trainsView.ts` | Done and approved visually (P4-2), **not wired into the scene yet** |

## 3. What is still greybox (Phase 3 replaces all of it)

Everything in the `metroDeep` group from `src/world/metro/greybox.ts`, plus its placeholders:

- the sky plane (a placeholder shader) and its hole-shadow caster
- cavern walls (plain boxes) and the base floor slabs
- the Vesper trenches, the Crossing floor slab, the glass panel slab
- the Meridian island slab and its rail deck box
- the Halcyon island box and deep-hall walls
- lift tubes (bare glass cylinders) and the funicular (slab + box cabin)
- the water-wall box and the map-wall emissive box
- the two impostors (`metroDeepImpostor`, `metroSurfaceImpostor`). These are real and must survive: move them into a proper module when `greybox.ts` is deleted

See `refs/now-01-crossing-greybox.jpg`, `now-03-meridian-greybox.jpg`, `now-04-halcyon-greybox.jpg`.

## 4. Work in progress you must verify first (commit `500a0ed`)

The user stopped the previous session mid-task. That commit holds two partial edits. **It builds**, but neither was verified:

1. **`src/lighting/looks.ts`**: excludes materials shared with the hall from receiving metro environment maps, and precompiles shaders in both the surface and deep states.
   - The bug it fixes: the oculus uses library materials (`floorMarble`, `darkMarble`) shared with the hall floor, so the void env capture could re-skin the hall's reflections.
   - Verify:
     - After boot, a hall floor mesh's `material.envMap` is `null`.
     - A `balcony` shot matches `refs/good-08-hall-upstairs-reference.jpg` in tone.
     - The console has no "empty after excluding" warning.
     - `node scripts/metro-route-test.mjs` still passes with no frame over 50 ms.
   - Then get a code review of `looks.ts`.
2. **`src/layoutMetro.ts`**: new `SHELL` and `PORTAL` constants for the Phase 3 shell. They are a starting point for P3-1. Check them against `05` P3-1 and adjust there.

## 5. Measured numbers (P2-6 gate)

Headed M2 Chrome, auto quality, `scripts/perf-presets.mjs`, 10 s warm-up + 20 s sample. Avg fps / p95 ms:

| Preset | 1440×900 @1 | 1470×956 @2 |
|---|---|---|
| balcony | 58.1 / 17.6 | **45.6 / 33.8** (adaptive rung 7, pixel ratio 0.85) |
| concourse | 53.7 / 33.3 | 55.7 / 32.5 |
| oculus | 58.0 / 17.5 | 55.1 / 33.3 |
| rim | 56.2 / 33.1 | 54.2 / 33.3 |
| void | 58.2 / 17.5 | 57.7 / 18.5 |
| strata | 58.7 / 17.5 | 52.2 / 33.3 |
| escalator | 58.0 / 17.7 | 57.6 / 18.6 |
| threshold | 60.0 / 17.7 | 57.8 / 17.6 |
| crossing | 60.0 / 17.3 | 59.9 / 17.4 |

- Whole route: max frame 33.4 ms, p95 16.7 ms.
- Hall draw calls are over budget: balcony 278 against the pre-metro baseline of 245. Hiding `metroVoid` gives 247, so **the metro void group costs +31 calls** in hall views (oculus 10, void shell 10, escalators 5, disc 3, fixtures 3). Its own cap of 22 calls (`03` §3) is therefore **already breached**: accepted until P5-3, which fixes it with culling.
- The balcony at @2 only holds 45 fps because auto quality drops the pixel ratio to 0.85. Phase 5 must restore headroom.
- Phase 0 pre-metro baseline (q=auto, headless, under load, so not comparable): balcony 20.6 fps / 245 calls.

## 6. Carry-overs already assigned to later phases

| Item | Where it is fixed |
|---|---|
| Re-skin the −70 well gate in Monolith language | P3-4 |
| Move `HALCYON_PORTAL_EXTRA` from `src/metro/tracks.ts` into `layoutMetro.ts` | P3-5 |
| Re-frame camera presets so each shows its signature (e.g. `skyhole` doesn't show the eclipse, see `refs/now-02-skyhole-badly-framed.jpg`) | P3-9 |
| Wire the timetable + trains into the scene, deep env on train materials, add the train tests to `metro-test` | P4-W |
| Cull the void group from hall views (+31 calls), restore hall pixel ratio | P5-3 |
| Adaptive-quality rung changes cause 50–170 ms hitches (pre-existing) | P5-3 |
| Root-cause the NaN pixels on hall `darkMarble` (the guard hides them) | P5-3 |
| Speed-gate cabinet finish reads painted; escalator newels slightly boxy | P5-2 |
| Pre-existing walk-test failure "deck samples left y 7" (not metro, leave it) | none |

## 7. Tools you have

**Tests:**
- `npm run metro-test` runs layout, regions, nav-metro, runtime, zones and escalator-phase.
- `npm run nav-test`, `npm run graph-test` and `npm run traffic-sim` cover the mainline (must stay green).
- The train tests are not in any npm script yet (add them in P4-W):
  - `node_modules/.bin/tsx scripts/metro-train-test.ts`
  - `node_modules/.bin/tsx scripts/metro-trainmodel-test.ts`

**Live and browser:**
- `node scripts/metro-route-test.mjs [--headed]` walks the real route with real controls, records frames and asserts ≤ 50 ms.
- `npm run shot -- <presets> --q=high --out=meridian-deep/<folder>` takes screenshots plus a draw-call readout. Its fps number is **not** a performance measurement.
- `node scripts/perf-presets.mjs <comma-separated presets> [--sizes=1440x900@1,1470x956@2] [--warm=10] [--secs=20]` is the real performance measurement (headed).

**Metro camera presets** (`?cam=<name>&autostart=1&debug=1`):
- Descent: `oculus`, `oculusdown`, `rim`, `void`, `strata`, `escalator`, `threshold`, `speedgates`, `disc`, `lifts`.
- Cavern: `skyhole`, `crossing`, `meridian`, `glassfloor`, `glassup`, `mapwall`, `waterwall`, `funicular`, `deep`, `wellgate`.
- Hall presets (`balcony`, `concourse`, …) are for regression checks.

**URL switches:**
- `?debug=1` shows a stats overlay.
- `?q=low|med|high|auto` sets quality.
- `?timescale=N` (0.1–60) speeds up the simulation (trains). It does **not** affect metro real-time visuals.
- `?nogr=1` and `?noao=1` are A/B switches.

**Debug handle in the console:** `window.__meridian.metro()` returns `{ zone, look, disc: {y, docked}, feet }`. `window.__meridian.scene` and `camera` are also exposed.
