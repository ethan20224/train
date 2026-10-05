import { ISLANDS, SHED, TRACKS } from '../../layout';

/**
 * Pure-data placement of platform furniture, shared by the renderer (furniture.ts) and
 * the collision list (obstacles.ts). No three.js here so Node scripts can import it.
 */
export interface Placed {
  readonly x: number;
  readonly z: number;
}
export interface PlacedSign extends Placed {
  readonly number: 1 | 2 | 3 | 4 | 5 | 6;
}
export interface PlacedBench extends Placed {
  /** +1: faces +x (toward the east track); -1: faces -x. */
  readonly facing: 1 | -1;
}

/** Lateral offset of furniture rows from an island centre line (centre 2.5 m stays clear). */
export const LAMP_OFFSET = 3.3;
export const SIGN_OFFSET = 3.5;
export const BENCH_OFFSET = 3.95;
export const LAMP_PITCH = 24;
export const LAMP_Z0 = 120;
export const LAMP_ZN = 360;

export const SIGN_ZS = [114, 190, 270, 348] as const;
export const BENCH_ZS = [150, 270] as const;

export const LAMPS: readonly Placed[] = ISLANDS.flatMap((i) => {
  const out: Placed[] = [];
  for (let z = LAMP_Z0; z <= LAMP_ZN + 0.1; z += LAMP_PITCH) {
    out.push({ x: i.centerX - LAMP_OFFSET, z }, { x: i.centerX + LAMP_OFFSET, z });
  }
  return out;
});

export const SIGNS: readonly PlacedSign[] = ISLANDS.flatMap((i) => {
  const west = TRACKS.find((t) => t.island === i.id && t.side === 'west');
  const east = TRACKS.find((t) => t.island === i.id && t.side === 'east');
  const out: PlacedSign[] = [];
  if (!west || !east) return out;
  for (const z of SIGN_ZS) {
    out.push({ x: i.centerX - SIGN_OFFSET, z, number: west.platformNumber }, { x: i.centerX + SIGN_OFFSET, z, number: east.platformNumber });
  }
  return out;
});

export const BENCHES: readonly PlacedBench[] = ISLANDS.flatMap((i) =>
  BENCH_ZS.flatMap((z) => [
    { x: i.centerX - BENCH_OFFSET, z, facing: -1 as const },
    { x: i.centerX + BENCH_OFFSET, z, facing: 1 as const },
  ]),
);

export const CLOCK_XS = [-10, 10] as const;
export const CLOCK_Z = 104.4;

export const SIGNAL_GANTRY_ZS = [470, 610, 770, 960] as const;
export const TRUSS_ZS: readonly number[] = Array.from({ length: Math.round((SHED.zMax - 108) / SHED.trussSpacing) + 1 }, (_, k) => 108 + k * SHED.trussSpacing);

export interface Circle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export const shedObstacles = (): Circle[] => {
  const out: Circle[] = [];
  for (const l of LAMPS) out.push({ x: l.x, z: l.z, r: 0.25 });
  for (const s of SIGNS) out.push({ x: s.x, z: s.z, r: 0.15 });
  for (const b of BENCHES) for (const dz of [-0.75, -0.25, 0.25, 0.75]) out.push({ x: b.x, z: b.z + dz, r: 0.5 });
  return out;
};
