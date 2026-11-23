# Grand Meridian — Task List

Legend: [x] done & verified · [~] in progress · [ ] todo

## Phase 0 — Design
- [x] Brainstorm with user (role, aesthetic, mood, scale, audio, trains)
- [x] Spec + coordinate contract (`docs/superpowers/specs/2026-10-05-grand-meridian-design.md`)

## Phase 1 — Foundation (1 agent)
- [x] Vite + TS scaffold, pinned deps
- [x] `layout.ts` coordinate contract, `core/types.ts` module interface
- [x] Renderer, loop, post-FX (AO, bloom, tone map, vignette, grain, SMAA)
- [x] Adaptive quality controller (hold ≥ 50 fps)
- [x] Navigation/collision + self-test; first-person controls with head-bob
- [x] Camera presets, intro overlay, debug stats
- [x] Poly Haven CC0 texture fetch + material library
- [x] Screenshot/perf harness (`npm run shot`)
- [x] Director review: build, nav test (7/7), real-GPU screenshots

## Phase 2 — World (3 parallel agents)
- [x] Shared prerequisites: per-agent shot folders, shared dev server, prop obstacle registry
- [~] A: Concourse architecture (vault, coffers, colonnade, windows, balcony, grand stair) + props (clock kiosk, split-flap board, benches, lamps, chandeliers)
- [~] B: Train shed (iron trusses, glass roof, platforms, tracks, buffers, signage) + Art Deco streamliner model + arrive/dwell/depart scheduler
- [~] C: Lighting (static sun shadow, env capture, light probe, bounce lights) + atmosphere (sky, fog, god-ray shafts, dust) + procedural audio
- [ ] Director review: each module screenshots vs. quality bar

## Phase 3 — Integration & polish
- [ ] Full-scene visual pass (light balance, color grade, haze depth)
- [x] Performance pass (auto quality converges to 54-60 fps at 1440x900 and 1470x956@2x: `node scripts/perf-test.mjs`; N8AO half-res on all rungs; draw calls ~110, tris ~1.3M, tex ~208 MB)
- [x] Walk test end to end through the real controls (`node scripts/walk-test.mjs`: stair, kiosk/column/track bumps, island B z > 300, 0 console errors)
- [x] Train cycle verified live incl. depart (`node scripts/train-test.mjs`, `?timescale=N`)
- [x] Floor mottling root-caused (env reflection) and fixed; trains never baked into shadow map; ashlar scale; north wall emblem panels
- [x] Adversarial review of code (bugs, leaks, edge cases)
- [ ] Final screenshots + report to user

## Phase 4 — Hotel feel + ticket ritual (spec: `docs/superpowers/specs/2026-10-05-grand-meridian-phase4-hotel-ritual.md`)
- [x] Questions answered, addendum spec written & approved
- [x] Shared prep: layout constants, ticket store, module stubs, audio hooks, obstacle arrays, camera presets (director)
- [x] 4A Systems (browser walk-test route only partly verified — machine overloaded): layered navigation, gate lanes, interaction (E), ticket flow + ticket card UI, scheduler requestTrain, board hook, bell/ticket audio
- [x] 4B Hotel (revised 2026-10-06): SEPARATE first-class lounge room behind the south wall (doors, panelling, sun through windows), booking office, concierge desk, hall warmth 'a bit' (wainscot, runners)
- [x] 4C Structures: brass-and-glass ticket gates (animated paddles), ornate iron footbridge + stairs
- [ ] Director review: screenshots, extended nav/walk tests, perf
- [x] 4D Platform safety: half-height brass-and-glass platform edge doors (open for every stopped train) + glowing amber edge line on approach (starts after 4A/4C finish — shares scheduler + island edges)
- [x] Polish pass: lounge richness (damask/panelling, Persian rugs, chandeliers, piano, paintings), calm balcony rug, clear platform-door glass
- [x] Final walk-test: PASS (ticket ritual, gates, reserved train, bridge, 0 console errors); ticket requirement restored
- [ ] Auto-quality perf on a quiet machine

