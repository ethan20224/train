# Grand Meridian Station Grounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete public station-ground loop, winter garden, railway observation gallery, finished station exterior and river-city setting.

**Architecture:** Pure site/placement data feeds rendering, level-aware navigation, shelter masking and test routes. New world modules reuse existing geometry/material helpers and environment registrations, with spatially chunked static geometry. Execute after Environment E1–E5 so every new surface and room immediately participates in the supported looks.

**Tech Stack:** Existing Three.js/TypeScript, procedural geometry and existing PBR materials; tsx tests and real-GPU Playwright capture. No new dependencies or external asset pipeline.

**Spec:** `docs/superpowers/specs/2026-10-06-grand-meridian-river-city-expansion-design.md`, sections 3–4, 6, 8–9; also read the master and environment plans.

## Global Constraints

- Exact near-site coordinates and connectivity are those in spec section 3; `src/layout.ts` remains the public coordinate contract.
- Public routes require no ticket; they never bypass platform gates or connect to the yard/tracks.
- Pure exploration: furniture/signage are dressing, with no seating/inspection/mystery actions.
- No city streets/vehicles/boats/boarding; background city and hills provide composed views.
- New world geometry ≤60 additional visible calls/650k additional visible triangles; rain/water ≤4 calls combined; settled scene ≤250 calls/2.5M triangles/450 MB and target ≥50 fps.
- Finish visible architecture at close range and verify by real-GPU images; preserve original interior/shop/lounge dimensions and existing work.

## Review Focus

1. Clearance applied to both sides of a shared region edge disconnects a doorway/path (G1/G2).
2. Portal geometry leaves a blind-panel/dado/bench over the opening (G2).
3. River bends or terrain intersect the real railway network or expose rectangular ends in clear weather (G3).
4. Gallery stairs permit a level jump, fall or ground-level entry to the deck (G1/G4).
5. Enclosed conservatory/gallery show rain indoors or incorrect stale local reflections at night (G2/G4/G5).

---

## File ownership and shared interfaces

Create `src/world/grounds.ts` as the module entry, with `grounds/data.ts` (pure placement data), `grounds/surfaces.ts`, `grounds/planting.ts`, `grounds/fixtures.ts`, `grounds/exterior.ts`, and `grounds/city.ts`. Create `src/world/river.ts`, `src/world/winterGarden.ts` with `winterGarden/data.ts` and `winterGarden/build.ts`, and `src/world/observationGallery.ts` with `observationGallery/data.ts` and `observationGallery/build.ts`. Reuse existing `world/concourse/geo.ts` and `world/shed/common.ts` helpers by import; do not move or refactor their unrelated consumers.

Shared contracts:
- `src/layout.ts` exports `STATION_GROUNDS`, `PUBLIC_PORTALS`, `WINTER_GARDEN`, `OBSERVATION_GALLERY`, `RIVER_BANK`, and `TICKET_KIOSKS`. Kiosk placements are data only until K3.
- `grounds/data.ts` exports `publicRegions(): readonly PublicRegion[]`, `groundsObstacles(): readonly PropObstacle[]`, `siteShelters(): readonly Shelter[]`, `PUBLIC_WALK_ROUTE:readonly XYZ[]`, `GALLERY_WALK_ROUTE:readonly XYZ[]`. Export `PublicRegion extends Rect { readonly y:number; readonly ramp?:{readonly zFrom:number;readonly zTo:number;readonly yFrom:number;readonly yTo:number} }`. Its boundaries are already clearance-adjusted; navigation must not inset it a second time.
- `src/layout.ts` exports `PublicPortal { readonly id:string; readonly bounds:Rect; readonly floorY:number; readonly headY:number; readonly side:'west' }`; headY=4.8 and floorY=0 for both west portals. All bounds use existing Rect's xMin/xMax/zMin/zMax names.
- `buildGrounds(ctx)`, `buildRiver(ctx)`, `buildWinterGarden(ctx)`, and `buildObservationGallery(ctx)` each return `Promise<WorldModule>` and add only their own root to the module lifecycle. Shelter arrays exist before scene build, so rainfall never depends on module completion order.
- New practical lights, wet surfaces and local capture materials use E3–E5 registrations. Winter-garden capture ID `winterGarden`, position [-50,2.4,83], size 128; registered after its material creation and before lighting finalize.

### G1: Site contract, public navigation and safety boundaries

**Files:** Modify `src/layout.ts`, `src/obstacles.ts`, `src/player/navigation.ts`, `src/world/props/layout.ts`, `scripts/nav-test.ts`; create `src/world/grounds/data.ts`, `src/world/winterGarden/data.ts`, `src/world/observationGallery/data.ts`, `scripts/site-test.ts`. No visual scaffold is accepted as a completed grounds release.

