import { PLAYER } from '../layout';
import { HALCYON, LIFTS, OCULUS } from '../layoutMetro';
import { boundsOf, circleShape, inShape, obbShape, type CircleShape, type ObbShape, type Region } from '../player/regions';

/**
 * Twin glass capsule lifts (spec §2.6, P3-8a): two independent cabins at (-17, 74) and (-17, 80),
 * stops at Threshold (-30), Crossing (-70) and Halcyon (-82).
 * Pure logic (no three.js, no DOM) so Node tests import it directly.
 */

export type LiftStop = 0 | 1 | 2;
export type LiftState = 'idle' | 'opening' | 'open' | 'closing' | 'moving';

export const LIFT_STOPS = LIFTS.stops; // [-30, -70, -82]
export const LIFT_STOP_LABELS = [
  'Threshold  \u221230 m',
  'Crossing  \u221270 m',
  'Halcyon  \u221282 m',
] as const;

export const LIFT_KINEMATICS = {
  vmax: 2.5,
  accel: 0.8,
  minSpeed: 0.05,
  doorSeconds: 0.7,
  idleCloseSeconds: 10.0,
  ghostMinSeconds: 40.0,
  ghostMaxSeconds: 70.0,
  ghostClearDist: 6.0,
  /** Doorway clear half-angle (rad) on the cylindrical tube/cabin (~28 deg -> ~1.31 m chord at r = 1.4). */
  doorHalfAngle: (28 * Math.PI) / 180,
  /** Exterior call button angular offset from doorway centre (right jamb outside door). */
  callButtonAngleOffset: -0.52,
  callButtonHeight: 1.15,
  callButtonRadius: LIFTS.tubeR + 0.08,
  /** Interior control panel angular offset from doorway centre (inside right mullion). */
  panelAngleOffset: -0.64,
  panelRadius: LIFTS.cabinR - 0.03,
  /** Vertical heights above cabin floor of the 3 interior floor buttons: Threshold (-30), Crossing (-70), Halcyon (-82). */
  floorButtonHeights: [1.42, 1.24, 1.06] as readonly [number, number, number],
  /** Vertical height above cabin floor of the analog white-onyx depth gauge dial centre. */
  dialHeight: 1.72,
} as const;

const C = PLAYER.wallClearance;
const LEVEL = 0.6;
const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DoorDir {
  readonly x: number;
  readonly z: number;
  /** Angle in XZ plane: atan2(z, x). */
  readonly angle: number;
}

/** Outward unit door direction for lift `liftIdx` at stop `stopIdx`. */
export function liftDoorDir(liftIdx: number, stopIdx: LiftStop): DoorDir {
  const pos = LIFTS.positions[liftIdx]!;
  const lx = pos[0], lz = pos[1];
  let dx = 1, dz = 0;
  if (stopIdx === 0) {
    // Threshold (-30): radially inward toward the sky-hole centre (0, 74)
    dx = OCULUS.cx - lx;
    dz = OCULUS.cz - lz;
  } else if (stopIdx === 1) {
    // Crossing (-70): due east (+x) toward disc well and F5 foot
    dx = 1;
    dz = 0;
  } else {
    // Halcyon (-82): perpendicular toward the diagonal island centre line
    const [hx, hz] = HALCYON.centre;
    const [ux, uz] = HALCYON.dir;
    const px = -uz, pz = ux; // unit perpendicular
    const lt = (lx - hx) * px + (lz - hz) * pz;
    const sgn = lt > 0 ? -1 : 1;
    dx = px * sgn;
    dz = pz * sgn;
  }
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  return { x: dx, z: dz, angle: Math.atan2(dz, dx) };
}

export interface ButtonPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Outward (or inward for interior buttons) unit normal facing the player. */
  readonly nx: number;
  readonly nz: number;
}

/** World position of the exterior call button outside lift `liftIdx` at stop `stopIdx`. */
export function liftCallButtonPos(liftIdx: number, stopIdx: LiftStop): ButtonPose {
  const [lx, lz] = LIFTS.positions[liftIdx]!;
  const dir = liftDoorDir(liftIdx, stopIdx);
  const a = dir.angle + LIFT_KINEMATICS.callButtonAngleOffset;
  const c = Math.cos(a), s = Math.sin(a);
  return {
    x: lx + LIFT_KINEMATICS.callButtonRadius * c,
    y: LIFT_STOPS[stopIdx]! + LIFT_KINEMATICS.callButtonHeight,
    z: lz + LIFT_KINEMATICS.callButtonRadius * s,
    nx: c,
    nz: s,
  };
}

