import * as THREE from 'three';
import type { BuildContext, FrameInfo, WorldModule } from '../core/types';
import { tickets } from '../core/ticket';
import { GATES, gateLaneCentersX } from '../layout';
import { finish, instanced, mesh, tinted } from './shed/common';
import { buildGateParts, SIGN } from './gates/static';
import { PADDLE_LEN, PADDLE_Y, paddleGeometry } from './gates/paddles';
import { makeSignAtlas } from './gates/sign';

const SWING_S = 0.35;
const HOLD_S = 1.0;
const APPROACH_Z = 2.2;

interface Lane {
  x: number;
  /** linear 0 (closed) .. 1 (open) */
  o: number;
  hold: number;
  open: boolean;
  /** 0 dim, 1 red, 2 green */
  mode: number;
  pos: THREE.Vector3;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/** Ticket barrier gates: 3 banks x 7 lanes of 1930s brass-and-marble cabinets with glass paddles, glass screens, overhead signs. */
export async function buildGates(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'gates';
  const parts = buildGateParts();
  const brassMat = ctx.materials.get('brass');
  const dark = tinted(ctx, 'darkMarble', 0xffffff, { roughness: 0.3 });
  const wood = tinted(ctx, 'wood', 0x9a6a4a, { roughness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ name: 'gateEnamel', color: 0x060606, roughness: 0.16, metalness: 0.35 });
  const glass = ctx.materials.get('glass').clone();
  glass.name = 'gateGlass';
  glass.side = THREE.DoubleSide;
  glass.color.set(0xeaf2ee);
  glass.opacity = 0.2;

  root.add(mesh(finish(ctx, parts.dark, 'darkMarble'), dark, true));
  root.add(mesh(finish(ctx, parts.wood, 'wood'), wood, true));
  root.add(mesh(finish(ctx, parts.brass, 'brass'), brassMat, true));
  root.add(mesh(finish(ctx, parts.black, 'darkMarble'), black, true));
  const glassMesh = mesh(finish(ctx, parts.glass, 'glass'), glass, false);
  glassMesh.renderOrder = 2;
  root.add(glassMesh);

  // Sign faces (gilt lettering on black glass), one plane per face.
  const atlas = makeSignAtlas(ctx.renderer);
  const faceMat = new THREE.MeshStandardMaterial({
    name: 'gateSignFace',
    map: atlas,
    emissiveMap: atlas,
    emissive: new THREE.Color(0.55, 0.5, 0.42),
    roughness: 0.3,
    metalness: 0.2,
  });
  const faces: THREE.BufferGeometry[] = [];
  GATES.bankCentersX.forEach((bx, r) => {
    for (const back of [false, true]) {
      const g = new THREE.PlaneGeometry(SIGN.w - 0.08, SIGN.h - 0.06);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (r + 1 - uv.getY(i)) / 3 + 0.0 * 1);
      if (!back) g.rotateY(Math.PI);
      g.translate(bx, SIGN.y0 + SIGN.h / 2, GATES.lineZ + (back ? 1 : -1) * (SIGN.depth / 2 + 0.002));
      faces.push(g);
    }
  });
  const faceGeo = new THREE.BufferGeometry();
  {
    const merged = faces.map((f) => f.toNonIndexed());
    const total = merged.reduce((a, g) => a + g.getAttribute('position').count, 0);
    const P = new Float32Array(total * 3);
    const N = new Float32Array(total * 3);
    const U = new Float32Array(total * 2);
    let o = 0;
    for (const g of merged) {
      P.set(g.getAttribute('position').array as Float32Array, o * 3);
      N.set(g.getAttribute('normal').array as Float32Array, o * 3);
      U.set(g.getAttribute('uv').array as Float32Array, o * 2);
      o += g.getAttribute('position').count;
    }
    faceGeo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    faceGeo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    faceGeo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  }
  root.add(mesh(faceGeo, faceMat, false));

