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

/** Visual dimensions of the escalators (src/world/metro/escalators.ts). Metres; v is height above the step line, u runs along the flight from the upper end. */
export const ESCALATOR_VIS = {
  /** Step pitch along the chain (a 0.2 m riser at 30 degrees). */
  pitch: 0.4, stepTreadDepth: 0.4, stepRiserHeight: 0.2, stepThickness: 0.04, stepHalfWidth: 0.497,
  /** Transition radius between the flat run and the incline (both ends). */
  transitionR: 1.2,
  /** Flat run beyond each end of the incline: 3 steps, hidden under the landing deck except for the combplate zone. */
  flatEnd: 1.2,
  /** Steps beyond the combplate sink this far below the landing (smoothstep over sinkStart..sinkEnd metres past the end). */
  sink: 0.14, sinkStart: 0.3, sinkEnd: 0.65,
  /** Stainless truss: perpendicular depth 1.1 m, half-width, and its top below the step line. */
  trussDepth: 1.1, trussHalfWidth: 0.78, trussTop: -0.26,
  /** Balustrade base (skirt + deck), glass, handrail; offsets from the unit centre. */
  skirtX: 0.505, baseOuterX: 0.76, baseTop: 0.07, baseBottom: -0.3,
  glassX: 0.62, glassThickness: 0.012, glassTop: 0.96,
  railProfileHalf: 0.055, railProfileBottom: 0.925, railProfileTop: 0.96, rubberHalfW: 0.04, rubberHalfH: 0.022, rubberCentreV: 0.978,
  /** Newel end: how far the balustrade base runs past the incline end, and the radius of the handrail loop. */
  newelLength: 0.4, handrailLoopR: 0.1,
  /** Warm skirt light strip height range on the skirt face (above the tread). */
  stripV0: 0.022, stripV1: 0.034,
  /** Combplate: body depth outside the end, tooth length and pitch, thickness, lip height (bottom ends) above the landing. */
  combBody: 0.4, combTeeth: 0.1, combToothPitch: 0.0355, combToothWidth: 0.018, combThickness: 0.012, combLip: 0.045,
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

export const SKY = {
  y: -32, holeR: 10,
  /** Clearance added to LIFTS.tubeR for each circular lift-tube slot in the sky plane. */
  liftSlotPad: 0.2,
  /** Depth of the polished stainless rims hanging below the sky plane around lift and funicular slots. */
  slotRimDepth: 0.3,
  /** Offset below SKY.y for the invisible eclipse/slot shadow casters (inside deep shadow frustum, clear of sky plane). */
  casterOffsetY: -0.15,
} as const;

/** CoeLux-like "window to infinity" buried noon sky shader parameters (src/world/metro/sky.ts). Linear RGB + gains. */
export const SKY_LOOK = {
  /** Deep noon sapphire zenith kept below bloom threshold so ACES preserves rich sky saturation. */
  zenithColor: [0.05, 0.21, 0.84] as readonly [number, number, number],
  zenithGain: 1.38,
  /** Luminous pale atmospheric haze at grazing angles. */
  horizonColor: [0.68, 0.82, 1.0] as readonly [number, number, number],
  horizonGain: 1.55,
  horizonPow: 0.42,
  /** Faint luminous atmospheric band near grazing angles (sells infinite depth). */
  grazingBandColor: [0.80, 0.89, 1.0] as readonly [number, number, number],
  grazingBandGain: 0.22,
  grazingBandPow: 5.5,
  /** Subtle broad Rayleigh forward scatter toward the SSE sun side. */
  forwardScatterColor: [0.76, 0.88, 1.0] as readonly [number, number, number],
  forwardScatterGain: 0.14,
  forwardScatterPow: 3.0,
  /** Crisp solar disc angular radii (degrees) and HDR intensity. */
  sunDiscInnerDeg: 0.28,
  sunDiscOuterDeg: 0.36,
  sunDiscGain: 48.0,
  /** Tight inner solar glare + Mie aureole (never blows out the surrounding sky blue). */
  sunCoronaGain: 0.95,
  sunCoronaFalloff: 55.0,
  sunAureoleTightGain: 0.85,
  sunAureoleTightPow: 64.0,
  sunAureoleWideGain: 0.14,
  sunAureoleWidePow: 8.0,
  /** Triangular dither amplitude against 8-bit gradient banding. */
  ditherStrength: 0.5 / 255,
} as const;

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
export const GANGWAY = {
  halfWidth: 1.2,
  /** Bronze bridge girder: depth below the deck top, and the clear gap kept to the disc edge. */
  girderDepth: 0.55, discClearance: 0.05,
  /** Glass parapet: total height to the top of the bronze cap; stanchion pitch. */
  parapetHeight: 1.08, stanchionPitch: 1.2,
  /** Gate pilasters either side of the gate leaves; the open leaves tuck behind them. Inner face at halfWidth, outer face of the outer pilaster here. */
  pierOuterX: 2.7, pierDepth: 0.22, pierHeight: 1.34,
  /** Slim bronze pilasters (not blocks): width across the gate line; they stand this far on the hall side of the leaf line. */
  pilasterW: 0.25, pilasterSetback: 0.17,
  /** Gate leaves slide open/closed over this many REAL seconds (ease in-out). */
  gateSeconds: 0.35,
} as const;

/** The Sinking Floor dressing (src/world/metro/disc.ts). Heights are relative to the disc top (the walking surface). */
export const DISC_DETAIL = {
  segments: 96,
  /** Marble slab edge band, and the bronze bowl under it (depth below the slab underside at the centre). */
  slabT: 0.14, bowlDepth: 0.36,
  /** Top inlay (echo of the kiosk floor medallion): brass ring, 16-point dark star, dark band with brass lines. */
  ringR: [1.44, 1.5] as readonly [number, number],
  star: { points: 16, outer: 1.3, inner: 0.56 },
  bandR: [2.7, 3.0] as readonly [number, number], bandLine: 0.035,
  /** Rim: handrail on `stanchions` fine stanchions on circle `rimR`; the gap between the first and last faces the gangway (south). */
  rimR: 3.38, stanchions: 8, railHeight: 1.0, railTubeR: 0.022, stanchionR: 0.016, kneeRailY: 0.5,
  /** Warm downlight ring on the underside (emissive): radii. */
  downlightR: [2.42, 2.5] as readonly [number, number],
} as const;

/**
 * The Threshold fare line (spec §2.7, rebuilt 2026-11-23). Four straight gate lines make the Threshold annulus a sealed ticket hall:
 * `east` / `west` on x = +-THRESHOLD.gateX (8 lanes + 1 wide lane, from the sky-hole edge to the drum wall), `lobby` (a glass-walled
 * lobby round the two lift doors, entered through 2 lanes) and `funicular` (one lane in each side landing of the top-station alcove). Between lanes stand
 * slim stainless cabinets; the rest of every line is fixed glass. Everything is derived here: the renderer, navigation and tests read
 * the same numbers. Lanes are always walkable (2035: validation is ticketless); cabinets and glass block.
 */
export const SPEED_GATES = {
  /** Clear walking width of a standard lane and of the wide (accessible) lane, measured between cabinet faces. */
  laneClear: 0.9, wideLaneClear: 1.2,
  /** Cabinet: length along the walking direction (x), thickness across it (z), height; the 20 mm shadow-gap plinth. */
  cabinetLength: 1.6, cabinetThickness: 0.2, cabinetHeight: 1.0, plinthGap: 0.02, plinthH: 0.06,
  /** Fixed glass barrier: height, ultra-clear thickness, longest post pitch. */
  glassHeight: 1.1, glassThickness: 0.012, postPitchMax: 1.5,
  /** Moving glass leaves (wings): height, thickness. They swing flat against the cabinet face when a lane opens. */
  leafHeight: 1.35, leafThickness: 0.01,
  /** Standard lanes per main line (plus one wide lane at the north end) and in the lift lobby; the funicular has one lane per side landing. */
  lanesPerMain: 8, lanesLobby: 2,
  /** Leaves open over this many REAL seconds. A lane opens when the player is within `approachR` (hysteresis `closeExtra`), or will be
   *  within it `lookAheadSec` from now at the current velocity, so the leaves are fully open before a runner arrives. The LED line
   *  brightens inside `glowR`. */
  panelSeconds: 0.35, approachR: 3.0, closeExtra: 0.5, lookAheadSec: 0.6, glowR: 5.5,
  /** Navigation pad round every cabinet and glass run (less than PLAYER.radius: the 1.0 / 1.1 m barriers are below elbow height, so the
   *  body overlaps them by a hand width and the 0.9 m lane keeps a 0.46 m wide corridor for the player's centre). */
  collidePad: 0.22,
  /** Clear gap between the escalator ends (F3.to + ESCALATOR.endOverlap) plus the pad, and the first main-line cabinet face. */
  southClear: 0.12,
} as const;

export type FareLineId = 'east' | 'west' | 'lobby' | 'funicular';
export interface SpeedGateLane {
  readonly line: FareLineId; readonly index: number;
  /** Lane centre (on the line x, mid-lane z) and clear width. */
  readonly x: number; readonly z: number; readonly width: number; readonly wide: boolean;
  /** Sign of x pointing into the paid side of the line. */
  readonly inward: 1 | -1;
  /** Indices (within the line's cabinets) of the cabinets south and north of this lane. */
  readonly cabSouth: number; readonly cabNorth: number;
}
export interface FareCabinet { readonly line: FareLineId; readonly index: number; readonly x: number; readonly z: number }
/** Fixed glass run on a line. axis 'z': runs along z at x = `at`; axis 'x': runs along x at z = `at`. Ends: 'wall' (drum, post at the wall), 'post', 'cabinet' (glass tucked into the cabinet face). */
export interface FareGlassRun {
  readonly line: FareLineId; readonly axis: 'x' | 'z'; readonly at: number; readonly t0: number; readonly t1: number;
  readonly end0: 'wall' | 'post' | 'cabinet'; readonly end1: 'wall' | 'post' | 'cabinet';
}
export interface FareLine {
  readonly id: FareLineId; readonly x: number; readonly inward: 1 | -1;
  readonly lanes: readonly SpeedGateLane[]; readonly cabinets: readonly FareCabinet[]; readonly glass: readonly FareGlassRun[];
}

/** The lift lobby: its glass line sits on x = `x` from `zMin` to `zMax`; the two cross screens run from it west to the drum wall. */
export const LIFT_LOBBY = { x: -13.4, zMin: 71.0, zMax: 85.0, gateCentreZ: 82.0 } as const;
/** Funicular gate line: its cabinets end this far short of the cabin's west edge (FUNICULAR.top[0]). */
const FUNICULAR_LINE_CLEAR = 0.2;

/** Drum wall (r = THRESHOLD.rOuter about the oculus axis), nudged 0.05 m into the wall so glass seals against it. */
const DRUM_EMBED = 0.05;
function drumZ(x: number, sign: 1 | -1): number {
  const R = THRESHOLD.rOuter + DRUM_EMBED;
  return OCULUS.cz + sign * Math.sqrt(R * R - (x - OCULUS.cx) * (x - OCULUS.cx));
}
function drumX(z: number, sign: 1 | -1): number {
  const R = THRESHOLD.rOuter + DRUM_EMBED;
  return OCULUS.cx + sign * Math.sqrt(R * R - (z - OCULUS.cz) * (z - OCULUS.cz));
}

/** One cabinet-and-lane group on a straight line, from `zStart` (south face of the first cabinet) in the given lane width order; indices continue from `base`. */
function gateGroup(id: FareLineId, x: number, inward: 1 | -1, zStart: number, widths: readonly number[], base = { cab: 0, lane: 0 }): { lanes: SpeedGateLane[]; cabinets: FareCabinet[]; zEnd: number } {
  const t = SPEED_GATES.cabinetThickness;
  const cabinets: FareCabinet[] = [{ line: id, index: base.cab, x, z: zStart + t / 2 }];
  const lanes: SpeedGateLane[] = [];
  let z = zStart + t;
  widths.forEach((w, i) => {
    lanes.push({ line: id, index: base.lane + i, x, z: z + w / 2, width: w, wide: w > SPEED_GATES.laneClear + 1e-9, inward, cabSouth: base.cab + i, cabNorth: base.cab + i + 1 });
    z += w;
    cabinets.push({ line: id, index: base.cab + i + 1, x, z: z + t / 2 });
    z += t;
  });
  return { lanes, cabinets, zEnd: z };
}

let fareCache: readonly FareLine[] | null = null;
/** All four fare lines. Computed once, lazily (LIFTS and FUNICULAR are declared further down this module). */
export function fareLines(): readonly FareLine[] {
  if (fareCache) return fareCache;
  const S = SPEED_GATES;
  const out: FareLine[] = [];
  const f3 = FLIGHTS.find((f) => f.id === 'F3')!;
  // Main lines: the first cabinet face stands clear of the F3 / F4 landings; glass closes the rest, from the sky-hole edge to the drum wall.
  const mainStart = f3.to + ESCALATOR.endOverlap + S.collidePad + S.southClear;
  const mainWidths = [...(Array(S.lanesPerMain).fill(S.laneClear) as number[]), S.wideLaneClear];
  for (const side of [1, -1] as const) {
    const id: FareLineId = side > 0 ? 'east' : 'west';
    const x = side * THRESHOLD.gateX;
    const inward = (-side) as 1 | -1;
    const g = gateGroup(id, x, inward, mainStart, mainWidths);
    out.push({
      id, x, inward, lanes: g.lanes, cabinets: g.cabinets,
      glass: [
        { line: id, axis: 'z', at: x, t0: LANDINGS.thresholdBridge.zMin, t1: mainStart, end0: 'post', end1: 'cabinet' },
        { line: id, axis: 'z', at: x, t0: g.zEnd, t1: drumZ(x, 1), end0: 'cabinet', end1: 'wall' },
      ],
    });
  }
  // Lift lobby: the lifts' Threshold doors face east (toward the sky hole), so the lobby is the strip between the drum wall and x = LIFT_LOBBY.x;
  // its 2 lanes sit beside the F3 landing, nearest the arrivals.
  {
    const L = LIFT_LOBBY;
    const widths = Array(S.lanesLobby).fill(S.laneClear) as number[];
    const span = widths.reduce((a, b) => a + b, 0) + (widths.length + 1) * S.cabinetThickness;
    const g = gateGroup('lobby', L.x, -1, L.gateCentreZ - span / 2, widths);
    out.push({
      id: 'lobby', x: L.x, inward: -1, lanes: g.lanes, cabinets: g.cabinets,
      glass: [
        { line: 'lobby', axis: 'z', at: L.x, t0: L.zMin, t1: g.cabinets[0]!.z - S.cabinetThickness / 2, end0: 'post', end1: 'cabinet' },
        { line: 'lobby', axis: 'z', at: L.x, t0: g.zEnd, t1: L.zMax, end0: 'cabinet', end1: 'post' },
        { line: 'lobby', axis: 'x', at: L.zMin, t0: drumX(L.zMin, -1), t1: L.x, end0: 'wall', end1: 'post' },
        { line: 'lobby', axis: 'x', at: L.zMax, t0: drumX(L.zMax, -1), t1: L.x, end0: 'wall', end1: 'post' },
      ],
    });
  }
  // Funicular top station. The cabin bay (FUNICULAR.pit z range) is a pit and the cabin is boarded from its two long sides, so riders reach
  // the platform only along the two side landings between the portal jambs and the bay: one lane in each, glass across the bay front and
  // out to the drum wall. (Lanes down the cabin axis would lead into the pit.)
  {
    const x = FUNICULAR.top[0] - S.cabinetLength / 2 - FUNICULAR_LINE_CLEAR;
    const TS = FUNICULAR.topStation, pit = FUNICULAR.pit;
    const t = S.cabinetThickness;
    const south = gateGroup('funicular', x, 1, (TS.zMin + pit.zMin) / 2 - S.laneClear / 2 - t, [S.laneClear]);
    const north = gateGroup('funicular', x, 1, (pit.zMax + TS.zMax) / 2 - S.laneClear / 2 - t, [S.laneClear], { cab: 2, lane: 1 });
    out.push({
      id: 'funicular', x, inward: 1, lanes: [...south.lanes, ...north.lanes], cabinets: [...south.cabinets, ...north.cabinets],
      glass: [
        { line: 'funicular', axis: 'z', at: x, t0: drumZ(x, -1), t1: south.cabinets[0]!.z - t / 2, end0: 'wall', end1: 'cabinet' },
        { line: 'funicular', axis: 'z', at: x, t0: south.zEnd, t1: north.cabinets[0]!.z - t / 2, end0: 'cabinet', end1: 'cabinet' },
        { line: 'funicular', axis: 'z', at: x, t0: north.zEnd, t1: drumZ(x, 1), end0: 'cabinet', end1: 'wall' },
      ],
    });
  }
  fareCache = out;
  return out;
}
export const speedGateLanes = (): SpeedGateLane[] => fareLines().flatMap((l) => l.lanes);
export const speedGateCabinets = (): FareCabinet[] => fareLines().flatMap((l) => l.cabinets);
/** Half-thickness used for the plan footprint of a glass run (posts and rail are wider than the 12 mm pane). */
const GLASS_FOOT = 0.03;
/** Physical plan footprints of every cabinet and glass run: navigation pads them by `collidePad` and cuts them out of the Threshold level. */
export function fareBlockers(): Array<{ xMin: number; xMax: number; zMin: number; zMax: number }> {
  const S = SPEED_GATES;
  const out: Array<{ xMin: number; xMax: number; zMin: number; zMax: number }> = [];
  for (const l of fareLines()) {
    for (const c of l.cabinets) out.push({ xMin: c.x - S.cabinetLength / 2, xMax: c.x + S.cabinetLength / 2, zMin: c.z - S.cabinetThickness / 2, zMax: c.z + S.cabinetThickness / 2 });
    for (const g of l.glass) {
      const a = Math.min(g.t0, g.t1), b = Math.max(g.t0, g.t1);
      out.push(g.axis === 'z' ? { xMin: g.at - GLASS_FOOT, xMax: g.at + GLASS_FOOT, zMin: a, zMax: b } : { xMin: a, xMax: b, zMin: g.at - GLASS_FOOT, zMax: g.at + GLASS_FOOT });
    }
  }
  return out;
}

/**
 * Ticket-hall dressing (src/world/metro/ticketHall.ts): the station identity on the north drum wall and one wayfinding totem per F3 landing.
 * Identity: backlit lettering on the polished-era panel row between the wall light rings at y = -26.5 and -29 (clear of both and of the
 * -27.3 panel joint). Totems stand beside the arrival path, in line with a main-line cabinet (not a lane), facing the F3 exits (south).
 */
export const TICKET_HALL = {
  identity: { text: 'MERIDIAN DEEP', yTop: -27.4, yBottom: -28.55, yCentre: -27.9, ruleY: -28.43, width: 11.0, wallInset: 0.05 },
  totem: { height: 2.4, width: 0.56, depth: 0.12, z: 84.16, x: 10.7, faceWidth: 0.46, faceY0: 1.1, faceY1: 2.3, collideR: 0.15, collideStep: 0.14 },
} as const;
/** Totem footprint circles at the Threshold level (src/obstacles.ts): a row along x of the totem's width, both landings. */
export function totemObstacleCircles(): Array<{ x: number; z: number; r: number }> {
  const T = TICKET_HALL.totem;
  const out: Array<{ x: number; z: number; r: number }> = [];
  const span = T.width - 2 * T.collideR;
  const n = Math.ceil(span / T.collideStep);
  for (const side of [1, -1] as const) {
    for (let k = 0; k <= n; k++) out.push({ x: side * T.x + (k / n - 0.5) * span, z: T.z, r: T.collideR });
  }
  return out;
}

/** Lift tube heads above the Threshold (src/world/metro/lifts.ts): glass tube to `tubeTopY`, then a stainless-and-glass lantern up to LIFTS.headY. */
export const LIFT_HEAD = {
  tubeTopY: -26.0, collarH: 0.14, collarR: 1.54,
  /** Stainless guide posts on the tube and the bands that bind them. */
  posts: 3, postR: 0.03, bandEvery: 2.2,
  lanternSides: 8, lanternR: 1.25, deckT: 0.1, roofT: 0.16,
  /** Sheave: grooved stainless wheel on a horizontal axle (along x). */
  sheaveR: 0.52, sheaveW: 0.16,
} as const;

/** Beaux-Arts dressing of the hall-side oculus and throats (src/world/metro/oculus.ts). Heights are above the hall floor (y = 0). */
export const OCULUS_DETAIL = {
  /** The curb ring uses the hall floor hole's 96-vertex polygon exactly (src/world/concourse/floor.ts). */
  ringSegments: 96,
  /** The curb is interrupted this many 96-grid steps either side of due south for the gangway. */
  curbGapSteps: 2,
  /** The ring balustrade stops this many degrees either side of due south (the gate piers fill the gap). */
  balustradeGapDeg: 17,
  /** Top of the brass handrail above the floor: the curb top plus the guard height. */
  handrailTopY: OCULUS.curbHeight + OCULUS.balustradeHeight,
  /** Hanging soffit collar depth below the slab underside; moulding foot and bead sizes of the curbs. */
  collarDepth: 0.28,
  balusterPitch: 0.18, postSpacing: 3.0,
  /** Brass inlay band in the hall floor just outside the curb, as radii. */
  inlayR: [9.65, 9.72] as readonly [number, number],
  /** Throat stone curb width (outside the floor hole edge). */
  throatCurbWidth: 0.32,
  /** The oculus-side throat curbs stop short of the oculus curb ring: z limit of the inner long side, x start of the north end. */
  throatInnerCurbZMax: 68.7, throatNorthInnerX: 8.55,
  /** Carved dome: radial rib count and the y range it covers (spec §2.1). */
  ribCount: 48, ribYTop: -1.55, ribYBottom: -6.0,
  ribRingYs: [-2.4, -3.5, -4.7, -6.0] as readonly number[],
} as const;

/** y of the first light ring (one pitch under the hall slab). Rings run every VOID.lightRingPitch down to the Threshold. */
export const VOID_RING_FIRST_Y = OCULUS.slabUnderY - VOID.lightRingPitch;
/** The backlit onyx band takes the place of the light ring at this y (polished era). */
export const ONYX_BAND = { y: -24, height: 0.6 } as const;
/** y of every recessed light channel on the void wall (the onyx band is the ring at ONYX_BAND.y). */
export function lightRingYs(): number[] {
  const out: number[] = [];
  for (let y = VOID_RING_FIRST_Y; y > VOID.yBottom + 0.5; y -= VOID.lightRingPitch) if (Math.abs(y - ONYX_BAND.y) > 0.01) out.push(y);
  return out;
}

/** Dressing of the void shell (src/world/metro/void.ts): the three eras, the rings, the landings and the Threshold rim. */
export const VOID_DETAIL = {
  /** Stone era: rusticated ashlar with V-joints; every `bandEvery`-th course projects as a band. Pilasters stop at pilasterTopY. */
  ashlar: { blockW: 1.2, courseH: 0.6, chamfer: 0.04, jointDepth: 0.035, bandEvery: 4, bandProject: 0.1 },
  pilasters: { count: 8, width: 1.5, project: 0.22, topY: -6.0 },
  /** Moulded string course between the stone and strata eras. */
  stringCourseY: -10,
  /** Strata era: height-field grid. Machined (flat) bands, `cutHalf` either side of every ring, landing and era joint. */
  strata: { thetaSegs: 448, ySegs: 208, seed: 19, cutHalf: 0.2, cutBlend: 0.34, maxProtrude: 0.62 },
  /** Polished era: honed limestone panels with shadow gaps, stainless trims. */
  polished: { panelW: 1.5, panelH: 3.0, gap: 0.012, panelThickness: 0.04 },
  /** Light-channel section (stainless bezel, emissive slot). */
  ring: { halfWidth: 0.075, proud: 0.045, slotHalf: 0.032, stripHalf: 0.026, segments: 192 },
  /** Era light colours (kelvin) and the emissive peak of the strips. */
  lightK: { stone: 2700, strata: 4300, polished: 5800, cove: 3200 },
  stripPeak: 2.8,
  /** Landings: slender deck with a pale steel soffit; the warm cove strip sits `coveInset` in from each long edge. */
  deck: { topT: 0.06, depth: 0.5, girderT: 0.1, ribPitch: 2.0, ribDepth: 0.2, coveInset: 0.26, coveWidth: 0.12, wallOverlap: 0.15 },
  /** Glass balustrade (total height 1.1 m, glass 0.9 m). */
  balustrade: { height: 1.1, glassTop: 1.0, glassBottom: 0.1, postPitch: 2.4 },
  /** Threshold rim: stainless lip hangs this far below the deck top; the fascia reaches the underside of the deck. */
  rim: { lipDepth: 0.3, coveY: -31.58, fasciaBottom: THRESHOLD.y - (THRESHOLD.deckThickness - 0.1) },
} as const;

export const LIFTS = {
  cabinR: 1.2, tubeR: 1.4,
  positions: [[-17, 74], [-17, 80]] as ReadonlyArray<readonly [number, number]>,
  stops: [-30, -70, -82] as const,
  /** Tube top (machinery head) above the Threshold. */
  headY: -24,
} as const;

const FUNICULAR_TOP_WEST_X = 20.3; // 0.3 m outside Threshold outer edge (r = 20 at z = 74); approved deck uncut
const FUNICULAR_BOT_EAST_X = 57.0; // <= 57.4 so entire 4 m cabin & pit sit inside continuous Crossing east balustrade (x = 57.94)
const FUNICULAR_LEN = 4.0;
const FUNICULAR_BOT_WEST_X = FUNICULAR_BOT_EAST_X - FUNICULAR_LEN; // 53.0
const FUNICULAR_RUN_X = FUNICULAR_BOT_WEST_X - FUNICULAR_TOP_WEST_X; // 32.7 m
const FUNICULAR_DROP_Y = 40.0; // THRESHOLD.y (-30) - VESPER.topY (-70)
const FUNICULAR_SLOPE = FUNICULAR_DROP_Y / FUNICULAR_RUN_X; // ~1.22324 (~50.73 deg)
const FUNICULAR_FLOOR_T = 0.18; // cabin deck thickness above inclined rail top at west edge
const FUNICULAR_BEAM_D = 0.55;  // rail beam vertical depth below rail top

export const FUNICULAR = {
  /** [x, y] of the cabin floor's west edge at top (-30) and bottom (-70) stops (Ruling 37). */
  top: [FUNICULAR_TOP_WEST_X, -30] as readonly [number, number],
  bottom: [FUNICULAR_BOT_WEST_X, -70] as readonly [number, number],
  /** Exact incline slope (rise / run) and angle in radians (~50.73 deg). */
  slope: FUNICULAR_SLOPE,
  slopeRad: Math.atan2(FUNICULAR_DROP_Y, FUNICULAR_RUN_X),
  floorThickness: FUNICULAR_FLOOR_T,
  beamDepth: FUNICULAR_BEAM_D,
  /** Horizontal inset from Crossing floor east edge (x = 58) to cabin east edge at bottom stop. */
  stopInset: 58 - FUNICULAR_BOT_EAST_X,
  /** Inclined rail top endpoints [x, y] running from top stop down to the bottom pit buffer beneath cabin east end. */
  railTopEnd: [FUNICULAR_TOP_WEST_X - 0.12, -30 - FUNICULAR_FLOOR_T + FUNICULAR_SLOPE * 0.12] as readonly [number, number],
  railBottomEnd: [FUNICULAR_BOT_EAST_X + 0.15, -70 - FUNICULAR_FLOOR_T - FUNICULAR_SLOPE * (FUNICULAR_LEN + 0.15)] as readonly [number, number],
  z: 74, cabinLength: FUNICULAR_LEN, cabinWidth: 2.4, cabinHeight: 2.6,
  /** Half-width (across z) of the inclined track slab/beam. */
  trackHalfWidth: 1.3,
  /** Swept-volume slot in the sky plane (y = -32) clearing both cabin roof and rail underside by >= 0.34 m. */
  skySlot: { xMin: 20.95, xMax: 28.65, halfZ: 1.6 },
  /** Bottom pit cut into the Crossing floor beneath the bottom stop (xMin clears descending rail underside at -70). */
  pit: { xMin: 52.15, xMax: FUNICULAR_BOT_EAST_X + 0.3, zMin: 74 - 1.5, zMax: 74 + 1.5, floorY: -76.0 },
  /** Crossing floor under-incline guard start X: everywhere rail underside is < 2.3 m above -70 (x >= 50.52) is guarded. */
  underTrackGuardXMin: 50.2,
  /** Top station alcove platform outside the east Threshold drum wall (flush at -30, approved deck uncut). */
  topStation: { xMin: 19.0, xMax: 24.8, zMin: 70.2, zMax: 77.8, portalHeight: 3.0 },
  /** Kinematics along the incline (metres/sec). */
  vmax: 3.0, accel: 0.7, minSpeed: 0.05, departDelay: 2.0, callRadius: 6.0, doorSeconds: 0.6,
} as const;

/** Elevation of the inclined funicular rail top at world x. */
export function funicularRailTopAt(x: number): number {
  return FUNICULAR.top[1] - FUNICULAR.floorThickness - FUNICULAR.slope * (x - FUNICULAR.top[0]);
}

/** Elevation of the inclined funicular rail beam underside at world x. */
export function funicularRailUndersideAt(x: number): number {
  return funicularRailTopAt(x) - FUNICULAR.beamDepth;
}

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

const SHELL_PLINTH_H = 0.45;
const SHELL_REVEAL = 0.4;
const SHELL_PANEL_H_NOMINAL = 1.5;
const SHELL_WALL_H = (SKY.y - SHELL_REVEAL) - (CAVERN.baseFloorY + SHELL_PLINTH_H); // 39.65 m
const SHELL_COURSES = Math.round(SHELL_WALL_H / SHELL_PANEL_H_NOMINAL); // 26

/** Monolith shell (src/world/metro/shell.ts): honed limestone panels on a STACK-BOND grid (aligned joints), hewn from one block. Metres. */
export const SHELL = {
  panelW: 3.0, panelH: SHELL_PANEL_H_NOMINAL, courses: SHELL_COURSES, courseH: SHELL_WALL_H / SHELL_COURSES,
  gap: 0.012, proud: 0.05,
  /** Recessed plinth at the foot of every cavern wall (top at baseFloorY + plinthH = -72.05). */
  plinthH: SHELL_PLINTH_H, plinthRecess: 0.3,
  /** Open band between the wall top (-32.4) and the sky plane (-32.0), lit by a cool emissive strip so the sky floats. */
  reveal: SHELL_REVEAL, revealSetback: 0.3,
  /** 30 mm shadow-gap reveal around wall openings; no vertical joint may fall within minOpeningJointClear of an opening edge. */
  openingRevealGap: 0.03, minOpeningJointClear: 0.3,
  /** Vertical emissive slots on walls >= slotMinWallLen: width, every 4th joint (12 m pitch), min clearance from openings/corners. */
  slotW: 0.12, slotPitch: 12, slotJointStride: 4, slotMinWallLen: 30, minSlotOpeningClear: 1.5,
  /** Re-entrant corners are cut at 45 degrees; each leg is this long. */
  chamfer: 0.6,
  /** Tunnel mouth depth shown behind each portal opening (dark liner until P3-6). */
  portalLiner: 4.0,
  /** Base floor field: flush brushed-stainless division strip pitch, width and height (0 = flush inlay; no brass in cavern). */
  floorGrid: 3.0, stripW: 0.06, stripH: 0,
} as const;

/** Portal openings in the end walls (clear size). Bottom at track bed (railY - bedBelowRail). */
export const PORTAL = { w: 5.0, h: 5.5, bedBelowRail: 0.6, frameDepth: 0.3, ringPitch: 6.0 } as const;

export interface PortalBoreSpec {
  readonly index: number;
  readonly line: 'meridian' | 'vesper' | 'halcyon';
  readonly track: 0 | 1;
  /** 'in' = track's portalIn end (arrivals); 'out' = track's portalOut end (departures). */
  readonly role: 'in' | 'out';
  /** World [x, y, z] of the bore opening centre at the wall mouth plane (y = bedY + PORTAL.h / 2). */
  readonly centre: readonly [number, number, number];
  /** World y of the tunnel track bed (railY - PORTAL.bedBelowRail). */
  readonly bedY: number;
  /** Unit horizontal [fx, fz] pointing OUT of the tunnel into the station (tunnel extends along -facing). */
  readonly facing: readonly [number, number];
}

/** Cross plan outline (x, z), counter-clockwise seen from above. */
export const CROSS_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [-20, 20], [20, 20], [20, 54], [60, 54], [60, 94], [20, 94], [20, 128], [-20, 128], [-20, 94], [-60, 94], [-60, 54], [-20, 54],
];

