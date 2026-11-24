import * as THREE from 'three';
import { dayNight } from '../../metro/dayNight';
import type { MaterialLibrary } from '../../core/types';
import { TRENCH, VESPER, WATER_WALL, WATERFALL } from '../../layoutMetro';
import type { MetroMaterials } from './materials';
import { buildMist } from './waterfallMist';
import {
  ROCK_TEX, WF_GLSL, buildRockGeometry, createRockField, createRockMaterial, createRockTexture,
} from './waterfallRock';
import { buildWater } from './waterfallWater';

/**
 * The West Waterfall (cloud-forest pass; replaces the flat water wall of Phase 3 P3-7).
 *
 * A 38 m stratified, wet, mossy basalt face over the west wall (x = -60, z 54..94) with five cascades from notches in the top
 * lip, thin films between them, a foaming pool in the 2 m trough and soft rising mist. The rock leaves both Vesper bore
 * mouths clean (cut edges), and never exceeds x = -58.35.
 *
 * Budget: 4 draw calls (waterfallRock, waterfallWater, waterfallPool, waterfallMist).
 * Sorting: opaque rock and pool first; water renderOrder 0.1, mist 0.2 (both below PSD glass 2, glass floor 3, train glass 1).
 */

export interface WaterWallBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  /** Advance the animated water, pool and mist in REAL time (seconds). */
  update(realTimeSec: number): void;
}

export function buildWaterWall(_lib: MaterialLibrary, _kit: MetroMaterials): WaterWallBuild {
  const group = new THREE.Group();
  group.name = 'metroWaterWall';
  const uTime = { value: 0 };

  const field = createRockField();
  const water = buildWater(field, uTime);
  const rockTex = createRockTexture(field);

  // ---- 1. Rock ----
  const rock = createRockMaterial();
  const rockMesh = new THREE.Mesh(buildRockGeometry(field, water.wetAt), rock.material);
  rockMesh.name = 'waterfallRock';
  rockMesh.receiveShadow = true;
  rockMesh.userData.noShadow = true; // static shadow map would only add 100k triangles for centimetres of self-shadow
  group.add(rockMesh);

  // ---- 2. Water ----
  const waterMesh = new THREE.Mesh(water.geometry, water.material);
  waterMesh.name = 'waterfallWater';
  waterMesh.renderOrder = 0.1;
  waterMesh.userData.noShadow = true;
  waterMesh.frustumCulled = false;
  group.add(waterMesh);

  // ---- 3. Pool in the trough (x -60..-58.2), split around the two rail trenches ----
  const xA = WATER_WALL.x, xB = -58.2;
  let spans: Array<[number, number]> = [[WATER_WALL.zMin + 0.05, WATER_WALL.zMax - 0.05]];
  for (const tz of VESPER.trackZ) {
    const c0 = tz - TRENCH.halfWidth - 0.05, c1 = tz + TRENCH.halfWidth + 0.05;
    const next: Array<[number, number]> = [];
    for (const [a, b] of spans) {
      if (c1 <= a || c0 >= b) { next.push([a, b]); continue; }
      if (c0 > a + 0.2) next.push([a, c0]);
      if (c1 < b - 0.2) next.push([c1, b]);
    }
    spans = next;
  }
  const y = WATERFALL.poolY;
  const pp: number[] = [], pn: number[] = [], pi: number[] = [];
  for (const [za, zb] of spans) {
    const b = pp.length / 3;
    pp.push(xA, y, za, xA, y, zb, xB, y, zb, xB, y, za);
    for (let i = 0; i < 4; i++) pn.push(0, 1, 0);
    // (a, b, c): a->b runs +z, b->c runs +x: (0,0,1) x (1,0,0) = (0,1,0) up
    pi.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const poolGeo = new THREE.BufferGeometry();
  poolGeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  poolGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pn, 3));
  poolGeo.setIndex(pi);

  const impVecs = Array.from({ length: 5 }, () => new THREE.Vector4(0, 0, 0, 0));
  water.landings.slice(0, 5).forEach((l, i) => impVecs[i]!.set(l.z, l.x, l.strength, 0));

  const poolMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepWaterfallPool',
    color: 0x0b1a1f,
    roughness: 0.05,
    metalness: 0.0,
    envMapIntensity: 1.5,
  });
  poolMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uRock = { value: rockTex };
    shader.uniforms.uImp = { value: impVecs };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform sampler2D uRock;\nuniform vec4 uImp[5];\nvarying vec3 vPW;\n${WF_GLSL}`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        float plH = 0.0;
        float plChurn = 0.0;
        for (int i = 0; i < 5; i++) {
          vec2 d = vec2(vPW.x - uImp[i].y, vPW.z - uImp[i].x);
          float r = length(d) + 0.001;
          plH += sin(r * 9.0 - uTime * 3.4) * exp(-r * 0.75) * uImp[i].z * 0.12;
          plChurn += exp(-r * r * 0.5) * uImp[i].z;
        }
        plH += (wfNoise(vPW.xz * vec2(2.2, 1.6) + vec2(uTime * 0.35, -uTime * 0.2)) - 0.5) * 0.05;
        float plRx = texture2D(uRock, vec2((vPW.z - ${WATER_WALL.zMin.toFixed(1)}) / ${(WATER_WALL.zMax - WATER_WALL.zMin).toFixed(1)}, 0.012)).r * ${ROCK_TEX.scale.toFixed(2)};
        float plShore = 1.0 - smoothstep(0.0, 0.8, vPW.x - (${WATER_WALL.x.toFixed(1)} + plRx));
        float plN = wfNoise(vPW.xz * vec2(5.0, 4.0) + vec2(-uTime * 0.9, uTime * 0.4));
        float plFoam = clamp((plShore * 0.5 + plChurn * 0.55) * (0.45 + 0.9 * plN), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.95, 1.0), plFoam);
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.04, 0.5, plFoam);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.5, 0.6, 0.7) * plFoam * 0.3;')
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        normal = wfPerturb(-vViewPosition, normal, vec2(dFdx(plH), dFdy(plH)) * 2.5, faceDirection);
      `);
  };
  const poolKey = poolMat.customProgramCacheKey.bind(poolMat);
  poolMat.customProgramCacheKey = () => `${poolKey()}|waterfallPool`;
  const poolMesh = new THREE.Mesh(poolGeo, poolMat);
  poolMesh.name = 'waterfallPool';
  poolMesh.userData.noShadow = true;
  group.add(poolMesh);

  // ---- 4. Mist ----
  const mist = buildMist(uTime, rockTex);
  const mistMesh = new THREE.Mesh(mist.geometry, mist.material);
  mistMesh.name = 'waterfallMist';
  mistMesh.renderOrder = 0.2;
  mistMesh.frustumCulled = false;
  mistMesh.userData.noShadow = true;
  mistMesh.userData.noCapture = true; // keep the env-map capture free of billboards
  group.add(mistMesh);

  return {
    group,
    // MeshBasicMaterial mist is not a standard material (DepthLook only assigns env maps to standard ones), so it is not listed.
    deepMaterials: [rock.material, water.material, poolMat],
    update(realTimeSec: number): void {
      uTime.value = realTimeSec;
      // Unlit mist billboards follow the light level (day/night): white by day, warm at golden hour, a faint veil at night.
      const dn = dayNight.state;
      const k = 1 - 0.9 * dn.night;
      (mistMesh.material as THREE.MeshBasicMaterial).color.setRGB(k * (1 + 0.15 * dn.golden), k, k * (1 - 0.15 * dn.golden));
    },
  };
}
