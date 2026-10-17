# Changelog

## 0.2.0 — Council factions and Cerberus

- Turian Hierarchy, Asari Republics and Cerberus hull families (original procedural models), weapons and ship classes with provenance tags.
- Scenarios: Defence of Palaven (optional Alliance detachment), Fall of Thessia (Destiny Ascension player-dependent), Cerberus Intervention (hostile under canon, cooperative where the Illusive Man is unindoctrinated), Prime/Apex Palaven Defence.
- Custom battle builder accepts any of Alliance, Turian, Asari, Cerberus or Reaper fleets on either side.
- Reaper aperture glow; camera-relative fill light so hulls stay readable against the sun.
- Beam bursts now count toward hit statistics.
- Codex entries for the new factions and the Destiny Ascension; 44 unit tests.

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
