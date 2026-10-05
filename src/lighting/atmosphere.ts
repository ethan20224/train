import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { CONCOURSE, FOG, SHED } from '../layout';
import { HAZE_COLOR, SUN_COLOR, sunShadowTexture, lookShared } from './shared';

/**
 * Atmosphere: warm FogExp2 + sunlit dust. The volumetric god rays themselves are a half-resolution ray-march pass
 * that lives in the post chain (lighting/godrays.ts, wired from core/postfx.ts) because it needs the scene depth
 * and the sun's shadow map; both this module and that pass read the SAME shadow map, so shafts, dust and the sun
 * pools on the floor are guaranteed to line up (windows, mullions, columns and roof glazing all carve the light).
 *
 * Dust: ~40k GPU points in one draw call, drifting on slow curl-like noise. Each mote asks the sun shadow map
 * whether it is in direct light and only glows then, so the air is visibly dusty only inside the sun shafts.
 */

const CONCOURSE_DUST = 34000;
const SHED_DUST = 8000;

export async function buildAtmosphere(ctx: BuildContext): Promise<WorldModule> {
  // Fog colour is HDR (components may exceed 1) and identical to the sky horizon so distance dissolves into sky.
  ctx.scene.fog = new THREE.FogExp2(HAZE_COLOR.getHex(), FOG.density);
  (ctx.scene.fog as THREE.FogExp2).color.copy(HAZE_COLOR);
  ctx.scene.background = HAZE_COLOR.clone();

  const count = CONCOURSE_DUST + SHED_DUST;
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 4);
  // Deterministic LCG so every load is identical.
  let seed = 1337;
  const r = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const boxMin = new THREE.Vector3(CONCOURSE.xMin + 0.5, 0.4, CONCOURSE.zMin + 0.5);
  const boxMax = new THREE.Vector3(CONCOURSE.xMax - 0.5, 46, SHED.zMin + 150);
  for (let i = 0; i < count; i++) {
    const shed = i >= CONCOURSE_DUST;
    pos[i * 3] = THREE.MathUtils.lerp(boxMin.x, boxMax.x, r());
    pos[i * 3 + 1] = THREE.MathUtils.lerp(boxMin.y, shed ? 24 : boxMax.y, r() ** 1.35);
    pos[i * 3 + 2] = shed
      ? THREE.MathUtils.lerp(SHED.zMin + 2, boxMax.z, r())
      : THREE.MathUtils.lerp(boxMin.z, CONCOURSE.zMax - 0.5, r());
    for (let k = 0; k < 4; k++) rnd[i * 4 + k] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, 120), 400);

  const u = {
    uTime: { value: 0 },
    uShadow: { value: null as THREE.Texture | null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uPixelScale: { value: 800 },
    uFogDensity: { value: FOG.density },
    uSunColor: { value: SUN_COLOR.clone().lerp(new THREE.Color(1, 0.9, 0.7), 0.4) },
    uOn: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
    uniforms: u,
    vertexShader: /* glsl */ `
      attribute vec4 aRand;
      uniform float uTime; uniform sampler2DShadow uShadow; uniform mat4 uShadowMatrix;
      uniform float uPixelScale; uniform float uFogDensity; uniform float uOn;
      varying float vLight; varying float vFade;
      const vec3 BMIN = vec3(${(CONCOURSE.xMin + 0.5).toFixed(1)}, 0.4, ${(CONCOURSE.zMin + 0.5).toFixed(1)});
      const vec3 BMAX = vec3(${(CONCOURSE.xMax - 0.5).toFixed(1)}, 46.0, ${(SHED.zMin + 150).toFixed(1)});
      void main() {
        float t = uTime;
        vec3 p = position;
        // Slow global drift (a faint draught toward +x/+z) wrapped inside the volume, plus per-mote wander.
        vec3 span = BMAX - BMIN;
        p = BMIN + mod(p - BMIN + vec3(0.11, 0.015, 0.07) * t * (0.6 + aRand.w), span);
        // Curl-ish swirl: low-frequency divergence-free-looking field + individual wobble.
        vec3 sw = vec3(
          sin(p.y * 0.31 + t * 0.13 + aRand.x * 6.28) + 0.5 * sin(p.z * 0.57 - t * 0.09),
          0.35 * sin(p.x * 0.23 + t * 0.11 + aRand.y * 6.28),
          sin(p.x * 0.27 - t * 0.12 + aRand.z * 6.28) + 0.5 * sin(p.y * 0.43 + t * 0.08));
        p += sw * (0.55 + aRand.w * 0.6);
        p.y += 0.25 * sin(t * (0.3 + aRand.w * 0.5) + aRand.x * 40.0);

        vec4 sc = uShadowMatrix * vec4(p, 1.0);
        vec3 s = sc.xyz / sc.w;
        float inMap = step(0.0, s.x) * step(s.x, 1.0) * step(0.0, s.y) * step(s.y, 1.0);
        float lit = texture(uShadow, vec3(s.xy, s.z - 0.00035)) * inMap;

        vec4 mv = viewMatrix * vec4(p, 1.0);
        float dist = max(-mv.z, 0.01);
        float raw = (0.035 + aRand.y * 0.05) * uPixelScale / dist;
        float size = clamp(raw, 1.7, 6.0);
        gl_PointSize = size;
        // Scintillation: motes catch the light and dim again, slowly.
        float tw = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(t * (0.4 + aRand.z * 1.3) + aRand.x * 50.0), 3.0);
        float coverage = min(1.0, (raw * raw) / (1.7 * 1.7)) * 0.85 + 0.15;
        vFade = coverage * exp(-dist * dist * uFogDensity * uFogDensity) * smoothstep(0.6, 3.0, dist) * uOn;
        vLight = (0.012 + lit * 1.0) * tw;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunColor;
      varying float vLight; varying float vFade;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c) * 4.0;
        float a = exp(-d * 3.2) * (1.0 - smoothstep(0.85, 1.0, d));
        vec3 col = uSunColor * vLight * 3.2;
        gl_FragColor = vec4(col, a * vFade);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'dust';
  points.frustumCulled = false;
  points.renderOrder = 10;
  points.userData.noCapture = true;
  points.visible = false; // until the sun shadow map exists (sampler2DShadow needs a depth texture bound)
  points.userData.noShadow = true;

  const group = new THREE.Group();
  group.name = 'atmosphere';
  group.add(points);

  const size = new THREE.Vector2();
  return {
    name: 'atmosphere',
    object: group,
    update(f): void {
      u.uTime.value = f.time;
      const tex = sunShadowTexture();
      if (tex && lookShared.sun) {
        u.uShadow.value = tex;
        u.uShadowMatrix.value.copy(lookShared.sun.shadow.matrix);
        u.uOn.value = 1;
        points.visible = true;
      }
      ctx.renderer.getDrawingBufferSize(size);
      u.uPixelScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(f.camera.fov) / 2));
    },
  };
}
