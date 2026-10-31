# Cinematic systems design — beats, cameras, Showcase, effects, distant layer

Status: design document, 31 October 2026, revision 2. The first draft stopped after §1.7; §0–§1 are kept (verified against the code) with corrections marked ✎, and §2–§9 are new. Nothing in this file is implemented. It specifies, in implementable detail, the cinematic layer of the V2 brief (`docs/V2_CINEMATIC_BRIEF.md` §2–§4, §6) on top of the code described in `docs/apex/CODE_MAP.md` and the data/mechanics plan in `docs/apex/PACK_ADOPTION.md`. Lead decisions D1–D13 are taken as given; this document refines D4 (beat-scheduled Final Battle, Cerberus world state, Oculi, distant layer), D5 (Showcase mode and scene 1), D10 (the camera and scene side of the Reaper behaviours) and D11 (effects), and leans on the class, weapon and mechanic specifications of `PACK_ADOPTION.md` §3b–§3c (Valkyrie, Black Fleet hulls, Oculus, Titan/HADES, drive attack) without restating their numbers. §7 covers the brief's §8 (feedback round 2, items 8.1–8.10: movement feel, 3D formations and higher counts, hull-shaped barriers, procedural sound, the HADES effect, tactical withdrawal, firing solutions, Reaper look and scale, super-dreadnoughts, fixed platforms). Where a later measurement in `docs/apex/BALANCE_AUDIT.md` supersedes a `PACK_ADOPTION.md` number (Oculus complement and weapon), this document follows the measurement and says so.

Rules that bind every section:

