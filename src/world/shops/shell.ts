import * as THREE from 'three';
import { SHOPS } from '../../layout';
import { Frame } from './frame';
import type { ShopAtlas } from './atlas';
import type { ShopId } from './layoutData';
import { pendant } from './goods';

/** Shopfront shell shared by the four arcade units: walnut + brass frame, glazing, door, fascia, interior envelope. */

export const HL = SHOPS.halfLength; // 4.6
export const D = SHOPS.depth; // 2.8
export const H = SHOPS.height; // 3.6

export interface FrontPlan {
  /** display-window x ranges (shop-local) */
  windows: Array<[number, number]>;
  /** glazed door centre x, if any */
  door?: number;
  /** open-fronted alcove: no glazing, no door */
  open?: boolean;
  /** blade (projecting) sign: side (+1 / -1 along x_l) and atlas index */
  blade: { side: 1 | -1; idx: number };
}

export const PLANS: Record<ShopId, FrontPlan> = {
  newsstand: { windows: [[-4.28, 2.84], [3.86, 4.28]], door: 3.35, blade: { side: 1, idx: 0 } },
  florist: { windows: [[-4.28, -0.52], [0.52, 4.28]], door: 0, blade: { side: -1, idx: 1 } },
  coffee: { windows: [[-4.28, -3.86], [-2.84, 4.28]], door: -3.35, blade: { side: -1, idx: 2 } },
  conveniences: { windows: [], open: true, blade: { side: 1, idx: 3 } },
};

const DOOR_W = 1.0;
const SILL = 0.86;
const HEAD = 2.88;

