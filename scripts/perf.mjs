// Headless rendering benchmark: draw calls and frame time for a large
// engagement with level-of-detail on and off. Usage: node scripts/perf.mjs [baseUrl]
//
// Playback benchmark (brief §19.1; results in docs/apex/PLAYBACK_PERF.md):
//   node scripts/perf.mjs [baseUrl] --playback [--seconds 6] [--only fboe,c300] [--profiles gpu-light,swiftshader]
//                                              [--no-ablate] [--no-headless] [--json out.json]
// The Final Battle of Earth and a 300-vs-300 custom battle (canon, seed 42) are launched through the
// UI the way the e2e tests do, each measured run in a fresh browser context. The battle is paused,
// advanced headlessly (sim.step() in the page, like the e2e advance hook) to a fixed simulated time,
// and the render-side backlog of that advance is dropped (queued events, hulls already destroyed) so
// the window shows only what it produces itself. After a paused warm-up, paused frames are recorded
// (the per-frame cost of drawing a battle that is not advancing), then the controller's own
// requestAnimationFrame loop runs for --seconds at 1× and at 8×. Timers that this script wraps
// around the controller's methods (the source is not changed) record the per-frame split: sim.step
// (the controller's event hooks run inside it and are timed on their own too), view.update (with
// processEvents and the effects update inside it), view.render, overlay.draw and the HUD (tick,
// refresh, end banner); the rest of the frame interval is "outside the loop" (browser, compositor,
// GPU-process back-pressure, idle). The no-draw ablation repeats 8× with view.render, overlay.draw
// and hud.refresh stubbed out. The headless run times `while (!sim.finished) sim.step()` in the
// page on a fresh simulation of the same config.
//
// Two browser profiles, because this sandbox has no GPU:
//   swiftshader  WebGL, the 2D overlay and the compositor are all rasterised by SwiftShader in the GPU
//                process (the flags of the benchmark above): about a second per frame, set by the
//                software rasteriser's per-draw cost, so the frame rate says nothing about a real GPU.
//   gpu-light    the same browser with the 2D canvas and the compositor in software and the WebGL
//                draw entry points made no-ops: every line of the app's JavaScript still runs and
//                every draw call is still issued and counted, but nothing is rasterised, so the page's
//                main thread paces the frames as on a machine whose GPU keeps up (software
//                compositing still costs this sandbox some 25-35 ms a frame, seen in the paused frame).
// performance.now() is coarsened (0.1 ms) on a page that is not cross-origin isolated: per-frame
// figures are means over every frame of a window.
//
// The machine may be shared (other agents run simulations in this container): on Linux the CPU used
// by processes outside this script's process tree is read from /proc around every run and reported
// ("other load", in cores), and before every run the script waits up to --quiet-wait seconds
// (default 600; 0 disables) for that load to drop below a quarter of a core.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--seconds', '--only', '--json', '--profiles', '--quiet-wait']);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));
const base = positional[0] ?? 'http://localhost:4173';

async function lodBenchmark() {
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
}

// ---------------------------------------------------------------------------------- playback

const VIEWPORT = { width: 1600, height: 900 };
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
/** Exact heap figures and window.gc() for the heap columns. */
const MEASURE_ARGS = ['--enable-precise-memory-info', '--js-flags=--expose-gc'];
const PROFILES = {
  'gpu-light': { label: 'GPU-light', args: ['--disable-accelerated-2d-canvas', '--disable-gpu-compositing', ...GL_ARGS, ...MEASURE_ARGS], skipDraws: true },
  swiftshader: { label: 'SwiftShader', args: [...GL_ARGS, ...MEASURE_ARGS], skipDraws: false },
};
/** The custom battle's order of battle: 300 hulls a side (its carriers launch their craft on top). */
const C300 = {
  sideA: { alliance_dreadnought: 18, alliance_carrier: 6, alliance_cruiser: 96, alliance_frigate: 180 },
  sideB: { reaper_capital: 75, reaper_destroyer: 225 },
};
/** startAt: simulated seconds at which each window opens (both fleets firing: the costliest stretch of each battle). */
const SCENARIOS = [
  { id: 'fboe', name: 'Final Battle of Earth', startAt: 30, launch: launchFinalBattle },
  { id: 'c300', name: '300 vs 300 custom battle', startAt: 60, launch: launchCustom300 },
];
const SIM_DT = 0.05;

/** Set a number input and fire its change handler (the screens re-render on change). */
const setNumber = (page, selector, value) =>
  page.locator(selector).evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

