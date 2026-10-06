import { Frame } from './frame';

export interface CounterOpts {
  h?: number;
  fluted?: boolean;
  top?: 'dark' | 'marble';
  /** front faces +z (default); the front edge is z1 */
}

/** Walnut Deco counter: kick, panelled / fluted front, brass bands, stone top with a brass edge. Front faces +z. */
export function counter(f: Frame, x0: number, x1: number, z0: number, z1: number, o: CounterOpts = {}): void {
  const h = o.h ?? 1.0;
  f.box('dark', x0 - 0.01, 0, z0, x1 + 0.01, 0.08, z1 + 0.025);
  f.rbox('wood', x0, 0.08, z0, x1, h - 0.04, z1, 0.01);
  const n = Math.max(2, Math.round((x1 - x0) / (o.fluted ? 0.085 : 0.7)));
  const pw = (x1 - x0) / n;
  if (o.fluted) {
    for (let i = 0; i < n; i++) f.rbox('wood', x0 + i * pw + 0.012, 0.16, z1 - 0.004, x0 + (i + 1) * pw - 0.012, h - 0.14, z1 + 0.02, 0.012);
  } else {
    for (let i = 0; i < n; i++) {
      const a = x0 + i * pw + 0.05;
      const b = x0 + (i + 1) * pw - 0.05;
      f.rbox('wood', a, 0.16, z1 - 0.004, b, h - 0.14, z1 + 0.022, 0.012);
      f.frame('brass', a + 0.03, 0.2, b - 0.03, h - 0.18, z1 + 0.02, z1 + 0.026, 0.006);
    }
  }
  f.box('brass', x0, 0.1, z1 - 0.004, x1, 0.116, z1 + 0.03);
  f.box('brass', x0, h - 0.13, z1 - 0.004, x1, h - 0.114, z1 + 0.03);
  f.box(o.top ?? 'dark', x0 - 0.03, h - 0.04, z0, x1 + 0.03, h, z1 + 0.07);
  f.box('brass', x0 - 0.03, h - 0.044, z1 + 0.066, x1 + 0.03, h - 0.036, z1 + 0.074);
}

/** Wall shelf board: walnut with a brass lip, depth d, top at y. */
export function shelf(f: Frame, x0: number, x1: number, y: number, z0: number, d: number): void {
  f.box('wood', x0, y - 0.025, z0, x1, y, z0 + d);
  f.box('brass', x0, y - 0.03, z0 + d, x1, y + 0.012, z0 + d + 0.008);
}
