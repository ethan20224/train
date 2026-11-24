import * as THREE from 'three';
import type { MetroMaterials } from './materials';
import { buildBoardwalk } from './boardwalk';
import { buildCanopyWalk } from './canopyWalk';
import { WalkBags, createWalkMaterials } from './walkKit';

/**
 * Canopy walk + both forest boardwalks as one build: every part is merged per material, so the whole thing is 4 draw calls
 * (oak, stainless, glass, warm LED). Plans and nav share src/metro/walks.ts; coordinates live in layoutMetro.ts.
 */
export interface WalksBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  stats: { calls: number; triangles: number };
}

export function buildWalks(renderer: THREE.WebGLRenderer, kit: MetroMaterials): WalksBuild {
  const group = new THREE.Group();
  group.name = 'metroWalks';
  const bags = new WalkBags();
  buildCanopyWalk(bags);
  buildBoardwalk(bags, 1);
  buildBoardwalk(bags, -1);

  const mats = createWalkMaterials(renderer);
  let triangles = 0;
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material, name: string, noShadow = false, renderOrder = 0): void => {
    const g = bags.merge(list);
    if (!g) return;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    if (noShadow) m.userData.noShadow = true;
    if (renderOrder) m.renderOrder = renderOrder;
    group.add(m);
  };
  add(bags.timber, mats.timber, 'walksTimber');
  add(bags.metal, mats.metal, 'walksMetal');
  add(bags.glass, kit.deep.glass, 'walksGlass', true, 3);
  add(bags.led, kit.deep.emissive.coveStrip, 'walksLed', true);
  return { group, deepMaterials: [mats.timber, mats.metal], stats: { calls: group.children.length, triangles } };
}
