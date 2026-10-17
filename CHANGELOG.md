# Changelog

## 0.8.0 — Saved games and touch zoom

- Saved Games screen: autosaves for the campaign and the post-war plan plus named slots with rename and delete; "Save slot…" from the campaign and post-war screens; slots are included in the Settings export/import.
- Two-finger pinch zoom in the battle view (touch), with pointer-cancel handling.
- Tests: slot save/list/rename/load/delete, overwrite, export round trip; end-to-end slot save and load (77 unit tests).

## 0.7.0 — Finite ammunition and heat-limited point defence

- Disruptor torpedo tubes carry a magazine (8 rounds per tube on frigates and cruisers, 2 per fighter). Empty batteries stop firing and raise an "ammunition depleted" event.
- Fighters that spend their torpedoes fly back to their carrier, reload during 12 seconds of hangar time and relaunch; a lost carrier leaves them fighting on with guns.
- GARDIAN lasers and Reaper anti-fighter emitters fire in heat-limited bursts (10 and 14 shots) followed by a recovery pause, on top of ship-wide heat.
- Battle HUD shows torpedoes remaining, rearming status and point-defence readiness for the selected ship.
- Tests: magazines, depletion events, fighter rearming, burst recovery, determinism (74 unit tests).

## 0.6.0 — Campaign depth

- Ground war: every system tracks ground forces that slow the population harvest (not orbital bombardment of industry), attrit under occupation at a rate scaled by Reaper competence, and recover when safe; liberation clears more Reaper presence where the ground is still held. The genophage cure sends krogan clans to Earth and Palaven (reinforced ground forces); sabotage keeps the Salarian First Fleet instead.
- Research: eight projects (Reaper armour analysis, barrier overcharge, predictive targeting VI, GARDIAN upgrade, ground defence doctrine, indoctrination screening, Crucible schematics, Thanix refit) funded by intact allied industry (Sur'Kesh counts double); completed projects apply as technology overrides to allied fleets in campaign engagements. Player-selected, auto-queued otherwise.
- Refugee pressure on the Citadel: grows with population loss, erodes Council cooperation and Crucible pace, triggers a refugee crisis.
- Political events: Council war summits, indoctrinated officials exposed, shipyard sabotage, Aria's Terminus fleet (estimate), STG intercepts degrading Reaper coordination.
- Campaign UI: refugee gauge, research panel, ground forces per system. Old saves are migrated on load.
- Tests: ground war, research technology in engagements, refugees and events, save migration (69 unit tests).

## 0.5.0 — Salarian Union

- Salarian Union hull family (original models): Union dreadnought, Union cruiser with a four-interceptor bay, STG stealth frigate (lowest signature of any organic hull), Union interceptor; three new weapons; pale green palette and lighting.
- Defence of Sur'Kesh scenario (labelled simulation estimate) with an STG early-warning option, and a Sur'Kesh orbit environment.
- Campaign: Salarian Third Fleet at the Annos Basin; the genophage world state decides whether the First Fleet joins (cure sabotaged) or the Union keeps its fleets at home (cooperation capped). Salarian production and orbital defence classes. Final Battle of Earth gains the same world-state option.
- Custom battles and the fleet database include salarian fleets; codex entry for the Union.
- Tests: hull family and provenance, Sur'Kesh under canon and Prime/Apex, salarian custom battles, genophage world state (65 unit tests).

## 0.4.0 — Post-war reconstruction and the Final Battle of Earth

- Cerberus Ascendant post-war mode (2186–2206, alternate continuity): quarterly turns, twelve budget programmes, eleven tracked metrics, progressive Reaper dismantlement gated by conventional strength and Sol defence, Council and Alliance political events, victory/defeat outcomes, autosave and Load Game. Reachable from campaign setup or after a Cerberus Ascendant campaign victory.
- Final Battle of Earth scenario: Harbinger-led assault on Sol; when a campaign save exists its surviving allied fleets and remaining Reaper strength are used as the order of battle (world state `forces`).
- Post-war balance: a fleet-first plan completes the dismantlement around 2204–2205; an unfocused plan scrapes a late result or fails; a research-heavy plan fails on Council relations.
- Tests: post-war determinism, dismantlement gating, fleet-first victory; Final Battle campaign linkage; end-to-end post-war screen.

## 0.3.0 — Galactic campaign (first build)

- Galaxy map with 15 systems and relay corridors; weekly campaign ticks.
- Reaper strategic AI (target value, competence, risk), allied reinforcement AI, fleet preservation, final push on the Citadel once the Crucible is complete.
- Harvest, occupation, liberation, production from intact industry, Reaper reinforcements, Crucible construction, indoctrination pressure, morale, cooperation constraints on non-Alliance fleets.
- Engagements expand into the battle simulation (with orbital defence groups) and can be fought in 3D or auto-resolved; results feed losses, retreats and control back into the war.
- Campaign setup with timeline and player-dependent world state; autosave; Load Game.
- Campaign tests and end-to-end tests.

## 0.2.0 — Council factions and Cerberus

- Turian Hierarchy, Asari Republics and Cerberus hull families (original procedural models), weapons and ship classes with provenance tags.
- Scenarios: Defence of Palaven (optional Alliance detachment), Fall of Thessia (Destiny Ascension player-dependent), Cerberus Intervention (hostile under canon, cooperative where the Illusive Man is unindoctrinated), Prime/Apex Palaven Defence.
- Custom battle builder accepts any of Alliance, Turian, Asari, Cerberus or Reaper fleets on either side.
- Reaper aperture glow; camera-relative fill light so hulls stay readable against the sun.
- Beam bursts now count toward hit statistics.
- Geth and Quarian hull families (dreadnought with fighter wing, cruiser, frigate, fighter; liveship, Heavy Fleet warship, Patrol cruiser, fighter).
- Rannoch Campaign with player-dependent outcomes (Reaper-upgraded geth via per-fleet technology overrides, baseline geth, or peace against the Reapers) and Battle of the Citadel (2183) with a procedural Citadel and Serpent Nebula environment.
- Codex entries for the new factions, the Destiny Ascension and the 2183 battle; 45 unit tests.

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