export const METRO_TRAIN = {
  cars: 4, carLength: 20, gap: 0.5, length: 81.5, width: 2.9, height: 4.0, doorsPerSidePerCar: 3,
  /** Half-aperture (single leaf width) of each car doorway; shared by trainModel.ts and psd.ts (Ruling 31). */
  doorHalf: 0.72,
} as const;
/** Full-height platform screen doors (src/world/metro/psd.ts). */
export const PSD = {
  inset: 0.35, height: 2.6, transomH: 0.25, mullionW: 0.05,
  /** Extra clearance each side beyond METRO_TRAIN.doorHalf so clear aperture >= train opening + 0.1 m (1.56 m). */
  doorHalfPad: 0.06,
  /** Perpendicular distance from track centre to the screen-door line (platform edge 1.55 + inset 0.35). */
  trackToDoorLine: 1.9,
} as const;

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
  /** Bridge engineering details (P3-3): expansion gap at nave end walls, hanger rhythm/dimensions, inlay offset. */
  expansionGap: 0.05,
  hangerPitch: 9.0,
  hangerX: 12.22,
  hangerRodR: 0.015,
  rosetteR: 0.125,
  inlayOffset: 0.5,
  inlayWidth: 0.08,
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

export interface CrossingBenchSpec {
  readonly x: number;
  readonly z: number;
  /** Long axis of the 2.4 m bench ('x' = east-west, 'z' = north-south). */
  readonly axis: 'x' | 'z';
}

