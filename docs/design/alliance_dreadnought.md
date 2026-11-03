# Everest-class dreadnought (`alliance_dreadnought`)

| | |
| --- | --- |
| Faction · role | alliance · `dreadnought` |
| Length | 888 m — `CANON_INFERRED` (commonly cited for the Everest-class; not stated in the games); render length **8.88 units** |
| Status | **TARGET** (AP §12; A13 rebuilds; INTEGRATION locks) |
| Canon / AU | canon class; original model. V2 renames the class from today's "Kilimanjaro-class dreadnought" to **"Everest-class dreadnought"** (AP §14.2) so the database does not carry two Kilimanjaro-class rows; the Kilimanjaro-class is `alliance_dreadnought_k` |
| Names | `SSV Everest` (canon class name); `SSV Fuji`, `SSV Elbrus`, `SSV Logan`, `SSV Denali`, `SSV Ararat` (pack list, on the verify list; mountain convention) |
| Builder today | `src/rendering/ships/alliance.ts` `buildAllianceDreadnought()` at 8.88 units: central gun-housing box 0.78 wide × 0.62 high over 78 % of the length, a 1.45-wide forward head over the muzzle, a dorsal superstructure block with a tower (top at y ≈ 1.1), sponsons standing off the flanks to x ≈ ±1.33 with four broadside turrets a side, a ventral keel, two GARDIAN blisters, a four-nozzle engine block, blue stripes along the dorsal housing. Read from the builder (not measured): beam ≈ 2.66 units (0.30 L), height ≈ 1.65 (0.19 L) |
| Changes | A13: `buildAllianceDreadnought('everest')` in the shared K-class language — same silhouette, shorter; beam 1.42 and height 1.07 units, which means sponsons tucked to the flanks (≈ −45 % beam) and a terraced superstructure without the tower (≈ −35 % height) |
| Hardpoints | as the K-class: `alliance_dn_main` ×1 (`[0, 0, 420]`), `alliance_broadside` 4 + 4, `gardian` ×8; Titan gun under Apex |

## Three-view silhouette

Identical in language to `alliance_dreadnought_k.md` and shorter by 11 %:

- **Bow**: the flat wide wedge with the single muzzle on the axis, the terraced superstructure behind it, shallow sponson shoulders each side, GARDIAN blisters on the bow shoulders; wider than tall.
- **Profile**: the slab with the gun housing running the full length, the superstructure stepping up to a command block a third of the way aft and down again, a straight keel, the four-nozzle engine block, blue stripes along the flanks.
- **Three-quarter**: the Alliance capital ship; beside a Kilimanjaro-class it is recognisably the same family and visibly shorter.

## Proportions (TARGET — binding)

| Measure | Target | Notes |
| --- | --- | --- |
| length (z-extent) | **8.88 units** (888 m) | |
| beam / length | **0.16** (≈ 1.42 units) | today ≈ 0.30 |
| height / length | **0.12** (≈ 1.07 units) | today ≈ 0.19 |
| part ratios | as the K-class sheet (full-length housing; terraced superstructure within the height envelope; bow wedge ≈ 0.20 L; sponsons ≤ 0.04 L wide; engine block ≈ 0.18 L) | |
| relation | Sovereign-class z / this z = **2.25 ± 0.1** (the brief's "2.2 : 1" read against the Everest-class) | AP §0.3 #26, pinned |

## Signature features

As the K-class: full-length spinal gun housing, stepped dorsal superstructure, wedge bow, flank sponsons with broadside turrets, blue stripes along the flanks, four-nozzle engine block. The Everest-class is the shorter, older hull: *proposal* a slightly blunter bow wedge and a single command block instead of the K-class's three terraces, so the two classes differ in a profile shot and not only in length.

## Colours and lights (hex)

The Alliance palette and the light placement of `alliance_dreadnought_k.md`: hull `0xb9c1cc`, hullDark `0x3b4350`, accent `0x1f5fb3`, engine `0x5fb8ff` (emissive `0x3c9dff`, 3.2), windows `0xcfe8ff` (emissive `0x9fd0ff`, 1.6); drive and far-point `0x4fb8ff`; barrier shell `0x6fb0ff`; tracer `0xdff4ff`, HADES rounds `0xe8e0ff`. Bridge strip on the command block; flank window strips (today 9 a side); four nozzles; muzzle ring; blue stripes.

## Must read as

What exists today: the slab language is already there — the gun housing, a superstructure, sponsons with turrets, the wedge head, the blue stripes, the engine block — and the hull is recognisably an Alliance dreadnought. What must change: the sponsons stand too far off the flanks and the tower is too tall for the §12 envelope; the gun housing should read as running the full length (today the forward head widens over it and hides the line); the stripes move to the flanks.

- [ ] The same slab, full-length housing and stepped superstructure as the Kilimanjaro-class.
- [ ] Shorter than the K-class by eye in a profile pair.
- [ ] Beam 0.16 L, height 0.12 L: a low, wide, flat capital ship.
- [ ] Pale hull, dark bands, blue flank stripes, blue-white drives.

## Movement and animation (brief §15.3, dreadnought row)

As the K-class sheet: bank up to 8°, the whole hull aligns the bore, slides through turns, a decaying recoil shudder along the bore on every spinal shot (the brief names "Everest, Kilimanjaro" for this), four stern nozzles following throttle, manoeuvring puffs at the bow cheeks, sponson ends and stern quarters; the 2.6 s three-stage death with the screen-white. The standoff doctrine of `INTEGRATION_NOTES.md` (lead 2 Nov) applies to every Alliance dreadnought: the simulation holds the hull at 0.8–0.95 of spinal range with a bow solution and closes to broadside range only when the enemy does, so the Everest-class spends most of a battle pointed at its target.

## Frozen screenshot set

`e2e-screenshots/alliance_dreadnought_bow.png`, `e2e-screenshots/alliance_dreadnought_profile.png`, `e2e-screenshots/alliance_dreadnought_3q.png`.

## Status

TARGET. A13 rebuilds; `tests/silhouette.test.ts` pins 8.88 / 0.16 / 0.12 and the 2.25 ± 0.1 relation; INTEGRATION locks. The rename to "Everest-class dreadnought" is CORE's catalogue change (`ships.ts` name and `designProvenance` note).
