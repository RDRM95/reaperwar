/**
 * Overlap-free tactical labels (brief §12, "ship names, large-battle HUD simplification"; stage L2).
 *
 * Every frame the overlay hands this module the hulls it draws (screen position, name, priority, battlegroup and
 * fleet, whether their bars are drawn) and gets back the labels to draw and the hull markers to leave out. Pure and
 * deterministic: no DOM, no clock, no `Math.random`; ties are broken by id, so the same frame always lays out the same
 * way, in the browser and in Node (tests/labelLayout.test.ts).
 *
 * 1. Zoom-aware grouping. A fleet, or else one of its battlegroups, gets one label — "<fleet name> · <live>/<deployed>"
 *    or "<leader name> group · <count>" (Reaper groups carry their capital's designation: "RC-03 group · 4") — when
 *    its hulls crowd on screen: at least `MIN_FOLD` of them (solo hulls aside) are on screen, all within
 *    `fleetCrowdPx` / `groupCrowdPx` of their centre, and nearer each other (their mean nearest-neighbour distance)
 *    than their own names are wide (the median name label's width plus `LABEL_GAP_X`). Fewer hulls, or hulls with room
 *    for their names, are named one by one, so a pair is never folded and zooming in brings the names back. An
 *    aggregate folded last frame stays folded until either measure passes `HYSTERESIS` × its threshold, so a label does
 *    not flicker on a slowly moving camera. Solo hulls — selected, hovered, followed, flagships and named unique hulls
 *    — are never folded into an aggregate. A folded fleet whose label finds no room (step 2) is named by its folded
 *    battlegroups instead, and a folded group whose label finds no room by its hulls, so no crowd goes unnamed.
 * 2. Greedy placement by priority. Labels are placed best first (priority tier, then fleet before group before ship,
 *    then id). A label shown last frame keeps its slot while that slot is still free, whatever bracket has since moved
 *    under it, and needs only `LABEL_HOLD_GAP_X`/`_Y` from the labels placed before it, so names hold still while the
 *    ships move. Otherwise — the label appears, or has to move — it tries below its hull (clear of the hull's bars
 *    and, close up, of its model), above, right and left, and takes the first free slot that leaves every other hull's
 *    bracket uncovered. When no such clean slot is left, a label shown last frame takes any free slot rather than
 *    vanish (and come back a frame later), and so do aggregates and the higher tiers; a minor name (damaged and the
 *    rest) that is not on screen yet waits for a clean slot, so a melee shows its capitals and flagships rather than a
 *    wall of text. Free means wholly on screen and clear of the blocked areas (the HUD panels), of every label already
 *    placed (by `LABEL_GAP_X`/`_Y`) and of every bar drawn: the bars the overlay draws whatever the labels do
 *    (`LabelHull.bars`: the command view's, a selected or hovered hull's) and those that come with a hull's name,
 *    which are kept only where they clear the labels and bars already placed. A label with no slot is skipped, and
 *    placing stops at `maxLabels`.
 * 3. Large battles (brief §12). A hull the overlay marks `hideFolded` (its side is over the large-battle threshold and
 *    it is neither solo nor near the camera) loses its bracket and bars while a placed group or fleet label stands for
 *    it (`LabelLayout.hidden`); the overlay still draws every other hull's bracket.
 */

/** Label priority tiers, best first (brief §12). */
export const LABEL_PRIORITY = {
  /** Selected and hovered hulls. */
  focus: 0,
  /** Flagships and named unique hulls (Normandy, Destiny Ascension, Harbinger, ...). */
  named: 1,
  /** The hull the camera follows. */
  followed: 2,
  capital: 3,
  /** Hulls below `DAMAGED_HULL` of their hull points. */
  damaged: 4,
  other: 5,
} as const;

