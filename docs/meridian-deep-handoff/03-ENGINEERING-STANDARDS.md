# 03 — Engineering Standards (this codebase + Three.js)

How the station works, the rules every change must follow, the budgets, and the traps that already caught us once. Facts here were checked against the code at handoff. If the code disagrees with this document, read the code, then fix whichever is wrong and note it in a ruling.

---

## 1. Stack and constraints

- Vite 8, TypeScript (strict, `noUncheckedIndexedAccess`), **three 0.186.1**, postprocessing 6.39.5, n8ao 2.0.1. Vanilla Three.js, no React. **No new dependencies.**
- Target: Chrome on an M2 MacBook Air (8 GB, fanless, ANGLE/Metal). **≥ 45 fps everywhere, ≥ 50 in metro views.**
- Procedural Web Audio only (`src/audio/audio.ts`). Poly Haven CC0 textures only, through `scripts/fetch-textures.mjs` and `src/materials/textureManifest.json` (credits are auto-written).

## 2. Architecture contracts you must respect

### 2.1 Coordinates
- `src/layoutMetro.ts` is the single source of truth for metro coordinates and any dimension another module depends on. It is dependency-free (no three.js) so Node tests can import it, and it is re-exported from `src/layout.ts`.
- New dimensions go there as named, commented constants. Micro-detail profile values (groove pitch, an inset) may live as a named constant block at the top of the builder file (pattern: `ESC_DETAIL` in `src/world/metro/escalators.ts`).
- `scripts/metro-layout-test.ts` holds geometry invariants (clearances, chains). When you add geometry that must clear something, add an invariant.

### 2.2 Module lifecycle (`src/main.ts`, `src/core/types.ts`)
1. All modules build in parallel (`Promise.all`). `buildMetro(ctx)` is last. Builders return `{ name, object, update?, finalize? }` and never add to the scene themselves.
2. main adds the objects, compiles, then runs each `finalize` sequentially. `lighting.finalize` renders the static sun shadow map and the hall env capture, and sets `castShadow`/`receiveShadow` on every opaque `MeshStandardMaterial` mesh **unless `userData.noShadow`**.
3. main builds `DepthLook` and awaits `depthLook.captureMetro()`, which:
   - captures the deep env (cavern) and the void env
   - generates the probe SH
   - **precompiles every metro program** in both zones
4. Then the guaranteed shadow render, then the loop. Per frame:
   1. `updateMetroRuntime(dt, feet)` runs in **real time**: escalators, disc and every `onMetroFrame` hook.
   2. `controls.update(dt)`.
   3. Modules' `update(f)` run in **simulation time** (sub-stepped, scaled by `?timescale`).
   4. `depthLook.update(camera.y)`.
   5. postfx render.

### 2.3 Real time vs simulation time
- **Real time** (`onMetroFrame` from `src/metro/runtime.ts`): anything the player interacts with or that must stay in sync with navigation, such as the disc mesh, gate leaves, speed-gate panels, escalator step phase, lifts and the funicular. It runs at `?timescale` 0.1 too.
- **Simulation time** (module `update`): the trains and their timetable, and anything driven by the trains (screen doors, light-wave, droplet pulses, map dots).
- The real local clock (`new Date()`) drives only the running clock on the map wall. **The hall clock stays frozen at 6:47.**

### 2.4 The metro scene groups and the airlock (`src/lighting/looks.ts`)
`metro` root holds:
- `metroVoid`: **always drawn**. Oculus, void, F1–F4, disc, Threshold fixtures.
- `metroDeep`: drawn only below the airlock. Cavern, lines, F5/F6, trains, everything under the sky.
- `metroDeepImpostor`: a bright disc filling the sky hole, seen from above.
- `metroSurfaceImpostor`: a warm disc filling the oculus, seen from below.

`DepthLook`:
- **Look blend:** blends the surface look into the deep look by camera depth (y −4 → −30). That covers fog, exposure, bloom, grade, hemisphere and probe SH.
- **Airlock:** runs at camera y −16 ± 1 m hysteresis. Below it, surface renderables hide and deep shows. It toggles **renderables only, never lights**, and throws if a group mixes lights and geometry.
- **Sun swap:** at the switch it re-aims the single sun (`setSunMode`) and re-renders its static shadow map. Both suns fade to 0 across the switch band, so the swap is invisible.
- **Void casters:** void meshes stop casting shadows in deep mode. The deep sun is "emitted" at the sky plane, and nothing above it may cast into the cavern.

