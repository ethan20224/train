/**
 * Grand Meridian Terminal - world layout. SINGLE SOURCE OF TRUTH for every coordinate.
 *
 * Source: docs/superpowers/specs/2026-10-05-grand-meridian-design.md section 3.
 * Units: meters. +Y up. The hall axis runs along +Z (south -> north). The spec calls -X "west"
 * and +X "east" (the sun sits at -X). Note: a camera facing +Z has -X on its RIGHT.
 *
 * This file is dependency-free (no three.js) so Node scripts (navigation self-test) can import it.
 * No other module may hard-code these numbers.
 */

export type Vec2 = readonly [x: number, z: number];
export type Vec3 = readonly [x: number, y: number, z: number];

/** Axis-aligned rectangle in the XZ plane. */
export interface Rect {
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

// ---------------------------------------------------------------------------
// Concourse (z 0 -> 102)
// ---------------------------------------------------------------------------
export const CONCOURSE = {
  xMin: -30,
  xMax: 30,
  zMin: 0,
  /** Inner face of the north wall (arches pierce it). */
  zMax: 100,
  floorY: 0,
  /** North wall occupies z in [zMax, zMax + northWallThickness]. */
  northWallThickness: 2,
  /** Outer face of the north wall = start of the cross platform. */
  northWallZMax: 102,
  width: 60,
  length: 100,
} as const;

/** Barrel vault along Z, coffered. */
export const VAULT = {
  springlineY: 24,
  radius: 30,
  crownY: 54,
} as const;

/** Freestanding colonnade tied to the walls by an entablature. */
export const COLONNADE = {
  /** Column row x positions (both rows). */
  xs: [-23, 23] as const,
  zs: [20, 32, 44, 56, 68, 80] as const,
  shaftDiameter: 2.0,
  height: 20,
  entablatureYMin: 20,
  entablatureYMax: 24,
} as const;

/** Bays between columns (centers), plus which carry the giant arched windows. */
export const BAYS = {
  centersZ: [26, 38, 50, 62, 74] as const,
  /** Giant arched windows on BOTH side walls (x = +-30). Other bays are blind arches with marble panels. */
  windowCentersZ: [26, 50, 74] as const,
  /** Z span of a bay (centers are 12 m apart, columns 2 m wide). */
  spacing: 12,
} as const;

export const WINDOW = {
  width: 10,
  sillY: 3,
  /** Straight jambs run from sill to here; the semicircular head (radius 5) sits on top. */
  springY: 17,
  headRadius: 5,
  topY: 22,
} as const;

/** South end wall: large semicircular lunette window above the balcony, under the vault. */
export const LUNETTE = {
  zWall: 0,
  baseY: 24,
  topY: 54,
  /** Semicircle spanning the full vault width. */
  radius: 30,
} as const;

export const BALCONY = {
  xMin: -30,
  xMax: 30,
  zMin: 0,
  zMax: 8,
  topY: 6,
  /** Balustrade runs along z = zMax except across the stair opening. */
  balustradeZ: 8,
} as const;

export const STAIR = {
  xMin: -10,
  xMax: 10,
  zMin: 8,
  zMax: 20,
  topY: 6,
  bottomY: 0,
  risers: 40,
  riserHeight: 0.15,
  treadDepth: 0.3,
} as const;

/** Information kiosk with four-faced brass clock. */
export const KIOSK = {
  center: [0, 50] as Vec2,
  footprintRadius: 3.5,
  clockY: 7.5,
  /** Hands frozen at 6:47; only the second hand ticks (then snaps back). */
  frozenTime: { hours: 6, minutes: 47 },
} as const;

/** Split-flap departures board, facing -Z (visible from the balcony). */
export const BOARD = {
  center: [0, 19, 99.9] as Vec3,
  width: 16,
  height: 5,
} as const;

/** North wall arched openings leading to the train shed. */
export const ARCHES = {
  centersX: [-20, 0, 20] as const,
  width: 10,
  /** Straight jambs + arched head reach this height. */
  height: 15,
  zMin: 100,
  zMax: 102,
} as const;

// ---------------------------------------------------------------------------
// Train shed, platforms, tracks (z 102 -> 360 roofed; tracks run on to z = 1400)
// ---------------------------------------------------------------------------
export const SHED = {
  xMin: -32,
  xMax: 32,
  zMin: 102,
  zMax: 360,
  trussSpacing: 12,
  springlineY: 10,
  crownY: 34,
  /** Side walls x = +-32: stone plinth up to here, then open iron arcade. */
  plinthHeight: 3,
} as const;

export const CROSS_PLATFORM = {
  xMin: -30,
  xMax: 30,
  zMin: 102,
  zMax: 108,
  topY: 0,
} as const;

export interface IslandPlatform {
  readonly id: 'A' | 'B' | 'C';
  readonly xMin: number;
  readonly xMax: number;
  readonly centerX: number;
  readonly zMin: number;
  readonly zMax: number;
  readonly topY: number;
}

/** Island platforms extend past the shed roof (z = 360) to z = 380 then end. */
export const ISLANDS: readonly IslandPlatform[] = [
  { id: 'A', xMin: -25, xMax: -15, centerX: -20, zMin: 108, zMax: 380, topY: 0 },
  { id: 'B', xMin: -5, xMax: 5, centerX: 0, zMin: 108, zMax: 380, topY: 0 },
  { id: 'C', xMin: 15, xMax: 25, centerX: 20, zMin: 108, zMax: 380, topY: 0 },
];

export interface TrackDef {
  readonly id: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
  readonly centerX: number;
  /** Public platform number served by this track. */
  readonly platformNumber: 1 | 2 | 3 | 4 | 5 | 6;
  /** Island whose face this track runs along. */
  readonly island: 'A' | 'B' | 'C';
  /** Which side of that island the track is on. */
  readonly side: 'west' | 'east';
}

/** 1 = T1 (A west face), 2 = T2 (A east), 3 = T3 (B west), 4 = T4 (B east), 5 = T5 (C west), 6 = T6 (C east). */
export const TRACKS: readonly TrackDef[] = [
  { id: 'T1', centerX: -27.5, platformNumber: 1, island: 'A', side: 'west' },
  { id: 'T2', centerX: -12.5, platformNumber: 2, island: 'A', side: 'east' },
  { id: 'T3', centerX: -7.5, platformNumber: 3, island: 'B', side: 'west' },
  { id: 'T4', centerX: 7.5, platformNumber: 4, island: 'B', side: 'east' },
  { id: 'T5', centerX: 12.5, platformNumber: 5, island: 'C', side: 'west' },
  { id: 'T6', centerX: 27.5, platformNumber: 6, island: 'C', side: 'east' },
];

export const RAIL = {
  gauge: 1.435,
  /** Rail top height; platform top is y = 0. */
  topY: -1.1,
  /** Buffer stops at this z on every track. */
  bufferStopZ: 108.5,
  /** Trains stop with their nose at this z. */
  trainStopNoseZ: 111,
  /** Tracks continue to here into the haze. */
  endZ: 1400,
} as const;

/** Train spawn / cruise parameters shared by scheduler and layout-aware code. */
export const TRAIN_ROUTE = {
  spawnZ: 1300,
  despawnZ: 1400,
  /** Train physical envelope. */
  width: 3.2,
  heightAboveRail: 4.4,
} as const;

// ---------------------------------------------------------------------------
// Sun & atmosphere
// ---------------------------------------------------------------------------
const SUN_RAW: Vec3 = [-0.912, 0.242, -0.332];
const sunLen = Math.hypot(SUN_RAW[0], SUN_RAW[1], SUN_RAW[2]);
/** Unit vector pointing TOWARD the sun (elevation ~14 deg, west-south-west). */
export const SUN_DIRECTION: Vec3 = [SUN_RAW[0] / sunLen, SUN_RAW[1] / sunLen, SUN_RAW[2] / sunLen];

export const FOG = {
  /** Warm gold; tuned visually in Phase 2. */
  color: 0xc9955e,
  density: 0.004,
} as const;

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
export const PLAYER = {
  eyeHeight: 1.7,
  radius: 0.35,
  walkSpeed: 3.2,
  runSpeed: 6,
  /** Wall clearance used by the walkable regions (radius + 0.05 safety). */
  wallClearance: 0.4,
  /** Inset from platform edges (keeps the player off the track side). */
  platformEdgeInset: 0.6,
  /** Inset from the far end of the island platforms. */
  platformEndInset: 0.5,
} as const;

/** Start: on the balcony facing +Z, pitched down 8 degrees into the concourse. */
export const START_POSE = {
  /** Feet position; eye = y + PLAYER.eyeHeight. */
  position: [0, BALCONY.topY, 3] as Vec3,
  /** Camera Euler-Y in radians. A three.js camera looks along -Z at yaw 0, so facing +Z (north) is PI. */
  yaw: Math.PI,
  pitchDeg: -8,
} as const;

// ---------------------------------------------------------------------------
// Phase 4 (docs/superpowers/specs/2026-10-05-grand-meridian-phase4-hotel-ritual.md)
// ---------------------------------------------------------------------------

/** Ticket barrier gates across the concourse in front of the three north arches. */
export const GATES = {
  /** true = the ticket ritual: gate lanes open only for a player holding a ticket (navigation + paddles + prompt). */
  requireTicket: true,
  lineZ: 95,
  /** Cabinets occupy this z band; navigation blocks it except open lanes. */
  zMin: 94.4,
  zMax: 95.6,
  bankCentersX: [-20, 0, 20] as const,
  lanesPerBank: 7,
  laneWidth: 1.1,
  cabinetWidth: 0.3,
  /** Lane i (0..6) center x = bankX + (i - 3) * lanePitch. */
  lanePitch: 1.4,
  /** Bank width = 7 * 1.1 + 8 * 0.3. */
  bankWidth: 10.1,
  /** Player-center corridor half-width inside an open lane. */
  laneCorridorHalf: 0.2,
  /** Brass-framed glass screens fill the band between banks and out to the walls. */
  screenHeight: 1.3,
  screenXMin: -29.6,
  screenXMax: 29.6,
  /** Keep-clear approach zone in front of each bank (both sides). */
  approachZMin: 88,
} as const;

export const gateLaneCentersX = (): number[] =>
  GATES.bankCentersX.flatMap((bx) => Array.from({ length: GATES.lanesPerBank }, (_, i) => bx + (i - 3) * GATES.lanePitch));

/** Booking office: west under-balcony frontage, facing +Z at the balcony face plane z = 8. */
export const BOOKING_OFFICE = {
  faceZ: 8,
  xMin: -29.6,
  xMax: -10.6,
  windowCentersX: [-25.5, -20.5, -15.5] as const,
  counterHeight: 1.05,
  windowWidth: 1.6,
  windowHeight: 1.4,
  /** Interaction zone per window: |x - windowX| < halfWidth and z in [zMin, zMax] at floor level. */
  interact: { halfWidth: 1.0, zMin: 8.4, zMax: 10.2 },
} as const;

/** Concierge: east under-balcony frontage + freestanding reception desk. */
export const CONCIERGE = {
  faceZ: 8,
  xMin: 10.6,
  xMax: 29.6,
  desk: { xMin: 15, xMax: 25, zMin: 9.4, zMax: 10.6 },
  bell: [20, 1.1, 9.6] as Vec3,
  interact: { centerX: 20, halfWidth: 1.5, zMin: 10.6, zMax: 12.2 },
} as const;

/** Ornate iron footbridge across the train shed. */
export const FOOTBRIDGE = {
  centerZ: 228,
  zMin: 226.2,
  zMax: 229.8,
  deckTopY: 7.0,
  soffitY: 6.2,
  /** Walkable deck extent. */
  walkXMin: -21.4,
  walkXMax: 21.4,
  /** Visual structure may extend to the shed walls. */
  structureXMin: -31.5,
  structureXMax: 31.5,
  /** One stair per island, centered on the island, descending SOUTH. */
  stairCentersX: [-20, 0, 20] as const,
  stairHalfWidth: 1.4,
  stairTopZ: 226.2,
  stairBottomZ: 214.2,
} as const;

/** First-class lounge on the balcony (y = BALCONY.topY). Central zone stays clear. */
export const LOUNGE = {
  y: BALCONY.topY,
  wings: [
    { xMin: -29.6, xMax: -11, zMin: 0.4, zMax: 7.6 },
    { xMin: 11, xMax: 29.6, zMin: 0.4, zMax: 7.6 },
  ] as const,
  clearXMin: -10,
  clearXMax: 10,
} as const;

/**
 * Phase 4D: half-height platform edge doors + glowing edge line. SINGLE SOURCE OF TRUTH for the door
 * z offsets, used by BOTH the platform doors (world/safety) and the carriage door outlines (trains/trainModel).
 * Offsets are measured from the train NOSE (world z = nose + offset; the consist extends toward +z).
 */
const CONSIST = { locoLength: 24, carLength: 25, carCount: 5, gap: 1 } as const; // must match trains/trainModel.ts (checked at build time)
/** Carriage door centres in car-local z (existing vestibule doors); the tail car only has the front one. */
const CAR_DOOR_LOCAL_Z = [1.1, 23.9] as const;
const doorOffsets = (): number[] => {
  const out: number[] = [];
  for (let i = 0; i < CONSIST.carCount; i++) {
    const start = CONSIST.locoLength + CONSIST.gap + i * (CONSIST.carLength + CONSIST.gap);
    out.push(start + CAR_DOOR_LOCAL_Z[0]);
    if (i < CONSIST.carCount - 1) out.push(start + CAR_DOOR_LOCAL_Z[1]);
  }
  return out;
};
export const PLATFORM_SAFETY = {
  consist: CONSIST,
  carDoorLocalZ: CAR_DOOR_LOCAL_Z,
  /** Carriage door leaf width (train side). */
  carDoorWidth: 1.3,
  /** Door z centres relative to the nose (world = nose + offset). */
  doorOffsets: doorOffsets(),
  /** Platform door clear opening (two leaves of half this width). */
  openingWidth: 1.5,
  /** Barrier line this far inside the island edge. */
  barrierInset: 0.35,
  /** Glowing edge strip centre this far inside the island edge. */
  edgeLightInset: 0.7,
  barrierHeight: 1.3,
  /** Barrier z extent (starts at the cross-platform barrier line so the corners close). */
  zMin: 107.65,
  zMax: 379.65,
  edgeLightZMin: 108,
  edgeLightZMax: 379.4,
  /** Behaviour timings (s). */
  openDelay: 1.5,
  slideTime: 1.2,
  closedBeforeDeparture: 6,
} as const;

/**
 * First-class lounge: a SEPARATE hushed hotel-lobby room behind the hall's south wall at balcony level,
 * entered through tall double doors centered in the south wall (wall occupies z in [-2, 0]).
 */
export const LOUNGE_ROOM = {
  floorY: BALCONY.topY,
  /** Interior (inner wall faces). */
  xMin: -15,
  xMax: 15,
  zMin: -24,
  zMax: -2,
  /** Lower, intimate coffered ceiling (vs the 54 m vault). */
  ceilingY: BALCONY.topY + 6.5,
  /** Own exterior walls are this thick, outside the interior box. */
  wallThickness: 0.6,
  /** Doorway through the hall's south wall (z -2 -> 0). */
  door: { xMin: -1.8, xMax: 1.8, height: 4.6, zMin: -2, zMax: 0 },
  /** Windows that admit the low south-west sun: south wall (z = zMin) and west wall (x = xMin). */
  southWindowCentersX: [-9, 0, 9] as const,
  westWindowCentersZ: [-18, -9] as const,
  windowWidth: 2.4,
  windowSillY: BALCONY.topY + 0.9,
  windowHeadY: BALCONY.topY + 5.4,
} as const;
