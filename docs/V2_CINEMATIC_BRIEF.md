# V2 brief — Cinematic Reaper War

This is the build prompt for the next version. It is written so it can be handed to a developer (or back to the assistant) verbatim. Rule of cool wins over "realistic but boring" as long as the result still reads as Mass Effect. Nothing here presents AU content as canon, and no game assets are ever copied: every model, sound and texture stays original.

## 1. Goals

1. **Footage-grade Final Battle of Earth.** The player records gameplay of the combined fleet's arrival and first exchange and lays the game's own cutscene audio over it (fleets arrive, the dialogue, no alien roll call). The simulation therefore has to hit the cutscene's beats in the same order and at a controllable pace.
2. **Showcase mode.** A new mode that plays the Prime/Apex "Successful Refuse" as a scripted, professionally shot scene using the existing models: pre-planned camera moves, paced cuts, stacked gameplay events. It is a cinematic, not a fight the player steers.
3. **Mass Effect visuals.** Weapon effects, impacts and scale shots that look like the trilogy's space combat.
4. **Design lock-down.** Every ship class gets a reference sheet and a frozen silhouette so later work polishes rather than redesigns.
5. **Roster fixes.** Reapers get Oculus fighters; Cerberus takes part in the Final Battle; HADES is correctly described and rendered.

## 2. Final Battle of Earth — beat sheet to match

The scenario gets a `cinematic_arrival` option (default on for the Final Battle) that stages the first 90 seconds on a fixed timeline so footage lines up with the audio. Timestamps are editable in a single table (`src/scenarios/finalBattleBeats.ts`) so the recording can be nudged to the audio.

| Beat | Sim time | What the simulation does | What the camera does |
| --- | --- | --- | --- |
| Arrival | 0–12 s | Sword fleet drops out of FTL in waves at the Charon relay side of Earth: Alliance first, then Hierarchy, Republics, Union, Migrant Fleet, geth, Cerberus last. Each wave is a flash-and-decelerate with a drive plume. | Wide establishing shot from below Earth's limb; slow push-in as waves stack up. |
| Form up | 12–30 s | Fleets slide into a single line abreast, dreadnoughts centred, cruisers flanking, carriers behind, frigates and fighters screening ahead. | Lateral tracking shot along the line; a low pass under a dreadnought's keel. |
| Reapers advance | 20–38 s | Harbinger and the capital line rise over Earth's terminator, arms unfolding; destroyers spread; Oculi launch in swarms. | Reverse angle from behind the Reaper line; the eye glows wake up in sequence. |
| Simultaneous volley | 38–44 s | **Every dreadnought and cruiser fires its spinal gun within the same 1.5 s window** (a `fleet_volley` order the AI issues once at the beat, then normal fire control resumes). Tracers cross the gap together; Reaper barriers ripple in a wall. | Side-on wide shot of the whole line firing, then a 100-ms cut to a close shot of a muzzle flash, then the impact wall. |
| Reaper answer | 44–52 s | Capital ships fire their beams together; at least one cruiser dies in the first exchange; a dreadnought takes a beam and holds. | Beam sweep seen from the receiving side; camera shake. |
| Fighter screen | 50–80 s | Alliance and turian fighters meet the Oculi between the lines; torpedo runs begin. | Chase cam through the furball, then pull back to a distance shot that shows how small it is against the capital lines. |
| Free play | 80 s + | Normal simulation; the player's orders take over. | Player's choice; the cinematic director keeps offering distance shots. |

The pace knob: a single `beatScale` (0.5–2.0) stretches or compresses the whole table so the recording can be re-timed without editing beats.

## 3. Showcase mode (Prime/Apex scripted scene)

- New main-menu entry **Showcase** → picks a scene (first scene: *Apex: The Refuse at Sol*). Runs the simulation with a scripted event stack and a shot list; HUD hidden, letterboxed, subtitle-style captions for context ("ALTERNATE UNIVERSE · PRIME/APEX").
- Scenes are data (`src/showcase/scenes/*.ts`): a list of `{ at, event }` entries (spawn wave, issue volley, force a kill, trigger a HADES strike, detonate) and a list of `{ at, shot }` camera moves (dolly, orbit, crane, rack between subjects, hold, cut) with easing and duration. The director plays them deterministically from the seed.
- Shot vocabulary to implement in the camera rig: **dolly** (move along a path), **orbit** (around a subject, with offset), **crane** (rise/fall while holding a subject), **rack** (slide focus from one subject to another), **long lens** (narrow FOV distance shot that compresses the fleet), **hold** (static, with micro-drift), **cut** (instant).
- Pacing rule: no shot shorter than 1.2 s except reaction cuts; an establishing wide every 20 s; a close-up of one hull detail every 30 s; beats land on events, not on timers.
- Rule of cool: a dreadnought broadside at point-blank, a Reaper arm sheared off by a HADES strike, a cruiser flying through a debris cloud, a fighter wing threading a Reaper's arms. If an event cannot happen naturally, the scene script forces it.
- Export: a **Record** toggle renders at a fixed 60 fps timestep with a frame counter so screen capture is smooth; optional hide-cursor and 2.39:1 letterbox.

## 4. Mass Effect visuals and weapon effects

- **Mass accelerator rounds**: bright blue-white tracer with a short hot core and a faint ionised trail; muzzle flash as a brief sphere plus a lateral vent; impact on barriers makes a hexagonal ripple that spreads across the shield shell; impact on hull makes a white flash, a spray of molten slag and a lingering orange glow at the hole.
- **Thanix**: continuous molten stream, orange-white core with a blue sheath, slag drip particles along its length, hull impact that "pours" sideways.
- **Reaper beams**: deep red core, darker red glow, lens-flare at the eye, hull contact that cuts a slit of white-hot metal; a beam that kills a cruiser splits the hull in two on the beam line.
- **Kinetic barriers**: visible only on hit (the fresnel shell already exists); on collapse a full-shell flash then fragments.
- **Explosions**: capital deaths in three stages (internal flashes, hull breaking into the existing pieces, a slow expanding shell of debris and gas), with a brief screen-filling white for dreadnought-class.
- **Distance shots**: the LOD point cloud becomes faction-coloured tracer sparks so long-lens shots show thousands of rounds crossing; volleys read as walls of light.
- **HADES** (Prime/Apex AU weapon, never canon): a dense kinetic penetrator with a nuclear warhead fused to detonate after penetration. Visual: ordinary accelerator tracer, then on hull contact a hard white flash with a brief shadow-casting pulse, a ring shock that distorts the background, and the Reaper hull venting from the inside for several seconds. Numbers: the kinetic hit as today, plus a warhead burst that applies the `warhead` damage type internally (barriers already down at the penetration point) and a short subsystem outage. Text everywhere describes it as "penetrator with a nuclear warhead", never as "nuclear mass rounds".
- **Oculus**: Reaper fighter-class drone, spherical with a red lens; fast, fragile, fires a short red laser; launched in swarms from capitals and destroyers (hangar system already exists). Model is an original design.

## 5. Roster and design lock-down

- Cerberus in the Final Battle: under canon rules a Cerberus strike group arrives on the Reaper side mid-battle (hostile to both; targets the Alliance); under cooperative timelines it joins Sword. World-state option `cerberus: 'hostile' | 'absent' | 'allied'`.
- Every class gets a **reference sheet** in `docs/design/<class>.md`: three-view silhouette description, proportions table (length/beam/height ratios), signature features, colour and light placement, "must read as" checklist, and a frozen screenshot set (bow, profile, three-quarter). The reference is textual and original; screenshots of the trilogy's ships are used only for study by the person making the models and are never committed.
- Priority order for design corrections: Sovereign-class Reaper (arm count six, hood profile, arm sweep), Reaper destroyer (four legs, "walking" stance), Everest/Kilimanjaro dreadnought (long gun housing, forward superstructure, broadside sponsons), Alliance cruiser and frigate, Normandy SR-2 silhouette, turian dreadnought (pincer bow), asari dreadnought and Destiny Ascension (four-prong hull), geth dreadnought (ring and hood), quarian liveship, Cerberus cruiser, salarian cruiser, Oculus.
- Once a sheet is marked LOCKED, builders may add detail but not change proportions or silhouette; tests compare bounding-box ratios of each template against the sheet.

