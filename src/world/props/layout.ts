/**
 * Pure-data prop layout (no three.js) so that obstacles.ts and the renderer share ONE source of truth.
 */
export interface BenchPlacement {
  /** centre of the bench footprint */
  x: number;
  z: number;
  /** direction the sitter faces: +1 = +x, -1 = -x */
  facing: 1 | -1;
}

export const BENCH = {
  length: 3.4,
  depth: 0.62,
} as const;

const BAYS = [14, 26, 38, 50, 62, 74, 86] as const;
const AISLE_BAYS = [26, 38, 50, 62, 74] as const;

/** Wall benches (backs to the pilastered wall) + back-to-back aisle benches, both sides. Perfectly aligned. */
export function benchPlacements(): BenchPlacement[] {
  const out: BenchPlacement[] = [];
  for (const side of [-1, 1] as const) {
    // wall row: two benches per bay
    for (const c of BAYS) {
      for (const dz of [-1.9, 1.9]) {
        out.push({ x: side * 29.34, z: c + dz, facing: side < 0 ? 1 : -1 });
      }
    }
    // aisle row: back-to-back pair per window / blind bay
    for (const c of AISLE_BAYS) {
      out.push({ x: side * 26.3 - 0.31, z: c, facing: -1 });
      out.push({ x: side * 26.3 + 0.31, z: c, facing: 1 });
    }
  }
  return out;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Row of circles covering a bench footprint (length along z). */
function benchCircles(b: BenchPlacement): Circle[] {
  const r = BENCH.depth / 2 + 0.06;
  const n = Math.ceil(BENCH.length / (r * 1.0));
  const out: Circle[] = [];
  for (let i = 0; i < n; i++) {
    const t = -BENCH.length / 2 + r * 0.6 + ((BENCH.length - r * 1.2) * i) / (n - 1);
    out.push({ x: b.x, z: b.z + t, r });
  }
  return out;
}

export const STANCHION_POSTS: ReadonlyArray<{ x: number; z: number; group: number }> = (() => {
  const out: Array<{ x: number; z: number; group: number }> = [];
  for (const [gi, side] of ([-1, 1] as const).entries()) {
    for (let i = 0; i < 4; i++) out.push({ x: side * 13.2, z: 23 + i * 1.9, group: gi });
  }
  return out;
})();

/** Torchere positions (shared with concourse fixtures). */
export const TORCHERES: ReadonlyArray<readonly [number, number]> = [[-11.1, 21.0], [11.1, 21.0]];

export function propObstacles(): Circle[] {
  const out: Circle[] = [];
  for (const b of benchPlacements()) out.push(...benchCircles(b));
  for (const p of STANCHION_POSTS) out.push({ x: p.x, z: p.z, r: 0.2 });
  for (const [x, z] of TORCHERES) out.push({ x, z, r: 0.5 });
  return out;
}
