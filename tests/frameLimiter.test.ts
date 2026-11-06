import { describe, expect, it } from 'vitest';
import { FRAME_CAP_OPTIONS, schedulePresentation } from '@/core/frameLimiter';

describe('presentation frame limiter', () => {
  it('includes 144 FPS and an unlimited option', () => {
    expect(FRAME_CAP_OPTIONS).toContain(144);
    expect(FRAME_CAP_OPTIONS).toContain(0);
  });

  it('does not skip frames when the cap is unlimited', () => {
    expect(schedulePresentation(1001, 1008, 0)).toEqual({ present: true, nextAtMs: 1001 });
  });

  it('does not present faster than its configured interval', () => {
    const first = schedulePresentation(1000, 0, 144);
    expect(first.present).toBe(true);
    const tooSoon = schedulePresentation(1003, first.nextAtMs, 144);
    expect(tooSoon).toEqual({ present: false, nextAtMs: first.nextAtMs });
    const next = schedulePresentation(1007, first.nextAtMs, 144);
    expect(next.present).toBe(true);
  });

  it('maintains pacing on a faster display without an every-other-frame lock', () => {
    let nextAtMs = 0;
    let drawn = 0;
    for (let time = 1000; time < 2000; time += 1000 / 240) {
      const result = schedulePresentation(time, nextAtMs, 144);
      nextAtMs = result.nextAtMs;
      if (result.present) drawn++;
    }
    expect(drawn).toBeGreaterThan(120);
    expect(drawn).toBeLessThanOrEqual(145);
  });

  it('recovers from long frame stalls without a burst of rapid frames', () => {
    const first = schedulePresentation(1000, 0, 144);
    const stalled = schedulePresentation(1300, first.nextAtMs, 144);
    expect(stalled.present).toBe(true);
    expect(stalled.nextAtMs).toBeGreaterThan(1306);
    expect(schedulePresentation(1301, stalled.nextAtMs, 144).present).toBe(false);
  });
});
