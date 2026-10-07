import { ESCALATOR, ESCALATOR_VIS, escalatorUnits, type EscalatorUnit } from '../layoutMetro';

/** Escalator speeds with proximity sensing. Velocity is signed along the unit's axis. */
export class Escalators {
  readonly units: readonly EscalatorUnit[] = escalatorUnits();
  protected readonly speeds = new Float64Array(this.units.length).fill(ESCALATOR.idleSpeed);
  /** Per-unit step phase (metres of chain travel modulo the step pitch, along the from->to path). Real-time, survives hidden frames; read by the step shader. */
  readonly phase = new Float32Array(escalatorUnits().length);
  protected readonly travel = new Float64Array(this.phase.length);
  protected readonly index = new Map(this.units.map((u, i) => [u.id, i] as const));
  speed(id: string): number {
    const i = this.index.get(id);
    return i === undefined ? 0 : (this.speeds[i] ?? 0);
  }
  /** Sensing: units within `senseRadius` of the player (3D, to the step line) run at active speed, others idle. */
  update(dt: number, p: { x: number; y: number; z: number }): void {
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      const want = distToUnit(u, p) <= ESCALATOR.senseRadius ? ESCALATOR.activeSpeed : ESCALATOR.idleSpeed;
      const s = this.speeds[i] ?? ESCALATOR.idleSpeed;
      const step = ESCALATOR.accel * dt;
      const next = s < want ? Math.min(want, s + step) : Math.max(want, s - step);
      this.speeds[i] = next;
      // path rate (from -> to) = speed * sign * sign(to - from): down units run +speed, up units -speed
      const pitch = ESCALATOR_VIS.pitch;
      const t = (this.travel[i]! + ((s + next) / 2) * u.sign * (Math.sign(u.to - u.from) || 1) * dt) % pitch;
      this.travel[i] = t < 0 ? t + pitch : t;
      this.phase[i] = this.travel[i]!;
    }
  }
  velocity(id: string): number {
    const i = this.index.get(id);
    const u = i === undefined ? undefined : this.units[i];
    return u ? this.speed(id) * u.sign : 0;
  }
}
/** Distance from p to the unit's step line (segment from the upper end to the lower end). */
function distToUnit(u: EscalatorUnit, p: { x: number; y: number; z: number }): number {
  const a = u.axis === 'z' ? [u.across, u.yFrom, u.from] : [u.from, u.yFrom, u.across];
  const b = u.axis === 'z' ? [u.across, u.yTo, u.to] : [u.to, u.yTo, u.across];
  const d = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const w = [p.x - a[0]!, p.y - a[1]!, p.z - a[2]!];
  const t = Math.min(1, Math.max(0, (w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!) / (d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2)));
  return Math.hypot(w[0]! - d[0]! * t, w[1]! - d[1]! * t, w[2]! - d[2]! * t);
}

export const escalators = new Escalators();
