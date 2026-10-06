/**
 * The Grand Meridian throat network, expressed as continuous paths. Every path is oriented OUTWARD
 * (away from the platform buffer stops). See graph.ts for the data API this feeds.
 *
 * Layout summary (z = metres north of the concourse; x = east):
 *   z 108.4..~396   six straight platform tracks T1..T6 (untouched: ramps / signals of the platform ends live here)
 *   z 396..~700     the throat: six scissors crossovers (4 turnouts + 1 diamond each), a big T3/T4 centre scissors
 *                   (hub heart), outer lanes drift in (T1/T6 S-bends), merge onto 4 main lines (4.5 m centres)
 *   z 700..780      main-line scissors M1/M2, M2/M3, M3/M4 (any platform reaches any main)
 *   z 780..~1400    fan-out: M1/M2 curve west, M3/M4 east (R >= 410); a second junction splits M2 / M3
 *                   into M2b / M3b which cross M1 / M4 on FLAT DIAMONDS; all lines vanish into the haze
 *   goods line G    leaves T6 east of the throat, climbs at 2.4 % onto a stone viaduct and crosses OVER the main
 *                   lines (grade-separated flyover), then sweeps north-west over the fan-out lines
 *   carriage yard   west, lead off the outer-west lane (Q1) at z 574 -> ladder -> 5 sidings with buffer stops
 *   east spurs      two short dead-end spurs off the outer-east lane (Q6)
 */
import { RAIL, TRACKS } from '../layout';
import { PathBuilder, type Ramp, TrackPath, sBendMinRun } from './geom';
import type { PathDef, PathRole } from './graph';

export const R_MAIN = 190;
export const R_YARD = 120;
const R_FAN = 410;

/** Speed limits (m/s). */
export const V_CRUISE = 22;
export const V_THROAT = 11;
/** Fan-out arcs (R >= 410) are taken at full cruise speed (lateral accel ~1.2 m/s^2): kept as a knob. */
export const V_OUTER = 22;
export const V_YARD = 6;
/** Restricted pointwork zone (world z) for the unit / browser tests. */
export const THROAT_Z0 = 392;
export const THROAT_Z1 = 870;

export const TRACK_START_Z = 108.4;
/** Path arc length at which a train's nose stops on a platform track (nose z = RAIL.trainStopNoseZ). */
export const PLATFORM_STOP_S = RAIL.trainStopNoseZ - TRACK_START_Z;