/** Crossing floor detailing (P3-4): 1.5 m stainless terrazzo grid, enamel wayfinding inlays, glass panel T-grid, benches, well gate. */
export const CROSSING = {
  floorGrid: 1.5,
  stripW: 0.028,
  inlayWidth: 0.08,
  inlayOffset: 0.5,
  /** Glass floor T-grid: 13 × 12 panes (~1.54 × 1.50 m) with 0.10 m ceramic frit border on each pane. */
  glassPanesX: 13,
  glassPanesZ: 12,
  glassFritWidth: 0.10,
  /** Monolith honed-limestone bench dimensions (metres). */
  bench: { length: 2.4, depth: 0.5, height: 0.45 },
  /** Three groups of 2–3 benches facing the water wall, the onyx wall, and the open floor under the bridge. */
  benches: [
    // Group 1: west end facing the water wall (clear of F6 mouth z 66..69.6 and waterwall preset x -40)
    { x: -51.5, z: 74.0, axis: 'z' },
    { x: -51.5, z: 78.2, axis: 'z' },
    // Group 2: east end facing the onyx wall (flanking the funicular approach z 74, ahead of skyhole/funicular presets)
    { x: 46.5, z: 68.5, axis: 'z' },
    { x: 46.5, z: 79.5, axis: 'z' },
    // Group 3: open floor east of the bridge shadow (facing the open Crossing / disc well, clear of (20,74))
    { x: 14.5, z: 69.0, axis: 'x' },
    { x: 18.5, z: 69.0, axis: 'x' },
    { x: 16.5, z: 79.0, axis: 'x' },
  ] as readonly CrossingBenchSpec[],
  /** Half-angle (rad) of the south gangway opening in the r = 4.06 Crossing well balustrade ring (clear >= 2.4 m). */
  wellGateHalfAngle: 0.3054, // 17.5 deg -> 2 * 4.06 * sin(17.5°) = 2.44 m
  /** Gap left in the east (x = +58) glass balustrade for the funicular bottom station (P3-8b). */
  funicularEdgeGapZ: [71.8, 76.2] as readonly [number, number],
} as const;

