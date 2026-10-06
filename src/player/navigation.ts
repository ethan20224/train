import { Vector3 } from 'three';
import {
  ARCHES,
  BALCONY,
  COLONNADE,
  CONCOURSE,
  CROSS_PLATFORM,
  FOOTBRIDGE,
  GATES,
  ISLANDS,
  KIOSK,
  LOUNGE_ROOM,
  PLAYER,
  STAIR,
  gateLaneCentersX,
  type Rect,
} from '../layout';
import { tickets } from '../core/ticket';
import {
  CONCOURSE_OBSTACLES,
  FOOTBRIDGE_OBSTACLES,
  HOTEL_OBSTACLES,
  PLATFORM_OBSTACLES,
  SHED_OBSTACLES,
  SHOP_OBSTACLES,
} from '../obstacles';

/**
 * Walkable-surface queries, built ONLY from layout.ts (spec section 3 "Player" + Phase 4 "Systems").
 *
 * Model: the walkable area is a union of axis-aligned rectangles, each carrying a ground height (flat or
 * a ramp), minus circular obstacles (columns, kiosk, props). Regions overlap in plan view on different
 * LEVELS (footbridge deck over the islands). A point is resolved to the region whose ground there is
 * within LEVEL_TOLERANCE of the player's current feet y, so stairs / ramps connect levels and the deck
 * can never be entered from the ground except by its stairs. Tracks and everything else are simply
 * outside the union, so they can never be entered. Edges (platform, deck, balcony) are hard boundaries.
 *
 * Gate lanes are dynamic regions: walkable only while a ticket is held (core/ticket.ts).
 *
 * Coordinates returned are FEET positions (ground height). The controller adds eye height.
 */

const C = PLAYER.wallClearance;

/** Feet y must be within this of a region's ground there for the region to apply (stairs connect levels). */
const LEVEL_TOLERANCE = 0.6;
/** A prop obstacle with a `level` only applies when |ground - level| is under this. */
const OBSTACLE_LEVEL_TOLERANCE = 1.0;

interface Region extends Rect {
  /** Ground height; for ramps see `ramp`. */
  readonly y: number;
  readonly ramp?: { readonly zFrom: number; readonly zTo: number; readonly yFrom: number; readonly yTo: number };
  /** Gate lane corridor: only walkable while a ticket is held. */
  readonly gate?: boolean;
}

interface Circle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly level?: number;
}

const COLUMN_REACH = COLONNADE.shaftDiameter / 2 + PLAYER.radius; // 1.0 + 0.35
const KIOSK_REACH = KIOSK.footprintRadius + PLAYER.radius; // 3.5 + 0.35

const stairHalfOpening = STAIR.xMax - C; // 9.6: inside the stair balustrades
const stairBalustradeBlock = STAIR.xMax + PLAYER.radius; // 10.35: floor beside the stair is open from here

/** Bridge stair: walkable half-width (inside the balustrades) and the ground keep-out half-width beneath it. */
const BRIDGE_STAIR_WALK = FOOTBRIDGE.stairHalfWidth - C; // 1.0
const BRIDGE_STAIR_BLOCK = FOOTBRIDGE.stairHalfWidth + PLAYER.radius; // 1.75

