/**
 * Pure-data shop layout (no three.js): the single source of truth for shop frames and obstacle circles, shared by
 * src/obstacles.ts (and the Node nav self-test) and the renderer.
 *
 * Shop-local frame: x_l runs along the wall, y is up, z_l is the distance out of the wall into the hall (0 = wall face,
 * SHOPS.depth = shopfront plane). The frame is right-handed: west x_l = -z (hall +x), east x_l = +z (hall -x).
 */
import { SHOPS } from '../../layout';

export type ShopUnit = (typeof SHOPS.units)[number];
export type ShopId = ShopUnit['id'];

export const sideSign = (u: ShopUnit): 1 | -1 => (u.side === 'west' ? -1 : 1);

/** shop-local (x_l, z_l) -> world [x, z]. */
export function toWorld(u: ShopUnit, lx: number, lz: number): [number, number] {
  return u.side === 'west' ? [-30 + lz, u.bayZ - lx] : [30 - lz, u.bayZ + lx];
}

export interface LocalCircle {
  readonly lx: number;
  readonly lz: number;
  readonly r: number;
}

/** Freestanding things outside the shopfront (shared with the builders). */
export const OUTSIDE: Record<ShopId, readonly LocalCircle[]> = {
  newsstand: [
    { lx: 3.5, lz: 3.4, r: 0.36 }, // tied newspaper bundle by the door
    { lx: -3.1, lz: 3.45, r: 0.4 }, // A-board with the headline poster
  ],
  florist: [-4.0, -3.35, -2.7, 2.7, 3.35, 4.0].map((lx) => ({ lx, lz: 3.3, r: 0.27 })),
  coffee: [
    { lx: -1.2, lz: 3.45, r: 0.36 },
    { lx: -2.0, lz: 3.45, r: 0.22 },
    { lx: -0.4, lz: 3.45, r: 0.22 },
    { lx: 2.0, lz: 3.45, r: 0.36 },
    { lx: 1.2, lz: 3.45, r: 0.22 },
    { lx: 2.8, lz: 3.45, r: 0.22 },
  ],
  conveniences: [],
};

/** Inside the alcoves / shops (unreachable but registered for completeness). */
export const INSIDE: Record<ShopId, readonly LocalCircle[]> = {
  newsstand: [],
  florist: [],
  coffee: [],
  conveniences: [
    { lx: -3.8, lz: 0.7, r: 0.6 }, // telephone booth
    { lx: -2.7, lz: 0.7, r: 0.6 }, // telephone booth
    { lx: 0.1, lz: 0.5, r: 0.5 }, // lockers
    { lx: -2.0, lz: 2.0, r: 0.3 }, // pillar box
    { lx: 3.5, lz: 1.3, r: 0.6 }, // shoeshine plinth
  ],
};

export interface WorldCircle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly level: number;
}

/** Cross-platform kiosk footprint circles. */
function kioskCircles(): WorldCircle[] {
  const k = SHOPS.kiosk;
  const out: WorldCircle[] = [];
  const zc = (k.zMin + k.zMax) / 2;
  for (let x = k.xMin + 0.8; x <= k.xMax - 0.79; x += 0.85) out.push({ x, z: zc - 0.4, r: 1.05, level: 0 });
  // back row, so nobody squeezes into the strip between the kiosk and the north wall
  for (let x = k.xMin + 0.4; x <= k.xMax - 0.39; x += 0.8) out.push({ x, z: k.zMin + 0.4, r: 0.8, level: 0 });
  for (const x of [k.xMin + 0.75, k.xMax - 0.75]) out.push({ x, z: k.zMax - 0.75, r: 0.75, level: 0 });
  return out;
}

export function shopObstacles(): WorldCircle[] {
  const out: WorldCircle[] = [];
  for (const u of SHOPS.units) {
    // the whole shop volume is solid: a row of overlapping circles along the front, plus the two end faces
    const lz = SHOPS.depth - 0.65;
    const hl = SHOPS.halfLength;
    for (let lx = -hl + 0.3; lx <= hl - 0.29; lx += 1.0) {
      const [x, z] = toWorld(u, lx, lz);
      out.push({ x, z, r: 0.7, level: 0 });
    }
    for (const c of [...OUTSIDE[u.id], ...INSIDE[u.id]]) {
      const [x, z] = toWorld(u, c.lx, c.lz);
      out.push({ x, z, r: c.r, level: 0 });
    }
  }
  out.push(...kioskCircles());
  return out;
}
