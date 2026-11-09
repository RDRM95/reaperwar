import type { BattleView } from '@/rendering/battleView';
import type { ShipState } from '@/simulation/types';
import { FACTIONS } from '@/data/factions';
import { RESERVED_NAMES } from '@/data/names';
import { isCapitalRole } from '@/data/types';
import { battlegroups, inFight } from './fleetGroups';
import { DAMAGED_HULL, LABEL_PRIORITY, MAX_LABELS, layoutLabels, type LabelBox, type LabelFleetInfo, type LabelGroupInfo, type LabelHull, type LabelKind, type LabelSlot, type PlacedLabel } from './labelLayout';
import { useFleetSummary } from './scalePolicy';

const NAMED = new Set(RESERVED_NAMES);
/**
 * A close-up label clears this share of its hull's projected half-length (a model seen side-on is far shorter than
 * long), up to `MAX_MODEL_RADIUS` px; beyond that the label stays nearer its bracket.
 */
const MODEL_CLEARANCE = 0.6;
const MAX_MODEL_RADIUS = 140;
/** Label cap at 1920 × 1080; smaller viewports get proportionally fewer (never under 16). */
const LABELS_AT_1080P = MAX_LABELS;
/** Craft get a bracket (not a dot) only in the command view and nearer the camera than this (render units). */
const CRAFT_BRACKET_DEPTH = 6000;
/**
 * Fleet mode (brief §12): a hull nearer the camera than this (render units: 32 km) keeps its identity: its bracket, its
 * bars where due and a chance of its own name. A farther one loses its bracket while a group or fleet label stands for
 * it, and is named only as one of the viewport-capped best (`maxLabels` of them, by tier and distance). The distance is
 * the one the owner's fleet map used for the ships it kept drawing one by one.
 */
const NEAR_IDENTITY_DEPTH = 320;
/** Fleet mode: at most this many near hulls (the nearest) are named for being near; inspected and named hulls aside. */
const NEARBY_NAME_CAP = 28;
/** Fleet mode: brackets, and the command view's bars, for at most this many hulls a frame (nearest first); the rest are dots. */
const BRACKET_BUDGET = 400;
const FONT: Record<LabelKind, string> = {
  ship: '10px Consolas, "Roboto Mono", monospace',
  group: '10px Consolas, "Roboto Mono", monospace',
  fleet: '11px Consolas, "Roboto Mono", monospace',
};

interface Mark {
  s: ShipState;
  x: number;
  y: number;
  depth: number;
  size: number;
}

/** Bracket half-size by role. */
const bracketSize = (s: ShipState): number =>
  s.role === 'reaper_capital' || s.role === 'dreadnought' || s.role === 'super_dreadnought' || s.role === 'carrier' || s.role === 'fixed_platform' ? 9 : s.role === 'cruiser' || s.role === 'reaper_destroyer' ? 7 : 5;

/** Remaining hull of a set of hulls as a fraction of their maxima (lost hulls count as empty). */
const hullFraction = (ships: readonly ShipState[]): number => {
  let hull = 0;
  let max = 0;
  for (const s of ships) {
    max += s.maxHull;
    if (inFight(s)) hull += s.hull;
  }
  return max > 0 ? hull / max : 0;
};

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * 2D tactical overlay drawn on a canvas above the WebGL view: hull brackets, hull/barrier bars and text labels,
 * selection boxes, target lines and the command grid. Its own toggle is O (brief §12), independent of the HUD level
 * (H). Labels never overlap each other or a drawn bar: labelLayout.ts places them by priority each frame and folds
 * crowded battlegroups and fleets into one label each, so names stay readable however far the camera pulls back.
 *
 * Large battles (fleet mode, the scale policy the HUD lists share): over the Settings threshold of active ships and
 * flights on both sides, the overlay is a fleet map and its work per frame is bounded whatever the battle's size.
 * Craft are counted in their fleet's label and not drawn, unless inspected or their fleet has no hull left: then its
 * flights stand for it under its label. A hull keeps its identity when inspected (selected as one of up to 12, hovered,
 * followed, or the hull the follow camera would take), named (a flagship or a unique name), near the camera (the nearest
 * `NEARBY_NAME_CAP` within `NEAR_IDENTITY_DEPTH`) or among the viewport-capped best of the rest by tier and distance;
 * every other hull folds into its battlegroup's or fleet's label when crowded, is never named on its own, loses its
 * bracket while such a label stands for it and, beyond `BRACKET_BUDGET` brackets a frame, is drawn as a dot. Fleet
 * labels are anchored on the fleet's live hulls on screen (the capitals and escorts, never the fighter screen) and
 * count every live hull and craft of the fleet, on screen or not. Below the threshold every hull is bracketed and
 * every name is a candidate. Display only: nothing here reaches the simulation.
 */
