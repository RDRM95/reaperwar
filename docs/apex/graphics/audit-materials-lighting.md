# Graphics audit — materials and lighting

Planning workflow for the graphics and cinematic overhaul (brief §16). Date: 3 November 2026. Measured on branch `stage/G-plan` at `d003988` (worktree `/home/user/reaperwar-Gplan`), Three.js 0.186.1, Vite 7.3.7.

Scope: `src/rendering/materials.ts`, `src/rendering/environment.ts`, the lighting, PMREM, tone-mapping, colour-space, exposure and fog set-up in `src/rendering/battleView.ts`, plus the material use in `src/rendering/ships/**`, `src/rendering/geometry.ts` and `src/rendering/effects.ts` where it bears on surfaces and light. Every file named here is owned by stage A (`WORK_BREAKDOWN.md` §0.3) except `cameras.ts` (B). Rules applied throughout: original procedural assets only; nothing proposed touches the simulation; budgets, governor levels and warnings, never caps; HADES is a penetrator with a nuclear warhead.

Companion audits (models, effects, performance) cover geometry likeness, the effect pools and frame cost; this document stops at the surface and the light that falls on it.

## 0. How this was measured, and what was not

| Method | What it gave |
| --- | --- |
| Static reading of the files above | every file:line reference below |
| Headless Node build of all 32 ship templates (`node --import tsx/esm`, `getShipTemplate` for every `MODELLED_CLASS_IDS` entry) | meshes, triangles, material instances, texture maps per class; UV texel-density spread (§1.3) |
| Live run in Chromium 1194 (Playwright 1.56.1) with SwiftShader (`--use-angle=swiftshader`) against a Vite dev server of this worktree: Quick battle → Final Battle of Earth, canon, seed 69691, stepped to t = 30 s and paused (206 hulls alive); viewport 1280 × 720 CSS at devicePixelRatio 2 (2560 × 1440 drawing buffer) | `renderer.info`, `renderer.capabilities`, context attributes, the scene's lights, materials and textures, draw-call deltas with object groups hidden (§1.11) |
| HUD-free close-ups at 1600 × 900, DPR 1, free camera at 1.5–1.6 × hull length, three-quarter front-above; isolated renders (only the subject ship visible, same lights) pixel-sampled with PIL | on-screen hull and light colours (§1.7, §1.9) |
| three's own ACES coefficients (`tonemapping_pars_fragment.glsl.js`, exposure 1.05) ported to a 20-line script | predicted on-screen colour of every emissive (§1.7) |

Not measured, and not claimed anywhere below: frame time (software GL is pixel-bound and says nothing about a GPU — every cost statement is in draw calls, triangles, materials, texture and render-target sizes); the `low` and `medium` tiers; GPU memory (sizes are computed from dimensions and formats); the generation time of `makePlanetTexture`.

Evidence screenshots (SwiftShader, 1600 × 900, HUD hidden, same seed and time): `docs/apex/graphics/audit-shots/materials-lighting-sovereign.jpg`, `-harbinger.jpg`, `-kilimanjaro.jpg`, `-wide.jpg`. They are reference renders of this project's own procedural models, not study material.

## 1. Inventory (measured)

### 1.1 Material classes

| Class | Where | Instances | Notes |
| --- | --- | --- | --- |
| `MeshStandardMaterial` | `materials.ts:17–85` (`PALETTES`: 8 factions × hull, hullDark, accent, engine, windows = 40), `environment.ts:257–259` (Citadel 3), `:326` (planet), `:338` (moon), `effects.ts:98` (debris), `ships/index.ts:84` (Reaper drone placeholder) | 48 in code; 32 live at t = 30 (factions present + planet, moon, debris) | the only lit material; `metalness` 0.3–0.8, `roughness` 0.3–0.6 by slot (§1.7 for the Reaper values); every one keeps `envMapIntensity` 1 |
| `MeshBasicMaterial` | `materials.ts` `glow` slot (8) and `ADDITIVE_WHITE` (:89) — **neither is referenced anywhere outside `materials.ts`** (grep); `effects.ts:72–75` (beam core/glow × 4), `:106` (tracer), `:121` (missile); `environment.ts:243` (galaxy band), `:367` (Serpent haze) | 9 unused + 8 used; 3 live (band, tracer, missile; beam meshes are created lazily) | all additive, `depthWrite` off; beam core colours are near-white (`0xfff0e0`, `0xf0f8ff`), tracer is warm yellow `0xffd080` (AP §11.2 wants blue-white `0xdff4ff`) |
| `ShaderMaterial` | `environment.ts:153` (atmosphere rim), `:195` (starfield points), `effects.ts:86` (barrier fresnel, cloned per flash, ≤ 60) | 2 live idle | no `onBeforeCompile` patches of the lit material anywhere |
| `SpriteMaterial` | `battleView.ts:160` (one **per engine node per ship**), `environment.ts:391` (sun), `effects.ts:136` (spark pool, on demand) | **464 live: 463 engine-glow materials for 206 hulls + the sun** | §1.8 |
| `PointsMaterial` / `LineBasicMaterial` | `battleView.ts:120` (far-point cloud), `effects.ts:115` (point-defence lines) | 1 + 1 | — |

