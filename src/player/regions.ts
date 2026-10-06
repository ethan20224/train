import type { Rect } from '../layout';

/**
 * Walkable-region primitives shared by navigation.ts and the metro nav data (pure, no three.js).
 * A region is always a bounding rectangle, optionally refined to a circle or an oriented box; its ground is flat
 * or a ramp along x or z; region-scoped holes exclude points from THIS region only (others may still cover them).
 */
export interface RectShape extends Rect { readonly kind: 'rect' }
export interface CircleShape { readonly kind: 'circle'; readonly cx: number; readonly cz: number; readonly r: number }
/** Oriented box: centre, unit long axis (ux, uz), half length along it, half width across it. */
export interface ObbShape {
  readonly kind: 'obb'; readonly cx: number; readonly cz: number; readonly ux: number; readonly uz: number;
  readonly halfLen: number; readonly halfWid: number;
}
export type Shape = RectShape | CircleShape | ObbShape;

export interface Ramp { readonly axis: 'x' | 'z'; readonly from: number; readonly to: number; readonly yFrom: number; readonly yTo: number }

export interface Region extends Rect {
  /** Ground height (ramps: see `ramp`). */
  readonly y: number;
  readonly ramp?: Ramp;
  /** Ticket-gate lane corridor: walkable only while the lanes are open. */
  readonly gate?: boolean;
  readonly circle?: CircleShape;
  readonly obb?: ObbShape;
  readonly holes?: readonly Shape[];
  /** Connector: walkable only while this returns true (a player already standing in it is never trapped). */
  readonly when?: () => boolean;
  /** Moving walkway: signed velocity (m/s) along `axis` applied to whoever stands here. */
  readonly conveyor?: { readonly axis: 'x' | 'z'; readonly speed: () => number };
  /** Dynamic movers only: this floor's displacement since the previous frame; riders are carried by it. */
  readonly carry?: { readonly x: number; readonly y: number; readonly z: number };
}

export const rectShape = (xMin: number, xMax: number, zMin: number, zMax: number): RectShape => ({ kind: 'rect', xMin, xMax, zMin, zMax });
export const circleShape = (cx: number, cz: number, r: number): CircleShape => ({ kind: 'circle', cx, cz, r });
export const obbShape = (cx: number, cz: number, ux: number, uz: number, halfLen: number, halfWid: number): ObbShape =>
  ({ kind: 'obb', cx, cz, ux, uz, halfLen, halfWid });

export function inShape(s: Shape, x: number, z: number): boolean {
  switch (s.kind) {
    case 'rect':
      return x >= s.xMin && x <= s.xMax && z >= s.zMin && z <= s.zMax;
    case 'circle': {
      const dx = x - s.cx;
      const dz = z - s.cz;
      return dx * dx + dz * dz <= s.r * s.r;
    }
    case 'obb': {
      const dx = x - s.cx;
      const dz = z - s.cz;
      return Math.abs(dx * s.ux + dz * s.uz) <= s.halfLen && Math.abs(-dx * s.uz + dz * s.ux) <= s.halfWid;
    }
  }
}

/** Bounding rectangle of any shape. */
export function boundsOf(s: Shape): Rect {
  if (s.kind === 'rect') return { xMin: s.xMin, xMax: s.xMax, zMin: s.zMin, zMax: s.zMax };
  if (s.kind === 'circle') return { xMin: s.cx - s.r, xMax: s.cx + s.r, zMin: s.cz - s.r, zMax: s.cz + s.r };
  const ex = Math.abs(s.ux) * s.halfLen + Math.abs(s.uz) * s.halfWid;
  const ez = Math.abs(s.uz) * s.halfLen + Math.abs(s.ux) * s.halfWid;
  return { xMin: s.cx - ex, xMax: s.cx + ex, zMin: s.cz - ez, zMax: s.cz + ez };
}

export function inRegion(r: Region, x: number, z: number): boolean {
  if (x < r.xMin || x > r.xMax || z < r.zMin || z > r.zMax) return false;
  if (r.circle && !inShape(r.circle, x, z)) return false;
  if (r.obb && !inShape(r.obb, x, z)) return false;
  if (r.holes) for (const h of r.holes) if (inShape(h, x, z)) return false;
  return true;
}

export function groundY(r: Region, x: number, z: number): number {
  const ramp = r.ramp;
  if (!ramp) return r.y;
  const c = ramp.axis === 'x' ? x : z;
  const t = Math.min(1, Math.max(0, (c - ramp.from) / (ramp.to - ramp.from)));
  return ramp.yFrom + (ramp.yTo - ramp.yFrom) * t;
}
