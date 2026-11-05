# Engine audit: combat scale and pacing

Stage S (pacing plan, brief §19.2), research input for `docs/apex/PACING_PLAN.md`; the engine-side sibling of `lore-ranges.md`. 5 November 2026.

**Code measured:** `stage/S-pacing` at `8e3d114`, the merge of the integration head `219f082` (CORE T12: Reaper AI behaviours — rotate protection, active gun platform, destroyer cover). The instrumented runs reproduce CORE's T12 figures (canon 7 / 8 / 9: side B at 324 / 360 / 360 s with 1 / 1 / 2 Reaper capitals lost and 4.9 / 5.0 / 5.7 % Alliance survival; Apex 7 / 8 / 9: side A, every Reaper destroyed; Battle of Earth 42: B at 241 s; `CORE_PROGRESS.md`, T12 entry) and the uninstrumented event logs exactly (the FNV-1a hash of the JSON event log is identical with and without the instrumentation for the Battle of Earth 42, reference canon 8, reference Apex 7 and the canon Final Battle: 22,004, 36,433, 9,148 and 45,430 events). CORE T13 (beats, volley, arrival) has not landed and will move the timings of §3; the structural findings of §1, §4 and §5 do not depend on it. T12 itself moved the timings against T11 (the canon Final Battle went from B at 434 s to A at 186 s): single battles are chaotic, so read ranges across seeds.

**Method.** A scratch script (`scripts/_pace.ts`) drove the real `BattleSimulation` headless and sampled every hull once per simulated second, plus every anti-ship shot at the moment it was fired: an event listener and a wrapper on `sim.projectiles.push`, both read-only. Each aimed round was followed to its end: whether it struck its intended target, struck another hull, passed its target, or expired after its target died. Lever experiments ran on scratch copies of `src/simulation/` with one change each (fifteen copies, two of them brute-force grid references, the eleven runs each), plus the shipped engine and the half-speed copy with every time limit doubled. The runs are deterministic: a second pass from scratch (the shipped engine and eleven of the fifteen copies) reproduced every recorded number exactly. Scripts and copies were deleted afterwards; no source file changed. Definitions are in §8.

**Labels.** Measured numbers describe the current engine; they are neither lore nor design and carry no provenance tag. Catalogue values are quoted with the catalogue's tags. Whatever tag a weapon or hull carries (the tag describes the object, not its kinematics), every range, projectile speed, ship speed, acceleration, turn rate and sensor range in the catalogue is `SIMULATION_ESTIMATE` (`AU_MODIFIED` on AU objects). The lore records no canon range, ship speed, acceleration, turn rate or sensor range, and its one canon kinematic number, the dreadnought round's 20 kg at 4,025 km/s (`CANON_CONFIRMED`, ME1 codex *Dreadnought*, `LORE_REFERENCE.md`), is not the catalogue's value (30 nominal km/s; `lore-ranges.md` §0 items 1–2, §2.1–2.3). The hull lengths used as the unit here are canon where `LORE_REFERENCE.md` records them: Reaper capital about 2 km and Reaper destroyer about 160 m (`CANON_CONFIRMED`, ME3 codex), Everest-class 888 m (`CANON_INFERRED`, "commonly cited, not in codex").

Abbreviations: S = `BATTLESPACE_SCALE`; L = hull lengths, of the longer hull of a pair (in these battles nearly always a 2 km Reaper capital); "range" = a hull's longest non-point-defence weapon range in simulated km; "canon five" = Battle of Earth seeds 42 and 7 and the reference engagement seeds 7, 8, 9 under `canon_me3`; "the eleven runs" = the reference rows of `scripts/calibration.ts` (canon five, reference Apex 7 / 8 / 9, Apex Sol Defence 1, Final Battle canon 1 and Apex 1).

## 0. Findings in brief

1. **Too close, measured.** After first contact the median distance from a capital to the nearest enemy capital is 11.7–13.3 km in the canon five: **5.9–6.7 Reaper lengths, 0.67–0.77 of the capital's own range** (canon Final Battle 12.4 km, 6.2 L, 0.72). In the Battle of Earth's decisive minute (60–120 s) it is 9.1–10.5 km = 4.6–5.3 L = 0.54–0.62 × range. Inside a fleet, capitals sit 1.6–1.9 km apart (1.8–2.1 of their own lengths) in the formations the scenarios use, Reaper capitals 3.4–3.6 km (1.7–1.8 L): the spacing guard and the compression floor. Before contact the nearest enemy capital is 29.6–33.5 km away (14.8–16.7 L, 1.74–1.95 × range).
2. **Too fast, measured.** Capitals close at 0.50–0.54 km/s simulated (1.24–1.34 nominal km/s) and cross the 17.6 km Reaper beam band in 33–36 s. The lead Reaper capital opens on a screening Alliance frigate at its full 17.8 km at 10.9–11.7 s, the Reaper destroyers follow at 14.0–14.7 s and the Alliance answers at 16.5–17.0 s (frigate guns on the destroyers); the first capital gun fires at a capital at 26.1–32.9 s (Apex 21.3–24.8 s); the first capital dies at 36.9–51.7 s, 10–19 s after the first capital shot. The Alliance then loses a capital every 2–59 s (median 14–18 s), all nine in the reference by 173–219 s and all seven at Earth by 180–185 s. The canon battles end at 241–242 s (Earth) and 324 / 360 / 360 s (reference): the 360 s limit cuts two of three seeds, which need 362 and 385 s.
3. **The Reapers set the exchange distance, but the range bounds it.** The Reaper anchor closes to 0.4375 × fleet range of the enemy centroid and never backs off; the Alliance spinal line holds 0.875 × spinal range and never kites (owner rule). A scratch change holding the Reaper anchor at 0.875 × range moves the exchange from 0.67–0.77 to 0.82–0.87 × range (7.0–7.6 L instead of 5.9–6.7) and the first capital loss from 36.9–51.7 to 42.1–61.8 s, winners unchanged. Doctrine moves the exchange inside the range; in hull lengths it cannot go past the range itself (Reaper beam 8.8 L, dreadnought spinal 8.4 L at S = 0.4).
4. **`BATTLESPACE_SCALE` is a range-to-hull lever with a time scale that does not move — to first order.** Sweep S = 0.4 / 1 / 4 / 10 (exact grid, cell scaled, §4.2): the exchange is 5.9–6.7 / 13.7–15.8 / 52.4–53.1 / 125–131 L; the approach as a fraction of range is the same (Battle of Earth 42, 0–30 / 30–60 s: 1.64 / 0.80 at S = 0.4, 1.59 / 0.77–0.78 at S ≥ 1); the first capital gun (25.9–33.4 s) and the first capital loss (33.9–52.0 s) do not move; the canon five stay side-B wins at every S. Second order: first contact (a Reaper beam on the Alliance screen) moves from 11 s to 13–17 s, and the exchange settles at 0.57–0.62 × range instead of 0.67–0.77.
5. **S is not neutral where the code compares S-scaled distances with absolute kilometres** (§1.3: some 40 constants in `movement.ts`, `stealth.ts`, `ai.ts`, `battle.ts`, `reaperAi.ts`). Measured: at S = 4 and 10, 20–38 % of the Alliance line in the reference runs is out of range after contact (5–7 % at Earth), with 6–12 frigates per reference battle out for 68–346 s at a stretch, against 3–6 % and at most one frigate (reference canon 9, 149 s) at S = 0.4: the escorts' 20 km screen leash shrinks relative to their guns. With the two slot leashes multiplied by 10 at S = 4 it is 2–4 % with no hull out for more than 60 s (§4.3). Longer distances recreate queueing unless these constants are re-based.
6. **The formation compression floor.** `SLOT_COMPRESSION = max(S, 0.55)`: at S = 0.4 formations are 1.375 × larger relative to weapon ranges than at any S ≥ 0.55 (a line abreast spans 2.51 × range instead of 1.83 ×). It puts the Alliance screen inside the Reaper beams' reach about 2 s earlier (removing it moves the first anti-ship shot from 10.9–11.7 to 13.1–13.4 s). Above 0.55, formation spacing grows with S in hull lengths: capitals max(3.2 S km, 1.7 L) apart (14.4 dreadnought lengths at S = 4).
7. **The spatial grid is not exactly the brute-force scan its contract states.** It indexes start-of-tick positions and tests current ones, so a hull that crossed a cell edge since the rebuild can be missed. At S = 0.4 the shipped 4 km grid differs from a brute-force scan in 1 of the 11 runs (reference canon 8: 44 Alliance hulls lost and the 360 s limit, against 45 lost at 334.2 s), a 2 km grid in 2 of 11; at S = 4 with 4 km cells 9 of 11 differ (the canon Final Battle flips from A at 208 s to B at the 540 s limit), with 40 km cells 4 of 11; at S = 10 with 4 km cells 9 of 11. Padding each query box by the largest per-step displacement makes the grid identical to a brute-force scan at any cell size (measured 11 of 11 at S = 0.4 and at S = 4 with 4 km and 40 km cells). Any change of S needs the padding; adopting it re-pins one reference seed today.
8. **Aimed rounds miss physically only when S is raised; today they are blocked.** A rolled hit is aimed at the constant-velocity intercept. At S = 0.4 almost none flies past a live target (0–1 % on Reaper capitals, 0–3 % on destroyers). What moves today's hit rates physically is blocking: 6–17 % of the rolled hits aimed at Reaper capitals in the canon runs strike another hull first (T12's destroyer cover flies on the line between a damaged capital and its attacker), and 4–11 % of rolled misses strike another hull. Both move with S: rolled hits on destroyers that fly past grow to 2–14 % at S = 1, 16–28 % at S = 4 and 24–33 % at S = 10 (the displacement grows with S, the 80 m hit sphere does not), while blocked capital hits vanish at S ≥ 4 (0–2 %) and strays fall to 0–2 %. These are balance terms that move with S (`lore-ranges.md` §4 item 8 asked for this check).
9. **Hit rates by band (canon, six runs pooled):** dreadnought spinal guns strike their target with 47 / 33 / 36 % of rounds at 0.25–0.5 / 0.5–0.75 / 0.75–1.0 × range (rolled hits 50 / 43 / 44 %; 90 % of their rounds are fired beyond half range); cruiser spinal guns 49 / 44 / 35 %; broadsides 15 / 14 / 9 %; frigate guns 49 / 43 / 33 %; Reaper capital beams 31 / 54 / 31 % (54 / 72 / 40 % against capitals). The fire-control model sees distance only as a fraction of range and speed only as relative speed over projectile speed, so it is S-invariant by construction; its range penalty is mild (× 0.55 on the hit probability and × 0.5 on the solution build rate at full range).
10. **Ship speed is the time-scale lever, and it stretches the approach, not the fight.** Halving every top speed (accelerations, ranges, weapons unchanged): closing 0.29 km/s, first anti-ship shot at 18.2–19.7 s (× 1.7), first capital gun at 46.5–61.2 s (× 1.8), first capital loss at 60.9–80.3 s (× 1.6); capitals fight further out (0.77–0.83 × range); the Alliance line is out of range more (6–8 %). With every time limit doubled the reference runs 372–404 s instead of 324–385 s, same winner and survival: the exchange, set by damage, barriers and cadence, barely lengthens.
11. **Queueing today** comes from three places, none of them the first Reaper wave: reinforcement waves deploy 44–46 km (2.5–2.6 Reaper ranges) from the Alliance's starting anchor and are 79–100 % out of range in their first 30 s (≤ 10 % after 27–37 s); the wide organic lines against compact Reaper groups leave 3–6 % of the Alliance line out on average in the canon five (28–37 % in the first 30 s), 11–14 % in the Apex reference and up to 23–57 % of the allied fleets in the Apex Final Battle (the mop-up); carriers stay out of their own range by design (keep-out 0.8 × the enemy's main range, beyond their 11.2 km broadsides; out for 68–138 s at a stretch). The first Reaper wave is ≤ 10 % out 5.9–9.4 s after contact and 1–7 % on average (a compact wedge whose anchor closes to 0.44 × range, plus the never-idle advance, §2.4), and stays so at S = 1–10 (§4.2).
12. **Renderer.** Render units are 100 m (`KM = 10`) and positions are simulation km × 10, so the screen shows the simulated geometry at true scale — except that five models are drawn shorter than their simulated hulls (Reaper capital 1.54 km against 2.0 km, Harbinger 1.85 against 2.2, Reaper destroyer 128 against 160 m, Alliance cruiser 520 against 700 m, Cerberus dreadnought 900 against 1,000 m) and fighters are drawn at twice their length by design. LOD runs on the model's length: reduced detail beyond 70 lengths, a far point beyond 700 (Reaper capital 108 / 1,078 km, dreadnought 62 / 622 km, frigate 12 / 119 km, destroyer 9 / 90 km, craft 3 / 9 km); a mesh is 1.65 px long at the point switch on a 1080p screen and its far point is 0.1–0.3 px for capitals by formula (the GPU's minimum point size then applies). Framing both fleets turns frigates and destroyers into points and a Reaper into 9 px at S = 4, and everything into points at S = 40; the 6,000 km zoom limit is reached at S ≈ 124. Effects are hull-scale in width: a heavy tracer is 11 m wide and a Reaper capital's beam core 23 m across, under one pixel beyond 13 km and 27 km of camera distance. The battle opens with the camera 32 km from the player's fleet.
13. **Cost.** Per-step cost does not change measurably with S at these hull counts once the cell is scaled: the spread between passes on the shared four-CPU machine (load 7–10) is larger than any difference between scales (uninstrumented, two sessions of two passes: Battle of Earth 0.41–1.15 ms per step at S = 0.4, 0.37–1.06 at S = 4, 0.40–1.03 at S = 10; canon Final Battle 1.36–2.79 / 1.29–2.21 / 1.57–2.69 ms). Battle length in steps is the cost driver; the fast-forward of brief §19.1 is what makes longer battles practical.

