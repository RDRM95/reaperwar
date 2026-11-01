# V2 Adoption Plan — single source of truth for the V2 release

Status: **lead decisions, final; amended 1 November 2026** for the owner's two later brief changes: §8.2 amended (no fixed per-side cap; a runtime performance governor and a published benchmark ladder of 100 / 300 / 600 / 1,000 hulls per side; §21) and the new §9 feedback round 3 (one `normandy_sr2` command vessel versus the `alliance_frigate_thanix` SR-2-pattern class, and the dedicated `flagship_destroyed` event; §22). Everything else stands as written on 31 October 2026. This document closes the analysis round (`CODE_MAP.md`, `PACK_ADOPTION.md`, `BALANCE_AUDIT.md`, `CINEMATIC_DESIGN.md`, `CUSTOM_BATTLE_DESIGN.md`, all under `docs/apex/`) against the brief (`docs/V2_CINEMATIC_BRIEF.md`, including §8 "Feedback round 2") and the scale notes (`docs/design/SCALE_REFERENCE.md`). Where two analyses disagreed, §0.3 says which one this plan follows and why. Numbers in this document win over numbers in the analyses; the analyses remain the place to read the reasoning and the measurements. Implementation is organised in `docs/apex/WORK_BREAKDOWN.md`.

Snapshot: branch `claude/mass-effect-reaper-war-simulator-fidrz2`, source unchanged since `01b1fef` (v0.11.0): 83 Vitest tests, 8 Playwright tests, all green. Line numbers quoted from `CODE_MAP.md` are navigation aids only; re-grep the symbol.

## 0. Rules, reading guide and resolved disagreements

### 0.1 Rules that bind every item below (project rules, restated)

1. **Canon by default, AU by choice.** `canon_me3` stays canon. Everything from the Apex reference pack that is not released-game canon lives in the AU presets `prime_apex` ("Apex core") and `apex_legacy` ("Apex legacy, high power") or in AU scenarios/scenes, and carries an AU label on every screen and in every codex entry (§15). The only canon-side changes are calibration fixes that are themselves canon-anchored (§3) and the Oculus drone, which is canon (ME2).
2. **Provenance.** Every catalogue value carries `CANON_CONFIRMED | CANON_INFERRED | SIMULATION_ESTIMATE | AU_MODIFIED`. The pack's labels map as in §14.1. The pack's "CANON" claims are accepted only after a check against `LORE_REFERENCE.md`; unverified ones stay `CANON_INFERRED` with a verify-note (`PACK_ADOPTION.md` §1 is the audit).
3. **No ripped assets.** Every model, texture, sound and string is original. The pack is ChatGPT-generated reference text supplied by the user, not canon authority. The user's screenshots are study material and are never committed.
4. **Determinism.** `SIM_DT = 0.05 s`, seeded headless simulation; rendering only reads it. Every new mechanic draws randomness only from `sim.rng` (or a child `rng.fork(label)` created once in the constructor) in fixed step order. `Math.random` never enters `src/simulation`, `src/data`, `src/timelines`, `src/scenarios`, `src/campaign` or `src/showcase/scenes`. Render-side randomness uses seeded `Rng` instances so Record mode is frame-reproducible.
5. **Honesty.** No unimplemented feature is claimed. Scenes that force events log every forced event and print them. Limitations are listed (§17) and in `KNOWN_ISSUES.md`.
6. **Tests stay green.** The existing 83 unit and 8 e2e tests stay green (with the explicit changes listed in §16); every new mechanic ships with tests.

### 0.2 Decision codes used below

**FINAL** = decided here, implement as written. **TUNE** = the number is the starting value; the implementer measures and may move it inside the stated bounds, then pins the result in a test and reports it. **DEFER** = not in V2, no stub.

### 0.3 Where the analyses disagreed, and which one this plan follows

| # | Topic | Positions | Decision |
| --- | --- | --- | --- |
| 1 | Reaper capital / destroyer calibration | `PACK_ADOPTION` §5.3 (capital 7,000 / 16,000 / regen 1,100; destroyer 800 / 600 / regen 40; heat left at 18) vs `BALANCE_AUDIT` P3 (capital 7,000 / 12,000 / regen 1,000 + load threshold; destroyer 1,000 / 700 / 120 / 25; heat capacity by role; capital beam cooldown 6.0; torpedo HP ×2; Reaper PD 12) | **P3.** It is the later, measured proposal and explicitly tested the §5.3 values: regen 1,100 makes three dreadnoughts never kill the capital ("two and three both fail"), destroyer regen 40 denies the cruiser, heat 18 contradicts the brief's "sustained fire". `BALANCE_AUDIT` §4.4 states P3 supersedes §5.3–5.5; §5.2 (mechanic M1) is common to both. |
| 2 | "Four destroy it" with return fire | Both audits: not achievable under any continuous-recovery model without flipping canon fleet battles | **P3's reading.** The codex benchmark is the isolated concentration-of-fire trial (synchronised volleys, no return fire), which P3 satisfies literally; in a live 4-vs-1 the four take the barrier to ≈ 18 % and lose, which is the lead's "must not automatically survive" in its strongest form. No post-collapse regeneration gap in canon. As an **AU-only** lever, the HADES warhead suppresses the target's barrier recovery for 6 s after a penetrating detonation (§7), which is where a "projector disruption" belongs. |
| 3 | Oculus weapon and complement | `PACK_ADOPTION` §3b/§3c: gardian-kind laser 9 / 0.3 s, complements 16 / 4 / 24 | **`BALANCE_AUDIT` §9 (measured):** 1.0 s `reaper_beam` burst 48/s, cooldown 2.4 s, complements 8 / 2 / 12, hull 48 / armour 5 / no barriers; isolated 24-vs-24 screen lasts 69–97 s, Trident median life 68 s at Earth, battle outcomes unchanged. The pack's complement was measured as too lethal. |
| 4 | Pace knob key | `CINEMATIC_DESIGN` §1.4 folds pace into the `cinematic_arrival` choice id | **`CUSTOM_BATTLE_DESIGN` §3.2:** two keys, `cinematic_arrival: on/off` and `beat_scale`, so the briefing shows pace as its own control and a pace change never resets on/off. |
| 5 | Fixed platforms under canon | `PACK_ADOPTION` §3b: Apex-only (`special.fixedPlatforms`) | **`CINEMATIC_DESIGN` §7.10 and brief §8.10:** the dreadnought-grade platform exists under every preset as `SIMULATION_ESTIMATE` ("existence as modelled"); only the super-accelerator variant is AU. The flag is renamed `heavyPlatforms`. |
| 6 | New formation ids | `CUSTOM_BATTLE_DESIGN` proposes `reaper_swarm` | **`CINEMATIC_DESIGN` §7.2 ids:** `layered_line`, `stacked_wedge`, `box`, `swarm_descent`, `broadside_line`, `static`. |
| 7 | Kilimanjaro-class | data class (`alliance_dreadnought_k`, honest 1,000 m hull) vs render-only variant | **Data class.** Collision hull and model agree; combat values identical to the Everest-class so balance is untouched. |
| 8 | AU classes in custom battles | gate behind preset flags vs sandbox rule C5 | **C5:** any class under any timeline, always AU-badged; a config that fields an AU hull is named `Custom (AU): …` and carries `auContent: true`. |
| 9 | Cinematic opening for campaign-linked Final Battles | open question in `CINEMATIC_DESIGN` §9.2 | **Default `off` when `forces` resolves to campaign fleets**, `on` otherwise; the player may switch it on, in which case campaign fleets are assigned to arrival waves in list order. |
| 10 | Oculus length | 8 m (audit) vs 12 m (pack) | **12 m**, `CANON_INFERRED` note "fighter-sized drone in ME2; not stated". Rendered at the fighter convention (2×). |
| 11 | Valkyrie role | `dreadnought` (`PACK_ADOPTION` §3b) vs `super_dreadnought` (brief §8.9) | **`super_dreadnought`** (the brief is later and the role is required anyway). |
| 12 | Destroyer `pointValue` | re-base to 140 (audit §13 measured side effects) | **Keep 260 in V2**; re-basing is a separate follow-up with its own measurement. |
| 13 | Reaper AI behaviours under canon | `PACK_ADOPTION` gates all five D10 behaviours behind `reaperDoctrine: 'apex'` | **Split:** rotate protection, kill the active gun platform and cover a damaged capital are canon-compatible tactics and run under every preset (`SIMULATION_ESTIMATE`); abandoning a damaged harvest ship and withdrawing a threatened group run only under `reaperDoctrine: 'apex'`, and even then as a tactical fall-back-and-return, never an exit (brief §8.6). |
| 14 | Thanix cadence | 350 / 5.0 s if the ME2 codex wording verifies | **Keep 420 / 6.0 s** (same sustained output); `CANON_INFERRED` verify-note in the codex. |
| 15 | HADES semantics | faction-wide `armourBypass` on every mass accelerator (shipped) vs round-level special ammunition (D7) | **Round-level** (D7). The existing damage test moves to the Titan gun (§16). |
| 16 | Director replaces `pickCinematicShot` | `CINEMATIC_DESIGN` §2.5 deletes the old two-subject framing | **Adopted**, but the rendering stage keeps the old path as the fallback when no camera driver is attached, so the stages can land in any order. |
| 17 | Heavy-cruiser and corvette roles | pack hull profiles | **No generic roles** (`PACK_ADOPTION` §3b reasoning); the Cerberus heavy cruiser is a class with `role: 'cruiser'`; corvettes exist only in captions and in the distant layer. |
| 18 | Custom battle `reaper_harvest_group` formation | `strike_wedge` | `swarm_descent` once it exists (it will, in CORE). |
| 19 | Per-side hull caps | `CUSTOM_BATTLE_DESIGN` C3/§1.5 (`SHIP_CAP_PER_SIDE`, `HARD_SHIP_CAP`, E2, `classMax` per role, *Scale to cap*), `CINEMATIC_DESIGN` §7.2 (70 → 150, target 200), the first version of this plan | **Brief §8.2 as amended by the owner: no fixed cap anywhere.** The constants, E2 and the per-role `classMax` are not built; the only hard limits are identity limits (unique hulls, §22) and an input sanity bound of 2,000 per class row. A runtime `PerfGovernor` measures the machine and *warns*; the player may override every warning (§21). |
| 20 | Campaign engagement scaler | `campaign/engine.ts` constant `MAX_SHIPS_PER_SIDE = 70` kept by every analysis | **Replaced by the governor's live-hull budget** (`PerfBudget.liveHulls`, default 400 per side until measured); hulls compressed away become distant-layer groups (§21.4), so a 1,500-hull campaign fleet is still represented. |
| 21 | Normandy identity | every analysis spawns the Normandy as `alliance_frigate_thanix` (count 1, `fixedClasses`) | **Brief §9.1: split.** `normandy_sr2` is the unique command vessel with a `flagship` flag; `alliance_frigate_thanix` becomes the SR-2-pattern Thanix frigate class with its own original names (§22.1). |
| 22 | Scene 1's Harbinger ending | D5 keeps the montage's mission kill; brief §9.2 says "the showcase scene uses the same event" | **Both.** `flagship_mission_kill` is the lighter sibling of `flagship_destroyed` (same payload shape, same banner, comms, caption and held-shot path); scene 1 keeps the mission kill (D5) and emits it through that event, so the Harbinger line "This cycle is not concluded." becomes the event's transmission instead of a scripted caption. A destruction is shown whenever Harbinger actually dies (Final Battle, custom battles), and the headless test and the results e2e cover it (§22.2). |

## 1. D1 — Preset family (FINAL)

### 1.1 Identity

- `prime_apex` keeps its id (saves, prefs and campaign snapshots keep working) and is renamed **`Prime/Apex — Apex core`**. `tests/saves.test.ts` literal `'Prime/Apex — Successful Refuse'` becomes `'Prime/Apex — Apex core'`. The name keeps the prefix `Prime/Apex` (e2e `.menu-info`), and `historyChanges` keeps the phrase `Homeworld Defence Rule` (e2e timelines screen).
- New preset **`apex_legacy`**, **`Prime/Apex — Apex legacy (high power)`**, category `au`, inherits everything from Apex core and adds the near-c Nova and upper-tier drive attacks. It is labelled **`HIGH POWER — EASIER BY DESIGN`** on the briefing, custom-battle conditions, HUD timeline panel and results screens whenever `special.legacyNova` is true.
- Canon (`canon_me3`) is untouched except the calibration fixes of §3.

### 1.2 New `SpecialTechnology` fields (all default to the canon value; validated in `schema.ts`; shown in the timelines editor; ranked in `comparison.ts`; reported by `reaperIntel.ts` where noted)

| Field | Type | Canon | Meaning |
| --- | --- | --- | --- |
| `hyperMassAccelerators` (kept; UI label "Project Titan accelerators") | boolean | false | Alliance and Cerberus dreadnought and super-dreadnought spinal guns become the Titan gun `apex_hyper_ma`. Predicate: `faction ∈ {alliance, cerberus} && (role === 'dreadnought' || role === 'super_dreadnought') && weapon.kind === 'mass_accelerator' && weapon.antiCapital && weapon.arc <= 20 && cls.id ∉ {destiny_ascension, normandy_valkyrie}`. Reaper intel reports it. |
| `hadesRounds` (kept) | boolean | false | Each Titan gun carries 12 HADES penetrators (`specialAmmo`), then ordinary slugs. **No longer** a faction-wide `armourBypass`/`barrierEfficiencyMultiplier`: those live on the HADES round (§7). |
| `valkyrieAvailable` | boolean | false | Scenario builders and compositions may spawn `normandy_valkyrie`. |
| `legacyNova` | boolean | false | The Valkyrie's `nova_legacy` hardpoint is fitted (weapons declare `requiresSpecial`). |
| `driveAttacks` | `'off' \| 'rare' \| 'upper'` | `'off'` | D9 tier (§9). |
| `heavyPlatforms` | boolean | false | Sol scenarios place `sol_platform_heavy` (super-accelerator) beside the dreadnought-grade platforms that exist under every preset. |
| `superDreadnoughts` | boolean | false | The Olympus-class and Praetor-class heavy dreadnoughts may be spawned by scenario builders and compositions. |
| `reaperDoctrine` | `'canon' \| 'apex'` | `'canon'` | Enables the two withdrawal-type D10 behaviours (§10). |
| `readinessScale` | number | 1 | Multiplies the readiness-tier weights (§1.6); clamped [0.5, 1.5]. |

Oculus drones are **not** a flag: they are canon (ME2) and launch under every preset.

### 1.3 Apex core (`prime_apex`) — full rule set

```ts
{
  id: 'prime_apex',
  name: 'Prime/Apex — Apex core',
  tagline: 'Successful Refuse: no Crucible at all. A galaxy prepared to win the war by force.',
  category: 'au',
  description: 'ALTERNATE UNIVERSE. Shepard never died; the galaxy mobilised for three years; Cerberus committed the Black Fleet; there is no Crucible. Project Titan fires finite HADES penetrators, the Normandy Valkyrie leads the line, and Reaper losses are earned in combat. Nothing here is presented as canon.',
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
  organic: { massAcceleratorDamage: 1.1, massAcceleratorPenetration: 1.15, massAcceleratorRange: 1.0, fireRate: 1.0, heatCapacity: 1.2,
             kineticBarrierStrength: 1.2, barrierRegen: 1.25, armourStrength: 1.15, hullIntegrity: 1.1, speed: 1.05, sensors: 1.3,
             electronicWarfare: 1.2, accuracy: 1.08, fighterStrength: 1.2, torpedoDamage: 1.25, gardianEffectiveness: 1.3, beamDamage: 1.2, crewQuality: 1.1 },
  reaper: CANON_TECH,
  factionOverrides: {
    cerberus: { sensors: 1.3, electronicWarfare: 1.4, accuracy: 1.1 },
    asari: { accuracy: 1.13 },
    salarian: { sensors: 1.5, gardianEffectiveness: 1.55 },
    geth: { crewQuality: 1.2, barrierRegen: 1.4 },
    quarian: { barrierRegen: 1.35 },
  },
  special: { hyperMassAccelerators: true, hadesRounds: true, thanixAvailability: 'fleetwide', reaperCommandVulnerability: true, indoctrinationDisabled: false,
             valkyrieAvailable: true, legacyNova: false, driveAttacks: 'rare', heavyPlatforms: true, superDreadnoughts: true, reaperDoctrine: 'apex', readinessScale: 1 },
  fleetStrength: { alliance: 1.8, turian: 1.5, asari: 1.3, salarian: 1.3, quarian: 1.2, geth: 1.2, cerberus: 1.5, reaper: 1.0 },
  strategic: { alliedCoordination: 0.85, reaperCompetence: 1, indoctrinationEffectiveness: 0.5, reaperReinforcements: 1, conventionalVictoryPossible: true,
               crucibleAvailable: false, shepardAlive: true, shepardEffectiveness: 1.8, illusiveManIndoctrinated: false, cerberusStance: 'cooperative',
               harbingerOperational: true, catalystOperational: true, homeworldIndependence: true },
}
```

