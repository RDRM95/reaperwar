# Lore reference and provenance

Every important statistic in `src/data` carries one of four tags, which the UI shows next to the value:

| Tag | Meaning |
| --- | --- |
| `CANON_CONFIRMED` | Stated in the trilogy's codex or depicted unambiguously. |
| `CANON_INFERRED` | Follows from canon statements or widely cited measurements that the codex does not state outright. |
| `SIMULATION_ESTIMATE` | Invented for the simulation; chosen so canon relationships hold. |
| `AU_MODIFIED` | Exists only in an alternate-universe timeline. |

## Canon anchors used

- **Dreadnought main gun** (ME1 codex, *Dreadnought*): Everest-class gun ~800 m long; 20 kg slug at 4,025 km/s, ~38 kt TNT, one round every two seconds. → simulation damage unit: 1 dreadnought slug ≈ 1,000 points.
- **Reaper capital ship** (ME3 codex): ~2 km long; magnetohydrodynamic weapon yielding 132–454 kt per shot, capable of destroying a dreadnought. Sovereign's barriers withstood the Citadel fleet until Saren's death.
- **Reaper destroyer** (ME3 codex): ~160 m; beam defeats frigates and cruisers.
- **Kinetic barriers** (codex): stop fast projectiles, not slow objects, not directed energy.
- **GARDIAN** (codex): infrared point-defence lasers, heat-limited.
- **Disruptor torpedoes** (codex): slow to pass barriers; shearing mass-effect warheads.
- **Thanix cannon** (ME2 codex): molten iron-uranium-tungsten stream derived from Sovereign; frigate gains cruiser-grade punch.
- **Carriers** (codex): humans alone field them; fighters strike with torpedoes.
- **Treaty of Farixen** dreadnought ratios; Kilimanjaro-class dreadnought names (SSV Kilimanjaro, SSV Orizaba); F-61 Trident; Normandy SR-2 Thanix refit; Harbinger as the first Reaper; Earth invaded via Charon relay with Arcturus lost; Palaven/Menae under assault.

## Inferred

- Everest-class length 888 m; Normandy SR-2 ~216 m; SR-1 ~155 m (commonly cited, not in codex).
- Cruiser spinal guns smaller than dreadnoughts'; broadside batteries exist.
- Reaper point defence against fighters (depicted engaging small craft).

## Simulation estimates (see `src/data/ships.ts`, `src/data/weapons.ts`)

Hull / armour / barrier pools, regeneration, speeds, turn rates, sensor ranges, weapon cooldowns, ranges and projectile speeds in a **compressed battlespace** (tens of km instead of tens of thousands). The relationships enforced by tests: a dreadnought slug destroys a frigate; a Reaper capital beam guts a cruiser in one burst and a dreadnought in about two; frigate guns barely scratch Reaper plating; under canon rules a full dreadnought group loses the reference engagement while killing at most a couple of Reapers.

Fleet sizes per scenario are compressed stand-ins for canon forces (the real Battle of Earth involved far larger fleets).

## Player-dependent outcomes

The simulator never fixes a single outcome for branching ME3 decisions. Scenarios and the campaign expose world-state choices labelled *player dependent* or *extrapolation*: Normandy present, Alliance fleet commitment, Destiny Ascension saved or lost, geth–quarian war or peace, Reaper-upgraded geth, genophage cure deployed or sabotaged (Salarian First Fleet), Crucible built or refused. Rachni and Council composition are not yet modelled (see ROADMAP).

## Visual liberties (not simulation values)

- Earth is drawn at roughly 1/3 scale, placed so a low-orbit battle can frame it.
- Fighters are rendered at 2× size for visibility.
- Battlespace compression (×0.4) applies to distances the camera sees; the HUD reports nominal values from the catalogue.
