import * as THREE from 'three';
import { gridLathe, rng } from '../concourse/geo';
import { atlasUV, box, cylX, lathe, mul, rbox, slab, sphere, tube, xf } from './kit';
import { addBankersLamp, addPalm, decanter, newspaper, turnedLeg, type Buckets } from './furniture';
import type { Piece, Tint } from './layoutData';
import type { PaperAtlas, UVRect } from './textures';

/** First-class lounge furniture (local +z = FRONT, y up from the floor): lamps, tables, desk, fireplace, sideboards, bookcases. */

const LEATHER_DARK = 0x1f4a35;

/** Table lamp: brass baluster, pleated silk shade (emissive), tiny finial. Origin at the base. */
export function addTableLamp(b: Buckets, M: THREE.Matrix4): void {
  b.brass.add(lathe([[0.001, 0], [0.095, 0], [0.1, 0.012], [0.078, 0.03], [0.04, 0.06], [0.056, 0.115], [0.034, 0.17], [0.05, 0.215], [0.02, 0.26], [0.014, 0.31]], 20, 0.5), M);
  b.brass.add(lathe([[0.001, 0.505], [0.01, 0.505], [0.012, 0.53], [0.004, 0.55], [0.001, 0.552]], 8, 0.5), M);
  b.brass.add(tube(new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, 0.52, 0), 0.006, 6), M);
  const shade = gridLathe(112, [0.29, 0.4, 0.51], (phi, y) => {
    const t = (y - 0.29) / 0.22;
    return 0.2 + (0.118 - 0.2) * t + 0.008 * (1 - Math.abs(2 * t - 1) * 0.4) + 0.0075 * Math.cos(phi * 32);
  }, 5, 0.5);
  b.shade.add(shade, M);
  b.glow.add(sphere(0, 0.39, 0, 0.032, 8, 6), M);
}

/** Small round pedestal side table with a table lamp. */
export function addSideTable(b: Buckets, M: THREE.Matrix4, withLamp = true): void {
  const topY = 0.58;
  b.wood.add(slab(0, 0, 0.56, 0.56, topY - 0.035, 0.035, 0.28, 0.006), M);
  b.brass.add(lathe([[0.275, topY - 0.012], [0.282, topY - 0.012], [0.282, topY - 0.001], [0.275, topY - 0.001]], 28, 0.5), M);
  b.wood.add(lathe([[0.001, 0.02], [0.05, 0.02], [0.05, 0.08], [0.03, 0.14], [0.038, 0.22], [0.024, 0.32], [0.03, 0.42], [0.046, 0.5], [0.03, 0.54], [0.06, topY - 0.035], [0.001, topY - 0.035]], 14, 0.5), M);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    b.wood.add(tube(new THREE.Vector3(Math.cos(a) * 0.04, 0.085, Math.sin(a) * 0.04), new THREE.Vector3(Math.cos(a) * 0.21, 0.012, Math.sin(a) * 0.21), 0.02, 8, 0.014), M);
  }
  if (withLamp) addTableLamp(b, mul(M, xf(0, topY, 0)));
}

