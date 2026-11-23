# Cloud Forest pass — plan (2026-11-23)

User review of the Phase 4 build (photos IMG_3814–3821): grand but lifeless, sterile, "bathroom tiles", gates broken,
escalators lousy, water wall bad, mirror trains cheap. User decisions (AskUserQuestion, 2026-11-23):

| Decision | Choice |
|---|---|
| Nature | **Lush cloud forest**: trees rise from the sunken base floor (nave arms under the Meridian bridge, transept strips beyond the Vesper tracks) up around the floating bridge; tree ferns, mossy boulders, ground mist, vines off the bridge edges, birds + drips |
| Walls | **Stone + living walls**: warm honed stone without the tile grid, broken by tall moss/fern living-wall panels and timber slat panels |
| Trains | **Satin brushed aluminium** (no mirror) |
| Water wall | **Natural waterfall** over dark mossy rock ledges, white water, mist at a base pool |

This overrides `02-DESIGN-BIBLE.md` rule 10 ("emptiness is a feature") and the palette rationing where they conflict
(user instruction outranks the package). Everything else still holds: no people, no new real lights, perf floor
≥ 45 fps on the M2 Air, `layoutMetro.ts` owns coordinates, navigation is the truth.

## Diagnosis (verified on real-GPU shots, `shots/review-nov23/before/`)

- **Speed gates**: two 3-lane banks only span the 4 m Threshold bridge while the Threshold annulus is walkable all round
  them → no fare line, you walk around. Glass panels render at wrong angles (panel vertex bookkeeping). Cabinets read as
  cream/orange cardboard. Lifts and funicular bypass any fare line. The ticket hall is an empty black ring.
- **Trains**: body `roughness 0.06, metalness 1` → a mirror of a low-res env cube.
- **Walls**: 3.0 × 1.525 m panels with dark 12 mm gaps (backing shade 0.22) → white tile grid at every distance.
- **Escalators**: steps read as brown wood slats, newels as wood-grain boxes (brushed map on big faces), combplates as
  pallets, truss cladding flat.
- **Water wall**: one flat sheet with a brown smeared normal response.

## Work split (Opus directs + reviews every shot; Sonnet builds bounded pieces)

| Piece | Owner | Files |
|---|---|---|
| Trains satin | Opus | `src/metro/trainModel.ts` |
| Walls: stone + living walls + timber | Opus | `src/world/metro/shell.ts`, `materials.ts`, new `livingWall.ts` |
| Cloud forest (trees, ferns, moss, mist, vines) | Opus | new `src/world/metro/forest*.ts`, `layoutMetro.ts` FOREST section, `metro.ts` |
| Gates + ticket hall | Sonnet G | `gates.ts`, `layoutMetro.ts` SPEED_GATES section, `navData.ts`, `obstacles.ts`, `scripts/nav-metro-test.ts`, presets |
| Escalators | Sonnet E | `escalators.ts` only |
| Waterfall | Sonnet W | `waterWall.ts` (+ its section of `layoutMetro.ts`) |
| Oculus look-up, track/tunnel/funicular polish, perf | Opus | after the above |

## Verification
`npm run build && npm run metro-test && npm run nav-test`, real-GPU shots of every touched preset, perf-presets headed
on the touched presets, route test. Nothing is called done without a shot I looked at.
