import { PLATFORM_END as PE } from '../../layout';
import { at, ball, box, cyl, gableEnd, gableRoof, hipRoof, plate, strut, type Bags } from './kit';
import type { EnamelAtlas } from './textures';

const GY = -1.62; // existing gravel ground plane (world/shed/platforms.ts)
const CREAM = 0xd8cfb0;
const GREEN = 0x23382e;
const DARK = 0x15110d;
const BLACK = 0x121416;
const GLOW = 0xffb25c;

type Face = 'S' | 'N' | 'E' | 'W';

/** Signal box (x -40..-33, z 388..397) and lamp hut (x 33..36.5, z 386..390.5). */
export function buildBuildings(b: Bags, atlas: EnamelAtlas): void {
  signalBox(b, atlas);
  lampHut(b);
}

function signalBox(b: Bags, atlas: EnamelAtlas): void {
  const sb = PE.signalBox;
  // lower storey footprint inside the reserved rectangle
  const X0 = sb.xMin + 0.8;
  const X1 = X0 + 5.0;
  const Z0 = sb.zMin + 1.6;
  const Z1 = sb.zMax - 0.6;
  const FL = 1.4; // operating-floor level
  const SILL = 2.3;
  const HEAD = 3.55;
  const EAVE = 4.05;
  const U0 = X0 - 0.15;
  const U1 = X1 + 0.1;
  const V0 = Z0 - 0.15;
  const V1 = Z1 + 0.1;
  const xc = (X0 + X1) / 2;

  // ---------------------------------------------------------------------- lower storey (brick, stone plinth + string course)
  b.brick.add(box(X0, X1, GY - 0.12, FL, Z0, Z1));
  b.stone.add(box(X0 - 0.05, X1 + 0.05, GY - 0.12, GY + 0.55, Z0 - 0.05, Z1 + 0.05));
  b.stone.add(box(X0 - 0.07, X1 + 0.07, FL - 0.16, FL, Z0 - 0.07, Z1 + 0.07));
  // south door (relay-room), with stone step and lintel
  const dx = xc - 0.9;
  b.paint.add(box(dx - 0.5, dx + 0.5, GY, GY + 2.1, Z0 - 0.07, Z0 + 0.0), GREEN);
  b.paint.add(box(dx - 0.42, dx + 0.42, GY + 0.12, GY + 1.0, Z0 - 0.09, Z0 - 0.07), 0x1a2a22);
  b.paint.add(box(dx - 0.42, dx + 0.42, GY + 1.1, GY + 2.0, Z0 - 0.09, Z0 - 0.07), 0x1a2a22);
  b.stone.add(box(dx - 0.65, dx + 0.65, GY + 2.1, GY + 2.28, Z0 - 0.1, Z0 + 0.02));
  b.stone.add(box(dx - 0.6, dx + 0.6, GY, GY + 0.16, Z0 - 0.5, Z0 - 0.05));
  b.brass.add(box(dx + 0.3, dx + 0.36, GY + 1.0, GY + 1.07, Z0 - 0.115, Z0 - 0.09));
  // small barred windows low in the long walls
  for (const [face, off] of [['E', 0.0], ['E', 1] , ['W', 0.0], ['W', 1], ['N', 0]] as [Face, number][]) {
    const z = face === 'N' ? 0 : Z0 + 1.4 + off * 2.6;
    const wx = face === 'E' ? X1 : X0;
    if (face === 'N') lowWindow(b, xc, Z1, 'N');
    else lowWindow(b, wx, z, face);
  }

  // ---------------------------------------------------------------------- upper storey: timber frame + glazing
  const timber = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, hex = CREAM): void => {
    b.paint.add(box(x0, x1, y0, y1, z0, z1), hex);
  };
  // floor sill beam, ceiling plate, fascia band
  timber(U0, U1, FL, FL + 0.12, V0, V1, GREEN);
  timber(U0 - 0.02, U1 + 0.02, HEAD, EAVE, V0 - 0.02, V1 + 0.02, GREEN);
  // wall panels below the windows (vertical boarding)
  timber(U0, U0 + 0.1, FL + 0.12, SILL, V0, V1, GREEN);
  timber(U1 - 0.1, U1, FL + 0.12, SILL, V0, V1, GREEN);
  timber(U0, U1, FL + 0.12, SILL, V0, V0 + 0.1, GREEN);
  timber(U0, U1, FL + 0.12, SILL, V1 - 0.1, V1, GREEN);
  // window zone: sill rail + head rail around, corner posts, mullions
  for (const [cxp, czp] of [[U0, V0], [U1, V0], [U0, V1], [U1, V1]] as const) timber(cxp - 0.07, cxp + 0.07, FL, HEAD, czp - 0.07, czp + 0.07);
  timber(U0, U1, SILL, SILL + 0.06, V0 - 0.01, V0 + 0.04);
  timber(U0, U1, SILL, SILL + 0.06, V1 - 0.04, V1 + 0.01);
  timber(U0 - 0.01, U0 + 0.04, SILL, SILL + 0.06, V0, V1);
  timber(U1 - 0.04, U1 + 0.01, SILL, SILL + 0.06, V0, V1);
  const bays = (a: number, c: number, n: number): number[] => Array.from({ length: n - 1 }, (_, i) => a + ((c - a) * (i + 1)) / n);
  // east (track) face: five bays + the stair door bay at the north end
  const doorZ0 = V1 - 1.25;
  for (const z of bays(V0, doorZ0, 5)) timber(U1 - 0.05, U1 + 0.02, SILL, HEAD, z - 0.035, z + 0.035);
  timber(U1 - 0.05, U1 + 0.02, SILL, HEAD, doorZ0 - 0.04, doorZ0 + 0.04);
  for (const z of bays(V0, V1, 6)) timber(U0 - 0.02, U0 + 0.05, SILL, HEAD, z - 0.035, z + 0.035);
  for (const x of bays(U0, U1, 4)) {
    timber(x - 0.035, x + 0.035, SILL, HEAD, V0 - 0.02, V0 + 0.05);
    timber(x - 0.035, x + 0.035, SILL, HEAD, V1 - 0.05, V1 + 0.02);
  }
  // glazing: one pane per face (transparent), warm room glow behind
  const pane = (w: number, cx: number, cz: number, ry: number): void => {
    b.glass.add(plate(w, HEAD - SILL, null, 0, 0, 0, 0), 0xffffff, at(cx, (SILL + HEAD) / 2, cz, ry));
  };
  pane(V1 - V0, U1, (V0 + V1) / 2, Math.PI / 2);
  pane(V1 - V0, U0, (V0 + V1) / 2, Math.PI / 2);
  pane(U1 - U0, xc, V0, 0);
  pane(U1 - U0, xc, V1, 0);
  // stair door (east face, north bay)
  timber(U1 - 0.01, U1 + 0.045, FL + 0.12, HEAD, doorZ0 + 0.05, V1 - 0.08, GREEN);
  b.glass.add(plate(0.62, 0.9, null, 0, 0, 0, 0), 0xffffff, at(U1 + 0.05, 2.9, (doorZ0 + V1) / 2 + 0.0, Math.PI / 2));
  b.brass.add(ball(0.035, U1 + 0.08, 2.15, V1 - 0.28, 8));

  // ---------------------------------------------------------------------- the room inside: faint warm light, silhouettes
  const gl = (w: number, h: number, x: number, y: number, z: number, ry: number, gain: number): void => {
    b.glow.add(plate(w, h, null, 0, 0, 0, 0), GLOW, at(x, y, z, ry), gain);
  };
  gl(V1 - V0 - 0.3, 2.2, U0 + 0.12, FL + 1.25, (V0 + V1) / 2, Math.PI / 2, 0.55); // west wall, faces +x (rotateY(PI/2): +z -> +x)
  gl(U1 - U0 - 0.3, 2.2, xc, FL + 1.25, V0 + 0.12, 0, 0.42);
  gl(U1 - U0 - 0.3, 2.2, xc, FL + 1.25, V1 - 0.12, Math.PI, 0.42);
  const ceil = plate(U1 - U0 - 0.3, V1 - V0 - 0.3, null, 0, 0, 0, 0);
  ceil.rotateX(Math.PI / 2);
  b.glow.add(ceil, GLOW, at(xc, HEAD - 0.08, (V0 + V1) / 2), 0.32);
  b.glow.add(ball(0.11, xc - 0.4, 3.18, (V0 + V1) / 2, 10), 0xffd69a, undefined, 1.6);
  b.paint.add(strut([xc - 0.4, 3.28, (V0 + V1) / 2], [xc - 0.4, HEAD - 0.06, (V0 + V1) / 2], 0.012), DARK);
  // floor
  b.paint.add(box(U0 + 0.1, U1 - 0.1, FL + 0.12, FL + 0.17, V0 + 0.1, V1 - 0.1), 0x3b2b1c);
  // lever frame facing the track windows: stand, locking bed, 19 levers in four colours
  const lx = xc + 0.35;
  const lz0 = V0 + 1.2;
  const lz1 = doorZ0 - 0.35;
  b.paint.add(box(lx - 0.22, lx + 0.22, FL + 0.17, FL + 0.55, lz0 - 0.1, lz1 + 0.1), DARK);
  b.paint.add(box(lx - 0.2, lx + 0.2, FL + 1.05, FL + 1.2, lz0 - 0.1, lz1 + 0.1), DARK);
  const NL = 19;
  const lever = [0x6e1712, 0xb08a1c, 0x0d0b09, 0x1a3552, 0x0d0b09];
  for (let i = 0; i < NL; i++) {
    const z = lz0 + ((lz1 - lz0) * i) / (NL - 1);
    const hex = lever[(i * 7) % lever.length]!;
    b.paint.add(box(lx - 0.018, lx + 0.018, FL + 0.5, FL + 1.55, z - 0.018, z + 0.018), hex);
    b.paint.add(box(lx - 0.04, lx + 0.04, FL + 1.5, FL + 1.64, z - 0.032, z + 0.032), DARK);
  }
  // block-instrument shelf + track diagram against the west wall
  b.paint.add(box(U0 + 0.1, U0 + 0.7, FL + 0.17, FL + 0.95, V0 + 1.0, V1 - 1.4), DARK);
  for (let i = 0; i < 3; i++) {
    const z = V0 + 1.5 + i * 1.05;
    b.paint.add(box(U0 + 0.14, U0 + 0.4, FL + 0.95, FL + 1.5, z - 0.17, z + 0.17), 0x2a1c10);
    b.brass.add(box(U0 + 0.4, U0 + 0.43, FL + 1.25, FL + 1.4, z - 0.07, z + 0.07));
  }
  b.paint.add(box(U0 + 0.1, U0 + 0.14, FL + 1.75, FL + 2.5, V0 + 1.0, V1 - 1.4), DARK);
  // stove, flue and a stool
  b.paint.add(cyl(0.19, 0.95, U1 - 0.55, FL + 0.17, V0 + 0.55, 10), BLACK);
  b.paint.add(cyl(0.04, 1.3, U1 - 0.55, FL + 1.1, V0 + 0.55, 8), BLACK);
  b.paint.add(cyl(0.2, 0.06, xc - 0.9, FL + 0.7, (V0 + V1) / 2 - 0.2, 10), DARK);
  b.paint.add(cyl(0.02, 0.55, xc - 0.9, FL + 0.17, (V0 + V1) / 2 - 0.2, 6), DARK);

  // ---------------------------------------------------------------------- hipped slate roof, ridge cap, chimney
  const R0 = U0 - 0.5;
  const R1 = U1 + 0.45;
  const S0 = V0 - 0.5;
  const S1 = V1 + 0.5;
  b.slate.add(hipRoof(R0, R1, S0, S1, EAVE, EAVE + 1.55));
  const rc = (R0 + R1) / 2;
  const hw = (R1 - R0) / 2;
  b.paint.add(strut([rc, EAVE + 1.57, S0 + hw], [rc, EAVE + 1.57, S1 - hw], 0.12), BLACK);
  for (const [ax, az, bx, bz] of [[R0, S0, rc, S0 + hw], [R1, S0, rc, S0 + hw], [R0, S1, rc, S1 - hw], [R1, S1, rc, S1 - hw]] as const) {
    b.paint.add(strut([ax, EAVE, az], [bx, EAVE + 1.57, bz], 0.1), BLACK);
  }
  // attic wall closing the gap between the fascia band and the sloping roof
  b.paint.add(box(U0 - 0.02, U1 + 0.02, EAVE, EAVE + 0.3, V0 - 0.02, V1 + 0.02), GREEN);
  // fascia around the eaves
  b.paint.add(box(R0, R1, EAVE - 0.08, EAVE + 0.1, S0 - 0.03, S0 + 0.02), GREEN);
  b.paint.add(box(R0, R1, EAVE - 0.08, EAVE + 0.1, S1 - 0.02, S1 + 0.03), GREEN);
  b.paint.add(box(R0 - 0.03, R0 + 0.02, EAVE - 0.08, EAVE + 0.1, S0, S1), GREEN);
  b.paint.add(box(R1 - 0.02, R1 + 0.03, EAVE - 0.08, EAVE + 0.1, S0, S1), GREEN);
  // chimney (west, south end)
  const chx = X0 + 0.55;
  const chz = Z0 + 1.0;
  b.brick.add(box(chx - 0.32, chx + 0.32, FL + 0.17, EAVE + 2.45, chz - 0.32, chz + 0.32));
  b.stone.add(box(chx - 0.4, chx + 0.4, EAVE + 2.45, EAVE + 2.6, chz - 0.4, chz + 0.4));
  for (const dz of [-0.14, 0.14]) b.goods.add(cyl(0.1, 0.38, chx, EAVE + 2.6, chz + dz, 10, 0.08), 0x9a4a2a);

  // ---------------------------------------------------------------------- external timber stair up the east face
  const SX0 = X1 + 0.12;
  const SX1 = SX0 + 0.9;
  const sz0 = Z0 + 0.35;
  const sz1 = V1 - 1.25;
  const nSt = 17;
  const rise = (FL + 0.12 - GY) / nSt;
  const run = (sz1 - sz0) / nSt;
  for (let i = 0; i < nSt; i++) {
    const y = GY + rise * (i + 1);
    const z0 = sz0 + run * i;
    b.paint.add(box(SX0, SX1, y - 0.045, y, z0, z0 + run + 0.03), 0x6b5236);
    b.paint.add(box(SX0, SX1, y - rise, y - rise + 0.02, z0 + run - 0.02, z0 + run), 0x2a2018);
  }
  for (const sx of [SX0, SX1]) b.paint.add(strut([sx, GY + 0.1, sz0], [sx, FL - 0.08, sz1], 0.06, 0.28), GREEN);
  // landing + rail
  b.paint.add(box(SX0, SX1 + 0.05, FL + 0.07, FL + 0.12, sz1, V1), 0x6b5236);
  const hrY = (z: number): number => GY + rise * ((z - sz0) / run + 1) + 0.95;
  for (let i = 0; i <= nSt; i += 3) {
    const z = Math.min(sz1, sz0 + run * i);
    b.paint.add(box(SX1 - 0.02, SX1 + 0.02, hrY(z) - 0.95, hrY(z), z - 0.02, z + 0.02), GREEN);
  }
  b.paint.add(strut([SX1, hrY(sz0), sz0], [SX1, hrY(sz1), sz1], 0.05), GREEN);
  b.paint.add(strut([SX1, hrY(sz0) - 0.45, sz0], [SX1, hrY(sz1) - 0.45, sz1], 0.025), GREEN);
  b.paint.add(box(SX1 + 0.03, SX1 + 0.08, FL + 0.12, FL + 1.07, sz1, V1), GREEN);
  b.paint.add(box(SX1 - 0.02, SX1 + 0.04, FL + 1.0, FL + 1.07, sz1, V1), GREEN);

  // ---------------------------------------------------------------------- nameboards (south face and track face)
  b.enamel.add(plate(2.7, 0.405, atlas.nameboard, xc, (HEAD + EAVE) / 2, V0 - 0.04, Math.PI));
  b.paint.add(box(xc - 1.38, xc + 1.38, (HEAD + EAVE) / 2 - 0.22, (HEAD + EAVE) / 2 + 0.22, V0 - 0.03, V0 - 0.015), CREAM);
  b.enamel.add(plate(2.7, 0.405, atlas.nameboard, U1 + 0.04, (HEAD + EAVE) / 2, (V0 + doorZ0) / 2, Math.PI / 2));
  b.paint.add(box(U1 + 0.015, U1 + 0.03, (HEAD + EAVE) / 2 - 0.22, (HEAD + EAVE) / 2 + 0.22, (V0 + doorZ0) / 2 - 1.38, (V0 + doorZ0) / 2 + 1.38), CREAM);
}

