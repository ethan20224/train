/**
 * Track graph: nodes / edges derived automatically from a set of continuous track paths (see geom.ts).
 * Pure data + math: no three.js, so Node tests can import it.
 *
 * =========================================================================================================
 *  READ-ONLY DATA API FOR AGENT 6B (point machines, marker posts, switch plates, gantries, catch points,
 *  buffer dressing).  Everything below is exported from `src/tracks/network.ts` (`network`), derived from the
 *  graph; live state (blade position, signal aspects) comes from `interlocking` in `src/tracks/interlocking.ts`.
 *  Also published at runtime as `window.__meridian.tracks` (see src/world/tracks.ts).
 * =========================================================================================================
 *
 *  Conventions: world metres, +y up, plan coordinates (x, z). Heading h = angle from +z toward +x; the unit
 *  tangent is (sin h, cos h). Every path / edge is oriented OUTWARD (away from the platforms / buffer stops).
 *  Rail-top height of a point on edge e at arc length s is `graph.paths[e.pathIdx].path.yAt(s)` (-1.1 at ground).
 *
 *  network.turnouts: TurnoutInfo[]  one per diverging switch ("points"), sorted by z.
 *      { id: node id, number: plate number (101..), x, z, y, heading: tangent of the STRAIGHT route leaving
 *        the toe (outward if the toe faces outward), facing: heading of the stem->branches movement,
 *        side: +1 diverging to the right of that movement, -1 left, stemEdge, straightEdge, divergingEdge,
 *        divergingRadius (m), bladeLength (m) }
 *      Switch blades start at the toe (x,z) and run bladeLength along the straight route; machine sits beside the
 *      toe on the cess side opposite the diverging branch (use side). Live: interlocking.pointState(id)
 *      -> { pos 0..1 (0 = straight, 1 = diverging; animated ~2 s), target, locked (reserved by a route) }.
 *  network.crossings: CrossingInfo[]  flat diamond crossings: { id: node id, x, z, heading (path A), angle (rad)
 *      between the two tracks, edges: [4 edge ids] }. Grade-separated crossings are in network.overpasses.
 *  network.sidingEnds: EndInfo[]  dead ends with a buffer stop: { id: node id, x, z, heading: direction the
 *      buffer FACES (i.e. toward the approaching train, = outward tangent + PI), pathId, kind:
 *      'siding'|'spur'|'platform', edge }. Platform buffers (z 108.4) are drawn by the shed module.
 *  network.catchPoints: CatchInfo[]  catch points near each siding / spur exit: { id, x, z, heading (outward
 *      tangent), side (+1/-1 which rail is the derailer), pathId }.
 *  network.gantries: GantryInfo[]  recommended signal-gantry stations over the throat: { id, z, xMin, xMax
 *      (span incl. margin), spans: [{ edge, x, y, heading }] one per track passing under it, signals: SignalInfo[] }.
 *  SignalInfo { id, gantry, edge, dir (+1: protects movement along the edge orientation = outward, -1 inward),
 *      x, z, y (rail top), heading } and live interlocking.signalAspect(id) -> 'red' | 'yellow' | 'green':
 *      green = the edge is reserved by a route that is set through it and all its points are locked/thrown;
 *      yellow = reserved but a point on that route is still moving; red = not reserved / blocked.
 *  network.overpasses: OverpassInfo[]  grade-separated crossings: { x, z, over: pathId, under: pathId, clearance }.
 *  network.viaducts: ViaductInfo[]  elevated spans (stone viaduct / bridge deck) for dressing: { pathId, s0, s1 }.
 *  network.graph: the full TrackGraph (nodes, edges, paths) for anything else.
 */
import {
  type Crossing,
  type Pose,
  TrackPath,
  angleDiff,
  intersectPaths,
} from './geom';

export type PathRole =
  | 'platform'
  | 'crossover'
  | 'link'
  | 'main'
  | 'fan'
  | 'branch'
  | 'lead'
  | 'ladder'
  | 'siding'
  | 'spur'
  | 'goods';

