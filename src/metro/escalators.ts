import { ESCALATOR, escalatorUnits, type EscalatorUnit } from '../layoutMetro';

/** Escalator speeds (Task 4 adds sensing in `update`). Velocity is signed along the unit's axis. */
export class Escalators {
  readonly units: readonly EscalatorUnit[] = escalatorUnits();
  protected readonly speeds = new Float64Array(this.units.length).fill(ESCALATOR.idleSpeed);
  protected readonly index = new Map(this.units.map((u, i) => [u.id, i] as const));
  speed(id: string): number {
    const i = this.index.get(id);
    return i === undefined ? 0 : (this.speeds[i] ?? 0);
  }
  velocity(id: string): number {
    const i = this.index.get(id);
    const u = i === undefined ? undefined : this.units[i];
    return u ? this.speed(id) * u.sign : 0;
  }
}
export const escalators = new Escalators();
