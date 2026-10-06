import * as THREE from 'three';
import { Frame, rng } from './frame';
import type { ShopAtlas } from './atlas';
import { counter, shelf } from './counter';
import { bentwoodChair, bistroTable, clocheStand, cup, espressoMachine, pastry, plate } from './goods';
import { xf } from '../hotel/kit';

const P = Math.PI;
const SILL = 0.86;

/** Coffee & Pastries (door at x_l -3.35, window -2.84..4.28). */
export function stockCoffee(f: Frame, atlas: ShopAtlas): void {
  const R = rng(55);
  // --- back bar: mirror, shelves of tins and jars, menu board, stopped clock ------------------------------------------------
  f.box('silver', -1.9, 1.15, 0.052, 3.2, 2.65, 0.054, '#8e8a80');
  f.frame('brass', -1.95, 1.1, 3.25, 2.7, 0.05, 0.09, 0.05);
  for (const x of [-0.4, 1.2]) f.box('brass', x - 0.008, 1.15, 0.054, x + 0.008, 2.65, 0.07);
  for (const y of [1.45, 1.95]) shelf(f, -1.85, 3.15, y, 0.054, 0.22);
  for (const y of [1.45, 1.95]) {
    for (let i = 0; i < 12; i++) {
      const x = -1.7 + i * 0.4;
      const tall = 0.14 + R() * 0.1;
      f.cyl('goods', x, y, 0.2, 0.065, tall, 12, ['#7a1f24', '#c9a24a', '#1f3d57', '#2f5a3f', '#d9cdb0'][i % 5]);
      f.cyl('brass', x, y + tall, 0.2, 0.066, 0.012, 12);
      f.cyl('silver', x, y + tall + 0.012, 0.2, 0.012, 0.03, 6);
    }
  }
  f.plane(atlas.cell.menu!, 3.72, 1.75, 0.07, 0.56, 0.55);
  f.frame('brass', 3.43, 1.46, 4.01, 2.03, 0.05, 0.08, 0.02);
  f.plane(atlas.cell.clock!, -2.4, 2.1, 0.07, 0.4, 0.4);
  f.add('brass', new THREE.TorusGeometry(0.205, 0.016, 6, 24), undefined, xf(-2.4, 2.1, 0.07));

  // --- Deco counter, fluted, with the machine, cakes under glass, cups set out ------------------------------------------------
  counter(f, -2.55, 4.2, 0.95, 1.7, { fluted: true });
  espressoMachine(f, 1.3, 1.0, 1.25, 0);
  clocheStand(f, -1.7, 1.0, 1.3, 1);
  clocheStand(f, -0.8, 1.0, 1.3, 2);
  clocheStand(f, 3.2, 1.0, 1.35, 3);
  // pyramids of cups and saucers, a row set out in front of the machine
  for (let i = 0; i < 6; i++) cup(f, 2.35 + (i % 3) * 0.2, 1.0, 1.55 + Math.floor(i / 3) * 0.06 - 0.12, 0.3 * i, i < 4);
  for (let i = 0; i < 3; i++) cup(f, 0.2 + i * 0.2, 1.0, 1.5, 0.1, i !== 1);
  // pastry trays on the left of the counter
  plate(f, 0.09, 1.0, 1.15, 0.3, '#f3eee2');
  for (let i = 0; i < 5; i++) pastry(f, i, -0.15 + i * 0.12, 1.016, 1.15, R() * 3);
  // sugar bowl, milk jug, silver spoons on a tray
  f.cyl('silver', 0.6, 1.0, 1.55, 0.04, 0.05, 12);
  f.cyl('silver', 0.7, 1.0, 1.55, 0.03, 0.07, 10, undefined, 0.022);

  // --- window: long table dressed with cakes and cups for nobody -----------------------------------------------------------------
  f.box('wood', -2.7, SILL, 1.95, 4.1, SILL + 0.03, 2.62);
  f.box('goods', -2.65, SILL + 0.03, 2.0, 4.05, SILL + 0.034, 2.6, '#efe7d2');
  [-1.8, -0.7, 0.5, 1.7, 2.9].forEach((x, i) => clocheStand(f, x, SILL + 0.034, 2.3, 10 + i, i % 2 === 0));
  [-1.25, -0.1, 1.1, 2.3, 3.5].forEach((x, i) => {
    cup(f, x, SILL + 0.034, 2.45, i, true);
    cup(f, x + 0.2, SILL + 0.034, 2.5, i + 2, false);
  });
  // raised tiers of pastries along the glass
  for (let i = 0; i < 6; i++) pastry(f, i + 1, -2.4 + i * 0.12, SILL + 0.034, 2.52, 0);
  // a wedding-cake tower on the long window table
  const cc = f.at(3.7, SILL + 0.034, 2.2);
  [0.13, 0.1, 0.07].forEach((r, i) => cc.cyl('goods', 0, i * 0.1, 0, r, 0.1, 18, i === 1 ? '#f4d5de' : '#f6efde'));
  cc.ball('goods', 0, 0.33, 0, 0.018, '#b3122a');

  // --- outside: two marble-topped bistro tables with bentwood chairs, coffee set out -----------------------------------------
  const out = f.at(0, 0, 0);
  for (const tx of [-1.2, 2.0]) {
    bistroTable(out, tx, 3.45);
    bentwoodChair(out, tx - 0.8, 3.45, P / 2 + (tx < 0 ? 0.0 : 0.15));
    bentwoodChair(out, tx + 0.8, 3.45, -P / 2 + (tx < 0 ? -0.1 : 0.0));
    cup(out, tx - 0.1, 0.73, 3.4, 0.4, true);
    plate(out, tx + 0.12, 0.73, 3.52, 0.09, '#f3eee2');
    pastry(out, tx < 0 ? 1 : 2, tx + 0.12, 0.745, 3.52, 0.7);
  }
  // one chair pulled out, as if someone has just left
  bentwoodChair(out, 2.0 - 0.8, 3.45, P / 2 + 0.55);
}

