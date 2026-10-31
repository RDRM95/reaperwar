# Custom battle v2 (united fleets) and Final Battle setup — UX and data design

Status: **design, nothing below is implemented yet.** It refines lead decisions D4 (Final Battle setup and world state), D6 (united fleets) and D13 (mass-scale numbers are captions only), and it takes the brief's feedback round 2 (`docs/V2_CINEMATIC_BRIEF.md` §8.2 cap of 150–200 hulls a side, §8.2 three-dimensional formations, §8.9 `super_dreadnought`, §8.10 `fixed_platform`) as requirements the editor must expose as soon as the simulation and data work land. Where another design draft already owns a mechanism this document references it instead of restating it: the Final Battle beat table and the `cerberus`/`cinematic_arrival` options are specified in `docs/apex/CINEMATIC_DESIGN.md` §1.4, the preset compositions, the Apex Cerberus predicate and the new ship classes in `docs/apex/PACK_ADOPTION.md` §2.9, §3a–3c.

Sources read for this design: `src/scenarios/index.ts` (`fleet()`, `buildCustomBattle`, `CustomBattleInput`, `final_battle_of_earth`, `SHEPARD_WORLD_STATE`), `src/ui/screens/custom.ts`, `src/ui/screens/briefing.ts`, `src/ui/dom.ts`, `src/core/storage.ts`, `src/simulation/types.ts`, `src/simulation/battle.ts` (constructor, `deployFleet`, `createShip`, `checkEnd`), `src/simulation/ai.ts` (anchor movement), `src/simulation/formations.ts`, `src/campaign/engine.ts` (`MAX_SHIPS_PER_SIDE`, `scaleCounts`, `buildEngagement`), `e2e/game.spec.ts`, `e2e/campaign.spec.ts`, `tests/battle.test.ts`, `tests/salarian.test.ts`, `tests/saves.test.ts`, `src/style.css`, `docs/V2_CINEMATIC_BRIEF.md`, `docs/apex/CINEMATIC_DESIGN.md`, `docs/apex/PACK_ADOPTION.md`, `docs/apex/CODE_MAP.md` §4.3, `LORE_REFERENCE.md`, the Apex reference pack (`docs/apex/reference/`).

## 0. Reading guide and decisions

Labels. Every composition, count and option in this document carries one of the catalogue tags: `CANON_CONFIRMED` (stated in the trilogy), `CANON_INFERRED`, `SIMULATION_ESTIMATE` (invented so canon relationships hold; every fleet *count* below is one, because the games give no numbers), `AU_MODIFIED` (exists only in an alternate-universe timeline). The pack's own labels map as `PACK_ADOPTION.md` §0.1 says (CANON → check against `LORE_REFERENCE.md` anchors before trusting; DERIVED → `CANON_INFERRED`; SIM → `SIMULATION_ESTIMATE`; AU LOCK / AU PROPOSAL → `AU_MODIFIED`). The fleet *names* Sword, Hammer, Citadel Fleet, Fifth Fleet, Salarian First Fleet, Migrant Fleet (Heavy, Patrol, Civilian fleets), Harbinger are `CANON_CONFIRMED` (ME1–ME3 dialogue and codex); "Black Fleet", "Sol defence platforms", "Valkyrie" and every number ending in "38,420" are `AU_MODIFIED`. `LORE_REFERENCE.md` lists none of the fleet names today; the implementation adds one anchor line ("Sword/Hammer/Shield operation names, Citadel Fleet, Fifth Fleet, Salarian First Fleet, Migrant Fleet sub-fleets: in-game dialogue, no numbers given").

Units. Fleet positions, offsets and the starting distance are **nominal km** exactly as the catalogue and the current slider speak them; `deployFleet` multiplies them by `BATTLESPACE_SCALE = 0.4` (`battle.ts:106`). Nothing in the UI or the builder scales anything.

