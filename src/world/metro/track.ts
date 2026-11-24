import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PORTAL, TRACK_DETAIL as TD } from '../../layoutMetro';
import type { MaterialLibrary } from '../../core/types';
import type { MetroTrack } from '../../metro/tracks';
import { GeoBag, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import { vertexGlow } from './glow';
import type { MetroMaterials } from './materials';
import { Sink, TRACK_COLORS as C, buildTrackside, ccw2 } from './trackside';

/**
 * Detailed modern slab track (spec §2.6; P3-3, reused by P3-4 Vesper and P3-5 Halcyon; upgraded 2026-11-23).
 *
 * Works at any orientation from MetroTrack { origin, dir, railY }:
 *  - precast concrete twin plinths in 4.8 m slabs (20 mm joints, 40 mm chamfers) on a common slab with a central drainage slot;
 *  - UIC60 rails (172 mm: head, web, foot), polished head over dark web/foot, continuous;
 *  - one fastening per 0.6 m on every rail: elastomer-pad baseplate, cast shoulders, spring clips (instanced);
 *  - trackside equipment from trackside.ts: covered third rail, cable trays, grating, balises, axle counters, markers,
 *    platform-end signal masts, bore cabinets and walkway edge;
 *  - optional thin cool 4000 K trench-edge light line (Vesper trenches).
 *
 * Budget: 4 draw calls per batch of tracks (concrete, steel, composite, instanced fastenings) + 1 optional trench-edge light call.
 * Rail head top, gauge and alignment are unchanged (contract with trainModel.ts wheelsets).
 */

/** Rail, slab and fastening micro-detail (metres; y relative to the rail-head top). Equipment micro-detail: trackside.ts. */
const RAIL = {
  halfGauge: TD.halfGauge,
  railH: 0.172,
  plinthW: 0.54,
  plinthChamfer: 0.04,
  /** Plinth top = rail seat: 28 mm below the rail foot for the 10 mm elastomer pad and 18 mm baseplate. */
  plinthTop: -0.2,
  /** Floor of the shallow channel between the plinths, and the drainage slot cut into it (top width / bottom width / depth). */
  troughY: -0.34,
  slotTopHalf: 0.14,
  slotBotHalf: 0.12,
  slotY: -0.43,
  slabPitch: 4.8,
  slabGap: 0.02,
  /** Fastening pitch; 8 per slab so the pattern repeats exactly in every slab. */
  clipPitch: 0.6,
  edgeLightW: 0.026,
} as const;

/** UIC60 rail, right half (x from the web axis, y down from the head top): head 72 mm, web 16.5 mm, foot 150 mm. */
const UIC60_HEAD: readonly P2[] = [
  [-0.014, -0.047], [0.014, -0.047], [0.03, -0.039], [0.036, -0.029], [0.036, -0.0125], [0.03, -0.0035], [0.015, 0], [-0.015, 0],
  [-0.03, -0.0035], [-0.036, -0.0125], [-0.036, -0.029], [-0.03, -0.039],
];
const UIC60_WEB_FOOT: readonly P2[] = [
  [-0.0095, -0.045], [0.0095, -0.045], [0.00825, -0.075], [0.00825, -0.12], [0.0095, -0.1325], [0.0165, -0.1435], [0.075, -0.16],
  [0.075, -0.172], [-0.075, -0.172], [-0.075, -0.16], [-0.0165, -0.1435], [-0.0095, -0.1325], [-0.00825, -0.12], [-0.00825, -0.075],
];

export interface SlabTrackSpec {
  track: MetroTrack;
  /** Parametric range [sMin, sMax] along track.dir from track.origin. */
  sMin: number;
  sMax: number;
  /** Optional thin cool 4000 K line along a trench wall/under-edge. */
  edgeLights?: ReadonlyArray<{
    /** Perpendicular offset from track centre along right-hand normal (-dir.z, dir.x). */
    perpOffset: number;
    /** World y of the light line centre. */
    y: number;
    /** Unit facing direction (e.g. [0, -1, 0] or horizontal inward). */
    facing: readonly [number, number, number];
    sMin?: number;
    sMax?: number;
  }>;
}

export interface SlabTrackBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  /** Triangle counts per merged mesh, for budget reporting. */
  triangles: { concrete: number; steel: number; composite: number; fastenings: number; fasteningInstances: number };
}

