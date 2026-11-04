# Timelines V2 — ten new alternate timelines and a measured “Threat to the Reapers” scale

Status: **design; nothing below is implemented yet.** Stage T, branch `stage/T-timelines`, written on base `ba4decf` (4 November 2026). The owner asked for more Mass Effect timelines, creative within the Mass Effect framework, with varying levels of threat to the Reapers. This document defines how that threat is measured, proposes ten new alternate timelines that span every level, places the eight existing presets on the same scale, and specifies the implementation for the stage that builds it.

Sources read: `src/timelines/rules.ts` (`RuleSet`, `TechModifiers`, the canon constants, `applyRulesToShip`, `applyRulesToWeapon`), `src/timelines/presets.ts`, `src/timelines/schema.ts` (`validateRuleSet`, `normaliseRules`, the ranges and consistency rules), `src/data/factions.ts`, `src/data/ships.ts`, `src/data/weapons.ts`, `src/data/types.ts`, `src/scenarios/index.ts` (`fleet()`, `scaleCount`, every scenario), `src/simulation/battle.ts` (`checkEnd`, the command-vulnerability rule), `src/simulation/damage.ts` (`hitProbability`), `src/simulation/results.ts`, `src/simulation/formations.ts`, `src/ui/app.ts`, `src/ui/screens/timelines.ts`, `briefing.ts`, `campaign.ts` (setup), `codex.ts`, `src/codex/entries.ts`, `src/campaign/engine.ts`, `src/core/lint.ts`, `src/core/provenance.ts`, `AU_RULES.md`, `LORE_REFERENCE.md`, `docs/V2_CINEMATIC_BRIEF.md` §14, `docs/apex/CALIBRATION_REPORT.md`, `docs/apex/CONTINUATION.md`, `tests/support/calibration.ts`, `scripts/calibration.ts`, `tests/support/async.ts`, `tests/timelines.test.ts`, `tests/battle.test.ts`, `tests/lint.test.ts`.

Every figure marked *design-time* was measured headless on `ba4decf` with a scratch prototype of the reference engagement of §1.1 (Appendix B gives its exact settings; the ten presets were measured from the literals of Appendix C). The CORE stage keeps changing battle trajectories (T9 landed after `ba4decf` and T10 is in progress), so **no figure here is a pin**: the implementation regenerates the table with `npm run timeline:threat`, and the labels follow that measurement.

## 0. Summary

- **The scale.** "Threat to the Reapers" is a 0–100 index measured on one fixed coalition-versus-Reaper engagement, fought against five Reaper groups of growing size (2 to 6 capital ships, the *rungs*) with four seeds each: **index = 50 × (mean Reaper hull lost + mean organic survival)** over the twenty battles. Six tiers with fixed thresholds **17 / 30 / 48 / 62 / 87**: 1 Negligible, 2 Low, 3 Moderate, 4 Serious, 5 Severe, 6 Existential. Canon measures **3 Moderate** (36.1).
- **Ten new timelines**, all ALTERNATE UNIVERSE, each diverging at a named event of established history: tier 1 **Sovereign’s Triumph**; tier 2 **The Collectors’ Harvest**, **The Indoctrinated Council**, **Leviathan’s Bargain**; tier 3 **Vigil’s Warning**; tier 4 **The Geth–Quarian Concord**, **The Asari Disclosure**; tier 5 **Turian Total War**, **Leviathan’s Covenant**; tier 6 **The Conduit Protocol**. Every one measured inside its intended tier at design time, 4.5 to 10.3 index points from the nearest boundary. The four in tiers 1–2 weaken the galaxy or strengthen the Reapers and change nothing in the organics’ favour.
- **The eight existing presets** keep their numbers; their measured labels are Reaper Escalation 1, canon 3, Cerberus Reformed 3, Cerberus Ascendant 3 (a surprise, explained in §3), Prepared Galaxy 5, Humanity Ascendant 5, Prime/Apex core 6, Apex legacy 6.
- **Implementation** (§4): `src/timelines/alternates.ts` (the ten presets and their metadata), an import and a spread in `presets.ts`, `src/timelines/threat.ts` (scale, formula, ratings), the generated `src/timelines/threatMeasured.ts`, `src/scenarios/threatReference.ts` (the engagement and the per-battle metrics), `scripts/timeline-threat.ts` (`npm run timeline:threat`, which also writes `docs/apex/TIMELINE_THREAT.md`), a threat badge on every timeline card and in the briefing and campaign pickers, a Timelines codex category, and `tests/alternateTimelines.test.ts`.

Design-time results for all eighteen presets, ordered by index:

| Tier | Timeline | id | Index | Reaper losses | Organic survival | Holds against (capitals) |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 1 Negligible | Reaper Escalation | `reaper_escalation` | 11.2 | 22 % | 0 % | none |
| 1 Negligible | Sovereign’s Triumph (new) | `sovereigns_triumph` | 12.4 | 25 % | 0 % | none |
| 2 Low | Leviathan’s Bargain (new) | `leviathans_bargain` | 22.1 | 38 % | 6 % | none |
| 2 Low | The Indoctrinated Council (new) | `indoctrinated_council` | 25.0 | 41 % | 9 % | none |
| 2 Low | The Collectors’ Harvest (new) | `collectors_harvest` | 25.3 | 36 % | 14 % | up to 2 |
| 3 Moderate | Canon Mass Effect 3 | `canon_me3` | 36.1 | 55 % | 17 % | up to 2 |
| 3 Moderate | Vigil’s Warning (new) | `vigils_warning` | 42.4 | 60 % | 25 % | up to 2 |
| 3 Moderate | Cerberus Reformed | `cerberus_reformed` | 43.1 | 63 % | 23 % | up to 2 |
| 3 Moderate | Cerberus Ascendant | `cerberus_ascendant` | 44.6 | 65 % | 24 % | up to 2 |
| 4 Serious | The Geth–Quarian Concord (new) | `geth_quarian_concord` | 57.0 | 76 % | 38 % | up to 3 |
| 4 Serious | The Asari Disclosure (new) | `asari_disclosure` | 57.5 | 77 % | 38 % | up to 3 |
| 5 Severe | Leviathan’s Covenant (new) | `leviathans_covenant` | 70.4 | 87 % | 54 % | up to 4 |
| 5 Severe | Prepared Galaxy | `prepared_galaxy` | 72.2 | 90 % | 54 % | up to 4 |
| 5 Severe | Turian Total War (new) | `turian_total_war` | 72.3 | 90 % | 54 % | up to 4 |
| 5 Severe | Humanity Ascendant | `humanity_ascendant` | 77.5 | 93 % | 61 % | up to 4 |
| 6 Existential | The Conduit Protocol (new) | `conduit_protocol` | 94.5 | 100 % | 89 % | up to 6 |
| 6 Existential | Prime/Apex — Apex core | `prime_apex` | 97.1 | 100 % | 94 % | up to 6 |
| 6 Existential | Prime/Apex — Apex legacy (high power) | `apex_legacy` | 97.2 | 100 % | 94 % | up to 6 |

## 1. The Threat to the Reapers scale

### 1.1 The reference engagement: `threat_reference`

The **threat reference engagement** (`threat_reference`; `SIMULATION_ESTIMATE` — a compressed stand-in like every scenario fleet, not a canon battle) sets a Council-era coalition in a battle line in deep space against a Reaper group. The same coalition fights five Reaper groups of growing size, the rungs, on four seeds each: twenty battles per timeline.

- Environment `deep_space`; `maxDuration` 240 s (the attrition judgement ends unfinished battles); `perspectiveSide` `'A'`; no world state, beats or distant layer.
- Positions are nominal km, the scenario convention (`deployFleet` applies `BATTLESPACE_SCALE`). The coalition line stands at z = −30 heading +z; the Reaper group at (0, 0, +30) heading −z, formation `strike_wedge`, side B, not player-controlled: 60 km apart, just outside the longest spinal-gun and capital-beam ranges.
- **Seeds 1, 2, 3, 4.**

**Coalition (side A).** One contingent per Council-era navy, each built with the scenario `fleet()` builder **with fleet scaling on** (no `fleet_scaling: fixed`), so every faction’s `fleetStrength` and `factionOverrides` act. The base counts below are the canon counts (`fleetStrength` 1); `fleet()` scales each class with `scaleCount` (rounded, never below one hull), limits carriers to ×1.5 and never scales unique hulls (`UNIQUE_CLASS_IDS`). The order of the contingents in `fleets` and of the classes inside each contingent is part of the definition, because it fixes the order of the random draws.

| # | Fleet id | Faction | Anchor (x, z) | Formation | Base counts, in this order | Conditional hulls (rule-driven) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `ref-alliance` | alliance | (−5, −30) | `line_abreast` | `alliance_dreadnought` 2, `alliance_carrier` 1, `alliance_cruiser` 3, `alliance_frigate` 3 | `normandy_sr2` 1 if `strategic.shepardAlive`; `normandy_valkyrie` 1 if `special.valkyrieAvailable`; `alliance_super_dreadnought` 1 if `special.superDreadnoughts` |
| 2 | `ref-turian` | turian | (−15, −30) | `line_abreast` | `turian_dreadnought` 2, `turian_cruiser` 3, `turian_frigate` 3 | `turian_super_dreadnought` 1 if `special.superDreadnoughts` |
| 3 | `ref-asari` | asari | (+5, −30) | `defensive_screen` | `asari_dreadnought` 1, `asari_cruiser` 3 | — |
| 4 | `ref-salarian` | salarian | (+15, −30) | `line_abreast` | `salarian_dreadnought` 1, `salarian_cruiser` 2, `salarian_frigate` 2 | — |
| 5 | `ref-quarian` | quarian | (+25, −30) | `defensive_screen` | `quarian_heavy` 1, `quarian_cruiser` 3 | — |
| 6 | `ref-geth` | geth | (−25, −30) | `strike_wedge` | `geth_dreadnought` 1, `geth_cruiser` 2, `geth_frigate` 2 | — |
| 7 | `ref-cerberus` | cerberus | (0, −42) | `strike_wedge` | `cerberus_cruiser` 2, `cerberus_frigate` 3 — **only when** `strategic.cerberusStance` is `cooperative` or `controls_reapers` (the predicate Cerberus Intervention and the campaign already use) | `cerberus_dreadnought` 1 if `isApexRules(rules)` |
| 8 | `ref-reapers` | reaper | (0, +30), side B | `strike_wedge` | `reaper_capital` *c*, `reaper_destroyer` *d* of the rung | — |

Under canon the coalition fields 36 hulls: 8 dreadnought-class ships, a carrier with its Tridents, 16 cruisers, 10 frigates and the Normandy. Harbinger never appears (a 4,000-point unique hull would dominate the losses term) and neither does the Destiny Ascension (a player-dependent survivor).

**Rungs (side B)**, before the timeline’s own `fleetStrength.reaper` scales them. Each capital carries its catalogue Oculi (8) and each destroyer 2.

| Rung | Name | Capitals | Destroyers | Canon at design time |
| --- | --- | ---: | ---: | --- |
| 1 | Raid | 2 | 5 | the coalition wins 4 of 4; index 92 |
| 2 | Strike group | 3 | 7 | the Reapers win 4 of 4; index 37 |
| 3 | Battlegroup | 4 | 10 | the Reapers win 4 of 4; index 25 |
| 4 | Assault fleet | 5 | 12 | the Reapers win 4 of 4; index 14 |
| 5 | Harvest fleet | 6 | 14 | the Reapers win 4 of 4; index 12 |

### 1.2 The formula

For one battle *b* (rung *k*, seed *s*), read when the battle has ended (by destruction or by the 240 s attrition judgement):

- **Reaper hull lost** L_b = Σ v_r·ℓ_r / Σ v_r over every side-B hull deployed with `role !== 'fighter'`, where v_r is the class `pointValue` (destroyer 260, capital 2,600) and ℓ_r = 1 if the hull was destroyed, otherwise 1 − hull_r / maxHull_r. Partial damage counts, so a capital left with a tenth of its hull is 90 % lost; barriers and armour do not count (barriers regenerate).
- **Organic survival** S_b = `result.sides.A.survivalPercent` / 100: the point value of the side-A hulls still alive over the point value deployed (non-fighters), the figure the results screen already prints.
- **Battle index** I_b = 50 × (L_b + S_b): 0 when the Reapers lose nothing and every organic hull dies, 100 when every Reaper dies and nothing is lost.

A timeline’s **threat index** is the mean over its twenty battles (five rungs × four seeds, equal weights): **I = 50 × (mean L + mean S)**. The **Reaper losses** and **organic survival** the UI shows are 100 × mean L and 100 × mean S. The table stores the index with one decimal and the tier is computed from the stored value.

Why these terms: while the organics lose, S is 0 and the index is half the Reaper losses, that is, how much the galaxy makes the Reapers pay; once they win, L is 1 and the index rises with what they keep, that is, how cheaply they win. Point values weigh a capital as ten destroyers, which is how the game already values them (campaign fleet points, the results screen). Survival counts kills only, like the results screen; Reaper losses count damage so that a nearly dead capital does not score like an untouched one.

### 1.3 The six tiers

The thresholds are fixed at **17, 30, 48, 62 and 87**. They sit between the index levels the ladder produces for coalitions that hold none, one, two, three or all five rungs (design-time prototypes: about 11 for a coalition that cannot hurt even a raid, 23 for one that trades but wins nothing, 36 for one that holds the raid, 51–57 for two rungs, 64–78 for three or four, 94–97 for all five). They are never moved to rescue a label.

| Tier | Label | Index | What it means in the reference | Presets at design time |
| --- | --- | --- | --- | --- |
| 1 | Negligible | below 17 | Loses every rung, the two-capital raid included; the Reapers lose under a third of their hull value. | Reaper Escalation, Sovereign’s Triumph |
| 2 | Low | 17 to below 30 | Loses every rung above the raid and wins the raid only sometimes or at a high price; the Reapers lose about 35–45 % of their hull value. | Leviathan’s Bargain, The Indoctrinated Council, The Collectors’ Harvest |
| 3 | Moderate | 30 to below 48 | Holds the raid and contests the three-capital strike group; the Reapers lose more than half their hull value. | **Canon**, Vigil’s Warning, Cerberus Reformed, Cerberus Ascendant |
| 4 | Serious | 48 to below 62 | Holds Reaper groups of up to three capitals and contests four. | The Geth–Quarian Concord, The Asari Disclosure |
| 5 | Severe | 62 to below 87 | Holds up to four capitals and contests five or six. | Leviathan’s Covenant, Prepared Galaxy, Turian Total War, Humanity Ascendant |
| 6 | Existential | 87 and above | Beats every rung up to the six-capital harvest fleet and keeps most of its ships. | The Conduit Protocol, Prime/Apex core, Apex legacy |