export class TacticalOverlay {
  private ctx: CanvasRenderingContext2D;
  visible = true;
  hoverId?: string;
  /** Screen areas labels keep clear of: the visible HUD panels (CSS px; the battle controller keeps it current). */
  blocked: LabelBox[] = [];
  /** Large-battle threshold (active ships and flights, both sides; 0: never), brief §12: the battle controller keeps it in step with Settings. */
  largeBattleHulls = 0;
  /** The labels drawn last frame (screen boxes, CSS px): the e2e test hook, empty while the overlay is hidden. */
  lastLabels: PlacedLabel[] = [];
  /** The bars drawn last frame (CSS px, by hull id) and the hulls whose markers were left out: e2e test hooks. */
  lastBars: (LabelBox & { id: string })[] = [];
  lastHidden: string[] = [];
  /** Markers drawn last frame: brackets, and the dots a large battle's far hulls become (e2e test hook). */
  lastMarkers = { brackets: 0, dots: 0 };
  /** Aggregates folded last frame (the layout's hysteresis) and each label's slot last frame. */
  private collapsed = new Set<string>();
  private slots = new Map<string, LabelSlot>();
  private widths = new Map<string, number>();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.widths.clear();
  }

  /** Width of a label's text as drawn (upper case, its kind's font), cached. */
  private measure = (text: string, kind: LabelKind): number => {
    const key = `${kind}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      if (this.widths.size > 4000) this.widths.clear();
      this.ctx.font = FONT[kind];
      w = this.ctx.measureText(text.toUpperCase()).width;
      this.widths.set(key, w);
    }
    return w;
  };

  draw(view: BattleView, w: number, h: number, mode: string): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    this.lastLabels = [];
    this.lastBars = [];
    this.lastHidden = [];
    this.lastMarkers = { brackets: 0, dots: 0 };
    if (!this.visible) return;
    const sim = view.sim;
    const command = mode === 'command';
    ctx.font = FONT.ship;
    ctx.textBaseline = 'middle';
    // Target lines for selected ships.
    // Selecting an entire fleet must not draw thousands of target lines.
    for (const id of view.selectedIds.size <= 12 ? view.selectedIds : []) {
      const s = sim.getShip(id);
      if (!s || !s.alive) continue;
      const t = s.targetId ? sim.getShip(s.targetId) : undefined;
      if (!t || !t.alive) continue;
      const a = view.project(s.pos, w, h);
      const b = view.project(t.pos, w, h);
      if (!a || !b) continue;
      ctx.strokeStyle = 'rgba(255,138,31,0.55)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Large battles (brief §12): the scale policy shared with the HUD lists counts every active ship and flight on
    // both sides against the Settings threshold. Display only: no ship leaves the simulation, picking or commands.
    let active = 0;
    for (const s of sim.ships) if (inFight(s)) active++;
    const fleetMode = useFleetSummary(active, this.largeBattleHulls);
    // Inspected hulls keep their identity whatever the battle's size: a selection of up to 12 (a whole selected fleet is
    // not inspected hull by hull), the hovered hull, the hull the camera follows and, in fleet mode, the hull the follow
    // camera would take (`followId`, the owner's pinned rule: the lead of the last fleet or battlegroup row clicked).
    const focusedIds = view.selectedIds.size <= 12 ? view.selectedIds : new Set<string>();
    const followed = view.followedId;
    const pinned = fleetMode ? view.followId : undefined;
    const inspected = (s: ShipState): boolean => focusedIds.has(s.id) || this.hoverId === s.id || s.id === followed || s.id === pinned;

    // Battlegroups and fleets, for the aggregate labels: counts from every live hull and craft, on screen or not.
    const bg = battlegroups(sim.ships);
    const groups = new Map<string, LabelGroupInfo>();
    const strength = new Map<string, number>();
    const colours = new Map<string, string>();
    for (const g of bg.groups.values()) {
      if (g.live.length === 0) continue;
      groups.set(g.id, { name: g.leader.name, count: g.live.length });
      strength.set(`group:${g.id}`, hullFraction(g.members));
      colours.set(`group:${g.id}`, FACTIONS[g.leader.faction].colour);
    }
    const fleetMembers = new Map<string, ShipState[]>();
    const fleetCraft = new Map<string, number>();
    for (const s of sim.ships) {
      if (s.role === 'fighter') {
        // A flight stands for several craft; the ones still in the fight count in their fleet's label.
        if (inFight(s)) fleetCraft.set(s.fleetId, (fleetCraft.get(s.fleetId) ?? 0) + (s.flight?.craft ?? 1));
        continue;
      }
      let list = fleetMembers.get(s.fleetId);
      if (!list) fleetMembers.set(s.fleetId, (list = []));
      list.push(s);
    }
    const fleets = new Map<string, LabelFleetInfo>();
    // Fleet map: a fleet down to its fighter flights still appears (the owner's rule), its flights standing for it under its label.
    const standIn = new Set<string>();
    for (const [id, f] of sim.fleets) {
      const members = fleetMembers.get(id);
      if (!members) continue;
      const live = members.filter(inFight).length;
      const craft = fleetCraft.get(id) ?? 0;
      fleets.set(id, { name: f.spec.name, live, deployed: members.length, craft });
      strength.set(`fleet:${id}`, hullFraction(members));
      colours.set(`fleet:${id}`, FACTIONS[f.spec.faction].colour);
      if (fleetMode && live === 0 && craft > 0) standIn.add(id);
    }

    const marks: Mark[] = [];
    for (const s of sim.ships) {
      if (!inFight(s)) continue;
      // Fleet map: craft are counted in their fleet's label, not drawn, unless inspected or standing for a fleet with no hull left.
      if (fleetMode && s.role === 'fighter' && !inspected(s) && !standIn.has(s.fleetId)) continue;
      const p = view.project(s.pos, w, h);
      if (!p) continue;
      if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      marks.push({ s, x: p.x, y: p.y, depth: p.depth, size: bracketSize(s) });
    }
    marks.sort((a, b) => b.depth - a.depth);
    const maxLabels = Math.max(16, Math.min(LABELS_AT_1080P, Math.round((LABELS_AT_1080P * w * h) / (1920 * 1080))));
    const tier = (s: ShipState, focus: boolean, named: boolean): number =>
      focus
        ? LABEL_PRIORITY.focus
        : named
          ? LABEL_PRIORITY.named
          : s.id === followed
            ? LABEL_PRIORITY.followed
            : isCapitalRole(s.role)
              ? LABEL_PRIORITY.capital
              : s.hull < DAMAGED_HULL * s.maxHull
                ? LABEL_PRIORITY.damaged
                : LABEL_PRIORITY.other;

    // Fleet mode: the bounded set of hulls that may carry their own name, and the hulls drawn as dots.
    const nameable = new Set<string>();
    const dotted = new Set<string>();
    if (fleetMode) {
      const near: { id: string; depth: number }[] = [];
      const rest: { id: string; priority: number; depth: number }[] = [];
      for (const m of marks) {
        const s = m.s;
        if (s.role === 'fighter') continue;
        if (inspected(s) || s.flagship || NAMED.has(s.name)) {
          nameable.add(s.id);
          continue;
        }
        if (m.depth <= NEAR_IDENTITY_DEPTH) near.push({ id: s.id, depth: m.depth });
        else rest.push({ id: s.id, priority: tier(s, false, false), depth: m.depth });
      }
      // The nearest hulls keep their identity (the owner's rule) ...
      near.sort((a, b) => a.depth - b.depth || byId(a, b));
      for (const n of near.slice(0, NEARBY_NAME_CAP)) nameable.add(n.id);
      for (const n of near.slice(NEARBY_NAME_CAP)) rest.push({ id: n.id, priority: tier(sim.getShip(n.id)!, false, false), depth: n.depth });
      // ... and of the rest, as many as the viewport could label: the best tiers first, nearer first within a tier.
      rest.sort((a, b) => a.priority - b.priority || a.depth - b.depth || byId(a, b));
      for (const r of rest.slice(0, maxLabels)) nameable.add(r.id);
      // Brackets for the hulls with an identity and the nearest others, dots beyond the budget.
      let budget = BRACKET_BUDGET - nameable.size;
      for (let i = marks.length - 1; i >= 0; i--) {
        const s = marks[i].s;
        if (s.role === 'fighter' || nameable.has(s.id)) continue;
        if (budget > 0) budget--;
        else dotted.add(s.id);
      }
    }

    // Labels: every bracketed hull on screen is a candidate (in fleet mode, the nameable ones); labelLayout decides which names fit.
    const hulls: LabelHull[] = [];
    for (const { s, x, y, depth, size } of marks) {
      const focus = focusedIds.has(s.id) || this.hoverId === s.id;
      if (s.role === 'fighter' && !focus) {
        const bracketed = command && depth <= CRAFT_BRACKET_DEPTH;
        if (standIn.has(s.fleetId)) {
          // A flight standing for a fleet with no hull left folds into the fleet's label like a hull and is never named on
          // its own; for the layout's crowd test (hulls nearer than their names are wide) its name is the fleet's.
          hulls.push({ id: s.id, x, y, size, name: fleets.get(s.fleetId)!.name, priority: LABEL_PRIORITY.other, fleetId: s.fleetId, bars: bracketed, hideFolded: true, nameless: true });
        } else if (bracketed) {
          // Craft and Oculi stay unlabelled; the command view brackets the near ones, with bars no label may cover.
          hulls.push({ id: s.id, x, y, size, name: '', priority: LABEL_PRIORITY.other, bars: true, unnamed: true });
        }
        continue;
      }
      const named = s.flagship || NAMED.has(s.name);
      const dot = dotted.has(s.id);
      const radius = dot ? 0 : Math.min(MAX_MODEL_RADIUS, MODEL_CLEARANCE * view.screenRadius(s.id, depth, h));
      hulls.push({
        id: s.id,
        x,
        y,
        size,
        radius,
        name: s.name,
        priority: tier(s, focus, named),
        groupId: bg.groupOf.get(s.id),
        fleetId: s.fleetId,
        solo: inspected(s) || named,
        // The command view draws bars under every bracketed hull, and an inspected hull always shows its own.
        bars: focus || (command && !dot),
        hideFolded: fleetMode && depth > NEAR_IDENTITY_DEPTH,
        nameless: fleetMode && !nameable.has(s.id),
      });
    }
    const layout = layoutLabels(hulls, { width: w, height: h, groups, fleets, measure: this.measure, blocked: this.blocked, previous: this.collapsed, previousSlots: this.slots, maxLabels });
    this.collapsed = layout.collapsed;
    this.slots = new Map(layout.placed.map((l) => [l.id, l.slot]));
    this.lastLabels = layout.placed;
    this.lastHidden = [...layout.hidden];
    const withBars = new Set<string>();
    for (const l of layout.placed) if (l.bars) withBars.add(l.id);

    // Markers far to near, but for the hulls a large battle's aggregate label stands for: brackets, or dots beyond the
    // fleet map's budget; bars under every bracketed hull in the command view and under inspected hulls, else with a
    // hull's name where the layout left them room.
    let brackets = 0;
    let dots = 0;
    for (const { s, x, y, depth, size } of marks) {
      if (layout.hidden.has(s.id)) continue;
      const colour = FACTIONS[s.faction].colour;
      if (dotted.has(s.id)) {
        ctx.fillStyle = colour;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        ctx.globalAlpha = 1;
        dots++;
        continue;
      }
      const friendly = s.side === sim.config.perspectiveSide;
      const selected = view.selectedIds.has(s.id);
      const focus = focusedIds.has(s.id);
      const hovered = this.hoverId === s.id;
      const isFighter = s.role === 'fighter';
      const far = depth > CRAFT_BRACKET_DEPTH;
      if (isFighter && (far || !command) && !focus && !hovered) {
        if (command || depth < 3000) {
          ctx.fillStyle = colour;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x - 1, y - 1, 2, 2);
          ctx.globalAlpha = 1;
          dots++;
        }
        continue;
      }
      brackets++;
      ctx.strokeStyle = colour;
      ctx.lineWidth = focus || hovered ? 2 : 1;
      ctx.globalAlpha = focus || hovered ? 1 : 0.75;
      ctx.beginPath();
      if (friendly) {
        // Diamond for friendlies.
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
      } else {
        // Chevron/triangle for hostiles.
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x - size, y + size);
        ctx.closePath();
      }
      ctx.stroke();
      if (selected) {
        // Every selected hull drawn gets its box, a whole selected fleet included; the bars and names are for the inspected ones.
        ctx.strokeStyle = '#ff8a1f';
        ctx.strokeRect(x - size - 6, y - size - 6, size * 2 + 12, size * 2 + 12);
      }
      if (command || focus || hovered || withBars.has(s.id)) {
        const bw = 36;
        const bx = x - bw / 2;
        const by = y + size + 5;
        this.lastBars.push({ id: s.id, x: bx, y: by, w: bw, h: 5 });
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, 5);
        ctx.fillStyle = '#4fa3ff';
        ctx.fillRect(bx, by, (bw * s.barriers) / Math.max(1, s.maxBarriers), 2);
        ctx.fillStyle = s.hull / s.maxHull < 0.3 ? '#ff3b2f' : '#ff8a1f';
        ctx.fillRect(bx, by + 3, (bw * s.hull) / s.maxHull, 2);
      }
      ctx.globalAlpha = 1;
    }
    this.lastMarkers = { brackets, dots };

    // Text: hull names with a dark outline (legible over the planet), aggregates on a dark plate with a strength bar.
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const l of layout.placed) {
      const text = l.text.toUpperCase();
      const cx = l.x + l.w / 2;
      const cy = l.y + l.h / 2;
      if (l.kind === 'ship') {
        const s = sim.getShip(l.id);
        const focus = view.selectedIds.has(l.id) || this.hoverId === l.id;
        ctx.font = FONT.ship;
        ctx.globalAlpha = focus ? 1 : 0.92;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(3,6,12,0.8)';
        ctx.strokeText(text, cx, cy + 0.5);
        ctx.fillStyle = s ? FACTIONS[s.faction].colour : '#cfe3ff';
        ctx.fillText(text, cx, cy + 0.5);
      } else {
        const colour = colours.get(l.id) ?? '#cfe3ff';
        const fleet = l.kind === 'fleet';
        ctx.globalAlpha = 1;
        ctx.fillStyle = fleet ? 'rgba(6,9,15,0.78)' : 'rgba(6,9,15,0.62)';
        ctx.fillRect(l.x, l.y, l.w, l.h);
        ctx.globalAlpha = fleet ? 0.7 : 0.45;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        ctx.strokeRect(l.x + 0.5, l.y + 0.5, l.w - 1, l.h - 1);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colour;
        ctx.fillRect(l.x, l.y, 2, l.h);
        const frac = strength.get(l.id) ?? 1;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = frac < 0.3 ? '#ff3b2f' : '#ff8a1f';
        ctx.fillRect(l.x + 2, l.y + l.h - 2, Math.max(0, (l.w - 2) * frac), 2);
        ctx.globalAlpha = 1;
        ctx.font = FONT[l.kind];
        ctx.fillStyle = colour;
        ctx.fillText(text, cx + 1, cy - 0.5);
      }
    }
    ctx.globalAlpha = 1;
    // Command grid.
    if (command) {
      ctx.strokeStyle = 'rgba(79,163,255,0.12)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 60) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 60) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }
    }
    // Corner brackets (HUD framing).
    ctx.strokeStyle = 'rgba(79,163,255,0.35)';
    ctx.lineWidth = 1;
    const m = 8;
    const L = 26;
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]] as number[][]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * L);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * L, cy);
      ctx.stroke();
    }
  }
}