**Interfaces:** Produce all pure site exports above and `GROUNDS_OBSTACLES`, `WINTER_GARDEN_OBSTACLES`, `GALLERY_OBSTACLES`. Add siteShelters to the E5 array. Preserve existing heightAt/resolve signatures, gate behaviour and obstacle level conventions.

- [ ] Write tests that walk the full no-ticket loop, plaza connector and gallery branch through resolve; test y=0 versus y=9 gallery coordinates, stair monotonicity, protected terrace/river edges, and no entry to yard or tracks. Assert (-29.4,14)→(-44,14) and (-29.4,86)→(-70,83.5) can cross their respective portals. Include each explicit path connector from spec section 3, not just adjacent-room bounding boxes.

```ts
assert.equal(heightAt(-50,350,9),9);
assert.equal(heightAt(-50,350,0),null);
assert.equal(heightAt(-150,94,0),null); // beyond protected river edge
assert.equal(heightAt(-59,311,0),0);
assert.equal(heightAt(-59,331,9),9);
```

- [ ] Run `./node_modules/.bin/tsx scripts/site-test.ts` and `npm run nav-test`; expect new-site cases to fail with current bounds.
- [ ] Add exact spec layout regions and connector extents, using doorway thresholds that overlap the existing concourse by at least 0.1 m. Inset exposed edges by PLAYER.wallClearance; never inset connected seams. Extend current region union without altering original regions. Stair runs z311→331, y0→9, with x clearance inside [-61,-57]; under-stair ground is not walkable. Add appropriate piers/planters/tree bases/benches as level-aware obstacles sourced from the same placed props.
- [ ] Exclude west bay-14 and bay-86 benches in benchPlacements so rendering and obstacle generation agree; keep east counterparts and all unrelated benches. Register the data-only kiosk footprints at the two approved positions but hold their obstacles inactive until K3 adds geometry (no invisible machines).
- [ ] Validate river bank polygons against each actual network path sampled at 1 m arc-length intervals. Reject land/water crossings; make site safety boundaries continuous at promenade ends, stair edges and terrace corners. Add 100k seeded exterior/50k gallery movement fuzz assertions and a large-step attempt through each protected edge.
- [ ] Run pure site tests, full nav test, graph test and build; expect exit 0 and all original 20 nav cases preserved. Commit task paths: `feat: define connected station grounds and navigation`.

### G2: Real entrances, covered court, finished exterior and winter garden

**Files:** Create `src/world/grounds.ts`, `grounds/exterior.ts`, `src/world/winterGarden.ts`, `winterGarden/build.ts`, `src/world/concourse/portals.ts`; modify `world/concourse/shell.ts`, `world/concourse/floor.ts`, `world/hotel/hallDado.ts`, `src/main.ts`, `src/core/presets.ts`; create `scripts/portal-test.mjs`. Modify placement data only where necessary to match visual props.

**Interfaces:** Consume G1 and E3–E5. Produce buildGrounds and buildWinterGarden; early buildGrounds owns vestibule/court/plaza/exterior, extended by G3 surfaces/planting/fixtures. `portals.ts` exposes `portalPath(portal:PublicPortal, mergeBlind:boolean):THREE.Path` for front/back hole construction and `buildPublicPortals(ctx:BuildContext,root:THREE.Group):void` for reveals/automatic leaves. PublicPortal comes from layout; no local duplicate coordinates.

- [ ] Write live tests for both portals: walk through with real keys in both directions, sample door leaf openness, raycast through the open doorway and assert no stone/dado/bench blocks it, check floor continuity and no console errors. Test the conservatory's exterior doorway independently from its hall doorway. Add shelter samples under the entrance canopy and each conservatory roof slope.

```ts
assert.equal(blockingHits.length,0); // raycast against stone/dado/bench meshes
assert.equal(pageErrors.length,0);
assert.equal(rainOccluded(-52,2,14,siteShelters()),true);
assert.equal(rainOccluded(-50,2,83,siteShelters()),true);
```

