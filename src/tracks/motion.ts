/**
 * Motion profile: analytic, C2 (zero jerk at plateau joins), piecewise "ramp / hold" velocity profile along a route.
 * A ramp between speeds va -> vb is a smootherstep in time (mean accel `A_MEAN`, peak 1.875 x that), covering
 * (va + vb) * T / 2 metres in T = |vb - va| / A_MEAN seconds. Holds are constant speed. Pure math.
 */
export const A_MEAN = 0.5; // m/s^2 (peak 0.94)

const sstep = (u: number): number => u * u * u * (10 + u * (-15 + 6 * u));
const sstepInt = (u: number): number => u ** 4 * (2.5 + u * (-3 + u));

export interface Phase {
  t0: number;
  dur: number;
  u0: number;
  v0: number;
  v1: number;
  /** distance covered */
  du: number;
  /** true = smootherstep ramp, false = hold at v0 */
  ramp: boolean;
}

export interface LimitInterval {
  u0: number;
  u1: number;
  v: number;
}

export class Profile {
  readonly phases: Phase[] = [];
  readonly duration: number;
  readonly uEnd: number;
  readonly uStart: number;
  constructor(phases: Phase[]) {
    this.phases = phases;
    const last = phases[phases.length - 1]!;
    this.duration = last.t0 + last.dur;
    this.uEnd = last.u0 + last.du;
    this.uStart = phases[0]!.u0;
  }
  private idx(t: number): number {
    const p = this.phases;
    let lo = 0;
    let hi = p.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (p[mid]!.t0 <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  /** [u, v] at time t (clamped to the profile; after the end: stopped at uEnd with the final speed held). */
  at(t: number): [number, number] {
    if (t <= 0) return [this.uStart, this.phases[0]!.v0];
    if (t >= this.duration) {
      const l = this.phases[this.phases.length - 1]!;
      const vEnd = l.v1;
      return [this.uEnd + vEnd * (t - this.duration), vEnd];
    }
    const ph = this.phases[this.idx(t)]!;
    const tau = t - ph.t0;
    if (!ph.ramp) return [ph.u0 + ph.v0 * tau, ph.v0];
    const x = tau / ph.dur;
    return [ph.u0 + ph.v0 * tau + (ph.v1 - ph.v0) * ph.dur * sstepInt(x), ph.v0 + (ph.v1 - ph.v0) * sstep(x)];
  }
  /** Time at which the profile reaches route distance u (monotone). */
  timeAtU(u: number): number {
    if (u <= this.uStart) return 0;
    if (u >= this.uEnd) return this.duration;
    let lo = 0;
    let hi = this.duration;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (this.at(mid)[0] < u) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  /** Start time of the final ramp to rest (for 'brake' phase), or the duration if the profile does not end at rest. */
  finalBrakeStart(): number {
    const l = this.phases[this.phases.length - 1]!;
    if (l.ramp && l.v1 === 0) return l.t0;
    return this.duration;
  }
  /** Duration of the first ramp when starting from rest (for 'accel'), else 0. */
  firstRampEnd(): number {
    const f = this.phases[0]!;
    return f.ramp ? f.dur : 0;
  }
}

/**
 * Build a profile from leader position uStart (speed v0) to uEnd (speed vEnd, 0 = stop) with a limit function given as
 * intervals (leader positions; already extended by the train length where the whole train must obey them).
 * `cruise` caps everything.
 */
export function buildProfile(uStart: number, v0: number, uEnd: number, vEnd: number, cruise: number, limits: LimitInterval[]): Profile {
  // boundaries
  const bset = new Set<number>([uStart, uEnd]);
  for (const l of limits) {
    if (l.u0 > uStart && l.u0 < uEnd) bset.add(l.u0);
    if (l.u1 > uStart && l.u1 < uEnd) bset.add(l.u1);
  }
  const b = [...bset].sort((x, y) => x - y);
  const n = b.length - 1;
  const lim: number[] = [];
  for (let i = 0; i < n; i++) {
    const mid = (b[i]! + b[i + 1]!) / 2;
    let v = cruise;
    for (const l of limits) if (mid >= l.u0 && mid < l.u1) v = Math.min(v, l.v);
    lim.push(v);
  }
  const V: number[] = new Array(n + 1).fill(0);
  V[0] = Math.min(v0, lim[0]!);
  for (let j = 1; j < n; j++) V[j] = Math.min(lim[j - 1]!, lim[j]!);
  V[n] = Math.min(vEnd, lim[n - 1]!);
  // forward / backward accel-limited passes
  for (let j = 0; j < n; j++) V[j + 1] = Math.min(V[j + 1]!, Math.sqrt(V[j]! ** 2 + 2 * A_MEAN * (b[j + 1]! - b[j]!)));
  for (let j = n - 1; j >= 0; j--) V[j] = Math.min(V[j]!, Math.sqrt(V[j + 1]! ** 2 + 2 * A_MEAN * (b[j + 1]! - b[j]!)));
  if (v0 > V[0]! + 1e-9) V[0] = v0; // starting faster than allowed: keep (caller's problem)
  const phases: Phase[] = [];
  let t = 0;
  const push = (u0: number, va: number, vb: number, du: number, ramp: boolean): void => {
    if (du <= 1e-9) return;
    const dur = ramp ? (2 * du) / (va + vb) : du / va;
    phases.push({ t0: t, dur, u0, v0: va, v1: vb, du, ramp });
    t += dur;
  };
  for (let i = 0; i < n; i++) {
    const len = b[i + 1]! - b[i]!;
    const vin = V[i]!;
    const vout = V[i + 1]!;
    let peak = Math.max(vin, vout, Math.min(lim[i]!, Math.sqrt((2 * A_MEAN * len + vin * vin + vout * vout) / 2)));
    // no pointless overshoot-and-settle: a bump of < 0.5 m/s above the larger end speed is flattened into the hold
    if (peak - Math.max(vin, vout) < 0.5) peak = Math.max(vin, vout);
    const d1 = Math.abs(peak * peak - vin * vin) / (2 * A_MEAN);
    const d2 = Math.abs(peak * peak - vout * vout) / (2 * A_MEAN);
    const hold = Math.max(0, len - d1 - d2);
    let u = b[i]!;
    if (vin !== peak) {
      push(u, vin, peak, d1, true);
      u += d1;
    }
    if (hold > 1e-9) {
      push(u, peak, peak, hold, false);
      u += hold;
    }
    if (vout !== peak) push(u, peak, vout, d2, true);
    else if (hold <= 1e-9 && vin === peak) push(u, peak, peak, len, false);
  }
  if (phases.length === 0) phases.push({ t0: 0, dur: 0.001, u0: uStart, v0, v1: v0, du: 0.001 * Math.max(v0, 0.001), ramp: false });
  return new Profile(phases);
}
