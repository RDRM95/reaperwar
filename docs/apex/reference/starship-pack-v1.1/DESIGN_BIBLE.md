# MASS EFFECT SHIP DESIGN BIBLE — ENFORCEABLE RULES

## 0. The prime directive
Recognisable **shape first, surfaces second, effects last**. The final model must match the chosen in-game source at the same camera angle with overlays before anyone adds detail. Do not replace a Mass Effect hull with a generic new sci-fi ship that happens to use faction colours.

## 1. Evidence / attribution tags
- `ON_SCREEN`: actually visible model or game capture, including ship-model collectible.
- `CONCEPT`: actual official concept with possible changes before shipping.
- `NAMED_ONLY`: vessel/class described in canon without a settled exterior.
- `RECONSTRUCTION`: third-party modelling work, not official canon.
- `APEX`: original AU vessel and AU technical specification.

If a class is `NAMED_ONLY`, the game may create an original model but UI must say `Apex reconstruction`, never `official Mass Effect ship`.

## 2. Species / faction geometry grammar
### Systems Alliance
Visually engineered, aerodynamic-feeling arrow/wedge hulls, rational spinal weapon design, large directional engine structures, white/grey with restrained blue on ME3 warships. The exact hull is specific to vessel role. Normandy, cruiser and dreadnought are separate meshes.
### Turian Hierarchy
Layered feather-like plates; angled wingplanes, crest/beak front mass, mineral neutral materials with red accents. Do not make them generic human naval frigates with red stripes.
### Asari Republics
Large smoothly swept geometries; broad curved canopy and tapering structures, much less faceted than Alliance. Destiny Ascension must preserve its unmistakeable broad silhouette, including the main disc/fan form. Fan-created cruiser class names not accepted as official.
### Salarian Union
Published art direction is rounded and submarine/salamander-like. No universal officially sized salarian dreadnought mesh is established here; design new variants as reconstructions.
### Geth Consensus
Continuous machinic organic envelopes, recesses, smooth exteriors, variable segmented structural surfaces, violet low-intensity technical glow. Cruiser and transporter are separate craft. The Rannoch dreadnought has primary artist reference.
### Quarian Migrant Fleet
A heterogeneous salvage fleet. Do not clone one ring warship into every civilian hull. Keep liveships, modified freighters and purpose-built/converted warships separate. If fitting dreadnought cannon on liveship, show brutal retrofit, weak armour and vulnerable habitat.
### Cerberus
A recognisable Alliance-industrial descent with ruthless high-spec refinement. White/black/orange, but not merely palette swaps where ME3 shows distinct hulls. The Normandy SR-2 is the same ship under both liveries.
### Reapers
Individual vehicle anatomy, irregular layered carapace, articulated legs and ominous massive central structure. Preserve 2,000 m capital vs 160 m destroyer difference. The destroyer is its own structural type with head plates folding open. Avoid oversized glowing bloom, neon hulls and airplane manoeuvres.
### Collectors
BioWare art notes explicitly cite termite mounds and insect hives; use packed-mud insectile volumes and nonhuman asymmetries; avoid polished generic warship panels.
### Batarians / Volus / Terminus
Do not manufacture 'canon' uniform fleet designs from fan pages. Use explicit reconstruction labels; in Terminus especially, mixed donor hulls and non-standard retrofit weapons are expected.

## 3. Scale authority
- Reaper capital: 2,000 m per ME3 codex.
- Reaper destroyer: 160 m per ME3 codex.
- Conventional dreadnought: generally 800–1,000 m in ME1 codex; individual meshes may differ.
- Quarian 643 m cruiser; Geth 1,190 m dreadnought; Alliance 707 m cruiser; Turian 500 m cruiser; Cerberus 700 m cruiser; Normandy SR-2 196 m: **fan model extraction**, not verified canon specifications.
- Normandy SR-2 alternative 170 m from an older art-director interview: acknowledge conflict rather than silently choose.

Set `gameplay_length_m` in a **separate balance file**, never overwrite `length_m` source metadata. Preserve the world scale in small fleets; offer optional perspective/LOD trickery for very large battles without falsifying ship geometry.

## 4. Weapons: placement and sequencing
- Dreadnought main mass accelerator: axial/spinal, fore-aft aligned; visibly commands manoeuvre orientation.
- Cruiser mass accelerator: bow-spine and secondary batteries as justified by reference.
- GARDIAN laser/point defence: tracks inbound fighter/torpedo threats, not theatrical full-strength capital-ship blasts.
- Disruptor torpedoes: visible launches, time-of-flight, intercept windows and impact effects.
- Thanix: rare powerful beam-like weapon class; only equip ship variants with credible technology chronology or explicit Apex mod.
- Reaper main gun: articulated charge / face-aperture sequence; intense brief discharge, pressure/impact effect.
- For all shots: charge or traverse → muzzle effect → projectile/beam travel → impact exactly on target frame → shield/armour/damage response → audio matching events.
- Never invent decorative turrets that float above hull or fire through their own superstructure.

## 5. Movement / formations
- In space, ships accelerate/translate and rotate under thrust/torque; no automatic banking to turn. Banking only as controlled visual attitude choice.
- Dreadnought battle lines seek bow-on alignment for axial cannon duels; codex describes extreme-range exchanges (tens of thousands of km), lateral evasive movement and escort screens.
- Cruisers screen larger assets, reposition toward vulnerable flanks; frigates scout and can fight in four-to-six-ship wolfpacks per codex.
- Fighters make close approach and use torpedoes; carriers remain behind the line where practical.
- Reapers are aggressive and resilient but should not randomly spin, orbit like helicopters or ram without narrative order.
- Preserve diverse faction doctrines instead of identical circling AI for all hull classes.

## 6. Readability, lighting and FX
- Dark space remains dark. Use physically plausible exposure; no grey luminous fog field.
- Hull material roughness, subtle illuminated windows and engine glow—not full-surface emissive paint.
- Show silhouettes against starfield and against bright planet, without overblown bloom.
- Keep actual ship orientation stable between fleet view, first-person gunnery view and battle calculator data.
- For VFX, never hide the source hull silhouette under particle haze.

## 7. Ship model deliverables
Each `P0` vessel requires: master mesh, 3 LODs, collision proxy, materials, engine thruster transforms, muzzle transforms, PD turret mounts, shield impact bounds, hardpoint schema, damage section map, docking pose, scale datum and six reference camera captures (top, bottom, port, starboard, front, rear), plus 3/4 hero.

Quality gate: silhouette overlap approved for two orthographic views and one 3/4 view; key proportion errors documented; all gun and engine transforms visually located; source URL preserved in metadata; no hardcoded fan measurements as canon; gameplay performance budget met.