/** World position of interior floor button `stopIdx` inside lift `liftIdx` at height `cabinY` and `doorAngle`. */
export function liftFloorButtonPos(liftIdx: number, stopIdx: LiftStop, cabinY: number, doorAngle: number): ButtonPose {
  const [lx, lz] = LIFTS.positions[liftIdx]!;
  const a = doorAngle + LIFT_KINEMATICS.panelAngleOffset;
  const c = Math.cos(a), s = Math.sin(a);
  return {
    x: lx + LIFT_KINEMATICS.panelRadius * c,
    y: cabinY + LIFT_KINEMATICS.floorButtonHeights[stopIdx]!,
    z: lz + LIFT_KINEMATICS.panelRadius * s,
    nx: -c,
    nz: -s,
  };
}

export interface LiftSnapshot {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly docked: LiftStop | null;
  readonly targetStop: LiftStop;
  readonly state: LiftState;
  /** Smooth 0..1 cabin door opening. */
  readonly doorOpen01: number;
  /** Current cabin door azimuth (radians, atan2(z, x)). */
  readonly doorAngle: number;
  /** Signed vertical velocity (m/s). */
  readonly speed: number;
  readonly isGhost: boolean;
}

interface MutableRegion {
  xMin: number; xMax: number; zMin: number; zMax: number;
  y: number;
  circle?: CircleShape;
  obb?: ObbShape;
  when?: () => boolean;
  carry?: { x: number; y: number; z: number };
}

interface Cabin {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly dirs: readonly [DoorDir, DoorDir, DoorDir];
  readonly floorShape: CircleShape;
  readonly doorShapes: readonly [ObbShape, ObbShape, ObbShape];
  readonly floorRegion: MutableRegion;
  y: number;
  docked: LiftStop | null;
  state: LiftState;
  targetStop: LiftStop;
  startY: number;
  startAngle: number;
  targetAngle: number;
  doorAngle: number;
  /** Raw linear 0..1 door phase; doorOpen01 = smooth(doorPhase). */
  doorPhase: number;
  doorOpen01: number;
  speed: number;
  signedSpeed: number;
  pendingStop: LiftStop | null;
  queuedStop: LiftStop | null;
  openOnArrival: boolean;
  isGhost: boolean;
  openIdleTimer: number;
  ghostTimer: number;
  readonly carry: { x: number; y: number; z: number };
}

