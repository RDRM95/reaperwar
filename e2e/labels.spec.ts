import { expect, test, type Page } from '@playwright/test';

/**
 * Brief §12 (stage L2): overlap-free tactical labels, folded into battlegroup and fleet labels when crowded; the
 * large-battle HUD's fleet rows; the tactical overlay's own toggle (O, and the pause menu) independent of the HUD.
 */

interface Placed {
  id: string;
  kind: 'ship' | 'group' | 'fleet';
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  members: string[];
}
interface Bar {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Battle {
  paused: boolean;
  hudLevel: string;
  config: { perspectiveSide: string };
  togglePause(): void;
  setCamera(mode: string): void;
  sim: { time: number; finished: boolean; step(): void; ships: { id: string; fleetId: string; side: string; flagship?: boolean; alive: boolean; escaped: boolean; role: string }[] };
  view: { selectedIds: Set<string>; followId?: string };
  overlay: { visible: boolean; lastLabels: Placed[]; lastBars: Bar[]; lastHidden: string[]; lastMarkers: { brackets: number; dots: number } };
}
const battle = (): Battle => (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle;

/** Final Battle of Earth (canon, seed 42), paused and advanced to `t` seconds. */
async function finalBattle(page: Page, t: number): Promise<void> {
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.locator('.screen-body .col button', { hasText: 'Final Battle of Earth' }).click();
  await expect(page.locator('.screen-body h2')).toHaveText('Final Battle of Earth');
  await page.fill('input[type="number"]', '42');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  await page.evaluate((secs) => {
    const b = (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle;
    if (!b.paused) b.togglePause();
    while (!b.sim.finished && b.sim.time < secs) b.sim.step();
  }, t);
}

const labels = (page: Page): Promise<Placed[]> =>
  page.evaluate(() => (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle.overlay.lastLabels.map((l) => ({ id: l.id, kind: l.kind, text: l.text, x: l.x, y: l.y, w: l.w, h: l.h, members: [...l.members] })));

/** The labels, bars, left-out markers and marker counts of one overlay frame. */
const frame = (page: Page): Promise<{ labels: Placed[]; bars: Bar[]; hidden: string[]; markers: { brackets: number; dots: number } }> =>
  page.evaluate(() => {
    const o = (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle.overlay;
    return { labels: o.lastLabels.map((l) => ({ id: l.id, kind: l.kind, text: l.text, x: l.x, y: l.y, w: l.w, h: l.h, members: [...l.members] })), bars: o.lastBars.map((b) => ({ ...b })), hidden: [...o.lastHidden], markers: { ...o.lastMarkers } };
  });

/** Resolves once the battle loop has drawn a frame after the call (its pending animation frame, then one more). */
const drawn = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Whether the overlay canvas holds any drawn pixel. */
const inked = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const c = document.getElementById('overlay-canvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
    return false;
  });

function expectNoOverlap(placed: Placed[], width: number, height: number): void {
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w).toBeLessThanOrEqual(width);
    expect(a.y + a.h).toBeLessThanOrEqual(height);
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `"${a.text}" overlaps "${b.text}"`).toBe(false);
    }
  }
}

