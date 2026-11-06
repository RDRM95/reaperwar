# Changelog

## 0.12.4 — Readable battles: labels that never pile up

- **No overlapping labels.** Ship names are placed in priority order — your selection and the ship under the cursor, flagships and named ships, the followed ship, capitals, damaged hulls, then the rest — and a name that would overlap another, cover a HUD panel or leave the screen is skipped. Every ship keeps its marker; names hold their place between frames instead of jumping.
- **Battlegroup and fleet labels.** When a battlegroup crowds together on screen it gets one label, such as "SSV Fuji group · 10" or "RC-01 group · 3"; when a whole fleet crowds, "Geth fleet · 21/21". Zooming in brings the individual names back. Two-ship groups always keep both names.
- **Large-battle panels.** Above 48 ships per side (Settings: 24 to 128, or never) the fleet panels list fleets with live and deployed counts, expandable to battlegroups and ships; clicking selects, double-clicking focuses the camera, right-clicking a hostile row attacks it.
- **O toggles the tactical overlay** independently of H, so a recording without the HUD can keep the markers, or a full HUD can hide them; the pause menu has the same switch.
- Health bars show for named ships, the selection and the command view, instead of a stack of bars on every hull.
- Release gate: typecheck clean; 503 unit tests; build clean; 14/14 end-to-end tests (new: no overlapping labels in the Final Battle, fleet rows, the overlay toggle); screenshots inspected. Battle results are unchanged (the browser-equals-Node seed-42 test still passes).

## 0.12.3 — Battlegroups instead of rows, free camera

- **Battlegroup formations.** Every fleet deploys as battlegroups: each capital leads its own escorts in a loose 3D cluster, the groups stand in staggered echelons in depth and height, and seeded variation means no ships line up in rows or columns. Screens fly ahead of their group, carriers behind and above; Reapers fly as capital-led clusters with their destroyers. Capitals keep at least three of their own lengths apart, and groups keep enough room for a camera to tell them apart.
- **Rational movement.** Battlegroups close intact on converging arcs, avoid each other and keep station on their leader. Ships moving up advance in lanes instead of crowding one spot.
- **No idling at the back.** A ship with nothing in reach while its fleet is engaged moves up: it fills gaps left by losses, backs up damaged or outnumbered allies, or closes to its own weapon range. Capitals hold their standoff band; only Hold and Defend orders keep ships back; Reapers never idle once engaged.
- **More room.** Fleets start 1.6 times further apart, with arrival times and time limits scaled to match. (The codex-scale distances of the pacing plan come with the next simulation pass.)
- **Free camera.** Dragging or scrolling in any director view (cinematic, projectile, Reaper, command, shot list) continues as a free orbit from where the camera is; picking a camera mode hands control back. The follow camera pulls back to the whole battle. Fixed: the HUD layer had been swallowing mouse drags and the wheel over the 3D view, so the camera could not be rotated or zoomed with the mouse at all.
- **Determinism:** the browser and Node now play the same battle bit for bit (an engine-dependent maths path is gone).
- Release gate: typecheck clean; 488 unit tests in 40 files (new: the battlegroup suite and camera control); build clean; 12/12 end-to-end tests (new: real mouse camera control, browser-equals-Node determinism); screenshots inspected. Canon and Apex balance keep their character; each re-measured test bound is listed with its reason in the commit history.

Known limitations: name labels overlap inside dense battlegroups (the HUD simplification for large battles comes with the HUD work); seen from far away, the Final Battle's mid-fight still converges into a dense melee until the codex-scale distances land; new hull classes still use placeholder models; 8× playback still lags on large battles.

## 0.12.2 — Named fleets, the Black Fleet's drive attack, the distant battle

