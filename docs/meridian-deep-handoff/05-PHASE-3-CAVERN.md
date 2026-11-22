# 05 — Phase 3: The Cavern (replaces all deep greybox)

**Goal:** the Crossing becomes the "I never imagined a station like this" moment:
- Monolith shell under a buried noon sky
- floating Meridian bridge
- Crossing floor with its glass panel over Halcyon
- Halcyon deep hall
- twelve tunnel bores (two per line end, one per track)
- the water wall and the onyx wall
- working capsule lifts and funicular
- the sensing halo

**Read first:** spec §2.4–2.6, §3, §4, §5; `02-DESIGN-BIBLE.md` (all); `03` §2.4–2.8. Coordinates come from `src/layoutMetro.ts`. The numbers below are copied from it for convenience; if they disagree, the file wins.

**Phase budget (deep zone, worst view `crossing`/`skyhole`/`glassup`, no trains):** ≤ 220 draw calls, ≤ 2.0 M visible triangles, ≥ 50 fps headed at both sizes.

**Order:** P3-0 → P3-1 → P3-2 → P3-3 → P3-4 → P3-5 → P3-6 → P3-7 → P3-8a → P3-8b → P3-9. Tasks touching different files may overlap, but **never two writers on one file** (`layoutMetro.ts`, `greybox.ts`, `metro.ts` and `presets.ts` are shared: serialise edits to them).

**Pattern for every task:** create a focused builder `src/world/metro/<feature>.ts` exporting `build<Feature>(lib, kit, …)` that returns `{ group, deepMaterials?, update? }`, wire it into `src/world/metro.ts` (deep group unless stated), delete the greybox pieces it replaces, add its presets, and register its deep materials.

---

## P3-0 — Verify and finish the WIP commit (`500a0ed`)

- [ ] **`src/lighting/looks.ts`** (hall-shared material filter + two-zone precompile):
  - After boot, check in the console or Playwright that a hall floor mesh (e.g. find a mesh whose material is the library `floorMarble`) has `material.envMap === null`.
  - Confirm no "empty after excluding" warning.
  - The `balcony`/`concourse` shots match `refs/good-08` in tone.
  - `node scripts/metro-route-test.mjs` passes with a whole-route max frame ≤ 50 ms.
- [ ] Get an independent review of the `looks.ts` diff (state restoration in `precompile` and `captureMetro`: zone, sun mode, visibility, lights). Fix any findings.
- [ ] Leave the `SHELL` / `PORTAL` constants for P3-1.
- [ ] Ledger line.

## P3-1 — Monolith shell and base floor

**Files:** new `src/world/metro/shell.ts`; `layoutMetro.ts` (`SHELL`, `PORTAL` already started: update them to the values below); trim `greybox.ts` (cavern wall boxes, base floor slabs); `metro.ts`.

**Build exactly this:**
- **Walls:**
  - **Extent:** around the whole cross outline (`CROSS_OUTLINE`), from the **base floor (y −72.5) everywhere** up to the reveal under the sky.
  - **The shell never descends below −72.5.** The Halcyon deep hall is a separate enclosed volume under the base floor (P3-5); the walls do not wall it off.
  - The Vesper "trenches" are track beds standing on the base floor (rail top −71.1, platform −70), not pits.