The organic multipliers are **TUNE** (bounds: each ≥ 1.0 and ≤ the shipped value; `reaper` never changes; tune in the order `kineticBarrierStrength`, `massAcceleratorDamage`, `fleetStrength` before any other key). Target after the §3 calibration lands: `alliance_fleet_engagement`, fixed fleets, seeds 7–9 under Apex core → Alliance victory, every Reaper destroyed, **7–19 Alliance ships lost including 1–3 dreadnoughts**, `A.survivalPercent < 85`; campaign `prime_apex` seed 5 still wins conventionally ≤ week 160 (`tests/campaign.test.ts`). `BALANCE_AUDIT` §7.6 shows the shipped multipliers give a 90–95 % survival walkover under P3, so the retune is mandatory, not optional.

### 1.4 Apex legacy (`apex_legacy`)

```ts
{
  id: 'apex_legacy',
  name: 'Prime/Apex — Apex legacy (high power)',
  tagline: 'Easier by design: the near-light-speed Nova and upper-tier drive attacks. Separately labelled.',
  category: 'au',
  description: 'ALTERNATE UNIVERSE, HIGH POWER. Apex core plus the earlier Apex material’s single-shot capital-killing Nova and more frequent Black Fleet drive attacks. Same inventories, same Reapers. Deliberately easier; not a balance reference.',
  historyChanges: [ ...APEX_CORE.historyChanges,
    'Legacy Nova: a 20 kg round at a tenth of light speed (≈ 2.2 Mt), 60 s cycle, twelve rounds, visible six-second charge — AU HIGH POWER.',
    'Upper-tier drive attacks: five attempts, shorter commitment, nearby destroyers caught in the impact.',
    'This preset is easier by design and is labelled as such on every screen.' ],
  organic / reaper / factionOverrides / fleetStrength / strategic: identical to Apex core,
  special: { ...APEX_CORE.special, legacyNova: true, driveAttacks: 'upper' },
}
```

### 1.5 Consequences that must be handled

- `PRESETS` gains `APEX_LEGACY` after `PRIME_APEX`; the preset-id lists in `tests/timelines.test.ts` ("Reaper tech unchanged") and `tests/battle.test.ts` ("every scenario builds under every preset") gain `apex_legacy`; codex AU blocks are keyed to both ids through a helper `apexAu(core: string[], legacy?: string[])` (§15).
- The two `rules.id === 'prime_apex'` checks (`scenarios/index.ts` Cerberus Intervention Black Fleet dreadnoughts, `campaign/engine.ts` Omega group) become `isApexRules(rules) = rules.strategic.cerberusStance === 'cooperative' && rules.special.hyperMassAccelerators`, exported from `timelines/rules.ts`.
- Campaign: `crucible.available` is false under Apex; the setup screen shows "No Crucible in this timeline"; the conventional-victory reason text keeps "…The Refuse is successful." (test regex `/conventional|Refuse/`). Old campaign snapshots: `normaliseCampaign` fills missing `special` keys from `CANON_SPECIAL`, and for snapshots with `rules.id === 'prime_apex'` from the Apex core values **except** `crucibleAvailable`, which keeps the saved value (a campaign started with the Crucible keeps it; say so in the changelog).
- Campaign world state (Apex presets only, `kind: 'au'`): `alpha_losses: '0' | '10' | '25'` (default `'25'` under Apex, the key is absent under canon) multiplies `reaper.reinforcementPool` and the harvest fleet's counts by 1.0 / 0.9 / 0.75 at campaign creation. Missing key = `'0'`, so existing tests are unchanged.
- `ui/screens/comparison.ts` default side B stays `prime_apex`; `explainDifferences` keeps the literal phrase **"Hyper-mass accelerators"** (e2e and unit regex) and rewrites the sentence: `Hyper-mass accelerators (Project Titan) enabled: Alliance and Black Fleet dreadnought spinal guns become Titan guns carrying 12 HADES penetrators each`; the HADES line becomes `HADES penetrators enabled: the first 12 Titan rounds per gun detonate a nuclear warhead after penetration`; new lines for Valkyrie, drive attacks, heavy platforms, super-dreadnoughts, Reaper doctrine.
- `AU_RULES.md`, `README.md`, `CHANGELOG.md` describe the renamed preset and the new one (stage D).

### 1.6 Readiness tiers (pack §8 readiness distribution → `crewQuality`)

`FleetSpec.readiness?: 'veteran' | 'regular' | 'reserve'` → `techOverride.crewQuality = (techOverride.crewQuality ?? rules.organic.crewQuality) × weight × rules.special.readinessScale`, weights `{ veteran: 1.0, regular: 0.85, reserve: 0.6 }` (`SIMULATION_ESTIMATE`). Fixed tiers for the named Apex compositions: Alliance Sword, Hierarchy, geth, Black Fleet, Valkyrie, platforms → veteran; Republics, Union, quarian → regular. Canon scenarios and the reference engagement never set `readiness`; campaign fleets keep their existing `0.7 + 0.3 × readiness` crew override and do not stack a tier.

## 2. D2 — Damage unit and the pack's SIM profiles (FINAL)