export interface PathDef {
  id: string;
  role: PathRole;
  path: TrackPath;
  /** Minimum allowed radius (m) for this path (unit-test checked). */
  minRadius: number;
  /** Default speed limit (m/s) of the whole path. */
  limit: number;
  /** Lower = more important (sleepers / ballast layering). */
  rank: number;
  /** What the dead end at the path start / end is, if it is a dead end. */
  startKind?: 'buffer' | 'far';
  endKind?: 'buffer' | 'far';
  /** Free-form label (route boards etc). */
  label?: string;
}

export type NodeKind = 'end' | 'plain' | 'turnout' | 'crossing';

export interface GNode {
  id: number;
  x: number;
  z: number;
  y: number;
  /** Heading of the (first) incident path at this node. */
  h: number;
  kind: NodeKind;
  edges: number[];
  /** End nodes: buffer stop or far boundary (spawn / despawn). */
  endKind?: 'buffer' | 'far';
  // turnout
  stem?: number;
  straight?: number;
  diverging?: number;
  side?: 1 | -1;
  number?: number;
  /** Crossing: the two straight-through pairs of edge ids. */
  pairs?: [[number, number], [number, number]];
}

export interface GEdge {
  id: number;
  pathIdx: number;
  pathId: string;
  s0: number;
  s1: number;
  length: number;
  /** Node at s0 and at s1 (edges are oriented outward). */
  a: number;
  b: number;
  limit: number;
  role: PathRole;
}

export interface OverpassInfo {
  x: number;
  z: number;
  over: string;
  under: string;
  clearance: number;
  overS: number;
  underS: number;
}

export interface Step {
  edge: number;
  /** +1 = traversing a -> b (outward), -1 = b -> a (inward). */
  dir: 1 | -1;
}

export interface TurnoutInfo {
  id: number;
  number: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  facing: number;
  side: 1 | -1;
  stemEdge: number;
  straightEdge: number;
  divergingEdge: number;
  divergingRadius: number;
  bladeLength: number;
}
export interface CrossingInfo {
  id: number;
  x: number;
  z: number;
  heading: number;
  angle: number;
  edges: number[];
}
export interface EndInfo {
  id: number;
  x: number;
  z: number;
  heading: number;
  pathId: string;
  kind: 'siding' | 'spur' | 'platform';
  edge: number;
}
export interface CatchInfo {
  id: number;
  x: number;
  z: number;
  heading: number;
  side: 1 | -1;
  pathId: string;
}
export interface SignalInfo {
  id: number;
  gantry: number;
  edge: number;
  dir: 1 | -1;
  x: number;
  z: number;
  y: number;
  heading: number;
}
export interface GantryInfo {
  id: number;
  z: number;
  xMin: number;
  xMax: number;
  spans: { edge: number; x: number; y: number; heading: number }[];
  signals: SignalInfo[];
}
export interface ViaductInfo {
  pathId: string;
  s0: number;
  s1: number;
}

export class TrackGraph {
  readonly paths: PathDef[];
  readonly nodes: GNode[] = [];
  readonly edges: GEdge[] = [];
  readonly overpasses: OverpassInfo[] = [];
  readonly flatCrossings: Crossing[] = [];
  readonly problems: string[] = [];
  /** edge ids per path, in path order. */
  readonly pathEdges: number[][];
  private pathIndex = new Map<string, number>();
  /** Position-based speed limit (m/s); installed by network.ts. */
  limitFn: (d: PathDef, s: number) => number = (d) => d.limit;

  constructor(defs: PathDef[], opts: { speedLimit?: (e: GEdge, mid: Pose) => number } = {}) {
    this.paths = defs;
    defs.forEach((d, i) => this.pathIndex.set(d.id, i));
    this.pathEdges = defs.map(() => []);
    this.build(opts.speedLimit);
  }