- **Panel grid** (stack bond: aligned joints, the calm Ando grid; never running bond):
  - **Datum and courses:**
    - Every wall shares one datum: plinth top at y −72.05 (base floor −72.5 + plinth 0.45). The reveal bottom is at y −32.4.
    - That's 39.65 m, so use **26 courses of 1.525 m** (height ÷ round(height ÷ 1.5)), identical on every wall, so courses align around every corner.
  - **Panels and joints:**
    - Panels 3.0 m wide (`SHELL.panelW`), each proud by 0.05 m, with **12 mm shadow gaps** (`SHELL.gap`) built in geometry.
    - Give the gap faces a darker material or vertex colour, so joints read at a distance without relying on the shadow map (a shadow map can't resolve 12 mm).
  - **Layout:**
    - Lay each wall's vertical joints out **from the wall's centre line**, so both corners get equal partial panels ≥ 1.5 m (adjust the centre to a panel centre or a joint, whichever gives that).
    - Material: `kit.deep.honedLimestone` with world UVs.
- **Openings** (portal bores, the map wall, the funicular station):
  - Panels are cut around them with a 30 mm shadow-gap reveal. Openings don't need to align to the grid; the stainless frame of P3-6 finishes them.
  - **No vertical joint may fall within 0.3 m of an opening edge.** If one would, move that joint to the opening edge.
- **Plinth:** 0.45 m high, recessed 0.3 m (`SHELL.plinthRecess`), same stone, at the base of every wall.
- **Sky reveal:** a 0.4 m open band (`SHELL.reveal`, y −32.4…−32.0) between the wall top and the sky plane, set back 0.3 m (`SHELL.revealSetback`). It holds a continuous cool emissive strip (`kit.deep.emissive.coolRing`) so **the sky floats off the walls**.
- **Light slots:** vertical 0.12 m slots (`SHELL.slotW`), recessed channels with a cool emissive strip, flush, from the plinth top to the reveal.
  - Every wall face **≥ 30 m long** gets them, on every 4th vertical joint counted from that wall's centre line (12 m pitch).
  - Skip any slot that would fall within 1.5 m of an opening, the map-wall zone or a corner.
  - (The 40 m end walls carry the portals, water wall, onyx wall and map wall, so in practice the slots land on the long arm walls.)
- **Re-entrant corners** of the cross: 45° chamfers with 0.6 m legs (`SHELL.chamfer`). Panels return cleanly onto the chamfer.
- **Portal bores** (frames and tunnels come in P3-6): there are **12 single-track bores**, because two tracks 13–23 m apart can't share one mouth. Cut them now, each clear 5.0 × 5.5 m (`PORTAL`), bottom at the track bed (rail − 0.6), centred on its track:
  - Meridian: north end wall z 128 and south end wall z 20, each at x −10.55 and x +10.55, rail −47.1 (4 bores).
  - Vesper: west end wall x −60 and east end wall x +60, each at z 62.45 and z 85.55, rail −71.1 (4 bores).
  - Halcyon: the 4 bores are in the deep hall's own end walls (P3-5/P3-6), not in the shell.
  - Behind each bore, a 4 m dark liner (`SHELL.portalLiner`) until P3-6.
- **West end wall** (water wall zone, x −60, z 54–94, y −70…−34): plain black polished granite here; P3-7 adds the water. **East end wall** (onyx zone): a plain stone placeholder here; P3-7 replaces it.
- **Base floor field** (non-walkable, seen from the bridge; top y −72.5, outside the Crossing floor):
  - `kit.deep.terrazzo` with **flush brushed-stainless** division strips every 3 m (`SHELL.floorGrid`, 0.06 m wide).
  - Rename `SHELL.brassW/brassH` to `stripW/stripH` with `stripH = 0`. Inlay the strips flush: cut them into the slab, or add a polygon offset. Never coplanar z-fighting.
  - **No brass in the cavern** (ruling 9).

**Don't:**
- no running bond
- no random panel sizes
- no decorative reliefs
- no lights other than the slots and the reveal
- don't cover any bore or the map-wall zone (z 20, x ±20, y −41…−34)

**Budget:** ≤ 8 draw calls for the whole shell (merged per material), ≤ 300 k triangles.

**Acceptance:** shots `crossing meridian waterwall funicular deep skyhole` (folder `p3-1`) pass the `04` §4 checklist. Specifically:
- monumental and calm
- the joint grid reads at every distance without shimmer or moiré
- deep-sun shadows from the bridge, hangers and eclipse fall crisply on the walls and floor
- the sky appears to float on the reveal
- no blank plane anywhere

Compare against `now-01` (before) and the Design Bible.

## P3-2 — The buried sky

**Files:** new `src/world/metro/sky.ts`; remove the greybox sky + caster; `layoutMetro.ts` (sky look constants `SKY_LOOK`); presets.

**Build exactly this:**
- **Sky plane:** at y −32 over the whole cross outline, with holes for the sky hole (r 10 at (0, 74)), the two lift tubes (circles r `LIFTS.tubeR + 0.2` at `LIFTS.positions`) and the funicular slot (`FUNICULAR.skySlot`), exactly as `greybox.ts` cuts them today.
  - The Threshold deck (void group) sits **above** the sky plane by design: from below, the sky is the ceiling and the Threshold is hidden behind it. Keep the existing offset (lesson L8); never make them coplanar.
  - `FrontSide`, facing **down** (normal −y), not double-sided. `userData.noShadow`. `fog: false`.
- **Shader: "window to infinity"** (CoeLux-like):
  - **Model:** colour by **view direction** `d = normalize(fragWorld − cameraPosition)`, treated as a direction into an infinite sky dome. Never by UV. That's what gives depth and parallax at infinity.
  - **Zenith** (d.y → 1): deep saturated noon blue, linear about `(0.10, 0.28, 0.85) × 2.4`.
  - **Grazing** (d.y → 0⁺): pale haze about `(0.78, 0.86, 1.0) × 2.8`, blended with `pow(d.y, 0.5)`. A faint luminous band near grazing angles sells atmosphere.
  - **Sun:** toward `DEEP_SUN.direction`.
    - Crisp disc, angular radius about 0.27° (`smoothstep(cos(0.30°), cos(0.25°), dot)`), HDR about 70.
    - Plus an aureole `1.5·pow(s,40) + 0.3·pow(s,8)`.
  - **Dither** ±0.5/255 against banding.
  - **No clouds** (rejected by Ethan).
  - Put all the numbers in `SKY_LOOK`.
- **Rims:**
  - The sky-hole lip **already exists** (void group, `VOID_DETAIL.rim.lipDepth` 0.3, built in `void.ts`). Don't build a second one. Check from below (`skyhole`) that it closes the edge cleanly against the sky plane: no gap, no coplanar faces. Fix it in `void.ts` if needed.
  - Add new polished stainless lips (0.3 m deep, deep group) only around the two lift-tube holes and the funicular slot.
  - The wall junction is the P3-1 reveal.
- **Shadow casters** (invisible, `colorWrite:false`, `depthWrite:false`, `castShadow`, `noCapture`): the hole disc (exists), plus the two lift slots and the funicular slot. **The eclipse and the slots cast real sun-shadows on the floor.**
- **Shadow quality check:**
  - Compute the deep shadow texel size (shadow camera width ÷ map width).
  - The deep fit in `lighting.ts` `setSunMode('deep')` must cover the cavern **walls as well as the floor**: the cross outline × y −84…−32, seen along `DEEP_SUN`.
  - Target ≤ 6 cm per texel. If it's coarser, first trim the fit to the cavern's real extent (no empty margin). Only then fall back to floor + lower walls (y −84…−50), and record a ruling.
  - **Never reallocate the map.** Record the numbers in the ledger.
  - The map is for the big shapes: the eclipse, the bridge, the hangers, the funicular. Fine relief (12 mm joints) is drawn in geometry and colour (P3-1), never expected from the shadow map.
- **Presets:**
  - new `sun`: from the Crossing floor looking toward the sun, disc in frame.
  - new `skyride`: riding F4 at about y −33, looking forward and down as you emerge through the hole.
  - **re-frame `skyhole`:** from the floor east of the bridge, about (16, −68.3, 70), target (0, −32, 74), so the eclipse with flights descending out of it is the subject; see `now-02` for what's wrong now.

**Acceptance (`p3-2`: `sun skyride skyhole crossing glassup`):**
- indistinguishable from real sky seen through a ceiling
- the eclipse reads as a dark round opening with flights and the disc descending from it
- its shadow lies on the floor as a soft-edged ellipse
- no banding, no seams at the reveal or rims

## P3-3 — The floating Meridian bridge + the platform-screen-door system

**Files:** new `src/world/metro/meridian.ts`; new `src/world/metro/psd.ts` (reused by P3-4 and P3-5); new `src/world/metro/track.ts` (slab track, reused); trim the greybox island and rail deck.

**Build exactly this:**
- **Structure:** a white-painted steel box-girder bridge running the full nave (z 20 → 128) carrying both track beds (x ±10.55, rail −47.1) and the island (x ±9, z 29–119, top −46, deck 1.5 m).
  - Girder edges chamfered 30 mm. A bolt-plate rhythm every 6 m on the fascias (subtle, real).
  - **Ends:** the track beds run straight into the four Meridian bores as the tunnel invert. Everywhere else (between the two bores, and below the bore sills), the girder stops **50 mm short of the end wall**: a clean shadow gap that reads as an expansion joint, with the bearings hidden in it. No visible corbels, brackets or bearing blocks.
  - New deep material `whiteSteel`: `0xf2f1ec`, roughness 0.45, metalness 0. Put it in the kit's deep set.
- **Hangers:** pairs every 9 m along both bridge edges.
  - 30 mm polished stainless rods from cast nodes on the girder edge straight up to the sky plane, ending in 0.25 m polished stainless anchor rosettes flush on the sky.
  - Instanced (rods, nodes, rosettes). **The bridge must look like it hangs from the sky.**
- **Island deck:**
  - Top: `kit.deep.terrazzo` with a 0.08 m ink-blue enamel inlay line 0.5 m inside each screen-door line.
  - **Edges:** warm 3200 K **cove light under both long deck edges** (emissive strip in a soffit channel), so the bridge floats against the floor below.
  - Disc well (r 4.0 at (0, 74)): ultra-clear glass balustrade 1.1 m with a brushed stainless cap.
  - F5 opening (x ±[4.2, 7.8], z 107–113.6): the same balustrade on its open sides, open at the escalator mouth.
  - F4 landing: the escalators already provide combplates; finish the deck around them.
- **Screen doors (`psd.ts`, the reusable system):**
  - Height and structure: full height 2.6 m, ultra-clear glass bays in slim champagne mullions (50 mm).
  - Door pairs: centred on `doorOffsets()` from `src/metro/tracks.ts`, for a train stopped at s = 0 on that track (use the track's origin and direction).
  - Clear opening: ≥ the train's door opening + 0.1 m.
  - **First move the train's door half-width into the layout:** `DOOR_HALF = 0.72` is private in `src/metro/trainModel.ts:27`. Add `METRO_TRAIN.doorHalf: 0.72` to `layoutMetro.ts`, make `trainModel.ts` import it, and use it here. `metro-trainmodel-test` must still pass.
  - Leaves: instanced, sliding.
  - Transom: 0.25 m with a hairline white dot-matrix display (canvas texture, drawn once): line name and direction (e.g. `MERIDIAN LINE · NORTHBOUND`), and the line colour as a fine accent bar.
  - API: `createPsdRow(track, side, opts)` returning `{ group, setOpen(doorIndex, f: number), setAll(f), setDisplay(text) }`. **No allocation per frame.**
  - The fixed bays continue to the platform ends.
- **Track (`track.ts`):** modern slab track:
  - concrete plinths
  - clean steel rails with a polished head strip (not the rusty library rail)
  - instanced fastenings
  - a thin cool light line along the trench edge where a trench exists (P3-4)

**Budget:** bridge + hangers + screen doors + track ≤ 14 calls.

**Acceptance (`p3-3`: `meridian crossing mapwall skyhole`):**
- floats; the hangers read as impossibly light engineering
- the cove light separates the bridge from the floor
- the screen doors read top-tier and aligned
- nothing chunky

## P3-4 — The Crossing floor, Vesper tracks, glass panel, well gate

**Files:** new `src/world/metro/crossing.ts`; `src/world/metro/disc.ts` (well gate re-skin only); `navData.ts` (well-gate posts, bench obstacles, edge screens); trim the greybox floor, trenches and glass.

**Build exactly this:**
- **Floor:** x ±58, z 64–84, top −70.
  - Material: `kit.deep.terrazzo` with flush **brushed-stainless** division strips on a 1.5 m grid (inlaid, never raised or coplanar; same method as the P3-1 base floor).
  - Line-colour enamel inlays (0.08 m):
    - **jade** along both Vesper screen-door lines (0.5 m inside)
    - an **ink-blue** path from the F5 foot
    - an **oxblood** path leading to the F6 opening and the glass panel
- **Vesper screen doors** (`psd.ts`, jade accents) along z 64 and z 84 for the platform zone x ±45. Beyond it, to the end walls, **fixed full-height glass screens** (no doors) on the same line.
- **Trenches:** at z 62.45 and 85.55 (half-width `TRENCH.halfWidth`): `track.ts` slab track, a dark charcoal lining, and a thin cool light line just under the platform edge.
- **Glass panel** (x −30…−10, z 65–83):
  - Construction: laminated structural glass on a stainless T-grid of 1.5 m, with a 0.1 m ceramic frit border on each pane.
  - Rendering: explicit `renderOrder`, `depthWrite:false`. It must look walkable and safe, yet clear enough to see the Halcyon trains and platform 12 m below.
  - Collars: brushed stainless where the lift tubes pass through.
  - **What you see through it:** the light well below the glass (P3-5). Its two corner shelves, where the rectangular panel overhangs the diagonal hall, are designed lit ledges, not leftover rock. Build P3-4 and P3-5 so the view down through every pane is finished.
- **Well-gate re-skin (Monolith):**
  - Replace the bronze Beaux-Arts gate and pilasters at the −70 well (`refs/bad-09`) with an ultra-clear glass balustrade ring (r 4.0, 1.1 m, brushed stainless cap).
  - The gate becomes two curved glass leaves in slim stainless frames, sliding along the ring. Keep the existing logic hook `disc.gateOpen('bottom')` and real-time animation (0.35 s).
  - **No bronze or brass in the cavern.**
- **F6 opening:** glass balustrade on its open sides.
- **East and west floor ends** (x ±58): the 2 m strip between the floor edge and the end wall (x 58…60 and −60…−58) stays open down to the base floor (−72.5).
  - West: the water wall's trough sits in it (P3-7).
  - East: the onyx continues down to −72.5, so the wall seems to stand in a lit reveal.
  - Guard both floor edges with the same glass balustrade (1.1 m, stainless cap), except at the funicular station (P3-8b).
- **Benches:**
  - Form: monolith benches, honed limestone blocks 2.4 × 0.5 × 0.45 m with a cantilevered seat and a hidden warm under-light (emissive strip under the cantilever).
  - Layout: three groups of 2–3, one facing each of the water wall, the onyx wall and the open floor under the bridge. Leave the circulation from the disc, F5, F6, the lifts and the funicular clear.
  - Collision: obstacle circles at level −70 (`src/obstacles.ts`, metro-owned array).
- **Navigation:** update `navData.ts` for the new edges if any change, and extend `nav-metro-test`: the benches block, the well ring blocks except at the open gate, and the edge screens hold.

**Budget:** floor + screen doors + trenches + glass + gate + benches ≤ 18 calls.

**Acceptance (`p3-4`: `crossing glassfloor waterwall funicular wellgate` + new `floor`):**
- luxurious and legible: wayfinding by colour without any signage clutter
- the glass panel is a wow moment
- the well gate belongs to 2035

New preset `floor`: standing near the disc landing looking along the transept with the bridge crossing overhead.

## P3-5 — Halcyon deep hall

**Files:** new `src/world/metro/halcyon.ts`; `layoutMetro.ts` (move `HALCYON_PORTAL_EXTRA` from `src/metro/tracks.ts` into `HALCYON.portalExtra` and make `tracks.ts` read it); trim the greybox island and walls.

**Build exactly this:**
- **Diagonal hall** (centre (−20, 74), axis (√½, √½), hall half-width 10, island half-length 45, half-width 5, top −82, rail −83.1, tracks ±6.55 perpendicular). It is an **enclosed volume below the base floor**. Its ends reach beyond the cavern outline, under solid rock, so nothing of it is visible from the cavern except through the glass panel and the F6 and lift openings.
  - **Hall length:** ±(45 + `HALCYON.portalExtra`) = ±55 m along the axis. The end walls carry the two bores per end (P3-6).
  - Honed limestone walls on the same stack grid, with two continuous horizontal cool light slots at 2.4 m and 6.0 m above the platform.
  - **Ceiling:** one level at **y −73.5** along the whole hall (8.5 m above the platform; 1 m of structure under the base floor at −72.5 and under the Crossing floor slab). Build it as a smooth pale soffit with shallow 3 × 3 m coffers aligned to the hall axis, cut for the F6 opening and the two lift tubes.
  - **Light well:** under the glass panel (the `GLASS_FLOOR` rectangle), the ceiling opens into a rectangular well rising from −73.5 to the glass underside, lined in honed limestone on the stack grid. Daylight falls through it onto the platform.
  - **Corner shelves:** the panel rectangle overhangs the 20 m-wide diagonal hall at two corners. There the well's floor forms two **light shelves** at −73.5: honed limestone, each with a concealed cool linear light along its edge that grazes down the hall wall below. Looking down through the glass, they read as deliberate lit ledges.
  - Floor: terrazzo with oxblood inlays.
  - Island: screen doors (`psd.ts`, oxblood accents) on both edges.
  - Tracks: `track.ts`.
  - Fittings: lift landings at the two tubes, and the F6 foot.
    - The tubes stand on the island at ±2.1 m from its centre line, on opposite sides. Their doors face the island centre line.
  - Ends: two bores per end wall, one per track (frames in P3-6).
- **Mood:** more intimate and mysterious than the Crossing. **The daylight shaft through the glass onto the platform is the image.**

**Budget:** ≤ 10 calls.

**Acceptance (`p3-5`: `deep glassup glassfloor`):** daylight falling through the glass onto a platform 82 m underground reads instantly. Coffers and slots are precise. The doors are aligned.

## P3-6 — Tunnel bores (twelve) and tunnels

**Files:** new `src/world/metro/portals.ts`; `layoutMetro.ts` (`PORTALS` data: **12 entries, one per bore**: centre, facing, line, track index, and whether it is that track's `portalIn` end (arrivals) or `portalOut` end (departures) per `src/metro/tracks.ts`).

**Build exactly this:**
- **Twelve single-track bores, in pairs:**
  - Meridian: north (z 128) and south (z 20) end walls, at the bridge ends.
  - Vesper: west (through the water wall) and east (through the onyx wall).
  - Halcyon: both deep-hall end walls.
  - Each pair reads as one composed portal: two identical bores, aligned, with the wall between them untouched.
- **Frame:** a precise brushed stainless reveal 0.3 m deep around the 5.0 × 5.5 m opening, with a 30 mm shadow gap to the wall.
- **Tunnel:**
  - **Lining:** a horseshoe-section dark charcoal lining, darkening with distance in the shader (deep fog is too light to hide it), ending in a black cap. **No visible end, ever.**
    - **Length:** longer than the farthest point any train occupies inside the tunnel, plus 10 m: `portalIn + spawnClearance + METRO_TRAIN.length + 10`. Compute it from the constants (today that is about 342 m). Never use a literal 300 m: trains spawn about 250 m in and extend to about 331 m.
  - **Ring segments:** every 6 m along the lining, one instanced emissive mesh for all 12 bores. Each instance carries (bore index, segment index) as an instance attribute.
    - Intensities live in **one `DataTexture`** (segments × 12 bores, `RedFormat`, `HalfFloatType`, `NearestFilter`). Update its data in place and set `needsUpdate` only when it changed.
    - Phase 4 drives it: arrival waves in each track's `portalIn` bore, departure wakes in its `portalOut` bore.
    - Now: a slow idle shimmer at 2 %.
- **Pay attention to:** the Meridian track beds enter their bores cleanly, and the girder meets the wall with the 50 mm gap (P3-3). The Vesper tracks enter through the water and onyx walls cleanly.

**Budget:** ≤ 6 calls total.

**Acceptance (`p3-6`: `meridian` looking north + new `portal` + `waterwall deep`):** the portals feel deep and precise and lead into darkness. The ring segments read as engineered fixtures, not decoration.

## P3-7 — Water wall and onyx wall

**Files:** new `src/world/metro/waterWall.ts`, `src/world/metro/onyxWall.ts`.

**Water wall** (x −60, z 54–94, y −70…−34):
- **Sheet:** a thin sheet of water sliding down black polished granite. `MeshStandardMaterial` (deep env) with an `onBeforeCompile` animated normal field, in **real time**. Its features:
  - flow accelerating downward
  - vertical streaks
  - slight thickness variation
  - low roughness (0.05)
  - Fresnel-driven reflection of the cavern
- **Top lip:** a bright thin specular glint line where the water breaks over the lip.
- **Foot:** a narrow brushed stainless trough with a subtle animated splash band.
- **Around the two Vesper portals:** the sheet parts cleanly (a geometry cut with thin edge rivulets).
- **Silent and calm.** No particles.

**Onyx wall** (east end, x 60, z 54–94, y −70…−34):
- **Slabs:** backlit white onyx slabs 1.5 × 3.0 m, **book-matched** (veining mirrored across each vertical joint by flipping UVs), using `kit.deep.onyx` with a warm glow.
- **Joints:** a slim brushed stainless frame grid at the joints.
- **Portal:** the Vesper east portal pierces it with a deep stainless reveal.
- **Pay attention to:** the funicular's bottom station sits in front of it (x 52–58).

**Budget:** ≤ 6 calls total.

**Acceptance (`p3-7`: `waterwall crossing funicular` + new `onyx`):** the water reads as water in motion, not a scrolling texture (take two shots 0.5 s apart). The onyx reads as stone lit from behind, with real book-matching.

## P3-8a — Capsule lifts (working movers)

**Files:** new `src/metro/lifts.ts` (pure logic + nav regions; tests in `scripts/metro-runtime-test.ts`), new `src/world/metro/liftsView.ts`, `src/metro/runtime.ts` (update + dynamic regions), `src/core/interaction.ts` (lift targets), presets.

**Logic** (copy the disc pattern in `src/metro/disc.ts`):
- **Cabins:** two independent cabins, one per tube at (−17, 74) and (−17, 80), radius 1.2, stops −30 / −70 / −82, max 2.5 m/s, trapezoid profile.
- **Floor and doors:** cabin floor circle r = 1.2 − C with `carry`. Connectors are open only when docked with doors open.
- **Door direction per stop** (one door per cabin, which rotates to face the right way):
  - −30 Threshold: radially inward, toward the sky-hole centre (0, 74), facing the deck's circulation ring.
  - −70 Crossing: due east (+x), toward the disc well and the F5 foot. Both tubes stand inside the glass panel, so the landing is glass.
  - −82 Halcyon: toward the island centre line (P3-5).
- **Controls:** E on the call button outside a closed door calls the cabin. E on one of 3 floor buttons inside sends it.
- **Ghost runs:**
  - The cabin you're **not** in makes a run every 40–70 s, only when unoccupied and the player is more than 6 m from its doors.
  - Its destination is one of its two other stops, chosen at random but weighted 2:1 toward the stop nearest the player's current level. The twin should pass where it can be seen. The empty twin passing you is a designed moment.
  - Seed the randomness (same seeded RNG pattern as the timetable) so tests are deterministic.
- **Tests:**
  - no door ever opens onto a moving or absent cabin
  - the rider is carried smoothly and arrives
  - a ghost run never starts with the player inside or at the door
  - dt spikes keep the rider aboard
  - a player in a closing doorway is never trapped

**Interaction:**
- Add `Target` kinds `liftCall` and `liftFloor`.
- Prompts, exactly:
  - `E — Call lift`
  - `E — Threshold  −30 m`
  - `E — Crossing  −70 m`
  - `E — Halcyon  −82 m`
- The current floor's button is shown lit and does nothing.
- `findTarget` (`src/core/interaction.ts:43`) returns `null` when the feet are outside about −1…+1.0 m (the hall floor band). Keep that behaviour for surface targets and add metro targets before that early return.

**View** (`liftsView.ts`):
- The **cabins** are both-zone movers (`03` §2.4): `metroVoid`, sun-masked materials, env swapped at the airlock, registered in `bothZoneMaterials`. A cabin parked at −30 is visible from the upper void.
- The **tubes** are split at the Threshold deck: above it they already exist (`gates.ts`, void group); below it they are deep-group static geometry with deep materials.
- **Budget:** both cabins ≤ 6 calls in total, using `InstancedMesh` (2 instances) for the frame, glass, doors, dial and needle.
- **Cabins:** glass cylinders with a champagne floor ring and ceiling ring, a soft warm downlight, and curved sliding glass doors.
- **Depth gauge:** an analog depth gauge on a white onyx dial with a **stainless/champagne needle** (not brass: cavern vocabulary), reading 0 → −82 m.
- **Machinery:** the sheave in the tube head (built in P2-5, `gates.ts`) turns while moving.
- **Tubes** (below the deck): replace the bare greybox cylinders with ultra-clear glass in slim stainless rings every 3 m.
- **Rendering:** all real-time (`onMetroFrame`), no allocations, `noShadow`.

**Acceptance:**
- route-test leg: ride −70 → −82 → −70.
- presets new `lift` (inside a cabin looking out across the cavern while descending) and `twin` (the empty cabin passing).
- The lift descending out of the sky reads magical.

## P3-8b — Inclined funicular (working mover)

**Files:** new `src/metro/funicular.ts` (logic + tests), new `src/world/metro/funicularView.ts`, runtime, presets.

**Logic:**
- **Track and stops:** `FUNICULAR.top`/`bottom` ((18, −30) → (58, −70), z 74) are the **rail ends**.
  - The cabin's level floor is a rect, 2.4 m (z) × the cabin's horizontal footprint (x).
  - It stops so its floor is flush with the landing: on the Threshold deck at the top; at −70 with its east end 0.6 m short of x 58 at the bottom.
  - Add `FUNICULAR.stopInset` (horizontal distance from each rail end to the cabin-floor centre at the stop) to `layoutMetro.ts`, computed so both stops are flush.
  - The cabin body is stepped so its floor stays level along the whole 45° run.
- **Doors:** both long sides (±z) open at each station. Each station has a landing on both sides of the track, with a connector, guarded by fixed glass screens with sliding gates (the screen-door system, `psd.ts`) that open only when the cabin is docked.
- **Bottom station on the Crossing floor** (x about 50–58, around z 74):
  - The rail lands in a 3 m-wide pit in the floor (z 74 ± 1.5) so the cabin floor arrives flush at −70.
  - The pit is a navigation hole, closed by the station screens.
  - Under the inclined track wherever its underside is less than 2.3 m above the floor, add a glass guard plus a navigation obstacle, so nobody walks into the slab. The escalator-foot trap (`03` §2.6) has a cousin here: test it.
  - The floor-edge balustrade at x 58 (P3-4) is open only behind the station.
- **Cycle:** approach → the cabin comes. Occupied 2 s with doors closed → it departs.
- **Arrival:** disarm after arrival like the disc (the rider steps off and on to return).
- **Tests:** mirror the disc tests. Also: the pit and the under-track zone are never walkable, and the gates never open with no cabin docked.

**View:** the cabin is a both-zone mover (`03` §2.4: `metroVoid`, sun-masked, env swapped, ≤ 4 calls). The track is split at the sky plane: the part above −32 goes in the void group, the part below in the deep group.
- **Cabin:** glass with a slim champagne frame and a stepped level floor, on a brushed stainless rail with a rack beneath.
- **Top station:** on the Threshold (y −30), a glass canopy.
- **Bottom station:** at the Crossing floor's east end, in front of the onyx wall.

**Acceptance:**
- route-test leg: −70 → −30 and back.
- preset `funicular` re-framed so the cabin slides out of the sky toward the camera.

## P3-9 — Sensing halo, presets, cleanup, Phase 3 gate

**Sensing halo:**
- Inject into `kit.deep.honedLimestone` and `kit.deep.terrazzo` (deep set only; chain, extend the cache key): a uniform `uPlayer` (feet position), radius about 4 m, smooth falloff.
- It adds a barely perceptible warm emissive lift: about +0.05 of the albedo, warm 3200 K, fading in and out over 0.5 s as you move.
- The building noticing you. **If you can see it at first glance, it is too strong.**

**Presets — final pass:** every signature in `02` §6 has a beautiful preset. Re-frame the weak ones. New since Phase 2:
- `sun`, `skyride`, `floor`, `portal`, `onyx`, `lift`, `twin`
- Phase 4 adds: `train`, `droplets`

**Cleanup:**
- Delete `src/world/metro/greybox.ts`.
- Move the two impostors into `src/world/metro/impostors.ts` (same names, same behaviour).
- Grep for any remaining greybox material or box.

**Deep environment:** confirm `captureMetro` now captures the finished cavern, and that the mirror-like surfaces (stainless, glass, screen doors) reflect the cavern, not the hall.

**Gate** (everything in `04` §7 Phase 3 row):
- `npm run build && npm run metro-test && npm run nav-test && npm run graph-test && npm run traffic-sim`
- `node scripts/metro-route-test.mjs` extended with the lift and funicular legs, no frame over 50 ms on the whole route
- `node scripts/perf-presets.mjs crossing,skyhole,glassup,glassfloor,meridian,waterwall,deep,floor,lift,funicular` at both sizes, all ≥ 50 fps **at a final pixel ratio ≥ 1.0**
- hall presets `balcony,concourse,oculus` within the tolerance of `04` §3 (≤ 3 fps below `01` §5, pixel ratio not lower)
- update `docs/TASKS.md` with the numbers, update `LEDGER.md`, push the branch
- send Ethan a short report with links and screenshots (`04` §8)