/** Collision circles for every Crossing monolith bench (level VESPER.topY), spaced <= r apart for src/obstacles.ts. */
export function crossingBenchObstacleCircles(): Array<{ x: number; z: number; r: number }> {
  const out: Array<{ x: number; z: number; r: number }> = [];
  const r = CROSSING.bench.depth / 2; // 0.25 m
  const span = CROSSING.bench.length - 2 * r; // 1.9 m
  const steps = Math.ceil(span / r); // 8 segments -> 9 circles spaced 0.2375 m <= r
  for (const b of CROSSING.benches) {
    for (let k = 0; k <= steps; k++) {
      const off = -span / 2 + (span * k) / steps;
      out.push({
        x: b.axis === 'x' ? b.x + off : b.x,
        z: b.axis === 'z' ? b.z + off : b.z,
        r,
      });
    }
  }
  return out;
}

const SQRT1_2 = Math.SQRT1_2;
export const HALCYON = {
  centre: [-20, 74] as readonly [number, number],
  /** Unit long axis (x, z): north-east diagonal. */
  dir: [SQRT1_2, SQRT1_2] as readonly [number, number],
  halfLength: 45, halfWidth: 5,
  /** Deep-hall end sits this far beyond the 90 m island (hall length = ±55 m along axis). */
  portalExtra: 10,
  topY: -82, railY: -83.1,
  /** Hall ceiling soffit height (1 m under base floor -72.5, 2 m under Crossing slab underside -71.5). */
  ceilingY: -73.5,
  /** Coffer grid pitch along the hall axis & across width, and coffer recess depth. */
  cofferPitch: 3.0,
  cofferDepth: 0.24,
  /** Heights above platform (HALCYON.topY) of the two continuous horizontal cool light slots on the long walls. */
  lightSlotHeights: [2.4, 6.0] as readonly [number, number],
  /** Track centres either side of the island, perpendicular to the diagonal. */
  trackOffset: 6.55,
  /** Deep-hall half-width (walls) perpendicular to the diagonal. */
  hallHalfWidth: 10,
} as const;

