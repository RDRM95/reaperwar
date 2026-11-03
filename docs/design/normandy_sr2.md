# Normandy SR-2, command vessel (`normandy_sr2`)

| | |
| --- | --- |
| Faction · role | alliance · `frigate`; `flagship: true`; in `UNIQUE_CLASS_IDS` (exactly one per battle, never scaled by fleet strength, clamped to one across both sides by the custom editor); `NAMED_FLAGSHIPS` as `SSV Normandy SR-2` |
| Names | `NAMES.normandy_sr2 = ['SSV Normandy SR-2']`; class name `Normandy SR-2 (command vessel)`, shortName `Normandy` (AP §22.1, brief §15.1) |
| Length | 216 m — `CANON_INFERRED` (commonly cited; not stated in the games); render length **2.16 units** |
| Status | **MEASURE** — the plan gives the SR-2 hulls no silhouette numbers; A13 rebuilds the variant and INTEGRATION measures the delivered model and locks it. The proportion table below is a proposal for the builder |
| Canon / AU | canon ship: design `CANON_CONFIRMED` (the ship and its Thanix refit are canon); every number `SIMULATION_ESTIMATE`; original model |
| Builder today | `src/rendering/ships/alliance.ts` `buildAllianceFrigate(true)` — registered today under `alliance_frigate_thanix`: the 2.16-unit stealth hull (fuselage, raised cockpit, swept wings with tip nacelles at x ±0.78, dorsal fin, ventral bay, twin stern thrusters) with a dark stern block and a blue stripe |
| Changes | A13: `buildAllianceFrigate('normandy')` with a **distinct dorsal sensor spine** so it reads as the one ship; `BUILDERS.normandy_sr2`; the dark-ship and vent visuals of brief §15.3; the strike camera (B) |
| Hardpoints | `alliance_thanix` ×1 (`[0, −3, 60]`, ventral, forward), `disruptor_torpedo` ×2 (`[0, −4, 20]`), `gardian` ×2 (`[0, 8, 0]`) |
| Numbers | hull 700 / armour 14 / barriers 520 / regen 16; speed 1.6 / accel 0.4 / turn 26; sensors 80 / signature 0.3 / ecm 0.6 / crew 1.3; heat capacity 110; points 32 |
| Stealth block | `stealth: { capacity: 120, ventTime: 18, detectRange: 2.5 km, revealOnFire: 10 }` (brief §15.2, `SIMULATION_ESTIMATE`: a compression of the canon internal emission sink into battle time; CORE converts km to battlespace units) |

## Three-view silhouette

- **Bow** (`az 180, el 0`): a sleek, low, wide-shouldered shape: the slim fuselage with the **raised cockpit** on a short neck above it; the **swept wings** running out to the two engine nacelles — split nacelles, one at each wing tip, well apart from the body; the **ventral weapon bay** (Thanix and torpedo tubes) as a shallow bulge under the nose; the **dorsal sensor spine** as a low ridge along the top behind the cockpit. The hull is two-tone: dark panels on pale plating with one blue stripe.
- **Profile** (`az 90, el 0`): the cockpit raised forward; the fuselage tapering aft into the main thruster block; the nacelles trailing behind the wings, their exhausts a little aft of the fuselage's; the **sensor spine** running from behind the cockpit to the dorsal fin as a thin raised ridge with a small forward fairing; the ventral bay a shallow bulge; a long, low hull.
- **Three-quarter** (`az 135, el 20`): the Normandy: split engine nacelles on swept wings, raised cockpit, the sensor spine, the two-tone livery with the blue stripe, four blue-white exhausts (two nacelle, two stern). When silent: the same silhouette dark, no glow at all. When venting: a blue-white bloom along the radiator strips at the stern block.

## Proportions (MEASURE — proposal for the builder; measured and locked at INTEGRATION)

