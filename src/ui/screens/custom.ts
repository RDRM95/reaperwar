import type { App } from '../app';
import { el } from '../dom';
import { CUSTOM_DEFAULT_DISTANCE, CUSTOM_DEFAULT_DURATION, buildCustomBattle, type CustomBattleInput, type CustomFaction, type CustomFleetInput } from '@/scenarios';
import { FACTIONS } from '@/data/factions';
import { SHIP_CLASS_LIST, getShipClass } from '@/data/ships';
import { FORMATION_LABELS, type Environment, type FormationType } from '@/simulation/types';
import { storage } from '@/core/storage';
import { timelineOptionLabel } from '../threatBadge';
import { parseBattlePreset, exportBattlePreset } from '@/scenarios/battlePreset';

const ENVIRONMENTS: { id: Environment; label: string }[] = [
  { id: 'earth_orbit', label: 'Earth orbit' },
  { id: 'palaven_orbit', label: 'Palaven orbit' },
  { id: 'thessia_orbit', label: 'Thessia orbit' },
  { id: 'rannoch_orbit', label: 'Rannoch orbit' },
  { id: 'surkesh_orbit', label: 'Sur’Kesh orbit' },
  { id: 'citadel', label: 'The Citadel' },
  { id: 'deep_space', label: 'Deep space' },
];

/** Default fleet compositions per faction (fixed, not scaled by timeline). */
export const FACTION_DEFAULTS: Record<CustomFaction, { name: string; formation: FormationType; counts: Record<string, number> }> = {
  alliance: { name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: 1 } },
  turian: { name: 'Hierarchy battle group', formation: 'line_abreast', counts: { turian_dreadnought: 8, turian_cruiser: 16, turian_frigate: 28 } },
  asari: { name: 'Republics fleet', formation: 'defensive_screen', counts: { destiny_ascension: 1, asari_dreadnought: 3, asari_cruiser: 14 } },
  salarian: { name: 'Union Third Fleet', formation: 'line_abreast', counts: { salarian_dreadnought: 2, salarian_cruiser: 10, salarian_frigate: 16 } },
  cerberus: { name: 'Cerberus strike fleet', formation: 'strike_wedge', counts: { cerberus_dreadnought: 0, cerberus_cruiser: 10, cerberus_frigate: 16 } },
  geth: { name: 'Geth Consensus fleet', formation: 'strike_wedge', counts: { geth_dreadnought: 1, geth_cruiser: 10, geth_frigate: 16 } },
  quarian: { name: 'Migrant Fleet', formation: 'defensive_screen', counts: { quarian_liveship: 1, quarian_heavy: 4, quarian_cruiser: 16 } },
  reaper: { name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4, reaper_destroyer: 8, harbinger: 0 } },
};
const CUSTOM_FACTIONS: CustomFaction[] = ['alliance', 'turian', 'asari', 'salarian', 'cerberus', 'geth', 'quarian', 'reaper'];

/** Above this many hulls on one side the briefing warns about performance; there is no cap. */
const PERF_WARN_HULLS = 150;

const DEFAULT_INPUT: CustomBattleInput = {
  seed: 42,
  rulesId: 'canon_me3',
  environment: 'deep_space',
  theatreLayout: 'three_dimensional',
  startingDistanceKm: CUSTOM_DEFAULT_DISTANCE,
  sideA: { faction: 'alliance', name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: 1 } },
  sideB: { faction: 'reaper', name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4, reaper_destroyer: 8, harbinger: 0 } },
  extraA: [],
  extraB: [],
  reinforcementTime: 0,
  reinforcementFaction: 'reaper',
  reinforcementCounts: {},
  maxDuration: CUSTOM_DEFAULT_DURATION,
};

const newFleet = (fac: CustomFaction): CustomFleetInput => ({ faction: fac, name: FACTION_DEFAULTS[fac].name, formation: FACTION_DEFAULTS[fac].formation, counts: { ...FACTION_DEFAULTS[fac].counts }, arrivalTime: 0 });

