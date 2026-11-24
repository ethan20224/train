import * as THREE from 'three';
import { forestGroundY } from '../../metro/forestGround';
import { newWaterField, pondWorld, streamSamples, waterField, waterRegion, type WetStone } from '../../metro/streamPlan';
import { patchForest } from './forest';
import { WF_GLSL } from './waterfallRock';

/**
 * The water of the stream and the koi pond: ONE transparent mesh (a 0.45 m grid kept where the water edge is near) shaded by a
 * baked flow map, so the stream and pond are seamless and the shoreline is exact whatever the terrain mesh does.
 *
 * Flow map (RGBA8, 0.08 m texels over the water region): R,G = flow (m/s, +-0.8), B = foam (riffles, stone wakes, rings around
 * stones), A = water depth / 0.2 m. The fragment shader scrolls two-phase flow-mapped ripples along it (stream) or slow calm ripples
 * with rare rings (pond); paints a pebble bed with caustics in the shallows that darkens to deep green-black with depth (the pond
 * reads deep although the base-floor slab keeps it shallow); reflects the deep env map through the standard fresnel (the env
 * intensity already follows day/night); foam whitens and roughens. Night: the lights and the env fade by themselves.
 * Chained onto patchForest so the ground mist and the world-height anchors match the forest.
 */

/** Shared with the stone / koi / lily shaders: bump normals from a height in metres (Mikkelsen, un-normalised so slopes are true). */
export const STREAM_GLSL = /* glsl */ `
vec3 strBump(vec3 surfPos, vec3 N, float dHdx, float dHdy, float faceDirection) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, N), r2 = cross(N, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dHdx * r1 + dHdy * r2);
  return normalize(abs(det) * N - grad);
}`;

