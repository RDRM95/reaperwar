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

## What works today (vertical slice, v0.1.0)

- **Battle of Earth** and three further scenarios (Alliance Fleet Engagement, Prime/Apex Sol Defence, Cerberus Ascendant — Harbinger), plus a **Custom Battle** builder.
- **Real-time 3D battle** with original Alliance (dreadnought, carrier, cruiser, frigate, Normandy-style Thanix frigate, Trident fighter) and Reaper (Sovereign-class capital, destroyer, Harbinger) models, Earth/Palaven/Thessia/Rannoch orbital environments, starfield, procedural weapon effects, barrier shimmer, hull damage glow and break-apart destruction.
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

Not yet implemented (menu entries are marked as such): the galactic campaign, campaign save/load, and non-Alliance organic factions' hulls. See [ROADMAP.md](ROADMAP.md).

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
