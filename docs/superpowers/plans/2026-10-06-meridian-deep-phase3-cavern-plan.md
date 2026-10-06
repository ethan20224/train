# Meridian Deep — Phase 3: The Cavern (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Replace the deep greybox with the finished Crossing. That covers:
- Monolith shell under the buried sky
- the floating Meridian bridge
- the Crossing floor with its glass panel
- the Halcyon deep hall
- six tunnel portals
- the water wall and onyx wall
- working capsule lifts and funicular
- the sensing halo

The result must be the "I never imagined a station like this" moment.

**Spec:** `docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md` (§2.4–2.6, §3, §4, §5.1–5.6). **Master plan Global Constraints apply verbatim.** Phase 2 materials kit: `src/world/metro/materials.ts`.

## Global constraints (Phase 3)
- **Deep zone budget:** ≤ 220 draw calls and ≤ 2.0 M visible triangles at the worst deep view (`crossing`, `skyhole`, `glassup`), with trains absent (Phase 4 budgets trains separately: ≤ 40 calls for 4 trains).
- **Lights:** ≤ 2 new real lights, created at boot, never toggled. Everything else is emissive, environment or sky.
- **Deep materials** are separate instances from void materials. They receive the deep sun. They are registered in `metro.userData.deepMaterials` for the deep cube capture.
- **Static geometry** is merged per material per zone. Repeated parts (PSD leaves, hangers, cable nodes, joint inserts) are instanced.
- **Shell rule:** no blank planes. Every large surface gets a joint grid, shadow gaps, a light slot or an edge treatment (spec §4).
- **Navigation:** every new walkable edge is a hard boundary in `src/metro/navData.ts`. Movers use the Phase 1 mover and connector model. `metro-test`, `nav-test` and `metro-route-test` stay green and are extended.
- **Screenshots:** every task ends with real-GPU screenshots reviewed by the director.

## Review focus
1. The sky must read as infinite daylight from every deep viewpoint. Seams at the sky edges, the hole rim and slots break the illusion.
2. The eclipse shadow and the deep-sun shadows of the bridge and hangers must land on the Crossing floor convincingly. That means a texel density check of the shared shadow map at the cavern fit.
3. Glass floor: you must be able to see down to Halcyon and up to the sky. Check transparency sorting with the PSD glass and the lift tubes.
4. Lifts and funicular: doors must never open onto an empty shaft. Riders must be carried smoothly. The empty twin cabin must run on its own.
5. The deep look must not regress the airlock: no frame over 50 ms on the disc ride.

---

### Task P3-1: Monolith shell and base floor
**Files:** create `src/world/metro/shell.ts`; trim `greybox.ts`; `src/world/metro.ts`.

- [ ] **Walls:** cross-plan walls from the trench floor up to the sky, in honed limestone.
  - Panels: 3.0 × 1.5 m on a running grid aligned to the cavern axes, with 12 mm shadow gaps. Build them in geometry as inset grooves, merged.
  - Base: a 0.3 m recessed shadow plinth at floor level.
  - Top: where the walls meet the sky, a 0.4 m light-gap reveal. A thin emissive cool strip makes the sky "float" off the walls.
  - Light slots: vertical slots 0.12 m wide every 12 m on the long walls, emissive at 4000 K.
- [ ] **Re-entrant corners of the cross:** precise chamfered stone arrises.
- [ ] **East end wall:** a placeholder for the onyx wall (P3-7). **West:** a placeholder for black granite behind the water wall (P3-7).
- [ ] **North end wall:** Meridian portal frames come in P3-6. Leave openings.
- [ ] **Base floor field (non-walkable, seen from the bridge):** dark terrazzo with brass division strips on a 3 m grid.
- [ ] **Shots:** `crossing`, `meridian`, `skyhole`, `waterwall`, `funicular`. Acceptance:
  - Monumental, calm, precise.
  - It reads as hewn from one material.
  - No blank planes.
  - The deep sun draws crisp shadows on the panels.
- [ ] Commit.

### Task P3-2: The buried sky
**Files:** create `src/world/metro/sky.ts`; trim `greybox.ts`; `src/layoutMetro.ts` (sky look constants).

- [ ] **Sky shader:** a "window to infinity" (CoeLux-like).
  - Model: view-direction based, so the sky has depth and parallax at infinity.
  - Colour: deep noon zenith blue → pale horizon at grazing angles.
  - Haze: a very subtle high-altitude haze gradient.
  - Sun: a sharp HDR sun disc and aureole that are visible only when looking toward `DEEP_SUN.direction`, which matches the real light.
  - Banding: dithered.
  - Scale: values in linear HDR so the exposure blend works.
- [ ] **Edges:** the sky panel meets the walls in the P3-1 light gap. The sky hole rim and slots get a thin polished stainless lip, and the sky never shows a hard cut.
- [ ] **Casters:** the hole caster stays, plus casters for the lift slots and the funicular slot, so the slots also cast sun shadows.
- [ ] **Shadow-fit check:** measure shadow texel size on the Crossing floor at the deep fit. If it's coarser than about 4 cm, improve the deep fit using only the near-floor box, still without reallocating the map. Document the numbers.
- [ ] **Shots:** `skyhole`, `crossing`, `glassup`, plus a new preset `sun` (looking toward the sun from the floor). Acceptance:
  - Indistinguishable from looking at a real sky through a ceiling.
  - The eclipse lies on the floor as a soft-edged ellipse.
