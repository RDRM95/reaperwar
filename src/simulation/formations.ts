import { v3, type Vec3 } from '@/core/vec3';
import type { ShipRole } from '@/data/types';
import type { FormationType } from './types';
import { BATTLESPACE_SCALE } from './constants';

/**
 * Formation slot assignment. Slots are expressed in fleet-local space: +z is
 * the fleet's facing, +x to the right, +y up. The layouts below are written in
 * nominal formation km and compressed by `SLOT_COMPRESSION` (spacing shrinks
 * with the battlespace, never below what keeps hulls apart); the spacing guard
 * then runs on the compressed slots, so no two hulls of any formation start
 * closer than `SLOT_SPACING_FACTOR × max(length)` of the pair.
 */

export interface SlotShip {
  id: string;
  role: ShipRole;
  lengthKm: number;
}

/** Nominal formation km → simulation km: spacing compresses with the battlespace, but never below 0.55. */
export const SLOT_COMPRESSION = Math.max(BATTLESPACE_SCALE, 0.55);
/** Spacing guard: two slots are never closer than this × the longer hull of the pair (CINEMATIC_DESIGN.md §7.2). */
export const SLOT_SPACING_FACTOR = 1.7;

const tier = (role: ShipRole): number => {
  switch (role) {
    case 'reaper_capital':
    case 'dreadnought':
    case 'super_dreadnought':
    case 'carrier':
    case 'fixed_platform':
      return 0;
    case 'cruiser':
    case 'reaper_destroyer':
      return 1;
    case 'frigate':
      return 2;
    case 'fighter':
      return 3;
  }
};

/** Symmetric spread of n items along an axis with spacing s: 0, +s, -s, +2s, ... */
function spreadIndex(i: number): number {
  if (i === 0) return 0;
  const k = Math.ceil(i / 2);
  return i % 2 === 1 ? k : -k;
}

/** Fractional part of i × the golden ratio: a deterministic, well-spread sequence in [0, 1). */
const golden = (i: number): number => (i * 0.6180339887) % 1;

/** The 3D formations of the V2 roster (CINEMATIC_DESIGN.md §7.2); the other six are the v0.11 layouts (the spacing guard runs on all twelve). */
export const FORMATIONS_3D: readonly FormationType[] = ['layered_line', 'stacked_wedge', 'box', 'swarm_descent', 'broadside_line', 'static'];

export function assignSlots(ships: SlotShip[], formation: FormationType): Map<string, Vec3> {
  const raw = assignSlotsNominal(ships, formation);
  const k = SLOT_COMPRESSION;
  const slots = new Map<string, Vec3>();
  for (const [id, v] of raw) slots.set(id, v3(v.x * k, v.y * k, v.z * k));
  spacingGuard(ships, slots);
  return slots;
}

/**
 * The spacing guard (CINEMATIC_DESIGN.md §7.2): slots are settled one at a time in tier order (capitals first,
 * then cruisers, frigates, small craft; deployment order inside a tier), and a slot that lands inside the
 * clearance of an already-settled one is pushed straight away from it until it is clear of all of them. The
 * clearance of a pair is `SLOT_SPACING_FACTOR × the longer hull`. Deterministic: no randomness, fixed order.
 */
function spacingGuard(ships: SlotShip[], slots: Map<string, Vec3>): void {
  const order = ships
    .map((s, i) => ({ s, i, t: tier(s.role) }))
    .filter((e) => slots.has(e.s.id))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  const settled: { p: Vec3; len: number }[] = [];
  for (const { s, i } of order) {
    const p = slots.get(s.id)!;
    for (let attempt = 0; attempt < 96; attempt++) {
      let moved = false;
      for (const q of settled) {
        const need = SLOT_SPACING_FACTOR * Math.max(q.len, s.lengthKm);
        const dx = p.x - q.p.x;
        const dy = p.y - q.p.y;
        const dz = p.z - q.p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= need - 1e-9) continue;
        // Push straight away from the settled slot; coincident slots split along a deterministic direction.
        let ux: number;
        let uy: number;
        let uz: number;
        if (d > 1e-6) {
          ux = dx / d;
          uy = dy / d;
          uz = dz / d;
        } else {
          const a = golden(i + 1) * Math.PI * 2;
          ux = Math.cos(a);
          uy = 0;
          uz = Math.sin(a);
        }
        const push = need - d + 1e-3;
        p.x += ux * push;
        p.y += uy * push;
        p.z += uz * push;
        moved = true;
      }
      if (!moved) break;
    }
    settled.push({ p, len: s.lengthKm });
  }
}

