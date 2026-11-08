import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import { FORMATIONS_3D, assignSlots, layoutFormation, minSeparationKm, type FormationLayout, type SlotShip } from '@/simulation/formations';
import { FORMATION_LABELS, type FormationType } from '@/simulation/types';

/**
 * 3D formations and the spacing guard (WORK_BREAKDOWN.md T9, §1.6.3; CINEMATIC_DESIGN.md §7.2), laid out as
 * battlegroups since brief §22: each capital leads its share of the escorts in a loose 3D cluster, and the formation
 * places the groups (tests/battlegroups.test.ts holds the brief's own checks: no rows, groups, separation, no idling).
 */

const ship = (id: string, classId: string): SlotShip => {
  const c = getShipClass(classId);
  return { id, role: c.role, lengthKm: c.lengthM.value / 1000 };
};
const many = (classId: string, n: number): SlotShip[] => Array.from({ length: n }, (_, i) => ship(`${classId}-${i}`, classId));
const at = (slots: Map<string, Vec3>, ships: SlotShip[]): Vec3[] => ships.map((s) => slots.get(s.id)!);
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const centroid = (ps: Vec3[]): Vec3 => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length });
/** A hull's slot relative to its own group's leader. */
const rel = (layout: FormationLayout, s: SlotShip): Vec3 => {
  const p = layout.slots.get(s.id)!;
  const l = layout.slots.get(layout.leaders.get(s.id)!)!;
  return { x: p.x - l.x, y: p.y - l.y, z: p.z - l.z };
};
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('3D formations', () => {
  it.each([0, 1, 42])(
    'layered line: each dreadnought leads a battlegroup (cruisers on a shell round it, above and below; frigates ahead; the carrier behind and above) and the groups stand in three height layers (seed %i)',
    (seed) => {
      const dns = many('alliance_dreadnought', 4);
      const carriers = many('alliance_carrier', 1);
      const cruisers = many('alliance_cruiser', 9);
      const frigates = many('alliance_frigate', 12);
      const fighters = many('alliance_fighter', 4);
      const layout = layoutFormation([...dns, ...carriers, ...cruisers, ...frigates, ...fighters], 'layered_line', { seed });
      // Every hull but the four capitals belongs to a dreadnought's group; the capitals lead.
      const dnIds = new Set(dns.map((s) => s.id));
      for (const s of dns) expect(layout.leaders.has(s.id), s.id).toBe(false);
      for (const s of [...carriers, ...cruisers, ...frigates, ...fighters]) expect(dnIds.has(layout.leaders.get(s.id)!), s.id).toBe(true);
      // Three layers: a group above the line, one below it, one in its plane.
      const ys = at(layout.slots, dns).map((p) => p.y);
      expect(Math.max(...ys)).toBeGreaterThan(2);
      expect(Math.min(...ys)).toBeLessThan(-2);
      expect(ys.some((y) => Math.abs(y) < 1.5)).toBe(true);
      // The cruiser shell: clear of its capital, within a few km of it, above and below it.
      const shell = cruisers.map((s) => rel(layout, s));
      shell.forEach((p, i) => {
        const r = Math.hypot(p.x, p.y, p.z);
        expect(r, cruisers[i].id).toBeGreaterThanOrEqual(minSeparationKm(dns[0], cruisers[i]) - 1e-6);
        expect(r, cruisers[i].id).toBeLessThan(4);
      });
      expect(shell.some((p) => p.y > 0.2) && shell.some((p) => p.y < -0.2)).toBe(true);
      // The frigate screen ahead of its own capital (and well ahead of the shell); craft ahead and above.
      const screen = frigates.map((s) => rel(layout, s));
      for (const [i, p] of screen.entries()) expect(p.z, frigates[i].id).toBeGreaterThan(1);
      expect(mean(screen.map((p) => p.z))).toBeGreaterThan(mean(shell.map((p) => p.z)) + 1);
      for (const s of fighters) {
        const p = rel(layout, s);
        expect(p.z, s.id).toBeGreaterThan(1);
        expect(p.y, s.id).toBeGreaterThan(0);
      }
      // The carrier behind and above its group's capital.
      const c = rel(layout, carriers[0]);
      expect(c.z).toBeLessThan(-1);
      expect(c.y).toBeGreaterThan(1);
    },
  );

  it('descending swarm: each Reaper capital leads its destroyers (behind it, above and below it, clear of it); the groups descend in short columns', () => {
    const one = many('reaper_capital', 1);
    const escorts = many('reaper_destroyer', 12);
    const oculi = many('reaper_oculus', 6);
    const layout = layoutFormation([...one, ...escorts, ...oculi], 'swarm_descent');
    const ds = escorts.map((s) => rel(layout, s));
    ds.forEach((p, i) => {
      // The capital leads: its destroyers swarm behind it, never screening it.
      expect(p.z, escorts[i].id).toBeLessThan(0);
      expect(Math.hypot(p.x, p.y, p.z), escorts[i].id).toBeGreaterThanOrEqual(minSeparationKm(one[0], escorts[i]) - 1e-6);
    });
    expect(ds.some((p) => p.y > 1) && ds.some((p) => p.y < -1)).toBe(true);
    // The Oculi fly ahead of and above the capital.
    for (const s of oculi) {
      const p = rel(layout, s);
      expect(p.z, s.id).toBeGreaterThan(0);
      expect(p.y, s.id).toBeGreaterThan(0);
    }
    // Three capitals: one column, each group lower and further back than the one before it.
    const three = many('reaper_capital', 3);
    const caps = at(assignSlots([...three, ...many('reaper_destroyer', 12)], 'swarm_descent'), three);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i].y).toBeLessThan(caps[i - 1].y - 1);
      expect(caps[i].z).toBeLessThan(caps[i - 1].z - 1);
    }
  });

  it('box, stacked wedge, broadside line and static place their battlegroups with their structure', () => {
    const fleet = [...many('alliance_dreadnought', 4), ...many('alliance_cruiser', 8), ...many('alliance_frigate', 10)];
    for (const f of ['box', 'stacked_wedge', 'broadside_line', 'static'] as FormationType[]) {
      const slots = assignSlots(fleet, f);
      expect(slots.size, f).toBe(fleet.length);
      for (const p of slots.values()) expect(Number.isFinite(p.x + p.y + p.z), f).toBe(true);
    }
    // Box: eight groups on a 2 × 2 × 2 grid, four capitals on each side of the centre along every axis.
    const eight = many('alliance_dreadnought', 8);
    const box = at(assignSlots([...eight, ...many('alliance_cruiser', 8)], 'box'), eight);
    const mid = centroid(box);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(box.filter((p) => p[axis] > mid[axis] + 0.5).length, axis).toBe(4);
      expect(box.filter((p) => p[axis] < mid[axis] - 0.5).length, axis).toBe(4);
    }
    // Stacked wedge: the flagship's group at the apex, foremost; the ranks behind it widen and spread above and below.
    const seven = many('alliance_dreadnought', 7);
    const wedgeFleet = [...seven, ...many('alliance_cruiser', 14)];
    const wedge = at(assignSlots(wedgeFleet, 'stacked_wedge'), seven);
    for (let i = 1; i < wedge.length; i++) expect(wedge[i].z, `group ${i}`).toBeLessThan(wedge[0].z - 1);
    const width = (ps: Vec3[]): number => Math.max(...ps.map((p) => Math.abs(p.x - wedge[0].x)));
    expect(width(wedge.slice(4))).toBeGreaterThan(width(wedge.slice(1, 4)) + 1);
    expect(wedge.slice(1).some((p) => p.y > wedge[0].y + 2) && wedge.slice(1).some((p) => p.y < wedge[0].y - 2)).toBe(true);
    // ... standing taller than the strike wedge.
    const strike = at(assignSlots(wedgeFleet, 'strike_wedge'), seven);
    const height = (ps: Vec3[]): number => Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
    expect(height(wedge)).toBeGreaterThan(height(strike));
    // Broadside line: the capitals in a column along the fleet axis, every escort on the +x (enemy) side of its own capital.
    const broadside = layoutFormation(fleet, 'broadside_line');
    const caps = at(broadside.slots, fleet.slice(0, 4));
    const span = (ps: Vec3[], a: 'x' | 'z'): number => Math.max(...ps.map((p) => p[a])) - Math.min(...ps.map((p) => p[a]));
    expect(span(caps, 'z')).toBeGreaterThan(3 * span(caps, 'x'));
    for (const s of fleet.slice(4)) expect(rel(broadside, s).x, s.id).toBeGreaterThan(0.5);
    // Static: platforms on an arc across the bearing (the wings behind the centre), alternately above and below the plane.
    const platforms = many('sol_defence_platform', 5);
    const arc = at(assignSlots(platforms, 'static'), platforms);
    expect(arc.some((p) => p.y > 0.5) && arc.some((p) => p.y < -0.5)).toBe(true);
    expect(Math.max(...arc.map((p) => p.z))).toBeGreaterThan(Math.min(...arc.map((p) => p.z)));
    const centre = arc.reduce((a, p) => (Math.abs(p.x) < Math.abs(a.x) ? p : a));
    const wings = arc.filter((p) => Math.abs(p.x) > 10);
    expect(wings.length).toBe(2);
    for (const w of wings) expect(w.z).toBeLessThan(centre.z - 1);
  });

  it('every formation id has a layout and the 3D list names exactly the six new ones', () => {
    expect([...FORMATIONS_3D].sort()).toEqual(['box', 'broadside_line', 'layered_line', 'stacked_wedge', 'static', 'swarm_descent']);
    for (const f of FORMATIONS_3D) expect(FORMATION_LABELS[f]).toBeTruthy();
  });

  it.each(Object.keys(FORMATION_LABELS) as FormationType[])('spacing guard: no two of 40 mixed hulls closer than their minimum separation — 1.7 × the longer hull, 3 × for two capitals (%s)', (formation) => {
    const fleet = [
      ...many('reaper_capital', 2),
      ...many('harbinger', 1),
      ...many('alliance_dreadnought', 3),
      ...many('alliance_super_dreadnought', 1),
      ...many('sol_defence_platform', 1),
      ...many('alliance_carrier', 1),
      ...many('alliance_cruiser', 8),
      ...many('reaper_destroyer', 4),
      ...many('alliance_frigate', 12),
      ...many('alliance_fighter', 7),
    ];
    expect(fleet.length).toBe(40);
    const slots = assignSlots(fleet, formation);
    expect(slots.size).toBe(40);
    for (let i = 0; i < fleet.length; i++) {
      for (let j = i + 1; j < fleet.length; j++) {
        const need = minSeparationKm(fleet[i], fleet[j]);
        const d = dist(slots.get(fleet[i].id)!, slots.get(fleet[j].id)!);
        expect(d, `${formation}: ${fleet[i].id} – ${fleet[j].id}`).toBeGreaterThanOrEqual(need - 1e-6);
      }
    }
    // Deterministic: the same input gives the same slots.
    const again = assignSlots(fleet, formation);
    for (const s of fleet) expect(again.get(s.id)).toEqual(slots.get(s.id));
  });
});
