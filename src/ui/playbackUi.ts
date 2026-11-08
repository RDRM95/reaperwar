import type { BattleController } from './app';
import { el, fmtTime } from './dom';
import { SIM_DT } from '@/simulation/battle';

/**
 * Playback interface pieces (brief §19.1): the Fast-forward to result progress overlay and the performance HUD (F3).
 * Both are mounted by the battle HUD (src/ui/screens/hud.ts) and updated by the controller; they read the controller,
 * its clock and the simulation, and write nothing to the simulation.
 */

export interface FastForwardOverlay {
  root: HTMLElement;
  readonly visible: boolean;
  show(): void;
  hide(): void;
  /** Refresh the figures (the controller throttles the calls). */
  update(): void;
}

/**
 * Centred panel over the frozen view while the battle is stepped to its result: simulated time against the time
 * limit, live hulls per side, the pace, and Cancel. The rest of the HUD stays usable around it (the element itself
 * takes no pointer events; its panel does), so the menu and the pause menu work during a fast-forward.
 */
export function createFastForwardOverlay(ctrl: BattleController): FastForwardOverlay {
  const time = el('div', { class: 'ff-time mono', 'data-ff-time': '' }, '00:00');
  const limit = el('div', { class: 'dim mono ff-limit' }, '');
  const fill = el('i');
  const bar = el('div', { class: 'ff-bar' }, [fill]);
  const hulls = el('div', { class: 'mono ff-hulls', 'data-ff-hulls': '' }, '');
  const pace = el('div', { class: 'dim mono ff-pace' }, '');
  const cancel = el('button', { class: 'btn primary', 'data-action': 'cancel-fast-forward', onclick: () => ctrl.cancelFastForward() }, 'Cancel · resume at 1×');
  const panel = el('div', { class: 'panel orange ff-panel' }, [
    el('div', { class: 'panel-title' }, ['FAST-FORWARD TO RESULT', el('span', { class: 'dim', style: { letterSpacing: '0.1em' } }, 'NO FRAMES DRAWN')]),
    time,
    limit,
    bar,
    hulls,
    pace,
    el('div', { class: 'row', style: { marginTop: '12px', alignItems: 'center' } }, [cancel, el('span', { class: 'dim', style: { fontSize: '11px' } }, 'Esc: pause menu · End: cancel')]),
    el('div', { class: 'dim', style: { fontSize: '11px', marginTop: '8px' } }, 'The same ticks normal playback runs, without drawing them: identical result, losses, hits and event log.'),
  ]);
  const root = el('div', { class: 'ff-progress', 'data-ff-progress': '', 'data-updates': '0', style: { display: 'none' } }, [panel]);
  let visible = false;
  let updates = 0;
  const update = () => {
    const sim = ctrl.sim;
    const ff = ctrl.fastForward;
    time.textContent = fmtTime(sim.time);
    limit.textContent = `OF THE ${fmtTime(sim.config.maxDuration)} TIME LIMIT`;
    fill.style.width = `${Math.min(100, (100 * sim.time) / Math.max(1, sim.config.maxDuration)).toFixed(1)}%`;
    hulls.textContent = `ALLIED ${sim.simulatedHullCount('A')} · HOSTILE ${sim.simulatedHullCount('B')} HULLS`;
    if (ff) {
      const elapsed = (performance.now() - ff.startedAt) / 1000;
      const simulated = ff.ticks * SIM_DT;
      const rate = elapsed > 0.2 ? simulated / elapsed : Number.NaN;
      pace.textContent = `${fmtTime(simulated)} SIMULATED IN ${elapsed.toFixed(1)} s${Number.isFinite(rate) ? ` · ${rate.toFixed(0)}× REAL TIME` : ''}${ctrl.paused ? ' · PAUSED' : ''}`;
    } else pace.textContent = '';
    updates++;
    root.dataset.updates = String(updates);
  };
  return {
    root,
    get visible() {
      return visible;
    },
    show() {
      visible = true;
      updates = 0;
      root.style.display = 'flex';
      update();
    },
    hide() {
      visible = false;
      root.style.display = 'none';
    },
    update,
  };
}

