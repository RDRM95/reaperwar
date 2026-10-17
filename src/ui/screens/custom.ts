import type { App } from '../app';
import { el } from '../dom';
import { buildCustomBattle, type CustomBattleInput, type CustomFaction } from '@/scenarios';
import { FACTIONS } from '@/data/factions';
import { SHIP_CLASS_LIST, getShipClass } from '@/data/ships';
import { FORMATION_LABELS, type Environment, type FormationType } from '@/simulation/types';
import { storage } from '@/core/storage';

const ENVIRONMENTS: { id: Environment; label: string }[] = [
  { id: 'earth_orbit', label: 'Earth orbit' },
  { id: 'palaven_orbit', label: 'Palaven orbit' },
  { id: 'thessia_orbit', label: 'Thessia orbit' },
  { id: 'rannoch_orbit', label: 'Rannoch orbit' },
  { id: 'deep_space', label: 'Deep space' },
];

/** Default fleet compositions per faction (fixed, not scaled by timeline). */
export const FACTION_DEFAULTS: Record<CustomFaction, { name: string; formation: FormationType; counts: Record<string, number> }> = {
  alliance: { name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: 1 } },
  turian: { name: 'Hierarchy battle group', formation: 'line_abreast', counts: { turian_dreadnought: 8, turian_cruiser: 16, turian_frigate: 28 } },
  asari: { name: 'Republics fleet', formation: 'defensive_screen', counts: { destiny_ascension: 1, asari_dreadnought: 3, asari_cruiser: 14 } },
  cerberus: { name: 'Cerberus strike fleet', formation: 'strike_wedge', counts: { cerberus_dreadnought: 0, cerberus_cruiser: 10, cerberus_frigate: 16 } },
  geth: { name: 'Geth Consensus fleet', formation: 'strike_wedge', counts: { geth_dreadnought: 1, geth_cruiser: 10, geth_frigate: 16 } },
  quarian: { name: 'Migrant Fleet', formation: 'defensive_screen', counts: { quarian_liveship: 1, quarian_heavy: 4, quarian_cruiser: 16 } },
  reaper: { name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4, reaper_destroyer: 8, harbinger: 0 } },
};
const CUSTOM_FACTIONS: CustomFaction[] = ['alliance', 'turian', 'asari', 'cerberus', 'geth', 'quarian', 'reaper'];

const DEFAULT_INPUT: CustomBattleInput = {
  seed: 42,
  rulesId: 'canon_me3',
  environment: 'deep_space',
  startingDistanceKm: 76,
  sideA: { faction: 'alliance', name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: 1 } },
  sideB: { faction: 'reaper', name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4, reaper_destroyer: 8, harbinger: 0 } },
  reinforcementTime: 0,
  reinforcementCounts: { reaper_capital: 0, reaper_destroyer: 0 },
  maxDuration: 420,
};

