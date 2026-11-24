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

/**
 * Detailed slab track + trackside equipment (src/world/metro/track.ts, trackside.ts): cross-module dimensions.
 * Lateral values are metres from the track centre line; y values are metres relative to the rail-head height (railY).
 * Contract with the train: rail head top = railY, gauge 1435 mm (wheel treads 0.62..0.76 in trainModel.ts), and nothing but rails,
 * fastenings and balises above y = -0.05 inside |lateral| < envelopeHalfWidth.
 */
export const TRACK_DETAIL = {
  halfGauge: 1.435 / 2,
  /** Train dynamic envelope half-width (the PSD edge): equipment above y = -0.05 stays outside it. */
  envelopeHalfWidth: PSD.trackToDoorLine - PSD.inset,
  /** Bore inspection benches (mirrors portals.ts: 0.42 m wide, 0.55 m above the bore bed = 0.05 m below rail-head height). */
  boreBench: { width: 0.42, height: 0.55 },
  /** Lateral of the platform-end signal masts (outboard side); the 0.15 m head's inner edge sits at 1.595 m. */
  mastLat: 1.67,
  /**
   * Per line: which side the platform is on (same sign as the PSD row `side`: +1 = the track's right-hand normal (-dz, dx)),
   * platform length, the lateral of the platform-edge wall face (Vesper's retaining wall is 0.16 m thick about the 1.55 m edge),
   * and the y (rel. rail head) of the surfaces outboard equipment stands on: the trench/bed floor, and the mast foot
   * (Meridian: bridge wing kerb ledge at railY - 0.32; Vesper: trench coping at -0.44; Halcyon: the hall invert).
   */
  sites: {
    meridian: { platformSide: -1, platformHalfLen: 45, platformWallLat: 1.55, outboardFloorY: -0.32, mastBaseY: -0.32 },
    vesper: { platformSide: 1, platformHalfLen: 45, platformWallLat: 1.47, outboardFloorY: -0.58, mastBaseY: -0.44 },
    halcyon: { platformSide: -1, platformHalfLen: 45, platformWallLat: 1.55, outboardFloorY: -0.6, mastBaseY: -0.6 },
  },
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

/** Crossing floor detailing (P3-4): 1.5 m stainless terrazzo grid, enamel wayfinding inlays, glass panel T-grid, well gate (benches moved to PLATFORM_KIT). */
export const CROSSING = {
  floorGrid: 1.5,
  stripW: 0.028,
  inlayWidth: 0.08,
  inlayOffset: 0.5,
  /** Glass floor T-grid: 13 × 12 panes (~1.54 × 1.50 m) with 0.10 m ceramic frit border on each pane. */
  glassPanesX: 13,
  glassPanesZ: 12,
  glassFritWidth: 0.10,
  /** Half-angle (rad) of the south gangway opening in the r = 4.06 Crossing well balustrade ring (clear >= 2.4 m). */
  wellGateHalfAngle: 0.3054, // 17.5 deg -> 2 * 4.06 * sin(17.5°) = 2.44 m
  /** Gap left in the east (x = +58) glass balustrade for the funicular bottom station (P3-8b). */
  funicularEdgeGapZ: [71.8, 76.2] as readonly [number, number],
} as const;

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

/**
 * Live platform info screens (src/world/metro/infoScreens.ts): double-sided boards showing next train, crowding per car, a line map strip
 * and the line status. Meridian: one slim stainless column (90 mm) beside the island centre line with a cantilevered arm, board hung below it.
 * Halcyon: ceiling-hung on two rods along the island centre line (s = metres along the hall axis from the hall centre; clear of the F6 landing
 * s -20..-4 and the lift tubes s 0..8, and outside the glass-floor light well). Vesper: floor pylons beside the screen doors, between two door
 * pairs (x -34.1 and 27.4, clear of the glass floor, the F6 mouth and the benches). `tracks` index src/metro/tracks.ts TRACKS.
 */
export const INFO_SCREENS = {
  /** Overhead board (Meridian, Halcyon): 2:1, hung so its underside is `bottomAbove` m over the platform. */
  hang: { w: 1.9, h: 0.95, depth: 0.07, bottomAbove: 2.45 },
  /** Floor pylon (Vesper): portrait slab on a slim stem. */
  pylon: { w: 0.8, h: 1.6, depth: 0.08, bottomAbove: 0.45 },
  /** Meridian: column offset from the board centre along the board's width (m), column radius (90 mm dia), arm centre height over the platform, base plate radius. */
  meridian: { z: [46, 71, 96] as readonly number[], columnOffset: 1.35, columnR: 0.045, armAbove: 3.62, basePlateR: 0.2 },
  halcyon: { s: [-36, 18, 40] as readonly number[], rodHalfSpan: 0.7 },
  vesper: { x: [-34.1, 27.4] as readonly number[], z: [66.3, 81.7] as readonly number[] },
} as const;

export interface InfoScreenSpec {
  readonly id: string;
  readonly kind: 'hang' | 'pylon';
  readonly mount: 'masts' | 'ceiling' | 'floor';
  /** Board centre on the platform plane (world x, z). */
  readonly x: number;
  readonly z: number;
  /** Platform walking surface y. */
  readonly platformY: number;
  /** Unit horizontal normal of face A (face B faces the other way). */
  readonly normal: readonly [number, number];
  /** Indices into TRACKS this board describes (one or two). */
  readonly tracks: readonly number[];
}

export function infoScreenSpecs(): InfoScreenSpec[] {
  const out: InfoScreenSpec[] = [];
  INFO_SCREENS.meridian.z.forEach((z, i) => out.push({ id: `meridian${i}`, kind: 'hang', mount: 'masts', x: 0, z, platformY: MERIDIAN.topY, normal: [0, 1], tracks: [0, 1] }));
  INFO_SCREENS.vesper.x.forEach((x, i) => INFO_SCREENS.vesper.z.forEach((z, j) =>
    out.push({ id: `vesper${i}${j}`, kind: 'pylon', mount: 'floor', x, z, platformY: VESPER.topY, normal: [1, 0], tracks: [2 + j] })));
  INFO_SCREENS.halcyon.s.forEach((s, i) => out.push({
    id: `halcyon${i}`, kind: 'hang', mount: 'ceiling', platformY: HALCYON.topY, normal: [HALCYON.dir[0], HALCYON.dir[1]], tracks: [4, 5],
    x: HALCYON.centre[0] + HALCYON.dir[0] * s, z: HALCYON.centre[1] + HALCYON.dir[1] * s,
  }));
  return out;
}

/** Collision circles for the Meridian screen columns (island level) and Vesper floor pylons, with their `level`, for src/obstacles.ts. */
export function infoScreenObstacleCircles(): Array<{ x: number; z: number; r: number; level: number }> {
  const out: Array<{ x: number; z: number; r: number; level: number }> = [];
  for (const z of INFO_SCREENS.meridian.z) out.push({ x: INFO_SCREENS.meridian.columnOffset, z, r: INFO_SCREENS.meridian.basePlateR, level: MERIDIAN.topY });
  for (const x of INFO_SCREENS.vesper.x) {
    for (const z of INFO_SCREENS.vesper.z) {
      for (const dz of [-0.3, 0, 0.3]) out.push({ x, z: z + dz, r: 0.2, level: VESPER.topY });
    }
  }
  return out;
}

// ---- Platform life + station kit (src/world/metro/platformKit.ts) -----------------------------------------------------------

export type KitPlatformId = 'meridian' | 'vesper' | 'halcyon';
/** Platform frame: origin o on the centre line, unit u along the platform, v = (-u.z, u.x) across it. PSD lines stand at v = +-psdHalf. */
export interface KitFrame {
  readonly id: KitPlatformId;
  /** Walking surface y. */
  readonly y: number;
  readonly o: readonly [number, number];
  readonly u: readonly [number, number];
  readonly halfLen: number;
  readonly psdHalf: number;
}
export const PLATFORM_KIT_FRAMES: Readonly<Record<KitPlatformId, KitFrame>> = {
  meridian: { id: 'meridian', y: MERIDIAN.topY, o: [0, 74], u: [0, 1], halfLen: 45, psdHalf: MERIDIAN.island.xMax - PSD.inset },
  vesper: { id: 'vesper', y: VESPER.topY, o: [0, 74], u: [1, 0], halfLen: 45, psdHalf: VESPER.floor.zMax - 74 - PSD.inset },
  halcyon: { id: 'halcyon', y: HALCYON.topY, o: HALCYON.centre, u: HALCYON.dir, halfLen: HALCYON.halfLength, psdHalf: HALCYON.halfWidth - PSD.inset },
};
export const KIT_PLATFORMS: readonly KitPlatformId[] = ['meridian', 'vesper', 'halcyon'];

export type KitKind = 'planter' | 'perch' | 'help' | 'fire' | 'mast' | 'charger' | 'fountain' | 'kiosk' | 'lounge' | 'monitor' | 'gate';
/** Which way an item's front looks, in platform terms: 1 = +v, -1 = -v, 2 = +u, -2 = -u. */
export type KitFace = 1 | -1 | 2 | -2;
export interface KitItem {
  readonly kind: KitKind;
  readonly platform: KitPlatformId;
  /** Position on the platform plane: along (u) and across (v) the platform. */
  readonly u: number;
  readonly v: number;
  readonly face: KitFace;
  /** planter length (m). */
  readonly len?: number;
}

/**
 * Platform kit dimensions shared by the renderer, navigation and tests. Item footprints are plan boxes in the item's own frame
 * (x across the front, z along the front normal); the renderer builds everything to the same sizes.
 */
export const PLATFORM_KIT = {
  /** Tactile warning strip inside the PSD line: from `from` to `from + width` metres off the line, `height` tall; a fine light line `lightW` wide starts at `light`. */
  strip: { from: 0.12, width: 0.30, height: 0.006, light: 0.098, lightW: 0.012 },
  /** Car-position plaques (square, side `size`) stand `d` m off the PSD line at every car centre; the stop ticks mark the train ends. */
  plaque: { d: 1.05, size: 0.42 },
  /** Clear zone in front of every PSD door: half-width along the platform and depth off the PSD line (items never enter it). */
  doorKeep: { half: 1.4, depth: 2.0 },
  /** Items on the edge zone stand this far off the PSD line (centre of the footprint). */
  edgeD: 1.15,
  planter: { width: 0.8, seat: 0.40, defaultLen: 5.4 },
  perch: { len: 2.4 },
  kiosk: { len: 3.6, depth: 2.4, height: 2.7 },
  lounge: { len: 5.0, depth: 3.0, height: 2.6, door: 1.8 },
} as const;

/** Door centres along the platform (m from the platform centre): the same rule as src/metro/tracks.ts doorOffsets() (checked in nav-metro-test). */
export function kitDoorOffsets(): number[] {
  const { cars, carLength, gap, length, doorsPerSidePerCar: n } = METRO_TRAIN;
  const out: number[] = [];
  for (let c = 0; c < cars; c++) {
    const start = -length / 2 + c * (carLength + gap);
    for (let k = 0; k < n; k++) out.push(start + ((k + 0.5) * carLength) / n);
  }
  return out;
}
/** Centres of the cars along the platform. */
export function kitCarCentres(): number[] {
  const { cars, carLength, gap, length } = METRO_TRAIN;
  return Array.from({ length: cars }, (_, c) => -length / 2 + c * (carLength + gap) + carLength / 2);
}
/** Mid-points between neighbouring doors (11): the free bays along the PSD line where edge furniture may stand. */
export function kitGapSlots(): number[] {
  const d = kitDoorOffsets();
  return d.slice(1).map((x, i) => (x + d[i]!) / 2);
}

/** World (x, z) of platform coordinates (u, v). */
export function kitWorld(f: KitFrame, u: number, v: number): [number, number] {
  return [f.o[0] + u * f.u[0] - v * f.u[1], f.o[1] + u * f.u[1] + v * f.u[0]];
}
/** Unit world direction of a face code. */
export function kitFaceDir(f: KitFrame, face: KitFace): [number, number] {
  const s = face > 0 ? 1 : -1;
  return Math.abs(face) === 1 ? [-s * f.u[1], s * f.u[0]] : [s * f.u[0], s * f.u[1]];
}
/** Yaw (about +y) that turns a local +z front onto the face direction. */
export function kitYaw(f: KitFrame, face: KitFace): number {
  const [fx, fz] = kitFaceDir(f, face);
  return Math.atan2(fx, fz);
}

type Slot = readonly [slotIndex: number, kind: KitKind];
/**
 * Edge furniture per platform edge (e = +1 is the +v PSD line), as [gap slot index 0..10, kind]. The slots are the 11 bays between
 * doors (kitGapSlots), so no item ever stands in a door zone. Slots 2 and 10 are left empty on Meridian (F4 passes over z 52..58, the
 * F5 opening sits at z 107..114), slots 1..3 and 9 on Vesper (info pylons x -34.1 / 27.4, the glass floor x -30..-10), slots 3..7 on
 * Halcyon (F6 landing, lift tubes).
 */
const KIT_EDGE: Readonly<Record<KitPlatformId, { readonly p: readonly Slot[]; readonly n: readonly Slot[] }>> = {
  meridian: {
    p: [[0, 'fire'], [1, 'mast'], [3, 'help'], [4, 'perch'], [6, 'fountain'], [7, 'mast'], [8, 'help'], [9, 'perch']],
    n: [[0, 'mast'], [1, 'help'], [3, 'fire'], [5, 'fountain'], [6, 'perch'], [7, 'mast'], [8, 'fire'], [9, 'help']],
  },
  vesper: {
    p: [[4, 'help'], [5, 'fountain'], [7, 'mast'], [8, 'perch'], [10, 'fire']],
    n: [[4, 'mast'], [6, 'fire'], [7, 'help'], [8, 'perch'], [10, 'mast']],
  },
  halcyon: {
    p: [[0, 'mast'], [1, 'help'], [2, 'perch'], [8, 'fire'], [10, 'mast']],
    n: [[0, 'fire'], [2, 'mast'], [8, 'help'], [9, 'perch'], [10, 'mast']],
  },
};
/** Centre-line bench-planters (u, length), one phone charger standing at the north end of each; plus the amenity boxes. */
const KIT_CENTRE: Readonly<Record<KitPlatformId, { readonly planters: ReadonlyArray<readonly [number, number]>; readonly kiosk?: readonly [number, KitFace]; readonly lounge?: readonly [number, KitFace] }>> = {
  // Clear of the canopy exit (z < 34), the disc-well ring, the info columns (z 46, 71, 96) and the F5 opening.
  meridian: { planters: [[-36, 5.4], [-22.5, 5.4], [8.3, 5.4], [15.8, 5.4], [40.2, 5.4]], kiosk: [-13, 1], lounge: [31, 1] },
  // Clear of the well and the F5 foot (x -8.2..8.2), the glass floor (x -30..-10) and the funicular pit (x > 50).
  vesper: { planters: [[-43, 5.4], [-35.2, 5.4], [13, 5.4], [21, 5.4]], kiosk: [30.5, -1], lounge: [39.5, 1] },
  halcyon: { planters: [] },
};
/** End-of-platform kit, in metres along the platform from the centre: staff gate on the PSD line, system monitor in front of the last doors. */
const KIT_END = { gateU: 43.3, gateD: 0.10, monitorU: 40.9, monitorD: 1.7 } as const;

let kitItemsCache: readonly KitItem[] | null = null;
/** Every kit object of the three platforms (data-driven: add rows to KIT_EDGE / KIT_CENTRE to extend). */
export function kitItems(): readonly KitItem[] {
  if (kitItemsCache) return kitItemsCache;
  const out: KitItem[] = [];
  const slots = kitGapSlots();
  for (const id of KIT_PLATFORMS) {
    const f = PLATFORM_KIT_FRAMES[id];
    for (const e of [1, -1] as const) {
      for (const [si, kind] of KIT_EDGE[id][e > 0 ? 'p' : 'n']) {
        out.push({ kind, platform: id, u: slots[si]!, v: e * (f.psdHalf - PLATFORM_KIT.edgeD), face: (-e) as KitFace });
      }
      for (const s of [1, -1] as const) {
        out.push({ kind: 'gate', platform: id, u: s * KIT_END.gateU, v: e * (f.psdHalf - KIT_END.gateD), face: (-e) as KitFace });
        out.push({ kind: 'monitor', platform: id, u: s * KIT_END.monitorU, v: e * (f.psdHalf - KIT_END.monitorD), face: (s > 0 ? -2 : 2) as KitFace });
      }
    }
    const c = KIT_CENTRE[id];
    for (const [u, len] of c.planters) {
      out.push({ kind: 'planter', platform: id, u, v: 0, face: 1, len });
      out.push({ kind: 'charger', platform: id, u: u + len / 2 + 0.5, v: 0, face: 1 });
    }
    if (c.kiosk) out.push({ kind: 'kiosk', platform: id, u: c.kiosk[0], v: 0, face: c.kiosk[1] });
    if (c.lounge) out.push({ kind: 'lounge', platform: id, u: c.lounge[0], v: 0, face: c.lounge[1] });
  }
  kitItemsCache = out;
  return out;
}

/** Plan footprint of a kit object in its own frame (x across the front, z along the front normal); null = no footprint (flush fittings). */
export interface KitFoot { readonly shape: 'stadium' | 'box' | 'circle'; readonly hx: number; readonly hz: number; readonly cz: number }
export function kitFootprint(it: KitItem): KitFoot | null {
  switch (it.kind) {
    case 'planter': return { shape: 'stadium', hx: (it.len ?? PLATFORM_KIT.planter.defaultLen) / 2, hz: PLATFORM_KIT.planter.width / 2 + PLATFORM_KIT.planter.seat, cz: 0 };
    case 'perch': return { shape: 'stadium', hx: PLATFORM_KIT.perch.len / 2, hz: 0.3, cz: 0.12 };
    case 'help': return { shape: 'circle', hx: 0.14, hz: 0.14, cz: 0 };
    case 'fire': return { shape: 'box', hx: 0.3, hz: 0.15, cz: 0 };
    case 'mast': return { shape: 'circle', hx: 0.1, hz: 0.1, cz: 0 };
    case 'charger': return { shape: 'circle', hx: 0.13, hz: 0.13, cz: 0 };
    case 'fountain': return { shape: 'box', hx: 0.3, hz: 0.22, cz: 0 };
    case 'kiosk': return { shape: 'box', hx: PLATFORM_KIT.kiosk.len / 2, hz: PLATFORM_KIT.kiosk.depth / 2, cz: 0 };
    case 'monitor': return { shape: 'box', hx: 0.75, hz: 0.15, cz: 0 };
    case 'lounge': case 'gate': return null;
  }
}

/** Inside the waiting lounge (local frame, x along the front, z toward the front): benches along the back and one end wall, and a planted corner. */
export const KIT_LOUNGE_INTERIOR: ReadonlyArray<KitFoot & { readonly cx: number }> = [
  { shape: 'box', cx: -0.5, cz: -1.15, hx: 1.4, hz: 0.25 },
  { shape: 'box', cx: -2.25, cz: 0.1, hx: 0.25, hz: 1.05 },
  { shape: 'circle', cx: 1.95, cz: -1.0, hx: 0.45, hz: 0.45 },
];

/** Local-frame collision circles of a footprint (x, z, r). Stadiums are a row of circles of the half-depth; boxes a ring of circles at most 0.5 m wide. */
function footCircles(f: KitFoot, cx = 0): Array<[number, number, number]> {
  if (f.shape === 'circle') return [[cx, f.cz, f.hx]];
  const out: Array<[number, number, number]> = [];
  if (f.shape === 'stadium') {
    const r = Math.min(f.hz, f.hx), span = Math.max(0, f.hx - r) * 2;
    const n = Math.max(1, Math.ceil(span / Math.min(r, 0.6)));
    for (let k = 0; k <= n; k++) out.push([cx - span / 2 + (span * k) / n, f.cz, r]);
    return out;
  }
  const r = Math.min(0.5, f.hx, f.hz), ax = f.hx - r, az = f.hz - r;
  const nx = Math.max(1, Math.ceil((2 * ax) / 0.4)), nz = Math.max(1, Math.ceil((2 * az) / 0.4));
  for (let i = 0; i <= nx; i++) for (const sz of az < 1e-6 ? [0] : [-1, 1]) out.push([cx - ax + (2 * ax * i) / nx, f.cz + sz * az, r]);
  if (az >= 1e-6) for (let j = 1; j < nz; j++) for (const sx of [-1, 1]) out.push([cx + sx * ax, f.cz - az + (2 * az * j) / nz, r]);
  return out;
}

/** Local-frame circles (x, z, r) of one kit object. The lounge is a walkable glass box: thin wall circles with a door gap, plus the furniture. */
export function kitLocalCircles(it: KitItem): Array<[number, number, number]> {
  if (it.kind === 'lounge') {
    const L = PLATFORM_KIT.lounge, hx = L.len / 2, hz = L.depth / 2;
    const out: Array<[number, number, number]> = [];
    const wall = (x0: number, z0: number, x1: number, z1: number): void => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4));
      for (let k = 0; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, 0.1]);
    };
    wall(-hx, -hz, hx, -hz);
    wall(-hx, hz, -L.door / 2 - 0.1, hz);
    wall(L.door / 2 + 0.1, hz, hx, hz);
    wall(-hx, -hz, -hx, hz);
    wall(hx, -hz, hx, hz);
    for (const b of KIT_LOUNGE_INTERIOR) out.push(...footCircles(b, b.cx));
    return out;
  }
  const f = kitFootprint(it);
  return f ? footCircles(f) : [];
}

