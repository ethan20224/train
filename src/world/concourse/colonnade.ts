import * as THREE from 'three';
import { COLONNADE } from '../../layout';
import type { MaterialLibrary } from '../../core/types';
import { GeoBag, at, boxMM, gridLathe, latheMeters, smoothstep, sweep, v3, type Frame, type P2 } from './geo';
import { PILASTER_Z, SIDE_WALLS, uOfZ } from './frames';
import { CORNICE_PROFILE, type Bags } from './shell';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TILE = 2.0; // columnMarble tile size (m)
const R_BOTTOM = 1.0;
const SHAFT_Y0 = 1.2;
const SHAFT_Y1 = 17.0;
const CAP_Y0 = 17.0;

const TAU = Math.PI * 2;

function shaftRadius(y: number): number {
  const t = (y - SHAFT_Y0) / (SHAFT_Y1 - SHAFT_Y0);
  return R_BOTTOM * (1 - 0.145 * t) + 0.018 * Math.sin(Math.PI * t);
}

function fluteShaft(): THREE.BufferGeometry {
  const flutes = 24;
  const ts = [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9];
  const nPhi = flutes * ts.length;
  const ys: number[] = [SHAFT_Y0, 1.35, 1.6, 2.2, 4, 6.5, 9, 11.5, 14, 15.5, 16.1, 16.45, 16.7, 16.88, SHAFT_Y1];
  const phis: number[] = [];
  for (let i = 0; i < nPhi; i++) phis.push(((Math.floor(i / ts.length) + at(ts, i % ts.length)) / flutes) * TAU);
  const shape = (t: number): number => {
    const a = 0.1;
    if (t < a || t > 1 - a) return 0;
    const x = (t - 0.5) / (0.5 - a);
    return Math.sqrt(Math.max(0, 1 - x * x)) * 0.88 + 0.12 * (1 - x * x);
  };
  return gridLathe(nPhi, ys, (phi, y) => {
    const t = (phi / (TAU / flutes)) % 1;
    const depthMax = 0.1 * (shaftRadius(y) / R_BOTTOM);
    const env = smoothstep(SHAFT_Y0 + 0.05, SHAFT_Y0 + 0.9, y) * (1 - smoothstep(SHAFT_Y1 - 0.75, SHAFT_Y1 - 0.05, y));
    return shaftRadius(y) - depthMax * env * shape(t);
  }, 3, TILE, phis);
}

