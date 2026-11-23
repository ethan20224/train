import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPEED_GATES as SG, THRESHOLD, fareLines, type FareGlassRun } from '../../layoutMetro';
import { boxMM, sweep, v3, type Frame, type P2 } from '../concourse/geo';

/**
 * Geometry of the Threshold fare line (layout: SPEED_GATES / fareLines() in src/layoutMetro.ts).
 * Cabinets, posts and rails are one stainless geometry (vertex-tinted, merged); fixed glass and the moving leaves are handed to the
 * caller's glass sinks (the Threshold glass mesh). Moving parts are tracked BY CONSTRUCTION: every animated geometry reports the
 * real vertex range it occupies in the merged stream, so the animation can never drift off the geometry it moves.
 */

export type RGB = readonly [number, number, number];
export interface TintedPart { geo: THREE.BufferGeometry; rgb: RGB }
/** Where fare glass goes. `addLeaf` returns the real vertex range of the (non-indexed) leaf geometry in the animated glass stream. */
export interface GlassSink {
  addStatic(g: THREE.BufferGeometry): void;
  addLeaf(g: THREE.BufferGeometry): { start: number; count: number };
}

/** One swinging glass leaf (a wing): hinged on a vertical axis next to a cabinet face, lies flat against that face when open. */
export interface LeafAnim {
  /** Index of the lane in speedGateLanes() order. */
  lane: number;
  hingeX: number; hingeZ: number;
  /** Rotation about +Y (radians) when fully open. */
  phiOpen: number;
  /** Vertex range of the glass in the animated glass stream (relative to the leaf stream). */
  glassStart: number; glassCount: number;
  /** Vertex range of the leaf's stainless top edge, absolute in the fare metal geometry. */
  edgeStart: number; edgeCount: number;
}
export interface FareGeometry {
  geo: THREE.BufferGeometry;
  leaves: LeafAnim[];
  /** Per lane (speedGateLanes() order): absolute first vertex of its two LED strips (south cabinet's, north cabinet's) and verts per strip. */
  ledStart: number[];
  ledVerts: number;
  /** The contiguous vertex ranges that change per frame: leaf edges [edgeFrom, edgeTo) and LED strips [ledFrom, ledTo). */
  edgeFrom: number; edgeTo: number; ledFrom: number; ledTo: number;
  /** Per lane: first vertex and vertex count of its 4 chevron arms (inside [ledFrom, ledTo)); idle dark, white HDR when the lane is open. */
  chevStart: number[]; chevVerts: number;
  triangles: number;
}

/** Cabinet body colours (linear, multiplied into the satin stainless): the void ring light adds `albedo * light`, so the tint is kept
 *  below 1 to let the metal read as dark reflective steel instead of a pale painted slab. */
export const FARE_TINT = { body: [0.80, 0.76, 0.70], bodyLow: [0.15, 0.135, 0.12], plinth: [0.05, 0.05, 0.055], smoked: [0.012, 0.013, 0.016], post: [0.76, 0.73, 0.68] } as const satisfies Record<string, RGB>;
/** LED line: idle and peak HDR (any channel above 1.2 renders as an unlit emitter, see vertexGlow). */
export const LED = { idle: 1.3, peak: 3.4, chevron: 1.15 } as const;
const RING_GLOW: RGB = [2.5, 2.45, 2.3];

const UP = v3(0, 1, 0);
const Y0 = THRESHOLD.y;

/** Non-indexed copy with only position and normal, tinted. */
function tinted(g: THREE.BufferGeometry, rgb: RGB): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal') n.deleteAttribute(name);
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  const count = n.getAttribute('position').count;
  const c = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return n;
}
/** Profile heights (above the floor) that carry the reflection ramp on the flat faces of a stainless block. */
export const RAMP_STOPS: readonly number[] = [0.3, 0.42, 0.52, 0.58, 0.62, 0.66, 0.72, 0.8, 0.9];
/**
 * Warm satin-steel reflection on a flat face: dark floor reflection below, bright wall above with a soft horizon between, a faint darker
 * horizontal band at 0.62 m (the ring light's edge) and a +-4 % vertical brushed variation along x (needs vertices every 0.1 m along x).
 * Needs vertices at RAMP_STOPS, see the body profile. `h` = height above the floor.
 */