function quadGeo(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ref: THREE.Vector3): THREE.BufferGeometry {
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const pts = n.dot(ref) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * One rail fastening in local space, origin at the rail axis on the rail-foot underside (x = across the rail, y up, z along):
 * 28 mm baseplate on its pad, two cast shoulders and two spring clips bearing on the foot toes. 50 triangles.
 */
function buildFasteningPrototype(): THREE.BufferGeometry {
  const s = new Sink({ line: 'meridian', track: 0, origin: [0, 0], railY: 0, dir: [0, 1], portalIn: 0, portalOut: 0 });
  s.box(-0.14, 0.14, -0.028, 0, -0.1, 0.1, [0.09, 0.095, 0.11], false);       // baseplate on elastomer pad
  for (const sg of [-1, 1] as const) {
    s.box(sg * 0.088, sg * 0.118, 0, 0.036, -0.04, 0.04, [0.17, 0.18, 0.21], false);   // cast shoulder
    s.box(sg * 0.058, sg * 0.112, 0.019, 0.028, -0.014, 0.014, [0.42, 0.44, 0.48], false); // spring clip
  }
  return s.toGeometry()!;
}

let concreteMap: THREE.CanvasTexture | null | undefined;
/** Fine procedural concrete: low-contrast mottling plus grain and sparse aggregate, tileable, 1.5 m per repeat. */
function makeConcreteMap(): THREE.CanvasTexture | null {
  if (concreteMap !== undefined) return concreteMap;
  if (typeof document === 'undefined') return (concreteMap = null);
  const N = 512;
  let seed = 0x5eed1234;
  const rnd = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const field = new Float32Array(N * N);
  for (const [cells, amp] of [[6, 0.34], [14, 0.24], [32, 0.18], [72, 0.14], [160, 0.1]] as const) {
    const grid = new Float32Array(cells * cells).map(() => rnd());
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, fy = (y / N) * cells;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const g = (gx: number, gy: number): number => grid[(gy % cells) * cells + (gx % cells)]!;
        const v = g(x0, y0) * (1 - sx) * (1 - sy) + g(x0 + 1, y0) * sx * (1 - sy) + g(x0, y0 + 1) * (1 - sx) * sy + g(x0 + 1, y0 + 1) * sx * sy;
        field[y * N + x] = field[y * N + x]! + v * amp;
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  if (!ctx) return (concreteMap = null);
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const grain = (rnd() - 0.5) * 0.07;
    const g = Math.max(0, Math.min(1, 0.74 + (field[i]! - 0.5) * 0.3 + grain));
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(g * 255);
    img.data[o + 3] = 255;
  }
  for (let k = 0; k < 900; k++) {                     // sparse aggregate flecks
    const o = (Math.floor(rnd() * N * N)) * 4, d = rnd() < 0.5 ? -26 : 20;
    for (const c of [0, 1, 2]) img.data[o + c] = Math.max(0, Math.min(255, img.data[o + c]! + d));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return (concreteMap = tex);
}

export interface SlabTrackGeos {
  /** Concrete slabs (position, normal, uv; world-scale UVs). */
  plinths: THREE.BufferGeometry | null;
  /** Vertex-coloured metal: rails, third-rail conductor, stainless equipment, LEDs (colour > 1.2 = emitter, see vertexGlow). */
  steel: THREE.BufferGeometry | null;
  /** Vertex-coloured composite / graphite plastic: third-rail cover, insulators, signal heads, balises (no LEDs). */
  composite: THREE.BufferGeometry | null;
  clipMatrices: THREE.Matrix4[];
  clipPrototype: THREE.BufferGeometry;
  edgeLights: THREE.BufferGeometry | null;
}

/**
 * Builds the raw geometries for one or more tracks. Reused by `buildSlabTracks` and tight-budget modules like `halcyon.ts`
 * (which merges them into its own vertex-coloured materials, baking the fastenings).
 */
export function buildSlabTrackGeos(specs: readonly SlabTrackSpec[], lib: MaterialLibrary): SlabTrackGeos {
  const plinthBag = new GeoBag(lib, 'wallStone', 1.5);
  const steelParts: THREE.BufferGeometry[] = [];
  const compositeParts: THREE.BufferGeometry[] = [];
  const lightParts: THREE.BufferGeometry[] = [];
  const clipMatrices: THREE.Matrix4[] = [];

  const hg = RAIL.halfGauge;
  const pW = RAIL.plinthW;
  const pC = RAIL.plinthChamfer;
  const sD = PORTAL.bedBelowRail;
  const top = RAIL.plinthTop;

  // Slab cross-section (a = across track, b = y relative to railY): twin plinths on a common slab, shallow channel, drainage slot.
  const SLAB_PROF = ccw2([
    [-(hg + pW / 2), -sD], [+(hg + pW / 2), -sD],
    [+(hg + pW / 2), top - pC], [+(hg + pW / 2 - pC), top],
    [+(hg - pW / 2 + pC), top], [+(hg - pW / 2), top - pC],
    [+(hg - pW / 2), RAIL.troughY],
    [+RAIL.slotTopHalf, RAIL.troughY], [+RAIL.slotBotHalf, RAIL.slotY], [-RAIL.slotBotHalf, RAIL.slotY], [-RAIL.slotTopHalf, RAIL.troughY],
    [-(hg - pW / 2), RAIL.troughY],
    [-(hg - pW / 2), top - pC], [-(hg - pW / 2 + pC), top],
    [-(hg + pW / 2 - pC), top], [-(hg + pW / 2), top - pC],
  ]);
  const shift = (prof: readonly P2[], da: number): P2[] => prof.map(([a, b]) => [a + da, b] as P2);

  const up = v3(0, 1, 0);

  for (const spec of specs) {
    const { track, sMin, sMax } = spec;
    const [ox, oz] = track.origin;
    const [dx, dz] = track.dir;
    const ry = track.railY;
    const px = -dz, pz = dx;
    const perp = v3(px, 0, pz);
    const frameAt = (s: number): Frame => ({ o: v3(ox + dx * s, ry, oz + dz * s), a: perp.clone(), b: up.clone() });
    const yaw = Math.atan2(dx, dz);
    const quat = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    const scaleOne = v3(1, 1, 1);

    // Precast slabs in a 4.8 m grid centred on the platform centre (s = 0) with 20 mm joints; 8 fastenings per slab per rail.
    const n0 = Math.floor((sMin + RAIL.slabPitch / 2) / RAIL.slabPitch), n1 = Math.floor((sMax + RAIL.slabPitch / 2) / RAIL.slabPitch);
    for (let n = n0; n <= n1; n++) {
      const sa = n * RAIL.slabPitch - RAIL.slabPitch / 2, sb = sa + RAIL.slabPitch;
      const a = Math.max(sMin, sa + RAIL.slabGap / 2), b = Math.min(sMax, sb - RAIL.slabGap / 2);
      if (b - a < 0.3) continue;
      plinthBag.add(sweep(SLAB_PROF, [frameAt(a), frameAt(b)], { closed: true, caps: true }));
      for (let k = 0; k < 8; k++) {
        const s = sa + 0.3 + k * RAIL.clipPitch;
        if (s < a + 0.12 || s > b - 0.12) continue;
        for (const side of [-1, 1] as const) {
          const lat = side * hg;
          clipMatrices.push(new THREE.Matrix4().compose(v3(ox + dx * s + px * lat, ry - RAIL.railH, oz + dz * s + pz * lat), quat, scaleOne));
        }
      }
    }

    const steel = new Sink(track);
    const matte = new Sink(track);
    // Continuous UIC60 rails: polished head over dark web and foot
    for (const side of [-1, 1] as const) {
      steel.prism(shift(UIC60_HEAD, side * hg), sMin, sMax, C.head, 40);
      steel.prism(shift(UIC60_WEB_FOOT, side * hg), sMin, sMax, C.railDark, 40);
    }
    buildTrackside({ track, sMin, sMax, steel, matte });
    const sg = steel.toGeometry(), mg = matte.toGeometry();
    if (sg) steelParts.push(sg);
    if (mg) compositeParts.push(mg);

    // Optional thin cool light strips along trench edges
    if (spec.edgeLights) {
      for (const el of spec.edgeLights) {
        const ls0 = el.sMin ?? sMin;
        const ls1 = el.sMax ?? sMax;
        const hw = RAIL.edgeLightW / 2;
        const face = v3(el.facing[0], el.facing[1], el.facing[2]).normalize();
        const tangent = v3(dx, 0, dz);
        const across = tangent.clone().cross(face).normalize();
        const p0 = v3(ox + dx * ls0 + px * el.perpOffset, el.y, oz + dz * ls0 + pz * el.perpOffset);
        const p1 = v3(ox + dx * ls1 + px * el.perpOffset, el.y, oz + dz * ls1 + pz * el.perpOffset);
        lightParts.push(quadGeo(
          p0.clone().addScaledVector(across, -hw), p1.clone().addScaledVector(across, -hw),
          p1.clone().addScaledVector(across, +hw), p0.clone().addScaledVector(across, +hw),
          face,
        ));
      }
    }
  }

  const mergeAll = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
    if (parts.length === 0) return null;
    const out = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false)!;
    if (parts.length > 1) for (const p of parts) p.dispose();
    return out;
  };
  return {
    plinths: plinthBag.merge(),
    steel: mergeAll(steelParts),
    composite: mergeAll(compositeParts),
    clipMatrices,
    clipPrototype: buildFasteningPrototype(),
    edgeLights: mergeAll(lightParts),
  };
}

