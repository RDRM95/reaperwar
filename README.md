# Mass Effect 3 — Reaper War Simulator

> **Change the variables. Change the war.**

A browser-based, real-time 3D naval warfare simulator set during the Reaper War of 2186. Canon Mass Effect 3 is the default; alternate-universe rule sets are optional and never presented as canon.

**Unofficial, non-commercial fan project.** Mass Effect is a trademark of Electronic Arts / BioWare. No game assets, fonts, models, textures, music or dialogue recordings are used. All ship models are original procedural geometry, all audio is synthesised at runtime, and all text is original.

## Play

- **Live site:** deployed by GitHub Actions to GitHub Pages from the `main` branch at `https://<owner>.github.io/reaperwar/` once Pages is enabled (see *Deployment*).
- **Local:**

```bash
npm install
npm run dev        # http://localhost:5173
```

To play on your own graphics card with the best settings, use the Local Edition below.

## One-click Windows launcher (recommended)

**No Git commands, Node.js installation, or admin rights required.** Download [PLAY-REAPERWAR.cmd](PLAY-REAPERWAR.cmd), save it to your Windows Desktop, and **double-click it**. Keep that file on your Desktop to play again later.

On first run the launcher:

1. Downloads this original `reaperwar` repository to `%LOCALAPPDATA%\ReaperWar\game` (not the separate Codex/sandbox repository).
2. Uses an existing compatible Node.js, or obtains an official portable Node.js LTS ZIP from nodejs.org, checks it against the published SHA-256 manifest, and extracts it only for this game. It does not install Node globally or need administrator privileges.
3. Installs npm dependencies, builds the Local Edition and opens it in its own Chrome/Edge game window using your GPU.

On later double-clicks it checks for the latest `main` commit and updates the local copy if necessary. Your game saves stay in the dedicated `.local-profile` folder and are preserved across updates. When offline it can reuse a previously installed copy. The first download/build requires an internet connection; no remote game server or account is needed for play. Windows may show a security warning for a downloaded unsigned `.cmd`; inspect the launcher source and choose to run it only if you trust this repository.

If setup fails, the command window stays open with the error message. Files are stored under `%LOCALAPPDATA%\ReaperWar`, not a system-wide installation.

## Run it locally on your own GPU (Local Edition)

The web version already draws on your graphics card through WebGL, but a browser tab holds it back: the render resolution is capped, the frame rate is locked to the monitor, and detail distances and effect budgets are tuned for average machines. The Local Edition builds the game on your computer, serves it to that computer only, and opens it in Chrome or Edge with settings meant for a dedicated GPU such as an RTX 5090.

