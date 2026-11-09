# Playback performance (stage P)

Brief §19.1 asks for an 8× that does not lag, a Fast-forward to result that computes exactly the battle normal playback computes, and an honest HUD that shows the achieved speed when the machine falls short. This file holds the measurements behind that work: **Before** (§2, the 0.12.1 controller, measured on commit `d27997a` before any playback change) with its diagnosis (§3), and **After** (§5, added by the implementation step with the same command).

## 1. Method

### 1.1 Command

```
npm run build
npx vite preview --port 4177 --strictPort &
node scripts/perf.mjs http://localhost:4177 --playback --json <file>
```

`scripts/perf.mjs --playback` was added in this stage; without the flag the script still runs the level-of-detail benchmark with its old output. Options: `--seconds` (window length, default 6), `--only fboe,c300`, `--profiles gpu-light,swiftshader`, `--no-ablate`, `--no-headless`, `--quiet-wait` (§1.6), `--json` (every frame of every window, for later comparison).

### 1.2 Battles and windows

Both battles are canon (`canon_me3`), seed 42, launched through the UI the way the e2e tests do (main menu → screen → `[data-action="launch"]`), with the web build's default graphics: the High preset (MSAA on, pixel ratio 1 at device pixel ratio 1, LOD on, engine glow on), the tactical camera, the tactical overlay on and the full HUD, in a 1600×900 viewport.

| Battle | Order of battle | Window opens at | At the window's start |
| --- | --- | --- | --- |
| Final Battle of Earth | Quick Battle, "Default combined fleet", genophage cured: 125 allied hulls (Alliance, Hierarchy, Republics, Migrant Fleet, geth) vs 21 Reaper hulls; 11 more Reapers arrive at T+90 s | T+30 s (tick 600) | 262 live ships with craft, 454 rounds in flight, 7 ships already destroyed |
| 300 vs 300 custom battle | Custom Battle, deep space, 76 km: 18 dreadnoughts, 6 carriers, 96 cruisers, 180 frigates vs 75 Reaper capitals and 225 destroyers | T+60 s (tick 1200) | 1,039 live ships with craft, 229 rounds in flight, 39 ships already destroyed |

Each window opens while both fleets are firing, in the expensive part of its battle (the step-cost profile is in §2.3). The Final Battle peaks at T+30–40 s; the 300 vs 300 costs 5.8–8.1 ms per step from T+20 s to T+120 s, with its peak at T+30–40 s.

### 1.3 One run

Every run gets a fresh browser context:

1. Launch the battle, pause it, and advance it headlessly to the window's tick (`sim.step()` in the page, as the e2e `advance` hook does). The state at the window's start is therefore identical in every run.
2. Drop the render-side backlog of that advance: the view's and the HUD's queued events, and the hulls destroyed before the window (they are not drawn). Each window shows only the effects it produces itself. This is a conservative choice: in a real session, debris from the previous 12–22 s of real time would still be on screen when the player presses 8×.
3. Compile every effect's shader and upload its textures (one of each effect is spawned at the camera focus, drawn for two paused frames and cleared), as a battle already in progress would have done. Without this step the first running frame in the SwiftShader profile blocked for about 2 s.
4. Paused warm-up (≥ 1 s, ≥ 3 frames), then paused frames (≥ 1 s, ≥ 2 frames): the per-frame cost of drawing this battle while it does not advance.
5. Set the speed, unpause, and let the controller's own `requestAnimationFrame` loop run for 6 s.

Timers are installed from the script; the source is not changed. They wrap `sim.step` (on the prototype), the controller's `sim.onEvent` hook, `view.update`, `view.processEvents`, `effects.update`, `view.render`, `overlay.draw`, `hud.tick`, `hud.refresh`, `hud.showEnd` and the controller's `loop`. The **no-draw** ablation repeats the 8× window with `view.render`, `overlay.draw` and `hud.refresh` stubbed out.

The **headless run** builds a fresh simulation from the launched battle's config in the page and steps it with `while (!sim.finished) sim.step()`, recording the cost of every 200 steps (10 s of simulated time).

### 1.4 Columns

- **FPS, frame ms**: frames of the controller's loop per real second. A frame lasts from its rAF timestamp to the next frame's, so it contains its own loop. p95 is the nearest-rank 95th percentile over the window's frames.
- **Paused frame ms**: the same battle, paused, just before the window (drawing only).
- **Achieved speed**: simulated seconds advanced ÷ real seconds of the window.
- **Sim time dropped**: simulated time the loop was asked for but threw away. Each frame adds min(0.1 s, frame delta) × speed to the accumulator, so the figure is that request minus what was simulated (and minus the change in the accumulator), which is the 40 ms budget's clamp. It also includes whatever the 0.1 s cap cut from the frame delta.
- **Sim (hooks)**: main-thread milliseconds per frame inside `sim.step()`. "Hooks" is the part of it spent in the controller's `onEvent` (view queue, HUD queue, audio), which runs inside `step()` for every event.
- **view.update (processEvents)**: ms per frame in `view.update()`. `processEvents` turns the frame's events into effects.
- **view.render, Overlay, HUD**: ms per frame in `view.render()` (Three.js; its JavaScript, not the GPU's work), `overlay.draw()`, and `hud.tick` + `hud.refresh` + `hud.showEnd`.
- **Outside loop**: the frame's duration minus the loop's own JavaScript. It covers the browser's style, layout, paint and compositing, GC outside script, waiting on the GPU process, and idle time.
- **Draws**: `renderer.info.render.calls` per frame. **Sparks / debris**: live effect objects. Each spark is a `THREE.Sprite` and each debris fragment a `Mesh`, so each is its own draw call.
- **Heap Δ / retained**: `performance.memory.usedJSHeapSize` (precise) at the window's end minus after a forced GC at its start. Retained: after a forced GC at its end. "GCs seen" (in the script's output) counts heap drops of more than 1 MB between frames.
- **Other load**: cores used, during the run, by processes outside the benchmark's own process tree (§1.6).

