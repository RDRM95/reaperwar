import { describe, expect, it } from 'vitest';
import { APEX_REAPER_COMBAT_AT_SOL, APEX_SCALE, AU_SCENARIO_SUFFIX, apexCaption, formatCount } from '@/data/apexScale';

/** The scale table re-added row by row and column by column (ADOPTION_PLAN.md §13.2). */
describe('Apex scale figures', () => {
  it('rows sum to 38,420 mobile warships and every row adds up', () => {
    const rows = APEX_SCALE.coalition.byCommand;
    expect(rows.reduce((a, r) => a + r.warships, 0)).toBe(APEX_SCALE.coalition.mobileWarships);
    expect(APEX_SCALE.coalition.mobileWarships).toBe(38420);
    for (const r of rows) expect(r.counts.reduce<number>((a, b) => a + b, 0), r.id).toBe(r.warships);
    expect(rows.find((r) => r.id === 'alliance')?.warships).toBe(APEX_SCALE.coalition.alliance.committedToSol);
    expect(rows.find((r) => r.id === 'cerberus')?.warships).toBe(420);
  });

  it('class columns sum to the class totals', () => {
    const rows = APEX_SCALE.coalition.byCommand;
    APEX_SCALE.coalition.classTotals.forEach((total, col) => {
      expect(rows.reduce((a, r) => a + r.counts[col], 0), APEX_SCALE.coalition.classColumns[col]).toBe(total);
    });
    expect(APEX_SCALE.coalition.classTotals.reduce<number>((a, b) => a + b, 0)).toBe(APEX_SCALE.coalition.mobileWarships);
    expect(APEX_SCALE.coalition.heavyMobileCombatants).toBe(APEX_SCALE.coalition.classTotals[0] + APEX_SCALE.coalition.classTotals[2]);
    expect(APEX_SCALE.coalition.embarkedCraftNominal).toBe(APEX_SCALE.coalition.classTotals[1] * 48);
    expect(APEX_SCALE.coalition.alliance.warships + APEX_SCALE.coalition.alliance.support).toBe(APEX_SCALE.coalition.alliance.allHulls);
    expect(APEX_SCALE.coalition.alliance.committedToSol + APEX_SCALE.coalition.alliance.elsewhere).toBe(APEX_SCALE.coalition.alliance.warships);
  });

  it('Reaper initial − Alpha − regional losses − elsewhere = the Sol commitment', () => {
    const r = APEX_SCALE.reaper;
    const sum = (o: { capital: number; destroyer: number; transport: number; processor: number }) => o.capital + o.destroyer + o.transport + o.processor;
    expect(sum(r.initial)).toBe(53000);
    expect(sum(r.postAlpha)).toBe(39750);
    for (const k of ['capital', 'destroyer', 'transport', 'processor'] as const) {
      expect(r.postAlpha[k], k).toBe(r.initial[k] * (1 - r.alphaLossFraction));
      expect(r.postAlpha[k] - r.regionalLossesBeforeSol[k] - r.activeElsewhere[k], k).toBe(r.committedToSol[k]);
    }
    expect(APEX_REAPER_COMBAT_AT_SOL).toBe(12480);
    expect(APEX_SCALE.provenance).toBe('AU_MODIFIED');
  });

  it('captions carry the figures and always end in the AU suffix', () => {
    for (const kind of ['warships', 'platforms', 'reapers'] as const) {
      const c = apexCaption(kind, 400);
      expect(c.endsWith(AU_SCENARIO_SUFFIX), c).toBe(true);
      expect(c.endsWith('· AU SCENARIO VALUE')).toBe(true);
      expect(c).toContain('400');
    }
    expect(apexCaption('warships', 400)).toBe('38,420 WARSHIPS COMMITTED TO SOL · 400 SIMULATED, REST STATISTICAL · AU SCENARIO VALUE');
    expect(apexCaption('platforms', 4)).toBe('612 DEFENCE PLATFORMS — SOL NETWORK · 4 SIMULATED · AU SCENARIO VALUE');
    expect(apexCaption('reapers', 36)).toContain('12,480 REAPER COMBAT UNITS');
    expect(formatCount(38420)).toBe('38,420');
    expect(formatCount(612)).toBe('612');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});
