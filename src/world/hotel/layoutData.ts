/**
 * Pure-data hotel layout (no three.js) so src/obstacles.ts (and the Node nav self-test) and the renderer share
 * ONE source of truth. Convention: a piece's local +z is its FRONT; yaw rotates about +Y, so yaw 0 faces +z,
 * yaw PI faces -z, yaw +PI/2 faces +x and yaw -PI/2 faces -x.
 */
import { BOOKING_OFFICE, CONCIERGE, KIOSK, LOUNGE_ROOM, OCULUS, STAIR } from '../../layout';

export type PieceKind =
  | 'sofa' | 'chair' | 'coffeeTable' | 'roundTable' | 'standardLamp' | 'palm' | 'trolley'
  | 'desk' | 'deskChair' | 'fireplace' | 'sideboard' | 'bookcase' | 'sideTable' | 'centreTable' | 'piano';
export type Tint = 'oxblood' | 'green';

export interface Piece {
  readonly kind: PieceKind;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Ground height of the level the piece stands on (0 hall, 6 balcony). */
  readonly level: number;
  readonly tint?: Tint;
  /** Table dressing / palm variant. */
  readonly variant?: number;
}

export type RugCell = 'big' | 'oxblood' | 'indigo' | 'forest';
export interface Rug {
  readonly x: number;
  readonly z: number;
  /** extent along x / z in meters */
  readonly w: number;
  readonly l: number;
  readonly level: number;
  readonly cell: RugCell;
}

export interface Runner {
  readonly x: number;
  readonly width: number;
  readonly z0: number;
  readonly z1: number;
}

const FLOOR = 0;
const P = Math.PI;

const flip = (t: Tint | undefined): Tint | undefined => (t === 'oxblood' ? 'green' : t === 'green' ? 'oxblood' : t);
const mirror = (p: Piece): Piece => ({ ...p, x: -p.x, yaw: -p.yaw, tint: flip(p.tint) });
const face = (fromX: number, fromZ: number, toX: number, toZ: number): number => Math.atan2(toX - fromX, toZ - fromZ);

// ---------------------------------------------------------------------------------------------
// Balcony: only a restrained touch, nothing on the deck but the stair runner's landing strip.
// ---------------------------------------------------------------------------------------------
export const BALCONY_PIECES: readonly Piece[] = [];
/** No rug on the deck: the opening view stays calm; the stair runner starts at the landing. */
export const BALCONY_RUGS: readonly Rug[] = [];

// ---------------------------------------------------------------------------------------------
// Hall: the aisle armchair groups that used to stand in the blind bays 38 / 62 are gone: those bays now hold the Phase 5B
// shopfronts (src/world/shops). The window bays (26 / 74) cannot take them: their wall benches stay and the colonnade
// aisle would drop below 3 m.
// ---------------------------------------------------------------------------------------------
/** Luggage trolley beside the concierge desk. */
const TROLLEY: Piece = { kind: 'trolley', x: 13.3, z: 10.5, yaw: 0, level: FLOOR };

export const HALL_PIECES: readonly Piece[] = [TROLLEY];

export const HALL_RUGS: readonly Rug[] = [];

/** Ring radius (kiosk footprint 3.5 + 1.5 keep-clear) where the carpet runners stop around the kiosk. */
export const KIOSK_RING_R = 5.1;
export const RUNNER_WIDTH = 3.0;
export const RUNNERS: readonly Runner[] = [
  { x: 0, width: RUNNER_WIDTH, z0: STAIR.zMax - 0.26, z1: KIOSK.center[1] - KIOSK_RING_R },
  // The runner leads from the kiosk to the oculus gangway gate, and resumes beyond the oculus to the gates.
  { x: 0, width: RUNNER_WIDTH, z0: KIOSK.center[1] + KIOSK_RING_R, z1: OCULUS.cz - OCULUS.curbOuterR - 0.3 },
  { x: 0, width: RUNNER_WIDTH, z0: OCULUS.cz + OCULUS.curbOuterR + 0.3, z1: 88 },
];

