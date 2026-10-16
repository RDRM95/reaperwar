import { expect, test, type Page } from '@playwright/test';

/** Advance the simulation instantly (software GL in CI renders slowly). */
const advance = (page: Page, seconds: number) =>
  page.evaluate((secs) => {
    const w = window as unknown as { reaperwar: { battle: { sim: { time: number; finished: boolean; step(): void } } } };
    const b = w.reaperwar.battle;
    const target = b.sim.time + secs;
    while (!b.sim.finished && b.sim.time < target) b.sim.step();
  }, seconds);

test.describe('Reaper War Simulator', () => {
  test('page starts, menu renders, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/');
    await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
    await expect(page.locator('.menu-title')).toContainText('MASS EFFECT 3');
    expect(errors).toEqual([]);
  });

  test('a complete Battle of Earth can be launched, controlled and finished', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.click('[data-menu="quick-battle"]');
    await expect(page.locator('[data-action="launch"]')).toBeVisible();
    await page.click('[data-action="launch"]');
    await expect(page.locator('[data-action="pause"]')).toBeVisible();

    // Renderer started: WebGL canvas has a context and ships exist.
    const shipCount = await page.evaluate(() => (window as unknown as { reaperwar: { battle: { sim: { ships: unknown[] } } } }).reaperwar.battle.sim.ships.length);
    expect(shipCount).toBeGreaterThan(20);
    const hasGl = await page.evaluate(() => {
      const c = document.getElementById('battle-canvas') as HTMLCanvasElement;
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    });
    expect(hasGl).toBe(true);

    // Controls: pause, speed, cameras, orders.
    await page.click('[data-action="pause"]');
    await expect(page.locator('[data-action="pause"]')).toHaveClass(/active/);
    await page.click('[data-speed="4"]');
    await expect(page.locator('[data-speed="4"]')).toHaveClass(/active/);
    for (const cam of ['cinematic', 'follow', 'free', 'projectile', 'reaper', 'command', 'tactical']) {
      await page.click(`[data-camera="${cam}"]`);
      await expect(page.locator(`[data-camera="${cam}"]`)).toHaveClass(/active/);
    }
    await page.click('[data-order="advance"]');
    await expect(page.locator('[data-order="advance"]')).toHaveClass(/active/);
    await page.selectOption('select >> nth=0', 'strike_wedge');

    // Select a ship from the list, then order the fleet to attack a Reaper destroyer.
    await page.locator('.ship-list .ship-row').first().click();
    await expect(page.locator('.target-panel')).toContainText('SSV');
    const destroyerRow = page.locator('.ship-row', { hasText: 'Reaper destroyer' }).first();
    await destroyerRow.click({ button: 'right' });
    await expect(page.locator('.toast')).toContainText('ATTACK');

    // Battle proceeds and finishes.
    await advance(page, 40);
    const fired = await page.evaluate(() => (window as unknown as { reaperwar: { battle: { sim: { events: { type: string }[] } } } }).reaperwar.battle.sim.events.filter((e) => e.type === 'weapon_fired').length);
    expect(fired).toBeGreaterThan(10);
    await advance(page, 900);
    await expect(page.locator('[data-action="results"]')).toBeVisible({ timeout: 30_000 });
    await page.click('[data-action="results"]');
    await expect(page.locator('.result-banner')).toBeVisible();
    await expect(page.locator('.result-banner')).toHaveText(/VICTORY|DEFEAT|DRAW/);
    await expect(page.locator('[data-action="replay"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('replay reproduces the same battle', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-menu="quick-battle"]');
    await page.fill('input[type="number"]', '1234');
    await page.click('[data-action="launch"]');
    await expect(page.locator('[data-action="pause"]')).toBeVisible();
    await advance(page, 900);
    await page.click('[data-action="results"]');
    const first = await page.locator('.result-banner').innerText();
    const firstDuration = await page.locator('.screen-body p.dim').first().innerText();
    await page.click('[data-action="replay"]');
    await expect(page.locator('[data-action="pause"]')).toBeVisible();
    await advance(page, 900);
    await page.click('[data-action="results"]');
    await expect(page.locator('.result-banner')).toHaveText(first);
    await expect(page.locator('.screen-body p.dim').first()).toHaveText(firstDuration);
  });

  test('canon vs AU comparison runs and shows diverging outcomes', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-menu="canon-vs-au-comparison"]');
    await page.click('[data-action="run-comparison"]');
    await expect(page.locator('[data-action="watch-b"]')).toBeVisible({ timeout: 60_000 });
    const table = await page.locator('.compare-table').innerText();
    expect(table).toContain('DEFEAT');
    expect(table).toContain('VICTORY');
    await expect(page.locator('text=Hyper-mass accelerators').first()).toBeVisible();
  });

  test('codex, database, timelines and custom battle screens render', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-menu="codex"]');
    await expect(page.locator('.codex-body')).toContainText('established canon');
    await page.click('text=Main menu');
    await page.click('[data-menu="fleet-database"]');
    await expect(page.locator('.codex-body')).toContainText('Armament');
    await page.click('text=Main menu');
    await page.click('[data-menu="alternate-timelines"]');
    await page.click('[data-timeline="prime_apex"]');
    await expect(page.locator('.screen-body')).toContainText('Homeworld Defence Rule');
    await page.click('[data-action="select-timeline"]');
    await page.click('text=Main menu');
    await expect(page.locator('.menu-info')).toContainText('Prime/Apex');
    await page.click('[data-menu="custom-battle"]');
    await expect(page.locator('[data-action="launch-custom"]')).toBeVisible();
    await page.fill('[data-count="sideB:reaper_capital"]', '0');
    await page.fill('[data-count="sideB:reaper_destroyer"]', '2');
    await page.click('[data-action="launch-custom"]');
    await expect(page.locator('[data-action="pause"]')).toBeVisible();
  });
});
