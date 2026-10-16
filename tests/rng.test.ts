import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { interceptPoint, v3 } from '@/core/vec3';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });
  it('differs for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });
  it('produces values in [0,1) with a roughly uniform mean', () => {
    const r = new Rng('uniform');
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 20000).toBeGreaterThan(0.48);
    expect(sum / 20000).toBeLessThan(0.52);
  });
});

describe('interceptPoint', () => {
  it('leads a moving target', () => {
    const shooter = v3(0, 0, 0);
    const target = v3(0, 0, 10);
    const vel = v3(1, 0, 0);
    const p = interceptPoint(shooter, target, vel, 5);
    // Projectile at 5 km/s reaches ~10 km in ~2 s; target moved ~2 km in x.
    expect(p.x).toBeGreaterThan(1.5);
    expect(p.x).toBeLessThan(2.5);
    expect(p.z).toBeCloseTo(10, 5);
  });
  it('falls back to the target position when no solution exists', () => {
    const p = interceptPoint(v3(), v3(0, 0, 10), v3(50, 0, 0), 1);
    expect(p).toEqual(v3(0, 0, 10));
  });
});
