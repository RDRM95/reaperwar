import { describe, expect, it } from 'vitest';
import { driftOffset, steppedDrift } from '@/ui/motion';

// The menu's grid drift is stepped from script instead of running as a continuous CSS animation: with
// the browser's frame cap lifted (the Play launchers, the Local Edition) a CSS animation keeps the browser
// producing frames back to back on the menu. The smoke test of the launcher package fails on any endless
// CSS animation on the menu; this covers the stepping maths.
describe('stepped menu drift', () => {
  const spec = { dx: 96, dy: 48, periodMs: 34_000 };

  it('moves in proportion to the elapsed time and wraps once per cycle', () => {
    expect(driftOffset(0, spec)).toEqual({ x: 0, y: 0 });
    expect(driftOffset(17_000, spec)).toEqual({ x: 48, y: 24 });
    expect(driftOffset(34_000, spec)).toEqual({ x: 0, y: 0 });
    expect(driftOffset(34_000 + 8_500, spec).x).toBeCloseTo(24, 6);
    expect(driftOffset(-8_500, spec).x).toBeCloseTo(72, 6);
  });

  it('is a fraction of a pixel per step at the default rate, so the motion reads as continuous', () => {
    const stepMs = 1000 / 12;
    const a = driftOffset(10_000, spec);
    const b = driftOffset(10_000 + stepMs, spec);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.3);
  });

  it('never moves without a cycle length', () => {
    expect(driftOffset(5_000, { dx: 96, dy: 48, periodMs: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('does nothing outside a browser window', () => {
    const stop = steppedDrift({ isConnected: true, style: { setProperty: () => undefined } } as unknown as HTMLElement, spec);
    expect(typeof stop).toBe('function');
    stop();
  });
});
