import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import type { MetroTrack } from '../../metro/tracks';
import { GeoBag, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * Modern concrete slab track (spec §2.6; Phase 3 task P3-3, reused by P3-4 Vesper and P3-5 Halcyon).
 *
 * Works at any orientation from MetroTrack { origin, dir, railY }:
 *  - chamfered precast concrete twin plinths with central drainage trough;
 *  - clean Vignoles steel rails with dark gunmetal foot/web and gleaming polished steel running head (vertex colours);
 *  - instanced rail baseplates + clips every 0.65 m;
 *  - optional thin cool 4000 K trench-edge light line (for Vesper trenches in P3-4).
 *
 * Budget: 3 draw calls per batch of tracks (+1 optional trench-edge light call).
 */

const TRACK_DETAIL = {
  halfGauge: 1.435 / 2, // 0.7175 m
  railH: 0.172,
  plinthW: 0.54,
  plinthChamfer: 0.03,
  slabDepth: 0.58,
  troughTop: -0.34,
  clipPitch: 0.65,
  edgeLightW: 0.026,
} as const;

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
}

const ccw = (pts: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...pts].reverse() : [...pts];
};

function withVertexColor(geo: THREE.BufferGeometry, rgb: readonly [number, number, number]): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function quadGeo(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ref: THREE.Vector3): THREE.BufferGeometry {
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const pts = n.dot(ref) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  return g;
}

