import * as THREE from 'three';

/**
 * Lets a vertex-coloured standard material carry emissive parts in the same mesh (saves a draw call): a vertex whose colour has a
 * component above 1.2 is rendered as an unlit HDR emitter of exactly that colour (albedo dropped); everything else is normal.
 */
export function vertexGlow(mat: THREE.MeshStandardMaterial): void {
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  {
    float vgGlow = step(1.2, max(vColor.r, max(vColor.g, vColor.b)));
    totalEmissiveRadiance += vColor.rgb * vgGlow;
    diffuseColor.rgb *= 1.0 - vgGlow;
  }`,
    );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|vertexGlow`;
  mat.vertexColors = true;
}
