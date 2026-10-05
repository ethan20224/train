import * as THREE from 'three';
import type { BuildContext, FrameInfo, MaterialName, WorldModule } from '../core/types';
import { KIOSK } from '../layout';
import { GeoBag } from './concourse/geo';
import { buildKioskStatic, fasciaGeometry, makeFasciaTexture } from './props/kiosk';
import { buildClock, makeFaceTexture } from './props/clock';
import { buildBoard } from './props/board';
import { buildBenches } from './props/benches';
import { buildBoardFrame, buildSigns, buildStanchions, makeSignAtlas } from './props/details';

/**
 * Props: information kiosk with the four-faced clock, split-flap departures board, waiting-room benches, hanging
 * platform signs, brass stanchions. Collidable footprints are registered via src/obstacles.ts (props/layout.ts).
 */
export async function buildProps(ctx: BuildContext): Promise<WorldModule> {
  const { materials, renderer } = ctx;
  const root = new THREE.Group();
  root.name = 'props';
  const updaters: Array<(f: FrameInfo) => void> = [];

  const guard = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      console.error(`[props] ${name} failed`, e);
    }
  };
  const bag = (m: MaterialName, tile?: number): GeoBag => new GeoBag(materials, m, tile);
  const brass = bag('brass');
  const wood = bag('wood');
  const dark = bag('darkMarble');
  const col = bag('columnMarble');
  const iron = bag('castIron');
  const rope = bag('wood');

  const colMat = materials.get('columnMarble').clone();
  if (colMat.normalScale) colMat.normalScale.set(0.1, 0.1);
  colMat.roughness = 0.5;
  const darkMat = materials.get('darkMarble').clone();
  darkMat.roughness = 0.26;
  const ropeMat = new THREE.MeshStandardMaterial({ name: 'velvetRope', color: 0x5a1218, roughness: 0.85 });
  const handMat = new THREE.MeshStandardMaterial({ name: 'clockHand', color: 0x0b0a09, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
  const brassMat = materials.get('brass');

  const add = (m: THREE.Object3D): void => void root.add(m);

  guard('kiosk', () => {
    buildKioskStatic({ dark, col, wood, brass });
    const ftex = makeFasciaTexture(renderer);
    const fascia = new THREE.Mesh(
      fasciaGeometry(),
      new THREE.MeshStandardMaterial({
        name: 'kioskFascia', map: ftex, emissiveMap: ftex, emissive: new THREE.Color(0xffd89a),
        emissiveIntensity: 0.35, roughness: 0.45, side: THREE.DoubleSide,
      }),
    );
    // warm bulbs inside the booth, glowing through the brass grilles
    const bulbs = new GeoBag(materials, 'glass');
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      const b = new THREE.SphereGeometry(0.09, 8, 6);
      b.translate(KIOSK.center[0] + Math.sin(a) * 2.2, 3.0, KIOSK.center[1] + Math.cos(a) * 2.2);
      bulbs.add(b, undefined, 'keep');
    }
    const bg = bulbs.merge();
    if (bg) {
      const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: new THREE.Color(0xffb85c), emissiveIntensity: 4.5 }));
      bm.name = 'kioskBulbs';
      add(bm);
    }
    fascia.name = 'kioskFascia';
    fascia.position.set(KIOSK.center[0], 3.5, KIOSK.center[1]);
    fascia.castShadow = fascia.receiveShadow = true;
    add(fascia);
  });

  guard('clock', () => {
    const rig = buildClock(makeFaceTexture(renderer), brassMat, handMat, { faceMesh: () => undefined });
    add(rig.object);
    updaters.push((f) => rig.update(f));
  });

  guard('board', () => {
    const board = buildBoard(renderer);
    add(board.mesh);
    updaters.push((f) => board.update(f));
    buildBoardFrame(brass, iron);
  });

  guard('signs', () => {
    const geo = buildSigns(brass);
    const mat = new THREE.MeshStandardMaterial({
      name: 'archSigns', map: makeSignAtlas(renderer), emissive: new THREE.Color(0xffe0a8), emissiveIntensity: 0.25, roughness: 0.5,
    });
    mat.emissiveMap = mat.map;
    const m = new THREE.Mesh(geo, mat);
    m.name = 'archSigns';
    m.castShadow = false;
    add(m);
  });

  guard('stanchions', () => buildStanchions(brass, rope));
  guard('benches', () => {
    for (const m of buildBenches(materials)) add(m);
  });

  const emit = (b: GeoBag, mat: THREE.Material, name: string): void => {
    const g = b.merge();
    if (!g) return;
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    add(mesh);
  };
  emit(brass, brassMat, 'propsBrass');
  emit(wood, materials.get('wood'), 'propsWood');
  emit(dark, darkMat, 'propsDarkMarble');
  emit(col, colMat, 'propsMarble');
  emit(iron, materials.get('castIron'), 'propsIron');
  emit(rope, ropeMat, 'propsRope');

  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    let tris = 0;
    let calls = 0;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      tris += t * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
      calls++;
    });
    console.log(`[props] draw calls ${calls}, triangles ${Math.round(tris)}`);
  }

  return {
    name: 'props',
    object: root,
    update(f: FrameInfo): void {
      for (const u of updaters) u(f);
    },
  };
}