The scale measures how dangerous a galaxy is to the Reapers in conventional battle, not who wins the war: a Crucible, a Catalyst or a controlled Reaper fleet changes the campaign, not this index (§1.5). The UI says "measured in conventional battle" next to every rating.

### 1.4 Breaking point

Each rating also carries a **breaking point**: the capital count of the largest rung *k* such that the coalition wins (`winner === 'A'`) in at least 3 of 4 seeds on every rung up to *k*, or 0 when it does not hold the raid. The UI prints it as "holds against Reaper groups of up to *k* capitals" or "holds against no Reaper group in the reference". It explains a tier in one line; it does not decide it.

### 1.5 What the reference sees, and what it does not

Seen, because they change the battles: every organic and Reaper `TechModifiers` key; the `factionOverrides` of all seven organic factions (Cerberus only when allied); `special.thanixAvailability`, `hyperMassAccelerators`, `hadesRounds`, `reaperCommandVulnerability`, `indoctrinationDisabled`, `valkyrieAvailable` (the Valkyrie, and through it `legacyNova`) and `superDreadnoughts`; the `fleetStrength` of every faction including the Reapers (Cerberus only when allied); `strategic.alliedCoordination`, `reaperCompetence` and `indoctrinationEffectiveness` (through crew quality), `cerberusStance` (whether Cerberus fights beside the coalition) and `shepardAlive` (whether the Normandy is there).

Not seen today: `driveAttacks` and `reaperDoctrine: 'apex'` until the CORE stage implements them in battle (they will then act by themselves, since the Apex presets field Black Fleet dreadnoughts); `heavyPlatforms` (Sol scenarios only); `readinessScale` (the reference sets no readiness tiers); and the campaign-only variables `reaperReinforcements`, `conventionalVictoryPossible`, `crucibleAvailable`, `shepardEffectiveness`, `illusiveManIndoctrinated`, `harbingerOperational`, `catalystOperational` and `homeworldIndependence`. A hostile Cerberus never appears in the reference. Each new timeline marks its campaign-only knobs as such.

### 1.6 Why a ladder and a compact line (design-time evidence)

A single engagement was tried first and rejected, because its outcome flips like a switch:

- One 74-hull coalition against one Reaper group: canon measured **83.7, 42.6 and 25.8** against 4, 5 and 6 capitals (with 10, 12 and 14 destroyers). One extra capital moved canon by 40 points. At any fixed size, every timeline a little stronger than canon reads Severe or Existential and every timeline a little weaker reads Negligible.
- Against the six-capital group alone, Prepared Galaxy (83.4) and Humanity Ascendant (88.0 at a 240 s limit) sat with the Apex presets; the top three tiers could not be told apart.
- The five-rung ladder averages five such switches set at five strengths, so the index rises smoothly with a timeline’s real strength and spreads the eighteen presets from 11 to 97.

Where the contingents stand matters too, so the line is compact and on one front. With the contingents spread to ±40 km and staggered in depth, the flank fleets engaged late: a geth–quarian probe measured 53.1 and canon 33.4. On the compact line (±25 km, one depth) they measured 67.3 and 36.1. Stacking every contingent on one anchor removes position bias altogether (67.2 and 47.5) but overlaps the formations, which a battle that may one day be shown on screen should not do. The compact line keeps the remaining bias small without overlap.

Small base counts keep twenty battles per timeline affordable, at a price in granularity: `scaleCount` rounds per class, so a multiplier between about 0.5 and 1.49 cannot change a one-hull class, and `alliance` 0.6, 0.65 and 0.7 all give 1 DN, 1 CV, 2 CA, 2 FF. Every new timeline therefore lists the order of battle it actually produces in the reference, and none relies on a value that changes nothing there without saying so.

### 1.7 Runtime and noise

On the 4-CPU dev container at `ba4decf`, one reference battle took **1.24 s on average and 2.96 s at most** (Apex legacy against the six-capital harvest fleet), measured sequentially over 80 battles of the four heaviest presets: inside the 3 s budget. Twenty battles per preset and eighteen presets make about 7.5 minutes sequentially; four parallel jobs measured all eighteen in 2 min 24 s.

Seed noise: the standard deviation of a preset’s per-seed index (the mean over the five rungs of one seed) was 0.2–7.4 points across the presets and probes (0.4–4.9 for the ten chosen timelines), so a four-seed mean carries a standard error of about 0.1–3.7 points (0.2–2.5 for the ten). Every new timeline sits 4.5–10.3 points inside its band, about two standard errors at worst. Two existing presets sit closer: Cerberus Reformed (43.1) and Cerberus Ascendant (44.6) are 4.9 and 3.4 points under the tier-4 floor. Their labels may change when the engine changes; that is reported, not corrected.

### 1.8 Keeping declared tiers honest as the engine changes

Each new timeline declares its intended tier (`ALTERNATE_META[id].declaredTier`), and the test of §4.11 requires the declared tier to equal the tier the generated table implies. When `npm run timeline:threat` at a release puts a new timeline outside its declared band:

1. Move only that timeline’s documented **tuning lever** (named in its section, with a range that keeps its story true), one step at a time toward the band’s centre, re-measuring with `npm run timeline:threat -- --only <id>`.
2. Never move a threshold, never change an existing preset’s numbers, and never change the formula or the reference engagement to rescue a label.
3. If the lever’s range runs out, change the declared tier only together with a story-consistent text change, and report it in the stage log.

The existing presets declare nothing: their label is whatever the table says.

## 2. Ten new alternate timelines

Common to all ten: `category: 'au'`; the `description` begins with `ALTERNATE UNIVERSE.`; every text is original writing in the spirit of Mass Effect and quotes or closely paraphrases nothing from the games or the codex; the history is canon up to the divergence point and changes only what follows from it; no new faction, hull, weapon or engine knob is needed; none uses Project Titan, HADES penetrators or the Valkyrie, which stay the Apex presets’ signature; every value lies inside the schema ranges, passes `validateRuleSet` with no warning and comes back from `normaliseRules` unchanged (verified at design time for the literals of Appendix C). In `ALTERNATE_PRESETS`, and so in every timeline list, they are ordered by declared tier and then by divergence year.

### 2.0 The suggested ideas, judged

| Suggestion | Decision | Why |
| --- | --- | --- |
| Sovereign’s Triumph | **Kept**, tier 1 | The strongest Reaper-favouring divergence in canon. Losing the Thanix is a lore consequence the engine expresses exactly (`thanixAvailability: 'none'`). |
| The Collectors’ Harvest | **Kept**, tier 2 | Uses Mass Effect 2’s own failure condition and adds what follows: no Arrival, so the Reapers’ delay is lost, and Rannoch stays at war. |
| The Indoctrinated Council | **Kept, with a concrete divergence**, tier 2 | "Councillors are indoctrinated" needs a mechanism. The derelict Reaper at Mnemosyne indoctrinated the team studying it in canon; here the Council salvages it in 2185. Mechanically it is sabotage (accuracy, sensors, electronic warfare) plus fleets held back. |
| Turian Total War | **Kept**, tier 5 | One navy at total war. ×2.2 measured 64.0, two points above the tier-5 floor, so it fields ×2.5. |
| Geth–Quarian Concord | **Kept**, tier 4 | Divergence at the Morning War. Only two contingents change, which honestly caps it at Serious. |
| Vigil’s Warning | **Kept, trimmed**, tier 3 | Screening, doctrine and an earlier Crucible search stay. "Reaper weak points" is dropped (the Prothean archive records how the Protheans lost) and moves to Leviathan’s Covenant, whose authors made the Reapers’ makers. The earlier Crucible search is story only: the engine has no head-start knob, and the history line says so. |
| The Asari Disclosure | **Kept**, tier 4 | A galaxy-wide defensive uplift, distinct from Prepared Galaxy (more ships) and the Apex presets (Project Titan). |
| Leviathan’s Covenant | **Kept**, tier 5 | Shielding, revealed movements and disrupted coordination, plus Reaper anatomy (the first Reaper was made in the Leviathans’ image), which is what lifts it out of tier 3: the soft knobs alone are worth only a few points. |
| The 2184 Accords | **Replaced** | It duplicates Prepared Galaxy (joint exercises, coordination 0.85) and Prime/Apex (a surviving Shepard unites the galaxy). In canon Shepard is dead from late 2183 to 2185, so a 2184 testimony needs the surviving-Shepard divergence Prime/Apex already owns. |
| One of my own | **The Conduit Protocol** (tier 6) and **Leviathan’s Bargain** (tier 2) | The Conduit Protocol is a route to Existential that is neither Apex nor a new weapon: the Reapers built the relays, and the Conduit proves a relay can be built, and so keyed, by others. Locking the network divides the harvest (`fleetStrength.reaper` 0.4). Leviathan’s Bargain mirrors the Covenant at the same divergence point, shows how far one moment can swing the threat (tier 2 against tier 5), and is the set’s plainest "Reapers stronger" timeline. |

None of the ten duplicates a family of brief §14 (Early Beacon, First Contact Ascendant, One Humanity, Prothean Victory, Dark Lane, HFY: Terran Hegemony, player civilisation, Multiverse): none needs a new faction, hull or technology family.

Tiers 1–2 (enforced by a structural test, §4.11): Sovereign’s Triumph, The Collectors’ Harvest, The Indoctrinated Council and Leviathan’s Bargain change only knobs in the Reapers’ favour — organic fleets or technology down, Reaper fleets, technology or competence up, coordination down, indoctrination up — and none in the organics’ favour.

The ten timelines follow. In each "Reference order of battle" row, DN is a dreadnought, CV a carrier, CA a cruiser, FF a frigate, HV a quarian heavy ship and SR2 the Normandy; the Reaper groups are the five rungs after the timeline’s `fleetStrength.reaper`.

### 2.1 Sovereign’s Triumph — `sovereigns_triumph` — tier 1 Negligible

| Field | Value |
| --- | --- |
| Tagline | The Citadel relay opened in 2183. The Reapers did not have to wait three more years. |
| Divergence | **2183** — Battle of the Citadel: Saren’s override of the Citadel holds and Sovereign opens the Citadel relay to dark space. |
| Intended tier | 1 Negligible |
| Design-time measurement (`ba4decf`, §1.7) | index **12.4** → tier 1 Negligible; Reaper losses 25 %, organic survival 0 %; holds against no Reaper group; per rung (wins of 4) 24 (0/4) · 19 (0/4) · 10 (0/4) · 5 (0/4) · 4 (0/4) |
| Reference order of battle | coalition 27 hulls — Alliance 2 DN, 1 CV, 2 CA, 2 FF; Hierarchy 1 DN, 2 CA, 2 FF; Republics 1 DN, 2 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 1 HV, 3 CA; Geth 1 DN, 1 CA, 1 FF; Reaper groups (capitals/destroyers) 3/7, 4/9, 5/13, 7/16, 8/18 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect up to the assault on the Citadel (2183): Saren, Sovereign, the geth attack and the Council aboard the Destiny Ascension. The divergence is that Shepard never breaks the override. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. In 2183 Saren’s lock on the Citadel is never broken: the station’s arms stay sealed, the Council dies aboard the Destiny Ascension and Sovereign opens the Citadel relay for the fleet waiting in dark space. The Reapers enter the heart of Council space three years before canon, with no Sovereign wreck left behind to teach anyone the Thanix and no time to search Prothean ruins for a Crucible. Each species meets the harvest alone, and every battle faces more Reapers than the canon war ever did.

History changes (`historyChanges`):

1. 2183: Saren’s override of the Citadel holds; the arms stay sealed and Sovereign opens the Citadel relay to dark space.
2. The Council dies aboard the Destiny Ascension; the Citadel Fleet and the Alliance Fifth Fleet are destroyed in the Serpent Nebula, and Shepard falls in the Presidium.
3. No Reaper wreck is salvaged, so the Thanix cannon is never developed.
4. The harvest begins at the Citadel; nobody searches the Prothean archive on Mars, and there is no Crucible.
5. Without a Council or a shared command, every species defends its own space alone.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `special.thanixAvailability` | `'none'` | The Thanix was reverse-engineered from Sovereign’s wreck, which does not exist here; every Thanix mount falls back to the conventional cruiser accelerator (the engine’s `none` rule). |
| `fleetStrength.alliance` | `0.8` | The Fifth Fleet is lost at the Citadel. Reference: 2 DN, 1 CV, 2 CA, 2 FF. |
| `fleetStrength.turian` | `0.6` | The Citadel Fleet was mostly turian, and Palaven is struck first. Reference: 1 DN, 2 CA, 2 FF. |
| `fleetStrength.asari` | `0.5` | The Destiny Ascension and the Republic guard die with the Council. Reference: 1 DN, 2 CA. |
| `fleetStrength.salarian` | `0.85` | The Union is caught before any build-up. No change to the reference’s small contingent (1 DN, 2 CA, 2 FF); acts in the scenarios and the campaign. |
| `fleetStrength.geth` | `0.5` | No geth–quarian peace and no geth ally; a token contingent stands in (the engine never scales a class below one hull). Reference: 1 DN, 1 CA, 1 FF. |
| `fleetStrength.reaper` | `1.3` | The fleet arrives together through the Citadel relay at the centre of the galaxy instead of strung out from its edge. Reference Reaper groups: 3/7, 4/9, 5/13, 7/16, 8/18. |
| `strategic.alliedCoordination` | `0.1` | No Council and no joint command. |
| `strategic.indoctrinationEffectiveness` | `1.5` | Reapers inside Council space from the first day of the war. |
| `strategic.reaperCompetence` | `1.1` | The harvest runs to its design for the first time in this cycle. |
| `strategic.reaperReinforcements` | `1.5` | Campaign only: the whole fleet comes through the Citadel. |
| `strategic.crucibleAvailable` | `false` | Campaign only: no Crucible. |
| `strategic.shepardAlive / shepardEffectiveness` | `false / 0` | Shepard dies in the Presidium and the Normandy SR-2 is never built: no Normandy in the reference (schema rule: a dead Shepard has effectiveness 0). |

Unchanged on purpose: Organic and Reaper technology (the 2183 navies field what they had), Harbinger and the Catalyst operational, Cerberus hostile under an indoctrinated Illusive Man.

Codex “established canon” line (`canonBasis`): In 2183 Saren reached the Citadel through the Conduit and locked its arms while Sovereign and a geth fleet attacked. Shepard broke the lock with data recovered on Ilos, and the combined fleets destroyed Sovereign after Saren died.