- [ ] Run `node scripts/portal-test.mjs`; expect current wall/door assertions to fail.
- [ ] Cut portal holes through both front recessed and back solid layers. Merge a lower portal notch with its bay's blind-arch opening rather than placing overlapping shape holes; notch the decorative blind infill above floor level where required. Interrupt plinth, wainscot, brass caps and sill geometry at exactly the portal range. Add complete threshold flooring, masonry reveals, trim, automatic double doors, and entrance lettering. Door leaves ease open within 3 m and close beyond 4 m; navigation uses the fixed doorway corridor and doors must be clear before the player reaches them.
- [ ] Build vestibule and period canopy supports/gutters/glazing; finish the public-facing exterior using original stone/iron/brass vocabulary. Cover the lounge's visible exterior and concourse west/south/east/plaza sightlines with coherent masonry and roofs, without adding enterable rooms. Reuse existing barrel/roof geometry where complete; do not stack a second overlapping skin or obstruct windows.
- [ ] Build the winter garden with its two real doors, masonry planter bases, bevelled iron structure, transparent glazing, patterned paving, close-range authored plant variants and static seating. Connect both doorways with ≥3 m clear paths; derive collision and roof masks from its placement/profile data. Exposed roof is rain-visible, floor remains dry. Register winterGarden capture, materials/practicals and shelter before finalize. Keep geometry in material/spatial buckets with valid bounds.
- [ ] Add forecourt/plaza/wintergarden camera presets using approved footprints. Run portal/site/nav/build checks and capture forecourt, hall-side portals and wintergarden at clear 17:30, rain 12:00 and night 00:00. Inspect inside/outside glazing, roof/structure joins, benches, doorway reveals and original lounge appearance; reject z-fighting and rain leakage.
- [ ] Commit task paths: `feat: open station entrances and build winter garden`.

### G3: Public gardens, promenade, river, composed city and hills

**Files:** Create `grounds/surfaces.ts`, `grounds/planting.ts`, `grounds/fixtures.ts`, `grounds/city.ts`, `src/world/river.ts`, `scripts/river-test.ts`; modify `grounds.ts`, `grounds/data.ts`, `src/layout.ts` (background data exports), `src/main.ts`, `src/core/presets.ts`, `src/audio/environment.ts`; add ground/river cases to `scripts/weather-test.mjs`.

**Interfaces:** Produce `buildRiver(ctx):Promise<WorldModule>`, `buildCity(ctx,root):void`, `addGroundSurfaces(ctx,root):void`, `addGroundPlanting(ctx,root):void`, `addGroundFixtures(ctx,root):void`. Data file exports fixed arrays for plants, buildings, benches/lamps and river bank vertices; these feed obstacles, shelters, renderer and tests. Sound uses `setRiverBounds(bounds:Rect, waterY:number):void` in the existing environment audio helper.

- [ ] Write pure tests for the near bank x=-145/far bank=-255 through z450, western bend points [-650,900]/[-1000,1600], y=-3 water/y=0 embankment, sampled track clearance, and exactly matching promenade/plant obstacle footprints. Pin the straight river section to the public bounds and reject NaN river normals or empty geometry.

```ts
assert.equal(riverMesh.geometry.getAttribute('position').count>0,true);
assert.ok(Array.from(riverMesh.geometry.getAttribute('normal').array).every(Number.isFinite));
assert.equal(heightAt(-139,94,0),0);
assert.equal(heightAt(-146,94,0),null);
```

- [ ] Run `./node_modules/.bin/tsx scripts/river-test.ts`; expect missing geometry/data exports to fail.
- [ ] Build the complete path loop and connectors from G1, with planted beds between them, continuous stone retaining walls, railings, drains, lamp bases and grounds perimeter protection. Create fixed tree/hedge/flower placements, using existing frond texture machinery plus procedural leaf/branch variants; instance repeats but vary authored species, scale and silhouette. Provide the gardens/plaza/promenade surfaces and obstacles together. Retain no extra interaction targets.
- [ ] Build a textured/rippled water shader with Fresnel/sky response, current sun highlights, subtle wave normal variation and rain disturbance. Keep water one draw call and no full city planar reflection. Use wet surface registrations only for exposed paving. Extend land/water beyond public geometry into the camera's distant haze/far plane, with shoreline continuations rather than rectangular endings. Terrain under the railway must sit below existing bed/sleeper geometry and follow bank cutouts.
- [ ] Author fixed city blocks in x[-430,-265], z[-180,340]: 12 distinct masonry building masses of 3–6 storeys, composed as a waterfront rather than a skyline scatter; civic clock tower near [-315,88], height 38 m, and a dome near [-390,250], top 33 m. Surrounding roof details/window grids are batched per spatial cluster. Add fixed tree-covered hill silhouettes beyond the north railway; maintain railway/river clearance and no hidden city navigation. Mark distant scenery noShadow while still receiving environmental fill/fog. At night windows use restrained batched glows, never simulated occupancy.
- [ ] Register river wash and wind exposure without music/voices; add gardens/river presets. Run river/site/weather tests and build. Inspect plaza-to-station scale, close trees/railings, water at grazing angles, skyline at clear noon/golden/night, and far railway/river endpoints. Record new-visible-call/triangle counts and reject cloned box silhouettes or obvious empty world backs before proceeding.
- [ ] Commit task paths: `feat: build river-city gardens and station surroundings`.

### G4: Protected railway observation gallery and terrace

**Files:** Create `src/world/observationGallery.ts`, `observationGallery/build.ts`, `scripts/gallery-test.mjs`; modify its G1 data, `src/main.ts`, `src/core/presets.ts`, `src/lighting/practicals.ts` (registration only) and gallery cases in weather/site tests.