function lowWindow(b: Bags, wx: number, z: number, face: Face): void {
  // dark recessed pane with iron bars, stone sill and lintel; wx is the wall coordinate (x for E/W, x centre for N)
  const sgn = face === 'E' ? 1 : face === 'W' ? -1 : 0;
  const y0 = GY + 1.3;
  const y1 = y0 + 0.95;
  if (face === 'N') {
    const zz = z;
    const xx = wx;
    b.paint.add(box(xx - 0.4, xx + 0.4, y0, y1, zz, zz + 0.02), 0x0b0d10);
    b.stone.add(box(xx - 0.5, xx + 0.5, y0 - 0.08, y0, zz, zz + 0.1));
    b.stone.add(box(xx - 0.5, xx + 0.5, y1, y1 + 0.14, zz, zz + 0.06));
    for (let k = -3; k <= 3; k++) b.paint.add(box(xx + k * 0.12 - 0.01, xx + k * 0.12 + 0.01, y0, y1, zz, zz + 0.04), BLACK);
    return;
  }
  b.paint.add(box(wx, wx + sgn * 0.02, y0, y1, z - 0.4, z + 0.4), 0x0b0d10);
  b.stone.add(box(wx, wx + sgn * 0.1, y0 - 0.08, y0, z - 0.5, z + 0.5));
  b.stone.add(box(wx, wx + sgn * 0.06, y1, y1 + 0.14, z - 0.5, z + 0.5));
  for (let k = -3; k <= 3; k++) b.paint.add(box(wx, wx + sgn * 0.04, y0, y1, z + k * 0.12 - 0.01, z + k * 0.12 + 0.01), BLACK);
}

