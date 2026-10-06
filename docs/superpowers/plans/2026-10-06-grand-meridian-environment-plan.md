# Grand Meridian Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the original station support keyboard-only full-day daylight and clear/overcast/rain/fog with coherent lighting, reflections, shelter and sound.

**Architecture:** One pure state/look controller owns environmental values; browser input, rendering and audio consume it. Sun refreshes are throttled, reflection captures are versioned and incremental, and environmental real time is separate from railway substeps. Complete this subsystem before building the expanded grounds.

**Tech Stack:** Existing TypeScript/Three.js/postprocessing/Web Audio; node:assert/node:test via installed tsx; Playwright via `scripts/lib.mjs`. No added packages.

**Spec:** `docs/superpowers/specs/2026-10-06-grand-meridian-river-city-expansion-design.md`, sections 5–6, 8–9. Also read the master expansion plan's constraints and baseline.

## Global Constraints

- Keys only: 1–4 weather, [ / ] daylight, − / = intensity, H help. Existing movement/E remain intact.
- Initial daylight 17:30 clear; station time remains 6:47. No automatic daylight/weather evolution or saved preferences.
- 15 minutes/time tap; 0.1/intensity tap; intensity [0.1,1]; 300 ms repeat delay then 4 steps/s; status fades after 2 seconds.
- One-second transitions; rain dries over 20 real seconds; sunlight refresh ≤10/s and ≤4096² equivalent shadow texels.
- Complete reflection maps converge within 3 seconds of settled input; hall/lounge cube faces 256, winter garden 128; at most one captured face/display frame.
- At most 8 active non-shadowing local lights; preserve 0.85 pixel-ratio floor and the master 50 fps/250-call/2.5M-triangle/450 MB acceptance limits.
- No new dependencies; no product changes before plan review and execution-method selection.

## Review Focus

1. Browser-repeat events and held-key release on blur/unlock cannot cause a time jump or stuck intensity (E2).
2. Invalid capture URLs or midnight wrap cannot produce NaNs, long-way-around transitions, or changes to the timetable (E1/E2).
3. Capture cancellation or failure restores renderer target/face/mip/XR and every temporarily hidden object (E4).
4. Indoors, rain is visible outside but never falls through a roof; open-sided canopies still shelter paving (E5).
5. Rapid input produces the latest look, coherent shafts/shadows, and stable resource counts under timescale=10 (E3–E5).

---

## File ownership and shared interfaces

Create `src/environment/` for pure state (`state.ts`), look derivation (`look.ts`), browser bindings (`keyboard.ts`), shared shelter math (`shelter.ts`), precipitation (`rain.ts`), and wet-surface registration (`wetness.ts`). Keep rendering integration in existing sky/lighting/postfx modules. Create `src/ui/environmentUi.ts` for text-only help/status, `src/lighting/reflections.ts` for incremental capture jobs, and `src/audio/environment.ts` for environmental voices. Do not split unrelated existing files.

The following exported contracts are fixed across all plans:

```ts
type Weather = 'clear' | 'overcast' | 'rain' | 'fog';
type RGB = readonly [number, number, number];
type XYZ = readonly [number, number, number];
interface EnvironmentState {
  daylightMinutes: number; weather: Weather;
  rainIntensity: number; fogIntensity: number; version: number;
}
interface EnvironmentLook {
  revision: number; daylightMinutes: number; sunDirection: XYZ;
  sunRGB: RGB; sunIntensity: number; skyTopRGB: RGB; horizonRGB: RGB;
  skyFillRGB: RGB; groundFillRGB: RGB; fillIntensity: number;
  fogDensity: number; cloudAmount: number; rainAmount: number;
  wetness: number; nightAmount: number; shaftIntensity: number;
  exposure: number; gradeSplit: number;
}
class EnvironmentController {
  constructor(search?: string);
  readonly state: Readonly<EnvironmentState>; // target, through getters
  readonly look: Readonly<EnvironmentLook>; readonly settled: boolean;
  subscribe(listener: (state: Readonly<EnvironmentState>) => void): () => void;
  setWeather(weather: Weather): void;
  setTarget(patch: Partial<Omit<EnvironmentState,'version'>>): void;
  adjustDaylight(minutes: number): void;
  adjustIntensity(delta: number): boolean; // false for clear/overcast
  update(realDt: number): void;
}
interface Shelter {
  id: string; bounds: Rect; floorY: number; roofY: number;
  enclosure: 'room' | 'canopy';
  roofProfile?: 'vault' | 'shed' | 'winterGarden';
}
function rainOccluded(x: number, y: number, z: number,
  shelters: readonly Shelter[]): boolean;
function exposureAt(x: number, y: number, z: number,
  shelters: readonly Shelter[]): { rain: number; enclosure: number };
```

