import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { METRO_TRAIN, PORTAL, PORTALS, type PortalBoreSpec } from '../../layoutMetro';
import { TIMING } from '../../metro/timetable';
import { LINE_COLORS } from '../../metro/trainModel';
import { GeoBag, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * Twelve single-track tunnel bores and 341.5 m darkened horseshoe tunnels (spec §2.6, §4; Phase 3 task P3-6).
 *
 * Builds (4 draw calls total, budget <= 6):
 *  1. `portalFrames`: precision 0.30 m deep brushed-stainless reveals around all twelve 5.0 × 5.5 m bore mouths
 *     (30 mm shadow gap to wall panels), plus inner horseshoe transition bezels.
 *  2. `portalLinings`: horseshoe-section dark charcoal tunnel linings running `TUNNEL_LENGTH` (341.5 m, computed from
 *     `TIMING.spawnClearance + METRO_TRAIN.length + 10` per Ruling 32), fog disabled and distance-darkened smoothly
 *     in shader so deep fog never washes out the tunnel interior.
 *  3. `portalCaps`: pure unlit black end caps sealing every bore at 341.5 m (no visible end, ever).
 *  4. `portalRings`: ONE instanced emissive mesh of engineered recessed arch light ribs every 6 m along all 12 bores,
 *     driven by ONE `DataTexture` (segments × 12 bores, RedFormat, HalfFloatType, NearestFilter), updated in place
 *     only when values change. Idle shimmer at 2 % in Phase 3; driven by Phase 4 arrival waves & departure wakes.
 */

/** Exact tunnel length measured from each bore mouth (Ruling 32: never a literal). */
export const TUNNEL_LENGTH = TIMING.spawnClearance + METRO_TRAIN.length + 10; // 341.5 m

/** Distance from bore mouth to first ring rib, pitch, and segment count per bore. */
export const PORTAL_RING_FIRST_DEPTH = 3.0;
export const PORTAL_RING_PITCH = PORTAL.ringPitch; // 6.0 m
export const PORTAL_RING_SEGMENTS = Math.floor((TUNNEL_LENGTH - PORTAL_RING_FIRST_DEPTH) / PORTAL_RING_PITCH) + 1; // 57

export interface PortalsBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  readonly boreCount: number;
  readonly segmentCount: number;
  /** Write one bore/segment intensity (0..1+); call `commit()` after a batch to upload only if changed. */
  setSegment(boreIndex: number, segIndex: number, intensity: number): void;
  /** Upload the wave DataTexture to GPU only when any texel actually changed. */
  commit(): void;
  /** Advance the subtle 2 % real-time idle shimmer (Phase 3 default; Phase 4 overwrites with arrival/departure waves). */
  updateIdle(realTimeSec: number): void;
}

const cw = (pts: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area > 0 ? [...pts].reverse() : [...pts];
};

const ccw = (pts: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...pts].reverse() : [...pts];
};

/** Right-handed basis for a bore: X = lat, Y = up, Z = inward (-facing), origin at mouth floor centre. */
function boreBasis(b: PortalBoreSpec): { o: THREE.Vector3; lat: THREE.Vector3; up: THREE.Vector3; inward: THREE.Vector3; mat: THREE.Matrix4 } {
  const [fx, fz] = b.facing;
  const inward = v3(-fx, 0, -fz);
  const up = v3(0, 1, 0);
  const lat = v3(-fz, 0, fx); // up x inward => det(lat, up, inward) = +1
  const o = v3(b.centre[0], b.bedY, b.centre[2]);
  const mat = new THREE.Matrix4().makeBasis(lat, up, inward);
  mat.setPosition(o);
  return { o, lat, up, inward, mat };
}

/** Horseshoe profile in local (a = lateral, b = height above bedY), CW for inward-facing wall normals. */
function horseshoePoints(hw: number, springH: number, crownH: number, archSegs: number): P2[] {
  const archR = crownH - springH;
  const pts: P2[] = [
    [+hw, 0],
    [-hw, 0],
    [-hw, springH],
  ];
  for (let i = 1; i < archSegs; i++) {
    const th = Math.PI - (Math.PI * i) / archSegs; // pi -> 0 (left haunch over crown to right haunch)
    pts.push([hw * Math.cos(th), springH + archR * Math.sin(th)]);
  }
  pts.push([+hw, springH]);
  return cw(pts);
}

