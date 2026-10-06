import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { SHOPS } from '../layout';
import { Bucket, countStats } from './hotel/kit';
import { Frame, type Buckets } from './shops/frame';
import { makeShopAtlas } from './shops/atlas';
import { buildShell } from './shops/shell';
import { stockFlorist, stockNewsstand } from './shops/stockA';
import { stockCoffee, stockConveniences } from './shops/stockB';
import { stockEnds } from './shops/stockEnds';
import { buildKiosk } from './shops/kiosk';
import type { ShopId } from './shops/layoutData';

/**
 * Phase 5B: the concourse arcade (four shopfronts in the windowless side bays 38 / 62) and the cross-platform kiosk.
 * Everything is merged per material (~11 draw calls); shop-local authoring frames live in src/world/shops/*.
 * Open, lit, stocked, unattended. Footprints feed SHOP_OBSTACLES through src/world/shops/layoutData.ts.
 */
export async function buildShops(ctx: BuildContext): Promise<WorldModule> {
  const { materials: lib, renderer } = ctx;
  const root = new THREE.Group();
  root.name = 'shops';

  const atlas = makeShopAtlas(renderer);

  const darkMat = lib.get('darkMarble').clone();
  darkMat.roughness = 0.24;
  darkMat.envMapIntensity = 1.2;
  const marbleMat = lib.get('columnMarble').clone();
  if (marbleMat.normalScale) marbleMat.normalScale.set(0.1, 0.1);
  marbleMat.roughness = 0.38;
  const woodMat = lib.get('wood').clone();
  woodMat.emissive = new THREE.Color(0x7a4220);
  woodMat.emissiveIntensity = 0.8;
  const brassMat = lib.get('brass').clone();
  brassMat.emissive = new THREE.Color(0x7a5214);
  brassMat.emissiveIntensity = 0.7;
  const silverMat = new THREE.MeshStandardMaterial({ name: 'shopSilver', color: 0xe4e4e8, metalness: 1, roughness: 0.22, envMapIntensity: 1.3, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshStandardMaterial({
    name: 'shopGlass', color: 0xe6eef2, transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide,
  });
  const glowMat = new THREE.MeshBasicMaterial({ name: 'shopGlow', color: new THREE.Color().setRGB(3.6, 2.5, 1.3), vertexColors: true, toneMapped: true });
  const warmMat = new THREE.MeshStandardMaterial({
    name: 'shopWarm', vertexColors: true, roughness: 0.85, metalness: 0, emissive: new THREE.Color(0xffa45c), emissiveIntensity: 0.75, envMapIntensity: 0.7,
  });
  const goodsMat = new THREE.MeshStandardMaterial({ name: 'shopGoods', vertexColors: true, roughness: 0.52, metalness: 0, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const paintMat = new THREE.MeshStandardMaterial({ name: 'shopPaint', vertexColors: true, roughness: 0.28, metalness: 0.1, envMapIntensity: 1.3 });
  const atlasMat = new THREE.MeshStandardMaterial({
    name: 'shopAtlas', map: atlas.texture, emissiveMap: atlas.texture, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.5, roughness: 0.5, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });

  const b: Buckets = {
    wood: new Bucket(lib, lib.tileSize('wood')),
    brass: new Bucket(lib, lib.tileSize('brass')),
    dark: new Bucket(lib, lib.tileSize('darkMarble')),
    marble: new Bucket(lib, lib.tileSize('columnMarble')),
    silver: new Bucket(null),
    glass: new Bucket(null),
    glow: new Bucket(null, 1, true),
    warm: new Bucket(null, 1, true),
    goods: new Bucket(null, 1, true),
    paint: new Bucket(null, 1, true),
    atlas: new Bucket(null),
  };

  const guard = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      console.error(`[shops] ${name} failed`, e);
    }
  };

  const unitFrame = (side: 'west' | 'east', bayZ: number): Frame => {
    const m = new THREE.Matrix4();
    if (side === 'west') m.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(-30, 0, bayZ);
    else m.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(30, 0, bayZ);
    return new Frame(b, m);
  };
  const stock: Record<ShopId, (f: Frame, a: typeof atlas) => void> = {
    newsstand: stockNewsstand,
    florist: stockFlorist,
    coffee: stockCoffee,
    conveniences: stockConveniences,
  };
  for (const u of SHOPS.units) {
    const f = unitFrame(u.side, u.bayZ);
    guard(`${u.id} shell`, () => buildShell(f, u.id, atlas));
    guard(`${u.id} stock`, () => stock[u.id](f, atlas));
    guard(`${u.id} ends`, () => stockEnds(f, u.id, atlas));
  }
  guard('kiosk', () => {
    const k = SHOPS.kiosk;
    buildKiosk(new Frame(b, new THREE.Matrix4().makeTranslation((k.xMin + k.xMax) / 2, 0, (k.zMin + k.zMax) / 2)), atlas);
  });

  const emit = (bk: Bucket, mat: THREE.Material, name: string, shadow: boolean): void => {
    const g = bk.merge();
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = shadow;
    m.receiveShadow = true;
    root.add(m);
  };
  emit(b.wood, woodMat, 'shopWalnut', true);
  emit(b.brass, brassMat, 'shopBrass', true);
  emit(b.dark, darkMat, 'shopDarkMarble', true);
  emit(b.marble, marbleMat, 'shopMarble', true);
  emit(b.silver, silverMat, 'shopSilver', true);
  emit(b.goods, goodsMat, 'shopGoods', true);
  emit(b.paint, paintMat, 'shopPaint', true);
  emit(b.warm, warmMat, 'shopWarm', true);
  emit(b.atlas, atlasMat, 'shopSigns', false);
  emit(b.glow, glowMat, 'shopGlow', false);
  emit(b.glass, glassMat, 'shopGlass', false);

  const stats = countStats(root);
  root.userData.stats = stats;
  console.info(`[shops] ${stats.calls} draw calls, ${stats.tris} triangles`);
  return { name: 'shops', object: root };
}
