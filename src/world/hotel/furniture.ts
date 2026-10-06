import * as THREE from 'three';
import { gridLathe, rng, type P2 } from '../concourse/geo';
import { Bucket, box, cylX, cylZ, lathe, mul, rbox, slab, sphere, tube, xf, atlasUV, scaled } from './kit';
import type { Piece, Tint } from './layoutData';
import type { PaperAtlas } from './textures';
import { addLoungePiece } from './furniture2';

/** Shared geometry buckets (one draw call per bucket). */
export interface Buckets {
  leather: Bucket; // vertex-coloured, grain texture
  wood: Bucket; // library walnut, world UVs
  brass: Bucket;
  dark: Bucket; // dark marble
  marble: Bucket; // cream marble
  silver: Bucket;
  shade: Bucket; // pleated silk (emissive)
  glow: Bucket; // bulbs (basic, HDR)
  crystal: Bucket; // amber crystal / decanters
  greenGlass: Bucket; // banker's shades
  paper: Bucket; // atlas-mapped (keep uv)
  fronds: Bucket; // alpha-tested palm cards
  iron: Bucket;
  booth: Bucket; // warm-lit booth interiors (BackSide, emissive)
  mirror: Bucket; // dark brass-framed mirrors
}

export const LEATHER: Record<Tint, number> = { oxblood: 0xb02f30, green: 0x3d9468 };
const TRUNK_COLORS = [0x8a5a2e, 0x5a3a22, 0x2f4a3a];

const M0 = new THREE.Matrix4();