`EnvironmentController` is dependency-free; RGB/XYZ are tuples, not THREE objects. `BuildContext.environment` references the single controller. `WorldModule.realUpdate?(realDt:number)` is an additive once/display-frame hook. In the loop: controls and input → environment.update → module realUpdate → existing simulation substeps → audio → rendering. Supply realDt=0 while document.hidden; cap visible wall-clock delta to 0.1 s to prevent resume jumps. Environment rendering/transition work may continue during the pause overlay; kiosk timers independently require pointer lock. Keep `FrameInfo.dt/time` unchanged.

### E1: Pure environmental state and look derivation

**Files:** Create `src/environment/state.ts`, `src/environment/look.ts`, `scripts/environment-test.ts`; modify `src/core/types.ts` only to add the controller reference and realUpdate hook.

**Interfaces:** Produce the types/controller above and `parseEnvironment(search:string): EnvironmentState`, `deriveLook(state:Readonly<EnvironmentState>, wetness:number): EnvironmentLook`. No DOM or GPU work here.

- [ ] Write node:test cases for defaults, typed URL parsing, modulo-1440 daylight, per-mode intensity retention, finite look fields, one-second retargeting and 20-second drying. Pin the core behaviour:

```ts
const c = new EnvironmentController('?daylight=23:55&weather=rain&intensity=0.8');
c.adjustDaylight(15);
assert.equal(c.state.daylightMinutes, 10);
assert.equal(c.state.rainIntensity, 0.8);
c.setWeather('fog'); c.adjustIntensity(-10);
assert.equal(c.state.fogIntensity, 0.1);
c.setWeather('rain'); assert.equal(c.state.rainIntensity, 0.8);
assert.equal(new EnvironmentController('?daylight=24:99&intensity=NaN').state.daylightMinutes, 1050);
let notifications = 0;
const unsubscribe = c.subscribe(() => notifications++);
c.adjustDaylight(15); assert.equal(notifications, 1);
unsubscribe(); c.adjustDaylight(15); assert.equal(notifications, 1);
```

- [ ] Run `./node_modules/.bin/tsx scripts/environment-test.ts`; expect import/function failures before the files exist.
- [ ] Implement complete HH:MM parsing (00:00–23:59), finite numeric intensity in [0.1,1], defaults for invalid URL values, and weather membership. Invalid URL intensity uses that mode's default. setTarget accepts only finite/in-range typed fields, ignoring invalid patch fields, so debug control cannot introduce NaNs. Notify subscribers once on actual target changes; return an idempotent unsubscribe function. Interpolate time by the shortest signed modulo-1440 delta; interruption starts from the currently rendered look. Wetness approaches rainAmount over 3 s while raining and decays linearly from its last wet value to zero over 20 s after rain ends. State revision increments on actual target changes only; settled means the current transition is complete, not that drying stopped.
- [ ] Derive an authored daily curve with anchors at 00:00/06:00/12:00/17:30/19:00/20:00/24:00. Initial 17:30 reproduces `SUN_DIRECTION`, sun linear RGB [1,0.72,0.42], sun intensity 8.5, sky fill 0.85, exposure 0.78, grade split 1.15. Noon sun elevation 65°, sunrise/sunset 0°, night direct sun/shafts 0. Use cloud attenuation (overcast/rain sunlight ≤15% of clear), clear fog density 0.0024, overcast 0.0028, rain 0.0032–0.006 with intensity, fog 0.004–0.014 with intensity. Reuse the existing shader's palette as the golden anchor; cool the day/night/cloud anchors. Render values can be calibrated from screenshots without changing the controller, timing, weather choices, or budgets.
- [ ] Run the test and `npm run build`; expect exit 0 and all finite/wrap/transition assertions passing. Confirm a 23:55→00:10 transition advances 15 minutes rather than traversing the whole day.
- [ ] Commit only this task's new files and interface extension: `feat: add shared environment state and daylight look`.

### E2: Keyboard bindings, non-interactive UI, and loop wiring

