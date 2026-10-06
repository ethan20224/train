import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CAVERN, CROSS_OUTLINE, DISC, FLIGHTS, FUNICULAR, GLASS_FLOOR, HALCYON, LANDINGS, LIFTS, MAP_WALL, MERIDIAN, OCULUS, SKY,
  THRESHOLD, THROAT, TRENCH, VESPER, VOID, WATER_WALL, voidRadiusAt, DEEP_SUN,
} from '../../layoutMetro';
import { excludeDirectionalLight } from '../../lighting/sunMask';

export interface Greybox {
  voidGroup: THREE.Group; deepGroup: THREE.Group; deepImpostor: THREE.Mesh; surfaceImpostor: THREE.Mesh;
  disc: THREE.Mesh; deepMaterials: THREE.MeshStandardMaterial[];
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
  const stone = std(0xd8d2c6, 0.6);       // honed limestone stand-in
  const darkFloor = std(0x26292d, 0.35);  // terrazzo stand-in
  const steel = std(0xb9c0c6, 0.35, 0.7);
  const trench = std(0x15171a, 0.9);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ee, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
  const eras = [std(0xbfae93, 0.8), std(0x6f655b, 0.95), std(0xe2ddd3, 0.4)]; // carved stone, strata, polished
  const voidMats = [stone, steel, ...eras];
  for (const m of voidMats) excludeDirectionalLight(m);
  // independent materials (not clones): the void ones are sun-excluded, deep surfaces must receive the deep sun.
  const deepStone = std(0xd8d2c6, 0.6); const deepSteel = std(0xb9c0c6, 0.35, 0.7);
  const deepMaterials = [deepStone, darkFloor, deepSteel, trench];