// ---------------------------------------------------------------------------------------------
// tufted (diamond buttoned) upholstery panel: front face in plane z = 0 bulging toward +z by T
// ---------------------------------------------------------------------------------------------
export function tufted(w: number, h: number, T: number, px: number, py: number, cell = 0.025): THREE.BufferGeometry {
  const nx = Math.max(8, Math.round(w / cell));
  const ny = Math.max(8, Math.round(h / cell));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ss = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = (i / nx) * w;
      const v = (j / ny) * h;
      const edge = ss(0, 0.075, Math.min(u, w - u, v, h - v));
      // distance to the nearest button on a diamond lattice
      let d = 1e9;
      const row0 = Math.round(v / py);
      for (let r = row0 - 1; r <= row0 + 1; r++) {
        const off = (r & 1) === 0 ? 0 : px / 2;
        const cx0 = Math.round((u - off) / px) * px + off;
        for (const cx of [cx0 - px, cx0, cx0 + px]) d = Math.min(d, Math.hypot(u - cx, v - r * py));
      }
      const pillow = ss(0, Math.min(px, py * 1.4) * 0.5, d);
      const f = edge * (0.5 + 0.5 * pillow) - 0.18 * Math.exp(-Math.pow(d / (px * 0.12), 2));
      pos.push(u - w / 2, v, T * f);
      uv.push(u / w, v / h);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// turned leg profile (shared)
// ---------------------------------------------------------------------------------------------
const TURNED_LEG: P2[] = [[0.001, 0], [0.026, 0], [0.03, 0.012], [0.024, 0.03], [0.03, 0.05], [0.02, 0.09], [0.028, 0.13], [0.022, 0.18], [0.034, 0.24], [0.04, 0.3], [0.001, 0.3]];

/** Turned leg of height `h` (profile stretched in y). */
export function turnedLeg(h: number, scaleR = 1): THREE.BufferGeometry {
  const pts = TURNED_LEG.map(([r, y]): P2 => [r * scaleR, (y / 0.3) * h]);
  return lathe(pts, 12, 0.5);
}

// ---------------------------------------------------------------------------------------------
// Chesterfield sofa
// ---------------------------------------------------------------------------------------------
export const SOFA = { w: 2.15, d: 0.95 } as const;

export function addSofa(b: Buckets, M: THREE.Matrix4, tint: Tint): void {
  const col = LEATHER[tint];
  const dark = new THREE.Color(col).multiplyScalar(0.8).getHex();
  const L = (g: THREE.BufferGeometry, c = col): void => void b.leather.add(g, M, c);
  const W = SOFA.w;
  const D = SOFA.d;
  const armX = W / 2 - 0.125;
  const innerW = W - 0.5;
  // frame + skirt
  L(rbox(-W / 2 + 0.04, 0.15, -D / 2 + 0.02, W / 2 - 0.04, 0.34, D / 2 - 0.01, 0.035), dark);
  // two seat cushions with a slight crown
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -innerW / 2 : 0.006;
    const x1 = s < 0 ? -0.006 : innerW / 2;
    L(rbox(x0, 0.33, -0.24, x1, 0.47, D / 2 - 0.005, 0.055, 4));
  }
  // back: backing + diamond-tufted face
  L(rbox(-innerW / 2 - 0.02, 0.3, -D / 2 + 0.0, innerW / 2 + 0.02, 0.84, -0.27, 0.06));
  const tf = tufted(innerW - 0.06, 0.46, 0.075, 0.2, 0.13, 0.04);
  tf.translate(0, 0.35, -0.268);
  L(tf);
  // rolled back top
  L(cylX(0, 0.835, -0.37, 0.085, innerW + 0.04, 18));
  // arms: panel + roll + scroll front
  for (const s of [-1, 1]) {
    const ax = s * armX;
    L(rbox(ax - 0.11, 0.3, -D / 2, ax + 0.11, 0.7, D / 2 - 0.01, 0.04));
    L(cylZ(ax, 0.72, -0.0, 0.125, D - 0.03, 20));
    const ring = new THREE.TorusGeometry(0.085, 0.012, 6, 20);
    ring.translate(ax, 0.72, D / 2 - 0.015 + 0.002);
    L(ring, dark);
    L(sphere(ax, 0.72, D / 2 - 0.012, 0.02, 8, 6), dark);
    // brass studs under the roll
    for (let i = 0; i < 7; i++) {
      const z = -D / 2 + 0.12 + (i / 6) * (D - 0.26);
      b.brass.add(sphere(ax + s * 0.112, 0.47, z, 0.009, 6, 4), M);
    }
  }
  // brass stud line along the front of the base
  for (let i = 0; i < 22; i++) {
    const x = -innerW / 2 + 0.05 + (i / 21) * (innerW - 0.1);
    b.brass.add(sphere(x, 0.245, D / 2 - 0.006, 0.009, 6, 4), M);
  }
  // feet
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.wood.add(turnedLeg(0.17, 1.15), mul(M, xf(sx * (W / 2 - 0.12), 0, sz * (D / 2 - 0.1))));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Wingback armchair
// ---------------------------------------------------------------------------------------------
export const CHAIR = { w: 0.88, d: 0.9 } as const;

function wingGeometry(): THREE.BufferGeometry {
  // profile in (z, y); extruded across x
  const s = new THREE.Shape();
  s.moveTo(-0.4, 0.36);
  s.lineTo(-0.4, 1.1);
  s.quadraticCurveTo(-0.3, 1.14, -0.16, 1.04);
  s.quadraticCurveTo(-0.02, 0.96, 0.02, 0.8);
  s.quadraticCurveTo(0.06, 0.66, 0.12, 0.6);
  s.lineTo(0.12, 0.36);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); // shape x -> world z, extrusion -> world -x
  return g;
}

