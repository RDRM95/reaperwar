# Harbinger (`harbinger`)

| | |
| --- | --- |
| Faction · role | reaper · `reaper_capital` (unique per battle; `NAMED_FLAGSHIPS`; flagship tier `harbinger`) |
| Length | `ships.ts` today: `inferred(2400)`; V2 (AP §3.2): **`estimate(2200)`** — canon says Harbinger is larger than other Reapers and gives no size; 2,200 m is the simulation's boss-variant choice (`SIMULATION_ESTIMATE`, never `CANON_INFERRED`); render length **22.0 units** |
| Status | **TARGET** (AP §12; A12 builds; INTEGRATION locks) |
| Canon / AU | canon hull (the first and largest Reaper); original model |
| Builder today | `buildHarbinger()` = `buildReaper({ length: 13.2, arms: 6, armLengthFactor: 0.8, bodyRadiusFactor: 0.165, spines: true, tint: 0xffa040 })`: 18.48 units by formula; five dorsal cone spines; aperture glow tinted `0xffa040` |
| Changes | A12: 22.0 units overall; broader hood, longer and more splayed arms, pronounced spine ridges; the AP §12 palette with Harbinger's own yellow-orange aperture and seam glow |
| Designation | keeps its name in the HUD and log (brief §12); its destruction is the `flagship_destroyed` event (AP §22.2) |

## Three-view silhouette

- **Bow**: the Sovereign-class face with a **broader hood** — the dome of plate bands is wider relative to the body — and six arms splayed wider over the lower 240°, so the bow reads broader than a Sovereign-class at the same distance. The aperture, low in the hood, is **yellow-orange**: the only Reaper whose eye is not orange-red.
- **Profile**: the same hood-and-spine family, 10 % longer than a Sovereign-class, with the arms reaching **farther forward** (longer and more splayed) and **pronounced ridges along the dorsal spine** (today: five cone spines; the target is a continuous ridged crest rather than isolated cones). The seams along arms and plate edges glow yellow-orange instead of pale blue.
- **Three-quarter**: unmistakably Sovereign's kin and unmistakably the one: broader, longer-armed, crested, lit warm where every other Reaper is lit cold.

## Proportions (TARGET — binding)

| Measure | Target | Notes |
| --- | --- | --- |
| length (z-extent) | **22.0 units** (2,200 m) | 1.1 × Sovereign-class |
| beam / length | **0.38** (≈ 8.4 units) | the splayed arms |
| height / length | **0.38** (≈ 8.4 units) | hood crest to the lowest arm |
| hood | broader than the Sovereign-class hood: *proposal* hood width ≈ 0.16 L against the capital's ≤ 0.14 L body rule | AP §12 "broader hood" |
| arms | longer and more splayed: *proposal* ≈ 42–45 % of the overall (9.2–9.9 units) | AP §12 "longer splayed arms" |
| spine | ridges along the dorsal crest, body otherwise 55–60 % of the overall | AP §12 "spine ridges" |
| arm distribution | six arms over the lower 240° | as the capital |

## Signature features

1. The **broader hood** with the arm roots farther apart.
2. **Six long splayed arms**, the same segmented and knuckled build as the Sovereign-class, reaching farther forward.
3. The **ridged dorsal crest** along the spine.
4. The **yellow-orange aperture** with its iris and the **yellow-orange seam glow** — Harbinger's identification, and the only warm glow in the Reaper line.
5. Three beam emitters in the simulation (`reaper_capital_beam` ×3), all leaving the one aperture.
6. Running lights crimson and beams red like every Reaper (brief §8.8).

## Colours and lights (hex)

The AP §12 Reaper palette applies (hull `0x0e1016`, hullDark `0x07080c`, plates `0x161a22` with sheen `0x1a2230`, running lights `0xd01030`; no brown), with Harbinger's two exceptions from brief §8.8:

| Element | Hex | Placement |
| --- | --- | --- |
| aperture | **`0xffa040`** (today's Harbinger `glowColor`, kept) with iris `0xffd080` (*proposal*), emissive 4.5 | low in the hood |
| seams | **`0xffb060`** yellow-orange (*proposal*, replacing the pale blue `0x7fb4ff` of other Reapers), emissive 1.2 | along each arm and the plate edges |
| running lights | `0xd01030` crimson | spine ridges, as every Reaper |
| beam | core `0xff6a40`, glow `0xa00010` | red like every Reaper; lens flare at the aperture |
| barrier shell | `0xff6a4a` | hull-shaped shell |
| far point / drive | `0xff2a1a` | point cloud and far-spark tint |

The yellow-orange band is the binding rule (brief §8.8: "only Harbinger carries the yellow-orange aperture and seam glow"); the two hex values are proposals stage A may tune inside that band.

## Must read as

What exists today: the Sovereign family at 1.2 × scale with cone spines and an orange-tinted eye. What must change: 18.48 → 22.0 units; a visibly broader hood and longer, more splayed arms (today the arm factor is identical to the capital's); a ridged crest instead of five cones; the palette and the warm seams.

- [ ] Sovereign's family: hood, long spine, six arms over the lower 240°.
- [ ] Broader hood and longer, more splayed arms than a Sovereign-class beside it.
- [ ] A ridged crest along the dorsal spine.
- [ ] The only Reaper lit yellow-orange at the aperture and the seams; running lights still crimson, beam still red.
- [ ] 1.1 × the Sovereign-class length; the largest hull on the field except a liveship.

## Movement and animation (brief §15.3, Reaper row)

As `reaper_capital.md`: no bank, slow body yaw (anchor ≤ 0.03 rad/s), seeded arm sway from `Rng('anim')`, drift when repositioning, the aperture facing the target while the hull moves, eyes waking on the advance order. Harbinger-specific: mission kill (`flagship_mission_kill`) dims the aperture to 0.15 and flickers the lights; destruction (`flagship_destroyed`) runs the three-stage Reaper death and the wreck keeps a dim emissive ember for 20 s so the director's 6 s held shot has something to look at (A7). The 12-drone Oculus complement launches 2 per 0.4 s from the hood (the launch is a simulation extrapolation, labelled as such in the codex).

## Frozen screenshot set

`e2e-screenshots/harbinger_bow.png`, `e2e-screenshots/harbinger_profile.png`, `e2e-screenshots/harbinger_3q.png`; `sc-harbinger-mission-kill.png` (CD §6.3 #12) shows the dimmed aperture and flickering lights with active Reapers behind.

## Status

TARGET. A12 builds; `tests/silhouette.test.ts` pins 22.0 / 0.38 / 0.38; INTEGRATION locks. The length change (`inferred(2400)` → `estimate(2200)`) is CORE's catalogue change and moves the collision radius 1.2 → 1.1 km (CD §7.8 open question, decided in AP §3.2).
