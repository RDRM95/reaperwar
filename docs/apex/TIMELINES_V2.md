# Timelines V2 — ten new alternate timelines and a measured “Threat to the Reapers” scale

Status: **revised after review (4 November 2026); implemented on `stage/T-timelines`; second review applied (5 November)** (§4.13 lists the commits). Stage T, written on base `ba4decf` and revised the same day after a design review: the eleven findings and what was done with each are listed in the [Review notes](#review-notes-4-november) at the end. The implementation review of 5 November (four findings: an out-of-date table after the merge, thresholds the probe ladder did not support, a lore error about the Leviathan research and missing AU labels) is answered in the [second review notes](#review-notes-5-november): the branch merged the integration head, the thresholds are now derived from a preset-blind probe ladder (§1.3), re-basing is mechanical and an out-of-date table fails a test (§1.8), and the table was re-measured on the merged engine. The owner asked for more Mass Effect timelines, creative within the Mass Effect framework, with varying levels of threat to the Reapers. This document defines how that threat is measured, proposes ten new alternate timelines that span every level, places the eight existing presets on the same scale, and specifies the implementation.

Sources read: `src/timelines/rules.ts` (`RuleSet`, `TechModifiers`, the canon constants, `applyRulesToShip`, `applyRulesToWeapon`), `src/timelines/presets.ts`, `src/timelines/schema.ts` (`validateRuleSet`, `normaliseRules`, the ranges and consistency rules), `src/data/factions.ts`, `src/data/ships.ts`, `src/data/weapons.ts`, `src/data/types.ts`, `src/scenarios/index.ts` (`fleet()`, `scaleCount`, every scenario), `src/simulation/battle.ts` (`checkEnd`, the command-vulnerability rule), `src/simulation/damage.ts` (`hitProbability`), `src/simulation/results.ts`, `src/simulation/formations.ts`, `src/ui/app.ts`, `src/ui/screens/timelines.ts`, `briefing.ts`, `campaign.ts` (setup), `codex.ts`, `src/codex/entries.ts`, `src/campaign/engine.ts`, `src/campaign/depth.ts`, `src/core/lint.ts`, `src/core/provenance.ts`, `AU_RULES.md`, `LORE_REFERENCE.md`, `docs/V2_CINEMATIC_BRIEF.md` §14 and, on the CORE branch (`5f94889`), §19, `docs/apex/CALIBRATION_REPORT.md`, `docs/apex/CONTINUATION.md`, `tests/support/calibration.ts`, `scripts/calibration.ts`, `tests/support/async.ts`, `tests/timelines.test.ts`, `tests/battle.test.ts`, `tests/lint.test.ts`.

Two kinds of figures appear. *Design-time* figures were measured headless on `ba4decf` with a scratch prototype of the first draft’s reference (Appendix B), before the review; they explain choices and are labelled as such. *Measured* figures come from the implementation’s `npm run timeline:threat` (the generated `src/timelines/threatMeasured.ts` and `docs/apex/TIMELINE_THREAT.md`), which is the authority: the review changed the reference (absent factions field nothing, the standoff and the time limit derive from engine quantities, the breaking point names the group actually deployed) and six of the ten timelines. The CORE stage keeps changing battle trajectories (T9 to T12 landed after this branch’s base; all four are merged into this branch and measured), so **no figure here is a pin**: the release regenerates the table, and the labels follow that measurement (§4.14). Measured figures in this revision are from `3c91a33`, the integration head `219f082` with this branch on top; figures from the first implementation run (`d8ee133`) are labelled with that commit.

## 0. Summary

- **The scale.** "Threat to the Reapers" is a 0–100 index measured on one fixed coalition-versus-Reaper engagement, fought against five Reaper groups of growing size (2 to 6 capital ships before a timeline scales them, the *rungs*) with four seeds each: **index = 50 × (mean Reaper hull lost + mean organic survival)** over the twenty battles. Six tiers, 1 Negligible, 2 Low, 3 Moderate, 4 Serious, 5 Severe and 6 Existential, with thresholds **19 / 26 / 45 / 64 / 84** derived from a probe ladder built from canon alone (§1.3): each lies midway between the probes either side of one rule (wins any battle; holds one, two or three groups; holds all five), and the re-basing that moves them is mechanical (§1.8). Canon measures **4 Serious** (46.2): on this engine it holds the Strike group in three of four seeds.
- **Ten new timelines**, all ALTERNATE UNIVERSE, each diverging at a named event of established history: tier 1 **Sovereign’s Triumph**; tier 2 **The Indoctrinated Council**, **Leviathan’s Bargain**; tier 3 **Vigil’s Warning**, **The Collectors’ Harvest**; tier 4 **The Geth–Quarian Concord**, **The Asari Disclosure**; tier 5 **Turian Total War**, **Leviathan’s Covenant**; tier 6 **The Conduit Protocol**. Every one measures inside its intended tier, 1.8 to 11.1 index points from the nearest boundary (the three closest, Vigil’s Warning, The Collectors’ Harvest and the Concord, are inside seed noise of a boundary, §1.7), and every one’s tuning lever was measured at both ends of its range. On this engine four levers move the index both ways and two, at an open end of the scale, the one way that can be needed; Vigil’s Warning’s and The Asari Disclosure’s can only raise it (§2.5, §2.7), and The Indoctrinated Council’s and the Concord’s are flat, within seed noise either way (§2.3, §2.6). A release that finds one of those four above its band (the two flat ones, on either side) goes to rule 3 of §1.8. After the 5 November re-measurement Vigil’s Warning’s lever moved to the floor of its range (§1.8 rule 1) and The Collectors’ Harvest, whose lever could not reach tier 2, is declared tier 3 (rule 3, §2.2). Vigil’s Warning, canon’s galaxy with slightly better coordination and screening, now measures 3.0 below canon and one tier lower: both sit at the tier-3/4 boundary, where seed noise decides (§2.5). The three in tiers 1–2 weaken the galaxy or strengthen the Reapers and change nothing in the organics’ favour; so does The Collectors’ Harvest.
- **The eight existing presets** keep their numbers and take the label they measure: Reaper Escalation 1, canon 4, Cerberus Reformed 4, Cerberus Ascendant 4 (explained in §3), Prepared Galaxy 5, Humanity Ascendant 5, Prime/Apex core 6, Apex legacy 6. On the first implementation run (`d8ee133`, formula-1 thresholds) canon and the two Cerberus presets read 3 Moderate.
- **Review.** All eleven findings of the 4 November review were accepted: four stories corrected against canon (Vigil’s Warning, The Collectors’ Harvest, Leviathan’s Bargain, the Concord), absent factions removed from the reference, world-state locks so the campaign and Quick Battle do not narrate what a timeline rules out, the breaking point measured on the groups actually deployed, levers measured at both ends (one of which could only raise its timeline’s index, stated in §2.3), and a reference defined from engine quantities with a re-basing rule. All four findings of the 5 November review were accepted (second review notes).
- **Implementation** (§4): `src/timelines/alternates.ts` (the ten presets, their metadata, the lever and world-state helpers), an import and a spread in `presets.ts`, `src/timelines/threat.ts` (scale, formula, ratings, sentences), the generated `src/timelines/threatMeasured.ts`, `src/scenarios/threatReference.ts` (the engagement and the per-battle metrics), `scripts/timeline-threat.ts` (`npm run timeline:threat`, which also writes `docs/apex/TIMELINE_THREAT.md`), a threat badge on every timeline card and in the briefing and campaign pickers, the world-state locks, a Timelines codex category, and `tests/alternateTimelines.test.ts`.

Measured results for all eighteen presets, ordered by index (run on `3c91a33`, the integration head `219f082` with this branch on top; `TIMELINE_THREAT.md` is the authority):

| Tier | Timeline | id | Index | Reaper losses | Organic survival | Holds (breaking point; capitals/destroyers as deployed) |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 1 Negligible | Sovereign’s Triumph (new) | `sovereigns_triumph` | 11.5 | 21 % | 2 % | none |
| 1 Negligible | Reaper Escalation | `reaper_escalation` | 16.0 | 28 % | 3 % | none |
| 2 Low | Leviathan’s Bargain (new) | `leviathans_bargain` | 22.5 | 33 % | 13 % | none |
| 2 Low | The Indoctrinated Council (new) | `indoctrinated_council` | 23.4 | 35 % | 11 % | none |
| 3 Moderate | The Collectors’ Harvest (new) | `collectors_harvest` | 27.9 | 40 % | 16 % | up to the Raid (2/6) |
| 3 Moderate | Vigil’s Warning (new) | `vigils_warning` | 43.2 | 58 % | 29 % | up to the Raid (2/5) |
| 4 Serious | Canon Mass Effect 3 | `canon_me3` | 46.2 | 61 % | 32 % | up to the Strike group (3/7) |
| 4 Serious | Cerberus Reformed | `cerberus_reformed` | 49.0 | 63 % | 35 % | up to the Strike group (3/7) |
| 4 Serious | Cerberus Ascendant | `cerberus_ascendant` | 51.4 | 65 % | 37 % | up to the Strike group (3/7) |
| 4 Serious | The Asari Disclosure (new) | `asari_disclosure` | 52.0 | 69 % | 35 % | up to the Strike group (3/7) |
| 4 Serious | The Geth–Quarian Concord (new) | `geth_quarian_concord` | 60.4 | 74 % | 47 % | up to the Strike group (3/7) |
| 5 Severe | Turian Total War (new) | `turian_total_war` | 72.0 | 86 % | 58 % | up to the Battlegroup (4/10) |
| 5 Severe | Leviathan’s Covenant (new) | `leviathans_covenant` | 74.3 | 88 % | 61 % | up to the Battlegroup (4/10) |
| 5 Severe | Prepared Galaxy | `prepared_galaxy` | 75.9 | 91 % | 61 % | up to the Battlegroup (4/10) |
| 5 Severe | Humanity Ascendant | `humanity_ascendant` | 81.2 | 92 % | 71 % | up to the Assault fleet (5/12) |
| 6 Existential | The Conduit Protocol (new) | `conduit_protocol` | 95.1 | 98 % | 92 % | all five, to the Harvest fleet (2/6) |
| 6 Existential | Prime/Apex — Apex legacy (high power) | `apex_legacy` | 98.6 | 100 % | 98 % | all five, to the Harvest fleet (6/14) |
| 6 Existential | Prime/Apex — Apex core | `prime_apex` | 98.6 | 100 % | 98 % | all five, to the Harvest fleet (6/14) |

## 1. The Threat to the Reapers scale

### 1.1 The reference engagement: `threat_reference`

The **threat reference engagement** (`threat_reference`; `SIMULATION_ESTIMATE` — a compressed stand-in like every scenario fleet, not a canon battle) sets a Council-era coalition in a battle line in deep space against a Reaper group. The same coalition fights five Reaper groups of growing size, the rungs, on four seeds each: twenty battles per timeline. The geometry and the clock are defined from engine quantities, so they keep their meaning when the catalogue's ranges or speeds change (§1.8):

- **Standoff** `THREAT_STANDOFF` = 1.07 × the longest weapon range in the catalogue before any rule multiplier, in 0.1 km steps: 1.07 × 56 = **59.9 nominal km** today (the 56 km belongs to the Legacy Nova and the heavy Sol platform gun; the longest capital beam reaches 44 km). Nobody can fire before the first move, whatever the catalogue holds.
- **Time limit** `THREAT_MAX_DURATION` = 3.2 × the time a canon Reaper capital at its catalogue top speed (0.8 nominal km/s) needs to cross the standoff, in whole seconds: **240 s** today. The attrition judgement ends unfinished battles; how many end that way is reported and bounded (§1.8).
- Environment `deep_space`; `perspectiveSide` `'A'`; no world state, beats or distant layer.
- Positions are nominal km, the scenario convention (`deployFleet` applies `BATTLESPACE_SCALE`). The coalition line stands at z = −standoff/2 heading +z, Cerberus 12 km behind it; the Reaper group at (0, 0, +standoff/2) heading −z, formation `strike_wedge`, side B, not player-controlled.
- **Seeds 1, 2, 3, 4.**

**Coalition (side A).** One contingent per Council-era navy, each built with the scenario `fleet()` builder **with fleet scaling on** (no `fleet_scaling: fixed`), so every faction’s `fleetStrength` and `factionOverrides` act. The base counts below are the canon counts (`fleetStrength` 1); `fleet()` scales each class with `scaleCount` (rounded, never below one hull), limits carriers to ×1.5 and never scales unique hulls (`UNIQUE_CLASS_IDS`). The order of the contingents in `fleets` and of the classes inside each contingent is part of the definition, because it fixes the order of the random draws.

**0 = absent.** A contingent is fielded only when its faction’s `fleetStrength` is above 0 (`contingentFields`). Without this rule `scaleCount`’s one-hull minimum would keep a token contingent of a navy the story removes. Two new timelines use it: Sovereign’s Triumph (`geth` 0: the heretics serve the harvest and the rest stay behind the Veil) and The Collectors’ Harvest (`quarian` and `geth` 0: Rannoch stays at war). In Quick Battle scenarios and the campaign, 0 still leaves one hull per class (`scaleCount`), a known limitation listed in `AU_RULES.md`.

| # | Fleet id | Faction | Name | Anchor x | Formation | Base counts, in this order | Conditional hulls and contingents (rule-driven) |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 1 | `ref-alliance` | alliance | Systems Alliance | −5 | `line_abreast` | `alliance_dreadnought` 2, `alliance_carrier` 1, `alliance_cruiser` 3, `alliance_frigate` 3 | `normandy_sr2` 1 if `strategic.shepardAlive`; `normandy_valkyrie` 1 if `special.valkyrieAvailable`; `alliance_super_dreadnought` 1 if `special.superDreadnoughts` |
| 2 | `ref-turian` | turian | Turian Hierarchy | −15 | `line_abreast` | `turian_dreadnought` 2, `turian_cruiser` 3, `turian_frigate` 3 | `turian_super_dreadnought` 1 if `special.superDreadnoughts` |
| 3 | `ref-asari` | asari | Asari Republics | +5 | `defensive_screen` | `asari_dreadnought` 1, `asari_cruiser` 3 | — |
| 4 | `ref-salarian` | salarian | Salarian Union | +15 | `line_abreast` | `salarian_dreadnought` 1, `salarian_cruiser` 2, `salarian_frigate` 2 | — |
| 5 | `ref-quarian` | quarian | Quarian fleet | +25 | `defensive_screen` | `quarian_heavy` 1, `quarian_cruiser` 3 | — |
| 6 | `ref-geth` | geth | Geth fleet | −25 | `strike_wedge` | `geth_dreadnought` 1, `geth_cruiser` 2, `geth_frigate` 2 | — |
| 7 | `ref-cerberus` | cerberus | Cerberus | 0 (12 km behind) | `strike_wedge` | `cerberus_cruiser` 2, `cerberus_frigate` 3 | the whole contingent **only when** `strategic.cerberusStance` is `cooperative` or `controls_reapers` (the predicate Cerberus Intervention and the campaign already use); `cerberus_dreadnought` 1 if `isApexRules(rules)` |
| 8 | `ref-reapers` | reaper | Reaper *rung* | 0 (+standoff/2), side B | `strike_wedge` | `reaper_capital` *c*, `reaper_destroyer` *d* of the rung | — |

Every contingent also requires its faction’s `fleetStrength` > 0. The contingent names are neutral ("Quarian fleet", not "Migrant Fleet") because the quarians of The Geth–Quarian Concord have a homeworld navy; names never reach the random draws. Under canon the coalition fields 36 hulls: 8 dreadnought-class ships, a carrier with its Tridents, 16 cruisers, 10 frigates and the Normandy. Harbinger never appears (a 4,000-point unique hull would dominate the losses term) and neither does the Destiny Ascension (a player-dependent survivor).

**Rungs (side B)**, before the timeline’s own `fleetStrength.reaper` scales them. Each capital carries its catalogue Oculi (8) and each destroyer 2. `threatRungGroups(rules)` gives the groups a timeline actually deploys, and every rating names those (§1.4).

| Rung | Name | Capitals | Destroyers |
| --- | --- | ---: | ---: |
| 1 | Raid | 2 | 5 |
| 2 | Strike group | 3 | 7 |
| 3 | Battlegroup | 4 | 10 |
| 4 | Assault fleet | 5 | 12 |
| 5 | Harvest fleet | 6 | 14 |

### 1.2 The formula

For one battle *b* (rung *k*, seed *s*), read when the battle has ended (by destruction or by the attrition judgement at the time limit):

- **Reaper hull lost** L_b = Σ v_r·ℓ_r / Σ v_r over every side-B hull deployed with `role !== 'fighter'`, where v_r is the class `pointValue` (destroyer 260, capital 2,600) and ℓ_r = 1 if the hull was destroyed, otherwise 1 − hull_r / maxHull_r. Partial damage counts, so a capital left with a tenth of its hull is 90 % lost; barriers and armour do not count (barriers regenerate).
- **Organic survival** S_b = `result.sides.A.survivalPercent` / 100: the point value of the side-A hulls still alive over the point value deployed (non-fighters), the figure the results screen already prints.
- **Battle index** I_b = 50 × (L_b + S_b): 0 when the Reapers lose nothing and every organic hull dies, 100 when every Reaper dies and nothing is lost.
- Each battle also records whether it ended on the time limit (`ThreatRun.timeLimit`).

A timeline’s **threat index** is the mean over its twenty battles (five rungs × four seeds, equal weights): **I = 50 × (mean L + mean S)**. The **Reaper losses** and **organic survival** the UI shows are 100 × mean L and 100 × mean S. The table stores the index with one decimal and the tier is computed from the stored value.

Why these terms: while the organics lose, S is 0 and the index is half the Reaper losses, that is, how much the galaxy makes the Reapers pay; once they win, L is 1 and the index rises with what they keep, that is, how cheaply they win. Point values weigh a capital as ten destroyers, which is how the game already values them (campaign fleet points, the results screen). Survival counts kills only, like the results screen; Reaper losses count damage so that a nearly dead capital does not score like an untouched one.

### 1.3 The six tiers

The five thresholds are **derived, not chosen**: they come from a *probe ladder* measured on the reference itself, built from canon alone, and no threshold is set by looking at a preset. Today (formula version 2, re-based on `fcc3ae0`, the engine of the integration head `219f082`) they are **19, 26, 45, 64 and 84**. `THREAT_SCALE` in the generated table records them with the ladder they came from, `TIMELINE_THREAT.md` prints both, and a test checks that the committed thresholds are the ones the recorded ladder derives.

**The probe ladder.** A probe is canon with every organic faction’s `fireRate`, `heatCapacity` and `hullIntegrity` multiplied by m (`threatProbeRules(m)`; the heat capacity moves with the fire rate, so a ship’s heat cycle is unchanged). A probe at m carries the total firepower and the total hull of m times the canon ships, so the ladder is the continuous counterpart of “canon with every organic fleet × m” without `scaleCount`’s rounding: with base counts of one to three hulls a class (§1.6), a fleet multiplier between about 0.5 and 1.49 cannot change a one-hull class, and the first implementation’s fleet ladder never produced two or four groups held (on `8e99dbf`). Each probe is measured exactly like a timeline, five groups × four seeds. The ladder starts on a fixed grid of m (×0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.55, 1.95, 2.45 and 3.05; canon is ×1) and bisects every transition, at the geometric midpoint rounded to three decimals, until the two probes either side lie within ×1.03 of each other or within 2 index points; a transition that skips a count of groups held is bisected down to ×1.03 whatever the gap, so every count that exists between two probes is found. Where a rule has probes on one side only, the ladder extends by ×1.25 (between ×0.1 and ×8). Every step is deterministic: the same commit gives the same ladder. On `fcc3ae0` it took 26 probes and produced every count of groups held from 0 to 5.

**The split rules.** Each tier floor has one rule, and a probe that meets the rule stands at or above that tier (`THREAT_SPLIT_RULES`):

| Floor of tier | A probe at or above it … | Below (highest index, m) | At or above (lowest index, m) | Threshold |
| --- | --- | ---: | ---: | ---: |
| 2 Low | wins at least one of its twenty battles | 15.8 (×0.57) | 21.8 (×0.589) | 19 |
| 3 Moderate | holds at least one group (the Raid) | 24.0 (×0.65) | 27.8 (×0.721) | 26 |
| 4 Serious | holds at least two groups | 43.8 (×0.973) | 46.2 (×1, canon) | 45 |
| 5 Severe | holds at least three groups | 63.9 (×1.392) | 64.4 (×1.43) | 64 |
| 6 Existential | holds all five groups | 79.1 (×1.789) | 89.7 (×1.95) | 84 |

Each threshold is the midpoint between the highest index among the probes that fail its rule and the lowest index among the probes that meet it, rounded to a whole index point (`thresholdsFromProbes`). Tier 1 against tier 2 splits the coalitions that hold nothing by whether they can win anything at all; tier 5 spans three and four groups held, as it always did, and so has no split of its own. The rules speak of groups held, but a tier is decided by the index alone: a timeline’s own breaking point (§1.4) can differ from its tier’s rule, because its galaxy differs from canon in more than strength. Canon itself, the ladder’s ×1 point, holds the Strike group in exactly three of four seeds on this engine and is the lowest probe that holds two groups, so it stands 1.2 points above the tier-4 floor.

**How the formula-1 thresholds were placed.** The first implementation’s thresholds, 17 / 30 / 48 / 62 / 87, were not preset-blind, although this section used to say that they were never tuned to a preset. They were placed at design time between the index clusters that the design-time presets formed by groups held (about 11 for a coalition that cannot hurt even a raid, 23 for one that trades but wins nothing, 36 for one that holds the raid, 51–57 for two groups, 64–78 for three or four and 94–97 for all five): that is, by looking at presets. The fleet ladder of the time did not support them: on `8e99dbf` it printed only three candidate thresholds (18.9, 49.8 and 75.9), because its probes held zero, one, three or five groups, and its one-group probes (×0.6 at 23.0, ×0.8 at 32.4, ×1 at 35.4) fell on both sides of 30. The review of 5 November found this (review note 2 below); formula version 2 replaced them with the derived thresholds.

The “what it means” sentences are generated from the band itself (`bandClaims`, `bandStatement`) and are true by construction from I = 50 × (L + S) with L and S between 0 and 1: L + S ≥ min/50 gives max(L, S) ≥ min/100 and, since neither exceeds 1, min(L, S) ≥ min/50 − 1; L + S < max/50 gives max(L, S) < max/50 and min(L, S) < max/100. Only the bounds that say something are printed, stated exactly (38 %, not “about a third”), and a test checks every one of them against every (L, S) its band admits on a 0.005 grid, for today’s thresholds and for the formula-1 ones. They never name a rung: what a particular timeline holds depends on the groups it actually meets (a timeline with `fleetStrength.reaper` 1.3 meets a three-capital raid), so that sentence is generated from the timeline’s own measured rung table (§1.4).

| Tier | Label | Index | What the band means (`THREAT_TIERS[].summary`) |
| --- | --- | --- | --- |
| 1 | Negligible | below 19 | Index under 19: Reaper losses and organic survival add up to less than 0.38, so the Reapers lose less than 38 % of the hull value they commit and less than 38 % of the coalition survives; and the smaller of the two stays under 19 %. |
| 2 | Low | 19 to below 26 | Index 19 to 26: Reaper losses and organic survival add up to 0.38 to 0.52, so at least one of the two reaches 19 %; the Reapers lose less than 52 % of the hull value they commit and less than 52 % of the coalition survives; and the smaller of the two stays under 26 %. |
| 3 | Moderate | 26 to below 45 | Index 26 to 45: Reaper losses and organic survival add up to 0.52 to 0.90, so at least one of the two reaches 26 %; the Reapers lose less than 90 % of the hull value they commit and less than 90 % of the coalition survives; and the smaller of the two stays under 45 %. |
| 4 | Serious | 45 to below 64 | Index 45 to 64: Reaper losses and organic survival add up to 0.90 to 1.28, so at least one of the two reaches 45 %; and the smaller of the two stays under 64 %. |
| 5 | Severe | 64 to below 84 | Index 64 to 84: Reaper losses and organic survival add up to 1.28 to 1.68, so the Reapers lose at least 28 % of the hull value they commit and at least 28 % of the coalition survives; at least one of the two reaches 64 %; and the smaller of the two stays under 84 %. |
| 6 | Existential | 84 and above | Index 84 and above: Reaper losses and organic survival add up to at least 1.68, so the Reapers lose at least 68 % of the hull value they commit and at least 68 % of the coalition survives; and at least one of the two reaches 84 %. |

The scale measures how dangerous a galaxy is to the Reapers in conventional battle, not who wins the war: a Crucible, a Catalyst or a controlled Reaper fleet changes the campaign, not this index (§1.5). The UI says "measured in conventional battle" next to every rating.

### 1.4 Breaking point

Each rating also carries a **breaking point**: `holdsRungs`, the number of consecutive rungs, from the Raid up, that the coalition wins (`winner === 'A'`) in at least 3 of 4 seeds, and `holdsUpTo`, the capital count of the largest held group **as this timeline deploys it** (after `fleetStrength.reaper`; 0 when it holds none). `RungMeasure` stores the deployed capitals and destroyers of every rung (`threatRungGroups`), so the sentence always names the battle that was fought:

- "Holds none of the reference Reaper groups."
- "Holds the Raid (3 capitals, 7 destroyers in this timeline) and no larger reference group."
- "Holds every reference Reaper group up to the Battlegroup (4 capitals, 10 destroyers in this timeline) and none above it."
- "Holds all 5 reference Reaper groups, up to the Harvest fleet (2 capitals, 6 destroyers in this timeline)."

It explains a tier in one line; it does not decide it.

### 1.5 What the reference sees, and what it does not

Seen, because they change the battles: every organic and Reaper `TechModifiers` key; the `factionOverrides` of all seven organic factions (Cerberus only when allied); `special.thanixAvailability`, `hyperMassAccelerators`, `hadesRounds`, `reaperCommandVulnerability`, `indoctrinationDisabled`, `valkyrieAvailable` (the Valkyrie, and through it `legacyNova`) and `superDreadnoughts`; the `fleetStrength` of every faction including the Reapers (Cerberus only when allied; 0 removes a contingent); `strategic.alliedCoordination`, `reaperCompetence` and `indoctrinationEffectiveness` (through crew quality), `cerberusStance` (whether Cerberus fights beside the coalition) and `shepardAlive` (whether the Normandy is there).

Not seen today: `driveAttacks` and `reaperDoctrine: 'apex'` until the CORE stage implements them in battle (they will then act by themselves, since the Apex presets field Black Fleet dreadnoughts); `heavyPlatforms` (Sol scenarios only); `readinessScale` (the reference sets no readiness tiers); and the campaign-only variables `reaperReinforcements`, `conventionalVictoryPossible`, `crucibleAvailable`, `shepardEffectiveness`, `illusiveManIndoctrinated`, `harbingerOperational`, `catalystOperational` and `homeworldIndependence`. A hostile Cerberus never appears in the reference. Each new timeline marks its campaign-only knobs as such.

### 1.6 Why a ladder and a compact line (design-time evidence)

The figures in this section are design-time (first-draft prototype on `ba4decf`); they explain the shape of the reference, not any current label.

A single engagement was tried first and rejected, because its outcome flips like a switch:

- One 74-hull coalition against one Reaper group: canon measured **83.7, 42.6 and 25.8** against 4, 5 and 6 capitals (with 10, 12 and 14 destroyers). One extra capital moved canon by 40 points. At any fixed size, every timeline a little stronger than canon reads Severe or Existential and every timeline a little weaker reads Negligible.
- Against the six-capital group alone, Prepared Galaxy (83.4) and Humanity Ascendant (88.0 at a 240 s limit) sat with the Apex presets; the top three tiers could not be told apart.
- The five-rung ladder averages five such switches set at five strengths, so the index rises smoothly with a timeline’s real strength and spreads the eighteen presets from 11 to 97.

Where the contingents stand matters too, so the line is compact and on one front. With the contingents spread to ±40 km and staggered in depth, the flank fleets engaged late: a geth–quarian probe measured 53.1 and canon 33.4. On the compact line (±25 km, one depth) they measured 67.3 and 36.1. Stacking every contingent on one anchor removes position bias altogether (67.2 and 47.5) but overlaps the formations, which a battle that may one day be shown on screen should not do. The compact line keeps the remaining bias small without overlap.

Small base counts keep twenty battles per timeline affordable, at a price in granularity: `scaleCount` rounds per class, so a multiplier between about 0.5 and 1.49 cannot change a one-hull class, and `alliance` 0.6, 0.65 and 0.7 all give 1 DN, 1 CV, 2 CA, 2 FF. Every new timeline therefore lists the order of battle it actually produces in the reference, and none relies on a value that changes nothing there without saying so.

### 1.7 Runtime and noise

The engine the scale now measures is slower than the first implementation’s: with CORE T9 to T12 (3D formations, movement, flights of craft, Reaper AI) a reference battle takes 1.7 to 8.7 s on average, depending on the phase, and at most 12.5 s, on the 4-CPU dev container with four jobs, against 1.2–1.5 s on `d8ee133`; evenly matched probes fight longest. The full run on `fcc3ae0`, with the machine to itself, took 15.4 minutes: the probe ladder 8.6 minutes (26 probes, 520 battles, more than half of it in the refinement rounds), the 360 table battles 4.0 minutes and the 400 lever battles 2.9 minutes. The run on `3c91a33` that wrote the committed table shared the CPUs with other jobs and took 23 minutes. `--check` measures the ladder and the presets, about 12.5 minutes on an idle machine. The design-time prototype measured 1.24 s on average and 2.96 s at most, sequentially, over the four heaviest presets.

Every battle is deterministic: two runs of the same rule set on the same battle code agree to the last digit. The full runs on `fcc3ae0` and `3c91a33` agree on all 26 probes and on every preset whose values did not change, and Vigil’s Warning at crew quality 1.0 measured 43.2 with identical per-group figures in the lever run of `fcc3ae0`, in a separate run and in the table of `3c91a33`. So “noise” below means seed noise, the spread between the four seeds of one measurement, not run-to-run variation. At design time the standard deviation of a preset’s per-seed index (the mean over the five rungs of one seed) was 0.2–7.4 points, so a four-seed mean carries a standard error of about 0.1–3.7 points. A knob worth less than about 5 % of hit chance moves a tier-2 index by less than that noise, because a tier-2 index is decided by whether the coalition wins the Raid, which flips from seed to seed; on this engine the same holds for several levers (§0). The ten new timelines sit 1.8–11.1 points inside their bands; the three closest are Vigil’s Warning (1.8 under the tier-4 floor), The Collectors’ Harvest (1.9 above the tier-3 floor) and the Concord (3.6 under the tier-5 floor). Of the existing presets canon stands 1.2 points above the tier-4 floor, which is its own ladder point (§1.3), Humanity Ascendant 2.8 under the tier-6 floor and Reaper Escalation 3.0 under the tier-2 floor. Seed noise also orders two near neighbours the wrong way round: Vigil’s Warning, canon with a little more warning, measures 3.0 below canon and one tier lower (§2.5). Their labels may change when the engine changes; that is reported, not corrected.

### 1.8 Keeping declared tiers honest as the engine changes

Each new timeline declares its intended tier (`ALTERNATE_META[id].declaredTier`), and the test of §4.11 requires the declared tier to equal the tier the generated table implies. The existing presets declare nothing: their label is whatever the table says.

**Levers.** Each new timeline names one tuning lever (`ALTERNATE_META[id].lever`): a knob that acts in battle, fits the story and moves the index in both directions over a documented, story-safe range. A lever is a continuous multiplier wherever the story allows. A fleet lever is a count: it changes the reference only where `scaleCount` rounds to a new number, so it is kept only over a range in which the counts change without crossing a tier cliff. A **step** is 0.05 for a multiplier (0.02 where the story-safe range is narrower than 0.1, as for Vigil’s Warning) and, for a fleet lever (`step: 'count'`), the next value at which a reference count changes. A continuous lever’s ends may lie outside the declared band: that is its reach, and the ends are published. A count lever may not cross a tier in a single count step anywhere inside its range. Every run of `npm run timeline:threat` measures each new timeline at both ends of its lever range and writes both indices into `TIMELINE_THREAT.md` (and `THREAT_LEVERS` in the table); each §2 section quotes them. For a tier-1 timeline only the downward direction can ever be needed, and for a tier-6 timeline only the upward one, because those bands are open on one side. On the merged engine four levers fall short of the both-directions requirement: The Indoctrinated Council’s and the Concord’s are flat, and Vigil’s Warning’s (at the floor of its range) and The Asari Disclosure’s can only raise their index (§0, §2.3, §2.5–§2.7). For those four a release that finds the timeline above its band (for the two flat ones, on either side of it) goes straight to rule 3.

**When a release measurement puts a new timeline outside its declared band:**

1. Move only that timeline’s lever, one step at a time toward the band’s centre, re-measuring with `npm run timeline:threat -- --only <id>`.
2. Never move a threshold by hand (only a re-base moves one, below), never change an existing preset’s numbers, and never change the formula or the reference engagement to rescue a label.
3. If the lever’s range runs out, change the declared tier only together with a story-consistent text change, and report it in the stage log.

**Re-basing (mechanical).** The standoff and the time limit are derived from the catalogue (§1.1), so the reference keeps its geometry and its clock when ranges or speeds change; the thresholds come from the probe ladder (§1.3), which moves with the engine. The default run (`npm run timeline:threat`) measures the ladder **before any preset** and re-bases, that is, adopts the thresholds the ladder derives and records the ladder in `THREAT_SCALE`, when any of these holds (`rebaseReasons` in `threat.ts`):

1. no ladder is recorded for the committed thresholds;
2. `THREAT_FORMULA_VERSION` differs from the recorded one (it is bumped by hand whenever the reference engagement, the formula or the probe ladder changes meaning);
3. `THREAT_STANDOFF` or `THREAT_MAX_DURATION` differs from the recorded one (a catalogue range or the Reaper capital’s top speed changed);
4. any threshold the ladder derives now differs from the committed one by more than **2 index points** (`THREAT_REBASE_DRIFT`).

Otherwise the committed scale is kept, so a small engine change does not move a threshold, and the report states what the ladder derived. A re-base prints and reports the old and the new thresholds; only then does rule 1 apply to the new timelines. `--check` measures the same ladder and fails when a re-base is due. Nobody has to judge whether a CORE change “counts” as a change to ranges, speeds or the time scale: the ladder decides, the same way on every commit.

**Out-of-date tables.** `THREAT_FINGERPRINT` (generated) records what the table was measured from: a hash of the battle-relevant catalogue (every weapon and ship class, the faction doctrine and the number of comms lines each event draws from, which take values from the battle’s random stream, the data constants and `src/simulation/constants.ts`; names, descriptions, provenance notes and colours never count) and, per preset, of its battle-relevant knobs and the reference fleets it builds, so a change to `fleet()` or to the coalition shows as well. `tests/alternateTimelines.test.ts` fails as soon as either no longer matches, names what changed and says how to regenerate, so a merge that changes the catalogue or a preset turns a gate red. Engine code (movement, AI, damage) is not data and is not hashed; `--check`, the release gate (§4.14), re-measures every preset and fails when a tier differs or an index differs by more than 0.5 (`THREAT_INDEX_TOLERANCE`: the runs are deterministic, so an unchanged engine reproduces the table exactly).

**Time limit.** The script reports the share of reference battles that end on the time limit (design-time, 4 Nov draft: 41 of 360, 11 %). Above **25 %** (`THREAT_TIME_LIMIT_BOUND`) the index is compressed toward the attrition judgement and no longer measures what §1.2 says: the default run exits with code 1 after writing, `--check` fails, and the reference must be re-based.

## 2. Ten new alternate timelines

Common to all ten: `category: 'au'`; the `description` begins with `ALTERNATE UNIVERSE.`; every text is original writing in the spirit of Mass Effect and quotes or closely paraphrases nothing from the games or the codex; the history is canon up to the divergence point and changes only what follows from it, and a divergence may change what the organics know or do but never what the Reapers are (learning of a weakness does not create one); no new faction, hull, weapon or engine knob is needed; none uses Project Titan, HADES penetrators or the Valkyrie, which stay the Apex presets’ signature; every value lies inside the schema ranges, passes `validateRuleSet` with no warning and comes back from `normaliseRules` unchanged (tested, §4.11). In `ALTERNATE_PRESETS`, and so in every timeline list, they are ordered by declared tier and then by divergence year. The literals live in `src/timelines/alternates.ts`; the descriptions and history lines below are copied from it.

### 2.0 The suggested ideas, judged

| Suggestion | Decision | Why |
| --- | --- | --- |
| Sovereign’s Triumph | **Kept**, tier 1 | The strongest Reaper-favouring divergence in canon. Losing the Thanix is a lore consequence the engine expresses exactly (`thanixAvailability: 'none'`). No geth stand beside the organics in 2183 (`geth` 0). |
| The Collectors’ Harvest | **Kept, re-dated**, tier 3 (declared 2 until 5 November, §2.2) | Uses Mass Effect 2’s own failure condition and only what fits the weeks it leaves: nobody destroys the Alpha relay, so the Reapers come months early and together and find the fleets at peacetime stations; Rannoch stays at war and both its fleets stay out. |
| The Indoctrinated Council | **Kept, with a concrete divergence**, tier 2 | "Councillors are indoctrinated" needs a mechanism. The derelict Reaper at Mnemosyne indoctrinated the team studying it in canon; here the Council salvages it in 2185. Mechanically it is sabotage (accuracy, sensors, electronic warfare) plus fleets held back. |
| Turian Total War | **Kept**, tier 5 | One navy at total war. ×2.2 measured 64.0 at design time, two points above the tier-5 floor of the time (62), so it fields ×2.5. |
| Geth–Quarian Concord | **Kept, with its price**, tier 4 | Divergence at the Morning War. Recognising machine intelligences breaks Citadel law, so the quarians lose their embassy and fight in 2186 by treaty, at canon coordination. Only two contingents change, which honestly caps it at Serious. |
| Vigil’s Warning | **Kept, trimmed and made secret**, tier 3 (on the merged engine one tier below canon, by seed noise: §2.5) | Screening, guarded Keepers and an earlier secret Crucible search stay. "Reaper weak points" is dropped: the archive records how the Protheans lost, canon records no such weakness, and learning of one could not create it (no `reaperCommandVulnerability`). The Council believes the archive but buries it, which keeps it apart from Prepared Galaxy and gives "no extra warships" its cause. The earlier Crucible search is story only: the engine has no head-start knob, and the history line says so. |
| The Asari Disclosure | **Kept**, tier 4 | A galaxy-wide defensive uplift, distinct from Prepared Galaxy (more ships) and the Apex presets (Project Titan). |
| Leviathan’s Covenant | **Kept**, tier 5 | Shielding, revealed movements and active interference with Reaper fire control and coordination, plus Reaper anatomy (the first Reaper was made in the Leviathans’ image), which is what lifts it out of tier 3: the soft knobs alone are worth only a few points. |
| The 2184 Accords | **Replaced** | It duplicates Prepared Galaxy (joint exercises, coordination 0.85) and Prime/Apex (a surviving Shepard unites the galaxy). In canon Shepard is dead from late 2183 to 2185, so a 2184 testimony needs the surviving-Shepard divergence Prime/Apex already owns. |
| One of my own | **The Conduit Protocol** (tier 6) and **Leviathan’s Bargain** (tier 2) | The Conduit Protocol is a route to Existential that is neither Apex nor a new weapon: the Reapers built the relays, and the Conduit proves a relay can be built, and so keyed, by others. Locking the network divides the harvest (`fleetStrength.reaper` 0.4). Leviathan’s Bargain mirrors the Covenant at the same divergence point, shows how far one moment can swing the threat (tier 2 against tier 5), and is the set’s plainest "Reapers stronger" timeline; the Leviathans lend no technology, only their hold on organic minds. |

None of the ten duplicates a family of brief §14 (Early Beacon, First Contact Ascendant, One Humanity, Prothean Victory, Dark Lane, HFY: Terran Hegemony, player civilisation, Multiverse): none needs a new faction, hull or technology family.

Tiers 1–2 (enforced by a structural test, §4.11): Sovereign’s Triumph, The Indoctrinated Council and Leviathan’s Bargain change only knobs in the Reapers’ favour — organic fleets or technology down, Reaper fleets, technology or competence up, coordination down, indoctrination up — and none in the organics’ favour. So does The Collectors’ Harvest, declared tier 2 until the 5 November re-measurement put it in tier 3 (§2.2): the test no longer covers it, but none of its values changed.

The ten timelines follow. In each "Reference order of battle" row, DN is a dreadnought, CV a carrier, CA a cruiser, FF a frigate, HV a quarian heavy ship and SR2 the Normandy; the Reaper groups are the five rungs as the timeline deploys them. "Measured" rows come from the implementation’s run of `npm run timeline:threat` (§4.7) on the commit named in `TIMELINE_THREAT.md`. The sections keep the numbering every review note cites; since The Collectors’ Harvest moved to tier 3 on 5 November, the timeline lists show it after Vigil’s Warning.

### 2.1 Sovereign’s Triumph — `sovereigns_triumph` — tier 1 Negligible

| Field | Value |
| --- | --- |
| Tagline | The Citadel relay opened in 2183. The Reapers did not have to wait three more years. |
| Divergence | **2183** — Battle of the Citadel: Saren’s override of the Citadel holds and Sovereign opens the Citadel relay to dark space. |
| Intended tier | 1 Negligible |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **11.5** → tier 1 Negligible; Reaper losses 21 %, organic survival 2 %; holds none of the reference Reaper groups; per group (wins of 4) Raid 3/7: 19 (0/4) · Strike group 4/9: 14 (0/4) · Battlegroup 5/13: 13 (0/4) · Assault fleet 7/16: 7 (0/4) · Harvest fleet 8/18: 4 (0/4) |
| Reference order of battle | coalition 24 hulls — Alliance 2 DN, 1 CV, 2 CA, 2 FF; Hierarchy 1 DN, 2 CA, 2 FF; Republics 1 DN, 2 CA; Union 1 DN, 2 CA, 2 FF; Quarians 1 HV, 3 CA; Reaper groups (capitals/destroyers) 3/7, 4/9, 5/13, 7/16, 8/18 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect up to the assault on the Citadel (2183): Saren, Sovereign, the geth attack and the Council aboard the Destiny Ascension. The divergence is that Shepard never breaks the override. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. In 2183 Saren’s lock on the Citadel is never broken: the station’s arms stay sealed, the Council dies aboard the Destiny Ascension and Sovereign opens the Citadel relay for the fleet waiting in dark space. The Reapers enter the heart of Council space three years before canon, with no Sovereign wreck left behind to teach anyone the Thanix and no time to search Prothean ruins for a Crucible. Each species meets the harvest alone, and every battle faces more Reapers than the canon war ever did.

History changes (`historyChanges`):

1. 2183: Saren’s override of the Citadel holds; the arms stay sealed and Sovereign opens the Citadel relay to dark space.
2. The Council dies aboard the Destiny Ascension; the Citadel Fleet and the Alliance Fifth Fleet are destroyed in the Serpent Nebula, and Shepard falls in the Presidium.
3. No Reaper wreck is salvaged, so the Thanix cannon is never developed.
4. The harvest begins at the Citadel; nobody searches the Prothean archive on Mars, and there is no Crucible.
5. No geth fight beside the organics: the heretics serve the harvest and the rest stay behind the Perseus Veil.
6. Without a Council or a shared command, every species defends its own space alone.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `special.thanixAvailability` | `'none'` | The Thanix was reverse-engineered from Sovereign’s wreck, which does not exist here; every Thanix mount falls back to the conventional cruiser accelerator (the engine’s `none` rule). |
| `fleetStrength.alliance` | `0.8` | The Fifth Fleet is lost at the Citadel. |
| `fleetStrength.turian` | `0.6` | The Citadel Fleet was mostly turian, and Palaven is struck first. |
| `fleetStrength.asari` | `0.5` | The Destiny Ascension and the Republic guard die with the Council. |
| `fleetStrength.salarian` | `0.85` | The Union is caught before any build-up. No change to the reference’s small contingent; acts in the scenarios and the campaign. |
| `fleetStrength.geth` | `0` | Absent (§1.1): the heretic geth serve the harvest and the rest stay behind the Perseus Veil. |
| `fleetStrength.reaper` | `1.3` | The fleet arrives together through the Citadel relay at the centre of the galaxy instead of strung out from its edge. The tuning lever. |
| `strategic.alliedCoordination` | `0.1` | No Council and no joint command. |
| `strategic.reaperCompetence` | `1.1` | The harvest runs to its design for the first time in this cycle. |
| `strategic.indoctrinationEffectiveness` | `1.5` | Reapers inside Council space from the first day of the war. |
| `strategic.reaperReinforcements` | `1.5` | Campaign only: the whole fleet comes through the Citadel. |
| `strategic.crucibleAvailable` | `false` | Campaign only: no Crucible. |
| `strategic.shepardAlive` | `false` | Shepard dies in the Presidium and the Normandy SR-2 is never built: no Normandy in the reference or in Quick Battle (world-state lock). |
| `strategic.shepardEffectiveness` | `0` | Schema rule: a dead Shepard has effectiveness 0. |

Unchanged on purpose: Organic and Reaper technology (the 2183 navies field what they had), the quarian contingent, Harbinger and the Catalyst operational, Cerberus hostile under an indoctrinated Illusive Man.

Codex “established canon” line (`canonBasis`): In 2183 Saren reached the Citadel through the Conduit and locked its arms while Sovereign and a geth fleet attacked. Shepard broke the lock with data recovered on Ilos, and the combined fleets destroyed Sovereign after Saren died.

World state and campaign (§4.10):

- lock `ascension: 'absent'`: The Council and the Destiny Ascension were lost at the Citadel in 2183.
- lock `rannoch: 'war'`: No one makes peace between the quarians and the geth.
- lock `outcome: 'war'`: No one makes peace between the quarians and the geth.
- lock `normandy: 'no'`: Shepard died at the Citadel in 2183 and the Normandy SR-2 was never built.
- lock `genophage: 'sabotaged'`: With Shepard dead, no one ever cures the genophage, so the krogan stay on Tuchanka. This is the setting’s “cure sabotaged” state, in which the Salarian First Fleet still joins the war: the simulator has no separate state for a cure never made.
- campaign note: The campaign opens on the 2186 map: the fall of the Citadel in 2183 and the earlier start of the harvest are not modelled, so the Citadel and its fleets begin in allied hands.

Release tuning lever (§1.8): `fleetStrength.reaper` within `[1.25, 1.5]`, step the next count change, current 1.3. Reference counts change at 1.30, 1.33, 1.35, 1.36, 1.38, 1.40, 1.42, 1.45, 1.46, 1.47, 1.50 inside the range. Measured on `3c91a33`: index 11.7 (tier 1 Negligible) at 1.25 and 9.2 (tier 1 Negligible) at 1.5, against 11.5 at the current 1.3 (on `d8ee133`, formula 1: 8.2 and 6.5). Tier 1 is open below, so only the downward direction can be needed. `strategic.reaperCompetence`, tried first, measured 8.1 at both 1.0 and 1.3 in the first implementation.

### 2.2 The Collectors’ Harvest — `collectors_harvest` — tier 3 Moderate

| Field | Value |
| --- | --- |
| Tagline | The Normandy never came back through the Omega 4 relay. The human Reaper was never stopped, and the Reapers came early. |
| Divergence | **2185** — The assault on the Collector base fails beyond the Omega 4 relay. |
| Intended tier | 3 Moderate (2 Low until 5 November: its lever could not reach tier 2, §1.8 rule 3) |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **27.9** → tier 3 Moderate; Reaper losses 40 %, organic survival 16 %; holds the Raid (2 capitals, 6 destroyers in this timeline) and no larger reference group; per group (wins of 4) Raid 2/6: 86 (4/4) · Strike group 3/8: 23 (0/4) · Battlegroup 5/12: 13 (0/4) · Assault fleet 6/14: 10 (0/4) · Harvest fleet 7/16: 8 (0/4) |
| Reference order of battle | coalition 24 hulls — Alliance 2 DN, 1 CV, 2 CA, 2 FF; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/6, 3/8, 5/12, 6/14, 7/16 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect 2 up to the suicide mission (2185): the Collectors, the Omega 4 relay, the human Reaper, and the Alpha relay in the Bahak system that Shepard destroyed later that year. The failure of the mission is AU (in canon the base is stopped even when Shepard dies), and so is everything that follows from it inside the weeks before the Reapers arrive. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. In 2185 the Normandy is destroyed beyond the Omega 4 relay: Shepard and the crew are lost and the Collector base survives. The Collectors go on taking human colonies, and nothing stops the human Reaper. With no Shepard to reach the Bahak system, the indoctrinated team watching the Alpha relay is never stopped, the relay stands, and the Reapers pour through it into batarian space months ahead of canon and all at once. They find the Alliance at its peacetime stations, the quarians and the geth at war, and no one left to unite the Council races. Only the turian, asari and salarian navies meet them at full strength, each fighting for its own space.

History changes (`historyChanges`):

1. 2185: the Normandy SR-2 is destroyed at the Collector base; Shepard and the crew are killed, and the base survives.
2. The Collectors keep taking human colonies, and the human Reaper is completed when the harvest arrives (story only: one more Reaper does not change the battles).
3. Nobody stops the indoctrinated Project team in the Bahak system: the Alpha relay is never destroyed, and the Reapers come through it months ahead of canon, together.
4. The Alliance meets the invasion with its fleets at peacetime stations, without the months the loss of the Alpha relay bought in canon.
5. Rannoch stays at war and no one unites the Council races: neither the quarian nor the geth fleet joins the coalition.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `fleetStrength.alliance` | `0.8` | Caught at peacetime stations months early, without the delay the destruction of the Alpha relay bought in canon: only part of the Alliance concentrates before the first battles. |
| `fleetStrength.quarian` | `0` | Absent (§1.1): Rannoch stays at war, and the Migrant Fleet fights the geth, not the Reapers. |
| `fleetStrength.geth` | `0` | Absent (§1.1): the geth fight the quarians with Reaper upgrades. |
| `fleetStrength.reaper` | `1.15` | The whole harvest arrives at once through the intact Alpha relay instead of after the delay its destruction bought in canon. The unfinished human Reaper adds nothing here: it is story only. The tuning lever. |
| `strategic.alliedCoordination` | `0.25` | Nobody brings the species together. |
| `strategic.reaperCompetence` | `1.1` | The surviving Collector base gives the harvest everything the Collectors learned of human worlds and fleets. |
| `strategic.indoctrinationEffectiveness` | `1.3` | The Reapers’ agents work unexposed: no one stops the indoctrinated Project team at Bahak or uncovers the others. |
| `strategic.reaperReinforcements` | `1.3` | Campaign only: the earlier, unbroken arrival. |
| `strategic.shepardAlive` | `false` | No Normandy in the reference or in Quick Battle (world-state lock); no Shepard in the campaign. |
| `strategic.shepardEffectiveness` | `0` | Schema rule: a dead Shepard has effectiveness 0. |

Unchanged on purpose: Technology on both sides, the turian, asari and salarian fleets, the Crucible (the Alliance still finds the plans on Mars), Cerberus hostile.

Codex “established canon” line (`canonBasis`): In 2185 Shepard, rebuilt by Cerberus, took the Normandy SR-2 through the Omega 4 relay to the Collector base near the galactic core and destroyed the human Reaper the Collectors were building from abducted colonists. Later that year Shepard destroyed the Alpha relay in the Bahak system, delaying the Reaper arrival by months.

World state and campaign (§4.10):

- lock `rannoch: 'war'`: No one brokers peace at Rannoch.
- lock `outcome: 'war'`: No one brokers peace at Rannoch, and no one cuts the Reaper signal to the geth.
- lock `normandy: 'no'`: Shepard and the Normandy SR-2 were lost at the Collector base in 2185.
- lock `genophage: 'sabotaged'`: With Shepard dead, no one ever cures the genophage, so the krogan stay on Tuchanka. This is the setting’s “cure sabotaged” state, in which the Salarian First Fleet still joins the war: the simulator has no separate state for a cure never made.
- campaign note: The campaign opens at the canon 2186 start: the earlier arrival is expressed only through the smaller Alliance fleet, the larger Reaper groups and the Reaper reinforcement pool.

Release tuning lever (§1.8): `fleetStrength.reaper` within `[1.1, 1.2]`, step the next count change, current 1.15. Reference counts change at 1.11, 1.13, 1.15, 1.17, 1.18 inside the range. Measured on `3c91a33`: index 28.6 (tier 3 Moderate) at 1.1 and 26.8 (tier 3 Moderate) at 1.2, against 27.9 at the current 1.15 (on `d8ee133`, formula 1: 26.4 and 23.1). **Neither end reaches tier 2** (below 26) on the merged engine, so on 5 November rule 3 of §1.8 applied: the declared tier moved from 2 to 3, and the description gained one sentence saying what still stands against the harvest, the turian, asari and salarian navies at full strength, each fighting for its own space. No battle value changed. A timeline that holds the Raid in every seed and nothing above it is what tier 3’s split rule describes (§1.3). The range stops at 1.2: at 1.25 the Raid gains a third capital, which dropped the timeline a tier when the range was set. `strategic.reaperCompetence`, suggested in the first review, measured flat (13.2 at 1.0 and 13.3 at 1.2, before that review’s retune), and the Alliance count has a cliff at 0.75, where the second dreadnought goes.

### 2.3 The Indoctrinated Council — `indoctrinated_council` — tier 2 Low

| Field | Value |
| --- | --- |
| Tagline | A dead Reaper was towed home for study. By 2186 it had friends on the Council. |
| Divergence | **2185** — A Council salvage task force recovers the derelict Reaper at Mnemosyne instead of letting it fall into the brown dwarf. |
| Intended tier | 2 Low |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **23.4** → tier 2 Low; Reaper losses 35 %, organic survival 11 %; holds none of the reference Reaper groups; per group (wins of 4) Raid 2/5: 57 (2/4) · Strike group 3/7: 23 (0/4) · Battlegroup 4/10: 16 (0/4) · Assault fleet 5/12: 12 (0/4) · Harvest fleet 6/14: 10 (0/4) |
| Reference order of battle | coalition 30 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 1 DN, 2 CA, 2 FF; Republics 1 DN, 2 CA; Union 1 DN, 1 CA, 1 FF; Quarians 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
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
| `factionOverrides.turian` | `{ accuracy: 0.7, sensors: 0.8, crewQuality: 0.85 }` | Corrupted fire-control and sensor software; compromised officers. Its `accuracy` is the tuning lever. |
| `factionOverrides.asari` | `{ accuracy: 0.75, sensors: 0.8, electronicWarfare: 0.8 }` | Corrupted targeting and electronic-warfare suites. |
| `factionOverrides.salarian` | `{ accuracy: 0.75, sensors: 0.8, electronicWarfare: 0.7 }` | The STG’s own systems were compromised first. |
| `fleetStrength.turian` | `0.7` | Fleets held in reserve on plausible pretexts. |
| `fleetStrength.asari` | `0.7` | Fleets held in reserve. |
| `fleetStrength.salarian` | `0.6` | Fleets held in reserve; the Union, closest to the wreck, holds back most. |
| `strategic.alliedCoordination` | `0.2` | Orders are contradicted and nobody trusts the Council staffs. |
| `strategic.reaperCompetence` | `1.3` | The Reapers know every deployment. |
| `strategic.indoctrinationEffectiveness` | `2` | Schema maximum: the wreck’s influence runs through the command chain. |

Unchanged on purpose: The Alliance, the quarian and geth contingents, technology on the Reaper side, Shepard, the Crucible.

Codex “established canon” line (`canonBasis`): In 2185 Shepard’s team boarded a Reaper that had been dead for millions of years in orbit of the brown dwarf Mnemosyne and recovered its IFF. The Cerberus scientists studying the wreck had been indoctrinated by it, and the derelict was lost to the brown dwarf after the team escaped.

Release tuning lever (§1.8): `factionOverrides.turian.accuracy` within `[0.55, 0.85]`, step 0.05, current 0.7. Measured on `3c91a33`: index 21.1 (tier 2 Low) at 0.55 and 21.5 (tier 2 Low) at 0.85, against 23.4 at the current 0.7 (on `d8ee133`, formula 1: 22.4 and 26.6). **On the merged engine this lever is flat**: both ends measure within seed noise of the current value, and below it; on `d8ee133` it could raise the index but not lower it. The timeline sits on a plateau: under every value tried it loses every group above the Raid (on `3c91a33` those four give 23, 16, 12 and 10 at the current value; on `d8ee133` about 23, 17–19, 8–11 and 3–6), so only the Raid is in play. The four larger groups contribute about 12 points whatever the value, and the Raid at most 20, so these knobs keep the index between about 12 and 32. Each alternative, measured at two values with `npm run timeline:threat -- --file` on `2c71368` (battle code unchanged since `d8ee133`; 20 battles each), stayed within seed noise of the then current 22.3: turian accuracy over the review’s [0.75, 0.9] 26.1 and 24.9; asari accuracy 0.6 and 0.9, 23.5 and 25.1; salarian accuracy 0.6 and 0.9, 24.6 and 26.7; allied coordination 0 and 0.4, 24.5 and 22.7 (not even monotone); turian crew quality 0.7 and 1.0, 24.1 and 25.7; `strategic.reaperCompetence` 1.15 and 1.5, 23.3 and 23.0. A release that measures this timeline at or above the tier-3 floor (26 on today’s scale) cannot use rule 1 of §1.8 and goes to rule 3.

### 2.4 Leviathan’s Bargain — `leviathans_bargain` — tier 2 Low

| Field | Value |
| --- | --- |
| Tagline | The Reapers found Despoina first. To outlive the cycle, the Leviathans lent the harvest their hold on organic minds. |
| Divergence | **2186** — An indoctrinated member of Dr. Garret Bryson’s team passes his findings to the Reapers, who reach Despoina before Shepard; the surviving Leviathans bargain for their survival. |
| Intended tier | 2 Low |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **22.5** → tier 2 Low; Reaper losses 33 %, organic survival 13 %; holds none of the reference Reaper groups; per group (wins of 4) Raid 2/5: 66 (2/4) · Strike group 3/7: 19 (0/4) · Battlegroup 4/10: 10 (0/4) · Assault fleet 5/12: 10 (0/4) · Harvest fleet 6/14: 8 (0/4) |
| Reference order of battle | coalition 36 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Quarians 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect 3 up to the search for the Leviathans (2186): Dr. Garret Bryson’s research (and his daughter Ann’s), Despoina, the Leviathans’ thralls and their creation of the intelligence behind the Reapers. The leak of his findings and the Leviathans’ bargain are AU; in canon Shepard reaches them first. The Leviathans give the Reapers no technology: everything they lend acts through organic minds. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. In 2186 an indoctrinated member of Dr. Garret Bryson’s team passes his findings to the Reapers, and the Reapers reach Despoina before Shepard does. The last Leviathans, who made the intelligence that built the Reapers, buy their survival with service and turn the thralls they keep in every port and fleet against the war. Sensor officers and fire-control crews see only what the Leviathans let them see, and Reaper hulls slip out of firing solutions computed by people who are no longer entirely their own.

History changes (`historyChanges`):

1. 2186: an indoctrinated member of Dr. Garret Bryson’s team passes his findings to the Reapers, who reach Despoina before Shepard.
2. Spared in exchange for service, the surviving Leviathans turn their thralls in allied ports and fleets against the war effort.
3. Thralled sensor officers and fire-control crews see what the Leviathans let them see: Reaper hulls slip out of the firing solutions they compute.
4. Indoctrination and thrall control reinforce each other, and trust between allied commands collapses.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `organic.accuracy` | `0.9` | Thralled gunners in every navy. |
| `organic.crewQuality` | `0.8` | Thralled officers in every navy. |
| `reaper.sensors` | `1.4` | The Reapers see through the thralls’ eyes. |
| `reaper.electronicWarfare` | `1.85` | The engine’s stand-in for thralled sensor and fire-control crews: the Reaper capital’s ECM rating 0.35 → 0.65, about −23 % on organic hit chance against capitals. Nothing about the Reaper hulls changes; the people aiming at them do. The tuning lever. |
| `strategic.alliedCoordination` | `0.3` | No one knows whose orders are their own. |
| `strategic.reaperCompetence` | `1.4` | The harvest gains the Leviathans’ knowledge of organic minds. |
| `strategic.indoctrinationEffectiveness` | `2` | Thrall control amplifies indoctrination (schema maximum). |

Unchanged on purpose: Every fleet strength (the bargain changes how the fleets fight, not how many there are); Reaper hulls, weapons and durability; Shepard, the Crucible, Cerberus hostile.

Codex “established canon” line (`canonBasis`): In 2186 Dr. Garret Bryson’s research (and his daughter Ann’s) put Shepard on the trail of the Leviathans, the race that created the intelligence that created the Reapers, hidden for aeons on Despoina behind thralls who kept their secret. In canon Shepard found them first and persuaded them to join the war.

Release tuning lever (§1.8): `reaper.electronicWarfare` within `[1.5, 2]`, step 0.05, current 1.85. Measured on `3c91a33`: index 28.0 (tier 3 Moderate) at 1.5 and 16.4 (tier 1 Negligible) at 2, against 22.5 at the current 1.85 (on `d8ee133`, formula 1: 30.3 and 21.1).

### 2.5 Vigil’s Warning — `vigils_warning` — tier 3 Moderate

| Field | Value |
| --- | --- |
| Tagline | The Council read the Protheans’ own account in 2183, believed every word, and told no one. |
| Divergence | **2183** — After the Battle of the Citadel a Council recovery team brings Vigil’s archive out of Ilos, and the Council believes it in secret. |
| Intended tier | 3 Moderate |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **43.2** → tier 3 Moderate; Reaper losses 58 %, organic survival 29 %; holds the Raid (2 capitals, 5 destroyers in this timeline) and no larger reference group; per group (wins of 4) Raid 2/5: 92 (4/4) · Strike group 3/7: 61 (2/4) · Battlegroup 4/10: 32 (0/4) · Assault fleet 5/12: 16 (0/4) · Harvest fleet 6/14: 15 (0/4) |
| Reference order of battle | coalition 36 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Quarians 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon through Mass Effect up to the Battle of the Citadel (2183): Vigil, the Conduit, the Keepers and the Prothean account of how the Reapers took the Citadel and the relays. The recovery of the archive and the Council’s secret acceptance are AU. The Reapers are unchanged: the archive teaches how the Protheans lost, not a weakness. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. After the Battle of the Citadel a Council recovery team returns to Ilos and brings out what remains of Vigil’s archive. Council scientists authenticate it and the Council believes it: the Reapers open every war by seizing the Citadel and the relays, after indoctrinated agents have hollowed out the commands that should resist them. Fearing panic, the Council buries the archive. The navies quietly screen their officers for indoctrination, guard the Keepers and the Citadel’s controls, and plan for a war fought with the relays lost, but no budget can pass for warships nobody may be told about, and none are built.

History changes (`historyChanges`):

1. 2183: after the Battle of the Citadel, a Council recovery team returns to Ilos and recovers what remains of Vigil’s archive.
2. Council scientists authenticate the archive; the Council believes it and classifies it to prevent panic.
3. The navies quietly screen their officers for indoctrination, secure the Keepers and the Citadel’s controls, and drill for a war fought with the relays lost.
4. The Mars archive is searched in secret from 2184 (story only: the campaign’s Crucible clock is unchanged).
5. No budget can pass for ships nobody may be told about: no extra warships are built, and the archive holds no weapon.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `organic.crewQuality` | `1` (canon) | The tuning lever, at the floor of its range since 5 November (below). It stood at 1.04 for fleet staffs briefed under seal and drilling against the Prothean account; the screening and the quiet coordination below are what the crews still gain. |
| `strategic.alliedCoordination` | `0.55` | The few who know coordinate quietly across the navies. |
| `strategic.indoctrinationEffectiveness` | `0.4` | Quiet screening: the crew penalty from Reaper presence falls from 8 % to 3.2 %. |

Unchanged on purpose: Technology (crew quality included since 5 November: it is the lever, at its floor), every fleet strength on both sides, the Reapers themselves (no command vulnerability: canon records no such weakness), Shepard, the Crucible (available; its earlier, secret search is story only, the engine has no head-start knob).

Codex “established canon” line (`canonBasis`): In 2183 Shepard reached Ilos, where Vigil, a Prothean VI, explained how the Reapers had used the Citadel and the relays to cut off the Prothean empire’s leadership after indoctrinated agents had weakened it, and gave Shepard the data that broke Saren’s hold on the Citadel. With Vigil’s power failing, Shepard went straight on through the Conduit.

Release tuning lever (§1.8): `organic.crewQuality` within `[1, 1.08]`, step 0.02, current 1 (1.04 until 5 November). Measured on `3c91a33`: index 43.2 (tier 3 Moderate) at 1 and 45.1 (tier 4 Serious) at 1.08, against 43.2 at the current 1 (on `d8ee133`, formula 1: 39.2 and 42.8). The current value is the floor of the range since 5 November: on the re-based scale 1.04 measured 46.9 (tier 4), so rule 1 of §1.8 moved the lever one step at a time toward the band, 1.02 measuring 45.5 (still tier 4) and 1.00 43.2 (tier 3), reproduced to the last digit by a second run. The lever does not move the index in one direction on this engine (43.2, 45.5, 46.9 and 45.1 at 1.00, 1.02, 1.04 and 1.08): every value lies within seed noise of the tier-4 floor, and from the floor it can only raise the index, so a release that measures this timeline at or above that floor goes to rule 3 (declared tier 4; the story already describes canon with a little more warning). **Vigil’s Warning measures below canon** (43.2 against 46.2) although its galaxy is canon’s with slightly better coordination and screening: on this engine both sit at the tier-3/4 boundary, where one seed decides whether the Strike group is held (Vigil’s Warning holds it in 2 of 4 seeds, canon in 3), so its label is one tier below canon’s. That is what the measurement says, and each badge prints its index beside the tier, so the two readings show how close they are. `strategic.alliedCoordination`, the first draft’s lever, acts only through crew quality (×(0.9 + 0.2 × coordination)) and measured inside seed noise in review.

### 2.6 The Geth–Quarian Concord — `geth_quarian_concord` — tier 4 Serious

| Field | Value |
| --- | --- |
| Tagline | The quarians recognised the geth instead of shutting them down, and paid for it with their embassy. Rannoch builds warships for both. |
| Divergence | **c. 1895** — The quarian government recognises the geth instead of ordering their shutdown; the Morning War never happens. |
| Intended tier | 4 Serious |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **60.4** → tier 4 Serious; Reaper losses 74 %, organic survival 47 %; holds every reference Reaper group up to the Strike group (3 capitals, 7 destroyers in this timeline) and none above it; per group (wins of 4) Raid 2/5: 95 (4/4) · Strike group 3/7: 90 (4/4) · Battlegroup 4/10: 64 (2/4) · Assault fleet 5/12: 31 (0/4) · Harvest fleet 6/14: 22 (0/4) |
| Reference order of battle | coalition 47 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Rannoch Navy 2 HV, 6 CA; Geth 2 DN, 5 CA, 5 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
| Provenance | `AU_MODIFIED`. Canon up to the geth’s first signs of self-awareness, about three hundred years before Mass Effect (c. 1895), and the Council’s laws against artificial intelligence. Everything after the divergence is AU, including a 2183 in which Saren has no geth army; Shepard, the Normandy and a hostile Cerberus are kept as stand-ins. |

Description (the preset’s `description`, shown in the timelines screen and the codex):

> ALTERNATE UNIVERSE. About three centuries before 2183 the quarians answer their creations’ first questions about themselves with recognition instead of a shutdown order. There is no Morning War and no exile. Recognising machine intelligences as people breaks Citadel law, and the quarians choose their children over their embassy: the Council expels them, and Rannoch lives under Citadel sanctions for three hundred years. When the Reapers come in 2186 the Concord joins the war by treaty, not as a Council member, with a homeworld navy whose quarian crews fly beside geth intelligences and a geth fleet that never split and never fought a war at Rannoch.

History changes (`historyChanges`):

1. c. 1895: the quarian government recognises the geth as people; the order to shut them down is never given.
2. No Morning War and no exile, but recognising artificial intelligences breaks Citadel law: the Council takes the quarian embassy and sanctions Rannoch for three centuries.
3. The geth never divide and never fight their creators: there are no heretics for Sovereign, and no war at Rannoch in 2186 bleeds either fleet.
4. Yards shared by quarians and geth build warships that fly with geth intelligences aboard, with better barriers, electronic warfare and crews than any refugee fleet could field.
5. In 2186 the Concord joins the war against the Reapers by treaty, not as a member of the Council.
6. Everything between 1895 and 2186 is alternate history; Shepard, the Normandy SR-2 and a hostile Cerberus are kept as stand-ins for this galaxy’s own.

Mechanics — existing engine knobs only; every key not listed keeps its canon value (`CANON_TECH`, `CANON_SPECIAL`, `CANON_FLEETS`, `CANON_STRATEGIC`):

| Knob | Value | Reason |
| --- | --- | --- |
| `factionOverrides.quarian` | `{ crewQuality: 1.2, electronicWarfare: 1.4, accuracy: 1.1, kineticBarrierStrength: 1.2, barrierRegen: 1.3 }` | Geth intelligences as co-pilots and fire controllers; geth-tuned barrier emitters. |
| `factionOverrides.geth` | `{ crewQuality: 1.2, barrierRegen: 1.3, sensors: 1.2, electronicWarfare: 1.3 }` | Quarian engineering on geth hulls, with no need for Reaper code. Its `electronicWarfare` is the tuning lever. |
| `fleetStrength.quarian` | `1.9` | A homeworld navy built in Rannoch’s own yards instead of a flotilla of converted civilian hulls; Migrant Fleet hull classes stand in for Rannoch-built designs. |
| `fleetStrength.geth` | `2.4` | What differs from canon: no heretic secession, no war at Rannoch in 2186 bleeding both fleets, and yards shared with the quarians. |

Unchanged on purpose: Every other navy, all Reaper values, allied coordination at the canon 0.5 (a treaty ally under Citadel sanctions, not a Council member), Shepard, the Crucible, Cerberus hostile.

Codex “established canon” line (`canonBasis`): About three hundred years before 2183 the quarians’ geth servants began to show signs of self-awareness. The quarians tried to shut them down, lost the Morning War and fled Rannoch in the Migrant Fleet; the Council closed the quarian embassy for creating the geth, and by 2183 a heretic faction of geth served Sovereign.

World state and campaign (§4.10):

- lock `rannoch: 'peace'`: There was no Morning War: the quarians and the geth fight the Reapers together as the Concord.
- lock `outcome: 'peace'`: There was no Morning War: the quarians and the geth fight the Reapers together as the Concord.
- campaign note: In the campaign the Concord’s two fleets keep the Migrant Fleet and Geth Consensus Fleet names and hull lists, liveships included, as stand-ins for the Rannoch Navy and the geth fleet.

Release tuning lever (§1.8): `factionOverrides.geth.electronicWarfare` within `[1, 1.6]`, step 0.05, current 1.3. Measured on `3c91a33`: index 61.6 (tier 4 Serious) at 1 and 60.0 (tier 4 Serious) at 1.6, against 60.4 at the current 1.3 (on `d8ee133`, formula 1: 53.5 and 57.7). **On the merged engine the lever is flat**: 1.6 points over its whole range, both ends and the current value in tier 4, and all three below 62, the formula-1 tier-5 floor the 5 November review asked about, as well as below today’s 64. It cannot pull the Concord back if a later engine lifts it into tier 5: such a release goes to rule 3 of §1.8 (declared tier 5, with a story change). The engine moved this timeline more than its lever can: 55.7 on `d8ee133`, 63.8 on the review’s merge with `8ff0b11`, 63.0 on this branch’s merge with CORE T11 (`4e3cb71`) and 60.4 with CORE T12’s Reaper AI (`219f082`). `fleetStrength.geth`, the first draft’s lever, measured 55.4 at 2.0 and 67.3 at 2.6 at design time: the third geth dreadnought appears at 2.5 and lifts the timeline a tier in one count step.

### 2.7 The Asari Disclosure — `asari_disclosure` — tier 4 Serious

| Field | Value |
| --- | --- |
| Tagline | In 2183 the Republics opened the Temple of Athame. Their head start became everyone’s. |
| Divergence | **2183** — After Sovereign’s attack the asari councillor and the matriarchs disclose the Prothean beacon in the Temple of Athame. |
| Intended tier | 4 Serious |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **52.0** → tier 4 Serious; Reaper losses 69 %, organic survival 35 %; holds every reference Reaper group up to the Strike group (3 capitals, 7 destroyers in this timeline) and none above it; per group (wins of 4) Raid 2/5: 94 (4/4) · Strike group 3/7: 79 (3/4) · Battlegroup 4/10: 39 (0/4) · Assault fleet 5/12: 28 (0/4) · Harvest fleet 6/14: 20 (0/4) |
| Reference order of battle | coalition 37 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 4 CA; Union 1 DN, 2 CA, 2 FF; Quarians 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
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
| `organic.massAcceleratorDamage` | `1.15` | More efficient element zero cores drive heavier rounds for the same heat. The tuning lever. |
| `organic.kineticBarrierStrength` | `1.35` | Asari barrier projection for every navy. |
| `organic.barrierRegen` | `1.3` | Faster barrier cycling from the same research. |
| `organic.armourStrength` | `1.1` | Prothean-pattern plating. |
| `organic.hullIntegrity` | `1.05` | Prothean-pattern plating. |
| `organic.sensors` | `1.25` | Asari sensor suites. |
| `factionOverrides.asari` | `{ kineticBarrierStrength: 1.15, crewQuality: 1.1 }` | The Republics already had most of it, so their barriers gain less; their crews have trained with it for centuries. |
| `fleetStrength.asari` | `1.25` | The Republics build openly. |
| `strategic.alliedCoordination` | `0.65` | The disclosure buys trust. |

Unchanged on purpose: All Reaper values, every other fleet strength, Shepard, the Crucible.

Codex “established canon” line (`canonBasis`): The asari kept a Prothean beacon hidden in the Temple of Athame on Thessia for thousands of years, and it fed their technological lead; the secret came out only in 2186, when the Reapers attacked Thessia.

Release tuning lever (§1.8): `organic.massAcceleratorDamage` within `[1.1, 1.2]`, step 0.05, current 1.15. Measured on `3c91a33`: index 52.1 (tier 4 Serious) at 1.1 and 62.0 (tier 4 Serious) at 1.2, against 52.0 at the current 1.15 (on `d8ee133`, formula 1: 50.8 and 59.0). On the merged engine the lever can only raise the index: its floor measures within 0.1 of the current value, so a release that finds this timeline above its band goes to rule 3.

### 2.8 Turian Total War — `turian_total_war` — tier 5 Severe

| Field | Value |
| --- | --- |
| Tagline | After Sovereign, the Hierarchy did what turians do: every citizen served and every yard built warships. |
| Divergence | **2183** — After the Battle of the Citadel the Primarch places the Hierarchy on a total-war footing. |
| Intended tier | 5 Severe |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **72.0** → tier 5 Severe; Reaper losses 86 %, organic survival 58 %; holds every reference Reaper group up to the Battlegroup (4 capitals, 10 destroyers in this timeline) and none above it; per group (wins of 4) Raid 2/5: 96 (4/4) · Strike group 3/7: 92 (4/4) · Battlegroup 4/10: 78 (4/4) · Assault fleet 5/12: 61 (2/4) · Harvest fleet 6/14: 33 (0/4) |
| Reference order of battle | coalition 49 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 5 DN, 8 CA, 8 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Quarians 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
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
| `factionOverrides.turian` | `{ crewQuality: 1.1, accuracy: 1.05 }` | Three years of war drill. |
| `fleetStrength.turian` | `2.5` | Total mobilisation. The tuning lever. |

Unchanged on purpose: Every other value is canon.

Codex “established canon” line (`canonBasis`): Turians serve in the military from the age of fifteen, the Hierarchy fields the largest navy in Citadel space and the volus are its client race. The Citadel Fleet took heavy losses against Sovereign in 2183, but the Hierarchy did not mobilise against the Reapers before they struck Palaven in 2186.

Release tuning lever (§1.8): `fleetStrength.turian` within `[2.2, 2.8]`, step the next count change, current 2.5. Reference counts change at 2.25, 2.50, 2.75 inside the range. Measured on `3c91a33`: index 65.9 (tier 5 Severe) at 2.2 and 82.1 (tier 5 Severe) at 2.8, against 72.0 at the current 2.5 (on `d8ee133`, formula 1: 64.4 and 76.7).

### 2.9 Leviathan’s Covenant — `leviathans_covenant` — tier 5 Severe

| Field | Value |
| --- | --- |
| Tagline | At Despoina the Leviathans stopped hiding. The makers of the Reapers’ maker went to war. |
| Divergence | **2186** — At Despoina the Leviathans join the war openly instead of as a hidden asset. |
| Intended tier | 5 Severe |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **74.3** → tier 5 Severe; Reaper losses 88 %, organic survival 61 %; holds every reference Reaper group up to the Battlegroup (4 capitals, 10 destroyers in this timeline) and none above it; per group (wins of 4) Raid 2/5: 99 (4/4) · Strike group 3/7: 93 (4/4) · Battlegroup 4/10: 77 (3/4) · Assault fleet 5/12: 60 (1/4) · Harvest fleet 6/14: 43 (1/4) |
| Reference order of battle | coalition 36 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Quarians 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 2/5, 3/7, 4/10, 5/12, 6/14 |
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
| `special.reaperCommandVulnerability` | `true` | Active Leviathan interference, not knowledge of a weakness: when a Reaper capital dies near them, the Leviathans press on the gap and the other Reapers’ coordination falters for a time (engine: each capital kill adds 0.6 to every Reaper fleet’s coordination penalty, decaying over 30 s). |
| `special.indoctrinationDisabled` | `true` | Leviathan shielding of allied minds. |
| `organic.massAcceleratorPenetration` | `1.3` | The Leviathans know Reaper anatomy: the first Reaper was made in their image. |
| `organic.sensors` | `1.3` | Thrall reports of Reaper movements. |
| `organic.accuracy` | `1.15` | Leviathan knowledge of Reaper construction guides allied targeting. |
| `reaper.electronicWarfare` | `0.6` | Leviathan interference unsettles Reaper masking. |
| `reaper.accuracy` | `0.75` | Leviathan interference unsettles Reaper fire control. The tuning lever. |
| `strategic.alliedCoordination` | `0.7` | Thralls relay orders between allied fleets. |
| `strategic.reaperCompetence` | `0.6` | Disrupted Reaper coordination. |
| `strategic.indoctrinationEffectiveness` | `0` | Leviathan shielding of allied minds (with `indoctrinationDisabled`). |

Unchanged on purpose: Every fleet strength, Reaper durability and firepower, Shepard, the Crucible.

Codex “established canon” line (`canonBasis`): In 2186 Shepard followed Dr. Garret Bryson’s research (and his daughter Ann’s) to Despoina, where the Leviathans, who created the intelligence that created the Reapers, had hidden for aeons behind their thralls; the first Reaper had been made in their image. Shepard persuaded them to join the war.

Release tuning lever (§1.8): `reaper.accuracy` within `[0.7, 0.8]`, step 0.05, current 0.75. Measured on `3c91a33`: index 74.9 (tier 5 Severe) at 0.7 and 70.2 (tier 5 Severe) at 0.8, against 74.3 at the current 0.75 (on `d8ee133`, formula 1: 73.7 and 68.1).

### 2.10 The Conduit Protocol — `conduit_protocol` — tier 6 Existential

| Field | Value |
| --- | --- |
| Tagline | The Protheans built one relay of their own. By 2186 the galaxy could lock the rest against their builders. |
| Divergence | **2183** — A joint Alliance–STG team begins studying the Prothean Conduit on Ilos. |
| Intended tier | 6 Existential |
| Measured (`TIMELINE_THREAT.md`, on `3c91a33`) | index **95.1** → tier 6 Existential; Reaper losses 98 %, organic survival 92 %; holds all 5 reference Reaper groups, up to the Harvest fleet (2 capitals, 6 destroyers in this timeline); per group (wins of 4) Raid 1/2: 99 (4/4) · Strike group 1/3: 99 (4/4) · Battlegroup 2/4: 94 (4/4) · Assault fleet 2/5: 91 (4/4) · Harvest fleet 2/6: 93 (4/4) |
| Reference order of battle | coalition 36 hulls — Alliance 2 DN, 1 CV, 3 CA, 3 FF, 1 SR2; Hierarchy 2 DN, 3 CA, 3 FF; Republics 1 DN, 3 CA; Union 1 DN, 2 CA, 2 FF; Quarians 1 HV, 3 CA; Geth 1 DN, 2 CA, 2 FF; Reaper groups (capitals/destroyers) 1/2, 1/3, 2/4, 2/5, 2/6 |
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
| `fleetStrength.reaper` | `0.4` | Each battle meets the part of the harvest that has crossed by ordinary FTL. The tuning lever. |
| `strategic.alliedCoordination` | `0.7` | Fleets and orders still move through the network. |
| `strategic.reaperReinforcements` | `0.3` | Campaign only: reinforcements trickle in. |
| `strategic.conventionalVictoryPossible` | `true` | Campaign flag: the harvest can be beaten without the Crucible. |

Unchanged on purpose: All technology on both sides (the protocol changes where the Reapers are, not what they are), every organic fleet strength, Shepard, the Crucible.

Codex “established canon” line (`canonBasis`): The Conduit on Ilos was a small mass relay built by Prothean scientists, and Saren and Shepard used it in 2183 to reach the Citadel. The Reapers built the mass relay network, and the Citadel itself is a relay to dark space.

World state and campaign (§4.10):

- campaign note: The campaign still moves Reaper fleets along the relay lanes: the locks are expressed only through the smaller Reaper fleets and the reduced reinforcement pool.

Release tuning lever (§1.8): `fleetStrength.reaper` within `[0.35, 0.41]`, step the next count change, current 0.4. Reference counts change at 0.36, 0.38, 0.40 inside the range. Measured on `3c91a33`: index 96.2 (tier 6 Existential) at 0.35 and 95.1 (tier 6 Existential) at 0.41, against 95.1 at the current 0.4 (on `d8ee133`, formula 1: 95.0 and 94.4). Tier 6 is open above, so only the upward direction can be needed. The range stops at 0.41: from 0.42 the Harvest fleet rounds to three capitals (6 × 0.4167 = 2.5), and the first draft’s 0.45 measured 83.9, tier 5, in review.

## 3. The eight existing presets on the scale

Measured exactly like the new ones; **their numbers do not change**, and their label is the measurement. Figures from the run on `3c91a33` (the integration engine with CORE T1–T12); each reading ends with the first implementation’s index (formula 1, `d8ee133`, thresholds 17 / 30 / 48 / 62 / 87).

| Preset | Index | Tier | Reading |
| --- | ---: | --- | --- |
| Canon Mass Effect 3 | 46.2 | 4 Serious | Holds the Raid (2/5) every time and the Strike group (3/7) in 3 of 4 seeds, and loses every larger group while making the Reapers pay (Reaper losses 61 % over the five groups): the canon war, in which Reapers die but the harvest wins. Canon is the probe ladder’s ×1 point and the weakest probe that holds two groups (§1.3), 1.2 points above the tier-4 floor. Formula 1: 35.4, tier 3, holding only the Raid. |
| Prepared Galaxy | 75.9 | 5 Severe | Thirty to fifty per cent more ships, fleet-wide Thanix and modest crew and rate-of-fire gains hold every group up to the Battlegroup (4/10) and win the Assault fleet in 2 of 4 seeds. "More of what they already had" is worth a great deal under square-law attrition, and the label says so. Formula 1: 73.0. |
| Humanity Ascendant | 81.2 | 5 Severe | Only the Alliance changes, but ×2.2 with heavier guns and barriers. It holds every group up to the Assault fleet (5/12, in 3 of 4 seeds) and wins the Harvest fleet once, and stays in tier 5 because those two cost it dearly (organic survival 62 % and 21 % there); 2.8 points under the tier-6 floor. Formula 1: 81.8, holding all five. |
| Cerberus Reformed | 49.0 | 4 Serious | Cerberus beside the coalition (×2, better electronic warfare) adds a contingent and holds the Strike group in 3 of 4 seeds, as canon does, with a little more of every fight; 4.0 points above the tier-4 floor. Formula 1: 42.2, tier 3, the Strike group won in 2 of 4 seeds. |
| Reaper Escalation | 16.0 | 1 Negligible | Reaper groups 1.6 times larger (the Raid is 3 capitals and 8 destroyers) with better regeneration and crews: the coalition holds nothing and wins none of its twenty battles, the tier-2 rule, and the Reapers lose 28 % of their hull value; 3.0 points under the tier-2 floor. Formula 1: 11.1. |
| Prime/Apex — Apex core | 98.6 | 6 Existential | Wins every group with 98 % survival. Formula 1: 97.1. |
| Prime/Apex — Apex legacy (high power) | 98.6 | 6 Existential | Indistinguishable from Apex core here: the Legacy Nova is one gun in a 67-hull coalition. Formula 1: 97.3. |
| Cerberus Ascendant | 51.4 | 4 Serious | **The surprise.** Its premise, the Illusive Man commanding the Reaper fleet, is a strategic outcome the reference cannot express. What the battles see is a coalition with Cerberus beside it, indoctrination switched off and no Normandy (Shepard is dead), and it holds the Strike group in all four seeds. The label follows the measurement, and the badge’s "measured in conventional battle" says why. 6.4 points above the tier-4 floor. Formula 1: 44.1, tier 3. |

## 4. Implementation design

### 4.1 Files and ownership

New files (no other stage owns them): `src/timelines/alternates.ts`, `src/timelines/threat.ts`, `src/timelines/threatMeasured.ts` (generated), `src/scenarios/threatReference.ts`, `scripts/timeline-threat.ts`, `src/ui/threatBadge.ts`, `tests/alternateTimelines.test.ts`, `docs/apex/TIMELINE_THREAT.md` (generated).

Existing files, with the exact extent of the change:

| File | Owner | Change |
| --- | --- | --- |
| `src/timelines/presets.ts` | CORE | One import line and `...ALTERNATE_PRESETS` at the end of `PRESETS`. Nothing else, so CORE’s edits elsewhere in the file merge cleanly. |
| `tests/timelines.test.ts` | CORE | The one assertion `expect(PRESETS.map((p) => p.id)).toEqual([...eight ids])` gains `...ALTERNATE_PRESETS.map((p) => p.id)` at the end (and the import). |
| `package.json` | shared | `"timeline:threat": "node --import tsx/esm scripts/timeline-threat.ts"`. |
| `src/ui/screens/timelines.ts`, `briefing.ts`, `campaign.ts` (setup only), `src/style.css` | stages B/C later | Badge calls, the world-state locks with their AU notes, the threat block of the detail panel, CSS, and a layout class so the timelines screen stacks to one column on phones. The badge lives in its own module so these diffs stay small. |
| `src/codex/entries.ts`, `src/ui/screens/codex.ts` | stage D later | The Timelines category; additive. |
| `AU_RULES.md`, `README.md`, `CHANGELOG.md`, `LORE_REFERENCE.md` | docs | §4.12, including the known limitations of §4.10. |

Not touched: `src/scenarios/index.ts` (the reference engagement is not registered as a Quick Battle scenario, so CORE’s scenario work and the hard-coded lists in `tests/battle.test.ts` stay as they are), `src/campaign/**`, `src/simulation/**`, `src/data/**`, `src/timelines/rules.ts`, `src/timelines/schema.ts`, `e2e/**`.

### 4.2 `src/timelines/alternates.ts`

Holds the ten presets, their metadata, three small helpers for levers and world state, and the label helpers; imports only `./rules` and a type from `./threat`. It must not import `./presets` (that would be a cycle, since `presets.ts` imports it).

```ts
/** Prefix for every alternate-universe line shown outside the preset itself (codex, tooltips, world-state notes). */
export const auPrefix = (name: string): string => `ALTERNATE UNIVERSE (${name}): `;

export interface WorldStateLock { value: string; why: string }

export interface AlternateMeta {
  divergence: { year: number; approximate?: boolean; event: string };
  canonBasis: string;            // the codex "established canon" block, original wording
  provenance: 'AU_MODIFIED';
  declaredTier: ThreatTier;      // tests require the generated table to agree (§1.8)
  lever: { key: string; min: number; max: number; step: number | 'count' };   // §1.8
  worldState?: Record<string, WorldStateLock>;   // §4.10: keyed by world-state option id
  campaignNote?: string;         // what the campaign cannot express of the premise (§4.10)
}

export const ALTERNATE_PRESETS: RuleSet[];                 // declared-tier order, then divergence year
export const ALTERNATE_META: Record<string, AlternateMeta>;
export function getLever(rules: RuleSet, key: string): number;              // 'factionOverrides.turian.accuracy', …
export function withLever(rules: RuleSet, key: string, value: number): RuleSet;
export const CAMPAIGN_WORLD_STATE_CHOICES: Readonly<Record<string, readonly string[]>>;   // the setup screen's options
export const CAMPAIGN_WORLD_STATE_DEFAULTS: Readonly<Record<string, string>>;
export function lockWorldState(rules, ws, choices, applyHidden = true): { ws; locked; hidden };
// The labels away from a timeline's own card (§4.8; added after the 5 November review):
export const timelineTag: (r: Pick<RuleSet, 'category'>) => string;               // ' [AU]', ' [CUSTOM]' or '' for canon
export const timelineTagById: (id: string, timelines: readonly Pick<RuleSet, 'id' | 'category'>[]) => string;   // a record that keeps only the id
export const timelineTitle: (r: Pick<RuleSet, 'name' | 'category'>) => string;    // '<name> (ALTERNATE UNIVERSE)'
```

Every literal spreads the canon constants, so `validateRuleSet` returns it unchanged; the strings use typographic apostrophes like the existing presets. Each literal is frozen all the way down (`preset()`), as the canon preset is frozen; every consumer already works on copies (`getPreset`, `cloneRules`, `withLever`, the timelines editor), and a test checks both. The file is the authority for every text and value of §2 (Appendix C of the first draft is superseded by it).

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

- Constants: `THREAT_FORMULA_VERSION` (2), `THREAT_THRESHOLDS` (read from the generated `THREAT_SCALE`, §1.3), `THREAT_TIME_LIMIT_BOUND` (0.25), `THREAT_REBASE_DRIFT` (2), `THREAT_INDEX_TOLERANCE` (0.5), `THREAT_TIERS` (tier, label, band and the band statement of §1.3, rendered by `bandStatement`), `THREAT_RUNGS` (the five base groups with their names); for the probe ladder `THREAT_PROBE_KEYS`, `THREAT_PROBE_GRID`, `THREAT_PROBE_RATIO` (1.03), `THREAT_PROBE_GAP` (2), `THREAT_PROBE_MAX_ROUNDS`, `THREAT_PROBE_RANGE` and `THREAT_SPLIT_RULES`.
- Types: `RungGroup` (name, capitals, destroyers as deployed); `ThreatRun` (rung, seed, reaperLoss, organicSurvival, winner, duration, `timeLimit`); `RungMeasure` (a `RungGroup` plus index, the two terms, wins, battles and time-limit endings); `MeasuredThreat` (index, the two terms, `holdsRungs`, `holdsUpTo`, `timeLimitShare`, rungs); `ThreatRating` (plus tier, label, summary); `ThreatReferenceMeta`; `ThreatLeverMeasure`; `ThreatProbe` (m, the index and its two terms, groups held, wins, battles, time-limit endings); `ThreatScale` (formula version, `rebasedOn`, standoff, time limit, thresholds, probes); `ThreatSplit` and `DerivedThresholds`; `ThreatFingerprint`; `BandClaims`.
- Functions: `threatIndex(L, S)`; `tierForIndex(index, thresholds = THREAT_THRESHOLDS)` (the script rates a re-based run before it is committed); `bandClaims(min, max)` and `bandStatement(min, max)` (§1.3); `threatTiers(thresholds)`; `thresholdsFromProbes(probes)`, `nextProbeValues(probes)` and `rebaseReasons(committed, now)` (§1.3, §1.8); `probeOf(m, measured)`; `summariseThreat(runs, groups)`, which takes the **deployed** groups and rounds as the table stores (index one decimal, fractions three); `threatRating(rules)`, undefined for `category: 'custom'` and for any id the table does not cover; `threatHoldsText(m)` (§1.4); `threatRungLines(m)`; `threatTooltip(rating)`.

Tooltip wording (all numbers rounded to whole per cent):

- Rated: `Threat to the Reapers 3/6 — Moderate (index 35). Reaper losses 53 %, organic survival 18 %. Holds the Raid (2 capitals, 5 destroyers in this timeline) and no larger reference group. Measured in conventional battle: threat reference engagement, 5 Reaper group sizes × 4 seeds (abc1234). Simulation estimate.`
- Unrated: `Threat to the Reapers: unrated. Custom timelines are not measured; tiers are measured for the built-in timelines on the threat reference engagement.`

### 4.5 `src/timelines/threatMeasured.ts` (generated)

Written only by the script; reviewed like code; byte-identical when regenerated on the same commit (no timestamp, keys in `PRESETS` order, the ladder in m order, fixed decimals). It exports `THREAT_REFERENCE_META` (reference id, formula version, seeds, base rungs, `standoffKm`, `maxDuration`, `battles`, `timeLimitShare`, `measuredOn`), `REAPER_THREAT` (one `MeasuredThreat` per `PRESETS` id, in `PRESETS` order), `THREAT_LEVERS` (one `ThreatLeverMeasure` per new timeline), `THREAT_SCALE` (the thresholds and the probe ladder they were derived from at the last re-base, with its commit, formula version, standoff and time limit) and `THREAT_FINGERPRINT` (§1.8). `measuredOn` is `git rev-parse --short HEAD` at generation, with `+dirty` when `src/` differed from it (`unknown` without git; a `--only` run appends `(partial: …)`, which the release step replaces with a full run). The `import type` keeps the mutual reference with `threat.ts` type-only. The first commit carries a placeholder (`REAPER_THREAT = {}`) so that everything compiles before the first run.

### 4.6 `src/scenarios/threatReference.ts`

The engagement of §1.1 and the metrics of §1.2. Deterministic (it sits under the determinism lint); it imports `fleet` from `./index` and is not registered in `SCENARIOS`.

- `THREAT_LONGEST_RANGE` (the maximum `range` over `WEAPON_LIST`), `THREAT_STANDOFF` (1.07 × that, in 0.1 km steps), `THREAT_MAX_DURATION` (3.2 × the standoff ÷ the `reaper_capital` top speed, in whole seconds), `THREAT_SEEDS`.
- `THREAT_COALITION`: the seven contingents of §1.1 in their fixed order, each with `counts(rules)` and, for Cerberus, the alliance predicate; `contingentFields(c, rules)` adds the "fleetStrength > 0" rule.
- `threatRungGroups(rules)`: the five groups as the timeline deploys them, counted from the built Reaper fleet.
- `buildThreatReference(rules, rung, seed)`: the `BattleConfig` (fleet scaling on; no `ws`, no `mult`).
- `threatRunOf(sim, rung, seed)` and `runThreatReference(rules, rung, seed)` (synchronous, the script’s path; tests step with `runSimAsync` and call `threatRunOf`).
- `threatProbeRules(m)`: the probe of §1.3, built from `CANON_ME3` alone.
- `threatFingerprint(presets)`, `threatCatalogueFingerprint()` and `threatPresetFingerprint(rules)` (§1.8): a stable text form of the data (keys sorted, text fields dropped, `Sourced` values reduced to their value) hashed with cyrb53.

### 4.7 `scripts/timeline-threat.ts` and `package.json`

`"timeline:threat": "node --import tsx/esm scripts/timeline-threat.ts"`.

```
npm run timeline:threat                       # the probe ladder first (re-basing when §1.8 says so), then every preset and each new timeline's lever at both ends; writes the table and the report
npm run timeline:threat -- --check            # the release gate: ladder and every preset; fails on a due re-base, a changed tier or index, a stale fingerprint, a missed declared tier or too many time-limit endings; writes nothing
npm run timeline:threat -- --only a,b         # a subset (and its levers) on the committed scale, merged into the committed table (retuning, §1.8)
npm run timeline:threat -- --no-probes        # skip the ladder and keep the committed scale (local runs; --check always measures it)
npm run timeline:threat -- --no-levers        # skip the lever measurements (the committed ones are kept)
npm run timeline:threat -- --probes           # the probe ladder only: prints it, the thresholds it derives and whether a re-base is due
npm run timeline:threat -- --file sets.json   # measure rule sets from a JSON file (one RuleSet or an array); prints only
npm run timeline:threat -- --jobs 4           # worker processes; default min(4, os.availableParallelism())
```

0. The probe ladder (§1.3) on its grid, then refinement rounds until `nextProbeValues` returns nothing; `rebaseReasons` against the committed `THREAT_SCALE` decides whether this run re-bases (§1.8). Every later step rates with the run’s scale.
1. Every battle (timeline × rung × seed, and every probe) is a task. With `--jobs` > 1 the script starts that many workers (`process.execPath --import tsx/esm scripts/timeline-threat.ts --worker`), feeds each one task per stdin line and reads one `ThreatRun` per stdout line. Results are keyed by task and assembled in `PRESETS` order, so the output never depends on scheduling (the simulation keeps no module-level state).
2. `summariseThreat(runs, threatRungGroups(rules))` per timeline; the lever variants are `withLever(preset, key, min | max)`.
3. Write `src/timelines/threatMeasured.ts` (§4.5) and `docs/apex/TIMELINE_THREAT.md`: the formula, the reference (standoff, time limit, the time-limit share and its bound), the thresholds and `measuredOn`; the ratings sorted by index with the breaking-point sentence; the per-group table with the deployed groups; "declared and measured" for the new timelines with their distance to the nearest boundary; the levers measured at both ends; and the probe ladder with its splits, the counts of groups held it produced and what this run did about the scale. Wall times go to stdout only, never into a committed file. A full run records the current fingerprint; a `--only` run updates only the presets it measured and stamps itself partial.
4. Print a console line per timeline (index, tier, rung indices and wins, time-limit endings, CPU seconds).
5. Exit with code 1, after writing, if any new timeline’s declared tier differs from `tierForIndex(index)`, more than 25 % of the battles ended on the time limit, or the ladder is incomplete; with `--check`, exit 1 if a re-base is due, the fingerprint differs, any preset’s tier differs from the committed table or its index by more than 0.5, or on any of those conditions. The release step cannot miss them.

### 4.8 UI: the threat badge and the world-state locks

New module `src/ui/threatBadge.ts`: `threatBadge(rules, size)` (six pips, the label, `data-threat-tier`, an `aria-label` and the tooltip of §4.4; "Unrated" with dashed pips for custom timelines), `threatOptionSuffix(rules)` for `<option>` labels, `threatPanel(rules)` for the detail block, and `worldStateLockNote(rules, lock)`. The label text always accompanies the pips (never colour alone).

- **Timelines screen** (`renderTimelines`): every list card gets the compact badge on a second line under the name (the category tag stays at the right). The detail panel gets a "THREAT TO THE REAPERS" block under the tagline: the full badge, the band statement, "Reaper losses X %, organic survival Y % over 20 reference battles", the breaking-point sentence, and a five-row table (group as deployed in this timeline, index, wins of 4). In edit mode and for saved custom timelines the block says "Unrated" and that custom timelines are not measured. The two-column grid becomes a class that stacks to one column below 900 px.
- **Briefing** (`renderBriefing`): each `<option>` label gets `threatOptionSuffix(t)`; the full badge sits under the select with the tooltip (a `title` on an `<option>` is not shown reliably in every browser, so the badge carries it). World-state options the timeline locks are preselected, the contradicting choices disabled, and an AU line gives the reason; keys the scenario reads without exposing them (the Normandy and the Ascension in the Final Battle of Earth) are applied and listed in one AU note.
- **Campaign setup** (`renderCampaignSetup`): the same suffix and badge under the rule-set select; the locked world-state selects are disabled with the AU reason under each, and the timeline’s `campaignNote` appears AU-prefixed. The campaign starts from the user’s choices with the locks applied on top, so switching timeline never leaves a stale lock behind.
- **CSS** (`src/style.css`): `.threat`, `.threat .pips`, `.threat .pip(.on)`, `.threat.unrated`, `.btn .threat`, the detail block and the responsive `.timelines-layout`.
- **Labels away from the card** (added after the 5 November review, finding 4): `timelineTag` (`[AU]` / `[CUSTOM]`), `timelineTagById` (the same for a record that keeps only the rules id) and `timelineTitle` (“(ALTERNATE UNIVERSE)”) in `alternates.ts`, and `timelineOptionLabel` (name, tag and threat suffix) in `threatBadge.ts`, used by every picker (briefing, campaign setup, custom battle, comparison), the comparison table, the fleet database, the saves list, the results line, the campaign war clock and header, the battle history in Settings, the codex, fleet database and battle-HUD headers, the menu footer and the selection toast. Custom battle shows the briefing’s AU line under its picker.

An optional e2e line (owned by stage D): the timelines screen shows `[data-threat-tier]` on every card and `unrated` on a saved custom timeline.

### 4.9 Codex: the Timelines category

`src/codex/entries.ts`:

- `CodexEntry.category` gains `'Timelines'`; `CODEX_CATEGORIES` lists it after `'Reaper War'`.
- New optional field `alternate?: string[]`: always shown, in an alternate-universe block, whatever timeline is active; every line starts with `auPrefix(name)`.
- One entry per new timeline, generated from `ALTERNATE_PRESETS`, `ALTERNATE_META` and the rating so the text is never duplicated by hand: `canon: [meta.canonBasis]`; `alternate`: the divergence, the description, every history line, the world-state locks, the campaign note and the measured rating with its breaking point, each AU-prefixed.
- One entry `threat_scale`, "Threat to the Reapers (measured scale)", category Timelines, `canon: []`, with `estimate` lines generated from `THREAT_TIERS`, `THREAT_THRESHOLDS`, `THREAT_REFERENCE_META` and `REAPER_THREAT`: what is measured and why ("measured, not asserted"); the reference engagement (coalition, the five Reaper groups, four seeds, the standoff and the time limit); the formula; the six tiers with their thresholds and band statements; what the scale cannot see (§1.5); then one line per preset with its tier and index, where every AU preset’s line starts with `auPrefix(name)`.
- `src/ui/screens/codex.ts`: render `e.alternate` as an `entry-block au` with the badge "alternate universe" (independent of the active timeline), and tag such entries "AU" in the navigation.

### 4.10 Campaign and Quick Battle world state

No engine change. The new presets reach the campaign through `PRESETS` and use their fleet and strategic values exactly as every preset does (Sovereign’s Triumph has no Crucible, The Conduit Protocol has a reinforcement pool of 2 and flags conventional victory as possible, and so on).

The default world states contradicted three premises (review findings 6 and 10): the setup defaults to the Ascension saved and Rannoch at war, and Quick Battle spawns the Normandy by default. So each story carries the world state it implies in `AlternateMeta.worldState`, keyed by world-state option id:

| Timeline | Locks |
| --- | --- |
| Sovereign’s Triumph | `ascension: 'absent'` (the Council died aboard the Ascension in 2183), `rannoch: 'war'` and `outcome: 'war'` (no one makes peace), `normandy: 'no'` (Shepard dead since 2183), `genophage: 'sabotaged'` (no cure is ever made) |
| The Collectors’ Harvest | `rannoch: 'war'`, `outcome: 'war'`, `normandy: 'no'`, `genophage: 'sabotaged'` |
| The Geth–Quarian Concord | `rannoch: 'peace'`, `outcome: 'peace'` (no Morning War) |

Campaign setup and the Quick Battle briefing preselect and lock those values with an AU note (`lockWorldState`): a locked key the screen exposes is set only when its value is one of the offered choices (Battle of the Citadel’s `ascension` offers `save`/`sovereign`, so Sovereign’s Triumph does not touch it); in the briefing a key the scenario reads without exposing it is applied as well and listed in the note; the campaign applies only its own five keys. For the genophage the closest available state for "no cure is ever made" is `sabotaged`: the krogan stay on Tuchanka, but the Salarian First Fleet still joins the war, which the lock’s note states rather than hides. The campaign smoke test uses the locked world state.

What the campaign still cannot express is said once, AU-prefixed, in `campaignNote` (campaign setup and the codex): Sovereign’s Triumph opens on the 2186 map with the Citadel in allied hands (its 2183 fall is not modelled); The Collectors’ Harvest opens at the canon 2186 start; the Concord’s two fleets keep the Migrant Fleet and Geth Consensus Fleet names and hull lists; The Conduit Protocol’s Reaper fleets still move along the relay lanes. Known limitations, listed in `AU_RULES.md`: a faction at `fleetStrength` 0 keeps one hull per class in Quick Battle scenarios and the campaign (`scaleCount`), visible in the Final Battle of Earth, whose default combined fleet always includes a Migrant Fleet detachment and a geth fleet whatever the Rannoch world state (token geth under Sovereign’s Triumph, token quarians and geth under The Collectors’ Harvest; the campaign, with Rannoch locked at war, fields neither); comparison mode and custom battle ignore the locks; Cerberus Ascendant, an existing preset with Shepard dead, still spawns the Normandy by default in Quick Battle; and the Prime/Apex Sol Defence scenario fields the Normandy SR-2 unconditionally (it has no Normandy option), so it appears there even under the two new timelines in which Shepard is dead. Optional for the release: AI-run reference outcomes (seeds 5, 9, 21) recorded in `AU_RULES.md`, as the existing presets have.

### 4.11 Tests

`tests/alternateTimelines.test.ts` (no test pins a measured number):

| Block | Test | Checks |
| --- | --- | --- |
| data | presets are appended in order | `PRESETS.slice(0, 8)` ids are the existing list, `PRESETS.slice(8)` equals `ALTERNATE_PRESETS`; ids unique across `PRESETS` and match `/^[a-z][a-z0-9_]*$/`; none is `custom` or `canon_me3`. |
| data | schema round trip | for every new preset, `validateRuleSet(JSON.parse(exportRuleSet(p)))` is ok with **no warnings** and `toEqual(p)`. |
| data | normalisation | `normaliseRules(p)` `toEqual(p)`. |
| data | the AU label everywhere | `category === 'au'`; `description` starts with `ALTERNATE UNIVERSE.`; `timelineTag`, `timelineTitle` and `timelineTagById` mark every non-canon preset and a custom timeline and leave canon bare, and `timelineTagById` still marks a deleted custom or AU id; the codex has exactly one `timeline_<id>` entry per new preset in category Timelines, titled “<name> (AU)”, and every `alternate` line starts with `auPrefix(p.name)`; the `threat_scale` entry exists and its AU preset lines carry the prefix; `forbiddenWording` is false for every text, and the light-speed and 3× phrasing checks that `tests/timelines.test.ts` applies to presets pass for every codex line too. |
| data | metadata | one `ALTERNATE_META` entry per new preset; divergence year between 1800 and 2186 (inside established history); `provenance === 'AU_MODIFIED'`; non-empty `canonBasis` and event; the lever names a numeric key of the preset, `min < max`, the current value lies inside `[min, max]`, the step is 0.05 or `'count'` (and `'count'` only for a `fleetStrength` key); `THREAT_LEVERS` holds both ends of exactly that range. |
| data | world state | every lock key is a campaign key or a world-state option of some scenario, and its value one of that option’s choices somewhere; every new preset with `shepardAlive` false locks `normandy: 'no'`; `lockWorldState` sets exposed keys only to offered values, applies hidden keys only when asked, and leaves other timelines untouched; every `campaignNote` and lock reason passes the wording checks. |
| data | span and direction | the declared tiers cover 1–6; for every preset declared 1 or 2, every battle-relevant knob that differs from canon favours the Reapers (organic tech or fleets below canon, Reaper tech, fleets or competence above, coordination below 0.5, indoctrination above 1) and none favours the organics (no organic tech or fleet above canon, no Reaper value below, no `reaperCommandVulnerability`, `indoctrinationDisabled`, `hyperMassAccelerators`, `hadesRounds` or fleet-wide Thanix); no new preset below tier 6 except the Covenant sets `reaperCommandVulnerability`. |
| scale | arithmetic | five whole-number `THREAT_THRESHOLDS`, strictly increasing, matching `THREAT_TIERS`; `tierForIndex` either side of every threshold and with an explicit threshold set; `threatIndex(0, 0) === 0`, `threatIndex(1, 1) === 100`; every bound of every band statement checked against every (L, S) its band admits on a 0.005 grid, for the committed and the formula-1 thresholds, and stated in the sentence; `summariseThreat` on synthetic runs (equal weights, rounding, `holdsRungs` stops at the first rung won fewer than 3 of 4, `holdsUpTo` is the deployed capital count, time-limit share); `threatHoldsText` for none, one, several and all rungs. |
| scale | probe ladder | `threatProbeRules(m)` is canon with exactly the three probe knobs × m; `thresholdsFromProbes` takes the rounded midpoint of the highest index below and the lowest at or above each rule, counts an out-of-order probe on its own side, and returns no thresholds when a rule has one side only or they do not increase; `nextProbeValues` starts from the grid, bisects open brackets, stops at the ratio or the index gap, ignores the gap where a count is skipped, extends past an unspanned end, and is deterministic; `rebaseReasons` fires on each of its four triggers and not on a drift of 2 points. |
| scale | table coverage | the keys of `REAPER_THREAT` equal the `PRESETS` ids; every value is finite and in range (index 0–100, fractions 0–1, five rungs, `battles === 4`), every rung’s deployed group equals `threatRungGroups(preset)`; `THREAT_REFERENCE_META` has 4 seeds, 5 rungs, the current standoff and time limit, and a time-limit share within the bound. |
| scale | declared = measured | for every new preset, `tierForIndex(REAPER_THREAT[id].index) === ALTERNATE_META[id].declaredTier`. |
| scale | recorded scale | `THREAT_THRESHOLDS` are the thresholds `thresholdsFromProbes(THREAT_SCALE.probes)` derives; the recorded formula version, standoff and time limit are the current ones; the ladder contains the grid, is sorted, has twenty battles per probe and is complete (`nextProbeValues` returns nothing). |
| scale | fingerprint | `threatFingerprint(PRESETS)` equals `THREAT_FINGERPRINT`, catalogue and every preset; the message names what changed and how to regenerate. |
| scale | unrated | `threatRating(makeCustom())`, a `custom_…` id and an unknown id are all undefined; the unrated tooltip says so. |
| reference | composition | builds for every preset and rung; the standoff is 1.07 × the longest catalogue range and the time limit 3.2 × the crossing time; fleet scaling acts (Sovereign’s Triumph meets 3 capitals on the raid, The Conduit Protocol 1); a contingent appears only when its faction’s `fleetStrength` > 0 (no geth in Sovereign’s Triumph, no quarians or geth in The Collectors’ Harvest); a Cerberus fleet only when `cerberusStance` is cooperative or `controls_reapers`; the Normandy only when Shepard lives; no Harbinger. |
| reference | runtime ordering (async, timeout 120 s) | the lowest-declared and highest-declared new presets (taken from `ALTERNATE_META`, not hard-coded) and canon, on the Battlegroup rung (`rung` 2) with seeds 1 and 2, each battle stepped with `runSimAsync` then `threatRunOf`: index(lowest) < index(canon) < index(highest). |
| in play | scenarios | every scenario in `SCENARIOS` except `custom` builds under every new preset with the locked world state and steps 40 ticks (as `tests/battle.test.ts` does for the existing eight); with the locks, no scenario fields the Normandy under a timeline in which Shepard is dead. |
| in play | campaign | `createCampaign` under every new preset with the setup screen’s defaults and the timeline’s locks applied (`lockWorldState(…, CAMPAIGN_WORLD_STATE_CHOICES, false)`), then a few `advanceTick` turns without error; the Concord fields both Rannoch fleets, Sovereign’s Triumph has no Destiny Ascension. |

`tests/timelines.test.ts`: the `PRESETS` order assertion as in §4.1. Its other checks (unique ids, history lines for every AU preset, the light-speed and 3× wording sweep over `PRESETS`) now cover the new presets automatically.

### 4.12 Documentation

- `AU_RULES.md`: the ten new rows in the Presets table; a "Threat to the Reapers" section (reference, formula, thresholds, what it cannot see, the re-basing rule, link to `TIMELINE_THREAT.md`); the world-state locks and the known limitations of §4.10.
- `README.md`: the timeline list and one paragraph on the scale.
- `CHANGELOG.md`: an Unreleased entry (ten timelines; the measured scale; badges; the world-state locks; the codex category; the new script).
- `LORE_REFERENCE.md`: "Canon anchors used by the alternate timelines": Sovereign’s wreck and the Thanix; the Collectors, the Omega 4 relay and the human Reaper; the derelict Reaper at Mnemosyne; the Alpha relay at Bahak; Ilos, Vigil, the Keepers and the Conduit; the beacon in the Temple of Athame; the Morning War and the Council’s AI laws; turian service from the age of fifteen and the volus; Despoina, the Leviathans, their thralls, Dr. Garret Bryson and his daughter Ann, the Leviathans’ creation of the intelligence behind the Reapers and the first Reaper made in their image. Each divergence is AU.
- `docs/apex/TIMELINE_THREAT.md`: generated by the script.

### 4.13 Order of work, commits and gates

Each step is committed as soon as it is complete (`stage(T): …`, attribution lines; no push):

1. This revision of the design (the review findings applied).
2. `alternates.ts`, the `presets.ts` import and spread, the `tests/timelines.test.ts` assertion → `npm run typecheck`, `npx vitest run tests/timelines.test.ts`.
3. `threat.ts`, the placeholder `threatMeasured.ts`, `threatReference.ts`, the script, `package.json`; then `npm run timeline:threat` → commit the generated table and report (retuning a new timeline first if it measures outside its tier).
4. `tests/alternateTimelines.test.ts` → `npx vitest run tests/alternateTimelines.test.ts`.
5. `threatBadge.ts`, the timelines, briefing and campaign-setup screens with the world-state locks, the CSS → `npm run build`.
6. The codex category.
7. Documentation, and this document’s measured figures.

Final gate in the worktree: `npm run typecheck && npx vitest run && npm run build`, `npx playwright test e2e/game.spec.ts` (one Playwright process, port 4173), and a visual check of the timelines screen and the briefing at 1920×1080 and 390 px.

**Commits on `stage/T-timelines`** (base `ba4decf`; not pushed):

| Commit | What | Step |
| --- | --- | --- |
| `569f01e` | the first draft of this design | — |
| `92ae848` | the eleven review findings applied | 1 |
| `85ab5d1` | `alternates.ts`, the `PRESETS` spread, `threat.ts`, the placeholder table, the `tests/timelines.test.ts` assertion | 2 |
| `d8ee133` | `threatReference.ts`, `scripts/timeline-threat.ts`, `package.json` | 3 |
| `6c3955b` | the generated table and `TIMELINE_THREAT.md`, measured on `d8ee133` | 3 |
| `d34d2b5` | `tests/alternateTimelines.test.ts` | 4 |
| `bceb31a` | the badge, the world-state locks, the CSS | 5 |
| `2c71368` | the Timelines codex category | 6 |
| `70f894c` | the ten presets frozen throughout; the band statements state exact bounds, checked on a grid | — |
| `383bd15` | `AU_RULES.md`, `README.md`, `CHANGELOG.md`, `LORE_REFERENCE.md`; §2.3’s lever stated as measured | 7 |
| `7917400` | the group table fits a phone; the Final Battle of Earth’s token fleets listed as a known limitation | 5, 7 |
| `8e99dbf` | this list, the verification record and the Sol Defence Normandy limitation | 7 |
| `4e3cb71` | merge of the integration head `118d99f` (CORE T9 to T11, release 0.12.0, `8ff0b11`) | review 2, finding 1 |
| `964f219` | the Leviathan research credited to Dr. Garret Bryson (and his daughter Ann) | review 2, finding 3 |
| `f65aec0` | the AU label wherever a timeline is named: pickers, headers, lists, codex titles | review 2, finding 4 |
| `b9a2d0c` | merge of the integration head (CORE T12, `219f082`) | review 2, finding 1 |
| `fcc3ae0` | the continuous probe ladder, the split rules, the mechanical re-base and `THREAT_FINGERPRINT` (code) | review 2, findings 1 and 2 |
| `d2fab02` | the re-based table measured on `fcc3ae0`; tests of the ladder, the re-base, the recorded scale and the fingerprint | review 2, findings 1 and 2 |
| `3c91a33` | §1.8 on the re-based scale: Vigil’s Warning’s lever to 1.0, The Collectors’ Harvest declared tier 3 | review 2, finding 1 |
| `3bead93` | the battle history in Settings labelled (`timelineTagById`) | review 2, finding 4 |
| `069bec1` | the table measured on `3c91a33` (full run) | review 2, finding 1 |
| `fd749df` | this revision for the second review: the review notes, every measured figure, `AU_RULES.md`, `CHANGELOG.md` | review 2 |
| the commit after `fd749df` | the release-gate result in the verification record; the CORE ranges of the first measurement corrected | review 2 |

**Verification (4 November).** A full `npm run timeline:threat` on `383bd15`, with only `src/style.css` uncommitted (so it stamped `383bd15+dirty`), reproduced `threatMeasured.ts` and `TIMELINE_THREAT.md` byte for byte, levers included, apart from the stamp, and exited 0. The committed table therefore keeps its clean `d8ee133` stamp: the battle code has not changed since. On `7917400`: `npm run typecheck`, `npx vitest run` (19 files, 196 tests) and `npm run build` pass; `npx playwright test e2e/game.spec.ts` (5 tests) and `e2e/campaign.spec.ts` (3 tests) pass against this build’s own preview on port 4173; the visual check at 1920×1080 and 390 px found no overflow, no scrolling table and no page error. The integration branch has since released 0.12.0 (CORE T1–T10, among them the movement rewrite and the first calibration pass), which changes battle trajectories: after the merge the table must be regenerated (§4.14), re-basing first if ranges, speeds or the time scale changed (§1.8). (Done on 5 November: below.)

**Verification (5 November).** The full `npm run timeline:threat` on `3c91a33` (clean `src/`) exited 0 and wrote the committed table (`069bec1`): its probe ladder reproduced the 26 probes recorded on `fcc3ae0` to the last digit, so the scale was kept; every preset but Vigil’s Warning reproduced `d2fab02`’s figures exactly; every new timeline measures in its declared tier; 59 of 360 battles (16.4 %) ended on the time limit. With `069bec1` and this revision’s documents: `npm run typecheck`, `npx vitest run` (29 files, 275 tests) and `npm run build` pass, and `npx playwright test e2e/game.spec.ts` (5 tests) and `e2e/campaign.spec.ts` (3 tests) pass against this worktree’s own preview on port 4173, checked free before each run. The release gate, `npm run timeline:threat -- --check`, passed on `069bec1` (17 minutes on shared CPUs): the ladder kept the scale, and every tier, index and fingerprint matched the committed table. While this was written the integration head moved from `219f082` to `a557a9c`, a documentation commit (brief §20, the integration notes, a stage prompt) that changes no battle, so the table stands for it and the branch does not merge it. CORE T13 (beats, volleys, fire control) is in progress on the integration branch and will change the reference battles: the merge that brings it in regenerates the table (§4.14), and until then the fingerprint test fails if T13 changes the catalogue or a preset’s reference fleets, and `--check` fails in any case.

### 4.14 Release

After the merge, in the release worktree, run `npm run timeline:threat`. It measures the probe ladder first and re-bases by itself when §1.8’s triggers say so, before any preset is measured. Exit code 0: commit the regenerated table and report. Exit code 1: follow §1.8 for each new timeline it names (or re-base the reference, if the time-limit share is over the bound), then run it again and commit. The release gate is `npm run timeline:threat -- --check`, which must pass on the release commit; between releases the fingerprint test turns `npx vitest run` red as soon as the catalogue or a preset changes. The changelog lists a re-base with its old and new thresholds, and any existing preset whose label changed, with old and new index.

## 5. Rules compliance

- **Canon by default, AU by choice.** `canon_me3` is untouched and stays the default; the ten presets are `category: 'au'`, their descriptions open with `ALTERNATE UNIVERSE.`, every codex line, lock reason and campaign note about them opens with `ALTERNATE UNIVERSE (<name>): `, the timelines screen keeps its "Alternate universe. Never presented as canon." note, and the briefing keeps its AU warning.
- **Original writing.** Every tagline, description, history line, lock reason and codex line was written for this project; none quotes or closely paraphrases the games or the codex. Canon facts are restated in new words and only up to each divergence.
- **Lore-consistent.** Each timeline follows the trilogy up to its divergence point (named in its provenance note) and changes only what follows from it. A divergence changes what the organics know or do, never what the Reapers are: no timeline gives the Reapers a weakness or a technology canon does not record (Vigil’s Warning has no command vulnerability; Leviathan’s Bargain lends minds, not concealment; the Covenant’s interference is an act of the Leviathans in battle). Where the campaign cannot follow a premise, the locks and the campaign note say so.
- **Determinism.** `threat.ts`, `threatReference.ts` and `alternates.ts` read no clock and use no unseeded random source; every battle draws from the seeded `Rng` through `BattleSimulation`; the generated table carries no timestamp. Wall times appear on stdout only.
- **HADES wording.** None of the new timelines uses HADES; where the scale mentions it, it says "HADES penetrators" (a penetrator with a nuclear warhead).
- **No hull caps.** Counts come from `fleetStrength` through the existing `fleet()` rules (rounding, one hull minimum, carriers at most ×1.5, unique hulls once); the reference only leaves out a contingent whose faction is at 0; nothing new caps a fleet.
- **Honesty.** Tiers are measured, not asserted: the label is always the generated table’s; declared tiers are checked by a test; the existing presets keep their numbers and take whatever label the measurement gives (§3); the tier sentences are true by construction and every rung sentence comes from the timeline’s own measurement; the levers are measured at both ends; §1.5 states what the scale cannot see, and every design-time figure is labelled as such.

## Appendix A. Measured per-group results

Index per Reaper group, coalition wins of 4 in brackets, then the group as the timeline deploys it (capitals/destroyers); run on `3c91a33`, seeds 1–4 (`TIMELINE_THREAT.md` is the authority). The first draft’s design-time table (prototype geometry on `ba4decf`) is in this file’s git history.

| Preset | Raid | Strike group | Battlegroup | Assault fleet | Harvest fleet | Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `canon_me3` | 92 (4) 2/5 | 73 (3) 3/7 | 30 (0) 4/10 | 19 (0) 5/12 | 16 (0) 6/14 | 46.2 |
| `prepared_galaxy` | 96 (4) 2/5 | 93 (4) 3/7 | 85 (4) 4/10 | 64 (2) 5/12 | 42 (0) 6/14 | 75.9 |
| `humanity_ascendant` | 98 (4) 2/5 | 96 (4) 3/7 | 90 (4) 4/10 | 77 (3) 5/12 | 45 (1) 6/14 | 81.2 |
| `cerberus_reformed` | 95 (4) 2/5 | 78 (3) 3/7 | 31 (0) 4/10 | 21 (0) 5/12 | 21 (0) 6/14 | 49.0 |
| `reaper_escalation` | 34 (0) 3/8 | 18 (0) 5/11 | 15 (0) 6/16 | 9 (0) 8/19 | 5 (0) 10/22 | 16.0 |
| `prime_apex` | 99 (4) 2/5 | 99 (4) 3/7 | 99 (4) 4/10 | 98 (4) 5/12 | 98 (4) 6/14 | 98.6 |
| `apex_legacy` | 99 (4) 2/5 | 99 (4) 3/7 | 99 (4) 4/10 | 98 (4) 5/12 | 98 (4) 6/14 | 98.6 |
| `cerberus_ascendant` | 94 (4) 2/5 | 87 (4) 3/7 | 34 (0) 4/10 | 22 (0) 5/12 | 19 (0) 6/14 | 51.4 |
| `sovereigns_triumph` | 19 (0) 3/7 | 14 (0) 4/9 | 13 (0) 5/13 | 7 (0) 7/16 | 4 (0) 8/18 | 11.5 |
| `indoctrinated_council` | 57 (2) 2/5 | 23 (0) 3/7 | 16 (0) 4/10 | 12 (0) 5/12 | 10 (0) 6/14 | 23.4 |
| `leviathans_bargain` | 66 (2) 2/5 | 19 (0) 3/7 | 10 (0) 4/10 | 10 (0) 5/12 | 8 (0) 6/14 | 22.5 |
| `vigils_warning` | 92 (4) 2/5 | 61 (2) 3/7 | 32 (0) 4/10 | 16 (0) 5/12 | 15 (0) 6/14 | 43.2 |
| `collectors_harvest` | 86 (4) 2/6 | 23 (0) 3/8 | 13 (0) 5/12 | 10 (0) 6/14 | 8 (0) 7/16 | 27.9 |
| `geth_quarian_concord` | 95 (4) 2/5 | 90 (4) 3/7 | 64 (2) 4/10 | 31 (0) 5/12 | 22 (0) 6/14 | 60.4 |
| `asari_disclosure` | 94 (4) 2/5 | 79 (3) 3/7 | 39 (0) 4/10 | 28 (0) 5/12 | 20 (0) 6/14 | 52.0 |
| `turian_total_war` | 96 (4) 2/5 | 92 (4) 3/7 | 78 (4) 4/10 | 61 (2) 5/12 | 33 (0) 6/14 | 72.0 |
| `leviathans_covenant` | 99 (4) 2/5 | 93 (4) 3/7 | 77 (3) 4/10 | 60 (1) 5/12 | 43 (1) 6/14 | 74.3 |
| `conduit_protocol` | 99 (4) 1/2 | 99 (4) 1/3 | 94 (4) 2/4 | 91 (4) 2/5 | 93 (4) 2/6 | 95.1 |

## Appendix B. The design-time prototype

The first draft’s figures came from this prototype; the implementation (§4.6) differs from it in the review’s three reference changes: absent factions field nothing, the standoff (59.9 km) and the time limit (240 s) are derived from the catalogue instead of fixed at 60 km and 240 s, and the contingents carry neutral names.

The prototype that produced every design-time figure built the §1.1 engagement with `fleet()` from `src/scenarios/index.ts` exactly as §4.6 does: the same fleet ids, contingent and class order, anchors, formations, rung sizes, seeds, `maxDuration` 240 and deep-space environment; only the fleet names differed (it used the faction ids). It computed L, S and the index as in §1.2 and the breaking point as in §1.4, ran each battle with `new BattleSimulation(config).run()`, and was run as four parallel processes. The alternatives it rejected (§1.6) were: the same builder with a 74-hull coalition (Alliance 3 DN, 1 CV, 6 CA, 8 FF; Hierarchy 3 DN, 6 CA, 8 FF; Republics 2 DN, 6 CA; Union 1 DN, 4 CA, 6 FF; Migrant Fleet 2 HV, 6 CA; geth 1 DN, 4 CA, 6 FF) 76 km from single Reaper groups of 4/10, 5/12 and 6/14, at `maxDuration` 300 and 240; the 36-hull coalition spread out (geth (−40, −38), Hierarchy (−24, −32), Alliance (0, −30), Republics (24, −32), Union (−12, −42), Migrant Fleet (12, −42), Cerberus (40, −38)); and the same coalition stacked on one anchor, (0, −30) to (0, −42) in 2 km steps in contingent order.

## Appendix C. The literals and their metadata

Superseded by `src/timelines/alternates.ts`, which is the authority for every value and text of the ten timelines and their metadata (it validates with no warning, round-trips unchanged and passes `normaliseRules` unchanged, all tested). The first draft carried the literals here; the reviews changed them as follows:

| Timeline | Change after review |
| --- | --- |
| Sovereign’s Triumph | `fleetStrength.geth` 0.5 → 0 (absent); history line on the geth; lever `fleetStrength.reaper` [1.25, 1.5] (the measured `strategic.reaperCompetence` [1.0, 1.3] alternative did not move the index: 8.1 at both ends); world-state locks and campaign note. |
| The Collectors’ Harvest | `fleetStrength.alliance` 0.65 → 0.8, `quarian` and `geth` 0.5 → 0 (absent), `reaper` 1.2 → 1.15; new tagline, description and history (no year of Collector hunts; the Alpha relay stands); lever `fleetStrength.reaper` [1.1, 1.2] (the suggested `strategic.reaperCompetence` [1.0, 1.2] measured flat, 13.2 and 13.3, and the alliance count has a tier cliff at 0.75); world-state locks and campaign note. After the second review (5 November): declared tier 3 by rule 3 of §1.8, with one sentence added to the description; no value changed (§2.2). |
| The Indoctrinated Council | Sabotaged accuracy 0.8 / 0.85 / 0.85 → 0.7 / 0.75 / 0.75 (the first literals measured 27.4, 2.6 points under the tier-3 floor); lever `factionOverrides.turian.accuracy` over [0.55, 0.85], which raises the index but cannot lower it: the timeline sits on a plateau, and every alternative measured (the review’s turian accuracy [0.75, 0.9] and Reaper competence, asari and salarian accuracy, coordination, turian crew quality) stays within seed noise (§2.3). |
| Leviathan’s Bargain | `reaper.electronicWarfare` 1.8 → 1.85 (1.8 measured 26.7 under the revised reference); new tagline, description, history and divergence (minds, not concealment). |
| Vigil’s Warning | `special.reaperCommandVulnerability` removed; `organic.crewQuality` 1.04 added (the lever); new tagline, description, history and divergence (the secret response). After the second review (5 November): the lever moved to 1.0, the floor of its range, by rule 1 of §1.8 (§2.5). |
| The Geth–Quarian Concord | `strategic.alliedCoordination` 0.6 → canon 0.5; new tagline, description and history (Citadel AI law, the treaty, the stand-ins); lever `factionOverrides.geth.electronicWarfare` [1.0, 1.6] (the geth count jumps a tier at 2.5, where the third dreadnought appears); world-state locks and campaign note. |
| The Asari Disclosure | `organic.massAcceleratorDamage` 1.2 → 1.15 (1.2 measured 59.0, 3 points under the tier-5 floor); lever range [1.1, 1.2]. |
| Turian Total War | Unchanged; lever measured at both ends. |
| Leviathan’s Covenant | Values unchanged; the command vulnerability is justified by the Leviathans’ active interference, not by knowledge. |
| The Conduit Protocol | Values unchanged; lever range [0.35, 0.45] → [0.35, 0.41]; campaign note. |

## Review notes (4 November)

The design review of 4 November raised eleven findings, all major. All eleven were accepted; none is rebutted. Where a finding’s suggested value or lever did not survive measurement, the measurement is quoted and the alternative chosen is named.

1. **Vigil’s Warning claimed a Prothean-era Reaper weakness (§2.5).** Accepted. `special.reaperCommandVulnerability` is gone from the preset, with the clause about Reaper fleets faltering whenever their capital ships died and the history line that said so: canon records no such weakness, and learning of one could not create it. The doctrine rests on what Vigil told Shepard: the Reapers open each war by taking the Citadel and the relays after indoctrinated agents have hollowed out the commands, so the galaxy guards the Keepers and the Citadel’s controls, plans for losing the relays and screens for indoctrination. The same principle was checked against the other nine: Leviathan’s Covenant keeps its command vulnerability, now justified as the Leviathans’ active interference in battle rather than their knowledge.
2. **Vigil’s Warning duplicated Prepared Galaxy and contradicted the Ilos scene (§2.5).** Accepted. The response is secret: after the battle a Council recovery team returns to Ilos and brings out what remains of the archive, Council scientists authenticate it, and the Council believes it and buries it to prevent panic. The navies get quiet indoctrination screening and Keeper and Citadel security, but no budget can pass for ships nobody may be told about. New divergence ("a Council team recovers Vigil’s archive after the Battle of the Citadel"), the suggested tagline, new history; the canon line now records that Shepard had only minutes with a failing VI.
3. **The Collectors’ Harvest’s dates contradicted each other (§2.2).** Accepted. The year of Collector hunts is gone, before and after the divergence: the Alliance meets the invasion months early at its peacetime stations, without the delay the destruction of the Alpha relay bought in canon, which is now the reason for its reduced fleet. `fleetStrength.reaper` rests only on the whole fleet arriving at once through the intact relay; the human Reaper is story only, completed when the harvest arrives; the tagline reads "The human Reaper was never stopped". Re-measured with finding 7 applied, the timeline fell to tier 1 (11.8), so its numbers were retuned inside the same story (Alliance 0.8, Reaper groups ×1.15; §2.2).
4. **Leviathan’s Bargain gave the Reapers a concealment technology (§2.4).** Accepted. `reaper.electronicWarfare` stays as the engine’s stand-in, but the cause is in organic minds: thralled sensor officers and fire-control crews see what the Leviathans let them see, so Reaper hulls slip out of firing solutions computed by people who are no longer entirely their own. The divergence has a cause: an indoctrinated member of Dr. Garret Bryson’s team passes his findings to the Reapers.
5. **The Geth–Quarian Concord ignored Citadel AI law and kept unexplained canon (§2.6).** Accepted. The quarians choose their children over their embassy: the Council expels them, Rannoch lives under Citadel sanctions for three centuries, and the Concord joins the 2186 war by treaty. `strategic.alliedCoordination` returns to the canon 0.5 (re-measured 55.7, still tier 4). The geth fleet is justified by what differs from canon (no heretic secession, no 2186 war at Rannoch, shared yards). The reference names the contingent neutrally ("Quarian fleet"), the Concord’s order of battle calls it the Rannoch Navy with Migrant Fleet hull classes standing in for Rannoch-built designs, and one history line keeps Shepard, the Normandy and a hostile Cerberus as stand-ins.
6. **The campaign narrated history these timelines rule out (§4.10, §4.11).** Accepted. `AlternateMeta.worldState` carries the world state each story implies (Sovereign’s Triumph: Ascension lost, Rannoch at war, no Normandy, no cure; The Collectors’ Harvest: Rannoch at war, no Normandy, no cure; the Concord: Rannoch at peace). Campaign setup and the Quick Battle briefing preselect and lock those values with an AU note, and the campaign smoke test uses them. What the campaign still cannot express is said once, AU-prefixed, in a `campaignNote` (Sovereign’s Triumph, The Collectors’ Harvest, the Concord, The Conduit Protocol). For the genophage the closest available state for "no cure is ever made" is "cure sabotaged"; its one inconsistency (the Salarian First Fleet still joins) is stated in the lock’s reason rather than hidden.
7. **The reference fielded allies the stories rule out (§1.1).** Accepted. A contingent is fielded only when its faction’s `fleetStrength` is above 0 ("0 = absent", §1.1); Sovereign’s Triumph sets `geth` 0 and The Collectors’ Harvest `quarian` and `geth` 0, and both were re-measured.
8. **The breaking point and the tier sentences described the base rungs (§1.3, §1.4).** Accepted. `RungMeasure` records the group each timeline actually deploys; `holdsUpTo` is that group’s capital count, and the sentence names the rung and the group. The tier summaries are statements about the index band itself, true by construction; every rung sentence is generated from the timeline’s own measured table. The §0 column and §3 were regenerated from the measurement.
9. **Four levers could not move their preset back (§1.8).** Accepted, and the measurement showed the problem is wider than the four. Every new timeline’s lever was measured at both ends; where a suggested replacement measured flat (Reaper competence for The Collectors’ Harvest and Sovereign’s Triumph) or a fleet lever jumped a tier inside its range (the Concord’s geth count at 2.5, the Conduit’s Reaper count above 0.4167), another story-safe knob was chosen (§1.8, Appendix C). For one timeline the fix is only half possible: The Indoctrinated Council sits on a plateau on which only the Raid is in play, and every knob measured for it, the review’s two suggestions included, stays within seed noise. Its lever, turian accuracy over the wider range [0.55, 0.85], raises the index (26.6 at 0.85) but cannot lower it (22.4 at 0.55) on `d8ee133`; on the merged engine of 5 November it is flat (§2.3). §2.3 says so with the measurements, and a release that finds this timeline above its band goes to rule 3 of §1.8. A step is defined (0.05, or the next count change); `npm run timeline:threat` measures both ends of every lever on every run and writes them into TIMELINE_THREAT.md; each §2 section quotes them. The finding’s measurement of Vigil’s `alliedCoordination` also superseded finding 1’s suggestion to keep it as Vigil’s lever: Vigil’s lever is `organic.crewQuality`.
10. **No engine change, but the default world states contradicted three premises (§4.10).** Accepted and merged with finding 6: still no engine change, because the locks act in the setup and briefing screens. Quick Battle no longer fields the Normandy under the two new timelines in which Shepard is dead (`normandy: 'no'`), and the briefing lists any key it applied without a control. What the untouched `src/scenarios/index.ts` and the other screens still do differently is listed as known limitations in `AU_RULES.md`.
11. **The reference was tied to today’s combat scale (§1.1, §1.8).** Accepted, both remedies. The standoff is 1.07 × the longest catalogue weapon range and the time limit 3.2 × the time a Reaper capital at top speed needs to cross it, so the geometry and the clock keep their meaning when the pacing pass changes ranges or speeds (both are computed, and tested). A CORE change to ranges, speeds or the time scale still bumps `THREAT_FORMULA_VERSION` and re-derives the thresholds by the preset-blind probe ladder (`--probes`). The script reports the share of battles ending on the time limit; the default run and `--check` fail above 25 %. (The 5 November review found that ladder unable to support the thresholds; the mechanical re-base of §1.8 replaced this rule: second review notes, 2.)

## Review notes (5 November)

The implementation review of 5 November checked the branch as measured on `d8ee133` (base `ba4decf`) and on a scratch merge with the integration branch at `8ff0b11`. It raised four findings, all major. All four were accepted; none is rebutted. One remedy was carried out differently from the suggestion: the branch merged the integration head instead of rebasing onto it (finding 1).

1. **The table went out of date on a merge, the Concord left its tier, and no gate noticed (§1.8, §4.14).** Accepted.
   - *Engine.* The branch merged the integration head twice: `4e3cb71` (`118d99f`, which brought CORE T9 to T11, the 0.12.0 release and the review’s `8ff0b11`) and `b9a2d0c` (CORE T12, `219f082`; the integration head has since gained only a documentation commit, §4.13). The continuation plan’s operating rules (`docs/apex/CONTINUATION.md`) forbid rebasing stage branches, and a merge gives the integrator the same tree as the suggested rebase. `CHANGELOG.md` was the only conflict, as the review predicted (the Unreleased entry kept above 0.12.0).
   - *Table.* Re-measured on the merged engine. A full run on `fcc3ae0` re-based the scale (finding 2) and rated every preset (`d2fab02`); after the §1.8 retune below, a full run on `3c91a33` wrote the committed table. Between the two runs every stored figure (all 26 probes, every preset’s index, terms and per-group results, every lever end) reproduced exactly, except those of the one preset whose values changed.
   - *The Concord.* With CORE T12’s Reaper AI it measures 60.4 at its lever’s current 1.3, and 61.6 and 60.0 at the lever’s ends (1.0 and 1.6): below 62 at every setting, which the review asked to confirm, and tier 4 on the formula-1 scale and on today’s (tier 5 starts at 64). Its declared tier and its story stand. The review’s doubt about the lever is borne out: it moves the index 1.6 points over its whole range, so it cannot pull the Concord back if a later engine lifts it into tier 5. §2.6 says so, and such a release goes to rule 3 of §1.8.
   - *The four the review found under their ceilings.* On the re-based scale The Indoctrinated Council measures 23.4, 2.6 under the tier-3 floor of 26 (its lever is flat on this engine, §2.3), and Leviathan’s Bargain 22.5, 3.5 under. Vigil’s Warning measured 46.9 at crew quality 1.04, in tier 4: rule 1 moved its lever to the floor of its range, 1.00, where it measures 43.2 (§2.5, which also says why it now reads one tier below canon). The Collectors’ Harvest measured 27.9 and its lever cannot bring it under 26 (28.6 and 26.8 at the ends): rule 3, declared tier 3 with one sentence of story added (§2.2).
   - *Existing presets.* Their labels follow the measurement (§3): canon (46.2), Cerberus Reformed (49.0) and Cerberus Ascendant (51.4) move from tier 3 to tier 4, and Reaper Escalation stays in tier 1 at 16.0, 3.0 under the tier-2 floor. `CHANGELOG.md` lists the changes.
   - *The guard.* `THREAT_FINGERPRINT` in the generated table records a hash of the battle-relevant catalogue (every weapon and ship class, the faction doctrine, the data and simulation constants) and, per preset, of its knobs and the reference fleets it builds. `tests/alternateTimelines.test.ts` fails when either no longer matches, names what changed and says how to regenerate, so the review’s case turns `npx vitest run` red: the Reaper capital beam’s cooldown is catalogue data, and setting it back from 6.2 to 6.0 s changes the catalogue fingerprint (checked on `3c91a33`). Engine code (movement, AI, damage) is not data, and a hash of it would fire on every refactor. For it, the release gate of §4.14, `npm run timeline:threat -- --check`, re-measures the probe ladder and every preset and fails on a due re-base, a changed tier, an index more than 0.5 from the committed one (the runs are deterministic), a stale fingerprint, a missed declared tier or too many time-limit endings.
2. **The probe ladder did not support the thresholds, and re-basing was undefined (§1.3, §1.8).** Accepted, with every part of the suggested remedy.
   - *How 17 / 30 / 48 / 62 / 87 were placed.* §1.3 now says it: between the index clusters the design-time presets formed, that is, by looking at presets. “Never tuned to a preset” is gone from `threat.ts` and from every document.
   - *A ladder dense enough.* The old probes scaled fleets, and `scaleCount` cannot change a one-hull class between ×0.5 and ×1.49, so they held 0, 1, 3 or 5 groups and never 2 or 4. A probe now multiplies every organic faction’s fire rate, heat capacity and hull integrity by m, the continuous counterpart of scaling every fleet, and the ladder bisects every transition deterministically until it is pinned. On the merged engine 26 probes produced every count of groups held from 0 to 5.
   - *A preset-blind split for every tier floor, 1/2 included.* Tier 2: wins at least one battle; tiers 3, 4 and 5: holds at least one, two or three groups; tier 6: holds all five (`THREAT_SPLIT_RULES`). Each threshold is the rounded midpoint between the strongest probe that fails its rule and the weakest probe that meets it: **19 / 26 / 45 / 64 / 84** on the merged engine. The rules were committed in `fcc3ae0`, before the run that rated any preset with them (`d2fab02`).
   - *A mechanical re-base.* It is due when no ladder is recorded, the formula version, the standoff or the time limit changes, or any threshold the ladder derives moves more than 2 points from the committed one (`rebaseReasons`). The default run measures the ladder before any preset and re-bases by itself; `--check` fails when a re-base is due. Whether a CORE change “counts” as a change to ranges, speeds or the time scale is no longer anyone’s judgement.
   - *Reproducible.* The ladder, the splits and what each run did about the scale are printed in `TIMELINE_THREAT.md` and stored in `THREAT_SCALE`. A test checks that the committed thresholds are the ones the stored ladder derives and that the stored ladder is complete; `npm run timeline:threat -- --probes` measures it again.
   - *What it changed.* Canon is the ladder’s ×1 point and the weakest probe that holds two groups, so it reads tier 4 (46.2), 1.2 points above the floor. Turian Total War (72.0) stays in tier 5. The re-base the review sketched on `8ff0b11` did not need a judgement: the branch measures on the T12 engine, where the rules decided it.
3. **The Leviathan research was credited to Ann Bryson (§2.4, §2.9).** Accepted, as suggested (`964f219`). The two canon lines read “Dr. Garret Bryson’s research (and his daughter Ann’s)”; the description, the first history line and the divergence event read “an indoctrinated member of Dr. Garret Bryson’s team passes his findings to the Reapers”. `LORE_REFERENCE.md` (his research and his lab, his daughter Ann, his enthralled assistant) and this document (§2.4, §2.9, §4.12, review note 4 of 4 November) follow.
4. **Ten timelines appeared without an AU label (§4.8).** Accepted, the first remedy: every place that names a timeline away from its own card marks it (`f65aec0`, completed by `3bead93`). `[AU]` or `[CUSTOM]` follows the name in the custom-battle and comparison pickers (with the threat suffix, through the briefing’s own `timelineOptionLabel`), the comparison table, the fleet database column, the saves list, the results line, the campaign war clock and the battle history in Settings, which tags a record by its rules id and so still marks a timeline deleted since the battle (`timelineTagById`). “(ALTERNATE UNIVERSE)” follows it in the codex, fleet database and battle-HUD headers, the menu footer and the selection toast, and the campaign header reads “· ALTERNATE UNIVERSE”. Custom battle prints the briefing’s AU line under its picker, and the ten timeline codex entries are titled “<name> (AU)”. A test checks the helpers for every preset, a custom timeline and deleted ids. The “everywhere” of `README.md` and `CHANGELOG.md` is now true, and `AU_RULES.md` lists the places.
