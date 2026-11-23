import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { CAVERN, PORTAL, SHELL, TRENCH, VESPER, WATER_WALL } from '../../layoutMetro';
import { GeoBag, boxMM } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * The West Water Wall (spec §2.6, §4; Phase 3 task P3-7).
 *
 * A silent, calm, 36 m tall sheet of water accelerating downward over the west polished black granite wall
 * (x = -60, z = 54..94, y = -72.28..-34.0), parting cleanly around both Vesper west portals with delicate
 * edge rivulets, catching a razor-bright specular top weir glint and pooling into a narrow brushed-stainless
 * foot trough with a subtle animated splash band (no particles).
 *
 * Budget: 3 draw calls (waterWallSheet, waterWallHardware, waterWallTroughPool).
 */

export interface WaterWallBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  /** Update animated normal field and splash ripples in REAL time (seconds). */
  update(realTimeSec: number): void;
}

interface Rect2 { z0: number; z1: number; y0: number; y1: number }

function subtractRects(base: Rect2, cuts: readonly Rect2[]): Rect2[] {
  let rects: Rect2[] = [base];
  const EPS = 1e-4;
  for (const c of cuts) {
    const next: Rect2[] = [];
    for (const r of rects) {
      if (c.z1 <= r.z0 + EPS || c.z0 >= r.z1 - EPS || c.y1 <= r.y0 + EPS || c.y0 >= r.y1 - EPS) {
        next.push(r);
        continue;
      }
      const cz0 = Math.max(r.z0, c.z0), cz1 = Math.min(r.z1, c.z1);
      const cy0 = Math.max(r.y0, c.y0), cy1 = Math.min(r.y1, c.y1);
      if (cz0 > r.z0 + EPS) next.push({ z0: r.z0, z1: cz0, y0: r.y0, y1: r.y1 });
      if (cz1 < r.z1 - EPS) next.push({ z0: cz1, z1: r.z1, y0: r.y0, y1: r.y1 });
      if (cy0 > r.y0 + EPS) next.push({ z0: cz0, z1: cz1, y0: r.y0, y1: cy0 });
      if (cy1 < r.y1 - EPS) next.push({ z0: cz0, z1: cz1, y0: cy1, y1: r.y1 });
    }
    rects = next;
  }
  return rects.filter((r) => r.z1 - r.z0 > 0.02 && r.y1 - r.y0 > 0.02);
}

