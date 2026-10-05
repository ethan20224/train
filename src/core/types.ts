import type * as THREE from 'three';

/**
 * Module contract for Grand Meridian Terminal (spec section 6).
 *
 * Every world / lighting / trains file exports:
 *     export async function build<Name>(ctx: BuildContext): Promise<WorldModule>
 * and is wired into src/main.ts already. Phase 2 agents edit ONLY their own file.
 *
 * ---------------------------------------------------------------------------
 * LIFECYCLE and the one-time shadow / environment capture ("finalize" hook)
 * ---------------------------------------------------------------------------
 * 1. main builds all modules in parallel (Promise.all). Builds must NOT assume other modules
 *    exist yet and must NOT add their own objects to ctx.scene: return them as `WorldModule.object`.
 *    (Exception: lighting/atmosphere may set scene-level state such as scene.fog; scene.environment is
 *    set in lighting's finalize.)
 * 2. main adds every module.object to ctx.scene (in the order listed in main.ts: concourse, props, shed,
 *    sky, lighting, atmosphere, trains), runs `scene.updateMatrixWorld(true)`, awaits material textures and
 *    `renderer.compileAsync`.
 * 3. main then calls `finalize(ctx)` on every module that defines it, SEQUENTIALLY, in that same order.
 *    The whole world exists at this point. This is where lighting does its one-time work:
 *      - set `renderer.shadowMap.needsUpdate = true` and render once if it needs shadows in the
 *        environment capture (the sun never moves; renderer.shadowMap.autoUpdate is false),
 *      - CubeCamera capture from (0, 6, 96) -> PMREM -> `scene.environment`,
 *      - LightProbeGenerator -> LightProbe.
 * 4. GUARANTEE: after all finalize hooks, main sets `renderer.shadowMap.needsUpdate = true` and renders
 *    one frame, so the static sun shadow map is always valid when the first frame is shown, even if a
 *    module forgot. After that, shadowMap.autoUpdate stays false forever; if a module ever needs a
 *    re-render of the shadow map it sets `renderer.shadowMap.needsUpdate = true` itself.
 * 5. Per frame, main calls `update(f)` on every module that defines it, then `audio.update(f)`.
 */

/** Per-frame info passed to module.update(). `dt` is clamped to <= 0.05 s. */
export interface FrameInfo {
  /** Seconds since last frame (clamped). */
  dt: number;
  /** Seconds since the loop started (sum of clamped dt). */
  time: number;
  camera: THREE.PerspectiveCamera;
}

export interface WorldModule {
  name: string;
  object: THREE.Object3D;
  update?(f: FrameInfo): void;
  /**
   * Optional one-time hook run after the whole world is built and added to the scene
   * (see lifecycle above). Additive extension of the spec contract.
   */
  finalize?(ctx: BuildContext): void | Promise<void>;
}

export interface BuildContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  materials: MaterialLibrary;
  audio: AudioEngine;
  quality: QualityState;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Named, shared PBR materials. Palette: cream stone, honey marble, aged brass, black iron, walnut; trains black + gold. */
export type MaterialName =
  | 'floorMarble'
  | 'wallStone'
  | 'columnMarble'
  | 'darkMarble'
  | 'brass'
  | 'castIron'
  | 'wood'
  | 'platformStone'
  | 'trackBallast'
  | 'sleeperWood'
  | 'railSteel'
  | 'trainPaint'
  | 'trainGold'
  | 'glass';

export type PBRMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

export interface MaterialLibrary {
  /** Shared material instance (same object every call). Do not mutate it; `.clone()` to customise. */
  get(name: MaterialName): PBRMaterial;
  /** Real-world size in meters of one texture repeat for this material (use as `metersPerTile`). */
  tileSize(name: MaterialName): number;
  /**
   * Rewrites `uv` from WORLD positions so texel density is consistent: one texture repeat per
   * `metersPerTile` meters. Projection axis is chosen per TRIANGLE from the face normal
   * (Y -> (x,z), X -> (z,y), Z -> (x,y)), so the result is NON-INDEXED (a new geometry is returned when the
   * input is indexed; the input is not modified in that case).
   * `matrix`: optional transform taking the geometry to world space (e.g. `mesh.matrixWorld`); omit
   * when the geometry is already in world space. Flat / faceted surfaces only: for curved surfaces
   * (columns, vault) generate UVs analytically.
   */
  applyWorldUVs(geometry: THREE.BufferGeometry, metersPerTile: number, matrix?: THREE.Matrix4): THREE.BufferGeometry;
  /** Resolves when every texture of every material has finished loading. */
  readonly ready: Promise<void>;
  /** Estimated GPU memory of all loaded textures in MB (with mipmaps). Valid after `ready`. */
  estimatedTextureMB(): number;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

/** Per-train positional voice, attached to the train's root object. */
export interface TrainVoice {
  /** Current train speed in m/s (drives rumble). */
  setSpeed(mps: number): void;
  /** Start the brake hiss (called when the train begins decelerating to stop). */
  brake(): void;
  /** Departure hum / release (called when the train starts to leave). */
  depart(): void;
  dispose(): void;
}

/** Implemented by audio/audio.ts (Phase 2). The stub is a set of no-ops. */
export interface AudioEngine {
  /** Must be called from a user gesture (click on the intro). Resumes the AudioContext. */
  start(): Promise<void>;
  /** One footstep, called by the controller at each foot contact (synced to head-bob). */
  footstep(): void;
  createTrainVoice(obj: THREE.Object3D): TrainVoice;
  /** Per frame: update listener from camera, distance-based gains, etc. */
  update(f: FrameInfo): void;
  /** Phase 4: concierge brass service bell (long hall echo). */
  bell(): void;
  /** Phase 4: ticket collected (soft paper slide + stamp). */
  ticket(): void;
  /** Phase 4: gate paddles opening (true) or closing (false) at a world position. */
  gate(position: THREE.Vector3, open: boolean): void;
}

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

export type QualityTier = 'low' | 'med' | 'high' | 'auto';

/**
 * Live quality state. A single object, mutated in place by core/quality.ts, so modules may keep a
 * reference and read it every frame. `version` increments on every change.
 */
export interface QualityState {
  /** 'auto' = adaptive controller; otherwise fixed by `?q=`. */
  tier: QualityTier;
  /** True when set via ?q= (no adaptation). */
  fixed: boolean;
  /** Current ladder rung (0 = best). */
  level: number;
  /** Render pixel ratio in [0.85, 1.5]. */
  pixelRatio: number;
  /** Half-resolution planar reflection on the concourse floor enabled. */
  planarReflections: boolean;
  /** N8AO runs at half resolution. */
  aoHalfRes: boolean;
  version: number;
}