Not used at all: `MeshPhysicalMaterial`, `MeshLambert/Phong`, `RectAreaLight`, `LightProbe`, instanced hull materials, any `onBeforeCompile`.

### 1.2 Texture maps

None on any ship. Headless: 48 palette materials, 0 with `map`, `normalMap`, `roughnessMap`, `metalnessMap`, `emissiveMap`, `bumpMap` or `aoMap`. Live: 467 materials carry a `map` (all sprites and the two sky textures), 0 carry any other map. The textures that exist are all `CanvasTexture`s painted at load:

| Texture | Size, format | Colour space set | Where |
| --- | --- | ---: | --- |
| planet albedo (clouds baked in) | 1024 × 512 RGBA8, mipmapped, anisotropy 4 | sRGB | `environment.ts:11–21, 75–130` |
| galaxy band | 1024 × 512 RGBA8 | sRGB | `:213–243` |
| sun glare | 256² | **none** (treated as linear) | `:380–390` |
| engine-glow disc (shared by all glow sprites and the far-point cloud) | 64² | **none** | `battleView.ts:97–106` |
| five radial discs (flash, fire, smoke, blue, red) | 128² each | **none** | `effects.ts:12–24, 54–58` |
| environment PMREM | 768 × 1024 RGBA16F cubeUV atlas (≈ 6.3 MB) | linear | §1.5 |

`renderer.info.memory.textures` = 5–6 live (effect discs upload on first use).

### 1.3 How plating and surface detail are faked

Geometry only, merged per material slot into at most five meshes per hull (`assemble`, `ships/alliance.ts:33–49`; `merge`, `geometry.ts:62–77`):

- Alliance, Cerberus, turian, geth, quarian, salarian, asari: stacked `taperedBox` / `wedge` / `zCylinder` / `latheBody` primitives; `plateStrip` greeble rows exist only in `alliance.ts` (7 calls: `:67–68, 80, 85`), panel lines are thin boxes (`alliance.ts:166`), ridges are cones or boxes. Facets are flat, edges are hard, there is no bevel, wear, rivet or seam at the shading level — the brief's "readable panel lines and specular breakup" (§10) and "detailed armour plating, surface textures and normal maps" (§16.1) are absent by construction.
- Reaper (`ships/reaper.ts`): 6-fold + 18-fold radial ridge displacement of the lathe body (`:45–55`), four partial lathe shells plus three hood shells merged as the `plates` mesh in the `accent` material (`:60–102`), arm radius modulated by `1 + 0.12 sin(22 t)` (`:122`), knuckle spheres (`:127–130`), seam tubes in the `windows` material (`:123–125`), 24 running-light boxes (`:171–185`), eye sphere, socket and iris torus (`:139–153`). The "layered armour plates on body and arms" of brief §8.8 exist as smooth shells; nothing breaks their specular.
- Triangle cost of modelling detail as geometry (headless build, per template):

| class | length (units) | meshes | triangles |
| --- | ---: | ---: | ---: |
| `harbinger` | 18.48 | 10 | 8,236 |
| `reaper_capital` | 15.40 | 9 | 8,176 |
| `reaper_destroyer` | 1.28 | 9 | **6,256** (a 160 m hull at capital cost) |
| `salarian_dreadnought` | 8.60 | 5 | 3,300 |
| `destiny_ascension` | 16.00 | 7 | 3,228 |
| `quarian_liveship` | 22.00 | 5 | 2,744 |
| `salarian_cruiser` | 5.20 | 5 | 2,060 |
| `geth_dreadnought` | 11.00 | 5 | 1,828 |
| `turian_dreadnought` | 9.50 | 5 | 1,696 |
| `alliance_dreadnought` | 8.88 | 5 | 1,492 |
| `asari_dreadnought` | 9.00 | 5 | 1,408 |
| `salarian_frigate` | 1.50 | 5 | 1,204 |
| `alliance_cruiser` / `turian_cruiser` / `asari_cruiser` | 5.0–5.6 | 5 | 756–760 |
| `quarian_heavy` | 8.20 | 5 | 720 |
| `geth_cruiser` | 5.20 | 5 | 676 |
| `cerberus_dreadnought` | 9.00 | 5 | 588 |
| `quarian_cruiser` | 4.80 | 4 | 436 |
| `alliance_carrier` | 9.00 | 5 | 432 |
| `cerberus_cruiser` / `alliance_frigate_thanix` / `alliance_frigate` / `geth_frigate` / `cerberus_frigate` | 1.5–5.6 | 4–5 | 280–388 |
| `turian_frigate` | 1.60 | 5 | 160 |
| fighters (6 classes) | 0.32–0.36 | 3–4 | 60–108 |
| **all 32 templates** | | | **49,156** |

  The live Final Battle frame drew 181k–193k triangles, of which ≈ 13k were the planet and sky (measured by hiding them, §1.11).
