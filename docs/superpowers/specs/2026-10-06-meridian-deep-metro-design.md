# Meridian Deep — Metro Interchange Beneath the Grand Hall

Date: 2026-10-06 · Status: design approved in conversation (sections 1–4); this written spec awaits user review.
Supersedes nothing. The river-city expansion (`2026-10-06-grand-meridian-river-city-expansion-design.md`) is **shelved** by user decision; nothing here depends on it.

## 1. Vision and approved decisions

An 82 m deep metro interchange under the Grand Hall. Upstairs is 1910: carved stone, honey and gold, eternal 6:47 golden hour, everything frozen. Below is 2035: pale stone, glass, steel, white light, eternal noon, everything quietly moving. The descent is a century of time travel.

Core concept (approved): **The Crossing + The Buried Sky.** One cross-shaped cavern where three lines cross at three depths and three angles, all open to each other, under an artificial noon sky with a real, shadow-casting sun (CoeLux-style skylight: real technology, not sci-fi).

Approved by the user:
- Entrance: an **oculus** in the Grand Hall floor north of the clock kiosk.
- Descent: **crisscross escalators** in a bell-shaped void whose walls pass through three eras (carved Beaux-Arts stone → raw rock strata → polished modern), light rings passing like a metronome.
- Elevators, all four: **Sinking Floor disc** (centrepiece), **twin glass capsule lifts** that descend out of the sky (the twin always empty), **inclined glass funicular**. "Cabins out of the sky" is how the capsule lifts and funicular enter the cavern.
- Signature moments, all: oculus; descent as time travel; glass lifts; kinetic droplet ceiling; trains announced by light; mirror trains; materials (backlit white onyx, dark terrazzo, champagne metal, fluted glass, line-colour inlays); water wall; the clock that runs (real local time; upstairs stays frozen at 6:47).
- Added ideas: **live map wall** (light points track the real trains) and **glass-floor look-up** (stand on glass over the deepest line, look up through the whole stack).
- Rejected: Still Water reflecting pool, pillar of light, living sky (sun shafts/cloud), excavation vitrines, garden, flowing escalator light.
- Shell architecture: **Monolith & Machine** (§4).
- Trains: **watch only**, no boarding. Three lines: **Meridian** (ink blue), **Vesper** (jade), **Halcyon** (oxblood).
- Retained global rules: no people, no music, no announcements; pure Three.js real-time; procedural Web Audio; no new dependencies; ≥ 50 fps on the M2 MacBook Air (8 GB) in normal-window Chrome.
- Feel: hi-tech, futuristic but **not** sci-fi, luxurious, surreal through scale, precision, emptiness and the impossible sky.

### Changes from the conversational section-2 sketch (made so the geometry actually fits)
Pinning real coordinates exposed collisions (escalators crossing tracks, disc vs. flights, lifts unable to reach stops). Every approved feature is kept; positions changed:
1. Cavern plan is a **cross** (nave × transept: literally a cathedral "crossing"), not a rectangle. Removes dead floor.
2. **Meridian runs north–south** on the floating bridge; **Vesper runs east–west** on the Crossing floor and is the line that **bursts through the water wall**.
3. Depths deepened so the cavern out-scales the 54 m hall's drama: Crossing floor **−70** (was −56), Halcyon **−82** (was −68). The bridge is now **24 m above the Crossing floor**, matching the original "train glides across a bridge ~25 m above you".
4. The −40 gallery is replaced by the **Threshold** ring at −30 (just above the sky), where the speed gates stand before the final escalator descends **through the sky**.
5. **Funicular** rides from the Threshold out of the sky down at 45° to the east end of the Crossing floor (not along the east wall to the deep level).
6. **Map wall** sits high on the south wall just under the sky, faced throughout the escalator ride down through the sky; the running clock is its centre.
7. Capsule lifts sit as a twin pair west of the disc; stops −30 / −70 / −82.

## 2. World coordinate contract (metres, +Y up, +Z north, x<0 west)

