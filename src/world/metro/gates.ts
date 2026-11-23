import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { LIFT_HEAD as LH, LIFTS, SKY, SPEED_GATES as SG, THRESHOLD, speedGateLanes } from '../../layoutMetro';
import { excludeDirectionalLight } from '../../lighting/sunMask';
import { LIFT_KINEMATICS, liftCallButtonPos, liftDoorDir, lifts } from '../../metro/lifts';
import { GeoBag, boxMM, latheMeters, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import { LED, buildFareGeometry, type GlassSink } from './fareLine';
import type { MetroMaterials } from './materials';
import { vertexGlow } from './glow';
import { buildTicketHall } from './ticketHall';
import { installSharedVoidLight } from './voidLight';

/**
 * The Threshold fixtures (spec §2.7): the fare line (speed gates, glass barriers, lift lobby, funicular gates: layout in layoutMetro.ts,
 * geometry in fareLine.ts), the ticket-hall dressing (ticketHall.ts) and the machinery heads of the two glass lift tubes.
 * Speed gates: satin stainless cabinets; ultra-clear glass leaves swing flat against the cabinets (REAL seconds, ease) when a lane
 * opens on approach (or by look-ahead along the player's motion), and the LED line along each cabinet edge brightens.
 * Lift heads: stainless-and-glass lanterns showing the sheave. Everything is built with the void material set (sun-excluded,
 * lit by the void ring light, shared with the escalators) and merged per material: 4 draw calls here (lift-head metal, fare stainless,
 * glass, sheaves) plus 2 for the ticket-hall signage.
 */

const Y0 = THRESHOLD.y;
const TAU = Math.PI * 2;
const UP = v3(0, 1, 0);
const smooth = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

export interface ThresholdFixtures {
  group: THREE.Group;
  /** Per displayed frame (real time): leaves and light lines follow the player. */
  update(dt: number, feet: { x: number; y: number; z: number }): void;
  stats: { calls: number; triangles: number };
}

export interface ThresholdFixturesOptions {
  /** Fired once whenever a speed-gate lane switches between closed and open. */
  onSpeedGate?: (x: number, y: number, z: number, open: boolean) => void;
  /** Anisotropy for the signage textures (default 8). */
  anisotropy?: number;
}

export function buildThresholdFixtures(
  lib: MaterialLibrary,
  kit: MetroMaterials,
  options: ThresholdFixturesOptions = {},
): ThresholdFixtures {
  const group = new THREE.Group();
  group.name = 'metroThresholdFixtures';

  // Lift heads: one satin-metal material (plain champagne anodised aluminium, metalness 1 / roughness 0.3: no brushed map, which reads as wood
  // grain on flat faces); cool-tinted vertex colour for steel, HDR vertex colour for the light parts.
  const metalMat = kit.champagne.clone();
  metalMat.name = 'thresholdMetal'; metalMat.metalness = 1; metalMat.roughness = 0.3;
  vertexGlow(metalMat);
  installSharedVoidLight(metalMat, 'thresholdMetal'); excludeDirectionalLight(metalMat);
  // Fare line: plain satin stainless (the brushed map is dropped: it reads as wood grain on large faces), cabinet tint in the vertex colour.
  const fareMat = kit.stainless.clone();
  fareMat.name = 'thresholdFareStainless'; fareMat.color.set(0xd8d2c8); // warm-neutral satin stainless, no blue
  fareMat.roughnessMap = null; fareMat.metalness = 1; fareMat.roughness = 0.22;
  vertexGlow(fareMat);
  installSharedVoidLight(fareMat, 'thresholdFareStainless'); excludeDirectionalLight(fareMat);
  const STEEL: [number, number, number] = [0.5, 0.58, 0.8];

  const stainless = new GeoBag(lib, 'castIron', kit.metersPerTile.stainless);
  const glassStatic = new GeoBag(lib, 'glass', 1);
  const glassPanels = new GeoBag(lib, 'glass', 1);
  /** Animated glass stream: every leaf reports the REAL vertex range it takes, so the animation can never drift off its geometry. */
  let leafCursor = 0;
  const glassSink: GlassSink = {
    addStatic: (g) => { glassStatic.add(g); },
    addLeaf: (g) => {
      glassPanels.add(g);
      const count = g.index ? g.index.count : g.getAttribute('position').count;
      const r = { start: leafCursor, count };
      leafCursor += count;
      return r;
    },
  };

  // ---- fare line (cabinets, posts, rails, fixed glass, leaves) and the ticket-hall dressing ----------------------------------------
  const hall = buildTicketHall(options.anisotropy ?? 8);
  const fare = buildFareGeometry(glassSink, hall.metalParts);
  group.add(hall.group);
  const lanes = speedGateLanes();
  const leavesByLane: typeof fare.leaves[] = lanes.map(() => []);
  for (const lf of fare.leaves) leavesByLane[lf.lane]!.push(lf);

  // ---- lift heads (doorways cut open toward sky hole, Threshold deck sleeves, call buttons, turning sheaves) ----
  const lights: THREE.BufferGeometry[] = [];
  const DOOR_H = 2.45;
  const DOOR_HALF = LIFT_KINEMATICS.doorHalfAngle;
  const tubeBottom = Y0;
  /** Band section centred on its path: a = radial, b = up. */
  const ringSection = (_a: number, w: number, h: number, c: number): P2[] => [[-w / 2, 0], [w / 2, 0], [w / 2, h - c], [w / 2 - c, h], [-w / 2 + c, h], [-w / 2, h - c]];
  const arcFrames = (r: number, y: number, a0: number, a1: number, n: number): Frame[] => Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    const radial = v3(Math.cos(t), 0, Math.sin(t));
    return { o: v3(r * radial.x, y, r * radial.z), a: radial, b: UP.clone() };
  });
  const arcTubeGlass = (r: number, y0: number, y1: number, a0: number, a1: number, segs: number): THREE.BufferGeometry => {
    const p: number[] = [];
    for (let i = 0; i < segs; i++) {
      const p0 = a0 + ((a1 - a0) * i) / segs;
      const p1 = a0 + ((a1 - a0) * (i + 1)) / segs;
      const x0 = r * Math.cos(p0), z0 = r * Math.sin(p0);
      const x1 = r * Math.cos(p1), z1 = r * Math.sin(p1);
      p.push(x0, y0, z0, x0, y1, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x1, y0, z1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    return g;
  };
  const sheaveProf: P2[] = [[0, -0.085], [0.09, -0.085], [0.09, -0.05], [0.44, -0.07], [LH.sheaveR, -0.06], [LH.sheaveR - 0.04, -0.015], [LH.sheaveR - 0.04, 0.015], [LH.sheaveR, 0.06], [0.44, 0.07], [0.09, 0.05], [0.09, 0.085], [0, 0.085]];
  const sheaveBody = latheMeters(sheaveProf, 48, 1, 1);
  // 6 machined radial ribs on the sheave web so rotation is unmistakably readable through the lantern glass
  const sheaveParts: THREE.BufferGeometry[] = [sheaveBody];
  for (let k = 0; k < 6; k++) {
    const rib = new THREE.BoxGeometry(0.032, 0.125, 0.34);
    rib.translate(0, 0, 0.26);
    rib.rotateY((k / 6) * TAU);
    sheaveParts.push(rib);
  }
  const sheaveBag = new GeoBag(lib, 'castIron', kit.metersPerTile.stainless);
  for (const sp of sheaveParts) { sp.rotateZ(Math.PI / 2); sheaveBag.add(sp); }
  const sheaveInstGeo = sheaveBag.merge()!;

  const hubGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12);
  const roofProf: P2[] = [[0, 0], [1.38, 0], [1.46, 0.02], [1.46, 0.06], [1.34, 0.1], [0.5, 0.14], [0, 0.15]];
  const roofGeo = latheMeters(roofProf, 64, 1, 1);
  const deckProf: P2[] = [[0, 0], [1.38, 0], [1.42, 0.03], [1.42, LH.deckT - 0.03], [1.38, LH.deckT], [0, LH.deckT]];
  const deckGeo = latheMeters(deckProf, 64, 1, 1);
  const collarProf: P2[] = [[0, 0], [LH.collarR - LIFTS.tubeR, 0], [LH.collarR - LIFTS.tubeR, 0.1], [LH.collarR - LIFTS.tubeR - 0.05, LH.collarH], [0, LH.collarH]];
  const motorGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.42, 20);
  const tubeH = LH.tubeTopY - tubeBottom;
  const lanternY0 = LH.tubeTopY + LH.deckT, lanternY1 = LIFTS.headY - 0.15;
  const sideLen = 2 * LH.lanternR * Math.sin(Math.PI / LH.lanternSides);
  const axleY = (lanternY0 + lanternY1) / 2 + 0.02;

  // Threshold curved landing glass door leaves (2 lifts x 2 bi-parting leaves, animated inside thresholdGlass — 0 extra draw calls)
  interface LiftDoorLeaf { lift: number; sign: 1 | -1; lx: number; lz: number; start: number; count: number }
  const liftDoorLeaves: LiftDoorLeaf[] = [];

  for (let li = 0; li < LIFTS.positions.length; li++) {
    const [lx, lz] = LIFTS.positions[li]!;
    const da = liftDoorDir(li, 0).angle;
    const M = (x = 0, y = 0, z = 0): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(lx + x, y, lz + z);
    // Floor collar cut open across the doorway so entry is flush
    stainless.add(sweep(collarProf, arcFrames(LIFTS.tubeR, Y0, da + DOOR_HALF, da + TAU - DOOR_HALF, 44), { closed: true, caps: true }), M());
    // Brushed-stainless circular shaft liner through the 2 m Threshold deck thickness (-32 .. -30)
    const deckSleeve = new THREE.CylinderGeometry(LIFTS.tubeR + 0.01, LIFTS.tubeR + 0.01, Y0 - SKY.y, 48, 1, true);
    deckSleeve.scale(-1, 1, 1); // inward-facing cylinder lining the bore
    stainless.add(deckSleeve, M(0, (Y0 + SKY.y) / 2));
    // Glass tube: lower section open across doorway (da ± DOOR_HALF), upper section full 360
    glassStatic.add(arcTubeGlass(LIFTS.tubeR, Y0, Y0 + DOOR_H, da + DOOR_HALF, da + TAU - DOOR_HALF, 40), M());
    glassStatic.add(arcTubeGlass(LIFTS.tubeR, Y0 + DOOR_H, LH.tubeTopY, 0, TAU, 48), M());
    // Doorway stainless transom header & flanking jambs
    stainless.add(sweep(ringSection(0, 0.055, 0.065, 0.008), arcFrames(LIFTS.tubeR + 0.015, Y0 + DOOR_H, da - DOOR_HALF - 0.03, da + DOOR_HALF + 0.03, 12), { closed: true, caps: true }), M());
    for (const edgeA of [da - DOOR_HALF - 0.012, da + DOOR_HALF + 0.012]) {
      stainless.add(new THREE.CylinderGeometry(0.028, 0.028, DOOR_H, 8), M((LIFTS.tubeR + 0.018) * Math.cos(edgeA), Y0 + DOOR_H / 2, (LIFTS.tubeR + 0.018) * Math.sin(edgeA)));
    }
    // Exterior call-button housing + backlit warm indicator disc at exact liftCallButtonPos(li, 0)
    const bp = liftCallButtonPos(li, 0);
    const bAng = Math.atan2(bp.nz, bp.nx);
    const housing = boxMM(-0.03, -0.10, -0.05, 0.03, 0.10, 0.05);
    housing.rotateY(-bAng);
    housing.translate(bp.x - bp.nx * 0.02, bp.y, bp.z - bp.nz * 0.02);
    stainless.add(housing);
    const led = new THREE.CylinderGeometry(0.026, 0.026, 0.014, 16);
    led.rotateZ(Math.PI / 2);
    led.rotateY(-bAng);
    led.translate(bp.x + bp.nx * 0.014, bp.y, bp.z + bp.nz * 0.014);
    lights.push(led.toNonIndexed());

    // Bi-parting curved Threshold landing glass doors (added to the animated glass stream so they move on the CPU with 0 extra draw calls)
    for (const sign of [-1, 1] as const) {
      const a0 = sign < 0 ? da - DOOR_HALF + 0.004 : da + 0.004;
      const a1 = sign < 0 ? da - 0.004 : da + DOOR_HALF - 0.004;
      const leafG = arcTubeGlass(LIFTS.tubeR - 0.035, Y0 + 0.02, Y0 + DOOR_H - 0.02, a0, a1, 8);
      leafG.applyMatrix4(M());
      const r = glassSink.addLeaf(leafG);
      liftDoorLeaves.push({ lift: li, sign, lx, lz, start: r.start, count: r.count });
    }

    // 3 symmetrical guide posts outside doorway (da + 60, +180, +300 deg) so no post blocks entry
    for (let i = 0; i < LH.posts; i++) {
      const t = da + Math.PI / 3 + (i / LH.posts) * TAU;
      stainless.add(new THREE.CylinderGeometry(LH.postR, LH.postR, tubeH, 8), M((LIFTS.tubeR + LH.postR) * Math.cos(t), tubeBottom + tubeH / 2, (LIFTS.tubeR + LH.postR) * Math.sin(t)));
    }
    for (let y = Y0 + 0.7; y < LH.tubeTopY - 0.3; y += LH.bandEvery) {
      const openDoor = y <= Y0 + DOOR_H + 0.05;
      stainless.add(
        sweep(ringSection(0, 0.028, 0.03, 0.008), arcFrames(LIFTS.tubeR + 0.015, y, openDoor ? da + DOOR_HALF : 0, openDoor ? da + TAU - DOOR_HALF : TAU, openDoor ? 44 : 64), { closed: true, caps: openDoor }),
        M(),
      );
    }
    // head: deck plate, then the lantern (8 stainless corner posts, glass between, top and bottom rails), roof
    stainless.add(deckGeo, M(0, LH.tubeTopY));
    for (let i = 0; i < LH.lanternSides; i++) {
      const t = ((i + 0.5) / LH.lanternSides) * TAU, t2 = ((i + 1.5) / LH.lanternSides) * TAU;
      const p1 = v3(LH.lanternR * Math.cos(t), 0, LH.lanternR * Math.sin(t)), p2 = v3(LH.lanternR * Math.cos(t2), 0, LH.lanternR * Math.sin(t2));
      stainless.add(new THREE.BoxGeometry(0.05, lanternY1 - lanternY0, 0.05), M(p1.x, (lanternY0 + lanternY1) / 2, p1.z));
      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      const yaw = Math.atan2(p2.x - p1.x, p2.z - p1.z); // box long axis along z, rotate to the edge direction
      const orient = (y: number): THREE.Matrix4 => M(mid.x, y, mid.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
      stainless.add(new THREE.BoxGeometry(0.045, 0.05, sideLen), orient(lanternY0 + 0.025));
      stainless.add(new THREE.BoxGeometry(0.045, 0.05, sideLen), orient(lanternY1 - 0.025));
      glassStatic.add(new THREE.BoxGeometry(0.01, lanternY1 - lanternY0 - 0.1, sideLen - 0.06), orient((lanternY0 + lanternY1) / 2));
    }
    stainless.add(roofGeo, M(0, lanternY1));
    // stationary machinery inside: horizontal axle, bearing pedestals, motor (the sheave itself rotates via InstancedMesh below)
    stainless.add(hubGeo.clone().rotateZ(Math.PI / 2), M(0, axleY, 0));
    for (const sx of [-0.4, 0.4]) stainless.add(new THREE.BoxGeometry(0.05, axleY - lanternY0 + 0.05, 0.16), M(sx, (lanternY0 + axleY) / 2 - 0.0, 0));
    stainless.add(motorGeo.clone().rotateZ(Math.PI / 2), M(-0.75, lanternY0 + 0.2, 0));
    stainless.add(new THREE.BoxGeometry(0.2, 0.3, 0.3), M(-0.45, lanternY0 + 0.15, 0));
    // warm ring light under the roof, seen through the glass
    const ring = new THREE.RingGeometry(1.0, 1.045, 64);
    ring.rotateX(Math.PI / 2); // faces down
    ring.translate(lx, lanternY1 - 0.004, lz);
    lights.push(ring.toNonIndexed());
  }

  // ---- meshes -------------------------------------------------------------------------------------------------------
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, order = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.renderOrder = order; m.userData.noShadow = true;
    group.add(m);
    return m;
  };
  const tint = (g: THREE.BufferGeometry, rgb: [number, number, number]): THREE.BufferGeometry => {
    const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const steelG = tint(stainless.merge()!, STEEL);
  const ringG = mergeGeometries(lights, false)!;
  tint(ringG, [2.6, 2.0, 1.3]);
  const metalGeo = mergeGeometries([steelG, ringG], false)!;
  mk(metalGeo, metalMat, 'thresholdMetal');

  // the fare line's own stainless mesh (cabinets, posts, rails, leaf edges, LED lines); the two animated blocks are contiguous at its end
  const fareGeo = fare.geo;
  fareGeo.computeBoundingSphere();
  mk(fareGeo, fareMat, 'thresholdFareLine');
  const farePos = fareGeo.getAttribute('position') as THREE.BufferAttribute;
  const fareNor = fareGeo.getAttribute('normal') as THREE.BufferAttribute;
  const fareCol = fareGeo.getAttribute('color') as THREE.BufferAttribute;
  const faceBasePos = (farePos.array as Float32Array).slice(fare.edgeFrom * 3, fare.edgeTo * 3);
  const faceBaseNor = (fareNor.array as Float32Array).slice(fare.edgeFrom * 3, fare.edgeTo * 3);
  const colArr = fareCol.array as Float32Array;

  // Rotating sheaves inside the two lift machinery heads (reuses metalMat: +1 void call)
  const sheaveMesh = new THREE.InstancedMesh(tint(sheaveInstGeo, [0.78, 0.84, 0.96]), metalMat, LIFTS.positions.length);
  sheaveMesh.name = 'liftHeadSheaves';
  sheaveMesh.userData.noShadow = true;
  sheaveMesh.frustumCulled = false;
  group.add(sheaveMesh);
  const _shM = new THREE.Matrix4();
  const _shR = new THREE.Matrix4();
  const _shT = new THREE.Matrix4();
  const prevLiftY = new Float32Array(LIFTS.positions.length).fill(NaN);
  const prevDoorOpen = new Float32Array(LIFTS.positions.length).fill(-1);

  const statG = glassStatic.merge()!;
  const panelG = glassPanels.merge()!;
  if (panelG.getAttribute('position').count !== leafCursor) throw new Error('gates: animated glass vertex count does not match the leaf bookkeeping');
  const glassGeo = mergeGeometries([statG, panelG], false)!;
  const panelBase = statG.getAttribute('position').count; // animated-leaf vertices come last
  const pos = glassGeo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = glassGeo.getAttribute('normal') as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array);
  const baseN = Float32Array.from(nrm.array);
  mk(glassGeo, kit.glass, 'thresholdGlass', 2);
  glassGeo.computeBoundingSphere();
  glassGeo.boundingSphere!.radius += 1; // leaves swing on the CPU: the bound stays valid

  // ---- runtime ------------------------------------------------------------------------------------------------------
  const phase = new Float32Array(lanes.length);   // 0 closed .. 1 open
  const glow = new Float32Array(lanes.length);    // 0 idle .. 1 brightest
  const wasNear = new Uint8Array(lanes.length);
  let prevX = 0, prevZ = 0, hasPrev = false;

  /** Rotates a leaf's vertices (glass or edge) about its vertical hinge axis by phi, positions and normals together. */
  const swing = (
    p: THREE.BufferAttribute, n: THREE.BufferAttribute, bp: Float32Array, bn: Float32Array, bOff: number, v0: number, count: number,
    hx: number, hz: number, phi: number,
  ): void => {
    const c = Math.cos(phi), s = Math.sin(phi);
    for (let k = 0; k < count; k++) {
      const j = (v0 - bOff + k) * 3;
      const bx = bp[j]! - hx, bz = bp[j + 2]! - hz;
      p.setX(v0 + k, hx + bx * c + bz * s);
      p.setZ(v0 + k, hz - bx * s + bz * c);
      const nx = bn[j]!, nz = bn[j + 2]!;
      n.setX(v0 + k, nx * c + nz * s);
      n.setZ(v0 + k, -nx * s + nz * c);
    }
  };

  const syncLiftMachinery = (): boolean => {
    let sheaveMoved = false;
    let doorsMoved = false;
    for (let li = 0; li < LIFTS.positions.length; li++) {
      const snap = lifts.cabin(li);
      if (snap.y !== prevLiftY[li]) {
        prevLiftY[li] = snap.y;
        const [lx, lz] = LIFTS.positions[li]!;
        _shT.makeTranslation(lx, axleY, lz);
        _shR.makeRotationX(snap.y / LH.sheaveR);
        _shM.multiplyMatrices(_shT, _shR);
        sheaveMesh.setMatrixAt(li, _shM);
        sheaveMoved = true;
      }
      const open01 = lifts.landingDoorOpen01(li, 0);
      if (open01 !== prevDoorOpen[li]) {
        prevDoorOpen[li] = open01;
        for (let di = 0; di < liftDoorLeaves.length; di++) {
          const lf = liftDoorLeaves[di]!;
          if (lf.lift !== li) continue;
          // swing(): rotation by -rot about the lift axis (same convention as before: x' = x c - z s)
          swing(pos, nrm, base, baseN, 0, panelBase + lf.start, lf.count, lf.lx, lf.lz, -lf.sign * open01 * DOOR_HALF * 0.96);
        }
        doorsMoved = true;
      }
    }
    if (sheaveMoved) sheaveMesh.instanceMatrix.needsUpdate = true;
    return doorsMoved;
  };
  syncLiftMachinery();

  const chevSet = (i: number, v: number): void => {
    // closed: dark graphite inlay (below the glow threshold); open: soft white emitter
    const g = v > 0.45 ? LED.chevron * v : 0.03;
    for (let k = 0; k < fare.chevVerts; k++) { const q = (fare.chevStart[i]! + k) * 3; colArr[q] = g; colArr[q + 1] = g * 0.99; colArr[q + 2] = g * 0.96; }
  };
  lanes.forEach((_, i) => chevSet(i, 0));
  const ledTri = (o: number, v: number): void => { for (let k = 0; k < fare.ledVerts; k++) { const q = (o + k) * 3; colArr[q] = v; colArr[q + 1] = v * 0.98; colArr[q + 2] = v * 0.94; } };

  return {
    group,
    stats: {
      calls: 4 + hall.stats.calls,
      triangles: (metalGeo.getAttribute('position').count + fareGeo.getAttribute('position').count + glassGeo.getAttribute('position').count + sheaveInstGeo.getAttribute('position').count * LIFTS.positions.length) / 3 + hall.stats.triangles,
    },
    update(dt: number, feet: { x: number; y: number; z: number }): void {
      const onLevel = Math.abs(feet.y - Y0) < 1.6;
      // player velocity for the look-ahead (ignored across teleports and on the first frame)
      let vx = 0, vz = 0;
      if (hasPrev && dt > 1e-4) {
        vx = (feet.x - prevX) / dt; vz = (feet.z - prevZ) / dt;
        if (Math.hypot(vx, vz) > 14) { vx = 0; vz = 0; }
      }
      prevX = feet.x; prevZ = feet.z; hasPrev = true;
      const ax = feet.x + vx * SG.lookAheadSec, az = feet.z + vz * SG.lookAheadSec;
      const sx = ax - feet.x, sz = az - feet.z, sl2 = sx * sx + sz * sz;
      let leavesMoved = false, lightsMoved = false, chevMoved = false;
      for (let i = 0; i < lanes.length; i++) {
        const l = lanes[i]!;
        const d = Math.hypot(feet.x - l.x, feet.z - l.z);
        // distance from the lane centre to the player's path over the next lookAheadSec (segment feet -> ahead)
        let dPath = d;
        if (sl2 > 1e-4) {
          const t = Math.min(1, Math.max(0, ((l.x - feet.x) * sx + (l.z - feet.z) * sz) / sl2));
          dPath = Math.hypot(feet.x + sx * t - l.x, feet.z + sz * t - l.z);
        }
        const near = onLevel && dPath < (wasNear[i] ? SG.approachR + SG.closeExtra : SG.approachR); // hysteresis: it closes behind you
        const prevNear = wasNear[i]!;
        wasNear[i] = near ? 1 : 0;
        if ((near ? 1 : 0) !== prevNear) options.onSpeedGate?.(l.x, Y0 + 0.9, l.z, near);
        const tgt = near ? 1 : 0;
        if (phase[i] !== tgt) {
          const dir = Math.sign(tgt - phase[i]!);
          let p = phase[i]! + dir * (dt / SG.panelSeconds); // REAL seconds
          if ((dir > 0 && p >= 1) || (dir < 0 && p <= 0)) p = tgt;
          phase[i] = p;
          const e = smooth(p);
          for (const lf of leavesByLane[i]!) {
            swing(pos, nrm, base, baseN, 0, panelBase + lf.glassStart, lf.glassCount, lf.hingeX, lf.hingeZ, lf.phiOpen * e);
            swing(farePos, fareNor, faceBasePos, faceBaseNor, fare.edgeFrom, lf.edgeStart, lf.edgeCount, lf.hingeX, lf.hingeZ, lf.phiOpen * e);
          }
          chevSet(i, e); chevMoved = true;
          leavesMoved = true;
        }
        const gt = onLevel ? 1 - smooth((d - SG.approachR) / (SG.glowR - SG.approachR)) : 0;
        if (Math.abs(glow[i]! - gt) > 1e-3) {
          glow[i] = glow[i]! + (gt - glow[i]!) * Math.min(1, dt * 8);
          const v = LED.idle + (LED.peak - LED.idle) * glow[i]!;
          ledTri(fare.ledStart[i]!, v); ledTri(fare.ledStart[i]! + fare.ledVerts, v);
          lightsMoved = true;
        }
      }
      if (syncLiftMachinery() || leavesMoved) { pos.needsUpdate = true; nrm.needsUpdate = true; }
      if (leavesMoved) {
        for (const a of [farePos, fareNor]) { a.clearUpdateRanges(); a.addUpdateRange(fare.edgeFrom * 3, (fare.edgeTo - fare.edgeFrom) * 3); a.needsUpdate = true; }
      }
      if (lightsMoved || chevMoved) {
        fareCol.clearUpdateRanges();
        fareCol.addUpdateRange(fare.ledFrom * 3, (fare.ledTo - fare.ledFrom) * 3);
        fareCol.needsUpdate = true;
      }
    },
  };
}