- UVs: every primitive carries its own 0–1 UVs; `merge` only zero-fills missing ones (`geometry.ts:67`) and converts to non-indexed (`:69–72`). Measured spread of world units per UV tile across a hull's triangles (10th → 90th percentile): `alliance_dreadnought` 0.06 → 0.91 (**15×**), `alliance_cruiser` 17×, `turian_dreadnought` 13.5×, `geth_dreadnought` 20×, `cerberus_dreadnought` 6×, `reaper_capital` 0.97 → 5.35 (5.5×). A tiling normal or roughness map assigned to today's materials would therefore show plate scale varying 6–20× across one hull. Surface maps need either build-time box-projected (world-space) UVs written in `merge`, or triplanar sampling in a patched shader (§2, P2).
- LOD: `DETAIL_MESH_NAMES` (`lod.ts:160`) hides windows, accent, engine, lights, seams, plates and eye beyond 70 × length units; shading does not change with distance.

### 1.4 Lights

| Light | Parameters | Where |
| --- | --- | --- |
| `DirectionalLight` "sun" | `0xfff2e0` × 2.6, positioned along `env.sunDirection` × 10,000, target at the origin | `battleView.ts:108, 136–138` |
| `HemisphereLight` | sky `0x8fb4ff`, ground `0x1a1420`, × 0.7 | `:110` |
| `AmbientLight` | `0x404a60` × 0.45 | `:111` |
| `DirectionalLight` fill | `0xb8c8e8` × 0.9, **camera-relative**: moved to the camera and aimed along the view direction every frame | `:113–114, 305–306` |
| `PointLight` | `0xffa060`, intensity 0 when idle, distance 4,000, decay 1.5; set to 60 × size for 1.2 s on capital deaths, then decays × (1 − 3 dt) | `effects.ts:101, 244–247, 423–426` |

Five lights in total (live scene traversal agrees). `renderer.shadowMap.enabled` is false; `castShadow` is only ever set to false (`alliance.ts:40`); no light probe, no area light. Nothing lights a hull from its own drives, from a beam, a muzzle flash or a barrier hit: the one local light fires only on big explosions.

Key-to-fill ratio: 2.6 against 0.9 + 0.7 + 0.45 = 2.05, i.e. **1.27 : 1** before the IBL is added — flat lighting; and because the fill rides with the camera, no face in any shot is ever in shadow (see `materials-lighting-kilimanjaro.jpg`). r186 uses physically based light units only (no legacy mode), so these numbers are the raw multipliers; `decay 1.5` on the point light is non-physical (default 2).

### 1.5 Environment map

`new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04)` (`battleView.ts:89–94`). `RoomEnvironment` is a grey box room lit by one point light (900 cd, distance 28) and seven emissive panels. `fromScene` uses its default `size` 256 → a cubeUV atlas 3 × 256 by 4 × 256 = **768 × 1024 RGBA half-float** (measured on `scene.environment.image`: 768 × 1024, `HalfFloatType`, `CubeUVReflectionMapping`, linear-sRGB; ≈ 6.3 MB). `scene.environmentIntensity` = 0.35; every `MeshStandardMaterial` keeps `envMapIntensity` 1, so the planet and moon reflect the same room. Generated once in the constructor, never per environment, and unrelated to the sky, the planet or the sun direction. Its reflections are neutral-grey indoor panels, which is where the mirror-like highlights on the Reaper arms come from (isolated render of the Sovereign-class hull: brightest 5 % of hull pixels average `#a7a9ad` — neutral grey, no blue).

### 1.6 Tone mapping, colour space, exposure, anti-aliasing, depth, fog

