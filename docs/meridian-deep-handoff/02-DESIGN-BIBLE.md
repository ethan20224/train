# 02 — Design Bible: the taste you must build to

This document is the director's eye. Read it with the `refs/` images open. When you judge your own work, judge it against this, not against "does it look OK".

---

## 1. The idea, and the feeling it must produce

**Upstairs is 1910:** warm cream stone, honey marble, bronze and brass, an eternal golden hour, a clock frozen at 6:47, everything still. **Downstairs is 2035:** pale stone, white onyx, glass and steel, white light, an eternal noon, everything quietly moving. Going down is travelling forward a century.

The core concept is **The Crossing + The Buried Sky**:
- Three metro lines cross at three depths and three angles in one open cavern, all visible at once (real stations hide interchanges in separate boxes).
- Above them is an artificial noon sky with a real, shadow-casting sun, 32 m underground (like a CoeLux skylight: real technology, not fantasy).

**The feeling you are building, in order:**
1. *Curiosity.* From the balcony, cold white light rises out of the hall floor beyond the clock.
2. *Vertigo.* At the oculus rail you look down a bell-shaped void with escalators crisscrossing it and a disc of blue-white light far below.
3. *Time travel.* Riding down, the walls turn from carved 1910 stone to raw geological rock to polished 2035 limestone. Light rings tick past like a metronome, and the hall's warm echo fades to a hush.
4. *The wow.* The last escalator carries you **down through the sky**: you emerge under a noon-blue ceiling with a sharp white sun 32 m below the hall, then descend toward a floor 70 m down.
5. *Awe and calm.* The Crossing is monumental, precise, silent and empty:
   - A train glides across a floating bridge 24 m above you.
   - Another line runs below your feet, seen through glass.
   - A water wall slides silently down black granite.
   - The building notices you (lights warm where you walk, gates part before you reach them), and nobody else is there. That is the uncanny part.

If a view does not produce its feeling, it is not done, however correct the geometry.

## 2. The director's taste rules (learned from every review)

These were written from real rejections. Each has an image in `refs/`.

1. **Light does the drama; materials stay restrained.** A pale wall raked by the deep sun with crisp shadows beats any decoration. The palette is quiet so light can be loud.
2. **Thin and precise reads expensive; chunky reads cheap.** Gate piers as wide dark blocks, speed gates as cream "wardrobes" and white boxy escalator newels were all rejected (`bad-05`, `bad-07`). Real luxury is slender: 0.18 m blades, 30 mm rods, 10 mm glass, 12 mm shadow gaps.
3. **Every glow is a fixture.** Emissive only where a real light source would be: a recessed slot, a cove under a deck edge, a strip in a channel, a ring, a display, a lit interior, a vehicle's head and tail lights. **Never** a glowing outline or band as decoration.
   - The jade glowing band along the train was rejected as neon (`bad-03`).
   - The thin white light line around the train's glass nose in `good-06` is allowed: it is the train's headlight signature (a real fixture).
   - The green stripe in `good-06` is **non-emissive** satin enamel. If it reads as glowing under the final deep lighting, lower its value and saturation until it reads as paint.
4. **Metal must read as metal in the environment it lives in.** Judge champagne, stainless and bronze against the env map of their zone (void vs cavern). If it reads painted, plastic, woody or brown, fix the *material response* (metalness, roughness, env), not the colour (`residual-06`).
5. **Two vocabularies, never side by side.** Beaux-Arts above and in the void's stone band; Monolith & Machine below. They only meet *in sequence* during the descent. A bronze Beaux-Arts gate in the 2035 cavern is wrong (`bad-09`).
6. **Fine grain beats coarse.** Textures at true scale, low contrast. Terrazzo with big high-contrast chips read as confetti and was rejected; the fine dark version was approved (`bad-01` vs `good-07`).
7. **Glass is see-through first, reflective second.** A train front that reads as an opaque mirror (`bad-02`) or a cut-away box (`bad-04`) is wrong. A curved dark-tinted panel you look *into* the lit saloon through is right (`good-06`).
8. **No blank planes, and no greebles either.** Detail comes from architectural logic: joints, shadow gaps, reveals, light slots, chamfers, edge profiles. Never random surface clutter or "tech" panels.
9. **Compose the view.** Every camera preset is a composition with a focal point and a reason. Every signature moment needs a preset that shows it at its best (§6). A preset that shows the underside of a slab is a failed preset (`now-02`).
10. **Emptiness is a feature.** Few, deliberate objects. Don't fill the cavern with props. The scale and the silence are the luxury.
11. **Real proportions, human scale.** Handrails 1.0 m, balustrades 1.1 m, steps 1.0 m wide, screen doors 2.6 m, trains 2.9 × 4.0 m. Anything at the wrong scale breaks the spell.
12. **Colour is rationed.** The only saturated colours are the three line accents and the sky. Everything else is neutral. Warmth comes from 3200 K coves and 3500 K interiors; coolness from 4000 K+ light and the sky.

