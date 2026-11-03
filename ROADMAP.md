# Roadmap

Phases follow the project brief. ✅ done · 🔶 partial · ⬜ not started.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Technical foundation, deterministic sim, working 3D Battle of Earth | ✅ |
| 2 | Improved ship models, weapons, effects, audio | ✅ eight hull families, Reaper hood plating and iris, Alliance detail pass, effects, procedural audio; further detail passes remain polish |
| 3 | Additional factions and ship classes (Turian, Asari, Salarian, Quarian, Geth, Cerberus) | ✅ all six factions have original hull families, scenarios, campaign fleets and custom-battle support |
| 4 | Custom battle editor | ✅ (Alliance vs Reapers; reinforcement wave, formations, timeline, battlefield) |
| 5 | AU rule engine | ✅ (18 tech multipliers, special tech, strategic variables, validated import/export, editor) |
| 6 | Canon vs AU comparison mode | ✅ |
| 7 | Galactic campaign map | 🔶 interactive map, 15 systems, relays, fleets, system intel, orders |
| 8 | Strategic warfare simulation (ticks, production, losses, Crucible, indoctrination) | ✅ weekly ticks, Reaper AI, harvest, ground war, production, research projects, refugee pressure, political events, reinforcements, Crucible, morale, indoctrination, Council war summits with decisions, Cerberus Ascendant post-war reconstruction (2186–2206) |
| 9 | Codex and intelligence systems | ✅ codex, fleet database, Reaper intelligence panel |
| 10 | Additional timelines and scenarios (Palaven, Thessia, Rannoch, Citadel, Final Battle of Earth, Cerberus Intervention, Prime/Apex Palaven) | ✅ all listed scenarios; Final Battle of Earth takes the surviving fleets from a saved campaign |
| 11 | Campaign progression and strategic AI | 🔶 Reaper target selection with competence, allied reinforcement AI, final push on the Citadel |
| 12 | Advanced cinematics, optimisation, polish | 🔶 cinematic director, distance LOD with a shared far-point cloud, draw-call counter; instanced hull meshes and simplified mid-range hulls pending |

## Next recommended tasks

1. **Campaign depth**: bilateral negotiation with individual governments, krogan and quarian political chains, Cerberus coup events.
2. **Performance**: simplified mid-range hull meshes, instanced rendering for identical hulls, aggregate distant formations.
3. **Touch**: a dedicated phone campaign map (zoomable canvas), larger hit targets.
4. **Model polish**: procedural normal maps for plating, geth and quarian detail passes.

## Pinned for later (owner's list, not scheduled)

Priority order agreed on 1 Nov 2026: finish and ship the V2 build first, then additions.

1. **Collector ships** (ME2 Collector cruiser as an optional earlier-campaign opponent; original model).
2. **First Contact War scenarios** (2157 Relay 314 incident: Alliance patrol vs Hierarchy, Shanxi; canon-anchored, pre-Reaper technology).
3. **Non-eezo timelines**: alternate-universe presets where element zero is scarce or absent (different drive, weapon and barrier assumptions; clearly labelled AU).
4. **Local-hardware build** (desktop packaging or a native WebGPU path using the owner's GPU fully: uncapped pixel ratio, 4K 60 fps recording with hardware encoding, offline rendering; brief §18).
5. **Multiverse ship battles**: real franchises by name (Halo's UNSC and Covenant, Skynet and others), lore- and scale-accurate from their own canon (CROSSOVER_CANON provenance), original models and text, trademarks acknowledged; a separate labelled section. Design only after V2 ships.

## V2.1 — Extreme Scale (first programme after 1.0.0; owner's requirement of 3 Nov)

Harbinger's Total Offensive: 52,500 Reaper vessels (capitals, destroyers and a new harvesting/support family) against 22,600 coalition warships, 18,000 HADES batteries and 300,000 automated craft, in one continuous battle. Hybrid multi-scale simulation (ship level in active sectors, squadron/sector level elsewhere, identities and losses always tracked), Web Worker simulation with transferable snapshots, spatial partitioning, persistent squadrons and theatre command, adaptive update frequency without time dilation, instanced rendering and LOD, scalable effects, sector engagement management, persistent logging and replay, an Extreme Scale preset; calibrated against full-detail battles; benchmarks at 1,000 / 5,000 / 10,000 / 25,000 / 75,100 vessels on Node and Chromium. Design in `docs/V2_CINEMATIC_BRIEF.md` §17; plan produced by `docs/apex/workflows/extreme-scale-plan.js`.

## V2.2 — Graphics and cinematic overhaul (owner's requirement of 2 Nov)

Models, materials (procedural plating and normal maps), lighting, bloom, colour grading, anti-aliasing, convincing weapon effects, shield impacts, penetration, staged explosions, persistent wreckage; player commands, fleet visibility, camera selection, a Cinematic Graphics preset; a recording and replay system (HUD-free, 4K target, 30/60 fps, camera tracking and cuts, slow motion, deterministic replay with recorded orders, offline frame-by-frame rendering). What the V2 stage A/B scope already delivers (likeness pass, effects to a Mass Effect look, animation layer, Record mode) ships in 1.0.0; the rest follows the extreme-scale programme per the owner's priority order. Design in `docs/V2_CINEMATIC_BRIEF.md` §16; plan produced by the graphics planning workflow (`docs/apex/GRAPHICS_OVERHAUL_PLAN.md`).

## V2.3 — System theatre

In-system travel and combat at Sol scale: system map with bodies and objectives, FTL hops with drive heat and discharge tempo, the mass relay as the attackers' entry and exit point with a transit mechanic matching the games (alignment, corridor, ordered departure, arrival scatter, blockade), engagements resolved by the battle simulation at the body where fleets meet, campaign tie-in. Design in `docs/V2_CINEMATIC_BRIEF.md` §13.

## V2.4 — Alternate Timelines hub

A separate section for timeline families inside or next to the Mass Effect tech tree: Early Beacon (1800), First Contact Ascendant, One Humanity (Cerberus-Alliance aligned), Prothean Victory, Dark Lane (non-eezo FTL), HFY Terran Hegemony, a Stellaris-style player civilisation as a real faction with politics and fleet power, and a Multiverse section with real franchises by name, lore- and scale-accurate (UNSC, Covenant, Skynet and others). Needs tech families in the rules engine, a faction builder and politics model. Design in `docs/V2_CINEMATIC_BRIEF.md` §14.