`performance.now()` is clamped to 0.1 ms here (the page is not cross-origin isolated). Per-frame figures are means over every frame of the window: 73 to 293 frames in the GPU-light profile, but only 7 to 9 in the SwiftShader profile, where p95 is the slowest frame.

### 1.5 Two browser profiles, because this container has no GPU

- **SwiftShader**: the flags of the existing benchmark (`--use-angle=swiftshader`). WebGL, the 2D overlay canvas and the compositor are all rasterised by SwiftShader in the GPU process, at 0.4–1.8 s per frame. Exploratory probes while setting up the profiles (scratch scripts, not part of `perf.mjs`) located that cost. The paused Final Battle ran at 1.5 fps; shrinking the WebGL drawing buffer from 1600×900 to 80×45 raised it only to 2.25 fps; skipping the WebGL draws raised it to 3 fps; moving the 2D canvas and the compositor to software as well raised it to 29 fps. The frame rate in this profile therefore says nothing about a real GPU. Its main-thread split is still valid.
- **GPU-light**: the same browser with `--disable-accelerated-2d-canvas --disable-gpu-compositing`, and the WebGL draw entry points (`drawArrays`, `drawElements` and their instanced forms) replaced by no-ops. Every line of the app's JavaScript still runs, and Three.js still issues and counts every draw call, but nothing is rasterised. The page's main thread therefore paces the frames, as on a machine whose GPU keeps up. The residue is software compositing, which costs this container 20–30 ms per frame even when paused: a paused battle frame takes 32–39 ms, of which 7–16 ms is the loop's own JavaScript (the main menu runs at 60 Hz). On a GPU that would be a few milliseconds, so the GPU-light frame rates are a floor for this CPU, not a prediction for a desktop.

### 1.6 Machine, and a shared machine

The dev container: linux x64, 4 vCPUs (Intel Xeon @ 2.80 GHz), 16 GB, no GPU. Chromium 141.0.7390.37 headless shell (Playwright 1.56.1), node v22.22.0.

Other agents run simulations in this container. During this work they ran `scripts/_fb.ts`, `scripts/_fbpos.ts`, `tools/probe.ts` and `tools/ladder.ts`, together 1–2 cores at times. The script therefore reads `/proc` around every run and reports the cores used by processes outside its own process tree, and before every run it waits, up to `--quiet-wait` seconds (default 600), for that load to drop below a quarter of a core. It reported such load at the start of 5 of run 3's 12 runs and waited 21–108 s each time. Hypervisor steal time is recorded as well from the next run on; a 5 s sample during this work showed about 1 %.

## 2. Before — the 0.12.1 controller (commit `d27997a`, 5 November 2026)

Run 3 of §2.4. Every window ran with at most 0.15 cores of other load, except the Final Battle's 8× no-draw window (0.42). No page errors.

### 2.1 Frames and speed

| Battle | Profile | Run | FPS | Frame ms mean / p95 | Paused frame ms | Achieved speed | Steps/frame | Sim ms/step | Sim time dropped (s) | Other load (cores) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Final Battle of Earth | GPU-light | 1× from T+30 s | 26.8 | 37.3 / 50.0 | 36.9 | 0.99× | 0.7 | 7.50 | 0.0 | 0.02 |
| Final Battle of Earth | GPU-light | 8× from T+30 s | 13.2 | 76.0 / 83.4 | 36.9 | 5.26× | 8.0 | 5.15 | 16.1 | 0.02 |
| Final Battle of Earth | GPU-light | 8× no-draw from T+30 s | 48.4 | 20.6 / 50.0 | 32.3 | 7.78× | 3.2 | 4.22 | 1.2 | 0.42 |
| 300 vs 300 custom battle | GPU-light | 1× from T+60 s | 22.0 | 45.4 / 66.7 | 38.9 | 0.99× | 0.9 | 10.03 | 0.0 | 0.15 |
| 300 vs 300 custom battle | GPU-light | 8× from T+60 s | 12.0 | 83.1 / 100.0 | 38.3 | 3.30× | 5.5 | 8.10 | 28.1 | 0.01 |
| 300 vs 300 custom battle | GPU-light | 8× no-draw from T+60 s | 20.9 | 47.9 / 50.1 | 35.6 | 6.33× | 6.1 | 7.11 | 10.2 | 0.02 |
| Final Battle of Earth | SwiftShader | 1× from T+30 s | 1.4 | 740.7 / 1283.2 | 658.3 | 0.14× | 2.0 | 8.39 | 5.7 | 0.00 |
| Final Battle of Earth | SwiftShader | 8× from T+30 s | 1.4 | 737.0 / 1216.7 | 425.0 | 0.40× | 5.9 | 7.61 | 45.7 | 0.01 |
| 300 vs 300 custom battle | SwiftShader | 1× from T+60 s | 1.3 | 797.6 / 1799.9 | 1241.6 | 0.12× | 1.9 | 13.27 | 5.6 | 0.02 |
| 300 vs 300 custom battle | SwiftShader | 8× from T+60 s | 1.1 | 950.0 / 1633.2 | 925.0 | 0.19× | 3.6 | 12.97 | 57.6 | 0.01 |

