import type { App } from '../app';
import { el } from '../dom';
import { CANON_TECH, TECH_KEYS, cloneRules, type RuleSet, type TechModifiers } from '@/timelines/rules';
import { TECH_RANGE, exportRuleSet, importRuleSet } from '@/timelines/schema';
import { makeCustom } from '@/timelines/presets';

const TECH_LABELS: Record<keyof TechModifiers, { label: string; tip: string }> = {
  massAcceleratorDamage: { label: 'Mass accelerator damage', tip: 'Multiplies kinetic slug damage. Above ~1.5 canon fleets start killing Reaper destroyers reliably.' },
  massAcceleratorPenetration: { label: 'Mass accelerator penetration', tip: 'Reduces the armour deduction per hit. Matters most against Reaper plating (armour 320).' },
  massAcceleratorRange: { label: 'Mass accelerator range', tip: 'Longer range means more salvoes before the Reaper beams are in range.' },
  fireRate: { label: 'Rate of fire', tip: 'Divides weapon cooldowns. Also raises heat build-up.' },
  heatCapacity: { label: 'Heat capacity', tip: 'How long a ship can sustain fire before overheating.' },
  kineticBarrierStrength: { label: 'Kinetic barrier strength', tip: 'Barrier capacity. Barriers absorb slugs fully but only ~40% of Reaper beams.' },
  barrierRegen: { label: 'Barrier regeneration', tip: 'Recharge rate after three seconds without a hit.' },
  armourStrength: { label: 'Armour', tip: 'Flat per-hit deduction after barriers; ablates slowly.' },
  hullIntegrity: { label: 'Hull integrity', tip: 'Structural hit points.' },
  speed: { label: 'Speed & acceleration', tip: 'Manoeuvre speed. Capital ships remain slow relative to fighters.' },
  sensors: { label: 'Sensors', tip: 'Detection range and targeting quality.' },
  electronicWarfare: { label: 'Electronic warfare', tip: 'Scales ECM; reduces enemy hit probability.' },
  accuracy: { label: 'Accuracy', tip: 'Base hit probability multiplier for all weapons.' },
  fighterStrength: { label: 'Fighter strength', tip: 'Fighter hull, barriers and weapons.' },
  torpedoDamage: { label: 'Torpedo damage', tip: 'Disruptor torpedo warheads (bypass 75% of barriers).' },
  gardianEffectiveness: { label: 'GARDIAN effectiveness', tip: 'Point-defence laser damage.' },
  beamDamage: { label: 'Beam / stream damage', tip: 'Thanix for organics; primary beams for Reapers.' },
  crewQuality: { label: 'Crew quality', tip: 'Training and coordination; affects accuracy.' },
};