/**
 * Engineered recessed tunnel light-rib fixture prototype in bore-local space (z = 0, y = height above bedY):
 * a slim 85 mm wide × 28 mm deep arch rib conforming snugly to the horseshoe tunnel lining from y = 1.35 m
 * on the left haunch up over the arch crown to y = 1.35 m on the right haunch.
 */
function buildRingRibPrototype(): THREE.BufferGeometry {
  const hw = PORTAL.w / 2 - 0.02;  // 2.48 m (tight against the 2.50 m horseshoe lining)
  const springH = 2.75;
  const crownH = PORTAL.h - 0.02;  // 5.48 m
  const archR = crownH - springH;
  const ribW = 0.085;              // 85 mm along tunnel axis
  const ribThick = 0.032;          // 32 mm radial depth

  // Path along the upper horseshoe arch from left haunch (y = 1.35) up over crown to right haunch (y = 1.35)
  const pathPts: Array<{ x: number; y: number; nx: number; ny: number }> = [
    { x: -hw, y: 1.35, nx: +1, ny: 0 },
    { x: -hw, y: springH, nx: +1, ny: 0 },
  ];
  const segs = 16;
  for (let i = 1; i < segs; i++) {
    const th = Math.PI - (Math.PI * i) / segs;
    const cx = hw * Math.cos(th), cy = springH + archR * Math.sin(th);
    // Inward ellipse normal (-cos/hw, -sin/archR) normalised
    const ix = -Math.cos(th) / hw, iy = -Math.sin(th) / archR;
    const il = Math.hypot(ix, iy) || 1;
    pathPts.push({ x: cx, y: cy, nx: ix / il, ny: iy / il });
  }
  pathPts.push({ x: +hw, y: springH, nx: -1, ny: 0 });
  pathPts.push({ x: +hw, y: 1.35, nx: -1, ny: 0 });

  const prof = ccw([
    [-ribW / 2, 0],
    [+ribW / 2, 0],
    [+ribW / 2, ribThick],
    [-ribW / 2, ribThick],
  ]);
  const frames: Frame[] = pathPts.map((p) => ({
    o: v3(p.x, p.y, 0),
    a: v3(0, 0, 1),          // across tunnel depth
    b: v3(p.nx, p.ny, 0),    // inward into tunnel
  }));
  const g = sweep(prof, frames, { closed: true, caps: true });
  g.computeBoundingSphere();
  return g;
}

