import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ESCALATOR, ESCALATOR_VIS as V, escalatorUnits, type EscalatorUnit } from '../../layoutMetro';
import { escalators } from '../../metro/escalators';
import { excludeDirectionalLight } from '../../lighting/sunMask';
import type { MetroMaterialSet } from './materials';
import { installSharedVoidLight } from './voidLight';

/**
 * Real escalators (spec §2.3, §4): stainless truss, glass balustrades, black rubber handrail with a newel loop, warm skirt
 * line, champagne combplates, and one instanced step mesh per group whose steps ride the unit's path in the vertex shader
 * (flat run, transition arc, 30 degree incline, transition arc, flat run; wrapped by the step pitch so they flow without popping).
 *
 * Per group (void = F1..F4, deep = F5/F6) four draw calls: metal (truss, base, rail, newel, combplates; vertex-coloured),
 * glass, warm skirt strip, steps. Phase per unit comes from `escalators.phase` (real time, shared Float32Array).
 *
 * Local frame of a unit: x across, y up from the upper end level, z = u along the flight from the upper end towards the lower end.
 * The step path is flat beyond each end (hidden under the landing, sunk below it) so it can never poke through the decks.
 */

/** Micro-detail of the escalator builder (metres unless noted). Dimensions other modules depend on live in ESCALATOR_VIS. */
const ESC_DETAIL = {
  /** Combplate lip ramp: distance the lip fade starts inside the end plane. */
  lipRampInset: 0.03,
  /** Combplate grooves: lateral pitch, half width, start/stop insets from the end plane / outer edge, raise above the plate top, plate top height. */
  grooveCount: 4, groovePitch: 0.11, grooveHalfW: 0.004, grooveStartInset: 0.06, grooveEndInset: 0.04, grooveRaise: 0.0006, plateTop: 0.008,
  /** Glass runs this far past each incline end; newel pier gap to the glass; handrail runs this far past each end before the loop. */
  glassOverrun: 0.04, newelGap: 0.04, railOverrun: 0.3,
  /** Handrail loop tube: radius (m), path samples, radial segments, arc samples. */
  loopTubeR: 0.03, loopTubeSegs: 10, loopTubeRadial: 8, loopArcSteps: 8, rubberSides: 12,
  /** Skirt strip: offset in front of the skirt face and half thickness. */
  stripOffset: 0.002, stripHalfT: 0.0015,
  /** Step body: front riser thickness, side inset of the underbody; tread tint (linear multiplier over the stainless), riser and underbody colours. */
  riserThick: 0.03, underInset: 0.03, treadTint: 1.3,
  /** Step tread grooves (shader): pitch across the tread (m), groove band edges in the triangle wave, fade by screen derivative, riser rib strength, darkening and roughness. */
  stepGroovePitch: 0.03, grooveBand0: 0.55, grooveBand1: 0.78, grooveAA0: 0.25, grooveAA1: 0.7, riserRib: 0.5, grooveDark: 0.5, grooveRough: 0.9,
} as const;
const D = ESC_DETAIL;
const RISER_COL: readonly [number, number, number] = [0.1, 0.1, 0.11];
const UNDER_COL: readonly [number, number, number] = [0.05, 0.05, 0.055];

const TH = (ESCALATOR.angleDeg * Math.PI) / 180;
const C = Math.cos(TH), S = Math.sin(TH);
const R = V.transitionR;
const T = R * Math.tan(TH / 2);
const E = V.flatEnd;