// ---------------------------------------------------------------------------------------------
// First-class lounge room (LOUNGE_ROOM): floor y 6, x in [-15, 15], z in [-24, -2]. Doors centred in the north wall (x = 0).
// ---------------------------------------------------------------------------------------------
const LV = LOUNGE_ROOM.floorY;
/** Authored on the west half; mirrored to the east (leather colours swap). */
const LOUNGE_SYMMETRIC: Piece[] = [
  // north wall: chesterfields facing south either side of the doors, lamps and side tables
  { kind: 'sofa', x: -7.0, z: -2.62, yaw: P, level: LV, tint: 'oxblood' },
  { kind: 'sideTable', x: -4.9, z: -2.62, yaw: 0, level: LV },
  { kind: 'standardLamp', x: -9.15, z: -2.6, yaw: 0, level: LV },
  { kind: 'palm', x: -13.9, z: -3.1, yaw: 0, level: LV, variant: 11 },
  // side conversation groups either side of the entrance axis: chesterfield, tea table, two wingbacks
  { kind: 'sofa', x: -10.3, z: -8.5, yaw: P / 2, level: LV, tint: 'oxblood' },
  { kind: 'coffeeTable', x: -8.2, z: -8.5, yaw: P / 2, level: LV, variant: 2 },
  { kind: 'chair', x: -8.5, z: -6.0, yaw: face(-8.5, -6.0, -8.3, -8.2), level: LV, tint: 'green' },
  { kind: 'chair', x: -8.5, z: -11.0, yaw: face(-8.5, -11.0, -8.3, -8.8), level: LV, tint: 'green' },
  // south wall: console tables with mirrors on the piers, lamps and palms flanking the writing desk
  { kind: 'sideboard', x: -4.5, z: -23.97, yaw: 0, level: LV, variant: 0 },
  { kind: 'palm', x: -2.55, z: -23.1, yaw: 0, level: LV, variant: 12 },
  { kind: 'standardLamp', x: -13.9, z: -22.9, yaw: 0, level: LV },
];
const LOUNGE_WEST: Piece[] = [
  // central conversation group (rug at the middle)
  { kind: 'sofa', x: 0, z: -11.5, yaw: P, level: LV, tint: 'oxblood' },
  { kind: 'coffeeTable', x: 0, z: -13.4, yaw: 0, level: LV, variant: 0 },
  { kind: 'chair', x: -3.9, z: -13.4, yaw: P / 2, level: LV, tint: 'green' },
  { kind: 'standardLamp', x: -3.3, z: -10.9, yaw: 0, level: LV },
  // black grand piano (lid open, silent) and its bench, keyboard facing west
  { kind: 'piano', x: -9.2, z: -16.2, yaw: -P / 2, level: LV },
  // west wall: sideboard between the windows, lamps either side, two reading groups
  { kind: 'sideboard', x: -14.97, z: -13.5, yaw: P / 2, level: LV, variant: 0 },
  { kind: 'standardLamp', x: -14.35, z: -11.1, yaw: 0, level: LV },
  { kind: 'standardLamp', x: -14.35, z: -15.9, yaw: 0, level: LV },
  { kind: 'roundTable', x: -11.8, z: -21.4, yaw: 0, level: LV, variant: 2 },
  { kind: 'chair', x: -13.3, z: -22.6, yaw: face(-13.3, -22.6, -11.8, -21.4), level: LV, tint: 'oxblood' },
  { kind: 'chair', x: -10.3, z: -20.2, yaw: face(-10.3, -20.2, -11.8, -21.4), level: LV, tint: 'oxblood' },
];
const LOUNGE_EAST_MIRROR: Piece[] = LOUNGE_SYMMETRIC.map((p): Piece => mirror({ ...p, variant: p.variant === undefined ? undefined : p.variant + 4 }));
const LOUNGE_EAST: Piece[] = [
  // east wall: fireplace between four bookcases, two wingbacks at the hearth
  { kind: 'fireplace', x: 14.98, z: -13.5, yaw: -P / 2, level: LV },
  { kind: 'chair', x: 12.6, z: -11.3, yaw: face(12.6, -11.3, 13.7, -13.0), level: LV, tint: 'oxblood' },
  { kind: 'chair', x: 12.6, z: -15.7, yaw: face(12.6, -15.7, 13.7, -14.0), level: LV, tint: 'oxblood' },
  { kind: 'standardLamp', x: 13.9, z: -9.4, yaw: 0, level: LV },
  { kind: 'bookcase', x: 14.99, z: -6.6, yaw: -P / 2, level: LV, variant: 0 },
  { kind: 'bookcase', x: 14.99, z: -9.9, yaw: -P / 2, level: LV, variant: 1 },
  { kind: 'bookcase', x: 14.99, z: -17.1, yaw: -P / 2, level: LV, variant: 2 },
  { kind: 'bookcase', x: 14.99, z: -20.4, yaw: -P / 2, level: LV, variant: 3 },
  // central group: opposite wingback and the second chesterfield
  { kind: 'sofa', x: 0, z: -15.3, yaw: 0, level: LV, tint: 'green' },
  { kind: 'chair', x: 3.9, z: -13.4, yaw: -P / 2, level: LV, tint: 'green' },
  { kind: 'standardLamp', x: 3.3, z: -16.0, yaw: 0, level: LV },
  // second conversation group between the central rug and the hearth: chesterfield, tea table, wingback
  { kind: 'sofa', x: 6.9, z: -14.7, yaw: P / 2, level: LV, tint: 'green' },
  { kind: 'coffeeTable', x: 8.9, z: -14.7, yaw: P / 2, level: LV, variant: 3 },
  { kind: 'chair', x: 9.0, z: -11.8, yaw: face(9.0, -11.8, 8.9, -14.2), level: LV, tint: 'oxblood' },
  { kind: 'chair', x: 9.0, z: -17.6, yaw: face(9.0, -17.6, 8.9, -15.2), level: LV, tint: 'oxblood' },
  // reading corner and a card table
  { kind: 'roundTable', x: 9.8, z: -21.2, yaw: 0, level: LV, variant: 1 },
  { kind: 'chair', x: 8.4, z: -22.3, yaw: face(8.4, -22.3, 9.8, -21.2), level: LV, tint: 'oxblood' },
  { kind: 'chair', x: 11.2, z: -20.0, yaw: face(11.2, -20.0, 9.8, -21.2), level: LV, tint: 'oxblood' },
  { kind: 'centreTable', x: 0, z: -6.6, yaw: 0, level: LV },
  // the writing desk, centred under the middle south window
  { kind: 'desk', x: 0, z: -23.5, yaw: 0, level: LV },
  { kind: 'deskChair', x: 0.15, z: -22.45, yaw: P + 0.18, level: LV, tint: 'green' },
];
export const LOUNGE_PIECES: readonly Piece[] = [...LOUNGE_SYMMETRIC, ...LOUNGE_EAST_MIRROR, ...LOUNGE_WEST, ...LOUNGE_EAST];

