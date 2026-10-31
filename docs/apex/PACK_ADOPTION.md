# Apex reference pack — adoption plan

Status: analysis document (lore/data layer), 29 October 2026. Nothing in this file is implemented yet; it tells the implementers what to adopt from `docs/apex/reference/`, how to label it, and which numbers to type. Decisions D1–D13 from the lead are taken as given; this document refines them.

The pack (`README.md`, `APEX_Fleet_Reference.md`, `apex_simulator_data.json`, `validation_results.json`, `APEX_Montage_Prompts.md`) is ChatGPT-generated reference text supplied by the user. It is **not canon authority**. Every one of its "CANON" claims was checked against `LORE_REFERENCE.md` (section 1). Where the pack cites an in-game codex entry we do not already anchor, the claim is accepted only as `CANON_INFERRED` with a verification note, never as `CANON_CONFIRMED`.

Note on scope: the task named "sections 1–4, 6, 9 and 12" of the montage guide; that guide has eight sections. Sections 1–4 and 6 were read in full (5, 7 and 8 are off-topic production/publication text and are rejected below); "9" and "12" were taken to mean the Fleet Reference's §9 (Reaper order of battle, Alpha ambush) and §12 (continuity pitfalls), which were read in full together with the rest of that file.

## 0. Reading guide

### 0.1 Label mapping (pack → catalogue)

| Pack label | Our provenance tag | Rule |
| --- | --- | --- |
| CANON (already anchored in `LORE_REFERENCE.md`) | `CANON_CONFIRMED` | Adopt as stated. |
| CANON (plausible codex text, not yet anchored) | `CANON_INFERRED` | Adopt with a `note: 'Pack claim; verify in-game codex entry'`; add to `LORE_REFERENCE.md` under *Inferred* once a developer has checked the in-game entry, then promote. |
| DERIVED (arithmetic on canon inputs) | same tag as its inputs, note says "derived" | e.g. 38.72 kt from 20 kg @ 4,025 km/s is `CANON_INFERRED`. |
| DERIVED (arithmetic on AU inputs) | `AU_MODIFIED` | e.g. Titan 47.8 kt. |
| AU LOCK | `AU_MODIFIED` | Appears only under Apex presets; every screen shows the AU badge. |
| AU PROPOSAL | `AU_MODIFIED` | Same; may be renumbered by us. |
| SIM | `SIMULATION_ESTIMATE` (canon-era mechanics) or `AU_MODIFIED` (Apex-only hulls/weapons) | A SIM value attached to an Apex-only object is AU, because the object is AU. |
| UNKNOWN | no value; `null` in data, "not established" in the codex | Never substitute a convenient number. |

### 0.2 Damage unit (D2)

`1 DKE = 1000 simulation points` (pack reference round: 20 kg at 4,025 km/s ≈ 38.72 kt; our `alliance_dn_main.damage` is already 1000). Weapon yields map directly. **Hull profiles do not map directly**: our model has flat per-hit armour, type-dependent barrier efficiency and a 2.8 s Reaper beam burst, and our organic hulls are already tuned around canon relationships (`LORE_REFERENCE.md` §Simulation estimates). So:

- Organic hulls that already exist keep their numbers (they are `SIMULATION_ESTIMATE` and pass the existing relationship tests).
- New Apex hulls are scaled **by ratio to the pack's standard dreadnought** (`DN_STD`: 1.4 DKE barrier, 1.0 structure, 0.06 recovery) against our Kilimanjaro (5,200 barriers, 9,000 hull, 55 regen): `barriers = 5200 × barrier_dke / 1.4`, `hull = 9000 × structure_dke / 1.0`, `barrierRegen = 55 × recovery / 0.06`. Armour is set by hand (the pack has no armour channel).
- Reaper hulls are **re-based** to satisfy the C02 benchmark (section 5). This is the only canon-side change and it is canon-anchored.
- Pack abstract fields: `operational_readiness` → `crewQuality` via the readiness rule (section 3f); `pd_weighted_engagement_budget_s` → GARDIAN mount count (table 2.4); `mobility_rating` → `maxSpeed/acceleration/turnRate` by the lookup in table 2.4; `heat_per_shot`/`heat_capacity` → our `heat` per shot against a ship capacity of 100 (kept as today); `magazine_shots: 200` on spinal guns → **not adopted** (unlimited today; only Titan/HADES, Nova, Javelin and torpedoes carry magazines); `withdraw_structure_fraction` → faction doctrine `withdrawThreshold` (already 0.25 Alliance, 0.0 Reapers; pack 0.25/0.15 — Reapers keep 0 under canon, D10 gives them conditional withdrawal under Apex only).

### 0.3 Experiment behind section 5

The calibration numbers were checked with a scratch script that patches the catalogue **in memory** (no project file changed) and runs the real `BattleSimulation`: 2/3/4-dreadnought duels with and without return fire at two stand-off ranges, cruiser-vs-destroyer duels over 20 seeds, the canon and Prime/Apex reference engagement (`alliance_fleet_engagement`, fixed fleets, seeds 7–9) and the canon Battle of Earth. Continuous Reaper barrier recovery (mechanic M1, section 5.2) was emulated between steps. Results are quoted where they matter; all of them must be re-run by the implementer after M1 exists for real.

## 1. Audit of the pack's "CANON" claims

| # | Pack claim (pack label) | Anchored in `LORE_REFERENCE.md`? | Verdict | Tag we use |
| --- | --- | --- | --- | --- |
| 1 | Dreadnought gun: 20 kg at 4,025 km/s every 2 s, ~38 kt (C01) | Yes (ME1 codex *Dreadnought*) | Trust. **Our cadence is 4.0 s; canon is 2 s** → calibration fix (section 5). | `CANON_CONFIRMED` |
| 2 | 38.72 kt is the kinetic energy of that round (DERIVED) | Follows from #1 | Trust; ½·20·(4.025e6)² = 1.62e14 J = 38.72 kt. | `CANON_INFERRED` (derived) |
| 3 | Legacy transcription "2 kg at 283 km/s alongside 38 kt" (C03) | Not anchored | **Reject the numbers.** ½·2·(2.83e5)² = 8.0e10 J ≈ 0.019 kt, three orders short of the printed 38 kt; it is a transcription error in one mirror. Our catalogue already uses 20 kg / 4,025 km/s. Record the discrepancy in `LORE_REFERENCE.md` so nobody "corrects" the gun downwards later. | — |
| 4 | Dreadnought inventories 2183 (turian 37, asari 21, salarian 16, human 6 + 1 building) and 2185 (39/20/16/8) (C01, C03) | Not anchored | Plausible ME1/ME2 codex *Dreadnought* text; verify in-game before promoting. Used only in codex text and the Farixen caption. | `CANON_INFERRED` |
| 5 | Farixen 5:3:1 (C04) | Yes | Trust. | `CANON_CONFIRMED` |
| 6 | Sovereign-class ≈ 2,000 m; main weapon 132–454 kt (C02) | Yes | Trust. | `CANON_CONFIRMED` |
| 7 | Destroyer ≈ 160 m (C02) | Yes | Trust. | `CANON_CONFIRMED` |
| 8 | "A cruiser can kill a destroyer if it survives into effective range" (C02) | Not anchored (ours: "beam defeats frigates and cruisers") | Plausible ME3 codex *Reaper Variants* wording; verify. Adopt as a calibration target per D3 regardless (lead decision). | `CANON_INFERRED` |
| 9 | Four-dreadnought benchmark: two resisted, three strain, four destroy (C02) | **Not anchored** | Plausible ME3 codex *Reaper Capabilities/Vulnerabilities* wording; the pack itself says it is a benchmark, not a duel outcome or a barrier capacity. Adopt as the canon calibration target (D3); label the derived capital numbers `SIMULATION_ESTIMATE` with the note "tuned to the codex concentration-of-fire benchmark". Verify the in-game entry; if the entry turns out not to exist, the numbers stay (they also satisfy "Sovereign's barriers withstood the Citadel fleet", which *is* anchored) but the note changes. | `CANON_INFERRED` |
| 10 | Reaper transit ≈ 30 ly/day, no discharge dependency (C02) | Not anchored | Plausible; not used by the tactical sim. Codex text only; DEFER to campaign flavour. | `CANON_INFERRED` |
| 11 | Thanix: Sovereign-derived; eleven months after the Citadel battle; five-second firing cycle (C01) | "Sovereign-derived" yes; cadence and date no | Verify the ME2 codex *Thanix Cannon* wording. If confirmed, our `alliance_thanix.cooldown` 6.0 → 5.0 is a canon-anchored calibration fix (small; re-run balance). Until verified keep 6.0 and show the note. | `CANON_INFERRED` |
| 12 | Quarian fleet ≈ 50,000 vessels, largely civilian (C06) | Yes | Trust. | `CANON_CONFIRMED` |
| 13 | Total Reaper armada: no census (UNKNOWN) | Agreed | Trust; 2,000 / 40,000 / 53,000 are AU values (D13). | — |
| 14 | Reaper transports 200–1,000 m; processors size unspecified (C02) | Not anchored | Variants exist in ME3 (depicted); sizes unverified. No hulls are added (DEFER); captions only. | `CANON_INFERRED` (existence), size `SIMULATION_ESTIMATE` |
| 15 | Oculus: Reaper combat drone, ME2 Collector base (G02) | Not in `LORE_REFERENCE.md` but depicted unambiguously | Trust; add to `LORE_REFERENCE.md` canon anchors. Numbers are ours. | `CANON_CONFIRMED` (existence) |
| 16 | Harbinger oldest/largest; size unspecified (C02) | Yes ("first Reaper"; our 2,400 m is inferred) | Trust; our 1.5× durability is `SIMULATION_ESTIMATE` (pack agrees). | `CANON_CONFIRMED` / `CANON_INFERRED` |
| 17 | Kinetic barriers stop fast material, not heat/radiation (C07) | Yes | Trust (our `BARRIER_EFFICIENCY.laser = 0`). | `CANON_CONFIRMED` |
| 18 | Cyclonic barriers limited to small craft (C01) | Not anchored | ME2 Normandy upgrade; plausible. Not modelled; REJECT as a mechanic. Codex sentence only. | `CANON_INFERRED` |
| 19 | Normandy stealth is heat storage, not invisibility (C01) | Yes (IES) | Trust; our high-ECM model stands; no new mechanic. | `CANON_CONFIRMED` |
| 20 | Everest-class: Everest, Fuji, Elbrus; Kilimanjaro-class: Kilimanjaro, Tai Shan, Shasta, Aconcagua, Orizaba (C01, C03) | Everest-class, Kilimanjaro, Orizaba yes; the other names no | Adopt the extra names in `NAMES.alliance_dreadnought` as `CANON_INFERRED` (verify list). | `CANON_INFERRED` |
| 21 | Destiny Ascension asari flagship (G01); geth dreadnought (G05) | Yes | Trust. Pack render lengths (1,800 m / 1,300 m) are AU; ours (1,600 / 1,100 inferred) stay. | `CANON_CONFIRMED` |
| 22 | Volus dreadnought Kwunu with Thanix armament (C11) | Not anchored | Plausible war-asset text; verify. No volus faction → codex caption only (DEFER hull). | `CANON_INFERRED` |
| 23 | Collector cruiser (G02) | Depicted in ME2 | Trust existence; no Collector faction → DEFER hull. | `CANON_CONFIRMED` (existence) |
| 24 | SR-1 ≈ 155 m, SR-2 ≈ 216 m | Yes (inferred) | Same as ours. | `CANON_INFERRED` |
| 25 | Humans alone field carriers (our anchor) vs pack Sol roster giving **every** faction carriers (80 turian, 40 asari, …) | Ours anchored | **Conflict.** The pack's non-human "carriers" are AU. In captions they are shown as "carriers / hangar ships (AU)"; in simulated rosters only Alliance hulls get `role: 'carrier'`; other factions keep cruiser hangars and liveships. | `AU_MODIFIED` |
| 26 | Citadel Conventions distinct from Farixen (C10); Cerberus finances not infinite (C09); *Mass Effect Evolution* (G04) | Not anchored, not needed by the sim | Trust as background; codex text only. | `CANON_INFERRED` |