async function launchFinalBattle(page) {
  await page.click('[data-menu="quick-battle"]');
  await page.click('button:has-text("Final Battle of Earth")');
  await page.selectOption('select[data-ws="forces"]', 'default');
  await setNumber(page, 'label:has-text("Random seed") input', 42);
  await page.click('[data-action="launch"]');
  await page.waitForSelector('[data-action="pause"]');
}

async function launchCustom300(page) {
  await page.click('[data-menu="custom-battle"]');
  await page.waitForSelector('[data-action="launch-custom"]');
  const keys = await page.$$eval('[data-count^="sideA:"], [data-count^="sideB:"]', (els) => els.map((e) => e.getAttribute('data-count')));
  for (const key of keys) {
    const [side, cls] = key.split(':');
    await setNumber(page, `[data-count="${key}"]`, C300[side][cls] ?? 0);
  }
  await setNumber(page, 'label:has-text("Random seed") input', 42);
  await page.click('[data-action="launch-custom"]');
  await page.waitForSelector('[data-action="pause"]');
}

/** In page: what was launched, so a wrong launch fails loudly instead of measuring the wrong battle. */
const describeBattle = () => {
  const b = window.reaperwar.battle;
  const hulls = (side) => b.sim.ships.filter((s) => s.side === side && s.role !== 'fighter').length;
  return {
    scenarioId: b.config.scenarioId,
    seed: b.config.seed,
    rules: b.config.rules.id,
    hullsA: hulls('A'),
    hullsB: hulls('B'),
    ships: b.sim.ships.length,
    quality: b.view.settings.quality,
    pixelRatio: b.view.renderer.getPixelRatio(),
    canvas: [b.view.renderer.domElement.width, b.view.renderer.domElement.height],
    camera: b.view.rig.mode,
    overlay: b.overlay.visible,
  };
};

/** In page (GPU-light): the WebGL draw entry points become no-ops; Three.js still issues and counts every draw. */
const skipDraws = () => {
  const gl = window.reaperwar.battle.view.renderer.getContext();
  const skipped = [];
  for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
    if (typeof gl[k] === 'function') {
      gl[k] = () => {};
      skipped.push(k);
    }
  }
  return skipped;
};