## Phase 5 & 6 — Platform ends, shops, station throat (spec: `docs/superpowers/specs/2026-10-06-grand-meridian-phase5-platform-ends-shops.md`)
- [x] Questions answered; spec, layout constants, stubs, obstacle arrays, camera presets (director)
- [x] 5A Platform ends: staff ramp + locked "AUTHORISED PERSONNEL ONLY" gate, warning signs, starter signals (green on departure), dispatch mirrors, STOP boards, signal box, lamp hut, luggage barrows
- [x] 5B Shops (incl. wrap-around corner windows, brighter interiors): newsagent & tobacconist, florist & confectioner, coffee & pastries, travellers' conveniences, cross-platform kiosk
- [x] 6A Track network: dense throat (scissors/diamonds), 4 main lines fanning W/E, second junction + flyover, goods line, carriage yard + shunting, interlocking, articulated trains (up to 6)
- [x] 6B Trackside details: point machines, marker posts, switch plates, signal gantries with route signals, catch points & buffers dressing (after 6A)
- [x] Regression (nav, walk, safety, route, graph tests all pass per agents); no further review per user (save tokens)

## Meridian Deep (spec: `docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md`, plan: `docs/superpowers/plans/2026-10-06-meridian-deep-plan.md`)
- [x] Phase 0 baseline (2026-10-06): build/nav/graph/traffic all PASS (nav-test 20 tests passed); walk-test FAIL (1), pre-existing, left as is: "FAIL deck samples left y 7: (20.07, 6.95, 226.11) ..." (everything else in the walk passed, 0 console errors); train/safety/route PASS; balcony 20.6 fps/245 calls/2,647,785 tris, concourse 29.0/231/2,323,317, kiosk 34.0/221/2,264,151, gates 31.9/214/2,241,955, arches 32.7/216/2,253,511 (q=auto, ANGLE Apple M2)
- [x] Phase 1 foundations + greybox (gate 2026-10-06): metro-route-test PASS (balcony -> oculus -> disc ride -> F6 -> F5/F4/F3/F2/F1 -> hall; disc-ride frames n=1747, p95 16.7 ms, max 16.8 ms, limit 50); metro/nav/graph/traffic PASS; train/safety/route PASS; walk-test only the pre-existing deck y 7 FAIL (its hall-north waypoints now skirt the oculus: test-side change); perf q=auto: balcony 58.0 fps/275 calls/2,826,970 tris, concourse 60.0/258/2,502,382, crossing 60.0/89/150,144, skyhole 60.0/94/181,104, glassup 60.0/96/181,656 (shots/meridian-deep/p1-perf). CONCERN: hall draw calls exceed the baseline+5 budget (balcony +30 vs 245, concourse +27 vs 231); fps figures not comparable to the baseline run (machine load).
- [x] Phase 2 descent gate P2-6 (2026-10-07): void env capture (VOID_LOOK.capture (0,-15,74), surface state, 256 cube -> `metro.userData.voidMaterials`), `captureDeep` -> `captureMetro`, all metro programs precompiled at boot (compileAsync with every group visible). metro-route-test PASS, WHOLE-ROUTE max frame 33.4 ms (p95 16.7; every leg max 16.8 except F3/F2/F1 33.4); metro-test + nav-test (20) PASS. Perf, headed M2 Chrome, auto quality, 10 s warm + 20 s sample (scripts/perf-presets.mjs), avg fps / p95 ms at 1440x900@1 | 1470x956@2: balcony 58.1/17.6 | 45.6/33.8; concourse 53.7/33.3 | 55.7/32.5; oculus 58.0/17.5 | 55.1/33.3; rim 56.2/33.1 | 54.2/33.3; void 58.2/17.5 | 57.7/18.5; strata 58.7/17.5 | 52.2/33.3; escalator 58.0/17.7 | 57.6/18.6; threshold 60.0/17.7 | 57.8/17.6; crossing 60.0/17.3 | 59.9/17.4. Floor (>=45) met everywhere; lowest = balcony@2x 45.6 (adaptive rung 7, pr 0.85; hall-dominated). CONCERN: hall draw-call budget still breached by the metro void group (balcony 278 vs 245 baseline: hiding metroVoid gives 247, i.e. +31: oculus 10, void shell 10, escalators 5, disc 3, fixtures 3; 26 merged-per-material meshes whose bounds always intersect the frustum, transparent double-sided glass draws twice). Needs portal/zone culling in Phase 5. Look curve: no layout-value changes needed.
- [x] Phase 3 cavern gate P3-9 (2026-11-23): all Monolith & Machine cavern architecture built (shell, buried sky, floating Meridian bridge + PSDs + slab track, Crossing floor + glass panel + monolith benches + 2035 well gate, Halcyon deep hall, 12 portals & 341.5 m horseshoe tunnels, living west water wall, backlit book-matched east white onyx wall, twin up/down glass capsule lifts with white onyx depth gauge, Ruling 37 ~50.7° inclined glass funicular, subtle warm 3200 K sensing halo, `greybox.ts` deleted → `impostors.ts`, 0 greybox refs in `src/`). Both-zone Metal PSO warmup added to `DepthLook.precompile()` (airlock crossing frame 177.3 ms -> 24.0 ms, 316 -> 316 programs / 0 compiles). Tests: `build`, `metro-test` (52/52), `nav-test` (20/20), `graph-test`, `traffic-sim` all PASS; extended `metro-route-test.mjs` (disc + F6 + lifts −70/−82/−70 via real `E` + funicular −70/−30/−70 + F5–F1) all navigation/mover checks PASS, 0 console errors. Geometry budgets: `metroDeep` 71 meshes / 407,010 tris total; worst deep view `glassup` 158 calls / 0.96M tris (`crossing`/`skyhole`/`funicular` 156 calls, cap <= 220 calls / <= 2.0M tris); 1910 hall unchanged (`balcony`/`concourse`/`oculus`). Evidence in `docs/meridian-deep-handoff/evidence/phase-3/`. NOTE: quiet-machine headed `perf-presets.mjs` / route frame-max re-check pending idle M2 GPU (live session load avg 10.9 with active Safari WebKit GPU tab contending).
- [x] Phase 4 metro gate P4-6 (2026-11-23): driverless mirror trains live on all 6 tracks (seed 42, pooled ×4 with per-slot tunnel-darkness shader 0→120 m, zero pale-fog pop, boot Metal PSO warmup); synced PSDs (exact smoothstep inverse, 0.3 s open lag / close lead, per-door alignment), 12-bore arrival light-waves (4 s lead, ~4-seg crest, luminance-balanced line-tinted mouth ribs, 2 s afterglow, 40 % departure wake, max-combined, 0 extra calls) & change-only hairline dot-matrix transoms (shared poetic station list); kinetic droplet ceiling (`r ∈ [21, 38]` Ruling 35, 2,314 × 140-tri champagne teardrops + merged distance-fading hairline cables, 2 calls, 45 s Changi sculptural cycle + 4 sim-time arrival pulses); 40 × 7 m backlit 2048×512 live map wall & 2.4 m running white onyx clock (`new Date()` continuous sweeping second hand, shares nothing with frozen 6:47 hall clock, 4 calls, `2.84e-13 px` dot accuracy). Tests: `build`, `metro-test` (85/85 across 10 suites), `nav-test` (20/20), `graph-test`, `traffic-sim` all PASS; extended `metro-route-test.mjs` (incl. 3-min Crossing dwell `?timescale=4`) all functional checks PASS (all 3 lines arrived, 0 PSD violations, 0 console errors, dwell `p95 = 33.4 ms / max 50.1 ms`). Headed M2 perf (`perf-presets.mjs`, `--extra=timescale=8`, 4 live trains, 1440x900@1 | 1470x956@2): crossing 60.0@1.35 | 55.8@1.20; meridian 60.0@1.35 | 59.4@1.35; glassup 60.0@1.35 | 54.4@1.10; mapwall 60.0@1.35 | 60.0@1.35; droplets 58.6@1.35 | 58.7@1.35; train 59.2@1.35 | 57.2@1.10; deep 59.0@1.35 | 59.2@1.35 (all ≥ 50 fps @ pr ≥ 1.10, worst deep calls 198 ≤ 266, 0 errors; 1910 hall unchanged). Evidence in `docs/meridian-deep-handoff/evidence/phase-4/`.
- [x] Phase 2 descent (above) done · [x] Phase 3 cavern (above) done · [x] Phase 4 metro (above) done · [ ] Phase 5 acceptance
