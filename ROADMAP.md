# Roadmap

Phases follow the project brief. ✅ done · 🔶 partial · ⬜ not started.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Technical foundation, deterministic sim, working 3D Battle of Earth | ✅ |
| 2 | Improved ship models, weapons, effects, audio | 🔶 Alliance + Reaper models, effects and procedural audio exist; models need more detail passes (see KNOWN_ISSUES) |
| 3 | Additional factions and ship classes (Turian, Asari, Salarian, Quarian, Geth, Cerberus) | 🔶 Turian, Asari and Cerberus hulls, scenarios and custom-battle support done; Salarian, Quarian, Geth pending |
| 4 | Custom battle editor | ✅ (Alliance vs Reapers; reinforcement wave, formations, timeline, battlefield) |
| 5 | AU rule engine | ✅ (18 tech multipliers, special tech, strategic variables, validated import/export, editor) |
| 6 | Canon vs AU comparison mode | ✅ |
| 7 | Galactic campaign map | ⬜ |
| 8 | Strategic warfare simulation (ticks, production, losses, Crucible, indoctrination) | ⬜ |
| 9 | Codex and intelligence systems | ✅ codex, fleet database, Reaper intelligence panel |
| 10 | Additional timelines and scenarios (Palaven, Thessia, Rannoch, Citadel, Final Battle of Earth, Cerberus Intervention, Prime/Apex Palaven) | 🔶 Palaven, Thessia, Cerberus Intervention and Prime/Apex Palaven done; Rannoch, Citadel and Final Battle of Earth pending |
| 11 | Campaign progression and strategic AI | ⬜ |
| 12 | Advanced cinematics, optimisation, polish | 🔶 |

## Next recommended tasks

1. **Ship model detail pass**: Reaper hood plating and a stronger "eye" glow; Alliance panel lines and turret detail; LOD meshes for distant ships.
2. **Quarian and Geth hulls + Rannoch Campaign** scenario with selectable geth–quarian outcomes; Citadel Defence scenario.
3. **Campaign skeleton** (Phase 7): galaxy map data (Sol, Arcturus, Palaven, Thessia, Sur'Kesh, Tuchanka, Rannoch, Citadel, Omega, Illium), relay graph, fleet positions, tick loop; resolve battles with the existing simulation.
4. **Ammunition/heat refinements**: finite torpedo loads, heat-limited GARDIAN bursts.
5. **Performance**: instanced rendering for frigates/fighters, aggregate distant formations.
6. **Save slots** for campaigns (storage layer already supports export/import).