/** The six legacy layouts (v0.11); the 3D formations below build on two of them. */
type LegacyLayout = 'defensive_screen' | 'line_abreast' | 'strike_wedge' | 'capital_column' | 'fighter_screen' | 'dispersed';

function assignSlotsNominal(ships: SlotShip[], formation: FormationType): Map<string, Vec3> {
  const slots = new Map<string, Vec3>();
  const byTier: SlotShip[][] = [[], [], [], []];
  for (const s of ships) byTier[tier(s.role)].push(s);
  const [caps, cruisers, frigates, fighters] = byTier;

  const capSpacing = Math.max(3.2, ...caps.map((c) => (c.lengthKm * SLOT_SPACING_FACTOR) / SLOT_COMPRESSION));
  const cruSpacing = 2.2;
  const friSpacing = 1.6;

  switch (formation) {
    case 'layered_line':
      layeredLine(slots, caps, cruisers, frigates, fighters, capSpacing, cruSpacing);
      break;
    case 'stacked_wedge': {
      // The strike wedge with every tier stacked into three layers (0, above, below).
      legacy(slots, 'strike_wedge', caps, cruisers, frigates, fighters, capSpacing, cruSpacing, friSpacing);
      const lift = [0, 2.8, -2.8];
      for (const group of [caps, cruisers, frigates, fighters]) group.forEach((s, i) => (slots.get(s.id)!.y += lift[i % 3]));
      break;
    }
    case 'box':
      box(slots, caps, cruisers, frigates, fighters, capSpacing, cruSpacing, friSpacing);
      break;
    case 'swarm_descent':
      swarmDescent(slots, caps, cruisers, frigates, fighters, capSpacing);
      break;
    case 'broadside_line':
      broadsideLine(slots, caps, cruisers, frigates, fighters, capSpacing, cruSpacing, friSpacing);
      break;
    case 'static':
      staticArc(slots, caps, cruisers, frigates, fighters, capSpacing, cruSpacing, friSpacing);
      break;
    default:
      legacy(slots, formation, caps, cruisers, frigates, fighters, capSpacing, cruSpacing, friSpacing);
  }
  return slots;
}

