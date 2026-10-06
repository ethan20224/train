/**
 * Traffic director + train state machine over the track network. Pure (no three.js): the scheduler (three.js glue)
 * and Node tests drive it.
 *
 * Train kinds:
 *   arrival    nose first from a far end (haze) over a reserved route into a platform track, stops at nose z = 111
 *   dwell      at the platform (doors open; extended while its departure route is blocked)
 *   departure  tail first (terminus, the loco trails) from the platform to a far end
 *   shuntIn    departure to a yard siding (empty stock), tail first, ends 2.5 m short of the buffer
 *   stabled    parked in a siding (nose out); later shuntOut
 *   shuntOut   nose first from the siding to a free platform (becomes a dwell, then a normal departure)
 * Positions: route distance u of the LEADER (nose for arrival / shuntOut, tail for departure / shuntIn).
 * The consist points are at u - d (leader nose) or u - L + d (leader tail), d = distance from the nose.
 */
import { PLATFORM_SAFETY, RAIL, TRACKS } from '../layout';
import { type RoutePath, type Step, RoutePath as RP } from '../tracks/graph';
import { Interlocking, CLEAR_MARGIN } from '../tracks/interlocking';
import { network } from '../tracks/network';
import { type LimitInterval, type Profile, buildProfile } from '../tracks/motion';
import { PLATFORM_STOP_S, V_CRUISE } from '../tracks/topology';

export const TRAIN_L = PLATFORM_SAFETY.consist.locoLength + PLATFORM_SAFETY.consist.carCount * (PLATFORM_SAFETY.consist.carLength + PLATFORM_SAFETY.consist.gap);
export const MAX_ACTIVE = 6;
export const RESERVED_DWELL = 90;
export const POOL = 7;
const PLAN_START = TRAIN_L + 2;
const DEP_U0 = PLATFORM_STOP_S + TRAIN_L;
const SIDING_U0 = 2.5 + TRAIN_L;
const DEPART_LEAD = 14; // s before the end of the dwell the departure route is reserved
const SPAWN_DIST = 700;
const REQUEST_SPAWN_DIST = 600;
const SIDING_PATHS = ['Y1', 'Y2', 'Y3', 'Y4', 'Y0'] as const;

export type Kind = 'arrival' | 'dwell' | 'departure' | 'shuntIn' | 'stabled' | 'shuntOut';
export type TPhase = 'cruiseIn' | 'brake' | 'dwell' | 'accel' | 'cruiseOut';

export interface Train {
  id: number;
  active: boolean;
  kind: Kind;
  platform: number | null;
  route: RoutePath | null;
  routeName: string;
  profile: Profile | null;
  /** Seconds into the profile. */
  t: number;
  /** Leader route distance and speed. */
  u: number;
  v: number;
  /** +1: leader is the nose (arrival-type), -1: leader is the tail. */
  orient: 1 | -1;
  dwell: number;
  dwellT: number;
  held: boolean;
  reserved: boolean;
  /** Prepared (reserved) departure route + profile. */
  nextRoute: RoutePath | null;
  nextName: string;
  nextKind: Kind;
  stableT: number;
  stableFor: number;
  /** Sim seconds spent in the current kind. */
  age: number;
  cruise: number;
  /** True until the points on the route are thrown (the train does not move). */
  waiting: boolean;
  /** First reserved piece (pieces behind the rear are not reserved). */
  piece0: number;
  voiceBraked: boolean;
}

export interface TrafficHooks {
  onSpawn?(t: Train): void;
  onDespawn?(t: Train): void;
  onBrake?(t: Train): void;
  onDepart?(t: Train): void;
}

export interface TrackStateOut {
  track: number;
  phase: TPhase | null;
  t: number;
  dwell: number;
  nose: number;
  speed: number;
  held: boolean;
  /** 'arriving' | 'dwelling' | 'departing' | null */
  moving: 'arriving' | 'dwelling' | 'departing' | null;
}

const rand = (rnd: () => number, a: number, b: number): number => a + rnd() * (b - a);

export class Traffic {
  readonly g = network.graph;
  readonly il: Interlocking;
  readonly trains: Train[] = [];
  readonly stats = { spawns: 0, despawns: 0, arrivals: 0, departures: 0, shuntsIn: 0, shuntsOut: 0, blockedArrivals: 0, heldDepartures: 0 };
  time = 0;
  private nextArrival = 6;
  private lastPlatform = -1;
  private pendingRequest: number | null = null;
  private pendingTries = 0;
  private platformPath: number[];
  private firstEdge: number[];
  private lastEdge = new Map<string, number>();
  private farIdx: string[];
  /** Sim time already spent for the very first arrival logic. */
  firstArrival = true;