export function addChair(b: Buckets, M: THREE.Matrix4, tint: Tint): void {
  const col = LEATHER[tint];
  const dark = new THREE.Color(col).multiplyScalar(0.8).getHex();
  const L = (g: THREE.BufferGeometry, c = col): void => void b.leather.add(g, M, c);
  // frame + seat
  L(rbox(-0.36, 0.17, -0.36, 0.36, 0.34, 0.4, 0.04), dark);
  L(rbox(-0.3, 0.33, -0.2, 0.3, 0.47, 0.4, 0.055, 4));
  // back
  L(rbox(-0.36, 0.3, -0.42, 0.36, 1.08, -0.2, 0.09));
  const tf = tufted(0.52, 0.5, 0.06, 0.17, 0.12, 0.035);
  tf.translate(0, 0.49, -0.198);
  L(tf);
  // wings (both sides)
  const wing = wingGeometry();
  for (const s of [-1, 1]) {
    const w = wing.clone();
    if (s > 0) w.translate(0.4, 0, 0);
    else w.translate(-0.4 + 0.09, 0, 0);
    L(w);
    // rolled arm
    const ax = s * 0.385;
    L(rbox(ax - 0.07, 0.3, -0.26, ax + 0.07, 0.56, 0.4, 0.03));
    L(cylZ(ax, 0.6, 0.07, 0.075, 0.66, 14));
    const ring = new THREE.TorusGeometry(0.05, 0.008, 5, 14);
    ring.translate(ax, 0.6, 0.4 + 0.001);
    L(ring, dark);
  }
  for (let i = 0; i < 12; i++) {
    const x = -0.28 + (i / 11) * 0.56;
    b.brass.add(sphere(x, 0.215, 0.396, 0.008, 6, 4), M);
  }
  // legs: turned front, raked back
  for (const sx of [-1, 1]) {
    b.wood.add(turnedLeg(0.2, 1.1), mul(M, xf(sx * 0.31, 0, 0.33)));
    const back = tube(new THREE.Vector3(sx * 0.31, 0.0, -0.4), new THREE.Vector3(sx * 0.31, 0.2, -0.34), 0.02, 8, 0.028);
    b.wood.add(back, M);
  }
}

// ---------------------------------------------------------------------------------------------
// Tables and their dressing
// ---------------------------------------------------------------------------------------------
export function trayAndTea(b: Buckets, M: THREE.Matrix4, y: number, x: number, z: number, big = true): void {
  const sc = big ? 1 : 0.85;
  const tray = scaled(lathe([[0.001, 0], [0.19, 0], [0.198, 0.006], [0.2, 0.022], [0.188, 0.02], [0.18, 0.008], [0.001, 0.008]], 32, 0.5), 1.35, 1, 0.92);
  b.silver.add(tray, mul(M, xf(x, y, z, 0, sc)));
  const T = (lx: number, lz: number, yaw = 0): THREE.Matrix4 => mul(M, xf(x + lx * sc, y + 0.012, z + lz * sc, yaw, sc));
  // teapot
  const pot = lathe([[0.001, 0], [0.05, 0], [0.06, 0.012], [0.077, 0.05], [0.072, 0.09], [0.05, 0.116], [0.04, 0.122], [0.001, 0.124]], 20, 0.5);
  const lid = lathe([[0.04, 0.12], [0.036, 0.132], [0.022, 0.146], [0.001, 0.15]], 16, 0.5);
  const knob = sphere(0, 0.158, 0, 0.011, 8, 6);
  const spout = tube(new THREE.Vector3(0.065, 0.045, 0), new THREE.Vector3(0.14, 0.12, 0), 0.015, 8, 0.006);
  const handle = new THREE.TorusGeometry(0.045, 0.007, 6, 14, Math.PI * 1.1);
  handle.rotateZ(Math.PI * 0.55);
  handle.translate(-0.07, 0.075, 0);
  const tp = T(-0.1, -0.02, 0.2);
  for (const g of [pot, lid, knob, spout, handle]) b.silver.add(g, tp);
  // sugar bowl + jug
  b.silver.add(lathe([[0.001, 0], [0.03, 0], [0.045, 0.03], [0.04, 0.065], [0.001, 0.067]], 16, 0.5), T(0.1, 0.1));
  b.silver.add(lathe([[0.001, 0.067], [0.04, 0.066], [0.03, 0.085], [0.001, 0.095]], 16, 0.5), T(0.1, 0.1));
  b.silver.add(lathe([[0.001, 0], [0.028, 0], [0.04, 0.05], [0.034, 0.1], [0.001, 0.1]], 14, 0.5), T(0.16, -0.06));
  // cups on saucers (porcelain approximated with silver-white)
  for (const [cx, cz] of [[0.0, 0.12], [-0.12, 0.12]] as const) {
    b.silver.add(lathe([[0.001, 0], [0.06, 0], [0.066, 0.01], [0.001, 0.01]], 18, 0.5), T(cx, cz));
    b.silver.add(lathe([[0.001, 0.01], [0.022, 0.01], [0.03, 0.02], [0.04, 0.062], [0.001, 0.062]], 16, 0.5), T(cx, cz));
  }
}

