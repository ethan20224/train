import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { vnoise } from '../../metro/forestGround';
import type { StoneInst } from '../../metro/streamPlan';
import { patchForest } from './forest';
import { STREAM_GLSL, followInstance } from './streamWater';
import { WF_GLSL } from './waterfallRock';

/**
 * Every stone of the stream and pond as ONE InstancedMesh: bank stones, awash bed stones, riffle clusters, shoreline pebbles,
 * the pond rim and the stepping stones. One lumpy low-poly boulder (80 triangles, smooth normals) reshaped per instance by a
 * non-uniform scale, yaw and tilt; per-instance tint. The shader adds what makes them wet and mossy: a dark glossy band at and below
 * the waterline (per-instance level), moss on up-facing surfaces above it, a fine bump, and (via patchForest) the forest ground
 * mist and the night glow speckles.
 */

function boulderGeometry(): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + 0.2 * (vnoise(x * 1.7 + 11.3, z * 1.7 + y * 1.3) - 0.5) * 2 + 0.08 * (vnoise(x * 4.1, y * 4.1 + z * 3.3) - 0.5) * 2;
    p.setXYZ(i, x * d, y * d, z * d);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export interface StreamStonesBuild { mesh: THREE.InstancedMesh; material: THREE.MeshStandardMaterial; triangles: number }

export function buildStreamStones(stones: readonly StoneInst[]): StreamStonesBuild {
  const geo = boulderGeometry();
  const wetY = new Float32Array(stones.length);
  const mat = new THREE.MeshStandardMaterial({ name: 'metroDeepStreamStone', color: 0xffffff, roughness: 0.86, metalness: 0, envMapIntensity: 0.85 });
  patchForest(mat, 'streamStones', { glow: true });
  const base = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r);
    followInstance(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWetY;\nvarying float vWetY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWetY = aWetY;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vWetY;\n${WF_GLSL}\n${STREAM_GLSL}`)
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
float stBump = wfNoise(vForestWorld.xz * 14.0 + vForestWorld.y * 9.0) * 0.6 + wfNoise(vForestWorld.xz * 37.0 + vForestWorld.y * 23.0) * 0.4;
normal = strBump(-vViewPosition, normal, dFdx(stBump) * 0.011, dFdy(stBump) * 0.011, faceDirection);`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
{
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float wetK = 1.0 - smoothstep(vWetY - 0.01, vWetY + 0.12, vForestWorld.y);
  float nz = wfNoise(vForestWorld.xz * 8.0 + vForestWorld.y * 5.0);
  float mossK = smoothstep(0.4, 0.88, nW.y) * smoothstep(0.2, 0.7, nz + 0.45 * nW.y) * (1.0 - 0.85 * wetK);
  diffuseColor.rgb *= 0.82 + 0.36 * nz;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.15, 0.04) * (0.7 + 0.6 * nz), mossK * 0.88);
  diffuseColor.rgb *= 1.0 - 0.5 * wetK;
  roughnessFactor = mix(roughnessFactor, 0.2, wetK);
}`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, stones.length);
  mesh.name = 'streamStones';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qt = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < stones.length; i++) {
    const t = stones[i]!;
    q.setFromAxisAngle(up, t.yaw);
    ax.set(Math.cos(t.tiltAz), 0, Math.sin(t.tiltAz));
    qt.setFromAxisAngle(ax, t.tilt);
    q.premultiply(qt);
    m.compose(p.set(t.x, t.y, t.z), q, s.set(t.sx, t.sy, t.sz));
    mesh.setMatrixAt(i, m);
    col.setRGB(t.tint[0], t.tint[1], t.tint[2]);
    mesh.setColorAt(i, col);
    wetY[i] = t.level;
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  geo.setAttribute('aWetY', new THREE.InstancedBufferAttribute(wetY, 1));
  mesh.computeBoundingSphere();
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  const tris = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3 * stones.length;
  return { mesh, material: mat, triangles: tris };
}