**Files:** Create `src/environment/keyboard.ts`, `src/ui/environmentUi.ts`, `scripts/environment-input-test.mjs`; modify `src/main.ts`, `src/ui/intro.ts`, `index.html` (shortcut text only), and E1's pure test for repeat math if extracted.

**Interfaces:** Consume E1 controller. Produce `EnvironmentUI.showStatus(state:Readonly<EnvironmentState>, message?:string):void`, `toggleHelp():void`, `EnvironmentKeyboard.update(realDt:number):void`, `clear():void`, `dispose():void`; keyboard constructor takes controller/UI and `enabled:()=>boolean`, `helpEnabled:()=>boolean` callbacks. Export pure `repeatCount(heldSeconds:number):number` for deterministic key timing tests. Add debug `environment():{state,look,settled}` and `setEnvironment(patch:Partial<Omit<EnvironmentState,'version'>>):void` forwarding to controller.setTarget for automation, never GUI input.

- [ ] Write Playwright cases using `scripts/lib.mjs` for simultaneous W+BracketRight, 1–4, Minus/Equal, H during play/pause, repeated E exclusion, modifier chords, typing focus, fixed-camera mode, blur/unlock, and timescale=10. Test document.body has no new environment button/input/select controls. Assert one tap adds 15 minutes, a deterministic 1.2 s hold adds five 15-minute steps, and unlock stops repeats. Configure a test page with an explicit input element to confirm typing is ignored without shipping a text field. Pure assertions: `assert.equal(repeatCount(0.29),1); assert.equal(repeatCount(0.30),2); assert.equal(repeatCount(1.2),5)`. Live assertion after a single tap from defaults: `assert.equal((await page.evaluate(()=>window.__meridian.environment())).state.daylightMinutes,1065)`.
- [ ] Run `node scripts/environment-input-test.mjs`; expect missing environment debug/UI assertions to fail on the old app.
- [ ] Bind physical key codes Digit1–4, BracketLeft/Right, Minus/Equal, KeyH; generate deterministic repeats from held state, ignoring native KeyboardEvent.repeat. Ignore Ctrl/Meta/Alt, text/editable targets and intro. Permit H when entered/paused; other actions require lock. Mount help/status with pointer-events:none, status opacity fade at 2 s, and a visible DAYLIGHT label. Do not intercept movement, E, Esc or pointer-lock resume.
- [ ] Construct one controller before ctx/modules, invoke environment/input once per display frame, invoke new realUpdate hooks outside timescale substeps, and expose the debug getter/setter. Extend fixed capture query handling through the E1 parser. Preserve current cam/autostart/debug/q/timescale behaviour.
- [ ] Run E1 test, new browser test and build; expect exit 0. Snapshot ticket fields and station clock before/after weather changes and assert unchanged.
- [ ] Commit only task paths: `feat: add keyboard-only environment controls`.

### E3: Coherent sun, sky, grade and night illumination

**Files:** Modify `src/lighting/shared.ts`, `src/lighting/lighting.ts`, `src/lighting/atmosphere.ts`, `src/lighting/godrays.ts`, `src/lighting/grade.ts`, `src/core/postfx.ts`, `src/world/sky.ts`, `src/world/hotel.ts`; create `src/lighting/practicals.ts`, `scripts/lighting-test.mjs`. Existing fixtures can be tagged at their material creation sites (`src/world/concourse/fixtures.ts`, `src/world/props/details.ts`, `src/world/shed/furniture.ts`) only where necessary.

**Interfaces:** Consume ctx.environment.look. Produce `registerPractical(root:THREE.Object3D, placement:PracticalPlacement):void`, where PracticalPlacement has `id`, world `position:XYZ`, `color:RGB`, `intensity`, `distance`, and an optional emissive material. `updatePracticals(camera:THREE.PerspectiveCamera,look:Readonly<EnvironmentLook>):void` deterministically activates the nearest 8; bounds/IDs break distance ties. PostFX adds `applyEnvironment(look:Readonly<EnvironmentLook>):void`. Shadow-ready state includes the revision/direction that produced its matrix. Add `window.__meridian.lighting()` diagnostics for shadow revision/direction/render count, shaft direction/intensity and local-light count; these feed E3 assertions.