## 3. Monolith & Machine (the cavern's architecture)

Three layers, each with one job, plus light through all three:

| Layer | What | Treatment |
|---|---|---|
| **Shell** | Cavern walls, floors | Calm and monumental. Vast honed pale limestone planes on a deliberate grid, razor shadow gaps, chamfered corners, flush light slots, backlit white onyx feature wall, black polished granite behind the water wall. Floors in dark polished terrazzo with flush **brushed-stainless** division strips and line-colour inlays. |
| **Structure** | The floating Meridian bridge, deck edges, hangers | Slender, legible engineering. White-painted steel box girders with chamfered edges, hairline stainless hangers rising to the sky, precise cast nodes. |
| **Machine** | Escalators, lifts, funicular, gates, screen doors, trains | Precision objects like a Swiss watch or Apple glass. Brushed stainless, champagne anodised aluminium, ultra-clear glass, visible mechanism (sheaves turning, guide rails), flush joints. |
| **Light** | Sky, onyx, slots, rings, coves, halo | Neutral 4000 K architecture. The sky is the only "daylight". Warm 3200 K cove light under every deck edge so stacked levels glow against the sky. |

**Benchmarks for the feel** (search them if unsure):
- Elizabeth line, Tottenham Court Road: calm precision.
- Tadao Ando: light on pale planes.
- Apple Fifth Avenue: glass and stone restraint.
- Westminster station (Jubilee line): stacked void, but here luxurious.
- Changi "Kinetic Rain": the droplets.
- CoeLux skylights: the artificial sky.

## 4. Palette and material values (current kit; keep or tune only in look-dev)

All in `src/world/metro/materials.ts`. Use `kit.deep.*` in the cavern (receives the deep sun) and `kit.*` in the void (sun-masked).

| Material | Value now | Must read as |
|---|---|---|
| honedLimestone | `0xfdfaf3`, roughness 0.55, wallStone maps | Pale, almost white, matte, mineral. Never plastic or plaster. |
| terrazzo | procedural, near-black with fine graphite chips, sparse white, very sparse brass; roughness 0.18 | Dark, polished, fine speckle, reflecting the sky and lights (`good-07`) |
| onyx | `0xf2ece0`, emissive vein map ×1.2, roughness 0.22 | Backlit translucent stone with book-matched veining, warm glow |
| stainless | `0xcdd2d5`, metalness 1, brushed roughness map | Brushed steel, not grey paint. If the brushed map reads as wood grain on big faces, use a plain satin variant there. |
| champagne | `0xcdbb98`, metalness 1, roughness 0.3 | Anodised aluminium with a warm metallic sheen, never cream paint |
| glass | `0xe4f2ee`, opacity 0.1, roughness 0.03, faint green edge | Ultra-clear, visible only by its edges and reflections |
| bronze / brass | `0x4d3722` / library brass | **Hall side and void stone band only.** Never as strips, trim, hardware or fittings in the cavern. The tiny brass chips inside the terrazzo aggregate are allowed: they read as warm speckle, not as brass. |
| strata | Poly Haven `dark_rock_02`, albedo lifted ×5.6 | Geological sedimentary rock (void only) |
| warm strip | 3500 K, HDR 3.0 | Skirt / interior light. **Coves use 3200 K** (`VOID_DETAIL.lightK.cove`), not this strip colour |
| cool ring | 4000 K, HDR 3.2 | Wall slots, rings, reveals |

**Line accents** (linear RGB, `LINE_COLORS` in `src/metro/trainModel.ts`): Meridian ink blue `[0.012, 0.075, 0.62]`, Vesper jade `[0.0, 0.62, 0.27]`, Halcyon oxblood `[0.42, 0.006, 0.02]`. Use them only on:
- wayfinding inlays in the floor
- the train enamel stripe
- screen-door transom accents
- the last segments of each portal's light-wave
- the map wall

**Deep sun:** elevation 70°, from the south-south-east, colour `(1.0, 0.97, 0.92)`, intensity 7.0 (`DEEP_SUN`). Shadows fall north-north-west across the floor and must be crisp.

## 5. Light design for the cavern (what goes where)

