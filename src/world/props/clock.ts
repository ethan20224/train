import * as THREE from 'three';
import type { FrameInfo } from '../../core/types';
import { KIOSK } from '../../layout';
import { smoothstep } from '../concourse/geo';

const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

/** Opal-glass clock face (cream, black Roman numerals, minute track, maker's text). */
export function makeFaceTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const cx = S / 2;
  const cy = S / 2;
  // opal glass body with a soft radial falloff
  const grad = g.createRadialGradient(cx, cy, S * 0.05, cx, cy, S * 0.5);
  grad.addColorStop(0, '#fbf3e0');
  grad.addColorStop(0.85, '#f1e5c8');
  grad.addColorStop(1, '#e2d2ac');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#17120c';
  g.fillStyle = '#17120c';
  // minute track
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, S * 0.462, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, S * 0.352, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const major = i % 5 === 0;
    const r0 = S * 0.352;
    const r1 = S * (major ? 0.41 : 0.385);
    g.lineWidth = major ? 9 : 3.4;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
    g.lineTo(cx + Math.sin(a) * (major ? S * 0.462 : r1 + 0.0), cy - Math.cos(a) * (major ? S * 0.462 : r1));
    g.stroke();
  }
  // Roman numerals, upright on the circle
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = S * 0.298;
    g.save();
    g.translate(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
    g.rotate(a + (i > 3 && i < 9 ? Math.PI : 0));
    g.font = `600 ${i % 3 === 0 ? 82 : 70}px "Didot", "Bodoni 72", "Georgia", "Times New Roman", serif`;
    g.fillText(ROMAN[i] ?? '', 0, 4);
    g.restore();
  }
  // maker's text
  g.font = `500 30px "Didot", "Georgia", serif`;
  g.save();
  g.fillText('G R A N D   M E R I D I A N', cx, cy - S * 0.13);
  g.font = `500 22px "Georgia", serif`;
  g.fillText('MCMXII', cx, cy + S * 0.14);
  g.restore();
  // tiny centre ring (drawn under the hands)
  g.beginPath();
  g.arc(cx, cy, 14, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function handShape(len: number, tail: number, w: number, kind: 'hour' | 'minute' | 'second'): THREE.Shape {
  const s = new THREE.Shape();
  if (kind === 'second') {
    s.moveTo(-w, -tail);
    s.lineTo(w, -tail);
    s.lineTo(w * 0.6, 0);
    s.lineTo(w * 0.28, len);
    s.lineTo(-w * 0.28, len);
    s.lineTo(-w * 0.6, 0);
    s.closePath();
    return s;
  }
  // spade-tipped hands
  const bodyW = w;
  const tipAt = len * (kind === 'hour' ? 0.62 : 0.74);
  s.moveTo(-bodyW * 0.7, -tail);
  s.lineTo(bodyW * 0.7, -tail);
  s.lineTo(bodyW, 0);
  s.lineTo(bodyW * 0.55, tipAt);
  s.lineTo(bodyW * 1.9, tipAt + len * 0.07);
  s.lineTo(0, len);
  s.lineTo(-bodyW * 1.9, tipAt + len * 0.07);
  s.lineTo(-bodyW * 0.55, tipAt);
  s.lineTo(-bodyW, 0);
  s.closePath();
  return s;
}

export interface ClockRig {
  object: THREE.Group;
  update(f: FrameInfo): void;
}

const FACE_R = 0.6;
const CASE_HALF = 0.74;

/** Hands position from the frozen time 6:47:47 (second hand rests at 47 s). */
const HOUR_ANGLE = (6 + (47 + 47 / 60) / 60) * 30; // deg clockwise from 12
const MIN_ANGLE = (47 + 47 / 60) * 6;

/**
 * Deterministic second-hand offset in degrees (relative to the 47 s resting position), from time only:
 *  - at every integer second the hand jumps to 48 s (+6 deg) with a ~60 ms spring overshoot,
 *  - at integer + 0.5 s it eases back to 47 s.
 * Audio contract: the tick sounds at every integer second of FrameInfo.time.
 */
export function secondHandOffsetDeg(time: number): number {
  const ph = time - Math.floor(time);
  if (ph < 0.5) {
    const t = ph;
    // underdamped step response, period ~ 0.12 s, peaks ~ +26 % at ~ 50 ms, settles by ~ 0.2 s
    const w = (Math.PI * 2) / 0.1;
    const z = 0.45;
    const wd = w * Math.sqrt(1 - z * z);
    const step = 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    return 6 * step;
  }
  const e = smoothstep(0.5, 0.88, ph);
  return 6 * (1 - e);
}

export function buildClock(
  faceMap: THREE.Texture, brass: THREE.Material, handMat: THREE.Material, parent: { faceMesh: (m: THREE.Mesh) => void },
): ClockRig {
  const root = new THREE.Group();
  root.name = 'clock';
  const [kx, kz] = KIOSK.center;
  root.position.set(kx, KIOSK.clockY, kz);

  // faces (one merged geometry: 4 discs)
  const faceMat = new THREE.MeshStandardMaterial({
    name: 'clockFace', map: faceMap, emissiveMap: faceMap, emissive: new THREE.Color(0xffe2b4), emissiveIntensity: 0.6,
    roughness: 0.45, metalness: 0,
  });
  const faceGeos: THREE.BufferGeometry[] = [];
  const staticHands: THREE.BufferGeometry[] = [];
  const bezel: THREE.BufferGeometry[] = [];
  const secGeo = new THREE.ShapeGeometry(handShape(FACE_R * 0.9, FACE_R * 0.2, 0.012, 'second'));
  // second hand lollipop disc near the tail end
  const disc = new THREE.CircleGeometry(0.03, 14);
  disc.translate(0, FACE_R * 0.62, 0);
  const secMerged = mergeSimple([secGeo, disc]);

  for (let k = 0; k < 4; k++) {
    const yaw = (k * Math.PI) / 2;
    const rot = new THREE.Matrix4().makeRotationY(yaw);
    const place = (z: number): THREE.Matrix4 => new THREE.Matrix4().copy(rot).multiply(new THREE.Matrix4().makeTranslation(0, 0, z));
    const face = new THREE.CircleGeometry(FACE_R, 64);
    face.applyMatrix4(place(CASE_HALF + 0.004));
    faceGeos.push(face);
    const ring = new THREE.TorusGeometry(FACE_R + 0.025, 0.035, 8, 64);
    ring.applyMatrix4(place(CASE_HALF + 0.012));
    bezel.push(ring);
    const hour = new THREE.ShapeGeometry(handShape(FACE_R * 0.52, FACE_R * 0.12, 0.022, 'hour'));
    hour.rotateZ(-THREE.MathUtils.degToRad(HOUR_ANGLE));
    hour.applyMatrix4(place(CASE_HALF + 0.012));
    const minute = new THREE.ShapeGeometry(handShape(FACE_R * 0.86, FACE_R * 0.14, 0.016, 'minute'));
    minute.rotateZ(-THREE.MathUtils.degToRad(MIN_ANGLE));
    minute.applyMatrix4(place(CASE_HALF + 0.02));
    staticHands.push(hour, minute);
  }
  const faceMesh = new THREE.Mesh(mergeSimple(faceGeos), faceMat);
  faceMesh.name = 'clockFaces';
  const bezelMesh = new THREE.Mesh(mergeSimple(bezel), brass);
  bezelMesh.name = 'clockBezels';
  bezelMesh.castShadow = true;
  const handsMesh = new THREE.Mesh(mergeSimple(staticHands), handMat);
  handsMesh.name = 'clockHands';
  for (const m of [faceMesh, bezelMesh, handsMesh]) root.add(m);
  parent.faceMesh(faceMesh);

  // second hands: one instanced mesh (4 instances), matrices rewritten per frame
  const sec = new THREE.InstancedMesh(secMerged, handMat, 4);
  sec.name = 'clockSecondHands';
  sec.frustumCulled = false;
  root.add(sec);
  const tmp = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  let lastOffset = Number.NaN;
  const apply = (offsetDeg: number): void => {
    const ang = -THREE.MathUtils.degToRad(MIN_ANGLE_SECOND + offsetDeg);
    rz.makeRotationZ(ang);
    for (let k = 0; k < 4; k++) {
      place.makeRotationY((k * Math.PI) / 2).multiply(tmp.makeTranslation(0, 0, CASE_HALF + 0.03));
      sec.setMatrixAt(k, place.clone().multiply(rz));
    }
    sec.instanceMatrix.needsUpdate = true;
  };
  apply(0);
  return {
    object: root,
    update(f: FrameInfo): void {
      const off = secondHandOffsetDeg(f.time);
      if (Math.abs(off - lastOffset) < 1e-4) return;
      lastOffset = off;
      apply(off);
    },
  };
}

/** Second hand rests at 47 s => 47 * 6 degrees. */
const MIN_ANGLE_SECOND = 47 * 6;

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 0, 1);
      if (u) uv.push(u.getX(i), u.getY(i));
      else uv.push(0, 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