Release tuning lever (§1.8): `fleetStrength.reaper` within `[1.25, 1.5]` — lowering it raises the index; 1.3 and 1.35 give the same counts in the reference.

### 2.2 The Collectors’ Harvest — `collectors_harvest` — tier 2 Low

| Field | Value |
| --- | --- |
| Tagline | The Normandy never came back through the Omega 4 relay. The human Reaper woke, and the Reapers came early. |
| Divergence | **2185** — The assault on the Collector base fails beyond the Omega 4 relay. |
| Intended tier | 2 Low |
| Design-time measurement (`ba4decf`, §1.7) | index **25.3** → tier 2 Low; Reaper losses 36 %, organic survival 14 %; holds against up to 2 capitals; per rung (wins of 4) 85 (4/4) · 19 (0/4) · 11 (0/4) · 8 (0/4) · 4 (0/4) |
| Reference order of battle | coalition 29 hulls — Alliance 1 DN, 1 CV, 2 CA, 2 FF; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 1 HV, 2 CA; Geth 1 DN, 1 CA, 1 FF; Reaper groups (capitals/destroyers) 2/6, 4/8, 5/12, 6/14, 7/17 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect 2 up to the suicide mission (2185): the Collectors, the Omega 4 relay and the human Reaper. The failure of the mission is AU (in canon the base is stopped even when Shepard dies). |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. In 2185 the Normandy is destroyed beyond the Omega 4 relay: Shepard and the crew are lost and the Collectors finish the human Reaper. The abductions from human colonies go on, nobody destroys the Alpha relay in the Bahak system, and the Reapers enter batarian space months early and in one mass. No one brokers peace at Rannoch or unites the Council races, and the Alliance meets the invasion after a year spent hunting Collectors.

History changes (`historyChanges`):

1. 2185: the Normandy SR-2 is destroyed at the Collector base; Shepard and the crew are killed.
2. The Collectors complete the human Reaper and keep raiding human colonies; the Alliance strips its fleets to hunt them.
3. The Alpha relay is never destroyed: the Reapers reach batarian space months ahead of canon, and together.
4. Rannoch stays at war and no one unites the Council races: the quarian and geth fleets never join the coalition.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `fleetStrength.alliance` | `0.65` | A year of colony losses and Collector hunts. Reference: 1 DN, 1 CV, 2 CA, 2 FF. |
| `fleetStrength.quarian / fleetStrength.geth` | `0.5 / 0.5` | Rannoch stays at war; token contingents only. Reference: quarian 1 HV, 2 CA; geth 1 DN, 1 CA, 1 FF. |
| `fleetStrength.reaper` | `1.2` | The human Reaper joins the harvest and the Reapers arrive concentrated through the Alpha relay. Reference Reaper groups: 2/6, 4/8, 5/12, 6/14, 7/17. |
| `strategic.shepardAlive / shepardEffectiveness` | `false / 0` | No Normandy in the reference; no Shepard in the campaign. |
| `strategic.alliedCoordination` | `0.25` | Nobody brings the species together. |
| `strategic.indoctrinationEffectiveness` | `1.3` | The Reapers’ agents work unexposed: no one stops the indoctrinated Project Base team or uncovers the others. |
| `strategic.reaperReinforcements` | `1.3` | Campaign only: the earlier, unbroken arrival. |

Unchanged on purpose: Technology on both sides, the Crucible (the Alliance still finds the plans on Mars), Cerberus hostile.

Codex “established canon” line (`canonBasis`): In 2185 Shepard, rebuilt by Cerberus, took the Normandy SR-2 through the Omega 4 relay to the Collector base near the galactic core and destroyed the human Reaper the Collectors were building from abducted colonists.

Release tuning lever (§1.8): `fleetStrength.alliance` within `[0.65, 0.8]` — 0.8 restores the second Alliance dreadnought and raises the index; do not raise fleetStrength.reaper above 1.2: at 1.25 the two-capital raid gains a third capital and the index falls to about 14 (measured).

### 2.3 The Indoctrinated Council — `indoctrinated_council` — tier 2 Low

| Field | Value |
| --- | --- |
| Tagline | A dead Reaper was towed home for study. By 2186 it had friends on the Council. |
| Divergence | **2185** — A Council salvage task force recovers the derelict Reaper at Mnemosyne instead of letting it fall into the brown dwarf. |
| Intended tier | 2 Low |
| Design-time measurement (`ba4decf`, §1.7) | index **25.0** → tier 2 Low; Reaper losses 41 %, organic survival 9 %; holds against no Reaper group; per rung (wins of 4) 68 (2/4) · 23 (0/4) · 18 (0/4) · 12 (0/4) · 4 (0/4) |
| Reference order of battle | coalition 30 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 1 DN, 2 CA, 2 FF; Republics 1 DN, 2 CA; Union 1 DN, 1 CA, 1 FF; Migrant Fleet 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect 2’s derelict Reaper (2185): a Reaper dead for millions of years orbits Mnemosyne and indoctrinated the Cerberus team studying it; Shepard’s team took the IFF and the wreck fell. The salvage is AU. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. After Shepard’s team recovers the Reaper IFF in 2185, an STG task force that had been tracking Cerberus reaches the derelict Reaper over Mnemosyne before it falls and tows it to a hidden Council research station. The dead machine still indoctrinates: through its researchers its influence reaches the councillors’ staffs and the turian, asari and salarian admiralties. By 2186 fleets are held back on plausible pretexts, fire-control and sensor software is quietly corrupted, and every deployment reaches the Reapers before it reaches the front.

History changes (`historyChanges`):

1. 2185: an STG task force salvages the derelict Reaper at Mnemosyne instead of letting it fall into the brown dwarf.
2. The wreck’s residual indoctrination spreads from the research station into the councillors’ staffs and the turian, asari and salarian admiralties.
3. Compromised admirals hold fleets in reserve and corrupt fire control, sensors and electronic warfare across the Council navies.
4. The Reapers learn every deployment in advance; the Alliance, kept outside the programme, is untouched.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `factionOverrides.turian` | `{ accuracy: 0.8, sensors: 0.8, crewQuality: 0.85 }` | Corrupted fire-control and sensor software; compromised officers. |
| `factionOverrides.asari` | `{ accuracy: 0.85, sensors: 0.8, electronicWarfare: 0.8 }` | Corrupted targeting and electronic-warfare suites. |
| `factionOverrides.salarian` | `{ accuracy: 0.85, sensors: 0.8, electronicWarfare: 0.7 }` | The STG’s own systems were compromised first. |
| `fleetStrength.turian / asari / salarian` | `0.7 / 0.7 / 0.6` | Fleets held in reserve. Reference: turian 1 DN, 2 CA, 2 FF; asari 1 DN, 2 CA; salarian 1 DN, 1 CA, 1 FF. |
| `strategic.alliedCoordination` | `0.2` | Orders are contradicted and nobody trusts the Council staffs. |
| `strategic.indoctrinationEffectiveness` | `2.0` | Schema maximum: the wreck’s influence runs through the command chain. |
| `strategic.reaperCompetence` | `1.3` | The Reapers know every deployment. |

Unchanged on purpose: The Alliance, the quarian and geth contingents, technology on the Reaper side, Shepard, the Crucible.

Codex “established canon” line (`canonBasis`): In 2185 Shepard’s team boarded a Reaper that had been dead for millions of years in orbit of the brown dwarf Mnemosyne and recovered its IFF. The Cerberus scientists studying the wreck had been indoctrinated by it, and the derelict was lost to the brown dwarf after the team escaped.

Release tuning lever (§1.8): `fleetStrength.turian` within `[0.6, 0.8]` — 0.75 restores the second turian dreadnought and raises the index (measured 31.0 with turian/asari 0.75, salarian 0.65 and milder sabotage).

### 2.4 Leviathan’s Bargain — `leviathans_bargain` — tier 2 Low

| Field | Value |
| --- | --- |
| Tagline | The Reapers found Despoina first. The Leviathans chose to outlive the cycle, and lent the harvest their minds. |
| Divergence | **2186** — The Reapers reach Despoina before Shepard; the surviving Leviathans bargain for their survival. |
| Intended tier | 2 Low |
| Design-time measurement (`ba4decf`, §1.7) | index **22.1** → tier 2 Low; Reaper losses 38 %, organic survival 6 %; holds against no Reaper group; per rung (wins of 4) 54 (1/4) · 23 (0/4) · 19 (0/4) · 10 (0/4) · 5 (0/4) |
| Reference order of battle | coalition 36 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect 3 up to the search for the Leviathans (2186): Despoina, the Leviathans’ thralls, their creation of the intelligence behind the Reapers. Their bargain with the Reapers is AU; in canon Shepard reaches them first. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. In 2186 the Reapers find Despoina before anyone else, and the last Leviathans, who created the intelligence that built the Reapers, buy their survival with service. They give the harvest their oldest arts: the hold they keep on thralls in every port and fleet, and the concealment that hid them from the Reapers for aeons. Organic crews fight beside officers who are no longer their own, against Reaper hulls that slide out of every firing solution.

History changes (`historyChanges`):

1. 2186: the Reapers locate Despoina before Shepard’s search does; the surviving Leviathans negotiate instead of fighting.
2. In exchange for being spared, the Leviathans turn their thralls in allied ports and fleets against the war effort.
3. The Leviathans teach the Reapers the concealment that hid them for aeons; Reaper hulls become far harder to target.
4. Indoctrination and thrall control reinforce each other, and trust between allied commands collapses.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `reaper.electronicWarfare` | `1.8` | Leviathan concealment: the Reaper capital’s ECM 0.35 → 0.63, about −21 % on organic hit chance against capitals. |
| `reaper.sensors` | `1.4` | The Reapers see through the thralls’ eyes. |
| `organic.crewQuality / organic.accuracy` | `0.8 / 0.9` | Thralled officers and gunners in every navy. |
| `strategic.indoctrinationEffectiveness` | `2.0` | Thrall control amplifies indoctrination (schema maximum). |
| `strategic.reaperCompetence` | `1.4` | The harvest gains the Leviathans’ knowledge of organic minds. |
| `strategic.alliedCoordination` | `0.3` | No one knows whose orders are their own. |

Unchanged on purpose: Every fleet strength: the bargain changes how the fleets fight, not how many there are. Shepard, the Crucible, Cerberus hostile.

Codex “established canon” line (`canonBasis`): In 2186 Dr. Ann Bryson’s research put Shepard on the trail of the Leviathans, the race that created the intelligence that created the Reapers, hidden for aeons on Despoina behind their thralls. In canon Shepard found them first and persuaded them to join the war.

Release tuning lever (§1.8): `reaper.electronicWarfare` within `[1.5, 2.0]` — higher lowers the index (1.6 with organic crew 0.85 and no accuracy change measured 30.9, inside tier 3; the values above measured 22.1).

### 2.5 Vigil’s Warning — `vigils_warning` — tier 3 Moderate

| Field | Value |
| --- | --- |
| Tagline | Ilos told the whole story in 2183. The Council believed it, and learned how the Protheans lost. |
| Divergence | **2183** — Vigil’s complete archive leaves Ilos with Shepard and is authenticated by Council scientists. |
| Intended tier | 3 Moderate |
| Design-time measurement (`ba4decf`, §1.7) | index **42.4** → tier 3 Moderate; Reaper losses 60 %, organic survival 25 %; holds against up to 2 capitals; per rung (wins of 4) 94 (4/4) · 63 (2/4) · 25 (0/4) · 16 (0/4) · 14 (0/4) |
| Reference order of battle | coalition 36 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect up to Ilos (2183): Vigil, the Conduit and the Prothean account of the Citadel trap. The complete archive and its acceptance by the Council are AU. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. In 2183 the whole of Vigil’s archive leaves Ilos with Shepard, and the Council cannot dismiss fifty thousand years of Prothean records. The galaxy learns how the Protheans fell: the Citadel taken first, commands hollowed out by indoctrinated agents, Reaper fleets that faltered whenever their capital ships died. Screening keeps indoctrinated officers out of the fleets and joint doctrine improves, but the archive holds no weapon that could have saved the Protheans, and no extra warships are built.

History changes (`historyChanges`):

1. 2183: Vigil’s full archive is recovered from Ilos and authenticated by Council scientists.
2. The Council accepts the Reaper threat on Prothean evidence, and every navy adopts indoctrination screening.
3. Fleet doctrine takes from the Prothean record that Reaper groups falter when their capital ships are destroyed.
4. The Mars archive is searched from 2184 (story only: the campaign’s Crucible clock is unchanged).
5. No new weapons and no extra warships: the archive is a record of how the Protheans lost.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `special.reaperCommandVulnerability` | `true` | The Prothean record of Reaper coordination failing after capital losses becomes doctrine (engine: each capital kill adds 0.6 to every Reaper fleet’s coordination penalty, which decays over 30 s). |
| `strategic.indoctrinationEffectiveness` | `0.4` | Screening: the crew penalty from Reaper presence falls from 8 % to 3.2 %. |
| `strategic.alliedCoordination` | `0.55` | A believed warning brings slightly closer cooperation. |

Unchanged on purpose: Technology and every fleet strength on both sides, Shepard, the Crucible (available; its head start is story only, the engine has no knob for it).

Codex “established canon” line (`canonBasis`): In 2183 Shepard reached Ilos, where Vigil, a Prothean VI, explained how the Reapers had used the Citadel to cut off the Prothean empire’s leadership, and gave Shepard the data that broke Saren’s hold on the Citadel.

Release tuning lever (§1.8): `strategic.alliedCoordination` within `[0.5, 0.65]` — removing the command vulnerability measured 39.4; adding organic accuracy 1.05 measured 46.8–47.3, too close to the tier-4 boundary.

### 2.6 The Geth–Quarian Concord — `geth_quarian_concord` — tier 4 Serious

| Field | Value |
| --- | --- |
| Tagline | The quarians recognised the geth instead of shutting them down. Three centuries later, Rannoch builds warships for both. |
| Divergence | **c. 1895** — The quarian government recognises the geth instead of ordering their shutdown; the Morning War never happens. |
| Intended tier | 4 Serious |
| Design-time measurement (`ba4decf`, §1.7) | index **57.0** → tier 4 Serious; Reaper losses 76 %, organic survival 38 %; holds against up to 3 capitals; per rung (wins of 4) 95 (4/4) · 89 (4/4) · 51 (1/4) · 31 (0/4) · 19 (0/4) |
| Reference order of battle | coalition 47 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 2 HV, 6 CA; Geth 2 DN, 5 CA, 5 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon up to the geth’s first signs of self-awareness, about three hundred years before Mass Effect (c. 1895). Everything after the divergence is AU, including a 2183 in which Saren has no geth army. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. About three centuries before 2183 the quarians answer their creations’ first questions about themselves with recognition instead of a shutdown order. There is no Morning War and no Migrant Fleet: Rannoch remains a quarian world shared with the geth, the quarians keep their Citadel embassy, and the geth never split into a heretic faction for Sovereign to recruit. By 2186 the Concord fields a homeworld navy crewed by quarians flying with geth intelligences aboard, beside a geth fleet that has had three hundred years of peace to grow.