/** In page: pause, advance headlessly to `startTick`, drop the render-side backlog of the advance, warm up paused. */
const prepareWindow = async ({ startTick }) => {
  const b = window.reaperwar.battle;
  if (!b.paused) b.togglePause();
  const sim = b.sim;
  const t0 = performance.now();
  while (!sim.finished && sim.tick < startTick) sim.step();
  const advanceMs = performance.now() - t0;
  // The advance queued its events for the view and the HUD and left its losses to die on screen at the next frame;
  // drop both so the window shows only the effects it produces itself (render state only, the simulation is not touched).
  b.view.eventQueue = [];
  b.pendingEvents = [];
  let hidden = 0;
  for (const v of b.view.visuals.values()) {
    if (!v.ship.alive && !v.removed) {
      v.removed = true;
      b.view.scene.remove(v.built.group);
      hidden++;
    }
  }
  /** Resolve after at least `frames` animation frames and `ms` milliseconds. */
  const frames = (count, ms) =>
    new Promise((resolve) => {
      let n = 0;
      const w0 = performance.now();
      const tick = () => {
        n++;
        if (n >= count && performance.now() - w0 >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  // Compile every effect's shader program and upload its textures now, as a battle already in progress would have:
  // one of each effect is spawned at the camera focus, the scene is compiled, two paused frames draw them, and they
  // are cleared again (render state only).
  const fx = b.view.effects;
  const V = b.view.rig.focus.constructor;
  const at = b.view.rig.focus.clone();
  const ahead = (dx, dz) => at.clone().add(new V(dx, 0, dz));
  fx.muzzleFlash(at.clone(), new V(0, 0, 1), 6, false);
  fx.muzzleFlash(at.clone(), new V(0, 0, 1), 6, true);
  fx.impact(at.clone(), 500, 0, 2, () => undefined, 'mass_accelerator');
  fx.impact(at.clone(), 0, 500, 2, () => undefined, 'mass_accelerator');
  fx.impact(at.clone(), 0, 500, 2, () => undefined, 'reaper_beam');
  fx.explosion(at.clone(), 6, true, [], new V());
  fx.secondary(at.clone(), 2);
  fx.setBeams([
    { start: at.clone(), end: ahead(0, 50), kind: 'reaper_beam', intensity: 1 },
    { start: at.clone(), end: ahead(50, 0), kind: 'thanix', intensity: 1 },
  ]);
  fx.setPointDefence([{ from: at.clone(), to: ahead(10, 10), reaper: false }]);
  fx.setTracers([{ pos: { x: at.x / 10, y: at.y / 10, z: at.z / 10 }, vel: { x: 1, y: 0, z: 0 }, big: true }], 1, 0.05);
  fx.setMissiles([{ pos: { x: at.x / 10, y: at.y / 10, z: at.z / 10 }, vel: { x: 1, y: 0, z: 0 } }], 1, 0.05);
  const c0 = performance.now();
  b.view.renderer.compile(b.view.scene, b.view.rig.camera);
  await frames(2, 0);
  const compileMs = performance.now() - c0;
  fx.clear();
  // Paused warm-up: at least 1 s and 3 frames (the HUD settles).
  await frames(3, 1000);
  const live = (side) => sim.ships.filter((s) => s.side === side && s.alive && !s.escaped && s.role !== 'fighter').length;
  return { advanceMs, compileMs, simTime: sim.time, tick: sim.tick, hiddenWrecks: hidden, liveA: live('A'), liveB: live('B'), liveShips: sim.ships.filter((s) => s.alive && !s.escaped).length, projectiles: sim.projectiles.length };
};

/**
 * In page: record paused frames (at least 1 s and 2 frames), then run the controller's rAF loop for `seconds` at
 * `speed`, with timers around its parts; resolves with every frame of both phases.
 */
const measureWindow = ({ seconds, speed, ablate }) => {
  const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
  const b = window.reaperwar.battle;
  const sim = b.sim;
  const view = b.view;
  const fx = view.effects;
  const now = () => performance.now();
  const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : Number.NaN);
  const gc = () => {
    if (typeof window.gc === 'function') window.gc();
  };
  const undo = [];
  let cur = null;
  /** Replace obj[key] by a timed call (of `replacement` when given) that credits `bucket` of the current frame. */
  const timed = (obj, key, bucket, replacement) => {
    const own = Object.prototype.hasOwnProperty.call(obj, key);
    const orig = obj[key];
    const fn = replacement ?? orig;
    obj[key] = function (...args) {
      const t = now();
      const r = fn.apply(this, args);
      if (cur) cur[bucket] += now() - t;
      return r;
    };
    undo.push(() => {
      if (own) obj[key] = orig;
      else delete obj[key];
    });
  };
  // sim.step is wrapped on the prototype so the controller's simulation object keeps its own shape.
  const proto = Object.getPrototypeOf(sim);
  const step = proto.step;
  proto.step = function () {
    const t = now();
    step.call(this);
    if (cur && this === sim) {
      cur.sim += now() - t;
      cur.steps++;
    }
  };
  undo.push(() => {
    proto.step = step;
  });
  // The controller's event hook (view queue, HUD queue, audio) runs inside sim.step for every event.
  const onEvent = sim.onEvent;
  sim.onEvent = (e) => {
    const t = now();
    onEvent(e);
    if (cur) {
      cur.hooks += now() - t;
      cur.events++;
    }
  };
  undo.push(() => {
    sim.onEvent = onEvent;
  });
  timed(view, 'update', 'update');
  timed(view, 'processEvents', 'fxEvents');
  timed(fx, 'update', 'fxUpdate');
  timed(b.hud, 'tick', 'hud');
  timed(b.hud, 'showEnd', 'hud');
  // The no-draw ablation stubs the three drawing calls for the running window only.
  const ablation = { render: false, overlay: false, refresh: false };
  timed(view, 'render', 'render', ablate ? function (...a) { return ablation.render ? undefined : view.constructor.prototype.render.apply(this, a); } : undefined);
  timed(b.overlay, 'draw', 'overlay', ablate ? function (...a) { return ablation.overlay ? undefined : b.overlay.constructor.prototype.draw.apply(this, a); } : undefined);
  const refresh = b.hud.refresh;
  timed(b.hud, 'refresh', 'hud', ablate ? (...a) => (ablation.refresh ? undefined : refresh(...a)) : undefined);

  const paused = [];
  const frames = [];
  const loop = b.loop;
  let phase = 'paused';
  const tPaused = now();
  let tStart = 0;
  let simStart = 0;
  let accStart = 0;
  let heap0 = 0;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const live = (side) => sim.ships.filter((s) => s.side === side && s.alive && !s.escaped && s.role !== 'fighter').length;
  const start = () => {
    b.setSpeed(SPEEDS.indexOf(speed));
    if (ablate) ablation.render = ablation.overlay = ablation.refresh = true;
    gc();
    heap0 = heap();
    phase = 'run';
    tStart = now();
    simStart = sim.time;
    accStart = b.accumulator;
    b.togglePause();
  };
  const finish = () => {
    const tEnd = now();
    const simEnd = sim.time;
    const accEnd = b.accumulator;
    const heapEnd = heap();
    ablation.render = ablation.overlay = ablation.refresh = false;
    if (!b.paused) b.togglePause();
    for (const u of undo.reverse()) u();
    gc();
    const heapAfterGc = heap();
    const result = { speed, ablate, tStart, tEnd, simStart, simEnd, accStart, accEnd, heap0, heapEnd, heapAfterGc, liveA: live('A'), liveB: live('B'), finished: sim.finished, paused, frames };
    // The last frame lasts until the next frame begins.
    requestAnimationFrame((tsAfter) => resolveDone({ ...result, tsAfter }));
  };
  b.loop = (ts) => {
    if (phase === 'done') return loop(ts);
    cur = { ts, dt: ts - b.lastFrame, sim: 0, steps: 0, hooks: 0, events: 0, update: 0, fxEvents: 0, fxUpdate: 0, render: 0, overlay: 0, hud: 0, loop: 0 };
    const t0 = now();
    loop(ts);
    cur.loop = now() - t0;
    cur.heap = heap();
    cur.draws = view.drawCalls;
    cur.sparks = fx.sparks.length;
    cur.debris = fx.debris.length;
    cur.shields = fx.shields.length;
    cur.projectiles = sim.projectiles.length;
    (phase === 'paused' ? paused : frames).push(cur);
    cur = null;
    if (phase === 'paused') {
      if (paused.length >= 2 && now() - tPaused >= 1000) start();
    } else if (now() - tStart >= seconds * 1000 || sim.finished) {
      phase = 'done';
      finish();
    }
  };
  undo.push(() => {
    b.loop = loop;
  });
  return done;
};

/** In page: a fresh simulation of the launched battle's config, stepped to its result with nothing else running. */
const headlessRun = () => {
  const b = window.reaperwar.battle;
  if (!b.paused) b.togglePause();
  const Sim = b.sim.constructor;
  const sim = new Sim(b.config);
  const windows = [];
  const t0 = performance.now();
  let tw = t0;
  while (!sim.finished) {
    sim.step();
    if (sim.tick % 200 === 0) {
      const t = performance.now();
      windows.push({ t: Math.round(sim.time), msPerStep: (t - tw) / 200 });
      tw = t;
    }
  }
  const wallMs = performance.now() - t0;
  const r = sim.result;
  return { wallMs, simTime: sim.time, steps: sim.tick, events: sim.events.length, outcome: r.outcome, winner: r.winner, reason: r.reason, duration: r.duration, windows };
};

/** In page: the browser and timer facts the numbers depend on. */
const environment = async () => {
  let renderer = 'unknown';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* no WebGL */
  }
  let resolution = Infinity;
  let last = performance.now();
  for (let i = 0; i < 2_000_000 && resolution > 0.002; i++) {
    const t = performance.now();
    if (t > last) {
      resolution = Math.min(resolution, t - last);
      last = t;
    }
  }
  // requestAnimationFrame rate on the main menu: the compositor's ceiling for this page.
  const rafHz = await new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
      else resolve((n * 1000) / (performance.now() - t0));
    };
    requestAnimationFrame(tick);
  });
  return {
    userAgent: navigator.userAgent,
    renderer,
    threads: navigator.hardwareConcurrency,
    crossOriginIsolated: self.crossOriginIsolated === true,
    timerResolutionMs: resolution,
    preciseMemory: !!performance.memory,
    gcExposed: typeof window.gc === 'function',
    menuRafHz: rafHz,
  };
};

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : Number.NaN);
const percentile = (a, p) => {
  if (!a.length) return Number.NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
};
const MB = 1024 * 1024;
const BUCKETS = ['sim', 'hooks', 'update', 'fxEvents', 'fxUpdate', 'render', 'overlay', 'hud', 'loop'];