const sAtZ = (p: TrackPath, z: number): number => {
  let lo = 0;
  let hi = p.length;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (p.poseAt(mid).z < z) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

const run = (d: number, extra = 2.5): number => Math.ceil((sBendMinRun(d, R_MAIN) + extra) * 10) / 10;

export interface NetworkDefs {
  defs: PathDef[];
  /** Far-end descriptions for the scheduler (path id of each spawn / despawn line). */
  farPaths: string[];
}

export function defineNetwork(): NetworkDefs {
  const defs: PathDef[] = [];
  const byId = new Map<string, PathDef>();
  const add = (id: string, role: PathRole, path: TrackPath, o: Partial<PathDef> = {}): PathDef => {
    const d: PathDef = {
      id,
      role,
      path,
      minRadius: o.minRadius ?? R_MAIN,
      limit: o.limit ?? V_CRUISE,
      rank: o.rank ?? 1,
      ...(o.startKind ? { startKind: o.startKind } : {}),
      ...(o.endKind ? { endKind: o.endKind } : {}),
      ...(o.label ? { label: o.label } : {}),
    };
    defs.push(d);
    byId.set(id, d);
    return d;
  };
  const P = (id: string): TrackPath => byId.get(id)!.path;

  const tx = (id: string): number => TRACKS.find((t) => t.id === id)!.centerX;
  const farEnd = (zTarget: number, h: number, zNow: number): number => Math.max(20, (zTarget - zNow) / Math.cos(h));

  const farPaths: string[] = [];
  // ---------------------------------------------------------------------------------------------------
  // The six platform paths (they continue as the throat lanes / main lines)
  // ---------------------------------------------------------------------------------------------------
  // West: T1 (outer) -> Q1 lane -> merges into T2's line (M1); T2 (mid) -> M1 line; T3 (in) -> M2 line.
  // East mirrors: T6 -> Q6 -> merges into T5's line (M4); T5 -> M4; T4 -> M3.
  interface Side {
    sg: -1 | 1;
    out: string;
    mid: string;
    inn: string;
    dz: number;
    fanOut: number; // outer main turn angle
    fanIn: number;
  }
  const sides: Side[] = [
    { sg: -1, out: 'T1', mid: 'T2', inn: 'T3', dz: 0, fanOut: (38 * Math.PI) / 180, fanIn: (14 * Math.PI) / 180 },
    { sg: 1, out: 'T6', mid: 'T5', inn: 'T4', dz: 4, fanOut: (38 * Math.PI) / 180, fanIn: (14 * Math.PI) / 180 },
  ];
  const FAN_Z = 864;
  const Q_X = 17.5;
  const M_OUT = 6.75;
  const M_IN = 2.25;

  for (const S of sides) {
    const { sg, dz } = S;
    const toC = -sg; // direction toward the centre line
    const xo = Math.abs(tx(S.out));
    const xm = Math.abs(tx(S.mid));
    const xi = Math.abs(tx(S.inn));
    // --- T_in (inner platform track) -> M_in
    {
      const b = new PathBuilder({ x: sg * xi, z: TRACK_START_Z, h: 0 });
      b.toZ(642 + dz * 2).sbend(toC * (xi - M_IN), run(xi - M_IN, 3.5), R_MAIN).toZ(FAN_Z + dz);
      const e = b.end;
      b.arc(R_FAN + 4.5, sg * S.fanIn);
      const hh = sg * S.fanIn;
      void e;
      b.straight(farEnd(1385, hh, b.end.z));
      add(S.inn, 'platform', new TrackPath({ x: sg * xi, z: TRACK_START_Z, h: 0 }, b.segs, RAIL.topY), { rank: 0, startKind: 'buffer', endKind: 'far' });
      farPaths.push(S.inn);
    }
    // --- T_mid -> M_out
    {
      const b = new PathBuilder({ x: sg * xm, z: TRACK_START_Z, h: 0 });
      b.toZ(644 + dz).sbend(toC * (xm - M_OUT), run(xm - M_OUT, 3.5), R_MAIN).toZ(FAN_Z + dz);
      b.arc(R_FAN, sg * S.fanOut);
      b.straight(farEnd(1385, sg * S.fanOut, b.end.z));
      add(S.mid, 'platform', new TrackPath({ x: sg * xm, z: TRACK_START_Z, h: 0 }, b.segs, RAIL.topY), { rank: 0, startKind: 'buffer', endKind: 'far' });
      farPaths.push(S.mid);
    }
    // --- T_out -> Q lane -> merge into M_out line
    {
      const b = new PathBuilder({ x: sg * xo, z: TRACK_START_Z, h: 0 });
      b.toZ(402).sbend(toC * (xo - Q_X), run(xo - Q_X, 2.5), R_MAIN);
      b.toZ(652 + dz).sbend(toC * (Q_X - M_OUT), run(Q_X - M_OUT, 3.5), R_MAIN);
      add(S.out, 'platform', new TrackPath({ x: sg * xo, z: TRACK_START_Z, h: 0 }, b.segs, RAIL.topY), { rank: 0, startKind: 'buffer', endKind: 'far' });
    }
  }
  // NOTE: T1 / T6 end on the M_out line, they are not far ends (the line they join continues).
  const westQ = P('T1');
  void westQ;

  /** Crossover (S-bend) from path `a` at z0 to path `b` at z0 + run; both must be straight, heading 0 there. */
  const xover = (id: string, a: string, b: string, z0: number, role: PathRole = 'crossover', R = R_MAIN, runLen?: number): void => {
    const pa = P(a);
    const sa = sAtZ(pa, z0);
    const p0 = pa.poseAt(sa);
    if (Math.abs(p0.h) > 1e-9) throw new Error(`xover ${id}: ${a} is not straight at z=${z0}`);
    const xFrom = p0.x;
    const L = runLen ?? run(5);
    const pb = P(b);
    const sb = sAtZ(pb, z0 + L);
    const q = pb.poseAt(sb);
    if (Math.abs(q.h) > 1e-9) throw new Error(`xover ${id}: ${b} is not straight at z=${z0 + L}`);
    const d = q.x - xFrom;
    const bld = new PathBuilder({ x: xFrom, z: p0.z, h: 0 });
    bld.sbend(d, L, R);
    add(id, role, new TrackPath({ x: xFrom, z: p0.z, h: 0 }, bld.segs, RAIL.topY), { limit: V_THROAT, rank: 2 });
  };
  const scissors = (name: string, a: string, b: string, z0: number, runLen?: number): void => {
    xover(`${name}a`, a, b, z0, 'crossover', R_MAIN, runLen);
    xover(`${name}b`, b, a, z0, 'crossover', R_MAIN, runLen);
  };

  for (const S of sides) {
    const { dz } = S;
    const east = S.sg > 0 ? 'E' : 'W';
    scissors(`X1${east}`, S.mid, S.inn, 398 + dz); // first scissors between the two inner tracks
    scissors(`X2${east}`, S.out, S.mid, 498 + dz * 2); // outer lane <-> middle
    scissors(`X3${east}`, S.mid, S.inn, 566 + dz * 2); // second middle <-> inner, after the outer lane has joined (so west <-> east works end to end)
  }
  // The hub heart: T3 <-> T4 long scissors across the centre line.
  scissors('XC', 'T3', 'T4', 470, run(15, 3));
  // Main-line scissors: M1/M2 (west), M3/M4 (east), M2/M3 (centre).
  scissors('XM1', 'T2', 'T3', 790, run(4.5));
  scissors('XM3', 'T5', 'T4', 794, run(4.5));
  scissors('XMC', 'T3', 'T4', 722, run(4.5));

  // ---------------------------------------------------------------------------------------------------
  // Second junction (fan-out): M2b / M3b branch off and cross M1 / M4 on flat diamonds
  // ---------------------------------------------------------------------------------------------------
  for (const [inn, sg, sOff, extra] of [['T3', -1, 70, 40], ['T4', 1, 120, 44]] as const) {
    const p = P(inn);
    const sArcEnd = (() => {
      // end of the fan arc = start of the last (straight) segment
      const bp = p.breakpoints();
      return bp[bp.length - 2]!;
    })();
    const sb = sArcEnd + sOff;
    const pose = p.poseAt(sb);
    const b = new PathBuilder(pose);
    b.arc(450, sg * ((extra * Math.PI) / 180));
    b.straight(farEnd(1385, b.end.h, b.end.z));
    add(`${inn}b`, 'branch', new TrackPath(pose, b.segs, RAIL.topY), { endKind: 'far', minRadius: 400, rank: 3 });
    farPaths.push(`${inn}b`);
  }

  // ---------------------------------------------------------------------------------------------------
  // Goods line + flyover: leaves T6 at z 394, climbs on a 2.4 % ramp, crosses OVER the main lines, sweeps NW
  // ---------------------------------------------------------------------------------------------------
  {
    const t6 = P('T6');
    const z0 = 394;
    const p0 = t6.poseAt(sAtZ(t6, z0));
    const b = new PathBuilder(p0);
    b.sbend(21.5, run(21.5, 4), R_MAIN);
    b.toZ(650);
    b.arc(250, (-29 * Math.PI) / 180);
    b.straight(70);
    b.arc(300, (29 * Math.PI) / 180);
    b.straight(farEnd(1385, 0, b.end.z));
    const ramp: Ramp = { s0: 12, s1: 312, rise: 5.9, blend: 40 };
    add('G', 'goods', new TrackPath(p0, b.segs, RAIL.topY, [ramp]), { endKind: 'far', rank: 3, label: 'goods' });
    farPaths.push('G');
  }

  // ---------------------------------------------------------------------------------------------------
  // East dead-end spurs off the outer-east lane (Q6)
  // ---------------------------------------------------------------------------------------------------
  for (const [id, z0, len] of [['E1', 586, 50], ['E2', 532, 62]] as const) {
    const q = P('T6');
    const p0 = q.poseAt(sAtZ(q, z0));
    const b = new PathBuilder(p0);
    b.arc(R_MAIN, (12 * Math.PI) / 180).straight(len);
    add(id, 'spur', new TrackPath(p0, b.segs, RAIL.topY), { endKind: 'buffer', limit: V_YARD, minRadius: R_YARD, rank: 3 });
  }

  // ---------------------------------------------------------------------------------------------------
  // Carriage yard (west): lead off Q1 at z 574 -> ladder -> 5 sidings, buffer stops at the far ends
  // ---------------------------------------------------------------------------------------------------
  {
    const q = P('T1');
    const p0 = q.poseAt(sAtZ(q, 574));
    const alpha = (32 * Math.PI) / 180;
    const R = R_YARD;
    const lead = new PathBuilder(p0);
    lead.arc(150, -alpha);
    const ladStart = lead.end;
    // siding i leaves the ladder at ladder arc length s_i
    const dx = -Math.sin(ladStart.h); // direction cos along ladder
    void dx;
    const lat = R * (1 - Math.cos(alpha));
    const sidingX = [-62, -66.5, -71, -75.5, -80];
    const sPos: number[] = sidingX.map((x) => {
      // ladder point x(s) = ladStart.x + sin(h) * s ; need x(s) - lat = x_i  -> s
      const s = (x + lat - ladStart.x) / Math.sin(ladStart.h);
      return s;
    });
    // last siding = continuation of the ladder
    const sLast = sPos[sPos.length - 1]!;
    lead.straight(sLast);
    lead.arc(R, alpha);
    lead.straight(175);
    const leadPath = new TrackPath(p0, lead.segs, RAIL.topY);
    add('Y0', 'lead', leadPath, { endKind: 'buffer', limit: V_YARD, minRadius: R_YARD, rank: 3 });
    const arcLen = lead.segs[0]!.len;
    sPos.slice(0, -1).forEach((s, i) => {
      const pose = leadPath.poseAt(arcLen + s);
      const b = new PathBuilder(pose);
      b.arc(R, alpha).straight(175);
      add(`Y${i + 1}`, 'siding', new TrackPath(pose, b.segs, RAIL.topY), { endKind: 'buffer', limit: V_YARD, minRadius: R_YARD, rank: 3 });
    });
  }

  return { defs, farPaths };
}