All values below go into the layout source of truth (`src/layout.ts`, metro section or a dependency-free `src/layoutMetro.ts` re-exported from it). No module hard-codes them. Phase 1 greybox may tune values; any change is made in layout data and reflected here.

### 2.1 Grand Hall changes (floor y = 0)
| Element | Value |
|---|---|
| Oculus centre | (0, 74). Directly under the existing z = 74 chandelier (hub ≈ y 37). |
| Oculus clear opening | radius 9.0 (18 m). South rim z 65, north rim z 83. Kiosk medallion edge z 59.46; gate approach z 88. |
| Curb + balustrade | stone curb r 9.0–9.6, raised 0.15; Beaux-Arts bronze/brass balustrade at r ≈ 9.3, height 1.1 (upstairs vocabulary, not hi-tech). |
| Escalator throats | two openings in the hall floor for flight F1: x ∈ ±[8.4, 12.0], z ∈ [62.5, 69.3] (they stop just short of the oculus curb, which F1 passes beneath); the slot continues through the carved stone dome below the slab to z ≈ 68.5, where F1 is inside the bell. A rider's head clears the slab edge by ≥ 0.5 m. Matching balustrade at hall level. |
| Gangway to disc | x ∈ [−1.2, 1.2], from south rim (z ≈ 65.1) to disc edge (z 70.5); glass-and-brass gate at the rim. |
| Hall runner carpet | north runner currently z ≈ 59.5 → 88 at x = 0: becomes kiosk ring → gangway gate, plus the stub north curb → 88. |
| Hall slab | 1.5 m thick (underside y −1.5). |

### 2.2 The void (descent shaft)
Bell profile about axis (0, ·, 74): radius 9.0 at y −1.5 flaring (carved stone dome underside) to radius 20.0 by y −6; cylinder r 20 to y −30. Era bands on the wall: **carved Beaux-Arts stone** y [−1.5, −10] (rusticated foundation masonry, stone ribs); **raw rock strata** y [−10, −22]; **polished** y [−22, −30] (honed white stone + onyx band, the first Monolith surfaces). Light rings: continuous linear light rings on the void wall every 2.5 m of depth.

### 2.3 Escalator flights
30° incline (rise r → run r/tan30 = 1.732 r). Each flight band is 3.6 m wide and holds two units (one down, one up; 1.0 m step width, 1.0 m handrail height, 0.4 m step depth). Both mirror sides (±x) are built. Flights alternate inner / outer bands so they visibly crisscross in elevation.

| Flight | x band (each side) | Path | y |
|---|---|---|---|
| F1 | ±[8.4, 12.0] | z 62.5 → 79.82 (north) | 0 → −10 |
| L1 landing bridge | across void, walkable |x| ≤ 17 | z [79.8, 83.8] | −10 |
| F2 | ±[4.2, 7.8] | z 79.82 → 62.5 (south) | −10 → −20 |
| L2 landing bridge | across void, walkable |x| ≤ 12.4 | z [58.5, 62.5] | −20 |
| F3 | ±[8.4, 12.0] | z 62.5 → 79.82 | −20 → −30 |
| Threshold (L3) | annular deck r [10, 20] + bridge across the hole z [79.8, 83.8] | — | −30 |
| F4 | ±[4.2, 7.8] | z 79.82 → 52.11, passes through the sky at z ≈ 76.4 | −30 → −46 |
| F5 | ±[4.2, 7.8] | from an opening in the Meridian island deck, z 113.6 → 72.0, hanging beneath the bridge deck | −46 → −70 |
| F6 | one band, z [66.0, 69.6] | along **x**: x −47.0 → −26.2 (east) | −70 → −82 |

F5 clears the Vesper north train roof (−67.1) at z 85.55 by ≥ 3.5 m (escalator y ≈ −62.2 there). All flights clear the disc column (r 3.5) by ≥ 0.7 m.

Behaviour: idle 0.2 m/s; ramp to 0.65 m/s when the player is within 8 m of either end (the building senses you). The conveyor carries the player; walking adds to it.

