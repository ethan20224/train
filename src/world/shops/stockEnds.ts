import { Frame } from './frame';
import type { ShopAtlas } from './atlas';
import type { ShopId } from './layoutData';
import { bunch, clocheStand, cup } from './goods';
import { HL } from './shell';

const P = Math.PI;

/** Stocked, lit displays behind the corner (end-return) windows; they face outward along +-x_l. */
export function stockEnds(f: Frame, id: ShopId, atlas: ShopAtlas): void {
  if (id === 'conveniences') return; // the alcove's own booths and shoeshine chair show through its end windows
  for (const s of [-1, 1] as const) {
    const xs = s * (HL - 0.55);
    const yaw = s * (P / 2);
    const g = f.at(xs, 0, 0);
    // stepped display stand along the end wall, three tiers
    for (const [i, y] of [0.92, 1.4, 1.88].entries()) {
      const d = 0.55 - i * 0.12;
      g.box('wood', -d / 2, y - 0.03, 0.5, d / 2, y, 2.4);
      g.box('brass', s * (d / 2) - 0.005, y - 0.03, 0.5, s * (d / 2) + 0.005, y + 0.01, 2.4);
    }
    for (let i = 0; i < 6; i++) {
      const z = 0.65 + i * 0.3;
      for (const [t, y] of [0.92, 1.4, 1.88].entries()) {
        const x = s * (0.14 - t * 0.05);
        if (id === 'newsstand') {
          const k = (i * 5 + t * 3 + (s > 0 ? 1 : 0)) % 12;
          g.plane(atlas.cell[`cover${k}`]!, x + s * 0.12, y + 0.17, z, 0.2, 0.3, yaw, 0);
        } else if (id === 'florist') {
          if (i % 2 === 0) bunch(g, (['rose', 'lily', 'carnation'] as const)[(i / 2 + t) % 3]!, x, y, z + 0.1, 6, 0.3, 0.4, 900 + i * 7 + t * 3 + (s > 0 ? 50 : 0));
        } else if (i % 2 === 0) {
          if (t === 0) clocheStand(g, x, y, z + 0.1, 30 + i + t, true);
          else cup(g, x, y, z + 0.1, i, true);
        }
      }
    }
  }
}