/** Subdivided plane on x = xPlane facing +x, storing exact world (z, y) for distortion-free procedural ripples. */
function verticalSheetQuad(xPlane: number, z0: number, z1: number, y0: number, y1: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Normal faces +x: (z0,y0) -> (z0,y1) -> (z1,y1) has (0,1,0)x(0,0,1) = (+1,0,0)
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    xPlane, y0, z0, xPlane, y1, z0, xPlane, y1, z1,
    xPlane, y0, z0, xPlane, y1, z1, xPlane, y0, z1,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([
    1, 0, 0, 1, 0, 0, 1, 0, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([
    z0, y0, z0, y1, z1, y1,
    z0, y0, z1, y1, z1, y0,
  ], 2));
  return g;
}

export function buildWaterWall(lib: MaterialLibrary, _kit: MetroMaterials): WaterWallBuild {
  const group = new THREE.Group();
  group.name = 'metroWaterWall';

  const xWall = WATER_WALL.x;           // -60
  const xSheet = xWall + 0.036;         // 36 mm proud of black granite -> zero z-fighting at any distance
  const zMin = WATER_WALL.zMin + 0.04;  // 54.04
  const zMax = WATER_WALL.zMax - 0.04;  // 93.96
  const yTop = WATER_WALL.yMax;         // -34.0
  const yPool = CAVERN.baseFloorY + 0.24; // -72.26 (water surface inside foot trough)

  const boreBedY = VESPER.railY - PORTAL.bedBelowRail; // -71.7
  const boreTopY = boreBedY + PORTAL.h;                // -66.2
  const boreHalfW = PORTAL.w / 2;                      // 2.5
  const pad = SHELL.openingRevealGap + 0.045;          // clear outside the 0.30 m stainless portal reveal frame

  // Geometry cut cleanly around both Vesper west portals all the way down to the trough floor
  const portalCuts: Rect2[] = VESPER.trackZ.map((tz) => ({
    z0: tz - boreHalfW - pad,
    z1: tz + boreHalfW + pad,
    y0: yPool - 0.1,
    y1: boreTopY + pad,
  }));

  // ---- 1. Falling water sheet (animated procedural normal field via onBeforeCompile, real time) ----
  const sheetPieces = subtractRects({ z0: zMin, z1: zMax, y0: yPool, y1: yTop }, portalCuts);
  const sheetGeos = sheetPieces.map((r) => verticalSheetQuad(xSheet, r.z0, r.z1, r.y0, r.y1));
  const sheetGeo = mergeGeometries(sheetGeos, false)!;
  for (const g of sheetGeos) g.dispose();

  const uTime = { value: 0 };
  const sheetMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepWaterWallSheet',
    color: 0x0b0f15,       // deep glossy black granite seen through thin clear water film
    roughness: 0.05,
    metalness: 0.14,
    envMapIntensity: 2.25, // vivid Fresnel-modulated reflection of the cavern, sky & bridge coves
  });

  const pz0 = VESPER.trackZ[0] - boreHalfW - pad;
  const pz1 = VESPER.trackZ[0] + boreHalfW + pad;
  const pz2 = VESPER.trackZ[1] - boreHalfW - pad;
  const pz3 = VESPER.trackZ[1] + boreHalfW + pad;

  sheetMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        uniform float uTime;
        varying vec3 vWaterWorld;

        float wwHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float wwNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          // Quintic C2 interpolation so finite-difference normals are silky-smooth (zero faceted noise chatter)
          vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          return mix(
            mix(wwHash(i), wwHash(i + vec2(1.0, 0.0)), u.x),
            mix(wwHash(i + vec2(0.0, 1.0)), wwHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        // Physical falling-sheet height field: calm laminar museum water curtain accelerating smoothly downward
        // under gravity, with broad undulating vertical flutes, gliding horizontal wave bands, and edge rivulets.
        float wwField(vec2 zy, float t, out float streakMask, out float rivuletMask) {
          float z = zy.x;
          float y = zy.y;
          float drop = max(0.0, ${(yTop).toFixed(2)} - y); // 0 at top weir -> 38.26 at trough
          // Non-linear gravity travel coordinate: waves stretch and accelerate downward smoothly
          float tau = pow(drop + 0.85, 0.72) * 1.18;

          // Gentle smooth lateral drift of broad vertical water sheets
          float wander = (wwNoise(vec2(z * 0.16, drop * 0.05 - t * 0.10)) - 0.5) * 0.45;
          float zw = z + wander;

          // 1. Broad calm vertical sheet thickness curtains (smooth glassy flutes)
          float fluteA = wwNoise(vec2(zw * 0.65, tau * 0.24 - t * 0.42));
          float fluteB = wwNoise(vec2(zw * 1.45 + 11.7, tau * 0.48 - t * 0.88));
          // 2. Gliding horizontal gravity-wave trains travelling downward at incommensurate speeds (never scrolls rigidly)
          float waveA = wwNoise(vec2(zw * 0.42 + fluteA * 0.6, tau * 1.05 - t * 1.55));
          float waveB = wwNoise(vec2(zw * 1.15 - fluteB * 0.5, tau * 1.75 - t * 2.35));
          // 3. Delicate fine silk sheen streaks (elongated vertically along flow)
          float silk = wwNoise(vec2(zw * 3.2 + 5.1, tau * 0.55 - t * 1.18));

          float turb = smoothstep(0.0, 2.8, drop);
          float h = (fluteA * 0.36 + fluteB * 0.22 + waveA * 0.24 + waveB * 0.12 + silk * 0.06) * (0.22 + 0.78 * turb);

          // Concentrated gleaming edge rivulets flanking both Vesper west portals (below y = -66.1)
          float belowCanopy = smoothstep(${(boreTopY + 0.35).toFixed(2)}, ${(boreTopY - 0.35).toFixed(2)}, y);
          float dEdge = min(
            min(abs(z - ${(pz0).toFixed(3)}), abs(z - ${(pz1).toFixed(3)})),
            min(abs(z - ${(pz2).toFixed(3)}), abs(z - ${(pz3).toFixed(3)}))
          );
          rivuletMask = belowCanopy * exp(-dEdge * 4.5);
          float rivWave = wwNoise(vec2(z * 4.5, tau * 2.2 - t * 3.1));
          h += rivuletMask * rivWave * 0.42;

          streakMask = clamp(fluteB * 0.45 + silk * 0.55, 0.0, 1.0);
          return h;
        }
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        float wwDrop = max(0.0, ${(yTop).toFixed(2)} - vWaterWorld.y);
        float wwStreak, wwRiv;
        float wwH0 = wwField(vWaterWorld.zy, uTime, wwStreak, wwRiv);
        float wwEpsZ = 0.08;
        float wwEpsY = 0.10;
        float _s1, _r1, _s2, _r2;
        float wwHz = wwField(vWaterWorld.zy + vec2(wwEpsZ, 0.0), uTime, _s1, _r1);
        float wwHy = wwField(vWaterWorld.zy + vec2(0.0, wwEpsY), uTime, _s2, _r2);
        // Glassy mirror-wet sheet (0.045..0.09), slightly misted right at the foot trough
        float wwFootMist = exp(-max(0.0, vWaterWorld.y - ${(yPool).toFixed(2)}) * 2.4);
        roughnessFactor = clamp(0.045 + wwStreak * 0.035 + wwRiv * 0.05 + wwFootMist * 0.12, 0.04, 0.20);
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        // Silky, gentle liquid normal deflection (calm sheet glass reflections without noisy oil-slick breakup)
        float wwDz = (wwHz - wwH0) / wwEpsZ;
        float wwDy = (wwHy - wwH0) / wwEpsY;
        float wwStrength = 0.068;
        vec3 wwNWorld = normalize(vec3(1.0, -wwDy * wwStrength, -wwDz * wwStrength));
        normal = normalize((viewMatrix * vec4(wwNWorld, 0.0)).xyz);
      `)
      .replace('#include <dithering_fragment>', /* glsl */`
        // Physical Schlick Fresnel sky/cavern reflection boost + smooth vertical liquid sheen + top weir glint
        vec3 wwViewDir = normalize(vViewPosition);
        float wwNdotV = clamp(dot(normal, wwViewDir), 0.0, 1.0);
        float wwFresnel = pow(1.0 - wwNdotV, 3.6);
        vec3 wwSkyTint = vec3(0.55, 0.70, 0.86);
        // Soft glossy specular ridges along horizontal wave crests and vertical silk streams
        float wwCrest = smoothstep(0.52, 0.82, wwH0) * smoothstep(0.02, 0.35, abs(wwDy));
        float wwSilkSheen = smoothstep(0.54, 0.86, wwStreak);
        gl_FragColor.rgb += wwSkyTint * (wwFresnel * 0.22 + wwCrest * 0.09 + wwSilkSheen * 0.055);

        // Razor-thin bright specular glint line where water breaks smoothly over the top stainless weir lip (y = -34.0)
        float wwLip = exp(-wwDrop * 10.5);
        float wwLipRipple = 0.78 + 0.22 * sin(vWaterWorld.z * 1.9 + uTime * 1.8) * cos(vWaterWorld.z * 4.3 - uTime * 1.2);
        gl_FragColor.rgb += vec3(1.25, 1.35, 1.48) * (wwLip * wwLipRipple * 1.05);

        // Subtle aerated silver-white edge rivulets parting around both Vesper portals & faint foot mist band
        gl_FragColor.rgb += vec3(0.48, 0.58, 0.68) * (wwRiv * (0.22 + 0.28 * wwSilkSheen));
        gl_FragColor.rgb += vec3(0.32, 0.40, 0.48) * (wwFootMist * (0.14 + 0.16 * wwStreak));
        #include <dithering_fragment>
      `);
  };
  const prevKey = sheetMat.customProgramCacheKey.bind(sheetMat);
  sheetMat.customProgramCacheKey = () => `${prevKey()}|waterWallSheet`;

  const sheetMesh = new THREE.Mesh(sheetGeo, sheetMat);
  sheetMesh.name = 'waterWallSheet';
  sheetMesh.userData.noShadow = true;
  group.add(sheetMesh);

  // ---- 2. Brushed stainless weir lip, portal diverter canopies & narrow foot catch-trough (1 call) ----
  const hwBag = new GeoBag(lib, 'castIron', 1.0);
  // Top stainless weir overflow lip along y = -34.0 (projecting 9 cm proud of granite, clean shadow recess above)
  hwBag.add(boxMM(xWall - 0.02, yTop - 0.02, WATER_WALL.zMin, xWall + 0.095, yTop + 0.045, WATER_WALL.zMax));
  // Side brushed-stainless containment edge channels along z = 54.0 and z = 94.0
  hwBag.add(boxMM(xWall, yPool - 0.25, WATER_WALL.zMin, xWall + 0.08, yTop, WATER_WALL.zMin + 0.05));
  hwBag.add(boxMM(xWall, yPool - 0.25, WATER_WALL.zMax - 0.05, xWall + 0.08, yTop, WATER_WALL.zMax));

  // Peaked stainless water-diverter canopies immediately above both Vesper west portals (parting the sheet cleanly)
  for (const tz of VESPER.trackZ) {
    const cz0 = tz - boreHalfW - pad - 0.12;
    const cz1 = tz + boreHalfW + pad + 0.12;
    hwBag.add(boxMM(xWall, boreTopY + pad - 0.01, cz0, xWall + 0.16, boreTopY + pad + 0.065, cz1));
    // Slim vertical stainless edge deflector fins guiding the parted edge rivulets down beside each bore reveal
    hwBag.add(boxMM(xWall, yPool, cz0, xWall + 0.11, boreTopY + pad, cz0 + 0.04));
    hwBag.add(boxMM(xWall, yPool, cz1 - 0.04, xWall + 0.11, boreTopY + pad, cz1));
  }

  // Narrow brushed-stainless foot catch-trough in the 2 m drop bay (x = -60..-58.2), split around the 2 Vesper rail trenches
  const troughX0 = xWall;
  const troughX1 = xWall + 1.55; // sits neatly inside the 2 m open bay x = -60..-58 (clear of Crossing slab at -58)
  const troughBot = CAVERN.baseFloorY; // -72.5
  const troughLipY = troughBot + 0.36; // -72.14 (12 cm freeboard above water surface yPool -72.26)
  const trenchCutsZ: Array<[number, number]> = VESPER.trackZ.map((tz) => [tz - TRENCH.halfWidth - 0.05, tz + TRENCH.halfWidth + 0.05]);
  // Collect the 3 non-trench trough bays: [54..60.8], [64.1..83.9], [87.2..94]
  let troughSpans: Array<[number, number]> = [[WATER_WALL.zMin + 0.05, WATER_WALL.zMax - 0.05]];
  for (const [c0, c1] of trenchCutsZ) {
    const next: Array<[number, number]> = [];
    for (const [a, b] of troughSpans) {
      if (c1 <= a || c0 >= b) { next.push([a, b]); continue; }
      if (c0 > a + 0.2) next.push([a, c0]);
      if (c1 < b - 0.2) next.push([c1, b]);
    }
    troughSpans = next;
  }
  const poolGeos: THREE.BufferGeometry[] = [];
  for (const [za, zb] of troughSpans) {
    // Trough floor, east outer retaining wall, north & south end caps
    hwBag.add(boxMM(troughX0, troughBot, za, troughX1, troughBot + 0.08, zb));
    hwBag.add(boxMM(troughX1 - 0.08, troughBot, za, troughX1, troughLipY, zb));
    hwBag.add(boxMM(troughX0, troughBot, za, troughX1, troughLipY, za + 0.08));
    hwBag.add(boxMM(troughX0, troughBot, zb - 0.08, troughX1, troughLipY, zb));
    // Horizontal pool surface inside the stainless trough
    const pg = new THREE.BufferGeometry();
    const px0 = troughX0 + 0.02, px1 = troughX1 - 0.08;
    const pzA = za + 0.08, pzB = zb - 0.08;
    pg.setAttribute('position', new THREE.Float32BufferAttribute([
      px0, yPool, pzA, px0, yPool, pzB, px1, yPool, pzB,
      px0, yPool, pzA, px1, yPool, pzB, px1, yPool, pzA,
    ], 3));
    pg.setAttribute('normal', new THREE.Float32BufferAttribute([
      0, 1, 0, 0, 1, 0, 0, 1, 0,
      0, 1, 0, 0, 1, 0, 0, 1, 0,
    ], 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, pzA, 0, pzB, 1, pzB,
      0, pzA, 1, pzB, 1, pzA,
    ], 2));
    poolGeos.push(pg);
  }

  const hwMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepWaterWallStainless',
    color: 0xcad2d8,
    metalness: 1.0,
    roughness: 0.22,
    envMapIntensity: 1.3,
  });
  const hwGeo = hwBag.merge();
  if (hwGeo) {
    const m = new THREE.Mesh(hwGeo, hwMat);
    m.name = 'waterWallHardware';
    group.add(m);
  }

  // ---- 3. Calm trough water surface with subtle animated splash ripple band along x = -60 (1 call) ----
  const poolMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepWaterTroughPool',
    color: 0x0c131a,
    roughness: 0.06,
    metalness: 0.12,
    envMapIntensity: 2.0,
  });
  poolMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPoolUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPoolUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vPoolUv;')
      .replace('#include <dithering_fragment>', /* glsl */`
        // Subtle animated splash foam & concentric ripple sheen right where the falling sheet meets the pool (u -> 0)
        float band = exp(-vPoolUv.x * 7.5);
        float rip = 0.5 + 0.5 * sin(vPoolUv.x * 28.0 - uTime * 5.2 + sin(vPoolUv.y * 2.4 + uTime * 1.7) * 1.4);
        float shimmer = 0.5 + 0.5 * cos(vPoolUv.y * 6.5 - uTime * 3.1);
        gl_FragColor.rgb += vec3(0.55, 0.66, 0.76) * (band * (0.28 + 0.34 * rip * shimmer));
        gl_FragColor.rgb += vec3(0.16, 0.22, 0.28) * (exp(-vPoolUv.x * 2.2) * rip * 0.14);
        #include <dithering_fragment>
      `);
  };
  const poolKey = poolMat.customProgramCacheKey.bind(poolMat);
  poolMat.customProgramCacheKey = () => `${poolKey()}|waterTroughPool`;

  if (poolGeos.length > 0) {
    const mergedPool = mergeGeometries(poolGeos, false)!;
    for (const p of poolGeos) p.dispose();
    const m = new THREE.Mesh(mergedPool, poolMat);
    m.name = 'waterWallTroughPool';
    m.userData.noShadow = true;
    group.add(m);
  }

  return {
    group,
    deepMaterials: [sheetMat, hwMat, poolMat],
    update(realTimeSec: number): void {
      uTime.value = realTimeSec;
    },
  };
}