  // Lamps (HDR instance colours on an unlit material).
  const lampMat = new THREE.MeshBasicMaterial({ name: 'gateLamp', color: 0xffffff });
  const lampGeo = new THREE.SphereGeometry(0.026, 10, 8);
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, parts.lamps.length);
  const mx = new THREE.Matrix4();
  parts.lamps.forEach((p, i) => lampMesh.setMatrixAt(i, mx.makeTranslation(p.x, p.y, p.z)));
  const dim = new THREE.Color(0.5, 0.24, 0.05).multiplyScalar(0.35);
  for (let i = 0; i < parts.lamps.length; i++) lampMesh.setColorAt(i, dim);
  lampMesh.instanceMatrix.needsUpdate = true;
  lampMesh.frustumCulled = false;
  lampMesh.matrixAutoUpdate = false;
  root.add(lampMesh);

  // Paddles: 4 instanced meshes (frame L/R brass, glass L/R)
  const L = paddleGeometry(1);
  const R = paddleGeometry(-1);
  const laneXs = gateLaneCentersX();
  const n = laneXs.length;
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cast: boolean): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.castShadow = cast;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    return m;
  };
  const frameL = mk(L.frame, brassMat, true);
  const frameR = mk(R.frame, brassMat, true);
  const glassL = mk(L.glass, glass, false);
  const glassR = mk(R.glass, glass, false);
  glassL.renderOrder = glassR.renderOrder = 2;
  root.add(frameL, frameR, glassL, glassR);

  const lanes: Lane[] = laneXs.map((x) => ({ x, o: 0, hold: 0, open: false, mode: 0, pos: new THREE.Vector3(x, 0.9, GATES.lineZ) }));
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3(1, 1, 1);
  const pv = new THREE.Vector3();
  const setPaddles = (i: number): void => {
    const lane = lanes[i]!;
    const e = ease(lane.o);
    const h = parts.hinges[i]!;
    q.setFromAxisAngle(up, -Math.PI / 2 * e);
    mx.compose(pv.set(h[0], PADDLE_Y, GATES.lineZ), q, sc);
    frameL.setMatrixAt(i, mx);
    glassL.setMatrixAt(i, mx);
    q.setFromAxisAngle(up, (Math.PI / 2) * e);
    mx.compose(pv.set(h[1], PADDLE_Y, GATES.lineZ), q, sc);
    frameR.setMatrixAt(i, mx);
    glassR.setMatrixAt(i, mx);
  };
  for (let i = 0; i < n; i++) setPaddles(i);
  void PADDLE_LEN;

  const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('gatesdemo') === '1';
  const colRed = new THREE.Color();
  const colGreen = new THREE.Color(0.15, 1.0, 0.35).multiplyScalar(1.8);
  const colDim = dim;
  const tmp = new THREE.Color();

  const setLamp = (i: number, c: THREE.Color): void => {
    for (let k = 0; k < 4; k++) lampMesh.setColorAt(i * 4 + k, c);
    if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;
  };

  const update = (f: FrameInfo): void => {
    const cam = f.camera.position;
    const held = demo || !GATES.requireTicket || tickets.held !== null;
    const grounded = cam.y < 3.5 && Math.abs(cam.z - GATES.lineZ) < 12;
    // nearest lane in line with the player
    let nearest = -1;
    let bestDx = 1e9;
    if (grounded) {
      for (let i = 0; i < n; i++) {
        const dx = Math.abs(cam.x - lanes[i]!.x);
        if (dx < bestDx) {
          bestDx = dx;
          nearest = i;
        }
      }
    }
    const dz = Math.abs(cam.z - GATES.lineZ);
    const prevNear = nearest >= 0 && dz < APPROACH_Z + 0.8 && bestDx < 1.2;
    for (let i = 0; i < n; i++) {
      const lane = lanes[i]!;
      const isNearest = i === nearest;
      const near = isNearest && dz < APPROACH_Z && bestDx < 0.8;
      const stay = isNearest && prevNear;
      const demoOpen = demo && i >= 7 && i < 14;
      const wantOpen = demoOpen || (held && (near || (lane.open && stay)));
      if (wantOpen) lane.hold = HOLD_S;
      else lane.hold = Math.max(0, lane.hold - f.dt);
      const target = lane.hold > 0;
      if (target !== lane.open) {
        lane.open = target;
        ctx.audio.gate(lane.pos, target);
      }
      const prevO = lane.o;
      lane.o = Math.min(1, Math.max(0, lane.o + ((target ? 1 : -1) * f.dt) / SWING_S));
      if (lane.o !== prevO) {
        setPaddles(i);
        frameL.instanceMatrix.needsUpdate = frameR.instanceMatrix.needsUpdate = true;
        glassL.instanceMatrix.needsUpdate = glassR.instanceMatrix.needsUpdate = true;
      }
      // lamp
      const demoRed = demo && i >= 14;
      let mode = 0;
      if (lane.open || lane.o > 0) mode = 2;
      else if ((near && !held) || demoRed) mode = 1;
      if (mode === 1) {
        const pulse = 1.4 + 0.6 * Math.sin(f.time * 4);
        setLamp(i, colRed.setRGB(1.0, 0.04, 0.03).multiplyScalar(pulse));
      } else if (mode === 2) {
        if (lane.mode !== 2) setLamp(i, colGreen);
      } else if (lane.mode !== 0) {
        setLamp(i, tmp.copy(colDim));
      }
      lane.mode = mode;
    }
  };

  void instanced;
  return { name: 'gates', object: root, update };
}
