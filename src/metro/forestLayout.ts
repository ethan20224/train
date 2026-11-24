/**
 * Cloud forest placement (pure, deterministic, no three.js so Node tests import it). Every plant is placed inside a
 * FOREST bed and every tree crown is validated against the clearance volumes (bridge + trains, droplets, Vesper train
 * envelopes, F5 truss, cavern walls) before it is accepted. Geometry is built from this data in src/world/metro/forest.ts.
 */
import { CAVERN, CROSS_OUTLINE, FLIGHTS, ESCALATOR_BANDS, FOREST, VESPER } from '../layoutMetro';
import { walkSamples } from './walks';

export type TreeKind = 'canopy' | 'umbrella';

export interface ForestTree {
  readonly x: number;
  readonly z: number;
  readonly kind: TreeKind;
  /** Crown ellipsoid centre (world), horizontal and vertical semi-axes. */
  readonly crownX: number;
  readonly crownY: number;
  readonly crownZ: number;
  readonly crownRH: number;
  readonly crownRV: number;
  /** Trunk radius at breast height and seed for the per-tree shape. */
  readonly trunkR: number;
  readonly seed: number;
}
export interface ForestTreeFern { readonly x: number; readonly z: number; readonly height: number; readonly seed: number }
export interface ForestFern { readonly x: number; readonly z: number; readonly size: number; readonly seed: number }
export interface ForestBoulder { readonly x: number; readonly z: number; readonly r: number; readonly seed: number }

export interface ForestPlan {
  readonly trees: readonly ForestTree[];
  readonly treeFerns: readonly ForestTreeFern[];
  readonly ferns: readonly ForestFern[];
  readonly boulders: readonly ForestBoulder[];
}

const Y0 = CAVERN.baseFloorY;
const TAN30 = Math.tan(Math.PI / 6);
const F5 = FLIGHTS.find((f) => f.id === 'F5')!;
const F5_Z_LO = Math.min(F5.from, F5.to);
const F5_Z_HI = Math.max(F5.from, F5.to);
/** Absolute x range of F5's inner bands, padded. */
const F5_X: readonly [number, number] = [ESCALATOR_BANDS.inner[1]![0] - FOREST.f5BandPad, ESCALATOR_BANDS.inner[1]![1] + FOREST.f5BandPad];
/** F5 step line height at z (upper end at F5.from). */
const f5LineY = (z: number): number => F5.yFrom - (F5.from - z) * TAN30;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inCross(x: number, z: number): boolean {
  let inside = false;
  const n = CROSS_OUTLINE.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = CROSS_OUTLINE[i]!;
    const [xj, zj] = CROSS_OUTLINE[j]!;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Highest allowed foliage top for a crown footprint (centre x/z, horizontal radius rh); -Infinity if the footprint leaves the cavern. */
export function crownTopLimit(x: number, z: number, rh: number): number {
  const WALL = 0.4;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]] as const) {
    if (!inCross(x + dx * (rh + WALL), z + dz * (rh + WALL))) return -Infinity;
  }
  let top: number = FOREST.capY;
  if (Math.abs(x) - rh < FOREST.bridgeHalfX && z > CAVERN.nave.zMin && z < CAVERN.nave.zMax) top = Math.min(top, FOREST.underBridgeCapY);
  const ax0 = Math.abs(x) - rh, ax1 = Math.abs(x) + rh;
  const za = Math.max(z - rh, F5_Z_LO), zb = Math.min(z + rh, F5_Z_HI);
  if (ax1 > F5_X[0] && ax0 < F5_X[1] && za < zb) top = Math.min(top, f5LineY(za) - FOREST.f5TrussClear);
  return top;
}

/** Lowest allowed foliage bottom for a crown footprint: above the Vesper train envelopes it overhangs. */
export function crownBottomLimit(z: number, rh: number): number {
  for (const tz of VESPER.trackZ) if (Math.abs(z - tz) - rh < FOREST.vesperEnvelopeHalfZ) return FOREST.vesperEnvelopeTopY;
  return Y0;
}

/** True if the ellipsoid crown fits every clearance volume. */
export function crownFits(t: Pick<ForestTree, 'crownX' | 'crownY' | 'crownZ' | 'crownRH' | 'crownRV'>): boolean {
  return t.crownY + t.crownRV <= crownTopLimit(t.crownX, t.crownZ, t.crownRH) + 1e-6 && t.crownY - t.crownRV >= crownBottomLimit(t.crownZ, t.crownRH) - 1e-6;
}