export const GLASS_FLOOR = { xMin: -30, xMax: -10, zMin: 65, zMax: 83 } as const;

/** All 12 single-track tunnel bores (in pairs on Meridian, Vesper, and Halcyon end walls), aligned to src/metro/tracks.ts. */
export const PORTALS: readonly PortalBoreSpec[] = (() => {
  const mk = (
    index: number,
    line: PortalBoreSpec['line'],
    track: 0 | 1,
    role: 'in' | 'out',
    x: number,
    railY: number,
    z: number,
    fx: number,
    fz: number,
  ): PortalBoreSpec => {
    const bedY = railY - PORTAL.bedBelowRail;
    return { index, line, track, role, centre: [x, bedY + PORTAL.h / 2, z], bedY, facing: [fx, fz] };
  };
  const hp = HALCYON.halfLength + HALCYON.portalExtra; // 55
  const [hx, hz] = HALCYON.centre;
  const [ux, uz] = HALCYON.dir;
  const px = -uz, pz = ux;
  const hPos = (s: number, t: number): [number, number] => [hx + s * ux + t * px, hz + s * uz + t * pz];
  const [h0InX, h0InZ] = hPos(-hp, +HALCYON.trackOffset);
  const [h0OutX, h0OutZ] = hPos(+hp, +HALCYON.trackOffset);
  const [h1InX, h1InZ] = hPos(+hp, -HALCYON.trackOffset);
  const [h1OutX, h1OutZ] = hPos(-hp, -HALCYON.trackOffset);

  return [
    // Meridian (z = 20 south, z = 128 north): track 0 (x -10.55) runs +z, track 1 (x +10.55) runs -z
    mk(0, 'meridian', 0, 'in', MERIDIAN.trackX[0], MERIDIAN.railY, CAVERN.nave.zMin, 0, +1),
    mk(1, 'meridian', 0, 'out', MERIDIAN.trackX[0], MERIDIAN.railY, CAVERN.nave.zMax, 0, -1),
    mk(2, 'meridian', 1, 'in', MERIDIAN.trackX[1], MERIDIAN.railY, CAVERN.nave.zMax, 0, -1),
    mk(3, 'meridian', 1, 'out', MERIDIAN.trackX[1], MERIDIAN.railY, CAVERN.nave.zMin, 0, +1),
    // Vesper (x = -60 west, x = +60 east): track 0 (z 62.45) runs +x, track 1 (z 85.55) runs -x
    mk(4, 'vesper', 0, 'in', CAVERN.transept.xMin, VESPER.railY, VESPER.trackZ[0], +1, 0),
    mk(5, 'vesper', 0, 'out', CAVERN.transept.xMax, VESPER.railY, VESPER.trackZ[0], -1, 0),
    mk(6, 'vesper', 1, 'in', CAVERN.transept.xMax, VESPER.railY, VESPER.trackZ[1], -1, 0),
    mk(7, 'vesper', 1, 'out', CAVERN.transept.xMin, VESPER.railY, VESPER.trackZ[1], +1, 0),
    // Halcyon (s = ±55 diagonal): track 0 (t +6.55) runs +u, track 1 (t -6.55) runs -u
    mk(8, 'halcyon', 0, 'in', h0InX, HALCYON.railY, h0InZ, +ux, +uz),
    mk(9, 'halcyon', 0, 'out', h0OutX, HALCYON.railY, h0OutZ, -ux, -uz),
    mk(10, 'halcyon', 1, 'in', h1InX, HALCYON.railY, h1InZ, -ux, -uz),
    mk(11, 'halcyon', 1, 'out', h1OutX, HALCYON.railY, h1OutZ, +ux, +uz),
  ];
})();

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

