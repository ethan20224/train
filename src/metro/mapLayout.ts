// Pure live-map topology & exact s -> map-UV mapping for Meridian Deep (Phase 4, P4-5).
// No three.js, no DOM — shared by src/world/metro/mapWall.ts and scripts/metro-map-test.ts.
import { MAP_WALL, METRO_TRAIN } from '../layoutMetro';
import { METRO_NETWORK } from './network';
import { TIMING } from './timetable';
import { trackOf, type LineId } from './tracks';

export const MAP_TEX_W = 2048;
export const MAP_TEX_H = 512;

/** Active backlit glass panel interior bounds (0.20 m inset inside the 40 × 7 m MAP_WALL recess for the stainless frame). */
export const MAP_PANEL = {
  xMin: MAP_WALL.xMin + 0.2,  // -19.8
  xMax: MAP_WALL.xMax - 0.2,  // +19.8 (width 39.6 m)
  yMin: MAP_WALL.yMin + 0.2,  // -40.8
  yMax: MAP_WALL.yMax - 0.2,  // -34.2 (height 6.6 m)
  zFace: MAP_WALL.z - 0.04,   // 19.96 (tucked cleanly inside the 0.18 m dark alcove)
  clockDiameter: 2.4,         // 2.4 m running white onyx clock at exact panel centre
  clockRadius: 1.2,
  /** Radius (m) of the luminous interchange halo ring around the clock bezel where stopped train dots sit. */
  interchangeRingR: 1.44,
} as const;

export const MAP_PANEL_W = MAP_PANEL.xMax - MAP_PANEL.xMin; // 39.6 m
export const MAP_PANEL_H = MAP_PANEL.yMax - MAP_PANEL.yMin; // 6.6 m
export const MAP_CLOCK_CENTER_Y = (MAP_PANEL.yMin + MAP_PANEL.yMax) / 2; // -37.5

export interface MapPointUV {
  readonly u: number;
  readonly v: number;
}

export interface MapStationLayout {
  readonly name: string;
  readonly index: number;
  readonly u: number;
  readonly v: number;
  readonly isInterchange: boolean;
  /** Label placement side relative to the line: +1 above, -1 below. */
  readonly labelSide: 1 | -1;
}

// Each line is defined as a clean Swiss-diagram piecewise polyline in UV space [0, 1] x [0, 1],
// symmetric about the central Meridian Deep interchange (0.5, 0.5).
// Note aspect ratio W/H = 39.6 / 6.6 = 6.0, so a true 45-degree diagonal in world metres satisfies du * 6 = dv => du = dv / 6.
const LINE_POLY_UV: Record<LineId, ReadonlyArray<readonly [number, number]>> = {
  // Vesper (Jade): pure horizontal E-W axis right across the 40 m frieze
  vesper: [[0.06, 0.50], [0.50, 0.50], [0.94, 0.50]],
  // Meridian (Ink Blue): lower-left terrace -> crisp geometric diagonal through (0.5, 0.5) -> upper-right terrace
  meridian: [[0.10, 0.23], [0.40, 0.23], [0.50, 0.50], [0.60, 0.77], [0.90, 0.77]],
  // Halcyon (Oxblood): upper-left terrace -> crisp geometric diagonal through (0.5, 0.5) -> lower-right terrace
  halcyon: [[0.10, 0.77], [0.40, 0.77], [0.50, 0.50], [0.60, 0.23], [0.90, 0.23]],
};

/** Exact polyline vertices (UV) of a line, for drawing the backlit transit diagram. */
export function linePolylineUV(line: LineId): ReadonlyArray<readonly [number, number]> {
  return LINE_POLY_UV[line];
}

/** World-metre length of each segment in a line's polyline (so stations & train dots travel at uniform visual speed). */
function lineMetrics(line: LineId): { pts: ReadonlyArray<readonly [number, number]>; cum: number[]; total: number } {
  const pts = LINE_POLY_UV[line];
  const cum = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i]![0] - pts[i - 1]![0]) * MAP_PANEL_W;
    const dy = (pts[i]![1] - pts[i - 1]![1]) * MAP_PANEL_H;
    total += Math.hypot(dx, dy);
    cum.push(total);
  }
  return { pts, cum, total };
}