function legacy(slots: Map<string, Vec3>, formation: LegacyLayout, caps: SlotShip[], cruisers: SlotShip[], frigates: SlotShip[], fighters: SlotShip[], capSpacing: number, cruSpacing: number, friSpacing: number): void {
  switch (formation) {
    case 'line_abreast': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing, 0, 0)));
      cruisers.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.3, (i % 2 ? 1 : -1) * 1.2, 4)));
      frigates.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * friSpacing * 1.6, (i % 3) * 1.0 - 1, 9)));
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 2 + (i % 4) * 0.5, 13)));
      break;
    }
    case 'defensive_screen': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing * 0.9, 0, -4)));
      cruisers.forEach((s, i) => {
        const a = (i / Math.max(1, cruisers.length - 1) - 0.5) * Math.PI * 0.8;
        slots.set(s.id, v3(Math.sin(a) * 9, (i % 2 ? 1 : -1) * 1.5, 3 + Math.cos(a) * 4));
      });
      frigates.forEach((s, i) => {
        const a = (i / Math.max(1, frigates.length - 1) - 0.5) * Math.PI * 1.1;
        slots.set(s.id, v3(Math.sin(a) * 14, ((i % 3) - 1) * 2.0, 7 + Math.cos(a) * 6));
      });
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.8, 3 + (i % 3) * 0.6, 12)));
      break;
    }
    case 'strike_wedge': {
      caps.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * capSpacing * 0.8, 0, -k * capSpacing * 0.7));
      });
      cruisers.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.4 + (i % 2 ? 2 : -2), (i % 2 ? 1 : -1) * 1.8, -2 - k * 1.2));
      });
      frigates.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * friSpacing * 2.2, ((i % 3) - 1) * 1.5, 3 - k * 0.8));
      });
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 2.5 + (i % 3) * 0.5, 6)));
      break;
    }
    case 'capital_column': {
      caps.forEach((s, i) => slots.set(s.id, v3(0, 0, -i * capSpacing)));
      cruisers.forEach((s, i) =>
        slots.set(s.id, v3((i % 2 ? 1 : -1) * (cruSpacing * 2.2), (i % 4 < 2 ? 1 : -1) * 1.5, -Math.floor(i / 2) * 2.5 + 2)),
      );
      frigates.forEach((s, i) =>
        slots.set(s.id, v3((i % 2 ? 1 : -1) * (6 + (i % 4) * 1.2), ((i % 3) - 1) * 2.5, -Math.floor(i / 2) * 1.8 + 4)),
      );
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 3 + (i % 3) * 0.5, 8)));
      break;
    }
    case 'fighter_screen': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing, 0, -6)));
      cruisers.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.4, (i % 2 ? 1 : -1) * 1.5, -2)));
      frigates.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * friSpacing * 1.6, ((i % 3) - 1) * 1.5, 3)));
      fighters.forEach((s, i) => {
        const a = (i / Math.max(1, fighters.length - 1) - 0.5) * Math.PI;
        slots.set(s.id, v3(Math.sin(a) * 12, ((i % 5) - 2) * 1.2, 10 + Math.cos(a) * 5));
      });
      break;
    }
    case 'dispersed': {
      // Deterministic pseudo-scatter from index.
      const scatter = (i: number, scaleX: number, scaleZ: number): Vec3 => {
        const g = (i * 0.618034) % 1;
        const h = (i * 0.754877) % 1;
        return v3((g - 0.5) * scaleX, ((i * 0.382) % 1 - 0.5) * 6, (h - 0.5) * scaleZ);
      };
      caps.forEach((s, i) => slots.set(s.id, scatter(i + 1, caps.length * capSpacing * 1.4, 14)));
      cruisers.forEach((s, i) => slots.set(s.id, scatter(i + 7, 30, 18)));
      frigates.forEach((s, i) => slots.set(s.id, scatter(i + 19, 40, 22)));
      fighters.forEach((s, i) => slots.set(s.id, scatter(i + 41, 24, 10)));
      break;
    }
  }
}

/**
 * Layered line (brief §8.2): dreadnoughts on the centre line; cruisers stacked in three layers — above, below,
 * and on the flanks beyond the capitals; frigates screening ahead on a curved shell; carriers and liveships
 * behind and above; fighters ahead as in the line abreast.
 */
