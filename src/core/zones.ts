import { ZONES } from '../layoutMetro';

/** smoothstep from a (0) to b (1); works for a > b (depth going down). */
function ramp(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/** 0 = surface look, 1 = deep look, from the camera eye height. */
export const lookFactor = (y: number): number => ramp(ZONES.lookTopY, ZONES.lookBottomY, y);
/** Sun intensity weights; both are 0 across the airlock band so the swap is never visible. */
export const sunWeights = (y: number): { surface: number; deep: number } => ({
  surface: 1 - ramp(ZONES.surfaceSunFade[0], ZONES.surfaceSunFade[1], y),
  deep: ramp(ZONES.deepSunFade[0], ZONES.deepSunFade[1], y),
});

export type Zone = 'surface' | 'deep';
/** Which world is drawn. Hysteresis ±ZONES.hysteresis around ZONES.switchY. */
export class Airlock {
  zone: Zone;
  constructor(y: number) {
    this.zone = y < ZONES.switchY ? 'deep' : 'surface';
  }
  /** Returns true when the zone changed. */
  update(y: number): boolean {
    const next: Zone = this.zone === 'surface'
      ? (y < ZONES.switchY - ZONES.hysteresis ? 'deep' : 'surface')
      : (y > ZONES.switchY + ZONES.hysteresis ? 'surface' : 'deep');
    const changed = next !== this.zone;
    this.zone = next;
    return changed;
  }
}