const METRICS: Record<LineId, ReturnType<typeof lineMetrics>> = {
  meridian: lineMetrics('meridian'),
  vesper: lineMetrics('vesper'),
  halcyon: lineMetrics('halcyon'),
};

/** Evaluates a point along a line's polyline at arc-length fraction `t` in [0, 1] (t = 0.5 is always (0.5, 0.5)). */
export function sampleLineUV(line: LineId, t: number): MapPointUV {
  const { pts, cum, total } = METRICS[line];
  const cl = t < 0 ? 0 : t > 1 ? 1 : t;
  const dist = cl * total;
  for (let i = 1; i < pts.length; i++) {
    if (dist <= cum[i]! || i === pts.length - 1) {
      const segLen = cum[i]! - cum[i - 1]! || 1;
      const f = (dist - cum[i - 1]!) / segLen;
      return {
        u: pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * f,
        v: pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * f,
      };
    }
  }
  return { u: 0.5, v: 0.5 };
}

/**
 * Station UV coordinates for a line (9 stations; index 4 = Meridian Deep at (0.5, 0.5)).
 * The 4 stations on each side sit cleanly outside the central 2.4 m clock halo with generous spacing for typography.
 */
export function lineStationsUV(line: LineId): MapStationLayout[] {
  const net = METRO_NETWORK[line];
  const n = net.stations.length; // 9
  const mid = net.interchangeIndex; // 4
  // Minimum arc-length clearance from (0.5, 0.5) so the nearest station sits well outside the 1.44 m interchange halo
  const innerT = 0.14; // ~2.5 m from centre on Vesper, ~2.8 m on Meridian/Halcyon
  const out: MapStationLayout[] = [];
  for (let i = 0; i < n; i++) {
    let t = 0.5;
    if (i < mid) {
      const k = (mid - i) / mid; // 0.25 .. 1.0
      t = 0.5 - (innerT + (0.5 - innerT) * ((k - 0.25) / 0.75));
    } else if (i > mid) {
      const k = (i - mid) / (n - 1 - mid); // 0.25 .. 1.0
      t = 0.5 + (innerT + (0.5 - innerT) * ((k - 0.25) / 0.75));
    }
    const pt = sampleLineUV(line, t);
    // Label side: Meridian lower arm below (-1) / upper arm above (+1); Halcyon upper-left above (+1) / lower-right below (-1); Vesper alternating
    let labelSide: 1 | -1 = 1;
    if (line === 'vesper') labelSide = i % 2 === 0 ? 1 : -1;
    else if (line === 'meridian') labelSide = i < mid ? -1 : 1;
    else labelSide = i < mid ? 1 : -1;
    out.push({
      name: net.stations[i]!,
      index: i,
      u: pt.u,
      v: pt.v,
      isInterchange: i === mid,
      labelSide,
    });
  }
  return out;
}

const HALF_LEN = METRO_TRAIN.length / 2;

/** Maximum track coordinate |s| from spawn to despawn on a given track. */
export function trackMapSpan(line: LineId, track: 0 | 1): number {
  const tr = trackOf(line, track);
  return Math.max(tr.portalIn, tr.portalOut) + TIMING.spawnClearance + HALF_LEN;
}

/**
 * Maps a live train's timetable coordinate `s` to exact map UV `(u, v)` on the 2048×512 backlit glass panel.
 *
 * - Track 0 runs along increasing polyline `t` (0.0 -> 1.0); Track 1 runs opposite (1.0 -> 0.0).
 * - Outside the central 2.4 m clock halo, the dot glides smoothly along the line stroke (with a crisp 0.10 m lateral
 *   offset separating opposing tracks).
 * - Inside the central interchange halo (`r < interchangeRingR`), the dot routes smoothly around the luminous
 *   `r = 1.44 m` interchange ring (track 0 via the upper arc, track 1 via the lower arc) so every train — especially
 *   when dwelling at `s = 0` (Meridian Deep) — remains 100 % visible beside the running white onyx clock!
 */