- Tone mapping `ACESFilmicToneMapping`, `toneMappingExposure` 1.05 (`battleView.ts:86–87`); `outputColorSpace` sRGB (`:85`); working space linear. Every material is `toneMapped` (default), including additive glows, beams and sprites, so ACES desaturates every bright emissive towards white and orange (quantified in §1.7).
- Anti-aliasing: context `antialias: quality !== 'low'` (`:83`). Live (SwiftShader) the context reports antialias true and `maxSamples` 4; there is no post-process AA. `pixelRatioCap` 2 / 1.5 / 1 by tier (`settings.ts:20`), measured pixel ratio 2 at DPR 2.
- Depth: `logarithmicDepthBuffer: true` (`:83`), camera near adaptive 0.2–50 (`cameras.ts:238`), far 600,000 (`:52`). Log depth writes `gl_FragDepth` in every fragment, which disables early depth rejection on real GPUs (SwiftShader cannot show this cost). r186 offers `reversedDepthBuffer: true` (`WebGLRenderer.js:83`; needs `EXT_clip_control`, `WebGLCapabilities.js:96–100`, silent fallback) as the cheaper alternative.
- Fog: none (`scene.fog` null) — correct for vacuum. `scene.background` null, clear colour black. Measured sky floor looking up from the battle: median RGB (1, 1, 2), 55 % of pixels at or below a channel sum of 6 — blacks are black away from the galaxy band.
- No `EffectComposer`, bloom, grading, vignette or LUT anywhere in `src` (grep).
- Colour-space hygiene: the glow disc, the sun and the five effect discs have no `colorSpace` (treated as linear): a canvas gradient authored in sRGB renders with brighter mid-tones than drawn. Harmless today; wrong once bloom thresholds depend on it.

### 1.7 Reaper palette versus `ADOPTION_PLAN.md` §12

| Slot (`materials.ts:37–44`) | Today | AP §12 target | Measured / computed on screen |
| --- | --- | --- | --- |
| `hull` (body) | `0x3c414b`, metalness 0.75, roughness 0.38, emissive `0x140404` × 0.6 | `0x0e1016`, 0.85, 0.32, emissive `0x02030a` | isolated render, hull + arms + plates: mean `#212125`, median (20, 20, 24) — near-black **neutral** grey; sun-lit faces read grey-brown (warm sun `0xfff2e0` on a grey albedo) |
| `hullDark` (arms, socket, spines) | `0x24272e`, 0.8, 0.35, emissive `0x100303` × 0.5 | `0x07080c` | glossy black with neutral-grey room highlights ("patent leather", `materials-lighting-sovereign.jpg`) |
| `accent` (`plates`) | `0x4a505c`, 0.7, 0.42 | plates `0x161a22`, sheen `0x1a2230`, `envMapIntensity` 1.6 | the hood plates are the lightest part of the hull and the brownest under the sun |
| `windows` (seams, 24 running lights, iris) | `0xff5030`, emissive `0xff3018` × 2.5, roughness 1 | seams pale blue `0x7fb4ff` × 1.2; running lights deep crimson `0xd01030` × 2.5 | lit-pixel median (255, 166, 105), mean `#d28e5c`: **orange**; ACES-computed `#ff9251`. "Deep crimson" is not on screen |
| `engine` (eye) | `0xff3a1a`, emissive `0xff2a10` × 4 | aperture `0xff5a1f`, iris `0xffb060` × 4.5 | ACES-computed `#ffb26a` (peach-white), then the additive sprite on top → white core |
| glow sprite | faction `engineColourHex` `0xff2a1a` (`battleView.ts:158`), opacity 0.6 | — | — |
| Harbinger | `tint: 0xffa040` stored as `BuiltShip.glowColor` (`reaper.ts:194, 217`) | yellow-orange aperture and seams, **Harbinger only** | **`glowColor` is never read outside `ships/`** (grep): the sprite takes the faction colour and the eye shares the `engine` material, so Harbinger renders exactly like a Sovereign-class (isolated lights mean `#d5905d` vs `#d28e5c`) |

Blue sheen: absent (hull saturation 0.11, hue neutral — the IBL is grey). Brown: present wherever the warm sun hits `hull` or `plates`. Today **every** Reaper reads orange-lit and none crimson, the inverse of brief §8.8. The AP §12 values alone will not fix the hue: through ACES at × 2.5, `0xd01030` lands at `#ff555d` (computed), a pink-red; crimson needs emissive ≈ 1.0–1.4 (`0xd01030` × 1.2 → `#ec0134`) with bloom carrying the glow, which is what P1 and P4 below do. For comparison the Alliance drive `0x3c9dff` × 3.2 computes to `#c4e7f8` (pale blue-white, intended).