const triCount = (g: THREE.BufferGeometry | null): number => (g ? (g.index ? g.index.count : g.getAttribute('position').count) / 3 : 0);

export function buildSlabTracks(
  specs: readonly SlabTrackSpec[],
  lib: MaterialLibrary,
  kit: MetroMaterials,
  namePrefix = 'slabTrack',
): SlabTrackBuild {
  const group = new THREE.Group();
  group.name = namePrefix;
  const geos = buildSlabTrackGeos(specs, lib);

  // Dark graphite concrete (fine procedural map, 1.5 m repeat), satin steel, composite plastic, and the fastenings.
  const concreteMat = new THREE.MeshStandardMaterial({
    name: `${namePrefix}Concrete`,
    color: 0x80848b,
    map: makeConcreteMap(),
    roughness: 0.8,
    metalness: 0,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    name: `${namePrefix}Steel`,
    color: 0xffffff,
    metalness: 0.94,
    roughness: 0.22,
    vertexColors: true,
    envMapIntensity: 1.2,
  });
  vertexGlow(steelMat); // LED lenses, status LEDs and marker lights share the steel draw call
  const compositeMat = new THREE.MeshStandardMaterial({
    name: `${namePrefix}Composite`,
    color: 0xffffff,
    metalness: 0.02,
    roughness: 0.52,
    vertexColors: true,
  });
  const clipMat = new THREE.MeshStandardMaterial({
    name: `${namePrefix}Fastenings`,
    color: 0xffffff,
    metalness: 0.55,
    roughness: 0.5,
    vertexColors: true,
  });

  const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string): void => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.name = `${namePrefix}${name}`;
    group.add(m);
  };
  add(geos.plinths, concreteMat, 'Plinths');
  add(geos.steel, steelMat, 'Steel');
  add(geos.composite, compositeMat, 'Composite');
  if (geos.clipMatrices.length > 0) {
    const clipMesh = new THREE.InstancedMesh(geos.clipPrototype, clipMat, geos.clipMatrices.length);
    clipMesh.name = `${namePrefix}Fastenings`;
    for (let i = 0; i < geos.clipMatrices.length; i++) clipMesh.setMatrixAt(i, geos.clipMatrices[i]!);
    clipMesh.instanceMatrix.needsUpdate = true;
    clipMesh.computeBoundingSphere();
    clipMesh.userData.noShadow = true; // 3 cm fastenings need not bake into the static sun shadow map
    group.add(clipMesh);
  } else {
    geos.clipPrototype.dispose();
  }
  if (geos.edgeLights) {
    const m = new THREE.Mesh(geos.edgeLights, kit.deep.emissive.coolRing);
    m.name = `${namePrefix}EdgeLights`;
    m.userData.noShadow = true;
    group.add(m);
  }

  return {
    group,
    deepMaterials: [concreteMat, steelMat, compositeMat, clipMat],
    triangles: {
      concrete: triCount(geos.plinths), steel: triCount(geos.steel), composite: triCount(geos.composite),
      fastenings: triCount(geos.clipPrototype) * geos.clipMatrices.length, fasteningInstances: geos.clipMatrices.length,
    },
  };
}