- **Every ship has a name.** Organic hulls carry faction-fitting names from original lists (Alliance, turian, asari, salarian, quarian, geth and Cerberus conventions; Roman numerals when a list runs out; canon names such as the Normandy stay unique). Unnamed Reapers carry tracking designations, RC-nn for capitals and RD-nn for destroyers, in the fleet lists, labels and logs.
- **Black Fleet drive attack (Apex timelines).** Cerberus dreadnoughts can commit to a drive run against a Reaper capital; it is rare, takes a long commitment and can be intercepted.
- **The distant battle.** A statistical model of the fighting beyond the simulated hulls, kept separate from the battle's own result.
- **Fix:** an intercepted or missed HADES penetrator no longer arms its nuclear warhead.
- Release gate: typecheck clean; 423 unit tests in 38 files; build clean; 10/10 end-to-end tests (one test updated to select a Reaper destroyer by its new RD designation); screenshots inspected, no page errors.

Known limitations: new hull classes still use placeholder models; 8× playback still lags on large battles (the fix is in progress); the combat-scale and pacing change is planned and lands with the next simulation pass.

## 0.12.1 — Local Edition, ten new timelines, Oculus drones and the Reaper AI

### Local Edition
- **Local Edition: play on your own GPU.** `run-local.cmd` (Windows) or `./run-local.sh` / `npm run local` (macOS, Linux) builds the game when needed, serves it to this machine only with cross-origin isolation, and opens Chrome or Edge as a game window on a dedicated profile with GPU flags and no frame-rate cap (`--vsync`, `--fullscreen`, `--gpu-info`, `--port`, `--browser`, `--no-browser`). New **Ultra — local GPU** graphics quality, the Local Edition's first-run default: native resolution up to 3× pixel density, 2.5× level-of-detail distances, doubled effect budgets, maximum anisotropic filtering, a larger environment map and an FPS readout on the battle HUD. Drawing only: battle results are unchanged. See the README, "Run it locally on your own GPU".

### Ten new timelines and the measured Threat to the Reapers
- Ten new alternate timelines, each diverging at a named event of the trilogy and labelled ALTERNATE UNIVERSE everywhere: Sovereign’s Triumph (2183, the Citadel falls), The Collectors’ Harvest (2185, the suicide mission fails and the Alpha relay stands), The Indoctrinated Council (2185, the Mnemosyne derelict is salvaged), Leviathan’s Bargain (2186, the Reapers reach Despoina first), Vigil’s Warning (2183, the Council believes Vigil’s archive in secret), The Geth–Quarian Concord (c. 1895, no Morning War), The Asari Disclosure (2183, the Athame beacon is shared), Turian Total War (2183, total mobilisation), Leviathan’s Covenant (2186, the Leviathans fight openly) and The Conduit Protocol (2183, relay locks). Existing engine knobs only; every text is original.
- Threat to the Reapers, a measured 1–6 scale: `npm run timeline:threat` fights the threat reference engagement (a Council-era coalition against five Reaper groups, four seeds) under every timeline and writes `src/timelines/threatMeasured.ts` and `docs/apex/TIMELINE_THREAT.md`, measured on the integration engine (CORE T1–T12). The thresholds, 19 / 26 / 45 / 64 / 84, are derived from a probe ladder built from canon alone (every organic navy’s fire rate, heat capacity and hull × m), one preset-blind rule per tier floor (wins any battle; holds one, two or three Reaper groups; holds all five); the script re-bases them by itself when the ladder moves them by more than 2 points, and `npm run timeline:threat -- --check` is the release gate. The ten new timelines span all six tiers, each measured inside its declared tier; the eight existing presets keep their numbers and take the tier they measure (Reaper Escalation 1, canon 4, Cerberus Reformed 4, Cerberus Ascendant 4, Prepared Galaxy 5, Humanity Ascendant 5, Apex core and legacy 6; on the first measurement, before CORE T9–T12 and with design-time thresholds 17 / 30 / 48 / 62 / 87, canon read 35.4, Cerberus Reformed 42.2 and Cerberus Ascendant 44.1, all tier 3). The generated table stores a fingerprint of the battle-relevant catalogue and of every preset, and a unit test fails when either changes without a new measurement.
- Threat badges on the timelines screen (with a detail block: band, measured losses and survival, breaking point, the five Reaper groups as the timeline deploys them), in the briefing and in campaign setup; custom timelines show "unrated".
- World-state locks: campaign setup and the briefing preselect and lock the world state a timeline’s story implies (Ascension, Rannoch, Normandy, genophage) with an AU note; what the campaign cannot express is stated in an AU campaign note.
- Codex: a Timelines category with one entry per new timeline (titled “<name> (AU)”) and an entry explaining the scale.
- Every place that names a timeline away from its own card marks an alternate or custom one: `[AU]` / `[CUSTOM]` in the briefing, campaign-setup, custom-battle and comparison pickers, the comparison table, the fleet database column, the saves list, the results line, the campaign war clock and the battle history in Settings; “ALTERNATE UNIVERSE” in the codex, fleet database, campaign and battle-HUD headers, the menu footer and the selection toast. Custom battle shows the briefing’s AU line under its picker.
- The timelines screen stacks to one column on phones, its Reaper-group table fits a phone without scrolling, and long timeline names no longer widen the briefing or campaign setup past the screen.