### 2.4 Elevators
| Mover | Geometry | Stops | Behaviour |
|---|---|---|---|
| **Sinking Floor disc** | radius 3.5, marble top matching the hall floor with an inlaid medallion; slim brass rail on its rim; no cabin, no visible cables | hall 0 ↔ Crossing floor −70, passing through a railed well (r 4.0) in the Meridian island (§2.6); the Crossing-floor well has a glass balustrade and gate like the hall's | Approach either end's gate: if the disc is elsewhere it travels to you. Occupied for 2 s with the gate closed: travels to the other end. Max 3 m/s, accel 0.6 m/s² (≈ 27 s). Gates open only while docked. |
| **Twin capsule lifts** | two glass cylinders, cabin r ≈ 1.2, in glass tubes at (−17, 74) and (−17, 80); tubes pierce the sky in their own slots (glass stalactites) | −30 Threshold, −70 Crossing floor, −82 Halcyon | E on a brass call/floor button (existing interaction key). Doors open only when docked. The cabin you are not in periodically runs by itself, lit and empty, passing yours. Analog brass depth needle inside. |
| **Inclined funicular** | glass cabin on a 45° steel track along z = 74 from (18, −30) to (58, −70); pierces the sky at x ≈ 20 | Threshold east (−30) ↔ Crossing floor east end (−70) | Approach: cabin comes. Occupied 2 s, doors closed: departs. ≈ 57 m of track. |

### 2.5 Cavern (cross plan) and sky
- **Transept (E–W arm):** x [−60, 60], z [54, 94]. **Nave (N–S arm):** x [−20, 20], z [20, 128]. Crossing square x [−20, 20], z [54, 94].
- **Artificial sky** ceiling plane y −32 over the whole cross. **Sky hole** ("eclipse") radius 10 at (0, 74). Lift tube and funicular slots pierce it separately.
- Sky rendering: a view-direction "window to infinity" shader (gradient noon sky with depth, horizon haze at grazing angles) plus a sun disc visible only when looking along the deep-sun direction. It reads as infinitely deep, not as a painted ceiling.
- **Deep sun** direction (toward the sun): elevation 70°, azimuth from the south-south-east. Shadows fall north-north-west across the floor.
- The emitter is the sky plane: geometry above y −32 never casts deep-sun shadows. The hole and slots **cast** sun shadows (an invisible caster disc in the hole), so a dark ellipse of the eclipse lies on the Crossing floor.
- **Crossing floor** (Vesper island): x [−45, 45] platform zone, floor continuing to x ±58; z [64, 84]; y −70. Disc well at (0, 74).
- **Glass floor:** a walkable structural-glass panel in the Crossing floor, x [−30, −10], z [65, 83], directly over the diagonal Halcyon deep hall (which runs beneath it at 45°); the lift tubes pass through it. The deep hall has no ceiling of its own under the panel, so the noon sun reaches the deep platform through the glass.
- **Kinetic droplet ceiling:** ≈ 2,400 polished champagne-metal droplets on hairline cables hanging from the sky, annulus r [12, 38] around the hole, droplet bottoms y [−33, −42]; field excludes the bridge corridor (|x| < 12.5 over the nave), lift tubes and funicular corridor.
- **Water wall:** west end wall of the transept, x −60, z [54, 94], y [−70, −34]; a silent sheet down black granite, parting around both Vesper portals.
- **Live map wall + running clock:** south end wall of the nave, z 20, x [−20, 20], y [−41, −34], just under the sky. Backlit network map of the three lines with dreamlike station names; points of light track the real metro trains. The clock at its centre shows real local time (hairline hands, no numerals).
- **East end wall:** backlit white onyx feature wall behind the funicular station.
- **North end wall:** Meridian portals; Monolith panels with light slots.