/** Writing desk: walnut pedestal desk with a green leather inset, drawers with brass pulls, banker's lamp, blotter, pen. */
export function addWritingDesk(b: Buckets, atlas: PaperAtlas, M: THREE.Matrix4): void {
  const W = 1.6;
  const D = 0.82;
  const H = 0.76;
  const hw = W / 2;
  const hd = D / 2;
  // top with moulded edge
  b.wood.add(slab(0, 0, W + 0.06, D + 0.06, H - 0.05, 0.05, 0.03, 0.01), M);
  b.leather.add(rbox(-hw + 0.06, H - 0.002, -hd + 0.06, hw - 0.06, H + 0.004, hd - 0.06, 0.002, 1), M, LEATHER_DARK);
  // gilt line around the inset
  for (const [x0, z0, x1, z1] of [
    [-hw + 0.05, -hd + 0.05, hw - 0.05, -hd + 0.058],
    [-hw + 0.05, hd - 0.058, hw - 0.05, hd - 0.05],
    [-hw + 0.05, -hd + 0.058, -hw + 0.058, hd - 0.058],
    [hw - 0.058, -hd + 0.058, hw - 0.05, hd - 0.058],
  ] as const) b.brass.add(box(x0, H - 0.001, z0, x1, H + 0.005, z1), M);
  // pedestals with three drawers each
  const pw = 0.46;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hw + 0.03 : hw - 0.03 - pw;
    const x1 = x0 + pw;
    b.wood.add(rbox(x0, 0.07, -hd + 0.03, x1, H - 0.05, hd - 0.03, 0.012, 2), M);
    b.wood.add(rbox(x0 - 0.01, 0, -hd + 0.02, x1 + 0.01, 0.075, hd - 0.02, 0.01, 2), M);
    const dh = (H - 0.05 - 0.07 - 0.04) / 3;
    for (let i = 0; i < 3; i++) {
      const y0 = 0.09 + i * (dh + 0.012);
      b.wood.add(rbox(x0 + 0.02, y0, hd - 0.045, x1 - 0.02, y0 + dh, hd - 0.012, 0.008, 2), M);
      b.brass.add(box(x0 + 0.02 + 0.012, y0 + 0.012, hd - 0.008, x1 - 0.02 - 0.012, y0 + 0.016, hd - 0.004), M);
      b.brass.add(box(x0 + pw / 2 - 0.07, y0 + dh / 2 - 0.007, hd - 0.012, x0 + pw / 2 + 0.07, y0 + dh / 2 + 0.007, hd + 0.012), M);
      b.brass.add(sphere(x0 + pw / 2 - 0.07, y0 + dh / 2, hd + 0.012, 0.012, 8, 5), M);
      b.brass.add(sphere(x0 + pw / 2 + 0.07, y0 + dh / 2, hd + 0.012, 0.012, 8, 5), M);
    }
  }
  // kneehole: modesty panel and a drawer above it
  b.wood.add(rbox(-hw + pw + 0.03, 0.12, -hd + 0.03, hw - pw - 0.03, H - 0.05, -hd + 0.07, 0.008, 2), M);
  b.wood.add(rbox(-hw + pw + 0.03, H - 0.135, -hd + 0.03, hw - pw - 0.03, H - 0.05, hd - 0.03, 0.008, 2), M);
  b.brass.add(box(-0.07, H - 0.1, hd - 0.03, 0.07, H - 0.086, hd - 0.012), M);
  // dressing
  addBankersLamp(b, mul(M, xf(-0.52, H + 0.004, -0.2, 0.5)));
  b.leather.add(rbox(-0.2, H + 0.004, 0.0, 0.22, H + 0.01, 0.26, 0.003, 1), M, 0xe6dcc2);
  const paper = box(-0.12, 0, -0.1, 0.12, 0.003, 0.1);
  const ledger = atlas.cell.ledger;
  if (ledger) atlasUV(paper, ledger);
  b.paper.add(paper, mul(M, xf(0.04, H + 0.0105, 0.12, 0.2)));
  b.silver.add(tube(new THREE.Vector3(0.12, H + 0.016, 0.02), new THREE.Vector3(0.3, H + 0.016, 0.16), 0.0045, 6), M);
  b.crystal.add(lathe([[0.001, 0], [0.034, 0], [0.04, 0.01], [0.04, 0.045], [0.026, 0.056], [0.001, 0.056]], 12, 0.5), mul(M, xf(0.42, H + 0.004, -0.2)));
  b.silver.add(lathe([[0.001, 0.056], [0.024, 0.056], [0.02, 0.07], [0.001, 0.07]], 12, 0.5), mul(M, xf(0.42, H + 0.004, -0.2)));
  // brass letter rack
  for (let i = 0; i < 4; i++) b.brass.add(box(0.5 + i * 0.001 - 0.12, H + 0.004, 0.18 + i * 0.045, 0.5 + 0.12, H + 0.012, 0.188 + i * 0.045), M);
  newspaper(b, atlas, M, H + 0.004, 0.46, 0.22, 0.5);
}

