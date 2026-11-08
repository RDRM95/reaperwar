import { describe, expect, it } from 'vitest';
import { INDIVIDUAL_LABEL_THRESHOLD, useFleetSummary } from '@/ui/scalePolicy';
import { detailedHullBudget, farPointCapacity } from '@/rendering/lod';

describe('fleet-scale display policy', () => {
  it('keeps individual labels for small engagements and switches to fleet names above the threshold', () => {
    expect(useFleetSummary(0)).toBe(false);
    expect(useFleetSummary(INDIVIDUAL_LABEL_THRESHOLD)).toBe(false);
    expect(useFleetSummary(INDIVIDUAL_LABEL_THRESHOLD + 1)).toBe(true);
    expect(useFleetSummary(5000)).toBe(true);
  });

  it('bounds expensive detailed hulls without limiting the number of simulated ships', () => {
    expect(detailedHullBudget(200)).toBe(Infinity);
    expect(detailedHullBudget(500)).toBe(600);
    expect(detailedHullBudget(1500)).toBe(360);
    expect(detailedHullBudget(5000)).toBe(240);
    expect(detailedHullBudget(15000)).toBe(240);
  });

  it('grows the one-draw-call far-ship buffer past the previous 2048 limit', () => {
    expect(farPointCapacity(2048, 2000)).toBe(2048);
    expect(farPointCapacity(2048, 2049)).toBe(4096);
    expect(farPointCapacity(2048, 10000)).toBe(16384);
  });
});