**1 DKE = 1,000 simulation damage points** (`alliance_dn_main.damage` stays 1000; `tests/timelines.test.ts` pins it). Weapon yields map directly (table below). **Hull profiles do not map directly**: our model has flat per-hit armour, type-dependent barrier efficiency, beam bursts applied in 50 ms chunks and a Reaper recovery mechanic, so pack hull values are starting points adapted by the rule `barriers = 5,200 × barrier_dke / 1.4`, `hull = 9,000 × structure_dke / 1.0`, `barrierRegen = 55 × recovery / 0.06` (ratio to the pack's standard dreadnought against our Kilimanjaro), armour set by hand, and then **re-measured** (§3). Pack fields with no counterpart (`thermal_armour_coupling`, `heat_lockout`, `cooling`, `magazine_shots: 200` on spinal guns, `recovery_requires_projectors`) are not adopted.

| Pack value (DKE) | Points | Where it lands | Adopted? |
| --- | --- | --- | --- |
| Standard dreadnought round 1.0 / 2 s | 1,000 / 2.0 s | `alliance_dn_main` cadence (was 4.0) | yes, cadence (`CANON_CONFIRMED`) |
| Titan kinetic stage 1.2345 / 6 s | 1,235 / 6.0 s | `apex_hyper_ma` (was 3,200 / 4.5) | yes |
| HADES payload 9.04 (350 kt) | 2,260 internal burst (coupling 0.25) | `apex_hyper_ma.warhead.damage` | yes, adapted |
| Nova Array core 2.78 / 6 s | 2,780 / 6.0 s | `nova_array` | yes |
| Legacy Nova 55.9 / 60 s | 30,000 / 60 s (≈ 0.54 couples) | `nova_legacy` (legacy preset only) | yes, adapted |
| Heavy Thanix 1.0 / 5 s | 625 /s × 1.6 s = 1,000 / 5.0 s | `thanix_heavy` | yes |
| Javelin salvo 1.3 / 20 s | 4 × 325 / 20 s, 4 salvos | `javelin_rack` | yes, adapted |
| Reaper capital main 7.75 / 6 s | ours: 2 beams × 5,320 per 2.8 s burst, cooldown 6.0 s | `reaper_capital_beam` cooldown (was 7.5) | cadence adopted; one burst ≈ 5.3 DKE ≈ 206 kt-equivalent, inside the codex 132–454 kt band |
| Destroyer main 0.31 / 2 s | ours 1,248 per 2.4 s burst / 6.5 s (0.14 DKE/s vs 0.155) | unchanged | equivalence accepted |
| Oculus 0.006 /s | 48 /s × 1.0 s | `oculus_beam` | adapted (measured) |
| Cruiser 0.062, frigate 0.0044, torpedo 0.7, GARDIAN 0.01 | — | ours stay 320 / 70 / 260 / 14 | rejected (would break anchored relationships and tests) |

## 3. D3 — Canon calibration (FINAL numbers, canon-anchored)

### 3.1 Mechanics (all deterministic, no RNG)

- **M1 — recovery under fire.** `ShipClassDef.barrierRegenUnderFire?: Sourced<number>` (0–1, default 0), copied to `ShipState`. `updateHousekeeping`: `frac = time − lastHitAt > 3 ? 1 : ship.barrierRegenUnderFire; if (frac > 0 && barriers < max && time ≥ regenSuppressedUntil) barriers = min(max, barriers + barrierRegen × frac × dt)`. `reaper_capital` and `harbinger` 1.0; every other class 0. Anchors: "Sovereign's barriers withstood the Citadel fleet" (`CANON_CONFIRMED`) and the concentration-of-fire benchmark (`CANON_INFERRED`, verify).
- **M2 — barrier load threshold.** `ShipClassDef.barrierLoadThreshold?: Sourced<number>` (points, default 0 = off). In `applyDamage(target, raw, weapon, rng, now, opts?: { hitSize?: number })`: `absorbed = min(barriers, amount × eff)`; `load = threshold > 0 ? absorbed × min(1, (opts.hitSize ?? raw) / threshold) : absorbed`; `barriers −= load`; `amount −= absorbed`; `out.barrierDamage = load`. Beams pass the whole burst (`def.damage × beamDuration`) as `hitSize`. Capitals and Harbinger only (threshold 1,000 = 1 DKE). The round is still stopped; the field is only loaded in proportion to the hit.
- **M3 — heat capacity by hull.** `ShipClassDef.heatCapacity?: Sourced<number>`; `applyRulesToShip` returns `(cls.heatCapacity?.value ?? 100) × t.heatCapacity`. Values: dreadnought 200, super_dreadnought 260, carrier 180, cruiser 140 (heavy cruiser 160), frigate 110, fixed_platform 240 (heavy 260), fighters and Reaper classes 100.

### 3.2 Canon catalogue values (CORE)

| Item | Field | Now | New | Provenance / anchor |
| --- | --- | --- | --- | --- |
| `alliance_dn_main`, `turian_dn_main` | cooldown / heat | 4.0, 3.8 / 18 | **2.0 / 12** | codex: one round every two seconds (`CANON_CONFIRMED`); heat `SIMULATION_ESTIMATE` |
| `asari_dn_main`, `geth_dn_main` | cooldown / heat | 4.0, 3.8 / 16 | **2.0 / 11** | same class of weapon |
| `salarian_dn_main` | cooldown / heat | 3.8 / 15 | **2.0 / 10** | same |
| `quarian_heavy_main` | cooldown / heat | 4.2 / 18 | **3.0 / 14** | converted hull, not a dreadnought gun |
| `ascension_main` | cooldown / heat | 4.5 / 20 | **4.0 / 16** | unique gun |
| `alliance_broadside` | heat | 6 | **3** | spinal + one full broadside stays under a dreadnought's cooling |
| `reaper_capital_beam` | cooldown | 7.5 | **6.0** | burst unchanged; cadence makes the canon reference a Reaper win on seeds 7–9 |
| `disruptor_torpedo` / `fighter_torpedo` | missileHp | 12 / 8 | **24 / 16** | two Reaper PD hits instead of one |
| `reaper_point_defence` | damage | 18 | **12** | a Trident dies to three hits, not two |
| `reaper_capital` | barriers / hull / armour / regen / regenUnderFire / loadThreshold | 42,000 / 32,000 / 320 / 240 / — / — | **7,000 / 12,000 / 320 / 1,000 / 1.0 / 1,000** | tuned to the concentration-of-fire benchmark (`SIMULATION_ESTIMATE`, note says so) |
| `harbinger` | same; lengthM | 58,000 / 44,000 / 380 / 300; 2,400 | **10,500 / 18,000 / 380 / 1,300 / 1.0 / 1,000; `inferred(2200)`** | 1.5 × capital (pack SIM boss); length per `SCALE_REFERENCE.md` |
| `reaper_destroyer` | barriers / hull / armour / regen (pause rule) | 6,500 / 3,200 / 160 / 80 | **1,000 / 700 / 120 / 25** | "a cruiser can kill one if it survives into effective range" (`CANON_INFERRED`) |
| `alliance_cruiser` | lengthM | 520 | **estimate(700, 'York-class; fan size chart ≈ 707 m')** | `SCALE_REFERENCE.md` |
| `reaperIntel.ts` | threat score | `loss×3 + caps×0.6 + tech×0.8 + 0.5` | **`loss×2 + caps×0.4 + tech×0.8 + (organicStrength > 0.6 && t > 60 ? 0.6 : 0) + (Reapers lost ? 1.2 : 0)`**, thresholds unchanged | canon seed 7 → ELEVATED, Apex → CRITICAL (the HUD shows the level, so this is a code change) |

Hull descriptions and codex strings quoting 42,000 / 32,000 / 6,500 / 3,200 change with the catalogue (stage D); the destroyer description becomes "its barrier stops a single dreadnought round and recovers only when left alone".

### 3.3 Measured behaviour the implementation must reproduce (from `BALANCE_AUDIT.md` §7; re-run after the real change, and again after §8.1/§8.6/§8.7 land)

Isolated trial (synchronised all-hit 2 s volleys, M1 formula): 2 DN never, barrier ≥ 71 %; 3 DN collapse 10 s, kill 38 s; 4 DN collapse 6 s, kill 20 s. Live duels (canon, 40 km): 2 DN muted → barrier never below 50 % in 300 s; 4 DN muted → killed within 90 s; 4 DN armed → at least one DN lost every seed, capital killed in ≤ 2 of 5; 6 DN armed → capital killed ≥ 4 of 5. Cruiser vs destroyer: 1 CA wins 3–12 of 20; 2 CA ≥ 8 of 10; 1 DN kills a destroyer within 30 s; 4 FF ≤ 6 of 10. Reference engagement canon seeds 7 / 8 / 9: Reaper win, 1–2 capitals lost, Alliance survival < 30 %, `B.destroyed < B.deployed`. Battle of Earth canon seed 42: completes, Reaper win, ≤ 2 capitals lost. No Alliance dreadnought is ever `overheated` in the canon reference engagement.

### 3.4 Benchmark tests (CORE, `tests/calibration.test.ts`; exact assertions in `WORK_BREAKDOWN.md` §1.6)

`isolated barrier trial`, `live duels`, `cruiser vs destroyer`, `cadence`, `heat`, `Oculus screen`, `Harbinger trial`. Existing assertions that change are listed in §16.

### 3.5 The re-measure protocol

Because §8.1 (movement), §8.6 (withdrawal) and §8.7 (firing solutions) change hit rates and geometry, CORE implements the calibration first, pins it, then implements movement/solutions/withdrawal and **re-measures** every balance assertion (`BALANCE_AUDIT.md` §8 list). If a threshold is missed, the levers are, in order: the hit-probability solution floor `0.25 + 0.75·q` (§8.7, bounds 0.2–0.35 for the floor), destroyer barrier 900–1,100, capital regen 1,000–1,100, capital beam cooldown 6.0–7.5. Never the capital's barrier/hull below 7,000 / 12,000 (flips canon fleet battles) and never `reaper` tech. The final numbers are pinned in the tests and written into `docs/apex/CALIBRATION_REPORT.md` (CORE), which stage D folds into `AU_RULES.md` §Reference balance.

## 4. D4 — Final Battle of Earth (FINAL)

### 4.1 World state (declared options, `CUSTOM_BATTLE_DESIGN.md` §3.2 with `resolveWorldState`)

| id | kind | choices | default |
| --- | --- | --- | --- |
| `normandy` | player_dependent | yes / no | yes |
| `ascension` | player_dependent | present / absent | present (declared; today the builder reads it without a control) |
| `forces` | extrapolation | campaign / default | campaign; disabled with a note when no campaign is saved |
| `genophage` | player_dependent | cured / sabotaged | cured |
| `cerberus` | extrapolation | `auto` / `allied` (**AU**, `availableWhen` stance cooperative or controls_reapers) / `hostile` / `absent` | `auto` → `allied` when `cerberusStance === 'cooperative'`, else `hostile` |
| `cinematic_arrival` | extrapolation | on / off | `defaultFor`: `off` when `forces` resolves to campaign fleets, else `on` |
| `beat_scale` | extrapolation | 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 | 1; disabled when the opening is off |
| `distant_layer` | au | on / off | on; `showWhen: isApexRules(rules)` |

Cerberus mechanics: `allied` → side-A fleet spawned by the `arrive_cerberus` beat (Black Fleet classes when `isApexRules`, canon Cerberus hulls otherwise; `arrivalTime 12` when the opening is off); `hostile` → side-B strike group `cerberus_cruiser × 8, cerberus_frigate × 12`, `arrivalTime 150`, `initialOrder.priority 'capitals'`, HUD label `CERBERUS (HOSTILE)`; `absent` → none. Limitation (two-side simulation): a hostile group fights beside the Reapers and is not shot at by them; the briefing says so.

### 4.2 Cinematic geometry (nominal km, before `× S`) when the opening is on

Sword Alliance `(−18, 0, −26)` `layered_line`; Hierarchy `(20, 0, −28)` `layered_line`; Republics `(0, 4, −36)` `defensive_screen`; Union (if sabotaged) `(0, −6, −42)`; Migrant Fleet `(−38, 0, −34)`; geth `(38, 0, −32)` `stacked_wedge`; Black Fleet `(2, 0, −30)` `strike_wedge` (by beat); platforms on an arc 8–14 km ahead of the line at `y ±2` (2 standard under canon; 2 standard + 2 heavy under Apex) in a `static` fleet with `defend_position`; Reaper blockade `(0, 0, 30)` heading `−z`, `swarm_descent`, `hold_formation`, `fightersDeployed false`; Reaper reserve `(−50, 0, 76)`, `arrivalTime 110`, `arrivalFlash true`. All coalition fleets start with `hold_formation`, `holdFire: 'spinal'`, `fightersDeployed: false`. The builder scales the two anchor `z` values by `clamp(1 / beatScale, 0.85, 1.25)` so the volley always has solutions. With the opening off, today's geometry and orders are kept (plus platforms).

### 4.3 Default beat table (`src/scenarios/finalBattleBeats.ts`, scene seconds at `beatScale 1`; `*` = Apex presets only)

| id | at | event |
| --- | ---: | --- |
| `title` | 0.5 | caption `title` "SOL · 2186" 3.5 s; under AU presets a persistent `tag` caption `ALTERNATE UNIVERSE · <preset name>` |
| `arrive_alliance` | 0.0 | `spawn_wave sword-alliance`, stagger 3.0 |
| `arrive_turian` | 3.0 | `spawn_wave sword-turian`, stagger 2.5 |
| `arrive_asari` | 5.5 | `spawn_wave sword-asari`, stagger 2.0 |
| `arrive_salarian` | 7.0 | `spawn_wave sword-salarian` (skipped when absent) |
| `arrive_quarian` | 8.0 | `spawn_wave sword-quarian`, stagger 2.5 |
| `arrive_geth` | 9.5 | `spawn_wave sword-geth`, stagger 2.0 |
| `arrive_cerberus` | 12.0 | `spawn_wave sword-cerberus` (allied only), stagger 1.5 |
| `form_up` | 12.0 | `set_fleet_order side:A { order: 'advance', holdFire: 'spinal' }` |
| `reapers_advance` | 20.0 | `set_fleet_order reaper-blockade { order: 'advance', holdFire: 'beams' }` |
| `oculus_launch` | 24.0 | `launch_drones fleets reaper-blockade, burst 8` |
| `scale_caption`* | 26.0 | caption `tactical` "38,420 WARSHIPS COMMITTED TO SOL · AU SCENARIO VALUE · <N> SIMULATED, REST STATISTICAL" 4 s |
| `platforms`* | 28.0 | caption `tactical` "612 DEFENCE PLATFORMS — SOL NETWORK · AU SCENARIO VALUE · 4 SIMULATED" 4 s |
| `line_holds` | 34.0 | `set_fleet_order side:A { order: 'attack' }` |
| `volley` | 36.0 | `fleet_volley side:A, lead 2.0, mounts 'spinal', anchor { name: 'SSV Kilimanjaro' }` → release 38.0–39.5 (Hierarchy window 1.0 s) |
| `reaper_answer` | 42.0 | `fleet_volley reaper-blockade, lead 2.0, window 2.0, mounts 'beams'` → 44.0–46.0 |
| `fighters` | 48.0 | `set_fleet_order side:A { fightersDeployed: true }`; `launch_drones reaper-blockade burst 6` |
| `free_play` | 80.0 | `player_control { locked: false }` |

`lockPlayerUntil: 80`. "At least one cruiser dies in the first exchange; a dreadnought takes a beam and holds" is **not forced** in a playable scenario; the acceptance test asserts a first loss of cruiser size or larger by 70 s on seeds 1–3 under canon and Apex core. Player lock: orders are refused with the toast `CINEMATIC OPENING — ORDERS UNLOCK AT 01:20 · K TO SKIP`; `K` and a pause-menu `Skip opening` (`data-action="skip-opening"`) step the simulation to the unlock time without rendering (wall time only, never the simulation). Camera, selection and speed stay live.

### 4.4 Oculus and the distant layer

Every Reaper class carries Oculus complements (8 / 2 / 12, §13.1) under every preset; the beat `oculus_launch` only bursts the launch. The distant engagement layer (§13.3) is on for the Final Battle and the Battle of Earth under every preset and represents whatever exceeds the live budget of §21 (there is no cap; the budget is what the machine measured): Apex presets show the `APEX_SCALE` counts with `· AU SCENARIO VALUE`; canon shows **percentages only** (no canon source gives a hull count).

## 5. D5 — Showcase mode (FINAL)

### 5.1 Mode

Main-menu entry **Showcase** (`data-menu="showcase"`, tag `AU SCENES`), new screen `showcase` (chooser with one card per scene, `[data-scene="<id>"]`; options: pace 0.75 / 1 / 1.25 / 1.5, Record (`[data-action="record"]`, default off), Letterbox (on), Captions (on), Seed fixed / shuffle; `[data-action="play-scene"]`; summary panel after a scene). Footer text: "Scenes are scripted. Events the script forces are marked at the end. Showcase scenes are alternate-universe fiction and are never presented as canon." A scene refuses to build under a preset whose category is `canon` (`assertShowcasePreset` throws).

Scene = `{ id, title, subtitle, presetId, au: true, tag, seed, duration, config(seed, beatScale): BattleConfig, shots: Shot[], notes: string[] }` (`src/showcase/types.ts`). Scenes are TypeScript modules under `src/showcase/scenes/`; everything but the config factory is plain data; the factory uses the exported scenario helpers (`fleet`, `reaperFleet`, `base`) and attaches `beats` (`scripted: true`), `distant`, `maxDuration`.

Player (`src/showcase/player.ts`, `ShowcaseSession` on `BattleController`): HUD hidden, overlay off, orders/selection disabled, rig in `'shot'` mode driven by a `ShotListPlayer`; keys Space pause, `R` Record, `F` free-look toggle, `C` captions, `L` letterbox, `Esc` end early. Letterbox: two DOM bars `.letterbox.top/.bottom` sized `max(0, (H − W / 2.39) / 2)`; captions in the bottom bar. Caption styles: `tag` (persistent, bottom-left mono), `title` (centred 34 px), `tactical` (bottom centre, mono, orange rule), `quote` (italic, speaker tag suffixed `· AU`), `insert` (small panel top-right). **Record mode**: each frame advances exactly `1/60` s of render time (`accumulator += 1/60; while (accumulator ≥ SIM_DT) sim.step()`), nothing reads `performance.now()`, cursor hidden (`#app { cursor: none }`), frame counter `.rec-counter` `REC · 00:01:12 · F 4323`; audio schedule computed from render time. End: fade to black, summary `{ sceneId, title, auTag, seed, beatScale, shownSeconds, endedEarly, forced[], losses{natural, forced}, shotTypesUsed, shotTypesMissing, recorded, frames }` with buttons Replay, Shuffle seed, Back to scenes (`data-action="back-to-scenes"`), Main menu. Nothing on the summary calls the scene canon.

### 5.2 Camera vocabulary (`src/rendering/shots.ts`, `director.ts`, `cameras.ts`)

Shot types: `cut`, `hold` (micro-drift), `dolly` (framing A → B, `smooth`), `orbit` (azimuth sweep), `crane` (dolly whose elevation/distance dominates, `easeInOut`), `rack` (focus slides from subject A to B, camera moves `moveCamera` fraction), `longLens` (fov 8–18, distance ≥ 40 × size), `follow` (lagged, banking for fighters), `pov` (Reaper eye vantage). `BRIEF_SHOT_TYPES = ['dolly', 'orbit', 'crane', 'rack', 'longLens', 'hold', 'cut']` must all appear in scene 1 (test + e2e). `Framing = { az, el, dist, minDist?, lookAhead?, lookOffset?, fov?, roll? }` in the subject's frame (az 0 = behind, 180 = ahead; dist in multiples of size). Shots start at `at` (× beatScale) or `anchor: { beat, offset }` resolved from `beat_fired`/`fleet_volley_ordered.at`/`strike_scheduled.at`/`drive_run_started.endsAt`. Pacing validator: no shot < 1.2 s unless `reaction` (≥ 0.4 s); ids unique; overlaps ≤ `blendIn`. `CameraRig` gains mode `'shot'`, `setPose(pose, instant)`, field-of-view and roll lerp, a seeded `Rng('cam')` for shake. The `CinematicDirector` replaces `pickCinematicShot` for the `cinematic` mode with the cue table of `CINEMATIC_DESIGN.md` §2.5 (W1–W4, C1–C2, D1–D2, R1, P1–P2, F1, K, H, V; cadence: a wide every 20 s, a close-up every 30 s, a distance shot every 45 s; cue priority R1 > H > V > P2 > K > W4 > D1 > F1 > P1 > W3 > W2 > W1 > C2 > C1 > D2). `renderTime = sim.time − SIM_DT + alpha × SIM_DT` drives everything; wall time never does.

### 5.3 Scene 1 — "Apex: The Refuse at Sol" (`src/showcase/scenes/apexRefuseAtSol.ts`; from montage cards 16–23)

Config: `presetId 'prime_apex'`, `earth_orbit`, seed 2186, `maxDuration 400`, distant layer on with Apex captions, tag `ALTERNATE UNIVERSE · PRIME/APEX`. Fleets (nominal km):

| fleet id | faction / side | ships | formation | position | arrival |
| --- | --- | --- | --- | --- | --- |
| `sword-alliance` | alliance / A | `alliance_dreadnought_k` ×2 (Kilimanjaro, Orizaba), `alliance_dreadnought` ×2 (Fuji, Elbrus), `normandy_valkyrie` ×1, `alliance_carrier` ×1, `alliance_cruiser` ×10, `alliance_frigate` ×14, `normandy_sr2` ×1 (SSV Normandy SR-2, the unique command vessel), `alliance_frigate_thanix` ×3 (SR-2-pattern Thanix frigates, AU-built in numbers, §22.1) | `layered_line` | `(−14, 0, −28)` | beat |
| `sword-turian` | turian / A | `turian_dreadnought` ×3, `turian_cruiser` ×8, `turian_frigate` ×10 | `layered_line` | `(16, 0, −30)` | beat |
| `sword-asari` | asari / A | `destiny_ascension` ×1, `asari_dreadnought` ×1, `asari_cruiser` ×6 | `defensive_screen` | `(0, 3, −36)` | beat |
| `sword-quarian` | quarian / A | `quarian_heavy` ×1, `quarian_cruiser` ×5 | `defensive_screen` | `(−32, 0, −34)` | beat |
| `sword-geth` | geth / A | `geth_dreadnought` ×1, `geth_cruiser` ×3, `geth_frigate` ×4 | `stacked_wedge` | `(32, 0, −33)` | beat |
| `sword-cerberus` | cerberus / A | `cerberus_dreadnought` ×2 (Prometheus, Eos), `cerberus_heavy_cruiser` ×1 (Erebus), `cerberus_cruiser` ×6, `cerberus_frigate` ×8 | `strike_wedge` | `(1, 0, −30)` | beat `arrive_cerberus` |
| `sol-platforms` | alliance / A | `sol_defence_platform` ×2 | `static` | `(−6, 2, −18)`, `(8, −2, −18)` | 0, no flash |
| `reaper-sol` | reaper / B | `harbinger` ×1, `reaper_capital` ×4, `reaper_destroyer` ×10 (Oculi aboard) | `swarm_descent` | `(0, 4, 22)` heading `−z` | 0; `hold_formation`, `fightersDeployed false` |
| `reaper-sol-reserve` | reaper / B | `reaper_capital` ×2, `reaper_destroyer` ×4 | `strike_wedge` | `(−40, 0, 60)` heading `(0.4, 0, −1)` | `arrivalTime 95`, `arrivalFlash` |

References: `KILI = {name:'SSV Kilimanjaro'}`, `VALK = {name:'SSV Normandy Valkyrie'}`, `SR2 = {name:'SSV Normandy SR-2'}`, `ASC = {name:'Destiny Ascension'}`, `HARB = {name:'Harbinger'}`, `HC1 = {fleetId:'sword-cerberus', classId:'cerberus_heavy_cruiser', nth:0}`, `R1…R4 = {fleetId:'reaper-sol', classId:'reaper_capital', nth:0…3}`, `D2, D3 = {fleetId:'reaper-sol', classId:'reaper_destroyer', nth:1, 2}`, `F1 = {fleetId:'sword-turian', classId:'turian_frigate', nth:2}`, `CR1 = {fleetId:'sword-alliance', classId:'alliance_cruiser', nth:0}`, `AF0…AF3 = {fleetId:'sword-alliance', classId:'alliance_frigate', nth:0…3}`, `P1 = {fleetId:'sol-platforms', classId:'sol_defence_platform', nth:0}`, `TGT0 = {query:'nearest', to:{fleetId:'sword-alliance'}, side:'B'}`. `nth` indexes deployment order **including dead ships** (a dead match resolves to nothing and the beat is skipped).

Beat table (✱ = forced, logged as `scripted_event`):

| id | at | event |
| --- | ---: | --- |
| `tag` | 0.0 | caption `tag` "ALTERNATE UNIVERSE · PRIME/APEX", persistent |
| `title` | 0.5 | caption `title` "SOL · 2186 · THE REFUSE", 4 s |
| `arrive_alliance` / `arrive_turian` / `arrive_asari` | 0.0 / 3.0 / 5.5 | `spawn_wave`, stagger 3.0 / 2.5 / 2.0 |
| `scale` | 6.0 | caption `tactical` "38,420 WARSHIPS COMMITTED TO SOL · AU SCENARIO VALUE", 4.5 s |
| `arrive_quarian` / `arrive_geth` | 7.0 / 8.5 | `spawn_wave`, stagger 2.0 |
| `form_up` | 10.0 | `set_fleet_order side:A { order:'advance', holdFire:'spinal', fightersDeployed:false }` |
| `platforms` | 12.0 | caption `tactical` "612 DEFENCE PLATFORMS — SOL NETWORK · AU SCENARIO VALUE · 2 SIMULATED", 4 s |
| `reapers_advance` ✱ | 14.0 | `set_fleet_order reaper-sol { order:'advance', holdFire:'beams' }` |
| `oculus` | 16.0 | `launch_drones fleets:[reaper-sol], burst 6` |
| `arrive_cerberus` | 18.0 | `spawn_wave sword-cerberus`, stagger 1.5 |
| `iff` | 18.5 | caption `tactical` "CERBERUS BLACK FLEET — ALLIED IFF CONFIRMED · AU", 4 s |
| `heavy_guns` | 22.0 | `set_fleet_order [sword-alliance, sword-turian] { order:'attack', holdFire:'none' }` |
| `mark_r1` | 24.0 | `force_target fleets:[sword-alliance], target: TGT0` |
| `black_volley` | 26.0 | `fleet_volley [sword-cerberus], lead 2.0, window 1.2, target: TGT0` (the Titan guns fire the scene's first HADES rounds naturally; no detonation against intact barriers) |
| `line_free` | 30.0 | `set_fleet_order side:A { order:'attack', holdFire:'none', fightersDeployed:true }`; `set_fleet_order reaper-sol { order:'attack', holdFire:'beams' }` |
| `reaper_answer` | 32.0 | `fleet_volley reaper-sol, mounts 'beams', lead 1.5, window 2.0` |
| `ascension_threat` | 36.0 | `force_target ships:[R2], target: ASC` |
| `interpose` ✱ | 36.5 | `trigger_special interpose { ship: HC1, protect: ASC, against: R2, seconds: 14 }` |
| `hc_hit` ✱ | 39.0 | `force_target ships:[R2], target: HC1, forceNextShot:'hit'` |
| `ascension_salvo` ✱ | 41.0 | `force_target ships:[ASC], target: R2, forceNextShot:'hit'`; `fleet_volley [sword-asari], lead 1.0, window 1.3, target: R2` |
| `valk_focus` | 46.0 | `set_fleet_order sword-alliance { focusFire:true, priority:'reaper_capitals' }`; `force_target fleets:[sword-alliance], target: R3` |
| `escorts` | 46.0 | `force_target ships:[AF0..AF3], target: R3` |
| `degrade` ✱ | 54.0 | `set_barrier_fraction { ship: R3, fraction: 0.3, onlyLower: true }` |
| `solution` | 55.0 | caption `tactical` "TARGET SOLUTION SHARED. FIRE CONCENTRATED.", 3.5 s |
| `nova` ✱ | 56.0 | `nova_strike { shooter: VALK, target: R3, withThanix: true, force:'hit' }` |
| `r3_fails` ✱ | 58.5 | `destroy { ship: R3, killer: VALK, ifHullBelow: 0.9, cause:'kinetic' }` |
| `pov_kill` ✱ | 64.0 | `force_target ships:[R1], target: F1, forceNextShot:'hit'` |
| `harb_line` | 64.0 | caption `quote` "Your resistance will be corrected." speaker `HARBINGER · AU`, 3.5 s |
| `formation` | 69.0 | caption `tactical` "THE FORMATION DID NOT BREAK.", 3 s |
| `battery` | 70.0 | `force_target ships:[R1], target: { query:'top_damage_dealer', side:'A', window:10 }` |
| `converge` | 72.0 | `fleet_volley [sword-turian, sword-alliance], target: R1, lead 1.5, window 1.5, syncArrival: true` |
| `hades` ✱ | 73.0 | `hades_strike { shooter: KILI, target: R1, rounds: 1, force:'hit_penetrating' }` |
| `cripple` ✱ | 78.0 | `set_hull_fraction { HC1, 0.3, onlyLower }`; `set_subsystem { HC1, weapons, 0.1 }`; `set_subsystem { HC1, engines, 0.5 }` |
| `corridor` | 79.0 | `set_fleet_order sword-cerberus { order:'hold_formation' }` |
| `damping` | 80.0 | caption `tactical` "DAMPING FAILURE. TERMINAL VECTOR CONFIRMED.", 3 s |
| `drive` ✱ | 80.5 | `drive_attack { runner: HC1, target: R2, window: 14, force:'success', ignoreCorridor: true }` → impact 94.5 |
| `kill_confirmed` | 95.5 | caption `tactical` "BLACK FLEET DRIVE ATTACK — CAPITAL KILL CONFIRMED · AU", 4 s (no yield number, ever) |
| `harb_damaged` ✱ | 96.0 | `set_hull_fraction { HARB, 0.5, onlyLower }`; `set_barrier_fraction { HARB, 0.4, onlyLower }` |
| `harb_kills` ✱ | 97.0 | `force_target ships:[HARB], target: CR1, forceNextShot:'hit'` |
| `harb_exit` ✱ | 100.0 | `withdraw_ship { HARB }`; `interpose { D2, protect: HARB, seconds: 20 }`; `interpose { D3, protect: HARB, seconds: 20 }` |
| `allied_shift` | 102.0 | `set_fleet_order side:A { order:'attack_target', targetRef: HARB, priority:'reaper_capitals' }` |
| ~~`cycle`~~ | — | **removed (§22.2)**: the line "This cycle is not concluded." is now the transmission carried by the `flagship_mission_kill` event that `mission_kill` emits at 112.0; the caption layer renders flagship events as `quote` captions with the speaker `HARBINGER · AU`, so the words still appear, on the event instead of a timer |
| `second_volley` | 108.0 | `fleet_volley side:A, mounts 'spinal_and_beams', target: HARB, lead 2.0, window 1.5, syncArrival: true` |
| `mission_kill` ✱ | 112.0 | `mission_kill { ship: HARB }` → emits `flagship_mission_kill` (transmission "This cycle is not concluded.", rendered as the quote caption; the director's `FD` cue holds on Harbinger, §22.2) |
| `mk_caption` | 112.5 | caption `tactical` "HARVEST COMMAND VESSEL — MISSION KILL · AU", 4 s |
| `others` | 114.0 | `set_fleet_order reaper-sol { order:'attack' }` |
| `next` | 118.0 | caption `quote` "Mark the next one." speaker `SHEPARD · AU`, 3 s; `force_target fleets:[sword-alliance], target: R4` |
| `end_tag` | 130.0 | caption `tag` "ALTERNATE UNIVERSE · PRIME/APEX — SCENE END", 2 s |

`scene.duration = 132`. Shot list (28 shots; `anchor` = beat ± offset; framings as `{az, el, dist, fov}`):

| id | start | dur | type | subject / framing | card |
| --- | ---: | ---: | --- | --- | --- |
| S01 | 0.0 | 6.0 | dolly | `{fleetCentre:'sword-alliance'}` `{165,−20,3.4,34}` → `{155,−12,2.6}`, Earth limb in the lower third; fallback `{point:(−5.6,0,−11.2)}` | 16 |
| S02 | 6.0 | 6.0 | dolly | `{fleetCentre:'A'}` `{60,4,1.15,40}` → `{118,4,1.15}` | 16 |
| S03 | 12.0 | 3.5 | crane | `KILI` `{150,−25,1.4,55}` → `{30,−8,1.1}` | — |
| S04 | 15.5 | 3.5 | hold | `{fleetCentre:'reaper-sol'}` `{0,12,1.6}`, drift 0.03/9 | 20 |
| S05 | `arrive_cerberus` +1.0 | 4.0 | dolly | `{fleetCentre:'sword-cerberus'}` `{120,10,1.3}` → `{95,6,1.1}` | 17 |
| S06 | 23.0 | 4.5 | rack | `HC1` → `TGT0`, `{200,6,3.0}` about `HC1`, moveCamera 0.2 | 17 |
| S07 | `black_volley` +1.5 | 3.0 | longLens | `{between:[{fleetCentre:'sword-cerberus'}, TGT0], t:0.4}` `{90,6,45}` fov 14 | 17 |
| S08 | 30.5 | 3.5 | orbit | `KILI` `{40,8,1.5,45}` sweep −35 | — |
| S09 | `reaper_answer` +1.5 | 3.0 | cut | `CR1` `{200,20,2.2, lookAhead 4}` shake 0.6 | — |
| S10 | 36.5 | 5.5 | dolly | `ASC` `{250,12,1.8}` → `{290,6,1.5}`, look `{between:[ASC, HC1]}` | 18 |
| S11 | 42.0 | 3.5 | rack | `HC1` → `R2`, `{230,8,3.0}` about `HC1`, shake 0.3 | 18 |
| S12 | 45.5 | 3.5 | longLens | `{between:[P1, {fleetCentre:'B'}], t:0.25}` `{80,8,40}` fov 12 | §8.10 |
| S13 | 49.0 | 5.0 | dolly | `VALK` `{95,6,1.7,42}` → `{85,4,1.4}` | 19 |
| S14 | 54.0 | 1.7 | follow | `AF0` `{15,8,4}` lag 0.3 | 19 |
| S15 | `nova` −0.3 | 1.8 | cut | `VALK` `{160,3,0.9,50}` | 19 |
| S16 | `r3_fails` −1.0 | 6.5 | crane | `R3` `{120,25,2.2}` → `{100,5,1.6}`; fallback `{lastEvent:'ship_destroyed', filter:{role:'reaper_capital'}}` | 19 |
| S17 | `pov_kill` −0.3 | 8.8 | pov | `R1`, lookAtTarget | 20 |
| S18 | 72.5 | 4.0 | longLens | `{fleetCentre:'sword-turian'}` `{0,6,30}` fov 16 | 20 |
| S19 | 76.5 | 4.0 | dolly | `HC1` `{300,10,1.6,48}` → `{330,3,1.2}`; fallback `R2` | 21 |
| S20 | `drive` +0.0 | 14.5 | longLens | `{between:[HC1, R2], t:0.6}` `{100,5,70}` fov 12, drift 0.005/13; fallback `{lastEvent:'drive_run_impact'}` | 21 |
| S21 | 95.0 | 3.0 | hold | `{lastEvent:'drive_run_impact'}` `{90,10,2.0}` | 21 |
| S22 | 98.0 | 6.0 | orbit | `HARB` `{60,15,1.4,44}` sweep 50 | 22 |
| S23 | 104.0 | 6.0 | dolly | `{fleetCentre:'sword-alliance'}` `{180,20,1.2}` → `{150,10,1.0}`, look `HARB` | 22 |
| S24 | `second_volley` +2.0 | 3.5 | cut | `HARB` `{140,8,1.3}` shake 0.5 | 22 |
| S25 | 113.5 | 4.5 | crane | `HARB` `{100,30,1.6}` → `{100,0,1.1}` | 22 |
| S26 | 118.0 | 4.0 | rack | `HARB` → `SR2`, `{220,10,2.4}` about `HARB`, moveCamera 0.3 | 23 |
| S27 | 122.0 | 5.0 | rack | `SR2` → `R4`, `{190,6,2.0}` about `SR2`, moveCamera 0.5 | 23 |
| S28 | 127.0 | 5.0 | longLens | `{between:[{fleetCentre:'A'}, {fleetCentre:'B'}]}` `{75,10,60}` fov 11, drift 0.01/11; fade over the last second | — |

Forced-event ledger printed by the summary: 15 ✱ beats (20 specials). The summary also lists `FLAGSHIP EVENTS: 1 — Harbinger, mission kill, 01:52` (§22.2). The scene declares no winner. There are no character models; card 23 is carried by the Normandy SR-2 and two racks.

## 6. D6 — Custom battle: united fleets (FINAL; `CUSTOM_BATTLE_DESIGN.md` adopted in full)

- **Data model v2** (`src/scenarios/custom.ts`): `CustomBattleInput { version: 2; seed; rulesId; environment; startingDistanceKm; maxDuration; sides: Record<Side, { label?; fleets: CustomFleetInput[] }> }`, `CustomFleetInput { id; faction; name; formation; counts; arrivalTime; offset: {x,y,z}; playerControlled; presetId?; readiness? }`. The v1 shape (`sideA/sideB/reinforcement*`) is accepted forever through `migrateCustomBattle(raw): CustomBattleInput` (total, never throws; garbage → defaults with a note). Storage key stays `customBattle`. Both existing unit tests keep calling `buildCustomBattle` with the v1 literal.
- **Builder** `buildCustomBattle(input: AnyCustomBattleInput, rules?)`: migrate → validate (errors throw `CustomBattleError`) → deterministic layout (`lane = spreadIndex(i) × 20 km`, `depth = 6 × floor(i/2)`, `y = ±4` for every third fleet; user offset added last; `heading ±z`) → fleet specs with `mult 1`, `nameOffsets` so named vessels are unique across the whole battle → platform classes split into their own `static`/`defend_position` fleet (a platform fleet never "arrives") → `readiness` → `auContent`/`sideLabels`/`notes` → config `name = Custom${auContent ? ' (AU)' : ''}: <A label> vs <B label>`.
- **Validation** `validateCustomBattle(input, rules, budget): ValidationReport` with E1, E3, E4 and W2–W8, W10 as `CUSTOM_BATTLE_DESIGN.md` §1.5, **amended for the no-cap rule (§0.3 #19, §21)**: E2 (hard cap) does not exist; W1 becomes the **budget warning** `B1` ("Side A: 640 live hulls; this machine's measured budget is 420 per side. Expect the governor to lower effect density and LOD distance; the simulation stays exact. Scale to budget or launch anyway.") with `[data-action="scale-to-budget"]`; W9 becomes `B2` (small craft above the flight threshold are simulated as flights of four, §21.3); W6 (unique hulls) applies **across both sides** and includes `normandy_sr2` (§22.1). No per-role `classMax`: the only clamps are unique hulls at 1 per battle and an input sanity bound of 2,000 per class row. `scaleSideToBudget(side, budget)` keeps the deterministic reduction order of the former *Scale to cap* (frigate → cruiser → destroyer; never below 1 per class; capitals never below their rounded value) and is only ever run when the player presses the button. The budget comes from `PerfBudget` (§21.2), never from a constant.
- **`checkEnd` guard**: a side with pending (time- or beat-spawned) fleets counts as alive.
- **Presets** (`src/scenarios/customPresets.ts`): `FLEET_PRESETS` (sword_alliance, hammer_escort, hierarchy_battle_group, republics_fleet, union_first_fleet, geth_quarian_joint (bundle), citadel_fleet (bundle), cerberus_strike_fleet, cerberus_black_fleet (AU, `requires: isApexRules`), reaper_harvest_group, harbinger_armada (bundle), sol_platforms (AU heavy variant requires `heavyPlatforms`; the standard platform preset is available under every timeline), sword_combined (bundle, 125 hulls)) and `BATTLE_BUNDLES` (reference, destroyer_hunt, harbinger_at_earth, final_battle_sword, citadel_2183, apex_black_fleet, reaper_civil_war). Counts are `SIMULATION_ESTIMATE`; AU presets carry `au: true`, `provenance: 'AU_MODIFIED'`.
- **Screen** (`ui/screens/custom.ts`): three columns (side A cards, side B cards, conditions + presets + order-of-battle preview + checks), fleet cards with faction / composition / name / formation / arrival / player-controlled / readiness / offset / counts grouped by role (`super_dreadnought → reaper_capital → dreadnought → carrier → cruiser → reaper_destroyer → frigate → fixed_platform`), sticky side totals with the budget bar (blue under the measured budget, orange over it; never a hard stop) and `Scale to budget` (§21.2), legacy e2e hooks `data-count="sideA|sideB:<classId>"` and `data-faction="sideA|sideB"` on card 0 of each side, uniform hooks `data-count-fleet="A:0:<classId>"` etc. (full hook table in `CUSTOM_BATTLE_DESIGN.md` §2.8), phone-width rules (§2.9), `await loadCustomBattle()` before rendering (closes the re-render race). Environments add `citadel` and `relay`; distance slider 30–240 km.
- **Shared order of battle** `renderOrderOfBattle(config, side, opts?)` (`ui/components/orderOfBattle.ts`) used by the briefing and the custom preview; prints faction, formation, arrival, PLAYER/AI, AU badges, points, `CERBERUS (HOSTILE)`, and `Simulated hulls: N (compressed stand-in …)`.

## 7. D7 — Project Titan and HADES (FINAL)

- **Titan gun** = `apex_hyper_ma` (id kept for tests, saves and comparison text), renamed **"Project Titan heavy accelerator (HADES penetrators)"**: `mass_accelerator / kinetic`, damage 1,235, cooldown 6.0, range 48, projectileSpeed 44, accuracy 0.76, penetration 1.1, heat 24, arc 12, antiCapital, `specialAmmo: 12`, provenance `AU_MODIFIED` (note 'Project Titan, AU proposal; 25 kg at 4,000 km/s ≈ 47.8 kt ≈ 1.23 DKE'). Fitted by substitution under `hyperMassAccelerators` (predicate §1.2); the Black Fleet dreadnought and the Apex heavy dreadnoughts therefore carry it too.
- **HADES round**: `EffectiveWeapon.hadesRound = { armourBypass: 0.5, barrierEfficiencyMultiplier: 0.6, warhead: HADES_WARHEAD }` present only when `special.hadesRounds` and the weapon is the Titan gun; the first `specialAmmo` shots of each mount are HADES rounds (`WeaponState.specialAmmo` counts down; `Projectile.special: true`); later shots are ordinary slugs with `armourBypass 0`, multiplier 1. `alliance_broadside` and every other organic mass accelerator under Apex: `armourBypass 0` (the faction-wide bypass is gone).
- **Warhead** `HADES_WARHEAD = { damage: 2260, damageType: 'warhead', barrierEfficiencyMultiplier: 0, armourBypass: 1, subsystemOutage: { drop: 0.3, seconds: 8 }, regenSuppressSeconds: 6 }`: in `applyHit`, when a special round's kinetic step produced `hullDamage > 0` (a penetrating hit), a second `applyDamage` applies the burst inside the hull (barriers ignored, armour ignored), one subsystem chosen by `rng.pick(['weapons','engines'])` drops by 0.3 and is restored by 0.3 after 8 s (`ShipState.outageUntil`), the target's `regenSuppressedUntil = time + 6` (no barrier recovery, under fire or not, for 6 s), and `hades_detonation { shipId, targetId, pos, damage, outage }` is emitted. An intercepted, deflected or non-penetrating round gets no internal effect. HUD readiness strip shows `HADES 12` per Titan mount.
- **Wording rule** (enforced by `tests/wording.test.ts`): everywhere "penetrator with a nuclear warhead" / "HADES penetrators"; the brief's forbidden wording — the word "nuclear" immediately followed by "mass rounds" (regex `/nuclear\s+mass\s+rounds?/i`) — never appears in `src/`, `docs/design/`, `docs/apex/ADOPTION_PLAN.md`, `docs/apex/WORK_BREAKDOWN.md`, `README.md`, `AU_RULES.md`, `LORE_REFERENCE.md`, `KNOWN_ISSUES.md`, `CHANGELOG.md`; the two planning documents therefore write it as "nuclear … mass rounds" when they have to name it (the brief and the reference pack are excluded because they quote the forbidden phrase to forbid it). The codex entry is retitled **"Project Titan and HADES penetrators (AU)"** and drops "~3× canon slug energy".

## 8. D8 — Normandy Valkyrie (FINAL)

Class `normandy_valkyrie`, faction `alliance`, role `super_dreadnought`, every numeric field `AU_MODIFIED`, spawned only when `special.valkyrieAvailable` (scenarios/compositions) or in custom battles (sandbox, AU-badged). Name 'Normandy Valkyrie (AU command dreadnought)', shortName 'Valkyrie', named vessel `SSV Normandy Valkyrie`. lengthM 2000 ('AU LOCK length; engineering values AU proposal'); hull 22,500 / armour 180 / barriers 14,800 / regen 128; speed 0.65 / accel 0.09 / turn 4.5; sensors 130; signature 3.0; ecm 0.3; crewQuality 1.25 (EDI aboard); heatCapacity 260; hardpoints `nova_array` ×1 spinal (`[0,0,900]`, arc 10), `thanix_heavy` ×3 (`[0,−30,500]`, `[60,10,300]`, `[−60,10,300]`, arc 25, **per-mount heat**), `alliance_broadside` 6+6, `gardian` ×14, `nova_legacy` ×1 spinal (`requiresSpecial: 'legacyNova'`); no fighter complement; pointValue 900. Kill rule: `nova_array.degradedTargetBonus = { barrierFractionBelow: 0.5, multiplier: 1.5 }` applied in `applyHit` when `target.barriers / target.maxBarriers < 0.5` at impact; against an intact Reaper the round is 2.78 DKE (less than three dreadnought volleys). Scenes may force a kill (`special.destroy`, logged). Legacy Nova (`apex_legacy` only): 30,000 kinetic, 60 s cycle, magazine 12, `chargeTime 6` (the mount emits `weapon_charging` and cannot fire or turn during the charge), range 56, speed 400, accuracy 0.7, penetration 1.5, heat 90. Design: a 2,000 m Normandy-lineage hull (long reinforced spine, buried bridge, wide swept wings, blue drives at capital scale), original model.

## 9. D9 — Black Fleet drive attack (FINAL)

AU specialist event, `special.driveAttacks`: `'off'` (canon and every non-Apex preset, Cerberus Ascendant included), `'rare'` (Apex core: window 40 s, completion probability 0.25 rolled once from `sim.rng` at commitment, ≤ 3 attempts per battle), `'upper'` (Apex legacy: window 30 s, completion 0.35, ≤ 5 attempts, and on completion Reaper destroyers within 1.5 km of the impact die too). Eligibility (AI-initiated): faction cerberus, role cruiser or dreadnought (or super_dreadnought), `hull < 40 %`, `subsystems.engines ≥ 0.4`, target alive and a Reaper capital, corridor clear (no friendly hull within 2 km of the run line), in `earth_orbit` ≥ 30 km (compressed) from the planet centre, attempts remaining. The AI considers a run on each `shipDecision` of an eligible hull with probability 0.15 per decision. Run: movement goal = the target at `speedFraction 1` with an acceleration/speed multiplier ramping 1 → 4 over the window; weapons silent; still a valid target (interception = destruction before `endsAt`, a normal `ship_destroyed`). At `endsAt`: completion → `destroyShip(target, runner, 'drive_attack')` then `destroyShip(runner, undefined, 'drive_attack')`; failure → the runner alone dies (`apex_legacy` additionally applies 30 % hull damage to the target). Events `drive_run_started { runnerId, targetId, endsAt }`, `drive_run_impact { runnerId, targetId, pos, dir, success }`. No yield number is ever shown; the caption is `BLACK FLEET DRIVE ATTACK — CAPITAL KILL CONFIRMED · AU`. Effect: engine glow ×3 shifting blue-white with a growing flare trail, then one abrupt white flash and ~30 fragments in a 20° cone along the collision vector; the camera never orbits it (long lens).

## 10. D10 — Reaper AI behaviours (FINAL; see §0.3 #13 for the canon/apex split)

| Behaviour | Rule (all draws from `sim.rng`, evaluated on the Reaper 0.8 s decision interval) | Presets |
| --- | --- | --- |
| Rotate protection | a capital with barriers < 35 % swaps formation slot with the healthiest capital (slot exchange, no teleport) | all |
| Kill the active gun platform | `scoreTarget` +40 % for the enemy with the highest `stats.recentDamage` (exponentially decayed, τ = 10 s, updated in `applyHit`) | all |
| Cover a damaged capital | when a capital's hull < 50 %, the two nearest destroyers take `interpose` on it (same state the Showcase special sets) | all |
| Abandon a damaged harvest ship | no transports exist; the equivalent "a capital below 20 % hull stops protecting others" | `reaperDoctrine: 'apex'` |
| Withdraw a threatened group | a Reaper fleet whose remaining points < 30 % of start with no capital above 50 % hull performs a **tactical withdrawal** (fall back to its recovery station, regenerate, return; never leaves the battlespace) | `reaperDoctrine: 'apex'` |
| A wounded Reaper still kills | `mission_kill` leaves 46 % weapon factor; no shutdown mechanic exists anywhere | all |
| Others continue after Harbinger falls | `reaperCommandVulnerability` stays a temporary coordination penalty; regression test: Harbinger's death or mission kill changes no other Reaper's `subsystems` or weapon cooldowns, and at least one Reaper fires afterwards | all |
| Engage the platforms first | Reaper `scoreTarget` ×2.5 against `fixed_platform` within 1.3 × range while the fleet order is attack/advance | all |
| Never idle | a Reaper with no target in range advances toward the nearest enemy group at `speedFraction 0.6` | all |

`BALANCE_AUDIT.md` §11.2: bringing all four capitals into arc strengthens the canon Reapers; CORE re-measures the reference engagement after D10 lands (§3.5).

## 11. D11 — Effects to a Mass Effect look (FINAL; looks per `CINEMATIC_DESIGN.md` §4, render-only, seeded `Rng('fx')`)

1. **Pools first**: `BillboardPool` (two `InstancedMesh` quads with a shader billboard, additive and alpha, 4,096 each) replaces per-sprite draw calls; instanced debris (512); `farTracers` and `farBeams`; hull-shaped `BarrierShellPool`. Effects draw-call budget ≤ 72 at the Final Battle peak (today ≈ 1,000+). The HUD clock's draw-call count is the check.
2. **Mass accelerator rounds**: blue-white tracer core `0xdff4ff` (every faction; Mass Effect rounds are not faction-coloured), violet-white `0xe8e0ff` for HADES/Titan rounds, Nova ×2.2 length; ionised trail quad; muzzle flash sphere + lateral vent; hull impact = white flash, 6–12 slag sparks, lingering orange glow decal parented to the ship (≤ 8 per ship); near-miss barrier-edge flare on `projectile_near_miss`.
3. **Kinetic barriers (§8.3)**: a slightly inflated copy of the ship's own merged hull geometry (push along normals `0.035 × lengthUnits`, scale 1.06), fresnel shader with up to 8 hit uniforms (local position + age), hexagonal ripple spreading from the hit point (`v = 1.6 × size` units/s, 1.2 s), collapse = full-shell flash then hex cells dropping out over 0.6 s; visible only while a hit is live or collapsing; ≤ 16 visible; sphere only for fighters/Oculi. Colours organic `0x6fb0ff`, geth `0x9fb8ff`, Reaper `0xff6a4a`.
4. **Thanix**: orange-white core `0xffd9a0`, blue sheath `0x4fa0ff`, slag drip billboards along the beam, impact sparks tangent to the hull ("pours sideways"); heavy Thanix core radius × `sqrt(damage / 420)`.
5. **Reaper beams**: core `0xff6a40`, glow `0xa00010`, lens-flare billboard at the eye while firing; slit decal (white-hot → orange → scar) sweeping across the hull during the burst; `ship_destroyed` with `cause 'reaper_beam'` on a cruiser or frigate splits the pieces along the beam plane with opposite lateral velocities and an emissive edge.
6. **Capital deaths in three stages** (2.6 s dying time for dreadnought/super-dreadnought/carrier/Reaper capital, 1.1 s for cruisers/destroyers): internal flashes and venting; hull breaking into the existing pieces with a core flash and a DOM screen-white (`peak = clamp(40 × size / cameraDistance, 0.25, 0.9)`) for dreadnought-class; a slow expanding gas shell, smoke and debris. Reaper variant: red-tinted shell, eye dies at stage 2, running lights die one by one.
7. **HADES (§8.5)**: priming glow at the Titan muzzle on `strike_scheduled` (1.2 s); ordinary tracer; on `hades_detonation` a hard white flash, a **shadow pulse** (point light at the detonation plus `scene.environmentIntensity` dropped 0.35 → 0.08 for 0.12 s), a double ring shock (additive annulus + blue chromatic edge, radius `0.2 → 3 × size` over 0.6 s), venting jets and emissive flicker for 4–5 s, engine dim when the outage hit engines; sound `hades_internal` 0.6 s after the impact.
8. **Drive attack** (§9).
9. **Oculus**: original 12 m sphere with a single red lens, instanced small-craft path, far colour `0xff4a3a`; the 1 s beam renders through the beam pool at radius `0.02 × intensity`.
10. **Far tracer sparks**: a second `Points` (≤ 4,096) for projectiles whose shooter is at LOD `point` or farther than 150 units from the camera; Reaper beams beyond 200 units in `farBeams`. Volleys read as walls of light on long-lens shots. The existing ship point cloud is unchanged.
11. **Arrival flash** (`ship_arrival_flash`): blue-white sphere `0.6 × size` 0.25 s + streak along `−heading`, engine glow ×3 for 1 s. **Eyes waking** on a Reaper `advance` order (0.8 s ramp, 0.25 s stagger). **Mission kill**: eye to 0.15, lights flicker then 30 % dark, engine glow 0.3.
12. **Renderer for counts (§8.2 amended, §21)**: `ReducedInstancer` draws LOD-`reduced` hulls as per-class `InstancedMesh` pairs (hull, hullDark; damage tint via `instanceColor`); small craft instanced/pointed as today; a `Flight` (§21.3) renders its `craft` members as four instanced small craft in a fixed finger-four offset pattern about the flight's position. The **governor's visual ladder** (§21.2) is applied here: level 1 halves effect spawn density, level 2 multiplies `REDUCED_FACTOR`/`POINT_FACTOR` by 0.6, level 3 hides engine-glow sprites and the ionised trails, level 4 drops barrier shells to 6 visible and far sparks to 2,048; nothing in the simulation changes at any level.

## 12. D12 — Design lock-down (FINAL)

- `docs/design/README.md` (process), one sheet per class `docs/design/<classId>.md` with: three-view silhouette description, proportion table (length : beam : height and part ratios), signature features, colour and light placement (hex values), "must read as" checklist, frozen screenshot set (bow, profile, three-quarter; file names from the screenshot script), status `TARGET` or `LOCKED`. Once LOCKED, builders may add detail but not change proportions or silhouette.
- `docs/design/silhouettes.json`: `{ "tolerance": 0.08, "classes": { "<classId>": { "lengthUnits": n, "beamToLength": r, "heightToLength": r, "status": "TARGET" | "LOCKED" | "MEASURE" } } }`. `tests/silhouette.test.ts` builds every template headlessly (`getShipTemplate`, `Box3`), compares z-extent, x/z and y/z against the sheet within the tolerance for `TARGET`/`LOCKED` classes, skips `MEASURE` classes, and asserts `reaper_capital` z-extent / `alliance_dreadnought_k` z-extent = 2.0 ± 0.1 and `reaper_destroyer` z-extent = 1.6 ± 0.1. At INTEGRATION, `scripts/measure-silhouettes.ts` fills in the `MEASURE` classes (existing hulls that were not redesigned) and their status becomes `LOCKED`.
- Targets for redesigned or new classes (render units; 1 unit = 100 m):

| class | lengthUnits | beam / length | height / length | notes |
| --- | --- | --- | --- | --- |
| `reaper_capital` | 20.0 | 0.34 | 0.34 | body (hood + spine) 55–60 % of overall, arms ≈ 40 %, body width ≤ 0.14 L, six arms over the lower 240° |
| `harbinger` | 22.0 | 0.38 | 0.38 | broader hood, longer splayed arms, spine ridges |
| `reaper_destroyer` | 1.6 | 0.55 | 0.60 | four legs dominate; stubby spine; walking stance |
| `alliance_dreadnought_k` | 10.0 | 0.16 | 0.12 | long gun housing full length, stepped dorsal superstructure, wedge bow, flank sponsons, blue stripes |
| `alliance_dreadnought` (Everest) | 8.88 | 0.16 | 0.12 | same language, shorter |
| `alliance_cruiser` (York) | 7.0 | 0.18 | 0.14 | slab, raised stern block, forward wedge |
| `normandy_valkyrie` | 20.0 | 0.45 | 0.14 | Normandy lineage at capital scale |
| `cerberus_dreadnought` | 10.0 | 0.18 | 0.13 | charcoal / white / orange identification |
| `cerberus_heavy_cruiser` | 6.5 | 0.20 | 0.16 | dorsal Thanix housing |
| `sol_defence_platform` | 12.0 | 0.50 | 0.50 | station hull around two gun channels |
| `sol_platform_heavy` | 14.0 | 0.45 | 0.45 | one long super-accelerator channel |
| `alliance_super_dreadnought` | 18.0 | 0.18 | 0.13 | two spinal channels |
| `turian_super_dreadnought` | 19.0 | 0.26 | 0.14 | pincer bow |
| `reaper_oculus` | 0.24 (12 m at the 2× small-craft convention) | 1.0 | 1.0 | sphere with a single red lens |

- Reaper palette (recorded in the sheets, brief §8.8): hull `0x0e1016` (metalness 0.85, roughness 0.32, emissive `0x02030a`), hullDark `0x07080c`, plates `0x161a22` with a cold dark-blue sheen (`0x1a2230`, envMapIntensity 1.6), seams thin pale blue `0x7fb4ff` (emissive 1.2), running lights deep crimson `0xd01030` (emissive 2.5), aperture orange-red `0xff5a1f` with a `0xffb060` iris (emissive 4.5); no brown anywhere.
- Priority order: Sovereign-class, destroyer, Kilimanjaro/Everest, Alliance cruiser and frigate, Normandy SR-2, turian dreadnought, asari dreadnought and Destiny Ascension, geth dreadnought, quarian liveship, Cerberus cruiser, salarian cruiser, Oculus; then the new AU hulls.
- The owner's screenshots are study material only and are never committed; nothing in the sheets references them beyond "study notes".

## 13. D13 — Mass-scale numbers, Oculus numbers and the distant layer (FINAL)

### 13.1 Oculus (`reaper_oculus`, canon drone, numbers `SIMULATION_ESTIMATE`)

faction reaper, role fighter, lengthM `inferred(12)`, hull 48 / armour 5 / barriers 0 / regen 0, speed 3.6 / accel 1.8 / turn 110, sensors 30, signature 0.05, ecm 0.1, crewQuality 1.2, pointValue 4, `oculus_beam` ×1 forward; complements `reaper_capital` 8, `reaper_destroyer` 2, `harbinger` 12 (launched 2 per 0.4 s through `updateCarrier`; comms line "Deploying Oculus."). Fighter AI rule (all presets): stand-off = 0.9 × the range of the weapon that can engage the current target; fighters switch to the screen when drones appear (`priority 'fighters'` scoring kicks in automatically for anti-small weapons); strafing passes replace orbits (§8.1).

### 13.2 `src/data/apexScale.ts`

`APEX_SCALE` exactly as `PACK_ADOPTION.md` §3e (coalition 38,420 mobile warships, 612 platforms, 1,287 heavy combatants, nine command rows with class columns summing to the class totals; Alliance 15,292 hulls; Reapers initial 53,000 → Alpha 25 % → 39,750 → regional losses → Sol commitment 480 capitals + 12,000 destroyers + 1,800 transports + 750 processors; story targets), `provenance: 'AU_MODIFIED'`, with a unit test re-adding every row and column. Captions render as `38,420 WARSHIPS COMMITTED TO SOL · AU SCENARIO VALUE`; the strategic counter shows `simulated hulls: N of 38,420 (compressed)`. Canon scenarios never reference `APEX_SCALE`. Non-human carriers in the pack's roster are shown as "carriers / hangar ships (AU)" because the codex says humans alone field carriers.

### 13.3 Distant engagement layer

There is no hull cap (§21): the live simulation fields what the machine's measured budget allows and the layer represents the remainder. Simulation side (`src/simulation/distant.ts`): `DistantGroup { id, side, faction, label, count, bearingDeg, distanceKm (60–160 compressed), spreadKm, classMix }`, `DistantLayerConfig { enabled, groups, captions: 'apex' | 'canon' | 'none', firstLossAfter? }`, state `{ groups: { id, remaining, losses, firingRate }[] }` advanced at the end of `step()` after `checkEnd` from `sim.distantRng = sim.rng.fork('distant')` (created once in the constructor, so the real battle is bit-identical with the layer on or off — asserted). Loss rate per group per second `λ = 0.0009 × pressure(side) + 0.6 × realLoss(side, 20 s) / 20`, stochastic rounding, no losses before the first real `ship_destroyed` or `firstLossAfter` (30 s). Events `distant_update` every 5 s and `distant_group_broken` below 10 %. `BattleResult` unchanged; the results screen prints a separate "DISTANT ENGAGEMENT (STATISTICAL)" line. Groups come from `APEX_SCALE.coalition.byCommand` minus simulated hulls under Apex, and from `count = 12 × simulated` per real fleet under canon (captions without absolute numbers). Render side (`src/rendering/distant.ts`): drive-light `Points` (≤ 4,096, faction engine colours, slow drift toward the enemy) and tracer-spark `Points` (≤ 8,192, shader-advanced) 600–1,600 units beyond the fleets; 2 draw calls.

## 14. New catalogue items with provenance (FINAL)

### 14.1 Pack label → our tag

| Pack label | Our tag | Rule |
| --- | --- | --- |
| CANON, already anchored in `LORE_REFERENCE.md` | `CANON_CONFIRMED` | adopt |
| CANON, plausible but not anchored | `CANON_INFERRED` + note "pack claim; verify in-game codex entry" | adopt; promote only after a developer checks the entry |
| DERIVED from canon inputs | `CANON_INFERRED` (note "derived") | e.g. 38.72 kt |
| DERIVED from AU inputs | `AU_MODIFIED` | e.g. Titan 47.8 kt |
| AU LOCK / AU PROPOSAL | `AU_MODIFIED` (note 'AU LOCK' / 'AU PROPOSAL') | never shown under canon |
| SIM on a canon hull/weapon | `SIMULATION_ESTIMATE` | starting value, adapted |
| SIM on an AU-only object | `AU_MODIFIED` (note 'SIM calibration value') | the object is AU |
| UNKNOWN | no value | never substitute a convenient number |

### 14.2 New or changed ship classes

| id | faction · role | len m | hull / armour / barriers / regen | speed / accel / turn | sens / sig / ecm / crew | hardpoints | pts | heatCap | provenance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `reaper_oculus` | reaper · fighter | 12ⁱ | 48 / 5 / 0 / 0 | 3.6 / 1.8 / 110 | 30 / 0.05 / 0.1 / 1.2 | `oculus_beam` ×1 | 4 | 100 | design `CANON_CONFIRMED` (ME2), numbers `SIMULATION_ESTIMATE` |
| `alliance_dreadnought_k` | alliance · dreadnought | 1000ᵉ | = `alliance_dreadnought` | = | = | = | 320 | 200 | class `CANON_CONFIRMED` (Kilimanjaro-class named), length `SIMULATION_ESTIMATE` (fan chart) |
| `normandy_valkyrie` | alliance · super_dreadnought | 2000ᴬ | 22,500 / 180 / 14,800 / 128 | 0.65 / 0.09 / 4.5 | 130 / 3.0 / 0.3 / 1.25 | `nova_array` ×1, `thanix_heavy` ×3, `alliance_broadside` 6+6, `gardian` ×14, `nova_legacy` ×1 (legacy) | 900 | 260 | `AU_MODIFIED` (AU LOCK) |
| `cerberus_dreadnought` (re-based) | cerberus · dreadnought | 1000ᴬ | 10,800 / 135 / 6,300 / 69 | 0.65 / 0.09 / 4.5 | 110 / 1.9 / 0.3 / 1.1 | `alliance_dn_main` ×1 (→ Titan under Apex), `thanix_heavy` ×1, `alliance_broadside` 4+4, `gardian` ×10 | 360 | 200 | `AU_MODIFIED` (designProvenance re-tagged from estimate) |
| `cerberus_heavy_cruiser` | cerberus · cruiser | 650ᴬ | 4,900 / 70 / 2,400 / 32 | 0.85 / 0.15 / 8 | 85 / 1.25 / 0.3 / 1.05 | `cerberus_cruiser_main` ×1, `thanix_heavy` ×1, `javelin_rack` ×1, `alliance_broadside` 2+2, `gardian` ×6 | 150 | 160 | `AU_MODIFIED`; names `['Erebus', 'Nyx']` |
| `sol_defence_platform` | alliance · fixed_platform | 1200ᵉ | 36,000 / 220 / 13,000 / 73 | 0 / 0 / 2.5 | 140 / 3.4 / 0.2 / 1.1 | `platform_gun` ×2 (`[±120, 0, 200]`, arc 60), `gardian` ×12 | 700 | 240 | existence as modelled `SIMULATION_ESTIMATE` |
| `sol_platform_heavy` | alliance · fixed_platform | 1400ᴬ | 44,000 / 240 / 16,000 / 80 | 0 / 0 / 2.0 | 150 / 3.6 / 0.2 / 1.1 | `platform_gun_heavy` ×1 (arc 40), `gardian` ×16 | 1,000 | 260 | `AU_MODIFIED` ("Sol heavy platform, super-accelerator (AU)") |
| `alliance_super_dreadnought` "Olympus-class heavy dreadnought (AU)" | alliance · super_dreadnought | 1800ᴬ | 19,000 / 170 / 11,500 / 95 | 0.52 / 0.07 / 3.2 | 120 / 2.8 / 0.25 / 1.1 | `alliance_dn_main` ×2 (`[±60, 0, 850]`, arc 12), `alliance_broadside` 8+8, `gardian` ×16 | 560 | 260 | `AU_MODIFIED`; names `['SSV Olympus Mons', 'SSV Mauna Kea']` |
| `turian_super_dreadnought` "Praetor-class heavy dreadnought (AU)" | turian · super_dreadnought | 1900ᴬ | 20,000 / 185 / 11,000 / 95 | 0.5 / 0.07 / 3.2 | 115 / 2.9 / 0.2 / 1.15 | `turian_dn_main` ×2, `alliance_broadside` 8+8, `gardian` ×16 | 570 | 260 | `AU_MODIFIED`; names `['PFS Praetor', 'PFS Legate']` |
| `destiny_ascension` | asari · **super_dreadnought** | unchanged | unchanged | | | | | 260 | role is a simulation classification (`SIMULATION_ESTIMATE` note); canon ship |
| `reaper_capital`, `harbinger`, `reaper_destroyer`, `alliance_cruiser` | see §3.2 | | | | | | | | |
| `normandy_sr2` "Normandy SR-2 (command vessel)" (§22.1) | alliance · frigate, `flagship: true`, unique | 216ⁱ | 700 / 14 / 520 / 16 | 1.6 / 0.4 / 26 | 80 / 0.3 / 0.6 / 1.3 | `alliance_thanix` ×1, `disruptor_torpedo` ×2, `gardian` ×2 | 32 | 110 | design `CANON_CONFIRMED` (the ship and its Thanix refit are canon), numbers `SIMULATION_ESTIMATE` (today's Thanix-frigate values, unchanged) |
| `alliance_frigate_thanix` re-described "SR-2-pattern Thanix frigate" (§22.1) | alliance · frigate | 216ⁱ | 680 / 14 / 500 / 16 | 1.55 / 0.38 / 25 | 78 / 0.32 / 0.5 / 1.15 | `alliance_thanix` ×1, `disruptor_torpedo` ×2, `gardian` ×2 | 30 | 110 | design `SIMULATION_ESTIMATE` ("the trilogy shows only the Normandy itself; sister hulls of the pattern are a simulation estimate"); under Apex presets the class is built in numbers and the codex/database carry the `AU_MODIFIED` note "Apex timelines build the SR-2 pattern in numbers" (`auDynamic`) |

Named vessels: `NAMES.alliance_dreadnought_k = ['SSV Kilimanjaro', 'SSV Orizaba', 'SSV Tai Shan', 'SSV Shasta', 'SSV Aconcagua']`; `NAMES.alliance_dreadnought = ['SSV Everest', 'SSV Fuji', 'SSV Elbrus', 'SSV Logan', 'SSV Denali', 'SSV Trafalgar']` (CANON_INFERRED where the pack lists them, original otherwise); `NAMES.cerberus_dreadnought = ['Black Fleet Flagship Prometheus', 'Eos', 'Hyperion']`; `NAMES.normandy_valkyrie = ['SSV Normandy Valkyrie']`; `NAMES.normandy_sr2 = ['SSV Normandy SR-2']`; `NAMES.alliance_frigate_thanix = ['SSV Thermopylae', 'SSV Austerlitz', 'SSV Sekigahara', 'SSV Adwa', 'SSV Plataea', 'SSV Carrhae', 'SSV Talas', 'SSV Lechfeld']` (original names, `SIMULATION_ESTIMATE`; the old single entry `['SSV Normandy SR-2']` moves to `normandy_sr2`). `UNIQUE_CLASS_IDS = ['harbinger', 'destiny_ascension', 'normandy_sr2', 'normandy_valkyrie']` — unique **per battle**, never scaled by `fleetStrength`, clamped to 1 across both sides by the custom editor (§22.1). `NAMED_FLAGSHIPS = ['Harbinger', 'Sovereign', 'Destiny Ascension', 'SSV Normandy SR-2', 'SSV Normandy Valkyrie']` (§22.2).

### 14.3 New or changed weapons

| id | kind / type | dmg | cd | range | speed | acc | pen | heat | magazine / special | arc · flags | provenance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `apex_hyper_ma` Titan gun | MA / kinetic | 1,235 | 6.0 | 48 | 44 | 0.76 | 1.1 | 24 | `specialAmmo 12` HADES, then unlimited slugs | 12 · C | `AU_MODIFIED` |
| `nova_array` | MA / kinetic | 2,780 | 6.0 | 52 | 48 | 0.8 | 1.2 | 30 | magazine 40; `degradedTargetBonus {0.5, ×1.5}` | 10 · C | `AU_MODIFIED` |
| `nova_legacy` | MA / kinetic | 30,000 | 60.0 | 56 | 400 | 0.7 | 1.5 | 90 | magazine 12; `chargeTime 6`; `requiresSpecial 'legacyNova'` | 8 · C | `AU_MODIFIED` (high power) |
| `thanix_heavy` | thanix / thanix_stream | 625 /s × 1.6 s | 5.0 | 34 | ∞ | 0.8 | 0.95 | 30 `perMountHeat` | — | 25 · C | `AU_MODIFIED` (mount of canon tech) |
| `javelin_rack` | disruptor_torpedo / warhead | 325 × `salvo 4` | 20.0 | 16 | 2.4 | 0.9 | 0.9 | 6 | magazine 4; missileHp 14 | 150 · C | existence `CANON_INFERRED`, values `SIMULATION_ESTIMATE` |
| `oculus_beam` | reaper_beam / reaper_beam | 48 /s × 1.0 s | 2.4 | 3.5 | ∞ | 0.7 | 0.6 | 0 | — | 40 · S | `SIMULATION_ESTIMATE` |
| `platform_gun` | MA / kinetic | 1,000 | 2.0 | 44 | 30 | 0.74 | 0.85 | 18 | — | 60 · C | `SIMULATION_ESTIMATE` (DN-equivalent channel; never substituted) |
| `platform_gun_heavy` | MA / kinetic | 2,400 | 5.0 | 56 | 36 | 0.78 | 1.0 | 40 | — | 40 · C | `AU_MODIFIED` |
| canon cadence/heat changes | see §3.2 | | | | | | | | | | |

`WeaponDef` additions: `specialAmmo?`, `warhead?`, `degradedTargetBonus?`, `chargeTime?`, `salvo?`, `perMountHeat?`, `requiresSpecial?: keyof SpecialTechnology`. All optional; canon weapons never set them, so canon effective = catalogue stays true.

## 15. AU separation — exact codex and UI wording (FINAL)

- **Preset names**: `Prime/Apex — Apex core`, `Prime/Apex — Apex legacy (high power)`. Category badge `AU` everywhere a rule set is shown.
- **Codex**: every AU paragraph for `prime_apex` starts with the literal **`ALTERNATE UNIVERSE (Apex): `**; for `apex_legacy` with **`ALTERNATE UNIVERSE (Apex legacy, high power): `**. Canon paragraphs never mention Titan, HADES, Valkyrie, Black Fleet dreadnoughts, drive attacks, heavy platforms, super-dreadnoughts or any `APEX_SCALE` number. AU-only entries have `canon: ['This … does not exist in the Mass Effect trilogy.']` (exact sentence per entry in `PACK_ADOPTION.md` §3d). `tests/codex.test.ts` enforces the prefixes and the absence of Apex terms in canon blocks. The helper `apexAu(core, legacy?)` returns `{ prime_apex: core.map(prefix), apex_legacy: (legacy ?? core).map(prefixLegacy) }`.
- **Captions**: every caption carrying an Apex figure ends in **` · AU SCENARIO VALUE`**; the persistent Showcase tag is **`ALTERNATE UNIVERSE · PRIME/APEX`**; AU dialogue speakers are suffixed **` · AU`**.
- **HUD**: top bar shows `ALTERNATE UNIVERSE CONTENT` when `config.auContent`; `HIGH POWER — EASIER BY DESIGN` when `special.legacyNova`; hostile Cerberus fleets are labelled `CERBERUS (HOSTILE)`; the status line appends `· DISTANT: A 94 % · B 97 %` when the layer is on.
- **Briefing**: existing orange line `ALTERNATE UNIVERSE: <name>. Results do not represent canon Mass Effect 3.`; `Simulated hulls: N (compressed stand-in for the canon engagement)`; under Apex with the layer on `+ distant engagement layer — statistical; the 38,420-warship figure is an AU scenario value`.
- **Results**: existing `ALTERNATE UNIVERSE RESULT — not representative of canon Mass Effect 3.`; under Apex the footnote `Story targets (15–35 % coalition losses, orbital control in 1–3 days) are AU narrative targets, not simulated outputs.`; `DISTANT ENGAGEMENT (STATISTICAL)` line.
- **Custom battle**: AU classes/presets/bundles/timelines badged `AU`; a launched config with AU hulls is named `Custom (AU): …`; the composition menu groups read `CANON-SHAPED` and `ALTERNATE UNIVERSE`; nothing shows the 38,420 / 53,000 figures.
- **Fleet Database**: AU hulls carry "(AU)" in the class name and the `AU` design-provenance badge; the Titan gun, Nova, heavy Thanix, Javelin, super-accelerator carry `AU` badges; statistics changed by the active timeline keep the orange `AU` marker.
- **Showcase**: chooser cards show `ALTERNATE UNIVERSE`; the summary never says canon; the footer sentence in §5.1.
- **HADES**: "penetrator with a nuclear warhead" / "HADES penetrators"; never the forbidden "nuclear … mass rounds" wording (§7).
- **Drive attack**: `BLACK FLEET DRIVE ATTACK — CAPITAL KILL CONFIRMED · AU`; no yield numbers.
- **Flagship events (§22.2)**: the banner reads, on three lines, `HARBINGER DESTROYED · 00:03:41` / `KILLED BY SSV Kilimanjaro — Project Titan heavy accelerator (HADES penetrator) · 4 HITS IN THE FINAL SALVO` / `"<final transmission>"` with the footer `FINAL TRANSMISSION · ORIGINAL TEXT (SIM)` under canon presets and `FINAL TRANSMISSION · ORIGINAL TEXT · AU` under AU presets, followed by the fleet comms reaction line; the lighter form reads `<NAME> MISSION-KILLED · <time>` and omits the killer line. Transmissions are never game quotations and the footer says so.
- **Normandy (§22.1)**: the class names are `Normandy SR-2 (command vessel)` and `SR-2-pattern Thanix frigate`; a fleet list, order of battle or results table never shows two vessels named `SSV Normandy SR-2`.
- **Performance (§21)**: the only performance words a player sees are warnings, never caps: `LIVE HULLS 640 · MEASURED BUDGET 420 PER SIDE · GOVERNOR LEVEL 2 (EFFECT DENSITY, LOD DISTANCE)` in the HUD clock line, and the briefing/custom-editor warning text of §6. The custom editor never says "limit" or "cap"; it says "budget".
- **Platforms**: standard platform description "AU scenario asset" is **wrong** under this plan; the standard platform reads "Orbital defence platform as modelled in the simulation (no canon description of Earth's orbital network exists); the 612-platform Sol network is an AU caption value." The heavy variant reads "AU: Sol heavy platform with a super-accelerator; not part of the trilogy."

## 16. Existing tests that change (and why)

| Test | Change |
| --- | --- |
| `tests/saves.test.ts` "overwrites a slot by id and describes saves" | literal → `'Prime/Apex — Apex core'` |
| `tests/battle.test.ts` canon reference engagement | keep `winner 'B'`, `A.survivalPercent < 30`; `reaperCapitalLost` becomes `>= 1 && <= 2`; add `B.destroyed < B.deployed`; add seed 9 |
| `tests/battle.test.ts` Prime/Apex reference | add `A.capitalLost >= 1`, `A.survivalPercent < 85`, `A.destroyed` between 7 and 19 (TUNE bounds of §1.3) |
| `tests/battle.test.ts` Reaper intelligence | canon seed 7 ∈ {MODERATE, ELEVATED, SEVERE}, Apex ∈ {SEVERE, CRITICAL}, `apex.reaperCapitalLosses > canon.reaperCapitalLosses` (with the §3.2 score re-base canon reads ELEVATED) |
| `tests/battle.test.ts` "retreat ends the battle by withdrawal" | becomes "disengage pulls the fleet behind its line, barriers recover, nobody escapes": `escaped === false` for every non-fighter, barrier regeneration on withdrawn hulls, an `order_issued` event |
| `tests/battle.test.ts` "every scenario builds under every preset" | add `apex_legacy` to the preset list and the new scenario ids if any |
| `tests/timelines.test.ts` "Reaper technology unchanged" | add `apex_legacy` |
| `tests/timelines.test.ts` canon effective = catalogue | add `heatCapacity`, `barrierRegenUnderFire`, `barrierLoadThreshold`; assert both barrier fields are 0 for every non-Reaper class and that no canon weapon has `hadesRound` |
| `tests/damage.test.ts` HADES test | `applyRulesToWeapon(alliance_dn_main, 'alliance', DN, PRIME_APEX)` → `id 'apex_hyper_ma'`, `specialAmmo 12`, `hadesRound.armourBypass 0.5`, `hadesRound.warhead.damage 2260`; a HADES round against a full-barrier capital passes hull damage, an ordinary Titan slug does not; `alliance_broadside` under Apex has `armourBypass 0` |
| `tests/damage.test.ts` kinetic absorption | unchanged for the frigate; sibling: a 70-point round against `reaper_capital` is fully absorbed with `barrierDamage` reported as the load (4.9) and a 1,000-point round loads 1,000 |
| `tests/battle.test.ts` "custom battles build and run" | unchanged literal (v1 shape migrates) |
| any test or fixture that spawns the Normandy as `alliance_frigate_thanix` | `tests/campaign.test.ts` (Fifth Fleet composition via `createCampaign`), `tests/battle.test.ts` custom literal and salarian custom literal are **unchanged** (they do not name the class); `scenarios/index.ts` lines 208, 340, 487, 512, 533, `campaign/engine.ts:142` and `ui/screens/custom.ts` defaults switch to `normandy_sr2` (§22.1); a new assertion in `tests/normandy.test.ts` pins "exactly one `normandy_sr2` in every scenario under every preset, never scaled" |
| `tests/campaign.test.ts` engagement tests | `buildEngagement` reads the budget (§21.4) instead of the 70 constant: the test that resolves the Fifth Fleet engagement keeps passing (counts are below any budget); a new test checks that a 1,500-hull fleet is compressed to the budget and the remainder appears as `config.distant.groups` |
| `e2e/game.spec.ts` | unchanged; new tests are additive (`WORK_BREAKDOWN.md` §5) |

## 17. Limitations and honesty notes (shipped in `KNOWN_ISSUES.md` by stage D)

Two sides only (a hostile Cerberus group fights beside the Reapers and is not shot at by them); scenes force events and say so; no character models; the HADES shadow pulse is a light pulse plus an IBL drop, the ring shock is a double ring, Reaper limbs do not articulate; Record mode makes frames deterministic for an external capture and encodes no video; the distant layer is statistics (AU values under Apex, percentages under canon) and never changes a result; firing solutions make the opening volley mostly misses by design; there is no hull cap and therefore no promise that any order of battle runs at real time — the governor measures the machine, degrades visuals first, then warns, and a 1,000-vs-1,000 battle on a weak machine runs below real time with the HUD saying so (§21); the benchmark ladder is published per machine class, not guaranteed; the heavy cruiser's survival of one capital beam in scene 1 depends on the calibration landing as specified (the scene degrades gracefully and reports); fighters are rendered at 2×; sound is a cinematic convention (vacuum carries none).

## 18. Deferred (no stub shipped)

Transports, processors, support ships, corvette and generic heavy-cruiser roles, Kwunu, Collector cruiser, SR-1 survival variant, light delay and sensor uncertainty, stealth-heat link, projector subsystem, Berlin-class cruiser variant, destroyer `pointValue` re-base, in-browser video encoding, "play as side B", bilateral campaign diplomacy, Thanix 350 / 5.0 pending verification.

## 19. Feedback round 2 — decisions and owners (every item appears in `WORK_BREAKDOWN.md` with the same owner)

| § | Requirement | Decision (FINAL) | Owner stage(s) | Acceptance check |
| --- | --- | --- | --- | --- |
| 8.1 | Movement feel | `movement.ts`: approach bearing + heading lock (deadband 10°, ≤ 0.05 rad/s, lock inside 1.1 × engagement range), deceleration into range, doctrine facing, critically damped station keeping (`kp 0.5`, `kd 2√kp`), frigate run/turn-in/extend machine, fighter strafing passes with PD-envelope repulsion, Reaper loose cluster (anchor ≤ 0.03 rad/s) | CORE | `tests/movement.test.ts`: heading rate ≤ 0.06 rad/s, mean angular rate about the anchor < 0.02 rad/s over 10 s windows after first contact, no non-fighter path turns > 360° one way; footage check at INTEGRATION |
| 8.2 (amended) | 3D formations; **no fixed per-side cap**; scale to operational limits with a performance governor and a published benchmark ladder | formations `layered_line`, `stacked_wedge`, `box`, `swarm_descent`, `broadside_line`, `static`; `SpatialGrid` (cell 4 km) for projectiles, PD, targeting, nearest (no O(n²) per step); staggered decision intervals; cached side centroids; **fighters and Oculi simulated as flights of four above the threshold**; `PerfBudget` + `PerfGovernor` (pure ladder in `src/core/perfGovernor.ts`, measured at runtime, visuals degraded first, warnings in the custom editor and briefing, player override); the campaign engagement scaler uses the budget; the distant layer takes the remainder; renderer `ReducedInstancer` + flight instancing + the visual ladder; benchmark ladder 100 / 300 / 600 / 1,000 hulls per side — full specification §21 | CORE (sim: grid, stagger, flights, budget, governor ladder, campaign scaler, perf scripts) + A (instancer, flight rendering, ladder application) + B (controller measurement loop, HUD line) + C (editor and briefing warnings, override) + D (docs: `PERF_LADDER.md` folded into README/KNOWN_ISSUES) | `tests/formations3d.test.ts`; `tests/perf.test.ts` (300 vs 100, 400 steps < 4 s on CI; `querySegment` equals brute force); `tests/governor.test.ts` (degradation ladder with hysteresis); `tests/flights.test.ts`; `npm run perf` publishes steps/s and draw calls for 100 / 300 / 600 / 1,000 per side and **300 vs 100 must run at ≥ 20 simulation steps per wall-clock frame headless** (≥ 1,200 steps/s on the dev machine); e2e Battle of Earth completes |
| 8.3 | Hull-shaped barriers | `BarrierShellPool` (§11.3) | A | screenshot 07 (dreadnought under fire shows a hull-shaped shimmer with a ripple) |
| 8.4 | Procedural sound, seismic AU rounds | `src/audio/voices.ts` recipes (`ma_fire`, `ma_travel`, reworked impacts/beams/Thanix, `seismic_au` crack → 0.35 s duck → delayed 35/70 Hz "bwaaam" with a 4 s tail, `hades_internal`, `drive_flare/impact`, `arrival_flash`); light-before-sound `scheduleDelay(d) = clamp(d / 3, 0, 1.2)` s; settings toggles `Seismic AU rounds` and `Light-before-sound delay`; `seismic_au` counts triple in the voice budget | A (engine, voices, settings rows, `battleAudio.ts`) + B (controller wiring, render-time clock in Record mode) | `tests/audio.test.ts` (pure timelines); settings toggle visible (e2e, D); a Record-mode capture of scene 1's `black_volley` carries the crack–gap–boom |
| 8.5 | HADES nuclear effect | §7 mechanics (CORE) + §11.7 visual and `hades_internal` sound (A); wording lint (D) | CORE + A + D | `tests/hades.test.ts` (burst only after penetration, outage, regen suppression, events); screenshot 03; `tests/wording.test.ts` |
| 8.6 | Nobody sits still, nobody runs | tactical withdrawal replaces escape (recovery station behind the line, regen ×1.5 out of contact, re-engage at 70 % barriers / 20 s / threat); `escaped` only for recovered fighters; `checkEscapes` deleted; 12 % auto-retreat deleted; combat-ineffective end rule (< 5 % points and no capital); `withdraw` fleet-wide fall-back; `retreat` relabelled **Disengage** (same `data-order`), holds at 1.5 × standoff and never ends the battle; Reapers never idle; carriers/liveships weave and fire; every unit with a weapon in range fires or moves for a solution | CORE (+ B relabels the HUD button) | `tests/withdrawal.test.ts`: after first contact ≤ 10 % of a side's live ships stationary and silent for 10 s; `escaped` only on fighters; recovered barriers before re-engagement |
| 8.7 | Misses and firing solutions | `solutions.ts`: per-target `q` builds at `0.08 × sensors × crew × range × ecm × (1 − 0.5·accelFrac)` per second, decays 0.15/s off-target, −0.25 on a barrier flare > 300, −0.2 per hard manoeuvre, `q₀ 0.10` (+0.15 shared); `p_hit × (0.25 + 0.75·q)`; spinal guns need bow arc **and** predicted intercept in arc; broadsides fire freely at `accuracy × 0.85`; miss offset `radius × (1.2 + (1 − q) × 4 × rng)`; projectile `ttl` ×2.2 of range; `projectile_near_miss` event; `scoreTarget += 0.3·q`; HUD `Solution 62 %` | CORE (+ B HUD line, A near-miss flare) | `tests/solutions.test.ts`: hit rate < 25 % over the first 6 s, > 60 % over 20–40 s on an unmanoeuvring target; manoeuvre drops `q` ≥ 0.2; replay identical |
| 8.8 | Reapers bigger, blacker, correct lights | render lengths Sovereign 20 units, Harbinger 22, destroyer 1.6; proportions and palette of §12; `buildReaper` derives `lengthUnits` from its `Box3`; `harbinger.lengthM` 2,200; Kilimanjaro-class data class at 1,000 m; cruiser 700 m; collision radii follow; balance re-checked | A (models, palette) + CORE (data) + D (sheets) | `tests/silhouette.test.ts` (2.0 ± 0.1 relation); screenshot 08; palette values in `docs/design/reaper_capital.md` |
| 8.9 | Super-dreadnoughts | role `super_dreadnought`; Ascension reclassified; Valkyrie; Olympus-class and Praetor-class (§14.2); `special.superDreadnoughts`; every role switch extended; Titan predicate covers the role | CORE (data/sim) + A (models) + C (custom rows, briefing) + D (codex, database, sheets) | role appears in formations/AI/results/intel/overlay; custom clamps 4; screenshot 10 with the AU badge in the caption |
| 8.10 | Fixed orbital platforms | role `fixed_platform`; classes §14.2; `maxSpeed 0` slew-only movement; `fleet.static`; move orders rejected with `order_rejected` → toast `PLATFORMS CANNOT MANOEUVRE`; placement on an arc ahead of the defending line (Final Battle 2 canon / 2 + 2 heavy Apex; campaign homeworld battles `min(4, round(defence × 4))` standard + 1 heavy under Apex; custom platform split); Reaper ×2.5 target weight; Showcase subject | CORE + A (model) + C (UI) + D (codex) | `tests/platforms.test.ts`: position unchanged after 600 steps, heading change ≤ turnRate, `issueOrders(move)` emits `order_rejected`, a Reaper fleet in range targets a platform before a cruiser; screenshot 09 |

## 20. Acceptance of the release (INTEGRATION; details in `WORK_BREAKDOWN.md` §7)

A 60-second Final Battle recording at `beatScale 1` shows arrival waves, line formation, Reaper advance, a simultaneous volley and the first losses in that order; the Showcase scene runs to its end with zero console errors and `SHOT TYPES 7 / 7`; the screenshot set 01–18 exists; `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` are green; `npm run perf` publishes the benchmark ladder (100 / 300 / 600 / 1,000 hulls per side: steps/s headless, ms/frame and draw calls in the browser) into `docs/apex/PERF_LADDER.md` and the 300-vs-100 row shows ≥ 20 steps per wall-clock frame; `tests/governor.test.ts` covers the degradation ladder; a Prime/Apex Final Battle shows exactly one `SSV Normandy SR-2` and N `SR-2-pattern Thanix frigate` hulls; a headless run that kills Harbinger logs exactly one `flagship_destroyed` event with every required field and the results e2e asserts the banner text; all AU content keeps its labels; no screen presents the Apex scene as canon.

## 21. Scale without caps — performance governor, flights and the benchmark ladder (brief §8.2 as amended; FINAL)

### 21.1 The rule

**No fixed per-side cap exists anywhere in V2.** `SHIP_CAP_PER_SIDE`, `HARD_SHIP_CAP`, `ENTITY_BUDGET`, the custom editor's E2 error and per-role `classMax`, and the campaign's `MAX_SHIPS_PER_SIDE = 70` are not built or are deleted. The only hard limits are identity limits (unique hulls, §22.1) and an input sanity bound of 2,000 per class row in the editor (typing protection, not a cap). The simulation and the renderer must scale as far as the machine allows: spatial hashing for targeting, point defence and collision (no O(n²) per step), staggered decision intervals, fighters and Oculi simulated as flights when numerous, instanced rendering for identical hulls, LOD plus the far point cloud, and the statistical distant-engagement layer for whatever exceeds the live budget. A **performance governor** measures step and frame cost at runtime, degrades visuals first and then warns; the player may override every warning.

### 21.2 `PerfBudget` and `PerfGovernor` (pure, `src/core/perfGovernor.ts`; measured by the controller; applied by the renderer)

```ts
export interface PerfBudget { liveHullsPerSide: number; smallCraftPerSide: number; source: 'default' | 'measured'; measuredAt?: string; machine?: string }
export const DEFAULT_PERF_BUDGET: PerfBudget = { liveHullsPerSide: 400, smallCraftPerSide: 160, source: 'default' };
export type GovernorLevel = 0 | 1 | 2 | 3 | 4;
export interface GovernorSample { stepMs: number /* mean sim step cost over the window */; frameMs: number /* mean render frame cost */; hulls: number; smallCraft: number }
export interface GovernorState { level: GovernorLevel; since: number; samples: number; lastSample?: GovernorSample }
export const GOVERNOR_TARGET = { frameMs: 16.7, stepsPerFrame: 20, raiseAfter: 1.5 /* s above target */, lowerAfter: 6.0 /* s below 70 % of target */ };
export function governorStep(state: GovernorState, sample: GovernorSample, now: number): GovernorState   // pure ladder with hysteresis
export function budgetFromLadder(rows: { hulls: number; stepsPerSecond: number; frameMs: number }[]): PerfBudget   // the largest row that meets GOVERNOR_TARGET
```

- **Measurement** (stage B, `BattleController.loop`): a 1 s rolling window of `stepMs` (wall time of `sim.step()` calls ÷ steps) and `frameMs` (`view.update + render`), fed to `governorStep` once per second. Record mode never measures (it is deterministic by construction and never degrades).
- **Ladder** (hysteresis: raise one level after 1.5 s above target, lower one level after 6 s below 70 % of target; never two levels per second): level 0 nothing; **1** effect spawn density × 0.5 (sparks, slag, drips, far-spark spawn rate); **2** `REDUCED_FACTOR`/`POINT_FACTOR` × 0.6 and `FIGHTER_POINT_DISTANCE` × 0.6; **3** engine-glow sprites and ionised trails hidden, barrier shells ≤ 6 visible; **4** far sparks ≤ 2,048, death debris ≤ 128, one near beam pair (rest in `farBeams`). The simulation is never touched by any level: the same seed gives the same result at level 0 and level 4 (asserted).
- **Budget**: `budgetFromLadder` turns the measured ladder (§21.5) into `PerfBudget`; the controller also refines it in play (if level 4 is reached with N live hulls per side, `liveHullsPerSide = min(budget, round(0.8 × N))`, persisted). Persistence: `prefs.perf = { budget: PerfBudget; governor: boolean }` (`core/storage.ts`, CORE); `governor: false` disables the ladder (a settings toggle) but never the warnings. Headless and tests use `DEFAULT_PERF_BUDGET`.
- **Warnings, never caps**: the custom editor (B1/B2, §6) and the briefing (`This order of battle fields 640 live hulls per side against a measured budget of 420. Expect reduced effect density and LOD distance; the simulation stays exact.`) warn when `totals.hulls > budget.liveHullsPerSide`; both have a `Scale to budget` button and both launch regardless. HUD clock line (stage B): `LIVE HULLS 640 · BUDGET 420 · GOVERNOR 2`. A "Re-measure performance budget" button in Settings runs the in-browser ladder (§21.5) and stores the result.

### 21.3 Flights (`src/simulation/flights.ts`, CORE)

When a side's live small craft (fighters and Oculi, counting flight members) would exceed `FLIGHT_THRESHOLD = 64` per side, every further launch creates a **flight** instead of single craft: one `ShipState` with `flight: { craft: 4; maxCraft: 4; classId }`, hull pool `4 × craft hull`, armour and barriers per craft, point value `4 ×`, speed/turn of the craft; damage removes one member per `craft hull` lost (`flight_member_lost` event), weapons fire `craft` shots per volley (one `weapon_fired` event with `shots: 4`), target scoring treats it as four craft; `lossesByClass` and `fighters_launched` count craft, not flights; `escaped` on carrier recovery returns the surviving members to the hangar. The decision is deterministic (depends only on live counts at launch time). Rendering (stage A): four instanced small craft in a finger-four pattern (offsets `(0,0,0)`, `(−0.4,0,−0.5)`, `(0.4,0,−0.5)`, `(−0.8,0.1,−1.0)` × lengthUnits) about the flight position; far: one point per member.

### 21.4 Campaign engagement scaler and the remainder

`buildEngagement(state, pending, budget: PerfBudget = DEFAULT_PERF_BUDGET)`: `kA = min(1, budget.liveHullsPerSide / alliedTotal)`, `kB` likewise; hulls compressed away are emitted as `config.distant.groups` per fleet (`count = total − simulated`, class mix from the fleet's counts, canon captions = percentages only), so a 1,500-hull campaign fleet is still represented and its losses are scaled back as today (the layer's statistical losses are **not** applied to the campaign; only the real battle's result is, unchanged from v0.11). The UI passes `app.prefs.perf.budget`.

### 21.5 Benchmark ladder (`npm run perf`, published in `docs/apex/PERF_LADDER.md`)

- `scripts/perf-sim.ts` (headless, node): for each of 100 / 300 / 600 / 1,000 hulls per side, build a mixed canon custom battle (per side: dreadnoughts 6 %, carriers 2 %, cruisers 32 %, frigates 60 % for the coalition; capitals 25 % / destroyers 75 % for the Reaper side; seed 11; deep space 80 km), run 1,200 steps after a 200-step warm-up, report **steps/s**, **steps per 16.7 ms frame**, projectiles in flight, grid cells, and the time split (movement / weapons / projectiles / AI) from `sim.profile`. Also the brief's named row **300 vs 100**.
- `scripts/perf.mjs` (Playwright, SwiftShader, as today): the same ladder in the browser: `drawCalls`, ms/frame at tactical and follow cameras, governor level reached, LOD counts; it writes `docs/apex/PERF_LADDER.md` with a machine string.
- **Gate (brief §8.2 check)**: the 300-vs-100 headless row must show ≥ 20 steps per wall-clock frame (≥ 1,200 steps/s) on the dev machine; `tests/perf.test.ts` asserts the CI-safe bound 300 vs 100 × 400 steps < 4 s and `SpatialGrid.querySegment` ≡ brute force; the e2e Battle of Earth still completes; `tests/governor.test.ts` covers the ladder. If the gate is missed the levers are, in order: grid cell size (4 → 6 km), decision stagger (0.25 → 0.4 s), projectile `ttl` cap for misses beyond 2.2 × range, beam-tick damage batching (apply every 2 ticks with the same total), and only then the flight threshold (64 → 48). Never the fixed step.

### 21.6 Tests (CORE unless noted)

`tests/perf.test.ts` (gate and grid equivalence), `tests/governor.test.ts` (ladder: rises after 1.5 s over target, never skips a level, lowers after 6 s under 70 %, `budgetFromLadder` picks the largest passing row, level never changes a `BattleSimulation` result), `tests/flights.test.ts` (threshold, member loss, craft counting in results, determinism, recovery), `tests/campaign.test.ts` addition (budget compression + distant remainder), `tests/custom.test.ts` B1/B2 and `scaleSideToBudget`; stage A: `tests/effectsPool.test.ts` ladder application table is pure (`ladderParams(level)`).

## 22. Feedback round 3 — one Normandy, many SR-2-pattern frigates; the flagship event (brief §9; FINAL)

### 22.1 `normandy_sr2` versus `alliance_frigate_thanix`

- **`normandy_sr2`** (new class, CORE data): faction alliance, role frigate, `flagship: true`, in `UNIQUE_CLASS_IDS`; name `Normandy SR-2 (command vessel)`, shortName `Normandy`; every statistic is today's Thanix-frigate value (§14.2 row), `designProvenance: canon('The Normandy SR-2 and its Thanix refit are canon (ME2–ME3). Original model.')`, `lengthM inferred(216)`; `NAMES.normandy_sr2 = ['SSV Normandy SR-2']`. Present only where the world state says so (the existing `normandy` option, default yes; the campaign spawns it when `shepardAlive`), **always exactly one**, never scaled: `fleet()` treats every `UNIQUE_CLASS_IDS` member as fixed with `count = min(1, base)`, and `buildCustomBattle` keeps the first across both sides (W6). Model (stage A): `buildAllianceFrigate('normandy')` — the existing stealth hull with the Thanix refit, now with a distinct dorsal sensor spine so it reads as the one ship.
- **`alliance_frigate_thanix`** becomes the **SR-2-pattern Thanix frigate** (`name: 'SR-2-pattern Thanix frigate'`, shortName `Thanix frigate`): same hardpoints, `crewQuality 1.15` (below the Normandy's 1.3), hull 680 / barriers 500 / speed 1.55 / sensors 78 / ecm 0.5 (a pattern hull, not the one-off), `designProvenance: estimate('SR-2-pattern stealth frigate with the Thanix refit. The trilogy shows only the Normandy itself; a small number of sister hulls is a simulation estimate. Apex timelines build the pattern in numbers (AU).')`, own original name list (§14.2), description rewritten. Counts: canon Final Battle 2, canon Battle of Earth 0, Alliance Fleet Engagement 0 (so the reference balance is untouched), Apex Sol scenarios 3–4 before `fleetStrength` scaling; the class is **not** in `fixedClasses`, so Apex multipliers build it in numbers, and the codex/database `auDynamic` line reads `ALTERNATE UNIVERSE (Apex): the SR-2 pattern is built in numbers; under canon only a handful of sister hulls exist (simulation estimate).` Model: `buildAllianceFrigate('pattern')` — the same hull family without the Normandy's unique markings and with a squadron stripe.
- **Every reference updated** (CORE unless noted): `scenarios/index.ts` lines 208, 340, 487, 512, 533 (`normandy_sr2` for the Normandy, `fixedClasses` no longer needed for it), `campaign/engine.ts:142`, `NAMES`, `UNIQUE_CLASS_IDS`, `customPresets.ts` (`sword_alliance` card: `normandy_sr2: 1`, `alliance_frigate_thanix: 0` canon / 3 Apex), `ui/screens/custom.ts` defaults (stage C), `BUILDERS` (stage A), codex `ship_normandy` + new `ship_sr2_pattern` (stage D), database rows (automatic), `tests/normandy.test.ts` (CORE): exactly one `normandy_sr2` in every scenario under every preset with `normandy: yes`, none with `no`, never scaled at `fleetStrength 2.0`, no two ships named `SSV Normandy SR-2` in any built config, `alliance_frigate_thanix` count scales under Apex.
- **Check (brief §9.1)**: a Prime/Apex Final Battle shows one `SSV Normandy SR-2` and N `SR-2-pattern Thanix frigate` hulls; the fleet list never shows two Normandys (e2e `[data-count-fleet]` for `normandy_sr2` is a 0/1 input; `tests/normandy.test.ts`).

### 22.2 `flagship_destroyed` and `flagship_mission_kill`

```ts
export interface FlagshipEventBase { shipId: string; name: string; classId: string; faction: FactionId; side: Side; pos: Vec3; tier: 'harbinger' | 'flagship'; transmission: string; reaction: string }
| { t; type: 'flagship_destroyed'; ...FlagshipEventBase; killer?: { shipId: string; name: string; classId: string; faction: FactionId; weaponId?: string; weaponName?: string }; damageType?: DamageType; finalSalvoHits: number }
| { t; type: 'flagship_mission_kill'; ...FlagshipEventBase }
```

- **Who is a flagship**: `ShipState.flagship = cls.flagship === true || NAMED_FLAGSHIPS.includes(ship.name)` (Harbinger, Sovereign, Destiny Ascension, SSV Normandy SR-2, SSV Normandy Valkyrie); `tier` is `'harbinger'` for Harbinger, `'flagship'` otherwise.
- **Emission**: `destroyShip` emits `ship_destroyed` first, then exactly one `flagship_destroyed` for a flagship (`killer` from the destroying weapon's shooter and `weaponId`/`weaponName`, `damageType` from the cause, `finalSalvoHits` = hits taken in the last 3 s from `ShipState.recentHitTimes`), with `transmission = rng.pick(TRANSMISSIONS[key].destroyed)` and `reaction = rng.pick(TRANSMISSIONS[key].reaction)` drawn from `sim.rng` in step order. `special.missionKill` on a flagship emits `flagship_mission_kill` with the `missionKill` line. A ship emits each of the two at most once (`ShipState.flagshipEvents`).
- **Text** (`src/data/transmissions.ts`, CORE; original, never a game quotation; Harbinger's lines measured, declarative and contemptuous): Harbinger `missionKill: ['This cycle is not concluded.']`, `destroyed: ['This vessel ends. The harvest does not.', 'You have removed one voice. The chorus remains.', 'Count this. It changes nothing.']`, `reaction: ['All ships: Harbinger is down. Press the attack.', 'Confirmed kill on the command vessel. Shift targets.']`; Sovereign `destroyed: ['Your victory is a rounding error.']`; Destiny Ascension `destroyed: ['Ascension is lost. Hold the line for Thessia.']`, `reaction: ['The Ascension is gone. Close ranks.']`; Normandy `destroyed: ['Normandy actual — we are going down. Finish it without us.']`; Valkyrie (AU) `destroyed: ['Valkyrie to all ships: the line is yours.']`. Every string is `SIMULATION_ESTIMATE` (original text) and the UI footer says `ORIGINAL TEXT (SIM)`; under AU presets the footer adds `· AU`.
- **Consumers**: HUD battle log (stage B): a full-width banner entry (`.log-flagship`, §15 wording) and the comms channel plays the transmission as a **priority transmission** (interrupts the 4–8 s cooldown, red speaker tag, 6 s on screen, `priority_comms` sound); results screen (stage C): the same banner at the top of the destruction log, also in the exported event log (the event is in `sim.events`); Reaper intelligence (CORE `reaperIntel.ts`): when a `flagship_destroyed` with `tier 'harbinger'` exists the headline becomes `HARVEST COMMAND VESSEL DESTROYED. THE CYCLE CONTINUES WITHOUT IT.` and the lines add `Coordination penalty active` under `reaperCommandVulnerability`; cinematic director (stage B): cue `FD` at the top of the priority list, a 6 s (`harbinger`) / 4 s (`flagship`) `hold` on `{ lastEvent: 'flagship_destroyed' }` `{ az 110, el 18, dist 1.8 }` with drift 0.02/8, preempting any shot; Showcase (stage B): the caption layer renders both events as `quote` captions with the speaker tag (`HARBINGER · AU` under Apex) and the summary lists `FLAGSHIP EVENTS`.
- **Other Reapers keep fighting**: unchanged D10 rule; `tests/flagship.test.ts` asserts that after Harbinger's destruction at least one Reaper fires within 10 s and no other Reaper's `subsystems` changed on that tick.
- **Check (brief §9.2)**: `tests/flagship.test.ts`: a headless custom battle (8 Kilimanjaro-class + 8 cruisers vs Harbinger alone, canon, seed 3) kills Harbinger and logs **exactly one** `flagship_destroyed` with `t`, `killer.name`, `killer.weaponName`, `damageType`, `finalSalvoHits ≥ 1` and a non-empty `transmission`; `tests/determinism` covers the event; `e2e/finalBattle.spec.ts` (stage D) destroys Harbinger through `sim.special.destroy` with a named Alliance killer, opens results and asserts `.log-flagship` contains `HARBINGER DESTROYED` and `KILLED BY`.

### 22.3 Owners

| § | Requirement | Owner stage(s) | Acceptance |
| --- | --- | --- | --- |
| 9.1 | `normandy_sr2` unique command vessel; `alliance_frigate_thanix` SR-2-pattern class; every reference updated; editor clamps the Normandy to one per battle | CORE (classes, names, scenarios, campaign, presets, tests) + A (two hull variants) + C (editor defaults and 0/1 row, order of battle) + D (codex entries, database wording, README) | `tests/normandy.test.ts`; Prime/Apex Final Battle order of battle shows one Normandy and N pattern frigates (e2e, D) |
| 9.2 | `flagship_destroyed` (+ `flagship_mission_kill`) with timestamp, killer and weapon, damage type, final-salvo hits, final transmission; banner in log and results; priority comms; intel headline; held shot; showcase uses the event; other Reapers continue | CORE (events, transmissions, intel) + B (HUD banner, priority comms, director cue, showcase caption/summary) + C (results banner, export) + D (e2e, KNOWN_ISSUES note on original text) | `tests/flagship.test.ts`; `e2e/finalBattle.spec.ts` banner assertion |