History changes (`historyChanges`):

1. c. 1895: the quarian government recognises the geth as people; the order to shut them down is never given.
2. No Morning War and no Migrant Fleet: the quarians keep Rannoch, its industry and their Citadel embassy.
3. Quarian warships fly with geth intelligences aboard, with better barriers, electronic warfare and crews than any refugee fleet could field.
4. The geth never divide: there are no heretics for Sovereign, and the geth fleet grows for three hundred years.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `fleetStrength.quarian` | `1.9` | A homeworld navy instead of a flotilla of converted civilian hulls. Reference: 2 HV, 6 CA. |
| `fleetStrength.geth` | `2.4` | Three centuries of uninterrupted geth growth. Reference: 2 DN, 5 CA, 5 FF. |
| `factionOverrides.quarian` | `{ crewQuality: 1.2, electronicWarfare: 1.4, accuracy: 1.1, kineticBarrierStrength: 1.2, barrierRegen: 1.3 }` | Geth intelligences as co-pilots and fire controllers; geth-tuned barrier emitters. |
| `factionOverrides.geth` | `{ crewQuality: 1.2, barrierRegen: 1.3, sensors: 1.2, electronicWarfare: 1.3 }` | Quarian engineering on geth hulls, with no need for Reaper code. |
| `strategic.alliedCoordination` | `0.6` | The Concord’s networked command links the coalition. |

Unchanged on purpose: Every other navy, all Reaper values, Shepard, the Crucible, Cerberus hostile.

Codex “established canon” line (`canonBasis`): About three hundred years before 2183 the quarians’ geth servants began to show signs of self-awareness. The quarians tried to shut them down, lost the Morning War and fled Rannoch in the Migrant Fleet; by 2183 a heretic faction of geth served Sovereign.

Release tuning lever (§1.8): `fleetStrength.geth` within `[2.0, 2.6]` — measured 53.6 at geth 2.2 / quarian 1.8 and 57.0 at 2.4 / 1.9.

### 2.7 The Asari Disclosure — `asari_disclosure` — tier 4 Serious

| Field | Value |
| --- | --- |
| Tagline | In 2183 the Republics opened the Temple of Athame. Their head start became everyone’s. |
| Divergence | **2183** — After Sovereign’s attack the asari councillor and the matriarchs disclose the Prothean beacon in the Temple of Athame. |
| Intended tier | 4 Serious |
| Design-time measurement (`ba4decf`, §1.7) | index **57.5** → tier 4 Serious; Reaper losses 77 %, organic survival 38 %; holds against up to 3 capitals; per rung (wins of 4) 94 (4/4) · 88 (4/4) · 57 (1/4) · 29 (0/4) · 20 (0/4) |
| Reference order of battle | coalition 37 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 4 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon: the beacon in the Temple of Athame and the asari technological lead it fed (revealed in 2186). The 2183 disclosure is AU. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. Sovereign’s attack persuades the asari councillor and the matriarchs that a secret kept for millennia is no longer worth keeping, and in 2183 the Prothean beacon in the Temple of Athame is opened to Council scientists. Three years of shared study carry the Republics’ lead in barrier projection, sensors and element zero engineering to every navy, and the Republics, no longer hiding the source of their advantage, build openly. The galaxy meets the Reapers with asari-grade defences.

History changes (`historyChanges`):

1. 2183: the asari disclose the Prothean beacon hidden in the Temple of Athame to the Council.
2. Joint research spreads asari barrier, sensor and element zero engineering to every Council navy by 2186.
3. More efficient element zero cores let spinal guns hit harder, and hulls gain Prothean-pattern plating.
4. The Republics expand their fleet openly, and trust between the Council races deepens.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `organic.kineticBarrierStrength` | `1.35` | Asari barrier projection for every navy. |
| `organic.barrierRegen` | `1.3` | Faster barrier cycling from the same research. |
| `organic.sensors` | `1.25` | Asari sensor suites. |
| `organic.massAcceleratorDamage` | `1.2` | More efficient element zero cores drive heavier rounds for the same heat. |
| `organic.armourStrength / organic.hullIntegrity` | `1.1 / 1.05` | Prothean-pattern plating. |
| `factionOverrides.asari` | `{ kineticBarrierStrength: 1.15, crewQuality: 1.1 }` | The Republics already had most of it, so their barriers gain less; their crews have trained with it for centuries. |
| `fleetStrength.asari` | `1.25` | The Republics build openly. Reference: 1 DN, 4 CA. |
| `strategic.alliedCoordination` | `0.65` | The disclosure buys trust. |

Unchanged on purpose: All Reaper values, every other fleet strength, Shepard, the Crucible.

Codex “established canon” line (`canonBasis`): The asari kept a Prothean beacon hidden in the Temple of Athame on Thessia for thousands of years, and it fed their technological lead; the secret came out only in 2186, when the Reapers attacked Thessia.

Release tuning lever (§1.8): `organic.massAcceleratorDamage` within `[1.1, 1.25]` — measured 53.2 at 1.15 and 57.5 at 1.2.

### 2.8 Turian Total War — `turian_total_war` — tier 5 Severe

| Field | Value |
| --- | --- |
| Tagline | After Sovereign, the Hierarchy did what turians do: every citizen served and every yard built warships. |
| Divergence | **2183** — After the Battle of the Citadel the Primarch places the Hierarchy on a total-war footing. |
| Intended tier | 5 Severe |
| Design-time measurement (`ba4decf`, §1.7) | index **72.3** → tier 5 Severe; Reaper losses 90 %, organic survival 54 %; holds against up to 4 capitals; per rung (wins of 4) 96 (4/4) · 90 (4/4) · 86 (4/4) · 56 (2/4) · 33 (0/4) |
| Reference order of battle | coalition 49 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 5 DN, 8 CA, 8 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon: the Battle of the Citadel (2183) and turian society (service from the age of fifteen, the largest navy in Citadel space, the volus as a client race). The 2183 mobilisation is AU. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. The Citadel Fleet’s losses in 2183 convince the Primarch that Shepard’s warning is a military fact, and the Hierarchy mobilises as only a society built on universal service can. For three years reserve fleets are recommissioned, colony yards build at war tempo and the volus treasury pays for it. By 2186 the Hierarchy fields about two and a half times its canon fleet with crews drilled for this war, while the other Council races, as alarmed by the build-up as they are reassured, mobilise no faster than in canon.

History changes (`historyChanges`):

1. Late 2183: the Primarch places the Hierarchy on a total-war footing in answer to Sovereign’s attack.
2. Reserve fleets are recommissioned and colony yards build at war tempo for three years, financed by the volus.
3. The Hierarchy enters 2186 with about two and a half times its canon fleet and crews drilled against Reaper tactics.
4. The other Council races watch the build-up warily and mobilise no faster than in canon.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `fleetStrength.turian` | `2.5` | Total mobilisation. Reference: 5 DN, 8 CA, 8 FF. |
| `factionOverrides.turian` | `{ crewQuality: 1.1, accuracy: 1.05 }` | Three years of war drill. |

Unchanged on purpose: Every other value is canon.

Codex “established canon” line (`canonBasis`): Turians serve in the military from the age of fifteen, the Hierarchy fields the largest navy in Citadel space and the volus are its client race. The Citadel Fleet took heavy losses against Sovereign in 2183, but the Hierarchy did not mobilise against the Reapers before they struck Palaven in 2186.

Release tuning lever (§1.8): `fleetStrength.turian` within `[2.2, 2.8]` — measured 64.0 at 2.2 (too close to the tier-5 floor) and 72.3 at 2.5.

### 2.9 Leviathan’s Covenant — `leviathans_covenant` — tier 5 Severe

| Field | Value |
| --- | --- |
| Tagline | At Despoina the Leviathans stopped hiding. The makers of the Reapers’ maker went to war. |
| Divergence | **2186** — At Despoina the Leviathans join the war openly instead of as a hidden asset. |
| Intended tier | 5 Severe |
| Design-time measurement (`ba4decf`, §1.7) | index **70.4** → tier 5 Severe; Reaper losses 87 %, organic survival 54 %; holds against up to 4 capitals; per rung (wins of 4) 98 (4/4) · 90 (4/4) · 80 (4/4) · 53 (2/4) · 30 (0/4) |
| Reference order of battle | coalition 36 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect 3’s Leviathan (2186): Despoina, the Leviathans, their thralls, their creation of the intelligence behind the Reapers and the first Reaper made in their image. Their open war is AU. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. When Shepard reaches Despoina in 2186, the Leviathans conclude that hiding has failed and commit everything they have to the war. Their hold over minds shields allied crews from indoctrination, their thralls across the galaxy report every Reaper movement, and their knowledge of how the Reapers were made shows gunners where the plating is thinnest. They cannot command a Reaper, but their presence unsettles one: Reaper fire control and coordination falter wherever the Leviathans fight.

History changes (`historyChanges`):

1. 2186: the Leviathans of Despoina join the war openly rather than as a hidden asset.
2. Leviathan mental shielding protects allied crews; indoctrination no longer reaches the fleets.
3. Thralls in every sector track Reaper movements, and Leviathan knowledge of Reaper construction guides allied targeting.
4. Leviathan interference degrades Reaper targeting, electronic warfare and coordination in battle.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `special.indoctrinationDisabled / strategic.indoctrinationEffectiveness` | `true / 0` | Leviathan shielding of allied minds. |
| `organic.sensors` | `1.3` | Thrall reports of Reaper movements. |
| `organic.accuracy / organic.massAcceleratorPenetration` | `1.15 / 1.3` | The Leviathans know Reaper anatomy: the first Reaper was made in their image. |
| `reaper.accuracy / reaper.electronicWarfare` | `0.75 / 0.6` | Leviathan interference unsettles Reaper fire control and masking. |
| `strategic.reaperCompetence` | `0.6` | Disrupted Reaper coordination. |
| `special.reaperCommandVulnerability` | `true` | The Leviathans know the command structure their creation built. |
| `strategic.alliedCoordination` | `0.7` | Thralls relay orders between allied fleets. |

Unchanged on purpose: Every fleet strength, Reaper durability and firepower, Shepard, the Crucible.

Codex “established canon” line (`canonBasis`): In 2186 Shepard followed Dr. Ann Bryson’s research to Despoina, where the Leviathans, who created the intelligence that created the Reapers, had hidden for aeons behind their thralls; the first Reaper had been made in their image. Shepard persuaded them to join the war.

Release tuning lever (§1.8): `reaper.accuracy` within `[0.7, 0.8]` — measured 80.2 at accuracy 0.7 with electronicWarfare 0.5, and 70.4 at 0.75 / 0.6.

### 2.10 The Conduit Protocol — `conduit_protocol` — tier 6 Existential

| Field | Value |
| --- | --- |
| Tagline | The Protheans built one relay of their own. By 2186 the galaxy could lock the rest against their builders. |
| Divergence | **2183** — A joint Alliance–STG team begins studying the Prothean Conduit on Ilos. |
| Intended tier | 6 Existential |
| Design-time measurement (`ba4decf`, §1.7) | index **94.5** → tier 6 Existential; Reaper losses 100 %, organic survival 89 %; holds against up to 6 capitals; per rung (wins of 4) 98 (4/4) · 97 (4/4) · 94 (4/4) · 92 (4/4) · 92 (4/4) |
| Reference order of battle | coalition 36 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Migrant Fleet 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 1/2, 1/3, 2/4, 2/5, 2/6 |
| Provenance | `AU_MODIFIED`. Canon: Ilos and the Conduit (2183), the Reapers as builders of the mass relay network and the Citadel as its master relay. Relay locks are AU. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. After 2183 the Conduit, the small relay the Prothean scientists of Ilos built for themselves, is studied by a joint Alliance and Salarian Union team. Its design shows how a relay chooses what it carries, and by 2186 the Council can lock the relays the Reapers built against the Reapers themselves. The harvest has to cross the galaxy at ordinary faster-than-light speeds and reaches each battle in scattered groups, while the organic fleets still move through the network at will.

History changes (`historyChanges`):

1. 2183–2185: a joint Alliance–STG team studies the Prothean Conduit on Ilos.
2. 2186: the Council deploys relay locks, and the Reapers can no longer travel through the network they built.
3. Reaper fleets cross between systems at ordinary FTL speeds and reach each battle in scattered groups.
4. The organic fleets keep the relay network and concentrate faster than the Reapers can.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `fleetStrength.reaper` | `0.4` | Each battle meets the part of the harvest that has crossed by ordinary FTL. Reference Reaper groups: 1/2, 1/3, 2/4, 2/5, 2/6. |
| `strategic.reaperReinforcements` | `0.3` | Campaign only: reinforcements trickle in. |
| `strategic.alliedCoordination` | `0.7` | Fleets and orders still move through the network. |
| `strategic.conventionalVictoryPossible` | `true` | Campaign flag: the harvest can be beaten without the Crucible. |

Unchanged on purpose: All technology on both sides (the protocol changes where the Reapers are, not what they are), every organic fleet strength, Shepard, the Crucible.

Codex “established canon” line (`canonBasis`): The Conduit on Ilos was a small mass relay built by Prothean scientists, and Saren and Shepard used it in 2183 to reach the Citadel. The Reapers built the mass relay network, and the Citadel itself is a relay to dark space.

Release tuning lever (§1.8): `fleetStrength.reaper` within `[0.35, 0.45]` — the probe under the earlier spread layout measured 70.1 at 0.5, inside tier 5.

## 3. The eight existing presets on the scale

Measured exactly like the new ones; **their numbers do not change**, and their label is the measurement.