export function newspaper(b: Buckets, atlas: PaperAtlas, M: THREE.Matrix4, y: number, x: number, z: number, yaw: number): void {
  const g = box(-0.18, 0, -0.13, 0.18, 0.012, 0.13);
  const rect = atlas.cell.news;
  if (rect) atlasUV(g, rect);
  b.paper.add(g, mul(M, xf(x, y, z, yaw)));
  const fold = box(-0.17, 0.012, -0.12, 0.17, 0.02, 0.0);
  if (rect) atlasUV(fold, rect);
  b.paper.add(fold, mul(M, xf(x + 0.01, y, z, yaw + 0.05)));
}

export function decanter(b: Buckets, M: THREE.Matrix4, y: number, x: number, z: number): void {
  const body = lathe([[0.001, 0], [0.052, 0], [0.06, 0.012], [0.062, 0.07], [0.052, 0.125], [0.024, 0.175], [0.02, 0.215], [0.028, 0.226], [0.001, 0.226]], 14, 0.5);
  const stopper = lathe([[0.001, 0.222], [0.02, 0.23], [0.024, 0.25], [0.012, 0.278], [0.001, 0.282]], 12, 0.5);
  b.crystal.add(body, mul(M, xf(x, y, z)));
  b.crystal.add(stopper, mul(M, xf(x, y, z)));
  for (const [dx, dz] of [[0.16, 0.02], [0.2, -0.07]] as const) {
    b.crystal.add(lathe([[0.001, 0], [0.028, 0], [0.032, 0.012], [0.036, 0.085], [0.001, 0.085]], 12, 0.5), mul(M, xf(x + dx, y, z + dz)));
  }
  // small silver tray under it
  b.silver.add(scaled(lathe([[0.001, 0], [0.12, 0], [0.126, 0.005], [0.126, 0.014], [0.118, 0.012], [0.001, 0.006]], 24, 0.5), 1.4, 1, 1), mul(M, xf(x + 0.07, y - 0.0, z)));
}

export function addCoffeeTable(b: Buckets, atlas: PaperAtlas, M: THREE.Matrix4, variant: number): void {
  const topY = 0.45;
  b.wood.add(slab(0, 0, 1.2, 0.62, topY - 0.04, 0.04, 0.05, 0.008), M);
  b.dark.add(slab(0, 0, 1.06, 0.48, topY, 0.004, 0.02, 0.001), M);
  b.wood.add(rbox(-0.5, 0.36, -0.22, 0.5, topY - 0.04, 0.22, 0.01), M);
  b.wood.add(slab(0, 0, 1.0, 0.4, 0.13, 0.022, 0.03, 0.004), M);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.wood.add(turnedLeg(0.37), mul(M, xf(sx * 0.5, 0, sz * 0.22)));
      b.brass.add(lathe([[0.001, 0], [0.028, 0], [0.03, 0.012], [0.001, 0.012]], 10, 0.5), mul(M, xf(sx * 0.5, 0, sz * 0.22)));
    }
  }
  const y = topY + 0.004;
  if (variant === 0) trayAndTea(b, M, y, 0.0, 0.0, true);
  else if (variant === 1) {
    decanter(b, M, y, -0.2, 0.0);
    newspaper(b, atlas, M, y, 0.28, 0.05, 0.3);
  } else {
    trayAndTea(b, M, y, -0.22, 0, false);
    newspaper(b, atlas, M, y, 0.28, 0.0, -0.25);
  }
}