interface Breaks { a0: number; a1: number; a2: number; a3: number; a4: number; run: number; drop: number }
function breaks(linc: number): Breaks {
  const a0 = E - T, a1 = a0 + R * TH, a2 = a1 + linc - 2 * T, a3 = a2 + R * TH, a4 = a3 + E - T;
  return { a0, a1, a2, a3, a4, run: linc * C, drop: linc * S };
}
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Step top-centre position at chain parameter s (JS twin of the vertex shader). `sink` applies the below-landing dive at both ends. */
export function pathAt(s: number, linc: number, sink = true): { u: number; v: number } {
  const b = breaks(linc);
  let u: number, v: number;
  if (s < b.a0) { u = -E + s; v = 0; }
  else if (s < b.a1) { const f = (s - b.a0) / R; u = -T + R * Math.sin(f); v = -R + R * Math.cos(f); }
  else if (s < b.a2) { const t = T + (s - b.a1); u = t * C; v = -t * S; }
  else if (s < b.a3) { const p = (s - b.a2) / R; u = b.run + T - R * Math.sin(TH - p); v = -b.drop + R - R * Math.cos(TH - p); }
  else { u = b.run + T + (s - b.a3); v = -b.drop; }
  if (sink) v -= V.sink * smooth(V.sinkStart, V.sinkEnd, Math.max(-u, u - b.run));
  return { u, v };
}
/** Total chain length of the visible path. */
export const pathLength = (linc: number): number => breaks(linc).a4;
/** Inverse of u(s) on the (monotonic) path, by bisection. */
function sOfU(u: number, linc: number): number {
  let lo = 0, hi = breaks(linc).a4;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (pathAt(m, linc, false).u < u) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** Polyline (u, v) of the step line between u0 and u1: path breakpoints plus arc subdivisions. */
function samples(u0: number, u1: number, linc: number): Array<{ u: number; v: number }> {
  const b = breaks(linc);
  const s0 = sOfU(u0, linc), s1 = sOfU(u1, linc);
  const ss = new Set<number>([s0, s1]);
  const add = (a: number, c: number, n: number): void => { for (let i = 0; i <= n; i++) { const s = a + ((c - a) * i) / n; if (s > s0 && s < s1) ss.add(s); } };
  add(b.a0, b.a1, 8); add(b.a2, b.a3, 8);
  for (const k of [b.a0, b.a1, b.a2, b.a3]) if (k > s0 && k < s1) ss.add(k);
  return [...ss].sort((p, q) => p - q).map((s) => pathAt(s, linc, false));
}

// --- mesh builder ---------------------------------------------------------------------------------------------------

type RGB = readonly [number, number, number];
class Bag {
  readonly pos: number[] = []; readonly nrm: number[] = []; readonly uv: number[] = []; readonly col: number[] = [];
  add(g: THREE.BufferGeometry, color: RGB): void {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.getAttribute('position'), n = ng.getAttribute('normal'), uv = ng.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i)); this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); this.col.push(color[0], color[1], color[2]);
    }
  }
  geometry(): THREE.BufferGeometry | null {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Closed solid from a profile (x, y offsets above the path) swept along a (u, v) polyline: flat or smooth shaded, outward normals. */
function sweep(path: Array<{ u: number; v: number }>, profile: Array<[number, number]>, smoothShade = false): THREE.BufferGeometry {
  let prof = profile;
  let area = 0;
  for (let i = 0; i < prof.length; i++) { const [x0, y0] = prof[i]!; const [x1, y1] = prof[(i + 1) % prof.length]!; area += x0 * y1 - x1 * y0; }
  if (area < 0) prof = [...prof].reverse();
  const n = prof.length;
  const en = prof.map(([x0, y0], i) => { const [x1, y1] = prof[(i + 1) % n]!; const dx = x1 - x0, dy = y1 - y0; const l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l] as const; });
  const vn = prof.map((_, i) => { const a = en[(i + n - 1) % n]!, b = en[i]!; const x = a[0] + b[0], y = a[1] + b[1]; const l = Math.hypot(x, y) || 1; return [x / l, y / l] as const; });
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  let dist = 0;
  const dists = path.map((p, k) => { if (k) dist += Math.hypot(p.u - path[k - 1]!.u, p.v - path[k - 1]!.v); return dist; });
  const pp = (k: number, i: number): number[] => [prof[i]![0], path[k]!.v + prof[i]![1], path[k]!.u];
  const push = (a: number[], na: readonly number[], ua: number, va: number): void => { pos.push(...a); nrm.push(na[0]!, na[1]!, 0); uv.push(ua, va); };
  for (let k = 0; k + 1 < path.length; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const quad = [[k, i], [k + 1, i], [k + 1, j], [k, j]] as const;
      for (const tri of [[0, 3, 2], [0, 2, 1]] as const) {
        for (const q of tri) {
          const [kk, ii] = quad[q]!;
          const nn = smoothShade ? vn[ii]! : en[i]!;
          push(pp(kk, ii), nn, dists[kk]!, ii / n);
        }
      }
    }
  }
  const cap = (k: number, nz: number): void => {
    let cx = 0, cy = 0; for (const [x, y] of prof) { cx += x / n; cy += y / n; }
    const c = [cx, path[k]!.v + cy, path[k]!.u];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (const p of nz > 0 ? [c, pp(k, i), pp(k, j)] : [c, pp(k, j), pp(k, i)]) { pos.push(...p); nrm.push(0, 0, nz); uv.push(p[0]!, p[1]!); }
    }
  };
  cap(0, -1); cap(path.length - 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return orient(g);
}
/** Flip winding if the solid is inside out (signed volume < 0). Normals are authored outward already. */
function orient(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  let vol = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i), bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1), cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) {
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      const sz = a.itemSize;
      for (let i = 0; i < a.count; i += 3) for (let c = 0; c < sz; c++) { const t = a.array[(i + 1) * sz + c]!; a.array[(i + 1) * sz + c] = a.array[(i + 2) * sz + c]!; a.array[(i + 2) * sz + c] = t; }
    }
  }
  return g;
}
const rect = (x0: number, x1: number, y0: number, y1: number): Array<[number, number]> => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 12): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)]);
/** Rounded rectangle section (corner radius r), same orientation family as `rect`. */
const roundRect = (x0: number, x1: number, y0: number, y1: number, r: number, n = 4): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (const [cx, cy, a0] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]] as const) {
    for (let i = 0; i <= n; i++) { const a = ((a0 + (90 * i) / n) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return out;
};
const flat = (u0: number, u1: number, v = 0): Array<{ u: number; v: number }> => [{ u: u0, v }, { u: u1, v }];

const STAINLESS: RGB = [1, 1, 1];
const TRUSS: RGB = [0.72, 0.74, 0.76];
/** Champagne over the stainless base colour (0xcdbb98 / 0xcdd2d5 in linear). */
const CHAMPAGNE: RGB = [1.0, 0.78, 0.47];
/** Newel cladding: brushed stainless like the truss (not the bright base colour). */
const NEWEL: RGB = [0.66, 0.69, 0.72];
const RUBBER: RGB = [0.035, 0.035, 0.04];

/** Lip height of the bottom-end combplate at distance d beyond the end (0 at the outer edge). */
const lipAt = (d: number): number => V.combLip * (1 - (d + D.lipRampInset) / (V.combBody + D.lipRampInset));

/** Champagne combplate: body outside the end, teeth reaching into the steps. `end`: 0 top, 1 bottom (lipped, sloping to the landing). */
function combplate(linc: number, end: 0 | 1): THREE.BufferGeometry {
  const hw = V.stepHalfWidth, L = breaks(linc).run;
  const shape = new THREE.Shape();
  // outline in (x, d): d = distance from the end plane, positive outward (away from the incline); teeth at negative d
  const body = V.combBody, teeth = V.combTeeth;
  const nT = Math.floor((2 * hw) / V.combToothPitch);
  const x0 = -hw;
  shape.moveTo(x0, body); shape.lineTo(x0, 0);
  for (let i = 0; i < nT; i++) {
    const xa = x0 + (i + 0.5) * V.combToothPitch - V.combToothWidth / 2;
    shape.lineTo(xa, 0); shape.lineTo(xa, -teeth); shape.lineTo(xa + V.combToothWidth, -teeth); shape.lineTo(xa + V.combToothWidth, 0);
  }
  shape.lineTo(hw, 0); shape.lineTo(hw, body); shape.lineTo(x0, body);
  const ex = new THREE.ExtrudeGeometry(shape, { depth: V.combThickness, bevelEnabled: false, curveSegments: 1 });
  const g = ex.index ? ex.toNonIndexed() : ex;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), d = p.getY(i), t = p.getZ(i);
    const u = end === 0 ? -d : L + d;
    p.setXYZ(i, x, t - V.combThickness + D.plateTop + (end === 1 ? lipAt(d) : 0), u);
    uv[i * 2] = x; uv[i * 2 + 1] = u;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const og = orient(g);
  og.computeVertexNormals();
  return og;
}

function combGrooves(linc: number, end: 0 | 1): THREE.BufferGeometry[] {
  const L = breaks(linc).run, out: THREE.BufferGeometry[] = [];
  for (let i = -D.grooveCount; i <= D.grooveCount; i++) {
    const x = i * D.groovePitch;
    const d0 = D.grooveStartInset, d1 = V.combBody - D.grooveEndInset;
    const at = (d: number): { u: number; v: number } => ({ u: end === 0 ? -d : L + d, v: D.plateTop + D.grooveRaise + (end === 1 ? lipAt(d) : 0) });
    const pts = end === 0 ? [at(d1), at(d0)] : [at(d0), at(d1)];
    out.push(sweep(pts, rect(x - D.grooveHalfW, x + D.grooveHalfW, 0, D.grooveRaise)));
  }
  return out;
}

interface UnitGeo { metal: THREE.BufferGeometry; glass: THREE.BufferGeometry; strip: THREE.BufferGeometry }
function buildUnit(u: EscalatorUnit): UnitGeo {
  const H = Math.abs(u.yFrom - u.yTo);
  const linc = H / S;
  const run = breaks(linc).run;
  const metal = new Bag(), glass = new Bag(), strip = new Bag();
  const trussV = V.trussDepth / C;
  // truss: top clad box under the steps, end to end
  metal.add(sweep(samples(0, run, linc), rect(-V.trussHalfWidth, V.trussHalfWidth, -trussV, V.trussTop)), TRUSS);
  for (const sg of [-1, 1] as const) {
    const x = (a: number, b: number): [number, number] => (sg > 0 ? [a, b] : [-b, -a]);
    const [bx0, bx1] = x(V.skirtX, V.baseOuterX);
    // base / skirt deck, running out to the newels at both ends
    metal.add(sweep(samples(-V.newelLength, run + V.newelLength, linc), rect(bx0, bx1, V.baseBottom, V.baseTop)), STAINLESS);
    // newel piers: brushed stainless, rounded section, the outer end stepped into a rounded nose
    for (const [a, b, nose] of [[-V.newelLength, -D.newelGap, -1], [run + D.newelGap, run + V.newelLength, 1]] as const) {
      const top = V.railProfileBottom + 0.005;
      const body = nose < 0 ? flat(a + 0.06, b) : flat(a, b - 0.06);
      metal.add(sweep(body, roundRect(bx0, bx1, V.baseBottom, top, 0.045), true), NEWEL);
      const steps = [[0.0, 0.012], [0.03, 0.026], [0.05, 0.048]] as const; // [distance toward the end, inset]
      for (let k = 0; k < steps.length; k++) {
        const [d0, inset] = steps[k]!;
        const dn = k + 1 < steps.length ? steps[k + 1]![0] : 0.06;
        const u0 = nose < 0 ? a + 0.06 - dn : b - 0.06 + d0, u1 = nose < 0 ? a + 0.06 - d0 : b - 0.06 + dn;
        metal.add(sweep(flat(Math.min(u0, u1), Math.max(u0, u1)), roundRect(bx0 + inset, bx1 - inset, V.baseBottom + inset, top - inset, Math.max(0.02, 0.045 - inset * 0.5)), true), NEWEL);
      }
    }
    // glass
    const gx = V.glassX * sg;
    glass.add(sweep(samples(-D.glassOverrun, run + D.glassOverrun, linc), rect(gx - V.glassThickness / 2, gx + V.glassThickness / 2, V.baseTop, V.glassTop)), [1, 1, 1]);
    // handrail: stainless profile + black rubber, ending over the newel pier where the rubber loops down into it
    metal.add(sweep(samples(-D.railOverrun, run + D.railOverrun, linc), rect(gx - V.railProfileHalf, gx + V.railProfileHalf, V.railProfileBottom, V.railProfileTop)), STAINLESS);
    metal.add(sweep(samples(-D.railOverrun, run + D.railOverrun, linc), ellipse(gx, V.rubberCentreV, V.rubberHalfW, V.rubberHalfH, D.rubberSides), true), RUBBER);
    for (const [uEnd, dir, vEnd] of [[-D.railOverrun, -1, 0], [run + D.railOverrun, 1, -H]] as const) {
      const pts: THREE.Vector3[] = [];
      const r = V.handrailLoopR;
      for (let i = 0; i <= D.loopArcSteps; i++) { const a = (i / D.loopArcSteps) * (Math.PI / 2); pts.push(new THREE.Vector3(gx, vEnd + V.rubberCentreV - r + r * Math.cos(a), uEnd + dir * r * Math.sin(a))); }
      metal.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), D.loopTubeSegs, D.loopTubeR, D.loopTubeRadial, false), RUBBER);
    }
    // warm skirt line on the inner face of the skirt, at step level
    const sx = V.skirtX * sg;
    strip.add(sweep(samples(0, run, linc), rect(sx - D.stripOffset * sg - D.stripHalfT, sx - D.stripOffset * sg + D.stripHalfT, V.stripV0, V.stripV1)), [1, 1, 1]);
  }
  for (const end of [0, 1] as const) {
    metal.add(combplate(linc, end), CHAMPAGNE);
    for (const g of combGrooves(linc, end)) metal.add(g, RUBBER);
  }
  return { metal: metal.geometry()!, glass: glass.geometry()!, strip: strip.geometry()! };
}

