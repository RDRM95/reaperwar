# Reaper destroyer (`reaper_destroyer`)

| | |
| --- | --- |
| Faction · role | reaper · `reaper_destroyer` |
| Length | 160 m — `CANON_CONFIRMED` (codex); render length **1.6 units** |
| Status | **TARGET** (AP §12; A12 builds; INTEGRATION locks) |
| Canon / AU | canon hull; original model |
| Builder today | `buildReaperDestroyer()` = `buildReaper({ length: 0.95, arms: 4, armLengthFactor: 0.75, bodyRadiusFactor: 0.2 })`: 1.28 units by formula (128 m against the 160 m the simulation collides with); the capital's lathe body shrunk, four arms |
| Changes | A12: 1.6 units; four legs dominate the silhouette; stubby spine; walking stance; the AP §12 palette |
| Designation | destroyers are shown as `RD-nn` contact codes (brief §12) |
| Simulation note | V2 calibration (AP §3.2): barriers 1,000 / hull 700 / armour 120 / regen 25 with the pause rule; speed 1.6, turn 16°/s — fast and nimble for its size; two Oculi aboard (extrapolation) |

## Three-view silhouette

- **Bow**: a squat **X of four legs** around a small body: two forward legs reaching ahead and down, two aft legs trailing, the body a short thick stub between them. The beam aperture sits low at the front, between the forward legs. Seen head-on the legs, not the body, set the width (beam 0.55 L) and the height (0.60 L: the hull stands taller than it is wide).
- **Profile**: the legs dominate: the forward pair sweeps forward and down from the body, the aft pair trails back and down, both with the capital's knuckled, tapering build; the spine is **stubby** — a short tail behind the aft legs rather than the capital's long taper. The body carries the same hood-and-plate language in miniature.
- **Three-quarter**: a walker — a four-legged Reaper standing in space with its legs splayed as if it were striding onto a surface; small hooded body, crimson joint lights, the aperture low at the front.

## Proportions (TARGET — binding)

| Measure | Target | Notes |
| --- | --- | --- |
| length (z-extent) | **1.6 units** (160 m) | pinned separately as 1.6 ± 0.1 in `tests/silhouette.test.ts` |
| beam / length | **0.55** (≈ 0.88 units) | leg spread |
| height / length | **0.60** (≈ 0.96 units) | hood top to the lowest foot; taller than wide |
| legs | dominate: *proposal* legs ≈ 60 % of the overall length, each leg's root-to-tip span ≥ the body length | AP §12 "four legs dominate" |
| spine | stubby: *proposal* ≤ 25 % of the overall behind the aft leg roots | AP §12 "stubby spine" |
| stance | walking: forward pair ahead and down, aft pair back and down | AP §12 / `SCALE_REFERENCE.md` |

## Signature features

1. **Four legs** in a walking stance, knuckled and tapering like the capital's arms, with plate bands.
2. A **short hooded body** with the plate language of the capital in miniature.
3. The **stubby spine** behind the aft legs.
4. The **aperture low at the front** between the forward legs, orange-red with an iris; a red beam from it.
5. **Crimson lights** at the leg joints and along the body ridges.

## Colours and lights (hex)

The AP §12 Reaper palette verbatim: hull `0x0e1016` (metalness 0.85, roughness 0.32, emissive `0x02030a`), hullDark `0x07080c`, plates `0x161a22` with a cold dark-blue sheen (`0x1a2230`, envMapIntensity 1.6), seams thin pale blue `0x7fb4ff` (emissive 1.2), running lights deep crimson `0xd01030` (emissive 2.5), aperture orange-red `0xff5a1f` with a `0xffb060` iris (emissive 4.5); no brown anywhere. Beam core `0xff6a40`, glow `0xa00010`; barrier shell `0xff6a4a`; far point `0xff2a1a`.

| Element | Placement |
| --- | --- |
| aperture | low at the front of the body, between the forward legs; glow node scale 2.2 |
| running lights | one at each leg knuckle (*proposal*), two rows along the body ridges |
| seams | along the outer edge of each leg and the plate edges |
| tail emitter | the stub's end, crimson (*proposal*) |

## Must read as

What exists today: a shrunken capital with four arms, far too small (1.28 units for a 160 m hull) and with the capital's long-tail proportions, so it reads as a small cuttlefish rather than a walker. What must change: 1.6 units; the legs must dominate (today the body is the biggest element); the spine must shorten to a stub; the walking stance (forward pair ahead, aft pair back) instead of all four arms sweeping forward alike; the palette.

- [ ] Four legs, walking stance; the legs are the silhouette.
- [ ] Short hooded body, stubby spine; taller than it is wide.
- [ ] The aperture low at the front; a red beam.
- [ ] Near-black graphite with pale-blue seams and crimson lights; no brown.
- [ ] About 0.8 × the Normandy's length and far bulkier; one-twelfth of a Sovereign-class.

## Movement and animation (brief §15.3, Reaper row, destroyer specifics)

- No capital-style ponderousness: with turn 16°/s and speed 1.6 the destroyer is the fastest Reaper; *proposal* bank up to 15° into turns so its runs read as deliberate rather than as a spinning capital.
- The four legs sway with the yaw (seeded from `Rng('anim')`, amplitude a few degrees at the root), so a turning destroyer looks as if it shifts its stance.
- Drift when repositioning; the aperture faces the target while the hull keeps moving.
- Eyes waking, mission kill and the three-stage death (1.1 s for destroyers) as the capital, scaled down; running lights die one by one.
- Thruster points: none visible; the tail stub's emitter brightness follows throttle (*proposal*).

## Frozen screenshot set

`e2e-screenshots/reaper_destroyer_bow.png`, `e2e-screenshots/reaper_destroyer_profile.png`, `e2e-screenshots/reaper_destroyer_3q.png`; `fx-dreadnought-under-fire.png` (CD §6.3 #07) frames two destroyers firing on a dreadnought.

## Status

TARGET. A12 builds; `tests/silhouette.test.ts` pins 1.6 ± 0.1 and the two ratios; INTEGRATION locks.