**Interfaces:** Produce `buildObservationGallery(ctx):Promise<WorldModule>`. Consume G1 stair/landing/room/terrace dimensions and existing train network. Gallery material/env response uses the shared hall environment and regional fill; do not add a fourth capture job beyond the spec's three registrations.

- [ ] Write real-control walk tests: grounds approach→apron→all 60 stair risers→landing→enclosed room→terrace and return. Assert y progression 0→9, no step/fall over edges, no ground-to-deck jump, no track access and no ticket requirement. Camera position [−50,10.7,373] looking north must see the real throat; enclosed [−50,10.7,350] looking east must see real platforms/trains over the plinth.

```ts
assert.ok(Math.abs(finalFeet.y-9)<0.01);
assert.equal(heightAt(-50,373,9),9);
assert.equal(heightAt(-50,381,9),null);
assert.equal(rainOccluded(-50,10,350,siteShelters()),true);
assert.equal(rainOccluded(-50,10,373,siteShelters()),false);
```

- [ ] Run `node scripts/gallery-test.mjs`; expect absent module/visual and stair tests to fail.
- [ ] Build masonry piers and supported floor, stair treads/landings and continuous rails, panelled lower walls, broad iron glazing, roof and automatically opening landing door. Add static maps/benches only as dressing. Terrace has 1.3 m guarded edges and no access to the existing staff ramps/signal box; preserve ≥3 m clear circulation. Match all collision obstacles and site roof masks to geometry.
- [ ] Register stair/landing/gallery practical lights and dry interior versus wet terrace surfaces. Rain remains visible beyond windows while enclosed floor stays dry; terrace sound opens toward wind/railway. Add gallery/galleryterrace presets. Confirm no new support overlaps shed x=-32 or signal-box z388 footprints.
- [ ] Run gallery/site/nav/weather/build checks; inspect gallery and terrace under clear/rain/fog/night, including passing articulated trains and north-facing throat views. Reposition decorative planting/signage if it blocks those views; do not move the agreed room/track layout. Commit task paths: `feat: add railway observation gallery and terrace`.

### G5: Full public route, environment integration and world-budget gate

**Files:** Create `scripts/grounds-walk-test.mjs`, `scripts/site-look-test.mjs`; modify `scripts/shot.mjs` and `scripts/perf-test.mjs` to accept environment URL flags, `scripts/lib.mjs` to share flags without changing defaults, and `docs/TASKS.md`. Product edits limited to measured defects in prior grounds tasks.

**Interfaces:** Screenshot/perf scripts accept `--daylight=HH:MM`, `--weather=<mode>`, `--intensity=<number>`; all previous preset/quality/size options stay compatible. Default capture list includes the eight spec viewpoints once ticketkiosk exists; until K3, skip that one explicitly. `site-look-test` emits screenshot paths and measured budgets; manual visual acceptance remains separate from its numerical pass.

- [ ] Write grounds-walk-test using real WASD/look controls through the full loop plus gallery/plaza branches, no ticket. Include night and rain route variants, both public portals, exterior stairs, edge bumps, and return to the original hall. Assert feet remain in valid surfaces, prompts do not invent new actions, and errors array is empty.

```ts
assert.equal(invalidSurfaceSamples.length,0);
assert.equal(pageErrors.length,0);
assert.equal(report.reflections.completedRevision,report.environment.state.version);
assert.ok(report.newGeometry.calls<=60 && report.newGeometry.triangles<=650_000);
assert.ok(report.weatherWaterCalls<=4);
```

- [ ] Run it before route/harness completion; verify that missing preset/route/environment expectations fail meaningfully rather than timing out indefinitely.
- [ ] Implement repeatable capture flags and site-look test for the 4×5 weather/time matrix. Check shader/geometry failures, registered wet/dry surfaces, shadow coverage, complete reflection revision within 3 s, nearest-light cap, scene calls/triangles and estimated memory. Hide no required world elements merely to meet a screenshot budget.
- [ ] Run all subsystem tests, original build/nav/graph/traffic/walk/train/safety/route checks sequentially. Inspect all new presets and thresholds, plus baseline balcony/lounge/shops views. Confirm riverbank/terrain/track terminations under clear visibility; any visible spawning/teleport issue is recorded for K4's traffic visibility gate, not marked visual PASS.
- [ ] Profile auto quality on the demanding new views: clear river, rainy winter garden and rainy gallery terrace. Attribute geometry/rain/reflection costs with the existing debug toggles. Use culling/material batching and particle scaling to meet spec caps; do not lower the pixel-ratio floor or remove detail/protection silently. Update the task ledger with evidence and remaining K4 sustained certification, then commit: `test: verify station grounds and environmental integration`.
