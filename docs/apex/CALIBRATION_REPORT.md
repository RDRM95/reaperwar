# Calibration report (CORE)

The measured balance of the V2 catalogue (`docs/apex/ADOPTION_PLAN.md` §3; `docs/apex/WORK_BREAKDOWN.md` §1.5). Every number below comes from `node --import tsx/esm scripts/calibration.ts` on the stated commit; the harness is `tests/support/calibration.ts` and the pinned assertions are `tests/calibration.test.ts` and the AP §16 changes in `tests/battle.test.ts`. Everything is deterministic (seeded `Rng`, `SIM_DT 0.05`). Stage D copies the final numbers (§2, after the movement rewrite) into `AU_RULES.md`.

- **§0 Performance baseline and the T8 levers** — 4 November 2026, commit `76657f4` (before) and the T8 commit (after), with the suite wall-clock time of §1.7 (7).
- **§1 Calibration pass 1, before movement** — 3 November 2026, commit `c865f46` (T6) plus the T7 pins.
- **§2 Calibration pass 2, after movement** — written by T19 after T10–T14 (movement, withdrawal, solutions, Reaper AI, Oculus, flights).

## 0. Performance baseline and the T8 levers (4 November 2026)

### 0.1 Machine and method

Dev container: linux x64, node v22.22.0, 4 CPUs (Intel Xeon @ 2.80 GHz), 16 GB. `node --import tsx/esm scripts/perf-sim.ts --rows 100,300v100,300,600,1000 --windows 400 --split`: the AP §21.5 composition (per side: dreadnoughts 6 %, carriers 2 %, cruisers 32 %, frigates 60 % for the coalition; capitals 25 % / destroyers 75 % for the Reaper side), seed 11, canon, deep space 80 km, a 200-step warm-up and 1,200 measured steps, wall time through `performance.now()` with the profiler **off**; the phase split comes from a second, profiled pass of the same row. "Live hulls" excludes small craft, but the small craft are simulated: the T5 catalogue gives every Reaper capital 8 Oculi and every destroyer 2, so the 100 vs 100 row carries ≈ 400 small craft (350 Oculi, 48 Tridents) through its first minute. The reviewer's v0.11 baseline in AP §21.5 (4.35 / 12.35–18.1 / 37 ms per step) had no Oculi and ran on another machine; it is not comparable with the rows below, which is why the baseline was re-measured here before any lever was touched.

### 0.2 Before (head `76657f4` plus the zero-cost profiler wiring in `step()`)

| row | live hulls | ms/step | steps/s | steps per 16.7 ms frame | ms/step per 400-step window | profiled split |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 100 vs 100 | 110 | 18.16 | 55 | 0.9 | 27.75 / 17.00 / 9.73 | weapons 60 %, movement 23 %, carriers 6 %, projectiles 5 %, ai 4 % |
| 300 vs 100 | 280 | 64.65 | 15 | 0.3 | 90.01 / 65.69 / 38.25 | weapons 64 %, movement 22 %, projectiles 7 %, carriers 3 %, ai 3 % |
| 300 vs 300 | 409 | 208.27 | 5 | 0.1 | 305.14 / 203.75 / 115.93 | weapons 62 %, movement 21 %, carriers 7 %, projectiles 6 %, ai 3 % |

The first window (steps 200–600, the small-craft swarm alive) is the heaviest; the "firing phase" the plan expected to be the worst is cheaper because the drones die. CPU profile (`node --cpu-prof`, 300 vs 100, 600 warm-up + 600 measured steps, 75.7 s sampled): `acquireTarget` **46.7 %** self time (every anti-small mount scanning `enemiesOf()` every tick, as AP §21.5 predicted), `tryFire` 9.7 %, `movementGoal` 9.1 % (an enemy centroid per ship per tick), `updateMovement` 8.6 %, garbage collector 8.2 %, `step` 4.8 %, `updateProjectiles` 4.4 %, `updateCarrier` 1.1 %, `chooseTarget` 1.0 %.

### 0.3 Levers, in the AP §21.5 order