export function renderTimelines(app: App, params?: { editId?: string }): HTMLElement {
  let selectedId = params?.editId ?? app.prefs.lastTimelineId;
  let editing: RuleSet | undefined;
  const body = el('div', { class: 'screen-body' });
  const status = el('div', { class: 'mono dim', style: { fontSize: '11px', flex: '1' } });

  const list = () =>
    el('div', { class: 'col' }, app.allTimelines().map((t) => el('button', { class: `btn ${t.id === selectedId ? 'active' : ''}`, 'data-timeline': t.id, onclick: () => {
      selectedId = t.id;
      editing = undefined;
      app.playUi('ui_click');
      render();
    } }, [t.name, el('span', { class: 'tag' }, t.category.toUpperCase())])));

  const techTable = (group: 'organic' | 'reaper', rules: RuleSet, editable: boolean) =>
    el('table', {}, [
      el('thead', {}, el('tr', {}, [el('th', {}, group === 'organic' ? 'Organic technology' : 'Reaper technology'), el('th', {}, 'Multiplier')])),
      el('tbody', {}, TECH_KEYS.map((k) => {
        const v = rules[group][k];
        const changed = Math.abs(v - CANON_TECH[k]) > 1e-6;
        return el('tr', { title: TECH_LABELS[k].tip }, [
          el('td', {}, [TECH_LABELS[k].label, changed ? el('span', { class: 'badge au', style: { marginLeft: '6px' } }, 'AU') : null, el('div', { class: 'dim', style: { fontSize: '10px' } }, TECH_LABELS[k].tip)]),
          el('td', { class: 'num', style: { width: '140px' } }, editable
            ? el('input', { type: 'number', step: 0.05, min: TECH_RANGE[k][0], max: TECH_RANGE[k][1], value: v, style: { width: '90px' }, onchange: (e: Event) => {
              const n = Number((e.target as HTMLInputElement).value);
              if (Number.isFinite(n)) rules[group][k] = Math.min(TECH_RANGE[k][1], Math.max(TECH_RANGE[k][0], n));
            } })
            : el('span', { style: changed ? { color: 'var(--orange)' } : {} }, `×${v.toFixed(2)}`)),
        ]);
      })),
    ]);

  const specialPanel = (rules: RuleSet, editable: boolean) => {
    const bool = (label: string, get: () => boolean, set: (v: boolean) => void, tip: string) =>
      el('label', { class: 'field', title: tip }, [label, editable
        ? el('select', { onchange: (e: Event) => set((e.target as HTMLSelectElement).value === 'true') }, [el('option', { value: 'false', selected: !get() }, 'No'), el('option', { value: 'true', selected: get() }, 'Yes')])
        : el('span', { style: { color: get() ? 'var(--orange)' : 'var(--text)' } }, get() ? 'YES' : 'no'), el('small', {}, tip)]);
    const s = rules.special;
    const st = rules.strategic;
    return el('div', { class: 'col' }, [
      bool('Hyper-mass accelerators', () => s.hyperMassAccelerators, (v) => (s.hyperMassAccelerators = v), 'AU weapon: replaces dreadnought spinal guns with ~3× yield accelerators.'),
      bool('HADES rounds', () => s.hadesRounds, (v) => (s.hadesRounds = v), 'AU ammunition: kinetic rounds bypass 50% of armour and pierce barriers more efficiently.'),
      el('label', { class: 'field' }, ['Thanix availability', editable
        ? el('select', { onchange: (e: Event) => (s.thanixAvailability = (e.target as HTMLSelectElement).value as typeof s.thanixAvailability) }, ['canon', 'fleetwide', 'none'].map((o) => el('option', { value: o, selected: s.thanixAvailability === o }, o)))
        : el('span', {}, s.thanixAvailability), el('small', {}, 'canon: Normandy only · fleetwide: cruisers refit · none: removed')]),
      bool('Reaper command vulnerability', () => s.reaperCommandVulnerability, (v) => (s.reaperCommandVulnerability = v), 'Capital Reaper losses degrade the rest of the fleet’s coordination.'),
      bool('Indoctrination disabled', () => s.indoctrinationDisabled, (v) => (s.indoctrinationDisabled = v), 'Removes the crew penalty from Reaper presence.'),
      el('label', { class: 'field' }, [`Allied coordination: ${st.alliedCoordination.toFixed(2)}`, editable ? el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.alliedCoordination, oninput: (e: Event) => {
        st.alliedCoordination = Number((e.target as HTMLInputElement).value);
        (e.target as HTMLElement).parentElement!.firstChild!.textContent = `Allied coordination: ${st.alliedCoordination.toFixed(2)}`;
      } }) : null, el('small', {}, 'Joint training and command integration; raises crew effectiveness.')]),
      el('label', { class: 'field' }, [`Reaper competence: ×${st.reaperCompetence.toFixed(2)}`, editable ? el('input', { type: 'range', min: 0.5, max: 1.5, step: 0.05, value: st.reaperCompetence, oninput: (e: Event) => {
        st.reaperCompetence = Number((e.target as HTMLInputElement).value);
        (e.target as HTMLElement).parentElement!.firstChild!.textContent = `Reaper competence: ×${st.reaperCompetence.toFixed(2)}`;
      } }) : null, el('small', {}, 'Reaper crew/VI effectiveness.')]),
      el('label', { class: 'field' }, [`Indoctrination effectiveness: ${st.indoctrinationEffectiveness.toFixed(2)}`, editable ? el('input', { type: 'range', min: 0, max: 2, step: 0.1, value: st.indoctrinationEffectiveness, oninput: (e: Event) => {
        st.indoctrinationEffectiveness = Number((e.target as HTMLInputElement).value);
        (e.target as HTMLElement).parentElement!.firstChild!.textContent = `Indoctrination effectiveness: ${st.indoctrinationEffectiveness.toFixed(2)}`;
      } }) : null]),
      el('label', { class: 'field' }, ['Cerberus stance', editable
        ? el('select', { onchange: (e: Event) => (st.cerberusStance = (e.target as HTMLSelectElement).value as typeof st.cerberusStance) }, ['hostile', 'neutral', 'cooperative', 'controls_reapers'].map((o) => el('option', { value: o, selected: st.cerberusStance === o }, o)))
        : el('span', {}, st.cerberusStance)]),
      bool('Shepard alive', () => st.shepardAlive, (v) => (st.shepardAlive = v), ''),
      bool('Illusive Man indoctrinated', () => st.illusiveManIndoctrinated, (v) => (st.illusiveManIndoctrinated = v), 'An indoctrinated Illusive Man cannot cooperate.'),
      bool('Conventional victory possible', () => st.conventionalVictoryPossible, (v) => (st.conventionalVictoryPossible = v), 'Campaign flag: the war can be won without the Crucible.'),
      bool('Homeworld independence', () => st.homeworldIndependence, (v) => (st.homeworldIndependence = v), 'Prime/Apex rule: Earth and Palaven hold without rescue.'),
    ]);
  };

  const fleetPanel = (rules: RuleSet, editable: boolean) =>
    el('table', {}, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'Fleet strength (scenario ship counts)'), el('th', {}, '×')])),
      el('tbody', {}, (Object.keys(rules.fleetStrength) as (keyof RuleSet['fleetStrength'])[]).map((f) => el('tr', {}, [el('td', {}, f), el('td', { class: 'num' }, editable
        ? el('input', { type: 'number', step: 0.1, min: 0, max: 5, value: rules.fleetStrength[f], style: { width: '80px' }, onchange: (e: Event) => (rules.fleetStrength[f] = Math.max(0, Math.min(5, Number((e.target as HTMLInputElement).value) || 0))) })
        : `×${rules.fleetStrength[f].toFixed(2)}`)]))),
    ]);

  const render = () => {
    const rules = editing ?? app.getTimeline(selectedId);
    const editable = !!editing;
    const isCustomSaved = app.customTimelines.some((t) => t.id === rules.id);
    body.replaceChildren(
      el('div', { style: { display: 'grid', gridTemplateColumns: '280px 1fr', gap: '18px' } }, [
        el('div', { class: 'col' }, [
          el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'TIMELINES'), list()]),
          el('div', { class: 'panel orange' }, [
            el('div', { class: 'panel-title' }, 'CUSTOM'),
            el('div', { class: 'col' }, [
              el('button', { class: 'btn small', onclick: () => {
                editing = makeCustom();
                editing.id = `custom_${Date.now().toString(36)}`;
                render();
              } }, 'New custom timeline (from canon)'),
              el('button', { class: 'btn small', onclick: () => {
                const base = app.getTimeline(selectedId);
                editing = cloneRules(base);
                editing.id = `custom_${Date.now().toString(36)}`;
                editing.name = `${base.name} (custom)`;
                editing.category = 'custom';
                render();
              } }, 'Duplicate selected & edit'),
              el('button', { class: 'btn small', onclick: () => {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = 'application/json';
                inp.onchange = async () => {
                  const f = inp.files?.[0];
                  if (!f) return;
                  const res = importRuleSet(await f.text());
                  if (!res.ok || !res.rules) return app.toast(`IMPORT FAILED: ${res.errors[0]}`);
                  res.rules.id = `custom_${Date.now().toString(36)}`;
                  res.rules.category = 'custom';
                  app.saveCustomTimeline(res.rules);
                  selectedId = res.rules.id;
                  status.textContent = res.warnings.length ? `Imported with ${res.warnings.length} warning(s): ${res.warnings.slice(0, 3).join('; ')}` : 'Imported.';
                  render();
                };
                inp.click();
              } }, 'Import JSON…'),
            ]),
          ]),
        ]),
        el('div', { class: 'col' }, [
          el('div', { class: `panel ${rules.category === 'canon' ? '' : 'orange'}` }, [
            el('div', { class: 'panel-title' }, [editable ? 'EDITING' : 'TIMELINE', el('span', { class: `badge ${rules.category}` }, rules.category)]),
            editable
              ? el('div', { class: 'row' }, [
                  el('label', { class: 'field', style: { flex: '1' } }, ['Name', el('input', { type: 'text', value: rules.name, onchange: (e: Event) => (rules.name = (e.target as HTMLInputElement).value.slice(0, 80)) })]),
                  el('label', { class: 'field', style: { flex: '2' } }, ['Tagline', el('input', { type: 'text', value: rules.tagline, onchange: (e: Event) => (rules.tagline = (e.target as HTMLInputElement).value.slice(0, 160)) })]),
                ])
              : el('h2', {}, rules.name),
            el('p', { class: 'dim' }, rules.tagline),
            editable
              ? el('label', { class: 'field' }, ['Description', el('textarea', { rows: 3, onchange: (e: Event) => (rules.description = (e.target as HTMLTextAreaElement).value.slice(0, 2000)) }, rules.description)])
              : el('p', {}, rules.description),
            rules.historyChanges.length > 0 ? el('div', {}, [el('h3', {}, 'Changed history'), el('ul', { style: { paddingLeft: '18px' } }, rules.historyChanges.map((h) => el('li', {}, h)))]) : null,
            editable ? el('label', { class: 'field' }, ['Changed history (one per line)', el('textarea', { rows: 4, onchange: (e: Event) => (rules.historyChanges = (e.target as HTMLTextAreaElement).value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 40)) }, rules.historyChanges.join('\n'))]) : null,
            rules.category === 'canon' ? el('p', { style: { color: '#7fe0a0' } }, 'Canon rules: all multipliers are 1. Player-dependent ME3 outcomes are chosen in the scenario briefing, not here.') : el('p', { style: { color: 'var(--orange)' } }, 'Alternate universe. Never presented as canon.'),
            el('div', { class: 'row' }, [
              !editable ? el('button', { class: 'btn primary', 'data-action': 'select-timeline', onclick: () => {
                app.selectTimeline(rules.id);
                app.toast(`TIMELINE: ${rules.name.toUpperCase()}`);
                render();
              } }, app.prefs.lastTimelineId === rules.id ? 'Active timeline ✓' : 'Set as active timeline') : null,
              !editable && isCustomSaved ? el('button', { class: 'btn', onclick: () => {
                editing = cloneRules(rules);
                render();
              } }, 'Edit') : null,
              !editable && isCustomSaved ? el('button', { class: 'btn danger', onclick: () => {
                app.deleteCustomTimeline(rules.id);
                selectedId = 'canon_me3';
                render();
              } }, 'Delete') : null,
              editable ? el('button', { class: 'btn primary', 'data-action': 'save-timeline', onclick: () => {
                const res = importRuleSet(exportRuleSet(rules));
                if (!res.ok || !res.rules) return app.toast(`INVALID: ${res.errors[0]}`);
                const saved = { ...res.rules, id: rules.id, category: 'custom' as const };
                app.saveCustomTimeline(saved);
                selectedId = saved.id;
                editing = undefined;
                status.textContent = res.warnings.length ? `Saved with ${res.warnings.length} adjustment(s): ${res.warnings.slice(0, 3).join('; ')}` : 'Saved.';
                app.playUi('ui_confirm');
                render();
              } }, 'Save') : null,
              editable ? el('button', { class: 'btn', onclick: () => {
                editing = undefined;
                render();
              } }, 'Cancel') : null,
              el('button', { class: 'btn', onclick: () => {
                const blob = new Blob([exportRuleSet(rules)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${rules.id}.json`;
                a.click();
              } }, 'Export JSON'),
            ]),
          ]),
          el('div', { class: 'grid2' }, [
            el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'TECHNOLOGY — ORGANIC FACTIONS'), techTable('organic', rules, editable)]),
            el('div', { class: 'panel red' }, [el('div', { class: 'panel-title' }, 'TECHNOLOGY — REAPERS'), techTable('reaper', rules, editable)]),
          ]),
          el('div', { class: 'grid2' }, [
            el('div', { class: 'panel orange' }, [el('div', { class: 'panel-title' }, 'SPECIAL TECHNOLOGY & STRATEGIC VARIABLES'), specialPanel(rules, editable)]),
            el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'FLEET STRENGTH'), fleetPanel(rules, editable), el('p', { class: 'dim', style: { fontSize: '11px', marginTop: '8px' } }, 'Faction overrides (e.g. Alliance-only bonuses in Humanity Ascendant) are shown in the Fleet Database as effective stats.')]),
          ]),
        ]),
      ]),
    );
  };
  render();

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'ALTERNATE TIMELINES'), el('span', { class: 'sub' }, 'RULE ENGINE')]),
    body,
    el('div', { class: 'screen-footer' }, [el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'), status]),
  ]);
}