- **Canon by default, AU by choice.** The Final Battle under `canon_me3` gets the beat-scheduled opening and the distant layer, but no Apex object and no Apex number. Every caption that carries an Apex figure ends in `· AU SCENARIO VALUE`; every Showcase frame carries the `ALTERNATE UNIVERSE · PRIME/APEX` tag; nothing in the Showcase menu, summary or codex describes the scene as canon.
- **Determinism.** Everything under `src/simulation/` (beats, volley, arrival, scripted specials, the distant layer's counts) is a pure function of `BattleConfig` and draws randomness only from `sim.rng` or from an `Rng` derived from `config.seed`. No `Math.random` enters `src/simulation/` or `src/showcase/scenes/`. The render side (cameras, effects, distant sparks) may use its own seeded `Rng` so Record-mode output is frame-reproducible, and never feeds back into the simulation.
- **Honesty.** Scene scripts may force events; every forced event is logged as such (`cause: 'scripted'`), counted, and printed on the Showcase summary. Limitations are listed in §8, not hidden.
- **No ripped assets.** Every effect, caption string and camera move described here is original. The montage guide's AU lines (`Your resistance will be corrected.`, `Mark the next one.`) are original AU text from the user's pack and are shown as text only, attributed to the AU, never to the games.
- **Tests stay green.** New mechanics ship with Vitest tests (§6.1); the Showcase ships with one Playwright spec (§6.2). Existing selectors listed in `CODE_MAP.md` §9.4 are not touched.

## 0. Conventions, units and file placement

| Symbol | Meaning |
| --- | --- |
| `S` | `BATTLESPACE_SCALE = 0.4`: catalogue km → simulation km. Ranges, speeds and fleet positions are multiplied by `S` in `deployFleet`/`createShip`; ship lengths are not. |
| `KM` | `10` render units per simulation km (`rendering/geometry.ts`); 1 render unit = 100 m. |
| `SIM_DT` | `0.05` s. `sim.time` is always `tick × SIM_DT`. |
| `renderTime` | `sim.time − SIM_DT + alpha × SIM_DT`: the time the interpolated frame shows. Cameras and captions are driven by it, never by wall time. |
| `size` | `BuiltShip.lengthUnits` of a camera subject. Today: Kilimanjaro 8.88, Reaper capital 15.4, Harbinger 18.48, destroyer 1.28, Destiny Ascension 16. ✎ After §7.8: Reaper capital 20, Harbinger 22, destroyer 1.6, Kilimanjaro-class 10 (Everest-class stays 8.88), Valkyrie ≈ 20 (D8). Every shot framing below is expressed in multiples of `size`, so the rescale does not move a single shot. |

Compressed numbers used below (from `src/data/weapons.ts`, `src/data/ships.ts`, `CODE_MAP.md` §8): dreadnought spinal range `42 × S = 16.8 km`, projectile speed `30 × S = 12 km/s` (flight time at 12 km ≈ 1.0 s); cruiser spinal range `36 × S = 14.4 km`, speed `26 × S = 10.4 km/s`; Reaper capital beam range `44 × S = 17.6 km`; Reaper capital speed `0.8 × S = 0.32 km/s`; Alliance dreadnought speed `0.65 × S = 0.26 km/s`; Destiny Ascension `0.55 × S = 0.22 km/s`. ✎ `fleetDecision` (`ai.ts:168`) moves **each fleet's** anchor at its own slowest hull × 0.95, so the Sword fleets close at 0.21 km/s (Republics, paced by the Ascension) to 0.24 km/s (Hierarchy, geth) and the Reaper blockade at 0.285 km/s (Harbinger `0.75 × S` × 0.95); there is no single Sword pace.

New and changed files:

| File | Role |
| --- | --- |
| `src/simulation/beats.ts` | Beat types, `BeatScript`, `scheduleBeats`, `applyBeat`, the ship/fleet reference resolver (§1). |
| `src/simulation/volley.ts` | `orderVolley`, hold/release predicates, `VolleyState` (§1.3). |
| `src/simulation/arrival.ts` | Scripted arrival kinematics (§1.5). |
| `src/simulation/distant.ts` | Statistical distant-engagement counts (§5.1). |
| `src/simulation/battle.ts`, `types.ts` | New state fields, events, entry points (§1.7). |
| `src/scenarios/finalBattleBeats.ts` | The editable Final Battle beat table and the `cinematic_arrival` world-state option (§1.4). |
| `src/rendering/shots.ts` | `Shot`, `Pose`, `shotPose`, `ShotListPlayer` (§2). |
| `src/rendering/cameras.ts` | `CameraRig` gains the `'shot'` mode, FOV control, seeded shake and drift (§2.1). |
| `src/rendering/director.ts` | `CinematicDirector` replacing `pickCinematicShot` (§2.4). |
| `src/rendering/effects.ts` (+ `effects/*.ts`) | D11 effects (§4). |
| `src/rendering/distant.ts` | Drive lights and far tracer sparks (§5.2). |
| `src/showcase/types.ts`, `player.ts`, `captions.ts`, `scenes/index.ts`, `scenes/apexRefuseAtSol.ts` | Showcase mode (§3). |
| `src/ui/screens/showcase.ts`, `src/ui/app.ts`, `src/ui/screens/menu.ts`, `hud.ts` | Menu entry, screen, controller hooks (§3.3). |
| `tests/beats.test.ts`, `volley.test.ts`, `arrival.test.ts`, `shots.test.ts`, `distant.test.ts`, `showcase.test.ts`, `determinism.test.ts` | §6.1. |
| `tests/movement.test.ts`, `solutions.test.ts`, `withdrawal.test.ts`, `platforms.test.ts`, `silhouette.test.ts`, `perf.test.ts`, `effectsPool.test.ts` | §6.1 (brief §8 checks, specified in §7). |
| `e2e/showcase.spec.ts`, `scripts/cinematic-shots.mjs` | §6.2–§6.3. |
| `src/rendering/barrierShell.ts`, `src/rendering/billboards.ts` | Hull-shaped barrier shell with hex ripple; one-draw-call billboard pool replacing per-sprite draw calls (§4.0, §4.2, §7.3). |
| `src/simulation/spatial.ts`, `src/simulation/movement.ts`, `src/simulation/solutions.ts` | Uniform grid for O(n) neighbour queries; damped station keeping, bearing-locked fleet heading, frigate/fighter pass state machines; per-target firing solutions (§7.1, §7.2, §7.7). |
| `src/audio/engine.ts` (+ `src/audio/voices.ts`) | New procedural voices incl. the seismic AU signature, light-before-sound delay, `audio.seismicAu` and `audio.lightBeforeSound` settings (§7.4). |
| `src/data/ships.ts`, `src/data/weapons.ts`, `src/data/types.ts` | Roles `super_dreadnought` and `fixed_platform`; the Apex heavy-dreadnought line, the Kilimanjaro-class silhouette, the Sol platforms and their guns (§7.8–§7.10). |
| `docs/design/<class>.md`, `tests/silhouette.test.ts` | Reference sheets and the bounding-box ratio test (D12, §7.8). |

## 1. Beat scheduler (`src/simulation/beats.ts`)

### 1.1 Data model

A beat script is plain data attached to `BattleConfig`. It survives `JSON.stringify` (replays, saves, comparison) and contains no functions.

```ts
// src/simulation/beats.ts
import type { FleetOrders, Side } from './types';
import type { Vec3 } from '@/core/vec3';

/** How a beat names ships. Resolved inside the simulation, deterministically (ties broken by ship id order). */
export type ShipRef =
  | { name: string }                                             // 'SSV Kilimanjaro'
  | { id: string }                                               // exact ShipState.id
  | { fleetId: string; classId?: string; role?: ShipRole; nth?: number } // nth alive match (0-based), in deployment order
  | { query: 'top_damage_dealer'; side: Side; window?: number }  // ShipStats.recentDamage over `window` s (default 10)
  | { query: 'most_valuable'; side: Side; faction?: FactionId; role?: ShipRole }
  | { query: 'nearest'; to: ShipRef; side?: Side; role?: ShipRole }
  | { query: 'weakest_barriers'; side: Side; role?: ShipRole };

export type FleetSel = { fleetIds: string[] } | { side: Side } | 'all';

export type BeatEvent =
  | { kind: 'spawn_wave'; fleetId: string; stagger?: number; run?: Partial<ArrivalProfile> }
  | { kind: 'set_fleet_order'; fleets: FleetSel; patch: Partial<FleetOrders> }
  | { kind: 'fleet_volley'; fleets: FleetSel; window?: number; lead?: number; mounts?: VolleyMounts; target?: ShipRef; anchor?: ShipRef; syncArrival?: boolean }
  | { kind: 'force_target'; ships?: ShipRef[]; fleets?: FleetSel; target: ShipRef; forceNextShot?: 'hit' | 'hit_penetrating' }
  | { kind: 'launch_drones'; fleets?: FleetSel; ships?: ShipRef[]; burst?: number }
  | { kind: 'trigger_special'; special: SpecialTrigger }
  | { kind: 'caption'; text: string; duration: number; style: CaptionStyle; speaker?: string; au?: boolean }
  | { kind: 'player_control'; locked: boolean };

export type VolleyMounts = 'spinal' | 'beams' | 'spinal_and_beams' | 'all_anti_capital';
export type CaptionStyle = 'title' | 'tag' | 'tactical' | 'quote' | 'insert';

export type SpecialTrigger =
  | { type: 'drive_attack'; runner: ShipRef; target: ShipRef; window?: number; force?: 'success' | 'intercept'; ignoreCorridor?: boolean }
  | { type: 'hades_strike'; shooter: ShipRef; target: ShipRef; rounds?: number; force?: 'hit_penetrating' }
  | { type: 'nova_strike'; shooter: ShipRef; target: ShipRef; withThanix?: boolean; force?: 'hit' }
  | { type: 'mission_kill'; ship: ShipRef; weapons?: number; engines?: number }   // defaults 0.1 / 0.3
  | { type: 'destroy'; ship: ShipRef; killer?: ShipRef; ifHullBelow?: number; cause?: DestructionCause }
  | { type: 'set_hull_fraction'; ship: ShipRef; fraction: number; onlyLower?: boolean }
  | { type: 'set_barrier_fraction'; ship: ShipRef; fraction: number; onlyLower?: boolean }
  | { type: 'set_subsystem'; ship: ShipRef; subsystem: keyof Subsystems; level: number }
  | { type: 'withdraw_ship'; ship: ShipRef }
  | { type: 'interpose'; ship: ShipRef; protect: ShipRef; against?: ShipRef; seconds?: number };

export interface Beat {
  /** Stable id used by events, tests and the shot list ("volley", "arrive_turian"). */
  id: string;
  /** Scene seconds before `beatScale`. */
  at: number;
  event: BeatEvent;
  /** Only fire if every referenced ship is alive and present; otherwise emit `beat_skipped`. Default true for ship-referencing beats. */
  requireAlive?: boolean;
  label?: string;
}

export interface BeatScript {
  version: 1;
  beats: Beat[];
  /** 0.5–2.0; multiplies every `at` and every caption duration. Default 1. */
  beatScale: number;
  /** Player orders are refused (with a toast) until this scene time × beatScale. Default 0 = never locked. */
  lockPlayerUntil?: number;
  /** Sim-side marker used by the HUD/Showcase for honesty text. */
  scripted: boolean;
}
```

`BattleConfig` gains `beats?: BeatScript`. `FleetSpec` gains `arrivalMode?: 'time' | 'beat'` (default `'time'`; old saves lack the field and behave exactly as today). A fleet with `arrivalMode: 'beat'` is never auto-deployed; only a `spawn_wave` beat deploys it.

### 1.2 Scheduling and processing

```ts
export interface ScheduledBeat { beat: Beat; t: number /* at × beatScale, quantised to SIM_DT */; index: number }

export function scheduleBeats(script: BeatScript): ScheduledBeat[] {
  return script.beats
    .map((beat, index) => ({ beat, index, t: Math.round((beat.at * script.beatScale) / SIM_DT) * SIM_DT }))
    .sort((a, b) => a.t - b.t || a.index - b.index);           // stable: same time → authoring order
}
```

`BattleSimulation` keeps `private beatQueue: ScheduledBeat[]` (built in the constructor) and processes it inside `step()` **after** `pendingFleets` and **before** the `fleetDecision` loop (`battle.ts:343–348`), so a wave spawned and an order issued at the same beat act in the same tick:

```ts
while (this.beatQueue.length > 0 && this.beatQueue[0].t <= this.time + 1e-9) {
  const { beat } = this.beatQueue.shift()!;
  const outcome = applyBeat(this, beat);                        // 'fired' | 'skipped'
  this.emit({ t: this.time, type: outcome === 'fired' ? 'beat_fired' : 'beat_skipped', beatId: beat.id, kind: beat.event.kind, label: beat.label });
}
```

Determinism follows from the sorted array and the quantised times: for a given config the same beat fires on the same tick, and every random draw a beat needs (volley offsets, arrival stagger, special-event rolls) comes from `this.rng` in a fixed order. Two beats at the same time apply in authoring order. A beat whose `ShipRef` resolves to nothing (fleet absent because of a world-state choice, ship already dead) is skipped with `beat_skipped`; it never throws.

`applyBeat` maps every kind to an existing or new simulation entry point:

| Beat kind | Entry point | Notes |
| --- | --- | --- |
| `spawn_wave` | `deployFleet(spec, arrival)` (made callable from the beat module) | Spec must have `arrivalMode: 'beat'`; ships enter through the arrival kinematics of §1.5. |
| `set_fleet_order` | `issueOrders(fleetId, patch)` per selected fleet | Already re-slots on formation change and emits `order_issued`. New `FleetOrders.holdFire?: 'none' \| 'spinal' \| 'beams' \| 'all'` (§1.3). |
| `fleet_volley` | `orderVolley(fleetIds, opts)` (§1.3) | One entry point shared by the HUD button, beats and scenes. |
| `force_target` | `orderShipsAttack(ids, targetId)`; fleets → `issueOrders({ order: 'attack_target', targetId })` | `forceNextShot` sets `WeaponState.forcedShot` on the ship's heaviest anti-capital mount (§1.6). |
| `launch_drones` | `fleet.orders.fightersDeployed = true`; `hangar.launchTimer = 0`; `hangar.burst = n` | `updateCarrier` launches `burst` craft in one tick instead of 2 per 0.4 s, then resumes the normal rate. |
| `trigger_special` | `sim.special.*` (§1.6) | All draw from `this.rng`; all log `scripted_event` when `force*` is used. |
| `caption` | `emit({ type: 'caption', ... })` | The sim does nothing else; captions ride the event log so replays and exports reproduce them. Duration × `beatScale`. |
| `player_control` | sets `this.playerLocked` | Read by `BattleController.order` (§1.4). |

### 1.3 `fleet_volley`

Today every mount decides for itself (`updateWeapons` → `tryFire`, `battle.ts:520–755`); there is no fleet-level fire control. The volley adds a two-phase order with a hold and a release window.

```ts
// src/simulation/volley.ts
export interface VolleyOptions {
  /** Release time = order time + lead. Default 2.0 s: long enough for 2 s-cadence guns to be ready, short enough to keep the beat. */
  lead?: number;
  /** Release window in seconds. Default per faction (table below). */
  window?: number;
  mounts?: VolleyMounts;        // default 'spinal'
  targetId?: string;            // forced focus for the duration of the volley
  anchorShipId?: string;        // this ship's mounts get offset 0 so cameras can be on its bow at `at`
  syncArrival?: boolean;        // offsets subtract flight time so impacts, not departures, cluster
}
export interface VolleyState {
  at: number; window: number; mounts: VolleyMounts; targetId?: string; syncArrival: boolean;
  /** key `${shipId}:${weaponIndex}` → release offset in [0, window − 0.1]. Drawn from sim.rng at order time. */
  offsets: Map<string, number>;
  fired: number; held: number; silent: number;
}

export const VOLLEY_WINDOW: Record<FactionId, number> = { alliance: 1.5, turian: 1.0, asari: 1.3, salarian: 1.2, geth: 0.8, quarian: 1.8, cerberus: 1.2, reaper: 2.0 };

export function volleyMount(w: WeaponState, mounts: VolleyMounts): boolean {
  const spinal = w.def.antiCapital && w.def.arc <= 25 && (w.def.kind === 'mass_accelerator' || w.def.kind === 'thanix');
  const beam = w.def.kind === 'reaper_beam';
  switch (mounts) {
    case 'spinal': return spinal;
    case 'beams': return beam;
    case 'spinal_and_beams': return spinal || beam;
    case 'all_anti_capital': return w.def.antiCapital;
  }
}
```

`orderVolley(fleetIds, opts)` on `BattleSimulation`:

1. For each fleet, `volley.at = time + lead`, `window = opts.window ?? VOLLEY_WINDOW[faction]`.
2. Walk the fleet's alive, non-escaped ships in `this.ships` order; for each mount matching `volleyMount`, draw `offset = this.rng.next() × (window − 0.1)`; the anchor ship's mounts get `0`. With `syncArrival`, `offset −= distance(ship, target) / def.projectileSpeed` and the offsets are then shifted so the minimum is 0 (beams have infinite speed → unchanged).
3. If `targetId` is given: `fleet.focusTargetId = targetId`; every ship's `forcedTargetId = targetId` with `forcedTargetUntil = at + window + 1` (restored to `undefined` afterwards unless a player order replaced it).
4. `fleet.orders.holdFire` is set to the matching class (`'spinal'`/`'beams'`) until release; emit `fleet_volley_ordered { fleetId, at, window, mounts, mountsOrdered }`.

In `updateWeapons`, before the gates at `battle.ts:555`:

```ts
const v = fleet.volley;
if (v && volleyMount(w, v.mounts)) {
  const release = v.at + (v.offsets.get(`${ship.id}:${w.index}`) ?? 0);
  if (this.time < release) { v.held++; continue; }                    // hold: cooldown keeps ticking above
  if (this.time < v.at + v.window + SIM_DT) {
    if (w.cooldown > 0 && w.cooldown <= v.window) w.cooldown = 0;      // guns that are nearly ready fire on the beat
    if (ship.overheated || (w.ammo !== undefined && w.ammo <= 0) || w.arrivalHold) { v.silent++; continue; }
    this.tryFire(ship, fleet, w, { volley: true });                  // bypasses the 60 % "wait for primary" roll at L627
    continue;
  }
}
if (fleet.orders.holdFire !== 'none' && holdClass(w) === fleet.orders.holdFire) continue; // standing hold (no volley pending)
```

`tryFire(..., { volley })` differs from a normal shot in exactly two ways: the "spinal guns wait for the primary target" 60 % roll is skipped (so the whole line fires on the beat), and the shot is counted in `v.fired`. Hit probability, heat, ammunition and arcs are untouched: a mount with no target in arc stays silent and is counted in `v.silent`. When `time ≥ at + window + SIM_DT` the fleet emits `fleet_volley_fired { fleetId, fired, held, silent }`, clears `fleet.volley`, resets `holdFire` to `'none'` and normal fire control resumes.

Why the tracers cross together: departures are spread over ≤ 1.5 s and flight times over 10–14 km are 0.9–1.4 s, so the wall of rounds is in the air for about 2.5 s and the Reaper barriers ripple over a similar span. With `syncArrival` the impacts cluster inside the window instead (used for the Showcase impact-wall shot, §3.5 cue S09). Expected yield at the Final Battle volley under fixed fleet scaling (✎ 16 Alliance + 10 Hierarchy + 8 Republics + 10 quarian + 8 geth cruiser spinal mounts plus 18 dreadnought-class guns — 6 Alliance, 5 Hierarchy, 2 asari and the Ascension, 3 quarian heavies, 1 geth — at `p ≈ 0.6–0.84`; Apex `fleetStrength` multiplies the counts and §7.7's firing solutions lower the opening hit rate, so after §7.7 the volley is mostly misses that stream past the Reaper line — which is the brief's intent for an opening salvo): roughly 40 hits in 1.5 s, several thousand points of barrier damage across the Reaper line. The volley is spectacle and timing, not a damage bonus.

Standing `holdFire` is the honest way to keep the opening quiet: the cinematic Final Battle sets `holdFire: 'spinal'` on the coalition at form-up and `holdFire: 'beams'` on the Reaper line when it starts advancing (§1.4); both are released by their volley beats. Neither side gains anything from it — until ≈ 36 s the lines are out of range anyway (§1.4 geometry). The HUD shows `HOLDING FIRE · VOLLEY IN 1.8` on player fleets while a volley is pending; the pause menu and results list the beats that ran.

HUD exposure for ordinary battles: a seventh order button `Volley` (`data-order="volley"`, after `Retreat`) calls `ctrl.volley()` → `sim.orderVolley(playerFleetIds, { lead: 2, mounts: 'spinal' })`. It is cosmetic by design (no bonus); the existing e2e assertions on `[data-order="advance"]` are unaffected.

### 1.4 Final Battle of Earth — default beats (`src/scenarios/finalBattleBeats.ts`)

The scenario gets a world-state option:

```ts
{ id: 'cinematic_arrival', label: 'Cinematic opening', kind: 'extrapolation',
  description: 'Stage the first 80 seconds on a fixed beat table (arrival waves, form-up, Reaper advance, simultaneous volley) so footage lines up with audio. Pace stretches or compresses the table.',
  choices: [ { id: 'off', ... }, { id: '0.75', label: 'On · pace 0.75' }, { id: '1', label: 'On · pace 1.0' }, { id: '1.25', ... }, { id: '1.5', ... }, { id: '2', ... } ],
  default: '1' }
```

and `cerberus: 'allied' | 'hostile' | 'absent'` (kind `au` when the preset's `cerberusStance` is cooperative, `extrapolation` under canon; default `allied` when `rules.strategic.cerberusStance === 'cooperative'`, else `hostile`). With the option on, the builder (`scenarios/index.ts:479–497`) uses the **cinematic geometry** so the lines reach spinal range exactly when the volley beat fires:

| Group | Nominal position (km, before `× S`) | Compressed anchor | Formation | Initial order |
| --- | --- | --- | --- | --- |
| Sword (Alliance) | `(−18, 0, −26)` | `z = −10.4` | `line_abreast` | `hold_formation`, `holdFire: 'spinal'`, `fightersDeployed: false` |
| Sword (Hierarchy) | `(20, 0, −28)` | `z = −11.2` | `line_abreast` | same |
| Sword (Republics) | `(0, 4, −36)` | `z = −14.4` | `defensive_screen` | same |
| Union First Fleet (if `genophage === 'sabotaged'`) | `(0, −6, −42)` | `z = −16.8` | `line_abreast` | same |
| Migrant Fleet detachment | `(−38, 0, −34)` | `z = −13.6` | `defensive_screen` | same |
| Geth fleet | `(38, 0, −32)` | `z = −12.8` | `strike_wedge` | same |
| Cerberus Black Fleet (`allied`) | `(2, 0, −30)`, the gap between Alliance and Hierarchy | `z = −12.0` | `strike_wedge` | same, arrives by beat |
| Cerberus strike group (`hostile`) | `(−60, 0, 20)` heading `(0.8, 0, −0.3)` | flank | `strike_wedge` | side B, `arrivalTime: 150`, `priority: 'capitals'` |
| Reaper blockade (Harbinger, 6 capitals, 14 destroyers, Oculi) | `(0, 0, 30)` heading `(0, 0, −1)` | `z = +12.0` | `strike_wedge` | `hold_formation`, `fightersDeployed: false` |
| Reaper reserve (3 capitals, 8 destroyers) | `(−50, 0, 76)` | flank | `strike_wedge` | `arrivalTime: 110` (was 90) |

Gap at `t = 0`: 22.4 km. From form-up (12 s) the coalition fleets advance at 0.21–0.24 km/s (✎ each anchor at its own slowest hull × 0.95); from 20 s the Reaper line advances at 0.285 km/s (Harbinger-paced). At 36 s the gap is `22.4 − 0.22 × 24 − 0.285 × 16 ≈ 12.6 km`: inside dreadnought (16.8) and cruiser (14.4) spinal range for the whole line, outside frigate gun range (9.6), inside Reaper beam range (17.6) only since ≈ 26 s — which is why the Reaper `holdFire: 'beams'` costs them nothing material. Under `cinematic_arrival: 'off'` the current geometry (`z = −34 … +46`) and orders stay as they are.

Default table (`FINAL_BATTLE_BEATS: Beat[]`, times in scene seconds at `beatScale 1`; `*` = Apex presets only, omitted under canon by the builder):

| id | at | event | Camera (director rule, §2.4) |
| --- | ---: | --- | --- |
| `title` | 0.5 | caption `title` "SOL · 2186" 3.5 s; under AU presets a second `tag` caption `ALTERNATE UNIVERSE · <preset name>` persists | — |
| `arrive_alliance` | 0.0 | `spawn_wave sword-alliance`, stagger 3.0 | Establishing wide from below Earth's limb, slow push-in (W1) |
| `arrive_turian` | 3.0 | `spawn_wave sword-turian`, stagger 2.5 | |
| `arrive_asari` | 5.5 | `spawn_wave sword-asari`, stagger 2.0 | |
| `arrive_salarian` | 7.0 | `spawn_wave sword-salarian` (skipped when absent) | |
| `arrive_quarian` | 8.0 | `spawn_wave sword-quarian`, stagger 2.5 | |
| `arrive_geth` | 9.5 | `spawn_wave sword-geth`, stagger 2.0 | |
| `arrive_cerberus` | 12.0 | `spawn_wave sword-cerberus` (allied only), stagger 1.5 | Lateral tracking along the line (W2) |
| `form_up` | 12.0 | `set_fleet_order side:A { order: 'advance', holdFire: 'spinal' }` (formations unchanged: dreadnoughts centred, cruisers flanking, carriers behind, frigates ahead are what `line_abreast`/`defensive_screen` already produce) | Low pass under a dreadnought keel (C1) |
| `reapers_advance` | 20.0 | `set_fleet_order reaper-blockade { order: 'advance', holdFire: 'beams' }` | Reverse angle from behind the Reaper line (W3) |
| `oculus_launch` | 24.0 | `launch_drones fleets reaper-blockade, burst 8` (needs `reaper_oculus` complements; ✎ use the measured ones from `BALANCE_AUDIT.md` §9.2 — 8 per capital, 2 per destroyer, 12 on Harbinger — rather than `PACK_ADOPTION.md` §3b's 16/4/24, which the audit found too lethal) | Reaper POV, eyes waking in sequence (P1) |
| `scale_caption`* | 26.0 | caption `tactical` "38,420 WARSHIPS COMMITTED TO SOL · AU SCENARIO VALUE" 4 s | |
| `line_holds` | 34.0 | `set_fleet_order side:A { order: 'attack' }` (stop closing; hold range) | |
| `volley` | 36.0 | `fleet_volley side:A, lead 2.0, mounts 'spinal', anchor { name: 'SSV Kilimanjaro' }` → release 38.0–39.5 (Hierarchy 38.0–39.0) | Side-on wide of the whole line (D1), 0.5 s cut to the Kilimanjaro bow at 38.0 (R1), impact wall from behind the Reaper line (W4) |
| `reaper_answer` | 42.0 | `fleet_volley fleets reaper-blockade, lead 2.0, window 2.0, mounts 'beams'` → 44.0–46.0 | Beam sweep seen from the receiving side, shake (P2) |
| `fighters` | 48.0 | `set_fleet_order side:A { fightersDeployed: true }`; `launch_drones reaper-blockade burst 6` | Chase cam through the furball (F1), then pull back to a distance shot (D2) |
| `free_play` | 80.0 | `player_control { locked: false }` | Director keeps offering distance shots |

`lockPlayerUntil: 80`. "At least one cruiser dies in the first exchange; a dreadnought takes a beam and holds" (brief §2) is **not forced** in the Final Battle: it is the expected outcome of six capital beams at `p ≈ 0.98` against a line of cruisers (`CODE_MAP.md` §8.6) and the acceptance test asserts a first loss by 70 s on seeds 1–3 (§6.1). If calibration (D3, `PACK_ADOPTION.md` §5) moves that, the test moves with it; nothing is scripted in a playable scenario.

Pace knob: `beatScale` multiplies every `at` and caption duration; arrival run durations and stagger do not scale (they are physics). At `beatScale 2` the volley fires at 72 s with the lines ≈ 2 km closer than at pace 1 (the `advance` order is capped by `standoff × 0.55 ≈ 7.9 km`, so they do not collide); at `0.5` it fires at 18 s with the gap at ≈ 17 km — the builder therefore also scales the two anchor `z` values by `clamp(1 / beatScale, 0.85, 1.25)` so the volley always has solutions. The unit test (§6.1) runs the table at 0.5, 1 and 2 and asserts ≥ 85 % of spinal mounts fire inside the window.

Cerberus world state: `allied` → the Black Fleet is a side-A fleet spawned by `arrive_cerberus` into the gap beside Sword; `absent` → no Cerberus fleet; `hostile` → a Cerberus strike group (`cerberus_cruiser × 8, cerberus_frigate × 12`) arrives at 150 s **on side B**. Limitation (§8): the simulation has two sides, so a hostile Cerberus group mechanically fights beside the Reapers and is not shot at by them; its `priority: 'capitals'` makes it hunt Alliance dreadnoughts as the brief describes, but "hostile to both" is not modelled. The HUD labels the fleet `CERBERUS (HOSTILE)` and the briefing says so.

Player lock: `BattleController.order()` and `attackWithSelection()` check `sim.playerLocked`; while locked they toast `CINEMATIC OPENING — ORDERS UNLOCK AT 01:20 · K TO SKIP`. `K` (and a `Skip opening` button in the pause menu, `data-action="skip-opening"`) runs `sim.step()` until `sim.time ≥ lockUntil` with rendering suspended — the same thing the e2e `advance` helper does — so skipping changes wall time only, never the simulation. Camera, selection and speed controls stay live during the lock.

### 1.5 Arrival waves (`src/simulation/arrival.ts`)

Reinforcements today pop into formation at `arrivalTime`. A wave spawned by a beat enters with a drive flash and decelerates into its slot. The kinematics are scripted (pure functions of time), so determinism and replay hold and the per-step speed clamp in `updateMovement` is bypassed cleanly.

```ts
export interface ArrivalProfile { runKm: number; duration: number; }        // per role, compressed km
export const ARRIVAL: Record<'capital' | 'cruiser' | 'frigate', ArrivalProfile> = {
  capital: { runKm: 12, duration: 6.0 },   // dreadnought, carrier, Valkyrie, Ascension, liveship
  cruiser: { runKm: 9, duration: 4.5 },
  frigate: { runKm: 7, duration: 3.5 },
};
export interface ArrivalState { appearAt: number; settleAt: number; from: Vec3; to: Vec3 /* slot at spawn */; }
/** Ease-out cubic: fast entry, settles to zero relative speed. */
export const arrivalEase = (u: number): number => 1 - (1 - u) ** 3;
export function arrivalPos(a: ArrivalState, t: number): Vec3 {
  const u = clamp((t - a.appearAt) / (a.settleAt - a.appearAt), 0, 1);
  return lerp(a.from, a.to, arrivalEase(u));
}
```

`deployFleet(spec, { arrival: true, stagger })` creates the ships as today, then for each ship: `offset = this.rng.next() × stagger` (deployment order, so deterministic), `appearAt = time + offset`, `settleAt = appearAt + profile.duration`, `to = slotWorld(fleet, slot)`, `from = to − fleet.heading × runKm`. Entry speed is `3 × runKm / duration` (capital 6 km/s ≈ 60 render units/s — visibly an FTL drop, far below anything the swept collision test cares about).

While `ship.arrival` exists:

- `appearAt > time`: the ship is **pending** — excluded from `refreshSideCache` (so no AI, no targeting, no projectile collision), `ship.escaped`-like for rendering (`BattleView` skips it). At `appearAt` the sim emits `ship_arrival_flash { shipId, pos: from, heading, lengthKm }`.
- `appearAt ≤ time < settleAt`: `updateMovement` is replaced by `pos = arrivalPos(a, time)`, `vel = (pos − prevPos) / dt`, `heading = fleet.heading`. Weapons hold (`w.arrivalHold`), sensors work (enemies may target it; being shot while decelerating is correct). Fighters are not spawned by arrival (carriers launch later).
- `time ≥ settleAt`: `ship.arrival = undefined`; normal movement resumes with `vel ≈ 0` relative to the slot, so the arrive behaviour takes over without a jerk.

`fleet_arrived { fleetId }` (already in the event union, never emitted today) is emitted when the last ship of the wave settles. Ordinary `arrivalTime` reinforcements keep today's behaviour unless the spec sets `arrivalFlash: true`, in which case they use the same profile (recommended default for every scenario; it is purely visual plus the few seconds of settling).

Rendering (§4.1): `ship_arrival_flash` → a blue-white sphere flash (`size = 0.6 × lengthUnits`, 0.25 s) with a lateral streak along `−heading` (length `4 × lengthUnits`, 0.4 s), and the ship's engine glow at 3× for the first second (`v.arrivalGlow`).

### 1.6 Scripted specials (`sim.special`)

All specials are explicit `BattleSimulation` methods grouped under `sim.special` so beats, scenes, tests and (later) AI share one implementation. Each returns `'applied' | 'skipped'`, draws only from `this.rng`, and emits `scripted_event { beatId?, special, shipIds, forced: boolean }` whenever a `force*` option overrides a roll. `ship_destroyed` gains `cause: DestructionCause = 'kinetic' | 'thanix_stream' | 'reaper_beam' | 'warhead' | 'laser' | 'drive_attack' | 'scripted'` (from the weapon's `damageType`, or the special), which the effects need (§4.4, §4.7) and the results screen prints.

| Special | Implementation | Depends on |
| --- | --- | --- |
| `drive_attack` | `special.driveAttack(runnerId, targetId, { window, force, ignoreCorridor })`: eligibility per `PACK_ADOPTION.md` §2.11 (Cerberus cruiser/dreadnought, hull < 40 %, engines ≥ 0.4, corridor clear, attempts left, `special.driveAttacks !== 'off'`); `ignoreCorridor` and `force` are scene-only overrides and log `scripted_event`. Sets `ship.driveRun = { targetId, startedAt, endsAt: time + window, completes: force === 'success' ? true : force === 'intercept' ? false : rng.chance(completion) }` (roll made once, at commitment). During the run the ship's movement goal is the target with `speedFraction 1` and an acceleration/speed multiplier that ramps 1 → 4 over the window (visible blue-white flare); weapons silent; it stays a valid target (interception = `destroyShip(runner, killer)` before `endsAt`). At `endsAt`: completion → `destroyShip(target, runner, 'drive_attack')` then `destroyShip(runner, undefined, 'drive_attack')`; failure → `destroyShip(runner)` only (the brief's "attack that damages a second capital" is a legacy-tier variant: `apex_legacy` applies 30 % hull damage to the target on a failed run). Events: `drive_run_started { runnerId, targetId, endsAt }`, `drive_run_impact { runnerId, targetId, pos, dir, success }`. | D9 mechanic (`PACK_ADOPTION.md` §2.11), `special.driveAttacks` flag |
| `hades_strike` | `special.hadesStrike(shooterId, targetId, { rounds: 1, force })`: finds the Titan mount(s) with `specialAmmo > 0`, sets `cooldown = 0`, `forcedTargetId`, and `forcedShot = { targetId, hit: true, penetrate: force === 'hit_penetrating' }` consumed by `tryFire`/`applyHit` on the next shot (a forced penetrating hit skips the hit roll and guarantees `hullDamage > 0` so the warhead step runs). Emits `strike_scheduled { shipId, weaponId, at: time, kind: 'hades' }` which the effects use for the 1.2 s bow priming glow (§4.6). | Titan gun / HADES round (`PACK_ADOPTION.md` §3c) |
| `nova_strike` | Same shape for `nova_array`; with `withThanix` the three `thanix_heavy` channels get `cooldown = 0` and `forcedShot` 0.2–0.4 s later (offsets from `rng`), so the strike lands "in a tightly coordinated interval" (card 19). | Valkyrie (`PACK_ADOPTION.md` §3b) |
| `mission_kill` | `subsystems.weapons = 0.1`, `engines = 0.3` (overridable), active beams cut (`beamRemaining = 0`), emits `subsystem_disabled` ×2 and `mission_kill { shipId }`. The ship stays alive and dangerous at 40 % weapon factor (`wpnFactor = 0.4 + 0.6 × 0.1 = 0.46`), which is the brief's "a wounded Reaper still kills". | — |
| `destroy` | `destroyShip(ship, killer, 'scripted')`, gated by `ifHullBelow` (fraction) when given. Always logged as scripted. | — |
| `set_hull_fraction` / `set_barrier_fraction` / `set_subsystem` | Direct state writes with `onlyLower` (never heals unless asked). Logged as scripted. Used to pre-damage the Showcase's "crippled" cruiser and to satisfy the Valkyrie degraded-target rule honestly (the caption says so). | — |
| `withdraw_ship` | `ship.withdrawing = true` (D10 "abandon"/"withdraw" at ship level; Reapers can only do this under `reaperDoctrine: 'apex'` or by script). | D10 |
| `interpose` | `ship.interpose = { protectId, againstId?, until }`: the movement goal becomes the point on the segment protectee → attacker at `0.6 × protectee.lengthKm + 0.5 × ship.lengthKm` from the protectee, facing the attacker; `against` defaults to the enemy currently targeting the protectee with the highest `def.damage`. This is the same behaviour the D10 Apex AI uses for "move destroyers to cover a damaged capital", so it lives in `ai.ts` (`movementGoal` checks `ship.interpose` before the escort branch) and the special merely sets the state. | D10 |

`forceNextShot` (on `force_target`) and `forcedShot` consumption in `tryFire`: when `w.forcedShot` is set and the target is in arc and range, the mount fires at it on its next ready tick with `hit = true` (and `penetrate` → `applyHit` treats the round as penetrating even if armour would have stopped it); the flag is cleared after one shot or after 6 s unconsumed (`forced_shot_expired` event so the scene author sees it). Forced hits are logged as scripted; the Showcase summary counts them.

### 1.7 State and event additions (summary)

```ts
// simulation/types.ts additions
interface FleetOrders { /* existing */ holdFire?: 'none' | 'spinal' | 'beams' | 'all'; }
interface FleetSpec   { /* existing */ arrivalMode?: 'time' | 'beat'; arrivalFlash?: boolean; }
interface FleetState  { /* existing */ volley?: VolleyState; }
interface ShipState   { /* existing */ arrival?: ArrivalState; driveRun?: DriveRunState; interpose?: InterposeState; forcedTargetUntil?: number; }
interface ShipStats   { /* existing */ recentDamage: number /* exponentially decayed, τ = 10 s, updated in applyHit */; }
interface WeaponState { /* existing */ forcedShot?: { targetId: string; hit: boolean; penetrate: boolean; expiresAt: number }; arrivalHold?: boolean; heat?: number /* per-mount channels, PACK_ADOPTION §3c */; }
interface BattleConfig { /* existing */ beats?: BeatScript; distant?: DistantLayerConfig /* §5 */; }

type BattleEvent = /* existing */
  | { t; type: 'beat_fired' | 'beat_skipped'; beatId: string; kind: BeatEvent['kind']; label?: string }
  | { t; type: 'caption'; text: string; duration: number; style: CaptionStyle; speaker?: string; au: boolean }
  | { t; type: 'fleet_volley_ordered'; fleetId: string; at: number; window: number; mounts: VolleyMounts; mountsOrdered: number }
  | { t; type: 'fleet_volley_fired'; fleetId: string; fired: number; held: number; silent: number }
  | { t; type: 'ship_arrival_flash'; shipId: string; pos: Vec3; heading: Vec3; lengthKm: number }
  | { t; type: 'drive_run_started'; runnerId: string; targetId: string; endsAt: number }
  | { t; type: 'drive_run_impact'; runnerId: string; targetId: string; pos: Vec3; dir: Vec3; success: boolean }
  | { t; type: 'hades_detonation'; shipId: string; targetId: string; pos: Vec3; damage: number }      // from PACK_ADOPTION §3c
  | { t; type: 'strike_scheduled'; shipId: string; weaponId: string; at: number; kind: 'hades' | 'nova' | 'nova_legacy' }
  | { t; type: 'mission_kill'; shipId: string }
  | { t; type: 'scripted_event'; beatId?: string; special: string; shipIds: string[]; forced: boolean }
  | { t; type: 'forced_shot_expired'; shipId: string; weaponIndex: number };
// ship_destroyed gains `cause: DestructionCause`.
```

All new events are plain JSON; `tests/battle.test.ts` determinism assertions (`JSON.stringify(events)`) keep working, and the results screen's event export carries captions and scripted events so a recording can be annotated afterwards.

## 2. Camera vocabulary (`src/rendering/shots.ts`, `cameras.ts`, `director.ts`)

The brief's vocabulary — dolly, orbit, crane, rack, long lens, hold, cut — becomes a small data language (`Shot`) with one pure interpolation function (`shotPose`) and one player (`ShotListPlayer`). The Showcase feeds the player a hand-written list; the cinematic director feeds it shots it generates from rules. The rig itself only gains a mode that accepts a pose and a field of view.

### 2.1 Changes to `CameraRig` (`src/rendering/cameras.ts`)

- `CameraMode` gains `'shot'`; `CAMERA_MODE_LABELS.shot = 'Shot list'`. `createHud` skips that button unless `ctrl.hasShotList` (the Showcase hides the HUD anyway), so the seven `[data-camera=…]` buttons and the e2e loop over them are unchanged. No key is bound to it.
- `export interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov: number; roll: number }`.
- `rig.setPose(pose, instant)`: in `'shot'` mode the rig copies `pose.pos/look` into `desiredPos/desiredLook`, stores `fovTarget = pose.fov`, `rollTarget = pose.roll`. `apply(dt, instant)` additionally lerps `camera.fov` and the roll (applied by rotating `camera.up` about the view axis before `lookAt`) with the same `k` it uses for position; `instant` snaps all four. The field of view therefore transitions like the position does when the director blends, and cuts hard when a shot says cut.
- Shake becomes deterministic: `private readonly rng = new Rng('cam')` replaces `Math.random()` in `apply()`. A fresh rig per battle or scene means the same event sequence shakes identically, which Record mode (§3.2) relies on.
- Near plane: the existing `clamp(d × 0.002, 0.2, 50)` stays. A long lens (fov 8–18°) at 40–80 × subject size puts `d` at 300–1,600 units, near 0.6–3.2; fine with the logarithmic depth buffer.
- `fallback()` is unchanged. A `'shot'` frame without a pose (list exhausted, subject unresolvable and no fallback) uses tactical framing; the Showcase player treats "no pose" as "scene over" (§3.2).

### 2.2 Shots as data (`src/rendering/shots.ts`)

Pure module: it imports three's math classes and the simulation types only (no DOM, no renderer), so `tests/shots.test.ts` runs in node.

```ts
import * as THREE from 'three';
import type { Vec3 } from '@/core/vec3';
import type { ShipRef } from '@/simulation/beats';
import type { Side } from '@/simulation/types';

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'smooth' | 'expoOut';
export const EASE: Record<Easing, (u: number) => number> = {
  linear: (u) => u,
  easeIn: (u) => u * u,
  easeOut: (u) => 1 - (1 - u) ** 2,
  easeInOut: (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2),
  smooth: (u) => u * u * (3 - 2 * u),
  expoOut: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
};

/** What a shot looks at. Resolved every frame by the host into a SubjectPose; `ship` reuses the beat grammar of §1.1. */
export type SubjectRef =
  | { ship: ShipRef }
  | { fleetCentre: Side | string }                     // a side, or a fleet id; size = fleet extent (max slot radius)
  | { point: Vec3 }                                    // world km; size 1
  | { between: [SubjectRef, SubjectRef]; t?: number }  // lerp of two subjects (default 0.5); heading from A to B; size = max
  | { lastEvent: 'drive_run_impact' | 'hades_detonation' | 'ship_destroyed' | 'ship_arrival_flash'; filter?: { role?: string; side?: Side } }
  | { projectile: 'newest_heavy' }                     // the heaviest round in flight; size 2
  | { planetLimb: true }                               // the environment's planet surface point nearest the battlespace centre
  | { camera: true };                                  // where the camera is now (hold after a cut)

export interface SubjectPose { position: THREE.Vector3; heading: THREE.Vector3; velocity: THREE.Vector3; size: number }

/**
 * Camera placement in the subject's frame. Azimuth 0° = directly behind the subject (looking along its heading),
 * 180° = ahead of it looking back, 90° = off its right side; elevation in degrees; distance in multiples of `size`
 * with an absolute floor. `lookAhead` moves the look point along the heading (× size); `lookOffset` is an absolute
 * offset in the same frame (units). `fov` defaults to 42 (the current camera uses 50).
 */
export interface Framing { az: number; el: number; dist: number; minDist?: number; lookAhead?: number; lookOffset?: [number, number, number]; fov?: number; roll?: number }

export interface Drift { amp: number /* × size */; period: number /* s */ }

interface ShotBase {
  id: string;
  /** Scene seconds (before beatScale). Either `at` or `anchor` is required. */
  at?: number;
  /** Start relative to a beat's actual fire time: at = t(beat_fired) + offset. Negative offsets are allowed (the list is scanned ahead; see 2.4). */
  anchor?: { beat: string; offset: number };
  duration: number;
  easing?: Easing;
  /** Seconds of pose blend from the previous shot (0 = hard cut, the default). */
  blendIn?: number;
  /** Reaction cut: allowed below the 1.2 s minimum (≥ 0.4 s). */
  reaction?: boolean;
  /** Camera shake amplitude 0..1 injected at shot start (impact or beam shots). */
  shake?: number;
  /** Used when `subject` cannot be resolved (dead and removed, never spawned). Default: hold the last known pose. */
  fallback?: SubjectRef;
  label?: string;
}

export type Shot = ShotBase & (
  | { type: 'cut'; subject: SubjectRef; framing: Framing }
  | { type: 'hold'; subject: SubjectRef; framing: Framing; drift?: Drift }
  | { type: 'dolly'; subject: SubjectRef; from: Framing; to: Framing; look?: SubjectRef }
  | { type: 'orbit'; subject: SubjectRef; framing: Framing; sweep: number /* degrees of azimuth over the duration */ }
  | { type: 'crane'; subject: SubjectRef; from: Framing; to: Framing }
  | { type: 'rack'; from: SubjectRef; to: SubjectRef; framing: Framing; moveCamera?: number /* 0..1 of the way toward `to`'s framing, default 0 */ }
  | { type: 'longLens'; subject: SubjectRef; framing: Framing; fov: number /* 8–18 */; drift?: Drift }
  | { type: 'follow'; subject: SubjectRef; framing: Framing; lag?: number /* s of positional smoothing, default 0.35 */ }
  | { type: 'pov'; subject: SubjectRef; lookAtTarget?: boolean /* default true: look at the subject's current target, else down its heading */ }
);
export type ShotKind = Shot['type'];
export const BRIEF_SHOT_TYPES: ShotKind[] = ['dolly', 'orbit', 'crane', 'rack', 'longLens', 'hold', 'cut'];
```

`dolly` and `crane` share the same interpolation; `crane` is the semantic name for a move whose elevation/distance change dominates and it defaults to `easing: 'easeInOut'`, `roll 0`; `dolly` defaults to `'smooth'`. The split exists because the brief names both and because the director picks them under different rules (§2.5).

### 2.3 Pose maths (`shotPose`)

```ts
export interface PoseContext { renderTime: number; sceneSeed: number; prev?: Pose }
export function framingPose(f: Framing, s: SubjectPose, look?: SubjectPose): Pose
export function shotPose(shot: Shot, u: number /* 0..1 */, subjects: Record<string, SubjectPose>, ctx: PoseContext): Pose
```

`framingPose`: basis from the subject heading `h` (unit) and world up `U = (0,1,0)`: `r = normalize(h × U)` (falls back to `(1,0,0)` when `h ∥ U`), `u' = r × h`. Direction from subject to camera `d = R_az · R_el · (−h)` where `R_el` rotates about `r` by `el` and `R_az` about `u'` by `az`. `pos = s.position + d × max(f.dist × s.size, f.minDist ?? 0)`. `look = (look ?? s).position + h × (f.lookAhead ?? 0) × s.size + (r, u', h) · f.lookOffset`. `fov = f.fov ?? 42`, `roll = f.roll ?? 0`.

Per type, with `e = EASE[shot.easing ?? default](u)`:

| type | pose |
| --- | --- |
| `cut`, `hold` | `framingPose(framing, S)`; `hold` adds drift (below). |
| `dolly`, `crane` | `framingPose(lerpFraming(from, to, e), S, L)` where `lerpFraming` lerps `el`, `dist`, `lookAhead`, `fov`, `roll` linearly and `az` along the shorter arc. The look subject `L` is `look ?? subject`. |
| `orbit` | `framingPose({ ...framing, az: framing.az + sweep × e }, S)`. |
| `rack` | `pA = framingPose(framing, A)` captured once at `u = 0` (stored in the player, not recomputed, so the camera does not swing when `A` moves); `look = lerp(A.position, B.position, e)`; `pos = lerp(pA.pos, framingPose(framing, B).pos, (moveCamera ?? 0) × e)`. Field of view may tighten 10 % toward `B` when `B.size < A.size` (a focus pull reads better with a small push). |
| `longLens` | `framingPose({ ...framing, fov }, S)`, with `dist` enforced `≥ 40` (×size) and drift at a quarter of the hold amplitude: a long lens magnifies camera motion. |
| `follow` | `framingPose(framing, S)` then first-order lag: `pos = prev.pos + (target − prev.pos) × (1 − exp(−dt / lag))`; `roll = −lateralVelocity × 0.4` for fighter subjects (banking), clamped ±25°. |
| `pov` | Reaper POV, the brief's exterior view tied to the attack vector: `pos = S.position − h × 0.15 size + u' × 0.5 size` (just above and behind the hood; identical to today's `reaper` mode), `look = targetPosition` when `lookAtTarget` and the subject's `targetId` is alive, else `S.position + h × 6 size − u' × 0.3 size`. `fov 48`. The eye aperture sits at `z = 0.2 L` below the axis, so the hood plates fill the lower frame and the attack vector runs up the middle. |

Drift (`hold`, `longLens`): `pos += r × amp × size × sin(2π t / period + φ) + u' × 0.6 amp × size × sin(2π t / (1.37 period) + φ + 1.1)`, `t = ctx.renderTime`, `φ = Rng(sceneSeed ^ hash(shot.id)).next() × 2π` drawn once per shot. Default `amp 0.02`, `period 7`. Deterministic in `renderTime`; Record mode reproduces it.

Blend: when `blendIn > 0`, the player computes `posePrev = shotPose(previousShot, 1, …)` once at the cut and returns `lerpPose(posePrev, poseNow, smooth(min(1, age / blendIn)))`, lerping `pos`, `look`, `fov`, `roll`. The rig always receives `setPose(pose, instant = true)`, so the rig's own smoothing never doubles with the shot's.

Validation (`validateShots(shots): string[]`, run by the scene loader and by the unit test): every shot has `at` xor `anchor`; `duration ≥ 1.2` unless `reaction` (then `≥ 0.4`); `longLens.fov ∈ [8, 18]`; `orbit.sweep ≠ 0`; ids unique; shots sorted by resolved start do not overlap by more than `blendIn`; `BRIEF_SHOT_TYPES` all present (warning, not error — the Showcase scene test turns it into an assertion).

### 2.4 `ShotListPlayer`

```ts
export class ShotListPlayer {
  constructor(shots: Shot[], opts: { sceneSeed: number; beatScale: number })
  /** Beat events resolve anchored shots: `beat_fired(id)` → at = t + offset × beatScale. `beat_skipped` → the shot is dropped and the previous shot extends into its slot. */
  onEvent(e: BattleEvent): void
  /** Called once per rendered frame with renderTime = sim.time − SIM_DT + alpha × SIM_DT. Returns undefined when exhausted. */
  update(renderTime: number, resolve: (ref: SubjectRef) => SubjectPose | undefined): Pose | undefined
  readonly current?: Shot; readonly progress: number; readonly usedTypes: Set<ShotKind>; readonly exhausted: boolean
  /** Record-mode frame counter helper: the frame index of a render time at 60 fps. */
  static frameIndex(renderTime: number): number
}
```

Rules:

1. Start times are fixed at construction for `at` shots (`× beatScale`) and filled in by `onEvent` for anchored ones. An anchored shot with a negative offset (a cut that must land 0.5 s before the volley releases) is resolved from `fleet_volley_ordered`, whose payload carries `at` (the release time), not from the release itself; the same applies to `strike_scheduled` (`at`), `drive_run_started` (`endsAt`) and `ship_arrival_flash` (immediate). The anchor table maps beat kinds to the event and field that gives the future time; an anchor that cannot be known ahead of time simply starts late by one frame.
2. Ordering is by resolved start time, ties by list order. The active shot is the last one whose start ≤ renderTime; it holds until the next shot starts or its `duration` ends, whichever is later (a shot never leaves a gap; it extends).
3. Subjects are resolved every frame. If `resolve` returns `undefined` (ship destroyed and its visual removed, fleet not yet spawned), the player uses `fallback` if given, otherwise the last `SubjectPose` it saw for that reference (a wreck's last position: "the camera holds on the wreck"). `BattleView` keeps `SubjectPose` available for dying visuals (their `group.position` still updates during the death sequence) and the player caches the final one.
4. `usedTypes` accumulates for the Showcase summary and the acceptance test ("every listed shot type used at least once").
5. The player never touches the simulation, never reads wall time, and draws its only randomness (drift phases) from `sceneSeed`, so a replay with the same seed produces the same frames.

### 2.5 The director (`src/rendering/director.ts`)

`CinematicDirector` replaces `pickCinematicShot` and the ad-hoc `cine` state in `BattleView`. It owns a `ShotListPlayer` with an empty list, appends shots to it as it decides them, and exposes `update(renderTime, resolve) → Pose | undefined`. Mode `'cinematic'` (button and key 2 unchanged) means "director". Determinism: `Rng(config.seed ^ hash('director'))`, decisions keyed to `renderTime` and events only.

**Cadence state**: `lastWideAt`, `lastCloseAt`, `lastDistanceAt`, `currentEnds`, `queue: Cue[]`.

**Cue templates** (the ids referenced in §1.4):

| id | trigger (event or rule) | shot | duration |
| --- | --- | --- | --- |
| W1 establishing wide | first `ship_arrival_flash` of a battle, or the start of a battle with no arrivals | `dolly` on `{ fleetCentre: perspectiveSide }` from `{ az: 160, el: −18, dist: 3.2 }` to `{ az: 150, el: −12, dist: 2.4 }`, fov 36; in `earth_orbit` the look offset is biased +y so the planet's limb (`planetLimb`) sits in the lower third | 6–8 s |
| W2 lateral tracking | `fleet_arrived` or `order_issued advance` on the perspective side | `dolly` on `{ fleetCentre: fleetId }` from `{ az: 60, el: 4, dist: 1.1 }` to `{ az: 120, el: 4, dist: 1.1 }` with `lookAhead 0`, fov 40 | 6 s |
| W3 reverse angle | `order_issued advance` on a Reaper fleet, or any Reaper capital's `weapon_fired` while the camera is on the organic side | `hold` on `{ fleetCentre: reaperFleetId }` `{ az: 0, el: 12, dist: 1.6 }`, drift 0.03/9 | 4–6 s |
| W4 impact wall | `fleet_volley_ordered` (any side): scheduled at `at + flightTime − 0.3` | `hold` behind the receiving fleet `{ az: 10, el: 14, dist: 1.5 }`, shake 0.5 at the first `projectile_impact` on that fleet | 3–4 s |
| C1 keel pass | cadence: no close-up for 30 s; candidate = the largest alive capital of the perspective side | `crane` from `{ az: 150, el: −25, dist: 1.4 }` to `{ az: 30, el: −8, dist: 1.1 }`, fov 55 | 4 s |
| C2 bow/muzzle | `weapon_fired` of a big gun (damage ≥ 600) by a ship already in frame or the top damage dealer | `orbit` `{ az: 35, el: 8, dist: 1.4 }` sweep −30, fov 45 | 3–4 s |
| D1 side-on line | `fleet_volley_ordered` on the perspective side: scheduled at `at − 1.0` | `longLens` on `{ between: [fleetCentre A, fleetCentre B], t: 0.35 }` from `{ az: 90, el: 6, dist: 45 }`, fov 14 | 3 s |
| D2 scale pull-back | cadence: no distance shot for 45 s, or `fighters_launched` + 6 s | `longLens` on `{ between: [fleetCentre A, fleetCentre B] }`, `{ az: 70 + rng × 40, el: 10, dist: 60 }`, fov 10, drift 0.01/11 | 5–7 s |
| R1 reaction cut | `fleet_volley_ordered`: scheduled at exactly `at` on the anchor ship's bow | `cut` on the anchor ship `{ az: 160, el: 3, dist: 0.9 }`, fov 50, `reaction: true` | 0.5 s (then W4 or D1 resumes) |
| P1 Reaper POV | `order_issued advance` on a Reaper fleet (eyes waking, §4.10) or `launch_drones` | `pov` on the most valuable alive Reaper capital | 4–5 s |
| P2 receiving side | a Reaper capital `weapon_fired reaper_beam` whose target is a cruiser or bigger: scheduled immediately | `hold` on the target `{ az: 200, el: 20, dist: 2.2, lookAhead: 4 }` (the beam comes toward the camera), shake 0.6 while `beamHit` | beam duration (2.4–2.8 s) |
| F1 chase | `fighters_launched` on the perspective side + 3 s | `follow` on `{ ship: { fleetId, role: 'fighter', nth: 0 } }` `{ az: 15, el: 8, dist: 4 }`, lag 0.3 | 5 s, then D2 |
| K capital death | `ship_destroyed` of dreadnought/carrier/Reaper capital/super-dreadnought (today's `cine = { hold 4 }` jump) | `crane` on `{ lastEvent: 'ship_destroyed' }` from `{ az: 110, el: 25, dist: 2.2 }` to `{ az: 95, el: 5, dist: 1.6 }` | 5 s |
| H HADES / Nova | `strike_scheduled` | `cut` to the shooter's bow at `at − 0.3` (reaction), then `rack` from shooter to target over the flight time, then hold on the target through `hades_detonation` | 0.5 + 1.5 + 3 s |
| V drive run | `drive_run_started` | `longLens` on `{ between: [runner, target], t: 0.6 }`, fov 12, dist 70; the brief's distant combat view; never an orbit | until `drive_run_impact` + 2 s |

**Selection rule each time the current shot ends (or a preempting cue arrives)**: (1) take the highest-priority queued cue whose time has come (priority: R1 > H > V > P2 > K > W4 > D1 > F1 > P1 > W3 > W2 > W1 > C2 > C1 > D2); (2) otherwise cadence: if `renderTime − lastWideAt > 20` → W-class on the side with more alive hulls; else if `− lastCloseAt > 30` → C1/C2; else if `− lastDistanceAt > 45` → D2; (3) otherwise an interest shot: score alive ships `interest = 2 × firingNow + log2(1 + pointValue)/8 + recentDamage/2000 + 1.5 × (beamActive)`, pick from the top three with the rng, and shoot it with `orbit` (sweep ±25–40) or `dolly` for 4–7 s. Preemption: a queued cue may interrupt the current shot only when the current shot's age ≥ 1.2 s, or when the cue is a reaction cut (which returns to the interrupted shot afterwards). Shot ends snap to cue times ("beats land on events, not timers"): if a cue is due within the next 1.5 s, the current shot is extended to it rather than replaced by a filler.

What ordinary battles gain, without any scene data: the volley opening (D1 → R1 → W4) whenever the player presses `Volley`; a lateral tracking shot instead of the sinusoidal two-subject drift when fleets form up; a hull close-up every half minute; a long-lens scale shot every 45 s showing the whole engagement; a Reaper POV every time a capital fires; impact-side shots with shake when a beam lands. The two-subject framing formula in `cameras.ts` `case 'cinematic'` is deleted; the rig's `cinematic` opts parameter goes with it (the director supplies a pose through `'shot'`-style `setPose`; the mode name `'cinematic'` is kept for the HUD).

### 2.6 Hooking into `BattleView`

- `renderTime = sim.time − SIM_DT + alpha × SIM_DT` computed once per `update(dt, alpha)`.
- `resolveSubject(ref: SubjectRef): SubjectPose | undefined` replaces `subjectFor`: `ship` refs go through the sim-side resolver (`sim.resolveShipRef(ref)`, §1.1) and then to the visual (interpolated `group.position`, heading, velocity × KM, `built.lengthUnits`); `fleetCentre` uses `sideCentre`/a per-fleet centroid with `size = max slot radius × KM` (cached per frame); `between` lerps; `lastEvent` reads a small ring of the last 16 events of each listed type kept by `processEvents`; `projectile` scans `sim.projectiles`; `planetLimb` uses `env.planet.position` and radius.
- `updateCamera`: `'shot'` → `shotPlayer.update(renderTime, resolve)`; `'cinematic'` → `director.update(...)`; both call `rig.setPose(pose, true)` or fall back. `processEvents` forwards every event to `director.onEvent` and `shotPlayer?.onEvent`.
- `updateDying` and `finishDeath` stop using `Math.random` (they draw from `effects.rng`), so Record mode is frame-reproducible end to end.

## 3. Showcase mode (`src/showcase/`, `src/ui/screens/showcase.ts`)

A Showcase scene is a battle the player watches, not steers: a `BattleConfig` factory (fleets plus a beat script, §1), a shot list (§2) and captions, played with the HUD hidden, letterboxed, with a Record toggle. Everything the scene forces is logged and shown at the end.

### 3.1 Scene data format

```ts
// src/showcase/types.ts
import type { BattleConfig } from '@/simulation/types';
import type { Shot } from '@/rendering/shots';

export interface ShowcaseScene {
  id: string;                 // 'apex_refuse_at_sol' → data-scene attribute, summary key
  title: string;              // 'Apex: The Refuse at Sol'
  subtitle: string;           // one line for the chooser
  presetId: string;           // 'prime_apex' — the scene refuses to build under any preset whose category is 'canon'
  au: true;                   // literal: every scene that uses Apex objects is AU; the chooser and the frame tag read this
  tag: string;                // persistent caption, 'ALTERNATE UNIVERSE · PRIME/APEX'
  seed: number;               // default seed; 'Shuffle seed' overrides it
  duration: number;           // scene seconds at beatScale 1 (the player ends here even if shots remain)
  /** Builds the battle: fleets, beats (BeatScript with scripted: true), distant layer, environment. Pure. */
  config: (seed: number, beatScale: number) => BattleConfig;
  shots: Shot[];
  /** Static honesty lines for the chooser and the summary ('Forces 9 events: …'). Derived by a test from the beats, kept in data so the chooser needs no sim. */
  notes: string[];
}

export interface ShowcaseOptions { beatScale: 0.75 | 1 | 1.25 | 1.5; record: boolean; letterbox: boolean; captions: boolean; seed?: number }
```

Scenes are TypeScript modules under `src/showcase/scenes/` (they hold a config factory, so they are not JSON), exported as `SCENES: ShowcaseScene[]` from `scenes/index.ts`. Everything inside a scene except the factory is plain data; the factory calls the ordinary scenario helpers (`fleet(...)`, `reaperFleet(...)`, `base(...)` from `src/scenarios/index.ts`, exported for the purpose) and attaches `beats`, `distant` and `maxDuration`. Random draws inside the factory come from `new Rng(seed ^ hash(scene.id))`; no `Math.random` anywhere under `src/showcase/`.

Two refinements to §1.1 that the scene depends on (✎): `ShipRef.nth` indexes **deployment order including dead ships**, so a reference such as "the fourth Reaper capital" never slides onto another hull after a death (a dead match resolves to nothing and the beat is skipped); and `set_fleet_order` accepts `targetRef?: ShipRef`, resolved at fire time into `patch.targetId`, so a fleet order can name a ship the author cannot know the id of.

### 3.2 Player (`src/showcase/player.ts`)

`ShowcaseSession` is attached to an ordinary `BattleController` (`ctrl.showcase`), which keeps one battle loop for both modes:

- **Construction**: `app.startShowcase(scene, opts)` builds `config = scene.config(opts.seed ?? scene.seed, opts.beatScale)`, creates the controller with `{ showcase }`, hides the HUD (`hudHidden = true`, `overlay.visible = false`), sets `rig.setMode('shot')`, creates `ShotListPlayer(scene.shots, { sceneSeed, beatScale })` and passes it to `view.attachShotList(player)`. Player orders, selection, follow and the camera keys are disabled (`ctrl.order/attackWithSelection/select` early-return while `showcase` is set); mouse drag does nothing unless free-look is on.
- **Keys**: Space pause/resume; `R` Record toggle; `F` free-look (hands the camera to `free` mode from the current pose; `F` again returns to the shot list, which cuts to where it would have been); `C` captions on/off; `L` letterbox on/off; `Esc` ends the scene early (summary marked "ended early at mm:ss").
- **Letterbox**: two DOM bars (`.letterbox.top`, `.letterbox.bottom`) inside `#ui`, height `max(0, (H − W / 2.39) / 2)` recomputed on resize; the renderer keeps rendering full-frame underneath (so a 16:9 capture cropped to 2.39:1 loses nothing). Captions live inside the bottom bar when it is ≥ 48 px high, otherwise float 24 px above the frame bottom.
- **Captions** (`src/showcase/captions.ts`): a queue fed by `caption` events (sim-side, §1.2) and by `scene.shots[i].label` when `opts.captions`. Styles: `tag` persistent bottom-left, 11 px mono, 0.3 em tracking, dim; `title` centred, 34 px, 0.4 s fade in/out; `tactical` bottom centre, 14 px mono uppercase with a 1 px orange rule above; `quote` 18 px italic sans, centred above the bar, speaker in orange mono (`HARBINGER`, `SHEPARD`) — these are the pack's AU lines and the speaker tag is suffixed `· AU`; `insert` a small `.panel` top-right, two lines. Durations are the event's (already × `beatScale`). At most one `tactical`/`quote` at a time: a new one replaces the old with a 0.15 s crossfade; `tag` and `title` are independent layers.
- **Stepping**: normal mode is the controller's accumulator loop at speed 1 (speed keys disabled). **Record mode** replaces wall time: each `requestAnimationFrame` advances exactly `1/60` s of render time — `accumulator += 1/60`; `while (accumulator ≥ SIM_DT) sim.step()`; `alpha = accumulator / SIM_DT`; `view.update(1/60, alpha)`; `shotPlayer.update(renderTime)`; the rig's `apply(1/60, …)`. Nothing reads `performance.now()`. The output is identical frame for frame regardless of machine speed or display refresh (on a 120 Hz display the scene plays at double speed; a 60 fps capture is unaffected). The cursor is hidden (`#app { cursor: none }`) and a frame counter `.rec-counter` (`REC · 00:01:12 · F 4323`) sits in the top bar; the counter is part of the DOM so the capture includes it unless hidden with `C`. Audio keeps playing (the person records system audio), but the light-before-sound delay (§7.4) is computed from render time, so it also reproduces.
- **End**: when `shotPlayer.exhausted`, or `renderTime ≥ scene.duration × beatScale`, or `sim.finished`: 1.0 s fade to black (`.fade` overlay), controller disposed, `app.show('showcase', { summary })`. The summary screen shows: title, AU tag, seed, pace, duration shown, **forced events** (every `scripted_event`, grouped by beat id with the ship names involved), ships lost per side (natural vs forced counts), shot types used (`usedTypes` as `7/7` over `BRIEF_SHOT_TYPES`, listing any missing), frames rendered when recorded, and buttons `Replay`, `Shuffle seed`, `Back to scenes`, `Main menu`. Nothing on this screen calls the scene canon.

```ts
export interface ShowcaseSummary {
  sceneId: string; title: string; auTag: string; seed: number; beatScale: number; shownSeconds: number; endedEarly: boolean;
  forced: { beatId: string; special: string; ships: string[] }[];
  losses: { A: { natural: number; forced: number }; B: { natural: number; forced: number } };
  shotTypesUsed: ShotKind[]; shotTypesMissing: ShotKind[];
  recorded: boolean; frames: number;
}
```

### 3.3 Menu entry, chooser screen and app wiring

- `menu.ts`: `item('Showcase', () => app.show('showcase'), 'AU SCENES')` directly after `Quick Battle` → `data-menu="showcase"`. No existing slug changes.
- `ScreenName` gains `'showcase'`; `App.show('showcase', params?: { summary?: ShowcaseSummary })` renders `renderShowcase(app, params)`.
- `renderShowcase`: header `SHOWCASE — SCRIPTED SCENES` with the AU badge; one card per scene (`[data-scene="<id>"]`): title, subtitle, preset name with its badge, duration at the chosen pace, `notes` (forced-event count); options row: pace select (`0.75 / 1 / 1.25 / 1.5`), Record (`[data-action="record"]`, default off), Letterbox (on), Captions (on), Seed (`fixed <seed>` / `shuffle`); `[data-action="play-scene"]`. Footer in dim text: "Scenes are scripted. Events the script forces are marked at the end. Showcase scenes are alternate-universe fiction and are never presented as canon." When `params.summary` is present the summary panel renders above the cards.
- `App.startShowcase(scene, opts)`; `BattleController` gains `showcase?: ShowcaseSession` and the early-returns listed in §3.2; `hud.ts` is untouched apart from the `shot` button filter (§2.1).
- Preferences: `prefs.showcase = { beatScale: 1, record: false, letterbox: true, captions: true }` with defaults merged in `App.init` like the other sub-objects, so old preference blobs load.

### 3.4 Scene 1 — "Apex: The Refuse at Sol" (`src/showcase/scenes/apexRefuseAtSol.ts`)

Built from montage shot cards 16–23. Every caption that carries an Apex figure ends in `· AU SCENARIO VALUE`; the persistent tag reads `ALTERNATE UNIVERSE · PRIME/APEX`; the two Harbinger lines and Shepard's line are the pack's original AU dialogue, shown as `quote` captions with the speaker suffixed `· AU`. There are no character models in this project, so card 23 ("Shepard looks at the next target") is carried by the Normandy SR-2 and a rack to the next contact. Rule of cool governs the staging; everything still has to read as Mass Effect: Reapers kill what they shoot, the Valkyrie finishes a Reaper that escorts have already degraded, the drive attack is one event on a cleared vector, Harbinger's fall switches nothing off.

**Config** (`presetId 'prime_apex'`, environment `earth_orbit`, seed 2186, `maxDuration 400`, `lockPlayerUntil` irrelevant, `distant` on with Apex captions). Positions are nominal km before `× S`; the Reaper line starts at `z = 22` (gap 20.8 km) so the first guns reach at ≈ 24 s.

| fleet id | faction / side | ships (names from `NAMES`, new lists in brackets) | formation | position / heading | arrival |
| --- | --- | --- | --- | --- | --- |
| `sword-alliance` | alliance / A | `alliance_dreadnought` ×4 (Kilimanjaro, Orizaba, Fuji, Elbrus — Kilimanjaro-class silhouette for the first two after §7.8), `normandy_valkyrie` ×1 ('SSV Normandy Valkyrie'), `alliance_carrier` ×1, `alliance_cruiser` ×10, `alliance_frigate` ×14, `alliance_frigate_thanix` ×1 ('SSV Normandy SR-2') | `layered_line` (§7.2; `line_abreast` until it lands) | `(−14, 0, −28)` / `(0,0,1)` | beat `arrive_alliance` |
| `sword-turian` | turian / A | `turian_dreadnought` ×3, `turian_cruiser` ×8, `turian_frigate` ×10 | `line_abreast` | `(16, 0, −30)` | beat |
| `sword-asari` | asari / A | `destiny_ascension` ×1, `asari_dreadnought` ×1, `asari_cruiser` ×6 | `defensive_screen` | `(0, 3, −36)` | beat |
| `sword-quarian` | quarian / A | `quarian_heavy` ×1, `quarian_cruiser` ×5 | `defensive_screen` | `(−32, 0, −34)` | beat |
| `sword-geth` | geth / A | `geth_dreadnought` ×1, `geth_cruiser` ×3, `geth_frigate` ×4 | `strike_wedge` | `(32, 0, −33)` | beat |
| `sword-cerberus` | cerberus / A | `cerberus_dreadnought` ×2 (Prometheus, Eos), `cerberus_heavy_cruiser` ×1 [`NAMES.cerberus_heavy_cruiser = ['Covenant', 'Sanctum']`], `cerberus_cruiser` ×6, `cerberus_frigate` ×8 | `strike_wedge` | `(1, 0, −30)` — the gap between Alliance and Hierarchy | beat `arrive_cerberus` |
| `sol-platforms` | alliance / A | `sol_defence_platform` ×2 (§7.10) | `static` | `(−6, 2, −18)`, `(8, −2, −18)` | present at 0, no flash |
| `reaper-sol` | reaper / B | `harbinger` ×1, `reaper_capital` ×4, `reaper_destroyer` ×10 (Oculi 12 + 32 + 20 aboard) | `swarm_descent` (§7.2; `strike_wedge` until it lands) | `(0, 4, 22)` / `(0,0,−1)` | 0; `hold_formation`, `fightersDeployed: false` |
| `reaper-sol-reserve` | reaper / B | `reaper_capital` ×2, `reaper_destroyer` ×4 | `strike_wedge` | `(−40, 0, 60)` / `(0.4, 0, −1)` | `arrivalTime 95`, `arrivalFlash: true` |

93 hulls on side A (plus 24 Tridents after 30 s), 21 on side B (plus 64 Oculi): below today's Final Battle load. Named references used below: `KILI = { name: 'SSV Kilimanjaro' }`, `VALK = { name: 'SSV Normandy Valkyrie' }`, `SR2 = { name: 'SSV Normandy SR-2' }`, `ASC = { name: 'Destiny Ascension' }`, `HARB = { name: 'Harbinger' }`, `HC1 = { fleetId: 'sword-cerberus', classId: 'cerberus_heavy_cruiser', nth: 0 }`, `R1…R4 = { fleetId: 'reaper-sol', classId: 'reaper_capital', nth: 0…3 }`, `D2, D3 = { fleetId: 'reaper-sol', classId: 'reaper_destroyer', nth: 1, 2 }`, `F1 = { fleetId: 'sword-turian', classId: 'turian_frigate', nth: 2 }`, `CR1 = { fleetId: 'sword-alliance', classId: 'alliance_cruiser', nth: 0 }` (SSV Emden), `AF0…AF3 = { fleetId: 'sword-alliance', classId: 'alliance_frigate', nth: 0…3 }`, `P1 = { fleetId: 'sol-platforms', classId: 'sol_defence_platform', nth: 0 }`, `TGT0 = { query: 'nearest', to: { fleetId: 'sword-alliance' }, side: 'B' }` (the lead Reaper at the wedge apex, normally `R1`).

**Beat table** (scene seconds at `beatScale 1`; ✱ = forced outcome, logged as `scripted_event` and listed in the summary; "order" = an order the AI could also have given, not a forced outcome):

| id | at | event | kind |
| --- | ---: | --- | --- |
| `tag` | 0.0 | caption `tag` "ALTERNATE UNIVERSE · PRIME/APEX", persistent | — |
| `title` | 0.5 | caption `title` "SOL · 2186 · THE REFUSE", 4 s | — |
| `arrive_alliance` | 0.0 | `spawn_wave sword-alliance`, stagger 3.0 | — |
| `arrive_turian` | 3.0 | `spawn_wave sword-turian`, stagger 2.5 | — |
| `arrive_asari` | 5.5 | `spawn_wave sword-asari`, stagger 2.0 | — |
| `scale` | 6.0 | caption `tactical` "38,420 WARSHIPS COMMITTED TO SOL · AU SCENARIO VALUE", 4.5 s (card 16; the arrivals are layered over 12 s, never one transit) | — |
| `arrive_quarian` | 7.0 | `spawn_wave sword-quarian`, stagger 2.0 | — |
| `arrive_geth` | 8.5 | `spawn_wave sword-geth`, stagger 2.0 | — |
| `form_up` | 10.0 | `set_fleet_order side:A { order: 'advance', holdFire: 'spinal', fightersDeployed: false }` | order |
| `platforms` | 12.0 | caption `tactical` "612 DEFENCE PLATFORMS — SOL NETWORK · AU SCENARIO VALUE · 2 SIMULATED", 4 s | — |
| `reapers_advance` | 14.0 | `set_fleet_order reaper-sol { order: 'advance', holdFire: 'beams' }` | ✱ (withholds fire the AI would open at ≈ 22 s) |
| `oculus` | 16.0 | `launch_drones fleets: reaper-sol, burst 6` | — |
| `arrive_cerberus` | 18.0 | `spawn_wave sword-cerberus`, stagger 1.5 (card 17: brakes into the gap) | — |
| `iff` | 18.5 | caption `tactical` "CERBERUS BLACK FLEET — ALLIED IFF CONFIRMED · AU", 4 s | — |
| `heavy_guns` | 22.0 | `set_fleet_order [sword-alliance, sword-turian] { order: 'attack', holdFire: 'none' }` | order |
| `mark_r1` | 24.0 | `force_target fleets: [sword-alliance], target: TGT0` | order |
| `black_volley` | 26.0 | `fleet_volley [sword-cerberus], lead 2.0, window 1.2, target: TGT0` → release 28.0–29.2 onto a hull already under Alliance heavy guns (card 17); the two Black Fleet dreadnoughts fire Titan guns, so this volley carries the scene's first HADES rounds (natural; no detonation is expected against intact barriers — a non-penetrating round gets no internal effect, D7) | — |
| `line_free` | 30.0 | `set_fleet_order side:A { order: 'attack', holdFire: 'none', fightersDeployed: true }`; `set_fleet_order reaper-sol { order: 'attack', holdFire: 'beams' }` | order |
| `reaper_answer` | 32.0 | `fleet_volley reaper-sol, mounts 'beams', lead 1.5, window 2.0` → 33.5–35.5 | — |
| `ascension_threat` | 36.0 | `force_target ships: [R2], target: ASC` | order |
| `interpose` | 36.5 | `trigger_special interpose { ship: HC1, protect: ASC, against: R2, seconds: 14 }` (card 18) | ✱ |
| `hc_hit` | 39.0 | `force_target ships: [R2], target: HC1, forceNextShot: 'hit'` — the beam meant for the Ascension lands on the interposing cruiser (expected: barriers gone, hull ≈ 45 %; see the ledger note) | ✱ |
| `ascension_salvo` | 41.0 | `force_target ships: [ASC], target: R2, forceNextShot: 'hit'`; `fleet_volley [sword-asari], lead 1.0, window 1.3, target: R2` | ✱ (one hit) |
| `valk_focus` | 46.0 | `set_fleet_order sword-alliance { focusFire: true, priority: 'reaper_capitals' }`; `force_target fleets: [sword-alliance], target: R3` | order |
| `escorts` | 46.0 | `force_target ships: [AF0, AF1, AF2, AF3], target: R3` (torpedo runs, card 19) | order |
| `degrade` | 54.0 | `trigger_special set_barrier_fraction { ship: R3, fraction: 0.3, onlyLower: true }` (if the escorts did it, this is a no-op and the ledger says so) | ✱ |
| `solution` | 55.0 | caption `tactical` "TARGET SOLUTION SHARED. FIRE CONCENTRATED.", 3.5 s | — |
| `nova` | 56.0 | `trigger_special nova_strike { shooter: VALK, target: R3, withThanix: true, force: 'hit' }` → `strike_scheduled` at 56.0; the round lands ≈ 0.5 s after departure (19.2 km/s over ≈ 9 km) | ✱ |
| `r3_fails` | 58.5 | `trigger_special destroy { ship: R3, killer: VALK, ifHullBelow: 0.9, cause: 'kinetic' }` — "fails at that region", three-stage death (§4.5); skipped (and reported) if R3 is somehow untouched | ✱ |
| `pov_kill` | 64.0 | `force_target ships: [R1], target: F1, forceNextShot: 'hit'` (card 20: the Reaper kills a foreground escort) | ✱ |
| `harb_line` | 64.0 | caption `quote` "Your resistance will be corrected." speaker HARBINGER · AU, 3.5 s | AU text |
| `formation` | 69.0 | caption `tactical` "THE FORMATION DID NOT BREAK.", 3 s (slot keeping opens the line around the wreck without an order) | — |
| `battery` | 70.0 | `force_target ships: [R1], target: { query: 'top_damage_dealer', side: 'A', window: 10 }` (D10 "kill the active gun platform") | order |
| `converge` | 72.0 | `fleet_volley [sword-turian, sword-alliance], target: R1, lead 1.5, window 1.5, syncArrival: true` → impacts cluster 73.5–75.0 beside the POV camera | — |
| `hades` | 73.0 | `trigger_special hades_strike { shooter: KILI, target: R1, rounds: 1, force: 'hit_penetrating' }` — the Kilimanjaro's Titan gun (Apex: `apex_hyper_ma` with HADES penetrators) lands inside R1's hood beside the POV camera: white flash, ring shock, venting (§4.6); the only HADES strike in the scene, D7-consistent, and the home of screenshot 03 | ✱ |
| `cripple` | 78.0 | `set_hull_fraction { HC1, 0.3, onlyLower }`; `set_subsystem { HC1, weapons, 0.1 }`; `set_subsystem { HC1, engines, 0.5 }` (card 21: one surviving engine, dark sections) | ✱ |
| `corridor` | 79.0 | `set_fleet_order sword-cerberus { order: 'hold_formation' }` | order |
| `damping` | 80.0 | caption `tactical` "DAMPING FAILURE. TERMINAL VECTOR CONFIRMED.", 3 s | — |
| `drive` | 80.5 | `trigger_special drive_attack { runner: HC1, target: R2, window: 14, force: 'success', ignoreCorridor: true }` → `drive_run_started`, blue-white flare ramp, `drive_run_impact` at 94.5 (R2 destroyed, cause `drive_attack`; HC1 lost) | ✱ |
| `kill_confirmed` | 95.5 | caption `tactical` "BLACK FLEET DRIVE ATTACK — CAPITAL KILL CONFIRMED · AU", 4 s (no yield number, ever) | — |
| `harb_damaged` | 96.0 | `set_hull_fraction { HARB, 0.5, onlyLower }`; `set_barrier_fraction { HARB, 0.4, onlyLower }` | ✱ |
| `harb_kills` | 97.0 | `force_target ships: [HARB], target: CR1, forceNextShot: 'hit'` (card 22: destroys a threatening gunship) | ✱ |
| `harb_exit` | 100.0 | `withdraw_ship { HARB }`; `interpose { D2, protect: HARB, seconds: 20 }`; `interpose { D3, protect: HARB, seconds: 20 }` (destroyers cover the damaged capital — what the Apex AI does by itself; scripted here for timing) | ✱ |
| `allied_shift` | 102.0 | `set_fleet_order side:A { order: 'attack_target', targetRef: HARB, priority: 'reaper_capitals' }` | order |
| `cycle` | 104.0 | caption `quote` "This cycle is not concluded." speaker HARBINGER · AU, 3.5 s | AU text |
| `second_volley` | 108.0 | `fleet_volley side:A, mounts 'spinal_and_beams', target: HARB, lead 2.0, window 1.5, syncArrival: true` → impacts 110.0–111.5 | — |
| `mission_kill` | 112.0 | `trigger_special mission_kill { ship: HARB }` (weapons 0.1, engines 0.3; beams cut; §4.10 visual) | ✱ |
| `mk_caption` | 112.5 | caption `tactical` "HARVEST COMMAND VESSEL — MISSION KILL · AU", 4 s (qualified: not a confirmed destruction) | — |
| `others` | 114.0 | `set_fleet_order reaper-sol { order: 'attack' }` (the remaining Reapers press on; the test asserts their weapons are untouched) | order |
| `next` | 118.0 | caption `quote` "Mark the next one." speaker SHEPARD · AU, 3 s; `force_target fleets: [sword-alliance], target: R4` | AU text / order |
| `end_tag` | 130.0 | caption `tag` "ALTERNATE UNIVERSE · PRIME/APEX — SCENE END", 2 s | — |

`scene.duration = 132`. The reserve's `arrivalTime 95` gives the background its own arrival flashes during Acts VI–VII.

**Ledger note on `hc_hit`**: a capital beam burst is 1,900/s × 2.8 s = 5,320 points. With the heavy cruiser of `PACK_ADOPTION.md` table 2.3 (barriers absorb ≈ 40 % of a Reaper beam) the expected result is barriers down and hull near 45 %: crippled, alive, and exactly the hull card 21 needs. If calibration changes that, `cripple` at 78 s still produces the state (it only lowers), and if the beam kills `HC1` outright the drive attack is skipped and the summary says "drive attack skipped: runner lost at 39 s" — the scene continues (S19–S21 fall back to `R2`). The acceptance test (§6.1) pins the expected branch on the default seed.

**Shot list** (`at` in scene seconds unless anchored; `dur` seconds; framings in `Framing` terms; "card" = montage card). Types: 3 × `cut`, 2 × `hold`, 7 × `dolly`, 3 × `crane`, 2 × `orbit`, 4 × `rack`, 5 × `longLens`, 1 × `follow`, 1 × `pov`.

| id | start | dur | type | subject and framing | card |
| --- | ---: | ---: | --- | --- | --- |
| S01 | 0.0 | 6.0 | dolly | `{ fleetCentre: 'sword-alliance' }` from `{ az 165, el −20, dist 3.4, fov 34 }` to `{ az 155, el −12, dist 2.6 }`, `lookOffset [0, +0.6·size, 0]` so the Earth limb sits in the lower third; `fallback { point: (−5.6, 0, −11.2) }` until the first hull appears | 16 · W1 |
| S02 | 6.0 | 6.0 | dolly | `{ fleetCentre: 'A' }` from `{ az 60, el 4, dist 1.15, fov 40 }` to `{ az 118, el 4, dist 1.15 }` — lateral track as echelons stack up behind the foreground ships | 16 · W2 |
| S03 | 12.0 | 3.5 | crane | `KILI` from `{ az 150, el −25, dist 1.4, fov 55 }` to `{ az 30, el −8, dist 1.1 }` — under the keel, gun housing overhead | C1 |
| S04 | 15.5 | 3.5 | hold | `{ fleetCentre: 'reaper-sol' }` `{ az 0, el 12, dist 1.6 }`, drift 0.03/9 — reverse angle, eyes waking in sequence (§4.10) | 20 setup · W3 |
| S05 | anchor `arrive_cerberus` +1.0 | 4.0 | dolly | `{ fleetCentre: 'sword-cerberus' }` from `{ az 120, el 10, dist 1.3 }` to `{ az 95, el 6, dist 1.1 }` — the formation brakes into the gap; an orange-marked hull passes a turian cruiser | 17 |
| S06 | 23.0 | 4.5 | rack | from `HC1` to `TGT0`, framing `{ az 200, el 6, dist 3.0 }` about `HC1`, `moveCamera 0.2` — focus slides to the hull already under allied heavy guns | 17 |
| S07 | anchor `black_volley` +1.5 | 3.0 | longLens | `{ between: [{ fleetCentre: 'sword-cerberus' }, TGT0], t: 0.4 }` `{ az 90, el 6, dist 45 }`, fov 14 — the Black Fleet's release crosses the frame as one wall | 17 · D1 |
| S08 | 30.5 | 3.5 | orbit | `KILI` `{ az 40, el 8, dist 1.5, fov 45 }`, sweep −35 — the spinal gun firing free | C2 |
| S09 | anchor `reaper_answer` +1.5 | 3.0 | cut | `CR1` `{ az 200, el 20, dist 2.2, lookAhead 4 }`, shake 0.6 — the beam sweep seen from the receiving side | P2 |
| S10 | 36.5 | 5.5 | dolly | `ASC` from `{ az 250, el 12, dist 1.8 }` to `{ az 290, el 6, dist 1.5 }`, `look { between: [ASC, HC1] }` — the heavy cruiser slides across the foreground between the flagship and the incoming attack | 18 |
| S11 | 42.0 | 3.5 | rack | from `HC1` (venting) to `R2`, framing `{ az 230, el 8, dist 3.0 }` about `HC1`, shake 0.3 — the Ascension's salvo lands as focus arrives | 18 |
| S12 | 45.5 | 3.5 | longLens | `{ between: [P1, { fleetCentre: 'B' }], t: 0.25 }` `{ az 80, el 8, dist 40 }`, fov 12 — a platform's twin channels in the foreground, the exchange behind | §7.10 · D2 |
| S13 | 49.0 | 5.0 | dolly | `VALK` from `{ az 95, el 6, dist 1.7, fov 42 }` to `{ az 85, el 4, dist 1.4 }` — broadside, escorts establishing scale | 19 |
| S14 | 54.0 | 1.7 | follow | `AF0` `{ az 15, el 8, dist 4 }`, lag 0.3 — torpedo run on `R3` | 19 · F1 |
| S15 | anchor `nova` −0.3 | 1.8 | cut | `VALK` `{ az 160, el 3, dist 0.9, fov 50 }` — bow priming glow, then the round leaves frame right | 19 · H |
| S16 | anchor `r3_fails` −1.0 | 6.5 | crane | `R3` from `{ az 120, el 25, dist 2.2 }` to `{ az 100, el 5, dist 1.6 }` — Thanix streams converge on the damaged region; the three-stage death; `fallback { lastEvent: 'ship_destroyed', filter: { role: 'reaper_capital' } }` | 19 · K |
| S17 | anchor `pov_kill` −0.3 | 8.8 | pov | `R1`, `lookAtTarget` — above and behind the hood, down the attack vector at the turian line; `F1` dies ahead; the line opens around the wreck; the beam swings to the battery; converging impacts light the hood beside the camera at 73.5 and the HADES detonation vents beside it at ≈ 73.6 | 20 · P1 |
| S18 | 72.5 | 4.0 | longLens | `{ fleetCentre: 'sword-turian' }` `{ az 0, el 6, dist 30 }`, fov 16 — the formation did not break | 20 |
| S19 | 76.5 | 4.0 | dolly | `HC1` from `{ az 300, el 10, dist 1.6, fov 48 }` to `{ az 330, el 3, dist 1.2 }` — cooling failures, dark sections, one engine lit; `fallback R2` | 21 |
| S20 | anchor `drive` +0.0 | 14.5 | longLens | `{ between: [HC1, R2], t: 0.6 }` `{ az 100, el 5, dist 70 }`, fov 12, drift 0.005/13; `fallback { lastEvent: 'drive_run_impact' }` — the distant combat view; the camera does not orbit; neighbours keep firing | 21 · V |
| S21 | 95.0 | 3.0 | hold | `{ lastEvent: 'drive_run_impact' }` `{ az 90, el 10, dist 2.0 }` — one abrupt flash already gone; fragments along the collision vector | 21 |
| S22 | 98.0 | 6.0 | orbit | `HARB` `{ az 60, el 15, dist 1.4, fov 44 }`, sweep 50 — damaged shell, rotating; `CR1` dies in frame; a dying allied hull drifts in the foreground | 22 |
| S23 | 104.0 | 6.0 | dolly | `{ fleetCentre: 'sword-alliance' }` from `{ az 180, el 20, dist 1.2 }` to `{ az 150, el 10, dist 1.0 }`, `look HARB` — several firing axes converge | 22 |
| S24 | anchor `second_volley` +2.0 | 3.5 | cut | `HARB` `{ az 140, el 8, dist 1.3 }`, shake 0.5 — the synchronised impacts cluster on the damaged machinery | 22 · W4 |
| S25 | 113.5 | 4.5 | crane | `HARB` from `{ az 100, el 30, dist 1.6 }` to `{ az 100, el 0, dist 1.1 }` — aperture dims, running lights flicker, limbs unlit; other Reapers active behind | 22 |
| S26 | 118.0 | 4.0 | rack | from `HARB` to `SR2`, framing `{ az 220, el 10, dist 2.4 }` about `HARB`, `moveCamera 0.3` | 23 |
| S27 | 122.0 | 5.0 | rack | from `SR2` to `R4`, framing `{ az 190, el 6, dist 2.0 }` about `SR2`, `moveCamera 0.5` — "Mark the next one." | 23 |
| S28 | 127.0 | 5.0 | longLens | `{ between: [{ fleetCentre: 'A' }, { fleetCentre: 'B' }] }` `{ az 75, el 10, dist 60 }`, fov 11, drift 0.01/11; the player fades over the last second | — |

Pacing audit against the brief's rules: no shot under 1.2 s (S14 1.7 s, S15 1.8 s); a wide at 0, 6, 15.5, 27.5, 45.5, 63.7 (the POV frames the whole line), 72.5, 80.5–95, 104, 127 — never more than 20 s apart; a hull close-up at 12, 30.5, 55.7, 76.5, 98, 110, 113.5 — never more than 30 s apart; nine of the 28 shots start on an event anchor rather than a timer.

**Forced-event ledger** (what the summary prints): 15 ✱ beats — `reapers_advance` (hold fire), `interpose`, `hc_hit`, `ascension_salvo`, `degrade`, `nova`, `r3_fails`, `pov_kill`, `hades`, `cripple`, `drive`, `harb_damaged`, `harb_kills`, `harb_exit`, `mission_kill` (`cripple` and `harb_exit` carry three specials each and `harb_damaged` two, so the summary lists 20 entries). Natural: the arrival waves, every volley's actual hits and misses, which Oculi and Tridents die, the Reaper reserve's behaviour, the destroyer losses, and which side is ahead at 132 s. The scene does not declare a winner.

### 3.5 Pace knob and seed

`opts.beatScale` is passed into `scene.config` (it becomes `beats.beatScale`) and into the `ShotListPlayer` (shot `at` × `beatScale`, anchor offsets × `beatScale`, drift periods unscaled); caption durations scale through the beat events. Physics does not scale (arrival runs, flight times, beam bursts), so at `1.5` the shots sit a little longer on each event, which is the point of the knob. The seed is fixed per scene (2186) so two people see the same film; `Shuffle seed` re-rolls it — forced events still happen, natural ones vary, and the summary states the seed used.

## 4. Effects upgrade plan (`src/rendering/effects.ts` → `effects/*.ts`)

Everything here is render-only, reads simulation state and events, draws its randomness from `Rng('fx')` (already the case) and never writes back. The brief's looks (§4 of the brief) are listed per effect with the simulation data each needs and its cost. `KM = 10` units per km; "size" is the target's `lengthUnits`.

### 4.0 Architecture first: one draw call per effect family

Today every spark is a `THREE.Sprite` (one draw call each, cap 900) and every barrier flash a separate `Mesh` (cap 60), so a volley impact wall can cost several hundred draw calls on its own. Before adding looks, two pools replace them:

- **`BillboardPool` (`src/rendering/billboards.ts`)**: one `InstancedMesh` of a unit quad with a `ShaderMaterial` (billboard in the vertex shader; per-instance attributes `offset vec3`, `scale`, `rotation`, `color vec4`, `atlas index`, `birth`, `life`; a 2 × 2 texture atlas: flash, fire, blue, smoke; red = fire tinted). Two instances of the pool: `additive` (sparks, flashes, glows; `AdditiveBlending`, `depthWrite false`) and `alpha` (smoke, dust; `NormalBlending`). Capacity 4,096 each; the CPU only writes the ring buffer at spawn and advances `uTime`; fading, growth and motion (`offset + vel × age`) happen in the shader. API mirrors today's `spark(pos, vel, life, startScale, endScale, tex, color)` so call sites change one import. Draw calls: 2.
- **`BarrierShellPool` (`src/rendering/barrierShell.ts`)**: §4.2; one mesh per ship under fire, visible only while a hit is live (≤ 16 visible).
- Beams: the per-beam `CylinderGeometry` pair stays for ≤ 8 near beams; beams whose start is farther than 200 units from the camera are drawn as segments of a single `LineSegments` (`farBeams`, 1 draw call) with the same colours.
- Debris: generic fragments move to one `InstancedMesh` (`debrisInstanced`, 512 instances, 1 draw call); the ship's own mesh pieces remain individual meshes (≤ 8 per capital death, 3 capital deaths in flight ≈ 24).

### 4.1 Mass-accelerator rounds

| Part | Look | Sim data | Cost |
| --- | --- | --- | --- |
| Tracer core | the existing instanced box, per-instance colour via `setColorAt`: blue-white `0xdff4ff` for organic slugs (every faction; Mass Effect rounds are not faction-coloured), slightly violet-white `0xe8e0ff` for HADES/Titan rounds, longer and brighter for the Nova (`weapon.id` ∈ {`nova_array`, `nova_legacy`} → length × 2.2, width × 1.6), tiny for fighter guns | `sim.projectiles[*].{pos, prevPos, vel, weapon.id, weapon.damage}` (already synced each frame) | 1 draw call |
| Ionised trail | a second `InstancedMesh` of an elongated additive quad along `−vel`, length `speed × 0.25 s`, alpha fading from 0.35 to 0, colour `0x6fb0ff` | same | 1 |
| Muzzle flash | a 0.1 s sphere flash (billboard, `size 0.5–1.3` as today) plus a lateral vent: two additive quads perpendicular to the barrel (0.15 s, length 1.5 × flash) | `weapon_fired` (mass_accelerator) + muzzle world position (`built.muzzle` for big guns, hardpoint offset otherwise) | pool |
| Hull impact | white flash (0.12 s), 6–12 slag sparks (orange `0xffa040`, decelerating, 0.6–1.0 s, velocity in the hemisphere away from the hull) and a lingering orange glow decal: an additive billboard parented to the ship (follows it) fading over 3–6 s; ≤ 8 decals per ship, oldest replaced | `projectile_impact { pos, hullDamage, targetId, damageType }`; the decal's local position = `group.worldToLocal(pos)` | pool |
| Near miss | small barrier-edge flare at the closest approach point when a round passes within 1.6 radii of its intended target | `projectile_near_miss { targetId, pos, miss }` (new event from §7.7) | pool + shell |

### 4.2 Kinetic barriers: hull-shaped shell with hexagonal ripple (brief §4 and §8.3)

- **Geometry**: computed once per class template in `getShipTemplate` and cached on `BuiltShip.shell`: `mergeGeometries` of the template's `hull`, `hullDark` (and for Reapers `plates`, `arms`) geometries with their mesh matrices applied, vertices pushed along their normals by `0.035 × lengthUnits` and the result scaled by 1.06 about the group origin (≈ 1.06–1.1 overall, as the brief asks). Normals recomputed; `BufferGeometryUtils.mergeVertices` first so the push does not split seams. A sphere is used only for fighters.
- **Material** (`ShaderMaterial`, additive, `depthWrite false`, `FrontSide`): uniforms `uColor` (faction barrier tint; `0x6fb0ff` organic, `0x9fb8ff` geth, `0xff6a4a` Reaper), `uHits[8]` (`vec4`: local hit position xyz, age w; unused slots `age = −1`), `uCollapse` (0..1), `uTime`, `uSize`. Fragment: `rim = pow(1 − |dot(N, V)|, 2.2)`; per hit: `ring = smoothstep(0.08, 0, |d − v × age|)` with `d = distance(localPos, hit)`, `v = 1.6 × uSize` units/s, fading `× (1 − age / 1.2)`; `hex = hexCell(localPos projected onto the plane orthogonal to the dominant axis of the hit normal, cell 0.12 × uSize)` returning 1 at cell edges and 0.35 inside; `alpha = 0.12 × rim + Σ ring × (0.5 + 0.5 × hex) × (0.6 + 0.4 × rim)`; collapse: `alpha += uCollapse × (1 − step(hash(cell), uCollapse))` so hex cells drop out by threshold over the collapse (full-shell flash at `uCollapse = 1` for 0.25 s, then fragments over 0.6 s). Visible only while any hit age < 1.2 s or collapsing (`mesh.visible`), so an idle ship costs nothing.
- **Sim data**: `projectile_impact` with `barrierDamage > hullDamage` → `addHit(targetId, localPos)`; beams: no per-tick event exists, so `BattleView` registers a hit every 0.25 s of render time at `w.beamEnd` while `w.beamHit` and the target's `barriers > 0`; `barriers_down { shipId }` → `collapse(shipId)`; near misses → `addHit` with half amplitude at the nearest shell point.
- **Cost**: one draw call per visible shell; cap 16 visible (least recently hit hidden first). Replaces the 60 icosahedron shells.

### 4.3 Thanix stream drip

Core colour becomes orange-white (`0xffd9a0` core, `0x4fa0ff` sheath glow — today's core is blue-white, the sheath is right). Drip: 8–10 billboards per second spawned along the beam at random `t ∈ [0.1, 0.9]`, velocity = `beamDir × 0.2 + lateral 0.05 × size`, life 0.8 s, orange → dark orange. Impact "pours sideways": impact sparks get velocities tangent to the hull (perpendicular to the beam direction, random azimuth), life 0.8 s. Heavy Thanix (`thanix_heavy`, 625/s) scales core radius by `sqrt(damage / 420)`. Data: `WeaponState.{beamStart, beamEnd, beamHit, beamRemaining, def.id, def.damage}` (already read in `update`). Cost: beam pair (2) + pool.

### 4.4 Reaper beams: slit and split

- Colours: core `0xff6a40` (deep red, not near-white as today), glow `0xa00010`; a lens flare billboard at the eye (`built.muzzle`), `0.5 × size`, visible while `beamRemaining > 0`, pulsing with `beamRemaining`.
- Slit: while a beam hits, a `SlitDecal` on the target — a thin emissive white-hot quad (`0.03 × size` wide) whose length grows along a deterministic sweep direction (perpendicular to the beam, azimuth from `Rng('fx')`) across the hull during the burst (ornament: the simulation's contact point is the target centre), with molten sparks (§4.3's tangent rule, red-orange). The decal cools from white to orange to dark over 4 s and stays as a scar (≤ 4 per ship).
- Split: `ship_destroyed` with `cause: 'reaper_beam'` on a cruiser or frigate → `finishDeath` divides the ship's mesh pieces by the plane through the beam line (plane normal = `beamDir × shipUp`), gives the two groups opposite lateral velocities (`0.3 × size`/s) and a slow counter-roll, and clones their materials with an emissive orange edge for 2 s. Reads as cut in two along the beam. Data: `ship_destroyed { cause, killerId }` + the killer's last `beamStart/beamEnd` (cached per shooter by the view).
- Cost: beam pair (2) + ≤ 4 decals (pool) + pieces (existing).

### 4.5 Capital death in three stages (brief §4)

Driven by `updateDying` (durations become 2.6 s for dreadnought/carrier/super-dreadnought/Reaper capital, 1.1 s for cruisers/destroyers):

1. **Internal flashes** (0–1.8 s): 6–10 light bursts at seeded points inside the hull (billboards, white → orange, 0.2 s), `windows` mesh emissive pulsing (clone material once), 3–5 venting jets (billboard streams, 1.5 s). `flashLight` placed inside the hull at 20 × size.
2. **Hull breaks** (1.8–2.4 s): the existing piece separation with modest velocities, a core white flash (billboard 2.5 × size), and for dreadnought-class and Reaper capitals a **screen-filling white**: DOM overlay `.white-flash` with opacity `peak → 0` over 0.35 s, `peak = clamp(40 × size / cameraDistance, 0.25, 0.9)`.
3. **Expanding shell** (2.4–12 s): one additive fresnel sphere (the old `shieldGeo`) expanding from `0.5 × size` to `4 × size` over 6 s and fading (gas), 10–14 `alpha` smoke billboards drifting with the wreck's velocity, debris continuing (instanced). Reaper variant: red-tinted shell, the `eye` emissive goes dark at stage 2, the running lights die one by one through stage 1.

Data: `ship_destroyed { pos, role, classId, cause }`, dying visual's position/velocity. Cost: ≤ 2 shells (one mesh each) + pool + pieces.

### 4.6 HADES: penetrator flash, ring shock, venting (brief §4, §8.5; D7)

Always described as a penetrator with a nuclear warhead; the tracer is an ordinary round.

| Phase | Look | Data |
| --- | --- | --- |
| Priming | 1.2 s pulsing blue-white billboard at the Titan muzzle, `0.25 × size` | `strike_scheduled { shipId, at, kind: 'hades' }` |
| Flight | ordinary tracer (§4.1), violet-white | projectile |
| Penetration | the ordinary hull impact (§4.1) at `projectile_impact` | `projectile_impact` |
| Detonation (0–0.25 s) | hard white flash (billboard `2 × size`, 0.12 s); **shadow pulse**: a second point light `hadesLight` at the detonation point (intensity `400 × size`, decay 0.25 s) and `scene.environmentIntensity` dropped 0.35 → 0.08 for 0.12 s so every face not lit by the pulse goes dark — an approximation of shadow casting, which we do not enable (cost); DOM white at `peak 0.35` within 60 × size | `hades_detonation { shipId, targetId, pos, damage }` |
| Ring shock (0–0.6 s) | a ring mesh (annulus, additive, inverted alpha gradient, a second ring at 1.04 × radius tinted blue for a chromatic edge) in the plane perpendicular to the penetration direction, radius `0.2 → 3 × size`; the background "distortion" is approximated by the double ring (a true refraction pass would need a post-process and is not planned) | `hades_detonation.pos`, penetration direction = the projectile's velocity (cached by the view on `projectile_impact`) |
| Venting (0.5–5 s) | 4–6 jets from seeded hull points of the target (billboard streams orange → grey, following the ship), `hull` emissive flicker 0.3 → 0 over 4 s; if the warhead's subsystem outage hit `engines`, the engine glow sprites dim for 8 s | `hades_detonation`, `subsystem_disabled` |
| Sound | the impact sound, then the muffled internal detonation 0.6 s later (§7.4) | `hades_detonation` |

Cost: ring 2 meshes per active strike (≤ 2 strikes) + light + pool.

### 4.7 Drive attack collision (D9)

`drive_run_started { runnerId, targetId, endsAt }`: the runner's engine glow sprites scale ×3 and shift to blue-white (`0xcfe8ff`) over the window; a drive-flare trail (additive billboard strip, 3 × size long) grows behind it; damaged sections are already dark from the hull tint. `drive_run_impact { pos, dir, success }`: success → one abrupt flash (billboard `3 × targetSize`, 0.15 s, white), DOM white `peak 0.25` at any distance, 30 instanced fragments in a cone (half-angle 20°) along `dir` at `0.6–1.2 × size`/s plus the target's three-stage death with stage 1 shortened to 0.6 s; the runner is removed with a small burst. Failure → the runner's own death. The camera rule (no orbit) is a shot-list matter (§2.5 cue V).

### 4.8 Oculus

Model: an original 12 m sphere with a single red lens (`eye` material), rendered through the instanced small-craft path (fighters switch to points at 90 units; the far-point colour for Oculi is `0xff4a3a`). Laser: `BALANCE_AUDIT.md` §9.2 settled on a 1 s red beam burst (`reaper_beam` kind, 48/s) — rendered through the beam pool with radius `0.02 × intensity` and the Reaper colours; if the lead instead adopts `PACK_ADOPTION.md` §3c's gardian-kind `oculus_laser`, it renders as a 0.1 s red line through `setPointDefence` (colour `(1, 0.25, 0.15)`), which already exists. Data: `WeaponState` beams of fighter-role Reaper ships, or `sim.flashes` kind `reaper_pd`. Cost: pooled either way.

### 4.9 Far tracer sparks from the LOD cloud (brief §4 "distance shots"; D11)

A second `THREE.Points` (`farTracers`, max 4,096, additive, `size 1.6`, attenuated) fed each frame from projectiles whose shooter's visual is at LOD `point` **or** whose distance to the camera exceeds 150 units; the near instanced tracers skip those. Colours as §4.1 (blue-white, Nova ×2 size); Reaper beams beyond 200 units go into `farBeams` (§4.0). Because volley departures cluster inside 1.0–1.5 s (§1.3), a long-lens frame of a volley shows a wall of blue-white sparks crossing the gap — the brief's "volleys read as walls of light". The existing far point cloud keeps drawing ships; its colour stays the faction engine colour. Cost: 2 draw calls total for all far rounds and beams.

### 4.10 Smaller hooks

- `ship_arrival_flash` (§1.5): blue-white sphere flash `0.6 × lengthUnits` (0.25 s) + a streak along `−heading` (`4 × lengthUnits`, 0.4 s); engine glow ×3 for 1 s.
- Eyes waking (Final Battle beat `reapers_advance`, scene beat of the same name): on `order_issued` with `order=advance` for a Reaper fleet, each Reaper's `eye` emissive ramps 0.3 → 1 over 0.8 s, staggered 0.25 s by deployment index (the running lights follow); render-only.
- `mission_kill { shipId }`: `eye` emissive to 0.15 over 1 s; running lights flicker (deterministic square wave from `Rng('fx')` phases) for 6 s then 30 % stay dark; engine glow 0.3; beams already cut by the sim.
- `fleet_volley_ordered`: nothing visual by itself (the HUD shows the countdown); the director uses it.
- `caption`: DOM only (§3.2).

### 4.11 Draw-call budget (effects only; peak frame of the Final Battle under Apex, tactical wide)

| Family | Today (worst case) | After | Notes |
| --- | ---: | ---: | --- |
| Sparks / flashes / smoke | up to 900 | 2 | `BillboardPool` additive + alpha |
| Tracers | 1 | 2 | core + trail |
| Far rounds and beams | 0 (none) | 2 | `farTracers`, `farBeams` |
| Far ships (LOD cloud) | 1 | 1 | unchanged |
| Near beams | 2 × beams (≤ 40) | ≤ 16 | ≤ 8 near beams, rest in `farBeams` |
| Barrier shells | ≤ 60 | ≤ 16 | hull-shaped, hit-gated |
| Death shells / HADES rings | 0 | ≤ 6 | 2 + 2 × 2 |
| Debris | ≤ 40 per death | ≤ 24 + 1 | hull pieces + one instanced mesh |
| Missiles, PD lines | 2 | 2 | unchanged |
| **Effects total** | **≈ 1,000+** | **≤ 72** | ships themselves are a separate budget (§7.2) |

The DOM flashes cost no draw call. `BattleView.drawCalls` already reports `renderer.info.render.calls` in the HUD clock line, so the budget is checkable in a screenshot.

## 5. Distant engagement layer (`src/simulation/distant.ts`, `src/rendering/distant.ts`)

The simulation fields at most a few hundred hulls; the Apex scenario describes tens of thousands (D13). The distant layer represents the rest as statistics: counts that tick down, drive lights and tracer sparks far outside the battlespace, and scale captions. It never touches the real simulation's outcome.

### 5.1 Simulation side

```ts
export interface DistantGroup { id: string; side: Side; faction: FactionId; label: string; count: number; bearingDeg: number; distanceKm: number /* compressed, 60–160 */; spreadKm: number; classMix: { capital: number; heavy: number; line: number; light: number } /* fractions, sum 1 */ }
export interface DistantLayerConfig { enabled: boolean; groups: DistantGroup[]; captions: 'apex' | 'canon' | 'none'; firstLossAfter?: number /* s, default 30 */ }
export interface DistantGroupState { id: string; remaining: number; losses: number; firingRate: number /* 0..1, for the renderer */ }
export interface DistantState { groups: DistantGroupState[]; lastUpdate: number }
```

`BattleConfig.distant?: DistantLayerConfig`. `BattleSimulation.distant?: DistantState`, advanced at the end of `step()` after `checkEnd` (so it can never influence a decision taken in the same tick) by `advanceDistant(sim, dt)`:

- Randomness: `sim.distantRng = sim.rng.fork('distant')` created in the constructor **once** — a child generator, so the main stream is untouched and the real battle is bit-identical with the layer on or off (asserted in `tests/distant.test.ts`).
- Pacing: let `realLoss(side, 20 s)` be the fraction of that side's deployed combat hulls destroyed in the last 20 s (from `ship_destroyed` events, decayed), and `pressure(side) = clamp(enemyPoints / ownPoints, 0.3, 3)` from `sidePoints`. Per group, per second: `λ = 0.0009 × pressure(side) + 0.6 × realLoss(side) / 20`; expected losses `remaining × λ × dt`, realised by stochastic rounding (`distantRng.chance(frac)`), never below 0, and only after the first real `ship_destroyed` or `firstLossAfter` seconds, whichever comes first. The layer therefore follows the real battle's tempo (quiet opening, losses when the lines engage) and `beatScale` indirectly (a slower opening delays the first real loss). `firingRate = clamp(engagedFraction, 0, 1)` where `engagedFraction` is the share of the real side's combat hulls that fired in the last 2 s; the renderer uses it to pace sparks.
- Events: `distant_update { groups: { id, remaining, losses }[] }` every 5 s (for the HUD and captions), and `distant_group_broken { id }` when a group falls below 10 % — captions only.
- Results: `BattleResult` is unchanged; `summarise` ignores the layer. The results screen prints a separate "DISTANT ENGAGEMENT (STATISTICAL)" line with the counts and the AU suffix when `captions === 'apex'`.

Group construction (scenario builders, `src/scenarios/distantGroups.ts`): under Apex presets (`rules.strategic.cerberusStance === 'cooperative' && rules.special.hyperMassAccelerators`), the coalition groups come from `APEX_SCALE.coalition.byCommand` (`PACK_ADOPTION.md` §3e) minus the simulated hulls, one group per command (Alliance 12,800 → `count 12,800 − simulated`, Hierarchy 7,200, …, Black Fleet 420), class mix from the pack's class columns; the Reaper groups from `APEX_SCALE.reaper.committedToSol` (480 capitals, 12,000 destroyers; transports/processors are not combatants and appear only in the caption). Bearings fan out ±70° behind each side's real line at 60–160 km. Captions: `38,420 WARSHIPS COMMITTED TO SOL · AU SCENARIO VALUE · 142 SIMULATED, REST STATISTICAL` (the simulated count is live), `480 CAPITAL SHIPS · 12,000 DESTROYERS COMMITTED TO SOL · AU SCENARIO VALUE`. Under `canon_me3`: the layer is on for the Final Battle and the Battle of Earth (the codex describes fleets far larger than 70 hulls) but **shows no absolute numbers** — no canon source gives a hull count — so groups are built per real fleet with `count = 12 × simulated`, and the caption reads `DISTANT ENGAGEMENT · STATISTICAL · COMBINED FLEET vs REAPER ARMADA`, with the HUD counter showing percentages ("ALLIANCE ECHELONS 94 %"). Custom battles: off by default, a checkbox in D6's screen.

### 5.2 Render side

`DistantRenderer` (`src/rendering/distant.ts`), owned by `BattleView`, seeded from `Rng(config.seed ^ hash('distant-render'))`:

- **Drive lights**: one `THREE.Points` (≤ 4,096, additive, glow map, `size 2.6`, attenuated, per-point colour = faction engine colour, per-point phase for a slow flicker in the shader). Each group is a cluster centred at `battlespaceCentre + dir(bearing) × distanceKm × KM`, points scattered in an oblate ellipsoid (`spreadKm × KM`, half height) with a slow common drift toward the enemy side (`0.05` units/s) so the echelons visibly close. Visible points per group `= ceil(remaining / lightsPerHull)` with `lightsPerHull` chosen so the whole layer fits 4,096 (Apex Sol: one light ≈ 10 hulls); as `remaining` falls, points at the cluster edge go dark. Everything is far enough (600–1,600 units beyond the fleets) that the far plane (600,000) and the planet are not an issue, and the long-lens shots see them as a glittering line.
- **Tracer sparks**: a second `Points` (≤ 8,192) with attributes `origin`, `dir`, `speed`, `t0`, `color`; the vertex shader computes `pos = origin + dir × speed × (uTime − t0)` and discards expired points, so the CPU only writes spawns into a ring buffer. Spawn rate per group `= remaining × 0.02 × firingRate` per second (capped), direction toward the nearest enemy group with a 2° spread, speed 12 km/s × KM, lifetime 1.4 s; organic sparks blue-white, Reaper "beams" as short red streaks (speed ×4, life 0.3 s). Losses: each decrement of `remaining` spawns a 0.3 s large orange flash point at a random cluster point (1 in 10 for the Reaper side so their losses read rarer and larger).
- **Captions and counters**: the HUD status line appends `· DISTANT: A 94 % · B 97 %` from `distant_update`; the Showcase shows the `tactical` captions listed above through the beat script; the results screen the summary line.
- Cost: 2 draw calls. Driven by `renderTime` and `DistantState` only; no feedback into the simulation.

## 6. Acceptance tests

Today: 83 Vitest tests in `tests/`, 8 Playwright tests in `e2e/`. Everything below is additive except the two existing assertions named in §6.4, which the brief's §8.6 makes obsolete.

### 6.1 Unit tests (Vitest, `environment: 'node'`; everything imported is DOM-free)

| File | Test | Assertion |
| --- | --- | --- |
| `tests/beats.test.ts` | schedule is stable and quantised | `scheduleBeats` sorts by `at × beatScale` rounded to `SIM_DT`; equal times keep authoring order; `beatScale 2` moves `at 36` to tick 1440 |
| | unresolvable reference skips, never throws | a beat naming a dead or absent ship emits `beat_skipped` and the sim keeps stepping |
| | captions ride the log | `caption` events carry `duration × beatScale`, `style`, `au` |
| | spawn_wave deploys by beat | a fleet with `arrivalMode: 'beat'` has no ships before the beat; after it every ship has `arrival`, one `ship_arrival_flash` per ship at `appearAt`, one `fleet_arrived` when the last settles |
| | player lock predicate | `isPlayerLocked(sim)` true before `lockPlayerUntil × beatScale`, false after; `player_control { locked: false }` clears it early |
| | Final Battle opening order (brief §6, seeds 1–3, canon and `prime_apex`, `cinematic_arrival: '1'`) | event order: first `ship_arrival_flash` < last `fleet_arrived` < Reaper `order_issued` advance < side-A `fleet_volley_ordered` < `fleet_volley_fired` < first `ship_destroyed` of cruiser or larger, all before 70 s; Cerberus world state `allied` → a side-A Cerberus fleet spawns by beat, `absent` → none, `hostile` → a side-B Cerberus fleet with `arrivalTime 150`; Oculi: `fighters_launched` from a Reaper hull before 30 s and `reaper_oculus` ships exist |
| | determinism | two sims of the same config: identical `JSON.stringify(events)` after 1,600 steps including every new event type; identical ship positions |
| `tests/volley.test.ts` | offsets | every offset ∈ `[0, window − 0.1]`, anchor ship 0, identical across two sims |
| | hold then release | no spinal `weapon_fired` from the fleet between order and release; at `beatScale 0.5 / 1 / 2` ≥ 85 % of spinal mounts with a target in arc and range fire inside `[at, at + window + SIM_DT]` (`fleet_volley_fired.fired / (fired + silent)`), seeds 1–3, fixed scaling |
| | normal fire control resumes | after `at + window + 1` the fleet's `volley` is undefined, `holdFire` is `'none'`, spinal shots continue |
| | syncArrival | `offset − flightTime` has min 0 and max ≤ window over the fleet's mounts |
| `tests/arrival.test.ts` | kinematics | `arrivalEase(0) = 0`, `(1) = 1`, monotone; `arrivalPos` hits `from`/`to`; relative speed at settle < 0.05 km/s |
| | pending ships are inert | not in `enemiesOf`, no `weapon_fired`, no `projectile_impact` on them before `appearAt`; targetable after it |
| `tests/shots.test.ts` | framing | `az 0` puts the camera behind (`dot(pos − S, h) < 0`), `az 180` ahead, `el > 0` above; distance = `dist × size` with the floor |
| | interpolation | dolly at `u = 0/1` equals `framingPose(from/to)`; orbit azimuth difference = `sweep` at `u = 1`; rack look at `u = 0.5` is the midpoint; longLens enforces `dist ≥ 40` and the fov |
| | drift | `pose(t) ≈ pose(t + period)` (1e-6) and differs for a different `sceneSeed` |
| | player | an anchored shot starts at `t(beat_fired) + offset`; `beat_skipped` drops it; `exhausted` after the last shot; poses identical for identical event streams |
| | validator | rejects a 1.0 s non-reaction shot, accepts 0.5 s `reaction`, rejects duplicate ids; scene 1's list passes and covers `BRIEF_SHOT_TYPES` |
| `tests/distant.test.ts` | isolation | the real event log (minus `distant_*`) is byte-identical with the layer on and off; `BattleResult` identical |
| | counts | `remaining` non-increasing, never negative; no losses before `firstLossAfter` or the first real `ship_destroyed`; two runs identical |
| | captions | Apex configs produce captions ending in `· AU SCENARIO VALUE`; canon configs produce no digit-bearing distant caption |
| `tests/showcase.test.ts` | scene builds only under an AU preset | `scene.config` under `prime_apex` builds; `assertShowcasePreset` throws for `canon_me3` |
| | script order (seed 2186, 2,640 steps) | `beat_fired` ids appear in table order for the required subset (`arrive_*`, `black_volley`, `reaper_answer`, `interpose`, `nova`, `r3_fails`, `hades`, `drive`, `harb_kills`, `mission_kill`); `scripted_event` entries match the ledger; `R2` destroyed with `cause: 'drive_attack'`; `R3` destroyed with killer Valkyrie; `hades_detonation` on `R1` |
| | D10 regression | the tick after `mission_kill(Harbinger)` every other alive Reaper has unchanged `subsystems` and `weapons[*].cooldown` deltas, and at least one Reaper fires after 112 s |
| | AU labelling | every caption containing a number of three or more digits contains `AU SCENARIO VALUE` or `· AU`; the first caption is the `tag` |
| `tests/determinism.test.ts` | full replays | Final Battle cinematic (canon, Apex; seeds 1–3; 2,400 steps) and scene 1 (2,640 steps): identical events and ship states; `ShotListPlayer` poses identical frame by frame at 60 Hz |
| `tests/movement.test.ts` | §7.1 | Battle of Earth 120 s: every fleet's heading change rate ≤ 0.06 rad/s; mean angular rate about the anchor < 0.02 rad/s over 10 s windows after first contact; no non-fighter path turns more than 360° in one direction |
| `tests/formations3d.test.ts` | §7.2 | `layered_line` has cruisers at three distinct `y` values and frigates ahead on a dome; `swarm_descent` destroyers lie on a shell 9–12 km from the core; no two slots within `max(lengthKm) × 1.7` |
| `tests/perf.test.ts` | §7.2 | custom 200 vs 60 for 400 steps completes under 3 s on CI; `SpatialGrid.querySegment` returns the same candidate set as the brute-force loop for 1,000 random segments |
| `tests/withdrawal.test.ts` | §7.6 | after first contact no more than 10 % of a side's live ships are stationary and silent for 10 s; `escaped` is only ever true for fighters; a withdrawing cruiser's barriers rise before it re-engages |
| `tests/solutions.test.ts` | §7.7 | two dreadnoughts vs a muted stationary target: hit rate < 25 % over the first 6 s, > 60 % over seconds 20–40; a hard manoeuvre drops `q` by ≥ 0.2; replay identical |
| `tests/platforms.test.ts` | §7.10 | a platform's position is unchanged after 600 steps; heading change ≤ turnRate; `issueOrders(move)` emits `order_rejected`; a Reaper fleet in range targets a platform before a cruiser |
| `tests/silhouette.test.ts` | §7.8 / D12 | `Box3` ratios of every template match its design sheet within 5 %; `reaper_capital` z-extent / `alliance_dreadnought_k` z-extent = 2.0 ± 0.1 |
| `tests/effectsPool.test.ts`, `tests/audio.test.ts` | §4.0, §7.4 | the billboard ring buffer recycles the oldest instance past capacity and writes no NaN; `scheduleDelay(distance)` and `voiceTimeline('seismic_au')` (crack, gap, boom times) are pure and match the spec |

### 6.2 End-to-end (Playwright; software GL, same `advance` pattern)

`e2e/showcase.spec.ts`:

1. **Scene plays to its end with every shot type and zero console errors.** `goto('/')` → `[data-menu="showcase"]` → `[data-scene="apex_refuse_at_sol"]` visible and its card contains `ALTERNATE UNIVERSE` → `[data-action="play-scene"]` → `.letterbox.bottom` visible, `.showcase-captions` contains `ALTERNATE UNIVERSE · PRIME/APEX` within 3 s → `advance(20)` (the helper calls `window.reaperwar.battle.showcase.advance(seconds)`, which runs the Record-mode step loop without `requestAnimationFrame`) → captions contain `CERBERUS BLACK FLEET` → `advance(120)` → `.showcase-summary` visible (timeout 60 s) containing `FORCED EVENTS`, `ALTERNATE UNIVERSE` and `SHOT TYPES 7 / 7` → `errors` empty.
2. **Record toggle, letterbox and early exit.** Chooser → `[data-action="record"]` → play → `.rec-counter` visible and its frame number increases between two reads 500 ms apart; `getComputedStyle(#app).cursor === 'none'`; press `Escape` → summary contains `ENDED EARLY` → `[data-action="back-to-scenes"]` → chooser visible.

`e2e/game.spec.ts` gains one test (the existing five are untouched): **Final Battle cinematic opening** — Quick Battle → `button:has-text("Final Battle of Earth")` → `[data-action="launch"]` → `[data-order="advance"]` click → `.toast` contains `CINEMATIC OPENING` → `advance(70)` → evaluate the event order of §6.1 → `[data-order="volley"]` visible.

Selector stability: no existing `data-*` attribute changes; the new `data-menu="showcase"` slug, `data-scene`, `data-action="play-scene|record|back-to-scenes"`, `data-order="volley"` are additions.

### 6.3 Screenshot list (`scripts/cinematic-shots.mjs`, 1920 × 1080, software GL, Record mode so frames are deterministic)

| # | file | source and time | what must be visible |
| --- | --- | --- | --- |
| 01 | `fb-volley-wide.png` | Final Battle, canon, pace 1, `t = 38.6`, director cue D1 (debug hook `view.director.force('D1')`) | the whole line firing side-on; tracer wall crossing the gap |
| 02 | `fb-impact-wall.png` | same, `t = 39.8`, cue W4 | hex ripples and near-miss flares across the Reaper line |
| 03 | `sc-hades-closeup.png` | scene 1, `t = 73.6`, S17 (Reaper POV) | the white flash, ring shock and venting on R1's hood beside the camera |
| 04 | `sc-oculus-swarm.png` | scene 1, `t = 17.5`, S04 | Oculi streaming from the Reaper line, red lenses |
| 05 | `sc-cerberus-arrival.png` | scene 1, `t = 19.8`, S05 | the Black Fleet braking into the gap, orange markings beside a turian hull, arrival streaks |
| 06 | `model-<classId>-{bow,profile,quarter}.png` | hidden gallery scenario (one hull per class, paused), framings `{ az 180, el 0 }`, `{ az 90, el 0 }`, `{ az 135, el 20 }` | D12 frozen screenshot set, every class |
| 07 | `fx-dreadnought-under-fire.png` | custom canon battle, 1 dreadnought vs 2 destroyers, `t ≈ 12`, follow cam | hull-shaped shimmer with a ripple at the hit (§8.3 check) |
| 08 | `scale-sovereign-vs-kilimanjaro.png` | gallery: `reaper_capital` beside `alliance_dreadnought_k`, profile, equal distance | 2 : 1 length, Reaper far bulkier (§8.8 check) |
| 09 | `platform-slew.png` | Apex Final Battle, `t ≈ 30`, follow P1 | platform rotated to bear on the Reaper line, both channels firing |
| 10 | `super-dreadnought-profile.png` | gallery: `alliance_super_dreadnought` | two spinal channels, AU badge in the caption |
| 11 | `sc-drive-attack-flash.png` | scene 1, `t = 94.6`, S20 | one abrupt flash, fragments along the vector, neighbours still firing |
| 12 | `sc-harbinger-mission-kill.png` | scene 1, `t = 114.0`, S25 | dimmed aperture, flickering lights, active Reapers behind |
| 13 | `sc-letterbox-caption.png` | scene 1, `t = 6.5`, S02 | 2.39 : 1 bars, the `38,420 … · AU SCENARIO VALUE` caption, the AU tag |
| 14 | `sc-record-counter.png` | scene 1 in Record mode, any frame | `.rec-counter`, no cursor |
| 15 | `fb-distant-layer.png` | Apex Final Battle, `t = 60`, cue D2 | drive-light echelons and far sparks beyond the fleets, the distant caption |
| 16 | `fx-thanix-stream.png` | scene 1, `t = 57.5`, S16 | three heavy Thanix channels with drip, converging on R3 |
| 17 | `fx-reaper-beam-split.png` | Battle of Earth canon, first `ship_destroyed` with `cause reaper_beam`, cue P2 + 1 s | a cruiser in two halves along the beam line |
| 18 | `fx-capital-death-stage2.png` | scene 1, `t ≈ 60.4`, S16 | hull breaking, core flash, screen white fading |

### 6.4 Existing assertions that change, and why

- `tests/battle.test.ts` "player orders change behaviour: retreat ends the battle by withdrawal" → brief §8.6 removes leaving the battlespace. It becomes "disengage pulls the fleet behind its line, barriers recover, nobody escapes" (asserts `escaped` false for all non-fighters and barrier regeneration on the withdrawn hulls).
- `tests/battle.test.ts` determinism and Battle-of-Earth tests are unaffected (the cinematic opening is a Final Battle option; the Battle of Earth gets the distant layer, which is isolated by construction).
- Every balance assertion listed in `BALANCE_AUDIT.md` §8 must be re-run after §7.1, §7.6 and §7.7 land, because movement, withdrawal and hit probability all move outcomes; those re-runs are part of each of those PRs, not of this document.

## 7. Combat feel, scale and new hull types (brief §8, feedback round 2)

Each item: the observed problem, the mechanism, the data and file changes, the check. Everything in the simulation stays a pure function of state plus `sim.rng`.

### 7.1 Fleet movement: lines, not wheels (brief §8.1)

**Diagnosis (code).** `fleetDecision` (`ai.ts:200–214`) re-aims `fleet.heading` at the enemy centroid **every step** at `0.25 rad/s` (14°/s) with no deadband; `slotToWorld` swings every slot around the anchor as a rigid body, so a 10 km line's wingtips sweep at `0.25 × 10 ≈ 2.5 km/s`, ten times a dreadnought's speed. Two fleets each aiming at the other's centroid orbit each other. On top: fighters fly a literal orbit (`movementGoal`: `phase = time × 0.6`, `ai.ts:276–283`), frigates "harass" toward the target and back to the slot (`ai.ts:305–317`), and the arrive controller (`battle.ts:401–410`) hunts the slot when the slot itself is moving.

**Mechanism** (`src/simulation/movement.ts`, used by `ai.ts` and `battle.ts`):

1. *Approach bearing and heading lock.* `FleetState` gains `approachBearing: Vec3` (set when an order is issued or the lock releases) and `headingLocked: boolean`. The anchor advances **along `approachBearing`**, not toward the live centroid. Heading re-aims only when the bearing error exceeds 10° (deadband), at most `0.05 rad/s` (≈ 3°/s), and locks (`headingLocked = true`) once the enemy centroid is within `engagementRange × 1.1`; it unlocks only if the centroid stays beyond `1.4 × range` or more than 60° off the bow for 8 s. Inside engagement range the line therefore holds its facing while targets move across it, which is what the brief means by "hold a line".
2. *Deceleration into range.* `anchorSpeed` scales with `clamp((dist − want) / (0.2 × dist₀), 0.15, 1)` over the last 20 % of the closing distance, so fleets slow into the standoff instead of stopping dead.
3. *Doctrine facing.* `doctrineFacing: 'bow' | 'broadside'` per fleet: `bow` for everything today (every spinal gun needs it); a `broadside_line` formation (§7.2) rotates the locked heading 90° to the bearing once in range, for broadside-heavy custom fleets. Reapers are always `bow`.
4. *Damped station keeping.* The arrive controller becomes a critically damped PD controller on the slot: `desiredVel = slotVel + clamp(err × kp − relVel × kd, maxSpeed)`, `kp = 0.5/s`, `kd = 2√kp`, where `slotVel` is the anchor's velocity (ships stop lagging then surging) and `relVel = vel − slotVel`. Facing: `goal.face` only when the target lies within `arc + 15°` of the current heading or the ship has a spinal gun with a solution building (§7.7); otherwise the fleet heading. No ship-level term can produce a circle.
5. *Frigates: straight runs and turn-ins.* A per-ship state machine (`ship.manoeuvre`): `approach` (to a run line parallel to the enemy line, offset 8–12 km, seeded) → `run` (straight, `speedFraction 1`, 12–20 s, torpedoes fire when in arc) → `turnIn` (toward the target until 0.75 × torpedo range) → `extend` (6 s straight away) → `approach`. No orbit term anywhere.
6. *Fighters: strafing passes.* `approach` (from the stand-off, 0.9 × the range of the weapon that can engage the current target — the balance audit's rule) → `pass` (through the target, firing in arc) → `extend` (3 s) → `turn` (new approach vector offset 40–70°, seeded) → `approach`; Oculi use the same machine. Fighters avoid other hulls' PD envelopes by adding a repulsion term from enemy hulls that are not the target (radius = their PD range × 1.1).
7. *Reapers: loose 3D cluster.* Each Reaper gets a fixed 3D offset at deployment (§7.2 `swarm_descent`); the cluster advances along its bearing; the Reaper anchor never re-aims faster than `0.03 rad/s`; no spiral.

**Check** (`tests/movement.test.ts`, §6.1): heading rate ≤ 0.06 rad/s; mean angular rate of each fleet about its anchor `(Σ (r × v)·ŷ) / (Σ |r|²) < 0.02 rad/s` over 10 s windows after first contact; no non-fighter path turns > 360° in one direction. Recorded footage: the `W2` and `D1` cues show lines.

### 7.2 Three-dimensional formations and higher counts (brief §8.2)

**Formations** (`formations.ts`; `FormationType` gains `layered_line | stacked_wedge | box | swarm_descent | broadside_line | static`; `FORMATION_LABELS` extended, so the HUD's first `<select>` just grows):

- `layered_line`: capitals on the centre line (`x = spread(i) × capSpacing, y = 0, z = 0`); cruisers in three layers (`y ∈ {+2.4, −2.4, 0}` km by `i % 3`, the `y = 0` layer pushed to the flanks beyond the capital extent) at `z = 3`; frigates on a dome ahead: `a = (i / (n − 1) − 0.5) × 150°`, `b = ((i % 5) − 2) × 18°`, position `(R sin a cos b, R sin b, 8 + R (1 − cos a))`, `R = 10`; carriers and liveships behind and above (`y = +3.5, z = −7`); fighters as `line_abreast`.
- `stacked_wedge`: `strike_wedge` slots with `y += {0, +2.8, −2.8}` by `i % 3`.
- `box`: capitals on a centred grid (`cols = ceil(√n)`), cruisers on the ±x faces, frigates on the ±y faces, half-size 6 km.
- `swarm_descent` (Reapers): capitals in a short descending column (`y = 4 − 2.5 i`, `x = spread(i) × 0.6 capSpacing`, `z = −2 i`), destroyers on a golden-angle shell 9–12 km from the core, centred 2 km ahead (`θ = 137.5° × i`, `y = (2 i / (n − 1) − 1) × 0.8`, `r = √(1 − y²)`), Oculi as fighters. The Final Battle and scene 1 use it for the Reaper line.
- `broadside_line`: `line_abreast` rotated for §7.1's doctrine facing. `static`: slots = spawn positions (platforms, §7.10).

All slots pass through the existing `× k` compression and a spacing guard (`no two slots closer than max(lengthKm) × 1.7`).

**Counts: 70 → 150 (target 200) per side.** Costs today are O(n²) in four places; the fix is one spatial structure plus staggering:

- `src/simulation/spatial.ts`: `SpatialGrid` (uniform hash, cell 4 km compressed, `Map<number, ShipState[]>`), rebuilt once per tick in `step()` (O(n)); `queryRadius(p, r)`, `querySegment(a, b, pad)` (3D DDA over the cells the segment crosses, expanded by `pad = maxRadiusKm`), `nearest(p, side)` (expanding rings). Candidate lists are sorted by `(distance, id)` before use so results are deterministic regardless of insertion order.
- `updateProjectiles`: `querySegment` per projectile instead of all ships (typical candidates ≤ 10). `tryFire` point defence: `queryRadius(range)`. `chooseTarget`: `queryRadius(sensor × 1.5)` capped at the 24 nearest candidates. `checkEscapes`/§7.6 withdrawal: `nearest`. Enemy centroids: computed once per tick per side and cached (`sideCentroid`), not per fleet per step.
- Staggering: `fleetDecision`'s expensive part (centroid, engagement range, focus) runs on a 0.25 s timer per fleet; anchor integration stays per step. `shipDecision` is already staggered.
- Campaign cap `MAX_SHIPS_PER_SIDE` (`campaign/engine.ts:23`) 70 → 150 once the perf test passes at 200.
- Renderer: `ReducedInstancer` — at LOD `reduced`, hulls are drawn as per-class `InstancedMesh` pairs (`hull`, `hullDark`; damage tint through `instanceColor`) instead of per-ship groups: 2 draw calls per class present rather than 2 per ship (Final Battle: ≈ 590 → ≈ 100 ship draw calls). `full` keeps the per-ship group; `point` the far cloud. Small craft are already instanced/pointed.

**Check**: `tests/perf.test.ts` (200 vs 60, 400 steps < 3 s on CI; brute-force equivalence of `querySegment`); `npm run perf` reports ≥ 20 steps per 16.7 ms frame headless on the dev machine (target; to be measured, not assumed); the e2e Battle of Earth completes.

### 7.3 Kinetic barriers that envelop the hull (brief §8.3)

Specified in §4.2 (hull-shaped shell from the template geometry, 1.06–1.1, fresnel, hex ripple from the impact point, visible only on hit and collapse). Check: screenshot 07.

### 7.4 Sound: mass accelerators and the seismic AU rounds (brief §8.4)

All voices stay procedural (`src/audio/voices.ts`, called from `AudioEngine.play`). New or changed `SoundId`s and their recipes (`att` = the existing distance attenuation):

| id | recipe | trigger |
| --- | --- | --- |
| `ma_fire` (replaces `ma_large`) | electromagnetic crack: 40 ms white noise through a 2.5 kHz high-pass with a 6 dB resonant peak, then a 60 Hz sine thump 180 ms with a 20 ms attack | `weapon_fired` mass_accelerator, damage ≥ 300 |
| `ma_travel` | near pass whine: sawtooth 900 → 380 Hz over 0.35 s (Doppler), band-pass 1.2 kHz, gain by closest-approach distance | render-side: a projectile passes within 25 units of the camera (`BattleView` emits `projectile_pass` to the audio layer) |
| `impact_hull` (reworked) | metallic bang: 60 ms noise burst into two parallel resonant band-passes (320 Hz, 760 Hz, Q 8) decaying 0.4 s, plus 6–10 granular clicks (3 ms noise bursts) spread over 0.5 s for debris crackle | `projectile_impact` with `hullDamage > barrierDamage` |
| `impact_barrier` (reworked) | crystalline zap: FM pair (carrier 3.4 kHz, modulator 210 Hz, index decaying 4 → 0 in 120 ms), 150 ms, slight pitch fall | `projectile_impact` with `barrierDamage ≥ hullDamage` |
| `reaper_beam` (reworked) | deep rising drone: sawtooth 38 → 66 Hz over the burst plus a sub sine an octave below, low-passed noise bed, 2.4–2.8 s | `weapon_fired` reaper_beam |
| `thanix` (reworked) | molten roar: noise band-pass 180 → 1,800 Hz swept by a 0.7 Hz LFO, 1.6 s, with a 95 Hz sine under it | `weapon_fired` thanix |
| `seismic_au` | **the AU signature**: a sharp crack (as `ma_fire`'s first 40 ms, +4 dB), then 0.35 s of near-silence during which the sfx bus is ducked by −18 dB (a `GainNode` ramp), then the delayed bass "bwaaam": 35 Hz sine + 70 Hz detuned sine (+6 cents), 2.5 s attack-decay envelope with a 4 s low-passed tail of pink noise at 120 Hz, −3 dB peak | `weapon_fired` for `apex_hyper_ma`, `nova_array`, `nova_legacy`, `platform_gun_heavy` when `audio.seismicAu` is on; otherwise `ma_fire` |
| `hades_internal` | muffled secondary: 120 Hz low-passed thump, 0.6 s, 0.6 s after the impact | `hades_detonation` |
| `drive_flare`, `drive_impact` | rising filtered noise over the run; one short full-band crack at impact | `drive_run_started`, `drive_run_impact` |
| `arrival_flash` | brief descending sweep 1.8 kHz → 200 Hz, 0.3 s | `ship_arrival_flash` |

Distance and timing: the existing `att = 1 / (1 + distance / 25) × intensity` stays. **Light before sound**: a stylised delay `scheduleDelay(distanceKm) = clamp(distanceKm / 3.0, 0, 1.2)` s (a cinematic convention; vacuum carries no sound) applied through `AudioContext` scheduling (`start(now + delay)`), on by default and switchable (`audio.lightBeforeSound`). In Record mode the delay is computed from render time so it reproduces. Settings screen: `Seismic AU rounds: on/off` and `Light-before-sound delay: on/off` under the audio sliders; `AudioSettings` gains `seismicAu: boolean` and `lightBeforeSound: boolean` with defaults merged in `App.init`. Budget: the existing 10-voices-per-100 ms budget stays; `seismic_au` counts triple so a Titan volley does not stack twelve booms (the first three play, the rest are dropped).

**Check**: `tests/audio.test.ts` (pure timelines, §6.1); a Record-mode capture of scene 1's `black_volley` (Black Fleet Titan guns) carries the crack–gap–boom signature.

### 7.5 HADES nuclear effect (brief §8.5)

Specified in §4.6 and sounded in §7.4. Text rule: "penetrator with a nuclear warhead" everywhere (codex, HUD, captions, this document); the "nuclear … rounds" wording the brief forbids is never used, and a docs grep in `tests/showcase.test.ts` enforces it for caption strings.

### 7.6 Nobody sits still, nobody runs (brief §8.6)

- **Tactical withdrawal replaces escape.** `ship.withdrawing` now means: movement goal = a recovery station `anchor − heading × (0.6 × standoff) + lateral offset (seeded ±3 km)`; while there, barrier regeneration ×1.5 once out of contact for 5 s; weapons keep firing at anything in arc; re-engage (`withdrawing = false`, slot resumed) when `barriers ≥ 0.7 × max` and ≥ 20 s have passed, or when the recovery station itself is threatened (an enemy within 0.5 × standoff). `ship.escaped` is set **only** by carrier recovery of fighters. `checkEscapes` is deleted; `checkEnd` no longer issues fleet-wide `retreat` at 12 %. A side that falls below 5 % of its starting points with no capital left ends the battle by "combat-ineffective" judgement (so the mop-up does not run for minutes); the attrition and time-limit rules are unchanged.
- **Orders.** `withdraw` becomes the fleet-wide version of the same behaviour (every ship falls back, regenerates, returns). `retreat` is renamed `Disengage` in the HUD (same `data-order="retreat"` value, so nothing breaks) and means "fall back to 1.5 × standoff and hold there, firing at anything that follows"; it never ends the battle by itself (§6.4).
- **Reapers never idle.** `movementGoal` for Reaper hulls with no target in range → advance toward the nearest enemy group at `speedFraction 0.6`; Reapers never take `withdrawing` under canon; under `reaperDoctrine: 'apex'` D10's "withdraw a threatened group" becomes a tactical withdrawal to the Reaper recovery station (they come back), not an exit.
- **Carriers and liveships** keep `≥ 0.8 × enemy main range` but manoeuvre: a deterministic lateral weave (`±2 km`, 40 s period, phase from the ship id) and their broadsides/GARDIAN keep firing. **Platforms** slew (§7.10). **Every unit with a weapon in range** fires or moves to get a solution: `movementGoal`'s default branch adds "if my best weapon has a target in range but out of arc, turn toward it; if in arc but out of range and the fleet order is attack, close at `speedFraction 0.5` within the slot leash (2 km)".

**Check** (`tests/withdrawal.test.ts`): idle fraction < 10 %; `escaped` only on fighters; recovered barriers before re-engagement.

### 7.7 Misses and firing solutions (brief §8.7)

`src/simulation/solutions.ts`; `ShipState.solutions: { targetId: string; q: number; since: number }[]` (at most two: the current and the fleet focus target), updated every step for the current target only (cheap), decayed for the other.

```
build/s  = 0.08 × (0.5 + 0.5·sensors) × (0.75 + 0.3·crewQuality) × (1 − 0.5·(dist/range)²) × (1 − 0.6·target.ecm) × (1 − 0.5·accelFrac)
accelFrac = |target.vel − target.prevVel| / dt / target.acceleration        (hard manoeuvre → ≈ 1)
q(t+dt)  = clamp(q + build·dt, 0, 1);  not the current target: q −= 0.15·dt
shooter's own barrier takes a hit > 300 (flare, sensor blinding): q −= 0.25 once per 2 s
target hard manoeuvre (accelFrac > 0.7 for > 0.5 s): q −= 0.2 once per manoeuvre
q₀ = 0.10, +0.15 if another ship of the fleet already holds q > 0.6 on the same target ("target solution shared")
p_hit    = hitProbability(…) × (0.25 + 0.75·q)
```

With today's `p ≈ 0.75` at opening range: `0.75 × (0.25 + 0.075) ≈ 0.24` (< 25 %); after 20 s on an unmanoeuvring target `q → 1` and `p → 0.75` (> 60 %). Spinal guns need a bow solution: in arc **and** the predicted intercept (`interceptPoint`) in arc; broadsides fire whenever in arc with `accuracy × 0.85` and need only `q ≥ 0.05`. Misses: offset magnitude becomes `radius × (1.2 + (1 − q) × 4 × rng)` (today `1.6 + 3 × rng`), so early salvoes miss wide and mature fire clusters; projectile `ttl` rises from `range × 1.6 / speed + 0.5` to `× 2.2` so long shots stream past and keep flying; near misses (closest approach < 1.6 radii of the intended target, computed in `updateProjectiles` against that one hull) emit `projectile_near_miss { targetId, pos, miss }` for the barrier-edge flare (§4.1). `scoreTarget` adds `+0.3 × q` so fire concentrates once solutions mature. The volley ignores `q` on purpose: the opening volley is spectacle and mostly misses, exactly as the brief describes an opening salvo; `syncArrival` and `forceNextShot` are never used in a playable scenario. HUD: the target panel shows `Solution 62 %`.

**Check** (`tests/solutions.test.ts`): < 25 % early, > 60 % after 20 s, manoeuvre penalty, replay identical.

### 7.8 Reapers: bigger, blacker, more armoured, correct light colour (brief §8.8; `docs/design/SCALE_REFERENCE.md`)

| Item | Today | Target |
| --- | --- | --- |
| Sovereign-class overall render length | 15.4 units (1,540 m) against a 2,000 m simulation hull — the renderer undersells the hull the simulation already collides with | **20 units (2,000 m)**; `buildReaper` computes `lengthUnits` from the template's `Box3` so the number is honest |
| Proportions | body 11 units, arms 0.8 × body | body (hood + spine) 55–60 % of overall (11–12 units), arms ≈ 40 % (8 units), hood the widest point, body width ≤ 14 % of length (`bodyRadiusFactor ≈ 0.09`), spine tapering to a point; six arms over the lower 240° (unchanged) |
| Harbinger | 18.48 units, `lengthM inferred(2400)` | **22 units**, `lengthM inferred(2200)` per the scale notes (open question: changes `radiusKm` 1.2 → 1.1 km) |
| Destroyer | 1.28 units (128 m) vs 160 m simulated | **1.6 units**, four legs dominating the silhouette, stubby spine |
| Kilimanjaro-class | one `alliance_dreadnought` (Everest-class, 888 m) | new class `alliance_dreadnought_k` (Kilimanjaro-class, `lengthM estimate(1000, 'fan size chart; codex gives the class but no length')`, identical combat values to the Everest-class so balance is untouched), `NAMES.alliance_dreadnought_k = ['SSV Kilimanjaro', 'SSV Orizaba']`, long gun housing, stepped dorsal superstructure, sponsons; Sword fleets spawn two as `fixedClasses` and the rest as Everest-class. Fallback if the lead prefers no data change: a render-only named variant chosen by `instantiateShip(classId, name)` — simpler, but then the 888 m collision hull sits under a 1,000 m model |
| Palette (`materials.ts` `reaper`) | hull `0x3c414b` (grey-brown read), red seams | hull `std(0x0e1016, metalness 0.85, roughness 0.32, emissive 0x02030a)`; hullDark `0x07080c`; plates `0x161a22` with a cold dark-blue sheen (`color 0x1a2230`, `envMapIntensity 1.6`) layered on body and arms; seams thin **pale blue** `0x7fb4ff` (emissive 1.2); running lights **deep crimson** `0xd01030` (emissive 2.5); aperture **orange-red** `0xff5a1f` with a `0xffb060` iris (emissive 4.5); no brown anywhere |
| Collision | `radiusKm = lengthKm / 2` | unchanged for Sovereign and destroyer (the simulation already uses 2,000 m and 160 m); Harbinger follows its new length; `BALANCE_AUDIT.md` §7 duels re-run after the change (the hit model uses `signature`, not radius, so only the swept-segment test moves) |

Design sheets (D12): `docs/design/<class>.md` with the three-view description, proportion table (length : beam : height and the part ratios above), signature features, colour and light placement, "must read as" checklist, and the frozen screenshot set from §6.3 #06; `tests/silhouette.test.ts` compares `Box3` ratios of every template against its sheet (5 % tolerance) and asserts Sovereign : Kilimanjaro-class = 2.0 ± 0.1 (2.25 against the Everest-class, which is the brief's "2.2 : 1"). The owner's screenshots are study material only and are never committed.

### 7.9 Super-dreadnoughts (brief §8.9)

`ShipRole` gains `'super_dreadnought'`. Every role switch is extended (found by `grep "'dreadnought'"`): `formations.ts` tier 0; `ai.ts:67–69, 104` priority and protect-capitals; `battle.ts:868` capital comms; `results.ts:6` and `reaperIntel.ts` capital counts; `battleView.ts:311, 391, 493` death duration, director jump, interest pool; `overlay.ts:75` marker size; `app.ts:201` explosion sound; `rules.ts:244` the Titan substitution predicate becomes `(role === 'dreadnought' || role === 'super_dreadnought') && faction ∈ {alliance, cerberus} && id ∉ {destiny_ascension, normandy_valkyrie}` (so the Apex heavy line carries two Titan channels, consistent with D7); `custom.ts` and the campaign production tables list the new classes with the AU badge.

| Class | Role / label | Values (every field `AU_MODIFIED` unless noted) |
| --- | --- | --- |
| `destiny_ascension` | → `super_dreadnought` (canon ship; the role is a simulation classification, `SIMULATION_ESTIMATE` note) | unchanged values |
| `normandy_valkyrie` | `super_dreadnought` (AU LOCK, D8) | as `PACK_ADOPTION.md` §3b |
| `alliance_super_dreadnought` — "Olympus-class heavy dreadnought (AU)" | `super_dreadnought`, names `['SSV Olympus Mons', 'SSV Mauna Kea']` (original) | length 1,800 m; hull 19,000; armour 170; barriers 11,500; regen 95; speed 0.52; accel 0.07; turn 3.2; sensors 120; signature 2.8; ecm 0.25; crew 1.1; heatCapacity 260; hardpoints `alliance_dn_main` ×2 (offsets `[±60, 0, 850]`, arc 12), `alliance_broadside` 8 + 8, `gardian` ×16; pointValue 560 |
| `turian_super_dreadnought` — "Praetor-class heavy dreadnought (AU)" | `super_dreadnought`, names `['PFS Praetor', 'PFS Legate']` (original) | as above with `turian_dn_main` ×2, length 1,900 m, pincer bow, speed 0.5 |

Available only when `special.superDreadnoughts` (new flag, true in both Apex presets) and in custom battles under any AU preset (AU badge); Sword fleets spawn one each under Apex. The Ascension's reclassification touches canon data only as a label and must leave `tests/timelines.test.ts` canon-equals-catalogue assertions true (role is not a tech value).

### 7.10 Fixed orbital defence platforms (brief §8.10)

`ShipRole` gains `'fixed_platform'` (same switch list as §7.9; tier 0 in formations; marker `⌂` in the HUD lists).

- Classes: `sol_defence_platform` as specified in `PACK_ADOPTION.md` §3b but with `role: 'fixed_platform'` (1,200 m station hull around two `platform_gun` channels — dreadnought-grade, arc 60 — heavy barriers, `gardian` ×12, `maxSpeed 0`, `turnRate 2.5°/s`); the **AU super-MAC variant** `sol_platform_heavy` ("Sol heavy platform, super-accelerator (AU)": 1,400 m, one `platform_gun_heavy` — 2,400 damage, 5.0 s, range 56, speed 36, arc 40 — `gardian` ×16, barriers 16,000). Existence as modelled: `SIMULATION_ESTIMATE`; the super-MAC: `AU_MODIFIED`, Apex presets only.
- Simulation: `updateMovement` returns early for `maxSpeed === 0` except the heading slew toward the current target (bounded by `turnRate`), so a platform "slews to bear"; `fleetDecision` skips anchor movement when every ship of the fleet is a platform (`fleet.static`); `issueOrders` rejects `advance | attack | attack_target(move) | withdraw | retreat | escort | intercept | defend_position` for static fleets with `order_rejected { fleetId, order }` → HUD toast `PLATFORMS CANNOT MANOEUVRE` (`attack_target` still sets the focus target); formation `static`.
- Placement: scenario builders put platforms on an arc 8–14 km (compressed) ahead of the defending line at fixed `y` offsets ±2 km; campaign homeworld battles (Earth, Palaven, Thessia, Rannoch, Sur'Kesh) spawn `round(defenceIndex × 6)` platforms (`SIMULATION_ESTIMATE`); the Final Battle simulates 2 under canon (DN-grade only) and 4 under Apex (two of them heavy), with the AU caption `612 DEFENCE PLATFORMS — SOL NETWORK · AU SCENARIO VALUE · 4 SIMULATED`; custom battles list both classes under Alliance (heavy with the AU badge).
- Reaper behaviour: "a Reaper assault on Earth engages the platforms first": `scoreTarget` ×2.5 for Reaper shooters against `fixed_platform` targets within 1.3 × range while the fleet order is `attack`/`advance` (doctrine: clear the orbital network), under every preset.
- Showcase: scene 1 shot S12 (§3.4) frames P1's channels in the foreground.

**Check** (`tests/platforms.test.ts`): immobile, slews ≤ turnRate, orders rejected, Reaper preference; screenshot 09.

## 8. Limitations and honesty notes

- **Two sides only.** A hostile Cerberus strike group in the Final Battle fights beside the Reapers and is not shot at by them; it hunts Alliance capitals through `priority: 'capitals'`, but "hostile to both" is not modelled. The HUD labels it `CERBERUS (HOSTILE)` and the briefing says so (§1.4).
- **Scenes force events.** Scene 1 forces 15 outcomes (ledger in §3.4); every one is logged as `scripted_event`, counted and printed on the summary. Playable scenarios force nothing: the Final Battle's "first loss by 70 s" is an expected outcome asserted by a test, not a script.
- **No character models.** Montage card 23 is carried by the Normandy SR-2 and a rack to the next contact. There is no Shepard, Hackett or Illusive Man; the pack's AU lines appear as captions tagged `· AU`.
- **Approximations in the effects.** The HADES "shadow pulse" is a light pulse plus a momentary drop of image-based lighting, not real shadow casting; the "ring shock distortion" is a double ring, not a refraction pass; Reaper limbs do not articulate (the mission kill is shown by lights and the dead aperture); the beam "slit" sweeps across the hull as an ornament because the simulation's contact point is the target centre.
- **Record mode is not a recorder.** It makes frames deterministic for an external screen capture (and reproduces the audio schedule); it does not encode video in the browser. On a 120 Hz display the scene plays at double speed while recording; a 60 fps capture is unaffected.
- **The distant layer is statistics.** Its counts are AU values under Apex (`APEX_SCALE`, labelled `· AU SCENARIO VALUE`) and relative percentages under canon (no canon source gives a hull count). It never changes a result and the results screen says it is statistical.
- **Firing solutions versus the impact wall.** With §7.7 in place the opening volley at 38 s is mostly misses that stream past the Reaper line; the W4 "impact wall" cue shows near-miss flares and the hits that land, not a wall of hits. This is the brief's own §8.7 requirement; `syncArrival`/`forceNextShot` are reserved for scenes.
- **Numbers that still have to be measured.** The 200-hull performance target (§7.2) is a design target until `npm run perf` confirms it; the heavy cruiser's survival of one capital beam (§3.4 ledger) depends on the P3 calibration in `BALANCE_AUDIT.md` landing as proposed; every balance assertion must be re-run after §7.1, §7.6 and §7.7.
- **Oculus weapon kind.** `PACK_ADOPTION.md` §3c proposes a gardian-kind laser; `BALANCE_AUDIT.md` §9 measured a 1 s beam. The effect (§4.8) and the scene work with either; the beats assume the audit's 8 / 2 / 12 complements.
- **Sound is a convention.** The light-before-sound delay and every impact sound are cinematic conventions; there is no sound in vacuum, and the settings say so.
- **Fighters are rendered at 2× scale** (existing `KNOWN_ISSUES.md`), which the long-lens shots make visible; the chase shot `F1` frames a single fighter, where the scale reads least.

## 9. Order of work and open questions

### 9.1 Suggested slices (each lands green on its own)

1. **Render pools and determinism** — `BillboardPool`, instanced debris, `farTracers`/`farBeams`, seeded shake and dying, `Rng('fx')` everywhere in the view. No simulation change; the draw-call line in the HUD shows the gain.
2. **Beats, volley, arrival, specials** (§1) with `tests/beats|volley|arrival|determinism`; the Final Battle beat table, `cinematic_arrival` and `cerberus` world states; the HUD `Volley` button, the player lock and `K` to skip. Depends on the Oculus class and the Titan/HADES weapon from `PACK_ADOPTION.md` for `launch_drones` and `hades_strike`.
3. **Shots, rig `'shot'` mode and the director** (§2) replacing `pickCinematicShot`; `tests/shots`.
4. **Showcase** (§3): types, player, chooser, summary, scene 1; `e2e/showcase.spec.ts`. Depends on the Valkyrie, heavy cruiser, Black Fleet dreadnought and platform classes.
5. **Effects looks** (§4.1–§4.10) including the hull-shaped barrier shell; screenshots 01–05, 07, 11–18.
6. **Distant layer** (§5) with `APEX_SCALE`; screenshot 15.
7. **Movement, formations, counts, withdrawal, solutions** (§7.1, §7.2, §7.6, §7.7) — simulation-heavy; each re-runs `BALANCE_AUDIT.md` §7's tables and §8's assertions.
8. **Roles and hulls** (§7.8–§7.10, D12): `super_dreadnought`, `fixed_platform`, the Reaper rescale and palette, the Kilimanjaro-class, design sheets and `tests/silhouette`.
9. **Sound** (§7.4) — independent of everything after slice 2.

### 9.2 Open questions for the lead

1. Oculus weapon: the audit's 1 s `reaper_beam` burst (measured) or the pack's gardian-kind laser; complement 8 / 2 / 12 (measured) or 16 / 4 / 24.
2. Harbinger `lengthM` 2,400 → 2,200 to match the scale notes (affects its collision radius; balance re-run is cheap).
3. Kilimanjaro-class as a data class (`alliance_dreadnought_k`, honest 1,000 m collision hull) or a render-only named variant (no data change, 888 m hull under a 1,000 m model).
4. §7.6 retires the fleet-wide `retreat` escape and the 12 % auto-retreat, which changes one existing test and may change victory reasons in the balance tables; confirm the "combat-ineffective at 5 % with no capital" end rule.
5. Scene 1 adds a forced HADES strike on R1 at 73 s (card 20's "converging impacts" seen from the Reaper's hood); it is D7-consistent and gives the brief's HADES screenshot a home — keep it, or keep the scene strictly to cards 16–23?
6. The Final Battle's `cinematic_arrival` defaults to pace 1.0; should campaign-linked Final Battles (`ws.forces === 'campaign'`) default to `off` so campaign fleets are not re-positioned?
7. Original AU names for the heavy-dreadnought line ("Olympus-class" / "Praetor-class") and the Black Fleet heavy cruisers (`Covenant`, `Sanctum`).
8. In-browser video encoding (`MediaRecorder`) for Record mode: out of scope here; wanted later?
9. Should `Shuffle seed` be exposed in the Showcase given that an unlucky seed can skip a forced beat (the ledger reports it), or should scenes always run on their fixed seed?
