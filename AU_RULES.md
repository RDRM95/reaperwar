# Alternate-universe rule engine

A timeline is a `RuleSet` (`src/timelines/rules.ts`): plain JSON, validated on import (`schema.ts`), never executed. Rules change the **effective statistics the simulation uses**, substitute weapons, scale scenario fleet counts and set strategic variables. They are never flavour text.

## Structure

- `organic` / `reaper`: 18 technology multipliers (mass accelerator damage/penetration/range, fire rate, heat capacity, barrier strength/regen, armour, hull, speed, sensors, electronic warfare, accuracy, fighter strength, torpedo damage, GARDIAN effectiveness, beam damage, crew quality). Canon = 1.
- `factionOverrides`: per-faction partial multipliers merged over `organic`.
- `special`: hyper-mass accelerators (dreadnought spinal gun → `apex_hyper_ma`), HADES rounds (kinetic penetrators with a nuclear warhead that detonates after penetration: rounds ignore 50 % of armour; barriers absorb only 60 % as much), Thanix availability (canon / fleet-wide cruiser refit / none), Reaper command vulnerability (each capital loss degrades Reaper coordination for ~30 s), indoctrination disabled.
- `fleetStrength`: per-faction multipliers on scenario ship counts (ignored when a scenario is built with `fleet_scaling: fixed`, which comparison mode uses).
- `strategic`: allied coordination (crew effectiveness), Reaper competence, indoctrination effectiveness, Reaper reinforcements, conventional victory possible, Crucible available, Shepard alive/effectiveness, Illusive Man indoctrinated, Cerberus stance, Harbinger/Catalyst operational, homeworld independence.

Prerequisites enforced on import: a dead Shepard has effectiveness 0; Cerberus control of the Reapers requires the Catalyst destroyed; an indoctrinated Illusive Man forces Cerberus hostile. Imported sets can never claim `canon` status.

## Presets

