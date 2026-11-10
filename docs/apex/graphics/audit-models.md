# Graphics overhaul audit — ship models and the ship-generation code

Planning workflow, stage G-plan, 3 November 2026. Audited code: `src/rendering/ships/*.ts`, `src/rendering/geometry.ts`, `src/rendering/lod.ts`, `src/rendering/materials.ts` and the template consumers in `src/rendering/battleView.ts`, all at commit `d003988` on `stage/G-plan` (identical to `claude/mass-effect-reaper-war-simulator-fidrz2` for these files). Binding references: brief §16 (programme), §4, §8.8–8.10, §10, §15.3; `ADOPTION_PLAN.md` §11, §12, §21; `WORK_BREAKDOWN.md` §0.3, §2; `docs/design/SCALE_REFERENCE.md`.

## 0. Summary

1. **Every lathe-built hull renders inside-out, and its body is mirrored front-to-back.** `latheBody` (`geometry.ts:125-134`) rotates the lathe and then applies `scale(1, squashY, -1)`; the negative scale reverses triangle winding and the following `computeVertexNormals()` points the normals inward. Measured: 0 % of the Reaper body's 504 triangles and 0 % of the Reaper plates' 1,072 triangles are wound outward; same for the asari hulls, the Destiny Ascension's central body and the salarian bodies and drive pods. Under the default `FrontSide` the near wall is culled and the player sees the inside of the far wall (confirmed in software-GL renders, §5.1). The same mirror puts the Sovereign-class body on backwards relative to its arms, hood plates, eye and lights: the long tapering tail points forward between the arms, the blunt end faces aft, the tail emitter, the first ring of running lights and (on Harbinger) the first spine float in space behind the hull.
2. **The Sovereign-class is 15.2 units long against a 2,000 m hull the simulation already collides with** (24 % short), its body is 25 % of its length wide (target ≤ 14 %), its arms project only 4.4 units (29 %) past the body, the six "articulated limbs" are smooth tubes with two spheres each, and the aperture is a 56 m sphere on the belly of the forward taper. Harbinger has no in-game visual difference from a Sovereign-class except size and five cones: its `tint` only sets `BuiltShip.glowColor`, which nothing in the renderer reads. The destroyer is the capital builder with four forward arms at 128 m (160 m simulated); it has no legs and no stance.
3. **Alliance hulls are the wrong shape for their reference**: the Everest/Kilimanjaro model is 0.30 beam-to-length (target 0.16) with a single mid-ship tower instead of a full-length gun housing under a stepped superstructure; the cruiser is a 5.2-unit hull with down-swept fins (target: 7.0-unit York slab, 0.18); the "Normandy" is the line frigate with a 27 % longer fuselage and one black box, with a wingspan equal to the hull length (0.85–1.08 beam-to-length) and no SR-2 features. SSV Omaha does not exist in this branch.
4. **No hull instancing exists**: every ship is a cloned `Group` of 4–10 meshes plus 1–5 glow sprites, so the canon Final Battle of Earth (seed 1, 157 deployed hulls) costs 1,271 ship draw calls at full LOD and 380 at `reduced`; Prime/Apex (226 hulls) 1,815 / 518. Fighters cost 4–6 draw calls each.
5. **The LOD policy barely triggers for capitals**: `reduced` starts when a hull is ~17 px tall on a 1080p frame (108 km for a Sovereign-class, 62 km for an Everest) and `point` at ~1.7 px (1,078 km), so in an 80 km battle only fighters and distant frigates ever leave `full`; at `reduced` the drive glow disappears entirely (sprites and engine meshes both hidden) and several silhouettes change (asari fins, geth ring and spine plates, liveship domes are all "detail" materials).
6. Materials are flat `MeshStandardMaterial`s with no maps of any kind; the Reaper palette is mid grey-blue (`0x3c414b`) with red-orange lights, not the near-black, crimson and pale-blue-seam palette of AP §12.

Everything below is measured (Node, three 0.186, plus isolated software-GL renders), not estimated; §5.6 lists what was not measured.

## 1. Scope, method and honesty notes

