# Grand Meridian Terminal — Design Spec

Date: 2026-10-05 · Status: approved by user (autonomous build authorized)

## 1. Vision

A first-person walkable Three.js experience: a vast, empty, luxurious railway terminal at golden hour.
Beaux-Arts station architecture (1910s Grand Central / Gare du Nord) + Art Deco 1930s streamliner trains
(black and gold, Orient-Express-grade luxury, warm glowing windows). Feeling: **subtle uncanny** — realistic,
but slightly too vast, too clean, too quiet. Platforms dissolve into golden haze with no visible end. No people.
Trains glide in from the haze, dwell, and leave.

Audience: the user, for fun, on an **M2 MacBook Air (8 GB unified memory, fanless)**. Target **≥ 50 fps**
in Chrome at a normal browser window size, with the best graphics that budget allows.

### Explicit user decisions
- Role: passenger on foot (first person). No boarding, no train interior.
- Aesthetic: hybrid (Beaux-Arts station + Art Deco trains). Golden hour, fixed sun.
- Surreal: subtle uncanny. People: none. Audio: ambient + trains (no announcements, no music).
- Scale: one grand concourse + 6 platforms under an iron-and-glass train shed.
- Train rhythm: arrive / dwell / depart, a train every ~45–90 s, 2–3 can be in motion at once.
- Tech: **pure Three.js, real-time** (no Blender baking).

### Quality bar ("anti AI-slop" rules — every agent must obey)
- Real architectural proportions and details: moldings, cornices, plinths, capitals, bevelled edges.
  No bare boxes with razor edges where a real building has trim.
- Textures in world-scale UVs (consistent texel density; no stretching; marble tiles ~1–2 m).
- No default grey/white materials. No z-fighting. No visible seams or gaps between modules.
- Restraint: one coherent palette — warm cream stone, honey marble, aged brass, black cast iron,
  oak/walnut; trains black + gold. Light does the drama.
- Every visual change is verified by screenshot (`npm run shot`), not assumed.

## 2. Tech stack (versions verified 2026-10-05)

- Vite 8, TypeScript (strict), `three@0.186.1`, `postprocessing@6.39.5` (peer: three < 0.187),
  `n8ao@2.0.1`. Pin these exact versions. Vanilla Three.js (no React).
- Dev tool: `playwright` for the screenshot/perf harness.
- Assets: CC0 PBR textures from Poly Haven (API `https://api.polyhaven.com`), downloaded by a script
  into `public/textures/` (diffuse + normal + packed ARM, 1k; 2k only for the concourse floor marble).
- Audio: fully procedural Web Audio (no sound files).

## 3. World coordinate contract (meters, +Y up, single source of truth = `src/layout.ts`)

Hall axis runs along +Z (south → north). The sun is in the west-south-west.

### Concourse (z 0 → 102)
- Interior: x ∈ [-30, 30], z ∈ [0, 100]. Floor y = 0. Side walls at x = ±30, south wall z = 0,
  north wall z ∈ [100, 102] (2 m thick).
- Barrel vault along Z: springline y = 24, radius 30, crown y = 54. Coffered.
- Freestanding colonnade: columns at x = ±23, z ∈ {20, 32, 44, 56, 68, 80}, shaft diameter 2.0,
  height 20 (to y = 20), entablature y ∈ [20, 24] along x = ±23 tied to the walls.
- Bays between columns centered z ∈ {26, 38, 50, 62, 74}. Giant arched windows in bays **26, 50, 74**
  on BOTH side walls: width 10, sill y = 3, straight to y = 17, semicircular top (radius 5) → top y = 22.
  Other bays: blind arches with marble panels. South end wall: large lunette window above balcony
  (semicircle under the vault, y 24 → 54).
- Balcony: x ∈ [-30, 30], z ∈ [0, 8], top y = 6, balustrade along z = 8 except stair opening.
- Grand staircase: x ∈ [-10, 10], z ∈ [8, 20], descends from y = 6 (z = 8) to y = 0 (z = 20).
  40 risers × 0.15 m, treads 0.30 m. Balustrades both sides with brass handrails.
- Information kiosk with four-faced brass clock: centered (0, 0, 50), footprint radius 3.5,
  clock faces at ~y 7.5. Clock hands are frozen at 6:47; the second hand ticks forward one step
  and snaps back (the uncanny detail).
