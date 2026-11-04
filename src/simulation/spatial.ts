import type { Vec3 } from '@/core/vec3';
import type { ShipState, Side } from './types';

/**
 * Uniform spatial hash over the live hulls (ADOPTION_PLAN.md §21.1, §21.5; WORK_BREAKDOWN.md §1.3.8).
 *
 * Rebuilt once per tick from the simulation's ship list and queried by the
 * projectile sweep, point defence, target acquisition and the AI. Everything is
 * typed arrays with a cell-size parameter and no per-battle assumptions, so the
 * module can be reused by the extreme-scale engine later (brief §17): cells are
 * assigned in ship-index order, items inside a cell are stored in ship-index
 * order and every query returns its candidates sorted by ship index, so a query
 * yields the same candidates in the same order as a brute-force scan of the
 * ship list — the "deterministic candidate order" the plan requires.
 *
 * Filters: a `Side` selects the enemies of that side under plain two-sided
 * bookkeeping (`enemiesOf(side)` semantics); a `ShipState` selects that ship's
 * targeting set (`enemiesOfShip`: the other side plus every rogue hull, and a
 * rogue hull sees everyone else, AP §4.1). Dead and escaped hulls never match.
 * Every cell carries a mask of the sides (and rogue hulls) it holds, so a query
 * skips cells that contain only hulls its filter can never match.
 */
export const GRID_CELL_KM = 4;

export type GridFilter = Side | ShipState;

/**
 * Cells per axis are clamped to [−512, 510] (±2,048 km at 4 km cells: ten bits per axis, thirty in the key);
 * a hull beyond that shares an edge cell and is still found by the exact distance test.
 */
const CELL_LIMIT = 1 << 9;
const KEY_OFFSET = CELL_LIMIT;

const MASK_A = 1;
const MASK_B = 2;
const MASK_ROGUE = 4;