New cavern geometry goes in `metroDeep`. Anything visible from both worlds must either be **split at the sky plane** (static geometry: the part above y −32 goes in `metroVoid` with void materials, the part below in `metroDeep` with deep materials; e.g. the lift tubes), or be a **both-zone object** (movers that travel through the sky: lift cabins, the funicular cabin, the disc).

**Both-zone objects:**
- They live in `metroVoid` (always drawn).
- They use **sun-masked** materials (`excludeDirectionalLight`), so neither sun ever lights them. Their look comes from env reflections and emissive.
- They are registered in a third list, `metro.userData.bothZoneMaterials`.
- `DepthLook` swaps their `envMap` at the airlock switch: the void env above it, the deep env below it. Swapping one cube-UV texture for another does not recompile shaders.
- Adding this swap to `looks.ts` is part of P3-8a.

### 2.5 Materials: the three rules that already caused bugs
1. **Void materials ignore every DirectionalLight** (`excludeDirectionalLight` in `src/lighting/sunMask.ts`). Deep materials **must not** be masked: use `kit.deep.*`, or create fresh instances. **Never `.clone()` a masked material to make a deep one.**
2. **Register deep materials** in `metro.userData.deepMaterials` (via `kit.deepList` plus your own) **before** `captureMetro` runs, so they receive the cavern env map. Void materials are collected automatically into `metro.userData.voidMaterials`. Train PBR materials (`trainsView.pbrMaterials`) must be registered too.
3. **Never mutate or env-map a material the hall uses.** Library materials (`ctx.materials.get('floorMarble')` and friends) are shared with the hall. If a metro mesh needs one, use it unchanged; to change anything, **clone first**. The WIP filter in `looks.ts` enforces this for env maps; don't rely on it for colour or roughness edits.

### 2.6 Navigation (`src/player/navigation.ts`, `src/player/regions.ts`, `src/metro/navData.ts`)
**Shapes and levels:**
- The walkable world is a union of `Region`s: an axis-aligned rect, optionally refined to a circle or oriented box.
- Ground is flat or a ramp along x or z.
- Each region can have region-scoped `holes`.
- A region can carry `when()` (a connector, walkable only while true, never trapping someone already inside it), a `conveyor` (escalators) or a `carry` (movers).
- The player's feet y selects the level (tolerance 0.6 m).

**Resolution order:** static `REGIONS` first, then dynamic regions (movers from `metroDynamicRegions()`). **On an exact height tie the earlier region wins.** That is why levels are listed before escalators: so belts stop at the landings.

**The trap that bit us three times:** a level region lying **under the low end of an escalator or ramp** wins the tie and traps the player at the lower level (F3, F6, F4). **Every time a ramp or escalator lands on or rises from a level, cut a hole in that level region under the escalator's low footprint** (pattern: `bandHoles` in `navData.ts`, `F3_LOW_FOOTPRINT_Z0`).

**Obstacles:**
- Circles in `src/obstacles.ts`. Metro ones need `level` (e.g. `METRO_OBSTACLES` at the Threshold).
- Obstacles **without** `level` apply only at ground y ≥ −5 (hall), never in the metro.