/** Walnut side chair (leather seat, splat back) for the desk. Front +z. */
export function addDeskChair(b: Buckets, M: THREE.Matrix4, tint: Tint): void {
  const col = tint === 'green' ? 0x2f5a44 : 0x8e2a2c;
  b.leather.add(rbox(-0.235, 0.41, -0.225, 0.235, 0.485, 0.235, 0.03, 3), M, col);
  b.wood.add(rbox(-0.25, 0.375, -0.24, 0.25, 0.415, 0.25, 0.012, 2), M);
  for (const sx of [-1, 1]) {
    b.wood.add(turnedLeg(0.4, 0.95), mul(M, xf(sx * 0.215, 0, 0.21)));
    b.wood.add(tube(new THREE.Vector3(sx * 0.215, 0.0, -0.27), new THREE.Vector3(sx * 0.215, 0.42, -0.215), 0.019, 8, 0.026), M);
    b.wood.add(tube(new THREE.Vector3(sx * 0.215, 0.42, -0.215), new THREE.Vector3(sx * 0.225, 0.96, -0.255), 0.019, 8, 0.016), M);
  }
  b.wood.add(rbox(-0.25, 0.9, -0.275, 0.25, 0.97, -0.24, 0.016, 2), M);
  b.leather.add(rbox(-0.17, 0.52, -0.255, 0.17, 0.87, -0.23, 0.02, 2), M, col);
  b.brass.add(box(-0.17, 0.515, -0.258, 0.17, 0.522, -0.246), M);
}

