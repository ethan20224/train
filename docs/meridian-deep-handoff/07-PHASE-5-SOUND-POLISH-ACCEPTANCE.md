# 07 — Phase 5: Sound, Look-dev, Performance (hall included), Acceptance

**Goal:** the metro sounds as good as it looks; every view is tuned; the **whole station holds ≥ 45 fps on Ethan's M2 MacBook Air with headroom**; everything is verified; Ethan approves.

---

## P5-1 — Sound design (procedural Web Audio, `src/audio/audio.ts`)

**Rules:**
- **No music, no spoken announcements, no door chimes.** Sound is architecture and machinery.
- Everything is procedural (oscillators, filtered noise, convolvers built from generated impulses). No sound files.
- Positional sounds use the existing engine's patterns (look at how train voices and the bell are made).
- Keep active positional voices ≤ about 12. Voices beyond about 40 m fade out and are released.
- No per-frame allocation in audio updates.

**Build exactly this:**
- **Zone acoustics:**
  - The hall's long warm reverb crossfades into a **deep room tone** by the same depth factor as the look (`lookFactor`).
  - The deep reverb is shorter, brighter and more precise, with a very quiet broadband "air" bed (about −40 dB). It must feel like a hushed, expensive space.
  - Footsteps change character with the floor (marble in the hall, terrazzo and limestone below) and take the zone's reverb.
- **Escalators:**
  - Sound: a soft low machinery hum, plus the faint rhythmic tick of the step chain, speed-linked (idle vs active).
  - Positional on the nearest 3 units only.
- **Sinking Floor:** a smooth low motor whir with gentle air movement while moving; quiet gate glides.
- **Speed gates:** a soft pneumatic slide on open and close.
- **Lifts:** motor whir, curved-door glide, a faint cable hum. The empty twin passing is just audible.
- **Funicular:** a soft rail roll plus a motor.
- **Water wall:** positional, band-passed pink noise layers, calm. Loudest at the wall, gone by mid-floor. No obvious loop.
- **Metro trains** (`createTrainVoice`-style, positional):
  1. Approach: a tunnel **rush of air** that rises with the light-wave crest at the portal.
  2. Arrival: a quiet steel glide (soft rumble + high hiss).
  3. A brake sigh.
  4. Pneumatic door slides (no chime).
  5. Departure: a tasteful electric-motor whine rising with speed.
- **Upstairs:** mainline train voices attenuate with depth (already partly handled; verify).

**Acceptance:**
- A headed walk from the balcony to the Crossing and back, listening. Each transition is gradual, not switched.
- Nothing is grating or repetitive. The deep station feels quiet and expensive.
- `perf-presets` shows no fps loss from audio.

## P5-2 — Look-dev pass (every preset)

- [ ] **Per-zone tuning:** exposure, bloom and grade per zone via the layout values (`DEEP_LOOK`, `VOID_LOOK`, `ZONES`, `SKY_LOOK`), never hard-coded.
  - The deep look is crisp neutral white.
  - Night-blue or golden casts are wrong down there.
  - The descent still goes warm gold → darkest strata → pale polished → noon blue.
- [ ] **Residuals from Phase 2:**
  - The speed-gate cabinets read as painted (`refs/residual-06`): give them a real anodised-metal response in the void env (metalness 1, roughness about 0.3, env intensity tuned so they read champagne metal, not cream).
  - The escalator newels are slightly boxy: soften their profile toward a rounded stainless newel.
- [ ] **Light balance:** cove, slot and reveal intensities, onyx glow, halo strength (barely perceptible), portal idle shimmer.
- [ ] **Hero set:** walk every preset in `02` §6 and fix anything that fails the `04` §4 checklist. Produce a **hero set** for Ethan (8–12 best views, JPEGs in `docs/meridian-deep-handoff/evidence/hero/`), each of which would make him say "wow". At minimum:
  - balcony (light rising)
  - rim
  - strata
  - escalator
  - skyride
  - crossing
  - meridian
  - glassup
  - waterwall
  - train
  - droplets
  - mapwall

## P5-3 — Performance pass (the whole station, hall included)

**Target:** every preset ≥ 45 fps at both sizes, metro ≥ 50, **without** the adaptive controller having to drop the pixel ratio below 1.0 in normal use where avoidable, and **with no visible change to the hall's look**.

