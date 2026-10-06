import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { BOOKING_OFFICE, CONCIERGE, LOUNGE_ROOM } from '../layout';
import { Bucket, countStats } from './hotel/kit';
import { addPiece, type Buckets } from './hotel/furniture';
import { buildBooking } from './hotel/booking';
import { buildConcierge } from './hotel/concierge';
import { rugGeometry, runnerGeometry } from './hotel/carpets';
import { BALCONY_PIECES, BALCONY_RUGS, HALL_PIECES, HALL_RUGS, LOUNGE_RUGS } from './hotel/layoutData';
import { buildLounge } from './hotel/lounge';
import { buildHallDado } from './hotel/hallDado';
import { makeBoothTexture, makeCarpetTexture, makeDamaskTexture, makeEtchedGlassTexture, makeFrondTexture, makeLeatherTexture, makePaperAtlas, makeRugAtlas, makeRunnerTexture } from './hotel/textures';

/**
 * Hotel: first-class lounge on the balcony, booking office + concierge in the under-balcony frontage, hall restyle
 * (carpet runners, stair carpet, aisle lounges). Everything is merged per material (~17 draw calls) and driven by
 * src/world/hotel/layoutData.ts, which also feeds HOTEL_OBSTACLES.
 */
export async function buildHotel(ctx: BuildContext): Promise<WorldModule> {
  const { materials: lib, renderer } = ctx;
  const root = new THREE.Group();
  root.name = 'hotel';

  const guard = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      console.error(`[hotel] ${name} failed`, e);
    }
  };

  // --- textures ----------------------------------------------------------------------------
  const atlas = makePaperAtlas(renderer);
  const rugAtlas = makeRugAtlas(renderer);
  const runnerTex = makeRunnerTexture(renderer);
  const leatherTex = makeLeatherTexture(renderer);
  const boothTex = makeBoothTexture(renderer);
  const frondTex = makeFrondTexture(renderer);

  // --- materials (shared; one per bucket) ------------------------------------------------------
  const darkMat = lib.get('darkMarble').clone();
  darkMat.roughness = 0.24;
  darkMat.envMapIntensity = 1.2;
  const marbleMat = lib.get('columnMarble').clone();
  if (marbleMat.normalScale) marbleMat.normalScale.set(0.1, 0.1);
  marbleMat.roughness = 0.38;
  const leatherMat = new THREE.MeshStandardMaterial({
    name: 'hotelLeather', map: leatherTex, roughnessMap: leatherTex, vertexColors: true, roughness: 0.46, metalness: 0.0, envMapIntensity: 1.1,
  });
  const silverMat = new THREE.MeshStandardMaterial({ name: 'hotelSilver', color: 0xe4e4e8, metalness: 1, roughness: 0.2, envMapIntensity: 1.3 });
  const shadeMat = new THREE.MeshStandardMaterial({
    name: 'silkShade', color: 0xf3dcae, emissive: new THREE.Color(0xffb866), emissiveIntensity: 1.7, roughness: 0.85, side: THREE.DoubleSide,
  });
  const glowMat = new THREE.MeshBasicMaterial({ name: 'bulb', color: new THREE.Color().setRGB(4.2, 3.0, 1.6) });
  const crystalMat = new THREE.MeshStandardMaterial({
    name: 'amberCrystal', color: 0xc98a3a, transparent: true, opacity: 0.66, roughness: 0.05, metalness: 0.1, envMapIntensity: 2.0, depthWrite: false,
  });
  const greenGlassMat = new THREE.MeshStandardMaterial({
    name: 'bankerGreen', color: 0x0e6b3e, emissive: new THREE.Color(0x0f7a45), emissiveIntensity: 0.9, roughness: 0.15, side: THREE.DoubleSide,
  });
  const paperMat = new THREE.MeshStandardMaterial({
    name: 'hotelPaper', map: atlas.texture, emissiveMap: atlas.texture, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.22, roughness: 0.55, metalness: 0,
  });
  const frondMat = new THREE.MeshStandardMaterial({ name: 'frond', map: frondTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.62, color: 0xdfe8cf });
  const boothMat = new THREE.MeshStandardMaterial({
    name: 'boothInterior', color: 0x2a1a0c, map: boothTex, emissiveMap: boothTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.95, roughness: 0.9, side: THREE.BackSide,
  });
  const mirrorMat = new THREE.MeshStandardMaterial({ name: 'hotelMirror', color: 0x6a6a6e, metalness: 1, roughness: 0.3, envMapIntensity: 1.4 });
  const rugMat = new THREE.MeshStandardMaterial({
    name: 'rugs', map: rugAtlas.texture, alphaTest: 0.5, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const runnerMat = new THREE.MeshStandardMaterial({
    name: 'runner', map: runnerTex, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });

  // --- the lounge's own materials: they receive the lounge-specific environment capture (lighting.finalize) -----------
  const loungeWood = lib.get('wood').clone();
  loungeWood.roughness = 0.62;
  loungeWood.color.set(0xe9c9a4);
  loungeWood.envMapIntensity = 1.0;
  const loungeBrass = lib.get('brass').clone();
  loungeBrass.envMapIntensity = 1.5;
  const loungeLeather = leatherMat.clone();
  loungeLeather.roughness = 0.36;
  loungeLeather.envMapIntensity = 1.5;
  const loungePlaster = new THREE.MeshStandardMaterial({ name: 'loungeSilk', map: makeDamaskTexture(renderer), color: 0xd9cdb6, roughness: 0.78, metalness: 0, envMapIntensity: 0.9, emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0.0 });
  loungePlaster.emissiveMap = loungePlaster.map;
  loungePlaster.emissiveIntensity = 0.05;
  const loungePlain = new THREE.MeshStandardMaterial({ name: 'loungePlaster', color: 0xefe3c8, roughness: 0.92, metalness: 0, envMapIntensity: 0.8, emissive: new THREE.Color(0xe8c08a), emissiveIntensity: 0.12 });
  const loungeCarpet = new THREE.MeshStandardMaterial({
    name: 'loungeCarpet', map: makeCarpetTexture(renderer), color: 0xffffff, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const loungeFabric = new THREE.MeshPhysicalMaterial({
    name: 'loungeDrapes', vertexColors: true, roughness: 0.82, metalness: 0, sheen: 1, sheenColor: new THREE.Color(0xd9867a), sheenRoughness: 0.45, side: THREE.DoubleSide, envMapIntensity: 0.8,
  });
  const loungeGlass = new THREE.MeshStandardMaterial({
    name: 'loungeGlass', color: 0xe6eef2, transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide,
  });
  const doorGlass = new THREE.MeshStandardMaterial({
    name: 'etchedGlass', map: makeEtchedGlassTexture(renderer), transparent: true, roughness: 0.3, metalness: 0, envMapIntensity: 1.3, depthWrite: false, side: THREE.DoubleSide,
  });
  const loungeMirror = new THREE.MeshStandardMaterial({ name: 'loungeMirror', color: 0xa89f8a, metalness: 1, roughness: 0.1, envMapIntensity: 1.1 });
  const loungeCrystal = new THREE.MeshStandardMaterial({
    name: 'loungeCrystal', color: 0xfff1d6, emissive: new THREE.Color(0xffc98a), emissiveIntensity: 0.55, transparent: true, opacity: 0.8, roughness: 0.04, metalness: 0.15, envMapIntensity: 2.6, depthWrite: false,
  });
  const loungeMats = { crystal: loungeCrystal, mirror: loungeMirror, wood: loungeWood, brass: loungeBrass, leather: loungeLeather, plaster: loungePlaster, plain: loungePlain, carpet: loungeCarpet, fabric: loungeFabric, glass: loungeGlass, doorGlass };

  // --- geometry buckets ----------------------------------------------------------------------
  const b: Buckets = {
    leather: new Bucket(lib, 0.6, true),
    wood: new Bucket(lib, lib.tileSize('wood')),
    brass: new Bucket(lib, lib.tileSize('brass')),
    dark: new Bucket(lib, lib.tileSize('darkMarble')),
    marble: new Bucket(lib, lib.tileSize('columnMarble')),
    silver: new Bucket(null),
    shade: new Bucket(null),
    glow: new Bucket(null),
    crystal: new Bucket(null),
    greenGlass: new Bucket(null),
    paper: new Bucket(null),
    fronds: new Bucket(null),
    iron: new Bucket(lib, lib.tileSize('castIron')),
    booth: new Bucket(null),
    mirror: new Bucket(null),
  };

  guard('booking', () => buildBooking(b, atlas));
  guard('concierge', () => buildConcierge(b, atlas));
  guard('furniture', () => {
    const only = new URLSearchParams(window.location.search).get('hk');
    for (const p of [...BALCONY_PIECES, ...HALL_PIECES]) if (!only || only.split(',').includes(p.kind)) addPiece(b, atlas, p);
  });
  guard('hall dado', () => buildHallDado(b));
  let lounge: ReturnType<typeof buildLounge> | null = null;
  guard('lounge', () => {
    lounge = buildLounge({ lib, hall: b, atlas, mats: loungeMats, stoneMat: lib.get('wallStone') });
    lounge.group.userData.loungeMaterials = Object.values(loungeMats);
    root.add(lounge.group);
  });
  guard('lounge plaque', () => {
    // small brass plaque on the dark-marble skirting, hall side, just right of the doorway architrave
    const r = atlas.cell.lounge;
    if (!r) return;
    const w = 0.72;
    const h = 0.18;
    const cx = 3.6;
    const cy = LOUNGE_ROOM.floorY + 0.5;
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
    g.translate(cx, cy, 0.318);
    b.paper.add(g);
    const t = 0.02;
    for (const [x0, y0, x1, y1] of [[cx - w / 2 - t, cy - h / 2 - t, cx + w / 2 + t, cy - h / 2], [cx - w / 2 - t, cy + h / 2, cx + w / 2 + t, cy + h / 2 + t], [cx - w / 2 - t, cy - h / 2, cx - w / 2, cy + h / 2], [cx + w / 2, cy - h / 2, cx + w / 2 + t, cy + h / 2]] as const) {
      b.brass.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.014).translate((x0 + x1) / 2, (y0 + y1) / 2, 0.318));
    }
  });

  // --- emit meshes ---------------------------------------------------------------------------
  const emit = (bk: Bucket, mat: THREE.Material, name: string, shadow: boolean): void => {
    const g = bk.merge();
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = shadow;
    m.receiveShadow = true;
    root.add(m);
  };
  emit(b.leather, leatherMat, 'hotelLeather', true);
  emit(b.wood, lib.get('wood'), 'hotelWalnut', true);
  emit(b.brass, lib.get('brass'), 'hotelBrass', true);
  emit(b.dark, darkMat, 'hotelDarkMarble', true);
  emit(b.marble, marbleMat, 'hotelMarble', true);
  emit(b.silver, silverMat, 'hotelSilver', true);
  emit(b.shade, shadeMat, 'hotelShades', false);
  emit(b.glow, glowMat, 'hotelBulbs', false);
  emit(b.crystal, crystalMat, 'hotelCrystal', false);
  emit(b.greenGlass, greenGlassMat, 'hotelBankerShades', false);
  emit(b.paper, paperMat, 'hotelPaper', false);
  emit(b.fronds, frondMat, 'hotelFronds', false);
  emit(b.iron, lib.get('castIron'), 'hotelIron', true);
  emit(b.booth, boothMat, 'hotelBooths', false);
  emit(b.mirror, mirrorMat, 'hotelMirrors', false);

  guard('carpets', () => {
    const rugs = new THREE.Mesh(rugGeometry([...BALCONY_RUGS, ...HALL_RUGS, ...LOUNGE_RUGS], rugAtlas), rugMat);
    rugs.name = 'hotelRugs';
    rugs.receiveShadow = true;
    root.add(rugs);
    const run = new THREE.Mesh(runnerGeometry(), runnerMat);
    run.name = 'hotelRunners';
    run.receiveShadow = true;
    root.add(run);
  });

  // --- light: two small non-shadow warm points so the shaded frontages glow (the lounge is lit by sun + emissive lamps) ---
  const bookingLight = new THREE.PointLight(0xffc27a, 9, 11, 1.6);
  bookingLight.name = 'bookingGlow';
  bookingLight.position.set(BOOKING_OFFICE.windowCentersX[1], 3.1, BOOKING_OFFICE.faceZ + 2.4);
  const conciergeLight = new THREE.PointLight(0xffc27a, 9, 11, 1.6);
  conciergeLight.name = 'conciergeGlow';
  conciergeLight.position.set(CONCIERGE.interact.centerX, 3.1, CONCIERGE.faceZ + 3.2);
  root.add(bookingLight, conciergeLight);

  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    const s = countStats(root);
    console.log(`[hotel] draw calls ${s.calls} (x2 with shadow pass), triangles ${s.tris}`);
  }
  return { name: 'hotel', object: root, update: (f) => {
      if (!lounge) return;
      // the lounge is sealed and sits behind the hall's south wall: skip it (main + shadow pass) once the camera is far away
      lounge.group.visible = f.camera.position.z < 40;
      lounge.update(f);
    },
  };
}