export function buildPortals(lib: MaterialLibrary, _kit: MetroMaterials): PortalsBuild {
  const group = new THREE.Group();
  group.name = 'metroPortals';

  const frameBag = new GeoBag(lib, 'castIron', 1.0);
  const liningParts: THREE.BufferGeometry[] = [];
  const capParts: THREE.BufferGeometry[] = [];

  const hw = PORTAL.w / 2;         // 2.50 m
  const h = PORTAL.h;              // 5.50 m
  const fd = PORTAL.frameDepth;    // 0.30 m stainless reveal depth
  const springH = 2.75;
  const horseshoe = horseshoePoints(hw, springH, h, 18);

  // Depth-sampling stations along the 341.5 m lining (denser near mouth for smooth vertex/depth precision, coarser deep inside)
  const depthStations = [fd - 0.01, 4, 12, 24, 42, 70, 120, 200, TUNNEL_LENGTH];

  for (const bore of PORTALS) {
    const { o, lat, up, inward, mat } = boreBasis(bore);
    const frameAt = (d: number): Frame => ({
      o: o.clone().addScaledVector(inward, d),
      a: lat.clone(),
      b: up.clone(),
    });

    // ---- 1. Precision 0.30 m deep brushed-stainless rectangular portal frame (30 mm shadow gap to wall panels) ----
    // Wall panels in shell.ts and halcyon.ts stop 30 mm outside the 5.0 × 5.5 m opening; this crisp 0.045 m thick
    // brushed-stainless reveal box hugs the exact 5.0 × 5.5 m bore aperture from d = -0.025 (flush proud trim) to d = 0.30.
    const tFr = 0.042;
    const d0 = -0.022;
    const d1 = fd;
    const addLocalBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void => {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      frameBag.add(g, mat);
    };
    // Left jamb, right jamb, top lintel (all 0.30 m deep, crisp mitered flush corners; open bottom sill for track bed)
    addLocalBox(-hw - tFr, -hw, 0, h + tFr, d0, d1);
    addLocalBox(+hw, +hw + tFr, 0, h + tFr, d0, d1);
    addLocalBox(-hw, +hw, h, h + tFr, d0, d1);
    // Dark charcoal horseshoe transition spandrel at d = 0.26..0.30 bridging the square stainless reveal to the horseshoe arch
    const spandrelShape = new THREE.Shape([
      new THREE.Vector2(-hw, 0), new THREE.Vector2(+hw, 0),
      new THREE.Vector2(+hw, h), new THREE.Vector2(-hw, h),
    ]);
    const archHole = new THREE.Path();
    const hsCcw = ccw(horseshoe);
    archHole.moveTo(hsCcw[0]![0], hsCcw[0]![1]);
    for (let i = 1; i < hsCcw.length; i++) archHole.lineTo(hsCcw[i]![0], hsCcw[i]![1]);
    archHole.closePath();
    spandrelShape.holes.push(archHole);
    const spGeo = new THREE.ExtrudeGeometry(spandrelShape, { depth: 0.04, bevelEnabled: false, curveSegments: 18 });
    spGeo.translate(0, 0, fd - 0.04);
    spGeo.applyMatrix4(mat);
    const spNonIdx = spGeo.index ? spGeo.toNonIndexed() : spGeo;
    const spUv = spNonIdx.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < spUv.count; i++) spUv.setY(i, fd);
    liningParts.push(spNonIdx);

    // ---- 2. Horseshoe dark charcoal tunnel lining (0.29 m -> TUNNEL_LENGTH = 341.5 m) with exact depth in uv.y ----
    const liningFrames = depthStations.map((d) => frameAt(d));
    const lGeo = sweep(horseshoe, liningFrames, { closed: true, caps: false, smooth: 40 });
    const lPos = lGeo.getAttribute('position') as THREE.BufferAttribute;
    const lUv = lGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < lPos.count; i++) {
      const dx = lPos.getX(i) - o.x;
      const dz = lPos.getZ(i) - o.z;
      const depth = dx * inward.x + dz * inward.z;
      lUv.setY(i, Math.max(0, depth));
    }
    liningParts.push(lGeo);

    // Low concrete inspection benches along both sides of the horseshoe tunnel invert (first 80 m where visible)
    for (const sgn of [-1, 1] as const) {
      const benchProf = ccw([
        [sgn > 0 ? hw - 0.42 : -hw, 0],
        [sgn > 0 ? hw : -hw + 0.42, 0],
        [sgn > 0 ? hw : -hw + 0.42, 0.55],
        [sgn > 0 ? hw - 0.42 : -hw, 0.55],
      ]);
      const bGeo = sweep(benchProf, [frameAt(fd), frameAt(25), frameAt(85)], { closed: true, caps: true });
      const bPos = bGeo.getAttribute('position') as THREE.BufferAttribute;
      const bUv = bGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < bPos.count; i++) {
        const depth = (bPos.getX(i) - o.x) * inward.x + (bPos.getZ(i) - o.z) * inward.z;
        bUv.setY(i, Math.max(0, depth));
      }
      liningParts.push(bGeo);
    }

    // ---- 3. Pure black cap sealing the back of the 341.5 m bore ----
    const capShape = new THREE.Shape(hsCcw.map(([x, y]) => new THREE.Vector2(x, y)));
    const capGeo = new THREE.ShapeGeometry(capShape);
    // ShapeGeometry faces +z (inward); flip to face -z (toward bore mouth)
    capGeo.rotateY(Math.PI);
    capGeo.translate(0, 0, TUNNEL_LENGTH - 0.05);
    capGeo.applyMatrix4(mat);
    capParts.push(capGeo.index ? capGeo.toNonIndexed() : capGeo);
  }

  // ---- 4. One instanced ring-segment mesh for all 12 bores × 57 segments driven by ONE HalfFloat RedFormat DataTexture ----
  const segCount = PORTAL_RING_SEGMENTS;
  const boreCount = PORTALS.length; // 12
  const totalInstances = boreCount * segCount;

  const texData = new Uint16Array(segCount * boreCount);
  const floatCache = new Float32Array(segCount * boreCount);
  const waveTex = new THREE.DataTexture(
    texData, segCount, boreCount,
    THREE.RedFormat, THREE.HalfFloatType,
    THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping,
    THREE.NearestFilter, THREE.NearestFilter,
  );
  waveTex.generateMipmaps = false;
  waveTex.needsUpdate = true;

  let dirty = false;
  const setSegment = (boreIndex: number, segIndex: number, intensity: number): void => {
    if (boreIndex < 0 || boreIndex >= boreCount || segIndex < 0 || segIndex >= segCount) return;
    const idx = boreIndex * segCount + segIndex;
    const val = Math.max(0, intensity);
    if (Math.abs(floatCache[idx]! - val) < 1e-4) return;
    floatCache[idx] = val;
    texData[idx] = THREE.DataUtils.toHalfFloat(val);
    dirty = true;
  };
  const commit = (): void => {
    if (!dirty) return;
    waveTex.needsUpdate = true;
    dirty = false;
  };

  // Initialise all segments to 2 % idle level
  for (let b = 0; b < boreCount; b++) {
    for (let s = 0; s < segCount; s++) setSegment(b, s, 0.02);
  }
  commit();

  const ringProto = buildRingRibPrototype();
  const aRing = new Float32Array(totalInstances * 2);
  const aAccent = new Float32Array(totalInstances * 3);
  const ringMat = new THREE.ShaderMaterial({
    name: 'metroDeepPortalRings',
    fog: false,
    uniforms: {
      uWaveTex: { value: waveTex },
      uSegCount: { value: segCount },
      uBoreCount: { value: boreCount },
      uPeak: { value: 3.6 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aRing;
      attribute vec3 aAccent;
      varying vec2 vRing;
      varying vec3 vAccent;
      void main() {
        vRing = aRing;
        vAccent = aAccent;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uWaveTex;
      uniform float uSegCount;
      uniform float uBoreCount;
      uniform float uPeak;
      varying vec2 vRing;
      varying vec3 vAccent;
      void main() {
        float u = (vRing.y + 0.5) / uSegCount;
        float v = (vRing.x + 0.5) / uBoreCount;
        float inten = texture2D(uWaveTex, vec2(u, v)).r;
        // Neutral architectural white deep inside; crisp line-colour tint ONLY on the last 3 mouth segments (0, 1, 2),
        // luminance-balanced so Meridian blue and Halcyon oxblood read just as clearly as the approaching white crest.
        float mouthMask = 1.0 - step(2.5, vRing.y);
        vec3 neutral = vec3(0.92, 0.96, 1.0);
        vec3 tint = mix(neutral, vAccent, mouthMask * 0.56);
        float mouthLift = mix(1.0, 1.35, mouthMask);
        // Gentle tunnel-depth attenuation so deep ribs stay crisp architectural markers without blowing out
        float depthM = ${PORTAL_RING_FIRST_DEPTH.toFixed(1)} + vRing.y * ${PORTAL_RING_PITCH.toFixed(1)};
        float depthFade = mix(0.28, 1.0, exp(-depthM * 0.014));
        // Subtle dark metallic housing baseline (0.015) so even unlit mouth ribs read as physical fixtures
        vec3 col = vec3(0.012, 0.014, 0.017) + tint * (inten * uPeak * depthFade * mouthLift);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  ringProto.setAttribute('aRing', new THREE.InstancedBufferAttribute(aRing, 2));
  ringProto.setAttribute('aAccent', new THREE.InstancedBufferAttribute(aAccent, 3));

  const ringMesh = new THREE.InstancedMesh(ringProto, ringMat, totalInstances);
  ringMesh.name = 'portalRings';
  ringMesh.userData.noShadow = true;

  const mInst = new THREE.Matrix4();
  const mOff = new THREE.Matrix4();
  let inst = 0;
  for (let bIdx = 0; bIdx < boreCount; bIdx++) {
    const bore = PORTALS[bIdx]!;
    const { mat } = boreBasis(bore);
    const lc = LINE_COLORS[bore.line];
    // Lift saturated linear line color slightly into crisp architectural emissive tint for the 3 mouth rings
    const maxC = Math.max(lc[0], lc[1], lc[2], 0.01);
    const accR = 0.22 + 0.78 * (lc[0] / maxC);
    const accG = 0.22 + 0.78 * (lc[1] / maxC);
    const accB = 0.22 + 0.78 * (lc[2] / maxC);
    for (let sIdx = 0; sIdx < segCount; sIdx++) {
      const depth = PORTAL_RING_FIRST_DEPTH + sIdx * PORTAL_RING_PITCH;
      mOff.makeTranslation(0, 0, depth);
      mInst.multiplyMatrices(mat, mOff);
      ringMesh.setMatrixAt(inst, mInst);
      aRing[inst * 2] = bIdx;
      aRing[inst * 2 + 1] = sIdx;
      aAccent[inst * 3] = accR;
      aAccent[inst * 3 + 1] = accG;
      aAccent[inst * 3 + 2] = accB;
      inst++;
    }
  }
  ringMesh.instanceMatrix.needsUpdate = true;
  ringMesh.computeBoundingSphere();

  // ---- Assemble 4 draw calls (budget <= 6) ----
  const frameMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepPortalFrame',
    color: 0xcbd2d8,
    metalness: 1.0,
    roughness: 0.22,
    envMapIntensity: 1.25,
  });

  const liningMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepPortalLining',
    color: 0x1b1e23,
    roughness: 0.84,
    metalness: 0.04,
    fog: false,
  });
  // Darken horseshoe lining smoothly with tunnel depth (stored in uv.y) so deep fog never reveals the tunnel end
  liningMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vPortalDepth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPortalDepth = uv.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPortalDepth;')
      .replace(
        '#include <dithering_fragment>',
        `float tunnelAtten = exp(-max(0.0, vPortalDepth) * 0.032) * smoothstep(200.0, 65.0, vPortalDepth);
         gl_FragColor.rgb *= tunnelAtten;
         #include <dithering_fragment>`,
      );
  };
  const prevKey = liningMat.customProgramCacheKey.bind(liningMat);
  liningMat.customProgramCacheKey = () => `${prevKey()}|portalDarken`;

  const capMat = new THREE.MeshBasicMaterial({
    name: 'metroDeepPortalCap',
    color: 0x000000,
    fog: false,
  });

  const frameGeo = frameBag.merge();
  if (frameGeo) {
    const m = new THREE.Mesh(frameGeo, frameMat);
    m.name = 'portalFrames';
    group.add(m);
  }
  if (liningParts.length > 0) {
    const mergedLining = mergeGeometries(liningParts, false)!;
    for (const p of liningParts) p.dispose();
    const m = new THREE.Mesh(mergedLining, liningMat);
    m.name = 'portalLinings';
    m.userData.noShadow = true; // deep underground tunnels need not cast shadows onto the cavern
    group.add(m);
  }
  if (capParts.length > 0) {
    const mergedCaps = mergeGeometries(capParts, false)!;
    for (const p of capParts) p.dispose();
    const m = new THREE.Mesh(mergedCaps, capMat);
    m.name = 'portalCaps';
    m.userData.noShadow = true;
    group.add(m);
  }
  group.add(ringMesh);

  // Subtle slow 2 % idle shimmer across the visible mouth/mid segments (zero allocation)
  const updateIdle = (realTimeSec: number): void => {
    for (let b = 0; b < boreCount; b++) {
      for (let s = 0; s < segCount; s++) {
        // Gentle slow breathing wave centred around 0.02 (0.014..0.028)
        const v = 0.02 + 0.007 * Math.sin(realTimeSec * 0.7 + b * 1.15 - s * 0.42);
        setSegment(b, s, v);
      }
    }
    commit();
  };

  return {
    group,
    deepMaterials: [frameMat, liningMat],
    boreCount,
    segmentCount: segCount,
    setSegment,
    commit,
    updateIdle,
  };
}