/** Each frame's duration: from its rAF timestamp to the next frame's (`nextTs` after the last), so it contains its own loop. */
const durations = (list, nextTs) => list.map((x, i) => (i + 1 < list.length ? list[i + 1].ts : nextTs) - x.ts);

/** Mean per-frame split of a list of frames with their durations. */
function splitOf(frames, dur) {
  const split = {};
  for (const k of BUCKETS) split[k] = mean(frames.map((x) => x[k]));
  split.other = split.loop - split.sim - split.update - split.render - split.overlay - split.hud;
  split.outside = mean(dur) - split.loop;
  return split;
}

/** Per-run statistics from the raw frames. */
function summarise(run) {
  const f = run.frames;
  const dts = durations(f, run.tsAfter);
  const pausedDur = durations(run.paused, f[0]?.ts ?? run.tsAfter);
  const seconds = (run.tsAfter - f[0].ts) / 1000;
  const col = (k) => mean(f.map((x) => x[k]));
  const simAdvance = run.simEnd - run.simStart;
  // What the controller was asked to simulate: each frame adds min(0.1 s, frame delta) × speed to its accumulator.
  const requestedCapped = f.reduce((s, x) => s + Math.min(0.1, x.dt / 1000) * run.speed, 0);
  const requested = f.reduce((s, x) => s + (x.dt / 1000) * run.speed, 0);
  const accDelta = run.accEnd - run.accStart;
  let gcs = 0;
  for (let i = 1; i < f.length; i++) if (f[i - 1].heap - f[i].heap > 1 * MB) gcs++;
  const steps = f.reduce((s, x) => s + x.steps, 0);
  return {
    speed: run.speed,
    ablate: run.ablate,
    frames: f.length,
    seconds,
    fps: f.length / seconds,
    frameMean: mean(dts),
    frameP50: percentile(dts, 0.5),
    frameP95: percentile(dts, 0.95),
    frameMax: Math.max(...dts),
    loopP95: percentile(f.map((x) => x.loop), 0.95),
    split: splitOf(f, dts),
    pausedFrames: run.paused.length,
    pausedFrameMean: mean(pausedDur),
    pausedSplit: splitOf(run.paused, pausedDur),
    stepsPerFrame: steps / Math.max(1, f.length),
    stepsMax: Math.max(...f.map((x) => x.steps)),
    simMsPerStep: f.reduce((s, x) => s + x.sim, 0) / Math.max(1, steps),
    hookUsPerEvent: (1000 * f.reduce((s, x) => s + x.hooks, 0)) / Math.max(1, f.reduce((s, x) => s + x.events, 0)),
    eventsPerFrame: col('events'),
    simStart: run.simStart,
    simAdvance,
    achieved: simAdvance / seconds,
    droppedBudget: Math.max(0, requestedCapped - simAdvance - accDelta),
    droppedDtCap: requested - requestedCapped,
    framesAtBudget: f.filter((x) => x.sim >= 40).length,
    drawsMean: col('draws'),
    drawsMax: Math.max(...f.map((x) => x.draws)),
    pausedDraws: mean(run.paused.map((x) => x.draws)),
    sparksMax: Math.max(...f.map((x) => x.sparks)),
    debrisMax: Math.max(...f.map((x) => x.debris)),
    shieldsMax: Math.max(...f.map((x) => x.shields)),
    projectilesMean: col('projectiles'),
    heapStartMB: run.heap0 / MB,
    heapGrowthMB: (run.heapEnd - run.heap0) / MB,
    heapPeakGrowthMB: (Math.max(...f.map((x) => x.heap)) - run.heap0) / MB,
    heapRetainedMB: (run.heapAfterGc - run.heap0) / MB,
    gcs,
    liveEnd: [run.liveA, run.liveB],
  };
}

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const runLabel = (s) => `${s.speed}×${s.ablate ? ' no-draw' : ''}`;

