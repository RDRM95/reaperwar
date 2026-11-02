# Sovereign-class Reaper capital ship (`reaper_capital`)

| | |
| --- | --- |
| Faction · role | reaper · `reaper_capital` |
| Length | 2,000 m — `CANON_CONFIRMED` (the codex gives the class a length of roughly two kilometres); render length **20.0 units** |
| Status | **TARGET** (AP §12 numbers; A12 builds; INTEGRATION locks) |
| Canon / AU | canon hull; original model |
| Builder today | `src/rendering/ships/reaper.ts` `buildReaperCapital()` = `buildReaper({ length: 11, arms: 6, armLengthFactor: 0.8, bodyRadiusFactor: 0.16 })`: 15.4 units overall by formula (`L × 0.5 + armLen + L × 0.1`), body radius 1.76 units, body width ≈ 0.23 of the overall; grey-brown palette (`materials.ts` `reaper.hull 0x3c414b`), bright red lights |
| Changes | A12: 20.0 units overall, body 55–60 %, arms ≈ 40 %, body width ≤ 0.14 L, `lengthUnits` computed from the template `Box3`; the AP §12 palette; layered plates on body **and** arms |
| Tracking designation | capitals are shown as `RC-nn` contact codes in the HUD and log (brief §12); Sovereign itself keeps its name |

## Three-view silhouette

- **Bow** (`az 180, el 0`): a hooded head seen face-on. The hood is a shallow dome of overlapping plate bands at the top; below it the six arms spread over the **lower 240°** like the open fingers of a hand hanging downward, so the dorsal 120° stays clear and the hood reads as a hood. The single aperture sits **low in the hood, below the body's centreline**, as one orange-red point with a thin iris ring; nothing else on the bow glows that colour. The body's cross-section is a tall ridged oval (six-fold ridging), far narrower than the arm spread.
- **Profile** (`az 90, el 0`): one long spine tapering aft from the hood to a point — the body (hood plus spine) is **55–60 % of the overall length**; the hood is the widest and tallest point and sits at the forward end of the body. The arms root on the lower-forward hood and sweep forward, bowing outward then curling in, their tips reaching **≈ 40 % of the overall length** ahead of the hood; the lowest arms hang below the body line. The spine tapers continuously (no bulb at the tail) and ends in the tail emitter.
- **Three-quarter** (`az 135, el 20`): a cuttlefish: hood, spine and six curling arms; overlapping plate bands on the body and along every arm; pale-blue seams tracing the plate edges and the arm joints; rows of deep crimson running lights along the spine ridges; the aperture the single bright point. Next to a Kilimanjaro-class it is twice the length and many times the bulk.

## Proportions (TARGET — binding within the relative tolerance of 0.08)

| Measure | Target | Notes |
| --- | --- | --- |
| length (z-extent) | **20.0 units** (2,000 m) | arm tips to tail emitter; `lengthUnits` is computed from the `Box3`, not by formula |
| beam / length | **0.34** (≈ 6.8 units) | the arm spread sets the beam, not the body |
| height / length | **0.34** (≈ 6.8 units) | hood top to the lowest arm |
| body (hood + spine) | 55–60 % of the overall (11–12 units) | AP §12 |
| arms | ≈ 40 % of the overall (≈ 8 units) | AP §12 |
| body width | ≤ 0.14 L (≤ 2.8 units) | `tests/models.test.ts` checks the `hull` mesh's `Box3` |
| arm distribution | six arms over the lower 240° | unchanged from today |
| hood | the widest point of the body; the spine tapers to a point | AP §12 / `SCALE_REFERENCE.md` |
| relation to dreadnoughts | `reaper_capital` z / `alliance_dreadnought_k` z = **2.0 ± 0.1**; / `alliance_dreadnought` (Everest) z = **2.25 ± 0.1** | AP §0.3 #26, pinned in `tests/silhouette.test.ts` |

## Signature features

1. **The hood**: layered forward shells stepping down toward the aperture, the widest point of the hull, with the arm roots under it.
2. **Six articulated arms**: segmented and tapering, two knuckle joints along each (today at ≈ 22 % and 50 % of the arm), a pale-blue seam along each arm's outer edge, plate bands on the arms as on the body.
3. **The long ridged spine**: six-fold ridging, overlapping plate bands, tapering to a point.
4. **The single aperture**: low in the hood, orange-red, with an iris ring; the beam leaves from here and a lens-flare sits on it while firing.
5. **Crimson running lights** in rows along the spine ridges (today 6 rows × 4), dying one by one at death.
6. **The tail emitter** at the extreme stern.

## Colours and lights (hex)

Reaper palette, recorded here verbatim from `ADOPTION_PLAN.md` §12 (brief §8.8 check): hull `0x0e1016` (metalness 0.85, roughness 0.32, emissive `0x02030a`), hullDark `0x07080c`, plates `0x161a22` with a cold dark-blue sheen (`0x1a2230`, envMapIntensity 1.6), seams thin pale blue `0x7fb4ff` (emissive 1.2), running lights deep crimson `0xd01030` (emissive 2.5), aperture orange-red `0xff5a1f` with a `0xffb060` iris (emissive 4.5); no brown anywhere.