/** Marble fireplace with an overmantel mirror, logs laid but unlit, fender and mantel garniture. Back at z = 0. */
export function addFireplace(b: Buckets, atlas: PaperAtlas, M: THREE.Matrix4): void {
  // hearth + surround
  b.marble.add(rbox(-1.12, 0, 0, 1.12, 0.045, 0.74, 0.008, 2), M);
  for (const s of [-1, 1]) {
    b.marble.add(rbox(s * 0.72 - 0.23, 0.045, 0, s * 0.72 + 0.23, 1.22, 0.3, 0.01, 2), M);
    b.dark.add(box(s * 0.5 - (s > 0 ? 0 : 0.03), 0.045, 0.3, s * 0.5 + (s > 0 ? 0.03 : 0), 1.0, 0.315), M);
  }
  b.marble.add(rbox(-0.96, 1.0, 0, 0.96, 1.22, 0.3, 0.01, 2), M);
  b.dark.add(box(-0.5, 0.045, 0.0, 0.5, 1.0, 0.04), M); // firebox back
  b.dark.add(box(-0.5, 0.045, 0.0, 0.5, 0.06, 0.34), M);
  b.dark.add(box(-0.5, 0.97, 0.0, 0.5, 1.0, 0.3), M);
  // brass trim line around the opening
  b.brass.add(box(-0.5, 0.995, 0.3, 0.5, 1.012, 0.325), M);
  for (const s of [-1, 1]) b.brass.add(box(s * 0.5 - 0.009, 0.045, 0.3, s * 0.5 + 0.009, 1.0, 0.325), M);
  // plinth blocks and frieze tablet
  b.marble.add(box(-0.97, 0.045, 0.0, 0.97, 0.12, 0.33), M);
  b.dark.add(box(-0.3, 1.05, 0.3, 0.3, 1.17, 0.312), M);
  b.brass.add(box(-0.3, 1.05, 0.312, 0.3, 1.056, 0.318), M);
  b.brass.add(box(-0.3, 1.164, 0.312, 0.3, 1.17, 0.318), M);
  // mantel shelf
  b.marble.add(rbox(-1.18, 1.22, 0, 1.18, 1.3, 0.42, 0.012, 2), M);
  b.marble.add(rbox(-1.1, 1.3, 0, 1.1, 1.325, 0.36, 0.006, 1), M);
  // logs and irons
  const logs: Array<[number, number, number, number, number, number]> = [
    [-0.3, 0.1, 0.12, 0.3, 0.1, 0.12], [-0.25, 0.1, 0.22, 0.32, 0.1, 0.24], [-0.2, 0.2, 0.16, 0.28, 0.2, 0.18],
  ];
  for (const [x0, y0, z0, x1, y1, z1] of logs) {
    b.wood.add(tube(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), 0.05, 10, 0.045), M);
  }
  for (const s of [-1, 1]) {
    b.brass.add(tube(new THREE.Vector3(s * 0.4, 0.06, 0.12), new THREE.Vector3(s * 0.4, 0.34, 0.12), 0.012, 8), M);
    b.brass.add(sphere(s * 0.4, 0.36, 0.12, 0.027, 10, 8), M);
    b.brass.add(box(s * 0.4 - 0.012, 0.06, 0.08, s * 0.4 + 0.012, 0.075, 0.3), M);
  }
  // fender: low brass rail with posts
  b.brass.add(tube(new THREE.Vector3(-0.95, 0.15, 0.7), new THREE.Vector3(0.95, 0.15, 0.7), 0.01, 8), M);
  b.brass.add(tube(new THREE.Vector3(-0.95, 0.15, 0.7), new THREE.Vector3(-0.95, 0.15, 0.4), 0.01, 8), M);
  b.brass.add(tube(new THREE.Vector3(0.95, 0.15, 0.7), new THREE.Vector3(0.95, 0.15, 0.4), 0.01, 8), M);
  for (let i = 0; i <= 8; i++) b.brass.add(tube(new THREE.Vector3(-0.95 + i * 0.2375, 0.05, 0.7), new THREE.Vector3(-0.95 + i * 0.2375, 0.15, 0.7), 0.007, 6), M);
  b.brass.add(box(-0.96, 0.045, 0.69, 0.96, 0.06, 0.71), M);
  // overmantel mirror in a gilt frame
  const mw = 1.5;
  const my0 = 1.62;
  const my1 = 2.85;
  b.brass.add(rbox(-mw / 2 - 0.08, my0 - 0.08, 0.0, mw / 2 + 0.08, my1 + 0.08, 0.07, 0.02, 2), M);
  const land = atlas.cell.land0;
  if (land) b.paper.add(atlasUV(new THREE.PlaneGeometry(mw, my1 - my0).translate(0, (my0 + my1) / 2, 0.073), land), M);
  b.wood.add(box(-mw / 2 - 0.02, my0 - 0.02, 0.06, mw / 2 + 0.02, my0, 0.066), M);
  b.brass.add(lathe([[0.001, 0], [0.1, 0], [0.11, 0.02], [0.06, 0.08], [0.09, 0.16], [0.001, 0.2]], 18, 0.5), mul(M, xf(0, my1 + 0.08, 0.03)));
  // garniture: candlesticks, decanter, clock face
  for (const s of [-1, 1]) {
    const m = mul(M, xf(s * 0.82, 1.325, 0.17));
    b.silver.add(lathe([[0.001, 0], [0.05, 0], [0.05, 0.02], [0.018, 0.05], [0.012, 0.18], [0.03, 0.2], [0.02, 0.22], [0.001, 0.22]], 14, 0.5), m);
    b.leather.add(lathe([[0.001, 0.22], [0.013, 0.22], [0.013, 0.34], [0.001, 0.34]], 8, 0.5), m, 0xece0c2);
  }
  decanter(b, M, 1.325, 0.42, 0.17);
  const face = new THREE.CircleGeometry(0.13, 26);
  const cell: UVRect | undefined = atlas.cell.clock;
  if (cell) {
    const uv = face.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
  }
  b.paper.add(face, mul(M, xf(0, 1.47, 0.171)));
  b.brass.add(new THREE.TorusGeometry(0.135, 0.012, 6, 24), mul(M, xf(0, 1.47, 0.171)));
  b.brass.add(box(-0.19, 1.325, 0.08, 0.19, 1.36, 0.17), M);
  b.wood.add(rbox(-0.17, 1.36, 0.1, 0.17, 1.58, 0.17, 0.02, 2), M);
}