test.describe('Tactical labels and the large-battle HUD (brief §12)', () => {
  test('the Final Battle at 30 s draws a bounded set of labels that never overlap, and fleet rows with counts', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await finalBattle(page, 30);
    const vp = page.viewportSize()!;

    for (const mode of ['tactical', 'cinematic', 'command']) {
      await page.evaluate((m) => (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle.setCamera(m), mode);
      // The frame hooks hold the last frame drawn, so wait for the battle loop to draw one in the new mode: a fixed
      // wait read the previous mode's frame when a software-rendered frame of this battle took longer than it.
      await drawn(page);
      await expect.poll(async () => (await labels(page)).length, { timeout: 30_000 }).toBeGreaterThan(3);
      const { labels: placed, bars, hidden, markers } = await frame(page);
      expect(placed.length).toBeLessThanOrEqual(60);
      expectNoOverlap(placed, vp.width, vp.height);
      // No label lies on a drawn bar of a hull it does not stand for (the command view draws bars under every
      // bracketed hull; a large battle's far hulls beyond the bracket budget are dots and carry none).
      if (mode === 'command') {
        expect(markers.brackets).toBeGreaterThan(0);
        expect(bars.length).toBe(markers.brackets);
      }
      for (const l of placed)
        for (const b of bars) {
          const on = l.x < b.x + b.w && b.x < l.x + l.w && l.y < b.y + b.h && b.y < l.y + l.h;
          expect(on && !l.members.includes(b.id), `"${l.text}" lies on the bars of ${b.id} (${mode})`).toBe(false);
        }
      if (mode === 'tactical') {
        // Pulled back over 146 hulls and their craft (fleet mode: more than the shared threshold of 64 active ships
        // and flights), crowded battlegroups and fleets carry one label each, a fleet's counting its hulls and craft ...
        const aggregates = placed.filter((l) => l.kind !== 'ship');
        expect(aggregates.length).toBeGreaterThan(0);
        for (const l of aggregates) expect(l.text).toMatch(l.kind === 'group' ? / group · \d+$/ : / · \d+\/\d+( · \d+ craft)?$/);
        // ... and the hulls such a label stands for, on either side, lose their own brackets (none named, a flagship
        // or selected: those always keep their identity).
        expect(hidden.length).toBeGreaterThan(0);
        const standFor = new Set(aggregates.flatMap((l) => l.members));
        const info = await page.evaluate((ids) => {
          const b = (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle;
          return ids.map((id) => {
            const s = b.sim.ships.find((x) => x.id === id)!;
            return { flagship: !!s.flagship, selected: b.view.selectedIds.has(id) };
          });
        }, hidden);
        for (let i = 0; i < hidden.length; i++) {
          expect(standFor.has(hidden[i]), hidden[i]).toBe(true);
          expect(info[i], hidden[i]).toEqual({ flagship: false, selected: false });
        }
      }
    }

    // 278 active ships and flights (over the shared threshold of 64): both lists show one row per fleet with
    // live/deployed hull counts and the fleet's fighter craft; the Reaper blockade is one hostile row, which opens
    // into its capital-led battlegroups.
    const allied = page.locator('.hud-left .ship-list').first();
    const fleetRows = allied.locator('.fleet-row');
    await expect(fleetRows).toHaveCount(5);
    await expect(fleetRows.first()).toContainText('Sword Fleet (Alliance)');
    await expect(fleetRows.first().locator('.agg-count')).toHaveText(/^\d+\/49$/);
    await expect(fleetRows.first().locator('.agg-craft')).toHaveText(/^\d+ craft$/);
    const hostile = page.locator('.hud-left .ship-list').nth(1);
    await expect(hostile.locator('.fleet-row')).toHaveCount(1);
    await expect(hostile.locator('.fleet-row')).toContainText('Reaper blockade');
    await expect(hostile.locator('.fleet-row .agg-count')).toHaveText(/^\d+\/21$/);
    await hostile.locator('.fleet-row .agg-toggle').click();
    await expect(hostile.locator('.group-row', { hasText: /RC-\d+|Harbinger/ }).first()).toBeVisible();
    await hostile.locator('.fleet-row .agg-toggle').click();
    await expect(hostile.locator('.group-row')).toHaveCount(0);

    // A fleet row selects its live hulls; its toggle opens the battlegroups, which select and focus too.
    const alliance = page.locator('.fleet-row[data-fleet="sword-alliance"]');
    await alliance.click();
    const live = await page.evaluate(() => {
      const b = (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle;
      return b.sim.ships.filter((s) => s.fleetId === 'sword-alliance' && s.alive && !s.escaped && s.role !== 'fighter').length;
    });
    await expect(page.locator('.target-panel')).toContainText(`${live} ships selected`);
    await expect(alliance).toHaveClass(/selected/);
    await alliance.locator('.agg-toggle').click();
    const groups = allied.locator('.group-row');
    await expect.poll(() => groups.count()).toBeGreaterThanOrEqual(6);
    await expect(groups.first()).toContainText(/group/);
    await groups.first().dblclick();
    const picked = await page.evaluate(() => {
      const b = (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle;
      const ids = [...b.view.selectedIds];
      return { n: ids.length, fleets: [...new Set(ids.map((id) => b.sim.ships.find((s) => s.id === id)?.fleetId))], follow: b.sim.ships.find((s) => s.id === b.view.followId)?.fleetId };
    });
    expect(picked.n).toBeGreaterThan(1);
    expect(picked.n).toBeLessThan(live);
    expect(picked.fleets).toEqual(['sword-alliance']);
    expect(picked.follow).toBe('sword-alliance');
    // The group opens into its hulls, and a hull row still selects one ship.
    await groups.first().locator('.agg-toggle').click();
    const nested = page.locator('.ship-row.nested');
    await expect.poll(() => nested.count()).toBeGreaterThan(1);
    await nested.first().click();
    await expect(page.locator('.target-panel')).toContainText('SSV');
    expect(errors).toEqual([]);
  });

  test('O shows and hides the tactical overlay with the HUD hidden and shown; the pause menu toggles it; it lasts the session', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await finalBattle(page, 30);
    const state = () =>
      page.evaluate(() => {
        const b = (window as unknown as { reaperwar: { battle: Battle } }).reaperwar.battle;
        return { hud: b.hudLevel, visible: b.overlay.visible, labels: b.overlay.lastLabels.length };
      });
    await expect.poll(async () => (await state()).labels, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(await inked(page)).toBe(true);

    // H down to no HUD: the overlay stays (a no-HUD recording keeps its brackets and labels).
    await page.keyboard.press('h');
    await page.keyboard.press('h');
    await expect(page.locator('.hud')).toHaveClass(/none/);
    await page.waitForTimeout(400);
    expect(await state()).toMatchObject({ hud: 'none', visible: true });
    expect((await state()).labels).toBeGreaterThan(0);
    expect(await inked(page)).toBe(true);
    // O hides it with the HUD hidden ...
    await page.keyboard.press('o');
    await expect.poll(async () => (await state()).visible).toBe(false);
    await expect.poll(() => inked(page)).toBe(false);
    expect((await state()).labels).toBe(0);
    // ... and shows it again.
    await page.keyboard.press('o');
    await expect.poll(async () => (await state()).labels, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(await inked(page)).toBe(true);

    // Back to the full HUD: O hides and shows the overlay there too.
    await page.keyboard.press('h');
    await expect(page.locator('.hud')).not.toHaveClass(/hidden|none/);
    expect((await state()).hud).toBe('full');
    await page.keyboard.press('o');
    await expect.poll(() => inked(page)).toBe(false);
    await page.keyboard.press('o');
    await expect.poll(() => inked(page), { timeout: 30_000 }).toBe(true);

    // The pause menu has the same switch.
    await page.click('[data-action="menu"]');
    const button = page.locator('[data-action="toggle-overlay"]');
    await expect(button).toHaveText(/Tactical overlay: ON/);
    await button.click();
    await expect(button).toHaveText(/Tactical overlay: OFF/);
    expect((await state()).visible).toBe(false);

    // Off lasts the session: a restarted battle starts without the overlay.
    await page.locator('button', { hasText: 'Restart (same seed)' }).click();
    await expect(page.locator('[data-action="pause"]')).toBeVisible();
    await page.waitForTimeout(500);
    expect((await state()).visible).toBe(false);
    expect(await inked(page)).toBe(false);
    await page.keyboard.press('o');
    await expect.poll(() => inked(page), { timeout: 30_000 }).toBe(true);
    expect(errors).toEqual([]);
  });
});