| Preset | Index | Tier | Reading |
| --- | ---: | --- | --- |
| Canon Mass Effect 3 | 36.1 | 3 Moderate | Holds a two-capital raid every time and loses everything larger while taking more than half the Reapers’ hull value with it: the canon war, in which Reapers die but the harvest wins. |
| Prepared Galaxy | 72.2 | 5 Severe | Thirty to fifty per cent more ships, fleet-wide Thanix and modest crew and rate-of-fire gains hold Reaper groups of up to four capitals. "More of what they already had" is worth a great deal under square-law attrition, and the label says so. |
| Humanity Ascendant | 77.5 | 5 Severe | Only the Alliance changes, but ×2.2 with heavier guns and barriers; it contests even the six-capital group. |
| Cerberus Reformed | 43.1 | 3 Moderate | Cerberus beside the coalition (×2, better electronic warfare) adds a contingent but does not change which rungs hold; 4.9 points under the tier-4 floor. |
| Reaper Escalation | 11.2 | 1 Negligible | Reaper groups 1.6 times larger (the raid becomes three capitals) with better regeneration and crews: the coalition holds nothing, and the Reapers lose a fifth of their hull value. |
| Prime/Apex — Apex core | 97.1 | 6 Existential | Wins every rung with 94 % survival. |
| Prime/Apex — Apex legacy (high power) | 97.2 | 6 Existential | Indistinguishable from Apex core here: the Legacy Nova is one gun in a 67-hull coalition. |
| Cerberus Ascendant | 44.6 | 3 Moderate | **The surprise.** Its premise, the Illusive Man commanding the Reaper fleet, is a strategic outcome the reference cannot express. What the battles see is a coalition with Cerberus beside it, indoctrination switched off and no Normandy (Shepard is dead). The label follows the measurement, and the badge’s "measured in conventional battle" says why. 3.4 points under the tier-4 floor. |

## 4. Implementation design

### 4.1 Files and ownership

New files (no other stage owns them): `src/timelines/alternates.ts`, `src/timelines/threat.ts`, `src/timelines/threatMeasured.ts` (generated), `src/scenarios/threatReference.ts`, `scripts/timeline-threat.ts`, `src/ui/threatBadge.ts`, `tests/alternateTimelines.test.ts`, `docs/apex/TIMELINE_THREAT.md` (generated).

Existing files, with the exact extent of the change:

| File | Owner | Change |
| --- | --- | --- |
| `src/timelines/presets.ts` | CORE | One import line and `...ALTERNATE_PRESETS` at the end of `PRESETS`. Nothing else, so CORE’s edits elsewhere in the file merge cleanly. |
| `tests/timelines.test.ts` | CORE | The one assertion `expect(PRESETS.map((p) => p.id)).toEqual([...eight ids])` gains `...ALTERNATE_PRESETS.map((p) => p.id)` at the end (and the import). |
| `package.json` | shared | `"timeline:threat": "node --import tsx/esm scripts/timeline-threat.ts"`. |
| `src/ui/screens/timelines.ts`, `briefing.ts`, `campaign.ts` (setup only), `src/style.css` | stages B/C later | Badge calls and CSS. The badge lives in its own module so these diffs stay a few lines each. |
| `src/codex/entries.ts`, `src/ui/screens/codex.ts` | stage D later | The Timelines category; additive. |
| `AU_RULES.md`, `README.md`, `CHANGELOG.md`, `LORE_REFERENCE.md` | docs | §4.12. |

Not touched: `src/scenarios/index.ts` (the reference engagement is not registered as a Quick Battle scenario, so CORE’s scenario work and the hard-coded lists in `tests/battle.test.ts` stay as they are), `src/simulation/**`, `src/data/**`, `src/timelines/rules.ts`, `src/timelines/schema.ts`, `e2e/**`.

### 4.2 `src/timelines/alternates.ts`

Holds the ten presets and their metadata; imports only `./rules` and a type from `./threat`. It must not import `./presets` (that would be a cycle, since `presets.ts` imports it).

```ts
import { CANON_FLEETS, CANON_SPECIAL, CANON_STRATEGIC, CANON_TECH, type RuleSet, type TechModifiers } from './rules';
import type { ThreatTier } from './threat';

const tech = (p: Partial<TechModifiers> = {}): TechModifiers => ({ ...CANON_TECH, ...p });

/** Prefix for every alternate-universe line shown outside the preset itself (codex, tooltips). */
export const auPrefix = (name: string): string => `ALTERNATE UNIVERSE (${name}): `;

export interface AlternateMeta {
  /** Divergence point inside established Mass Effect history. */
  divergence: { year: number; approximate?: boolean; event: string };
  /** Established canon up to the divergence, in original wording: the codex "established canon" block. */
  canonBasis: string;
  provenance: 'AU_MODIFIED';
  /** Intended tier; tests/alternateTimelines.test.ts requires the generated table to agree (TIMELINES_V2.md §1.8). */
  declaredTier: ThreatTier;
  /** The one knob a release may move to keep the declared tier, and its story-safe range (TIMELINES_V2.md §1.8). */
  lever: { key: string; min: number; max: number };
}

// The ten literals and ALTERNATE_META: Appendix C, verbatim.
export const ALTERNATE_PRESETS: RuleSet[] = [/* tier order, Appendix C */];
export const ALTERNATE_META: Record<string, AlternateMeta> = {/* Appendix C */};
```

Every literal spreads the canon constants, so `validateRuleSet` returns it unchanged; the strings use typographic apostrophes like the existing presets.

### 4.3 `src/timelines/presets.ts`

```ts
import { ALTERNATE_PRESETS } from './alternates';
// …
export const PRESETS: RuleSet[] = [
  CANON_ME3, PREPARED_GALAXY, HUMANITY_ASCENDANT, CERBERUS_REFORMED, REAPER_ESCALATION, PRIME_APEX, APEX_LEGACY, CERBERUS_ASCENDANT,
  ...ALTERNATE_PRESETS,
];
```

`getPreset`, `app.allTimelines()`, the timelines screen, the briefing, the comparison screen, custom battle and campaign setup all pick the new presets up from `PRESETS` with no further change. Canon stays the default timeline.

### 4.4 `src/timelines/threat.ts`

Pure data and arithmetic: no DOM, no simulation import, no clock (it sits under the determinism lint).

```ts
import type { RuleSet } from './rules';
import { REAPER_THREAT, THREAT_REFERENCE_META } from './threatMeasured';
export { REAPER_THREAT, THREAT_REFERENCE_META };

export type ThreatTier = 1 | 2 | 3 | 4 | 5 | 6;
export type ThreatLabel = 'Negligible' | 'Low' | 'Moderate' | 'Serious' | 'Severe' | 'Existential';

/** Lower bounds of tiers 2–6 on the 0–100 index (TIMELINES_V2.md §1.3). Fixed: never tuned to a preset. */
export const THREAT_THRESHOLDS = [17, 30, 48, 62, 87] as const;

export interface ThreatTierInfo { tier: ThreatTier; label: ThreatLabel; min: number; max: number; summary: string }
/** One row per tier; `summary` is the "what it means" column of §1.3, in player-facing words. */
export const THREAT_TIERS: readonly ThreatTierInfo[] = [/* six rows */];

/** One reference battle, as src/scenarios/threatReference.ts reports it. */
export interface ThreatRun { rung: number; seed: number; reaperLoss: number; organicSurvival: number; winner: 'A' | 'B' | 'draw'; duration: number }
export interface RungMeasure { capitals: number; destroyers: number; index: number; reaperLoss: number; organicSurvival: number; wins: number; battles: number }
export interface MeasuredThreat { index: number; reaperLoss: number; organicSurvival: number; holdsUpTo: number; rungs: RungMeasure[] }
export interface ThreatRating extends MeasuredThreat { tier: ThreatTier; label: ThreatLabel; summary: string }

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** The battle or timeline index: 50 × (Reaper hull lost + organic survival), both 0–1. */
export const threatIndex = (reaperLoss: number, organicSurvival: number): number => 50 * (clamp01(reaperLoss) + clamp01(organicSurvival));

export function tierForIndex(index: number): ThreatTier {
  let tier = 1;
  for (const t of THREAT_THRESHOLDS) if (index >= t) tier++;
  return tier as ThreatTier;
}

/** Aggregates the runs of one timeline (rungs × seeds, equal weights); rounds as the generated table stores it. */
export function summariseThreat(runs: readonly ThreatRun[], rungs: readonly { capitals: number; destroyers: number }[]): MeasuredThreat {
  const per: RungMeasure[] = rungs.map((g, k) => {
    const rs = runs.filter((r) => r.rung === k);
    const L = mean(rs.map((r) => r.reaperLoss));
    const S = mean(rs.map((r) => r.organicSurvival));
    return { capitals: g.capitals, destroyers: g.destroyers, index: r1(threatIndex(L, S)), reaperLoss: r3(L), organicSurvival: r3(S), wins: rs.filter((r) => r.winner === 'A').length, battles: rs.length };
  });
  let holdsUpTo = 0;
  for (const p of per) {
    if (p.battles > 0 && p.wins * 4 >= p.battles * 3) holdsUpTo = p.capitals;
    else break;
  }
  const L = mean(runs.map((r) => r.reaperLoss));
  const S = mean(runs.map((r) => r.organicSurvival));
  return { index: r1(threatIndex(L, S)), reaperLoss: r3(L), organicSurvival: r3(S), holdsUpTo, rungs: per };
}

/** The rating the UI shows; undefined ("Unrated") for custom timelines and anything the table does not cover. */
export function threatRating(rules: Pick<RuleSet, 'id' | 'category'>): ThreatRating | undefined {
  if (rules.category === 'custom') return undefined;
  const m = REAPER_THREAT[rules.id];
  if (!m) return undefined;
  const info = THREAT_TIERS[tierForIndex(m.index) - 1];
  return { ...m, tier: info.tier, label: info.label, summary: info.summary };
}

export const UNRATED = 'Unrated';

/** Tooltip text: the measured losses and survival, the breaking point, and how it was measured. */
export function threatTooltip(r: ThreatRating | undefined, reaperFleetStrength = 1): string { /* see below */ }
```

Tooltip wording (generated from the rating, all numbers rounded to whole per cent):

- Rated: `Threat to the Reapers 3/6 — Moderate (index 36). Reaper losses 55 %, organic survival 17 %. Holds the reference Reaper groups up to the 2-capital raid. Measured in conventional battle: threat reference engagement, 5 Reaper group sizes × 4 seeds (abc1234). Simulation estimate.` When the timeline scales the Reaper groups, add `Reaper groups ×1.3 in this timeline.` When it holds nothing: `Holds none of the reference Reaper groups.`
- Unrated: `Threat to the Reapers: unrated. Custom timelines are not measured; tiers are measured for the built-in timelines on the threat reference engagement.`

### 4.5 `src/timelines/threatMeasured.ts` (generated)

Written only by the script; reviewed like code; byte-identical when regenerated on the same commit (no timestamp, keys in `PRESETS` order, fixed decimals).

```ts
// GENERATED by scripts/timeline-threat.ts. Do not edit by hand; regenerate with `npm run timeline:threat`.
// Threat reference engagement: 5 Reaper groups × 4 seeds per preset (docs/apex/TIMELINES_V2.md §1).
import type { MeasuredThreat } from './threat';

export const THREAT_REFERENCE_META = {
  reference: 'threat_reference',
  formulaVersion: 1,
  seeds: [1, 2, 3, 4],
  rungs: [{ capitals: 2, destroyers: 5 }, { capitals: 3, destroyers: 7 }, { capitals: 4, destroyers: 10 }, { capitals: 5, destroyers: 12 }, { capitals: 6, destroyers: 14 }],
  maxDuration: 240,
  measuredOn: 'abc1234',
} as const;

export const REAPER_THREAT: Readonly<Record<string, MeasuredThreat>> = {
  canon_me3: { index: 36.1, reaperLoss: 0.553, organicSurvival: 0.169, holdsUpTo: 2, rungs: [/* five RungMeasure rows */] },
  // … one entry per PRESETS id, in PRESETS order
};
```

`measuredOn` is `git rev-parse --short HEAD` at generation (`unknown` when git is unavailable). The `import type` keeps the mutual reference with `threat.ts` type-only. Bootstrap: the first commit carries a placeholder with `REAPER_THREAT = {}` so that everything compiles before the first run; the script never reads the table except in `--check` mode and when merging `--only` results.

### 4.6 `src/scenarios/threatReference.ts`

The engagement of §1.1 and the metrics of §1.2. Deterministic (it sits under the determinism lint); it imports `fleet` from `./index` and is not registered in `SCENARIOS`.

