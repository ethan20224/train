# Meridian Deep — Phase 2: The Descent (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Replace the Phase 1 greybox of the oculus, void, landings, Threshold, escalators F1–F4 and the Sinking Floor with finished architecture, so that the descent from the Grand Hall to the sky is one of the best moments in the experience.

**Architecture:** Phase 1 froze the interfaces: `src/layoutMetro.ts` (coordinates), navigation (regions, conveyors, movers), `escalators` / `disc` runtime, `DepthLook` (airlock at −16; void group always drawn; `excludeDirectionalLight` for void materials), the greybox in `src/world/metro/greybox.ts`. Phase 2 adds focused builder files under `src/world/metro/` and removes the corresponding greybox pieces task by task, keeping the app working after every task.

**Spec:** `docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md` (§2.1–2.4, §2.7, §3, §4, §5.1–5.3, §5.6). **Master plan:** `docs/superpowers/plans/2026-10-06-meridian-deep-plan.md` (Global Constraints apply verbatim).

## Global constraints (Phase 2 additions)
- Hall views: draw calls ≤ Phase 0 baseline + 5 (balcony baseline 245 at q=auto). Everything in the void group that the hall can see is merged per material.
- **Void group draw budget: ≤ 14 calls total**, counting merged static meshes per material plus one instanced step mesh. Triangle budget for the void group: ≤ 400k.
- Void materials keep `excludeDirectionalLight` (the void never receives either sun). Light inside the void comes from emissive elements, the environment and the hemisphere/probe.
- No new real lights. Light rings, cove light and onyx are emissive.
- Upstairs vocabulary (hall side of the oculus, the stone era band) is Beaux-Arts: moulded stone, bronze, brass. Everything from the polished band down is Monolith & Machine: honed limestone, white onyx, brushed stainless, champagne aluminium, ultra-clear glass, razor shadow gaps. No sci-fi tropes (spec §4 banned list).
- Real dimensions: escalator steps 1.0 m wide, 0.4 m treads, 0.2 m risers on the incline (30°), handrail 1.0 m above step nose, balustrade glass 0.9 m; gangway 2.4 m wide; balustrades 1.1 m.
- Every task ends with real-GPU screenshots via `npm run shot` (dev server on :5173, reuse it). The director judges them against spec §4. Build success is not visual acceptance.

## Review focus
1. The hall must still look untouched except for the oculus. Check hall presets for z-fighting at the curb/floor joint, and for light leaks.
2. Escalator steps must flow continuously at each unit's real speed, in its real direction, with no popping at the ends. Escalators visible from the oculus rim must look right at a distance.
3. The airlock switch must still produce no frame over 50 ms with the heavier void.
4. The disc must never visually separate from the player riding it (the mesh follows `disc.y` in real time even at `?timescale=0`).
5. Gangway gates and speed gates are visual only. Navigation already decides passability, and the visuals must agree with it: open exactly when walkable.

---

### Task P2-1: Consolidate shared metro numbers + metro material kit

**Files:** modify `src/layoutMetro.ts`, `src/metro/navData.ts`, `src/world/metro/greybox.ts`; create `src/world/metro/materials.ts`; extend `src/materials/textureManifest.json` (+ fetch); update `scripts/metro-layout-test.ts` if needed.

