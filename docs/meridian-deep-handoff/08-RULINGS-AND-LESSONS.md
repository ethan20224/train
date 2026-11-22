# 08 — Rulings and Lessons (decisions already taken; mistakes already made once)

The original progress ledgers live in git-ignored `.superpowers/sdd/`, so they may not exist in your checkout. This file carries everything that matters from them. These rulings **are binding** (precedence in `00` §2). Format: what was decided — why — what it costs if wrong.

## A. Product and design rulings

1. **Performance floor is ≥ 45 fps for the whole station, hall included** (Ethan, explicit). Metro views keep the spec's ≥ 50 — Ethan's requirement — failing it fails the project.
2. **The cavern is a cross plan; Meridian runs north–south on the floating bridge, Vesper east–west on the Crossing floor and through the water wall**; Crossing floor −70, Halcyon −82, bridge 24 m above the floor — geometry had to fit (escalators crossed tracks in the first sketch); Ethan was shown the changes — none.
3. **The Threshold (y −30) replaces the old −40 gallery; speed gates there; the last escalator descends through the sky** — fits the geometry, creates the "through the sky" moment — none.
4. **Glass floor is an axis-aligned panel x −30…−10, z 65–83** over the diagonal Halcyon hall — a diagonal strip overran the floor edges — none.
5. **Cove light under every deck edge** (Ethan approved, from his reference images) — makes stacked levels glow against the sky — none.
6. **The disc does not auto-depart with a rider who arrived on it**; the rider steps off and on again to ride back — prevents ping-pong — the rider must step off and on. **The funicular follows the same rule.**
7. **Gate leaves animate in real time over 0.35 s** (not the spec's 0.6 s); navigation opens on docking — the lag is imperceptible at walking speed — a brief clip through a half-open leaf.
8. **Line accents never glow as decoration**; the train stripe is a satin enamel inlay; the train front is a curved dark-tinted glass panel showing the lit saloon — Ethan's anti-neon, anti-slop taste — none.
9. **No bronze or brass in the cavern**; the −70 well gate is re-skinned in glass + stainless (P3-4); the lift depth needle is stainless/champagne, not brass (overrides the spec's "brass needle") — vocabulary rule — none.
10. **First train arrival is about 28 s after first entering the deep zone** (not about 10 s) — the 250 m darkness spawn rule makes 10 s impossible from empty; the simulation runs from boot, so trains are usually already moving — an occasional quiet first half-minute.
11. **The 4-train cap counts trains present (moving + stopped)** — stricter, protects the budget — slightly sparser traffic.
12. **Void era light colour temperatures 2700 / 4300 / 5800 K** (stone / strata / polished) — legibility of the three eras — none.
13. **Speed-gate visuals accepted with a residual** (cabinet finish reads painted) → P5-2 — proportions and function met; material is a look-dev job — one more material pass.

## B. Engineering rulings

14. **Obstacles without `level` apply only where ground y ≥ −5** (hall); metro levels ignore them — hall props must not collide 46 m below — a surface prop missing collision on some future sub-surface level.
15. **`heightAt` / `groundAt` with no `nearY` returns the level whose ground is closest to y = 0** (was: lowest); a prop blocking that surface level returns `null` instead of falling through to a metro level — avoids snapping to the metro under the hall — callers relying on "lowest".
16. **Every escalator low end gets a hole in the level region beneath it** (F3 on the Threshold annulus z 74.1–79.52, F4 on the Meridian island, F5 on the Crossing floor, F6 on the Halcyon island) — the level wins height ties and traps riders — small unwalkable strips beside escalator feet.
17. **Micro-detail values may be named constants in the builder file; only cross-module coordinates/dimensions must be in `layoutMetro.ts`** — the rule targets layout drift, not moulding profiles — none.
18. **`metroVoid` draw cap is 22 calls and its triangle cap of 400 k includes the oculus** — triangles seen through the oculus cost hall frames — a slightly coarser strata mesh (done: 320 × 150 grid).
19. **The hall draw-call breach (+31 from the void) is deferred to P5-3 culling** — the user-facing floor (45 fps) is met; the call budget was a proxy — the hall runs at a reduced pixel ratio until P5-3.
20. **NaN guard after the RenderPass using `BlendFunction.SRC`** (NORMAL blend keeps NaN, since NaN × 0 = NaN) — fixed the pre-existing black block on `main`; root material fix deferred to P5-3 — about 0.3 ms per frame.
21. **Interactive metro visuals are driven by `onMetroFrame` in real time; trains and train-driven effects by simulation time** — the gates froze at low timescale before — none.
22. **`HALCYON_PORTAL_EXTRA` (10 m) stays in `src/metro/tracks.ts` until P3-5 moves it into `layoutMetro`** — none.
23. **Train tests are not in `metro-test` yet**; P4-W adds them — none.
24. **Work happens on branch `meridian-deep` in the main checkout** (node_modules, textures, dev server and shot harness live there) — none.

### Taken while finalising this package (a cold-read review found the gaps)

25. **Twelve single-track bores, in pairs, not six portals**. Each pair reads as one composed portal; every bore has a role: arrival wave in a track's `portalIn` bore, departure wake in its `portalOut` bore — two tracks 13–23 m apart can't share a 5 m mouth — none.
26. **The shell stands on the base floor (−72.5) everywhere and never descends to −84**. The Halcyon hall is an enclosed volume below, with its ceiling at −73.5, a light well under the glass panel and two lit corner shelves where the rectangular panel overhangs the diagonal hall — the old text walled the hall off and put its ceiling above the base floor — slightly lower Halcyon headroom (8.5 m).
27. **Cavern division strips are flush brushed stainless, never brass** (base floor field and Crossing floor) — ruling 9 outranks the old text — none.
28. **Cove light is 3200 K everywhere** (it matches the built void coves, `VOID_DETAIL.lightK.cove`) — consistency with what's approved — none.
29. **Lift cabins and the funicular cabin are "both-zone" movers**: in `metroVoid`, sun-masked, env map swapped at the airlock. Static tubes and track are split at the deck or sky plane — void materials alone would reflect the void in the cavern; deep materials alone would vanish from above — one small `looks.ts` addition.
30. **Screen doors lag and lead the train doors by remapping `doors01`, with no timetable change** — the timetable is tested and stays untouched — none.
31. **`DOOR_HALF` moves into the layout as `METRO_TRAIN.doorHalf`** (P3-3) — the screen doors depend on it — none.
32. **Tunnel lining length, measured from the bore mouth, is `spawnClearance + METRO_TRAIN.length + 10` = 341.5 m for all 12 bores**, and trains get a tunnel-darkness factor — otherwise trains pop pale out of a too-short tunnel — 4 sets of cloned train materials (same program, so no extra compile).
33. **Metro perf passes count only at a final pixel ratio ≥ 1.0**; hall regression tolerance is 3 fps at the same or higher pixel ratio — auto quality can otherwise "pass" by blurring the image — stricter gates.
34. **The deep shadow fit covers the walls as well as the floor (target ≤ 6 cm per texel)**; joints come from geometry and colour, not the shadow map — a 4 cm floor-only fit can't satisfy the wall-shadow acceptance — slightly softer floor shadows.
35. **Droplets start at r 21 (beyond the Threshold deck) and are clipped to the cross outline**; the `droplets` preset is shot from the Meridian island — under-deck droplets would hang from the wrong surface; the Threshold view hides the field — fewer droplets at the same density.
36. **The `metroVoid` breach is acknowledged at 31 calls**; new void additions are capped (lifts ≤ 6, funicular ≤ 4, others ≤ 2); P5-3 adds portal culling for when the oculus is in view (balcony) — whole-group culling can't help the worst preset — a few extra sub-mesh calls when visible.
37. **Funicular geometry is re-derived** (P3-8b): top station just outside the Threshold deck edge, so the approved deck is untouched; bottom station on the Crossing floor with a pit; slope from those two stops (about 50°, not 45°); sky slot sized from the cabin's swept volume — a level 4 m cabin on a 45° rail cannot stop flush at (58, −70) in front of a wall at x 60 — a slightly steeper incline.
38. **No light slots on the four 40 m end walls** (portals, water, onyx and map wall own them) — keeps each pair of bores composed — none.

## C. Lessons (each cost a fix round; do it right first time)

- **L1. Height ties in navigation.** Static regions resolve before dynamic, and on an exact tie the earlier region wins. Use it deliberately (landings before escalators stop the belts), and remember it traps players at escalator feet (ruling 16). **Test every up and down unit.**
- **L2. Shared materials.** Library materials are shared with the hall. Mutating them, injecting shaders into them or env-mapping them changes the hall. Clone for the metro. (Two separate incidents: void ring light leaking, and the void env map nearly re-skinning the hall floor.)
- **L3. Masked vs deep materials.** `.clone()` of a sun-masked material may carry the mask. Build deep materials independently (`kit.deep.*`).
- **L4. NaN.** One NaN pixel becomes a black third of the screen through mipmap bloom. To find one: render the scene into a `HalfFloatType` target, `readRenderTargetPixels`, scan for exponent `0x1f`, and raycast that pixel. The guard is a safety net, not permission.
- **L5. Vertex-coloured materials** need a `color` attribute on every merged geometry, or they render black.
- **L6. Precompile** every program at boot; first-view compiles freeze frames (684 ms seen).
- **L7. Shot-harness fps is not performance.** It read 10–20 fps under agent load; real headed measurement said 45–60. Measure with `perf-presets.mjs` on a quiet machine.
- **L8. Coplanar faces flicker.** Keep ≥ 0.1 m offsets at this scale (the Threshold deck vs the sky plane).
- **L9. One writer per file.** Parallel agents on `layoutMetro.ts` / `metro.ts` mixed commits. Serialise shared files; stage explicit paths only.
- **L10. Verify reviewer claims.** A reviewer once insisted a script was missing; one grep proved it wasn't.
- **L11. Taste failures cluster around chunkiness, fake glow and wrong-era materials.** Run `02` §2 before every visual acceptance.
- **L12. The first visual attempt is rarely the final one.** The train needed two director rounds; the terrazzo one; the gates two. Budget for iteration; never accept round one by default.
- **L13. Geometry is checked with arithmetic, not intuition.** Before building anything that meets something else (a hall under a floor, a panel over a diagonal hall, a cabin at a floor edge), compute the corner coordinates and check them against the outline. Ruling 26 exists because nobody did this once.

## D. Deferred minor items (fix if you touch the code; triage at the final review)

- `metro-layout-test` hard-codes `MEDALLION_R` 9.46; the down unit is chosen by float equality.
- Navigation: per-call array allocations in `pick`/`connectorsAt`; `groundY` gives NaN if `ramp.from === ramp.to`; `carryAt` returns a live object.
- `onDisc` compares pre-carry feet with the new disc y (safe at the 0.05 s dt clamp).
- `captureEnv`: the PMREM render target leaks if the second pass throws.
- Strata: no unit test for `createStrata`; polished-band joints may shimmer at long range; `VOID_DETAIL.strata` grid fields unused.
- Escalators: newels slightly boxy (P5-2).
- Timetable: stop-tolerance test vacuous by construction; the effective per-track headway is about 125 s because of the cap (document it).
- Presets: some coordinates are literals; derive from layout where tied to metro geometry.
