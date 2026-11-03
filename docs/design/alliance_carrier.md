# Alliance carrier (`alliance_carrier`)

| | |
| --- | --- |
| Faction · role | alliance · `carrier` |
| Length | 900 m — `SIMULATION_ESTIMATE` (not stated; comparable to a dreadnought hull without the spinal gun); render length **9.0 units** |
| Status | **MEASURE** (untouched by V2; INTEGRATION measures and locks) |
| Canon / AU | canon class (the codex has humanity alone fielding carriers); original model |
| Builder today | `src/rendering/ships/alliance.ts` `buildAllianceCarrier()` at 9.0 units: a 1.4 × 0.7 hull, a 2.3-wide **flight-deck slab** at y 0.4 with a dark deck surface and two blue deck stripes, **recessed lit hangar openings** along both flanks (x ±1.2) with side pods below them, an **island** offset to starboard (x 0.6, top ≈ y 1.1), a bow wedge, a three-nozzle engine block. Read from the builder (not measured): beam ≈ 2.5 units (0.28 L), height ≈ 1.6 (0.18 L) |
| Hardpoints | `alliance_broadside` 3 + 3 (`[±34, 6, 80]`), `gardian` ×10 (`[0, 26, 120]`); no spinal gun; complement 24 × `alliance_fighter` |

## Three-view silhouette

- **Bow**: a dreadnought-sized hull topped by a wide flat deck: the deck slab overhangs the hull on both sides; the hangar mouths show as lit slots below the deck edge on each flank; the island stands off-centre to starboard; no muzzle on the axis (the bow wedge is blunt).
- **Profile**: a flat deck line the length of the hull with the island aft of midships; hangar slots along the flank under the deck; a blunt bow wedge; the engine block with three nozzles (two above, one below).
- **Three-quarter**: the carrier: the deck, the lit hangar mouths down the flank, the offset island, Tridents emerging from the mouths; pale plating, blue deck stripes, blue-white drives.

## Proportions (MEASURE — filled at INTEGRATION)

| Measure | Measured | Read from the builder (guidance only) |
| --- | --- | --- |
| length (z-extent) | — | 9.0 units |
| beam / length | — | ≈ 0.28 |
| height / length | — | ≈ 0.18 |
| deck | — | the slab over the central 62 % of the length, 2.3 units wide |
| island | — | starboard of the axis, aft of midships, ≈ 0.16 L long |
| hangar mouths | — | the central 29 % of the length, both flanks |

## Signature features

1. The **flight-deck slab** overhanging the hull.
2. **Lit hangar mouths** along both flanks.
3. The **offset island** to starboard.
4. **No spinal gun**; a blunt bow wedge.
5. Three-nozzle engine block; blue deck stripes.

## Colours and lights (hex)

Alliance palette: hull `0xb9c1cc`, hullDark `0x3b4350` (deck surface, hangar recesses), accent `0x1f5fb3` (deck stripes), engine `0x5fb8ff` (emissive `0x3c9dff`, 3.2), windows `0xcfe8ff` (emissive `0x9fd0ff`, 1.6: hangar mouths, island strip); drive and far-point `0x4fb8ff`; barrier shell `0x6fb0ff`. Lights: the two hangar strips (the brightest emissive on the hull), the island's bridge strip, three nozzles.

## Must read as

What exists today: a deck, hangar slots, an offset island, no gun — the carrier reads as a carrier. Polish only: the hangar mouths should read as mouths (deeper recess, lit interior) rather than lit slots, and the deck stripes as deck markings.

- [ ] A dreadnought-sized hull with a flat deck and an offset island.
- [ ] Lit hangar mouths down both flanks; fighters come out of them.
- [ ] No spinal muzzle.
- [ ] Alliance blue-white livery.

## Movement and animation (brief §15.3 and §8.6)

- Bank up to 8° (*proposal*: the dreadnought limit); small pitch; keeps distance behind the line but still manoeuvres and fires its GARDIAN network and broadsides (brief §8.6: nobody sits still).
- Thruster points: the three stern nozzles follow throttle; puffs at the stern quarters and the bow cheeks.
- Launch and recovery: fighters appear at the hangar-mouth positions and fly out (no door animation in V2); recovered fighters disappear at the mouths; a `Flight` of four renders as instanced craft in a finger-four about the flight's position.
- Death: 2.6 s three stages with the screen-white (carrier is dreadnought-class for the death rule).

## Frozen screenshot set

`e2e-screenshots/alliance_carrier_bow.png`, `e2e-screenshots/alliance_carrier_profile.png`, `e2e-screenshots/alliance_carrier_3q.png`.

## Status

MEASURE. `scripts/measure-silhouettes.ts` fills the table and the JSON at INTEGRATION; status → LOCKED.
