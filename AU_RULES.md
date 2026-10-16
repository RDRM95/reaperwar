# Alternate-universe rule engine

A timeline is a `RuleSet` (`src/timelines/rules.ts`): plain JSON, validated on import (`schema.ts`), never executed. Rules change the **effective statistics the simulation uses**, substitute weapons, scale scenario fleet counts and set strategic variables. They are never flavour text.

## Structure

- `organic` / `reaper`: 18 technology multipliers (mass accelerator damage/penetration/range, fire rate, heat capacity, barrier strength/regen, armour, hull, speed, sensors, electronic warfare, accuracy, fighter strength, torpedo damage, GARDIAN effectiveness, beam damage, crew quality). Canon = 1.
- `factionOverrides`: per-faction partial multipliers merged over `organic`.
- `special`: hyper-mass accelerators (dreadnought spinal gun → `apex_hyper_ma`), HADES rounds (kinetic rounds ignore 50 % of armour; barriers absorb only 60 % as much), Thanix availability (canon / fleet-wide cruiser refit / none), Reaper command vulnerability (each capital loss degrades Reaper coordination for ~30 s), indoctrination disabled.
- `fleetStrength`: per-faction multipliers on scenario ship counts (ignored when a scenario is built with `fleet_scaling: fixed`, which comparison mode uses).
- `strategic`: allied coordination (crew effectiveness), Reaper competence, indoctrination effectiveness, Reaper reinforcements, conventional victory possible, Crucible available, Shepard alive/effectiveness, Illusive Man indoctrinated, Cerberus stance, Harbinger/Catalyst operational, homeworld independence.

Prerequisites enforced on import: a dead Shepard has effectiveness 0; Cerberus control of the Reapers requires the Catalyst destroyed; an indoctrinated Illusive Man forces Cerberus hostile. Imported sets can never claim `canon` status.

## Presets

| Preset | Category | Key changes |
| --- | --- | --- |
| Canon Mass Effect 3 | canon | None. |
| Prepared Galaxy | AU | Fleets ×1.3–1.5, coordination 0.85, fleet-wide Thanix, modest crew/fire-rate bonuses. Reapers unchanged. |
| Humanity Ascendant | AU | Alliance only: MA damage ×1.5, barriers ×1.4, armour ×1.3, fleet ×2.2; Council coordination 0.35. |
| Cerberus Reformed | AU | Illusive Man unindoctrinated, Cerberus cooperative, Cerberus fleet ×2, EW/sensor bonuses. |
| Reaper Escalation | AU | Reaper fleet ×1.6, accuracy ×1.08, regen ×1.3, competence ×1.3, indoctrination ×1.3. |
| Prime/Apex — Successful Refuse | AU | Organic MA damage ×1.25 / penetration ×1.3, barriers ×1.35, armour ×1.3, hull ×1.15, fire rate ×1.1, sensors ×1.4, beams ×1.35; hyper-mass accelerators; HADES; fleet-wide Thanix; Reaper command vulnerability; coordination 0.9; homeworld independence; conventional victory possible; Cerberus Black Fleet cooperative. Reaper tech unchanged. |
| Cerberus Ascendant | AU | Shepard dead; Catalyst destroyed; indoctrination disabled; Illusive Man alone controls the Reapers; Harbinger independent; no Crucible. |
| Custom | custom | Starts identical to canon; editable, saveable, exportable. |

## Isolation guarantees (tested in `tests/timelines.test.ts`)

- `getPreset()` returns deep clones; mutating a returned set never changes canon.
- Canon effective stats equal catalogue values for every ship and weapon.
- Prime/Apex substitutions only occur when that rule set is active.
- Cerberus Ascendant and Prime/Apex are distinct continuities and share no special flags.

## Reference balance (identical fleets, `alliance_fleet_engagement`, seeds 7–9)

- Canon: Reaper victory; Alliance survival 7–8 %; 1–2 Reapers destroyed.
- Prime/Apex: Alliance victory; 7–19 ships lost including 1–3 dreadnoughts; all 12 Reapers destroyed.

Prime/Apex is deliberately a hard-won victory: the Reapers keep their weapons, numbers and doctrine.
