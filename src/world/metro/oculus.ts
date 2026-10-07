import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { DISC, GANGWAY, OCULUS, OCULUS_DETAIL as OD, THROAT, voidRadiusAt } from '../../layoutMetro';
import { GeoBag, at, boxMM, latheMeters, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * The hall side of the oculus (spec §2.1): moulded stone curb, bronze openwork balustrade, the gangway with its
 * sliding gates, the throat curbs and balustrades, and the carved dome underside. Everything above the floor is
 * lit by the hall sun (hall materials); the dome and soffit mouldings below the slab use the void's masked stone.
 * All coordinates come from layoutMetro.ts.
 */

const { cx: CX, cz: CZ } = OCULUS;
const TAU = Math.PI * 2;
const SOUTH = Math.PI * 1.5; // angle whose point is (CX, CZ - r)
const UP = v3(0, 1, 0);
const CURB_TOP = OCULUS.curbHeight;
const GATE_Z = CZ - OCULUS.balustradeR;
const RAIL_TOP = OD.handrailTopY;
const SLAB = OCULUS.slabUnderY;
const COLLAR_BOTTOM = SLAB - OD.collarDepth;

// ---------------------------------------------------------------------------------------------
// profile helpers
// ---------------------------------------------------------------------------------------------
const dedupe = (pts: P2[]): P2[] => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - at(pts, i - 1)[0], p[1] - at(pts, i - 1)[1]) > 1e-6);
const deg = (d: number): number => (d * Math.PI) / 180;

/** Points on a circle arc (inclusive of both ends, degrees, CCW positive). */
function arcPts(a: number, b: number, r: number, from: number, to: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = deg(from + ((to - from) * i) / n);
    out.push([a + r * Math.cos(t), b + r * Math.sin(t)]);
  }
  return out;
}

/** S-curve (cyma) between two points, vertical tangents at both ends. Interior points only. */
function ogee(a0: number, b0: number, a1: number, b1: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const s = t * t * (3 - 2 * t);
    out.push([a0 + (a1 - a0) * s, b0 + (b1 - b0) * t]);
  }
  return out;
}

/** Ring curb section, a = radial offset from r = 9.3 (inner face at the opening, r 9.02), b = height above the floor. */
const RING_CURB: P2[] = dedupe([
  [0.3, SLAB], [0.3, 0.025], ...ogee(0.3, 0.025, 0.19, CURB_TOP - 0.045, 6), [0.19, CURB_TOP - 0.045], [0.19, CURB_TOP], [-0.25, CURB_TOP],
  ...arcPts(-0.25, CURB_TOP - 0.05, 0.05, 90, 270, 8), [-0.28, CURB_TOP - 0.1], [-0.28, SLAB],
]);

/** Throat curb section, a = outward from the hole edge (face at 0). Same family as the ring curb, narrower. */
const THROAT_CURB: P2[] = dedupe([
  [OD.throatCurbWidth, SLAB], [OD.throatCurbWidth, 0.02], ...ogee(OD.throatCurbWidth, 0.02, 0.22, CURB_TOP - 0.05, 5), [0.22, CURB_TOP - 0.05], [0.22, CURB_TOP],
  [0.05, CURB_TOP], ...arcPts(0.05, CURB_TOP - 0.05, 0.05, 90, 270, 8), [0.0, CURB_TOP - 0.1], [0.0, SLAB],
]);

/** Hanging collar under the slab edge (the soffit moulding): a = outward from the opening face, free side negative. */
const COLLAR: P2[] = [
  [0.03, COLLAR_BOTTOM], [0.03, SLAB], [-0.02, SLAB], [-0.04, SLAB - 0.04], [-0.12, SLAB - 0.08], [-0.2, SLAB - 0.12], [-0.22, SLAB - 0.18], [-0.2, SLAB - 0.24], [-0.14, COLLAR_BOTTOM],
];

