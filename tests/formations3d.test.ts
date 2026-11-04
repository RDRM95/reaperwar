import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import { FORMATIONS_3D, SLOT_COMPRESSION, SLOT_SPACING_FACTOR, assignSlots, type SlotShip } from '@/simulation/formations';
import { FORMATION_LABELS, type FormationType } from '@/simulation/types';

/** 3D formations and the spacing guard (WORK_BREAKDOWN.md T9, §1.6.3; CINEMATIC_DESIGN.md §7.2). */

const ship = (id: string, classId: string): SlotShip => {
  const c = getShipClass(classId);
  return { id, role: c.role, lengthKm: c.lengthM.value / 1000 };
};
const many = (classId: string, n: number): SlotShip[] => Array.from({ length: n }, (_, i) => ship(`${classId}-${i}`, classId));
const at = (slots: Map<string, Vec3>, ships: SlotShip[]): Vec3[] => ships.map((s) => slots.get(s.id)!);
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const centroid = (ps: Vec3[]): Vec3 => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length });

describe('3D formations', () => {
  it('layered line: capitals on the centre line, cruisers in three layers, frigates ahead on a dome, carriers behind and above', () => {
    const dns = many('alliance_dreadnought', 4);
    const carriers = many('alliance_carrier', 1);
    const cruisers = many('alliance_cruiser', 9);
    const frigates = many('alliance_frigate', 12);
    const slots = assignSlots([...dns, ...carriers, ...cruisers, ...frigates, ...many('alliance_fighter', 4)], 'layered_line');
    const caps = at(slots, dns);
    for (const p of caps) {
      expect(p.y).toBeCloseTo(0, 6);
      expect(p.z).toBeCloseTo(0, 6);
    }
    const capHalf = Math.max(...caps.map((p) => Math.abs(p.x)));
    // Three distinct layers: above, below, and the plane of the line out on the flanks.
    const cru = at(slots, cruisers);
    const levels = new Set(cru.map((p) => Math.round(p.y * 10) / 10));
    expect(levels.size).toBeGreaterThanOrEqual(3);
    expect(cru.some((p) => p.y > 1)).toBe(true);
    expect(cru.some((p) => p.y < -1)).toBe(true);
    const inPlane = cru.filter((p) => Math.abs(p.y) < 0.1);
    expect(inPlane.length).toBeGreaterThan(0);
    for (const p of inPlane) expect(Math.abs(p.x)).toBeGreaterThan(capHalf);
    // Frigates ahead of the line on a curved shell: the wings sweep forward of the centre, and the shell has height.
    const fri = at(slots, frigates);
    const capFront = Math.max(...caps.map((p) => p.z));
    for (const p of fri) expect(p.z).toBeGreaterThan(capFront + 2);
    const centre = fri.reduce((a, p) => (Math.abs(p.x) < Math.abs(a.x) ? p : a));
    const wing = fri.reduce((a, p) => (Math.abs(p.x) > Math.abs(a.x) ? p : a));
    expect(wing.z).toBeGreaterThan(centre.z + 1);
    expect(Math.max(...fri.map((p) => p.y)) - Math.min(...fri.map((p) => p.y))).toBeGreaterThan(2);
    // Carriers behind and above the line.
    const [carrier] = at(slots, carriers);
    expect(carrier.z).toBeLessThan(Math.min(...caps.map((p) => p.z)));
    expect(carrier.y).toBeGreaterThan(Math.max(...caps.map((p) => p.y)));
  });

  it('descending swarm: destroyers on a shell 9–12 km (nominal) from the core, capitals descending inside it', () => {
    // One capital: the core point is the capital plus 2 km ahead (the shell centre), and the shell sits at 9–12 km.
    const one = many('reaper_capital', 1);
    const escorts = many('reaper_destroyer', 12);
    const slots = assignSlots([...one, ...escorts, ...many('reaper_oculus', 6)], 'swarm_descent');
    const core = { ...slots.get(one[0].id)! };
    core.z += 2 * SLOT_COMPRESSION;
    for (const p of at(slots, escorts)) {
      const r = dist(p, core) / SLOT_COMPRESSION;
      expect(r).toBeGreaterThanOrEqual(9 - 1e-6);
      expect(r).toBeLessThanOrEqual(12 + 1e-6);
    }
    // Four capitals: a column that steps down and back; every escort is farther from the core than any capital.
    const four = many('reaper_capital', 4);
    const shell = many('reaper_destroyer', 16);
    const s4 = assignSlots([...four, ...shell], 'swarm_descent');
    const caps = at(s4, four);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i].y).toBeLessThan(caps[i - 1].y);
      expect(caps[i].z).toBeLessThan(caps[i - 1].z);
    }
    const c = centroid(caps);
    const capR = Math.max(...caps.map((p) => dist(p, c)));
    for (const p of at(s4, shell)) expect(dist(p, c)).toBeGreaterThan(capR);
  });

  it('box, stacked wedge, broadside line and static produce slots with their structure', () => {
    const fleet = [...many('alliance_dreadnought', 4), ...many('alliance_cruiser', 8), ...many('alliance_frigate', 10)];
    const caps = fleet.slice(0, 4);
    const cruisers = fleet.slice(4, 12);
    const frigates = fleet.slice(12);
    for (const f of ['box', 'stacked_wedge', 'broadside_line', 'static'] as FormationType[]) {
      const slots = assignSlots(fleet, f);
      expect(slots.size, f).toBe(fleet.length);
      for (const p of slots.values()) expect(Number.isFinite(p.x + p.y + p.z), f).toBe(true);
    }
    // Box: cruisers on the ±x faces, frigates on the ±y faces, so the faces differ by role.
    const box = assignSlots(fleet, 'box');
    const half = Math.max(...at(box, cruisers).map((p) => Math.abs(p.x)));
    for (const p of at(box, cruisers)) expect(Math.abs(p.x)).toBeCloseTo(half, 1);
    for (const p of at(box, frigates)) expect(Math.abs(p.y)).toBeCloseTo(half, 1);
    expect(at(box, cruisers).some((p) => p.x > 0) && at(box, cruisers).some((p) => p.x < 0)).toBe(true);
    // Stacked wedge: every tier spread over three heights.
    const wedge = assignSlots(fleet, 'stacked_wedge');
    expect(new Set(at(wedge, cruisers).map((p) => Math.round(p.y * 10))).size).toBeGreaterThanOrEqual(3);
    // Broadside line: the capitals form a column on the fleet axis, every escort on the +x (enemy) side.
    const broadside = assignSlots(fleet, 'broadside_line');
    for (const p of at(broadside, caps)) expect(Math.abs(p.x)).toBeLessThan(1e-6);
    for (const p of at(broadside, [...cruisers, ...frigates])) expect(p.x).toBeGreaterThan(1);
    // Static: platforms on an arc, alternately above and below the plane.
    const platforms = many('sol_defence_platform', 5);
    const arc = at(assignSlots(platforms, 'static'), platforms);
    expect(arc.some((p) => p.y > 0.5) && arc.some((p) => p.y < -0.5)).toBe(true);
    expect(Math.max(...arc.map((p) => p.z))).toBeGreaterThan(Math.min(...arc.map((p) => p.z)));
  });

  it('every formation id has a layout and the 3D list names exactly the six new ones', () => {
    expect([...FORMATIONS_3D].sort()).toEqual(['box', 'broadside_line', 'layered_line', 'stacked_wedge', 'static', 'swarm_descent']);
    for (const f of FORMATIONS_3D) expect(FORMATION_LABELS[f]).toBeTruthy();
  });

  it.each(Object.keys(FORMATION_LABELS) as FormationType[])('spacing guard: no two of 40 mixed hulls closer than 1.7 × the longer hull (%s)', (formation) => {
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
        const need = SLOT_SPACING_FACTOR * Math.max(fleet[i].lengthKm, fleet[j].lengthKm);
        const d = dist(slots.get(fleet[i].id)!, slots.get(fleet[j].id)!);
        expect(d, `${formation}: ${fleet[i].id} – ${fleet[j].id}`).toBeGreaterThanOrEqual(need - 1e-6);
      }
    }
    // Deterministic: the same input gives the same slots.
    const again = assignSlots(fleet, formation);
    for (const s of fleet) expect(again.get(s.id)).toEqual(slots.get(s.id));
  });
});