  constructor(
    private readonly rnd: () => number = Math.random,
    private readonly hooks: TrafficHooks = {},
    il?: Interlocking,
  ) {
    this.il = il ?? new Interlocking(network.graph);
    for (let i = 0; i < POOL; i++) this.trains.push(this.blank(i));
    this.platformPath = TRACKS.map((t) => this.g.indexOfPath(t.id));
    this.firstEdge = this.platformPath.map((pi) => this.g.pathEdges[pi]![0]!);
    for (const d of this.g.paths) {
      const pi = this.g.indexOfPath(d.id);
      const es = this.g.pathEdges[pi]!;
      this.lastEdge.set(d.id, es[es.length - 1]!);
    }
    this.farIdx = network.farPaths.slice();
  }

  private blank(id: number): Train {
    return {
      id,
      active: false,
      kind: 'arrival',
      platform: null,
      route: null,
      routeName: '',
      profile: null,
      t: 0,
      u: 0,
      v: 0,
      orient: 1,
      dwell: 30,
      dwellT: 0,
      held: false,
      reserved: false,
      nextRoute: null,
      nextName: '',
      nextKind: 'departure',
      stableT: 0,
      stableFor: 50,
      age: 0,
      cruise: 22,
      waiting: false,
      piece0: 0,
      voiceBraked: false,
    };
  }

  // -------------------------------------------------------------------------------------------- routes
  private makeRoute(steps: Step[], sStart: number, sEnd: number): RoutePath {
    return new RP(this.g, steps, sStart, sEnd);
  }

  /** Arrival route: far path end -> platform k (nose stop). */
  arrivalRoute(far: string, k: number, jitter = 0.35): RoutePath | null {
    const fe = this.lastEdge.get(far)!;
    const steps = this.g.findRoute({ edge: fe, dir: -1 }, { edge: this.firstEdge[k]!, dir: -1 }, this.rnd, jitter);
    if (!steps) return null;
    const farLen = this.g.paths[this.g.indexOfPath(far)]!.path.length;
    return this.makeRoute(steps, farLen, PLATFORM_STOP_S);
  }
  /** Departure route: platform k -> far path end. */
  departureRoute(k: number, far: string, jitter = 0.35): RoutePath | null {
    const fe = this.lastEdge.get(far)!;
    const steps = this.g.findRoute({ edge: this.firstEdge[k]!, dir: 1 }, { edge: fe, dir: 1 }, this.rnd, jitter);
    if (!steps) return null;
    return this.makeRoute(steps, 0, this.g.paths[this.g.indexOfPath(far)]!.path.length);
  }
  shuntInRoute(k: number, siding: string, jitter = 0.35): RoutePath | null {
    const fe = this.lastEdge.get(siding)!;
    const steps = this.g.findRoute({ edge: this.firstEdge[k]!, dir: 1 }, { edge: fe, dir: 1 }, this.rnd, jitter);
    if (!steps) return null;
    return this.makeRoute(steps, 0, this.g.paths[this.g.indexOfPath(siding)]!.path.length - 2.5);
  }
  shuntOutRoute(siding: string, k: number, jitter = 0.35): RoutePath | null {
    const fe = this.lastEdge.get(siding)!;
    const steps = this.g.findRoute({ edge: fe, dir: -1 }, { edge: this.firstEdge[k]!, dir: -1 }, this.rnd, jitter);
    if (!steps) return null;
    return this.makeRoute(steps, this.g.paths[this.g.indexOfPath(siding)]!.path.length, PLATFORM_STOP_S);
  }

  private limits(route: RoutePath, cruise: number): LimitInterval[] {
    const out: LimitInterval[] = [];
    let cur: LimitInterval | null = null;
    for (let u = 0; u <= route.length + 4; u += 4) {
      const lim = route.limitAt(Math.min(u, route.length));
      if (lim < cruise - 1e-6) {
        if (cur && Math.abs(cur.v - lim) < 1e-6) cur.u1 = u + 4;
        else {
          cur = { u0: u, u1: u + 4, v: lim };
          out.push(cur);
        }
      } else cur = null;
    }
    // the whole train must obey: extend by the train length
    for (const l of out) l.u1 += TRAIN_L;
    // zones start where the leader's own position enters (u0 is exact to 4 m: pull earlier by 4 m for safety)
    for (const l of out) l.u0 = Math.max(0, l.u0 - 4);
    return out;
  }