const inBed = (b: (typeof FOREST.beds)[number], x: number, z: number, m: number): boolean =>
  x >= b.xMin + m && x <= b.xMax - m && z >= b.zMin + m && z <= b.zMax - m;
const inAnyBed = (x: number, z: number, m: number): boolean => FOREST.beds.some((b) => inBed(b, x, z, m));


// ---- walk keep-out (canopy walk + boardwalks, src/metro/walks.ts) ---------------------------------------------------------

const d2 = (ax: number, az: number, bx: number, bz: number): number => (ax - bx) ** 2 + (az - bz) ** 2;
/** True if (x, z) is within r of any ground-level walk sample (boardwalk, stairs, bridge, landings). */
const nearGroundWalk = (x: number, z: number, r: number): boolean => walkSamples().ground.some((q) => d2(q.x, q.z, x, z) < r * r);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Trunk of `t` reaches into the canopy walk corridor (not fixable by a smaller crown). */
function trunkHitsWalk(t: ForestTree): boolean {
  // buttress flare at the base is up to ~3.3 x trunkR; the boardwalk rail line sits 0.9-1.0 m off its centre
  if (nearGroundWalk(t.x, t.z, t.trunkR * 3.4 + 1.45)) return true;
  const top = t.crownY + t.crownRV, gy = Y0 + 0.5;
  for (const q of walkSamples().air) {
    if (q.y - 0.6 >= top) continue;
    const f = clamp01((q.y - gy) / (top - gy));
    if (d2(t.x + (t.crownX - t.x) * f, t.z + (t.crownZ - t.z) * f, q.x, q.z) < (1.0 + t.trunkR + 0.9) ** 2) return true;
  }
  return false;
}
/** Branches / crown of `t` reach the canopy walk corridor (a smaller crown may clear it). */
function crownHitsWalk(t: ForestTree): boolean {
  const top = t.crownY + t.crownRV;
  for (const q of walkSamples().air) {
    if (q.y + 2.3 < t.crownY - t.crownRV - 0.3 || q.y - 0.8 >= top) continue;
    if (d2(t.crownX, t.crownZ, q.x, q.z) < (t.crownRH * 0.8 + 1.0) ** 2) return true;
  }
  return false;
}
/** Keep the walks clear: drop trees whose trunk is in the way, shrink crowns that brush the canopy walk. */
function clearOfWalks(trees: readonly ForestTree[]): ForestTree[] {
  const out: ForestTree[] = [];
  for (const t of trees) {
    if (trunkHitsWalk(t)) continue;
    let cur = t;
    for (let rh = t.crownRH; crownHitsWalk(cur) && rh > 2.2; rh -= 0.3) cur = { ...t, crownRH: Math.max(2.2, rh - 0.3) };
    if (!crownHitsWalk(cur)) out.push(cur);
  }
  return out;
}