function unitMatrix(u: EscalatorUnit): THREE.Matrix4 {
  const dirA = Math.sign(u.to - u.from) || 1;
  const phi = u.axis === 'z' ? (dirA > 0 ? 0 : Math.PI) : dirA * (Math.PI / 2);
  const origin = u.axis === 'z' ? new THREE.Vector3(u.across, u.yFrom, u.from) : new THREE.Vector3(u.from, u.yFrom, u.across);
  return new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).multiply(new THREE.Matrix4().makeRotationY(phi));
}

// --- steps -------------------------------------------------------------------------------------------------------

/** One step in the local frame (origin at the top centre of the tread, z = u downhill): tread, dark riser, dark underbody. */
function stepGeometry(): THREE.BufferGeometry {
  const bag = new Bag();
  const hw = V.stepHalfWidth, d = V.stepTreadDepth / 2, th = V.stepThickness, rh = V.stepRiserHeight;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: RGB): void => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const ng = g.toNonIndexed();
    const p = ng.getAttribute('position');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bag.add(ng, col);
  };
  box(-hw, hw, -th, 0, -d, d, [D.treadTint, D.treadTint, D.treadTint]);
  box(-hw, hw, -rh, -th, d - D.riserThick, d, RISER_COL);
  box(-hw + D.underInset, hw - D.underInset, -rh, -th, -d, d - D.riserThick, UNDER_COL);
  return bag.geometry()!;
}

