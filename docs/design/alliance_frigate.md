# Alliance frigate (`alliance_frigate`)

| | |
| --- | --- |
| Faction · role | alliance · `frigate` |
| Length | 170 m — `CANON_INFERRED` (Alliance frigates of the SR-1 lineage are canon at roughly 150–200 m); render length **1.7 units** |
| Status | **MEASURE** (untouched by V2; INTEGRATION measures and locks) |
| Canon / AU | canon class; original hull in the Alliance frigate visual language |
| Builder today | `src/rendering/ships/alliance.ts` `buildAllianceFrigate(false)` at 1.7 units: a 0.28 × 0.2 tapered fuselage, a raised cockpit on a short neck, **swept wings with tip nacelles** (nacelle centres at x ±0.78, radius 0.08 → beam ≈ 1.72 units, ≈ 1.0 L), a dorsal fin, a ventral weapon bay, twin main thrusters at the stern, a blue dorsal stripe. Read from the builder: beam ≈ 1.0 L, height ≈ 0.24 L |
| Changes | none planned. A13's refactor to `buildAllianceFrigate('line' \| 'normandy' \| 'pattern')` keeps the line variant as today; polish is allowed within README §4 |
| Hardpoints | `alliance_frigate_main` ×1 (`[0, 0, 70]`), `disruptor_torpedo` ×2 (`[0, −4, 20]`), `gardian` ×2 (`[0, 8, 0]`) |

## Three-view silhouette

- **Bow**: a slim fuselage with the cockpit raised above it, the swept wings running out to two engine nacelles well apart from the body, a shallow ventral bay under the nose; wide and low.
- **Profile**: the cockpit raised forward, the fuselage tapering aft to the thruster block, the nacelles trailing behind the wings with their exhausts slightly aft of the fuselage's, a dorsal fin aft; a low, long shape.
- **Three-quarter**: the Alliance frigate lineage: split nacelles on swept wings, raised cockpit, blue stripe, four blue-white exhausts (two nacelle, two stern). The plainer sibling of the SR-2 hulls: no sensor spine, no two-tone stern block.

## Proportions (MEASURE — filled at INTEGRATION)

| Measure | Measured | Read from the builder (guidance only) |
| --- | --- | --- |
| length (z-extent) | — | 1.7 units |
| beam / length | — | ≈ 1.0 (the nacelles) |
| height / length | — | ≈ 0.24 |
| cockpit | — | raised, centred ≈ 0.28 L ahead of the hull centre |
| wings | — | rooted ≈ 0.15 L aft of centre, swept back; nacelles ≈ 0.4 L long |

## Signature features

1. **Split engine nacelles** at the wing tips.
2. The **raised cockpit** on a short neck.
3. **Swept wings**, a dorsal fin, a ventral torpedo bay.
4. Twin stern thrusters; four exhausts in all.
5. A single blue stripe on pale plating.

## Colours and lights (hex)

Alliance palette: hull `0xb9c1cc`, hullDark `0x3b4350` (nacelle bodies, fin, bay, thruster block), accent `0x1f5fb3` (stripe, wing-root markings), engine `0x5fb8ff` (emissive `0x3c9dff`, 3.2), windows `0xcfe8ff` (cockpit strip); drive and far-point `0x4fb8ff`; barrier shell `0x6fb0ff`; tracer `0xdff4ff`. Lights: cockpit strip, four exhausts.

## Must read as (brief §10: the Alliance frigate language; the plainer sibling of the SR-2)

What exists today: the lineage is there (nacelles, cockpit, wings). Polish: the line frigate should be told from the SR-2 hulls at a glance — no sensor spine, no two-tone, a plain stripe — which today's shared geometry already gives once the Normandy variant gains its spine.

- [ ] Split nacelles on swept wings; a raised cockpit.
- [ ] Plainer than the Normandy: no dorsal sensor spine, single-tone hull.
- [ ] Blue-white drives from four exhausts.
- [ ] About a third of a cruiser's length.

## Movement and animation (brief §15.3, line-frigate row; brief §8.1)

- Bank up to 55°; pitch with vertical acceleration; smooth roll-out when straight; the nose leads the velocity vector.
- Line frigates **flank in straight runs and turn-ins** (brief §8.1), not circles; they do not fly the stealth strike run and have no silent or venting state (the line frigate has no stealth block).
- Thruster points: nacelle and stern exhausts follow throttle; manoeuvring puffs at the nose cluster and the wing roots when turning or braking.
- Torpedo runs: the two disruptor tubes fire on the way in; GARDIAN flashes from the dorsal mount.
- Death: 1.1 s; a Reaper beam kill splits the hull along the beam plane.

## Frozen screenshot set

`e2e-screenshots/alliance_frigate_bow.png`, `e2e-screenshots/alliance_frigate_profile.png`, `e2e-screenshots/alliance_frigate_3q.png`.

## Status

MEASURE. INTEGRATION measures the delivered template, fills the table and the JSON, and locks.