/** World collision circles of every kit object with their level, for src/obstacles.ts. */
export function kitObstacleCircles(): Array<{ x: number; z: number; r: number; level: number }> {
  const out: Array<{ x: number; z: number; r: number; level: number }> = [];
  for (const it of kitItems()) {
    const f = PLATFORM_KIT_FRAMES[it.platform];
    const [px, pz] = kitWorld(f, it.u, it.v);
    const yaw = kitYaw(f, it.face), c = Math.cos(yaw), s = Math.sin(yaw);
    for (const [lx, lz, r] of kitLocalCircles(it)) out.push({ x: px + lx * c + lz * s, z: pz - lx * s + lz * c, r, level: f.y });
  }
  return out;
}

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

/**
 * The Root Wall (user ruling 2026-11-23): a colossal strangler fig grows out of the east end wall (x = +60), its trunks braided
 * against the wall under the sky and its roots pouring ~35 m down to the base floor, arching over both Vesper east bores.
 * Pure data; plan and relief field live in src/metro/rootWallLayout.ts, geometry in src/world/metro/rootWall.ts.
 */
export const ROOT_WALL = {
  /** Wall face the relief stands on (the shell's stone panels face at x = 60 - SHELL.proud). */
  faceX: 59.95,
  /** Relief extent on the wall (the 0.6 m corner chamfers excluded) and trunk top / floor. */
  zMin: 54.7, zMax: 93.3, yTop: -33.3, yFloor: CAVERN.baseFloorY,
  /** Nothing of the fig may come nearer than boreMargin to a portal opening (z +-PORTAL.w/2, bed to bed + PORTAL.h); the relief fades out over boreSoft. */
  boreMargin: 0.15, boreSoft: 0.45,
  /** Relief depth caps (m in front of the face): roots below capRampY[0] stay within 58.6 <= x; the trunk mass may reach 57.0 above capRampY[1]. */
  depthCapLow: 1.28, depthCapHigh: 2.7, capRampY: [-58, -48] as readonly [number, number],
  /** Hard floor on x for any part of the fig below y = lowY (the Crossing floor edge is x = 58). */
  minXBelow: 57.0, lowY: -60, rootMinX: 58.6,
  /** Crown: foliage x range, clump top cap (below the sky plane), mirrors the droplet ring clearance. */
  crown: { xMin: 49.0, yMin: -45.5, yMax: -34.0, topCapY: -32.8, dropletClear: 0.5 },
  /** Aerial root strand length range (m) and the lowest point they may reach. */
  aerial: { lenMin: 10, lenMax: 20, yMin: -60 },
  /** Relief grid pitch (m) and placement seed. */
  gridPitch: 0.18, seed: 7731,
} as const;