- [ ] Commit.

### Task P3-3: The floating Meridian bridge
**Files:** create `src/world/metro/meridian.ts`; navData updates if needed; trim `greybox.ts`.

- [ ] **Structure:** a white-painted steel box-girder bridge carrying two track beds and the island. The girders are 1.2 m deep with chamfered edges and a precise bolt-plate rhythm every 6 m.
- [ ] **Hangers:** pairs every 9 m rising to the sky (hairline stainless rods 30 mm), with cast stainless nodes at the deck. Instanced. The bridge appears to hang from the sky.
- [ ] **Island deck:**
  - Surface: terrazzo with ink-blue (Meridian) inlay lines along the PSD line.
  - Edges: warm cove light under the deck edges.
  - Disc well: a glass balustrade with a stainless cap.
  - F5 opening: a balustrade.
  - F4 landing: a combplate zone.
- [ ] **Platform screen doors, full height 2.6 m:**
  - Frame: ultra-clear glass bays in a champagne-aluminium frame.
  - Doors: door pairs at the train door offsets for a 4-car train stopped at the platform centre. That's 3 per side per car; derive the offsets from `METRO_TRAIN` and add them to layoutMetro.
  - Transom: a hairline dot-matrix display (canvas texture; text "MERIDIAN LINE · NORTHBOUND" etc.).
  - Leaves: instanced; animation hooks for Phase 4 (`setDoors(side, open01)`).
- [ ] **Track beds:** slab track with rails and fastenings (instanced). No ballast; this is a modern metro.
- [ ] **Shots:** `meridian`, `crossing`, `skyhole`, `mapwall`. Acceptance: the bridge floats, the hangers read as impossible-light engineering, and the PSDs read as top-tier.
- [ ] Commit.

### Task P3-4: The Crossing floor, Vesper tracks, glass panel
**Files:** create `src/world/metro/crossing.ts`; navData edits (well gate, F6 opening balustrade, lift tube collars, funicular station keep-outs); trim `greybox.ts`.

- [ ] **Floor:** dark polished terrazzo (P2 material).
  - Brass division strips on a 1.5 m grid.
  - Line-colour inlays: jade along both Vesper PSD lines, ink blue leading to the F5 foot, oxblood leading to F6 and the glass panel.
- [ ] **Vesper PSDs:** full-height doors along both track edges, the same system as P3-3 (jade accents). Hooks for Phase 4.
- [ ] **Vesper track trenches:** slab track, rails, and a dark trench lining with a thin cool light line at its edge.
- [ ] **Disc well:** a glass balustrade, the gate leaves from P2-5 built at floor level, and a stainless rim.
- [ ] **Glass panel** (x −30..−10, z 65..83):
  - Construction: structural laminated glass on a fine stainless grid, with a subtle frit at panel edges.
  - Reads: walkable and safe, yet you can see clearly down to Halcyon and up through it from below.
  - Rendering: handle sorting with an explicit `renderOrder`.
  - Collars: stainless collars where the lift tubes pass through.
- [ ] **Seating:** freestanding monolith benches (honed stone blocks with a cantilevered seat and a hidden light underneath), instanced, in a few clear groups. Each is an obstacle circle at level −70.
- [ ] **Shots:** `crossing`, `glassfloor`, `waterwall`, `funicular`, plus a new preset `floor` (centre of the floor facing the map wall). Acceptance: luxurious, legible wayfinding by colour, and the glass is a wow moment.
- [ ] Commit.

### Task P3-5: Halcyon deep hall
**Files:** create `src/world/metro/halcyon.ts`; navData if needed; trim `greybox.ts`.

- [ ] **Diagonal hall:** honed limestone walls with horizontal light slots. The ceiling is the underside of the Crossing floor: a smooth soffit with coffers, except under the glass panel, where it is open so daylight falls on the platform. Floor: terrazzo with oxblood inlays.
- [ ] **Island platform:** PSDs on both edges (oxblood accents), lift landings at the two tubes, and the F6 foot.
- [ ] **Tracks:** slab track on both sides.
- [ ] **Shots:** `deep`, `glassup`, `glassfloor`. Acceptance: an intimate, more mysterious hall, with daylight falling through the glass onto a platform 82 m underground.
- [ ] Commit.

### Task P3-6: Tunnel portals (6)
**Files:** create `src/world/metro/portals.ts`; layoutMetro portal data (positions, size 5.0 × 5.5 m).

