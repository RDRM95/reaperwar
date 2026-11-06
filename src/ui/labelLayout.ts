/**
 * Overlap-free tactical labels (brief §12, "ship names, large-battle HUD simplification"; stage L2).
 *
 * Every frame the overlay hands this module the hulls it could name (screen position, name, priority, battlegroup and
 * fleet) and gets back the labels to draw. Pure and deterministic: no DOM, no clock, no `Math.random`; ties are broken
 * by id, so the same frame always lays out the same way, in the browser and in Node (tests/labelLayout.test.ts).
 *
 * 1. Zoom-aware grouping. When the hulls of one fleet crowd on screen (their projected spread, the largest distance of
 *    a member from their centre, under `fleetCrowdPx`) the fleet gets one label, "<fleet name> · <live>/<deployed>";
 *    otherwise, when the hulls of one battlegroup crowd (spread under `groupCrowdPx`), the group gets one label,
 *    "<leader name> group · <count>" (Reaper groups carry their capital's designation: "RC-03 group · 4"). Zooming
 *    in spreads the hulls and their own names come back. An aggregate that was drawn last frame stays until its
 *    spread passes `HYSTERESIS` × its threshold, so a label does not flicker on a slowly moving camera. Solo hulls —
 *    selected, hovered, followed, flagships and named unique hulls — are never folded into an aggregate.
 * 2. Greedy placement by priority. Labels are placed best first (priority tier, then fleet before group before ship,
 *    then id): each tries its slots — below its bracket, above, right, left — and takes the first that lies wholly on
 *    screen, clear of the blocked areas (the HUD panels) and of every label already placed; a label with no free slot
 *    is skipped, and placing stops at `maxLabels`. Only text is culled: the overlay still draws every hull's bracket.
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
/** A battlegroup folds into one label when its projected spread is under this many CSS px. */
export const GROUP_CROWD_PX = 64;
/** A whole fleet folds into one label when its projected spread is under this many CSS px. */
export const FLEET_CROWD_PX = 128;
/** A folded aggregate unfolds only past this multiple of its threshold (no flicker at the boundary). */
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
/** Gap between a label and what it labels, and the least space between two labels. */
export const LABEL_GAP = 2;

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

/** One hull the overlay may name. */
export interface LabelHull {
  id: string;
  /** Projected screen position (CSS px). */
  x: number;
  y: number;
  /** Half-size of the hull's bracket (px). */
  size: number;
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
  /** Labels keep this far inside the viewport (px). */
  margin?: number;
}

export interface LabelLayout {
  /** The labels to draw, in placement (priority) order. */
  placed: PlacedLabel[];
  /** Aggregates that stood for their hulls this frame (`group:<key>`, `fleet:<id>`): pass back as `previous`. */
  collapsed: Set<string>;
  /** Hull id → the aggregate id that stands for it this frame. */
  foldedInto: Map<string, string>;
}

export const groupLabelText = (leaderName: string, count: number): string => `${leaderName} group · ${count}`;
export const fleetLabelText = (name: string, live: number, deployed: number): string => `${name} · ${live}/${deployed}`;

/** Monospace estimate: 6 px a character at 10 px, 6.6 px at the fleet label's 11 px. */
export const estimateTextWidth = (text: string, kind: LabelKind): number => text.length * (kind === 'fleet' ? 6.6 : 6);

