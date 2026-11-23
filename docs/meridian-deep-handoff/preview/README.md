# Meridian Deep — Build Previews (Phases 3–5)

Updated after each completed task so you can browse every new screenshot in one place.

## P3-8b — Inclined Glass Funicular (`p3-8b/`)

Working inclined glass funicular connecting the east Threshold (`−30 m`) top station alcove to the Crossing floor (`−70 m`) east station along a 50.7° brushed-stainless rack rail (Ruling 37):
- **Cabin & chassis (`funicularView.ts`, 4 calls total in `metroVoid` — both-zone env swap):** level 4.0 × 2.4 m champagne-framed glass box with panoramic skylight & warm recessed ceiling halo, dark graphite deck, bi-parting doors on both `±z` long sides (strictly closed while moving), riding on a triangulated brushed-stainless wedge bogie chassis.
- **Rack rail, stations & safety (`funicular.ts`, `funicularView.ts` — 3 deep calls):** brushed-stainless architectural monorail spine + toothed steel rack split cleanly at the sky plane (`y = −32`), enclosed luminous sky-slot light-well hood, top station glass canopy & east Threshold portal (approved Threshold deck untouched), bottom pit (`−76 m`) with hydraulic buffers, under-incline `1.1 m` glass guard protecting `< 2.3 m` headroom (`x ≥ 50.2`), and full-height champagne-framed sliding station gates strictly inside the continuous Crossing east balustrade.

- **Funicular (re-framed hero preset — level glass cabin on triangulated wedge chassis gliding down out of the sky slot toward the camera)** — ![funicular](p3-8b/funicular.jpg)
- **Skyhole (enclosed luminous funicular sky slot alongside the circular eclipse & floating Meridian bridge)** — ![skyhole](p3-8b/skyhole.jpg)
- **Onyx (brushed-stainless monorail spine, under-incline glass guard & bottom station in front of the backlit white onyx wall)** — ![onyx](p3-8b/onyx.jpg)
- **Crossing (full transept with twin ringed glass lifts & inclined funicular monorail spine)** — ![crossing](p3-8b/crossing.jpg)
- **Threshold (approved deck & speed gates unchanged; stainless funicular portal visible on east wall)** — ![threshold](p3-8b/threshold.jpg)

## P3-8a — Twin Glass Capsule Lifts (`p3-8a/`)

Two independent working glass capsule lifts connecting Threshold (`−30 m`), Crossing (`−70 m`), and Halcyon (`−82 m`) both up and down:
- **Cabins (`liftsView.ts`, 6 instanced calls in `metroVoid`, both-zone env swap across the `−16` airlock):** champagne anodised floor/ceiling rings and mullions, brushed-stainless under-bowl and anchored handrail, warm 3200 K ceiling downlight halo + floor micro-cove, bi-parting curved glass doors that rotate smoothly to align with each level's landing, and a backlit **white onyx analog depth gauge (`0 → −82 m`)** with brushed-stainless needle and 3 tactile backlit floor buttons (`−30`, `−70`, `−82`).
- **Tubes & machinery (`liftsView.ts` + `gates.ts`):** ultra-clear deep glass shafts ringed every 3 m in brushed stainless down through the laminated glass floor onto the Halcyon aprons, curved sliding landing doors at all 3 levels, call-button beacons, cut Threshold deck openings with machined stainless sleeves, and rotating sheaves inside the machinery lanterns.
- **Ghost runs & controls (`lifts.ts` + `interaction.ts`):** `E` call buttons outside closed doors and `E` floor buttons inside; seeded deterministic ghost runs every 40–70 s on the unoccupied twin weighted 2:1 toward the player's level.

- **Lift (new preset — inside descending capsule: white onyx depth gauge at `−39.5 m`, backlit buttons, sky hole, Meridian bridge & onyx wall)** — ![lift](p3-8a/lift.jpg)
- **Twin (new preset — empty twin capsule gliding past with warm ceiling halo in its ringed glass tube)** — ![twin](p3-8a/twin.jpg)
- **Lifts (Threshold machinery lanterns with spinning sheaves, docked south capsule, doorway & call buttons)** — ![lifts](p3-8a/lifts.jpg)
- **Crossing (twin ringed glass lift tubes rising out of the fritted glass floor into the buried blue sky)** — ![crossing](p3-8a/crossing.jpg)
- **Glass floor (ringed glass shafts descending straight onto the Halcyon island landing aprons)** — ![glassfloor](p3-8a/glassfloor.jpg)
- **Deep (looking up from Halcyon through the skylight at both shafts & the hovering Crossing capsule)** — ![deep](p3-8a/deep.jpg)

## P3-7 — Living Water Wall & Backlit Book-Matched Onyx Wall (`p3-7/`)