/** A hull counts as damaged below this fraction of its hull points. */
export const DAMAGED_HULL = 0.5;
/** A battlegroup folds into one label only while its hulls lie within this many CSS px of their centre. */
export const GROUP_CROWD_PX = 64;
/** A whole fleet folds into one label only while its hulls lie within this many CSS px of their centre. */
export const FLEET_CROWD_PX = 128;
/** An aggregate folds only with at least this many of its hulls on screen, solo hulls aside; fewer are named one by one. */
export const MIN_FOLD = 3;
/** A folded aggregate unfolds only past this multiple of its thresholds (no flicker at the boundary). */
export const HYSTERESIS = 1.25;
/** At most this many text labels per frame. */
export const MAX_LABELS = 60;

/** Label box heights (px) and the horizontal padding round the text. */
export const LABEL_METRICS = {
  ship: { h: 12, pad: 4 },
  group: { h: 15, pad: 12 },
  fleet: { h: 17, pad: 14 },
} as const;
/** Clear space under a bracket for its hull and barrier bars (the overlay draws them there). */
export const BAR_SPACE = 10;
/** A hull's bars: their half-width and their top below the bracket (the overlay draws them so). */
export const BAR_HALF_WIDTH = 18;
export const BAR_TOP = 4;
/** Gap between a label and what it labels. */
export const LABEL_GAP = 2;
/** Least space between two labels: across (so names in a row stay apart) and up and down. */
export const LABEL_GAP_X = 8;
export const LABEL_GAP_Y = 2;
/** A label keeping last frame's slot needs only this much space from the labels placed before it, so drifting names do not jostle. */
export const LABEL_HOLD_GAP_X = 2;
export const LABEL_HOLD_GAP_Y = 0;

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LabelKind = 'ship' | 'group' | 'fleet';
export type LabelSlot = 'below' | 'above' | 'right' | 'left';
const SLOTS: readonly LabelSlot[] = ['below', 'above', 'right', 'left'];
const KIND_RANK: Record<LabelKind, number> = { fleet: 0, group: 1, ship: 2 };

/** One hull the overlay draws a bracket for. */
export interface LabelHull {
  id: string;
  /** Projected screen position (CSS px). */
  x: number;
  y: number;
  /** Half-size of the hull's bracket (px). */
  size: number;
  /** Projected half-length of the hull's model (px), when larger than its bracket: a close-up label clears the model. */
  radius?: number;
  /** Display name: the vessel name, or a Reaper's tracking designation. */
  name: string;
  /** `LABEL_PRIORITY` tier. */
  priority: number;
  /** Battlegroup key (fleetGroups.ts); a hull without one is never folded into a group label. */
  groupId?: string;
  /** Fleet id; a hull without one is never folded into a fleet label. */
  fleetId?: string;
  /** Always labelled on its own (selected, hovered, followed, flagship, named): never folded into an aggregate. */
  solo?: boolean;
  /** Its hull and barrier bars are drawn whatever the labels do (the command view's, a selected or hovered hull's): no label covers them. */
  bars?: boolean;
  /** Large battle (brief §12): its bracket and bars are left out while a placed group or fleet label stands for it. */
  hideFolded?: boolean;
  /** Bracketed but never named (craft in the command view): only its bracket and bars count. */
  unnamed?: boolean;
}

export interface LabelGroupInfo {
  /** The leader's display name. */
  name: string;
  /** Live hulls in the group. */
  count: number;
}

export interface LabelFleetInfo {
  name: string;
  live: number;
  deployed: number;
}

export interface PlacedLabel extends LabelBox {
  /** The hull id, `group:<group key>` or `fleet:<fleet id>`. */
  id: string;
  kind: LabelKind;
  text: string;
  priority: number;
  slot: LabelSlot;
  /** What the label names: the hull, or the centre of the aggregate's hulls. */
  ax: number;
  ay: number;
  /** The hulls the label stands for. */
  members: string[];
  /** A hull label's bars (hull and barriers), when the overlay draws them with the name: they cleared what was placed before. */
  bars?: LabelBox;
}