### 2.2 Where the frame goes (main-thread ms per frame, means over the window)

| Battle | Profile | Run | Sim (hooks) | view.update (processEvents) | view.render | Overlay | HUD | Outside loop | Draws mean / max | Sparks / debris max | Heap Δ / retained (MB) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Final Battle of Earth | GPU-light | 1× | 5.6 (0.4) | 1.5 (0.2) | 8.0 | 0.8 | 0.2 | 21.1 | 927 / 1063 | 460 / 90 | 26.2 / 2.7 |
| Final Battle of Earth | GPU-light | 8× | 41.2 (1.6) | 2.7 (0.7) | 13.2 | 0.8 | 0.4 | 17.5 | 1273 / 1487 | 802 / 441 | 28.3 / 7.2 |
| Final Battle of Earth | GPU-light | 8× no-draw | 13.5 (0.5) | 1.9 (0.3) | 0.0 | 0.0 | 0.0 | 4.9 | 556 / 556 | 896 / 613 | 14.5 / 6.7 |
| 300 vs 300 custom battle | GPU-light | 1× | 9.0 (0.4) | 2.6 (0.1) | 11.8 | 2.0 | 0.3 | 19.4 | 1156 / 1267 | 196 / 114 | 22.1 / 0.8 |
| 300 vs 300 custom battle | GPU-light | 8× | 44.4 (1.4) | 3.2 (0.4) | 13.1 | 2.0 | 0.6 | 19.6 | 1362 / 1578 | 484 / 391 | 31.5 / 2.3 |
| 300 vs 300 custom battle | GPU-light | 8× no-draw | 43.1 (1.1) | 3.1 (0.3) | 0.0 | 0.0 | 0.0 | 1.4 | 1107 / 1107 | 871 / 968 | 31.0 / 3.7 |
| Final Battle of Earth | SwiftShader | 1× | 16.8 (1.6) | 2.3 (0.5) | 10.4 | 0.9 | 0.5 | 709.5 | 765 / 853 | 315 / 12 | 6.1 / 0.9 |
| Final Battle of Earth | SwiftShader | 8× | 44.8 (1.8) | 4.6 (1.6) | 17.5 | 1.1 | 0.6 | 668.2 | 1164 / 1336 | 768 / 40 | 17.1 / 3.4 |
| 300 vs 300 custom battle | SwiftShader | 1× | 24.6 (0.9) | 4.0 (0.3) | 12.8 | 3.4 | 0.6 | 752.0 | 1068 / 1087 | 41 / 0 | 11.0 / 0.1 |
| 300 vs 300 custom battle | SwiftShader | 8× | 46.3 (1.5) | 3.5 (0.3) | 12.0 | 1.9 | 1.0 | 884.9 | 1072 / 1078 | 23 / 0 | 3.7 / 0.3 |

More from the same run (`--json`):

- **Frames at the budget.** Frames in which the simulation reached the 40 ms budget: Final Battle 8×: 69 of 80; 300 vs 300 8×: 73 of 73; the 300 vs 300 no-draw window: 115 of 126; no frame at 1×.
- **Event rate.** Events per frame at 8×: 228 (Final Battle) and 69 (300 vs 300), against 30 and 9 at 1×.
- **HUD and overlay spikes.** The HUD refresh runs four times a second of real time and costs 1–3.4 ms on the frames where it runs; the overlay's worst frame is 2–6 ms.
- **Garbage collection.** Heap drops of more than 1 MB per 6 s window: 18 at 1× and 35 at 8× in the Final Battle, 12 and 22 in the 300 vs 300.

### 2.3 Headless run to the result (in the page)

| Battle | Simulated | Wall | Real-time multiple | ms/step mean / peak 10 s | Events | Result | Other load (cores) |
|---|---:|---:|---:|---:|---:|---|---:|
| Final Battle of Earth | 194.9 s | 7.21 s | 27.0× | 1.85 / 5.14 (T+30–40 s) | 55823 | victory: Side B fleet destroyed | 0.01 |
| 300 vs 300 custom battle | 212.5 s | 22.09 s | 9.6× | 5.20 / 8.06 (T+30–40 s) | 40569 | defeat: Side A fleet destroyed | 0.02 |

Step cost (ms) per 10 s of simulated time, headless:

