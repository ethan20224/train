import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import {
  LIFT_HEAD as LH, LIFTS, SKY, SPEED_GATES as SG, SPEED_GATE_CABINET_W as CAB_W, THRESHOLD, speedGateCabinets, speedGateLanes,
} from '../../layoutMetro';
import { excludeDirectionalLight } from '../../lighting/sunMask';
import { LIFT_KINEMATICS, liftCallButtonPos, liftDoorDir, lifts } from '../../metro/lifts';
import { GeoBag, boxMM, latheMeters, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import type { MetroMaterials } from './materials';
import { vertexGlow } from './glow';
import { installSharedVoidLight } from './voidLight';

/**
 * The Threshold fixtures (spec §2.7): the speed gates on the bridge and the machinery heads of the two glass lift tubes.
 * Speed gates: slim champagne-aluminium cabinets with a glass lid and a white light line; ultra-clear glass panels slide into the
 * cabinets (REAL seconds, ease) as the player comes within SPEED_GATES.approachR of a lane, and the light line brightens.
 * Lift heads: stainless-and-glass lanterns showing the sheave. Everything is built with the void material set (sun-excluded,
 * lit by the void ring light, shared with the escalators) and merged per material: 2 draw calls in all.
 */

const Y0 = THRESHOLD.y;
const TAU = Math.PI * 2;
const UP = v3(0, 1, 0);
const smooth = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

export interface ThresholdFixtures {
  group: THREE.Group;
  /** Per displayed frame (real time): panels and light lines follow the player. */
  update(dt: number, feet: { x: number; y: number; z: number }): void;
  stats: { calls: number; triangles: number };
}

export function buildThresholdFixtures(lib: MaterialLibrary, kit: MetroMaterials): ThresholdFixtures {
  const group = new THREE.Group();
  group.name = 'metroThresholdFixtures';

  // One satin-metal material (plain champagne anodised aluminium, metalness 1 / roughness 0.3: no brushed map, which reads as wood grain on
  // flat faces). Cabinets are white vertex colour (uniform); the lift heads get a cool tint to read as steel; light lines are vertex glow.
  const metalMat = kit.champagne.clone();
  metalMat.name = 'thresholdMetal'; metalMat.metalness = 1; metalMat.roughness = 0.3;
  vertexGlow(metalMat);
  installSharedVoidLight(metalMat, 'thresholdMetal'); excludeDirectionalLight(metalMat);
  const WHITE: [number, number, number] = [1, 1, 1];
  const STEEL: [number, number, number] = [0.5, 0.58, 0.8];

  const champagne = new GeoBag(lib, 'castIron', kit.metersPerTile.champagne);
  const stainless = new GeoBag(lib, 'castIron', kit.metersPerTile.stainless);
  const glassStatic = new GeoBag(lib, 'glass', 1);
  const glassPanels = new GeoBag(lib, 'glass', 1);

  const cabinets = speedGateCabinets();
  const lanes = speedGateLanes();
  const L = SG.cabinetLength, hw = SG.cabinetWidth / 2, H = SG.cabinetHeight;
  const gap = SG.plinthGap, plH = SG.plinthH;

  // ---- cabinets: slim blades, a 20 mm shadow-gap plinth, a flush ultra-clear glass strip in the top with the light line under it ------
  const body: P2[] = [
    [-hw, plH], [hw, plH], [hw, H - 0.006], [hw - 0.01, H], [0.055, H], [0.055, H - 0.016], [-0.055, H - 0.016], [-0.055, H], [-hw + 0.01, H], [-hw, H - 0.006],
  ];
  const stripGeos: THREE.BufferGeometry[] = [];
  const plinthGeos: THREE.BufferGeometry[] = [];
  for (const c of cabinets) {
    const fr = (x: number): Frame => ({ o: v3(x, Y0, c.z), a: v3(0, 0, 1), b: UP.clone() });
    champagne.add(sweep(body, [fr(c.x - L / 2), fr(c.x + L / 2)], { closed: true, caps: true }));
    plinthGeos.push(boxMM(c.x - L / 2 + gap, Y0, c.z - hw + gap, c.x + L / 2 - gap, Y0 + plH + 0.002, c.z + hw - gap)); // recessed 20 mm: the shadow gap
    glassStatic.add(boxMM(c.x - L / 2 + 0.1, Y0 + H - 0.016, c.z - 0.055, c.x + L / 2 - 0.1, Y0 + H, c.z + 0.055));
    const s = boxMM(c.x - L / 2 + 0.22, Y0 + H - 0.0145, c.z - 0.005, c.x + L / 2 - 0.22, Y0 + H - 0.0125, c.z + 0.005);
    stripGeos.push(s.index ? s.toNonIndexed() : s);
  }

  // ---- panels: 10 mm ultra-clear glass, 1.2 m; two per lane, staggered in x so both can park in the shared cabinet. Opening slides them
  // sideways and sinks them into the blade (top ends flush with the cabinet top), narrowing as they go in ----
  interface Panel { lane: number; sign: 1 | -1; start: number; z0: number; cabZ: number }
  const panels: Panel[] = [];
  const panelW = SG.laneWidth / 2 + 0.01;
  const pY0 = Y0 + 0.03;
  const sink = pY0 + SG.panelHeight - (Y0 + H) + 0.004;
  let nPanel = 0;
  for (const [li, lane] of lanes.entries()) {
    for (const sign of [-1, 1] as const) {
      const x = lane.x + sign * 0.03;
      const z0 = sign < 0 ? lane.z - SG.laneWidth / 2 : lane.z - 0.01;
      glassPanels.add(boxMM(x - SG.panelThickness / 2, pY0, z0, x + SG.panelThickness / 2, pY0 + SG.panelHeight, z0 + panelW));
      panels.push({ lane: li, sign, start: nPanel * 36, z0, cabZ: lane.z + sign * (SG.laneWidth / 2 + CAB_W / 2) });
      nPanel++;
    }
  }

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
  let liftLeafVertOffset = 0;

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

    // Bi-parting curved Threshold landing glass doors (added to glassPanels so they animate on CPU with 0 extra draw calls)
    for (const sign of [-1, 1] as const) {
      const a0 = sign < 0 ? da - DOOR_HALF + 0.004 : da + 0.004;
      const a1 = sign < 0 ? da - 0.004 : da + DOOR_HALF - 0.004;
      const leafG = arcTubeGlass(LIFTS.tubeR - 0.035, Y0 + 0.02, Y0 + DOOR_H - 0.02, a0, a1, 8);
      const count = leafG.getAttribute('position').count;
      glassPanels.add(leafG, M());
      liftDoorLeaves.push({ lift: li, sign, lx, lz, start: nPanel * 36 + liftLeafVertOffset, count });
      liftLeafVertOffset += count;
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
  const plinthG = tint(mergeGeometries(plinthGeos.map((g) => (g.index ? g.toNonIndexed() : g)), false)!, [0.22, 0.22, 0.22]);
  const champG = tint(champagne.merge()!, WHITE), steelG = tint(stainless.merge()!, STEEL);
  const stripG = mergeGeometries(stripGeos, false)!;
  const ringG = mergeGeometries(lights, false)!;
  const IDLE = 1.3, PEAK = 3.4;
  const setStrip = (i: number, v: number): void => {
    for (let k = 0; k < perStrip; k++) { const o = (stripOff + i * perStrip + k) * 3; col[o] = v; col[o + 1] = v * 0.98; col[o + 2] = v * 0.94; }
  };
  const perStrip = stripGeos[0]!.getAttribute('position').count;
  const stripOff = champG.getAttribute('position').count + steelG.getAttribute('position').count + plinthG.getAttribute('position').count;
  tint(stripG, [IDLE, IDLE, IDLE]); tint(ringG, [2.6, 2.0, 1.3]);
  const metalGeo = mergeGeometries([champG, steelG, plinthG, stripG, ringG], false)!;
  const colAttr = metalGeo.getAttribute('color') as THREE.BufferAttribute;
  const col = colAttr.array as Float32Array;
  const metalMesh = mk(metalGeo, metalMat, 'thresholdMetal');
  void metalMesh;
  for (let i = 0; i < cabinets.length; i++) setStrip(i, IDLE);

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
  const glassGeo = mergeGeometries([statG, panelG], false)!;
  const panelBase = statG.getAttribute('position').count; // panel vertices come last
  const pos = glassGeo.getAttribute('position') as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array);
  mk(glassGeo, kit.glass, 'thresholdGlass', 2);
  glassGeo.computeBoundingSphere();
  glassGeo.boundingSphere!.radius += SG.cabinetLength; // panels slide on the CPU: the bound stays valid

  // ---- runtime ------------------------------------------------------------------------------------------------------
  const phase = new Float32Array(lanes.length);   // 0 closed .. 1 open
  const glow = new Float32Array(lanes.length);    // 0 idle .. 1 brightest
  const wasNear = new Uint8Array(lanes.length);
  const cabAdj = cabinets.map((c) => lanes.map((l, li) => (l.side === c.side && (l.index === c.index || l.index === c.index - 1) ? li : -1)).filter((v) => v >= 0));
  const posDirty = (): void => { pos.needsUpdate = true; };

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
          const rot = lf.sign * open01 * DOOR_HALF * 0.96;
          const c = Math.cos(rot), s = Math.sin(rot);
          const v0 = panelBase + lf.start;
          for (let k = 0; k < lf.count; k++) {
            const bx = base[(v0 + k) * 3]! - lf.lx;
            const bz = base[(v0 + k) * 3 + 2]! - lf.lz;
            pos.setX(v0 + k, lf.lx + bx * c - bz * s);
            pos.setZ(v0 + k, lf.lz + bx * s + bz * c);
          }
        }
        doorsMoved = true;
      }
    }
    if (sheaveMoved) sheaveMesh.instanceMatrix.needsUpdate = true;
    return doorsMoved;
  };
  syncLiftMachinery();

  return {
    group,
    stats: {
      calls: 3,
      triangles: (metalGeo.getAttribute('position').count + glassGeo.getAttribute('position').count + sheaveInstGeo.getAttribute('position').count * LIFTS.positions.length) / 3,
    },
    update(dt: number, feet: { x: number; y: number; z: number }): void {
      const onLevel = Math.abs(feet.y - Y0) < 1.6;
      let panelsMoved = false, lightsMoved = false;
      for (let i = 0; i < lanes.length; i++) {
        const l = lanes[i]!;
        const d = Math.hypot(feet.x - l.x, feet.z - l.z);
        const near = onLevel && d < (wasNear[i] ? SG.approachR + 0.35 : SG.approachR); // a little hysteresis, it closes behind you
        wasNear[i] = near ? 1 : 0;
        const tgt = near ? 1 : 0;
        if (phase[i] !== tgt) {
          const dir = Math.sign(tgt - phase[i]!);
          let p = phase[i]! + dir * (dt / SG.panelSeconds); // REAL seconds
          if ((dir > 0 && p >= 1) || (dir < 0 && p <= 0)) p = tgt;
          phase[i] = p;
          panelsMoved = true;
        }
        const gt = onLevel ? 1 - smooth((d - SG.approachR) / (SG.glowR - SG.approachR)) : 0;
        if (Math.abs(glow[i]! - gt) > 1e-3) { glow[i] = glow[i]! + (gt - glow[i]!) * Math.min(1, dt * 8); lightsMoved = true; }
      }
      if (panelsMoved) {
        for (let pi = 0; pi < panels.length; pi++) {
          const p = panels[pi]!;
          const s = smooth(phase[p.lane]!);
          const v0 = panelBase + p.start;
          for (let k = 0; k < 36; k++) {
            const z = base[(v0 + k) * 3 + 2]!, t = (z - p.z0) / panelW;
            const zOpen = p.cabZ + (t - 0.5) * 0.09; // narrows to fit inside the 0.18 blade
            pos.setZ(v0 + k, z + (zOpen - z) * s);
            pos.setY(v0 + k, base[(v0 + k) * 3 + 1]! - sink * s);
          }
        }
      }
      if (syncLiftMachinery() || panelsMoved) posDirty();
      if (lightsMoved) {
        for (let ci = 0; ci < cabinets.length; ci++) {
          let g = 0;
          for (const li of cabAdj[ci]!) if (glow[li]! > g) g = glow[li]!;
          setStrip(ci, IDLE + (PEAK - IDLE) * g);
        }
        colAttr.clearUpdateRanges();
        colAttr.addUpdateRange(stripOff * 3, cabinets.length * perStrip * 3);
        colAttr.needsUpdate = true;
      }
    },
  };
}