/** Bronze bottom rail resting on the curb: relative to the curb top. */
const RAIL_BOTTOM: P2[] = [
  [-0.12, 0], [0.12, 0], [0.12, 0.04], [0.095, 0.06], [0.095, 0.12], [0.12, 0.145], [0.12, 0.17], [-0.12, 0.17], [-0.12, 0.145], [-0.095, 0.12], [-0.095, 0.06], [-0.12, 0.04],
];
const RAIL_BOTTOM_H = 0.17;
/** Carrier under the handrail. */
const RAIL_CARRIER: P2[] = [[-0.07, 0], [0.07, 0], [0.07, 0.03], [0.045, 0.06], [0.03, 0.08], [-0.03, 0.08], [-0.045, 0.06], [-0.07, 0.03]];
const HANDRAIL_R = 0.05;
const HANDRAIL_Y = RAIL_TOP - HANDRAIL_R;
const CARRIER_Y = HANDRAIL_Y - HANDRAIL_R - 0.08;
const HANDRAIL: P2[] = arcPts(0, 0, HANDRAIL_R, 0, 330, 11).map((p) => p as P2);

const BAL_Y0 = CURB_TOP + RAIL_BOTTOM_H;
const BAL_H = CARRIER_Y - BAL_Y0;
/** Baluster turning (radius, fraction of height). */
const BALUSTER: ReadonlyArray<readonly [number, number]> = [
  [0.034, 0], [0.05, 0.02], [0.05, 0.06], [0.036, 0.1], [0.036, 0.15], [0.06, 0.23], [0.077, 0.34], [0.07, 0.5], [0.04, 0.62], [0.036, 0.68], [0.05, 0.74], [0.05, 0.94], [0.034, 1],
];

const POST_R = 0.19;
const POST_H = 1.17;
const POST: P2[] = [
  [0, 0], [POST_R, 0], [POST_R, 0.05], [0.175, 0.09], [0.15, 0.13], [0.125, 0.2], [0.115, 0.3], [0.115, 0.9], [0.13, 0.96], [0.15, 1.0],
  [POST_R, 1.03], [POST_R, 1.1], [0.15, 1.13], [0.1, 1.16], [0, POST_H],
];
const FINIAL: P2[] = [[0, 0], [0.05, 0], [0.07, 0.03], [0.085, 0.08], [0.07, 0.13], [0.04, 0.17], [0.02, 0.2], [0, 0.23]];

// ---------------------------------------------------------------------------------------------
// path helpers
// ---------------------------------------------------------------------------------------------
interface Run {
  pts: THREE.Vector3[];
  cum: number[];
  length: number;
}

function makeRun(pts: THREE.Vector3[]): Run {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(at(cum, i - 1) + at(pts, i).distanceTo(at(pts, i - 1)));
  return { pts, cum, length: at(cum, cum.length - 1) };
}
const legRun = (x0: number, z0: number, x1: number, z1: number): Run => makeRun([v3(x0, 0, z0), v3(x1, 0, z1)]);
function arcRun(r: number, a0: number, a1: number): Run {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (TAU / (OD.ringSegments * 2))));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    pts.push(v3(CX + r * Math.cos(t), 0, CZ + r * Math.sin(t)));
  }
  return makeRun(pts);
}

/** Point and unit tangent at arc length s. */
function pointAt(run: Run, s: number): { p: THREE.Vector3; t: THREE.Vector3 } {
  const ss = Math.min(run.length, Math.max(0, s));
  let i = 1;
  while (i < run.pts.length - 1 && at(run.cum, i) < ss) i++;
  const p0 = at(run.pts, i - 1), p1 = at(run.pts, i);
  const seg = at(run.cum, i) - at(run.cum, i - 1);
  const f = seg > 0 ? (ss - at(run.cum, i - 1)) / seg : 0;
  return { p: p0.clone().lerp(p1, f), t: p1.clone().sub(p0).normalize() };
}

/** Frames along a run at height y: profile a = horizontal across the path, b = up. */
function runFrames(run: Run, y: number): Frame[] {
  return run.pts.map((p, i) => {
    const prev = at(run.pts, Math.max(0, i - 1)), next = at(run.pts, Math.min(run.pts.length - 1, i + 1));
    const t = next.clone().sub(prev).normalize();
    return { o: v3(p.x, y, p.z), a: v3(-t.z, 0, t.x), b: UP.clone() };
  });
}

/** Frames of a moulding hugging a straight line: `o` along the path, a = outward direction. */
const edgeFrames = (p0: THREE.Vector3, p1: THREE.Vector3, out: THREE.Vector3): Frame[] => [
  { o: p0.clone(), a: out.clone(), b: UP.clone() }, { o: p1.clone(), a: out.clone(), b: UP.clone() },
];

