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

## What works today (v0.4.0)

- **Galactic campaign**: interactive galaxy map with 15 systems and relay corridors, weekly turns, Reaper offensives and harvest, a ground war per system (ground forces slow the harvest; krogan reinforce Earth and Palaven when the genophage is cured), allied production from intact industry, eight research projects that change fleet technology in engagements, refugee pressure on the Citadel, political events (Council summits, indoctrinated officials, shipyard sabotage, Terminus mercenaries, STG intelligence), fleet movement with cooperation constraints, Crucible construction, indoctrination pressure, morale, Reaper strategic assessment, autosave and Load Game. Engagements involving your fleets can be fought in the 3D simulator or auto-resolved; outcomes feed back into the war.
- **Post-war reconstruction** (Cerberus Ascendant, alternate continuity, 2186–2206): quarterly turns, twelve budget programmes, progressive Reaper dismantlement gated by conventional fleet strength and Sol defence, Council and Alliance politics, victory and defeat outcomes. Start it from campaign setup or continue into it after a Cerberus Ascendant campaign victory.
- **Twelve scenarios**: Battle of Earth, Final Battle of Earth (uses a saved campaign's surviving fleets when one exists; the Salarian First Fleet joins when the genophage cure was sabotaged), Defence of Palaven, Fall of Thessia, Defence of Sur'Kesh (a labelled simulation estimate: STG early warning option), Cerberus Intervention (hostile in canon, cooperative in AU timelines), Rannoch Campaign (war with Reaper-upgraded geth, war without upgrades, or peace against the Reapers), Battle of the Citadel (2183, save the Ascension or concentrate on Sovereign), Alliance Fleet Engagement, Prime/Apex Sol Defence, Prime/Apex Palaven Defence, Cerberus Ascendant — Harbinger, plus a **Custom Battle** builder for any combination of Alliance, Turian, Asari, Salarian, Cerberus, Geth, Quarian and Reaper fleets.
- **Real-time 3D battle** with original Alliance (dreadnought, carrier, cruiser, frigate, Normandy-style Thanix frigate, Trident fighter), Turian (dreadnought, cruiser, frigate, interceptor), Asari (Destiny Ascension, dreadnought, cruiser), Cerberus (cruiser, frigate, fighter, AU Black Fleet dreadnought), Geth (dreadnought, cruiser, frigate, fighter), Quarian (liveship, Heavy Fleet warship, Patrol cruiser, fighter) and Reaper (Sovereign-class capital, destroyer, Harbinger) models, a procedural Citadel, Earth/Palaven/Thessia/Rannoch orbital environments, starfield, procedural weapon effects, barrier shimmer, hull damage glow and break-apart destruction.
- **Simulated weapons**: mass accelerators (real projectiles with lead and sweep collision), Thanix streams, Reaper magnetohydrodynamic beams, GARDIAN point defence, disruptor torpedoes with interception. Kinetic barriers, armour with penetration and ablation, hull, subsystem damage, heat.
- **Fleet AI** with per-faction doctrine, formations (six), focus fire, withdrawal, carrier operations.
- **Player command**: attack / advance / hold / defend / withdraw / retreat / escort / intercept, target priorities, formation changes, fighter deploy/recall, focus fire, point-defence mode, selection and right-click attack orders.
- **Seven cameras**: tactical, cinematic director, ship follow, free, projectile, Reaper, command (holographic overlay).
- **Deterministic simulation** with event log, replay (same seed → same battle), pause and 0.25×–8× speed.
- **Timeline rule engine** with eight presets (Canon ME3, Prepared Galaxy, Humanity Ascendant, Cerberus Reformed, Reaper Escalation, Prime/Apex — Successful Refuse, Cerberus Ascendant, Custom) and a validated JSON import/export editor.
- **Canon vs AU comparison**: same scenario, fleets and seed under two rule sets, split results table, replay of either side, and a ranked explanation of which modifiers changed the result.
- **Reaper Intelligence** assessment generated from live simulation data.
- **Codex** and **Fleet Database** with per-statistic provenance (canon confirmed / canon inferred / simulation estimate / AU modified).
- **Procedural audio** (Web Audio) with volume and mute; local save of preferences, custom timelines, custom battle and history (IndexedDB with localStorage fallback) with export/import.

Not yet implemented: negotiated diplomacy (cooperation is driven by events and outcomes), multiple save slots, touch pinch zoom. See [ROADMAP.md](ROADMAP.md).

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
npm run sim -- battle_of_earth prime_apex 42 fixed   # headless battle for balance work
```

Architecture, lore sourcing, AU rules, known issues and the changelog are documented in [ARCHITECTURE.md](ARCHITECTURE.md), [LORE_REFERENCE.md](LORE_REFERENCE.md), [AU_RULES.md](AU_RULES.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and [CHANGELOG.md](CHANGELOG.md).

## Deployment

`.github/workflows/deploy.yml` builds with `VITE_BASE=/<repo>/` and publishes `dist/` to GitHub Pages on every push to `main` (or manually via *workflow_dispatch*). One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. `.github/workflows/ci.yml` runs typecheck, unit tests, the production build and the Playwright suite on every branch.