**Movers and connectors:**
- Movers (disc; later lifts and funicular) expose a floor region with `carry` (this frame's displacement), plus connector regions open only while docked.
- The pure-logic pattern to copy is `src/metro/disc.ts`: a state machine, trapezoid speed profile, arming rule, cached regions.

**Tests:** for every walkable change, extend `scripts/nav-metro-test.ts`:
- walk every new route both ways
- **ride every escalator's up unit and down unit**
- assert edges hold
- add fuzz on the new level

Mover logic gets Node tests in `scripts/metro-runtime-test.ts` (copy the disc tests).

### 2.7 Rendering conventions in `src/world/metro/*`
- **Merge per material per zone.** Use `GeoBag` (`src/world/concourse/geo.ts`: `add` / `merge`) and `sweep()` for moulding profiles. Targets:
  - one mesh per material for a whole feature
  - one `InstancedMesh` for repeated parts (balusters, hangers, droplets, steps, door leaves)
- **Vertex colours to save draw calls:** many tints on one material through vertex colour. `vertexGlow(mat)` (`src/world/metro/glow.ts`) lets vertices with a colour channel above 1.2 render as unlit HDR emitters in the same draw call. **Pitfall:** every geometry merged into a vertex-coloured material needs a `color` attribute, or it renders black (the well-gate brass bug).
- **World-scale UVs:** `ctx.materials.applyWorldUVs(geometry, kit.metersPerTile.<name>)` on flat geometry. For curved surfaces, generate UVs analytically. No stretching; tile size must look real.
- **Real-time animation without allocation:** pre-allocate buffers, write in place, use `addUpdateRange` for partial uploads, use plain loops (no `map`/spread in per-frame code). Give animated meshes correct bounding spheres instead of `frustumCulled = false`.
- **Transparency:**
  - Glass gets `depthWrite: false` and an explicit `renderOrder`; the kit glass carries the intended value in `userData.renderOrder` and **you must apply it to the mesh**.
  - Large `DoubleSide` transparent surfaces render twice (two draw calls). Prefer `FrontSide` or `forceSinglePass` where it looks right.
  - **Never use `MeshPhysicalMaterial` transmission:** it adds a whole extra render pass.
- **Shadows:** one static sun shadow map, re-rendered only at the airlock switch.
  - Moving things (trains, disc, cabins, droplets, gate panels) set `userData.noShadow = true` and never bake into it.
  - Invisible shadow casters, like the sky-hole caster, are meshes with `colorWrite: false`, `depthWrite: false`, `castShadow = true` and `userData.noCapture`.
  - The sky plane itself must not cast (`noShadow`).
- **Env captures** skip objects with `userData.noCapture` (impostors, casters, dust).
- **No real lights.** If you think you need one, you need emissive geometry, the cove/slot pattern, or the void-light shader approach (`voidLight.ts`: analytic ring and strip lighting computed in the material, nearest pair only, constant loop bounds).

### 2.8 Shader injection (`onBeforeCompile`) — the exact pattern
```ts
const prev = mat.onBeforeCompile.bind(mat);
mat.onBeforeCompile = (shader, renderer) => {
  prev(shader, renderer);                       // ALWAYS chain: other injections may already be installed
  shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `...`);
};
const key = mat.customProgramCacheKey.bind(mat);
mat.customProgramCacheKey = () => `${key()}|myFeature`;   // ALWAYS extend the key, or programs collide
```
- Verify the anchor exists. `stripDirectionalBlock` throws if three's chunk changes; do the same for your anchors and unit-test chunk edits in Node (`scripts/zones-test.ts` shows how).
- Use world position via `modelMatrix`. Never assume an identity transform.
- Keep loop bounds constant (WebGL2). Avoid `normalize(0)`, division by zero and `pow` of negatives. **NaN pixels get smeared by bloom into big black blocks.** The `NanGuardEffect` hides them, but your shader must not produce them.
- Per-fragment cost matters on the M2: evaluate only the nearest light sources (the void light evaluates the nearest ring pair, not all 14).

### 2.9 Precompile
New materials must be compiled at boot, not on first view. A first-view compile caused a 684 ms freeze once. `captureMetro` precompiles with every group visible in both zones. If you add objects that appear later (trains spawned from a pool, cabins), make sure the pool exists at boot so its programs are compiled, and **assert in the route test that no frame exceeds 50 ms**.

## 3. Performance budgets

| Scope | Budget |
|---|---|
| Every preset, headed M2, auto quality, both sizes | **≥ 45 fps** (hall included); metro presets **≥ 50 fps** **with the final pixel ratio ≥ 1.0**. The adaptive controller (`src/core/quality.ts`) steps the pixel ratio down whenever the average frame exceeds 20 ms. So an fps number without its pixel ratio proves nothing: always report both, and a metro preset that only reaches 50 fps at a pixel ratio below 1.0 **fails** |
| Any frame on the whole route (route test) | **≤ 50 ms** |
| Deep zone, worst view, no trains | ≤ 220 draw calls, ≤ 2.0 M visible triangles |
| Trains | ≤ 10 draw calls and ≤ 60 k triangles per train near; ≤ 4 present; LOD beyond 120 m |
| Droplets | ≤ 2 draw calls total |
| Map wall | ≤ 4 draw calls |
| `metroVoid` group (seen from the hall) | ≤ 22 draw calls, ≤ 400 k triangles **including the oculus**. **Currently breached at 31 calls** (accepted until P5-3 culling). New additions to `metroVoid` are capped: lift cabins ≤ 6 calls in total, funicular cabin and upper track ≤ 4, anything else ≤ 2 |
| GPU texture estimate (`?debug=1`) | ≤ 450 MB total (now about 224 MB) |
| Per-frame JS allocations in metro code | zero |

**Measure** with `node scripts/perf-presets.mjs` (headed, quiet machine: close other browsers, no parallel tests). The `npm run shot` fps readout is **not** a measurement; it was off by 3× under load.

## 4. Testing standards

- **Pure logic** (movers, timetable, layout invariants, nav regions) is TDD with Node scripts run by `tsx`. Write the failing test, watch it fail for the right reason, implement, watch it pass. Tests assert behaviour, never mock it.
- **Every walkable change** goes in `nav-metro-test` (both directions, up and down units, edges, fuzz).
- **The live route test** (`scripts/metro-route-test.mjs`) is extended in P3-9 and P4-6 to ride the lifts and funicular and to dwell while trains arrive.
  - Never loosen the 50 ms threshold.
  - Distinguish a *test* problem (waypoint, tolerance) from a *product* bug (never "fix" a product bug by editing the test).
- **Regression:** keep `nav-test`, `graph-test` and `traffic-sim` green, and run `walk-test`, `train-test`, `safety-test` and `route-test` at phase gates. The known pre-existing walk-test failure "deck samples left y 7" is not ours.

## 5. Pitfalls that already happened (don't repeat them)

| # | What happened | Rule |
|---|---|---|
| 1 | The player was trapped at the lower level at the foot of F3, F6 and F4 | Cut level holes under every escalator low footprint; test up and down units |
| 2 | Hall furniture collided 46 m below in the metro | Metro obstacles need `level`; unscoped ones apply only at y ≥ −5 |
| 3 | The disc bounced the rider straight back | Movers disarm after arrival until the rider steps off |
| 4 | A black rectangle covered a third of the screen | NaN pixels plus mipmap bloom. Guard after the RenderPass with `BlendFunction.SRC` (NORMAL blend keeps NaN). Don't produce NaN |
| 5 | Void ring light leaked into the hall | Never inject into shared materials; clone for the zone |
| 6 | A void env map was about to re-skin the hall floor | Never env-map hall-shared materials (WIP filter in `looks.ts`) |
| 7 | Deep surfaces went unlit | Deep materials were clones of sun-masked ones; build deep materials independently |
| 8 | Brass rendered black | Vertex-coloured material, merged geometry without a `color` attribute |
| 9 | A 684 ms freeze on first view | Precompile at boot |
| 10 | The gate animation froze at `?timescale` low | Interactive visuals use real time (`onMetroFrame`) |
| 11 | The threshold deck z-fought with the sky plane | Never coplanar faces; offset ≥ 0.1 m at this scale |
| 12 | Hall draw calls +31 | Merged void meshes always intersect the hall frustum. Cull by oculus visibility (P5-3) |
| 13 | A reviewer claimed a script was missing | Verify claims with evidence before acting on them (grep, run) |
| 14 | Agents edited the same file at once and mixed commits | One writer per file at a time; commit only your own paths |

## 6. General Three.js quality bar

- Reuse scratch `Vector3`/`Matrix4`/`Color` objects in hot paths. Never `new` inside `update`.
- Use `BufferGeometryUtils.mergeGeometries` or `GeoBag`. Keep geometry non-indexed only where `applyWorldUVs` requires it.
- Textures:
  - albedo in sRGB colour space, data maps (normal, roughness, ARM) not
  - mipmaps on
  - anisotropy at `renderer.capabilities.getMaxAnisotropy()` for floors seen at grazing angles
  - canvas textures generated once and shared
- `MeshStandardMaterial` by default. `MeshPhysicalMaterial` only for clearcoat or sheen, and never with transmission.
- HDR emissive values above 1 are how things glow (bloom threshold about 0.9–1.0). Keep them motivated (`02` §2 rule 3).
- Bounds: set correct bounding spheres on instanced and animated meshes so they cull.
- Every new module is a focused file with one responsibility, typed exports and a short header comment saying what it builds and which spec section it implements. Match the style of `src/world/metro/void.ts` and `escalators.ts`.
