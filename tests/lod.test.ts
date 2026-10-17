import { describe, expect, it } from 'vitest';
import { FIGHTER_POINT_DISTANCE, FIGHTER_REDUCED_DISTANCE, lodLevel, POINT_FACTOR, REDUCED_FACTOR } from '@/rendering/lod';

describe('level of detail policy', () => {
  it('keeps full detail close, drops detail at range and collapses to points far away', () => {
    expect(lodLevel(10, 5.2, 'cruiser')).toBe('full');
    expect(lodLevel(5.2 * REDUCED_FACTOR + 1, 5.2, 'cruiser')).toBe('reduced');
    expect(lodLevel(5.2 * POINT_FACTOR + 1, 5.2, 'cruiser')).toBe('point');
  });
  it('scales thresholds with ship length so dreadnoughts stay meshes longer than frigates', () => {
    const d = 1.7 * POINT_FACTOR + 1;
    expect(lodLevel(d, 1.7, 'frigate')).toBe('point');
    expect(lodLevel(d, 20, 'reaper_capital')).not.toBe('point');
  });
  it('switches fighters to points early', () => {
    expect(lodLevel(FIGHTER_REDUCED_DISTANCE - 1, 0.36, 'fighter')).toBe('full');
    expect(lodLevel(FIGHTER_REDUCED_DISTANCE + 1, 0.36, 'fighter')).toBe('reduced');
    expect(lodLevel(FIGHTER_POINT_DISTANCE + 1, 0.36, 'fighter')).toBe('point');
  });
  it('can be disabled', () => {
    expect(lodLevel(1e6, 0.36, 'fighter', false)).toBe('full');
  });
});