### Simulation (CORE T11–T13)
- **Oculus drones** launch through the Reaper hangars in flights of four and fight the escort screens; fighters and drones within 1.5 km reveal a silent stealth frigate.
- **Reaper AI:** Reapers rotate protection onto damaged capitals, focus the active gun platform, and destroyers cover a damaged capital; under the Apex timelines they abandon lost hulls and fall back by group.
- **Groundwork for the Final Battle:** the fleet volley (every spinal gun with a solution fires inside one window), coordinated HADES salvos, arrival waves, scripted specials and flagship events with a final transmission. These are in the simulation and the exported event log now; their banners, controls and camera cues arrive with the HUD and cinematics work.
- Release gate: typecheck clean; 379 unit tests in 35 files; build clean; 10/10 end-to-end tests (Battle of Earth, replay, comparison, campaign, Local Edition); screenshots inspected with no page errors. The threat table was re-measured on this exact build.

Known limitations: new hull classes still use placeholder models; 8× playback still lags on large battles; combat ranges and pacing are being redesigned; the Harbinger banner and the volley control are not on screen yet; canon currently measures 46 on the threat index (tier 4, Serious) after the new Oculus and Reaper AI behaviour moved its reference battles, and the labels follow the measurement until the second calibration pass.

## 0.12.0 — V2 preview: movement, firing solutions, stealth, HADES penetrators

First playable preview of the V2 simulation core (CORE tasks T1–T10). Rendering, HUD and cinematics work for V2 has not started yet, so new hull classes appear with simple placeholder models.

- **Movement rewrite.** Fleets steer onto a bearing with slow, damped heading changes, close to their engagement band and hold it: no spinning-plate rotation, no spirals, no orbiting the target. Lines decelerate on the run-in; escorts close to their own weapon range while the capital line holds its standoff. Six 3D formations (layered line, stacked wedge, box, swarm descent, broadside line, static), Reapers in a loose cluster, fixed orbital platforms that slew but never move.
- **Nobody runs.** Battered hulls make a tactical withdrawal to a recovery station behind their line with their guns still firing, regenerate and re-engage; only carrier recovery takes a hull off the field. Battles end by destruction or the time limit.
- **Firing solutions.** Every gun builds a solution on its target from sensors, crew, range, electronic warfare and the target's manoeuvring; hard manoeuvres break solutions, and misses at range are common.
- **Stealth frigates.** The SSV Normandy SR-2 is a unique command vessel; the SR-2-pattern stealth frigates are their own class. Both run silent with an emission sink, are invisible to fire beyond close detection range, are revealed by firing, being hit or close contact, and must vent when the sink fills. They fight as hunters: silent approach, one strike on the most vulnerable target, break away, go silent again.
- **HADES penetrators (Apex timelines).** The Project Titan gun carries a finite magazine of penetrators with nuclear warheads; the warhead fires only after a penetrating hit, then the gun falls back to slugs. Per-mount heat, charge times and coordinated salvos.
- **Canon calibration.** Dreadnought main guns on a 2-second cadence; Sovereign-class capitals, Harbinger and destroyers re-based so a canon dreadnought line loses to Reaper capitals while killing one or two; barriers that recover under fire only below their load threshold.
- **Timelines.** "Prime/Apex — Apex core" (the tuned Apex rules) and "Apex legacy" (the earlier high-power rules) are separate presets.
- **Catalogue.** New classes for later V2 scenarios: Oculus drones, SSV Normandy SR-2, SR-2-pattern stealth frigate, Kilimanjaro-class dreadnought, super-dreadnoughts (SSV Omaha leads the Alliance line, AU), Normandy Valkyrie (AU), orbital defence platforms.
- **Performance.** A spatial grid and staggered decisions make each simulation step 4–9 times faster in large battles.
- **Tests.** 217 unit tests, including a seed-42 check that a battle run one tick at a time, in 160-tick batches and in uneven batches is identical.