**For the manual Git-based method below, you need:** [Node.js](https://nodejs.org/en/download) 20.19 or newer (on the 22 line, 22.12 or newer; the current LTS is fine), [Git](https://git-scm.com/downloads), and Google Chrome or Microsoft Edge (every Windows 10 and 11 PC has Edge).

**Windows**

1. Install Node.js (LTS) and Git.
2. In a terminal: `git clone https://github.com/<owner>/reaperwar.git`
3. Open the `reaperwar` folder and double-click **`run-local.cmd`**.

The first run installs the dependencies (`npm ci`) and builds the game, which takes a minute or two; after that it starts in seconds. The game opens in its own window. Close the window, or press Ctrl+C in the console, to stop it.

**macOS and Linux**

```bash
git clone https://github.com/<owner>/reaperwar.git
cd reaperwar
./run-local.sh                 # or: npm run local
```

On macOS the browser stays open after its window closes: quit it (⌘Q) or press Ctrl+C in the terminal.

**Updating:** `git pull`, then start it again. The launcher reinstalls the dependencies when `package-lock.json` changed and rebuilds whenever the sources are newer than the last build.

**Options** (after `run-local.cmd`, `./run-local.sh` or `npm run local --`):

| Option | What it does |
| --- | --- |
| `--fullscreen` | Start full screen (F11 toggles it). |
| `--vsync` | Keep the frame rate locked to the monitor's refresh rate: smoother, no tearing, and a cooler, quieter GPU. |
| `--port <n>` | Serve on another port (default 4180). Saves belong to the address, so keep using the port you pick. |
| `--browser <path>` | Use this Chrome, Edge or Chromium executable instead of the one found automatically. |
| `--rebuild` | Rebuild even when the build is up to date. |
| `--gpu-info` | Open `chrome://gpu` on the game's browser profile, with the same flags (works while the game is running). |
| `--no-browser` | Only serve, and print the address and the browser command line to use. |

**What the launcher does**

`scripts/local/launch.mjs` runs `npm ci` when the dependencies are missing or out of date and `npm run build` when `dist/` is missing or older than the sources, serves `dist/` with `scripts/local/serve.mjs` on `http://127.0.0.1:4180/` (loopback only: nothing on your network can reach it, and it needs no extra packages), and starts the browser with these flags:

| Browser flag | Why |
| --- | --- |
| `--app=http://127.0.0.1:4180/?local=1` | A game window without tabs or an address bar; `?local=1` switches the game to the Local Edition. |
| `--user-data-dir=<repository>/.local-profile` | A separate browser profile inside the repository (gitignored), so the flags apply even while your normal browser is open and your own profile, extensions and history are untouched. Local Edition saves live in this profile. |
| `--ignore-gpu-blocklist` | Use the GPU even if its driver is on the browser's blocklist. |
| `--enable-gpu-rasterization` | Draw page content on the GPU. |
| `--enable-zero-copy` | Let rasterisation write straight into GPU memory. |
| `--force-high-performance-gpu` | Pick the dedicated GPU on machines that also have integrated graphics. |
| `--disable-gpu-vsync`, `--disable-frame-rate-limit` | Remove the frame-rate cap (left out with `--vsync`). |
| `--start-fullscreen` | Only with `--fullscreen`. |
| `--no-first-run`, `--no-default-browser-check` | Keep the fresh profile from showing a welcome page or a default-browser prompt. |

**Confirm it runs on your GPU.** Settings → Graphics shows `Local Edition: running on this machine's GPU (…)` with the renderer the browser reports, for example `ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 … Direct3D11 …)`. For the full picture run `run-local.cmd --gpu-info` (or `./run-local.sh --gpu-info`), which opens `chrome://gpu` on the game's own browser profile (Edge shows it as `edge://gpu`): under *Graphics Feature Status*, WebGL and WebGL2 should read *Hardware accelerated*; *GL_RENDERER* should name your card; *Command Line* lists the flags above. If Settings shows `Local Edition: software rendering (…)`, or `chrome://gpu` shows *SwiftShader*, *Software only* or *Microsoft Basic Render Driver*, the GPU is not in use: update the graphics driver, and on a laptop set Chrome or Edge to *High performance* in Windows Settings → System → Display → Graphics.

**What the Local Edition changes compared with the web version**

- **Ultra — local GPU** graphics quality, selected on the first run (change it in Settings; your choice is kept): native resolution (your display's full pixel density, up to 3×, instead of High's 2× cap) with antialiasing, full detail and hull meshes kept 2.5× farther away before ships become points, doubled effect budgets (sparks, tracers, barrier flashes, debris, point-defence lines), maximum anisotropic filtering on the generated planet and sky textures, a larger environment map for hull reflections, and a frames-per-second readout beside the draw-call count on the battle HUD. Ultra can be picked in the web version too.
- **Uncapped frame rate**: the battle view draws as many frames as the GPU can, so a high-refresh monitor is never the limit and the FPS readout shows the real headroom (`--vsync` restores the cap).
- **Cross-origin isolation**: the server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, which unlock `SharedArrayBuffer` for a later multi-threaded simulation.
- The main menu shows *Local Edition* next to the version.

**Large-battle visibility and rendering (web and Local Edition)**

- When more than 64 simulated ships/flights are active, tactical labels become **fleet name + current vessel count**, and the side panels show one selectable row per fleet instead of dozens of individual ship rows. As an engagement shrinks, individual ship details return automatically.
- Zooming in, hovering or selecting a ship preserves its identity and status. Selecting a whole fleet no longer draws thousands of individual targeting lines.
- The far-ship point cloud now grows beyond its former 2,048-vessel limit; distant ships share one GPU draw call rather than being silently omitted.
- At very large ship counts, the camera keeps a bounded set of nearby detailed hulls and renders the rest as points. This controls draw calls without changing combat, AI, losses or replay results.
- These are **rendering/UI optimisations**, not a promise of thousands of fully detailed hull meshes at a fixed frame rate. The single-thread simulation limit below remains.

**What it does not change yet**

- The simulation still runs on one CPU core, on the browser's main thread: very large battles are limited by that core, not by the GPU. Fixing 8× playback and moving the simulation to a worker thread are separate work.
- Battle results are identical at every graphics quality and in both editions: everything above is drawing only.
- Saves are kept per address, so the Local Edition starts with its own saves. Move them with Settings → Export save data (web version) and Import save data (Local Edition).

## What works today (v0.4.0)

- **Galactic campaign**: interactive galaxy map with 15 systems and relay corridors, weekly turns, Reaper offensives and harvest, a ground war per system (ground forces slow the harvest; krogan reinforce Earth and Palaven when the genophage is cured), allied production from intact industry, eight research projects that change fleet technology in engagements, refugee pressure on the Citadel, Council war summits with decisions, political events (indoctrinated officials, shipyard sabotage, Terminus mercenaries, STG intelligence), 2183 world states (Destiny Ascension and Council composition, rachni queen), fleet movement with cooperation constraints, Crucible construction, indoctrination pressure, morale, Reaper strategic assessment, autosave and Load Game. Engagements involving your fleets can be fought in the 3D simulator or auto-resolved; outcomes feed back into the war.
- **Post-war reconstruction** (Cerberus Ascendant, alternate continuity, 2186–2206): quarterly turns, twelve budget programmes, progressive Reaper dismantlement gated by conventional fleet strength and Sol defence, Council and Alliance politics, victory and defeat outcomes. Start it from campaign setup or continue into it after a Cerberus Ascendant campaign victory.
- **Twelve scenarios**: Battle of Earth, Final Battle of Earth (uses a saved campaign's surviving fleets when one exists; the Salarian First Fleet joins when the genophage cure was sabotaged), Defence of Palaven, Fall of Thessia, Defence of Sur'Kesh (a labelled simulation estimate: STG early warning option), Cerberus Intervention (hostile in canon, cooperative in AU timelines), Rannoch Campaign (war with Reaper-upgraded geth, war without upgrades, or peace against the Reapers), Battle of the Citadel (2183, save the Ascension or concentrate on Sovereign), Alliance Fleet Engagement, Prime/Apex Sol Defence, Prime/Apex Palaven Defence, Cerberus Ascendant — Harbinger, plus a **Custom Battle** builder for any combination of Alliance, Turian, Asari, Salarian, Cerberus, Geth, Quarian and Reaper fleets.
- **Real-time 3D battle** with original Alliance (dreadnought, carrier, cruiser, frigate, Normandy-style Thanix frigate, Trident fighter), Turian (dreadnought, cruiser, frigate, interceptor), Asari (Destiny Ascension, dreadnought, cruiser), Cerberus (cruiser, frigate, fighter, AU Black Fleet dreadnought), Geth (dreadnought, cruiser, frigate, fighter), Quarian (liveship, Heavy Fleet warship, Patrol cruiser, fighter) and Reaper (Sovereign-class capital, destroyer, Harbinger) models, a procedural Citadel, Earth/Palaven/Thessia/Rannoch orbital environments, starfield, procedural weapon effects, barrier shimmer, hull damage glow and break-apart destruction.
- **Simulated weapons**: mass accelerators (real projectiles with lead and sweep collision), Thanix streams, Reaper magnetohydrodynamic beams, GARDIAN point defence in heat-limited bursts, disruptor torpedoes with interception and finite magazines (fighters rearm at their carrier). Kinetic barriers, armour with penetration and ablation, hull, subsystem damage, heat.
- **Fleet AI** with per-faction doctrine, formations (six), focus fire, withdrawal, carrier operations.
- **Player command**: attack / advance / hold / defend / withdraw / retreat / escort / intercept, target priorities, formation changes, fighter deploy/recall, focus fire, point-defence mode, selection and right-click attack orders.
- **Seven cameras**: tactical, cinematic director, ship follow, free, projectile, Reaper, command (holographic overlay).
- **Rendering**: original procedural hulls with image-based lighting, distance level of detail (detail meshes and glow sprites drop with range; far ships and fighters collapse into one point cloud), pooled effects and a draw-call counter on the HUD. `npm run perf` benchmarks a 206-ship Final Battle headlessly.
- **Deterministic simulation** with event log, replay (same seed → same battle), pause and 0.25×–8× speed.
- **Timeline rule engine** with eighteen presets and a validated JSON import/export editor: Canon ME3; the alternate universes Prepared Galaxy, Humanity Ascendant, Cerberus Reformed, Reaper Escalation, Prime/Apex (Apex core and Apex legacy) and Cerberus Ascendant; and ten alternate timelines that each diverge at a named event of the trilogy — Sovereign’s Triumph, The Collectors’ Harvest, The Indoctrinated Council, Leviathan’s Bargain, Vigil’s Warning, The Geth–Quarian Concord, The Asari Disclosure, Turian Total War, Leviathan’s Covenant and The Conduit Protocol — plus Custom. Every alternate timeline is labelled ALTERNATE UNIVERSE; where its story fixes a world state (the Destiny Ascension, Rannoch, the Normandy, the genophage), campaign setup and the briefing lock it and say why.
- **Threat to the Reapers**: every built-in timeline carries a measured rating from 1 Negligible to 6 Existential. It is not asserted: `npm run timeline:threat` fights one fixed coalition-versus-Reaper engagement against five Reaper groups of growing size on four seeds under each timeline’s rules and rates index = 50 × (Reaper hull lost + organic survival). The badge on the timelines screen, the briefing and campaign setup shows the tier, the measured losses and survival, and the largest Reaper group the galaxy holds; the Timelines codex category explains the scale ([docs/apex/TIMELINE_THREAT.md](docs/apex/TIMELINE_THREAT.md)).
- **Canon vs AU comparison**: same scenario, fleets and seed under two rule sets, split results table, replay of either side, and a ranked explanation of which modifiers changed the result.
- **Reaper Intelligence** assessment generated from live simulation data.
- **Codex** and **Fleet Database** with per-statistic provenance (canon confirmed / canon inferred / simulation estimate / AU modified).
- **Procedural audio** (Web Audio) with volume and mute; local save of preferences, custom timelines, custom battle and history (IndexedDB with localStorage fallback) with export/import.

- **Saved games**: weekly autosave plus named slots (rename, delete, export/import with the rest of your data); touch pinch zoom in battle.

Not yet implemented: bilateral negotiation with individual governments (diplomacy is summits plus events), simplified mid-range hull meshes and instanced rendering for very large fleets. See [ROADMAP.md](ROADMAP.md).

## Controls

| Input | Action |
| --- | --- |
| Left-click | Select ship (Shift: add to selection) |
| Right-click enemy | Selection (or whole fleet) attacks it |
| Right-click ally | Follow camera on that ship |
| Double-click | Focus camera on ship |
| Drag / wheel / middle-drag | Orbit / zoom / pan (tactical) |
| W A S D, Q E | Pan / rotate (tactical); fly (free, R/F up/down, Shift fast) |
| Space, `[` `]` | Pause, slower / faster |
| 1–7 | Camera modes |
| Tab | Select entire fleet |
| H | Hide HUD |
| Esc | Pause menu |

## Development

```bash
npm run typecheck   # tsc
npm test            # vitest unit + regression tests
npm run build       # production build (dist/)
npm run test:e2e    # Playwright (builds and serves dist, software WebGL)
npm run local       # Local Edition: build if needed, serve on 127.0.0.1:4180, open Chrome or Edge (see above)
npm run sim -- battle_of_earth prime_apex 42 fixed   # headless battle for balance work
```

Architecture, lore sourcing, AU rules, known issues and the changelog are documented in [ARCHITECTURE.md](ARCHITECTURE.md), [LORE_REFERENCE.md](LORE_REFERENCE.md), [AU_RULES.md](AU_RULES.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and [CHANGELOG.md](CHANGELOG.md).

## Deployment

`.github/workflows/deploy.yml` builds with `VITE_BASE=/<repo>/` and publishes `dist/` to GitHub Pages on every push to `main` (or manually via *workflow_dispatch*). One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. `.github/workflows/ci.yml` runs typecheck, unit tests, the production build and the Playwright suite on every branch.
