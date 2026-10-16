import type { BattleView } from '@/rendering/battleView';
import type { ShipState } from '@/simulation/types';
import { FACTIONS } from '@/data/factions';

/**
 * 2D tactical overlay drawn on a canvas above the WebGL view: ship markers,
 * names, hull/barrier bars, selection boxes, target lines and the command
 * grid. Toggleable with H.
 */
export class TacticalOverlay {
  private ctx: CanvasRenderingContext2D;
  visible = true;
  hoverId?: string;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(view: BattleView, w: number, h: number, mode: string): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    if (!this.visible) return;
    const sim = view.sim;
    const command = mode === 'command';
    ctx.font = '10px Consolas, "Roboto Mono", monospace';
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
    const ships: { s: ShipState; x: number; y: number; depth: number }[] = [];
    for (const s of sim.ships) {
      if (!s.alive || s.escaped) continue;
      const p = view.project(s.pos, w, h);
      if (!p) continue;
      if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      ships.push({ s, x: p.x, y: p.y, depth: p.depth });
    }
    ships.sort((a, b) => b.depth - a.depth);
    for (const { s, x, y, depth } of ships) {
      const friendly = s.side === sim.config.perspectiveSide;
      const colour = FACTIONS[s.faction].colour;
      const selected = view.selectedIds.has(s.id);
      const hovered = this.hoverId === s.id;
      const isFighter = s.role === 'fighter';
      const far = depth > 6000;
      if (isFighter && (far || !command)) {
        if (command || depth < 3000) {
          ctx.fillStyle = colour;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x - 1, y - 1, 2, 2);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      const size = s.role === 'reaper_capital' || s.role === 'dreadnought' || s.role === 'carrier' ? 9 : s.role === 'cruiser' || s.role === 'reaper_destroyer' ? 7 : 5;
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
      // Bars + label for larger/closer ships.
      const showDetail = command || selected || hovered || (!far && size >= 7) || depth < 2500;
      if (showDetail) {
        const bw = 36;
        const bx = x - bw / 2;
        const by = y + size + 5;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, 5);
        ctx.fillStyle = '#4fa3ff';
        ctx.fillRect(bx, by, (bw * s.barriers) / Math.max(1, s.maxBarriers), 2);
        ctx.fillStyle = s.hull / s.maxHull < 0.3 ? '#ff3b2f' : '#ff8a1f';
        ctx.fillRect(bx, by + 3, (bw * s.hull) / s.maxHull, 2);
        ctx.fillStyle = colour;
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'center';
        const label = selected || hovered || size >= 9 || (size >= 7 && depth < 1200) ? s.name : '';
        if (label) ctx.fillText(label.toUpperCase(), x, by + 13);
      }
      ctx.globalAlpha = 1;
    }
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