export function addRoundTable(b: Buckets, atlas: PaperAtlas, M: THREE.Matrix4, variant: number): void {
  const topY = 0.58;
  b.wood.add(slab(0, 0, 0.72, 0.72, topY - 0.035, 0.035, 0.36, 0.006), M);
  b.brass.add(lathe([[0.355, topY - 0.012], [0.362, topY - 0.012], [0.362, topY - 0.001], [0.355, topY - 0.001]], 36, 0.5), M);
  // turned pedestal + three scrolled feet
  const ped: P2[] = [[0.001, 0.02], [0.05, 0.02], [0.05, 0.1], [0.032, 0.14], [0.04, 0.2], [0.026, 0.28], [0.03, 0.36], [0.05, 0.42], [0.034, 0.46], [0.07, topY - 0.035], [0.001, topY - 0.035]];
  b.wood.add(lathe(ped, 14, 0.5), M);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.wood.add(tube(new THREE.Vector3(Math.cos(a) * 0.04, 0.09, Math.sin(a) * 0.04), new THREE.Vector3(Math.cos(a) * 0.26, 0.012, Math.sin(a) * 0.26), 0.022, 8, 0.016), M);
    b.brass.add(sphere(Math.cos(a) * 0.27, 0.014, Math.sin(a) * 0.27, 0.02, 8, 6), M);
  }
  const y = topY;
  if (variant === 1) {
    decanter(b, M, y, -0.1, 0.02);
    newspaper(b, atlas, M, y, 0.06, -0.14, 0.5);
  } else {
    trayAndTea(b, M, y, 0, 0, false);
  }
}

// ---------------------------------------------------------------------------------------------
// Lamps
// ---------------------------------------------------------------------------------------------
export function addStandardLamp(b: Buckets, M: THREE.Matrix4): void {
  b.brass.add(lathe([[0.001, 0], [0.17, 0], [0.175, 0.014], [0.15, 0.03], [0.09, 0.05], [0.035, 0.085], [0.02, 0.13], [0.014, 0.18]], 24, 0.5), M);
  b.brass.add(tube(new THREE.Vector3(0, 0.17, 0), new THREE.Vector3(0, 1.33, 0), 0.0135, 8), M);
  for (const y of [0.55, 0.95]) b.brass.add(lathe([[0.012, y - 0.04], [0.03, y - 0.015], [0.034, y], [0.03, y + 0.015], [0.012, y + 0.04]], 10, 0.5), M);
  // harp + finial
  b.brass.add(new THREE.TorusGeometry(0.1, 0.004, 5, 24).rotateX(Math.PI / 2).translate(0, 1.31, 0), M);
  b.brass.add(lathe([[0.001, 1.64], [0.012, 1.64], [0.016, 1.67], [0.008, 1.705], [0.001, 1.72]], 10, 0.5), M);
  b.brass.add(tube(new THREE.Vector3(0, 1.33, 0), new THREE.Vector3(0, 1.64, 0), 0.006, 6), M);
  // pleated silk shade
  const nPhi = 160;
  const shade = gridLathe(nPhi, [1.33, 1.5, 1.66], (phi, y) => {
    const t = (y - 1.33) / 0.33;
    const r = 0.27 + (0.17 - 0.27) * t + 0.01 * (1 - Math.abs(2 * t - 1) * 0.4);
    return r + 0.0095 * Math.cos(phi * 40);
  }, 6, 0.5);
  b.shade.add(shade, M);
  b.glow.add(sphere(0, 1.46, 0, 0.045, 10, 8), M);
}

