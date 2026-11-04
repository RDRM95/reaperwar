import { expect, test, type Page } from '@playwright/test';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { needsBuild } from '../scripts/local/launch.mjs';

/**
 * Local Edition end to end: the production build served by
 * scripts/local/serve.mjs (not vite preview) on a free port, opened the way
 * the launcher opens it (/?local=1).
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

let server: ChildProcess | undefined;
let origin = '';

const simTime = (page: Page) => page.evaluate(() => (window as unknown as { reaperwar: { battle: { sim: { time: number } } } }).reaperwar.battle.sim.time);

test.describe('Local Edition', () => {
  test.beforeAll(async () => {
    test.setTimeout(170_000);
    // The Playwright web server has normally just built dist/; build here only when it is missing or stale.
    if (needsBuild(ROOT).build) execSync('npm run build', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_BASE: '/' } });
    const child = spawn(process.execPath, ['scripts/local/serve.mjs', '--port', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    server = child;
    origin = await new Promise<string>((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`serve.mjs did not report its address: ${out}`)), 15_000);
      child.stdout!.on('data', (d: Buffer) => {
        out += d.toString();
        const m = /Local Edition server: (http:\/\/127\.0\.0\.1:\d+)\//.exec(out);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      child.on('exit', (code) => reject(new Error(`serve.mjs exited (${code}): ${out}`)));
    });
  });

  test.afterAll(() => {
    server?.kill();
  });

  test('is cross-origin isolated, says Local Edition, starts at Ultra and runs a Quick Battle', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    const response = await page.goto(`${origin}/?local=1`);
    expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
    expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
    await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
    expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');
    await expect(page.locator('.menu-foot')).toContainText('Local Edition');

    // First run in the Local Edition: Ultra is selected and the GPU line shows.
    await page.click('[data-menu="settings"]');
    await expect(page.locator('select[data-setting="quality"]')).toHaveValue('ultra');
    await expect(page.locator('select[data-setting="quality"] option:checked')).toHaveText('Ultra — local GPU');
    await expect(page.locator('.local-edition')).toContainText("Local Edition: running on this machine's GPU");
    await page.click('text=Main menu');

    // A Quick Battle renders at Ultra and keeps running.
    await page.click('[data-menu="quick-battle"]');
    await page.click('[data-action="launch"]');
    await expect(page.locator('[data-action="pause"]')).toBeVisible();
    const view = await page.evaluate(() => {
      const v = (window as unknown as { reaperwar: { battle: { view: { settings: { quality: string }; preset: { lodDistanceScale: number }; effects: { budgets: { sparks: number } }; renderer: { getPixelRatio(): number } } } } }).reaperwar.battle.view;
      return { quality: v.settings.quality, lodScale: v.preset.lodDistanceScale, sparks: v.effects.budgets.sparks, pixelRatio: v.renderer.getPixelRatio(), dpr: window.devicePixelRatio };
    });
    expect(view).toMatchObject({ quality: 'ultra', lodScale: 2.5, sparks: 1800 });
    expect(view.pixelRatio).toBe(Math.min(view.dpr, 3));
    const t0 = await simTime(page);
    await page.waitForTimeout(4000);
    expect(await simTime(page)).toBeGreaterThan(t0);
    await expect(page.locator('.hud-clock')).toContainText(/\d+ FPS/);
    expect(errors).toEqual([]);
  });
});