function baseLathe(): THREE.BufferGeometry {
  const pts: P2[] = [];
  const arc = (cr: number, cy: number, r: number, t0: number, t1: number, n: number): void => {
    for (let i = 0; i <= n; i++) {
      const t = THREE.MathUtils.degToRad(t0 + ((t1 - t0) * i) / n);
      pts.push([cr + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  };
  pts.push([1.15, 0.35]);
  arc(1.15, 0.5, 0.15, -90, 90, 8); // lower torus
  pts.push([1.1, 0.67], [1.04, 0.69], [1.0, 0.74], [1.0, 0.78], [1.04, 0.83], [1.1, 0.85]); // scotia
  arc(1.08, 0.95, 0.1, -90, 90, 6); // upper torus
  pts.push([1.0, 1.06], [1.0, 1.2]);
  return latheMeters(pts, 56, TILE, 4);
}

function capitalGeo(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const bellH = 2.25;
  const y0 = CAP_Y0 + 0.2;
  const rTop = shaftRadius(SHAFT_Y1);
  // astragal bead
  const bead: P2[] = [[rTop, CAP_Y0], [rTop + 0.05, CAP_Y0 + 0.04], [rTop + 0.08, CAP_Y0 + 0.1], [rTop + 0.05, CAP_Y0 + 0.17], [rTop, CAP_Y0 + 0.2]];
  out.push(latheMeters(bead, 40, TILE, 3));
  const core = (h: number): number => rTop + 0.02 + 0.62 * (1 - Math.pow(1 - h / bellH, 1.8));
  const leafRow = (n: number, phase: number, hMax: number, amp: number, h0: number) => (phi: number, h: number): number => {
    const u = ((phi / TAU) * n + phase) % 1;
    const t = u < 0 ? u + 1 : u;
    const x = Math.abs(2 * t - 1);
    const H = hMax * (0.62 + 0.38 * (1 - x * x));
    const hh = h - h0;
    if (hh <= 0 || hh >= H) return 0;
    const lateral = Math.pow(1 - x * x, 0.9) * (1 - 0.18 * Math.abs(Math.sin(x * 5.2)));
    const rise = smoothstep(0, 0.3 * H, hh);
    const curl = 1 + 0.3 * smoothstep(0.7 * H, 0.97 * H, hh);
    const fall = 1 - smoothstep(0.93 * H, H, hh);
    return amp * lateral * rise * curl * fall;
  };
  const row1 = leafRow(12, 0, 1.2, 0.12, 0);
  const row2 = leafRow(12, 0.5, 1.45, 0.17, 0.62);
  const ys: number[] = [];
  for (let i = 0; i <= 32; i++) ys.push((i / 32) * bellH);
  const bell = gridLathe(192, ys, (phi, h) => core(h) + row1(phi, h) + row2(phi, h), 3, TILE);
  bell.translate(0, y0, 0);
  out.push(bell);

  // corner volutes + mid buds
  const absTop = y0 + bellH;
  for (let k = 0; k < 4; k++) {
    const ang = Math.PI / 4 + (k * Math.PI) / 2;
    const dir = v3(Math.cos(ang), 0, Math.sin(ang));
    const pts: THREE.Vector3[] = [];
    // spiral in the (radial, y) plane
    const cx = 1.62;
    const cy = absTop - 0.28;
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const a = -2.2 + t * 8.6; // sweep angle
      const rr = 0.52 * (1 - t * 0.82);
      const rad = cx + Math.cos(a) * rr * 0.9;
      const yy = cy + Math.sin(a) * rr;
      pts.push(dir.clone().multiplyScalar(rad).setY(yy));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.085, 6, false);
    out.push(tube);
    // stalk from the bell to the volute
    const stalk = new THREE.CylinderGeometry(0.08, 0.13, 1.0, 8);
    stalk.translate(0, 0.5, 0);
    stalk.rotateZ(-0.52);
    stalk.rotateY(-ang);
    stalk.translate(dir.x * 1.18, y0 + bellH - 1.25, dir.z * 1.18);
    out.push(stalk);
  }
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2;
    const bud = new THREE.SphereGeometry(0.14, 10, 8);
    bud.scale(1, 1.3, 1);
    bud.translate(Math.cos(ang) * 1.3, absTop - 0.28, Math.sin(ang) * 1.3);
    out.push(bud);
  }
  // abacus: truncated square with concave sides
  const A = 1.42;
  const c = 0.9;
  const sh = new THREE.Shape();
  sh.moveTo(-A + c, -A);
  sh.lineTo(A - c, -A);
  sh.quadraticCurveTo(A - 0.55, -A + 0.55, A, -A + c);
  sh.lineTo(A, A - c);
  sh.quadraticCurveTo(A - 0.55, A - 0.55, A - c, A);
  sh.lineTo(-A + c, A);
  sh.quadraticCurveTo(-A + 0.55, A - 0.55, -A, A - c);
  sh.lineTo(-A, -A + c);
  sh.quadraticCurveTo(-A + 0.55, -A + 0.55, -A + c, -A);
  const ab = new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 });
  ab.rotateX(-Math.PI / 2);
  ab.translate(0, absTop - 0.02, 0);
  out.push(ab);
  const slab = boxMM(-1.2, absTop + 0.3, -1.2, 1.2, 20, 1.2);
  out.push(slab);
  return out;
}