/** A straight walkable run of a timber walk: axis-aligned, flat or sloped, `across` is the centre line's fixed coordinate. */
export interface WalkSeg {
  readonly id: string;
  /** stair = ramp <= 30 deg built as steps; bridge/deck/ramp = timber deck (ramp <= 1:12). */
  readonly kind: 'stair' | 'bridge' | 'deck' | 'ramp';
  readonly axis: 'x' | 'z';
  readonly across: number;
  readonly from: number;
  readonly to: number;
  readonly yFrom: number;
  readonly yTo: number;
}
/** Flat landing / corner pad of a walk. `open` lists the sides where a run joins (mouth centred on `c`, half `half`). */
export interface WalkPad {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly hx: number;
  readonly hz: number;
  readonly y: number;
  readonly open: ReadonlyArray<{ readonly side: 'n' | 's' | 'e' | 'w'; readonly c: number; readonly half: number }>;
}

/**
 * Canopy walk (user-approved 2026-11-23). Leaves the floating Meridian island through a gap in its SOUTH end balustrade
 * (x +-gapHalf, z = island.zMin), so no platform screen door is touched. South of the island (z 20..29, between the two
 * train lines, x within +-9) it is flat at the island deck level, climbs a 28 deg stair EAST to yCross, crosses OVER the east
 * train envelope (x 9.0..12.1, top y -43; deck underside >= 0.6 m above it) at z = 25.8 (south of the island, so clear of
 * every screen door, the hangers at z = 29 and the droplets), then turns NORTH and descends at 1:12 along x = 14.6 beside the
 * bridge (hangers at x = 12.22) through the east treetops to a viewing platform over the south nave arm at z 55.6..59.8.
 * Droplets (bottom >= -42, ring r 21..38 about (0, 74)) never come within 0.6 m of a walker's head (deck <= -44.4 there).
 * Hung from the buried sky on hairline stainless rods every ~4.6 m (like the bridge hangers). Width 2.0 m, rail line +-1.0.
 */
