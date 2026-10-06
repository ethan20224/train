import { PLAYER } from '../layout';
import {
  DISC, ESCALATOR, GLASS_FLOOR, HALCYON, LANDINGS, LIFTS, MERIDIAN, OCULUS, PSD, THRESHOLD, THROAT, VESPER, escalatorUnits,
} from '../layoutMetro';
import { boundsOf, circleShape, obbShape, rectShape, type Region, type Shape } from '../player/regions';
import { escalators } from './escalators';

/** Static metro walkability (spec §2). Movers and their gangways are dynamic (src/metro/disc.ts). */
const C = PLAYER.wallClearance;
const { cx, cz } = OCULUS;
const liftHoles = (): Shape[] => LIFTS.positions.map(([x, z]) => circleShape(x, z, LIFTS.tubeR + C));
const bandHoles = (bands: readonly (readonly [number, number])[], zMin: number, zMax: number): Shape[] =>
  bands.map(([a, b]) => rectShape(a - C, b + C, zMin, zMax));

/** Holes in the Grand Hall floor region: the oculus (to the curb) and the two F1 throats. */
export const HALL_HOLES: readonly Shape[] = [
  circleShape(cx, cz, OCULUS.curbOuterR + C),
  ...THROAT.bands.map(([a, b]) => rectShape(a - C, b + C, THROAT.zMin, THROAT.zMax + C)),
];

function landing(l: { y: number; zMin: number; zMax: number; halfX: number }): Region {
  return { xMin: -l.halfX + C, xMax: l.halfX - C, zMin: l.zMin + C, zMax: l.zMax - C, y: l.y };
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
  const inner = [[-7.8, -4.2], [4.2, 7.8]] as const;
  const annulus = circleShape(cx, cz, THRESHOLD.rOuter - C);
  const isl = MERIDIAN.island;
  const doorX = isl.xMax - PSD.inset - C;
  const floor = VESPER.floor;
  const [hx, hz] = HALCYON.centre;
  const [ux, uz] = HALCYON.dir;
  const deep = obbShape(hx, hz, ux, uz, HALCYON.halfLength - C, HALCYON.halfWidth - PSD.inset - C);
  return [
    landing(LANDINGS.L1),
    landing(LANDINGS.L2),
    { ...boundsOf(annulus), y: THRESHOLD.y, circle: annulus, holes: [circleShape(cx, cz, THRESHOLD.rInner + C)] },
    landing(LANDINGS.thresholdBridge),
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
        rectShape(VESPER.f6OpeningX[0], VESPER.f6OpeningX[1] + C, 66 - C, 69.6 + C),
        ...liftHoles(),
      ],
    },
    { ...boundsOf(deep), y: HALCYON.topY, obb: deep, holes: [...liftHoles(), rectShape(-60, -26.52, 66 - C, 69.6 + C)] },
    ...escalatorRegions(),
  ];
}
// The glass floor (GLASS_FLOOR) is part of the Crossing floor: walkable, no separate region.
void GLASS_FLOOR;
