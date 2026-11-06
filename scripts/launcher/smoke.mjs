// Smoke test of the launcher package: opens release/ReaperWar-v<version>/game/index.html straight
// from disk in Chromium (as the Play launchers do), checks it says Local Edition, launches a Quick
// Battle and runs it for 20 simulated seconds, and fails on any page or console error.
// Usage: npm run package:launcher && npm run test:launcher
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const game = path.join(root, 'release', `ReaperWar-v${version}`, 'game', 'index.html');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
try {
  await page.goto(pathToFileURL(game).href);
  await page.waitForSelector('[data-menu="quick-battle"]', { timeout: 60_000 });
  const tag = page.locator('[data-local-edition]');
  if ((await tag.count()) === 0 || !/Local Edition/.test(await tag.first().innerText())) throw new Error('the menu does not show the Local Edition tag');
  // Nothing may animate forever on the menu: with the launchers' uncapped frame rate the browser would
  // draw frames back to back and keep the CPU and GPU busy (a hidden loading-screen pulse once did).
  await page.waitForTimeout(1500);
  const endless = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).map((a) => `${a.animationName ?? 'animation'} on ${a.effect?.target?.className ?? '?'}`));
  if (endless.length) throw new Error(`endless animations run on the menu: ${endless.join(', ')}`);
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await page.waitForSelector('[data-action="pause"]', { timeout: 90_000 });
  const t = await page.evaluate(() => {
    const b = window.reaperwar.battle;
    const target = b.sim.time + 20;
    while (!b.sim.finished && b.sim.time < target) b.sim.step();
    return b.sim.time;
  });
  await page.waitForTimeout(1500);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Launcher smoke test passed: ${pathToFileURL(game).href} - menu says Local Edition, Quick Battle ran to ${t.toFixed(1)} s, no errors.`);
} finally {
  await browser.close();
}