Takeaways: the two claims that change code are #1 (2 s cadence) and #9 (four-dreadnought benchmark), both handled in section 5. Claim #3 is the one trap to document. Claim #25 is the one place where the pack's "canon machinery" quietly contradicts our anchors.

## 2. Item-by-item adoption table

Decision codes: **ADOPT** (take as is), **ADAPT** (take the idea, change the numbers or shape), **REJECT** (do not take), **DEFER** (worth having, not in this round; no stub is shipped). "Where" names the file that would carry it.

### 2.1 Continuity rules (Fleet Reference §1, JSON `continuity`)

| Item | Decision | Reason | Tag | Concrete result |
| --- | --- | --- | --- | --- |
| Shepard never dies; Lazarus years become preparation | ADOPT | Core of the AU; already `shepardAlive: true, shepardEffectiveness 1.8` in `prime_apex`. | `AU_MODIFIED` | `historyChanges` text; codex `crucible`/`timeline_2186` AU blocks. |
| Prime morality (Paragon + Renegade), not omniscience | ADOPT as text | Flavour only. | `AU_MODIFIED` | Showcase captions, codex. |
| Javik recovered 2183; Jenkins, Nihlus, Saren survive; Virmire both teams; Mordin early cure; Legion/EDI/geth survive | ADOPT as text | No mechanic. Note the Rannoch world state: Apex presets default `outcome: 'peace'` in `rannoch_campaign`. | `AU_MODIFIED` | `historyChanges` (≤ 40 lines, ≤ 300 chars each, schema limit); codex "Apex continuity" entry. |
| Illusive Man unindoctrinated; early artefact exposure removed; Cerberus "destroy-aligned" | ADOPT | Already `illusiveManIndoctrinated: false, cerberusStance: 'cooperative'`. The schema forces hostile when indoctrinated, so the pair is consistent. | `AU_MODIFIED` | Unchanged flags; new text: "destroy Reaper combat forces, not the Crucible Destroy ending". |
| Treaty of Farixen suspended | ADOPT as text | Explains the fleet multipliers; no new rule. | `AU_MODIFIED` | Caption `FARIXEN LIMITS SUSPENDED` in the Showcase. |
| Bahak evacuated, zero civilian deaths | ADOPT as text | Campaign/Showcase caption only. | `AU_MODIFIED` | Caption bank. |
| No Crucible, no Catalyst encounter, no galaxy-wide pulse, no automatic victory | ADOPT | D1: `crucibleAvailable: false`. `catalystOperational` stays `true` (the Catalyst exists, nobody meets it; `tests/timelines.test.ts:63` pins it). `conventionalVictoryPossible: true` so the campaign still ends. | `AU_MODIFIED` | Section 3a. |
| "Humanity supplies a major initiative, others supply needed capabilities" | ADOPT | Matches the Showcase brief; drives which faction gets which special asset (Titan: Alliance + Black Fleet; line of battle: turians; Ascension protection: Cerberus). | — | Scene design. |
| Alliance 15,292 hulls (13,292 warships + 2,000 support) and the 38,420 / 420 Black Fleet reconciliation | ADAPT | D13: captions and strategic counters only; never simulated hulls. The arithmetic (rows sum to 38,000 + 420) is correct and is reproduced in `apexScale.ts` with a unit test that re-adds the rows. | `AU_MODIFIED` | Section 3e. |
| "A billion years / 50,000 does not establish the Reaper count" | ADOPT | Agrees with our UNKNOWN census. | — | Codex `reapers` estimate line. |

### 2.2 Canon anchors and technology rules (§2, JSON `canon_inventory`)

| Item | Decision | Reason | Tag | Concrete result |
| --- | --- | --- | --- | --- |
| Anchor table (section 1 above) | ADAPT | Items 1, 5, 6, 7, 12, 16, 17, 19, 21 already ours; 4, 8, 9, 10, 11, 20, 22 become `CANON_INFERRED` with verify-notes; 3 is documented as a trap. | per item | `LORE_REFERENCE.md` gains an "Inferred from pack, verify" list and the 2 kg / 283 km/s warning. |
| Separate kinetic / thermal / radiation channels; "blue sphere is a display effect" | ADAPT | We already have five damage types with per-type barrier efficiency (`BARRIER_EFFICIENCY`). No radiation channel is added (nothing emits it except the HADES burst, which uses `warhead` at efficiency 0 because it is already inside). | `SIMULATION_ESTIMATE` | No schema change. HADES burst passes `barrierEfficiencyMultiplier: 0`. |
| Thanix rewarded against Reaper protection without 100 % penetration | ADOPT | Already `thanix_stream` barrier efficiency 0.45, penetration 0.9. | `SIMULATION_ESTIMATE` | Unchanged. |
| Silaris selective armour | REJECT | No per-compartment model; armour is one number. | — | Codex sentence under *Kinetic barriers* at most. |
| Cyclonic barriers small craft only | REJECT as mechanic | Not modelled. | — | — |
| Stealth: detection risk rises after firing | DEFER | Would need a heat→signature link (`ship.heat` exists; signature is static). Good later feature; not needed for D1–D13. | — | Backlog. |
| FTL: no free teleportation / weaponised transit | ADOPT | Constrains D9: the drive attack is a sublight terminal run on a cleared corridor, not an FTL ram. | — | Section 3c drive attack. |
| Communications: redundant links, local fire control | ADOPT as text | Our ships already fire locally; fleet orders are advisory. | — | — |
| "No live Reaper component is safe because damaged" | ADOPT as text | Campaign research flavour (post-war already models risk). | — | — |

### 2.3 Hull profiles (§3, §5, JSON `hull_profiles`) — mapped by the §0.2 ratio rule

| Pack profile (barrier / structure / recovery DKE) | Decision | Mapped (barriers / hull / regen) | Our class and values to use | Tag |
| --- | --- | --- | --- | --- |
| Line dreadnought 1.4 / 1.0 / 0.06, 900 m, 6 Mt | ADOPT identity | 5,200 / 9,000 / 55 | `alliance_dreadnought` unchanged except cadence (section 5). | `SIMULATION_ESTIMATE` |
| Fleet carrier 0.9 / 0.65 / 0.04, 900 m | ADOPT (ours heavier) | 3,343 / 5,850 / 37 | Keep `alliance_carrier` 3,800 / 7,000 / 45. 48 craft per carrier is a pack SIM loading; ours stays 24 (render budget), captions say 48. | `SIMULATION_ESTIMATE` |
| Heavy cruiser 0.65 / 0.55 / 0.035, 650 m, 1.4 Mt | ADAPT (one AU class, existing role) | 2,414 / 4,950 / 32 | New `cerberus_heavy_cruiser` (role `cruiser`, 650 m): barriers 2,400, hull 4,900, armour 70, regen 32, speed 0.85, accel 0.15, turn 8, sensors 85, signature 1.25, ecm 0.3, crew 1.05; mounts `cerberus_cruiser_main`, `thanix_heavy` ×1, `javelin_rack` ×1, `alliance_broadside` 2+2, `gardian` 6; pointValue 150. No generic heavy-cruiser role (section 3b). | `AU_MODIFIED` |
| Patrol cruiser 0.35 / 0.25 / 0.025, 450 m | ADOPT (ours ≈) | 1,300 / 2,250 / 23 | Keep `alliance_cruiser` 1,600 / 2,400 / 28. | `SIMULATION_ESTIMATE` |
| Frigate 0.12 / 0.08 / 0.012, 180 m | ADOPT (ours ≈) | 446 / 720 / 11 | Keep `alliance_frigate` 450 / 520 / 14. | `SIMULATION_ESTIMATE` |
| Thanix-refit frigate (30 % of frigates) | ADAPT | — | Under Apex `thanixAvailability: 'fleetwide'` already refits cruiser mains; frigates keep accelerators (render/perf). The 30 % fraction becomes a caption. | `AU_MODIFIED` |
| Corvette 0.035 / 0.025 / 0.004, 85 m | REJECT as hull (section 3b) | 130 / 225 / 4 | Counted in captions (11,460 at Sol) and in the distant-engagement layer. | `AU_MODIFIED` (counts) |
| Armed conversion 0.15 / 0.22 / 0.01 | DEFER | — | Quarian `quarian_heavy` already plays "converted hull with a big gun". | — |
| Fixed heavy platform 3.5 / 4.0 / 0.08, 1,200 m, 15 Mt, two DN channels | ADAPT (Apex scenario asset) | 13,000 / 36,000 / 73 | New `sol_defence_platform` (section 3b). 612 platforms is a caption; scenarios place 2–6. | `AU_MODIFIED` |
| Sovereign-class 6.0 / 4.0 / 1.1 | ADAPT (re-based to C02, section 5) | — | `reaper_capital`: barriers 7,000, hull 16,000, armour 320, regen 1,100/s **continuous under fire** (mechanic M1). | `SIMULATION_ESTIMATE` (canon-anchored benchmark) |
| Harbinger 9.0 / 6.0 / 1.1 (×1.5 SIM boss) | ADOPT ratio | — | `harbinger`: barriers 10,500, hull 24,000, armour 380, regen 1,100 under fire; three beams as today. | `SIMULATION_ESTIMATE` |
| Reaper destroyer 0.22 / 0.16 / 0.018 | ADAPT (section 5) | 817 / 1,440 / 17 | `reaper_destroyer`: barriers 800, hull 600, armour 160, regen 40 (ordinary 3 s pause rule; no under-fire regen). | `SIMULATION_ESTIMATE` |
| Reaper transport 0.08 / 0.12; processor 0.18 / 0.4 | DEFER | — | No hulls; campaign already abstracts occupation. Captions "1,800 transports / 750 processors committed (AU)". | `AU_MODIFIED` (counts) |
| Interceptor 15 m; torpedo craft 22 m | ADOPT (ours ≈, one class) | 7 / 9 | Keep the single `*_fighter` classes (gun + 2 torpedoes). | `SIMULATION_ESTIMATE` |
| Valkyrie 4.0 / 2.5 / 0.14, 2,000 m, 18 Mt | ADAPT | 14,857 / 22,500 / 128 | `normandy_valkyrie` (section 3b): barriers 14,800, hull 22,500, armour 180, regen 128. | `AU_MODIFIED` |
| Black Fleet dreadnought 1.7 / 1.2 / 0.075, 1,000 m | ADAPT | 6,314 / 10,800 / 69 | `cerberus_dreadnought`: barriers 6,300, hull 10,800, armour 135, regen 69, length 1,000 m; mounts the Titan gun under Apex. | `AU_MODIFIED` |
| Oculus 0.005 / 0.004, 12 m | ADAPT | 19 / 36 | `reaper_oculus`: barriers 20, hull 24 (section 3b). | `SIMULATION_ESTIMATE` (canon drone) |
| SR-1 survival variant 0.15 / 0.1; SR-2 upgraded 0.35 / 0.2 | DEFER | 557 / 900; 1,300 / 1,800 | Our SR-2 (520 / 700) stays in canon; an Apex-upgraded Normandy can come later as a `techOverride` on the named frigate. | — |
| Destiny Ascension 2.4 / 1.7; geth dreadnought 2.0 / 1.4; Kwunu 1.6 / 1.1; Collector cruiser 1.8 / 1.3 | REJECT numbers / DEFER hulls | — | Ours are already tougher (Ascension 14,000 / 20,000; geth 5,800 / 10,500) and `SIMULATION_ESTIMATE`; Kwunu and Collector cruiser have no faction. | — |
| Support tanker / repair vessel | DEFER | — | Campaign abstraction only. | — |
| `thermal_armour_coupling 0.5`, `heat_lockout 0.95`, `cooling 0.025/s` | REJECT numbers | Our heat model (capacity 100, cooling 8 %/s, lockout at 100 %, recovery below 55 %) already works and is tested. | — | — |
| `withdraw_structure_fraction` 0.25 / 0.15 | ADOPT (organics) / ADAPT (Reapers) | Alliance doctrine already 0.25. Reapers keep 0 under canon; Apex AI (D10) withdraws a *threatened group*, not individual hulls. | `SIMULATION_ESTIMATE` | Section 3b AI note. |
| `recovery_requires_projectors`, `rebuild_destroyed_systems_in_combat: false` | ADOPT | Subsystem damage exists (engines/weapons/sensors); barrier regen already stops at 0 only when hit; add: regen scales with `subsystems.weapons`? No — add a fourth subsystem `projectors` only if cheap; otherwise DEFER. | `SIMULATION_ESTIMATE` | DEFER the projector subsystem; note in backlog. |