Known limitations of this preview: placeholder models for the new classes; a new campaign fields an SR-2-pattern frigate where the Normandy should be; 8× playback still lags on large battles (fix scheduled for 0.12.x with an exact fast-forward to result); combat ranges and pacing are being redesigned (brief §19.2).

## 0.11.3 — Camera and recording (hotfix)

- Cinematic director lingers 11–18 s per shot (7 s on a capital death) and cuts away less often.
- Orbit pitch is unlimited above and below the plane; the follow camera is a free orbit around the followed ship (drag to circle it, wheel to change chase distance).
- H cycles the HUD: full → minimal (top bar) → none, the last a clean frame for recordings (cursor hidden).

## 0.11.2 — Nobody runs (hotfix)

- Removed the fleet-wide auto-retreat at 12 % strength and the automatic escape of damaged ships, which made fleets turn away mid-battle and stop fighting. A battered ship now makes a tactical withdrawal: it falls back to a weaving station behind its fleet with its guns still bearing, and re-engages once its barriers recover. Only an explicit Retreat order leaves the battlespace. Battles run to destruction or the time limit.

## 0.11.1 — United fleets and no hull caps (hotfix)

- Custom battle: any number of fleets per side, each with its own faction, formation, name and arrival time ("united fleets"); a Sword Fleet at Earth preset; no hull caps (a performance note appears above 150 hulls on a side).
- Fixed: side B reinforcements spawned Reapers whenever the roster was left over from a Reaper setup; reinforcements now have their own faction picker and a fleet never spawns hulls of another faction.
- The Citadel is selectable as a custom battlefield.

## 0.11.0 — Touch layout and Council hull detail

- Two-finger drag pans the battle camera (with pinch zoom); phone-width layout: the HUD top bar wraps, the fleet and target panels become bottom sheets behind a Panels toggle, screens and the campaign map collapse to one column.
- Turian dreadnought and cruiser: broadside turrets with barrels, GARDIAN blisters, dorsal ridge plates, flank ribs. Asari dreadnought and cruiser: flank viewport rows, accent collars, ventral sensor domes.

## 0.10.0 — War summits and 2183 world states

- Council war summits every twelve weeks while the Citadel holds: interactive campaigns pause for a decision (demand fleet commitments, pool Crucible resources, prioritise refugees) with twelve-week effects; AI-run campaigns press for fleets.
- Rachni queen world state (spared: rachni workers speed the Crucible by 8 %) and Council composition from the Destiny Ascension outcome (old Council: Council races cooperate more; human-led Council: Alliance production +10 %, others −5 % cooperation).
- Campaign setup exposes both choices; tests cover summit timing, decisions and the new world states (83 unit tests).

## 0.9.0 — Level of detail and model detail pass

- Distance-based level of detail: close ships render fully; at range windows, accents, lights and engine glow sprites are dropped; far ships (and fighters beyond 90 units) collapse into one shared point cloud. Toggle in Settings. Final Battle of Earth (206 ships): draw calls fall from about 1,500 to about 590 in the tactical view (`scripts/perf.mjs`).
- Reaper hood plating (three overlapping forward shells), an aperture iris and a larger eye glow; Alliance cruiser broadside barrels and flank panel lines; dreadnought bow panel lines and GARDIAN blisters.
- HUD clock shows the frame's draw-call count.
- Tests: LOD policy (81 unit tests).

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