| Window from T+ (s) | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160 | 170 | 180 | 190 | 200 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Final Battle of Earth | 1.04 | 1.93 | 4.73 | 5.14 | 3.96 | 2.47 | 2.32 | 1.45 | 0.85 | 0.89 | 0.91 | 1.00 | 1.11 | 1.80 | 2.18 | 1.48 | 1.29 | 0.62 | 0.58 | | |
| 300 vs 300 | 5.24 | 6.15 | 7.19 | 8.06 | 7.60 | 8.03 | 6.87 | 6.30 | 6.55 | 5.83 | 6.32 | 5.75 | 5.90 | 4.57 | 3.72 | 3.60 | 3.18 | 2.74 | 2.48 | 2.19 | 1.72 |

The page computes the same battles as Node. Built in Node from the same inputs (the scenario's `build` with seed 42; `buildCustomBattle` with the custom screen's settings) and run with `node --import tsx/esm`, the two battles end in the same result at the same simulated time with the same event counts (194.9 s and 55,823 events; 212.5 s and 40,569 events), in 8.0 s and 22.4 s of wall time.

### 2.4 Run-to-run variation

The GPU-light profile was measured three times on the same build. Run 3 is §2.1–§2.3. Run 2's 300-vs-300 part probably overlapped with CORE's `scripts/_fb.ts`, seen running as it ended; runs 1 and 2 predate the load accounting.

| Battle | Measure | Run 1 | Run 2 | Run 3 |
| --- | --- | ---: | ---: | ---: |
| Final Battle of Earth | headless wall (ms/step) | 7.12 s (1.83) | 7.00 s (1.80) | 7.21 s (1.85) |
| Final Battle of Earth | 1×: fps / achieved | 30.1 / 0.99× | 27.6 / 0.99× | 26.8 / 0.99× |
| Final Battle of Earth | 8×: fps / achieved / ms per step in the loop | 15.5 / 6.49× / 4.16 | 14.8 / 6.11× / 4.39 | 13.2 / 5.26× / 5.15 |
| Final Battle of Earth | 8× no-draw: fps / achieved | 54.0 / 7.94× | 51.5 / 7.82× | 48.4 / 7.78× |
| 300 vs 300 | headless wall (ms/step) | 19.87 s (4.68) | 21.19 s (4.99) | 22.09 s (5.20) |
| 300 vs 300 | 1×: fps / achieved | 27.1 / 1.00× | 21.0 / 0.99× | 22.0 / 0.99× |
| 300 vs 300 | 8×: fps / achieved / ms per step in the loop | 12.6 / 3.88× / 7.08 | 11.4 / 2.70× / 9.58 | 12.0 / 3.30× / 8.10 |
| 300 vs 300 | 8× no-draw: fps / achieved | 20.7 / 6.19× | 19.8 / 4.77× | 20.9 / 6.33× |

When the simulation is the binding cost, the achieved speed at 8× follows the step cost, and the headless control itself moved by up to 11 % between runs (19.9 to 22.1 s). A Before/After comparison is therefore only meaningful within a few percent if both are measured in the same session: build `d27997a` in a scratch worktree and serve it on another port next to the new build.

## 3. Diagnosis: what costs what at 8×

The figures are from §2 (GPU-light unless stated). File and line references are to `d27997a`.

1. **At 8× the frame is mostly simulation, and for the big battle 8× needs more than a whole core.**
   - **Required throughput.** 8× is 160 fixed steps (`SIM_DT` 0.05 s) per real second. In the windows, a step costs 5.15 ms inside the loop (Final Battle, T+30–62 s) and 8.10 ms (300 vs 300, T+60–80 s). That is 820 ms and 1,300 ms of main-thread time per real second.
   - **Share of the frame.** The simulation takes 41.2 ms of the Final Battle's 76 ms frame (54 %) and 44.4 ms of the 300-vs-300's 83 ms frame (53 %). The 3D view's JavaScript takes 13 ms (16–17 %), and the browser's own work outside the loop 17.5–19.6 ms (23–24 %).
   - **Without drawing.** The no-draw ablation removes all drawing. The Final Battle then reaches 7.78× at 48 fps, so in its busiest minute 8× needs rendering to get out of the way, not a faster simulation.
   - **The 300 vs 300 cannot reach 8× at all.** Without drawing it reaches 6.33× (115 of 126 frames still at the budget). Even headless, with nothing else on the thread, it needs more than 6.25 ms per step (slower than 8× real time) in every 10 s from T+20 to T+90 s, at worst 8.06 ms (6.2×).
   - **Consequence.** No rendering change can deliver 8× for this battle on this CPU. This is the case the brief's honest framing is written for: the HUD must show the achieved speed.
2. **The simulation and the drawing share one rAF callback, with a 40 ms simulation budget** (`src/ui/app.ts:233–249`).
   - **Mechanism.** At 8× every frame owes the simulation 8 × its own length. The loop steps until it has caught up or 40 ms have passed (the check follows each step, so up to 40 ms plus one step: 48–55 ms at worst in these windows), and only then updates, renders, draws the overlay and ticks the HUD.
   - **Result.** An 8× frame is therefore about 40 ms of simulation, plus about 17–19 ms of the app's other JavaScript, plus the browser's share: 76–83 ms, 12–13 fps, p95 83–100 ms, worst 133 ms. That is the stutter the owner reports.
   - **The budget is not a frame budget.** 40 ms is 2.4 frames at 60 Hz. It was written to stop a slow machine from hanging (the comment at `app.ts:235`), not to keep frames smooth.
   - **At 1× none of this happens.** The simulation is 0.7–0.9 steps (5.6–9.0 ms) per frame, and the frame rate is set by this container's compositing (the paused frame is 37–39 ms already).
