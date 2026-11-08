import { describe, expect, it } from 'vitest';
import { UI_SCALE_LEVELS, normaliseUiScale } from '@/ui/tvDisplay';

describe('4K television interface scaling', () => {
  it('exposes sensible readability sizes without scaling the renderer', () => {
    expect(UI_SCALE_LEVELS).toEqual([0.85, 1, 1.15, 1.3, 1.5, 1.75]);
  });
  it('automatically enlarges a native 4K desktop but not a typical 1080p viewport', () => {
    expect(normaliseUiScale(undefined, 3840)).toBe(1.3);
    expect(normaliseUiScale(undefined, 2560)).toBe(1.3);
    expect(normaliseUiScale(undefined, 1920)).toBe(1);
  });
  it('keeps explicit saved preferences across screen size changes', () => {
    expect(normaliseUiScale(1, 3840)).toBe(1);
    expect(normaliseUiScale(1.5, 1920)).toBe(1.5);
    expect(normaliseUiScale(0.85, 3840)).toBe(0.85);
  });
  it('rejects corrupt persisted values', () => {
    expect(normaliseUiScale(Number.NaN, 1920)).toBe(1);
    expect(normaliseUiScale(4, 3840)).toBe(1.3);
    expect(normaliseUiScale('1.75', 1920)).toBe(1);
  });
});
