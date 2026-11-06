import { describe, expect, it } from 'vitest';
import {
  FLEET_CROWD_PX,
  GROUP_CROWD_PX,
  HYSTERESIS,
  LABEL_ENTER_INSET,
  LABEL_GAP_X,
  LABEL_HOLD_GAP_X,
  LABEL_PRIORITY,
  MAX_LABELS,
  barBox,
  boxesOverlap,
  estimateTextWidth,
  layoutLabels,
  type LabelFleetInfo,
  type LabelGroupInfo,
  type LabelHull,
  type LabelKind,
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

  it('names a crowd whose fleet label finds no room by its battlegroups, and a group whose label finds none by its hulls', () => {
    const groups = new Map<string, LabelGroupInfo>([
      ['a-0', { name: 'SSV Everest', count: 5 }],
      ['b-0', { name: 'SSV Fuji', count: 4 }],
    ]);
    const fleets = new Map<string, LabelFleetInfo>([['fleet-a', { name: 'Sword Fleet (Alliance)', live: 9, deployed: 12 }]]);
    const hulls = [...group('a', 5, 900, 500, 10), ...group('b', 4, 960, 520, 10)];
    // A fleet label too wide for the screen: the two group labels stand in for it.
    const noFleet = (text: string, kind: LabelKind): number => (kind === 'fleet' ? 5000 : estimateTextWidth(text, kind));
    const byGroups = layoutLabels(hulls, opts({ groups, fleets, measure: noFleet }));
    expect(byGroups.collapsed.has('fleet:fleet-a')).toBe(true);
    expect(byGroups.placed.map((l) => l.text).sort()).toEqual(['SSV Everest group · 5', 'SSV Fuji group · 4']);
    expect(byGroups.foldedInto.size).toBe(9);
    // No room for any aggregate label: the hulls are named one by one, and none counts as folded into a label.
    const noAggregate = (text: string, kind: LabelKind): number => (kind === 'ship' ? estimateTextWidth(text, kind) : 5000);
    const byHulls = layoutLabels(hulls, opts({ groups, fleets, measure: noAggregate }));
    expect(byHulls.placed.length).toBeGreaterThan(1);
    expect(byHulls.placed.every((l) => l.kind === 'ship')).toBe(true);
    expect(byHulls.foldedInto.size).toBe(0);
    expect(byHulls.hidden.size).toBe(0);
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

  it('never folds a pair, and folds only hulls too close for their own names', () => {
    // Two hulls of one group 120 px apart (and even 20 px apart) are named one by one.
    const pairGroups = new Map<string, LabelGroupInfo>([['h-0', { name: 'Harbinger', count: 3 }]]);
    for (const gap of [120, 20]) {
      const pair: LabelHull[] = [0, 1].map((i) => ({ id: `rd-${i}`, x: 900, y: 400 + i * gap, size: 7, name: `RD-0${i + 1}`, priority: LABEL_PRIORITY.other, groupId: 'h-0', fleetId: 'reapers' }));
      const out = layoutLabels(pair, opts({ groups: pairGroups }));
      expect(out.collapsed.size).toBe(0);
      expect(out.placed.every((l) => l.kind === 'ship')).toBe(true);
      if (gap === 120) expect(out.placed.map((l) => l.text).sort()).toEqual(['RD-01', 'RD-02']);
    }
    // Three RD-style hulls 70 px apart have room for their short designations: no fold, three names ...
    const groups = new Map<string, LabelGroupInfo>([['rd-0', { name: 'RC-04', count: 3 }]]);
    const triangle = (side: number): LabelHull[] =>
      [0, 1, 2].map((i) => ({ id: `rd-${i}`, x: 960 + (i === 1 ? side : i === 2 ? side / 2 : 0), y: 540 - (i === 2 ? (side * Math.sqrt(3)) / 2 : 0), size: 7, name: `RD-1${i}`, priority: LABEL_PRIORITY.other, groupId: 'rd-0', fleetId: 'reapers' }));
    const roomy = layoutLabels(triangle(70), opts({ groups }));
    expect(roomy.collapsed.size).toBe(0);
    expect(roomy.placed.map((l) => l.text).sort()).toEqual(['RD-10', 'RD-11', 'RD-12']);
    // ... while 20 px apart they fold into "RC-04 group · 3".
    const tight = layoutLabels(triangle(20), opts({ groups }));
    expect(tight.placed.map((l) => l.text)).toEqual(['RC-04 group · 3']);
    // The width test has the hysteresis too: 82-px names (+8 px gap: 90 px) 95 px apart fold only when folded last
    // frame (95 < 90 × 1.25), and 115 px apart never.
    const long = (side: number): LabelHull[] => triangle(side).map((h) => ({ ...h, name: 'SSV Lexington' }));
    expect(layoutLabels(long(95), opts({ groups })).collapsed.size).toBe(0);
    expect(layoutLabels(long(95), opts({ groups, previous: new Set(['group:rd-0']) })).collapsed.has('group:rd-0')).toBe(true);
    expect(layoutLabels(long(115), opts({ groups, previous: new Set(['group:rd-0']) })).collapsed.size).toBe(0);
    // At least three hulls on screen: a group with one of three off the edge is named hull by hull.
    const edge = triangle(20).map((h, i) => (i === 2 ? { ...h, x: -20 } : h));
    expect(layoutLabels(edge, opts({ groups })).collapsed.size).toBe(0);
    // Fleets follow the same rules: two hulls never fold into a fleet label.
    const fleets = new Map<string, LabelFleetInfo>([['reapers', { name: 'Reaper fleet', live: 2, deployed: 21 }]]);
    expect(layoutLabels(triangle(20).slice(0, 2), opts({ fleets })).collapsed.size).toBe(0);
    expect(layoutLabels(triangle(20), opts({ fleets })).placed.map((l) => l.text)).toEqual(['Reaper fleet · 2/21']);
  });

  it("keeps a name shown last frame in its slot while ships move under it; a new or moving name needs a clean slot", () => {
    const a: LabelHull = { id: 'a', x: 500, y: 500, size: 5, name: 'SSV Agincourt', priority: LABEL_PRIORITY.other };
    // Another hull's bracket now lies under a's usual slot (below).
    const b: LabelHull = { id: 'b', x: 480, y: 523, size: 5, name: 'b', priority: LABEL_PRIORITY.other, unnamed: true };
    const fresh = layoutLabels([a, b], opts());
    expect(fresh.placed.map((l) => [l.id, l.slot])).toEqual([['a', 'above']]);
    const held = layoutLabels([a, b], opts({ previousSlots: new Map([['a', 'below' as const]]) }));
    expect(held.placed.map((l) => [l.id, l.slot])).toEqual([['a', 'below']]);
    // A name placed first has drifted within the 8-px spacing of a's slot without touching it: a holds its slot (it
    // needs only the hold gap), where a name taking that slot afresh would have to keep the full spacing.
    // n's name (52 px, right of its bracket) ends at 396 + 6 + 52 = 454 px, 5 px short of a's slot below (459 px on).
    const n: LabelHull = { id: '0n', x: 396, y: 523, size: 2, name: 'SSV Elbe', priority: LABEL_PRIORITY.capital, solo: true };
    const first = layoutLabels([n], opts({ previousSlots: new Map([['0n', 'right' as const]]) })).placed[0];
    expect(first.x + first.w).toBeGreaterThan(459 - LABEL_GAP_X);
    expect(first.x + first.w).toBeLessThanOrEqual(459 - LABEL_HOLD_GAP_X);
    const drifted = layoutLabels([n, a], opts({ previousSlots: new Map([['0n', 'right' as const], ['a', 'below' as const]]) }));
    expect(drifted.placed.map((l) => [l.id, l.slot])).toEqual([['0n', 'right'], ['a', 'below']]);
    expect(layoutLabels([n, a], opts({ previousSlots: new Map([['0n', 'right' as const]]) })).placed.find((l) => l.id === 'a')!.slot).not.toBe('below');
    // At the edge of the view a name appears only well inside it, and once shown holds on to the margin: a hull
    // drifting along the bottom edge does not blink its name.
    const low: LabelHull = { ...a, id: 'low', y: H - 2 - 4 + 5 + 2 }; // its slot above ends 4 px inside the 2-px margin
    expect(layoutLabels([low], opts()).placed).toHaveLength(0);
    expect(layoutLabels([low], opts({ previousSlots: new Map([['low', 'above' as const]]) })).placed.map((l) => l.slot)).toEqual(['above']);
    expect(layoutLabels([{ ...low, y: low.y - LABEL_ENTER_INSET }], opts()).placed.map((l) => l.slot)).toEqual(['above']);
    expect(layoutLabels([{ ...low, y: low.y + 5 }], opts({ previousSlots: new Map([['low', 'above' as const]]) })).placed).toHaveLength(0);
    // Last frame's slot is under a HUD panel now: the name moves, to a clean slot.
    const panel = { x: 440, y: 512, w: 120, h: 30 };
    const moved = layoutLabels([a, b], opts({ blocked: [panel], previousSlots: new Map([['a', 'below' as const]]) }));
    expect(moved.placed.map((l) => [l.id, l.slot])).toEqual([['a', 'above']]);

    // Brackets under every other slot too: a name shown last frame that has to move takes a slot over a bracket
    // rather than vanish and flash back; a new minor name waits for a clean slot; a new capital takes any free slot.
    const crowd: LabelHull[] = [
      { id: 'u1', x: 500, y: 487, size: 5, name: '', priority: LABEL_PRIORITY.other, unnamed: true },
      { id: 'u2', x: 550, y: 500, size: 5, name: '', priority: LABEL_PRIORITY.other, unnamed: true },
      { id: 'u3', x: 450, y: 500, size: 5, name: '', priority: LABEL_PRIORITY.other, unnamed: true },
    ];
    const under = { x: 440, y: 514, w: 120, h: 30 };
    const shown = layoutLabels([a, ...crowd], opts({ blocked: [under], previousSlots: new Map([['a', 'below' as const]]) }));
    expect(shown.placed.map((l) => [l.id, l.slot])).toEqual([['a', 'above']]);
    expect(layoutLabels([a, ...crowd], opts({ blocked: [under] })).placed).toHaveLength(0);
    expect(layoutLabels([{ ...a, priority: LABEL_PRIORITY.capital }, ...crowd], opts({ blocked: [under] })).placed).toHaveLength(1);
  });

  it('keeps every label off the bars the overlay draws, and drops a name\'s bars where they would run into other bars', () => {
    const a: LabelHull = { id: 'a', x: 500, y: 500, size: 5, name: 'SSV Agincourt', priority: LABEL_PRIORITY.other };
    // f's bars lie where a's name would go (below a), though its bracket does not.
    const f: LabelHull = { id: 'f', x: 530, y: 506, size: 5, name: 'SSV Fuji', priority: LABEL_PRIORITY.other };
    expect(layoutLabels([a, f], opts()).placed.find((l) => l.id === 'a')!.slot).toBe('below');
    // Drawn whatever the labels do (the command view, a selected hull): a's name keeps off them.
    const drawn = layoutLabels([a, { ...f, bars: true }], opts());
    const la = drawn.placed.find((l) => l.id === 'a')!;
    expect(la.slot).not.toBe('below');
    for (const l of drawn.placed) if (l.id !== 'f') expect(boxesOverlap(l, barBox(f))).toBe(false);
    // Every label of a crowded command-view scene stays off every other hull's bars.
    const hulls = scene(200, 9).map((h) => ({ ...h, bars: true }));
    const { placed } = layoutLabels(hulls, opts());
    expect(placed.length).toBeGreaterThan(5);
    for (const l of placed) for (const h of hulls) if (!l.members.includes(h.id)) expect(boxesOverlap(l, barBox(h)), `${l.text} on ${h.name}'s bars`).toBe(false);

    // Two named hulls side by side: the second set of bars would overlap the first, so it is dropped.
    const p: LabelHull = { id: 'p', x: 500, y: 500, size: 9, name: 'SSV Hong Kong', priority: LABEL_PRIORITY.capital };
    const q: LabelHull = { id: 'q', x: 520, y: 503, size: 9, name: 'SSV Hyderabad', priority: LABEL_PRIORITY.capital };
    const pair = layoutLabels([p, q], opts({ previousSlots: new Map([['p', 'above' as const]]) }));
    expect(pair.placed.map((l) => l.id)).toEqual(['p', 'q']);
    expect(pair.placed[0].bars).toBeDefined();
    expect(pair.placed[1].bars).toBeUndefined();
    const kept = pair.placed.flatMap((l) => (l.bars ? [l.bars] : []));
    for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) expect(boxesOverlap(kept[i], kept[j])).toBe(false);
  });

  it('in a large battle, leaves out the brackets of the hulls a placed group or fleet label stands for', () => {
    const groups = new Map<string, LabelGroupInfo>([['g-0', { name: 'SSV Everest', count: 6 }]]);
    const hulls = group('g', 6, 960, 540, 12).map((h) => ({ ...h, hideFolded: true }));
    hulls[3] = { ...hulls[3], name: 'SSV Normandy SR-2', priority: LABEL_PRIORITY.named, solo: true, hideFolded: false };
    const out = layoutLabels(hulls, opts({ groups }));
    expect(out.placed.map((l) => l.text)).toEqual(['SSV Normandy SR-2', 'SSV Everest group · 6']);
    expect([...out.hidden].sort()).toEqual(['g-0', 'g-1', 'g-2', 'g-4', 'g-5']);
    // Not over the threshold (no hideFolded): every bracket stays.
    expect(layoutLabels(group('g', 6, 960, 540, 12), opts({ groups })).hidden.size).toBe(0);
    // A folded group whose label finds no room keeps its brackets.
    const walled = layoutLabels(hulls, opts({ groups, blocked: [{ x: 0, y: 0, w: W, h: 515 }, { x: 0, y: 565, w: W, h: H - 565 }, { x: 0, y: 515, w: 935, h: 50 }, { x: 985, y: 515, w: W - 985, h: 50 }] }));
    expect(walled.collapsed.has('group:g-0')).toBe(true);
    expect(walled.placed.some((l) => l.kind === 'group')).toBe(false);
    expect(walled.hidden.size).toBe(0);
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