const clampCell = (c: number): number => (c < -CELL_LIMIT ? -CELL_LIMIT : c > CELL_LIMIT - 2 ? CELL_LIMIT - 2 : c);
/** Packs three clamped cell coordinates (each in [0, 1022] after the offset) into one positive 30-bit key; never −1, the empty-slot marker. */
const packKey = (cx: number, cy: number, cz: number): number => ((cx + KEY_OFFSET) << 20) | ((cy + KEY_OFFSET) << 10) | (cz + KEY_OFFSET);
const hashKey = (key: number): number => {
  let h = Math.imul(key, 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  return h;
};

/** Whether `other` is in the targeting set the filter describes. */
export function gridFilterPasses(filter: GridFilter | undefined, other: ShipState): boolean {
  if (!other.alive || other.escaped) return false;
  if (filter === undefined) return true;
  if (typeof filter === 'string') return other.side !== filter;
  if (other === filter) return false;
  return other.side !== filter.side || other.rogue || filter.rogue;
}

/** The cell-mask bits a filter can match: cells without any of them hold nothing for it. */
function filterMask(filter: GridFilter | undefined): number {
  if (filter === undefined) return MASK_A | MASK_B | MASK_ROGUE;
  if (typeof filter === 'string') return filter === 'A' ? MASK_B : MASK_A;
  if (filter.rogue) return MASK_A | MASK_B | MASK_ROGUE;
  return (filter.side === 'A' ? MASK_B : MASK_A) | MASK_ROGUE;
}

/** Squared distance from point `p` to the segment `ab`. */
function pointSegmentDistanceSq(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const px = p.x - a.x;
  const py = p.y - a.y;
  const pz = p.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 1e-18 ? (px * dx + py * dy + pz * dz) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const ex = px - dx * t;
  const ey = py - dy * t;
  const ez = pz - dz * t;
  return ex * ex + ey * ey + ez * ez;
}

export class SpatialGrid {
  readonly cellKm: number;
  private readonly invCell: number;
  private ships: readonly ShipState[] = [];
  /** Ships covered by the last rebuild (ships pushed later in the tick are not indexed until the next one). */
  private n = 0;
  private cellCountValue = 0;
  /** Largest `radiusKm` among the indexed hulls (the projectile sweep pads its segments with it). */
  maxRadiusKm = 0;
  // Open-addressed table: packed cell key → cell index.
  private tableKeys = new Int32Array(64).fill(-1);
  private tableCells = new Int32Array(64);
  private mask = 63;
  // Per cell.
  private cellCx = new Int32Array(32);
  private cellCy = new Int32Array(32);
  private cellCz = new Int32Array(32);
  private cellStart = new Int32Array(33);
  private cellSize = new Int32Array(32);
  private cellSides = new Uint8Array(32);
  private cellScratch = new Int32Array(32);
  // Per ship.
  private shipCell = new Int32Array(32);
  private cellItems = new Int32Array(32);
  private scratch = new Int32Array(32);
  // Occupied extent in cell coordinates.
  private lo = [0, 0, 0];
  private hi = [0, 0, 0];

  constructor(cellKm = GRID_CELL_KM) {
    this.cellKm = cellKm;
    this.invCell = 1 / cellKm;
  }

  /** Number of occupied cells after the last rebuild. */
  get cellCount(): number {
    return this.cellCountValue;
  }

  /** Number of hulls indexed by the last rebuild. */
  get size(): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) if (this.shipCell[i] >= 0) k++;
    return k;
  }

  private ensureCapacity(n: number): void {
    if (this.shipCell.length < n) {
      const cap = Math.max(n, this.shipCell.length * 2);
      this.shipCell = new Int32Array(cap);
      this.cellItems = new Int32Array(cap);
      this.scratch = new Int32Array(cap);
      this.cellCx = new Int32Array(cap);
      this.cellCy = new Int32Array(cap);
      this.cellCz = new Int32Array(cap);
      this.cellStart = new Int32Array(cap + 1);
      this.cellSize = new Int32Array(cap);
      this.cellSides = new Uint8Array(cap);
      this.cellScratch = new Int32Array(cap);
    }
    let tableSize = this.tableKeys.length;
    while (tableSize < n * 2) tableSize *= 2;
    if (tableSize !== this.tableKeys.length) {
      this.tableKeys = new Int32Array(tableSize);
      this.tableCells = new Int32Array(tableSize);
      this.mask = tableSize - 1;
    }
  }

  private findCell(key: number): number {
    let h = hashKey(key) & this.mask;
    for (;;) {
      const k = this.tableKeys[h];
      if (k === key) return this.tableCells[h];
      if (k === -1) return -1;
      h = (h + 1) & this.mask;
    }
  }

  private findOrInsertCell(key: number, cx: number, cy: number, cz: number): number {
    let h = hashKey(key) & this.mask;
    for (;;) {
      const k = this.tableKeys[h];
      if (k === key) return this.tableCells[h];
      if (k === -1) {
        const c = this.cellCountValue++;
        this.tableKeys[h] = key;
        this.tableCells[h] = c;
        this.cellCx[c] = cx;
        this.cellCy[c] = cy;
        this.cellCz[c] = cz;
        this.cellSize[c] = 0;
        this.cellSides[c] = 0;
        return c;
      }
      h = (h + 1) & this.mask;
    }
  }

  /** Index every live, present hull of `ships` (ship-index order throughout). */
  rebuild(ships: readonly ShipState[]): void {
    this.ships = ships;
    const n = ships.length;
    this.n = n;
    this.ensureCapacity(Math.max(1, n));
    this.tableKeys.fill(-1);
    this.cellCountValue = 0;
    this.maxRadiusKm = 0;
    let first = true;
    for (let i = 0; i < n; i++) {
      const s = ships[i];
      if (!s.alive || s.escaped) {
        this.shipCell[i] = -1;
        continue;
      }
      const cx = clampCell(Math.floor(s.pos.x * this.invCell));
      const cy = clampCell(Math.floor(s.pos.y * this.invCell));
      const cz = clampCell(Math.floor(s.pos.z * this.invCell));
      const c = this.findOrInsertCell(packKey(cx, cy, cz), cx, cy, cz);
      this.shipCell[i] = c;
      this.cellSize[c]++;
      this.cellSides[c] |= (s.side === 'A' ? MASK_A : MASK_B) | (s.rogue ? MASK_ROGUE : 0);
      if (s.radiusKm > this.maxRadiusKm) this.maxRadiusKm = s.radiusKm;
      if (first) {
        this.lo[0] = this.hi[0] = cx;
        this.lo[1] = this.hi[1] = cy;
        this.lo[2] = this.hi[2] = cz;
        first = false;
      } else {
        if (cx < this.lo[0]) this.lo[0] = cx;
        if (cx > this.hi[0]) this.hi[0] = cx;
        if (cy < this.lo[1]) this.lo[1] = cy;
        if (cy > this.hi[1]) this.hi[1] = cy;
        if (cz < this.lo[2]) this.lo[2] = cz;
        if (cz > this.hi[2]) this.hi[2] = cz;
      }
    }
    // Prefix sums, then the items of every cell in ship-index order.
    const cells = this.cellCountValue;
    this.cellStart[0] = 0;
    for (let c = 0; c < cells; c++) this.cellStart[c + 1] = this.cellStart[c] + this.cellSize[c];
    for (let c = 0; c < cells; c++) this.cellSize[c] = this.cellStart[c]; // reused as the fill cursor
    for (let i = 0; i < n; i++) {
      const c = this.shipCell[i];
      if (c >= 0) this.cellItems[this.cellSize[c]++] = i;
    }
    for (let c = 0; c < cells; c++) this.cellSize[c] = this.cellStart[c + 1] - this.cellStart[c];
  }

  /** Sorts the first `k` scratch indices and maps them to ships. */
  private collect(k: number): ShipState[] {
    const out = this.scratch.subarray(0, k);
    out.sort();
    const result: ShipState[] = new Array(k);
    for (let i = 0; i < k; i++) result[i] = this.ships[out[i]];
    return result;
  }

  /**
   * Writes every occupied cell intersecting the box [lo, hi] (cell coordinates) whose side mask overlaps `want`
   * into `cellScratch` and returns the count. When the box holds more cells than exist, the occupied cells are
   * scanned instead, so a query radius larger than the battlespace stays O(cells).
   */
  private collectCells(lx: number, ly: number, lz: number, hx: number, hy: number, hz: number, want: number): number {
    if (lx < this.lo[0]) lx = this.lo[0];
    if (ly < this.lo[1]) ly = this.lo[1];
    if (lz < this.lo[2]) lz = this.lo[2];
    if (hx > this.hi[0]) hx = this.hi[0];
    if (hy > this.hi[1]) hy = this.hi[1];
    if (hz > this.hi[2]) hz = this.hi[2];
    if (lx > hx || ly > hy || lz > hz) return 0;
    let k = 0;
    const out = this.cellScratch;
    const sides = this.cellSides;
    const span = (hx - lx + 1) * (hy - ly + 1) * (hz - lz + 1);
    if (span > this.cellCountValue) {
      const cxs = this.cellCx;
      const cys = this.cellCy;
      const czs = this.cellCz;
      for (let c = 0; c < this.cellCountValue; c++) {
        if ((sides[c] & want) === 0) continue;
        const cx = cxs[c];
        if (cx < lx || cx > hx) continue;
        const cy = cys[c];
        if (cy < ly || cy > hy) continue;
        const cz = czs[c];
        if (cz < lz || cz > hz) continue;
        out[k++] = c;
      }
      return k;
    }
    for (let cx = lx; cx <= hx; cx++) {
      for (let cy = ly; cy <= hy; cy++) {
        for (let cz = lz; cz <= hz; cz++) {
          const c = this.findCell(packKey(cx, cy, cz));
          if (c >= 0 && (sides[c] & want) !== 0) out[k++] = c;
        }
      }
    }
    return k;
  }

  /** Live hulls of the filter's targeting set within `r` km of `p`, in ship-index order. */
  queryRadius(p: Vec3, r: number, filter?: GridFilter): ShipState[] {
    if (this.n === 0 || this.cellCountValue === 0 || !(r >= 0)) return [];
    const r2 = r * r;
    const ships = this.ships;
    const inv = this.invCell;
    const cells = this.collectCells(
      clampCell(Math.floor((p.x - r) * inv)),
      clampCell(Math.floor((p.y - r) * inv)),
      clampCell(Math.floor((p.z - r) * inv)),
      clampCell(Math.floor((p.x + r) * inv)),
      clampCell(Math.floor((p.y + r) * inv)),
      clampCell(Math.floor((p.z + r) * inv)),
      filterMask(filter),
    );
    let k = 0;
    for (let q = 0; q < cells; q++) {
      const c = this.cellScratch[q];
      const end = this.cellStart[c + 1];
      for (let idx = this.cellStart[c]; idx < end; idx++) {
        const i = this.cellItems[idx];
        const s = ships[i];
        if (!gridFilterPasses(filter, s)) continue;
        const dx = s.pos.x - p.x;
        const dy = s.pos.y - p.y;
        const dz = s.pos.z - p.z;
        if (dx * dx + dy * dy + dz * dz <= r2) this.scratch[k++] = i;
      }
    }
    return this.collect(k);
  }

  /** Whether any live hull of the filter's targeting set lies within `r` km of `p` (early exit). */
  anyWithin(p: Vec3, r: number, filter?: GridFilter): boolean {
    if (this.n === 0 || this.cellCountValue === 0 || !(r >= 0)) return false;
    const r2 = r * r;
    const ships = this.ships;
    const inv = this.invCell;
    const cells = this.collectCells(
      clampCell(Math.floor((p.x - r) * inv)),
      clampCell(Math.floor((p.y - r) * inv)),
      clampCell(Math.floor((p.z - r) * inv)),
      clampCell(Math.floor((p.x + r) * inv)),
      clampCell(Math.floor((p.y + r) * inv)),
      clampCell(Math.floor((p.z + r) * inv)),
      filterMask(filter),
    );
    for (let q = 0; q < cells; q++) {
      const c = this.cellScratch[q];
      const end = this.cellStart[c + 1];
      for (let idx = this.cellStart[c]; idx < end; idx++) {
        const s = ships[this.cellItems[idx]];
        if (!gridFilterPasses(filter, s)) continue;
        const dx = s.pos.x - p.x;
        const dy = s.pos.y - p.y;
        const dz = s.pos.z - p.z;
        if (dx * dx + dy * dy + dz * dz <= r2) return true;
      }
    }
    return false;
  }

  /** Live hulls of the filter's targeting set whose centre lies within `pad` km of the segment `ab`, in ship-index order. */
  querySegment(a: Vec3, b: Vec3, pad: number, filter?: GridFilter): ShipState[] {
    if (this.n === 0 || this.cellCountValue === 0 || !(pad >= 0)) return [];
    const pad2 = pad * pad;
    const ships = this.ships;
    const inv = this.invCell;
    const cells = this.collectCells(
      clampCell(Math.floor((Math.min(a.x, b.x) - pad) * inv)),
      clampCell(Math.floor((Math.min(a.y, b.y) - pad) * inv)),
      clampCell(Math.floor((Math.min(a.z, b.z) - pad) * inv)),
      clampCell(Math.floor((Math.max(a.x, b.x) + pad) * inv)),
      clampCell(Math.floor((Math.max(a.y, b.y) + pad) * inv)),
      clampCell(Math.floor((Math.max(a.z, b.z) + pad) * inv)),
      filterMask(filter),
    );
    let k = 0;
    for (let q = 0; q < cells; q++) {
      const c = this.cellScratch[q];
      const end = this.cellStart[c + 1];
      for (let idx = this.cellStart[c]; idx < end; idx++) {
        const i = this.cellItems[idx];
        const s = ships[i];
        if (!gridFilterPasses(filter, s)) continue;
        if (pointSegmentDistanceSq(s.pos, a, b) <= pad2) this.scratch[k++] = i;
      }
    }
    return this.collect(k);
  }

  /** The nearest live hull of the filter's targeting set (ties by ship index), or undefined. */
  nearest(p: Vec3, filter: GridFilter): ShipState | undefined {
    if (this.n === 0 || this.cellCountValue === 0) return undefined;
    const ships = this.ships;
    const want = filterMask(filter);
    let best = -1;
    let bestD2 = Infinity;
    const considerCell = (c: number): void => {
      if ((this.cellSides[c] & want) === 0) return;
      const end = this.cellStart[c + 1];
      for (let idx = this.cellStart[c]; idx < end; idx++) {
        const i = this.cellItems[idx];
        const s = ships[i];
        if (!gridFilterPasses(filter, s)) continue;
        const dx = s.pos.x - p.x;
        const dy = s.pos.y - p.y;
        const dz = s.pos.z - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD2 || (d2 === bestD2 && i < best)) {
          bestD2 = d2;
          best = i;
        }
      }
    };
    const px = clampCell(Math.floor(p.x * this.invCell));
    const py = clampCell(Math.floor(p.y * this.invCell));
    const pz = clampCell(Math.floor(p.z * this.invCell));
    const maxShell = Math.max(
      Math.abs(px - this.lo[0]), Math.abs(px - this.hi[0]),
      Math.abs(py - this.lo[1]), Math.abs(py - this.hi[1]),
      Math.abs(pz - this.lo[2]), Math.abs(pz - this.hi[2]),
    );
    for (let k = 0; k <= maxShell; k++) {
      // Every cell of shell k lies at least (k − 1) cells from p: once the best is nearer, no further shell can win.
      if (best >= 0 && (k - 1) * this.cellKm >= Math.sqrt(bestD2)) break;
      const box = 2 * k + 1;
      if (box * box * box > this.cellCountValue) {
        // Sparse neighbourhood: scanning every occupied cell is cheaper than walking empty shells.
        for (let c = 0; c < this.cellCountValue; c++) considerCell(c);
        break;
      }
      for (let cx = px - k; cx <= px + k; cx++) {
        for (let cy = py - k; cy <= py + k; cy++) {
          for (let cz = pz - k; cz <= pz + k; cz++) {
            if (Math.max(Math.abs(cx - px), Math.abs(cy - py), Math.abs(cz - pz)) !== k) continue;
            const c = this.findCell(packKey(clampCell(cx), clampCell(cy), clampCell(cz)));
            if (c >= 0) considerCell(c);
          }
        }
      }
    }
    return best >= 0 ? ships[best] : undefined;
  }
}