| Element | Hex | Placement |
| --- | --- | --- |
| hull (spine, hood core) | `0x0e1016`, emissive `0x02030a` | the `hull` mesh |
| hullDark (arms, sockets) | `0x07080c` | the `arms` mesh, the aperture socket |
| plates | `0x161a22`, sheen `0x1a2230` (envMapIntensity 1.6) | overlapping bands on body and arms |
| seams | `0x7fb4ff` (emissive 1.2) | thin lines along each arm and along plate edges |
| running lights | `0xd01030` (emissive 2.5) | rows along the spine ridges; the tail emitter (*proposal*: same crimson) |
| aperture | `0xff5a1f` with iris `0xffb060` (emissive 4.5) | low in the hood, below the centreline; glow node with scale 2.2 so it blooms at distance |
| beam | core `0xff6a40`, glow `0xa00010` | `effects.md` §5; lens-flare billboard at the aperture while firing |
| barrier shell | `0xff6a4a` | hull-shaped shell including `plates` and `arms` geometry (`effects.md` §3) |
| far point / drive | `0xff2a1a` | the LOD point cloud and the far-spark tint |

Every Reaper material colour has blue ≥ red (`tests/models.test.ts`: no brown). Only Harbinger departs from this table (its sheet).

## Must read as (brief §10)

What exists today: six arms over the lower 240°, a hooded forward section with the aperture low in it, a ridged lathe body, red lights. What must change: the hull is too short (15.4 → 20.0 units), the body too fat (≈ 0.23 L → ≤ 0.14 L), the hood is not yet the widest point and the spine does not taper long enough (55–60 % of the overall), the palette reads grey-brown with bright orange-red seams instead of near-black with pale-blue seams and crimson lights, and the arms carry no plate bands.

- [ ] A cuttlefish: a hooded body with a long tapering spine and six curling arms, nothing else.
- [ ] Six arms, all over the lower 240°; the dorsal arc clear.
- [ ] The aperture low in the hood, one orange-red point; a red beam from it.
- [ ] Near-black graphite plating with a cold blue sheen; thin pale-blue seams; deep crimson running lights; no brown, no yellow-orange (that is Harbinger's).
- [ ] Layered, overlapping armour plates on the body and the arms.
- [ ] Colossal beside a dreadnought: 2 : 1 against a Kilimanjaro-class in length and far bulkier (`scale-sovereign-vs-kilimanjaro.png`).

## Movement and animation (brief §15.3, Reaper row)

- No banking. Slow body yaw: the simulation's Reaper anchor turns at ≤ 0.03 rad/s (AP §19 8.1) and the hull follows it; render-time smoothing only.
- **Seeded arm sway**: each arm sways a few degrees at the root with a phase from `Rng('anim')`, amplitude decaying toward the tip (*proposal*: ±3° at the root, periods of 6–10 s, no two arms in phase). The arms do not otherwise articulate (AP §17).
- **Drift**: when the Reaper repositions, its velocity lags the heading so the hull slides; the aperture faces the target while the hull keeps moving — the beam leaves the aperture toward the target without the hood turning.
- Eyes waking on an `advance` order: aperture emissive 0.3 → 1 over 0.8 s, staggered 0.25 s by deployment index; the running lights follow.
- Mission kill: aperture to 0.15, lights flicker then 30 % stay dark, tail emitter 0.3.
- Death (2.6 s, three stages): red-tinted gas shell, the aperture dies at stage 2, the running lights die one by one through stage 1.
- HADES weapons outage: one arm piece detaches as tumbling instanced debris and leaves an emissive stump — a visual only; the simulation models no limb loss.
- Thruster points: none visible; propulsion reads as the tail emitter's brightness following throttle (*proposal*).

## Frozen screenshot set

`e2e-screenshots/reaper_capital_bow.png`, `e2e-screenshots/reaper_capital_profile.png`, `e2e-screenshots/reaper_capital_3q.png` (gallery framings of README §5), plus `scale-sovereign-vs-kilimanjaro.png` (CD §6.3 #08: beside `alliance_dreadnought_k`, profile, equal distance).

## Status

TARGET. A12 rebuilds the template to the table above and verifies with a `Box3`; `tests/silhouette.test.ts` pins the length, both ratios and the two dreadnought relations; INTEGRATION flips this sheet and the JSON entry to LOCKED after the screenshot set is eyeballed. Open question for the lead: AP §12 gives every Reaper a `0xffb060` iris inside the `0xff5a1f` aperture while brief §8.8 reserves yellow-orange for Harbinger; this sheet follows AP §12 verbatim (the iris is a thin ring, the aperture reads orange-red) and Harbinger's sheet gives it the broader yellow-orange glow.