const wrapAngleDelta = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export class LiftsController {
  private readonly rnd: () => number;
  private readonly cabins: Cabin[];
  private readonly allRegions: Region[];
  private frozen = false;

  constructor(opts: { seed?: number; initialStops?: readonly [LiftStop, LiftStop] } = {}) {
    this.rnd = prng(opts.seed ?? 7);
    const initStops: readonly [LiftStop, LiftStop] = opts.initialStops ?? [0, 1];
    this.cabins = [];
    this.allRegions = [];

    for (let i = 0; i < LIFTS.positions.length; i++) {
      const [lx, lz] = LIFTS.positions[i]!;
      const dirs: [DoorDir, DoorDir, DoorDir] = [
        liftDoorDir(i, 0),
        liftDoorDir(i, 1),
        liftDoorDir(i, 2),
      ];
      const initStop = initStops[i] ?? 0;
      const initY = LIFT_STOPS[initStop]!;
      const initAngle = dirs[initStop]!.angle;
      const floorShape = circleShape(lx, lz, LIFTS.cabinR - C);
      const carry = { x: 0, y: 0, z: 0 };
      const floorRegion: MutableRegion = { ...boundsOf(floorShape), y: initY, circle: floorShape, carry };

      // Doorway connectors bridge inside cabin (r 0.45) across shaft wall (r 1.4) onto landing (r 2.05)
      const r0 = 0.45, r1 = LIFTS.tubeR + C + 0.25;
      const rMid = (r0 + r1) / 2, halfLen = (r1 - r0) / 2, halfWid = 0.30;
      const doorShapes: [ObbShape, ObbShape, ObbShape] = [0, 1, 2].map((s) => {
        const d = dirs[s]!;
        return obbShape(lx + d.x * rMid, lz + d.z * rMid, d.x, d.z, halfLen, halfWid);
      }) as [ObbShape, ObbShape, ObbShape];

      const cabin: Cabin = {
        index: i,
        x: lx,
        z: lz,
        dirs,
        floorShape,
        doorShapes,
        floorRegion,
        y: initY,
        docked: initStop,
        state: 'idle',
        targetStop: initStop,
        startY: initY,
        startAngle: initAngle,
        targetAngle: initAngle,
        doorAngle: initAngle,
        doorPhase: 0,
        doorOpen01: 0,
        speed: 0,
        signedSpeed: 0,
        pendingStop: null,
        queuedStop: null,
        openOnArrival: true,
        isGhost: false,
        openIdleTimer: 0,
        ghostTimer: this.nextGhostDelay(),
        carry,
      };
      this.cabins.push(cabin);
      this.allRegions.push(floorRegion as Region);

      for (const s of [0, 1, 2] as const) {
        const shape = doorShapes[s]!;
        this.allRegions.push({
          ...boundsOf(shape),
          y: LIFT_STOPS[s]!,
          obb: shape,
          when: () => this.connectorOpen(i, s),
        });
      }
    }
  }

  private nextGhostDelay(): number {
    return LIFT_KINEMATICS.ghostMinSeconds + (LIFT_KINEMATICS.ghostMaxSeconds - LIFT_KINEMATICS.ghostMinSeconds) * this.rnd();
  }

  /** True when player feet are inside cabin `liftIdx`. */
  isPlayerInCabin(liftIdx: number, p: { x: number; y: number; z: number }): boolean {
    const c = this.cabins[liftIdx];
    if (!c) return false;
    return Math.hypot(p.x - c.x, p.z - c.z) <= LIFTS.cabinR - C + 0.08 && Math.abs(p.y - c.y) <= LEVEL;
  }

  /** True when player feet are standing inside the doorway threshold of `liftIdx` at `stopIdx`. */
  isPlayerInDoorway(liftIdx: number, stopIdx: LiftStop, p: { x: number; y: number; z: number }): boolean {
    const c = this.cabins[liftIdx];
    if (!c) return false;
    return Math.abs(p.y - LIFT_STOPS[stopIdx]!) <= LEVEL && inShape(c.doorShapes[stopIdx]!, p.x, p.z);
  }

  /** True when landing doorway connector is walkable (strictly docked AND doors open). */
  connectorOpen(liftIdx: number, stopIdx: LiftStop): boolean {
    const c = this.cabins[liftIdx];
    if (!c) return false;
    return c.docked === stopIdx && c.state === 'open' && c.doorOpen01 >= 0.85;
  }

  /** Smooth 0..1 opening of the shaft landing doors at stop `stopIdx` (strictly 0 unless docked there). */
  landingDoorOpen01(liftIdx: number, stopIdx: LiftStop): number {
    const c = this.cabins[liftIdx];
    if (!c || c.docked !== stopIdx) return 0;
    return c.doorOpen01;
  }

  /** Read-only snapshot of cabin `liftIdx`. */
  cabin(liftIdx: number): LiftSnapshot {
    const c = this.cabins[liftIdx]!;
    return {
      index: c.index,
      x: c.x,
      z: c.z,
      y: c.y,
      docked: c.docked,
      targetStop: c.targetStop,
      state: c.state,
      doorOpen01: c.doorOpen01,
      doorAngle: c.doorAngle,
      speed: c.signedSpeed,
      isGhost: c.isGhost,
    };
  }

  /** Snapshot of both cabins (for debug / tests). */
  snapshots(): readonly LiftSnapshot[] {
    return this.cabins.map((_, i) => this.cabin(i));
  }

  /** Exterior call button: summon lift `liftIdx` to `stopIdx` and open doors on arrival. */
  call(liftIdx: number, stopIdx: LiftStop): boolean {
    const c = this.cabins[liftIdx];
    if (!c || this.frozen) return false;
    c.isGhost = false;
    if (c.docked === stopIdx) {
      if (c.state === 'open' || c.state === 'opening') return false;
      if (c.state === 'idle') {
        c.state = 'opening';
        c.pendingStop = null;
        c.openIdleTimer = 0;
        return true;
      }
      if (c.state === 'closing' && c.pendingStop === null) {
        c.state = 'opening';
        c.openIdleTimer = 0;
        return true;
      }
      // Closing for a departure to another floor: queue return call
      c.queuedStop = stopIdx;
      return true;
    }
    if (c.docked !== null) {
      c.pendingStop = stopIdx;
      c.openOnArrival = true;
      if (c.state === 'idle') {
        this.beginMove(c, stopIdx);
      } else if (c.state === 'open' || c.state === 'opening') {
        c.state = 'closing';
      }
      return true;
    }
    // Moving
    if (c.targetStop === stopIdx) {
      c.openOnArrival = true;
      return true;
    }
    c.queuedStop = stopIdx;
    return true;
  }

  /** Interior floor button: send docked lift `liftIdx` to `stopIdx`. No-op if already at `stopIdx` or moving. */
  sendTo(liftIdx: number, stopIdx: LiftStop): boolean {
    const c = this.cabins[liftIdx];
    if (!c || this.frozen) return false;
    if (c.docked === null || c.docked === stopIdx) return false;
    c.isGhost = false;
    c.pendingStop = stopIdx;
    c.openOnArrival = true;
    if (c.state === 'idle') {
      this.beginMove(c, stopIdx);
    } else if (c.state === 'open' || c.state === 'opening') {
      c.state = 'closing';
    }
    return true;
  }

  private beginMove(c: Cabin, toStop: LiftStop): void {
    c.docked = null;
    c.state = 'moving';
    c.doorPhase = 0;
    c.doorOpen01 = 0;
    c.startY = c.y;
    c.targetStop = toStop;
    c.startAngle = c.doorAngle;
    c.targetAngle = c.dirs[toStop]!.angle;
    c.pendingStop = null;
    c.speed = 0;
    c.signedSpeed = 0;
    c.openIdleTimer = 0;
  }

  private nearAnyDoor(c: Cabin, p: { x: number; y: number; z: number }, dist: number): boolean {
    for (const s of [0, 1, 2] as const) {
      const sy = LIFT_STOPS[s]!;
      const d = c.dirs[s]!;
      const dx = p.x - (c.x + d.x * LIFTS.tubeR);
      const dy = p.y - sy;
      const dz = p.z - (c.z + d.z * LIFTS.tubeR);
      if (Math.hypot(dx, dy, dz) <= dist) return true;
    }
    return false;
  }

  private pickGhostDestination(c: Cabin, playerY: number): LiftStop {
    const cur = c.docked ?? c.targetStop;
    const others = ([0, 1, 2] as const).filter((s) => s !== cur) as [LiftStop, LiftStop];
    const [a, b] = others;
    const da = Math.abs(LIFT_STOPS[a]! - playerY);
    const db = Math.abs(LIFT_STOPS[b]! - playerY);
    const r = this.rnd();
    if (Math.abs(da - db) < 1e-6) return r < 0.5 ? a : b;
    // Weighted 2:1 toward the stop nearest the player's current level
    const nearer = da < db ? a : b;
    const farther = da < db ? b : a;
    return r < 2 / 3 ? nearer : farther;
  }

  update(dt: number, p: { x: number; y: number; z: number }): void {
    if (this.frozen) {
      for (const c of this.cabins) c.carry.y = 0;
      return;
    }
    const safeDt = Math.max(0, dt);
    const inAny = [this.isPlayerInCabin(0, p), this.isPlayerInCabin(1, p)] as const;

    for (let i = 0; i < this.cabins.length; i++) {
      const c = this.cabins[i]!;
      const prevY = c.y;
      const playerInside = inAny[i]!;
      const playerInOther = inAny[1 - i]!;

      if (c.state === 'opening') {
        c.doorPhase = Math.min(1, c.doorPhase + safeDt / LIFT_KINEMATICS.doorSeconds);
        c.doorOpen01 = smooth(c.doorPhase);
        if (c.doorPhase >= 1) {
          c.state = 'open';
          c.openIdleTimer = 0;
        }
      } else if (c.state === 'open') {
        c.doorPhase = 1;
        c.doorOpen01 = 1;
        const curStop = c.docked!;
        const d = c.dirs[curStop]!;
        const distDoor = Math.hypot(p.x - (c.x + d.x * LIFTS.tubeR), p.y - c.y, p.z - (c.z + d.z * LIFTS.tubeR));
        const inDoor = this.isPlayerInDoorway(i, curStop, p);
        if (playerInside || inDoor || distDoor < 2.8) {
          c.openIdleTimer = 0;
        } else {
          c.openIdleTimer += safeDt;
          if (c.openIdleTimer >= LIFT_KINEMATICS.idleCloseSeconds) {
            c.pendingStop = null;
            c.state = 'closing';
          }
        }
      } else if (c.state === 'closing') {
        c.doorPhase = Math.max(0, c.doorPhase - safeDt / LIFT_KINEMATICS.doorSeconds);
        c.doorOpen01 = smooth(c.doorPhase);
        if (c.doorPhase <= 0) {
          c.doorOpen01 = 0;
          if (c.pendingStop !== null && c.pendingStop !== c.docked) {
            this.beginMove(c, c.pendingStop);
          } else {
            c.pendingStop = null;
            c.state = 'idle';
          }
        }
      } else if (c.state === 'moving') {
        const ty = LIFT_STOPS[c.targetStop]!;
        const rem = Math.abs(ty - c.y);
        const dirSign = Math.sign(ty - c.y);
        const want = Math.max(LIFT_KINEMATICS.minSpeed, Math.min(LIFT_KINEMATICS.vmax, Math.sqrt(2 * LIFT_KINEMATICS.accel * rem)));
        c.speed = c.speed < want ? Math.min(want, c.speed + LIFT_KINEMATICS.accel * safeDt) : want;
        const move = Math.min(rem, c.speed * safeDt);
        c.y += dirSign * move;
        c.signedSpeed = move > 0 ? dirSign * c.speed : 0;

        // Smoothly rotate the cabin doorway to align with the destination stop
        const span = Math.abs(ty - c.startY);
        const prog = span > 1e-4 ? Math.min(1, Math.max(0, Math.abs(c.y - c.startY) / span)) : 1;
        c.doorAngle = c.startAngle + wrapAngleDelta(c.startAngle, c.targetAngle) * smooth(prog);

        if (rem - move < 1e-4) {
          c.y = ty;
          c.speed = 0;
          c.signedSpeed = 0;
          c.doorAngle = c.targetAngle;
          c.docked = c.targetStop;
          if (c.openOnArrival) {
            c.state = 'opening';
            c.openIdleTimer = 0;
          } else {
            c.state = 'idle';
          }
          c.isGhost = false;
          c.ghostTimer = this.nextGhostDelay();

          if (c.queuedStop !== null) {
            const q = c.queuedStop;
            c.queuedStop = null;
            if (q !== c.docked) {
              c.pendingStop = q;
              c.openOnArrival = true;
              if (c.state === 'idle') this.beginMove(c, q);
            } else if (c.state === 'idle') {
              c.state = 'opening';
            }
          }
        }
      } else {
        // idle (docked, doors closed)
        c.signedSpeed = 0;
        c.doorOpen01 = 0;
        const inDoor = c.docked !== null && this.isPlayerInDoorway(i, c.docked, p);
        const clearForGhost = !playerInside && !inDoor && (playerInOther || !this.nearAnyDoor(c, p, LIFT_KINEMATICS.ghostClearDist));
        if (clearForGhost) {
          c.ghostTimer -= safeDt;
          if (c.ghostTimer <= 0) {
            const dest = this.pickGhostDestination(c, p.y);
            c.isGhost = true;
            c.openOnArrival = false;
            this.beginMove(c, dest);
          }
        }
      }

      c.carry.y = c.y - prevY;
      c.floorRegion.y = c.y;
    }
  }

  /**
   * Fixed-camera preset staging only (`?cam=lift` / `?cam=twin`). Never called in normal interactive play.
   * Places the glass capsules mid-descent so fixed-camera screenshots and perf benchmarks are deterministic.
   */
  stageForPreset(preset: string | null): void {
    if (preset === 'lift') {
      const c0 = this.cabins[0]!, c1 = this.cabins[1]!;
      c0.y = -39.5; c0.docked = null; c0.state = 'moving'; c0.targetStop = 1; c0.doorAngle = 0; c0.doorOpen01 = 0; c0.signedSpeed = -2.5;
      c0.floorRegion.y = c0.y;
      c1.y = -48.5; c1.docked = null; c1.state = 'moving'; c1.targetStop = 0; c1.doorAngle = 0; c1.doorOpen01 = 0; c1.signedSpeed = 2.5;
      c1.floorRegion.y = c1.y;
      this.frozen = true;
    } else if (preset === 'twin') {
      const c0 = this.cabins[0]!, c1 = this.cabins[1]!;
      c0.y = -52.5; c0.docked = null; c0.state = 'moving'; c0.targetStop = 1; c0.doorAngle = 0; c0.doorOpen01 = 0; c0.signedSpeed = -2.5;
      c0.floorRegion.y = c0.y;
      c1.y = -50.8; c1.docked = null; c1.state = 'moving'; c1.targetStop = 0; c1.doorAngle = 0; c1.doorOpen01 = 0; c1.signedSpeed = 2.5;
      c1.floorRegion.y = c1.y;
      this.frozen = true;
    }
  }

  regions(): readonly Region[] {
    return this.allRegions;
  }
}

export function createLifts(opts?: { seed?: number; initialStops?: readonly [LiftStop, LiftStop] }): LiftsController {
  return new LiftsController(opts);
}

export const lifts = createLifts({ seed: 7 });