export const CANOPY_WALK = {
  halfWidth: 1.0,
  /** Gap half-width cut into the island south end balustrade (x = +-gapHalf). */
  gapHalf: 1.0,
  /** Deck level over the train envelope (envelope top is -43.0). */
  yCross: -42.0,
  /** Hairline rod pitch (m) and offset outside the rail line. */
  rodPitch: 4.6, rodOffset: 0.07,
  segs: [
    { id: 'exit', kind: 'deck', axis: 'z', across: 0, from: 29.0, to: 26.8, yFrom: -46, yTo: -46 },
    { id: 'stair', kind: 'stair', axis: 'x', across: 25.8, from: 1.0, to: 8.4, yFrom: -46, yTo: -42.0 },
    { id: 'cross', kind: 'bridge', axis: 'x', across: 25.8, from: 8.4, to: 13.6, yFrom: -42.0, yTo: -42.0 },
    { id: 'walk', kind: 'ramp', axis: 'z', across: 14.6, from: 26.8, to: 55.6, yFrom: -42.0, yTo: -44.4 },
  ] as readonly WalkSeg[],
  pads: [
    { id: 'turnS', x: 0, z: 25.8, hx: 1, hz: 1, y: -46, open: [{ side: 'n', c: 0, half: 1 }, { side: 'e', c: 25.8, half: 1 }] },
    { id: 'turnE', x: 14.6, z: 25.8, hx: 1, hz: 1, y: -42.0, open: [{ side: 'w', c: 25.8, half: 1 }, { side: 'n', c: 14.6, half: 1 }] },
    { id: 'view', x: 15.2, z: 57.7, hx: 2.1, hz: 2.1, y: -44.4, open: [{ side: 's', c: 14.6, half: 1 }] },
  ] as readonly WalkPad[],
} as const;