export function mapTrainToUV(line: LineId, track: 0 | 1, s: number): MapPointUV {
  const span = trackMapSpan(line, track);
  const norm = Math.max(-1, Math.min(1, s / span)); // -1 at spawn, 0 at Meridian Deep, +1 at despawn
  const dirSign = track === 0 ? 1 : -1;
  const t = 0.5 + dirSign * norm * 0.5;
  const base = sampleLineUV(line, t);

  // Convert to world-metre offset from panel/clock centre (0.5, 0.5)
  let mx = (base.u - 0.5) * MAP_PANEL_W;
  let my = (base.v - 0.5) * MAP_PANEL_H;

  // Compute local unit tangent along the polyline in world metres (oriented along travel direction)
  const eps = 1e-3;
  const pA = sampleLineUV(line, Math.max(0, t - eps));
  const pB = sampleLineUV(line, Math.min(1, t + eps));
  const tx = (pB.u - pA.u) * MAP_PANEL_W * dirSign;
  const ty = (pB.v - pA.v) * MAP_PANEL_H * dirSign;
  const tl = Math.hypot(tx, ty) || 1;
  // Left-hand perpendicular to travel direction (separates track 0 and track 1 onto opposite sides of the stroke & clock)
  const nx = -ty / tl;
  const ny = tx / tl;

  const rBase = Math.hypot(mx, my);
  const ringR = MAP_PANEL.interchangeRingR; // 1.44 m
  const blendZone = ringR + 0.55;           // smooth transition into & out of the interchange ring
  const trackSep = 0.11;                    // subtle 11 cm lane separation outside the ring

  if (rBase < blendZone) {
    // Route cleanly onto the outer interchange ring around the 2.4 m clock (always visible, never behind the onyx dial!)
    // At s = 0 (rBase = 0), dot sits cleanly at (nx * ringR, ny * ringR) right on the luminous interchange halo!
    const w = 1 - Math.min(1, Math.max(0, (rBase - ringR * 0.65) / (blendZone - ringR * 0.65)));
    const sW = w * w * (3 - 2 * w);
    const pushX = mx + nx * (trackSep + sW * ringR);
    const pushY = my + ny * (trackSep + sW * ringR);
    const pr = Math.hypot(pushX, pushY) || 1;
    if (pr < ringR) {
      mx = (pushX / pr) * ringR;
      my = (pushY / pr) * ringR;
    } else {
      mx = pushX;
      my = pushY;
    }
  } else {
    mx += nx * trackSep;
    my += ny * trackSep;
  }

  return {
    u: 0.5 + mx / MAP_PANEL_W,
    v: 0.5 + my / MAP_PANEL_H,
  };
}

/** Converts map UV `(u, v)` to exact world `(x, y)` on the map panel. */
export function mapUVToWorldXY(u: number, v: number): [number, number] {
  return [MAP_PANEL.xMin + u * MAP_PANEL_W, MAP_PANEL.yMin + v * MAP_PANEL_H];
}

/** Converts world `(x, y)` back to map pixel coordinates `(px, py)` on the 2048 × 512 texture. */
export function worldXYToMapPixel(x: number, y: number): [number, number] {
  const u = (x - MAP_PANEL.xMin) / MAP_PANEL_W;
  const v = (y - MAP_PANEL.yMin) / MAP_PANEL_H;
  return [u * MAP_TEX_W, (1 - v) * MAP_TEX_H];
}

const TAU = Math.PI * 2;

/** Continuous clockwise hand angles (radians, 0 = 12 o'clock, +pi/2 = 3 o'clock) from real local wall-clock time. */
export function clockHandAngles(date: Date): { hour: number; minute: number; second: number } {
  const sec = date.getSeconds() + date.getMilliseconds() / 1000;
  const min = date.getMinutes() + sec / 60;
  const hr = (date.getHours() % 12) + min / 60;
  return {
    hour: (hr / 12) * TAU,
    minute: (min / 60) * TAU,
    second: (sec / 60) * TAU,
  };
}