// ---------------------------------------------------------------------------------------------
// gate leaves (one mesh pair, vertices slid on the CPU)
// ---------------------------------------------------------------------------------------------
const LEAF_HALF = GANGWAY.halfWidth;
const LEAF_Y0 = 0.07;
const LEAF_Y1 = 1.2;
const LEAF_SLIDE = GANGWAY.halfWidth + 0.02; // an open leaf sits fully inside its pier (x from halfWidth to 2 * halfWidth)

const ease = (t: number): number => t * t * (3 - 2 * t);

interface Gate { bronze: THREE.Mesh; glass: THREE.Mesh; setOpen(f: number): void }

function buildGate(lib: MaterialLibrary, bronzeMat: THREE.Material, glassMat: THREE.Material): Gate {
  const makeLeaf = (sg: 1 | -1): { bronze: THREE.BufferGeometry; glass: THREE.BufferGeometry } => {
    const bb = new GeoBag(lib, 'castIron', 1), gb = new GeoBag(lib, 'glass', 1);
    const x0 = sg > 0 ? 0.006 : -(LEAF_HALF - 0.006), x1 = sg > 0 ? LEAF_HALF - 0.006 : -0.006;
    const zt = 0.025;
    const stile = 0.07;
    const midY = 0.62;
    const box = (xa: number, ya: number, xb: number, yb: number, t = zt): void => { bb.add(boxMM(xa, ya, GATE_Z - t, xb, yb, GATE_Z + t)); };
    box(x0, LEAF_Y0, x0 + stile, LEAF_Y1);
    box(x1 - stile, LEAF_Y0, x1, LEAF_Y1);
    box(x0, LEAF_Y0, x1, LEAF_Y0 + 0.14);
    box(x0, LEAF_Y1 - 0.09, x1, LEAF_Y1);
    box(x0 + stile, midY - 0.02, x1 - stile, midY + 0.02, 0.02);
    box((x0 + x1) / 2 - 0.015, LEAF_Y0 + 0.14, (x0 + x1) / 2 + 0.015, LEAF_Y1 - 0.09, 0.02);
    const pane = (ya: number, yb: number): void => { gb.add(boxMM(x0 + stile * 0.9, ya, GATE_Z - 0.006, x1 - stile * 0.9, yb, GATE_Z + 0.006)); };
    pane(LEAF_Y0 + 0.12, midY - 0.015);
    pane(midY + 0.015, LEAF_Y1 - 0.07);
    return { bronze: bb.merge()!, glass: gb.merge()! };
  };
  const R = makeLeaf(1), L = makeLeaf(-1);
  const combine = (a: THREE.BufferGeometry, b: THREE.BufferGeometry): { geo: THREE.BufferGeometry; base: Float32Array; sign: Float32Array } => {
    const geo = mergeGeometries([a, b], false);
    const base = Float32Array.from((geo.getAttribute('position') as THREE.BufferAttribute).array);
    const sign = new Float32Array(geo.getAttribute('position').count);
    sign.fill(1, 0, a.getAttribute('position').count);
    sign.fill(-1, a.getAttribute('position').count);
    return { geo, base, sign };
  };
  const cb = combine(R.bronze, L.bronze), cg = combine(R.glass, L.glass);
  const mk = (c: { geo: THREE.BufferGeometry }, m: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(c.geo, m);
    mesh.frustumCulled = false; // vertices move on the CPU
    mesh.userData.noShadow = true; // the static shadow map would freeze one gate state
    return mesh;
  };
  const bronze = mk(cb, bronzeMat), glass = mk(cg, glassMat);
  glass.renderOrder = 2;
  const slide = (c: { geo: THREE.BufferGeometry; base: Float32Array; sign: Float32Array }, d: number): void => {
    const pos = c.geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setX(i, c.base[i * 3]! + c.sign[i]! * d);
    pos.needsUpdate = true;
  };
  return { bronze, glass, setOpen(f: number): void { const d = LEAF_SLIDE * ease(f); slide(cb, d); slide(cg, d); } };
}

// ---------------------------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------------------------
export interface OculusBuild {
  group: THREE.Group;
  /** Per displayed frame: slides the gate leaves toward `open` (GANGWAY.gateSeconds, real time, ease). */
  update(open: boolean): void;
}

