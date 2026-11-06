import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '@/simulation/spatial';
import type { ShipState } from '@/simulation/types';

function hull(i: number, x: number, y: number, z: number, side: 'A' | 'B', rogue = false): ShipState {
  return {
    id: 'H-' + i,
    pos: { x, y, z },
    alive: true,
    escaped: false,
    side,
    rogue,
    radiusKm: 0.1,
  } as ShipState;
}

describe('large-fleet spatial anyWithin early exit', () => {
  it('agrees exactly with queryRadius for dense, sparse, rogue and wide-range probes', () => {
    const grid = new SpatialGrid();
    let seed = 1977;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const ships: ShipState[] = [];
    for (let i = 0; i < 600; i++) {
      const x = (random() - 0.5) * 700;
      const y = (random() - 0.5) * 150;
      const z = (random() - 0.5) * 700;
      ships.push(hull(i, x, y, z, i % 2 ? 'A' : 'B', i % 17 === 0));
    }
    ships[5].alive = false;
    ships[37].escaped = true;
    grid.rebuild(ships);

    for (let i = 0; i < 100; i++) {
      const p = { x: (random() - 0.5) * 700, y: (random() - 0.5) * 150, z: (random() - 0.5) * 700 };
      for (const radius of [0, 0.5, 2, 10, 50, 200, 2000]) {
        for (const filter of [undefined, 'A' as const, 'B' as const, ships[0], ships[1], ships[17]]) {
          expect(grid.anyWithin(p, radius, filter)).toBe(grid.queryRadius(p, radius, filter).length > 0);
        }
      }
    }
  });

  it('does not match a destroyed, escaped, or same-side-only hull', () => {
    const grid = new SpatialGrid();
    const a = hull(0, 0, 0, 0, 'A');
    const dead = hull(1, 0, 0, 0, 'B');
    dead.alive = false;
    grid.rebuild([a, dead]);
    expect(grid.anyWithin(a.pos, 5, a)).toBe(false);
    expect(grid.anyWithin(a.pos, 5)).toBe(true);
    expect(grid.anyWithin(a.pos, -1)).toBe(false);
  });
});