export interface PerfHud {
  root: HTMLElement;
  readonly visible: boolean;
  toggle(): void;
  /** Refresh the figures (the controller calls it four times a second while visible). */
  refresh(): void;
}

const fmt = (x: number, d = 1): string => (Number.isFinite(x) ? x.toFixed(d) : '–');

/**
 * Performance HUD (F3): main-thread milliseconds per frame for the simulation, the view, the overlay and the HUD,
 * ticks per frame and the budget, requested against achieved speed with the backlog, draw calls, effects batching
 * and the JavaScript heap where the browser exposes it (Chromium's `performance.memory`). Figures are the
 * controller's exponential averages. Eight rows, so the panel fits the strip below the HUD's right column.
 */
export function createPerfHud(ctrl: BattleController): PerfHud {
  const rows: { k: string; v: HTMLElement }[] = [];
  const row = (k: string): HTMLElement => {
    const v = el('span', { class: 'v' }, '');
    rows.push({ k, v });
    return el('div', { class: 'perf-row' }, [el('span', { class: 'k' }, k), v]);
  };
  const frame = row('FRAME');
  const sim = row('SIM');
  const budget = row('BUDGET');
  const view = row('VIEW');
  const ui = row('UI');
  const speed = row('SPEED');
  const fx = row('EFFECTS');
  const draws = row('DRAWS');
  const root = el('div', { class: 'panel perf-hud', 'data-perf-hud': '', style: { display: 'none' } }, [
    el('div', { class: 'panel-title' }, ['PERFORMANCE', el('span', { class: 'dim', style: { letterSpacing: '0.1em' } }, 'F3')]),
    frame, sim, budget, view, ui, speed, fx, draws,
  ]);
  let visible = false;
  const set = (r: HTMLElement, text: string) => {
    const v = rows.find((x) => r.contains(x.v))?.v;
    if (v && v.textContent !== text) v.textContent = text;
  };
  const refresh = () => {
    const s = ctrl.stats.mean;
    const c = ctrl.clock;
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    set(frame, `${fmt(s.frame, 0)} ms · ${fmt(ctrl.stats.fps, 0)} fps · worst ${fmt(ctrl.stats.worstFrameMs, 0)} ms`);
    set(sim, `${fmt(s.sim)} ms · ${fmt(s.ticks)} ticks/frame (max ${ctrl.stats.maxTicks}) · ${fmt(c.msPerTick, 2)} ms/tick`);
    set(budget, `${fmt(c.budgetMs(), 0)} ms · display ${fmt(c.displayFrameMs, 0)} · ui ${fmt(c.uiCostMs, 0)} ms${c.gpuPaced ? ' · GPU-PACED' : ''}`);
    set(view, `update ${fmt(s.view)} · render ${fmt(s.render)} · events ${fmt(s.events)} ms`);
    set(ui, `overlay ${fmt(s.overlay)} ms${c.fast ? ' (30 Hz)' : ''} · hud ${fmt(s.hud)} ms`);
    const achieved = c.achieved;
    set(speed, c.mode === 'result' ? 'FAST-FORWARD (no frames drawn)' : `${c.speed}× · achieved ${fmt(achieved)}× · backlog ${fmt(c.backlog, 2)} s · shed ${fmt(c.shedTotal, 0)} s`);
    const b = ctrl.view.batching;
    set(fx, `cut ${c.cutFrames}/${c.frames} frames · ${b.frames > 0 ? `${b.merged} of ${b.events} events merged` : 'unbatched'}`);
    set(draws, `${ctrl.view.drawCalls} draws · LOD ${ctrl.view.lodCounts.full}/${ctrl.view.lodCounts.reduced}/${ctrl.view.lodCounts.point}${memory ? ` · heap ${(memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''}`);
  };
  return {
    root,
    get visible() {
      return visible;
    },
    toggle() {
      visible = !visible;
      root.style.display = visible ? 'block' : 'none';
      if (visible) refresh();
    },
    refresh,
  };
}