/** All regions. Overlap in plan is fine: they are told apart by ground height. */
const REGIONS: readonly Region[] = (() => {
  const r: Region[] = [];

  // Balcony: whole width, balustrade (z = 8) blocks it everywhere except across the stair opening.
  r.push({
    xMin: BALCONY.xMin + C,
    xMax: BALCONY.xMax - C,
    zMin: BALCONY.zMin + C,
    zMax: BALCONY.balustradeZ - C,
    y: BALCONY.topY,
  });
  // Stair opening on the balcony level: through the balustrade line up to the first tread.
  r.push({
    xMin: -stairHalfOpening,
    xMax: stairHalfOpening,
    zMin: BALCONY.balustradeZ - C - 0.01,
    zMax: STAIR.zMin,
    y: BALCONY.topY,
  });
  // First-class lounge (Phase 4B): the doorway through the hall's south wall (z -2 -> 0) and the room's interior, both
  // at the balcony level. The room is sealed: its walls and windows are simply outside this union.
  r.push({
    xMin: LOUNGE_ROOM.door.xMin + C,
    xMax: LOUNGE_ROOM.door.xMax - C,
    zMin: LOUNGE_ROOM.zMax - C - 0.01,
    zMax: BALCONY.zMin + C + 0.01,
    y: LOUNGE_ROOM.floorY,
  });
  r.push({
    xMin: LOUNGE_ROOM.xMin + C,
    xMax: LOUNGE_ROOM.xMax - C,
    zMin: LOUNGE_ROOM.zMin + C,
    zMax: LOUNGE_ROOM.zMax - C,
    y: LOUNGE_ROOM.floorY,
  });
  // Grand staircase as a ramp 6 -> 0 over z in [8, 20].
  r.push({
    xMin: -stairHalfOpening,
    xMax: stairHalfOpening,
    zMin: STAIR.zMin,
    zMax: STAIR.zMax,
    y: STAIR.bottomY,
    ramp: { zFrom: STAIR.zMin, zTo: STAIR.zMax, yFrom: STAIR.topY, yTo: STAIR.bottomY },
  });

  // Concourse floor beside the stair (excludes the stair footprint and its balustrades), both sides.
  r.push({
    xMin: CONCOURSE.xMin + C,
    xMax: -stairBalustradeBlock,
    zMin: BALCONY.zMax + C,
    zMax: STAIR.zMax,
    y: CONCOURSE.floorY,
  });
  r.push({
    xMin: stairBalustradeBlock,
    xMax: CONCOURSE.xMax - C,
    zMin: BALCONY.zMax + C,
    zMax: STAIR.zMax,
    y: CONCOURSE.floorY,
  });

  // Concourse floor, split at the ticket-gate band: south of it and north of it. Nothing crosses the band
  // except the lane corridors below (the cabinets / glass screens fill the rest of the band).
  r.push({
    xMin: CONCOURSE.xMin + C,
    xMax: CONCOURSE.xMax - C,
    zMin: STAIR.zMax,
    zMax: GATES.zMin - C,
    y: CONCOURSE.floorY,
  });
  r.push({
    xMin: CONCOURSE.xMin + C,
    xMax: CONCOURSE.xMax - C,
    zMin: GATES.zMax + C,
    y: CONCOURSE.floorY,
    zMax: CONCOURSE.zMax - C,
  });
  // Gate lanes: corridor of the player's centre through each lane, walkable only with a ticket.
  for (const lx of gateLaneCentersX()) {
    r.push({
      xMin: lx - GATES.laneCorridorHalf,
      xMax: lx + GATES.laneCorridorHalf,
      zMin: GATES.zMin - C - 0.01,
      zMax: GATES.zMax + C + 0.01,
      y: CONCOURSE.floorY,
      gate: true,
    });
  }

  // North wall arch openings (x +-4.6 about each arch center), linking floor, wall thickness and cross platform.
  for (const cx of ARCHES.centersX) {
    r.push({
      xMin: cx - (ARCHES.width / 2 - C),
      xMax: cx + (ARCHES.width / 2 - C),
      zMin: CONCOURSE.zMax - C - 0.01,
      zMax: CROSS_PLATFORM.zMin + C + 0.01,
      y: 0,
    });
  }

  // Cross platform. Walkable edge keeps the clearance from the north wall and the platform edge toward the tracks.
  r.push({
    xMin: CROSS_PLATFORM.xMin + C,
    xMax: CROSS_PLATFORM.xMax - C,
    zMin: CROSS_PLATFORM.zMin + C,
    zMax: CROSS_PLATFORM.zMax - PLAYER.platformEdgeInset,
    y: CROSS_PLATFORM.topY,
  });

  // Island platforms: inset 0.6 from the long edges, joined to the cross platform, ending at z = 379.5.
  // The ground beneath each footbridge stair is NOT walkable: the island is routed around the stair footprint.
  ISLANDS.forEach((isl, idx) => {
    const xl = isl.xMin + PLAYER.platformEdgeInset;
    const xr = isl.xMax - PLAYER.platformEdgeInset;
    const zs = CROSS_PLATFORM.zMax - PLAYER.platformEdgeInset - 0.01;
    const ze = isl.zMax - PLAYER.platformEndInset;
    const c = FOOTBRIDGE.stairCentersX[idx] ?? isl.centerX;
    const bot = FOOTBRIDGE.stairBottomZ;
    const top = FOOTBRIDGE.stairTopZ;
    r.push({ xMin: xl, xMax: xr, zMin: zs, zMax: bot, y: isl.topY });
    r.push({ xMin: xl, xMax: c - BRIDGE_STAIR_BLOCK, zMin: bot, zMax: top, y: isl.topY });
    r.push({ xMin: c + BRIDGE_STAIR_BLOCK, xMax: xr, zMin: bot, zMax: top, y: isl.topY });
    r.push({ xMin: xl, xMax: xr, zMin: top, zMax: ze, y: isl.topY });

    // The stair: a straight ramp 0 -> deck height, climbing NORTH (south end at the ground, north end at the deck).
    r.push({
      xMin: c - BRIDGE_STAIR_WALK,
      xMax: c + BRIDGE_STAIR_WALK,
      zMin: bot,
      zMax: top,
      y: isl.topY,
      ramp: { zFrom: bot, zTo: top, yFrom: isl.topY, yTo: FOOTBRIDGE.deckTopY },
    });
    // Landing where the stair meets the deck (through the deck's south rail).
    r.push({
      xMin: c - BRIDGE_STAIR_WALK,
      xMax: c + BRIDGE_STAIR_WALK,
      zMin: top - 0.01,
      zMax: FOOTBRIDGE.zMin + C + 0.01,
      y: FOOTBRIDGE.deckTopY,
    });
  });

  // Footbridge deck: hard edges (rail clearance on all four sides).
  r.push({
    xMin: FOOTBRIDGE.walkXMin + C,
    xMax: FOOTBRIDGE.walkXMax - C,
    zMin: FOOTBRIDGE.zMin + C,
    zMax: FOOTBRIDGE.zMax - C,
    y: FOOTBRIDGE.deckTopY,
  });
  return r;
})();