- [ ] **Cull the void from the hall:**
  - The problem: the `metroVoid` group costs about +31 draw calls in hall views because its merged meshes always intersect the frustum.
  - The fix: when the camera is in the surface zone, hide the void's renderables unless the oculus is potentially visible. That means the oculus bounding sphere (centre (0, 0, 74), r ≈ 10, plus the gangway) intersects the camera frustum and is above-and-in-front. Toggle **renderables only, never lights** (follow `DepthLook`'s toggle rule).
  - Don't show a hole: keep the surface impostor logic consistent.
  - Measure: hall presets with the oculus out of view get their calls back to ≤ the pre-metro baseline + 5.
- [ ] **When the oculus is in view** (the `balcony` composition, today's worst preset: 45.6 fps at @2 at pixel ratio 0.85), culling the whole group doesn't apply. Do portal culling instead:
  - Split the large merged void meshes into a few sectors and height bands (each still merged per material). This adds a few calls but lets them be culled.
  - Each frame in the surface zone, show only the sub-meshes whose bounds intersect the frustum formed by the camera and the oculus aperture (the r 9 opening).
  - Seen from the balcony, most of the void is hidden behind the hall floor.
  - Target: `balcony` ≥ 45 fps at @2 **with pixel ratio ≥ 1.0**, and `rim`/`oculus` no worse.
- [ ] **Glass:** where large transparent glass is `DoubleSide`, switch to `forceSinglePass` or `FrontSide` if it still looks right (double-sided transparency draws twice).
- [ ] **Adaptive-quality hitches** (pre-existing: rung changes cause 50–170 ms frames):
  - Read `src/core/quality.ts` and find what a rung change does (pixel ratio → `composer.setSize` → render-target reallocation is the likely cause).
  - Fix: longer hysteresis and rate-limiting at least, ideally avoiding reallocation.
  - Prove it: no frame over 50 ms during a 5-minute walk.
- [ ] **NaN root cause:** find which hall material produces the 3 NaN pixels (scan the HDR frame, as in `08` lesson L4; suspect `darkMarble` normal mapping on degenerate UV derivatives). Fix the source; keep the guard.
- [ ] **If the hall still lacks headroom:** profile it (draw calls per module via hiding modules, shadow-map cost, AO and god-ray cost with `?noao=1`/`?nogr=1`) and merge its static meshes per material where they aren't already, **without changing how it looks**.
  - Report the before/after per preset.
  - If a real conflict between the floor and the hall's look appears, stop and ask Ethan with numbers. Never silently degrade the hall.

## P5-4 — Acceptance and handover to Ethan

- [ ] `npm run build && npm run metro-test && npm run nav-test && npm run graph-test && npm run traffic-sim`.
- [ ] Live regression, sequential: `walk-test`, `train-test`, `safety-test`, `route-test`. Only the known "deck samples left y 7" failure is allowed.
- [ ] `node scripts/metro-route-test.mjs`, full extended route: **no frame over 50 ms**.
- [ ] **5-minute mixed walk** (hall → descent → Crossing → lifts → funicular → Halcyon → back), headed: watch for thermal throttling and memory growth (`performance.memory` or the debug overlay); record start and end.
- [ ] `perf-presets.mjs` over **every** preset (hall and metro) at both sizes, recorded in `docs/TASKS.md`.
- [ ] **Zero console errors**, no NaN, no "empty after excluding" warnings.
- [ ] **No greybox remains** (`grep -ri greybox src` returns only history, or nothing).
- [ ] **Final whole-branch review** on the most capable model available, over `git diff main...meridian-deep`, pointing it at `LEDGER.md` (rulings and deferred minors). Fix the findings in one wave; record a ruling for anything you don't fix.
- [ ] **Docs:**
  - update `docs/HANDOFF-meridian-deep.md` (final state)
  - tick everything in `docs/TASKS.md`
  - complete `LEDGER.md`
  - push
- [ ] **Present to Ethan:** the hero set, the walk instructions on localhost, the measured numbers, and anything honest that isn't perfect.
- [ ] **Merge to `main` only after Ethan explicitly says yes.** Use a normal merge commit; don't squash away the history.