- [ ] Write live assertions that direct sun and shafts are zero at midnight, clear golden sun matches the original direction, rain/overcast suppress shafts, no more than 8 local lights activate, changing targets causes ≤10 sun-map refreshes/s, and settled state stops refreshes. Pin `assert.equal(env.look.sunIntensity,0); assert.equal(light.shaftIntensity,0); assert.ok(light.localLightCount<=8)` after night settles. Test a held daylight key while moving at timescale=10; capture light/shadow/shaft directions after each committed refresh and assert agreement within 1e-4.
- [ ] Run `node scripts/lighting-test.mjs`; expect failure on the old fixed rig.
- [ ] Replace copied constants with current look consumption in sky, dust, fog and rays. Recompute bounce pool positions from committed sun direction; suppress solar bounce at night/cloud darkness. Update sun direction, fitted frustum, shadow draw, and matching shader uniforms as one refresh transaction. Disable stale shafts between transaction states. Keep renderer.shadowMap.autoUpdate=false and the existing texel budget.
- [ ] Use a permanent sun-shadow coverage AABB that includes the approved near grounds and all station rooms: x[-145,80], y[-3,57], z[-76,380]. Fit in current light space using existing corner projection. Exclude trains as today and all background terrain/city from sun shadow casting. This avoids camera-following refreshes during ordinary walks. Initialise the final shadow rig only after the full world is added; remove the unconditional duplicate post-finalize refresh once this rig owns it.
- [ ] Add authored clear/cloud/night sky treatment, subtle night stars/moon, and daylight-aware practical material intensity. Use regional ambient fill for enclosed rooms and nearest-eight local lights for entries/paths; existing lamps must illuminate surfaces. Existing golden-grade uniforms remain available for debug overrides, but apply the derived exposure/split/tints during normal play so cloudy/night views lose the orange cast. Explicit debug exp/tm/bloom/grade overrides retain precedence for capture reproducibility.
- [ ] Run build, lighting/input tests and original walk/safety tests. Capture balcony/lounge/platform at 00:00,12:00,17:30 in clear and overcast. Check thresholds and stairs remain readable at night; do not accept a numerical pass without inspecting these images.
- [ ] Commit task paths: `feat: relight station coherently across day and night`.

### E4: Incremental versioned reflection and diffuse-probe refresh

**Files:** Create `src/lighting/reflections.ts`, `scripts/reflection-test.mjs`; modify `src/lighting/lighting.ts`, `src/lighting/shared.ts`, `src/world/hotel.ts` and `src/main.ts` to register/tick the job. No shader source duplication.

**Interfaces:** Produce `registerCapture(id:string, position:XYZ, size:128|256, materials:readonly THREE.MeshStandardMaterial[]):void`, `requestCapture(revision:number):void`, `tickCaptures():void`, `disposeCaptures():void`, and `window.__meridian.reflections()` diagnostic `{revision,completedRevision,face,captureId,activeTargets}`. Hall applies to scene.environment/probe; lounge and later winterGarden apply to registered materials. Register hall at [0,6,96], lounge at [0,8.4,-13], sizes 256.

- [ ] Write cases that change weather during face 2, simulate a face-render exception, run 30 successive weather/time changes, and return to the same complete state. Assert no stale publish, no hidden trains/weather afterwards, renderer state restored, settled completion within 3 s, and no increasing active target/texture counts after warmup. Pin `assert.equal(done.completedRevision,env.state.version); assert.equal(after.activeTargets,before.activeTargets)` once settled. Use a narrow test-only injected failure callback in the capture job, not a production global throw switch.
- [ ] Run `node scripts/reflection-test.mjs`; expect missing diagnostics/failure assertions to fail.
- [ ] Retain one cube render target per registration and reusable cameras/PMREMGenerator. Queue hall→lounge→winterGarden only after the one-second look transition settles. Cancel a job on any target revision change; restart with current final look. One cube face renders per displayed frame, with PMREM generated/published only after six faces. Build diffuse SH from the completed cube and assign probe values on publication.
- [ ] Freeze an EnvironmentLook snapshot for the entire job, including wetness during drying. Temporarily apply its visual values to sky/fog/lights/materials/water for each face, restoring the current display look in the same finally path. A face capture must never advance environment, audio, kiosk or train time; six faces cannot sample six different drying states.
- [ ] Follow installed `node_modules/three/src/cameras/CubeCamera.js` for face orientation and target handling: set camera.coordinateSystem to renderer.coordinateSystem and call updateCoordinateSystem before face rendering. Save/restore render target, cube face, mip level, XR enabled, visibility and any temporarily changed scene state in finally. Hide transient objects per face, then restore them before main rendering, not for the whole multi-frame job. Reuse previous complete PMREM until replacement is ready and dispose the old target only after all dependent materials have swapped.
- [ ] Run reflection/lighting/input tests and build; inspect brass, marble and lounge wood at day/night after changing weather, and observe no incomplete cube seams. Record maximum refresh frame time; later performance acceptance still applies.
- [ ] Commit task paths: `feat: refresh environmental reflections incrementally`.

