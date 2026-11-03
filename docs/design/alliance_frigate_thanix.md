# SR-2-pattern stealth frigate (`alliance_frigate_thanix`)

| | |
| --- | --- |
| Faction · role | alliance · `frigate` |
| Names | class name **`SR-2-pattern stealth frigate`**, shortName `Stealth frigate` (brief §15.1, which supersedes AP §22.1's "SR-2-pattern Thanix frigate" / "Thanix frigate" — see Status); hull names `SSV Thermopylae`, `SSV Austerlitz`, `SSV Sekigahara`, `SSV Adwa`, `SSV Plataea`, `SSV Carrhae`, `SSV Talas`, `SSV Lechfeld` (original, `SIMULATION_ESTIMATE`) |
| Length | 216 m — `CANON_INFERRED` for the pattern (the Normandy's length); render length **2.16 units** |
| Status | **MEASURE** — no plan silhouette numbers; A13 rebuilds the variant; INTEGRATION measures and locks |
| Canon / AU | design `SIMULATION_ESTIMATE`: the games show only the Normandy herself; a small number of sister hulls of the pattern is a simulation estimate under canon rules (canon Final Battle 2, Battle of Earth 0, reference engagement 0). **AU where Apex timelines build the pattern in numbers** (3–4 before scaling, never in `fixedClasses`): the codex and database carry the `auDynamic` line `ALTERNATE UNIVERSE (Apex): the SR-2 pattern is built in numbers; under canon only a handful of sister hulls exist (simulation estimate).` |
| Builder today | today this id is `buildAllianceFrigate(true)`, i.e. the Normandy hull itself; A13 gives it `buildAllianceFrigate('pattern')`: the same hull family **without the Normandy's unique markings and with a squadron stripe** |
| Hardpoints | as the Normandy: `alliance_thanix` ×1, `disruptor_torpedo` ×2, `gardian` ×2 |
| Numbers | hull 680 / armour 14 / barriers 500 / regen 16; speed 1.55 / accel 0.38 / turn 25; sensors 78 / signature 0.32 / ecm 0.5 / crew 1.15 (below the Normandy's 1.3); points 30 |
| Stealth block | the same `stealth: { capacity: 120, ventTime: 18, detectRange: 2.5 km, revealOnFire: 10 }`; the same doctrine (brief §15.1: "both classes carry the stealth system and fight by the doctrine; no other hull has it") |

## Three-view silhouette

The Normandy's hull family seen plainer:

- **Bow**: the same sleek, wide-shouldered shape — slim fuselage, raised cockpit on its neck, swept wings to the two split nacelles, the ventral Thanix and torpedo bay — **without the dorsal sensor spine**: the top line is clean behind the cockpit. A squadron stripe band crosses the wings and nacelles.
- **Profile**: as the Normandy without the spine ridge and its fairing; a single-tone hull (no dark stern block) with dark panel lines; the squadron stripe on the nacelle flanks.
- **Three-quarter**: recognisably the Normandy's sister — nacelles, cockpit, wings — and recognisably not her: no spine, no two-tone, a squadron stripe. Dark when silent; the blue-white bloom at the stern when venting.

## Proportions (MEASURE — proposal; measured at INTEGRATION)

| Measure | Measured | Proposal |
| --- | --- | --- |
| length (z-extent) | — | 2.16 units: the same hull as the Normandy |
| beam / length | — | the Normandy's (0.70–0.80) |
| height / length | — | slightly lower than the Normandy's for want of the spine: 0.15–0.19 |
| parts | — | cockpit, wings, nacelles, bay and stern block as `normandy_sr2.md`; no spine |

## Signature features

1. Split engine nacelles, raised cockpit, swept wings — the SR-2 pattern.
2. **No dorsal sensor spine** — the absence is the tell.
3. A **squadron stripe**: a band in the faction accent across the wings and nacelles (*proposal*: one band per hull, the same on every pattern hull; no per-hull numbering, since every hull is named).
4. A single-tone hull with dark panel lines; the ventral bay; the radiator strips for venting.

## Colours and lights (hex)

Alliance palette: hull `0xb9c1cc`, hullDark `0x3b4350` (panel lines, nacelle bodies, bay), accent `0x1f5fb3` (squadron stripe), engine `0x5fb8ff` (emissive `0x3c9dff`, 3.2), windows `0xcfe8ff` (cockpit strip); drive and far-point `0x4fb8ff`; barrier shell `0x6fb0ff`; tracer `0xdff4ff`; Thanix core `0xffd9a0`, sheath `0x4fa0ff`. The dark-ship, revealed and venting states exactly as `normandy_sr2.md`: silent = running lights off, drive glow off, a faint silhouette only; venting = blue-white bloom (`0xdff4ff` → `0x5fb8ff`) from the radiator strips with a heat shimmer.

## Must read as (brief §15: "SR-2-pattern stealth frigate as the Normandy's plainer sister")

What exists today: this id renders the Normandy hull, so a battle with several of them shows several Normandys — exactly the absurdity brief §9.1 removes. What must change: the pattern variant (no spine, no two-tone, squadron stripe) so that a Prime/Apex Final Battle shows one `SSV Normandy SR-2` and N stealth frigates that are clearly her sisters and clearly not her.

- [ ] The SR-2 pattern: split nacelles, raised cockpit, swept wings, ventral bay.
- [ ] Plainer than the Normandy: no dorsal sensor spine, single-tone hull, a squadron stripe.
- [ ] Told from a line frigate by the lineage's hull and the stealth states; told from the Normandy by the missing spine and the stripe.
- [ ] Dark when silent; the blue-white bloom when venting.

## AU badge

Under canon rules the class is a canon-shaped simulation estimate (a handful of sister hulls) and carries no AU badge. Under Apex timelines the class is built in numbers and the codex, database and custom-battle rows carry the `AU` badge and the `ALTERNATE UNIVERSE (Apex): …` line quoted above; a custom battle that fields the pattern in Apex numbers is still named by its AU preset, not by this class alone.

## Movement and animation (brief §15.3, stealth-frigate row)

Identical to `normandy_sr2.md`: flies like an aircraft (bank up to 55°, pitch, roll-outs), wing-tip and ventral thrusters flaring on hard turns, the strike run (silent approach along the flank or below the plane; dive; line up; fire — the first shot reveals it; roll away and pull up; dark again; vent out of range), the dark-ship and vent visuals, the strike camera and the `stealth strike` cue. The doctrine's target choice differs only in the simulation (a vulnerable target first — damaged capital, a destroyer's flank, any hull with barriers down; the Normandy alone prefers the highest-value target it can reach); the animation layer is the same. A line frigate beside it flies straight runs and turn-ins and never goes dark — that contrast is the `dark_vs_lit` frame below.

## Frozen screenshot set

`e2e-screenshots/alliance_frigate_thanix_bow.png`, `e2e-screenshots/alliance_frigate_thanix_profile.png`, `e2e-screenshots/alliance_frigate_thanix_3q.png`; movement frame of brief §15.3 (D8 adds it): `alliance_frigate_thanix_dark_vs_lit.png` — a dark silent stealth frigate beside a lit one.

## Status

MEASURE. A13 rebuilds; INTEGRATION measures and locks. Open question for the lead: AP §15 and §22.1 still word the class as "SR-2-pattern Thanix frigate" in the e2e acceptance text ("one `SSV Normandy SR-2` and N `SR-2-pattern Thanix frigate` hulls"); brief §15.1 (later, binding) names it "SR-2-pattern stealth frigate" with shortName "Stealth frigate". This sheet and the custom-editor label of brief §15.4 follow the brief; the e2e assertion in `e2e/finalBattle.spec.ts` (D7) must use the brief's name.