### 2.6 Lines (4-car driverless trains: cars 20 m, gaps 0.5 m, ≈ 81.5 m; width 2.9, height 4.0 above rail; platforms 90 m; platform-edge to track centre 1.55; screen-door line 0.35 m inside the edge)
| Line | Accent | Platform | Tracks | Portals |
|---|---|---|---|---|
| **Meridian** (upper) | ink blue | floating island bridge x [−9, 9], z [29, 119], top y −46; hung from the sky on hairline cables; disc well r 4.0 at (0, 74); F4 lands at z ≈ 48–52, F5 departs at z ≈ 113.6 (both ≥ 0.85 m inside the screen-door line) | x ±10.55, rail y −47.1, N–S | north wall z 128, south wall z 20 (below the map wall) |
| **Vesper** (middle) | jade | Crossing floor (island) z [64, 84], y −70 | z 62.45 and 85.55, rail y −71.1, E–W | west through the water wall, east through the onyx wall |
| **Halcyon** (deep) | oxblood | island 10 m wide along the diagonal z = x + 94, centred (−20, 74), 90 m, y −82, in a diagonal deep hall under the floor (≈ 10 m headroom) | ±6.55 perpendicular to the diagonal, rail y −83.1 | ends of the deep hall |

All platform edges carry **full-height** glass platform screen doors (≈ 2.6 m, door pairs matching the car doors: 3 per side per car) with hairline dot-matrix displays in the transom. Track trenches and all edges are hard navigation boundaries.

### 2.7 Speed gates
One bank per side on the Threshold bridge along x = ±8.1 (between the F3 arrival band and the F4 head band), z [79.8, 83.8]. Ultra-clear glass speed gates, three lanes per side, that part as you approach. No ticket needed: the station already knows you.

### 2.8 Depth summary
| y | Level |
|---|---|
| 0 | Grand Hall floor, oculus |
| −10 / −20 | L1 / L2 landing bridges |
| −16 | **airlock switch** (§5) |
| −30 | Threshold: speed gates, lift and funicular tops |
| −32 | artificial sky |
| −46 | Meridian bridge |
| −70 | Crossing floor (Vesper) |
| −82 | Halcyon |

## 3. Experience flow
1. Balcony start: cold white light rises from the floor beyond the clock, under the chandelier.
2. Oculus rail: a bell void, crisscrossing escalators diving under the floor edge, the marble disc, a bright eclipse far below.
3. Descent: on escalators the eras pass, light rings tick by, the hall echo fades. The disc offers the express (≈ 27 s); the walked escalator route takes ≈ 45 s.
4. Threshold: speed gates part. F4 carries you down **through the sky**; the map wall and running clock face you; droplets ring the hole.
5. Meridian bridge, floating 24 m above the Crossing floor; F5 drops from under the bridge to the floor.
6. The Crossing: Vesper trains burst through the water wall; the funicular slides out of the sky; the empty twin lift passes; the eclipse shadow lies on the floor.
7. Glass floor: Halcyon trains below; look up through bridge, crossing trains, droplets, sky.
8. Trains: a wave of light runs along the tunnel toward the portal ahead of each arrival; droplets ripple; screen doors glide open on a lit, empty, warm interior; the train slides off into darkness.

## 4. Architecture: Monolith & Machine

Three layers, each with one job, plus light through all three.

| Layer | What | Treatment |
|---|---|---|
| **Shell** | cavern walls, floors, void polished band | Vast honed pale limestone planes laid on a deliberate joint grid; razor shadow gaps; chamfered arrises; flush light slots cut into walls; backlit white onyx feature walls; black granite behind the water wall. |
| **Structure** | bridge, landings, deck edges, hangers | Slender white-painted steel, hairline stainless tension cables, precision cast nodes; structure is legible and minimal. |
| **Machine** | escalators, lifts, funicular, gates, screen doors, trains | Precision objects: brushed stainless, champagne anodised aluminium, ultra-clear structural glass, visible mechanism (sheaves, guide rails, step chains seen through glass), flush joints. |
| **Light** | sky, onyx, light slots, rings, deck-edge cove light, sensing halo | Neutral 4000 K architectural light; the sky is the only "daylight"; a warm linear cove light tucked under every deck edge (L1, L2, Threshold, Meridian bridge) so the stacked levels read as glowing layers against the sky; colour only from the three line accents and the sky. |