  pathByIndex(i: number): PathDef {
    return this.paths[i]!;
  }
  pathById(id: string): PathDef {
    const i = this.pathIndex.get(id);
    if (i === undefined) throw new Error(`unknown path ${id}`);
    return this.paths[i]!;
  }
  indexOfPath(id: string): number {
    const i = this.pathIndex.get(id);
    if (i === undefined) throw new Error(`unknown path ${id}`);
    return i;
  }

  /** Pose on edge e at arc length s along the PATH (s0..s1). */
  edgePose(e: GEdge, s: number, out?: Pose): Pose {
    return this.paths[e.pathIdx]!.path.poseAt(s, out);
  }

  // ------------------------------------------------------------------------------------------------------
  private build(speedLimit?: (e: GEdge, mid: Pose) => number): void {
    const TOL = 0.003; // 3 mm
    interface Ev {
      p: number;
      s: number;
      x: number;
      z: number;
    }
    const evs: Ev[] = [];
    const addEv = (p: number, s: number): Ev => {
      const q = this.paths[p]!.path.poseAt(s);
      const e = { p, s, x: q.x, z: q.z };
      evs.push(e);
      return e;
    };
    this.paths.forEach((d, p) => {
      addEv(p, 0);
      addEv(p, d.path.length);
    });
    // endpoint touching another path's interior
    this.paths.forEach((d, p) => {
      for (const sEnd of [0, d.path.length]) {
        const pe = d.path.poseAt(sEnd);
        this.paths.forEach((o, q) => {
          if (q === p) return;
          const pr = o.path.project(pe.x, pe.z);
          if (pr.d < TOL && pr.s > 1e-4 && pr.s < o.path.length - 1e-4) {
            const op = o.path.poseAt(pr.s);
            const dh = Math.abs(angleDiff(op.h, pe.h));
            const tang = Math.min(dh, Math.PI - dh);
            if (tang > 0.0035) this.problems.push(`touch ${d.id}@${sEnd.toFixed(1)} on ${o.id}@${pr.s.toFixed(1)}: tangent jump ${((tang * 180) / Math.PI).toFixed(2)} deg`);
            addEv(q, pr.s);
          }
        });
      }
    });
    // crossings
    for (let i = 0; i < this.paths.length; i++) {
      for (let j = i + 1; j < this.paths.length; j++) {
        const A = this.paths[i]!;
        const B = this.paths[j]!;
        const cs = intersectPaths(A.path, B.path);
        for (const c of cs) {
          // ignore hits that coincide with an existing attach node (tangential touches)
          const ya = A.path.yAt(c.sa);
          const yb = B.path.yAt(c.sb);
          const dy = Math.abs(ya - yb);
          if (dy < 0.4) {
            this.flatCrossings.push(c);
            addEv(i, c.sa);
            addEv(j, c.sb);
          } else if (dy > 3.4) {
            const over = ya > yb ? A : B;
            const under = ya > yb ? B : A;
            this.overpasses.push({
              x: c.x,
              z: c.z,
              over: over.id,
              under: under.id,
              clearance: dy,
              overS: ya > yb ? c.sa : c.sb,
              underS: ya > yb ? c.sb : c.sa,
            });
          } else this.problems.push(`ambiguous crossing ${A.id} x ${B.id} at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) dy=${dy.toFixed(2)}`);
        }
      }
    }
    // cluster events into nodes
    const cluster = new Array<number>(evs.length).fill(-1);
    let nNodes = 0;
    const order = evs.map((_, i) => i).sort((a, b) => evs[a]!.z - evs[b]!.z);
    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi]!;
      if (cluster[i]! >= 0) continue;
      cluster[i] = nNodes;
      for (let oj = oi + 1; oj < order.length; oj++) {
        const j = order[oj]!;
        if (evs[j]!.z - evs[i]!.z > TOL * 4) break;
        if (cluster[j]! >= 0) continue;
        if (Math.hypot(evs[j]!.x - evs[i]!.x, evs[j]!.z - evs[i]!.z) < TOL) cluster[j] = nNodes;
      }
      nNodes++;
    }
    // per path: sorted unique node stops
    const perPath: { s: number; node: number }[][] = this.paths.map(() => []);
    evs.forEach((e, i) => perPath[e.p]!.push({ s: e.s, node: cluster[i]! }));
    const nodeAcc: { x: number; z: number; n: number }[] = Array.from({ length: nNodes }, () => ({ x: 0, z: 0, n: 0 }));
    evs.forEach((e, i) => {
      const a = nodeAcc[cluster[i]!]!;
      a.x += e.x;
      a.z += e.z;
      a.n++;
    });
    for (let n = 0; n < nNodes; n++) {
      const a = nodeAcc[n]!;
      this.nodes.push({ id: n, x: a.x / a.n, z: a.z / a.n, y: 0, h: 0, kind: 'plain', edges: [] });
    }
    this.paths.forEach((d, p) => {
      const list = perPath[p]!.sort((a, b) => a.s - b.s);
      // dedupe equal s / equal node
      const u: { s: number; node: number }[] = [];
      for (const it of list) {
        const last = u[u.length - 1];
        if (last && Math.abs(last.s - it.s) < 1e-4) {
          if (last.node !== it.node) this.problems.push(`path ${d.id}: two nodes at s=${it.s.toFixed(3)}`);
          continue;
        }
        u.push(it);
      }
      for (let k = 0; k + 1 < u.length; k++) {
        const e: GEdge = {
          id: this.edges.length,
          pathIdx: p,
          pathId: d.id,
          s0: u[k]!.s,
          s1: u[k + 1]!.s,
          length: u[k + 1]!.s - u[k]!.s,
          a: u[k]!.node,
          b: u[k + 1]!.node,
          limit: d.limit,
          role: d.role,
        };
        this.edges.push(e);
        this.pathEdges[p]!.push(e.id);
        this.nodes[e.a]!.edges.push(e.id);
        this.nodes[e.b]!.edges.push(e.id);
        const mid = d.path.poseAt((e.s0 + e.s1) / 2);
        if (speedLimit) e.limit = speedLimit(e, mid);
      }
    });
    // node attributes
    for (const n of this.nodes) {
      const e0 = this.edges[n.edges[0]!]!;
      const sAt = e0.a === n.id ? e0.s0 : e0.s1;
      const pose = this.paths[e0.pathIdx]!.path.poseAt(sAt);
      n.h = pose.h;
      n.y = this.paths[e0.pathIdx]!.path.yAt(sAt);
      this.classify(n);
    }
    // turnout numbers by z
    const tn = this.nodes.filter((n) => n.kind === 'turnout').sort((a, b) => a.z - b.z || a.x - b.x);
    tn.forEach((n, i) => (n.number = 101 + i));
    this.validate();
  }

  /** Outgoing direction angle (heading) of edge e as seen leaving node n. */
  outHeading(n: GNode, e: GEdge): number {
    const p = this.paths[e.pathIdx]!.path;
    if (e.a === n.id) return p.poseAt(e.s0).h;
    return p.poseAt(e.s1).h + Math.PI;
  }

  private classify(n: GNode): void {
    const ed = n.edges.map((i) => this.edges[i]!);
    if (ed.length === 1) {
      n.kind = 'end';
      const e = ed[0]!;
      const d = this.paths[e.pathIdx]!;
      n.endKind = e.a === n.id ? (d.startKind ?? 'far') : (d.endKind ?? 'far');
      return;
    }
    if (ed.length === 2) {
      n.kind = 'plain';
      const h0 = this.outHeading(n, ed[0]!);
      const h1 = this.outHeading(n, ed[1]!);
      const dd = Math.abs(angleDiff(h0, h1 + Math.PI));
      if (dd > 0.0017) this.problems.push(`node ${n.id} (${n.x.toFixed(1)}, ${n.z.toFixed(1)}): plain joint kink ${((dd * 180) / Math.PI).toFixed(3)} deg`);
      return;
    }
    if (ed.length === 3) {
      n.kind = 'turnout';
      const hs = ed.map((e) => this.outHeading(n, e));
      // stem: the edge whose direction differs by > 90 deg from both others
      let stemI = -1;
      for (let i = 0; i < 3; i++) {
        const o = [0, 1, 2].filter((j) => j !== i);
        if (o.every((j) => Math.abs(angleDiff(hs[i]!, hs[j]!)) > Math.PI / 2)) stemI = i;
      }
      if (stemI < 0) {
        this.problems.push(`node ${n.id} (${n.x.toFixed(1)}, ${n.z.toFixed(1)}): turnout without a clear stem`);
        stemI = 0;
      }
      const o = [0, 1, 2].filter((j) => j !== stemI);
      const back = hs[stemI]! + Math.PI;
      const dev = o.map((j) => Math.abs(angleDiff(hs[j]!, back)));
      let straightJ = dev[0]! <= dev[1]! ? o[0]! : o[1]!;
      let divJ = straightJ === o[0] ? o[1]! : o[0]!;
      if (Math.abs(dev[0]! - dev[1]!) < 1e-6) {
        // symmetric: the lower |curvature| leaves straight
        const k0 = Math.abs(this.paths[ed[o[0]!]!.pathIdx]!.path.curvatureAt(ed[o[0]!]!.a === n.id ? ed[o[0]!]!.s0 + 0.01 : ed[o[0]!]!.s1 - 0.01));
        const k1 = Math.abs(this.paths[ed[o[1]!]!.pathIdx]!.path.curvatureAt(ed[o[1]!]!.a === n.id ? ed[o[1]!]!.s0 + 0.01 : ed[o[1]!]!.s1 - 0.01));
        straightJ = k0 <= k1 ? o[0]! : o[1]!;
        divJ = straightJ === o[0] ? o[1]! : o[0]!;
      }
      n.stem = ed[stemI]!.id;
      n.straight = ed[straightJ]!.id;
      n.diverging = ed[divJ]!.id;
      n.side = angleDiff(hs[divJ]!, hs[straightJ]!) >= 0 ? 1 : -1;
      // G1 at a turnout: both branches leave in the stem's direction at the toe
      for (const j of o) {
        const dd = Math.abs(angleDiff(hs[j]!, back));
        if (dd > 0.0017) this.problems.push(`node ${n.id} (${n.x.toFixed(1)}, ${n.z.toFixed(1)}): turnout branch kink ${((dd * 180) / Math.PI).toFixed(3)} deg`);
      }
      return;
    }
    if (ed.length === 4) {
      n.kind = 'crossing';
      // pair by path: the two edges of the same path are the straight-through pairs
      const byPath = new Map<number, number[]>();
      for (const e of ed) {
        const arr = byPath.get(e.pathIdx) ?? [];
        arr.push(e.id);
        byPath.set(e.pathIdx, arr);
      }
      const groups = [...byPath.values()];
      if (groups.length !== 2 || groups.some((g) => g.length !== 2)) {
        this.problems.push(`node ${n.id}: crossing is not two straight-through pairs`);
        return;
      }
      n.pairs = [
        [groups[0]![0]!, groups[0]![1]!],
        [groups[1]![0]!, groups[1]![1]!],
      ];
      return;
    }
    this.problems.push(`node ${n.id} (${n.x.toFixed(1)}, ${n.z.toFixed(1)}): unsupported degree ${ed.length}`);
  }

  /** Structural validation: appends to `problems`. */
  private validate(): void {
    for (const d of this.paths) {
      for (let i = 0; i < d.path.segs.length; i++) {
        const k = Math.abs(d.path.segs[i]!.k);
        if (k > 1e-9 && 1 / k < d.minRadius - 1e-6) this.problems.push(`path ${d.id}: radius ${(1 / k).toFixed(1)} < min ${d.minRadius}`);
      }
    }
  }

  /** Edge's heading-tangent at node n and travel semantics: returns [s at node on path]. */
  edgeSAt(e: GEdge, node: number): number {
    return e.a === node ? e.s0 : e.s1;
  }

  /**
   * Allowed continuations when a train finishes traversing `step` and enters the node ahead.
   * Turnouts: stem <-> either branch (never branch -> branch). Crossings: straight through only.
   * Returns the next steps with the required point state (0 = straight, 1 = diverging) when the node is a turnout.
   */
  next(step: Step): { step: Step; node: number; state?: 0 | 1 }[] {
    const e = this.edges[step.edge]!;
    const nodeId = step.dir > 0 ? e.b : e.a;
    const n = this.nodes[nodeId]!;
    const out: { step: Step; node: number; state?: 0 | 1 }[] = [];
    const push = (eid: number, state?: 0 | 1): void => {
      const ne = this.edges[eid]!;
      const dir: 1 | -1 = ne.a === nodeId ? 1 : -1;
      out.push({ step: { edge: eid, dir }, node: nodeId, ...(state === undefined ? {} : { state }) });
    };
    switch (n.kind) {
      case 'end':
        break;
      case 'plain':
        for (const eid of n.edges) if (eid !== e.id) push(eid);
        break;
      case 'turnout':
        if (e.id === n.stem) {
          push(n.straight!, 0);
          push(n.diverging!, 1);
        } else if (e.id === n.straight) push(n.stem!, 0);
        else if (e.id === n.diverging) push(n.stem!, 1);
        break;
      case 'crossing': {
        for (const pr of n.pairs ?? []) {
          if (pr[0] === e.id) push(pr[1]);
          else if (pr[1] === e.id) push(pr[0]);
        }
        break;
      }
    }
    return out;
  }

  /** Far-end boundary nodes (spawn / despawn). */
  farNodes(): GNode[] {
    return this.nodes.filter((n) => n.kind === 'end' && n.endKind === 'far');
  }
  bufferNodes(): GNode[] {
    return this.nodes.filter((n) => n.kind === 'end' && n.endKind === 'buffer');
  }

  /**
   * Cheapest route (Dijkstra over directed edge states) from `from` (the step the train is on / enters) to the goal
   * step (inclusive). `jitter` randomises edge costs (1..1+jitter) so that different crossovers get used.
   */
  findRoute(from: Step, goal: Step, rnd: () => number = Math.random, jitter = 0.35, forbid?: (eid: number) => boolean): Step[] | null {
    const key = (s: Step): number => s.edge * 2 + (s.dir > 0 ? 1 : 0);
    const dist = new Map<number, number>();
    const prev = new Map<number, number>();
    const stepOf = new Map<number, Step>();
    const heap: { k: number; d: number }[] = [];
    const push = (k: number, d: number): void => {
      heap.push({ k, d });
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p]!.d <= heap[i]!.d) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        i = p;
      }
    };
    const pop = (): { k: number; d: number } => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l]!.d < heap[m]!.d) m = l;
          if (r < heap.length && heap[r]!.d < heap[m]!.d) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top;
    };
    const k0 = key(from);
    dist.set(k0, this.edges[from.edge]!.length);
    stepOf.set(k0, from);
    push(k0, dist.get(k0)!);
    const kg = key(goal);
    const factor = new Map<number, number>();
    const f = (eid: number): number => {
      let v = factor.get(eid);
      if (v === undefined) {
        v = 1 + rnd() * jitter;
        factor.set(eid, v);
      }
      return v;
    };
    while (heap.length > 0) {
      const { k, d } = pop();
      if (d > (dist.get(k) ?? Infinity) + 1e-9) continue;
      if (k === kg) break;
      const cur = stepOf.get(k)!;
      for (const nx of this.next(cur)) {
        if (forbid?.(nx.step.edge)) continue;
        const nk = key(nx.step);
        const nd = d + this.edges[nx.step.edge]!.length * f(nx.step.edge);
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          prev.set(nk, k);
          stepOf.set(nk, nx.step);
          push(nk, nd);
        }
      }
    }
    if (!dist.has(kg)) return null;
    const out: Step[] = [];
    let k = kg;
    for (;;) {
      out.push(stepOf.get(k)!);
      const p = prev.get(k);
      if (p === undefined) break;
      k = p;
    }
    return out.reverse();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Routes as a continuous parametrised path
