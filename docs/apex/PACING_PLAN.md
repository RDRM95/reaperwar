# Pacing plan: combat scale, pacing and anti-queueing

Stage S design (brief §19.2, binding). Revised on 5 November 2026 after the design review; §10 lists every finding and what changed. Inputs: `docs/apex/pacing/lore-ranges.md` (lore research), `docs/apex/pacing/engine-audit.md` (engine audit at T12), and a prototype of this plan measured on scratch copies of `src/` at the T13 head (`58b6a4b`). The plan is checked against the integration head `38a436d` (CORE T14 drive attack, T15 distant layer, T16 vessel names; release 0.12.1 with stage T's measured threat table), merged into this branch as `f0bacfe`. T14, T15 and the vessel names leave the eleven runs bit-identical (`CORE_PROGRESS.md` T14, T15 and T16 entries), so the prototype's numbers carry over; their constants are classified in §2.6–§2.7 and the threat table in §2.15. Nothing in `src/` changed; the prototype and its probes are scratch files outside the repository.

CORE applies this plan in chunk 6 as a **pacing pass after T18 and before the brief §21 rules and calibration pass 2 (T19)**: P1 (the engine fixes, at today's scale) as one commit, P2–P6 (the scale) as one commit (§8). The chunk-6 prompt does not fix that order today; §8.0 asks the lead to. Stages A and B carry the render and camera parts, C the custom-battle fields, D the documentation and codex wording.

**Labels.** `CANON_CONFIRMED` only where `LORE_REFERENCE.md` §Canon anchors records the number with its source; `CANON_INFERRED` for directions and derived values (`lore-ranges.md` §1); `SIMULATION_ESTIMATE` for every scale constant, range, speed, acceleration, time limit and rule chosen here; `AU_MODIFIED` for alternate-universe objects; `OWNER` for brief requirements. No codex text is quoted: the repository records none for ranges or speeds (`lore-ranges.md` §2.2, §6).

**Glossary.** S = `BATTLESPACE_SCALE` (nominal km → simulation km); k = the new `MANOEUVRE_TIME_SCALE`; L = the longer hull of a pair (in these battles nearly always the 2 km Reaper capital); R or "range" = a hull's longest non-point-defence weapon range, or a fleet's engagement range (`fleetEngagementRange`); "0.12" = the engine today (S = 0.4, k = 1); "the eleven runs" = the reference rows of `scripts/calibration.ts` (`engine-audit.md` header); "contact" = the first anti-ship shot of a hull at a hull; "the ladder battle" = `scripts/perf-sim.ts` `ladderBattle` (canon, deep space, 80 nominal km, coalition `line_abreast`, Reapers `dispersed`, seed 11).

## 0. Decision in brief

1. **Both levers, tied together by the one canon number.** Distances and ranges scale up by 100 (S = 0.4 → **40**); hull speeds by 33 (S / k with **k = 3**) and hull accelerations by 11 (S / k²), so every manoeuvre takes three times as long relative to weapon cadences and kills; **mass-accelerator rounds fly at the codex velocity** — the Alliance dreadnought round at **4,025 km/s** (`CANON_CONFIRMED`, ME1 codex *Dreadnought*), every other round at the catalogue's ratio to it. With the round at its canon speed, the only scale at which a target's sideways drift during a round's flight stays what the calibration was tuned on is S³ = 0.4 × (4,025/30)² × k², i.e. **S ≈ 19.3 k^⅔** (§1.3); k = 3 gives S = 40.2, and the plan uses **S = 40, k = 3** (drift 0.988 × today's).
2. **What the player gets** (prototype, §1.5): capital guns reaching **1,680–1,760 km** (AU Titan 1,920 km); a median capital-to-nearest-enemy-capital distance after contact of **1,530–1,830 km = 760–910 Reaper lengths** (Final Battle 1,780 and 2,150 km; today 12–18 km, 5.9–9.1 L); first contact at **34–42 s** (11–14 s); first capital gun at a capital at **66–106 s** (21–33 s); first capital loss **51–92 s after contact** (23–41 s); battles **0.8–2.5 × as long** (Battle of Earth 268–303 s against 241 s; reference canon 296–390 s against 324–360 s; Apex reference 200–238 s against 118–164 s; canon Final Battle 388 s against 186 s, still a coalition victory). Every canon and Apex reference pin of `tests/battle.test.ts` holds on the prototype (seeds 7–9); seeds 10–12 show how thin some margins are, so T19 pins from several seeds (§2.13).
3. **What does not change:** every nominal catalogue number (damage, hull, armour, barriers, regeneration, cadences, heat, accuracy, magazines, turn rates, nominal ranges and speeds, doctrine fractions); the hit and firing-solution models (S-invariant by construction; one term is evaluated in nominal units so it stays identical); **formation geometry relative to ranges** (`SLOT_COMPRESSION = 1.375 × S` keeps 0.12's exactly, §2.4); `SIM_DT`; determinism; no hull cap; no approximation of combat.
4. **Engine fixes the new speeds expose** (verified bugs present at 0.12, decisive at 33 × the speed): exact grid queries under any displacement (F1), the projectile sweep in relative motion (F2), one time base for a round and its target (F3), recall, rearm and scripted stand-off approaches by station keeping (F4), swept proximity tests (F5), the relative-speed term in nominal units (F6) (§2.11).
5. **Anti-queueing** (§3): formations at 0.12's geometry (Q1) and, for large fleets, no line wider than three ranges (Q1b); leashes re-based in nominal km (Q2); an organic hull that has nothing in reach for 20 s while its line holds leans in (Q2b); Reapers never idle once their fleet is engaged (Q3); reinforcements arrive within 1.1 × their range of the enemy, facing it, never inside 0.9 × their range of the nearest enemy hull, at k × their scenario times (Q4); the brief §21.4 fleet advance (Q5, CORE's §21 task, written by the classification rule of §3.5); scripted hull-scale moments flown at a hull-scale pace (Q6). Measured: no Reaper hull idle out of range for more than 4 s after its fleet's contact in any of the eleven runs; in the 300-vs-100 ladder battle 19 of 294 organic hulls never come into range in the 120 s after contact (without Q1b: 161).
6. **Rendering never compresses the simulation** (§5): markers and minimum-pixel impostors, LOD chosen by projected pixels (so telephoto views keep full detail), cameras that move with their subject, telephoto gunnery views, screen-space tracer and beam widths, a floating origin, every planet at near-true scale under one shared battle altitude, the Citadel anchored with Sovereign at its Tower.
7. **What the scale costs the look, for the owner to confirm** (§1.4, §9): closing 1,000+ km within minutes needs hull speeds of 5–48 km/s, so a pass at hull scale lasts frames (a Trident crosses a 2 km Reaper in 0.04 s) and small craft fight at 140–160 km. Scripted hull-scale moments get a simulation-side pace (Q6); the fighter-screen "furball" is a marker-and-streak shot unless the short craft layer of option (c) is adopted later.
8. **Owners in order** (§8): the lead fixes the chunk-6 order (§8.0); CORE P1 (own commit), P2–P6 (one commit, suite green including the regenerated threat table), then the §21 rules, then T19 (which regenerates the threat table again); A, B, C, D in their stage runs; §11 holds their prompts.

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
| G6 | relative speed ÷ round speed in the hit model | V / P | `relSpeedPenalty` (`damage.ts`) | = 1 (evaluated in nominal units, F6) |
| G7 | formation spacing ÷ point-defence reach and ÷ range | slot scale / S | mutual point defence, torpedo and craft balance, frontage-driven queueing | = 1 exactly: `SLOT_COMPRESSION = 1.375 × S` (0.12's 0.55 at S = 0.4) |
| G8 | hull cross-section ÷ formation spacing | 1 / S | rounds blocked by escorts, stray hits | falls to ≈ 0 — accepted, measured (§2.12, §4.4) |

### 1.3 The options, and the one chosen

| Option | G1 | G2 | G4 | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| (a) Raise S only (range-to-hull ratio, time unchanged) | ∝ S | 1 | ∝ S | audit §4.2: at S = 4 and 10, 16–33 % of rolled hits on destroyers fly past; S = 40 would make every manoeuvring hull dodge; accelerations × 100 (a fighter at 5,700 g) | rejected: breaks the hit physics and leaves "too fast" untouched |
| (b) Stretch time only (lower speeds, ranges unchanged) | 1 | ∝ 1/V | ∝ A | audit §4.5: half speed → approach × 1.6–1.9, exchange still 6.7–7.2 L | rejected: "too close" untouched |
| (c) Re-base ranges layer by layer (capital band in thousands of km, torpedoes, GARDIAN and craft near the pack's ≤ 10–100 km) | per layer | — | — | lore §4 item 4 | rejected for this pass: craft and torpedoes would have to cross a thousand-km capital layer at close-combat speeds (a two-speed craft model), point-defence and torpedo geometry change, every calibration pin moves; kept as the route to a hull-scale craft fight (§9) |
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

### 1.4 Why k = 3 and S = 40, and what it costs

- **Lore.** The capital band lands at 1,440–1,760 km (Ascension 1,920 km; AU Titan 1,920, Nova 2,080, legacy Nova and heavy platform guns 2,240 km): "thousands of kilometres" in its lower register, an order of magnitude below the pack's `SIMULATION_ESTIMATE` envelopes (dreadnought 10,000–80,000 km), which no canon text supports either (`lore-ranges.md` R1, §5). The round flies at its codex 4,025 km/s; the short layers stay layered (point defence 240–260 km, torpedoes 720 km, fighter guns 160 km) — longer than the pack's ≤ 10 km `SIMULATION_ESTIMATE`, which is not canon; canon anchors them only by mechanism (slow torpedoes, heat-limited point defence), and every one of those mechanisms is kept (§2.3).
- **Balance.** The prototype keeps every pinned reference outcome (§1.5). k = 4 / S = 48 (2,016–2,112 km ranges) drifted further: Apex reference seed 9 at 87 % survival with no dreadnought lost (pins: < 85 %, ≥ 1), the Battle of Earth's Reaper losses down to 4–5 hulls before the arrival-time rule. The cause is structural: stretching manoeuvre time gives the side with the longer reach more free shots (canon Reapers 44 nominal km against organic guns ≤ 42, Apex Titans 48 against 44), so k is kept as small as the brief allows.
- **Pace.** k = 3 triples the approach and the long-range phase; with the long-range hit penalties the decisive exchange opens 1–2 minutes into a battle and lasts several minutes (§1.5). Brief §19.1's fast-forward and the 2×–8× speeds make longer battles practical (§6).
- **Cost.** Battles run 0.8–2.5 × the steps (§6); k = 4 would add another third.
- **The look at hull scale (the trade-off, for the owner).** Closing 1,000+ km within minutes needs tens of km/s, so what a camera sees at hull scale changes. Hull speeds rise 33 × while hull lengths stay: a dreadnought (8.7 km/s) crosses its own length in 0.1 s; a Trident (45 km/s) crosses a 2 km Reaper in 0.04 s, about 3 frames at 60 fps (1.5 s at 0.12); a fighter and an Oculus meeting head-on close at 93 km/s. Craft fight at gun ranges of 140–160 km, about 8,900 Trident or 11,700 Oculus lengths (0.12: 89–117), longer than the pack's small-craft "close action" (Oculus ≤ 100 km, `lore-ranges.md` R14, `SIMULATION_ESTIMATE`). So the trilogy's fighters weaving round Reapers, brief §3's "fighter wing threading a Reaper's arms" and brief §2's "chase cam through the furball" do not happen by themselves at this scale. The plan answers with a simulation-side, deterministic pace for scripted hull-scale moments (Q6, §3.7), cameras that move with their subject (B1, §5.2), render-side slow-motion replays (brief §16.3, §20.7) and a marker-and-streak furball shot (§5.4); a hull-scale craft fight needs option (c)'s short craft layer (§9).
- **The dial stays.** S and k are two constants with the identity of §1.3 checked by a test; a later decision to reach further (S = 48, 64, …) changes them together and re-runs T19.

### 1.5 Measured on the prototype

The prototype implements §2–§3 on a scratch copy of the T13 head (Q5 excepted: it is CORE's §21 task; Q6 excepted: no scripted move acts in these runs); the probe samples every hull each simulated second (definitions as `engine-audit.md` §8, plus "idle out of range" = no enemy within the hull's main range and not closing on the nearest enemy at ≥ 0.25 × top speed, counted while the enemy fields ≥ 3 hulls). Single battles are chaotic: read ranges across seeds, and see the extra seeds below the table.

| Run | Winner, end (s) 0.12 → plan | A survival | Lost A / B (capitals) 0.12 → plan | Contact (s) | First capital gun at a capital (s) | First capital loss (s) | Capital to nearest enemy capital after contact, p50: 0.12 → plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Battle of Earth canon 42 | B 241 → B 303 | 5 → 5 % | 37/10 (6/1) → 37/8 (6/1) | 11.0 → 33.8 | 32.7 → 106.2 | 51.7 → 125.7 | 13.0 km, 6.5 L, 0.74 → 1,745 km, 872 L, 1.01 |
| Battle of Earth canon 7 | B 242 → B 268 | 5 → 3.9 % | 37/8 (6/1) → 39/5 (6/1) | 10.9 → 33.7 | 32.9 → 100.3 | 50.9 → 117.7 | 13.3 km, 6.7 L, 0.77 → 1,669 km, 834 L, 0.98 |
| Reference canon 7 | B 324 → B 346 | 4.9 → 3.6 % | 45/9 (8/1) → 51/4 (8/2) | 11.6 → 35.6 | 26.1 → 80.7 | 40.7 → 97.0 | 12.3 km, 6.1 L, 0.72 → 1,527 km, 764 L, 0.89 |
| Reference canon 8 | B 360 (limit) → B 390 | 5 → 4.4 % | 44/9 (8/1) → 46/9 (8/2) | 11.7 → 35.4 | 26.2 → 82.9 | 40.4 → 102.2 | 12.0 km, 6.0 L, 0.70 → 1,530 km, 765 L, 0.90 |
| Reference canon 9 | B 360 (limit) → B 296 | 5.7 → 4.4 % | 43/10 (8/2) → 49/6 (8/1) | 11.5 → 35.5 | 26.6 → 80.4 | 36.9 → 92.3 | 11.7 km, 5.9 L, 0.67 → 1,696 km, 848 L, 1.00 |
| Reference Apex 7 | A 118 → A 238 | 74.9 → 66.9 % | 9/12 (3/4) → 16/12 (4/4) | 11.0 → 34.1 | 21.3 → 66.0 | 34.3 → 85.5 | 11.8 km, 5.9 L, 0.63 → 1,762 km, 881 L, 0.93 |
| Reference Apex 8 | A 164 → A 220 | 58.1 → 71.5 % | 13/12 (5/4) → 17/12 (3/4) | 11.1 → 34.2 | 21.4 → 69.9 | 34.2 → 102.5 | 11.7 km, 5.9 L, 0.62 → 1,762 km, 881 L, 0.93 |
| Reference Apex 9 | A 128 → A 200 | 63.1 → 79.5 % | 10/12 (5/4) → 16/12 (2/4) | 11.2 → 34.3 | 21.3 → 65.9 | 36.4 → 86.5 | 11.7 km, 5.9 L, 0.66 → 1,774 km, 887 L, 0.93 |
| Apex Sol Defence 1 | A 157 → A 359 | 86.2 → 53.5 % | 6/18 (2/6) → 31/15 (5/6) | 12.9 → 39.5 | 24.2 → 82.8 | 35.6 → 100.3 | 13.7 km, 6.8 L, 0.73 → 1,826 km, 913 L, 0.97 |
| Final Battle canon 1 | A 186 → A 388 | 72.5 → 57.4 % | 22/32 (6/10) → 68/26 (10/10) | 13.7 → 42.4 | 31.0 → 95.6 | 45.8 → 107.7 | 12.4 km, 6.2 L, 0.72 → 1,778 km, 874 L, 1.02 |
| Final Battle Apex 1 | A 142 → A 355 | 92.2 → 89.5 % | 15/32 (3/10) → 34/31 (2/10) | 13.2 → 40.5 | 24.8 → 78.4 | 37.7 → 108.2 | 18.5 km, 9.1 L, 1.06 → 2,151 km, 1,054 L, 1.21 |

(The capitals columns count dreadnought-class and Reaper capital hulls; carriers are excluded.) Pins of `tests/battle.test.ts` on the prototype: canon 7/8/9 → B, Reaper capitals lost 2 / 2 / 1 (pin 1–2), survival 3.6–4.4 % (< 30 %), the Reapers not destroyed; Apex 7/8/9 → A, every Reaper destroyed, 16 / 17 / 16 lost (7–19), 4 / 3 / 2 dreadnoughts (≥ 1), 66.9–79.5 % (< 85 %). Battle of Earth 42: B with 8 Reapers destroyed (> 5).

Extra seeds (unpinned; T13 measured Apex 10–12 the same way): Battle of Earth canon 1 / 2 / 3 → B at 266 / 259 / 261 s, 5 / 4.2 / 3.4 %, first contact 33.6–33.7 s; reference canon 10 / 11 / 12 → B, Reaper capitals lost **3** / 2 / 2, 3.4–4.2 %; reference Apex 10 / 11 / 12 → A, 21 / 15 / 27 lost, dreadnoughts **0** / 2 / 3, survival **84.9** / 79.9 / 66.1 %. Seed 10 sits outside the canon capital band and on the Apex dreadnought boundary that T12 already called "a coin flip per seed" (one dreadnought lost ≈ 85–86 % survival): bands are therefore derived from several seeds in P6 and re-pinned by T19 (§2.13, §7).

Over time (Battle of Earth canon 42, capital distance p50 ÷ range and in L per 90 s window from contact, i.e. three 0.12 windows): 1.25 / 1,066 L → 0.87 / 736 L → 0.75 / 660 L (0.12 per 30 s: 1.29 → 0.74 → 0.59 → 0.62 → 0.72). The fight closes from the edge of the beams to about 0.75 × range, three times more slowly, and spends its first decisive minutes at 0.85–1.0 × range, where the hit and solution models penalise fire (§4).

Wide lines (the ladder battle, seed 11, 120 s from contact; 0.12 over 40 s = 120 s ÷ k): 300 v 100 — organic samples out of range 33 % (0.12: 52 %), 19 of 294 hulls never in range (0.12: 80 of 293), longest organic idle spell 7 s (0.12: 39 s, the whole window); 600 v 600 — 38 %, 27 of 588, 6 s.

Measured but not adopted (same probe, same head):

| Variant | What changed against the plan | Result |
| --- | --- | --- |
| Formations at S (the first draft: the 0.55 floor dropped, `SLOT_COMPRESSION = S`) | G7, §2.4 | formations 0.73 × as large relative to range; first contact 39–47 s; canon Final Battle → **B at 678 s** (4.9 %); reference canon 7/8/9 B at 392 / 454 / 343 s; Apex reference 72.8–79.0 % |
| No frontage bound | Q1b | ladder 300 v 100: 77 % out of range, 161 of 294 never in range, idle spells to 114–120 s (the line is 25,000 km wide against a Reaper group 5,800 km wide); the eleven runs: only the Apex Final Battle changes (A at 349 s, 89.7 %) |
| Frontage bound at 2.5 ranges (76 nominal km) instead of 3 | Q1b | wraps one frigate of the reference task force's 31-hull row; chaotic changes (reference canon 9 to 506 s with 3 Reaper capitals lost) |
| Organic lean (Q2b) without the "line holding" gate | Q2b | reference canon 7 and 8 lose 3 Reaper capitals (pin 1–2); Apex reference 65.2–70.2 %; on the ladder battle without Q1b no gain (the wings are 9,000 km out) |
| Organic lean alone (Q2b gated, no Q1b) on the ladder battle | Q1b | no change against the plan without Q1b: the frontage bound does the work, Q2b catches the rest |
| No arrival heading or lower bound (Q4 as in the first draft) | Q4 | Battle of Earth 42 B at 297 s; Sol Defence 55.8 %; canon Final Battle A at 355 s, 65.9 %: the arriving fleet first fights on its stale scenario heading |
| S = 48, k = 4 (first-draft geometry) | §1.3 | Apex 9: 87 % survival, no dreadnought lost; Battle of Earth Reaper losses 3–8; first capital gun 127–144 s |
| Without the arrival-time rule (reinforcements at their 0.12 times; first-draft geometry) | Q4 | Battle of Earth: the second wave joins before the main exchange; Reaper losses 3–6, end 216–229 s |
| Without the arrival cap (first-draft geometry, S = 48, k = 4) | Q4 | the Battle of Earth's Reaper line 29 % out of range on average after contact (with the cap 7 %): the second wave queues 2.5 ranges out for minutes |
| Without F2 and F3 (first-draft geometry) | §2.11 | 17–31 % of rolled slug hits on destroyers struck nothing; 56 % of rolled fighter-gun hits on Oculi in the screen fixture (F2 alone); the Oculus screen a massacre of the Tridents (24 of 24 lost, 2–9 Oculi) |
| Escorts closing at full speed instead of half (first-draft geometry, S = 48, k = 4) | Q2 | more escorts lost piecemeal (Apex reference 8: 21–25 lost) |

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
| `ORBIT_ALTITUDE_KM`, new (true km, never × S) | (≈ 350, AP §17, a camera convention) | **1,500** | the battle plane's altitude above the environment's planet; shared by the simulation (T14's planet centre, §2.6) and the renderer (A4, §5.8). Line of sight over Earth's limb from 1,500 km: about 9,200 km (`lore-ranges.md` D6's geometry: 7,414 km at 1,000 km, 10,860 km at 2,000 km) |
| `PLANET_RADIUS_KM`, new (per environment, true km) | (render-only, a third of true) | **6,371** for `earth_orbit` (`CANON_INFERRED`: Earth's mean radius); **6,371** for `palaven_orbit`, `thessia_orbit`, `rannoch_orbit`, `surkesh_orbit` (`SIMULATION_ESTIMATE`: no radius for these worlds is recorded in the repository, `lore-ranges.md` §5; a codex check per `PACK_ADOPTION.md` §0.1 may replace them) | |
| Beams (`thanix`, `reaper_beam`, `gardian`) | hit-scan | hit-scan | Infinity × any scale (§4.5) |
| Identity checked by a test | — | `HULL_ACCEL_SCALE × (S / ROUND_SPEED_SCALE)² = 0.395` (0.12: 0.4) | G4, §1.3 |

Conversion sites: `battle.ts` `createShip` (`maxSpeed × HULL_SPEED_SCALE`, `acceleration × HULL_ACCEL_SCALE`, `sensorRange × S`, weapon `range × S`, `projectileSpeed × ROUND_SPEED_SCALE` for mass accelerators and `× MISSILE_SPEED_SCALE` for torpedoes and missiles, stealth `detectRange × S`, stealth `capacity` and `ventTime` × k (§2.7)); `deployFleet` positions × S (unchanged rule). Turn rates (degrees per second) are not converted: they are gun-laying rates, a combat quantity (§2.8). The comment block of `constants.ts` and the `weapons.ts` header are rewritten (they say the battlespace is compressed so that a 40 km range shares a frame with a 2 km hull). Every constant added to `constants.ts` changes the threat table's catalogue fingerprint; the table is regenerated in P6 (§2.15).

### 2.2 Catalogue fields

**No nominal catalogue value changes** (`src/data/ships.ts`, `weapons.ts`, `factions.ts`): ranges, projectile speeds, top speeds, accelerations, turn rates and sensor ranges keep their nominal numbers and tags; the scale constants convert them, every mass-accelerator round at one ratio (the catalogue's ratio to the codex round). That keeps every gun's calibrated flight time and drift (G4 = 1), the AU guns included; it means three AU rounds fly faster than the pack's own AU numbers, so their texts change. **Provenance and description texts change wording only** (CORE, P2; names, descriptions and provenance notes never enter the threat fingerprint):

| Entry | New wording (substance) |
| --- | --- |
| `alliance_dn_main` note | "Codex: Ships and Vehicles — Dreadnought. Cadence 2.0 s is CANON_CONFIRMED (one round every two seconds); heat 12 per round is a SIMULATION_ESTIMATE (ADOPTION_PLAN.md §3.2). The simulation flies the round at its codex 4,025 km/s; the range is a SIMULATION_ESTIMATE." |
| `apex_hyper_ma` note | "Project Titan, AU proposal. Damage 1,235 is the pack's kinetic term for its working shot (25 kg at 4,000 km/s ≈ 47.8 kt ≈ 1.23 DKE; APEX_Fleet_Reference §4), adopted as a damage ratio. The simulation flies every mass-accelerator round at the catalogue's ratio to the codex dreadnought round, so this round flies at 5,903 km/s (AU_MODIFIED simulation value); its damage is calibrated and not derived from the simulated speed. Prime/Apex timelines only." |
| `nova_array` note | "AU proposal: the Valkyrie's Nova Array core, 2.78 DKE every 6 s, from the pack's 25 kg at 6,000 km/s; the degraded-target bonus is the AP §8 kill rule. The simulation flies the round at 6,440 km/s (AU_MODIFIED simulation value, the catalogue's ratio to the codex round); damage calibrated, not derived from that speed." |
| `nova_legacy` value | "Alternate-universe high-power weapon from the earlier Apex material: a near-light-speed single shot on a sixty-second cycle, twelve rounds, visible six-second charge. Easier by design; not part of the Mass Effect trilogy." |
| `nova_legacy` note | "AU proposal, high power: Legacy Nova 55.9 DKE adapted to 30,000 points. The pack's figure of 20 kg at 0.1 c is its own numerical example, not a claim of literal near-c velocity (apex_simulator_data.json special_systems.legacy_nova.warning). The simulation flies the round at 53,667 km/s (0.18 c; AU_MODIFIED simulation value, the catalogue's ratio to the codex round). apex_legacy only." |
| `presets.ts` `apex_legacy` tagline and Legacy Nova line; `comparison.ts` legacy Nova line | "the 0.1c Legacy Nova" / "a 20 kg round at a tenth of light speed (≈ 2.2 Mt)" → "the near-light-speed Legacy Nova (AU HIGH POWER)", without a velocity or yield the simulation does not fly |
| IES block notes | §2.7 |

The simulated values that result (the table D copies into the database screen):

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
| Project Titan / Nova Array / legacy Nova (48 / 44, 52 / 48, 56 / 400) | 1,920 / 2,080 / 2,240 | 5,903 / 6,440 / 53,667 | 1.09 / 1.08 / 0.14 → 0.33 / 0.32 / 0.04 | `AU_MODIFIED` simulation values (the catalogue's ratio to the codex round). The pack's AU values are Titan 25 kg at 4,000 km/s, Nova Array 25 kg at 6,000 km/s and legacy Nova 20 kg at 0.1 c = 29,979 km/s, the last "the numerical example, not a claim of literal near-c velocity" (`lore-ranges.md` V14) |
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

The spread of the layers (7 : 1 capital band to point defence) is the 0.12 spread (`lore-ranges.md` D4); every mechanism that makes the short layers short is unchanged: torpedoes are slow (88 km/s against 4,025 km/s rounds) and spend the same 2.7 s crossing a point-defence envelope; GARDIAN stays heat-limited; craft still close to strike. What changes is the look at hull scale (§1.4).

### 2.4 Formations (`src/simulation/formations.ts`)

| Constant | 0.12 | Plan | Label |
| --- | --- | --- | --- |
| `SLOT_COMPRESSION` | `max(S, 0.55)` = 0.55 | **`1.375 × S` = 55** (0.12's 0.55 written as a ratio: every formation keeps exactly its 0.12 size relative to every range, so G7 = 1) | `SIMULATION_ESTIMATE` |
| `FRONTAGE_RANGES`, new (Q1b) | — (unbounded) | **3**: a tier's row wider than 3 × the fleet's engagement range wraps into further ranks | `SIMULATION_ESTIMATE` |
| `SLOT_SPACING_FACTOR` (guard, × longer hull) | 1.7 | 1.7 (hull scale; never binds at S = 40) | `SIMULATION_ESTIMATE` |
| Nominal layouts (capital spacing 3.2, cruisers 2.2, frigates 1.6 nominal km, shell radii 9–12, …) | — | unchanged | `SIMULATION_ESTIMATE` |

Resulting extents (audit §2.3's figures at the slot scale S × 1.375, i.e. 0.12's): line abreast 2.52 × 0.29 fleet ranges (reference task force 4,220 × 480 km), defensive screen 0.92 × 0.55 (1,550 × 920 km), Reaper strike wedge 0.80 × 0.21 (1,400 × 360 km); capital neighbours 176 km apart (198 dreadnought lengths; Reaper capitals ≈ 138 km in the wedge). Point-defence reach over neighbour spacing: GARDIAN 240 km over 176 km = 1.36 (0.12: 2.4 km over 1.76 km = 1.36), so mutual point defence, torpedo and craft balance keep their 0.12 geometry. Depth: line abreast 0.29 range, so a formation's rear is in range within depth ÷ closing speed ≈ 28 s of its front (§3.1). Formation-dependent test literals convert by S / 0.4 = 100 like every other distance (§7).

### 2.5 Doctrine, engagement and standoff bands; sensors

Unchanged, because they are fractions of ranges (`SIMULATION_ESTIMATE`): `preferredRangeFactor` and `aggression` per faction (Reaper anchor 0.4375 × fleet range, Alliance/Cerberus spinal line 0.875 inside the 0.8–0.95 band, `OWNER`), heading lock 1.1 × range, unlock beyond 1.4 × range for 8 × k = 24 s, `advance` 0.55 × standoff, disengage 1.5 × standoff, carrier keep-out 0.8 × the nearest enemy's main range, recovery station 0.6 × standoff, station threat 0.5 × standoff, Reaper advance to 0.8 × own range at 0.6 × top speed, face-if-bearing 1.4 × range, platform weight within 1.3 × range, `fleetEngagementRange` floor `20 × S` = 800 km. Sensor ranges × S (table §2.2); target candidates within 1.5 × sensor range as today.

### 2.6 Absolute distances re-based (nominal km × S), or kept at hull scale

Every distance written in compressed km at 0.12 becomes nominal km × S (value at S = 0.4 ÷ 0.4) unless it is a physical, hull-scale distance. **Hull-scale** (stays in km): hit spheres, the spacing guard, hardpoint offsets, the interpose distance (`REAPER_AI` 0.6 × the protectee's length + 0.5 × the ship's), the craft pass offsets beside a hull, launch offsets, the recovery and rearm radii, `STRAFE_CAPTURE_KM`, T14's collateral radius, the scripted-pace zone of Q6. Distances that already read `k × S` stay.

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
| `driveAttack.ts` (T14) `DRIVE_ATTACK.corridorKm`, and with it the "alongside" exception (a friendly within `corridorKm` of the runner along the line flies beside the run) | 2 | 5 | **200**: the corridor keeps the runner's own formation and screen out of the run, so it scales with the formation (capital neighbours 176 km apart); at hull scale it would almost never close and more runs would commit than T14 measured |
| `DRIVE_TIERS.upper.collateralKm` (T14) | 1.5 | hull scale | **1.5**: a physical blast and debris radius ("collateral kills require actual geometry", APEX_Fleet_Reference §10); it catches a cover destroyer interposed at 1.28 km, never a formation neighbour 100+ km away — fewer collateral kills under `apex_legacy` than at 0.12, which T19 records |
| `driveAttack.ts` `PLANET_CENTRE` and `planetClearanceKm` (T14) | centre (6,371 + 350) × S below the origin; clearance 30 "compressed" km from the centre | true km | centre **(0, −(`PLANET_RADIUS_KM` + `ORBIT_ALTITUDE_KM`), 0) = 7,871 km below the origin**, never × S; the clearance becomes 30 km above the surface (a run is refused when the runner or the target is within `PLANET_RADIUS_KM + 30` km of the centre). Both readings pass everywhere in today's battlespace; the shared constants make the simulation's planet and A's planet the same body |
| `distantGroups.ts` (T15) `MIN_KM` / `MAX_KM` | 60 / 160 | 150 / 400 | **6,000 / 16,000** (2–6 × the battle's extent behind each line, as at 0.12) |
| `distantGroups.ts` `spreadFor` (6–30 km) | 6–30 | 15–75 | **600–3,000** |

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
| Scripted moves (T13 `approach`, `strafeThrough`): the `until` budgets set by beats and scenes | | × k, plus the Q6 zone time | §3.7 |
| `driveAttack.ts` (T14) `DRIVE_TIERS.window`: `rare` 40 s, `upper` 30 s | | **120 s, 90 s** | `AU_MODIFIED`; `driveReach` (0.8 × window × engine-scaled top speed × 2.5) is unchanged as a formula and scales with S by itself (window × k, speed ÷ k × 100) |
| `distant.ts` (T15) `DISTANT.firstLossAfter` | 30 s | **90 s** | first contact moves from 11–14 s to 34–42 s; the hard-coded 30 in `distantLayerFor` (`distantGroups.ts`) reads the constant |
| `DISTANT.baseRate` (per group and second) | 0.0009 | **0.0003** (÷ k) | the base attrition over a battle k × as long totals what it did at 0.12, so the AU captions and the HUD's DISTANT percentages stay in step with the real battle; the real-loss term follows the real battle's losses by construction (its integral is 0.6 × the fraction lost); `realLossWindow` 20 s, `updateEvery` 5 s and `engagedWindow` 2 s stay (smoothing and display cadences) |

### 2.8 Combat timers that do not change

`SIM_DT` 0.05 s; every weapon cooldown, beam duration, burst and recovery, heat and cooling, magazine and `REARM_SECONDS` 12; turn rates; the firing-solution constants (build 0.08/s, decay 0.15/s, flare 0.25 per 2 s, manoeuvre penalty 0.2, `HARD_MANOEUVRE_SECONDS` 0.5); barrier regeneration (full after 3 s quiet) and every `barrierRegenUnderFire`; `WITHDRAWAL.reengageSeconds` 20 and `WITHDRAWN_QUIET_SECONDS` 5 (recovery, not travel); decision intervals and `FLEET_SLOW_INTERVAL`; `IDLE_RETRY_S`; `SLEW_TAU` 6 s; launch cadence (2 s, then 0.4 s per pair); `revealOnFire` 10 s (a sensor time); volley lead and windows, the HADES salvo window and gather, forced-shot and force-target durations, `FINAL_SALVO_SECONDS`; the owner's §21 thresholds (20 s, 75 %, 15 %). A cadence-limited exchange therefore kills at the 0.12 rate per second at a given range; only the time spent getting there, and the range at which it happens, change.

### 2.9 Scenario distances, arrivals and time limits

Fleet positions stay in nominal km (× S). Starting separations of the first lines are 70–82.5 nominal = 2,800–3,300 km = 1.6–1.9 Reaper reaches, unchanged in ranges; the approach therefore takes k × as long (first contact 34–42 s). Two exceptions open inside the band, because their battle is already joined when the scenario starts (brief §19.2 "where appropriate"): the Final Battle opening (beat geometry, below) and the Battle of the Citadel (below).

| Scenario | Time limit (s) 0.12 → plan | Late arrivals (time × 3; position capped, §3.4) |
| --- | --- | --- |
| Battle of Earth | 420 → 1,260 | Reaper second wave 55 → **165 s** |
| Defence of Palaven | 420 → 1,260 | Reaper flank group 70 → 210 s; Alliance detachment 60 → 180 s |
| Fall of Thessia | 420 → 1,260 | — |
| Defence of Sur'Kesh | 420 → 1,260 | flank group 90 → 270 s (early warning) or 25 → 75 s (late; from the flank, its scenario heading about 30° off its bearing to the enemy) |
| Cerberus Intervention | 360 → 1,080 | — |
| Rannoch | 420 → 1,260 | — |
| Battle of the Citadel | 420 → 1,260 | Alliance Fifth Fleet 40 → 120 s (through the relay); **geometry below** |
| Final Battle of Earth (opening off) | 540 → 1,620 | Reaper reserve 90 → 270 s |
| Alliance Fleet Engagement (reference) | 360 → 1,080 | — |
| Prime/Apex Sol and Palaven Defence | 480 → 1,440 | second wave 70 → 210 s |
| Cerberus Ascendant (Harbinger) | 360 → 1,080 | — |
| Custom battles | default 420 → 1,260; minimum 60 → 180 | per-fleet arrival times as entered (user seconds); the arrival cap applies |
| Campaign engagements (`campaign/engine.ts`) | 420 → 1,260 | hostile fleets every 20 → 60 s; auto-resolve keeps `sim.run()` (200,000 steps = 10,000 s ≥ 1,620 s) |
| Showcase scene and the Final Battle opening (beats) | 400 (scene) → set by B after measuring; the beat table's times stay (`OWNER`) | beat waves keep their beats; the T16 reserve `arrivalTime 110` is beat-synchronised and stays |

All `SIMULATION_ESTIMATE`. The data are rewritten (the numbers in `scenarios/index.ts` and `campaign/engine.ts` are the real seconds); no runtime multiplier is applied to `maxDuration` or `arrivalTime`, so a custom battle's "time limit" still means what the player typed. The reference engagement needed up to 390 s on the prototype against its new 1,080 s limit, so no reference battle ends by the clock (0.12: two of three did).

**The Battle of the Citadel** (decision; `SIMULATION_ESTIMATE` geometry, lore from the scenario's own briefing). The briefing says "Sovereign has docked with the Tower" and "Citadel Fleet (turian and asari) is engaged": the battle is joined at the station when the scenario opens, so it opens inside the band. Nominal positions: Citadel Fleet (Hierarchy) `(−16, 0, −4)` (was `−34`), Citadel Fleet (Republics) `(18, 0, −6)` (was `−40`), geth escort `(0, 0, 36)` and Sovereign `(0, 0, 46)` unchanged, the Fifth Fleet `(0, 6, −70)` arriving at 120 s (capped by Q4). Sovereign's fleet takes `initialOrder: { order: 'hold_formation' }` — it stays docked; Q3 exempts Hold and Defend orders (§3.3) — and the scenario sets **`environmentAnchor: v3(0, 0, 46)`** (nominal km, × S like positions), which A uses to put the Citadel's Tower at Sovereign (§5.8). The Hierarchy line opens 40 nominal (1,600 km = 0.95 × its spinal range) from the geth screen, the Republics 42 (0.95 × 44; the Ascension at 0.875 × 48); Sovereign's beams reach the Citadel Fleet's screen at once and its lines as they close. Measured (prototype, seeds 1–3, both world states): contact at 0.1 s, Sovereign's first shot at 1.0–2.7 s, Sovereign never leaves the Tower (0 km; with the old positions at S = 40 it drifts 1,800–2,800 km from it, and at 0.12 26–37 km), B wins 6 of 6 with 3.4–4.8 % survival (0.12: B in 5 of 6, 3.4–30.6 %; plan with the old geometry: B 6 of 6, 3.4–4.8 %). No test pins this scenario's outcome; T19 records it.

**Beat-driven geometry** (T16's Final Battle opening, AP §4.2–§4.3, and stage B's Showcase scene, AP §5.3; `OWNER` times): the beat times never stretch; the geometry is re-derived so that the beats still happen. A displacement a beat expects within T beat-seconds shrinks, in nominal km, by k² for motion that starts from rest within the beat (acceleration-limited: a Reaper capital needs 17 s to reach top speed) and by k at cruise. Applied to the opening: the Reaper climb into the coalition plane over the 16 s before the volley shrinks from 12 to **1.3 nominal km (53 km)** and T16's rise test to two thirds of the scripted climb; the two lines close only about 6 nominal km between `form_up` (12 s) and the volley (38 s), so the Reaper blockade starts **44 nominal km (1.05 × spinal range)** from the Sword line's centre instead of about 60, which brings the spinal line to 0.9 × its range at the release; the Reaper beams (44 nominal) are then in reach from the start and hold fire until the answer by the beat table's `holdFire: 'beams'`; `clamp(1 / beatScale, 0.85, 1.25)` on the anchor `z` values stays. Scripted `approach` distances that are hull-scale ("a dreadnought broadside at point-blank", 2.5 km) stay; their `seconds` budgets × k, and they fly the Q6 pace (§3.7). T16's tests of the volley (fired ≥ 0.7 × ordered, impacts ≥ 30 % within 3 s) are the check.

### 2.10 Spatial grid

`GRID_CELL_KM` = 10 × S = **400 km** (`SIMULATION_ESTIMATE`; the audit measured no cost difference with a scaled cell, §4.8). The ±512-cell key domain covers ±204,800 km. Queries are padded by the largest displacement of any indexed hull since the last rebuild (F1, §2.11), measured as hulls move, so the grid stays exact whatever moves them: hulls at full speed 0.4–2.4 km per step, a Black Fleet drive run at up to 4 × its engine-scaled top speed (`DRIVE_ATTACK.boostMax`, T14), a hull in a T13 arrival run-in up to 30 km per step (600 km/s entry); every one is far below a cell.

### 2.11 Engine fixes the new speeds require (verified bugs; CORE P1, measured at S = 0.4)

| # | Bug (present at 0.12) | At the new speeds | Fix |
| --- | --- | --- | --- |
| F1 | The grid indexes start-of-tick positions and tests current ones; a hull that moved since the rebuild can be missed (audit §1.5, §4.1: 1 of 11 runs differs from a brute-force scan today) | per-step displacements of 0.4–2.4 km, up to 4 × that in a drive run, 30 km in a run-in | **pad every query by a bound on every position written in the tick**: the grid keeps `padKm`, reset to 0 by `rebuild`; the simulation raises it after every position write between rebuilds — `steerShip` (whatever the goal's `boost`), `runIn`, any scripted placement — to `max(padKm, \|pos − prevPos\|)` (`prevPos` is the indexed start-of-tick position of a hull that moves this tick); `queryRadius`, `anyWithin`, `querySegment` boxes and the `nearest` shell bound are padded by `padKm`, and so is the projectile sweep's pad. Exact by construction (no static speed bound to keep in step with T14, T13 or later movers); identical to brute force at any cell size (audit: 11 of 11). Hulls created later in the tick (launched craft) stay unindexed until the next rebuild, as today |
| F2 | The projectile sweep tests the round's step segment against each candidate's **end-of-step** position, though the candidate moved during the step | a destroyer moves 1.07 km per step against an 80 m sphere, an Oculus 2.4 km against its 50 m sweep sphere | test the round's motion **relative** to the candidate over the step: segment from `p.prevPos − s.prevPos + s.pos` to `p.pos` against the sphere at `s.pos`; the query pad includes `padKm` |
| F3 | A round fired during a tick is aimed from the target's current position — end-of-step if the target already moved this tick, start-of-step if not — and then advanced a full step in the same tick: the round and the target run on time bases one step apart (error = target speed × 0.05 s: 72 m for an Oculus today against its 50 m sweep sphere) | 2.4 km for an Oculus; 0.5 km for a Reaper capital | a round leaves at the end of the tick from the shooter's end-of-tick position, aimed from the target's end-of-tick position (its current position plus `vel × SIM_DT` when it has not moved yet this tick, known from a per-hull `movedTick`), and starts flying in the next tick's projectile update. Measured: impacts on destroyers per rolled slug hit at them 0.92–1.07 (0.12: 0.89–1.09, strays included; at the new speeds without F2 and F3: 0.69–0.83) |
| F4 | Recall and rearm fly a transit goal at full speed **through** the carrier; rearming counts only inside 1.5 × the carrier's length. The scripted stand-off `approach` (T13, not `passThrough`) has the same shape: a transit at full speed until within `km`, then a station goal | overshoot v²/2a = 165 km for a Trident against a 1.35 km rearm radius: craft never rearm; a destroyer ordered to 2.5 km of a dreadnought overshoots by 128 km | recall, rearm and the stand-off `approach` become station goals from the start (`velocity:` the carrier's or the target's velocity, the braking curve `√(2 a d)`), so the mover settles alongside |
| F5 | Proximity events are sampled at step ends: strafe-lane waypoints (0.25 km), scripted `approach` within `km`, recovery (`lengthKm`) and rearm (1.5 × `lengthKm`) | craft cover 2.3–2.4 km per step | test the swept step segment (closest approach between `prevPos` and `pos`, in the carrier's or target's frame) |
| F6 | `relSpeedPenalty = max(0.55, 1 − closing / projectileSpeed)` compares simulated speeds; with V ≠ P the ratio would change | V / P = 0.099 × today's | evaluate it in nominal units: `closing / HULL_SPEED_SCALE` over `projectileSpeed / ROUND_SPEED_SCALE` (or `/ MISSILE_SPEED_SCALE`); identical to 0.12 at any S, k |

**What P1 moves at S = 0.4** (prototype with F1–F4 and F6 at 0.12's scale; F5 not prototyped). Every pin of `tests/battle.test.ts` holds (canon 7/8/9 B with 1 / 1 / 1 Reaper capitals, 4.9 / 5.9 / 5 %; Apex 7/8/9 A with 9 / 14 / 11 lost, 4 / 7 / 6 dreadnoughts, 69.8 / 46.4 / 57.4 %); the **Oculus screen pins fail on two of three seeds** (seed 2: 18 Oculi lost against ≥ 20 and 3 Tridents against 8–23; seed 3: 7 Tridents), because F2–F4 let the Tridents' rolled hits land and the craft rearm; the 1-cruiser-vs-destroyer band moves to 8 of 20 (pin 3–12). Unpinned outcomes move too: reference canon 7 ends at 259 s instead of 324 s; Apex survival drops 5–12 points; Sol Defence 86 → 60 %; the canon Final Battle 72.5 → 55.3 % (A both). The audit measured F1's padding alone moving reference canon 8 from the 360 s limit to 334.2 s (B, 45 lost against 44). P1 therefore re-pins the Oculus screen (lead sign-off, §2.13) and records the rest in CORE_PROGRESS before the scale changes, so the fixes' effect is recorded apart from the scale's.

### 2.12 What does not change, and why balance is preserved

Unchanged: the catalogue (§2.2), the combat timers (§2.8), the damage, barrier, armour, heat and HADES models, the hit-probability formula (`damage.ts`: range enters as distance ÷ range), the firing-solution model (`solutions.ts`: distance ÷ main range, the target's acceleration fraction, per-second rates), doctrine fractions (§2.5), the Reaper AI rules (T12), `SIM_DT`, seeds and every random draw.

Why the outcomes hold (`SIMULATION_ESTIMATE` argument, measured in §1.5): (1) uniform S and `SLOT_COMPRESSION = 1.375 × S` keep every geometric relation of 0.12 exactly — standoff bands, formation extents against ranges, point-defence overlap, the screen ahead of the line; (2) the hit model sees only range fractions and (after F6) the nominal speed ratio; (3) G4 = 0.988 keeps the physical misses of rolled hits; (4) cadence-limited kills keep their per-second rate. What moves: (a) **manoeuvre against cadence** (× 3): more shots during the approach and repositioning, which favours the longer reach (canon Reapers; Apex Titans) — measured: canon Reaper capitals lost 2 / 2 / 1 against 1 / 1 / 2, survival 3.6–4.4 % against 4.9–5.7 %; Apex survival 66.9–79.5 % against 58.1–74.9 %; (b) **blocking and strays vanish** (G8): at 0.12, 6–17 % of rolled hits on Reaper capitals struck another hull first and 4–11 % of misses struck something (audit §3.6); at S = 40 hull cross-sections are 1 % of the spacing; (c) **reinforcements engage on arrival, facing the enemy** (§3.4, `OWNER` §21.4) — scenarios with late waves get harder for the side receiving them (Sol Defence survival 86 → 54 %; canon Final Battle 72.5 → 57 %, A both); (d) **wide lines engage in ranks** (Q1b) — in the prototype only the Apex Final Battle's Alliance line wrapped among the eleven runs; (e) F1–F6 (bug fixes, measured on their own in P1).

### 2.13 Calibration re-pin plan for CORE T19

After the pass (and after the §21 rules), T19 runs `scripts/calibration.ts` and the new `scripts/pacing.ts` (§7.2) and re-pins **inside the AP §3.5 lever order** (solution floor 0.2–0.35, destroyer barrier 900–1,100, capital regeneration 1,000–1,100, capital beam cooldown 6.0–7.5; Apex: organic multipliers, then `HADES_WARHEAD.damage`, then `apex_hyper_ma.specialAmmo`; never the capital's pools below 7,000 / 12,000, never `reaper` tech). Every pin is set from **at least three seeds** of the post-§21 engine, like the pacing bands of §7 (T13 already measures Apex 10–12). Fixture re-definitions are marked **[lead sign-off]**: they change what an AP §3.5 fixture measures, so the lead approves them in INTEGRATION_NOTES before T19 lands them.

| Pin | Prototype | Expected T19 action |
| --- | --- | --- |
| Reference canon 7/8/9: B, Reaper capitals 1–2, survival < 30 %, Reapers not destroyed | B, 2 / 2 / 1, 3.6–4.4 %; seeds 10–12: 3 / 2 / 2 | none on 7/8/9; seed 10 shows the upper edge, so measure 7–12 before keeping the band |
| Reference Apex 7/8/9: A, all Reapers destroyed, 7–19 lost, ≥ 1 dreadnought, < 85 % | A, 16 / 17 / 16, 4 / 3 / 2, 66.9–79.5 %; seeds 10–12: 21 / 15 / 27 lost, 0 / 2 / 3 dreadnoughts, 84.9 / 79.9 / 66.1 % | measure 7–12; seed 10 lies on the dreadnought boundary T12 called a coin flip; 27 lost on seed 12 is outside 7–19, an unpinned seed |
| Battle of Earth 42: B, > 5 destroyed, drones before 30 s, Trident median life ≥ 55 s | B, 8 destroyed, drones at the 0.12 launch times | re-measure the Trident life (craft fights last longer) |
| Isolated barrier bench (pure helper) | unchanged by construction | none |
| 4 dreadnoughts kill a muted capital ≤ 90 s (40 nominal km duel, closing) | **66.0 s on the unchanged fixture** (0.12: 39.7 s) | none: with 0.12's formation geometry the AP §3.5 fixture passes as it stands (the first draft needed a re-definition) |
| 2 dreadnoughts never take the barrier below 50 % in 300 s | 0.707 over 900 s | the window becomes 900 s (k × 300) **[lead sign-off]** |
| Cruiser vs destroyer 3–12 of 20; dreadnought kills a destroyer ≤ 40 s; four frigates ≤ 6 of 10; two cruisers ≥ 8 of 10 | 4 of 20 (0.12: 6; after P1: 8) | re-measure; approach-free fixtures for the time pin **[lead sign-off]** |
| 4 armed dreadnoughts lose ≥ 1 every seed and kill ≤ 2 of 5; six kill ≥ 4 of 5 | 0 kills, 4 lost each (as 0.12) | re-measure the six |
| Oculus screen 1–3: last craft death 60–120 s, Oculi lost ≥ 20, Tridents 8–23 | 123 / 101 / 156 s; Oculi 17 / 24 / 24; Tridents 24 / 12 / 20. After P1 at 0.12's scale: 73 / 86 / 68 s; Oculi 24 / 18 / 24; Tridents 13 / 3 / 7 | re-pinned in P1 and again here: the window × k (60–360 s) **[lead sign-off]**; T19 measures seeds 1–6 and pins the band it gets; the craft numbers (Oculus hull 48, fighter gun 6 points) are catalogue values this plan does not touch, so a lopsided screen is a T19 finding for the lead |
| Firing solutions: < 25 % in the first 6 s, > 60 % over 20–40 s (2 DN, muted capital, 40 nominal km, closing) | 0 % and 45 % on the closing fixture (the line is still closing at 0.8 × range at 40 s) | hold the line at 0.7 × spinal range (29.4 nominal km, `hold_formation`), as the owner's check says ("after 20 s of tracking on an unmanoeuvring target"); measured on seed 1: 0 % and 75 % (seeds 2–3: 33 / 0 % and 70 / 80 %); seed 1 as `tests/solutions.test.ts` **[lead sign-off]** |
| Heat: no Alliance dreadnought overheats in the canon reference | — | re-measure (more shots at long range) |
| Final Battle canon 1 (unpinned) | A at 388 s, 57.4 % (0.12: A at 186 s, 72.5 %) | record |
| Battle of the Citadel (unpinned) | B in 6 of 6 (seeds 1–3, both world states), 3.4–4.8 % | record |

Then `CALIBRATION_REPORT.md` §2 records "after pacing" before "after calibration", and T19's commit regenerates the threat table (§2.15).

### 2.14 Where the prototype's numbers come from

Session scratch copies of `src/` at `58b6a4b`, outside the repository and not committed, with §2.1–§2.11 and §3 applied (Q5 and Q6 excepted); the eleven runs, the extra seeds of §1.5, the duels of `tests/calibration.test.ts`, the Oculus screen, the held solutions fixture, the ladder battle at 300 v 100 and 600 v 600, and the Battle of the Citadel at seeds 1–3. The first-draft rows of §1.5 come from the same scripts with `SLOT_COMPRESSION = S`. CORE's own measurement in P6 (§8) supersedes every number here.

### 2.15 Stage T's threat table

Release 0.12.1 shipped stage T's measured "Threat to the Reapers" table (`src/timelines/threatMeasured.ts`, `docs/apex/TIMELINE_THREAT.md`; design `TIMELINES_V2.md` §1). Three of its parts meet this plan:

1. **Its clock assumes V = S.** `THREAT_MAX_DURATION = round(3.2 × THREAT_STANDOFF / reaper_capital.maxSpeed)` (`src/scenarios/threatReference.ts:32`) = round(3.2 × 59.9 / 0.8) = 240 s divides nominal km by nominal km/s. At k = 3 a Reaper capital needs 225 s just to cross the 59.9-nominal-km standoff (2,396 km at 10.67 km/s), so nearly every reference battle would end by the clock. P2 derives it from the simulated quantities: `Math.round((3.2 * THREAT_STANDOFF * BATTLESPACE_SCALE) / (SHIP_CLASSES.reaper_capital.maxSpeed.value * HULL_SPEED_SCALE))` = **719 s** at S = 40, k = 3 (240 s at 0.12). `THREAT_STANDOFF` stays nominal.
2. **Its fingerprint hashes `src/simulation/constants.ts`** (`threatReference.ts:208`, `simulation: { ...SIM_CONSTANTS }`), so P2 turns `tests/alternateTimelines.test.ts` ("was measured from the current catalogue and presets", line 573) red until the table is regenerated; the `THREAT_SCALE.maxDuration` test turns red with item 1. **P6 regenerates the table** with `npm run timeline:threat` on the paced engine, in the same commit as P2–P5, so no commit of the pass is red: the run re-bases by rule 3 of `TIMELINES_V2.md` §1.8 (`THREAT_MAX_DURATION` changed) and writes both files (about 2.5 × the 0.12 wall time: 139 s for 400 battles on 4 jobs then, ≈ 6 minutes now).
3. **Declared tiers and levers** ("every new timeline measures in its declared tier", "every new timeline's lever was measured at both ends") follow `TIMELINES_V2.md` §1.8: CORE applies rule 1 (one lever step at a time with `npm run timeline:threat -- --only <id>`, mechanical) and rule 2 (never a threshold, a preset's numbers, the formula or the reference to rescue a label); when a lever runs out (rule 3: a declared tier with a story change), CORE stops and reports to the lead, who routes it to stage T; the pass never lands with a tier test red or weakened. The run's time-limit share must stay ≤ 25 % (`THREAT_TIME_LIMIT_BOUND`; the generator exits 1 above it).

**After T19** (owned step "T19 threat", CORE): T19 changes catalogue values, so its commit regenerates the table again on the final engine and re-checks declared tiers and lever ranges by the same rules; the UI's threat badges read the table and follow. The release gate's `--check` (`TIMELINES_V2.md` §4.14) then confirms it.

## 3. Anti-queueing rules

"Longer distances must not recreate Reapers queuing out of weapons range" (`OWNER`, brief §19.2) and "no fleet idles … a fleet out of every weapon's range for more than 20 s after contact advances", "every hull of the fleet engages" (`OWNER`, brief §21.4). Queueing at 0.12 came from reinforcement waves arriving 2.5 ranges out, wide organic lines against compact Reaper groups, absolute leashes (at large S) and carriers by design (audit §3.4, §4.3). The rules, all `SIMULATION_ESTIMATE`:

### 3.1 Formation extent against range (Q1, Q1b)

**Q1.** Formations keep 0.12's size relative to ranges exactly (§2.4): line abreast 2.52 × 0.29 fleet ranges, defensive screen 0.92 × 0.55, Reaper wedge 0.80 × 0.21. A Reaper wedge 0.8 ranges wide and 0.21 deep has every hull in reach of the enemy's line when its anchor is within about 0.8 × its range; an organic line wider than its range has wings out of reach of a compact Reaper group, which Q1b, Q2 and Q2b handle. Starting formations are at most 0.55 × their fleet's range deep (line abreast 0.29, defensive screen 0.55, strike wedges 0.21–0.48), so a rear hull reaches range at most 0.55 range ÷ closing speed ≈ 50 s after the front; the layered line (0.85), columns and the descending swarm (up to 0.96) are deeper and rely on Q2, Q2b and Q3.

**Q1b. No line wider than three ranges.** A line formation's rows grow with the hull count (`line_abreast` puts every frigate in one row: 180 frigates span 25,000 km at the plan's scale, 15 ranges). In `assignSlots`, a tier's row wider than `FRONTAGE_RANGES × R` (3 × the fleet's engagement range, passed in by `deployFleet` and by every re-slot) wraps into further ranks behind its first row: rank r of the tier sits `r × 2.5` (capitals) or `r × 1.5` (cruisers, frigates) nominal km behind it, offset by half a spacing on odd ranks, with the tier's vertical layering kept. Applies to `line_abreast`, `layered_line` and `broadside_line` (the layouts whose rows grow with the count). The reference task force's widest row (31 frigates, 2.6 ranges) stays one row, so none of the canon five changes; in the prototype (the bound fixed at 3 × 1,680 km) only the Apex Final Battle's Alliance line wrapped among the eleven runs (A at 355 s, 89.5 % against 349 s, 89.7 % without Q1b); with the bound at 3 × each fleet's own range, a Titan-armed line wraps later still. Measured on the ladder battle (§1.5): 300 v 100 — 19 of 294 hulls never in range in the 120 s after contact (161 without Q1b), out of range 33 % of samples (77 %); 600 v 600 — 27 of 588, 38 %. Cost: more hulls engaged, so the per-step cost after contact rises with them (§6).

### 3.2 Approach doctrine, leashes and the organic lean (Q2, Q2b)

**Q2.** The approach doctrine keeps its fractions (§2.5): fleets close along their bearing, decelerate over the last 20 % of the run-in and lock their heading inside 1.1 × range; the Reaper anchor closes to 0.4375 × fleet range and never backs off ("Reapers close", `CANON_INFERRED`, `lore-ranges.md` K6); the Alliance and Cerberus spinal line holds 0.875 × spinal range (`OWNER`); escorts screen forward to 0.9 × their own range. Starting separations stay at 1.6–1.9 ranges, so the approach takes k × as long and nobody is in range before it is over. The slot leash (capitals, 200 km = 0.12 × a dreadnought's range) and the screen leash (escorts, 2,000 km = 2.1 × a frigate's range) are re-based (§2.6): the audit's P4L measured exactly this at S = 4 (queueing 20–38 % → 2–4 %, no hull out for more than 60 s). Escorts still close at half speed (the half-speed lean is doctrine; full speed was measured and rejected, §1.5).

**Q2b. An organic hull with nothing in reach for 20 s while its line holds leans in** (`movement.ts`, a new `wingLeanGoal` ahead of `stationGoal` for every non-Reaper hull that holds a station: capitals and escorts in their slots; carriers, frigates on runs, stealth hunters, withdrawing and interposing hulls keep their own goals). Gate: its fleet's heading is locked (the enemy within 1.1 × its range: the fleet is in contact), its order is `attack`, `attack_target`, `advance` or `intercept`, and its anchor holds (anchor speed below 0.1 × the hull's top speed); the 20 s count starts only while all three hold. A hull whose nearest enemy combatant has been beyond its main range for 20 s under that gate (the owner's §21.4 threshold, applied per hull) leans past its leash toward that enemy, to 0.9 × its main range, at half speed (the escorts' pace), facing its target or that enemy; it keeps that lean while its fleet stays locked under the same order, so it never oscillates between the lean and its leash, and returns to its slot when the fleet unlocks or the order changes. Deterministic; no draw. The "anchor holds" gate keeps it out of the closing phase: measured, the gated rule leaves all three canon reference runs identical, changes Apex reference 7 (66.9 % against 74.0 %, one more dreadnought lost) and Sol Defence slightly; without the gate it costs the canon reference a third Reaper capital on seeds 7 and 8 (§1.5). It is the per-hull form of §21.4's "every hull engages", which the fleet-level Q5 cannot give a line whose centre is engaged.

### 3.3 Reapers never idle once engaged (Q3)

`reaperAdvanceGoal` (AP §10) fires today only while the anchor has stopped. New gate: **while the fleet's heading is locked (the enemy within 1.1 × its range) or the anchor has stopped**, a Reaper hull with no target in its main range closes on the nearest enemy combatant to 0.8 × its range at 0.6 × top speed — **except under a Hold or Defend order** (`hold_formation`, `defend_position`: brief §21.4 exempts a held fleet; scripted Reaper holds such as the Final Battle blockade before `reapers_advance` and the docked Sovereign of §2.9 then hold). No fleet of the eleven runs starts under Hold or Defend, so the exemption leaves them unchanged. The loose cluster therefore spreads to bring every hull into reach while the anchor is still closing. Measured: longest idle-out-of-range spell of any Reaper hull after its fleet's contact **0–4 s** in all eleven runs (0.12: 0 s); longest out-of-range spell, closing included, 16–39 s (0.12: 5–35 s).

**Cost.** The broadened gate calls the nearest-enemy search for every out-of-range Reaper hull on every tick while its fleet is locked; `nearestEnemyCombatant` is a linear scan of the enemy combatants, which reaches O(N²) per step at 600–1,000 per side. CORE implements the search with the grid: `SpatialGrid.nearest(p, filter, accept?)` gains an optional predicate evaluated in the grid's deterministic candidate order (combatants only: no small craft, and a silent stealth hull only within its detection range, as `enemyCombatants` does today), and Q3 and Q2b refresh their nearest enemy on the hull's decision cadence (`aiTimer`), reading its live position each step in between. Same choice as the scan, by test (T-P8 runs the comparison).

### 3.4 Reinforcements arrive in reach, facing the enemy, at the battle's pace (Q4)

- **Arrival cap.** A fleet deployed after t = 0 by its scenario `arrivalTime`, a custom battle's per-fleet arrival time or a campaign wave (not a beat `spawn_wave`, whose geometry the beat table owns) drops out at its scenario bearing but **no farther than 1.1 × its fleet engagement range from the point-weighted centroid of the live enemy combatants** (`deployFleet`: anchor moved along the line from that centroid to the scenario position, before the hulls are placed on their slots). At 0.12 the second waves deployed 2.5 ranges out and were 79–100 % out of range for their first 30 s (audit §3.4).
- **Lower bound.** If the capped anchor lies within **0.9 × that range of the nearest live enemy combatant** (a wide line or several enemy fleets put the centroid far from every hull, or inside the forward screen), the anchor moves back out along the same line until it is 0.9 × the range from it, never past the scenario position.
- **Facing.** Whenever the arrival's anchor ends within 1.1 × its range of that centroid (capped or not), `fleet.heading` and `fleet.approachBearing` are set to the flat bearing from the anchor to the centroid before the hulls are placed. Without this, the cap radius equals the heading-lock radius (`lockRangeFactor` 1.1 × the same `fleetEngagementRange`): the fleet locks on its first steer with its scenario heading and keeps an oblique line until the enemy is more than 60° off for 24 s. Deterministic (no draw).
- **Arrival times × k** (§2.9): a reserve that joined the fight 55 s into a 0.12 battle joins 165 s into the stretched one, i.e. at the same phase of the battle. Without it the Battle of Earth's second wave joined before the main exchange and doubled the first wave (§1.5).

Measured with facing and the lower bound (against the cap alone): Battle of Earth 42 B at 303 s (297 s); Sol Defence 53.5 % (55.8 %); canon Final Battle A at 388 s, 57.4 % (355 s, 65.9 %) — the arriving fleets fight from their first second.

### 3.5 Organic no-idle and the §21 rules (Q5)

The fleet-level rule of brief §21.4 (a fleet out of every weapon's range for more than 20 s after contact advances) is CORE's §21 task in the same chunk; Q2b covers the hulls of a fleet whose centre is engaged. Measured before Q5: longest idle-out-of-range spell of an organic line hull (carriers, withdrawing hulls and stealth hunters excluded) 0–21 s in the eleven runs, 6–7 s in the ladder battles.

**Writing the §21 constants under either order.** CORE may meet this plan before or after it has written the §21 rules. Either way, every new §21 quantity is classified like §2.6–§2.8. A **distance** is a fraction of a range or nominal km × S: the critical withdrawal's "leaves the battlespace" test (for example, a hull counts as gone beyond 1.5 × the longest enemy main range from every live enemy combatant — a fraction of ranges), the Reapers' fighting-withdrawal stand-off and the no-idle advance distances (fractions of range), Attack's lateral and vertical lane spacing (nominal formation km × `SLOT_COMPRESSION`, like the slots it opens); a distance stays in km only when it is physical and hull-scale (a clearance between hulls, a hit or blast radius). A **travel or manoeuvre time** is × k (the withdrawal's leg timers, a re-form or re-slot budget). A **combat or owner time** stays (the owner's 20 s, 75 % and 15 % thresholds, firing and reveal timers). If §21 landed first, P2 converts its constants by this rule and P5 its test literals; if it lands after, it is written at the new scale.

### 3.6 Exempt by design

Carriers and liveships (keep-out 0.8 × the enemy's main range beyond their own broadsides), hulls in tactical withdrawal, stealth hunters shadowing, fixed platforms, fleets under Hold or Defend orders, and the mop-up of the last one or two hulls (the measures count while the enemy fields at least three).

### 3.7 Scripted hull-scale moments (Q6)

The rule of cool (brief §3: "a dreadnought broadside at point-blank", "a fighter wing threading a Reaper's arms", forced by the script when it cannot happen naturally), the T16 beats and stage B's Showcase scene need moments that last seconds at hull scale, where hulls now pass in frames (§1.4). The simulation paces them; the renderer never slows anything.

- **Scope:** the movement of a hull under a scripted move — `Specials.approach` (stand-off or `passThrough`) and `Specials.strafeThrough` (T13), which the beats and scene scripts use. AI manoeuvres (frigate runs, fighter passes, stealth hunts) keep full speed: they are combat.
- **The zone:** within `SCRIPTED_PACE_ZONE_KM = max(5 × the subject's length, 10)` km of the scripted move's subject (hull scale; 10 km for a Reaper capital or a dreadnought).
- **The pace:** inside the zone the mover's velocity is the subject's velocity plus at most `SCRIPTED_PACE_REL_KMS = 1` km/s toward its next waypoint (a relative transit; a new optional `MovementGoal.relative?: { velocity: Vec3; maxSpeed: number }`, honoured by `steerShip` within the hull's own acceleration limit); outside it the mover approaches the zone's entry with the braking curve so that it enters at that relative speed (a station goal on the entry point moving with the subject; F4's shape). A stand-off `approach` settles on its stand point (F4).
- **What it gives:** a Trident threading a Reaper capital's strafe lane (≈ 2 km) takes ≈ 2 s, ≈ 10 s inside the zone; a destroyer closing to 2.5 km of the *Kilimanjaro* settles over ≈ 10 s. The beats' and scenes' `until` budgets grow by k plus the zone time (§2.7).
- **Determinism:** no draw; the same in every playback mode. `SIMULATION_ESTIMATE` (a presentation rule of scripted scenes, like the scripts that force events). Tested by T-P15.

### 3.8 Bounds (tested, §7)

| Measure (after the hull's fleet's contact or arrival, enemy ≥ 3 hulls) | Prototype | Threshold |
| --- | --- | --- |
| Reaper hull idle out of range (not closing at ≥ 0.25 × top speed) | ≤ 4 s | ≤ 10 s (hard) |
| Reaper hull out of every weapon's range, closing or not | ≤ 39 s | ≤ 60 s (hard) |
| Organic line hull idle out of range | ≤ 21 s; ladder ≤ 7 s | ≤ 30 s (hard: the 20 s trigger plus start-up) |
| Reaper line out of range, mean after contact (Battle of Earth 42, reference canon 7, Apex reference 7) | 12.5 / 4.9 / 11.4 % | band from P6, ≥ 3 seeds (first-draft guess 15 %) |
| Ladder battle 300 v 100, organic hulls never in range in the 120 s after contact | 19 of 294 (6.5 %) | band from P6 |

## 4. Firing at range

### 4.1 The model across the bands (unchanged formulas)

| Distance ÷ weapon range | 0.25 | 0.5 | 0.75 | 0.9 | 1.0 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hit-probability range factor `1 − 0.45 f²` | 0.97 | 0.89 | 0.75 | 0.64 | 0.55 |
| Solution build-rate factor `1 − 0.5 f²` | 0.97 | 0.88 | 0.72 | 0.60 | 0.50 |
| Dreadnought round flight (s) | 0.10 | 0.21 | 0.31 | 0.38 | 0.42 |

The exchange now spends its first decisive minutes at 0.85–1.0 × range (§1.5): there a fresh solution (q₀ 0.10) gives `p × (0.25 + 0.75 q)` at a quarter of the open-range probability and builds at half rate, so opening salvoes mostly miss and stream on to 2.2 × range (3,700 km), concentrated fire arrives as solutions mature and the lines close — brief §8.7's behaviour, now over minutes and a thousand-plus kilometres. Measured (impacts of ≥ 600 points per spinal shot, the calibration harness's measure): 0.35–0.46 in the canon five against 0.49–0.61 at 0.12 (strays and the outer band); Reaper capital beams 0.36–0.43 against 0.37–0.45.

### 4.2 Evasion (the physical intercept)

A rolled hit is aimed at the constant-velocity intercept; a target that accelerates during the flight drifts `½ a t²`. With A and the flight time both rescaled (G4), the drift is the 0.12 drift in metres (destroyer 155 m against its 80 m sphere at full lateral thrust; Reaper capital 54 m against 1 km; Oculus 29 m against its 50 m sweep sphere at full fighter-gun range), so the share of rolled hits that fly past stays where it was calibrated (audit §3.6: 0–3 % on destroyers), once F2 and F3 remove the step-timing errors (§2.11). Small agile hulls remain the hardest to hit, as the lore expects (`lore-ranges.md` §4 item 2). Hard manoeuvres still cost every solution on the target 0.2 once; because manoeuvres last k × longer there are fewer of them per minute, a small shift toward the shooter that T19's solution-floor lever covers.

### 4.3 Relative speed

`relSpeedPenalty` is evaluated in nominal units (F6), so a fast crossing target costs a slow round exactly what it did at 0.12 (the term is ≥ 0.55; for slugs against capitals it stays at 0.97–0.98).

### 4.4 Blocking and stray hits

At S = 40 the escorts' cross-section is about a hundredth of the spacing: rounds aimed at a Reaper capital are no longer intercepted by its screen or by T12's covering destroyers (which still interpose on the line and still draw fire as targets); misses no longer strike neighbours. Both effects were measured at S ≥ 4 (audit §4.2: blocked 0–2 %, strays 0–2 %). This also gives brief §21.4's "clear firing lanes" almost for free (§7, T-P10).

### 4.5 Beams stay hit-scan

The lore gives the Reaper and Thanix streams only "a fraction of light speed" (`lore-ranges.md` V6, V8): at 0.05–0.5 c the 1,760 km reach takes 0.01–0.12 s, under three simulation steps, so a travelling beam would change little and cost a model; it stays hit-scan (`SIMULATION_ESTIMATE` decision). The renderer may draw the stream's front crossing the gap in up to 0.1 s as a visual liberty (§5.6), never delaying the damage.

### 4.6 What the player sees

At 1.1–1.5 × beam reach the Reapers open on the screen; frigates and cruisers close under fire for a minute or more (they must "survive into effective range", `lore-ranges.md` K5); dreadnought volleys at 1,500–1,700 km take 0.4 s to arrive, most early rounds miss by kilometres and fly on; the capital lines exchange for minutes at 0.85–1.0 × range before closing to about 0.75.

## 5. Rendering and camera (stages A and B; render-side only)

Nothing below changes the simulation: the camera sees true simulated distances; ships are made trackable by presentation (brief §19.2, `OWNER`). Numbers for a 1080p screen, 50° vertical field of view (≈ 21.6 px per degree). Render unit 100 m; positions = simulation km × 10.

### 5.1 Scale of the scene (A)

Battle extents grow to about ±3,000 km (±30,000 units). **Floating origin:** world-space float32 data (instance matrices, the far point cloud, tracer and effect buffers) lose 0.2–0.4 m at 20,000–40,000 units; a chase camera 340 m behind a fighter would see that as 1–2 px of jitter. Each frame A subtracts a camera-anchored origin (the focus rounded to 10 km) from every position written to a float32 buffer and offsets the scene root, so values near the camera stay small; meshes already compose model-view matrices in float64 (audit §6). The five models drawn shorter than their simulated hulls (Reaper capital 1.54 against 2.0 km, Harbinger, Reaper destroyer, Alliance cruiser, Cerberus dreadnought; audit §6) are corrected in the likeness pass so the range-to-hull ratio reads true.

### 5.2 Camera limits, views and motion (B)

| Item | 0.12 | Plan |
| --- | --- | --- |
| Far plane | 600,000 units (60,000 km) | unchanged (the battle spans ≤ 6,000 km; the distant layer ≤ 16,000 km; starfield, sun and moons follow the camera) |
| Near plane | `clamp(0.002 d, 0.2, 50)` units from the focus distance d | unchanged in tactical and orbit views; **in POV shots (Gunnery, Target, Reaper; brief §20) and close chase shots, set from the nearest visible geometry**: at most half the distance from the camera to the nearest point of the shooter's or subject's bounding sphere, floor 0.01 units (1 m). Today a POV looking 1,500 km away gets 30 units (3 km) and clips the shooter's own bow; the logarithmic depth buffer keeps the precision (§5.7) |
| Zoom (`CameraRig.zoom`) | 6–60,000 units (0.6–6,000 km) | **6–150,000 units** (to 15,000 km) |
| Opening view (`bind`) | 320 units (32 km) from the player's fleet centre | tactical view of the player's fleet with markers at 0.6 × its frontage (≈ 1,800 km), then the director's establishing shots |
| Command view | ≥ 1,200 units | ≥ 0.6 × the battle's extent (≈ 2,000–4,000 km) |
| Follow / chase distance | `(size × 2.4 + 3) × clamp(distance / 320, 0.35, 5)` (`cameras.ts:150-161`) | `(size × 2.4 + 3) × followZoom`: a follow zoom of its own (0.35–5, the wheel in follow mode), **decoupled from the tactical zoom**, which the new ~18,000-unit opening view would pin at 5 |
| Follow, Reaper and cinematic motion | `CameraRig.apply` lerps position and look-at with `1 − e^(−9 dt)` (`cameras.ts:223-238`): a first-order lag of v / 9 s behind a moving subject | **smoothed in the subject's moving frame**: each frame the camera position and the current look-at first move by the subject's displacement since the last frame, then the offset is damped as today. The lag of v / 9 would trail a Reaper capital (107 units/s) by 12 units, a frigate by 21, a Trident (453 units/s) by 50 — more than the 1.2–35-unit follow distances, so subjects would drift off-centre or leave the frame (0.12: a Trident lagged 1.5 units) |
| Free flight | 600 / 2,500 units/s | add a third speed, 25,000 units/s (2,500 km/s) |

### 5.3 Markers, impostors and LOD by projected size (A, B)

Framing both fleets (≈ 3,500 km, camera ≈ 2,100 km) makes a Reaper capital 1.2 px and a frigate 0.1 px. Two render-side layers, drawn in screen space:
- **Markers**: the far point cloud (`battleView.ts`, 2,048 points) switches to `sizeAttenuation: false` with a pixel size by class — capital 7 px, cruiser and destroyer 5 px, frigate 3.5 px, craft 2 px (flights one marker) — faction colour, a selection bracket and the overlay's labels; it replaces the 0.12 behaviour in which every far hull was the GPU's 1 px minimum point (audit §6).
- **Impostors**: between the reduced mesh and the marker, a hull is drawn as its class silhouette sprite (pre-rendered, oriented to its heading) at `max(true projected length, 12 px)` for capitals and `max(…, 6 px)` for escorts — "cinematic scaling" (brief §19.2), recorded by D as a visual liberty like the fighters' 2× scale; the cost is one instanced quad per hull.
- **LOD by projected size** (`lod.ts`): `lodLevel` today switches on distance in model lengths only (70 / 700 lengths) and on absolute render distances for craft (`FIGHTER_REDUCED_DISTANCE` 30, `FIGHTER_POINT_DISTANCE` 90 units), so it ignores the field of view: B's telephoto Gunnery and Target POV (brief §20) frames a 2 km Reaper at 1,500 km (750 lengths) in a 0.15° view, where it fills about 550 px, and today's rule would draw it as a point. The plan selects by the projected length in pixels, `P = lengthUnits / (distance × tan(fov / 2)) × viewportHeight / 2`, for hulls and craft alike: full detail at P ≥ 16 px, reduced at 4–16 px, impostor at 1–4 px, marker below 1 px (each switch cross-faded). At the 50° default view on 1080p, 16 px is today's 70-length switch and 4 px and 1 px fall at about 290 and 1,160 lengths (the first draft's 350 and 2,000 lengths were 3.3 px and 0.6 px); craft use the pixel values that reproduce today's 30 and 90 units for a Trident at its drawn size at the default view; the Ultra `distanceScale` divides the pixel thresholds. `lodLevel` takes the camera's fov and viewport height.

### 5.4 Shots (B)

| Shot | At the new scale |
| --- | --- |
| Gunnery POV / Target POV (brief §20) | the target 1,000–1,800 km away is a telephoto view: field of view 0.05–2° (a 2 km Reaper fills 550 px at 1,500 km and 0.15°, drawn at full detail by §5.3's rule); reticle, range, intercept time (0.3–0.42 s) from the simulation's telemetry; the round's streak shrinks toward the target over 20–25 frames; near plane from the nearest geometry (§5.2) |
| `longLens` (AP §5.2, fov 8–18°, distance ≥ 40 × size) | frames one ship and its neighbours (≈ 140–180 km apart) or a fleet's depth; an exchange pair 1,500 km apart is a split screen or a rack from shooter to target, never one wide frame |
| Establishing / distance shots (director W1–W4, D1–D2) | markers, impostors and tracer streaks (brief §4's "walls of light" at 1,000+ km) |
| Fly-bys and chase | ships move 5–48 km/s: a static camera sees a dreadnought cross its own length in 0.1 s and a Trident cross a 2 km Reaper in 0.04 s; cameras move with the subject (§5.2); scripted hull-scale moments are paced by the simulation (Q6); the director may use the render-side slow motion of brief §16.3 / §20.7 for a replay, never slowing the simulation |
| **Fighter screen ("chase cam through the furball", brief §2, 50–80 s)** | craft fight at 140–160 km and meet at up to 93 km/s, so there is no hull-scale furball to fly through: the shot is a **chase on one flight** (subject-frame camera) with the opponents as markers and tracer streaks — a marker-and-streak shot — followed by the pull-back to the distance shot. A hull-scale furball needs option (c)'s short craft layer (§9) |
| Arrival flashes (T13) | the run-in starts at 600 km/s and settles in 3.5–6 s: a streak and a flash 700–1,200 km behind the slot |

### 5.5 The far cloud and the impostor layer (A)

At 0.12 the point switch sat at 700 model lengths (Reaper capital 1,078 km, frigate 119 km) and was rarely reached; at the new scale the impostor and marker layers are the normal state of a tactical view, and a telephoto view keeps full detail (§5.3). `MAX_FAR_POINTS` 2,048 stays; the distant layer (T15) keeps its sprites at its converted distances (§2.6).

### 5.6 Tracers and beams (A)

| Effect | 0.12 | Plan |
| --- | --- | --- |
| Heavy / light tracer width | 11 m / 4.5 m world (sub-pixel beyond 13 km / 5 km) | screen-space minimum 1.5 px / 1 px with additive glow, world width when larger |
| Tracer length | `max(150 m, 0.06 s of flight) × 1.3` (940 m for a dreadnought round) | the round's per-frame displacement × 2 (≈ 130 km at 60 fps for 4,025 km/s), clipped at the target |
| Beam core / glow | radius 11.7 m / × 3.2 (sub-pixel beyond 27 / 87 km) | screen-space minimum 1.5 px core, 4 px glow; the stream's front may cross the gap in ≤ 0.1 s (visual liberty, §4.5) |
| Barrier ripples, impacts, explosions, debris | hull scale | unchanged |

### 5.7 Depth precision (A, B)

The logarithmic depth buffer stays: with the far plane at 600,000 units and a 24-bit buffer the relative depth resolution is about 8 × 10⁻⁷, i.e. 0.4 m at 500 km and 4 m at 5,000 km — enough at every distance a hull can be resolved. The near plane must change in POV and close chase shots (§5.2); the logarithmic buffer makes a 0.01-unit near plane as precise at range as today's.

### 5.8 Environments, the attitude layer and audio (A)

Every environment is redrawn for a battle 3,000–6,000 km across, from one pair of shared constants (§2.1) that the simulation also uses (T14's planet clearance), so the simulation's planet and the drawn one are the same body:

- **Planets at near-true scale.** Earth at 6,371 km radius (`CANON_INFERRED` geometry); Palaven, Thessia, Rannoch and Sur'Kesh at 6,371 km (`SIMULATION_ESTIMATE`: no radius recorded in the repository); each centred `PLANET_RADIUS_KM + ORBIT_ALTITUDE_KM` = 7,871 km below the battle plane (1,500 km altitude, `SIMULATION_ESTIMATE`). Today's spheres of 1,800–2,100 km radius with their tops 350 km below the plane (`environment.ts` `buildEnvironment`) would sit inside a battle wider than the planet. From 1,500 km the planet fills the lower sky out to 54° from the nadir; line of sight over the limb reaches about 9,200 km (`lore-ranges.md` D6). The one-third Earth that framed a 30 km battle (`LORE_REFERENCE.md` visual liberty) goes; D records the change.
- **Moons** (Luna, Menae) become sky objects at their angular size (camera-relative, like the sun): their true distances lie beyond the far plane.
- **The Citadel.** The model (Presidium ring and ~44 km wards; their figures' provenance is the open point of `lore-ranges.md` §6) is placed so that its **Tower holds Sovereign**: the scenario's `environmentAnchor` (§2.9; nominal km × S, (0, 0, 1,840) km for the Battle of the Citadel) is the Tower's tip. Today it sits about 60 km from the origin while Sovereign starts 1,840 km away. The Serpent Nebula haze stays a sky object.
- **The distant layer** (T15) draws its groups at 6,000–16,000 km with 600–3,000 km spreads (§2.6).
- **Attitude layer** (brief §15.3): bank angle and thruster intensity use the acceleration fraction (`shipMotion.accelFrac`, `|Δv| / (a dt)`) rather than km/s², since absolute accelerations are 11 × larger.
- **Audio** (brief §8.4, §20.5): attenuation over camera distance and the "light before sound" delay use hull-scale reference distances with the delay capped at 0.3 s; impact sounds fire on the impact event (0.3–0.42 s after the shot).

### 5.9 HUD and labels (B)

Ranges, distances and speeds in simulated km with thousands separators ("1,680 km", "8.7 km/s"); the target panel adds the round's time of flight; the battle clock shows minutes (battles of about 3–7 minutes on the prototype; time limits up to 27 minutes).

## 6. Performance

- **Battle length in steps** (the cost driver, audit §4.8): Battle of Earth 5,353–6,052 (0.12: 4,818–4,844), reference canon 5,916–7,801 (6,488–7,200), Apex reference 4,002–4,761 (2,362–3,272), Sol Defence 7,176 (3,134), Final Battle 7,105–7,759 (2,840–3,722). The approach steps are cheap (no projectiles, idle mounts on the 0.25 s retry).
- **Per-step cost:** unchanged with the cell scaled (audit §4.8: 0.4–1.2 ms Battle of Earth, 1.3–2.8 ms Final Battle at S = 0.4 / 4 / 10). Rounds live 1.4 s instead of 3.6 s, so the projectile sweep handles fewer of them; F1's padding and F2's relative test add a few multiplications per candidate; Q3 and Q2b use the grid's nearest on the decision cadence (§3.3), so they add no O(N²) scan. Measured on the ladder battle 300 v 100 from contact on this 4-CPU container (other workflows running): 12.6 ms per step against 11.1 ms at 0.12 over the same phase (+14 %, with 275 of 294 organic hulls engaged against 213); 600 v 600: 58.6 ms. These are prototype figures on a loaded machine; T19's ladder measures the real cost.
- **Measurement windows.** Every performance measure today times a fixed early window that suited 0.12's 11 s contact; at k = 3 the ladder battle (80 nominal km = 3,200 km) reaches contact after about 31 s and its lines engage later still, so the same windows would time the approach — no projectiles, idle mounts — and every budget would read optimistic. Every timed window starts at contact instead: CORE adds a deterministic helper `stepToContact(sim, maxSteps)` (steps headless until the first anti-ship `weapon_fired` of a hull at a hull; the same definition as the playback workstream's Skip to contact), and each harness steps to it untimed, then times its window:

| File | Today | Plan | Owner |
| --- | --- | --- | --- |
| `tests/perf.test.ts:154-176` | scaling: steps 200–600 (10–30 s); smoke ceiling: steps 0–400 | both from `stepToContact`, then 200 warm-up and 400 measured steps | CORE (T19) |
| `scripts/perf-sim.ts` | `--warmup 200 --steps 1200` (10–70 s) | warm-up = `stepToContact` + 200 steps (default; `--warmup` adds to it) | CORE (T19) |
| `scripts/perf.mjs:16` | `while (sim.time < 40) sim.step()` | `stepToContact`, then 30 s more | the playback workstream (its file), or integration |
| B4 `App.measurePerfBudget` (in-browser ladder, 240 frames per row from launch) | approach-only frames | each row stepped headless to contact, then 240 frames | B |

  The AP §21.5 300-vs-100 gate, the 4 × scaling ratio and the stored budgets (`prefs.perf.budget`) are re-measured on these windows.
- **Grid:** 400 km cells; candidate queries over 1.5 × sensor range (≤ 12,000 km) fall back to scanning occupied cells as today.
- **Governor (T18):** render costs move from meshes to markers and impostors (cheaper); tracer count falls with the shorter lifetimes; the ladder's tiers stand, re-measured from contact (above); the `extreme` tier inherits the marker layer.
- **Playback (brief §19.1, playback workstream):** at 8× a battle of 450 s plays in under a minute; Fast-forward to result runs a 9,000-step battle in about 5–10 s headless; this plan asks the playback workstream for one more exact control, **Skip to contact** (`stepToContact`, then resume at the chosen speed; deterministic like the rest).
- **Tests:** battle-heavy files grow by 30–150 % (Final Battle × 2.1–2.5); `tests/pacing.test.ts` runs each battle once and shares it across its `it`s with event-loop yields (no single `it` over 20 s on the 4-CPU container); `tests/batching.test.ts` may compare the first 6,000 steps instead of whole battles if its wall time doubles (identical event logs up to a step prove the same property).

## 7. Acceptance tests

Deterministic, Node (`vitest`, `environment: 'node'`), each battle run once per file through `runSimAsync`. New file **`tests/pacing.test.ts`** (CORE, P5). **Two kinds of threshold:** *hard* thresholds are owner-facing invariants or structure and are pinned as written; *bands* are derived by CORE in P6 from at least three seeds of the post-T18 engine (the pinned seed and two more; the band covers every measured seed with the margin T13 used), and T19 re-pins them like any other balance assertion. The prototype's single-seed values are guides, not bounds.

| # | Test | Threshold | Prototype |
| --- | --- | --- | --- |
| T-P1 | Constants: `alliance_dn_main` simulated round 4,025 ± 0.5 km/s; dreadnought spinal range ÷ Reaper capital length ≥ 800; `HULL_ACCEL_SCALE × (S / ROUND_SPEED_SCALE)²` within 0.40 ± 0.02; every mass-accelerator flight to full range ≤ 0.5 s; torpedo and missile flight times equal to 0.12's (range ÷ speed, nominal); `SLOT_COMPRESSION = 1.375 × S`; no bare km literal in `src/simulation/**` outside the hull-scale allow-list | hard | 4,025; 840; 0.395; ≤ 0.46 s |
| T-P2 | Range-to-hull (Battle of Earth canon 42 and reference canon 7): median capital-to-nearest-enemy-capital distance after contact | ≥ 600 L (hard); ratio to the capital's own range: band | 872 and 764 L; 1.01 and 0.89 |
| T-P3 | Approach: first contact (same runs) | ≥ 30 s (hard) | 33.8 and 35.6 s |
| T-P4 | Contact to the first capital loss (same runs; Apex reference 7) | band | 92.0 and 61.4; 51.4 s |
| T-P5 | Battle duration (Battle of Earth 42; reference canon 7; Apex reference 7) | band; the reference ends before its limit (hard) | 303; 346; 238 s |
| T-P6 | Queueing (§3.8) in the Battle of Earth 42, reference canon 7 and Apex reference 7: Reaper idle out of range; Reaper out of range; organic line idle out of range; Reaper line out of range (mean after contact). Plus the ladder battle 300 v 100 (seed 11) measured from contact for 120 s: organic idle; hulls never in range | ≤ 10 s, ≤ 60 s, ≤ 30 s (hard); mean: band. Ladder: organic idle ≤ 30 s (hard); never in range: band | 2 / 1 / 0 s; 36 / 19 / 16 s; 0 / 0 / 5 s; 12.5 / 4.9 / 11.4 %. Ladder: 7 s; 19 of 294 |
| T-P7 | Arrival (Q4): (a) a custom battle with a side-B fleet at `arrivalTime` 30 s placed 4 ranges out straight ahead: its anchor at arrival ≤ 1.1 × its engagement range from the side-A centroid (+ one step's travel); (b) a flank arrival whose scenario heading is 90° off its bearing to the enemy: at deployment its heading is within 1° of the flat bearing to the enemy centroid and it locks on its first steer with that heading; (c) a multi-fleet enemy (three side-A fleets 2 ranges apart, centroid in the empty middle): the capped anchor ≥ 0.9 × its range from the nearest enemy combatant, never past its scenario position | hard | — |
| T-P8 | Grid exactness (F1): 200 random fixtures with hulls moved after a rebuild by up to `maxSpeed × SIM_DT`, by a drive run's `boostMax × maxSpeed × SIM_DT`, and by a run-in's entry speed × `SIM_DT` (each move reported through the pad as the simulation does) — `queryRadius`, `anyWithin`, `querySegment`, `nearest` (with and without the combatant predicate) identical to a brute-force scan; the Battle of Earth 42 with a brute-force grid identical for its first 2,400 steps; the T14 AI fixture of `tests/driveAttack.test.ts` (3 crippled Cerberus cruisers against a Reaper capital, Apex core, seeds 1–6, its whole 360 s) identical with a brute-force grid, at least one run committed | identical (hard) | — |
| T-P9 | Intercept (F2, F3): a destroyer and an Oculus crossing the line of fire at full speed, each fired at 200 times by a fixture gun whose hit probability sits at the 0.98 cap (a cloned weapon definition with a large `accuracy`); rounds matched to impacts through `projectileId` (T13) | ≥ 95 % of rolled hits strike their target (hard) | impacts per rolled destroyer hit 0.92–1.07 in the battles |
| T-P10 | Firing lanes (with brief §21.4): in the reference canon 7, rolled hits on Reaper capitals that strike another hull first (matched through `projectileId`) | ≤ 3 % (hard) | ≈ 0 (audit S ≥ 4: 0–2 %) |
| T-P11 | Recall, rearm and stand-off approach (F4, F5): a Trident with spent torpedoes rearms within 60 s of reaching its carrier; a recalled flight is recovered; a scripted stand-off `approach` to 2.5 km never takes the mover more than 2.5 km × 1.05 from its target after first reaching it | hard | — |
| T-P12 | Firing solutions (brief §8.7, `OWNER` check at the new scale), **seed 1** as `tests/solutions.test.ts`: 2 dreadnoughts holding at 0.7 × spinal range against a muted stationary capital: < 25 % rolled hits in the first 6 s, > 60 % over 20–40 s; `scripts/pacing.ts` also reports seeds 2–3 pooled | hard (the owner's numbers) on seed 1 | 0 % / 75 % (seeds 2–3: 33 / 0 % and 70 / 80 %) |
| T-P13 | Outcomes stay inside the T19 bounds (the existing `tests/battle.test.ts` pins, re-run unchanged) | T19's | all pass on seeds 7–9 |
| T-P14 | Determinism at the new scale: `tests/batching.test.ts` (1 / 160 / uneven ticks per batch) and a replay of the reference canon 7 give identical events, results and time | identical (hard) | — |
| T-P15 | Scripted hull-scale pace (Q6): a Trident `strafeThrough` on a Reaper capital moving at its top speed — inside the zone its speed relative to the capital ≤ 1 km/s plus one step's acceleration, and the lane takes ≥ 1.5 s; a destroyer `approach` to 2.5 km of a moving dreadnought enters the zone at ≤ 1 km/s relative and settles (T-P11's bound); identical in two runs | hard | — |
| T-P16 | Threat reference clock (§2.15): `THREAT_MAX_DURATION` equals `round(3.2 × THREAT_STANDOFF × S / (0.8 × HULL_SPEED_SCALE))` (719 at S = 40, k = 3); the committed table's `THREAT_SCALE.maxDuration` matches (the existing test) and its time-limit share ≤ 25 % | hard | — |
| T-P17 | Frontage (Q1b): `assignSlots` of 180 frigates, 96 cruisers and 18 dreadnoughts in `line_abreast` with a 42-nominal-km range: every tier's row ≤ 3 ranges wide; the reference task force's slots identical with and without the bound; deterministic | hard | — |

Existing tests whose literals are distances or manoeuvre times are converted by the classification of §2.6–§2.8, never weakened (P5): every compressed-km literal → nominal × S (formation-dependent literals included, since the slot scale also rises by 100: e.g. `tests/movement.test.ts` cohesion `< 2.5` km → `< 6.25 × S` = 250 km; `tests/reaperAi.test.ts` slot continuity `< 1.5` → `< 3.75 × S`); every step count or second that bounds a manoeuvre × k (`tests/battle.test.ts` "fighters launch and torpedoes are fired" 1,800 → 5,400 steps; `tests/stealth.test.ts` "two strike passes in 180 s" → 540 s; `tests/reaperAi.test.ts` "interpose within 10 s" → 30 s; the movement band test's 400 s limit → 1,200 s); combat seconds and the owner's checks stay (idle ≤ 10 s, fire never silent for 10 s, the 60 s band hold, drones before 30 s); outcome bands are T19's (§2.13). T13's tests: `tests/arrival.test.ts` "settle at < 0.05 km/s relative to the slot" → `< 0.125 × HULL_SPEED_SCALE`; `tests/specials.test.ts` interpose and approach windows × k (and the Q6 pace); `tests/flagship.test.ts` (Harbinger duel at 40 nominal km) re-measured. T14's: the AI fixture's 120 s → 360 s (its 30-nominal-km distance is a custom-battle input and scales by itself); the corridor fixtures' offsets × 100; the planet fixtures re-derived from the shared constants (a point 2,680 km below the battle plane now lies inside the planet). T15's: the builder geometry bounds (60–160 → 6,000–16,000 km); the λ fixture with the new `baseRate`. Stage T's: §2.15. The time-to-kill duel needs no conversion (§2.13).

### 7.2 Measurement script

`scripts/pacing.ts` (CORE, committed like `scripts/calibration.ts`): the probe of §1.5 over the eleven runs plus seeds for the bands (Battle of Earth 1–3, reference 10–12), **a flank scenario** (the Defence of Sur'Kesh with the late flank group, seed 1, which exercises Q4's facing) and the ladder battle at 300 v 100; it prints the table of §1.5, the per-window distances, the queueing measures of §3.8, the hit outcomes of §4 and the ladder's never-in-range count. T19 and stage reviews read it.

## 8. Tasks per owner, in execution order

### 8.0 Order (the lead, before CORE starts chunk 6)

The chunk-6 notes of the CORE workflow say "if docs/apex/PACING_PLAN.md exists on the branch when you reach T19, apply its CORE changes as a pacing pass BEFORE calibration pass 2" and list the brief §21 rules "before calibration pass 2" too, without an order between them; brief §21.5 says "alongside the pacing pass". This plan asks the lead to fix the order with **an INTEGRATION_NOTES bullet and an amendment of the chunk-6 notes**, before chunk 6 starts: *T17, T18; then the pacing pass (P1 as one commit, P2–P6 as one commit); then the §21 rules, written at the new scale by the classification rule of §3.5; then T19 and its threat-table regeneration (§2.15); then T20.* Pacing first means §21's constants and tests are written once, at the final scale. If CORE has already written the §21 rules when it meets this plan, §3.5's rule converts them in P2 and their tests in P5; nothing else changes. The same bullet records the fixture re-definitions of §2.13 for sign-off and the order of §2.15.

### CORE — pacing pass (chunk 6, after T18; before the §21 rules and T19)

| Step | Task | Done when |
| --- | --- | --- |
| P1 | Engine fixes F1–F6 (§2.11) at S = 0.4: `padKm` raised by every position write, padded queries and `nearest`; relative projectile sweep; end-of-tick firing with `movedTick` and next-tick launch; recall, rearm and stand-off `approach` as station goals; swept proximity tests; nominal-unit `relSpeedPenalty`. Measure the eleven runs and the duels at 0.4; expected (§2.11): every `tests/battle.test.ts` pin holds, the Oculus screen pins fail on seeds 2 and 3 and are re-pinned **[lead sign-off]**, unpinned outcomes move (reference canon 7 ends 65 s earlier, Apex survival −5 to −12 points, Sol Defence 86 → 60 %, canon Final Battle 72.5 → 55 %) | **its own commit**, suite green; CORE_PROGRESS "P1" entry with before/after |
| P2 | Scale constants (§2.1) and conversions in `createShip`; `ORBIT_ALTITUDE_KM`, `PLANET_RADIUS_KM` and T14's planet centre and clearance; nominal re-basing of every absolute distance (§2.6, T14 and T15 rows included); manoeuvre timers × k and rates ÷ k (§2.7, T14 windows and T15 timings included); `SLOT_COMPRESSION = 1.375 × S`; `GRID_CELL_KM = 10 S`; T13 `ARRIVAL.runKm`, `INTERPOSE_SECONDS`; the stealth conversion; `THREAT_MAX_DURATION` from the simulated speed (§2.15); the provenance and preset texts of §2.2; comments in `constants.ts` and `weapons.ts`; the §21 constants by §3.5's rule if §21 landed first | P2–P6 land as **one commit** (below); P2 alone may leave tests red in the working tree |
| P3 | Data (§2.9): every scenario `maxDuration` and non-beat `arrivalTime` × 3; campaign waves and limit; custom defaults (`buildCustomBattle`, T17's `scenarios/custom.ts`); the Battle of the Citadel's geometry, Sovereign's hold and `environmentAnchor` (a new optional `BattleConfig.environmentAnchor`, nominal km × S); the T16 opening geometry and beat motions (§2.9) if T16 has landed (else T16 takes them); calibration harness fixtures (§2.13: duel windows × 3, the solutions fixture held at 0.7 × spinal range, the Oculus window × 3 — each **[lead sign-off]**) | data reviewed against the tables |
| P4 | Rules Q1b (frontage bound), Q2b (organic lean), Q3 (gate, Hold/Defend exemption, grid nearest with the combatant predicate on the decision cadence), Q4 (cap, lower bound, facing), Q6 (scripted pace; `MovementGoal.relative`) | T-P6, T-P7, T-P15, T-P17 |
| P5 | Tests: `tests/pacing.test.ts` T-P1–T-P17; conversion of the existing literals (§7), T13's, T14's and T15's included; `stepToContact` and the contact-based perf windows of `tests/perf.test.ts` and `scripts/perf-sim.ts` (§6); `batching.test.ts` scope if needed | — |
| P6 | `scripts/pacing.ts`; measure; derive the bands of §7 from ≥ 3 seeds and pin them; **regenerate the threat table** (`npm run timeline:threat`; §2.15 items 2–3; stop and report to the lead if a lever runs out); CORE_PROGRESS "pacing pass" entry with the §1.5 table re-measured; `CALIBRATION_REPORT.md` §2 "after pacing"; an INTEGRATION_NOTES bullet for A, B, C, D (scale constants, telemetry units, the IES conversion, the beat geometry rule, `environmentAnchor`, the shared planet constants, `stepToContact`, Q6) | the P2–P6 commit: typecheck, the **full suite green** (the threat fingerprint and tier tests included), build |
| then | Brief §21 rules (Q5's fleet advance among them), written by §3.5's rule; then **T19** (§2.13) and in T19's commit the threat table again (§2.15, "T19 threat"); then T20 | per WORK_BREAKDOWN |

### A — rendering (stage A run)

| Order | Task |
| --- | --- |
| A1 | Floating origin for every float32 world buffer (§5.1); verify a fighter close-up at the far edge of the battle without jitter (screenshot) |
| A2 | Markers (screen-space, by class) replacing the attenuated far cloud; impostor layer with silhouette sprites at minimum pixel sizes; **LOD chosen by projected pixels** (16 / 4 / 1 px) for hulls and craft, with the fov and viewport height passed to `lodLevel`; `tests/lod.test.ts` gains a telephoto fixture (fov 0.15°, a 2 km Reaper at 1,500 km → full detail) and the default-view equivalences (§5.3, §5.5) |
| A3 | Tracers and beams with screen-space minimum widths and per-frame streak lengths; optional stream-front visual (§5.6) |
| A4 | **Every environment** at the shared constants: Earth, Palaven, Thessia, Rannoch and Sur'Kesh at 6,371 km radius, 7,871 km below the battle plane; moons as sky objects; the Citadel with its Tower at `environmentAnchor`; the distant layer at its converted distances; starfield and sun unchanged (§5.8) |
| A5 | Attitude and thruster layer on acceleration fractions; arrival run-in streaks; audio distance model and capped delay (§5.8) |
| A6 | Model lengths matched to the simulated hulls (the five short models, audit §6) in the likeness pass |

### B — cameras, HUD, director (stage B run)

| Order | Task |
| --- | --- |
| B1 | Camera rig (§5.2): follow, Reaper and cinematic modes smoothed in the subject's moving frame; the follow distance on its own zoom, decoupled from the tactical zoom; near plane from the nearest visible geometry in POV and chase shots; limits and default views |
| B2 | Gunnery / Target / Reaper POV as telephoto views with the simulation's intercept telemetry; `longLens`, rack and split framings for 1,000+ km pairs; the fighter screen as a marker-and-streak chase on one flight (§5.4) |
| B3 | Director cadence for long battles (establishing shots on markers, slow-motion replays from the history buffer); the Showcase scene re-timed by the beat geometry rule (§2.9), its hull-scale moments built on `approach` and `strafeThrough`, which fly the Q6 pace |
| B4 | HUD units and clock (§5.9); overlay brackets on markers; `App.measurePerfBudget` rows stepped to contact before their 240 frames (§6) |
| B5 | With the playback workstream: Skip to contact (`stepToContact`, §6) |

### C — custom battle (stage C run)

| Order | Task |
| --- | --- |
| C1 | Starting distance slider: keep the nominal value in the data (`startingDistanceKm`, × S at build); show simulated km: range 1,200–6,400 km (nominal 30–160, step 2 → 80 km), default 3,040 km (76), with the hint "Reaper beams reach 1,760 km; dreadnought guns 1,680 km" taken from the catalogue × S |
| C2 | Time limit field: default 1,260 s, minimum 180 s; briefing rows show distances in km and an estimate of first contact, (separation − the longest range) ÷ the two fleets' combined anchor speed |
| C3 | Late fleets (per-fleet arrival time): the briefing says they "arrive within reach of the enemy, facing it" (Q4), so a player who places one far away is not surprised |

### D — documentation and codex (stage D run)

| Order | Task |
| --- | --- |
| D1 | `LORE_REFERENCE.md`: §Simulation estimates ("compressed battlespace (tens of km instead of tens of thousands)" → the scaled battlespace: capital guns 1,440–1,920 km, the dreadnought round at its codex 4,025 km/s, a three-fold manoeuvre time, the battle 1,500 km above its planet); §Visual liberties (planets now near-true scale; markers and impostors drawn larger than true size; the stream-front visual; scripted hull-scale moments paced by the simulation) |
| D2 | In-app codex: `mass_accelerator` estimate ("rounds travel at 22–48 km/s over ranges of 24–48 km" → "rounds of the trilogy's hulls travel at 1,880–4,830 km/s — the Everest-class round at its codex 4,025 km/s — over ranges of 160–1,920 km; ranges are simulation estimates"), with the AU guns in their own AU block: Project Titan 5,903 km/s, Nova Array 6,440 km/s, legacy Nova 53,667 km/s (0.18 c), each "AU simulation value; the pack's figures are 25 kg at 4,000 km/s, 25 kg at 6,000 km/s and 20 kg at 0.1 c, the last a numerical example"; the `hades` and `ship_valkyrie` AU texts of `PACK_ADOPTION.md` (§5) state the pack's working shot as the source of the yield and the simulated speed beside it; IES paragraph (capacity and vent times at the new pace); the fighter, torpedo and GARDIAN estimate texts with the new ranges |
| D3 | Database screen: simulated ranges, speeds and accelerations (× the scales), flight times, with the labels of §2.2 (the AU rows' label names the pack's values); nominal values never shown as km |
| D4 | `ARCHITECTURE.md` units line; `PACK_ADOPTION.md` §2.12 ("keeps flight times comparable" → the codex velocity holds and flight times are 0.3–0.4 s); `KNOWN_ISSUES.md` (short layers longer than the pack's SIM envelopes; hulls at tens of km/s, so passes at hull scale last frames outside scripted moments; small craft fight at 140–160 km; the Battle of the Citadel opens inside the band; the arrival rule moves late fleets into reach); README and CHANGELOG |
| D5 | e2e: the database row for the dreadnought gun shows "1,680 km" and "4,025 km/s"; the Titan row shows "5,903 km/s" with its AU label; the custom slider label; the HUD target panel range in km |

## 9. Risks and open points

- **Thin margins and chaos.** Single battles are chaotic; seeds 10–12 already sit on the edges of the canon capital band and the Apex dreadnought pin (§1.5). Mitigated by the band policy of §7 (≥ 3 seeds in P6) and T19's multi-seed re-pin.
- **The look at hull scale** (§1.4): the owner should confirm that tens-of-km/s hulls, frame-length passes outside scripted moments and craft fighting at 140–160 km are acceptable. If not, the route is option (c), a short craft layer with a two-speed craft model and a full re-calibration, or a later decision on k.
- **The order with §21** (§8.0): if the lead does not amend the chunk-6 notes, CORE may write §21 first; §3.5's rule covers that order at the cost of converting §21's constants in P2.
- **The threat table** (§2.15): a timeline whose lever cannot bring it back into its declared tier after the pacing pass or T19 needs stage T (rule 3: a declared tier and its story text). CORE stops rather than weaken the test, so the lead may have to schedule a short stage T run inside chunk 6.
- **The stealth block.** Brief §15.2 writes `capacity: 120, ventTime: 18` as battle seconds; this plan multiplies them by k in the simulation for the same reason CORE multiplies the block's 2.5 km by S. If the owner prefers the literal seconds, the 120 s sink fills before a pass is over (the 0.12 stealth test flies two passes in 180 s, so a pass takes up to 270 s at k = 3) and the hunter vents in the middle of its approach; the lead should confirm in INTEGRATION_NOTES.
- **The battle altitude.** 1,500 km replaces AP §17's ≈ 350 km (a convention for a 30 km battle) so that a 3,000–6,000 km battle sits above, not inside, a true-scale planet. A lower orbit is possible only with a smaller battle or a curved battle plane; the shared constant makes either a one-line change for the simulation and the renderer together.
- **The Battle of the Citadel's opening** (§2.9) is a decision of this plan from the scenario's own briefing; if the owner wants an approach phase there, the old positions and a mobile Sovereign come back, and Sovereign then leaves the Tower.
- **Very large battles.** Q1b keeps lines within three ranges and Q2b catches the rest; at 1,000+ hulls per side the depth of the wrapped ranks grows, and the extreme-scale programme's sector model (brief §17) owns that scale.
- **Per-layer ranges** (option c) remain the route to pack-like short layers (point defence ≤ 10 km) and to a hull-scale craft fight; they need a two-speed craft model and a full re-calibration.
- **Larger S** (2,000+ km ranges) is one constant pair away (S = 48, k = 4 measured, §1.5); T19 would re-pin again.
- **Codex checks.** `lore-ranges.md` §6's list (ME1 *Space Combat: General Tactics* first) could still produce a canon range; if it does, S is re-derived from §1.3 with that anchor. A codex radius for Palaven, Thessia, Rannoch or Sur'Kesh, recorded per `PACK_ADOPTION.md` §0.1, replaces its `SIMULATION_ESTIMATE` radius.

## 10. Review round (5 November 2026)

Fourteen findings (one blocker, thirteen major); every one applied at its source, none rebutted. Where a finding offered two options, the choice and its evidence are stated.

| # | Finding (severity) | Done |
| --- | --- | --- |
| 1 | The uniform round scale flies Titan, Nova Array and legacy Nova at speeds that contradict the pack and the catalogue's own texts (major) | Option (a): the catalogue ratio stays (calibrated flight times and drift, G4 = 1 for every gun); the three AU provenance texts and the two preset strings are reworded so no damage derivation is tied to 4,000 km/s or 0.1 c, and the speeds are labelled `AU_MODIFIED` simulation values (§2.2); the table's label cell names all three pack values; D2 lists the AU speeds apart from the 1,880–4,830 km/s of the trilogy's guns, and D3/D5 show them with their labels (§8) |
| 2 | Only Earth is re-scaled; Palaven, Thessia, Rannoch, Sur'Kesh and the Citadel stay at 30 km-battle sizes; Sovereign starts 1,800 km from the Tower it is docked with (major) | Shared `ORBIT_ALTITUDE_KM` 1,500 and `PLANET_RADIUS_KM` (§2.1), every planet at near-true scale with labels (§5.8, A4); the Citadel's Tower at a scenario `environmentAnchor` = Sovereign's start; decision recorded in §2.9: the Battle of the Citadel opens inside the band (its briefing: already engaged), Sovereign holds at the Tower — measured: contact at 0.1 s, 0 km drift, outcomes as at 0.12 |
| 3 | Hull-scale passes shrink to frames; craft fight at 8,900–11,700 lengths; the furball and brief §3's moments would not read (major) | The trade-off stated in §1.4 and §9 for the owner; Q6 (§3.7) gives scripted hull-scale moments a deterministic simulation-side pace (≤ 1 km/s relative within max(5 lengths, 10 km)), tested by T-P15; F4 extended to the stand-off approach; B told the furball is a marker-and-streak shot (§5.4, B2) |
| 4 | Stage T's threat table (fingerprint, `THREAT_MAX_DURATION` assuming V = S, no owner for the re-measure) (blocker) | Integration head merged (`f0bacfe`) and the plan re-checked against it; §2.15: the clock derived from `HULL_SPEED_SCALE` (719 s), P6 regenerates the table in the P2–P6 commit so no commit is red, TIMELINES_V2 §1.8 rules 1–2 by CORE and rule 3 via the lead, "T19 threat" regenerates it on the final engine; T-P16 |
| 5 | F1's pad by `maxSpeed × SIM_DT` misses T14's boosted runs (×4) (major) | F1 pads by a running maximum of `\|pos − prevPos\|` raised at every position write of the tick (§2.10, §2.11), exact for any mover; T-P8 adds boosted and arriving fixtures and a brute-force comparison over T14's AI drive-run fixture |
| 6 | T14 and T15 constants unclassified (major) | §2.6 and §2.7 rows: corridor nominal × S (200 km), collateral hull scale (1.5 km), windows × k (120 / 90 s), planet centre and clearance in true km from the shared constants; distant distances and spreads nominal × S, `firstLossAfter` × k (one constant), `baseRate` ÷ k; test conversions in §7; owners CORE (P2) and A (A4) |
| 7 | Dropping the 0.55 floor shrinks every formation to 0.73 × its 0.12 size relative to range, unlisted (major) | Option (a): `SLOT_COMPRESSION = 1.375 × S` keeps 0.12's geometry exactly, so G7 and §2.12 (1) hold as written and literals convert by 100 (§2.4). Re-measured (§1.5): every pin holds, the canon Final Battle stays a coalition victory (the floor's removal had flipped it to B at 678 s), and the time-to-kill duel passes on its unchanged fixture (66 s), so the first draft's re-definition of that fixture is withdrawn |
| 8 | The arrival cap equals the heading-lock radius; the centroid can sit far from every enemy hull; T-P7 covers one straight case (major) | Q4 (§3.4): facing set to the bearing to the centroid; lower bound 0.9 × range from the nearest enemy combatant; measured effect stated; T-P7 (a)–(c) add a 90° flank arrival and a multi-fleet enemy; `scripts/pacing.ts` runs the Sur'Kesh flank (§7.2) |
| 9 | Wide organic lines' wing capitals idle; Q3's widened scan is O(N²); T-P6 has no large battle (major) | Both fixes, measured: the frontage bound Q1b (the decisive one: 161 → 19 of 294 hulls never in range) and the per-hull lean Q2b (gated on the line holding, which keeps the canon pins); Q3 and Q2b search with the grid's `nearest` on the decision cadence (§3.3); T-P6 adds the 300 v 100 ladder battle from contact, T-P17 the bound |
| 10 | Every performance window times the approach at k = 3 (major) | §6: `stepToContact` and contact-based windows for `tests/perf.test.ts`, `scripts/perf-sim.ts`, `scripts/perf.mjs` and B4's `measurePerfBudget`, with owners; budgets re-measured |
| 11 | LOD ignores the field of view; telephoto POVs would draw points (major) | §5.3: LOD by projected pixels (16 / 4 / 1 px) for hulls and craft; A2 with a telephoto test fixture |
| 12 | The camera rig's lerp lags fast subjects out of frame; follow distance pinned by the tactical zoom; near plane clips POV bows (major) | §5.2 and B1: subject-frame smoothing, a follow zoom of its own, the near plane from the nearest geometry in POV and chase shots; §5.7 corrected (the near plane does change) |
| 13 | The chunk-6 order between the pacing pass and §21 is unfixed; P2's done-criterion leaves the suite red (major) | §8.0 asks the lead for an INTEGRATION_NOTES bullet and a chunk-6 amendment (pacing → §21 → T19); §3.5 gives the classification rule for §21 constants under either order; P1 is one green commit and P2–P6 another |
| 14 | Thresholds from single seeds of a prototype; P1's expectation wrong; fixture re-definitions unmarked (major) | §7: hard thresholds for the owner-facing invariants, bands derived in P6 from ≥ 3 seeds and re-pinned by T19; extra seeds measured and shown (§1.5); T-P12 names seed 1; P1's expectation corrected from a prototype of the fixes at S = 0.4 and the audit's padding result (§2.11); re-definitions marked [lead sign-off] (§2.13) |

## 11. Prompts for the stage agents

Each prompt is self-contained; the agent reads this plan first and treats its sections as binding. Common to all: work in your own stage worktree and branch; never edit, stage, commit or run npm in the main checkout `/home/user/reaperwar`; canon by default, and a number is `CANON_CONFIRMED` only when a lore document in the repository or the reference packs records it with its source (otherwise `CANON_INFERRED` or `SIMULATION_ESTIMATE`, said so); never invent a codex quotation; determinism (no `Math.random`, no wall-clock reads in the simulation); no hull caps; no approximation of combat; the renderer never slows or alters the simulation; commit with the attribution lines of your session instructions, under the repository identity.

### 11.1 CORE — pacing pass

> You are CORE in chunk 6 of the Mass Effect 3 Reaper War Simulator. After T17 and T18 and before the brief §21 rules and T19, apply `docs/apex/PACING_PLAN.md` (brief §19.2, binding) as a pacing pass, in the order of its §8.0 and §8 CORE table. Read the plan whole, then `docs/apex/pacing/engine-audit.md`, `docs/apex/TIMELINES_V2.md` §1.8 and §4.14, and `docs/apex/CORE_PROGRESS.md`.
> 1. **P1** — the engine fixes F1–F6 of §2.11 at S = 0.4, as one commit with the suite green: F1 pads every grid query (and the projectile sweep) by `padKm`, the running maximum of `|pos − prevPos|` over every position write since the last rebuild (`steerShip` whatever the boost, `runIn`, scripted placements); F2 relative sweep; F3 end-of-tick firing with `movedTick`; F4 station goals for recall, rearm and the stand-off `approach`; F5 swept proximity; F6 `relSpeedPenalty` in nominal units. Measure the eleven runs and the duels; expect what §2.11 lists (the Oculus screen pins fail on seeds 2–3; re-pin them only with the lead's sign-off; record every moved outcome in CORE_PROGRESS).
> 2. **P2–P6 as one commit**, suite green at the end: constants (§2.1: S = 40, k = 3, `HULL_SPEED_SCALE`, `HULL_ACCEL_SCALE`, `ROUND_SPEED_SCALE`, `MISSILE_SPEED_SCALE`, `ORBIT_ALTITUDE_KM` 1,500, `PLANET_RADIUS_KM`); every absolute distance of §2.6 written as nominal × S or kept at hull scale as the table says (T14's corridor 200 km, collateral 1.5 km, planet centre and clearance from the shared constants; T15's group distances and spreads); every duration of §2.7 × k and rate ÷ k (T14 windows 120 / 90 s; T15 `firstLossAfter` 90 s from one constant, `baseRate` 0.0003); `SLOT_COMPRESSION = 1.375 × S`; `GRID_CELL_KM = 10 S`; `THREAT_MAX_DURATION` from the simulated speed (§2.15); the texts of §2.2 (no nominal catalogue value changes); the data of §2.9 (time limits and non-beat arrivals × 3, the Battle of the Citadel's positions, Sovereign's `hold_formation` and `environmentAnchor`); the rules Q1b, Q2b, Q3 (with the Hold/Defend exemption and the grid's `nearest` with a combatant predicate on the decision cadence), Q4 (cap, lower bound, facing) and Q6 (§3); `tests/pacing.test.ts` T-P1–T-P17 and the literal conversions of §7 (never weaken a test: hard thresholds as written, bands derived from at least three seeds and pinned); `stepToContact` and the contact-based perf windows of §6; `scripts/pacing.ts` (§7.2); then `npm run timeline:threat` (full run) and the rules of TIMELINES_V2 §1.8 — if a lever cannot bring a timeline back into its declared tier, stop and report to the lead instead of committing; CORE_PROGRESS, `CALIBRATION_REPORT.md` §2 "after pacing" and an INTEGRATION_NOTES bullet for A–D.
> 3. If the §21 rules are already in, convert their constants by §3.5's rule in P2 and their test literals in P5. Otherwise write them after the pass at the new scale by the same rule; the owner's 20 s, 75 % and 15 % thresholds never change.
> 4. In T19, re-pin inside the AP §3.5 lever order from several seeds (§2.13), land the fixture re-definitions marked [lead sign-off] only once the lead has approved them, and regenerate the threat table in T19's own commit (§2.15).
> Report: the §1.5 table re-measured, every band you pinned with its seeds, every moved outcome, the threat-table re-base (old and new thresholds, tiers that moved, levers stepped).

### 11.2 A — rendering

> You are stage A of the Mass Effect 3 Reaper War Simulator. The simulation now fights at S = 40, k = 3 (`docs/apex/PACING_PLAN.md`; CORE's INTEGRATION_NOTES bullet of the pacing pass names the constants). Implement the plan's §5 render items A1–A6 (§8 A table): a floating origin for every float32 world buffer; screen-space markers by class and silhouette impostors at minimum pixel sizes; `lodLevel` chosen by projected pixels (full ≥ 16 px, reduced 4–16, impostor 1–4, marker < 1) for hulls and craft, taking the camera's fov and viewport height, with a telephoto test fixture in `tests/lod.test.ts` (fov 0.15°, a 2 km Reaper at 1,500 km is full detail); tracer and beam minimum widths and per-frame streaks; every environment from the shared constants `ORBIT_ALTITUDE_KM` and `PLANET_RADIUS_KM` in `src/simulation/constants.ts` (Earth, Palaven, Thessia, Rannoch and Sur'Kesh at 6,371 km radius, centred 7,871 km below the battle plane; label the non-Earth radii `SIMULATION_ESTIMATE` wherever you document them); moons as camera-relative sky objects; the Citadel placed so its Tower is at the scenario's `environmentAnchor` (Sovereign at the Tower in the Battle of the Citadel); the distant layer at its converted 6,000–16,000 km; the attitude layer on acceleration fractions; audio with hull-scale reference distances and the delay capped at 0.3 s. Read the simulation; never write to it. Verify with screenshots: a fighter close-up at the battle's edge without jitter, a tactical view of both fleets with markers, a telephoto POV at full detail, Earth beneath a Battle of Earth, the Citadel holding Sovereign.

### 11.3 B — cameras, HUD and director

> You are stage B of the Mass Effect 3 Reaper War Simulator. Read `docs/apex/PACING_PLAN.md` §5.2–§5.4, §5.9, §6 and §8 (B table). Implement B1–B5: in `src/rendering/cameras.ts`, smooth the follow, Reaper and cinematic modes in the subject's moving frame (add the subject's displacement since the last frame to the camera position and the current look-at, then damp the offset), give follow mode a zoom of its own decoupled from the tactical zoom, and set the near plane from the nearest visible geometry in POV and close chase shots (the logarithmic depth buffer keeps precision); the limits and default views of §5.2; Gunnery, Target and Reaper POV as telephoto views fed by the simulation's telemetry (never a faked shot); `longLens`, rack and split framings for pairs 1,000+ km apart; the fighter screen of the Final Battle opening as a chase on one flight with opponents as markers and tracer streaks — the plan's "marker-and-streak shot" (a hull-scale furball does not exist at this scale); the Showcase scene re-timed by the beat geometry rule of §2.9, its hull-scale moments built on the specials `approach` and `strafeThrough`, which the simulation paces (Q6, §3.7); HUD units in km and a minutes clock; `App.measurePerfBudget` rows stepped headless to contact (`stepToContact`) before their 240 frames; with the playback workstream, Skip to contact. Test the camera modes with moving subjects at 45 km/s (the subject stays centred) and the HUD units in e2e.

### 11.4 C — custom battle

> You are stage C of the Mass Effect 3 Reaper War Simulator. Read `docs/apex/PACING_PLAN.md` §2.9 and §8 (C table). Implement C1–C3: the starting-distance slider keeps nominal km in the data and shows simulated km (1,200–6,400 km, step 80 km, default 3,040 km) with the reach hint taken from the catalogue × S; the time-limit field (default 1,260 s, minimum 180 s); briefing rows in km with a first-contact estimate; late fleets described as arriving within reach of the enemy and facing it (the arrival rule Q4). Keep every value deterministic and taken from the simulation's constants; test the slider and the briefing in e2e.

### 11.5 D — documentation and codex

> You are stage D of the Mass Effect 3 Reaper War Simulator. Read `docs/apex/PACING_PLAN.md` §1.4, §2.2, §5.8, §8 (D table) and §9, and `docs/apex/pacing/lore-ranges.md` §6. Implement D1–D5: `LORE_REFERENCE.md` (the scaled battlespace, the codex round at 4,025 km/s, the three-fold manoeuvre time, the battle 1,500 km above its planet; visual liberties: near-true-scale planets, markers and impostors, the stream-front visual, scripted hull-scale moments); the in-app codex `mass_accelerator` estimate (the trilogy's guns at 1,880–4,830 km/s over 160–1,920 km, the Everest-class round at its codex 4,025 km/s) with the AU guns in their own AU block (Project Titan 5,903 km/s, Nova Array 6,440 km/s, legacy Nova 53,667 km/s, each an AU simulation value, with the pack's 25 kg at 4,000 km/s, 25 kg at 6,000 km/s and 20 kg at 0.1 c named as the pack's figures, the last a numerical example); the `hades` and `ship_valkyrie` AU texts of `PACK_ADOPTION.md` §5 stating the pack's working shot as the source of the yield and the simulated speed beside it; IES, fighter, torpedo and GARDIAN texts at the new pace and ranges; the database screen's simulated values with the labels of §2.2; `ARCHITECTURE.md`, `PACK_ADOPTION.md` §2.12, `KNOWN_ISSUES.md` (the trade-offs of §1.4, the Battle of the Citadel opening inside the band, the arrival rule), README and CHANGELOG; e2e for the database rows (dreadnought gun 1,680 km and 4,025 km/s; Titan 5,903 km/s with its AU label), the custom slider and the HUD range. Label every number by the plan's rules; quote no codex text the repository does not record.