const GLSL_PATH = `
const float ES_TH = ${TH.toFixed(6)};
const float ES_C = ${C.toFixed(6)};
const float ES_S = ${S.toFixed(6)};
const float ES_R = ${R.toFixed(6)};
const float ES_T = ${T.toFixed(6)};
const float ES_E = ${E.toFixed(6)};
const float ES_PITCH = ${V.pitch.toFixed(6)};
const float ES_SINK = ${V.sink.toFixed(6)};
vec2 escPath(float s, float linc) {
  float a0 = ES_E - ES_T, a1 = a0 + ES_R * ES_TH, a2 = a1 + linc - 2.0 * ES_T, a3 = a2 + ES_R * ES_TH;
  float run = linc * ES_C, drop = linc * ES_S;
  vec2 p;
  if (s < a0) p = vec2(-ES_E + s, 0.0);
  else if (s < a1) { float f = (s - a0) / ES_R; p = vec2(-ES_T + ES_R * sin(f), -ES_R + ES_R * cos(f)); }
  else if (s < a2) { float t = ES_T + (s - a1); p = vec2(t * ES_C, -t * ES_S); }
  else if (s < a3) { float q = (s - a2) / ES_R; p = vec2(run + ES_T - ES_R * sin(ES_TH - q), -drop + ES_R - ES_R * cos(ES_TH - q)); }
  else p = vec2(run + ES_T + (s - a3), -drop);
  float d = max(-p.x, p.x - run);
  p.y -= ES_SINK * smoothstep(${V.sinkStart.toFixed(3)}, ${V.sinkEnd.toFixed(3)}, d);
  return p;
}
float escLength(float linc) { return 2.0 * (ES_E - ES_T) + 2.0 * ES_R * ES_TH + linc - 2.0 * ES_T; }
`;