| Preset | Category | Key changes |
| --- | --- | --- |
| Canon Mass Effect 3 | canon | None. |
| Prepared Galaxy | AU | Fleets ×1.3–1.5, coordination 0.85, fleet-wide Thanix, modest crew/fire-rate bonuses. Reapers unchanged. |
| Humanity Ascendant | AU | Alliance only: MA damage ×1.5, barriers ×1.4, armour ×1.3, fleet ×2.2; Council coordination 0.35. |
| Cerberus Reformed | AU | Illusive Man unindoctrinated, Cerberus cooperative, Cerberus fleet ×2, EW/sensor bonuses. |
| Reaper Escalation | AU | Reaper fleet ×1.6, accuracy ×1.08, regen ×1.3, competence ×1.3, indoctrination ×1.3. |
| Prime/Apex — Successful Refuse | AU | Organic MA damage ×1.25 / penetration ×1.3, barriers ×1.35, armour ×1.3, hull ×1.15, fire rate ×1.1, sensors ×1.4, beams ×1.35; hyper-mass accelerators; HADES; fleet-wide Thanix; Reaper command vulnerability; coordination 0.9; homeworld independence; conventional victory possible; Cerberus Black Fleet cooperative. Reaper tech unchanged. |
| Cerberus Ascendant | AU | Shepard dead; Catalyst destroyed; indoctrination disabled; Illusive Man alone controls the Reapers; Harbinger independent; no Crucible. |
| Sovereign’s Triumph | AU, diverges 2183 | Saren’s override of the Citadel holds. Thanix none; Alliance ×0.8, turian ×0.6, asari ×0.5, salarian ×0.85, geth absent (0), Reapers ×1.3; coordination 0.1; Reaper competence ×1.1; indoctrination ×1.5; reinforcements ×1.5; no Crucible; Shepard dead. |
| The Collectors’ Harvest | AU, diverges 2185 | The suicide mission fails and the Alpha relay stands. Alliance ×0.8, quarian and geth absent (0), Reapers ×1.15; coordination 0.25; competence ×1.1; indoctrination ×1.3; reinforcements ×1.3; Shepard dead. |
| The Indoctrinated Council | AU, diverges 2185 | The Mnemosyne derelict is salvaged. Turian accuracy ×0.7, sensors ×0.8, crew ×0.85; asari accuracy ×0.75, sensors ×0.8, EW ×0.8; salarian accuracy ×0.75, sensors ×0.8, EW ×0.7; turian and asari fleets ×0.7, salarian ×0.6; coordination 0.2; competence ×1.3; indoctrination ×2. |
| Leviathan’s Bargain | AU, diverges 2186 | The Reapers reach Despoina first. Organic accuracy ×0.9, crew ×0.8; Reaper sensors ×1.4 and EW ×1.85 (the stand-in for thralled sensor and fire-control crews: the Reaper hulls are unchanged); coordination 0.3; competence ×1.4; indoctrination ×2. |
| Vigil’s Warning | AU, diverges 2183 | The Council believes Vigil’s archive in secret. Organic crew ×1.04; coordination 0.55; indoctrination ×0.4. No extra ships and no Reaper weakness. |
| The Geth–Quarian Concord | AU, diverges c. 1895 | No Morning War. Quarian crew ×1.2, EW ×1.4, accuracy ×1.1, barriers ×1.2, regeneration ×1.3, fleet ×1.9; geth crew ×1.2, regeneration ×1.3, sensors ×1.2, EW ×1.3, fleet ×2.4; canon coordination (a treaty ally under Citadel sanctions). |
| The Asari Disclosure | AU, diverges 2183 | The Athame beacon is shared. Organic MA damage ×1.15, barriers ×1.35, regeneration ×1.3, armour ×1.1, hull ×1.05, sensors ×1.25; asari barriers ×1.15 and crew ×1.1 on top; asari fleet ×1.25; coordination 0.65. |
| Turian Total War | AU, diverges 2183 | Total mobilisation. Turian fleet ×2.5, crew ×1.1, accuracy ×1.05. |
| Leviathan’s Covenant | AU, diverges 2186 | The Leviathans fight openly. Reaper command vulnerability (their interference in battle, not a weakness of the Reapers); indoctrination disabled; organic penetration ×1.3, sensors ×1.3, accuracy ×1.15; Reaper EW ×0.6, accuracy ×0.75; coordination 0.7; competence ×0.6. |
| The Conduit Protocol | AU, diverges 2183 | Relay locks. Reaper fleet ×0.4; coordination 0.7; reinforcements ×0.3; conventional victory possible. |
| Custom | custom | Starts identical to canon; editable, saveable, exportable. |

The ten timelines after Cerberus Ascendant (`src/timelines/alternates.ts`, design and review in `docs/apex/TIMELINES_V2.md`) each follow the trilogy up to a named divergence and change only what follows from it: a divergence changes what the organics know or do, never what the Reapers are. They use existing engine knobs only, and none uses Project Titan, HADES penetrators or the Valkyrie.

## Isolation guarantees (tested in `tests/timelines.test.ts`)

- `getPreset()` returns deep clones; mutating a returned set never changes canon.
- Canon effective stats equal catalogue values for every ship and weapon.
- Prime/Apex substitutions only occur when that rule set is active.
- Cerberus Ascendant and Prime/Apex are distinct continuities and share no special flags.
- The ten alternate timelines of `alternates.ts` are frozen throughout, validate with no warning and come back from `normaliseRules` unchanged (tested in `tests/alternateTimelines.test.ts`).

## Threat to the Reapers (measured scale)

Every built-in timeline carries a rating from 1 Negligible to 6 Existential of how dangerous its galaxy is to the Reapers **in conventional battle**. It is measured, not asserted. Design: `docs/apex/TIMELINES_V2.md` §1; the measured table: [`docs/apex/TIMELINE_THREAT.md`](docs/apex/TIMELINE_THREAT.md), written with `src/timelines/threatMeasured.ts` by `npm run timeline:threat`.