3. **The accumulator feeds back on itself.**
   - **The loop.** `dtReal` (`app.ts:230`) is the length of the previous frame, so a long frame owes more steps to the next, which makes that one long too.
   - **Without the budget.** With a non-simulation cost of F ms per frame and c ms per step, the 8× frame settles at F ÷ (1 − 8c/50). For the Final Battle (F ≈ 35 ms, c ≈ 5.15 ms) that is about 200 ms. For c ≥ 6.25 ms (the 300 vs 300) there is no steady state at all.
   - **With the budget.** Let B be the simulation's milliseconds per frame, about 40 once the budget binds. The frame is F + B and the achieved speed is (B ÷ c) × 50 ÷ (F + B). This matches the measurement: (44.4 ÷ 8.10) × 50 ÷ 83.1 = 3.30× for the 300 vs 300, and (41.2 ÷ 5.15) × 50 ÷ 76.0 = 5.26× for the Final Battle.
4. **The backlog is thrown away silently, and the HUD still says 8×.**
   - **The clamp.** When the budget trips, `this.accumulator = Math.min(this.accumulator, SIM_DT)` (`app.ts:242`) discards everything still owed: 16.1 s of simulated time in the Final Battle's 6 s window and 28.1 s in the 300 vs 300's (of 48 s requested).
   - **The label.** The HUD clock row reads "8× SPEED" throughout (`src/ui/screens/hud.ts:317`).
   - **The second cap.** `Math.min(0.1, …)` on the frame delta (`app.ts:230`) discards whatever a frame longer than 100 ms owed. In the SwiftShader profile, the two caps together discarded 45.7 s of the 48.4 s requested (Final Battle) and 57.6 s of 58.9 s (300 vs 300) per 8× window, for 0.40× and 0.19× achieved.
5. **Effects grow with the speed, because they live in real seconds while their causes arrive in simulated seconds.**
   - **Spawning.** `processEvents` (`src/rendering/battleView.ts:393`) turns every event of every step run in the frame into effects. That is a muzzle flash for each big-gun shot and 35 % of small-gun shots, an impact (sparks, smoke, a barrier shell) for each hit, and a death sequence for each loss. 8× brings 228 events per frame against 30 at 1×.
   - **Ageing.** `view.update(dtReal)` ages the effects by real time (`battleView.ts:324`), so eight times as many are alive at once.
   - **One draw call each.** Each spark is its own `THREE.Sprite` (`src/rendering/effects.ts:173–201`), and so its own draw call. In the Final Battle, sparks reach 802–896 of their 900 cap and barrier shells 57–60 of their 60 (each shell a `Mesh` with a cloned `ShaderMaterial`, `effects.ts:215`).
   - **Debris has no overall cap.** It is up to 40 fragments per explosion plus the hull's own pieces, alive for 12–22 s (`effects.ts:238–289`). It climbs from 90 to 441 (Final Battle) and from 114 to 391 (300 vs 300) within one 6 s window, and to 613 and 968 when the no-draw run simulates more.
   - **The cost.** Draw calls rise from 927 to 1,273 (+37 %) and from 1,156 to 1,362 (+18 %), and `view.render`'s JavaScript from 8.0 to 13.2 ms and from 11.8 to 13.1 ms. The no-draw run's debris count shows what longer 8× playback accumulates.
6. **Per-frame work that does not depend on speed is still paid every frame.** It is small, but at 8× every millisecond of it is a millisecond the simulation's budget cannot have.
   - **`view.update` outside `processEvents`: 1.3–2.8 ms.** It places every ship and applies its level of detail, traverses every damage-tinted hull's meshes every frame (`battleView.ts:286`), and scans all ships again for active beams (`battleView.ts:305`) and for the camera's fleet centre (`sideCentre`).
   - **Overlay: 0.8–2.0 ms.** It projects every live ship and strokes a path per marker (`src/ui/overlay.ts:50–58`).
   - **HUD refresh: 1–3.4 ms on the frames where it runs**, four times a second. It filters and sorts both fleet lists and rebuilds the target and intelligence panels, including `assessReapers` (`hud.ts:211–325`).