// ---------------------------------------------------------------------------------------------------------

export interface RoutePiece {
  edge: number;
  dir: 1 | -1;
  pathIdx: number;
  /** Path arc length at the piece start / end in travel order (s0 may be > s1 when dir = -1). */
  sFrom: number;
  sTo: number;
  /** Route arc length at the start / end of the piece. */
  u0: number;
  u1: number;
  /** Node entered at the end of the piece (-1 for the last). */
  nodeEnd: number;
  /** Required point state at nodeEnd (0 / 1) for turnouts, else -1. */
  state: number;
}

/**
 * Continuous parametrisation of a route: u = distance travelled along the route from `u = 0` at the start of the
 * first piece. Positions outside [0, length] extrapolate straight along the first / last piece.
 * `outwardPose(u)` returns the pose with heading along the PATH orientation (outward), independent of travel direction.
 */
export class RoutePath {
  readonly pieces: RoutePiece[];
  readonly length: number;
  constructor(
    private readonly g: TrackGraph,
    readonly steps: Step[],
    /** Path arc length where the route starts on the first edge / ends on the last edge. */
    sStart: number,
    sEnd: number,
  ) {
    this.pieces = [];
    let u = 0;
    steps.forEach((st, i) => {
      const e = g.edges[st.edge]!;
      const first = i === 0;
      const last = i === steps.length - 1;
      const sFrom = first ? sStart : st.dir > 0 ? e.s0 : e.s1;
      const sTo = last ? sEnd : st.dir > 0 ? e.s1 : e.s0;
      const len = Math.abs(sTo - sFrom);
      let node = -1;
      let state = -1;
      if (!last) {
        const nx = g.next(st).find((c) => c.step.edge === steps[i + 1]!.edge && c.step.dir === steps[i + 1]!.dir);
        if (!nx) throw new Error('RoutePath: steps are not connected');
        node = nx.node;
        state = nx.state ?? -1;
      }
      this.pieces.push({ edge: st.edge, dir: st.dir, pathIdx: e.pathIdx, sFrom, sTo, u0: u, u1: u + len, nodeEnd: node, state });
      u += len;
    });
    this.length = u;
  }