/** Whether two boxes come closer than `gap` px (touching counts as clear at gap 0). */
export function boxesOverlap(a: LabelBox, b: LabelBox, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

interface Candidate {
  id: string;
  kind: LabelKind;
  text: string;
  priority: number;
  ax: number;
  ay: number;
  /** What the label must not cover and sits round: the bracket (and bars), or the aggregate's brackets. */
  anchor: { x0: number; y0: number; x1: number; y1: number };
  members: string[];
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Centre and spread (largest distance from the centre) of a set of hulls, and the box round their brackets. */
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
  }
  return { cx, cy, spread, x0, y0, x1, y1 };
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
  const candidates: Candidate[] = [];
  // Input order never matters: everything below walks hulls, groups and fleets by id.
  const sorted = [...hulls].sort(byId);
  const crowded = (key: string, spread: number, threshold: number): boolean => spread < threshold * (previous?.has(key) ? HYSTERESIS : 1);

  // Fleets first: a crowded fleet stands for all its hulls but the solo ones.
  if (opts.fleets) {
    const byFleet = new Map<string, LabelHull[]>();
    for (const h of sorted) {
      if (h.solo || h.fleetId === undefined || !opts.fleets.has(h.fleetId)) continue;
      let list = byFleet.get(h.fleetId);
      if (!list) byFleet.set(h.fleetId, (list = []));
      list.push(h);
    }
    for (const fleetId of [...byFleet.keys()].sort()) {
      const members = byFleet.get(fleetId)!;
      if (members.length < 2) continue;
      const key = `fleet:${fleetId}`;
      const c = cluster(members);
      if (!crowded(key, c.spread, fleetCrowd)) continue;
      const info = opts.fleets.get(fleetId)!;
      collapsed.add(key);
      for (const m of members) foldedInto.set(m.id, key);
      candidates.push({
        id: key,
        kind: 'fleet',
        text: fleetLabelText(info.name, info.live, info.deployed),
        priority: Math.min(...members.map((m) => m.priority)),
        ax: c.cx,
        ay: c.cy,
        anchor: c,
        members: members.map((m) => m.id),
      });
    }
  }

  // Then battlegroups whose fleet did not fold.
  if (opts.groups) {
    const byGroup = new Map<string, LabelHull[]>();
    for (const h of sorted) {
      if (h.solo || h.groupId === undefined || foldedInto.has(h.id) || !opts.groups.has(h.groupId)) continue;
      let list = byGroup.get(h.groupId);
      if (!list) byGroup.set(h.groupId, (list = []));
      list.push(h);
    }
    for (const groupId of [...byGroup.keys()].sort()) {
      const members = byGroup.get(groupId)!;
      if (members.length < 2) continue;
      const key = `group:${groupId}`;
      const c = cluster(members);
      if (!crowded(key, c.spread, groupCrowd)) continue;
      const info = opts.groups.get(groupId)!;
      collapsed.add(key);
      for (const m of members) foldedInto.set(m.id, key);
      candidates.push({
        id: key,
        kind: 'group',
        text: groupLabelText(info.name, info.count),
        priority: Math.min(...members.map((m) => m.priority)),
        ax: c.cx,
        ay: c.cy,
        anchor: c,
        members: members.map((m) => m.id),
      });
    }
  }

  // Every hull no aggregate stands for is named on its own.
  for (const h of sorted) {
    if (foldedInto.has(h.id)) continue;
    candidates.push({
      id: h.id,
      kind: 'ship',
      text: h.name,
      priority: h.priority,
      ax: h.x,
      ay: h.y,
      anchor: { x0: h.x - h.size, y0: h.y - h.size, x1: h.x + h.size, y1: h.y + h.size + BAR_SPACE },
      members: [h.id],
    });
  }

  candidates.sort((a, b) => a.priority - b.priority || KIND_RANK[a.kind] - KIND_RANK[b.kind] || byId(a, b));
  const placed: PlacedLabel[] = [];
  const blocked = opts.blocked ?? [];
  for (const c of candidates) {
    if (placed.length >= maxLabels) break;
    const m = LABEL_METRICS[c.kind];
    const w = Math.ceil(measure(c.text, c.kind)) + m.pad;
    const h = m.h;
    for (const slot of SLOTS) {
      const box = slotBox(c, slot, w, h);
      if (box.x < margin || box.y < margin || box.x + box.w > opts.width - margin || box.y + box.h > opts.height - margin) continue;
      if (blocked.some((b) => boxesOverlap(box, b))) continue;
      if (placed.some((p) => boxesOverlap(box, p, LABEL_GAP))) continue;
      placed.push({ ...box, id: c.id, kind: c.kind, text: c.text, priority: c.priority, slot, ax: c.ax, ay: c.ay, members: c.members });
      break;
    }
  }
  return { placed, collapsed, foldedInto };
}
