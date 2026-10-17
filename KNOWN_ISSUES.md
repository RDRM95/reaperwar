# Known issues and limitations

## Visual

- Reaper models are recognisable (ridged body, swept arms, red seams, forward aperture) but still simpler than the source silhouette; hood plating and arm articulation need another pass.
- All organic hulls have limited surface detail (panel strips, turrets); no textures, only materials. Asari fleets have no frigates; the Citadel's wards are simplified boxes.
- Fighters are rendered at 2× scale for visibility.
- Earth is at compressed scale; cloud layer is baked into the surface texture (no separate cloud sphere).
- Beam cylinders are flat-shaded; very close to the camera they look like ribbons.
- Level of detail hides detail meshes and glow sprites by distance and draws far ships as points; there are no intermediate simplified hull meshes, so mid-range ships still cost two draw calls each (about 590 draw calls for a 206-ship Final Battle in the tactical view).

## Simulation

- Torpedo magazines are finite (8 per tube, 2 per fighter) and fighters rearm alongside their carrier, but carriers themselves never run out of torpedoes to issue; mass accelerator rounds are treated as unlimited (canon describes very large slug magazines).
- Fighters under canon rules still die quickly to Reaper point defence; the new burst recovery helps only marginally.
- Fleets compress to a single formation anchor per fleet; sub-groups (squadrons) are not modelled.
- Point defence will scorch nearby hulls with GARDIAN lasers when no small targets exist (low priority, low damage).
- Fleet-wide withdrawal triggers at 12 % of starting value for factions with a withdrawal threshold; Reapers never withdraw.
- Balance is tuned on the reference engagement only; the Battle of Earth under canon rules usually ends with zero Reaper kills unless the player prioritises destroyers.

## Campaign

- Ground war, research, refugees and politics are abstract tracks (0–1 values and event triggers); there is no ground battle simulation and no negotiated diplomacy. Production is a point pool per faction.
- The Terminus mercenary fleet event uses Alliance-pattern hulls (no Terminus hull family yet) and is labelled an estimate in the log.
- Engagements cap each side at 70 ships by scaling counts; losses are scaled back proportionally.
- Autosave each week plus named slots (Saved Games screen); slots are browser-local unless exported from Settings.
- Post-war (Cerberus Ascendant) reconstruction is an abstract metric model: budget programmes move eleven 0–1 indicators and a fleet-point total. There are no post-war battles, named characters or map; the Terminus and Council are events, not actors.

## UI / platform

- Touch: one-finger drag orbits, two-finger pinch zooms; there is no two-finger pan, and the HUD panels are sized for desktop widths.
- Audio needs a first click (browser policy); it is synthesised and intentionally restrained.
- Headless/software-GL renders at low frame rates; the simulation step budget (40 ms per frame) keeps it responsive but slows simulated time.
- Loading a slot makes it the autosave; the previous autosave is overwritten on the next turn.
