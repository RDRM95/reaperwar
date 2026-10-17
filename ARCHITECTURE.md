# Architecture

TypeScript + Vite + Three.js, no framework. The simulation never imports Three.js and runs headless in Node (tests, balance scripts, comparison mode).

```
src/
  core/         rng (seeded), vec3, provenance tags, storage (IndexedDB/localStorage)
  data/         ship classes, weapons, factions — every stat carries a provenance tag
  timelines/    rule-set schema, presets, apply-rules (effective stats), JSON validation
  simulation/   fixed-step battle sim: battle.ts (loop), ai.ts, damage.ts, formations.ts,
                results.ts, reaperIntel.ts, constants.ts (battlespace compression)
  scenarios/    scenario definitions + builders, custom battle builder, comparison runner
  rendering/    Three.js: ships/ (procedural models), environment, effects, cameras, battleView
  ui/           DOM screens (menu, briefing, HUD, results, comparison, codex, database,
                custom, timelines, settings), tactical overlay canvas, app/controller
  codex/        codex entries with canon / estimate / AU sections
  audio/        procedural Web Audio engine
tests/          vitest (determinism, damage, AU isolation, battle completion, schema)
e2e/            Playwright (startup, full battle, replay, comparison, screens)
scripts/        headless battle runner, visual QA screenshot driver
```

## Simulation

- **Fixed step** of 50 ms (`SIM_DT`). The UI accumulates real time × speed and steps with a 40 ms wall-clock budget per frame so slow machines slow down rather than hang.
- **Determinism**: all randomness flows from one `Rng` seeded by the battle config. Ships are created in config order; events are appended in step order. Same config ⇒ identical event log (tested).
- **Units**: catalogue values are in "nominal km / km·s⁻¹". `BATTLESPACE_SCALE` (0.4) multiplies every distance and speed inside the simulation so that a 2 km Reaper and a 40 km engagement range can share a camera frame. Ship lengths are not scaled. Balance is unaffected because ranges and speeds scale together.
- **Entities**: `ShipState` (hull/armour/barriers/heat/subsystems/weapons/orders), `Projectile` (swept segment–sphere collision each tick), `Missile` (homing, interceptable), beams (per-weapon burst state with damage-over-time).
- **Damage** (`damage.ts`): barriers absorb a damage-type fraction (slug 100 %, Thanix 45 %, Reaper beam 40 %, warhead 25 %, laser 0 %) until exhausted; armour then subtracts `armour × (1.2 − penetration)` (HADES rounds bypass half the armour); the remainder hits hull and can disable a subsystem.
- **AI** (`ai.ts`): fleet level picks a focus target and moves a formation anchor according to orders and doctrine; ship level scores targets (threat, wounded, barriers down, player priority, focus, stickiness) and decides withdrawal; movement goals keep formation slots, harass with frigates under loose formations, and orbit targets with fighters.
- **Rules** (`timelines/rules.ts`): `applyRulesToShip` / `applyRulesToWeapon` turn a `RuleSet` into effective stats, including weapon substitution (hyper-mass accelerator, fleet-wide Thanix). Canon has every multiplier at 1, which the tests assert.

## Rendering

- `BattleView` reads simulation state each frame (interpolating between fixed steps) and reacts to events (muzzle flashes, impacts, deaths). It never writes to the simulation.
- Ship models are built once per class from procedural geometry (`rendering/ships`), merged by material into a few meshes, and cloned per instance. On death the merged parts become debris.
- Effects are pooled: instanced tracers and missiles, cylinder beams, sprite sparks, fresnel barrier shells, instanced debris, point-defence line segments.
- The environment is generated at load time: planet textures via value-noise on a canvas, a fresnel atmosphere shader, a point-sprite starfield and a galaxy band.
- `CameraRig` smooths every mode toward a desired pose, so mode switches transition.

## UI

Plain DOM built with a tiny `el()` helper; screens are functions returning an element. The HUD keeps stable controls and updates in place (keyed ship rows), which matters for hover states and automation. A 2D canvas overlay draws tactical markers above the WebGL view.

## Decisions

- No physics engine: ship motion is kinematic with acceleration and turn-rate limits, which is sufficient for naval-scale behaviour and keeps the sim deterministic and portable.
- Hit-scan beams rather than ray-marched streams keep Reaper weapons both lethal and cheap.
- Replay = re-simulation. Because the sim is deterministic, a replay is bit-identical and costs nothing to store; the exported event log is available for external analysis.
- Comparison mode fixes fleets by default (`fleet_scaling: fixed`) so only technology/doctrine differ between the two runs.
