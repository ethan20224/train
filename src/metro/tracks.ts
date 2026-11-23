// Metro track model: six straight track lines derived from layoutMetro. Pure (no three.js, no DOM).
// Each track is a parametric line  p(s) = origin + dir * s  at height railY, where s is metres of
// travel along the track's fixed travel direction and s = 0 is the platform centre (the train
// centre stops at s = 0, so car doors line up with the PSD door offsets). Trains run through the
// station: they enter at the portal at s = -portalIn and leave at s = +portalOut.
import { CAVERN, HALCYON, MERIDIAN, METRO_TRAIN, VESPER } from '../layoutMetro';

export type LineId = 'meridian' | 'vesper' | 'halcyon';

export interface MetroTrack {
  readonly line: LineId;
  /** 0 or 1: the two tracks of a line run in opposite directions (0 = +axis, 1 = -axis). */
  readonly track: 0 | 1;
  /** World (x, z) of the platform centre on this track (s = 0). */
  readonly origin: readonly [number, number];
  readonly railY: number;
  /** Unit travel direction (x, z). */
  readonly dir: readonly [number, number];
  /** Distance from the platform centre back to the entry portal / on to the exit portal. */
  readonly portalIn: number;
  readonly portalOut: number;
}

const NAVE_Z = [CAVERN.nave.zMin, CAVERN.nave.zMax] as const;             // Meridian portals: nave end walls
const TRANSEPT_X = [CAVERN.transept.xMin, CAVERN.transept.xMax] as const; // Vesper portals: transept end walls

const meridianZ = (NAVE_Z[0] + NAVE_Z[1]) / 2;                       // 74
const vesperX = (TRANSEPT_X[0] + TRANSEPT_X[1]) / 2;                 // 0
const hp = HALCYON.halfLength + HALCYON.portalExtra;                 // 55
const perp: readonly [number, number] = [-HALCYON.dir[1], HALCYON.dir[0]];

export const TRACKS: readonly MetroTrack[] = [
  // Meridian: N-S, track 0 (x -10.55) runs north (+z), track 1 (x +10.55) runs south.
  { line: 'meridian', track: 0, origin: [MERIDIAN.trackX[0], meridianZ], railY: MERIDIAN.railY, dir: [0, 1], portalIn: meridianZ - NAVE_Z[0], portalOut: NAVE_Z[1] - meridianZ },
  { line: 'meridian', track: 1, origin: [MERIDIAN.trackX[1], meridianZ], railY: MERIDIAN.railY, dir: [0, -1], portalIn: NAVE_Z[1] - meridianZ, portalOut: meridianZ - NAVE_Z[0] },
  // Vesper: E-W, track 0 (z 62.45) runs east (+x), track 1 (z 85.55) runs west.
  { line: 'vesper', track: 0, origin: [vesperX, VESPER.trackZ[0]], railY: VESPER.railY, dir: [1, 0], portalIn: vesperX - TRANSEPT_X[0], portalOut: TRANSEPT_X[1] - vesperX },
  { line: 'vesper', track: 1, origin: [vesperX, VESPER.trackZ[1]], railY: VESPER.railY, dir: [-1, 0], portalIn: TRANSEPT_X[1] - vesperX, portalOut: vesperX - TRANSEPT_X[0] },
  // Halcyon: along the NE diagonal, offset +/- trackOffset perpendicular; track 0 runs +dir, track 1 runs -dir.
  { line: 'halcyon', track: 0, origin: [HALCYON.centre[0] + perp[0] * HALCYON.trackOffset, HALCYON.centre[1] + perp[1] * HALCYON.trackOffset], railY: HALCYON.railY, dir: HALCYON.dir, portalIn: hp, portalOut: hp },
  { line: 'halcyon', track: 1, origin: [HALCYON.centre[0] - perp[0] * HALCYON.trackOffset, HALCYON.centre[1] - perp[1] * HALCYON.trackOffset], railY: HALCYON.railY, dir: [-HALCYON.dir[0], -HALCYON.dir[1]], portalIn: hp, portalOut: hp },
];

export const trackOf = (line: LineId, track: 0 | 1): MetroTrack => TRACKS[['meridian', 'vesper', 'halcyon'].indexOf(line) * 2 + track]!;

/** World position [x, y, z] of the point at parameter s on a track (y = rail height). */
export function trackPoint(t: MetroTrack, s: number): [number, number, number] {
  return [t.origin[0] + t.dir[0] * s, t.railY, t.origin[1] + t.dir[1] * s];
}

/**
 * Door centre offsets along the train, metres from the train centre (identical for both sides and
 * both travel directions, since the layout is mirror symmetric). Cars are carLength long with `gap`
 * between them; each car carries doorsPerSidePerCar doors evenly spaced inside it: door k of a car
 * sits at the centre of the k-th equal slice, i.e. carStart + (k + 0.5) * carLength / doorsPerSidePerCar.
 * Phase 3 PSDs must use this same function, offset from the platform centre (train centre stops at s = 0).
 */
export function doorOffsets(): number[] {
  const { cars, carLength, gap, length, doorsPerSidePerCar: n } = METRO_TRAIN;
  const out: number[] = [];
  for (let c = 0; c < cars; c++) {
    const carStart = -length / 2 + c * (carLength + gap);
    for (let k = 0; k < n; k++) out.push(carStart + ((k + 0.5) * carLength) / n);
  }
  return out;
}