export interface LabelLayoutOptions {
  /** Viewport (CSS px). */
  width: number;
  height: number;
  groups?: ReadonlyMap<string, LabelGroupInfo>;
  fleets?: ReadonlyMap<string, LabelFleetInfo>;
  /** Text width in px (the overlay measures with its canvas); default: a monospace estimate. */
  measure?: (text: string, kind: LabelKind) => number;
  /** Areas no label may cover (the HUD panels). */
  blocked?: readonly LabelBox[];
  maxLabels?: number;
  groupCrowdPx?: number;
  fleetCrowdPx?: number;
  /** Aggregate ids folded last frame (`LabelLayout.collapsed`), for the hysteresis. */
  previous?: ReadonlySet<string>;
  /** Each label's slot last frame (`PlacedLabel.slot`): a label shown last frame keeps it while it is free. */
  previousSlots?: ReadonlyMap<string, LabelSlot>;
  /** Labels keep this far inside the viewport (px). */
  margin?: number;
}

export interface LabelLayout {
  /** The labels to draw, in placement (priority) order. */
  placed: PlacedLabel[];
  /** Aggregates whose hulls crowded this frame (`group:<key>`, `fleet:<id>`), labelled or not: pass back as `previous`. */
  collapsed: Set<string>;
  /** Hull id → the placed aggregate label (`group:<key>`, `fleet:<id>`) that stands for it this frame. */
  foldedInto: Map<string, string>;
  /** Hulls whose bracket and bars the overlay leaves out this frame: `hideFolded` hulls a placed aggregate label stands for. */
  hidden: Set<string>;
}

export const groupLabelText = (leaderName: string, count: number): string => `${leaderName} group · ${count}`;
export const fleetLabelText = (name: string, live: number, deployed: number): string => `${name} · ${live}/${deployed}`;

/** Monospace estimate: 6 px a character at 10 px, 6.6 px at the fleet label's 11 px. */
export const estimateTextWidth = (text: string, kind: LabelKind): number => text.length * (kind === 'fleet' ? 6.6 : 6);

/** Whether two boxes come closer than `gapX` px across or `gapY` px up and down (touching counts as clear at 0). */
export function boxesOverlap(a: LabelBox, b: LabelBox, gapX = 0, gapY = gapX): boolean {
  return a.x < b.x + b.w + gapX && b.x < a.x + a.w + gapX && a.y < b.y + b.h + gapY && b.y < a.y + a.h + gapY;
}

/** The box of a hull's bracket. */
const bracketBox = (h: LabelHull): LabelBox => ({ x: h.x - h.size, y: h.y - h.size, w: 2 * h.size, h: 2 * h.size });
/** The box of a hull's bars, as the overlay draws them under its bracket (a pixel of slack all round vertically). */
export const barBox = (h: { x: number; y: number; size: number }): LabelBox => ({ x: h.x - BAR_HALF_WIDTH, y: h.y + h.size + BAR_TOP, w: 2 * BAR_HALF_WIDTH, h: BAR_SPACE - BAR_TOP + 1 });

interface Candidate {
  id: string;
  kind: LabelKind;
  text: string;
  priority: number;
  ax: number;
  ay: number;
  /** What the label must not cover and sits round: the bracket (and bars), or the aggregate's brackets and drawn bars. */
  anchor: { x0: number; y0: number; x1: number; y1: number };
  members: string[];
  /** A hull's bars that come with its name (not drawn otherwise), which later labels keep clear of once it is placed. */
  bars?: LabelBox;
  /** An aggregate's stand-ins when its label finds no room: a fleet's crowded groups and other hulls, a group's hulls. */
  fallback?: () => Candidate[];
}

