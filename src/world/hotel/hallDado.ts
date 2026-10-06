import { box, rbox } from './kit';
import type { Buckets } from './furniture';
import { PILASTER_Z } from '../concourse/frames';
import { SHOPS } from '../../layout';

/**
 * Walnut wainscot along the hall's side walls (the "a bit warmer" touch): raised-panel cladding wrapped over the stone
 * plinth (y 0 .. 1.2) with a brass-capped rail, in every pilaster span. Not across the booking / concierge frontages
 * (those are behind the balcony at z = 8) and it stops short of the pilasters' bases. Wall x = +-30, hall to the inside.
 */

const SHOP_BAYS: readonly number[] = SHOPS.units.map((u) => u.bayZ);
const SPANS: Array<[number, number]> = (() => {
  const edges = [...PILASTER_Z];
  const out: Array<[number, number]> = [[9.4, edges[0]! - 1.05]];
  for (let i = 0; i + 1 < edges.length; i++) out.push([edges[i]! + 1.05, edges[i + 1]! - 1.05]);
  out.push([edges[edges.length - 1]! + 1.05, 98.6]);
  return out;
})();

export function buildHallDado(b: Buckets): void {
  for (const s of [-1, 1] as const) {
    /** world x of depth w from the wall plane (hall side). */
    const xs = (w: number): number => s * 30 - s * w;
    const bx = (z0: number, y0: number, w0: number, z1: number, y1: number, w1: number): void => void b.wood.add(box(Math.min(xs(w0), xs(w1)), y0, z0, Math.max(xs(w0), xs(w1)), y1, z1));
    for (const [z0, z1] of SPANS) {
      if (SHOP_BAYS.some((c) => c > z0 && c < z1)) continue; // the Phase 5B shopfronts replace the wainscot here
      // backing + skirting
      b.dark.add(box(Math.min(xs(0.3), xs(0.42)), 0, z0, Math.max(xs(0.3), xs(0.42)), 0.1, z1));
      bx(z0, 0.1, 0.3, z1, 1.2, 0.38);
      // rails and stiles
      bx(z0, 0.1, 0.38, z1, 0.22, 0.41);
      bx(z0, 1.0, 0.38, z1, 1.2, 0.41);
      const n = Math.max(1, Math.round((z1 - z0) / 1.0));
      const pitch = (z1 - z0) / n;
      for (let i = 0; i <= n; i++) {
        const z = z0 + i * pitch;
        bx(Math.max(z0, z - 0.05), 0.22, 0.38, Math.min(z1, z + 0.05), 1.0, 0.41);
      }
      for (let i = 0; i < n; i++) {
        const a = z0 + i * pitch + 0.08;
        const c = z0 + (i + 1) * pitch - 0.08;
        bx(a, 0.27, 0.38, c, 0.95, 0.44);
        // brass fillet around the panel
        const t = 0.007;
        for (const [fz0, fy0, fz1, fy1] of [[a + 0.03, 0.3, c - 0.03, 0.3 + t], [a + 0.03, 0.92 - t, c - 0.03, 0.92], [a + 0.03, 0.3, a + 0.03 + t, 0.92], [c - 0.03 - t, 0.3, c - 0.03, 0.92]] as const) {
          b.brass.add(box(Math.min(xs(0.44), xs(0.448)), fy0, fz0, Math.max(xs(0.44), xs(0.448)), fy1, fz1));
        }
      }
      // cap rail with a brass strip
      b.wood.add(rbox(Math.min(xs(0.3), xs(0.5)), 1.2, z0, Math.max(xs(0.3), xs(0.5)), 1.26, z1, 0.012, 2));
      b.brass.add(box(Math.min(xs(0.3), xs(0.5)), 1.258, z0, Math.max(xs(0.3), xs(0.5)), 1.266, z1));
    }
  }
}
