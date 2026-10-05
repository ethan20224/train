import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { buildBridgeParts } from './footbridge/build';
import { finish, mesh, tinted, ironPaint } from './shed/common';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Ornate Victorian cast-iron footbridge across the train shed: lattice girders, glazed canopy, stairs from each island. */
export async function buildFootbridge(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'footbridge';
  const p = buildBridgeParts();
  const iron = ironPaint(ctx);
  iron.color.set(0x1e2c25);
  const wood = tinted(ctx, 'wood', 0xb89a78);
  root.add(mesh(finish(ctx, p.iron, 'castIron'), iron, true));
  root.add(mesh(finish(ctx, p.brass, 'brass'), ctx.materials.get('brass'), true));
  root.add(mesh(finish(ctx, p.wood, 'wood'), wood, true));

  const glass = ctx.materials.get('glass').clone();
  glass.name = 'bridgeGlass';
  glass.side = THREE.DoubleSide;
  glass.color.set(0xf4e3c0);
  glass.opacity = 0.28;
  const glassMesh = mesh(p.glass[0]!, glass, false, false);
  glassMesh.renderOrder = 2;
  root.add(glassMesh);

  // warm lamps: merged emissive globes
  const globe = new THREE.SphereGeometry(1, 14, 10);
  const parts = p.lamps.map((l) => {
    const g = globe.clone();
    g.scale(l.r, l.r * 1.15, l.r);
    g.translate(l.p.x, l.p.y, l.p.z);
    return g.deleteAttribute('uv') as unknown as THREE.BufferGeometry;
  });
  const lampGeo = mergeGeometries(parts.map((g) => g), false);
  if (lampGeo) {
    const lampMat = new THREE.MeshBasicMaterial({ name: 'bridgeLamp', color: new THREE.Color(1.0, 0.72, 0.38).multiplyScalar(3.2) });
    root.add(mesh(lampGeo, lampMat, false, false));
  }
  return { name: 'footbridge', object: root };
}
