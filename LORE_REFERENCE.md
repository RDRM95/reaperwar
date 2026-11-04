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
- **Disruptor torpedoes** (codex): slow to pass barriers; shearing mass-effect warheads. Magazine sizes (8 per tube, 2 per fighter) are simulation estimates; fighters rearming at carriers follows the codex description of carrier operations.
- **Thanix cannon** (ME2 codex): molten iron-uranium-tungsten stream derived from Sovereign; frigate gains cruiser-grade punch.
- **Carriers** (codex): humans alone field them; fighters strike with torpedoes.
- **Treaty of Farixen** dreadnought ratios; Kilimanjaro-class dreadnought names (SSV Kilimanjaro, SSV Orizaba); F-61 Trident; Normandy SR-2 Thanix refit; Harbinger as the first Reaper; Earth invaded via Charon relay with Arcturus lost; Palaven/Menae under assault.

## Canon anchors used by the alternate timelines

Each of the ten timelines of `src/timelines/alternates.ts` follows the trilogy up to a named divergence and changes only what follows from it; every divergence is ALTERNATE UNIVERSE. The canon each one stands on, restated (design and review: `docs/apex/TIMELINES_V2.md`):

- **Battle of the Citadel (2183)**: Saren reached the Citadel through the Conduit and locked its arms while Sovereign and a geth fleet attacked; the Council could be lost aboard the Destiny Ascension; the Thanix was later reverse-engineered from Sovereign’s wreck. (Sovereign’s Triumph, Turian Total War, The Asari Disclosure.)
- **Ilos, Vigil, the Keepers and the Conduit (2183)**: a Prothean VI explained how the Reapers took the Citadel and the relays after indoctrinated agents had weakened the Prothean leadership; Prothean scientists had altered the Keepers; the Conduit is a small relay the Protheans built. Vigil records no Reaper weakness. (Vigil’s Warning, The Conduit Protocol.)
- **The Collectors, the Omega 4 relay and the human Reaper (2185)**, and **the Alpha relay in the Bahak system**, destroyed later that year to delay the Reapers by months. (The Collectors’ Harvest.)
- **The derelict Reaper at Mnemosyne (2185)**: dead for millions of years, it indoctrinated the Cerberus team studying it. (The Indoctrinated Council.)
- **The beacon in the Temple of Athame**: hidden by the asari for millennia, revealed in 2186. (The Asari Disclosure.)
- **The Morning War and the Council’s AI laws**: the quarians lost Rannoch to the geth about three centuries before 2183 and lost their Citadel embassy for creating them; by 2183 heretic geth served Sovereign. (The Geth–Quarian Concord.)
- **Turian society**: service from the age of fifteen, the largest navy in Citadel space, the volus as a client race. (Turian Total War.)
- **The Leviathans (2186)**: the research of Dr. Garret Bryson, the Alliance scientist whose search for what had killed a Reaper led Shepard to them (his daughter Ann, also a researcher, worked on it too, and his own enthralled assistant killed him in his lab); Despoina, the thralls who kept their secret, the Leviathans’ creation of the intelligence that created the Reapers, and the first Reaper made in their image. (Leviathan’s Bargain, Leviathan’s Covenant.)

## Inferred

- Everest-class length 888 m; Normandy SR-2 ~216 m; SR-1 ~155 m (commonly cited, not in codex).
- Cruiser spinal guns smaller than dreadnoughts'; broadside batteries exist.
- Reaper point defence against fighters (depicted engaging small craft).

## Simulation estimates (see `src/data/ships.ts`, `src/data/weapons.ts`)

Hull / armour / barrier pools, regeneration, speeds, turn rates, sensor ranges, weapon cooldowns, ranges and projectile speeds in a **compressed battlespace** (tens of km instead of tens of thousands). The relationships enforced by tests: a dreadnought slug destroys a frigate; a Reaper capital beam guts a cruiser in one burst and a dreadnought in about two; frigate guns barely scratch Reaper plating; under canon rules a full dreadnought group loses the reference engagement while killing at most a couple of Reapers.

Fleet sizes per scenario are compressed stand-ins for canon forces (the real Battle of Earth involved far larger fleets).

## Player-dependent outcomes

The simulator never fixes a single outcome for branching ME3 decisions. Scenarios and the campaign expose world-state choices labelled *player dependent* or *extrapolation*: Normandy present, Alliance fleet commitment, Destiny Ascension saved or lost, geth–quarian war or peace, Reaper-upgraded geth, genophage cure deployed or sabotaged (Salarian First Fleet), rachni queen spared (rachni workers on the Crucible) or killed, Council composition following the Destiny Ascension outcome, Crucible built or refused.

## Visual liberties (not simulation values)

- Earth is drawn at roughly 1/3 scale, placed so a low-orbit battle can frame it.
- Fighters are rendered at 2× size for visibility.
- Battlespace compression (×0.4) applies to distances the camera sees; the HUD reports nominal values from the catalogue.