- **Reference engagement** (`src/scenarios/threatReference.ts`, SIMULATION_ESTIMATE, not a Quick Battle scenario): the Council-era navies in one line (Alliance, Hierarchy, Republics, Union, quarians, geth; Cerberus only when allied; a navy at fleet strength 0 is absent) against five Reaper groups, the Raid (2 capitals, 5 destroyers) up to the Harvest fleet (6 and 14), each scaled by the timeline’s own Reaper fleet strength, on seeds 1–4: twenty battles per timeline. The lines start 1.07 × the longest catalogue weapon range apart (59.9 nominal km today); the time limit is 3.2 × the time a Reaper capital at top speed needs to cross that gap (240 s today).
- **Formula**: index = 50 × (mean Reaper hull value lost + mean coalition hull value surviving), 0–100. Damage short of a kill counts toward the Reaper losses.
- **Tiers**: thresholds 17 / 30 / 48 / 62 / 87, fixed and never moved to rescue a label. The breaking point shown with each rating is the largest group, counted up from the Raid, that the coalition beats in at least 3 of 4 seeds, named as the timeline deploys it.
- **Not seen**: the Crucible and the Catalyst, a controlled Reaper fleet, Reaper reinforcements and every other campaign-only rule; drive attacks and the Apex Reaper doctrine until the battle engine implements them; heavy platforms (Sol scenarios only); readiness tiers. A hostile Cerberus never appears in the reference.
- **Labels**: the label is always the generated table’s. The ten new timelines declare an intended tier and a test requires the table to agree; the eight existing presets declare nothing and take whatever the table says. Each new timeline names one tuning lever, measured at both ends of its range on every run (one, The Indoctrinated Council’s, can only raise its index).
- **Re-basing**: a CORE change to weapon ranges, speeds or the time scale bumps `THREAT_FORMULA_VERSION`, regenerates the table and re-derives the thresholds from the preset-blind probe ladder (`npm run timeline:threat -- --probes`) before any preset is looked at. A run fails when more than 25 % of the battles end on the time limit.

Measured tiers when this was written (`TIMELINE_THREAT.md` is the authority and changes with the engine): 1 Negligible — Sovereign’s Triumph, Reaper Escalation; 2 Low — The Indoctrinated Council, Leviathan’s Bargain, The Collectors’ Harvest; 3 Moderate — Canon Mass Effect 3, Vigil’s Warning, Cerberus Reformed, Cerberus Ascendant; 4 Serious — The Asari Disclosure, The Geth–Quarian Concord; 5 Severe — Turian Total War, Leviathan’s Covenant, Prepared Galaxy, Humanity Ascendant; 6 Existential — The Conduit Protocol, Prime/Apex core, Apex legacy.

## World-state locks of the alternate timelines

Where a timeline’s story fixes a world state, campaign setup and the Quick Battle briefing preselect it, disable the contradicting choices and give the reason in an AU note (`ALTERNATE_META[id].worldState`, `lockWorldState`):

| Timeline | Locks |
| --- | --- |
| Sovereign’s Triumph | Destiny Ascension lost; Rannoch at war (campaign and Quick Battle); no Normandy; genophage “cure sabotaged” |
| The Collectors’ Harvest | Rannoch at war (campaign and Quick Battle); no Normandy; genophage “cure sabotaged” |
| The Geth–Quarian Concord | Rannoch at peace (campaign and Quick Battle) |

“Cure sabotaged” is the closest state to a cure that is never made: the krogan stay on Tuchanka, but the Salarian First Fleet still joins the war, and the lock’s note says so. A locked key a screen exposes is set only to a value that screen offers (the Battle of the Citadel’s own Ascension option, save or Sovereign, is left alone); in the briefing a key the scenario reads without a control is applied too and listed in the note. The campaign starts from the player’s choices with the locks applied on top. What the campaign cannot express is stated AU-prefixed in campaign setup and the codex: Sovereign’s Triumph opens on the 2186 map with the Citadel in allied hands; The Collectors’ Harvest opens at the canon 2186 start; the Concord’s two campaign fleets keep the Migrant Fleet and Geth Consensus Fleet names and hull lists as stand-ins; The Conduit Protocol’s Reaper fleets still move along the relay lanes.