  // --- void (always drawn) ---------------------------------------------------------------------------
  const V = new THREE.Group(); V.name = 'metroVoid';
  const curb = new THREE.Mesh(slab(circle(cx, cz, OCULUS.curbOuterR), [circle(cx, cz, OCULUS.r)], OCULUS.curbHeight, OCULUS.curbHeight + 1.5), stone);
  const balustrade = new THREE.Mesh(new THREE.CylinderGeometry(OCULUS.balustradeR, OCULUS.balustradeR, 1.0, 96, 1, true), std(0x5a4632, 0.5, 0.6));
  balustrade.position.set(cx, OCULUS.curbHeight + 0.5, cz);
  V.add(curb, balustrade, box(stone, -1.2, -0.3, cz - OCULUS.r, 1.2, 0, cz - DISC.r));
  for (const [a, b] of THROAT.bands) V.add(box(stone, a - 0.1, 0, THROAT.zMin, a, 1.0, THROAT.zMax), box(stone, b, 0, THROAT.zMin, b + 0.1, 1.0, THROAT.zMax));
  VOID.eras.forEach((e, i) => {
    const pts: THREE.Vector2[] = [];
    for (let y = e.yTop; y >= e.yBottom - 1e-6; y -= 0.5) pts.push(new THREE.Vector2(voidRadiusAt(y), y));
    const m = eras[i]!;
    m.side = THREE.BackSide; // seen from inside the void
    const wall = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), m);
    wall.position.set(cx, 0, cz);
    V.add(wall);
  });
  const rings: THREE.BufferGeometry[] = [];
  for (let y = OCULUS.slabUnderY - VOID.lightRingPitch; y > VOID.yBottom; y -= VOID.lightRingPitch) {
    const g = new THREE.TorusGeometry(voidRadiusAt(y) - 0.08, 0.04, 6, 128); g.rotateX(Math.PI / 2); g.translate(cx, y, cz); rings.push(g);
  }
  const ringMesh = new THREE.Mesh(mergeGeometries(rings), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.9) }));
  ringMesh.userData.noShadow = true;
  V.add(ringMesh);
  for (const L of [LANDINGS.L1, LANDINGS.L2, LANDINGS.thresholdBridge]) V.add(box(stone, -L.halfX, L.y - 0.6, L.zMin, L.halfX, L.y, L.zMax));
  // 0.1 m short of the sky plane: the deck underside must not be coplanar with the sky (z-fighting from below).
  V.add(new THREE.Mesh(slab(circle(cx, cz, THRESHOLD.rOuter), [circle(cx, cz, THRESHOLD.rInner)], THRESHOLD.y, THRESHOLD.deckThickness - 0.1), stone));
  // F1–F4 live in the void group (F4 crosses the sky and is seen from both worlds); F5/F6 are deep-only.
  for (const f of FLIGHTS.filter((q) => q.id === 'F1' || q.id === 'F2' || q.id === 'F3' || q.id === 'F4')) {
    for (const [a, b] of f.bands) V.add(flightSlab(steel, f.axis, a, b, f.from, f.to, f.yFrom, f.yTo));
  }
  const discMesh = new THREE.Mesh(new THREE.CylinderGeometry(DISC.r, DISC.r, 0.4, 96), std(0xe8e2d6, 0.3));
  discMesh.geometry.translate(0, -0.2, 0); discMesh.position.set(cx, DISC.topY, cz); discMesh.name = 'metroDisc';
  discMesh.userData.noShadow = true; V.add(discMesh);
  const surfaceImpostor = new THREE.Mesh(new THREE.CircleGeometry(OCULUS.r, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 1.0), fog: false }));
  surfaceImpostor.rotation.x = Math.PI / 2; surfaceImpostor.position.set(cx, OCULUS.slabUnderY - 0.05, cz); surfaceImpostor.name = 'metroSurfaceImpostor';
  surfaceImpostor.userData.noShadow = true;

  // --- deep (drawn below the airlock) ----------------------------------------------------------------
  const D = new THREE.Group(); D.name = 'metroDeep';
  const cross = CROSS_OUTLINE.map(([x, z]) => [x, z] as [number, number]);
  const skyHoles = [circle(cx, cz, SKY.holeR), ...LIFTS.positions.map(([x, z]) => circle(x, z, LIFTS.tubeR + 0.2, 32)), rectPts(FUNICULAR.skySlot.xMin, FUNICULAR.z - FUNICULAR.skySlot.halfZ, FUNICULAR.skySlot.xMax, FUNICULAR.z + FUNICULAR.skySlot.halfZ)];
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false,
    uniforms: { uSunDir: { value: new THREE.Vector3(...DEEP_SUN.direction).normalize() } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uSunDir; varying vec3 vW;
      void main(){ vec3 d = normalize(vW - cameraPosition); float up = max(d.y, 0.0);
        vec3 col = mix(vec3(0.75,0.85,1.0)*2.6, vec3(0.16,0.36,0.9)*2.2, pow(up, 0.6));
        float s = max(dot(d, uSunDir), 0.0); col += vec3(1.0,0.97,0.9) * (60.0*smoothstep(0.9995,0.9998,s) + 1.5*pow(s,40.0));
        gl_FragColor = vec4(col, 1.0); }`,
  });
  const sky = new THREE.Mesh(slab(cross, skyHoles, SKY.y + 0.02, 0.02), skyMat);
  sky.userData.noShadow = true;
  const holeCaster = new THREE.Mesh(new THREE.CircleGeometry(SKY.holeR, 64), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  holeCaster.rotation.x = -Math.PI / 2; holeCaster.position.set(cx, SKY.y - 0.2, cz); holeCaster.castShadow = true; holeCaster.userData.noCapture = true;
  D.add(sky, holeCaster);
  for (let i = 0; i < cross.length; i++) {
    const [x0, z0] = cross[i]!; const [x1, z1] = cross[(i + 1) % cross.length]!;
    D.add(box(deepStone, Math.min(x0, x1) - 0.5, CAVERN.yBottom, Math.min(z0, z1) - 0.5, Math.max(x0, x1) + 0.5, SKY.y, Math.max(z0, z1) + 0.5));
  }
  D.add(new THREE.Mesh(slab(rectPts(CAVERN.transept.xMin, CAVERN.transept.zMin, CAVERN.transept.xMax, VESPER.floor.zMin - 1.6), [], CAVERN.baseFloorY, 0.3), darkFloor));
  D.add(new THREE.Mesh(slab(rectPts(CAVERN.transept.xMin, VESPER.floor.zMax + 1.6, CAVERN.transept.xMax, CAVERN.transept.zMax), [], CAVERN.baseFloorY, 0.3), darkFloor));
  D.add(new THREE.Mesh(slab(rectPts(CAVERN.nave.xMin, CAVERN.nave.zMin, CAVERN.nave.xMax, CAVERN.transept.zMin), [], CAVERN.baseFloorY, 0.3), darkFloor));
  D.add(new THREE.Mesh(slab(rectPts(CAVERN.nave.xMin, CAVERN.transept.zMax, CAVERN.nave.xMax, CAVERN.nave.zMax), [], CAVERN.baseFloorY, 0.3), darkFloor));
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
  for (const f of FLIGHTS.filter((q) => q.id === 'F5' || q.id === 'F6')) for (const [a, b] of f.bands) D.add(flightSlab(deepSteel, f.axis, a, b, f.from, f.to, f.yFrom, f.yTo));
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
  for (const [x, z] of LIFTS.positions) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(LIFTS.tubeR, LIFTS.tubeR, LIFTS.headY - CAVERN.yBottom, 48, 1, true), glass);
    tube.position.set(x, (LIFTS.headY + CAVERN.yBottom) / 2, z); D.add(tube);
  }
  const [tx, ty] = FUNICULAR.top; const [bx, by] = FUNICULAR.bottom;
  const track = flightSlab(deepSteel, 'x', FUNICULAR.z - FUNICULAR.trackHalfWidth, FUNICULAR.z + FUNICULAR.trackHalfWidth, tx, bx, ty, by);
  const cabin = box(glass, tx, ty, FUNICULAR.z - FUNICULAR.cabinWidth / 2, tx + FUNICULAR.cabinLength, ty + FUNICULAR.cabinHeight, FUNICULAR.z + FUNICULAR.cabinWidth / 2);
  D.add(track, cabin);
  D.add(box(std(0x0c0d0f, 0.25), WATER_WALL.x - 0.6, WATER_WALL.yMin, WATER_WALL.zMin, WATER_WALL.x, WATER_WALL.yMax, WATER_WALL.zMax));
  const map = box(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.8) }), MAP_WALL.xMin, MAP_WALL.yMin, MAP_WALL.z, MAP_WALL.xMax, MAP_WALL.yMax, MAP_WALL.z + 0.1);
  map.userData.noShadow = true; D.add(map);
  const deepImpostor = new THREE.Mesh(new THREE.CircleGeometry(SKY.holeR, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.7, 3.2), fog: false }));
  deepImpostor.rotation.x = -Math.PI / 2; deepImpostor.position.set(cx, SKY.y + 0.1, cz); deepImpostor.name = 'metroDeepImpostor';
  deepImpostor.userData.noShadow = true;
  for (const m of [deepImpostor, surfaceImpostor]) m.userData.noCapture = true;
  return { voidGroup: V, deepGroup: D, deepImpostor, surfaceImpostor, disc: discMesh, deepMaterials };
}