const OBSTACLES: readonly Circle[] = [
  ...COLONNADE.xs.flatMap((x) => COLONNADE.zs.map((z): Circle => ({ x, z, r: COLUMN_REACH }))),
  { x: KIOSK.center[0], z: KIOSK.center[1], r: KIOSK_REACH },
  ...[...CONCOURSE_OBSTACLES, ...SHED_OBSTACLES, ...HOTEL_OBSTACLES, ...FOOTBRIDGE_OBSTACLES, ...PLATFORM_OBSTACLES, ...SHOP_OBSTACLES].map(
    (o): Circle => ({ x: o.x, z: o.z, r: o.r + PLAYER.radius, level: o.level }),
  ),
];

function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax;
}

function groundY(r: Region, z: number): number {
  const ramp = r.ramp;
  if (!ramp) return r.y;
  const t = Math.min(1, Math.max(0, (z - ramp.zFrom) / (ramp.zTo - ramp.zFrom)));
  return ramp.yFrom + (ramp.yTo - ramp.yFrom) * t;
}

/** True when a circular obstacle blocks (x, z) for a player standing on ground height `y`. */
function inObstacle(x: number, z: number, y: number): boolean {
  for (const o of OBSTACLES) {
    if (o.level !== undefined && Math.abs(y - o.level) >= OBSTACLE_LEVEL_TOLERANCE) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    if (dx * dx + dz * dz < o.r * o.r) return true;
  }
  return false;
}

/**
 * Ground height at (x, z) for a player whose feet are at `nearY` (undefined = no preference: the LOWEST
 * level there). `lanes`: gate lane corridors count as walkable.
 */
function groundAt(x: number, z: number, nearY: number | undefined, lanes: boolean): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const r of REGIONS) {
    if (r.gate && !lanes) continue;
    if (!inRect(r, x, z)) continue;
    const g = groundY(r, z);
    const d = nearY === undefined ? g : Math.abs(g - nearY);
    if (nearY !== undefined && d > LEVEL_TOLERANCE) continue;
    if (d >= bestD) continue;
    if (inObstacle(x, z, g)) continue;
    best = g;
    bestD = d;
  }
  return best;
}

let requireTicketOverride: boolean | null = null;
/** Test-only: force the ticket requirement on/off (null = follow GATES.requireTicket). */
export function setRequireTicketOverride(v: boolean | null): void {
  requireTicketOverride = v;
}
/** Whether a ticket is currently required to pass the gates. */
export const ticketRequired = (): boolean => requireTicketOverride ?? GATES.requireTicket;
const lanesOpen = (): boolean => !ticketRequired() || tickets.held !== null;