## 1. How the engine scales distance and time

### 1.1 What `BATTLESPACE_SCALE` multiplies, and what it does not

Catalogue distances and speeds are nominal km and km/s. `BATTLESPACE_SCALE` S = 0.4 (`src/simulation/constants.ts:9`) converts them to simulation km:

- **Scaled by S:** fleet anchors and order positions (`battle.ts:171–172`, `544`); weapon range and projectile speed (`battle.ts:256`); top speed, acceleration and sensor range (`battle.ts:305–308`); the stealth `detectRange` (`battle.ts:343`); launched craft slots (`battle.ts:891`); the AI distances written as `k * S`: `FALLBACK_ENGAGEMENT_RANGE` 20 S (`ai.ts:93`), the anchor lag clamp 12 S (`movement.ts:306`), `CRAFT_DETECT_RANGE` 1.5 S, `STEALTH_SAFE_RANGE` 46 S, the hunter's 8 S and 1.2 S, `VENT_MARGIN_KM` 4 S, `CROWD_KM` 6 S and the 20 S reach term (`stealth.ts:28–144`).
- **Scaled by max(S, 0.55):** formation slots (`SLOT_COMPRESSION`, `formations.ts:22`).
- **Not scaled:** hull length and hit radius (`lengthM / 1000`, radius `max(0.02, L / 2)`, `battle.ts:296`); hardpoint offsets (`battle.ts:265`); the spacing guard (1.7 × the longer hull, `formations.ts:24`); the T12 interpose distance (0.6 × the protectee's length + 0.5 × the destroyer's, `reaperAi.ts:235`); turn rates (angular); every duration — the step `SIM_DT` 0.05 s (`battle.ts:57`), cooldowns, beam bursts, decision intervals, solution build and decay rates, barrier regeneration, reveal and vent times, the 12 s rearm; the grid cell (4 km, `spatial.ts:25`); and the absolute kilometres of §1.3.
- **Beams stay hit-scan at any S** (`projectileSpeed` Infinity × S).
- **Renderer:** 1 render unit = 100 m (`rendering/geometry.ts:9–10`). Positions are simulation km × 10 and models metres × 0.01, so the screen shows hulls at their model length and distances compressed by S (§6).

### 1.2 Why the time scale does not depend on S

Every rule that decides who fires when, and how well, compares like with like:

- Kinematics: crossing a range r at speed v takes r / v; reaching top speed takes v / a; the braking distance as a fraction of range is v² / (2 a r); a round's flight time is r / v_p. S cancels in each.
- The station-keeping controller commands `min(maxSpeed, kp · d, √(2 a d))` toward the goal (`movement.ts:378`): kp is per second and every other term scales with S.
- Hit probability uses distance ÷ range (`damage.ts:110–111`, factor 1 − 0.45 f²) and relative speed ÷ projectile speed (`damage.ts:124`, `battle.ts:1270`); the firing solution builds with distance ÷ main range and the target's acceleration fraction (`solutions.ts:50–62`, factor 1 − 0.5 f²); doctrine distances are fractions of the fleet range (`movement.ts:125–134`); angular rates v / d are scale-free and turn rates are angular.

Measured (§4.2): at S = 0.4, 1, 4 and 10 the Battle of Earth 42's capital distance as a fraction of range runs 1.59–1.64 (0–30 s) and 0.77–0.80 (30–60 s); the first capital-gun shot comes at 25.9–33.4 s and the first capital loss at 33.9–52.0 s in the canon five at every S.

### 1.3 Where S is not neutral: absolute kilometres

These compare an S-scaled distance with a fixed one. As S grows each shrinks relative to the ranges; as S falls each grows.

| Constant (simulation km unless stated) | Where | What it does | Against a 17.6 km Reaper range at S = 0.4 → at S = 4 |
| --- | --- | --- | --- |
| `SCREEN_LEASH_KM` 20 | `movement.ts:48`, used in `stationGoal` | How far an escort may leave its slot to bring its own guns to bear (CORE T10 deviation 3) | 114 % → 11 %: measured queueing at S ≥ 4 (§4.3) |
| `SLOT_LEASH_KM` 2 | `movement.ts:46` | How far a capital leans toward a target out of its range | 11 % → 1.1 % |
| `STATION_LATERAL_KM` 3 | `movement.ts:32` | Lateral offset of a recovery station | 17 % → 1.7 % |
| `CARRIER_WEAVE_KM` 2; keep-out push-back cap 8 | `movement.ts:51`, `518` | Carrier weave amplitude; carrier keep-out | 11 %, 45 % → 1.1 %, 4.5 % |
| Ramp floors `max(1, …)`; arrival 0.05 | `movement.ts:239–266` | Anchor deceleration ramp, locked-anchor correction, arrival tolerance | negligible at both |
| Formation turn gate `slotRadius > 1` | `movement.ts:181` | Whether the wide-line turn limit applies | always on at S ≥ 0.4 |
| Frigate runs: 0.5 tolerance, run ≥ 2, fallback reach 4, extend 12 / 10 | `movement.ts:608–662` | Run geometry under loose formations | run ends drift relative to torpedo reach |
| Fighter passes: 0.6 height jitter, 0.3 approach tolerance, offsets radius × 1.2 + 0.15 / radius + 0.8 / radius + 0.3, extend 8 | `movement.ts:758–783` | Strafing-pass geometry (hull-scale offsets are intended) | extend leg 45 % → 4.5 % of range |
| `chooseTarget` main-range floor 8; `fleetStandoff` fallback 20; craft neighbour query 3.2 | `ai.ts:256`, `369`, `425` | Target scoring of short-range hulls; station fallback; point-defence repulsion search | the 3.2 km query covers a Reaper capital's 2.9 km repulsion envelope at S = 0.4, a ninth of it at S = 4 |
| Hunter: run start strike + 2.5, `TORPEDO_LEAD_KM` 1.5, arrival 0.6, fire window strike + 1, transit 0.3, vent and shadow offsets 6 ± 1.5 lateral, 4 / 2 back, 1.5 below, Thanix hold strike + 0.5 | `stealth.ts:67–312` | Stealth strike geometry | torpedo lead 1.5 km = 21 % → 2 % of torpedo reach |
| Rotate protection: arrival 0.5 (`TRANSFER_DONE_KM`), "more exposed" margin 0.5 | `reaperAi.ts:88`, `121` | T12 slot exchange | slots 3.6 km apart → 13.6 km apart |
| Launched craft start at 0.6 km/s | `battle.ts:890` | Initial craft velocity (a speed) | 44 % → 4 % of a fighter's top speed |
| Beam miss endpoint 6 km past the target, radius × 2.5 + 0.3; salvo spread 0.03; sweep pad max radius × 2.5 + 0.1 | `battle.ts:1339–1361`, `1458` | Visual miss geometry, torpedo spacing, projectile sweep padding | visual only / hull-scale |

