// Metro trains view: a pool of <= 4 train rigs placed on their tracks from the timetable state (P4-2).
// Never allocates per frame. The controller adds `pbrMaterials` (only) to metro.userData.deepMaterials so the deep env map applies.
import * as THREE from 'three';
import { METRO_TRAIN } from '../../layoutMetro';
import { createSharedMaterials, createTrainRig, LINE_COLORS, type TrainRig } from '../../metro/trainModel';
import type { TrainState } from '../../metro/timetable';
import { trackOf as defaultTrackOf, type LineId, type MetroTrack } from '../../metro/tracks';
import type { MetroMaterials } from './materials';

export { LINE_COLORS };

export interface TrainsViewDeps {
  trackOf?: (line: LineId, track: 0 | 1) => MetroTrack;
}
export interface TrainsView {
  object: THREE.Group;
  /** PBR materials of the pooled trains (body, glass, doors, upholstery, champagne, underframe, stripe): the ones that should
   *  receive the deep env map. Controller: add these to metro.userData.deepMaterials and set their envMap. */
  pbrMaterials: THREE.MeshStandardMaterial[];
  /** Every material used (also the unlit MeshBasic lights/card, which ignore envMap). For disposal only. */
  allMaterials: THREE.Material[];
  update(trains: readonly TrainState[], cameraPos: THREE.Vector3): void;
}

export const POOL_SIZE = 4;
/** Beyond this distance (m) from the camera to the train the interior detail is dropped for an emissive card. */
export const INTERIOR_LOD_DIST = 120;
const LOD_HYSTERESIS = 8;
const HALF_LEN = METRO_TRAIN.length / 2;

export function createTrainsView(materials: MetroMaterials | null, deps: TrainsViewDeps = {}): TrainsView {
  const trackOf = deps.trackOf ?? defaultTrackOf;
  const shared = createSharedMaterials(materials?.deep.champagne);
  const object = new THREE.Group();
  object.name = 'metroTrains';
  const rigs: TrainRig[] = [];
  const slotId: number[] = [];
  const near: boolean[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const rig = createTrainRig(shared, 'vesper');
    rig.group.visible = false;
    object.add(rig.group);
    rigs.push(rig); slotId.push(-1); near.push(true);
  }
  const allMaterials = Array.from(new Set(rigs.flatMap((r) => r.materials)));
  const pbrMaterials = allMaterials.filter((m): m is THREE.MeshStandardMaterial => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true);
  const seen: boolean[] = [false, false, false, false];
  const slotLine: Array<LineId | ''> = ['', '', '', ''];
  const v = new THREE.Vector3();

  function update(trains: readonly TrainState[], cameraPos: THREE.Vector3): void {
    // 1. keep slots whose train is still present; free every other slot BEFORE assigning newcomers (no one-frame pop-in)
    seen[0] = seen[1] = seen[2] = seen[3] = false;
    for (let k = 0; k < trains.length; k++) {
      const t = trains[k]!;
      if (t.phase === 'gone') continue;
      for (let i = 0; i < POOL_SIZE; i++) if (slotId[i] === t.id) { seen[i] = true; break; }
    }
    for (let i = 0; i < POOL_SIZE; i++) if (!seen[i] && slotId[i] !== -1) { slotId[i] = -1; rigs[i]!.group.visible = false; }
    // 2. place every train (assigning free slots to newcomers)
    for (let k = 0; k < trains.length; k++) {
      const t = trains[k]!;
      if (t.phase === 'gone') continue;
      let slot = -1;
      for (let i = 0; i < POOL_SIZE; i++) if (slotId[i] === t.id) { slot = i; break; }
      if (slot < 0) {
        for (let i = 0; i < POOL_SIZE; i++) if (slotId[i] === -1) { slot = i; break; }
        if (slot < 0) continue;                       // pool exhausted (timetable caps at 4): ignore extras
        slotId[slot] = t.id;
        near[slot] = true;
      }
      const rig = rigs[slot]!;
      if (slotLine[slot] !== t.line) { rig.setLine(t.line); slotLine[slot] = t.line; }
      const track = trackOf(t.line, t.track);
      const px = track.origin[0] + track.dir[0] * t.s, pz = track.origin[1] + track.dir[1] * t.s;
      rig.group.position.set(px, track.railY, pz);
      rig.group.rotation.y = Math.atan2(-track.dir[1], track.dir[0]);
      rig.group.visible = true;
      rig.setDoors(t.doors01);
      // distance from the camera to the nearest point of the 81.5 m consist
      const along = THREE.MathUtils.clamp((cameraPos.x - px) * track.dir[0] + (cameraPos.z - pz) * track.dir[1], -HALF_LEN, HALF_LEN);
      v.set(px + track.dir[0] * along, track.railY, pz + track.dir[1] * along);
      const d = v.distanceTo(cameraPos);
      near[slot] = near[slot] ? d < INTERIOR_LOD_DIST + LOD_HYSTERESIS : d < INTERIOR_LOD_DIST;
      rig.setInteriorDetail(near[slot]!);
    }
  }
  return { object, pbrMaterials, allMaterials, update };
}
