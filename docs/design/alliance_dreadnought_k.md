# Kilimanjaro-class dreadnought (`alliance_dreadnought_k`)

| | |
| --- | --- |
| Faction · role | alliance · `dreadnought` |
| Length | 1,000 m — class `CANON_CONFIRMED` (the Kilimanjaro-class is named in the games), length `SIMULATION_ESTIMATE` (fan size chart; the games give the class no length); render length **10.0 units** |
| Status | **TARGET** (AP §12; A13 builds; INTEGRATION locks) |
| Canon / AU | canon class; original model; a new V2 data class with combat values identical to the Everest-class (balance untouched) |
| Names | `SSV Kilimanjaro`, `SSV Orizaba` (canon, `LORE_REFERENCE.md`); `SSV Tai Shan`, `SSV Shasta`, `SSV Aconcagua` (pack list, on the verify list) |
| Builder today | none — the CORE role-based placeholder until A13 lands `buildAllianceDreadnought('kilimanjaro')` in `src/rendering/ships/alliance.ts`; the Everest builder is the base language |
| Hardpoints | `alliance_dn_main` ×1 spinal (`[0, 0, 420]`), `alliance_broadside` 4 + 4 (`[±30, 6, 100]`), `gardian` ×8 (`[0, 24, 150]`); under Apex the spinal gun is the Project Titan heavy accelerator with HADES penetrators |
| Scene role | the two K-class hulls of the Sword fleet (Kilimanjaro, Orizaba) are the Final Battle's volley anchors (AP §4.2) |

## Three-view silhouette

- **Bow** (`az 180, el 0`): a flat, wide wedge: the bow tapers to a wedge in plan and in elevation, the single spinal muzzle dead centre on the hull's axis. Behind the wedge the dorsal superstructure rises in two or three terraces, narrow against the hull's width. The flank sponsons show as shallow shoulders at mid-height on each side, each with its broadside turrets; two GARDIAN blisters sit on the bow shoulders. The whole is wider than tall (beam 0.16 L, height 0.12 L).
- **Profile** (`az 90, el 0`): a long, flat slab. The **spinal gun housing runs the full length** as a continuous centre ridge from the muzzle to the stern block. The superstructure **steps up in terraces** from just aft of the bow wedge to a command block about a third of the way along, then steps down toward the engine block; the keel line is nearly straight; the four-nozzle engine block closes the stern. Blue identification stripes run along the flanks.
- **Three-quarter** (`az 135, el 20`): the Alliance capital ship: the slab, the full-length housing, the terraced superstructure with its lit bridge strip, the sponsons with four broadside turrets a side, pale plating with dark panel bands and blue stripes, blue-white drives.

## Proportions (TARGET — binding within the relative tolerance of 0.08)

| Measure | Target | Notes |
| --- | --- | --- |
| length (z-extent) | **10.0 units** (1,000 m) | muzzle tip to engine nozzles |
| beam / length | **0.16** (1.6 units) | the sponsons set the beam |
| height / length | **0.12** (1.2 units) | command block top to keel |
| gun housing | full length: from the muzzle to the stern block | AP §12 |
| superstructure | stepped: *proposal* three terraces, the tallest at 0.30–0.40 L from the bow, total height within the 0.12 L envelope | AP §12 "stepped dorsal superstructure" |
| bow wedge | *proposal* the forward 0.20 L tapers to the muzzle in plan and elevation | AP §12 "wedge bow" |
| sponsons | *proposal* each ≤ 0.04 L wide, from 0.25 L to 0.75 L along the flank, four turrets a side | AP §12 "flank sponsons" |
| engine block | *proposal* the aft 0.18 L, four nozzles in a 2 × 2 pattern | |
| relations | Sovereign-class = 2.0 × this length (pinned); this = 1.43 × the York-class cruiser; this = 1.126 × the Everest-class | `SCALE_REFERENCE.md` |

## Signature features

1. The **full-length spinal gun housing** — the hull is built around the gun.
2. The **stepped dorsal superstructure** with the command block and its lit bridge strip.
3. The **wedge bow** ending in the single muzzle.
4. **Flank sponsons** carrying the broadside turrets (four a side, barrels outboard).
5. **Blue stripes along the flanks** on pale plating with dark panel bands.
6. The **four-nozzle engine block** with blue-white exhausts.

