/**
 * Day / night for the buried sky (user ruling 2026-11-23): noon by default, N toggles to night and back. The change runs in
 * REAL time over DAY_NIGHT.transitionSec through a rich golden hour (sun sinking, warm low light, pink-gold clouds), then the
 * sun sets, the moon takes over the single directional light, stars, fireflies and glowing moss come up.
 * Pure state + curves (no three.js) so Node tests import it. `?night=1` / `?golden=1` start in that state (presets, shots).
 */

export const DAY_NIGHT = {
  transitionSec: 14,
  /** Sun elevation (deg) at noon and at the end of golden hour; azimuth stays the deep sun's SSE. */
  noonElevDeg: 70, lowElevDeg: 38,
  /** Moon: elevation/azimuth (deg, azimuth from +x toward +z) and light gain relative to the noon sun. */
  moonElevDeg: 58, moonAzDeg: 120, moonGain: 0.085,
  /** Cloud passes in front of the sun (day only): how much they dim it at most, and their tempo (cycles per second). */
  cloudDim: 0.42, cloudTempo: 0.018,
  /** State where the light swaps from the set sun to the moon (both gains are ~0 here, so the shadow refit is invisible). */
  swapAt: 0.67,
} as const;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function hash1(i: number): number {
  let h = Math.imul(i | 0, 374761393) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise1(x: number): number {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  return hash1(i) + (hash1(i + 1) - hash1(i)) * s;
}

export interface DayNightState {
  /** 0 = noon, 1 = full night (eased transition position). */
  readonly s: number;
  /** Golden-hour weight (peaks mid-transition). */
  readonly golden: number;
  /** Night weight (stars, moon, fireflies, glowing moss). */
  readonly night: number;
  /** Directional light: unit direction toward the source, colour, gain relative to DEEP_SUN.intensity. */
  readonly lightDir: readonly [number, number, number];
  readonly lightColor: readonly [number, number, number];
  readonly lightGain: number;
  /** True once the moon owns the light. */
  readonly moon: boolean;
  /** Sky/ambient/env multipliers and exposure gain (eye adaptation at night). */
  readonly ambientGain: number;
  readonly exposureGain: number;
  /** 0..1 how much a passing cloud covers the sun right now (sky shader thickens clouds at the sun by this). */
  readonly sunOcclusion: number;
}

const DEG = Math.PI / 180;
const AZ_SUN = Math.atan2(-Math.cos(Math.PI / 8), Math.sin(Math.PI / 8)); // the deep sun's SSE azimuth in (x, z)

/** Every derived quantity for transition position s at real time t (seconds). Pure. */
export function evaluateDayNight(s: number, t: number): DayNightState {
  const golden = smooth(0.12, 0.42, s) * (1 - smooth(0.52, 0.7, s));
  const night = smooth(0.62, 0.92, s);
  const moon = s >= DAY_NIGHT.swapAt;
  const cloud = smooth(0.52, 0.82, noise1(t * DAY_NIGHT.cloudTempo * 4)) * (1 - smooth(0.3, 0.55, s));
  let lightDir: [number, number, number], lightColor: [number, number, number], lightGain: number;
  if (!moon) {
    const elev = (DAY_NIGHT.noonElevDeg + (DAY_NIGHT.lowElevDeg - DAY_NIGHT.noonElevDeg) * smooth(0, 0.45, s)) * DEG;
    lightDir = [Math.cos(elev) * Math.cos(AZ_SUN), Math.sin(elev), Math.cos(elev) * Math.sin(AZ_SUN)];
    lightColor = [1.0, 0.97 - 0.36 * golden, 0.92 - 0.62 * golden];
    lightGain = (1 - smooth(0.5, 0.65, s)) * (1 - DAY_NIGHT.cloudDim * cloud) * (1 + 0.15 * golden);
  } else {
    const e = DAY_NIGHT.moonElevDeg * DEG, a = DAY_NIGHT.moonAzDeg * DEG;
    lightDir = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
    lightColor = [0.62, 0.74, 1.0];
    lightGain = DAY_NIGHT.moonGain * smooth(DAY_NIGHT.swapAt, 0.85, s);
  }
  return {
    s, golden, night, lightDir, lightColor, lightGain, moon,
    ambientGain: (1 - 0.86 * smooth(0.48, 0.85, s)) * (1 + 0.25 * golden),
    exposureGain: 1 + 0.55 * night,
    sunOcclusion: cloud,
  };
}

/** Real-time controller: owns the target, eases toward it. */
export class DayNight {
  private target = 0;
  private pos = 0;
  private time = 0;
  state: DayNightState = evaluateDayNight(0, 0);
  constructor(initial: 'day' | 'golden' | 'night' = 'day') {
    this.pos = initial === 'night' ? 1 : initial === 'golden' ? 0.4 : 0;
    this.target = initial === 'night' ? 1 : 0;
    if (initial === 'golden') this.target = 0.4;
    this.state = evaluateDayNight(this.pos, 0);
  }
  get isNightTarget(): boolean { return this.target >= 0.5; }
  /** Real seconds since boot (cloud drift, star twinkle). */
  get realTime(): number { return this.time; }
  toggle(): void { this.target = this.target >= 0.5 ? 0 : 1; }
  update(dt: number): DayNightState {
    this.time += dt;
    const step = dt / DAY_NIGHT.transitionSec;
    if (this.pos < this.target) this.pos = Math.min(this.target, this.pos + step);
    else if (this.pos > this.target) this.pos = Math.max(this.target, this.pos - step);
    this.state = evaluateDayNight(this.pos, this.time);
    return this.state;
  }
}

/** The single shared instance (read by the sky, forest and lighting). */
export const dayNight = new DayNight(
  typeof location !== 'undefined' && /[?&]night=1/.test(location.search) ? 'night'
    : typeof location !== 'undefined' && /[?&]golden=1/.test(location.search) ? 'golden' : 'day',
);