// Other processes' CPU (Linux /proc; undefined elsewhere).
const CLK_TCK = (() => {
  try {
    return Number(execSync('getconf CLK_TCK', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) || 100;
  } catch {
    return 100;
  }
})();
/** CPU ticks and parent of every process. */
function procSnapshot() {
  let dirs;
  try {
    dirs = readdirSync('/proc');
  } catch {
    return undefined;
  }
  const procs = new Map();
  for (const d of dirs) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
      const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      procs.set(Number(d), { ppid: Number(f[1]), ticks: Number(f[11]) + Number(f[12]) });
    } catch {
      /* the process has gone */
    }
  }
  let steal = 0;
  try {
    steal = Number(readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/)[8]) || 0;
  } catch {
    /* no /proc/stat */
  }
  return { t: performance.now(), procs, steal };
}
/** Mean cores used between two snapshots by processes outside this script's tree (the browser is in it). */
function otherCores(a, b) {
  if (!a || !b) return Number.NaN;
  const ours = new Set([process.pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [pid, p] of b.procs) {
      if (!ours.has(pid) && ours.has(p.ppid)) {
        ours.add(pid);
        grew = true;
      }
    }
  }
  let ticks = 0;
  for (const [pid, p] of b.procs) if (!ours.has(pid)) ticks += p.ticks - (a.procs.get(pid)?.ticks ?? 0);
  return ticks / CLK_TCK / ((b.t - a.t) / 1000);
}
/** Wait (3 s samples) until other processes use less than `threshold` cores, at most `maxSeconds`. */
async function waitForQuiet(maxSeconds, threshold = 0.25) {
  const t0 = Date.now();
  let announced = false;
  for (;;) {
    const a = procSnapshot();
    if (!a || maxSeconds <= 0) return { waited: 0, cores: Number.NaN };
    await new Promise((r) => setTimeout(r, 3000));
    const cores = otherCores(a, procSnapshot());
    const waited = (Date.now() - t0) / 1000;
    if (cores < threshold || waited >= maxSeconds) {
      if (announced) console.log(`  (waited ${fmt(waited, 0)} s for other processes; ${fmt(cores, 2)} cores busy now${cores >= threshold ? ', proceeding anyway' : ''})`);
      return { waited, cores };
    }
    if (!announced) console.log(`  (other processes are using ${fmt(cores, 2)} cores: waiting up to ${maxSeconds} s for them to finish)`);
    announced = true;
  }
}
/** Run `fn` between two process snapshots; returns its value, the other processes' mean load and the hypervisor's steal, in cores. */
async function withLoad(fn) {
  const a = procSnapshot();
  const value = await fn();
  const b = procSnapshot();
  return { value, otherCores: otherCores(a, b), stealCores: a && b ? (b.steal - a.steal) / CLK_TCK / ((b.t - a.t) / 1000) : Number.NaN };
}

