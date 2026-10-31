# Balance audit: canon calibration (D3), heat, cruiser vs destroyer, fighters and Oculus drones

Status: audit and proposal. Nothing in `src/` or `tests/` was changed. Every number below was measured by running the real deterministic `BattleSimulation` headlessly (`node --import tsx/esm scripts/_audit_*.ts`) with the candidate values patched into the catalogue **in memory** and the three candidate mechanics emulated by patching `BattleSimulation.prototype`; the scratch scripts were deleted after the audit as required (section 12 says exactly what they did so they can be recreated or, better, turned into `tests/calibration.test.ts`). All emulated code drew randomness only from `sim.rng`; no `Math.random` was introduced. The measured values are what the implementer must reproduce after the real change; where the emulation could differ from a real implementation this is called out.

Units: simulation damage points. 1 DKE (one dreadnought kinetic round, ≈ 38.7 kt) = 1000 points (lead decision D2). "DN" = dreadnought, "CA" = cruiser, "FF" = frigate, "DD" = Reaper destroyer, "capital" = Sovereign-class. Duels are deep space, canon rules, 40 km (nominal) starting separation, Alliance `line_abreast` vs Reaper `capital_column`, 600 s limit; "muted" means every Reaper weapon was given an infinite cooldown after construction so only the barrier/hull model is measured. Reference engagement = `alliance_fleet_engagement` with `fleet_scaling: fixed` (8 DN, 1 carrier with 24 Tridents, 16 CA, 30 FF, Normandy vs 4 capitals + 8 destroyers), the scenario pinned by `tests/battle.test.ts`.

## 1. Summary

**Where we are (shipped numbers).** The codex benchmark (D3) is violated in every direction:

| D3 statement | Shipped behaviour (canon, measured) |
| --- | --- |
| Two dreadnoughts cannot overwhelm a capital's barrier | Two **do**: without return fire the barrier collapses at 117 s and the capital dies at 213 s (10/10 seeds). The barrier only regenerates 3 s after the last hit, so any sustained fire wins; the 42,000-point pool is pure capacity. |
| Three impose growing load | Three kill it at 131 s (muted). |
| Four destroy it, expensively | Four kill it at 99 s (muted); with return fire all four die (10/10) having taken the barrier to 28 % and the hull to 100 %. Six DN win 6/10, eight 10/10. |
| Dreadnought cadence 2 s | 4.0 s (turian/salarian/geth 3.8). At the canon cadence with today's heat (18 per shot, capacity 100, cooling 8 %/s) a dreadnought's spinal gun alone exceeds its cooling, and in fleet battles dreadnoughts are already overheated 8–16 % of their life at 4 s because broadsides share the pool. |
| A cruiser has a credible path to kill a destroyer | 0/10 with return fire, 0/10 in 600 s **without** return fire (min barrier 73 %). A destroyer's 6,500-point barrier regenerates 80/s in the gaps between a cruiser's ~30 %-accurate shots. |

Also measured and relevant: disruptor torpedoes are intercepted 100 % of the time in every canon battle (67–132 fired, 0 impacts), Trident fighters all die within 60 s of launch (9–14 within 40 s) with zero torpedo impacts, and in the reference engagement two of the four Reaper capitals fire only 28–30 shots in 240 s (formation geometry keeps them out of arc), which is the main reason the shipped Reaper side is as weak as it is.

