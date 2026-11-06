import { describe, expect, it } from 'vitest';
import {
  FLEET_CROWD_PX,
  GROUP_CROWD_PX,
  HYSTERESIS,
  LABEL_PRIORITY,
  MAX_LABELS,
  boxesOverlap,
  layoutLabels,
  type LabelFleetInfo,
  type LabelGroupInfo,
  type LabelHull,
  type LabelLayoutOptions,
} from '@/ui/labelLayout';
import { battlegroups, fleetSummaries } from '@/ui/fleetGroups';
import { BattleSimulation } from '@/simulation/battle';
import { buildScenario } from '@/scenarios';

/** A seeded generator for the test scenes (the layout itself draws no random numbers). */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const W = 1920;
const H = 1080;

/** A crowded scene: n hulls in a few dense clusters and a scattered field, mixed priorities. */
function scene(n: number, seed = 7): LabelHull[] {
  const r = lcg(seed);
  const out: LabelHull[] = [];
  for (let i = 0; i < n; i++) {
    const cluster = i % 3 === 0;
    const cx = cluster ? 600 + (i % 5) * 40 : r() * W;
    const cy = cluster ? 500 + (i % 7) * 12 : r() * H;
    out.push({
      id: `ship-${String(i).padStart(3, '0')}`,
      x: cx + (r() - 0.5) * 30,
      y: cy + (r() - 0.5) * 30,
      size: [5, 7, 9][i % 3],
      name: `SSV Vessel ${i}`,
      priority: [LABEL_PRIORITY.capital, LABEL_PRIORITY.damaged, LABEL_PRIORITY.other, LABEL_PRIORITY.other][i % 4],
    });
  }
  return out;
}

const opts = (extra: Partial<LabelLayoutOptions> = {}): LabelLayoutOptions => ({ width: W, height: H, ...extra });

/** One battlegroup of `n` hulls round (x, y), `spread` px from its centre. */
function group(prefix: string, n: number, x: number, y: number, spread: number, fleetId = 'fleet-a'): LabelHull[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return {
      id: `${prefix}-${i}`,
      x: x + (i === 0 ? 0 : spread * Math.cos(a)),
      y: y + (i === 0 ? 0 : spread * Math.sin(a)),
      size: i === 0 ? 9 : 5,
      name: i === 0 ? `${prefix.toUpperCase()} Lead` : `${prefix} escort ${i}`,
      priority: i === 0 ? LABEL_PRIORITY.capital : LABEL_PRIORITY.other,
      groupId: `${prefix}-0`,
      fleetId,
    };
  });
}