export function planForest(seed: number = FOREST.seed): ForestPlan {
  const rnd = mulberry32(seed);
  const trees: ForestTree[] = [];
  const tooClose = (x: number, z: number, d: number): boolean => trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < d * d);

  // Trees: dart throwing per bed. A candidate grows the biggest crown its spot allows, then the crown leans toward open air
  // (over the tracks in the transept strips, away from the bridge in the nave side bands).
  for (const bed of FOREST.beds) {
    const area = (bed.xMax - bed.xMin) * (bed.zMax - bed.zMin);
    const transept = bed.id.startsWith('trans');
    const attempts = Math.round(area / (transept ? 3 : 4));
    for (let k = 0; k < attempts; k++) {
      const x = bed.xMin + 1.2 + rnd() * (bed.xMax - bed.xMin - 2.4);
      const z = bed.zMin + 1.0 + rnd() * (bed.zMax - bed.zMin - 2.0);
      if (transept && Math.abs(x) < CAVERN.nave.xMax) continue; // the nave beds own the crossing of the arms
      const under = Math.abs(x) < FOREST.bridgeHalfX - 1.0 && !transept;
      const kind: TreeKind = under ? 'umbrella' : 'canopy';
      const rh0 = under ? 4.2 + rnd() * 2.2 : 2.7 + rnd() * 1.3;
      if (tooClose(x, z, under ? 7.5 : 5.6)) continue;
      // Lean: transept crowns reach over the track they face; nave side-band crowns lean outward toward the walls.
      let lx = 0, lz = 0;
      if (transept) lz = (bed.id === 'transS' ? 1 : -1) * (1.2 + rnd() * 1.4);
      else if (!under) lx = Math.sign(x) * (0.6 + rnd() * 0.8);
      let placed: ForestTree | null = null;
      for (let rh = rh0; rh >= 2.2 && !placed; rh -= 0.3) {
        const cx = x + lx, cz = z + lz;
        const top = crownTopLimit(cx, cz, rh);
        if (!isFinite(top) || top - Y0 < 9) continue;
        const rv = Math.min(rh * (under ? 0.55 : 0.8), (top - Y0) * 0.25);
        const height = (top - Y0) * (0.86 + rnd() * 0.14);
        const cy = Y0 + height - rv;
        const cand: ForestTree = {
          x, z, kind, crownX: cx, crownY: cy, crownZ: cz, crownRH: rh, crownRV: rv,
          trunkR: (under ? 0.42 : 0.3) + rnd() * 0.16, seed: Math.floor(rnd() * 1e9),
        };
        if (crownFits(cand)) placed = cand;
      }
      if (placed) trees.push(placed);
    }
  }

  // Same stream as without walks: the corridor trees are removed (or their crowns trimmed) afterwards, so the rest of the forest is unchanged.
  const planted = clearOfWalks(trees);
  trees.length = 0;
  trees.push(...planted);

  const treeFerns: ForestTreeFern[] = [];
  const ferns: ForestFern[] = [];
  const boulders: ForestBoulder[] = [];
  for (const bed of FOREST.beds) {
    const transept = bed.id.startsWith('trans');
    for (let x = bed.xMin + 0.8; x <= bed.xMax - 0.8; x += 2.6) {
      for (let z = bed.zMin + 0.8; z <= bed.zMax - 0.8; z += 2.6) {
        const jx = x + (rnd() - 0.5) * 2.2, jz = z + (rnd() - 0.5) * 2.2;
        if ((transept && Math.abs(jx) < CAVERN.nave.xMax) || !inAnyBed(jx, jz, 0.7) || rnd() > 0.32) continue;
        if (trees.some((t) => (t.x - jx) ** 2 + (t.z - jz) ** 2 < 2.2 ** 2)) continue;
        if (treeFerns.some((f) => (f.x - jx) ** 2 + (f.z - jz) ** 2 < 2.4 ** 2) || nearGroundWalk(jx, jz, 1.5)) continue;
        treeFerns.push({ x: jx, z: jz, height: 1.8 + rnd() * 3.4, seed: Math.floor(rnd() * 1e9) });
      }
    }
    for (let x = bed.xMin + 0.4; x <= bed.xMax - 0.4; x += 1.05) {
      for (let z = bed.zMin + 0.4; z <= bed.zMax - 0.4; z += 1.05) {
        const jx = x + (rnd() - 0.5) * 1.0, jz = z + (rnd() - 0.5) * 1.0;
        if ((transept && Math.abs(jx) < CAVERN.nave.xMax) || !inAnyBed(jx, jz, 0.3) || rnd() > 0.72) continue;
        if (trees.some((t) => (t.x - jx) ** 2 + (t.z - jz) ** 2 < (t.trunkR * 2.6) ** 2) || nearGroundWalk(jx, jz, 1.15)) continue;
        ferns.push({ x: jx, z: jz, size: 0.85 + rnd() * 0.95, seed: Math.floor(rnd() * 1e9) });
      }
    }
    const nb = Math.round(((bed.xMax - bed.xMin) * (bed.zMax - bed.zMin)) / 38);
    for (let k = 0; k < nb; k++) {
      const x = bed.xMin + 1 + rnd() * (bed.xMax - bed.xMin - 2), z = bed.zMin + 1 + rnd() * (bed.zMax - bed.zMin - 2);
      if (transept && Math.abs(x) < CAVERN.nave.xMax) continue;
      if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 2.5 ** 2)) continue;
      const r = 0.35 + rnd() * 0.9, seed = Math.floor(rnd() * 1e9);
      if (nearGroundWalk(x, z, r * 1.3 + 1.1)) continue;
      boulders.push({ x, z, r, seed });
    }
  }
  return { trees, treeFerns, ferns, boulders };
}