/** Console sideboard: walnut doors with brass pulls, black marble top, mirror above, lamps and decanters. Back at z = 0. */
export function addSideboard(b: Buckets, atlas: PaperAtlas, M: THREE.Matrix4, mirror = true, variant = 0): void {
  const W = 1.7;
  const D = 0.5;
  const H = 0.88;
  const hw = W / 2;
  b.wood.add(rbox(-hw + 0.02, 0.1, 0.0, hw - 0.02, H - 0.04, D - 0.03, 0.012, 2), M);
  b.wood.add(rbox(-hw + 0.04, 0.0, 0.02, hw - 0.04, 0.11, D - 0.06, 0.012, 2), M);
  for (let i = 0; i < 3; i++) {
    const x0 = -hw + 0.07 + i * ((W - 0.14) / 3);
    const x1 = x0 + (W - 0.14) / 3 - 0.012;
    b.wood.add(rbox(x0, 0.15, D - 0.045, x1, H - 0.1, D - 0.005, 0.01, 2), M);
    b.brass.add(box(x0 + 0.03, 0.18, D - 0.006, x1 - 0.03, 0.186, D - 0.002), M);
    b.brass.add(box(x0 + 0.03, H - 0.136, D - 0.006, x1 - 0.03, H - 0.13, D - 0.002), M);
    b.brass.add(sphere((x0 + x1) / 2, (0.15 + H - 0.1) / 2, D + 0.002, 0.016, 10, 6), M);
  }
  b.dark.add(rbox(-hw - 0.02, H - 0.04, 0.0, hw + 0.02, H, D + 0.035, 0.006, 2), M);
  b.brass.add(box(-hw - 0.02, H - 0.052, 0.0, hw + 0.02, H - 0.04, D + 0.03), M);
  if (mirror) {
    // gilt-framed oil landscape (replaces the dull mirror panel); sits on the wainscot above the console
    const mw = 1.3;
    const y0 = 1.3;
    const y1 = 2.28;
    const fr = 0.075;
    b.brass.add(rbox(-mw / 2 - fr, y0 - fr, 0.0, mw / 2 + fr, y1 + fr, 0.07, 0.016, 2), M);
    const cell = atlas.cell[`land${variant % 4}`];
    if (cell) b.paper.add(atlasUV(new THREE.PlaneGeometry(mw, y1 - y0).translate(0, (y0 + y1) / 2, 0.075), cell), M);
    b.wood.add(box(-mw / 2 - 0.015, y0 - 0.015, 0.06, mw / 2 + 0.015, y0, 0.072), M);
  }
  for (const s of [-1, 1]) addTableLamp(b, mul(M, xf(s * 0.62, H, 0.21)));
  b.silver.add(lathe([[0.001, 0], [0.16, 0], [0.165, 0.008], [0.165, 0.02], [0.155, 0.018], [0.001, 0.01]], 26, 0.5), mul(M, xf(0, H, 0.24)));
  decanter(b, M, H + 0.012, -0.07, 0.24);
  decanter(b, M, H + 0.012, 0.09, 0.22);
}

const BOOK_COLORS = [0x5a1519, 0x1d3a2e, 0x2b2a4a, 0x7a5a2c, 0x3b2418, 0x8a6a3a, 0x20303a, 0x6d2a2a, 0x4a3a2a, 0x9a8a62];