7. **The controller's event hooks are cheap.** `onEvent` (view queue, HUD queue, audio with camera distance; `app.ts:94–99`, `184–226`) costs 1.4–1.6 ms per frame at 8×: about 7 µs per event in the Final Battle, at 228 events per frame. The audio engine throttles itself to 11 one-shots per 100 ms (`src/audio/engine.ts:124–135`).
8. **Garbage collection.** It doubles at 8× (35 against 18 collections per window in the Final Battle), and the retained heap grows 2.7–2.9× faster (+7.2 MB against +2.7 MB; +2.3 MB against +0.8 MB). The retained part is mostly the event log: `sim.events` keeps every event by design (55,823 for the whole Final Battle) and grows with simulated time. The churn comes from per-frame allocations in the view:
   - **View:** a tracer object for every round in flight (`battleView.ts:301`; 430–520 rounds in the Final Battle's windows), new `Vector3`s for every beam, point-defence flash and spawned effect (`battleView.ts:304–323`), and three new arrays in every `effects.update` (`effects.ts:405+`).
   - **Overlay:** a projection object and an entry per visible ship.
   - **Effect on the step.** Collections land in whatever is running. A step costs 11–48 % more inside the loop than headless over the same stretch: Final Battle 1× 7.50 against 5.14 ms; 8× 5.15 against 3.47 ms; 300 vs 300 8× 8.10 against 6.59 ms. In the SwiftShader profile it costs 48–93 % more, where the GPU process occupies two of the four cores. This is the price of interleaving the simulation with rendering and its garbage.
9. **Fast-forward to result is a matter of time, not rendering.**
   - **Duration.** In the page, the whole Final Battle runs in 7.2 s (27× real time) and the 300 vs 300 in 22.1 s (9.6×), with a step cost that varies 0.6–5.1 ms and 1.7–8.1 ms over each battle (§2.3).
   - **Slicing.** A single blocking loop would freeze the page for that long. Fast-forward must step in time slices and yield between them, with progress and cancel. Even then it is bound by the headless rate: from the 300 vs 300's T+60 s, about 14 s on this CPU.
10. **When the GPU paces the frames, the main thread idles and the simulation starves** (SwiftShader profile).
    - **What happens.** Frames are 0.74–0.95 s apart while the loop's JavaScript is 31–69 ms, so the main thread is idle 91–96 % of the time. Yet the simulation gets at most the 40 ms budget per frame, and at most 0.1 s × speed of simulated time per frame: 0.19–0.40× achieved at "8×".
    - **Wider relevance.** A weak GPU drawing a big battle is the same case on a smaller scale.
    - **Implication for the budget.** A per-frame budget computed only from "16.7 ms minus the measured render and UI time" would starve the simulation further here. The useful quantity is the measured frame interval minus the main thread's own work.

## 4. What this means for the implementation

- **Keep the simulation's share of a frame bounded, carry a bounded backlog instead of dropping it silently, and show the achieved speed** ("8× · achieved 3.3×"). On this CPU and GPU-light profile, "smooth" and "8×" cannot both hold for these battles; the choice between them must be visible, not silent.
  - **The trade-off in numbers.** For example, a 14 ms ceiling at 30 fps is 420 ms of simulation per second: roughly 4× for the Final Battle in its busiest minute and 2.6× for the 300 vs 300, against today's 5.3× and 3.3× at 12–13 fps.
  - **When the GPU paces the frames,** let the budget grow into the idle time (finding 10).
- **Effects at ≥ 4×.** Batch per rendered frame: the newest events per ship, merged impacts, the rest counted. Give debris an overall cap. The effects' real-time lifetimes are right for the eye; their count is what must be bounded.
- **Overlay and HUD at high speed.** Throttle the overlay (30 Hz) and the HUD's event feed. Each saves 1–2 ms per frame here: small against the simulation, but a share of the frame the simulation can use.
- **Fast-forward to result** is time-sliced stepping with no rendering. Its speed is the headless rate of §2.3.
- **Render-side randomness.** `Math.random()` in `processEvents` (the small-gun flash thinning, `battleView.ts:407`), in the dying-ship secondaries (`battleView.ts:361–362`), in the cinematic shot picks (`battleView.ts:586–589`) and in camera shake (`src/rendering/cameras.ts:232`) is render-only. The simulation reads no wall clock and no `Math.random` (checked in `src/simulation`, `src/data`, `src/timelines`, `src/scenarios`, `src/core`). Under the playback rule, though, these should draw from a seeded render-side `Rng`, as `EffectsSystem` already does with `Rng('fx')`.
- **Re-measuring.** Use the same command. Check the headless control (§2.4) and the other-load column before comparing.

No simulation change is needed for this workstream. The simulation's own cost per step (finding 1) belongs to the extreme-scale programme (brief §17).

## 5. After — the stage P playback controller (commit `b5821ff`, 9 November 2026)

Measured 9 Nov 14:29–14:41 UTC in one session with the same command on both builds: Before = `d27997a` built in a scratch worktree and served on port 4176, After = `b5821ff` on port 4177 (`node scripts/perf.mjs http://localhost:<port> --playback --quiet-wait 120`, GPU-light and SwiftShader profiles, 6 s windows). Other load stayed below 0.06 cores for every run except the Before no-draw run of the Final Battle (1.36 cores). The two builds do not simulate the same battles: `b5821ff` carries the simulation of releases 0.12.2–0.12.4 (named vessels, the drive attack, the distant layer, the 3D formations fix, the Oculus screens), so the Final Battle lasts 334 s instead of 195 s and is in a quieter phase at T+30 s (0 rounds in flight against 454), and the 300 vs 300 battle costs 2.5× more per simulated second headless (11.73 against 4.70 ms a step). The headless column therefore compares simulations, not controllers; the controller comparison is in the frame rate, the frame time, the steps a frame and the achieved speed at a given step cost.

### 5.1 Before and After, GPU-light profile (the main thread paces the frames)

| Battle | Run | Before fps · frame ms mean / p95 | After fps · frame ms mean / p95 | Before achieved (sim s dropped) | After achieved (sim s dropped) | Before steps/frame · ms/step | After steps/frame · ms/step |
|---|---|---:|---:|---:|---:|---:|---:|
| Final Battle of Earth | 1× | 27.1 · 36.9 / 50.1 | 30.8 · 32.4 / 50.1 | 1.00× (0.0) | 1.00× (0.0) | 0.7 · 7.60 | 0.7 · 3.24 |
| Final Battle of Earth | 8× | 13.1 · 76.5 / 100.0 | 29.9 · 33.4 / 50.0 | 5.38× (15.5) | 4.44× (21.0) | 8.2 · 4.74 | 3.0 · 3.03 |
| Final Battle of Earth | 8× no-draw | 52.9 · 18.9 / 33.4 | 59.7 · 16.8 / 16.8 | 7.92× (0.6) | 6.76× (7.1) | 3.0 · 3.71 | 2.3 · 3.89 |
| 300 vs 300 | 1× | 26.9 · 37.2 / 50.1 | 25.2 · 39.6 / 50.1 | 0.99× (0.0) | 1.07× (0.0) | 0.7 · 8.33 | 0.8 · 15.93 |
| 300 vs 300 | 8× | 11.6 · 86.1 / 100.1 | 21.5 · 46.5 / 66.7 | 3.16× (28.9) | 1.07× (41.4) | 5.5 · 8.03 | 1.0 · 19.61 |
| 300 vs 300 | 8× no-draw | 24.7 · 40.5 / 50.1 | 50.4 · 19.9 / 33.4 | 6.45× (9.5) | 2.52× (32.7) | 5.2 · 6.84 | 1.0 · 16.22 |

Main-thread milliseconds a frame at 8×, GPU-light (sim · view.update · view.render · overlay · HUD · outside the loop): Final Battle Before 39.0 · 2.8 · 12.4 · 0.8 · 0.5 · 20.9, After 9.0 · 0.6 · 4.6 · 0.4 · 0.1 · 18.5; 300 vs 300 Before 43.8 · 3.6 · 13.6 · 2.0 · 0.7 · 22.2, After 19.6 · 2.4 · 5.0 · 0.8 · 0.5 · 17.6. Heap retained after GC over the 8× window: Before 7.1 and 2.4 MB, After 0.7 and 0.9 MB (the GC count a window rose, 56 against 34 on the Final Battle; not investigated).

Headless run to the result: Final Battle 194.9 s simulated in 7.21 s (27.0×, 1.85 ms a step) Before against 333.8 s in 20.28 s (16.5×, 3.04 ms a step) After; 300 vs 300 212.5 s in 19.97 s (10.6×, 4.70 ms a step) against 179.0 s in 41.97 s (4.3×, 11.73 ms a step).

### 5.2 SwiftShader profile (everything rasterised in software, about a second a frame)

| Battle | Run | Before fps · achieved (sim s dropped) | After fps · achieved (sim s dropped) | After steps/frame · budget mean |
|---|---|---:|---:|---:|
| Final Battle of Earth | 1× | 1.6 · 0.15× (5.4) | 1.5 · 1.04× (0.3) | 13.9 · 222 ms |
| Final Battle of Earth | 8× | 1.2 · 0.32× (49.3) | 1.2 · 3.40× (30.2) | 58.3 · 183 ms |
| 300 vs 300 | 1× | 1.2 · 0.11× (5.7) | 0.7 · 0.51× (2.4) | 14.4 · 244 ms |
| 300 vs 300 | 8× | 1.0 · 0.22× (60.0) | 0.8 · 0.44× (48.2) | 11.2 · 246 ms |

### 5.3 What the numbers say

1. **The frame rate no longer collapses at 8×.** Before, 8× meant 76–86 ms frames (13.1 and 11.6 fps): the controller spent up to its fixed 40 ms budget on simulation every frame. After, the adaptive budget keeps the Final Battle at 29.9 fps (33 ms frames, p95 50 ms, the same as at 1×) and the 300 vs 300 battle at 21.5 fps (46.5 ms, p95 67 ms): the frame time at 8× is within 1.2× of the 1× frame time, against 2.1–2.3× Before.
2. **Nothing is dropped silently.** Every run reports what the clock requested, ran and shed, and the HUD shows the achieved speed (brief §19.1). At 8× the Final Battle achieves 4.44× (Before 5.38× at twice the frame time).
3. **Slow machines keep real time.** Under SwiftShader (0.7–1.5 fps) the 0.12.1 controller's frame-delta cap made 1× run at 0.11–0.15× real time, in slow motion. The playback clock runs 14 steps a frame when a frame takes 670 ms and holds 1.04× on the Final Battle; the 300 vs 300 battle reaches 0.51× because a step there costs 15.7 ms and 14 of them already fill the 244 ms paced budget.
4. **Heavy battles at 8×: throughput lost to the frame-time ceiling (finding P-A1, for the fix round).** When one step costs more than the budget (300 vs 300: 15.9–19.6 ms a step against a budget of 10–14 ms), the clock runs exactly one step a frame (the first owed tick always runs) and the achieved speed becomes fps × 0.05 s: 1.07× at 8× (Before 3.16× at 11.6 fps) and 2.52× with drawing stubbed out (Before 6.45×). A player who asks for 8× on a 600-hull battle gets real time with a smooth picture and an honest readout, which is not what they asked for. The FAST_SPEED ceiling ("a frame stays near the display's frame time") should give way to a frame-rate floor when the requested speed is high: at 4× and above let the budget grow until the frame rate would fall to about 20 fps (budget ≈ 50 ms − the UI cost), which on this battle gives two steps a frame (about 2×) at 20 fps and changes nothing on the Final Battle (3 ms a step). Fast-forward to result stays the way to skip ahead.
5. **The simulation itself got dearer between the builds**, outside this workstream: headless 300 vs 300 went from 4.70 to 11.73 ms a step (10.6× to 4.3× real time) with the simulation of 0.12.2–0.12.4 running on 1,000 live ships. That cost a step belongs to the extreme-scale programme (brief §17) and is what caps the achieved speed in every row above.

## 6. The worker seam (brief §19.1 "Web Worker where beneficial"; §17.2 item 2)

### 6.1 What exists

`src/ui/simDriver.ts` defines `SimDriver`, the only way the controller, the playback clock and Fast-forward to result reach the simulation: `step(n)`, `finished`, `result`, `time`, `tick`, `events` (the whole log) and `drain()` (the events since the last drain, in order). Its one implementation, `LocalSimDriver`, runs the simulation on the main thread: `step(n)` is a loop of `sim.step()`, and `drain()` reads the simulation's own event log from a cursor. The controller no longer hooks `sim.onEvent`: it drains once per frame and hands the events to the view, the HUD and the audio. Every event is plain JSON already (brief §17, CORE's T15 seam), so a worker could stream them back unchanged.