Opposite 40 m × 36+ m feature walls anchoring the transept in 5 draw calls total:
- **West (`waterWall.ts`, 3 calls):** gravity-accelerating laminar water sheet gliding down polished black granite with quintic-smooth animated reflections of the sky, Meridian coves & east onyx wall, top stainless weir lip glint, peaked stainless diverter canopies parting the sheet cleanly around both Vesper west portals with silver edge rivulets, and a calm brushed-stainless catch trough.
- **East (`onyxWall.ts`, 2 calls):** 27 × 13 backlit alabaster-white onyx slabs (`1.48 × 2.96 m`) book-matched symmetrically across slim brushed-stainless mullions, descending into the lit 2 m open floor reveal and pierced cleanly by both Vesper east portals.

- **Water wall (t = 3.0 s — calm liquid curtain reflecting sky, bridge coves & onyx wall)** — ![waterwall](p3-7/waterwall.jpg)
- **Water wall (t = 3.5 s — 0.5 s later confirming living gravity-accelerated motion)** — ![waterwall-t1](p3-7/waterwall-t1.jpg)
- **Onyx wall (new preset — backlit book-matched alabaster white onyx in stainless grid)** — ![onyx](p3-7/onyx.jpg)
- **Crossing (warm backlit onyx anchoring the east end beneath the floating bridge)** — ![crossing](p3-7/crossing.jpg)
- **Floor (living mirror water wall anchoring the west end)** — ![floor](p3-7/floor.jpg)

## P3-6 — Twelve Tunnel Bores & Darkened Horseshoe Tunnels (`p3-6/`)

All twelve single-track bores (Meridian north/south, Vesper west/east, Halcyon SW/NE) in 4 draw calls: precision 0.30 m brushed-stainless reveals with 30 mm shadow gaps, 341.5 m (`TIMING.spawnClearance + METRO_TRAIN.length + 10`) horseshoe dark charcoal linings distance-darkened in shader (no fog washout, black end caps), modern slab tracks extending cleanly into the bores, and 684 instanced 6 m arch light-rib fixtures driven by one HalfFloat `DataTexture` (2 % idle shimmer now; arrival waves & departure wakes in Phase 4).

- **Portal (new hero preset — Meridian north arrival bore, slab rails & recessed arch ribs into darkness)** — ![portal](p3-6/portal.jpg)
- **Water wall (Vesper west bores piercing polished black granite with crisp stainless reveals)** — ![waterwall](p3-6/waterwall.jpg)
- **Meridian (north portal pair aligned behind the disc well)** — ![meridian](p3-6/meridian.jpg)
- **Deep (Halcyon NE portal pair terminating the diagonal hall)** — ![deep](p3-6/deep.jpg)

## P3-5 — Halcyon Deep Hall & Daylight Shaft (`p3-5/`)

Enclosed 110 m × 20 m diagonal hall 82 m underground: stack-bond honed limestone walls with two continuous horizontal 4000 K cool light slots (2.4 m & 6.0 m), 3 × 3 m axis-aligned coffered pale ceiling at −73.5 m, rectangular limestone light well rising to the glass floor with two lit diagonal corner light shelves, lined honed-limestone F6 escalator cutting piercing the NW wall (≥ 2.5 m headroom + stainless frame), dark terrazzo island with flush oxblood satin enamel inlays, centre-facing stainless lift landing aprons, Halcyon PSDs (with clean low-headroom step-down under F6), and modern slab tracks — all in 10 draw calls.

- **Deep (82 m underground: daylight shaft through glass floor, coffered ceiling, oxblood PSDs & F6)** — ![deep](p3-5/deep.jpg)
- **Glass-floor look-up (looking 50 m up through T-grid, lift collars, floating bridge & buried sun)** — ![glassup](p3-5/glassup.jpg)
- **Glass floor look-down (lit corner light shelves, sunlit terrazzo island, lift landings & slab tracks)** — ![glassfloor](p3-5/glassfloor.jpg)
- **Crossing (looking across the walkable glass floor into the finished Halcyon hall below)** — ![crossing](p3-5/crossing.jpg)

## P3-4 — Crossing Floor, Vesper Tracks, Glass Panel & 2035 Well Gate (`p3-4/`)

116 m × 20 m dark terrazzo Crossing floor with flush 1.5 m brushed-stainless division grid (zero brass in cavern) and flush satin enamel wayfinding inlays (jade along Vesper PSDs, ink-blue from F5, oxblood to F6 & glass panel), full-height Vesper screen doors + fixed end screens, dark Vesper rail trenches with modern slab track and cool edge lights, walkable laminated structural glass floor on a 1.5 m stainless T-grid with 0.10 m ceramic frit borders & lift-tube collars, cantilevered honed-limestone monolith benches with warm 3200 K under-lights, 2035 Monolith circular glass balustrade well ring with curved sliding glass leaves (zero bronze/brass), and bottom newel/combplate height fix across F1–F6.