/** Void environment capture point (inside the shaft, below the surface hall; captured in the surface state). */
export const VOID_LOOK = {
  capture: [0, -15, 74] as readonly [number, number, number],
} as const;

export const MAP_WALL = { z: 20, xMin: -20, xMax: 20, yMin: -41, yMax: -34 } as const;
export const WATER_WALL = { x: -60, zMin: 54, zMax: 94, yMin: -70, yMax: -34 } as const;

/**
 * Cloud-forest waterfall over the west wall (src/world/metro/waterWall.ts + waterfall*.ts). Rock depth is measured from x = WATER_WALL.x
 * toward +x and never exceeds maxDepth (face stays at x <= -58.35, clear of the Crossing floor edge at x = -58).
 * Cascades (z centre, ribbon width at the lip) keep clear of both Vesper bores (z 62.45, 85.55, 5 m wide + cut margin).
 */
export const WATERFALL = {
  yTop: WATER_WALL.yMax, yBase: -72.5, poolY: -72.26,
  maxDepth: 1.55,
  /** Clear margin around each bore opening where the rock is cut away (m, before snapping to the 0.2 x 0.14 m grid). */
  boreCutMargin: 0.4,
  cascades: [
    { z: 56.6, w: 1.5 },
    { z: 68.2, w: 2.2 },
    { z: 74.0, w: 5.0 },
    { z: 80.2, w: 2.6 },
    { z: 91.2, w: 1.6 },
  ] as ReadonlyArray<{ readonly z: number; readonly w: number }>,
} as const;
export const DROPLETS = { count: 2400, rInner: 21, rOuter: 38, yTop: -33, yBottomMin: -42, bridgeExclusionHalfX: 12.5 } as const;