/** Boxes of hulls (brackets, drawn bars) in a coarse screen grid, for the "covers another hull's ..." tests. */
class BoxGrid {
  private readonly cells = new Map<number, { id: string; box: LabelBox }[]>();
  private static readonly CELL = 64;
  constructor(entries: readonly { id: string; box: LabelBox }[]) {
    for (const e of entries) {
      this.each(e.box, (k) => {
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(e);
      });
    }
  }
  private each(b: LabelBox, f: (key: number) => void): void {
    const C = BoxGrid.CELL;
    for (let gx = Math.floor(b.x / C); gx <= Math.floor((b.x + b.w) / C); gx++) for (let gy = Math.floor(b.y / C); gy <= Math.floor((b.y + b.h) / C); gy++) f((gx + 4096) * 8192 + (gy + 4096));
  }
  /** Whether the box overlaps an entry of a hull not in `own`. */
  hits(b: LabelBox, own: readonly string[]): boolean {
    if (this.cells.size === 0) return false;
    let hit = false;
    this.each(b, (k) => {
      if (hit) return;
      for (const e of this.cells.get(k) ?? []) {
        if (boxesOverlap(b, e.box) && !own.includes(e.id)) {
          hit = true;
          return;
        }
      }
    });
    return hit;
  }
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A binary min-heap: the placement queue, which an aggregate's fallback joins wherever its order puts it. */
class Queue<T> {
  private readonly items: T[] = [];
  constructor(private readonly before: (a: T, b: T) => number) {}
  get size(): number {
    return this.items.length;
  }
  push(item: T): void {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (this.before(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last !== undefined) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.before(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.before(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Centre and spread (largest distance from the centre) of a set of hulls, and the box round their brackets and drawn bars. */
function cluster(hulls: readonly LabelHull[]): { cx: number; cy: number; spread: number; x0: number; y0: number; x1: number; y1: number } {
  let cx = 0;
  let cy = 0;
  for (const h of hulls) {
    cx += h.x;
    cy += h.y;
  }
  cx /= hulls.length;
  cy /= hulls.length;
  let spread = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const h of hulls) {
    spread = Math.max(spread, Math.hypot(h.x - cx, h.y - cy));
    x0 = Math.min(x0, h.x - h.size);
    y0 = Math.min(y0, h.y - h.size);
    x1 = Math.max(x1, h.x + h.size);
    y1 = Math.max(y1, h.y + h.size);
    if (h.bars) {
      // Bars drawn under a member stay clear of its aggregate's own label too.
      const b = barBox(h);
      x0 = Math.min(x0, b.x);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
  }
  return { cx, cy, spread, x0, y0, x1, y1 };
}

/** Mean distance from each hull to its nearest neighbour among `hulls` (px; two or more hulls). Exact: a sweep in x. */
function meanNearest(hulls: readonly LabelHull[]): number {
  const pts = [...hulls].sort((a, b) => a.x - b.x || byId(a, b));
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let best = Infinity;
    for (let j = i - 1; j >= 0 && p.x - pts[j].x < best; j--) best = Math.min(best, Math.hypot(p.x - pts[j].x, p.y - pts[j].y));
    for (let j = i + 1; j < pts.length && pts[j].x - p.x < best; j++) best = Math.min(best, Math.hypot(p.x - pts[j].x, p.y - pts[j].y));
    sum += best;
  }
  return sum / pts.length;
}

/** The box a label of size w × h takes in one slot round its anchor. */
function slotBox(c: Candidate, slot: LabelSlot, w: number, h: number): LabelBox {
  const { x0, y0, x1, y1 } = c.anchor;
  switch (slot) {
    case 'below':
      return { x: c.ax - w / 2, y: y1 + LABEL_GAP, w, h };
    case 'above':
      return { x: c.ax - w / 2, y: y0 - LABEL_GAP - h, w, h };
    case 'right':
      return { x: x1 + LABEL_GAP + 2, y: c.ay - h / 2, w, h };
    case 'left':
      return { x: x0 - LABEL_GAP - 2 - w, y: c.ay - h / 2, w, h };
  }
}

/** Lay out one frame's labels (see the module comment). */
export function layoutLabels(hulls: readonly LabelHull[], opts: LabelLayoutOptions): LabelLayout {
  const measure = opts.measure ?? estimateTextWidth;
  const maxLabels = opts.maxLabels ?? MAX_LABELS;
  const groupCrowd = opts.groupCrowdPx ?? GROUP_CROWD_PX;
  const fleetCrowd = opts.fleetCrowdPx ?? FLEET_CROWD_PX;
  const margin = opts.margin ?? 2;
  const previous = opts.previous;
  const collapsed = new Set<string>();
  const foldedInto = new Map<string, string>();
  // Input order never matters: everything below walks hulls, groups and fleets by id.
  const sorted = [...hulls].sort(byId);
  const nameWidth = (h: LabelHull): number => Math.ceil(measure(h.name, 'ship')) + LABEL_METRICS.ship.pad;
  /** Whether an aggregate's hulls crowd too much for their own names (module comment, 1); the cheap tests first. */
  const crowded = (key: string, members: readonly LabelHull[], spread: number, spreadPx: number): boolean => {
    const k = previous?.has(key) ? HYSTERESIS : 1;
    let onScreen = 0;
    for (const m of members) if (m.x >= 0 && m.y >= 0 && m.x <= opts.width && m.y <= opts.height) onScreen++;
    if (onScreen < MIN_FOLD || spread >= spreadPx * k) return false;
    const widths = members.map(nameWidth).sort((a, b) => a - b);
    const limit = (widths[widths.length >> 1] + LABEL_GAP_X) * k;
    // Every hull lies within `spread` of the centre, so none is more than 2 × spread from its nearest neighbour.
    return 2 * spread < limit || meanNearest(members) < limit;
  };
  const foldable = (h: LabelHull): boolean => !h.solo && !h.unnamed;
  /** A hull's own name, outside its bracket and bars (and close up its model). */
  const shipCandidate = (h: LabelHull): Candidate => {
    const r = Math.max(h.size, h.radius ?? 0);
    return {
      id: h.id,
      kind: 'ship',
      text: h.name,
      priority: h.priority,
      ax: h.x,
      ay: h.y,
      anchor: { x0: h.x - r, y0: h.y - r, x1: h.x + r, y1: Math.max(h.y + r, h.y + h.size + BAR_SPACE) },
      members: [h.id],
      ...(h.bars ? {} : { bars: barBox(h) }),
    };
  };
  /** Hulls by fleet or battlegroup key, in id order. */
  const by = (key: (h: LabelHull) => string | undefined, pool: readonly LabelHull[]): Map<string, LabelHull[]> => {
    const out = new Map<string, LabelHull[]>();
    for (const h of pool) {
      const k = key(h);
      if (k === undefined) continue;
      let list = out.get(k);
      if (!list) out.set(k, (list = []));
      list.push(h);
    }
    return out;
  };
  /**
   * The candidates standing for a pool of hulls: a label for each crowded fleet (`fleets`) or else each crowded
   * battlegroup, and every other hull's own name. An aggregate's fallback — its groups, or its hulls — is only built
   * if its label finds no room.
   */
  const stand = (pool: readonly LabelHull[], fleets: boolean): Candidate[] => {
    const out: Candidate[] = [];
    const taken = new Set<string>();
    /** Fold the crowded fleets or groups of the pool (`label`: an aggregate's text, undefined when it is unknown). */
    const fold = (kind: 'fleet' | 'group', key: (h: LabelHull) => string | undefined, label: (id: string) => string | undefined): void => {
      const lists = by((h) => (foldable(h) && !taken.has(h.id) ? key(h) : undefined), pool);
      for (const id of [...lists.keys()].sort()) {
        const members = lists.get(id)!;
        const text = label(id);
        if (text === undefined || members.length < MIN_FOLD) continue;
        const aggregateId = `${kind}:${id}`;
        const c = cluster(members);
        if (!crowded(aggregateId, members, c.spread, kind === 'fleet' ? fleetCrowd : groupCrowd)) continue;
        collapsed.add(aggregateId);
        for (const m of members) taken.add(m.id);
        out.push({
          id: aggregateId,
          kind,
          text,
          priority: Math.min(...members.map((m) => m.priority)),
          ax: c.cx,
          ay: c.cy,
          anchor: c,
          members: members.map((m) => m.id),
          fallback: () => (kind === 'fleet' ? stand(members, false) : members.map(shipCandidate)),
        });
      }
    };
    const { fleets: fleetInfo, groups: groupInfo } = opts;
    if (fleets && fleetInfo) {
      fold('fleet', (h) => h.fleetId, (id) => {
        const f = fleetInfo.get(id);
        return f && fleetLabelText(f.name, f.live, f.deployed);
      });
    }
    if (groupInfo) {
      fold('group', (h) => h.groupId, (id) => {
        const g = groupInfo.get(id);
        return g && groupLabelText(g.name, g.count);
      });
    }
    for (const h of pool) if (!h.unnamed && !taken.has(h.id)) out.push(shipCandidate(h));
    return out;
  };
  // Crowded fleets, crowded battlegroups among the rest and every other hull, placed best first.
  const queue = new Queue<Candidate>((a, b) => a.priority - b.priority || KIND_RANK[a.kind] - KIND_RANK[b.kind] || byId(a, b));
  for (const c of stand(sorted, true)) queue.push(c);
  const placed: PlacedLabel[] = [];
  /** The bars that came with the names placed so far. */
  const bars: LabelBox[] = [];
  const blocked = opts.blocked ?? [];
  // Every bracket and every always-drawn bar counts here, those of hulls that may yet be hidden too: the hiding
  // follows the placing, and a label never has to give way to a bracket or bar that comes back.
  const brackets = new BoxGrid(sorted.map((h) => ({ id: h.id, box: bracketBox(h) })));
  const fixedBars = new BoxGrid(sorted.filter((h) => h.bars).map((h) => ({ id: h.id, box: barBox(h) })));
  const free = (box: LabelBox, own: readonly string[], gapX = LABEL_GAP_X, gapY = LABEL_GAP_Y): boolean =>
    box.x >= margin &&
    box.y >= margin &&
    box.x + box.w <= opts.width - margin &&
    box.y + box.h <= opts.height - margin &&
    !blocked.some((b) => boxesOverlap(box, b)) &&
    !placed.some((p) => boxesOverlap(box, p, gapX, gapY)) &&
    !bars.some((b) => boxesOverlap(box, b)) &&
    !fixedBars.hits(box, own);
  while (queue.size > 0 && placed.length < maxLabels) {
    const c = queue.pop()!;
    const m = LABEL_METRICS[c.kind];
    const w = Math.ceil(measure(c.text, c.kind)) + m.pad;
    const h = m.h;
    const last = opts.previousSlots?.get(c.id);
    let pick: { box: LabelBox; slot: LabelSlot } | undefined;
    // Shown last frame: it holds its slot while that is free (by the hold gaps), whatever bracket moved under it.
    if (last) {
      const box = slotBox(c, last, w, h);
      if (free(box, c.members, LABEL_HOLD_GAP_X, LABEL_HOLD_GAP_Y)) pick = { box, slot: last };
    }
    // Appearing or moving: the first clean free slot; failing that, any free slot, but not for a minor name appearing.
    if (!pick) {
      let fallback: { box: LabelBox; slot: LabelSlot } | undefined;
      for (const slot of SLOTS) {
        if (slot === last) continue;
        const box = slotBox(c, slot, w, h);
        if (!free(box, c.members)) continue;
        if (!brackets.hits(box, c.members)) {
          pick = { box, slot };
          break;
        }
        fallback ??= { box, slot };
      }
      const minor = c.kind === 'ship' && c.priority > LABEL_PRIORITY.capital;
      if (!pick && fallback && (!minor || last !== undefined)) pick = fallback;
    }
    if (!pick) {
      // An aggregate with no room hands over to its groups or hulls, which come after it (its priority is their best).
      for (const f of c.fallback?.() ?? []) queue.push(f);
      continue;
    }
    // A hull's bars come with its name only where they clear the labels and bars already placed.
    const own = c.bars;
    const keepBars = own !== undefined && !placed.some((p) => boxesOverlap(own, p)) && !bars.some((b) => boxesOverlap(own, b)) && !fixedBars.hits(own, c.members);
    placed.push({ ...pick.box, id: c.id, kind: c.kind, text: c.text, priority: c.priority, slot: pick.slot, ax: c.ax, ay: c.ay, members: c.members, ...(keepBars ? { bars: own } : {}) });
    if (keepBars) bars.push(own);
    if (c.kind !== 'ship') for (const id of c.members) foldedInto.set(id, c.id);
  }

  // Large battles: a placed aggregate label stands for its `hideFolded` hulls, whose brackets and bars are left out.
  const hidden = new Set<string>();
  for (const h of sorted) if (h.hideFolded && foldedInto.has(h.id)) hidden.add(h.id);
  return { placed, collapsed, foldedInto, hidden };
}
