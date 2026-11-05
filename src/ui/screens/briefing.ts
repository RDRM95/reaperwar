import type { App } from '../app';
import { el } from '../dom';
import { SCENARIOS, defaultWorldState, getScenario } from '@/scenarios';
import { getShipClass } from '@/data/ships';
import { auPrefix, lockWorldState } from '@/timelines/alternates';
import type { RuleSet } from '@/timelines/rules';
import { threatBadge, timelineOptionLabel, worldStateLockNote } from '../threatBadge';

/** The world-state choices a scenario exposes, for the timeline's locks (TIMELINES_V2.md §4.10). */
const choicesOf = (s: { worldState?: { id: string; choices: { id: string }[] }[] }): Record<string, string[]> =>
  Object.fromEntries((s.worldState ?? []).map((o) => [o.id, o.choices.map((c) => c.id)]));

export function renderBriefing(app: App, params?: { scenarioId?: string }): HTMLElement {
  let scenarioId = params?.scenarioId ?? app.prefs.lastScenarioId;
  if (!SCENARIOS.some((s) => s.id === scenarioId) || scenarioId === 'custom') scenarioId = 'battle_of_earth';
  let scenario = getScenario(scenarioId);
  let timelineId = app.prefs.lastTimelineId;
  let seed = Math.floor(Math.random() * 100000);
  let worldState = defaultWorldState(scenario);

  /** Campaign-linked scenarios receive the saved war's fleets through world state. */
  const campaignWorldState = (): Record<string, string> => {
    const c = app.campaign;
    if (!c) return {};
    const allied = c.fleets.filter((f) => f.allegiance === 'allied').map((f) => ({ name: f.name, faction: f.faction, counts: f.counts }));
    const reaper: Record<string, number> = {};
    for (const f of c.fleets.filter((x) => x.allegiance === 'reaper')) for (const [k, n] of Object.entries(f.counts)) reaper[k] = (reaper[k] ?? 0) + n;
    return { campaignAllied: JSON.stringify(allied), campaignReaper: JSON.stringify(reaper) };
  };
  /** The player's choices with the timeline's world-state locks applied on top. */
  const lockedWorldState = (rules: RuleSet) => lockWorldState(rules, worldState, choicesOf(scenario));
  const body = el('div', { class: 'screen-body' });
  const render = () => {
    body.replaceChildren();
    const rules = app.getTimeline(timelineId);
    const locks = lockedWorldState(rules);
    const config = scenario.build(rules, seed, { ...locks.ws, ...campaignWorldState() });
    // Keys the scenario reads without a control: list only those that change the order of battle.
    const shipsOf = (ws: Record<string, string>) => JSON.stringify(scenario.build(rules, seed, { ...ws, ...campaignWorldState() }).fleets.map((f) => f.ships));
    const hiddenNotes = Object.entries(locks.hidden).filter(([k]) => {
      const without = { ...locks.ws };
      if (worldState[k] === undefined) delete without[k];
      else without[k] = worldState[k];
      return shipsOf(without) !== shipsOf(locks.ws);
    });
    const fleetSummary = (side: 'A' | 'B') =>
      config.fleets
        .filter((f) => f.side === side)
        .map((f) =>
          el('div', { class: 'entry-block' }, [
            el('b', {}, f.name + (f.arrivalTime ? ` (arrives T+${f.arrivalTime}s)` : '')),
            el('div', { class: 'dim mono', style: { fontSize: '11px', marginTop: '4px' } }, f.ships.map((s) => `${s.count}× ${getShipClass(s.classId).name}`).join(' · ')),
          ]),
        );

    const scenarioList = el('div', { class: 'col' }, SCENARIOS.filter((s) => s.id !== 'custom').map((s) =>
      el('button', { class: `btn ${s.id === scenario.id ? 'active' : ''}`, onclick: () => {
        app.playUi('ui_click');
        scenario = s;
        worldState = defaultWorldState(s);
        if (s.auOnly && s.recommendedRules.length > 0 && !s.recommendedRules.includes(timelineId)) timelineId = s.recommendedRules[0];
        render();
      } }, [s.name, s.auOnly ? el('span', { class: 'tag' }, 'AU') : null]),
    ));

    const timelineSelect = el('select', { onchange: (e: Event) => {
      timelineId = (e.target as HTMLSelectElement).value;
      render();
    } }, app.allTimelines().map((t) => el('option', { value: t.id, selected: t.id === timelineId }, timelineOptionLabel(t))));

    const worldStateControls = (scenario.worldState ?? []).map((o) => {
      const lock = locks.locked[o.id];
      const value = locks.ws[o.id] ?? o.default;
      return el('label', { class: 'field' }, [
        el('span', {}, [o.label, ' ', el('span', { class: `badge ${lock ? 'au' : o.kind === 'player_dependent' ? 'inferred' : o.kind === 'au' ? 'au' : 'estimate'}` }, lock ? 'locked (AU)' : o.kind.replace('_', ' '))]),
        el('select', { 'data-ws': o.id, onchange: (e: Event) => {
          worldState = { ...worldState, [o.id]: (e.target as HTMLSelectElement).value };
          render();
        } }, o.choices.map((c) => el('option', { value: c.id, selected: value === c.id, disabled: !!lock && c.id !== lock.value, title: c.description }, c.label))),
        el('small', {}, o.choices.find((c) => c.id === value)?.description ?? ''),
        lock ? worldStateLockNote(rules, lock) : null,
      ]);
    });
    const hiddenNote = hiddenNotes.length > 0 ? el('p', { class: 'ws-lock', 'data-ws-hidden': hiddenNotes.map(([k]) => k).join(',') }, `${auPrefix(rules.name)}this timeline also sets world state the scenario reads without a control: ${hiddenNotes.map(([, l]) => l.why).join(' ')}`) : null;

    const warn = scenario.auOnly && rules.category === 'canon' ? el('p', { style: { color: 'var(--orange)' } }, 'This scenario is written for an alternate-universe timeline. It will run under canon rules, but the briefing assumes AU technology.') : null;
    const canonNote = !scenario.auOnly && rules.category !== 'canon' ? el('p', { style: { color: 'var(--orange)' } }, `ALTERNATE UNIVERSE: ${rules.name}. Results do not represent canon Mass Effect 3.`) : null;

    body.append(
      el('div', { class: 'grid3' }, [
        el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'SCENARIO'), scenarioList]),
        el('div', { class: 'panel' }, [
          el('div', { class: 'panel-title' }, 'BRIEFING'),
          el('h2', {}, scenario.name),
          el('div', { class: 'dim mono', style: { fontSize: '11px', marginBottom: '10px' } }, scenario.subtitle),
          el('p', {}, scenario.description),
          ...scenario.briefing.map((b) => el('p', { style: { borderLeft: '2px solid var(--line)', paddingLeft: '10px' } }, b)),
          el('p', { class: 'mono dim', style: { fontSize: '11px' } }, `OBJECTIVE: ${scenario.objective}`),
          warn,
          canonNote,
        ]),
        el('div', { class: 'col' }, [
          el('div', { class: 'panel orange' }, [
            el('div', { class: 'panel-title' }, 'TIMELINE & WORLD STATE'),
            el('label', { class: 'field' }, ['Timeline', timelineSelect]),
            el('div', { class: 'threat-select-note' }, threatBadge(rules, 'full')),
            el('p', { class: 'dim', style: { fontSize: '12px' } }, rules.tagline),
            ...worldStateControls,
            hiddenNote,
            el('label', { class: 'field' }, ['Random seed', el('input', { type: 'number', value: seed, onchange: (e: Event) => {
              seed = Number((e.target as HTMLInputElement).value) || 0;
            } })]),
          ]),
          el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'ORDER OF BATTLE — ALLIED'), ...fleetSummary('A')]),
          el('div', { class: 'panel red' }, [el('div', { class: 'panel-title' }, 'ORDER OF BATTLE — HOSTILE'), ...fleetSummary('B')]),
        ]),
      ]),
    );
  };
  render();

  const footer = el('div', { class: 'screen-footer' }, [
    el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn primary', 'data-action': 'launch', onclick: () => {
      app.playUi('ui_confirm');
      app.selectTimeline(timelineId);
      const rules = app.getTimeline(timelineId);
      app.startBattle(scenario.build(rules, seed, { ...lockedWorldState(rules).ws, ...campaignWorldState() }));
    } }, 'Launch battle →'),
  ]);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'QUICK BATTLE'), el('span', { class: 'sub' }, 'MISSION BRIEFING')]),
    body,
    footer,
  ]);
}