/** Single rail baseplate + twin clip shoulders prototype in local space (x = across rail, y = up from plinth top, z = along rail). */
function buildClipPrototype(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  // Baseplate pad under rail foot
  addBox(0.28, 0.018, 0.16, 0, 0.009, 0);
  // Twin shoulder clips clamping either side of the 0.15 m rail foot
  addBox(0.055, 0.036, 0.09, -0.105, 0.028, 0);
  addBox(0.055, 0.036, 0.09, +0.105, 0.028, 0);
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

export interface SlabTrackGeos {
  plinths: THREE.BufferGeometry | null;
  rails: THREE.BufferGeometry | null;
  clipMatrices: THREE.Matrix4[];
  clipPrototype: THREE.BufferGeometry;
  edgeLights: THREE.BufferGeometry | null;
}

/**
 * Builds the raw concrete-plinth, vertex-coloured Vignoles rail, clip transform, and trench-edge light geometries
 * for one or more tracks. Reused by both `buildSlabTracks` (3-4 calls) and tight-budget modules like `halcyon.ts`.
 */
export function buildSlabTrackGeos(specs: readonly SlabTrackSpec[], lib: MaterialLibrary): SlabTrackGeos {
  const plinthBag = new GeoBag(lib, 'wallStone', 2.0);
  const railParts: THREE.BufferGeometry[] = [];
  const lightParts: THREE.BufferGeometry[] = [];
  const clipMatrices: THREE.Matrix4[] = [];

  const hg = TRACK_DETAIL.halfGauge;
  const rH = TRACK_DETAIL.railH;
  const pW = TRACK_DETAIL.plinthW;
  const pC = TRACK_DETAIL.plinthChamfer;
  const sD = TRACK_DETAIL.slabDepth;
  const tY = TRACK_DETAIL.troughTop;

  // Twin concrete plinth + central trough cross-section (a = across track, b = y relative to railY).
  const SLAB_PROF = ccw([
    [-(hg + pW / 2), -sD],
    [+(hg + pW / 2), -sD],
    [+(hg + pW / 2), -rH - pC],
    [+(hg + pW / 2 - pC), -rH],
    [+(hg - pW / 2 + pC), -rH],
    [+(hg - pW / 2), -rH - pC],
    [+(hg - pW / 2), tY],
    [-(hg - pW / 2), tY],
    [-(hg - pW / 2), -rH - pC],
    [-(hg - pW / 2 + pC), -rH],
    [-(hg + pW / 2 - pC), -rH],
    [-(hg + pW / 2), -rH - pC],
  ]);

  // Vignoles steel rail split into dark foot/web + gleaming running head (b = y relative to railY, top = 0).
  const RAIL_BASE_PROF = ccw([
    [-0.075, -rH], [0.075, -rH], [0.075, -rH + 0.018], [0.013, -rH + 0.032],
    [0.013, -0.044], [-0.013, -0.044], [-0.013, -rH + 0.032], [-0.075, -rH + 0.018],
  ]);
  const RAIL_HEAD_PROF = ccw([
    [-0.036, -0.044], [0.036, -0.044], [0.036, -0.008], [0.026, 0], [-0.026, 0], [-0.036, -0.008],
  ]);

  const up = v3(0, 1, 0);
  const darkSteel: [number, number, number] = [0.28, 0.30, 0.34];
  const brightHead: [number, number, number] = [1.0, 1.0, 1.0];

  for (const spec of specs) {
    const { track, sMin, sMax } = spec;
    const [ox, oz] = track.origin;
    const [dx, dz] = track.dir;
    const ry = track.railY;
    // Right-hand perpendicular in XZ plane
    const px = -dz, pz = dx;
    const perp = v3(px, 0, pz);
    const frameAt = (s: number, lateral = 0): Frame => ({
      o: v3(ox + dx * s + px * lateral, ry, oz + dz * s + pz * lateral),
      a: perp.clone(),
      b: up.clone(),
    });

    // Concrete plinth + central trough
    plinthBag.add(sweep(SLAB_PROF, [frameAt(sMin), frameAt(sMax)], { closed: true, caps: true }));

    // Left & right rails (base + polished head) + fastening matrices
    const yaw = Math.atan2(dx, dz);
    const quat = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    const scaleOne = v3(1, 1, 1);
    const len = sMax - sMin;
    const nClips = Math.max(2, Math.floor(len / TRACK_DETAIL.clipPitch));

    for (const side of [-1, 1] as const) {
      const lat = side * hg;
      const fr = [frameAt(sMin, lat), frameAt(sMax, lat)];
      railParts.push(withVertexColor(sweep(RAIL_BASE_PROF, fr, { closed: true, caps: true }), darkSteel));
      railParts.push(withVertexColor(sweep(RAIL_HEAD_PROF, fr, { closed: true, caps: true }), brightHead));
      for (let i = 0; i <= nClips; i++) {
        const s = sMin + (len * (i + 0.5)) / (nClips + 1);
        const pos = v3(ox + dx * s + px * lat, ry - rH, oz + dz * s + pz * lat);
        clipMatrices.push(new THREE.Matrix4().compose(pos, quat, scaleOne));
      }
    }

    // Optional thin cool light strips along trench edges
    if (spec.edgeLights) {
      for (const el of spec.edgeLights) {
        const ls0 = el.sMin ?? sMin;
        const ls1 = el.sMax ?? sMax;
        const hw = TRACK_DETAIL.edgeLightW / 2;
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

  let rails: THREE.BufferGeometry | null = null;
  if (railParts.length > 0) {
    rails = mergeGeometries(railParts, false)!;
    for (const p of railParts) p.dispose();
  }
  let edgeLights: THREE.BufferGeometry | null = null;
  if (lightParts.length > 0) {
    edgeLights = mergeGeometries(lightParts, false)!;
    for (const p of lightParts) p.dispose();
  }
  return { plinths: plinthBag.merge(), rails, clipMatrices, clipPrototype: buildClipPrototype(), edgeLights };
}

export function buildSlabTracks(
  specs: readonly SlabTrackSpec[],
  lib: MaterialLibrary,
  kit: MetroMaterials,
  namePrefix = 'slabTrack',
): SlabTrackBuild {
  const group = new THREE.Group();
  group.name = namePrefix;
  const geos = buildSlabTrackGeos(specs, lib);

  const concreteMat = new THREE.MeshStandardMaterial({
    name: `${namePrefix}Concrete`,
    color: 0x565a60,
    roughness: 0.78,
    metalness: 0,
  });
  const railMat = new THREE.MeshStandardMaterial({
    name: `${namePrefix}Rails`,
    color: 0xd6dbe0,
    metalness: 0.94,
    roughness: 0.18,
    vertexColors: true,
    envMapIntensity: 1.2,
  });
  const clipMat = new THREE.MeshStandardMaterial({
    name: `${namePrefix}Clips`,
    color: 0x3a3e44,
    metalness: 0.85,
    roughness: 0.42,
  });

  if (geos.plinths) {
    const m = new THREE.Mesh(geos.plinths, concreteMat);
    m.name = `${namePrefix}Plinths`;
    group.add(m);
  }
  if (geos.rails) {
    const m = new THREE.Mesh(geos.rails, railMat);
    m.name = `${namePrefix}Rails`;
    group.add(m);
  }
  if (geos.clipMatrices.length > 0) {
    const clipMesh = new THREE.InstancedMesh(geos.clipPrototype, clipMat, geos.clipMatrices.length);
    clipMesh.name = `${namePrefix}Fastenings`;
    for (let i = 0; i < geos.clipMatrices.length; i++) clipMesh.setMatrixAt(i, geos.clipMatrices[i]!);
    clipMesh.instanceMatrix.needsUpdate = true;
    clipMesh.computeBoundingSphere();
    clipMesh.userData.noShadow = true; // tiny 3 cm clips need not bake into the 3 cm static shadow map
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

  return { group, deepMaterials: [concreteMat, railMat, clipMat] };
}