- **Floor (new preset — benches, well gate, inlays, Vesper PSDs & floating bridge overhead)** — ![floor](p3-4/floor.jpg)
- **Well gate (2035 curved sliding glass ring replacing 1910 bronze gate + flush F5 combplates)** — ![wellgate](p3-4/wellgate.jpg)
- **Glass floor (laminated structural panes, 0.10 m ceramic frit borders, stainless T-grid, view to Halcyon)** — ![glassfloor](p3-4/glassfloor.jpg)
- **Crossing (full transept, glass panel, oxblood/jade inlays, floating Meridian bridge)** — ![crossing](p3-4/crossing.jpg)
- **Meridian (cleaned up — F4 bottom newels/combplates flush, phantom F5 piers removed)** — ![meridian](p3-4/meridian.jpg)
- **Funicular view (bridge coves + hangers + sky)** — ![funicular](p3-4/funicular.jpg)
- **Water wall bay (Vesper west bores + black granite backing)** — ![waterwall](p3-4/waterwall.jpg)

## P3-3 — Floating Meridian Bridge, Platform Screen Doors & Slab Track (`p3-3/`)

Chamfered white-steel box-girder bridge spanning the 108 m nave with 50 mm wall expansion gaps, warm 3200 K soffit coves along both outer edges, 6 m fascia splices & underside ribs, 22 hairline stainless tension hangers anchored flush into the buried sky, dark polished terrazzo island with flush ink-blue satin enamel inlays, ultra-clear 1.1 m glass balustrades, reusable champagne-framed full-height screen doors (`psd.ts`, white dot-matrix transoms + non-emissive line bar), and modern concrete slab tracks (`track.ts`).

- **Crossing (bridge floating on hangers + warm 3200 K edge coves)** — ![crossing](p3-3/crossing.jpg)
- **Skyhole (underside cove ribbons + disc-well collar + sky rosettes)** — ![skyhole](p3-3/skyhole.jpg)
- **Meridian (terrazzo deck, ink-blue inlay, champagne PSDs, F4 landing)** — ![meridian](p3-3/meridian.jpg)
- **Skyride (descending F4 onto the bridge, slab tracks entering twin bores)** — ![skyride](p3-3/skyride.jpg)
- **Mapwall (under F4 looking south down the platform)** — ![mapwall](p3-3/mapwall.jpg)

## P3-2 — The Buried Sky (`p3-2/`)

CoeLux-style "window to infinity" noon sky 32 m underground, razor-crisp SSE solar disc + tight aureole, polished stainless slot collars around lift tubes and funicular, sealed eclipse aperture lip, eclipse + slot shadow casters (`3.08 × 3.07 cm/texel` cross-prism shadow fit), and new/re-framed `sun`, `skyride`, and `skyhole` presets.

- **Sun (buried noon sky & solar disc)** — ![sun](p3-2/sun.jpg)
- **Skyhole (re-framed eclipse unobstructed above bridge)** — ![skyhole](p3-2/skyhole.jpg)
- **Skyride (descending F4 out of the sky hole)** — ![skyride](p3-2/skyride.jpg)
- **Glass-floor look-up (sun & sky from 82 m deep)** — ![glassup](p3-2/glassup.jpg)
- **Crossing (deep noon blue overhead)** — ![crossing](p3-2/crossing.jpg)
- **Funicular view (chamfer corners sealed flush)** — ![funicular](p3-2/funicular.jpg)
- **Meridian (eclipse shadow on bridge + composed north end wall)** — ![meridian](p3-2/meridian.jpg)

## P3-1 — Monolith Cavern Shell & Base Floor (`p3-1/`)

Honed pale limestone panels on a 3.0 m × 1.525 m stack-bond grid, chamfered re-entrant corners, glowing 12 m vertical light slots, floating sky reveal, west polished black granite wall, and dark terrazzo base floor with flush brushed-stainless 3 m strips.

- **Crossing** — ![crossing](p3-1/crossing.jpg)
- **Meridian** — ![meridian](p3-1/meridian.jpg)
- **Water Wall (black granite base + Vesper bores)** — ![waterwall](p3-1/waterwall.jpg)
- **Funicular view (chamfered corners + light slots)** — ![funicular](p3-1/funicular.jpg)
- **Map Wall recess + Meridian south bores** — ![mapwall](p3-1/mapwall.jpg)
- **Deep (Halcyon view up)** — ![deep](p3-1/deep.jpg)
- **Skyhole (pre-reframe)** — ![skyhole](p3-1/skyhole.jpg)

## P3-0 — DepthLook Verification & Hall Reference (`p3-0/`)

- **Balcony (hall unchanged)** — ![balcony](p3-0/balcony.jpg)
- **Concourse** — ![concourse](p3-0/concourse.jpg)
- **Oculus** — ![oculus](p3-0/oculus.jpg)
- **Sinking Floor disc** — ![disc](p3-0/disc.jpg)
- **Void strata** — ![strata](p3-0/strata.jpg)
- **Crossing (pre-shell baseline after deep env fix)** — ![crossing](p3-0/crossing.jpg)
