import * as THREE from 'three';
import {
  CAVERN, DISC, FUNICULAR, GLASS_FLOOR, HALCYON, LIFTS, MAP_WALL, MERIDIAN, OCULUS, SKY,
  THRESHOLD, TRENCH, VESPER,
} from '../../layoutMetro';

export interface Greybox {
  voidGroup: THREE.Group; deepGroup: THREE.Group; deepImpostor: THREE.Mesh; surfaceImpostor: THREE.Mesh;
  deepMaterials: THREE.MeshStandardMaterial[];
}

const std = (color: number, roughness = 0.75, metalness = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Mesh {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return new THREE.Mesh(g, m);
}

/** Flat slab in the XZ plane with holes, top at yTop (shape y = -z, extruded down by `t`). */
function slab(outer: Array<[number, number]>, holes: Array<Array<[number, number]>>, yTop: number, t: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, yTop - t, 0);
  return g;
}
const circle = (cx: number, cz: number, r: number, n = 64): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cz - r * Math.sin((i / n) * Math.PI * 2)] as [number, number]);
const rectPts = (x0: number, z0: number, x1: number, z1: number): Array<[number, number]> => [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];

/** Sloped slab under one flight band (top surface on the step line). */
function flightSlab(m: THREE.Material, axis: 'x' | 'z', a: number, b: number, from: number, to: number, yFrom: number, yTo: number): THREE.Mesh {
  if (to < from) [from, to, yFrom, yTo] = [to, from, yTo, yFrom];
  const len = Math.hypot(to - from, yTo - yFrom);
  const t = 0.9;
  const g = new THREE.BoxGeometry(axis === 'z' ? b - a : len, t, axis === 'z' ? len : b - a);
  g.translate(0, -t / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  const angle = Math.atan2(yTo - yFrom, to - from);
  if (axis === 'z') { mesh.position.set((a + b) / 2, (yFrom + yTo) / 2, (from + to) / 2); mesh.rotation.x = -angle; }
  else { mesh.position.set((from + to) / 2, (yFrom + yTo) / 2, (a + b) / 2); mesh.rotation.z = angle; }
  return mesh;
}

export function buildGreybox(): Greybox {
  const { cx, cz } = OCULUS;
  const darkFloor = std(0x26292d, 0.35);  // terrazzo stand-in
  const trench = std(0x15171a, 0.9);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ee, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
  // independent materials (not clones): the void ones are sun-excluded, deep surfaces must receive the deep sun.
  const deepStone = std(0xd8d2c6, 0.6); const deepSteel = std(0xb9c0c6, 0.35, 0.7);
  const deepMaterials = [deepStone, darkFloor, deepSteel, trench];

  // --- void (always drawn) ---------------------------------------------------------------------------
  const V = new THREE.Group(); V.name = 'metroVoid';
  // F1–F4 are built by escalators.ts (real units); the void shell by void.ts.
  const surfaceImpostor = new THREE.Mesh(new THREE.CircleGeometry(OCULUS.r, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 1.0), fog: false }));
  surfaceImpostor.rotation.x = Math.PI / 2; surfaceImpostor.position.set(cx, OCULUS.slabUnderY - 0.05, cz); surfaceImpostor.name = 'metroSurfaceImpostor';
  surfaceImpostor.userData.noShadow = true;

  // --- deep (drawn below the airlock) ----------------------------------------------------------------
  const D = new THREE.Group(); D.name = 'metroDeep';
  // Buried sky, slot rims & casters are built by sky.ts (P3-2); cavern walls & base floor by shell.ts (P3-1).
  for (const tz of VESPER.trackZ) D.add(box(trench, CAVERN.transept.xMin, CAVERN.baseFloorY, tz - TRENCH.halfWidth, CAVERN.transept.xMax, VESPER.railY, tz + TRENCH.halfWidth));
  const fl = VESPER.floor;
  D.add(new THREE.Mesh(slab(rectPts(fl.xMin, fl.zMin, fl.xMax, fl.zMax), [
    circle(cx, cz, DISC.wellR), rectPts(VESPER.f6OpeningX[0], VESPER.f6OpeningZ[0], VESPER.f6OpeningX[1], VESPER.f6OpeningZ[1]),
    rectPts(GLASS_FLOOR.xMin, GLASS_FLOOR.zMin, GLASS_FLOOR.xMax, GLASS_FLOOR.zMax),
  ], VESPER.topY, VESPER.slabThickness), darkFloor));
  D.add(new THREE.Mesh(slab(rectPts(GLASS_FLOOR.xMin, GLASS_FLOOR.zMin, GLASS_FLOOR.xMax, GLASS_FLOOR.zMax), LIFTS.positions.map(([x, z]) => circle(x, z, LIFTS.tubeR, 32)), VESPER.topY, 0.08), glass));
  const isl = MERIDIAN.island;
  D.add(new THREE.Mesh(slab(rectPts(isl.xMin, isl.zMin, isl.xMax, isl.zMax), [
    circle(cx, cz, DISC.wellR), ...MERIDIAN.f5OpeningX.map(([a, b]) => rectPts(a, MERIDIAN.f5OpeningZ[0], b, MERIDIAN.f5OpeningZ[1])),
  ], MERIDIAN.topY, MERIDIAN.deckThickness), deepStone));
  D.add(box(deepSteel, -MERIDIAN.railDeckHalfWidth, MERIDIAN.railY - 0.6, isl.zMin - 9, MERIDIAN.railDeckHalfWidth, MERIDIAN.railY, isl.zMax + 9));
  const deepIsland = new THREE.Mesh(new THREE.BoxGeometry(HALCYON.halfLength * 2, 1.2, HALCYON.halfWidth * 2), deepStone);
  deepIsland.rotation.y = -Math.atan2(HALCYON.dir[1], HALCYON.dir[0]); deepIsland.position.set(HALCYON.centre[0], HALCYON.topY - 0.6, HALCYON.centre[1]);
  D.add(deepIsland);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(HALCYON.halfLength * 2 + 20, Math.abs(CAVERN.yBottom - (VESPER.topY - VESPER.slabThickness)), 0.5), deepStone);
    const [ux, uz] = HALCYON.dir;
    wall.rotation.y = deepIsland.rotation.y;
    wall.position.set(HALCYON.centre[0] - uz * side * HALCYON.hallHalfWidth, (CAVERN.yBottom + VESPER.topY - VESPER.slabThickness) / 2, HALCYON.centre[1] + ux * side * HALCYON.hallHalfWidth);
    D.add(wall);
  }
  // the tubes end at the Threshold deck; their heads and the glass above it are built by gates.ts (void group, always drawn)
  for (const [x, z] of LIFTS.positions) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(LIFTS.tubeR, LIFTS.tubeR, THRESHOLD.y - CAVERN.yBottom, 48, 1, true), glass);
    tube.position.set(x, (THRESHOLD.y + CAVERN.yBottom) / 2, z); D.add(tube);
  }
  const [tx, ty] = FUNICULAR.top; const [bx, by] = FUNICULAR.bottom;
  const track = flightSlab(deepSteel, 'x', FUNICULAR.z - FUNICULAR.trackHalfWidth, FUNICULAR.z + FUNICULAR.trackHalfWidth, tx, bx, ty, by);
  const cabin = box(glass, tx, ty, FUNICULAR.z - FUNICULAR.cabinWidth / 2, tx + FUNICULAR.cabinLength, ty + FUNICULAR.cabinHeight, FUNICULAR.z + FUNICULAR.cabinWidth / 2);
  D.add(track, cabin);
  const map = box(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.8) }), MAP_WALL.xMin, MAP_WALL.yMin, MAP_WALL.z, MAP_WALL.xMax, MAP_WALL.yMax, MAP_WALL.z + 0.1);
  map.userData.noShadow = true; D.add(map);
  const deepImpostor = new THREE.Mesh(new THREE.CircleGeometry(SKY.holeR, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.7, 3.2), fog: false }));
  deepImpostor.rotation.x = -Math.PI / 2; deepImpostor.position.set(cx, SKY.y + 0.1, cz); deepImpostor.name = 'metroDeepImpostor';
  deepImpostor.userData.noShadow = true;
  for (const m of [deepImpostor, surfaceImpostor]) m.userData.noCapture = true;
  return { voidGroup: V, deepGroup: D, deepImpostor, surfaceImpostor, deepMaterials };
}
