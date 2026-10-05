import * as THREE from 'three';
import type { BuildContext, MaterialName, WorldModule } from '../core/types';
import { GeoBag } from './concourse/geo';
import { buildShell, type Bags } from './concourse/shell';
import { buildWindows } from './concourse/windows';
import { buildColonnade } from './concourse/colonnade';
import { buildFloor } from './concourse/floor';
import { buildBalcony } from './concourse/balcony';
import { buildChandeliers, buildSconces, buildTorcheres, type LampBags } from './concourse/fixtures';

/**
 * The concourse: hall shell, coffered barrel vault, colonnade, windows, floor, balcony, stair, light fixtures.
 * Static geometry is merged per material (a handful of draw calls); repeats are instanced.
 * Each sub-builder is isolated so one failure can never take the whole world down.
 */
export async function buildConcourse(ctx: BuildContext): Promise<WorldModule> {
  const { materials } = ctx;
  const root = new THREE.Group();
  root.name = 'concourse';

  const bag = (m: MaterialName, tile?: number): GeoBag => new GeoBag(materials, m, tile);
  const bags: Bags = {
    stone: bag('wallStone', 7.0),
    dark: bag('darkMarble'),
    col: bag('columnMarble'),
    floor: bag('floorMarble'),
    brass: bag('brass'),
    iron: bag('castIron'),
    glass: bag('glass'),
  };
  const lamps: LampBags = { brass: bags.brass, opal: bag('glass'), bulb: bag('glass') };

  const guard = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      console.error(`[concourse] ${name} failed`, e);
    }
  };

  // --- floor material: polished, subtle normal ---------------------------------------------------
  const floorMat = materials.get('floorMarble').clone();
  floorMat.roughness = 0.12;
  floorMat.envMapIntensity = 1.3;
  if (floorMat.normalScale) floorMat.normalScale.set(0.25, 0.25);
  const darkMat = materials.get('darkMarble').clone();
  darkMat.roughness = 0.26;
  // smoother cream marble for columns/balustrades: the library normal map is quite rocky for turned surfaces
  const colMat = materials.get('columnMarble').clone();
  if (colMat.normalScale) colMat.normalScale.set(0.1, 0.1);
  colMat.roughness = 0.55;
  darkMat.envMapIntensity = 1.2;
  const opalMat = new THREE.MeshStandardMaterial({
    name: 'lampOpal', color: 0xf6ead2, roughness: 0.35, emissive: new THREE.Color(0xffc27a), emissiveIntensity: 2.2,
  });
  const bulbMat = new THREE.MeshStandardMaterial({
    name: 'lampBulb', color: 0xfff0d0, roughness: 0.3, emissive: new THREE.Color(0xffb85c), emissiveIntensity: 5,
  });

  const extra: THREE.Object3D[] = [];
  guard('shell', () => {
    const r = buildShell(bags, materials.get('wallStone'), materials.get('brass'));
    if (r.coffers) { r.coffers.name = 'coffers'; extra.push(r.coffers); }
    if (r.rosettes) { r.rosettes.name = 'rosettes'; extra.push(r.rosettes); }
  });
  guard('windows', () => buildWindows(bags));
  guard('colonnade', () => {
    const r = buildColonnade(bags, materials, colMat, materials.get('wallStone'));
    r.columns.name = 'columns';
    r.pilasters.name = 'pilasters';
    extra.push(r.columns, r.pilasters);
  });
  guard('floor', () => buildFloor(bags));
  guard('balcony', () => {
    const r = buildBalcony(bags, materials, colMat);
    r.balusters.name = 'balusters';
    extra.push(r.balusters);
  });
  guard('fixtures', () => {
    buildChandeliers(lamps);
    buildSconces(lamps);
    buildTorcheres(lamps);
  });

  const emit = (b: GeoBag, mat: THREE.Material, name: string, shadow: boolean): void => {
    const g = b.merge();
    if (!g) return;
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  emit(bags.stone, materials.get('wallStone'), 'stone', true);
  emit(bags.col, colMat, 'columnMarble', true);
  emit(bags.dark, darkMat, 'darkMarble', true);
  emit(bags.floor, floorMat, 'floor', true);
  emit(bags.brass, materials.get('brass'), 'brass', true);
  emit(bags.iron, materials.get('castIron'), 'ironWork', true);
  emit(bags.glass, materials.get('glass'), 'glass', false);
  emit(lamps.opal, opalMat, 'lampOpal', false);
  emit(lamps.bulb, bulbMat, 'lampBulb', false);
  for (const o of extra) root.add(o);

  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    let tris = 0;
    let calls = 0;
    const lines: string[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      const n = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
      tris += t * n;
      calls++;
      lines.push(`${mesh.name || 'mesh'}:${Math.round(t * n)}`);
    });
    console.log(`[concourse] draw calls ${calls} (x2 with shadow pass), triangles ${Math.round(tris)} :: ${lines.join(' ')}`);
  }
  return { name: 'concourse', object: root };
}
