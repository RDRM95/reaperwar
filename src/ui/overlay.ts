import type { BattleView } from '@/rendering/battleView';
import type { ShipState } from '@/simulation/types';
import { FACTIONS } from '@/data/factions';
import { RESERVED_NAMES } from '@/data/names';
import { isCapitalRole } from '@/data/types';
import { battlegroups, inFight } from './fleetGroups';
import { DAMAGED_HULL, LABEL_PRIORITY, layoutLabels, type LabelBox, type LabelFleetInfo, type LabelGroupInfo, type LabelHull, type LabelKind, type PlacedLabel } from './labelLayout';

const NAMED = new Set(RESERVED_NAMES);
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

/**
 * 2D tactical overlay drawn on a canvas above the WebGL view: a bracket for every hull, hull/barrier bars and text
 * labels, selection boxes, target lines and the command grid. Its own toggle is O (brief §12), independent of the
 * HUD level (H). Labels never overlap: labelLayout.ts places them by priority each frame and folds crowded
 * battlegroups and fleets into one label each, so names stay readable however far the camera pulls back.
 */
export class TacticalOverlay {
  private ctx: CanvasRenderingContext2D;
  visible = true;
  hoverId?: string;
  /** Screen areas labels keep clear of: the visible HUD panels (CSS px; the battle controller keeps it current). */
  blocked: LabelBox[] = [];
  /** The labels drawn last frame (screen boxes, CSS px): the e2e test hook, empty while the overlay is hidden. */
  lastLabels: PlacedLabel[] = [];
  /** Aggregates folded last frame (the layout's hysteresis). */
  private collapsed = new Set<string>();
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
    if (!this.visible) return;
    const sim = view.sim;
    const command = mode === 'command';
    ctx.font = FONT.ship;
    ctx.textBaseline = 'middle';
    // Target lines for selected ships.
    for (const id of view.selectedIds) {
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
    const marks: Mark[] = [];
    for (const s of sim.ships) {
      if (!s.alive || s.escaped) continue;
      const p = view.project(s.pos, w, h);
      if (!p) continue;
      if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      marks.push({ s, x: p.x, y: p.y, depth: p.depth, size: bracketSize(s) });
    }
    marks.sort((a, b) => b.depth - a.depth);

    // Labels: every hull on screen is a candidate; labelLayout decides which names fit.
    const bg = battlegroups(sim.ships);
    const followed = view.followedId;
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
    for (const s of sim.ships) {
      if (s.role === 'fighter') continue;
      let list = fleetMembers.get(s.fleetId);
      if (!list) fleetMembers.set(s.fleetId, (list = []));
      list.push(s);
    }
    const fleets = new Map<string, LabelFleetInfo>();
    for (const [id, f] of sim.fleets) {
      const members = fleetMembers.get(id);
      if (!members) continue;
      fleets.set(id, { name: f.spec.name, live: members.filter(inFight).length, deployed: members.length });
      strength.set(`fleet:${id}`, hullFraction(members));
      colours.set(`fleet:${id}`, FACTIONS[f.spec.faction].colour);
    }
    const hulls: LabelHull[] = [];
    for (const { s, x, y, size } of marks) {
      const selected = view.selectedIds.has(s.id);
      const hovered = this.hoverId === s.id;
      if (s.role === 'fighter' && !selected && !hovered) continue; // craft and Oculi stay unlabelled
      const named = s.flagship || NAMED.has(s.name);
      const isFollowed = s.id === followed;
      const priority = selected || hovered
        ? LABEL_PRIORITY.focus
        : named
          ? LABEL_PRIORITY.named
          : isFollowed
            ? LABEL_PRIORITY.followed
            : isCapitalRole(s.role)
              ? LABEL_PRIORITY.capital
              : s.hull < DAMAGED_HULL * s.maxHull
                ? LABEL_PRIORITY.damaged
                : LABEL_PRIORITY.other;
      hulls.push({ id: s.id, x, y, size, name: s.name, priority, groupId: bg.groupOf.get(s.id), fleetId: s.fleetId, solo: selected || hovered || named || isFollowed });
    }
    const layout = layoutLabels(hulls, { width: w, height: h, groups, fleets, measure: this.measure, blocked: this.blocked, previous: this.collapsed });
    this.collapsed = layout.collapsed;
    this.lastLabels = layout.placed;
    const labelled = new Set<string>();
    for (const l of layout.placed) if (l.kind === 'ship') labelled.add(l.id);

    // Brackets for every hull, far to near; bars for the hulls named on their own.
    for (const { s, x, y, depth, size } of marks) {
      const friendly = s.side === sim.config.perspectiveSide;
      const colour = FACTIONS[s.faction].colour;
      const selected = view.selectedIds.has(s.id);
      const hovered = this.hoverId === s.id;
      const isFighter = s.role === 'fighter';
      const far = depth > 6000;
      if (isFighter && (far || !command) && !selected && !hovered) {
        if (command || depth < 3000) {
          ctx.fillStyle = colour;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x - 1, y - 1, 2, 2);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      ctx.strokeStyle = colour;
      ctx.lineWidth = selected || hovered ? 2 : 1;
      ctx.globalAlpha = selected || hovered ? 1 : 0.75;
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
        ctx.strokeStyle = '#ff8a1f';
        ctx.strokeRect(x - size - 6, y - size - 6, size * 2 + 12, size * 2 + 12);
      }
      if (command || selected || hovered || labelled.has(s.id)) {
        const bw = 36;
        const bx = x - bw / 2;
        const by = y + size + 5;
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
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(3,6,12,0.85)';
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
        ctx.fillStyle = frac < 0.3 ? '#ff3b2f' : '#ff8a1f';
        ctx.fillRect(l.x + 2, l.y + l.h - 2, Math.max(0, (l.w - 2) * frac), 2);
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
