import { expect, test, type Page } from '@playwright/test';

/**
 * Playback and Fast-forward to result in the browser (brief §19.1, §19.3): a battle launched with seed 42 through
 * the briefing, run at 8× for a few seconds, then fast-forwarded to its result computes exactly the battle a fresh
 * simulation of the same configuration computes from scratch (result, duration, event log); a cancelled fast-forward
 * resumes normal playback at 1× from the time reached. Software WebGL in CI draws slowly, which is why the fast-forward,
 * which draws nothing, finishes a battle in seconds here while normal playback would take minutes.
 */

type ReaperwarWindow = Window & {
  reaperwar: {
    battle?: {
      sim: { time: number; tick: number; finished: boolean; events: unknown[]; result?: unknown };
      clock: { mode: string; speed: number; speedIndex: number; paused: boolean; achieved: number; fallingShort: boolean; simulated: number; shedTotal: number };
      fastForward?: { ticks: number };
      stats: { frames: number; mean: Record<string, number> };
      hud: { perf: { visible: boolean } };
    };
    lastBattle?: { sim: { time: number; events: unknown[]; result: unknown; constructor: new (config: unknown) => { time: number; finished: boolean; events: unknown[]; result?: unknown; step(): void } }; config: unknown; result: unknown };
  };
};

const collectErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};

/** Launch the Battle of Earth (canon) from the briefing with the given seed. */
async function launchSeeded(page: Page, seed: number): Promise<void> {
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await expect(page.locator('.screen-body h2')).toHaveText('Battle of Earth');
  await page.locator('label.field', { hasText: 'Timeline' }).locator('select').selectOption('canon_me3');
  const seedInput = page.locator('label.field', { hasText: 'Random seed' }).locator('input');
  await seedInput.fill(String(seed));
  await seedInput.dispatchEvent('change');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  const launched = await page.evaluate(() => {
    const b = (window as unknown as ReaperwarWindow).reaperwar.battle!;
    return { seed: (b.sim as unknown as { config: { seed: number; rules: { id: string } } }).config.seed, rules: (b.sim as unknown as { config: { seed: number; rules: { id: string } } }).config.rules.id };
  });
  expect(launched).toEqual({ seed, rules: 'canon_me3' });
}

const simTime = (page: Page) => page.evaluate(() => (window as unknown as ReaperwarWindow).reaperwar.battle!.sim.time);