export function addBankersLamp(b: Buckets, M: THREE.Matrix4): void {
  b.brass.add(lathe([[0.001, 0], [0.075, 0], [0.08, 0.012], [0.06, 0.03], [0.03, 0.05], [0.018, 0.09], [0.001, 0.1]], 18, 0.5), M);
  b.brass.add(tube(new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(0, 0.3, 0), 0.011, 8), M);
  b.brass.add(cylX(0, 0.325, 0, 0.012, 0.1, 8), M);
  const shade = new THREE.CylinderGeometry(0.085, 0.085, 0.32, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
  b.greenGlass.add(shade, mul(M, xf(0, 0.335, 0)));
  for (const s of [-1, 1]) b.brass.add(new THREE.TorusGeometry(0.085, 0.004, 5, 14, Math.PI).rotateY(Math.PI / 2 * s).translate(s * 0.16, 0.335, 0), M);
  b.glow.add(sphere(0, 0.28, 0, 0.03, 8, 6), M);
}

// ---------------------------------------------------------------------------------------------
// Kentia palm in a brass urn
// ---------------------------------------------------------------------------------------------
function frond(L: number, width: number, e0: number, e1: number, heading: number, origin: THREE.Vector3, seg = 8): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  let r = 0;
  let y = 0;
  const cols = [-1, 0, 1];
  for (let j = 0; j <= seg; j++) {
    const t = j / seg;
    const e = e0 + (e1 - e0) * t * t * (0.6 + 0.4 * t);
    if (j > 0) {
      r += Math.cos(e) * (L / seg);
      y += Math.sin(e) * (L / seg);
    }
    const hw = (width / 2) * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.6 + 0.2)) * (t > 0.88 ? 1 - (t - 0.88) * 4 : 1);
    for (const col of cols) {
      const lat = col * hw;
      const lift = -Math.abs(col) * hw * 0.35; // V-fold
      const lx = lat;
      const lz = r;
      pos.push(origin.x + lx * c + lz * s, origin.y + y + lift, origin.z - lx * s + lz * c);
      uv.push((col + 1) / 2, t);
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let k = 0; k < 2; k++) {
      const a = j * 3 + k;
      idx.push(a, a + 1, a + 4, a, a + 4, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function addPalm(b: Buckets, M: THREE.Matrix4, variant: number): void {
  const R = rng(1000 + variant * 77);
  // brass urn
  b.brass.add(lathe([[0.001, 0], [0.12, 0], [0.13, 0.02], [0.1, 0.05], [0.09, 0.09], [0.15, 0.2], [0.2, 0.3], [0.19, 0.39], [0.155, 0.45], [0.17, 0.465], [0.17, 0.485], [0.145, 0.485]], 28, 0.5), M);
  b.leather.add(new THREE.CircleGeometry(0.145, 20).rotateX(-Math.PI / 2).translate(0, 0.47, 0), M, 0x1c120b);
  const nCanes = 5;
  for (let i = 0; i < nCanes; i++) {
    const a = (i / nCanes) * Math.PI * 2 + R() * 0.5;
    const lean = 0.08 + R() * 0.2;
    const h = 1.05 + R() * 0.55;
    const base = new THREE.Vector3(Math.cos(a) * 0.04, 0.47, Math.sin(a) * 0.04);
    const top = new THREE.Vector3(Math.cos(a) * (0.04 + lean), 0.47 + h, Math.sin(a) * (0.04 + lean));
    b.leather.add(tube(base, top, 0.011, 6, 0.007), M, 0x5a5230);
    // 3 fronds from each cane tip
    for (let k = 0; k < 3; k++) {
      const hd = a + (k - 1) * 0.9 + (R() - 0.5) * 0.5;
      const L = 0.95 + R() * 0.45;
      b.fronds.add(frond(L, 0.5, 0.95 + R() * 0.25, -0.5 - R() * 0.3, hd, top), M);
    }
  }
  // low outer fronds from the urn mouth
  for (let k = 0; k < 6; k++) {
    const hd = (k / 6) * Math.PI * 2 + R() * 0.6;
    b.fronds.add(frond(0.9 + R() * 0.3, 0.46, 0.55 + R() * 0.2, -0.7, hd, new THREE.Vector3(Math.cos(hd) * 0.05, 0.5, Math.sin(hd) * 0.05)), M);
  }
}

// ---------------------------------------------------------------------------------------------
// Luggage: steamer trunks, hatboxes, brass birdcage trolley
// ---------------------------------------------------------------------------------------------
export function addTrunk(b: Buckets, M: THREE.Matrix4, w: number, h: number, d: number, color: number): void {
  const bodyH = h * 0.62;
  b.leather.add(rbox(-w / 2, 0.02, -d / 2, w / 2, bodyH, d / 2, 0.03), M, color);
  const lid = new THREE.CylinderGeometry(d / 2, d / 2, w - 0.004, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  lid.scale(1, (h - bodyH) / (d / 2), 1);
  b.leather.add(lid, mul(M, xf(0, bodyH, 0)), color);
  // wooden slats + brass hardware
  for (const x of [-w * 0.36, -w * 0.12, w * 0.12, w * 0.36]) {
    b.wood.add(rbox(x - 0.018, 0.03, -d / 2 - 0.004, x + 0.018, bodyH, d / 2 + 0.004, 0.006), M);
    const slat = new THREE.CylinderGeometry(d / 2 + 0.006, d / 2 + 0.006, 0.036, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    slat.scale(1, (h - bodyH + 0.006) / (d / 2 + 0.006), 1);
    b.wood.add(slat, mul(M, xf(x, bodyH, 0)));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.brass.add(box(sx * (w / 2 - 0.035) - 0.03, 0.02, sz * (d / 2 - 0.035) - 0.03, sx * (w / 2 - 0.035) + 0.03, 0.09, sz * (d / 2 - 0.035) + 0.03), M);
  }
  for (const x of [-w * 0.25, w * 0.25]) b.brass.add(box(x - 0.025, bodyH - 0.07, d / 2 - 0.004, x + 0.025, bodyH + 0.01, d / 2 + 0.014), M);
  b.brass.add(box(-0.06, bodyH + 0.0, d / 2 - 0.004, 0.06, bodyH + 0.012, d / 2 + 0.01), M);
  b.brass.add(new THREE.TorusGeometry(0.06, 0.007, 5, 14, Math.PI).translate(0, h - 0.03, 0).rotateY(0), M);
}

export function addHatbox(b: Buckets, M: THREE.Matrix4, r: number, h: number, color: number): void {
  b.leather.add(lathe([[0.001, 0], [r, 0], [r + 0.004, 0.01], [r + 0.004, h - 0.045], [r, h - 0.04], [r + 0.012, h - 0.03], [r + 0.012, h - 0.003], [0.001, h]], 22, 0.5), M, color);
  b.brass.add(lathe([[r + 0.004, h * 0.5 - 0.012], [r + 0.009, h * 0.5 - 0.012], [r + 0.009, h * 0.5 + 0.012], [r + 0.004, h * 0.5 + 0.012]], 22, 0.5), M);
}

export function addTrolley(b: Buckets, M: THREE.Matrix4): void {
  const W = 1.1;
  const D = 0.62;
  const hx = W / 2;
  const hz = D / 2;
  // decks
  for (const y of [0.2, 0.78]) {
    b.wood.add(rbox(-hx, y, -hz, hx, y + 0.035, hz, 0.012), M);
    b.brass.add(rbox(-hx - 0.012, y - 0.01, -hz - 0.012, hx + 0.012, y + 0.012, hz + 0.012, 0.006), M);
  }
  // corner posts + top frame with arched sides (birdcage)
  const top = 1.5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.brass.add(tube(new THREE.Vector3(sx * hx, 0.2, sz * hz), new THREE.Vector3(sx * hx, top - 0.1, sz * hz), 0.012, 8), M);
      b.brass.add(sphere(sx * hx, top - 0.09, sz * hz, 0.02, 8, 6), M);
    }
  }
  for (const sz of [-1, 1]) {
    b.brass.add(tube(new THREE.Vector3(-hx, top - 0.1, sz * hz), new THREE.Vector3(hx, top - 0.1, sz * hz), 0.01, 8), M);
    // arched cross-bars
    const arch = new THREE.TorusGeometry(hx, 0.008, 5, 24, Math.PI);
    arch.scale(1, 0.1 / hx, 1);
    b.brass.add(arch, mul(M, xf(0, top - 0.1, sz * hz)));
    // mid rail
    b.brass.add(tube(new THREE.Vector3(-hx, 0.8 + 0.5, sz * hz), new THREE.Vector3(hx, 0.8 + 0.5, sz * hz), 0.006, 6), M);
  }
  for (const sx of [-1, 1]) {
    b.brass.add(tube(new THREE.Vector3(sx * hx, top - 0.1, -hz), new THREE.Vector3(sx * hx, top - 0.1, hz), 0.01, 8), M);
    const arch = new THREE.TorusGeometry(hz, 0.008, 5, 18, Math.PI).rotateY(Math.PI / 2);
    arch.scale(1, 0.1 / hz, 1);
    b.brass.add(arch, mul(M, xf(sx * hx, top - 0.1, 0)));
  }
  // extra vertical bars on the long sides
  for (const sz of [-1, 1]) {
    for (let i = 1; i < 6; i++) {
      const x = -hx + (i / 6) * W;
      b.brass.add(tube(new THREE.Vector3(x, 0.235, sz * hz), new THREE.Vector3(x, 1.38, sz * hz), 0.004, 5), M);
    }
  }
  // push handle + wheels
  b.brass.add(tube(new THREE.Vector3(-hx, 1.0, 0), new THREE.Vector3(-hx - 0.18, 1.12, 0), 0.01, 8), M);
  b.brass.add(cylZ(-hx - 0.18, 1.12, 0, 0.012, 0.5, 8), M);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.iron.add(cylZ(sx * (hx - 0.05), 0.1, sz * (hz + 0.02), 0.1, 0.04, 20), M);
      b.brass.add(cylZ(sx * (hx - 0.05), 0.1, sz * (hz + 0.04), 0.035, 0.012, 14), M);
      b.brass.add(tube(new THREE.Vector3(sx * (hx - 0.05), 0.1, sz * (hz + 0.0)), new THREE.Vector3(sx * (hx - 0.05), 0.2, sz * (hz - 0.02)), 0.01, 6), M);
    }
  }
  // luggage
  addTrunk(b, mul(M, xf(0.0, 0.235, 0.0)), 0.9, 0.5, 0.5, TRUNK_COLORS[0]!);
  addTrunk(b, mul(M, xf(-0.12, 0.815, 0.0)), 0.7, 0.4, 0.42, TRUNK_COLORS[2]!);
  addHatbox(b, mul(M, xf(0.32, 0.815, 0.0)), 0.17, 0.2, 0xd8c8a2);
  addHatbox(b, mul(M, xf(0.32, 1.015, 0.0)), 0.13, 0.17, 0x8a2128);
}

// ---------------------------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------------------------
export function addPiece(b: Buckets, atlas: PaperAtlas, p: Piece): void {
  const M = xf(p.x, p.level, p.z, p.yaw);
  switch (p.kind) {
    case 'sofa':
      addSofa(b, M, p.tint ?? 'oxblood');
      break;
    case 'chair':
      addChair(b, M, p.tint ?? 'oxblood');
      break;
    case 'coffeeTable':
      addCoffeeTable(b, atlas, M, p.variant ?? 0);
      break;
    case 'roundTable':
      addRoundTable(b, atlas, M, p.variant ?? 0);
      break;
    case 'standardLamp':
      addStandardLamp(b, M);
      break;
    case 'palm':
      addPalm(b, M, p.variant ?? 0);
      break;
    case 'trolley':
      addTrolley(b, M);
      break;
    default:
      addLoungePiece(b, atlas, M, p);
  }
  void M0;
}