function layeredLine(slots: Map<string, Vec3>, caps: SlotShip[], cruisers: SlotShip[], frigates: SlotShip[], fighters: SlotShip[], capSpacing: number, cruSpacing: number): void {
  const line = caps.filter((s) => s.role !== 'carrier');
  const carriers = caps.filter((s) => s.role === 'carrier');
  line.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing, 0, 0)));
  carriers.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing, 3.5, -7)));
  let lineHalf = 0;
  for (const s of line) lineHalf = Math.max(lineHalf, Math.abs(slots.get(s.id)!.x));
  // Three layers by i % 3: above (+2.4), below (−2.4), and the plane of the line pushed out to the flanks.
  const layerCount = [0, 0, 0];
  cruisers.forEach((s, i) => {
    const layer = i % 3;
    const j = layerCount[layer]++;
    if (layer === 2) {
      const side = j % 2 === 0 ? 1 : -1;
      const x = side * (lineHalf + cruSpacing * 1.6 * (1 + Math.floor(j / 2)));
      slots.set(s.id, v3(x, 0, 3));
    } else slots.set(s.id, v3(spreadIndex(j) * cruSpacing * 1.3, layer === 0 ? 2.4 : -2.4, 3));
  });
  // Frigate dome ahead: azimuth across 150°, elevation in five rings of 18°, radius at least the line's half-width.
  const R = Math.max(10, lineHalf + 2);
  frigates.forEach((s, i) => {
    const a = frigates.length > 1 ? (i / (frigates.length - 1) - 0.5) * ((150 * Math.PI) / 180) : 0;
    const b = (((i % 5) - 2) * 18 * Math.PI) / 180;
    slots.set(s.id, v3(R * Math.sin(a) * Math.cos(b), R * Math.sin(b), 8 + R * (1 - Math.cos(a))));
  });
  fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 2 + (i % 4) * 0.5, 13)));
}

/** Box: capitals on a centred grid facing the enemy, cruisers on the ±x faces, frigates on the ±y faces (half-size ≥ 6 km). */
function box(slots: Map<string, Vec3>, caps: SlotShip[], cruisers: SlotShip[], frigates: SlotShip[], fighters: SlotShip[], capSpacing: number, cruSpacing: number, friSpacing: number): void {
  const cols = Math.max(1, Math.ceil(Math.sqrt(caps.length)));
  const rows = Math.max(1, Math.ceil(caps.length / cols));
  caps.forEach((s, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    slots.set(s.id, v3((c - (cols - 1) / 2) * capSpacing, (r - (rows - 1) / 2) * capSpacing * 0.8, 0));
  });
  const half = Math.max(6, ((cols - 1) / 2) * capSpacing + capSpacing * 0.6, ((rows - 1) / 2) * capSpacing * 0.8 + capSpacing * 0.6);
  // Each face is filled on its own grid; spacing by role (cruisers wider than frigates), so the box is not a lattice.
  const face = (group: SlotShip[], spacing: number, place: (side: number, u: number, w: number) => Vec3): void => {
    const perFace = Math.ceil(group.length / 2);
    const g = Math.max(1, Math.ceil(Math.sqrt(perFace)));
    const step = Math.min(spacing, (1.6 * half) / Math.max(1, g - 1));
    group.forEach((s, j) => {
      const side = j % 2 === 0 ? 1 : -1;
      const m = Math.floor(j / 2);
      const u = ((m % g) - (g - 1) / 2) * step;
      const w = (Math.floor(m / g) - (Math.ceil(perFace / g) - 1) / 2) * step;
      slots.set(s.id, place(side, u, w));
    });
  };
  face(cruisers, cruSpacing * 1.3, (side, u, w) => v3(side * half, w, u));
  face(frigates, friSpacing * 1.6, (side, u, w) => v3(u, side * half, w + 1));
  fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, half + 2 + (i % 3) * 0.5, 4)));
}

/**
 * Descending swarm (Reapers): capitals in short descending columns of four (each lower and further back than the
 * last, staggered left and right), the escorts on a golden-angle shell around the core, centred 2 km ahead of it,
 * 9–12 km out for a small core and always clear of the capitals; Oculi as fighters ahead.
 */
