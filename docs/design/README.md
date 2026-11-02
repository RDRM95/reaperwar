# Design lock-down — `docs/design/`

This folder is the reference for every ship class the renderer builds: one sheet per `SHIP_CLASS_LIST` id (fighter-sized craft share `fighters.md`, one row per class), the weapon-effect rules in `effects.md`, and the machine-readable silhouette targets in `silhouettes.json`. It implements brief §1 goal 4 and §5 ("design lock-down"), brief §10 (the likeness bar) and `ADOPTION_PLAN.md` §12 (D12). Stage D owns this folder; stage A builds against it; INTEGRATION measures and locks.

Everything here is original text describing original geometry. No sentence quotes or closely paraphrases the games' codex, descriptions or dialogue; no file references a game asset. Study material is described in §7.

## 1. Rules that bind every sheet

1. **Original work only.** Every model is original geometry in the faction's visual language; textures, sounds and strings are original. The owner's screenshots and the fan-made size chart are study material for the person modelling and are never committed (`SCALE_REFERENCE.md` records the chart's figures as study notes; nothing in this folder references a study image beyond that).
2. **Canon by default, AU by choice.** A sheet for an alternate-universe hull carries an **AU badge** section and says so in its first line. AU hulls in V2: `normandy_valkyrie`, `cerberus_dreadnought`, `cerberus_heavy_cruiser`, `sol_platform_heavy`, `alliance_super_dreadnought`, `turian_super_dreadnought`. `alliance_frigate_thanix` is a canon-shaped estimate under canon rules and an AU item where Apex timelines build it in numbers; `sol_defence_platform` and the Oculus complements are simulation estimates, labelled in the sheet, not AU.
3. **HADES wording.** HADES is a penetrator with a nuclear warhead ("HADES penetrators"); the forbidden "nuclear … rounds/slugs/shells" family never appears in this folder in any spelling (`tests/wording.test.ts` walks `docs/design/`).
4. **No hull counts are capped anywhere.** Nothing in these sheets limits how many hulls a battle fields; the only budgets named here are render budgets for effects (draw calls, pooled instances), which degrade visuals and never change the simulation.
5. **Honesty.** Each sheet says what exists in the builders today and what must change. A sheet never claims a model, an effect or a measurement that has not landed; numbers that are proposals rather than plan decisions are marked *proposal*.

## 2. Status and process: TARGET → LOCKED, MEASURE → LOCKED

Every class carries one status in its sheet and in `silhouettes.json`:

| Status | Meaning | Who sets it | What happens next |
| --- | --- | --- | --- |
| **TARGET** | A redesigned or new hull whose proportions are decided (`ADOPTION_PLAN.md` §12 table). The numbers are binding for the builder within the tolerance of §3. | Stage D, from the plan | Stage A builds the template to the numbers (A measures with a `Box3` before hand-over). `tests/silhouette.test.ts` checks it. INTEGRATION flips the status to LOCKED once the test holds and the screenshot set has been eyeballed. |
| **MEASURE** | An existing hull that V2 does not redesign. Its "must read as" features are frozen now; its proportion table is empty until it is measured. | Stage D | INTEGRATION runs `scripts/measure-silhouettes.ts`, pastes the measured `lengthUnits`, `beamToLength` and `heightToLength` into `silhouettes.json` and into the sheet's proportion table, and sets LOCKED. The test skips MEASURE classes. |
| **LOCKED** | Proportions and silhouette are frozen. | INTEGRATION | Later work polishes; it never redesigns (§4). |

The two paths are therefore TARGET → LOCKED for the fourteen classes with plan numbers and MEASURE → LOCKED for the rest. A LOCKED class returns to TARGET only through a new plan decision with new numbers, never through a builder's initiative.

TARGET classes (fourteen, numbers from `ADOPTION_PLAN.md` §12): `reaper_capital`, `harbinger`, `reaper_destroyer`, `alliance_dreadnought_k`, `alliance_dreadnought`, `alliance_cruiser`, `normandy_valkyrie`, `cerberus_dreadnought`, `cerberus_heavy_cruiser`, `sol_defence_platform`, `sol_platform_heavy`, `alliance_super_dreadnought`, `turian_super_dreadnought`, `reaper_oculus`.

MEASURE classes (twenty-seven): every other id, including the two SR-2 hulls (`normandy_sr2`, `alliance_frigate_thanix`): the plan gives them no silhouette numbers, stage A rebuilds their variants (sensor spine, squadron stripe) on the existing stealth hull, and INTEGRATION measures the delivered models. Their sheets carry a *proposed* proportion table for the builder's guidance; the JSON keeps the ratios `null` until measured.

## 3. Tolerance and the test

`silhouettes.json` has the exact shape of `ADOPTION_PLAN.md` §12:

```json
{ "tolerance": 0.08, "classes": { "<classId>": { "lengthUnits": n, "beamToLength": r, "heightToLength": r, "status": "TARGET" | "LOCKED" | "MEASURE" } } }
```

- Units: render units, **1 unit = 100 m**. `lengthUnits` is the z-extent of the template's bounding box (muzzle to stern, arm tips to tail for Reapers). `beamToLength` is x-extent / z-extent, `heightToLength` is y-extent / z-extent.
- **The tolerance is relative**: a class passes when `|measured − target| ≤ 0.08 × target` for the z-extent and for each ratio separately. An absolute 0.08 on a ratio of 0.16 would be a ±50 % band and would lock nothing (AP §12).
- Fighter-sized craft are rendered at the 2× small-craft convention (`KNOWN_ISSUES.md`), so their `lengthUnits` carry that convention: an 18 m fighter is 0.36 units, the 12 m Oculus 0.24 (the figure AP §12 gives). MEASURE fighters start from `2 × lengthM / 100` and are replaced by the measured value.
- `tests/silhouette.test.ts` (stage D, D5) builds every template headlessly with `getShipTemplate(id)` and `new THREE.Box3().setFromObject(group)`, asserts that every `SHIP_CLASS_LIST` id has a sheet or a `fighters.md` row and a JSON entry, compares TARGET/LOCKED classes within the tolerance, skips MEASURE classes, and pins the two Reaper relations of AP §0.3 #26: `reaper_capital` z / `alliance_dreadnought_k` z = 2.0 ± 0.1 and `reaper_capital` z / `alliance_dreadnought` (Everest) z = 2.25 ± 0.1, plus `reaper_destroyer` z = 1.6 ± 0.1. Until stage A's models are merged the test runs under `describe.skipIf(!process.env.V2_MODELS)`.
- `scripts/measure-silhouettes.ts` prints the measured triple for every class as JSON; INTEGRATION pastes the MEASURE rows (WB §6.5).

## 4. What builders may change

| While the class is… | A builder may | A builder may not |
| --- | --- | --- |
| TARGET | choose any geometry that lands inside the tolerance; add detail; move hardpoint-adjacent ornament (turrets, blisters, sensor masts) so the hardpoint offsets in `ships.ts` sit on plausible structure | move outside the tolerance; drop a "must read as" feature; change the faction palette (Reaper palette fixed by AP §12, organic palettes by `materials.ts`) |
| MEASURE | polish surfaces, panel lines, lights and emissive placement; fix a feature the "must read as" list names as missing | change proportions or the silhouette in a way the sheet does not already ask for (those classes are measured as delivered and then locked) |
| LOCKED | add detail at any LOD; adjust materials within the sheet's hex values; add emissive placement the sheet names | change proportions, part ratios or the silhouette; remove a signature feature; re-base the length |

Any change that a sheet forbids goes through a plan decision first (new TARGET numbers in AP §12, then a sheet edit by stage D or INTEGRATION), so later work polishes rather than redesigns (brief §1 goal 4).

## 5. The screenshot set

Each class has a frozen three-view set, captured by `scripts/cinematic-shots.mjs` item #06 (the hidden gallery scenario: one hull per class, paused, 1920 × 1080, software GL, Record mode so frames are deterministic):

| File | Framing (`{ az, el }` about the hull centre) | Shows |
| --- | --- | --- |
| `e2e-screenshots/<classId>_bow.png` | `{ az 180, el 0 }` — looking at the bow along −z | bow shape, beam, the gun muzzle(s), arm spread |
| `e2e-screenshots/<classId>_profile.png` | `{ az 90, el 0 }` — starboard side | length, height, superstructure steps, fins, spine |
| `e2e-screenshots/<classId>_3q.png` | `{ az 135, el 20 }` — forward starboard quarter, slightly above | the likeness check of brief §10: a reviewer who knows the games must recognise the class at a glance from this frame |

Naming: this folder and the script use `<classId>_bow.png`, `<classId>_profile.png`, `<classId>_3q.png`. `CINEMATIC_DESIGN.md` §6.3 #06 wrote the pattern as `model-<classId>-{bow,profile,quarter}.png`; the script, once written (D8), is the source of truth and the sheets follow it. "Frozen" means the capture recipe (scenario, framing, resolution, Record mode) is fixed, so the set can be re-taken identically after any change and compared. The PNG files are build output: they are never committed (`e2e-screenshots/` is output, WB §6.5); the CHANGELOG pastes the file list at release.

Supplementary frames the brief asks for are listed in the sheets that need them: the side-by-side scale shot (`scale-sovereign-vs-kilimanjaro.png`, #08), the super-dreadnought profile with the AU badge (`super-dreadnought-profile.png`, #10), the platform slew (`platform-slew.png`, #09), and the movement frames of brief §15.3 (`normandy_sr2_strike_bank.png`, `alliance_frigate_thanix_dark_vs_lit.png`, `normandy_sr2_vent.png`), which D8 adds to the script.

## 6. Sheet template

Every sheet has the same sections, in this order, so the silhouette test and a reviewer can find things:

1. **Header** — class name, id, faction, role, length (with provenance), status, AU badge when applicable, the builder that exists today and the stage A task that changes it.
2. **Three-view silhouette** — what the bow, profile and three-quarter frames must show.
3. **Proportions** — length : beam : height, the §12 numbers for TARGET classes (binding) or a proposed table for MEASURE classes (guidance), and the part ratios.
4. **Signature features** — the handful of shapes that make the class.
5. **Colours and lights** — hex values and where every emissive element sits. Faction drive colours (brief §10): Alliance blue-white `0x4fb8ff`, turian cyan `0x9fe0ff`, asari violet `0xd0a8ff`, salarian green `0xb8ffa0`, geth white `0xe8f0ff`, quarian amber `0xffe0a0`, Cerberus orange `0xffb060`, Reaper red `0xff2a1a` (`factions.ts` `engineColourHex`; the far-spark tint of `effects.md` uses the same values).
6. **Must read as** — the likeness checklist of brief §10: what a player who knows the games recognises at a glance, written as what exists and what must change.
7. **Movement and animation** — the role's notes from brief §15.3 (§8 below) with the class's thruster points and any class-specific behaviour.
8. **Frozen screenshot set** — the three file names and anything extra.
9. **Status** — TARGET / MEASURE / LOCKED and what moves it.

## 7. Study material

The person modelling studies the games' ships from screenshots they supply themselves and from the owner's size chart. Those images stay on their machine. The sheets carry only original descriptions written from public knowledge of the ships' shapes, and `SCALE_REFERENCE.md` carries the chart's figures as study notes. A sheet never says "match screenshot X"; it says what the silhouette must contain.

## 8. Movement and animation layer (brief §15.3) — role table

The simulation decides where ships go (`movement.ts`, CORE, brief §8.1); the renderer's **attitude and thruster animation layer** (stage A) makes the motion read as Mass Effect. Rules: render-time smoothing driven by simulation state only; any randomness from a seeded `Rng('anim')`; cost under 0.3 ms per frame at 400 hulls (vector maths only); nothing in the layer feeds back into the simulation. Binding numbers are the brief's; rows marked *proposal* are this folder's suggestions for roles the brief does not number, and stage A may tune them.

| Role | Bank into turns (roll ∝ lateral acceleration) | Pitch | Turn character | Thrusters and drives | Spinal recoil |
| --- | --- | --- | --- | --- | --- |
| Fighters, Oculus | not numbered by the brief; *proposal* up to 70° | with vertical acceleration | strafing passes with roll-outs, never orbits (§8.1) | instanced path: main-drive glow follows throttle only; no per-craft puffs | — |
| Line frigates | up to 55° | yes | straight flanking runs and turn-ins (§8.1) | wing-tip / nacelle and stern nozzles follow throttle; manoeuvring puffs at the nose cluster and wing roots when turning or braking | — |
| Stealth frigates (`normandy_sr2`, `alliance_frigate_thanix`) | up to 55°; fly like aircraft, rolling and pitching through their runs | yes | the strike run: dive from above or below the plane, line up, fire, roll away, pull up | wing-tip and ventral thrusters flare on hard turns; **silent = dark** (running lights off, drive glow off, a faint silhouette only); **venting = blue-white bloom from the radiator strips with a heat shimmer** | — |
| Cruisers | 25° | yes | the nose leads the velocity vector; the hull slides through turns on inertia, guns on target while velocity lags | stern nozzles follow throttle; puffs at the bow cheeks and stern quarters | a lighter decaying shudder along the bore (*proposal*; the brief names the dreadnoughts) |
| Dreadnoughts, super-dreadnoughts | 8° | small | ponderous; the whole hull turns to align the spinal gun; slides through turns | stern block nozzles; puffs along the sponsons and the bow quarters | a decaying recoil shudder along the bore on every spinal shot (Everest, Kilimanjaro, the super-dreadnought line) |
| Carriers, liveships | 8° (*proposal*: dreadnought limit) | small | keep distance but still manoeuvre and shoot (§8.6) | stern nozzles; puffs at the stern quarters | — |
| Fixed platforms | none: no propulsion beyond slow orbital drift | — | slew to bear at the class turn rate (2.5°/s standard, 2.0°/s heavy) | rim puffs while slewing (*proposal*) | shudder along each channel on every shot (*proposal*) |
| Reaper capitals, Harbinger | no bank | — | slow body yaw; the drift when repositioning; the aperture faces the target while the hull keeps moving | seeded arm sway (`Rng('anim')`), eyes waking on the advance order, lights dying on a mission kill | — |
| Reaper destroyer | *proposal* up to 15° | — | walking stance; the four legs sway with the yaw | as capitals, four legs | — |

Cameras: a strike camera follows a stealth frigate's run with lead and the director gains a `stealth strike` cue (stage B). The screenshot set includes the Normandy banking into a strike and a dark silent frigate beside a lit one (§5).

## 9. Index

| Sheet | Class | Status |
| --- | --- | --- |
| `reaper_capital.md` | Sovereign-class Reaper capital ship | TARGET |
| `harbinger.md` | Harbinger | TARGET |
| `reaper_destroyer.md` | Reaper destroyer | TARGET |
| `fighters.md` (row) | `reaper_oculus` Oculus | TARGET |
| `alliance_dreadnought_k.md` | Kilimanjaro-class dreadnought | TARGET |
| `alliance_dreadnought.md` | Everest-class dreadnought | TARGET |
| `alliance_cruiser.md` | Alliance cruiser (York-class language) | TARGET |
| `alliance_carrier.md` | Alliance carrier | MEASURE |
| `alliance_frigate.md` | Alliance frigate | MEASURE |
| `normandy_sr2.md` | Normandy SR-2 (command vessel) | MEASURE |
| `alliance_frigate_thanix.md` | SR-2-pattern stealth frigate | MEASURE |
| `fighters.md` (row) | `alliance_fighter` F-61 Trident | MEASURE |
| `normandy_valkyrie.md` | Normandy Valkyrie (AU) | TARGET |
| `alliance_super_dreadnought.md` | Olympus-class heavy dreadnought (AU) | TARGET |
| `sol_defence_platform.md` | Sol defence platform | TARGET |
| `sol_platform_heavy.md` | Sol heavy platform, super-accelerator (AU) | TARGET |
| `turian_dreadnought.md` | Hierarchy dreadnought | MEASURE |
| `turian_super_dreadnought.md` | Praetor-class heavy dreadnought (AU) | TARGET |
| `turian_cruiser.md` | Hierarchy cruiser | MEASURE |
| `turian_frigate.md` | Hierarchy frigate | MEASURE |
| `fighters.md` (row) | `turian_fighter` Hierarchy interceptor | MEASURE |
| `asari_dreadnought.md` | Republics dreadnought | MEASURE |
| `asari_cruiser.md` | Republics cruiser | MEASURE |
| `destiny_ascension.md` | Destiny Ascension | MEASURE |
| `salarian_dreadnought.md` | Union dreadnought | MEASURE |
| `salarian_cruiser.md` | Union cruiser | MEASURE |
| `salarian_frigate.md` | STG stealth frigate | MEASURE |
| `fighters.md` (row) | `salarian_fighter` Union interceptor | MEASURE |
| `geth_dreadnought.md` | Geth dreadnought | MEASURE |
| `geth_cruiser.md` | Geth cruiser | MEASURE |
| `geth_frigate.md` | Geth frigate | MEASURE |
| `fighters.md` (row) | `geth_fighter` | MEASURE |
| `quarian_liveship.md` | Liveship | MEASURE |
| `quarian_heavy.md` | Heavy Fleet warship | MEASURE |
| `quarian_cruiser.md` | Patrol Fleet cruiser | MEASURE |
| `fighters.md` (row) | `quarian_fighter` | MEASURE |
| `cerberus_dreadnought.md` | Cerberus Black Fleet dreadnought (AU) | TARGET |
| `cerberus_heavy_cruiser.md` | Cerberus heavy cruiser (AU) | TARGET |
| `cerberus_cruiser.md` | Cerberus cruiser | MEASURE |
| `cerberus_frigate.md` | Cerberus frigate | MEASURE |
| `fighters.md` (row) | `cerberus_fighter` | MEASURE |
| `effects.md` | weapon-effect rules, far-spark tint, draw-call table | — |
| `silhouettes.json` | machine-readable targets | — |

Forty-one classes: the thirty-two of v0.11 plus the nine V2 ids (`reaper_oculus`, `alliance_dreadnought_k`, `normandy_sr2`, `normandy_valkyrie`, `cerberus_heavy_cruiser`, `sol_defence_platform`, `sol_platform_heavy`, `alliance_super_dreadnought`, `turian_super_dreadnought`).

## 10. Priority order for likeness corrections (brief §5, AP §12)

Sovereign-class, destroyer, Kilimanjaro/Everest, Alliance cruiser and frigate, Normandy SR-2, turian dreadnought, asari dreadnought and Destiny Ascension, geth dreadnought, quarian liveship, Cerberus cruiser, salarian cruiser, Oculus; then the new AU hulls. The review loop of brief §10 (screenshot set → adversarial reviewer against the sheets and the chart notes → fixes) runs after each stage A pass; the sheets lock the result.
