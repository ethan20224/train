import type { QualityState, QualityTier } from './types';

/**
 * Adaptive quality controller (spec section 4).
 *
 * A ladder of rungs trades pixel ratio (always within [0.85, 1.5]) and two feature toggles
 * (AO resolution, planar floor reflection). Frame time is averaged over 2 s windows.
 *  - Over budget (> 20 ms avg, i.e. < 50 fps): step DOWN one rung.
 *  - Comfortably within budget (<= 17.6 ms avg, i.e. >= ~57 fps) for 3 consecutive windows, and at least
 *    10 s since the last change: step UP one rung.
 *  - Anti-oscillation: if a step UP is followed by a step DOWN within 12 s, that rung is banned from
 *    upgrades for 60 s (exponentially longer on repeats).
 * Because rAF is vsync-capped (~16.7 ms at 60 Hz) real headroom can't be measured; "at the cap" is
 * treated as headroom, and the ban logic corrects any over-optimism.
 * `?q=low|med|high` pins a rung and disables adaptation.
 */

export const PIXEL_RATIO_MIN = 0.85;
export const PIXEL_RATIO_MAX = 1.5;

interface Rung {
  readonly pixelRatio: number;
  readonly planarReflections: boolean;
  readonly aoHalfRes: boolean;
}

/** Best (0) to cheapest. */
const LADDER: readonly Rung[] = [
  { pixelRatio: 1.5, planarReflections: true, aoHalfRes: false },
  { pixelRatio: 1.35, planarReflections: true, aoHalfRes: false },
  { pixelRatio: 1.2, planarReflections: true, aoHalfRes: false },
  { pixelRatio: 1.1, planarReflections: true, aoHalfRes: true },
  { pixelRatio: 1.0, planarReflections: true, aoHalfRes: true },
  { pixelRatio: 0.95, planarReflections: false, aoHalfRes: true },
  { pixelRatio: 0.9, planarReflections: false, aoHalfRes: true },
  { pixelRatio: 0.85, planarReflections: false, aoHalfRes: true },
];

const TIER_RUNG: Record<Exclude<QualityTier, 'auto'>, number> = { high: 0, med: 4, low: LADDER.length - 1 };
/** Adaptive start: middle of the ladder so a slow GPU recovers fast and a fast one climbs. */
const START_RUNG = 3;

const WINDOW_S = 2;
const DOWN_MS = 20;
const UP_MS = 17.6;
const UP_WINDOWS_REQUIRED = 3;
const MIN_SECONDS_BETWEEN_CHANGES = 10;
const FAST_REGRESSION_S = 12;
const WARMUP_S = 3;
/** Frames longer than this are tab-switch / shader-compile hitches, not load. */
const HITCH_MS = 250;

export function parseQualityTier(search: string): QualityTier {
  const q = new URLSearchParams(search).get('q');
  return q === 'low' || q === 'med' || q === 'high' ? q : 'auto';
}

export class QualityController {
  readonly state: QualityState;
  private readonly listeners: Array<(s: QualityState) => void> = [];

  private elapsed = 0;
  private windowTime = 0;
  private windowSum = 0;
  private windowFrames = 0;
  private goodWindows = 0;
  private lastChangeAt = -Infinity;
  private lastUpAt = -Infinity;
  /** rung index -> time (s) until which upgrading INTO that rung is banned. */
  private readonly banUntil = new Map<number, number>();
  private banCount = new Map<number, number>();

  constructor(tier: QualityTier) {
    const level = tier === 'auto' ? START_RUNG : TIER_RUNG[tier];
    this.state = {
      tier,
      fixed: tier !== 'auto',
      level,
      pixelRatio: 1,
      planarReflections: true,
      aoHalfRes: false,
      version: 0,
    };
    this.apply(level);
  }

  /** Called whenever any quality field changes (and once by `emit()` at startup). */
  onChange(fn: (s: QualityState) => void): void {
    this.listeners.push(fn);
  }

  emit(): void {
    for (const l of this.listeners) l(this.state);
  }

  /** Feed one frame (real, UNclamped frame time in seconds). */
  sample(frameSeconds: number): void {
    this.elapsed += frameSeconds;
    if (this.state.fixed || this.elapsed < WARMUP_S) return;
    const ms = frameSeconds * 1000;
    if (ms > HITCH_MS) return;

    this.windowTime += frameSeconds;
    this.windowSum += ms;
    this.windowFrames++;
    if (this.windowTime < WINDOW_S) return;

    const avg = this.windowSum / this.windowFrames;
    this.windowTime = this.windowSum = this.windowFrames = 0;
    this.evaluate(avg);
  }

  private evaluate(avgMs: number): void {
    const level = this.state.level;
    if (avgMs > DOWN_MS) {
      this.goodWindows = 0;
      if (level < LADDER.length - 1) {
        // A downgrade soon after an upgrade means the upgraded rung is too heavy: ban it.
        if (this.elapsed - this.lastUpAt < FAST_REGRESSION_S) {
          const n = (this.banCount.get(level) ?? 0) + 1;
          this.banCount.set(level, n);
          this.banUntil.set(level, this.elapsed + 60 * 2 ** (n - 1));
        }
        this.change(level + 1);
      }
      return;
    }
    if (avgMs <= UP_MS) {
      this.goodWindows++;
      if (
        this.goodWindows >= UP_WINDOWS_REQUIRED &&
        level > 0 &&
        this.elapsed - this.lastChangeAt >= MIN_SECONDS_BETWEEN_CHANGES &&
        (this.banUntil.get(level - 1) ?? 0) <= this.elapsed
      ) {
        this.lastUpAt = this.elapsed;
        this.change(level - 1);
      }
    } else {
      this.goodWindows = 0;
    }
  }

  private change(level: number): void {
    this.goodWindows = 0;
    this.lastChangeAt = this.elapsed;
    this.apply(level);
    this.emit();
  }

  private apply(level: number): void {
    const r = LADDER[level];
    if (!r) throw new Error(`quality: invalid rung ${level}`);
    const s = this.state;
    s.level = level;
    s.pixelRatio = Math.min(PIXEL_RATIO_MAX, Math.max(PIXEL_RATIO_MIN, r.pixelRatio));
    s.planarReflections = r.planarReflections;
    s.aoHalfRes = r.aoHalfRes;
    s.version++;
  }
}
