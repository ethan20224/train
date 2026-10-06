import * as THREE from 'three';

const DIR_MARKER = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';

/** lights_fragment_begin without the DirectionalLight block (balanced #if/#endif scan from its line). */
export function stripDirectionalBlock(chunk: string): string {
  const at = chunk.indexOf(DIR_MARKER);
  if (at < 0) throw new Error('sunMask: directional-light block not found (three.js chunk changed)');
  const lineStart = chunk.lastIndexOf('\n', at) + 1;
  const re = /^[ \t]*#(if|ifdef|ifndef|endif)\b.*$/gm;
  re.lastIndex = lineStart;
  let depth = 0;
  for (let m = re.exec(chunk); m; m = re.exec(chunk)) {
    if (m[1] === 'endif') {
      depth--;
      if (depth === 0) return chunk.slice(0, lineStart) + chunk.slice(m.index + m[0].length);
    } else depth++;
  }
  throw new Error('sunMask: unbalanced directional-light block');
}

/**
 * The material ignores every DirectionalLight (the void walls: they sit outside the surface sun's shadow frustum and
 * must never be lit by it; the deep sun is an emitter at the sky plane below them). Hemisphere, probe, point, spot and
 * environment lighting are kept. Light count is unchanged, so no other program recompiles.
 */
export function excludeDirectionalLight(mat: THREE.Material): void {
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      stripDirectionalBlock(THREE.ShaderChunk.lights_fragment_begin),
    );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|noDirLight`;
}