### 2.4 Abstract-field mappings used above

| Pack field | Our field | Mapping |
| --- | --- | --- |
| `pd_weighted_engagement_budget_s` | GARDIAN mount count | 4 → 2 mounts (frigate), 6 → 4 (cruiser), 10 → 6 (heavy cruiser), 12 → 8 (dreadnought), 16 → 10 (carrier / Black Fleet DN), 20 → 12 (platform), 30 → 14 (Valkyrie), 32 → 8 Reaper emitters (capital, keep), 40 → 10 (Harbinger, keep). |
| `mobility_rating` | `maxSpeed` km/s (compressed) → `acceleration`, `turnRate` | 0.0 → 0 / 0 / 2 (platform); 0.15 → 0.6 / 0.08 / 4 (carrier); 0.2 → 0.65 / 0.09 / 4.5 (dreadnought, Valkyrie); 0.3 → 0.8 / 0.14 / 6 (Reaper capital); 0.35 → 0.85 / 0.15 / 8 (heavy cruiser); 0.45 → 0.9 / 0.16 / 9 (cruiser); 0.75 → 1.4 / 0.32 / 22 (frigate); 0.8 → 1.6 / 0.4 / 16 (destroyer); 1.0 → 3.4–3.6 / 1.4–1.8 / 90–120 (fighters, Oculus). |
| `operational_readiness` | `crewQuality` | Section 3f (readiness tiers), not a per-hull constant. |
| `heat_per_shot` / `heat_capacity` | `WeaponDef.heat` / ship capacity 100 | Keep ours (DN 18, Thanix 20, Titan 24, Nova 30, heavy Thanix 30 per channel). |
| `magazine_shots` | `WeaponDef.magazine` | Only Titan/HADES (12 special + unlimited slugs), Nova core (40), legacy Nova (12), Javelin (4 salvos), torpedoes (8 / 2 as today). |
| `useful_range_km` (10,000–80,000 km) | `range` nominal km (compressed ×0.4 battlespace) | Ratios only: Titan/Nova range 48–52 vs DN 42 (pack 100,000 vs 80,000 upper bound). |
| `requires_bow_solution` | `arc` ≤ 20 | Already how spinal mounts are expressed. |
| `kinetic_fraction / thermal_fraction` | `damageType` | 100/0 → `kinetic`; 70/30 → `thanix_stream`; 65/35 → `reaper_beam`; GARDIAN → `laser`; torpedoes → `warhead`. |

### 2.5 Weapon catalogue (§4, JSON `weapons`) — direct DKE × 1000

| Pack weapon | Decision | Ours (value, cadence) | Note | Tag |
| --- | --- | --- | --- | --- |
| Standard DN spinal, 1.0 DKE, 2 s CANON | ADOPT cadence | `alliance_dn_main` 1000 / **2.0 s** (was 4.0); turian 1050 / 2.0 (was 3.8), asari 1100 / 2.0, salarian 1020 / 2.0, geth 1150 / 2.0; `quarian_heavy_main` 700 / 3.0 (converted hull, not a dreadnought; was 4.2); `ascension_main` 2600 / 4.0 (unique gun, kept). Heat 18 per shot now limits sustained fire (100 / 18 ≈ 5 rounds before the 8 %/s cooling matters) — intended. | `CANON_CONFIRMED` cadence, yields `SIMULATION_ESTIMATE` |
| Heavy cruiser spinal 0.154 DKE / 2.5 s | REJECT number | Our `cerberus_cruiser_main` 340 / 2.9 s is already heavier; used by the heavy cruiser. | `SIMULATION_ESTIMATE` |
| Patrol cruiser spinal 0.0617 / 3 s | REJECT number | Ours 320 / 3 s ("~1/3 of a dreadnought round", anchored relationship). | `SIMULATION_ESTIMATE` |
| Frigate accelerator 0.0044 / 2 s | REJECT number | Ours 70 / 1.5 s; the pack's frigates are 15× weaker, which would break "frigate wolfpacks harass" and the ammo tests. | `SIMULATION_ESTIMATE` |
| Thanix strike mount 0.35 DKE / 5 s CANON cadence | ADOPT (sustained output identical) | Ours 420 / 6.0 s = 70 pts/s; pack 350 / 5 s = 70 pts/s. If claim #11 verifies, switch to 350 / 5.0 (same output, canon cadence). | `CANON_INFERRED` cadence |
| Heavy Thanix mount 1.0 DKE / 5 s | ADAPT | New `thanix_heavy` (section 3c). | `AU_MODIFIED` (mount) |
| Disruptor torpedo 0.7 / 12 s, magazine 8 | ADOPT shape, REJECT yield | Ours 260 / 9 s / magazine 8 passes the balance tests; 700 would make frigate packs kill destroyers in one salvo. | `SIMULATION_ESTIMATE` |
| Javelin rack 1.3 DKE per salvo, 20 s, magazine 4 | ADAPT | New `javelin_rack`: 4 torpedoes × 325 per salvo (section 3c). | `CANON_INFERRED` (ship-mounted Javelin exists), values `SIMULATION_ESTIMATE` |
| GARDIAN 0.01 DKE/s | REJECT number | Ours 14 per 0.35 s in 10-shot bursts; tested. | `SIMULATION_ESTIMATE` |
| Reaper capital main 7.75 DKE / 6 s (300 kt packet) | ADOPT equivalence check | Ours: two beams × 1,900 dps × 2.8 s every 7.5 s = 10.6 DKE / 7.5 s; **one burst = 5.3 DKE ≈ 206 kt-equivalent, inside the codex 132–454 kt band** — add that sentence to the codex. Keep. | `CANON_CONFIRMED` band, model `SIMULATION_ESTIMATE` |
| Reaper destroyer main 0.31 DKE / 2 s (12 kt) | ADOPT equivalence | Ours 1,248 per 6.5 s = 0.19 DKE/s vs 0.155 DKE/s. Keep. | `SIMULATION_ESTIMATE` |
| Oculus strike 0.006 DKE/s | ADAPT | New `oculus_laser` 9 per 0.3 s (section 3c). | `SIMULATION_ESTIMATE` |
| Auxiliary defensive mount 0.002 | REJECT | No auxiliaries. | — |
| Project Titan kinetic stage 25 kg @ 4,000 km/s = 1.2345 DKE, 6 s | ADOPT | `apex_hyper_ma` becomes the Titan gun: damage **1,235** (was 3,200), cooldown 6.0 (was 4.5). | `AU_MODIFIED` |
| HADES payload 350 kt = 9.04 DKE "before coupling", 12 rounds per capable hull | ADAPT | Internal `warhead` burst **2,260** (coupling 0.25) after a penetrating hit; magazine 12 then ordinary slugs. | `AU_MODIFIED` |
| Nova Array core 25 kg @ 6,000 km/s = 2.78 DKE, 6 s | ADOPT | `nova_array` 2,780 / 6.0 s with the degraded-target rule (D8). | `AU_MODIFIED` |
| Legacy Nova 20 kg @ 0.1c = 55.9 DKE, 60 s, magazine 12 | ADAPT | `nova_legacy` 30,000 kinetic (≈ 0.54 of the relativistic figure couples; a clean hit still kills an undamaged capital, which is the point of the "easier by design" preset), 60 s, magazine 12, 6 s visible charge. `apex_legacy` only. | `AU_MODIFIED` (high power) |

### 2.6 Faction design sheets and modifiers (§3, §5)

| Item | Decision | Reason / concrete result | Tag |
| --- | --- | --- | --- |
| Visual design sheets (Alliance panels and blue drives; turian layered hulls; asari curves; salarian precision; geth geometry; quarian patched modules; krogan purchased hulls; batarian AU silhouettes; Cerberus charcoal/white/orange) | ADOPT as text for D12 | They match our existing original designs (`codex/entries.ts` faction estimates). Each becomes the "must read as" checklist in `docs/design/<class>.md`. Rule kept: *orange is Cerberus identification, never a shield colour*. | — |
| Alliance +10 % reserve response after command handover | ADAPT | No command-handover model. Expressed as `alliedCoordination 0.85` under Apex. | `AU_MODIFIED` |
| Turians +10 % salvo synchronisation | ADAPT | Becomes the fleet-volley window: turian fleets get `volleyWindow 1.0 s` vs 1.5 s default (D4 volley order). Also keeps doctrine `cohesion 0.95`. | `SIMULATION_ESTIMATE` |
| Asari +10 % precision on a maintained track | ADAPT | `factionOverrides.asari.accuracy 1.05` under Apex (ours already models asari as accuracy/range). | `AU_MODIFIED` |
| Salarians +15 % track acquisition, +20 % interception reach | ADAPT | `factionOverrides.salarian.sensors 1.15, gardianEffectiveness 1.2` under Apex. | `AU_MODIFIED` |
| Geth +15 % coordination, +15 % repair; fragmentation removes the bonus | ADAPT | `factionOverrides.geth.crewQuality 1.1, barrierRegen 1.15`; fragmentation is already the `reaperCommandVulnerability`-style loss we do not model for geth → text only. | `AU_MODIFIED` |
| Quarians +20 % repair in supplied yards | ADAPT | Campaign repair rate ×1.2 for quarian fleets under Apex; tactical `barrierRegen 1.1`. | `AU_MODIFIED` |
| Batarians +10 % patrol coverage | DEFER | No batarian faction. Caption only ("Batarian survivor commands — 1,900 warships (AU)"). | `AU_MODIFIED` (counts) |
| Krogan +20 % boarding | REJECT | No boarding model. Krogan command is a caption. | — |
| Cerberus +15 % first-contact firing solution | ADAPT | Already `factionOverrides.cerberus { sensors 1.6, electronicWarfare 1.6 }`; reduce to `sensors 1.3, electronicWarfare 1.4, accuracy 1.1` (the pack also lists *limited magazines, scarce components, small fleet*: the finite HADES magazine and `fleetStrength.cerberus 1.5` carry the cost). | `AU_MODIFIED` |
| Reapers: autonomy, endurance, reach; finite hulls | ADOPT | Already doctrine; D10 adds the behaviours. | — |
| "Apply modifiers to processes, not a universal faction damage bonus" | ADOPT | This is why Apex core drops the blanket `massAcceleratorDamage 1.25 / beamDamage 1.35` (section 3a). | — |

### 2.7 Normandy Valkyrie (§6, JSON `DN_VALKYRIE`, `legacy_nova`) — D8

