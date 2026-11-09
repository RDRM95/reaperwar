import { describe, expect, it } from 'vitest';
import {
  AUTO,
  CERBERUS_HOSTILE_TEXT,
  DISTANT_LAYER_APEX_TEXT,
  DISTANT_LAYER_CANON_TEXT,
  FINAL_BATTLE_WORLD_STATE,
  SCENARIOS,
  buildScenario,
  defaultWorldState,
  describeOption,
  getScenario,
  resolveWorldState,
  type WorldStateOption,
} from '@/scenarios';
import { PRESETS, getPreset } from '@/timelines/presets';
import { cloneRules } from '@/timelines/rules';

/**
 * Declared world state (WORK_BREAKDOWN.md §1.3.12, §1.6.3 `tests/worldState.test.ts`; CUSTOM_BATTLE_DESIGN.md §3.2;
 * ADOPTION_PLAN.md §4.1): defaults filled, `'auto'` resolved, unavailable and unknown choices coerced with a note,
 * disabled options forced, hidden options dropped, unknown keys passed through; the distant layer offered under every
 * preset; the hostile Cerberus choice carrying its extrapolation line.
 */

const FB = { worldState: FINAL_BATTLE_WORLD_STATE };
const canon = getPreset('canon_me3');
const apex = getPreset('prime_apex');
const campaignWs = {
  campaignAllied: JSON.stringify([{ name: 'Survivors', faction: 'alliance', counts: { alliance_dreadnought: 2, alliance_cruiser: 4 } }]),
  campaignReaper: JSON.stringify({ reaper_capital: 2, reaper_destroyer: 3 }),
};

describe('resolveWorldState', () => {
  it('fills every default, resolves auto, keeps unknown keys, and is idempotent', () => {
    const { ws, notes } = resolveWorldState(FB, canon, { fleet_scaling: 'fixed' });
    for (const o of FINAL_BATTLE_WORLD_STATE) {
      expect(ws[o.id], o.id).toBeDefined();
      expect(ws[o.id], o.id).not.toBe(AUTO);
      expect(o.choices.map((c) => c.id), o.id).toContain(ws[o.id]);
    }
    expect(ws.fleet_scaling).toBe('fixed');
    // No campaign saved: the default fleet, with the briefing's note; the opening then defaults on.
    expect(ws.forces).toBe('default');
    expect(notes).toEqual(['No saved campaign: the default combined fleet is used.']);
    expect(ws.cinematic_arrival).toBe('on');
    expect(ws.beat_scale).toBe('1');
    expect(ws.distant_layer).toBe('on');
    const again = resolveWorldState(FB, canon, ws);
    expect(again.ws).toEqual(ws);
    expect(again.notes).toEqual([]);
  });

  it('Cerberus by timeline: hostile under canon, allied under Apex; allied under canon is coerced with a note naming the requirement', () => {
    expect(resolveWorldState(FB, canon, {}).ws.cerberus).toBe('hostile');
    expect(resolveWorldState(FB, apex, {}).ws.cerberus).toBe('allied');
    expect(resolveWorldState(FB, getPreset('cerberus_reformed'), {}).ws.cerberus).toBe('allied');
    const coerced = resolveWorldState(FB, canon, { cerberus: 'allied', forces: 'default' });
    expect(coerced.ws.cerberus).toBe('hostile');
    expect(coerced.notes).toHaveLength(1);
    expect(coerced.notes[0]).toContain('a timeline in which Cerberus cooperates');
    expect(coerced.notes[0]).toContain(canon.name);
    // An explicit hostile or absent group is the player's choice under any preset.
    expect(resolveWorldState(FB, apex, { cerberus: 'hostile' }).ws.cerberus).toBe('hostile');
    expect(resolveWorldState(FB, apex, { cerberus: 'absent' }).ws.cerberus).toBe('absent');
  });

  it('coerces an unknown choice to the default with a note', () => {
    const r = resolveWorldState(FB, canon, { genophage: 'banana', forces: 'default' });
    expect(r.ws.genophage).toBe('cured');
    expect(r.notes).toEqual(['Genophage cure: unknown choice “banana”; resolved to “Cure deployed”.']);
  });

  it('disabled options: pace without the opening, campaign forces without a campaign, Cerberus with campaign forces', () => {
    // The pace knob is ignored without the opening (and says so only when a pace was asked for).
    expect(resolveWorldState(FB, canon, { cinematic_arrival: 'off', beat_scale: '2', forces: 'default' })).toEqual({
      ws: expect.objectContaining({ cinematic_arrival: 'off', beat_scale: '1' }),
      notes: ['Opening pace applies only with the cinematic opening.'],
    });
    expect(resolveWorldState(FB, canon, { cinematic_arrival: 'off', forces: 'default' }).notes).toEqual([]);
    // With a saved campaign the campaign's fleets are used, Cerberus is not modelled and the opening defaults off.
    const camp = resolveWorldState(FB, canon, campaignWs);
    expect(camp.ws.forces).toBe('campaign');
    expect(camp.ws.cerberus).toBe('absent');
    expect(camp.ws.cinematic_arrival).toBe('off');
    expect(camp.notes).toEqual(['The campaign’s fleets decide; Cerberus campaign fleets at Sol are not modelled (absent).']);
    // The player may still switch the opening on with campaign forces.
    expect(resolveWorldState(FB, canon, { ...campaignWs, cinematic_arrival: 'on' }).ws.cinematic_arrival).toBe('on');
    // A malformed campaign record counts as no campaign.
    expect(resolveWorldState(FB, canon, { campaignAllied: '[not json', campaignReaper: '{}' }).ws.forces).toBe('default');
  });

  it('drops the key of an option the rules hide', () => {
    const hidden: WorldStateOption = { id: 'alpha', label: 'Alpha', kind: 'au', description: 'x', choices: [{ id: 'a', label: 'A', description: '' }], default: 'a', showWhen: (r) => r.id !== 'canon_me3' };
    expect(resolveWorldState({ worldState: [hidden] }, canon, { alpha: 'a' }).ws).toEqual({});
    expect(resolveWorldState({ worldState: [hidden] }, apex, {}).ws).toEqual({ alpha: 'a' });
  });

  it('every scenario’s defaults resolve without a note under every preset (the Final Battle notes only the missing campaign)', () => {
    for (const s of SCENARIOS) {
      for (const p of PRESETS) {
        const { notes } = resolveWorldState(s, p, defaultWorldState(s));
        expect(notes, `${s.id} ${p.id}`).toEqual(s.id === 'final_battle_of_earth' ? ['No saved campaign: the default combined fleet is used.'] : []);
      }
    }
  });
});