Hull-scale by design, and correct to keep: hit spheres (radius; craft × 2.5 in the projectile sweep), miss offsets radius × (1.2 + (1 − q) × 4u) (`solutions.ts:47`; without a firing solution radius × (1.6 + 3u) + 0.05 km, `battle.ts:1294`), near misses within 1.6 radii, the spacing guard, hardpoint offsets (0.30–0.47 km forward on Reapers and dreadnoughts), the stealth strike range (point-defence reach + 1.2 S + target radius), the interpose distance. They make three things S-dependent (§4.2): the intercept physics (finding 8), the share of rounds blocked or struck by other hulls in dense lines, and a hull-scale offset of the exchange band (0.67–0.77 × range at S = 0.4, 0.57–0.62 at S ≥ 4; mount offsets and radii are 2–12 % of a range at S = 0.4 and under 1 % at S = 4; not attributed further).

### 1.4 The formation compression floor

`SLOT_COMPRESSION = max(S, 0.55)` (`formations.ts:22`). Below 0.55 formations stop shrinking with the battlespace, so at S = 0.4 slots are 0.55 / 0.4 = 1.375 × larger relative to weapon ranges than at S ≥ 0.55. Capital spacing is `max(3.2, 1.7 L / SLOT_COMPRESSION)` nominal km × `SLOT_COMPRESSION` (`formations.ts:124`), i.e. max(3.2 × max(S, 0.55), 1.7 L) km: 1.76 km for dreadnoughts and 3.4 km for Reapers at S = 0.4 (the hull-length guard binds for Reapers), 3.2 S km for every hull up to 2.2 km long at S ≥ 1.2. Measured with the floor removed (S = 0.4, `SLOT_COMPRESSION = S`): first anti-ship shot 13.1–13.4 s instead of 10.9–11.7 s (the Alliance screen, whose frigates sit 5.0 km ahead of the dreadnoughts in the reference line and 5.5–9.4 km in the Earth screen, reaches the Reaper beams later), exchange 0.63–0.74 × range instead of 0.67–0.77, Alliance line out of range 2–3 % instead of 3–6 %, winners unchanged (§4.4).

### 1.5 The spatial grid

- Cell 4 km (`spatial.ts:25`), keys clamped to [−512, 510] cells per axis: ±2,048 km at 4 km cells before hulls share edge cells (still found by the exact distance test, but slower).
- Rebuilt once per tick from start-of-tick positions (`battle.ts:622`); the queries run later in the tick, after earlier hulls have moved, and test **current** positions with an exact distance check. A hull that crossed a cell edge since the rebuild sits in a cell the query box may no longer cover and is missed although it is inside the radius. The module's stated contract (the same candidates as a brute-force scan of the ship list) therefore holds only approximately; the error is rare while the largest per-step displacement (top speed × 0.05 s: 0.016 km for a Reaper capital, 0.07 km for a fighter at S = 0.4) is small against a cell.
- Measured (§4.1): the shipped grid differs from a brute-force scan in 1 of the 11 runs at S = 0.4 and in 9 of 11 at S = 4. Padding each query box (not the distance test) by the largest `maxSpeed × SIM_DT` among the indexed hulls in `queryRadius`, `anyWithin` and `querySegment` makes it identical to the brute-force scan at any cell size: the steering never commands more than a hull's top speed and changes velocity toward that command (`movement.ts:388–410`), so no indexed hull is farther than `maxSpeed × SIM_DT` from the position it was indexed at, and the padded box always covers its cell (measured identical in 11 of 11 runs at S = 0.4, and at S = 4 with 4 km and 40 km cells). Craft launched during a tick still join the grid at the next rebuild (by design, independent of the cell).
- A query whose box spans more cells than are occupied scans the occupied cells instead (`spatial.ts:260–274`), so a coarse grid degrades to O(occupied cells) per query, not worse. At 100–200 hulls this costs nothing measurable (§4.8).

## 2. Catalogue, formations, doctrine and scenarios at S = 0.4

### 2.1 Weapon ranges and projectile speeds

Ranges and projectile speeds are `SIMULATION_ESTIMATE` (AU weapons `AU_MODIFIED`). Flight time to full range is the same at every S. Mass-accelerator rounds fly on to 2.2 × range (`PROJECTILE_RANGE_FACTOR`, `battle.ts:73`).