  /** One-edge route used to place a stabled train: u = 0 at the buffer, increasing toward the toe. */
  private stub(siding: string): RoutePath {
    const e = this.lastEdge.get(siding)!;
    const ed = this.g.edges[e]!;
    return this.makeRoute([{ edge: e, dir: -1 }], ed.s1, ed.s0);
  }

  // -------------------------------------------------------------------------------------------- spawn helpers
  private freeSlot(): Train | null {
    return this.trains.find((x) => !x.active) ?? null;
  }
  setNextArrival(t: number): void {
    this.nextArrival = t;
  }
  activeCount(): number {
    return this.trains.filter((x) => x.active).length;
  }
  private platformBusy(k: number): boolean {
    return this.trains.some((x) => x.active && x.platform === k);
  }
  freePlatforms(): number[] {
    return TRACKS.map((_, i) => i).filter((i) => !this.platformBusy(i));
  }
  stabledCount(): number {
    return this.trains.filter((x) => x.active && x.kind === 'stabled').length;
  }

  private activate(tr: Train, kind: Kind): void {
    tr.active = true;
    tr.kind = kind;
    tr.age = 0;
    tr.held = false;
    tr.reserved = false;
    tr.nextRoute = null;
    tr.voiceBraked = false;
    tr.cruise = rand(this.rnd, 21, 23.5);
    this.stats.spawns++;
    this.hooks.onSpawn?.(tr);
  }

  private deactivate(tr: Train): void {
    this.il.releaseAll(tr.id);
    tr.active = false;
    tr.platform = null;
    tr.route = null;
    tr.profile = null;
    this.stats.despawns++;
    this.hooks.onDespawn?.(tr);
  }

  /** Try to set up a new arrival to platform k. Returns the train or null. */
  spawnArrival(k: number, opts: { far?: string; spawnDist?: number; noseZ?: number; dwell?: number; reserved?: boolean; force?: boolean } = {}): Train | null {
    const tr = this.freeSlot();
    if (!tr) return null;
    if (!opts.force && this.activeCount() >= MAX_ACTIVE) return null;
    if (this.platformBusy(k)) return null;
    const fars = opts.far ? [opts.far] : this.shuffled(this.farIdx);
    for (const far of fars.slice(0, 6)) {
      const route = this.arrivalRoute(far, k);
      if (!route) continue;
      const uEnd = route.length;
      let u0 = Math.max(PLAN_START, uEnd - (opts.spawnDist ?? SPAWN_DIST));
      if (opts.noseZ !== undefined) {
        // find the leader distance whose nose z matches
        let best = u0;
        let bd = 1e9;
        for (let u = PLAN_START; u <= uEnd; u += 1) {
          const dz = Math.abs(route.outwardPose(u).z - opts.noseZ);
          if (dz < bd) {
            bd = dz;
            best = u;
          }
        }
        u0 = best;
      }
      const startPiece = route.pieceIndex(Math.max(0, u0 - TRAIN_L));
      if (!this.il.reserve(tr.id, route, startPiece)) continue;
      this.activate(tr, 'arrival');
      tr.platform = k;
      tr.dwell = opts.dwell ?? rand(this.rnd, 25, 40);
      tr.dwellT = 0;
      tr.reserved = !!opts.reserved;
      tr.cruise = rand(this.rnd, 21, 23.5);
      const lim = this.limits(route, tr.cruise);
      const prof = buildProfile(PLAN_START, tr.cruise, uEnd, 0, tr.cruise, lim);
      tr.route = route;
      tr.routeName = `${far}>${TRACKS[k]!.id}`;
      tr.orient = 1;
      tr.profile = prof;
      tr.t = prof.timeAtU(u0);
      const [u, v] = prof.at(tr.t);
      tr.u = u;
      tr.v = v;
      tr.waiting = true;
      tr.piece0 = startPiece;
      tr.age = 0;
      this.lastPlatform = k;
      this.stats.arrivals++;
      return tr;
    }
    return null;
  }