/** Library bookcase: walnut carcass with a cornice, five shelves of books. Back at z = 0. */
export function addBookcase(b: Buckets, M: THREE.Matrix4, seed: number): void {
  const W = 1.8;
  const D = 0.4;
  const H = 2.75;
  const hw = W / 2;
  const R = rng(300 + seed);
  b.wood.add(rbox(-hw, 0, 0, hw, 0.14, D, 0.01, 2), M); // plinth
  b.wood.add(rbox(-hw - 0.02, 0.14, 0, -hw + 0.03, H - 0.16, D, 0.008, 2), M);
  b.wood.add(rbox(hw - 0.03, 0.14, 0, hw + 0.02, H - 0.16, D, 0.008, 2), M);
  b.dark.add(box(-hw + 0.03, 0.14, 0, hw - 0.03, H - 0.16, 0.02), M);
  // cornice
  b.wood.add(rbox(-hw - 0.05, H - 0.16, 0, hw + 0.05, H - 0.08, D + 0.03, 0.01, 2), M);
  b.wood.add(rbox(-hw - 0.09, H - 0.08, 0, hw + 0.09, H, D + 0.07, 0.012, 2), M);
  b.brass.add(box(-hw - 0.05, H - 0.1, D + 0.025, hw + 0.05, H - 0.092, D + 0.033), M);
  const shelves = 5;
  const y0 = 0.14;
  const y1 = H - 0.16;
  const pitch = (y1 - y0) / shelves;
  for (let s = 0; s < shelves; s++) {
    const ys = y0 + s * pitch;
    b.wood.add(box(-hw + 0.03, ys, 0.02, hw - 0.03, ys + 0.025, D - 0.01), M);
    // books
    let x = -hw + 0.05;
    const limit = hw - 0.05;
    while (x < limit - 0.04) {
      const w = 0.025 + R() * 0.035;
      if (R() < 0.05) {
        x += 0.12 + R() * 0.2; // gap
        continue;
      }
      const h = 0.22 + R() * (pitch - 0.3);
      const d = 0.2 + R() * 0.12;
      const col = BOOK_COLORS[Math.floor(R() * BOOK_COLORS.length)]!;
      b.leather.add(box(x, ys + 0.025, 0.04, Math.min(x + w, limit), ys + 0.025 + h, 0.04 + d), M, col);
      if (R() < 0.35) b.brass.add(box(x, ys + 0.025 + h * 0.8, 0.04 + d, Math.min(x + w, limit), ys + 0.025 + h * 0.8 + 0.008, 0.04 + d + 0.002), M);
      x += w + 0.002;
    }
  }
  b.wood.add(box(-hw + 0.03, y1, 0.02, hw - 0.03, y1 + 0.025, D - 0.01), M);
  void cylX;
}

/** Grand entrance table: round cream-marble top on a walnut baluster, brass urn with a kentia palm. */
export function addCentreTable(b: Buckets, M: THREE.Matrix4): void {
  const topY = 0.84;
  b.marble.add(slab(0, 0, 1.5, 1.5, topY - 0.05, 0.05, 0.75, 0.008), M);
  b.wood.add(slab(0, 0, 1.56, 1.56, topY - 0.09, 0.04, 0.78, 0.008), M);
  b.brass.add(lathe([[0.76, topY - 0.012], [0.768, topY - 0.012], [0.768, topY - 0.002], [0.76, topY - 0.002]], 48, 0.5), M);
  b.wood.add(lathe([[0.001, 0.05], [0.26, 0.05], [0.28, 0.07], [0.2, 0.12], [0.1, 0.17], [0.07, 0.24], [0.11, 0.32], [0.065, 0.4], [0.07, 0.5], [0.12, 0.6], [0.075, 0.68], [0.16, topY - 0.09], [0.001, topY - 0.09]], 20, 0.5), M);
  b.marble.add(slab(0, 0, 0.78, 0.78, 0, 0.055, 0.39, 0.006), M);
  b.brass.add(lathe([[0.37, 0.054], [0.385, 0.054], [0.385, 0.062], [0.37, 0.062]], 32, 0.5), M);
  addPalm(b, mul(M, xf(0, topY, 0, 0, 0.6)), 21);
}

export function addLoungePiece(b: Buckets, atlas: PaperAtlas, M: THREE.Matrix4, p: Piece): void {
  switch (p.kind) {
    case 'desk':
      addWritingDesk(b, atlas, M);
      break;
    case 'deskChair':
      addDeskChair(b, M, p.tint ?? 'green');
      break;
    case 'fireplace':
      addFireplace(b, atlas, M);
      break;
    case 'sideboard':
      addSideboard(b, atlas, M, p.variant !== 1, p.variant ?? 0);
      break;
    case 'piano':
      addGrandPiano(b, M);
      break;
    case 'bookcase':
      addBookcase(b, M, p.variant ?? 0);
      break;
    case 'sideTable':
      addSideTable(b, M, true);
      break;
    case 'centreTable':
      addCentreTable(b, M);
      break;
    default:
      break;
  }
}

