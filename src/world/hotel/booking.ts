import * as THREE from 'three';
import { BOOKING_OFFICE } from '../../layout';
import { atlasUV, box, cylX, lathe, mul, rbox, slab, sphere, tube, xf } from './kit';
import { addBankersLamp, type Buckets } from './furniture';
import { FACE_Z, brassTray, frameBars, pilaster, plate, poster, shopCornice, wainscot } from './facade';
import { bookingWindowOutline } from './layoutData';
import type { PaperAtlas } from './textures';

/** Booking Office: three unattended ticket windows in the west under-balcony frontage (wall face z = 8). */

function outlineShape(pts: Array<[number, number]>): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/** Height of the stepped window head at horizontal offset dx from the centre (matches bookingWindowOutline). */
function headY(dx: number): number {
  const sill = BOOKING_OFFICE.counterHeight;
  const h = BOOKING_OFFICE.windowHeight;
  const hw = BOOKING_OFFICE.windowWidth / 2;
  if (dx <= hw - 0.4) return sill + h;
  if (dx <= hw - 0.2) return sill + h * 0.86;
  return sill + h * 0.68;
}

function window(b: Buckets, atlas: PaperAtlas, cx: number, idx: number): void {
  const sill = BOOKING_OFFICE.counterHeight;
  const inner = bookingWindowOutline(cx, 0);
  // cream-marble architrave (outer outline with the opening cut out), z 8.0 .. 8.07
  const outer = bookingWindowOutline(cx, 0.17).map(([x, y]): [number, number] => [x, y <= sill + 1e-6 ? sill - 0.03 : y]);
  const arch = outlineShape(outer);
  arch.holes = [new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y)))];
  b.marble.add(new THREE.ExtrudeGeometry(arch, { depth: 0.07, bevelEnabled: false }).translate(0, 0, FACE_Z));
  // brass liner ring on top of it
  const lo = bookingWindowOutline(cx, 0.028).map(([x, y]): [number, number] => [x, y <= sill + 1e-6 ? sill - 0.03 : y]);
  const liner = outlineShape(lo);
  liner.holes = [new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y)))];
  b.brass.add(new THREE.ExtrudeGeometry(liner, { depth: 0.02, bevelEnabled: false }).translate(0, 0, FACE_Z + 0.07));
  // dark-marble sill through the stone reveal
  b.dark.add(box(cx - 0.8, 0.9, 7.4, cx + 0.8, sill + 0.002, FACE_Z));
  // fine brass grille inside the reveal, with a ticket slot under it
  const gz = 7.78;
  const slotTop = sill + 0.26;
  for (let x = cx - 0.76; x <= cx + 0.761; x += 0.055) {
    const top = headY(Math.abs(x - cx) + 0.01) - 0.012;
    b.brass.add(tube(new THREE.Vector3(x, slotTop, gz), new THREE.Vector3(x, top, gz), 0.0048, 5));
  }
  b.brass.add(cylX(cx, slotTop, gz, 0.0085, 1.6, 8));
  b.brass.add(cylX(cx, sill + 0.9, gz, 0.0065, 1.6, 8));
  b.brass.add(sphere(cx, sill + 0.9, gz, 0.02, 8, 6));
  // gilt TICKETS plaque above
  const t = atlas.cell.tickets;
  if (t) plate(b, t, cx, 3.0, 1.6, 0.4);

  // counter: walnut carcass, panelled fascia, dark-marble top with brass edge
  b.dark.add(box(cx - 1.5, 0, FACE_Z, cx + 1.5, 0.1, FACE_Z + 0.34));
  b.wood.add(rbox(cx - 1.48, 0.1, FACE_Z, cx + 1.48, 1.012, FACE_Z + 0.3, 0.008, 2));
  for (let i = 0; i < 3; i++) {
    const xa = cx - 1.38 + i * 0.93;
    b.wood.add(rbox(xa, 0.2, FACE_Z + 0.29, xa + 0.85, 0.9, FACE_Z + 0.325, 0.014, 2));
    b.brass.add(box(xa + 0.02, 0.21, FACE_Z + 0.324, xa + 0.83, 0.218, FACE_Z + 0.332));
    b.brass.add(box(xa + 0.02, 0.882, FACE_Z + 0.324, xa + 0.83, 0.89, FACE_Z + 0.332));
  }
  b.dark.add(slab(cx, FACE_Z + 0.17, 3.0, 0.34, 1.012, 0.038, 0.02, 0.004));
  b.brass.add(cylX(cx, 1.0, FACE_Z + 0.318, 0.009, 2.94, 8));
  b.brass.add(cylX(cx, 0.1, FACE_Z + 0.345, 0.012, 3.0, 8));
  // brass ticket tray set into the counter
  brassTray(b, cx, 1.05, FACE_Z + 0.17);
  if (idx === 1) {
    // the ritual: one ticket already waiting in the middle tray
    // a printed card propped against the tray's rim so it catches the light (scaled up a little for legibility)
    const g = box(-0.115, 0, -0.055, 0.115, 0.004, 0.055);
    const r = atlas.cell.ticket;
    if (r) atlasUV(g, r);
    const lean = new THREE.Matrix4().makeRotationX(-0.72);
    b.paper.add(g, mul(xf(cx + 0.02, 1.062, FACE_Z + 0.19, 0.25), lean));
  }
}