```ts
import { v3 } from '@/core/vec3';
import type { FactionId } from '@/data/types';
import { BattleSimulation } from '@/simulation/battle';
import { summarise } from '@/simulation/results';
import type { BattleConfig, FleetSpec, FormationType } from '@/simulation/types';
import { isApexRules, type RuleSet } from '@/timelines/rules';
import type { ThreatRun } from '@/timelines/threat';
import { fleet } from './index';

export const THREAT_REFERENCE_ID = 'threat_reference';
export const THREAT_SEEDS = [1, 2, 3, 4] as const;
export const THREAT_MAX_DURATION = 240;
export const THREAT_RUNGS = [
  { name: 'Raid', capitals: 2, destroyers: 5 },
  { name: 'Strike group', capitals: 3, destroyers: 7 },
  { name: 'Battlegroup', capitals: 4, destroyers: 10 },
  { name: 'Assault fleet', capitals: 5, destroyers: 12 },
  { name: 'Harvest fleet', capitals: 6, destroyers: 14 },
] as const;

const allied = (r: RuleSet): boolean => r.strategic.cerberusStance === 'cooperative' || r.strategic.cerberusStance === 'controls_reapers';

interface Contingent { id: string; faction: Exclude<FactionId, 'reaper'>; name: string; x: number; z: number; formation: FormationType; when?: (r: RuleSet) => boolean; counts: (r: RuleSet) => Record<string, number> }

/** §1.1, in this order: the order fixes the random draws. */
export const THREAT_COALITION: readonly Contingent[] = [
  { id: 'ref-alliance', faction: 'alliance', name: 'Systems Alliance', x: -5, z: -30, formation: 'line_abreast', counts: (r) => ({ alliance_dreadnought: 2, alliance_carrier: 1, alliance_cruiser: 3, alliance_frigate: 3, normandy_sr2: r.strategic.shepardAlive ? 1 : 0, normandy_valkyrie: r.special.valkyrieAvailable ? 1 : 0, alliance_super_dreadnought: r.special.superDreadnoughts ? 1 : 0 }) },
  { id: 'ref-turian', faction: 'turian', name: 'Turian Hierarchy', x: -15, z: -30, formation: 'line_abreast', counts: (r) => ({ turian_dreadnought: 2, turian_cruiser: 3, turian_frigate: 3, turian_super_dreadnought: r.special.superDreadnoughts ? 1 : 0 }) },
  { id: 'ref-asari', faction: 'asari', name: 'Asari Republics', x: 5, z: -30, formation: 'defensive_screen', counts: () => ({ asari_dreadnought: 1, asari_cruiser: 3 }) },
  { id: 'ref-salarian', faction: 'salarian', name: 'Salarian Union', x: 15, z: -30, formation: 'line_abreast', counts: () => ({ salarian_dreadnought: 1, salarian_cruiser: 2, salarian_frigate: 2 }) },
  { id: 'ref-quarian', faction: 'quarian', name: 'Migrant Fleet', x: 25, z: -30, formation: 'defensive_screen', counts: () => ({ quarian_heavy: 1, quarian_cruiser: 3 }) },
  { id: 'ref-geth', faction: 'geth', name: 'Geth', x: -25, z: -30, formation: 'strike_wedge', counts: () => ({ geth_dreadnought: 1, geth_cruiser: 2, geth_frigate: 2 }) },
  { id: 'ref-cerberus', faction: 'cerberus', name: 'Cerberus', x: 0, z: -42, formation: 'strike_wedge', when: allied, counts: (r) => ({ cerberus_cruiser: 2, cerberus_frigate: 3, cerberus_dreadnought: isApexRules(r) ? 1 : 0 }) },
];

/** `rung` is 0-based (0 = Raid … 4 = Harvest fleet). Fleet scaling is on: no `ws`, no `mult`. */
export function buildThreatReference(rules: RuleSet, rung: number, seed: number): BattleConfig {
  const g = THREAT_RUNGS[rung];
  const fleets: FleetSpec[] = THREAT_COALITION.filter((c) => !c.when || c.when(rules)).map((c) =>
    fleet(c.id, c.faction, rules, { counts: c.counts(rules), name: c.name, formation: c.formation, position: v3(c.x, 0, c.z) }),
  );
  fleets.push(fleet('ref-reapers', 'reaper', rules, { counts: { reaper_capital: g.capitals, reaper_destroyer: g.destroyers }, name: `Reaper ${g.name.toLowerCase()}`, side: 'B', formation: 'strike_wedge', position: v3(0, 0, 30), heading: v3(0, 0, -1), playerControlled: false }));
  return {
    id: `${THREAT_REFERENCE_ID}-${rules.id}-r${rung + 1}-${seed}`,
    name: `Threat reference: ${g.name}`,
    scenarioId: THREAT_REFERENCE_ID,
    seed,
    rules,
    environment: 'deep_space',
    maxDuration: THREAT_MAX_DURATION,
    perspectiveSide: 'A',
    objective: 'Destroy the Reaper group.',
    fleets: fleets.filter((f) => f.ships.length > 0),
  };
}

/** The §1.2 metrics of a finished battle. */
export function threatRunOf(sim: BattleSimulation, rung: number, seed: number): ThreatRun {
  const result = sim.result ?? summarise(sim);
  let value = 0;
  let lost = 0;
  for (const s of sim.ships) {
    if (s.side !== 'B' || s.role === 'fighter') continue;
    value += s.pointValue;
    lost += s.pointValue * (s.alive ? Math.max(0, 1 - s.hull / s.maxHull) : 1);
  }
  return { rung, seed, reaperLoss: value > 0 ? lost / value : 0, organicSurvival: result.sides.A.survivalPercent / 100, winner: result.winner, duration: sim.time };
}

/** Synchronous: the script's path. Tests step with tests/support/async.ts `runSimAsync` and call `threatRunOf`. */
export function runThreatReference(rules: RuleSet, rung: number, seed: number): ThreatRun {
  const sim = new BattleSimulation(buildThreatReference(rules, rung, seed));
  sim.run();
  return threatRunOf(sim, rung, seed);
}
```

The design-time prototype differs only in fleet names (it used the faction ids); names do not reach the random draws. If CORE changes the `fleet()` signature or removes a classic formation id before this lands, adapt the call and keep the §1.1 table.

### 4.7 `scripts/timeline-threat.ts` and `package.json`

`"timeline:threat": "node --import tsx/esm scripts/timeline-threat.ts"`.

```
npm run timeline:threat                       # measure every preset, write the table and the report
npm run timeline:threat -- --only a,b         # measure a subset and merge it into the existing table (retuning, §1.8)
npm run timeline:threat -- --check            # measure every preset, compare tiers with the committed table, write nothing
npm run timeline:threat -- --jobs 4           # worker processes; default min(4, os.availableParallelism())
```

1. For every preset in `PRESETS` (or `--only`), run the five rungs × four seeds with `runThreatReference`. With `--jobs` > 1 the script re-invokes itself as `process.execPath --import tsx/esm scripts/timeline-threat.ts --worker <id>` per preset; a worker prints one JSON line of `ThreatRun[]`. Results are keyed by id and assembled in `PRESETS` order, so the output never depends on scheduling.
2. `summariseThreat(runs, THREAT_RUNGS)` per preset.
3. Write `src/timelines/threatMeasured.ts` (§4.5) and `docs/apex/TIMELINE_THREAT.md`: the formula, the reference, the thresholds and `measuredOn`; a table sorted by index (preset, category, tier, label, index, Reaper losses, organic survival, breaking point); the per-rung table of Appendix A’s shape; and "declared vs measured" for the new presets. Wall times go to stdout only, never into a committed file.
4. Print a console table with the wall time per preset.
5. Exit with code 1, after writing, if any new preset’s declared tier differs from `tierForIndex(index)`; with `--check`, exit 1 if any preset’s tier differs from the committed table. The release step cannot miss either.

### 4.8 UI: the threat badge

New module `src/ui/threatBadge.ts`:

```ts
import { el } from './dom';
import type { RuleSet } from '@/timelines/rules';
import { threatRating, threatTooltip } from '@/timelines/threat';

/** Pips 1–6, the label and a tooltip with the measured Reaper losses and organic survival; "Unrated" for custom timelines. */
export function threatBadge(rules: RuleSet, size: 'compact' | 'full' = 'compact'): HTMLElement {
  const r = threatRating(rules);
  const pips = el('span', { class: 'pips', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5, 6].map((i) => el('i', { class: r && i <= r.tier ? 'pip on' : 'pip' })));
  const text = r ? (size === 'full' ? `${r.tier}/6 ${r.label} · index ${Math.round(r.index)}` : r.label) : 'Unrated';
  return el('span', {
    class: r ? 'threat' : 'threat unrated',
    'data-threat-tier': r ? String(r.tier) : 'unrated',
    title: threatTooltip(r, rules.fleetStrength.reaper),
    'aria-label': r ? `Threat to the Reapers: ${r.tier} of 6, ${r.label}` : 'Threat to the Reapers: unrated',
  }, [pips, el('span', { class: 'threat-label' }, text)]);
}

/** Plain-text form for <option> labels. */
export const threatOptionSuffix = (rules: RuleSet): string => {
  const r = threatRating(rules);
  return r ? ` · Threat ${r.tier}/6 ${r.label}` : ' · Threat unrated';
};
```

- **Timelines screen** (`renderTimelines`): every list card gets `threatBadge(t)` on a second line between the name and the category tag. The detail panel gets a "THREAT TO THE REAPERS" block under the tagline: `threatBadge(rules, 'full')`, the tier’s summary sentence, "Reaper losses X %, organic survival Y % (20 reference battles)", the breaking-point line, and a five-row rung table (rung name, the Reaper group after this timeline’s `fleetStrength.reaper`, index, wins of 4). In edit mode and for saved custom timelines the block shows "Unrated" and one line: custom timelines are not measured.
- **Briefing** (`renderBriefing`): each `<option>` label gets `threatOptionSuffix(t)`; `threatBadge(rules, 'full')` sits under the select with the tooltip (a `title` on an `<option>` is not shown reliably in every browser, so the badge carries it).
- **Campaign setup** (`renderCampaignSetup`): the same suffix and badge under the rule-set select. The setup already lists `app.allTimelines()`, so the new presets appear with no other change.
- **CSS** (`src/style.css`):

```css
.threat { display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; }
.threat .pips { display: inline-flex; gap: 2px; }
.threat .pip { width: 7px; height: 7px; border: 1px solid currentColor; opacity: 0.35; }
.threat .pip.on { background: currentColor; opacity: 1; }
.threat.unrated { opacity: 0.7; }
.threat.unrated .pip { border-style: dashed; }
.btn .threat { display: flex; margin-top: 4px; }
```

The label text always accompanies the pips (never colour alone); `data-threat-tier` gives e2e a hook. An optional e2e line (owned by stage D): the timelines screen shows `[data-threat-tier]` on every card and `unrated` on a saved custom timeline.

### 4.9 Codex: the Timelines category

`src/codex/entries.ts`:

- `CodexEntry.category` gains `'Timelines'`; `CODEX_CATEGORIES` lists it after `'Reaper War'`.
- New optional field `alternate?: string[]`: always shown, in an alternate-universe block, whatever timeline is active; every line starts with `auPrefix(name)`.
- One entry per new timeline, generated from `ALTERNATE_PRESETS` and `ALTERNATE_META` so the text is never duplicated by hand:

```ts
const pct = (x: number): string => `${Math.round(100 * x)} %`;
const TIMELINE_ENTRIES: CodexEntry[] = ALTERNATE_PRESETS.map((p) => {
  const meta = ALTERNATE_META[p.id];
  const pre = auPrefix(p.name);
  const r = threatRating(p);
  return {
    id: `timeline_${p.id}`,
    category: 'Timelines',
    title: p.name,
    canon: [meta.canonBasis],
    estimate: ['How the threat is measured: see “Threat to the Reapers (measured scale)”.'],
    alternate: [
      `${pre}diverges in ${meta.divergence.approximate ? 'about ' : ''}${meta.divergence.year}: ${meta.divergence.event}`,
      `${pre}${p.description.replace(/^ALTERNATE UNIVERSE\.\s*/, '')}`,
      ...p.historyChanges.map((h) => `${pre}${h}`),
      `${pre}threat to the Reapers ${r ? `${r.tier}/6 ${r.label} (index ${r.index.toFixed(1)}; Reaper losses ${pct(r.reaperLoss)}, organic survival ${pct(r.organicSurvival)})` : 'unrated'}, measured in conventional battle.`,
    ],
  };
});
```

- One entry `threat_scale`, "Threat to the Reapers (measured scale)", category Timelines, `canon: []`, with `estimate` lines generated from `THREAT_TIERS`, `THREAT_THRESHOLDS`, `THREAT_REFERENCE_META` and `REAPER_THREAT`: what is measured and why ("measured, not asserted"); the reference engagement (coalition, the five Reaper groups, four seeds); the formula; the six tiers with their thresholds and meanings; what the scale cannot see (§1.5); then one line per preset with its tier and index, where every AU preset’s line starts with `auPrefix(name)`.
- `src/ui/screens/codex.ts`: render `e.alternate` as an `entry-block au` with the badge "alternate universe" (independent of the active timeline), and tag such entries "AU" in the navigation.

### 4.10 Campaign

No engine change. The new presets reach the campaign through `PRESETS` and use their fleet and strategic values exactly as every preset does (Sovereign’s Triumph has no Crucible, The Conduit Protocol has a reinforcement pool of 2 and flags conventional victory as possible, and so on). A smoke test (§4.11) creates a campaign under each new preset and advances it a few turns. Optional for the release: AI-run reference outcomes (seeds 5, 9, 21) recorded in `AU_RULES.md`, as the existing presets have.

### 4.11 Tests

`tests/alternateTimelines.test.ts` (no test pins a measured number):

| Block | Test | Checks |
| --- | --- | --- |
| data | presets are appended in order | `PRESETS.slice(0, 8)` ids are the existing list, `PRESETS.slice(8)` equals `ALTERNATE_PRESETS`; ids unique across `PRESETS` and match `/^[a-z][a-z0-9_]*$/`; none is `custom` or `canon_me3`. |
| data | schema round trip | for every new preset, `validateRuleSet(JSON.parse(exportRuleSet(p)))` is ok with **no warnings** and `toEqual(p)`. |
| data | normalisation | `normaliseRules(p)` `toEqual(p)`. |
| data | the AU label everywhere | `category === 'au'`; `description` starts with `ALTERNATE UNIVERSE.`; the codex has exactly one `timeline_<id>` entry per new preset in category Timelines and every `alternate` line starts with `auPrefix(p.name)`; the `threat_scale` entry exists and its AU preset lines carry the prefix; `forbiddenWording` is false for every text, and the light-speed and 3× phrasing checks that `tests/timelines.test.ts` applies to presets pass for every codex line too. |
| data | metadata | one `ALTERNATE_META` entry per new preset; divergence year between 1800 and 2186 (inside established history); `provenance === 'AU_MODIFIED'`; non-empty `canonBasis` and event; the lever names a numeric key of the preset whose current value lies inside `[min, max]`. |
| data | span and direction | the declared tiers cover 1–6; for every preset declared 1 or 2, every battle-relevant knob that differs from canon favours the Reapers (organic tech or fleets below canon, Reaper tech, fleets or competence above, coordination below 0.5, indoctrination above 1) and none favours the organics (no organic tech or fleet above canon, no Reaper value below, no `reaperCommandVulnerability`, `indoctrinationDisabled`, `hyperMassAccelerators`, `hadesRounds` or fleet-wide Thanix). |
| scale | arithmetic | `THREAT_THRESHOLDS` strictly increasing; `tierForIndex` at 0, 16.99, 17, 29.99, 30, 47.99, 48, 61.99, 62, 86.99, 87, 100; `threatIndex(0, 0) === 0`, `threatIndex(1, 1) === 100`; `summariseThreat` on synthetic runs (equal weights, rounding, `holdsUpTo` stops at the first rung won fewer than 3 of 4). |
| scale | table coverage | the keys of `REAPER_THREAT` equal the `PRESETS` ids; every value is finite and in range (index 0–100, fractions 0–1, five rungs, `battles === 4`); `THREAT_REFERENCE_META` has 4 seeds and 5 rungs. |
| scale | declared = measured | for every new preset, `tierForIndex(REAPER_THREAT[id].index) === ALTERNATE_META[id].declaredTier`. |
| scale | unrated | `threatRating(makeCustom())`, a `custom_…` id and an unknown id are all undefined. |
| reference | composition | builds for every preset and rung; fleet scaling acts (Sovereign’s Triumph meets 3 capitals on the raid, The Conduit Protocol 1); a Cerberus fleet only when `cerberusStance` is cooperative or `controls_reapers`; the Normandy only when Shepard lives; no Harbinger. |
| reference | runtime ordering (async, timeout 120 s) | the lowest-declared and highest-declared new presets (taken from `ALTERNATE_META`, not hard-coded) and canon, on the Battlegroup rung (`rung` 2) with seeds 1 and 2, each battle stepped with `runSimAsync` then `threatRunOf`: index(lowest) < index(canon) < index(highest). Design-time values on that rung: about 10, 25 and 94. |
| in play | scenarios | every scenario in `SCENARIOS` except `custom` builds under every new preset and steps 40 ticks (as `tests/battle.test.ts` does for the existing eight). |
| in play | campaign | `createCampaign` under every new preset with the setup screen’s default world state (`ascension: present, rannoch: war, crucible: use, genophage: cured, rachni: saved`), then a few `advanceTick` turns without error. |