export function renderCustom(app: App): HTMLElement {
  let input: CustomBattleInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));
  let importDraft = '';
  let importError = '';
  let importOpen = false;
  input.rulesId = app.prefs.lastTimelineId;
  void storage.get<CustomBattleInput | undefined>('customBattle', undefined).then((saved) => {
    if (saved && saved.sideA && saved.sideB) {
      input = { ...DEFAULT_INPUT, ...saved, sideA: { ...DEFAULT_INPUT.sideA, ...saved.sideA }, sideB: { ...DEFAULT_INPUT.sideB, ...saved.sideB }, extraA: saved.extraA ?? [], extraB: saved.extraB ?? [] };
      // Older saves carried a Reaper-keyed reinforcement roster regardless of side B's faction.
      if (!saved.reinforcementFaction) input.reinforcementFaction = input.sideB.faction;
      render();
    }
  });

  const body = el('div', { class: 'screen-body' });
  const points = (counts: Record<string, number>, faction: CustomFaction) => Object.entries(counts).reduce((a, [id, n]) => a + ((SHIP_CLASS_LIST.find((c) => c.id === id && c.faction === faction)?.pointValue ?? 0) * n), 0);
  const hulls = (counts: Record<string, number>, faction: CustomFaction) => Object.entries(counts).reduce((a, [id, n]) => a + (SHIP_CLASS_LIST.some((c) => c.id === id && c.faction === faction) ? n : 0), 0);
  const sideFleets = (side: 'A' | 'B'): CustomFleetInput[] => (side === 'A' ? [input.sideA, ...(input.extraA ?? [])] : [input.sideB, ...(input.extraB ?? [])]);
  const sideHulls = (side: 'A' | 'B') => sideFleets(side).reduce((a, f) => a + hulls(f.counts, f.faction), 0);
  const sidePoints = (side: 'A' | 'B') => sideFleets(side).reduce((a, f) => a + points(f.counts, f.faction), 0);

  /** One fleet card. `key` is the data-count prefix: 'sideA'/'sideB' for the main fleets (kept for the tests), 'A2'/'B3'… for extras. */
  const fleetCard = (f: CustomFleetInput, key: string, title: string, onRemove?: () => void) => {
    const classes = SHIP_CLASS_LIST.filter((c) => c.faction === f.faction && c.role !== 'fighter');
    return el('div', { class: 'entry-block', 'data-fleet-card': key }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [el('b', {}, title), el('span', { class: 'mono dim' }, `${hulls(f.counts, f.faction)} hulls · ${points(f.counts, f.faction)} pts`)]),
      el('div', { class: 'row' }, [
        el('label', { class: 'field', style: { flex: '1' } }, ['Faction', el('select', { 'data-faction': key, onchange: (e: Event) => {
          const fac = (e.target as HTMLSelectElement).value as CustomFaction;
          f.faction = fac;
          f.counts = { ...FACTION_DEFAULTS[fac].counts };
          f.name = FACTION_DEFAULTS[fac].name;
          f.formation = FACTION_DEFAULTS[fac].formation;
          render();
        } }, CUSTOM_FACTIONS.map((fac) => el('option', { value: fac, selected: f.faction === fac }, FACTIONS[fac].name)))]),
        el('label', { class: 'field', style: { flex: '1' } }, ['Formation', el('select', { onchange: (e: Event) => (f.formation = (e.target as HTMLSelectElement).value as FormationType) }, (Object.keys(FORMATION_LABELS) as FormationType[]).map((k) => el('option', { value: k, selected: f.formation === k }, FORMATION_LABELS[k])))]),
      ]),
      el('div', { class: 'row' }, [
        el('label', { class: 'field', style: { flex: '2' } }, ['Fleet name', el('input', { type: 'text', value: f.name, onchange: (e: Event) => (f.name = (e.target as HTMLInputElement).value) })]),
        el('label', { class: 'field', style: { flex: '1' } }, ['Arrives at (s)', el('input', { type: 'number', min: 0, value: f.arrivalTime ?? 0, 'data-arrival': key, onchange: (e: Event) => (f.arrivalTime = Math.max(0, Number((e.target as HTMLInputElement).value) || 0)) })]),
      ]),
      el('table', {}, [
        el('tbody', {}, classes.map((c) => el('tr', {}, [
          el('td', {}, [c.name, el('div', { class: 'dim', style: { fontSize: '10px' } }, `${c.pointValue} pts each${c.designProvenance.provenance === 'AU_MODIFIED' ? ' · AU' : ''}`)]),
          el('td', { class: 'num', style: { width: '110px' } }, el('input', { type: 'number', min: 0, value: f.counts[c.id] ?? 0, 'data-count': `${key}:${c.id}`, style: { width: '80px' }, onchange: (e: Event) => {
            f.counts[c.id] = Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));
            render();
          } })),
        ]))),
      ]),
      onRemove ? el('button', { class: 'btn small danger', 'data-action': `remove-${key}`, onclick: onRemove }, 'Remove fleet') : null,
    ]);
  };

  const sideEditor = (side: 'A' | 'B', title: string, cls: string) => {
    const main = side === 'A' ? input.sideA : input.sideB;
    const extras = side === 'A' ? (input.extraA ??= []) : (input.extraB ??= []);
    const n = sideHulls(side);
    return el('div', { class: `panel ${cls}` }, [
      el('div', { class: 'panel-title' }, [title, el('span', { class: 'mono' }, `${n} hulls · ${sidePoints(side)} pts`)]),
      n > PERF_WARN_HULLS ? el('div', { class: 'dim', style: { color: 'var(--orange)', fontSize: '11px', marginBottom: '6px' } }, `${n} hulls on one side: no cap applies, but very large battles run slower on modest machines (lower graphics quality in Settings if needed).`) : null,
      fleetCard(main, side === 'A' ? 'sideA' : 'sideB', `${main.name} (main fleet)`),
      ...extras.map((f, i) => fleetCard(f, `${side}${i + 2}`, `${f.name} (allied fleet ${i + 1})`, () => {
        extras.splice(i, 1);
        render();
      })),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn small', 'data-action': `add-fleet-${side}`, onclick: () => {
          const used = new Set(sideFleets(side).map((f) => f.faction));
          const next = CUSTOM_FACTIONS.find((fac) => !used.has(fac) && fac !== 'reaper') ?? 'alliance';
          extras.push(newFleet(next));
          render();
        } }, '+ Add a fleet of another faction'),
        el('small', { class: 'dim' }, 'United fleets: every faction can fight on either side; allied fleets form up beside the main fleet.'),
      ]),
    ]);
  };

  const render = () => {
    const rf = input.reinforcementFaction ?? input.sideB.faction;
    // An alternate or custom timeline is marked in the picker and named in an AU line under it, as in the briefing.
    const auNote = el('p', { 'data-au-note': '', style: { color: 'var(--orange)', fontSize: '12px', margin: '0 0 8px' } });
    const setAuNote = () => {
      const t = app.getTimeline(input.rulesId);
      auNote.textContent = t.category === 'canon' ? '' : `ALTERNATE UNIVERSE: ${t.name}. Results do not represent canon Mass Effect 3.`;
      auNote.hidden = t.category === 'canon';
    };
    setAuNote();
    body.replaceChildren(
      el('details', { class: 'panel', open: importOpen, ontoggle: (e: Event) => {
        importOpen = (e.currentTarget as HTMLDetailsElement).open;
      } }, [
        el('summary', { style: { cursor: 'pointer', fontWeight: 'bold' } }, 'AI BATTLE PRESET — PASTE / EXPORT'),
        el('p', { class: 'dim', style: { margin: '10px 0' } },
          'Ask ChatGPT for a Reaper War Simulator preset. Paste its JSON here, import, review the fleet cards, then launch. No data is uploaded.'),
        el('textarea', {
          rows: 10, value: importDraft, 'data-battle-preset-input': '',
          placeholder: 'Paste reaperwar-battle-v1 JSON here (plain or in a JSON code block).',
          style: { width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' },
          oninput: (e: Event) => { importDraft = (e.target as HTMLTextAreaElement).value; },
        }),
        importError ? el('p', { 'data-battle-preset-error': '', style: { color: 'var(--orange)' } }, importError) : null,
        el('div', { class: 'row', style: { marginTop: '8px' } }, [
          el('button', { class: 'btn primary', 'data-action': 'import-battle-preset', onclick: () => {
            try {
              const parsed = parseBattlePreset(importDraft, app.allTimelines().map((t) => t.id));
              input = parsed;
              importError = '';
              importDraft = '';
              importOpen = false;
              void storage.set('customBattle', input);
              render();
              app.toast('PRESET IMPORTED — REVIEW FLEETS, THEN LAUNCH');
            } catch (error) {
              importError = error instanceof Error ? error.message : 'Could not read preset.';
              importOpen = true;
              render();
            }
          } }, 'Import battle'),
          el('button', { class: 'btn', 'data-action': 'export-battle-preset', onclick: () => {
            importDraft = exportBattlePreset(input);
            importError = '';
            importOpen = true;
            render();
          } }, 'Show setup JSON'),
          el('button', { class: 'btn', 'data-action': 'copy-battle-preset', onclick: () => {
            const json = exportBattlePreset(input);
            void navigator.clipboard.writeText(json).then(() => app.toast('BATTLE PRESET COPIED')).catch(() => {
              importDraft = json;
              importError = 'Clipboard unavailable. Copy the JSON shown above instead.';
              importOpen = true;
              render();
            });
          } }, 'Copy setup'),
        ]),
      ]),
      el('div', { class: 'grid3' }, [
        sideEditor('A', 'SIDE A — PLAYER', ''),
        sideEditor('B', 'SIDE B — OPPONENT', 'red'),
        el('div', { class: 'col' }, [
          el('div', { class: 'panel orange' }, [
            el('div', { class: 'panel-title' }, 'CONDITIONS'),
            el('label', { class: 'field' }, ['Technology / timeline', el('select', { 'data-field': 'timeline', onchange: (e: Event) => {
              input.rulesId = (e.target as HTMLSelectElement).value;
              setAuNote();
            } }, app.allTimelines().map((t) => el('option', { value: t.id, selected: input.rulesId === t.id }, timelineOptionLabel(t))))]),
            auNote,
            el('label', { class: 'field' }, ['Battlefield', el('select', { onchange: (e: Event) => (input.environment = (e.target as HTMLSelectElement).value as Environment) }, ENVIRONMENTS.map((x) => el('option', { value: x.id, selected: input.environment === x.id }, x.label)))]),
            el('label', { class: 'field' }, ['Battlespace layout', el('select', { 'data-action': 'theatre-layout', onchange: (e: Event) => {
              input.theatreLayout = (e.target as HTMLSelectElement).value as 'three_dimensional' | 'legacy_plane';
            } }, [
              el('option', { value: 'three_dimensional', selected: input.theatreLayout === 'three_dimensional' }, 'OPEN 3D — MULTI-LEVEL FLEETS'),
              el('option', { value: 'legacy_plane', selected: input.theatreLayout !== 'three_dimensional' }, 'ORIGINAL — REPLAY COMPATIBLE'),
            ])]),
            el('label', { class: 'field' }, [`Starting distance: ${input.startingDistanceKm} km`, el('input', { type: 'range', min: 30, max: 600, step: 2, value: input.startingDistanceKm, oninput: (e: Event) => {
              input.startingDistanceKm = Number((e.target as HTMLInputElement).value);
              (e.target as HTMLElement).parentElement!.firstChild!.textContent = `Starting distance: ${input.startingDistanceKm} km`;
            } })]),
            el('label', { class: 'field' }, ['Random seed', el('input', { type: 'number', value: input.seed, onchange: (e: Event) => (input.seed = Number((e.target as HTMLInputElement).value) || 0) })]),
            el('label', { class: 'field' }, ['Time limit (s)', el('input', { type: 'number', value: input.maxDuration ?? CUSTOM_DEFAULT_DURATION, min: 60, onchange: (e: Event) => (input.maxDuration = Math.max(60, Number((e.target as HTMLInputElement).value) || CUSTOM_DEFAULT_DURATION)) })]),
          ]),
          el('div', { class: 'panel red' }, [
            el('div', { class: 'panel-title' }, 'SIDE B REINFORCEMENTS'),
            el('label', { class: 'field' }, ['Arrival time (s, 0 = none)', el('input', { type: 'number', value: input.reinforcementTime ?? 0, min: 0, onchange: (e: Event) => (input.reinforcementTime = Math.max(0, Number((e.target as HTMLInputElement).value) || 0)) })]),
            el('label', { class: 'field' }, ['Reinforcement faction', el('select', { 'data-faction': 'reinforcements', onchange: (e: Event) => {
              input.reinforcementFaction = (e.target as HTMLSelectElement).value as CustomFaction;
              input.reinforcementCounts = {};
              render();
            } }, CUSTOM_FACTIONS.map((fac) => el('option', { value: fac, selected: rf === fac }, FACTIONS[fac].name)))]),
            ...SHIP_CLASS_LIST.filter((c) => c.faction === rf && c.role !== 'fighter').map((c) => el('label', { class: 'field' }, [c.name, el('input', { type: 'number', min: 0, value: input.reinforcementCounts?.[c.id] ?? 0, 'data-count': `reinforcements:${c.id}`, onchange: (e: Event) => {
              input.reinforcementCounts = { ...(input.reinforcementCounts ?? {}), [c.id]: Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0)) };
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
                input.sideA = newFleet('alliance');
                input.sideA.counts = { alliance_dreadnought: 2, alliance_carrier: 0, alliance_cruiser: 6, alliance_frigate: 12, alliance_frigate_thanix: 1 };
                input.extraA = [];
                input.sideB = newFleet('reaper');
                input.sideB.counts = { reaper_capital: 0, reaper_destroyer: 4, harbinger: 0 };
                input.extraB = [];
                render();
              } }, 'Destroyer hunt (small engagement)'),
              el('button', { class: 'btn small', 'data-action': 'preset-sword', onclick: () => {
                input.sideA = { faction: 'alliance', name: 'Sword Fleet (Alliance)', formation: 'line_abreast', counts: { alliance_dreadnought: 6, alliance_carrier: 2, alliance_cruiser: 16, alliance_frigate: 24, alliance_frigate_thanix: 1 }, arrivalTime: 0 };
                input.extraA = [
                  { faction: 'turian', name: 'Sword Fleet (Hierarchy)', formation: 'line_abreast', counts: { turian_dreadnought: 5, turian_cruiser: 10, turian_frigate: 16 }, arrivalTime: 0 },
                  { faction: 'asari', name: 'Sword Fleet (Republics)', formation: 'defensive_screen', counts: { destiny_ascension: 1, asari_dreadnought: 2, asari_cruiser: 8 }, arrivalTime: 0 },
                  { faction: 'salarian', name: 'Salarian First Fleet', formation: 'line_abreast', counts: { salarian_dreadnought: 2, salarian_cruiser: 8, salarian_frigate: 12 }, arrivalTime: 0 },
                  { faction: 'quarian', name: 'Migrant Fleet detachment', formation: 'defensive_screen', counts: { quarian_heavy: 3, quarian_cruiser: 10 }, arrivalTime: 0 },
                  { faction: 'geth', name: 'Geth fleet', formation: 'strike_wedge', counts: { geth_dreadnought: 1, geth_cruiser: 8, geth_frigate: 12 }, arrivalTime: 0 },
                ];
                input.sideB = { faction: 'reaper', name: 'Reaper blockade', formation: 'strike_wedge', counts: { reaper_capital: 6, reaper_destroyer: 14, harbinger: 1 }, arrivalTime: 0 };
                input.extraB = [{ faction: 'cerberus', name: 'Cerberus strike group', formation: 'strike_wedge', counts: { cerberus_cruiser: 6, cerberus_frigate: 10 }, arrivalTime: 45 }];
                input.reinforcementFaction = 'reaper';
                input.reinforcementCounts = { reaper_capital: 3, reaper_destroyer: 8 };
                input.reinforcementTime = 90;
                input.environment = 'earth_orbit';
                render();
              } }, 'Sword Fleet at Earth (united fleets vs Harbinger + Cerberus)'),
              el('button', { class: 'btn small', onclick: () => {
                input.sideA = newFleet('alliance');
                input.sideA.counts = { alliance_dreadnought: 12, alliance_carrier: 2, alliance_cruiser: 24, alliance_frigate: 40, alliance_frigate_thanix: 1 };
                input.extraA = [];
                input.sideB = newFleet('reaper');
                input.sideB.counts = { reaper_capital: 5, reaper_destroyer: 10, harbinger: 1 };
                input.extraB = [];
                render();
              } }, 'Harbinger at Earth (large engagement)'),
            ]),
          ]),
        ]),
      ]),
    );
  };
  render();

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'CUSTOM BATTLE'), el('span', { class: 'sub' }, 'SCENARIO BUILDER · UNITED FLEETS · NO HULL CAP')]),
    body,
    el('div', { class: 'screen-footer' }, [
      el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', onclick: () => {
        void storage.set('customBattle', input);
        app.toast('CUSTOM BATTLE SAVED');
      } }, 'Save setup'),
      el('button', { class: 'btn primary', 'data-action': 'launch-custom', onclick: () => {
        if (sideHulls('A') === 0 || sideHulls('B') === 0) return app.toast('BOTH SIDES NEED AT LEAST ONE SHIP');
        void storage.set('customBattle', input);
        app.selectTimeline(input.rulesId);
        app.startBattle(buildCustomBattle(input, app.getTimeline(input.rulesId)));
      } }, 'Launch →'),
    ]),
  ]);
}

export { getShipClass };