/**
 * Forest boardwalk (user-approved 2026-11-23), one route per side: EAST as written (south transept strip + south nave arm),
 * WEST is its point reflection about the cavern centre (x -> -x, z -> 148 - z: north strip + north nave arm), so no stair
 * ever sits near the F6 escalator mouth (west end of the Crossing floor, z 66..69.6). From the Crossing floor (y -70)
 * beyond the boarding zone: a 29 deg stair climbs along x just inside the Vesper screens to a landing at bridgeY, a
 * footbridge crosses OVER the Vesper track (screen doors top out at -67.4, trains at -67.1; deck top -66.0, underside -66.35,
 * 4.75 m above the rails) to a second landing in the strip, and a ~26 deg stair descends along the strip to ground level.
 * The boardwalk then flows along a Catmull-Rom spline (radius >= 4 m) through the strip, bends into the nave arm and runs
 * under the Meridian bridge to a round belvedere pad. Deck 0.4-0.7 m above the (mounded) forest floor, 1.8 m wide, timber
 * kerbs. Every rail line within nearTrack of a train centre line (same level +-6 m) is a full-height (2.65 m, 28 mm laminated) glass screen;
 * elsewhere a 1.1 m balustrade (plank level: only where the floor drops away more than dropRail). Trees, ferns and boulders are
 * kept off the route by forestLayout.planForest (see src/metro/walks.ts walkSamples).
 */
