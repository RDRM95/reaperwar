import type { App } from '../app';
import { el, fmtNum, setChildren } from '../dom';
import { advanceQuarter, dismantle, PROGRAMMES, requiredConventionalFleet, setAllocation, type PostWarState } from '@/campaign/postwar';
import { storage } from '@/core/storage';

/** Cerberus Ascendant post-war reconstruction screen (2186–2206). */
export function renderPostWar(app: App, state: PostWarState): HTMLElement {
  const metricsPanel = el('div');
  const allocPanel = el('div');
  const eventsPanel = el('div', { class: 'comms scroll', style: { maxHeight: '220px' } });
  const header = el('div', { class: 'row' });
  const modalHost = el('div');
  const save = () => void storage.set('postwar', state);

  const bar = (label: string, v: number, colour = 'var(--orange)') =>
    el('div', { style: { marginBottom: '6px' } }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12px' } }, [el('span', {}, label), el('span', { class: 'mono' }, `${Math.round(v * 100)}%`)]),
      el('div', { class: 'bar', style: { height: '6px' } }, [el('i', { style: { width: `${v * 100}%`, background: colour } })]),
    ]);

  const renderHeader = () => {
    const req = requiredConventionalFleet(state);
    setChildren(
      header,
      el('div', { class: 'panel orange', style: { minWidth: '200px' } }, [el('div', { class: 'panel-title' }, 'DATE'), el('div', { class: 'hud-clock' }, [`${Math.floor(state.year)} Q${(state.quarter % 4) + 1}`, el('small', {}, `quarter ${state.quarter} of 80`)])]),
      el('div', { class: 'panel red' }, [el('div', { class: 'panel-title' }, 'CONTROLLED REAPERS'), el('div', { class: 'mono', style: { fontSize: '18px', color: 'var(--red)' } }, `${state.controlledReapers}`), el('small', {}, `${state.reapersDismantled} dismantled`)]),
      el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'CONVENTIONAL FLEET'), el('div', { class: 'mono', style: { fontSize: '18px', color: 'var(--cyan)' } }, fmtNum(state.conventionalFleet)), el('small', {}, `target ${fmtNum(req)} to stand alone`)]),
      el('div', { class: 'spacer' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn primary', 'data-action': 'end-quarter', disabled: !!state.outcome, onclick: () => {
          advanceQuarter(state);
          save();
          renderAll();
        } }, 'End quarter →'),
        el('button', { class: 'btn', disabled: !!state.outcome, onclick: () => {
          for (let i = 0; i < 4 && !state.outcome; i++) advanceQuarter(state);
          save();
          renderAll();
        } }, '+1 year'),
        el('button', { class: 'btn', onclick: () => app.show('menu') }, 'Menu'),
      ]),
    );
  };

  const renderMetrics = () => {
    const m = state.metrics;
    setChildren(
      metricsPanel,
      bar('Earth recovery', m.earthRecovery, 'var(--blue)'),
      bar('Sol defence', m.solDefence, 'var(--blue)'),
      bar('Infrastructure', m.infrastructure, 'var(--blue)'),
      bar('Colonies', m.colonies, 'var(--blue)'),
      bar('Shipyard capacity', m.shipyardCapacity, 'var(--cyan)'),
      bar('Reaper technology', m.reaperTech, 'var(--red)'),
      bar('Dismantlement readiness', m.dismantlementReadiness, 'var(--red)'),
      bar('Alliance relations', m.allianceRelations),
      bar('Council relations', m.councilRelations),
      bar('Cerberus influence', m.cerberusInfluence),
      bar('Stability', m.stability, m.stability < 0.25 ? 'var(--red)' : 'var(--orange)'),
      el('div', { class: 'row', style: { marginTop: '10px' } }, [
        el('button', { class: 'btn small danger', 'data-action': 'dismantle', disabled: !!state.outcome, onclick: () => {
          const r = dismantle(state, 6);
          app.toast(r.ok ? `${r.dismantled} REAPER${r.dismantled > 1 ? 'S' : ''} DISMANTLED` : (r.reason ?? 'REFUSED').toUpperCase());
          save();
          renderAll();
        } }, 'Dismantle Reapers this quarter'),
        el('small', { class: 'dim' }, 'Up to 6 per quarter at full readiness. Refused while humanity cannot defend itself without them.'),
      ]),
    );
  };

  const renderAlloc = () => {
    setChildren(
      allocPanel,
      el('p', { class: 'dim', style: { fontSize: '12px' } }, 'Allocate the quarterly budget. Values normalise to 100%. Each programme has side effects (see descriptions).'),
      ...PROGRAMMES.map((p) =>
        el('label', { class: 'field', style: { marginBottom: '6px' } }, [
          el('span', {}, [`${p.label}: ${state.allocation[p.id].toFixed(0)}%`]),
          el('input', { type: 'range', min: 0, max: 30, step: 1, value: state.allocation[p.id], 'data-programme': p.id, oninput: (e: Event) => {
            setAllocation(state, { [p.id]: Number((e.target as HTMLInputElement).value) });
            save();
            renderAlloc();
          } }),
          el('small', {}, p.description),
        ]),
      ),
    );
  };

  const renderEvents = () => {
    setChildren(eventsPanel, ...state.events.slice(-14).reverse().map((e) => el('div', { class: `line ${e.kind === 'crisis' || e.kind === 'warning' ? 'reaper' : ''}` }, [el('span', { class: 'who' }, `[${2186 + Math.floor(e.quarter / 4)} Q${(e.quarter % 4) + 1}] `), e.text])));
  };

  const renderModal = () => {
    modalHost.replaceChildren();
    if (!state.outcome) return;
    modalHost.append(
      el('div', { class: 'screen transparent', style: { background: 'rgba(6,9,15,0.75)', alignItems: 'center', justifyContent: 'center' } }, [
        el('div', { class: 'panel', style: { width: '600px', textAlign: 'center' } }, [
          el('div', { class: `result-banner ${state.outcome.kind}` }, state.outcome.kind === 'victory' ? 'PLAN COMPLETE' : 'PLAN FAILED'),
          el('p', {}, state.outcome.reason),
          el('p', { class: 'dim' }, 'Alternate continuity: Cerberus Ascendant. Not canon.'),
          el('div', { class: 'row', style: { justifyContent: 'center' } }, [el('button', { class: 'btn primary', onclick: () => app.show('menu') }, 'Main menu'), el('button', { class: 'btn', onclick: () => modalHost.replaceChildren() }, 'Review')]),
        ]),
      ]),
    );
  };

  const renderAll = () => {
    renderHeader();
    renderMetrics();
    renderAlloc();
    renderEvents();
    renderModal();
  };
  renderAll();

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'CERBERUS ASCENDANT'), el('span', { class: 'sub' }, 'POST-WAR RECONSTRUCTION 2186–2206 · ALTERNATE CONTINUITY')]),
    el('div', { class: 'screen-body' }, [
      header,
      el('div', { class: 'grid3', style: { marginTop: '12px' } }, [
        el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'STATE OF HUMAN SPACE'), metricsPanel]),
        el('div', { class: 'panel orange' }, [el('div', { class: 'panel-title' }, 'QUARTERLY PROGRAMMES'), allocPanel]),
        el('div', { class: 'col' }, [
          el('div', { class: 'panel red' }, [el('div', { class: 'panel-title' }, 'THE TWENTY-YEAR PLAN'), el('p', { style: { fontSize: '13px' } }, 'The controlled Reapers are temporary instruments. Replace their military superiority with independently produced conventional fleets, then dismantle them. The Illusive Man alone holds the control interface: no shared authority, no Council oversight, no successor.'), el('p', { class: 'dim', style: { fontSize: '12px' } }, 'Success: every Reaper dismantled while Sol can defend itself. Failure: unrest, a Council coalition, or 2206 with Reapers still in service.')]),
          el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'LOG'), eventsPanel]),
        ]),
      ]),
    ]),
    modalHost,
  ]);
}