test.describe('Playback and Fast-forward to result (seed 42)', () => {
  test('8× for a few seconds, then Fast-forward to result: the progress overlay updates, the results appear, and a reference run matches bit for bit', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await launchSeeded(page, 42);

    // 8× for a few seconds of real time: the clock runs ticks within its budget and the HUD stays honest about the
    // speed achieved (software WebGL here cannot sustain 8×, so the readout may show the achieved speed).
    await page.click('[data-speed="8"]');
    await expect(page.locator('[data-speed="8"]')).toHaveClass(/active/);
    const t0 = await simTime(page);
    await page.waitForTimeout(3000);
    await expect.poll(() => simTime(page), { timeout: 30_000 }).toBeGreaterThan(t0 + 0.5);
    const readout = await page.locator('[data-speed-readout]').innerText();
    expect(readout).toMatch(/8× SPEED|8× · ACHIEVED \d+\.\d×/);
    const clockState = await page.evaluate(() => {
      const c = (window as unknown as ReaperwarWindow).reaperwar.battle!.clock;
      return { speed: c.speed, mode: c.mode, simulated: c.simulated };
    });
    expect(clockState.speed).toBe(8);
    expect(clockState.mode).toBe('normal');
    expect(clockState.simulated).toBeGreaterThan(0);

    // Fast-forward to result from the HUD button: progress overlay with live figures, then the results screen.
    const tStart = await simTime(page);
    await page.click('[data-action="fast-forward"]');
    const progress = page.locator('[data-ff-progress]');
    await expect(progress).toBeVisible();
    await expect(progress.locator('[data-ff-time]')).toHaveText(/\d\d:\d\d/);
    await expect(progress.locator('[data-ff-hulls]')).toContainText('ALLIED');
    await expect.poll(() => progress.getAttribute('data-updates').then((v) => Number(v ?? 0)), { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
    expect(await page.locator('[data-speed-readout]').innerText()).toContain('FAST-FORWARD');
    await expect(page.locator('.result-banner')).toBeVisible({ timeout: 180_000 });
    await expect(page.locator('.result-banner')).toHaveText(/VICTORY|DEFEAT|DRAW/);
    await expect(page.locator('[data-action="replay"]')).toBeVisible();

    // The battle the player watched, in part at 8× and in part fast-forwarded, is the battle a fresh simulation of the
    // same configuration computes from scratch: same result, same duration, same event log (hashed in full).
    const check = await page.evaluate((startedFrom) => {
      const w = window as unknown as ReaperwarWindow;
      const lb = w.reaperwar.lastBattle!;
      const hash = (s: string): string => {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619) >>> 0;
        }
        return h.toString(16).padStart(8, '0');
      };
      const Sim = lb.sim.constructor;
      const ref = new Sim(lb.config);
      while (!ref.finished) ref.step();
      return {
        played: { time: lb.sim.time, events: lb.sim.events.length, hash: hash(JSON.stringify(lb.sim.events)), result: JSON.stringify(lb.result) },
        reference: { time: ref.time, events: ref.events.length, hash: hash(JSON.stringify(ref.events)), result: JSON.stringify(ref.result) },
        fastForwardedFrom: startedFrom,
      };
    }, tStart);
    expect(check.played.events).toBeGreaterThan(1000);
    expect(check.played.time).toBeGreaterThan(check.fastForwardedFrom);
    expect(check.played).toEqual(check.reference);
    expect(errors).toEqual([]);
  });

  test('cancelling a fast-forward resumes playback at 1× from the time reached', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await launchSeeded(page, 42);
    await page.click('[data-speed="4"]');
    await expect(page.locator('[data-speed="4"]')).toHaveClass(/active/);

    // Start from the keyboard (End), cancel from the overlay's button as soon as it has shown progress.
    await page.keyboard.press('End');
    const progress = page.locator('[data-ff-progress]');
    await expect(progress).toBeVisible();
    await expect.poll(() => progress.getAttribute('data-updates').then((v) => Number(v ?? 0)), { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    const state = await page.evaluate(() => {
      const b = (window as unknown as ReaperwarWindow).reaperwar.battle!;
      return { mode: b.clock.mode, running: !!b.fastForward, finished: b.sim.finished };
    });
    expect(state).toEqual({ mode: 'result', running: true, finished: false });
    const started = await simTime(page);
    // The fast-forward keeps running while the click is being delivered (software WebGL paces the browser slowly), so
    // the time reached is read the moment the overlay has gone, and the toast names it.
    await page.click('[data-action="cancel-fast-forward"]');
    await expect(progress).toBeHidden();
    const stopped = await page.evaluate(() => {
      const b = (window as unknown as ReaperwarWindow).reaperwar.battle!;
      return { mode: b.clock.mode, speed: b.clock.speed, paused: b.clock.paused, running: !!b.fastForward, finished: b.sim.finished, time: b.sim.time };
    });
    expect(stopped).toMatchObject({ mode: 'normal', speed: 1, paused: false, running: false, finished: false });
    expect(stopped.time).toBeGreaterThan(started);
    await expect(page.locator('.toast')).toContainText('FAST-FORWARD CANCELLED · 1×');

    // Back to normal playback at 1×, from where the fast-forward stopped: the clock runs again, at no more than 1× of
    // real time, and the HUD says 1×.
    await expect(page.locator('[data-speed="1"]')).toHaveClass(/active/);
    await expect(page.locator('[data-speed-readout]')).toContainText('1× SPEED');
    const wall0 = Date.now();
    await expect.poll(() => simTime(page), { timeout: 60_000 }).toBeGreaterThan(stopped.time + 0.2);
    const advanced = (await simTime(page)) - stopped.time;
    const wall = (Date.now() - wall0) / 1000;
    expect(advanced).toBeLessThanOrEqual(wall * 1.25 + 0.5);

    // The performance HUD (F3) toggles on and shows the clock's figures.
    await page.keyboard.press('F3');
    await expect(page.locator('[data-perf-hud]')).toBeVisible();
    await expect(page.locator('[data-perf-hud]')).toContainText('ticks/frame');
    await page.keyboard.press('F3');
    await expect(page.locator('[data-perf-hud]')).toBeHidden();
    expect(errors).toEqual([]);
  });
});