export const BOARDWALK = {
  halfWidth: 0.9, stairHalfWidth: 1.0,
  /** Deck above the forest floor, kerb height above the deck, steepest slope along the spline, station pitch, drop that needs a balustrade. */
  clearance: 0.38, kerbH: 0.1, slopeMax: 0.16, stationPitch: 0.6, dropRail: 0.8,
  bridgeY: -66.0,
  /** Rail lines nearer than this (m, horizontal) to a train centre line on the same level get the full-height screen. */
  nearTrack: 4.5, highScreen: 2.65,
  /** East-side coordinates (west reflects). */
  floorStair: { z: 66.2, xFoot: 48.0, xTop: 55.2 },
  bridge: { x: 56.2, zFloor: 65.2, zForest: 59.0 },
  descent: { z: 58.0, xTop: 55.2, xFoot: 43.6 },
  /** Spline control points (east) starting at the descent foot; the first leg is straight west so it continues the stair. */
  curve: [
    [43.6, 58.0], [40.4, 58.0], [37.0, 57.1], [31.5, 56.0], [25.5, 56.8], [20.0, 57.8], [15.5, 57.0], [12.3, 54.4],
    [10.7, 50.0], [10.9, 44.5], [10.1, 39.5], [10.5, 35.5],
  ] as ReadonlyArray<readonly [number, number]>,
  /** Round belvedere pad at the end of the curve. */
  endPadR: 1.5,
  /** Crossing-floor region hole under the stair, landing and bridge mouth (east side; west reflects). */
  floorHole: { xMin: 48.0, xMax: 58.5, zMin: 64.0, zMax: 67.6 },
  /** z of the reflection: west z = zMirror - east z. */
  zMirror: 148,
} as const;

/** Depth zones (camera eye y). */
export const ZONES = {
  switchY: -16, hysteresis: 1,
  lookTopY: -4, lookBottomY: -30,
  surfaceSunFade: [-4, -14] as const,
  deepSunFade: [-18, -28] as const,
} as const;

/**
 * Halcyon makeover (user-approved 2026-11-24, src/world/metro/halcyon.ts + halcyonArt.ts). All coordinates are hall-local:
 * s = metres along the hall axis from the hall centre (HALCYON.centre, +s = HALCYON.dir), t = metres across (+t = toward the NW wall,
 * the F6 cutting side), y = world height. The island walking surface is HALCYON.topY and the PSD door line sits at t = +-4.65.
 *
 *  - ceiling: warm oak slat bays along the hall axis at HALCYON.ceilingY, recessed warm light lines between the bays.
 *  - planter: kerbed oak beds down the island centre line, benches facing them on both sides. Beds stay out of the F6 landing
 *    (s -23..-3) and the lift landings (s -1.5..9.5) and keep a 2.5 m walking lane each side of the benches; the gaps between beds
 *    are the cross-overs between the two track sides.
 *  - artWall: the SE long wall (t = -10) between the two light slots' courses becomes the light-art ribbon.
 */
