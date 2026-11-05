# Pacing plan: combat scale, pacing and anti-queueing

Stage S design (brief §19.2, binding). 5 November 2026. Inputs: `docs/apex/pacing/lore-ranges.md` (lore research), `docs/apex/pacing/engine-audit.md` (engine audit at T12), and a prototype of this plan measured on scratch copies of `src/` at the integration head after CORE T13 (`58b6a4b`, merged here as `0cc4fc7`). Nothing in `src/` changed; the prototype and its probe were scratch files outside the repository. CORE applies this plan as a **pacing pass before calibration pass 2 (T19)**, after T13–T18 and alongside the brief §21 behaviour rules (`INTEGRATION_NOTES.md`, 4 and 5 Nov); stages A and B carry the render and camera parts, C the custom distance slider, D the documentation and codex wording.

**Labels.** `CANON_CONFIRMED` only where `LORE_REFERENCE.md` §Canon anchors records the number with its source; `CANON_INFERRED` for directions and derived values (`lore-ranges.md` §1); `SIMULATION_ESTIMATE` for every scale constant, range, speed, acceleration, time limit and rule chosen here; `AU_MODIFIED` for alternate-universe objects; `OWNER` for brief requirements. No codex text is quoted: the repository records none for ranges or speeds (`lore-ranges.md` §2.2, §6).

**Glossary.** S = `BATTLESPACE_SCALE` (nominal km → simulation km); k = the new `MANOEUVRE_TIME_SCALE`; L = the longer hull of a pair (in these battles nearly always the 2 km Reaper capital); "range" = a hull's longest non-point-defence weapon range; "0.12" = the engine today (S = 0.4, k = 1); "the eleven runs" = the reference rows of `scripts/calibration.ts` (`engine-audit.md` header); "contact" = the first anti-ship shot of a hull at a hull.

## 0. Decision in brief

1. **Both levers, tied together by the one canon number.** Distances and ranges scale up by 100 (S = 0.4 → **40**); hull speeds by 33 (S / k with **k = 3**) and hull accelerations by 11 (S / k²), so every manoeuvre takes three times as long relative to weapon cadences and kills; **mass-accelerator rounds fly at the codex velocity** — the Alliance dreadnought round at **4,025 km/s** (`CANON_CONFIRMED`, ME1 codex *Dreadnought*), every other round at the catalogue's ratio to it. The three choices are not independent: with the round at its canon speed, the only scale at which a target's sideways drift during a round's flight stays what the calibration was tuned on is S³ = 0.4 × (4,025/30)² × k², i.e. **S ≈ 19.3 k^⅔** (§1.3). k = 3 gives S = 40.2; the plan uses the round pair **S = 40, k = 3** (drift 0.988 × today's).
2. **What the player gets** (measured on the prototype, §1.5): capital guns reaching **1,680–1,760 km** (Titan 1,920 km, AU), capital exchanges whose median capital-to-capital distance after contact is **1,430–1,920 km = 700–940 Reaper lengths** (today 12–18 km, 5.9–9.1 L), first contact at **39–47 s** (today 11–14 s), first capital gun at a capital at **70–113 s** (21–33 s), first capital loss **49–84 s after contact** (23–41 s), battles **0.95–3.6 × as long** (Battle of Earth 272–312 s against 241 s; reference canon 343–454 s against 324–360 s; Apex reference 178–194 s against 118–164 s; canon Final Battle 678 s against 186 s). Every canon and Apex reference pin of `tests/battle.test.ts` still holds on the prototype.
3. **What does not change:** every catalogue number (damage, hull, armour, barriers, regeneration, cadences, heat, accuracy, magazines, turn rates, nominal ranges and speeds, doctrine fractions); the hit and firing-solution models (S-invariant by construction; one term is now evaluated in nominal units so it stays identical); `SIM_DT`; determinism.
4. **Engine fixes the new speeds expose** (verified bugs present at 0.12, small there, decisive at 33 × the speed): exact grid queries (F1), the projectile sweep in relative motion (F2), one time base for a round and its target (F3), recall and rearm by station keeping (F4), swept proximity tests (F5) (§2.11).
5. **Anti-queueing:** formations at exactly S (the 0.55 compression floor goes), every absolute leash and offset re-based in nominal km, Reapers never idle once their fleet is engaged, reinforcements arrive within 1.1 × their engagement range of the enemy and at k × their scenario times (§3). Measured: no Reaper hull idle out of range for more than 2 s after its fleet's contact in any of the eleven runs.
6. **Rendering never compresses the simulation:** markers and minimum-pixel impostors, telephoto gunnery views, screen-space tracer and beam widths, a floating origin, Earth at true scale (§5).
7. **Owners in order** (§8): CORE pacing pass P1–P6 in chunk 6 (fixes, constants, data, rules, tests, measurement), then the §21 rules, then T19; A, B, C, D in the stage runs.

## 1. The scale model

### 1.1 The two complaints, measured

| | 0.12 (canon five; `engine-audit.md` §0, §3) | What the owner asks (brief §19.2, `OWNER`) |
| --- | --- | --- |
| Too close | capital to nearest enemy capital after contact 11.7–13.3 km = 5.9–6.7 L = 0.67–0.77 × range; ranges 8.4–8.8 L; the decisive minute at 4.6–5.3 L | "engagements across thousands of kilometres where appropriate" |
| Too fast | closing 0.50–0.54 km/s, a 17.6 km Reaper reach crossed in 33–36 s; first contact 11 s, first capital gun 26–33 s, first capital loss 37–52 s; battles 241–360 s | "fleets manoeuvre, approach, exchange long-range fire and reposition over believable periods" |

Lore (`lore-ranges.md` §0): one canon kinematic number — the dreadnought round, 20 kg at 4,025 km/s every 2 s (`CANON_CONFIRMED`); capital exchanges at thousands of km are a `CANON_INFERRED` direction with no canon figure; the short layers (torpedoes, GARDIAN, small craft, stealth strikes) are short by mechanism, not by number; speeds, accelerations and battle lengths are `UNKNOWN`.

### 1.2 What decides behaviour and balance

Every rule of the engine compares like with like (`engine-audit.md` §1.2), so behaviour and balance depend only on a few ratios. Writing the conversion of nominal catalogue values as S (distances), V (hull speeds), A (hull accelerations) and P (round speeds), all 0.4 today:

| # | Ratio | Scales as | Decides | Requirement |
| --- | --- | --- | --- | --- |
| G1 | range ÷ hull length | S | "too close"; the look | × ~100 (thousands of km) |
| G2 | time to cross a range ÷ weapon cadence | S / V | "too fast": shots exchanged per manoeuvre, length of approach and long-range phase | × 2–4 |
| G3 | round flight time ÷ cadence | S / P | rounds in flight, visible travel | free (lore: the canon velocity) |
| G4 | a target's sideways drift during a round's flight ÷ its hit radius | A (S/P)² | physical misses of rolled hits ("flown past"; audit finding 8) | = 1 (balance) |
| G5 | braking distance ÷ range (turning circles, run lengths, station keeping) | V² / (A S) | the shape of every manoeuvre | = 1 (behaviour) |
| G6 | relative speed ÷ round speed in the hit model | V / P | `relSpeedPenalty` (`damage.ts`) | = 1 (evaluated in nominal units, §4.3) |
| G7 | formation spacing ÷ point-defence reach and ÷ range | slot scale / S | mutual point defence, torpedo and craft balance, frontage-driven queueing | = 1 (formations scale with S) |
| G8 | hull cross-section ÷ formation spacing | 1 / S | rounds blocked by escorts, stray hits | falls to ≈ 0 — accepted, measured (§2.12, §4.4) |

### 1.3 The options, and the one chosen

