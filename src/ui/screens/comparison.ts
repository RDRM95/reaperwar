import type { App } from '../app';
import { el } from '../dom';
import { SCENARIOS, defaultWorldState, getScenario, FLEET_SCALING_KEY } from '@/scenarios';
import { compareBattles, type ComparisonReport } from '@/scenarios/comparison';
import { CANON_ME3 } from '@/timelines/presets';

export function renderComparison(app: App, params?: { report?: ComparisonReport }): HTMLElement {
  let scenarioId = 'alliance_fleet_engagement';
  let timelineB = app.prefs.lastTimelineId === 'canon_me3' ? 'prime_apex' : app.prefs.lastTimelineId;
  let seed = 7;
  let fixedFleets = true;
  let report: ComparisonReport | undefined = params?.report;
  let running = false;

  const body = el('div', { class: 'screen-body' });

  const run = () => {
    running = true;
    render();
    // Yield to paint before the (synchronous) simulations.
    setTimeout(() => {
      const scenario = getScenario(scenarioId);
      const ws = { ...defaultWorldState(scenario), [FLEET_SCALING_KEY]: fixedFleets ? 'fixed' : 'rules' };
      const a = scenario.build(CANON_ME3, seed, ws);
      const b = scenario.build(app.getTimeline(timelineB), seed, ws);
      report = compareBattles(a, b);
      running = false;
      app.playUi('ui_confirm');
      render();
    }, 30);
  };

  const render = () => {
    body.replaceChildren();
    const controls = el('div', { class: 'panel orange' }, [
      el('div', { class: 'panel-title' }, 'COMPARISON SETUP'),
      el('div', { class: 'row' }, [
        el('label', { class: 'field' }, ['Scenario', el('select', { onchange: (e: Event) => (scenarioId = (e.target as HTMLSelectElement).value) }, SCENARIOS.filter((s) => s.id !== 'custom').map((s) => el('option', { value: s.id, selected: s.id === scenarioId }, s.name)))]),
        el('label', { class: 'field' }, ['Side A', el('input', { type: 'text', value: 'Canon Mass Effect 3', disabled: true })]),
        el('label', { class: 'field' }, ['Side B (alternate timeline)', el('select', { onchange: (e: Event) => (timelineB = (e.target as HTMLSelectElement).value) }, app.allTimelines().filter((t) => t.id !== 'canon_me3').map((t) => el('option', { value: t.id, selected: t.id === timelineB }, t.name)))]),
        el('label', { class: 'field' }, ['Seed', el('input', { type: 'number', value: seed, onchange: (e: Event) => (seed = Number((e.target as HTMLInputElement).value) || 0) })]),
        el('label', { class: 'field' }, ['Fleets', el('select', { onchange: (e: Event) => (fixedFleets = (e.target as HTMLSelectElement).value === 'fixed') }, [el('option', { value: 'fixed', selected: fixedFleets }, 'Identical fleets (technology only)'), el('option', { value: 'rules', selected: !fixedFleets }, 'Scale with timeline fleet strength')])]),
        el('button', { class: 'btn primary', 'data-action': 'run-comparison', disabled: running, onclick: run }, running ? 'Simulating…' : 'Run both battles'),
      ]),
      el('p', { class: 'dim', style: { fontSize: '12px', marginTop: '8px' } }, 'Both battles use the same scenario, starting positions and random seed. With identical fleets, every difference in outcome is caused by the timeline’s technology, doctrine and strategic rules.'),
    ]);
    body.append(controls);
    if (!report) {
      body.append(el('p', { class: 'dim', style: { marginTop: '20px' } }, running ? 'Running simulations…' : 'Configure and run a comparison.'));
      return;
    }
    const r = report;
    const rows = r.metrics.map((m) => {
      const better = m.delta !== undefined && m.delta > 0;
      const worse = m.delta !== undefined && m.delta < 0;
      return el('tr', {}, [el('td', {}, m.label), el('td', { class: 'num' }, String(m.a)), el('td', { class: `num ${better ? 'better' : worse ? 'worse' : ''}` }, String(m.b))]);
    });
    body.append(
      el('div', { class: 'grid2', style: { marginTop: '14px' } }, [
        el('div', { class: 'panel' }, [
          el('div', { class: 'panel-title' }, 'RESULTS — SPLIT VIEW'),
          el('table', { class: 'compare-table' }, [
            el('thead', {}, el('tr', {}, [el('th', {}, 'Metric'), el('th', {}, `A: ${r.a.rules.name}`), el('th', {}, `B: ${r.b.rules.name}`)])),
            el('tbody', {}, rows),
          ]),
          el('div', { class: 'row', style: { marginTop: '12px' } }, [
            el('button', { class: 'btn', 'data-action': 'watch-a', onclick: () => app.startBattle(r.a.config, { replay: true, comparison: r, comparisonSide: 'a' }) }, '▶ Watch A (canon)'),
            el('button', { class: 'btn primary', 'data-action': 'watch-b', onclick: () => app.startBattle(r.b.config, { replay: true, comparison: r, comparisonSide: 'b' }) }, '▶ Watch B (AU)'),
          ]),
        ]),
        el('div', { class: 'col' }, [
          el('div', { class: 'panel orange' }, [el('div', { class: 'panel-title' }, 'WHAT CHANGED THE RESULT'), ...r.explanation.map((line) => el('p', { style: { fontSize: '13px' } }, line))]),
          el('div', { class: 'panel' }, [
            el('div', { class: 'panel-title' }, 'TIMELINE B — CHANGED HISTORY'),
            r.b.rules.historyChanges.length === 0 ? el('p', { class: 'dim' }, 'No history changes declared.') : el('ul', { style: { paddingLeft: '18px', fontSize: '13px' } }, r.b.rules.historyChanges.map((h) => el('li', {}, h))),
          ]),
        ]),
      ]),
    );
  };
  render();

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'CANON VS AU COMPARISON'), el('span', { class: 'sub' }, 'SAME BATTLE · SAME SEED · DIFFERENT RULES')]),
    body,
    el('div', { class: 'screen-footer' }, [el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu')]),
  ]);
}