## Colours and lights (hex)

Alliance palette (`materials.ts`): hull `0xb9c1cc` (metalness 0.5, roughness 0.42), hullDark `0x3b4350` (panel bands, turrets, keel), accent `0x1f5fb3` (the blue stripes and the muzzle ring), engine `0x5fb8ff` (emissive `0x3c9dff`, 3.2), windows `0xcfe8ff` (emissive `0x9fd0ff`, 1.6); drive and far-point colour `0x4fb8ff`; barrier shell organic `0x6fb0ff`; mass-accelerator tracer `0xdff4ff`, HADES/Titan rounds `0xe8e0ff`.

| Light | Placement |
| --- | --- |
| bridge strip | the top of the command block, full width |
| flank window strips | one row a side at mid-height along the central 60 % of the length (today 9 per side on the Everest) |
| engine nozzles | four at the stern block; glow length and brightness follow throttle |
| muzzle ring | accent ring just behind the muzzle; the HADES priming glow (1.2 s, Apex only) sits on the muzzle |
| stripes | blue, along both flanks above the sponsons; a stripe pair also along the dorsal housing edges (today's placement) |

## Must read as (brief §10: "Kilimanjaro/Everest slab with the full-length gun housing and stepped superstructure")

Nothing exists today for this id. The Everest builder, which A13 refactors into the shared language, is too wide (beam ≈ 0.30 L from sponsons that stand off the hull) and too tall (≈ 0.19 L from a tower on top of the superstructure); the K-class must be the slab: sponsons tucked against the flanks, the superstructure terraced and low.

- [ ] A long flat slab, wider than tall; the gun housing visibly runs the full length.
- [ ] A stepped dorsal superstructure that rises and falls in terraces.
- [ ] A wedge bow with one spinal muzzle on the axis.
- [ ] Sponsons along the flanks with broadside turrets.
- [ ] Pale hull, dark panel bands, blue stripes along the flanks; blue-white drives.
- [ ] Half a Sovereign-class in length and a fraction of its bulk (`scale-sovereign-vs-kilimanjaro.png`).

## Movement and animation (brief §15.3, dreadnought row)

- Bank up to 8°; small pitch; ponderous: the **whole hull turns to align the spinal gun** (a spinal shot needs the bow arc and a predicted intercept, AP §19 8.7); the hull slides through turns on inertia, keeping its broadsides on the target while the velocity lags.
- **Recoil shudder**: a decaying shudder along the bore on every spinal shot (*proposal*: a 0.4 s damped oscillation of ≈ 0.004 L backward along the bore, two cycles), stronger for a Titan shot; the broadsides do not shudder the hull.
- Thruster points: the four stern nozzles follow throttle; manoeuvring puffs at the bow wedge cheeks (two), the fore and aft ends of each sponson (four) and the stern quarters (two).
- **Standoff doctrine** (`INTEGRATION_NOTES.md`, lead 2 Nov; CORE): Alliance and Cerberus dreadnoughts hold a long-range engagement at 0.8–0.95 of spinal range with a bow solution and use their broadsides only when the enemy closes, so on screen the hull keeps its bow on the target for long stretches and slides sideways only when the line shifts; the animation layer must not add a turn the simulation did not make.
- Volley: in a `fleet_volley` every spinal gun fires within 1.5 s; the K-class pair anchor the Final Battle's opening volley, so their muzzle flashes and recoil are what the side-on wide shot (`fb-volley-wide.png`) shows.
- Death: three stages over 2.6 s with the screen-white for dreadnought-class (`peak = clamp(40 × size / cameraDistance, 0.25, 0.9)`).

## Frozen screenshot set

`e2e-screenshots/alliance_dreadnought_k_bow.png`, `e2e-screenshots/alliance_dreadnought_k_profile.png`, `e2e-screenshots/alliance_dreadnought_k_3q.png`; `scale-sovereign-vs-kilimanjaro.png` (CD §6.3 #08).

## Status

TARGET. A13 builds the variant and registers `BUILDERS.alliance_dreadnought_k`; `tests/silhouette.test.ts` pins 10.0 / 0.16 / 0.12 and the 2.0 ± 0.1 relation to the Sovereign-class; INTEGRATION locks.