| Option | G1 | G2 | G4 | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| (a) Raise S only (range-to-hull ratio, time unchanged) | ∝ S | 1 | ∝ S | audit §4.2: at S = 4 and 10, 16–33 % of rolled hits on destroyers fly past; S = 40 would make every manoeuvring hull dodge; accelerations × 100 (a fighter at 5,700 g) | rejected: breaks the hit physics and leaves "too fast" untouched |
| (b) Stretch time only (lower speeds, ranges unchanged) | 1 | ∝ 1/V | ∝ A | audit §4.5: half speed → approach × 1.6–1.9, exchange still 6.7–7.2 L | rejected: "too close" untouched |
| (c) Re-base ranges layer by layer (capital band in thousands of km, torpedoes, GARDIAN and craft near the pack's ≤ 10–100 km) | per layer | — | — | lore §4 item 4 | rejected for this pass: craft and torpedoes would have to cross a thousand-km capital layer at close-combat speeds (a two-speed craft model), point-defence and torpedo geometry change, every calibration pin moves; kept as a future option (§9) |
| (d) Uniform S with similarity time scaling and rounds scaled like ranges (P = S, k = √(S/0.4)) | ∝ S | ∝ k | 1 | arithmetic | rejected: thousands of km need k ≥ 10 (battles × 5–10, test suite × 5) |
| **(e) Uniform S, kinematic dilation k, rounds at the codex velocity** | **∝ S** | **∝ k** | **1 when S³ = 0.4 P² k²** | prototype (§1.5) | **chosen** |

Option (e): V = S / k and A = S / k² keep every trajectory's shape (G5 = 1: turning circles, braking distances, frigate runs and fighter passes are the 0.12 shapes, drawn larger and flown k times slower); P = 4,025 / 30 per nominal km/s puts the Alliance round at its codex speed (G3 becomes canon); G4 = 1 then requires (S/k²)(S/P)² = 0.4, so **S = (0.4 P² k²)^⅓ = 19.3 k^⅔** (`SIMULATION_ESTIMATE`; the inputs P and the 0.4 calibration point are `CANON_CONFIRMED` and engine fact).

| k (manoeuvre stretch) | S | Dreadnought spinal range | Round flight to full range | What it means |
| ---: | ---: | ---: | ---: | --- |
| 1 | 19.3 | 811 km | 0.20 s | no slow-down; rejected |
| 2 | 30.6 | 1,287 km | 0.32 s | |
| **3** | **40.2 (plan: 40)** | **1,680 km** | **0.42 s** | **chosen** |
| 4 | 48.7 | 2,044 km | 0.51 s | measured: more balance drift (§1.5) |
| 6 | 63.8 | 2,680 km | 0.67 s | |
| 18.3 | 134.2 | 5,635 km | 1.40 s (today's flight time) | the catalogue's 1.4 s flight at the canon speed; battles × 10+ |

### 1.4 Why k = 3 and S = 40

- **Lore.** The capital band lands at 1,440–1,760 km (Ascension 1,920 km; AU Titan 1,920, Nova 2,080, legacy Nova and heavy platform guns 2,240 km): "thousands of kilometres" in its lower register, an order of magnitude below the pack's `SIMULATION_ESTIMATE` envelopes (dreadnought 10,000–80,000 km), which no canon text supports either (`lore-ranges.md` R1, §5). The round flies at its codex 4,025 km/s; the short layers stay layered (point defence 240–260 km, torpedoes 720 km, fighter guns 160 km) — longer than the pack's ≤ 10 km `SIMULATION_ESTIMATE`, which is not canon; canon anchors them only by mechanism (slow torpedoes, heat-limited point defence), and every one of those mechanisms is kept (§2.3).
- **Balance.** The prototype keeps every pinned reference outcome (§1.5); k = 4 / S = 48 (2,016–2,112 km ranges) drifted further: Apex reference seed 9 at 87 % survival with no dreadnought lost (pins: < 85 %, ≥ 1), the Battle of Earth's Reaper losses down to 4–5 hulls before the arrival-time rule. The cause is structural, not a tuning accident: stretching manoeuvre time gives the side with the longer reach more free shots (canon Reapers 44 nominal km against organic guns ≤ 42, Apex Titans 48 against 44), so k is kept as small as the brief allows.
- **Pace.** k = 3 triples the approach and the long-range phase; together with the long-range hit penalties the decisive exchange now opens 1–2 minutes into a battle and lasts several minutes (§1.5). Brief §19.1's fast-forward and the 2×–8× speeds make longer battles practical (§6).
- **Cost.** Battles run 0.95–3.6 × the steps (§6); k = 4 would add another third.
- **The dial stays.** S and k are two constants with the identity of §1.3 checked by a test; a later decision to reach further (S = 48, 64, …) changes them together and re-runs T19.

### 1.5 Measured on the prototype

The prototype implements §2–§3 on a scratch copy of the T13 head; the probe sampled every hull each simulated second (definitions as `engine-audit.md` §8, plus "idle out of range" = no enemy within the hull's main range and not closing on the nearest enemy at ≥ 0.25 × top speed, counted while the enemy fields ≥ 3 hulls). Single battles are chaotic: read ranges across seeds.

| Run | Winner, end (s) 0.12 → plan | A survival | Lost A / B (capitals) 0.12 → plan | Contact (s) | First capital gun at a capital (s) | First capital loss (s) | Capital to nearest enemy capital after contact, p50: 0.12 → plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Battle of Earth canon 42 | B 241 → B 312 | 5 → 5 % | 37/10 (6/1) → 37/8 (6/1) | 11.0 → 40.6 | 32.7 → 104.1 | 51.7 → 115.6 | 13.0 km, 6.5 L, 0.74 → 1,695 km, 847 L, 0.98 |
| Battle of Earth canon 7 | B 242 → B 272 | 5 → 4.7 % | 37/8 (6/1) → 37/8 (6/1) | 10.9 → 40.6 | 32.9 → 112.8 | 50.9 → 124.8 | 13.4 km, 6.7 L, 0.77 → 1,776 km, 888 L, 1.04 |
| Reference canon 7 | B 324 → B 392 | 4.9 → 4.6 % | 45/9 (8/1) → 45/10 (8/2) | 11.6 → 40.4 | 26.1 → 94.3 | 40.7 → 105.9 | 12.2 km, 6.1 L, 0.72 → 1,584 km, 792 L, 0.93 |
| Reference canon 8 | B 360 (limit) → B 454 | 5 → 4.6 % | 44/9 (8/1) → 45/10 (8/2) | 11.7 → 40.4 | 26.2 → 95.0 | 40.4 → 108.9 | 12.0 km, 6.0 L, 0.70 → 1,605 km, 802 L, 0.95 |
| Reference canon 9 | B 360 (limit) → B 343 | 5.7 → 4.9 % | 43/10 (8/2) → 45/8 (8/1) | 11.5 → 40.3 | 26.6 → 93.8 | 36.9 → 108.7 | 11.8 km, 5.9 L, 0.67 → 1,671 km, 835 L, 0.98 |
| Reference Apex 7 | A 118 → A 183 | 74.9 → 78.6 % | 9/12 (3/4) → 15/12 (2/4) | 11.0 → 38.9 | 21.3 → 71.2 | 34.3 → 91.5 | 11.8 km, 5.9 L, 0.63 → 1,753 km, 876 L, 0.93 |
| Reference Apex 8 | A 164 → A 178 | 58.1 → 79.0 % | 13/12 (5/4) → 14/12 (2/4) | 11.1 → 38.7 | 21.4 → 70.7 | 34.2 → 87.7 | 11.8 km, 5.9 L, 0.62 → 1,801 km, 901 L, 0.96 |
| Reference Apex 9 | A 128 → A 194 | 63.1 → 72.8 % | 10/12 (5/4) → 14/12 (3/4) | 11.2 → 38.7 | 21.3 → 70.1 | 36.4 → 93.5 | 11.8 km, 5.9 L, 0.66 → 1,745 km, 872 L, 0.92 |
| Apex Sol Defence 1 | A 157 → A 339 | 86.2 → 66.0 % | 6/18 (2/6) → 26/15 (3/6) | 12.9 → 44.3 | 24.2 → 81.6 | 35.6 → 109.4 | 13.6 km, 6.8 L, 0.73 → 1,774 km, 887 L, 0.94 |
| Final Battle canon 1 | A 186 → **B 678** | 72.5 → 4.9 % | 22/32 (6/10) → 108/28 (18/8) | 13.7 → 47.3 | 31.0 → 92.2 | 45.8 → 103.1 | 12.4 km, 6.2 L, 0.72 → 1,426 km, 699 L, 0.86 |
| Final Battle Apex 1 | A 142 → A 325 | 92.2 → 92.0 % | 15/32 (3/10) → 34/27 (2/10) | 13.2 → 45.3 | 24.8 → 76.5 | 37.7 → 108.5 | 18.2 km, 9.1 L, 1.06 → 1,919 km, 943 L, 1.08 |

(The capitals columns count dreadnought-class and Reaper capital hulls; carriers are excluded.) Pins of `tests/battle.test.ts` on the prototype: canon 7/8/9 → B, Reaper capitals lost 2 / 2 / 1 (pin 1–2), survival 4.6–4.9 % (< 30 %), the Reapers not destroyed; Apex 7/8/9 → A, every Reaper destroyed, 15 / 14 / 14 lost (7–19), 2 / 2 / 3 dreadnoughts (≥ 1), 72.8–79.0 % (< 85 %). The canon Final Battle, the run the audit found most sensitive (it changed winner between T11 and T12), went to the Reapers once the reserve arrives in reach (§3.4); it is not pinned, a Reaper victory in a conventional Final Battle is the canon-consistent outcome (the Crucible, not the fleets, decided the war; `lore-ranges.md` T6, T7), and T19 records it (§2.13).

Over time (Battle of Earth canon 42, capital distance p50 ÷ range and in L per 90 s window, i.e. three 0.12 windows): 1.14 / 974 L → 0.79 / 677 L → 0.69 / 605 L (0.12 per 30 s: 1.29 → 0.74 → 0.59 → 0.62 → 0.72). The fight still closes from the edge of the beams to about 0.7 × range, three times more slowly, and spends its first decisive minutes at 0.8–1.0 × range, where the hit and solution models penalise fire (§4).

Measured but not adopted (same probe, same head):

| Variant | What changed against the plan | Result |
| --- | --- | --- |
| S = 48, k = 4 | the next point of §1.3 | Apex 9: 87 % survival, no dreadnought lost; Battle of Earth Reaper losses 3–8; first capital gun 127–144 s |
| Plan without the arrival-time rule (reinforcements at their 0.12 times) | §3.4 | Battle of Earth: the second wave joins before the main exchange; Reaper losses 3–6, end 216–229 s |
| Plan without the arrival cap (reinforcements at their 0.12 positions; measured at S = 48, k = 4) | §3.4 | the Battle of Earth's Reaper line 29 % out of range on average after contact (with the cap 7 %): the second wave queues 2.5 ranges out for minutes, the owner's complaint |
| Plan without F2 and F3 | §2.11 | 17–31 % of rolled slug hits on destroyers struck nothing (without both), 56 % of rolled fighter-gun hits on Oculi in the screen fixture (F2 alone); the Oculus screen became a massacre of the Tridents (24 of 24 lost, 2–9 Oculi) |
| Escorts closing at full speed instead of half (measured at S = 48, k = 4) | §3.2 | more escorts lost piecemeal (Apex reference 8: 21–25 lost); not adopted |

## 2. Exact numbers

### 2.1 Scale constants (`src/simulation/constants.ts`; all `SIMULATION_ESTIMATE` except where noted)

| Constant | 0.12 | Plan | Note |
| --- | ---: | ---: | --- |
| `BATTLESPACE_SCALE` (S) | 0.4 | **40** | nominal km → simulation km: ranges, positions, formation slots, sensor ranges, stealth detection, every re-based offset (§2.6) |
| `MANOEUVRE_TIME_SCALE` (k), new | — (1) | **3** | manoeuvre durations × k, manoeuvre rates ÷ k (§2.7) |
| `HULL_SPEED_SCALE`, new | (0.4) | **S / k = 13.333** | `maxSpeed` of every hull and craft |
| `HULL_ACCEL_SCALE`, new | (0.4) | **S / k² = 4.4444** | `acceleration` of every hull and craft |
| `ROUND_SPEED_SCALE`, new | (0.4) | **4,025 / 30 = 134.1667** | `projectileSpeed` of every `mass_accelerator` (`CANON_CONFIRMED` anchor: the Alliance dreadnought round at 4,025 km/s, `LORE_REFERENCE.md` §Canon anchors ← ME1 codex *Dreadnought*) |
| `MISSILE_SPEED_SCALE`, new | (0.4) | **S = 40** | `projectileSpeed` of `disruptor_torpedo` and `missile` (flight times and point-defence crossing times as at 0.12) |
| Beams (`thanix`, `reaper_beam`, `gardian`) | hit-scan | hit-scan | Infinity × any scale (§4.5) |
| Identity checked by a test | — | `HULL_ACCEL_SCALE × (S / ROUND_SPEED_SCALE)² = 0.395` (0.12: 0.4) | G4, §1.3 |

Conversion sites: `battle.ts` `createShip` (`maxSpeed × HULL_SPEED_SCALE`, `acceleration × HULL_ACCEL_SCALE`, `sensorRange × S`, weapon `range × S`, `projectileSpeed × ROUND_SPEED_SCALE` for mass accelerators and `× MISSILE_SPEED_SCALE` for torpedoes and missiles, stealth `detectRange × S`, stealth `capacity` and `ventTime` × k (§2.7)); `deployFleet` positions × S (unchanged rule). Turn rates (degrees per second) are not converted: they are gun-laying rates, a combat quantity (§2.8). The comment block of `constants.ts` and the `weapons.ts` header are rewritten (they say the battlespace is compressed so that a 40 km range shares a frame with a 2 km hull).

### 2.2 Catalogue fields

**No nominal catalogue value changes** (`src/data/ships.ts`, `weapons.ts`, `factions.ts`): ranges, projectile speeds, top speeds, accelerations, turn rates and sensor ranges keep their nominal numbers and tags; the scale constants convert them. Two provenance notes change wording only: `alliance_dn_main` ("Battlespace speed/range compressed for play" → "the simulation flies the round at its codex 4,025 km/s; range a simulation estimate") and the IES block notes (§2.7). The simulated values that result (the table D copies into the database screen):

| Weapon (nominal range / projectile km/s) | Simulated range (km) | Simulated round speed (km/s) | Flight to full range (s), 0.12 → plan | Label |
| --- | ---: | ---: | --- | --- |
| Alliance / turian dreadnought spinal (42 / 30) | 1,680 | 4,025 | 1.40 → 0.42 | range `SIMULATION_ESTIMATE`; speed `CANON_CONFIRMED` |
| Asari, salarian, geth dreadnought (44 / 32–33) | 1,760 | 4,293–4,428 | 1.38–1.33 → 0.41–0.40 | `SIMULATION_ESTIMATE` |
| Destiny Ascension main (48 / 36) | 1,920 | 4,830 | 1.33 → 0.40 | `SIMULATION_ESTIMATE` |
| Reaper capital beam (44) | 1,760 | hit-scan | 0 | `SIMULATION_ESTIMATE` |
| Cruiser spinal (36–40 / 26–30) | 1,440–1,600 | 3,488–4,025 | 1.38–1.33 → 0.41–0.40 | `SIMULATION_ESTIMATE` |
| Reaper destroyer beam (30) | 1,200 | hit-scan | 0 | `SIMULATION_ESTIMATE` |
| Broadside battery (28 / 24) | 1,120 | 3,220 | 1.17 → 0.35 | `SIMULATION_ESTIMATE` |
| Thanix (26); heavy Thanix (34, AU) | 1,040; 1,360 | hit-scan | 0 | `SIMULATION_ESTIMATE`; `AU_MODIFIED` |
| Frigate guns (24–26 / 22–24) | 960–1,040 | 2,952–3,220 | 1.09 → 0.33 | `SIMULATION_ESTIMATE` |
| Disruptor torpedo (18 / 2.2) | 720 | 88 | 8.18 → 8.18 | `SIMULATION_ESTIMATE` (slow by design: `CANON_CONFIRMED` qualitatively) |
| Javelin rack (16 / 2.4, AU) | 640 | 96 | 6.67 → 6.67 | `AU_MODIFIED` |
| Fighter torpedo (9 / 2.0) | 360 | 80 | 4.50 → 4.50 | `SIMULATION_ESTIMATE` |
| Reaper point defence (6.5); GARDIAN (6) | 260; 240 | hit-scan | 0 | `SIMULATION_ESTIMATE` (GARDIAN heat-limited: `CANON_CONFIRMED`) |
| Fighter gun (4 / 14) | 160 | 1,878 | 0.29 → 0.085 | `SIMULATION_ESTIMATE` |
| Oculus beam (3.5) | 140 | hit-scan | 0 | `SIMULATION_ESTIMATE` |
| Titan / Nova / legacy Nova (48 / 44, 52 / 48, 56 / 400) | 1,920 / 2,080 / 2,240 | 5,903 / 6,440 / 53,667 | 1.09 / 1.08 / 0.14 → 0.33 / 0.32 / 0.04 | `AU_MODIFIED` (the pack's own AU velocities are 4,000 and 6,000 km/s; `lore-ranges.md` V14) |
| Platform gun / heavy (44 / 30, 56 / 36) | 1,760 / 2,240 | 4,025 / 4,830 | 1.47 / 1.56 → 0.44 / 0.46 | `SIMULATION_ESTIMATE` / `AU_MODIFIED` |

Mass-accelerator rounds still fly on to 2.2 × range (`PROJECTILE_RANGE_FACTOR`); their lifetime falls from 3.6 s to 1.4 s (dreadnought), so fewer rounds are alive at once.

| Hull (nominal top speed / acceleration / turn / sensor) | Simulated top speed (km/s) | Acceleration (km/s², g) | Time to top speed (s), 0.12 → plan | Braking distance (km; ÷ own range, as 0.12) | Sensor (km) |
| --- | ---: | --- | --- | --- | ---: |
| Reaper capital (0.8 / 0.14 / 6 °/s / 160) | 10.7 | 0.62, 63 g | 5.7 → 17.1 | 91, 0.05 | 6,400 |
| Harbinger (0.75 / 0.13 / 5 / 200) | 10.0 | 0.58, 59 g | 5.8 → 17.3 | 87 | 8,000 |
| Reaper destroyer (1.6 / 0.4 / 16 / 120) | 21.3 | 1.78, 181 g | 4.0 → 12.0 | 128 | 4,800 |
| Oculus (3.6 / 1.8 / 110 / 30) | 48.0 | 8.0, 816 g | 2.0 → 6.0 | 144 | 1,200 |
| Alliance dreadnought, K-class (0.65 / 0.09 / 4.5 / 90) | 8.7 | 0.40, 41 g | 7.2 → 21.7 | 94, 0.06 | 3,600 |
| Alliance carrier (0.6 / 0.08 / 4 / 100) | 8.0 | 0.36, 36 g | 7.5 → 22.5 | 90 | 4,000 |
| Super-dreadnought, AU (0.52 / 0.07) | 6.9 | 0.31 | 7.4 → 22.3 | 77 | 4,800 |
| Alliance cruiser (0.9 / 0.16 / 9 / 70) | 12.0 | 0.71, 72 g | 5.6 → 16.9 | 101 | 2,800 |
| Alliance frigate (1.4 / 0.32 / 22 / 60) | 18.7 | 1.42, 145 g | 4.4 → 13.1 | 122 | 2,400 |
| Normandy SR-2; SR-2-pattern (1.6 / 0.4; 1.55 / 0.38) | 21.3; 20.7 | 1.78; 1.69 | 4.0 → 12.0 | 128 | 3,200; 3,120 |
| Trident fighter (3.4 / 1.4 / 90 / 30) | 45.3 | 6.2, 634 g | 2.4 → 7.3 | 165 | 1,200 |
| Destiny Ascension (0.55 / 0.08) | 7.3 | 0.36 | 6.9 → 20.6 | 76 | 4,800 |
| Quarian liveship (0.4 / 0.05) | 5.3 | 0.22 | 8.0 → 24.0 | 64 | 2,400 |
| Fixed platforms (0) | 0 | 0 | — | — | 5,600–6,000 |

All `SIMULATION_ESTIMATE` (canon gives no speed, acceleration, turn rate or sensor range; `lore-ranges.md` M1, R22). The accelerations look large in g; they are what keeps a target's drift during a round's flight exactly as calibrated (G4): a destroyer at full lateral thrust drifts 155 m during a 0.42 s dreadnought round (0.12: 157 m in 1.4 s), a Reaper capital 54 m (55 m). Lore constrains only that acceleration is finite and costly (`lore-ranges.md` M2), which holds.

### 2.3 What the layers become

| Layer | 0.12 (simulated) | Plan | Ratio to the capital band |
| --- | --- | --- | --- |
| Capital guns and beams | 14.4–19.2 km | 1,440–1,920 km | 1 |
| Escort guns, destroyer beam, Thanix | 9.6–12 km | 960–1,200 km | 0.55–0.7 |
| Torpedoes, Javelin | 3.6–7.2 km | 360–720 km | 0.2–0.4 |
| Point defence (GARDIAN, Reaper) | 2.4–2.6 km | 240–260 km | 0.14 |
| Craft guns and Oculus beams | 1.4–1.6 km | 140–160 km | 0.09 |
| IES detection; small-craft detection | 1.0; 0.6 km | 100; 60 km | 0.06; 0.04 |
| Hull lengths and hit spheres | 12 m – 2.2 km | unchanged | — |

The spread of the layers (7 : 1 capital band to point defence) is the 0.12 spread (`lore-ranges.md` D4); every mechanism that makes the short layers short is unchanged: torpedoes are slow (88 km/s against 4,025 km/s rounds) and spend the same 2.7 s crossing a point-defence envelope; GARDIAN stays heat-limited; craft still close to strike.

### 2.4 Formations (`src/simulation/formations.ts`)

| Constant | 0.12 | Plan | Label |
| --- | --- | --- | --- |
| `SLOT_COMPRESSION` | `max(S, 0.55)` = 0.55 | **`S` = 40** (the floor goes; audit §1.4 measured it as an artefact: F04, winners unchanged) | `SIMULATION_ESTIMATE` |
| `SLOT_SPACING_FACTOR` (guard, × longer hull) | 1.7 | 1.7 (hull scale; never binds at S = 40) | `SIMULATION_ESTIMATE` |
| Nominal layouts (capital spacing 3.2, cruisers 2.2, frigates 1.6 nominal km, shell radii 9–12, …) | — | unchanged | `SIMULATION_ESTIMATE` |

Resulting extents (audit §2.3 at S ≥ 0.55, now exact): line abreast 1.83 × 0.21 fleet ranges (reference task force 3,070 × 350 km), defensive screen 0.67 × 0.40 (1,130 × 670 km), Reaper strike wedge 0.58 × 0.15 (1,020 × 260 km); capital neighbours 128 km apart (144 dreadnought lengths; Reaper capitals ≈ 100 km in the wedge). Point-defence reach over neighbour spacing: GARDIAN 240 km over 128 km = 1.9 (0.12: 2.4 over 1.76 = 1.4), so a fighter still meets the guns of its target and one or two neighbours. Depth: line abreast 0.21 range, so a formation's rear is in range within depth ÷ closing speed ≈ 20 s of its front (§3).

### 2.5 Doctrine, engagement and standoff bands; sensors

Unchanged, because they are fractions of ranges (`SIMULATION_ESTIMATE`): `preferredRangeFactor` and `aggression` per faction (Reaper anchor 0.4375 × fleet range, Alliance/Cerberus spinal line 0.875 inside the 0.8–0.95 band, `OWNER`), heading lock 1.1 × range, unlock beyond 1.4 × range for 8 × k = 24 s, `advance` 0.55 × standoff, disengage 1.5 × standoff, carrier keep-out 0.8 × the nearest enemy's main range, recovery station 0.6 × standoff, station threat 0.5 × standoff, Reaper advance to 0.8 × own range at 0.6 × top speed, face-if-bearing 1.4 × range, platform weight within 1.3 × range, `fleetEngagementRange` floor `20 × S` = 800 km. Sensor ranges × S (table §2.2); target candidates within 1.5 × sensor range as today.

### 2.6 Absolute distances re-based (nominal km × S)

Every distance written in compressed km at 0.12 becomes nominal km × S (value at S = 0.4 ÷ 0.4). Hull-scale offsets (hit spheres, the spacing guard, hardpoint offsets, the interpose distance, the craft pass offsets beside a hull, launch offsets, the recovery and rearm radii) stay in km; distances that already read `k × S` stay.

| File, constant | 0.12 (km) | Nominal | Plan (km) |
| --- | ---: | ---: | ---: |
| `movement.ts` `SLOT_LEASH_KM` | 2 | 5 | 200 |
| `SCREEN_LEASH_KM` | 20 | 50 | 2,000 |
| `STATION_LATERAL_KM` | 3 | 7.5 | 300 |
| `CARRIER_WEAVE_KM` (amplitude, still capped at half top speed: 76 km for a carrier) | 2 | 5 | 200 |
| carrier keep-out push-back cap | 8 | 20 | 800 |
| `moveToward` arrival tolerance | 0.05 | 0.125 | 5 |
| anchor ramp floors `max(1, …)` (closing, `moveToward`, locked correction `max(1, 0.2 want)`) | 1 | 2.5 | 100 |
| formation turn gate `slotRadius > 1` | 1 | 2.5 | 100 |
| frigate runs: line arrival tolerances (×2) / minimum run length / torpedo fallback reach / extend leg / fallback leg | 0.5 / 2 / 4 / 12 / 10 | 1.25 / 5 / 10 / 30 / 25 | 50 / 200 / 400 / 1,200 / 1,000 |
| fighter passes: approach height jitter / approach tolerance floor / extend leg (×2) | 0.6 / 0.3 / 8 | 1.5 / 0.75 / 20 | 60 / 30 / 800 |
| anchor lag clamp `12 × S` | 4.8 | 12 | 480 (formula unchanged) |
| `stealth.ts` run start `strikeRange + 2.5` | 2.5 | 6.25 | 250 |
| `TORPEDO_LEAD_KM` | 1.5 | 3.75 | 150 |
| hunter approach arrival `< 0.6` / fire window `strike + 1` / transit `gap > 0.3` / Thanix hold `strike + 0.5` | 0.6 / 1 / 0.3 / 0.5 | 1.5 / 2.5 / 0.75 / 1.25 | 60 / 100 / 30 / 50 |
| vent point lateral 6, vertical 1.5 (×2), arrival 1 | 6 / 1.5 / 1 | 15 / 3.75 / 2.5 | 600 / 150 / 100 |
| shadow station lateral 6 ± 1.5, back 4 / 2 | 6 ± 1.5 / 4 / 2 | 15 ± 3.75 / 10 / 5 | 600 ± 150 / 400 / 200 |
| `CRAFT_DETECT_RANGE` `1.5 S`, `STEALTH_SAFE_RANGE` `46 S`, `VENT_MARGIN_KM` `4 S`, `CROWD_KM` `6 S`, strike fallback `8 S`, strike margin `1.2 S`, reach `20 S` | 0.6 / 18.4 / 1.6 / 2.4 / 3.2 / 0.48 / 8 | unchanged formulas | 60 / 1,840 / 160 / 240 / 320 / 48 / 800 |
| `ai.ts` `chooseTarget` main-range floor | 8 | 20 | 800 |
| `fleetStandoff` fallback | 20 | 50 | 2,000 |
| craft neighbour query (point-defence repulsion) | 3.2 | 8 | 320 |
| `reaperAi.ts` `TRANSFER_DONE_KM` / rotate "more exposed" margin | 0.5 / 0.5 | 1.25 / 1.25 | 50 / 50 |
| `battle.ts` launched craft initial speed (km/s) | 0.6 | 1.5 | 20 (× `HULL_SPEED_SCALE`) |
| beam miss end point past the target (visual) | 6 | 15 | 600 |
| `spatial.ts` `GRID_CELL_KM` | 4 | 10 | 400 (§2.10) |
| `arrival.ts` (T13) `ARRIVAL.runKm` capital / cruiser / frigate (durations 6.0 / 4.5 / 3.5 s unchanged, beat sheet) | 12 / 9 / 7 | 30 / 22.5 / 17.5 | 1,200 / 900 / 700 (entry at 600 km/s, three times the mean run-in speed as today) |
| `scriptedMoves.ts` (T13) `STRAFE_CAPTURE_KM` | 0.25 | hull scale | 0.25, tested on the swept step (F5) |

All `SIMULATION_ESTIMATE`. CORE writes each as `<nominal> * S` (or `* BATTLESPACE_SCALE`) so a later change of S needs no second pass; a unit test (`tests/pacing.test.ts` T-P1) greps the simulation sources for bare numeric km literals outside an allow-list of hull-scale constants.

### 2.7 Manoeuvre durations × k, manoeuvre rates ÷ k

A manoeuvre duration is the time a hull needs to fly something; at k = 3 it takes three times as long, so its timer grows with it. Rates of formation motion shrink by k.

| File, constant | 0.12 | Plan | Label |
| --- | --- | --- | --- |
| `movement.ts` `MOVEMENT.headingRateRad` / `reaperHeadingRateRad` | 0.05 / 0.03 rad/s | 0.0167 / 0.01 rad/s | `SIMULATION_ESTIMATE` (brief §8.1 "a few degrees per second": now about one; the formations are 100 × wider) |
| `FORMATION_MIN_RATE` | 0.02 rad/s | 0.00667 rad/s | |
| `MOVEMENT.kp` (station keeping, per second) | 0.5 | 0.1667 | `kd` stays documentation |
| `MOVEMENT.unlockSeconds` | 8 s | 24 s | |
| `REWITHDRAW_COOLDOWN` | 30 s | 90 s | the return trip to the line takes k × longer |
| `CARRIER_WEAVE_PERIOD` | 40 s | 120 s | |
| frigate runs: run length 12–20 s; approach timeout 40 s (×2); turn-in 12 s; extend 6 s | | 36–60 / 120 / 36 / 18 s | |
| fighter passes: approach timeout 30 s (×2); early-pass test `until − 25`; pass 20 s; extend 3 s | | 90 / −75 / 60 / 9 s | |
| `stealth.ts` `JINK_PERIOD` 2.5 s; hunter approach 45 s (×2), run 30 s, turn 60 s (×3), extend `max(12, revealOnFire + 2)`; shadow drift period 50 s | | 7.5 / 135 / 90 / 180 / `max(36, revealOnFire + 2)` / 150 s | |
| IES class block: `capacity` 120 s, `ventTime` 18 s (simulation converts × k, catalogue keeps the brief's numbers) | | 360 s, 54 s | `SIMULATION_ESTIMATE`; the brief's own compression of "silent for hours" (`CANON_CONFIRMED` paraphrase, brief §15.2): a pass takes k × longer, so the sink must last k × longer for the doctrine of §15.2 to work; still far below hours |
| `reaperAi.ts` `TRANSFER_SECONDS` 60; `rotateCooldown` 20; `coverSeconds` 15; `groupWithdrawCooldown` 30 | | 180 / 60 / 45 / 90 s | |
| `specials.ts` (T13) `INTERPOSE_SECONDS` | 20 s | 60 s | the interposing hull flies from its station |
| T14 drive attack (when it lands): run distances in nominal km × S, run and commitment durations × k (AU window 20–60 s → 60–180 s) | | | `AU_MODIFIED` |

### 2.8 Combat timers that do not change

`SIM_DT` 0.05 s; every weapon cooldown, beam duration, burst and recovery, heat and cooling, magazine and `REARM_SECONDS` 12; turn rates; the firing-solution constants (build 0.08/s, decay 0.15/s, flare 0.25 per 2 s, manoeuvre penalty 0.2, `HARD_MANOEUVRE_SECONDS` 0.5); barrier regeneration (full after 3 s quiet) and every `barrierRegenUnderFire`; `WITHDRAWAL.reengageSeconds` 20 and `WITHDRAWN_QUIET_SECONDS` 5 (recovery, not travel); decision intervals and `FLEET_SLOW_INTERVAL`; `IDLE_RETRY_S`; `SLEW_TAU` 6 s; launch cadence (2 s, then 0.4 s per pair); `revealOnFire` 10 s (a sensor time); volley lead and windows, the HADES salvo window and gather, forced-shot and force-target durations, `FINAL_SALVO_SECONDS`; the owner's §21 thresholds (20 s, 75 %, 15 %). A cadence-limited exchange therefore kills at the 0.12 rate per second at a given range; only the time spent getting there, and the range at which it happens, change.

### 2.9 Scenario distances, arrivals and time limits

Fleet positions stay in nominal km (× S). Starting separations of the first lines are 70–82.5 nominal = 2,800–3,300 km = 1.6–1.9 Reaper reaches, unchanged in ranges; the approach therefore takes k × as long (first contact 39–47 s).

| Scenario | Time limit (s) 0.12 → plan | Late arrivals (time ×3; position capped, §3.4) |
| --- | --- | --- |
| Battle of Earth | 420 → 1,260 | Reaper second wave 55 → **165 s** |
| Defence of Palaven | 420 → 1,260 | Reaper flank group 70 → 210 s; Alliance detachment 60 → 180 s |
| Fall of Thessia | 420 → 1,260 | — |
| Defence of Sur'Kesh | 420 → 1,260 | flank group 90 → 270 s (early warning) or 25 → 75 s (late) |
| Cerberus Intervention | 360 → 1,080 | — |
| Rannoch | 420 → 1,260 | — |
| Battle of the Citadel | 420 → 1,260 | Alliance Fifth Fleet 40 → 120 s |
| Final Battle of Earth (opening off) | 540 → 1,620 | Reaper reserve 90 → 270 s |
| Alliance Fleet Engagement (reference) | 360 → 1,080 | — |
| Prime/Apex Sol and Palaven Defence | 480 → 1,440 | second wave 70 → 210 s |
| Cerberus Ascendant (Harbinger) | 360 → 1,080 | — |
| Custom battles | default 420 → 1,260; minimum 60 → 180 | per-fleet arrival times as entered (user seconds) |
| Campaign engagements (`campaign/engine.ts`) | 420 → 1,260 | hostile fleets every 20 → 60 s; auto-resolve keeps `sim.run()` (200,000 steps = 10,000 s ≥ 1,620 s) |
| Showcase scene and the Final Battle opening (beats) | 400 (scene) → set by B after measuring; the beat table's times stay (`OWNER`) | beat waves keep their beats; the T16 reserve `arrivalTime 110` is beat-synchronised and stays |

All `SIMULATION_ESTIMATE`. The data are rewritten (the numbers in `scenarios/index.ts` and `campaign/engine.ts` are the real seconds); no runtime multiplier is applied to `maxDuration` or `arrivalTime`, so a custom battle's "time limit" still means what the player typed. The reference engagement needed up to 454 s on the prototype against its new 1,080 s limit, so no reference battle ends by the clock (0.12: two of three did).

**Beat-driven geometry** (T16's Final Battle opening, AP §4.2–§4.3, and stage B's Showcase scene, AP §5.3; `OWNER` times): the beat times never stretch; the geometry is re-derived so that the beats still happen. A displacement a beat expects within T beat-seconds shrinks, in nominal km, by k² for motion that starts from rest within the beat (acceleration-limited: a Reaper capital needs 17 s to reach top speed) and by k at cruise. Applied to the opening: the Reaper climb into the coalition plane over the 16 s before the volley shrinks from 12 to **1.3 nominal km (53 km)** and T16's rise test to two thirds of the scripted climb; the two lines close only about 6 nominal km between `form_up` (12 s) and the volley (38 s), so the Reaper blockade starts **44 nominal km (1.05 × spinal range)** from the Sword line's centre instead of about 60, which brings the spinal line to 0.9 × its range at the release; the Reaper beams (44 nominal) are then in reach from the start and hold fire until the answer by the beat table's `holdFire: 'beams'`; `clamp(1 / beatScale, 0.85, 1.25)` on the anchor `z` values stays. Scripted `approach` distances that are hull-scale ("a dreadnought broadside at point-blank", 2.5 km) stay; their `seconds` budgets × k. T16's tests of the volley (fired ≥ 0.7 × ordered, impacts ≥ 30 % within 3 s) are the check.

### 2.10 Spatial grid

`GRID_CELL_KM` = 10 × S = **400 km** (`SIMULATION_ESTIMATE`; the audit measured no cost difference with a scaled cell, §4.8). The ±512-cell key domain covers ±204,800 km. Queries are padded (F1, §2.11); with the largest per-step displacement 2.4 km (an Oculus) and 30 km for a hull in a T13 arrival run-in (600 km/s entry), the pad is far below a cell.

### 2.11 Engine fixes the new speeds require (verified bugs; CORE, first commit of the pass)

| # | Bug (present at 0.12) | At the new speeds | Fix |
| --- | --- | --- | --- |
| F1 | The grid indexes start-of-tick positions and tests current ones; a hull that crossed a cell edge since the rebuild is missed (audit §1.5, §4.1: 1 of 11 runs differs from a brute-force scan today) | per-step displacements of 0.4–2.4 km (30 km in a run-in) | pad `queryRadius`, `anyWithin`, `querySegment` boxes and the `nearest` shell bound by the largest per-step displacement among the indexed hulls (`maxSpeed × SIM_DT`, or the run-in's entry speed × `SIM_DT` for an arriving hull); identical to brute force at any cell size (audit: 11 of 11) |
| F2 | The projectile sweep tests the round's step segment against each candidate's **end-of-step** position, though the candidate moved during the step | a destroyer moves 1.07 km per step against an 80 m sphere, an Oculus 2.4 km against its 50 m sweep sphere | test the round's motion **relative** to the candidate over the step: segment from `p.prevPos − s.prevPos + s.pos` to `p.pos` against the sphere at `s.pos`; pad the query by the per-step displacement |
| F3 | A round fired during a tick is aimed from the target's current position — end-of-step if the target already moved this tick, start-of-step if not — and then advanced a full step in the same tick: the round and the target run on time bases one step apart (error = target speed × 0.05 s: 72 m for an Oculus today against its 50 m sweep sphere) | 2.4 km for an Oculus; 0.5 km for a Reaper capital | a round leaves at the end of the tick from the shooter's end-of-tick position, aimed from the target's end-of-tick position (its current position plus `vel × SIM_DT` when it has not moved yet this tick, known from a per-hull `movedTick`), and starts flying in the next tick's projectile update. Measured: impacts on destroyers per rolled slug hit at them 0.97–1.09 (0.12: 0.89–1.09, strays included; at the new speeds without F2 and F3: 0.69–0.83) |
| F4 | Recall and rearm fly a transit goal at full speed **through** the carrier; rearming counts only inside 1.5 × the carrier's length | overshoot v²/2a = 165 km against a 1.35 km rearm radius: craft never rearm | recall and rearm become a station goal on the carrier (`velocity: carrier.vel`, the braking curve), so the craft settles alongside |
| F5 | Proximity events are sampled at step ends: strafe-lane waypoints (0.25 km), scripted `approach` within `km`, recovery (`lengthKm`) and rearm (1.5 × `lengthKm`) | craft cover 2.3–2.4 km per step | test the swept step segment (closest approach between `prevPos` and `pos`, in the carrier's or target's frame) |
| F6 | `relSpeedPenalty = max(0.55, 1 − closing / projectileSpeed)` compares simulated speeds; with V ≠ P the ratio would change | V / P = 0.099 × today's | evaluate it in nominal units: `closing / HULL_SPEED_SCALE` over `projectileSpeed / ROUND_SPEED_SCALE` (or `/ MISSILE_SPEED_SCALE`); identical to 0.12 at any S, k |

F1–F5 change 0.12 results too (craft balance most: §2.13); they land as the pass's first commit and are measured at S = 0.4 before the scale changes, so their effect is recorded apart from the scale's.

### 2.12 What does not change, and why balance is preserved

Unchanged: the catalogue (§2.2), the combat timers (§2.8), the damage, barrier, armour, heat and HADES models, the hit-probability formula (`damage.ts`: range enters as distance ÷ range), the firing-solution model (`solutions.ts`: distance ÷ main range, the target's acceleration fraction, per-second rates), doctrine fractions (§2.5), the Reaper AI rules (T12) and the §21 rules (CORE adds them after this pass), `SIM_DT`, seeds and every random draw.

Why the outcomes hold (`SIMULATION_ESTIMATE` argument, measured in §1.5): (1) uniform S keeps every geometric relation — standoff bands, formation extents against ranges, point-defence overlap, the screen ahead of the line; (2) the hit model sees only range fractions and (after F6) the nominal speed ratio; (3) G4 = 0.988 keeps the physical misses of rolled hits; (4) cadence-limited kills keep their per-second rate. What moves: (a) **manoeuvre against cadence** (× 3): more shots during the approach and repositioning, which favours the longer reach (canon Reapers; Apex Titans) — measured: canon Reaper capitals lost 2 / 2 / 1 against 1 / 1 / 2, Apex survival 72.8–79.0 % against 58.1–74.9 %; (b) **blocking and strays vanish** (G8): at 0.12, 6–17 % of rolled hits on Reaper capitals struck another hull first and 4–11 % of misses struck something (audit §3.6); at S = 40 hull cross-sections are 1 % of the spacing; (c) **reinforcements engage on arrival** (§3.4, `OWNER` §21.4) — scenarios with late waves get harder for the side receiving them (Sol Defence survival 86 → 66 %; canon Final Battle A → B); (d) F1–F5 (bug fixes).

### 2.13 Calibration re-pin plan for CORE T19

After the pass (and after the §21 rules), T19 runs `scripts/calibration.ts` and the new `scripts/pacing.ts` (§7.2) and re-pins **inside the AP §3.5 lever order** (solution floor 0.2–0.35, destroyer barrier 900–1,100, capital regeneration 1,000–1,100, capital beam cooldown 6.0–7.5; Apex: organic multipliers, then `HADES_WARHEAD.damage`, then `apex_hyper_ma.specialAmmo`; never the capital's pools below 7,000 / 12,000, never `reaper` tech). Expected work, from the prototype:

| Pin | Prototype | Expected T19 action |
| --- | --- | --- |
| Reference canon 7/8/9: B, Reaper capitals 1–2, survival < 30 %, Reapers not destroyed | B, 2 / 2 / 1, 4.6–4.9 % | none (watch the 2s: the stretch favours the Reapers) |
| Reference Apex 7/8/9: A, all Reapers destroyed, 7–19 lost, ≥ 1 dreadnought, < 85 % | A, 15 / 14 / 14, 2 / 2 / 3, 72.8–79.0 % | none; seeds 10–12 measured as T13 did |
| Battle of Earth 42: B, > 5 destroyed, drones before 30 s, Trident median life ≥ 55 s | B, 45 destroyed, drones at the 0.12 launch times | re-measure the Trident life (craft fights last longer) |
| Isolated barrier bench (pure helper) | unchanged by construction | none |
| 4 dreadnoughts kill a muted capital ≤ 90 s (40 nominal km duel) | 89.7 s (0.12: 39.7 s): the line fires while still closing from 0.95 × range, at a third of the 0.12 pace (at 0.12 it is at 0.6 × range within 15 s) | start the time-to-kill duels at 0.7 × spinal range (29.4 nominal km) with `hold_formation`, so the pin measures killing, not approach; keep ≤ 90 s |
| 2 dreadnoughts never take the barrier below 50 % in 300 s | 0.707 over 900 s | the window becomes 900 s (k × 300) |
| Cruiser vs destroyer 3–12 of 20; dreadnought kills a destroyer ≤ 40 s; four frigates ≤ 6 of 10; two cruisers ≥ 8 of 10 | 8 of 20 (0.12: 6) | re-measure; approach-free fixtures for the time pin |
| 4 armed dreadnoughts lose ≥ 1 every seed and kill ≤ 2 of 5; six kill ≥ 4 of 5 | 0 kills, 4 lost each (as 0.12) | re-measure the six |
| Oculus screen 1–3: last craft death 60–120 s, Oculi lost ≥ 20, Tridents 8–23 | 123 / 101 / 156 s; Oculi 17 / 24 / 24; Tridents 24 / 12 / 20. With F1–F4 at 0.12: 73 / 86 / 68 s; Oculi 24 / 18 / 24; Tridents 13 / 3 / 7 | re-pin: the window × k (60–360 s); F3 makes the Tridents' rolled hits land at 0.12 and the stretch changes the dogfight's tempo; T19 measures seeds 1–6 and pins the band it gets; the craft numbers (Oculus hull 48, fighter gun 6 points) are catalogue values this plan does not touch, so a lopsided screen is a T19 finding for the lead |
| Firing solutions: < 25 % in the first 6 s, > 60 % over 20–40 s (2 DN, muted capital, 40 nominal km, closing) | 0 % and 45 % (the line is still closing at 0.8 × range at 40 s) | hold the line at 0.7 × spinal range (`hold_formation`), as the owner's check says ("after 20 s of tracking on an unmanoeuvring target"): measured 0–33 % and 70–80 % at both scales |
| Heat: no Alliance dreadnought overheats in the canon reference | — | re-measure (more shots at long range) |
| Final Battle canon 1 (unpinned) | B at 678 s | record; if the owner wants the conventional coalition victory back, the reserve's arrival time is the lever (measured: A when it arrives at 0.12 positions) |

Then `CALIBRATION_REPORT.md` §2 records "after pacing" before "after calibration".

### 2.14 Where the prototype's numbers come from

Session scratch copies of `src/` at `58b6a4b`, outside the repository and not committed, with §2.1–§2.11 and §3 applied (Q5 excepted: it is CORE's §21 task); the eleven runs, the duels of `tests/calibration.test.ts` and the Oculus screen. Variant labels used above: "plan" = everything; the alternatives of §1.5 each remove or change one item. CORE's own measurement in P6 (§8) supersedes every number here.

## 3. Anti-queueing rules

"Longer distances must not recreate Reapers queuing out of weapons range" (`OWNER`, brief §19.2) and "no fleet idles … a fleet out of every weapon's range for more than 20 s after contact advances" (`OWNER`, brief §21.4). Queueing at 0.12 came from reinforcement waves arriving 2.5 ranges out, wide organic lines against compact Reaper groups, absolute leashes (at large S) and carriers by design (audit §3.4, §4.3). The rules, all `SIMULATION_ESTIMATE`:

### 3.1 Formation extent against range (Q1)

Formations scale with S exactly (§2.4): line abreast 1.83 × 0.21 fleet ranges, defensive screen 0.67 × 0.40, Reaper wedge 0.58 × 0.15. A Reaper wedge 0.58 ranges wide and 0.15 deep has every hull in reach of the enemy's line when its anchor is within 0.85 × its range; an organic line wider than its range has wings out of reach of a compact Reaper group, which Q2 handles. The formations the scenarios start in are at most 0.4 × their fleet's range deep (line abreast 0.21, defensive screen 0.40, strike wedges 0.15–0.35), so a rear hull reaches range at most 0.4 range ÷ closing speed ≈ 36 s after the front; the layered line (0.62), columns and the descending swarm (up to 0.7) are deeper and rely on Q2 and Q3.

### 3.2 Leashes in nominal km (Q2)

The slot leash (capitals, 200 km = 0.12 × a dreadnought's range) and the screen leash (escorts, 2,000 km = 2.1 × a frigate's range) are re-based (§2.6): the audit's P4L measured exactly this at S = 4 (queueing 20–38 % → 2–4 %, no hull out for more than 60 s). Escorts still close at half speed (the half-speed lean is doctrine; full speed was measured and rejected, §1.5).

### 3.3 Reapers never idle once engaged (Q3)

`reaperAdvanceGoal` (AP §10) fires today only while the anchor has stopped. New gate: **while the fleet's heading is locked (the enemy within 1.1 × its range) or the anchor has stopped**, a Reaper hull with no target in its main range closes on the nearest enemy combatant to 0.8 × its range at 0.6 × top speed. The loose cluster therefore spreads to bring every hull into reach while the anchor is still closing. Measured: longest idle-out-of-range spell of any Reaper hull after its fleet's contact **0–2 s** in all eleven runs (0.12: 0 s); longest out-of-range spell, closing included, 12–32 s (0.12: 5–35 s).

### 3.4 Reinforcements arrive in reach, at the battle's pace (Q4)

- **Arrival cap.** A fleet deployed after t = 0 by its scenario `arrivalTime` or a campaign wave (not a beat `spawn_wave`, whose geometry the beat table owns) drops out at its scenario bearing but **no farther than 1.1 × its fleet engagement range from the point-weighted centroid of the live enemy combatants** (`deployFleet`: anchor moved along the line from that centroid to the scenario position). At 0.12 the second waves deployed 2.5 ranges out and were 79–100 % out of range for their first 30 s (audit §3.4).
- **Arrival times × k** (§2.9): a reserve that joined the fight 55 s into a 0.12 battle joins 165 s into the stretched one, i.e. at the same phase of the battle. Without it the Battle of Earth's second wave joined before the main exchange and doubled the first wave (§1.5).

### 3.5 Organic no-idle (Q5, the §21.4 rule CORE adds next)

The fleet-level rule of brief §21.4 (a fleet out of every weapon's range for more than 20 s after contact advances) is CORE's §21 task in the same chunk; this plan's thresholds assume it. Measured before it: longest idle-out-of-range spell of an organic line hull (carriers, withdrawing hulls and stealth hunters excluded) 0 s in the canon five and the Apex reference, 25 s in Sol Defence, 11 s in the Apex Final Battle.

### 3.6 Exempt by design

Carriers and liveships (keep-out 0.8 × the enemy's main range beyond their own broadsides), hulls in tactical withdrawal, stealth hunters shadowing, fixed platforms, and the mop-up of the last one or two hulls (the measures count while the enemy fields at least three).

### 3.7 Bounds (tested, §7)

| Measure (after the hull's fleet's contact or arrival, enemy ≥ 3 hulls) | Prototype | Threshold |
| --- | --- | --- |
| Reaper hull idle out of range (not closing at ≥ 0.25 × top speed) | ≤ 2 s | ≤ 10 s |
| Reaper hull out of every weapon's range, closing or not | ≤ 32 s | ≤ 60 s |
| Organic line hull idle out of range | ≤ 25 s (before §21.4) | ≤ 30 s (20 s trigger + start-up) |
| Reaper line out of range, mean after contact (Battle of Earth 42, reference canon 7) | 5–11 % | ≤ 15 % |

## 4. Firing at range

### 4.1 The model across the bands (unchanged formulas)

| Distance ÷ weapon range | 0.25 | 0.5 | 0.75 | 0.9 | 1.0 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hit-probability range factor `1 − 0.45 f²` | 0.97 | 0.89 | 0.75 | 0.64 | 0.55 |
| Solution build-rate factor `1 − 0.5 f²` | 0.97 | 0.88 | 0.72 | 0.60 | 0.50 |
| Dreadnought round flight (s) | 0.10 | 0.21 | 0.31 | 0.38 | 0.42 |

The exchange now spends its first decisive minutes at 0.8–1.0 × range (§1.5): there a fresh solution (q₀ 0.10) gives `p × (0.25 + 0.75 q)` at a quarter of the open-range probability and builds at half rate, so opening salvoes mostly miss and stream on to 2.2 × range (3,700 km), concentrated fire arrives as solutions mature and the lines close — brief §8.7's behaviour, now over minutes and a thousand-plus kilometres. Measured (impacts of ≥ 600 points per spinal shot, the calibration harness's measure): 0.28–0.38 in the canon five against 0.49–0.61 at 0.12 (strays and the outer band); Reaper capital beams 0.34–0.43 against 0.37–0.45.

### 4.2 Evasion (the physical intercept)

A rolled hit is aimed at the constant-velocity intercept; a target that accelerates during the flight drifts `½ a t²`. With A and the flight time both rescaled (G4), the drift is the 0.12 drift in metres (destroyer 155 m against its 80 m sphere at full lateral thrust; Reaper capital 54 m against 1 km; Oculus 29 m against its 50 m sweep sphere at full fighter-gun range), so the share of rolled hits that fly past stays where it was calibrated (audit §3.6: 0–3 % on destroyers), once F2 and F3 remove the step-timing errors (§2.11). Small agile hulls remain the hardest to hit, as the lore expects (`lore-ranges.md` §4 item 2). Hard manoeuvres still cost every solution on the target 0.2 once; because manoeuvres last k × longer there are fewer of them per minute, a small shift toward the shooter that T19's solution-floor lever covers.

### 4.3 Relative speed

`relSpeedPenalty` is evaluated in nominal units (F6), so a fast crossing target costs a slow round exactly what it did at 0.12 (the term is ≥ 0.55; for slugs against capitals it stays at 0.97–0.98).

### 4.4 Blocking and stray hits

At S = 40 the escorts' cross-section is a hundredth of the spacing: rounds aimed at a Reaper capital are no longer intercepted by its screen or by T12's covering destroyers (which still interpose on the line and still draw fire as targets); misses no longer strike neighbours. Both effects were measured at S ≥ 4 (audit §4.2: blocked 0–2 %, strays 0–2 %). This also gives brief §21.4's "clear firing lanes" almost for free (§7, T-P10).

### 4.5 Beams stay hit-scan

The lore gives the Reaper and Thanix streams only "a fraction of light speed" (`lore-ranges.md` V6, V8): at 0.05–0.5 c the 1,760 km reach takes 0.01–0.12 s, under three simulation steps, so a travelling beam would change little and cost a model; it stays hit-scan (`SIMULATION_ESTIMATE` decision). The renderer may draw the stream's front crossing the gap in up to 0.1 s as a visual liberty (§5.6), never delaying the damage.

### 4.6 What the player sees

At 1.1–1.5 × beam reach the Reapers open on the screen; frigates and cruisers close under fire for a minute or more (they must "survive into effective range", `lore-ranges.md` K5); dreadnought volleys at 1,500–1,700 km take 0.4 s to arrive, most early rounds miss by kilometres and fly on; the capital lines exchange for minutes at 0.8–1.0 × range before closing to about 0.7.

## 5. Rendering and camera (stages A and B; render-side only)

Nothing below changes the simulation: the camera sees true simulated distances; ships are made trackable by presentation (brief §19.2, `OWNER`). Numbers for a 1080p screen, 50° vertical field of view (≈ 21.6 px per degree).

### 5.1 Scale of the scene (A)

Render unit 100 m and positions = simulation km × 10 stay. Battle extents grow to about ±3,000 km (±30,000 units). **Floating origin:** world-space float32 data (instance matrices, the far point cloud, tracer and effect buffers) lose 0.2–0.4 m at 20,000–40,000 units; a chase camera 340 m behind a fighter would see that as 1–2 px of jitter. Each frame A subtracts a camera-anchored origin (the focus rounded to 10 km) from every position written to a float32 buffer and offsets the scene root, so values near the camera stay small; meshes already compose model-view matrices in float64 (audit §6). The five models drawn shorter than their simulated hulls (Reaper capital 1.54 against 2.0 km, Harbinger, Reaper destroyer, Alliance cruiser, Cerberus dreadnought; audit §6) are corrected in the likeness pass so the range-to-hull ratio reads true.

### 5.2 Camera limits and default views (B)

| Item | 0.12 | Plan |
| --- | --- | --- |
| Far plane | 600,000 units (60,000 km) | unchanged (the battle spans ≤ 6,000 km; starfield and sun follow the camera) |
| Near plane | `clamp(0.002 d, 0.2, 50)` units | unchanged |
| Zoom (`CameraRig.zoom`) | 6–60,000 units (0.6–6,000 km) | **6–150,000 units** (to 15,000 km) |
| Opening view (`bind`) | 320 units (32 km) from the player's fleet centre | tactical view of the player's fleet with markers at 0.6 × its frontage (≈ 1,800 km), then the director's establishing shots |
| Command view | ≥ 1,200 units | ≥ 0.6 × the battle's extent (≈ 2,000–4,000 km) |
| Follow / chase | `(size × 2.4 + 3) × clamp(distance / 320, 0.35, 5)` | unchanged (hull scale) |
| Free flight | 600 / 2,500 units/s | add a third speed, 25,000 units/s (2,500 km/s) |

### 5.3 Markers and impostors (A, B)

Framing both fleets (≈ 3,500 km, camera ≈ 2,100 km) makes a Reaper capital 1.2 px and a frigate 0.1 px. Two render-side layers, drawn in screen space:
- **Markers**: the far point cloud (`battleView.ts`, 2,048 points) switches to `sizeAttenuation: false` with a pixel size by class — capital 7 px, cruiser and destroyer 5 px, frigate 3.5 px, craft 2 px (flights one marker) — faction colour, a selection bracket and the overlay's labels; it replaces the 0.12 behaviour in which every far hull was the GPU's 1 px minimum point (audit §6).
- **Impostors**: between the reduced mesh and the marker, a hull is drawn as its class silhouette sprite (pre-rendered, oriented to its heading) at `max(true projected length, 12 px)` for capitals and `max(…, 6 px)` for escorts — "cinematic scaling" (brief §19.2), recorded by D as a visual liberty like the fighters' 2× scale. LOD thresholds stay on model length: reduced detail beyond 70 lengths as today, impostor beyond 350 (where the true image falls under 4 px), marker beyond 2,000 (under 1 px), each switch cross-faded; the cost is one instanced quad per hull.

### 5.4 Shots (B)

| Shot | At the new scale |
| --- | --- |
| Gunnery POV / Target POV (brief §20) | the target 1,000–1,800 km away is a telephoto view: field of view 0.05–2° (a 2 km Reaper fills 550 px at 1,500 km and 0.15°); reticle, range, intercept time (0.3–0.42 s) from the simulation's telemetry; the round's streak shrinks toward the target over 20–25 frames |
| `longLens` (AP §5.2, fov 8–18°, distance ≥ 40 × size) | frames one ship and its neighbours (≈ 100–150 km apart) or a fleet's depth; an exchange pair 1,500 km apart is a split screen or a rack from shooter to target, never one wide frame |
| Establishing / distance shots (director W1–W4, D1–D2) | markers, impostors and tracer streaks (brief §4's "walls of light" at 1,000+ km) |
| Fly-bys and chase | ships move 8–48 km/s: a static camera sees a dreadnought cross its own length in 0.1 s; cameras track the subject (follow, dolly with the fleet) and the director may use the render-side slow motion of brief §16.3 / §20.7 for a fly-by, never slowing the simulation |
| Arrival flashes (T13) | the run-in starts at 600 km/s and settles in 3.5–6 s: a streak and a flash 700–1,200 km behind the slot |

### 5.5 LOD and the far cloud distances (A)

At 0.12 the point switch sat at 700 model lengths (Reaper capital 1,078 km, frigate 119 km) and was rarely reached; at the new scale it is the normal state of a tactical view. The impostor layer of §5.3 fills 350–2,000 lengths; `MAX_FAR_POINTS` 2,048 stays; the distant layer (T15) keeps its sprites.

### 5.6 Tracers and beams (A)

| Effect | 0.12 | Plan |
| --- | --- | --- |
| Heavy / light tracer width | 11 m / 4.5 m world (sub-pixel beyond 13 km / 5 km) | screen-space minimum 1.5 px / 1 px with additive glow, world width when larger |
| Tracer length | `max(150 m, 0.06 s of flight) × 1.3` (940 m for a dreadnought round) | the round's per-frame displacement × 2 (≈ 130 km at 60 fps for 4,025 km/s), clipped at the target |
| Beam core / glow | radius 11.7 m / × 3.2 (sub-pixel beyond 27 / 87 km) | screen-space minimum 1.5 px core, 4 px glow; the stream's front may cross the gap in ≤ 0.1 s (visual liberty, §4.5) |
| Barrier ripples, impacts, explosions, debris | hull scale | unchanged |

### 5.7 Depth precision (A)

The logarithmic depth buffer stays: with the far plane at 600,000 units and a 24-bit buffer the relative depth resolution is about 8 × 10⁻⁷, i.e. 0.4 m at 500 km and 4 m at 5,000 km — enough at every distance a hull can be resolved; no near-plane change is needed.

### 5.8 Environment and the attitude layer (A)

Earth at **true scale** (6,371 km radius, `CANON_INFERRED` geometry) with the battle plane 1,000–2,000 km above the surface (line of sight over the limb ≥ 7,400 km, `lore-ranges.md` D6), replacing the one-third Earth that framed a 30 km battle (`LORE_REFERENCE.md` visual liberty). The brief §15.3 attitude layer reads accelerations: bank angle and thruster intensity must use the acceleration fraction (`shipMotion.accelFrac`, `|Δv| / (a dt)`) rather than km/s², since absolute accelerations are 11 × larger. Audio (brief §8.4, §20.5): attenuation over camera distance and the "light before sound" delay use hull-scale reference distances with the delay capped at 0.3 s; impact sounds fire on the impact event (0.3–0.42 s after the shot).

### 5.9 HUD and labels (B)

Ranges, distances and speeds in simulated km with thousands separators ("1,680 km", "8.7 km/s"); the target panel adds the round's time of flight; the battle clock shows minutes (battles of 5–12 minutes).

## 6. Performance

- **Battle length in steps** (the cost driver, audit §4.8): Battle of Earth 5,400–6,200 (0.12: 4,800), reference canon 6,900–9,100 (6,500–7,200), Apex reference 3,600–3,900 (2,400–3,300), Sol Defence 6,800 (3,100), Final Battle 6,500–13,600 (2,800–3,700). The approach steps are cheap (no projectiles, idle mounts on the 0.25 s retry).
- **Per-step cost:** unchanged with the cell scaled (audit §4.8: 0.4–1.2 ms Battle of Earth, 1.3–2.8 ms Final Battle at S = 0.4 / 4 / 10). Rounds live 1.4 s instead of 3.6 s, so the projectile sweep handles fewer of them; F1's padding and F2's relative test add a few multiplications per candidate.
- **Grid:** 400 km cells; candidate queries over 1.5 × sensor range (≤ 12,000 km) fall back to scanning occupied cells as today.
- **Governor (T18):** render costs move from meshes to markers and impostors (cheaper); tracer count falls with the shorter lifetimes; the ladder and its tiers are unchanged; the `extreme` tier inherits the marker layer.
- **Playback (brief §19.1, playback workstream):** at 8× a battle of 450 s plays in under a minute; Fast-forward to result runs a 9,000-step battle in about 5–10 s headless; this plan asks the playback workstream for one more exact control, **Skip to contact** (step headless until the first anti-ship `weapon_fired`, then resume at the chosen speed; deterministic like the rest).
- **Tests:** battle-heavy files grow by 30–100 % (Final Battle × 3.6); `tests/pacing.test.ts` runs each battle once and shares it across its `it`s with event-loop yields (no single `it` over 20 s on the 4-CPU container); `tests/batching.test.ts` may compare the first 6,000 steps instead of whole battles if its wall time doubles (identical event logs up to a step prove the same property).

## 7. Acceptance tests

Deterministic, Node (`vitest`, `environment: 'node'`), each battle run once per file through `runSimAsync`. New file **`tests/pacing.test.ts`** (CORE, P5):

| # | Test | Threshold | Prototype |
| --- | --- | --- | --- |
| T-P1 | Constants: `alliance_dn_main` simulated round 4,025 ± 0.5 km/s; dreadnought spinal range ÷ Reaper capital length ≥ 800; `HULL_ACCEL_SCALE × (S / ROUND_SPEED_SCALE)²` within 0.40 ± 0.02; every mass-accelerator flight to full range ≤ 0.5 s; torpedo and missile flight times equal to 0.12's (range ÷ speed, nominal); no bare km literal in `src/simulation/**` outside the hull-scale allow-list | as stated | 4,025; 840; 0.395; ≤ 0.46 s |
| T-P2 | Range-to-hull (Battle of Earth canon 42 and reference canon 7): median capital-to-nearest-enemy-capital distance after contact | ≥ 600 L and between 0.75 and 1.10 × the capital's own range | 847 and 792 L; 0.98 and 0.93 |
| T-P3 | Approach: first contact | ≥ 30 s (0.12: 11 s) | 40.6 and 40.4 s |
| T-P4 | Contact to the first capital loss (same runs; Apex reference 7) | canon 50–150 s; Apex 40–150 s | 74.9 and 65.5; 52.6 |
| T-P5 | Battle duration | Battle of Earth 42: 250–900 s; reference canon 7: 330–1,080 s (ends before the limit); Apex reference 7: 140–600 s | 312; 392; 183 |
| T-P6 | Queueing (§3.7) in the Battle of Earth 42, reference canon 7 and Apex reference 7: Reaper idle out of range ≤ 10 s; Reaper out of range ≤ 60 s; organic line idle out of range ≤ 30 s; Reaper line out of range ≤ 15 % mean after contact | as stated | 2 / 0 / 0 s; 32 / 12 / 12 s; 0 / 0 / 0 s; 11 / 7 / 12 % |
| T-P7 | Arrival cap: a custom battle with a side-B fleet at `arrivalTime` 30 s placed 4 ranges out: its anchor at arrival is ≤ 1.1 × its engagement range from the side-A centroid (+ one step's travel) | as stated | — |
| T-P8 | Grid exactness: 200 random fixtures (hulls moved by up to `maxSpeed × SIM_DT` after a rebuild) — `queryRadius`, `anyWithin`, `querySegment`, `nearest` identical to a brute-force scan; Battle of Earth 42 with a brute-force grid identical for its first 2,400 steps | identical | — |
| T-P9 | Intercept (F2, F3): a destroyer and an Oculus crossing the line of fire at full speed, each fired at 200 times by a fixture gun whose hit probability sits at the 0.98 cap (a cloned weapon definition with a large `accuracy`); rounds matched to impacts through `projectileId` (T13) | ≥ 95 % of rolled hits strike their target | impacts per rolled destroyer hit 0.97–1.09 in the battles |
| T-P10 | Firing lanes (with brief §21.4): in the reference canon 7, rolled hits on Reaper capitals that strike another hull first (matched through `projectileId`) | ≤ 3 % | ≈ 0 (audit S ≥ 4: 0–2 %) |
| T-P11 | Recall and rearm (F4, F5): a Trident with spent torpedoes rearms within 60 s of reaching its carrier; a recalled flight is recovered | as stated | — |
| T-P12 | Firing solutions (brief §8.7, `OWNER` check at the new scale): 2 dreadnoughts holding at 0.7 × spinal range against a muted stationary capital: < 25 % rolled hits in the first 6 s, > 60 % over 20–40 s | as stated | 0 % / 70–80 % (seed 1–3: 0–33 % / 70–80 %) |
| T-P13 | Outcomes stay inside the T19 bounds (the existing `tests/battle.test.ts` pins, re-run unchanged) | canon B, 1–2 capitals, < 30 %; Apex A, all destroyed, 7–19, ≥ 1 dreadnought, < 85 % | all pass |
| T-P14 | Determinism at the new scale: `tests/batching.test.ts` (1 / 160 / uneven ticks per batch) and a replay of the reference canon 7 give identical events, results and time | identical | — |

Existing tests whose literals are distances or manoeuvre times are converted by the classification of §2.6–§2.8, never weakened (P5): every compressed-km literal → nominal × S (e.g. `tests/movement.test.ts` cohesion `< 2.5` km → `< 6.25 × S` = 250 km; `tests/reaperAi.test.ts` slot continuity `< 1.5` → `< 3.75 × S`); every step count or second that bounds a manoeuvre × k (`tests/battle.test.ts` "fighters launch and torpedoes are fired" 1,800 → 5,400 steps; `tests/stealth.test.ts` "two strike passes in 180 s" → 540 s; `tests/reaperAi.test.ts` "interpose within 10 s" → 30 s; the movement band test's 400 s limit → 1,200 s); combat seconds and the owner's checks stay (idle ≤ 10 s, fire never silent for 10 s, the 60 s band hold, drones before 30 s); outcome bands are T19's (§2.13). T13's tests: `tests/arrival.test.ts` "settle at < 0.05 km/s relative to the slot" → `< 0.125 × HULL_SPEED_SCALE`; `tests/specials.test.ts` interpose and approach windows × k; `tests/flagship.test.ts` (Harbinger duel at 40 nominal km) re-measured.

### 7.2 Measurement script

`scripts/pacing.ts` (CORE, committed like `scripts/calibration.ts`): the probe of §1.5 over the eleven runs, printing the table of §1.5, the per-window distances, the queueing measures of §3.7 and the hit outcomes of §4; T19 and stage reviews read it.

## 8. Tasks per owner, in execution order

### CORE — pacing pass (chunk 6, after T18; before the §21 rules and T19)

| Step | Task | Done when |
| --- | --- | --- |
| P1 | Engine fixes F1–F6 (§2.11) at S = 0.4: padded grid queries and `nearest`; relative projectile sweep; end-of-tick firing with `movedTick` and next-tick launch; recall/rearm station goal; swept proximity tests; nominal-unit `relSpeedPenalty`. Measure the eleven runs and the duels at 0.4; re-pin only what a fix moves (expected: the Oculus screen), each change justified in the commit | suite green; CORE_PROGRESS "P1" entry with before/after |
| P2 | Scale constants (§2.1) and conversions in `createShip`; nominal re-basing of every absolute distance (§2.6); manoeuvre timers × k and rates ÷ k (§2.7); `SLOT_COMPRESSION = S`; `GRID_CELL_KM = 10 S`; T13 `ARRIVAL.runKm`, `INTERPOSE_SECONDS`; the stealth conversion; comments in `constants.ts` and `weapons.ts`; the two provenance notes (§2.2) | typecheck; T-P1 |
| P3 | Data (§2.9): every scenario `maxDuration` and non-beat `arrivalTime` × 3; campaign waves and limit; custom defaults (`buildCustomBattle`, T17's `scenarios/custom.ts`); the T16 opening geometry and beat motions (§2.9) if T16 has landed (else T16 takes them); calibration harness fixtures (§2.13: duel windows × 3, time-to-kill duels and the solutions fixture held at 0.7 × spinal range, the Oculus window × 3) | data reviewed against the tables |
| P4 | Rules Q3 (Reapers never idle once locked) and Q4 (arrival cap 1.1 × engagement range) | T-P6, T-P7 |
| P5 | Tests: `tests/pacing.test.ts` T-P1–T-P14; conversion of the existing literals (§7); `batching.test.ts` scope if needed | suite green |
| P6 | `scripts/pacing.ts`; measure; CORE_PROGRESS "pacing pass" entry with the §1.5 table re-measured; `CALIBRATION_REPORT.md` §2 "after pacing"; an INTEGRATION_NOTES bullet for A, B, C, D (scale constants, telemetry units, the IES conversion, the beat geometry rule) | committed |
| then | Brief §21 rules (incl. Q5's fleet advance), then **T19** (§2.13), then T20 | per WORK_BREAKDOWN |

### A — rendering (stage A run)

| Order | Task |
| --- | --- |
| A1 | Floating origin for every float32 world buffer (§5.1); verify a fighter close-up at the far edge of the battle without jitter (screenshot) |
| A2 | Markers (screen-space, by class) replacing the attenuated far cloud; impostor layer with silhouette sprites at minimum pixel sizes; LOD thresholds 70 / 350 / 2,000 lengths (§5.3, §5.5) |
| A3 | Tracers and beams with screen-space minimum widths and per-frame streak lengths; optional stream-front visual (§5.6) |
| A4 | Earth at true scale and the battle altitude; starfield and sun unchanged (§5.8) |
| A5 | Attitude and thruster layer on acceleration fractions; arrival run-in streaks; audio distance model and capped delay (§5.8) |
| A6 | Model lengths matched to the simulated hulls (the five short models, audit §6) in the likeness pass |

### B — cameras, HUD, director (stage B run)

| Order | Task |
| --- | --- |
| B1 | Camera limits and default views (§5.2) |
| B2 | Gunnery / Target / Reaper POV as telephoto views with the simulation's intercept telemetry; `longLens`, rack and split framings for 1,000+ km pairs (§5.4) |
| B3 | Director cadence for long battles (establishing shots on markers, slow-motion fly-bys from the history buffer); the Showcase scene re-timed by the beat geometry rule (§2.9) |
| B4 | HUD units and clock (§5.9); overlay brackets on markers |
| B5 | With the playback workstream: Skip to contact (§6) |

### C — custom battle (stage C run)

| Order | Task |
| --- | --- |
| C1 | Starting distance slider: keep the nominal value in the data (`startingDistanceKm`, × S at build); show simulated km: range 1,200–6,400 km (nominal 30–160, step 2 → 80 km), default 3,040 km (76), with the hint "Reaper beams reach 1,760 km; dreadnought guns 1,680 km" taken from the catalogue × S |
| C2 | Time limit field: default 1,260 s, minimum 180 s; briefing rows show distances in km and an estimate of first contact, (separation − the longest range) ÷ the two fleets' combined anchor speed |

### D — documentation and codex (stage D run)

| Order | Task |
| --- | --- |
| D1 | `LORE_REFERENCE.md`: §Simulation estimates ("compressed battlespace (tens of km instead of tens of thousands)" → the scaled battlespace: capital guns 1,440–1,920 km, the dreadnought round at its codex 4,025 km/s, a three-fold manoeuvre time); §Visual liberties (Earth now true scale; markers and impostors drawn larger than true size; the stream-front visual) |
| D2 | In-app codex: `mass_accelerator` estimate ("rounds travel at 22–48 km/s over ranges of 24–48 km" → "rounds travel at 1,900–6,400 km/s — the Everest-class round at its codex 4,025 km/s — over ranges of 160–2,240 km; ranges are simulation estimates"); IES paragraph (capacity and vent times at the new pace); the fighter, torpedo and GARDIAN estimate texts with the new ranges |
| D3 | Database screen: simulated ranges, speeds and accelerations (× the scales), flight times; nominal values never shown as km |
| D4 | `ARCHITECTURE.md` units line; `PACK_ADOPTION.md` §2.12 ("keeps flight times comparable" → the codex velocity holds and flight times are 0.3–0.4 s); `KNOWN_ISSUES.md` (short layers longer than the pack's SIM envelopes; hulls at tens of km/s; the canon Final Battle tends to the Reapers); README and CHANGELOG |
| D5 | e2e: the database row for the dreadnought gun shows "1,680 km" and "4,025 km/s"; the custom slider label; the HUD target panel range in km |

## 9. Risks and open points

- **Single-seed chaos.** The prototype's outcomes are single seeds (`engine-audit.md` header); T19 measures more seeds before pinning (T13 already does for Apex 10–12).
- **The stealth block.** Brief §15.2 writes `capacity: 120, ventTime: 18` as battle seconds; this plan multiplies them by k in the simulation for the same reason CORE multiplies the block's 2.5 km by S. If the owner prefers the literal seconds, the 120 s sink fills before a pass is over (the 0.12 stealth test flies two passes in 180 s, so a pass takes up to 270 s at k = 3) and the hunter vents in the middle of its approach; the lead should confirm in INTEGRATION_NOTES.
- **The canon Final Battle** went to the Reapers on the prototype (§1.5); lore-consistent, but a visible change for players of the canon preset.
- **Per-layer ranges** (option c) remain the route to pack-like short layers (point defence ≤ 10 km) if the owner asks for it; it needs a two-speed craft model and a full re-calibration.
- **Larger S** (2,000+ km ranges) is one constant pair away (S = 48, k = 4 measured, §1.5); T19 would re-pin again.
- **Codex checks.** `lore-ranges.md` §6's list (ME1 *Space Combat: General Tactics* first) could still produce a canon range; if it does, S is re-derived from §1.3 with that anchor.