/** Travellers' Conveniences: open alcove. Booths x_l -3.85 / -2.8, lockers centre, shoeshine right, weigher, pillar box. */
export function stockConveniences(f: Frame, atlas: ShopAtlas): void {
  // --- two walnut telephone booths with glass doors and a lamp --------------------------------------------------------------------
  [-3.85, -2.8].forEach((bx, i) => phoneBooth(f.at(bx, 0, 0.62), atlas, i));
  f.plane(atlas.cell.telephone!, -3.325, 2.62, 0.06, 1.0, 0.25);

  // --- brass luggage lockers (3 rows x 8), numbered ---------------------------------------------------------------------------
  const lx0 = -1.66;
  const cols = 8;
  const rows = 3;
  const cw = 0.46;
  const ch = 0.62;
  f.box('dark', lx0 - 0.05, 0, 0.05, lx0 + cols * cw + 0.05, 0.1, 0.55);
  f.box('wood', lx0 - 0.03, 0.1, 0.05, lx0 + cols * cw + 0.03, rows * ch + 0.13, 0.52);
  f.box('brass', lx0 - 0.05, rows * ch + 0.13, 0.05, lx0 + cols * cw + 0.05, rows * ch + 0.16, 0.56);
  let n = 1;
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const x = lx0 + c * cw + cw / 2;
      const y0 = 0.12 + r * ch;
      f.rbox('brass', x - cw / 2 + 0.012, y0 + 0.012, 0.52, x + cw / 2 - 0.012, y0 + ch - 0.012, 0.545, 0.008);
      f.frame('dark', x - cw / 2 + 0.03, y0 + 0.03, x + cw / 2 - 0.03, y0 + ch - 0.03, 0.545, 0.549, 0.006);
      f.plane(atlas.cell[`num${n}`]!, x, y0 + ch * 0.72, 0.551, 0.1, 0.1);
      f.ball('dark', x, y0 + ch * 0.38, 0.55, 0.01, undefined, 1, 1, 0.5, 6, 4);
      f.box('brass', x - 0.1, y0 + ch * 0.22, 0.545, x + 0.1, y0 + ch * 0.222, 0.553);
      n++;
    }
  }
  f.plane(atlas.cell.lockers!, lx0 + (cols * cw) / 2, 2.52, 0.058, 1.1, 0.275);

  // --- pillar box (red, gilt plaque), lit by the pendants --------------------------------------------------------------------------
  const pb = f.at(-2.0, 0, 2.0);
  pb.lathe('paint', [[0.001, 0], [0.28, 0], [0.28, 0.06], [0.24, 0.08], [0.24, 1.12], [0.27, 1.14], [0.27, 1.2], [0.2, 1.3], [0.1, 1.36], [0.001, 1.38]], 0, 0, 0, 24, '#b3171b');
  pb.cyl('brass', 0, 0.07, 0, 0.255, 0.014, 24);
  pb.cyl('brass', 0, 1.14, 0, 0.275, 0.012, 24);
  pb.box('dark', -0.11, 0.86, 0.225, 0.11, 0.9, 0.27);
  pb.plane(atlas.cell.letters!, 0, 0.64, 0.257, 0.22, 0.11);
  pb.box('brass', -0.12, 0.99, 0.236, 0.12, 1.0, 0.27);

  // --- penny weighing machine -----------------------------------------------------------------------------------------------------
  const pw = f.at(2.35, 0, 0.7);
  pw.box('dark', -0.25, 0, -0.22, 0.25, 0.06, 0.22);
  pw.rbox('wood', -0.2, 0.06, -0.16, 0.2, 1.2, 0.16, 0.012);
  pw.box('brass', -0.22, 1.14, -0.18, 0.22, 1.2, 0.18);
  pw.rbox('brass', -0.22, 1.2, -0.18, 0.22, 1.7, 0.1, 0.02);
  pw.plane(atlas.cell.dial!, 0, 1.46, 0.102, 0.36, 0.36);
  pw.frame('brass', -0.19, 1.28, 0.19, 1.64, 0.1, 0.116, 0.02);
  pw.add('brass', new THREE.SphereGeometry(0.09, 10, 6, 0, P * 2, 0, P / 2), undefined, xf(0, 1.7, -0.04));
  pw.box('dark', -0.025, 0.8, 0.16, 0.025, 0.9, 0.18);
  pw.box('brass', -0.07, 0.78, 0.15, 0.07, 0.92, 0.16);
  pw.plane(atlas.cell.weigh!, 0, 1.0, 0.162, 0.3, 0.056);
  pw.box('dark', -0.2, 0.06, 0.16, 0.2, 0.09, 0.4); // platform
  pw.box('brass', -0.2, 0.09, 0.16, 0.2, 0.094, 0.4);

  // --- shoeshine chair on a plinth --------------------------------------------------------------------------------------------------
  const sc = f.at(3.55, 0, 1.25);
  sc.box('dark', -0.55, 0, -0.5, 0.55, 0.28, 0.5);
  sc.box('brass', -0.55, 0.28, -0.5, 0.55, 0.292, 0.5);
  sc.box('brass', -0.55, 0.05, 0.5, 0.55, 0.07, 0.512);
  sc.cyl('brass', 0, 0.292, -0.1, 0.05, 0.3, 10);
  sc.rbox('goods', -0.28, 0.62, -0.38, 0.28, 0.72, 0.18, 0.04, '#5a1519');
  sc.add('goods', new THREE.BoxGeometry(0.56, 0.7, 0.1), '#5a1519', xf(0, 1.0, -0.4).multiply(new THREE.Matrix4().makeRotationX(0.18)));
  sc.add('goods', new THREE.BoxGeometry(0.4, 0.2, 0.09), '#5a1519', xf(0, 1.45, -0.44).multiply(new THREE.Matrix4().makeRotationX(0.18)));
  for (const s of [-1, 1]) {
    sc.rbox('goods', s * 0.31 - 0.04, 0.78, -0.36, s * 0.31 + 0.04, 0.84, 0.08, 0.02, '#5a1519');
    sc.box('wood', s * 0.31 - 0.015, 0.72, -0.32, s * 0.31 + 0.015, 0.78, -0.2);
    sc.tube('brass', s * 0.18, 0.55, 0.12, s * 0.18, 0.92, 0.38, 0.012, 6);
    sc.add('brass', new THREE.BoxGeometry(0.14, 0.015, 0.22), undefined, xf(s * 0.18, 0.93, 0.45).multiply(new THREE.Matrix4().makeRotationX(0.5)));
    for (let k = 0; k < 4; k++) sc.ball('brass', s * 0.18, 0.93 + 0.05 * Math.sin(0.5) - 0.0, 0.38 + k * 0.045, 0.008);
  }
  sc.box('wood', 0.3, 0.292, 0.25, 0.5, 0.36, 0.45);
  sc.cyl('goods', 0.4, 0.36, 0.35, 0.03, 0.04, 8, '#2a170b');
  f.plane(atlas.cell.shoeshine!, 3.55, 2.05, 0.058, 0.9, 0.225);
}