## 6. Acceptance checks

- A 60-second Final Battle recording at `beatScale 1.0` shows arrival waves, line formation, Reaper advance, a simultaneous volley and the first losses in that order.
- Showcase scene runs to its end with zero console errors, with every listed shot type used at least once.
- Screenshots: volley wide shot, HADES strike close-up, Oculus swarm, Cerberus arrival, each hull's three views.
- Existing unit, balance and end-to-end suites stay green; new tests cover beat scheduling, the volley order, HADES burst damage, Oculus launch and the Cerberus world state.
- All AU content keeps its labels; no screen presents the Apex scene as canon.

## 7. References

The assistant can research and write the textual descriptions (silhouettes, proportions, feature lists, cutscene beat order) from public descriptions. Visual study material — screenshots of the ships and of the Final Battle cutscene — is more useful when the person supplies it, because it can be looked at directly while modelling and it keeps the decision of what to study in the person's hands. Nothing supplied is committed to the repository.

## 8. Feedback round 2 — combat feel, scale and new hull types (reworked prompt)

The following are hard requirements added after the first recording test. Each is written as an outcome, the observed problem, and the acceptance check. Rule of cool still applies; everything must still read as Mass Effect; AU items keep their labels.

### 8.1 Fleet movement must look like Mass Effect, not a spinning plate
- **Observed:** ships spiral around each other and whole fleets rotate collectively, as if standing on an invisible turntable. Likely cause: the formation anchor re-aims at the enemy centroid every decision, so every slot swings around the anchor as a rigid body; when two fleets each do this they orbit one another, and the frigate/fighter "orbit" behaviours add individual spirals.
- **Required:** fleets close along a bearing, decelerate into engagement range and **hold a line** (broadside or bow-on as doctrine dictates); the formation heading has a slow turn-rate limit (a few degrees per second) and stops re-aiming once the enemy is inside engagement range; individual ships keep station with damped steering (no circling), frigates flank in straight runs and turn-ins, fighters make strafing passes rather than orbits; Reapers advance in a loose 3D cluster and do not spiral.
- **Check:** a headless trace of fleet heading and the angular momentum of each fleet about its anchor stays below a threshold during a Battle of Earth; recorded footage shows lines, not wheels.

