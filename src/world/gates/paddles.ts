import * as THREE from 'three';

export const PADDLE_LEN = 0.5;
export const PADDLE_Y = 0.3;
const BOW = 0.05;

function outline(side: 1 | -1): THREE.Vector2[] {
  const pts: [number, number][] = [
    [0, 0.02], [0.03, 0], [0.47, 0], [0.5, 0.03], [0.5, 0.44], [0.45, 0.55], [0.34, 0.64], [0.2, 0.69], [0.03, 0.7], [0, 0.68],
  ];
  return pts.map(([x, y]) => new THREE.Vector2(side * x, y));
}

/** Curve the sheet toward local -z, growing with distance from the hinge. */
function bend(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const u = Math.abs(p.getX(i)) / PADDLE_LEN;
    p.setZ(i, p.getZ(i) - BOW * u * u);
  }
  g.computeVertexNormals();
  return g;
}

/** Brass-edged frame (hole in the middle) and the glass sheet. Hinge at the origin, extends toward `side` * x. */
export function paddleGeometry(side: 1 | -1): { frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  // outer polygon is not uniformly scaled for the hole: inset by scaling about the paddle centre
  const outer = outline(side);
  const inner = outlineInset(side);
  const shape = new THREE.Shape(outer);
  shape.holes.push(new THREE.Path(inner.reverse()));
  const frame = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false });
  frame.translate(0, 0, -0.009);
  const glass = new THREE.ShapeGeometry(new THREE.Shape(outlineInset(side)));
  return { frame: bend(frame), glass: bend(glass) };
}

function outlineInset(side: 1 | -1): THREE.Vector2[] {
  const o = outline(side);
  const c = new THREE.Vector2(side * 0.25, 0.35);
  // inset ~0.028 m by moving each vertex toward the centre
  return o.map((p) => {
    const d = p.clone().sub(c);
    const len = d.length();
    return c.clone().add(d.multiplyScalar(Math.max(0, (len - 0.03) / len)));
  });
}
