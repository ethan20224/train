import { PLAYER } from '../layout';
import { FUNICULAR } from '../layoutMetro';
import type { Region } from '../player/regions';

/**
 * Inclined glass funicular (spec §2.6, P3-8b, Ruling 37):
 * Level 4.0 x 2.4 m cabin on an inclined ~50.7 deg rack rail running between the east Threshold top station (-30)
 * and the Crossing floor east station (-70). Mirrors the Sinking Floor disc pattern:
 * - Approach either end when the cabin is away -> cabin closes doors and comes to fetch you.
 * - Board from either long side (±z), wait 2 s occupied -> doors & station gates close -> travels along the incline.
 * - Disarms on arrival so the rider steps off and back on to return.
 * Pure logic (no three.js, no DOM) so Node tests import it directly.
 */

export type FunicularEnd = 'top' | 'bottom';
export type FunicularState = 'docked' | 'closing' | 'moving' | 'opening';

const C = PLAYER.wallClearance;
const LEVEL = 0.6;
const TOP_X = FUNICULAR.top[0];
const TOP_Y = FUNICULAR.top[1];
const BOT_X = FUNICULAR.bottom[0];
const BOT_Y = FUNICULAR.bottom[1];
const RUN_X = BOT_X - TOP_X;
const DROP_Y = BOT_Y - TOP_Y; // -40
const INCLINE_LEN = Math.hypot(RUN_X, DROP_Y);
const HALF_W = FUNICULAR.cabinWidth / 2;

const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

const endX = (e: FunicularEnd): number => (e === 'top' ? TOP_X : BOT_X);
const endY = (e: FunicularEnd): number => (e === 'top' ? TOP_Y : BOT_Y);
const endS = (e: FunicularEnd): number => (e === 'top' ? 0 : INCLINE_LEN);

export interface FunicularSnapshot {
  readonly x: number; // cabin west edge
  readonly y: number; // cabin floor elevation
  readonly z: number; // cabin centre z
  readonly progress: number; // 0 = top, 1 = bottom
  readonly docked: FunicularEnd | null;
  readonly state: FunicularState;
  readonly doorOpen01: number;
  readonly speed: number; // signed speed along incline (+ toward bottom, - toward top)
}

interface MutableRectRegion {
  xMin: number; xMax: number; zMin: number; zMax: number;
  y: number;
  when?: () => boolean;
  carry?: { x: number; y: number; z: number };
}

export class FunicularMover {
  /** Distance along the incline from top stop (0 .. INCLINE_LEN). */
  private s: number;
  /** Cabin west-edge x and floor height y. */
  x: number;
  y: number;
  docked: FunicularEnd | null;
  state: FunicularState;
  private target: FunicularEnd;
  private speed = 0;
  private signedSpeed = 0;
  private doorPhase = 1;
  doorOpen01 = 1;
  private occupiedFor = 0;
  private armed = true;
  private frozen = false;
  readonly carry = { x: 0, y: 0, z: 0 };
  private readonly floorRegion: MutableRectRegion;
  private readonly allRegions: Region[];

  constructor(initialEnd: FunicularEnd = 'bottom') {
    this.docked = initialEnd;
    this.target = initialEnd;
    this.state = 'docked';
    this.s = endS(initialEnd);
    this.x = endX(initialEnd);
    this.y = endY(initialEnd);
    this.doorPhase = 1;
    this.doorOpen01 = 1;

    this.floorRegion = {
      xMin: this.x + C,
      xMax: this.x + FUNICULAR.cabinLength - C,
      zMin: FUNICULAR.z - HALF_W + C,
      zMax: FUNICULAR.z + HALF_W - C,
      y: this.y,
      carry: this.carry,
    };

    // Doorway connectors on both long sides (±z) at both stops, open ONLY when docked with doors open.
    const connectors: Region[] = [];
    const doorHalfX = 1.05; // 2.1 m clear doorway centred along the 4 m cabin (walkable corridor 1.3 m after C)
    const doorCorridorHalf = doorHalfX - C;
    const zSouthLanding = FUNICULAR.pit.zMin - C - 0.15;
    const zSouthCabin = FUNICULAR.z - HALF_W + C + 0.35;
    const zNorthCabin = FUNICULAR.z + HALF_W - C - 0.35;
    const zNorthLanding = FUNICULAR.pit.zMax + C + 0.15;

    for (const end of ['top', 'bottom'] as const) {
      const cx = endX(end) + FUNICULAR.cabinLength / 2;
      const ey = endY(end);
      connectors.push(
        { xMin: cx - doorCorridorHalf, xMax: cx + doorCorridorHalf, zMin: zSouthLanding, zMax: zSouthCabin, y: ey, when: () => this.gateOpen(end) },
        { xMin: cx - doorCorridorHalf, xMax: cx + doorCorridorHalf, zMin: zNorthCabin, zMax: zNorthLanding, y: ey, when: () => this.gateOpen(end) },
      );
    }
    this.allRegions = [this.floorRegion as Region, ...connectors];
  }

  /** True when the station gates and cabin doors at `end` are fully open for walking through. */
  gateOpen(end: FunicularEnd): boolean {
    return this.docked === end && this.state === 'docked' && this.doorOpen01 >= 0.85;
  }

  /** Smooth 0..1 opening of station sliding gates at `end` (strictly 0 unless docked at `end`). */
  stationGateOpen01(end: FunicularEnd): number {
    return this.docked === end ? this.doorOpen01 : 0;
  }

