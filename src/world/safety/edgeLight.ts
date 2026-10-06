import * as THREE from 'three';
import { ISLANDS, PLATFORM_SAFETY as PS, TRACKS } from '../../layout';

/** x of the glowing strip centre for each track edge (index = TRACKS index). */
export function edgeLightX(k: number): number {
  const tr = TRACKS[k]!;
  const isl = ISLANDS.find((i) => i.id === tr.island)!;
  return tr.side === 'west' ? isl.xMin + PS.edgeLightInset : isl.xMax - PS.edgeLightInset;
}

const VERT = /* glsl */ `
#include <fog_pars_vertex>
uniform vec4 uCol[6];
attribute float aEdge;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = uv;
  vCol = uCol[int(aEdge + 0.5)];
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float c = abs(vUv.x - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.14, 0.24, c);
  float halo = pow(max(0.0, 1.0 - c), 2.2);
  vec3 rgb = vCol.rgb * (core + halo * 0.45 * vCol.a);
  float a = clamp(core + halo * 0.5 * vCol.a, 0.0, 1.0);
  gl_FragColor = vec4(rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface EdgeLight {
  mesh: THREE.Mesh;
  uCol: THREE.Vector4[];
}

/** One mesh (one draw call) holding the six edge strips; per-edge colour/intensity lives in a uniform array. */
export function buildEdgeLight(): EdgeLight {
  const n = TRACKS.length;
  const pos = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const edge = new Float32Array(n * 4);
  const idx: number[] = [];
  const W = 0.5;
  const y = 0.012;
  for (let k = 0; k < n; k++) {
    const x = edgeLightX(k);
    const v = [
      [x - W / 2, PS.edgeLightZMin, 0, 0],
      [x + W / 2, PS.edgeLightZMin, 1, 0],
      [x - W / 2, PS.edgeLightZMax, 0, 1],
      [x + W / 2, PS.edgeLightZMax, 1, 1],
    ] as const;
    v.forEach(([vx, vz, u, w], i) => {
      pos.set([vx, y, vz], (k * 4 + i) * 3);
      uv.set([u, w], (k * 4 + i) * 2);
      edge[k * 4 + i] = k;
    });
    const b = k * 4;
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const uCol = Array.from({ length: n }, () => new THREE.Vector4(1, 0.6, 0.25, 0.3));
  const mat = new THREE.ShaderMaterial({
    name: 'platformEdgeLight',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: uCol } }]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'platformEdgeLight';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  mesh.userData.noShadow = true;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return { mesh, uCol };
}