| Item | Decision | Concrete result | Tag |
| --- | --- | --- | --- |
| 2,000 m Normandy-lineage flagship, one of the 48 Alliance dreadnoughts | ADOPT | Class `normandy_valkyrie`, faction `alliance`, role `dreadnought`, section 3b. Named vessel "SSV Normandy Valkyrie". | `AU_MODIFIED` (AU LOCK) |
| 18 Mt, crew 3,200, Hackett remains fleet commander, Shepard commands the mission element | ADOPT as text | Codex entry. | `AU_MODIFIED` |
| Nova Array 25 kg @ 6,000 km/s, 6 s | ADOPT | `nova_array` 2,780 / 6.0 s. | `AU_MODIFIED` |
| Three heavy Thanix channels with separate heat | ADOPT | 3 × `thanix_heavy`, per-mount heat (new `WeaponState.heat`, lockout per channel at 100). | `AU_MODIFIED` |
| HADES segmented protection 4 / 2.5 / 0.14 | ADOPT by ratio | barriers 14,800, hull 22,500, armour 180, regen 128. "Segmented" is text; no section model. | `AU_MODIFIED` |
| EDI aboard; Black Echo optional | ADOPT EDI, REJECT Black Echo | EDI is canon; her presence is a codex line and `crewQuality 1.25`. Black Echo is an unexplained extra intelligence; not adopted. | `AU_MODIFIED` |
| No planetary landing; limited emission control | ADOPT as text | signature 3.0 (bigger than a Reaper capital), ecm 0.3 (not a stealth ship). | `AU_MODIFIED` |
| "Earns the capital kill only with escorts degrading the target first" | ADOPT | `nova_array.degradedTargetBonus = { barrierFractionBelow: 0.5, multiplier: 1.5 }`; against an intact Reaper the round is 2.78 DKE (less than three dreadnought volleys); scenes may force it. | `AU_MODIFIED` |
| Legacy near-c Nova (0.1c, 2.16 Mt, 60 s, finite, visible charge), disabled in core | ADOPT in `apex_legacy` only | `nova_legacy` 30,000 / 60 s / magazine 12 / 6 s charge; mounted only when `special.legacyNova` is true. | `AU_MODIFIED` (high power) |

### 2.8 Cerberus antihero redemption (§7)