| Measure | Measured | Proposal (read from today's builder) |
| --- | --- | --- |
| length (z-extent) | — | 2.16 units (216 m) |
| beam / length | — | 0.70–0.80 (today ≈ 0.80: nacelle centres at x ±0.78 plus their radius) — the wings make the Normandy wide; keep it |
| height / length | — | 0.16–0.20 (today ≈ 0.19: fin top ≈ +0.26, bay ≈ −0.14) |
| cockpit | — | raised, centred ≈ 0.28 L ahead of the hull centre; the neck ≈ 0.23 L long |
| wings and nacelles | — | wings rooted ≈ 0.12 L aft of centre, swept back; nacelles ≈ 0.32 L long with their exhausts ≈ 0.37 L aft of centre |
| sensor spine | — | from ≈ +0.15 L to ≈ −0.35 L along the dorsal centreline, height ≤ 0.03 L, with a small fairing at its forward end |
| stern block | — | the aft 0.16 L, dark, carrying the twin stern exhausts and the two radiator strips |
| relations | — | a cruiser ≈ 3.2 × the Normandy; a Reaper destroyer ≈ 0.75 × |

## Signature features

1. **Split engine nacelles** at the wing tips — the lineage's mark.
2. The **raised cockpit** on its neck.
3. The **dorsal sensor spine** — the marker that makes this the one ship (new in V2; the pattern frigates do not carry it).
4. **Swept wings**, a dorsal fin, the **ventral Thanix and torpedo bay**.
5. The **two-tone livery**: dark stern block and panels on pale plating, one blue stripe.
6. **Radiator strips** on the stern block flanks, lit only while venting (*proposal*: two strips, ≈ 0.12 L long).

## Colours and lights (hex)

Alliance palette: hull `0xb9c1cc`, hullDark `0x3b4350` (stern block, nacelle bodies, bay, panels), accent `0x1f5fb3` (stripe), engine `0x5fb8ff` (emissive `0x3c9dff`, 3.2), windows `0xcfe8ff` (emissive `0x9fd0ff`, 1.6: cockpit strip, spine fairing); drive and far-point `0x4fb8ff`; barrier shell `0x6fb0ff`; tracer `0xdff4ff`; Thanix stream core `0xffd9a0` with sheath `0x4fa0ff`.

| State | Lights and drive |
| --- | --- |
| normal | cockpit strip and spine fairing lit; four exhausts with glow length and brightness following throttle; running lights (*proposal*: one at each wing tip, one at the fin top) |
| **silent** (`stealth_engaged`) | **dark ship**: running lights off, cockpit strip off, drive glow sprites hidden, exhaust emissive to 0 — a faint silhouette only (unlit albedo); the overlay draws a dashed bracket for a silent friendly |
| **revealed** (`stealth_revealed { reason }`) | lights and drive return at once (*proposal*: within 0.3 s), for `revealOnFire` 10 s or while inside an enemy's detect range |
| **venting** (`stealth_venting`) | a **blue-white bloom from the radiator strips** (*proposal*: additive billboards in `0xdff4ff` fading to `0x5fb8ff`) with a heat shimmer (an additive flicker billboard; there is no refraction pass) for `ventTime` 18 s; the drive glow stays on |

## Must read as (brief §10: "Normandy SR-2 with the split engine nacelles and raised cockpit"; brief §15: "sleek stealth hull with the dorsal sensor spine")

What exists today: the split nacelles, the raised cockpit, the swept wings, the dark stern block and the blue stripe — the hull reads as the lineage. What must change: the **dorsal sensor spine** (new), a sleeker fuselage (today a tapered box with a box neck; the target is a smoother taper and a blended neck), the radiator strips, a livery distinct from the pattern frigate's squadron stripe, and the dark-ship and vent states.

- [ ] Split engine nacelles at the wing tips; raised cockpit; swept wings.
- [ ] A sleek, low hull with the dorsal sensor spine — the one ship, not a pattern frigate.
- [ ] Two-tone livery with one blue stripe; four blue-white exhausts.
- [ ] Dark when silent; a blue-white bloom at the stern when venting.
- [ ] One of her on the field, never two (the fleet list, order of battle and results never show two `SSV Normandy SR-2`).

## Movement and animation (brief §15.3, stealth-frigate row — the Normandy's way of fighting)

The simulation decides the run (brief §15.2 doctrine, CORE); the renderer makes it look like the Normandy:

- **Attitude**: flies like an aircraft — bank up to 55° into turns (roll proportional to lateral acceleration), pitch with vertical acceleration, rolling and pitching through her runs; smooth roll-out when straight; the nose leads the velocity vector in a turn.
- **Thrusters and drives**: the four exhausts' glow length and brightness follow throttle; **wing-tip thrusters** (outboard of each nacelle) and **ventral thrusters** (under the nose and under the stern block) flare on hard turns; a nose cluster puffs on braking.
- **The strike run** as seen on screen: approach **silent and dark** along the enemy's flank or below the plane of its formation; **dive** from above or below the plane onto the target's blind side; line up; **fire** (the Thanix stream at close range, the two torpedoes on the way in — the first shot reveals her, lights and drive snap on); **roll away and pull up** with a hard turn and a burn beyond the enemy's GARDIAN envelope (wing-tip and ventral thrusters flaring); go **dark** again once clear of every detect range; **vent** when the sink is spent, out of range — the bloom at the stern — then repeat. An `attack` order forces engagement; `retreat` leaves silent.
- **Advantages that must be visible** (brief §15.2): no shots are fired at her while silent beyond `detectRange`, so no hits land; the first strike lands at close range with a full solution; the break-away is survivable; she survives a Final Battle far more often than a line frigate.
- **Cameras**: the strike camera follows the run with lead; the director's `stealth strike` cue (stage B) fires in the Final Battle.
- No spinal recoil (the Thanix is a stream).
- **Flagship**: her destruction emits `flagship_destroyed` with an original final transmission (never game dialogue) and the 1.1 s frigate death; the HUD ship panel shows `SILENT RUNNING` / `REVEALED` / `VENTING`.

## Frozen screenshot set

`e2e-screenshots/normandy_sr2_bow.png`, `e2e-screenshots/normandy_sr2_profile.png`, `e2e-screenshots/normandy_sr2_3q.png`; movement frames of brief §15.3 (D8 adds them to `scripts/cinematic-shots.mjs`): `normandy_sr2_strike_bank.png` (the Normandy banking into a strike, strike camera) and `normandy_sr2_vent.png` (the vent bloom at the stern); the dark-versus-lit pair is in `alliance_frigate_thanix.md`.

## Status

MEASURE. A13 rebuilds the variant; INTEGRATION measures the delivered template, fills the table and the JSON, and locks. Open question for the lead: whether to give the SR-2 hulls TARGET numbers (the proposal row above) before A builds, so the silhouette test pins them like the other redesigned classes.
