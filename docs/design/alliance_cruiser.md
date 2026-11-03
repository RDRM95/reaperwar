# Alliance cruiser — York-class language (`alliance_cruiser`)

| | |
| --- | --- |
| Faction · role | alliance · `cruiser` |
| Length | `ships.ts` today: `estimate(520)`; V2 (AP §3.2): **`estimate(700, 'York-class; fan size chart ≈ 707 m')`** — cruiser lengths are not established in the games; render length **7.0 units** |
| Status | **TARGET** (AP §12; A13 rebuilds; INTEGRATION locks) |
| Canon / AU | canon class (Alliance cruisers are canon); original hull in the York-class visual language |
| Builder today | `src/rendering/ships/alliance.ts` `buildAllianceCruiser()` at 5.2 units: a 0.62 × 0.5 central box, an angular bow housing over the spinal muzzle, a dorsal spine with a bridge block (top ≈ y 0.65), **downswept lateral fins** carrying the broadside turrets (the fins put the beam at ≈ 2.3 units, 0.44 L), panel lines, twin engines. Read from the builder: beam ≈ 0.44 L, height ≈ 0.22 L |
| Changes | A13: 7.0 units in the **slab language**: slab hull, raised stern block, forward wedge; beam 1.26, height 0.98 — the downswept fins go, the broadside turrets move onto the slab's flanks |
| Hardpoints | `alliance_cruiser_main` ×1 spinal (`[0, 0, 240]`), `alliance_broadside` 2 + 2 (`[±18, 4, 40]`), `gardian` ×4 (`[0, 14, 60]`); under fleet-wide Thanix presets the spinal gun becomes a Thanix stream |
| Variant | the Berlin-class (slimmer, red accent stripes, angular bow) is an optional second silhouette noted in `SCALE_REFERENCE.md`; it is **deferred** (AP §18) and nothing in V2 claims it |

## Three-view silhouette

- **Bow**: a smaller version of the dreadnought's wedge: a flat forward wedge with the single spinal muzzle on the axis; a low, narrow superstructure behind it; the hull wider than tall (beam 0.18 L, height 0.14 L); the broadside turrets low on the flanks.
- **Profile**: the **slab** at 70 % of the K-class length: a flat hull, the forward wedge, and a **raised stern block** — the superstructure sits aft, not forward, which is what tells a cruiser from a dreadnought in a profile pair; the keel straight; twin engines at the stern.
- **Three-quarter**: the Alliance cruiser: slab, forward wedge, stern block, blue-white livery with dark panel lines, two broadside turrets a side, blue-white drives.

## Proportions (TARGET — binding)

| Measure | Target | Notes |
| --- | --- | --- |
| length (z-extent) | **7.0 units** (700 m) | 70 % of the K-class |
| beam / length | **0.18** (≈ 1.26 units) | today ≈ 0.44 from the fins |
| height / length | **0.14** (≈ 0.98 units) | |
| forward wedge | *proposal* the forward 0.22 L tapering to the muzzle | AP §12 "forward wedge" |
| stern block | *proposal* rises over the aft 0.30 L to the full height envelope, with the bridge strip on its forward face | AP §12 "raised stern block" |
| relations | K-class : York = 1.43 : 1; cruiser : Normandy ≈ 3.2 : 1 | `SCALE_REFERENCE.md` |

## Signature features

1. The **slab hull** — the dreadnought's language at cruiser scale.
2. The **forward wedge** with the single spinal muzzle.
3. The **raised stern block** carrying the bridge.
4. Two **broadside turrets a side**, low on the flanks, barrels outboard.
5. **Blue-white livery**: pale plating, dark panel lines, a blue stripe along each flank.
6. **Twin engines** at the stern.

## Colours and lights (hex)

Alliance palette: hull `0xb9c1cc`, hullDark `0x3b4350`, accent `0x1f5fb3`, engine `0x5fb8ff` (emissive `0x3c9dff`, 3.2), windows `0xcfe8ff` (emissive `0x9fd0ff`, 1.6); drive and far-point `0x4fb8ff`; barrier shell `0x6fb0ff`; tracer `0xdff4ff`. Lights: bridge strip on the stern block's forward face; one flank window row a side (today 6 a side); two engine nozzles; muzzle ring. Thanix stream (refit presets): core `0xffd9a0`, sheath `0x4fa0ff`.

## Must read as (brief §10: "York and Berlin cruiser language")

What exists today: the bow housing over a spinal gun, a dorsal bridge, broadside turrets, blue stripes — but the downswept fins make it a winged shape, and at 5.2 units it is too short against the 700 m chart figure. What must change: lengthen to 7.0; drop the fins; move the superstructure aft into a raised stern block; keep the wedge.

- [ ] A slab with a forward wedge and a raised stern block; no wings or fins.
- [ ] 70 % of a Kilimanjaro-class in a profile pair; about three times a Normandy.
- [ ] One spinal muzzle on the axis; two broadside turrets a side.
- [ ] Blue-white livery, dark panel lines, blue-white drives.

## Movement and animation (brief §15.3, cruiser row)

- Bank up to 25°; pitch with vertical acceleration; the **nose leads the velocity vector** in a turn and the hull slides through on inertia, guns on target while the velocity lags.
- A lighter decaying shudder along the bore on every spinal shot (*proposal*; the brief names the dreadnoughts).
- Thruster points: the twin stern nozzles follow throttle; manoeuvring puffs at the bow cheeks (two) and the stern quarters (two).
- Death: 1.1 s for cruisers; a `ship_destroyed` with `cause 'reaper_beam'` splits the hull along the beam plane with an emissive edge (`fx-reaper-beam-split.png`).

## Frozen screenshot set

`e2e-screenshots/alliance_cruiser_bow.png`, `e2e-screenshots/alliance_cruiser_profile.png`, `e2e-screenshots/alliance_cruiser_3q.png`.

## Status

TARGET. A13 rebuilds; `tests/silhouette.test.ts` pins 7.0 / 0.18 / 0.14; INTEGRATION locks. The length change to 700 m is CORE's catalogue change (AP §3.2) and the collision radius follows it.