Floors: **dark polished terrazzo** with brass and line-colour inlay wayfinding (a dark glossy floor reflects sky, light and trains; this contrast keeps Monolith from becoming a white box). Walls: pale stone and onyx.

The building senses you: a soft light halo brightens the floor/walls around the player (bounded, emissive/shader-based, not a real light), escalators speed up on approach, gates part, disc and cabins come to you. Nobody else is there.

### Quality bar (in addition to the original spec's anti-slop rules)
- Real proportions: escalators 30°, 1.0 m steps, 0.4 m treads, 1.0 m handrails; real lift door/cabin sizes; full-height screen doors; 4-car trains ≈ 81.5 m.
- **No blank planes.** Every large surface has a joint grid, shadow gaps, edge treatment, or a light slot. Plain is fine; blank is not.
- World-scale UVs, no stretching, no z-fighting, no seams between modules.
- Banned: holograms, neon, floating UI, glowing blue sci-fi panels, spaceship curves, sci-fi greebles.
- Palette restraint: pale limestone, dark terrazzo, white onyx, black granite, brushed stainless, champagne metal, glass; accents ink blue / jade / oxblood only on wayfinding, train stripes and portal light.
- Every visual change is proven by a real-GPU screenshot reviewed by the director.

## 5. Systems architecture