### 6.2 Why the live worker waits for the snapshot protocol

Stepping and events are the easy half. The other half is everything the main thread reads from the live simulation every frame:

- **The view** reads every ship's position, previous position, heading, velocity, hull, barriers and subsystems, every projectile, missile, beam and point-defence flash, and the fleets' headings (`BattleView.update`, the camera paths, picking).
- **The overlay and the HUD** read the same ships again, their targets and orders, and `assessReapers` walks the whole battle four times a second.
- **Player input** writes into the simulation between ticks: `issueOrders`, `orderShipsAttack`, the volley and HADES specials.

In a worker, each of those reads becomes a copy that crosses the thread boundary every frame, and each write becomes a message applied at a tick boundary. At the scale this stage measured (1,039 live ships with craft and 229 rounds in flight in the 300 vs 300 at T+60 s), a structured clone of the ship objects every frame would cost more main-thread time than it saves. It needs exactly what the extreme-scale programme specifies in §17.2 item 2: typed-array snapshots (transferable or in a `SharedArrayBuffer`), a versioned schema, and a main-thread view that renders from a snapshot instead of from `BattleSimulation`. Player orders must also arrive at a known tick for the result to stay deterministic. That is the tick-stamped order log of §16.3, which CORE adds by T18 (INTEGRATION_NOTES.md). Building half of that protocol here, for one consumer, would only fix a schema before the programme that owns it has designed it. So the seam is defined now, and the live implementation is left to §17.2.