`tests/timelines.test.ts`: the `PRESETS` order assertion as in §4.1. Its other checks (unique ids, history lines for every AU preset, the light-speed and 3× wording sweep over `PRESETS`) now cover the new presets automatically.

### 4.12 Documentation

- `AU_RULES.md`: the ten new rows in the Presets table; a "Threat to the Reapers" section (reference, formula, thresholds, what it cannot see, link to `TIMELINE_THREAT.md`).
- `README.md`: the timeline list and one paragraph on the scale.
- `CHANGELOG.md`: an Unreleased entry (ten timelines; the measured scale; badges; the codex category; the new script).
- `LORE_REFERENCE.md`: "Canon anchors used by the alternate timelines": Sovereign’s wreck and the Thanix; the Collectors, the Omega 4 relay and the human Reaper; the derelict Reaper at Mnemosyne; the Alpha relay at Bahak; Ilos, Vigil and the Conduit; the beacon in the Temple of Athame; the Morning War; turian service from the age of fifteen and the volus; Despoina, the Leviathans, their thralls, Dr. Ann Bryson, the Leviathans’ creation of the intelligence behind the Reapers and the first Reaper made in their image. Each divergence is AU.
- `docs/apex/TIMELINE_THREAT.md`: generated by the script.

### 4.13 Order of work, commits and gates

Each step is committed as soon as it is complete (`stage(T): …`, attribution lines; no push):

1. `alternates.ts` (Appendix C), the `presets.ts` import and spread, the `tests/timelines.test.ts` assertion → `npm run typecheck`, `npx vitest run tests/timelines.test.ts`.
2. `threat.ts`, the placeholder `threatMeasured.ts`, `threatReference.ts`, the script, `package.json` → `npm run timeline:threat` → commit the generated table and report.
3. `tests/alternateTimelines.test.ts` → `npx vitest run tests/alternateTimelines.test.ts`.
4. `threatBadge.ts`, the timelines, briefing and campaign-setup screens, the CSS → `npm run build`.
5. The codex category.
6. Documentation.

Final gate in the worktree: `npm run typecheck && npx vitest run && npm run build && npx playwright test` (one Playwright process, port 4173) and `npm run timeline:threat -- --check` exits 0.

### 4.14 Release

After the merge, in the release worktree, run `npm run timeline:threat`. Exit code 0: commit the regenerated table and report. Exit code 1: follow §1.8 for each new timeline it names, then commit. The changelog lists any existing preset whose label changed, with old and new index.

## 5. Rules compliance

- **Canon by default, AU by choice.** `canon_me3` is untouched and stays the default; the ten presets are `category: 'au'`, their descriptions open with `ALTERNATE UNIVERSE.`, every codex line about them opens with `ALTERNATE UNIVERSE (<name>): `, the timelines screen keeps its "Alternate universe. Never presented as canon." note, and the briefing keeps its AU warning.
- **Original writing.** Every tagline, description, history line and codex line in this document was written for it; none quotes or closely paraphrases the games or the codex. Canon facts are restated in new words and only up to each divergence.
- **Lore-consistent.** Each timeline follows the trilogy up to its divergence point (named in its provenance note) and changes only what follows from it.
- **Determinism.** `threat.ts`, `threatReference.ts` and `alternates.ts` read no clock and use no unseeded random source; every battle draws from the seeded `Rng` through `BattleSimulation`; the generated table carries no timestamp. Wall times appear on stdout only.
- **HADES wording.** None of the new timelines uses HADES; where the scale mentions it, it says "HADES penetrators" (a penetrator with a nuclear warhead).
- **No hull caps.** Counts come from `fleetStrength` through the existing `fleet()` rules (rounding, one hull minimum, carriers at most ×1.5, unique hulls once); nothing new caps a fleet.
- **Honesty.** Tiers are measured, not asserted: the label is always the generated table’s; declared tiers are checked by a test; the existing presets keep their numbers and take whatever label the measurement gives (§3); §1.5 states what the scale cannot see, and every design-time figure is labelled as such.

## Appendix A. Design-time per-rung results

Index per rung with wins of 4 in brackets; base commit `ba4decf`, prototype of Appendix B, seeds 1–4.

| Preset | Raid 2/5 | Strike group 3/7 | Battlegroup 4/10 | Assault fleet 5/12 | Harvest fleet 6/14 | Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `canon_me3` | 92 (4) | 37 (0) | 25 (0) | 14 (0) | 12 (0) | 36.1 |
| `prepared_galaxy` | 95 (4) | 92 (4) | 84 (4) | 59 (2) | 31 (0) | 72.2 |
| `humanity_ascendant` | 98 (4) | 94 (4) | 87 (4) | 54 (1) | 54 (2) | 77.5 |
| `cerberus_reformed` | 93 (4) | 57 (1) | 28 (0) | 24 (0) | 14 (0) | 43.1 |
| `reaper_escalation` | 24 (0) | 14 (0) | 9 (0) | 5 (0) | 4 (0) | 11.2 |
| `prime_apex` | 99 (4) | 98 (4) | 97 (4) | 96 (4) | 95 (4) | 97.1 |
| `apex_legacy` | 99 (4) | 99 (4) | 97 (4) | 96 (4) | 95 (4) | 97.2 |
| `cerberus_ascendant` | 93 (4) | 64 (2) | 30 (0) | 23 (0) | 14 (0) | 44.6 |
| `sovereigns_triumph` | 24 (0) | 19 (0) | 10 (0) | 5 (0) | 4 (0) | 12.4 |
| `collectors_harvest` | 85 (4) | 19 (0) | 11 (0) | 8 (0) | 4 (0) | 25.3 |
| `indoctrinated_council` | 68 (2) | 23 (0) | 18 (0) | 12 (0) | 4 (0) | 25.0 |
| `leviathans_bargain` | 54 (1) | 23 (0) | 19 (0) | 10 (0) | 5 (0) | 22.1 |
| `vigils_warning` | 94 (4) | 63 (2) | 25 (0) | 16 (0) | 14 (0) | 42.4 |
| `geth_quarian_concord` | 95 (4) | 89 (4) | 51 (1) | 31 (0) | 19 (0) | 57.0 |
| `asari_disclosure` | 94 (4) | 88 (4) | 57 (1) | 29 (0) | 20 (0) | 57.5 |
| `turian_total_war` | 96 (4) | 90 (4) | 86 (4) | 56 (2) | 33 (0) | 72.3 |
| `leviathans_covenant` | 98 (4) | 90 (4) | 80 (4) | 53 (2) | 30 (0) | 70.4 |
| `conduit_protocol` | 98 (4) | 97 (4) | 94 (4) | 92 (4) | 92 (4) | 94.5 |

## Appendix B. The design-time prototype

The prototype that produced every design-time figure built the §1.1 engagement with `fleet()` from `src/scenarios/index.ts` exactly as §4.6 does: the same fleet ids, contingent and class order, anchors, formations, rung sizes, seeds, `maxDuration` 240 and deep-space environment; only the fleet names differed (it used the faction ids). It computed L, S and the index as in §1.2 and the breaking point as in §1.4, ran each battle with `new BattleSimulation(config).run()`, and was run as four parallel processes. The alternatives it rejected (§1.6) were: the same builder with a 74-hull coalition (Alliance 3 DN, 1 CV, 6 CA, 8 FF; Hierarchy 3 DN, 6 CA, 8 FF; Republics 2 DN, 6 CA; Union 1 DN, 4 CA, 6 FF; Migrant Fleet 2 HV, 6 CA; geth 1 DN, 4 CA, 6 FF) 76 km from single Reaper groups of 4/10, 5/12 and 6/14, at `maxDuration` 300 and 240; the 36-hull coalition spread out (geth (−40, −38), Hierarchy (−24, −32), Alliance (0, −30), Republics (24, −32), Union (−12, −42), Migrant Fleet (12, −42), Cerberus (40, −38)); and the same coalition stacked on one anchor, (0, −30) to (0, −42) in 2 km steps in contingent order.

## Appendix C. The ten literals and their metadata

Verbatim for `src/timelines/alternates.ts` after the header of §4.2. Verified at design time: each validates with no warning and round-trips unchanged, `normaliseRules` returns it unchanged, its battle-relevant values are exactly those measured, and the tiers 1–2 direction check of §4.11 passes.