describe('label layout (brief §12, stage L2)', () => {
  it('never places two labels that overlap, and keeps every label on screen and under the cap', () => {
    for (const seed of [1, 2, 3, 42]) {
      const { placed } = layoutLabels(scene(300, seed), opts());
      expect(placed.length).toBeGreaterThan(10);
      expect(placed.length).toBeLessThanOrEqual(MAX_LABELS);
      for (let i = 0; i < placed.length; i++) {
        const a = placed[i];
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(W);
        expect(a.y + a.h).toBeLessThanOrEqual(H);
        for (let j = i + 1; j < placed.length; j++) expect(boxesOverlap(a, placed[j]), `${a.id} overlaps ${placed[j].id}`).toBe(false);
      }
    }
  });

  it('places labels in priority order: a selected hull buried in a pile always keeps its name', () => {
    const pile: LabelHull[] = Array.from({ length: 40 }, (_, i) => ({ id: `a${String(i).padStart(2, '0')}`, x: 900 + (i % 4), y: 500 + (i % 3), size: 9, name: `Capital ${i}`, priority: LABEL_PRIORITY.capital }));
    const selected: LabelHull = { id: 'zzz-selected', x: 901, y: 501, size: 5, name: 'SSV Normandy SR-2', priority: LABEL_PRIORITY.focus, solo: true };
    for (const order of [[selected, ...pile], [...pile, selected], [...pile.slice(0, 20), selected, ...pile.slice(20)]]) {
      const { placed } = layoutLabels(order, opts());
      expect(placed[0].id).toBe('zzz-selected');
      expect(placed[0].slot).toBe('below');
    }
    // Placement order never puts a lower tier ahead of a higher one.
    const { placed } = layoutLabels(scene(300), opts());
    for (let i = 1; i < placed.length; i++) expect(placed[i].priority).toBeGreaterThanOrEqual(placed[i - 1].priority);
    // A label of the best tier is dropped only when it cannot fit at all: alone, every tier is placed.
    const lone = layoutLabels([{ id: 'x', x: 300, y: 300, size: 5, name: 'Lone frigate', priority: LABEL_PRIORITY.other }], opts());
    expect(lone.placed.map((l) => l.id)).toEqual(['x']);
  });

  it('is deterministic: the same frame lays out the same way whatever the input order', () => {
    const hulls = [...scene(200, 5), ...group('rc', 5, 1500, 300, 12, 'reapers')];
    const groups = new Map<string, LabelGroupInfo>([['rc-0', { name: 'RC-03', count: 5 }]]);
    const a = layoutLabels(hulls, opts({ groups }));
    const b = layoutLabels(hulls, opts({ groups }));
    const c = layoutLabels([...hulls].reverse(), opts({ groups }));
    expect(b.placed).toEqual(a.placed);
    expect(c.placed).toEqual(a.placed);
    expect([...c.collapsed].sort()).toEqual([...a.collapsed].sort());
  });

  it('folds a crowded battlegroup into one group label at its centre, and zooming in brings the names back', () => {
    const groups = new Map<string, LabelGroupInfo>([['rc-0', { name: 'RC-03', count: 4 }]]);
    const crowded = group('rc', 4, 960, 540, 14);
    const near = layoutLabels(crowded, opts({ groups }));
    expect(near.placed).toHaveLength(1);
    const g = near.placed[0];
    expect(g.kind).toBe('group');
    expect(g.text).toBe('RC-03 group · 4');
    expect(g.members.sort()).toEqual(['rc-0', 'rc-1', 'rc-2', 'rc-3']);
    // At the group's centre: centred on the centroid, just clear of its brackets.
    const cx = crowded.reduce((s, h) => s + h.x, 0) / crowded.length;
    expect(g.ax).toBeCloseTo(cx, 6);
    expect(Math.abs(g.x + g.w / 2 - cx)).toBeLessThan(1e-6);
    expect(g.y).toBeGreaterThan(540);
    expect(g.y).toBeLessThan(540 + 14 + 9 + 10);
    expect(near.collapsed.has('group:rc-0')).toBe(true);

    // Zoomed in: the same hulls spread ten times wider are named one by one.
    const spread = group('rc', 4, 960, 540, 140);
    const far = layoutLabels(spread, opts({ groups }));
    expect(far.placed.map((l) => l.kind)).toEqual(['ship', 'ship', 'ship', 'ship']);
    expect(far.placed.map((l) => l.text).sort()).toEqual(['RC Lead', 'rc escort 1', 'rc escort 2', 'rc escort 3'].sort());
    expect(far.collapsed.size).toBe(0);
  });

  it('keeps solo hulls (selected, flagship, followed) named on their own inside a folded group', () => {
    const groups = new Map<string, LabelGroupInfo>([['g-0', { name: 'SSV Everest', count: 6 }]]);
    const hulls = group('g', 6, 960, 540, 12);
    hulls[3] = { ...hulls[3], name: 'SSV Normandy SR-2', priority: LABEL_PRIORITY.named, solo: true };
    const { placed } = layoutLabels(hulls, opts({ groups }));
    expect(placed.map((l) => l.text)).toEqual(['SSV Normandy SR-2', 'SSV Everest group · 6']);
    expect(placed[1].members).not.toContain('g-3');
  });

  it('folds a whole crowded fleet into one fleet label with live and deployed counts', () => {
    const groups = new Map<string, LabelGroupInfo>([
      ['a-0', { name: 'SSV Everest', count: 5 }],
      ['b-0', { name: 'SSV Fuji', count: 4 }],
    ]);
    const fleets = new Map<string, LabelFleetInfo>([['fleet-a', { name: 'Sword Fleet (Alliance)', live: 9, deployed: 12 }]]);
    const hulls = [...group('a', 5, 900, 500, 10), ...group('b', 4, 960, 520, 10)];
    const tight = layoutLabels(hulls, opts({ groups, fleets }));
    expect(tight.placed.map((l) => l.text)).toEqual(['Sword Fleet (Alliance) · 9/12']);
    expect(tight.placed[0].kind).toBe('fleet');
    expect(tight.placed[0].members).toHaveLength(9);
    // Pulled apart, the fleet shows its two battlegroups; further apart, every hull.
    const apart = layoutLabels([...group('a', 5, 500, 500, 10), ...group('b', 4, 1400, 520, 10)], opts({ groups, fleets }));
    expect(apart.placed.map((l) => l.text).sort()).toEqual(['SSV Everest group · 5', 'SSV Fuji group · 4']);
    const wide = layoutLabels([...group('a', 5, 500, 500, 150), ...group('b', 4, 1400, 520, 150)], opts({ groups, fleets }));
    expect(wide.placed.every((l) => l.kind === 'ship')).toBe(true);
    expect(wide.placed).toHaveLength(9);
  });

  it('holds a folded label until the spread clearly passes the threshold (no flicker)', () => {
    const groups = new Map<string, LabelGroupInfo>([['rc-0', { name: 'RC-01', count: 4 }]]);
    const justOver = group('rc', 4, 960, 540, GROUP_CROWD_PX * 1.1);
    expect(layoutLabels(justOver, opts({ groups })).collapsed.size).toBe(0);
    const held = layoutLabels(justOver, opts({ groups, previous: new Set(['group:rc-0']) }));
    expect(held.placed.map((l) => l.kind)).toEqual(['group']);
    const clear = layoutLabels(group('rc', 4, 960, 540, GROUP_CROWD_PX * HYSTERESIS * 1.05), opts({ groups, previous: new Set(['group:rc-0']) }));
    expect(clear.collapsed.size).toBe(0);
    expect(FLEET_CROWD_PX).toBeGreaterThan(GROUP_CROWD_PX);
  });

  it("keeps a label in last frame's slot while it still fits, so names do not hop round their hulls", () => {
    const hull: LabelHull = { id: 'k', x: 800, y: 400, size: 9, name: 'SSV Kilimanjaro', priority: LABEL_PRIORITY.named, solo: true };
    expect(layoutLabels([hull], opts()).placed[0].slot).toBe('below');
    const held = layoutLabels([hull], opts({ previousSlots: new Map([['k', 'above' as const]]) }));
    expect(held.placed[0].slot).toBe('above');
    // When last frame's slot no longer fits, the usual order takes over.
    const edge = layoutLabels([{ ...hull, y: 8 }], opts({ previousSlots: new Map([['k', 'above' as const]]) }));
    expect(edge.placed[0].slot).toBe('below');
  });

  it('skips labels that would leave the screen or cover a HUD panel, trying the other slots first', () => {
    const edge = layoutLabels([{ id: 'e', x: 960, y: H - 4, size: 9, name: 'Bottom edge', priority: LABEL_PRIORITY.capital }], opts());
    expect(edge.placed).toHaveLength(1);
    expect(edge.placed[0].slot).toBe('above');
    const off = layoutLabels([{ id: 'o', x: -30, y: -30, size: 9, name: 'Off screen', priority: LABEL_PRIORITY.capital }], opts());
    expect(off.placed).toHaveLength(0);
    const panel = { x: 0, y: 0, w: 320, h: H };
    const under = layoutLabels([{ id: 'u', x: 150, y: 500, size: 9, name: 'Under the fleet list', priority: LABEL_PRIORITY.capital }], opts({ blocked: [panel] }));
    expect(under.placed).toHaveLength(0);
    const beside = layoutLabels([{ id: 'b', x: 330, y: 500, size: 5, name: 'Beside the fleet list', priority: LABEL_PRIORITY.capital }], opts({ blocked: [panel] }));
    expect(beside.placed[0].slot).toBe('right');
    expect(boxesOverlap(beside.placed[0], panel)).toBe(false);
    const capped = layoutLabels(scene(300), opts({ maxLabels: 5 }));
    expect(capped.placed).toHaveLength(5);
  });

  it("names the battlegroups 0.12.3's formations give the Final Battle's hulls, Reapers by their capital's designation", () => {
    const sim = new BattleSimulation(buildScenario('final_battle_of_earth', 'canon_me3', 42, {}));
    const bg = battlegroups(sim.ships);
    const hulls = sim.ships.filter((s) => s.role !== 'fighter');
    expect(bg.groupOf.size).toBe(hulls.length);
    for (const s of hulls) {
      const g = bg.groups.get(bg.groupOf.get(s.id)!)!;
      expect(g.fleetId).toBe(s.fleetId);
      expect(g.members).toContain(s);
      if (s.groupLeaderId) expect(g.leader.id).toBe(s.groupLeaderId);
    }
    const reaperGroups = [...bg.groups.values()].filter((g) => g.leader.faction === 'reaper');
    expect(reaperGroups.length).toBeGreaterThan(3);
    for (const g of reaperGroups) expect(g.leader.name).toMatch(/^(RC-\d\d|Harbinger)$/);
    const fleets = fleetSummaries(sim.ships, sim.fleets, bg);
    const alliance = fleets.find((f) => f.id === 'sword-alliance')!;
    expect(alliance.live.length).toBe(alliance.deployed);
    expect(alliance.groups.reduce((n, g) => n + g.members.length, 0)).toBe(alliance.deployed);
    expect(alliance.hull).toBeCloseTo(1, 6);
    // A lost leader's group is named after its most valuable surviving hull.
    const lead = alliance.groups[0].leader;
    lead.alive = false;
    const after = battlegroups(sim.ships).groups.get(lead.id);
    if (after && after.live.length > 0) expect(after.leader.id).not.toBe(lead.id);
  });
});