/** Black concert grand, lid propped open, with its bench. Silent. Local +z = keyboard side; origin on the floor at the middle. */
export function addGrandPiano(b: Buckets, M: THREE.Matrix4): void {
  const outline = (zFront: number): THREE.Shape => {
    // shape in (x, -z): straight spine at x = -0.75, curved cheek on +x, tail at z = -1.5
    const s = new THREE.Shape();
    s.moveTo(-0.75, -zFront);
    s.lineTo(-0.75, 1.15);
    s.quadraticCurveTo(-0.75, 1.5, -0.4, 1.5);
    s.bezierCurveTo(0.25, 1.5, 0.3, 0.55, 0.75, 0.3);
    s.lineTo(0.75, -zFront);
    s.closePath();
    return s;
  };
  const extrude = (shape: THREE.Shape, depth: number, y0: number): THREE.BufferGeometry => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    return g;
  };
  const caseTop = 0.98;
  b.dark.add(extrude(outline(0.95), caseTop - 0.62 - 0.024, 0.62 + 0.012), M); // case
  b.brass.add(extrude(outline(0.95), 0.012, caseTop - 0.002).scale(0.985, 1, 0.985), M); // thin gilt inlay line on the rim
  // lid: hinged on the spine, propped open on the curved side
  const th = 0.62;
  const lid = extrude(outline(0.45), 0.03, 0);
  lid.translate(0.75, 0, 0);
  lid.rotateZ(th);
  lid.translate(-0.75, caseTop + 0.01, 0);
  b.dark.add(lid, M);
  const ldx = 1.15;
  const px = -0.75 + ldx * Math.cos(th);
  b.brass.add(tube(new THREE.Vector3(px, caseTop, -0.55), new THREE.Vector3(px, caseTop + ldx * Math.sin(th) + 0.01, -0.55), 0.011, 6), M);
  // keyboard: cream keys, black sharps, key slip, music desk
  b.marble.add(box(-0.62, 0.72, 0.56, 0.62, 0.75, 0.95), M);
  const sharps = [0, 1, 3, 4, 5];
  for (let k = 0; k < 35; k++) {
    if (!sharps.includes(k % 7)) continue;
    const x = -0.62 + ((k + 0.7) * 1.24) / 36;
    b.dark.add(box(x - 0.007, 0.75, 0.6, x + 0.007, 0.77, 0.78), M);
  }
  b.dark.add(box(-0.66, 0.7, 0.52, 0.66, 0.9, 0.56), M);
  b.dark.add(box(-0.66, 0.62, 0.52, 0.66, 0.98, 0.56 - 0.0), M);
  b.dark.add(rbox(-0.66, 0.7, 0.95, 0.66, 0.74, 1.0, 0.01, 1), M);
  b.brass.add(box(-0.66, 0.74, 0.99, 0.66, 0.745, 1.002), M);
  b.dark.add(box(-0.45, caseTop, 0.45, 0.45, caseTop + 0.34, 0.47), M);
  b.brass.add(box(-0.45, caseTop + 0.02, 0.466, 0.45, caseTop + 0.026, 0.474), M);
  // legs (tapered, brass casters) and pedal lyre
  for (const [x, z] of [[-0.62, 0.78], [0.62, 0.78], [-0.1, -1.18]] as const) {
    b.dark.add(tube(new THREE.Vector3(x, 0.1, z), new THREE.Vector3(x, 0.66, z), 0.04, 10, 0.07), M);
    b.brass.add(sphere(x, 0.045, z, 0.04, 8, 6), M);
    b.brass.add(box(x - 0.045, 0.085, z - 0.045, x + 0.045, 0.1, z + 0.045), M);
  }
  b.brass.add(box(-0.05, 0.14, 0.52, 0.05, 0.62, 0.58), M);
  for (const x of [-0.07, 0, 0.07]) b.brass.add(box(x - 0.02, 0.07, 0.5, x + 0.02, 0.09, 0.64), M);
  // bench: padded oxblood leather seat on walnut legs
  const bz = 1.62;
  b.leather.add(rbox(-0.5, 0.46, bz - 0.2, 0.5, 0.56, bz + 0.2, 0.04, 2), M, 0x571a1d);
  b.wood.add(rbox(-0.52, 0.42, bz - 0.22, 0.52, 0.46, bz + 0.22, 0.012, 2), M);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.wood.add(tube(new THREE.Vector3(sx * 0.46, 0.0, bz + sz * 0.17), new THREE.Vector3(sx * 0.46, 0.42, bz + sz * 0.17), 0.02, 8, 0.03), M);
}