export const HALCYON_ART = {
  ceiling: {
    /** Slat width / pitch across the hall, depth above the soffit (soffit = HALCYON.ceilingY), module length along the hall. */
    slatW: 0.10, slatPitch: 0.175, slatDepth: 0.19, moduleLen: 3.0, jointGap: 0.008,
    /** Light-line centres across the hall (t) and their width; bays run between them and the walls. */
    lineT: [-8, -4, 0, 4, 8] as readonly number[], lineW: 0.16,
    /** Inset of the outermost slats from the long walls, and how far slats stop short of a ceiling opening (along s). */
    wallInset: 0.04, holePad: 0.34,
    /** Oak trim band around the light-well and F6 openings (width outside the opening). */
    trimW: 0.14,
  },
  planter: {
    /** Outer half-width of a bed, kerb height above the platform, kerb wall thickness, recessed plinth height and inset. */
    halfWidth: 1.0, kerbH: 0.56, wallT: 0.09, plinthH: 0.07, plinthInset: 0.05,
    /** Beds (s ranges). W1 is west of the F6 landing, E1/E2 east of the lifts; the 2.4 m gap between E1 and E2 is a cross-over. */
    beds: [
      { id: 'W1', s0: -39.0, s1: -26.0 },
      { id: 'E1', s0: 11.5, s1: 24.0 },
      { id: 'E2', s0: 26.4, s1: 38.5 },
    ] as ReadonlyArray<{ readonly id: string; readonly s0: number; readonly s1: number }>,
    /** Bench: gap between kerb and seat (leg room), seat depth/length/height, spacing between benches, backrest top. */
    bench: { gap: 0.35, depth: 0.45, length: 2.2, seatY: 0.45, spacing: 1.6, backTop: 0.8 },
    /** Hand-placed plant specimens (bed centre line offsets t). Tree ferns and small trees keep clear of the ceiling-hung info boards. */
    specimens: [
      { kind: 'tree', s: -29.6, t: 0.12, h: 3.9, seed: 11 },
      { kind: 'treeFern', s: -33.4, t: -0.30, h: 1.8, seed: 12 },
      { kind: 'treeFern', s: -37.9, t: 0.25, h: 1.0, seed: 13 },
      { kind: 'treeFern', s: -27.2, t: -0.35, h: 1.3, seed: 14 },
      { kind: 'treeFern', s: 12.9, t: 0.30, h: 1.2, seed: 21 },
      { kind: 'tree', s: 14.8, t: -0.15, h: 4.2, seed: 22 },
      { kind: 'treeFern', s: 21.4, t: 0.25, h: 1.8, seed: 23 },
      { kind: 'tree', s: 22.6, t: -0.30, h: 3.4, seed: 24 },
      { kind: 'treeFern', s: 27.9, t: -0.25, h: 1.6, seed: 31 },
      { kind: 'tree', s: 32.6, t: 0.10, h: 4.4, seed: 32 },
      { kind: 'treeFern', s: 36.2, t: 0.30, h: 1.9, seed: 33 },
      { kind: 'treeFern', s: 38.0, t: -0.20, h: 1.0, seed: 34 },
    ] as ReadonlyArray<{ readonly kind: 'tree' | 'treeFern'; readonly s: number; readonly t: number; readonly h: number; readonly seed: number }>,
    /** Specimens at least this tall stay this far (along s) from every ceiling-hung info board (trees: treeClear). */
    boardClear: 1.9, treeClear: 3.0,
  },
  artWall: {
    /** Wall side (-1 = SE, t = -10) and half length of the ribbon; the ends snap to the stack-bond joints of the wall. */
    side: -1 as const, halfLength: 36,
    /** Day/night: night weight multiplies the ribbon down to this fraction of its day light. */
    nightGain: 0.16,
  },
} as const;

/** World (x, z) of hall-local (s, t). */
export function halcyonPoint(s: number, t: number): [number, number] {
  const [ux, uz] = HALCYON.dir;
  return [HALCYON.centre[0] + s * ux - t * uz, HALCYON.centre[1] + s * uz + t * ux];
}

/** Hall-local (s, t) of world (x, z). */
export function halcyonLocal(x: number, z: number): [number, number] {
  const [ux, uz] = HALCYON.dir;
  const dx = x - HALCYON.centre[0], dz = z - HALCYON.centre[1];
  return [dx * ux + dz * uz, -dx * uz + dz * ux];
}

/** Benches facing the beds: centre s and side (+1 = NW, -1 = SE). Centred in each bed, both sides mirrored. */
export function halcyonBenches(): Array<{ s: number; side: 1 | -1; bed: string }> {
  const { beds, bench } = HALCYON_ART.planter;
  const out: Array<{ s: number; side: 1 | -1; bed: string }> = [];
  for (const b of beds) {
    const len = b.s1 - b.s0;
    const n = Math.max(1, Math.floor((len - 1.0 + bench.spacing) / (bench.length + bench.spacing)));
    const span = n * bench.length + (n - 1) * bench.spacing;
    const first = (b.s0 + b.s1) / 2 - span / 2 + bench.length / 2;
    for (let i = 0; i < n; i++) for (const side of [1, -1] as const) out.push({ s: first + i * (bench.length + bench.spacing), side, bed: b.id });
  }
  return out;
}

/** Collision circles (level HALCYON.topY) for every bed and bench (benches include the leg-room gap, so it is not a squeeze). */
export function halcyonPlanterObstacleCircles(): Array<{ x: number; z: number; r: number }> {
  const { beds, bench, halfWidth } = HALCYON_ART.planter;
  const out: Array<{ x: number; z: number; r: number }> = [];
  const row = (s0: number, s1: number, t: number, r: number): void => {
    const n = Math.max(1, Math.ceil((s1 - s0) / 0.4));
    for (let i = 0; i <= n; i++) {
      const [x, z] = halcyonPoint(s0 + ((s1 - s0) * i) / n, t);
      out.push({ x, z, r });
    }
  };
  for (const b of beds) for (const sg of [-1, 1]) row(b.s0 + 0.4, b.s1 - 0.4, sg * (halfWidth - 0.5), 0.5);
  for (const bn of halcyonBenches()) row(bn.s - bench.length / 2 + 0.25, bn.s + bench.length / 2 - 0.25, bn.side * (halfWidth + bench.gap + bench.depth - 0.5), 0.5);
  return out;
}