export const LOUNGE_RUGS: readonly Rug[] = [
  { x: 0, z: -13.4, w: 8.4, l: 4.6, level: LV, cell: 'big' },
  { x: 12.9, z: -13.5, w: 3.5, l: 5.1, level: LV, cell: 'forest' },
  { x: 8.6, z: -14.7, w: 3.8, l: 5.4, level: LV, cell: 'indigo' },
  { x: -9.6, z: -16.2, w: 3.8, l: 4.8, level: LV, cell: 'forest' },
  { x: -8.9, z: -8.5, w: 3.8, l: 5.4, level: LV, cell: 'indigo' },
  { x: 8.9, z: -8.5, w: 3.8, l: 5.4, level: LV, cell: 'forest' },
  { x: -11.8, z: -21.4, w: 3.4, l: 4.2, level: LV, cell: 'oxblood' },
  { x: 0, z: -6.2, w: 3.0, l: 7.4, level: LV, cell: 'oxblood' },
];

// ---------------------------------------------------------------------------------------------
// Booking-office window geometry (shared by the stone-wall holes in concourse/balcony.ts and the facade).
// ---------------------------------------------------------------------------------------------
/** Deco-stepped ticket-window outline in (x, y), CCW. `grow` offsets every edge outward (bottom stays at the sill). */
export function bookingWindowOutline(cx: number, grow = 0): Array<[number, number]> {
  const sill = BOOKING_OFFICE.counterHeight;
  const h = BOOKING_OFFICE.windowHeight;
  const hw = BOOKING_OFFICE.windowWidth / 2 + grow;
  const y1 = sill + h * 0.68 + grow;
  const y2 = sill + h * 0.86 + grow;
  const y3 = sill + h + grow;
  const left: Array<[number, number]> = [
    [cx - hw, sill],
    [cx - hw, y1],
    [cx - hw + 0.2, y1],
    [cx - hw + 0.2, y2],
    [cx - hw + 0.4, y2],
    [cx - hw + 0.4, y3],
  ];
  const right = left.map(([x, y]): [number, number] => [2 * cx - x, y]).reverse();
  return [...left, ...right];
}