export function rampTint(h: number, x: number, lo: RGB = FARE_TINT.bodyLow, hi: RGB = FARE_TINT.body): RGB {
  const t = Math.min(1, Math.max(0, (h - 0.2) / 0.6)), e = t * t * (3 - 2 * t);
  const band = 1 - 0.2 * Math.exp(-((h - 0.62) * (h - 0.62)) / (2 * 0.035 * 0.035));
  const k = 1 + 0.04 * Math.sin(x * 61.0) * Math.sin(x * 17.3 + 1.1);
  return [(lo[0] + (hi[0] - lo[0]) * e) * band * k, (lo[1] + (hi[1] - lo[1]) * e) * band * k, (lo[2] + (hi[2] - lo[2]) * e) * band * k];
}
export function ramped(g: THREE.BufferGeometry, floorY: number): THREE.BufferGeometry {
  const n = tinted(g, FARE_TINT.body);
  const p = n.getAttribute('position'), c = n.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const r = rampTint(p.getY(i) - floorY, p.getX(i)); c.setXYZ(i, r[0], r[1], r[2]); }
  return n;
}
const vertexCount = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;

/** Plan-space box along a run: `at` is the cross coordinate, t0..t1 the run extent, w the full width across the run. */
function along(axis: 'x' | 'z', at: number, t0: number, t1: number, w: number, y0: number, y1: number): THREE.BufferGeometry {
  const a = Math.min(t0, t1), b = Math.max(t0, t1);
  return axis === 'z' ? boxMM(at - w / 2, y0, a, at + w / 2, y1, b) : boxMM(a, y0, at - w / 2, b, y1, at + w / 2);
}

