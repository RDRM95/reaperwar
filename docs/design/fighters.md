# Fighters and small craft — family sheet

One row per fighter-sized class (`tests/silhouette.test.ts` accepts a row here in place of a sheet). Every craft here is rendered at the **2× small-craft convention** (`KNOWN_ISSUES.md`: fighters are drawn at twice their catalogue size so they are visible at fleet scale), so `lengthUnits` in `silhouettes.json` is `2 × lengthM / 100` for the MEASURE rows and 0.24 for the 12 m Oculus (AP §12). Small craft draw through the instanced small-craft path and switch to points at distance; a `Flight` of four (AP §21.3) renders as four instanced craft in a fixed finger-four offset pattern about the flight's position; kinetic barriers on small craft are the only sphere shells in the renderer (`effects.md` §3).

## Rows

| Class | Name | Faction | Length (m) · units | Status | Builder today | Silhouette and signature | Colours and lights (hex) | Must read as | Screenshots |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alliance_fighter` | F-61 Trident fighter | alliance | 18 (`SIMULATION_ESTIMATE`) · 0.36 | MEASURE | `alliance.ts` `buildAllianceFighter()`: tapered fuselage, a straight 0.4-unit wing, two tail pods with twin exhausts, a canopy block | a compact single-seat strike fighter: straight wing, twin tail pods, canopy forward; a torpedo under the belly | hull `0xb9c1cc`, pods `0x3b4350`, canopy `0xcfe8ff`, exhausts `0x5fb8ff`; far point `0x4fb8ff` | an Alliance fighter: pale, straight-winged, twin blue-white exhausts; the named Trident of the war assets | `alliance_fighter_bow.png`, `_profile.png`, `_3q.png` |
| `turian_fighter` | Hierarchy interceptor | turian | 17 (`SIMULATION_ESTIMATE`) · 0.34 | MEASURE | `turian.ts` `buildTurianFighter()`: narrow fuselage, a 0.32-unit wing, a single dorsal blade fin, one exhaust | a dart with a dorsal blade: the turian language in miniature | hull `0x8a98a8`, fin `0x2e3540`, canopy `0xe0f4ff`, exhaust `0x9fe0ff`; far point `0x9fe0ff` | a turian interceptor: steel grey, blade fin, one cyan exhaust | `turian_fighter_*.png` |
| `salarian_fighter` | Union interceptor | salarian | 18 (`SIMULATION_ESTIMATE`) · 0.36 | MEASURE | `salarian.ts` `buildSalarianFighter()`: slender tapered body, a thin half-length wing, a stern pod, one exhaust | slender and needle-like; the Union's pale green glow | hull `0xb9c8b4`, dark `0x2d3b33`, canopy `0xeaffe0`, exhaust `0xb8ffa0`; far point `0xb8ffa0` | a salarian craft: slim, pale green exhaust, lighter than every other fighter | `salarian_fighter_*.png` |
| `cerberus_fighter` | Cerberus fighter | cerberus | 17 (`SIMULATION_ESTIMATE`) · 0.34 | MEASURE | `cerberus.ts` `buildCerberusFighter()`: tapered fuselage, a 0.36-unit wing, a dorsal wedge fin, an orange stripe band on the wing, one exhaust | white hull, black fin, orange band: the Cerberus identification at fighter scale | hull `0xe8e8e4`, fin `0x1a1b1e`, band `0xff8a1f`, exhaust `0xffb060`; far point `0xffb060` | a Cerberus fighter: white with the orange band and an orange exhaust | `cerberus_fighter_*.png` |
| `geth_fighter` | Geth fighter | geth | 16 (`SIMULATION_ESTIMATE`) · 0.32 | MEASURE | `geth.ts` `buildGethFighter()`: a blunt tapered body with a single lit optic at the nose, two dark stub wings, one exhaust | an unmanned craft: no canopy, a single white optic forward | hull `0xd8dde3`, stubs `0x4a5260`, optic `0xffffff` (emissive `0xd8e8ff`, 2.2), exhaust `0xe8f0ff`; far point `0xe8f0ff` | a geth drone: no cockpit, one bright optic, white exhaust | `geth_fighter_*.png` |
| `quarian_fighter` | Migrant Fleet fighter | quarian | 18 (`SIMULATION_ESTIMATE`) · 0.36 | MEASURE | `quarian.ts` `buildQuarianFighter()`: a stubby fuselage, a 0.34-unit wing, an offset dorsal module, one exhaust | a patched civilian-looking craft with an asymmetric module | hull `0xb59d78`, module `0x4a3f33`, exhaust `0xffe0a0`; far point `0xffe0a0` | a quarian craft: tan, patched, amber exhaust | `quarian_fighter_*.png` |
| `reaper_oculus` | Oculus | reaper | 12 (`CANON_INFERRED`: a fighter-sized drone in the games; not stated) · **0.24** | **TARGET** (0.24 / 1.0 / 1.0) | none — A11 `ships/oculus.ts` `buildOculus()` | an original **12 m sphere with a single red lens**: a near-black ball of plated segments, the lens a red disc with an iris on one face; no wings, no exhaust nozzle | hull `0x0e1016`, plates `0x161a22`, lens `0xff5a1f` with iris `0xffb060` (emissive 4.5), seams `0x7fb4ff`; far point `0xff4a3a`; beam core `0xff6a40`, glow `0xa00010` | the Oculus: a sphere with one red lens, Reaper-black, a short red beam; a swarm of red points streaming from a Reaper | `reaper_oculus_*.png`; `sc-oculus-swarm.png` (CD §6.3 #04) |

## Oculus notes (canon drone; the launch is an extrapolation)

- Provenance: the drone is canon (encountered defending the Collector base in the second game; `designProvenance: canon(...)`, original model); every number is `SIMULATION_ESTIMATE` (hull 48 / armour 5 / no barriers; speed 3.6 / accel 1.8 / turn 110; `oculus_beam` 48/s × 1.0 s, cooldown 2.4 s, range 3.5). The **complements** (`reaper_capital` 8, `reaper_destroyer` 2, `harbinger` 12, launched 2 per 0.4 s) are `SIMULATION_ESTIMATE` with the note that Reaper warships launching Oculi in a fleet battle is an extrapolation; the codex says so in an estimate paragraph, never a canon one.
- Rendering (AP §11.9, A11): instanced small-craft path; far colour `0xff4a3a`; the 1 s beam renders through the beam pool at radius `0.02 × intensity` in the Reaper beam colours; kinetic-barrier sphere never shows (no barriers).
- Must read as: a sphere with one red lens. In a swarm shot the lenses are the red points; the beams are short red lines.

## Movement and animation (brief §15.3, fighters row)

- Fighters and Oculus drones make **strafing passes with roll-outs**, never orbits (brief §8.1): a run in, a firing pass, a roll-out and a climb or dive away, repulsed by the target's point-defence envelope.
- Bank: not numbered by the brief; *proposal* up to 70° so a pass reads as aerobatic; pitch with vertical acceleration. The Oculus is a sphere, so its roll is invisible: the pass is read from the trajectory and the beam; *proposal* the lens leads the velocity vector.
- Instanced path: the main-drive glow follows throttle; no per-craft thruster puffs (cost).
- Torpedo runs: fighters launch their torpedo on the way in; Tridents return to a carrier to rearm (the only craft ever flagged `escaped`).
- Flights: a `Flight` of four holds the finger-four pattern; members drop out on `flight_member_lost`.
- Deaths: a small burst; no three-stage sequence.

## Frozen screenshot set

Per row above, three frames each under `e2e-screenshots/` with the gallery framings of README §5 (`<classId>_bow.png`, `<classId>_profile.png`, `<classId>_3q.png`); at 2× the craft fill the frame at the gallery distance the script sets per class.

## Status

Six MEASURE rows (INTEGRATION measures the 2× templates and locks) and one TARGET row (`reaper_oculus`, 0.24 / 1.0 / 1.0, pinned by `tests/silhouette.test.ts` once A11 lands).
