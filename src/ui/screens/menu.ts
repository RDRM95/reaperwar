import type { App } from '../app';
import { el } from '../dom';
import { SCENARIOS } from '@/scenarios';

export function renderMenu(app: App): HTMLElement {
  const rules = app.currentRules();
  const lastScenario = SCENARIOS.find((s) => s.id === app.prefs.lastScenarioId) ?? SCENARIOS[0];
  const item = (label: string, onClick: (() => void) | undefined, tag?: string, primary = false) =>
    el(
      'button',
      {
        class: `btn ${primary ? 'primary' : ''} ${onClick ? '' : 'disabled'}`,
        onclick: onClick
          ? () => {
              app.playUi('ui_click');
              onClick();
            }
          : () => app.toast('NOT YET IMPLEMENTED — SEE ROADMAP'),
        onmouseenter: () => app.playUi('ui_hover'),
        'data-menu': label.toLowerCase().replace(/[^a-z]+/g, '-'),
      },
      [label, tag ? el('span', { class: 'tag' }, tag) : null],
    );

  const left = el('div', { class: 'menu-left' }, [
    el('div', { class: 'menu-title' }, ['MASS EFFECT 3', el('span', {}, 'REAPER WAR SIMULATOR')]),
    el('div', { class: 'menu-tagline' }, 'CHANGE THE VARIABLES. CHANGE THE WAR.'),
    item('New Galactic Campaign', () => app.show('campaign_setup')),
    item('Quick Battle', () => app.show('briefing', { scenarioId: lastScenario.id }), undefined, true),
    item('Custom Battle', () => app.show('custom')),
    item('Alternate Timelines', () => app.show('timelines')),
    item('Canon vs AU Comparison', () => app.show('comparison')),
    item('Fleet Database', () => app.show('database')),
    item('Codex', () => app.show('codex')),
    item('Scenario Editor', () => app.show('custom'), 'VIA CUSTOM'),
    item('Load Game', () => void app.loadCampaign().then((ok) => { if (!ok) app.toast('NO SAVED CAMPAIGN'); }), app.campaign ? 'IN PROGRESS' : undefined),
    item('Settings', () => app.show('settings')),
    el('div', { class: 'menu-foot' }, [
      'Unofficial, non-commercial fan project. Mass Effect is a trademark of Electronic Arts / BioWare. No game assets are used; all models, audio and text are original.',
      el('br'),
      el('span', { class: 'mono' }, `v${__APP_VERSION__} · timeline: ${rules.name}`),
    ]),
  ]);

  const info = el('div', { class: 'panel menu-info' }, [
    el('div', { class: 'panel-title' }, ['ACTIVE TIMELINE', el('span', { class: `badge ${rules.category}` }, rules.category)]),
    el('h3', {}, rules.name),
    el('p', { class: 'dim' }, rules.tagline),
    el('p', {}, rules.description.slice(0, 260) + (rules.description.length > 260 ? '…' : '')),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn small', onclick: () => app.show('timelines') }, 'Change timeline'),
      el('button', { class: 'btn small primary', onclick: () => app.show('briefing', { scenarioId: 'battle_of_earth' }) }, 'Battle of Earth'),
    ]),
  ]);

  const right = el('div', { class: 'menu-right' }, [el('div', { class: 'grid-bg' }), info]);
  return el('div', { class: 'screen' }, [el('div', { class: 'menu' }, [left, right])]);
}
