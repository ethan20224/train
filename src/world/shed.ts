import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { buildFurniture } from './shed/furniture';
import { buildPlatforms } from './shed/platforms';
import { buildStructure } from './shed/structure';

/** Train shed: iron-and-glass roof, arcade walls, platforms, tracks, buffers, furniture. See src/world/shed/. */
export async function buildShed(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'shed';
  root.add(buildStructure(ctx), buildPlatforms(ctx), buildFurniture(ctx));
  return { name: 'shed', object: root };
}