| Item | Decision | Concrete result | Tag |
| --- | --- | --- | --- |
| Illusive Man strategic, not sentimental; Evolution comic history changed | ADOPT as text | Codex `cerberus` AU block for both Apex presets; Showcase card 17/18 captions. | `AU_MODIFIED` |
| Evidence list (programmes closed, Miranda's authority, EDI a person, escort interposes before a turian ship, telemetry shared, obeys allied withdrawal) | ADOPT as scene beats | Card 18 ("Cerberus protects the Ascension") is the interposition beat; implement as a forced `escort` order on a Black Fleet heavy cruiser toward `destiny_ascension` in the Showcase scene. | `AU_MODIFIED` |
| Money: no credits-per-dreadnought conversion; 420-ship Black Fleet is a mobilised network | ADOPT as text; REJECT any economy number | Campaign already has no Cerberus economy. | — |

### 2.9 Sol coalition order of battle (§8, JSON `sol_coalition`, `apex_alliance_establishment`) — D13

| Item | Decision | Concrete result | Tag |
| --- | --- | --- | --- |
| Nine command rows, 38,420 mobile warships, 1,287 heavy combatants, 612 platforms, 25,536 embarked craft, 492 Alliance frigates elsewhere, 2,000 support | ADOPT as caption data | `src/data/apexScale.ts` (section 3e) with a test that sums the rows. Captions carry "AU scenario value". | `AU_MODIFIED` |
| Mobilisation plausibility (six steps) | ADOPT as text | Codex "Apex mobilisation" entry; explicitly "the games provide no industrial statistics". | `AU_MODIFIED` |
| Readiness 25 / 45 / 30 with weights 1.0 / 0.85 / 0.60 | ADOPT | Section 3f. | `SIMULATION_ESTIMATE` (rule) / `AU_MODIFIED` (Apex rosters) |
| Retrofit allocation (30 % Thanix frigates, 35 % Thanix heavy cruisers, 12 HADES-capable dreadnoughts) | ADAPT | Compressed rosters: Titan gun on Alliance and Black Fleet dreadnoughts; Thanix fleet-wide on cruiser mains; frigates unchanged. The fractions appear in captions only. | `AU_MODIFIED` |
| United fleets per side with per-fleet faction, formation, counts, arrival (D6) | ADOPT | Preset compositions: *Sword Fleet* (Alliance 6 DN / 2 CV / 16 CA / 24 FF / Normandy / Valkyrie under Apex), *Hierarchy line* (5 / 10 / 16), *Republics* (Ascension + 2 / 8), *Union First Fleet* (2 / 8 / 12), *Geth-Quarian joint command* (geth 1 / 8 / 12 + quarian 3 heavy / 10), *Black Fleet* (2 Black Fleet DN / 2 heavy CA / 6 CA / 10 FF), *Sol platforms* (4 platforms, `defend_position`), *Citadel Fleet* (turian 3 / 10 / 14 + asari 6 CA), *Reaper blockade* (6 cap / 14 dd / Harbinger / Oculi). | counts `SIMULATION_ESTIMATE`; Apex-only assets `AU_MODIFIED` |

### 2.10 Reaper order of battle and Alpha ambush (§9, JSON `reaper_campaign`, `sensitivity_axes`)

| Item | Decision | Concrete result | Tag |
| --- | --- | --- | --- |
| 53,000 initial; 25 % Alpha loss; 39,750 post-Alpha; 9,620 regional losses; 480 capitals + 12,000 destroyers committed to Sol (+ 1,800 / 750 specialists) | ADOPT as caption data | `apexScale.reaper` with the conservation test (initial − alpha − regional − elsewhere = Sol). Shown as "AU scenario value" strategic counters; **never** spawned. | `AU_MODIFIED` |
| Harbinger counted inside the capitals; 1.5× boss | ADOPT | Already so. | `SIMULATION_ESTIMATE` |
| Alpha ambush requires physical concentration; 0 / 10 / 25 % slider | ADAPT | Campaign world-state option `alpha_losses: '0' / '10' / '25'` (Apex presets default `'25'`, canon has no option): multiplies `reaper.reinforcementPool` and the harvest-fleet value by 1.0 / 0.9 / 0.75. No duplicate delay bonus. | `AU_MODIFIED` |
| Sensitivity axes (readiness ×0.75/1.0/1.1; Sol capitals 360/480/720; platforms 25/50/100 %; toggles for Titan, Valkyrie, drive attacks) | ADAPT | Expose the toggles as `special` flags (section 3a); readiness multiplier as a custom-timeline field; counts as caption variants. A "sensitivity run" preset is not shipped (custom timeline covers it). | `AU_MODIFIED` |
| "What defeats the Reapers" (nine points) | ADOPT | Doctrine text for the Apex AI/comms: concentrate on selected capitals, shift targets after confirmed kills (our AI already re-targets on `ship_destroyed`), withdraw damaged heavies behind screens. | — |
| "Why Javik recognises a different outcome"; "We made an empire. You made allies." | ADOPT as AU caption | Original AU line, never attributed to the games. | `AU_MODIFIED` |

### 2.11 Black Fleet drive sacrifices (§10, JSON `drive_attack`) — D9

| Item | Decision | Concrete result | Tag |
| --- | --- | --- | --- |
| Crippled Cerberus heavy ship with propulsion commits to a terminal run on a cleared corridor | ADOPT | `driveRun` state on `ShipState`; eligibility: faction cerberus, role cruiser or dreadnought, hull < 40 %, `subsystems.engines ≥ 0.4`, no friendly hull within 2 km of the run line, Apex special flag on, attempts remaining. | `AU_MODIFIED` |
| 40 s window (20–60 tuning), completion probability 0.25, ≤ 3 attempts per Sol scenario, kill on completion, collateral needs geometry | ADOPT | `commitmentWindow 40`, `completion 0.25` drawn **once from `sim.rng` at commitment**, `maxAttempts 3` on the simulation; interception = `destroyShip(runner)` before `endsAt`; completion = `destroyShip(target, runner)` then `destroyShip(runner)`; no area kill. `apex_legacy`: window 30, completion 0.35, 5 attempts, plus destroyers within 1.5 km of the impact die (the "upper tier"). | `AU_MODIFIED` |
| Energy bookkeeping (1.07 Tt at 0.01c, 108 Tt at 0.1c, coupling fractions) | REJECT as displayed numbers | Never shown as yields. The event caption is `BLACK FLEET DRIVE ATTACK — CAPITAL KILL CONFIRMED (AU)`; no gigaton label. | — |
| Far from Earth / habitats; losses are campaign losses | ADOPT | Eligibility adds distance ≥ 30 km from the Earth sprite centre in `earth_orbit`; the runner counts as destroyed in results. | `AU_MODIFIED` |
| Off in canon | ADOPT | `special.driveAttacks: 'off'` in canon, every non-Apex preset and the Cerberus Ascendant preset. | — |

### 2.12 Simulator process (§11, JSON `tactical_model`)

| Item | Decision | Reason |
| --- | --- | --- |
| Required state (identity, faction, hull, position, velocity, heat, barriers, damaged systems, readiness, retreat) | ADOPT (already present) | `ShipState` has all but readiness → `crewQuality` carries it. |
| Resolution order (observe → orders → move → fire tests → projectiles → damage → failures → withdrawal) | ADOPT (already the `step()` order) | No change. |
| `barrier = min(capacity, barrier + recovery·dt)` continuous recovery | ADAPT | Reaper-only mechanic M1 (section 5.2); organics keep the 3 s pause rule. |
| Recommended step 0.25 s | REJECT | Ours is 0.05 s and deterministic; faster is better for swept projectiles. |
| Analytic interception / adaptive substeps | ADOPT (already swept bounding spheres) | No change. |
| Light delay, sensor uncertainty, link loss with local autonomy | DEFER | Sensors are a subsystem already; no delay model. Backlog. |
| "Never run tens of thousands of fully connected AI comparisons" | ADOPT | Motivates the statistical distant-engagement layer (D4): far groups are counters updated by a closed-form exchange model, rendered as tracer sparks. |
| Event logs (shooter, target, range, result, cause of destruction) | ADOPT (mostly present) | Add `cause` to `ship_destroyed` (`kinetic`/`beam`/`warhead`/`drive_attack`/`torpedo`) for captions. |
| Range and travel time (12.42 s over 50,000 km) | ADOPT as codex text | Our compressed battlespace keeps flight times comparable (speeds and ranges scale together). |
| Do not render a spinal shot as a slow glowing ball | ADOPT | D11 effects brief already says tracer with hot core. |

### 2.13 Presets, victory and defeat, pitfalls, sources (§11–§13, JSON `presets`, `story_targets`)

| Item | Decision | Concrete result | Tag |
| --- | --- | --- | --- |
| Four presets (canon reference, Apex core, Apex legacy high power, sensitivity run) | ADAPT | Canon = `canon_me3` (untouched); Apex core = `prime_apex` (same id, D1); `apex_legacy` new; sensitivity run = custom timeline, not a preset. | — |
| "Do not mix Cerberus Ascendant into Prime/Apex" | ADOPT | Already tested (`tests/timelines.test.ts:56-65`). | — |
| Victory: Sol operational / strategic; defeat definition; a retreating live Reaper is unfinished work | ADOPT as text + one rule | Campaign conventional victory already requires `reaperFleetValue === 0 && reinforcementPool === 0`. Add the battle-level objective text for Apex Sol scenarios: "Break orbital control; surviving coalition strength must exceed 40 % of deployed points" (AU scenario objective). | `AU_MODIFIED` |
| Story targets (15–35 % losses, 1–3 days, weeks, months); victory probability null | ADOPT as captions labelled "story target, not a simulated output" | Results screen footnote under Apex. | `AU_MODIFIED` |
| Validation scope limits (no full battle, no forecast, no feasibility proof) | ADOPT | Reproduced verbatim in the codex "Apex simulation" entry; the honesty rule requires it. | — |
| Continuity pitfalls table (11 rows) | ADOPT as a lint checklist | `docs/apex/CONTINUITY_CHECKLIST.md` (to be written by the scene author); every Showcase caption and codex AU line is checked against it. Two rows map to mechanics: "Harbinger dies, armada powers down" → `reaperCommandVulnerability` must stay a *temporary coordination* penalty, never a shutdown; "Alpha kills every Reaper" → the slider only reduces pools. | — |
| Source register C01–C11, G01–G05 | ADAPT | Add to `LORE_REFERENCE.md` as "pack-cited sources (fan transcriptions; verify in-game)"; wiki/mirror URLs are not authority. | — |

### 2.14 Montage guide (sections 1–4, 6; 5, 7, 8 skimmed)

| Item | Decision | Concrete result |
| --- | --- | --- |
| §1 Creative direction: triumph stays expensive; Reapers stay formidable; Shepard's economy of movement; Reaper performance = tactics (rotate protection, kill the active gun platform, cover a damaged capital, abandon a damaged harvest ship, withdraw a threatened group; a wounded Reaper still kills; others continue after Harbinger) | ADOPT | D10 behaviours (section 3b AI note); Showcase pacing rule "retain brief evidence of friendly losses". Dialogue direction for Shepard/Illusive Man is text for captions only (no voice, no faces). |
| §2 Source preparation (footage folders, face references, EA fan kit) | REJECT | Out of scope and against the no-ripped-assets rule; our Showcase renders our own models. |
| §3 Master prompts | REJECT, except the "three spatial layers" rule (nearby readable ships, a few mid-distance engagements, distant drive lights) | ADOPT that rule as the composition rule of the distant-engagement layer and of every Showcase wide shot. |
| §4 Shot cards 01–15, 24 (game footage, character inserts) | REJECT for the Showcase (they depend on game footage/faces) | Their captions may be reused as AU caption text. |
| §4 Shot cards 16–23 | ADOPT as the Showcase scene *Apex: The Refuse at Sol* (D5) | 16 Hackett sees the coalition → arrival waves + caption `38,420 WARSHIPS COMMITTED TO SOL (AU)`; 17 Black Fleet joins the line → Black Fleet arrival at T+12 s into the gap beside Sword, fires on an already-engaged target; 18 Cerberus protects the Ascension → forced escort/interpose; 19 Valkyrie earns its shot → escort torpedo strike, then Nova + three heavy Thanix on a target below 50 % barrier; 20 a Reaper meets the line → camera behind a capital, it kills a foreground escort, formation holds; 21 drive attack → forced `driveRun` on a crippled heavy cruiser far from Earth, success forced; 22 Harbinger continues fighting → mission kill (weapons subsystem to 0.1, caption `HARVEST COMMAND VESSEL — MISSION KILL`), other Reapers keep fighting; 23 Shepard looks at the next target → no face: a HUD-free tactical insert with `MARK THE NEXT ONE` as caption. |
| §6 Original AU dialogue and caption bank; codex-style passage | ADOPT as AU caption/comms text (never attributed to the games); the two Sol numbers carry "(AU)" | Caption bank → `src/showcase/captions.ts`; the codex passage → Apex codex intro, labelled ALTERNATE UNIVERSE. |
| §5 Music cue plan, §7 Resolve workflow, §8 publication text | REJECT | Not our deliverable; the Record toggle (D5) is the only export feature. |

## 3. Specifications

### 3a. Presets: `prime_apex` → "Apex core" delta, and the new `apex_legacy`

Rules for both: `category: 'au'`; every screen that shows them shows the AU badge; `reaper` tech stays all-1 (test `tests/timelines.test.ts:67-72`, extend the list with `apex_legacy`); `historyChanges` keeps the phrase **"Homeworld Defence Rule"** (e2e `game.spec.ts:115`) and the name keeps **"Prime/Apex"** (e2e `:118`); `tests/saves.test.ts:34-46` literal `'Prime/Apex — Successful Refuse'` must be updated to the new name.

New `SpecialTechnology` fields (all default to the canon value in `CANON_SPECIAL`, validated in `schema.ts`, shown in the timelines editor, ranked in `comparison.ts`, reported by `reaperIntel.ts` where noted):

| Field | Type | Canon | Meaning |
| --- | --- | --- | --- |
| `hyperMassAccelerators` (kept name; UI label "Project Titan accelerators") | boolean | false | Alliance and Cerberus dreadnought spinal guns become `apex_hyper_ma` (the Titan gun). Change the substitution predicate from "every organic dreadnought" to `faction ∈ {alliance, cerberus} && role === 'dreadnought' && cls.id !== 'destiny_ascension'`. Reaper intel reports it. |
| `hadesRounds` (kept) | boolean | false | The Titan gun carries 12 HADES penetrators per mount (warhead burst after penetration), then ordinary slugs. **No longer** a faction-wide `armourBypass/barrierEfficiencyMultiplier` on every mass accelerator: those two numbers move onto the HADES round itself (`armourBypass 0.5`, `barrierEfficiencyMultiplier 0.6`) and ordinary rounds get 0 / 1. |
| `valkyrieAvailable` | boolean | false | Scenario builders may spawn `normandy_valkyrie` (named "SSV Normandy Valkyrie") in Alliance fleets; custom battle lists the class. |
| `legacyNova` | boolean | false | Valkyrie mounts `nova_legacy` in addition to the Nova Array. |
| `driveAttacks` | `'off' \| 'rare' \| 'upper'` | `'off'` | D9 event tier. |
| `fixedPlatforms` | boolean | false | Sol scenarios place `sol_defence_platform` hulls. |
| `reaperDoctrine` | `'canon' \| 'apex'` | `'canon'` | D10 behaviours (rotate protection, cover damaged capital, abandon damaged harvest ship, withdraw a threatened group). Canon keeps "never withdraw". |

Oculus drones are **not** a flag: they are canon (ME2) and launch under every preset.

**Apex core (`prime_apex`) — full rule set after the delta**

```ts
{
  id: 'prime_apex',                                   // unchanged: saves, prefs and campaign snapshots keep working
  name: 'Prime/Apex — Apex core',                     // was 'Prime/Apex — Successful Refuse'
  tagline: 'Successful Refuse: no Crucible at all. A galaxy prepared to win the war by force.',
  category: 'au',
  description: 'ALTERNATE UNIVERSE. Shepard never died; the galaxy mobilised for three years; Cerberus committed the Black Fleet; '
    + 'there is no Crucible. Project Titan fires finite HADES penetrators, the Normandy Valkyrie leads the line, and Reaper losses '
    + 'are earned in combat. Nothing here is presented as canon.',
  historyChanges: [
    'Shepard combines Paragon coalition-building with Renegade decisiveness and never dies; the two Lazarus years become preparation.',
    'Javik is recovered in 2183; Jenkins, Nihlus and Saren survive; Mordin completes an earlier cure; quarians and geth settle early.',
    'The Illusive Man is never indoctrinated; Cerberus abandons Reaper control and commits the Black Fleet (420 warships, AU value).',
    'The Treaty of Farixen is suspended by emergency accord; yards run at war tempo (38,420 coalition warships at Sol, AU value).',
    'Project Titan: heavy accelerators on Alliance and Black Fleet dreadnoughts fire HADES penetrators with a nuclear warhead fused to detonate after penetration (finite magazine).',
    'The Normandy Valkyrie, a 2,000 m Normandy-lineage command dreadnought, is available (AU LOCK).',
    'Black Fleet drive attacks are a rare specialist event; 612 fixed defence platforms guard Sol (captions; a few are simulated).',
    'Homeworld Defence Rule: Earth and Palaven can each hold without allied rescue.',
    'There is no Crucible and no Catalyst encounter; the Reapers must be defeated conventionally.',
  ],
  organic: {                       // "same machinery, faster adoption": modest, process-level bonuses (pack §5 faction modifiers)
    massAcceleratorDamage: 1.1,    // was 1.25
    massAcceleratorPenetration: 1.15, // was 1.3
    massAcceleratorRange: 1.0,
    fireRate: 1.0,                 // was 1.1 — cadence is now canon 2 s for everyone
    heatCapacity: 1.2,             // was 1.3
    kineticBarrierStrength: 1.2,   // was 1.35
    barrierRegen: 1.25,            // was 1.4
    armourStrength: 1.15,          // was 1.3
    hullIntegrity: 1.1,            // was 1.15
    speed: 1.05,                   // was 1.08
    sensors: 1.3,                  // was 1.4
    electronicWarfare: 1.2,        // was 1.3
    accuracy: 1.08,                // was 1.1
    fighterStrength: 1.2,          // was 1.3
    torpedoDamage: 1.25,           // was 1.4
    gardianEffectiveness: 1.3,     // was 1.4
    beamDamage: 1.2,               // was 1.35
    crewQuality: 1.1,              // was 1.15
  },
  reaper: CANON_TECH,              // unchanged: the Reapers keep their weapons, numbers and doctrine
  factionOverrides: {
    cerberus: { sensors: 1.3, electronicWarfare: 1.4, accuracy: 1.1 },   // was { electronicWarfare 1.6, sensors 1.6 }
    asari: { accuracy: 1.13 },         // organic 1.08 × "+10 % precision" → absolute override (overrides replace, not multiply)
    salarian: { sensors: 1.5, gardianEffectiveness: 1.55 },
    geth: { crewQuality: 1.2, barrierRegen: 1.4 },
    quarian: { barrierRegen: 1.35 },
  },
  special: {
    hyperMassAccelerators: true,     // Project Titan on Alliance + Black Fleet dreadnoughts
    hadesRounds: true,               // 12 HADES penetrators per Titan gun
    thanixAvailability: 'fleetwide',
    reaperCommandVulnerability: true, // temporary coordination penalty per capital loss (never a shutdown)
    indoctrinationDisabled: false,
    valkyrieAvailable: true,
    legacyNova: false,
    driveAttacks: 'rare',
    fixedPlatforms: true,
    reaperDoctrine: 'apex',
  },
  fleetStrength: { alliance: 1.8, turian: 1.5, asari: 1.3, salarian: 1.3, quarian: 1.2, geth: 1.2, cerberus: 1.5, reaper: 1.0 },
  strategic: {
    alliedCoordination: 0.85,        // was 0.9
    reaperCompetence: 1,
    indoctrinationEffectiveness: 0.5,
    reaperReinforcements: 1,
    conventionalVictoryPossible: true,
    crucibleAvailable: false,        // D1 — was true
    shepardAlive: true,
    shepardEffectiveness: 1.8,
    illusiveManIndoctrinated: false,
    cerberusStance: 'cooperative',
    harbingerOperational: true,
    catalystOperational: true,       // exists, never met (test pins true)
    homeworldIndependence: true,
  },
}
```

Why the organic multipliers come down: with the Reaper capital re-based for the C02 benchmark (section 5), the current preset wins the fixed-fleet reference engagement with 87–94 % survival (scratch run, seeds 7–8), which is no longer "a hard-won victory". The balance target for Apex core stays the one in `AU_RULES.md`: Alliance victory on seeds 7–9 with 7–19 ships lost including 1–3 dreadnoughts, every Reaper destroyed (`tests/battle.test.ts:61-69`). Tune the four kinetic/barrier multipliers first if the target is missed; do not touch `reaper`.

Campaign consequences (`campaign/engine.ts`): `crucible.available` becomes false under Apex, so the setup screen shows "No Crucible in this timeline" and the `crucible: 'refuse'` world state is moot; `tests/campaign.test.ts:101-125` still expects a conventional victory ≤ week 160 with reason matching `/conventional|Refuse/` — keep the reason text "…The Refuse is successful." Generalise the two `rules.id === 'prime_apex'` checks (`scenarios/index.ts:349`, `campaign/engine.ts:159`) to `rules.strategic.cerberusStance === 'cooperative' && rules.special.hyperMassAccelerators` so `apex_legacy` inherits the Black Fleet dreadnoughts. Old campaign snapshots lack the new `special` keys: `normaliseCampaign` (`campaign/depth.ts:275-284`) fills them from `CANON_SPECIAL`, and for snapshots whose `rules.id === 'prime_apex'` from the Apex core values above (the snapshot's `crucibleAvailable` is left as saved, so a campaign started with the Crucible keeps it — report this in the changelog).

**Apex legacy high power (`apex_legacy`) — new preset**

```ts
{
  id: 'apex_legacy',
  name: 'Prime/Apex — Apex legacy (high power)',
  tagline: 'Easier by design: the near-light-speed Nova and upper-tier drive attacks. Separately labelled.',
  category: 'au',
  description: 'ALTERNATE UNIVERSE, HIGH POWER. Apex core plus the earlier Apex material’s single-shot capital-killing Nova and '
    + 'more frequent Black Fleet drive attacks. Same inventories, same Reapers. Deliberately easier; not a balance reference.',
  historyChanges: [ ...all Apex core lines,
    'Legacy Nova: a 20 kg round at a tenth of light speed (≈ 2.2 Mt), 60 s cycle, twelve rounds, visible six-second charge — AU HIGH POWER.',
    'Upper-tier drive attacks: five attempts, shorter commitment, nearby destroyers caught in the impact.',
    'This preset is easier by design and is labelled as such on every screen.',
  ],
  organic: same as Apex core,
  reaper: CANON_TECH,
  factionOverrides: same as Apex core,
  special: { ...Apex core special, legacyNova: true, driveAttacks: 'upper' },
  fleetStrength: same as Apex core,
  strategic: same as Apex core,
}
```

Add `apex_legacy` to `PRESETS`, to the preset lists in `tests/timelines.test.ts:67-72` and `tests/battle.test.ts:128`, to the codex `au` keys (section 3d: share text through a helper `apexAu(text)` that returns `{ prime_apex: [...], apex_legacy: [...] }`), and to `ui/screens/comparison.ts:9` (default comparison stays `prime_apex`). The results and briefing screens print the extra badge **HIGH POWER — EASIER BY DESIGN** when `special.legacyNova` is true.

### 3b. New ship classes

All numbers below are `Sourced` values; the tag in brackets is the per-field provenance. `designProvenance` strings must say "original model" (no ripped assets).

**`reaper_oculus` — Oculus drone** (faction `reaper`, role `fighter`; canon drone, numbers `SIMULATION_ESTIMATE`)

| Field | Value |
| --- | --- |
| name / shortName | 'Oculus drone' / 'Oculus' |
| designProvenance | `canon('Oculus combat drones are canon (ME2, Collector base approach). Spherical hull with a single red lens; original model.')` |
| lengthM | `inferred(12, 'Roughly fighter-sized in ME2; not stated.')` |
| hull / armour / barriers / barrierRegen | 24 / 1 / 20 / 3 |
| maxSpeed / acceleration / turnRate | 3.6 / 1.8 / 120 |
| sensorRange / signature / ecm / crewQuality | 30 / 0.05 / 0.15 / 1.2 |
| hardpoints | `oculus_laser` ×1 forward (offset [0,0,5], facing 0) |
| pointValue | 3 |
| description | 'Fast, fragile Reaper drone launched in swarms. Its short red laser burns fighters and exposed subsystems; it is not counted among capitals or destroyers.' |
| Complements | `reaper_capital.fighterComplement = { classId: 'reaper_oculus', count: 16 }`, `harbinger` 24, `reaper_destroyer` 4. Launch/recall/rearm/point-defence code is reused unchanged (`updateCarrier`); Reaper comms `fighters_launch` line: 'Deploying Oculus.' |
| Render | instanced small craft path (`rendering/lod.ts`); red lens emissive; faction colour. |

**`normandy_valkyrie` — SSV Normandy Valkyrie** (faction `alliance`, role `dreadnought`; every numeric field `AU_MODIFIED`; only spawned when `special.valkyrieAvailable`)

| Field | Value |
| --- | --- |
| name / shortName | 'Normandy Valkyrie (AU command dreadnought)' / 'Valkyrie' |
| designProvenance | `{ value: 'Alternate-universe one-off: a 2,000 m Normandy-lineage heavy command dreadnought (AU LOCK). Not part of the trilogy. Original model.', provenance: 'AU_MODIFIED' }` |
| lengthM | 2000 (`AU_MODIFIED`, note 'AU LOCK length; all engineering values AU proposal') |
| hull / armour / barriers / barrierRegen | 22,500 / 180 / 14,800 / 128 (pack 2.5 / — / 4.0 / 0.14 DKE by the §0.2 ratio) |
| maxSpeed / acceleration / turnRate | 0.65 / 0.09 / 4.5 (mobility 0.2) |
| sensorRange / signature / ecm / crewQuality | 130 / 3.0 / 0.3 / 1.25 (EDI aboard; limited emission control, no stealth) |
| hardpoints | `nova_array` ×1 spinal (offset [0,0,900], facing 0, arc 10); `thanix_heavy` ×3 (offsets [0,-30,500], [60,10,300], [-60,10,300]; facing 0; arc 25; **separate heat per mount**); `alliance_broadside` 6+6; `gardian` ×14; `nova_legacy` ×1 spinal only when `special.legacyNova` |
| fighterComplement | none (no planetary landing, no hangar wing; shuttles are not modelled) |
| pointValue | 900 |
| description | 'AU LOCK. A 2,000 m command dreadnought built by the people who built the Normandy: long reinforced spine, buried bridge, blue drives at capital scale. Its Nova Array and three heavy Thanix channels only finish Reapers that escorts have already degraded.' |
| Kill rule (D8) | `nova_array.degradedTargetBonus = { barrierFractionBelow: 0.5, multiplier: 1.5 }` applied in `applyHit` when the target's `barriers / maxBarriers < 0.5` at impact. Scenes may force a kill with `destroyShip`. |
| Named vessel | `NAMES.normandy_valkyrie = ['SSV Normandy Valkyrie']`; the Thanix frigate keeps 'SSV Normandy SR-2'. Under Apex the Sword Fleet composition spawns one Valkyrie as a `fixedClasses` entry. |

**`cerberus_dreadnought` — reuse, re-based** (role `dreadnought`, `AU_MODIFIED`): length 1,000 m; barriers 6,300 / hull 10,800 / armour 135 / regen 69; speed 0.65 / 0.09 / 4.5; sensors 110; signature 1.9; ecm 0.3; crew 1.1; hardpoints `alliance_dn_main` ×1 (→ Titan under Apex), `thanix_heavy` ×1 dorsal (arc 40), `alliance_broadside` 4+4, `gardian` ×10; pointValue 360; name 'Black Fleet dreadnought (AU)'. Named vessels: 'Prometheus', 'Eos', 'Hyperion' (original names; the first already exists in `NAMES`).

**`cerberus_heavy_cruiser` — new, existing role** (role `cruiser`, `AU_MODIFIED`): values in table 2.3. It is the hull that performs drive attacks in the Showcase and the "interposes before the Ascension" beat. Render: `cerberus` cruiser template scaled to 650 m with a dorsal Thanix housing; silhouette sheet `docs/design/cerberus_heavy_cruiser.md`.

**`sol_defence_platform` — fixed heavy defence platform** (faction `alliance`, role `dreadnought`, `AU_MODIFIED`; only spawned when `special.fixedPlatforms`)

| Field | Value |
| --- | --- |
| name / shortName | 'Sol defence platform (AU)' / 'Platform' |
| lengthM | 1200 |
| hull / armour / barriers / barrierRegen | 36,000 / 220 / 13,000 / 73 |
| maxSpeed / acceleration / turnRate | 0 / 0 / 2 (**guard**: `ai.ts:168` computes `anchorSpeed` from the slowest ship — a platform fleet must take `initialOrder.order = 'defend_position'` and the AI must skip movement when `maxSpeed === 0`; formations must place platforms at their spawn slot) |
| sensorRange / signature / ecm / crewQuality | 140 / 3.4 / 0.2 / 1.1 |
| hardpoints | `platform_gun` ×2 (offsets [±120, 0, 200], facing 0, arc 60 — its own weapon id so the Titan substitution predicate, which requires `arc ≤ 20`, never touches it); `gardian` ×12 |
| pointValue | 700 |
| description | 'AU scenario asset: one of the 612 fixed heavy platforms of the Sol network (caption value). Two dreadnought-class gun channels, a power plant and heat infrastructure. It cannot chase anything.' |

Platforms appear only in Apex Sol scenarios (2–6 per scenario) and in custom battle (listed under Alliance with the AU badge).

**Not added: generic `corvette` and `heavy_cruiser` roles.** Reasons: (1) `ShipRole` is a closed union consumed by the AI threat tables, formations, render templates, LOD instancing, the custom-battle count grid, the campaign production tables and the e2e selectors — a new role is a cross-cutting change with no gameplay payoff while battles are capped at 70 hulls a side; (2) corvettes (85 m, 0.035 DKE) would be rendered swarms competing with fighters and Oculi for the instancing budget and would die to a single frigate round; (3) the pack's heavy cruiser differs from a cruiser only in numbers, which a class with `role: 'cruiser'` already expresses (done above for Cerberus). Corvettes and heavy cruisers therefore exist as **caption counts** and inside the statistical distant-engagement layer (D4), where class mix is a parameter, not a hull. Revisit if the hull cap rises.

**Reaper AI under `reaperDoctrine: 'apex'` (D10)** — all decisions drawn from `sim.rng`, evaluated on the existing 0.8 s decision interval:
1. *Rotate protection*: a capital whose barriers are below 35 % swaps formation slot with the healthiest capital (anchor-relative slot exchange, no teleport).
2. *Kill the active gun platform*: target weight +40 % for the enemy ship with the highest damage dealt in the last 10 s (needs a rolling `recentDamage` counter on `ShipState.stats`).
3. *Move destroyers to cover a damaged capital*: when a capital's hull < 50 %, the two nearest destroyers take an `escort` order on it.
4. *Abandon a damaged harvest ship*: not applicable (no transports); the equivalent is "a capital below 20 % hull stops protecting others".
5. *Withdraw a threatened group*: a Reaper fleet whose remaining point value is < 30 % of its start **and** that has no capital above 50 % hull takes `retreat` — Apex only; canon keeps `withdrawThreshold 0`. A retreating live Reaper is scored as "unfinished work" (objective not completed).
6. *A wounded Reaper still kills*; *others continue after Harbinger falls*: already true (no shutdown exists); add a regression test that Harbinger's death changes no other Reaper's weapons or doctrine.

### 3c. New weapons

| Id | kind / damageType | damage | cooldown | range | speed | acc | pen | heat | magazine | arcs / flags | Notes | Tag |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `apex_hyper_ma` → **Titan gun** ('Project Titan heavy accelerator (HADES penetrators)') | mass_accelerator / kinetic | 1,235 | 6.0 | 48 | 44 | 0.76 | 1.1 | 24 | `specialAmmo: 12` HADES, then unlimited slugs | arc 12, antiCapital | Keeps the id (tests, saves, comparison text). HADES round: `armourBypass 0.5`, `barrierEfficiencyMultiplier 0.6`, `warhead: { damage: 2260, type: 'warhead', barrierEfficiencyMultiplier: 0, armourBypass: 1, subsystemOutage: { which: 'weapons' \| 'engines' (rng), drop: 0.3, seconds: 8 } }` applied only when `out.hullDamage > 0` (a penetrating hit); emits `hades_detonation`. Ordinary slugs from the same gun: no bypass, no warhead. Text everywhere: "penetrator with a nuclear warhead", never "nuclear mass rounds". | `AU_MODIFIED` |
| `nova_array` | mass_accelerator / kinetic | 2,780 | 6.0 | 52 | 48 | 0.8 | 1.2 | 30 | 40 | arc 10, antiCapital, `degradedTargetBonus {0.5, ×1.5}` | Valkyrie only. | `AU_MODIFIED` |
| `nova_legacy` | mass_accelerator / kinetic | 30,000 | 60.0 | 56 | 400 | 0.7 | 1.5 | 90 | 12 | arc 8, antiCapital, `chargeTime 6` (visible charge; the mount cannot fire or turn during charge; emits `weapon_charging`) | `apex_legacy` only. One hit kills an intact capital (7,000 + 16,000 + armour); misses are expensive. | `AU_MODIFIED` (high power) |
| `thanix_heavy` | thanix / thanix_stream | 625 per s × 1.6 s beam = 1,000 | 5.0 | 34 | ∞ | 0.8 | 0.95 | 30 **per mount** | — | arc 25, antiCapital | Per-mount heat: `WeaponState.heat`, lockout at 100, cooling 8 %/s like the ship. Valkyrie ×3, Black Fleet DN ×1, heavy cruiser ×1. | `AU_MODIFIED` (mount) |
| `javelin_rack` | disruptor_torpedo / warhead | 325 per torpedo, salvo of 4 (`salvo: 4`) | 20.0 | 16 | 2.4 | 0.9 | 0.9 | 6 | 4 salvos | arc 150, antiCapital, `missileHp 14`, interceptable | Cerberus frigates, heavy cruiser, Thanix frigate under Apex. "Ship-mounted Javelin, not the infantry rifle." | values `SIMULATION_ESTIMATE`, existence `CANON_INFERRED` |
| `oculus_laser` | gardian / laser | 9 | 0.3 | 4 | ∞ | 0.5 | 0.3 | 1 | — | arc 30 forward, antiSmall, `burst {shots 12, recovery 2}` | Prefers fighters, then the nearest hull's subsystems (severity rule in `applyDamage` already rolls subsystems). | `SIMULATION_ESTIMATE` |
| `platform_gun` | mass_accelerator / kinetic | 1,000 | 2.0 | 44 | 30 | 0.74 | 0.85 | 18 | — | arc 60, antiCapital | "DN-equivalent channel" on the platform; never substituted. | `AU_MODIFIED` |

`WeaponDef` additions: `specialAmmo?: number` (special rounds before falling back), `warhead?: { damage, subsystemOutage }`, `degradedTargetBonus?`, `chargeTime?`, `salvo?`, `perMountHeat?: boolean`. All optional; canon weapons never set them, so `tests/timelines.test.ts:29-43` (canon effective = catalogue) stays valid.

Effects (D11): Titan/HADES = ordinary tracer, then white flash, shadow pulse, ring shock and internal venting; Nova = longer, brighter tracer with a lateral vent; legacy Nova = six-second charge glow at the bow, then an instantaneous streak; heavy Thanix = thicker orange-white stream; Javelin = four-torpedo fan; Oculus = short red laser; drive attack = blue-white drive flare then one abrupt flash with fragments along the collision vector (D9).

### 3d. Codex entries to add or update (all AU text keyed to both `prime_apex` and `apex_legacy` through a shared helper)

Every AU paragraph starts with the literal prefix **"ALTERNATE UNIVERSE (Apex):"**; `apex_legacy` paragraphs start with **"ALTERNATE UNIVERSE (Apex legacy, high power):"**. Canon paragraphs never mention Apex objects.

| Entry | Change |
| --- | --- |
| `alliance` | AU: replace the hyper-mass sentence with Project Titan / HADES (finite), Valkyrie, 12,800 Alliance warships at Sol "(AU value)". |
| `reapers` | canon: add "Oculus combat drones (ME2) are launched from capitals and destroyers." estimate: "Reaper barriers in the simulation recover continuously under fire; two dreadnoughts cannot overwhelm a capital ship, three strain it, four can destroy it — tuned to the codex concentration-of-fire benchmark (verify entry)". AU: Apex doctrine behaviours; "losing Harbinger never switches the others off". |
| `cerberus` | estimate: Black Fleet dreadnought and heavy cruiser are AU-only. AU: redemption summary (destroy-aligned, Miranda's authority, EDI a person, interposition beat), 420-ship Black Fleet "(AU value)", drive attacks "rare specialist event, three attempts". |
| `turian`, `asari`, `salarian`, `geth`, `quarian` | AU: the process-level modifiers of table 2.6 in one sentence each; quarian/geth early peace. |
| `ship_dreadnought` | canon: cadence "every two seconds" already there; estimate: hull 9,000 / armour 130 / barriers 5,200 unchanged; **state the 2 s cadence is now used**. AU: Titan gun on Alliance dreadnoughts, 12 HADES rounds, then ordinary slugs. |
| `ship_reaper_capital` | estimate: **"hull 16,000 / armour 320 / barriers 7,000 recovering 1,100 per second even under fire"**; "each beam burst ≈ 206 kt-equivalent, inside the codex 132–454 kt band". AU: Titan/HADES and Valkyrie make it killable; "it remains the most dangerous unit on the field". |
| `ship_reaper_destroyer` | estimate: **"hull 600 / armour 160 / barriers 800; a 160 m hull is hard to hit — a lone cruiser kills one in about a quarter of engagements and dies in the rest; two cruisers or a dreadnought round settle it"**. |
| `ship_normandy` | unchanged; add "The Valkyrie is a different, AU ship" cross-reference under Apex. |
| **new** `ship_valkyrie` (Ships) | canon: ['This ship does not exist in the Mass Effect trilogy.'] AU: full D8 sheet (2,000 m AU LOCK, 18 Mt, crew 3,200, Nova Array 25 kg at 6,000 km/s ≈ 107.6 kt per round, three heavy Thanix channels, segmented protection, EDI aboard, no landing, kill rule). Legacy block: near-c Nova. |
| **new** `ship_black_fleet` (Ships) | canon: ['Cerberus fields no dreadnoughts in the trilogy.'] AU: Black Fleet dreadnought and heavy cruiser sheets; charcoal/white/orange identification; drive attack eligibility. |
| **new** `ship_oculus` (Ships) | canon: Oculus in ME2; estimate: our numbers; "original model". |
| **new** `ship_platform` (Ships) | canon: ['Fixed anti-Reaper platforms of this kind are not described in the trilogy.'] AU: 612 at Sol (caption), two DN-class channels, cannot manoeuvre. |
| `hades` → retitle 'Project Titan and HADES penetrators (AU)' | canon: ['These weapons do not exist in the Mass Effect trilogy.'] AU: 25 kg at 4,000 km/s ≈ 47.8 kt kinetic (≈ 1.23 DKE), HADES = dense penetrator with a nuclear warhead fused to detonate after penetration, finite magazine, "an intercepted, deflected or non-penetrating round gets no internal effect"; "not a canonical superweapon". Remove "~3× canon slug energy". |
| **new** `nova` (Weapons) | AU core and legacy blocks; the legacy block says canon does not establish that a 2 km ship can fire, power or survive it. |
| `thanix` | canon: add "five-second firing cycle (verify)" once claim #11 is checked; AU: heavy Thanix channel is an AU mount of canon technology. |
| **new** `javelin` (Weapons) | canon: ship-mounted Javelin disruptor torpedo system exists (`CANON_INFERRED`, verify); estimate: salvo numbers. |
| `kinetic_barriers` | estimate: add the Reaper continuous-recovery sentence; AU: HADES bursts are applied inside the barrier. |
| **new** `apex_continuity` (Reaper War) | AU only: the locked rules of §1 (Shepard, Javik, Saren, Virmire, Mordin, Rannoch, Illusive Man, Farixen, Bahak), "no Crucible". The pack's codex-style passage (montage §6) as the closing paragraph. |
| **new** `apex_sol_order_of_battle` (Reaper War) | AU only: the nine-row table and the Reaper commitment table as text, every number tagged "AU scenario value; the simulation fields compressed stand-ins (≤ 70 hulls a side)". |
| **new** `apex_drive_attack` (Doctrine) | AU only: D9 rules; "an invented specialist capability; no yield number is shown". |
| `doctrine_reaper` | AU: the five D10 behaviours; canon doctrine text unchanged. |
| `crucible` | AU `prime_apex`: replace "Shepard rejects the Catalyst's options" with "there is no Crucible in this continuity; the war is decided by the fleets". |
| `sim_model` | estimate: add "Reaper barriers recover continuously; organic barriers resume regeneration three seconds after the last hit"; "Showcase scenes may force events and say so on screen". |
| **new** `apex_simulation_limits` (Simulation) | Reproduce the pack's validation limits verbatim: no full fleet battle, no victory probability, no industrial feasibility proof; story targets are not outputs. |

### 3e. Scale-caption data (D13) — `src/data/apexScale.ts`

```ts
export interface ScaleFigure { value: number; label: string; provenance: 'AU_MODIFIED'; note: string }
export const APEX_SCALE = {
  coalition: {
    mobileWarships: 38420, fixedPlatforms: 612, heavyMobileCombatants: 1287, embarkedCraftNominal: 25536,
    byCommand: [ // [dreadnoughts, carriers, heavyCruisers, cruisers, frigates, corvettes, warships]
      { id: 'alliance', name: 'Systems Alliance', counts: [48, 144, 240, 1360, 7008, 4000], warships: 12800 },
      { id: 'turian', name: 'Turian Hierarchy', counts: [120, 80, 280, 920, 4000, 1800], warships: 7200 },
      { id: 'asari', name: 'Asari commands', counts: [60, 40, 120, 680, 2600, 1400], warships: 4900 },
      { id: 'salarian', name: 'Salarian Union', counts: [32, 80, 64, 424, 1800, 1200], warships: 3600 },
      { id: 'quarian_geth', name: 'Quarian and geth joint command', counts: [48, 96, 110, 546, 2000, 1000], warships: 3800 },
      { id: 'krogan', name: 'Krogan assault and escort command', counts: [0, 40, 20, 180, 1200, 960], warships: 2400 },
      { id: 'batarian', name: 'Batarian survivor commands', counts: [20, 20, 50, 310, 1000, 500], warships: 1900 },
      { id: 'other', name: 'Other coalition members', counts: [7, 20, 30, 243, 600, 500], warships: 1400 },
      { id: 'cerberus', name: 'Cerberus Black Fleet', counts: [12, 12, 26, 70, 200, 100], warships: 420 },
    ],
    classTotals: [347, 532, 940, 4733, 20408, 11460],
    alliance: { allHulls: 15292, warships: 13292, support: 2000, committedToSol: 12800, elsewhere: 492, administrativeFleets: 16 },
  },
  reaper: {
    initial: { capital: 2000, destroyer: 40000, transport: 8000, processor: 3000 },   // 53,000
    alphaLossFraction: 0.25,
    postAlpha: { capital: 1500, destroyer: 30000, transport: 6000, processor: 2250 }, // 39,750
    regionalLossesBeforeSol: { capital: 420, destroyer: 8500, transport: 500, processor: 200 },
    committedToSol: { capital: 480, destroyer: 12000, transport: 1800, processor: 750 }, // 12,480 combat + 2,550
    activeElsewhere: { capital: 600, destroyer: 9500, transport: 3700, processor: 1300 },
  },
  storyTargets: { coalitionLossFraction: [0.15, 0.35], breakOrbitalControlDays: [1, 3], liberation: 'weeks', pursuit: 'months' },
  provenance: 'AU_MODIFIED' as const,
  note: 'Apex scenario values from the user-supplied reference pack. Captions and strategic counters only; never simulated hulls. Not canon.',
} as const;
```

Rules: (1) a unit test re-adds every row and column (rows → 38,420; columns → class totals; Reaper initial − Alpha − regional − elsewhere = Sol commitment); (2) captions render as e.g. `38,420 WARSHIPS COMMITTED TO SOL · AU SCENARIO VALUE`; (3) the strategic counter in the Apex Sol scenarios shows `simulated hulls: N of 38,420 (compressed)`; (4) the distant-engagement layer draws its far-group counts from these figures scaled by the pack's class ratios, with a caption that the groups are statistical; (5) canon scenarios never reference `APEX_SCALE`; non-human "carriers" are labelled "carriers / hangar ships (AU)" because the codex says humans alone field carriers.

### 3f. Readiness distribution → `crewQuality` technology override

Pack rule: 25 % of mobile hulls veteran (weight 1.0), 45 % regular (0.85), 30 % reserve/conversion (0.60); it changes hit probability, execution and recovery, not yields. Our `crewQuality` already enters `hitProbability` as `0.75 + 0.3·crew` and the AI decision quality, so the mapping is:

- `FleetSpec.readiness?: 'veteran' | 'regular' | 'reserve'` → `techOverride.crewQuality = (techOverride.crewQuality ?? rules.organic.crewQuality) × weight`, weights `{ veteran: 1.0, regular: 0.85, reserve: 0.6 }` (`SIMULATION_ESTIMATE`). Because `techFor` overrides *replace* the organic value, the builder must multiply the preset's `crewQuality` in, as written.
- Assignment is deterministic: the scenario builder walks its fleets in order and assigns tiers from a seeded `Rng(seed, 'readiness')` so that the cumulative shares approach 25/45/30 by **ship count**; named Apex compositions carry fixed tiers (pack `operational_readiness`): Alliance Sword 0.90 → veteran; Hierarchy 0.90 → veteran; Republics 0.88 → regular; Union 0.88 → regular; geth 0.97 → veteran; quarian 0.88 → regular; Black Fleet 0.94 → veteran; krogan/batarian/other commands → reserve (caption-only fleets in any case); Valkyrie 0.96 → veteran; platforms 0.93 → veteran; Reapers 0.99 → not applied (their `crewQuality` is the class value × `reaperCompetence`).
- Scope: Apex Sol scenarios, Apex custom presets and the AU campaign (`buildEngagement` already sets `crewQuality: 0.7 + 0.3·readiness` — keep that for campaign fleets and do not stack the tier on top). Canon scenarios and the reference engagement never set `readiness`, so the balance tests are unaffected.
- A "sensitivity" custom-timeline field `readinessMultiplier` (0.75 / 1.0 / 1.1, pack axis) scales the three weights; it lives on `special` as `readinessScale: number` (canon 1), clamped [0.5, 1.5] in the schema.

## 5. Canon calibration (D3) — the only canon-side change, and it is canon-anchored

### 5.1 Why the current numbers fail the benchmark (measured)

Scratch run with the shipped catalogue (`alliance_dn_main` 1000 / 4.0 s; `reaper_capital` 42,000 / 32,000 / regen 240 after 3 s; `reaper_destroyer` 6,500 / 3,200):

| Trial (seeds 1–3, canon rules, deep space) | Result |
| --- | --- |
| 2 DN vs 1 capital, no return fire | capital **destroyed** in 2 of 3 runs at ≈ 230 s (barriers down at ≈ 145 s) — violates "two cannot overwhelm" |
| 3 DN / 4 DN, no return fire | destroyed at ≈ 170 s / ≈ 135 s |
| 4 DN with return fire | capital never killed (min barrier 10–36 %), all four dreadnoughts lost |
| 1 cruiser vs 1 destroyer, 20 seeds | cruiser wins **0** |

The cause is structural: our barriers only regenerate 3 s after the last hit, so *any* sustained fire eventually wins; the Reaper's "resistance" is pure capacity (42,000) with no recovery under load. The codex benchmark needs recovery under load.

### 5.2 Mechanic M1 — Reaper barriers recover under fire (`SIMULATION_ESTIMATE`, canon-anchored)

Add `barrierRegenUnderFire: number` (0–1) to `ShipClassDef` (default 0 → today's behaviour). In `updateShip` (`battle.ts:444-446`):

```
if (barriers < max) {
  if (time - lastHitAt > 3) barriers += barrierRegen * dt;               // existing rule
  else if (cls.barrierRegenUnderFire > 0) barriers += barrierRegen * cls.barrierRegenUnderFire * dt;
}
```

`reaper_capital` and `harbinger` get 1.0; every other class 0 (destroyers included — the cruiser duel needs the pause rule). Deterministic, no RNG, replay-safe. Anchors: "Sovereign's barriers withstood the Citadel fleet until Saren's death" (`LORE_REFERENCE.md`, `CANON_CONFIRMED`) and the concentration-of-fire benchmark (`CANON_INFERRED`, section 1 #9). The pack's `recovery_requires_projectors` rule is deferred (no projector subsystem); regen already stops when the ship dies.

### 5.3 Values (canon catalogue)

| Class / weapon | Field | Now | **New** | Anchor |
| --- | --- | --- | --- | --- |
| `alliance_dn_main`, `turian_dn_main`, `asari_dn_main`, `salarian_dn_main`, `geth_dn_main` | cooldown | 4.0 / 3.8 / 4.0 / 3.8 / 3.8 | **2.0** | codex: one round every two seconds (`CANON_CONFIRMED`) |
| `quarian_heavy_main` | cooldown | 4.2 | 3.0 | converted hull, not a dreadnought (`SIMULATION_ESTIMATE`) |
| `ascension_main` | cooldown | 4.5 | 4.0 | unique gun (`SIMULATION_ESTIMATE`) |
| `reaper_capital` | barriers / hull / armour / barrierRegen / regenUnderFire | 42,000 / 32,000 / 320 / 240 / — | **7,000 / 16,000 / 320 / 1,100 / 1.0** | benchmark (section 5.4) |
| `harbinger` | same | 58,000 / 44,000 / 380 / 300 / — | **10,500 / 24,000 / 380 / 1,100 / 1.0** | 1.5× capital (pack SIM boss, ours already) |
| `reaper_destroyer` | barriers / hull / armour / barrierRegen | 6,500 / 3,200 / 160 / 80 | **800 / 600 / 160 / 40** | "a cruiser can kill one if it survives into effective range" |
| `reaper_capital_beam`, `reaper_destroyer_beam` | all | unchanged | unchanged | one capital burst ≈ 206 kt-equivalent, inside 132–454 kt |

Hull descriptions and codex strings quoting 42,000 / 32,000 and 6,500 / 3,200 change accordingly (section 3d). The unit in `AU_RULES.md` §Reference balance is re-measured after implementation.

### 5.4 Measured behaviour of the new values (scratch run, M1 emulated between steps)

| Trial | 2 DN | 3 DN | 4 DN |
| --- | --- | --- | --- |
| No return fire, stand-off 0.85 (AI default), seeds 1–5 | never; barrier never below **72 %** | never killed in 240 s; barrier driven to 1 % and held there (growing load) | killed **5/5** at 84–100 s |
| No return fire, stand-off 0.5 | never (72 %) | killed 1/5 (157 s) | killed 5/5 at 80–95 s |
| With return fire (two beams), either range | never; both DN lost | never; three DN lost; min barrier 32 % | **never; all four DN lost**; min barrier 1 % |
| Analytic all-hit synchronised volleys (the pack's isolated trial, no misses) | 1,000 pts/s < 1,100 regen: holds at ≥ 71 % | net 400 pts/s: barrier collapses at 17.5 s, hull breached, kill ≈ 30 s | net 900 pts/s: collapse at 7.8 s, kill ≈ 17 s |

| Macro check (fixed fleets) | Result |
| --- | --- |
| `alliance_fleet_engagement`, canon, seeds 7 / 8 / 9 | Reaper victory ×3, **2 capitals lost each**, 10 of 12 Reapers destroyed (eight destroyers die to the fleet), Alliance survival 7–10 % → `tests/battle.test.ts:51-59` thresholds (`reaperCapitalLost < 3`, survival < 30 %) still hold |
| `alliance_fleet_engagement`, current `prime_apex`, seeds 7 / 8 | Alliance victory, 12 / 12 Reapers, only 11–13 of 56 lost (87–94 % survival) → Apex core multipliers come down (section 3a) |
| `battle_of_earth`, canon, seed 42 | Reaper victory, 71–72 kills, every event type still fires |
| 1 cruiser vs 1 destroyer, 20 seeds | cruiser wins **5 / 20** (25 %), mean duel 91 s; 2 cruisers win 10 / 10; 4 frigates win 1 / 10 |
| Alternatives rejected | capital 6,000 / 14,000 flipped canon seed 9 to an Alliance victory; destroyer 500 / 400 pushed canon capital losses to 3 (test limit); destroyer 1,400+ keeps the cruiser at 0 / 20 |

Reading: "two cannot overwhelm" is exact; "three impose growing load" is literal (barrier pinned near zero, hull nibbled, no kill at stand-off); "four destroy it" holds in the isolated trial but **not against return fire in a bare duel** — the capital's two beams kill a dreadnought every ≈ 11 s, so the four die before the hull goes. That satisfies the lead's "four must not automatically survive" in the strongest form; if the lead wants four to *win* a duel with return fire, the lever is Reaper beam lethality (one of the two beams, or a 9 s cadence), **not** the capital's pools — lowering the pools flips canon fleet battles (6,000 / 14,000 row above). Flag for the lead; default is the values above.

### 5.5 Unit tests to add (Vitest; all deterministic)

1. `calibration.test.ts › isolated barrier trial`: a pure helper `barrierTrial(nDn, capitalStats, seconds)` that applies `applyDamage` with full hits in synchronised 2 s volleys and the M1 recovery formula each `SIM_DT`; asserts 2 DN → barrier never below 50 % in 120 s; 3 DN → barrier collapses later than 2× the 4-DN collapse time and the capital is not destroyed before 25 s; 4 DN → destroyed within 25 s; `destroyedAt(4) < 0.7 × destroyedAt(3)`.
2. `calibration.test.ts › return fire`: custom battle 4 `alliance_dreadnought` vs 1 `reaper_capital`, seeds 1–5, canon: capital never destroyed before any dreadnought is lost; at least one dreadnought lost in every seed; 2 DN never collapse the barrier.
3. `calibration.test.ts › cruiser vs destroyer`: 20 seeds, canon: cruiser wins between 3 and 10 of 20 (credible path, credible death); 2 cruisers win ≥ 8 of 10.
4. `calibration.test.ts › cadence`: every organic dreadnought spinal gun has `cooldown === 2.0` except `ascension_main` and `quarian_heavy_main`.
5. `battle.test.ts` canon reference test: unchanged thresholds (verified above); add seed 9.
6. `timelines.test.ts`: `barrierRegenUnderFire` is 0 for every non-Reaper class; canon effective stats still equal catalogue values.
7. `damage.test.ts`: existing HADES test moves to the Titan gun: `applyRulesToWeapon(alliance_dn_main, 'alliance', alliance_dreadnought, PRIME_APEX)` → id `apex_hyper_ma`, special ammo 12, warhead present; `alliance_broadside` under Apex has `armourBypass 0` (the faction-wide bypass is gone).

### 5.6 Determinism and honesty notes

M1, the volley window offsets, the HADES subsystem choice, the drive-attack roll, the Oculus launch timing and the readiness assignment all draw from `sim.rng` (or are pure). No `Math.random` enters `src/simulation`. The render-side cinematic director may keep its own `Rng('fx')`. Any screen that shows Apex numbers shows the AU badge; the results footnote under Apex reads "story targets are not simulated outputs".

## 6. Risks, limitations and open questions

- **Claim verification.** Items 4, 8, 9, 11, 20, 22 of section 1 are `CANON_INFERRED` until someone checks the in-game codex. The calibration does not depend on #9 being verbatim (it also satisfies the anchored Sovereign statement), but the codex wording we print must not claim more than we checked.
- **Four-dreadnought duel with return fire** is not won by the four (section 5.4). Lead decision needed only if the duel itself must be winnable.
- **Apex core retune** is mandatory after the Reaper re-base: with current multipliers the AU is too easy; with the section 3a multipliers it must be re-measured against `AU_RULES.md` (7–19 ships lost incl. 1–3 DN). Campaign: `prime_apex` seed 5 must still win conventionally ≤ week 160 (`tests/campaign.test.ts:101-125`); if the smaller multipliers make it miss, raise `fleetStrength` (numbers, which is the pack's own premise) before raising tech.
- **Snapshot migration.** Saved campaigns embed `rules`; `normaliseCampaign` must add the new `special` keys and must not rename ids. A campaign saved with the Crucible under the old Prime/Apex keeps it (saved value wins); say so in the changelog.
- **Test literals to update.** `tests/saves.test.ts:34-46` (preset name), codex strings with old hull numbers, `tests/battle.test.ts:128` and `tests/timelines.test.ts:67-72` preset lists (+ `apex_legacy`), comparison explanation keeps "Hyper-mass accelerators" wording or the e2e/`battle.test.ts:206` expectations change together.
- **Platforms with `maxSpeed 0`** need the AI guard noted in 3b; otherwise `anchorSpeed 0` is harmless but formations may try to slide them.
- **Per-mount heat** (Valkyrie channels) and `specialAmmo` are new `WeaponState` fields; the HUD readiness strip must show "HADES 12" and three channel bars.
- **Non-human carriers** in the pack's roster contradict the anchored codex statement; captions say "carriers / hangar ships (AU)".
- **Scope.** Transports, processors, support ships, corvettes, generic heavy cruisers, Kwunu, Collector cruiser, SR-1 survival variant, light delay, stealth-heat link and projector subsystems are deferred, not stubbed.
- **Pack sections.** The montage guide has eight sections; "9 and 12" were read as Fleet Reference §9 and §12 (stated in the header).

<!-- END -->