describe('the distant engagement layer and the hostile Cerberus line (AP §4.1)', () => {
  it('is offered under every preset as an extrapolation, on by default, with the canon line; the Apex scenarios add the AU figure', () => {
    for (const id of ['final_battle_of_earth', 'battle_of_earth']) {
      const opt = getScenario(id).worldState!.find((o) => o.id === 'distant_layer')!;
      expect(opt.kind, id).toBe('extrapolation');
      expect(opt.default, id).toBe('on');
      expect(opt.showWhen, id).toBeUndefined();
      for (const p of PRESETS) {
        const text = describeOption(opt, p);
        expect(text.startsWith(DISTANT_LAYER_CANON_TEXT), `${id} ${p.id}`).toBe(true);
        expect(text.includes(DISTANT_LAYER_APEX_TEXT), `${id} ${p.id}`).toBe(p.id === 'prime_apex' || p.id === 'apex_legacy');
      }
    }
    // The figures follow the preset id, never the Apex flags.
    const lookalike = { ...cloneRules(apex), id: 'my_apex_copy' };
    expect(describeOption(getScenario('final_battle_of_earth').worldState!.find((o) => o.id === 'distant_layer')!, lookalike)).toBe(DISTANT_LAYER_CANON_TEXT);
  });

  it('the hostile Cerberus choice carries its extrapolation description; the allied one is AU', () => {
    const cerb = FINAL_BATTLE_WORLD_STATE.find((o) => o.id === 'cerberus')!;
    expect(cerb.kind).toBe('extrapolation');
    expect(cerb.choices.find((c) => c.id === 'hostile')!.description).toContain(CERBERUS_HOSTILE_TEXT);
    expect(CERBERUS_HOSTILE_TEXT).toBe('Extrapolation: Cerberus forces were not at the Battle of Earth in ME3');
    expect(cerb.choices.find((c) => c.id === 'allied')!.au).toBe(true);
  });

  it('the Battle of Earth carries the layer when on (canon percentages) and none when off', () => {
    const on = buildScenario('battle_of_earth', 'canon_me3', 42);
    expect(on.distant?.enabled).toBe(true);
    expect(on.distant?.captions).toBe('canon');
    expect(buildScenario('battle_of_earth', 'canon_me3', 42, { distant_layer: 'off' }).distant).toBeUndefined();
    expect(buildScenario('battle_of_earth', 'prime_apex', 42).distant?.captions).toBe('apex');
  });

  it('buildScenario attaches the coercion notes to the config', () => {
    const cfg = buildScenario('final_battle_of_earth', 'canon_me3', 1, { cerberus: 'allied' });
    expect(cfg.notes).toEqual(expect.arrayContaining(['No saved campaign: the default combined fleet is used.']));
    expect(cfg.notes!.some((n) => n.includes('a timeline in which Cerberus cooperates'))).toBe(true);
    expect(cfg.worldState?.cerberus).toBe('hostile');
  });
});
