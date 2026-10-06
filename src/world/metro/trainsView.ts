// Metro trains view: a pool of <= 4 train rigs placed on their tracks from the timetable state (P4-2).
// Never allocates per frame. The controller adds `materials` to metro.userData.deepMaterials (deep env map).
import * as THREE from 'three';
import { createSharedMaterials, createTrainRig, LINE_COLORS, type TrainRig } from '../../metro/trainModel';
import type { TrainState } from '../../metro/timetable';
import { trackOf as defaultTrackOf, trackPoint as defaultTrackPoint, type LineId, type MetroTrack } from '../../metro/tracks';
import type { MetroMaterials } from './materials';

export { LINE_COLORS };

export interface TrainsViewDeps {
  trackOf?: (line: LineId, track: 0 | 1) => MetroTrack;
  trackPoint?: (t: MetroTrack, s: number) => [number, number, number];
}
export interface TrainsView {
  object: THREE.Group;
  /** Every material used by the pooled trains (add to metro.userData.deepMaterials). */
  materials: THREE.MeshStandardMaterial[];
  update(trains: readonly TrainState[], cameraPos: THREE.Vector3): void;
}

export const POOL_SIZE = 4;
/** Beyond this distance (m) from the camera to the train the interior detail is dropped for an emissive card. */
export const INTERIOR_LOD_DIST = 120;
const LOD_HYSTERESIS = 8;
const HALF_LEN = 40.75;

export function createTrainsView(materials: MetroMaterials | null, deps: TrainsViewDeps = {}): TrainsView {
  const trackOf = deps.trackOf ?? defaultTrackOf;
  const trackPoint = deps.trackPoint ?? defaultTrackPoint;
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
  const mats = Array.from(new Set(rigs.flatMap((r) => r.materials))) as THREE.MeshStandardMaterial[];
  const seen: boolean[] = [false, false, false, false];
  const slotLine: Array<LineId | ''> = ['', '', '', ''];
  const v = new THREE.Vector3();

  function update(trains: readonly TrainState[], cameraPos: THREE.Vector3): void {
    seen[0] = seen[1] = seen[2] = seen[3] = false;
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
      seen[slot] = true;
      const rig = rigs[slot]!;
      if (slotLine[slot] !== t.line) { rig.setLine(t.line); slotLine[slot] = t.line; }
      const track = trackOf(t.line, t.track);
      const p = trackPoint(track, t.s);
      rig.group.position.set(p[0], p[1], p[2]);
      rig.group.rotation.y = Math.atan2(-track.dir[1], track.dir[0]);
      rig.group.visible = true;
      rig.setDoors(t.doors01);
      // distance from the camera to the nearest point of the 81.5 m consist
      const dx = cameraPos.x - p[0], dz = cameraPos.z - p[2];
      const along = THREE.MathUtils.clamp(dx * track.dir[0] + dz * track.dir[1], -HALF_LEN, HALF_LEN);
      v.set(p[0] + track.dir[0] * along, p[1], p[2] + track.dir[1] * along);
      const d = v.distanceTo(cameraPos);
      const want = near[slot] ? d < INTERIOR_LOD_DIST + LOD_HYSTERESIS : d < INTERIOR_LOD_DIST;
      if (want !== near[slot]) { near[slot] = want; }
      rig.setInteriorDetail(near[slot]!);
    }
    for (let i = 0; i < POOL_SIZE; i++) if (!seen[i] && slotId[i] !== -1) { slotId[i] = -1; rigs[i]!.group.visible = false; }
  }
  return { object, materials: mats, update };
}
