# Cinematic systems design — beats, cameras, Showcase, effects, distant layer

Status: design document, 31 October 2026. Nothing in this file is implemented. It specifies, in implementable detail, the cinematic layer of the V2 brief (`docs/V2_CINEMATIC_BRIEF.md` §2–§4, §6) on top of the code described in `docs/apex/CODE_MAP.md` and the data/mechanics plan in `docs/apex/PACK_ADOPTION.md`. Lead decisions D1–D13 are taken as given; this document refines D4 (beat-scheduled Final Battle, Cerberus world state, Oculi, distant layer), D5 (Showcase mode and scene 1), D10 (the camera and scene side of the Reaper behaviours) and D11 (effects), and leans on the class, weapon and mechanic specifications of `PACK_ADOPTION.md` §3b–§3c (Valkyrie, Black Fleet hulls, Oculus, Titan/HADES, drive attack) without restating their numbers.

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
| `size` | `BuiltShip.lengthUnits` of a camera subject (Kilimanjaro 8.88, Reaper capital 15.4, Harbinger 18.48, Destiny Ascension 16, Valkyrie ≈ 20 after D8). |

Compressed numbers used below (from `src/data/weapons.ts`, `src/data/ships.ts`, `CODE_MAP.md` §8): dreadnought spinal range `42 × S = 16.8 km`, projectile speed `30 × S = 12 km/s` (flight time at 12 km ≈ 1.0 s); cruiser spinal range `36 × S = 14.4 km`, speed `26 × S = 10.4 km/s`; Reaper capital beam range `44 × S = 17.6 km`; Reaper capital speed `0.8 × S = 0.32 km/s`; Alliance dreadnought speed `0.65 × S = 0.26 km/s`; Destiny Ascension `0.55 × S = 0.22 km/s` (the slowest hull in Sword, which sets the fleet anchor speed through `fleetDecision`).

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
| `e2e/showcase.spec.ts`, `scripts/cinematic-shots.mjs` | §6.2–§6.3. |

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

Why the tracers cross together: departures are spread over ≤ 1.5 s and flight times over 10–14 km are 0.9–1.4 s, so the wall of rounds is in the air for about 2.5 s and the Reaper barriers ripple over a similar span. With `syncArrival` the impacts cluster inside the window instead (used for the Showcase impact-wall shot, §3.5 cue S09). Expected yield at the Final Battle volley (14 Alliance + 10 Hierarchy + 8 Republics + 10 quarian + 8 geth spinal mounts plus 6 + 5 + 3 + 1 dreadnought guns at `p ≈ 0.6–0.84`): roughly 40 hits in 1.5 s, several thousand points of barrier damage across the Reaper line. The volley is spectacle and timing, not a damage bonus.

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

Gap at `t = 0`: 22.4 km. From form-up (12 s) the coalition advances at the Ascension's pace (`0.22 × 0.95 ≈ 0.21 km/s`); from 20 s the Reaper line advances at `0.32 km/s`. At 36 s the gap is `22.4 − 0.21 × 24 − 0.32 × 16 ≈ 12.3 km`: inside dreadnought (16.8) and cruiser (14.4) spinal range for the whole line, outside frigate gun range (9.6), inside Reaper beam range (17.6) only since ≈ 30 s — which is why the Reaper `holdFire: 'beams'` costs them nothing material. Under `cinematic_arrival: 'off'` the current geometry (`z = −34 … +46`) and orders stay as they are.

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
| `oculus_launch` | 24.0 | `launch_drones fleets reaper-blockade, burst 8` (needs `reaper_oculus` complements, `PACK_ADOPTION.md` §3b) | Reaper POV, eyes waking in sequence (P1) |
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