function swarmDescent(slots: Map<string, Vec3>, caps: SlotShip[], cruisers: SlotShip[], frigates: SlotShip[], fighters: SlotShip[], capSpacing: number): void {
  const columns = Math.ceil(caps.length / 4);
  caps.forEach((s, i) => {
    const col = Math.floor(i / 4);
    const k = i % 4;
    const colX = columns > 1 ? spreadIndex(col) * capSpacing * 2.4 : 0;
    slots.set(s.id, v3(colX + spreadIndex(k) * 0.6 * capSpacing, 4 - 2.5 * k, -2 * k - col * 1.5));
  });
  const centre = v3();
  if (caps.length > 0) {
    for (const s of caps) {
      const p = slots.get(s.id)!;
      centre.x += p.x / caps.length;
      centre.y += p.y / caps.length;
      centre.z += p.z / caps.length;
    }
  }
  centre.z += 2;
  let coreRadius = 0;
  for (const s of caps) {
    const p = slots.get(s.id)!;
    coreRadius = Math.max(coreRadius, Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z));
  }
  // Clear of every capital by its spacing-guard clearance (nominal), so the shell is never pushed by the guard.
  const clearance = caps.length > 0 ? capSpacing + 0.3 : 0;
  const shell = (group: SlotShip[], base: number, offset: number): void => {
    const n = group.length;
    group.forEach((s, i) => {
      const theta = ((137.508 * (i + offset)) * Math.PI) / 180;
      const y = n > 1 ? ((2 * i) / (n - 1) - 1) * 0.8 : 0;
      const r = Math.sqrt(1 - y * y);
      const R = base + 3 * golden(i + offset + 1);
      slots.set(s.id, v3(centre.x + R * r * Math.cos(theta), centre.y + R * y, centre.z + R * r * Math.sin(theta)));
    });
  };
  const base = Math.max(9, coreRadius + clearance);
  shell(cruisers, base, 0);
  shell(frigates, base + 3, 7);
  fighters.forEach((s, i) => slots.set(s.id, v3(centre.x + spreadIndex(i) * 0.6, centre.y + 2 + (i % 4) * 0.5, centre.z + base + 4)));
}

/**
 * Broadside line: a column along the fleet heading with the escorts on its +x side. The fleet's doctrine facing
 * turns the locked heading 90° to the bearing once in range (movement), so the column becomes a line of battle
 * across the bearing with every hull's broadside and the escort screen toward the enemy.
 */
function broadsideLine(slots: Map<string, Vec3>, caps: SlotShip[], cruisers: SlotShip[], frigates: SlotShip[], fighters: SlotShip[], capSpacing: number, cruSpacing: number, friSpacing: number): void {
  caps.forEach((s, i) => slots.set(s.id, v3(0, 0, spreadIndex(i) * capSpacing)));
  cruisers.forEach((s, i) => slots.set(s.id, v3(4, (i % 2 ? 1 : -1) * 1.2, spreadIndex(i) * cruSpacing * 1.3)));
  frigates.forEach((s, i) => slots.set(s.id, v3(9, (i % 3) * 1.0 - 1, spreadIndex(i) * friSpacing * 1.6)));
  fighters.forEach((s, i) => slots.set(s.id, v3(13, 2 + (i % 4) * 0.5, spreadIndex(i) * 0.6)));
}

/**
 * Static (platforms): stations on a shallow arc across the bearing, alternately 2 km above and below the plane;
 * the slots are the spawn positions and never move (the fleet is static). Anything else in the fleet keeps the
 * line-abreast slots in front of the arc.
 */
function staticArc(slots: Map<string, Vec3>, caps: SlotShip[], cruisers: SlotShip[], frigates: SlotShip[], fighters: SlotShip[], capSpacing: number, cruSpacing: number, friSpacing: number): void {
  const spacing = Math.max(capSpacing, 6);
  caps.forEach((s, i) => {
    const x = spreadIndex(i) * spacing;
    slots.set(s.id, v3(x, i === 0 ? 0 : i % 2 ? 2 : -2, -0.02 * x * x));
  });
  legacy(slots, 'line_abreast', [], cruisers, frigates, fighters, capSpacing, cruSpacing, friSpacing);
}

/** Convert a fleet-local slot to world space given anchor position and heading (unit, y≈0). */
export function slotToWorld(anchor: Vec3, heading: Vec3, slot: Vec3): Vec3 {
  // right = heading × up
  const rx = heading.z;
  const rz = -heading.x;
  return v3(
    anchor.x + rx * slot.x + heading.x * slot.z,
    anchor.y + slot.y,
    anchor.z + rz * slot.x + heading.z * slot.z,
  );
}
