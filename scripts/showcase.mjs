// Visual QA for ship models: launch faction scenarios and frame one ship of
// each new class with the follow camera. Usage: node scripts/showcase.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'e2e-screenshots';
const base = process.argv[3] ?? 'http://localhost:4173';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const follow = (classId) =>
  page.evaluate((cid) => {
    const b = window.reaperwar.battle;
    const ship = b.sim.ships.find((s) => s.alive && s.classId === cid);
    if (!ship) return false;
    b.view.followId = ship.id;
    b.select(ship.id);
    b.setCamera('follow');
    b.toggleHud();
    return true;
  }, classId);

const shots = [
  { scenario: 'Defence of Palaven', classes: ['turian_dreadnought', 'turian_cruiser', 'turian_frigate'] },
  { scenario: 'Fall of Thessia', classes: ['destiny_ascension', 'asari_dreadnought', 'asari_cruiser'] },
  { scenario: 'Cerberus Intervention', classes: ['alliance_cruiser'] },
  { scenario: 'Sur’Kesh', classes: ['salarian_dreadnought', 'salarian_cruiser', 'salarian_frigate', 'salarian_fighter'], wide: true },
  { scenario: 'Rannoch Campaign', classes: ['quarian_liveship', 'quarian_heavy', 'quarian_cruiser'], enemies: ['geth_dreadnought', 'geth_cruiser', 'geth_frigate'] },
  { scenario: 'Battle of the Citadel', classes: ['turian_dreadnought'], wide: true },
];
await page.goto(base + '/');
for (const s of shots) {
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.click('[data-menu="quick-battle"]');
  await page.click(`button:has-text("${s.scenario}")`);
  await page.click('[data-action="launch"]');
  await page.waitForSelector('[data-action="pause"]');
  await page.evaluate(() => {
    const b = window.reaperwar.battle;
    while (b.sim.time < 8) b.sim.step();
    b.togglePause();
  });
  for (const cid of s.classes) {
    const ok = await follow(cid);
    if (!ok) {
      console.log('missing', cid);
      continue;
    }
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${outDir}/model-${cid}.png` });
    console.log('captured', cid);
    await page.evaluate(() => window.reaperwar.battle.toggleHud());
  }
  if (s.wide) {
    await page.evaluate(() => {
      const b = window.reaperwar.battle;
      b.setCamera('tactical');
      b.view.rig.distance = 900;
      b.view.rig.pitch = 0.25;
      b.view.rig.yaw = 2.2;
      b.toggleHud();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/env-${s.scenario.replace(/\W+/g, '_')}.png` });
    console.log('captured environment', s.scenario);
    await page.evaluate(() => window.reaperwar.battle.toggleHud());
  }
  // Enemy-side ships: frame one directly.
  if (s.enemies || s.scenario === 'Cerberus Intervention') {
    for (const cid of s.enemies ?? ['cerberus_cruiser', 'cerberus_frigate']) {
      const ok = await follow(cid);
      if (ok) {
        await page.waitForTimeout(1800);
        await page.screenshot({ path: `${outDir}/model-${cid}.png` });
        console.log('captured', cid);
        await page.evaluate(() => window.reaperwar.battle.toggleHud());
      }
    }
  }
  await page.evaluate(() => window.reaperwar.show('menu'));
}
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No page errors.');
await browser.close();
process.exit(errors.length ? 1 : 0);
