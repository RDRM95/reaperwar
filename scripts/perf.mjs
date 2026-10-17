// Headless rendering benchmark: draw calls and frame time for a large
// engagement with level-of-detail on and off. Usage: node scripts/perf.mjs [baseUrl]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(base + '/');
await page.click('[data-menu="quick-battle"]');
await page.click('button:has-text("Final Battle of Earth")');
await page.selectOption('select >> nth=1', 'default').catch(() => {});
await page.click('[data-action="launch"]');
await page.waitForSelector('[data-action="pause"]');
await page.evaluate(() => {
  const b = window.reaperwar.battle;
  while (b.sim.time < 40) b.sim.step();
  b.togglePause();
});
const measure = async (lod) => {
  await page.evaluate((on) => {
    window.reaperwar.battle.view.settings.lod = on;
  }, lod);
  await page.waitForTimeout(500);
  return page.evaluate(async () => {
    const v = window.reaperwar.battle.view;
    const frames = 30;
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      v.update(1 / 60, 0.5);
      v.render();
    }
    const ms = (performance.now() - t0) / frames;
    return { drawCalls: v.drawCalls, ms: Number(ms.toFixed(1)), ships: window.reaperwar.battle.sim.ships.filter((s) => s.alive && !s.escaped).length, lod: { ...v.lodCounts } };
  });
};
for (const cam of ['tactical', 'follow']) {
  await page.evaluate((c) => window.reaperwar.battle.setCamera(c), cam);
  await page.waitForTimeout(300);
  // Warm up shaders before measuring.
  await measure(true);
  await measure(false);
  const off = await measure(false);
  const on = await measure(true);
  console.log(`[${cam}] ships ${on.ships} · LOD off: ${off.drawCalls} draw calls, ${off.ms} ms/frame · LOD on: ${on.drawCalls} draw calls, ${on.ms} ms/frame · levels ${JSON.stringify(on.lod)}`);
}
console.log('Note: under software GL (SwiftShader) frame time is pixel-bound and barely reacts to draw calls; compare draw calls here and frame time on real GPUs.');
await browser.close();