/** Wooden telephone booth, 0.95 x 0.9 x 2.35, front toward +z: posts, panelled base, glazed door and sides, lamp, handset. */
function phoneBooth(c: Frame, atlas: ShopAtlas, idx: number): void {
  const w = 0.48;
  const d0 = -0.35;
  const d1 = 0.4;
  const hgt = 2.2;
  // base plinth, floor
  c.box('dark', -w - 0.03, 0, d0 - 0.03, w + 0.03, 0.08, d1 + 0.03);
  for (const sx of [-1, 1]) for (const sz of [d0, d1]) c.rbox('wood', sx * w - 0.035, 0.08, sz - 0.035, sx * w + 0.035, hgt, sz + 0.035, 0.008);
  // lower panels (walnut) on the three sides, brass keyline
  c.rbox('wood', -w, 0.08, d1 - 0.015, w, 0.82, d1 + 0.01, 0.006);
  c.rbox('wood', -w - 0.01, 0.08, d0, -w + 0.015, 0.82, d1, 0.006);
  c.rbox('wood', w - 0.015, 0.08, d0, w + 0.01, 0.82, d1, 0.006);
  c.box('wood', -w, 0.08, d0 - 0.01, w, hgt, d0 + 0.015); // back
  c.box('warm', -w + 0.04, 0.82, d0 + 0.015, w - 0.04, hgt - 0.1, d0 + 0.02, '#e8c98f');
  c.frame('brass', -w + 0.07, 0.2, w - 0.07, 0.72, d1 + 0.01, d1 + 0.017, 0.007);
  // rails
  c.box('wood', -w, 0.82, d1 - 0.02, w, 0.88, d1 + 0.012);
  c.box('wood', -w, hgt - 0.14, d1 - 0.02, w, hgt - 0.08, d1 + 0.012);
  // glazing: front door (with muntins) + two side panes
  const gF = new THREE.PlaneGeometry(2 * w - 0.07, hgt - 0.14 - 0.88).translate(0, (hgt - 0.14 + 0.88) / 2, d1);
  c.add('glass', gF);
  for (const s of [-1, 1]) {
    const gs = new THREE.PlaneGeometry(d1 - d0, hgt - 0.14 - 0.88).rotateY(P / 2).translate(s * w, (hgt - 0.14 + 0.88) / 2, (d0 + d1) / 2);
    c.add('glass', gs);
  }
  for (let r = 1; r < 5; r++) c.box('brass', -w + 0.035, 0.88 + r * 0.246, d1 - 0.004, w - 0.035, 0.88 + r * 0.246 + 0.01, d1 + 0.006);
  c.box('brass', -0.006, 0.88, d1 - 0.004, 0.006, hgt - 0.14, d1 + 0.006);
  c.tube('brass', w - 0.1, 1.0, d1 + 0.03, w - 0.1, 1.3, d1 + 0.03, 0.01, 6);
  // roof: stepped, with lit glass lantern
  c.rbox('wood', -w - 0.06, hgt, d0 - 0.06, w + 0.06, hgt + 0.05, d1 + 0.06, 0.01);
  c.rbox('wood', -w + 0.04, hgt + 0.05, d0 + 0.04, w - 0.04, hgt + 0.1, d1 - 0.04, 0.01);
  c.box('brass', -w - 0.062, hgt + 0.045, d0 - 0.062, w + 0.062, hgt + 0.052, d1 + 0.062);
  c.box('glow', -0.14, hgt - 0.14, d0 + 0.2, 0.14, hgt - 0.1, d1 - 0.2, '#b0b0b0');
  c.ball('glow', 0, hgt + 0.14, (d0 + d1) / 2, 0.07, '#d0d0d0', 1.3, 0.8, 1.3, 10, 6);
  // candlestick telephone, shelf, directory
  c.box('wood', -w + 0.04, 0.95, d0 + 0.02, w - 0.04, 0.975, d0 + 0.3);
  c.lathe('brass', [[0.001, 0.975], [0.07, 0.975], [0.075, 0.99], [0.04, 1.0], [0.001, 1.0]], 0, 0, d0 + 0.17, 14);
  c.cyl('brass', 0, 1.0, d0 + 0.17, 0.012, 0.2, 8);
  c.cyl('brass', 0, 1.2, d0 + 0.17, 0.02, 0.012, 10, undefined, 0.012);
  c.cylX('dark', 0.05, 1.12, d0 + 0.17, 0.018, 0.04, 8);
  c.add('goods', new THREE.BoxGeometry(0.16, 0.02, 0.12), idx ? '#3a2a1a' : '#1f3d57', xf(-0.2, 0.985, d0 + 0.2, 0.3));
  // number plate
  c.box('brass', -0.1, 1.55, d0 + 0.02, 0.1, 1.68, d0 + 0.026);
  void atlas;
}
