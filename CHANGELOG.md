# Changelog

## 0.1.0 — Vertical slice: Battle of Earth

- Deterministic fixed-step battle simulation with event log and replay.
- Ship and weapon catalogue with provenance tags (canon confirmed / inferred / estimate / AU).
- Damage model: kinetic barriers by damage type, armour with penetration and ablation, hull, subsystems, heat.
- Weapons: mass accelerators (projectiles), Thanix streams, Reaper beams, GARDIAN, disruptor torpedoes with interception.
- Fleet AI with faction doctrines, six formations, player orders and target priorities.
- Three.js renderer: original procedural Alliance and Reaper models, orbital environments, effects, seven camera modes.
- Mass Effect-inspired UI: menu, briefing with world-state choices, battle HUD, results with destruction log, pause menu.
- Timeline rule engine with eight presets, editor, validated JSON import/export.
- Canon vs AU comparison mode with explanation of impactful modifiers.
- Reaper intelligence assessment, codex, fleet database, custom battle builder, settings, local save/export/import.
- Procedural Web Audio sound design.
- Vitest unit/regression suite (41 tests) and Playwright end-to-end suite; GitHub Actions CI and GitHub Pages deployment workflows.