function stepMaterial(base: THREE.MeshStandardMaterial, name: string, uniforms: Record<string, { value: unknown }>, voidLit: boolean): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.name = name; m.vertexColors = true;
  const compile = (shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }): void => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `attribute float aUnit;\nattribute float aIndex;\nuniform vec4 uUnitA[${ESCALATOR_COUNT}];\nuniform vec4 uUnitB[${ESCALATOR_COUNT}];\nuniform float uOff[${ESCALATOR_COUNT}];\nvarying vec3 vStepL;\nvarying float vStepKind;\n${GLSL_PATH}\nvoid main() {`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  int escI = int(aUnit + 0.5);
  vec4 escB = uUnitB[escI];
  objectNormal = vec3(normal.x * escB.y + normal.z * escB.x, normal.y, -normal.x * escB.x + normal.z * escB.y);
  vStepKind = normal.y > 0.5 ? 1.0 : (abs(normal.z) > 0.5 ? 2.0 : 0.0);
  vStepL = position;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec4 escA = uUnitA[escI];
    float linc = escA.w;
    float ltot = escLength(linc);
    float cyc = escB.z * ES_PITCH;
    float s = mod(aIndex * ES_PITCH + uOff[escI], cyc);
    float vis = step(s, ltot);
    vec2 pa = escPath(min(s, ltot), linc);
    vec3 l = position + vec3(0.0, pa.y, pa.x);
    transformed = (vec3(l.x * escB.y + l.z * escB.x, l.y, -l.x * escB.x + l.z * escB.y) + escA.xyz) * vis;
  }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vStepL;