| # | Decision | Why |
| --- | --- | --- |
| C1 | `CustomBattleInput` becomes v2: `sides.A.fleets[]` / `sides.B.fleets[]`, each fleet `{ id, faction, name, formation, counts, arrivalTime, offset, playerControlled, presetId?, readiness? }`. The v1 shape keeps building through `migrateCustomBattle`; the two existing unit tests and the saved `customBattle` record load unchanged. | D6, "old single-fleet saves must still load". |
| C2 | `buildCustomBattle(AnyCustomBattleInput, rules?)` is a pure function of the input and the rule set; it lays fleets out deterministically, de-duplicates named vessels across fleets, splits fixed platforms into their own `defend_position` fleet, and tags the config `auContent` when an AU hull is fielded. | Determinism; `ai.ts:168-169` freezes a fleet whose slowest hull has `maxSpeed 0`; honesty. |
| C3 | One side cap constant, `SHIP_CAP_PER_SIDE`, exported from `src/simulation/constants.ts` (70 today, raised by the §8.2 work); the editor reads it live, warns above it, offers *Scale to cap*, and blocks launch above `HARD_SHIP_CAP = round(1.5 × cap)`. | §8.2 moves the cap; the editor must not carry its own number. `campaign/engine.ts:23` imports the same constant. |
| C4 | The simulation treats a side with pending fleets as alive (`checkEnd` guard) so a side whose fleets all arrive late is not "destroyed" at t = 0. The editor also warns. | Today `checkEnd` (`battle.ts:919-926`) ends the battle immediately; the beat-spawned fleets of `CINEMATIC_DESIGN.md` §1.1 (`arrivalMode: 'beat'`) need the same guard. |
| C5 | Custom battle is a sandbox: any class is selectable under any timeline, but AU classes always carry the AU badge, canon-shaped presets never contain them, and a config that fields one is named `Custom (AU): …` and carries `auContent: true` which the HUD and results print. | "Never present AU as canon" without forbidding what-if experiments. |
| C6 | The e2e hooks `data-count="sideA|sideB:<classId>"` and `data-faction="sideA|sideB"` survive as **aliases on the first fleet card of each side**; every card also carries the uniform hooks `data-count-fleet="<side>:<index>:<classId>"` etc. (§2.8). | `e2e/game.spec.ts:119-124` stays green unchanged. |
| C7 | The briefing's order of battle becomes a shared component (`renderOrderOfBattle`) used by the custom screen as a live preview and by the briefing, printing per fleet: faction, formation, arrival, player/AI, counts with AU badges, points. | Task §3; one implementation, two screens. |
| C8 | Final Battle world state: `normandy`, `ascension`, `forces`, `genophage`, `cerberus` (`auto` default resolved from the timeline's `cerberusStance`; the AU choice `allied` is disabled under non-cooperative timelines), `cinematic_arrival` on/off, `beat_scale`, and `distant_layer` (Apex only). Resolution happens in a new `resolveWorldState` so the briefing can print *why* a choice resolved the way it did. | D4; honesty; `WorldStateOption` is static today, so dynamic defaults need one small extension (§3.2). |
| C9 | The seed stays the first `input[type="number"]` in the briefing DOM; new controls are `<select>`/`<input type="range">`. | `e2e/game.spec.ts:79` fills the first number input as the seed. |

## 1. Data model

### 1.1 Types (`src/scenarios/custom.ts`, re-exported from `src/scenarios/index.ts`)

The custom builder moves out of `index.ts` into its own module; `index.ts` re-exports everything so `import { buildCustomBattle, type CustomBattleInput } from '@/scenarios'` keeps compiling.

```ts
import type { FactionId } from '@/data/types';
import type { Environment, FormationType, Side } from '@/simulation/types';

/** v1 — the shipped shape (scenarios/index.ts:615-633). Kept verbatim; never written again, always accepted. */
export interface CustomFleetInputV1 { faction: FactionId; name: string; formation: FormationType; counts: Record<string, number>; }
export interface CustomBattleInputV1 {
  seed: number; rulesId: string; environment: Environment; startingDistanceKm: number;
  sideA: CustomFleetInputV1; sideB: CustomFleetInputV1;
  maxDuration?: number; reinforcementTime?: number; reinforcementCounts?: Record<string, number>;
}

/** Nominal km. z is "forward, toward the enemy" for BOTH sides; the builder mirrors it for side B. */
export interface FleetOffset { x: number; y: number; z: number; }

export type Readiness = 'veteran' | 'regular' | 'reserve';   // PACK_ADOPTION §3f; undefined = timeline default (no override)

export interface CustomFleetInput {
  /** Stable per-card id ("f1", "f2", …), unique within the input. Used for DOM keys, reorder and messages; never shown. */
  id: string;
  faction: FactionId;
  name: string;
  formation: FormationType;
  /** Hull counts by class id. Fighters are never listed (they come from carriers). 0 and missing mean the same. */
  counts: Record<string, number>;
  /** Seconds after battle start; 0 = on the field at t = 0. */
  arrivalTime: number;
  offset: FleetOffset;
  /** Side A only; ignored on side B. Default true on A. An AI-controlled allied fleet fights by its faction doctrine. */
  playerControlled: boolean;
  /** Preset the card was filled from (for the badge and the "modified" marker); informational. */
  presetId?: string;
  readiness?: Readiness;
}

export interface CustomSideInput {
  /** Optional caption ("Sword", "Blockade"); defaults to the fleet names joined. */
  label?: string;
  fleets: CustomFleetInput[];
}

export interface CustomBattleInput {
  version: 2;
  seed: number;
  rulesId: string;
  environment: Environment;
  /** Nominal km between the two sides' first fleets. */
  startingDistanceKm: number;
  maxDuration: number;
  sides: Record<Side, CustomSideInput>;
}

export type AnyCustomBattleInput = CustomBattleInputV1 | CustomBattleInput;
export const isLegacyCustomBattle = (x: unknown): x is CustomBattleInputV1 => !!x && typeof x === 'object' && 'sideA' in (x as object) && 'sideB' in (x as object) && !('version' in (x as object));
```

Everything is plain JSON (storage, export/import, replays). `CustomFleetInput.counts` keeps unknown class ids as saved (a class that disappears from the catalogue is dropped **by the builder**, not by the loader, so an older save survives a catalogue change and reports the drop as a warning, §1.5).

Additions elsewhere, all optional and JSON:

| Type | Field | Use |
| --- | --- | --- |
| `BattleConfig` (`simulation/types.ts`) | `auContent?: boolean` | Custom battle fields an `AU_MODIFIED` class; HUD top bar prints `ALTERNATE UNIVERSE CONTENT`, results banner subtitle too. Scenario builders set it when `rules.category !== 'canon'` or the scenario is `auOnly` (gives the HUD one flag instead of three checks). |
| `BattleConfig` | `sideLabels?: Record<Side, string>` | Results and HUD headings ("SWORD" / "REAPER BLOCKADE") instead of "SIDE A/B". Optional; the HUD keeps "ALLIED FLEET" when absent. |
| `FleetOpts` (`scenarios/index.ts:87-102`) | `nameOffsets?: Record<string, number>` | `fleet()` assigns `names: NAMES[classId]?.slice(offset)` so a second Alliance fleet in the same battle does not also field "SSV Kilimanjaro" (`createShip` numbers unnamed hulls globally, `battle.ts:174-176`, but names are per fleet by index). |
| `ScenarioDef.worldState[]` (`scenarios/index.ts:13-21`) | `showWhen?`, `defaultFor?`, `choices[].availableWhen?` | §3.2. Functions are fine here: `ScenarioDef` is code (it already holds `build`). |

### 1.2 Builder

`buildCustomBattle(input: AnyCustomBattleInput, rules?: RuleSet): BattleConfig`:

1. `const v2 = migrateCustomBattle(input)` (§1.4). `const r = rules ?? getPreset(v2.rulesId)`.
2. `const report = validateCustomBattle(v2, r)` (§1.5). Errors throw (`CustomBattleError` with the report attached); the UI never gets here with errors because the Launch button is disabled, but tests and future callers do. Warnings are attached to the config as `config.notes?: string[]` (optional JSON field) so the HUD can toast the first one at battle start ("2 AU-ONLY HULLS FIELDED UNDER CANON RULES").
3. **Layout.** `half = max(10, startingDistanceKm) / 2`. For side `s` with sign `σ` (A: −1, B: +1) and fleet index `i` in the ordered list:
   - `lane = spreadIndex(i)` = 0, +1, −1, +2, −2, … (the same helper `formations.ts:36` uses), `x = lane × 20` (the Final Battle builder separates its five Sword fleets by 18–20 km nominal, `index.ts:487-491`);
   - `depth = 6 × floor(i / 2)` away from the enemy, `y = (i % 3 === 2 ? 4 : 0) × (lane < 0 ? −1 : 1)` so a third fleet sits above or below the line (the Republics' `(0, 4, −48)` pattern);
   - `position = (x + offset.x, y + offset.y, σ × (half + depth) − σ × offset.z)`, `heading = (0, 0, −σ)`;
   - the user's `offset` is added last, so "z = +10" moves either side 10 km toward its enemy.
   The layout lives in `layoutFleets(side, n, half)` and has a unit test (no two anchors closer than 12 km nominal for n ≤ 8).
4. **Fleet specs.** `fleet(\`custom-${side}${i}\`, f.faction, r, { counts, name, side, position, heading, formation, mult: 1, arrivalTime: f.arrivalTime || undefined, playerControlled: side === 'A' && f.playerControlled, nameOffsets, initialOrder, ws: {} })`. `mult: 1` as today: custom fleets never scale with `fleetStrength`. `nameOffsets[classId]` is the number of hulls of that class already placed in **earlier fleets of either side**, so names are unique across the whole battle; when `NAMES[classId]` runs out, `createShip` falls back to the class short name plus the global counter exactly as today.
5. **Fixed platforms.** Classes whose `role === 'fixed_platform'` (brief §8.10; until the role exists, the `sol_defence_platform` id from `PACK_ADOPTION.md` §3b) are removed from the fleet's `counts` and emitted as a second `FleetSpec` `custom-${side}${i}-platforms` with `formation: 'line_abreast'`, `initialOrder: { order: 'defend_position' }`, the same position and arrival, name `${f.name} — platforms`. Without the split, `anchorSpeed = slowest × 0.95 = 0` (`ai.ts:168-169`) would freeze the mobile hulls. A fleet that is *only* platforms gets `defend_position` on itself and no split. Platform fleets ignore `arrivalTime > 0`? No: a platform that "arrives" is nonsense physically, so the builder forces `arrivalTime 0` for platform fleets and the validator warns (W8).
6. **Readiness.** `f.readiness` → `techOverride: { crewQuality: r.organic.crewQuality × { veteran: 1, regular: 0.85, reserve: 0.6 }[readiness] }` (`PACK_ADOPTION.md` §3f: overrides replace, so the preset's value is multiplied in). `undefined` → no override, so every existing custom battle is unchanged.
7. **Side B player control.** `playerControlled` is forced `false` on side B; `perspectiveSide` stays `'A'`. "Play as side B" (swap perspective and control) is a cheap follow-up — `BattleController.playerFleetIds` and the HUD already key off `config.fleets[].playerControlled` and `config.perspectiveSide` — but it is out of scope here (§6).
8. **AU tagging.** `auContent = fleets.some(f => f.ships.some(s => isAuClass(s.classId)))` where `isAuClass(id) = getShipClass(id).designProvenance.provenance === 'AU_MODIFIED'`. Today **no** class carries that tag: `cerberus_dreadnought` is `estimate(...)` with the note "exists for the AU Cerberus Black Fleet and custom battles" (`ships.ts:586`), so Phase A re-tags its `designProvenance` as `AU_MODIFIED` (what `PACK_ADOPTION.md` §3b specifies for the re-based class). Nothing pins the current tag (no test, no codex entry); the only visible effect is the Fleet Database badge changing from "estimate" to "AU" (`database.ts:31`), which is the correct label. `PACK_ADOPTION.md` §3b adds `normandy_valkyrie`, `cerberus_heavy_cruiser` and `sol_defence_platform` with the tag; `reaper_oculus` is canon and stays `estimate`. The rule is data-driven on purpose: an AU class added later is badged everywhere without touching the editor. `name = \`Custom${auContent ? ' (AU)' : ''}: ${label('A')} vs ${label('B')}\`` where `label(side) = sides[side].label ?? first two fleet names joined with " + " + " +N more"`.
9. Config: `id: custom-${r.id}-${seed}`, `scenarioId: 'custom'`, `environment`, `maxDuration`, `perspectiveSide: 'A'`, `objective: 'Destroy the enemy force.'`, `sideLabels`, `auContent`, `fleets`.

The old builder's observable behaviour is preserved for migrated v1 inputs: two fleets at `z = ∓half`, headings `±z`, ids differ (`custom-A0`/`custom-B0`/`custom-B1` instead of `custom-a`/`custom-b`/`custom-b2`), which nothing persists; the reinforcement fleet keeps `arrivalTime = reinforcementTime` and `z = half + 30` through a migrated `offset.z = −30`.

### 1.3 United-fleet presets (`src/scenarios/customPresets.ts`)

A preset is data: one or more **cards** (fleets) plus labels and provenance. Single-card presets appear in each fleet card's composition menu; multi-card presets ("bundles") appear in the Presets panel because they add cards.

```ts
export interface FleetPreset {
  id: string;
  label: string;
  /** Printed under the label. */
  note: string;
  /** Provenance of the composition as a whole; counts are always SIMULATION_ESTIMATE, the tag says whether the formation EXISTS in canon. */
  provenance: 'CANON_CONFIRMED' | 'CANON_INFERRED' | 'SIMULATION_ESTIMATE' | 'AU_MODIFIED';
  /** AU presets are listed under "ALTERNATE UNIVERSE" and badged; `requires` disables them with a reason when the timeline lacks the flag. */
  au?: boolean;
  requires?: (rules: RuleSet) => string | undefined;   // returns the reason when NOT available
  cards: Omit<CustomFleetInput, 'id' | 'playerControlled' | 'offset'>[];  // arrivalTime is relative to the bundle's drop
}
```

Counts in the table are `SIMULATION_ESTIMATE` compressed stand-ins (DN dreadnought, CV carrier, CA cruiser, FF frigate). `apexCerberus(rules) = rules.strategic.cerberusStance === 'cooperative' && rules.special.hyperMassAccelerators` is the generalised predicate from `PACK_ADOPTION.md` §3a (replaces `rules.id === 'prime_apex'` at `index.ts:349`); Apex-only classes are listed only when they exist in `SHIP_CLASSES`, so the table degrades gracefully until §3b lands.

| id | Label | Cards (faction · counts · formation · arrival) | Provenance / availability |
| --- | --- | --- | --- |
| `sword_alliance` | Sword Fleet (Alliance) | alliance · 6 DN, 2 CV, 16 CA, 24 FF, 1 Normandy SR-2 (+ 1 `normandy_valkyrie` when `special.valkyrieAvailable`) · `line_abreast` · 0 | name CANON_CONFIRMED; Valkyrie card row AU_MODIFIED |
| `hammer_escort` | Hammer escort group | alliance · 1 CV, 4 CA, 12 FF · `defensive_screen` · 30 s | name CANON_CONFIRMED (Hammer is the ground force); composition SIMULATION_ESTIMATE; note: "the landing transports are not modelled; the escort fights as a screen" |
| `hierarchy_battle_group` | Hierarchy battle group | turian · 5 DN, 10 CA, 16 FF · `line_abreast` · 0 | SIMULATION_ESTIMATE (the Sword Hierarchy composition, `index.ts:488`) |
| `republics_fleet` | Republics fleet | asari · 1 Destiny Ascension, 2 DN, 8 CA · `defensive_screen` · 0 | Ascension CANON_CONFIRMED (presence is player-dependent); counts SIMULATION_ESTIMATE; note offers the Thessia home-fleet variant 4 DN / 20 CA |
| `union_first_fleet` | Salarian First Fleet | salarian · 2 DN, 8 CA, 12 FF · `line_abreast` · 0 | name CANON_INFERRED (the Dalatrass' offer, ME3 dialogue); counts SIMULATION_ESTIMATE |
| `geth_quarian_joint` | Geth–Quarian joint command (bundle, 2 cards) | geth · 1 DN, 8 CA, 12 FF · `strike_wedge` · 0; quarian · 3 Heavy Fleet warships, 10 Patrol Fleet cruisers · `defensive_screen` · 0 | existence CANON_CONFIRMED (peace outcome, player-dependent); counts SIMULATION_ESTIMATE |
| `citadel_fleet` | Citadel Fleet, 2183 (bundle, 2 cards) | turian · 3 DN, 10 CA, 14 FF · `line_abreast` · 0 "Citadel Fleet (Hierarchy)"; asari · 1 Destiny Ascension, 6 CA · `defensive_screen` · 0 "Citadel Fleet (Republics)" | CANON_CONFIRMED existence; counts SIMULATION_ESTIMATE (`index.ts:433-434`) |
| `cerberus_strike_fleet` | Cerberus strike fleet | cerberus · 10 CA, 16 FF · `strike_wedge` · 0 | canon-shaped (Cerberus fields cruisers, frigates, fighters in ME3) SIMULATION_ESTIMATE |
| `cerberus_black_fleet` | Cerberus Black Fleet (AU) | cerberus · 2 `cerberus_dreadnought`, 2 `cerberus_heavy_cruiser` (when the class exists), 6 CA, 10 FF · `strike_wedge` · 0 | **AU_MODIFIED**; `requires: r => apexCerberus(r) ? undefined : 'Needs a timeline where Cerberus cooperates and fields Project Titan (Prime/Apex presets).'` |
| `reaper_harvest_group` | Reaper harvest group | reaper · 4 capitals, 8 destroyers · `strike_wedge` (→ `reaper_swarm` once the 3D formation exists) · 0 | SIMULATION_ESTIMATE |
| `harbinger_armada` | Harbinger's armada (bundle, 2 cards) | reaper · Harbinger, 6 capitals, 14 destroyers · `strike_wedge` · 0 "Reaper blockade"; reaper · 3 capitals, 8 destroyers · `strike_wedge` · 90 s "Reaper reserve" | Harbinger CANON_CONFIRMED; counts SIMULATION_ESTIMATE (`index.ts:493-494`) |
| `sol_platforms` | Sol defence platforms (AU) | alliance · 4 `sol_defence_platform` · `line_abreast` · 0, `defend_position` | **AU_MODIFIED**; `requires: r => r.special.fixedPlatforms ? undefined : 'Needs an Apex timeline (fixed platforms).'` |
| `sword_combined` | Sword — combined fleet, arrival waves (bundle, 5 cards) | `sword_alliance` at 0 s, `hierarchy_battle_group` at 4 s, `republics_fleet` at 8 s, geth card at 12 s, quarian card at 16 s | SIMULATION_ESTIMATE; **125 hulls**, which is above today's 70 cap on purpose: it is the showcase of the cap UX (§1.5, §2.3) until §8.2 lifts the cap |

`FACTION_DEFAULTS` (`custom.ts:19-28`) stays as the composition applied when a card's **faction** changes; it never contains AU classes (`cerberus_dreadnought: 0` today stays 0).

Bundles in the Presets panel (whole-battle setups, `data-bundle`): `reference` (the current "Reference engagement"), `destroyer_hunt`, `harbinger_at_earth` (the current three, re-expressed as v2 inputs), `final_battle_sword` (= `sword_combined` vs `harbinger_armada`, Earth orbit, 540 s), `citadel_2183` (= `citadel_fleet` + Alliance Fifth Fleet 3 DN / 10 CA / 16 FF arriving at 40 s vs 1 Sovereign-class + geth escort 2 DN / 14 CA / 22 FF, Citadel environment), `apex_black_fleet` (AU: `sword_alliance` + `cerberus_black_fleet` vs `harbinger_armada`; disabled with the `requires` reason under non-Apex timelines), `reaper_civil_war` (reaper 3 capitals / 6 destroyers vs Harbinger + 6 destroyers — the Cerberus Ascendant scenario's shape, shows Reaper-vs-Reaper works).

### 1.4 Migration (storage key `customBattle`)

`migrateCustomBattle(raw: unknown): CustomBattleInput` is total: it never throws on shapes it does not understand, it returns `DEFAULT_INPUT` for garbage and records what it did in `migrationNotes`.

| Input | Output |
| --- | --- |
| `version === 2` | Returned after normalisation: missing `arrivalTime`→0, missing `offset`→`{0,0,0}`, missing `playerControlled`→`true`, missing `id`→`f${n}`, non-finite numbers→0, counts clamped to `[0, classMax]` (§1.5), `maxDuration`→420 if missing, `startingDistanceKm`→76 if missing. |
| v1 (`sideA`, `sideB`, no `version`) | `sides.A.fleets = [{ id: 'f1', ...sideA, arrivalTime: 0, offset: 0, playerControlled: true }]`; `sides.B.fleets = [{ id: 'f2', ...sideB, arrivalTime: 0, offset: 0, playerControlled: false }]`; if `reinforcementTime > 0 && Σ reinforcementCounts > 0` a third fleet `{ id: 'f3', faction: sideB.faction, name: \`${sideB.name} reinforcements\`, formation: sideB.formation, counts: reinforcementCounts, arrivalTime: reinforcementTime, offset: { x: 0, y: 0, z: -30 } }`; `maxDuration ?? 420`; `version: 2`. |
| partial v1 (what `custom.ts:46-51` merges field by field today) | Same, missing fields from `DEFAULT_INPUT` v1 side defaults; this is what keeps a save from a release that lacked `reinforcementCounts` loading. |
| anything else | `DEFAULT_INPUT` + note. |

The storage key stays `customBattle`; `renderCustom` reads it through `loadCustomBattle(): Promise<{ input, notes }>` (= `storage.get` + `migrateCustomBattle`) and writes the v2 shape back on *Save setup* and on *Launch* exactly as today (`custom.ts:147,152`). `exportAll`/`importAll` (`storage.ts:124,150`) pass the record through opaquely, so an exported v1 save imports and migrates on the next open. Settings' "Clear save data" (`settings.ts:87`) is unchanged.

### 1.5 Validation

`validateCustomBattle(input: CustomBattleInput, rules: RuleSet): ValidationReport`:

```ts
export interface SideTotals { hulls: number; points: number; fighters: number; capitals: number; auHulls: number; factions: FactionId[]; }
export interface ValidationReport {
  ok: boolean;                       // no errors
  errors: { code: string; side?: Side; fleetId?: string; text: string }[];
  warnings: { code: string; side?: Side; fleetId?: string; text: string }[];
  totals: Record<Side, SideTotals>;
  cap: number; hardCap: number;      // SHIP_CAP_PER_SIDE, HARD_SHIP_CAP
}
```

Rules (E = error, launch disabled; W = warning, shown in the card or the side bar and toasted once at battle start):

| Code | Condition | Text / action |
| --- | --- | --- |
| E1 | a side has 0 hulls (fighters do not count) | `BOTH SIDES NEED AT LEAST ONE SHIP` (today's toast, kept verbatim) |
| E2 | a side has more than `HARD_SHIP_CAP` hulls | "Side B: 320 hulls. The hard limit is 105 (1.5 × the 70-hull cap). Scale to cap or remove fleets." Launch disabled. |
| E3 | a fleet has an unknown class id **and** nothing else | "Fleet 'X' has no deployable hulls under this catalogue." (unknown ids alone are W4) |
| E4 | more than 8 fleets on a side | The *Add fleet* button is disabled at 8; the validator guards imported saves. |
| W1 | hulls > `SHIP_CAP_PER_SIDE` | "Side A: 125 hulls, above the 70-hull cap the renderer and far-point cloud are tuned for. Scale to cap or launch anyway." + `[data-action="scale-to-cap"]` |
| W2 | a side has no fleet with `arrivalTime 0` | "Nothing on the field for side B until T+45 s." (allowed because of the `checkEnd` guard, C4) |
| W3 | an `arrivalTime ≥ maxDuration` | "Fleet 'Reaper reserve' arrives at 600 s, after the 420 s time limit." |
| W4 | a count refers to a class id missing from `SHIP_CLASSES` | "Class 'x' is no longer in the catalogue; dropped." (saved input untouched) |
| W5 | AU class fielded (`isAuClass`) | "2 alternate-universe hulls fielded. The battle is labelled AU." (always, also under AU timelines — the label is the point) |
| W6 | the same unique hull in two fleets of one side (`harbinger`, `destiny_ascension`, `alliance_frigate_thanix`, `normandy_valkyrie`) | "Only one Harbinger can exist; the second is dropped." The builder keeps the first. |
| W7 | Reapers on both sides, or Reapers alongside organics on a side | "Reaper-vs-Reaper: the Reaper intel panel reports from the first Reaper side only." / "Mixed Reaper and organic fleets fight by their own doctrines; there is no joint command." |
| W8 | platform fleet with `arrivalTime > 0` or non-zero `offset.z` toward the enemy | "Platforms cannot arrive or advance; arrival reset to 0." |
| W9 | `hulls + fighters` (carrier and liveship complements, Oculi once adopted) > `ENTITY_BUDGET` (400 today) | "Entity budget: 310 hulls + 160 fighters. Expect lower frame rates on phones." |
| W10 | hostile Cerberus and Reapers on the same side | "Two-side simulation: Cerberus fights beside the Reapers and is not shot at by them." (the same limitation `CINEMATIC_DESIGN.md` §1.4 states for the Final Battle) |

Per-class UI clamp `classMax(cls)`: unique hulls 1; `super_dreadnought` 4; `dreadnought`, `carrier`, `reaper_capital` 24; `cruiser`, `reaper_destroyer` 80; `frigate` 120; `fixed_platform` 12 (today's single clamp of 60, `custom.ts:76-77`, goes). The side cap governs totals, not the class clamp.

**Scale to cap** (`scaleSideToCap(side, cap)`, pure, deterministic): `k = cap / hulls`; every class count becomes `max(1, round(n × k))` for `n > 0` (the campaign's `scaleCounts`, `engine.ts:76-80`, which guarantees a 1-ship class survives); unique hulls stay at 1; if rounding leaves the side above the cap, reduce the largest `frigate` count by one, then the largest `cruiser`, then the largest `reaper_destroyer`, cycling until `hulls ≤ cap` (never below 1 per class). The reduction order is fixed so the result is reproducible and the test can pin it. Capitals are never reduced below their rounded value by the fix-up pass, so a 125-hull Sword fleet scaled to 70 keeps every dreadnought.

**Simulation guard (C4).** `checkEnd` (`battle.ts:919-926`) gains `const pendingA = this.pendingFleets.some(f => f.side === 'A')` (and B) and treats `aAlive || pendingA` as alive; the `'Side A fleet destroyed'` / `'withdrew'` reasons are unchanged. Beat-spawned fleets (`arrivalMode: 'beat'`, `CINEMATIC_DESIGN.md` §1.1) are counted as pending until spawned. Unit test: a side whose single fleet arrives at 45 s is not judged at t = 0, deploys at 45 s (`reinforcement_arrival`), and the battle then runs to a normal result.

### 1.6 Determinism

The builder, the layout, the name offsets, the scale-to-cap pass and the validator are pure functions of `(input, rules)`; none reads the clock or `Math.random`. The editor's only entropy is the seed field; a *Randomise seed* button (UI only, `Math.random` is allowed outside the sim) is fine. Replays rebuild from the stored `BattleConfig` (`app.ts` replay path), not from the editor state, and all new config fields are JSON. A unit test runs the same v2 input twice and compares `JSON.stringify(sim.events)` (the pattern `tests/battle.test.ts` already uses).

## 2. The custom battle screen

### 2.1 Layout

Three columns in the existing `.grid3` (collapses to one at ≤ 1100 px, `style.css:175-184`), each a `.panel` stack. Nothing new in the design language: `.panel`, `.panel-title`, `label.field`, `.row`, `.col`, `.btn.small`, `.badge.au|estimate|canon|inferred`, `.tag`, `.bar`, `.entry-block`.

```
┌ SIDE A — PLAYER ───────────── 1,942 pts ┐ ┌ SIDE B — OPPONENT ────── 6,480 pts ┐ ┌ CONDITIONS ───────────────────────┐
│ ▮▮▮▮▮▮▮▮▮▮▮▮▮░░░░  57 / 70 hulls  +16 ✈ │ │ ▮▮▮▮░░░░░░░░░░░░  12 / 70 hulls    │ │ Technology / timeline  [Canon ME3 ▾]│
│ ┌ FLEET 1 · ALLIANCE ─────────── ▲ ▼ ✕ ┐ │ │ ┌ FLEET 1 · REAPER ───────── ▲ ▼ ✕ ┐ │ │ Battlefield            [Deep space ▾]│
│ │ Faction [Systems Alliance ▾]          │ │ │ │ Faction [Reaper Harvest Fleet ▾]   │ │ │ Starting distance: 76 km  ──●────── │
│ │ Composition [Sword Fleet (Alliance)▾] │ │ │ │ Composition [Reaper harvest grp ▾] │ │ │ Random seed  [42      ] [⟲]          │
│ │ Fleet name  [Sword Fleet (Alliance) ] │ │ │ │ Fleet name  [Reaper harvest group ] │ │ │ Time limit (s) [420   ]              │
│ │ Formation [Broad defensive line ▾]    │ │ │ │ Formation [Concentrated strike ▾]  │ │ ├ PRESETS ───────────────────────────┤
│ │ Arrival T+ [0   ] s   ☑ Player-controlled│ │ │ Arrival T+ [0   ] s                │ │ │ Reference engagement               │
│ │ ▸ Position offset (x y z, km)         │ │ │ │ ▸ Position offset                  │ │ │ Destroyer hunt (small)             │
│ │ ─────────────────────────────────────  │ │ │ │ ─────────────────────────────────  │ │ │ Harbinger at Earth (large)         │
│ │ DREADNOUGHTS                          │ │ │ │ CAPITAL SHIPS                       │ │ │ Final Battle: Sword vs the armada  │
│ │ Kilimanjaro-class dreadnought 320 [ 6]│ │ │ │ Harbinger            4000  [ 0]     │ │ │ Battle of the Citadel, 2183        │
│ │ CARRIERS                              │ │ │ │ Sovereign-class       2600  [ 4]    │ │ │ Reaper civil war                   │
│ │ Alliance carrier (+8 ✈)  300     [ 2] │ │ │ │ DESTROYERS                          │ │ │ ── ALTERNATE UNIVERSE ──            │
│ │ CRUISERS … FRIGATES …                 │ │ │ │ Reaper destroyer       260  [ 8]    │ │ │ Apex: Black Fleet joins the line AU│
│ │ 49 hulls · 5,196 pts · +16 fighters   │ │ │ │ 12 hulls · 12,480 pts               │ │ ├ ORDER OF BATTLE (preview) ▸ ──────┤
│ └───────────────────────────────────────┘ │ │ └────────────────────────────────────┘ │ │ … shared component, §2.6            │
│ [+ Add fleet ▾ composition]               │ │ [+ Add fleet ▾ composition]            │ ├ CHECKS ─────────────────────────────┤
│ ┌ FLEET 2 · TURIAN · arrives T+30 ─ ▲▼✕ ┐ │ │                                        │ │ ⚠ Side A: 125 hulls, above the cap… │
│ │ (collapsed: 31 hulls · 3,026 pts)     │ │ │                                        │ │   [Scale A to cap]                  │
│ └───────────────────────────────────────┘ │ │                                        │ │ ⓘ 2 AU hulls fielded — labelled AU  │
└───────────────────────────────────────────┘ └────────────────────────────────────────┘ └─────────────────────────────────────┘
[← Main menu]                                                   [Reset] [Save setup] [Launch →]
```

### 2.2 Fleet card anatomy (`.fleet-card`, `data-fleet-card="A:0"`)

| Element | Behaviour | Hooks |
| --- | --- | --- |
| Header | `FLEET n · <FACTION SHORT NAME>` + chips: `AU` badge when the card fields an AU class, `T+30s` when arriving, `AI` when a side-A fleet is not player-controlled, `modified` when counts differ from `presetId`. Click collapses/expands the card body (state kept per card id in the input? No: UI-only, in a `Set` on the screen). Cards after the first open collapsed when there are ≥ 3 cards. | `data-action="toggle-fleet"` |
| ▲ ▼ | Reorder within the side (order = layout lane and deployment order). Disabled at the ends. | `data-action="move-up"`, `data-action="move-down"`, `data-fleet="A:1"` |
| ✕ | Remove: first click turns the button into `Remove?` for 3 s, second click removes (no confirm dialog, no undo system). The last fleet on a side cannot be removed (counts can be zero instead). | `data-action="remove-fleet"` |
| Duplicate | Copies the card below itself with ` (2)` appended and arrival `+15 s`. | `data-action="duplicate-fleet"` |
| Faction `<select>` | Applies `FACTION_DEFAULTS[faction]` (name, formation, counts) like today (`custom.ts:62-69`); keeps arrival/offset. | `data-faction-fleet="A:0"` (+ legacy `data-faction="sideA"` on card 0) |
| Composition `<select>` | First option `— composition —`; optgroups `CANON-SHAPED` and `ALTERNATE UNIVERSE`; single-card presets only (bundles live in the Presets panel). Choosing one sets faction, name, formation, counts, arrival **if the card's arrival is 0**, and `presetId`. AU options read `… (AU)`; unavailable ones are `disabled` with the `requires` reason as `title`. | `data-preset="A:0"` |
| Fleet name | Text input, 40 chars. | `data-fleet-name="A:0"` |
| Formation `<select>` | Options from `FORMATION_LABELS` so new 3D formations appear automatically; optgroups `FLAT` (today's six) and `3D STACKED` once ids with a `stacked`/`layered`/`box`/`swarm` prefix exist (proposed ids for the formations workstream: `layered_line`, `stacked_wedge`, `box`, `reaper_swarm`; this document does not own their slot maths). | `data-formation="A:0"` |
| Arrival | `input[type=number]` 0–1800 s, step 5. Changing 0 → >0 on a card whose offset is all zero sets `offset.z = −30` (behind the line, like the old reinforcements) and shows the Position row. | `data-arrival="A:0"` |
| Player-controlled | Checkbox, side A only; default on. Unchecked → `AI` chip; the HUD lists the fleet's ships under ALLIED FLEET but orders do not reach it (`BattleController.playerFleetIds`, `app.ts:106`). | `data-player="A:0"` |
| Readiness `<select>` | `Timeline default` / `Veteran` / `Regular` / `Reserve`, with a `SIMULATION_ESTIMATE` badge and tooltip "crew quality ×1 / ×0.85 / ×0.6". | `data-readiness="A:0"` |
| ▸ Position offset | Collapsed row of three `input[type=number]` (x, y, z nominal km, −60..60), labels `lateral`, `vertical`, `forward (toward enemy)`. | `data-offset="A:0:x"` etc. |
| Counts table | Rows for `SHIP_CLASS_LIST.filter(c => c.faction === faction && c.role !== 'fighter')`, grouped under role headings in the order `super_dreadnought` → `reaper_capital` → `dreadnought` → `carrier` → `cruiser` → `reaper_destroyer` → `frigate` → `fixed_platform`; each row: class name, `AU` badge for `AU_MODIFIED` design provenance, `fixed` chip for platforms, `+N ✈` for classes with a `fighterComplement`, points each, `input[type=number]` `0..classMax`. Unique hulls render as a checkbox-styled 0/1 input. | `data-count-fleet="A:0:<classId>"` on every row; legacy `data-count="sideA:<classId>"` **only on card 0 of each side** |
| Footer | `49 hulls · 5,196 pts · +16 fighters`. | `data-fleet-total="A:0"` |

Role headings use the `ShipRole` union; until `super_dreadnought`/`fixed_platform` exist the groups are simply absent (the grouping function maps unknown roles to "OTHER" rather than throwing).

### 2.3 Side totals (`.side-totals`, sticky at the top of each side column)

- Points (`Σ pointValue × count`, as `points()` does today) in the panel title; hull count and cap as a `.bar` (`<i>` width `min(1, hulls / cap)`), coloured blue under the cap, orange above it, red above the hard cap.
- Text `57 / 70 hulls · +16 fighters · 3 factions`. Faction chips (short names) when the side mixes factions.
- Under the bar, when W1: `⚠ above cap` + `[Scale to cap]`; when E2: `✕ above hard limit`.
- A balance line `A 5,196 pts : B 12,480 pts (1 : 2.4)` in `.dim`. No win probability, no "balanced" verdict: the honesty rule forbids pretending the point values predict outcomes (they are balancing weights, `ShipClassDef.pointValue`).

Hooks: `data-total="A"` (hull text), `data-points="A"`, `data-cap="A"` (bar), `data-cap-warning="A"` (present only when over the cap), `data-action="scale-to-cap"` with `data-side="A"`.

### 2.4 Conditions panel (unchanged fields, two additions)

Timeline (`data-field="timeline"`, option text gains ` [AU]`/` [CUSTOM]` like the briefing), battlefield (`data-field="environment"`; adds `citadel` "Citadel (Serpent Nebula)" and `relay` "Mass relay approach", both implemented in `rendering/environment.ts:361-375`), starting distance slider 30–240 km (was 160; the wider fleets of §8.2 need room; `data-field="distance"`), seed (`data-field="seed"` + `[⟲]` randomise), time limit 60–1800 (`data-field="max-duration"`). When the timeline is not canon the panel prints the briefing's orange line `ALTERNATE UNIVERSE: <name>. Results do not represent canon Mass Effect 3.`; when `special.legacyNova` is true it adds `HIGH POWER — EASIER BY DESIGN` (`PACK_ADOPTION.md` §3a).

### 2.5 Presets panel

Buttons (`.btn.small`, `data-bundle="<id>"`) for the bundles of §1.3, canon-shaped first, then a `── ALTERNATE UNIVERSE ──` divider and the AU bundles with the `AU` tag; unavailable AU bundles are `disabled` with the `requires` reason as `title` and a `.dim` line under the button ("Needs a timeline where Cerberus cooperates…"). Applying a bundle replaces both sides, environment and time limit; applying a bundle to **one side only** is the card-level composition menu's job (`+ Add fleet ▾` offers the same list including multi-card presets, which add their cards to that side).

### 2.6 Order-of-battle preview

A collapsible panel (`data-action="toggle-oob"`, closed by default on phones) that calls `buildCustomBattle(input, rules)` on every change (cheap: it builds specs, not a simulation) and renders the shared `renderOrderOfBattle(config, 'A')` / `('B')` component (§3.1). Errors from the validator show the panel's body as the error list instead. This is the "custom battles show an order of battle per fleet" requirement: the custom screen launches directly into the battle and never visits the briefing, so the preview lives here.

### 2.7 Labels and honesty

- Compositions carry a `SIMULATION_ESTIMATE` badge in the composition menu's group heading ("compressed stand-ins for far larger canon fleets"). Nothing in the editor shows the 38,420 / 53,000 figures: D13 limits them to Apex scenario captions and the Showcase.
- AU classes, AU presets, AU bundles and AU timelines are badged wherever they appear; a launched config with AU hulls is named `Custom (AU): …` and carries `auContent`.
- The Cerberus Black Fleet, Valkyrie and platform rows say `AU` in the row and `(AU)` in the class name (`PACK_ADOPTION.md` §3b names them so).
- No preset is called "balanced" or "historical". The reference engagement keeps its descriptive name.

### 2.8 `data-*` hook table

Kept, unchanged semantics (used by `e2e/game.spec.ts:119-124`):

| Hook | Where | Note |
| --- | --- | --- |
| `[data-menu="custom-battle"]`, `[data-menu="scenario-editor"]` | main menu | unchanged (`menu.ts:30,35`) |
| `[data-action="launch-custom"]` | footer | now `disabled` while the report has errors or the saved setup is still loading (`data-state="loading"`); Playwright's `click` waits for enabled, so the existing test is unaffected |
| `[data-count="sideA:<classId>"]`, `[data-count="sideB:<classId>"]` | count inputs of **card 0** of each side | alias; `DEFAULT_INPUT` keeps side B card 0 = Reaper harvest group so `sideB:reaper_capital` and `sideB:reaper_destroyer` exist on first render |
| `[data-faction="sideA"]`, `[data-faction="sideB"]` | faction select of card 0 | alias |

New (every card, every side):

| Hook | Element |
| --- | --- |
| `[data-side="A|B"]` | side column |
| `[data-fleet-card="A:0"]` | card root; `data-fleet-id="f1"` as well |
| `[data-count-fleet="A:0:<classId>"]` | count input (uniform form; card 0 carries both this and the legacy `data-count`) |
| `[data-faction-fleet="A:0"]`, `[data-preset="A:0"]`, `[data-fleet-name="A:0"]`, `[data-formation="A:0"]`, `[data-arrival="A:0"]`, `[data-player="A:0"]`, `[data-readiness="A:0"]`, `[data-offset="A:0:x|y|z"]` | card controls |
| `[data-action="add-fleet"][data-side="A"]`, `[data-action="remove-fleet"][data-fleet="A:1"]`, `[data-action="duplicate-fleet"]`, `[data-action="move-up"]`, `[data-action="move-down"]`, `[data-action="toggle-fleet"]` | card actions |
| `[data-total="A"]`, `[data-points="A"]`, `[data-cap="A"]`, `[data-cap-warning="A"]`, `[data-action="scale-to-cap"][data-side="A"]` | side totals |
| `[data-field="timeline|environment|distance|seed|max-duration"]`, `[data-action="randomise-seed"]` | conditions |
| `[data-bundle="reference|destroyer_hunt|harbinger_at_earth|final_battle_sword|citadel_2183|apex_black_fleet|reaper_civil_war"]` | presets panel |
| `[data-action="toggle-oob"]`, `[data-oob="A:0"]` | order-of-battle preview and its fleet entries |
| `[data-validation]`, `[data-validation-level="error|warning"]`, `[data-validation-code="W1"]` | checks list |
| `[data-action="save-custom"]`, `[data-action="reset-custom"]` | footer (today's *Save setup* button gains the hook; *Reset* is new) |

### 2.9 Phone-width behaviour

Breakpoints already in `style.css`: 1100 (grid → one column), 900 (screen padding), 760 (phone HUD). Additions:

```css
.custom-layout { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }   /* = .grid3, named so it can be reordered */
.fleet-card { border: 1px solid var(--line); padding: 10px 12px; margin-bottom: 10px; }
.fleet-card table { table-layout: fixed; }                      /* no horizontal scroll */
.fleet-card td:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-totals { position: sticky; top: 0; z-index: 1; background: var(--panel-solid); padding: 8px 0; }
@media (max-width: 1100px) {
  .custom-layout { grid-template-columns: 1fr; }
  .custom-layout > .custom-conditions { order: -1; }           /* timeline first: it decides which classes are AU-available */
  .fleet-card .counts { grid-template-columns: 1fr 84px; }
}
@media (max-width: 760px) {
  .fleet-card { padding: 8px 10px; }
  .fleet-card .btn.small, .side-totals .btn.small { min-height: 32px; }
  .fleet-card [data-action="move-up"], .fleet-card [data-action="move-down"], .fleet-card [data-action="remove-fleet"] { width: 36px; height: 36px; padding: 0; text-align: center; }
  .fleet-card input, .fleet-card select { font-size: 16px; }   /* iOS does not zoom into inputs ≥ 16 px */
  .custom-oob { display: none; }                                /* preview only on request */
  .custom-oob.open { display: block; }
}
@media (pointer: coarse) { .fleet-card input[type="number"] { min-height: 40px; } }
```

Rules: one column, conditions first, then side A, then side B; cards after the first start collapsed; the composition menu and *Add fleet* are native `<select>` elements (phone pickers); the screen footer already wraps at ≤ 900 px (`style.css:189`) so *Reset / Save / Launch* stay reachable; `number` inputs carry `inputmode="numeric"`; no element is wider than the viewport (e2e asserts `scrollWidth ≤ clientWidth`, §4.2). The side-totals bar is sticky so the cap warning stays visible while scrolling a long card stack.

### 2.10 Loading and saving flow

`renderCustom` renders the header, an empty body with `data-state="loading"` and a disabled footer, then `await loadCustomBattle()` and renders the body. Today the body renders immediately and a later `storage.get` resolution re-renders over the user's edits (`custom.ts:46-51`); the await closes that race. IndexedDB opens in milliseconds, and Playwright's auto-wait covers the e2e. `input.rulesId = app.prefs.lastTimelineId` is applied **only when no saved setup exists** (today it is applied before the load and then overwritten by the saved `rulesId`, which is the same result in practice). *Save setup* and *Launch* write v2; *Reset* restores `DEFAULT_INPUT` (v2 form of today's `DEFAULT_INPUT`, `custom.ts:31-41`, which keeps Alliance Task Force vs Reaper harvest group so the e2e's first render is unchanged) and clears the saved record.

## 3. Briefing integration

### 3.1 Shared order-of-battle component (`src/ui/components/orderOfBattle.ts`)

`renderOrderOfBattle(config: BattleConfig, side: Side, opts?: { compact?: boolean }): HTMLElement[]` replaces `fleetSummary` in `briefing.ts:28-36` and feeds the custom preview. Per fleet, an `.entry-block` (`.entry-block.au` when the fleet fields an AU class):

```
Sword Fleet (Alliance)                               [ALLIANCE] [Broad defensive line] [PLAYER]   5,196 pts
6× Kilimanjaro-class dreadnought · 2× Alliance carrier (+8 fighters each) · 16× Alliance cruiser · 24× Alliance frigate · 1× Normandy SR-2
Cerberus Black Fleet (AU)              arrives T+12 s  [CERBERUS] [Concentrated strike group] [AI] [AU]   2,120 pts
2× Cerberus Black Fleet dreadnought [AU] · 6× Cerberus cruiser · 10× Cerberus frigate
Cerberus strike group              arrives T+150 s  [CERBERUS (HOSTILE)] …   — fights beside the Reapers (two-side simulation)
```

Chips are `.badge` elements: faction short name (`.badge.inferred` colour), formation label, `PLAYER`/`AI` (side A only), `AU` (`.badge.au`) when any class is AU, arrival as today (`(arrives T+45s)`). The HUD's `CERBERUS (HOSTILE)` label from `CINEMATIC_DESIGN.md` §1.4 is produced here too, from `faction === 'cerberus' && side === 'B'`. Below both panels the briefing prints `Simulated hulls: 115 (compressed stand-in for the canon engagement)` and, under Apex presets with the distant layer on, `+ distant engagement layer — statistical; the 38,420-warship figure is an AU scenario value` (D13; the number itself is printed only there and only under Apex).

### 3.2 Final Battle of Earth world state

Extension of `WorldStateOption` (`scenarios/index.ts:13-21`), all optional:

```ts
export interface WorldStateChoice { id: string; label: string; description: string; availableWhen?: (rules: RuleSet) => boolean; au?: boolean; }
export interface WorldStateOption {
  id: string; label: string; kind: 'player_dependent' | 'extrapolation' | 'au'; description: string;
  choices: WorldStateChoice[]; default: string;
  /** Resolves 'auto'-style defaults from the rule set; the briefing prints the resolution. */
  defaultFor?: (rules: RuleSet) => string;
  /** Hide the option entirely (e.g. Apex-only layers). */
  showWhen?: (rules: RuleSet) => boolean;
  /** Only meaningful under a condition; shown disabled with this text otherwise. */
  disabledWhen?: (rules: RuleSet, ws: Record<string, string>) => string | undefined;
}
export function resolveWorldState(s: ScenarioDef, rules: RuleSet, ws: Record<string, string>): { ws: Record<string, string>; notes: string[] }
```

`resolveWorldState` fills missing keys from `default`, replaces `'auto'` with `defaultFor(rules)`, coerces a choice whose `availableWhen` is false to the resolved default with a note ("Allied Cerberus needs a cooperative-Cerberus timeline; resolved to HOSTILE under Canon ME3."), and drops keys of hidden options. Builders receive the resolved record; the briefing prints the notes under the controls. `buildScenario` (`index.ts:605-609`) calls it so headless and test paths resolve identically.

The Final Battle's options, in display order:

| id | kind | choices | default | Notes |
| --- | --- | --- | --- | --- |
| `normandy` | player_dependent | yes / no | yes | `SHEPARD_WORLD_STATE` reused. Today the default fleet hard-codes `alliance_frigate_thanix: 1` (`index.ts:487`); the builder reads the option instead. |
| `ascension` | player_dependent | present / absent | present | The builder already reads `ws.ascension` (`index.ts:489`) but the option is not declared, so the control never appears. Declaring it is a fix, not a feature. |
| `forces` | extrapolation | campaign / default | campaign | `disabledWhen`: no saved campaign → "No saved campaign: the default combined fleet is used." (today the fallback is silent, `index.ts:483-486`). With campaign forces, `cerberus` is disabled: "The campaign's fleets decide; Cerberus campaign fleets at Sol are not modelled (absent)." |
| `genophage` | player_dependent | cured / sabotaged | cured | unchanged |
| `cerberus` | extrapolation | `auto` ("By timeline: allied when Cerberus cooperates, hostile otherwise") / `allied` (**AU**, `availableWhen: r => r.strategic.cerberusStance === 'cooperative' \|\| r.strategic.cerberusStance === 'controls_reapers'`) / `hostile` / `absent` | auto; `defaultFor: r => cooperative ? 'allied' : 'hostile'` | D4. Mechanics per `CINEMATIC_DESIGN.md` §1.4: allied → side-A Cerberus fleet (Black Fleet classes when `apexCerberus(rules)`, canon Cerberus hulls otherwise) spawned by the `arrive_cerberus` beat when the opening is on, `arrivalTime 12` when off; hostile → side-B strike group `cerberus_cruiser × 8, cerberus_frigate × 12`, `arrivalTime 150`, `priority: 'capitals'`; absent → none. Under canon the default is therefore a hostile group at 150 s (D4 "hostile under canon"); the briefing says so in the HOSTILE order of battle. |
| `cinematic_arrival` | extrapolation | on / off | on | Beat-scheduled opening (`finalBattleBeats.ts`). Off keeps today's geometry and orders. |
| `beat_scale` | extrapolation | 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 | 1 | Pace knob; `disabledWhen: (_, ws) => ws.cinematic_arrival === 'off' ? 'Only with the cinematic opening.' : undefined`. `CINEMATIC_DESIGN.md` §1.4 folds pace into the `cinematic_arrival` choice id; this document proposes two keys so the briefing can show pace as its own control and a pace change never resets on/off. **Open question for the lead (§6).** |
| `distant_layer` | au | on / off | on | `showWhen: r => r.category !== 'canon' && r.special.hyperMassAccelerators` (Apex presets): the statistical distant-engagement layer with AU scale captions (D4/D13, `CINEMATIC_DESIGN.md` §5). Hidden under canon; canon scenarios never reference `APEX_SCALE`. |

Reading the resolved record in the builder: `cinematic = ws.cinematic_arrival !== 'off'`, `beatScale = clamp(Number(ws.beat_scale ?? '1'), 0.5, 2)`, `cerberus = ws.cerberus as 'allied' | 'hostile' | 'absent'` (never `'auto'` after resolution).

### 3.3 Rendering in `briefing.ts`

- Scenario list buttons gain `data-scenario="<id>"` (no e2e uses them yet; the new Final Battle e2e does).
- The right column splits the existing `TIMELINE & WORLD STATE` panel in two: **TIMELINE & WORLD STATE** (timeline select, tagline, then `normandy`, `ascension`, `forces`, `genophage`, `cerberus`, `distant_layer`) and **CINEMATIC OPENING** (`cinematic_arrival`, `beat_scale`, the beat preview). The seed input stays in the first panel **and remains the first `input[type="number"]` on the page** (C9); every new control is a `<select>` or a `<range>`.
- Each world-state control: `label.field` → `[label] [kind badge]` as today (`briefing.ts:53-62`: `player_dependent → .badge.inferred`, `au → .badge.au`, else `.badge.estimate`), `<select data-world="<id>">` with choices; AU choices get ` (AU)` in the option text and `disabled` when `availableWhen` is false; disabled options keep the reason in the `<small>` line. A resolved `auto` shows `Resolves to: HOSTILE (Canon Mass Effect 3)` in the `<small>`. Notes from `resolveWorldState` render as orange `<p>` lines under the controls (`data-world-note`).
- **Beat preview** (`data-beat-preview`): a `.dim.mono` list generated from `FINAL_BATTLE_BEATS` filtered by what the current world state keeps (no `arrive_cerberus` row when absent, no `*` rows under canon), times multiplied by `beat_scale`: `00:00 arrival waves · 00:12 form up · 00:20 Reapers advance · 00:24 Oculus launch · 00:36 fleet volley · 00:42 Reaper answer · 00:48 fighter screen · 01:20 orders unlock`. Generated from the table so it is never stale; a unit test pins the pace arithmetic.
- The orders-of-battle panels use `renderOrderOfBattle` (§3.1). The HOSTILE panel's Cerberus entry carries `CERBERUS (HOSTILE)` and the two-side limitation line; the ALLIED panel's Black Fleet entry carries `AU`.
- Honesty lines kept: `warn` (AU scenario under canon rules) and `canonNote` (canon scenario under AU rules), `briefing.ts:64-65`. Added: `HIGH POWER — EASIER BY DESIGN` under `apex_legacy` (`PACK_ADOPTION.md` §3a), and the `Simulated hulls: N` line.
- Launch: `app.startBattle(scenario.build(rules, seed, resolveWorldState(scenario, rules, { ...worldState, ...campaignWorldState() }).ws))` — the same resolved record the preview used, so what the player read is what launches.

### 3.4 Selector stability

Unchanged for the existing e2e: `[data-action="launch"]`, the seed as the first number input, `[data-action="pause"]` after launch, the HUD's formation `<select>` as the first select on the battle screen (the briefing's selects are gone once the battle mounts). New hooks: `[data-scenario="final_battle_of_earth"]`, `[data-world="cerberus"]` etc., `[data-beat-preview]`, `[data-world-note]`.

## 4. Tests

### 4.1 Unit (Vitest) — `tests/custom.test.ts` (new) and additions

Every test is deterministic (fixed seeds, no clock). Target: +16 tests on today's 83.

| Test | Asserts |
| --- | --- |
| migrates a v1 input with a reinforcement wave | 3 fleets (`A0`, `B0`, `B1`); `B1.arrivalTime === 60`; `B1.offset.z === -30`; `B1.name` ends with `reinforcements`; `version === 2`; migrating the result again is a no-op (deep-equal) |
| migrates a partial v1 input (no `reinforcementCounts`, no `maxDuration`) and garbage | partial → 2 fleets, `maxDuration 420`; `migrateCustomBattle(null)` → `DEFAULT_INPUT` with a note |
| the legacy `buildCustomBattle` call still builds | the exact literal from `tests/battle.test.ts:110-123` (kept there unchanged) plus `fleets.map(f => f.position.z)` equal `[-30, 30]` for 60 km and headings `±z` |
| mixed factions per side | A = `sword_alliance` + `hierarchy_battle_group` + `republics_fleet`, B = `reaper_harvest_group` + `cerberus_strike_fleet`; `sides.A.deployed` equals the summed counts; `result.sides.A.factions` has 3 entries, `B.factions` 2; fleet ids unique; ship ids unique (`new Set(sim.ships.map(s => s.id)).size === sim.ships.length`) |
| ship names are unique across two Alliance fleets | two `sword_alliance` cards on side A → no duplicate `ship.name` among dreadnoughts/cruisers/frigates |
| arrival | a side-A fleet with `arrivalTime 45` is absent at t = 0, `reinforcement_arrival` for `custom-A1` fires at `t ≈ 45`, the battle continues |
| `checkEnd` guard | side B's only fleet arrives at 45 s → no `battle_end` before 45 s; after deployment the battle runs to a normal `winner ∈ {A, B, draw}` |
| Reaper vs Reaper | `reaper_civil_war` bundle builds, runs to a result, both sides have `faction 'reaper'`, `reaperCapitalLost` is counted per side |
| layout | 8 fleets on one side: pairwise anchor distance ≥ 12 km nominal; user offset `{x: 0, y: 0, z: 10}` moves A toward +z and B toward −z by 10 |
| platform split | (lands with `sol_defence_platform`) a fleet of 2 platforms + 4 cruisers → two specs; the platform spec has `initialOrder.order === 'defend_position'`; after 100 steps the cruiser fleet's anchor has moved and the platform anchor has not |
| validation errors | empty side → E1; 8 fleets + add → E4; hulls > hard cap → E2 and `ok === false` |
| validation warnings | 125-hull `sword_combined` → W1; all fleets late → W2; arrival 600 with `maxDuration 420` → W3; unknown class id → W4 (saved counts untouched, builder drops it); `cerberus_dreadnought` under `canon_me3` → W5 and `config.auContent === true` and `config.name` starts with `Custom (AU):`; two Harbingers on a side → W6 and one Harbinger deployed; Reapers both sides → W7 |
| scale to cap | `sword_combined` (125) scaled to 70 → `hulls ≤ 70`, every class with `n > 0` keeps `≥ 1`, dreadnought counts equal `round(n × 70/125)`, unique hulls stay 1; the result is identical on repeated calls |
| presets build under every preset rule set | every `FleetPreset` and every bundle builds under `['canon_me3', 'prepared_galaxy', 'humanity_ascendant', 'cerberus_reformed', 'reaper_escalation', 'prime_apex', 'apex_legacy', 'cerberus_ascendant']` (skipping bundles whose `requires` returns a reason); canon-shaped presets contain no `isAuClass` id; AU presets have `au === true` and `provenance === 'AU_MODIFIED'` |
| AU class detection | `isAuClass('cerberus_dreadnought') === true` after the re-tag, `isAuClass('alliance_cruiser') === false`, `isAuClass('reaper_oculus') === false` once the class exists; `FACTION_DEFAULTS` and every canon-shaped preset contain no AU class |
| determinism | same v2 input, two simulations, `JSON.stringify(events)` equal |
| storage round trip | `Storage` instance (as `tests/saves.test.ts` does): `set('customBattle', v1Literal)` → `loadCustomBattle()` returns v2 with one note; `exportAll()` carries it; a second `Storage` imports it and loads v2 |

`tests/battle.test.ts` additions for the Final Battle (or a new `tests/finalBattle.test.ts`):

| Test | Asserts |
| --- | --- |
| `resolveWorldState` | canon → `cerberus 'hostile'`; `prime_apex` → `'allied'`; `{ cerberus: 'allied' }` under canon → `'hostile'` + one note; `beat_scale` ignored when `cinematic_arrival 'off'`; `distant_layer` dropped under canon |
| Final Battle Cerberus fleets | canon default: a side-B cerberus fleet with `arrivalTime 150` and `initialOrder.priority 'capitals'`; `prime_apex`: a side-A cerberus fleet containing `cerberus_dreadnought × 2`; `cerberus_reformed` (cooperative, no Titan): side-A cerberus fleet **without** dreadnoughts; `absent`: no cerberus fleet |
| declared options | `ascension 'absent'` removes the Destiny Ascension; `normandy 'no'` removes the Thanix frigate; `forces 'campaign'` without campaign keys builds the default fleet and `resolveWorldState` notes it |
| beat preview arithmetic | `beatPreview(FINAL_BATTLE_BEATS, { beat_scale: '2', cerberus: 'absent' })` doubles every time and omits `arrive_cerberus` |
| campaign-linked Final Battle unchanged | `tests/campaign.test.ts:265-275` keeps passing (campaign forces add no Cerberus group) |

### 4.2 End-to-end (Playwright) — `e2e/game.spec.ts`

The existing test `codex, database, timelines and custom battle screens render` (`:105-125`) is **unchanged** and must pass as written. Added:

1. `custom battle: united fleets, arrival and the cap` — `[data-menu="custom-battle"]`; `[data-action="add-fleet"][data-side="A"]`; `selectOption('[data-preset="A:1"]', 'hierarchy_battle_group')`; `fill('[data-arrival="A:1"]', '30')`; expect `[data-total="A"]` to contain `80` (49 + 31); `[data-bundle="final_battle_sword"]` → expect `[data-cap-warning="A"]` visible → `[data-action="scale-to-cap"][data-side="A"]` → expect it hidden and `[data-total="A"]` to match `/ (6\d|70) \//`; `[data-action="launch-custom"]`; `[data-action="pause"]` visible; `advance(page, 40)`; evaluate that `sim.events` contains `reinforcement_arrival` for a fleet id starting with `custom-A` (the Hierarchy card at 4 s in the bundle) and that `sim.ships.some(s => s.faction === 'turian')`.
2. `custom battle renders at phone width` — `test.use({ viewport: { width: 390, height: 844 } })` in its own `describe`; open the screen; `[data-action="launch-custom"]` visible; `[data-fleet-card="A:0"]` bounding box width ≤ 390; `document.documentElement.scrollWidth <= document.documentElement.clientWidth`; the conditions panel's bounding box `y` is smaller than side A's (order rule).
3. `Final Battle briefing shows the world state and launches` — `[data-menu="quick-battle"]`; `[data-scenario="final_battle_of_earth"]`; `[data-world="cerberus"]` has an option `allied` that is `disabled` under the default canon timeline; `[data-world="cinematic_arrival"]` selected `on`; `[data-beat-preview]` contains `fleet volley`; the HOSTILE order of battle contains `CERBERUS (HOSTILE)`; `[data-action="launch"]`; `[data-action="pause"]` visible; `advance(page, 40)`; `sim.events` contains `fleet_volley_fired` (once `CINEMATIC_DESIGN.md` §1.3 lands; until then the assertion is `weapon_fired > 10` like the Battle of Earth test).

Three e2e tests on top of eight; the build step is shared, so wall time grows by roughly the three battles' `advance` loops.

## 5. Files and sequencing

| File | Change |
| --- | --- |
| `src/scenarios/custom.ts` (new) | types, `isLegacyCustomBattle`, `migrateCustomBattle`, `layoutFleets`, `validateCustomBattle`, `scaleSideToCap`, `buildCustomBattle`, `DEFAULT_CUSTOM_INPUT` |
| `src/scenarios/customPresets.ts` (new) | `FLEET_PRESETS`, `BATTLE_BUNDLES`, `apexCerberus`, `isAuClass` |
| `src/scenarios/index.ts` | remove L613-656, re-export from `./custom`; `FleetOpts.nameOffsets`; `WorldStateOption` extension; `resolveWorldState`; Final Battle options (`normandy`, `ascension`, `cerberus`, `cinematic_arrival`, `beat_scale`, `distant_layer`) and builder branches (geometry and beats come from `finalBattleBeats.ts`, owned by the cinematic work) |
| `src/simulation/constants.ts` | `SHIP_CAP_PER_SIDE = 70`, `HARD_SHIP_CAP`, `ENTITY_BUDGET`; `campaign/engine.ts:23` imports `SHIP_CAP_PER_SIDE` |
| `src/data/ships.ts:586` | `cerberus_dreadnought.designProvenance` re-tagged `AU_MODIFIED` (§1.2 step 8); the note text is kept |
| `src/simulation/battle.ts` | `checkEnd` pending guard |
| `src/simulation/types.ts` | `BattleConfig.auContent?`, `sideLabels?`, `notes?` |
| `src/ui/components/orderOfBattle.ts` (new) | `renderOrderOfBattle` |
| `src/ui/screens/custom.ts` | rewrite on the v2 model (cards, totals, presets, preview, checks, hooks) |
| `src/ui/screens/briefing.ts` | two panels, `data-world`, `data-scenario`, notes, beat preview, shared order of battle, `resolveWorldState` on launch |
| `src/ui/screens/hud.ts`, `results.ts` | `ALTERNATE UNIVERSE CONTENT` tag from `config.auContent`; `sideLabels` headings when present |
| `src/style.css` | §2.9 rules |
| `tests/custom.test.ts` (new), `tests/battle.test.ts` or `tests/finalBattle.test.ts` | §4.1 |
| `e2e/game.spec.ts` | §4.2 (existing tests untouched) |
| `LORE_REFERENCE.md`, `README.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md` | fleet-name anchors; "united fleets" feature line; limitations of §6 |

Sequencing. Phase A (no dependency on other workstreams): data model, migration, builder, validation, `checkEnd` guard, the custom screen, the shared order of battle, the Final Battle options with the **non-cinematic** branches (`cerberus` fleets at `arrivalTime`, `ascension`, `normandy`, `forces` note) and all their tests. Phase B (with `CINEMATIC_DESIGN.md` §1.4): the `cinematic_arrival`/`beat_scale` controls read `FINAL_BATTLE_BEATS` for the preview and the builder's cinematic geometry. Phase C (with `PACK_ADOPTION.md` §3a–3b and brief §8.9–8.10): AU presets and rows appear by themselves because the grid, the presets' `requires` and `isAuClass` are data-driven; the platform split and its test activate when the class exists. Phase D (brief §8.2): raising `SHIP_CAP_PER_SIDE` changes the editor's bar, warning text and the `sword_combined` bundle's status from "over cap" to "under cap" without code changes; the e2e in §4.2 (1) asserts the warning only while `SHIP_CAP_PER_SIDE < 125`, so it reads the constant through `page.evaluate` of `window.reaperwar.constants` — a new, read-only exposure next to the existing `window.reaperwar.battle` debug handle — rather than hard-coding 70.

## 6. Limitations and open questions

Limitations (stated in the UI where they bite):

- Two-side simulation: a hostile Cerberus group on side B is not shot at by the Reapers (W10; same limitation in the Final Battle, `CINEMATIC_DESIGN.md` §1.4). "Hostile to both" needs a third allegiance in the sim and is not in this design.
- Mixed factions on one side fight by their own doctrines and share only the side; there is no joint-command bonus or penalty, and `alliedCoordination` (`StrategicVariables`) applies as it does in scenarios. Reaper fleets beside organics on one side are allowed and labelled; the Reaper intel panel keys off the first Reaper side (W7).
- Point values are balancing weights, not predictions; the editor shows the ratio and nothing else.
- Fleet counts are compressed stand-ins; the pack's mass-scale figures never appear in the editor (D13).
- Side B is never player-controlled and the perspective is always A in this version.
- Hammer's transports, krogan and batarian commands, corvettes and heavy cruisers exist only as caption data elsewhere (`PACK_ADOPTION.md` §3b rejects the generic roles while the cap is 70; revisit with §8.2).
- Collapsed-card state and the order-of-battle preview toggle are UI state, not saved.

Open questions for the lead:

1. **`beat_scale` as its own key** (this document) versus pace folded into the `cinematic_arrival` choice id (`CINEMATIC_DESIGN.md` §1.4). Both are JSON strings in `worldState`; the difference is only how `finalBattleBeats.ts` reads them and how the briefing renders them. One must be picked before Phase B.
2. **Sandbox rule C5** (any class under any timeline, always AU-badged, config labelled AU) versus gating AU classes behind the preset flags (`special.valkyrieAvailable`, `special.fixedPlatforms`, `apexCerberus`) in custom battles too. `PACK_ADOPTION.md` §3b says "custom battle lists the class" without deciding. C5 is the recommendation because it keeps what-if experiments possible without ever dropping the label.
3. **`HARD_SHIP_CAP = 1.5 × cap`** is a guess at what the current renderer tolerates; `scripts/perf.mjs` should measure 105 and 300 hulls a side before the number is pinned.
4. Whether the Final Battle should declare `normandy` (the default fleet hard-codes the Normandy today). Canon has Shepard at Earth; the option exists for the player who sends the Normandy with Hammer. Cheap either way.
5. Whether `readiness` ships in v2 or waits for `PACK_ADOPTION.md` §3f; the field is optional and inert when absent, so it can ship as data without the control.