### 5.1 One sun, two jobs
The existing `sun` DirectionalLight (`lighting/lighting.ts`, single static 4096²-texel shadow map, `autoUpdate = false`) serves both worlds. No second shadow-casting light (that would add a shadow lookup to every material and change the light count).
- Surface sun intensity fades to 0 as the camera descends y −4 → −14.
- At the airlock switch (camera crosses y −16, hysteresis ±1 m) the sun is re-aimed to the deep direction/colour, the shadow camera is refitted to the cavern (near plane at the sky plane), and the shadow map is re-rendered once (`needsUpdate`). The reverse on ascent. The map size stays fixed (no reallocation); the texel split may differ by fit.
- Deep sun fades in y −18 → −28.
- God rays and dust are off below the switch (they depend on the surface sun's map/direction).
- **Void materials never receive the directional light** (a contained `onBeforeCompile` mask on those materials); they are lit by their light rings, environment and fill. This prevents unshadowed sun on void walls outside the surface shadow frustum, without enlarging and blurring the surface shadow fit.
- Moving things (trains, disc, cabins, droplets, funicular) never bake into the static map (existing `noShadow` convention).

### 5.2 Looks blended by depth
A **look** = fog colour/density, exposure, bloom threshold/intensity, grade uniforms (split tones, contrast, saturation, lift/gain), hemisphere fill colours/intensity, light-probe SH, bounce-light intensities. Two fixed looks: **surface** (exactly today's values) and **deep** (neutral cool white, crisp, very light haze). A pure blend factor from camera depth (y −4 → −30) interpolates them each frame. One owner module publishes the blended look; postfx, atmosphere and lighting read it (no competing copies).

Reflections: metro materials receive a dedicated **deep environment capture** (cube capture from the Crossing, rendered once in finalize with the sun temporarily in deep state; per-material `envMap`, the lounge's proven pattern). Mirror trains and polished surfaces reflect the cavern, not the hall. A second capture serves the void (polished band and machines). `scene.environment` stays the hall capture.

Real-light budget: the metro adds **at most 2** non-shadowing real lights, created at boot so the light count never changes (no shader recompiles). Everything else is emissive, environment and the sky.

### 5.3 The airlock (visibility)
Three groups: **surface** (all existing modules), **void** (oculus underside, void, flights F1–F4 above the sky, landings, Threshold), **deep** (cavern, lines, trains, F5/F6, everything below the sky).
- Camera above the switch: surface + void visible; deep hidden; a **deep impostor** (bright cool-white eclipse disc filling the sky hole, bloom-blown, as an eye adapted to the dim hall would see the much brighter cavern) is visible.
- Camera below: void + deep visible; surface hidden; a **surface impostor** (warm golden glow filling the oculus from below) is visible.
- Hidden modules keep updating (mainline trains keep running; audio attenuates with depth).
- Risk: from y ≈ −15 looking up, the golden impostor may read as flat. Phase 1 screenshots decide; fallback is lowering the surface-hide point (both worlds drawn across a short band) if the frame budget holds there.

### 5.4 Navigation extensions (`player/navigation.ts`)
Current model: union of axis-aligned rectangles with flat or z-ramp ground, level-aware via feet y, minus circular obstacles. Extensions, all keeping the existing API and tests:
1. **Ramp axis** `'x' | 'z'` (F6 runs along x).
2. **Conveyor** regions: escalator ramps carry a signed velocity along their axis; the controller adds it before resolving (same sub-stepped `resolve`, so no tunnelling).
3. **Movers:** dynamic regions supplied by mover objects with time-varying y (disc, cabins) or x/y (funicular). A player standing in a mover region is carried by the mover's delta each frame. Connector regions between a mover and a level are walkable only while docked (generalising the gate-lane predicate). It is impossible to walk into an empty shaft or off a moving cabin.
4. New levels (−10 … −82) resolve with the existing level tolerance; all void/bridge/glass/platform edges are hard boundaries.

### 5.5 Metro trains (`metro/`, independent of the mainline)
The mainline graph/interlocking is untouched. Each line has two straight tracks (six total) running **through** the station both ways. Per train: spawn in tunnel darkness (≥ 250 m from the portal) → cruise ~20 m/s → jerk-limited stop aligned to the platform doors → screen doors open (after a 1.0 s delay) → dwell 20–30 s → doors close → depart → despawn in darkness. Headway per track 60–150 s; max 4 trains in motion at once; first arrival within ~10 s of reaching the cavern (simulation runs regardless of zone).

A **metro timetable bus** publishes per-train state (`approaching(eta)`, `arrived`, `departing`, position). Portal light-wave, droplet ripples, map-wall points, screen doors, and audio subscribe, so everything stays in sync. Respects `?timescale=`.

Train model: flush glass front (no cab look), mirror-polished stainless body (deep env map) that nearly vanishes into the station, thin line-colour stripe, open gangways, warm-lit empty interior (seats, grab poles, hairline displays), 3 door pairs per side per car.

### 5.6 Signature pieces (cost-shaped)
| Piece | Technique | Budget |
|---|---|---|
| Kinetic droplets | one `InstancedMesh` (≈ 2,400), wave field in the vertex shader (time + up to 4 train-pulse uniforms); cables as one merged line/thin-quad mesh | 2 calls |
| Escalator steps | one `InstancedMesh` for all units; per-instance unit index, per-unit speed uniform array | 1 call |
| Water wall | animated shader sheet (scrolling flow normals, streaks, env reflection), splash line at the foot, cut around portals | ≤ 3 calls |
| Sky | one shader plane + caster disc | 2 calls |
| Portal light-wave | emissive ring segments in each tunnel mouth, intensity driven by train ETA | 1–2 calls |
| Map wall + clock | backlit plane; light points as instanced quads; clock hands driven by `Date` | ≤ 4 calls |
| Sensing halo | shader term on metro floor/wall materials from a player-position uniform | 0 extra |

Static geometry merged per material per zone group, following the existing batching conventions.

### 5.7 Audio (procedural, `audio/`)
The hall reverb crossfades with depth into a tighter, hushed deep room tone. New voices: escalator machinery (speed-linked), lift/funicular motors and door glides, water wall (positional), metro glide/brake/door chime-free whoosh, a soft rush as each portal light-wave rises. Upstairs train voices attenuate with depth. Still no music, no announcements.

### 5.8 Code organisation
- `src/layout.ts` (or `src/layoutMetro.ts` re-exported): every coordinate in §2.
- `src/core/zones.ts`: depth factor, airlock switch, group visibility, impostors.
- `src/lighting/looks.ts`: surface/deep look definitions and blending; sun swap orchestration with `lighting.ts`.
- `src/world/metro/…`: focused files (oculus, void, flights, movers, threshold, cavern shell, sky, bridge, floor/glass, deep hall, platforms + screen doors, portals, water wall, droplets, map wall + clock, funicular).
- `src/metro/…`: timetable bus, scheduler, train model.
- `src/player/navigation.ts`, `src/player/controls.ts`: §5.4.
- Interaction gains a lift-button target (E). Obstacle arrays gain a metro-owned array.
- `src/world/concourse/floor.ts`: oculus hole + throats; `src/world/hotel/layoutData.ts`: runner split; oculus curb/balustrade in the concourse module.
- Camera presets: `oculus`, `oculusdown`, `void`, `threshold`, `skyhole`, `crossing`, `bridge`, `glassfloor`, `glassup`, `mapwall`, `waterwall`, `funicular`, `deep`.
- Debug: `window.__meridian.metro()` (trains, movers, zone, look factor).

## 6. Phases
| # | Phase | Delivers | Gate |
|---|---|---|---|
| 0 | Baseline | build, nav/graph/traffic tests, live walk/train/safety tests, screenshots, fps | recorded; pre-existing failures noted, not fixed opportunistically |
| 1 | Foundations (director builds) | layout data; zones/airlock/impostors; looks; sun swap; void sun mask; nav (x-ramps, conveyors, movers); greybox of the whole metro; presets | walk hall → disc → floor and the escalator route in greybox; look blends; no frame > 50 ms at the swap; nav tests pass |
| 2 | The Descent | oculus (hall), void + era bands + light rings, F1–F4, landings, Threshold + speed gates, disc, lift tubes (void part) | ride all routes both ways; rim / void / threshold / skyhole shots approved |
| 3 | The Cavern | shell, sky + eclipse shadow, Meridian bridge, F5/F6, Crossing floor, glass floor, deep hall, platforms + screen doors, portals, water wall, onyx wall, funicular, lifts (cavern part) | every space shot; no edge can be crossed |
| 4 | The Metro | timetable bus, trains, light-wave, droplets, map wall + clock | full cycles on all six tracks at `?timescale`; map points match trains |
| 5 | Sound, polish, acceptance | zone audio, look-dev, perf pass | full walkthrough, perf targets, zero errors |

Phases 2–4 touch disjoint files after Phase 1 and may run in parallel. Execution: subagent-driven (Sonnet implementers, Opus director). Each task prompt carries exact layout references, the quality bar and the acceptance shots; nothing is accepted without diff and screenshot review.

## 7. Performance targets
- ≥ 50 fps settled in normal-window headed Chrome on the M2 at 1440×900@1 and 1470×956@2, auto quality, in: hall (unchanged), mid-void at the switch, Threshold, Crossing floor with trains moving, glass floor.
- Deep zone ≤ 220 draw calls and ≤ 2.0 M visible triangles; hall view must not regress beyond its baseline +5 calls (oculus).
- No frame > 50 ms during the sun swap / airlock switch.
- Estimated GPU texture memory ≤ 450 MB total (baseline ≈ 208 MB). New PBR textures via the existing Poly Haven fetch script (CC0) where suitable; procedural canvas/shader materials (hotel textures pattern) where not (e.g. onyx, terrazzo inlays).

## 8. Verification
- `npm run build` clean.
- `npm run nav-test` extended: conveyor carry both directions; cannot enter an undocked shaft; ride disc/cabin/funicular and exit at every stop; x-ramp; every bridge/landing/Threshold/glass/platform edge holds; large-step and seeded fuzz on metro levels.
- Live route test: hall → disc → Crossing → F6 → Halcyon → lift → Threshold → escalators up → hall; zero console errors, no NaN.
- Metro cycle test on all six tracks with `?timescale`; screen doors open only for stopped trains; map points within 1 m of train positions.
- Fixed-camera shots for every preset in §5.8, director-reviewed against §4's quality bar.
- Perf test per §7, recorded with hardware/browser/quality details. Results are reported as measured; misses are reported, not waved through.
