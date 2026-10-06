import { PLAYER } from '../layout';
import { DISC, GANGWAY, OCULUS, VESPER } from '../layoutMetro';
import { boundsOf, circleShape, type Region } from '../player/regions';

export type DiscEnd = 'top' | 'bottom';
const C = PLAYER.wallClearance;
const LEVEL = 0.6;
const endY = (e: DiscEnd): number => (e === 'top' ? DISC.topY : DISC.bottomY);
/** Gate points on the gangway rims (south of the axis): hall curb and Crossing-floor well. */
const GATE_Z: Record<DiscEnd, number> = { top: OCULUS.cz - OCULUS.curbOuterR - C, bottom: OCULUS.cz - DISC.wellR - C };

/**
 * The Sinking Floor (spec §2.4). Docked at the top at boot. Occupied for DISC.departDelay s => travels to the other end.
 * Unoccupied and the player waits near the other end's gate => travels there empty. Trapezoid speed profile.
 * Real time (not train timescale). Gangways are connectors open only while docked at their end.
 */
export class DiscMover {
  y: number = DISC.topY;
  docked: DiscEnd | null = 'top';
  private target: DiscEnd = 'top';
  private speed = 0;
  private occupiedFor = 0;
  /** A rider who arrived must step off and on again to ride back: departure by occupancy needs `armed`. */
  private armed = true;
  readonly carry = { x: 0, y: 0, z: 0 };
  private cache: Region[] = [];

  constructor() {
    this.rebuild();
  }

  gateOpen(end: DiscEnd): boolean {
    return this.docked === end;
  }

  private onDisc(p: { x: number; y: number; z: number }): boolean {
    return Math.hypot(p.x - OCULUS.cx, p.z - OCULUS.cz) <= DISC.r - C + 1e-6 && Math.abs(p.y - this.y) <= LEVEL;
  }

  private nearGate(end: DiscEnd, p: { x: number; y: number; z: number }): boolean {
    return Math.abs(p.y - endY(end)) <= 1 && Math.hypot(p.x - OCULUS.cx, p.z - GATE_Z[end]) <= DISC.callRadius;
  }

  private depart(to: DiscEnd): void {
    this.docked = null;
    this.target = to;
    this.occupiedFor = 0;
  }

  update(dt: number, p: { x: number; y: number; z: number }): void {
    const prevY = this.y;
    if (this.docked) {
      const other: DiscEnd = this.docked === 'top' ? 'bottom' : 'top';
      const on = this.onDisc(p);
      if (!on) this.armed = true;
      this.occupiedFor = on && this.armed ? this.occupiedFor + dt : 0;
      if (this.occupiedFor >= DISC.departDelay) this.depart(other);
      else if (!on && this.nearGate(other, p)) this.depart(other);
    } else {
      const ty = endY(this.target);
      const rem = Math.abs(ty - this.y);
      const want = Math.max(DISC.minSpeed, Math.min(DISC.vmax, Math.sqrt(2 * DISC.accel * rem)));
      this.speed = this.speed < want ? Math.min(want, this.speed + DISC.accel * dt) : want;
      const move = Math.min(rem, this.speed * dt);
      this.y += Math.sign(ty - this.y) * move;
      if (rem - move < 1e-4) {
        this.y = ty;
        this.speed = 0;
        this.docked = this.target;
        this.armed = !this.onDisc(p);
        this.occupiedFor = 0;
      }
    }
    this.carry.y = this.y - prevY;
    this.rebuild();
  }

  private rebuild(): void {
    const floor = circleShape(OCULUS.cx, OCULUS.cz, DISC.r - C);
    const w = GANGWAY.halfWidth - C;
    const reach = OCULUS.cz - (DISC.r - C) + 0.5; // overlaps the disc floor
    this.cache = [
      { ...boundsOf(floor), y: this.y, circle: floor, carry: this.carry },
      { xMin: -w, xMax: w, zMin: GATE_Z.top - 0.2, zMax: reach, y: DISC.topY, when: () => this.docked === 'top' },
      { xMin: -w, xMax: w, zMin: GATE_Z.bottom - 0.2, zMax: reach, y: VESPER.topY, when: () => this.docked === 'bottom' },
    ];
  }

  regions(): readonly Region[] {
    return this.cache;
  }
}
export const disc = new DiscMover();
