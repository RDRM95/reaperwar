// Visual QA: drive the built app and capture screenshots of each screen and
// several camera modes mid-battle. Usage: node scripts/screenshots.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'e2e-screenshots';
const base = process.argv[3] ?? 'http://localhost:4173';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('captured', name);
};
/** Advance the simulation by `seconds` instantly (headless machines render too slowly to wait). */
const advance = (seconds) =>
  page.evaluate((secs) => {
    const b = window.reaperwar.battle;
    const target = b.sim.time + secs;
    while (!b.sim.finished && b.sim.time < target) b.sim.step();
  }, seconds);
const followShip = (predicate, mode) =>
  page.evaluate(({ pred, mode }) => {
    const b = window.reaperwar.battle;
    // eslint-disable-next-line no-new-func
    const fn = new Function('s', `return ${pred}`);
    const ship = b.sim.ships.find((s) => s.alive && fn(s));
    if (ship) {
      b.view.followId = ship.id;
      b.select(ship.id);
    }
    b.setCamera(mode);
  }, { pred: predicate, mode });

await page.goto(base + '/');
await page.waitForSelector('[data-menu="quick-battle"]', { timeout: 60_000 });
await page.waitForTimeout(500);
await shot('01-menu');

await page.click('[data-menu="quick-battle"]');
await page.waitForSelector('[data-action="launch"]');
await shot('02-briefing');

await page.click('[data-action="launch"]');
await page.waitForSelector('[data-action="pause"]', { timeout: 60_000 });
await page.waitForTimeout(1500);
await shot('03-battle-start-tactical');

// Fast-forward to the opening salvoes.
await advance(26);
await page.waitForTimeout(1200);
await shot('04-battle-tactical-engaged');

await followShip("s.classId === 'alliance_dreadnought'", 'follow');
await page.waitForTimeout(1800);
await shot('05-follow-dreadnought');

await followShip("s.classId === 'reaper_capital'", 'follow');
await page.waitForTimeout(1800);
await shot('06-follow-reaper-capital');

await followShip("s.classId === 'reaper_destroyer'", 'follow');
await page.waitForTimeout(1800);
await shot('07-follow-reaper-destroyer');

await followShip("s.classId === 'reaper_capital'", 'reaper');
await page.waitForTimeout(1500);
await shot('08-reaper-cam');

await page.click('[data-camera="cinematic"]');
await advance(6);
await page.waitForTimeout(2500);
await shot('09-cinematic');
await advance(8);
await page.waitForTimeout(2500);
await shot('10-cinematic-2');

await page.click('[data-camera="command"]');
await page.waitForTimeout(1500);
await shot('11-command');

await page.click('[data-camera="projectile"]');
await page.waitForTimeout(1500);
await shot('12-projectile');

await followShip("s.classId === 'alliance_cruiser'", 'follow');
await advance(30);
await page.waitForTimeout(1500);
await shot('13-mid-battle-follow-cruiser');

// Finish the battle.
await advance(600);
await page.waitForSelector('[data-action="results"]', { timeout: 60_000 });
await shot('14-battle-end');
await page.click('[data-action="results"]');
await page.waitForSelector('[data-action="replay"]');
await page.waitForTimeout(600);
await shot('15-results');

await page.click('text=Main menu');
await page.click('[data-menu="canon-vs-au-comparison"]');
await page.click('[data-action="run-comparison"]');
await page.waitForSelector('[data-action="watch-b"]', { timeout: 60_000 });
await page.waitForTimeout(500);
await shot('16-comparison');

await page.click('text=Main menu');
await page.click('[data-menu="codex"]');
await page.waitForTimeout(600);
await shot('17-codex');

await page.click('text=Main menu');
await page.click('[data-menu="fleet-database"]');
await page.waitForTimeout(600);
await shot('18-database');

await page.click('text=Main menu');
await page.click('[data-menu="alternate-timelines"]');
await page.waitForTimeout(600);
await shot('19-timelines');

await page.click('text=Main menu');
await page.click('[data-menu="custom-battle"]');
await page.waitForTimeout(600);
await shot('20-custom');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No page errors.');
await browser.close();
process.exit(errors.length ? 1 : 0);
