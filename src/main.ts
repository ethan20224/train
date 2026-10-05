import * as THREE from 'three';
import { applyPreset, parsePreset } from './core/presets';
import { PostFX } from './core/postfx';
import { QualityController, parseQualityTier } from './core/quality';
import type { BuildContext, FrameInfo, WorldModule } from './core/types';
import { createMaterialLibrary } from './materials/library';
import { PlayerControls } from './player/controls';
import { UI } from './ui/intro';
import { createAudioEngine } from './audio/audio';
import { buildAtmosphere } from './lighting/atmosphere';
import { buildLighting } from './lighting/lighting';
import { buildConcourse } from './world/concourse';
import { buildProps } from './world/props';
import { buildShed } from './world/shed';
import { buildSky } from './world/sky';
import { buildTrains } from './trains/scheduler';

/**
 * Bootstrap: renderer, scene, camera, module wiring, loop, intro. See core/types.ts for the module
 * lifecycle (build -> add -> finalize -> shadow render guarantee -> update).
 * Phase 2 agents must NOT edit this file: add behaviour inside your own module.
 */

declare global {
  interface Window {
    __meridian: { fps: number; drawCalls: number; triangles: number; ready: boolean };
  }
}

const search = window.location.search;
const params = new URLSearchParams(search);
const camPreset = parsePreset(search);
const autostart = params.get('autostart') === '1';
const debugOn = params.get('debug') === '1';

window.__meridian = { fps: 0, drawCalls: 0, triangles: 0, ready: false };

const ui = new UI();

/** Monotonic loading progress shown on the intro line. */
let progress = 0;
const setProgress = (p: number): void => {
  progress = Math.max(progress, Math.min(1, p));
  ui.setProgress(progress);
};
// Texture loads (THREE.DefaultLoadingManager) cover the first ~80 %; build / compile / finalize the rest.
THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => setProgress((loaded / Math.max(1, total)) * 0.8);

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // SMAA in post
    powerPreference: 'high-performance',
    stencil: false,
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // tone mapping (AgX) happens in postprocessing
  renderer.shadowMap.enabled = true;
  // three r186 removed PCFSoftShadowMap (it warns and falls back); PCFShadowMap is the soft-filtered one now.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // static sun: rendered once after build (needsUpdate)
  renderer.info.autoReset = false; // several passes per frame: we reset manually to count the whole frame

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);

  const quality = new QualityController(parseQualityTier(search));
  const materials = createMaterialLibrary(renderer);
  const audio = createAudioEngine(camera);
  const postfx = new PostFX(renderer, scene, camera);
  const controls = new PlayerControls(camera, canvas, audio);

  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(quality.state.pixelRatio);
    postfx.setSize(w, h);
  };
  quality.onChange((q) => {
    postfx.setAOHalfRes(q.aoHalfRes);
    resize();
  });
  window.addEventListener('resize', resize);
  postfx.setAOHalfRes(quality.state.aoHalfRes);
  resize();

  if (camPreset) {
    controls.setEnabled(false);
    applyPreset(camera, camPreset);
  }

  const ctx: BuildContext = { renderer, scene, camera, materials, audio, quality: quality.state };

  // --- build all modules in parallel -------------------------------------------------------------
  const modules: WorldModule[] = await Promise.all([
    buildConcourse(ctx),
    buildProps(ctx),
    buildShed(ctx),
    buildSky(ctx),
    buildLighting(ctx),
    buildAtmosphere(ctx),
    buildTrains(ctx),
  ]);
  setProgress(0.85);
  for (const m of modules) scene.add(m.object);
  scene.updateMatrixWorld(true);
  await materials.ready;
  setProgress(0.9);
  await renderer.compileAsync(scene, camera);
  setProgress(0.95);

  // --- one-time finalize hooks (lighting: env capture etc.), sequential in module order -----------
  for (const m of modules) await m.finalize?.(ctx);
  // Guarantee: the static sun shadow map is rendered once, then never again (autoUpdate = false).
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  postfx.render(0); // also warms the post-processing programs
  setProgress(1);

  // --- loop ---------------------------------------------------------------------------------------
  const frame: FrameInfo = { dt: 0, time: 0, camera };
  let last = performance.now();
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 0;
  let frameMs = 0;
  let debugAccum = 0;

  const tick = (now: number): void => {
    requestAnimationFrame(tick);
    const rawDt = Math.max(0, (now - last) / 1000);
    last = now;
    const dt = Math.min(rawDt, 0.05);
    frame.dt = dt;
    frame.time += dt;

    controls.update(dt);
    for (const m of modules) m.update?.(frame);
    audio.update(frame);

    renderer.info.reset();
    postfx.render(dt);

    quality.sample(rawDt);

    fpsFrames++;
    fpsTime += rawDt;
    frameMs = frameMs === 0 ? rawDt * 1000 : frameMs + (rawDt * 1000 - frameMs) * 0.1;
    if (fpsTime >= 0.5) {
      fps = fpsFrames / fpsTime;
      fpsFrames = 0;
      fpsTime = 0;
    }
    const info = renderer.info;
    const meridian = window.__meridian;
    meridian.fps = fps;
    meridian.drawCalls = info.render.calls;
    meridian.triangles = info.render.triangles;

    debugAccum += rawDt;
    if (debugOn && debugAccum > 0.25) {
      debugAccum = 0;
      ui.updateDebug({
        fps,
        frameMs,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        pixelRatio: renderer.getPixelRatio(),
        tier: quality.state.fixed ? `${quality.state.tier} (fixed)` : `auto rung ${quality.state.level}`,
        textureMB: materials.estimatedTextureMB(),
      });
    }
  };
  requestAnimationFrame((t) => {
    last = t;
    tick(t);
  });
  window.__meridian.ready = true;

  // --- entering the experience ----------------------------------------------------------------------
  let entered = false;
  const resume = (): void => {
    controls.lock();
    void audio.start();
  };
  controls.pointer.addEventListener('lock', () => ui.showPause(false));
  controls.pointer.addEventListener('unlock', () => {
    if (entered && !camPreset) ui.showPause(true, resume);
  });
  document.addEventListener('pointerlockerror', () => {
    if (entered && !camPreset) ui.showPause(true, resume);
  });

  if (debugOn) ui.enableDebug();

  if (autostart) {
    ui.skipIntro();
    entered = true;
    if (!camPreset) ui.showPause(true, resume); // pointer lock needs a user gesture
  } else {
    ui.ready(() => {
      // Inside the click gesture: pointer lock must be requested synchronously.
      if (!camPreset) controls.lock();
      entered = true;
      void (async () => {
        try {
          await audio.start();
        } catch (e) {
          console.warn('audio.start() failed', e);
        }
        await ui.fadeIn();
      })();
    });
  }
}

boot().catch((e: unknown) => {
  console.error(e);
  ui.showError(`Failed to start: ${e instanceof Error ? e.message : String(e)}`);
});