```ts
export const SOVEREIGNS_TRIUMPH: RuleSet = {
  id: 'sovereigns_triumph',
  name: 'Sovereign’s Triumph',
  tagline: 'The Citadel relay opened in 2183. The Reapers did not have to wait three more years.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. In 2183 Saren’s lock on the Citadel is never broken: the station’s arms stay sealed, the Council dies aboard the Destiny Ascension and Sovereign opens the Citadel relay for the fleet waiting in dark space. The Reapers enter the heart of Council space three years before canon, with no Sovereign wreck left behind to teach anyone the Thanix and no time to search Prothean ruins for a Crucible. Each species meets the harvest alone, and every battle faces more Reapers than the canon war ever did.',
  historyChanges: [
    '2183: Saren’s override of the Citadel holds; the arms stay sealed and Sovereign opens the Citadel relay to dark space.',
    'The Council dies aboard the Destiny Ascension; the Citadel Fleet and the Alliance Fifth Fleet are destroyed in the Serpent Nebula, and Shepard falls in the Presidium.',
    'No Reaper wreck is salvaged, so the Thanix cannon is never developed.',
    'The harvest begins at the Citadel; nobody searches the Prothean archive on Mars, and there is no Crucible.',
    'Without a Council or a shared command, every species defends its own space alone.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL, thanixAvailability: 'none' },
  fleetStrength: { ...CANON_FLEETS, alliance: 0.8, turian: 0.6, asari: 0.5, salarian: 0.85, geth: 0.5, reaper: 1.3 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.1, indoctrinationEffectiveness: 1.5, reaperCompetence: 1.1, reaperReinforcements: 1.5, crucibleAvailable: false, shepardAlive: false, shepardEffectiveness: 0 },
};

export const COLLECTORS_HARVEST: RuleSet = {
  id: 'collectors_harvest',
  name: 'The Collectors’ Harvest',
  tagline: 'The Normandy never came back through the Omega 4 relay. The human Reaper woke, and the Reapers came early.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. In 2185 the Normandy is destroyed beyond the Omega 4 relay: Shepard and the crew are lost and the Collectors finish the human Reaper. The abductions from human colonies go on, nobody destroys the Alpha relay in the Bahak system, and the Reapers enter batarian space months early and in one mass. No one brokers peace at Rannoch or unites the Council races, and the Alliance meets the invasion after a year spent hunting Collectors.',
  historyChanges: [
    '2185: the Normandy SR-2 is destroyed at the Collector base; Shepard and the crew are killed.',
    'The Collectors complete the human Reaper and keep raiding human colonies; the Alliance strips its fleets to hunt them.',
    'The Alpha relay is never destroyed: the Reapers reach batarian space months ahead of canon, and together.',
    'Rannoch stays at war and no one unites the Council races: the quarian and geth fleets never join the coalition.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, alliance: 0.65, quarian: 0.5, geth: 0.5, reaper: 1.2 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.25, indoctrinationEffectiveness: 1.3, reaperReinforcements: 1.3, shepardAlive: false, shepardEffectiveness: 0 },
};

export const INDOCTRINATED_COUNCIL: RuleSet = {
  id: 'indoctrinated_council',
  name: 'The Indoctrinated Council',
  tagline: 'A dead Reaper was towed home for study. By 2186 it had friends on the Council.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. After Shepard’s team recovers the Reaper IFF in 2185, an STG task force that had been tracking Cerberus reaches the derelict Reaper over Mnemosyne before it falls and tows it to a hidden Council research station. The dead machine still indoctrinates: through its researchers its influence reaches the councillors’ staffs and the turian, asari and salarian admiralties. By 2186 fleets are held back on plausible pretexts, fire-control and sensor software is quietly corrupted, and every deployment reaches the Reapers before it reaches the front.',
  historyChanges: [
    '2185: an STG task force salvages the derelict Reaper at Mnemosyne instead of letting it fall into the brown dwarf.',
    'The wreck’s residual indoctrination spreads from the research station into the councillors’ staffs and the turian, asari and salarian admiralties.',
    'Compromised admirals hold fleets in reserve and corrupt fire control, sensors and electronic warfare across the Council navies.',
    'The Reapers learn every deployment in advance; the Alliance, kept outside the programme, is untouched.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {
    turian: { accuracy: 0.8, sensors: 0.8, crewQuality: 0.85 },
    asari: { accuracy: 0.85, sensors: 0.8, electronicWarfare: 0.8 },
    salarian: { accuracy: 0.85, sensors: 0.8, electronicWarfare: 0.7 },
  },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, turian: 0.7, asari: 0.7, salarian: 0.6 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.2, indoctrinationEffectiveness: 2, reaperCompetence: 1.3 },
};

export const LEVIATHANS_BARGAIN: RuleSet = {
  id: 'leviathans_bargain',
  name: 'Leviathan’s Bargain',
  tagline: 'The Reapers found Despoina first. The Leviathans chose to outlive the cycle, and lent the harvest their minds.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. In 2186 the Reapers find Despoina before anyone else, and the last Leviathans, who created the intelligence that built the Reapers, buy their survival with service. They give the harvest their oldest arts: the hold they keep on thralls in every port and fleet, and the concealment that hid them from the Reapers for aeons. Organic crews fight beside officers who are no longer their own, against Reaper hulls that slide out of every firing solution.',
  historyChanges: [
    '2186: the Reapers locate Despoina before Shepard’s search does; the surviving Leviathans negotiate instead of fighting.',
    'In exchange for being spared, the Leviathans turn their thralls in allied ports and fleets against the war effort.',
    'The Leviathans teach the Reapers the concealment that hid them for aeons; Reaper hulls become far harder to target.',
    'Indoctrination and thrall control reinforce each other, and trust between allied commands collapses.',
  ],
  organic: tech({ crewQuality: 0.8, accuracy: 0.9 }),
  reaper: tech({ electronicWarfare: 1.8, sensors: 1.4 }),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.3, indoctrinationEffectiveness: 2, reaperCompetence: 1.4 },
};

export const VIGILS_WARNING: RuleSet = {
  id: 'vigils_warning',
  name: 'Vigil’s Warning',
  tagline: 'Ilos told the whole story in 2183. The Council believed it, and learned how the Protheans lost.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. In 2183 the whole of Vigil’s archive leaves Ilos with Shepard, and the Council cannot dismiss fifty thousand years of Prothean records. The galaxy learns how the Protheans fell: the Citadel taken first, commands hollowed out by indoctrinated agents, Reaper fleets that faltered whenever their capital ships died. Screening keeps indoctrinated officers out of the fleets and joint doctrine improves, but the archive holds no weapon that could have saved the Protheans, and no extra warships are built.',
  historyChanges: [
    '2183: Vigil’s full archive is recovered from Ilos and authenticated by Council scientists.',
    'The Council accepts the Reaper threat on Prothean evidence, and every navy adopts indoctrination screening.',
    'Fleet doctrine takes from the Prothean record that Reaper groups falter when their capital ships are destroyed.',
    'The Mars archive is searched from 2184 (story only: the campaign’s Crucible clock is unchanged).',
    'No new weapons and no extra warships: the archive is a record of how the Protheans lost.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL, reaperCommandVulnerability: true },
  fleetStrength: { ...CANON_FLEETS },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.55, indoctrinationEffectiveness: 0.4 },
};

export const GETH_QUARIAN_CONCORD: RuleSet = {
  id: 'geth_quarian_concord',
  name: 'The Geth–Quarian Concord',
  tagline: 'The quarians recognised the geth instead of shutting them down. Three centuries later, Rannoch builds warships for both.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. About three centuries before 2183 the quarians answer their creations’ first questions about themselves with recognition instead of a shutdown order. There is no Morning War and no Migrant Fleet: Rannoch remains a quarian world shared with the geth, the quarians keep their Citadel embassy, and the geth never split into a heretic faction for Sovereign to recruit. By 2186 the Concord fields a homeworld navy crewed by quarians flying with geth intelligences aboard, beside a geth fleet that has had three hundred years of peace to grow.',
  historyChanges: [
    'c. 1895: the quarian government recognises the geth as people; the order to shut them down is never given.',
    'No Morning War and no Migrant Fleet: the quarians keep Rannoch, its industry and their Citadel embassy.',
    'Quarian warships fly with geth intelligences aboard, with better barriers, electronic warfare and crews than any refugee fleet could field.',
    'The geth never divide: there are no heretics for Sovereign, and the geth fleet grows for three hundred years.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {
    quarian: { crewQuality: 1.2, electronicWarfare: 1.4, accuracy: 1.1, kineticBarrierStrength: 1.2, barrierRegen: 1.3 },
    geth: { crewQuality: 1.2, barrierRegen: 1.3, sensors: 1.2, electronicWarfare: 1.3 },
  },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, quarian: 1.9, geth: 2.4 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.6 },
};

export const ASARI_DISCLOSURE: RuleSet = {
  id: 'asari_disclosure',
  name: 'The Asari Disclosure',
  tagline: 'In 2183 the Republics opened the Temple of Athame. Their head start became everyone’s.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. Sovereign’s attack persuades the asari councillor and the matriarchs that a secret kept for millennia is no longer worth keeping, and in 2183 the Prothean beacon in the Temple of Athame is opened to Council scientists. Three years of shared study carry the Republics’ lead in barrier projection, sensors and element zero engineering to every navy, and the Republics, no longer hiding the source of their advantage, build openly. The galaxy meets the Reapers with asari-grade defences.',
  historyChanges: [
    '2183: the asari disclose the Prothean beacon hidden in the Temple of Athame to the Council.',
    'Joint research spreads asari barrier, sensor and element zero engineering to every Council navy by 2186.',
    'More efficient element zero cores let spinal guns hit harder, and hulls gain Prothean-pattern plating.',
    'The Republics expand their fleet openly, and trust between the Council races deepens.',
  ],
  organic: tech({ kineticBarrierStrength: 1.35, barrierRegen: 1.3, sensors: 1.25, massAcceleratorDamage: 1.2, armourStrength: 1.1, hullIntegrity: 1.05 }),
  reaper: tech(),
  factionOverrides: {
    asari: { kineticBarrierStrength: 1.15, crewQuality: 1.1 },
  },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, asari: 1.25 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.65 },
};

export const TURIAN_TOTAL_WAR: RuleSet = {
  id: 'turian_total_war',
  name: 'Turian Total War',
  tagline: 'After Sovereign, the Hierarchy did what turians do: every citizen served and every yard built warships.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. The Citadel Fleet’s losses in 2183 convince the Primarch that Shepard’s warning is a military fact, and the Hierarchy mobilises as only a society built on universal service can. For three years reserve fleets are recommissioned, colony yards build at war tempo and the volus treasury pays for it. By 2186 the Hierarchy fields about two and a half times its canon fleet with crews drilled for this war, while the other Council races, as alarmed by the build-up as they are reassured, mobilise no faster than in canon.',
  historyChanges: [
    'Late 2183: the Primarch places the Hierarchy on a total-war footing in answer to Sovereign’s attack.',
    'Reserve fleets are recommissioned and colony yards build at war tempo for three years, financed by the volus.',
    'The Hierarchy enters 2186 with about two and a half times its canon fleet and crews drilled against Reaper tactics.',
    'The other Council races watch the build-up warily and mobilise no faster than in canon.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {
    turian: { crewQuality: 1.1, accuracy: 1.05 },
  },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, turian: 2.5 },
  strategic: { ...CANON_STRATEGIC },
};

export const LEVIATHANS_COVENANT: RuleSet = {
  id: 'leviathans_covenant',
  name: 'Leviathan’s Covenant',
  tagline: 'At Despoina the Leviathans stopped hiding. The makers of the Reapers’ maker went to war.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. When Shepard reaches Despoina in 2186, the Leviathans conclude that hiding has failed and commit everything they have to the war. Their hold over minds shields allied crews from indoctrination, their thralls across the galaxy report every Reaper movement, and their knowledge of how the Reapers were made shows gunners where the plating is thinnest. They cannot command a Reaper, but their presence unsettles one: Reaper fire control and coordination falter wherever the Leviathans fight.',
  historyChanges: [
    '2186: the Leviathans of Despoina join the war openly rather than as a hidden asset.',
    'Leviathan mental shielding protects allied crews; indoctrination no longer reaches the fleets.',
    'Thralls in every sector track Reaper movements, and Leviathan knowledge of Reaper construction guides allied targeting.',
    'Leviathan interference degrades Reaper targeting, electronic warfare and coordination in battle.',
  ],
  organic: tech({ sensors: 1.3, accuracy: 1.15, massAcceleratorPenetration: 1.3 }),
  reaper: tech({ accuracy: 0.75, electronicWarfare: 0.6 }),
  factionOverrides: {},
  special: { ...CANON_SPECIAL, indoctrinationDisabled: true, reaperCommandVulnerability: true },
  fleetStrength: { ...CANON_FLEETS },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.7, indoctrinationEffectiveness: 0, reaperCompetence: 0.6 },
};

export const CONDUIT_PROTOCOL: RuleSet = {
  id: 'conduit_protocol',
  name: 'The Conduit Protocol',
  tagline: 'The Protheans built one relay of their own. By 2186 the galaxy could lock the rest against their builders.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. After 2183 the Conduit, the small relay the Prothean scientists of Ilos built for themselves, is studied by a joint Alliance and Salarian Union team. Its design shows how a relay chooses what it carries, and by 2186 the Council can lock the relays the Reapers built against the Reapers themselves. The harvest has to cross the galaxy at ordinary faster-than-light speeds and reaches each battle in scattered groups, while the organic fleets still move through the network at will.',
  historyChanges: [
    '2183–2185: a joint Alliance–STG team studies the Prothean Conduit on Ilos.',
    '2186: the Council deploys relay locks, and the Reapers can no longer travel through the network they built.',
    'Reaper fleets cross between systems at ordinary FTL speeds and reach each battle in scattered groups.',
    'The organic fleets keep the relay network and concentrate faster than the Reapers can.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, reaper: 0.4 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.7, reaperReinforcements: 0.3, conventionalVictoryPossible: true },
};

export const ALTERNATE_PRESETS: RuleSet[] = [
  SOVEREIGNS_TRIUMPH,
  COLLECTORS_HARVEST,
  INDOCTRINATED_COUNCIL,
  LEVIATHANS_BARGAIN,
  VIGILS_WARNING,
  GETH_QUARIAN_CONCORD,
  ASARI_DISCLOSURE,
  TURIAN_TOTAL_WAR,
  LEVIATHANS_COVENANT,
  CONDUIT_PROTOCOL,
];

export const ALTERNATE_META: Record<string, AlternateMeta> = {
  sovereigns_triumph: {
    divergence: { year: 2183, event: 'Battle of the Citadel: Saren’s override of the Citadel holds and Sovereign opens the Citadel relay to dark space.' },
    canonBasis: 'In 2183 Saren reached the Citadel through the Conduit and locked its arms while Sovereign and a geth fleet attacked. Shepard broke the lock with data recovered on Ilos, and the combined fleets destroyed Sovereign after Saren died.',
    provenance: 'AU_MODIFIED',
    declaredTier: 1,
    lever: { key: 'fleetStrength.reaper', min: 1.25, max: 1.5 },
  },
  collectors_harvest: {
    divergence: { year: 2185, event: 'The assault on the Collector base fails beyond the Omega 4 relay.' },
    canonBasis: 'In 2185 Shepard, rebuilt by Cerberus, took the Normandy SR-2 through the Omega 4 relay to the Collector base near the galactic core and destroyed the human Reaper the Collectors were building from abducted colonists.',
    provenance: 'AU_MODIFIED',
    declaredTier: 2,
    lever: { key: 'fleetStrength.alliance', min: 0.65, max: 0.8 },
  },
  indoctrinated_council: {
    divergence: { year: 2185, event: 'A Council salvage task force recovers the derelict Reaper at Mnemosyne instead of letting it fall into the brown dwarf.' },
    canonBasis: 'In 2185 Shepard’s team boarded a Reaper that had been dead for millions of years in orbit of the brown dwarf Mnemosyne and recovered its IFF. The Cerberus scientists studying the wreck had been indoctrinated by it, and the derelict was lost to the brown dwarf after the team escaped.',
    provenance: 'AU_MODIFIED',
    declaredTier: 2,
    lever: { key: 'fleetStrength.turian', min: 0.6, max: 0.8 },
  },
  leviathans_bargain: {
    divergence: { year: 2186, event: 'The Reapers reach Despoina before Shepard; the surviving Leviathans bargain for their survival.' },
    canonBasis: 'In 2186 Dr. Ann Bryson’s research put Shepard on the trail of the Leviathans, the race that created the intelligence that created the Reapers, hidden for aeons on Despoina behind their thralls. In canon Shepard found them first and persuaded them to join the war.',
    provenance: 'AU_MODIFIED',
    declaredTier: 2,
    lever: { key: 'reaper.electronicWarfare', min: 1.5, max: 2 },
  },
  vigils_warning: {
    divergence: { year: 2183, event: 'Vigil’s complete archive leaves Ilos with Shepard and is authenticated by Council scientists.' },
    canonBasis: 'In 2183 Shepard reached Ilos, where Vigil, a Prothean VI, explained how the Reapers had used the Citadel to cut off the Prothean empire’s leadership, and gave Shepard the data that broke Saren’s hold on the Citadel.',
    provenance: 'AU_MODIFIED',
    declaredTier: 3,
    lever: { key: 'strategic.alliedCoordination', min: 0.5, max: 0.65 },
  },
  geth_quarian_concord: {
    divergence: { year: 1895, approximate: true, event: 'The quarian government recognises the geth instead of ordering their shutdown; the Morning War never happens.' },
    canonBasis: 'About three hundred years before 2183 the quarians’ geth servants began to show signs of self-awareness. The quarians tried to shut them down, lost the Morning War and fled Rannoch in the Migrant Fleet; by 2183 a heretic faction of geth served Sovereign.',
    provenance: 'AU_MODIFIED',
    declaredTier: 4,
    lever: { key: 'fleetStrength.geth', min: 2, max: 2.6 },
  },
  asari_disclosure: {
    divergence: { year: 2183, event: 'After Sovereign’s attack the asari councillor and the matriarchs disclose the Prothean beacon in the Temple of Athame.' },
    canonBasis: 'The asari kept a Prothean beacon hidden in the Temple of Athame on Thessia for thousands of years, and it fed their technological lead; the secret came out only in 2186, when the Reapers attacked Thessia.',
    provenance: 'AU_MODIFIED',
    declaredTier: 4,
    lever: { key: 'organic.massAcceleratorDamage', min: 1.1, max: 1.25 },
  },
  turian_total_war: {
    divergence: { year: 2183, event: 'After the Battle of the Citadel the Primarch places the Hierarchy on a total-war footing.' },
    canonBasis: 'Turians serve in the military from the age of fifteen, the Hierarchy fields the largest navy in Citadel space and the volus are its client race. The Citadel Fleet took heavy losses against Sovereign in 2183, but the Hierarchy did not mobilise against the Reapers before they struck Palaven in 2186.',
    provenance: 'AU_MODIFIED',
    declaredTier: 5,
    lever: { key: 'fleetStrength.turian', min: 2.2, max: 2.8 },
  },
  leviathans_covenant: {
    divergence: { year: 2186, event: 'At Despoina the Leviathans join the war openly instead of as a hidden asset.' },
    canonBasis: 'In 2186 Shepard followed Dr. Ann Bryson’s research to Despoina, where the Leviathans, who created the intelligence that created the Reapers, had hidden for aeons behind their thralls; the first Reaper had been made in their image. Shepard persuaded them to join the war.',
    provenance: 'AU_MODIFIED',
    declaredTier: 5,
    lever: { key: 'reaper.accuracy', min: 0.7, max: 0.8 },
  },
  conduit_protocol: {
    divergence: { year: 2183, event: 'A joint Alliance–STG team begins studying the Prothean Conduit on Ilos.' },
    canonBasis: 'The Conduit on Ilos was a small mass relay built by Prothean scientists, and Saren and Shepard used it in 2183 to reach the Citadel. The Reapers built the mass relay network, and the Citadel itself is a relay to dark space.',
    provenance: 'AU_MODIFIED',
    declaredTier: 6,
    lever: { key: 'fleetStrength.reaper', min: 0.35, max: 0.45 },
  },
};
```
