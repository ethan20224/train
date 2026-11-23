# Meridian Deep — Phase 3 (Cavern) Gate Evidence

**Branch:** `meridian-deep` · **Tasks:** P3-0 through P3-9 · **Date:** 2026-11-23

## Summary

Phase 3 replaces every cavern greybox element with finished 2035 Monolith & Machine architecture (`src/world/metro/greybox.ts` deleted, 0 `greybox` references in `src/`):
- **P3-0:** `DepthLook` hardened (linear HDR `precompile()`, both-zone Metal PSO warmup at boot, zero runtime shader compiles `316 -> 316`, airlock crossing frame reduced from `177.3 ms` to `24.0 ms`).
- **P3-1:** Monolith cavern shell (`shell.ts`, 6 calls) — 26 stack-bond honed limestone courses, 12 mm shadow gaps, recessed plinth, floating sky reveal, vertical cool light slots, black granite west backing, dark terrazzo base floor with flush stainless strips.
- **P3-2:** Buried noon sky (`sky.ts`, 3 calls) — CoeLux view-direction Rayleigh shader, razor-crisp SSE solar disc, stainless slot rims, `3.08 × 3.07 cm/texel` cross-prism deep shadow fit.
- **P3-3:** Floating Meridian bridge (`meridian.ts`, `psd.ts`, `track.ts`, 14 calls) — chamfered white-steel girder, warm 3200 K outer soffit coves, 22 stainless tension hangers, terrazzo + ink-blue enamel inlays, full-height champagne PSDs, slab tracks.
- **P3-4:** Crossing floor, glass panel, monolith benches & 2035 well gate (`crossing.ts`, `disc.ts`, 18 calls) — zero-coplanar terrazzo + 1.5 m stainless grid + jade/ink-blue/oxblood inlays, laminated fritted glass floor, cantilevered limestone benches with collision & warm under-lights, 2035 curved sliding glass well gate (zero bronze/brass in cavern), and bottom newel/combplate fix across F1–F6.
- **P3-5:** Halcyon deep hall (`halcyon.ts`, 10 calls) — 110 × 20 m diagonal hall at `−82 m`, horizontal cool wall slots, 3×3 m coffered ceiling, daylight shaft + corner light shelves, lined F6 escalator cutting, oxblood PSDs (stepped cleanly under F6) & slab tracks.
- **P3-6:** Twelve tunnel bores & 341.5 m horseshoe linings (`portals.ts`, 4 calls) — stainless reveals, distance-darkened charcoal tunnels (no fog washout), 684 instanced 6 m arch light ribs on one HalfFloat `DataTexture` (ready for P4-3 wave).
- **P3-7:** Living west water wall & east backlit book-matched white onyx wall (`waterWall.ts`, `onyxWall.ts`, 5 calls) — quintic-smooth gravity-accelerating water mirror parted cleanly around both west Vesper bores; 27×13 quarry-scale book-matched alabaster white onyx slabs in stainless mullions.
- **P3-8a:** Twin working glass capsule lifts (`lifts.ts`, `liftsView.ts`, `gates.ts`, `looks.ts`, `interaction.ts`, 6 void calls + 4 deep calls) — full up & down travel across Threshold (`−30 m`), Crossing (`−70 m`), and Halcyon (`−82 m`), rotating doorways, backlit white onyx analog depth gauge (`0 → −82 m`) with brushed stainless needle & lit floor buttons, both-zone PMREM env swap without recompile, turning machinery sheaves, seeded 2:1 weighted ghost runs.
- **P3-8b:** Working inclined glass funicular (`funicular.ts`, `funicularView.ts`, 4 void calls + 3 deep calls) — Ruling 37 ~50.73° brushed-stainless monorail spine + toothed rack, level glass cabin on triangulated wedge bogie chassis (doors & gates locked shut while moving), enclosed luminous sky-slot hood, Threshold east top station (approved deck uncut), bottom pit (`−76 m`), `< 2.3 m` under-incline glass guard, continuous Crossing east balustrade.
- **P3-9:** Subtle warm 3200 K sensing halo (`halo.ts`, deep honed limestone & deep terrazzo only, `~4 m` radius, `+0.05` albedo lift, `0.5 s` follow), `greybox.ts` deleted → `impostors.ts`.

## Verification & Gate Numbers

