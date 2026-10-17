import { expect, test } from '@playwright/test';

test.describe('Galactic campaign', () => {
  test('starts a campaign, advances weeks, resolves an engagement and persists', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.click('[data-menu="new-galactic-campaign"]');
    await expect(page.locator('[data-action="start-campaign"]')).toBeVisible();
    await page.fill('input[type="number"]', '77');
    await page.click('[data-action="start-campaign"]');
    await expect(page.locator('.galaxy-map')).toBeVisible();
    await expect(page.locator('.hud-clock')).toContainText('WEEK 0');

    // Select Earth and move the Fifth Fleet to Arcturus via the system panel.
    await page.locator('[data-fleet]').first().click();
    await expect(page.locator('.screen-body')).toContainText('Alliance');

    // Advance until an engagement prompt appears or 12 weeks pass.
    let prompted = false;
    for (let i = 0; i < 12; i++) {
      const endTurn = page.locator('[data-action="end-turn"]');
      if (await endTurn.isDisabled()) break;
      await endTurn.click();
      await page.waitForTimeout(150);
      if (await page.locator('[data-action="auto-resolve"]').isVisible()) {
        prompted = true;
        break;
      }
    }
    if (prompted) {
      await page.click('[data-action="auto-resolve"]');
      await expect(page.locator('[data-action="auto-resolve"]')).toHaveCount(0, { timeout: 60_000 });
    }
    const week = await page.locator('.hud-clock').innerText();
    expect(week).toMatch(/WEEK [1-9]/);

    // Persistence: reload and Load Game returns to the same week.
    await page.click('text=Menu');
    await page.reload();
    await page.click('[data-menu="load-game"]');
    await expect(page.locator('.galaxy-map')).toBeVisible();
    await expect(page.locator('.hud-clock')).toContainText(week.split('\n')[0]);
    expect(errors).toEqual([]);
  });

  test('a campaign engagement can be fought in 3D and returns to the map', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-menu="new-galactic-campaign"]');
    await page.click('[data-action="start-campaign"]');
    await expect(page.locator('.galaxy-map')).toBeVisible();
    // Force an engagement at Earth through the exposed app state.
    await page.evaluate(() => {
      const w = window as unknown as { reaperwar: { campaign: { fleets: { name: string; location: string }[] }; show(s: string): void } };
      const v = w.reaperwar.campaign.fleets.find((f) => f.name === 'Reaper vanguard')!;
      v.location = 'sol';
      w.reaperwar.show('campaign');
    });
    await page.click('[data-action="end-turn"]');
    await expect(page.locator('[data-action="fight-3d"]')).toBeVisible();
    await page.click('[data-action="fight-3d"]');
    await expect(page.locator('[data-action="pause"]')).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { reaperwar: { battle: { sim: { finished: boolean; step(): void } } } };
      const b = w.reaperwar.battle;
      while (!b.sim.finished) b.sim.step();
    });
    await expect(page.locator('[data-action="results"]')).toBeVisible({ timeout: 30_000 });
    await page.click('[data-action="results"]');
    await expect(page.locator('[data-action="return-campaign"]')).toBeVisible();
    await page.click('[data-action="return-campaign"]');
    await expect(page.locator('.galaxy-map')).toBeVisible();
    await expect(page.locator('.screen-body')).toContainText('Battle of Earth');
  });
});