| Weapon | Range nominal km | Simulated km | ÷ 2 km Reaper | ÷ 888 m Everest | Projectile nominal km/s | Flight to full range (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dreadnought spinal (`alliance_dn_main`; turian 42, asari, salarian, geth 44) | 42 | 16.8 | 8.4 | 18.9 | 30 | 1.40 |
| Reaper capital beam | 44 | 17.6 | 8.8 | 19.8 | hit-scan | 0 |
| Cruiser spinal (36–40 by faction) | 36 | 14.4 | 7.2 | 16.2 | 26 | 1.38 |
| Reaper destroyer beam | 30 | 12.0 | 6.0 | 13.5 | hit-scan | 0 |
| Broadside battery | 28 | 11.2 | 5.6 | 12.6 | 24 | 1.17 |
| Thanix | 26 | 10.4 | 5.2 | 11.7 | hit-scan | 0 |
| Frigate gun | 24 | 9.6 | 4.8 | 10.8 | 22 | 1.09 |
| Disruptor torpedo | 18 | 7.2 | 3.6 | 8.1 | 2.2 | 8.18 |
| Fighter torpedo | 9 | 3.6 | 1.8 | 4.1 | 2.0 | 4.50 |
| Reaper point defence | 6.5 | 2.6 | 1.3 | 2.9 | hit-scan | 0 |
| GARDIAN | 6 | 2.4 | 1.2 | 2.7 | hit-scan | 0 |
| Fighter gun | 4 | 1.6 | 0.8 | 1.8 | 14 | 0.29 |
| Oculus beam | 3.5 | 1.4 | 0.7 | 1.6 | hit-scan | 0 |
| Destiny Ascension main gun | 48 | 19.2 | 9.6 | 21.6 | 36 | 1.33 |
| AU: Titan, Nova Array, legacy Nova, platform guns, heavy Thanix 34, Javelin 16 | 16–56 | 6.4–22.4 | 3.2–11.2 | 7.2–25.2 | 2.4–400 | 0.14–6.67 |

The spread from the capital band to point defence is 7 : 1 and S cannot change it (`lore-ranges.md` D4).

### 2.2 Ship speeds, accelerations and turn rates

All `SIMULATION_ESTIMATE` except the lengths, whose tags are shown (CC `CANON_CONFIRMED`, CI `CANON_INFERRED`, SE). Times are S-invariant; the braking distance is shown in simulated km at S = 0.4 and in the hull's own length.

| Class | Length m | Top speed nominal km/s | Accel nominal km/s² | Turn °/s | Sensor nominal km | v / a (s) | v² / 2a (km, own L) | 180° turn (s) | Own range ÷ top speed (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Reaper capital | 2,000 CC | 0.80 | 0.14 | 6 | 160 | 5.7 | 0.91, 0.46 L | 30 | 55 |
| Harbinger | 2,200 SE | 0.75 | 0.13 | 5 | 200 | 5.8 | 0.87, 0.39 L | 36 | 59 |
| Reaper destroyer | 160 CC | 1.60 | 0.40 | 16 | 120 | 4.0 | 1.28, 8.0 L | 11 | 19 |
| Oculus | 12 CI | 3.60 | 1.80 | 110 | 30 | 2.0 | 1.44, 120 L | 2 | — (anti-craft beam only) |
| Alliance dreadnought | 888 CI | 0.65 | 0.09 | 4.5 | 90 | 7.2 | 0.94, 1.06 L | 40 | 65 |
| Alliance carrier | 900 SE | 0.60 | 0.08 | 4 | 100 | 7.5 | 0.90, 1.00 L | 45 | 47 |
| Alliance cruiser | 700 SE | 0.90 | 0.16 | 9 | 70 | 5.6 | 1.01, 1.45 L | 20 | 40 |
| Alliance frigate | 170 CI | 1.40 | 0.32 | 22 | 60 | 4.4 | 1.22, 7.2 L | 8 | 17 |
| Normandy SR-2 | 216 CI | 1.60 | 0.40 | 26 | 80 | 4.0 | 1.28, 5.9 L | 7 | 16 |
| Trident fighter | 18 SE | 3.40 | 1.40 | 90 | 30 | 2.4 | 1.65, 92 L | 2 | 3 |
| Destiny Ascension | 1,600 CI | 0.55 | 0.08 | 3.5 | 120 | 6.9 | 0.76, 0.47 L | 51 | 87 |
| Quarian liveship | 2,200 CI | 0.40 | 0.05 | 2.5 | 60 | 8.0 | 0.64, 0.29 L | 72 | — |
| Other dreadnoughts (turian, asari, salarian, geth, quarian) | 820–1,100 | 0.58–0.68 | 0.08–0.10 | 4–5.5 | 80–120 | 6.6–7.2 | 0.84–0.92 | 33–45 | 65–71 |

The capital line reaches top speed within about its own length; at full lateral thrust a Reaper capital moves 55 m and a destroyer 157 m during a 1.4 s flight at S = 0.4 (× S / 0.4 at other scales; `lore-ranges.md` D2) — against hit spheres of 1,000 and 80 m radius.

### 2.3 Formation geometry

Reference Alliance task force (8 dreadnoughts, 1 carrier, 16 cruisers, 31 frigates; range 16.8 km) and a Reaper group (4 capitals, 8 destroyers; range 17.6 km) laid out by `assignSlots` at S = 0.4. Frontage and depth are slot extents; the neighbour column is the median nearest-capital distance.

| Formation | Alliance frontage × height × depth (km) | Frontage, depth ÷ range | Capital neighbour (km, own L) | Reaper frontage × height × depth (km) | Frontage, depth ÷ range | Reaper capital neighbour (km, L) |
| --- | --- | --- | --- | --- | --- | --- |
| line_abreast | 42.2 × 1.3 × 5.0 | 2.51, 0.29 | 1.76, 1.98 | 11.9 × 1.9 × 3.3 | 0.68, 0.19 | 3.40, 1.70 |
| defensive_screen | 15.4 × 2.2 × 9.4 | 0.92, 0.56 | 1.58, 1.78 | 11.5 × 1.7 × 6.0 | 0.65, 0.34 | 3.40, 1.70 |
| strike_wedge | 58.1 × 2.7 × 8.0 | 3.46, 0.48 | 1.87, 2.11 | 14.6 × 6.0 × 4.8 | 0.83, 0.27 | 3.61, 1.81 |
| capital_column | 9.9 × 3.0 × 16.3 | 0.59, 0.97 | 1.76, 1.98 | 6.5 × 1.9 × 11.4 | 0.37, 0.65 | 3.40, 1.70 |
| layered_line | 23.8 × 9.6 × 14.3 | 1.41, 0.85 | 1.76, 1.98 | 18.1 × 4.2 × 2.7 | 1.03, 0.15 | 3.40, 1.70 |
| box | 6.6 × 6.6 × 4.2 | 0.39, 0.25 | 1.51, 1.70 | 9.5 × 3.4 × 2.4 | 0.54, 0.13 | 3.40, 1.70 |
| swarm_descent | 20.7 × 17.9 × 21.5 | 1.23, 1.28 | 2.05, 2.31 | 15.5 × 15.1 × 16.0 | 0.88, 0.91 | 3.41, 1.71 |
| broadside_line | 5.0 × 1.3 × 42.2 (column until locked) | 0.29, 2.51 | 1.76, 1.98 | 3.3 × 1.9 × 11.9 | 0.19, 0.68 | 3.40, 1.70 |
| dispersed | 21.2 × 3.4 × 10.8 | 1.26, 0.64 | 2.67, 3.00 | 15.1 × 3.6 × 9.8 | 0.86, 0.56 | 5.92, 2.96 |

The scenarios use `defensive_screen` and `line_abreast` for organic fleets and `strike_wedge` for Reapers (Battle of Earth: Alliance 15.4 × 2.2 × 9.4 km, Reapers 12.4 × 6.0 × 3.1 km; reference: the 42.2 km Alliance line against a 14.6 km Reaper wedge).

At S ≥ 0.55 the layouts are the nominal layouts × S except where the hull-length guard binds; their extents relative to range are then the same at every S (measured at S = 1, 4, 10: line abreast 1.83 × 0.21 ranges, defensive screen 0.67 × 0.40, Reaper wedge 0.58 × 0.15) while capital spacing in hull lengths grows with S (S = 4: Alliance capitals 12.8 km = 14.4 own lengths apart, Reaper capitals 13.6 km = 6.8 L).

### 2.4 Doctrine distances

From `standoffOf` (`movement.ts:125–134`) and the `FACTIONS` doctrine; "fleet range" is the longest anti-capital (or non-point-defence) range in the fleet. An `advance` order closes to 0.55 × standoff for every faction.

| Faction | `preferredRangeFactor` | Aggression | Anchor wants the enemy centroid at (÷ fleet range) | Backs off inside (÷ range) |
| --- | ---: | ---: | --- | --- |
| Reaper | 0.70 | 0.95 | 0.438 | never |
| Alliance | 0.85 | 0.55 | 0.875 × spinal range (spinal line, owner rule); 0.701 without dreadnoughts | never (spinal line); 0.421 otherwise |
| Cerberus | 0.80 | 0.70 | 0.875 × spinal range (spinal line); 0.600 otherwise | never (spinal line); 0.360 |
| Turian | 0.75 | 0.75 | 0.544 | 0.326 |
| Asari | 0.90 | 0.45 | 0.788 | 0.473 |
| Salarian | 0.95 | 0.35 | 0.879 | 0.527 |
| Quarian | 0.80 | 0.40 | 0.720 | 0.432 |
| Geth | 0.80 | 0.60 | 0.640 | 0.384 |

Heading lock at 1.1 × range, unlock after 8 s beyond 1.4 × range or more than 60° off the bow (`MOVEMENT`, `movement.ts:20`). Capitals close on a target out of range by at most the 2 km leash; escorts to 0.9 × their own range within 20 km of their slot (`stationGoal`, `movement.ts:545–564`; §1.3). The anchor never runs more than 12 S km ahead of its fleet's centroid.

Two rules keep hulls from idling out of range today. The escorts' screen leash above (CORE T10 deviation 3: 0.9 × their own range, at most 20 km past the slot, written in absolute km). And the Reapers' "never idle" advance (AP §10, `reaperAdvanceGoal`, `movement.ts:567–583`, called from `ai.ts:464–467`): a Reaper hull whose target is out of its range (or that has none) while its fleet's anchor moves at under 0.1 × its top speed leaves its slot and closes on the nearest enemy combatant to 0.8 × its own range at 0.6 × top speed; every term is a fraction of a range or a speed, so it is S-invariant. Organic capitals have only the 2 km leash, and carriers keep out by rule.

### 2.5 Scenario distances and time limits

Fleet positions are nominal km (× S in the simulation).

| Scenario | Time limit (s) | Nearest opposing first-line anchors, nominal / simulated km (÷ 17.6 km, the Reaper beam range) | Later arrivals |
| --- | ---: | --- | --- |
| Battle of Earth | 420 | 80.2 / 32.1 (1.82) | Reaper second wave at 55 s from (−40, −3, 70) |
| Defence of Palaven | 420 | 78.0 / 31.2 (1.77) | Reaper flank group at 70 s; optional Alliance detachment at 60 s |
| Fall of Thessia | 420 | 82.0 / 32.8 (1.86) | — |
| Defence of Sur'Kesh | 420 | 78.0 / 31.2 (1.77) | Reaper flank group at 90 s (early warning) or 25 s (late) |
| Cerberus Intervention | 360 | 70.0 / 28.0 (1.59) against Cerberus; under Prime/Apex the Alliance and the Cerberus Black Fleet face a Reaper group, 78.6 / 31.4 (1.79) | — |
| Rannoch | 420 | 76.0 / 30.4 (1.73) | — |
| Battle of the Citadel | 420 | 71.8 / 28.7 (1.63) to the geth escort; 81.6 / 32.6 (1.85) to Sovereign | Alliance Fifth Fleet at 40 s from (0, 6, −70) |
| Final Battle of Earth | 540 | 82.5 / 33.0 (1.88) | Reaper reserve at 90 s from (−50, 0, 76) |
| Alliance Fleet Engagement (reference) | 360 | 76.0 / 30.4 (1.73) | — |
| Prime/Apex Sol Defence, Palaven Defence | 480 | 80.0 / 32.0 (1.82) | Reaper second wave at 70 s |
| Cerberus Ascendant (Harbinger) | 360 | 80.0 / 32.0 (1.82) | — |

Custom battles: starting distance slider 30–160 nominal km in steps of 2, default 76 (`ui/screens/custom.ts:39`, `139`); time limit default 420 s, minimum 60. Custom fleets deploy at z = ∓ half the starting distance, extra fleets 4 km further back each (`scenarios/index.ts:687–693`). Campaign engagements: 420 s, allied fleets at (−18 + 18 i, 0, −36 − 4 i), an orbital defence group at (0, −4, −24) where the system has one, hostile fleets at (−12 + 24 i, 0, 42 + 6 i) arriving every 20 s (`campaign/engine.ts:267–304`); auto-resolve runs `sim.run()`, capped at 200,000 steps = 10,000 s (`battle.ts:690`). The database screen and the custom slider show catalogue (nominal) km, so a change of S changes what those labels mean (`ui/screens/database.ts:59`; `LORE_REFERENCE.md` "Visual liberties").

## 3. The engine today (S = 0.4)

### 3.1 The eleven calibration runs

"Out after contact" is the mean fraction of the line with no enemy hull in range (§8); B in parentheses is Reaper capitals only. "DN spinal hit" is the share of dreadnought spinal rounds that struck their intended target (rounds that struck another hull do not count, unlike the calibration harness's `spinalHitFrac`).

| Run | Winner, end (s) | A survival | Lost A / B (capitals) | First anti-ship shot (s) | First capital gun at a capital (s) | First loss A / B (s) | First capital loss A / B (s) | Capital to nearest enemy capital after contact: km, L, ÷ range (p50) | Out after contact A line / B (B capitals) | DN spinal hit | Reaper capital beam hit |
| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | --- | ---: | ---: |
| Battle of Earth canon 42 | B, 240.9 | 5 % | 37 / 10 (7 / 1) | 11.0 | 32.7 | 20.7 / 52.2 | 51.7 / 102.5 | 13.0, 6.5, 0.74 | 6 / 8 (5) % | 40 % | 39 % |
| Battle of Earth canon 7 | B, 242.2 | 5 % | 37 / 8 (7 / 1) | 10.9 | 32.9 | 14.8 / 58.7 | 50.9 / 61.3 | 13.3, 6.7, 0.77 | 5 / 7 (6) % | 41 % | 45 % |
| Reference canon 7 | B, 324.4 | 5 % | 45 / 9 (9 / 1) | 11.6 | 26.1 | 14.9 / 40.7 | 43.4 / 40.7 | 12.3, 6.1, 0.72 | 4 / 1 (1) % | 36 % | 45 % |
| Reference canon 8 | B, 360 (limit) | 5 % | 44 / 9 (9 / 1) | 11.7 | 26.2 | 12.2 / 40.4 | 52.0 / 40.4 | 12.0, 6.0, 0.70 | 3 / 1 (1) % | 38 % | 36 % |
| Reference canon 9 | B, 360 (limit) | 6 % | 43 / 10 (9 / 2) | 11.5 | 26.6 | 15.1 / 26.5 | 44.2 / 36.9 | 11.7, 5.9, 0.67 | 3 / 1 (1) % | 40 % | 43 % |
| Reference Apex 7 | A, 127.4 | 65 % | 9 / 12 (5 / 4) | 11.0 | 21.3 | 14.6 / 16.9 | 46.6 / 32.9 | 11.9, 5.9, 0.66 | 11 / 3 (3) % | 43 % | 43 % |
| Reference Apex 8 | A, 121.1 | 70 % | 8 / 12 (4 / 4) | 11.1 | 21.4 | 17.0 / 32.7 | 52.3 / 32.7 | 12.3, 6.2, 0.66 | 14 / 3 (3) % | 43 % | 42 % |
| Reference Apex 9 | A, 126.6 | 69 % | 10 / 12 (4 / 4) | 11.2 | 21.3 | 11.8 / 24.0 | 42.0 / 33.8 | 12.7, 6.3, 0.67 | 12 / 3 (3) % | 43 % | 48 % |
| Apex Sol Defence 1 | A, 151.8 | 92 % | 5 / 18 (1 / 6) | 12.9 | 24.2 | 16.3 / 30.5 | 53.1 / 34.9 | 14.9, 7.4, 0.79 | 26 / 19 (17) % | 39 % | 30 % |
| Final Battle canon 1 | A, 186.1 | 72 % | 22 / 32 (6 / 10) | 13.7 | 31.0 | 19.7 / 41.6 | 51.6 / 45.8 | 12.4, 6.2, 0.72 | 12 / 14 (10) % | 32 % | 31 % |
| Final Battle Apex 1 | A, 87.4 | 95 % | 10 / 21 (2 / 7) | 13.2 | 24.8 | 13.8 / 33.6 | 44.4 / 37.0 | 16.8, 8.3, 0.94 | 37 / 7 (7) % | 22 % | 27 % |

The canon Final Battle changed winner between T11 (B at 434 s, measured on `c2e389d` with the same probe) and T12 (A at 186 s): it is the run most sensitive to small changes.

### 3.2 The Battle of Earth (canon, seed 42) over time

Per 30 s window: every Alliance and Reaper capital's distance to the nearest enemy capital (p10 / p50 / p90), the share of each line out of range (§8), the distance between the two sides' hull centroids, the line-of-sight closing speed of capital pairs and the mean capital speed as a fraction of top speed.

| Window | Capital to enemy capital, km | p50 in L | p50 ÷ range | A line out | B out | Centroids (km) | Closing p50 (km/s) | Speed A / B |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| before contact (0–11 s) | 30.9 / 33.5 / 35.3 | 16.7 | 1.95 | 100 % | 100 % | 26.9 | 0.495 | 0.69 / 0.76 |
| 0–30 s | 21.2 / 28.0 / 34.0 | 14.0 | 1.64 | 72 % | 50 % | 19.1 | 0.577 | 0.89 / 0.92 |
| 30–60 s | 12.2 / 13.6 / 18.2 | 6.8 | 0.80 | 0 % | 6 % | 8.0 | 0.273 | 0.43 / 0.80 |
| 60–90 s | 8.8 / 9.9 / 27.9 | 4.9 | 0.58 | 0 % | 40 % (second wave) | 13.0 | −0.004 | 0.27 / 0.61 |
| 90–120 s | 9.1 / 10.5 / 20.1 | 5.3 | 0.62 | 0 % | 0 % | 8.4 | 0.108 | 0.00 / 0.53 |
| 120–150 s | 8.9 / 11.7 / 14.0 | 5.9 | 0.67 | 1 % | 0 % | 5.8 | 0.000 | 0.02 / 0.23 |
| 150–241 s | Reaper capitals against the last Alliance capital, the carrier (the sixth dreadnought died at 132.9 s, the carrier at 184.6 s): 12.7–16.2 km | 6.6–7.2 | 0.74–0.81 | 0–4 % | 0 % | 3.1–4.9 | — | — / 0.06 |

After contact 1 % of capital samples are inside 0.5 × range, 51 % at 0.5–0.75, 23 % at 0.75–1.0 and 25 % beyond range (capitals not yet engaged, the second wave). The long-range phase (0.75–1.0 × range) lasts about one 30 s window. By 120 s the two centroids are 5.8 km apart: the fleets have interpenetrated, and the lines stand still while they shoot (Alliance capitals at 0–2 % of top speed from 90 s on).

The reference engagement and the canon Final Battle over time (same measure; p50 in L with the p10–p90 spread in brackets, then p50 ÷ range; line out of range A / B):

| Window | Reference canon 7 / 8 / 9 | Out A / B | Reference Apex 7 | Out A / B | Final Battle canon 1 | Out A / B |
| --- | --- | --- | --- | --- | --- | --- |
| before contact (0–11.5 s; Final Battle 0–13.7 s) | 14.8 L (13.3–16.2), 1.74 | 100 / 100 % | 14.8 L, 1.56 | 100 / 100 % | 15.7 L (13.3–18.7), 1.96 | 100 / 100 % |
| 0–30 s | 12.3 L (8.9–15.2), 1.44 | 66–71 / 51 % | 12.2 L, 1.30 | 67 / 51 % | 14.0 L (10.2–17.8), 1.76 | 90 / 65 % |
| 30–60 s | 6.3–6.6 L (5.1–7.6), 0.74–0.77 | 0 / 0 % | 6.8 L, 0.72 | 4 / 0 % | 7.3 L (5.0–10.6), 0.88 | 11 / 0 % |
| 60–90 s | 5.0–5.3 L (4.7–7.0), 0.59–0.63 | 0 / 0 % | 5.1 L, 0.55 | 4 / 0 % | 5.6 L (3.1–7.4), 0.63 | 0 / 0 % |
| 90–120 s | 5.1–5.3 L (4.7–6.9), 0.60–0.64 | 0 / 0 % | 5.2 L, 0.55 | 4 / 0 % | 5.8 L (3.1–13.1), 0.71 | 1 / 63 % (the reserve arrives at 90 s) |
| 120–150 s | 4.8–5.4 L (4.7–7.8), 0.58–0.64 | 0–3 / 0 % | 5.8 L, 0.61 (ends at 127 s) | 16 % / — | 4.9 L (2.3–8.3), 0.58 | 6 / 1 % |
| 150–180 s | 6.8–7.0 L (4.7–8.7), 0.77–0.80 | 0 / 0 % | — | — | 4.2 L (3.3–6.6), 0.50 | 2 / 0 % |
| 180–240 s | 7.9–8.0 L (6.5–8.6), 0.90–0.91, until the last Alliance capital dies (173.3 / 181.9 / 218.9 s in seeds 9 / 8 / 7) | 0–3 / 0 % | — | — | 5.8 L (3.7–7.4), 0.71 (ends at 186 s) | 18 / 0 % |

The reference has the Battle of Earth's shape: two capital ranges apart at the start, inside the range by 30–60 s, a floor at 4.7 L (9.4 km, 0.53–0.56 × range) from 60 s on, and the distance rising after 150 s only because the surviving Alliance capitals are the ones farthest from the Reapers. The Final Battle, with five allied fleets and a Reaper reserve at 90 s, runs closer (p10 down to 2.3 L) as the allied lines and the Reaper groups interpenetrate.

### 3.3 Time scale

| Phase (canon five; Apex in brackets) | Time |
| --- | --- |
| Start to first anti-ship shot | 10.9–11.7 s: the lead Reaper capital's beam on a screening Alliance frigate at full range (17.7–17.9 km; Final Battle 13.7 s); the Reaper destroyers at 14.0–14.7 s; the Alliance's first at 16.5–17.0 s (frigate guns on the destroyers; the dreadnoughts' spinal guns on the destroyers from 18.6 s) |
| Start to first capital gun at a capital | 26.1–32.9 s (Alliance spinal first; Reaper capital beams at 29.5–37.9 s) [21.3–24.8 s: the Titan gun reaches 19.2 km] |
| First loss of each side | A 12.2–20.7 s, B 26.5–58.7 s |
| First capital loss | 36.9–51.7 s, 10–19 s after the first capital shot [32.7–37.0 s] |
| Alliance capitals lost | one every 2–59 s (median 14–18 s); all 7 at Earth by 180–185 s (the carrier last), all 9 in the reference by 173–219 s |
| Half of the hulls lost | Alliance 148–255 s; Reapers 53–98 s (mostly destroyers) [Reapers 36–51 s] |
| Last Alliance capital lost → end | 56–187 s, 23–52 % of the battle (Earth 56 / 63 s; reference 106 / 178 / 187 s): the Reapers hunt the escorts down to the 5 % combat-ineffective line (`WITHDRAWAL.combatIneffectiveFraction`, `movement.ts:23`) or the time limit cuts the battle |
| End | Battle of Earth 241 / 242 s (A combat-ineffective); reference 324 / 360 / 360 s (two attrition judgements at the limit); canon Final Battle 186 s (B destroyed) |
| Reference with the 360 s limit doubled | 324.4 / 362.2 / 384.8 s, each "A combat-ineffective", same winner, 4.6–4.9 % survival |

The approach is short because the capitals start 1.7–2.0 ranges apart and close at 0.50–0.54 km/s: a 17.6 km range is crossed in 33–36 s. The exchange is short because the whole capital line is inside the Reaper beams' reach from the first minute on (§3.2, §3.4) and stays there; its pace is set by the beams' damage, cadence and burst (1,900 per second for 2.8 s every 6.2 s) against the barrier and hull model, which the rules preserve. The capital exchange itself (first capital shot to last Alliance capital lost) takes 147–193 s in the canon five; a quarter to a half of each canon battle comes after it.

### 3.4 Queueing after contact

| Fleet | Line out of range, mean after contact (or arrival) | In its first 30 s | ≤ 10 % out from |
| --- | --- | --- | --- |
| Reaper first waves (all runs) | 1–7 % (canon five 1–2 %) | 12–20 % | 5.9–9.4 s after contact |
| Reaper second waves: Battle of Earth (55 s), Apex Sol Defence (70 s), canon Final Battle reserve (90 s) | 16–17 %, 29 %, 26 % | 98–100 %, 79 %, 82 % | 34–37 s, 27 s, 29 s after arrival |
| Alliance (canon five) | 3–6 % | 28–37 % | 13.6–20.1 s after contact |
| Alliance (Apex reference, Sol Defence) | 11–14 %, 26 % | 28–38 % | 12.9–18.2 s |
| Canon Final Battle: Alliance, turian, asari, quarian, geth | 9 / 9 / 12 / 15 / 19 % | 34–86 % | 15–33 s |
| Apex Final Battle: same fleets | 23–57 % | 43–83 % | 19–65 s |

Hulls out of range for more than 60 s at a stretch: Battle of Earth 42 and 7 one frigate each (66–69 s); reference canon 7 / 8 / 9 the carrier (120–138 s) and in seed 9 one frigate (149 s); Apex 7 / 8 / 9 the carrier (71–85 s); Sol Defence both carriers (68, 107 s); canon Final Battle none; Apex Final Battle six hulls in the mop-up (63–75 s). Carriers are out by design: `carrierGoal` keeps 0.8 × the nearest enemy's main range (14.1 km against a Reaper capital, `movement.ts:498–529`) and their only anti-ship weapons are 11.2 km broadsides. The Apex queueing is the mop-up of the last one or two Reapers, which a line 2.5 × range wide cannot all reach; CORE's idle rule excludes the same phase (`CORE_PROGRESS.md` T10 deviation 10).

### 3.5 Hit rates by range band

Pooled over the canon five and the canon Final Battle. Band = distance at fire from the mount to the target's centre ÷ the weapon's range (the distance the hit model uses; a gun fires only inside it, so no band lies beyond 1.0). "Rolled" is the random draw (a hit is aimed at the intercept, a miss is offset by `missOffset`); "struck" is whether the round physically struck its intended target. For beams the two are the same.

| Weapon (shots; struck, rolled) | 0–0.25 | 0.25–0.5 | 0.5–0.75 | 0.75–1.0 | Struck vs capitals (0.25–0.5 / 0.5–0.75 / 0.75–1.0) | Struck vs escorts (same bands) | Rounds fired beyond half range |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| Dreadnought spinal guns | 12; 67 %, 67 % | 195; 47 %, 50 % | 925; 33 %, 43 % | 1,022; 36 %, 44 % | 50 / 35 / 40 % | 12 / 9 / 5 % | 90 % |
| Cruiser spinal guns | 173; 60 %, 58 % | 1,076; 49 %, 58 % | 2,286; 44 %, 50 % | 2,786; 35 %, 44 % | 52 / 47 / 37 % | 7 / 7 / 8 % | 80 % |
| Broadsides | 304; 25 %, 23 % | 2,926; 15 %, 16 % | 6,758; 14 %, 14 % | 8,526; 9 %, 9 % | 22 / 19 / 14 % | 7 / 7 / 6 % | 83 % |
| Frigate guns | 328; 54 %, 48 % | 2,269; 49 %, 51 % | 4,742; 43 %, 45 % | 14,772; 33 %, 40 % | 56 / 47 / 35 % | 10 / 9 / 8 % | 88 % |
| Reaper capital beam | 98; 37 % | 327; 31 % | 385; 54 % | 275; 31 % | 54 / 72 / 40 % | 28 / 33 / 20 % | 61 % |
| Reaper destroyer beam | 13; 23 % | 74; 19 % | 89; 28 % | 253; 32 % | 33 / 44 / 42 % | 18 / 26 / 18 % | 80 % |

Apex runs pooled (struck at 0.25–0.5 / 0.5–0.75 / 0.75–1.0): Titan and spinal guns 44 / 39 / 26 %, Thanix 31 / 45 / 35 %, Reaper capital beam 16 / 52 / 30 %. Most fire happens in the outer half of the range; the near bands mix in shots at escorts, which is why beams hit less there. The model's own range terms are mild: × 0.97 / 0.89 / 0.75 / 0.55 on the hit probability at 0.25 / 0.5 / 0.75 / 1.0 × range (`damage.ts:111`) and × 0.97 / 0.88 / 0.72 / 0.50 on the solution build rate (`solutions.ts:58`). The gap between rolled and struck in the outer bands (8–10 points for the dreadnought spinal guns, 6–9 for the cruisers') is mostly rounds that struck another hull first (§3.6).

### 3.6 Physical intercept and blocking

The check `lore-ranges.md` §4 item 8 asked for. Each aimed round was followed to its closest approach to its intended target.

| Outcome (S = 0.4; canon five and canon Final Battle, Apex in brackets) | Share |
| --- | --- |
| Rolled hits on Reaper capitals that passed the live target without striking it | 0–1 % [0–1 %] |
| Rolled hits on Reaper destroyers that passed the live target (it accelerated out of the intercept during the flight) | 0–3 % (3 % in the Final Battle) [0–3 %] |
| Rolled hits on Reaper capitals that struck another hull first (T12's destroyer cover holds the line between a damaged capital and its attacker) | 6–17 % [0–7 %] |
| Rolled hits on Reaper destroyers whose target died before the round arrived | 0–12 % [2–23 %] |
| Rolled misses that struck another hull | 4–11 % [2–4 %] |

All of these move with S (§4.2): manoeuvre misses grow with S because the target's displacement during the S-invariant flight time grows with S while its hit sphere does not; blocking and stray hits fall because hulls and hit spheres stay hull-scale while the spacing between them grows.

### 3.7 Closing speeds

Line-of-sight closing speed of each capital and its nearest enemy capital before contact: p50 0.495–0.566 km/s simulated (1.24–1.42 nominal km/s) over the eleven runs, 0.50–0.54 in the canon five; p90 0.566–0.600 km/s (a Reaper capital's 0.32 km/s plus a dreadnought's 0.26 km/s top speed is 0.58 km/s). The side centroids close at 0.79–0.84 km/s, because the escorts run ahead. Capitals cruise at 0.69–0.77 (Alliance) and 0.76–0.82 (Reapers) of top speed before contact. After contact |closing| p50 is 0.05–0.17 km/s in the canon five (0.30 in the canon Final Battle, 0.21–0.39 under Apex) and capitals move at 0.23–0.46 and 0.32–0.51 of top speed: the lines stand and fight; the anchors stop.

## 4. Lever experiments

Scratch copies of `src/simulation/` with one change each, the eleven runs each. From §4.2 on, every copy that changes S also uses the exact (padded) grid with the cell scaled to the battlespace (10 S km), so the differences come from the lever and not from the grid. Single seeds are chaotic: read the geometry and timing columns across seeds, not one battle's winner.

### 4.1 Grid exactness

Each variant against a brute-force scan of the indexed hulls (every occupied cell searched whatever the query box), same S.

| Variant | Runs identical to brute force (of 11) | Differences |
| --- | ---: | --- |
| S = 0.4, 4 km cells (shipped) | 10 | reference canon 8: B at 360 s with 44 Alliance hulls lost; brute force B at 334.2 s with 45 |
| S = 0.4, 2 km cells | 9 | reference canon 8 and 9 (35 and 37 Alliance hulls lost instead of 45 and 43) |
| S = 0.4, padded queries, 4 km cells | 11 | — |
| S = 4, 4 km cells | 2 | 9 runs; the canon Final Battle flips from A at 207.7 s (24 Alliance hulls lost) to B at the 540 s limit (86 lost) |
| S = 4, 40 km cells | 7 | Battle of Earth 42, reference canon 9, reference Apex 7, Sol Defence |
| S = 4, padded queries, 4 km or 40 km cells | 11 | — |
| S = 10, 4 km cells (against padded 100 km cells) | 2 | 9 runs |

### 4.2 `BATTLESPACE_SCALE` sweep and the two coupling checks

Ranges over the canon five. "Pad" = S = 0.4 with the exact grid. F04 = S = 0.4 without the compression floor (`SLOT_COMPRESSION = S`). P4L = S = 4 with `SLOT_LEASH_KM` and `SCREEN_LEASH_KM` multiplied by 10 (= S / 0.4). "Flown past" = rolled hits on Reaper destroyers that passed the live target; "blocked" = rolled hits on Reaper capitals that struck another hull first; "strays" = rolled misses that struck another hull.

| Variant | Capital to enemy capital p50 (km) | In L | ÷ range | First anti-ship shot (s) | First capital gun (s) | First capital loss (s) | End (s) | Winners | A line out | B out | DN spinal hit | Reaper beam hit | Flown past | Blocked | Strays |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S = 0.4 (shipped) | 11.7–13.3 | 5.9–6.7 | 0.67–0.77 | 10.9–11.7 | 26.1–32.9 | 36.9–51.7 | 241–360 | BBBBB | 3–6 % | 1–8 % | 36–41 % | 36–45 % | 0 % | 6–17 % | 5–11 % |
| Pad (S = 0.4, exact grid) | 11.7–13.3 | 5.9–6.7 | 0.67–0.77 | 10.9–11.7 | 26.1–32.9 | 36.9–51.7 | 241–360 | BBBBB | 3–6 % | 1–8 % | 36–41 % | 35–45 % | 0 % | 6–20 % | 5–12 % |
| F04 (S = 0.4, no floor) | 11.0–12.9 | 5.5–6.5 | 0.63–0.74 | 13.1–13.4 | 26.1–32.0 | 38.7–49.7 | 276–360 | BBBBB | 2–3 % | 1–7 % | 40–53 % | 42–53 % | 0–6 % | 3–28 % | 3–14 % |
| S = 1 | 27.4–31.6 | 13.7–15.8 | 0.63–0.72 | 13.3–13.6 | 26.5–32.1 | 33.9–46.0 | 263–335 | BBBBB | 2–4 % | 1–8 % | 40–54 % | 41–51 % | 2–14 % | 14–30 % | 7–14 % |
| S = 4 | 104.7–106.2 | 52.4–53.1 | 0.60–0.62 | 14.8–15.2 | 27.1–33.2 | 37.5–52.0 | 280–360 | BBBBB | 5–26 % | 2–10 % | 39–56 % | 39–49 % | 16–28 % | 0–2 % | 0–2 % |
| P4L (S = 4, leashes × 10) | 97.0–111.3 | 48.5–55.7 | 0.57–0.66 | 13.4–13.7 | 26.7–32.4 | 39.2–51.6 | 333–420 | BBBBB | 2–4 % | 1–4 % | 42–53 % | 50–54 % | 10–49 % | 0–5 % | 0–3 % |
| S = 10 | 250.4–262.1 | 125.2–131.0 | 0.57–0.60 | 17.0–17.3 | 25.9–33.4 | 36.7–48.4 | 257–330 | BBBBB | 6–38 % | 2–11 % | 41–55 % | 40–52 % | 24–33 % | 0–2 % | 0–1 % |

Battle of Earth 42, capital distance p50 as a fraction of range per window (0–30 / 30–60 / 60–90 / 90–120 / 120–150 s): S = 0.4 1.64 / 0.80 / 0.58 / 0.62 / 0.67; S = 1 1.59 / 0.77 / 0.49 / 0.50 / 0.72; S = 4 1.59 / 0.78 / 0.45 / 0.41 / 0.51; S = 10 1.59 / 0.78 / 0.48 / 0.48 / 0.59. In hull lengths the same windows read 14.0 / 6.8 / 4.9 / 5.3 / 5.9 L at S = 0.4 and 337 / 166 / 102 / 105 / 130 L at S = 10.

Over all eleven runs the winners are the same at S = 0.4, 4 and 10 (canon five B, Apex and the canon Final Battle A); at S = 1 the canon Final Battle runs to its 540 s limit as a side-B judgement.

Reading:

- The hull-length ratio of the exchange is about 12.5–17 L per unit of S (14.8–16.8 at 0.4, 13.7–15.8 at 1, 13.1–13.3 at 4, 12.5–13.1 at 10).
- Capital fire, first capital losses and the approach in fractions of range do not move with S. First contact (the lead Reaper capital's beam on the Alliance screen) does: 11 s at S = 0.4 because of the compression floor (F04: 13 s), 15–17 s at S ≥ 4 because the screen leash shrinks (P4L: 13.4–13.7 s). With the floor removed and the leashes scaled, first contact is 13.1–13.7 s at every S.
- Queueing of the Alliance line at S ≥ 4 (20–38 % in the reference runs) disappears when the leashes scale (P4L: 2–4 %, no hull out for more than 60 s at a stretch).
- The Reapers do not queue at any S measured: first waves are 1–9 % out on average after contact at S = 0.4, 1, 4 and 10 (≤ 10 % out after 4–9 s at S ≤ 1, 10–13 s at S ≥ 4, 4–5 s at S = 4 with the leashes scaled; at large S the Alliance screen no longer runs forward into their reach). Second waves need 27–37 s after arrival to be ≤ 10 % out at S = 0.4, 41–59 s at S ≥ 4 and 30–42 s with the leashes scaled.
- The intercept terms move as expected: destroyers become hard to hit with slugs, blocking and stray hits vanish, and the dreadnought spinal guns' struck rate rises from 36–41 % to 39–56 % because fewer rounds are blocked (the gap to the rolled rate shrinks from 7–15 points at S = 0.4 to 1–6 points at S ≥ 1), while the rolled rate stays in the same band (41–58 % at S ≥ 1 against 45–55 %).

### 4.3 The cause of the queueing at large S

At S = 4 the 20 km escort leash is 5 nominal km. The reference line abreast is then 307 km wide; a frigate on its wing sits about 150 km from the centre, and with a 96 km gun and a 20 km leash it cannot reach a Reaper group engaged near the centre. Measured: 6–9 frigates per reference battle out of range for 68–346 s at a stretch at S = 4, 9–12 at S = 10 (the Battle of Earth's defensive screen, 112 km wide at S = 4, keeps 5–7 % out). With the leashes at 20 and 200 km (P4L) every canon run is back to 2–4 % of the line out of range, ≤ 10 % out 8.5–9.6 s after contact in the reference (14.4 s at the Battle of Earth), and no hull out for more than 60 s.

### 4.4 The compression floor

F04 (§4.2): formations 0.73 × as large relative to range; the Alliance screen enters the Reaper beams' reach 2 s later (13.1–13.4 s); the Alliance line is out of range less (2–3 %); the exchange moves in slightly (0.63–0.74 × range). In the Battle of Earth the late exchange sits closer (0.45–0.47 × range from 60 s to 150 s against 0.58–0.67). Canon winners unchanged.

### 4.5 Ship speed × 0.5 (the time-scale lever)

Every hull's top speed halved at S = 0.4 (craft included); accelerations, ranges, weapons and doctrine unchanged; exact grid.

| Measure (canon five) | Today | Speeds × 0.5 |
| --- | --- | --- |
| Closing speed before contact, p50 | 0.50–0.54 km/s | 0.29 km/s |
| First anti-ship shot | 10.9–11.7 s | 18.2–19.7 s |
| First capital gun at a capital | 26.1–32.9 s | 46.5–61.2 s |
| First capital loss | 36.9–51.7 s | 60.9–80.3 s |
| Capital distance p50 after contact | 0.67–0.77 × range, 5.9–6.7 L | 0.77–0.83 × range, 6.7–7.2 L |
| Battle of Earth 42 capital distance ÷ range (0–30 / 30–60 / 60–90 / 90–120 / 120–150 s) | 1.64 / 0.80 / 0.58 / 0.62 / 0.67 | 1.81 / 1.32 / 0.89 / 0.62 / 0.57 |
| A line out after contact | 3–6 % | 6–8 % (carriers out for 88–208 s at a stretch) |
| End at the 360–420 s limits | 241–360 s, BBBBB | 230–360 s, BBBBB (all three reference seeds at the limit) |
| End with every limit doubled | reference 324 / 362 / 385 s | reference 397 / 372 / 404 s, all B, 4.6–4.9 % survival |
| Apex reference | A at 121–127 s, 65–70 % survival | A at 116–135 s |

Half speed stretches the approach by 1.6–1.9 × and the whole battle by −4 to +34 % (single seeds); the exchange itself is set by damage and cadence.

### 4.6 Reaper standoff at 0.875 × range (a doctrine lever)

The Reaper anchor holds 0.875 × fleet range from the enemy centroid instead of 0.4375, like the Alliance spinal line; nothing else changed; exact grid.

| Measure (canon five) | Today | Reapers at 0.875 |
| --- | --- | --- |
| Capital distance p50 after contact | 11.7–13.3 km, 5.9–6.7 L, 0.67–0.77 × range | 14.0–15.2 km, 7.0–7.6 L, 0.82–0.87 × range |
| Battle of Earth 42 ÷ range (0–30 / 30–60 / 60–90 / 90–120 / 120–150 s) | 1.64 / 0.80 / 0.58 / 0.62 / 0.67 | 1.64 / 0.98 / 0.77 / 0.77 / 0.77 |
| First capital gun / first capital loss | 26.1–32.9 / 36.9–51.7 s | 26.5–36.9 / 42.1–61.8 s |
| End, winners | 241–360 s, BBBBB | 237–360 s, BBBBB |
| Over all eleven runs | — | Apex reference A; Sol Defence a draw at its 480 s limit; canon Final Battle A at 309 s |

### 4.7 Time limits

With every limit doubled (no other change) the reference canon seeds end at 324.4 / 362.2 / 384.8 s instead of 324.4 / 360 / 360 s, all "A combat-ineffective" with the same winner; the Battle of Earth, Apex and Final Battle runs end before their limits and do not change. With speeds halved the reference needs up to 404 s (§4.5).

### 4.8 Cost

Uninstrumented `sim.run()`, two sessions (load 7–9, then 7–10, other workflows running) of two passes each, so read the ranges loosely: the spread between passes exceeds the differences between variants.

| Variant | Battle of Earth 42 (ms per step) | Canon Final Battle (ms per step) |
| --- | --- | --- |
| S = 0.4, 4 km cells (shipped) | 0.41–1.15 | 1.36–2.79 |
| S = 4, padded, 40 km cells | 0.37–1.06 | 1.29–2.21 |
| S = 10, padded, 100 km cells | 0.40–1.03 | 1.57–2.69 |
| S = 10, 4 km cells (inexact) | 0.33–1.11 | 1.21–2.16 |

The padded, scaled grid costs the same as today's; unscaled 4 km cells at S = 10 cost about the same (the occupied-cell fallback) but compute different battles (§4.1). Battle length in steps is the cost driver: 4,817 steps for the Battle of Earth's 241 s; a 10 × longer battle is 10 × the steps.

## 5. Levers: range-to-hull ratio versus time scale

| Lever | Where | Range-to-hull ratio | Time scale | Evidence | Side effects to plan for |
| --- | --- | --- | --- | --- | --- |
| `BATTLESPACE_SCALE` | `constants.ts:9` | ∝ S: exchange ≈ 12.5–17 L × S | none to first order | §4.2 | the absolute constants of §1.3 (queueing, first contact); grid exactness (§4.1); intercept physics, blocking and strays (§3.6); formation spacing in hull lengths grows as 3.2 S km above 0.55; render visibility (§6); the meaning of nominal-km labels in the UI |
| Re-based catalogue ranges (per layer) | `weapons.ts` `range` | per layer | approach and flight times grow with range ÷ speed unless speeds are re-based too | §1.2 | who out-ranges whom, doctrine distances (fractions of the fleet's longest range), the layer spread (`lore-ranges.md` D4–D5), every calibration pin |
| Doctrine standoff | `factions.ts` doctrine, `SPINAL_STANDOFF`, `standoffOf` | moves the exchange inside the range (Reapers at 0.875: 0.67–0.77 → 0.82–0.87 × range); bounded by the range | first capital loss + 5–10 s; time at long range | §4.6 | canon pins depend on it (T19); "Reapers close" is the canon inference (`lore-ranges.md` §4 item 6) |
| Ship top speeds | `ships.ts` `maxSpeed` | none (fights drift out to 0.77–0.83 × range) | approach: first capital fire × 1.8 at speeds × 0.5; whole battle −4 to +34 % | §4.5 | relative speed ÷ projectile speed in the hit model; escorts slower to reach range (queueing); carrier weave cap (half top speed); time limits |
| Accelerations | `ships.ts` `acceleration` | none | time to top speed v / a | §2.2 | the physical dodge (∝ a × flight²); the hard-manoeuvre solution penalty (accelFrac > 0.7) |
| Projectile speeds | `weapons.ts` `projectileSpeed` | none | flight time ∝ 1 / v (1.1–1.6 s to full range for the ship guns today, torpedoes 4.5–8.2 s; 2.5–20 s for the canon round over the pack's envelope, `lore-ranges.md` D1) | §3.6 | dodge ∝ flight time²: at today's flight times destroyers already evade 16–28 % of aimed slugs at S = 4 |
| Starting distances, arrival points and times | `scenarios/index.ts`, custom slider, campaign | none | approach ∝ (separation − range) ÷ closing speed | §3.3, §3.4 | reinforcement queueing (second waves 79–100 % out of range in their first 30 s); beat timing (T13) |
| Formation spacing | `formations.ts` `SLOT_COMPRESSION`, spacing, guard | spacing inside fleets (1.7–2.1 L today) | wings reach range later | §2.3, §4.4 | queueing (frontage ÷ range), blocking and strays |
| Absolute constants of §1.3 | `movement.ts`, `stealth.ts`, `ai.ts`, `battle.ts`, `reaperAi.ts` | — | — | §4.3 | must move with any S change |
| Hit and solution range terms | `damage.ts:111`, `solutions.ts:58` | — | time at long range before kills | §3.5 | balance (T19) |
| Damage, barriers, cadences | catalogue | — | time to kill (the exchange) | §3.3 | preserved by rule (brief §19.2) |
| Time limits | scenario `maxDuration`, custom 420 s, campaign 420 s, `run()` 200,000 steps | — | where judgement replaces the result | §4.7 | outcomes when battles are cut; the reference already needs 362–385 s against 360 |
| Grid cell, query padding | `spatial.ts:25`, the query boxes | — | — | §4.1, §4.8 | exact at any cell size once padded; cost only |
| `SIM_DT` | `battle.ts:57` | — | — | not varied | must not change (determinism, playback, calibration) |

## 6. Renderer and camera

- **Scale.** 1 render unit = 100 m; positions are simulation km × 10 (`rendering/geometry.ts:9–10`, `battleView.ts:177–184`). Models are built in render units; most match their class length within a few per cent, but the Reaper capital model is 15.4 units long (1.54 km against the simulated 2.0 km and its 1 km hit radius), Harbinger 18.5 (1.85 against 2.2 km), the Reaper destroyer 1.28 (128 against 160 m), the Alliance cruiser 5.2 (520 against 700 m) and the Cerberus dreadnought 9.0 (900 against 1,000 m); fighters are drawn at twice their length (`LORE_REFERENCE.md` "Visual liberties"; the Oculus placeholder at its own 12 m). On screen the range-to-hull ratio of a Reaper therefore reads 1.3 × higher than the simulation's.
- **LOD** (`rendering/lod.ts:16–31`): reduced detail beyond 70 model lengths, a far point beyond 700 (`REDUCED_FACTOR`, `POINT_FACTOR`, on the model's `lengthUnits`); craft reduced beyond 3 km and a point beyond 9 km. In distances: Reaper capital 108 / 1,078 km, Harbinger 129 / 1,294 km, dreadnought 62 / 622 km, Alliance cruiser 36 / 364 km, frigate 11.9 / 119 km, Reaper destroyer 9.0 / 90 km. On a 1080p screen (vertical field of view 50°) every hull is 16.5 px long at the reduced switch and 1.65 px at the point switch.
- **Far point cloud** (`battleView.ts:42`, `120`): up to 2,048 points, `PointsMaterial` size 2.2 with size attenuation and an additive glow texture. three.js sizes it as 2.2 × (half the drawing-buffer height) ÷ depth in render units: 0.11 px at a Reaper capital's switch distance, 0.19 px at a dreadnought's, 1.0 px at a frigate's, 13 px at a craft's; below 1 px the GPU's minimum point size (usually 1 px) takes over, so every far hull is drawn as the same one-pixel glow whatever its size.
- **Camera** (`rendering/cameras.ts`): perspective, 50° vertical field of view, near plane max(0.2, min(50, 0.002 × the distance to the look point)) units (`cameras.ts:238`), far plane 600,000 units = 60,000 km (`cameras.ts:52`), logarithmic depth buffer (`battleView.ts:83`). Zoom clamps the focus distance to 6–60,000 units, 0.6–6,000 km (`cameras.ts:106`). The battle opens 320 units (32 km) from the player's fleet centre (`bind`, `battleView.ts:147`; the constructor's 900 is overwritten); command view at least 120 km; chase 2.4 model lengths + 300 m (× 0.35–5 with the zoom); free flight 60 or 250 km/s.
- **Effects** (`rendering/effects.ts:105`, `277–278`, `323–324`): a tracer is a 0.1 × 0.1 × 1 unit box scaled by 1.1 in width for heavy rounds (damage ≥ 600) and 0.45 otherwise, i.e. 11 m and 4.5 m wide, and max(150 m, 0.06 s of flight) × 1.3 (heavy) or × 0.7 long (a dreadnought round's tracer is 940 m long at S = 0.4), so its length scales with S and its width does not; pool of 1,024. Beam cores are cylinders of radius 0.09 units × intensity for Reaper beams (11.7 m for a capital, 6.3 m for a destroyer) and 0.05 × 0.9 (4.5 m) for the Thanix, with a glow 3.2 × wider. On a 1080p screen (1,158 px per radian) these widths fall under one pixel beyond these camera distances: heavy tracer 13 km, light tracer 5 km, Reaper capital beam core 27 km and glow 87 km, destroyer beam core 15 km and glow 47 km, Thanix core 10 km and glow 33 km.
- **Environment** (`rendering/environment.ts:347`): Earth is drawn with a 2,100 km radius (about a third of the real one) whose nearest surface point is 422 km from the battle origin and whose top is 350 km below the battle plane; the starfield (18,000 km) and the sun sprite (15,000 km) follow the camera.
- **Precision:** world positions in float32 render units lose 0.8 m at 10,000 km; three.js composes model-view matrices in float64 on the CPU before upload, so meshes near the camera stay exact at any of these scales.

On-screen length when both fleets are framed (frame width ≈ the 80 nominal km opening separation × S, camera at 0.6 × the width for 16:9; 1080p, broadside view, model lengths), and the LOD state at that distance:

| S | Frame width (km) | Camera distance (km) | Reaper capital | Dreadnought | Frigate | Reaper destroyer | Exchange pair framed tightly (frame = the measured exchange distance): Reaper | Heavy tracer width |
| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |
| 0.4 | 32 | 19 | 92 px, full | 53 px, full | 10 px, reduced | 7.7 px, reduced | 12.3 km frame: 240 px | 0.66 px |
| 1 | 80 | 48 | 37 px, full | 21 px, full | 4.1 px, reduced | 3.1 px, reduced | 29 km: 100 px | 0.26 px |
| 4 | 320 | 193 | 9.2 px, reduced | 5.3 px, reduced | 1.0 px, point | 0.8 px, point | 105 km: 28 px | 0.07 px |
| 10 | 800 | 483 | 3.7 px, reduced | 2.1 px, reduced | 0.4 px, point | 0.3 px, point | 255 km: 12 px | 0.03 px |
| 40 | 3,200 | 1,930 | 0.9 px, point | 0.5 px, point | 0.1 px, point | 0.1 px, point | ≈ 950 km: 3 px | 0.007 px |
| 134 (`lore-ranges.md` D5) | 10,700 | 6,466 (beyond the 6,000 km zoom limit) | 0.3 px, point | 0.2 px, point | 0.03 px, point | 0.02 px, point | ≈ 3,200 km: 0.9 px | 0.002 px |

## 7. Constraints for the design step

Engine facts any plan has to meet; the choices are the plan's.

1. **Changing S.** Re-base every absolute constant of §1.3 in nominal km × S, or as a fraction of a range or of a hull length, or the queueing returns (§4.3); pad the grid queries by the largest per-step displacement (exact at any cell size, §4.1) and scale `GRID_CELL_KM` with S for cost (the ±512-cell domain covers ±2,048 km at 4 km cells, ±20,480 km at 40 km); decide whether the compression floor stays and whether formation spacing should grow with S in hull lengths (today it does above 0.55); expect the intercept terms to move (at S ≥ 4, 16–33 % of rolled slug hits on destroyers fly past and blocking and strays vanish) and give the calibration re-pin (T19) room for them; the padding alone re-pins reference canon 8.
2. **Stretching time.** The approach is set by the opening separation (anchors 1.6–1.9 Reaper ranges apart in every scenario) and the closing speed (0.50–0.54 km/s, a range crossed in 33–36 s); the exchange is set by damage, barriers and cadences (preserved by rule) and the range terms of the hit and solution models. Speed alone moves first fire and first loss by × 1.6–1.9 at × 0.5 and pushes the fight out to 0.77–0.83 × range, but the whole battle lengthens by tens of per cent at most. Every time limit has to grow with any stretch: the reference engagement already needs up to 385 s against its 360 s limit.
3. **Exchange distance.** Doctrine can move the exchange within a weapon's range (Reapers at 0.875 × range: 7.0–7.6 L at S = 0.4); only S or re-based ranges move the range itself in hull lengths.
4. **Queueing.** The first Reaper wave does not queue (≤ 10 % out 6–9 s after contact); late waves do (79–100 % out for their first 30 s); the organic lines queue where their frontage exceeds what a compact Reaper group lets them reach (line abreast 2.5 × range at S = 0.4, 1.8 × above 0.55) and wherever an absolute leash binds. The Reapers' never-idle advance is S-invariant and keeps their first waves in range at every S measured (§4.2); the escorts' screen leash is absolute and has to be re-based with S (§4.3). Carriers are out of their own range by rule.
5. **Hit-scan beams** stay hit-scan at any S; whether streams get a speed at thousands of km is a modelling decision outside S (`lore-ranges.md` §4 item 7).
6. **Render.** At S ≥ 4 a two-fleet frame turns frigates and destroyers into far points and capitals into a few pixels; far points are sub-pixel by formula at the capital switch distances, so every far hull renders alike; tracer and beam widths are hull-scale and already sub-pixel at today's two-fleet framing (a heavy tracer 0.66 px at S = 0.4; Reaper beam cores beyond 27 km of camera distance), while tracer lengths grow with S; the zoom limit is reached at S ≈ 124. The Reaper capital, Harbinger, Reaper destroyer and Alliance cruiser models are drawn 23 %, 16 %, 20 % and 26 % shorter than their simulated hulls (the Cerberus dreadnought 10 %), which LOD and the chase camera inherit.

## 8. Definitions and reproduction

- **Contact:** the first `weapon_fired` from an anti-ship mount (not point defence) of a non-craft hull at a non-craft hull.
- **Capital distance:** every 1 s (20 steps), for each live capital (dreadnought, super-dreadnought, Reaper capital including Harbinger; carriers and platforms excluded), the distance between centres to the nearest live enemy capital (carriers and platforms included). "In L" divides by the longer hull of the pair; "÷ range" by the measured capital's own longest non-point-defence range.
- **Out of range:** a hull with no live enemy non-craft hull within its longest non-point-defence range (centre to centre); a silent stealth hull counts only inside its detection range. "Line" excludes carriers, withdrawing hulls and stealth hunters; first waves are measured from contact, later fleets from their arrival.
- **Hit rates:** each `weapon_fired` of a hull's mass accelerator, Thanix or Reaper beam at a non-craft hull; band = distance from the mount to the target's centre at fire ÷ the weapon's simulated range. Classes: dreadnought spinal = an anti-capital mass accelerator with an arc ≤ 20° on a dreadnought or super-dreadnought (the Titan gun under Apex); cruiser spinal = the same on any other hull; broadside = the other mass accelerators of non-frigates; frigate gun = the mass accelerators of frigates. Rolled outcome: the round's `missDistance` is undefined for a rolled hit; beams read `beamHit` after the step. Physical outcome: a round that left the projectile list is matched to the `projectile_impact` of the same shooter whose point lies on that step's segment; a round with no impact is classified at its closest approach to the intended target, judged on the step whose segment brackets it ("flown past" if the target was alive then, "target died" otherwise).
- **Closing speed:** the relative velocity of a capital and its nearest enemy capital projected on the line between them, positive when closing. Centroid closing: the rate at which the distance between the two sides' hull centroids falls before contact.
- **Reproduce:** step `new BattleSimulation(buildScenario(...))` with the calibration harness's world states (`referenceSim` in `tests/support/calibration.ts`: `fleet_scaling: 'fixed'` for the reference, `forces: 'default'` for the Final Battle), listen to `sim.onEvent`, wrap `push` on `sim.projectiles` after every step (the array is reassigned in `updateProjectiles`) to pair each round with the `weapon_fired` emitted just before it, and sample positions every 20 steps. The lever copies change one line each in `constants.ts`, `formations.ts`, `movement.ts`, `battle.ts` or `spatial.ts`; the padded grid adds the largest `maxSpeed × SIM_DT` among the indexed hulls to each query box in `queryRadius`, `anyWithin` and `querySegment` (not to the distance test); the brute-force reference expands every query box to the occupied extent.