/** Everything except stock: floor, envelope, front, fascia, cornice, lighting. */
export function buildShell(f: Frame, id: ShopId, atlas: ShopAtlas): void {
  const plan = PLANS[id];
  const warm = '#ecd5a6';

  // --- floor: marble base with a black / cream chequer ---------------------------------------------------------------
  f.box('marble', -HL, 0, 0, HL, 0.03, D);
  const cw = (2 * HL) / 20;
  const cd = D / 6;
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 6; j++) {
      if ((i + j) % 2) continue;
      const g = new THREE.PlaneGeometry(cw, cd).rotateX(-Math.PI / 2).translate(-HL + (i + 0.5) * cw, 0.0305, (j + 0.5) * cd);
      f.add('dark', g);
    }
  }

  // --- envelope: back wall, side walls, ceiling, roof -------------------------------------------------------------------
  f.box('warm', -HL, 0, 0, HL, H, 0.05, warm);
  f.box('wood', -HL + 0.12, 0, 0.05, HL - 0.12, 1.0, 0.1); // dado
  f.box('brass', -HL + 0.12, 1.0, 0.05, HL - 0.12, 1.025, 0.115);
  f.box('brass', -HL + 0.12, 2.75, 0.05, HL - 0.12, 2.775, 0.09); // picture rail
  for (const s of [-1, 1] as const) {
    // END RETURN: wraps the shopfront around the corner with a plate-glass display window, dark-marble riser and a fascia return
    const xa = s < 0 ? -HL : HL - 0.12;
    const xb = xa + 0.12;
    const zb = 0.4;
    const zf = D - 0.32;
    f.box('wood', xa, 0.25, 0, xb, H, zb); // back stile
    f.box('wood', xa, 0.25, zf, xb, H, D); // corner stile
    f.box('wood', xa, HEAD, zb, xb, H, zf); // lintel carrying the fascia return
    f.box('dark', s < 0 ? -HL - 0.03 : HL - 0.12, 0, 0, s < 0 ? -HL + 0.12 : HL + 0.03, 0.25, D + 0.02);
    f.box('dark', xa - (s < 0 ? 0.02 : 0), 0.25, zb, xb + (s < 0 ? 0 : 0.02), SILL - 0.04, zf);
    f.box('brass', xa - (s < 0 ? 0.025 : 0), 0.25, zb, xb + (s < 0 ? 0 : 0.025), 0.3, zf);
    f.box('wood', xa - (s < 0 ? 0.03 : 0), SILL - 0.05, zb, xb + (s < 0 ? 0 : 0.03), SILL, zf);
    f.box('brass', xa - (s < 0 ? 0.03 : 0), SILL, zb, xb + (s < 0 ? 0 : 0.03), SILL + 0.012, zf);
    const gx = s * (HL - 0.06);
    f.add('glass', new THREE.PlaneGeometry(zf - zb, HEAD - SILL).rotateY(Math.PI / 2).translate(gx, (HEAD + SILL) / 2, (zb + zf) / 2));
    const bt = 0.03;
    const mz = (zb + zf) / 2;
    f.box('brass', gx - 0.03, SILL, zb, gx + 0.03, SILL + bt, zf);
    f.box('brass', gx - 0.03, HEAD - bt, zb, gx + 0.03, HEAD, zf);
    f.box('brass', gx - 0.03, SILL, zb, gx + 0.03, HEAD, zb + bt);
    f.box('brass', gx - 0.03, SILL, zf - bt, gx + 0.03, HEAD, zf);
    f.box('brass', gx - 0.03, SILL, mz - 0.015, gx + 0.03, HEAD, mz + 0.015);
    f.box('brass', gx - 0.03, 2.48, zb, gx + 0.03, 2.5, zf);
    // fascia return: black-glass monogram sign, gilt keyline
    const ox = s * (HL + 0.003);
    f.plane(atlas.cell[`mono_${id}`]!, ox, 3.255, (zb + zf) / 2 + 0.2, 2.1, 0.47, s * Math.PI / 2);
    f.box('brass', s < 0 ? -HL - 0.012 : HL - 0.002, 3.0, 0.3, s < 0 ? -HL + 0.002 : HL + 0.012, 3.012, D - 0.3);
    f.box('brass', s < 0 ? -HL - 0.012 : HL - 0.002, 3.51, 0.3, s < 0 ? -HL + 0.002 : HL + 0.012, 3.522, D - 0.3);
    // brass corner post
    f.tube('brass', s * (HL + 0.02), 0.2, D + 0.04, s * (HL + 0.02), HEAD + 0.1, D + 0.04, 0.03, 10);
    f.ball('brass', s * (HL + 0.02), HEAD + 0.12, D + 0.04, 0.045);
    // brass edge cap
    f.box('brass', s < 0 ? -HL - 0.01 : HL - 0.02, H - 0.1, 0, s < 0 ? -HL + 0.02 : HL + 0.01, H - 0.04, D + 0.2);
  }
  f.box('warm', -HL + 0.12, 3.0, 0.05, HL - 0.12, 3.06, D - 0.1, '#f6e3b8'); // ceiling
  f.box('dark', -HL - 0.04, H - 0.06, 0, HL + 0.04, H, D + 0.22); // roof slab (seen from the balcony)
  f.box('marble', -HL - 0.05, H - 0.1, 0, HL + 0.05, H - 0.06, D + 0.24);
  f.box('brass', -HL - 0.055, H - 0.062, D + 0.22, HL + 0.055, H - 0.058, D + 0.245);

  // --- front: pilasters, riser, glazing, door -------------------------------------------------------------------------
  const pil = (cx: number): void => {
    f.box('dark', cx - 0.19, 0, D - 0.3, cx + 0.19, 0.18, D + 0.1);
    f.rbox('wood', cx - 0.15, 0.18, D - 0.28, cx + 0.15, HEAD + 0.08, D + 0.06, 0.012);
    for (const dx of [-0.07, 0, 0.07]) f.box('brass', cx + dx - 0.004, 0.5, D + 0.058, cx + dx + 0.004, HEAD - 0.1, D + 0.064);
    f.box('brass', cx - 0.17, HEAD + 0.08, D - 0.3, cx + 0.17, HEAD + 0.12, D + 0.08);
    f.box('brass', cx - 0.17, 0.18, D - 0.3, cx + 0.17, 0.2, D + 0.08);
  };
  pil(-HL + 0.15);
  pil(HL - 0.15);

  const edgeL = -HL + 0.3;
  const edgeR = HL - 0.3;
  // transom beam under the fascia
  f.box('wood', edgeL, HEAD, D - 0.28, edgeR, HEAD + 0.12, D + 0.02);
  f.box('brass', edgeL, HEAD - 0.012, D - 0.01, edgeR, HEAD, D + 0.03);

  if (!plan.open) {
    // stall riser: dark marble field with brass cap + kick, broken by the door
    const riser = (x0: number, x1: number): void => {
      f.box('dark', x0, 0.03, D - 0.22, x1, SILL - 0.04, D);
      f.box('brass', x0, 0.03, D - 0.005, x1, 0.09, D + 0.012);
      f.box('wood', x0, SILL - 0.05, D - 0.26, x1, SILL, D + 0.03);
      f.box('brass', x0, SILL, D - 0.2, x1, SILL + 0.012, D + 0.03);
      // keyline panels
      const n = Math.max(1, Math.round((x1 - x0) / 1.2));
      const pw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        const a = x0 + i * pw + 0.1;
        const b = x0 + (i + 1) * pw - 0.1;
        if (b - a < 0.2) continue;
        f.frame('brass', a, 0.2, b, SILL - 0.14, D, D + 0.008, 0.008);
      }
    };
    let cur = edgeL;
    const stops: Array<[number, number]> = [];
    if (plan.door !== undefined) stops.push([plan.door - DOOR_W / 2 - 0.06, plan.door + DOOR_W / 2 + 0.06]);
    stops.sort((a, b) => a[0] - b[0]);
    for (const [a, b] of stops) {
      riser(cur, a);
      cur = b;
    }
    riser(cur, edgeR);

    // glazing + mullions
    for (const [x0, x1] of plan.windows) {
      const g = new THREE.PlaneGeometry(x1 - x0, HEAD - SILL);
      g.translate((x0 + x1) / 2, (HEAD + SILL) / 2, D - 0.14);
      f.add('glass', g);
      f.frame('brass', x0, SILL, x1, HEAD, D - 0.18, D - 0.1, 0.03);
      const n = Math.max(1, Math.round((x1 - x0) / 1.7));
      for (let i = 1; i < n; i++) {
        const mx = x0 + ((x1 - x0) * i) / n;
        f.box('brass', mx - 0.018, SILL, D - 0.19, mx + 0.018, HEAD, D - 0.09);
      }
      // upper lights: slim transom bar at 2.35 for the Edwardian read
      f.box('brass', x0, 2.48, D - 0.18, x1, 2.5, D - 0.1);
    }
    if (plan.door !== undefined) {
      const dx = plan.door;
      const a = dx - DOOR_W / 2;
      const b = dx + DOOR_W / 2;
      // frame
      f.box('wood', a - 0.06, 0, D - 0.28, a, HEAD, D + 0.02);
      f.box('wood', b, 0, D - 0.28, b + 0.06, HEAD, D + 0.02);
      f.box('dark', a - 0.06, 0, D - 0.3, b + 0.06, 0.03, D + 0.06); // threshold
      f.box('brass', a - 0.06, 0.03, D - 0.3, b + 0.06, 0.035, D + 0.06);
      // leaf: stiles + rails + glass
      const lz0 = D - 0.2;
      const lz1 = D - 0.12;
      f.box('wood', a + 0.01, 0.04, lz0, a + 0.1, 2.5, lz1);
      f.box('wood', b - 0.1, 0.04, lz0, b - 0.01, 2.5, lz1);
      f.box('wood', a + 0.1, 0.04, lz0, b - 0.1, 0.5, lz1);
      f.box('wood', a + 0.1, 1.05, lz0, b - 0.1, 1.15, lz1);
      f.box('wood', a + 0.1, 2.4, lz0, b - 0.1, 2.5, lz1);
      f.box('brass', a + 0.12, 0.2, lz1 - 0.002, b - 0.12, 0.215, lz1 + 0.005);
      const gg = new THREE.PlaneGeometry(b - a - 0.2, 1.25).translate(dx, 1.77, D - 0.16);
      f.add('glass', gg);
      // brass push plate + long handle
      f.box('brass', b - 0.2, 1.0, lz1, b - 0.12, 1.4, lz1 + 0.006);
      f.tube('brass', b - 0.16, 1.05, lz1 + 0.04, b - 0.16, 1.35, lz1 + 0.04, 0.012, 8);
      f.ball('brass', b - 0.16, 1.05, lz1 + 0.02, 0.014);
      f.tube('brass', b - 0.16, 1.35, lz1 + 0.04, b - 0.16, 1.35, lz1 + 0.002, 0.008, 5);
      // door glass above (fanlight)
      const fl = new THREE.PlaneGeometry(b - a, HEAD - 2.5).translate(dx, (HEAD + 2.5) / 2, D - 0.14);
      f.add('glass', fl);
      f.box('brass', a, 2.49, D - 0.18, b, 2.51, D - 0.1);
      // OPEN sign hung on the glass
      f.plane(atlas.cell.open!, dx, 1.95, D - 0.105, 0.3, 0.11);
      f.tube('brass', dx - 0.1, 2.0, D - 0.108, dx - 0.1, 2.3, D - 0.108, 0.002, 3);
      f.tube('brass', dx + 0.1, 2.0, D - 0.108, dx + 0.1, 2.3, D - 0.108, 0.002, 3);
    }
  } else {
    // alcove: stepped marble reveal, brass-lined lintel, no glazing
    f.box('marble', edgeL, HEAD - 0.34, D - 0.3, edgeR, HEAD, D + 0.04);
    f.box('brass', edgeL, HEAD - 0.34, D + 0.04, edgeR, HEAD - 0.325, D + 0.05);
    f.box('dark', edgeL + 0.06, HEAD - 0.25, D + 0.04, edgeR - 0.06, HEAD - 0.22, D + 0.055);
    f.box('dark', edgeL, 0.03, D - 0.12, edgeR, 0.07, D + 0.05);
    f.box('brass', edgeL, 0.07, D - 0.12, edgeR, 0.078, D + 0.05);
  }

  // --- fascia: black-glass sign, gilt lettering ------------------------------------------------------------------------
  f.box('wood', -HL + 0.02, HEAD + 0.12, D - 0.26, HL - 0.02, 3.5, D + 0.0);
  f.box('brass', -HL + 0.28, 3.0, D + 0.004, HL - 0.28, 3.0 + 0.012, D + 0.02);
  f.box('brass', -HL + 0.28, 3.51, D + 0.004, HL - 0.28, 3.51 + 0.012, D + 0.02);
  const sw = 2 * HL - 0.62;
  f.plane(atlas.cell[`fascia_${id}`]!, 0, 3.255, D + 0.012, sw, sw / 16);
  // cornice: stepped walnut mould + brass edge
  f.box('wood', -HL - 0.03, 3.5, D - 0.3, HL + 0.03, 3.54, D + 0.12);
  f.rbox('wood', -HL - 0.05, 3.54, D - 0.3, HL + 0.05, 3.6, D + 0.22, 0.01);
  f.box('brass', -HL - 0.052, 3.545, D + 0.1, HL + 0.052, 3.552, D + 0.125);

  // --- projecting blade sign on a brass bracket ------------------------------------------------------------------------
  const bx = plan.blade.side * (HL - 0.15);
  f.tube('brass', bx, 3.28, D + 0.06, bx, 3.28, D + 0.66, 0.012, 6);
  f.tube('brass', bx, 3.28 - 0.2, D + 0.06, bx, 3.28, D + 0.46, 0.008, 5);
  f.ball('brass', bx, 3.28, D + 0.68, 0.025);
  f.tube('brass', bx, 3.26, D + 0.28, bx, 3.05, D + 0.28, 0.003, 3);
  f.tube('brass', bx, 3.26, D + 0.58, bx, 3.05, D + 0.58, 0.003, 3);
  const br = atlas.cell[`blade${plan.blade.idx}`]!;
  f.box('wood', bx - 0.018, 2.5, D + 0.26, bx + 0.018, 3.06, D + 0.6);
  f.plane(br, bx + 0.02, 2.78, D + 0.43, 0.32, 0.5, Math.PI / 2);
  f.plane(br, bx - 0.02, 2.78, D + 0.43, 0.32, 0.5, -Math.PI / 2);

  // --- lighting: ceiling cove glow + pendant globes ---------------------------------------------------------------------
  f.box('glow', -HL + 0.4, 2.995, 0.2, HL - 0.4, 3.0, 0.5, '#9a9a9a');
  f.box('glow', -HL + 0.4, 2.995, D - 0.9, HL - 0.4, 3.0, D - 0.6, '#9a9a9a');
  for (const px of [-2.9, 0, 2.9]) pendant(f, px, 3.0, 1.45, 0.42);
}