- [ ] **Six portals:** Meridian north and south (on the bridge ends, through the nave end walls), Vesper west (through the water wall) and east (through the onyx wall), and the two Halcyon ends.
- [ ] **Frame and tunnel:** each portal is a precise stainless reveal with a deep shadow gap. The tunnel interior recedes 300 m into darkness: a curved lining with ring segments every 6 m.
- [ ] **Light-wave hook:** each ring segment's emissive intensity is driven by a per-portal uniform array `uWave[segments]` (Phase 4 sets it from train ETA; Phase 3 sets a slow idle shimmer at 2 %).
- [ ] **Cost:** the tunnel is cheap (a merged lining plus one instanced ring mesh per line).
- [ ] **Shots:** `meridian` (looking north into the portal), `waterwall`, `deep`, plus a new preset `portal`.
- [ ] Commit.

### Task P3-7: Water wall and onyx wall
**Files:** create `src/world/metro/waterWall.ts`, `src/world/metro/onyxWall.ts`; audio hooks come later (Phase 5).

- [ ] **Water wall** (x −60, z 54..94, y −70..−34):
  - A thin sheet of water sliding down black polished granite.
  - Shader: a flowing normal map scrolling downward with gravity acceleration, vertical streaks, Fresnel reflection of the deep environment, slight thickness variation and a bright specular glint line where the water breaks over the top lip.
  - At the foot: a narrow stainless trough with a subtle splash band.
  - Around the Vesper portals the sheet parts cleanly (geometry cut plus edge rivulets).
  - Silent visually: no particles needed.
- [ ] **Onyx wall** (east end): backlit white onyx slabs 1.5 × 3 m, book-matched (mirrored veining across joints), with a warm glow and a stainless frame. The Vesper east portal pierces it with a deep reveal.
- [ ] **Shots:** `waterwall`, `funicular`, `crossing`, plus a new preset `onyx`.
- [ ] Commit.

### Task P3-8: Capsule lifts and funicular (working movers)
**Files:** create `src/metro/lifts.ts`, `src/metro/funicular.ts` (pure logic + nav regions, tests in `scripts/metro-runtime-test.ts`), `src/world/metro/liftsView.ts`, `src/world/metro/funicularView.ts`; extend `src/metro/runtime.ts`, `src/core/interaction.ts` (lift buttons with E), `src/core/presets.ts`.

- [ ] **Lifts — logic:**
  - Two independent cabins, one in each tube at (−17, 74) and (−17, 80). Stops: −30, −70, −82.
  - Doors face the open floor side at each stop. Connector regions are open only when docked with doors open.
  - Motion: cabin floor circle r = cabinR − C with `carry`, the trapezoid profile from the disc, max 2.5 m/s.
  - Calls: E on a call button outside, at each stop, calls the cabin. E on one of 3 floor buttons inside picks the destination.
  - Twin: the cabin you are not in makes a "ghost run" every 40–70 s, but only when unoccupied and the player is more than 6 m from its doors at its current stop.
  - Tests: no door ever opens onto a moving shaft; the rider is carried; ghost runs never start with the player inside.
- [ ] **Lifts — view:**
  - Cabins: glass cylinders, a champagne floor ring and ceiling ring with a downlight.
  - Gauge: an analog brass depth needle on the inner panel, reading 0 to −82 m.
  - Doors: curved sliding glass doors.
  - Machinery: the sheave turns in the tube head.
- [ ] **Funicular — logic:**
  - A cabin floor rect moving along the 45° track from (18, −30) to (58, −70), with the floor kept level (the cabin body is stepped).
  - Stations at both ends with connectors.
  - Cycle: approach → cabin comes. Occupied 2 s with doors closed → departs. The disarm-after-arrival rule is the same as the disc's.
  - Tests mirror the disc tests.
- [ ] **Funicular — view:** a glass cabin with a champagne frame, rail and rack under it, top station on the Threshold (glass canopy) and bottom station at the floor's east end.
- [ ] **Interaction:** new `Target` kinds `liftCall` and `liftFloor`. The prompt reads "E — Call lift" / "E — Halcyon −82 m" etc. Surface targets stay surface-only.
- [ ] **Shots:** `funicular`, plus new presets `lift` (inside a cabin looking out across the cavern) and `twin` (the empty cabin passing). Extend `metro-route-test.mjs`: ride the lift −70 → −82, take the funicular up to −30.
- [ ] Commit.

### Task P3-9: Sensing halo, deep environment, Phase 3 gate
**Files:** `src/world/metro/materials.ts` (halo shader term), `src/lighting/looks.ts`, presets, `docs/TASKS.md`.

- [ ] **Sensing halo:** an `onBeforeCompile` term on deep floor and wall materials that gently brightens the emissive/albedo response within ~4 m of the player (uniform `uPlayer`). It is subtle, like the building noticing you. No real light.
- [ ] **Deep environment:** recapture after the finished geometry exists (boot-time, as before). Check mirror-like surfaces (stainless, glass, PSDs) against the cavern.
- [ ] **Gate:**
  - `npm run metro-test && npm run nav-test`
  - `node scripts/metro-route-test.mjs` (extended), PASS, max frame ≤ 50 ms
  - perf shots of all deep presets at q=auto: deep ≤ 220 calls / ≤ 2.0 M tris
  - hall presets unchanged versus the Phase 2 numbers
  - update `docs/TASKS.md`
- [ ] Commit.
