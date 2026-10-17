import type { App } from '../app';
import { el, fmtNum, fmtTime } from '../dom';
import type { SideSummary } from '@/simulation/types';
import { assessReapers } from '@/simulation/reaperIntel';

export function renderResults(app: App): HTMLElement {
  const lb = app.lastBattle;
  if (!lb) return el('div', { class: 'screen' }, [el('div', { class: 'screen-body' }, [el('p', {}, 'No battle results available.'), el('button', { class: 'btn', onclick: () => app.show('menu') }, 'Main menu')])]);
  const { result, sim, config } = lb;
  const ps = result.perspectiveSide;
  const es = ps === 'A' ? 'B' : 'A';

  const sideTable = (s: SideSummary, title: string, cls: string) =>
    el('div', { class: `panel ${cls}` }, [
      el('div', { class: 'panel-title' }, title),
      el('div', { class: 'kv' }, [
        el('span', {}, 'Ships deployed'), el('span', { class: 'v' }, String(s.deployed)),
        el('span', {}, 'Ships destroyed'), el('span', { class: 'v' }, String(s.destroyed)),
        el('span', {}, 'Capital ships lost'), el('span', { class: 'v' }, `${s.capitalLost} / ${s.capitalDeployed}`),
        el('span', {}, 'Damage inflicted'), el('span', { class: 'v' }, fmtNum(s.damageDealt)),
        el('span', {}, 'Hull damage received'), el('span', { class: 'v' }, fmtNum(s.damageTaken)),
        el('span', {}, 'Rounds / bursts fired'), el('span', { class: 'v' }, fmtNum(s.shotsFired)),
        el('span', {}, 'Hit rate'), el('span', { class: 'v' }, `${fmtNum((100 * s.hits) / Math.max(1, s.shotsFired))}%`),
        el('span', {}, 'Fleet survival'), el('span', { class: 'v' }, `${fmtNum(s.survivalPercent)}%`),
        el('span', {}, 'Tactical effectiveness'), el('span', { class: 'v' }, fmtNum(s.tacticalEffectiveness, 1)),
      ]),
      el('table', { style: { marginTop: '10px' } }, [
        el('thead', {}, el('tr', {}, [el('th', {}, 'Class'), el('th', {}, 'Lost / Deployed')])),
        el('tbody', {}, Object.values(s.lossesByClass).map((c) => el('tr', {}, [el('td', {}, c.name), el('td', { class: 'num' }, `${c.lost} / ${c.deployed}`)]))),
      ]),
    ]);

  const kills = sim.events.filter((e) => e.type === 'ship_destroyed' && e.role !== 'fighter');
  const log = el('div', { class: 'scroll mono', style: { maxHeight: '260px', fontSize: '11px', lineHeight: '1.6' } }, kills.map((e) => {
    if (e.type !== 'ship_destroyed') return null;
    const killer = e.killerId ? sim.getShip(e.killerId) : undefined;
    return el('div', { style: { color: e.side === ps ? '#ff8a80' : '#7fe0a0' } }, `${fmtTime(e.t)}  ${e.name} destroyed${killer ? ` by ${killer.name}` : ''}`);
  }));
  const intel = assessReapers(sim);

  const body = el('div', { class: 'screen-body' }, [
    el('div', { class: `result-banner ${result.outcome}` }, result.outcome.toUpperCase()),
    el('p', { class: 'dim', style: { textAlign: 'center' } }, `${config.name} · ${result.rulesName} · seed ${result.seed} · ${fmtTime(result.duration)} · ${result.reason}`),
    config.rules.category !== 'canon' ? el('p', { style: { textAlign: 'center', color: 'var(--orange)' } }, 'ALTERNATE UNIVERSE RESULT — not representative of canon Mass Effect 3.') : null,
    el('div', { class: 'grid3' }, [
      sideTable(result.sides[ps], 'ALLIED FORCES', ''),
      sideTable(result.sides[es], 'HOSTILE FORCES', 'red'),
      el('div', { class: 'col' }, [
        el('div', { class: 'panel orange' }, [el('div', { class: 'panel-title' }, 'DESTRUCTION LOG'), log]),
        el('div', { class: 'panel red' }, [el('div', { class: 'panel-title' }, 'REAPER ASSESSMENT'), el('div', { class: 'intel' }, [el('div', { class: 'headline' }, intel.headline), ...intel.lines.map((l) => el('div', {}, l)), el('div', { class: 'dim' }, intel.projectedResistance)])]),
      ]),
    ]),
  ]);

  const footer = el('div', { class: 'screen-footer' }, [
    el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'),
    el('button', { class: 'btn', 'data-action': 'replay', onclick: () => app.startBattle(config, { replay: true, comparison: lb.comparison, comparisonSide: lb.comparisonSide }) }, 'Replay battle (same seed)'),
    lb.campaign ? null : el('button', { class: 'btn', onclick: () => app.startBattle({ ...config, seed: Math.floor(Math.random() * 100000), id: `${config.id}-r` }) }, 'Re-run with new seed'),
    lb.comparison ? el('button', { class: 'btn primary', onclick: () => app.show('comparison', { report: lb.comparison }) }, 'Back to comparison') : null,
    lb.campaign ? el('button', { class: 'btn primary', 'data-action': 'return-campaign', onclick: () => app.show('campaign') }, 'Return to campaign →') : null,
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn', onclick: () => {
      const blob = new Blob([JSON.stringify({ result, events: sim.events }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${config.id}-events.json`;
      a.click();
    } }, 'Export event log'),
  ]);

  return el('div', { class: 'screen' }, [el('div', { class: 'screen-header' }, [el('h1', {}, 'BATTLE RESULTS'), el('span', { class: 'sub' }, 'AFTER-ACTION REPORT')]), body, footer]);
}
