import { describe, expect, it } from 'vitest';
import { INDIVIDUAL_LABEL_THRESHOLD, largeBattleHulls, useFleetSummary } from '@/ui/scalePolicy';

/** The Settings choice feeding the owner's scale policy (tests/fleetScale.test.ts covers the policy's own default). */
describe('large-battle threshold from Settings (brief §12)', () => {
  it('is the Settings choice, else the policy default, and never junk', () => {
    expect(largeBattleHulls({})).toBe(INDIVIDUAL_LABEL_THRESHOLD);
    expect(largeBattleHulls({ largeBattleHulls: 48 })).toBe(48);
    expect(largeBattleHulls({ largeBattleHulls: 128 })).toBe(128);
    expect(largeBattleHulls({ largeBattleHulls: 0 })).toBe(0);
    expect(largeBattleHulls({ largeBattleHulls: -5 })).toBe(INDIVIDUAL_LABEL_THRESHOLD);
    expect(largeBattleHulls({ largeBattleHulls: Number.NaN })).toBe(INDIVIDUAL_LABEL_THRESHOLD);
    expect(largeBattleHulls({ largeBattleHulls: '96' as unknown as number })).toBe(INDIVIDUAL_LABEL_THRESHOLD);
  });

  it('summarises by fleet above the chosen threshold and never when it is 0', () => {
    expect(useFleetSummary(49, 48)).toBe(true);
    expect(useFleetSummary(48, 48)).toBe(false);
    expect(useFleetSummary(129, 128)).toBe(true);
    expect(useFleetSummary(128, 128)).toBe(false);
    expect(useFleetSummary(5000, 0)).toBe(false);
    expect(useFleetSummary(INDIVIDUAL_LABEL_THRESHOLD + 1)).toBe(useFleetSummary(INDIVIDUAL_LABEL_THRESHOLD + 1, largeBattleHulls({})));
  });
});