varying float vStepKind;
float escGroove() {
  if (vStepKind < 0.5) return 0.0;
  float gq = vStepL.x / ${D.stepGroovePitch.toFixed(4)};
  float gx = abs(fract(gq) - 0.5) * 2.0;
  return smoothstep(${D.grooveBand0.toFixed(3)}, ${D.grooveBand1.toFixed(3)}, gx) * (1.0 - smoothstep(${D.grooveAA0.toFixed(3)}, ${D.grooveAA1.toFixed(3)}, fwidth(gq))) * (vStepKind > 1.5 ? ${D.riserRib.toFixed(3)} : 1.0);
}
void main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb *= 1.0 - ${D.grooveDark.toFixed(3)} * escGroove();`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, ${D.grooveRough.toFixed(3)}, escGroove());`);
  };
  const prev = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => { prev(shader, renderer); compile(shader as never); };
  m.customProgramCacheKey = () => `escalatorSteps|${voidLit ? 'void' : 'deep'}`;
  if (voidLit) { installSharedVoidLight(m, 'escalatorSteps'); excludeDirectionalLight(m); }
  return m;
}
const ESCALATOR_COUNT = escalatorUnits().length;

// --- groups ------------------------------------------------------------------------------------------------------

export interface EscalatorVisuals {
  voidGroup: THREE.Group;
  deepGroup: THREE.Group;
  /** Deep-side materials, for `metro.userData.deepMaterials` (they take the deep environment map). */
  deepMaterials: THREE.MeshStandardMaterial[];
  stats: { voidCalls: number; deepCalls: number; triangles: number };
}

/**
 * Ordering: the void ring light (`setSharedVoidLight`, called by buildVoidShell) is read lazily at each material's FIRST COMPILE
 * (first render), not at build time, so buildEscalators may run before or after buildVoidShell. It must simply be set before the first
 * render; `installSharedVoidLight` throws a clear error if it never was.
 */