- [ ] Move into `layoutMetro.ts` (named, documented), then consume them everywhere they are currently literal: the inner/outer escalator bands (`ESCALATOR_BANDS.inner/outer`), `VESPER.f6OpeningZ` (66, 69.6), `MERIDIAN.f5OpeningX` (= inner bands), Meridian rail-deck half-width (12.3), the funicular track half-width (1.3) and sky slot rect, and the trench half-width (1.6). Grep `src/world/metro` and `src/metro` for remaining metro literals. `npm run metro-test && npm run nav-test` must stay green, and greybox screenshots must be unchanged.
- [ ] `src/world/metro/materials.ts`: `createMetroMaterials(renderer, lib): MetroMaterials`, one shared instance per material, each with world-scale UV guidance (`metersPerTile`):
  - **carvedStone**: library `wallStone` textures, warmer and slightly darker than the hall (it is the hall's foundations).
  - **strata**: raw rock. Add a Poly Haven CC0 rock set to the manifest (search the API for a layered/sedimentary rock, e.g. by tags "rock" + "cliff"/"layered"; choose 1k; record the asset id) and fetch it with `npm run fetch-textures`. Tint it to cool grey-brown.
  - **honedLimestone**: pale, almost white, matte (roughness ~0.55). Use a CC0 limestone/plaster set if a clean one exists; otherwise the `wallStone` textures desaturated and lightened, with the joint grid supplied by geometry.
  - **onyx**: white onyx, backlit. A `MeshStandardMaterial` with an emissive procedural vein texture (canvas, following the `hotel/textures.ts` pattern): warm-white veins, emissive intensity controlled by a uniform-free scalar (`emissiveIntensity`).
  - **terrazzo**: dark polished terrazzo (procedural canvas: near-black matrix with white/grey/brass chips; roughness ~0.18). It is used on deck tops.
  - **stainless**: brushed (anisotropic look via a stretched-noise roughness map).
  - **champagne**: anodised aluminium (metalness 1, warm tint 0xcdbb98, roughness 0.3).
  - **glass**: ultra-clear balustrade glass, transparent, low opacity, faint green edge (render order handled).
  - **bronze**: dark Beaux-Arts bronze (hall side).
  - **brass**: library brass.
  - **emissive**: warm-white light strip (HDR ~3.0, colour temperature 3500 K) and cool-white ring light (HDR ~3.2, 4000 K).
- [ ] All void-side materials get `excludeDirectionalLight`. Deep-side materials are separate instances (Phase 3 uses them) and are registered in `metro.userData.deepMaterials`.
- [ ] Texture memory stays ≤ 450 MB total (`?debug=1` estimate). Record the new figure.
- [ ] Commit.

### Task P2-2: The oculus (hall side)

**Files:** create `src/world/metro/oculus.ts`; modify `src/world/metro/greybox.ts` (remove the greybox curb, balustrade, gangway and throat walls), `src/world/metro.ts`, `src/world/concourse/floor.ts` (match the curb polygon count, 96 segments).

- [ ] **Curb:** a moulded stone ring r 9.0–9.6, top +0.15. Its profile, swept with `concourse/geo.ts sweep()` around the ring, is a torus bead, a fillet and a cyma reversa, plus a thin brass inlay band flush in the hall floor at r 9.65–9.72 (floor field hole r 9.6 stays; the inlay sits just outside the curb). Use carvedStone + brass.
- [ ] **Balustrade:** Beaux-Arts bronze openwork at r 9.3, height 1.1:
  - a moulded bottom rail and a polished brass handrail (torus sweep)
  - cast balusters (lathe profile, `InstancedMesh`, ~0.18 m spacing)
  - every ~3 m a heavier pedestal post with a small brass finial
  - balustrade openings at the gangway (2.4 m) and on the throat sides
  - Must not block the view down: you can see through it.
- [ ] **Throats:** at x ±[8.4, 12.0], z [62.5, 69.3]. Stone curbs and the same bronze balustrade along both long sides and the north end. A carved stone soffit edge where F1 dives under the slab.
- [ ] **Gangway:** from the south rim to the disc:
  - a bronze bridge 2.4 m wide, with a deck of dark marble, a glass parapet with a bronze cap and fine bronze stanchions
  - double gate leaves of bronze-framed glass at the rim
  - Leaves slide open (0.6 s ease) exactly when `disc.gateOpen('top')`, closed otherwise.
- [ ] **Dome underside (seen from below):** carved coffered ribs radiating from the oculus edge across the dome surface between y −1.5 and −6. Also a moulded stone ring at the oculus soffit. Carved stone.
- [ ] **Merge:** curb, rails and posts are merged per material. Balusters are 1 instanced call. Gates are a separate small mesh.
- [ ] **Shots:** `oculus`, `oculusdown`, `balcony`, `concourse`, plus a new preset `rim` (eye level at the balustrade, looking across the oculus toward the gates). Acceptance:
  - From the balcony the oculus reads as a deliberate Beaux-Arts insertion: an elegant bronze ring with light rising.
  - From the rim the void is legible through the balustrade.
  - No seams or z-fighting.
  - Hall calls ≤ baseline + 5.
- [ ] Commit.

### Task P2-3: The void — eras, light rings, landings, Threshold

**Files:** create `src/world/metro/void.ts`; modify `greybox.ts` (remove the lathe walls, rings, landing boxes and threshold slab), `src/world/metro.ts`.

- [ ] **Stone band (y −1.5 → −10):** rusticated ashlar coursing on the drum wall: blocks 1.2 × 0.6 m, chamfered V-joints in geometry, every 4th course a projecting band. Eight shallow pilaster ribs rise to the dome; a moulded string course sits at −10.
- [ ] **Strata band (−10 → −22):** raw rock that reads as sedimentary layers. The wall geometry is displaced radially by layered noise: horizontal strata 0.3–1.2 m thick, slight overhangs, uneven layer edges. Use the strata material. It is lit only by rings and env, so it is darker and more mysterious. This is the "deep time" moment.
- [ ] **Polished band (−22 → −30):** honed limestone panels on a precise 1.5 × 3.0 m joint grid with 12 mm shadow gaps. A continuous 0.6 m backlit onyx ring band at −24, and the first stainless details.
- [ ] **Light rings:** recessed linear light channels every 2.5 m in depth, following the wall: a thin emissive strip inside a stainless channel. In the stone band they are warm 3000 K, in strata neutral, in polished cool 4000 K. Seen while riding, they pass like a metronome.
- [ ] **Landings L1 and L2:** slender bridges with steel structure:
  - Top: terrazzo with a brass nosing.
  - Underside: smooth soffit with a **warm cove light** strip along both long edges (spec §4 deck-edge cove light).
  - Sides: glass balustrades with stainless caps.
  - Connections: they meet the drum wall in a recessed bearing pocket.
- [ ] **Threshold (−30):** the annular deck and the bridge across the hole:
  - Top: terrazzo.
  - Inner edge (the sky hole rim): a polished stainless lip 0.3 m deep, with a warm cove light under the deck edge so the rim glows against the sky seen from below.
  - Balustrades: glass on all void-side edges.
- [ ] **Merge:** everything is merged per material. Void group calls ≤ 14 with the escalators.
- [ ] **Shots:** `void`, `threshold`, `oculusdown`, `skyhole`, plus a new preset `strata` (on F2 mid-flight looking across the void at the strata band). Acceptance:
  - Three distinct eras read clearly from the rim and while riding.
  - The rock looks geological, not like noise soup.
  - The rings feel precise and premium.
  - The cove light makes each landing float.
- [ ] Commit.

### Task P2-4: Real escalators (all 22 units)

**Files:** create `src/world/metro/escalators.ts` (visuals; logic stays in `src/metro/escalators.ts`); modify `greybox.ts` (remove flight slabs for F1–F6), `src/world/metro.ts`.

- [ ] **Per unit:**
  - a stainless-clad truss of real depth (1.1 m)
  - glass balustrades 0.9 m with a black rubber handrail on a stainless profile
  - a thin warm emissive skirt line at step level along both sides (functional lighting, not neon)
  - landing plates with combplates (champagne aluminium, grooved)
  - a newel end where the handrail loops
  - 2 flat steps at each end, plus the transition into the incline.
- [ ] **Steps:** one `InstancedMesh` for every visible step of every unit (stainless tread with grooves, yellow-free; a dark riser), animated in the vertex shader:
  - each instance carries `aUnit` and `aIndex`
  - a uniform array `uOffset[22]` (metres travelled, wrapped by the step pitch) comes from the runtime: `offset += speed(id) * dt`, in the travel direction (`sign`)
  - the shader places each step along the unit's path (flat → curve → incline → curve → flat), so steps flow, flatten at the ends and never pop
  - The array must survive hidden-zone frames.
- [ ] F5/F6 visuals use the same system and are added to the deep group (separate instanced mesh, so deep-only units are not drawn from the hall).
- [ ] **Merge:** truss, glass and rails are merged per material per group.
- [ ] **Shots:** a new preset `escalator` (standing on F2 looking down the flight), plus `oculusdown`, `void`, `crossing`, `deep`. Also a short check that steps visibly move (two shots 0.5 s apart differ only in step phase). Acceptance: they read as top-tier real escalators, and step motion is smooth.
- [ ] Commit.

### Task P2-5: The Sinking Floor, the speed gates, lift heads

**Files:** create `src/world/metro/disc.ts`, `src/world/metro/gates.ts`; modify `greybox.ts`, `src/world/metro.ts`, `src/metro/runtime.ts` (the disc mesh sync moves into a real-time hook), `src/obstacles.ts` + `src/metro/navData.ts` (gate cabinets as level-scoped obstacles at −30; lanes stay open).

- [ ] **Disc:**
  - Top: the hall marble with an inlaid medallion echoing the kiosk floor medallion (brass ring, dark marble star).
  - Rim: a slim brass handrail on 8 fine stanchions with 1 opening facing the gangway.
  - Underside: a polished bronze shallow bowl with a ring of warm downlight (emissive).
  - No cables.
  - The mesh y = `disc.y` every displayed frame, in real time, independent of `?timescale` (call it from the same place as `updateMetroRuntime`).
- [ ] **Crossing-floor well gate (−70):** the same gate leaves as the hall gangway (Phase 3 finishes the floor around it). Open iff `disc.gateOpen('bottom')`.
- [ ] **Speed gates at the Threshold:**
  - Location: on the Threshold bridge along x = ±8.1, z [79.8, 83.8], 3 lanes per side (lane width 0.9 m).
  - Cabinets: slim champagne-aluminium bodies 1.0 m tall with a glass top.
  - Panels: ultra-clear glass panels 1.6 m tall that slide apart (0.35 s) when the player is within 2.2 m of a lane, then close behind.
  - Indicator: a white light line on each cabinet top brightens as you approach.
  - Collision: cabinets are obstacles (circles at level −30). Lanes always pass.
- [ ] **Lift tube heads:** the glass tubes' machinery heads above the Threshold (at y −30 → −24) as precise stainless/glass lanterns showing the sheave. Phase 3 builds the cabins.
- [ ] **Shots:** `threshold`, `oculus`, plus new presets `gates` metro variant `speedgates` and `disc` (standing on the disc at the top). Acceptance:
  - The gates feel like the station knows you.
  - The disc reads as a piece of the hall floor detaching.
- [ ] Commit.

### Task P2-6: Void environment, descent look, Phase 2 gate

**Files:** modify `src/lighting/looks.ts` (void capture), `src/layoutMetro.ts` (`VOID_LOOK` capture point), `scripts/metro-route-test.mjs` (gate run).

- [ ] **Void environment:** a second capture in `DepthLook.captureDeep` (rename to `captureMetro`) from (0, −15, 74) with the surface state, so void materials reflect the void (rings, stone) rather than the hall. Assign it to `metro.userData.voidMaterials`. It costs one 256² cube once at boot.
- [ ] **Look curve:** tune the descent so that:
  - Golden fog thins through the stone band.
  - The strata band is the darkest moment.
  - The polished band brightens.
  - The cavern blows out white-blue through the hole.
  - Tune `DEEP_LOOK` / zones only via layout values. Document the before/after values.
- [ ] **Gate:**
  - Re-run `node scripts/metro-route-test.mjs` (PASS, max frame ≤ 50 ms).
  - Run `npm run metro-test && npm run nav-test`.
  - Run the perf shots `balcony concourse oculus oculusdown void threshold escalator` at q=auto, with hall calls ≤ baseline + 5 and void calls ≤ 14 for the void group.
  - Update `docs/TASKS.md`.
- [ ] Commit.