async function playbackBenchmark() {
  const seconds = Number(option('seconds', '6'));
  const quietWait = Number(option('quiet-wait', '600'));
  const only = option('only', '');
  const profiles = option('profiles', 'gpu-light,swiftshader').split(',').filter((p) => PROFILES[p]);
  const ablate = !flag('no-ablate');
  let headlessDone = flag('no-headless');
  const errors = [];
  const load = { start: loadavg() };
  const results = [];
  const envs = {};
  console.log(`Playback benchmark · ${base} · ${VIEWPORT.width}×${VIEWPORT.height} · windows of ${seconds} s · load average at start ${load.start.map((x) => x.toFixed(2)).join(' ')}`);
  for (const profileId of profiles) {
    const profile = PROFILES[profileId];
    const browser = await chromium.launch({ headless: true, args: profile.args });
    const openPage = async () => {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(base + '/');
      await page.waitForSelector('[data-menu="quick-battle"]');
      return { context, page };
    };
    const envPage = await openPage();
    const env = { ...(await envPage.page.evaluate(environment)), browserVersion: browser.version() };
    envs[profileId] = env;
    await envPage.context.close();
    console.log(`\n== ${profile.label} profile · Chromium ${env.browserVersion} headless · WebGL: ${env.renderer}`);
    console.log(`   ${env.threads} hardware threads · main menu rAF ${fmt(env.menuRafHz)} Hz · performance.now() resolution ${fmt(env.timerResolutionMs, 3)} ms · cross-origin isolated: ${env.crossOriginIsolated} · precise heap: ${env.preciseMemory} · gc exposed: ${env.gcExposed}${profile.skipDraws ? ' · WebGL draw calls issued and counted but not executed' : ''}`);

    for (const sc of SCENARIOS.filter((s) => !only || only.split(',').includes(s.id))) {
      let entry = results.find((e) => e.id === sc.id);
      if (!entry) {
        entry = { id: sc.id, name: sc.name, startAt: sc.startAt, runs: [] };
        results.push(entry);
      }
      if (!headlessDone && !entry.headless) {
        const { context, page } = await openPage();
        await sc.launch(page);
        entry.battle = await page.evaluate(describeBattle);
        await waitForQuiet(quietWait);
        const run = await withLoad(() => page.evaluate(headlessRun));
        entry.headless = { ...run.value, otherCores: run.otherCores, stealCores: run.stealCores, profile: profileId };
        await context.close();
        const h = entry.headless;
        h.peak = h.windows.reduce((m, w) => (w.msPerStep > m.msPerStep ? w : m), { msPerStep: 0, t: 0 });
        console.log(`\n[${sc.id}] ${sc.name} · ${entry.battle.rules} · seed ${entry.battle.seed} · ${entry.battle.hullsA} vs ${entry.battle.hullsB} hulls at launch (carriers launch their craft after it) · ${entry.battle.quality} quality, pixel ratio ${entry.battle.pixelRatio}, ${entry.battle.camera} camera, overlay ${entry.battle.overlay ? 'on' : 'off'}`);
        console.log(`  headless to result: ${fmt(h.duration)} s simulated in ${fmt(h.wallMs / 1000, 2)} s wall = ${fmt(h.duration / (h.wallMs / 1000))}× real time · ${h.steps} steps at ${fmt(h.wallMs / h.steps, 2)} ms/step (peak ${fmt(h.peak.msPerStep, 2)} ms/step in the 10 s ending T+${h.peak.t} s) · ${h.events} events · ${h.outcome} (${h.winner}): ${h.reason} · other load ${fmt(h.otherCores, 2)} cores, steal ${fmt(h.stealCores, 2)}`);
      } else {
        console.log(`\n[${sc.id}] ${sc.name}`);
      }
      const variants = [{ speed: 1, ablate: false }, { speed: 8, ablate: false }, ...(ablate && profile.skipDraws ? [{ speed: 8, ablate: true }] : [])];
      for (const v of variants) {
        const { context, page } = await openPage();
        await sc.launch(page);
        const battle = await page.evaluate(describeBattle);
        entry.battle ??= battle;
        if (battle.seed !== 42 || battle.rules !== 'canon_me3') throw new Error(`launched the wrong battle: ${JSON.stringify(battle)}`);
        if (profile.skipDraws) await page.evaluate(skipDraws);
        const prep = await page.evaluate(prepareWindow, { startTick: Math.round(sc.startAt / SIM_DT) });
        await waitForQuiet(quietWait);
        const measured = await withLoad(() => page.evaluate(measureWindow, { seconds, speed: v.speed, ablate: v.ablate }));
        const raw = measured.value;
        await context.close();
        const s = summarise(raw);
        s.prep = prep;
        s.profile = profileId;
        s.otherCores = measured.otherCores;
        s.stealCores = measured.stealCores;
        entry.runs.push({ profile: profileId, summary: s, raw });
        const sp = s.split;
        const pp = s.pausedSplit;
        console.log(
          `  ${runLabel(s).padEnd(10)} T+${fmt(s.simStart, 0)} s (${prep.liveShips} live ships, ${prep.projectiles} rounds in flight): ${fmt(s.fps)} fps · frame ${fmt(s.frameMean)} ms mean / ${fmt(s.frameP95)} p95 / ${fmt(s.frameMax)} max (${s.frames} frames; paused ${fmt(s.pausedFrameMean)} ms) · achieved ${fmt(s.achieved, 2)}× (${fmt(s.simAdvance)} s simulated in ${fmt(s.seconds, 2)} s; dropped ${fmt(s.droppedBudget)} s by the 40 ms budget and ${fmt(s.droppedDtCap)} s by the 0.1 s frame cap) · ${fmt(s.stepsPerFrame)} steps/frame (max ${s.stepsMax}) at ${fmt(s.simMsPerStep, 2)} ms/step · other load ${fmt(s.otherCores, 2)} cores, steal ${fmt(s.stealCores, 2)}`,
        );
        console.log(
          `             per frame ms: sim ${fmt(sp.sim)} (hooks ${fmt(sp.hooks)}: ${fmt(s.eventsPerFrame, 0)} events at ${fmt(s.hookUsPerEvent)} µs) · view.update ${fmt(sp.update)} (processEvents ${fmt(sp.fxEvents)}, effects ${fmt(sp.fxUpdate)}) · view.render ${fmt(sp.render)} · overlay ${fmt(sp.overlay)} · HUD ${fmt(sp.hud)} · other ${fmt(sp.other)} · outside the loop ${fmt(sp.outside)} · loop p95 ${fmt(s.loopP95)}`,
        );
        console.log(
          `             paused frame ms: view.update ${fmt(pp.update)} · view.render ${fmt(pp.render)} · overlay ${fmt(pp.overlay)} · HUD ${fmt(pp.hud)} · outside the loop ${fmt(pp.outside)} · ${fmt(s.pausedDraws, 0)} draws`,
        );
        console.log(
          `             draws ${fmt(s.drawsMean, 0)} mean / ${s.drawsMax} max · effects max: ${s.sparksMax} sparks, ${s.debrisMax} debris, ${s.shieldsMax} barrier shells · heap ${fmt(s.heapStartMB)} MB: +${fmt(s.heapGrowthMB)} MB over the window, +${fmt(s.heapPeakGrowthMB)} MB peak, ${s.heapRetainedMB >= 0 ? '+' : ''}${fmt(s.heapRetainedMB)} MB retained after GC, ${s.gcs} GCs seen`,
        );
      }
    }
    headlessDone = true;
    await browser.close();
  }
  load.end = loadavg();

  // Markdown tables for docs/apex/PLAYBACK_PERF.md.
  const runs = [];
  for (const profileId of profiles) for (const e of results) for (const r of e.runs.filter((x) => x.profile === profileId)) runs.push({ e, s: r.summary, label: PROFILES[profileId].label });
  const frameRows = [
    '| Battle | Profile | Run | FPS | Frame ms mean / p95 | Paused frame ms | Achieved speed | Steps/frame | Sim ms/step | Sim time dropped (s) | Other load (cores) |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...runs.map(({ e, s, label }) => `| ${e.name} | ${label} | ${runLabel(s)} from T+${fmt(s.simStart, 0)} s | ${fmt(s.fps)} | ${fmt(s.frameMean)} / ${fmt(s.frameP95)} | ${fmt(s.pausedFrameMean)} | ${fmt(s.achieved, 2)}× | ${fmt(s.stepsPerFrame)} | ${fmt(s.simMsPerStep, 2)} | ${fmt(s.droppedBudget + s.droppedDtCap)} | ${fmt(s.otherCores, 2)} |`),
  ];
  const splitRows = [
    '| Battle | Profile | Run | Sim (hooks) | view.update (processEvents) | view.render | Overlay | HUD | Outside loop | Draws mean / max | Sparks / debris max | Heap Δ / retained (MB) |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...runs.map(({ e, s, label }) => {
      const sp = s.split;
      return `| ${e.name} | ${label} | ${runLabel(s)} | ${fmt(sp.sim)} (${fmt(sp.hooks)}) | ${fmt(sp.update)} (${fmt(sp.fxEvents)}) | ${fmt(sp.render)} | ${fmt(sp.overlay)} | ${fmt(sp.hud)} | ${fmt(sp.outside)} | ${fmt(s.drawsMean, 0)} / ${s.drawsMax} | ${s.sparksMax} / ${s.debrisMax} | ${fmt(s.heapGrowthMB)} / ${fmt(s.heapRetainedMB)} |`;
    }),
  ];
  const headlessRows = [
    '| Battle | Simulated | Wall | Real-time multiple | ms/step mean / peak 10 s | Events | Result | Other load (cores) |',
    '|---|---:|---:|---:|---:|---:|---|---:|',
    ...results.filter((e) => e.headless).map((e) => {
      const h = e.headless;
      return `| ${e.name} | ${fmt(h.duration)} s | ${fmt(h.wallMs / 1000, 2)} s | ${fmt(h.duration / (h.wallMs / 1000))}× | ${fmt(h.wallMs / h.steps, 2)} / ${fmt(h.peak.msPerStep, 2)} (T+${h.peak.t - 10}–${h.peak.t} s) | ${h.events} | ${h.outcome}: ${h.reason} | ${fmt(h.otherCores, 2)} |`;
    }),
  ];
  console.log(`\nLoad average ${load.start.map((x) => x.toFixed(2)).join(' ')} at start, ${load.end.map((x) => x.toFixed(2)).join(' ')} at end.`);
  console.log('Frames and speed:');
  console.log(frameRows.join('\n'));
  console.log('\nMain-thread milliseconds per frame (means over the window); "Outside loop" is the rest of the frame interval:');
  console.log(splitRows.join('\n'));
  console.log('\nHeadless run to the result in the page:');
  console.log(headlessRows.join('\n'));
  if (errors.length) console.log(`\nPage errors (${errors.length}):\n${[...new Set(errors)].join('\n')}`);
  const json = option('json', '');
  if (json) {
    writeFileSync(json, JSON.stringify({ base, viewport: VIEWPORT, seconds, load, envs, results }, null, 1));
    console.log(`\nRaw frames and summaries written to ${json}`);
  }
}

// Dispatch last: the playback helpers above are module constants.
if (flag('playback')) await playbackBenchmark();
else await lodBenchmark();