### 8.2 Three-dimensional, stacked formations with higher ship counts
- **Required:** formations use the vertical axis: layered lines (dreadnoughts centre line, cruisers stacked above and below and on the flanks, frigates screening ahead in a curved shell, carriers behind and above), stacked wedges, boxes; Reaper formations as a descending 3D swarm with capitals in the core and destroyers in the shell.
- **Required (amended, owner's call):** **no fixed per-side cap.** The only limit is operational: the simulation and renderer must scale as far as the machine allows so battles can be epic, with Reaper/organic ratios like Mass Effect (hundreds of organic hulls against dozens of enormous Reapers). Engineering this needs: spatial hashing or sector lists for targeting, point defence and collision (no O(n²) per step), staggered decision intervals, fighters and Oculi simulated as flights when numerous, instanced rendering for identical hulls, LOD plus the far point cloud, and a statistical distant-engagement layer for whatever exceeds the live budget. A **performance governor** measures step and frame cost at runtime and degrades visuals first (effect density, LOD distances, glow sprites), then warns in the custom editor and briefing when a chosen order of battle exceeds the measured budget for the current machine; the player can override the warning. The campaign engagement scaler uses the same budget instead of a constant.
- **Check:** the headless benchmark (`npm run perf`) publishes steps-per-second and draw calls for 100, 300, 600 and 1,000 hulls per side; 300 vs 100 must run at ≥ 20 simulation steps per wall-clock frame headless; the e2e Battle of Earth still completes; the governor's degradation ladder is covered by a unit test.

### 8.3 Kinetic barriers that envelop the hull
- **Required:** the barrier visual is a slightly inflated copy of the ship's own hull silhouette (merged hull geometry scaled ~1.06–1.1, fresnel shader, hexagonal ripple spreading from the impact point), visible only on hit and on collapse; not a sphere.
- **Check:** screenshot of a dreadnought under fire shows a hull-shaped shimmer with a ripple at the hit.

### 8.4 Sound: mass accelerators and the "seismic" AU rounds
- **Required (procedural Web Audio, nothing sampled):** mass-accelerator firing (sharp electromagnetic crack with a low thump), travel (brief whine Doppler-shifted for near passes), impact (metallic bang with debris crackle; barrier hits a crystalline "zap"); Reaper beams (deep rising drone); Thanix (molten roar). For AU organic rounds that exceed canon range and yield (hyper-mass accelerators, Titan/HADES, Nova Array) a **seismic-charge style** signature: a sharp crack, a fraction of a second of near-silence, then a huge delayed bass "bwaaam" with a long tail. Distance attenuation and a short light-before-sound delay for far shots.
- **Check:** audio settings expose a "Seismic AU rounds" toggle; recording captures the delayed boom on a Titan shot.

### 8.5 HADES nuclear effect
- **Required:** on a penetrating HADES hit: hard white flash with a shadow pulse, a ring shock that distorts the background, internal venting from the hull for several seconds, and a secondary internal detonation sound. Described everywhere as a penetrator with a nuclear warhead.

### 8.6 Nobody sits still, nobody runs
- **Required:** no fleet-wide retreat off the map. Damaged ships perform a **tactical withdrawal**: fall back behind the line, regenerate barriers, re-engage. Reapers never retreat and never idle. Carriers and liveships keep distance but still manoeuvre and shoot. Orbital platforms rotate to bear. Every unit with a weapon in range is firing or moving to get a solution.
- **Check:** headless trace: at no time after first contact are more than 10 % of a side's live ships both stationary and not firing for 10 s; no ship ever flags `escaped` except fighters recovered to a carrier.

### 8.7 Misses and firing solutions
- **Required:** a per-target **firing solution** that builds over seconds of continuous tracking (sensors, ECM, target acceleration and range all matter; a hard manoeuvre or barrier flare degrades it) and drives a realistic miss distribution: first salvoes mostly miss, long-range shots stream past the target and keep flying, near-misses flare the barrier edge. Spinal guns need a bow solution (arc) and a predicted intercept; broadsides fire more freely but miss more. Lots of visible misses at range; concentrated fire after solutions mature.
- **Check:** hit rate at opening range below 25 %, rising above 60 % after 20 s of tracking on an unmanoeuvring target; replay determinism preserved.

### 8.8 Reapers: bigger, blacker, more armoured, correct light colour
- **Required:** hull near-black with graphite plating and a cold dark-blue sheen (no brown), layered armour plates on body and arms, thin pale-blue seams, deep crimson running lights and red beams on every Reaper; **only Harbinger** carries the yellow-orange aperture and seam glow (all other Reapers keep the canon red); a sensible scale increase so capitals look colossal next to dreadnoughts: lock the Sovereign-class at 2,000 m overall against a 1,000 m Kilimanjaro-class (2:1 in length and far bulkier; the body is a long tapering spine ~55–60 % of the length rising from a layered hood, arms ~40 %), destroyers stay 160 m; see docs/design/SCALE_REFERENCE.md for the owner-supplied chart notes; collision/hit radii follow the new size and balance is re-checked.
- **Check:** side-by-side screenshot of a Kilimanjaro-class next to a Sovereign-class shows the 2.2:1 relation; Reaper palette values recorded in the design sheet.

### 8.9 Super-dreadnoughts
- **Required:** a `super_dreadnought` role for hulls near or at Reaper capital size: Destiny Ascension (canon, ~1.6 km), Normandy Valkyrie (AU, 2 km), and an AU "Apex super-dreadnought" line for the Alliance and Hierarchy (1.6–2 km, two spinal channels, heavy barriers) available in Apex presets and custom battles with AU labels.

### 8.10 Fixed orbital defence platforms
- **Required:** `fixed_platform` role: Mass Effect-tech orbital defence platforms in the spirit of Halo's ODPs and super-MACs — a station hull (1.2 km class) around one or two dreadnought-grade (or longer, heavier) mass accelerators, heavy barriers, GARDIAN clusters, no propulsion beyond slow orbital drift and slew-to-bear. They appear as Earth's and homeworlds' orbital defence (campaign defence index), in the Final Battle (Sol network: 612 platforms is an AU caption; a handful are simulated), in custom battles, and as a Showcase subject. Canon label: SIMULATION_ESTIMATE for existence as modelled; the super-MAC variant is AU.
- **Check:** platform cannot be ordered to move; it slews at a few degrees per second; a Reaper assault on Earth engages the platforms first.

## 9. Feedback round 3 — named ships and the Harbinger event

### 9.1 One Normandy, many SR-2-pattern frigates
- **Observed:** scaled fleets and custom battles can field dozens of hulls named "Normandy SR-2", which is absurd: the Normandy is one ship.
- **Required:** split the current `alliance_frigate_thanix` into two classes. `normandy_sr2` is the unique command vessel: canon identity, always exactly one, name "SSV Normandy SR-2", never scaled by fleet strength, present only where the world state says so (the existing `normandy` option), with its own model variant (stealth hull, Thanix refit) and a `flagship` flag. `alliance_frigate_thanix` becomes the **SR-2-pattern Thanix frigate**: an advanced stealth-frigate pattern carrying the Thanix refit, labelled SIMULATION_ESTIMATE under canon (a small number, the Normandy's sister hulls) and AU_MODIFIED where Apex timelines build them in numbers; its own name list (original names), its own description, slightly below the Normandy in crew quality. Every scenario, custom preset, codex entry, database row and test that referenced the old class is updated; the custom editor caps `normandy_sr2` at one per battle.
- **Check:** a Prime/Apex Final Battle shows one "SSV Normandy SR-2" and N "SR-2-pattern Thanix frigate" hulls; the fleet list never shows two Normandys.

### 9.2 Harbinger's destruction is an event
- **Required:** when Harbinger (and, in a lighter form, any other named flagship: Sovereign, Destiny Ascension, Normandy, Valkyrie) is destroyed, the simulation emits a dedicated `flagship_destroyed` event carrying the timestamp, the killing ship and weapon (name and class), the damage type, how many hits the final salvo took, and a **final transmission** (original AU text, never a game quotation; Harbinger's lines stay measured, declarative and contemptuous, for example "This cycle is not concluded." as a mission-kill line and a different final line on destruction). The battle log, the results screen's destruction log and the exported event log show it as an enormous dedicated entry (full-width banner with the timestamp, "KILLED BY <ship> — <weapon>", the transmission, and the fleet communications reaction); the HUD comms channel plays it as a priority transmission; the Reaper intelligence panel changes its headline; the cinematic director cuts to the wreck for a held shot; the showcase scene uses the same event. Other Reapers keep fighting after Harbinger falls (no fleet-wide shutdown).
- **Check:** a headless run that kills Harbinger logs exactly one `flagship_destroyed` event with the required fields; the results screen e2e asserts the banner text.

## 10. Quality and likeness bar (owner's standing requirement)

Everything ships at a higher quality bar, with likeness and accuracy to Mass Effect as the measure, using only original geometry, textures, audio and text:

- **Hull likeness pass, every class.** Each hull is rebuilt or refined against its reference sheet in `docs/design/` (silhouette, proportions, signature features, colour and light placement) until a reviewer who knows the games recognises the class at a glance in a three-quarter screenshot: Kilimanjaro/Everest slab with the full-length gun housing and stepped superstructure; York and Berlin cruiser language; Normandy SR-2 (and the SR-2-pattern frigates) with the split engine nacelles and raised cockpit; turian pincer bows and blade wings; asari curved hulls and the four-prong Destiny Ascension; geth hooded heads and lattice; quarian patched modular hulls and liveship domes; Cerberus charcoal-white-orange; Reapers per `docs/design/SCALE_REFERENCE.md` (graphite-black, cold blue sheen, crimson lights, Harbinger alone yellow-orange).
- **Lighting and materials.** Metallic plating with readable panel lines and specular breakup, emissive windows and seams, faction drive colours (Alliance blue-white, turian cyan, asari violet, salarian green, geth white, quarian amber, Cerberus orange, Reaper red), tone mapping that keeps blacks black and highlights hot.
- **Effects and feedback.** Mass-accelerator tracers, impacts, barrier ripples, Thanix streams, Reaper beams, HADES detonations and capital deaths per §4 and §8, each judged against how the trilogy's space combat reads on screen.
- **Interface.** ME3-style holographic panels (orange and blue on dark), typography and iconography consistent across every screen; AU labels remain explicit.
- **Review loop.** Stage A and D run a likeness review after each pass: screenshot set → adversarial reviewer comparing against the design sheets and the chart notes → fixes, until no blocker remains. The design sheets then lock the result.

## 11. Cinematic cutscene mode (owner's requirement, 2 Nov)

- **Mode.** The Showcase mode becomes **Cinematics**: an in-game, BioWare-quality cutscene player for both canon and alternate-universe scenes, built on the simulation plus scripted events, with the richer effects of §4/§8, letterbox, captions and subtitles, Record mode. Scenes are data (`src/showcase/scenes/*.ts`): event stack, shot list, and a **narrative script** of timed dialogue lines (`{ at, speaker, text, channel }`) rendered as subtitles with a speaker tag, a faction colour and a radio-texture audio cue (no voice synthesis; the dialogue is read as subtitles). Every scene declares `canon` or `au` and the AU label is on screen throughout an AU scene.
- **Scenes (first set).** Canon: *Battle of the Citadel, 2183* (Sovereign and the geth against the Citadel fleet and the Ascension; Fifth Fleet arrival), *Earth Falls, 2186* (Reapers through the Charon relay; the Alliance's first stand and withdrawal), *The Final Battle of Earth* (Sword arrives; the volley; the Crucible approach). AU: *Apex: The Refuse at Sol*, *The Black Fleet Joins the Line*, *Valkyrie Earns Its Shot*, *Harbinger Falls*. Each 2–4 minutes, with establishing, action and aftermath beats.
- **Characters and dialogue.** A character bible (`docs/apex/CHARACTER_BIBLE.md`) defines each speaker's voice: Shepard (Prime in AU: contained confidence, short commands, listens), Admiral Hackett (measured, operational), Admiral Anderson, Garrus, Liara, Tali, EDI, Joker, the Illusive Man (controlled, proud, strategic), Javik, Harbinger and Sovereign (declarative, contemptuous, patient; never a shouting villain). All lines are **original writing in character**, never quotations from the games; short; no exposition dumps; the music and the pictures carry the emotion. The writers' room review (an adversarial reviewer) rejects out-of-character lines, clichés, game quotations and anything that presents AU as canon.
- **Quality and performance.** Scenes run at the governor's highest visual tier that holds frame rate; effects budget per §4; no console errors; zero Math.random. The campaign **galaxy map** is upgraded too: zoomable and pannable canvas with a nebula backdrop, relay arcs, faction-coloured fleet icons with counts, occupation haze, selected-route highlighting, legible labels at every zoom, touch-friendly, and faster redraw (dirty-rect or layered canvases).
- **Checks.** Each scene plays to the end headlessly in a unit test (events in order, every dialogue line scheduled, captions AU-labelled where required); e2e plays one canon and one AU scene; screenshots per scene; the writers' room review passes.

## 12. Ship names, large-battle HUD simplification, overlay in cinematic mode (owner's requirement, 2 Nov)

- **Every organic hull is named, never numbered.** Deterministic name generation from the battle seed (`src/data/names.ts`): large original name pools per faction and class following each navy's conventions — Alliance dreadnoughts after mountains, cruisers after cities, frigates after battles and historic places, carriers after scientists, all with the SSV prefix; turian PFS names of virtues, campaigns and colonies; asari names of matriarchs, places and concepts; salarian ships after scientists, rivers and STG operations; quarian ships with crew-family suffixes (e.g. "Idenna vas Rayya" style forms where appropriate); geth hulls carry Consensus designations in the geth manner (number-and-dash forms are fitting for them); Cerberus ships after mythological and operational names. When a pool is exhausted the generator appends a Roman numeral (SSV Cairo II), never a bare number. Named canon ships (Normandy SR-2, Destiny Ascension, Kilimanjaro, Orizaba, Sovereign, Harbinger, Kwunu) stay unique.
- **Reapers carry tracking designations instead of names** (this fits them better than plain numbers): an Alliance/Citadel-style contact code per hull, capitals "RC-07", destroyers "RD-23", Oculi unlabelled; named Reapers keep their names. The HUD and the log use the designation everywhere.
- **Large-battle HUD simplification.** Above a threshold of live hulls on a side (default 48, in Settings), the fleet lists collapse to one row per fleet with the hull count and health bars, the tactical overlay draws one label per fleet (name + count) instead of per-ship labels, and per-ship brackets appear only for the selected ships, flagships and anything within a short camera distance. This saves draw calls and screen space; selection still works through fleet rows and by clicking hulls.
- **Overlay in cinematic no-HUD mode.** The tactical overlay gets its own toggle (key O, and a button in the menu) independent of the HUD level, so a recording can run with no HUD but with the overlay's brackets and labels when wanted. The overlay respects the simplification rule above.

## 13. System theatre: in-system travel, FTL and mass relay transit (owner's requirement, 2 Nov)

**Shipped inside V2 (stage A, environment and models):** a mass relay model (the gyroscopic ring assembly around a blue element-zero core, scale ~15 km, slow counter-rotating rings) placed in the `relay` environment and at the Charon relay for the Final Battle arrival beat, so fleets visibly arrive out of the relay's blue corridor with the arrival flash; the Citadel rebuilt to canon proportions (five wards ~44 km long around the ~13 km Presidium ring, ward arms with lit cityscape strips, the Widow nebula haze) so it reads as the Citadel at fleet scale; planets rebuilt for likeness (Earth with recognisable continents from an original coarse coastline table, Luna, Palaven's cratered surface, Thessia, Rannoch, Sur'Kesh) with cloud layers and night-side city lights; better skyboxes per system.

**Scheduled as V2.1 "System theatre" (first phase after the 1.0.0 release; design now, build after):** a new mode and campaign layer at system scale:
- A **system map** (Sol first: Sun, Mercury, Venus, Earth and Luna, Mars, the Belt, Jupiter and its moons, Saturn, Uranus, Neptune, Pluto with the Charon relay) at compressed but consistent distances, with each body's orbit, defence platforms, stations and shipyards as objectives.
- **In-system FTL hops**: a fleet orders a jump between bodies; transit time from distance and drive rating; drive heat and static-discharge needs (ships must discharge at a planet's magnetosphere after a number of hops, per the codex) create tempo; arrival scatter so fleets re-form on arrival; an arriving fleet is briefly vulnerable.
- **Relay as entry and exit point**: attackers enter the system through the relay (Reapers through Charon) and leave the same way; defenders choose where to stand (at the relay choke point, in Earth orbit, in depth). Relay transit as a mechanic matching the games: ships queue and align on the relay's axis, the corridor forms, ships accelerate out in order with the characteristic blue streak, arrival at the far relay with scatter proportional to mass; a contested relay can be blockaded, and a fleet mid-transit cannot fight.
- **Engagements** occur where fleets meet: the existing battle simulation runs at that body with its environment, platforms and arriving reinforcements by FTL hop or relay.
- **Campaign tie-in**: the galaxy campaign's system defence index becomes the system map's platforms and garrisons; victories and losses flow back.
- Everything labelled: canon mechanics (relay use, discharge) as CANON_INFERRED where the codex supports them, numbers as SIMULATION_ESTIMATE.

## 14. Alternate Timelines hub (owner's requirement, 2 Nov; scheduled V2.2)

A dedicated, clearly separated section of the game ("Alternate Timelines", never mixed with canon screens) holding timeline families that stay inside or next to the Mass Effect tech tree but take other paths. Each family is a bundle: a rule set (the existing preset engine, extended with tech families below), factions and fleets, scenarios, a campaign variant, codex pages and a lore page, all labelled AU. The Reapers remain a challenge in every family unless the family is explicitly a HFY power fantasy, which is labelled as such.

Catalogue (first set; names are placeholders and can change):
1. **Early Beacon (1800)** — a Prothean beacon on Mars warns humanity in 1800; ~300 years of isolated development and military build-up before the Charon relay is opened in 2149 as instructed. Fully built navy, fortress Sol, mature eezo tech, Prothean-derived doctrine; Council relations start from strength.
2. **First Contact Ascendant** — a more extreme, prepared humanity wins the First Contact War decisively in 2157 and keeps going: Farixen rejected, aggressive expansion, strained Council, larger dreadnought line, harder Alliance doctrine.
3. **One Humanity** — Cerberus and the Systems Alliance are one organisation or ideologically aligned from the start: the Illusive Man as a director inside the Alliance, Black Fleet electronics and Thanix fits fleet-wide, Cerberus politics as state policy; the moral cost shows in the campaign's politics.
4. **Prothean Victory** — the Protheans beat or survived the Reapers; a living Prothean polity exists in 2186 as ally, rival or overlord; Prothean hulls and beam weapons; Javik as an envoy, not a relic.
5. **Dark Lane (non-eezo FTL)** — humanity never gets element zero to work and develops an alternative drive; no mass effect fields, so no kinetic barriers: ablative armour, thick point defence, railguns, lasers and nuclear warheads; relay-independent movement gives strategic surprise; Reaper weapons still work. New tech families in the rules engine: drive type, shield type, weapon class.
6. **HFY: Terran Hegemony** — the extreme prepared humanity, labelled power fantasy; still has to win on the field.
7. **Player civilisation (Stellaris-style)** — a custom civilisation builder (origin, ethics, government, species traits, tech focus) producing a real faction with its own fleet doctrine, production, politics and diplomacy inside the campaign; plays alongside or instead of the Alliance.
8. **Multiverse** (its own sub-section): real franchises by name, lore- and scale-accurate — Halo's UNSC Navy (Infinity-class at 5.7 km, Marathon and Halcyon cruisers, Paris frigates, MAC yields and Archer missiles, Shaw-Fujikawa slipspace), the Covenant (CSO supercarriers at ~28 km, CAS assault carriers, CCS battlecruisers, plasma torpedoes and energy projectors), Skynet's machine forces and other Earths; each faction's numbers come from that franchise's own canon with a `CROSSOVER_CANON` provenance tag (its codex or official sources) and gaps labelled SIMULATION_ESTIMATE, so a Covenant supercarrier is genuinely the size of fourteen Sovereigns and the fights are about scale and doctrine, not hand-waving. Models, text and audio remain original work made from descriptions; franchise names are used as fan-fiction references and acknowledged as their owners' trademarks on the hub screen.

Engine work implied (why this is V2.2): tech families in the rule engine (drive, shields, weapons, armour, AI), faction builder and politics model, timeline-specific scenarios and campaign starts, codex sections per family, and a hub screen. Mechanics stay deterministic and tested; every number is SIMULATION_ESTIMATE or AU_MODIFIED.

## 15. Normandy, stealth frigates and the look of movement (owner's requirement, 2 Nov)

Owner's words: "not necessarily ship movement itself, but make movement, animation look realistic to Mass Effect, especially Normandy and the Normandy-class stealth frigates (make them a standalone, as opposed to allowing me 60 Normandys; would prefer proper stealth frigates and Normandy to fight the way the Normandy would, and stealth drive advantages)". Binding for V2; routed in §15.4.

### 15.1 Standalone stealth classes
- `normandy_sr2` stays the **unique** command vessel of §9.1 (exactly one, never scaled, name "SSV Normandy SR-2", `flagship`, crew quality 1.3). The pattern class keeps the id `alliance_frigate_thanix` but is named **SR-2-pattern stealth frigate** (shortName "Stealth frigate"): a proper stealth frigate pattern, not a Normandy copy — own original name list, own description, crew quality 1.15, SIMULATION_ESTIMATE under canon (a few sister hulls), AU_MODIFIED where Apex timelines build it in numbers. Both classes carry the stealth system of §15.2 and fight by the doctrine of §15.2; no other hull has it (the STG stealth frigate keeps its low signature only).

### 15.2 Stealth system (IES) and the Normandy's way of fighting
- **Canon anchor (CANON_CONFIRMED, paraphrased, no codex text copied):** the Normandy's Internal Emission Sink stores the ship's heat in internal sinks so it emits nothing for passive thermal sensors to see; it can run silent for hours (longer in cold deep space), must eventually vent the stored heat in a bright thermal bloom, and stays visible to eyes and to close-range active sensors. Everything below compresses that into battle time and is labelled **SIMULATION_ESTIMATE**.
- **Class block** `stealth: { capacity: 120, ventTime: 18, detectRange: 2.5 km, revealOnFire: 10 }` (capacity in seconds of combat heat before venting is forced; CORE converts km to battlespace units).
- **States.** `silent`: undetectable beyond `detectRange`; no enemy can target it or hold a firing solution; existing locks on it drop within 2 s; it radiates nothing, so the heat model's cooling is suspended and weapon and drive heat accumulate in the sink. `revealed` (firing a weapon, taking a hit, or an enemy hull — including Oculus drones and fighters within 1.5 km — inside `detectRange`): targetable for `revealOnFire` seconds, then silent again once clear of every enemy's `detectRange`. `venting` (forced when the sink reaches `capacity`, or chosen by the AI when safe): detectable at any range for `ventTime` seconds, after which the sink is empty. A ship that keeps fighting without venting overheats exactly as the heat model says.
- **Doctrine (the Normandy's way).** Stealth frigates are hunters, never line ships: approach silent along the flank or below the plane of the enemy formation; pick a vulnerable target — damaged capital, a destroyer's flank, any hull with barriers down, in that order; the Normandy prefers the highest-value target it can reach; strike in one pass from the target's blind side (Thanix at close range, disruptor torpedoes on the way in); break away with a hard turn and a burn beyond the enemy's GARDIAN envelope; run silent again when out of every detection range; vent when the sink is spent, out of range; repeat. An explicit `attack` order forces engagement; `retreat` leaves silent. Reapers detect silent ships only inside `detectRange` like everyone else (CANON_INFERRED: Sovereign at Ilos and the Collectors never found the silent Normandy); Reaper AI treats a revealed stealth frigate as an "active gun platform" candidate only while it is revealed.
- **Advantages that must be visible in play:** no shots are fired at a silent ship beyond `detectRange` (so no hits); the first strike lands at close range with a full solution; the break-away is survivable; the Normandy survives a Final Battle far more often than a line frigate.
- **Events** `stealth_engaged`, `stealth_revealed { reason: 'fired' | 'hit' | 'detected' | 'venting' }`, `stealth_venting`; HUD indicators "SILENT RUNNING" / "REVEALED" / "VENTING" in the ship panel; silent friendly ships draw a dashed bracket in the overlay.
- **Tests** (`tests/stealth.test.ts`): a silent frigate closing on a Reaper destroyer takes no hits and is targeted by no `weapon_fired` before its first shot; after firing it is revealed for `revealOnFire` seconds; venting is forced at `capacity`; a stealth frigate ordered to attack completes at least two strike passes in 180 s against an undamaged cruiser line; exactly one Normandy exists in every scenario that fields it; determinism of the stealth events.

### 15.3 The look of movement (animation layer)
Beyond the §8.1 movement model (which decides where ships go), the renderer gets an **attitude and thruster animation layer** so motion reads as Mass Effect:
- **Attitude.** Bank into turns (roll proportional to lateral acceleration, capped per role: frigates up to 55°, cruisers 25°, dreadnoughts 8°; the Normandy and the stealth frigates fly like aircraft, rolling and pitching through their runs), pitch with vertical acceleration, smooth roll-out when straight; the nose leads the velocity vector in a turn and heavy hulls "slide" through turns on inertia, keeping their guns on the target while the velocity lags.
- **Thrusters and drives.** Main-drive glow length and brightness follow throttle; manoeuvring-thruster puffs at the right hull points when turning or braking; the Normandy's wing-tip and ventral thrusters flare on hard turns. A silent ship goes **dark**: running lights off, drive glow off, a faint silhouette only; venting is a blue-white bloom from the radiator strips with a heat shimmer.
- **Runs.** Frigate strikes look like the Normandy's: dive from above or below the plane, line up, fire, roll away and pull up; fighters and Oculus drones make strafing passes with roll-outs.
- **Reapers.** Slow body yaw, seeded tentacle sway, the drift when they reposition, the aperture facing the target while the hull keeps moving.
- **Dreadnoughts.** Ponderous; the whole hull turns to align the spinal gun; a decaying recoil shudder along the bore on every spinal shot (Everest, Kilimanjaro, Omaha).
- **Cameras.** A strike camera that follows a stealth frigate's run with lead; the director gains a `stealth strike` cue.
- **Rules and checks.** Render-time smoothing driven by simulation state; any randomness from a seeded `Rng('anim')`; the attitude layer costs under 0.3 ms per frame at 400 hulls (vector maths only); the screenshot set includes the Normandy banking into a strike and a dark silent frigate beside a lit one.

### 15.4 Owners
| Item | Owner | Acceptance |
| --- | --- | --- |
| Class names and stealth block; states, detection, solutions, doctrine, events; HUD-facing fields; `tests/stealth.test.ts` | CORE (T5, T10, T12, T16) | the tests of §15.2; no `weapon_fired` at a silent ship beyond `detectRange` |
| Attitude and thruster animation, dark ship and vent visuals, Normandy and stealth-frigate hull variants | A | screenshots: bank, dark ship, vent bloom; frame cost |
| HUD indicators, dashed overlay brackets, strike camera, director cue | B | ship panel shows SILENT RUNNING / REVEALED / VENTING; cue fires in the Final Battle |
| Custom editor labels (one Normandy; stealth frigates by count), order of battle wording | C | editor shows "SR-2-pattern stealth frigate" |
| Codex (IES canon paragraph, the compression as an estimate), database rows (capacity, vent time, detect range), KNOWN_ISSUES note, e2e | D | codex test and wording test green |

## 16. Graphics and cinematic gameplay overhaul (owner's requirement, 2 Nov; binding)

Owner's words (verbatim intent): "a major graphics and cinematic gameplay overhaul … make the simulator visually resemble a high-quality Mass Effect 3 space battle while keeping the existing deterministic combat engine, fleet AI, statistics and timeline rules intact." Three phases, staged, each verified by looking at rendered results.

### 16.1 Phase 1 — Graphics
- Audit the current Three.js renderer and ship-generation code first; profile it and write down its graphical limitations before changing anything.
- Models: authentic Sovereign-class Reaper anatomy first (correct head orientation, articulated forward limbs, hull proportions, weapon-emitter locations), then Alliance dreadnoughts, the Normandy and SSV Omaha, then every other class against its design sheet.
- Materials: detailed armour plating, surface textures and normal maps (procedural, original), metallic response, emissive components.
- Lighting and image: space lighting, realistic engine illumination, cinematic colour grading, bloom, anti-aliasing.
- Weapon effects: replace the simple beam cylinders with convincing effects; shield impacts, armour penetration, staged explosions, persistent wreckage.
- Cinematic close-ups must look good without compromising large-fleet performance.

### 16.2 Phase 2 — Gameplay and performance
- Preserve the formation, targeting, motion, collision-avoidance and fire-control behaviour the simulation delivers (CORE); the renderer never changes an outcome.
- Improve player battle commands, fleet visibility and cinematic camera selection.
- Large battles: instancing, appropriate LOD, selective visual effects.
- A separate **Cinematic Graphics** preset (quality tier) next to the existing presets.

### 16.3 Phase 3 — Cinematic recording and replay
- Clean HUD-free footage; 4K output target where practical; 30 / 60 fps capture options.
- Cinematic camera tracking and controlled camera cuts; slow-motion combat.
- Deterministic playback, including recorded player orders (the replay file carries the seed, configuration and every order with its tick; the replay re-issues them).
- Optional offline frame-by-frame rendering: the simulation steps by exactly one frame interval per rendered frame and each frame is captured at full quality, so recording quality is not limited by real-time performance.

### 16.4 Engineering requirements
- Work in the existing repository; the combat simulator stays; no other engine.
- Implement in manageable stages; preserve existing working functionality and battle-outcome determinism; add automated tests and visual comparisons; run build, typecheck and the regression suites after changes.
- Before-and-after screenshots from identical camera positions and battle seeds (a committed baseline set and a script that reproduces the positions).
- Completion is never claimed from code alone: the rendered results are inspected (screenshots read by the reviewer) and problems corrected.
- Priorities: accurate Mass Effect ship designs, convincing combat effects and high-quality cinematic footage over decorative interface changes.

### 16.5 How it is run
- A planning workflow audits and profiles the renderer, captures the baseline screenshots and writes `docs/apex/GRAPHICS_OVERHAUL_PLAN.md` (staged tasks with owners, tests and visual checks), vetted by adversarial critics.
- Stage A (rendering) executes phases 1 and 2's render side and the likeness/animation passes of §10 and §15; stage B executes the camera, command, preset and recording/replay work of phases 2 and 3; CORE adds the order log the replay needs. Integration runs the before/after comparison and the perf ladder.

## 17. Extreme-scale engine upgrade — "Harbinger's Total Offensive" (owner's requirement, 3 Nov; scheduled as the first programme after the 1.0.0 release)

Owner's words (verbatim intent): "Upgrade my existing TypeScript/Vite/Three.js Mass Effect Reaper War Simulator for extreme-scale fleet warfare. Do not rebuild the game from scratch. Preserve its existing combat rules, Apex presets, physics behaviour, deterministic results, campaign systems and graphics."

### 17.1 The scenario
- **Harbinger's Total Offensive.** Immediately after the Alpha Relay explosion at Bahak, Harbinger runs a strategic simulation predicting a possible Reaper defeat and answers by concentrating the entire remaining invasion armada into a rapid conventional offensive. Reaper objective: destroy galactic military forces, shipyards, orbital defences and command infrastructure; planetary harvesting is postponed until organised resistance is disabled.
- **Reaper force:** 7,500 Sovereign-class capitals including Harbinger; 30,000 Reaper destroyers; 15,000 harvesting/support vessels (a new class family with its own simulation data: transports, harvesters, processing hulks, escort behaviour — never silently substituted by destroyers or capitals); 52,500 vessels in all.
- **Opposition:** up to 22,600 coalition warships, 18,000 HADES batteries (fixed and mobile Titan-armed platforms firing penetrators with nuclear warheads) and 300,000 automated combat craft (drones and fighters as squadrons).
- Every number above is an **AU scenario value** (labelled AU_MODIFIED / SIMULATION_ESTIMATE); the canon war never fielded these counts. The Reapers must be capable of winning; no ending is hard-coded.

### 17.2 Primary engineering objective
Full-scale battles (75,100 vessels on the field) without freezing the browser, running out of memory or corrupting battle results. First benchmark and profile the existing engine (`scripts/perf-sim.ts`, `scripts/perf.mjs`, the fixed-step simulation and the deterministic tests), then implement in stages, validating each before the next:
1. **Hybrid multi-scale combat simulation** — individual vessel identities and losses are always tracked; distant formations resolve at squadron or sector level; active combat sectors run the detailed ship-level simulation. One continuous battle.
2. **Web Worker simulation** with efficient transferable snapshots (typed arrays, SharedArrayBuffer where available, versioned schema) and a main-thread view that never blocks.
3. **Spatial partitioning** for targeting, range checks, projectile collision and local separation (grid or hashed cells, typed arrays, deterministic iteration order).
4. **Persistent squadrons and theatre-level command** so tens of thousands of vessels act as coordinated fleets: squadrons → task forces → fleets → theatre, with orders flowing down and losses flowing up.
5. **Adaptive combat update frequency** by sector activity, without altering physical simulation time or weapon damage (sub-stepping and batching, never time dilation of the physics).
6. **GPU instanced rendering**, multi-level LOD and distant-fleet visualisation (one draw per class per tier; point clouds and aggregate sprites for far sectors).
7. **Scalable effects** for beams, projectiles, missiles, shields and explosions (budgets by distance and sector activity; pooled, instanced).
8. **Sector-based engagement management** — multiple active combat regions in one continuous battle with shared outcomes, never independent battles.
9. **Persistent event logging**, detailed results and reliable saved/replayable simulations (compact binary event stream, chunked; replay from the order log of §16.3).
10. A dedicated **Extreme Scale** graphics/performance preset.

### 17.3 Accuracy requirements
- Ships are never destroyed artificially to hold frame rate.
- The multi-scale model is **calibrated** against existing full-detail battles with identical configurations and seeds (loss curves, time to decision, winner) and the calibration report is committed.
- Faction advantages, HADES ammunition (penetrators with nuclear warheads), hyper-mass accelerators, Reaper weapon performance, shield mechanics and strategic doctrines are preserved at every scale.
- The Reapers can win; no scripted Apex ending.

### 17.4 Testing and benchmarks
- Staged benchmarks at 1,000; 5,000; 10,000; 25,000 and 75,100 vessels: simulation time per tick, rendering fps, memory, targeting cost, collision cost, event-log growth — on headless Node and on Chromium (Playwright), extending `scripts/perf.mjs`, `scripts/perf-sim.ts` and the deterministic tests rather than replacing them. A benchmark table is committed with every stage.
- Regression tests: determinism at every scale, calibration within tolerance, no artificial losses, squadron and sector bookkeeping (counts conserved), worker snapshot round trips.

### 17.5 Deliverables and placement
A working Extreme Scale battle mode, the Harbinger's Total Offensive scenario, the benchmarks, the regression tests and an accessible interface for viewing and commanding the battle (theatre map, sector list, fleet and squadron orders, the detailed view of any sector). Correctness, stability and scalability come before cinematic graphics. **Placement:** V2 1.0.0 ships first (the cinematic release already in progress); the extreme-scale programme is V2.1, planned by `docs/apex/workflows/extreme-scale-plan.js` (benchmark → design panel → critique → `docs/apex/EXTREME_SCALE_PLAN.md`) and implemented in staged workflows after it. CORE's V2 tasks build the seams now: the spatial grid (T8) as a reusable typed-array module with a cell-size parameter and deterministic iteration, flights (T11) as persistent squadron objects, the distant layer (T15) as a sector-resolver seam, the governor (T18) with an `extreme` tier placeholder, every event as plain JSON that can cross a worker boundary.

## 18. Local-hardware build (owner's note, 3 Nov; pinned, not scheduled)

"For later: a version that can take advantage of local hardware, for quality render and performance fps." Direction: a desktop packaging of the same code (Electron or Tauri with Chromium's GPU flags, or a native WebGPU renderer path behind the same `BattleView` interface) that uses the owner's GPU fully — uncapped pixel ratio, 4K 60 fps recording with hardware video encoding, offline rendering at full quality, larger effect and instancing budgets. Scheduled after the extreme-scale and graphics programmes.

## 19. Combat scale, pacing and fast-forward performance (owner's dev note, 4 Nov; binding, not top priority)

Owner's words, condensed: battles feel too fast and ships fight far too close together, while 8× causes noticeable lag. Fix both at the simulation-engine level, not with visual effects. Priority order inside this note: (1) the simulation/rendering coupling behind the 8× lag; (2) an accurate headless fast-forward to the result; (3) combat distances and pacing, consistent across movement, weapons and formations; (4) determinism tests and benchmarks.

### 19.1 Playback and fast-forward
- Fixed-timestep deterministic simulation independent of rendering fps (exists: `SIM_DT 0.05` with an accumulator); combat calculation separated from rendering and UI updates; rendering capped at a sensible rate whatever the speed; ticks batched per frame without rendering intermediate steps; Web Worker where beneficial; UI controls, camera and menus stay responsive; no redundant calculation, allocation or scene updates during accelerated playback.
- Modes: 1× normal; 2× and 4× accelerated; 8× optimised accelerated; **Fast-forward to result** — run the battle without rendering intermediate frames.
- Fast-forward computes exactly the same battle as normal playback: identical victors and survivors, losses and damage, hits and misses, decisions and targeting, simulated duration, destruction log and event order. No approximation, no simplified combat logic, no weapon changes, no cached outcomes, no change to random-number generation.
- Honest framing (owner's words): eight times as many ticks costs eight times the simulation CPU; the objective is to remove rendering overhead and waste and keep the UI smooth, not to claim acceleration is free. When the machine cannot sustain the requested speed, the HUD shows the achieved speed instead of silently dropping time.

### 19.2 Distances and pacing
- Capital battles currently look like short-range dogfights. Review `BATTLESPACE_SCALE`, weapon ranges, formation spacing, movement and projectile speeds and engagement distances. Strict Lore (canon) should approximate codex combat, including engagements across thousands of kilometres where appropriate; fleets manoeuvre, approach, exchange long-range fire and reposition over believable periods; ships stay visually trackable through camera zoom and cinematic scaling without compressing the simulation; never slow animations while leaving combat unchanged; longer distances must not recreate Reapers queuing out of weapons range.
- Engineering note (lead): the engine already scales every distance and speed together by `BATTLESPACE_SCALE`, so closing and flight times do not depend on it. "Too close" is the ratio of engagement range to hull length, and "too fast" is the time scale (closing speed against range, time at long range, time to kill). They are separate levers, and both feed the calibration. Ship statistics and Strict Lore balance are preserved unless a verified bug requires a change; the calibration (CORE T19) re-pins every balance assertion after the change.

### 19.3 Tests and benchmarks
- Seed 42 regression: identical scenarios at 1×, 8× and headless fast-forward produce identical complete results and event logs (Node, and Chromium end to end).
- Profile CPU time separately for simulation, rendering, UI updates and allocation; engagements of hundreds to thousands of ships.

### 19.4 How it is run (lead)
1. **Playback workstream** (`docs/apex/workflows/playback-fastforward.js`, worktree `stage/P-playback`, after the timelines workflow): an adaptive per-frame simulation budget with an achieved-speed readout, render and overlay throttling and batched effects at high speed, Fast-forward to result as time-sliced stepping with progress and cancel, a performance HUD, the seed-42 determinism tests in Node and an end-to-end test, a playback benchmark. The worker seam is defined here; moving the live simulation into a worker needs the snapshot protocol of the extreme-scale programme (§17.2 item 2) and is done there.
2. **Pacing design** (`docs/apex/workflows/pacing-plan.js`): lore research on ranges and speeds from the repository's lore documents and reference packs, the scale model, pacing targets, the anti-queueing rules, render-visibility and camera consequences, and acceptance tests, written to `docs/apex/PACING_PLAN.md` and critiqued. CORE applies it as a pacing pass before calibration pass 2 (T19); stages A and B carry the visibility and camera parts.

## 20. Gunnery POV and audio overhaul (owner's requirement, 5 Nov; binding for 1.0.0)

Owner's words, condensed: a functional, cinematic, first-person weapon targeting and observation system for all major warships, with an audio overhaul. The priority is making it feel good to watch ships fight. Everything the cameras, HUDs, effects and audio show comes from the existing battle simulation. There are no fake shots and no separate combat logic.

### 20.1 Cameras
- Modes **Fleet View**, **Gunnery POV**, **Target POV**, **Reaper POV**. Any active ship can be selected and its targeting computer observed; one key switches between the attacker and the ship it is shooting at (attacking and defending vessels).
- Gunnery cameras sit at the actual weapon muzzle or sensor array (from the model's mount anchors) with an unobstructed forward view; they show acquisition, tracking, predictive interception, charging, firing, projectile flight and impact.
- Cameras stay synchronised with the simulation; switching cameras never interrupts or resets weapon behaviour.

### 20.2 Alliance tactical HUD (blue-white holographic)
Target brackets that follow the real enemy ships; predicted-interception markers and target-leading indicators; enemy classification, range, relative velocity, hull integrity and barrier strength; main-gun charge indicator, ammunition, weapon temperature and reload countdown; small notifications TARGET ACQUIRED, FIRING SOLUTION, CAPACITORS CHARGING, WEAPON RELEASE, HIT CONFIRMED, each raised by the matching simulation event.

### 20.3 Reaper targeting perception (red synthetic cognition, not a cockpit)
Scanning lines and geometric target analysis; several concurrent target tracks with priority assessments; rapid identification of hull, barrier, propulsion and weapon systems; predictive firing trajectories and interception calculations; cold, efficient transitions from evaluation to discharge; distinct sensory audio (deep mechanical resonance, low-frequency pulses, synthetic processing signals, massive discharges).

### 20.4 Cerberus and HADES systems (amber-and-white classified interface)
HADES penetrator telemetry (the round is a penetrator with a nuclear warhead; the interface never calls it a nuclear mass round): magazine, yield class, target vulnerability (barrier gate state from the simulation), weapon status; a distinct charge-up animation for SSV Omaha's spinal weapon (AU); synchronised firing solutions for coordinated Black Fleet salvos (the simulation's volley/salvo coordination); impact confirmation showing the actual barrier and hull damage from the impact event.

### 20.5 Sound design
Original layered audio with the weight and atmosphere of Mass Effect 3 (no game audio). For every large weapon: (1) quiet electronic target lock and acquisition; (2) rising reactor and capacitor charge; (3) a powerful, distinctive discharge; (4) projectile or beam-trace sound; (5) impact audio delayed until the projectile actually strikes; (6) barrier resonance, armour fracture or structural destruction; (7) mechanical cooldown and recharge. Alliance guns: industrial, magnetic, violent. Reaper weapons: overwhelmingly powerful, alien, mechanical, with deep resonances. No constant overlap: a voice budget prioritises nearby weapons, capital ships and the currently observed target.

### 20.6 Synchronisation (critical)
The AI picks targets in the simulation; reticles track world-space target positions; firing animations follow the real weapon state; charge-up precedes the actual shot; projectiles leave the correct muzzle and follow the simulated trajectory; impact VFX and damage appear together when the collision resolves; capital discharges are far heavier, visually and acoustically, than secondary weapons; travel time follows target motion, weapon velocity and distance; audio, VFX and HUD all read **one authoritative weapon-event timeline** produced by the simulation.

### 20.7 Cinematic presentation
Subtle camera recoil and hull vibration; weapon glow building before discharge; shock effects, barrier flashes, molten armour and visible damage; optional automated camera tracking of important engagements; optional slow-motion replay of major capital-ship kills from a render-side history buffer, never changing the simulation.

### 20.8 Owners
| Part | Owner |
| --- | --- |
| Weapon-event timeline: per-mount telemetry (target, solution quality, predicted intercept point and time, charge progress, cooldown, heat, magazine and special ammunition, last shot) and complete event payloads (charge start, fire with muzzle position and projectile id, impact with barrier/armour/hull damage, penetration and warhead), a `mountWorldPosition(ship, mount)` helper | CORE (T13/T18 scope; INTEGRATION_NOTES bullet of 5 Nov) |
| Mount and sensor anchors on every model; muzzle-accurate projectile origins; charge glow, discharge, trace, impact, barrier flash, molten armour, recoil and hull vibration; the layered audio with its voice budget; the history buffer for kill replays | A |
| The four camera modes, attacker/defender switching, the Alliance HUD, the Reaper perception interface, the Cerberus/HADES interface, notifications, automated engagement tracking, the slow-motion kill replay player | B |
| Codex and README entries for the views, e2e coverage of every camera mode and HUD (reticles on real targets, notifications raised by events), screenshots in the shot list | D |

## 21. Pure battle logic and combat behaviour rules (owner's requirement, 5 Nov; scheduled with CORE's final chunk)

Owner's words: "give option to disable boring gameplay things like sensors and indoctrination, just have it pure battle logic; reapers never retreat unless it's a critical mass defeat or Harbinger is taken out, special event; organics retreat if critically damaged, self preservation; good space combat behaviour; don't like idle fleets unless I order them to hold; attack should mean everyone attacks and finds space so it still looks professional and military tactics."

### 21.1 Pure battle logic (option)
- A **Pure battle** switch in the briefing and the custom battle setup (and a rules flag, so saves and replays carry it): sensor and electronic-warfare effects become neutral (every hull builds firing solutions at its class's nominal rate; no ECM or sensor degradation), indoctrination effects are off (no crew-quality or coordination penalties from indoctrination, no indoctrination events), and strategic side systems stay out of the battle. Stealth stays (it is the Normandy's identity) unless the player also turns it off. Off by default; labelled as a simulation option, not a timeline.

### 21.2 Reapers never retreat, with two exceptions
- **Critical-mass defeat:** when the Reaper side has lost at least 75 % of its committed strength by points, or is combat-ineffective by the existing judgement, the survivors make a fighting withdrawal: they keep firing while they leave.
- **Harbinger destroyed:** a special event, "THE HARVEST FALTERS", with its own transmission and banner. The remaining Reapers make the same fighting withdrawal. This replaces the earlier rule that the others fight on after Harbinger's fall; they still never switch off (they shoot while withdrawing, so the flagship tests' "a Reaper fires within 10 s" still holds).
- Labelled SIMULATION_ESTIMATE (the owner's rule; the trilogy never shows Harbinger destroyed). A rules option keeps the old behaviour ("Reapers fight to the last") for players who want it.

### 21.3 Organic self-preservation
- A critically damaged organic hull (hull ≤ 15 %, or main drive or weapons destroyed) disengages and leaves the battlespace, logged as "withdrew critically damaged" (not destroyed, not escaped intact). Moderately damaged hulls keep the existing tactical withdrawal to a recovery station and return. Fixed platforms cannot leave. Explicit Retreat orders still apply to whole fleets.

### 21.4 No idle fleets; Attack means everyone fights
- No fleet idles unless the player ordered Hold or Defend: reserves arrive and engage, and the AI's default order is to engage. A fleet out of every weapon's range for more than 20 s after contact advances.
- **Attack:** every hull of the fleet engages. Capital lines advance to their standoff band, escorts close to their own weapon ranges, frigates make runs, carriers launch. Ships spread laterally and vertically to open clear firing lanes, so no hull blocks another's line of fire. The structure stays military and readable: battle lines, echelons, layered screens, never a crowd.
- Checks: deterministic tests for no idle fleet without a Hold order, clear firing lanes (no friendly hull inside another's firing cone at fire time beyond a small fraction), the Reaper withdrawal triggers and the organic critical retreat.

### 21.5 Owners
CORE in its final chunk, alongside the pacing pass and before calibration pass 2: the rules flags, the withdrawal triggers, the Harbinger special event, the critical retreat, no-idle and the Attack spacing, and the tests. Stage C: the Pure battle switch and the Reaper rule option in the briefing and custom setup. Stage B: the banner and transmission, and the order tooltips. Stage D: codex and README.

## 22. Formations and pathfinding for watching (owner's requirement, 5 Nov; top priority, "asap")

Owner's words: "I need the formations and ship pathfinding to be realistic and good for watching as a cinematic battle simulation, not lined up in rows, more space in the map between fleets, free camera rotation and zoom in and out … and ships spacing and moving rationally, no ship idles at the back, they reinforce and back them up … need the formation fix asap."

- **No rows.** Fleets deploy as battlegroups — each capital with its own escorts in a loose 3D cluster around it — staggered in depth and height (echelons), with deterministic, seeded variation in spacing and angle so nothing sits in a perfect row or column; the shape still reads as a disciplined military deployment (screens ahead, capitals in the main body, carriers behind and above), never a crowd or a grid.
- **Rational spacing.** Minimum separation scales with hull size; capitals several of their own lengths apart, escorts spread around their group; groups separated so a camera can tell them apart.
- **Rational movement.** Smooth curved approaches and repositioning (no conveyor-belt straight lines, no spinning plates), friendly avoidance, groups keeping station relative to each other while the fleet manoeuvres.
- **No ship idles at the back.** A hull with nothing in reach while its fleet is engaged moves up: it fills gaps left by losses, backs up damaged or outnumbered allies, and leans in to its own weapon range (capitals keep their standoff band); only Hold and Defend orders keep ships back.
- **More space between fleets.** Fleets start well apart and visibly manoeuvre and close; the full codex-scale change follows in the pacing pass (docs/apex/PACING_PLAN.md).
- **Camera.** Free rotation and zoom in every view: done in 0.12.3 (`0ab870b`) — a drag or wheel turn in a director-driven view continues as a free orbit from where the camera is.
- Runs now, ahead of the remaining CORE tasks, as its own workflow (`docs/apex/workflows/formations-fix.js`); CORE's paused T16 work is restored on top later and reconciled.
