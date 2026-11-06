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
  private drawFleetLabels?: () => void;

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
    // In a large engagement the overlay is a fleet map, not thousands of
    // individual ship nameplates. This is display-only: no ship is removed
    // from the simulation or from picking/commands.
    const live = sim.ships.filter((s) => s.alive && !s.escaped);
    const fleetMode = live.length > 64;
    const focusedIds = view.selectedIds.size <= 12 ? view.selectedIds : new Set<string>();
    const ships: { s: ShipState; x: number; y: number; depth: number }[] = [];

    if (fleetMode) {
      type FleetMarker = {
        id: string; name: string; faction: ShipState['faction']; count: number;
        x: number; y: number; z: number; weight: number;
      };
      const fleets = new Map<string, FleetMarker>();
      const camera = view.rig.camera.position;
      for (const s of live) {
        let fleet = fleets.get(s.fleetId);
        if (!fleet) {
          fleet = {
            id: s.fleetId, name: sim.fleets.get(s.fleetId)?.spec.name ?? s.fleetId,
            faction: s.faction, count: 0, x: 0, y: 0, z: 0, weight: 0,
          };
          fleets.set(s.fleetId, fleet);
        }
        // A fighter flight may represent several craft, not one vessel.
        fleet.count += s.flight?.craft ?? 1;
        // Capital and escort positions give a more useful fleet label anchor
        // than a distant fighter screen; fighter-only fleets still appear.
        const weight = s.role === 'fighter' ? 0.15 : 1;
        fleet.x += s.pos.x * weight;
        fleet.y += s.pos.y * weight;
        fleet.z += s.pos.z * weight;
        fleet.weight += weight;

        // Close camera and explicitly inspected ships retain individual
        // identities, but cap the per-frame label/marker work.
        const pinned = focusedIds.has(s.id) || this.hoverId === s.id || view.followId === s.id;
        const dx = s.pos.x * 10 - camera.x;
        const dy = s.pos.y * 10 - camera.y;
        const dz = s.pos.z * 10 - camera.z;
        if (!pinned && (s.role === 'fighter' || dx * dx + dy * dy + dz * dz > 320 * 320)) continue;
        if (!pinned && ships.length >= 28) continue;
        const p = view.project(s.pos, w, h);
        if (p && p.x >= -40 && p.y >= -40 && p.x <= w + 40 && p.y <= h + 40) {
          ships.push({ s, ...p });
        }
      }

      // All fleet counts are computed from live entities, not only the
      // vessels visible in the camera frustum.
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const labels = [...fleets.values()].sort((a, b) => b.count - a.count).slice(0, 40);
      // Fleet nameplates are drawn after the nearby ship markers below.
      const drawFleetLabels = () => {
        ctx.font = 'bold 11px Consolas, "Roboto Mono", monospace';
        ctx.textAlign = 'center';
        for (const fleet of labels) {
          const p = view.project({
            x: fleet.x / fleet.weight, y: fleet.y / fleet.weight, z: fleet.z / fleet.weight,
          }, w, h);
          if (!p || p.x < -60 || p.x > w + 60 || p.y < -30 || p.y > h + 30) continue;
          const label = fleet.name.toUpperCase() + ' · ' + fleet.count.toLocaleString('en-GB') + ' SHIPS';
          const width = Math.min(w - 16, ctx.measureText(label).width + 20);
          const x = Math.max(8, Math.min(w - width - 8, p.x - width / 2));
          let y = Math.max(8, Math.min(h - 26, p.y - 10));
          for (let n = 0; n < 5 && occupied.some((r) => x < r.x + r.w && x + width > r.x && y < r.y + r.h && y + 22 > r.y); n++) {
            y = Math.min(h - 26, y + 24);
          }
          if (occupied.some((r) => x < r.x + r.w && x + width > r.x && y < r.y + r.h && y + 22 > r.y)) continue;
          occupied.push({ x, y, w: width, h: 22 });
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = 'rgba(5, 11, 19, 0.82)';
          ctx.fillRect(x, y, width, 22);
          ctx.strokeStyle = FACTIONS[fleet.faction].colour;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 21);
          ctx.fillStyle = '#e6edf5';
          ctx.fillText(label, x + width / 2, y + 11, Math.max(0, width - 12));
        }
        ctx.globalAlpha = 1;
      };
      // Draw fleet labels at the end of the ship-marker pass.
      this.drawFleetLabels = drawFleetLabels;
    } else {
      this.drawFleetLabels = undefined;
      for (const s of live) {
        const p = view.project(s.pos, w, h);
        if (!p || p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
        ships.push({ s, ...p });
      }
    }

    ships.sort((a, b) => b.depth - a.depth);
    for (const { s, x, y, depth } of ships) {
      const friendly = s.side === sim.config.perspectiveSide;
      const colour = FACTIONS[s.faction].colour;
      const selected = focusedIds.has(s.id);
      const hovered = this.hoverId === s.id;
      const isFighter = s.role === 'fighter';
      const far = depth > 6000;
      if (isFighter && (far || (!command && !selected && !hovered))) {
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
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
      } else {
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
      const showDetail = selected || hovered || (fleetMode ? depth < 280 : command || (!far && size >= 7) || depth < 2500);
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
        const label = fleetMode
          ? (selected || hovered || depth < 280 ? s.name : '')
          : (selected || hovered || size >= 9 || (size >= 7 && depth < 1200) ? s.name : '');
        if (label) ctx.fillText(label.toUpperCase(), x, by + 13);
      }
      ctx.globalAlpha = 1;
    }
    this.drawFleetLabels?.();
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