// ---------------------------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------------------------
interface Circle {
  x: number;
  z: number;
  r: number;
  level: number;
}

function pieceCircles(p: Piece): Circle[] {
  const at = (lx: number, lz: number, r: number): Circle => ({
    x: p.x + Math.cos(p.yaw) * lx + Math.sin(p.yaw) * lz,
    z: p.z - Math.sin(p.yaw) * lx + Math.cos(p.yaw) * lz,
    r,
    level: p.level,
  });
  switch (p.kind) {
    case 'sofa':
      return [at(-0.7, 0, 0.5), at(0, 0, 0.5), at(0.7, 0, 0.5)];
    case 'chair':
      return [at(0, 0, 0.5)];
    case 'coffeeTable':
      return [at(-0.33, 0, 0.36), at(0.33, 0, 0.36)];
    case 'roundTable':
      return [at(0, 0, 0.36)];
    case 'standardLamp':
      return [at(0, 0, 0.22)];
    case 'palm':
      return [at(0, 0, 0.34)];
    case 'trolley':
      return [at(-0.3, 0, 0.42), at(0.3, 0, 0.42)];
    case 'desk':
      return [at(-0.55, 0, 0.5), at(0, 0, 0.5), at(0.55, 0, 0.5)];
    case 'deskChair':
      return [at(0, 0, 0.3)];
    case 'fireplace':
      return [at(-0.7, 0.35, 0.4), at(0, 0.35, 0.4), at(0.7, 0.35, 0.4)];
    case 'sideboard':
      return [at(-0.6, 0.25, 0.3), at(0, 0.25, 0.3), at(0.6, 0.25, 0.3)];
    case 'bookcase':
      return [at(-0.55, 0.2, 0.3), at(0, 0.2, 0.3), at(0.55, 0.2, 0.3)];
    case 'sideTable':
      return [at(0, 0, 0.3)];
    case 'centreTable':
      return [at(0, 0, 0.75)];
    case 'piano':
      return [at(0, -1.0, 0.62), at(0, -0.2, 0.75), at(0, 0.6, 0.62), at(0, 1.62, 0.42)];
  }
}

/** All collidable hotel furniture, as circles the navigation module treats as `PropObstacle`s. */
export function hotelObstacles(): Circle[] {
  const out: Circle[] = [];
  for (const p of [...BALCONY_PIECES, ...HALL_PIECES, ...LOUNGE_PIECES]) out.push(...pieceCircles(p));
  // reception desk: row of circles, kept inside z <= 10.4 so the interaction zone (z >= 10.6) stays clear
  const d = CONCIERGE.desk;
  for (let x = d.xMin + 0.4; x <= d.xMax - 0.39; x += 0.6) out.push({ x, z: 9.95, r: 0.45, level: FLOOR });
  // booking counters project to z ~ 8.3 only; the interaction zones (z >= 8.4) stay clear, no circles needed
  return out;
}