Alliance for reference: `SSV Kilimanjaro` isolated hull mean `#6b7382`, median (144, 153, 171) — bluish pale grey with a blue stripe; its windows `#cbd6dd`.

### 1.8 Engine glow implementation

`battleView.ts:157–166`: one `THREE.Sprite` per engine node with its own `SpriteMaterial` (shared 64² disc, additive, `depthWrite` off), colour = faction `engineColourHex`, scale 0.11 × length (0.12 for Reapers) × `glowScales` (Reaper eye 2.2); opacity per frame = 0.35 + 0.6 × throttle × engine subsystem (`:255`); visible only at LOD `full` (`:205`); engine nodes per builder (`engineNodes`). Measured: **463 sprites and 463 `SpriteMaterial`s for 206 hulls**; at the follow camera 173 were visible by LOD, 114 in frustum, and hiding them removed exactly 114 draw calls (566 → 452): three draws sprites one call each. The `engine` nozzle meshes (emissive × 2.6–4) are the only other glow. No plume geometry, no throttle-dependent length, no light cast on the hull, no heat shimmer; far ships reuse the same disc through the `PointsMaterial` cloud (`:120`). AP §11.1 already moves the discs into the `BillboardPool`; brief §15.3 asks for throttle-length plumes.

### 1.9 Planet, atmosphere and sky

- **Planet**: `makePlanetTexture` paints a 1024 × 512 RGB canvas (`environment.ts:75–130`; fbm 6 + 3 octaves for land, 5 for clouds; clouds baked into the albedo, no cloud shadow, no separate layer); `SphereGeometry(R, 96, 64)` = 12,288 triangles; `MeshStandardMaterial` roughness 0.85, metalness 0, colour tint `0xb8c0cc` (darkens the texture ≈ 25 %); no normal, specular, roughness or night-side map. Earth is drawn at R = 21,000 units (2,100 km, one third real) 24,500 units below the battle. From the measured camera positions the nearest surface is 431–444 km away, and one equatorial texel (12.9 km) subtends 1.7° ≈ **48 device pixels at 2560 × 1440**: the planet is magnified about fifty times past its texel size in every battle shot (smeared continents and clouds in `materials-lighting-wide.jpg` and `-kilimanjaro.jpg`).
- **Atmosphere** (`:132–165`): a `BackSide` sphere at 1.018 R, `rim = 1 − max(dot(N, V), 0)`, `alpha = pow(rim, 5) × 0.7`, additive. On the back faces that are visible the normal faces away from the camera, so `dot ≤ 0`, `rim = 1` and alpha is a constant 0.7: the shader degenerates to a **hard-edged, uniform blue ring** between R and 1.018 R — the band seen in all four screenshots. No scattering, no terminator, no limb brightening towards the sun, no night side.
- **Moon**: untextured `0x9a9a98`, roughness 1, 1,536 triangles (`:338–341`).
- **Stars**: 6,000 `Points`, sizes 1.2 / 2.0 / 3.5 × a `pixelRatio` uniform that is initialised to 1 and **never written** (`:196–199`; no writer in `battleView.ts`); measured 1 while the renderer ran at pixel ratio 2, so stars are half their intended size on HiDPI. Three sizes, no magnitude distribution, no twinkle; 35 % of them concentrated in a band.
- **Galaxy band** (`:213–249`): 1024 × 512 noise canvas on a 32 × 16 sphere, additive, opacity 0.6; 0.35° per texel; reads as diagonal violet smears (top right of `materials-lighting-sovereign.jpg`), not a Milky Way.
- **Sun**: a 256² radial sprite scaled to **9.9° of sky** (the real Sun subtends 0.53°), no lens flare, no occlusion, no streaks.
- **Citadel**: three `MeshStandardMaterial`s (`:257–259`), Presidium torus 960 triangles plus wards; Serpent Nebula is a flat `0x5a3a8a` `BackSide` sphere at opacity 0.22 (`:367`).
- `relay` and `deep_space` draw only stars, band and sun.

### 1.10 Render-side determinism (found on the way; owned by A1/B1)

`Math.random` at `battleView.ts:336, 337` (secondary-explosion timing and position), `:382, :387` (small-gun flash thinning, director hold), `:561, :562, :564` (cinematic shot choice) and `cameras.ts:232` (shake). `EffectsSystem` draws from `Rng('fx')` (`effects.ts:53`) with a fixed seed that ignores `config.seed`. `WORK_BREAKDOWN.md` A1/B1 already replace these; every effect proposed below (emissive flicker, shadow pulse, flare jitter) must draw from the same seeded generators.