/** Instanced meshes: forest.ts patchForest derives the mist world position from the geometry only; make it follow the instance. */
export function followInstance(sh: { vertexShader: string }): void {
  const from = 'vForestWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;';
  if (!sh.vertexShader.includes(from)) throw new Error('stream: patchForest world-position anchor changed (forest.ts)');
  sh.vertexShader = sh.vertexShader.replace(from, 'vForestWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
}

const CELL = 0.45;
const TEXEL = 0.08;
/** The pool's east edge is x = -58.2 (waterWall.ts); the stream's water starts a little inside it and blends in. */
const X_START = -58.4;

export interface StreamWaterBuild {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  triangles: number;
  update(t: number): void;
}

export function buildStreamWater(wet: readonly WetStone[]): StreamWaterBuild {
  const reg = waterRegion();
  const x0 = Math.max(reg.x0, X_START), z0 = reg.z0;
  const nx = Math.ceil((reg.x1 - x0) / CELL), nz = Math.ceil((reg.z1 - z0) / CELL);
  const F = newWaterField();

  // ---- grid vertices, kept cells ----
  const vx = nx + 1, vz = nz + 1;
  const sdg = new Float32Array(vx * vz), pondg = new Float32Array(vx * vz), levg = new Float32Array(vx * vz);
  for (let j = 0; j < vz; j++) {
    for (let i = 0; i < vx; i++) {
      waterField(x0 + i * CELL, z0 + j * CELL, F);
      const k = j * vx + i;
      sdg[k] = F.sd; pondg[k] = F.pondW; levg[k] = F.level;
    }
  }
  const keep = new Uint8Array(nx * nz);
  const remap = new Int32Array(vx * vz).fill(-1);
  const pos: number[] = [], pond: number[] = [], idx: number[] = [];
  const vert = (i: number, j: number): number => {
    const k = j * vx + i;
    let r = remap[k]!;
    if (r < 0) {
      r = pos.length / 3;
      remap[k] = r;
      pos.push(x0 + i * CELL, levg[k]! + 0.003, z0 + j * CELL);
      pond.push(pondg[k]!);
    }
    return r;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * vx + i;
      const m = Math.min(sdg[a]!, sdg[a + 1]!, sdg[a + vx]!, sdg[a + vx + 1]!);
      if (m > 0.35) continue;
      keep[j * nx + i] = 1;
      const p00 = vert(i, j), p10 = vert(i + 1, j), p01 = vert(i, j + 1), p11 = vert(i + 1, j + 1);
      // (z up the grid, x along): (p00 -> p01 is +z, p01 -> p11 is +x) -> up
      idx.push(p00, p01, p11, p00, p11, p10);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aPond', new THREE.Float32BufferAttribute(pond, 1));
  const nrm: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  // ---- flow map ----
  const W = Math.ceil((reg.x1 - x0) / TEXEL), H = Math.ceil((reg.z1 - z0) / TEXEL);
  const data = new Uint8Array(W * H * 4);
  const ratio = CELL / TEXEL;
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
  for (let tj = 0; tj < H; tj++) {
    const z = z0 + (tj + 0.5) * TEXEL;
    const cj = Math.min(nz - 1, Math.floor(tj / ratio));
    for (let ti = 0; ti < W; ti++) {
      const ci = Math.min(nx - 1, Math.floor(ti / ratio));
      if (!keep[cj * nx + ci]) continue;
      const x = x0 + (ti + 0.5) * TEXEL;
      waterField(x, z, F);
      if (F.sd > 0.1) continue;
      const depth = F.level - forestGroundY(x, z);
      if (depth <= 0) continue;
      // flow: along the tangent, slower at the banks and into the pond
      const dCentre = F.sdStream + F.hw;
      const edge = clamp01(dCentre / F.hw);
      const sp = F.speed * (1 - 0.6 * edge * edge) * (1 - 0.9 * F.pondW);
      let foam = 0;
      // riffles: foam over the drop, strongest mid-channel
      foam += riffleFoam(F.s) * (1 - F.pondW) * (0.55 + 0.45 * (1 - edge));
      for (let k = 0; k < wet.length; k++) {
        const w = wet[k]!;
        const dx = x - w.x, dz = z - w.z;
        if (dx > 3.2 || dx < -3.2 || dz > 3.2 || dz < -3.2) continue;
        const d = Math.hypot(dx, dz);
        const ring = Math.exp(-(((d - w.r) / (w.r * 0.45 + 0.03)) ** 2));
        foam += ring * (w.strong ? 0.7 : 0.25);
        if (w.strong && F.pondW < 0.6) {
          const a = dx * F.tx + dz * F.tz, l = -dx * F.tz + dz * F.tx;
          if (a > -w.r * 0.3) foam += 0.75 * Math.exp(-((l / (w.r * 1.15)) ** 2)) * Math.exp(-Math.max(0, a) / (w.r * 4.5)) * (1 - F.pondW);
        }
      }
      // thin foam lace right at the waterline
      foam += 0.18 * (1 - clamp01(depth / 0.02));
      const o = (tj * W + ti) * 4;
      data[o] = Math.round(clamp01(0.5 + 0.5 * (F.tx * sp) / 0.8) * 255);
      data[o + 1] = Math.round(clamp01(0.5 + 0.5 * (F.tz * sp) / 0.8) * 255);
      data[o + 2] = Math.round(clamp01(foam) * 255);
      data[o + 3] = Math.round(clamp01(depth / 0.2) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  // ---- material ----
  const uTime = { value: 0 };
  const rings = Array.from({ length: 3 }, () => new THREE.Vector4());
  const ringSpec: Array<[number, number, number, number]> = [[-1.2, 0.9, 6.1, 0.0], [0.5, -1.1, 8.3, 3.1], [-2.6, -0.5, 11.0, 6.4]];
  ringSpec.forEach(([u, v, period, phase], i) => {
    const [rx, rz] = pondWorld(u, v);
    rings[i]!.set(rx, rz, period, phase);
  });
  const mat = new THREE.MeshStandardMaterial({
    name: 'metroDeepStreamWater', color: 0xffffff, roughness: 0.035, metalness: 0, envMapIntensity: 1.25,
    transparent: true, depthWrite: false,
  });
  patchForest(mat, 'streamWater', {});
  const base = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.uniforms.uTime = uTime;
    sh.uniforms.uMap = { value: tex };
    sh.uniforms.uMapRect = { value: new THREE.Vector4(x0, z0, W * TEXEL, H * TEXEL) };
    sh.uniforms.uRings = { value: rings };
    sh.uniforms.uPondAlpha = { value: 0.66 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPond;\nvarying float vPond;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPond = aPond;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
uniform float uTime; uniform sampler2D uMap; uniform vec4 uMapRect; uniform vec4 uRings[3]; uniform float uPondAlpha;
varying float vPond;
${WF_GLSL}
${STREAM_GLSL}
float wRipple(vec2 q, vec2 dir) {
  vec2 s = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x))) * vec2(0.6, 1.0);
  return wfNoise(s * vec2(3.0, 5.0)) * 0.5 + wfNoise(s * vec2(7.5, 12.0) + 4.0) * 0.3 + wfNoise(s * vec2(16.0, 26.0) + 9.0) * 0.2;
}
vec3 wVoro(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(wfHash(i + g), wfHash(i + g + 19.7));
    float d = length(g + o * 0.85 + 0.075 - f);
    if (d < d1) { d2 = d1; d1 = d; id = wfHash(i + g + 3.3); } else if (d < d2) d2 = d;
  }
  return vec3(d1, d2, id);
}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
vec2 wp = vForestWorld.xz;
vec4 wm = texture2D(uMap, (wp - uMapRect.xy) / uMapRect.zw);
float wDepth = wm.a * 0.2;
if (wDepth < 0.002) discard;
float wPond = clamp(vPond, 0.0, 1.0);
vec2 wFlow = (wm.rg * 2.0 - 1.0) * 0.8;
float wSp = length(wFlow);
vec2 wDir = wSp > 0.004 ? wFlow / wSp : vec2(1.0, 0.0);
// two-phase flow-mapped ripples (stream) / slow drifting ripples (pond)
float wT = uTime * 0.8;
float wP0 = fract(wT), wP1 = fract(wT + 0.5);
float wW0 = 1.0 - abs(1.0 - 2.0 * wP0);
vec2 wDrift = vec2(uTime * 0.018, uTime * 0.012) * wPond;
float wH = mix(wRipple(wp - wFlow * wP1 * 1.25 + 0.37 + wDrift, wDir), wRipple(wp - wFlow * wP0 * 1.25 + wDrift, wDir), wW0);
float wAmp = mix(0.0065, 0.0011, wPond) * (0.4 + 0.6 * smoothstep(0.0, 0.05, wDepth));
float wHeight = (wH - 0.5) * wAmp;
// rare slow rings in the pond (a surfacing koi, a falling leaf)
for (int k = 0; k < 3; k++) {
  vec4 rg = uRings[k];
  float age = mod(uTime + rg.w, rg.z);
  float r0 = length(wp - rg.xy);
  float front = 0.28 * age;
  float env = exp(-pow((r0 - front) * 2.6, 2.0)) * exp(-age * 0.55) * smoothstep(0.0, 0.5, age);
  wHeight += sin((r0 - front) * 14.0) * env * 0.0016 * wPond;
}
// pebble bed seen through the shallows (refraction wobble, caustics), moss-dark and deep in the pond
vec2 wWob = (vec2(wfNoise(wp * 2.3 + uTime * 0.21), wfNoise(wp * 2.3 + 7.0 - uTime * 0.17)) - 0.5) * 0.09;
vec3 wV = wVoro(wp * 6.5 + wWob);
float wIdh = fract(wV.z * 4.0);
vec3 wBed = wIdh < 0.25 ? vec3(0.34, 0.33, 0.28) : (wIdh < 0.5 ? vec3(0.21, 0.23, 0.2) : (wIdh < 0.75 ? vec3(0.4, 0.32, 0.21) : vec3(0.2, 0.26, 0.15)));
wBed *= 0.6 + 0.6 * wV.z;
wBed *= 0.4 + 0.6 * smoothstep(0.0, 0.14, wV.y - wV.x);
float wCau = pow(1.0 - abs(wfNoise(wp * 5.0 + vec2(uTime * 0.3, uTime * 0.22)) - wfNoise(wp * 6.5 + 11.0 - vec2(uTime * 0.25, uTime * 0.33))), 7.0);
wBed *= 0.7 + 1.3 * wCau * (1.0 - wPond) * (1.0 - smoothstep(0.04, 0.2, wDepth));
wBed = mix(wBed, vec3(0.03, 0.055, 0.03), wPond * 0.75);
float wDeep = mix(smoothstep(0.0, 0.17, wDepth) * 0.72, 0.62 + 0.36 * smoothstep(0.0, 0.1, wDepth), wPond);
vec3 wTint = mix(vec3(0.03, 0.08, 0.066), vec3(0.006, 0.02, 0.018), wPond);
diffuseColor.rgb = mix(wBed, wTint, wDeep);
// foam: advected streaks along the flow
vec2 wQ0 = wp - wFlow * wP0 * 1.25, wQ1 = wp - wFlow * wP1 * 1.25 + 5.1;
float wS0 = wfNoise(vec2(dot(wQ0, wDir) * 5.0, dot(wQ0, vec2(-wDir.y, wDir.x)) * 17.0)) * 0.6 + wfNoise(wQ0 * 31.0) * 0.4;
float wS1 = wfNoise(vec2(dot(wQ1, wDir) * 5.0, dot(wQ1, vec2(-wDir.y, wDir.x)) * 17.0)) * 0.6 + wfNoise(wQ1 * 31.0) * 0.4;
float wFoam = clamp(wm.b * (0.2 + 1.35 * mix(wS1, wS0, wW0)), 0.0, 1.0);
wFoam = smoothstep(0.22, 0.75, wFoam);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.92, 0.93), wFoam);
float wInlet = smoothstep(${X_START.toFixed(2)}, ${(X_START + 0.7).toFixed(2)}, wp.x);
diffuseColor.a = smoothstep(0.0, 0.03, wDepth) * mix(0.96, uPondAlpha, wPond) * wInlet;
diffuseColor.a = mix(diffuseColor.a, wInlet, wFoam);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.035, 0.62, wFoam);')
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
normal = strBump(-vViewPosition, normal, dFdx(wHeight), dFdy(wHeight), faceDirection);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * wFoam * 0.12;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'streamWater';
  mesh.renderOrder = 0.12;
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  mesh.userData.noCapture = true;
  return { mesh, material: mat, triangles: idx.length / 3, update: (t) => { uTime.value = t; } };
}

/** Foam weight of the riffle drops at arc length s (precomputed from the plan's riffle sites). */
function riffleFoam(s: number): number {
  let f = 0;
  for (const sr of streamSamples().riffleS) f += Math.exp(-(((s - sr) / 0.75) ** 2));
  return Math.min(1, f) * 0.85;
}
