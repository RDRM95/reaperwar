# CODE_MAP — Reaper War Simulator (for the Apex implementation agents)

Snapshot of `main` at commit `01b1fef` (v0.11.0), 29 Oct 2026. `01b1fef` only adds `docs/apex/reference/` on top of `e4abd7e`; no file under `src/`, `tests/` or `e2e/` changed between the two, so every line number below holds for both. Line numbers refer to that state; re-grep the function name if a file has moved on. Everything here was read from the code, not from the docs' claims; where the two disagree the code is reported and the disagreement is noted. Sections 0-7 were written on `e4abd7e` and spot-checked again on `01b1fef` (every sampled line reference in §1-§7 matched); §8, §9 and Appendix A were added on `01b1fef`.

Verified on this snapshot: `npx vitest run` → 9 files, **83 tests passed** (62 s wall, 140 s CPU; exit code 0 with the verbose reporter). One of two runs also printed `Errors 1 error` with a bare `listOnTimeout`/`processTimers` stack after all 83 tests had passed and the next run was clean, so treat a stray unhandled-timer error as a possible flake, not as a failing test. Playwright suite is **8 tests** (5 in `e2e/game.spec.ts`, 3 in `e2e/campaign.spec.ts`). The partial draft of this file (sections 0-7) was committed as `e318d2e` ("Add the V2 code map analysis (in progress)"); the completed version is the working-tree change on top of it, and no source file differs from `01b1fef`.

## 0. Conventions and layout

- TypeScript strict, Vite 7, Three.js 0.186, Vitest 3, Playwright 1.56. Path alias `@/` → `src/` (tsconfig `paths`, `vite.config.ts`, `vitest.config.ts`). `__APP_VERSION__` is injected by Vite from `package.json` (`src/vite-env.d.ts`).
- `src/simulation/**`, `src/data/**`, `src/timelines/**`, `src/scenarios/**`, `src/campaign/**`, `src/core/**` never import Three.js or the DOM: they run headless in Vitest (node env) and in `scripts/headless-battle.ts` (`npm run sim -- <scenario> <preset> <seed> [fixed|rules]`).
- `src/rendering/ships/*` import Three.js geometry only (no canvas/WebGL): builders are Node-safe (`tests/salarian.test.ts` already imports `@/rendering/ships`). `effects.ts`, `environment.ts`, `battleView.ts`, `cameras.ts` need a DOM/WebGL context.
- **Randomness**: the simulation uses only `Rng` (`src/core/rng.ts`, Mulberry32, `next/range/int/chance/pick/gaussian/fork`). `grep Math.random src/` hits only render/UI code: `rendering/battleView.ts:324,325,369,374,493,494,496`, `rendering/cameras.ts:195`, `audio/engine.ts:68`, `core/saves.ts:49`, `ui/screens/results.ts:58`, `ui/screens/campaign.ts:485`, `ui/screens/briefing.ts:11`. Keep it that way: any new sim mechanic draws from `this.rng` (BattleSimulation) in step order.
- **Units**: catalogue values are "nominal km / km·s⁻¹"; the sim multiplies every distance and speed by `BATTLESPACE_SCALE = 0.4` (`src/simulation/constants.ts:9`, imported as `S`). Ship lengths are *not* scaled. Render units: `KM = 10`, `M = 0.01` (`src/rendering/geometry.ts:9-10`), i.e. 1 render unit = 100 m; a 2 km Reaper is 20 units long while a nominal 42 km gun range is 16.8 sim-km = 168 units.
- **Damage unit**: 1 Everest/Kilimanjaro slug = 1000 points (`src/data/weapons.ts:10-13`). The pack's DKE (38.72 kt) maps 1:1000 (lead decision D2).
- Provenance tags: `src/core/provenance.ts` — `Provenance = 'CANON_CONFIRMED' | 'CANON_INFERRED' | 'SIMULATION_ESTIMATE' | 'AU_MODIFIED'` (L7-11), `Sourced<T>` (L13-18), helpers `canon/inferred/estimate` (L20-34), `PROVENANCE_LABEL` (L36-41). No helper exists for `AU_MODIFIED`; `apex_hyper_ma` writes the object literally (`weapons.ts:516-521`). UI badge classes: `provenanceBadge()` in `src/ui/dom.ts:46-50` → `.badge.canon|inferred|estimate|au` (`src/style.css:74-79`, also `.badge.custom`).
- Docs that state project rules: `README.md`, `ARCHITECTURE.md`, `AU_RULES.md`, `LORE_REFERENCE.md` (canon anchors to check the pack against), `KNOWN_ISSUES.md`, `CHANGELOG.md`, `ROADMAP.md`, `docs/V2_CINEMATIC_BRIEF.md` (§2 beat sheet, §3 showcase, §4 effects, §5 roster/design lock-down, §6 acceptance). `docs/apex/reference/` holds the pack (four data/guide files plus its own `README.md`; see Appendix A). `docs/design/` does not exist yet (D12).

Directory map (line counts): `src/simulation/{battle 1008, ai 326, damage 105, formations 147, reaperIntel 107, results 66, types 320, constants 9}`, `src/data/{ships 922, weapons 530, factions 364, types 116}`, `src/timelines/{rules 288, presets 269, schema 194}`, `src/scenarios/{index 656, comparison 143}`, `src/rendering/{battleView 545, effects 443, environment 399, cameras 209, geometry 147, materials 89, lod 33, ships/* 1244}`, `src/ui/{app 681, dom 50, overlay 149, screens/* 2103}`, `src/campaign/{engine 740, depth 286, postwar 218, galaxy 126, state 107}`, `src/codex/entries 316`, `src/core/{storage 171, saves 80, vec3 80, rng 62, provenance 41}`, `src/audio/engine 268`, `src/main 12`.

---

## 1. Simulation loop (`src/simulation/`)

### 1.1 Types (`src/simulation/types.ts`)

| Type | Lines | Fields that matter |
| --- | --- | --- |
| `Side` | 5 | `'A' \| 'B'` (perspective side is always `'A'` in every builder) |
| `FormationType`, `FORMATION_LABELS` | 7-22 | `defensive_screen, line_abreast, strike_wedge, capital_column, fighter_screen, dispersed` |
| `OrderType` | 24-33 | `attack, attack_target, defend_position, hold_formation, advance, withdraw, escort, intercept, retreat` |
| `TargetPriority` | 35 | `default, reaper_destroyers, reaper_capitals, capitals, escorts, fighters` |
| `FleetOrders` | 37-50 | `order, targetId?, position?, formation, focusFire, priority, protectCapitals, fightersDeployed, pointDefenceMissiles` |
| `ShipSpec` | 52-57 | `classId, count, names?` (names assigned in order) |
| `FleetSpec` | 59-77 | `id, name, faction, side, ships[], formation, position (km, nominal), heading, initialOrder?: Partial<FleetOrders>, arrivalTime? (s; 0/undefined = present at start), playerControlled?, techOverride?: Partial<TechModifiers>` |
| `Environment` | 79-87 | `earth_orbit, palaven_orbit, thessia_orbit, rannoch_orbit, surkesh_orbit, citadel, deep_space, relay` |
| `BattleConfig` | 89-105 | `id, name, scenarioId, seed, rules: RuleSet, fleets[], environment, maxDuration, perspectiveSide, objective, worldState?: Record<string,string>` |
| `WeaponState` | 107-130 | `index, hardpointIndex, mount, def: EffectiveWeapon, cooldown, offset (km), facing (rad), beamRemaining, beamTargetId?, beamHit, beamEnd?, beamStart?, ammo? (undefined = unlimited), burstLeft?, burstRecover` |
| `Subsystems` | 132-136 | `engines, weapons, sensors` (0..1, floor 0.1) |
| `ShipStats` | 138-144 | `damageDealt, damageTaken, shotsFired, hits, kills` |
| `ShipState` | 146-205 | position/heading pairs (`pos/prevPos`, `heading/prevHeading` for interpolation), `lengthKm, radiusKm, signature`, pools `hull/maxHull, armour/maxArmour, barriers/maxBarriers, barrierRegen`, kinematics `maxSpeed, acceleration, turnRate (rad/s), sensorRange, ecm, crewQuality`, `heat, heatCapacity, overheated`, `weapons: WeaponState[]`, `subsystems`, `alive, destroyedAt?, targetId?, slot, withdrawing, escaped, lastHitAt, firstShotAt?, rearming?, rearmTimer?, aiTimer, stats, hangar?: {classId, remaining, launchTimer}, carrierId?, pointValue, forcedTargetId?, escortId?` |
| `Projectile` | 207-217 | `id, shooterId, side, weapon, pos, prevPos, vel, ttl, intendedTargetId` |
| `Missile` | 219-231 | `… targetId, hp, ttl, alive` |
| `BeamVisual` | 233-242 | declared only; `battle.ts` never builds it — the view reads beams from `WeaponState.beamStart/beamEnd` |
| `FleetState` | 244-258 | `spec, orders, anchor (sim km), heading, focusTargetId?, decisionTimer, arrived, startPoints, commsCooldown, coordinationPenalty` |
| `BattleEvent` union | 262-282 | see 1.5 |
| `SideSummary` | 284-304 | `side, factions, deployed, destroyed, survivors, capitalDeployed, capitalLost, reaperCapitalLost, reaperDestroyersLost, damageDealt, damageTaken, shotsFired, hits, pointsDeployed, pointsLost, survivalPercent, tacticalEffectiveness, lossesByClass{classId: {deployed, lost, name}}` |
| `BattleResult` | 306-320 | `configId, scenarioId, rulesId, rulesName, seed, duration, winner: Side\|'draw', reason, perspectiveSide, outcome: victory\|defeat\|draw, sides{A,B}, eventCount, objectiveCompleted` |

Note: "capital" everywhere (`results.ts:6`, `battle.ts:868`, `battleView.ts:311,391`) means role `dreadnought | carrier | reaper_capital`. Fighters are excluded from `deployed/destroyed/survivors` and from `sidePoints` (`results.ts:11`, `battle.ts:894`), but included in `lossesByClass` and damage totals.

### 1.2 Construction (`src/simulation/battle.ts`)

- `SIM_DT = 0.05` (L46). `DEFAULT_ORDERS` (L48-56): `attack, line_abreast, focusFire true, priority default, protectCapitals false, fightersDeployed true, pointDefenceMissiles false`. `REARM_SECONDS = 12` (L31).
- `class BattleSimulation implements AiContext` (L63). Public state: `config, rng (new Rng(config.seed) L91), rules (= config.rules), time, tick, ships[], shipById, fleets: Map<fleetId, FleetState>, projectiles[], missiles[], events[], flashes[] (transient point-defence lines {from,to,kind:'gardian'|'reaper_pd',ttl}), finished, result?, onEvent?` (L64-86). Private: `nextId` (projectile/missile ids), `shipCounter` (per-class name counter), `fleetRules` (techOverride cache), `pendingFleets`, `heavyLossesAnnounced`, `engagementAnnounced`.
- Constructor (L88-99): emits `battle_start`; deploys every fleet with `arrivalTime <= 0` immediately, pushes the rest to `pendingFleets` sorted by `arrivalTime` (sorted once here, L97 — a scheduler that pushes later must keep it sorted); `comms('battle_start')`.
- `deployFleet(spec)` (L103-150): builds `FleetState` with `orders = {...DEFAULT_ORDERS, formation: spec.formation, ...spec.initialOrder}` and scales `initialOrder.position` by `S` (L106); `anchor = spec.position * S` (L107); heading flattened to the XZ plane (L108). Creates ships via `createShip` for each `ShipSpec` (L117-123), sets `startPoints` (L124), assigns formation slots with `assignSlots` (L126-129) and places ships at `slotWorld(fleet, slot)` (L130-136), emits `ship_deployed` per ship (L139-147) and `reinforcement_arrival` when `time > 0` (L149).
- `rulesFor(spec)` (L159-168): when `spec.techOverride` exists, clones the RuleSet once per fleet id and merges the override into `factionOverrides[spec.faction]`. This is how Rannoch's Reaper-upgraded geth and campaign research/readiness reach `applyRules*`.
- `createShip(classId, spec, name?, carrierId?)` (L170-250): `getShipClass` → `applyRulesToShip(cls, rules)` (L173); id `${spec.id}-${classId}-${n}` with a per-class counter (L174-176; the Citadel scenario relies on this: escort target `'republics-guard-destiny_ascension-1'`, `scenarios/index.ts:435`); one `WeaponState` per mount per hardpoint (L179-200) with `def = applyRulesToWeapon(...)` then `range *= S`, `projectileSpeed *= S` (L181-182), initial cooldown staggered `def.cooldown * rng.next() * 0.6` (L190), `offset` metres→km (L191), `ammo: def.magazine`, `burstLeft: def.burst?.shots` (L195-196). ShipState: `radiusKm = max(0.02, lengthKm/2)` (L216), `maxSpeed/acceleration/sensorRange *= S` (L225-228), `turnRate` deg→rad (L227), `heatCapacity` from rules (L232), `aiTimer = rng.next()*1.5` (L241), `pointValue = cls.pointValue` (L243). `hangar` created from `cls.fighterComplement` with `launchTimer: 2` (L246-248). Fighters get `carrierId` (L244).

### 1.3 Orders

- `issueOrders(fleetId, patch: Partial<FleetOrders>)` (L283-309): merges patch (scaling `patch.position` by `S`, L287); formation change → `reassignSlots` (L288, L324-331); `attack_target` sets `fleet.focusTargetId` and `forcedTargetId` on every live non-fighter of the fleet (L289-291); any other order clears `forcedTargetId` (L292-293); `escort` sets `escortId` on frigates/cruisers (L295-296), other orders clear it; comms for withdraw/retreat/focus/fighters (L300-304); emits `order_issued` with a `k=v, …` label (L305-308). Used by the HUD (`BattleController.order`, `app.ts:128-135`), the e2e/unit tests, and `FleetSpec.initialOrder` goes through `deployFleet` instead.
- `orderShipsAttack(shipIds, targetId)` (L312-322): sets `forcedTargetId` and `targetId` on each ship (right-click attack with a selection; `app.ts:138-148`).
- AI consumes orders in `ai.ts`: `fleetDecision` (anchor movement per `order`, L172-212), `scoreTarget` (`focusTargetId`, `priority`, `protectCapitals`, L96-105), `movementGoal` (`fightersDeployed`, `retreat`, `escortId`, L266-295), `updateWeapons` (`retreat` suppresses forward-arc guns, `battle.ts:558`), `tryFire` (`pointDefenceMissiles`, L581).

### 1.4 Per-step order (`step()`, L336-380)

1. `time += SIM_DT; tick++` (L339-340).
2. Reinforcements: `while pendingFleets[0].arrivalTime <= time → deployFleet` + `battle_start` comms for that fleet (L343-347).
3. Per fleet: `commsCooldown -= dt`, `coordinationPenalty -= dt/30`, `fleetDecision(this, fleet, dt)` (L349-353; `ai.ts:136-242`).
4. Per live, non-escaped ship (L355-371): snapshot `prevPos/prevHeading`; `aiTimer -= dt`, on expiry `shipDecision` and reset to `doctrine.decisionInterval * (0.7 + 0.6*rng)` (L360-366, emits `ship_withdrawing` on transition); `updateMovement` (L392-440); `updateHousekeeping` (L442-451); `updateCarrier` (L453-499); `updateWeapons` (L520-561).
5. `updateProjectiles(dt)` (L779-807), `updateMissiles(dt)` (L809-840), flash TTLs (L375-376).
6. `checkEscapes()` (L898-918), `checkEnd()` (L920-951).
- `run(maxSteps = 200_000)` (L383-388) steps to `finished`, else ends `draw` "Simulation step limit reached".

Details:
- Movement (L392-440): `engineFactor = 0.25 + 0.75*subsystems.engines`; arrive radius `fighter 0.5 km else max(0.6, 1.5*length)`; acceleration-limited velocity change; heading from `goal.face`, else velocity when > 15 % max speed, else fleet heading (fighters excepted); Rodrigues rotation limited by `turnRate*(0.3+0.7*engines)*dt`.
- Housekeeping (L442-451): barriers regenerate `barrierRegen*dt` only when `time - lastHitAt > 3` s (so a ship under continuous fire never regenerates — relevant to D3); heat decays `8 %` of capacity per second; `overheated` set above capacity, cleared below 55 %.
- Carrier (L453-499): while `fightersDeployed && hangar.remaining > 0`, launches `min(2, remaining)` fighters every 0.4 s via `createShip(h.classId, fleet.spec, undefined, ship.id)` (L462), offsets them beside the carrier, random slot behind the fleet (L469), emits `fighters_launched` when `remaining % 8 === 0` or empty (L475). Recall: when `!fightersDeployed`, fighters within `lengthKm` of the carrier are set `escaped = true` and `remaining++` (L479-487; they are counted as recovered, not lost). Rearm: a `rearming` fighter within `1.5*lengthKm` counts down `rearmTimer` from 12 s, refills every `magazine` weapon, emits `fighter_rearmed` (L488-498).
- Weapons (L520-561): `wpnFactor = 0.4 + 0.6*subsystems.weapons`. Active beams tick damage `def.damage*dt` through `applyDamage` each step (L524-547; the beam start follows the hardpoint, the end snaps to the target). Cooldowns count down at `dt*wpnFactor` (L548). Burst weapons with `burstLeft <= 0` wait `burstRecover` then refill (L550-554). Fire gates (L555-558): cooldown, `ammo <= 0`, `overheated && heat > 0`, `retreat` order for forward-arc (`arc < 180`) non-fighter mounts. Then `tryFire`.
- `tryFire(ship, fleet, w)` (L567-755): **anti-small mounts** (L573-608): GARDIAN picks the nearest enemy missile in range (threat weighting: 0.5 if aimed at this ship, 0.6 if `pointDefenceMissiles`), else the nearest enemy fighter in arc, else (GARDIAN only) the nearest hull in range ("scorch"). **Other mounts** (L610-629): the ship's `targetId` if alive, in range and in arc; else a target of opportunity scored `(antiCapital ? log2(1+pointValue) : 1) * (1 - d/range) + (1 - hull/maxHull)*0.5`; spinal guns (`antiCapital && arc <= 20`) decline the opportunity shot 60 % of the time while their primary lives (L627). **Firing** (L632-657): `cooldown = def.cooldown*(0.95+0.1*rng)`, `heat += def.heat`, `shotsFired++`, burst decrement + `burstRecover = recovery` when spent, ammo decrement + `ammunition_depleted` when no mount of the same weapon id has rounds left (fighters then set `rearming`), first shot → `engage` comms once per fleet, `weapon_fired` event, `coordination = 1 - coordinationPenalty*0.5`. Missile interception resolves instantly (`p = min(0.95, accuracy*(0.5+0.5*sensors)*coordination)`, L659-671). For ships, `p = hitProbability(...)*coordination` (L676) then by `def.kind`: `mass_accelerator` → `Projectile` aimed with `interceptPoint` (`core/vec3.ts:57-80`), misses get a deliberate offset `radius*(1.6+3*rng)+0.05` (L683-693), `ttl = 1.6*range/speed + 0.5`; `thanix`/`reaper_beam` → beam burst `beamRemaining = beamDuration ?? 1.5`, hit decided once up front, miss endpoint drawn past the target (L710-727); `gardian` → instant `applyHit` with a flash (L729-735); `disruptor_torpedo`/`missile` → `Missile` with `hp = missileHp ?? 10`, `ttl = 2.5*range/speed + 4` (L736-753).
- `applyHit(shooter, target, weapon, damage, pos)` (L757-775): `applyDamage`, stats, `projectile_impact {damage, damageType, barrierDamage, hullDamage, pos}`, `barriers_down`, `subsystem_disabled`, `destroyShip`.
- Projectiles (L779-807): swept `segmentSphere(prevPos, pos, ship.pos, radius)` against every live enemy (fighters only for `antiSmall` weapons, radius ×2.5); earliest contact wins; hits ignore the intended target (friendly screens can eat rounds).
- Missiles (L809-840): die when target dead/escaped or `ttl` out; home by blending velocity toward the target (`turn = min(1, 2.5*dt)`); on reaching `radius + speed*dt`, hit with `min(0.97, accuracy*(1-0.4*ecm))`.
- `destroyShip(ship, killer?)` (L844-888): `kills++`, beams cleared, `ship_destroyed {killerId, classId, faction, side, name, pos, role}`, comms (capital losses always, others 35 %), **Reaper command vulnerability** (`rules.special.reaperCommandVulnerability`): every Reaper fleet gains `coordinationPenalty = min(1, +0.6)` when a `reaper_capital` dies (L879-881), `heavy_losses` comms once below 50 % of starting points (L883-887).
- `sidePoints(side)` (L890-896): start = Σ fleet.startPoints; remaining = Σ pointValue of live, present, non-fighter ships.
- `checkEscapes` (L898-918): withdrawing ships escape when the nearest enemy is > `110*S` km away (or > `80*S` under `retreat`); under `retreat` every ship of the fleet escapes at > `80*S`.
- `checkEnd` (L920-951): mutual annihilation → draw; one side without live non-fighter ships → the other wins (`"… fleet destroyed"` if points 0 else `"… withdrew from the battlespace"`); fleet-wide `retreat` is forced (`fleet_withdraw` + `defeat` comms) when a side with any faction `withdrawThreshold > 0` drops below 12 % of starting points after 20 s (Reapers never, `factions.ts:336`); at `maxDuration` the attrition judgement compares remaining fractions, draw inside an 8 % band.
- `end(winner, reason)` (L953-963): `battle_end`, victory/defeat comms, `objective_completed` for the winner, `result = summarise(this)`.
- `comms(side?, kind, shipName?, fleet?)` (L967-980): one line per faction per side from `FACTIONS[f].comms[kind]` picked with `rng.pick`, 4-8 s cooldown except battle_start/victory/defeat. `emit` (L982-985) pushes to `events` and calls `onEvent`.
- `segmentSphere(a, b, c, r)` (L992-1008) exported.

### 1.5 Event union (`types.ts:262-282`)

`battle_start{name}`, `ship_deployed{shipId,classId,faction,side,name}`, `fleet_arrived{fleetId}` (declared, never emitted), `weapon_fired{shipId,weaponId,targetId,weaponIndex,kind}` (targetId may be `missile-<id>`), `projectile_impact{shipId,targetId,damage,damageType,barrierDamage,hullDamage,pos}`, `barrier_damaged{shipId,remaining}` (declared, never emitted), `barriers_down{shipId}`, `subsystem_disabled{shipId,subsystem,level}`, `ship_destroyed{shipId,killerId?,classId,faction,side,name,pos,role}`, `missile_intercepted{missileId,interceptorId,pos}`, `fighters_launched{carrierId,count}`, `ammunition_depleted{shipId,weaponId}`, `fighter_rearmed{shipId,carrierId}`, `fleet_withdraw{fleetId,side}`, `ship_withdrawing{shipId}`, `reinforcement_arrival{fleetId,side}`, `order_issued{fleetId,order}`, `comms{faction,side,text}`, `objective_completed{side,text}`, `battle_end{winner,reason}`. Every event carries `t`.

