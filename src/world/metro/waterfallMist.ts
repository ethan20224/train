import * as THREE from 'three';
import { WATER_WALL, WATERFALL } from '../../layoutMetro';
import { ROCK_TEX, WF_GLSL } from './waterfallRock';
import { VESPER } from '../../layoutMetro';

/**
 * Cloud-forest mist rising from the pool: a few dozen large soft quads in ONE draw call, billboarded about the vertical axis
 * (leaning toward the wall plane so they never swing out over the walkable floor). All softness is analytic, because there is
 * no scene depth texture: the quads fade where the rock (lookup texture), the floor edge (x = -58.2), the bore mouths and the
 * camera are close, so they never show a hard intersection or read as sprite cards.
 */

export interface MistBuild { geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial }

export function buildMist(uTime: { value: number }, rockTex: THREE.Texture): MistBuild {
  let s = 90210;
  const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };

  interface Q { z: number; y: number; x: number; hw: number; hh: number; seed: number }
  const qs: Q[] = [];
  const N = 26;
  for (let i = 0; i < N; i++) {
    qs.push({
      z: WATER_WALL.zMin + 1 + ((i + 0.5) / N) * (WATER_WALL.zMax - WATER_WALL.zMin - 2) + (rnd() - 0.5) * 1.6,
      y: -68.2 + rnd() * 5.5, x: -59.15 + rnd() * 0.2,
      hw: 3.0 + rnd() * 3.2, hh: 3.2 + rnd() * 3.6, seed: rnd(),
    });
  }
  // denser banks where the big falls land
  for (const c of WATERFALL.cascades) {
    if (c.w < 2) continue;
    const hero = c.w > 4;
    for (let k = 0; k < (hero ? 5 : 2); k++) {
      qs.push({
        z: c.z + (rnd() - 0.5) * c.w * (hero ? 1.6 : 1), y: hero ? -66.5 + rnd() * 3 : -67.5 + rnd() * 3.5, x: -59.2 + rnd() * 0.15,
        hw: 2.8 + rnd() * 2.2, hh: hero ? 5.5 + rnd() * 3.5 : 3.5 + rnd() * 3, seed: rnd(),
      });
    }
  }

  const pos = new Float32Array(qs.length * 4 * 3);
  const ctr = new Float32Array(qs.length * 4 * 3);
  const size = new Float32Array(qs.length * 4 * 2);
  const seed = new Float32Array(qs.length * 4);
  const idx: number[] = [];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  qs.forEach((q, i) => {
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      pos[v * 3] = corners[c]![0]; pos[v * 3 + 1] = corners[c]![1]; pos[v * 3 + 2] = 0;
      ctr[v * 3] = q.x; ctr[v * 3 + 1] = q.y; ctr[v * 3 + 2] = q.z;
      size[v * 2] = q.hw; size[v * 2 + 1] = q.hh;
      seed[v] = q.seed;
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aCenter', new THREE.BufferAttribute(ctr, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 2));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.setIndex(idx);

  const material = new THREE.MeshBasicMaterial({
    name: 'metroDeepWaterfallMist',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uRock = { value: rockTex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aCenter;\nattribute vec2 aSize;\nattribute float aSeed;\nvarying vec2 vMuv;\nvarying vec3 vMW;\nvarying float vMS;')
      .replace('#include <project_vertex>', /* glsl */`
        vec3 mc = aCenter;
        mc.z += sin(uTime * 0.07 + aSeed * 6.283) * 1.2;
        mc.y += sin(uTime * 0.05 + aSeed * 11.0) * 0.5;
        vec3 toCam = cameraPosition - mc;
        toCam.y = 0.0;
        vec3 mf = normalize(mix(vec3(1.0, 0.0, 0.0), normalize(toCam), 0.4));
        vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), mf));
        vec3 wp = mc + mr * position.x * aSize.x + vec3(0.0, 1.0, 0.0) * position.y * aSize.y;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vMuv = position.xy;
        vMW = wp;
        vMS = aSeed;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform sampler2D uRock;\nvarying vec2 vMuv;\nvarying vec3 vMW;\nvarying float vMS;\n${WF_GLSL}`)
      .replace('#include <color_fragment>', /* glsl */`
        {
          float mr = length(vMuv);
          float soft = pow(1.0 - smoothstep(0.1, 1.0, mr), 1.5);
          vec2 mp = vec2(vMW.z * 0.23 + vMS * 9.0 + uTime * 0.03, vMW.y * 0.2 - uTime * 0.2);
          float mn = wfNoise(mp) * 0.78 + wfNoise(mp * 2.3 + 5.0) * 0.22;
          float dens = smoothstep(-71.8, -69.2, vMW.y) * (1.0 - smoothstep(-64.5, -55.0, vMW.y));
          float rx = texture2D(uRock, vec2((vMW.z - ${WATER_WALL.zMin.toFixed(1)}) / ${(WATER_WALL.zMax - WATER_WALL.zMin).toFixed(1)}, (vMW.y - (${WATERFALL.yBase.toFixed(1)})) / ${(ROCK_TEX.yMax - WATERFALL.yBase).toFixed(1)})).r * ${ROCK_TEX.scale.toFixed(2)};
          float fRock = smoothstep(0.05, 0.85, vMW.x - (${WATER_WALL.x.toFixed(1)} + rx));
          float fX = 1.0 - smoothstep(-58.9, -58.25, vMW.x);
          float fCam = smoothstep(2.0, 8.0, distance(cameraPosition, vMW));
          float bm = max(smoothstep(3.4, 2.4, abs(vMW.z - ${VESPER.trackZ[0].toFixed(2)})), smoothstep(3.4, 2.4, abs(vMW.z - ${VESPER.trackZ[1].toFixed(2)})));
          bm *= 1.0 - smoothstep(-66.5, -64.5, vMW.y);
          float ma = soft * smoothstep(0.12, 0.85, mn) * 0.36 * dens * fRock * fX * fCam * (1.0 - 0.6 * bm);
          diffuseColor = vec4(mix(vec3(0.56, 0.66, 0.76), vec3(0.86, 0.92, 0.98), mn) * diffuse, ma);
        }
      `);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|waterfallMist`;
  return { geometry, material };
}
