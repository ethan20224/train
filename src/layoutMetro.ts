/**
 * Meridian Deep metro: world layout. SINGLE SOURCE OF TRUTH for every metro coordinate (spec §2).
 * Source: docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md. Units: metres, +Y up, +Z north, x < 0 west.
 * Dependency-free (no three.js) so Node tests import it.
 */
import type { Rect } from './layout';

const TAN30 = Math.tan(Math.PI / 6);
const run = (rise: number): number => rise / TAN30;

/** The oculus in the Grand Hall floor; the void, the disc and the sky hole share its vertical axis (cx, cz). */
export const OCULUS = {
  cx: 0, cz: 74,
  r: 9.0, curbOuterR: 9.6, curbHeight: 0.15,
  balustradeR: 9.3, balustradeHeight: 1.1,
  /** Underside of the hall floor slab. */
  slabUnderY: -1.5,
} as const;

/** Bell-shaped descent void about the oculus axis. */
export const VOID = {
  rTop: 9.0, yTop: -1.5, rWide: 20, yWide: -6, yBottom: -30,
  eras: [
    { id: 'stone', yTop: -1.5, yBottom: -10 },
    { id: 'strata', yTop: -10, yBottom: -22 },
    { id: 'polished', yTop: -22, yBottom: -30 },
  ] as const,
  lightRingPitch: 2.5,
} as const;

/** Void wall radius at height y: a carved dome flaring from the oculus to the drum (sine easing), then a cylinder. */
export function voidRadiusAt(y: number): number {
  if (y >= VOID.yTop) return VOID.rTop;
  if (y >= VOID.yWide) {
    const t = (VOID.yTop - y) / (VOID.yTop - VOID.yWide);
    return VOID.rTop + (VOID.rWide - VOID.rTop) * Math.sin((t * Math.PI) / 2);
  }
  return VOID.rWide;
}

type Band = readonly [number, number];
/** Across-axis (x) ranges of the escalator bands: each holds a down and an up unit (ESCALATOR.unitWidth each + 0.4 m deck). */
export const ESCALATOR_BANDS = {
  /** F2, F4, F5 and the Meridian/Vesper deck openings (MERIDIAN.f5OpeningX, navData holes). */
  inner: [[-7.8, -4.2], [4.2, 7.8]] as readonly Band[],
  /** F1, F3 and the hall-floor throats. */
  outer: [[-12, -8.4], [8.4, 12]] as readonly Band[],
} as const;
const INNER = ESCALATOR_BANDS.inner;
const OUTER = ESCALATOR_BANDS.outer;

/** Openings in the hall floor where F1 dives under the slab. */
export const THROAT = { bands: OUTER, zMin: 62.5, zMax: 69.3, domeSlotEndZ: 68.5 } as const;

export const ESCALATOR = {
  angleDeg: 30,
  /** Each band holds two units of this width, with a 0.4 m deck between them. */
  unitWidth: 1.6, stepWidth: 1.0, treadDepth: 0.4, handrailHeight: 1.0,
  idleSpeed: 0.2, activeSpeed: 0.65, accel: 0.5, senseRadius: 8,
  /** Walkable corridor half-width of the player's centre on a 1.0 m step (radius 0.35). */
  walkCorridorHalf: 0.15,
  /** Corridor regions extend this far past each end so they overlap the landings. */
  endOverlap: 0.6,
} as const;

export type FlightId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6';
export interface FlightDef {
  readonly id: FlightId;
  readonly axis: 'x' | 'z';
  /** Across-axis ranges; each band carries a down unit and an up unit. */
  readonly bands: readonly Band[];
  /** Axis coordinate of the upper end (yFrom) and the lower end (yTo). */
  readonly from: number;
  readonly to: number;
  readonly yFrom: number;
  readonly yTo: number;
}
/** z extent of F6 (and of its openings in the Vesper floor and the Halcyon hall): one 3.6 m band. */
const VESPER_F6_OPENING_Z: Band = [66, 69.6];
const Z0 = THROAT.zMin; // 62.5
const Z1 = Z0 + run(10); // 79.82
export const FLIGHTS: readonly FlightDef[] = [
  { id: 'F1', axis: 'z', bands: OUTER, from: Z0, to: Z1, yFrom: 0, yTo: -10 },
  { id: 'F2', axis: 'z', bands: INNER, from: Z1, to: Z0, yFrom: -10, yTo: -20 },
  { id: 'F3', axis: 'z', bands: OUTER, from: Z0, to: Z1, yFrom: -20, yTo: -30 },
  { id: 'F4', axis: 'z', bands: INNER, from: Z1, to: Z1 - run(16), yFrom: -30, yTo: -46 },
  { id: 'F5', axis: 'z', bands: INNER, from: 113.6, to: 113.6 - run(24), yFrom: -46, yTo: -70 },
  { id: 'F6', axis: 'x', bands: [VESPER_F6_OPENING_Z], from: -47, to: -47 + run(12), yFrom: -70, yTo: -82 },
];