- Split-flap departures board: center (0, 19, 99.9), 16 × 5 m, facing -Z (visible from balcony).
  Dreamlike destinations (e.g. Elsewhere, Hollow Bay, The Last Summer, Meridian, Vesper Falls,
  Ashgrove, Halcyon, Nowhere Junction). Rows occasionally re-flap with animation.
- North wall: three arched openings at x ∈ {-20, 0, 20}, width 10 (x ±5), height 15 (arched top),
  through z ∈ [100, 102], leading to the train shed.

### Train shed & platforms (z 102 → 360 roofed; tracks continue to z = 1400 into haze)
- Shed: x ∈ [-32, 32], z ∈ [102, 360]. Single-span wrought-iron arched trusses every 12 m,
  springline y = 10, crown y = 34, glazed roof panes between purlins. Side walls x = ±32: stone
  plinth to y = 3 then open iron arcade (sun enters from the west). North end (z = 360) open.
- Cross platform: x ∈ [-30, 30], z ∈ [102, 108], y = 0.
- Three island platforms (top y = 0), z ∈ [108, 380]:
  A x ∈ [-25, -15] (center -20) · B x ∈ [-5, 5] (center 0) · C x ∈ [15, 25] (center 20).
  Platforms extend past the shed roof to z = 380 then end.
- Six tracks, rail top y = -1.1, track bed below. Track centers (x):
  T1 -27.5, T2 -12.5, T3 -7.5, T4 7.5, T5 12.5, T6 27.5. Gauge 1.435.
  Platform numbers: 1 = T1 (A west face), 2 = T2 (A east), 3 = T3 (B west), 4 = T4 (B east),
  5 = T5 (C west), 6 = T6 (C east).
- Buffer stops at z = 108.5 on each track. Trains stop with nose at z = 111.

### Sun & atmosphere
- Sun direction (unit vector pointing TOWARD the sun): (-0.912, 0.242, -0.332)
  (elevation 14°, from west-south-west). Beams cross the hall eastward and slightly north.