/**
 * Cloud forest (user ruling 2026-11-23, docs/meridian-deep-handoff/CLOUD-FOREST-PLAN.md): planted in the non-walkable base
 * floor field (y = CAVERN.baseFloorY) of the two nave arms under the Meridian bridge and the two transept strips beyond the
 * Vesper tracks. Pure data; placement lives in src/metro/forestLayout.ts, geometry in src/world/metro/forest.ts.
 */
export const FOREST = {
  /** Planting beds (x, z), inset 0.6 m from the cavern walls. The transept beds stop short of the Vesper bores and the end walls. */
  beds: [
    { id: 'naveS', xMin: -19.4, xMax: 19.4, zMin: 20.6, zMax: VESPER.trackZ[0] - TRENCH.halfWidth - 0.3 },
    { id: 'naveN', xMin: -19.4, xMax: 19.4, zMin: VESPER.trackZ[1] + TRENCH.halfWidth + 0.3, zMax: 127.4 },
    { id: 'transS', xMin: -57.0, xMax: 57.0, zMin: 54.6, zMax: VESPER.trackZ[0] - TRENCH.halfWidth - 0.3 },
    { id: 'transN', xMin: -57.0, xMax: 57.0, zMin: VESPER.trackZ[1] + TRENCH.halfWidth + 0.3, zMax: 93.4 },
  ] as ReadonlyArray<{ readonly id: string } & Rect>,
  /** Absolute ceiling for any foliage: below the kinetic droplets (DROPLETS.yBottomMin) and the map wall. */
  capY: DROPLETS.yBottomMin - 1.5,
  /** Under the Meridian rail deck, wings and trains (|x| < bridgeHalfX) foliage stays below this. */
  bridgeHalfX: 12.7, underBridgeCapY: -49.6,
  /** Vesper train envelope beside the beds: nothing below envelopeTopY within envelopeHalfZ of a track centre. */
  vesperEnvelopeHalfZ: 1.95, vesperEnvelopeTopY: -66.4,
  /** F5 (north nave): nothing above the truss underside (step line - trussClear) inside the inner bands widened by bandPad. */
  f5TrussClear: 1.7, f5BandPad: 0.35,
  /** Ground terrain: mound height above the base floor and the grid pitch of the terrain mesh. */
  groundRise: 1.1, groundPitch: 0.7,
  /** Ground mist: height band (world y) and strength; drifts in REAL time. */
  mist: { yBottom: CAVERN.baseFloorY, yTop: -66.8, strength: 0.34, color: [0.80, 0.86, 0.86] as readonly [number, number, number] },
  /** Placement seed (deterministic forest). */
  seed: 2035,
} as const;

/** Depth zones (camera eye y). */
export const ZONES = {
  switchY: -16, hysteresis: 1,
  lookTopY: -4, lookBottomY: -30,
  surfaceSunFade: [-4, -14] as const,
  deepSunFade: [-18, -28] as const,
} as const;