1. **Idle retry** `IDLE_RETRY_S = 0.25` (`battle.ts`): a mount that finds nothing (including a spinal gun that declines a secondary while its primary lives) takes a 0.25 s cooldown instead of rescanning next tick. Deterministic.
2. **Engagement gate**: one `grid.anyWithin(ship.pos, longest weapon range + length, ship)` per ship per tick; without an enemy in reach the mounts only do their bookkeeping (cooldowns, beam ticks, per-mount heat, burst recovery, charges) and take the idle retry; GARDIAN mounts still look for missiles while any are in flight. The plan's "skips `updateWeapons` entirely" was read as "skips the acquisition": the cheap bookkeeping keeps running so cooldowns, beams and heat behave exactly as before.
3. **Allocation-free distances**: squared scalars throughout `acquireTarget`/`tryFire`, a scalar arc test with one trig evaluation per mount per acquisition, mount origins from a per-ship-per-tick yaw memo into a scratch vector (cloned only when a shot leaves), `scoreTarget` scalar, projectile and interpolation snapshots advanced in place.
4. **`src/simulation/spatial.ts` `SpatialGrid`** (cell 4 km, typed arrays, open-addressed key table, CSR cell lists, per-cell side masks, extent-bounded box walks, deterministic ship-index order in every result): `updateProjectiles` → `querySegment` padded with 2.5 × the largest hit radius; point defence and anti-ship acquisition → `queryRadius` within the mount's range; `chooseTarget` → `candidates()` = `queryRadius(sensor × 1.5)` capped at the 24 nearest **plus every capital hull in range and the ship's current, forced and fleet-focus targets** (a strict nearest-only cap turned the reference engagement's Reaper capitals onto the frigate screen ahead of the dreadnoughts; AP §21.5 names the cap, not what it keeps).
5. **Per-tick caches** (`refreshSideCache`): side lists, combatants, point-weighted enemy centroids (`movementGoal`, `fleetDecision`), fleet members, carrier craft (the recall and rearm loops of `updateCarrier` no longer scan every ship), rogue-aware `enemiesOfShip`.
6. **Staggered fleet decisions**: the expensive part of `fleetDecision` (member list, centroids, engagement range, anchor goal, the focus re-evaluation) refreshes on `decisionSlowTimer` every `FLEET_SLOW_INTERVAL = 0.25` s; the anchor integration and the heading turn run every tick against the cached values.

Not touched here: `updateMovement`/`movementGoal` (T10 rewrites them), the small craft as individuals (T11 flights), the AP §21.5 tuning levers (cell size, stagger, `ttl` cap, beam batching, flight threshold — T19's).

### 0.4 After (the T8 commit)

| row | live hulls | ms/step | steps/s | steps per frame | ms/step per 400-step window | grid cells | speed-up |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 100 vs 100 | 106 | 4.26 | 235 | 3.9 | 6.91 / 3.93 / 1.94 | 56 | 4.3× |
| 300 vs 100 | 274 | 9.33 | 107 | 1.8 | 10.21 / 12.18 / 5.60 | 177 | 6.9× |
| 300 vs 300 | 419 | 22.20 | 45 | 0.8 | 22.42 / 27.84 / 16.36 | 229 | 9.4× |
| 600 vs 600 | 903 | 49.36 | 20 | 0.3 | 37.49 / 69.33 / 41.26 | 476 | (no baseline row) |
| 1,000 vs 1,000 | 1,695 | 88.04 | 11 | 0.2 | 76.28 / 90.96 / 96.87 | 913 | (no baseline row) |

Profiled split after the levers (300 vs 100): weapons 40 %, projectiles 24 %, ai 16 %, movement 13 %; 1,000 vs 1,000: weapons 67 %, ai 20 %, movement 8 %. CPU profile (300 vs 100, same method, 12.1 s sampled — the whole run is six times shorter): `querySegment` 11.4 %, `updateProjectiles` 10.2 %, `step` 7.2 %, `acquireTarget` 7.0 %, `queryRadius` 6.5 %, `movementGoal` 6.4 %, `updateWeapons` 6.1 %, `collectCells` 5.5 %, `collect` 5.1 %, `updateMovement` 4.2 %, `candidates` 4.1 %, garbage collector 2.4 %, `anyWithin` 2.4 %. The profile is flat: the sweep and the acquisition now cost in proportion to the hulls within range (400-odd rounds are in flight at the firing peak of 300 vs 100), movement is next, and the individually simulated small craft stay the largest entity count.

**Gate (AP §21.5, `HEADLESS_GATE` 20 steps per 16.7 ms frame on 300 vs 100 = 0.835 ms/step): missed** after the mandatory levers — measured 9.33 ms/step, **1.8 steps per frame**, on this 4-CPU container; no ladder row meets 20 (100 vs 100 reaches 3.9). Nothing here claims otherwise; T19 re-measures after T10 (movement rewrite), T11 (flights) and the §21.5 tuning levers and, if the gate is still missed, reports the measured figure and the largest row that meets 20 for the owner's approval of the fallback.

### 0.5 Results drift and the Apex pin (AP §3.5, first lever)

The levers change the order of the rng draws (an idle mount rolls its "wait for the primary" chance every 0.25 s instead of every tick, the fleet focus re-evaluates on the slow timer, the centroids are cached), so every seeded battle follows a new trajectory under the same mechanics. Re-measured with `tests/support/calibration.ts`: canon reference seeds 7 / 8 / 9 → B / B / B, 1 / 2 / 2 capitals, 0.0 / 1.7 / 0.4 % survival, 9–10 of 12 Reapers destroyed — every pin holds. Apex reference seeds 7 / 8 / 9 → A wins, 19 / 15 / 16 lost, 2 / 2 / 1 dreadnoughts, 73.2 / 79.9 / **85.8 %** survival: seed 9 crossed the `< 85 %` pin. The outcome is quantised by dreadnought losses (one lost dreadnought lands at 85–86 %, two at 76–80 %), so the pin is a coin flip per seed under any multiplier. First lever of the AP §1.3/§3.5 order, `kineticBarrierStrength` 1.35 → **1.3** (inside the bounds, one notch below the shipped value):

| Apex core organic change | seeds 7 / 8 / 9 / 10 / 11 (A survival, or the result) |
| --- | --- |
| none (T7 values under T8) | 73.2 / 79.9 / **85.8** / 71.5 / draw at 360 s |
| `kineticBarrierStrength` 1.3 (**adopted**) | 76.5 / 69.4 / 68.6 / 75.3 (20 lost) / draw at 360 s |
| `hullIntegrity` 1.1 | 77.4 / draw / 75.7 / 78.2 / 86.2 |
| `armourStrength` 1.0 | 65.2 (23 lost) / 69.4 / B at 360 s / 73.2 (22 lost) / 86.6 |
| `kineticBarrierStrength` 1.3 + `armourStrength` 1.1 | 82.8 / 75.7 / 64.8 / draw / 85.8 |
| `barrierRegen` 1.3 | 74.9 / 79.9 / 85.8 / 71.5 / draw |

Adopted: seeds 7–9 hold every AP §16 pin (A wins at 127 / 130 / 138 s, 17 / 19 / 18 lost, 2 / 3 / 3 dreadnoughts, 4 capitals, 12 of 12 Reapers destroyed, 23 / 23 / 29 HADES rounds fired, 12 / 11 / 11 detonations); seed 10 loses 20 (one over the 7–19 band) and seed 11 stays the 360 s draw it already was at T7's step 6 — neither is pinned. T19 re-measures after T10–T14 inside the same lever order.

### 0.6 Suite wall clock (§1.7 (7))

`npx vitest run`: 17 files / 163 tests in 84.1 s before T8; 18 files / 172 tests in 33–44 s after (`battle.test.ts` 83 → 36 s). `tests/perf.test.ts` adds 9 tests: the grid against brute force (1,000 random segments, 1,000 radii including radii larger than the battlespace, 500 nearest queries, the filter semantics, the empty grid), the scaling bound (300 vs 100 ≤ 4 × the 100 vs 100 per-step cost in one process: measured ≈ 2.2×), the smoke ceiling (400 steps of 300 vs 100 in ≈ 4 s against the 20 s bound) and the profiler's structure (all zeros while disabled, every phase present, phase sum ≤ total, the same battle with it on and off).

## 1. Calibration pass 1 — before the movement rewrite (3 November 2026)

Catalogue state: AP §3.2 values (T5), M1 recovery under fire, M2 load threshold, M3 heat by hull, the re-based Titan gun with the HADES magazine, gate (0.2) and residual fuse (0.5) in force (T6). Movement, withdrawal and firing solutions are still the v0.11 model; the Reaper AI is v0.11; Oculi launch through the generic carrier path and the fighter AI has no stand-off-by-weapon rule yet (T10–T12). Script wall time 53 s on the 4-CPU dev container.

### 1.1 Isolated barrier trial (pure helper: synchronised 2 s volleys of 1,000-point rounds, `applyDamage`, M1 formula every `SIM_DT`)

| target | DN | hits | barrier down (s) | killed (s) | min barrier |
| --- | ---: | --- | ---: | ---: | ---: |
| reaper_capital | 2 | all | — | — | 72 % |
| reaper_capital | 3 | all | 10.0 | 38.0 | 1 % |
| reaper_capital | 4 | all | 6.0 | 20.0 | 1 % |
| reaper_capital | 5 | all | 4.0 | 14.0 | 1 % |
| reaper_capital | 6 | all | 4.0 | 10.0 | 1 % |
| reaper_capital | 8 | all | 2.0 | 8.0 | 1 % |
| reaper_capital | 2 | 75 % (seed 1) | — | — | 72 % |
| reaper_capital | 3 | 75 % (seed 1) | 20.0 | 134.0 | 1 % |
| reaper_capital | 4 | 75 % (seed 1) | 8.0 | 40.0 | 1 % |
| reaper_capital | 5 | 75 % (seed 1) | 6.0 | 26.0 | 1 % |
| reaper_capital | 6 | 75 % (seed 1) | 4.0 | 18.0 | 1 % |
| reaper_capital | 8 | 75 % (seed 1) | 4.0 | 10.0 | 1 % |
| harbinger | 2 | all | — | — | 82 % |
| harbinger | 3 | all | 40.0 | 172.0 | 1 % |
| harbinger | 4 | all | 12.0 | 44.0 | 1 % |
| harbinger | 5 | all | 8.0 | 26.0 | 1 % |
| harbinger | 6 | all | 6.0 | 18.0 | 1 % |
| harbinger | 8 | all | 4.0 | 12.0 | 1 % |
| harbinger | 2 | 75 % (seed 1) | — | — | 82 % |
| harbinger | 3 | 75 % (seed 1) | — | — | 55 % |
| harbinger | 4 | 75 % (seed 1) | 28.0 | 134.0 | 1 % |
| harbinger | 5 | 75 % (seed 1) | 10.0 | 56.0 | 1 % |
| harbinger | 6 | 75 % (seed 1) | 8.0 | 32.0 | 1 % |
| harbinger | 8 | 75 % (seed 1) | 6.0 | 18.0 | 1 % |

Against AP §3.3 (2 DN never, barrier ≥ 71 %; 3 DN collapse 10 s, kill 38 s; 4 DN collapse 6 s, kill 20 s): reproduced to the second. Pinned: 2 DN never below 70 %, 3 DN killed in [30, 60) s, 4 DN collapse ≤ 8 s and kill ≤ 25 s, `killedAt(4) < 0.6 × killedAt(3)`, kill times strictly decreasing for 4 / 5 / 6 / 8 DN, the 75 % cases, Harbinger 2 DN never (≥ 80 %) and 4 DN ≤ 50 s.

### 1.2 Live duels (canon, deep space, 40 km, `buildCustomBattle`)

| duel | winner | duration (s) | barrier down (s) | killed (s) | min barrier | A lost | spinal hits |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 DN vs capital, muted, 300 s | draw | 300 | — | — | 72 % | 0 | 82 % |
| 4 DN vs capital, muted | A | 51 | 19 | 51 | 0 % | 0 | 70 % |
| 4 DN vs capital, armed, seed 1 | B | 72 | — | — | 41 % | 4 | 63 % |
| 4 DN vs capital, armed, seed 2 | B | 67 | — | — | 12 % | 4 | 72 % |
| 4 DN vs capital, armed, seed 3 | B | 75 | 36 | — | 0 % | 4 | 68 % |
| 4 DN vs capital, armed, seed 4 | B | 68 | — | — | 42 % | 4 | 63 % |
| 4 DN vs capital, armed, seed 5 | B | 67 | — | — | 33 % | 4 | 67 % |
| 6 DN vs capital, armed, seed 1 | A | 25 | 11 | 25 | 0 % | 1 | 66 % |
| 6 DN vs capital, armed, seed 2 | A | 29 | 9 | 29 | 0 % | 1 | 62 % |
| 6 DN vs capital, armed, seed 3 | A | 29 | 11 | 29 | 0 % | 1 | 64 % |
| 6 DN vs capital, armed, seed 4 | A | 23 | 13 | 23 | 0 % | 1 | 65 % |
| 6 DN vs capital, armed, seed 5 | A | 36 | 6 | 36 | 0 % | 1 | 58 % |

Against AP §3.3 (2 DN muted never below 50 %; 4 DN muted killed within 90 s; 4 DN armed lose a dreadnought every seed and kill the capital in ≤ 2 of 5; 6 DN armed kill it in ≥ 4 of 5): 72 %, 51 s, 0 of 5 (all four lost every seed), 5 of 5. "Spinal hits" counts kinetic impacts of ≥ 600 points by side A over spinal `weapon_fired` events (impacts carry no weapon id).

### 1.3 Cruiser vs destroyer (canon, 40 km)

| duel | wins | collapsed or cruiser died | mean kill (s) |
| --- | ---: | ---: | ---: |
| 1 CA vs DD (20 seeds) | 11/20 | 20/20 | 60 |
| 2 CA vs DD (10 seeds) | 10/10 | 10/10 | 39 |
| 1 DN vs DD | 1/1 | 1/1 | 10 |
| 4 FF vs DD (10 seeds, dispersed) | 4/10 | 10/10 | 40 |

Against AP §3.3 (1 CA wins 3–12 of 20; 2 CA ≥ 8 of 10; 1 DN kills within 30 s; 4 FF ≤ 6 of 10): 11, 10, 10 s, 4. The lone cruiser sits at the upper end of its band (the audit measured 7 of 20 and 2 of 10 on different seed sets); the pinned band is unchanged.

### 1.4 Reference engagements (fixed fleets) and the Battle of Earth

| run | winner | duration (s) | A survival | A lost | A DN lost | Reaper capitals lost | DN overheated / peak heat | HADES fired / held / detonated | Reaper losses by cause (non-fighter) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| Reference canon seed 7 | B | 322 | 0 % | 56/56 | 8 | 1 | no / 52 % | 0 / 0 / 0 | kinetic 9 |
| Reference canon seed 8 | B | 360 | 2 % | 51/56 | 8 | 2 | no / 52 % | 0 / 0 / 0 | kinetic 10 |
| Reference canon seed 9 | B | 360 | 1 % | 53/56 | 8 | 2 | no / 53 % | 0 / 0 / 0 | kinetic 10 |
| Reference Apex core seed 7 | A | 118 | 76 % | 18/56 | 2 | 4 | no / 28 % | 19 / 61 / 11 | kinetic 7, warhead 4, thanix 1 |
| Reference Apex core seed 8 | A | 111 | 83 % | 17/56 | 1 | 4 | no / 26 % | 29 / 35 / 11 | kinetic 10, warhead 2 |
| Reference Apex core seed 9 | A | 122 | 72 % | 16/56 | 3 | 4 | no / 26 % | 19 / 61 / 12 | kinetic 7, warhead 4, thanix 1 |
| Battle of Earth canon seed 42 | B | 188 | 0 % | 46/46 | 6 | 1 | no / 11 % | 0 / 0 / 0 | kinetic 8 |
| Battle of Earth canon seed 7 | B | 177 | 0 % | 46/46 | 6 | 1 | no / 11 % | 0 / 0 / 0 | kinetic 7, laser 1 |
| Apex Sol Defence seed 1 (scaled fleets) | A | 174 | 62 % | 30/59 | 3 | 6 | no / 13 % | 36 / 64 / 18 | kinetic 10, warhead 6, thanix 2 |
| Final Battle canon seed 1 (default fleet) | B | 281 | 0 % | 125/125 | 18 | 3 | no / 12 % | 0 / 0 / 0 | kinetic 18 |
| Final Battle Apex core seed 1 (default fleet) | A | 171 | 92 % | 40/189 | 1 | 10 | no / 9 % | 41 / 95 / 24 | kinetic 22, warhead 8, thanix 2 |

Against AP §3.3: canon seeds 7 / 8 / 9 → Reaper win, 1 / 2 / 2 capitals lost, Alliance survival 0–2 % (the audit measured 7–9 % before the Oculi; the drones and the shorter capital-beam cycle finish the canon fleet), `B.destroyed < B.deployed` (9–10 of 12). Dreadnought spinal hit rates (kinetic impacts of ≥ 600 points over dreadnought-class spinal shots): canon reference 60 / 60 / 61 %, Apex reference 75 / 74 / 72 %, Battle of Earth 65 / 58 %, Final Battle 63 (canon) / 59 (Apex) % — the audit's 57–70 % band. Two runs of the script give byte-identical tables. Battle of Earth seed 42 completes as a Reaper win with 1 capital lost. The canon reference battles now run to the 360 s limit on seeds 8 and 9 (attrition judgement for B with 1–2 % Alliance survival) instead of ending by destruction; the pinned assertions do not depend on the reason. **No Alliance dreadnought is ever `overheated`** (peak 52 % in the reference, 11 % at Earth; the reference peak is the GARDIAN batteries working against the Oculi).

**Apex reference with HADES** (fixed fleets, seeds 7 / 8 / 9): rounds fired 19 / 29 / 19 of 96 carried (8 Titan mounts × 12), rounds held by the gate (Titan shots at a capital fired as slugs while the mount still had penetrators) 61 / 35 / 61, warheads detonated 11 / 11 / 12, Reaper losses by cause — kinetic 7 / 10 / 7, warhead 4 / 2 / 4, thanix_stream 1 / 0 / 1 (4 capitals and 8 destroyers die in every seed). Between 38 % and 63 % of the penetrators that left a gun detonated; the rest missed or met a field that still held more than half a round (AP §17's "the magazine is spent late" limitation, visible here as 35–61 held shots per battle).

### 1.5 The Apex core retune (AP §1.3 TUNE, lever order of §1.3 and §3.5)

Measured first with the §1.3 literal multipliers (massAcceleratorDamage 1.1, kineticBarrierStrength 1.2, …), the re-based Titan gun (1,235 / 6.0 s: 40 % of a canon gun's sustained output) and the fuse and gate in force: **seeds 7 / 8 / 9 → draw / draw / Reaper win at 360 s**, Alliance survival 13 / 13 / 11 %, all 8 dreadnoughts lost, 3 of 4 capitals killed, 21 / 16 / 24 HADES rounds fired, 106 / 109 / 80 held, 9 / 9 / 8 detonations. The dreadnought line dies to the eight capital emitters before the fields it needs to collapse are down; the plan's "walkover" (`BALANCE_AUDIT.md` §7.6) belonged to the old 3,200 / 4.5 s Titan gun with the faction-wide bypass, which no longer exists.

Lever record (every value stays inside the §1.3 bounds, ≥ 1 and ≤ the v0.11 shipped value; `reaper` tech untouched; the capital's pools untouched):

| step | change | seeds 7 / 8 / 9 |
| --- | --- | --- |
| 0 | §1.3 literals | draw / draw / B |
| 1 | `kineticBarrierStrength` 1.2 → 1.35 (bound) | draw / B / B |
| 2 | + `massAcceleratorDamage` 1.1 → 1.25 (bound) | A (18 lost, 3 DN, 71 %) / B / B |
| 3 | `fleetStrength` | no effect: the target is a fixed-fleet engagement |
| 4 | `HADES_WARHEAD.damage` 2,260 → 1,500 and `specialAmmo` 12 → 6 | not applied: both only weaken the Apex side (they exist for the walkover case) |
| 5 | + `beamDamage` 1.2 → 1.35 (bound) | A / A / B |
| 6 | every remaining organic key at its bound (fireRate 1.1, heatCapacity 1.3, barrierRegen 1.4, armourStrength 1.3, hullIntegrity 1.15, speed 1.08, sensors 1.4, electronicWarfare 1.3, accuracy 1.1, fighterStrength 1.3, torpedoDamage 1.4, gardianEffectiveness 1.4, crewQuality 1.15) | A / A / A, but seed 7 survival 86 % (> the < 85 % target); seed 11 a draw |
| 7 | as 6 with `armourStrength` back at the §1.3 literal 1.15 | **A / A / A**, 18 / 17 / 16 lost, 2 / 1 / 3 DN, 76 / 83 / 72 % — seeds 10 and 11 also win (19 / 15 lost, 2 / 2 DN, 74 / 80 %) |

`HADES_GATE.barrierFractionBelow` was measured across its TUNE range at step 6: 0.1 fires fewer penetrators (seeds 7 and 9 lose), 0.35 wastes them on fields the fuse rejects (seed 11 a draw); 0.2 is kept. The adopted Apex core (step 7) is the `PRIME_APEX.organic` block in `src/timelines/presets.ts`; `apex_legacy` inherits it. The retune reverses the direction AP §1.3 expected ("the shipped multipliers give a 90–95 % survival walkover") because the walkover was a property of the old Titan gun; with the §14.3 gun the target holds only near the upper bounds, and the margin is thin (seed 8 at 83 % survival). AP §3.5's pass 2 re-measures this after T10's standoff doctrine (the Titan gun's 48 km range against the 44 km capital beam is the standoff advantage the dreadnoughts cannot yet use) and may relax the multipliers again.

### 1.6 Cadence and heat

Every `*_dn_main` cooldown is 2.0 s (`quarian_heavy_main` 3.0, `ascension_main` 4.0). Spinal guns (anti-capital mass accelerators, arc ≤ 20) against half of their hull's cooling (`0.5 × 0.08 × heatCapacity`): the dreadnought guns use 29–38 % of the hull's cooling, cruiser mains 40–42 %, the Ascension 19 %, the Nova Array 24 %, the legacy Nova 7 %; the Titan gun under Apex 24 heat / 6 s against a 260-point hull (200 × 1.3). The reference engagement canon seed 7 run to completion shows no overheated Alliance dreadnought (pinned); cruisers under fighter and drone attack still overheat occasionally, as the audit intended (GARDIAN heat 2 kept).

### 1.7 Oculus screen (1 carrier with 24 Tridents vs 1 capital re-stocked with 24 Oculi, hulls muted, both sides `priority: 'fighters'`)

| seed | last small-craft death (s) | Tridents lost | Oculi lost |
| ---: | ---: | ---: | ---: |
| 1 | 149 | 13 | 24 |
| 2 | 196 | 16 | 21 |
| 3 | 165 | 15 | 22 |

The §1.6.1 band (60–120 s) is **not** met in pass 1: the screen resolves at 149–196 s because the Tridents still orbit their target at torpedo stand-off and strafe the drones only in passing — `BALANCE_AUDIT.md` §9.3's "without the stand-off rule" case (102 / 85 / 75 s there with a different fighter mix). The stand-off-by-weapon rule is T11's; `tests/calibration.test.ts` pins an interim band (≥ 60 s, ≤ 240 s, ≥ 20 of 24 drones lost, 8–23 Tridents lost) and names the 120 s bound for T11.

### 1.8 Pinned assertions changed in this pass (AP §16)

- `tests/battle.test.ts` canon reference: seeds 7–9, `winner 'B'`, `reaperCapitalLost` 1–2, `A.survivalPercent < 30`, `B.destroyed < B.deployed`.
- `tests/battle.test.ts` Apex reference: seeds 7–9, `winner 'A'`, every Reaper destroyed, `A.destroyed` 7–19, `A.capitalLost ≥ 1`, `A.survivalPercent < 85`.
- `tests/battle.test.ts` Reaper intelligence: canon ∈ {MODERATE, ELEVATED, SEVERE} (seed 7 reads ELEVATED with the "lost the engagement" term), Apex ∈ {SEVERE, CRITICAL}, Apex capital losses > canon (unchanged assertions; the long loops now yield through `tests/support/async.ts`).
- `tests/damage.test.ts` (T6): the Titan-gun HADES test and the M2 kinetic-absorption sibling.
- New `tests/calibration.test.ts`: §1.1–§1.3, §1.6 and the interim §1.7 band.