/** z where F3 (whose low end sits over the Threshold deck) is 3.3 m above that deck: the Threshold annulus is open from here to F3's low end. */
export const F3_LOW_FOOTPRINT_Z0 = Z1 - 3.3 / Math.tan((ESCALATOR.angleDeg * Math.PI) / 180);

export interface EscalatorUnit {
  readonly id: string;
  readonly flight: FlightId;
  readonly axis: 'x' | 'z';
  /** Across-axis centre of the unit's steps. */
  readonly across: number;
  readonly from: number;
  readonly to: number;
  readonly yFrom: number;
  readonly yTo: number;
  readonly dir: 'down' | 'up';
  /** Conveyor travel direction along the axis. */
  readonly sign: 1 | -1;
}
/** All 22 units. In each z band the unit nearer the axis (smaller |x|) runs down; F6's south unit runs down. */
export function escalatorUnits(): EscalatorUnit[] {
  const out: EscalatorUnit[] = [];
  for (const f of FLIGHTS) {
    const travel = (Math.sign(f.to - f.from) || 1) as 1 | -1;
    for (const [a, b] of f.bands) {
      const c0 = a + ESCALATOR.unitWidth / 2;
      const c1 = b - ESCALATOR.unitWidth / 2;
      const down = f.axis === 'z' ? (Math.abs(c0) < Math.abs(c1) ? c0 : c1) : c0;
      for (const c of [c0, c1]) {
        const dir = c === down ? 'down' : 'up';
        out.push({
          id: `${f.id}:${c.toFixed(2)}`, flight: f.id, axis: f.axis, across: c,
          from: f.from, to: f.to, yFrom: f.yFrom, yTo: f.yTo, dir,
          sign: dir === 'down' ? travel : ((-travel) as 1 | -1),
        });
      }
    }
  }
  return out;
}

export interface Landing { readonly y: number; readonly zMin: number; readonly zMax: number; readonly halfX: number }
export const LANDINGS = {
  L1: { y: -10, zMin: 79.8, zMax: 83.8, halfX: 17 },
  L2: { y: -20, zMin: 58.5, zMax: 62.5, halfX: 12.4 },
  /** Bridge across the sky hole at the Threshold level (the annulus covers the rest). */
  thresholdBridge: { y: -30, zMin: 79.8, zMax: 83.8, halfX: 10.6 },
} as const satisfies Record<string, Landing>;

export const THRESHOLD = { y: -30, rInner: 10, rOuter: 20, deckThickness: 2, gateX: 8.1, lanesPerSide: 3 } as const;

export const SKY = { y: -32, holeR: 10 } as const;

export const DISC = {
  r: 3.5, topY: 0, bottomY: -70, vmax: 3, accel: 0.6, minSpeed: 0.05,
  /** Seconds the rider must stand on the docked disc before it departs. */
  departDelay: 2,
  /** Player within this horizontal distance of the other end's gate (same level) calls an empty disc. */
  callRadius: 6,
  /** Railed well in the Meridian island and the Crossing floor. */
  wellR: 4.0,
} as const;

/** Gangways from the hall rim (south) and from the Crossing-floor well rim (south) onto the disc. */
export const GANGWAY = { halfWidth: 1.2 } as const;

export const LIFTS = {
  cabinR: 1.2, tubeR: 1.4,
  positions: [[-17, 74], [-17, 80]] as ReadonlyArray<readonly [number, number]>,
  stops: [-30, -70, -82] as const,
  /** Tube top (machinery head) above the Threshold. */
  headY: -24,
} as const;

export const FUNICULAR = {
  /** [x, y] of the track ends along z = FUNICULAR.z. */
  top: [18, -30] as readonly [number, number],
  bottom: [58, -70] as readonly [number, number],
  z: 74, cabinLength: 4, cabinWidth: 2.4, cabinHeight: 2.6,
  /** Half-width (across z) of the inclined track slab. */
  trackHalfWidth: 1.3,
  /** Slot in the sky plane where the track passes through (x from xMin to xMax, z = FUNICULAR.z +- halfZ). */
  skySlot: { xMin: 18.5, xMax: 22, halfZ: 1.6 },
} as const;

/** Half-width (across z) of each rail trench cut into the Crossing base floor, about VESPER.trackZ. */
export const TRENCH = { halfWidth: 1.6 } as const;

export const CAVERN = {
  transept: { xMin: -60, xMax: 60, zMin: 54, zMax: 94 },
  nave: { xMin: -20, xMax: 20, zMin: 20, zMax: 128 },
  /** Lowest structure (Halcyon trench) for shadow fitting. */
  yBottom: -84,
  /** Non-walkable base floor field across the cross, outside the Crossing floor. */
  baseFloorY: -72.5,
} as const;

/** Cross plan outline (x, z), counter-clockwise seen from above. */
export const CROSS_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [-20, 20], [20, 20], [20, 54], [60, 54], [60, 94], [20, 94], [20, 128], [-20, 128], [-20, 94], [-60, 94], [-60, 54], [-20, 54],
];

