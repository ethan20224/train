import { ISLANDS, PLATFORM_END, TRACKS } from '../../layout';

/**
 * Pure-data placement for the Phase 5A platform-end module, shared by the renderer and the collision list
 * (obstacles.ts). No three.js here so Node scripts can import it.
 */
export interface Barrow {
  readonly x: number;
  readonly z: number;
  /** Rotation about Y (three.js convention); 0 = handles toward +z. */
  readonly yaw: number;
  readonly load: 'tall' | 'sacks' | 'trunk' | 'lonely';
}
export interface Pile {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

const [A, B, C] = ISLANDS;
const ax = A!.centerX;
const bx = B!.centerX;
const cx = C!.centerX;

/** Walkways stay >= 2.5 m: barrows hug one lamp row (|dx| ~ 2.3 from the island centre), clear of benches / signs / stairs. */
export const BARROWS: readonly Barrow[] = [
  // at the foot of the island-A footbridge stairs (stairs run z 214.2..226.2 at the island centre)
  { x: ax + 2.35, z: 206, yaw: 0.12, load: 'tall' },
  // just north of the bridge, island C: mail waiting for a train that left
  { x: cx - 2.3, z: 240, yaw: -0.08, load: 'sacks' },
  // near the cross platform, island B
  { x: bx - 2.4, z: 130, yaw: 0.2, load: 'trunk' },
  // the lonely one, near the platform end of island C
  { x: cx + 2.2, z: 366, yaw: Math.PI - 0.5, load: 'lonely' },
];

/** Luggage left on the ground with no barrow. */
export const PILES: readonly Pile[] = [{ x: ax - 2.4, z: 298, yaw: 0.4 }];

/** Platform-end lamp standards, one each side of every island centre. */
export const END_LAMPS: readonly { x: number; z: number }[] = ISLANDS.flatMap((i) => [
  { x: i.centerX - 3.9, z: 377.4 },
  { x: i.centerX + 3.9, z: 377.4 },
]);

/** Starter signal per track, on the driver's left (+x when facing +z), clear of the 3.2 m train envelope. */
export const SIGNAL_OFFSET = 2.2;
export const SIGNALS: readonly { x: number; z: number; track: number }[] = TRACKS.map((t, i) => ({ x: t.centerX + SIGNAL_OFFSET, z: PLATFORM_END.signalZ, track: i }));

/** Dispatch mirrors: post on the island, near the served edge; `dir` points toward its track (-1 west, +1 east). */
export const MIRRORS: readonly { x: number; z: number; dir: -1 | 1; track: number }[] = TRACKS.map((t, i) => {
  const isl = ISLANDS.find((s) => s.id === t.island)!;
  const west = t.side === 'west';
  return { x: west ? isl.xMin + PLATFORM_END.mirrorEdgeInset : isl.xMax - PLATFORM_END.mirrorEdgeInset, z: PLATFORM_END.mirrorZ, dir: west ? -1 : 1, track: i };
});

/** STOP boards: on the platform-face side of each track, between the train and the face. */
export const STOP_BOARDS: readonly { x: number; z: number; track: number }[] = TRACKS.map((t, i) => {
  const isl = ISLANDS.find((s) => s.id === t.island)!;
  const west = t.side === 'west';
  return { x: west ? isl.xMin - 0.3 : isl.xMax + 0.3, z: PLATFORM_END.stopBoardZ, track: i };
});

/** Barrow footprint along its local z axis (handles at +z). */
export const BARROW_CIRCLES: readonly (readonly [number, number])[] = [[-0.45, 0.45], [0.2, 0.45], [0.85, 0.45], [1.4, 0.4]];

export const platformObstacles = (): { x: number; z: number; r: number; level: number }[] => {
  const out: { x: number; z: number; r: number; level: number }[] = [];
  for (const b of BARROWS) {
    const s = Math.sin(b.yaw);
    const c = Math.cos(b.yaw);
    for (const [lz, r] of BARROW_CIRCLES) out.push({ x: b.x + lz * s, z: b.z + lz * c, r, level: 0 });
  }
  for (const p of PILES) {
    const s = Math.sin(p.yaw);
    const c = Math.cos(p.yaw);
    for (const [lx, lz] of [[-0.35, 0], [0.4, 0.1]] as const) out.push({ x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c, r: 0.55, level: 0 });
  }
  for (const m of MIRRORS) out.push({ x: m.x, z: m.z, r: 0.2, level: 0 });
  for (const l of END_LAMPS) out.push({ x: l.x, z: l.z, r: 0.25, level: 0 });
  return out;
};
