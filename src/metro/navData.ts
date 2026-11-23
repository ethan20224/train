import { PLAYER } from '../layout';
import {
  DISC, ESCALATOR, F3_LOW_FOOTPRINT_Z0, FLIGHTS, ESCALATOR_BANDS, FUNICULAR, GLASS_FLOOR, HALCYON, LANDINGS, LIFTS, MERIDIAN, OCULUS, PSD, SPEED_GATES, THRESHOLD, THROAT, VESPER, escalatorUnits, fareBlockers,
} from '../layoutMetro';
import { boundsOf, circleShape, obbShape, rectShape, type Region, type Shape } from '../player/regions';
import { escalators } from './escalators';

/** Static metro walkability (spec §2). Movers and their gangways are dynamic (src/metro/disc.ts). */
const C = PLAYER.wallClearance;
const F3 = FLIGHTS.find((f) => f.id === 'F3')!;
const { cx, cz } = OCULUS;
const liftHoles = (): Shape[] => LIFTS.positions.map(([x, z]) => circleShape(x, z, LIFTS.tubeR + C));
const bandHoles = (bands: readonly (readonly [number, number])[], zMin: number, zMax: number): Shape[] =>
  bands.map(([a, b]) => rectShape(a - C, b + C, zMin, zMax));

/** Holes in the Grand Hall floor region: the oculus (to the curb) and the two F1 throats. */
export const HALL_HOLES: readonly Shape[] = [
  circleShape(cx, cz, OCULUS.curbOuterR + C),
  ...THROAT.bands.map(([a, b]) => rectShape(a - C, b + C, THROAT.zMin, THROAT.zMax + C)),
];

/**
 * The fare line as holes in every region that spans the Threshold level (annulus, bridge, funicular top station): each cabinet and
 * glass run padded by SPEED_GATES.collidePad. A region hole (not an obstacle circle) so the seal is exact and costs nothing per query.
 * Lanes are simply the gaps between the cabinet holes.
 */
const fareHoles = (): Shape[] => fareBlockers().map((b) => rectShape(b.xMin - SPEED_GATES.collidePad, b.xMax + SPEED_GATES.collidePad, b.zMin - SPEED_GATES.collidePad, b.zMax + SPEED_GATES.collidePad));

function landing(l: { y: number; zMin: number; zMax: number; halfX: number }, holes?: readonly Shape[]): Region {
  return { xMin: -l.halfX + C, xMax: l.halfX - C, zMin: l.zMin + C, zMax: l.zMax - C, y: l.y, ...(holes ? { holes } : {}) };
}

function escalatorRegions(): Region[] {
  const h = ESCALATOR.walkCorridorHalf;
  const ext = ESCALATOR.endOverlap;
  return escalatorUnits().map((u): Region => {
    const lo = Math.min(u.from, u.to) - ext;
    const hi = Math.max(u.from, u.to) + ext;
    const rect = u.axis === 'z'
      ? { xMin: u.across - h, xMax: u.across + h, zMin: lo, zMax: hi }
      : { xMin: lo, xMax: hi, zMin: u.across - h, zMax: u.across + h };
    return {
      ...rect,
      y: u.yTo,
      ramp: { axis: u.axis, from: u.from, to: u.to, yFrom: u.yFrom, yTo: u.yTo },
      conveyor: { axis: u.axis, speed: () => escalators.velocity(u.id) },
    };
  });
}

/** Every static metro region. Order matters on exact ties: levels before escalators, so conveyors stop at the ends. */
export function metroStaticRegions(): Region[] {
  const inner = ESCALATOR_BANDS.inner;
  const annulus = circleShape(cx, cz, THRESHOLD.rOuter - C);
  const isl = MERIDIAN.island;
  const doorX = isl.xMax - PSD.inset - C;
  const floor = VESPER.floor;
  const [hx, hz] = HALCYON.centre;
  const [ux, uz] = HALCYON.dir;
  const deep = obbShape(hx, hz, ux, uz, HALCYON.halfLength - C, HALCYON.halfWidth - PSD.inset - C);
  const fare = fareHoles();
  return [
    landing(LANDINGS.L1),
    landing(LANDINGS.L2),
    { ...boundsOf(annulus), y: THRESHOLD.y, circle: annulus, holes: [circleShape(cx, cz, THRESHOLD.rInner + C), ...bandHoles(ESCALATOR_BANDS.outer, F3_LOW_FOOTPRINT_Z0, F3.to - 0.3), ...liftHoles(), ...fare] },
    landing(LANDINGS.thresholdBridge, fare),
    // Funicular top station side landings outside the east Threshold drum wall (flush at -30; cabin bay cut out)
    {
      xMin: FUNICULAR.topStation.xMin, xMax: FUNICULAR.topStation.xMax - C,
      zMin: FUNICULAR.topStation.zMin + C, zMax: FUNICULAR.topStation.zMax - C,
      y: THRESHOLD.y,
      holes: [rectShape(
        FUNICULAR.top[0] - C,
        FUNICULAR.top[0] + FUNICULAR.cabinLength + C,
        FUNICULAR.pit.zMin - C,
        FUNICULAR.pit.zMax + C,
      ), ...fare],
    },
    {
      xMin: -doorX, xMax: doorX, zMin: isl.zMin + C, zMax: isl.zMax - C, y: MERIDIAN.topY,
      holes: [
        circleShape(cx, cz, DISC.wellR + C),
        ...bandHoles(inner, MERIDIAN.f4FootprintZ[0] + 0.3, MERIDIAN.f4FootprintZ[1]),
        ...bandHoles(inner, MERIDIAN.f5OpeningZ[0], MERIDIAN.f5OpeningZ[1] - 0.3),
      ],
    },
    {
      xMin: floor.xMin + C, xMax: floor.xMax - C, zMin: floor.zMin + PSD.inset + C, zMax: floor.zMax - PSD.inset - C, y: VESPER.topY,
      holes: [
        circleShape(cx, cz, DISC.wellR + C),
        ...bandHoles(inner, VESPER.f5FootprintZ[0] + 0.3, VESPER.f5FootprintZ[1]),
        rectShape(VESPER.f6OpeningX[0], VESPER.f6OpeningX[1] + C, VESPER.f6OpeningZ[0] - C, VESPER.f6OpeningZ[1] + C),
        // Funicular bottom pit + under-incline headroom guard (< 2.3 m under rail/chassis)
        rectShape(FUNICULAR.underTrackGuardXMin - C, FUNICULAR.pit.xMax + C, FUNICULAR.pit.zMin - C, FUNICULAR.pit.zMax + C),
        ...liftHoles(),
      ],
    },
    { ...boundsOf(deep), y: HALCYON.topY, obb: deep, holes: [...liftHoles(), rectShape(-60, -26.52, VESPER.f6OpeningZ[0] - C, VESPER.f6OpeningZ[1] + C)] },
    ...escalatorRegions(),
  ];
}
// The glass floor (GLASS_FLOOR) is part of the Crossing floor: walkable, no separate region.
void GLASS_FLOOR;
