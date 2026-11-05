# Lore research: space-combat ranges, speeds and tempo

Stage S (pacing plan, brief §19.2), research input for `docs/apex/PACING_PLAN.md`. 4 November 2026. Read at `8ff0b11` (the integration head after CORE's chunk-4 fix; that commit changes no range or speed, only the Reaper capital beam cadence 6.4 → 6.2 s).

Scope: every statement about combat ranges, ship speeds and accelerations, projectile velocities, engagement durations and tactics in the repository's lore documents and reference packs, with the source each document cites; then what they imply for battle geometry and what they leave unknown. Engine measurements belong to the sibling file `engine-audit.md`; catalogue values appear here only for comparison.

## 0. Findings in brief

1. **One canon kinematic number.** The repository records exactly one canon number for space-combat kinematics: the dreadnought round, 20 kg at 4,025 km/s, one round every two seconds (`CANON_CONFIRMED`, ME1 codex *Dreadnought*). That is 1.34 % of c by arithmetic; no document records a percentage-of-c wording. Every other canon statement is qualitative: the Thanix and the Reaper weapon fire molten-metal streams "at a fraction of light speed"; disruptor torpedoes are slow so that they pass kinetic barriers; GARDIAN are heat-limited infrared point-defence lasers; carriers' fighters strike with torpedoes and rearm at the carrier.
2. **No canon range, speed, acceleration, sensor range or battle duration.** The pack's canon layer keeps every hull's sublight speed, acceleration and turn rate `null` and labels every weapon range "SIM firing envelopes, not canon maximum projectile travel distances". Its one cited source for ranges, C05 (ME1 codex *Space Combat: General Tactics*), is summarised ("a layered engagement rather than one fixed range for all ships") but not transcribed: no figure from it exists in the repository. No document uses the term "knife fight".
3. **Thousands of kilometres for capital exchanges: supported by inference, not by a canon number.** (a) The canon round travels 8,050 km per firing cycle and needs 2.5 s to cross 10,000 km; such a gun is a long-range weapon. (b) The repository has always described its battlespace as compressed from "tens of thousands" of km (`LORE_REFERENCE.md`, `weapons.ts`), citing nothing. (c) The pack's SIM envelopes put the dreadnought spinal gun at 10,000–80,000 km and the Reaper capital main gun at 5,000–150,000 km. (d) The owner asks for "engagements across thousands of kilometres where appropriate" (brief §19.2), citing no entry. For the plan: the direction is `CANON_INFERRED`, every number `SIMULATION_ESTIMATE`.
4. **Shorter ranges are anchored by mechanism, not by numbers.** Slow torpedoes (canon) make torpedo strikes short-range and interceptable; GARDIAN (canon, heat-limited) is point defence; the cruiser that kills a Reaper destroyer must first "survive into effective range" (C02, `CANON_INFERRED`); a silent Normandy stays visible "to close-range active sensors" (canon paraphrase). The pack puts torpedoes, Javelin racks and GARDIAN at ≤ 10 km, the Oculus at close action (≤ 100 km), frigate guns at 100–8,000 km and Thanix strike mounts at 100–20,000 km, all SIM.
5. **The layers span orders of magnitude; one scale factor cannot open them.** In the pack, capital-gun range to point-defence range is 1,000–8,000 : 1 (up to 15,000 : 1 for the Reaper main gun); in the catalogue it is 7 : 1 (dreadnought 42 against GARDIAN 6 nominal km). The `BATTLESPACE_SCALE` at which the catalogue's dreadnought round flies at the canon 4,025 km/s (S = 134) gives a 5,635 km dreadnought range, but puts GARDIAN at 805 km and torpedoes at 2,415 km.
6. **Time of flight is the one time scale the lore fixes.** At the canon velocity the round needs 2.5–19.9 s across the pack's dreadnought envelope, so 1.2–9.9 firing cycles are in flight per gun; the catalogue's dreadnought round needs 1.4 s to its maximum range (0.7 cycles), whatever the scale. Over 10,000–80,000 km a target leaves a predicted intercept with manoeuvres of a fraction of a g to tens of g, which is the pack's point that "the practical limit is getting a useful firing solution".
7. **Speeds and battle length are open.** No lore value exists; any closing speed is `SIMULATION_ESTIMATE`. The hints point long: the IES runs silent "for hours" (canon paraphrase), and the pack's AU story targets take 1–3 days to break orbital control at Sol. At the catalogue's nominal dreadnought speed (0.65 km/s) a 10,000 km approach takes 4.3 h.

## 1. Sources and labels

Read in full: `LORE_REFERENCE.md`; `docs/apex/reference/` (`APEX_Fleet_Reference.md`, `apex_simulator_data.json`, `validation_results.json`, `README.md`; `APEX_Montage_Prompts.md` §1, §3, cards 16–23 and §6, the rest searched); `docs/apex/PACK_ADOPTION.md` §0–§2; the in-app codex `src/codex/entries.ts`; the provenance notes in `src/data/weapons.ts`, `ships.ts` and `factions.ts`; `docs/design/SCALE_REFERENCE.md`. Searched for audit decisions and owner requirements: `docs/V2_CINEMATIC_BRIEF.md` (§2, §3, §8, §13, §15, §17, §19), `docs/apex/INTEGRATION_NOTES.md`, `ADOPTION_PLAN.md`, `CODE_MAP.md` (§8.1, appendix A), `CORE_PROGRESS.md` (T10, chunk 4), `CINEMATIC_DESIGN.md`, `BALANCE_AUDIT.md`, `CALIBRATION_REPORT.md`, `CUSTOM_BATTLE_DESIGN.md`, `WORK_BREAKDOWN.md`, and the root `README.md`, `ARCHITECTURE.md`, `AU_RULES.md`, `ROADMAP.md`, `KNOWN_ISSUES.md`, `CHANGELOG.md`. Nothing outside the repository was consulted, so no codex text appears here beyond what these documents record.

Status of the pack: it is ChatGPT-generated reference text supplied by the owner. `PACK_ADOPTION.md` (status line) and `CODE_MAP.md` appendix A state that it is not canon authority, and its sources C01–C11 are fan transcriptions. Its "CANON" claims count as canon only where `LORE_REFERENCE.md` already anchors them (`PACK_ADOPTION.md` §1 audit).

| Label | Used here for |
| --- | --- |
| `CANON_CONFIRMED` | Recorded with its source in `LORE_REFERENCE.md` §Canon anchors; a pack CANON claim that `PACK_ADOPTION.md` §1 trusts because of such an anchor; the IES canon paraphrase that brief §15.2 itself labels confirmed. |
| `CANON_INFERRED` | A pack CANON claim the audit marks "verify" or never audited; `LORE_REFERENCE.md` §Inferred; canon-block text of the in-app codex, or a catalogue note, that no lore document records with a source; arithmetic on canon inputs (derived values take their inputs' tag, `PACK_ADOPTION.md` §0.1). Physical constants (c, Earth's radius) count as canon inputs. |
| `SIMULATION_ESTIMATE` | Pack SIM values on canon classes; catalogue tuning. |
| `AU_MODIFIED` | Pack AU LOCK and AU PROPOSAL values, and any SIM value on an AU-only object (`PACK_ADOPTION.md` §0.1). |
| `UNKNOWN` | Canon gives no number (the pack's `null`). |
| `OWNER` | A binding owner requirement (brief, `INTEGRATION_NOTES.md`). Not lore; the catalogue carries such values as `SIMULATION_ESTIMATE` or `AU_MODIFIED`. |

Source cells name the repository document and section, then, after ←, the source that document cites. Pack source IDs (Fleet Reference §13, JSON `sources`): C01 trilogy codex *Ships and Vehicles*; C02 ME3 codex *The Reapers*; C03 ME1 codex *Starships: Dreadnought* (legacy transcription); C05 ME1 codex *Space Combat: General Tactics*; C07 codex *Kinetic Barriers*; C08 codex *Communications and QEC*; C11 ME3 war asset *Volus Dreadnought Kwunu*; G02 Mass Effect 2; G05 Mass Effect 3. "Fleet Reference" is `APEX_Fleet_Reference.md`, "JSON" is `apex_simulator_data.json`, "catalogue" is `src/data/*.ts`, "in-app codex" is `src/codex/entries.ts`. Catalogue distances and speeds are nominal and are multiplied by `BATTLESPACE_SCALE` (0.4) in the simulation; hull lengths are not.

## 2. Statements by subject

### 2.1 Projectile and stream velocities

| # | Quantity | Value | Label | Source |
| --- | --- | --- | --- | --- |
| V1 | Dreadnought main-gun round | 20 kg at 4,025 km/s, one round every 2 s, about 38 kt TNT; Everest-class gun about 800 m long | `CANON_CONFIRMED` | `LORE_REFERENCE.md` §Canon anchors ← ME1 codex *Dreadnought*; Fleet Reference §2 and JSON `W_DN.physical` ← C01; `PACK_ADOPTION.md` §1 #1 ("Trust"); `weapons.ts` `alliance_dn_main` ← "Codex: Ships and Vehicles — Dreadnought"; in-app codex `ship_dreadnought` |
| V2 | The same round as a fraction of c | 1.3426 % of c (about c / 74.5); 8,050 km covered per 2 s cycle | `CANON_INFERRED` (derived) | arithmetic on V1 with c = 299,792.458 km/s (JSON `units`). No repository document records a codex percentage-of-light-speed wording for this gun. |
| V3 | Kinetic energy of the round | 38.72 kt (the codex's 38 kt is rounded) | `CANON_INFERRED` (derived) | `PACK_ADOPTION.md` §1 #2; Fleet Reference §2; `validation_results.json` `energy_results.reference_DKE_kt` |
| V4 | Legacy transcription "2 kg at 283 km/s" | about 0.019 kt, contradicting the printed 38 kt | rejected | Fleet Reference §2 ← C03; JSON `sources.C03.warning`; `PACK_ADOPTION.md` §1 #3 ("Reject the numbers") |
| V5 | What the Thanix fires | a stream of molten iron-uranium-tungsten alloy derived from Sovereign's weapon; a material projectile with a severe thermal component, not a laser | `CANON_CONFIRMED` (stream, origin); "material, not a laser" `CANON_INFERRED` | `LORE_REFERENCE.md` §Canon anchors ← ME2 codex; Fleet Reference §2 technology rules ← C01 |
| V6 | Thanix stream speed | "accelerated to a fraction of light speed"; no number | `CANON_INFERRED` (qualitative) | in-app codex `thanix` (canon block); `weapons.ts` `alliance_thanix` tags it `CANON_CONFIRMED` ← "Codex: Weapons — Thanix Cannon (ME2)", but no lore document records the phrase with its source. Fleet Reference §4: "Do not turn a Thanix's unknown velocity into an invented canonical megaton number." |
| V7 | Reaper capital weapon | magnetohydrodynamic stream of molten metal; 132–454 kt per shot; can destroy a dreadnought | `CANON_CONFIRMED` | `LORE_REFERENCE.md` §Canon anchors ← ME3 codex; Fleet Reference §2 ← C02; `PACK_ADOPTION.md` §1 #6 |
| V8 | Reaper stream speed | "at a fraction of light speed"; no number | `CANON_INFERRED` (qualitative) | in-app codex `reaper_weapon`; `weapons.ts` `reaper_capital_beam` (tagged `CANON_CONFIRMED` ← "Codex: Reaper Capital Ship (ME3)"); not in the `LORE_REFERENCE.md` anchor text |
| V9 | Reaper destroyer and Oculus weapon velocities | none given | `UNKNOWN` | JSON `W_REAPER_DESTROYER` ← C02 and `W_OCULUS` ← G02: canonical yield `null`, no velocity |
| V10 | Disruptor torpedo speed | slow on purpose, so the warhead passes kinetic barriers; no number | `CANON_CONFIRMED` (qualitative); number `UNKNOWN` | `LORE_REFERENCE.md` §Canon anchors ← codex; `weapons.ts` `disruptor_torpedo` ← "Codex: Weapons — Disruptor Torpedoes"; in-app codex `torpedo` |
| V11 | Kinetic-barrier velocity threshold | barriers stop fast projectiles, not slow objects and not directed energy; the threshold is not stated | `CANON_CONFIRMED` (qualitative); threshold `UNKNOWN` | `LORE_REFERENCE.md` §Canon anchors ← codex; Fleet Reference §2 ← C07; `PACK_ADOPTION.md` §1 #17 |
| V12 | GARDIAN | infrared point-defence lasers, heat-limited (light-speed weapons) | `CANON_CONFIRMED` | `LORE_REFERENCE.md` §Canon anchors ← codex; `weapons.ts` `gardian` ← "Codex: Weapons — GARDIAN" |
| V13 | Pack velocities for cruiser, frigate and corvette guns | heavy cruiser 8 kg at 2,500 km/s (0.83 % c); patrol cruiser 5 kg at 2,000 km/s (0.67 % c); frigate 1 kg at 1,200 km/s (0.40 % c); corvette 0.25 kg at 800 km/s (0.27 % c) | `AU_MODIFIED` (AU PROPOSAL, no sources) | Fleet Reference §4; JSON `W_CA`, `W_CL`, `W_FF`, `W_COR`. `PACK_ADOPTION.md` §2.5 rejected their yields; the velocities were never adopted. |
| V14 | AU heavy guns | Titan 25 kg at 4,000 km/s (1.33 % c); Nova Array 25 kg at 6,000 km/s (2.00 % c); legacy Nova 20 kg at 0.1 c (29,979 km/s), "the numerical example, not a claim of literal near-c velocity" | `AU_MODIFIED` | Fleet Reference §4, §6; JSON `W_TITAN`, `W_NOVA_CORE`, `special_systems.legacy_nova.warning`; `PACK_ADOPTION.md` §2.5, §2.7 |
| V15 | Catalogue projectile speeds today | nominal km/s: dreadnought spinal 30, cruiser 26, broadside 24, frigate 22, fighter gun 14, Javelin 2.4, torpedo 2.2, fighter torpedo 2.0; AU Titan 44, Nova 48, legacy Nova 400; Thanix, Reaper beams, GARDIAN and Reaper point defence hit-scan | `SIMULATION_ESTIMATE` / `AU_MODIFIED` | `weapons.ts` (header: "a compressed battlespace (tens of km instead of tens of thousands)"); in-app codex `mass_accelerator` estimate ("rounds travel at 22–48 km/s over ranges of 24–48 km so the engagement is watchable"). The canon round is 134 times the nominal and 335 times the simulated dreadnought speed. |

### 2.2 Weapon ranges

No lore document in the repository records a canon range for any weapon. Fleet Reference §4 says so in as many words: "All ranges below are SIM firing envelopes, not canon maximum projectile travel distances. In vacuum, the practical limit is getting a useful firing solution. C05 describes a layered engagement rather than one fixed range for all ships."

| # | Quantity | Value | Label | Source |
| --- | --- | --- | --- | --- |
| R1 | Dreadnought spinal accelerator, useful envelope | 10,000–80,000 km | `SIMULATION_ESTIMATE` | Fleet Reference §4; JSON `W_DN.sim.useful_range_km` (the physical row cites C01; the envelope cites nothing) |
| R2 | Reaper capital main weapon | 5,000–150,000 km | `SIMULATION_ESTIMATE` | Fleet Reference §4; JSON `W_REAPER_MAIN.sim` |
| R3 | Reaper destroyer main weapon | 100–40,000 km ("prolonged fire kills cruisers") | `SIMULATION_ESTIMATE` | Fleet Reference §4; JSON `W_REAPER_DESTROYER.sim` |
| R4 | Patrol cruiser spinal | 1,000–25,000 km | `SIMULATION_ESTIMATE` | Fleet Reference §4; JSON `W_CL.sim` |
| R5 | Heavy cruiser spinal (AU class) | 3,000–35,000 km | `AU_MODIFIED` | Fleet Reference §4; JSON `W_CA.sim` |
| R6 | Frigate accelerator | 100–8,000 km ("finishing and light targets") | `SIMULATION_ESTIMATE` | Fleet Reference §4; JSON `W_FF.sim` |
| R7 | Corvette accelerator (AU hull) | 10–4,000 km | `AU_MODIFIED` | JSON `W_COR.sim` only |
| R8 | Thanix strike mount | 100–20,000 km | `SIMULATION_ESTIMATE` (canon technology, SIM envelope) | Fleet Reference §4; JSON `W_THANIX.sim` |
| R9 | Heavy Thanix mount (AU mount) | 1,000–40,000 km | `AU_MODIFIED` | Fleet Reference §4; JSON `W_THANIX_HEAVY.sim` |
| R10 | Titan and Nova core (AU) | 10,000–100,000 km | `AU_MODIFIED` | JSON `W_TITAN.sim`, `W_NOVA_CORE.sim`; `PACK_ADOPTION.md` §2.4 ("pack 100,000 vs 80,000 upper bound") |
| R11 | Disruptor torpedo | "Within 10 km for the baseline model"; JSON 0–10 km; "shot down by point defence" | `SIMULATION_ESTIMATE` | Fleet Reference §4; JSON `W_TORPEDO.sim` (`interceptable`, `cold_launch_required`) |
| R12 | Javelin ship-mounted rack | "Close assault"; JSON 0–10 km; "Requires saturation and target solution" | `SIMULATION_ESTIMATE` (system existence `CANON_INFERRED`) | Fleet Reference §4; JSON `W_JAVELIN`; `PACK_ADOPTION.md` §2.5 |
| R13 | GARDIAN | "10 km nominal SIM"; "not a long-range capital beam"; JSON 0–10 km | `SIMULATION_ESTIMATE` | Fleet Reference §4; JSON `W_GARDIAN.sim` |
| R14 | Oculus strike | "Close action"; JSON 0–100 km | `SIMULATION_ESTIMATE` (the drone itself `CANON_CONFIRMED`, ME2 Collector base) | Fleet Reference §4; JSON `W_OCULUS.sim` ← G02; `PACK_ADOPTION.md` §1 #15 |
| R15 | Auxiliary defensive mount (AU) | 0–1,000 km | `AU_MODIFIED` | JSON `W_LIGHT_DEFENCE.sim` |
| R16 | Broadside batteries | exist on dreadnoughts and cruisers; no range or projectile ("A shorter weapon has a different projectile specification") | `CANON_INFERRED` (existence); range `UNKNOWN` | `LORE_REFERENCE.md` §Inferred; `weapons.ts` `alliance_broadside` ("Codex describes broadside guns; yields are not stated"); Fleet Reference §4; *Kwunu*'s "Thanix main and broadside armament" ← C11 (`PACK_ADOPTION.md` §1 #22) |
| R17 | Cruiser spinal gun | smaller than a dreadnought's | `CANON_INFERRED` | `LORE_REFERENCE.md` §Inferred; `weapons.ts` `alliance_cruiser_main` |
| R18 | Fighter guns | not established | `UNKNOWN` | `weapons.ts` `fighter_gun` ("Not established in canon"); the pack has no fighter-gun row |
| R19 | Reaper point defence against small craft | assumed from depiction | `CANON_INFERRED` (capability); numbers `SIMULATION_ESTIMATE` | `LORE_REFERENCE.md` §Inferred; `weapons.ts` `reaper_point_defence` |
| R20 | Relative reach of Reapers | "superior main-weapon reach" | `SIMULATION_ESTIMATE` | Fleet Reference §5 faction modifiers ("Suggested starting values are SIM") |
| R21 | Detection of a silent Normandy | stays visible "to eyes and to close-range active sensors"; no distance | `CANON_CONFIRMED` (paraphrase, qualitative) | brief §15.2; `ships.ts` `IES_ANCHOR`; Fleet Reference §2 "Temporary heat storage, not permanent optical invisibility" ← C01 (`PACK_ADOPTION.md` §1 #19) |
| R22 | Sensor ranges | none recorded | `UNKNOWN` | the JSON hull `canon` blocks have no sensor field; `LORE_REFERENCE.md` §Simulation estimates lists sensor ranges as estimates |
| R23 | Catalogue ranges today | nominal km: Reaper capital beam 44; dreadnought spinal 42 (asari, salarian and geth 44; Destiny Ascension 48); cruiser mains 36–40; heavy Thanix 34; Reaper destroyer beam 30; broadside 28; Thanix 26; frigates 24–26; torpedo 18; Javelin 16; fighter torpedo 9; Reaper point defence 6.5; GARDIAN 6; fighter gun 4; Oculus 3.5; IES detection 2.5. AU: Titan 48, Nova 52, legacy Nova 56, platforms 44 and 56 | `SIMULATION_ESTIMATE` / `AU_MODIFIED` | `weapons.ts`, `ships.ts`; `LORE_REFERENCE.md` §Simulation estimates; `PACK_ADOPTION.md` §2.4 took the pack's envelopes as "Ratios only" |

### 2.3 Ship speeds, accelerations and turn rates

| # | Quantity | Value | Label | Source |
| --- | --- | --- | --- | --- |
| M1 | Sublight speed, acceleration and combat turn rate of every hull | not stated | `UNKNOWN` | JSON `hull_profiles[*].canon` `maximum_sublight_speed_m_s`, `maximum_acceleration_m_s2`, `combat_turn_rate_deg_s` are `null` for all 27 profiles; Fleet Reference §3: "Canonical crew totals, reactor wattage, acceleration and turn rates remain null where unsupported. A relative mobility score is not a physical engine specification."; `LORE_REFERENCE.md` §Simulation estimates (speeds, turn rates) |
| M2 | Propulsion limits | mass reduction still requires propulsion and field collapse is dangerous, hence "No free teleportation, infinite acceleration or effortless weaponised transit" | `CANON_INFERRED` | Fleet Reference §2 technology rules ← C01; adopted as a constraint in `PACK_ADOPTION.md` §2.2 (not in the §1 audit) |
| M3 | Pack relative mobility | platform 0; carrier 0.15; dreadnoughts (incl. Valkyrie, Ascension, *Kwunu*, geth), processor and support 0.2; armed conversion 0.25; Reaper capital and Harbinger 0.3; heavy cruiser and Collector cruiser 0.35; Reaper transport 0.4; patrol cruiser 0.45; frigates (incl. SR-1, SR-2) 0.75; Reaper destroyer 0.8; corvette 0.85; torpedo craft 0.9; interceptor and Oculus 1.0. "Relative game tuning only; not a physical acceleration or angular rate." | `SIMULATION_ESTIMATE` | JSON `hull_profiles[*].sim.mobility_rating` and `mobility_rating_warning`. Reaper capitals rate above dreadnoughts, destroyers above frigates. |
| M4 | Mobility mapped to the catalogue | 0.2 → 0.65 km/s, 0.09 km/s², 4.5 °/s; 0.3 → 0.8 / 0.14 / 6; 0.45 → 0.9 / 0.16 / 9; 0.75 → 1.4 / 0.32 / 22; 0.8 → 1.6 / 0.4 / 16; 1.0 → 3.4–3.6 / 1.4–1.8 / 90–120; platforms 0 | `SIMULATION_ESTIMATE` | `PACK_ADOPTION.md` §2.4 |
| M5 | Catalogue kinematics today | every `maxSpeed`, `acceleration` and `turnRate` is `estimate()` or `au()`. Nominal km/s and km/s² (the simulation scales speed and acceleration by 0.4, not turn rate): Alliance dreadnought 0.65, 0.09 (9.2 g nominal, 3.7 g simulated), 4.5 °/s; Reaper capital 0.8, 0.14 (14 g, 5.7 g), 6 °/s; Harbinger 0.75; Reaper destroyer 1.6, 0.4 (41 g, 16 g); Alliance frigate 1.4, 0.32; cruiser 0.9, 0.16; carrier 0.6; Destiny Ascension 0.55; liveship 0.4; fighters 3.3–3.8, 1.4–1.7 (about 143 g nominal); Oculus 3.6, 1.8; platforms 0 | `SIMULATION_ESTIMATE` / `AU_MODIFIED` | `ships.ts`; `types.ts` (units "compressed" km/s and km/s²) |
| M6 | Faction speed character | salarian navy "fast and sensor-heavy" | `CANON_INFERRED` (in-app codex canon block, no source) | in-app codex `salarian` |
| M7 | Reaper FTL transit | "Estimated nearly 30 light-years per day" (3.3 × 10⁹ km/s, about 11,000 c, derived); "no equivalent routine discharge dependency observed" | `CANON_INFERRED` | Fleet Reference §2 ← C02; `PACK_ADOPTION.md` §1 #10 ("not used by the tactical sim") |
| M8 | Organic in-system FTL | ships must discharge at a planet's magnetosphere after a number of hops, "per the codex" | `CANON_INFERRED` (the brief names no entry) | brief §13 (V2.3 System theatre) |

### 2.4 Cadence, time to kill and battle length

| # | Quantity | Value | Label | Source |
| --- | --- | --- | --- | --- |
| T1 | Dreadnought cadence | one round every 2 s | `CANON_CONFIRMED` | as V1; `PACK_ADOPTION.md` §1 #1 made it a calibration fix (was 4.0 s) |
| T2 | Thanix cadence | "five-second firing cycle" | `CANON_INFERRED` | Fleet Reference §2 ← C01; `PACK_ADOPTION.md` §1 #11 ("Verify the ME2 codex *Thanix Cannon* wording"); the catalogue keeps 6.0 s with the same sustained output (`ADOPTION_PLAN.md` §1 row 14) |
| T3 | Reaper capital main cadence | "6 s SIM, tune 3–12 s" | `SIMULATION_ESTIMATE` | Fleet Reference §4; catalogue 6.2 s at `8ff0b11` (CORE chunk 4; was 6.4) |
| T4 | Other cadences | Reaper destroyer main 2 s; torpedo 12 s with 8 rounds, "Magazine and rearm limited"; Javelin 20 s with 4 salvos; GARDIAN "Heat-limited engagement budget"; Oculus 1 s | `SIMULATION_ESTIMATE` | Fleet Reference §4; JSON `weapons[*].sim` |
| T5 | Fighter sortie cycle | fighters rearm at their carriers; "A successful strike requires a return, rearm and relaunch cycle" | `CANON_CONFIRMED` (rearming at the carrier, qualitative); the cycle text `AU_MODIFIED` | `LORE_REFERENCE.md` §Canon anchors ("fighters rearming at carriers follows the codex description of carrier operations"); Fleet Reference §3 |
| T6 | Reaper against a dreadnought | the capital weapon can destroy a dreadnought | `CANON_CONFIRMED` | `LORE_REFERENCE.md` §Canon anchors ← ME3 codex |
| T7 | Dreadnoughts against a capital | two dreadnoughts can be resisted, three strain the barriers, four typically destroy the target; "neither a guaranteed duel outcome nor a numerical barrier capacity" | `CANON_INFERRED` | Fleet Reference §2 ← C02; `PACK_ADOPTION.md` §1 #9 |
| T8 | Isolated barrier trial | two dreadnoughts never; three in 18 s; four in 8 s (all hits, synchronised 2 s volleys, no return fire or manoeuvre) | `SIMULATION_ESTIMATE` | `validation_results.json` `isolated_barrier_trials`; Fleet Reference §5 calibration rules |
| T9 | Sovereign at the Citadel (2183) | its barriers withstood the Citadel fleet until Saren's death; no duration | `CANON_CONFIRMED` | `LORE_REFERENCE.md` §Canon anchors; in-app codex `battle_citadel_2183` |
| T10 | Stealth endurance | the IES runs silent "for hours (longer in cold deep space)" and must then vent | `CANON_CONFIRMED` (paraphrase) | brief §15.2; `ships.ts` `IES_ANCHOR`; compressed to a 120 s sink and an 18 s vent (`SIMULATION_ESTIMATE`) |
| T11 | Length of a fleet battle | not stated | `UNKNOWN` | no lore document records one |
| T12 | Campaign-scale story targets | orbital control at Sol broken in 1–3 days; major Earth liberation in weeks; months of pursuit; 15–35 % coalition mobile-hull losses; "story targets, not outputs" | `AU_MODIFIED` | Fleet Reference §11 *Victory and defeat*; JSON `story_targets_not_simulated_outputs`; `PACK_ADOPTION.md` §2.13 (captions only) |
| T13 | Drive-attack commitment window | 20–60 s, default 40 s | `AU_MODIFIED` | Fleet Reference §10; JSON `special_systems.drive_attack` |
| T14 | Arrivals | "Every ship from every species arrives through one relay in seconds" is a pitfall; "Show echelons, prior deployments and editing across time" | `AU_MODIFIED` (presentation) | Fleet Reference §12; montage card 16 ("must not imply a single instantaneous transit") |
| T15 | Integration step | pack recommends 0.25 s; "A fixed one-second positional step can let fast projectiles pass through a target without registering a hit" | `SIMULATION_ESTIMATE` | Fleet Reference §11; JSON `tactical_model`; `PACK_ADOPTION.md` §2.12 keeps 0.05 s with swept spheres |

### 2.5 Tactics: layers, standoff, closing, close action

| # | Quantity | Value | Label | Source |
| --- | --- | --- | --- | --- |
| K1 | Structure of an engagement | "a layered engagement rather than one fixed range for all ships"; C05 supports "Engagement layers, manoeuvre and useful firing ranges" | `CANON_INFERRED` | Fleet Reference §4 and §13 ← C05. The pack summarises C05 and transcribes none of it; `PACK_ADOPTION.md` §1 and `CODE_MAP.md` §A.5 do not audit it. |
| K2 | What limits range | "In vacuum, the practical limit is getting a useful firing solution." | `SIMULATION_ESTIMATE` (pack reasoning, no source) | Fleet Reference §4 |
| K3 | Why prediction matters | "A 4,025 km/s round takes about 12.42 s to cross 50,000 km ... Light takes about 0.167 s ... This is why target prediction and uncertain acceleration matter even in a technologically advanced fleet." | `CANON_INFERRED` (derived from V1) | Fleet Reference §11 *Range and travel time*; `PACK_ADOPTION.md` §2.12 (adopted as codex text) |
| K4 | Spinal guns aim the hull | a dreadnought is built around a spinal mass accelerator the length of the ship; "A spinal weapon cannot ignore its firing arc"; spinal guns `requires_bow_solution` | `CANON_INFERRED` (geometry); the arc rule `SIMULATION_ESTIMATE` | in-app codex `ship_dreadnought` (canon block) with V1's 800 m gun; Fleet Reference §11; JSON spinal weapons |
| K5 | The danger of closing | a cruiser "can kill [a Reaper destroyer] if it survives into effective range"; calibration rule "A cruiser must have a credible path to kill a destroyer at favourable range, and a credible chance of dying before it gets that chance"; patrol cruiser: "Its useful contribution depends on surviving to firing range" | `CANON_INFERRED` (the C02 claim); the rule and role text `SIMULATION_ESTIMATE` / `AU_MODIFIED` | Fleet Reference §2 ← C02, §5, §3; `PACK_ADOPTION.md` §1 #8; `ships.ts` `reaper_destroyer` notes |
| K6 | Reaper doctrine | "Reapers close with organic fleets and destroy the heaviest units first. They do not retreat." | `CANON_INFERRED` (in-app codex canon block, no source) | in-app codex `doctrine_reaper`; catalogue doctrine `preferredRangeFactor` 0.7, `aggression` 0.95, `withdrawThreshold` 0 (`SIMULATION_ESTIMATE`, `factions.ts`) |
| K7 | Reaper destroyers' role | "planetary assault and close support"; the beam cuts through frigates and cruisers | role `CANON_INFERRED`; beam effect `CANON_CONFIRMED` | in-app codex `ship_reaper_destroyer` (canon block, no source); `LORE_REFERENCE.md` §Canon anchors ← ME3 codex |
| K8 | Reaper tactics (AU presentation) | "rotate protection, kill the active gun platform, move destroyers to cover a capital, abandon a damaged harvest ship, withdraw a threatened group" | `AU_MODIFIED` | montage §1 *Reaper performance*; `PACK_ADOPTION.md` §2.14 (D10; withdrawal under Apex only) |
| K9 | Alliance doctrine | "Combined arms: dreadnoughts and cruisers deliver concentrated spinal fire; frigate wolfpacks screen and harass; carriers stand off and launch torpedo strikes." | `CANON_INFERRED` (in-app codex canon block, no source) | in-app codex `doctrine_alliance`; catalogue `preferredRangeFactor` 0.85 (`SIMULATION_ESTIMATE`); Fleet Reference §3: the carrier "Stands behind the gun line" (AU PROPOSAL role text) |
| K10 | Fighters, torpedoes and point defence | humans alone field carriers; their fighters strike with disruptor torpedoes that defeat barriers; GARDIAN lasers answer them and are heat-limited; the in-app codex adds "forcing every fleet to carry GARDIAN defences" | `CANON_CONFIRMED` (carriers, torpedo strikes, GARDIAN); the "forcing" clause `CANON_INFERRED` | `LORE_REFERENCE.md` §Canon anchors ← codex; in-app codex `ship_carrier` |
| K11 | Small-craft roles | interceptors "Screens bombers and pursues Oculus drones"; torpedo craft carry "a small expendable anti-ship load" | `AU_MODIFIED` (pack role text) | Fleet Reference §3 |
| K12 | Faction doctrine values | preferred range as a fraction of maximum: salarian 0.95, asari 0.9, Alliance 0.85, quarian, geth and Cerberus 0.8, turian 0.75, Reaper 0.7; in-app codex estimates: turian "aggressive closure", asari and salarian "engage at range" | `SIMULATION_ESTIMATE` | `factions.ts`; in-app codex estimate blocks |
| K13 | Apex doctrine | "Fight at prepared objectives with fixed guns and established ranges"; "Concentrate fire on selected capitals while screens occupy the destroyers"; "Withdraw damaged heavy ships behind fresh screens and repair them" | `AU_MODIFIED` | Fleet Reference §9 *What defeats the Reapers* |
| K14 | Presenting distance | pitfall "Every capital is shown within a few kilometres of Earth", fix "Mix distant engagements with recognisable orbit inserts; reserve close formations for specific tactical moments"; "three spatial layers: readable nearby ships, a small number of mid-distance engagements, and a distant fleet suggested by separate drive lights"; "heavy guns far behind mobile screens"; "An instantaneous-looking streak can be the compressed presentation of a simulated time of flight" | `AU_MODIFIED` (presentation) | Fleet Reference §12 and §11; montage §3 C and card 20; `PACK_ADOPTION.md` §2.14 adopts the three-layer rule |
| K15 | Light delay | "Update observations with light delay, uncertainty and surviving communications" (step 1 of the resolution order); 0.167 s per 50,000 km | `SIMULATION_ESTIMATE` (process rule); the delay `CANON_INFERRED` (physics) | Fleet Reference §11; JSON `tactical_model.sensor_delay`; `PACK_ADOPTION.md` §2.12 (deferred) |
| K16 | Close-quarters doctrine ("knife fight") | no repository document uses the term or gives a canon close-action range | `UNKNOWN` | none |

### 2.6 Owner requirements that bind the geometry

| # | Quantity | Value | Label | Source |
| --- | --- | --- | --- | --- |
| O1 | Dreadnought standoff | Alliance and Cerberus dreadnoughts keep long-range engagements at 0.8–0.95 of spinal range; "broadsides only when the enemy closes"; SSV Omaha holds the outer band of its spinal range with a bow solution and never closes to broadside range | `OWNER` | `INTEGRATION_NOTES.md` (2 Nov); implemented as `SPINAL_STANDOFF` (band 0.8–0.95, holds 0.875, never kites; `CORE_PROGRESS.md` T10 deviation 4) |
| O2 | Approach | fleets close along a bearing, decelerate into engagement range and hold a line, broadside or bow-on as doctrine dictates | `OWNER` | brief §8.1 |
| O3 | Nobody idles, nobody runs | "Every unit with a weapon in range is firing or moving to get a solution"; Reapers never retreat and never idle; damaged ships withdraw behind the line and return | `OWNER` | brief §8.6 |
| O4 | Firing solutions | build over seconds of tracking; "first salvoes mostly miss, long-range shots stream past the target and keep flying"; check: below 25 % hits at opening range, above 60 % after 20 s on an unmanoeuvring target | `OWNER` | brief §8.7 |
| O5 | Lore scale and pacing | Strict Lore should approximate codex combat, "including engagements across thousands of kilometres where appropriate"; fleets "manoeuvre, approach, exchange long-range fire and reposition over believable periods"; ships stay trackable by camera "without compressing the simulation"; "never slow animations while leaving combat unchanged"; "longer distances must not recreate Reapers queuing out of weapons range" | `OWNER` (the brief cites no codex entry) | brief §19.2 |
| O6 | Stealth doctrine | silent approach on the flank or below the enemy plane, one pass, Thanix at close range, hard break-away | `OWNER` | brief §15.2 |
| O7 | Final Battle opening | arrival 0–12 s; form-up 12–30 s; Reaper advance 20–38 s; simultaneous volley 38–44 s; Reaper answer 44–52 s; fighter screen 50–80 s; `beatScale` 0.5–2.0 | `OWNER` | brief §2 |
| O8 | Rule of cool | "a dreadnought broadside at point-blank", "a fighter wing threading a Reaper's arms", forced by the script when they cannot happen naturally | `OWNER` | brief §3; `ADOPTION_PLAN.md` beat `broadside_setup` (a destroyer closes to 2.5 km of the Kilimanjaro) |

## 3. Derived kinematics

Arithmetic only (script in the session scratchpad, not committed). Each table takes the label of its weakest input.

**D1. The canon round: time of flight, rounds in flight, light time** (`CANON_INFERRED`, from V1 and T1).

| Range | Flight time at 4,025 km/s | Rounds in flight per gun (2 s cycle) | Light time |
| --- | --- | --- | --- |
| 1,000 km | 0.25 s | 0.12 | 3.3 ms |
| 5,000 km | 1.24 s | 0.62 | 16.7 ms |
| 8,050 km | 2.00 s | 1.00 | 26.9 ms |
| 10,000 km | 2.48 s | 1.24 | 33.4 ms |
| 20,000 km | 4.97 s | 2.48 | 66.7 ms |
| 50,000 km | 12.42 s | 6.21 | 166.8 ms |
| 80,000 km | 19.88 s | 9.94 | 266.9 ms |
| 150,000 km | 37.27 s | 18.63 | 500.3 ms |

For comparison the catalogue's dreadnought round needs 42 / 30 = 1.40 s to its maximum range (0.70 rounds in flight), at any `BATTLESPACE_SCALE`. `PACK_ADOPTION.md` §2.12's remark that the compressed battlespace "keeps flight times comparable" is right as scale invariance, not as a comparison with the canon round over the pack's envelope.

**D2. Steady lateral acceleration that moves a target half its length during the round's flight** (a = 2s / t²; `CANON_INFERRED` from V1 and the canon lengths; the accelerations themselves are `UNKNOWN` in canon, M1).

| Target (half-length) | at 10,000 km (2.48 s) | at 50,000 km (12.42 s) | at 80,000 km (19.88 s) |
| --- | --- | --- | --- |
| Sovereign-class (1,000 m) | 324 m/s², 33 g | 13.0 m/s², 1.3 g | 5.1 m/s², 0.52 g |
| Everest-class (444 m) | 144 m/s², 14.7 g | 5.8 m/s², 0.59 g | 2.2 m/s², 0.23 g |
| Reaper destroyer (80 m) | 26 m/s², 2.6 g | 1.0 m/s², 0.11 g | 0.41 m/s², 0.04 g |

The catalogue's simulated accelerations are 3.7 g (dreadnought), 5.7 g (Reaper capital) and 16 g (destroyer); during today's 1.4 s flight a Reaper capital at full lateral thrust moves about 55 m, roughly 5 % of its half-length.

**D3. Flight time of a stream "at a fraction of light speed"** (V6, V8 give no number, so every row is `SIMULATION_ESTIMATE`).

| Assumed speed | over 17.6 km (today's simulated Reaper reach) | over 10,000 km | over 150,000 km (pack R2 maximum) |
| --- | --- | --- | --- |
| 0.01 c | 5.9 ms | 3.34 s | 50.0 s |
| 0.05 c | 1.2 ms | 0.67 s | 10.0 s |
| 0.1 c | 0.6 ms | 0.33 s | 5.0 s |
| 0.5 c | 0.1 ms | 0.07 s | 1.0 s |

**D4. Range to hull length, and the spread of the layers.**

| Range | in Sovereign lengths (2 km) | in Everest lengths (888 m) | Label |
| --- | --- | --- | --- |
| Pack dreadnought envelope 10,000–80,000 km | 5,000–40,000 | 11,300–90,100 | `SIMULATION_ESTIMATE` |
| Pack Reaper main 5,000–150,000 km | 2,500–75,000 | 5,600–169,000 | `SIMULATION_ESTIMATE` |
| Pack GARDIAN and torpedo 10 km | 5 | 11 | `SIMULATION_ESTIMATE` |
| Catalogue dreadnought spinal 16.8 km simulated | 8.4 | 18.9 | `SIMULATION_ESTIMATE` |
| Catalogue Reaper capital beam 17.6 km simulated | 8.8 | 19.8 | `SIMULATION_ESTIMATE` |
| Catalogue GARDIAN 2.4 km simulated | 1.2 | 2.7 | `SIMULATION_ESTIMATE` |

Spread of the layers (capital gun range divided by point-defence range): pack 1,000 (dreadnought, inner bound) to 8,000 (outer bound), 15,000 for the Reaper main gun; catalogue 42 / 6 = 7. `BATTLESPACE_SCALE` multiplies every range alike, so it cannot change this spread.

**D5. The uniform scale anchored on the canon round** (`SIMULATION_ESTIMATE`: arithmetic on catalogue values). S = 4,025 / 30 = 134.2 makes the catalogue's dreadnought round fly at 4,025 km/s. At that scale: dreadnought spinal range 5,635 km; Reaper capital beam 5,903 km; cruiser main 4,830 km; Reaper destroyer beam 4,025 km; Thanix 3,488 km; frigate 3,220 km; torpedo 2,415 km at 295 km/s; fighter torpedo 1,208 km; Reaper point defence 872 km; GARDIAN 805 km; Oculus 470 km; IES detection 335 km; dreadnought top speed 87 km/s at 12 km/s² (1,230 g); fighters 456 km/s at 188 km/s² (19,000 g). The capital band lands in "thousands of km"; the short layers land 1–2 orders of magnitude beyond the pack's ≤ 10–100 km, and accelerations become absurd.

**D6. Line of sight over Earth's limb** (`CANON_INFERRED`: geometry with Earth's mean radius 6,371 km; two ships at the same altitude, surface grazing).

| Altitude | Longest separation with line of sight |
| --- | --- |
| 400 km | 4,586 km |
| 1,000 km | 7,414 km |
| 2,000 km | 10,860 km |
| 5,000 km | 18,837 km |
| 35,786 km (geostationary) | 83,346 km |

**D7. Closing 10,000 km** (`SIMULATION_ESTIMATE`; canon speeds are `UNKNOWN`, M1). At the catalogue's nominal dreadnought top speed (0.65 km/s): 4.3 h (10.7 h at the simulated 0.26 km/s). Accelerating to turnover and braking (rest to rest): 34 min at 1 g, 19 min at 3 g, 11 min at 9.2 g (the catalogue's nominal dreadnought acceleration).

## 4. What the trilogy implies for battle geometry

What follows is inference from the statements above; each point names the rows it rests on.

1. **Capital exchanges at thousands to tens of thousands of kilometres: yes, as inference.** The only canon kinematic number (V1) describes a round that covers 8,050 km per firing cycle and still needs 2.5 s to cross 10,000 km (D1): its flight time becomes a tactical factor only at thousands of kilometres. The repository has always called its battlespace a compression of "tens of thousands" of km, the pack's SIM envelopes put the capital guns at 10³–10⁵ km (R1, R2), and the owner asks for "thousands of kilometres where appropriate" (O5). No lore document gives the number, so any figure the plan picks is `SIMULATION_ESTIMATE` under a `CANON_INFERRED` direction.
2. **The long-range exchange is a firing-solution contest.** At those ranges a dreadnought keeps one to ten rounds in flight (D1), and a target escapes a predicted intercept with 3–33 g at 10,000 km or 0.04–1.3 g at 50,000–80,000 km, depending on its size (D2). Low hit rates at long range that rise with tracking time (O4, K2, K3) are therefore the lore-consistent behaviour; the lore supplies no hit-rate figures. Small, agile hulls (destroyers, frigates) are the hardest to hit at range (D2), which agrees with the canon picture of a cruiser having to close on a destroyer (K5).
3. **Where shorter ranges apply.**
   - Torpedo attacks: slow by design (V10, V11), so they are launched close and must survive point defence; fighters deliver them and return to rearm (K10, T5); pack ≤ 10 km (R11, R12).
   - Point defence: GARDIAN and the Reapers' anti-craft emitters (V12, R13, R19); pack 10 km.
   - Small-craft combat: interceptors against Oculi and bombers (K11, R14); pack close action, ≤ 100 km.
   - Cruisers, frigates and destroyers working inside the capital band: cruiser against destroyer "if it survives into effective range" (K5); destroyers in "close support" (K7); pack frigate 100–8,000 km, Thanix 100–20,000 km, destroyer 100–40,000 km (R3, R6, R8).
   - Stealth strikes: a silent frigate is seen only by eye or close-range active sensors (R21) and strikes in one close pass (O6).
   - Objectives near a planet or station: in low Earth orbit the limb cuts line of sight beyond 4,600–7,400 km (D6), so a 10,000 km exchange needs an altitude of 2,000 km or more, or deep space; defending a position fixes the geometry (K13). `LORE_REFERENCE.md` draws Earth at about a third of its size "so a low-orbit battle can frame it", which no longer frames a battle fought at these ranges.
   - Scripted moments: the point-blank broadside and the fighter wing through a Reaper's arms (O8); the pack's "reserve close formations for specific tactical moments" (K14).
4. **The layers are separated by orders of magnitude.** The pack's capital-to-point-defence spread is 1,000–15,000 : 1 against the catalogue's 7 : 1 (D4). A single scale factor moves every layer together (D5): if the plan wants the capital band in thousands of km and the short layers near the pack's ≤ 10–100 km, the ranges must be re-based layer by layer, with the calibration re-pin that implies (brief §19.2, CORE T19). The lore does not fix where the bands sit, only that they are layered (K1) and why the short ones are short (point 3).
5. **The time scale is a free choice, but the lore leans long.** Speeds, accelerations and battle lengths are `UNKNOWN` (M1, T11). Approaches over 10,000 km take minutes at physically modest accelerations and hours at the catalogue's nominal speeds (D7); the hints (T10 hours of silent running, T12 days at Sol) suggest engagements longer than can be watched at 1×. The owner's opening (O7) puts the first volley 38–44 s after arrival (stretchable to twice that with `beatScale`), so a long approach must either start inside the long band, as the Final Battle's arrival by FTL (O7) and the pack's arrivals in echelons (T14) already allow, or re-time the beats. M2 rules out instantaneous or weaponised transit as the shortcut.
6. **Reapers close, organic lines hold standoff.** Reapers "close with organic fleets" and do not retreat (K6, `CANON_INFERRED`); the owner fixes the organic dreadnought standoff at 0.8–0.95 of spinal range with broadsides only when the enemy closes (O1). The pack's "superior main-weapon reach" for Reapers (R20) is SIM, as is the catalogue's slight edge (Reaper beam 44 against organic dreadnought guns 42–44). Nothing in the lore tells a Reaper to wait outside its own reach, so queueing out of range (O5) is a doctrine and approach-speed question. When ranges are thousands of km and formations keep hull-scale spacing (kilometres to tens of km; canon spacing is `UNKNOWN`), every hull of a formation sits at nearly the same range, so formation depth stops causing queueing; approach doctrine does not.
7. **Beams at long range.** The lore says only "a fraction of light speed" (V6, V8). At today's 17.6 km a hit-scan beam differs from any plausible stream speed by at most 6 ms; at 10,000 km the difference is 0.07–3.3 s and at 150,000 km 1–50 s (D3). Lengthening beam ranges to thousands of km turns hit-scan into a modelling decision with a combat effect; either choice is `SIMULATION_ESTIMATE`.
8. **Hull size against range.** Hull lengths and hit spheres are not scaled (`constants.ts`; `CODE_MAP.md` §8.1), so raising `BATTLESPACE_SCALE` raises the range-to-hull ratio directly, as the brief says. The displacement of a manoeuvring target during a round's flight grows with the scale too (D2: 55 m today), while hit spheres do not: the engine audit should confirm whether aimed rounds can miss physically when the target manoeuvres in flight, because if they can, raising the scale also raises the miss rate.
9. **Presentation.** At these separations opposing lines are thousands of hull lengths apart (D4) and cannot see each other at true scale. The pack's rules (three spatial layers, distant engagements with orbit inserts, a compressed streak for a long flight; K14) and the existing visual liberties (fighters drawn at twice their size, a smaller Earth; `LORE_REFERENCE.md`) are the precedent for render-side solutions that leave the simulation alone (O5).

What is fixed and what is free, for the design step:

- Fixed by canon (`CANON_CONFIRMED`): the dreadnought round's mass, velocity and 2 s cadence (V1, T1); canon lengths (2 km Reaper capital, 160 m destroyer, the dreadnought's 800 m gun; the pack's 800–1,000 m dreadnought band is a C01 claim the audit never checked); torpedoes slower than the barrier threshold (V10, V11); GARDIAN heat-limited point defence (V12); the Reaper weapon's 132–454 kt band (V7); fighters rearm at carriers (T5).
- Constrained but unverified (`CANON_INFERRED`): long-range capital exchange and engagement layers (K1, point 1); the Thanix 5 s cycle (T2); the cruiser's risky approach to a destroyer (K5); Reapers close and do not retreat (K6); the four-dreadnought benchmark (T7).
- Free (`SIMULATION_ESTIMATE`): every range, every speed, acceleration and turn rate, every sensor and detection range, beam stream speeds, battle length.
- Binding but not lore (`OWNER`): O1–O8.

## 5. What is unknown

- **Any canon weapon range.** Every range in the repository is SIM (R1–R23). The one cited source for engagement layers and useful firing ranges, C05, is not transcribed anywhere in the repository.
- **Canon ship kinematics:** sublight speed, acceleration and turn rate of every hull (M1), and so every closing speed.
- **Stream velocities** of the Thanix and the Reaper weapons (V6, V8); the destroyer and Oculus weapons (V9).
- **Torpedo speed and the barrier threshold** (V10, V11).
- **GARDIAN reach**, and whether it can engage warships; the simulation's "scorch nearby hulls when nothing else is in range" is a `SIMULATION_ESTIMATE` (in-app codex `gardian`).
- **Fighter performance:** speed, gun range, sortie radius (R18).
- **Sensor and detection ranges** (R22; R21 is qualitative).
- **Formation spacing, frontage and depth** in any canon battle: no repository document gives a figure.
- **Broadside range relative to the spinal gun** (R16); the owner's "broadsides only when the enemy closes" (O1) is the only rule.
- **Whether Reapers out-range organic dreadnoughts** in canon (R20 is SIM).
- **Close-quarters doctrine:** no "knife fight" or close-action range (K16).
- **Battle length at tactical scale** (T11), and the distances at which the depicted ME3 Final Battle is fought: the pack treats "every capital ... within a few kilometres of Earth" as a presentation pitfall (K14), not as a recorded distance.

## 6. To verify and to reword

In-game codex entries to check, by the procedure of `PACK_ADOPTION.md` §0.1 (a developer reads the in-game text, adds an anchor line to `LORE_REFERENCE.md`, then promotes the tag):

- ME1 *Space Combat: General Tactics* (C05) and any companion space-combat entries: engagement layers, ranges, GARDIAN against ships, close action. This is the most valuable single check for the pacing plan.
- ME1 *Dreadnought*: whether the entry states the velocity as a fraction of c alongside 4,025 km/s.
- ME2 *Thanix Cannon*: the five-second cycle (T2) and any stream speed (V6).
- ME3 *The Reapers* (C02): the destroyer "effective range" wording (K5), the four-dreadnought benchmark (T7), the transit figure (M7), any reach or stream speed (V8).
- *Disruptor Torpedoes*, *GARDIAN*, *Kinetic Barriers* (C07) and the carrier and fighter entries: any velocity, range or threshold.

Wording that a pacing change will make wrong (stage D and the lead):

- In-app codex `mass_accelerator` estimate: "rounds travel at 22–48 km/s over ranges of 24–48 km so the engagement is watchable".
- `LORE_REFERENCE.md` §Simulation estimates ("tens of km instead of tens of thousands") and §Visual liberties ("Battlespace compression (×0.4) applies to distances the camera sees").
- `ARCHITECTURE.md` units line ("so that a 2 km Reaper and a 40 km engagement range can share a camera frame"), the same sentence in the `src/simulation/constants.ts` comment, and the `weapons.ts` header.
- `PACK_ADOPTION.md` §2.12 ("keeps flight times comparable"): see D1.

Noticed in passing, outside this scope: the Citadel's Presidium ring is "7.2 km diameter, canon" in the in-app codex and `rendering/environment.ts` but "~13 km" in brief §13, neither with a source; the in-app codex estimate blocks still quote pre-T5 hull numbers (Reaper capital 32,000 hull / 42,000 barriers, destroyer 3,200 / 6,500) against the catalogue's 12,000 / 7,000 and 700 / 1,000.