/** True when (x, z) is inside a gate lane corridor (used so nobody is ever trapped in a lane that closes). */
function inLane(x: number, z: number): boolean {
  // Strictly past the floor regions' edges (z = zMin - C and zMax + C): standing ON the edge is not "in" the lane.
  if (z <= GATES.zMin - C + 0.005 || z >= GATES.zMax + C - 0.005) return false;
  for (const r of REGIONS) if (r.gate && inRect(r, x, z)) return true;
  return false;
}

/**
 * Ground (feet) height at (x, z), or null where it is not walkable (void, tracks, walls, obstacles).
 * `nearY`: the player's current feet y, selecting the level where regions overlap (footbridge deck over
 * the islands). Omitted = the lowest level at that point.
 */
export function heightAt(x: number, z: number, nearY?: number): number | null {
  return groundAt(x, z, nearY, lanesOpen());
}

/** Max XZ distance moved per collision sub-step. Smaller than any obstacle, so nothing can be tunnelled. */
const MAX_STEP = 0.1;

/** Push (x, z) out of any circular obstacle (on level `y`) it is inside; returns the corrected point. */
function pushOutOfObstacles(x: number, z: number, y: number): [number, number] {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const o of OBSTACLES) {
      if (o.level !== undefined && Math.abs(y - o.level) >= OBSTACLE_LEVEL_TOLERANCE) continue;
      const dx = x - o.x;
      const dz = z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < o.r * o.r) {
        const d = Math.sqrt(d2) || 1e-6;
        const nx = d2 === 0 ? 1 : dx / d;
        const nz = d2 === 0 ? 0 : dz / d;
        x = o.x + nx * (o.r + 1e-4);
        z = o.z + nz * (o.r + 1e-4);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, z];
}

/**
 * Resolve a desired move from `prev` to `next` (feet positions; y of `prev` selects the level) against the
 * walkable area. Moves in sub-steps <= 0.1 m (never tunnels), slides along boundaries (axis-separated for
 * rectangle edges, tangential for circles), and returns the final feet position with y = ground height.
 * `prev` should be walkable; if it is not, the nearest handling is to return `prev` unchanged.
 */
export function resolve(prev: Vector3, next: Vector3): Vector3 {
  const out = new Vector3(prev.x, prev.y, prev.z);
  // Never trap anybody in a lane: while standing in one, lanes stay walkable even if the ticket went away.
  const lanes = lanesOpen() || inLane(prev.x, prev.z);
  let y = groundAt(prev.x, prev.z, prev.y, lanes) ?? groundAt(prev.x, prev.z, undefined, lanes) ?? null;
  if (y === null) return out;
  out.y = y;

  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-9) return out;

  const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
  const sx = dx / steps;
  const sz = dz / steps;
  let x = prev.x;
  let z = prev.z;

  for (let i = 0; i < steps; i++) {
    // Candidate moves in order of preference: full, then slide along X, then slide along Z.
    const candidates: ReadonlyArray<readonly [number, number]> = [
      [sx, sz],
      [sx, 0],
      [0, sz],
    ];
    let advanced = false;
    for (const [mx, mz] of candidates) {
      if (mx === 0 && mz === 0) continue;
      const [px, pz] = pushOutOfObstacles(x + mx, z + mz, y);
      const g = groundAt(px, pz, y, lanes);
      if (g !== null) {
        x = px;
        z = pz;
        y = g;
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      // Fully blocked this sub-step: close the remaining gap to the boundary (bisection) so the player
      // can touch walls / edges exactly instead of stopping up to MAX_STEP short, then stop.
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        const [px, pz] = pushOutOfObstacles(x + sx * mid, z + sz * mid, y);
        if (groundAt(px, pz, y, lanes) !== null) lo = mid;
        else hi = mid;
      }
      if (lo > 0) {
        const [px, pz] = pushOutOfObstacles(x + sx * lo, z + sz * lo, y);
        x = px;
        z = pz;
        y = groundAt(x, z, y, lanes) ?? y;
      }
      break;
    }
  }

  out.x = x;
  out.z = z;
  out.y = y;
  return out;
}

/** Exposed for tooling / debug overlays. Rectangles are the walkable union (obstacles excluded). */
export const walkableRegions: readonly Rect[] = REGIONS;
export const obstacleCircles: readonly Circle[] = OBSTACLES;
