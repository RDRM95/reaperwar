import type { App } from '../app';
import { el, fmtNum, provenanceBadge, setChildren } from '../dom';
import { SHIP_CLASS_LIST } from '@/data/ships';
import { WEAPONS, getWeapon } from '@/data/weapons';
import { FACTIONS } from '@/data/factions';
import { applyRulesToShip, applyRulesToWeapon } from '@/timelines/rules';
import type { ShipClassDef } from '@/data/types';

export function renderDatabase(app: App): HTMLElement {
  const rules = app.currentRules();
  let current: ShipClassDef = SHIP_CLASS_LIST[0];
  const nav = el('div', { class: 'codex-nav scroll' });
  const bodyPane = el('div', { class: 'codex-body scroll' });

  const statRow = (label: string, base: { value: number; provenance: string; note?: string }, effective: number, unit = '') => {
    const changed = Math.abs(effective - base.value) > 1e-6;
    return el('tr', {}, [
      el('td', {}, [label, ' ', provenanceBadge(base.provenance), base.note ? el('div', { class: 'dim', style: { fontSize: '10px' } }, base.note) : null]),
      el('td', { class: 'num' }, fmtNum(base.value, 2) + unit),
      el('td', { class: `num ${changed ? 'better' : ''}`, style: changed ? { color: 'var(--orange)' } : {} }, [fmtNum(effective, 2) + unit, changed ? el('span', { class: 'badge au', style: { marginLeft: '6px' } }, 'AU') : null]),
    ]);
  };

  const renderEntry = () => {
    const c = current;
    const eff = applyRulesToShip(c, rules);
    const f = FACTIONS[c.faction];
    setChildren(bodyPane,
      el('h2', {}, c.name),
      el('div', { class: 'dim mono', style: { fontSize: '11px', marginBottom: '6px' } }, `${f.name.toUpperCase()} · ${c.role.replace('_', ' ').toUpperCase()}`),
      el('p', {}, [provenanceBadge(c.designProvenance.provenance), ' ', c.designProvenance.value]),
      el('p', {}, c.description),
      el('table', {}, [
        el('thead', {}, el('tr', {}, [el('th', {}, 'Statistic'), el('th', {}, 'Canon ME3 value'), el('th', {}, `${rules.name}`)])),
        el('tbody', {}, [
          statRow('Length', c.lengthM, c.lengthM.value, ' m'),
          statRow('Hull integrity', c.hull, eff.hull),
          statRow('Armour', c.armour, eff.armour),
          statRow('Kinetic barriers', c.barriers, eff.barriers),
          statRow('Barrier regen /s', c.barrierRegen, eff.barrierRegen),
          statRow('Max combat speed', c.maxSpeed, eff.maxSpeed, ' km/s'),
          statRow('Acceleration', c.acceleration, eff.acceleration, ' km/s²'),
          statRow('Turn rate', c.turnRate, eff.turnRate, ' °/s'),
          statRow('Sensor range', c.sensorRange, eff.sensorRange, ' km'),
        ]),
      ]),
      el('h3', { style: { marginTop: '16px' } }, 'Armament'),
      el('table', {}, [
        el('thead', {}, el('tr', {}, [el('th', {}, 'Mount'), el('th', {}, 'Count'), el('th', {}, 'Damage'), el('th', {}, 'Cooldown'), el('th', {}, 'Range'), el('th', {}, 'Penetration')])),
        el('tbody', {}, c.hardpoints.map((hp) => {
          const base = getWeapon(hp.weaponId);
          const w = applyRulesToWeapon(base, c.faction, c, rules, WEAPONS);
          const changed = w.substitutedFrom || Math.abs(w.damage - base.damage) > 1e-6;
          return el('tr', {}, [
            el('td', {}, [w.name, ' ', provenanceBadge(w.provenance.provenance), w.substitutedFrom ? el('div', { class: 'dim', style: { fontSize: '10px' } }, `replaces ${base.name} in this timeline`) : null]),
            el('td', { class: 'num' }, String(hp.count)),
            el('td', { class: 'num', style: changed ? { color: 'var(--orange)' } : {} }, `${fmtNum(w.damage)}${w.beamDuration ? ` /s × ${w.beamDuration}s` : ''}`),
            el('td', { class: 'num' }, `${w.cooldown.toFixed(1)} s`),
            el('td', { class: 'num' }, `${fmtNum(w.range)} km`),
            el('td', { class: 'num' }, w.penetration.toFixed(2) + (w.armourBypass ? ` (+${fmtNum(w.armourBypass * 100)}% bypass)` : '')),
          ]);
        })),
      ]),
      c.fighterComplement ? el('p', { class: 'dim' }, `Carries ${c.fighterComplement.count} fighters.`) : null,
      el('p', { class: 'dim', style: { fontSize: '12px' } }, `Point value ${c.pointValue}. All hull/armour/barrier figures are simulation estimates on a scale where one Everest-class dreadnought round ≈ 1,000 points.`),
    );
    for (const b of nav.querySelectorAll<HTMLButtonElement>('[data-class]')) b.classList.toggle('active', b.dataset.class === c.id);
  };

  const factions = [...new Set(SHIP_CLASS_LIST.map((c) => c.faction))];
  for (const fid of factions) {
    nav.append(el('div', { class: 'cat' }, FACTIONS[fid].name.toUpperCase()));
    for (const c of SHIP_CLASS_LIST.filter((x) => x.faction === fid)) {
      nav.append(el('button', { class: 'btn', 'data-class': c.id, onclick: () => {
        current = c;
        app.playUi('ui_click');
        renderEntry();
      } }, c.name));
    }
  }
  nav.append(el('div', { class: 'cat' }, 'OTHER FACTIONS'), el('div', { class: 'dim', style: { fontSize: '11px', padding: '4px 10px' } }, 'Salarian, Quarian and Geth hulls are scheduled for a later phase.'));
  renderEntry();

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'FLEET DATABASE'), el('span', { class: 'sub' }, `EFFECTIVE STATS UNDER: ${rules.name.toUpperCase()}`)]),
    el('div', { class: 'screen-body' }, [el('div', { class: 'codex' }, [nav, bodyPane])]),
    el('div', { class: 'screen-footer' }, [el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'), el('button', { class: 'btn', onclick: () => app.show('timelines') }, 'Change timeline')]),
  ]);
}
