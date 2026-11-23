import * as THREE from 'three';
import { OCULUS, SKY } from '../../layoutMetro';

/**
 * Airlock impostors (spec §5.2):
 * - `metroDeepImpostor` plugs the sky hole from above while the camera is in the surface zone (cool cavern sky glow).
 * - `metroSurfaceImpostor` plugs the oculus from below while the camera is in the deep zone (warm hall golden glow).
 * Toggled cleanly by DepthLook at the -16 airlock; excluded from env captures (`noCapture`) and shadows (`noShadow`).
 */

export interface MetroImpostors {
  deepImpostor: THREE.Mesh;
  surfaceImpostor: THREE.Mesh;
}

export function buildMetroImpostors(): MetroImpostors {
  const { cx, cz } = OCULUS;

  const surfaceImpostor = new THREE.Mesh(
    new THREE.CircleGeometry(OCULUS.r, 96),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 1.0), fog: false }),
  );
  surfaceImpostor.rotation.x = Math.PI / 2;
  surfaceImpostor.position.set(cx, OCULUS.slabUnderY - 0.05, cz);
  surfaceImpostor.name = 'metroSurfaceImpostor';
  surfaceImpostor.userData.noShadow = true;
  surfaceImpostor.userData.noCapture = true;

  const deepImpostor = new THREE.Mesh(
    new THREE.CircleGeometry(SKY.holeR, 96),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.7, 3.2), fog: false }),
  );
  deepImpostor.rotation.x = -Math.PI / 2;
  deepImpostor.position.set(cx, SKY.y + 0.1, cz);
  deepImpostor.name = 'metroDeepImpostor';
  deepImpostor.userData.noShadow = true;
  deepImpostor.userData.noCapture = true;

  return { deepImpostor, surfaceImpostor };
}