Consumers that switch on `type` (all have a `default`/fallthrough, so adding a member is safe): `rendering/battleView.ts:356-401` (`processEvents`), `ui/app.ts:173-215` (`BattleController.onSimEvent`, audio), `ui/screens/hud.ts:325-343` (`tick`, comms only), `ui/screens/results.ts:33-38` (destruction log), `simulation/results.ts:46` (last `battle_end`). The determinism test compares `JSON.stringify(events)` (`tests/battle.test.ts:21`), so new events must be deterministic too.

### 1.6 AI (`src/simulation/ai.ts`) and formations (`formations.ts`)

- `AiContext` (L15-24: `time, rng, rules, ships, fleets, enemiesOf, alliesOf, getShip`) — `BattleSimulation` implements it with a per-tick side cache (`battle.ts:254-278`).
- `doctrineOf(ship)` (L34) → `FACTIONS[faction].doctrine` (`data/factions.ts:3-22`: `preferredRangeFactor, withdrawThreshold, focusFire, protectCapitals, threatPriority, finishWounded, cohesion, decisionInterval, aggression`). Values per faction: alliance (0.85, 0.25, 0.7, 0.6, 0.6, 0.5, 0.8, 2.0, 0.55; L60-70), turian (0.75, 0.12, 0.8, 0.5, 0.7, 0.6, 0.95, 1.8, 0.75; L129-139), asari (0.9, 0.3, 0.6, 0.8, 0.6, 0.4, 0.7, 1.6, 0.45; L164-174), salarian (0.95, 0.4, 0.5, 0.5, 0.8, 0.7, 0.6, 1.2, 0.35; L198-208), quarian (0.8, 0.35, 0.6, 1.0, 0.5, 0.5, 0.7, 2.2, 0.4; L232-242), geth (0.8, 0.1, 0.9, 0.5, 0.8, 0.8, 0.95, 0.6, 0.6; L266-276), cerberus (0.8, 0.2, 0.8, 0.6, 0.7, 0.7, 0.75, 1.5, 0.7; L300-310), reaper (0.7, **0.0**, 0.85, 0.2, 0.9, 0.3, 0.9, 0.8, 0.95; L334-344). `FactionDef` also carries `colour/colourHex/engineColourHex` and `comms: Record<CommsEvent, string[]>` (L24-50).
- `centroid` (L38-50, point-value weighted), `fleetEngagementRange` (L53-60, longest anti-capital/non-PD range, min 20), `priorityMultiplier` (L62-77: ×4 for the matching role, ×3 for escorts), `scoreTarget` (L82-107: `0.4 + threat*threatPriority*2 + wounded*finishWounded + 0.25 if barriers down`, range penalty/bonus, fighters ×0.05 for non-fighters, focus ×`1+focusFire*2*(1.5 if orders.focusFire)`, priority multiplier, stickiness ×1.3, protect-capitals ×1.8), `chooseTarget` (L109-133: honours `forcedTargetId`, sensor range ×1.5 cut-off), `fleetDecision` (L136-242: focus target re-evaluated each `decisionInterval*(0.8+0.4*rng)` with 30 % churn; anchor moves toward `standoff = range*preferredRangeFactor` scaled by order — `attack/attack_target/advance` close to `standoff*(1.1-0.5*aggression)` (`advance`: `*0.55`), `defend_position` → `orders.position`, `withdraw/retreat` → 60*S away, `escort/intercept` → target; anchor speed 95 % of the slowest ship; anchor clamped within `12*S` of the fleet centroid; heading turns at 0.25 rad/s toward the enemy), `shipDecision` (L245-256: retarget on death or 35 % churn; withdraw once `hull/maxHull < withdrawThreshold` with 50 % per decision), `movementGoal` (L259-326: fighters return to carrier when recalled/rearming, else orbit the target at `0.9*torpedoRange` with a deterministic phase; withdrawing/retreating ships run `40*S` away from the enemy centroid; `escortId` → slot ×0.35 around the escorted ship; frigates harass to `0.75*torpedoRange` under `dispersed/strike_wedge` with attack-type orders when `cohesion < 0.95`; default: formation slot, facing the target when forward-arc weapons are within 1.4×range).
- Reaper behaviours asked for in D10 (rotate protection, kill the active gun platform, cover a damaged capital, abandon a damaged harvest ship, withdraw a threatened group) do **not** exist; the only Reaper-specific logic is doctrine numbers, `withdrawThreshold 0`, `coordinationPenalty`, and `protectCapitals` scoring for frigates/cruisers (`ai.ts:102-105`). Insertion points: `fleetDecision` (fleet posture/anchor), `scoreTarget` (target weights), `movementGoal` (ship positioning), `shipDecision` (withdraw rule). Harbinger is not special-cased anywhere in the AI; `strategic.harbingerOperational` only decides whether the campaign spawns him (`campaign/engine.ts:161`).
- Formations (`formations.ts`): `assignSlots(ships, formation)` (L42-50) multiplies nominal slots by `k = max(BATTLESPACE_SCALE, 0.55)`; `assignSlotsNominal` (L52-135) tiers capitals/cruisers/frigates/fighters (`tier()`, L19-33), `capSpacing = max(3.2, length*1.7/0.55)` (L58), one layout per formation (`line_abreast` L63-69, `defensive_screen` L70-82, `strike_wedge` L83-98, `capital_column` L99-109, `fighter_screen` L110-119, `dispersed` L120-132, deterministic scatter); `slotToWorld(anchor, heading, slot)` (L138-147). Formations are per fleet (one anchor per `FleetSpec`); sub-groups do not exist (KNOWN_ISSUES).

### 1.7 Results and Reaper intelligence

- `results.ts`: `summariseSide(sim, side)` (L8-43) and `summarise(sim)` (L45-66; `outcome` relative to `config.perspectiveSide`, `objectiveCompleted = outcome === 'victory'`).
- `reaperIntel.ts`: `assessReapers(sim)` (L22-107) → `ReaperAssessment` (L8-20). `organicTechCapability = clamp(dmgPerShot/900)` (L37); "unexpected technologies" from `rules.special.hyperMassAccelerators/hadesRounds/thanixAvailability==='fleetwide'`, `organic.kineticBarrierStrength > 1.3`, `reaperCommandVulnerability` (L41-46 — new AU specials must be added here to be "noticed"); threat score `lossesFraction*3 + capitalLosses*0.6 + tech*0.8 + 0.5 (if organic strength > 60 % after 60 s)` with thresholds 0.3/0.7/1.3/2.2/3.2 (L50-56). Used by the HUD (`hud.ts:301-310`), results screen and `scripts/headless-battle.ts`.

---

## 2. Where the new mechanics hook in

### 2.1 Fleet volley (every spinal gun fires inside a 1.5 s window at a beat)

There is no fleet-level fire control today: `fleetDecision` (`ai.ts:136`) only moves the anchor and picks a focus target; every mount decides for itself in `updateWeapons` → `tryFire` (`battle.ts:520-561, 567-755`). Hook plan that keeps determinism:

1. State: add to `FleetState` (`types.ts:244-258`) something like `volley?: { at: number; window: number; mounts: Map<shipId, number[]> }` (per-mount offsets drawn from `this.rng` **at order time**, inside the sim). Expose it through `issueOrders` (`battle.ts:283`) or a dedicated `orderVolley(fleetId, at, window)` so the HUD, beat scheduler and scenes all use one entry point; emit `order_issued`.
2. Hold phase: in `updateWeapons` before the gates at L555, mounts matching the spinal predicate already used at L627 (`def.antiCapital && def.arc <= 20`, kinds `mass_accelerator`/`thanix`) skip `tryFire` while `time < volley.at + offset`, but keep cooling down and must still respect `ship.overheated` and `ammo`.
3. Release phase: when `time >= volley.at + offset` and `< volley.at + window`, force `w.cooldown = 0` and call `tryFire`; bypass the 60 % "wait for primary" roll at L627 for volley shots so the whole line fires on the beat. Default projectile speed means tracers *arrive* spread by range, which is what the brief wants ("tracers cross the gap together").
4. Add a `fleet_volley` member to `BattleEvent` (`types.ts:262-282`) for the view/HUD/scene director; consumers listed in 1.5 are safe.
5. The brief's `cinematic_arrival`/"fleet_volley once, then normal fire control resumes" means clearing `fleet.volley` after the window.

### 2.2 Beat scheduler (time-indexed scripted events)

`step()` already runs one time-ordered queue (`pendingFleets`, `battle.ts:343-347`). Put a `beats` queue next to it and process it in the same place (after reinforcements, before `fleetDecision`, L348) so spawned fleets and new orders act in the same tick. Beat kinds map to existing calls:

| Beat | Existing call | Note |
| --- | --- | --- |
| spawn wave | `deployFleet(spec)` (private, L103) | either make it callable or push a `FleetSpec` with `arrivalTime` into `pendingFleets` and re-sort (the sort at L97 runs only in the constructor) |
| set order / formation | `issueOrders(fleetId, patch)` (L283) | formation changes re-slot via `reassignSlots` |
| force target | `orderShipsAttack(ids, targetId)` (L312) or `issueOrders({order:'attack_target', targetId})` | `focusTargetId` + `forcedTargetId` |
| volley | 2.1 | |
| trigger special (HADES strike, drive attack, Oculus launch) | new `BattleSimulation` methods | must draw from `this.rng` |
| force an outcome (scene "forces events") | `destroyShip(ship, killer)` (private, L844) | emits `ship_destroyed`; keep it an explicit scene call, never a hidden auto-win |

Config surface: add `beats?: Beat[]` (+ `beatScale`) to `BattleConfig` (`types.ts:89-105`); the Final Battle builder (`scenarios/index.ts:479-497`) is where the editable table attaches, gated by a new world-state option (`WorldStateOption`, `index.ts:13-21`) such as `cinematic_arrival`. World-state values are strings (`Record<string,string>`, `index.ts:36`); campaign-linked data is passed as JSON strings in `ws` (`campaignAllied`, `campaignReaper`, `index.ts:481-482`, written by `ui/screens/briefing.ts:15-22`).

Camera side: `BattleView.processEvents` (`rendering/battleView.ts:356-401`) reacts to events; the cinematic director (`pickCinematicShot`, L487-497; hold/age state L55, L290, L452-460) uses `Math.random` and is render-only. A shot list for Showcase/Final Battle should drive `CameraRig` (`cameras.ts:27`) from `BattleView.updateCamera` (L428-485) via `rig.update(dt, {subject, cinematic, projectile, fleetCentre})` (L101) or a new mode; see 5.3 for what the rig can and cannot do.

### 2.3 Magazines, bursts, heat (where finite HADES rounds and the three-channel Valkyrie go)

- Catalogue: `WeaponDef.magazine?` (`data/types.ts:55-56`) and `burst?: {shots, recovery}` (L57-58). Today only `disruptor_torpedo` (8), `fighter_torpedo` (2), `gardian` (10/4 s) and `reaper_point_defence` (14/3 s) use them (`weapons.ts:119,200,140,265`).
- Runtime: `WeaponState.ammo/burstLeft/burstRecover` (`simulation/types.ts:124-129`), initialised in `createShip` (`battle.ts:195-197`), consumed in `tryFire` (L636-646: burst decrement, ammo decrement, `ammunition_depleted` when every mount with that weapon id is empty, fighter → `rearming`), burst recovery in `updateWeapons` (L550-554), rearm in `updateCarrier` (L488-498). HUD shows torpedoes/PD readiness for the selected ship (`hud.ts:247-252`).
- **Finite HADES magazine (D7)**: giving the Titan gun a `magazine` is enough for `ammo` to flow; a mixed loadout (HADES rounds then ordinary slugs) needs a second `WeaponState` field (e.g. `specialAmmo`) checked in `tryFire` and a second weapon def or a per-shot flag on the `Projectile` (`types.ts:207-217`) so `applyHit` knows whether to run the warhead step.
- **Warhead after penetration (D7)**: `applyDamage(target, raw, weapon, rng, now)` (`damage.ts:27-73`) returns `hullDamage`; `applyHit` (`battle.ts:757-775`) is the place to add a second `applyDamage` with a `warhead`-type `EffectiveWeapon` (`BARRIER_EFFICIENCY.warhead = 0.25`, `weapons.ts:21`; pass `barrierEfficiencyMultiplier: 0` if the burst is meant to ignore barriers because it is already inside) when `out.hullDamage > 0` and the round carried a warhead, emitting a dedicated event (e.g. `hades_detonation{shipId,targetId,pos,damage}`) for the effect and the destruction log. Subsystem outage: `applyDamage` already rolls subsystems (L58-64); a forced outage would set `target.subsystems[x]` directly.
- **Per-mount heat (D8)**: heat is ship-level only (`ship.heat/heatCapacity/overheated`, `battle.ts:231-233, 448-450, 557, 634`). Three independent Thanix channels need `WeaponState.heat` plus a per-mount gate in `updateWeapons`.
- **Drive attack (D9)** has no precedent: a timed state on a `ShipState` (`driveRun?: { targetId, startedAt, endsAt }`), a per-step check in `step()`, interception = `destroyShip` before `endsAt`, completion → `destroyShip(target, ship)` + `destroyShip(ship)`, attempts counted on the `BattleSimulation`, probability from `this.rng`. Gate on `rules.special` (new flag) so canon never gets it.
- **Oculus (D4)**: carriers are generic — any class with `fighterComplement` (`data/types.ts:111-112`) launches via `updateCarrier`; Reaper classes have none today (`ships.ts:832-913`). Adding `fighterComplement: { classId: 'reaper_oculus', count }` to `reaper_capital`/`reaper_destroyer` plus a `reaper_oculus` class (role `fighter`, faction `reaper`) and a weapon reuses launch/recall/rearm/point-defence code unchanged; `tryFire` already treats enemy `fighter` roles as PD targets.

---

## 3. Rules engine (`src/timelines/`)

### 3.1 `rules.ts`

