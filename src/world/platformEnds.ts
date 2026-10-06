import * as THREE from 'three';
import type { BuildContext, FrameInfo, WorldModule } from '../core/types';
import { buildBuildings } from './platformEnds/buildings';
import { buildEnds } from './platformEnds/ends';
import { buildLuggage } from './platformEnds/luggage';
import { buildSignals } from './platformEnds/signals';
import { makeBags, type Bag } from './platformEnds/kit';
import { brickTexture, enamelAtlas, slateTexture } from './platformEnds/textures';
import { buildTrackside } from './platformEnds/trackside';

/**
 * Phase 5A: realistic platform ends. Staff ramps with locked gates, end railings + enamel plates, end lamps,
 * starter signals (red/green from trainControl), driver's dispatch mirrors, STOP boards, signal box, lamp hut and
 * platform luggage. 11 draw calls (one per material), no real lights.
 */
export async function buildPlatformEnds(ctx: BuildContext): Promise<WorldModule> {
  const object = new THREE.Group();
  object.name = 'platformEnds';
  const b = makeBags();
  const atlas = enamelAtlas();

  const signals = buildSignals(b); // first: its lenses open the lens buffer
  buildEnds(b, atlas);
  buildTrackside(b, atlas);
  buildBuildings(b, atlas);
  buildLuggage(b);

  // ------------------------------------------------------------------------------------------ materials
  // Painted iron / timber: plain PBR so the vertex colours read as true paint (cream, black, white bands).
  const paint = new THREE.MeshStandardMaterial({ name: 'platformEndsPaint', vertexColors: true, roughness: 0.62, metalness: 0.15, side: THREE.DoubleSide });

  const stone = ctx.materials.get('platformStone').clone();
  stone.name = 'platformEndsStone';
  stone.color.multiply(new THREE.Color(0xd2c6b0));

  const brick = new THREE.MeshStandardMaterial({ name: 'platformEndsBrick', map: brickTexture(), roughness: 0.92, metalness: 0 });
  const slate = new THREE.MeshStandardMaterial({ name: 'platformEndsSlate', map: slateTexture(), roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const enamel = new THREE.MeshStandardMaterial({ name: 'platformEndsEnamel', map: atlas.tex, roughness: 0.26, metalness: 0.1, emissive: 0xffffff, emissiveMap: atlas.tex, emissiveIntensity: 0.14 });
  const glow = new THREE.MeshBasicMaterial({ name: 'platformEndsGlow', vertexColors: true, side: THREE.DoubleSide });
  const lensMat = new THREE.MeshBasicMaterial({ name: 'platformEndsLens', vertexColors: true });
  const glass = ctx.materials.get('glass').clone();
  glass.name = 'platformEndsGlass';
  glass.side = THREE.DoubleSide;
  glass.color.set(0xf4f8f6);
  glass.opacity = 0.1;
  glass.envMapIntensity = 0.5;
  const goods = new THREE.MeshStandardMaterial({ name: 'platformEndsGoods', vertexColors: true, roughness: 0.72, metalness: 0 });
  const mirror = new THREE.MeshStandardMaterial({ name: 'platformEndsMirror', color: 0xe9eef2, metalness: 1, roughness: 0.03, envMapIntensity: 2.4 });

  const add = (bag: Bag, mat: THREE.Material, tile: number | undefined, cast: boolean, name: string): THREE.Mesh => {
    const m = new THREE.Mesh(bag.build(ctx, tile), mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = cast;
    m.matrixAutoUpdate = false;
    object.add(m);
    return m;
  };
  add(b.paint, paint, undefined, true, 'paint');
  add(b.brass, ctx.materials.get('brass'), ctx.materials.tileSize('brass'), true, 'brass');
  add(b.stone, stone, ctx.materials.tileSize('platformStone'), true, 'stone');
  add(b.brick, brick, 0.5, true, 'brick');
  add(b.slate, slate, 0.64, true, 'slate');
  add(b.enamel, enamel, undefined, false, 'enamel').receiveShadow = true;
  add(b.glow, glow, undefined, false, 'interiorGlow');
  const glassMesh = add(b.glass, glass, undefined, false, 'glass');
  glassMesh.renderOrder = 2;
  add(b.goods, goods, undefined, true, 'luggage');
  const lensMesh = add(b.lens, lensMat, undefined, false, 'lenses');
  add(b.mirror, mirror, undefined, false, 'mirrors');

  const tick = signals.bind(lensMesh.geometry);
  return {
    name: 'platformEnds',
    object,
    update(f: FrameInfo) {
      tick(f.dt);
    },
  };
}