  pieceIndex(u: number): number {
    return this.pieceAt(u);
  }

  private pieceAt(u: number): number {
    const p = this.pieces;
    if (u <= 0) return 0;
    if (u >= this.length) return p.length - 1;
    let lo = 0;
    let hi = p.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (p[mid]!.u0 <= u) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Path arc length (on the piece's path) at route distance u (extrapolating beyond the ends). */
  private sAt(pc: RoutePiece, u: number): number {
    const d = u - pc.u0;
    return pc.dir > 0 ? pc.sFrom + d : pc.sFrom - d;
  }

  outwardPose(u: number, out: Pose = { x: 0, z: 0, h: 0 }): Pose {
    const pc = this.pieces[this.pieceAt(u)]!;
    return this.g.paths[pc.pathIdx]!.path.poseAt(this.sAt(pc, u), out);
  }
  /** Rail-top y at u. */
  yAt(u: number): number {
    const pc = this.pieces[this.pieceAt(u)]!;
    return this.g.paths[pc.pathIdx]!.path.yAt(this.sAt(pc, u));
  }
  /** Slope dy/ds (along the path orientation) at u. */
  slopeAt(u: number): number {
    const pc = this.pieces[this.pieceAt(u)]!;
    return this.g.paths[pc.pathIdx]!.path.slopeAt(this.sAt(pc, u));
  }
  /** Speed limit (m/s) at u. */
  limitAt(u: number): number {
    const pc = this.pieces[this.pieceAt(u)]!;
    return this.g.limitFn(this.g.paths[pc.pathIdx]!, this.sAt(pc, Math.min(this.length, Math.max(0, u))));
  }
  edgeAt(u: number): number {
    return this.pieces[this.pieceAt(u)]!.edge;
  }
}
