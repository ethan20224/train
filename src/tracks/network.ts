/**
 * The network singleton: graph + derived read-only data for dressing (see the API doc at the top of graph.ts).
 * Pure (no three.js).
 */
import { angleDiff } from './geom';
import {
  type CatchInfo,
  type CrossingInfo,
  type EndInfo,
  type GantryInfo,
  type PathDef,
  type SignalInfo,
  type TurnoutInfo,
  type ViaductInfo,
  TrackGraph,
} from './graph';
import { Interlocking } from './interlocking';
import { THROAT_Z0, THROAT_Z1, V_CRUISE, V_OUTER, V_THROAT, V_YARD, defineNetwork } from './topology';

/** Speed limit (m/s) at path arc length s of path `d` (position based, so S-bends inside long edges are covered). */
export function speedLimitAt(d: PathDef, s: number): number {
  if (d.role === 'lead' || d.role === 'ladder' || d.role === 'siding' || d.role === 'spur') return V_YARD;
  const p = d.path.poseAt(s);
  if (p.z >= THROAT_Z0 && p.z < THROAT_Z1) return V_THROAT;
  if (Math.abs(d.path.curvatureAt(s)) > 1 / 460) return V_OUTER;
  return V_CRUISE;
}

export interface Network {
  graph: TrackGraph;
  farPaths: string[];
  turnouts: TurnoutInfo[];
  crossings: CrossingInfo[];
  sidingEnds: EndInfo[];
  catchPoints: CatchInfo[];
  gantries: GantryInfo[];
  signals: SignalInfo[];
  overpasses: TrackGraph['overpasses'];
  viaducts: ViaductInfo[];
}

function build(): Network {
  const { defs, farPaths } = defineNetwork();
  const graph = new TrackGraph(defs);
  graph.limitFn = speedLimitAt;
  const turnouts: TurnoutInfo[] = [];
  const crossings: CrossingInfo[] = [];
  const sidingEnds: EndInfo[] = [];
  for (const n of graph.nodes) {
    if (n.kind === 'turnout') {
      const st = graph.edges[n.stem!]!;
      const dv = graph.edges[n.diverging!]!;
      const stH = graph.outHeading(n, st);
      const divPath = graph.paths[dv.pathIdx]!.path;
      const sd = dv.a === n.id ? dv.s0 + 0.01 : dv.s1 - 0.01;
      const k = Math.abs(divPath.curvatureAt(sd));
      const straightH = graph.outHeading(n, graph.edges[n.straight!]!);
      turnouts.push({
        id: n.id,
        number: n.number!,
        x: n.x,
        z: n.z,
        y: n.y,
        heading: straightH,
        facing: stH + Math.PI,
        side: n.side!,
        stemEdge: n.stem!,
        straightEdge: n.straight!,
        divergingEdge: n.diverging!,
        divergingRadius: k > 1e-9 ? 1 / k : Infinity,
        bladeLength: 5.5,
      });
    } else if (n.kind === 'crossing') {
      const e0 = graph.edges[n.pairs![0][0]]!;
      const e1 = graph.edges[n.pairs![1][0]]!;
      const h0 = graph.outHeading(n, e0);
      const h1 = graph.outHeading(n, e1);
      const dh = Math.abs(angleDiff(h0, h1));
      crossings.push({ id: n.id, x: n.x, z: n.z, heading: h0, angle: Math.min(dh, Math.PI - dh), edges: n.edges.slice() });
    } else if (n.kind === 'end' && n.endKind === 'buffer') {
      const e = graph.edges[n.edges[0]!]!;
      const d = graph.paths[e.pathIdx]!;
      sidingEnds.push({
        id: n.id,
        x: n.x,
        z: n.z,
        heading: graph.outHeading(n, e),
        pathId: d.id,
        kind: d.role === 'platform' ? 'platform' : d.role === 'spur' ? 'spur' : 'siding',
        edge: e.id,
      });
    }
  }
  turnouts.sort((a, b) => a.z - b.z);
  // catch points 8 m beyond each siding / spur toe (the lead Y0 carries the 5th siding after its ladder)
  const catchPoints: CatchInfo[] = [];
  graph.paths.forEach((d, i) => {
    if (d.role !== 'siding' && d.role !== 'spur' && d.id !== 'Y0') return;
    const p = d.path;
    const s = d.id === 'Y0' ? p.breakpoints()[3]! + 8 : 8 + (p.segs[0]?.len ?? 0);
    const q = p.poseAt(Math.min(s, p.length - 5));
    catchPoints.push({ id: i, x: q.x, z: q.z, heading: q.h, side: 1, pathId: d.id });
  });
  // gantries over the throat
  const gantries: GantryInfo[] = [];
  const signals: SignalInfo[] = [];
  [430, 520, 610, 700].forEach((z, gi) => {
    const spans: GantryInfo['spans'] = [];
    for (const e of graph.edges) {
      const d = graph.paths[e.pathIdx]!;
      if (d.role === 'siding' || d.role === 'lead' || d.role === 'spur' || d.role === 'goods' || d.role === 'crossover') continue;
      const pa = d.path.poseAt(e.s0);
      const pb = d.path.poseAt(e.s1);
      if (Math.min(pa.z, pb.z) > z || Math.max(pa.z, pb.z) < z) continue;
      const q = d.path.project(0, z, e.s0, e.s1);
      const pq = d.path.poseAt(q.s);
      if (Math.abs(pq.z - z) > 3 || Math.abs(pq.x) > 40) continue;
      spans.push({ edge: e.id, x: pq.x, y: d.path.yAt(q.s), heading: pq.h });
    }
    spans.sort((a, b) => a.x - b.x);
    const xs = spans.map((s) => s.x);
    const gSignals: SignalInfo[] = [];
    for (const sp of spans) {
      for (const dir of [1, -1] as const) {
        const sg: SignalInfo = { id: signals.length, gantry: gi, edge: sp.edge, dir, x: sp.x, z, y: sp.y, heading: sp.heading };
        signals.push(sg);
        gSignals.push(sg);
      }
    }
    gantries.push({ id: gi, z, xMin: Math.min(...xs) - 3, xMax: Math.max(...xs) + 3, spans, signals: gSignals });
  });
  // elevated spans (viaduct)
  const viaducts: ViaductInfo[] = [];
  for (const d of graph.paths) {
    if (d.path.ramps.length === 0) continue;
    let s0 = -1;
    for (let s = 0; s <= d.path.length; s += 2) {
      const hi = d.path.yAt(s) + 1.1 > 1.2;
      if (hi && s0 < 0) s0 = s;
      if (!hi && s0 >= 0) {
        viaducts.push({ pathId: d.id, s0, s1: s });
        s0 = -1;
      }
    }
    if (s0 >= 0) viaducts.push({ pathId: d.id, s0, s1: d.path.length });
  }
  return { graph, farPaths, turnouts, crossings, sidingEnds, catchPoints, gantries, signals, overpasses: graph.overpasses, viaducts };
}

export const network: Network = build();

/** Live interlocking (reservations, point positions, signal aspects) of the singleton network. */
export const interlocking = new Interlocking(network.graph);