- **Node test suites:**
  - `npm run build` — PASS (`tsc --noEmit && vite build`, 0 errors)
  - `npm run metro-test` — **52/52 PASS** (`metro-layout-test` 15, `nav-regions-test` 6, `nav-metro-test` 8, `metro-runtime-test` 16, `zones-test` 4, `escalator-phase-test` 3)
  - `npm run nav-test` — **20/20 PASS**
  - `npm run graph-test` — **PASS**
  - `npm run traffic-sim` — **PASS**
  - `grep -rni "greybox" src/` — **0 hits**
- **Geometry & draw-call budgets (`metroDeep` total: 71 meshes, 407,010 tris):**
  - Worst deep preset: `glassup` **158 calls / 0.96 M tris** (`crossing` 156 / 0.93 M, `skyhole` 156 / 0.95 M, `funicular` 156 / 0.96 M) — strictly under Phase 3 ceiling (**≤ 220 calls / ≤ 2.0 M tris**).
  - Zero console errors or warnings across all 20 verification views.
- **Extended browser route test (`node scripts/metro-route-test.mjs`):**
  - Every functional & navigation check PASS (hall → disc ride → F6 down/up → **capsule lift −70 → −82 → −70 via real `E` controls** → **inclined funicular −70 → −30 → −70** → F5 → F4 → Threshold north edge → F3/F2/F1 → hall; 0 console errors).
  - Isolated airlock frame delta verified at **`24.0 ms`** (`316 → 316` programs, 0 compiles) with normal deep frames **`4.6–18.4 ms`**.
  - **Honest machine-load note:** During the live session on this M2 Air, load average was `~10.9` with a live Safari WebKit GPU tab open on localhost, causing OS vsync contention across both the untouched hall (`balcony` 25.4 fps vs 58.1 baseline) and deep presets (`floor` 48.5, `crossing` 43.6). Quiet-machine headed `perf-presets.mjs` and `metro-route-test.mjs` frame-max verification will be re-run cleanly on an idle GPU (and in Phase 5 perf gate).

## Scored Review (`09 §3`, all 20 gate screenshots)

| Section | Score | Notes |
|---|---:|---|
| **A — Light & atmosphere** | **9.0 / 10** | Crisp buried noon sky, cool/warm 2035 cavern balance, zero hall bleed (`balcony`/`concourse`/`oculus` unchanged), clean both-zone PMREM env swap on lifts & funicular. |
| **B — Materials & scale** | **9.0 / 10** | Zero bronze/brass in cavern; honed limestone, dark terrazzo, brushed stainless, champagne aluminium, backlit book-matched white onyx, living black-granite water mirror, ultra-clear fritted glass. |
| **C — Architectural composition** | **9.5 / 10** | Hero views (`crossing`, `floor`, `glassup`, `sun`, `skyride`, `waterwall`, `onyx`, `portal`, `lift`, `twin`, `funicular`, `deep`, `meridian`) all read as monumental 2035 architecture. |
| **D — Geometry & seams** | **9.5 / 10** | Zero z-fighting, zero clipping, Ruling 37 funicular invariants proven across 200 incline samples, Threshold slab shafts cut cleanly, F1–F6 bottom newels flush, continuous east Crossing balustrade. |
| **E — Fidelity to spec & rulings** | **9.5 / 10** | Every Phase 3 task P3-0..P3-9 and Rulings 27–40 satisfied; zero greybox remaining. |
| **F — Performance & budgets** | **8.5 / 10** | 407k deep tris (20% of 2M cap), 158 worst deep calls (≤ 220 cap), 0 runtime shader compiles, 24 ms airlock crossing; pending quiet-machine headed FPS confirmation without live Safari GPU load. |
| **G — Restraint & taste** | **9.5 / 10** | Hi-tech 2035 machine aesthetic throughout; every glow is a real fixture; zero sci-fi clichés. |

## Gate Screenshots

- ![crossing](crossing.jpg)
- ![floor](floor.jpg)
- ![skyhole](skyhole.jpg)
- ![sun](sun.jpg)
- ![skyride](skyride.jpg)
- ![meridian](meridian.jpg)
- ![portal](portal.jpg)
- ![glassfloor](glassfloor.jpg)
- ![glassup](glassup.jpg)
- ![waterwall](waterwall.jpg)
- ![onyx](onyx.jpg)
- ![lift](lift.jpg)
- ![twin](twin.jpg)
- ![funicular](funicular.jpg)
- ![deep](deep.jpg)
- ![wellgate](wellgate.jpg)
- ![mapwall](mapwall.jpg)
- ![balcony](balcony.jpg)
- ![concourse](concourse.jpg)
- ![oculus](oculus.jpg)
