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
4. **Multiverse ship battles**: real franchises by name (Halo's UNSC and Covenant, Skynet and others), lore- and scale-accurate from their own canon (CROSSOVER_CANON provenance), original models and text, trademarks acknowledged; a separate labelled section. Design only after V2 ships.

## V2.1 — System theatre (first phase after 1.0.0)

In-system travel and combat at Sol scale: system map with bodies and objectives, FTL hops with drive heat and discharge tempo, the mass relay as the attackers' entry and exit point with a transit mechanic matching the games (alignment, corridor, ordered departure, arrival scatter, blockade), engagements resolved by the battle simulation at the body where fleets meet, campaign tie-in. Design in `docs/V2_CINEMATIC_BRIEF.md` §13.

## V2.2 — Alternate Timelines hub (after V2.1)

A separate section for timeline families inside or next to the Mass Effect tech tree: Early Beacon (1800), First Contact Ascendant, One Humanity (Cerberus-Alliance aligned), Prothean Victory, Dark Lane (non-eezo FTL), HFY Terran Hegemony, a Stellaris-style player civilisation as a real faction with politics and fleet power, and a Multiverse section with real franchises by name, lore- and scale-accurate (UNSC, Covenant, Skynet and others). Needs tech families in the rules engine, a faction builder and politics model. Design in `docs/V2_CINEMATIC_BRIEF.md` §14.