/** An empty clerk's booth behind the window: warm, sparse, slightly wrong. */
function booth(b: Buckets, atlas: PaperAtlas, cx: number, idx: number): void {
  const z0 = 5.2;
  const z1 = 7.4;
  const hw = 2.35;
  b.booth.add(box(cx - hw, 0, z0, cx + hw, 3.3, z1));
  // clerk's desk along the window side
  const dy = 0.93;
  b.wood.add(rbox(cx - 2.0, dy - 0.05, 6.35, cx + 2.0, dy, 7.3, 0.01, 2));
  b.wood.add(box(cx - 1.95, 0, 6.4, cx - 1.9, dy - 0.05, 7.25));
  b.wood.add(box(cx + 1.9, 0, 6.4, cx + 1.95, dy - 0.05, 7.25));
  b.wood.add(box(cx - 1.95, 0.05, 7.2, cx + 1.95, dy - 0.05, 7.25));
  // green banker's lamp (lit), brass dating stamp, ledger, inkwell, tickets
  const lampX = cx + (idx % 2 === 0 ? -0.55 : 0.55);
  addBankersLamp(b, xf(lampX, dy, 6.85, idx % 2 === 0 ? 0.3 : -0.3));
  const stampX = cx + (idx % 2 === 0 ? 0.35 : -0.35);
  b.brass.add(lathe([[0.001, 0], [0.04, 0], [0.04, 0.02], [0.012, 0.03], [0.012, 0.09], [0.03, 0.1], [0.03, 0.12], [0.001, 0.125]], 14, 0.5), xf(stampX, dy, 6.9));
  b.wood.add(rbox(stampX - 0.07, dy, 6.55, stampX + 0.07, dy + 0.012, 6.68, 0.004, 2));
  b.leather.add(rbox(cx - 0.18, dy, 6.55, cx + 0.12, dy + 0.035, 6.78, 0.008), xf(0, 0, 0), 0x5a1519);
  b.leather.add(box(cx - 0.12, dy + 0.035, 6.5, cx + 0.12, dy + 0.04, 6.54), undefined, 0xd8c8a2);
  b.silver.add(lathe([[0.001, 0], [0.03, 0], [0.034, 0.03], [0.02, 0.05], [0.001, 0.05]], 12, 0.5), xf(cx + 0.9, dy, 6.7));
  // ticket rack on the back wall: brass frame + rows of small cards
  const rx0 = cx - 0.75;
  const rx1 = cx + 0.75;
  frameBars(b.brass, rx0, 1.2, rx1, 1.9, z0 + 0.0, z0 + 0.03, 0.02);
  const cards = [0xe6d9b8, 0xd8c8a2, 0xa8453d, 0x3d6a52, 0xe6d9b8];
  for (let r = 0; r < 3; r++) {
    b.brass.add(box(rx0, 1.2 + (r + 1) * 0.175 - 0.075, z0, rx1, 1.2 + (r + 1) * 0.175 - 0.065, z0 + 0.05));
    for (let i = 0; i < 14; i++) {
      const x = rx0 + 0.06 + i * 0.1;
      const c = cards[(i * 7 + r * 3 + idx) % cards.length]!;
      b.leather.add(box(x, 1.2 + r * 0.175 + 0.02, z0 + 0.005, x + 0.07, 1.2 + r * 0.175 + 0.1, z0 + 0.03), undefined, c);
    }
  }
  // wall clock stopped at 6:47 (the hall's uncanny hour)
  const face = new THREE.CircleGeometry(0.16, 28);
  const cell = atlas.cell.clock;
  if (cell) {
    // circle uv spans the unit disc centred at 0.5; remap into the atlas cell
    const uv = face.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
  }
  b.paper.add(face, xf(cx, 2.2, z0 + 0.035, 0));
  b.brass.add(new THREE.TorusGeometry(0.165, 0.014, 6, 28), xf(cx, 2.2, z0 + 0.035, 0));
  // a clerk's stool, pushed back from the desk as if just left
  const stool = new THREE.Matrix4().compose(new THREE.Vector3(cx + (idx === 1 ? -0.25 : 0.25), 0, 6.05), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), new THREE.Vector3(1, 1, 1));
  b.leather.add(lathe([[0.001, 0.6], [0.18, 0.6], [0.19, 0.625], [0.17, 0.65], [0.001, 0.655]], 18, 0.5), stool, 0x4a2a18);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.brass.add(tube(new THREE.Vector3(Math.cos(a) * 0.04, 0.6, Math.sin(a) * 0.04), new THREE.Vector3(Math.cos(a) * 0.2, 0.0, Math.sin(a) * 0.2), 0.012, 6), stool);
  }
  b.brass.add(new THREE.TorusGeometry(0.15, 0.007, 5, 20).rotateX(Math.PI / 2).translate(0, 0.25, 0), stool);
  void mul;
}

export function buildBooking(b: Buckets, atlas: PaperAtlas): void {
  const { xMin, xMax, windowCentersX } = BOOKING_OFFICE;
  wainscot(b, xMin, xMax);
  shopCornice(b, xMin, xMax);
  for (const px of [-28, -23, -18, -13]) pilaster(b, px);
  pilaster(b, xMin + 0.15, 0.15);
  pilaster(b, xMax - 0.15, 0.15);
  windowCentersX.forEach((cx, i) => {
    window(b, atlas, cx, i);
    booth(b, atlas, cx, i);
  });
  // grand frieze plate over the middle window
  const sign = atlas.cell.booking;
  if (sign) plate(b, sign, windowCentersX[1], 4.2, 5.0, 0.625);
  // framed timetable posters either side of each window + both ends
  const pw = 0.86;
  const ph = 1.22;
  const spots: number[] = [];
  for (const cx of windowCentersX) spots.push(cx - 1.65, cx + 1.65);
  spots.sort((a, c) => a - c);
  const all = [-28.74, ...spots, -11.86];
  all.forEach((px, i) => {
    const r = atlas.cell[`poster${i % atlas.posterCount}`];
    if (r) poster(b, r, px, 2.0, i === 0 ? 0.8 : pw, i === 0 ? 1.14 : ph);
  });
}