Known limitations:

- A faction at fleet strength 0 is absent only in the threat reference. Quick Battle scenarios and the campaign keep one hull per class (`scaleCount` never scales a class below one hull).
- Comparison mode and custom battle ignore the world-state locks.
- Cerberus Ascendant, an existing preset with Shepard dead, still fields the Normandy by default in Quick Battle: the locks belong to the new timelines.

## Reference balance (identical fleets, `alliance_fleet_engagement`, seeds 7–9)

- Canon: Reaper victory; Alliance survival 7–8 %; 1–2 Reapers destroyed.
- Prime/Apex: Alliance victory; 7–19 ships lost including 1–3 dreadnoughts; all 12 Reapers destroyed.

Prime/Apex is deliberately a hard-won victory: the Reapers keep their weapons, numbers and doctrine.

## Campaign reference outcomes (AI-run, seeds 5/9/21, v0.6.0)

| Timeline | World state | Typical outcome |
| --- | --- | --- |
| Canon ME3 | defaults | Crucible victory around week 43; ~10 systems under occupation; Earth at ~55 % population. |
| Canon ME3 | genophage sabotaged + geth/quarian peace | Crucible victory around week 33 (two extra fleets). |
| Prepared Galaxy | defaults | Crucible victory around week 33. |
| Reaper Escalation | defaults | Narrow Crucible victory around week 48–49 with 10–11 systems harvested; some seeds end in annihilation of the allied fleets. |
| Prime/Apex | Crucible refused | Conventional victory around week 38 with every committed Reaper destroyed. |
| Cerberus Ascendant (war phase) | defaults | Defeat around week 53–56: no Crucible, the AI-run fleets are ground down. |

Ground forces slow the population harvest but not orbital bombardment of industry; competent Reapers (Escalation) land processing forces faster.

## Cerberus Ascendant post-war plan (2186–2206)

The post-war mode (`src/campaign/postwar.ts`) is an **alternate continuity** strategic model and is labelled as such on every screen. It is reachable from campaign setup or after winning a campaign under the Cerberus Ascendant preset.

- One turn is a quarter; the plan runs at most 80 quarters (2186–2206).
- Twelve budget programmes normalise to 100 %: Rebuild Earth, Reinforce Sol, Restore infrastructure, Assist the Systems Alliance, Reconstruct colonies, Support Council reconstruction, Reverse-engineer Reaper technology, Expand shipbuilding, Develop conventional fleets, Increase Cerberus influence, Negotiate with the Council, Prepare Reaper dismantlement.
- Eleven metrics (0–1): Earth recovery, Sol defence, infrastructure, colonies, Alliance relations, Council relations, Cerberus influence, stability, Reaper technology, shipyard capacity, dismantlement readiness; plus the conventional fleet point total.
- The 60 controlled Reapers are valued at 1 800 fleet points each. Humanity "stands alone" at 60 % of that total (54 000 points, 15 % less with Council relations ≥ 0.6). Orbital defence counts for up to 6 000 points.
- Dismantlement needs 30 % readiness, allows at most `floor(readiness × 6)` Reapers a quarter, and is **progressive**: the share of Reapers dismantled must be matched by conventional strength. The last Reapers leave orbit only once Sol defence is at 50 %.
- Defeat: stability below 8 %, a Council coalition (Council relations < 5 % while Cerberus influence < 30 %), the Reapers gone before humanity can stand alone, or 2206 with Reapers still in service. A late success is granted at 2206 with ≥ 80 % dismantled and ≥ 80 % of the required strength.
- Reference results (seeds 1–21): a fleet-first plan completes in 2204–2205; the default even allocation scrapes a late success; a research-heavy plan fails on Council relations.

All values are SIMULATION_ESTIMATE / AU_MODIFIED; nothing in this mode is presented as canon.