/** Single merged column geometry, origin at the centre of the base on the floor. */
function columnGeometry(lib: MaterialLibrary): THREE.BufferGeometry {
  const norm: THREE.BufferGeometry[] = [];
  const push = (g: THREE.BufferGeometry, analytic: boolean): void => {
    let x = g.index ? g.toNonIndexed() : g.clone();
    for (const n of Object.keys(x.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') x.deleteAttribute(n);
    if (!x.getAttribute('normal')) x.computeVertexNormals();
    if (!analytic) x = lib.applyWorldUVs(x, TILE);
    norm.push(x);
  };
  push(boxMM(-1.4, 0, -1.4, 1.4, 0.35, 1.4), false);
  push(baseLathe(), true);
  push(fluteShaft(), true);
  const caps = capitalGeo();
  caps.forEach((g, i) => push(g, i < 2)); // bead + bell are analytic
  const merged = mergeGeometries(norm, false);
  if (!merged) throw new Error('column merge failed');
  return merged;
}

// ---------------------------------------------------------------------------------------------
// Pilaster (authored in the wall-local frame: u along wall, v up, w into the hall)
// ---------------------------------------------------------------------------------------------
function pilasterGeometry(lib: MaterialLibrary): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const W = 1.5;
  const D = 0.42;
  // shaft with three shallow flutes: cross-section in (u, w), extruded along v
  // shape y = -w so that rotateX(-90deg) maps (extrude z -> +y, shape y -> +z(w))
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, 0);
  sh.lineTo(W / 2, 0);
  sh.lineTo(W / 2, -D);
  const flutes = 3;
  const fw = (W - 0.3) / flutes;
  let x = W / 2 - 0.15;
  sh.lineTo(x, -D);
  for (let i = 0; i < flutes; i++) {
    sh.quadraticCurveTo(x - fw / 2, -(D - 0.14), x - fw, -D);
    x -= fw;
  }
  sh.lineTo(-W / 2, -D);
  sh.closePath();
  const shaft = new THREE.ExtrudeGeometry(sh, { depth: 15.8, bevelEnabled: false, curveSegments: 6 });
  shaft.rotateX(-Math.PI / 2);
  shaft.translate(0, 1.2, 0);
  parts.push(shaft);
  // base
  parts.push(boxMM(-W / 2 - 0.25, 0.0, 0, W / 2 + 0.25, 0.4, D + 0.3));
  parts.push(boxMM(-W / 2 - 0.12, 0.4, 0, W / 2 + 0.12, 0.62, D + 0.18));
  parts.push(boxMM(-W / 2 - 0.05, 0.62, 0, W / 2 + 0.05, 0.9, D + 0.08));
  parts.push(boxMM(-W / 2 - 0.02, 0.9, 0, W / 2 + 0.02, 1.2, D + 0.03));
  // capital: tapered bell + leaf row + abacus
  const bellH = 2.2;
  const bell = new THREE.CylinderGeometry(1.5, 1.0, bellH, 4, 1);
  bell.rotateY(Math.PI / 4);
  bell.scale(0.72, 1, 0.34);
  bell.translate(0, 17.0 + 0.2 + bellH / 2, D - 0.2);
  parts.push(bell);
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.SphereGeometry(0.3, 10, 8);
      leaf.scale(0.7, 1.9, 0.4);
      leaf.translate(-0.62 + i * 0.31 + (r ? 0.15 : 0), 17.2 + 0.55 + r * 0.7 + (i % 2) * 0.1, D + 0.2 + r * 0.06);
      parts.push(leaf);
    }
  }
  parts.push(boxMM(-1.02, 19.38, 0, 1.02, 19.7, D + 0.42));
  parts.push(boxMM(-0.98, 19.7, 0, 0.98, 20.0, D + 0.3));
  // neck ring
  parts.push(boxMM(-W / 2 - 0.02, 17.0, 0, W / 2 + 0.02, 17.2, D + 0.04));
  const norm = parts.map((g) => {
    const x = g.index ? g.toNonIndexed() : g.clone();
    for (const n of Object.keys(x.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') x.deleteAttribute(n);
    if (!x.getAttribute('normal')) x.computeVertexNormals();
    return lib.applyWorldUVs(x, 2.0);
  });
  const merged = mergeGeometries(norm, false);
  if (!merged) throw new Error('pilaster merge failed');
  return merged;
}

// ---------------------------------------------------------------------------------------------
// Entablature
// ---------------------------------------------------------------------------------------------
function entablatureProfile(): P2[] {
  const S: P2[] = [
    [0, 20], [0.82, 20], [0.82, 20.55], [0.88, 20.55], [0.88, 21.05], [0.94, 21.05], [0.94, 21.45], [1.0, 21.5], [1.0, 21.58],
    [0.9, 21.62], [0.9, 22.6],
  ];
  const A0 = 0.9;
  const corn = CORNICE_PROFILE.slice(1).map(([a, b]): P2 => [A0 + a, b]);
  const right: P2[] = [...S, ...corn, [0, 24]];
  // mirror: left side reversed, skipping the two centre points
  const left: P2[] = right.slice(1, -1).map(([a, b]): P2 => [-a, b]).reverse();
  return [...right, ...left];
}

export interface ColonnadeResult {
  columns: THREE.InstancedMesh;
  pilasters: THREE.InstancedMesh;
}

export function buildColonnade(bags: Bags, lib: MaterialLibrary, colMat: THREE.Material, stoneMat: THREE.Material): ColonnadeResult {
  // --- columns -------------------------------------------------------------------------------
  const cg = columnGeometry(lib);
  const n = COLONNADE.xs.length * COLONNADE.zs.length;
  const columns = new THREE.InstancedMesh(cg, colMat, n);
  const m = new THREE.Matrix4();
  let i = 0;
  for (const x of COLONNADE.xs) {
    for (const z of COLONNADE.zs) {
      // rotate each column a little so the marble veining differs (angle multiples keep flutes aligned)
      m.makeRotationY((i * TAU) / 24 * 5).setPosition(x, 0, z);
      columns.setMatrixAt(i++, m);
    }
  }
  columns.instanceMatrix.needsUpdate = true;
  columns.castShadow = columns.receiveShadow = true;

  // --- pilasters ------------------------------------------------------------------------------
  const pg = pilasterGeometry(lib);
  const pil = new THREE.InstancedMesh(pg, stoneMat, SIDE_WALLS.length * PILASTER_Z.length);
  let k = 0;
  for (const wall of SIDE_WALLS) {
    for (const z of PILASTER_Z) {
      m.copy(wall.m).multiply(new THREE.Matrix4().makeTranslation(uOfZ(wall, z), 0, 0));
      pil.setMatrixAt(k++, m);
    }
  }
  pil.instanceMatrix.needsUpdate = true;
  pil.castShadow = pil.receiveShadow = true;

  // --- entablature over the colonnades + ties back to the walls --------------------------------
  const prof = entablatureProfile();
  const zA = 18.5;
  const zB = 81.5;
  const mkLine = (p0: THREE.Vector3, p1: THREE.Vector3, a: THREE.Vector3): Frame[] => [
    { o: p0, a: a.clone(), b: v3(0, 1, 0) },
    { o: p1, a: a.clone(), b: v3(0, 1, 0) },
  ];
  for (const x of COLONNADE.xs) {
    bags.stone.add(sweep(prof, mkLine(v3(x, 0, zA), v3(x, 0, zB), v3(1, 0, 0)), { closed: true, caps: true }));
    // dentils on both faces
    for (const sg of [-1, 1]) {
      const a0 = 0.9 + 0.12;
      const a1 = 0.9 + 0.3;
      const cnt = Math.floor((zB - zA) / 0.3);
      for (let d = 0; d < cnt; d++) {
        const z = zA + (d + 0.5) * 0.3;
        const xa = x + sg * a0;
        const xb = x + sg * a1;
        bags.stone.add(boxMM(Math.min(xa, xb), 23.04, z - 0.075, Math.max(xa, xb), 23.28, z + 0.075));
      }
    }
    // ties
    const sgn = x < 0 ? -1 : 1;
    const wallX = sgn * 30.3;
    const tieProf = prof.map(([a, b]): P2 => [a, b === 20 ? 20.02 : b === 24 ? 23.98 : b]);
    for (const z of COLONNADE.zs) {
      bags.stone.add(sweep(tieProf, mkLine(v3(x, 0, z), v3(wallX, 0, z), v3(0, 0, 1)), { closed: true, caps: false }));
      // dentils along the tie (both flanks)
      for (const sg of [-1, 1]) {
        const a0 = 0.9 + 0.12;
        const a1 = 0.9 + 0.3;
        const x0 = Math.min(x + sgn * 1.55, wallX);
        const x1 = Math.max(x + sgn * 1.55, wallX);
        const cnt = Math.floor((x1 - x0) / 0.3);
        for (let d = 0; d < cnt; d++) {
          const xx = x0 + (d + 0.5) * 0.3;
          bags.stone.add(boxMM(xx - 0.075, 23.04, Math.min(z + sg * a0, z + sg * a1), xx + 0.075, 23.28, Math.max(z + sg * a0, z + sg * a1)));
        }
      }
    }
  }
  return { columns, pilasters: pil };
}

export type { GeoBag };