### 1.11 Live numbers (Final Battle of Earth, canon, seed 69691, t = 30 s, 206 hulls alive, 2560 × 1440)

| Camera | Draw calls | Triangles | Points | LOD full / reduced / point |
| --- | ---: | ---: | ---: | --- |
| tactical (−164, 132, −375) | 674 | 193,160 | 6,060 | 63 / 83 / 60 |
| ship follow (Destiny Ascension at 41 units) | 566 | 181,216 | 6,060 | 80 / 66 / 60 |
| reaper (Harbinger) | 571 | 74,896 | 6,060 | 80 / 66 / 60 |

Shader programs 12 (one lit program serves all 32 standard materials, 140–162 draws per frame); geometries 102–104; uploaded textures 5–6; live materials 503 (464 `SpriteMaterial`, 32 `MeshStandardMaterial`, 3 `MeshBasicMaterial`, 2 `ShaderMaterial`, 1 `PointsMaterial`, 1 `LineBasicMaterial`). Deltas at the follow camera: glow sprites hidden → 452 calls (−114); effects group hidden → 565 (−1: effects were idle at the paused instant); planet + sky objects hidden → 563 calls and 168,160 triangles (−13,056). Context: WebGL2, antialias true, `maxSamples` 4, `maxAnisotropy` 16, highp, no page errors. Close-ups at 1600 × 900: Sovereign-class at 24.6 units → 70 whole-frame draw calls; Harbinger at 27.7 → 100; Kilimanjaro (8.88 units) at 13.3 → 125; York-class cruiser (5.2) at 8.3 → 155 (other ships in frame included).

## 2. Limitations in priority order, with the Three.js 0.186 means to lift them

Every item is render-only, keeps the simulation untouched, draws randomness from seeded `Rng` instances, and is sized as a budget with a governor knob rather than a cap. Where a texture or target size is given, the memory figure is computed from dimensions and format.

### P1 — No HDR image pipeline: no bloom, no colour grading, no post anti-aliasing (brief §16.1 "cinematic colour grading, bloom, anti-aliasing"; §10 "blacks black and highlights hot")

Today emissives are clamped by ACES straight into the back buffer, so a "glow" can only be an additive sprite, and MSAA is the only AA. Means (`three/examples/jsm/postprocessing`, all present in 0.186.1):

