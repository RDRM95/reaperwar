import { el } from './dom';
import type { RuleSet } from '@/timelines/rules';
import { alternateMeta, auPrefix, type WorldStateLock } from '@/timelines/alternates';
import { THREAT_REFERENCE_META, threatHoldsText, threatRating, threatTooltip } from '@/timelines/threat';

/**
 * The "Threat to the Reapers" badge (docs/apex/TIMELINES_V2.md §4.8): six pips,
 * the label and a tooltip with the measured Reaper losses, organic survival
 * and breaking point. The label always accompanies the pips, so the rating
 * never depends on colour alone. Custom timelines are "unrated".
 */
export function threatBadge(rules: RuleSet, size: 'compact' | 'full' = 'compact'): HTMLElement {
  const r = threatRating(rules);
  const pips = el('span', { class: 'pips', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5, 6].map((i) => el('i', { class: r && i <= r.tier ? 'pip on' : 'pip' })));
  const text = r ? (size === 'full' ? `Threat ${r.tier}/6 · ${r.label} · index ${Math.round(r.index)}` : `Threat ${r.tier}/6 · ${r.label}`) : 'Threat unrated';
  return el(
    'span',
    {
      class: r ? `threat t${r.tier}${size === 'full' ? ' full' : ''}` : `threat unrated${size === 'full' ? ' full' : ''}`,
      'data-threat-tier': r ? String(r.tier) : 'unrated',
      title: threatTooltip(r),
      'aria-label': r ? `Threat to the Reapers: ${r.tier} of 6, ${r.label}` : 'Threat to the Reapers: unrated',
    },
    [pips, el('span', { class: 'threat-label' }, text)],
  );
}

/** Plain-text form for <option> labels. */
export const threatOptionSuffix = (rules: RuleSet): string => {
  const r = threatRating(rules);
  return r ? ` · Threat ${r.tier}/6 ${r.label}` : ' · Threat unrated';
};

const pct = (x: number): string => `${Math.round(100 * x)} %`;

/** The detail block of the timelines screen: badge, band statement, measured terms, breaking point and the five groups. */
export function threatPanel(rules: RuleSet, unrated = false): HTMLElement {
  const r = unrated ? undefined : threatRating(rules);
  const meta = THREAT_REFERENCE_META;
  if (!r) {
    return el('div', { class: 'threat-panel', 'data-threat-panel': 'unrated' }, [
      el('div', { class: 'threat-head' }, ['THREAT TO THE REAPERS', threatBadge({ ...rules, category: 'custom' }, 'full')]),
      el('p', { class: 'dim' }, 'Unrated: custom timelines are not measured. The built-in timelines are rated on the threat reference engagement, in conventional battle.'),
    ]);
  }
  return el('div', { class: 'threat-panel', 'data-threat-panel': String(r.tier) }, [
    el('div', { class: 'threat-head' }, ['THREAT TO THE REAPERS', threatBadge(rules, 'full')]),
    el('p', {}, r.summary),
    el('p', { class: 'dim' }, `Reaper losses ${pct(r.reaperLoss)}, organic survival ${pct(r.organicSurvival)} over ${meta.rungs.length * meta.seeds.length} reference battles. ${threatHoldsText(r)}`),
    el('div', { class: 'threat-table' }, [
      el('table', {}, [
        el('thead', {}, el('tr', {}, [el('th', {}, 'Reaper group'), el('th', { class: 'num', title: 'Capital ships / destroyers, as this timeline deploys the group' }, 'Capitals / destroyers'), el('th', { class: 'num' }, 'Index'), el('th', { class: 'num' }, 'Won')])),
        el('tbody', {}, r.rungs.map((g) => el('tr', {}, [el('td', {}, g.name), el('td', { class: 'num' }, `${g.capitals} / ${g.destroyers}`), el('td', { class: 'num' }, g.index.toFixed(1)), el('td', { class: 'num' }, `${g.wins} of ${g.battles}`)]))),
      ]),
    ]),
    el('p', { class: 'dim small' }, `Measured in conventional battle (simulation estimate, ${meta.measuredOn}): a Crucible, a Catalyst or a controlled Reaper fleet changes the campaign, not this rating.`),
  ]);
}

/** One AU-prefixed note for a locked world-state option. */
export const worldStateLockNote = (rules: RuleSet, lock: WorldStateLock): HTMLElement => el('small', { class: 'ws-lock' }, `${auPrefix(rules.name)}locked by this timeline. ${lock.why}`);

/** The campaign note of a new timeline, AU-prefixed, or null. */
export const campaignNote = (rules: RuleSet): HTMLElement | null => {
  const note = alternateMeta(rules.id)?.campaignNote;
  return note ? el('p', { class: 'ws-lock' }, `${auPrefix(rules.name)}${note}`) : null;
};