export function buildEscalators(kit: MetroMaterialSet & { deep: MetroMaterialSet }): EscalatorVisuals {
  const units = escalatorUnits();
  const uniforms = {
    uUnitA: { value: units.map((u) => { const m = unitMatrix(u).elements; return new THREE.Vector4(m[12]!, m[13]!, m[14]!, Math.abs(u.yFrom - u.yTo) / S); }) },
    uUnitB: {
      value: units.map((u) => {
        const m = unitMatrix(u).elements; // rotation about y: m[8] = sin(phi), m[0] = cos(phi)
        const linc = Math.abs(u.yFrom - u.yTo) / S;
        return new THREE.Vector4(m[8]!, m[0]!, Math.ceil(pathLength(linc) / V.pitch) + 1, 0);
      }),
    },
    uOff: { value: escalators.phase },
  };

  const make = (ids: readonly string[], set: MetroMaterialSet, voidLit: boolean, tag: string): { group: THREE.Group; mats: THREE.MeshStandardMaterial[]; calls: number; tris: number } => {
    const sel = units.filter((u) => ids.includes(u.flight));
    const metalParts: THREE.BufferGeometry[] = [], glassParts: THREE.BufferGeometry[] = [], stripParts: THREE.BufferGeometry[] = [];
    for (const u of sel) {
      const g = buildUnit(u);
      const mat = unitMatrix(u);
      for (const [list, geo] of [[metalParts, g.metal], [glassParts, g.glass], [stripParts, g.strip]] as const) { geo.applyMatrix4(mat); list.push(geo); }
    }
    const metalGeo = mergeGeometries(metalParts, false)!, glassGeo = mergeGeometries(glassParts, false)!, stripGeo = mergeGeometries(stripParts, false)!;

    const metalMat = set.stainless.clone();
    metalMat.name = `${tag}EscalatorMetal`; metalMat.vertexColors = true;
    if (voidLit) { installSharedVoidLight(metalMat, 'escalatorMetal'); excludeDirectionalLight(metalMat); }
    const group = new THREE.Group();
    group.name = `${tag}Escalators`;
    const meshes: THREE.Mesh[] = [];
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, order = 0): void => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name; mesh.renderOrder = order; mesh.userData.noShadow = true; 
      meshes.push(mesh); group.add(mesh);
    };
    mk(metalGeo, metalMat, `${tag}EscalatorMetal`);
    mk(glassGeo, set.glass, `${tag}EscalatorGlass`, 2);
    mk(stripGeo, set.emissive.warmStrip, `${tag}EscalatorSkirtLight`);

    // steps: one instanced mesh for every step of every unit in the group
    const base = stepGeometry();
    const ig = new THREE.InstancedBufferGeometry();
    for (const n of ['position', 'normal', 'uv', 'color']) ig.setAttribute(n, base.getAttribute(n));
    const aUnit: number[] = [], aIndex: number[] = [];
    for (const u of sel) {
      const i = units.indexOf(u);
      const m = (uniforms.uUnitB.value[i] as THREE.Vector4).z;
      for (let k = 0; k < m; k++) { aUnit.push(i); aIndex.push(k); }
    }
    ig.setAttribute('aUnit', new THREE.InstancedBufferAttribute(new Float32Array(aUnit), 1));
    ig.setAttribute('aIndex', new THREE.InstancedBufferAttribute(new Float32Array(aIndex), 1));
    ig.instanceCount = aUnit.length;
    // bounds: every unit's step volume (start and end corners padded by the unit width, the flat run and the step height), so culling is exact enough at the view edges
    const box = new THREE.Box3();
    for (const u of sel) {
      const m = unitMatrix(u);
      const linc = Math.abs(u.yFrom - u.yTo) / S, run = breaks(linc).run, pad = V.flatEnd + 1;
      for (const [x, y, z] of [[-pad, 0, -pad], [pad, -linc * S - 1, run + pad], [-pad, 1.5, run + pad], [pad, 1.5, -pad]] as const) box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(m));
    }
    ig.boundingBox = box;
    ig.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const stepMat = stepMaterial(set.stainless, `${tag}EscalatorSteps`, uniforms, voidLit);
    const steps = new THREE.Mesh(ig, stepMat);
    steps.name = `${tag}EscalatorSteps`; steps.userData.noShadow = true;
    group.add(steps);
    let tris = 0;
    for (const g of [metalGeo, glassGeo, stripGeo]) tris += g.getAttribute('position').count / 3;
    tris += (base.getAttribute('position').count / 3) * aUnit.length;
    return { group, mats: [metalMat, stepMat], calls: 4, tris };
  };

  const v = make(['F1', 'F2', 'F3', 'F4'], kit, true, 'metroVoid');
  const d = make(['F5', 'F6'], kit.deep, false, 'metroDeep');
  return {
    voidGroup: v.group, deepGroup: d.group,
    deepMaterials: [...new Set<THREE.MeshStandardMaterial>([...d.mats, kit.deep.glass, kit.deep.stainless, kit.deep.champagne])],
    stats: { voidCalls: v.calls, deepCalls: d.calls, triangles: v.tris + d.tris },
  };
}