- `TechModifiers` (L14-34): 18 keys — `massAcceleratorDamage, massAcceleratorPenetration, massAcceleratorRange, fireRate, heatCapacity, kineticBarrierStrength, barrierRegen, armourStrength, hullIntegrity, speed, sensors, electronicWarfare, accuracy, fighterStrength, torpedoDamage, gardianEffectiveness, beamDamage, crewQuality`. `TECH_KEYS` (L157).
- `SpecialTechnology` (L36-47): `hyperMassAccelerators, hadesRounds, thanixAvailability: 'canon'|'fleetwide'|'none', reaperCommandVulnerability, indoctrinationDisabled`.
- `FleetStrength` (L49-58): one multiplier per faction. `StrategicVariables` (L60-80): `alliedCoordination, reaperCompetence, indoctrinationEffectiveness, reaperReinforcements, conventionalVictoryPossible, crucibleAvailable, shepardAlive, shepardEffectiveness, illusiveManIndoctrinated, cerberusStance: 'hostile'|'neutral'|'cooperative'|'controls_reapers', harbingerOperational, catalystOperational, homeworldIndependence`.
- `RuleSet` (L84-99): `id, name, tagline, category: 'canon'|'au'|'custom', description, historyChanges[], organic, reaper, factionOverrides: Partial<Record<FactionId, Partial<TechModifiers>>>, special, fleetStrength, strategic`.
- Canon constants: `CANON_TECH` (L101-120, all 1), `CANON_SPECIAL` (L122-128), `CANON_FLEETS` (L130-139), `CANON_STRATEGIC` (L141-155: `alliedCoordination 0.5, reaperCompetence 1, indoctrinationEffectiveness 1, reaperReinforcements 1, conventionalVictoryPossible false, crucibleAvailable true, shepardAlive true, shepardEffectiveness 1, illusiveManIndoctrinated true, cerberusStance 'hostile', harbingerOperational true, catalystOperational true, homeworldIndependence false`).
- `cloneRules` (L160, JSON deep clone), `techFor(rules, faction)` (L163-167: `reaper` → `rules.reaper`, else `rules.organic`, then `factionOverrides[faction]` spread on top — overrides replace, they do not multiply).
- `applyRulesToShip(cls, rules)` → `EffectiveShipStats` (L173-214): `hull/armour/barriers/barrierRegen` × tech × `fighterStrength` (fighters only); `maxSpeed/acceleration` × speed; `turnRate × (0.8+0.2*speed)`; `sensorRange × sensors`; `ecm = min(0.95, ecm*electronicWarfare)`; crew: organics `cls.crewQuality*crewQuality*(1-0.08*indoct)*(0.9+0.2*alliedCoordination)` with `indoct = indoctrinationDisabled ? 0 : indoctrinationEffectiveness`, Reapers `× reaperCompetence`; `heatCapacity = 100*heatCapacity`.
- `EffectiveWeapon extends WeaponDef` (L216-223): `armourBypass, barrierEfficiencyMultiplier, substitutedFrom?`.
- `applyRulesToWeapon(weapon, faction, cls, rules, catalogue)` (L229-288), organics only for substitutions (L240-261):
  - **hyper-MA**: `special.hyperMassAccelerators && cls.role === 'dreadnought' && kind === 'mass_accelerator' && antiCapital && arc <= 20` → `catalogue.apex_hyper_ma` (L242-251). Applies to every organic dreadnought spinal gun (Alliance, turian, asari, salarian, geth, quarian heavy, Cerberus, Destiny Ascension's `ascension_main`), not only Alliance/turian as the preset text says.
  - **Thanix fleetwide**: `weapon.id === 'alliance_cruiser_main'` → `alliance_thanix` with `damage ×1.4` and `cooldown 5.5` (L253-256). Only the Alliance cruiser main (and the quarian Patrol cruiser, which mounts `alliance_cruiser_main`); turian/asari/salarian/geth/Cerberus cruiser mains are untouched.
  - **Thanix none**: any `thanix` kind → `alliance_cruiser_main` (L257-260).
  - Multipliers (L263-285): `fighterMult` for fighter hulls; `damage ×massAcceleratorDamage` (MA) / `×beamDamage` (thanix, reaper_beam) / `×torpedoDamage` / `×gardianEffectiveness`; `penetration ×massAcceleratorPenetration` (MA only); `range ×massAcceleratorRange` (MA only); `cooldown / fireRate`; `accuracy = min(0.99, ×accuracy)`.
  - **HADES**: `hades = faction !== 'reaper' && special.hadesRounds && isMA` → `armourBypass 0.5`, `barrierEfficiencyMultiplier 0.6` (L275-285). Applies to **every** organic mass accelerator (frigate guns, broadsides, fighter cannon), not only the Titan gun — D7 ("HADES = specialist ammunition of the Titan gun with a finite magazine") requires moving this onto the weapon/round rather than the faction.

### 3.2 `presets.ts`

`tech(p)` helper (L11). Presets, in `PRESETS` order (L252-260): `CANON_ME3` (L18-32, `Object.freeze`d, `category 'canon'`, `historyChanges []`), `PREPARED_GALAXY` (L35-54), `HUMANITY_ASCENDANT` (L57-87, Alliance `factionOverrides`), `CERBERUS_REFORMED` (L90-113, `cerberusStance 'cooperative'`, `illusiveManIndoctrinated false`), `REAPER_ESCALATION` (L116-134), `PRIME_APEX` (L140-200), `CERBERUS_ASCENDANT` (L207-239). `makeCustom()` (L242-250) clones canon with id `custom`. `getPreset(id)` (L262-269) returns a clone, special-cases `'custom'`, throws on unknown ids (the UI catches this: `App.getTimeline`, `ui/app.ts:503-511`, falls back to canon).

`PRIME_APEX` today (id `prime_apex`, name `Prime/Apex — Successful Refuse`): organic `{MA damage 1.25, MA penetration 1.3, MA range 1.0, fireRate 1.1, heatCapacity 1.3, barriers 1.35, barrierRegen 1.4, armour 1.3, hull 1.15, speed 1.08, sensors 1.4, EW 1.3, accuracy 1.1, fighterStrength 1.3, torpedo 1.4, gardian 1.4, beam 1.35, crew 1.15}` (L157-176); reaper = canon (L177); `factionOverrides.cerberus {EW 1.6, sensors 1.6}` (L178-180); special `{hyperMA true, hades true, thanix 'fleetwide', reaperCommandVulnerability true, indoctrinationDisabled false}` (L181-187); fleetStrength `{alliance 2.0, turian 1.6, asari 1.3, salarian 1.3, cerberus 1.5}` (L188); strategic `{alliedCoordination 0.9, conventionalVictoryPossible true, crucibleAvailable **true** (D1 → false), shepardEffectiveness 1.8, illusiveManIndoctrinated false, cerberusStance 'cooperative', homeworldIndependence true, indoctrinationEffectiveness 0.5}` (L189-199). `historyChanges` (L147-156) contain the phrases the e2e test looks for ("Homeworld Defence Rule", see §9).

`CERBERUS_ASCENDANT`: `special {indoctrinationDisabled true, reaperCommandVulnerability false}`, strategic `{shepardAlive false, shepardEffectiveness 0, illusiveManIndoctrinated false, cerberusStance 'controls_reapers', catalystOperational false, harbingerOperational true, crucibleAvailable false, conventionalVictoryPossible true, indoctrinationEffectiveness 0}` (L225-238). `tests/timelines.test.ts:56-65` pins these apart from Prime/Apex.

### 3.3 `schema.ts` (import validation and clamps)

`validateRuleSet(input)` (L84-182) → `ValidationResult {ok, rules?, errors, warnings}` (L20-25). Unknown keys dropped, missing keys default to canon, numbers clamped with warnings (`num`, L52-60). `TECH_RANGE` (L29-48): MA damage [0.1,10], MA penetration [0.1,5], MA range [0.3,3], fireRate [0.2,4], heatCapacity [0.3,4], barriers [0.05,10], barrierRegen [0,10], armour [0.1,10], hull [0.1,10], speed [0.3,3], sensors [0.3,3], EW [0,3], accuracy [0.3,1.6], fighterStrength [0.1,5], torpedo [0.1,5], gardian [0,5], beam [0.1,10], crew [0.3,2]. `fleetStrength` [0,5] (L125). Strategic ranges (L131-146): coordination [0,1], reaperCompetence [0.5,1.5], indoctrination [0,2], reinforcements [0,4], shepardEffectiveness [0,2]; unknown `cerberusStance` → `'hostile'`, unknown `thanixAvailability` → `'canon'` (L117). Prerequisites (L150-161): dead Shepard → effectiveness 0; `controls_reapers` → `catalystOperational false`; indoctrinated Illusive Man → stance `hostile`. Imported id `canon_me3` → `canon_me3_imported`, category `canon` → `custom` (L94-96, L168-171). `historyChanges` ≤ 40 × 300 chars (L163-165). `exportRuleSet` (L184) / `importRuleSet` (L186-194).

**The timelines editor saves through the schema** (`ui/screens/timelines.ts:182`: `importRuleSet(exportRuleSet(rules))`), so any `special`/`strategic` key missing from `validateRuleSet` is silently dropped when a custom timeline is saved or imported.

### 3.4 Checklist: adding a preset or a special flag

New preset (e.g. `apex_legacy`): `presets.ts` const + `PRESETS` (L252); `historyChanges` non-empty (`tests/timelines.test.ts:74-78`); add the id to the explicit lists in `tests/timelines.test.ts:67-72` (if Reaper tech stays canon) and `tests/battle.test.ts:128` (builds every scenario under every preset); codex `au` blocks are keyed by preset id (`codex/entries.ts`, e.g. L32-35, L47-50, L61-65, L141, L152, L220, L281-284) and `auDynamic` predicates (L192) — an `apex_legacy` entry needs its own keys or shared text; comparison default picks `prime_apex` when the active timeline is canon (`ui/screens/comparison.ts:9`); `scenarios/index.ts` hard-codes `rules.id === 'prime_apex'` for the Black Fleet dreadnoughts (L349) and so does `campaign/engine.ts:159` — generalise to a flag/stance check so `apex_legacy` inherits the Black Fleet. Saved campaigns embed a `rules` snapshot (`campaign/state.ts:83`) and old prefs store `lastTimelineId` (`core/storage.ts:14`), so **keep `prime_apex` as the id** (D1) and migrate snapshots in `normaliseCampaign` (`campaign/depth.ts:275-284`) if new flags must exist on old saves; `validateRuleSet` is not a safe migrator for snapshots (it renames canon and forces `custom`).

New special flag: `rules.ts` `SpecialTechnology` + `CANON_SPECIAL` → `schema.ts:112-120` `bool(...)` line → `ui/screens/timelines.ts:60-95` `specialPanel` row → `scenarios/comparison.ts:113-116` `changed.push` so the explanation ranks it → `simulation/reaperIntel.ts:41-46` if the Reapers should report it → consumer in `applyRulesToWeapon`/`battle.ts` → `AU_RULES.md` table. Tests touched: `tests/timelines.test.ts:14` (`CANON_ME3.special` must equal `CANON_SPECIAL`), `:86` (round-trip equality through the schema), `:56-65` (Cerberus Ascendant must keep the Apex flags false). Strategic flags follow the same route via `schema.ts:128-147`, `timelines.ts:75-93` and the campaign-setup summary (`ui/screens/campaign.ts:500-505`).

Database screen (`ui/screens/database.ts:15-66`) renders effective stats, `substitutedFrom` and `armourBypass` automatically; nothing to add there for new multipliers.

---

## 4. Scenarios and custom battle (`src/scenarios/`)

### 4.1 Shapes and helpers (`index.ts`)

- `WorldStateOption` (L13-21): `id, label, kind: 'player_dependent'|'extrapolation'|'au', description, choices[{id,label,description}], default`. Rendered by `ui/screens/briefing.ts:53-62` as selects with a badge (`player_dependent → inferred`, `au → au`, else `estimate`).
- `ScenarioDef` (L23-39): `id, name, subtitle, environment, description, recommendedRules[], auOnly?, worldState?, objective, maxDuration, build(rules, seed, worldState): BattleConfig, briefing[]`.
- `FLEET_SCALING_KEY = 'fleet_scaling'` (L46); `fleetMult(rules, faction, ws)` (L84-85) returns 1 when `ws.fleet_scaling === 'fixed'` (comparison mode and the balance tests), else `rules.fleetStrength[faction]`.
- Named vessels: `NAMES` map (L58-79) by class id (`alliance_dreadnought` → `SSV Kilimanjaro, SSV Orizaba, …`; `cerberus_dreadnought` → `['Black Fleet Flagship Prometheus']`; `alliance_frigate_thanix` → `['SSV Normandy SR-2']`; `harbinger` → `['Harbinger']`). `scaleCount(base, mult)` (L82, never below 1 if base ≥ 1).
- `FleetOpts` (L87-102) and `fleet(id, faction, rules, opts)` (L105-130): counts scaled by `mult ?? fleetMult`, `fixedClasses` never scale, carriers scale at most ×1.5 (L112), `names` from `NAMES`, defaults `side` (`reaper → 'B'`), `formation` (reaper `strike_wedge`, else `defensive_screen`), `position` (A `(0,0,-36)`, B `(0,0,40)`), `heading` (A `+z`, B `-z`), `playerControlled = side === 'A'`.
- `reaperFleet(id, rules, {capitals, destroyers, harbinger?, name?, side?, position?, heading?, arrivalTime?, mult?, ws?, formation?})` (L132-145): `harbinger` is a fixed class.
- `SHEPARD_WORLD_STATE` (L147-157, key `normandy`, `yes|no`). `base(...)` (L159-171) builds the `BattleConfig` with `id = "${id}-${rules.id}-${seed}"`, `perspectiveSide 'A'`.
- `getScenario` (L592-596), `defaultWorldState(s)` (L598-602), `buildScenario(scenarioId, rulesId, seed, worldState?)` (L605-609) — convenience used by tests and `scripts/headless-battle.ts`.

### 4.2 Scenario table (`SCENARIOS`, L173-590)

| id | lines | fleets (side A / side B) | world state | notes |
| --- | --- | --- | --- | --- |
| `battle_of_earth` | 174-213 | Alliance Fifth Fleet (6 DN, 1 CV, 14 CA, 24 FF [+Normandy]) / 3 cap + 7 dd at `(6,2,46)`, second wave 1+3 at T+55 | `normandy`, `fleet_commitment` (standard/heavy/light) | 420 s, `earth_orbit` |
| `defence_of_palaven` | 214-251 | 7 turian DN, 14 CA, 22 FF / 3+8, flank 1+4 at T+70 | `alliance_support` (none/cruisers at T+60) | 420 s |
| `fall_of_thessia` | 252-285 | Destiny Ascension (optional), 4 asari DN, 20 CA / 4+8 | `ascension` present/absent | 420 s |
| `defence_of_surkesh` | 286-322 | 2 salarian DN, 10 CA, 16 FF / 3+8, flank 1+4 at T+90 (early) or T+25 from the flank (late) | `stg_warning` | labelled estimate |
| `cerberus_intervention` | 323-353 | Alliance TF (2 DN, 8 CA, 14 FF [+Normandy]) vs Cerberus strike fleet (10 CA, 16 FF, side B) **or**, when `cerberusStance ∈ {cooperative, controls_reapers}` (L339), Alliance + Cerberus (2 Black Fleet DN only if `rules.id === 'prime_apex'`, L349) vs 2+6 Reapers | `normandy` | 360 s, `deep_space` |
| `rannoch_campaign` | 354-401 | war: Migrant Fleet (2 liveships, 4 heavy, 18 CA) vs geth (1 DN, 14 CA, 22 FF, side B) with `techOverride {barriers 1.4, accuracy 1.2, crew 1.2, regen 1.4, MA 1.15}` when `outcome === 'war'` (L397); peace: both vs 3+8 Reapers | `outcome` war/war_unupgraded/peace | the only scenario using `FleetSpec.techOverride` |
| `battle_of_the_citadel` | 402-443 | Citadel Fleet turian (3/10/14), Republics (Ascension if `save`, 6 CA), Alliance Fifth (3/10/16) at T+40 with `initialOrder {escort 'republics-guard-destiny_ascension-1', protectCapitals}` (L435) / Sovereign (`reaper_capital` named, `capital_column`) + geth escort (2 DN, 14 CA, 22 FF) | `ascension` save/sovereign | `citadel` env |
| `final_battle_of_earth` | 444-498 | campaign-linked (L481-485: `ws.campaignAllied` JSON `[{name, faction, counts}]` → fleets `sword-i` in a 4-wide grid, `ws.campaignReaper` JSON counts → `reaper-blockade`, `mult 1`) **or** default (L487-494): Sword Alliance (6 DN, 2 CV, 16 CA, 24 FF, Normandy) `line_abreast` at `(-20,0,-34)`, Hierarchy (5/10/16) at `(18,0,-38)`, Republics (Ascension unless `ws.ascension === 'absent'`, 2 DN, 8 CA) at `(0,4,-48)`, Migrant Fleet (3 heavy, 10 CA) at `(-40,0,-46)`, geth (1/8/12) at `(40,0,-44)`, Salarian First Fleet (2/8/12) if `genophage === 'sabotaged'`, vs Reaper blockade 6 cap + 14 dd + Harbinger at `(0,0,46)` and reserve 3+8 at `(-50,0,76)` T+90 | `forces` campaign/default, `genophage` cured/sabotaged (L455-477); `ws.ascension` is read (L489) but not declared as an option | 540 s; **no Cerberus fleet at all today** (D4 adds the `cerberus` world state) |
| `alliance_fleet_engagement` | 499-515 | 8 DN, 1 CV, 16 CA, 30 FF [+Normandy] `line_abreast` / 4 cap + 8 dd at `(0,0,40)` | `normandy` | 360 s; **the reference engagement for comparison mode and the balance tests** |
| `prime_apex_sol_defence` | 516-537 | Alliance Home Fleet (8/2/18/30/+Normandy, `mult 1`) / 4+8 and second wave 2+4 at T+70 | none | `auOnly`, 480 s |
| `prime_apex_palaven_defence` | 538-555 | 9 turian DN, 18 CA, 28 FF / 4+8, 2+4 at T+70 | none | `auOnly`, 480 s |
| `cerberus_ascendant_harbinger` | 556-577 | controlled Reapers (3+6, side A) + Cerberus support (4 CA, 8 FF) / Harbinger + 6 dd | none | `auOnly` |
| `custom` | 578-589 | empty placeholder; the real config comes from `buildCustomBattle` | | hidden from the briefing list (`briefing.ts:38`) |

`briefing.ts:15-22` (`campaignWorldState`) always injects `campaignAllied`/`campaignReaper` from the live campaign (allied fleets' names/factions/counts; Reaper counts summed), so the Final Battle uses the saved war whenever `app.campaign` exists and `forces === 'campaign'`.

### 4.3 Custom battle

- `CustomFaction = FactionId` (L613); `CustomFleetInput {faction, name, formation, counts}` (L615-620); `CustomBattleInput {seed, rulesId, environment, startingDistanceKm, sideA, sideB, maxDuration?, reinforcementTime?, reinforcementCounts?}` (L622-633).
- `buildCustomBattle(input, rules?)` (L635-656): `half = max(10, startingDistanceKm)/2`; fleets `custom-a` at `-half` heading `+z` (player) and `custom-b` at `+half` heading `-z`, `mult 1`; optional `custom-b2` reinforcement at `half+30` with `arrivalTime = reinforcementTime` using `reinforcementCounts`; config `id custom-${rules.id}-${seed}`, `name 'Custom Battle'`, `scenarioId 'custom'`, `maxDuration ?? 420`, `objective 'Destroy the enemy force.'`. Both current call sites pass `sideA/sideB` (`tests/battle.test.ts:111-119`, `tests/salarian.test.ts:35-43`, `ui/screens/custom.ts:154`).
- UI `src/ui/screens/custom.ts`: `ENVIRONMENTS` (L9-16: earth/palaven/thessia/rannoch/surkesh orbit, deep space — no `citadel`/`relay`), `FACTION_DEFAULTS` (L19-28: name/formation/counts per faction incl. `reaper {reaper_capital 4, reaper_destroyer 8, harbinger 0}` and `cerberus {cerberus_dreadnought 0, …}`), `CUSTOM_FACTIONS` order (L29), `DEFAULT_INPUT` (L31-41: seed 42, canon, deep space, 76 km, reference fleets). `renderCustom` (L43-161): loads `storage.get('customBattle')` and merges it **over** `DEFAULT_INPUT` field by field (L46-51) — this merge is what keeps an older saved shape loading; per-side editor `fleetEditor` (L56-83) with `data-faction="sideA|sideB"` select, formation select, name input, count inputs `data-count="${side}:${classId}"` (0-60, fighters excluded); conditions panel (timeline select from `app.allTimelines()`, battlefield, distance 30-160 km slider, seed, time limit 60-1800) (L91-101); side-B reinforcement panel (L102-108); presets (L109-127: reference engagement, destroyer hunt, Harbinger at Earth); footer `Save setup` (L146-149) and `data-action="launch-custom"` (L150-158: requires both sides non-empty, saves, `app.selectTimeline(rulesId)`, `config.name = "Custom: A vs B"`). Save key: `storage.set('customBattle', input)` (L147, L152); Settings "Clear save data" removes it (`settings.ts:87`); it is exported/imported with the rest (`core/storage.ts:124,150`).
- D6 ("united fleets": N fleets per side, mixed factions, per-fleet arrival/formation/position, preset compositions) therefore needs: a new input shape (e.g. `fleets: CustomFleetInput[] & {side, arrivalTime?, position?}`), a converter from the legacy `{sideA, sideB, reinforcementTime, reinforcementCounts}` shape (keep `buildCustomBattle` accepting both or migrate the two tests), slot layout for several fleets per side (the Final Battle grid at `index.ts:484` and `campaign/engine.ts:267,291` are the existing patterns), and the e2e selectors `data-count="sideB:reaper_capital"` / `data-count="sideB:reaper_destroyer"` (`e2e/game.spec.ts:121-122`) either preserved or updated together with the test.

### 4.4 Comparison runner (`comparison.ts`)

`runBattle(config)` (L27-31), `compareBattles(configA, configB)` (L35-64) → `ComparisonReport {a, b, metrics[], explanation[]}` with 15 metrics (L45-61), `explainDifferences(a, b, ra, rb)` (L88-143): tech diffs weighted by `impactWeights` (L95), faction overrides (L104-112), special flags (L113-116), strategic (L117-119), fleet strength (L120-122), top 8 lines, plus the canon-vs-hyperMA closing sentence (L139-141). `tests/battle.test.ts:206` expects `/Hyper-mass accelerators/` in the explanation; `e2e/game.spec.ts:102` expects the text `Hyper-mass accelerators` to be visible on the comparison screen.

---

## 5. Rendering (`src/rendering/`)

### 5.1 `battleView.ts` — `class BattleView`

- `ShipVisual {ship, built, glows[], dying?, removed, tinted, lod}` (L20-30); `GraphicsSettings {quality, showEngineGlow, pixelRatioCap, lod?}` (L32-38); `MAX_FAR_POINTS = 2048` (L40).
- Constructor `(canvas, sim, settings)` (L75-119): WebGLRenderer (antialias unless low, logarithmic depth), ACES tone mapping 1.05, `CameraRig`, PMREM `RoomEnvironment` IBL at 0.35, glow texture, sun/hemisphere/ambient/fill lights, `effects.group`, **far-point cloud** `THREE.Points` with `PointsMaterial {size 2.2, vertexColors, additive, glow map}` (L110-117) fed from `farPositions/farColours` (faction `engineColourHex`) — this is the "far-point LOD cloud" that D11 turns into tracer sparks.
- `bind(sim)` (L122-144): rebuilds visuals, `buildEnvironment(sim.config.environment)`, hooks `sim.onEvent → eventQueue` (L134; `BattleController` wraps this at `app.ts:87-92`), frames the perspective side at `distance 320, yaw π+0.6, pitch 0.42` (L139-143).
- `ensureVisual(ship)` (L146-169): `instantiateShip(classId)`, engine glow sprites scaled `lengthUnits*0.11` (Reapers 0.12) × `glowScales[i]`, group named by ship id. `placeVisual(v, alpha)` (L171-188): interpolates `prevPos→pos` and `prevHeading→heading` by `alpha` × `KM`, quaternion from `+z` to heading, bank for fighters/frigates.
- `applyLod(v, level)` (L193-202): `point` hides the group; `reduced` hides sprites and meshes named in `DETAIL_MESH_NAMES`.
- `update(dt, alpha)` (L204-298): `processEvents`; per ship: dying → `updateDying`; escaped → hidden; `placeVisual`; `lodLevel(dist, lengthUnits, role, settings.lod !== false)` → `applyLod` and `lodCounts` (L225-228); `point` ships are written into the far cloud (L229-240); glow opacity `0.35+0.6*throttle*engines` (L243); damage tint below 60 % hull (L245-256, `tintDamage` L300-306 clones `hull` materials). Then effects sync: `effects.setTracers(projectiles.map({pos, vel, big: damage >= 600}), alpha, SIM_DT)` (L264-265), `setMissiles` (L266), beams from `WeaponState` (`beamStart` replaced by the model `muzzle` for Reapers and Thanix, L267-285, intensity 1.3 capital / 0.7 destroyer / 0.9 thanix), `setPointDefence(sim.flashes)` (L286), `effects.update(dt)` (L287); `updateCamera(dt)` (L291); fill light and sky objects follow the camera (L293-297).
- `updateDying` (L308-329): capitals 2.2 s, cruisers/destroyers 0.9 s, others immediate; drift + roll; secondary explosions (`Math.random`). `finishDeath` (L331-354): non-fighter meshes become debris pieces, `effects.explosion(pos, lengthUnits, reaper, pieces, vel)`, `rig.addShake`.
- `processEvents` (L356-401): `weapon_fired` (mass accelerators only: `muzzleFlash` at the model muzzle for big guns, 35 % of small-gun flashes kept; cinematic re-cut 30 % on big shots; projectile camera tracks the newest round), `projectile_impact` → `effects.impact(pos, barrierDamage, hullDamage, radius, follow, damageType)`, `missile_intercepted` → small warhead impact, `ship_destroyed` capital → cinematic jump (`cine = {fromId, hold 4}`).
- Cameras: `subjectFor(ship)` (L405-415) → `CameraSubject {position, velocity, heading, size}`; `sideCentre(side)` (L417-426); `updateCamera(dt)` (L428-485): follow (selected/`followId`, default most valuable friendly), reaper (most valuable Reaper), cinematic (`pickCinematicShot` L487-497 when hold expires: prefers beaming ships 60 %, then big ships with targets; hold 5-9 s), projectile (newest/heaviest round, else a beaming Reaper); `rig.update(dt, {subject, cinematic, projectile, fleetCentre})`.
- `pick(x, y, w, h)` (L502-521) screen-space ship picking; `project(pos, w, h)` (L524-530) used by the overlay; `resize` (L532-535); `render()` (L537-540, `drawCalls = renderer.info.render.calls`); `dispose` (L542).

### 5.2 `effects.ts` — `class EffectsSystem` (pooled, render-only, own `Rng('fx')`)

Textures `flashTex/fireTex/smokeTex/blueTex/redTex` (L54-58, `radialTexture` L12-24). Pools: sprites (`getSprite/releaseSprite`, L133-151; `spark(pos, vel, life, startScale, endScale, tex, color)` L153-159, cap 900), instanced tracers (box 0.1×0.1×1, max 1024, L66-68, L105-111), beam cylinders with shared materials (Reaper core `0xfff0e0` / glow `0xff3010`, Thanix core `0xf0f8ff` / glow `0x4fa0ff`, L71-75), point-defence `LineSegments` (512, L78-81), instanced missile spheres (512, L84, L120-126), fresnel `shieldMat` shader + icosahedron shell (L86-95), debris geometries/material (L97-98), one reusable `flashLight` (L101).

API: `muzzleFlash(pos, dir, size, reaper=false)` (L164-166); `impact(pos, barrierDamage, hullDamage, targetRadiusUnits, targetPos: () => Vector3|undefined, damageType)` (L169-195: barrier shimmer shell when `barrierDamage > hullDamage` (≤60 shells, 0.3 s), hull sparks `2 + hullDamage/120` capped 10, smoke above 400, red texture for `reaper_beam`); `explosion(pos, lengthUnits, reaper, pieces=[], velocity)` → duration (L198-250: bursts, core flash, smoke, up to 40 debris fragments + the ship's own meshes, flash light when `size > 4`); `secondary(pos, size)` (L253-259); `setTracers(items, alpha, dt)` (L264-285: length `max(1.5, speed*0.06)*(big ? 1.3 : 0.7)`, width 1.1/0.45, colour fixed `0xffd080` — D11 wants blue-white MA tracers and faction colours); `setMissiles` (L287-299); `setBeams(beams)` (L302-340: core radius `0.09|0.05 × intensity`, glow ×3.2, impact bloom); `setPointDefence(lines)` (L342-361, Reaper red vs cyan); `update(dt)` (L363-428); `clear()` (L430-442). No HADES-specific effect exists; `impact` only distinguishes `damageType === 'reaper_beam'`.

### 5.3 `cameras.ts` — `class CameraRig`

`CameraMode = tactical|cinematic|follow|free|projectile|reaper|command` (L8), `CAMERA_MODE_LABELS` (L10-18, HUD buttons `data-camera`), `CameraSubject` (L20-25). State: `mode, yaw 0.6, pitch 0.55, distance 900, focus`, free-cam `freePos/freeYaw/freePitch` (L29-38), smoothing `desiredPos/desiredLook/currentLook/transition/shake` (L40-44). `PerspectiveCamera(50, aspect, 1, 600_000)` (L48) — FOV is fixed (a "long lens" needs `camera.fov` + `updateProjectionMatrix`). API: `setMode` (L53-64, starts a 0.9 s transition), `addShake` (L66), `orbit(dx, dy)` (L71-79, pitch clamp −0.1..1.5), `zoom(delta)` (L80-82, distance 6..60 000), `pan(dx, dy)` (L83-88), `freeMove(f, s, u, dt, fast)` (L89-94), `update(dt, {subject?, cinematic?, projectile?, fleetCentre})` (L101-176: tactical orbit, command top-down ≥1200, follow (behind/above by `size`), reaper (over the hood looking along heading), projectile (chase, instant), cinematic (two-subject framing from the side with sinusoidal drift, or single-subject slow orbit), free), `fallback` (L178-184), `apply(dt, instant)` (L186-203: exponential lerp `k = 1-exp(-dt*(transition ? 4 : 9))`, shake via `Math.random`, near plane `clamp(d*0.002, 0.2, 50)`), `resize` (L205-208). There are no dolly-path, crane, rack-focus, hold-with-micro-drift or hard-cut primitives (D5 vocabulary) — all of these are new code on top of `desiredPos/desiredLook` + `apply(instant=true)` for cuts.

### 5.4 LOD, materials, geometry, ships, environment

- `lod.ts`: `LodLevel` (L10), `DETAIL_MESH_NAMES = {windows, accent, engine, lights, seams, plates, eye}` (L13), `REDUCED_FACTOR 70`, `POINT_FACTOR 700` (× `lengthUnits`), `FIGHTER_POINT_DISTANCE 90`, `FIGHTER_REDUCED_DISTANCE 30` (L16-21), `lodLevel(distance, lengthUnits, role, enabled)` (L23-33). Unit-tested in `tests/lod.test.ts`.
- `materials.ts`: `FactionPalette {hull, hullDark, accent, engine, windows, glow}` (L8-15), `PALETTES` for alliance (L21), cerberus (L29), reaper (L37), asari (L45), salarian (L53), geth (L61), quarian (L69), turian (L77); `paletteFor(faction)` (L87, falls back to alliance), `ADDITIVE_WHITE` (L89). Mesh names used by LOD/tint/debris come from `assemble()` in `ships/alliance.ts:33-49` (`hull, hullDark, accent, engine, windows`) and from `buildReaper` (`hull, plates, arms, seams, eye, lights`).
- `geometry.ts`: `taperedBox` (L13), `wedge` (L33), `hexPrism` (L38), `zCylinder` (L47), `at/rot` (L54-60), `merge` (L62-77), `taperedTube` (L83-122), `latheBody` (L125-134), `plateStrip` (L137-147).
- `ships/index.ts`: `BUILDERS` (L14-47, 31 class ids = every entry of `SHIP_CLASSES`), template cache `getShipTemplate(classId)` (L52-61), `instantiateShip(classId)` (L63-70, deep-clones the group and copies `engineNodes`/`muzzle`), `hasModel` (L72), `MODELLED_CLASS_IDS` (L73). `BuiltShip {group, engineNodes[], lengthUnits, muzzle?, glowColor, glowScales?}` (`ships/types.ts:3-14`).
- Builders (file: function L → length in render units; the D12 silhouette test can use `new THREE.Box3().setFromObject(getShipTemplate(id).group)` headlessly):
  - `alliance.ts`: shared `engineBlock` (L15), `Parts`/`newParts` (L23-31), `assemble(parts, faction, engineNodes, lengthUnits, muzzle?, glowColor)` (L33-49); `buildAllianceDreadnought` L52 (8.88, muzzle `z = L/2+0.4`), `buildAllianceCarrier` L108 (9.0), `buildAllianceCruiser` L141 (5.2), `buildAllianceFrigate(normandy)` L182 (2.16 / 1.7), `buildAllianceFighter` L215 (0.36; fighters are modelled at ×2 scale, KNOWN_ISSUES).
  - `reaper.ts`: `buildReaper(opts {length, arms, armLengthFactor, bodyRadiusFactor, tint?, spines?})` L25-196 — ridged lathe body (L31-58), four plate shells + three hood shells (L61-102, mesh `plates`), tapered-tube arms spread over 243° with knuckles and red seams (L105-137), eye sphere + socket + iris at `z = 0.2L, y = -0.45R` (L139-153, mesh `eye`, muzzle L193), tail glow, optional spines, 24 running lights (L171-185); `lengthUnits = L*0.5 + armLen + L*0.1` (L192); `buildReaperCapital` L211 (`length 11, arms 6, armLengthFactor 0.8, bodyRadius 0.16` → lengthUnits 15.4), `buildReaperDestroyer` L214 (`0.95, 4 arms, 0.75` → 1.28), `buildHarbinger` L217 (`13.2, 6 arms, spines, tint 0xffa040` → 18.48).
  - `cerberus.ts`: `buildCerberusCruiser` L19 (5.6), `buildCerberusFrigate` L45 (1.8), `buildCerberusFighter` L64 (0.34), `buildCerberusDreadnought` L77 (9.0, AU Black Fleet). `turian.ts`: dreadnought L41 (9.5), cruiser L78 (5.6), frigate L107 (1.6), fighter L125 (0.34). `asari.ts`: cruiser L52 (5.0), dreadnought L66 (9.0), `buildDestinyAscension` L85 (16). `salarian.ts`: fighter L93 (0.36), `buildStgFrigate` L105 (1.5), cruiser L116 (5.2), dreadnought L129 (8.6). `geth.ts`: dreadnought L41 (11), cruiser L73 (5.2), frigate L93 (1.5), fighter L107 (0.32). `quarian.ts`: `buildQuarianLiveship` L23 (22), `buildQuarianHeavy` L50 (8.2), cruiser L73 (4.8), fighter L93 (0.36).
- `environment.ts`: `PLANET_STYLES` (L66-73: earth, palaven, thessia, rannoch, surkesh), `makePlanetTexture` (L75-130, value-noise canvas), `makeAtmosphere` (L152-165), `makeStarfield` (L167-210, 6000 points at r 180 000), `makeGalaxyBand` (L213-249), `makeCitadel` (L255-296, ring r 36 units, five wards), `EnvironmentBuild {group, sunDirection, skyObjects[], planet?, name}` (L298-305), `buildEnvironment(env)` (L312-399: Earth r 21 000 at `(0,-24500,6000)` with moon; Palaven/Thessia/Rannoch/Sur'Kesh variants; Citadel + Serpent Nebula haze; `relay`/`deep_space` empty; sun sprite L380-396). Requires a DOM canvas.
- `ui/overlay.ts` `TacticalOverlay` (L10): `draw(view, w, h, mode)` (L25-148) paints markers (diamond friendly / chevron hostile), bars, labels, target lines, the command grid and corner brackets on `#overlay-canvas`; `visible`, `hoverId`. A letterbox/caption layer (D5) can live either here or as DOM in `#ui`.

---

## 6. UI and app (`src/ui/`, `src/main.ts`, `src/core/storage.ts`, `src/audio/engine.ts`)

### 6.1 Bootstrap and screens

- `src/main.ts`: `new App()`, `window.reaperwar = app` (L11) — the e2e specs, `scripts/perf.mjs`, `scripts/screenshots.mjs` and `scripts/showcase.mjs` drive the game through `window.reaperwar.battle.sim.step()`, `.setCamera()`, `.toggleHud()`, `.view.rig.*`, `.show('menu')`.
- `index.html`: `#app > #battle-canvas, #overlay-canvas, #ui, #boot`; layering in `style.css:27-34` (`#overlay-canvas` and `#ui` are `pointer-events: none` with children re-enabled; `#boot` fades on `.hidden`).
- `ui/app.ts`: `ScreenName = menu|briefing|battle|results|comparison|codex|database|custom|timelines|settings|campaign|campaign_setup|postwar|saves` (L30). `App.show(screen, params?)` (L543-597) disposes a running battle when leaving `battle`, clears `#ui`, and renders one function per screen: `renderMenu`, `renderBriefing(app, {scenarioId?})`, `renderResults`, `renderComparison(app, {report?})`, `renderCodex`, `renderDatabase`, `renderCustom`, `renderTimelines(app, {editId?})`, `renderSettings`, `renderCampaignSetup`, `renderCampaign` (needs `app.campaign`), `renderPostWar` (needs `app.postwar`), `renderSaves(app, {saveCurrent?})`. A Showcase mode (D5) is a new `ScreenName` + `case` here plus a menu item.
- `App` fields (L459-472): `prefs`, `customTimelines`, `history` (last 50 `BattleResult`), `battle?: BattleController`, `lastBattle?: LastBattle {sim, result, config, comparison?, comparisonSide?, campaign?}` (L37-44), `screen`, `campaign?`, `postwar?`, `campaignResume`. `init()` (L487-496) loads `preferences`, `customTimelines`, `battleHistory` and shows the menu. Timeline helpers `allTimelines/getTimeline/currentRules/selectTimeline/saveCustomTimeline/deleteCustomTimeline` (L500-529); `savePrefs` (L531-535) also pushes audio settings. `startBattle(config, {replay?, comparison?, comparisonSide?, campaign?})` (L640-654) creates the `BattleController`, mounts `hud.root`, stores `lastScenarioId` unless `scenarioId === 'campaign'`. `finishBattle(comparison?, side?)` (L657-673) applies campaign results (`applyEngagementResult`) and appends to history unless replay. Campaign/post-war start/load/resume (L600-638; `resumeCampaign` runs `normaliseCampaign`). `toast(text)` (L675-680, `.toast`).
- Menu (`ui/screens/menu.ts`, `renderMenu` L5-58): `item(label, onClick, tag?, primary?)` (L8-23) creates `button.btn[data-menu=<label slug>]` where the slug is the label lower-cased with non-letters collapsed to `-`. Entries (L28-37): `new-galactic-campaign`, `quick-battle` (primary, opens the briefing on `prefs.lastScenarioId`), `custom-battle`, `alternate-timelines`, `canon-vs-au-comparison`, `fleet-database`, `codex`, `scenario-editor` (tag `VIA CUSTOM`, opens custom), `load-game` (tag `IN PROGRESS` when a campaign is loaded), `settings`. Footer shows `v${__APP_VERSION__} · timeline: <name>` (L41); `.menu-info` panel shows the active timeline with a `.badge.<category>` (L45-54). An item without `onClick` toasts `NOT YET IMPLEMENTED — SEE ROADMAP` (L18).

### 6.2 `BattleController` (`ui/app.ts:53-456`)

- `SPEEDS = [0.25, 0.5, 1, 2, 4, 8]` (L47), `speedIndex` starts at 2 (1×). Constructor (L75-99): `new BattleSimulation(config)`, `new BattleView(canvas, sim, prefs.graphics)`, `new TacticalOverlay(overlayCanvas)`, chains `sim.onEvent` so both the view queue and `pendingEvents`/`onSimEvent` receive every event (L87-92), `createHud`, `bindInput`, `requestAnimationFrame(loop)`, `audio.startAmbience()`.
- Public API used by HUD/scripts: `speed`, `playerFleetIds` (fleets with `playerControlled`, L105-107), `setSpeed(i)` (L109), `togglePause()` (L113), `setCamera(mode)` (L117), `toggleHud()` (L121-125, toggles `.hud.hidden` and the overlay), `order(patch, fleetId?)` (L128-135, toasts `ORDER: …`/`FORMATION: …`), `attackWithSelection(targetId)` (L138-148, toast `ATTACK: <name>`), `select(id, additive)` (L150-158), `selectFleet()` (L160-164), `focusOn(id)` (L166-171), `resize()` (L439-444), `dispose()` (L446-455), `isReplay`, `campaignLink`.
- `onSimEvent(e)` (L173-215): audio hooks with distance attenuation (`weapon_fired` by kind and gun size ≥ 600 → `ma_large`; impacts; explosions; `reinforcement_arrival` → `alert` + toast `REINFORCEMENTS DETECTED`; `battle_end` → `ended`).
- `loop(now)` (L217-254): `dtReal = min(0.1, elapsed)`; `accumulator += dtReal*speed`; steps the sim while `accumulator >= SIM_DT` with a **40 ms wall-clock budget per frame** (on overrun the accumulator is clamped to one step, so slow machines slow down); `alpha = paused ? 1 : accumulator/SIM_DT`; `view.update(dtReal, alpha)`, `view.render()`, `overlay.draw(view, w, h, mode)`, `hud.tick(dtReal, pendingEvents)` every frame, `hud.refresh()` every 0.25 s, `hud.showEnd(result)` once. A fixed-timestep **Record** mode (D5) replaces `dtReal` with `1/60` and steps the sim by exactly `speed/60` seconds per frame (e.g. one `SIM_DT` every 3 frames at 1×) instead of wall time.
- Input (L256-431): drag orbit (left/right), middle-drag pan, wheel zoom, double-click focus, right-click enemy = attack / ally = follow, two-finger pinch zoom + pan; keys `space` pause, `] + =` faster, `[ -` slower, `h` HUD, `1-7` camera modes in `CAMERA_MODE_LABELS` order, `tab` select fleet, `escape` pause menu; ignored while focus is in an input/select/textarea (L379).

### 6.3 HUD (`ui/screens/hud.ts`, `createHud(app, ctrl)` L38-386)

Layout `.hud > .hud-top, .hud-left, .hud-right, .hud-bottom, .subtitle, toastHost, menuOverlay` (L124-128; CSS `style.css:111-151`). Stable controls built once (L274-281): `button[data-action="pause"]`, `button[data-speed="<n>"]` per `SPEEDS`, `button[data-camera="<mode>"]`; orders `button[data-order="<OrderType>"]` for `attack, advance, hold_formation, defend_position, withdraw, retreat` (`ORDERS` L22-29, L83) plus `Fighters` (toggles `fightersDeployed`), `Focus fire`, `Protect capitals`, `PD: missiles` (L66-84); `formationSel` is the first `<select>` in the HUD and `prioritySel` (`PRIORITIES` L30-36) the second (L53-64; the e2e test uses `select >> nth=0`). Top bar: battle name + `.badge.<category>` (`CANON`/`AU`, L93), `.hud-clock` (time, speed, `REPLAY`, seed, draw calls; L314), `statusLine`, `button[data-action="toggle-panels"]` (phone layout, L97), timeline panel `.hud-timeline`, `button[data-action="menu"]` (L101). Lists: `.ship-list .ship-row[data-ship=<id>]` keyed and updated in place (L177-209), fighters line; `.target-panel` stats incl. torpedoes and PD readiness (L221-270) with `Follow`, `Fleet: attack this`, `Reaper view` buttons; `.intel` Reaper assessment (L301-310); `.comms` lines + `.subtitle` when `prefs.subtitles` (L325-343); `toast` (L347-353, `.toast`); `showEnd(result)` (L355-371) adds a banner with `.result-banner.<outcome>` and `button[data-action="results"]` → `app.finishBattle`. Pause menu (L127-172): Resume, `Restart (same seed)` (`app.startBattle(config, {replay: true})`), Hide/Show HUD, overlay toggle, audio mute, `View results`/`Abandon battle`, `Main menu`. `setComparison(report, side)` stores the comparison link for `finishBattle`.

### 6.4 Other screens (selectors matter for the e2e suite, §9.3)

- Briefing (`briefing.ts` L6-114): scenario buttons (all `SCENARIOS` except `custom`; `auOnly` ones show an `AU` tag and switch the timeline to `recommendedRules[0]`, L38-46), timeline `<select>` (L48-51), world-state selects (L53-62), seed `input[type="number"]` (L86 — the first number input on the page, which the e2e fills), orders of battle (L28-36), `button[data-action="launch"]` (L101-106).
- Results (`results.ts` L6-72): `.result-banner.<outcome>`, summary line `.screen-body p.dim` (first one; e2e compares it across replays), AU warning when `rules.category !== 'canon'` (L44), two `sideTable`s, destruction log, Reaper assessment, `button[data-action="replay"]` (L57), `Re-run with new seed` (hidden for campaign battles, L58), `Back to comparison` (L59), `button[data-action="return-campaign"]` (L60), `Export event log` (JSON of `{result, events}`, L62-68).
- Comparison (`comparison.ts` L7-88): defaults scenario `alliance_fleet_engagement`, side B `prime_apex` (or the active non-canon timeline), seed 7, fixed fleets; `button[data-action="run-comparison"]` (L43), `.compare-table` (L62), `button[data-action="watch-a"|"watch-b"]` (L67-68, replay with `comparison` link), explanation panel and timeline-B history.
- Timelines (`timelines.ts` L28-224): `button[data-timeline=<id>]` list (L35-40), `TECH_LABELS` tooltips (L7-26), read-only/editable tech tables (L42-58), `specialPanel` (L60-95), `fleetPanel` (L97-103); actions `button[data-action="select-timeline"]` (L167), `Edit`/`Delete` (saved customs only, L172-180), `button[data-action="save-timeline"]` (L181-191, validates via the schema), `Cancel`, `Export JSON` (L196-202); `New custom timeline`, `Duplicate selected & edit`, `Import JSON…` (L116-146; imported ids become `custom_<base36 time>`, category forced `custom`). Canon shows a green "all multipliers are 1" note, everything else an orange "Alternate universe. Never presented as canon." line (L165).
- Codex (`codex.ts` L5-43): `button[data-entry=<id>]` per entry grouped by `CODEX_CATEGORIES`; shows `canon` / `estimate` blocks and an `AU — <timeline>` block only when `entry.au[rules.id]` or `entry.auDynamic(rules)` yields lines (L13-19); under canon it lists the timelines in which the entry changes (L20). `CodexEntry` (`codex/entries.ts:8-18`), `CODEX` (L20-314), `CODEX_CATEGORIES` (L316).
- Database (`database.ts` L9-88): `button[data-class=<classId>]` per class grouped by faction; `statRow(label, Sourced, effective, unit)` with provenance badge and AU highlight (L15-22); armament table with `substitutedFrom`, `beamDuration`, `armourBypass` (L48-63); point value note (L65).
- Settings (`settings.ts` L5-102): graphics quality (`pixelRatioCap` 2/1.5/1), engine glow, LOD, overlay; audio mute/master/sfx/ambience, subtitles; save data export (`storage.exportAll()`), import (`storage.importAll` then `app.init()`), clear (sets `preferences`→undefined, `customTimelines`→[], `battleHistory`→[], `customBattle`→undefined, then reloads; campaign/postwar/slots are **not** cleared, L82-89); battle history list.
- Saves (`saves.ts` L13-108): rows `[data-slot=<id>]` with `button[data-action="load-autosave-campaign"|"load-autosave-postwar"|"load-slot"|"rename-slot"|"delete-slot"]`, save form `input[data-field="slot-name"]` + `button[data-action="save-slot"]` when opened with `{saveCurrent: 'campaign'|'postwar'}`.
- Campaign (`campaign.ts`): `renderCampaign` L19-480 — `.galaxy-map` canvas 1200×760 (L24), status bar with `button[data-action="end-turn"]` (L205), `+4 weeks`, `Save`, `button[data-action="save-slot-screen"]` (L211), `Menu`; system panel with `.ship-row[data-fleet=<id>]` rows and `button[data-action="move-here"]` (L248); fleet panel (posture select); research panel `select[data-field="research"]` (L297); war log; modals: outcome (post-war continuation only for `cerberus_ascendant` victories, L333), summit `button[data-action="summit-choice"][data-choice=<id>]` (L351), engagement `button[data-action="fight-3d"|"auto-resolve"|"withdraw"]` (L379-390). `renderCampaignSetup` L483-540 — timeline select, strategic summary (Crucible available/unavailable from `crucibleAvailable && catalystOperational`, L501), seed, world-state selects for `ascension, rachni, rannoch, genophage`, `select[data-field="crucible"]` only when the Crucible is available (L514-516, else "No Crucible in this timeline"), `button[data-action="start-postwar"]` (L530) and `button[data-action="start-campaign"]` (L534).
- Post-war (`postwar.ts` L7-137): `.hud-clock` date, `button[data-action="end-quarter"]`, `+1 year`, `button[data-action="save-slot-screen"]`, `button[data-action="dismantle"]`, `input[data-programme=<id>]` sliders.
- `ui/dom.ts`: `el(tag, attrs, children)` (L4-17: `class`, `style` object, `on*` listeners, `html`, else property or attribute), `append` (L19), `setChildren` (L30), `clear` (L34), `fmtTime` (L38), `fmtNum` (L44), `provenanceBadge` (L46-50).

### 6.5 Preferences, storage keys, audio

- `core/storage.ts`: `Preferences {graphics: GraphicsSettings, audio: AudioSettings, subtitles, lastTimelineId, lastScenarioId, showOverlay}` (L10-17); `DEFAULT_PREFERENCES` (L33-40: quality high, glow on, pixelRatioCap 2, lod true; audio 0.8/0.9/0.5 unmuted; subtitles true; `canon_me3`; `battle_of_earth`; overlay true). `Storage` (L60-169): memory cache + `localStorage` (`reaperwar:<key>`) + IndexedDB `reaperwar/kv`; `get(key, fallback)`, `set(key, value)`, `exportAll()` → `SaveData` (L19-31), `importAll(data)`. **Keys**: `preferences`, `customTimelines`, `battleHistory`, `customBattle`, `campaign` (autosave), `postwar` (autosave), `saveSlots` (index of `SaveSlotMeta`), `slot:<id>` (slot payload). `core/saves.ts`: `SaveKind` (L11), `SaveSlotMeta {id, name, kind, savedAt, turn, rulesName, summary}` (L13-22), `describeSave(kind, state)` (L27-36, `rulesName = c.rules.name` for campaigns — pinned by `tests/saves.test.ts:45`), `SaveSlots.list/save/load/rename/remove` (L38-78), singleton `saveSlots` (L80).
- `audio/engine.ts`: `SoundId` (L6-20: `ui_click, ui_hover, ui_confirm, alert, ma_small, ma_large, thanix, reaper_beam, impact_barrier, impact_hull, explosion_small, explosion_large, gardian, torpedo`), `AudioSettings` (L22-27), `AudioEngine.init()` (user gesture, L47-70), `applySettings` (L72), `play(id, distanceKm, intensity)` (L120-218, ≤10 one-shots per 100 ms, per-id minimum gaps), `startAmbience` (L221-265); singleton `audio` (L268). New sounds (HADES detonation, drive flare) are new `SoundId` cases plus hooks in `BattleController.onSimEvent`.

---

## 7. Campaign hooks that touch `prime_apex` / Crucible / Cerberus flags

### 7.1 `src/campaign/engine.ts`

- `CAMPAIGN_VERSION = 2` (L22), `MAX_SHIPS_PER_SIDE = 70` (L23). `PRODUCTION` tables (L26-58; Cerberus and geth build no dreadnoughts), `DEFENCE_CLASSES` (L61-69), `fleetPoints` (L71), `fleetShipCount` (L74), `scaleCounts` (L76-80).
- `createCampaign({seed, rules, name?, worldState})` (L93-187): `cerberusAllied = cerberusStance ∈ {cooperative, controls_reapers}` (L97) decides Omega's controller (L103) and the allegiance/posture of the two Cerberus groups (L158-159); **`cerberus_dreadnought: rules.id === 'prime_apex' ? 2 : 0`** on the Omega group (L159) — the only place besides `scenarios/index.ts:349` that keys on the preset id; Harbinger spawns with the harvest fleet iff `strategic.harbingerOperational` (L161); `crucible.available = strategic.crucibleAvailable && strategic.catalystOperational && ws.crucible !== 'refuse'` (L175); `reaper.competence/reinforcementPool = round(6 × reaperReinforcements)` (L176); opening log text depends on `ws.crucible === 'refuse'` (L181); the `rules` object is deep-copied into the state (L168) and the Normandy is added only when `shepardAlive` (L142).
- `buildEngagement(state, pending)` (L245-310): seeded per `(seed, tick, system)` (L248); scales each side to the 70-ship cap (L253-254); allied fleets carry `techOverride = {...researchTech(state), crewQuality: 0.7+0.3*readiness}` (L256-259); orbital defence group with `initialOrder {order: 'defend_position'}` (L274-282); Reaper fleets arrive at `20*i` s (L293); `scenarioId 'campaign'`, `maxDuration 420`, `worldState {…state.worldState, campaignSystem, alliedFactions}` (L298-309).
- `applyEngagementResult(state, pending, result)` (L313-377), `autoResolve` (L380-386), `detectEngagement` (L388-401; hostile Cerberus fleets are enemies when no Reapers are present), `reaperAi` (L405-442, risk uses `competence`), `alliedAi` (L444-481, hostile Cerberus raids L473-480), `advanceTick(state, {interactive})` (L496-511), `withdrawFromEngagement` (L514-528), `preservationWithdrawals` (L531-558; `techFactor = MA damage × barriers × armour × (hyperMA ? 2 : 1) × (hades ? 1.5 : 1)`, L546), `resolvePhase` (L561-576), `decideSummit` (L579-582), `economyPhase` (L584-680; production multiplier uses `fleetStrength[f]` L625; Reaper reinforcements every 6 weeks L657-662; **Crucible progress only when `crucible.available`** L664-672), `checkOutcome` (L682-718): Crucible victory when complete and the Citadel is clear (L688-697); **conventional victory when `reaperFleetValue === 0 && reinforcementPool === 0`** with reason `'Every Reaper … destroyed by conventional force. The Refuse is successful.'` if `conventionalVictoryPossible` else `'The committed Reaper fleets have been destroyed.'` (L699-703); defeat when Earth and Palaven are both below 12 % population or allied value < 200 after week 4 (L705-711); week-160 judgement (L712-717). `campaignReaperAssessment` (L721-740).
- `src/campaign/depth.ts`: `RESEARCH_PROJECTS` (L25-34), `researchTech(state)` (L67-79; completed projects multiply `rules.organic[k]` and are applied as **absolute** per-faction overrides, so they replace any `factionOverrides[faction][k]` of the preset), `crucibleRateModifier` (L166-167), `normaliseCampaign(state)` (L275-284, migration point for old saves), `politicalPhase` (L214-270, summit every 12 weeks, krogan muster, indoctrinated officials, sabotage, Aria, STG). `src/campaign/state.ts`: `CampaignState` (L77-107) with `rules: RuleSet` snapshot (L83) and `worldState` (L105). `src/campaign/postwar.ts` is only reachable for `cerberus_ascendant` (`ui/screens/campaign.ts:333, 530-533`).
- Campaign-setup UI: Crucible row and the `use/refuse` select are shown only when `crucibleAvailable && catalystOperational` (`ui/screens/campaign.ts:501, 514-516`). With D1 (`prime_apex.crucibleAvailable = false`) the Apex campaign shows "No Crucible in this timeline" and the `crucible: 'refuse'` world state becomes moot (but harmless: `ws.crucible !== 'refuse'` is still evaluated).

### 7.2 Test expectations to keep green while changing the preset (`tests/campaign.test.ts`, `tests/saves.test.ts`, e2e)

| Test | Lines | What it asserts about the AU/Crucible state |
| --- | --- | --- |
| `creates a canon campaign with the invasion already in batarian space` | 25-36 | canon: `crucible.available === true`, Cerberus allegiance `'cerberus'`; `cerberus_reformed`: Cerberus `'allied'` |
| `canon campaigns end in defeat or a Crucible decision; Prime/Apex can win conventionally` | 101-109 | canon seed 5 reaches some outcome ≤ week 160; **`prime_apex` seed 5 reaches `victory` ≤ week 160** and `reaperFleetValue(apex) < reaperFleetValue(canon) + 1`. With no Crucible (D1) the Apex victory must come from `reaperFleetValue === 0 && reinforcementPool === 0` (AU_RULES reference: ~week 38 with Crucible refused), so any recalibration of Apex strength must still annihilate the Reapers in 160 weeks |
| `timelines without a Crucible cannot win through it` | 111-116 | `cerberus_ascendant`: `crucible.available false`, progress stays 0 |
| `refusing the Crucible forces a conventional outcome; Prime/Apex can still win that way` | 118-125 | `prime_apex` + `{crucible: 'refuse'}`: `available false`, `victory` ≤ 160 weeks, reason matches `/conventional\|Refuse/` (requires `conventionalVictoryPossible` to stay `true`; the other branch's text has neither word), `reaperFleetValue === 0` |
| `research completes projects…` | 156-168 | `techOverride.kineticBarrierStrength ≈ rules.organic.kineticBarrierStrength × 1.15` on the Fifth Fleet (unaffected by Apex values) |
| `tests/saves.test.ts` `overwrites a slot by id and describes saves` | 34-46 | **`describeSave('campaign', st).rulesName === 'Prime/Apex — Successful Refuse'`** — renaming the preset (D1 "Apex core") requires updating this literal |
| `tests/timelines.test.ts` AU isolation | 56-72 | `PRIME_APEX.strategic.shepardAlive true`, `cerberusStance 'cooperative'`, `catalystOperational true`; Prime/Apex Reaper tech all 1 |
| `tests/battle.test.ts` `Prime/Apex rules: the same fleets defeat the Reapers, at a cost` | 61-69 | seeds 7 and 8 on the reference engagement with fixed fleets: winner `A`, **every** Reaper destroyed, at least one Alliance loss |
| `tests/battle.test.ts` `Reaper intelligence assessment…` | 71-81 | Apex threat `SEVERE`/`CRITICAL`, more capital losses than canon (seed 7) |
| `tests/ammo.test.ts` determinism | 66-73 | `prime_apex` seed 8 runs identically twice |
| `tests/salarian.test.ts` Sur'Kesh | 24-32 | `prime_apex` destroys more Reapers than canon (seed 5, early warning) |
| `e2e/game.spec.ts` screens test | 113-118 | clicks `[data-timeline="prime_apex"]`, expects `.screen-body` to contain **`Homeworld Defence Rule`** (currently from `historyChanges`/description), selects it, expects `.menu-info` to contain **`Prime/Apex`** (the preset *name*) |
| `e2e/game.spec.ts` comparison test | 94-103 | `.compare-table` contains both `DEFEAT` and `VICTORY` (canon loses, Apex wins the reference engagement, seed 7) and the text `Hyper-mass accelerators` is visible |

`AU_RULES.md:24` and `README.md:31` describe the preset by its current name and list; `CHANGELOG.md` is append-only.

Note on how campaign engagements are decided: `autoResolve(state, pending)` (`engine.ts:380-386`) builds the engagement with `buildEngagement` and runs the **real** `BattleSimulation` to completion, then `applyEngagementResult`. Only `preservationWithdrawals` (L531-558) uses a formula (`techFactor`, L546). So every campaign test that advances weeks until an outcome is also a battle-balance test (see §9.3).

---

## 8. Current balance numbers

### 8.1 Battlespace scale: exactly what is multiplied by `S`

- `BATTLESPACE_SCALE = 0.4` (`src/simulation/constants.ts:9`). It is imported only by `simulation/battle.ts:28` (as `S`), `simulation/ai.ts:6` (as `S`) and `simulation/formations.ts:4`. Nothing in `data/`, `timelines/`, `scenarios/`, `rendering/` or `ui/` scales anything: the catalogue, `applyRulesToWeapon`, the Fleet Database (`ui/screens/database.ts:59` prints `w.range` straight from `applyRulesToWeapon`) and the custom-battle distance slider all speak **nominal** km.
- Scaled once, at ship creation (`battle.ts:182`): `def.range *= S`, `def.projectileSpeed *= S`, so `WeaponState.def` holds **scaled** values (a 42 km / 30 km·s⁻¹ dreadnought gun becomes 16.8 km / 12 km·s⁻¹; flight time to maximum range is unchanged, 1.4 s). `battle.ts:225-228`: `maxSpeed`, `acceleration`, `sensorRange` × S; `turnRate` deg→rad, not scaled. `lengthKm = lengthM/1000` (L201) and `radiusKm = max(0.02, lengthKm/2)` (L216) are **not** scaled: hit spheres keep true size inside a 0.4× battlespace, so projectile collisions are relatively more generous than nominal.
- Positions: `deployFleet` L106-107 (`initialOrder.position`, `anchor = spec.position * S`), `issueOrders` L287 (`patch.position * S`), fighter launch slot L469. Formation slots use `k = max(S, 0.55) = 0.55` (`formations.ts:47`, and `capSpacing` L58), so formations are compressed less than ranges.
- Rule distances: escape at `110*S` = 44 km, retreat escape `80*S` = 32 km (`battle.ts:905, 915`); AI anchor step `50*S` (`ai.ts:185`), withdraw offset `60*S` (L198-199), `maxLag = 12*S` (L225), run-away `40*S` (L285).
- `hitProbability(shooter, target, weapon, dist, closingSpeed)` is called with sim-km `dist` and the scaled `def` (`battle.ts:676`), so `dist/range` is scale-free. `tests/damage.test.ts` uses the unscaled weapon from `applyRulesToWeapon` with a nominal `dist = 10`; both are consistent.
- Geometry that follows: the Reaper capital beam (44 → 17.6 sim km) out-ranges every organic gun except `ascension_main` (48 → 19.2) and ties the 44 km dreadnought guns (asari, salarian, geth, `apex_hyper_ma`); the destroyer beam (30 → 12 sim km) is out-ranged by every cruiser main (36-40).

### 8.2 Ship classes (`src/data/ships.ts`; 31 classes, the same set as `BUILDERS`)

Columns: hull / armour / barriers / regen (per s); speed km·s⁻¹ / accel km·s⁻² / turn °·s⁻¹ / sensors km (nominal); sig = `signature`; ecm; crew = `crewQuality`; pts = `pointValue`. Every numeric stat is `estimate(...)` (SIMULATION_ESTIMATE) except the lengths marked ᶜ (`canon`) or ⁱ (`inferred`). Design provenance: ᴰᶜ canon, ᴰⁱ inferred, ᴰᵉ estimate. Hardpoints are `weaponId×count`, broadsides as `port+starboard` (facing ±90°, arc 120°); offsets are metres along x right / y up / z forward (`data/types.ts:68-76`).

| class (lines) | faction · role | len m | hull | arm | barr | regen | spd | acc | turn | sens | sig | ecm | crew | pts | hardpoints | hangar |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alliance_fighter` ᴰᶜ (13-39) | alliance · fighter | 18 | 30 | 2 | 25 | 4 | 3.4 | 1.4 | 90 | 30 | 0.06 | 0.1 | 1.0 | 4 | `fighter_gun`×2, `fighter_torpedo`×1 | |
| `alliance_frigate` ᴰⁱ (40-68) | alliance · frigate | 170ⁱ | 520 | 12 | 450 | 14 | 1.4 | 0.32 | 22 | 60 | 0.35 | 0.2 | 1.0 | 20 | `alliance_frigate_main`×1, `disruptor_torpedo`×2, `gardian`×2 | |
| `alliance_frigate_thanix` ᴰᶜ (69-96) | alliance · frigate | 216ⁱ | 700 | 14 | 520 | 16 | 1.6 | 0.4 | 26 | 80 | 0.3 | 0.6 | 1.3 | 32 | `alliance_thanix`×1, `disruptor_torpedo`×2, `gardian`×2 | |
| `alliance_cruiser` ᴰⁱ (97-126) | alliance · cruiser | 520 | 2400 | 45 | 1600 | 28 | 0.9 | 0.16 | 9 | 70 | 1.0 | 0.15 | 1.0 | 80 | `alliance_cruiser_main`×1, `alliance_broadside` 2+2, `gardian`×4 | |
| `alliance_dreadnought` ᴰᶜ (127-157) | alliance · dreadnought | 888ⁱ | 9000 | 130 | 5200 | 55 | 0.65 | 0.09 | 4.5 | 90 | 1.9 | 0.15 | 1.05 | 320 | `alliance_dn_main`×1 (z 420), `alliance_broadside` 4+4, `gardian`×8 | |
| `alliance_carrier` ᴰᶜ (158-187) | alliance · carrier | 900 | 7000 | 90 | 3800 | 45 | 0.6 | 0.08 | 4 | 100 | 1.9 | 0.2 | 1.0 | 300 | `alliance_broadside` 3+3, `gardian`×10 | `alliance_fighter`×24 |
| `turian_fighter` ᴰⁱ (190-215) | turian · fighter | 17 | 32 | 2 | 24 | 4 | 3.5 | 1.5 | 95 | 30 | 0.06 | 0.1 | 1.1 | 4 | `fighter_gun`×2, `fighter_torpedo`×1 | |
| `turian_frigate` ᴰⁱ (216-242) | turian · frigate | 160 | 560 | 16 | 420 | 14 | 1.35 | 0.32 | 22 | 60 | 0.33 | 0.15 | 1.1 | 20 | `alliance_frigate_main`×1, `disruptor_torpedo`×2, `gardian`×2 | |
| `turian_cruiser` ᴰⁱ (243-270) | turian · cruiser | 560 | 2600 | 55 | 1500 | 26 | 0.88 | 0.16 | 9 | 70 | 1.0 | 0.12 | 1.1 | 84 | `turian_cruiser_main`×1, `alliance_broadside` 2+2, `gardian`×4 | |
| `turian_dreadnought` ᴰⁱ (271-298) | turian · dreadnought | 950 | 9500 | 150 | 5000 | 55 | 0.62 | 0.09 | 4.5 | 90 | 1.9 | 0.12 | 1.15 | 330 | `turian_dn_main`×1, `alliance_broadside` 4+4, `gardian`×8 | |
| `salarian_fighter` ᴰⁱ (301-326) | salarian · fighter | 18 | 28 | 1 | 26 | 5 | 3.7 | 1.6 | 100 | 36 | 0.05 | 0.2 | 1.1 | 4 | `fighter_gun`×2, `fighter_torpedo`×1 | |
| `salarian_frigate` ᴰⁱ (327-353) | salarian · frigate | 150 | 480 | 12 | 460 | 16 | 1.45 | 0.36 | 24 | 90 | 0.12 | 0.5 | 1.15 | 24 | `stg_frigate_main`×1, `disruptor_torpedo`×2, `gardian`×2 | |
| `salarian_cruiser` ᴰⁱ (354-382) | salarian · cruiser | 520 | 2300 | 40 | 1900 | 32 | 0.98 | 0.19 | 10 | 95 | 0.85 | 0.4 | 1.1 | 90 | `salarian_cruiser_main`×1, `alliance_broadside` 2+2, `gardian`×4 | `salarian_fighter`×4 |
| `salarian_dreadnought` ᴰⁱ (383-410) | salarian · dreadnought | 860 | 8200 | 105 | 5800 | 60 | 0.68 | 0.1 | 5.5 | 120 | 1.8 | 0.4 | 1.1 | 335 | `salarian_dn_main`×1, `alliance_broadside` 4+4, `gardian`×8 | |
| `asari_cruiser` ᴰⁱ (413-440) | asari · cruiser | 500 | 2200 | 35 | 2200 | 36 | 0.95 | 0.18 | 10 | 80 | 0.95 | 0.25 | 1.05 | 86 | `asari_cruiser_main`×1, `alliance_broadside` 2+2, `gardian`×4 | |
| `asari_dreadnought` ᴰⁱ (441-468) | asari · dreadnought | 900 | 8500 | 110 | 6800 | 70 | 0.66 | 0.1 | 5 | 100 | 1.9 | 0.25 | 1.05 | 340 | `asari_dn_main`×1, `alliance_broadside` 4+4, `gardian`×8 | |
| `destiny_ascension` ᴰᶜ (469-496) | asari · dreadnought | 1600ⁱ | 20000 | 200 | 14000 | 120 | 0.55 | 0.08 | 3.5 | 120 | 2.8 | 0.25 | 1.2 | 1100 | `ascension_main`×1 (z 740), `alliance_broadside` 6+6, `gardian`×12 | |
| `cerberus_fighter` ᴰⁱ (499-524) | cerberus · fighter | 17 | 30 | 2 | 28 | 5 | 3.5 | 1.5 | 92 | 32 | 0.06 | 0.15 | 1.0 | 4 | `fighter_gun`×2, `fighter_torpedo`×1 | |
| `cerberus_frigate` ᴰⁱ (525-551) | cerberus · frigate | 180 | 600 | 14 | 520 | 16 | 1.5 | 0.36 | 24 | 70 | 0.33 | 0.35 | 1.05 | 24 | `cerberus_frigate_main`×1, `disruptor_torpedo`×2, `gardian`×2 | |
| `cerberus_cruiser` ᴰⁱ (552-579) | cerberus · cruiser | 560 | 2500 | 48 | 1900 | 30 | 0.92 | 0.17 | 9.5 | 80 | 1.0 | 0.3 | 1.05 | 86 | `cerberus_cruiser_main`×1, `alliance_broadside` 2+2, `gardian`×4 | |
| `cerberus_dreadnought` ᴰᵉ (580-607) | cerberus · dreadnought | 900 | 8800 | 125 | 5400 | 60 | 0.65 | 0.09 | 4.5 | 100 | 1.9 | 0.3 | 1.05 | 320 | `alliance_dn_main`×1, `alliance_broadside` 4+4, `gardian`×8 | |
| `geth_fighter` ᴰⁱ (610-635) | geth · fighter | 16 | 28 | 2 | 30 | 6 | 3.8 | 1.7 | 110 | 34 | 0.05 | 0.1 | 1.2 | 4 | `fighter_gun`×2, `fighter_torpedo`×1 | |
| `geth_frigate` ᴰⁱ (636-662) | geth · frigate | 150 | 500 | 14 | 520 | 18 | 1.5 | 0.38 | 26 | 70 | 0.3 | 0.2 | 1.2 | 22 | `alliance_frigate_main`×1, `disruptor_torpedo`×2, `gardian`×2 | |
| `geth_cruiser` ᴰⁱ (663-690) | geth · cruiser | 520 | 2400 | 45 | 1900 | 34 | 0.95 | 0.18 | 10 | 80 | 1.0 | 0.2 | 1.2 | 86 | `geth_cruiser_main`×1, `alliance_broadside` 2+2, `gardian`×4 | |
| `geth_dreadnought` ᴰᶜ (691-719) | geth · dreadnought | 1100ⁱ | 10500 | 140 | 5800 | 65 | 0.62 | 0.09 | 4.5 | 110 | 2.0 | 0.2 | 1.25 | 360 | `geth_dn_main`×1 (z 520), `alliance_broadside` 4+4, `gardian`×8 | `geth_fighter`×12 |
| `quarian_fighter` ᴰⁱ (722-747) | quarian · fighter | 18 | 30 | 2 | 22 | 4 | 3.3 | 1.4 | 88 | 30 | 0.06 | 0.1 | 1.05 | 4 | `fighter_gun`×2, `fighter_torpedo`×1 | |
| `quarian_cruiser` ᴰⁱ (748-775) | quarian · cruiser | 480 | 2200 | 40 | 1500 | 26 | 0.85 | 0.15 | 9 | 70 | 1.0 | 0.1 | 1.0 | 76 | `alliance_cruiser_main`×1, `alliance_broadside` 2+2, `gardian`×4 | |
| `quarian_heavy` ᴰⁱ (776-803) | quarian · dreadnought | 820 | 7800 | 100 | 4200 | 48 | 0.58 | 0.08 | 4 | 80 | 1.9 | 0.1 | 1.0 | 260 | `quarian_heavy_main`×1, `alliance_broadside` 3+3, `gardian`×6 | |
| `quarian_liveship` ᴰᶜ (804-829) | quarian · carrier | 2200ⁱ | 14000 | 60 | 3000 | 30 | 0.4 | 0.05 | 2.5 | 60 | 3.4 | 0.05 | 0.9 | 400 | `gardian`×10 | `quarian_fighter`×16 |
| `reaper_destroyer` ᴰᶜ (832-857) | reaper · reaper_destroyer | 160ᶜ | 3200 | 160 | 6500 | 80 | 1.6 | 0.4 | 16 | 120 | 0.4 | 0.3 | 1.2 | 260 | `reaper_destroyer_beam`×1 (z 60, y −10), `reaper_point_defence`×3 | |
| `reaper_capital` ᴰᶜ (858-885) | reaper · reaper_capital | 2000ᶜ | 32000 | 320 | 42000 | 240 | 0.8 | 0.14 | 6 | 160 | 3.2 | 0.35 | 1.3 | 2600 | `reaper_capital_beam`×1 + ×1 (two hardpoints, z 300, y −40), `reaper_point_defence`×8 | |
| `harbinger` ᴰᶜ (886-913) | reaper · reaper_capital | 2400ⁱ | 44000 | 380 | 58000 | 300 | 0.75 | 0.13 | 5 | 200 | 3.6 | 0.4 | 1.5 | 4000 | `reaper_capital_beam`×3 (z 360), `reaper_point_defence`×10 | |

Observations for the Apex work: `cerberus_dreadnought` is AU-only by its own description but its `designProvenance` is `estimate(...)` — the Database badge reads SIMULATION_ESTIMATE, not AU (D1 should make it `AU_MODIFIED`). Carriers are the only classes with `fighterComplement`; no Reaper class has one (D4 Oculus). `quarian_heavy` has role `dreadnought`, so it receives the hyper-MA substitution and counts as a capital. Only `reaper_destroyer`/`reaper_capital` lengths are `canon`; every pool value in the game is an estimate (LORE_REFERENCE.md §Simulation estimates).

### 8.3 Weapons (`src/data/weapons.ts`; 26 entries)

Columns: dmg = `damage` (per shot; **per second** for `thanix`/`reaper_beam`, applied in `SIM_DT` chunks — see 8.5), cd = `cooldown` s, range km / speed km·s⁻¹ (nominal; ∞ = hitscan), acc = `accuracy`, pen = `penetration`, heat per shot, arc °, flags: S = `antiSmall`, C = `antiCapital`. Provenance: ᶜ canon, ⁱ inferred, ᵉ estimate, ᴬ AU_MODIFIED.

| weapon (lines) | kind / damageType | dmg | cd | range | speed | acc | pen | heat | extra | arc | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alliance_dn_main` ᶜ (26-45) | mass_accelerator / kinetic | 1000 | 4.0 | 42 | 30 | 0.72 | 0.85 | 18 | | 12 | C |
| `alliance_broadside` ⁱ (46-65) | mass_accelerator / kinetic | 140 | 1.6 | 28 | 24 | 0.62 | 0.5 | 6 | | 120 | |
| `alliance_cruiser_main` ⁱ (66-85) | mass_accelerator / kinetic | 320 | 3.0 | 36 | 26 | 0.68 | 0.7 | 14 | | 15 | C |
| `alliance_frigate_main` ⁱ (86-105) | mass_accelerator / kinetic | 70 | 1.5 | 24 | 22 | 0.7 | 0.45 | 7 | | 30 | |
| `disruptor_torpedo` ᶜ (106-127) | disruptor_torpedo / warhead | 260 | 9.0 | 18 | 2.2 | 0.9 | 0.9 | 4 | `missileHp` 12, `magazine` 8 | 180 | C |
| `gardian` ᶜ (128-148) | gardian / laser | 14 | 0.35 | 6 | ∞ | 0.55 | 0.2 | 2 | `burst` 10 shots / 4 s | 360 | S |
| `alliance_thanix` ᶜ (149-169) | thanix / thanix_stream | 420 /s | 6.0 | 26 | ∞ | 0.8 | 0.9 | 20 | `beamDuration` 1.6 (= 672 per burst) | 20 | C |
| `fighter_gun` ᵉ (170-186) | mass_accelerator / kinetic | 6 | 0.25 | 4 | 14 | 0.5 | 0.2 | 1 | | 20 | S |
| `fighter_torpedo` ᶜ (187-208) | disruptor_torpedo / warhead | 120 | 14.0 | 9 | 2.0 | 0.85 | 0.9 | 3 | `missileHp` 8, `magazine` 2 | 60 | C |
| `reaper_capital_beam` ᶜ (211-231) | reaper_beam / reaper_beam | 1900 /s | 7.5 | 44 | ∞ | 0.93 | 1.0 | 0 | `beamDuration` 2.8 (= 5320 per burst) | 70 | C |
| `reaper_destroyer_beam` ⁱ (232-252) | reaper_beam / reaper_beam | 520 /s | 6.5 | 30 | ∞ | 0.9 | 1.0 | 0 | `beamDuration` 2.4 (= 1248 per burst) | 80 | C |
| `reaper_point_defence` ᵉ (253-273) | gardian / laser | 18 | 0.4 | 6.5 | ∞ | 0.42 | 0.3 | 0 | `burst` 14 / 3 s | 360 | S |
| `turian_dn_main` ⁱ (276-292) | mass_accelerator / kinetic | 1050 | 3.8 | 42 | 30 | 0.74 | 0.85 | 18 | | 12 | C |
| `turian_cruiser_main` ᵉ (293-309) | mass_accelerator / kinetic | 340 | 3.0 | 36 | 26 | 0.7 | 0.7 | 14 | | 15 | C |
| `asari_dn_main` ⁱ (310-326) | mass_accelerator / kinetic | 1100 | 4.0 | 44 | 32 | 0.78 | 0.85 | 16 | | 14 | C |
| `asari_cruiser_main` ᵉ (327-343) | mass_accelerator / kinetic | 330 | 2.9 | 38 | 28 | 0.74 | 0.72 | 13 | | 16 | C |
| `salarian_dn_main` ⁱ (344-360) | mass_accelerator / kinetic | 1020 | 3.8 | 44 | 33 | 0.84 | 0.85 | 15 | | 14 | C |
| `salarian_cruiser_main` ᵉ (361-377) | mass_accelerator / kinetic | 310 | 2.7 | 40 | 30 | 0.8 | 0.72 | 12 | | 16 | C |
| `stg_frigate_main` ᵉ (378-394) | mass_accelerator / kinetic | 65 | 1.4 | 26 | 24 | 0.82 | 0.5 | 6 | | 30 | |
| `ascension_main` ⁱ (395-411) | mass_accelerator / kinetic | 2600 | 4.5 | 48 | 36 | 0.8 | 0.95 | 20 | | 12 | C |
| `cerberus_cruiser_main` ⁱ (412-428) | mass_accelerator / kinetic | 340 | 2.9 | 36 | 27 | 0.71 | 0.72 | 13 | | 15 | C |
| `cerberus_frigate_main` ᵉ (429-445) | mass_accelerator / kinetic | 72 | 1.4 | 24 | 22 | 0.72 | 0.45 | 7 | | 30 | |
| `geth_dn_main` ⁱ (448-464) | mass_accelerator / kinetic | 1150 | 3.8 | 44 | 32 | 0.8 | 0.88 | 16 | | 12 | C |
| `geth_cruiser_main` ᵉ (465-481) | mass_accelerator / kinetic | 330 | 2.8 | 36 | 27 | 0.76 | 0.72 | 13 | | 15 | C |
| `quarian_heavy_main` ⁱ (482-498) | mass_accelerator / kinetic | 700 | 4.2 | 38 | 26 | 0.66 | 0.75 | 18 | | 14 | C |
| `apex_hyper_ma` ᴬ (501-522) | mass_accelerator / kinetic | 3200 | 4.5 | 44 | 48 | 0.78 | 1.4 | 24 | name "Hyper-mass accelerator (HADES rounds)" | 12 | C |

Notes: `WeaponKind` also declares `'missile'` (`data/types.ts:22-28`) with no catalogue entry (`tryFire` treats it like a torpedo). `magazine`/`burst` exist only on the four weapons shown. `BARRIER_EFFICIENCY` (`weapons.ts:16-22`): kinetic 1.0, thanix_stream 0.45, reaper_beam 0.4, laser 0.0, warhead 0.25. Heat capacity is `100 × tech.heatCapacity` (`rules.ts:212`), decay 8 % of capacity per second (`battle.ts:448`); a dreadnought firing its 8 broadsides continuously generates 8×6/1.6 = 30 heat/s against 8/s decay, so `overheated` (L450, blocks every mount with `heat > 0` until 55 %, L449/L557) is a routine state in a close fight — relevant when the main-gun cadence drops to 2 s (18 heat per 2 s = 9/s on its own).

### 8.4 Preset multipliers (`src/timelines/presets.ts`) and the effective Apex numbers

| preset (lines) | organic tech ≠ 1 | reaper tech ≠ 1 | factionOverrides | special ≠ canon | fleetStrength ≠ 1 | strategic ≠ canon |
| --- | --- | --- | --- | --- | --- | --- |
| `canon_me3` (18-32, frozen) | — | — | — | — | — | — |
| `prepared_galaxy` (35-54) | fireRate 1.1, accuracy 1.08, crew 1.1, barrierRegen 1.15 | — | — | thanix `fleetwide` | alliance 1.5, turian 1.4, asari 1.4, salarian 1.3 | alliedCoordination 0.85 |
| `humanity_ascendant` (57-87) | — | — | alliance: MA dmg 1.5, MA pen 1.25, barriers 1.4, armour 1.3, hull 1.15, fireRate 1.15, sensors 1.3, accuracy 1.1 | thanix `fleetwide` | alliance 2.2, turian 0.95 | alliedCoordination 0.35 |
| `cerberus_reformed` (90-113) | — | — | cerberus: sensors 1.2, EW 1.4, accuracy 1.1 | — | cerberus 2.0 | illusiveManIndoctrinated false, cerberusStance `cooperative`, alliedCoordination 0.6 |
| `reaper_escalation` (116-134) | — | accuracy 1.08, barrierRegen 1.3, crew 1.15 | — | — | reaper 1.6 | reaperCompetence 1.3, indoctrination 1.3, reaperReinforcements 1.6 |
| `prime_apex` (140-200) | see §3.2 (18 keys) | — | cerberus: EW 1.6, sensors 1.6 | hyperMA, hades, thanix `fleetwide`, reaperCommandVulnerability | alliance 2.0, turian 1.6, asari 1.3, salarian 1.3, cerberus 1.5 | see §3.2 |
| `cerberus_ascendant` (207-239) | — | — | cerberus: sensors 1.3, EW 1.5, accuracy 1.1, crew 1.1 | indoctrinationDisabled true, reaperCommandVulnerability false | cerberus 1.6 | see §3.2 |

Effective `prime_apex` values for an Alliance ship (`applyRulesToShip`/`applyRulesToWeapon`, §3.1), Reapers unchanged:

- Kilimanjaro: hull 10 350, armour 169, barriers 7 020, regen 77/s, speed ×1.08, sensors 126 km, ecm 0.195, heat capacity 130, crew `1.05 × 1.15 × (1 − 0.08×0.5) × (0.9 + 0.2×0.9)` = 1.252 (canon: `1.05 × 0.92 × 1.0` = 0.966).
- Spinal gun → `apex_hyper_ma`: damage 3200 × 1.25 = **4000**, penetration 1.4 × 1.3 = **1.82** (the armour term `max(0, 1.2 − pen)` is 0, so `armourBypass 0.5` changes nothing for this gun), range 44, cooldown 4.5 / 1.1 = 4.09 s, accuracy min(0.99, 0.78 × 1.1) = 0.858, `barrierEfficiencyMultiplier 0.6` → kinetic barrier efficiency 0.6.
- Cruiser main → Thanix fleetwide: 420 × 1.4 × 1.35 = 793.8 /s for 1.6 s = **1270 per burst**, cooldown 5.5 / 1.1 = 5.0 s; Normandy Thanix 567 /s, 5.45 s. Broadside 175 (pen 0.65, cd 1.45), frigate gun 87.5 (pen 0.585), torpedo 364, GARDIAN 19.6, fighters ×1.3 on top. **Every** organic mass accelerator carries HADES (`armourBypass 0.5`, barrier ×0.6) under this preset (§3.1).

### 8.5 Damage model (`src/simulation/damage.ts`) and housekeeping rules

`applyDamage(target, raw, weapon, rng, now)` (L27-73), in order:

1. `target.lastHitAt = now` (L30) — on **every** call, including each beam tick.
2. Barriers: `eff = BARRIER_EFFICIENCY[damageType] × weapon.barrierEfficiencyMultiplier` (L33); `absorbed = min(barriers, raw × eff)`; `barriers −= absorbed`; `amount = raw − absorbed`; `barriersCollapsed` when `barriers ≤ 0.01` (L34-43). Kinetic rounds are therefore 100 % absorbed until the pool is empty (no leak), Reaper beams leak 60 %, Thanix 55 %, torpedoes 75 %, lasers 100 %.
3. Armour: `armourEff = armour × (1 − armourBypass)`; `reduction = max(0, armourEff × max(0, 1.2 − penetration))` (L46-47); `hullDamage = clamp(amount − reduction, amount × 0.15, amount)` (L48-49) — a flat per-hit subtraction with a **15 % floor**. Ablation `armour −= hullDamage × 0.002` (L51).
4. `hull −= hullDamage`, `stats.damageTaken += hullDamage` (L53-55).
5. Subsystems: `severity = hullDamage / maxHull`; if `severity > 0.03` and `rng.chance(min(0.6, severity × 4))`, one of `engines|weapons|sensors` (`rng.pick`) drops by `min(0.5, severity × 3)`, floor 0.1 (L58-64). Effects: engines → `engineFactor = 0.25 + 0.75×engines` and turn rate (`battle.ts:392-440`), weapons → `wpnFactor = 0.4 + 0.6×weapons` on cooldown speed (L521, L548), sensors → `0.5 + 0.5×sensors` in `hitProbability` and missile interception (L670).
6. Destruction at `hull ≤ 0` (L66-71). There is no critical-hit table beyond this.

`hitProbability(shooter, target, weapon, dist, closingSpeed)` (L80-105): `rangeFactor = 1 − 0.45 × (dist/range)²`; profile `min(1.3, 0.55 + 1.2 × signature)` for `antiSmall` weapons, else `min(1.6, 1.05 × √signature)` and ×0.08 against fighters; `ecm = 1 − 0.6 × target.ecm`; `crew = 0.75 + 0.3 × shooter.crewQuality`; `sensors = 0.5 + 0.5 × shooter.subsystems.sensors`; `relSpeedPenalty = max(0.55, 1 − closingSpeed/projectileSpeed)` (1 for beams); product × `accuracy`, clamped to [0.01, 0.98]. `tryFire` multiplies by `coordination = 1 − 0.5 × fleet.coordinationPenalty` (`battle.ts:657, 676`).

Beams: a burst is one hit roll up front, then `applyDamage(target, def.damage × dt, …)` every step while `beamRemaining > 0` (`battle.ts:524-535`), i.e. **56 chunks of 95** for the capital beam, 48 chunks of 26 for the destroyer beam, 32 chunks of 21 for Thanix. Because step 3 subtracts the armour term from each chunk, armour is far more effective against beams than against slugs (worked examples below) — a modelling artefact to keep in mind for D2/D3.

Housekeeping (`battle.ts:442-451`): barriers regenerate `barrierRegen × dt` only while `time − lastHitAt > 3` s (L444-446), so a ship under any fire — including a beam that is still burning — never regenerates; heat decays `0.08 × heatCapacity × dt` (L448); `overheated` set above capacity, cleared below 55 % (L449-450). Dying ships stop instantly (no drifting hulks; `destroyShip`, L844).

### 8.6 Worked examples and the measured D3 baseline

Analytical, from 8.3-8.5 (canon, half of maximum range, `rangeFactor 0.8875`, closing speed negligible):

- Kilimanjaro main gun vs Sovereign: `p = 0.72 × 0.8875 × 1.6 × 0.79 × 1.04 ≈ 0.84`. While barriers are up every hit is absorbed in full (42 000 pool = 42 hits ≈ 50 shots ≈ 200 s for one gun at 4 s cadence). Once down: `reduction = 320 × 0.35 = 112` → **888 hull per hit**, 32 000 hull = 36 hits.
- Sovereign beam vs Kilimanjaro: `p` clamps to **0.98** (`0.93 × 0.8875 × 1.447 × 0.91 × 1.14`). Per 0.05 s chunk: 95 raw → 38 to barriers, 57 pass → `reduction 130 × 0.2 = 26` → 31 hull; with barriers down 69 hull. One 2.8 s burst: −2128 barriers and −1736 hull while barriers hold, −3864 hull once they are gone. A Kilimanjaro (5200/9000) therefore absorbs ~2.4 bursts before its barriers fail and ~1.2 more before the hull goes: ~3.7 single bursts, i.e. the Sovereign's two emitters (7.5 s cooldown) kill a dreadnought in about two paired volleys, 10-15 s.
- Thanix vs any Reaper hull: per chunk 21 raw → 9.45 barriers, 11.55 pass → `reduction 320 × 0.3 = 96` (destroyer: `160 × 0.3 = 48`) ≫ 11.55 → **15 % floor**, 1.73 hull per chunk, **55 hull per 1.6 s burst** (plus 302 barrier). Under the current model Thanix only strips barriers against Reapers; the fleet-wide Thanix refit of Prime/Apex does not scale the result (the pack wants Thanix "rewarded against Reaper protection" — D2).
- Alliance cruiser main vs destroyer: `p ≈ 0.68 × 0.8875 × 0.664 × 0.82 × 1.03 ≈ 0.33`; 320 per hit, 6500 barrier = ~21 hits ≈ 62 shots ≈ 3 min for one cruiser; hull hits 240 (reduction 80). Destroyer beam vs cruiser: `p ≈ 0.85`; per chunk 26 raw → 10.4 barriers, 15.6 pass → 6.6 hull (reduction 9); per burst −500 barriers/−317 hull, −816 hull once stripped: ~5 bursts (≈ 30 s) kill a cruiser. Frigate torpedo 260 → 65 absorbed, 195 pass, 147 hull against a destroyer (if it survives GARDIAN-style `reaper_point_defence`, `missileHp 12`).
- Kilimanjaro vs destroyer: `p ≈ 0.36`; 944 hull per hit after 6500 barrier; ~10 hits ≈ 28 shots.

Measured (headless, `buildCustomBattle`, `deep_space`, 60 km start, side A `line_abreast`, side B `capital_column`, `maxDuration 600`, seeds 1-8, both sides `mult 1`; script below; run on `01b1fef` in 5.6 s):

| duel | A wins | Reaper barrier reached 0 (min %) | mean Reaper hull left | mean A losses | mean duration |
| --- | --- | --- | --- | --- | --- |
| 2 Kilimanjaro vs 1 Sovereign | 0/8 | 0/8 (75 %) | 100 % | 2.00 | 72 s |
| 3 Kilimanjaro vs 1 Sovereign | 0/8 | 0/8 (52 %) | 100 % | 3.00 | 91 s |
| 4 Kilimanjaro vs 1 Sovereign | 0/8 | 1/8 (0 %) | 98 % | 4.00 | 119 s |
| 6 Kilimanjaro vs 1 Sovereign | 3/8 | 8/8 | 14 % | 5.50 | 148 s |
| 8 Kilimanjaro vs 1 Sovereign | 8/8 | 8/8 | 0 % | 2.88 | 102 s |
| 1 Alliance cruiser vs 1 destroyer | 0/8 | 0/8 (60 %) | 100 % | 1.00 | 87 s |
| 2 Alliance cruisers vs 1 destroyer | 0/8 | 1/8 (0 %) | 96 % | 1.75 | 211 s |
| 1 Kilimanjaro vs 1 destroyer | 8/8 | 8/8 | 0 % | 0.00 | 241 s |
| 4 Alliance frigates vs 1 destroyer | 0/8 | 0/8 (62 %) | 98 % | 3.63 | 205 s |
| 4 Kilimanjaro vs 1 Sovereign, `prime_apex` | 8/8 | 8/8 | 0 % | 0.13 | 53 s |
| 2 Kilimanjaro vs 1 Sovereign, `prime_apex` | 5/8 | 5/8 | 5 % | 1.38 | 83 s |
| 1 Alliance cruiser vs 1 destroyer, `prime_apex` | 0/8 | 0/8 (72 %) | 69 % | 1.00 | 163 s |

Against the D3 target: today **four dreadnoughts never kill a Sovereign** (it takes eight to do so reliably, six for a coin-flip), and **a lone cruiser has no path to kill a destroyer** (two cruisers break its barrier once in eight runs; even a dreadnought needs four minutes). The pack's isolated trial (`validation_results.json`: 2 DN never, 3 DN in 18 s, 4 DN in 8 s, no return fire) is the shape the lead wants, scaled to our pools. Under `prime_apex` the opposite problem appears: two dreadnoughts beat a Sovereign five times in eight, and four lose 0.13 ships on average — the "four must not automatically survive" clause fails in the AU too.

Probe, condensed from the script that produced the table (same construction, seeds and metrics; the full version loops over the twelve duels and prints one formatted line each). It is deterministic by seed, so it can become a `scripts/` probe or the skeleton of the D3 unit tests:

```ts
// node --import tsx/esm duel.mts   (run from the repo root; .mts so Node treats it as ESM)
import { BattleSimulation } from '/home/user/reaperwar/src/simulation/battle';
import { buildCustomBattle } from '/home/user/reaperwar/src/scenarios/index';
const duel = (a: Record<string, number>, b: Record<string, number>, rulesId = 'canon_me3') => {
  let wins = 0, down = 0, minFrac = 1, hull = 0, lost = 0, dur = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const sim = new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', startingDistanceKm: 60, maxDuration: 600,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: a },
      sideB: { faction: 'reaper', name: 'B', formation: 'capital_column', counts: b } }));
    const reaper = sim.ships.find((s) => s.side === 'B')!;
    let m = 1;
    while (!sim.finished) { sim.step(); m = Math.min(m, reaper.barriers / reaper.maxBarriers); }
    const r = sim.result!;
    if (r.winner === 'A') wins++; if (m <= 0) down++; minFrac = Math.min(minFrac, m);
    hull += reaper.hull / reaper.maxHull; lost += r.sides.A.destroyed; dur += r.duration;
  }
  console.log(JSON.stringify(a), 'vs', JSON.stringify(b), rulesId, { wins, down, minFrac, meanHull: hull / 8, meanLost: lost / 8, meanDur: dur / 8 });
};
duel({ alliance_dreadnought: 4 }, { reaper_capital: 1 });
duel({ alliance_cruiser: 1 }, { reaper_destroyer: 1 });
```

### 8.7 What the calibration will have to move (and where)

- Cadence: `alliance_dn_main.cooldown 4.0` (`weapons.ts:32`; canon text in its own provenance says 2 s), turian 3.8 (L282), asari 4.0 (L316), salarian 3.8 (L350), geth 3.8 (L454), quarian heavy 4.2 (L488), Ascension 4.5 (L401), `apex_hyper_ma` 4.5 (L507). `tests/damage.test.ts` never asserts a cooldown; `tests/timelines.test.ts:38` only asserts that canon leaves `damage` unchanged.
- Throughput vs recovery: two Kilimanjaros at 2 s cadence land ≈ 0.84 hits/s ≈ 840 barrier damage/s; "two cannot overwhelm" needs the Sovereign's recovery (today 240/s and **suppressed while hit within 3 s**, `battle.ts:444`) to beat that while under fire — either a recovery that continues under fire (the pack's `barrier_recovery_after_volley: true`, Sovereign recovery 1.1 DKE/s = 1100/s) or a per-hit absorption cap. Three guns ≈ 1260/s must still gain ("growing load"), four ≈ 1680/s must win in tens of seconds, which also bounds the pool (42 000 today).
- Return fire: with `p = 0.98` and two emitters the Sovereign kills a dreadnought every ~15 s, which is why four die before the barrier moves. A 2 s cadence alone will not change the 4-vs-1 verdict; expect to touch `reaper_capital_beam` (damage 1900, duration 2.8, cooldown 7.5, accuracy 0.93; L216-222), dreadnought pools (5200/130/9000), or both.
- Cruiser vs destroyer: destroyer pools 6500/160/3200 (`ships.ts:839-841`) and the 15 % floor make the cruiser's 320-point slug meaningless; a credible kill path needs the destroyer barrier within reach of ~10-20 cruiser hits and the destroyer beam to need several bursts (today ~5), e.g. a destroyer barrier in the 2000-3000 range or a heavier cruiser round, while `tests/damage.test.ts:62-71` still wants frigate guns at < 30 % effectiveness against Reaper plating.
- Tests that pin today's balance are listed in §9.3 with their thresholds; the canon reference engagement (`alliance_fleet_engagement`, fixed fleets, seeds 7 and 8) must still be a Reaper win with `reaperCapitalLost < 3` and Alliance `survivalPercent < 30`, and the same fleets under `prime_apex` must still annihilate the Reapers with at least one loss.

---

## 9. Test inventory

### 9.1 Running them

- Unit: `npm test` → `vitest run` (`vitest.config.ts`: `tests/**/*.test.ts`, `environment: 'node'`, `testTimeout: 60_000`, alias `@` → `src`). 9 files, 83 `it(...)` blocks (`battle 19, campaign 22, damage 9, timelines 12, ammo 5, rng 5, lod 4, salarian 4, saves 3`), ~62 s wall because the campaign and balance tests run whole battles. Typecheck: `npm run typecheck` (`tsc --noEmit`).
- e2e: `npm run test:e2e` → Playwright (`playwright.config.ts`: `testDir ./e2e`, 120 s per test, no retries, 1920×1080, headless Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; `webServer` runs `npm run build && npx vite preview --port 4173 --strictPort`, reused if already up). Both specs drive the sim through `window.reaperwar` (`src/main.ts:11`) instead of waiting on wall time.
- CI (`.github/workflows/ci.yml`, every push/PR): `npm ci` → typecheck → `npm test` → `npm run build` (`VITE_BASE=/reaperwar/`) → `playwright install --with-deps chromium` → `npm run test:e2e`, Playwright report uploaded on failure. `deploy.yml` (push to `main`): typecheck → `npm test` → build → GitHub Pages; it does **not** run the e2e suite.

### 9.2 Unit tests, file by file

Sensitivity column: **HIGH** = asserts a balance outcome that a D2/D3 recalibration can flip; **MED** = runs battles but asserts only existence/ordering; **LOW** = structural, unaffected by numbers (unless noted).

**`tests/rng.test.ts`** (47 lines) — `Rng` determinism (L6-10), seed independence (L11-17), uniform mean 0.48-0.52 over 20 000 draws (L18-29); `interceptPoint` leads a target (L33-42) and falls back to the target position when no solution exists (L43-46). LOW.

**`tests/lod.test.ts`** (23) — `lodLevel` thresholds with `REDUCED_FACTOR`/`POINT_FACTOR` × length (L5-9), length scaling (L10-14), fighter distances (L15-19), `enabled=false` (L20-22). LOW (D11 may change `lod.ts` constants: the tests use the exported constants, so only a change of *shape* breaks them).

**`tests/saves.test.ts`** (61) — slot CRUD with a canon campaign advanced one week and a `cerberus_ascendant` post-war state (L9-32: list, rename, load copy semantics, remove); overwrite by id, `turn === 1`, **`describeSave('campaign', st).rulesName === 'Prime/Apex — Successful Refuse'`** (L34-46, literal at L45 — renaming the preset breaks it); export/import round trip of slots (L48-60). LOW except the name literal; it runs `advanceTick` on a `prime_apex` campaign (week 1 only).

**`tests/timelines.test.ts`** (127):

| test (lines) | asserts | sensitivity |
| --- | --- | --- |
| canon has all multipliers at 1 and no special technology (9-18) | every `TECH_KEYS` of `CANON_ME3.organic/reaper` is 1; `special/fleetStrength/strategic` deep-equal `CANON_SPECIAL/CANON_FLEETS/CANON_STRATEGIC`; category `canon` | LOW — new keys must be added to the canon constants |
| getPreset returns clones (20-27) | mutating a clone never changes `CANON_ME3` | LOW |
| canon effective stats equal catalogue values for every ship class (29-43) | for every class: `applyRulesToShip` hull/barriers/armour equal the catalogue; for every hardpoint: `applyRulesToWeapon(...)` keeps `id`, `damage`, `armourBypass 0`, `barrierEfficiencyMultiplier 1` under canon | LOW for catalogue edits (it compares against the catalogue itself); breaks if canon ever substitutes or scales a weapon |
| Prime/Apex rules do not leak into canon (47-54) | Apex DN gun `id === 'apex_hyper_ma'`, canon keeps `alliance_dn_main`; **`WEAPONS.alliance_dn_main.damage === 1000`** (L53) | HIGH for the damage unit: changing the slug's damage breaks it (D2 keeps 1000 = 1 DKE) |
| Cerberus Ascendant vs Prime/Apex isolation (56-65) | `PRIME_APEX.strategic.shepardAlive true`, `cerberusStance 'cooperative'`, `catalystOperational true`; CA: false / `controls_reapers` / false; CA `hyperMassAccelerators false`, `hadesRounds false` | LOW; D1 keeps all of these |
| Reaper technology unchanged in Prepared Galaxy and Prime/Apex (67-72) | `getPreset(id).reaper[k] === 1` for the two ids | LOW; add `apex_legacy` if its Reaper tech stays canon |
| unique ids, non-canon presets declare history changes (74-78) | `PRESETS` ids unique; `historyChanges.length > 0` unless canon | LOW |
| round-trips a preset through export/import (82-88) | `importRuleSet(exportRuleSet(PRIME_APEX))` → `organic/special/strategic` deep-equal | LOW but **every new `special`/`strategic` key must be in `validateRuleSet`** or this fails |
| rejects invalid JSON and non-objects (90-94) | `ok === false` for `'{not json'`, `42`, `[]` | LOW |
| clamps out-of-range values and drops unknown keys (96-114) | `massAcceleratorDamage 1000 → 10`; `bogus`/`klingon` dropped; `thanixAvailability 'everywhere' → 'canon'`; `controls_reapers` forces `catalystOperational false`; warnings non-empty; category `custom` | LOW; changing `TECH_RANGE` maxima changes the 10 |
| imported sets cannot claim canon status (116-120) | category `custom`, id ≠ `canon_me3` | LOW |
| custom timelines start identical to canon (122-126) | `makeCustom().organic` deep-equals `CANON_TECH` | LOW |

**`tests/damage.test.ts`** (120) — `makeShip(classId, rules, side)` (L13-23) instantiates `alliance_fleet_engagement` under the given rules (rule-scaled fleets, no `fixed` flag), steps up to 120 ticks to find a launched fighter, and resets the pools; `weapon(id, faction, cls, rules)` (L25-26) is the unscaled `applyRulesToWeapon`.

| test (lines) | asserts (with the arithmetic it relies on) | sensitivity |
| --- | --- | --- |
| kinetic rounds fully absorbed by barriers (29-36) | 70 raw frigate round vs full frigate barriers (450): `barrierDamage 70`, `hullDamage 0` | needs kinetic efficiency 1 and frigate barriers ≥ 70 |
| a dreadnought slug destroys a frigate outright (38-44) | 1000 raw vs `alliance_frigate` at full 450/12/520: 550 through, reduction 12×0.35 = 4.2 → 546 ≥ 520 hull | **HIGH**: `barriers + hull + armour×(1.2−pen)` of the frigate must stay below the slug (today 974 vs 1000) |
| a Reaper beam passes most of its energy through barriers (46-52) | 1000 raw vs cruiser: `barrierDamage ≈ 400` (exactly 0.4), `hullDamage > 500` (600 − 45×0.2 = 591) | **HIGH**: pins `BARRIER_EFFICIENCY.reaper_beam = 0.4` to 5 decimals and cruiser armour < 455 |
| GARDIAN lasers ignore barriers (54-60) | 14 raw vs fighter: `barrierDamage 0`, hull > 0 | needs laser efficiency 0 |
| armour reduces low-penetration damage vs Reaper plating (62-71) | Sovereign with barriers 0: frigate gun `hull/70 < 0.3` (reduction 320×0.75 = 240 > 70 → 15 % floor); DN slug `hull/1000 > 0.8` (1000 − 112 = 888) | **HIGH**: floor must stay < 0.3; `armour × (1.2 − 0.85)` of the Sovereign must stay < 200 (today 112) — an armour of 320 with pen 0.85 is at 56 % of the budget |
| HADES rounds bypass armour and pierce barriers (73-86) | Apex DN gun: `substitutedFrom 'alliance_dn_main'`, `id 'apex_hyper_ma'`, `armourBypass > 0`; 1000 raw vs full-barrier Sovereign: canon `hull 0`, Apex `hull > 0` (barrier eff 0.6 → 400 pass) | **HIGH for D7**: moving HADES from the faction flag to a finite round must still make `applyRulesToWeapon(WEAPONS.alliance_dn_main, 'alliance', DN, PRIME_APEX)` report `armourBypass > 0` and a barrier multiplier < 1, or the test must change with it |
| hit probability vs fighters and large targets (88-98) | DN gun at 10 km: vs fighter `< 0.1` (profile ×0.08), vs Sovereign `> 0.6` and `≤ 0.98` | MED: accuracy 0.72, `rangeFactor 0.9745`, the 1.6 profile cap, ecm 0.79 and crew 1.04 give ≈ 0.92 |
| subsystems can be disabled by heavy hits (100-110) | 20 × 300-raw beam hits on a barrier-less cruiser produce ≥ 1 `subsystem` outcome (severity 291/2400 = 0.12 → chance 0.48) | MED |
| effective ship stats scale with rule multipliers (112-119) | canon DN hull equals catalogue; Apex hull and barriers greater | LOW |

**`tests/ammo.test.ts`** (74) — all on `battle_of_earth` (rule-scaled) except the last:

| test (lines) | asserts | sensitivity |
| --- | --- | --- |
| torpedo tubes carry a magazine and stop firing when spent (7-21) | canon seed 3: frigate tubes `ammo === 8`; zeroing them → no further `disruptor_torpedo` `weapon_fired` for that frigate in 400 steps | LOW (gates at `battle.ts:556`) |
| reports depleted magazines (23-31) | canon seed 5: all tubes set to 1 → `ammunition_depleted` within 2400 steps; that ship's tubes all 0 | MED (needs torpedoes to be fired within 120 s) |
| fighters rearm after hangar time (33-52) | canon seed 5: a launched fighter with `carrierId` within 1200 steps; parked on the carrier with `rearming` → `rearming false`, `ammo === magazine`, `fighter_rearmed` within 400 steps (`REARM_SECONDS 12`) | LOW |
| point-defence mounts pause after a burst (54-64) | canon seed 7: cruiser GARDIAN `burstLeft === 10`; some mount reaches `burstLeft ≤ 0 && burstRecover > 0` within 4000 steps | MED (needs PD to fire ≥ 10 shots in 200 s — missiles or fighters must appear) |
| still deterministic with ammunition and bursts (66-73) | `alliance_fleet_engagement`, `prime_apex`, seed 8, rule-scaled: two runs give equal `destroyed` counts and `duration` | LOW (self-comparison) |

**`tests/battle.test.ts`** (215) — `fixed = {fleet_scaling: 'fixed'}` (L10) is used on every reference-engagement test:

| test (lines) | asserts | sensitivity |
| --- | --- | --- |
| deterministic (13-23) | canon seed 99, 1200 steps: equal event counts, last 200 events JSON-equal, equal `[id, hull, pos]` | LOW (self); any `Math.random` in the sim breaks it |
| different seeds differ (25-33) | seeds 1 vs 2, 1500 steps: last 50 events differ | LOW |
| Battle of Earth completes (35-49) | canon seed 42 (scaled): `finished`, `30 < duration ≤ 421`, > 5 `ship_destroyed`, `weapon_fired` of kind `reaper_beam` and `mass_accelerator`, `projectile_impact`, `barriers_down`, `reinforcement_arrival` (second wave T+55), `comms` | MED (a battle that ends before 30 s or after the cap without 6 kills fails) |
| **canon: Reapers win the reference engagement** (51-59) | seeds 7 and 8, `alliance_fleet_engagement` fixed (8 DN, 1 CV, 16 CA, 30 FF, Normandy vs 4 cap + 8 dd): `winner 'B'`, `B.reaperCapitalLost < 3`, `A.survivalPercent < 30` | **HIGH** — the canon calibration target |
| **Prime/Apex: the same fleets defeat the Reapers, at a cost** (61-69) | seeds 7 and 8: `winner 'A'`, `B.destroyed === B.deployed`, `A.destroyed > 0` | **HIGH** — the AU calibration target |
| Reaper intelligence assessment (71-81) | seed 7: canon threat ∈ {NEGLIGIBLE, LOW, MODERATE, ELEVATED}, Apex ∈ {SEVERE, CRITICAL}; Apex `reaperCapitalLosses > canon` | **HIGH** (`reaperIntel.ts:50-56` thresholds) |
| retreat ends the battle by withdrawal (83-90) | canon seed 5, 200 steps then `retreat`: reason matches `/withdrew\|destroyed/`, an `order_issued` event exists | LOW |
| attack_target focuses the fleet (92-100) | after 100 steps > 60 % of `alliance-tf` non-fighters have `targetId` = the chosen destroyer | MED (depends on `chooseTarget` honouring `forcedTargetId`, `ai.ts:109-133`) |
| fighters launch and torpedoes are fired (102-108) | canon seed 3, 1800 steps: fighters exist, `fighters_launched`, a `disruptor_torpedo` shot | MED |
| custom battles build and run (110-124) | legacy `CustomBattleInput` shape: `A.deployed 12`, `B.deployed 2`, winner ∈ {A, B, draw} | LOW; D6 must keep this shape loading or update the call |
| every scenario builds under every preset (126-135) | 10 scenario ids × 7 preset ids, 40 steps, `ships.length > 0` | LOW; **add new scenario/preset ids to the two literal lists** |
| Cerberus Intervention sides (139-146) | canon: Cerberus side `B`, no Reapers; `cerberus_reformed`: Cerberus side `A` and Reapers present | LOW (D4 Cerberus world state must keep `cerberusStance` semantics) |
| Palaven and Thessia complete with the new factions firing (147-156) | canon seed 3 fixed: a result, a turian/asari `weapon_fired` | MED |
| Rannoch outcomes (157-173) | war: geth `techOverride.kineticBarrierStrength 1.4`, geth cruiser `maxBarriers` = 1.4× the unupgraded one, quarians untouched; peace: geth side `A` + Reapers | LOW |
| Destiny Ascension world state (174-180) | `ascension present/absent` adds/removes the class | LOW |
| formations: non-overlapping capital slots (184-189) | 4 dreadnoughts `line_abreast`: adjacent x gaps > 1.2 km | LOW |
| formations: slot rotation (190-194) | `slotToWorld` with heading +x maps (0,0,5) to x≈5 | LOW |
| comparison runs both timelines and explains (198-207) | canon vs `PRIME_APEX` seed 7 fixed: same seed and deployed count, > 10 metrics, explanation matches `/Hyper-mass accelerators/` | MED; the regex is tied to the wording in `explainDifferences` (`comparison.ts:113-116, 139-141`) |
| identical rule sets yield identical results (208-214) | canon vs `getPreset('canon_me3')`: equal duration and losses, explanation matches `/identical/` | LOW |

**`tests/salarian.test.ts`** (61):

| test (lines) | asserts | sensitivity |
| --- | --- | --- |
| full hull family with models and provenance (10-22) | the four salarian classes exist, `hasModel`, `designProvenance CANON_INFERRED`; `SHIP_CLASS_LIST` has exactly 4 salarian classes; STG frigate `signature` ≤ every other organic non-fighter | LOW (adding a salarian class or a stealthier organic hull breaks it) |
| Defence of Sur'Kesh under canon and Prime/Apex (24-32) | canon seed 5 `stg_warning early`: `duration > 0`, `A.destroyed > 0`; **`prime_apex` `B.destroyed > canon B.destroyed`**; `late` flank `arrivalTime 25` | MED-HIGH |
| custom battles accept salarian fleets (34-47) | 2 Union DN + 6 CA + 8 STG vs 4 destroyers, canon, 60 km, 240 s: `duration > 0`, **`B.destroyed > 0`** | **HIGH-ish**: the salarian group must kill ≥ 1 destroyer inside 240 s (today it does; see 8.6 for how hard destroyers are) |
| genophage world state (49-60) | campaign: `Salarian First Fleet` only when `sabotaged`; Third Fleet refuses `orderMove` to Sol when cured, First Fleet may move to `widow`; Final Battle default + `sabotaged` includes the First Fleet | LOW |

**`tests/campaign.test.ts`** (275) — every `advanceTick` with a Reaper/allied contact calls `autoResolve` → a full `BattleSimulation` (§7 note), so the outcome tests are balance tests in disguise:

| describe / test (lines) | asserts | sensitivity |
| --- | --- | --- |
| galaxy: every system reachable from Sol (11-13); relays reference known systems (14-21) | `relayPath` non-empty; `neighbours('sol')` includes `arcturus` | LOW |
| engine: creates a canon campaign (25-36) | `kite_nest` Reaper-held, `sol` allied, Reaper fleets exist, `Alliance Fifth Fleet` player-controlled, **`crucible.available true`** under canon; Cerberus allegiance `cerberus` (canon) / `allied` (`cerberus_reformed`) | LOW; D1's `crucibleAvailable false` on `prime_apex` does not touch this |
| world state adds quarian/geth fleets only with peace (38-44) | `rannoch war` no quarians; `peace` quarians + allied geth | LOW |
| deterministic for a seed (46-53) | canon seed 9, 6 weeks: identical fleets/systems JSON | LOW (self) |
| moves fleets along relays and refuses uncooperative orders (55-69) | Fifth Fleet route `['widow','athena']`; turian cooperation 0.2 refuses, 0.9 allows | LOW |
| pauses on an engagement and resolves it (71-90) | vanguard placed at `sol`, interactive tick → `pending.system 'sol'`; `buildEngagement` → `earth_orbit`, Reaper side B, an `orbital defence` fleet; after the real battle **the Fifth Fleet lost ships or was destroyed**; `sol.lastBattle` set | MED (canon seed 3: the Fifth Fleet must lose ≥ 1 hull against the vanguard + defence group) |
| withdrawal moves player fleets out (92-99) | after `withdrawFromEngagement` no player fleet at Sol | LOW |
| **canon ends in defeat or a Crucible decision; Prime/Apex wins conventionally** (101-109) | canon seed 5 reaches **some** `outcome` by week 160; `prime_apex` seed 5 reaches `victory` by week 160; `reaperFleetValue(apex) < reaperFleetValue(canon) + 1` | **HIGH**: stronger canon fleets (2 s cadence) could leave canon without an outcome in 160 weeks; Apex must still destroy every Reaper fleet (no Crucible under D1) |
| timelines without a Crucible cannot win through it (111-116) | `cerberus_ascendant`: `available false`, progress 0 after 20 weeks | LOW |
| **refusing the Crucible forces a conventional outcome** (118-125) | `prime_apex` + `{crucible:'refuse'}`: `available false`, `victory` ≤ week 160, reason matches `/conventional\|Refuse/`, `reaperFleetValue 0` | **HIGH** (same battles as above; needs `conventionalVictoryPossible true`) |
| round-trips through JSON (127-135) | `prepared_galaxy` seed 7: a JSON copy advances identically | LOW |
| depth: ground forces slow the harvest, krogan muster (139-154) | population higher with ground 1 than 0 after 4 weeks at `exodus`; cured genophage sets `flags.krogan_muster`, `effectiveGround(trebia)` ≥ base, a `ground` event | MED |
| depth: research changes allied technology (156-168) | `barrier_overcharge` completes within 60 weeks; `researchTech().kineticBarrierStrength ≈ organic × 1.15`; the Fifth Fleet's `techOverride` carries it into `buildEngagement` | LOW |
| depth: refugees and political events (170-175) | `reaper_escalation` seed 14, ≤ 30 weeks: `refugees > 0`, a `political` event | MED |
| depth: normalises saves from the first build (177-189) | stripped `research/refugees/flags/ground` restored by `normaliseCampaign`; `sol.ground 1`; one tick works | LOW; **migration point for D1 flag changes** |
| diplomacy: war summit every twelve weeks (193-213) | interactive: `summit.number 1` within 12 weeks (engagements withdrawn); `decideSummit('refugees')` halves refugees to 0.5 and sets `researchModifier 0.6`; AI campaigns log `War summit 1` | LOW |
| diplomacy: rachni and Council composition (215-221) | `crucibleRateModifier(saved) > killed`; turian cooperation higher with Ascension present; no `destiny_ascension` when absent | LOW |
| post-war: twenty years deterministic (225-241); refuses dismantlement before readiness (242-251); fleet-first plan wins (252-261) | `cerberus_ascendant` post-war seeds 11/3/21: outcome within 80 quarters, identical metrics JSON, `controlledReapers 0` on victory | LOW (post-war uses its own model, `campaign/postwar.ts`) |
| Final Battle of Earth uses campaign fleets (265-274) | default includes `harbinger`; linked `campaignAllied` JSON → first side-A fleet named `Survivors`; `campaignReaper` → `reaper_capital` count 2 | LOW; D4 must keep the `campaignAllied`/`campaignReaper` contract |

### 9.3 Calibration sensitivity summary (what a D2/D3 change must re-verify)

HIGH: `battle.test.ts` 51-59, 61-69, 71-81; `damage.test.ts` 38-44, 46-52, 62-71, 73-86; `timelines.test.ts` 47-54 (the 1000-point slug); `campaign.test.ts` 101-109, 118-125; `salarian.test.ts` 34-47. MED: `battle.test.ts` 35-49, 92-108, 147-156, 198-207; `ammo.test.ts` 23-31, 54-64; `salarian.test.ts` 24-32; `campaign.test.ts` 71-90, 139-154, 170-175. Everything else is structural. New mechanics (volley, beats, HADES warhead, drive attack, Oculus) need their own tests and, per §1.5, must keep `JSON.stringify(events)` deterministic.

### 9.4 e2e tests and every selector they touch

Helpers: `advance(page, seconds)` (`game.spec.ts:4-10`) loops `window.reaperwar.battle.sim.step()` until `sim.time` passes the target or `sim.finished`; `campaign.spec.ts:69-73` steps to `finished`. Both specs collect `pageerror`/console errors and expect none.

**`e2e/game.spec.ts`**

| test (lines) | selectors / text, in order (DOM source) |
| --- | --- |
| page starts, menu renders, no console errors (13-23) | `[data-menu="quick-battle"]` (`menu.ts:8-23` slug of the label); `.menu-title` contains `MASS EFFECT 3` (`menu.ts:26`) |
| a complete Battle of Earth (25-74) | `[data-menu="quick-battle"]` → `[data-action="launch"]` (`briefing.ts:101`) → `[data-action="pause"]` (`hud.ts:274`); `#battle-canvas` has a `webgl2`/`webgl` context; `sim.ships.length > 20`; `[data-action="pause"]` gains `.active`; `[data-speed="4"]` `.active` (`hud.ts:275`, values from `SPEEDS`); `[data-camera="cinematic\|follow\|free\|projectile\|reaper\|command\|tactical"]` each `.active` (`hud.ts:280`, keys of `CAMERA_MODE_LABELS`); `[data-order="advance"]` `.active` (`hud.ts:83, 292`); `select >> nth=0` set to `strike_wedge` (**the formation select must stay the first `<select>` in the HUD**, `hud.ts:53-64`); `.ship-list .ship-row` first click (`hud.ts:183`) → `.target-panel` contains `SSV` (a named Alliance ship must be first in the list); `.ship-row` with text `Reaper destroyer` right-click → `.toast` contains `ATTACK` (`app.ts:138-148`); after 40 s > 10 `weapon_fired`; after +900 s `[data-action="results"]` visible (`hud.ts:365`) → `.result-banner` matches `/VICTORY\|DEFEAT\|DRAW/` (`results.ts:42`), `[data-action="replay"]` (`results.ts:57`) |
| replay reproduces the same battle (76-92) | `input[type="number"]` filled `1234` (**the seed must stay the first number input on the briefing**, `briefing.ts:86`); `[data-action="launch"]`; run 900 s; `[data-action="results"]`; `.result-banner` text and the first `.screen-body p.dim` (summary line, `results.ts`) must be identical after `[data-action="replay"]` |
| canon vs AU comparison (94-103) | `[data-menu="canon-vs-au-comparison"]` → `[data-action="run-comparison"]` (`comparison.ts:43`) → `[data-action="watch-b"]` visible within 60 s (`comparison.ts:68`); `.compare-table` text contains both `DEFEAT` and `VICTORY` (canon loses, `prime_apex` wins the reference engagement, seed 7, fixed fleets — **HIGH calibration sensitivity**); `text=Hyper-mass accelerators` visible (explanation wording, `comparison.ts:113-116, 139-141`) |
| codex, database, timelines and custom battle render (105-125) | `[data-menu="codex"]` → `.codex-body` contains `established canon` (`codex.ts:8, 17`); `text=Main menu`; `[data-menu="fleet-database"]` → `.codex-body` contains `Armament` (`database.ts:13, 47`); `[data-menu="alternate-timelines"]` → `[data-timeline="prime_apex"]` (`timelines.ts:35-40`) → `.screen-body` contains `Homeworld Defence Rule` (`presets.ts:146, 154`); `[data-action="select-timeline"]` (`timelines.ts:167`); `.menu-info` contains `Prime/Apex` (`menu.ts:45-54`, the preset **name**); `[data-menu="custom-battle"]` → `[data-action="launch-custom"]` (`custom.ts:150`); `[data-count="sideB:reaper_capital"]` ← `0`, `[data-count="sideB:reaper_destroyer"]` ← `2` (`custom.ts:56-83`); launch → `[data-action="pause"]` |

**`e2e/campaign.spec.ts`**

| test (lines) | selectors / text, in order (DOM source) |
| --- | --- |
| starts a campaign, advances, resolves, persists (4-51) | `[data-menu="new-galactic-campaign"]` → `[data-action="start-campaign"]` (`campaign.ts:534`); `input[type="number"]` ← `77` (seed, `campaign.ts:506` — the only number input on the setup screen); `.galaxy-map` (`campaign.ts:24`); `.hud-clock` contains `WEEK 0` (`campaign.ts:189`); first `[data-fleet]` row click (`campaign.ts` system panel) → `.screen-body` contains `Alliance`; loop ≤ 12: `[data-action="end-turn"]` (`campaign.ts:205`, disabled while `outcome\|pending\|summit`), `[data-action="summit-choice"]` first (`campaign.ts:351`), stop when `[data-action="auto-resolve"]` (`campaign.ts:383`) appears and click it (gone within 60 s); `.hud-clock` matches `/WEEK [1-9]/`; `[data-action="save-slot-screen"]` (`campaign.ts:211`) → `[data-field="slot-name"]` ← `E2E slot`, `[data-action="save-slot"]` (`saves.ts:81`) → `[data-slot]` with that text; reload → `[data-menu="load-game"]` → `[data-action="load-autosave-campaign"]` visible (`saves.ts:32`), `[data-slot]`(E2E slot) `[data-action="load-slot"]` → `.galaxy-map`, `.hud-clock` first line equal |
| a campaign engagement fought in 3D (53-80) | `[data-menu="new-galactic-campaign"]` → `[data-action="start-campaign"]`; `window.reaperwar.campaign.fleets` find `Reaper vanguard` → `location = 'sol'`, `reaperwar.show('campaign')`; `[data-action="end-turn"]` → `[data-action="fight-3d"]` (`campaign.ts:379`) → `[data-action="pause"]`; step to `finished`; `[data-action="results"]` → `[data-action="return-campaign"]` (`results.ts:60`) → `.galaxy-map`, `.screen-body` contains `Battle of Earth` (`campaign.ts:239`, `lastBattle.summary`) |
| Cerberus Ascendant post-war plan (82-107) | `[data-menu="new-galactic-campaign"]` → `[data-action="start-postwar"]` (`campaign.ts:530`); `h1` contains `CERBERUS ASCENDANT`; `.hud-clock` contains `2186 Q1` (`postwar.ts:25`); `[data-action="dismantle"]` (`postwar.ts:65`) → `.toast` matches `/NOT READY/i`; `[data-programme="conventional_fleets"]` ← `30`; `text=+1 year` (`postwar.ts:39`) → `.hud-clock` `2187 Q1`; `[data-action="end-quarter"]` (`postwar.ts:30`) → `2187 Q2`; `text=Menu`; reload → `[data-menu="load-game"]` → `[data-action="load-autosave-postwar"]` → `h1` `CERBERUS ASCENDANT`, `.hud-clock` `2187 Q2` |

Selector-stability rules that follow: keep `data-menu` slugs when relabelling menu items (or update both specs); keep the HUD's formation `<select>` first and the briefing/setup seed as the first `input[type="number"]`; a Showcase menu item (D5) adds a slug but breaks nothing; D6's multi-fleet custom screen must keep `data-count="sideB:<classId>"` inputs (or change `game.spec.ts:121-122`); D1 must keep `.menu-info` containing `Prime/Apex` and `[data-timeline="prime_apex"]`'s screen containing `Homeworld Defence Rule`, or edit `game.spec.ts:115, 118`.

### 9.5 Scripts that exercise the app but are not tests

`scripts/headless-battle.ts` (`npm run sim -- <scenario> <preset> <seed> [fixed|rules]`, prints winner, per-side losses by class, Reaper assessment and the first 12 kills); `scripts/perf.mjs` (`npm run perf`, Playwright-driven frame timing on the Final Battle); `scripts/screenshots.mjs` and `scripts/showcase.mjs` (Playwright, drive `window.reaperwar` for stills/clips). None run in CI.

---

## Appendix A. The Apex reference pack (`docs/apex/reference/`, commit `01b1fef`)

User-supplied, ChatGPT-generated reference text. Per the project rules it is **not** canon authority: its `CANON` rows are claims to check against `LORE_REFERENCE.md` (and the codex text) before anything is tagged `CANON_CONFIRMED`; everything else it contains is AU or tunable.

### A.1 Files

| file | size | what it is | where the implementation agents will look |
| --- | --- | --- | --- |
| `README.md` | 3.2 KB | pack overview; continuity summary (no Crucible, Black Fleet, 38 420 warships at Sol, Reaper 2 000 capitals + 40 000 destroyers AU preset; Sol: 480 capitals + 12 000 destroyers) | D1/D13 captions |
| `APEX_Fleet_Reference.md` | 53.6 KB, 13 sections | §1 evidence labels + locked rules (L9-43); §2 canon anchors C01-C11 (L44-80, table L48-59, technology rules L69-77); §3 roles/visual design, named ships (L81-148); §4 weapons and DKE (L149-191: damage unit L151-159, weapon table L165-178, **Titan/HADES L182-190**); §5 starting combat profiles (L192-238: table L196-209, **calibration rules L213-220**, faction modifiers L226-237); §6 **Valkyrie** (L239-264, legacy Nova L259-263); §7 Cerberus redemption (L265-283); §8 Sol order of battle (L284-323); §9 Reaper order of battle and campaign accounting (L324-383); §10 **drive sacrifices** (L384-416); §11 simulator process (L417-486: resolution order L425-434, formulas L436-444, large-fleet statistics L454-458, **presets L460-469**, victory/defeat L471-479); §12 continuity pitfalls (L487-502); §13 source register (L503+) | D2, D3, D7, D8, D9, D10, D13 |
| `APEX_Montage_Prompts.md` | 42.4 KB, 8 sections | §1 creative direction (L11-49), §2 source prep (L50-70), §3 master prompts (L71-96), §4 24 shot cards (L97-388; **cards 16-23 at L279-374**, see A.6), §5 music cues (L389-409), §6 dialogue and caption bank (L410-489), §7 Resolve workflow (L490-523), §8 publication limits (L524+) | D4 beats, D5 scene data, D10 Reaper behaviours, D11 effects |
| `apex_simulator_data.json` | 78.4 KB | `schema_version`, `evidence_policy`, `units` (DKE 38.72 kt), `canon_inventory`, `continuity`, `weapons[16]`, `hull_profiles[27]`, `named_hull_catalog[12]`, `apex_alliance_establishment`, `sol_coalition`, `reaper_campaign`, `readiness_distribution`, `retrofit_allocation`, `special_systems` (hades_penetrator, legacy_nova, drive_attack), `tactical_model`, `presets` (canon_me3_reference, apex_core_sol, apex_legacy_high_power), `sensitivity_axes`, `story_targets_not_simulated_outputs`, `validation_scope`, `sources` | D1 preset flags, D2 starting values, D7-D9 parameters |
| `validation_results.json` | 1.3 KB | arithmetic checks; `energy_results` (DKE 38.72 kt, Titan 47.8 kt, Nova core 107.55 kt, legacy Nova 2164 kt); `isolated_barrier_trials` 2 DN never / 3 DN 18 s / 4 DN 8 s (no return fire); explicit `limits` | D3 target shape |

### A.2 Label mapping (pack → `Provenance`, `src/core/provenance.ts:7-11`)

`Sourced<T>` carries one tag plus a free `note`; when two pack labels apply, pick the tag by the first matching row and put the second label in `note`.

| pack label (pack definition) | our tag | rule |
| --- | --- | --- |
| `CANON` — "a statement or quantity in the released games or their codex" | `CANON_CONFIRMED` **only after** the statement is found in the codex text and listed in `LORE_REFERENCE.md §Canon anchors`; otherwise `CANON_INFERRED` with `note: 'pack CANON claim, unverified'` | the pack cites fandom/gamebanshee transcriptions (`sources` C01-C11), which is secondary evidence |
| `DERIVED` — arithmetic from stated inputs | `CANON_INFERRED` when every input is canon (e.g. 20 kg × 4 025 km/s → 38.72 kt); `AU_MODIFIED` when any input is AU (Titan 47.8 kt, Nova 107.6 kt) | the pack warns the inputs "can themselves be AU" |
| `AU LOCK` — accepted working number of the user's project (Valkyrie 2 000 m, Alliance 15 292 hulls) | `AU_MODIFIED`, `note: 'AU LOCK'` | never shown under canon |
| `AU PROPOSAL` — new specification supplied by the pack (Black Fleet 420 warships, Titan/HADES, drive attacks, Valkyrie core spec) | `AU_MODIFIED`, `note: 'AU PROPOSAL'` | lead decisions D1/D7-D9 adopt these; still AU |
| `SIM` — tunable game parameter | `SIMULATION_ESTIMATE` for a value on a canon hull/weapon; `AU_MODIFIED` (+ `note: 'SIM calibration value'`) for a value that exists only in the AU (Valkyrie, Titan, Oculus profile) | D2: starting values, adapted, not copied |
| `UNKNOWN` — canon gives no number | no value (JSON `null` in the pack); if the sim needs one, `SIMULATION_ESTIMATE` with `note: 'canon gives no value'` | never promote to canon |

The JSON `evidence_policy` strings (`canon`, `au_lock`, `au_proposal`, `sim`, `derived`, `unknown`) are the same six labels in lower case; `named_hull_catalog[].model_values_status` uses compound labels (`SIM_AU`, `SIM_AU_EXCEPT_LABELLED_CANON`, `AU_LOCK_LENGTH_OTHERWISE_AU_PROPOSAL_SIM`) that resolve by the same rows. UI: `provenanceBadge()` (`ui/dom.ts:46-50`) already renders `AU_MODIFIED` as the orange `au` badge; codex AU blocks are keyed by preset id (`codex/entries.ts`), so every pack-derived entry needs `au.prime_apex` (and `au.apex_legacy`) text, never a `canon` block.

### A.3 Id mapping and DKE comparison (pack `hull_profiles`/`weapons` → ours; 1 DKE = 1000 points, D2)

| pack hull (barrier / structure / recovery, DKE) | ours (barrier / hull / armour / regen, points) | note |
| --- | --- | --- |
| `DN_STD` 1.4 / 1.0 / 0.06 | `alliance_dreadnought` 5200 / 9000 / 130 / 55 (turian 5000/9500/150, asari 6800/8500/110, salarian 5800/8200/105, geth 5800/10500/140) | our DN pools are ~4-9× the pack's relative to a slug; the pack has no armour pool (uses `thermal_armour_coupling 0.5`) |
| `CA_HEAVY` 0.65 / 0.55 / 0.035 (gun `W_CA` 0.154 DKE / 2.5 s) | — no heavy-cruiser class; nearest `turian_cruiser`/`cerberus_cruiser` (340-point guns) | D6 presets may want one; D8 escorts |
| `CL_STD` 0.35 / 0.25 / 0.025 (gun `W_CL` 0.062 DKE / 3 s) | `alliance_cruiser` 1600 / 2400 / 45 / 28, gun 320 / 3 s | our cruiser round is 5× the pack's |
| `FF_STD` 0.12 / 0.08 (gun `W_FF` 0.0044 DKE / 2 s) | `alliance_frigate` 450 / 520 / 12 / 14, gun 70 / 1.5 s | our frigate round is 16× the pack's |
| `FF_THANIX` (`W_THANIX` 0.35 DKE / 5 s + `W_JAVELIN` 1.3 DKE / 20 s, 4 rounds) | `alliance_frigate_thanix` (Thanix 672 per burst / 6 s + 2 torpedo tubes 260 × 8 rounds) | pack Thanix cadence 5 s is tagged `CANON_BASE_TECHNOLOGY` — verify (A.5) |
| `CV_STD` 0.9 / 0.65, 48 craft | `alliance_carrier` 3800 / 7000 / 90 / 45, 24 `alliance_fighter` | |
| `COR_AUX`, `AUX_ARMED`, `PLATFORM_HEAVY`, `SUPPORT_TANKER`, `SUPPORT_REPAIR`, `RR_TRANSPORT`, `RR_PROCESSOR`, `COLLECTOR_CRUISER`, `DN_KWUNU`, `FF_SR1` | — none | candidates for D4's statistical "distant engagement" layer and captions only (D13), not hulls |
| `DN_VALKYRIE` 4.0 / 2.5 / 0.14 (`W_NOVA_CORE` 2.78 DKE / 6 s, `W_THANIX_HEAVY` ×3 at 1 DKE / 5 s, GARDIAN) | — new class (D8), role `dreadnought`, faction `alliance`, no `fighterComplement`; lineage of `alliance_frigate_thanix` for the builder (`rendering/ships/alliance.ts:182`) | `hyperMassAccelerators` substitution would replace its spinal gun — give the Nova its own id and exclude it from the hyper-MA predicate (`rules.ts:242-251`) |
| `DN_CERBERUS` 1.7 / 1.2 / 0.075 (`W_TITAN` 1.23 DKE kinetic / 6 s + heavy Thanix) | `cerberus_dreadnought` 5400 / 8800 / 125 / 60, today armed with `alliance_dn_main` | D7: the Titan gun is `apex_hyper_ma` renamed; today it is fitted by substitution to **every** organic dreadnought, not only the Black Fleet |
| `FTR_INTERCEPTOR` / `FTR_TORPEDO` | `*_fighter` (gun ×2 + 1 torpedo tube × 2 rounds) | ours combine both roles |
| `RR_CAP` 6.0 / 4.0 / **1.1** (`W_REAPER_MAIN` 7.75 DKE packet / 6 s, 65 % kinetic + 35 % thermal) | `reaper_capital` 42000 / 32000 / 320 / 240, two beams 5.32 DKE per 2.8 s burst / 7.5 s | our Sovereign has 7× the pack's barrier (vs the slug) but a quarter of its recovery rate and none while under fire |
| `RR_HARBINGER` 9.0 / 6.0 / 1.1 | `harbinger` 58000 / 44000 / 380 / 300, three beams | |
| `RR_DESTROYER` 0.22 / 0.16 / 0.018 (`W_REAPER_DESTROYER` 0.31 DKE / 2 s) | `reaper_destroyer` 6500 / 3200 / 160 / 80, beam 1.25 DKE per 2.4 s burst / 6.5 s | our destroyer is ~30× tougher than the pack's relative to a slug — the cruiser-vs-destroyer target (D3) hinges on this row |
| `OCULUS_DRONE` 0.005 / 0.004 (`W_OCULUS` 0.006 DKE / 1 s) | — new `reaper_oculus` fighter-role class + weapon (D4), launched through `fighterComplement` on Reaper classes (§2.3) | |
| `DN_ASCENSION` 2.4 / 1.7 / 0.1 (`W_DN` ×2) | `destiny_ascension` 14000 / 20000 / 200 / 120, `ascension_main` 2600 | |
| `DN_GETH` 2.0 / 1.4 / 0.085 | `geth_dreadnought` 5800 / 10500 / 140 / 65 | |
| `FF_SR2` 0.35 / 0.2 / 0.03 (`W_THANIX` ×2) | `alliance_frigate_thanix` | |

Weapons without a hull row above: `W_DN` = `alliance_dn_main` (1 DKE ✓; cadence **2 s CANON** vs our 4.0; pack `magazine_shots 200`, `heat_per_shot 0.08`, `requires_bow_solution true`); `W_TORPEDO` = `disruptor_torpedo` (0.7 DKE vs our 0.26; magazine 8 ✓; `interceptable`, `projector_attack`); `W_GARDIAN` = `gardian` (`point_defence`, no magazine); `W_LIGHT_DEFENCE`, `W_COR`, `W_JAVELIN` = none. `special_systems.hades_penetrator`: `kinetic_weapon_id W_TITAN`, optional 350 kt internal payload = **9.04 DKE after a confirmed penetration**, `default_special_rounds_per_capable_hull 12`, `retrofit_allocation.hades_capable_dreadnoughts 12`, no internal damage on interception/deflection. `special_systems.legacy_nova`: 20 kg at 0.1c = 2164 kt, `model_cycle_s 60`, `model_magazine_shots 12`, `enabled_core false`. `special_systems.drive_attack`: `enabled_canon false`, `enabled_apex_core true`, `max_attempts_sol 3`, `commitment_window_s 40` (tuning 20-60), `pre_interception_completion_probability 0.25`, `target_kill_on_confirmed_completion true`, conditions `working_propulsion_path, terminal_command_decision, target_alignment, friendly_corridor_clear, intercept_and_evasion_tests_passed`. `tactical_model`: `recommended_step_s 0.25` (ours 0.05), `harbinger_death_disables_others false` (= D10), `barrier_recovery_after_volley true`. `presets`: `canon_me3_reference` (all AU systems false), `apex_core_sol` (`titan_hades`, `valkyrie`, `drive_attack` true, `legacy_nova` false, `crucible` false, `alpha_loss_fraction 0.25`), `apex_legacy_high_power` (`legacy_nova`, `exceptional_teraton_events` true) — this is the D1 preset family; our `RuleSet.special` needs flags for `titanHades`, `valkyrie`, `driveAttacks`, `legacyNova` (schema route in §3.4).

### A.4 Mass-scale numbers (D13: captions and strategic counters only)

`README.md`/§8-§9: Alliance 15 292 hulls = 13 292 warships + 2 000 support (48 DN, 144 CV, 1 600 CA, 7 500 FF, 4 000 corvettes); Sol commitment **38 420 coalition warships + 612 fixed heavy platforms** (`sol_coalition.mobile_warships`, `fixed_heavy_platforms`, `heavy_mobile_combatants 1287`); Reaper AU census 2 000 capitals + 40 000 destroyers + 11 000 specialist (`reaper_campaign.initial`), Alpha ambush losses 25 %, Sol start 480 capitals + 12 000 destroyers (`sensitivity_axes.reaper_sol_capitals [360, 480, 720]`). The lead's "53,000 Reapers" is the 2 000 + 40 000 + 11 000 total. None of these are simulated hulls (`MAX_SHIPS_PER_SIDE = 70`, `engine.ts:23`); they belong in `BattleConfig.worldState` strings and HUD/scene captions labelled AU.

### A.5 Pack "CANON" claims that must be verified before they are trusted

Compared with `LORE_REFERENCE.md §Canon anchors` (our accepted list): already covered there — dreadnought 20 kg / 4 025 km/s / ~38 kt / 2 s (C01), Reaper capital ~2 km and 132-454 kt (C02), destroyer ~160 m (C02), Farixen ratios (C04), GARDIAN heat limits, disruptor torpedoes, Thanix origin, carriers. **Not yet in LORE_REFERENCE.md** (verify against the codex text, then add an anchor line, or keep `CANON_INFERRED`): the four-dreadnought benchmark "two resisted, three strain, four typically destroy" (C02, the D3 target — the lead has adopted it, so the anchor line must be added when the calibration lands); "a cruiser can kill a destroyer if it survives into effective range" (C02); dreadnought inventories 2183 (turian 37, asari 21, salarian 16, human 6 + 1) and 2185 (39, 20, 16, 8) (C01/C03); Thanix "five-second firing cycle" and "eleven months after the Citadel battle" (C01); Reaper transit "~30 light-years per day" (C02); quarian fleet ~50 000 vessels (C06). The pack itself flags the legacy "2 kg / 283 km/s" transcription (C03) as contradictory — do not use it.

### A.6 Montage shot cards 16-23 (`APEX_Montage_Prompts.md`), the source of D5's first scene

| card | lines | beat (what the sim must produce) | caption / line offered |
| --- | --- | --- | --- |
| 16 Hackett sees the coalition | 279-289 | layered arrival waves; foreground ships hold vectors while distant echelons complete transit | `38,420 WARSHIPS COMMITTED TO SOL` (AU; "must not imply a single instantaneous transit") |
| 17 The Black Fleet joins the line | 291-299 | a Cerberus formation brakes into a gap beside Alliance ships and fires on a target already engaged by allied heavy guns | `CERBERUS BLACK FLEET — ALLIED IFF CONFIRMED` |
| 18 Cerberus protects the Ascension | 301-309 | a damaged Cerberus heavy cruiser interposes between the Destiny Ascension and a Reaper attack, keeps firing, exposes the Reaper to the Ascension's salvo | none |
| 19 Valkyrie earns its shot | 311-321 | escort torpedoes disrupt the target's protection; Valkyrie spinal round + three heavy Thanix channels hit the same damaged region in a tight interval; the Reaper fails at that region (D8 bonus-only-when-degraded rule) | `TARGET SOLUTION SHARED. FIRE CONCENTRATED.` |
| 20 A Reaper meets the line | 323-333 | camera above/behind the Reaper looking down its vector; it kills a foreground escort, the formation opens around the wreck and keeps a common firing solution; the Reaper shifts to the most dangerous battery (D10 "kill the active gun platform") | `Your resistance will be corrected.` / `THE FORMATION DID NOT BREAK.` |
| 21 Drive attack in the battle chaos | 335-347 | crippled Cerberus cruiser, one engine, cleared corridor far from Earth; blue-white drive flare, one abrupt flash, armour fragments along the collision vector; distant camera, silent; neighbours keep firing (D9) | `DAMPING FAILURE. TERMINAL VECTOR CONFIRMED.` / `BLACK FLEET DRIVE ATTACK — CAPITAL KILL CONFIRMED` |
| 22 Harbinger continues fighting | 349-361 | damaged Harbinger rotates, destroys a threatening gunship, tries to reach a screened exit; allied units cover it; a second coordinated volley hits damaged machinery → limbs lose support, weapon cuts out; **other Reapers stay active** (D10) | `This cycle is not concluded.` / `HARVEST COMMAND VESSEL — MISSION KILL` ("mission kill is not confirmed destruction") |
| 23 Shepard looks at the next target | 363-374 | reaction shot; tactical light changes as a major Reaper disappears from the display; then the next contact | `Mark the next one.` |

Pack rules that bind the scene (cards' *Continuity* notes and `README.md`): captions are the only place for the 38 420 figure; the drive attack is one shown event, never a map-wide damage radius; Valkyrie uses the core spec (the near-c gun is a separately labelled option); Harbinger's fall does not switch off the others.