export const METRO_TRAIN = { cars: 4, carLength: 20, gap: 0.5, length: 81.5, width: 2.9, height: 4.0, doorsPerSidePerCar: 3 } as const;
/** Full-height platform screen doors. */
export const PSD = { inset: 0.35, height: 2.6 } as const;

export const MERIDIAN = {
  island: { xMin: -9, xMax: 9, zMin: 29, zMax: 119 } as Rect,
  topY: -46, railY: -47.1, deckThickness: 1.5,
  trackX: [-10.55, 10.55] as const,
  /** Deck opening where F5 drops below the bridge (rider headroom under the deck edge). */
  f5OpeningZ: [107.0, 113.6] as const,
  /** The same two inner bands, as x ranges of the deck openings. */
  f5OpeningX: ESCALATOR_BANDS.inner,
  /** Half-width (x) of the rail deck under the island (tracks on both sides). */
  railDeckHalfWidth: 12.3,
  /** F4 body is too low over the deck here: not walkable beneath it. */
  f4FootprintZ: [52.11, 58.0] as const,
} as const;

export const VESPER = {
  floor: { xMin: -58, xMax: 58, zMin: 64, zMax: 84 } as Rect,
  platformXMin: -45, platformXMax: 45,
  topY: -70, railY: -71.1, slabThickness: 1.5,
  trackZ: [62.45, 85.55] as const,
  /** F5 lands here; its low body above the floor is not walkable beneath. */
  f5FootprintZ: [72.03, 78.0] as const,
  /** F6 drops below the floor here (rider headroom under the slab edge). */
  f6OpeningX: [-46.7, -41.0] as const,
  /** F6 opening z range (same band as FLIGHTS F6). */
  f6OpeningZ: VESPER_F6_OPENING_Z,
} as const;

const SQRT1_2 = Math.SQRT1_2;
export const HALCYON = {
  centre: [-20, 74] as readonly [number, number],
  /** Unit long axis (x, z): north-east diagonal. */
  dir: [SQRT1_2, SQRT1_2] as readonly [number, number],
  halfLength: 45, halfWidth: 5,
  topY: -82, railY: -83.1,
  /** Track centres either side of the island, perpendicular to the diagonal. */
  trackOffset: 6.55,
  /** Deep-hall half-width (walls) perpendicular to the diagonal. */
  hallHalfWidth: 10,
} as const;

export const GLASS_FLOOR = { xMin: -30, xMax: -10, zMin: 65, zMax: 83 } as const;

const DEEP_ELEV = (70 * Math.PI) / 180;
const DEEP_AZ: readonly [number, number] = [Math.sin(Math.PI / 8), -Math.cos(Math.PI / 8)]; // toward SSE in (x, z)
export const DEEP_SUN = {
  /** Unit vector toward the artificial sun. */
  direction: [Math.cos(DEEP_ELEV) * DEEP_AZ[0], Math.sin(DEEP_ELEV), Math.cos(DEEP_ELEV) * DEEP_AZ[1]] as readonly [number, number, number],
  color: [1.0, 0.97, 0.92] as readonly [number, number, number],
  intensity: 7.0,
} as const;

/** Initial deep look (Phase 5 look-dev tunes these by screenshot). Colours are linear RGB. */
export const DEEP_LOOK = {
  fog: [0.62, 0.68, 0.76] as readonly [number, number, number], fogDensity: 0.0012,
  background: [0.02, 0.022, 0.026] as readonly [number, number, number],
  exposure: 0.9, bloom: 0.55, bloomThreshold: 1.0,
  split: 0.35, contrast: 0.35, saturation: 1.0,
  shadowTint: [0.95, 0.98, 1.05] as readonly [number, number, number],
  highlightTint: [1.0, 1.0, 0.98] as readonly [number, number, number],
  hemiSky: [0.75, 0.85, 1.0] as readonly [number, number, number],
  hemiGround: [0.55, 0.53, 0.5] as readonly [number, number, number],
  hemi: 0.6, probe: 0.8,
  /** Cube-capture point for the deep environment (over the Crossing floor). */
  capture: [0, -60, 74] as readonly [number, number, number],
} as const;

export const MAP_WALL = { z: 20, xMin: -20, xMax: 20, yMin: -41, yMax: -34 } as const;
export const WATER_WALL = { x: -60, zMin: 54, zMax: 94, yMin: -70, yMax: -34 } as const;
export const DROPLETS = { count: 2400, rInner: 12, rOuter: 38, yTop: -33, yBottomMin: -42, bridgeExclusionHalfX: 12.5 } as const;

/** Depth zones (camera eye y). */
export const ZONES = {
  switchY: -16, hysteresis: 1,
  lookTopY: -4, lookBottomY: -30,
  surfaceSunFade: [-4, -14] as const,
  deepSunFade: [-18, -28] as const,
} as const;