### E5: Sheltered precipitation, exposed wetness, weather sound and subsystem gate

**Files:** Create `src/environment/shelter.ts`, `src/environment/rain.ts`, `src/environment/wetness.ts`, `src/audio/environment.ts`, `scripts/weather-test.ts`, `scripts/weather-test.mjs`; modify `src/layout.ts`, `src/lighting/atmosphere.ts`, `src/audio/audio.ts`, `src/core/types.ts`, `src/core/quality.ts`, `src/main.ts`, `docs/TASKS.md`. Add only existing-room shelter data now; G1 adds the new site regions.

**Interfaces:** Produce shelter functions from the shared contract, `registerWetSurface(material:THREE.MeshStandardMaterial, exposed:boolean):void`, `buildRain(ctx:BuildContext):Promise<WorldModule>`, and additive AudioEngine `setEnvironment(look:Readonly<EnvironmentLook>, exposure:{rain:number;enclosure:number}):void`, `kiosk(position:THREE.Vector3):void` (implemented in K3). QualityState adds `rainScale:number` using current rung scale [1,1,0.9,0.8,0.7,0.6,0.5,0.4]; no changes to current pixel ratios.

- [ ] Write pure shelter tests for hall/lounge/shed roofs, their doorway edges, a sample open canopy, and precipitation above versus below a roof. Include y over the curved shed roof versus its low eaves; do not use a single maximum roof height across the whole shed. Pin `assert.equal(rainOccluded(0,2,50,shelters),true); assert.equal(rainOccluded(0,60,50,shelters),false)` and an outside sample to false. Test wetness state during a 20 s dry transition and rain→fog interruptions.
- [ ] Run `./node_modules/.bin/tsx scripts/weather-test.ts`; expect missing shelter functions to fail.
- [ ] Implement shared roof profiles using existing vault/shed dimensions (match actual crown/eave geometry, including the shed lantern) and footprint math. Exposure fades across the nearest room portal over 2 m; canopy protection changes rainfall/roof-patter without hall-like reverb. Evaluate particles against roof profiles, including when the viewer is sheltered.
- [ ] Generate rain from one camera-local, world-aligned instanced streak pool (maximum 6000, scaled by intensity/quality), with a shader roof mask; add one bounded ground-ripple/splash pool. Register all weather objects noCapture/noShadow. Reuse arrays/buffers; no geometry creation per frame. All precipitation, wetness, wind and water animation uses realUpdate time, never FrameInfo.time scaled by train tests. Wet exposed surfaces use registered cloned material roughness/normal response, never a shared library mutation that wets indoor marble. Initial existing platform zones outside the shed can get wet; covered platforms remain dry. Expose `window.__meridian.weather()` with current exposure and deterministic particle/shelter samples for the live tests.
- [ ] Add procedural wind, river-ready wash and rainfall/patter voices to the existing engine, started only after its user gesture. Blend dry/send gains by enclosure; avoid attaching all outdoor weather to the six-second hall convolution. Keep positional train voices and other audio unchanged. New river wash gain stays zero until G3 registers/places the river environment.
- [ ] Implement the browser weather test for the 4×5 mode/time matrix, sheltered camera seeing rain outside, doorway/canopy crossing, dry floors, latest-target convergence, exposure audio parameters, resource count stability, and daylight changes at timescale=10. Expose deterministic particle/shelter samples to tests rather than asserting pixels alone. Run pure tests, browser tests, build/nav/graph/traffic and original walk/train/safety/route checks sequentially.
- [ ] Record screenshots and actual keyboard-only walkthrough of the original station; run a headed-GPU baseline comparison on balcony, lounge and platform at clear-golden/rain/night. Mark environmental subsystem complete only if coherent and functional; document full-ground/performance certification as remaining. Update task evidence and commit task paths: `feat: add sheltered rain fog and environmental audio`.
