# CODEX BUILD BRIEF — APPLY TO REAPER WAR SIMULATOR

Create a `ShipReferenceRegistry` import using `ship_registry.json`, with immutable `source_visibility` and `geometry_status`. Do not mark an Apex original or fan reconstruction as official.

### Implementation order
1. Inventory existing ship models and match to registry IDs. Print a factual missing/placeholder report. Do not replace existing functional assets until the replacement has been visually validated.
2. Implement P0 ship families first: Alliance SR-1, SR-2, ME3 cruiser and dreadnought; Cerberus cruiser; Turian cruiser; Destiny Ascension; Quarian cruiser; Geth cruiser/dreadnought; Reaper capital/destroyer; Collector cruiser. Add fighters and shuttles afterward.
3. Add per-ship metadata: reference sources and approval status; actual game mesh vs reconstruction; metres datum; hardpoint graph; damage zones; thrusters; animation rig; LOD boundaries.
4. Build an in-engine **six-view comparison mode** with user-supplied screenshots, overlay opacity slider, dimensions, source links, and per-ship PASS/FAIL notes.
5. Separate simulation scale/weapon tuning from reference geometry. Do not silently resize meshes to fit battle visuals.
6. Preserve all existing sandbox fleet construction, camera systems, real-time combat, statistics, gunnery view and battle calculator. Geometry changes must not reset loadouts or mission state.
7. Track batching/instancing, shader count, draw calls, pooled FX, LODs, impostors and occlusion for large 5090/9800X3D-enabled battles; avoid assuming the user's hardware makes poorly designed rendering free.
8. Add design variants only under the Apex namespace; require a donor hull/faction style-sheet and explicit alternate history point.

### No substitutions
- No generic Star Destroyer silhouettes.
- No slow tumbling fighter swarms masquerading as capital ships.
- No conical Reaper 'spaceship' substitutes.
- No random fan-class labels in codex official lists.
- No made-up exact lengths as 'Canon'.
- No visually spectacular beam that ignores hardpoint direction, timing or hit location.

### Test fixtures
A: P0 ship identification from unlabelled silhouette in 2 seconds.
B: Fleet side-by-side at correct proportions: Reaper Sovereign 2000 m vs destroyer 160 m, supported by codex.
C: 30 cruisers firing axial guns; gunnery view and fleet view share the same projectile origin, direction, arrival timestamp and impact target.
D: 1000+ mixed ships at 4K: report FPS, render frame time, GPU VRAM, draw calls and active FX count; benchmark existing build before changes.