| Source | Where | Character |
|---|---|---|
| Artificial sky | Ceiling plane y −32 over the whole cross | Deep noon zenith blue, paler toward grazing angles, infinite depth, sharp HDR sun disc visible only toward `DEEP_SUN.direction` |
| Deep sun | The single DirectionalLight, deep mode | Crisp shadows of the bridge, hangers, droplets' cables and the sky-hole "eclipse" on the floor |
| Sky reveal | 0.4 m recessed band between wall tops and the sky | Cool strip so the sky appears to float off the walls |
| Wall slots | Vertical 0.12 m slots on the long walls, every 12 m | Cool 4000 K, flush |
| Cove light | Under every deck edge (Threshold, Meridian bridge, landings) | Warm **3200 K** (the same as the void's coves, `VOID_DETAIL.lightK.cove`). Levels read as glowing layers against the sky. |
| Onyx wall | East end wall | Warm-white backlit glow, book-matched veins |
| Screen-door transoms | Above every platform edge | Hairline white dot-matrix, line-colour accent |
| Train interiors | Saloons | Warm 3500 K, seen through glass |
| Portal light-wave | Ring segments inside each tunnel mouth | Neutral white wave running toward the mouth ahead of a train, line colour on the last 3 segments |
| Sensing halo | Floors and walls within ~4 m of the player | Barely perceptible warming. The building noticing you. |

## 6. Signature moments and how each must read (every one needs a preset)

| Moment | Must read as | Preset |
|---|---|---|
| Oculus (done) | A deliberate Beaux-Arts bronze ring in the 1910 hall, light rising, void legible through the balusters | `oculus`, `rim` |
| Descent through three eras (done) | Carved stone, then geological strata, then polished limestone and onyx, with rings ticking down | `strata`, `void` |
| Escalators crisscrossing (done) | Premium glass-and-steel escalators through a Piranesi void | `escalator`, `strata` |
| Sinking Floor (done) | A piece of the hall floor detaching | `disc` |
| Through the sky | Riding down out of a dark round "eclipse" into noon blue | `threshold` (looking down), **new** `skyride` |
| The buried sky | Indistinguishable from looking at real sky through a ceiling | **new** `sun`, `skyhole` (re-framed) |
| The Crossing | Monumental, calm, three lines visible, bridge floating 24 m up | `crossing`, **new** `floor` |
| Floating Meridian bridge | Hung from the sky on hairline rods, cove-lit edges | `meridian`, `crossing` |
| Glass floor look-up | Standing over Halcyon: look down at trains, look up through bridge, droplets, sky | `glassfloor`, `glassup` |
| Water wall | A silent sheet of water down black granite, parting cleanly around the two Vesper bores | `waterwall` |
| Onyx wall | Book-matched glowing stone, the two Vesper bores piercing it | **new** `onyx` |
| Capsule lifts | Glass cylinders descending out of the sky; the empty twin passing | `lifts`, **new** `lift`, `twin` |
| Funicular | Glass cabin sliding out of the sky at 45° | `funicular` |
| Kinetic droplets | ~2,400 champagne droplets moving in slow waves around the sky hole | **new** `droplets` |
| Trains announced by light | A wave of light running down the tunnel toward the mouth, then the mirror train | **new** `portal`, `train` |
| Mirror trains | Polished stainless that reflects the cavern and nearly vanishes, glass nose, lit empty saloon | `train` |
| Live map + running clock | Backlit map with live train dots; the only moving clock (real local time) | `mapwall` |

## 7. Banned list (instant rejection)

- Neon, glowing outlines, LED "tech" bands, holograms, floating UI, scan lines, blue sci-fi glow.
- Spaceship curves, blob architecture, greebles and random panel detail.
- Default grey or white materials; unmotivated pure-white blown planes; black unlit pockets.
- Bronze or brass Beaux-Arts elements in the cavern; Monolith elements in the hall.
- Chunky boxes standing in for slender objects; razor-sharp boxes at architectural scale (always chamfer or reveal).
- Visible tiling patterns, stretched UVs, z-fighting, coplanar flicker, light leaks, floating or interpenetrating geometry.
- People, mannequins, spoken announcements, music, door chimes.
- Any change that makes the hall look different (unless a phase doc asks for it).

## 8. Reference images (`refs/`)

**Approved — this is the bar:**
- `good-01-void-three-eras.jpg`: the eras read unmistakably.
- `good-02-escalator-ride.jpg`, `good-03-crisscross-flights.jpg`: premium escalators.
- `good-04-sinking-floor-medallion.jpg`: hall marble, dark star medallion, fine brass rail.
- `good-05-oculus-beaux-arts-ring.jpg`: how the 1910 vocabulary is done.
- `good-06-train-glass-nose.jpg`: approved train form (the body reads brown only because it still reflects the hall env; it must reflect the cavern once wired).
- `good-07-terrazzo-refined.jpg`: approved floor finish.
- `good-08-hall-upstairs-reference.jpg`: the hall you must never visually change.

**Rejected — never repeat:**
- `bad-01` confetti terrazzo.
- `bad-02` opaque mirror train front.
- `bad-03` neon band.
- `bad-04` cut-away box front.
- `bad-05` wardrobe gates.
- `bad-07` white newel boxes and heavy piers.
- `bad-08` the NaN black block.
- `bad-09` the wrong-era bronze gate in the cavern.

**Accepted with residual (fix in P5-2):** `residual-06` (gates read painted).

**Starting point (what you replace):** `now-01`…`now-04`.