function lampHut(b: Bags): void {
  const h = PE.lampHut;
  const X0 = h.xMin + 0.7;
  const X1 = h.xMax - 0.7;
  const Z0 = h.zMin + 0.7;
  const Z1 = h.zMax - 0.7;
  const WALL = GY + 2.5;
  const RIDGE = WALL + 1.1;
  b.stone.add(box(X0 - 0.05, X1 + 0.05, GY - 0.12, GY + 0.45, Z0 - 0.05, Z1 + 0.05));
  b.brick.add(box(X0, X1, GY - 0.12, WALL, Z0, Z1));
  // gable ends in brick, slate roof with overhang, ridge board
  b.brick.add(gableEnd(X0, X1, WALL, RIDGE, Z0));
  b.brick.add(gableEnd(X0, X1, WALL, RIDGE, Z1));
  b.slate.add(gableRoof(X0 - 0.28, X1 + 0.28, Z0 - 0.28, Z1 + 0.28, WALL - 0.03, RIDGE + 0.12));
  const xc = (X0 + X1) / 2;
  b.paint.add(strut([xc, RIDGE + 0.14, Z0 - 0.28], [xc, RIDGE + 0.14, Z1 + 0.28], 0.1), BLACK);
  b.paint.add(box(X0 - 0.3, X1 + 0.3, WALL - 0.1, WALL + 0.0, Z0 - 0.3, Z0 - 0.26), GREEN);
  b.paint.add(box(X0 - 0.3, X1 + 0.3, WALL - 0.1, WALL + 0.0, Z1 + 0.26, Z1 + 0.3), GREEN);
  // door (west face, towards the tracks), small window on the east face
  const dz = (Z0 + Z1) / 2 - 0.5;
  b.paint.add(box(X0 - 0.07, X0, GY, GY + 1.95, dz - 0.45, dz + 0.45), GREEN);
  b.paint.add(box(X0 - 0.085, X0 - 0.07, GY + 0.1, GY + 1.85, dz - 0.36, dz + 0.36), 0x1a2a22);
  b.stone.add(box(X0 - 0.12, X0 + 0.02, GY + 1.95, GY + 2.13, dz - 0.6, dz + 0.6));
  b.stone.add(box(X0 - 0.45, X0 - 0.05, GY, GY + 0.14, dz - 0.55, dz + 0.55));
  b.brass.add(box(X0 - 0.1, X0 - 0.085, GY + 0.95, GY + 1.0, dz + 0.28, dz + 0.4));
  b.paint.add(box(X1, X1 + 0.02, GY + 1.3, GY + 2.0, (Z0 + Z1) / 2 - 0.3, (Z0 + Z1) / 2 + 0.3), 0x0b0d10);
  b.stone.add(box(X1, X1 + 0.08, GY + 1.22, GY + 1.3, (Z0 + Z1) / 2 - 0.4, (Z0 + Z1) / 2 + 0.4));
  // hanging lamp over the door: bracket, chain, brass lantern with a warm glow
  const bx = X0 - 0.55;
  b.paint.add(strut([X0, GY + 2.25, dz], [bx, GY + 2.25, dz], 0.04), BLACK);
  b.paint.add(strut([X0, GY + 2.0, dz], [bx + 0.05, GY + 2.22, dz], 0.025), BLACK);
  b.paint.add(box(bx - 0.005, bx + 0.005, GY + 2.0, GY + 2.25, dz - 0.005, dz + 0.005), BLACK);
  b.brass.add(cyl(0.075, 0.02, bx, GY + 1.98, dz, 10));
  b.brass.add(cyl(0.001, 0.11, bx, GY + 2.0, dz, 10, 0.09));
  b.glow.add(cyl(0.065, 0.17, bx, GY + 1.81, dz, 10), 0xffc47a, undefined, 1.5);
  b.brass.add(cyl(0.085, 0.02, bx, GY + 1.79, dz, 10));
  // hand lamps and a coil of oil cans beside the door
  for (const [lx, lz] of [[X0 - 0.4, dz + 0.75], [X0 - 0.3, dz + 0.95]] as const) {
    b.brass.add(cyl(0.05, 0.05, lx, GY, lz, 10));
    b.glow.add(cyl(0.042, 0.1, lx, GY + 0.05, lz, 10), 0xff2a14, undefined, 0.9);
    b.brass.add(cyl(0.005, 0.03, lx, GY + 0.15, lz, 6, 0.04));
  }
}
