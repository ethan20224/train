import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { CROSSING, DISC, DISC_DETAIL as DD, GANGWAY, OCULUS } from '../../layoutMetro';
import { GeoBag, latheMeters, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import { vertexGlow } from './glow';
import type { MetroMaterials } from './materials';

/**
 * The Sinking Floor (spec §2.4): a round slab of the hall's own floor marble with an inlaid medallion echoing the kiosk floor,
 * a slim brass rail on eight stanchions (open toward the gangway), and a polished bronze bowl with a ring of warm downlight
 * underneath. Local y = 0 is the walking surface; the group sits at world y = disc.y every displayed frame.
 * Geometry is built at world x / z so the marble's world-projected texture continues the hall floor when the disc is docked.
 * Also builds the Crossing-floor well gate (the same leaves and pilasters as the hall gangway, at the well rim).
 */

const { cx: CX, cz: CZ } = OCULUS;
const TAU = Math.PI * 2;
const SOUTH = Math.PI * 1.5;
const N = DD.segments;
const UP = v3(0, 1, 0);

/** Flat disc / annulus at height y with the shared 96-gon (exact shared vertices between neighbouring rings, so no cracks). */
function flat(r0: number, r1: number, y = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const P = (r: number, i: number): [number, number, number] => [CX + r * Math.cos((i / N) * TAU), y, CZ + r * Math.sin((i / N) * TAU)];
  for (let i = 0; i < N; i++) {
    // wound so the normal faces +y (angle increases from +x toward +z)
    if (r0 === 0) pos.push(CX, y, CZ, ...P(r1, i + 1), ...P(r1, i));
    else pos.push(...P(r0, i), ...P(r1, i + 1), ...P(r1, i), ...P(r0, i), ...P(r0, i + 1), ...P(r1, i + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Marble disc r < ringInner with the star cut out, and the star itself (dark marble), as two shape geometries in the XZ plane. */
function starParts(): { field: THREE.BufferGeometry; star: THREE.BufferGeometry } {
  const { points, outer, inner } = DD.star;
  // the star apex points at due south so it lines up with the gangway; the shape is in (x, -z) so it can be rotated flat
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = SOUTH + (i / (points * 2)) * TAU;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(new THREE.Vector2(CX + r * Math.cos(a), -(CZ + r * Math.sin(a))));
  }
  const star = new THREE.ShapeGeometry(new THREE.Shape(pts));
  const field = new THREE.Shape();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const p = new THREE.Vector2(CX + DD.ringR[0] * Math.cos(a), -(CZ + DD.ringR[0] * Math.sin(a)));
    if (i === 0) field.moveTo(p.x, p.y); else field.lineTo(p.x, p.y);
  }
  field.holes.push(new THREE.Path([...pts].reverse()));
  const fieldGeo = new THREE.ShapeGeometry(field);
  for (const g of [star, fieldGeo]) g.rotateX(-Math.PI / 2);
  return { field: fieldGeo, star };
}

const ringFrames = (r: number, y: number, a0: number, a1: number, n: number): Frame[] => {
  const out: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    const radial = v3(Math.cos(t), 0, Math.sin(t));
    out.push({ o: v3(CX + r * radial.x, y, CZ + r * radial.z), a: radial, b: UP.clone() });
  }
  return out;
};
const tube = (r: number, sides = 8): P2[] => Array.from({ length: sides }, (_, i) => [r * Math.cos((i / sides) * TAU), r * Math.sin((i / sides) * TAU)] as P2);

/** Bowl surface below the slab: depth at radius r. */
const bowlY = (r: number): number => {
  const k = Math.min(1, r / (DISC.r - 0.04));
  return -DD.slabT - 0.05 - (DD.bowlDepth - 0.05) * (1 - k * k) ** 1.35;
};

export interface DiscVisuals {
  /** Everything that moves with the disc (world y = disc.y). */
  group: THREE.Group;
  /** 2035 Monolith curved sliding glass well-gate leaves at the Crossing-floor level (no bronze/brass). */
  wellGate: THREE.Group;
  /** Deep-environment materials owned by wellGate (for metro.userData.deepMaterials). */
  wellDeepMaterials: THREE.Material[];
  /** Per displayed frame, real time. */
  update(y: number, wellGateOpen: boolean): void;
}

/** Curved horizontal arc-strip solid in local space around (0, 0, 0), spanning angles [a0, a1] at radius r, thickness t, y0..y1. */
function curvedArcStrip(r: number, t: number, y0: number, y1: number, a0: number, a1: number, segs: number): THREE.BufferGeometry {
  const prof: P2[] = [[-t / 2, y0], [t / 2, y0], [t / 2, y1], [-t / 2, y1]];
  const frames: Frame[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    const rad = v3(Math.cos(a), 0, Math.sin(a));
    frames.push({ o: v3(r * rad.x, 0, r * rad.z), a: rad, b: UP.clone() });
  }
  return sweep(prof, frames, { closed: true, caps: true });
}

/** Single curved Monolith sliding leaf prototype centred around SOUTH (-pi/2), spanning [-halfArc, +halfArc]. */
function buildCurvedWellLeaf(rLeaf: number, halfArc: number): { frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const h = 1.08;
  const topH = 0.044, botH = 0.060, frameT = 0.028, glassT = 0.012;
  const stileArc = 0.032 / rLeaf; // 32 mm slim stainless end stiles
  const gapArc = 0.004 / rLeaf;   // 4 mm hairline meeting clearance
  const a0 = SOUTH - halfArc + gapArc;
  const a1 = SOUTH + halfArc - gapArc;
  const segs = 12;

  const norm = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const out = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
    if (!out.getAttribute('normal')) out.computeVertexNormals();
    return out;
  };
  const fParts = [
    norm(curvedArcStrip(rLeaf, frameT, 0.012, 0.012 + botH, a0, a1, segs)),
    norm(curvedArcStrip(rLeaf, frameT, h - topH, h, a0, a1, segs)),
    norm(curvedArcStrip(rLeaf, frameT, 0.012 + botH, h - topH, a0, a0 + stileArc, 2)),
    norm(curvedArcStrip(rLeaf, frameT, 0.012 + botH, h - topH, a1 - stileArc, a1, 2)),
  ];
  const frame = mergeGeometries(fParts, false)!;
  for (const p of fParts) p.dispose();
  frame.computeBoundingSphere();

  const glass = norm(curvedArcStrip(rLeaf, glassT, 0.012 + botH - 0.005, h - topH + 0.005, a0 + stileArc - 0.002, a1 - stileArc + 0.002, segs));
  glass.computeBoundingSphere();
  return { frame, glass };
}

const _leafMat = new THREE.Matrix4();

export function buildDisc(lib: MaterialLibrary, kit: MetroMaterials, wellY: number): DiscVisuals {
  const group = new THREE.Group();
  group.name = 'metroDisc';

  // hall-lit materials (the disc is lit by whichever sun is active at its height)
  const hallBrass = (lib.get('brass') as THREE.MeshStandardMaterial).clone();
  hallBrass.name = 'discBrass';
  vertexGlow(hallBrass); // polished brass rail, darker bronze bowl and the emissive downlight ring: one draw call
  hallBrass.side = THREE.DoubleSide;

  const marble = new GeoBag(lib, 'floorMarble');
  const dark = new GeoBag(lib, 'darkMarble');
  const brass = new GeoBag(lib, 'brass');

  // ---- top ---------------------------------------------------------------------------------------
  const { field, star } = starParts();
  marble.add(field);
  dark.add(star);
  marble.add(flat(DD.ringR[1], DD.bandR[0]));
  marble.add(flat(DD.bandR[1] + DD.bandLine, DISC.r));
  dark.add(flat(DD.bandR[0] + DD.bandLine, DD.bandR[1]));
  brass.add(flat(DD.ringR[0], DD.ringR[1]));
  brass.add(flat(DD.bandR[0], DD.bandR[0] + DD.bandLine));
  brass.add(flat(DD.bandR[1], DD.bandR[1] + DD.bandLine));
  // slab edge band
  const edge = new THREE.CylinderGeometry(DISC.r, DISC.r, DD.slabT, N, 1, true);
  edge.translate(CX, -DD.slabT / 2, CZ);
  marble.add(edge);

  // ---- rim: brass handrail on 8 stanchions, open toward the gangway ----------------------------------
  const a0 = SOUTH + TAU / (DD.stanchions * 2), a1 = SOUTH + TAU - TAU / (DD.stanchions * 2);
  const span = (a1 - a0) / (DD.stanchions - 1);
  const stanch: P2[] = [[0, 0], [0.055, 0], [0.055, 0.012], [0.03, 0.02], [0.02, 0.04], [DD.stanchionR, 0.06], [DD.stanchionR, DD.railHeight - 0.075], [0.026, DD.railHeight - 0.065], [0.026, DD.railHeight - 0.04], [0, DD.railHeight - 0.02]];
  const stanGeo = latheMeters(stanch, 12, 1, 1);
  for (let i = 0; i < DD.stanchions; i++) {
    const t = a0 + span * i;
    brass.add(stanGeo, new THREE.Matrix4().makeTranslation(CX + DD.rimR * Math.cos(t), 0, CZ + DD.rimR * Math.sin(t)));
  }
  const nRail = 96;
  brass.add(sweep(tube(DD.railTubeR), ringFrames(DD.rimR, DD.railHeight - DD.railTubeR - 0.005, a0, a1, nRail), { closed: true, caps: true }));
  brass.add(sweep(tube(0.011, 6), ringFrames(DD.rimR, DD.kneeRailY, a0, a1, nRail), { closed: true, caps: true }));

  // ---- underside: bronze bowl, with the downlight ring ---------------------------------------------------
  const prof: P2[] = [];
  for (let i = 0; i <= 28; i++) { const r = ((DISC.r - 0.04) * i) / 28; prof.push([r, bowlY(r)]); }
  prof.push([DISC.r - 0.01, -DD.slabT - 0.015], [DISC.r + 0.01, -DD.slabT]);
  const bowlGeo = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), N);
  bowlGeo.translate(CX, 0, CZ);
  const bronze = new GeoBag(lib, 'brass');
  bronze.add(bowlGeo);
  // a shallow stepped lip where the bowl meets the slab edge
  bronze.add(sweep([[-0.03, 0], [0.03, 0], [0.03, -0.05], [-0.01, -0.07]] as P2[], ringFrames(DISC.r - 0.02, -DD.slabT, 0, TAU, N), { closed: true }));

  const lightProf: THREE.Vector2[] = [];
  for (let i = 0; i <= 4; i++) { const r = DD.downlightR[0] + ((DD.downlightR[1] - DD.downlightR[0]) * i) / 4; lightProf.push(new THREE.Vector2(r, bowlY(r) - 0.006)); }
  const lightGeo = new THREE.LatheGeometry(lightProf, N);
  lightGeo.translate(CX, 0, CZ);

  // ---- meshes ----------------------------------------------------------------------------------------------
  const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, target: THREE.Group = group): THREE.Mesh | null => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.userData.noShadow = true; // it moves: the static shadow map must not carry it
    target.add(m);
    return m;
  };
  add(marble.merge(), lib.get('floorMarble'), 'discMarble');
  add(dark.merge(), lib.get('darkMarble'), 'discInlay');
  const tinted = (g: THREE.BufferGeometry | null, rgb: [number, number, number]): THREE.BufferGeometry | null => {
    if (!g) return null;
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const lightG = tinted(lightGeo.index ? lightGeo.toNonIndexed() : lightGeo, [3.0, 2.15, 1.35])!;
  const parts = [tinted(brass.merge(), [1, 1, 1])!, tinted(bronze.merge(), [0.5, 0.36, 0.24])!];
  add(mergeGeometries([...parts, lightG], false), hallBrass, 'discBrass');

  // ---- Crossing-floor well gate (2035 Monolith, P3-4): two curved sliding glass leaves in slim stainless frames ----
  // Slides concentrically just inside the r = 4.06 static glass balustrade ring built by crossing.ts. Zero bronze/brass.
  const wellGate = new THREE.Group();
  wellGate.name = 'metroWellGate';
  wellGate.position.set(CX, wellY, CZ);

  const gapHalf = CROSSING.wellGateHalfAngle; // 17.5 deg each side of SOUTH -> 2.44 m clear gangway
  const leafHalf = gapHalf / 2;
  const rLeaf = DISC.wellR + 0.022;           // 38 mm radially inside the r = 4.06 fixed ring glass (clean clearance)
  const leafProto = buildCurvedWellLeaf(rLeaf, leafHalf);

  const wellStainless = new THREE.MeshStandardMaterial({
    name: 'metroDeepWellGateStainless',
    color: 0xd0d6dc,
    metalness: 1.0,
    roughness: 0.22,
    envMapIntensity: 1.25,
  });
  const leafFrames = new THREE.InstancedMesh(leafProto.frame, wellStainless, 2);
  leafFrames.name = 'wellGateLeafFrames';
  leafFrames.userData.noShadow = true;
  const leafGlass = new THREE.InstancedMesh(leafProto.glass, kit.deep.glass, 2);
  leafGlass.name = 'wellGateLeafGlass';
  leafGlass.renderOrder = (kit.deep.glass.userData.renderOrder as number) ?? 2;
  leafGlass.userData.noShadow = true;
  // Bounding sphere covering the full ring diameter so sliding leaves never frustum-cull early
  const ringSphere = new THREE.Sphere(new THREE.Vector3(0, 0.55, 0), rLeaf + 0.5);
  leafFrames.boundingSphere = ringSphere.clone();
  leafGlass.boundingSphere = ringSphere.clone();
  wellGate.add(leafFrames, leafGlass);

  const setWellLeaves = (open01: number): void => {
    const t = open01 * open01 * (3 - 2 * open01); // smooth ease in-out matching GANGWAY.gateSeconds
    const travel = gapHalf * 1.02 * t;
    // Positive rotateY swings SOUTH toward WEST (-x); negative rotateY swings SOUTH toward EAST (+x).
    _leafMat.makeRotationY(+(leafHalf + travel));
    leafFrames.setMatrixAt(0, _leafMat);
    leafGlass.setMatrixAt(0, _leafMat);
    _leafMat.makeRotationY(-(leafHalf + travel));
    leafFrames.setMatrixAt(1, _leafMat);
    leafGlass.setMatrixAt(1, _leafMat);
    leafFrames.instanceMatrix.needsUpdate = true;
    leafGlass.instanceMatrix.needsUpdate = true;
  };

  let phase = 0;
  setWellLeaves(0);
  let lastS = performance.now() / 1000;
  return {
    group, wellGate,
    wellDeepMaterials: [wellStainless],
    update(y: number, open: boolean): void {
      group.position.y = y;
      const nowS = performance.now() / 1000;
      const dt = Math.min(0.1, nowS - lastS); // REAL time
      lastS = nowS;
      const target = open ? 1 : 0;
      if (phase === target) return;
      const dir = Math.sign(target - phase);
      phase += dir * (dt / GANGWAY.gateSeconds);
      if ((dir > 0 && phase >= target) || (dir < 0 && phase <= target)) phase = target;
      setWellLeaves(phase);
    },
  };
}