  private onCabin(p: { x: number; y: number; z: number }): boolean {
    return (
      p.x >= this.x + C - 1e-6 &&
      p.x <= this.x + FUNICULAR.cabinLength - C + 1e-6 &&
      p.z >= FUNICULAR.z - HALF_W + C - 1e-6 &&
      p.z <= FUNICULAR.z + HALF_W - C + 1e-6 &&
      Math.abs(p.y - this.y) <= LEVEL
    );
  }

  private nearStation(end: FunicularEnd, p: { x: number; y: number; z: number }): boolean {
    const cx = endX(end) + FUNICULAR.cabinLength / 2;
    return Math.abs(p.y - endY(end)) <= 1.0 && Math.hypot(p.x - cx, p.z - FUNICULAR.z) <= FUNICULAR.callRadius;
  }

  private startClosingTo(to: FunicularEnd): void {
    this.target = to;
    this.occupiedFor = 0;
    this.state = 'closing';
  }

  snapshot(): FunicularSnapshot {
    return {
      x: this.x,
      y: this.y,
      z: FUNICULAR.z,
      progress: this.s / INCLINE_LEN,
      docked: this.docked,
      state: this.state,
      doorOpen01: this.doorOpen01,
      speed: this.signedSpeed,
    };
  }

  update(dt: number, p: { x: number; y: number; z: number }): void {
    if (this.frozen) {
      this.carry.x = 0;
      this.carry.y = 0;
      return;
    }
    const safeDt = Math.max(0, dt);
    const prevX = this.x;
    const prevY = this.y;

    if (this.state === 'docked') {
      const cur = this.docked!;
      const other: FunicularEnd = cur === 'top' ? 'bottom' : 'top';
      const on = this.onCabin(p);
      if (!on) this.armed = true;
      this.occupiedFor = on && this.armed ? this.occupiedFor + safeDt : 0;
      this.doorPhase = 1;
      this.doorOpen01 = 1;
      this.signedSpeed = 0;
      if (this.occupiedFor >= FUNICULAR.departDelay) {
        this.startClosingTo(other);
      } else if (!on && this.nearStation(other, p)) {
        this.startClosingTo(other);
      }
    } else if (this.state === 'closing') {
      this.signedSpeed = 0;
      this.doorPhase = Math.max(0, this.doorPhase - safeDt / FUNICULAR.doorSeconds);
      this.doorOpen01 = smooth(this.doorPhase);
      if (this.doorPhase <= 0) {
        this.doorOpen01 = 0;
        this.docked = null;
        this.state = 'moving';
        this.speed = 0;
      }
    } else if (this.state === 'moving') {
      const ts = endS(this.target);
      const rem = Math.abs(ts - this.s);
      const dirSign = Math.sign(ts - this.s);
      const want = Math.max(FUNICULAR.minSpeed, Math.min(FUNICULAR.vmax, Math.sqrt(2 * FUNICULAR.accel * rem)));
      this.speed = this.speed < want ? Math.min(want, this.speed + FUNICULAR.accel * safeDt) : want;
      const move = Math.min(rem, this.speed * safeDt);
      this.s += dirSign * move;
      this.signedSpeed = move > 0 ? dirSign * this.speed : 0;
      if (rem - move < 1e-4) {
        this.s = ts;
        this.speed = 0;
        this.signedSpeed = 0;
        this.docked = this.target;
        this.state = 'opening';
        this.doorPhase = 0;
        this.doorOpen01 = 0;
      }
      const prog = this.s / INCLINE_LEN;
      this.x = TOP_X + RUN_X * prog;
      this.y = TOP_Y + DROP_Y * prog;
      if (this.state === 'opening') {
        this.armed = !this.onCabin(p);
        this.occupiedFor = 0;
      }
    } else {
      // opening
      this.signedSpeed = 0;
      this.doorPhase = Math.min(1, this.doorPhase + safeDt / FUNICULAR.doorSeconds);
      this.doorOpen01 = smooth(this.doorPhase);
      if (this.doorPhase >= 1) {
        this.doorOpen01 = 1;
        this.state = 'docked';
      }
    }

    this.carry.x = this.x - prevX;
    this.carry.y = this.y - prevY;
    this.floorRegion.xMin = this.x + C;
    this.floorRegion.xMax = this.x + FUNICULAR.cabinLength - C;
    this.floorRegion.y = this.y;
  }

  /** Fixed-camera preset staging only (`?cam=funicular`). Places the cabin gliding down out of the sky slot toward the Crossing station. */
  stageForPreset(preset: string | null): void {
    if (preset !== 'funicular') return;
    const prog = 0.48;
    this.s = prog * INCLINE_LEN;
    this.x = TOP_X + RUN_X * prog;
    this.y = TOP_Y + DROP_Y * prog;
    this.docked = null;
    this.state = 'moving';
    this.target = 'bottom';
    this.doorPhase = 0;
    this.doorOpen01 = 0;
    this.signedSpeed = FUNICULAR.vmax;
    this.floorRegion.xMin = this.x + C;
    this.floorRegion.xMax = this.x + FUNICULAR.cabinLength - C;
    this.floorRegion.y = this.y;
    this.frozen = true;
  }

  regions(): readonly Region[] {
    return this.allRegions;
  }
}

export function createFunicular(initialEnd: FunicularEnd = 'bottom'): FunicularMover {
  return new FunicularMover(initialEnd);
}

export const funicular = createFunicular('bottom');
