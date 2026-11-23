import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { CAVERN, PORTAL, SHELL, VESPER, WATER_WALL } from '../../layoutMetro';
import { GeoBag, boxMM } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * The East Backlit Book-Matched White Onyx Wall (spec §2.6, §4; Phase 3 task P3-7).
 *
 * Covers the entire east transept end wall (x = +60, z = 54..94, y = -72.5..-34.0) continuing cleanly down
 * into the 2 m open floor reveal behind the Crossing floor edge (x = +58..+60), pierced cleanly by both
 * Vesper east portals (brushed-stainless 0.30 m reveals in portals.ts):
 *  - 27 × 13 backlit white onyx slabs (~1.48 × 2.96 m), truly book-matched by mirroring UVs across every
 *    vertical stainless joint so adjacent slabs form symmetrical veining butterflies;
 *  - slim brushed-stainless joint frame grid + top cornice header sealing against the -34.0 limestone frieze.
 *
 * Budget: 2 draw calls (onyxWallSlabs, onyxWallGrid). Combined with waterWall.ts (3 calls) = 5 calls (<= 6).
 */

export interface OnyxWallBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
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

/** Single backlit onyx slab quad on x = xFace facing -x (inward into cavern), with explicit book-matched UVs & slab tone. */
function onyxSlabQuad(
  xFace: number, z0: number, z1: number, y0: number, y1: number,
  u0: number, u1: number, v0: number, v1: number,
  tone: readonly [number, number, number],
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Normal faces -x: (z0,y0) -> (z1,y0) -> (z1,y1) has (0,0,1)x(0,1,0) = (-1,0,0)
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    xFace, y0, z0, xFace, y0, z1, xFace, y1, z1,
    xFace, y0, z0, xFace, y1, z1, xFace, y1, z0,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([
    -1, 0, 0, -1, 0, 0, -1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([
    u0, v0, u1, v0, u1, v1,
    u0, v0, u1, v1, u0, v1,
  ], 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute([
    tone[0], tone[1], tone[2], tone[0], tone[1], tone[2], tone[0], tone[1], tone[2],
    tone[0], tone[1], tone[2], tone[0], tone[1], tone[2], tone[0], tone[1], tone[2],
  ], 3));
  return g;
}

export function buildOnyxWall(lib: MaterialLibrary, kit: MetroMaterials): OnyxWallBuild {
  const group = new THREE.Group();
  group.name = 'metroOnyxWall';

  const xWall = CAVERN.transept.xMax; // +60
  const zMin = CAVERN.transept.zMin;  // 54
  const zMax = CAVERN.transept.zMax;  // 94
  const yMin = CAVERN.baseFloorY;     // -72.5 (stands cleanly in the 2 m lit reveal behind x = +58)
  const yMax = WATER_WALL.yMax;       // -34.0 (meets the top honed-limestone frieze cleanly)

  const boreBedY = VESPER.railY - PORTAL.bedBelowRail; // -71.7
  const boreTopY = boreBedY + PORTAL.h;                // -66.2
  const boreHalfW = PORTAL.w / 2;                      // 2.5
  const revGap = SHELL.openingRevealGap;               // 30 mm shadow gap around brushed-stainless portal reveal

  const portalCuts: Rect2[] = VESPER.trackZ.map((tz) => ({
    z0: tz - boreHalfW - revGap,
    z1: tz + boreHalfW + revGap,
    y0: boreBedY - revGap,
    y1: boreTopY + revGap,
  }));

  // Slab grid: 27 cols (~1.48 m) × 13 rows (~2.96 m) -> matches 1.5 × 3.0 m spec with zero awkward corner slivers
  const nCols = 27;
  const nRows = 13;
  const colW = (zMax - zMin) / nCols; // 1.4815 m
  const rowH = (yMax - yMin) / nRows; // 2.9615 m
  const frameW = 0.036;               // 36 mm slim brushed stainless joint mullion
  const frameProud = 0.026;           // 26 mm proud of onyx face so mullions cast crisp micro-shadows

  const slabParts: THREE.BufferGeometry[] = [];
  const gridBag = new GeoBag(lib, 'castIron', 1.0);

  // ---- 1. Book-matched backlit white onyx slabs ----
  // Monumental quarry-slab UV scale (uSpan = 0.24, vSpan = 0.42) so each 1.5 × 3.0 m slab shows sweeping geological
  // veins rather than dense wallpaper. Every vertical pair (2k | 2k+1) mirrors U across its shared vertical joint,
  // and each pair gets a unique quarry-block UV offset + subtle translucent warmth variation (Beinecke Library mood).
  const uSpan = 0.24;
  const vSpan = 0.42;
  const hash2 = (a: number, b: number): number => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let r = 0; r < nRows; r++) {
    const ry0 = yMin + r * rowH;
    const ry1 = yMin + (r + 1) * rowH;
    const rowPair = Math.floor(r / 2);
    const flipV = r % 2 === 1;

    for (let c = 0; c < nCols; c++) {
      const cz0 = zMin + c * colW;
      const cz1 = zMin + (c + 1) * colW;
      const colPair = Math.floor(c / 2);
      const uBase = hash2(colPair + 1, rowPair * 3 + 7);
      const vBase = hash2(colPair * 5 + 13, rowPair + 2);
      const flipU = c % 2 === 1;
      const uA = flipU ? uBase + uSpan : uBase;
      const uB = flipU ? uBase : uBase + uSpan;
      const vA = flipV ? vBase + vSpan : vBase;
      const vB = flipV ? vBase : vBase + vSpan;
      // Subtle translucent panel-to-panel warmth & brightness variation (book-matched pairs share base quarry tone)
      const kPair = 0.94 + 0.11 * hash2(colPair * 11, rowPair * 17);
      const kSlab = kPair + (hash2(c * 7, r * 19) - 0.5) * 0.03;
      const tone: [number, number, number] = [kSlab, kSlab * 0.985, kSlab * 0.955];

      const pieces = subtractRects({ z0: cz0, z1: cz1, y0: ry0, y1: ry1 }, portalCuts);
      for (const p of pieces) {
        const tz0 = (p.z0 - cz0) / colW, tz1 = (p.z1 - cz0) / colW;
        const ty0 = (p.y0 - ry0) / rowH, ty1 = (p.y1 - ry0) / rowH;
        const pu0 = uA + (uB - uA) * tz0;
        const pu1 = uA + (uB - uA) * tz1;
        const pv0 = vA + (vB - vA) * ty0;
        const pv1 = vA + (vB - vA) * ty1;
        slabParts.push(onyxSlabQuad(xWall, p.z0, p.z1, p.y0, p.y1, pu0, pu1, pv0, pv1, tone));
      }
    }
  }

  // ---- 2. Slim brushed-stainless joint frame grid + top cornice seal (y = -34.0) ----
  // Vertical mullions at every column boundary (cut cleanly around both Vesper east portals)
  for (let c = 0; c <= nCols; c++) {
    const z = zMin + c * colW;
    const mz0 = Math.max(zMin, z - frameW / 2);
    const mz1 = Math.min(zMax, z + frameW / 2);
    const segs = subtractRects({ z0: mz0, z1: mz1, y0: yMin, y1: yMax }, portalCuts);
    for (const s of segs) {
      gridBag.add(boxMM(xWall - frameProud, s.y0, s.z0, xWall + 0.04, s.y1, s.z1));
    }
  }
  // Horizontal transoms at every row boundary
  for (let r = 0; r <= nRows; r++) {
    const y = yMin + r * rowH;
    const my0 = Math.max(yMin, y - frameW / 2);
    const my1 = Math.min(yMax, y + frameW / 2);
    const segs = subtractRects({ z0: zMin, z1: zMax, y0: my0, y1: my1 }, portalCuts);
    for (const s of segs) {
      gridBag.add(boxMM(xWall - frameProud, s.y0, s.z0, xWall + 0.04, s.y1, s.z1));
    }
  }
  // Crisp brushed-stainless top header soffit sealing cleanly to the -34.0 limestone frieze overhang
  gridBag.add(boxMM(xWall - 0.045, yMax - 0.03, zMin, xWall + SHELL.proud + 0.02, yMax + 0.02, zMax));

  // ---- Assemble 2 draw calls ----
  // Dedicated clone of kit.deep.onyx remapped to luminous alabaster-white backlit onyx (lifting dark brown base into
  // translucent warm-ivory stone with delicate amber-gold mineral veins — serene & monumental from both 10 m and 100 m).
  const onyxMat = kit.deep.onyx.clone();
  onyxMat.name = 'metroDeepOnyxWall';
  onyxMat.vertexColors = true;
  onyxMat.color.set(0xffffff);
  onyxMat.emissive.setRGB(1.0, 0.88, 0.68); // warm ~3350 K alabaster-amber backlit stone
  onyxMat.emissiveIntensity = 1.12;
  onyxMat.roughness = 0.24;
  onyxMat.envMapIntensity = 0.80;
  onyxMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        // Remap vein contrast into refined alabaster-white onyx with delicate translucent amber veining
        float onyxLum = clamp(diffuseColor.r, 0.0, 1.0);
        vec3 alabaster = mix(vec3(0.62, 0.53, 0.41), vec3(0.98, 0.95, 0.89), smoothstep(0.18, 0.92, onyxLum));
        diffuseColor.rgb = alabaster;
      `)
      .replace('#include <emissivemap_fragment>', /* glsl */`
        #ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          // Luminous warm cream core with subtle translucent amber vein clouds (never dark muddy blotches)
          float eVein = smoothstep(0.15, 0.90, emissiveColor.r);
          vec3 onyxGlow = mix(vec3(0.54, 0.42, 0.28), vec3(1.05, 0.97, 0.84), eVein);
          #ifdef USE_COLOR
            onyxGlow *= vColor.rgb;
          #endif
          totalEmissiveRadiance *= onyxGlow;
        #endif
      `);
  };
  const onyxKey = onyxMat.customProgramCacheKey.bind(onyxMat);
  onyxMat.customProgramCacheKey = () => `${onyxKey()}|onyxBacklitAlabaster`;

  const gridMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepOnyxGridStainless',
    color: 0xc9d0d6,
    metalness: 1.0,
    roughness: 0.26,
    envMapIntensity: 1.15,
  });

  if (slabParts.length > 0) {
    const mergedSlabs = mergeGeometries(slabParts, false)!;
    for (const p of slabParts) p.dispose();
    const m = new THREE.Mesh(mergedSlabs, onyxMat);
    m.name = 'onyxWallSlabs';
    m.userData.noShadow = true; // flat backlit east wall never needs to cast shadow onto itself
    group.add(m);
  }
  const gridGeo = gridBag.merge();
  if (gridGeo) {
    const m = new THREE.Mesh(gridGeo, gridMat);
    m.name = 'onyxWallGrid';
    m.userData.noShadow = true;
    group.add(m);
  }

  return { group, deepMaterials: [onyxMat, gridMat] };
}