/**
 * Stream and koi pond (user-approved 2026-11-24). The stream leaves the west waterfall pool (x = -58.2, south segment, z 54..60.8) at
 * the pool surface (WATERFALL.poolY), winds east through the south transept strip (west half: no boardwalk there), crosses into the
 * south nave arm and ends in a dark koi pond 5 m west of the east boardwalk, in view of it. No culvert is needed.
 * The height field (src/metro/forestGround.ts) carves the channel and basin from this data; the base floor slab is at CAVERN.baseFloorY,
 * so every bed stays >= bedMinY above it and the water is shallow (<= maxDepth; the pond reads deep through its shading).
 * Pure data; plan and carve live in src/metro/streamPlan.ts, geometry in src/world/metro/stream*.ts.
 */
export const STREAM = {
  /** Water surface at the pool outlet, in the pond, and the extra drop of each riffle (the rest falls evenly along the channel). */
  level: { start: WATERFALL.poolY, pond: -72.36, riffleDrop: 0.016 },
  /** Lowest bed height (clear of the base floor slab) and deepest cut below the water surface. */
  bedMinY: CAVERN.baseFloorY + 0.03, maxDepth: 0.17,
  /** Bank crest above the water, its (lower) value at the pool outlet and the arc length over which it rises; bank ramp width; fade of the lifted mound. */
  rimH: 0.26, inletRimH: 0.07, inletRimLen: 5.0, bankRamp: 1.15, liftFade: 3.2,
  /** Centre line control points (x, z, half width of the water), Catmull-Rom. Weaves between the strip trees (z 55.9..59.0 in the strip). */
  path: [
    [-58.5, 57.6, 1.55], [-56.0, 56.9, 1.25], [-53.2, 56.0, 1.0], [-50.2, 55.9, 1.0], [-46.8, 56.1, 1.15], [-43.5, 57.5, 1.35],
    [-41.0, 58.7, 1.15], [-38.2, 58.9, 1.0], [-35.0, 58.2, 1.2], [-32.3, 57.0, 1.3], [-29.3, 56.2, 1.0], [-26.5, 56.4, 1.0],
    [-23.0, 57.4, 1.15], [-20.0, 58.3, 1.3], [-17.5, 58.8, 1.0], [-14.5, 58.9, 1.1], [-11.5, 58.4, 1.0], [-9.0, 56.8, 1.1],
    [-7.4, 54.0, 1.05], [-6.2, 51.0, 1.15], [-4.5, 48.3, 1.3], [-2.2, 47.0, 1.6],
  ] as ReadonlyArray<readonly [number, number, number]>,
  /** Riffles (water steps over stone clusters, foam): approximate points on the centre line. */
  riffles: [[-52.0, 55.95], [-40.0, 58.8], [-28.5, 56.25], [-15.0, 58.9], [-6.6, 52.4]] as ReadonlyArray<readonly [number, number]>,
  /** Koi pond: ellipse (semi-axes a along the local u axis, b along v, rotated by rot about +y) with soft lobes [amplitude, lobes, phase]. */
  pond: { cx: 0.0, cz: 46.0, a: 5.0, b: 3.4, rot: -0.28, lobes: [[0.045, 3, 0.7], [0.03, 5, 2.1]] as ReadonlyArray<readonly [number, number, number]> },
  /** Stepping stones: a line across the pond at local u = u, spanning v in [-span, span]. */
  steps: { count: 7, u: 2.9, span: 2.9 },
  /** Koi: Lissajous paths in the pond's local frame [cu, cv, ru, rv, w1, w2, phase1, phase2, length (m), kind 0 kohaku 1 sanke 2 ogon 3 shiro utsuri]. */
  koi: [
    [-0.9, 0.1, 2.1, 1.5, 0.050, 0.083, 0.3, 1.1, 0.62, 0],
    [-1.1, -0.2, 1.9, 1.7, 0.067, 0.041, 2.4, 0.2, 0.55, 1],
    [-0.6, 0.3, 2.1, 1.1, 0.037, 0.071, 4.1, 3.3, 0.7, 2],
    [-1.3, 0.0, 1.6, 1.8, 0.058, 0.047, 5.0, 4.4, 0.5, 0],
    [-0.4, -0.4, 1.9, 1.2, 0.044, 0.061, 1.2, 5.2, 0.58, 3],
    [-1.0, 0.4, 1.9, 1.45, 0.071, 0.053, 3.3, 2.0, 0.46, 1],
    [-0.7, -0.1, 2.2, 1.2, 0.033, 0.049, 0.9, 3.9, 0.66, 0],
    [-1.2, 0.2, 1.8, 1.35, 0.061, 0.077, 4.7, 0.7, 0.42, 2],
  ] as ReadonlyArray<readonly [number, number, number, number, number, number, number, number, number, number]>,
  /** Lily pads / lotus blooms on the pond (radius range in m). */
  lilies: { pads: 36, flowers: 4, radius: [0.1, 0.22] as readonly [number, number] },
  seed: 3141,
} as const;