**Why numbers alone cannot fix it.** With a pause-only regeneration rule, "two cannot overwhelm" can only be bought with a barrier so large that four cannot kill it either. The benchmark needs recovery **under** load, and once the capital recovers 1,000 points/s continuously (exactly two dreadnoughts' worth at 2 s cadence), everything else follows from arithmetic (section 5).

**Recommendation (P3, section 6).** Three small mechanics and a re-based Reaper catalogue:

- M1 Reaper capital barriers regenerate continuously, also under fire (`barrierRegenUnderFire` 1.0 on `reaper_capital` and `harbinger`; everything else keeps today's 3 s pause rule).
- M2 Barrier load threshold on capitals: a hit smaller than 1 DKE loads the barrier by `absorbed × hit/1000` (the round is still stopped). This is what keeps the canon fleet battle Reaper-won once dreadnoughts fire at 2 s; without it seed 7 of the reference engagement flips to an Alliance victory.
- M3 Heat capacity per hull role (dreadnought 200, carrier 180, cruiser 140, frigate 110) with spinal heat 12 and broadside heat 3, so the 2 s cadence is sustainable (measured 0 % overheat, peak dreadnought heat 6–12 %).
- Catalogue: every Council dreadnought spinal gun 2.0 s; `reaper_capital` 7,000 barrier / 12,000 hull / 320 armour / regen 1,000 per s; `harbinger` 10,500 / 18,000 / 380 / 1,300; `reaper_destroyer` 1,000 / 700 / 120 / 25; capital beam cooldown 7.5 → 6.0 s; torpedo hit points 12 → 24 (fighter torpedo 8 → 16); Reaper point-defence damage 18 → 12.

Measured under P3: two DN never collapse the barrier (minimum 71 %), three collapse it at 48 s and kill at 105 s without return fire, four collapse it at 20 s and kill at 50 s; with return fire four lose (0/10) while six win 10/10 losing 1.2; one cruiser beats a destroyer in ~30 % of duels (kill at 63–89 s, dies at ~74 s otherwise), two cruisers 10/10; the canon reference engagement is a Reaper victory on seeds 7/8/9 with 2/2/1 capitals lost and 7–9 % Alliance survival; the Battle of Earth is a Reaper victory with one capital lost; the campaign tests pass; 22 of the 23 replayed balance assertions pass, the one failure being the Reaper threat-level thresholds (section 8). The one D3 clause that P3 does **not** deliver is "four destroy it" **with return fire**; section 5.3 shows why that clause and "two cannot overwhelm (all hits)" are mutually exclusive under any continuous-recovery barrier model, and section 10 shows the one mechanic that buys it (an 8 s post-collapse regeneration gap) flips every canon fleet battle to an Alliance victory. This is a lead decision; the default proposed here keeps the isolated benchmark literal and the fleet battles canon.

Oculus (section 9): a drone with 48 hull / 5 armour / no barriers and a 48 pts/s × 1 s anti-small beam every 2.4 s, 8 per capital and 2 per destroyer, plus one AI rule (fighters orbit at the range of the weapon that can engage the current target), makes an isolated 24-vs-24 screen last 69–97 s and lifts Trident median life in the Battle of Earth from 42 s to 68 s without changing the battle's outcome.

## 2. How the current model shapes outcomes

These are properties of `src/simulation/damage.ts`, `battle.ts` and `ai.ts` that every number below is subject to. None of them is changed by P3 except where stated.

1. **Barrier regeneration is pause-gated** (`battle.ts updateHousekeeping`): `barrierRegen` applies only when `time - lastHitAt > 3`. Any target under continuous fire has no regeneration at all. With a 4 s cadence a single dreadnought's hits are 4 s apart, so the capital *does* regenerate between them (the measured barrier traces wobble upward); at 2 s cadence the window never opens. The cadence change alone therefore roughly halves the capital's effective durability on top of doubling the incoming fire: with today's pools and all hits, two DN at 2 s kill the capital in 78 s (barrier down at 42 s) instead of 180 s.
2. **Armour is a flat subtraction per hit**: `hull = max(0.15 × amount, amount − armour × (1.2 − penetration))`. A capital's 320 armour removes 112 points from every 1,000-point dreadnought round (penetration 0.85), 224 of a 140-point broadside round (so broadsides do the 15 % floor, 21 points) and effectively all of a frigate's 70. For beams the subtraction is applied **per 50 ms tick**, because `updateWeapons` calls `applyDamage` with `damage × dt`: a capital beam (1,900/s, 2.8 s) against a dreadnought (armour 130) loses 26 per tick × 56 ticks = 1,456 of its 5,320-point burst (27 %), against a frigate (armour 12) 134, against the Destiny Ascension (armour 200) 42 %. This quirk is load-bearing in the current tuning (it is why two Reaper beams need ~20 s to kill a dreadnought rather than ~10 s). P3 leaves it alone; the earlier scratch proposal P1 emulated a per-burst armour application and had to re-tune every beam — not needed for D3.
3. **Hit probability** (`damage.ts hitProbability`): range factor `1 − 0.45 × (d/range)²`, target profile `min(1.6, 1.05 × √signature)` (a 2 km capital saturates at 1.6, a 160 m destroyer with signature 0.4 gives 0.66), ECM, crew, sensors, and a closing-speed penalty for projectiles. Measured spinal hit rates: 57–73 % for dreadnoughts in fleet battles, 63–83 % in duels, 29–33 % for cruisers against destroyers (plus physical misses: a rolled hit still has to intersect an 80 m sphere that accelerates during the ~1 s flight). The AI stand-off (0.825 × preferredRangeFactor × max range ≈ 29 km nominal for Alliance dreadnoughts) sits at range factor ≈ 0.78.
4. **Heat**: every class has capacity 100 (`applyRulesToShip` returns `100 × t.heatCapacity`), cooling 8 % of capacity per second, overheat above 100 % until back under 55 %; an overheated ship fires nothing with `heat > 0`. Spinal, broadside and GARDIAN heat share the pool. Measured fleet-battle dreadnought heat: 7.4 per engaged second, 50 % spinal / 50 % broadsides (section 3.4).
5. **Point defence vs torpedoes**: `missileHp` 12 against Reaper PD damage 18 means one hit kills a torpedo; a Reaper capital has 8 emitters firing every 0.4 s at 42 % base accuracy, a destroyer 3, so a torpedo crossing 2.6 km (sim) of PD envelope at 0.88 km/s receives ~9 expected hits. Interception is effectively certain (section 3.2).
6. **AI**: the Alliance fleet focus-fires one target (`fleet.focusTargetId`, doctrine `focusFire` 0.7, stickiness 1.3). Reapers pick the highest `pointValue` target in range (`threatPriority` 0.9) — dreadnoughts first. Reaper capital beams have a 70° arc and the Reaper `strike_wedge` keeps two of the four capitals out of arc for most of the reference engagement (shots fired per capital, baseline seed 7: 128 / 30 / 62 / 28). Fighters orbit their target at 0.9 × their **longest** weapon range (torpedo, 3.24 km sim), which is outside PD reach (2.6 km) for the target but not for the target's neighbours, and which keeps them out of their own gun range against other fighters.
7. **Barrier efficiency by damage type**: kinetic 100 %, Thanix 45 %, Reaper beam 40 %, warhead 25 %, laser 0 % (`BARRIER_EFFICIENCY`). Unchanged.

## 3. Baseline measurements (shipped catalogue)

### 3.1 Isolated duels (canon rules, 10 seeds each)

| Duel | A wins | Barrier down (mean, s after first hit) | Kill (s) | Min barrier | Reaper hull at end | A lost | Spinal hit % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 DN vs capital, armed | 0/10 | — | — | 85 % | 100 % | 2.0 (at ≈16 s, 37 s) | 63 % |
| 2 DN vs capital, muted | 10/10 | 117 | 213 | 0 % | 0 % | 0 | 81 % |
| 3 DN vs capital, armed | 0/10 | — | — | 55 % | 100 % | 3.0 (≈16/37/58 s) | 71 % |
| 3 DN vs capital, muted | 10/10 | 74 | 131 | 0 % | 0 % | 0 | 80 % |
| 4 DN vs capital, armed | 0/10 | — | — | 28 % | 100 % | 4.0 (≈16/36/57/77 s) | 68 % |
| 4 DN vs capital, muted | 10/10 | 57 | 99 | 0 % | 0 % | 0 | 78 % |
| 6 DN vs capital, armed | 6/10 | 46 | 104 | 0 % | 8 % | 5.0 | 76 % |
| 8 DN vs capital, armed | 10/10 | 35 | 66 | 0 % | 0 % | 3.0 | 69 % |
| 1 CA vs DD, armed | 0/10 | — | — | 87 % | 100 % | 1.0 (cruiser dies 50–113 s, mean 75) | 33 % |
| 1 CA vs DD, muted | 0/10 | — (600 s) | — | 73 % | 100 % | 0 | 31 % |
| 2 CA vs DD, armed | 0/10 | 1/10 at 117 s | — | 55 % | 97 % | 2.0 | 31 % |
| 2 CA vs DD, muted | 10/10 | 211 | 338 | 0 % | 0 % | 0 | 32 % |
| 1 DN vs DD, armed | 8/10 | 188 | 221 | 0 % | 15 % | 0.2 | 35 % |
| 4 FF vs DD, armed | 0/10 | — | — | 83 % | 99 % | 3.8 | — |
| 2 CA + 4 FF vs DD, armed | 8/10 | 55 | 119 | 0 % | 5 % | 0.8 | 30 % |
| 4 DN vs capital, prime_apex, armed | 10/10 | 20 | 21 | 0 % | 0 % | 0 | 83 % |
| 2 DN vs capital, prime_apex, armed | 5/10 | 50 | 53 | 3 % | 5 % | 1.5 | 90 % |

Overheating never occurs in any duel (0 % of ship time): a lone spinal gun at 4 s (4.5 heat/s) is under the 8/s cooling and broadsides cannot bear on a target dead ahead. The capital's two beams kill a dreadnought every ≈ 20 s (≈ 4 bursts, see section 2 item 2).

### 3.2 Reference engagement and other scenarios

| Run | Winner, time | Alliance survival | Reaper capitals lost (barrier down / destroyed) | Destroyers lost | DN overheated (of life) / spinal ready-but-blocked | Torpedoes fired → impacts | Fighters |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Reference canon seed 7 | B, 245 s | 8 % | 1/4 (86 s / 113 s) | 0/8 | 15 % / 80 s, peak heat 121 % | 67 → 0 | 24/24 lost, mean life 39 s |
| Reference canon seed 8 | B, 239 s | 5 % | 1/4 (87 / 115) | 0/8 | 8 % / 37 s | 94 → 0 | 24/24, 40 s |
| Reference canon seed 9 | B, 239 s | 8 % | 1/4 (88 / 113) | 0/8 | 16 % / 88 s | 78 → 0 | 24/24, 39 s |
| Reference prime_apex seed 7 | A, 143 s | 74 % (3/8 DN lost) | 4/4 | 8/8 | 0 % (heatCapacity ×1.3) | 109 → 0 | 24/24, 26 s |
| Reference prime_apex seed 8 | A, 147 s | 70 % (3/8 DN) | 4/4 | 8/8 | 0 % | 83 → 0 | 24/24, 27 s |
| Battle of Earth canon seed 42 | B, 172 s | 2 % | 1/4 (91 / 147) | 0/10 | 11 % / 44 s | 132 → 0 | 24/24, 41 s |
| Battle of Earth canon seed 7 | B, 212 s | 1 % | 0/4 | 0/10 | 11 % / 39 s | 99 → 0 | 24/24, 40 s |
| Battle of the Citadel canon seed 3 | A, 173 s | 43 % | Sovereign 1/1 (147 / 173) | — | **27 % / 188 s**, peak 147 % | 175 → 6 | 24/24, 19 s (geth) |
| Final Battle of Earth canon seed 1 | B, 364 s | 12 % | 3/10 (Harbinger at 125 s) | 4/22 | 1 % | 268 → 6 | 60/60, 66 s |
| Defence of Sur'Kesh canon seed 5 early | B, 189 s | 4 % | 0/4 | 0/12 | 0 % | 104 → 6 | 40/40, 31 s |

Reading: in canon the fleet kills exactly one capital per battle (the one the focus fire lands on) and no destroyer; the second-ranked Reaper capitals barely fire (reference seed 7 shots per capital 128 / 30 / 62 / 28); kinetic damage splits 116–138 k into barriers vs 35 k into hulls; torpedoes are a dead weapon system in canon (0 of 67–132 reach a hull); every fighter dies to point defence within 60 s and lands no torpedo. Under Prime/Apex the same fleet wins with 70–74 % survival (AU_RULES.md asks for 7–19 ships lost including 1–3 dreadnoughts: 15–18 lost including 3 DN, so that target currently holds).

### 3.3 Analytic benchmark of today's pools (synchronised volleys, all hits)

`applyDamage` applied N × 1,000 every cadence to a stationary target with today's regeneration rule:

| Cadence | 2 DN | 3 DN | 4 DN |
| --- | --- | --- | --- |
| 4.0 s (shipped) | barrier down 96 s, killed 180 s | 64 / 116 | 48 / 84 |
| 2.0 s (canon) | 42 / 78 | 28 / 52 | 22 / 40 |

### 3.4 Heat (where it comes from)

Heat added per engaged ship-second, canon (`alliance_fleet_engagement` seed 7 / `battle_of_earth` seed 42):

| Variant | Dreadnoughts: heat/s (spinal share) | DN overheated of life, spinal ready-but-blocked | Cruisers: heat/s | CA overheated, blocked |
| --- | --- | --- | --- | --- |
| Shipped (cadence 4.0, spinal 18, broadside 6, GARDIAN 2, capacity 100) | 7.4 (50 %) / 7.4 (53 %) | 15 % / 80 s; 11 % / 44 s | 6.8 / 8.0 | 9 % / 108 s; 20 % / 169 s |
| Cadence 2.0 only | 9.1 (82 %) / 9.4 (71 %) | 8 % / 67 s; 12 % / 72 s | 7.1 / 8.0 | 15 % / 228 s; 22 % / 213 s |
| Cadence 2.0, spinal 12, broadside 3, GARDIAN 1, capacity 100 | 7.1 / 7.9 | 3 % / 21 s; 6 % / 37 s | 6.7 / 7.8 | 2 % / 26 s; 11 % / 117 s |
| Cadence 2.0, shipped heats, capacity DN 200 / CA 140 / FF 110 | 11.6 / 14.4 | 3 % / 16 s; 6 % / 30 s | 8.5 / 10.4 | 3 % / 58 s; 14 % / 180 s |
| Cadence 2.0, spinal 12, broadside 3, GARDIAN 1, capacities as above | 7.8 / 11.1 | **0 % / 0 s, peak 5–6 %** | 7.0 / 10.4 | **0 % / 0 s, peak 11–65 %** |

The spinal gun is only half of a dreadnought's heat; the other half is the eight broadside mounts (6 heat every 1.6 s each when a target is abeam). Cruisers are the worst affected class today (20 % overheated in the Battle of Earth). The cruiser line for the exact P3 combination (GARDIAN heat left at 2) is in section 7.4.

### 3.5 Fighters (shipped)

Battle of Earth canon seeds 42 / 7 / 8: 24 Tridents launched, 24 lost, lifetimes 30–60 s after launch (9–10 within 40 s), killers: capital point defence 13–16, destroyer point defence 8–11; mean distance to the killer at death 1.7 km (sim) while Reaper PD reaches 2.6 km; fighter torpedoes fired 24, impacts 0–1 (every torpedo intercepted); 24 of 48 torpedo rounds never fired. The fighters die because their orbit path around the chosen target runs through the PD envelopes of the neighbouring Reapers (destroyers escort capitals at 1–2 km), and because 2 PD hits (18 damage, 2 armour) kill a 30-hull Trident.

## 4. The mechanics the benchmark needs, and the ones rejected

### 4.1 M1 — continuous recovery under fire (Reaper capitals)

The benchmark is a statement about rates: two dreadnoughts' worth of fire (1,000 pts/s with all hits at 2 s) must be absorbed indefinitely, three must drain the barrier slowly, four quickly. The only model that does that is a barrier that regenerates **while being hit**, at a rate R with 1,000 ≤ R < 1,500. Anchors: "Sovereign's barriers withstood the Citadel fleet until Saren's death" (`LORE_REFERENCE.md`, CANON_CONFIRMED) and the concentration-of-fire benchmark (CANON_INFERRED per `PACK_ADOPTION.md` §1 #9). Pack reference: `RR_CAP.sim.barrier_recovery_dke_s` 1.1 DKE/s, `tactical_model.barrier_recovery_after_volley: true`.

Consequence that must be understood before tuning anything else: continuous recovery is a **1,000 pts/s sink on every slug, also after the barrier is down**. With the barrier at zero, the capital regenerates 50 points per tick; a dreadnought round arriving 0.7 s after the previous one meets a 700-point barrier, loses 700 to it and only 300 − 112 (armour) = 188 points reach the hull. Measured in the 4-DN muted duel: barrier "down" at 20 s, kill at 50 s, hull damage rate ≈ 240 pts/s from four dreadnoughts. The "barriers down" event becomes cosmetic for Reaper capitals; what matters is slug rate minus R.

### 4.2 M2 — barrier load threshold (Reaper capitals)

Without it, a 2 s cadence plus M3 (sustained fire) lets the Alliance fleet's cruisers and frigates add ~1,300 pts/s of barrier load to the dreadnoughts' ~2,800, and the canon reference engagement flips (seed 7: Alliance victory with 64 % survival, variant V0 in section 10). With it, a 320-point cruiser round loads the barrier by 320 × 0.32 = 102, a broadside round by 20, a frigate round by 5, a Thanix burst (420 × 45 % absorbed) by 79; dreadnought rounds, the Ascension's and the Titan gun's load it in full. The round is still fully stopped by the barrier (the fiction: the field sheds impacts far below its rating without being loaded). Anchor: the same two statements as M1 — the codex counts in dreadnoughts, and Sovereign shrugged off a cruiser/frigate fleet. Threshold 1,000 = 1 DKE. Capitals and Harbinger only; destroyers are meant to be killable by cruisers.

### 4.3 M3 — heat capacity per hull role

A kilometre of hull has more heat sinks than a frigate. `heatCapacity` on `ShipClassDef`: dreadnought 200, carrier 180, cruiser 140, frigate 110, fighter and Reaper classes 100 (unchanged). With spinal heat 12 and broadside heat 3, a dreadnought's spinal gun at 2 s uses 6 of its 16 pts/s cooling, spinal plus a full broadside 13.5 of 16 (sustainable), and GARDIAN bursts (8 mounts × 10 shots × 2 heat per 7.5 s ≈ 21/s) still push it over when fighters are on top of it — heat keeps a role as an all-weapons throttle but never interrupts the main gun in a line engagement. Measured: 0 % overheat in every P3 run, dreadnought peak heat 6–12 %.

### 4.4 Rejected or deferred

- **Post-collapse regeneration gap** ("barriers stay down for N s"): makes four dreadnoughts win the live duel (10/10 with an 8 s gap) **and** flips every canon fleet battle (reference seeds 7–9 all Alliance victories at 64–74 % survival). See section 10, V4/V8.
- **Per-burst beam armour** (P1): changes every beam's lethality (a capital beam would kill a dreadnought in ~2.5 bursts instead of ~4) and is not needed for D3. Documented as a quirk (section 2).
- **Scratch proposal P1** (capital 6,000 / 4,000 / regen 800, destroyer 1,200 / 800 / 100 / 30, threshold, heat 200): "two cannot overwhelm" fails in the sim (2 DN at close range hit 82 % → 820 pts/s > 800; barrier down at 116 s), and the canon reference flips to an Alliance victory on all three seeds (78 % survival).
- **`PACK_ADOPTION.md` §5 values** (capital 7,000 / 16,000 / regen 1,100, destroyer 800 / 600 / 160 / 40, heat 18 left so that "100/18 ≈ 5 rounds before cooling matters"): the heat statement contradicts D3 ("heat tuned so sustained fire is possible"); once heat is fixed the fleet's output rises and the threshold becomes necessary; the destroyer at 800 / 600 with a 40/s regeneration still denies the cruiser (regeneration must be ≤ 25/s for a 30 %-accurate gun); regen 1,100 makes three dreadnoughts at 75 % hits never kill the capital at all (bench: barrier down 110 s, hull 82–91 % after 240 s), which reads as "two and three both fail" rather than "growing load". P3 supersedes §5.3–5.5; the §5.2 mechanic is M1 as proposed there.

## 5. Choosing the capital numbers (analytic bench)

Pure trial: N dreadnought rounds of 1,000 (penetration 0.85) every 2 s against a stationary capital with armour 320, M1 recovery, `applyDamage` from `src/simulation/damage.ts`, `SIM_DT` steps. "down/kill" = seconds to barrier collapse / to destruction (— = not within 240 s).

### 5.1 Regeneration decides the two/three/four structure

| regen (pts/s) | 2 DN (all hits) | 3 DN (all hits, barrier 7,000, hull 12,000) | 4 DN (same) |
| --- | --- | --- | --- |
| 800 | down 28 s, kill 110 s | 8 / 30 | 6 / 18 |
| 900 | down 52 s, never killed (hull 29 %) | 10 / 34 | 6 / 18 |
| **1,000** | **never (min 71 %)** | **10 / 38** | **6 / 20** |
| 1,100 | never (71 %) | 12 / 48 | 6 / 22 |
| 1,200 | never (71 %) | 16 / 66 | 6 / 24 |

With all hits, two dreadnoughts deliver exactly 1,000 pts/s, so R ≥ 1,000 is forced by "two cannot overwhelm" in the pack's own reference calibration ("all hits, synchronised volleys"); R = 1,000 is the smallest value that satisfies it and keeps "three impose growing load" meaningful. At 75 % hits (realistic AI range) regen 1,000 gives: 2 DN never; 3 DN barrier down 18–46 s and kill 122–216 s depending on seed (that is "growing load"); 4 DN down 6–8 s, kill 40–42 s. Barrier size moves the collapse time (6,000 → 8,000: 4 DN 4 → 6 s) but not the kill time much; hull size sets the kill time (4 DN all hits: hull 8,000 → 14 s, 12,000 → 20 s, 16,000 → 24 s).

### 5.2 The recommended point and Harbinger (synchronised all-hit volleys; 75 % hits in brackets)

| Target | 2 DN | 3 DN | 4 DN | 5 DN | 6 DN | 8 DN |
| --- | --- | --- | --- | --- | --- | --- |
| Capital 7,000 / 12,000 / 320 / 1,000 | never, min 71 % (never) | 10 / 38 (18 / 216) | 6 / 20 (6 / 42) | 4 / 14 (4 / 26) | 4 / 10 (4 / 14) | 2 / 8 (2 / 8) |
| Harbinger 10,500 / 18,000 / 380 / 1,300 | never, min 81 % (never) | 40 / 172 (never, min 54 %) | 12 / 44 (30 / 180) | 8 / 26 (10 / 56) | 6 / 18 (6 / 34) | 4 / 12 (4 / 18) |

Random phase offsets between the dreadnoughts do not change the arithmetic (3 DN 14 / 45, 4 DN 8 / 23): the sink is linear in time. Barrier trace for 3 DN, all hits (per second): 100 57 71 43 57 29 43 14 29 0 14 0 14 … — the barrier is pinned between 0 and 14 % while the hull is eaten at 0.5 DKE per volley.

### 5.3 Why four do not win against return fire under any continuous-recovery model

Return fire removes one dreadnought every ≈ 20 s (two capital beams, section 2 item 2). After the first loss three dreadnoughts at 70 % hits deliver 1,050 pts/s against a 1,000 pts/s sink: net 50 pts/s, i.e. the hull phase stalls for any hull above ~1,000 points. For four to win, the kill would have to complete inside the first ~20 s, which requires a total pool below ~3,000 points, or a sink below ~800 pts/s — and 800 breaks "two cannot overwhelm" with all hits (and in the sim at close range, 82 % hits). The clause "four destroy it" is therefore satisfied for the isolated benchmark the codex actually describes (no return fire, synchronised volleys) and not for a live four-on-one, which matches the lead's parenthetical "with return fire the four must not automatically survive" in its strongest form. Measured P3 live duels: 4 DN lose 10/10 (barrier taken to 18 %, hull 99 %), 5 DN were not run, 6 DN win 10/10 losing 1.2 dreadnoughts, 8 DN win 10/10 losing 0.9. If the lead wants four to win a live duel, the only lever that does it without breaking "two cannot overwhelm" is the post-collapse gap, and that flips the canon fleet battles (section 10). Alternative framing that keeps everyone honest: present "four destroy it" in the codex as the Alliance's planning benchmark ("concentrated, uninterrupted fire from four dreadnoughts"), which is literally what the trial measures.

## 6. Proposal P3

### 6.1 Weapons

| Weapon | Field | Now | New | Why / provenance |
| --- | --- | --- | --- | --- |
| `alliance_dn_main`, `turian_dn_main` | cooldown / heat | 4.0, 3.8 / 18 | **2.0 / 12** | Codex: one round every two seconds (CANON_CONFIRMED). Heat 12 at 2 s = 6 pts/s, 37.5 % of a 200-capacity dreadnought's cooling (SIMULATION_ESTIMATE). |
| `asari_dn_main`, `geth_dn_main` | cooldown / heat | 4.0, 3.8 / 16 | **2.0 / 11** | Same class of weapon; relative heat ordering kept. |
| `salarian_dn_main` | cooldown / heat | 3.8 / 15 | **2.0 / 10** | Same. |
| `quarian_heavy_main` | cooldown / heat | 4.2 / 18 | **3.0 / 14** | Converted freighter hull, not a dreadnought gun (SIMULATION_ESTIMATE). |
| `ascension_main` | cooldown / heat | 4.5 / 20 | **4.0 / 16** | Unique 2.6 DKE gun; 4.0 keeps its sustained output ≈ 1.3 dreadnoughts. |
| `alliance_broadside` | heat | 6 | **3** | Keeps spinal + one full broadside (13.5 pts/s) under a dreadnought's 16 pts/s cooling. |
| `gardian` | heat | 2 | 2 (unchanged) | GARDIAN is limited by its burst/recovery mechanic; its heat remains the thing that can still overheat a ship under a fighter attack. |
| `reaper_capital_beam` | cooldown | 7.5 | **6.0** | Burst unchanged: 1,900/s × 2.8 s = 5,320 ≈ 5.3 DKE ≈ 206 kt, inside the codex's 132–454 kt. Cycle 10.3 → 8.8 s (+17 % sustained output); pack SIM cadence is 6 s. This is what makes the canon reference engagement a Reaper win on all three seeds instead of a draw on seed 8 (section 10, V1 vs V3). SIMULATION_ESTIMATE. |
| `reaper_destroyer_beam` | all | — | unchanged | 520/s × 2.4 s = 1,248 ≈ 1.25 DKE per 8.9 s cycle (0.14 DKE/s); the pack's 0.31 DKE / 2 s = 0.155 DKE/s. Codex gives no yield (CANON_INFERRED existence). |
| `disruptor_torpedo` | missileHp | 12 | **24** | Two Reaper PD hits instead of one (with PD damage 12). Measured: 4 FF vs DD 0/10 → 4/10 (1/5 in a second seed set); hit points 30 and 36 gave 4/5 and 9/10 — too strong. Fleet-scale interception stays high (section 7.2). |
| `fighter_torpedo` | missileHp | 8 | **16** | Same reasoning; fighter torpedo impacts in the Battle of Earth 0 → 9–12 of 24. |
| `reaper_point_defence` | damage | 18 | **12** | A Trident (30 hull, 2 armour) dies to three hits instead of two; an Oculus is unaffected (laser ignores barriers; drones have none). Accuracy 0.42 kept. |

Everything else in `weapons.ts` is unchanged, in particular `alliance_dn_main.damage` 1000 (the DKE anchor), the cruiser gun (320 / 3.0 s), Thanix (420 / 6.0 s; `PACK_ADOPTION.md` §1 #11 proposes 350 / 5.0 if the ME2 codex wording verifies — same output, not part of this audit).

### 6.2 Hulls

| Class | Field | Now | New | Why / provenance |
| --- | --- | --- | --- | --- |
| `reaper_capital` | barriers / hull / armour / barrierRegen / barrierRegenUnderFire / barrierLoadThreshold | 42,000 / 32,000 / 320 / 240 / — / — | **7,000 / 12,000 / 320 / 1,000 / 1.0 / 1,000** | Section 5: regen = two dreadnoughts' worth; barrier = 7 DKE (pack SIM 6); hull 12 DKE (pack 4; three times the pack because the sink also works during the hull phase and fleet-scale kills must take 10–20 s, not 3). SIMULATION_ESTIMATE, "tuned to the codex concentration-of-fire benchmark". |
| `harbinger` | same | 58,000 / 44,000 / 380 / 300 / — / — | **10,500 / 18,000 / 380 / 1,300 / 1.0 / 1,000** | 1.5 × capital (as today, and as the pack's SIM boss); two DN never, three only with sustained all-hit fire, four in 44 s, six in 18 s (section 5.2). |
| `reaper_destroyer` | barriers / hull / armour / barrierRegen (pause rule kept) | 6,500 / 3,200 / 160 / 80 | **1,000 / 700 / 120 / 25** | Barrier = exactly one dreadnought round (a DN kills a destroyer in 8.7 s, 10/10). Cruiser: ~6 hits of 320 after armour 60 per hit; at 30 % accuracy ≈ 60–90 s of fire, against a beam that kills the cruiser in ≈ 75 s — "credible path, credible death" (measured 7/20 and 2/10). Regeneration must stay ≤ 25/s and pause-gated or the cruiser's 9 s hit gaps refill the barrier (40/s continuous: 0/20). Pack SIM: 220 / 160 / 18 — ours is ×4.5 because our cruiser hits 30 % of the time and loses 60 per hit to armour. SIMULATION_ESTIMATE. |
| `reaper_destroyer` | pointValue | 260 | 260 (unchanged in P3; **follow-up**) | The destroyer is now worth about 1.75 cruisers (80), not 3.25, and `pointValue` drives AI threat weighting, the attrition judgement, survival %, the custom-battle point budget and campaign fleet value. A re-base to 140 was measured (section 13): every duel is unchanged, but because the AI scores targets by `pointValue` the fleet trajectories diverge and canon reference seed 8 then loses a third capital (B wins, 3 capitals, 347 s). Keep 260 in the calibration step and re-base `pointValue` in its own step with the reference engagement re-measured. |
| All organic classes | heatCapacity | (100 implicit) | **dreadnought 200, carrier 180, cruiser 140, frigate 110; fighters and Reaper classes 100** | Section 4.3. SIMULATION_ESTIMATE. |

Everything else unchanged (dreadnought 9,000 / 130 / 5,200 / 55 etc.). Codex and UI strings that quote the old numbers must change: `src/codex/entries.ts:151` ("Simulation hull 32,000 / armour 320 / barriers 42,000 …") and `:159` ("Simulation hull 3,200 / armour 160 / barriers 6,500 …"); `ships.ts` destroyer description ("Its barriers are extraordinary for its size" → "its barrier stops a single dreadnought round and recovers only when left alone"); `AU_RULES.md` §Reference balance (Prime/Apex losses must be re-measured after the D1 retune, see 7.6).

### 6.3 Mechanics (implementation notes)

- **M1** `ShipClassDef.barrierRegenUnderFire?: Provenance<number>` (0–1, default 0), copied to `ShipState`. `battle.ts updateHousekeeping`:
  `const frac = this.time - ship.lastHitAt > 3 ? 1 : ship.barrierRegenUnderFire; if (frac > 0 && ship.barriers < ship.maxBarriers) ship.barriers = min(max, barriers + barrierRegen × frac × dt)`. Pure arithmetic, no RNG. `applyRulesToShip` passes the value through unchanged (it is not a tech multiplier; `t.barrierRegen` already scales the rate).
- **M2** `ShipClassDef.barrierLoadThreshold?: number` (points, default 0 = off), copied to `ShipState`. `damage.ts applyDamage(target, raw, weapon, rng, now, hitSize = raw)`: after `absorbed = min(barriers, amount × eff)`, `const load = threshold > 0 ? absorbed × min(1, hitSize / threshold) : absorbed; target.barriers -= load; amount -= absorbed; out.barrierDamage = load`. `battle.ts` passes the whole burst (`w.def.damage × (w.def.beamDuration ?? 1.5)`) as `hitSize` from the beam tick so beams are judged by burst, and the hit damage from `applyHit`. The emulation used exactly this formula.
- **M3** `ShipClassDef.heatCapacity?: Provenance<number>`; `applyRulesToShip` returns `(cls.heatCapacity?.value ?? 100) × t.heatCapacity`. HUD heat bars are fractions and need no change.
- Determinism: all three are deterministic functions of state; replay-by-reseed holds (the existing determinism test exercises them).
- Emulation caveats: M1 and M3 were emulated exactly as specified. M2 was emulated by replacing `applyHit` and `updateWeapons` with copies that route through a threshold-aware `applyDamage`; the copies mirror `battle.ts` line for line, so the measured values should reproduce, but the implementer must re-run section 7 after the real change (a few seconds per table).

## 7. Measured behaviour under P3

### 7.1 Isolated duels (canon, 10 seeds each)

| Duel | A wins | Barrier down (s) | Kill (s) | Min barrier | Reaper hull at end | A lost | Spinal hit % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 DN vs capital, armed | 0/10 | — | — | 75 % | 100 % | 2.0 | 58 % |
| 2 DN vs capital, muted (600 s) | 0/10 | — | — | **71 %** | 100 % | 0 | 83 % |
| 3 DN vs capital, armed | 0/10 | — | — | 57 % | 100 % | 3.0 | 67 % |
| 3 DN vs capital, muted | 10/10 | 48 | 105 | 0 % | 0 % | 0 | 79 % |
| 4 DN vs capital, armed | 0/10 | 3/10 at 26 s | — | 18 % | 99 % | 4.0 | 70 % |
| 4 DN vs capital, muted | 10/10 | 20 | 50 | 0 % | 0 % | 0 | 70 % |
| 6 DN vs capital, armed | 10/10 | 10.5 | 31 | 0 % | 0 % | 1.2 | 62 % |
| 8 DN vs capital, armed | 10/10 | 7 | 20 | 0 % | 0 % | 0.9 | 55 % |
| 1 CA vs DD, armed | 2/10 (sweep: 7/20) | 35 (9/10 collapse it) | 63–89 | 1 % | 59 % | 0.8 (cruiser dies ≈ 74 s) | 30 % |
| 1 CA vs DD, muted | 10/10 | 44 | 113 | 0 % | 0 % | 0 | 30 % |
| 2 CA vs DD, armed | 10/10 | 14 | 31 | 0 % | 0 % | 0.0 | 31 % |
| 1 DN vs DD, armed | 10/10 | first hit | 8.7 | 0 % | 0 % | 0 | 29 % |
| 4 FF vs DD, armed | 4/10 (second seed set 1/5) | 25 | 52 | 1 % | 42 % | 3.2 | — |
| 2 CA + 4 FF vs DD, armed | 10/10 | 9 | 17 | 0 % | 0 % | 0.2 | 21 % |
| 4 DN vs capital, prime_apex | 10/10 | 3.6 | 6.3 | 1 % | 0 % | 0 | 80 % |
| 2 DN vs capital, prime_apex | 10/10 | — | 19 | 30 % | 0 % | 0.2 | 73 % |

Barrier trace, 3 DN muted (per second): 100 100 79 93 77 91 100 99 91 91 76 76 76 91 87 100 86 86 … 42 42 28 28 14 14 11 11 10 10 9 9 … 1 1 0 14 0 14 — load grows, the barrier is pinned near zero from ≈ 48 s, the hull goes at 105 s. Overheat 0 % in every duel.

### 7.2 Reference engagement and scenarios

| Run | Winner, time | Alliance survival | Reaper capitals lost (barrier down / destroyed) | Destroyers lost | DN overheated / peak heat | Spinal hit % | Torpedoes fired → impacts | Fighters: mean life, dead ≤ 40 s of launch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reference canon seed 7 | B, 254 s | 7 % | 2/4 (72 / 80 s; 88 / 106 s; third taken to 0 % barrier, 97 % hull) | 8/8 | 0 % / 12 % | 65 % | 36 → 0 | 41 s, 6 |
| Reference canon seed 8 | B, 291 s | 9 % | 2/4 (72 / 80; 98 / 114) | 8/8 | 0 % / 6 % | 61 % | 68 → 1 | 42 s, 7 |
| Reference canon seed 9 | B, 227 s | 8 % | 1/4 (73 / 82; second at 13 % hull) | 5/8 | 0 % / 12 % | 57 % | 44 → 0 | 40 s, 10 |
| Reference prime_apex seed 7 | A, 99 s | 95 % (0 DN lost) | 4/4 | 8/8 | 0 % | 39 % | 54 → 0 | 31 s, 23 |
| Reference prime_apex seed 8 | A, 93 s | 90 % (0 DN) | 4/4 | 8/8 | 0 % | 61 % | 33 → 0 | 29 s, 24 |
| Battle of Earth canon seed 42 | B, 200 s | 1 % | 1/4 (80 / 92; second at 33 % hull) | 7/10 | 0 % / 12 % | 70 % | 90 → 15 | 43 s, 5 |
| Battle of Earth canon seed 7 | B, 199 s | 3 % | 1/4 (88 / 125) | 7/10 | 0 % / 12 % | 61 % | 114 → 10 | 42 s, 7 |
| Battle of the Citadel canon seed 3 | A, 169 s | 59 % | Sovereign 1/1 (149 / 169) | — | 0 % / 14 % | 64 % | 133 → 7 | 20 s |
| Final Battle of Earth canon seed 1 | B, 353 s | 2 % | 6/10 (Harbinger 100 / 108 s) | 18/22 | 0 % / 12 % | 64 % | 186 → 16 | 71 s, 0 |
| Final Battle of Earth prime_apex seed 1 | A, 273 s | 88 % | 10/10 | 22/22 | 0 % | 51 % | 196 → 33 | 71 s |
| Defence of Sur'Kesh canon seed 5 early | B, 188 s | 2 % | 0/4 | 4/12 | 0 % / 5 % | 68 % | 85 → 17 | 37 s |
| Defence of Sur'Kesh prime_apex seed 5 early | A, 156 s | 87 % | 4/4 | 12/12 | 0 % | 47 % | 115 → 26 | 48 s |

Reading: the canon fleet now kills one capital at ≈ 80 s and a second at 106–114 s, then dies; the third capital is taken to a collapsed barrier but not killed; the destroyers die to the fleet (they are now cruiser-class targets) and that is the main change in Alliance survival (7–9 % vs 5–8 %). Battle duration grows from 240 to 230–290 s. The Battle of the Citadel outcome is seed/variant-sensitive (it was a Reaper/geth victory in the P3 run with torpedo hit points 36; the shipped game won it at 173 s) because the scenario relies on the fleet killing Sovereign without the scripted Saren-death barrier drop — a scenario beat, not a calibration matter. Torpedoes still land only 0–1 of 36–68 in the open-space reference (56 Reaper PD emitters), but 10–15 of 90–114 in the Battle of Earth and 17 of 85 at Sur'Kesh; frigate torpedo salvos are no longer a dead system but remain weak against an intact Reaper formation.

### 7.3 Tests replayed (`tests/battle|damage|salarian|ammo|campaign.test.ts` balance assertions): 22 of 23 pass

Pass: canon reference (winner B, capital losses 2/2/1 < 3, survival 7–9 % < 30 %); Prime/Apex reference (A wins, 12/12 Reapers, A loses 10–15 ships); Battle of Earth completes (200 s, 76 kills, barriers_down and reinforcement events present); retreat; fighters launch and fire torpedoes; custom battle; Palaven/Thessia complete; every damage.test assertion (the frigate-slug, beam-through-barriers, armour-vs-plating, HADES and hit-probability relations are untouched by P3 because armour 320 and the damage formula are unchanged); `WEAPONS.alliance_dn_main.damage === 1000`; Sur'Kesh diverges (canon 4 Reapers destroyed, apex 16); salarian custom battle; ammo depletion and GARDIAN burst recovery; campaign: canon ends in a Crucible decision at week 43, Prime/Apex wins at week 17 (reaper value 0), the Refuse campaign wins conventionally at week 38, the Fifth Fleet engagement resolves 46 → 11 ships.

Fail: `Reaper intelligence assessment reflects simulation data` — canon seed 7 now scores `0.58 × 3 (loss fraction) + 2 × 0.6 (capital losses) + 0.12 × 0.8 (tech) = 3.0` → SEVERE; the test expects at most ELEVATED. Section 8 proposes the fix.

### 7.4 Heat under the exact P3 combination

Dreadnoughts: 0 % overheated, 0 s of spinal ready-but-blocked time, peak heat 6–12 % in every run (reference seeds 7–9, Battle of Earth, Citadel 14 %, Final Battle 12 %). Cruisers (spinal 14 heat / 3 s, two broadsides a side at heat 3, four GARDIAN mounts at heat 2 against a 140 capacity): see the appendix line "P3 exact" in section 13 (measured after this section was drafted; GARDIAN heat 1 is the fallback if cruiser overheating under fighter attack is unwanted, and measured 0 % with it).

### 7.5 Cruiser vs destroyer sensitivity (20-seed sweeps, same P3 base)

| Destroyer barrier / hull / regen (pause rule) | 1 CA wins | 2 CA wins | 4 FF wins (torpedo HP 24) | Canon reference 7 / 8 / 9 (winner, capitals lost) |
| --- | --- | --- | --- | --- |
| 900 / 600 / 20 | 10/20 (kill ≈ 51 s) | 10/10 | 4/5 (HP 36) | B 1, B 2, B 2 |
| **1,000 / 700 / 25** | **7/20 (kill ≈ 63 s)** | **10/10** | **1/5** | **B 2, B 2, B 1** |
| 1,100 / 800 / 25 | 5/20 (kill ≈ 64 s) | 10/10 | 4/5 (HP 36) | B 2, B 2, B 1 |
| 1,200 / 800 / 40, continuous regen | 0/20 | 7/10 | 0/5 | B/A flips (V0) |
| 1,500 / 1,000 / 30 | 0/20 | 6/10 | 0/5 | B 1, B 1, B 2 |

### 7.6 Prime/Apex under P3

The current `prime_apex` multipliers (massAcceleratorDamage 1.25, penetration 1.3, barriers 1.35, HADES bypass 0.5, Titan gun 3,200 / 4.5 s) turn the reference engagement into a walkover: Alliance victory at 93–99 s with 90–95 % survival and **no** dreadnought lost; 4 Titan-armed DN kill a capital in 6 s. The `AU_RULES.md` target (7–19 ships lost including 1–3 dreadnoughts) is missed; `tests/battle.test.ts › Prime/Apex rules … at a cost` still passes only because 10–15 frigates die. This is the D1 "Apex core" retune (`PACK_ADOPTION.md` §3a) and is out of this audit's scope; the numbers above are its starting point. Note that M2 treats a 3,200-point Titan round as a full-load hit, and HADES' barrier-efficiency multiplier 0.6 further reduces the load — the Apex side gets the full benefit of the mechanics.

## 8. What each existing test must become

Exact test names from `tests/`. "Unchanged" means the assertion holds as written under P3 (measured).

| Test | Change |
| --- | --- |
| `battle.test.ts › canon rules: the Reapers win the reference engagement; the Alliance cannot destroy the Reaper force` | Keep `winner === 'B'` and `A.survivalPercent < 30` (measured 7–9 %). Replace `reaperCapitalLost < 3` with `reaperCapitalLost >= 1 && <= 2` (measured 2, 2, 1): the fleet now pays for, and gets, capital kills. Add seed 9. Add `B.destroyed < B.deployed` (measured 10, 10, 6 of 12). Rename the second clause: "…the Alliance cannot destroy the Reaper force but kills one or two capitals". |
| `battle.test.ts › Prime/Apex rules: the same fleets defeat the Reapers, at a cost` | Unchanged for now (A wins, 12/12, A.destroyed 10–15 > 0). After the D1 Apex retune it should additionally assert `A.capitalLost >= 1` (today 0) and `A.survivalPercent < 85`. |
| `battle.test.ts › Reaper intelligence assessment reflects simulation data` | Either re-base the score in `reaperIntel.ts` (recommended): `score = lossesFraction × 2 + capitalLosses × 0.4 + organicTech × 0.8 + (organicFleetStrength > 0.6 && time > 60 ? 0.6 : 0) + (Reapers lost the engagement ? 1.2 : 0)`; canon seed 7 then scores 0.55 × 2 + 0.8 + 0.1 = 2.05 → ELEVATED, apex seed 7 ≈ 2 + 1.6 + 0.2 + 0.6 + 1.2 = 5.6 → CRITICAL, the shipped baseline would have scored 0.9 → MODERATE. Or change the expectation to `['MODERATE','ELEVATED','SEVERE']` for canon with `apex.reaperCapitalLosses > canon.reaperCapitalLosses` (4 > 2) kept. The headline strings ("CAPITAL UNIT LOSSES EXCEED HISTORICAL PROJECTIONS" for 2 losses) need no change. |
| `battle.test.ts › the Battle of Earth completes with a result and destroyed ships` | Unchanged (200 s, 76 kills, every event type fires). Optionally add `winner === 'B'` and `B.reaperCapitalLost <= 2` (measured 1). |
| `battle.test.ts › is deterministic …`, `different seeds …`, `attack_target order …`, `fighters launch …`, `custom battles build and run`, `every scenario builds under every preset`, faction/formation/comparison tests | Unchanged (measured). |
| `damage.test.ts › kinetic rounds are fully absorbed by barriers until they are exhausted` | Unchanged for the frigate (no threshold). Add a sibling: against `reaper_capital` a 70-point frigate round is fully absorbed (`barrierDamage` reported as the **load**, 70 × 0.07 = 4.9; `hullDamage` 0) and a 1,000-point dreadnought round loads 1,000. |
| `damage.test.ts › armour reduces hull damage from low-penetration weapons against Reaper plating` | Unchanged (armour 320 kept: frigate 0.15, dreadnought 0.888). |
| `damage.test.ts › a Reaper beam passes most of its energy through barriers`, `HADES rounds …`, `hit probability …`, `subsystems …`, `effective ship stats scale …` | Unchanged. (D7 later moves the HADES test to the Titan gun; not part of this audit.) |
| `timelines.test.ts › canon effective stats equal catalogue values for every ship class` | Add `expect(eff.heatCapacity).toBe(cls.heatCapacity?.value ?? 100)`; add `expect(eff.barrierRegenUnderFire).toBe(cls.barrierRegenUnderFire?.value ?? 0)` and the threshold equivalent if they are exposed through `applyRulesToShip`; assert `barrierRegenUnderFire` is 0 and `barrierLoadThreshold` 0 for every non-Reaper class. |
| `timelines.test.ts › canon has all multipliers at 1 and no special technology` | Unchanged. |
| `ammo.test.ts › torpedo tubes carry a magazine …`, `reports depleted magazines …`, `fighters with empty tubes …`, `point-defence mounts pause …`, `is still deterministic …` | Unchanged (measured where balance-sensitive). |
| `salarian.test.ts › Defence of Sur'Kesh runs under canon and Prime/Apex with diverging outcomes` | Unchanged (canon B wins and loses 4 Reapers; apex A wins, 16/16). |
| `campaign.test.ts › canon campaigns end in defeat or a Crucible decision; Prime/Apex can win conventionally`, `refusing the Crucible …`, `pauses on an engagement …` | Unchanged (measured). |

New `tests/calibration.test.ts` (all deterministic, each under a second except the duels):

1. `isolated barrier trial` — a pure helper like section 5's bench (`applyDamage` + M1 formula, synchronised volleys, 2 s cadence, 1,000-point rounds, all hits): 2 DN → barrier never below 70 % in 240 s and never collapses; 3 DN → collapses, not destroyed before 30 s, destroyed before 60 s (measured 10 / 38); 4 DN → collapses within 8 s and is destroyed within 25 s (6 / 20); `killedAt(4) < 0.6 × killedAt(3)`; kill times decrease monotonically for 4, 5, 6, 8 DN. With a seeded 75 % hit roll: 2 DN never; 3 DN not destroyed within 60 s; 4 DN destroyed within 60 s. Same shape for Harbinger: 2 DN never (min 81 %), 4 DN destroyed within 50 s (44).
2. `live duels` — `buildCustomBattle` 40 km, canon: 2 DN vs capital with the Reaper's weapons muted (set every weapon `cooldown = Infinity` after construction) → barrier never below 50 % over 300 s (measured 71 %); 4 DN muted → destroyed within 90 s (50 s); 4 DN with return fire, seeds 1–5 → at least one dreadnought lost in every seed and the capital destroyed in at most 2 of 5 (measured 0); 6 DN with return fire → capital destroyed in ≥ 4 of 5 (5/5).
3. `cruiser vs destroyer` — 20 seeds canon: cruiser wins ≥ 3 and ≤ 12 (7/20 and 2/10 measured on different seed sets; together 9/30), and in every seed either the destroyer's barrier collapses or the cruiser dies (9/10 collapse); 2 CA → ≥ 8/10 (10/10); 1 DN → destroyer destroyed within 30 s (8.7 s); 4 FF → ≤ 6/10 (4/10).
4. `cadence` — every `*_dn_main` cooldown is 2.0; `quarian_heavy_main` 3.0; `ascension_main` 4.0; no organic spinal gun's `heat / cooldown` exceeds `0.08 × heatCapacity(role)` × 0.5 (i.e. the main gun alone uses at most half the cooling).
5. `heat` — the reference engagement canon seed 7 run to completion: no Alliance dreadnought is ever `overheated` (measured 0 s).
6. `Oculus screen` (after section 9 lands) — isolated 24 Tridents vs 24 Oculus with capitals muted: the last small-craft death falls between 60 and 120 s for seeds 1–3 (measured 77, 84, 95 s).

## 9. Fighter survivability and Oculus drones

### 9.1 Why fighters die (measured)

Shipped Battle of Earth (seeds 42 / 7 / 8): all 24 Tridents die 30–60 s after launch (9–10 within 40 s), killed by capital PD (13–16) and destroyer PD (8–11) at a mean distance of 1.7 km (sim) — inside the 2.6 km PD envelope although their orbit stand-off around their own target is 3.24 km. They fly through the envelopes of the target's escorts, and a Trident dies to two 18-point PD hits. Zero fighter torpedo impacts. Under P3 (PD damage 12, torpedo hit points 16): mean life 42–43 s, 5–7 die within 40 s of launch, killers unchanged in kind, fighter torpedo impacts 9–12 of 24. So PD lethality tuning buys only seconds; the geometry (and the absence of anything else to shoot at) is the problem. An AI change in D10's scope fixes the geometry: fighters should orbit at the range of the weapon that can engage the **current target** (anti-small guns against fighters, torpedoes against hulls) and should avoid other hulls' PD envelopes on the way; this audit measured the first half of that rule because the Oculus screen needs it.

### 9.2 Oculus candidate (all SIMULATION_ESTIMATE unless stated)

| Item | Value | Note |
| --- | --- | --- |
| Class `reaper_oculus` | faction reaper, role fighter, lengthM 8 (estimate: "fits inside the SR-2's cargo bay", ME2) | Existence CANON_CONFIRMED (ME2 Collector-base approach); every number below is a simulation estimate. |
| hull / armour / barriers / barrierRegen | **48 / 5 / 0 / 0** | No barriers (ME2 shows an armour bar only — CANON_INFERRED, verify). Armour 5 makes a Trident gun hit (6 points, penetration 0.2) do 1 point, so a drone takes ~48 hits (~25 s of one fighter's continuous fire at the measured 22–24 % hit rate). |
| maxSpeed / acceleration / turnRate | 3.6 / 1.8 / 110 | Slightly faster than a Trident (3.4 / 1.4 / 90), as a drone should be. |
| signature / ecm / crewQuality / pointValue | 0.05 / 0.1 / 1.2 / 4 | |
| Weapon `oculus_beam` | kind `reaper_beam`, damageType `reaper_beam`, **48 pts/s × 1.0 s burst, cooldown 2.4 s, range 3.5 (nominal), accuracy 0.7, penetration 0.6, antiSmall true, antiCapital false, arc 40, heat 0** | Particle beam (ME2). Against a Trident: barriers (25, 40 % efficiency) go after ≈ 1.3 bursts, then 24 hull per burst → ≈ 2.6 bursts per kill at 100 % hits, ≈ 6 at the realistic rate → ≈ 20 s per kill when continuously engaged. `antiSmall` makes the drone shoot only fighters (it cannot hurt a hull at this yield anyway). |
| Complement | **capital 8, destroyer 2, Harbinger 12** (`fighterComplement`, launched 2 per 0.4 s like carriers) | Battle of Earth: 3 × 8 + 7 × 2 = 38 at the start, 14 more with the second wave = 52 drones vs 24 Tridents. 24 per capital (116 drones) cut Trident median life to 25 s; 12 / 3 (78) to 31 s. |
| AI rule | fighter stand-off = 0.9 × range of the weapon that can engage the current target | Without it Tridents orbit drones at torpedo range (3.24 km) and only strafe them in passing; drones win more (section 9.3). The Alliance fighter AI must also switch to the screen when drones appear: with default target scoring the Tridents ignore the drones and press their torpedo attack on the capital, and the drones kill all 24 while losing 1 (isolated runs without `priority: 'fighters'`, 24 and 8 drones alike) — a massacre, not a fight. Both halves belong to D10. |

Rendering budget: 52 drones + 14 Reaper hulls on the Reaper side of the Battle of Earth; drones are instanced small craft like fighters.

### 9.3 Measured screens (P3 numbers, Oculus as above)

| Setup | Result |
| --- | --- |
| Isolated: 1 Alliance carrier (24 Tridents) vs 1 capital carrying 24 Oculus, all hulls muted, both fleets `priority: 'fighters'`, 5 seeds | Screen resolves (last small-craft death) at **77, 84, 95, 69, 97 s**; Trident median life 45 / 47 / 45 / 34 / 42 s (p90 61–82 s); Tridents lost 16 / 24 / 24 / 24 / 24, drones lost 24 / 13 / 22 / 17 / 17; fighter gun hit rate 22–24 %. |
| Same without the stand-off rule | 102 / 85 / 75 s; Trident median 36–42 s; drones lose only 11–19 (Tridents orbit at torpedo range and get fewer gun passes). |
| Same, 8 drones vs 24 Tridents | Drones dead in 29–35 s, 0 Tridents lost — the screen needs numbers, hence the 8-per-capital complement across a whole harvest group rather than one carrier's worth. |
| Battle of Earth canon seeds 42 / 7 / 8 with drones (8 / 2 complement), live PD, default orders | Outcome unchanged (B wins 198–217 s, 1 capital and 7 destroyers lost). 52 drones launched and lost, median life 30–35 s, last drone death 89–102 s. Tridents: median life **68–69 s** (41–43 s without drones), 7–8 dead within 40 s of launch, killers: capital PD 12–15, Oculus 7–8, destroyer PD 2–4. |
| Weaker drones (beam 28/s, armour 6, hull 36) | Harmless: 0 Trident kills, drones dead in 40 s. Beam 60–80/s with armour 3–4: Tridents wiped in 39–76 s, drones lose 6–14 — too lethal. Beam 40/s, hull 56, armour 5: 73–128 s screens (also acceptable, slightly longer and more variable). |

The 60–120 s target is met in isolation (69–97 s) and in context (fighter median life 68 s, drone screen 89–102 s). The remaining fighter killer is capital PD, which the geometry rule in 9.1 addresses; it is not a numbers problem.

## 10. Variants measured and rejected (evidence)

All on the P2/P3 base (cadence 2.0, heat as M3, capital 7,000 / 12,000 / 320 / regen 1,000 continuous unless stated). "ref canon" = reference engagement seeds 7 / 8 / 9: winner, capitals lost; "4DN armed" = 10 seeds.

| Variant | 2 DN muted | 3 DN muted | 4 DN muted | 4 DN armed | 1 CA vs DD (20) | ref canon | Battle of Earth 42 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V0 no threshold, destroyer 1,200 / 800 / 40 continuous | never (72 %) | kill 93 s | 48 s | 0/10 | 0/20 | **A 4**, B 3, B 3 | B 3/4 | canon fleet battle flips on seed 7 |
| V1 + load threshold 1,000 | same | same | same | 0/10 | 0/20 | B 3, **draw** 3, B 2 | B 1/4 | threshold stabilises; seed 8 draws |
| V2 beam cooldown 6.0, no threshold | same | same | same | 0/10 | 0/20 | B 3, B 3, B 3 | B 2/4 | three capitals lost each seed |
| V3 = V1 + V2 | same | same | same | 0/10 | 0/20 | B 2, B 2, B 2 | B 1/4 | **adopted shape** |
| V4 = V1 + 8 s post-collapse regeneration gap | same | kill 29 s | 17 s | **10/10**, 0.8 DN lost | 0/20 | **A 4, A 4, A 4** (64–74 % survival) | B 3/4 | wins the duel, loses canon |
| V5 = V1 + hull 16,000 | same | 112 s | 54 s | 0/10 | 0/20 | B 3, B 2, B 2 | B 1/4 | slower, still 3 on seed 7 |
| V6 = V1 + regen 1,100 + hull 16,000 | same (75 %) | 179 s | 64 s | 0/10 | 0/20 | B 2, B 1, B 2 | B 1/4 | three DN at 75 % hits never kill (bench) |
| V7 = V3 + destroyer 1,500 / 1,000 / 140 / 30 | same | same | same | 0/10 | 0/20 | B 1, B 1, B 2 | B 1/4 | kills the cruiser path |
| V8 = V1 + 10 s gap + hull 8,000 | same | 30 s | 13 s | 10/10, 0.5 lost | 0/20 | A 4, A 4, A 4 | B 3/4 | as V4 |
| V9 = V1 + destroyer 900 / 600 / 120 / 20, pause rule | same | same | same | 0/10 | **10/20** | B 2, B 2, B 3 | B 1/4 | cruiser path opens |
| P3 (V3 + destroyer 1,000 / 700 / 120 / 25 pause rule + torpedo HP 24 / 16 + PD 12) | never (71 %) | 105 s | 50 s | 0/10 | 7/20 | B 2, B 2, B 1 | B 1/4 | **recommended** |
| P3 + destroyer `pointValue` 140 | never (72 %) | 93 s | 48 s | 0/10 | 7/20 | B 2, **B 3**, B 1 | B 1/4 | duels identical; AI targeting shifts and seed 8 loses a third capital — re-base `pointValue` separately |
| P1 (scratch, section 4.4) | collapses 116 s | 37 s | 22 s | 5/10 | 0/20 | A 4, A 4, A 4 | A 4/4 | rejected |

Torpedo hit points on the P3 base: 12 → 4 FF vs DD 0/5; 24 → 1/5 (4/10 on another seed set); 30 → 4/5; 36 → 9/10. Battle of Earth torpedo impacts: 12 → ~0, 24 → 10–15 of 90–114.

## 11. Open questions, risks, limitations

1. **Lead decision: four against return fire.** P3 delivers the isolated benchmark literally and loses the live 4-vs-1 (section 5.3). The only mechanic that wins it (post-collapse gap) flips every canon fleet battle. Options: accept P3's reading; or accept the gap and re-write the canon reference test as an Alliance victory (which contradicts "the Alliance cannot destroy the Reaper force" and the campaign's premise); or make the gap an AU-only HADES property ("penetrator warheads disrupt projector recovery"), which would belong to D7 and the Apex retune.
2. **Reaper fleet AI leaves half its capitals idle** (shots per capital 131 / 84 / 134 / 40 in P3 seed 7, 128 / 30 / 62 / 28 shipped). The canon macro balance is partly resting on this inefficiency; when D10's AI (rotate protection, cover damaged capitals) brings all four capitals into arc, the Reapers get stronger and the canon reference may need the beam cadence back at 7.5 or the fleet test re-measured. Re-run section 7.2 after D10.
3. **Apex retune (D1)** is mandatory after P3: 90–95 % survival, no dreadnought lost (section 7.6).
4. **Battle of the Citadel** depends on a scripted Saren-death barrier collapse that the sim does not have; its outcome under P3 is seed-sensitive (A at 169 s in the final run, B at 367 s with torpedo HP 36). Suggest a scenario beat (world state "Saren dies at t = X → Sovereign `barrierRegenUnderFire` 0 and barriers 0"), outside this audit.
5. **`reaperIntel.ts` thresholds** need re-basing (section 8) — a code change, not only a test change, because the HUD shows the threat level.
6. **Destroyers die in numbers** to the canon fleet (8/8 in two of three reference seeds; 7/10 at Earth). "Prioritise destroyers" becomes the obvious canon tactic; the codex line at `entries.ts:159` already says so. If the lead wants destroyers to be rarer kills at fleet scale while keeping the cruiser duel, the lever is `pointValue`/targeting (the fleet's focus) rather than pools.
7. **Codex and UI strings** quoting 42,000 / 32,000 / 6,500 / 3,200 must change with the catalogue (section 6.2); the database screen's "one Everest-class round ≈ 1,000 points" note stays true.
8. **Torpedo interception** stays near-total against intact Reaper formations in open space (0–1 of 36–68 impacts) because 56 PD emitters engage each torpedo in turn; only saturation (Earth, Sur'Kesh) gets 10–26 through. A salvo model (frigate packs firing together) is AI work, not numbers.
9. **Fighter geometry**: lifetimes are driven by orbit paths through neighbouring PD envelopes (section 9.1). The Oculus screen hides this but does not cure it; D10 should include PD-envelope avoidance.
10. **Emulation vs implementation**: M2 was emulated by copying two `battle.ts` methods; the real implementation must re-run section 7 (seconds). The campaign tests were replayed through the emulation (`src/campaign/engine.ts` builds engagements through the same simulation) and pass.
11. **Not measured**: Harbinger in a live duel (bench only), 5 DN live duel, Thanix 350 / 5.0 (`PACK_ADOPTION.md` #11), the Valkyrie/Titan/HADES AU items (D7/D8), drive attacks (D9), the 70-hull cap and the "distant engagement" layer (D4/D13).

## 12. Reproduction (what the deleted scratch scripts did)

All scripts lived in `scripts/_audit_*.ts`, imported with relative paths like `scripts/headless-battle.ts`, and ran with `node --import tsx/esm scripts/<file>.ts`. They were deleted after the audit as the task required; the implementer should recreate the pieces marked (T) as `tests/calibration.test.ts` and keep a `scripts/calibration.ts` runner for the tables.

- `_audit_lib.ts` — harness: `duelConfig()` (two-fleet `buildCustomBattle`, deep space, 40 km), `runInstrumented()` (per-ship records of first hit, barrier collapse, destruction, killer and distance, overheat time, spinal shots/hits, ready-but-blocked ticks; torpedo fired/intercepted/impacted; impacts by damage type; 1 s barrier traces), `mute()` (infinite cooldowns), `applyOverrides()` (in-memory `WEAPONS` / `SHIP_CLASSES` edits incl. `fighterComplement`), `registerClass()/registerWeapon()`, and `patchMechanics()` emulating M1 (`regenUnderFire`, by faction or class), M3 (`heatCapacityByRole`), M2 (`barrierThreshold`, via a threshold-aware copy of `applyDamage` and copies of `applyHit`/`updateWeapons`), the rejected post-collapse gap (`barrierCollapseDelay`), per-burst beam armour, and the fighter stand-off rule (`fighterStandoffByTarget`, via a copy of `movementGoal`/`updateMovement`). One `patchMechanics` call per process: a second call resets the first (this bit the Oculus runs once; the affected lines were re-measured).
- `_audit_baseline.ts [--proposal p3] [--seeds N]` — the duel table of sections 3.1 / 7.1 (T, items 2–3).
- `_audit_bench.ts` — the analytic benchmark of sections 3.3 / 5 (T, item 1).
- `_audit_heat.ts` — heat attribution by weapon kind and role under variants (section 3.4).
- `_audit_reference.ts [--proposal p3] [--quick]` — reference engagement seeds 7–9 canon and 7–8 Prime/Apex, Battle of Earth 42/7, Citadel 3, Final Battle 1 (canon and Apex), Sur'Kesh 5 (sections 3.2 / 7.2).
- `_audit_tests.ts [--proposal p3] [--campaign]` — replays the balance-sensitive assertions of `battle|damage|salarian|ammo|campaign.test.ts` with measured values (sections 7.3 / 8).
- `_audit_fighters.ts` — fighter lifetimes, killers, distances, PD shot counts, torpedo impacts (sections 3.5 / 9.1).
- `_audit_oculus.ts` — registers the Oculus class/weapon at runtime, isolated screens and Battle of Earth with drones (section 9), parameters via `AUDIT_OCULUS` JSON.
- `_audit_sweep.ts` — one-line metric summary per variant via `AUDIT_P2` JSON (section 10); `_audit_proposal_p1/p2/p3.ts` — the proposals as `apply()` modules (P3 = section 6).

## 13. Appendix: measurements completed after the draft

**Heat under the exact P3 combination** (spinal 12/12/11/10/11, broadside 3, GARDIAN 2, capacities 200 / 180 / 140 / 110), canon:

| Run | Dreadnoughts | Cruisers |
| --- | --- | --- |
| Reference seed 7 | 7.8 heat/s while engaged (77 % spinal), **0 % overheated**, 0 s blocked, peak 11 % | 7.0 heat/s (63 % spinal), **0 % overheated**, peak 40 % |
| Battle of Earth seed 42 | 10.8 heat/s (56 % spinal, 44 % broadsides), **0 % overheated**, peak 77 % | 8.8 heat/s (46 % spinal, 35 % broadsides, 19 % GARDIAN), **8 % overheated**, 99 s of spinal ready-but-blocked time across 14 cruisers, peak 111 % |

Dreadnought sustained fire is achieved everywhere. Cruisers under a fighter attack (Earth orbit, GARDIAN bursts) still overheat occasionally — the intended all-weapons throttle. If that is unwanted, GARDIAN heat 2 → 1 measured 0 % cruiser overheating in both battles (section 3.4, last row).

**Destroyer `pointValue` 260 → 140 on the final P3 numbers** (compact sweep): duels identical to P3 (2 DN muted never, 3 DN 93 s, 4 DN 48 s; 4 DN armed 0/10; 1 CA vs DD 7/20; 2 CA 10/10; 4 FF 1/5); canon reference 7: B, 2 capitals, 277 s; **8: B, 3 capitals, 347 s**; 9: B, 1 capital, 249 s; Prime/Apex 7/8: A, 85–93 % survival; Battle of Earth 42: B, 1 capital, 7 destroyers; Sur'Kesh canon B (2 Reapers lost), apex A. The duel physics are untouched by `pointValue`; the fleet AI's target scoring (`log2(1 + pointValue)`) is, which is enough to change which capital the fleet focuses and when. Hence the recommendation in section 6.2 to re-base `pointValue` in a separate, re-measured step.