export function buildOculus(lib: MaterialLibrary, kit: MetroMaterials, startOpen: boolean): OculusBuild {
  const group = new THREE.Group();
  group.name = 'metroOculus';

  // hall-lit materials (the sun mask belongs to the void set only)
  const hallBronze = new THREE.MeshStandardMaterial({ name: 'oculusBronze', color: 0x5b4126, metalness: 0.88, roughness: 0.4 });
  const hallBrass = (lib.get('brass') as THREE.MeshStandardMaterial).clone();
  hallBrass.name = 'oculusBrass';
  const inlayBrass = hallBrass.clone();
  inlayBrass.name = 'oculusInlayBrass';
  inlayBrass.polygonOffset = true; inlayBrass.polygonOffsetFactor = -2; inlayBrass.polygonOffsetUnits = -2; // wins against the coplanar floor
  const hallGlass = new THREE.MeshPhysicalMaterial({
    name: 'oculusGlass', color: 0xe4f2ee, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.4,
  });
  const stoneMat = lib.get('floorMarble');
  const darkMat = lib.get('darkMarble');

  const stone = new GeoBag(lib, 'floorMarble');
  const dark = new GeoBag(lib, 'darkMarble');
  const bronze = new GeoBag(lib, 'castIron', 1);
  const brass = new GeoBag(lib, 'brass');
  const inlayBag = new GeoBag(lib, 'brass');
  const glass = new GeoBag(lib, 'glass', 1);
  const voidStone = new GeoBag(lib, 'wallStone', kit.metersPerTile.carvedStone);

  // ---- curb ring: 96-grid vertices identical to the floor hole ---------------------------------
  const step = TAU / OD.ringSegments;
  const gapA = SOUTH + OD.curbGapSteps * step;
  const gapB = SOUTH + TAU - OD.curbGapSteps * step;
  const ringFrames = (a0: number, a1: number, r: number, n: number): Frame[] => {
    const fr: Frame[] = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      const radial = v3(Math.cos(t), 0, Math.sin(t));
      fr.push({ o: v3(CX + r * radial.x, 0, CZ + r * radial.z), a: radial, b: UP.clone() });
    }
    return fr;
  };
  stone.add(sweep(RING_CURB, ringFrames(gapA, gapB, OCULUS.balustradeR, OD.ringSegments - 2 * OD.curbGapSteps), { closed: true, caps: true }));

  // brass inlay flush in the floor, just outside the curb; broken where the throat holes come close and at the gangway
  {
    const [r0, r1] = OD.inlayR;
    const rm = (r0 + r1) / 2;
    const inlay: P2[] = [[r0 - rm, 0], [r1 - rm, 0], [r1 - rm, 0.006], [r0 - rm, 0.006]];
    const inThroat = (x: number, z: number): boolean => THROAT.bands.some(([a, b]) => x > a - 0.25 && x < b + 0.25 && z < THROAT.zMax + 0.25);
    const n = OD.ringSegments * 2;
    let cur: Frame[] = [];
    const flush = (): void => { if (cur.length >= 2) inlayBag.add(sweep(inlay, cur, { closed: true, caps: true })); cur = []; };
    for (let i = 0; i <= n; i++) {
      const t = gapA + ((gapB - gapA) * i) / n;
      const radial = v3(Math.cos(t), 0, Math.sin(t));
      const x = CX + rm * radial.x, z = CZ + rm * radial.z;
      if (inThroat(x, z)) { flush(); continue; }
      cur.push({ o: v3(x, 0.0, z), a: radial, b: UP.clone() });
    }
    flush();
  }

  // ---- soffit collar under the slab at the ring ------------------------------------------------
  voidStone.add(sweep(COLLAR, ringFrames(0, TAU, OCULUS.r, OD.ringSegments * 2), { closed: true }));

  // ---- balustrade ---------------------------------------------------------------------------------
  const balusters: THREE.Matrix4[] = [];
  const posts: Array<{ p: THREE.Vector3 }> = [];
  function balustrade(run: Run): void {
    const fr = runFrames(run, 0);
    const at0 = (y: number): Frame[] => fr.map((f) => ({ ...f, o: f.o.clone().setY(y) }));
    bronze.add(sweep(RAIL_BOTTOM, at0(CURB_TOP), { closed: true, caps: true }));
    bronze.add(sweep(RAIL_CARRIER, at0(CARRIER_Y), { closed: true, caps: true }));
    brass.add(sweep(HANDRAIL, at0(HANDRAIL_Y), { closed: true }));
    const nSeg = Math.max(1, Math.round(run.length / OD.postSpacing));
    const clear = POST_R + 0.08;
    for (let i = 0; i <= nSeg; i++) {
      const p = pointAt(run, (run.length * i) / nSeg).p;
      if (!posts.some((q) => q.p.distanceTo(p) < 0.1)) posts.push({ p }); // runs meeting at a corner share one post
    }
    for (let i = 0; i < nSeg; i++) {
      const s0 = (run.length * i) / nSeg + clear, s1 = (run.length * (i + 1)) / nSeg - clear;
      const n = Math.max(1, Math.round((s1 - s0) / OD.balusterPitch));
      for (let k = 0; k <= n; k++) {
        const { p } = pointAt(run, s0 + ((s1 - s0) * k) / n);
        balusters.push(new THREE.Matrix4().makeTranslation(p.x, BAL_Y0, p.z));
      }
    }
  }
  const gapDeg = deg(OD.balustradeGapDeg);
  balustrade(arcRun(OCULUS.balustradeR, SOUTH + gapDeg, SOUTH + TAU - gapDeg));

  const postGeo = latheMeters(POST, 12, 1, 1);
  const finialGeo = latheMeters(FINIAL, 10, 1, 1);

  // ---- throats --------------------------------------------------------------------------------------
  const [zMin, zMax] = [THROAT.zMin, THROAT.zMax];
  const cw = OD.throatCurbWidth;
  const off = cw / 2;
  for (const sg of [1, -1] as const) {
    const band = THROAT.bands.find(([a, b]) => Math.sign(a + b) === sg)!;
    const xIn = sg > 0 ? band[0] : band[1], xOut = sg > 0 ? band[1] : band[0]; // hole edges: nearer / farther from the axis
    const toAxis = v3(-sg, 0, 0), away = v3(sg, 0, 0), north = v3(0, 0, 1);
    // curbs lining the hole edge (face on the edge, section outward)
    stone.add(sweep(THROAT_CURB, edgeFrames(v3(xIn, 0, zMin), v3(xIn, 0, OD.throatInnerCurbZMax), toAxis), { closed: true, caps: true }));
    stone.add(sweep(THROAT_CURB, edgeFrames(v3(xOut, 0, zMin), v3(xOut, 0, zMax), away), { closed: true, caps: true }));
    stone.add(sweep(THROAT_CURB, edgeFrames(v3(sg * OD.throatNorthInnerX, 0, zMax), v3(xOut + sg * cw, 0, zMax), north), { closed: true, caps: true }));
    // the carved soffit edge where F1 dives under the slab
    voidStone.add(sweep(COLLAR, edgeFrames(v3(sg * OD.throatNorthInnerX, 0, zMax), v3(xOut, 0, zMax), north), { closed: true, caps: true }));
    // bronze balustrade on the curbs
    const zEndIn = OD.throatInnerCurbZMax - 0.25, zNorth = zMax + off;
    balustrade(legRun(xIn - sg * off, zMin + 0.15, xIn - sg * off, zEndIn));
    balustrade(legRun(xOut + sg * off, zMin + 0.15, xOut + sg * off, zNorth));
    balustrade(legRun(xOut + sg * off, zNorth, sg * (OD.throatNorthInnerX + 0.2), zNorth));
  }
  for (const { p } of posts) {
    const m = new THREE.Matrix4().makeTranslation(p.x, CURB_TOP, p.z);
    bronze.add(postGeo, m);
    brass.add(finialGeo, new THREE.Matrix4().makeTranslation(p.x, CURB_TOP + POST_H, p.z));
  }

  // ---- gangway ------------------------------------------------------------------------------------
  const zA = GATE_Z - 0.4;                                  // under the sill plate
  const zB = CZ - DISC.r - GANGWAY.discClearance;                // deck end, short of the disc edge
  const hw = GANGWAY.halfWidth;
  dark.add(boxMM(-hw, -0.1, zA, hw, -0.004, zB));
  const girder: P2[] = [
    [-0.12, -GANGWAY.girderDepth], [0.12, -GANGWAY.girderDepth], [0.12, -0.22], [0.17, -0.2], [0.17, -0.08], [0.12, -0.05], [0.12, 0], [-0.12, 0],
  ];
  const capP: P2[] = [[-0.055, 0], [0.055, 0], [0.055, 0.05], [0.035, 0.09], [-0.035, 0.09], [-0.055, 0.05]];
  const pz0 = GATE_Z + 0.2, pz1 = zB - 0.02;
  for (const sg of [1, -1] as const) {
    bronze.add(sweep(girder, edgeFrames(v3(sg * hw, 0, zA), v3(sg * hw, 0, zB), v3(sg, 0, 0)), { closed: true, caps: true }));
    bronze.add(boxMM(sg * hw - 0.045, 0, pz0, sg * hw + 0.045, 0.1, pz1));
    const capY = GANGWAY.parapetHeight - 0.09;
    bronze.add(sweep(capP, edgeFrames(v3(sg * hw, capY, pz0), v3(sg * hw, capY, pz1), v3(sg, 0, 0)), { closed: true, caps: true }));
    const nb = Math.max(1, Math.round((pz1 - pz0) / GANGWAY.stanchionPitch));
    for (let i = 0; i <= nb; i++) {
      const z = pz0 + ((pz1 - pz0) * i) / nb;
      bronze.add(boxMM(sg * hw - 0.022, 0.1, z - 0.022, sg * hw + 0.022, capY, z + 0.022));
      if (i < nb) {
        const zn = pz0 + ((pz1 - pz0) * (i + 1)) / nb;
        glass.add(boxMM(sg * hw - 0.007, 0.12, z + 0.035, sg * hw + 0.007, capY - 0.02, zn - 0.035));
      }
    }
  }
  // brass sill across the gate line (covers the curb gap, sits on the hall floor)
  brass.add(boxMM(-hw - 0.1, 0, GATE_Z - 0.3, hw + 0.1, 0.02, GATE_Z + 0.3));

  // gate piers: bronze, house the leaves when open
  {
    const po = GANGWAY.pierOuterX, ph = GANGWAY.pierHeight, d = GANGWAY.pierDepth / 2;
    for (const sg of [1, -1] as const) {
      const bx = (xa: number, ya: number, xb: number, yb: number, dz: number): void => {
        bronze.add(boxMM(Math.min(sg * xa, sg * xb), ya, GATE_Z - dz, Math.max(sg * xa, sg * xb), yb, GATE_Z + dz));
      };
      bx(hw - 0.03, 0, po + 0.03, 0.2, d + 0.03);            // plinth
      bx(hw - 0.01, 0.2, po + 0.01, 0.26, d + 0.012);
      bx(hw, 0.26, po, ph - 0.12, d);                          // slim shaft
      bx(hw - 0.03, ph - 0.12, po + 0.03, ph - 0.07, d + 0.03); // bronze necking
      brass.add(boxMM(Math.min(sg * (hw - 0.05), sg * (po + 0.05)), ph - 0.07, GATE_Z - d - 0.05, Math.max(sg * (hw - 0.05), sg * (po + 0.05)), ph, GATE_Z + d + 0.05)); // brass cap
      // brass fillet frames on the two broad faces
      for (const fz of [-1, 1]) {
        const zf = GATE_Z + fz * (d + 0.004);
        const t = 0.014;
        const xa = hw + 0.14, xb = po - 0.14, ya = 0.4, yb = ph - 0.3;
        for (const [x0, y0, x1, y1] of [[xa, ya, xb, ya + t], [xa, yb - t, xb, yb], [xa, ya, xa + t, yb], [xb - t, ya, xb, yb]] as const) {
          brass.add(boxMM(Math.min(sg * x0, sg * x1), y0, zf - 0.004, Math.max(sg * x0, sg * x1), y1, zf + 0.004));
        }
      }
      brass.add(finialGeo, new THREE.Matrix4().makeTranslation(sg * (hw + po) / 2, ph, GATE_Z));
    }
  }

  // ---- carved dome underside ------------------------------------------------------------------------
  {
    const RIB: P2[] = [
      [-0.15, -0.03], [0.15, -0.03], [0.15, 0.04], [0.11, 0.07], [0.11, 0.11], [0.065, 0.15], [-0.065, 0.15], [-0.11, 0.11], [-0.11, 0.07], [-0.15, 0.04],
    ];
    const meridian = (y: number): { r: number; radial: number; up: number } => {
      const e = 0.05;
      const dr = (voidRadiusAt(y - e) - voidRadiusAt(y + e)) / (2 * e); // dr/d(-y)
      // path goes down: tangent (dr, -1) in (radial, y); inward normal = (dy, -dr) = (-1, -dr)
      const L = Math.hypot(dr, 1);
      return { r: voidRadiusAt(y), radial: -1 / L, up: -dr / L };
    };
    const ys: number[] = [];
    for (let y = OD.ribYTop; y >= OD.ribYBottom - 1e-6; y -= 0.25) ys.push(y);
    for (let k = 0; k < OD.ribCount; k++) {
      const phi = (k / OD.ribCount) * TAU;
      const rad = v3(Math.cos(phi), 0, Math.sin(phi)), tan = v3(-Math.sin(phi), 0, Math.cos(phi));
      const fr: Frame[] = ys.map((y) => {
        const m = meridian(y);
        return { o: v3(CX + m.r * rad.x, y, CZ + m.r * rad.z), a: tan.clone(), b: rad.clone().multiplyScalar(m.radial).add(v3(0, m.up, 0)).normalize() };
      });
      voidStone.add(sweep(RIB, fr, { closed: true, caps: true }));
    }
    const nRing = OD.ringSegments * 2;
    for (const y of OD.ribRingYs) {
      const m = meridian(y);
      const alongM = v3(0, 0, 0);
      const fr: Frame[] = [];
      for (let i = 0; i <= nRing; i++) {
        const phi = (i / nRing) * TAU;
        const rad = v3(Math.cos(phi), 0, Math.sin(phi));
        // a = along the meridian (down-and-out), b = inward normal
        alongM.copy(rad).multiplyScalar(-m.up).add(v3(0, m.radial, 0)).normalize(); // perpendicular to the normal in the meridian plane
        const bvec = rad.clone().multiplyScalar(m.radial).add(v3(0, m.up, 0)).normalize();
        fr.push({ o: v3(CX + m.r * rad.x, y, CZ + m.r * rad.z), a: alongM.clone(), b: bvec });
      }
      voidStone.add(sweep(RIB, fr, { closed: true }));
    }
  }

  // ---- meshes ----------------------------------------------------------------------------------------
  const addMesh = (bag: GeoBag, mat: THREE.Material, name: string, renderOrder = 0): void => {
    const geo = bag.merge();
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.renderOrder = renderOrder;
    if (mat.transparent) m.userData.noShadow = true;
    group.add(m);
  };
  addMesh(stone, stoneMat, 'oculusStone');
  addMesh(dark, darkMat, 'oculusDeck');
  addMesh(bronze, hallBronze, 'oculusBronze');
  addMesh(brass, hallBrass, 'oculusBrass');
  addMesh(inlayBag, inlayBrass, 'oculusInlay');
  addMesh(glass, hallGlass, 'oculusParapetGlass', 2);
  addMesh(voidStone, kit.carvedStone, 'oculusDome');

  const balGeo = latheMeters(BALUSTER.map(([r, f]): P2 => [r, f * BAL_H]), 8, 1, 1);
  const bal = new THREE.InstancedMesh(balGeo, hallBronze, balusters.length);
  balusters.forEach((m, i) => bal.setMatrixAt(i, m));
  bal.instanceMatrix.needsUpdate = true;
  bal.name = 'oculusBalusters';
  group.add(bal);

  const gate = buildGate(lib, hallBronze, hallGlass);
  gate.bronze.name = 'oculusGateFrames';
  gate.glass.name = 'oculusGateGlass';
  group.add(gate.bronze, gate.glass);

  let phase = startOpen ? 1 : 0;
  let lastS = performance.now() / 1000;
  gate.setOpen(phase);
  return {
    group,
    update(open: boolean): void {
      const nowS = performance.now() / 1000;
      const dt = Math.min(0.1, nowS - lastS); // REAL time: the gate must work at ?timescale=0 too
      lastS = nowS;
      const target = open ? 1 : 0;
      if (phase === target) return;
      const dir = Math.sign(target - phase);
      phase += dir * (dt / GANGWAY.gateSeconds);
      if ((dir > 0 && phase >= target) || (dir < 0 && phase <= target)) phase = target;
      gate.setOpen(phase);
    },
  };
}