export function renderCustom(app: App): HTMLElement {
  let input: CustomBattleInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));
  input.rulesId = app.prefs.lastTimelineId;
  void storage.get<CustomBattleInput | undefined>('customBattle', undefined).then((saved) => {
    if (saved && saved.sideA && saved.sideB) {
      input = { ...DEFAULT_INPUT, ...saved, sideA: { ...DEFAULT_INPUT.sideA, ...saved.sideA }, sideB: { ...DEFAULT_INPUT.sideB, ...saved.sideB } };
      render();
    }
  });

  const body = el('div', { class: 'screen-body' });
  const points = (counts: Record<string, number>) => Object.entries(counts).reduce((a, [id, n]) => a + (SHIP_CLASS_LIST.find((c) => c.id === id)?.pointValue ?? 0) * n, 0);

  const fleetEditor = (side: 'sideA' | 'sideB', title: string, cls: string) => {
    const f = input[side];
    const classes = SHIP_CLASS_LIST.filter((c) => c.faction === f.faction && c.role !== 'fighter');
    return el('div', { class: `panel ${cls}` }, [
      el('div', { class: 'panel-title' }, [title, el('span', { class: 'mono' }, `${points(f.counts)} pts`)]),
      el('div', { class: 'row' }, [
        el('label', { class: 'field', style: { flex: '1' } }, ['Faction', el('select', { 'data-faction': side, onchange: (e: Event) => {
          const fac = (e.target as HTMLSelectElement).value as CustomFaction;
          f.faction = fac;
          f.counts = { ...FACTION_DEFAULTS[fac].counts };
          f.name = FACTION_DEFAULTS[fac].name;
          f.formation = FACTION_DEFAULTS[fac].formation;
          render();
        } }, CUSTOM_FACTIONS.map((fac) => el('option', { value: fac, selected: f.faction === fac }, FACTIONS[fac].name)))]),
        el('label', { class: 'field', style: { flex: '1' } }, ['Formation', el('select', { onchange: (e: Event) => (f.formation = (e.target as HTMLSelectElement).value as FormationType) }, (Object.keys(FORMATION_LABELS) as FormationType[]).map((k) => el('option', { value: k, selected: f.formation === k }, FORMATION_LABELS[k])))]),
      ]),
      el('label', { class: 'field' }, ['Fleet name', el('input', { type: 'text', value: f.name, onchange: (e: Event) => (f.name = (e.target as HTMLInputElement).value) })]),
      el('table', {}, [
        el('tbody', {}, classes.map((c) => el('tr', {}, [
          el('td', {}, [c.name, el('div', { class: 'dim', style: { fontSize: '10px' } }, `${c.pointValue} pts each`)]),
          el('td', { class: 'num', style: { width: '110px' } }, el('input', { type: 'number', min: 0, max: 60, value: f.counts[c.id] ?? 0, 'data-count': `${side}:${c.id}`, style: { width: '80px' }, onchange: (e: Event) => {
            f.counts[c.id] = Math.max(0, Math.min(60, Number((e.target as HTMLInputElement).value) || 0));
            render();
          } })),
        ]))),
      ]),
    ]);
  };

  const render = () => {
    body.replaceChildren(
      el('div', { class: 'grid3' }, [
        fleetEditor('sideA', 'SIDE A — PLAYER', ''),
        fleetEditor('sideB', 'SIDE B — OPPONENT', 'red'),
        el('div', { class: 'col' }, [
          el('div', { class: 'panel orange' }, [
            el('div', { class: 'panel-title' }, 'CONDITIONS'),
            el('label', { class: 'field' }, ['Technology / timeline', el('select', { onchange: (e: Event) => (input.rulesId = (e.target as HTMLSelectElement).value) }, app.allTimelines().map((t) => el('option', { value: t.id, selected: input.rulesId === t.id }, t.name)))]),
            el('label', { class: 'field' }, ['Battlefield', el('select', { onchange: (e: Event) => (input.environment = (e.target as HTMLSelectElement).value as Environment) }, ENVIRONMENTS.map((x) => el('option', { value: x.id, selected: input.environment === x.id }, x.label)))]),
            el('label', { class: 'field' }, [`Starting distance: ${input.startingDistanceKm} km`, el('input', { type: 'range', min: 30, max: 160, step: 2, value: input.startingDistanceKm, oninput: (e: Event) => {
              input.startingDistanceKm = Number((e.target as HTMLInputElement).value);
              (e.target as HTMLElement).parentElement!.firstChild!.textContent = `Starting distance: ${input.startingDistanceKm} km`;
            } })]),
            el('label', { class: 'field' }, ['Random seed', el('input', { type: 'number', value: input.seed, onchange: (e: Event) => (input.seed = Number((e.target as HTMLInputElement).value) || 0) })]),
            el('label', { class: 'field' }, ['Time limit (s)', el('input', { type: 'number', value: input.maxDuration ?? 420, min: 60, max: 1800, onchange: (e: Event) => (input.maxDuration = Number((e.target as HTMLInputElement).value) || 420) })]),
          ]),
          el('div', { class: 'panel red' }, [
            el('div', { class: 'panel-title' }, 'SIDE B REINFORCEMENTS'),
            el('label', { class: 'field' }, ['Arrival time (s, 0 = none)', el('input', { type: 'number', value: input.reinforcementTime ?? 0, min: 0, onchange: (e: Event) => (input.reinforcementTime = Number((e.target as HTMLInputElement).value) || 0) })]),
            ...SHIP_CLASS_LIST.filter((c) => c.faction === input.sideB.faction && c.role !== 'fighter').map((c) => el('label', { class: 'field' }, [c.name, el('input', { type: 'number', min: 0, max: 40, value: input.reinforcementCounts?.[c.id] ?? 0, onchange: (e: Event) => {
              input.reinforcementCounts = { ...(input.reinforcementCounts ?? {}), [c.id]: Number((e.target as HTMLInputElement).value) || 0 };
            } })])),
          ]),
          el('div', { class: 'panel' }, [
            el('div', { class: 'panel-title' }, 'PRESETS'),
            el('div', { class: 'col' }, [
              el('button', { class: 'btn small', onclick: () => {
                input = JSON.parse(JSON.stringify(DEFAULT_INPUT));
                render();
              } }, 'Reference engagement (8 DN / 16 CA / 30 FF vs 4 capitals / 8 destroyers)'),
              el('button', { class: 'btn small', onclick: () => {
                input.sideA.counts = { alliance_dreadnought: 2, alliance_carrier: 0, alliance_cruiser: 6, alliance_frigate: 12, alliance_frigate_thanix: 1 };
                input.sideB.counts = { reaper_capital: 0, reaper_destroyer: 4, harbinger: 0 };
                render();
              } }, 'Destroyer hunt (small engagement)'),
              el('button', { class: 'btn small', onclick: () => {
                input.sideA.counts = { alliance_dreadnought: 12, alliance_carrier: 2, alliance_cruiser: 24, alliance_frigate: 40, alliance_frigate_thanix: 1 };
                input.sideB.counts = { reaper_capital: 5, reaper_destroyer: 10, harbinger: 1 };
                render();
              } }, 'Harbinger at Earth (large engagement)'),
            ]),
          ]),
        ]),
      ]),
    );
  };
  render();

  const total = () => {
    const a = Object.values(input.sideA.counts).reduce((x, y) => x + y, 0);
    const b = Object.values(input.sideB.counts).reduce((x, y) => x + y, 0);
    return a > 0 && b > 0;
  };

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'CUSTOM BATTLE'), el('span', { class: 'sub' }, 'SCENARIO BUILDER')]),
    body,
    el('div', { class: 'screen-footer' }, [
      el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', onclick: () => {
        void storage.set('customBattle', input);
        app.toast('CUSTOM BATTLE SAVED');
      } }, 'Save setup'),
      el('button', { class: 'btn primary', 'data-action': 'launch-custom', onclick: () => {
        if (!total()) return app.toast('BOTH SIDES NEED AT LEAST ONE SHIP');
        void storage.set('customBattle', input);
        app.selectTimeline(input.rulesId);
        const config = buildCustomBattle(input, app.getTimeline(input.rulesId));
        // Give the custom config a readable name.
        config.name = `Custom: ${input.sideA.name} vs ${input.sideB.name}`;
        app.startBattle(config);
      } }, 'Launch →'),
    ]),
  ]);
}

export { getShipClass };