/** `extra`: further static stainless parts (totem frames) merged into the same geometry, before the animated blocks. */
export function buildFareGeometry(glass: GlassSink, extra: readonly TintedPart[] = []): FareGeometry {
  const L = SG.cabinetLength, hw = SG.cabinetThickness / 2, H = SG.cabinetHeight;
  const plH = SG.plinthH, gap = SG.plinthGap;
  const parts: TintedPart[] = [];
  const add = (g: THREE.BufferGeometry, rgb: RGB): void => { parts.push({ geo: tinted(g, rgb), rgb }); };

  // ---- cabinet: satin stainless body with 8 mm chamfers, chamfered vertical ends, 20 mm shadow-gap plinth, smoked-glass top inset,
  //      a validator zone (dark disc, soft white ring) at each lane entry ----------------------------------------------------------
  const c8 = 0.008;
  // intermediate profile points along the flat sides carry the reflection ramp (see `ramped`)
  const ramp = RAMP_STOPS;
  const body: P2[] = [[-hw, plH], [hw, plH], ...ramp.map((y): P2 => [hw, y]), [hw, H - c8], [hw - c8, H], [-hw + c8, H], [-hw, H - c8], ...[...ramp].reverse().map((y): P2 => [-hw, y])];
  const chamX = 0.014; // end chamfer: the end face is narrower by 2 x 0.018 across, over 14 mm along
  const frame = (x: number, z: number, s: number): Frame => ({ o: v3(x, Y0, z), a: v3(0, 0, s), b: UP.clone() });
  for (const c of fareLines().flatMap((l) => l.cabinets)) {
    const nSeg = Math.round((L - 2 * chamX) / 0.1);
    const fr = [frame(c.x - L / 2, c.z, 0.82)];
    for (let k = 0; k <= nSeg; k++) fr.push(frame(c.x - L / 2 + chamX + ((L - 2 * chamX) * k) / nSeg, c.z, 1));
    fr.push(frame(c.x + L / 2, c.z, 0.82));
    parts.push({ geo: ramped(sweep(body, fr, { closed: true, caps: true }), Y0), rgb: FARE_TINT.body });
    add(boxMM(c.x - L / 2 + gap + chamX, Y0, c.z - hw + gap, c.x + L / 2 - gap - chamX, Y0 + plH + 0.002, c.z + hw - gap), FARE_TINT.plinth);
    add(boxMM(c.x - L / 2 + 0.12, Y0 + H, c.z - 0.056, c.x + L / 2 - 0.12, Y0 + H + 0.003, c.z + 0.056), FARE_TINT.smoked);
    for (const e of [-1, 1] as const) {
      const vx = c.x + e * (L / 2 - 0.19);
      const disc = new THREE.CylinderGeometry(0.046, 0.046, 0.002, 28);
      disc.translate(vx, Y0 + H + 0.004, c.z);
      add(disc, FARE_TINT.smoked);
      const ring = new THREE.RingGeometry(0.049, 0.058, 40);
      ring.rotateX(-Math.PI / 2);
      ring.translate(vx, Y0 + H + 0.0052, c.z);
      add(ring, RING_GLOW);
    }
  }

  // ---- fixed glass barriers: 12 mm ultra-clear, slim stainless posts at <= 1.5 m, stainless top rail and base shoe -----------------
  const gH = SG.glassHeight, th = SG.glassThickness;
  const railH = 0.022, railW = 0.05, shoeH = 0.045, shoeW = 0.036, postR = 0.018, postGap = postR + 0.006, tuck = 0.012;
  const run = (g: FareGlassRun): void => {
    const dir = Math.sign(g.t1 - g.t0) || 1;
    const len = Math.abs(g.t1 - g.t0);
    const n = Math.max(1, Math.ceil(len / SG.postPitchMax));
    const tAt = (k: number): number => g.t0 + (dir * len * k) / n;
    const postEnd = (e: 'wall' | 'post' | 'cabinet'): boolean => e !== 'cabinet';
    // Wall ends reach 0.05 m into the drum: the end post stands just inside the wall face, not in it.
    const postT = (k: number): number => {
      const t = tAt(k);
      if (k === 0 && g.end0 === 'wall') return t + dir * 0.04;
      if (k === n && g.end1 === 'wall') return t - dir * 0.04;
      return t;
    };
    for (let k = 0; k <= n; k++) {
      if ((k === 0 && !postEnd(g.end0)) || (k === n && !postEnd(g.end1))) continue;
      const t = postT(k);
      const cyl = new THREE.CylinderGeometry(postR, postR, gH, 14);
      cyl.translate(g.axis === 'z' ? g.at : t, Y0 + gH / 2, g.axis === 'z' ? t : g.at);
      add(cyl, FARE_TINT.post);
    }
    add(along(g.axis, g.at, g.t0, g.t1, railW, Y0 + gH - railH, Y0 + gH), FARE_TINT.post);
    add(along(g.axis, g.at, g.t0, g.t1, shoeW, Y0, Y0 + shoeH), FARE_TINT.post);
    for (let k = 0; k < n; k++) {
      // a pane runs from one post (or a cabinet face) to the next; panes tuck 12 mm into a cabinet and stand clear of every post
      const first = k === 0 && !postEnd(g.end0), last = k === n - 1 && !postEnd(g.end1);
      const a = first ? tAt(0) - dir * tuck : postT(k) + dir * postGap;
      const b = last ? tAt(n) + dir * tuck : postT(k + 1) - dir * postGap;
      glass.addStatic(along(g.axis, g.at, a, b, th, Y0 + shoeH - 0.004, Y0 + gH - railH + 0.004));
    }
  };
  for (const l of fareLines()) for (const g of l.glass) run(g);

  // ---- moving leaves: two per lane, hinged 20 mm in front of each cabinet face, swinging 90 degrees to lie flat against it ---------
  const lanes = fareLines().flatMap((l) => l.lanes);
  const leafDefs: Array<Omit<LeafAnim, 'edgeStart' | 'edgeCount'> & { edge: THREE.BufferGeometry }> = [];
  const lw = 0.02, y0 = Y0 + 0.04, y1 = y0 + SG.leafHeight;
  lanes.forEach((lane, li) => {
    for (const s of [-1, 1] as const) {
      const d = -s; // from the cabinet face toward the lane centre
      const faceZ = lane.z + (s * lane.width) / 2;
      const hz = faceZ + d * lw;
      const w = lane.width / 2 - lw - 0.012;
      const zA = d > 0 ? hz : hz - w, zB = d > 0 ? hz + w : hz;
      const park = -lane.inward; // parks toward the unpaid side, along the cabinet face
      const leafGeo = boxMM(lane.x - SG.leafThickness / 2, y0, zA, lane.x + SG.leafThickness / 2, y1, zB);
      const r = glass.addLeaf(leafGeo);
      leafDefs.push({
        lane: li, hingeX: lane.x, hingeZ: hz, phiOpen: (Math.PI / 2) * park * d,
        glassStart: r.start, glassCount: r.count, edge: boxMM(lane.x - 0.008, y1, zA, lane.x + 0.008, y1 + 0.022, zB),
      });
    }
  });

  // ---- merge: [static | leaf edges | LED strips]: the two animated blocks are contiguous at the end -------------------------------
  const staticG = mergeGeometries([...parts, ...extra].map((p) => p.geo), false)!;
  const edgeGeos = leafDefs.map((d) => tinted(d.edge, FARE_TINT.post));
  const ledGeos: THREE.BufferGeometry[] = [];
  const ledY = Y0 + H + 0.0015;
  lanes.forEach((lane) => {
    for (const s of [-1, 1] as const) {
      // thin white line on the top edge of the cabinet, facing the lane
      const z = lane.z + s * (lane.width / 2 + 0.02);
      ledGeos.push(tinted(boxMM(lane.x - 0.6, ledY, z - 0.003, lane.x + 0.6, ledY + 0.0015, z + 0.003), [LED.idle, LED.idle * 0.98, LED.idle * 0.94]));
    }
  });
  // lane-mouth chevrons: flush floor inlays at both ends of every lane, pointing into the lane; emissive only when the lane is open
  const chevGeos: THREE.BufferGeometry[] = [];
  const CH = { len: 0.11, w: 0.016, half: 0.1, back: 0.3, y: 0.003 };
  lanes.forEach((lane) => {
    for (const e of [-1, 1] as const) {
      // tip toward the lane centre: arms sweep back (away from the lane) by +-half across
      const tipX = lane.x + e * (SG.cabinetLength / 2 + CH.back - 0.1);
      const ang = Math.atan2(CH.half, CH.len);
      for (const sgn of [-1, 1] as const) {
        const arm = boxMM(-CH.len / 2 / Math.cos(ang) * 1.0, 0, -CH.w / 2, CH.len / 2 / Math.cos(ang) * 1.0, CH.y, CH.w / 2);
        arm.rotateY(sgn * ang * -e);
        arm.translate(tipX + e * CH.len / 2, Y0 + 0.0005, lane.z + sgn * CH.half / 2);
        chevGeos.push(tinted(arm, [0.03, 0.03, 0.03]));
      }
    }
  });
  const edgeFrom = vertexCount(staticG);
  const leaves: LeafAnim[] = [];
  let off = edgeFrom;
  leafDefs.forEach((d, i) => {
    const count = vertexCount(edgeGeos[i]!);
    const { edge: _e, ...rest } = d; void _e;
    leaves.push({ ...rest, edgeStart: off, edgeCount: count });
    off += count;
  });
  const edgeTo = off;
  const ledVerts = vertexCount(ledGeos[0]!);
  const ledStart = lanes.map((_, i) => edgeTo + i * 2 * ledVerts);
  const chevFrom = edgeTo + ledGeos.length * ledVerts;
  const chevVerts = vertexCount(chevGeos[0]!) * 4; // per lane: two chevrons of two arms
  const chevStart = lanes.map((_, i) => chevFrom + i * chevVerts);
  const geo = mergeGeometries([staticG, ...edgeGeos, ...ledGeos, ...chevGeos], false)!;
  if (vertexCount(geo) !== chevFrom + lanes.length * chevVerts) throw new Error('fareLine: merged vertex count does not match the animation bookkeeping');
  return { geo, leaves, ledStart, ledVerts, edgeFrom, edgeTo, ledFrom: edgeTo, ledTo: vertexCount(geo), chevStart, chevVerts, triangles: vertexCount(geo) / 3 };
}