- **Measured headlessly** with `scripts/_audit-models/measure-ships.mts` (gitignored scratch tool per `.gitignore` `scripts/_*`; run from the repo root with `node --import tsx/esm`): every `SHIP_CLASS_LIST` id built through `getShipTemplate`, per-mesh triangle, vertex and material counts, `Box3` extents of the group and of each mesh, what `DETAIL_MESH_NAMES` hides at `reduced`, draw calls (meshes + glow sprites), the LOD thresholds, the Final Battle order-of-battle totals, and flat-shaded three-view contact sheets from a tiny software rasteriser.
- **Face orientation** measured with `scripts/_audit-models/orientation-check.mts` (fraction of triangles whose winding normal points away from the mesh axis; agreement of winding with the stored normal attribute).
- **Rendered** with `scripts/_audit-models/render-check/` (exports each template's meshes and material parameters to JSON, rebuilds them in a page with the renderer settings and the light rig copied from `battleView.ts:83-112` — ACES 1.05, sRGB, PMREM `RoomEnvironment` at 0.35, sun 2.6, hemisphere 0.7, ambient 0.45, camera fill 0.9 — and screenshots it with the repo's Playwright Chromium under SwiftShader, flags as `playwright.config.ts`). These are isolated template renders, not in-battle frames; the sun direction was chosen by the audit, the game sets it from the environment.
- **Not measured**: frame times (SwiftShader, not representative; the task says to count instead); the in-game look of effects, barrier shells or death sequences; the stage-D design sheets on `stage/D-prep-sheets` (another stage's in-progress work; only `SCALE_REFERENCE.md` exists on this branch). GL triangle counts agreed with the headless counts (8,180 drawn vs 8,176 geometry triangles for a Reaper; the four extra are the two sprite quads).
- Reaper arm "windingOutward" values (0.55) are inconclusive by construction (the test uses the mesh axis; arms are off-axis). Only on-axis bodies and shells are read as inside-out, and for those the result is 0.00.

## 2. The pipeline as built

### 2.1 Registry, cache, instantiation (`src/rendering/ships/index.ts`)

- `BUILDERS` (`index.ts:16-49`): 32 ids, one builder function each, every current `SHIP_CLASS_LIST` id has one (`missingBuilders: []` measured). `hasModel` (`:126`) is strict on this map; `MODELLED_CLASS_IDS` (`:127`).
- `templates` (`:52`) caches one `BuiltShip` per class; `instantiateShip` (`:117-124`) does `group.clone(true)` — meshes share geometry and materials with the template, sprites are added per instance by `battleView.ts:157-167`.
- `BuiltShip` (`types.ts:3-14`): `group`, `engineNodes` (sprite positions), `lengthUnits`, optional `muzzle`, `glowColor`, optional `glowScales`. **`glowColor` is read by nothing** (`git grep glowColor src/rendering/battleView.ts src/rendering/effects.ts` is empty); sprites take `getFaction(faction).engineColourHex` (`battleView.ts:158`; Reaper `0xff2a1a`, `factions.ts:333`).
- **T2 placeholder fallback** (`index.ts:54-105`, owned by A after T2): `PLACEHOLDER_BY_ROLE` maps a role to a base builder — fighter → `buildReaperDrone()` for Reapers (a 0.12-unit emissive sphere, `:68-74`) else the Alliance fighter; frigate → `buildAllianceFrigate(false)`; cruiser → Alliance cruiser; dreadnought, super_dreadnought and fixed_platform → `buildAllianceDreadnought()`; carrier → Alliance carrier; the two Reaper roles → the Reaper builders. `buildPlaceholder` scales the base group by `lengthM / 100 ÷ base.lengthUnits`, wraps it in a **new outer `Group`**, scales `engineNodes` and `muzzle`, warns once per id and is cached like a template. Dormant today (every id has a builder) but it will carry the nine new CORE ids until A18 lands, with these consequences, all verified against the code paths:
  - `applyLod` (`battleView.ts:199-208`) and `finishDeath` (`:346-356`) iterate `group.children` only; the placeholder's only child is the inner group, so a placeholder ship never hides its detail meshes at `reduced` (its sprites still hide) and dies without hull pieces.
  - `normandy_sr2` would be the plain line frigate (`buildAllianceFrigate(false)`), not the Thanix variant; `alliance_dreadnought_k` an Everest at ×1.126; `normandy_valkyrie`, `alliance_super_dreadnought`, `turian_super_dreadnought` an Everest at 18–20 units with four drive sprites of `max(0.3, 20 × 0.11)` = 2.2 units each; `sol_defence_platform` / `sol_platform_heavy` an Everest at 12 / 14 units **with lit main drives and glow sprites** (`engineNodes` are kept); `cerberus_heavy_cruiser` an Alliance cruiser with blue stripes; `reaper_oculus` the drone sphere at `lengthM / 100` = 0.12 units — half the 0.24-unit small-craft convention AP §12 specifies, because the placeholder scale ignores the 2× fighter convention.

### 2.2 Assembly, materials, geometry helpers

- Seven of eight families use `assemble()` (`alliance.ts:33-49`): five `Parts` buckets (`hull`, `hullDark`, `accent`, `engine`, `windows`) are merged into **one mesh per bucket** (`merge()`, `geometry.ts:62-77`: drops attributes other than position/normal/uv, writes zero uvs where missing, converts to non-indexed) named after the bucket; `castShadow = false` (`:40`). Hence 4–5 meshes per hull and the LOD policy's name-based hiding. Reapers (`reaper.ts`) and the Ascension's prongs (`asari.ts:104-107`) add their own named meshes; the Reaper socket, tail glow and Harbinger spines are **unnamed** (`reaper.ts:146-148, 156-158, 168`), so no LOD rule can address them.
- Materials (`materials.ts:20-85`): one `FactionPalette` per faction, six `MeshStandardMaterial`/`MeshBasicMaterial` instances, **no textures, normal, roughness or emissive maps anywhere**; the `glow` slot is not referenced by any builder. Damage tint clones the `hull` material per damaged ship (`battleView.ts:312-318`) and death clones every piece's material (`:349-353`), so materials multiply with damage and deaths. Reaper palette measured: hull `#3c414b` (metalness 0.75, roughness 0.38, emissive `#140404` × 0.6), hullDark `#24272e`, accent (plates) `#4a505c`, engine (eye) `#ff3a1a` emissive × 4, windows (seams, iris, lights, tail glow) `#ff5030` emissive × 2.5. Blue ≥ red holds for the three hull slots (no brown), but none of the AP §12 values (hull `0x0e1016`, plates `0x161a22` with `0x1a2230` sheen, seams `0x7fb4ff`, running lights `0xd01030`, aperture `0xff5a1f` / `0xffb060`) is present.
- Geometry helpers (`geometry.ts`): `taperedBox` (a 1×1×1-segment `BoxGeometry` with a linear taper, 12 triangles — the whole box language has no bevels or panel lines), `wedge`, `zCylinder`, `taperedTube` (a `TubeGeometry` equivalent; its comment at `:114` promises a tip cap that is not built, so arm and prong tips are open), `latheBody` (§5.1), `plateStrip` (deterministic jitter), `merge`. `hexPrism` and the `M` constant are unused in `src/rendering`. `rot`/`at` are translate/rotate wrappers. No `Math.random` in any of these files (`git grep` empty); `battleView.ts:332-337` still uses it for the dying drift (A1's job).

## 3. Measured table — every template

Units: 1 = 100 m. `box` is the `Box3` of the whole template (x beam, y height, z length). `dc` = draw calls per instance (meshes + glow sprites) at `full` / at `reduced`. `tris` full / what `reduced` keeps. LOD distances from `lod.ts` (`REDUCED_FACTOR 70`, `POINT_FACTOR 700` × `lengthUnits`; fighters fixed 30 / 90 units), expressed in km (`KM = 10`).

| class | role | cat. m | units | box x · y · z | b/L | h/L | meshes+spr | dc | tris | reduced > km | point > km |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- | --- | ---: | ---: |
| alliance_fighter | fighter | 18 | 0.36 | 0.40 · 0.08 · 0.39 | 1.03 | 0.21 | 4+2 | 6/2 | 108/48 | 3 | 9 |
| alliance_frigate | frigate | 170 | 1.70 | 1.73 · 0.40 · 1.61 | 1.08 | 0.25 | 5+4 | 9/2 | 372/164 | 11.9 | 119 |
| alliance_frigate_thanix | frigate | 216 | 2.16 | 1.73 · 0.40 · 2.04 | 0.85 | 0.20 | 5+4 | 9/2 | 384/176 | 15.1 | 151 |
| alliance_cruiser | cruiser | 520 | 5.20 | 2.20 · 1.06 · 5.65 | 0.39 | 0.19 | 5+2 | 7/2 | 760/444 | 36.4 | 364 |
| alliance_dreadnought | dreadnought | 888 | 8.88 | 2.84 · 1.73 · 9.57 | 0.30 | 0.18 | 5+4 | 9/2 | 1,492/932 | 62.2 | 622 |
| alliance_carrier | carrier | 900 | 9.00 | 2.52 · 1.64 · 9.82 | 0.26 | 0.17 | 5+3 | 8/2 | 432/204 | 63 | 630 |
| turian_fighter | fighter | 17 | 0.34 | 0.32 · 0.14 · 0.36 | 0.89 | 0.38 | 4+1 | 5/2 | 72/36 | 3 | 9 |
| turian_frigate | frigate | 160 | 1.60 | 1.13 · 0.47 · 1.52 | 0.74 | 0.31 | 5+2 | 7/2 | 160/60 | 11.2 | 112 |
| turian_cruiser | cruiser | 560 | 5.60 | 3.45 · 2.03 · 5.99 | 0.58 | 0.34 | 5+2 | 7/2 | 760/444 | 39.2 | 392 |
| turian_dreadnought | dreadnought | 950 | 9.50 | 5.92 · 3.25 · 10.08 | 0.59 | 0.32 | 5+3 | 8/2 | 1,696/1,156 | 66.5 | 665 |
| salarian_fighter | fighter | 18 | 0.36 | 0.11 · 0.04 · 0.39 | 0.28 | 0.11 | 4+1 | 5/2 | 84/40 | 3 | 9 |
| salarian_frigate | frigate | 150 | 1.50 | 0.68 · 0.19 · 1.60 | 0.43 | 0.12 | 5+3 | 8/2 | 1,204/996 | 10.5 | 105 |
| salarian_cruiser | cruiser | 520 | 5.20 | 2.23 · 0.57 · 5.46 | 0.41 | 0.10 | 5+3 | 8/2 | 2,060/1,004 | 36.4 | 364 |
| salarian_dreadnought | dreadnought | 860 | 8.60 | 3.79 · 1.11 · 9.06 | 0.42 | 0.12 | 5+5 | 10/2 | 3,300/1,564 | 60.2 | 602 |
| asari_cruiser | cruiser | 500 | 5.00 | 1.01 · 1.01 · 5.19 | 0.19 | 0.19 | 5+1 | 6/2 | 756/368 | 35 | 350 |
| asari_dreadnought | dreadnought | 900 | 9.00 | 1.57 · 1.57 · 9.26 | 0.17 | 0.17 | 5+1 | 6/2 | 1,408/788 | 63 | 630 |
| destiny_ascension | dreadnought | 1,600 | 16.0 | 5.77 · 4.99 · 15.62 | 0.37 | 0.32 | 7+1 | 8/3 | 3,228/2,296 | 112 | 1,120 |
| cerberus_fighter | fighter | 17 | 0.34 | 0.36 · 0.11 · 0.36 | 1.00 | 0.30 | 4+1 | 5/2 | 72/36 | 3 | 9 |
| cerberus_frigate | frigate | 180 | 1.80 | 1.63 · 0.35 · 1.52 | 1.07 | 0.23 | 5+2 | 7/2 | 280/140 | 12.6 | 126 |
| cerberus_cruiser | cruiser | 560 | 5.60 | 1.16 · 0.85 · 5.98 | 0.19 | 0.14 | 5+2 | 7/2 | 388/216 | 39.2 | 392 |
| cerberus_dreadnought | dreadnought | 900 | 9.00 | 2.40 · 1.26 · 9.62 | 0.25 | 0.13 | 5+4 | 9/2 | 588/328 | 63 | 630 |
| geth_fighter | fighter | 16 | 0.32 | 0.34 · 0.06 · 0.34 | 1.00 | 0.18 | 4+1 | 5/2 | 92/36 | 3 | 9 |
| geth_frigate | frigate | 150 | 1.50 | 0.35 · 0.26 · 1.34 | 0.26 | 0.19 | 4+2 | 6/2 | 328/192 | 10.5 | 105 |
| geth_cruiser | cruiser | 520 | 5.20 | 1.00 · 1.21 · 5.54 | 0.18 | 0.22 | 5+2 | 7/2 | 676/372 | 36.4 | 364 |
| geth_dreadnought | dreadnought | 1,100 | 11.0 | 3.28 · 3.28 · 11.15 | 0.29 | 0.29 | 5+4 | 9/2 | 1,828/520 | 77 | 770 |
| quarian_fighter | fighter | 18 | 0.36 | 0.34 · 0.12 · 0.37 | 0.92 | 0.31 | 3+1 | 4/2 | 60/36 | 3 | 9 |
| quarian_cruiser | cruiser | 480 | 4.80 | 1.42 · 0.98 · 5.10 | 0.28 | 0.19 | 4+2 | 6/2 | 436/228 | 33.6 | 336 |
| quarian_heavy | dreadnought | 820 | 8.20 | 2.46 · 1.60 · 8.69 | 0.28 | 0.18 | 5+3 | 8/2 | 720/372 | 57.4 | 574 |
| quarian_liveship | carrier | 2,200 | 22.0 | 5.48 · 6.35 · 21.90 | 0.25 | 0.29 | 5+4 | 9/2 | 2,744/396 | 154 | 1,540 |
| reaper_destroyer | reaper_destroyer | 160 | 1.28 | 0.85 · 0.49 · 1.28 | 0.66 | 0.38 | 9+2 | 11/4 | 6,256/3,604 | 9.0 | 90 |
| reaper_capital | reaper_capital | 2,000 | 15.4 | 7.71 · 4.86 · 15.20 | 0.51 | 0.32 | 9+2 | 11/4 | 8,176/5,124 | 108 | 1,078 |
| harbinger | reaper_capital | 2,400 | 18.48 | 9.54 · 6.79 · 18.26 | 0.52 | 0.37 | 10+2 | 12/5 | 8,236/5,184 | 129 | 1,294 |

Whole-battle totals (ship hulls only; no launched fighters, effects or environment), from `buildScenario('final_battle_of_earth', rules, 1)`:

| order of battle | hulls | meshes | draw calls full / reduced | triangles full / reduced |
| --- | ---: | ---: | ---: | ---: |
| canon_me3, seed 1 | 157 | 894 | 1,271 / 380 | 299,164 / 174,996 |
| prime_apex, seed 1 | 226 | 1,239 | 1,815 / 518 | 343,804 / 200,088 |

The triangle budget is small (a whole Final Battle is under 350 k triangles); draw calls and material/mesh object counts are the cost, and the Reapers alone are 23 Reaper hulls × 11–12 = 263 draw calls at full LOD in both scenarios.

## 4. Family by family

Each entry: how it is built, measured proportions against `SCALE_REFERENCE.md` / AP §12, the likeness gaps against the brief's reference (brief §10 where no sheet exists on this branch), what the LOD policy does to it, and the verdict.

### 4.1 Reapers — `reaper.ts` (Sovereign-class `reaper_capital`, `harbinger`, `reaper_destroyer`)

**Built.** One `buildReaper(opts)` (`reaper.ts:25-196`) for all three, parameterised by body length `L`, arm count, `armLengthFactor` and `bodyRadiusFactor` (`:211, 214, 217`): capital `L 11, 6 arms, 0.8, 0.16`; destroyer `L 0.95, 4 arms, 0.75, 0.2`; Harbinger `L 13.2, 6, 0.8, 0.165, spines, tint 0xffa040`.
- Body: a 10-point radius profile (`:32-43`; widest at `−0.02 L … +0.08 L`, long taper to `−0.5 L`, short taper to `+0.27 L`) through `latheBody(…, 28, 0.8)` (`:44`), then a 6-fold cosine ridge plus an 18-fold ripple (`:46-54`), `computeVertexNormals`. 504 triangles, named `hull`.
- Plates: four partial lathe shells sampled from the body profile at `× 1.05–1.08` radius (`:62-83`) and three "hood" shells "stepping down toward the aperture" (`:85-99`), each with its own `rotateX` + `scale(1, 0.8, -1)` (`:80, 96`), merged into one `plates` mesh (1,072 triangles, `accent` material).
- Arms: per arm a 4-point `CatmullRomCurve3` from a root on the lower hull at `z = 0.1 L` sweeping outward and forward to `z = 0.1 L + armLen` (`:112-119`), a `taperedTube` with 30 × 10 segments and a 12 % sinusoidal radius ripple (`:122`), a thinner red "seam" tube (20 × 5, `:124-125`) and two knuckle spheres at t = 0.22 and 0.5 (`:127-130`). Arms distributed over the lower 240° (`:111-112`). 4,560 triangles (`arms`) + 1,200 (`seams`) for the capital — 70 % of the hull's triangles.
- Aperture: a sphere `0.16 R` at `(0, −0.45 R, 0.2 L)` (`:140-145`), an open socket cylinder (`:146-148`, unnamed) and a torus iris (`:150-153`, also named `eye`). `muzzle` = eye + `0.15 R` (`:193`); `engineNodes` = a tail node at `−0.46 L` and the eye with `glowScales [1, 2.2]` (`:190-191`).
- Tail emitter cylinder at `−0.44 L` (`:156-158`, unnamed, `windows` material); Harbinger spines: five cones at `−0.3 L … +0.1 L` (`:159-169`, unnamed); 24 running-light boxes of `0.04 R` on six rays (`:172-185`, `lights`).
- `lengthUnits = 0.5 L + armLen + 0.1 L` (`:192`) → 15.4 / 18.48 / 1.2825; the comment at `:210` ("arms reach to ≈ 2 km overall") is false.

**Measured anatomy (capital; Harbinger and destroyer scale the same way).**

| quantity | reaper_capital | harbinger | reaper_destroyer | target (AP §12, SCALE_REFERENCE) |
| --- | ---: | ---: | ---: | --- |
| overall z-extent (units) | 15.20 (declared 15.4) | 18.26 (declared 18.48) | 1.276 (declared 1.28) | 20.0 / 22.0 / 1.6 |
| body (`hull` mesh) z-extent, share of overall | 8.47, 56 % | 10.16, 56 % | 0.73, 57 % | 55–60 % (hood + spine) |
| body width × height | 3.81 × 2.78 (25 % of overall) | 4.70 × 3.45 (26 %) | 0.41 × 0.30 (32 %) | width ≤ 14 % of overall |
| body z range | −2.97 … +5.50 | −3.56 … +6.60 | −0.26 … +0.48 | long taper aft, hood forward |
| arms z range; reach past the body nose | +0.82 … +9.92; 4.42 (29 %) | +0.97 … +11.91; 5.31 (29 %) | +0.06 … +0.81; 0.34 (26 %) | ≈ 40 % of overall |
| beam / length, height / length | 0.51, 0.32 | 0.52, 0.37 | 0.66, 0.38 | 0.34, 0.34 / 0.38, 0.38 / 0.55, 0.60 |
| aperture | sphere 0.56 units at (0, −0.79, 2.46) | 0.70 at (0, −0.98, 2.97) | 0.06 at (0, −0.09, 0.22) | emitter at the base of the head between the arms |
| hood plates z | −2.42 … −0.22 (aft of the arm roots) | −2.90 … −0.26 | −0.21 … −0.03 | at the arm roots |
| parts floating outside the hull | tail glow −5.28 … −4.40, light ring at −3.52, tail sprite at −5.06 (hull ends at −2.97) | + first spine at −4.09 (hull ends at −3.56) | tail glow −0.47 … −0.37 (hull ends at −0.26) | none |

**Likeness gaps against the Sovereign-class.**
- *Head/hood orientation*: the mirror in `latheBody` reverses the body. The intended layout (readable from the code's own placements: tail emitter at `−0.44 L`, hood shells "stepping down toward the aperture", lights sampled from the pre-flip profile) puts the long tail aft and the hood at the arm roots; the built model has the thin tail pointing forward between the arms, a blunt stern, the hood plating on the aft half and the running lights sampled at the wrong radius (one ring floats, one is buried). Renders (§5.1) show a hollow, see-through body on top of this.
- *Six articulated forward limbs and joints*: arms are smooth rippled tubes with two spheres; no segments, no plated joints, no claw-like curl at the tips, tips are open tubes. The arm roots sit on the lower hull just forward of the widest ring, which is right, but the arms splay to a 7.7-unit beam (beam/length 0.51 against the 0.34 target).
- *Body-to-arm ratio*: by accident the body share is in the 55–60 % band, but the body is 25 % wide instead of ≤ 14 %, the overall is 15.2 instead of 20, and the arms project only 29 % past the body because the mirrored tail occupies the space the arms should dominate.
- *Magnetohydrodynamic beam emitter*: a small ventral bump 1.4 units ahead of the arm roots (3.7 % of the length), half buried; there is no "mouth" at the base of the head between the limbs, and the beam origin (`battleView.ts:288`) and the 2.2× eye sprite therefore sit on the belly of the taper.
- *Spine ridges*: a 6-fold cosine modulation on a 28-segment lathe plus Harbinger's five cones — no overlapping plating bands, no pale seams (seams are red and on the arms only).
- *Palette*: §2.2; additionally only Harbinger should carry yellow-orange, and today's `tint` has no effect (the `glowColor` field is unread), so every Reaper is identical in colour.
- *Destroyer*: the brief wants four legs dominating a stubby spine in a walking stance; the model is the capital's silhouette with four forward-swept arms, 20 % short of its 160 m.

**LOD.** `reduced` hides `plates`, `seams`, `lights` and both `eye` meshes but keeps `hull`, `arms`, the unnamed socket, tail glow and spines (11 → 4 draw calls, 63 % of triangles). The eye sprite also goes, so a Reaper loses its signature red eye at 108 km — in practice never, since the thresholds exceed any battle distance: a Sovereign-class is at `full` for the whole battle. The far point cloud is never reached (1,078 km).

**Verdict: rebuild** all three (A12 already plans it; the fix of `latheBody` must come first or the rebuild inherits the mirror). Lock the 20 / 22 / 1.6 extents from `Box3` as AP §12 says; keep the arm-distribution idea (lower 240°).

### 4.2 Alliance — `alliance.ts` (plus SSV Omaha)

**Everest-class `alliance_dreadnought`** (`:52-105`; the comment at `:51` calls it Kilimanjaro-class, the catalogue says Everest 888 m, AP §12 adds `alliance_dreadnought_k` at 10.0). Built from a central tapered box 0.78 × 0.62 × 6.93 (78 % of L, the "gun housing" **is** the hull), a 1.45-wide head wedge 2.4 long (`:58`), a ventral wedge, a 1.2-long muzzle cylinder and accent ring (`:61-62`), one dorsal block 1.9 long + a 0.7 bridge box amidships (`:64-66`), nine-plate window strips, two sponsons 0.9 × 0.3 × 4.2 at x ± 0.78 with dark fairings to ± 1.33, four turret boxes with barrels each (`:70-81`), a keel, four bow panel lines, two GARDIAN spheres, a four-nozzle engine block 1.7 wide (`:88-97`) and two dorsal stripes (`:100-101`).
- Measured 2.84 × 1.73 × 9.57: beam/length **0.30 (target 0.16)**, height/length **0.18 (target 0.12)**, z-extent +7.8 % over the declared 8.88 (the model is 957 m around an 888 m collision hull).
- Likeness: sponsons, a bow wedge and a muzzle are there, but there is no full-length spinal housing readable as such, no stepped superstructure running aft (one tower at mid-length), stripes on the top not the flanks, and the hull is nearly twice too wide — in the render it reads as a chunky grey block. 1,492 triangles, 872 of them in the `hullDark` greebles.
- LOD: 9 → 2 draw calls, 62 % triangles; windows and stripes vanish at 62 km.
- **Verdict: rebuild** as `buildAllianceDreadnought('everest' | 'kilimanjaro')` (A13) to the AP §12 ratios; the sponson/turret/panel-line vocabulary can be reused.

**York-class `alliance_cruiser`** (`:141-179`): tapered box hull 0.62 × 0.5 × 3.85, bow housing 0.9 × 0.6 × 1.5, muzzle, dorsal spine and bridge, window strips, **two down-swept fins** (0.9 × 0.12 × 2.4 rolled ∓ 0.35 rad, `:155-159`) carrying two turrets each, panel lines, twin engines, two stripes. Measured 2.20 × 1.06 × 5.65: b/L **0.39 (target 0.18)**, h/L 0.19 (0.14), +8.7 % over the declared length, 5.2 units against the 7.0 target. The fins are not Alliance language (brief §10: "York and Berlin cruiser language" = slab, raised stern block, forward wedge). **Verdict: rebuild** at 7.0 (A13).

**Frigate / Normandy `alliance_frigate`, `alliance_frigate_thanix`** (`:182-212`): a 0.28 × 0.2 tapered fuselage, a 0.2 × 0.14 × 0.5 "cockpit neck" box, two 0.75-span tapered wings yawed ∓ 0.45 rad with **tip nacelle cylinders 0.7 long at x ± 0.78** (`:191-199`), a 0.04-thick dorsal fin, a ventral bay box, a thruster block with two discs, one stripe; the Normandy variant only lengthens `L` to 2.16 and adds a 0.29 × 0.21 × 0.25 dark box at the stern (`:209`). The wings are absolute, not scaled with `L`, so measured beam is 1.73 for both: **b/L 1.08 (line) and 0.85 (Normandy)** — the wingspan equals or exceeds the hull length. No raised cockpit silhouette, no split nacelles, no dorsal spine, no lifting-body hull; the render shows a box with trapezoid wings and two cylinders. Engine sprites: four (two tips + two stern). **Verdict: rebuild** the family (A13's `line | normandy | pattern` variants; brief §15.1/§15.3 also need distinct thruster nodes for the attitude layer).

**Carrier `alliance_carrier`** (`:108-138`): hull 1.4 × 0.7 × 7.2, flight-deck slab 2.3 wide, dark deck, two lit hangar slots in side sponsons, an island, a bow wedge, three nozzles. Measured 2.52 × 1.64 × 9.82 (+9.1 % over 9.0). No reference in brief §10 (original design). **Verdict: refine** (fix the z-extent before lock-down; keep).

**Fighter `alliance_fighter`** (`:215-228`): 2× scale convention (0.39 units for an 18 m craft), 108 triangles, 4 meshes + 2 sprites = **6 draw calls per fighter**; 48 of its triangles are the two nozzle cylinders. All faction fighters follow the same pattern (4–6 draw calls, 60–108 triangles). There is no instanced small-craft path in this code (the only `InstancedMesh`es are tracers and missiles in `effects.ts:107, 122`). **Verdict: keep the geometry, move to the instanced path (A2).**

**SSV Omaha.** Not in this branch: no `alliance_super_dreadnought` class, no builder (`INTEGRATION_NOTES.md:3` makes it the lead ship of that class with a longer gun housing; AP §12 gives 18.0 units, two spinal channels, b/L 0.18, h/L 0.13). Until A17 the placeholder would draw an Everest scaled × 2.03. **Verdict: new build** (`heavyDreadnoughts.ts`), with the twin-channel bow and the standoff silhouette the notes ask for.

### 4.3 Turian Hierarchy — `turian.ts`

Built from a tall narrow tapered body (dreadnought 0.9 × 1.1 × 6.65, `:44`), `pincerBow` (two blades 0.39 wide at x ± 0.416 — a 0.026-unit gap, so the pincer is effectively closed and reads as a split wedge only from above; `:15-22`), a 1.4-tall `dorsalFin` (`:24-28`), `bladeWings` of 2.6 span each (`:30-38`), a ventral blade, six ribs, ten viewports, four turrets and three GARDIAN spheres per side, five dorsal ridge plates, three nozzles. Cruiser and frigate repeat the vocabulary; the fighter is a dart.
- Measured dreadnought 5.92 × 3.25 × 10.08: **b/L 0.59**, h/L 0.32; cruiser 0.58 / 0.34; frigate 0.74. The wings set a beam more than twice the AP target for the turian super-dreadnought (0.26) and would be locked at that width by the D12 MEASURE → LOCKED process if nothing changes.
- Likeness (brief §10 "turian pincer bows and blade wings"): the vocabulary is present and the render reads as turian-ish; the pincer needs an open gap and taller, thinner blades, the wingspan should drop to roughly a third of the length, the fins can stay.
- LOD: `reduced` keeps the silhouette (fins and wings are `hull`/`hullDark`), 68 % of triangles; viewports, ridge plates and wing accents vanish.
- **Verdict: refine** (open the pincer, narrow the wings, add a TARGET row for `turian_dreadnought`/`turian_cruiser` in `silhouettes.json` before lock-down); `turian_super_dreadnought` is a new build (A17).

### 4.4 Asari Republics — `asari.ts` (incl. Destiny Ascension)

`curvedBody` (`:15-33`): a 7-point lathe (24 segments, squash 0.8) from a 0.25 R stern to a 0.01 R point, an engine ring and a dark collar at the stern; `sweepingFins` (`:35-49`): 3 (cruiser) / 4 (dreadnought) flat slabs `0.12 R × 0.9 R × 2.2–4.2` rotated about z in the **`accent`** material with light strips; cruiser/dreadnought add viewports, collars, ventral domes and a bow gun. `buildDestinyAscension` (`:85-115`): `curvedBody(12, R 1.2)` + four `taperedTube` prongs (radius 0.55 → 0.165, 24 × 10) from radius 1.0 at z −1.5 to radius 2.6 at z +9.5 with light tubes, a 4.5-long gun cylinder, an accent ring.
- Measured cruiser 1.01 × 1.01 × 5.19 (b/L 0.19), dreadnought 1.57 × 1.57 × 9.26 (0.17), Ascension 5.77 × 4.99 × 15.62 (0.37 / 0.32).
- Orientation: the lathe body is inside-out (0 % outward) and mirrored — the sharp 0.01 R tip is at the stern under the engine ring and the blunt 0.25 R end is the bow carrying the gun (visible in the render: a wide rounded bow). The Ascension's central body likewise.
- Likeness (brief §10 "asari curved hulls and the four-prong Destiny Ascension"): the line hulls are plain cigars with flat rectangular fins; the four-prong concept is present on the Ascension but as thin tubes (0.55 R on a 1.2 R body) rather than the broad swept petals around the gun.
- LOD: the fins and collars are `accent`, the prong lights `windows` → at `reduced` the asari line hulls become bare cigars (silhouette change; 49–56 % of triangles), the Ascension keeps its prongs (`hull`, 71 %).
- **Verdict: refine** (orientation fix first; fins blended into `hull`; Ascension prongs widened into petals; keep the lathe language).

### 4.5 Salarian Union — `salarian.ts`

`slenderBody` (`:16-53`): a 7-point lathe body (22 segments), a separate "sensor head" lathe at `+0.36 L … +0.53 L` in `hullDark` (`:33-44`), a visor window at `+0.47 L` (`:45`), a stern drive ring and disc, a dorsal ridge and a keel; `outriggers` (`:56-81`): two `taperedTube` booms to lathe drive pods with engine discs and light strips; `sensorBlisters` (`:84-90`): sphere rows in `windows`. Fighter, STG frigate, cruiser, dreadnought (two pod pairs) compose these.
- Measured frigate 0.68 × 0.19 × 1.60 (b/L 0.43), cruiser 2.23 × 0.57 × 5.46 (0.41), dreadnought 3.79 × 1.11 × 9.06 (0.42). Triangle counts are high for the size (frigate 1,204 — more than the quarian heavy; dreadnought 3,300, the most of any non-Reaper) because of lathes, tubes and 16–20 blister spheres; 83 % of the frigate's triangles survive `reduced` because pods and booms are `hull`/`hullDark`.
- Orientation: body, head lathe and pods are mirrored and inside-out (hull outward 0.17–0.27 including the pods' off-axis noise); the mirrored head bulb lands at the **stern** on top of the drive ring while its visor window stays at the bow on the thin nose — the "head on a neck" design is physically disassembled.
- Likeness: no reference in brief §10 (salarian warships are not specified); original design acceptable. **Verdict: refine** (orientation fix; reunite head and visor; consider fewer blister spheres).

### 4.6 Geth — `geth.ts`

`gethHead` (`:15-30`): a tapered cylinder head with a dark collar and an optic disc, plus four hood plates — two built, **two mirrored with `plate2.scale(-1, 1, 1)`** (`:26-28`), which reverses their winding (measured: 22 % of the geth `hull` triangles disagree with their stored normals, i.e. those plates are back-face-culled from outside). `lattice` (`:32-38`): post boxes with light cubes. Dreadnought (`:41-71`): box hull, head, muzzle, a forward torus ring (R 1.5, `accent`, with a lit ring), seven 1.2 × 1.1 segmented spine plates (`accent`), lattice rows, dorsal/ventral fins, four nozzles. Cruiser/frigate/fighter scale the idea.
- Measured dreadnought 3.28 × 3.28 × 11.15 (the ring sets both ratios at 0.29); frigate 1.34 long for a declared 1.5 (−10.8 %).
- Likeness (brief §10 "geth hooded heads and lattice"): present and readable in the render.
- LOD: the ring, all seven spine plates and the optic are detail materials → `reduced` keeps only 28 % of the triangles and a plain box with posts: **the geth silhouette changes the most of any family at `reduced`.**
- **Verdict: refine** (rebuild the mirrored plates without a negative scale; move ring and spine plates to `hull`/`hullDark`; fix the frigate's extent).

### 4.7 Quarian Migrant Fleet — `quarian.ts`

`modules` (`:14-20`): bolted boxes with light strips, deterministic size jitter. Liveship (`:23-47`): a 14-segment cylinder 1.6–1.9 radius × 17.6 long, a bow block, **six hemispherical domes in the `windows` material** (emissive 1.4 — they render as glowing white blobs, not glazed domes) on accent collars, 16 modules, keel, four nozzles 0.5 radius. Heavy (`:50-71`): freighter box with a dorsal spinal gun cylinder, modules, bridge, six turret boxes. Cruiser and fighter likewise.
- Measured liveship 5.48 × 6.35 × 21.90 (h/L 0.29 from the domes), heavy 2.46 × 1.60 × 8.69, cruiser 1.42 × 0.98 × 5.10.
- Likeness (brief §10 "quarian patched modular hulls and liveship domes"): the language is present (bulky, patched, amber).
- LOD: domes are `windows` → the liveship keeps 14 % of its triangles and loses its only signature feature at `reduced` (154 km, never in practice).
- **Verdict: refine** (domes as glass over a frame in `hull`; otherwise keep).

### 4.8 Cerberus — `cerberus.ts`

Cruiser (`:19-42`): a wedge hull with two forward booms, dark panels, orange `stripes` (`:14-16`), a bridge, a ventral plate, twin engines; frigate (`:45-62`): the Alliance frigate layout with the same wing/nacelle approach (b/L **1.07**); fighter; AU dreadnought (`:77-101`): 9.0 units, white hull, sponsons, three turrets per side, stripes, four nozzles.
- Measured cruiser 1.16 × 0.85 × 5.98 (b/L 0.19, h/L 0.14), dreadnought 2.40 × 1.26 × 9.62 (0.25 / 0.13; AP §12 wants 10.0, 0.18 / 0.13 with a dorsal Thanix housing).
- Likeness (brief §10 "Cerberus charcoal-white-orange"): palette matches (`0xe8e8e4` / `0x1a1b1e` / `0xff8a1f`), the render reads as Cerberus-ish but crude (boxes).
- **Verdict: refine** (A15 re-base of the dreadnought, new `cerberus_heavy_cruiser`; the frigate should follow the rebuilt Alliance frigate family rather than keep the 1.07 wingspan).

### 4.9 Small craft, Oculus, drone placeholder

All eight fighters are 2× scale boxes with 3–4 meshes and 1–2 sprites; `reduced` beyond 30 units (3 km, where a 0.36-unit fighter is 14 px tall), `point` beyond 90 units (9 km). There is no Oculus model (A11 adds `ships/oculus.ts`); `buildReaperDrone` (`index.ts:68-74`) is a 0.12-unit sphere with a private emissive material and would stand in for `reaper_oculus` at half the planned size (§2.1).

## 5. Cross-cutting findings

### 5.1 `latheBody` mirrors and inverts every lathe hull (P0)

`geometry.ts:125-134`:

```ts
const g = new THREE.LatheGeometry(pts, segments);
// LatheGeometry revolves around Y; rotate so the axis is Z.
g.rotateX(Math.PI / 2);
// After rotation the profile's y (our z) maps to -z; flip so front is +z.
g.scale(1, squashY, -1);
g.computeVertexNormals();
```

`rotateX(+π/2)` maps the lathe's y (the profile's z) to **+z** already, so the comment is wrong and the `-1` scale is a mirror. `BufferGeometry.scale` transforms positions and normals but never reverses index winding, and `computeVertexNormals()` then derives inward normals from the reversed winding. Measured consequences (orientation-check):

| mesh | winding outward | winding agrees with stored normal | visual consequence under `FrontSide` |
| --- | ---: | ---: | --- |
| reaper `hull` (all three Reapers) | 0.00 | 1.00 | near wall culled; interior of the far wall drawn with inward normals |
| reaper `plates` | 0.00 | 0.00 | plates invisible from outside (normals outward, winding reversed) |
| asari `hull`, ascension central `hull` | 0.00 | 1.00 | as the Reaper body |
| salarian `hull` / `hullDark` (lathes + pods, off-axis noise) | 0.17–0.47 | 1.00 | bodies, heads and pods inside-out |
| geth `hull` (two mirrored hood plates) | 0.44 | 0.78 | the mirrored plates culled from outside |
| control: `eye` sphere, socket cylinder, box hulls | 1.00 / ~0.5 (inconclusive for boxes) | 1.00 | correct |

Software-GL renders of the isolated templates (`scripts/_audit-models/render-check/out/*_asis.png` against `*_fixed.png` with the winding reversed) show the Reaper body as a hollow, see-through shell with the eye and hood plates visible through it, and a solid dark hull once repaired; the same for the asari dreadnought and the salarian cruiser. In the game the environment map and the fill light make the hollow body look like pale, flat, wrongly-lit metal rather than an obvious hole, which is why it survived visual QA.

The mirror is also a **layout** bug: every builder placed its details in the un-mirrored frame (Reaper tail emitter at `−0.44 L`, hood shells at `+0.02 … +0.27 L`, lights and spines sampled with `sampleRadius(profile, z)`, the salarian visor at `+0.47 L` against a head lathe at `+0.36 … +0.53 L`, the asari gun on the "sharp" end). Fixing `latheBody` alone will therefore move the Reaper hood to the arm roots, the tail aft, land the tail emitter, lights and spines on the hull, and give the asari and salarian hulls sharp bows — all intended, all silhouette-changing. The Reaper plate shells (`reaper.ts:80, 96`) and the geth mirror (`geth.ts:27`) need the same treatment (build the mirrored copy with a positive transform and reversed vertex order, or `geometry.index` reversal after mirroring).

### 5.2 What `lod.ts` does, and does not do (P1)

- `lodLevel` (`lod.ts:23-33`): `reduced` beyond `70 × lengthUnits`, `point` beyond `700 × lengthUnits`; fighters fixed at 30 / 90 units; no hysteresis, no `factor` argument yet (A2 adds it), `settings.lod === false` forces `full`.
- At the game's 50° FOV (`cameras.ts:52`) and 1080 px, a hull of length L at distance d spans ≈ `1,158 × L / d` px, so **`reduced` begins when the hull is ~17 px long and `point` at ~1.7 px, for every class**. In km (table §3): frigates 11–15 km / 110–150 km, cruisers 34–39 km / 340–390 km, dreadnoughts 57–77 km / 570–770 km, Reaper capitals 108–129 km / 1,078–1,294 km. The brief's 80 km engagement therefore keeps every capital and most cruisers at `full` for the whole battle; `point` is reached by fighters (9 km) and by frigates only on long-lens shots. The planned `ReducedInstancer` (AP §11.12) and the level-2 ladder (× 0.6) only pay when `reduced` triggers, which today means frigates beyond ~7–9 km and nothing heavier.
- `applyLod` (`battleView.ts:199-208`) toggles `visible` on direct children by name (`DETAIL_MESH_NAMES = windows, accent, engine, lights, seams, plates, eye`) and hides all sprites at `reduced`; `point` hides the group and writes one vertex into a 2,048-vertex `Points` cloud coloured by faction engine colour (`:241-252`, `MAX_FAR_POINTS` `:42`).
- Consequences per family: draw calls fall to 2 for every `assemble()` hull, 3 for the Ascension, 4–5 for Reapers; triangles kept: Alliance 44–62 %, turian 38–68 %, salarian 47–83 %, asari 49–56 %, Ascension 71 %, Cerberus 50–56 %, geth 28–59 %, quarian 14–52 %, Reapers 58–63 %. Silhouette-changing losses: asari fins, geth ring and spine plates, liveship domes, Reaper plates/eye. **Drive light gap**: at `reduced` both the glow sprites and the `engine` meshes are hidden and nothing replaces them until `point` restores a faction-coloured dot — a screening line of frigates 12–119 km from the camera has no engine light at all (brief §10 wants faction drive colours readable, §15.3 wants throttle-driven glow).
- Unnamed meshes (Reaper socket, tail glow, Harbinger spines) and anything inside a nested group (placeholders) are never hidden. Death pieces (`finishDeath`, `:346-356`) are the direct-child meshes with cloned materials — for a Reaper nine pieces including a 28-triangle socket and the floating tail glow.

### 5.3 Draw calls and instancing (P1)

No hull instancing: `instantiateShip` clones a `Group`, so N identical frigates are N × (5 meshes + 4 sprites). Measured for the Final Battle (§3): 1,271 ship draw calls at full LOD under canon, 1,815 under Prime/Apex, of which sprites are 377 / 530-odd; Reapers 263. Materials are shared until damage (hull clone per tinted ship) and death (every piece cloned). AP §11.12 / A2's `ReducedInstancer` addresses only the `reduced` tier; given §5.2 the plan should expect near-field hulls to stay individual meshes and budget them (or lower `REDUCED_FACTOR` once hull detail survives it, e.g. by reclassifying silhouette parts as `hull`).

### 5.4 Materials and surfaces (P2)

Flat `MeshStandardMaterial`s only (§2.2): no procedural plating, panel lines, normal or roughness maps, no emissive windows as textures (every window is a 12-triangle box, 36–1,788 triangles of boxes per hull). `merge()` zeroes missing uvs, box and lathe parts keep their default uvs, so a texture pass needs either triplanar shading or a uv pass per builder. `castShadow = false` everywhere and the renderer never enables shadow maps. Reaper palette versus AP §12 in §2.2; Harbinger has no palette of its own.

### 5.5 `lengthUnits` honesty and the D12 silhouette test (P2)

`lengthUnits` is declared as `lengthM / 100` in every builder, but the built `Box3` z-extent differs: Everest +7.8 %, carrier +9.1 %, Alliance cruiser +8.7 %, turian dreadnought +6.1 %, Cerberus cruiser +6.8 %, geth frigate **−10.8 %**, line frigate −5.2 %, Normandy −5.8 %, Reaper capital −1.3 % of its declared 15.4 but **−24 % of the catalogue 20.0**, destroyer −20 %, Harbinger −24 %. With `silhouettes.json`'s relative tolerance of 0.08, `alliance_carrier`, `alliance_cruiser` and `geth_frigate` fail a sheet whose `lengthUnits` is `lengthM / 100` unless they are re-extented, and all three Reapers fail by design until A12. `lengthUnits` also drives sprite size (`battleView.ts:162`), LOD, impact radius (`:395`), explosion size (`effects.ts:199`) and camera shake (`:363`), so the rebuilt templates should compute it from `Box3` as AP §12 says.

### 5.6 Smaller defects (P3)

- `alliance.ts:88-89`: `const eb = new THREE.Group(); void eb;` dead code. `geometry.ts`: `hexPrism` and `M` unused; `taperedTube` promises a tip cap it does not build; `latheBody` comment wrong (§5.1). `reaper.ts:210` comment claims a 2 km overall for a 1.52 km model.
- 24 running lights of `0.04 R` (7 m) boxes and 1,200 seam triangles per Reaper are invisible beyond a few km but cost 18 % of the Reaper's triangles and one draw call each.
- `PALETTES.*.glow` and `BuiltShip.glowColor` are unused; `glowScales` exists only for Reapers.
- Fighters are 2× scale (documented in `KNOWN_ISSUES.md:7`); the placeholder path does not know the convention.

## 6. Rebuild versus refine

| class(es) | verdict | why (measured) | owner / task |
| --- | --- | --- | --- |
| `reaper_capital`, `harbinger`, `reaper_destroyer` | **rebuild** (after the `latheBody` fix) | mirrored, inside-out, 15.2 / 18.3 / 1.28 units vs 20 / 22 / 1.6; body width 25 % vs ≤ 14 %; arms 29 % vs ≈ 40 %; no joints, no emitter mouth, no plating bands; Harbinger indistinct | A12 |
| `alliance_dreadnought` (+ new `alliance_dreadnought_k`) | **rebuild** | b/L 0.30 vs 0.16, h/L 0.18 vs 0.12, no full-length housing, no stepped superstructure, +7.8 % extent | A13 |
| `alliance_cruiser` | **rebuild** | 5.2 vs 7.0 units, b/L 0.39 vs 0.18, down-swept fins | A13 |
| `alliance_frigate`, `alliance_frigate_thanix` → `normandy_sr2` + pattern | **rebuild** | wingspan ≥ hull length (b/L 0.85–1.08), no SR-2 features, Normandy = line hull + one box | A13 |
| `alliance_super_dreadnought` (SSV Omaha), `turian_super_dreadnought`, `normandy_valkyrie`, `sol_defence_platform`, `sol_platform_heavy`, `cerberus_heavy_cruiser`, `reaper_oculus` | **new build** (absent) | placeholder consequences §2.1 | A11, A14–A17 |
| `turian_dreadnought`, `turian_cruiser`, `turian_frigate` | refine | pincer gap 0.026 units, wingspan b/L 0.58–0.59 (target family ≈ 0.26–0.3); vocabulary right | A (likeness pass), add TARGET rows |
| `asari_cruiser`, `asari_dreadnought`, `destiny_ascension` | refine | orientation fix, fins to `hull`, petal prongs | A |
| `salarian_*` | refine | orientation fix, head/visor reunited, blister count | A |
| `geth_*` | refine | mirrored plates, ring/spine plates to `hull`, frigate extent −10.8 % | A |
| `quarian_*` | refine | domes as glazing + frame | A |
| `cerberus_cruiser`, `cerberus_frigate`, `cerberus_dreadnought` | refine | A15 re-base; frigate follows the rebuilt frigate family | A15 |
| `alliance_carrier`, all fighters | keep (measure → lock) | fix the carrier extent (+9.1 %); fighters to the instanced path | A2, D |

## 7. Prioritised limitations

1. **P0 — `latheBody` mirror** (`geometry.ts:131`; also `reaper.ts:80, 96`, `geth.ts:27`): inside-out faces and reversed bodies on every Reaper, asari and salarian hull; all placed details (tail emitter, lights, spines, hood plates, head/visor, bow gun) are on the wrong end or floating. Fix before any model work; expect every lathe silhouette to change, so re-measure after.
2. **P0 — Sovereign-class anatomy and scale** (§4.1): 20-unit extent from `Box3`, hood at the arm roots with the long spine aft, six segmented limbs with plated joints and curled tips over the lower 240°, the emitter as a mouth between the limbs at the base of the head, body width ≤ 2.8 units, overlapping plating bands with pale seams, AP §12 palette with Harbinger's own materials (today `tint` is a no-op).
3. **P0 — Destroyer** (§4.1): four legs dominating a stubby body, 1.6 units, walking stance; today a 1.28-unit capital clone.
4. **P1 — Alliance dreadnought, cruiser, frigate/Normandy proportions** (§4.2): beam/height ratios 1.6–2.2 × the targets, missing signature features; SSV Omaha absent.
5. **P1 — Draw calls / no hull instancing** (§5.3): 1,271–1,815 ship draw calls at full LOD in the Final Battle; fighters 4–6 each; sprites alone 377–530.
6. **P1 — LOD policy** (§5.2): `reduced` only below ~17 px, `point` below ~1.7 px; no hysteresis; silhouette parts classed as detail (asari fins, geth ring/plates, liveship domes); drive light gap at `reduced`; unnamed and nested meshes outside the rules.
7. **P1 — Placeholder fallback** (§2.1): nested group defeats LOD and death pieces; ignores the 2× small-craft convention (Oculus at 0.12); platforms get lit drives; `normandy_sr2` falls to the plain frigate. Acceptable only as the T2 safety net; `tests/models.test.ts` (A18) must make `hasModel` true for every id.
8. **P2 — Materials** (§5.4): no maps, no panel lines, flat emissive boxes, per-damage material clones, Reaper palette off-target.
9. **P2 — `lengthUnits` vs built extent** (§5.5): ±5–11 % on six existing hulls and −20…−24 % on the Reapers; lock-down must use `Box3`.
10. **P2 — Turian and asari proportions would be frozen wrong** by the MEASURE → LOCKED rule unless TARGET rows are added (turian wingspan 0.59, asari flat fins).
11. **P3 — Triangle waste**: Reaper seams and lights (18 %), salarian blisters, fighter nozzles; dead code and wrong comments (§5.6).

## 8. Reproduction

From the repo root (no npm needed; `node_modules` present):

```bash
node --import tsx/esm scripts/_audit-models/measure-ships.mts            # table, measurements.json, contact sheets → scripts/_audit-models/out/
node --import tsx/esm scripts/_audit-models/orientation-check.mts reaper_capital asari_cruiser salarian_frigate geth_dreadnought
node --import tsx/esm scripts/_audit-models/render-check/export-models.mts reaper_capital alliance_dreadnought alliance_frigate_thanix asari_dreadnought salarian_cruiser
node scripts/_audit-models/render-check/shoot.mjs '[{"file":"reaper_capital_3q_asis.png","params":{"id":"reaper_capital","view":"3q"}},{"file":"reaper_capital_3q_fixed.png","params":{"id":"reaper_capital","view":"3q","fix":"1"}}]'
```

`scripts/_*` is gitignored by project policy (scratch analysis tools are never committed); the outputs live under `scripts/_audit-models/out/` and `scripts/_audit-models/render-check/out/`. The stage-A plan should promote the measurement into `scripts/measure-silhouettes.ts` (D-owned per `WORK_BREAKDOWN.md` §0.3) and the render check into the before/after screenshot script of brief §16.4.