### 6.3 What a worker would and would not buy

**It would buy:**

- **A free main thread during Fast-forward.** Today the run is time-sliced: 24 ms of stepping, then a yield, so input and the progress display get a turn at least every ~25 ms. In a worker the main thread would not be blocked at all.
- **A higher ceiling for 8× during normal playback.** The simulation would run on its own core in parallel with rendering, instead of sharing each frame with the render and UI work. The ceiling would become one whole core: 1,000 ms of simulation per second instead of the frame budget. From the step costs of §2.3, that is enough for the Final Battle's busiest minute at 8× (5.14 ms per tick × 160 ticks per second = 820 ms per second). It is not enough for the 300 vs 300 (6.2× at its 8.06 ms peak), and a weaker CPU reaches the same wall sooner.
- **Smoothness independent of the battle's size.** A slow tick would delay the next snapshot, not the next frame.

**It would not buy:**

- **A faster Fast-forward.** A battle is one deterministic sequence of ticks, each depending on the last. It cannot be split across workers without changing the simulation, which the brief rules out (no approximation, no change to random-number generation). Fast-forward to result is therefore bound by the headless step rate in a worker as on the main thread: 7.2 s for the Final Battle and 22.1 s for the 300 vs 300 on this CPU (§2.3). Because the in-thread Fast-forward renders nothing between its slices, it already runs close to that rate (§5).
- **Cheaper ticks.** Eight times as many ticks still cost eight times the simulation CPU (brief §19.1). The tick cost belongs to the extreme-scale programme's spatial partitioning and multi-scale model (§17.2 items 1, 3 and 5).
- **Anything without the snapshot copy.** Its per-frame cost is new work that the in-thread view does not pay today.
