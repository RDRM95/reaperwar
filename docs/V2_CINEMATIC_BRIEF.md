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