- Fog: `FogExp2`, warm gold (~#c9955e, tuned visually), density ≈ 0.004 so the concourse reads
  clearly while platforms dissolve beyond ~350–450 m. Trains spawn ~z 1300, invisible in haze.
- Outside the windows: no city. An over-exposed golden sky dome (gradient + sun glow) → blooms.

### Player
- Eye height 1.7, collision radius 0.35. Walk 3.2 m/s, Shift 6 m/s. Subtle head-bob.
- Start: position (0, 6 + 1.7, 3), facing +Z, pitch -8°, looking down into the concourse.
- Walkable (`navigation.ts`, built from `layout.ts`):
  balcony x[-29.6,29.6] z[0.4,8] y=6 (balustrade blocks except stair opening);
  stair x[-9.6,9.6] z[8,20] y = lerp(6→0);
  concourse floor x[-29.6,29.6] z[8,100] y=0 excluding stair footprint, columns (radius 1.0+0.35),
  kiosk (radius 3.5+0.35);
  arch openings (x ±4.6 about each arch center, z[100,102]);
  cross platform x[-29.6,29.6] z[102,108]; islands (x inset 0.6 from edges) z[108,379.5].
  Tracks are never walkable (platform edges are hard boundaries).

## 4. Rendering & performance plan (pure real-time)

- `WebGLRenderer` (antialias off — SMAA in post), sRGB output, `NoToneMapping` at renderer
  (tone mapping is done in post), physically correct units.
- **Static sun shadow:** one `DirectionalLight` + 4096² shadow map (PCFSoft), shadow camera fitted
  to the world in light space; `shadowMap.autoUpdate = false`, rendered **once** after the world is
  built (sun never moves). Trains do not cast into this map; they get a soft contact-shadow decal.
- **Fake GI:** after build, render a `CubeCamera` capture once from (0, 6, 96) → PMREM →
  `scene.environment` (reflections) and `LightProbeGenerator` → `LightProbe` (diffuse bounce).
  Plus 2–4 warm non-shadowing bounce lights placed where sun pools hit the floor.
- **Post (pmndrs postprocessing):** N8AO (half-res) → god-ray-friendly bloom (mipmap blur) →
  AgX/ACES tone mapping → subtle vignette → very subtle film grain → SMAA.
- **God rays:** additive volumetric shafts (window-shaped extruded beams along the sun direction,
  noise-modulated, depth-softened) for each west window and the south lunette, plus roof-glass
  shafts in the shed. **Dust:** GPU point particles that glow only inside the shafts.
- **Polished floor:** low-roughness marble with environment reflections; optional half-res
  planar reflection on the concourse floor as a high-quality tier.
- **Batching:** merge static geometry per material, `InstancedMesh` for repeated parts
  (columns, coffers, trusses, lamps, sleepers, rails). Budget: < 250 draw calls,
  < 2.5 M triangles, GPU texture memory < 450 MB.
- **Adaptive quality:** measure frame time over 2 s windows; scale pixel ratio within
  [0.85, 1.5] and toggle AO resolution / planar reflection to hold ≥ 50 fps. `?q=low|med|high` override.

## 5. Trains
- Procedural Art Deco streamliner (20th Century Limited / K4 streamlined style): teardrop shroud
  nose with a brass/gold chevron, black body, gold speed lines, 5 carriages with warm glowing
  windows (emissive, bloom), skirts, bogies, gangway bellows. Loco 24 m, carriages 25 m, 1 m gaps.
  Width 3.2, height 4.4 above rail top; floor at platform height.
- Scheduler: random free track, spawn at z ≈ 1300 moving −Z, cruise ~22 m/s, smooth jerk-limited
  deceleration to stop at nose z = 111, dwell 25–40 s, depart with smooth acceleration to z ≈ 1400,
  despawn. New arrival every 45–90 s; first arrival within ~8 s of entering. Max 4 trains in world.
- Audio per train (positional): rumble (scales with speed/proximity), brake hiss on stopping,
  departure chuff/whistle-free hum. Global: large-hall ambient room tone with long synthetic reverb,
  echoing footsteps synced to head-bob.

## 6. Code architecture

```
src/
  main.ts                 bootstrap: renderer, scene, loop, intro overlay, module wiring
  layout.ts               ALL world coordinates above (single source of truth)
  core/types.ts           BuildContext, WorldModule, FrameInfo interfaces
  core/quality.ts         adaptive quality controller
  core/postfx.ts          composer + passes
  core/presets.ts         camera presets for ?cam=<name>
  materials/library.ts    MaterialLibrary: named PBR materials (marble, stone, brass, iron, ...)
  world/concourse.ts      hall shell, vault, colonnade, windows, balcony, stair
  world/props.ts          clock kiosk, departures board, benches, lamps, chandeliers
  world/shed.ts           shed, trusses, roof glass, platforms, tracks, buffer stops, signage
  world/sky.ts            sky dome
  lighting/lighting.ts    sun, static shadows, env capture, light probe, bounce lights
  lighting/atmosphere.ts  fog, god-ray shafts, dust
  trains/trainModel.ts    procedural streamliner
  trains/scheduler.ts     arrive/dwell/depart state machine
  audio/audio.ts          procedural Web Audio engine (ambient, footsteps, train voices)
  player/controls.ts      pointer-lock first-person controller
  player/navigation.ts    walkable-height/collision queries built from layout.ts
scripts/
  fetch-textures.mjs      download Poly Haven CC0 textures
  shot.mjs                Playwright: open ?cam=<preset>&autostart=1, wait, save PNG, print fps + GPU string
```

Module contract (`core/types.ts`):
```ts
export interface FrameInfo { dt: number; time: number; camera: THREE.PerspectiveCamera }
export interface WorldModule { name: string; object: THREE.Object3D; update?(f: FrameInfo): void }
export interface BuildContext {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  materials: MaterialLibrary; audio: AudioEngine; quality: QualityState;
}
// each world/lighting/trains file exports: async function build<Name>(ctx: BuildContext): Promise<WorldModule>
```

URL params: `?cam=balcony|concourse|kiosk|window|arches|platform|shed|haze` (fixed camera, no pointer
lock), `&autostart=1` (skip intro), `&debug=1` (stats: fps, draw calls, triangles, GPU memory), `&q=`.

## 7. Experience flow
1. Black screen, loading progress (thin gold line), title "GRAND MERIDIAN" in a Deco serif.
2. "Click to enter" → pointer lock + audio start → 2 s fade from black at the balcony.
3. Free roam. Esc releases the pointer and shows a minimal paused overlay (controls hint).

## 8. Verification
- `npm run build` (tsc + vite) clean.
- `npm run shot -- <preset>` for every preset; director reviews PNGs each phase.
- Performance: debug overlay ≥ 50 fps on the M2 in headed Chrome at 1440×900; draw calls and
  triangles within budget.
- Walk test: cannot leave walkable area, stairs smooth, no falling onto tracks.
