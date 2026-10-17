# Known issues and limitations

## Visual

- Reaper models are recognisable (ridged body, swept arms, red seams, forward aperture) but still simpler than the source silhouette; hood plating and arm articulation need another pass.
- Alliance, Turian, Asari and Cerberus hulls have limited surface detail (panel strips, turrets); no textures, only materials. Asari and Turian fleets have no frigate/fighter carriers in scenarios yet.
- Fighters are rendered at 2× scale for visibility.
- Earth is at compressed scale; cloud layer is baked into the surface texture (no separate cloud sphere).
- Beam cylinders are flat-shaded; very close to the camera they look like ribbons.
- No level-of-detail meshes yet; a 100+ ship battle costs ~300 draw calls.

## Simulation

- Torpedo and fighter ammunition is unlimited (cooldown-limited only).
- Fleets compress to a single formation anchor per fleet; sub-groups (squadrons) are not modelled.
- Point defence will scorch nearby hulls with GARDIAN lasers when no small targets exist (low priority, low damage).
- Fleet-wide withdrawal triggers at 12 % of starting value for factions with a withdrawal threshold; Reapers never withdraw.
- Balance is tuned on the reference engagement only; the Battle of Earth under canon rules usually ends with zero Reaper kills unless the player prioritises destroyers.

## UI / platform

- Touch: the HUD works on touch, but camera orbit relies on pointer drag and the wheel; pinch zoom is not implemented.
- Audio needs a first click (browser policy); it is synthesised and intentionally restrained.
- Headless/software-GL renders at low frame rates; the simulation step budget (40 ms per frame) keeps it responsive but slows simulated time.
- The galactic campaign and Load Game entries are visible but disabled and marked as Phase 7.