  private shuffled<T>(a: readonly T[]): T[] {
    const o = a.slice();
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [o[i], o[j]] = [o[j]!, o[i]!];
    }
    return o;
  }

  /** Put a stocked train in a siding (boot-time yard population / tests). */
  stable(siding: string, stableFor = 40): Train | null {
    const tr = this.freeSlot();
    if (!tr) return null;
    const pi = this.g.indexOfPath(siding);
    const edge = this.lastEdge.get(siding)!;
    if (this.il.edgeOwner[edge] !== -1) return null;
    void pi;
    // route from the buffer (u = 0 at the buffer end, outward-reversed) with the nose standing at u = 2.5 + L
    const route = this.stub(siding);
    this.il.edgeOwner[edge] = tr.id;
    this.activate(tr, 'stabled');
    tr.route = route;
    tr.routeName = `${siding}`;
    tr.orient = 1;
    tr.u = SIDING_U0;
    tr.v = 0;
    tr.profile = null;
    tr.stableT = 0;
    tr.stableFor = stableFor;
    tr.platform = null;
    return tr;
  }

  // -------------------------------------------------------------------------------------------- tickets
  trainOnPlatform(k: number): Train | null {
    return this.trains.find((x) => x.active && x.platform === k) ?? null;
  }
  requestTrain(k: number): boolean {
    for (const s of this.trains) if (s.reserved && s.platform !== k) s.reserved = false;
    const tr = this.trainOnPlatform(k);
    if (tr) {
      if (tr.kind === 'dwell') {
        tr.reserved = true;
        const keep = tr.nextRoute && tr.dwellT >= tr.dwell - DEPART_LEAD;
        if (!keep) tr.dwell = Math.max(tr.dwell, tr.dwellT + RESERVED_DWELL);
        else return true; // already committed to leave
        return true;
      }
      if (tr.kind === 'arrival' || tr.kind === 'shuntOut') {
        tr.reserved = true;
        tr.dwell = RESERVED_DWELL;
        // bring a distant train closer (invisible in the haze) so it arrives promptly
        if (tr.profile && tr.route) {
          const target = tr.route.length - REQUEST_SPAWN_DIST;
          if (tr.u < target) {
            tr.t = Math.max(tr.t, tr.profile.timeAtU(target));
          }
        }
        return true;
      }
      return false;
    }
    this.pendingRequest = k;
    this.pendingTries = 0;
    this.tryPending();
    return true;
  }
  private tryPending(): void {
    if (this.pendingRequest === null) return;
    const k = this.pendingRequest;
    if (this.platformBusy(k)) {
      this.pendingRequest = null;
      return;
    }
    // make room: if the pool / active cap blocks, recycle a far departing train
    let tr = this.spawnArrival(k, { spawnDist: REQUEST_SPAWN_DIST, dwell: RESERVED_DWELL, reserved: true, force: this.activeCount() < POOL });
    if (!tr) {
      const victim = this.trains.find((x) => x.active && x.kind === 'departure' && x.u > (x.route?.length ?? 0) * 0.5 && !this.visibleNear(x));
      if (victim) {
        this.deactivate(victim);
        tr = this.spawnArrival(k, { spawnDist: REQUEST_SPAWN_DIST, dwell: RESERVED_DWELL, reserved: true, force: true });
      }
    }
    if (tr) this.pendingRequest = null;
    else if (++this.pendingTries > 400) this.pendingRequest = null;
  }
  private visibleNear(x: Train): boolean {
    if (!x.route) return false;
    const p = x.route.outwardPose(x.u);
    return p.z < 900;
  }

  // -------------------------------------------------------------------------------------------- queries
  noseZ(tr: Train): number {
    if (!tr.route) return 0;
    const un = tr.orient > 0 ? tr.u : tr.u - TRAIN_L;
    return tr.route.outwardPose(un).z;
  }

  phaseOf(tr: Train): TPhase {
    if (tr.kind === 'dwell') return 'dwell';
    if (tr.kind === 'arrival' || tr.kind === 'shuntOut') return tr.profile && tr.t >= tr.profile.finalBrakeStart() ? 'brake' : 'cruiseIn';
    if (tr.kind === 'departure' || tr.kind === 'shuntIn') return tr.profile && tr.t < tr.profile.firstRampEnd() ? 'accel' : 'cruiseOut';
    return 'dwell';
  }

  // -------------------------------------------------------------------------------------------- update
  update(dt: number): void {
    this.time += dt;
    this.il.update(dt);
    for (const tr of this.trains) if (tr.active) this.step(tr, dt);
    this.tryPending();
    this.direct(dt);
  }

  private direct(dt: number): void {
    this.nextArrival -= dt;
    if (this.nextArrival > 0) return;
    // yard stock leaves for a platform now and then
    const stabled = this.trains.filter((x) => x.active && x.kind === 'stabled' && x.stableT >= x.stableFor);
    const free = this.freePlatforms().filter((k) => k !== this.lastPlatform);
    const pool = free.length > 0 ? free : this.freePlatforms();
    if (this.activeCount() >= MAX_ACTIVE || pool.length === 0) {
      this.nextArrival = 4;
      return;
    }
    const k = pool[Math.floor(this.rnd() * pool.length)]!;
    if (stabled.length > 0 && this.rnd() < 0.7) {
      const tr = stabled[0]!;
      const sid = tr.routeName;
      for (const kk of this.shuffled(pool)) {
        const route = this.shuntOutRoute(sid, kk);
        if (!route || !this.il.reserve(tr.id, route, 0)) continue;
        this.il.edgeOwner[this.lastEdge.get(sid)!] = tr.id;
        tr.platform = kk;
        tr.dwell = rand(this.rnd, 25, 40);
        tr.dwellT = 0;
        tr.cruise = rand(this.rnd, 21, 23.5);
        const lim = this.limits(route, tr.cruise);
        tr.route = route;
        tr.routeName = `${sid}>${TRACKS[kk]!.id}`;
        tr.kind = 'shuntOut';
        tr.orient = 1;
        tr.profile = buildProfile(SIDING_U0, 0, route.length, 0, tr.cruise, lim);
        tr.t = 0;
        tr.u = SIDING_U0;
        tr.v = 0;
        tr.waiting = true;
        tr.piece0 = 0;
        this.stats.shuntsOut++;
        this.hooks.onDepart?.(tr);
        this.nextArrival = rand(this.rnd, 8, 20);
        return;
      }
    }
    const t = this.spawnArrival(k);
    if (t) this.nextArrival = rand(this.rnd, 8, 20);
    else {
      this.stats.blockedArrivals++;
      this.nextArrival = 3;
    }
  }

  private step(tr: Train, dt: number): void {
    tr.age += dt;
    switch (tr.kind) {
      case 'arrival':
      case 'shuntOut': {
        this.advance(tr, dt);
        if (tr.profile && tr.t >= tr.profile.duration) {
          tr.kind = 'dwell';
          tr.dwellT = 0;
          tr.u = tr.route!.length;
          tr.v = 0;
          tr.age = 0;
          this.il.releaseExcept(tr.id, this.firstEdge[tr.platform!]!);
          this.il.edgeOwner[this.firstEdge[tr.platform!]!] = tr.id;
          tr.profile = null;
        } else if (tr.profile && !tr.voiceBraked && tr.t >= tr.profile.finalBrakeStart()) {
          tr.voiceBraked = true;
          this.hooks.onBrake?.(tr);
        }
        break;
      }
      case 'dwell': {
        tr.dwellT += dt;
        this.stepDwell(tr);
        break;
      }
      case 'departure':
      case 'shuntIn': {
        this.advance(tr, dt);
        if (tr.platform !== null && this.noseZ(tr) > 400) tr.platform = null;
        if (tr.kind === 'departure' && tr.u > 400 && this.hidden(tr)) {
          this.deactivate(tr);
          break;
        }
        if (tr.profile && tr.t >= tr.profile.duration) {
          if (tr.kind === 'departure') this.deactivate(tr);
          else {
            // park in the siding: hold only the siding edge
            const edge = tr.route!.pieces[tr.route!.pieces.length - 1]!.edge;
            this.il.releaseExcept(tr.id, edge);
            this.il.edgeOwner[edge] = tr.id;
            tr.kind = 'stabled';
            tr.stableT = 0;
            tr.stableFor = rand(this.rnd, 35, 75);
            tr.routeName = tr.routeName.split('>')[1] ?? tr.routeName;
            // convert to the shuntOut orientation: nose stands at u = 2.5 + L on the reversed siding route
            const sid = tr.routeName;
            tr.route = this.stub(sid);
            tr.orient = 1;
            tr.u = SIDING_U0;
            tr.v = 0;
            tr.profile = null;
          }
        }
        break;
      }
      case 'stabled':
        tr.stableT += dt;
        break;
    }
  }

  /** Both ends of the train are far enough away (fog) to remove it. */
  private hidden(tr: Train): boolean {
    if (!tr.route) return false;
    const a = tr.route.outwardPose(tr.u - TRAIN_L);
    return Math.hypot(a.x, a.z - 300) > 900;
  }

  private advance(tr: Train, dt: number): void {
    if (!tr.profile || !tr.route) return;
    if (tr.waiting) {
      if (!this.il.pointsReady(tr.route, tr.piece0)) {
        tr.v = 0;
        return;
      }
      tr.waiting = false;
    }
    tr.t += dt;
    const [u, v] = tr.profile.at(tr.t);
    tr.u = Math.min(u, tr.profile.uEnd + 400);
    tr.v = v;
    this.il.releaseBehind(tr.id, tr.u - TRAIN_L);
    void CLEAR_MARGIN;
  }

  private stepDwell(tr: Train): void {
    const k = tr.platform!;
    if (!tr.nextRoute && tr.dwellT >= tr.dwell - DEPART_LEAD) {
      // choose a destination and reserve the route; if blocked, extend the dwell and retry
      const toYard = this.stabledCount() < 2 && this.rnd() < 0.25;
      let found = false;
      const tryRoute = (route: RoutePath | null, name: string, kind: Kind): boolean => {
        if (!route) return false;
        const sp = route.pieceIndex(0);
        if (!this.il.reserve(tr.id, route, sp)) return false;
        this.il.edgeOwner[this.firstEdge[k]!] = tr.id;
        tr.nextRoute = route;
        tr.nextName = name;
        tr.nextKind = kind;
        return true;
      };
      if (toYard) {
        for (const sid of this.shuffled(SIDING_PATHS)) {
          if (this.il.edgeOwner[this.lastEdge.get(sid)!] !== -1) continue;
          if (tryRoute(this.shuntInRoute(k, sid), `${TRACKS[k]!.id}>${sid}`, 'shuntIn')) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        for (const far of this.shuffled(this.farIdx)) {
          if (tryRoute(this.departureRoute(k, far), `${TRACKS[k]!.id}>${far}`, 'departure')) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        tr.dwell = Math.max(tr.dwell, tr.dwellT + 3);
        if (!tr.held) this.stats.heldDepartures++;
        tr.held = true;
        return;
      }
    }
    if (tr.nextRoute && tr.dwellT >= tr.dwell && this.il.pointsReady(tr.nextRoute)) {
      const route = tr.nextRoute;
      tr.nextRoute = null;
      tr.held = false;
      const kind = tr.nextKind;
      tr.reserved = false;
      tr.cruise = rand(this.rnd, 21, 23.5);
      const uEnd = route.length;
      const lim = this.limits(route, tr.cruise);
      tr.route = route;
      tr.routeName = tr.nextName;
      tr.kind = kind;
      tr.orient = -1;
      tr.profile = buildProfile(DEP_U0, 0, uEnd, kind === 'departure' ? tr.cruise : 0, tr.cruise, lim);
      tr.t = 0;
      tr.u = DEP_U0;
      tr.v = 0;
      tr.waiting = false;
      tr.piece0 = 0;
      tr.age = 0;
      if (kind === 'departure') this.stats.departures++;
      else this.stats.shuntsIn++;
      this.hooks.onDepart?.(tr);
    }
  }

  /** Per-platform state for the platform systems (doors, edge light, signals). */
  trackStates(out: TrackStateOut[]): TrackStateOut[] {
    for (const st of out) {
      st.phase = null;
      st.t = st.dwell = st.nose = st.speed = 0;
      st.held = false;
      st.moving = null;
    }
    for (const tr of this.trains) {
      if (!tr.active || tr.platform === null) continue;
      const st = out[tr.platform];
      if (!st) continue;
      st.phase = this.phaseOf(tr);
      st.t = tr.kind === 'dwell' ? tr.dwellT : tr.profile ? Math.max(0, tr.t - (st.phase === 'brake' ? tr.profile.finalBrakeStart() : 0)) : 0;
      st.dwell = tr.dwell;
      st.nose = this.noseZ(tr);
      st.speed = tr.v;
      st.held = tr.held;
      st.moving = tr.kind === 'dwell' ? 'dwelling' : tr.kind === 'arrival' || tr.kind === 'shuntOut' ? 'arriving' : 'departing';
    }
    return out;
  }

  /** Test helper: world z where the dwelling train's nose is (should be RAIL.trainStopNoseZ). */
  static readonly stopZ = RAIL.trainStopNoseZ;
  static readonly cruiseSpeed = V_CRUISE;
}