- `EffectComposer(renderer, new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: n }))` — the composer's default target is already half-float but has **no** MSAA samples (`EffectComposer.js:69`), so pass the target explicitly; `samples: 4` only at the cinematic tier, 0 elsewhere.
- Pass order: `RenderPass` → `UnrealBloomPass(new Vector2(w / 2, h / 2), strength 0.55–0.8, radius 0.35, threshold 1.0)` on linear HDR (its chain is half-float, `UnrealBloomPass.js:105–118`) → grading `ShaderPass` (original GLSL: lift/gamma/gain, saturation, a faint cold/warm split, vignette) or `LUTPass({ lut, intensity })` with a procedurally built 32³ `Data3DTexture` → `OutputPass()` (applies `renderer.toneMapping` and the sRGB conversion once, `OutputPass.js:93`) → `SMAAPass()` or `FXAAPass()` (r186 constructors take no arguments; SMAA's lookup textures are embedded) when `samples` is 0.
- Tone mapper: keep ACES or evaluate `AgXToneMapping` / `NeutralToneMapping` (`constants.js:473, 483`) at the same exposure; AgX holds saturated emissives instead of bleaching them, which is the crimson problem of §1.7. Decide by screenshot pairs, not by preference.
- Governor knobs (AP §21.2 ladder extension): bloom input resolution ½ → ¼, AA mode MSAA → SMAA → FXAA → none, pixel ratio cap. Nothing here changes a battle outcome.
- Memory (computed): one half-float colour target is 8 B/px → 16.6 MB at 1920 × 1080, 29.5 MB at 2560 × 1440, two for ping-pong; 4 × MSAA on that target adds four times the colour plus a 4 × depth buffer, hence cinematic tier only; a half-resolution bloom chain adds ≈ 0.4 × one target. All render targets are allocated per `resize`, so the `pixelRatioCap` stays the single lever.
- Acceptance: before/after screenshot pairs from identical seeds and camera poses (brief §16.4); `drawCalls` + 5–6 passes per frame in the HUD line.

### P2 — Surfaces carry no detail maps, and the merged UVs cannot take one (brief §16.1 "procedural, original normal maps"; §10 "panel lines and specular breakup")

- Procedural maps as `DataTexture` (RGBA8, 1024², mipmapped, `anisotropy` from `renderer.capabilities.getMaxAnisotropy()`), painted once at boot from `Rng`-seeded value noise + plate cells + rivet dots + edge wear (same `makeNoise`/`fbm` helpers as `environment.ts:24–53`): `normalMap` + `normalScale`, a packed occlusion / roughness / metalness texture used as `aoMap` (default `channel` 0 = `uv` in r186, `Texture.js:118`), `roughnessMap` and `metalnessMap` (three samples G and B), `emissiveMap` masks for windows and seams. Three derives the tangent frame from screen-space derivatives (`getTangentFrame`, `normalmap_pars_fragment.glsl.js:20`), so no tangent attribute is needed on the merged geometry.
- UVs: add a box projection in `merge()` (`geometry.ts:62–77`): for each non-indexed face choose the dominant axis of its normal and write `uv = (p.a, p.b) / tile` in model space, so texel density is constant across a hull (today 6–20× spread, §1.3) and seams hide on face edges; `tile` ≈ 0.25 units (25 m) for organic plating, 0.6 for Reaper bands. Alternative: triplanar sampling in an `onBeforeCompile` patch of the standard shader — more fragment cost, no UV work.
- Two shared texture sets, tinted by `material.color`: organic plating (Alliance, turian, asari, salarian, quarian, Cerberus, geth variants through colour only) and Reaper chitin; memory ≈ 2 × 3 × 5.6 MB. A per-faction set would be 8 × that and buys nothing the tint does not.
- Reaper: `MeshPhysicalMaterial` for `hull` and `plates` — `clearcoat` 0.5–0.7, `clearcoatRoughness` 0.25 and a cold `sheenColor` (or a low `iridescence`) give the "cold dark-blue sheen" that no albedo can; `anisotropy` for brushed bands exists in r186 but adds a lobe, so cinematic tier only.
- Cost: the lit program gains map samples, not draw calls; the same 32 materials stay. Budget the texture memory in the design sheet (`effects.md` style table) and keep 1024² as the ceiling at the high tier, 2048² only if a cinematic close-up proves it.

### P3 — Lighting is flat (1.27 : 1 key to fill) and the IBL is an indoor room

- Build the environment from the actual sky: once per `bind()`, render `env.group` (stars, band, planet, a hot sun disc) into a `WebGLCubeRenderTarget(256, { type: HalfFloatType })` through a `CubeCamera(1, 1e6, target)` placed at the fleet centre, then `PMREMGenerator.fromCubemap(target.texture)`; `scene.environmentIntensity` back to ≈ 1 and `scene.environmentRotation` if alignment is needed. Hull undersides then pick up the planet's blue-white, tops stay black, metals reflect the sun — the "space lighting" of brief §16.1 at the cost of one cube render per environment change.
- Key-to-fill from 1.27 : 1 to ≥ 6 : 1: sun 4–5, camera fill 0.2–0.3 (kept for the tactical camera's readability, off in the cinematic tier), hemisphere 0.2 with sky = planet colour and ground = black, ambient 0. Exposure re-tuned with the new tone mapper; verify with the isolated-render sampling (§0) so the Reaper's shadow side is black and not grey.
- `LightProbe` from the same cube target (`LightProbeGenerator.fromCubeRenderTarget(renderer, target)`, async) for spherical-harmonic diffuse at zero per-object cost.
- Local lights, cinematic tier only, pooled and governed: ≤ 8 `PointLight`s on the followed or framed hero ships' drives, ≤ 4 pooled lights for near beams and big muzzle flashes, and the HADES shadow pulse of AP §11.7 (a penetrator with a nuclear warhead: point light + `environmentIntensity` dip, rate-limited). The light count enters the ladder table; level 3 drops them.
- Shadows stay off (AP §11.7 decision). If a contact shadow is wanted for close-ups, one `DirectionalLight.shadow` with a 2,048² map following the hero ship is the only candidate — measure on a GPU before adopting.

### P4 — The Reaper look misses AP §12 and Harbinger's colour is not wired

- Palette per AP §12 in `materials.ts:37–44` (hull `0x0e1016` / 0.85 / 0.32, hullDark `0x07080c`, plates `0x161a22` with sheen, seams `0x7fb4ff`, running lights `0xd01030`, aperture `0xff5a1f` with `0xffb060` iris), with emissive intensities 1.0–1.4 and the glow carried by P1's bloom instead of × 2.5–4.5 (computed: `0xd01030` × 1.2 → `#ec0134` crimson; × 2.5 → `#ff555d`).
- A `harbinger` palette entry (or a `variant` argument to `buildReaper`) so eye, iris and seams use the yellow-orange pair, and `ensureVisual` reads `built.glowColor` (`battleView.ts:158`) instead of the faction colour for the Reaper family; every other hull keeps the faction colour.
- Verify by the isolated-render sampling script, recording mean hull colour, lit-pixel median and brightest-5 % values into the design sheet (`docs/design/reaper_capital.md`) as the locked palette check.

### P5 — Planet and sky read as low-resolution and the atmosphere shader is broken

- Atmosphere: `FrontSide` shell at 1.03 R with `rim = pow(1 − dot(N, V), p)` and a sun term `max(dot(N, sunDir), 0)` for limb brightening and a night-side fade; a second, larger `BackSide` shell whose alpha falls off with distance from the limb for the outer glow (two draw calls, replaces one).
- Planet: albedo 2048 × 1024 (`makePlanetTexture(style, 2048)` already parameterised), a `normalMap` derived from the elevation `e` the painter already computes, a `roughnessMap` (ocean ≈ 0.15, land ≈ 0.9) for the sun glint, an `emissiveMap` of night-side city lights, and a separate cloud sphere at 1.005 R with an alpha canvas and slow rotation; ≈ 4 × 11 MB at 2048 × 1024. Painting cost grows 4× over today (not measured; §0) — generate in a Worker or at boot behind the existing `#boot` screen.
- Stars: write `renderer.getPixelRatio()` into the `pixelRatio` uniform on `resize`, a magnitude distribution instead of three sizes, and a seeded subtle twinkle in the vertex shader.
- Galaxy band: 2048 × 1024 with dust lanes and embedded star density, slightly warmer core; nebula haze for the Citadel from the same painter.
- Sun: procedural lens-flare billboards along the sun–screen-centre line, occluded by a depth sample or a ray test against the planet; sprite scaled to a plausible 2–3°.

### P6 — Engine glow is one sprite and one material per nozzle, with no plume and no light

`BillboardPool` instance for the discs (AP §11.1), a second instanced quad stretched along −heading whose length follows throttle (brief §15.3), nozzle emissives relying on P1's bloom, colours from `factions.ts`, and the hero-ship `PointLight` of P3. Removes 463 materials and up to 114 draw calls per frame at today's counts.

### P7 — Colour-space hygiene and tone-mapped additives

`texture.colorSpace = SRGBColorSpace` on the glow disc, the sun and the effect discs (or author them in linear); after P1 keep `toneMapped` true everywhere so `OutputPass` maps once; retune additive opacities under the new mapper.

### P8 — Depth strategy

Keep `logarithmicDepthBuffer` until measured on a GPU; try `reversedDepthBuffer: true` at the cinematic tier (automatic fallback without `EXT_clip_control`) and compare z-fighting on the planet limb and hull detail at the same shots.

### P9 — Material instance hygiene

Per-sprite `SpriteMaterial`s (§1.8), per-ship material clones on damage (`battleView.ts:312–318`) and per-piece clones on death (`:352`) → one material per faction with `instanceColor` / uniform-driven tint through the A2 instancer and pooled sprites; cloned materials stay for the ≤ 24 death pieces only.

### P10 — Render-side determinism

§1.10; already A1/B1, repeated here because every new effect above must obey it.

## 3. Honesty notes

- All counts come from one scene state at t = 30 s; effects were idle at that instant, so the spark pool is absent from the material counts.
- SwiftShader runs the same GLSL as a GPU; sampled colours should agree within rounding, but anisotropic filtering and MSAA quality differ, and no frame-time figure is reported for that reason.
- ACES figures are computed from three's shader coefficients; the one place both exist, the sampled running-light median (255, 166, 105) and the computed `#ff9251` agree once the additive sprite and highlight blending are allowed for.
- The planet magnification is computed from the measured camera positions and the texture's equatorial texel size; at higher latitudes the texel is narrower in longitude, so the figure is a lower bound for the magnification there.
- Memory figures are arithmetic on dimensions and formats, not driver readings.

## 4. Reproduction

Scripts (scratchpad, not committed): `measure-templates.mts` (headless template counts), `measure-uv.mts` (texel-density spread), `measure-live2.mjs` (live `renderer.info`, materials, lights, deltas; writes `live.json`), `closeups.mjs` (HUD-free framing by `rig.mode = 'free'` + `freePos/freeYaw/freePitch`, isolated renders), plus a 20-line PIL sampler and a 20-line ACES port. Sequence: `npx vite --port 5181 --strictPort --host 127.0.0.1` in the worktree, then `node closeups.mjs`; the Final Battle quick-battle flow is the one `scripts/perf.mjs` uses. The stage A screenshot script of brief §16.4 should adopt the isolated-render sampling as its palette check.
