# Mass Effect Apex fleet reference and simulator specification

Version 1.0 | 29 October 2026 | Milky Way trilogy setting

This reference defines a playable Apex military history: Shepard Prime survives continuously, the galaxy mobilises, Cerberus fights to destroy the Reapers, and the coalition wins through combat. There is no Crucible, Catalyst encounter, galaxy-wide disabling pulse, synthetic sacrifice, or automatic victory flag.

The accompanying JSON is a reference dataset for adaptation to your simulator. It has not been integrated with an existing application or validated as a prediction of who wins a full war. Successful Refuse remains the project title: this version rejects the Reapers' imposed choices through events, rather than replaying the game's literal Refuse conversation.

## 1 Evidence labels and continuity decisions

| Label | Meaning |
| --- | --- |
| CANON | A statement or quantity in the released games or their codex. An accessible transcription is provided in the source register. |
| DERIVED | Arithmetic using stated inputs. The inputs can themselves be AU. |
| AU LOCK | An established requirement or previously accepted working number for your Apex project. |
| AU PROPOSAL | A new specification supplied here to make that project coherent and usable. |
| SIM | A tunable game parameter, not a claim about Mass Effect physics. |
| UNKNOWN | Canon supplies no defensible numerical value. Keep it null in the canon layer. |

**Canonical setting, counterfactual events.** A victory this large cannot be simultaneously a literal canon outcome. The aim is to preserve the trilogy's machinery, species, visual identity, and character behaviour while changing earlier decisions and military circumstances.

### Locked Apex rules

- Shepard never dies. The two years lost to Lazarus become two years of active preparation.
- Prime combines Paragon coalition building with Renegade decisiveness. His strength is preparation and judgement; it is not omniscience or supernatural immunity.
- Javik is recovered in 2183. His testimony accelerates investigation; it does not instantly persuade every government.
- Jenkins, Nihlus and Saren survive in this continuity. Saren's intervention occurs before irreversible indoctrination. Later scenes must not require his death.
- Both Virmire teams can survive because an additional extraction and demolition plan exists before the assault. This is a changed operation.
- Mordin completes the cure through an earlier, protected programme. His survival does not require repeating the exploding Shroud scene unchanged.
- Quarians and geth reach an early settlement. Legion, EDI, the geth and organic civilisation survive the war.
- The Illusive Man remains unindoctrinated. Cerberus abandons Reaper control, removes compromised cells, shares actionable intelligence and commits the Black Fleet.
- The Treaty of Farixen is suspended through an emergency agreement. A suspension authorises expansion; it does not manufacture ships.
- Bahak's population is evacuated before the Alpha ambush. Zero civilian deaths there is an AU operational achievement, not the canonical Arrival outcome.
- Humanity supplies a major strategic initiative. Every other coalition member supplies capabilities the victory actually needs.

### Numbers retained and corrected

The Alliance establishment remains **15,292 hulls**: 48 dreadnoughts, 144 carriers, 1,600 cruisers, 7,500 frigates, 4,000 corvettes and 2,000 support ships. That is **13,292 warships plus 2,000 support vessels**, not 15,292 combatants. The Alliance operates 16 administrative fleets; these are not sixteen identical formations.

The earlier Sol image states 38,420 coalition warships, but its eight printed faction rows add to 38,000. This edition assigns **420 additional warships to the Cerberus Black Fleet**. That assignment is a new AU proposal, explicitly preserving the old headline total.

The old image also implies that a billion years divided by 50,000 years establishes the Reaper count. It does not. That calculation suggests roughly 20,000 intervals, with uncertain timing, production, failed harvests and losses. It cannot establish either 2,000 surviving capitals or 20,000 surviving capitals.

## 2 Canon anchors

Use these anchors to stop arbitrary power inflation. Numerical fields absent here normally belong in the AU or simulation layer.

| Subject | Canon anchor | Source |
| --- | --- | --- |
| Standard dreadnought | Approximately 800–1,000 m; a representative gun fires 20 kg at 4,025 km/s every 2 s, described as about 38 kt TNT equivalent | C01 |
| Dreadnought inventories | 2183: turian 37, asari 21, salarian 16, human 6 plus one building. 2185: 39, 20, 16 and 8 respectively | C01, C03 |
| Farixen | Dreadnought ratio 5:3:1 for turians, other Council powers and associates | C04 |
| Capital Reaper | Sovereign-class approximately 2,000 m; main weapon estimate 132–454 kt | C02 |
| Reaper destroyer | Approximately 160 m; a cruiser can kill one if it survives into effective range | C02 |
| Capital engagement | Two dreadnoughts can be resisted, three strain barriers, four typically destroy the target | C02 |
| Reaper transit | Estimated nearly 30 light-years per day; no equivalent routine discharge dependency observed | C02 |
| Thanix | Sovereign-derived weapon; introduced eleven months after the Citadel battle; five-second firing cycle | C01 |
| Quarian fleet | Approximately 50,000 vessels, with a large civilian and habitation component | C06 |
| Total Reaper armada | No canonical census | UNKNOWN |

The 38 kt entry is rounded. The stated mass and velocity yield about **38.72 kt** using ordinary kinetic-energy arithmetic. Some legacy codex transcriptions print 2 kg and 283 km/s alongside 38 kt; those inputs produce only about 0.019 kt. Do not combine that contradictory version with the corrected numbers. C03 preserves one such legacy transcription; C01 reproduces the corrected entry.

The four-dreadnought passage is a combat benchmark. It supplies neither a guaranteed duel outcome nor a numerical barrier capacity. Position, timing, missed shots, heat and return fire still matter.

### Technology rules

These are short canon summaries, followed by original simulator implications.

| System | Canon limitation | Apex implementation proposal |
| --- | --- | --- |
| Kinetic barriers | Deflect fast material threats; do not provide general protection from heat or radiation [C07] | Separate kinetic, thermal and radiation channels. A blue sphere is a display effect, not a universal damage rule. |
| Thanix | Material projectile with a severe thermal component, rather than a generic laser [C01] | Reward it against Reaper protection without setting penetration to 100%. |
| Silaris | Costly; strong outer material does not prevent failure of the supporting structure [C01] | Install it selectively around magazines, command spaces and vital machinery. |
| Cyclonic barriers | Canon maintenance and scaling limits restrict deployment to small craft [C01] | Do not give every capital ship an unchanged SR-2 shield upgrade. |
| Normandy stealth | Temporary heat storage, not permanent optical invisibility [C01] | Detection risk rises sharply after firing, sustained thrust or heat saturation. |
| FTL | Mass reduction still requires propulsion; field collapse is dangerous [C01] | No free teleportation, infinite acceleration or effortless weaponised transit. |
| Communications | Buoy networks and costly paired QEC links have different limits [C08] | Redundant command links carry orders; individual ships retain local fire control. |

No live Reaper component is declared safe because it is damaged. Remote handling, isolated tests and independent personnel rotation reduce risk; none guarantees immunity.

## 3 Ship roles and visual design

The following dimensions and masses are **AU PROPOSAL** unless explicitly called CANON. The trilogy does not publish a complete engineering handbook. Values here are deliberate production and simulation choices, not recovered official statistics.

Masses are inertial rest masses for bookkeeping. A mass effect field can change effective mass. Never use rest mass automatically in an FTL collision calculation.

The JSON adds explicitly proposed crew complements and relative mobility ratings. Canonical crew totals, reactor wattage, acceleration and turn rates remain null where unsupported. A relative mobility score is not a physical engine specification.

| Hull profile | Working length | Working mass | Role and design instruction |
| --- | --- | --- | --- |
| Alliance line dreadnought | 900 m, inside canon class range | 6 million t | Long spinal weapon, substantial stern machinery, protected citadel, sparse external gun apertures. Battleship rather than fighter handling. |
| Alliance fleet carrier | 900 m | 4 million t | Large hangar volumes and logistics spaces. Stands behind the gun line. Vulnerability is flight operations and internal compartment penetration. |
| Alliance heavy cruiser | 650 m | 1.4 million t | More power, armour and damage control than a patrol cruiser; still inferior to a capital Reaper. |
| Alliance patrol cruiser | 450 m | 0.6 million t | Routine fleet work, escort leadership and destroyer hunting. Its useful contribution depends on surviving to firing range. |
| Alliance frigate | 180 m | 45,000 t | Reconnaissance, screening, flanking and pursuit. Preserve the compact elongated Alliance silhouette. |
| Auxiliary corvette | 85 m | 9,000 t | Courier or patrol-derived escort. Cheap, useful and fragile; not a tiny dreadnought. |
| Armed conversion | 300–800 m | 0.2–2 million t | Civilian hull with a real retrofit. Ammunition, structural reinforcement and fire control occupy visible volume. |
| Interceptor | 15 m | 20 t | Screens bombers and pursues Oculus drones. No capital-killing primary gun. |
| Torpedo strike craft | 22 m | 45 t | Carries a small expendable anti-ship load. A successful strike requires a return, rearm and relaunch cycle. |
| Fixed defence platform | 1,200 m | 15 million t | Gun, power plant, heat infrastructure and protected control spaces. Cannot chase an opponent around the system. |
| Sovereign-class Reaper | 2,000 m CANON | Unknown; 20 million t SIM placeholder | Use the actual capital-Reaper silhouette. Preserve articulated limbs, hard shell and recessed red weapon. |
| Reaper destroyer | 160 m CANON | Unknown; 120,000 t SIM placeholder | Use the actual destroyer silhouette, distinct from a scaled-down Sovereign. |
| Reaper transport | 200–1,000 m CANON | Unknown | Occupation and harvest logistics. Size does not confer capital-Reaper combat ability. |
| Reaper processor | Canon size unspecified | Unknown | Protected industrial target, often placed near captive populations. No invented dreadnought gun by default. |

### Named ships and class identity

A named ship is an instance or variant of a profile, not a license to invent official specifications. In the JSON, the named-hull catalogue keeps canonical identity separate from proposed combat values.

| Ship or class | Canonical identity | Proposed simulator use | Production reference |
| --- | --- | --- | --- |
| Everest class | Alliance dreadnought class; Everest, Fuji and Elbrus appear in the codex list [C03] | Standard DN profile; older machinery can affect readiness rather than physical gun yield | Use the actual Alliance dreadnought asset selected for your shot |
| Kilimanjaro class | Alliance dreadnought class; Kilimanjaro, Tai Shan, Shasta, Aconcagua and Orizaba appear across the codex lists [C01, C03] | Standard DN base; tune broadside and compartment layout independently | Do not assign a fan-made mesh an official class designation without labelling the choice |
| Normandy SR-1 | Alliance/turian experimental reconnaissance frigate [G01] | Stealth/recon variant; proposed 155 m render length, 15,000 t bookkeeping mass; exact dimensions are not claimed here as canon | ME1 exterior, bridge and Tantalus references |
| Normandy SR-2 | Cerberus-built successor design, later Alliance service in canon [G02, G05] | Proposed 216 m render length, 50,000 t mass; stronger protection and paired Thanix mounts in the upgraded variant | Use the game's actual hull, not a proportionally enlarged SR-1 |
| Destiny Ascension | Asari flagship [G01] | Bespoke heavy profile; proposed 1,800 m render length and 2.4 DKE barrier, not official dimensions or shield capacity | Actual Ascension mesh and Citadel battle frames |
| Volus dreadnought Kwunu | A single named volus dreadnought with Thanix main and broadside armament [C11] | Heavy Thanix variant within the seven minor-power dreadnoughts; no extra hull added | Treat available silhouette material as a reference choice; do not fabricate a canonical detailed plan |
| Geth dreadnought | The Rannoch mission presents a heavily equipped geth flagship [G05] | Machine-crewed heavy variant; proposed 1,300 m render length and 2.0 DKE barrier | Actual Priority Geth Dreadnought exterior and interior |
| Quarian liveship | Food-producing habitat and logistical asset [G05] | Civilian strategic objective, normally excluded from the battle line | Use the model and Rannoch-era flotilla references |
| Collector cruiser | Collector attack vessel in ME2 [G02] | Optional earlier-campaign opponent; proposed 1,000 m render length and 1.8 DKE barrier | The actual ME2 opening and suicide-mission ship |
| Oculus | Reaper combat drone encountered around the Collector base [G02] | Small craft; not an additional capital or destroyer in the invasion census | Actual ME2 model and attack behaviour |
| Sovereign | Individual capital Reaper destroyed at the Citadel in canon [G01] | Capital profile; its special Saren feedback is event-specific | Use its actual model, including the distinctive limbs and shell |
| Harbinger | Oldest/largest identified Reaper; exact size and power remain unspecified [C02] | Explicitly labelled SIM boss variant | Use Harbinger's reference rather than merely recolouring Sovereign |

Do not map a War Assets military-strength score to a ship count or weapon yield. Kwunu's war-asset points are a campaign scoring abstraction, not fifty ships or fifty kilotons.

### Faction design sheets

**Systems Alliance.** Retain recognisable trilogy ship meshes whenever possible. New variants alter antennae, reinforcement and weapon fittings; they do not all become smooth black supercruisers. Blue drive emissions and pale structural panels remain readable at distance. The force includes refitted patrol ships and reserve crews, which explains uneven readiness.

**Turians.** Use the game's sharp, layered hull language and forward-directed combat geometry. Their contribution is the line of battle: excellent formation discipline, experienced damage control, coordinated salvoes and mature training. Human initiative works because turian naval institutions make it executable at scale.

**Asari.** Use curved asari hulls and the recognisable Destiny Ascension. Prioritise elite targeting, selective protection and patient manoeuvre. Advanced construction is not an excuse to give every asari vessel the same durability as the Ascension. The fleet includes republics with different readiness levels.

**Salarians.** Their visible footprint is smaller and their tactical preparation is extensive. Sensor pickets, deception, counter-infiltration and interceptors earn their place. Use precision and timing rather than oversized decorative guns. Faster target acquisition does not create information that sensors have never collected.

**Geth.** Preserve actual geth hull geometry and lighting. Their advantage is persistent machine coordination, maintenance throughput and reliable execution. They do not hack a Reaper into surrender. Local autonomous operation survives disrupted links. Their energy and material budgets remain finite.

**Quarians.** Use established patched, modular hulls with recognisable long service histories. Early peace allows protection of civilian habitats and transfer of crew effort into repair, retrofit and naval operations. Fifty thousand Migrant Fleet hulls must never become fifty thousand first-rate battleships in the roster.

**Krogan formations.** The 2,400-hull Sol contribution is a coalition-assigned assault and escort command: purchased vessels, chartered auxiliaries, mixed crews and allied naval detachments. It is not a newly built indigenous krogan navy. Ground troops are their major strategic contribution; transport tonnage is separately accounted for.

**Batarians.** Their fleet survives because early warning prevents an opening decapitation. Use known batarian assets where available; otherwise label any new silhouette an AU production design. Evacuation, intelligence, patrol ships and reclaimed industrial capacity matter as much as heavy guns.

**Minor powers and Terminus allies.** Volus finance and logistics, elcor heavy transport, hanar and drell operations, rachni industrial work and Terminus escorts become specific contracts and units. The volus dreadnought Kwunu remains an identifiable ship. Do not invent hundreds of ancient rachni battleships emerging untouched from storage.

**Cerberus Black Fleet.** Charcoal hulls, restrained white panels and orange markings retain a human engineering lineage. The fleet has upgraded sensors, compartmentation, selected Thanix fits and specialist ammunition. It contains converted and purchased ships as well as purpose-built combatants. Orange is not a galaxy-wide energy shield colour and never replaces the readable silhouettes of allies.

## 4 Weapons and numerical model

### Damage units

The simulator uses **DKE**, a dreadnought kinetic equivalent: the calculated energy of the 20 kg, 4,025 km/s reference round, about 38.72 kt. DKE is an accounting unit. A barrier with 6 DKE capacity does not literally contain that amount of stored energy; it can be defeated by equivalent loading under this game model.

Keep three values separate:

1. Emitted or projectile energy, when a source or AU specification supplies it.
2. Coupling into the target after evasion, interception and barrier interaction.
3. Damage to particular systems and structure.

### Weapon catalogue

All ranges below are **SIM** firing envelopes, not canon maximum projectile travel distances. In vacuum, the practical limit is getting a useful firing solution. C05 describes a layered engagement rather than one fixed range for all ships.

| Weapon | Physical specification or status | Model cadence | Model useful envelope | Damage rule |
| --- | --- | --- | --- | --- |
| Standard DN spinal accelerator | CANON reference 20 kg at 4,025 km/s | 2 s CANON | 10,000–80,000 km SIM | 1 DKE kinetic packet |
| Heavy cruiser spinal | AU 8 kg at 2,500 km/s = 5.98 kt | 2.5 s | 3,000–35,000 km | About 0.154 DKE; kinetic |
| Patrol cruiser spinal | AU 5 kg at 2,000 km/s = 2.39 kt | 3 s | 1,000–25,000 km | About 0.0617 DKE; kinetic |
| Frigate accelerator | AU 1 kg at 1,200 km/s = 0.172 kt | 2 s | 100–8,000 km | About 0.00444 DKE; finishing and light targets |
| Thanix strike mount | Canon yield UNKNOWN | 5 s CANON | 100–20,000 km SIM | 0.35 DKE-equivalent SIM; 70% kinetic, 30% thermal |
| Heavy Thanix mount | AU scaling; no official yield | 5 s | 1,000–40,000 km | 1.0 DKE-equivalent SIM; same two channels |
| Disruptor torpedo | Canon effect; yield UNKNOWN | Magazine and rearm limited | Within 10 km for the baseline model | Projector/system damage; shot down by point defence |
| Javelin rack | Ship-mounted torpedo system, not the infantry rifle | Finite salvo | Close assault | Requires saturation and target solution |
| GARDIAN | Laser point defence; yield UNKNOWN | Heat-limited engagement budget | 10 km nominal SIM | Interception and thermal damage; not a long-range capital beam |
| Reaper capital main weapon | CANON 132–454 kt estimate | 6 s SIM, tune 3–12 s | 5,000–150,000 km SIM | Default packet 300 kt; 65% kinetic and 35% thermal SIM |
| Reaper destroyer main weapon | Canon yield UNKNOWN | 2 s SIM | 100–40,000 km SIM | 12 kt-equivalent packet SIM; prolonged fire kills cruisers |
| Oculus strike | Canon yield UNKNOWN | 1 s SIM | Close action | Anti-small-craft and subsystem attack |

Do not use broadside gun count as a multiplier on the spinal weapon's yield. A shorter weapon has a different projectile specification. Do not turn a Thanix's unknown velocity into an invented canonical megaton number.

### Project Titan and HADES

**Project Titan** is an AU heavy accelerator and ammunition programme, not a canonical superweapon. Retain the earlier working shot: 25 kg at 4,000 km/s. Its kinetic term is **47.8 kt**, about 1.23 DKE. An optional fictional 350 kt warhead is a separate payload; it does not make the shot an automatic 397.8 kt hull hit. Packaging and survivability are assumed future engineering, not established lore.

**HADES penetrator** is the specialist ammunition branch: a follow-on effect is possible only after a penetrating impact. An intercepted, deflected, prematurely detonated or non-penetrating round cannot receive the same internal-damage bonus. Keep a finite magazine. In the proposed model a penetrating hit can add up to 9.04 DKE-equivalent before coupling reductions.

**HADES protection** is a separate flagship configuration under the same project umbrella. It uses segmented conventional barrier banks, redundant power feeds and local armour. It is not magically scaled cyclonic technology. Label it AU wherever it appears.

Nuclear effects in space do not create an atmospheric blast sphere. Radiation, fragments, direct impact and the geometry of nearby ships determine damage. Farixen suspension is not a blanket suspension of the Citadel Conventions [C10].

## 5 Starting combat profiles

Everything in this table is **SIM**, including numerical values attached to canonical ship classes. These are starting calibration values, not measured durability or proof of balance. Main weapon energies above are the only values that should be presented as physical yields.

| Profile | Barrier DKE | Structure DKE | Barrier recovery DKE/s | Main weapon | Point-defence budget per s | Default operational readiness |
| --- | --- | --- | --- | --- | --- | --- |
| Standard dreadnought | 1.4 | 1.0 | 0.06 | DN spinal | 12 | 0.90 |
| Heavy cruiser | 0.65 | 0.55 | 0.035 | Heavy cruiser spinal | 10 | 0.90 |
| Patrol cruiser | 0.35 | 0.25 | 0.025 | Cruiser spinal | 6 | 0.88 |
| Frigate | 0.12 | 0.08 | 0.012 | Frigate spinal; selective Thanix retrofit | 4 | 0.86 |
| Corvette | 0.035 | 0.025 | 0.004 | Light accelerator | 1 | 0.78 |
| Carrier | 0.9 | 0.65 | 0.04 | Defensive weapons; strike groups | 16 | 0.88 |
| Armed conversion | 0.15 | 0.22 | 0.01 | Retrofit gun or torpedoes | 2 | 0.72 |
| Fixed heavy platform | 3.5 | 4.0 | 0.08 | Two DN-equivalent gun channels | 20 | 0.93 |
| Sovereign-class | 6.0 | 4.0 | 1.1 | Capital Reaper main weapon | 32 | 0.99 |
| Reaper destroyer | 0.22 | 0.16 | 0.018 | Destroyer main weapon | 3 | 0.99 |
| Reaper transport | 0.08 | 0.12 | 0.005 | No capital gun | 1 | 0.95 |
| Reaper processor | 0.18 | 0.4 | 0.008 | Defensive weapons only | 4 | 0.95 |

The point-defence budget is a weighted target-engagement allowance, not a count of lasers and not a guarantee of kills. Small missiles, torpedoes, fighters and agile drones consume different portions of it.

### Calibration rules

- Test the two-, three- and four-dreadnought cases against one isolated capital Reaper before adding return fire. With synchronised two-second volleys, full hits and the simplified recovery model, two cannot overwhelm the barrier, three impose growing load, and four destroy the reference target faster.
- Then enable Reaper return fire, manoeuvre, target selection and misses. Four attackers must not automatically survive. Real formations need reserves and overmatch.
- A cruiser must have a credible path to kill a destroyer at favourable range, and a credible chance of dying before it gets that chance.
- Remove hit-point regeneration from destroyed machinery. Emergency repairs can restore limited function; they do not regrow the ship.
- Loss of projectors, propulsion, sensors, magazines and command spaces creates different outcomes. A ship can be mission-killed without being vaporised.
- An orderly retreat preserves crews and hulls but can lose the strategic objective. Do not count it as a tactical victory by default.

### Faction modifiers

Apply modifiers to specific processes, not a universal faction damage bonus. Suggested starting values are SIM.

| Faction | Advantage | Cost or limitation |
| --- | --- | --- |
| Alliance | +10% reserve response speed after a clean command handover | Auxiliary formations have lower training and damage control |
| Turians | +10% salvo synchronisation quality | Slower reorganisation after heavy command losses |
| Asari | +10% precision on a maintained track | Small elite inventory and repair bottlenecks |
| Salarians | +15% track acquisition rate; +20% interception reach in specialist units | Fragile formations; specialised parts consumption |
| Geth | +15% local coordination; +15% repair throughput | Network fragmentation removes the coordination bonus, not individual agency |
| Quarians | +20% repair throughput in supplied yards | Retrofitted habitats remain unsuitable for line combat |
| Batarians | +10% local patrol coverage in familiar systems | Political integration and variable equipment standards |
| Krogan assault command | +20% contested boarding effectiveness | Naval crews and space transport still have to be provided |
| Cerberus | +15% first-contact firing solution quality in specialist cells | Limited magazines, scarce replacement components and small fleet size |
| Reapers | High local autonomy, long endurance and superior main-weapon reach | Finite hulls; exposure while committing to an objective |

## 6 Normandy Valkyrie

**AU LOCK:** a 2,000 m Normandy-lineage flagship. This is not the Normandy SR-2 enlarged by a texture edit.

**AU PROPOSAL core specification:**

- Classification: one-off heavy command dreadnought; counted inside the Alliance's 48 dreadnoughts.
- Length 2,000 m; rest mass 18 million t; working crew 3,200 plus mission personnel. Mass and complement are proposed values.
- Captain and senior watch officers operate the ship. Shepard commands its mission and assault element; Hackett remains the coalition's senior fleet commander.
- Nova Array: a long spinal accelerator firing a 25 kg projectile at 6,000 km/s. Calculated kinetic yield approximately 107.6 kt; model firing cycle 6 s. These are AU values.
- Three heavy Thanix channels, each with its own heat state. A full coordinated strike is impressive; it cannot be sustained forever.
- HADES segmented protection: 4 DKE barrier, 2.5 DKE structure, recovery 0.14 DKE/s SIM. Damage isolates sections and degrades output.
- EDI retains her established identity and responsibilities. Black Echo, if retained, is an additional AU tactical intelligence, not an unexplained replacement for EDI or an omnipotent ship-stealing programme.
- Limited heat-management and emission-control measures; no undetectable 2 km warship firing a spinal gun in open battle.
- No planetary landing. Ground insertion uses escorts and shuttles.

**Visual sheet:** the Normandy's forward-running shape, split machinery and blue engines interpreted at capital-ship scale; long reinforced spine; a bridge buried in the hull; modest Alliance/N7 identifiers; physically large heat infrastructure; restrained weapons apertures. It should look commissioned by people who built the Normandy, not imported from another franchise.

**How it earns the capital-Reaper kill shot:** escorts first degrade the target; Valkyrie coordinates a spinal impact with the three Thanix channels and follows through at a favourable angle. The audience sees one decisive strike, but the battle has supplied its conditions. It cannot casually erase an intact Reaper battle line.

### Legacy Nova option

Earlier Apex material used a near-light-speed, single-shot capital-killing Nova weapon. Preserve that as a separately labelled **AU HIGH POWER** module, disabled in the core preset. A 20 kg projectile at 0.1c contains approximately 2.16 Mt under ordinary relativistic arithmetic. Canon does not establish that a 2 km contemporary ship can launch it, power it, survive the recoil or repeat it at combat cadence.

If enabled, give it a 60 s model cycle, a severe heat cost, a finite ammunition supply and a visible charging commitment. It is one experimental system. The coalition must still be able to win when it is disabled.

## 7 Cerberus antihero redemption

The Illusive Man's change is strategic and practical. He remains proud, secretive and focused on humanity. He accepts that humanity's survival requires other civilisations to remain capable allies. Shepard forces that conclusion into operational commitments.

The published backstory places Harper's dangerous artefact contact long before Shepard's trilogy. A consistently unindoctrinated Apex therefore changes that earlier exposure, rather than asserting that a final speech cures him. Treat the exact degree of his canonical pre-ME3 indoctrination as interpretation; the safe AU rule is to remove the compromising exposure itself. The released comic *Mass Effect Evolution* is the primary continuity reference [G04].

### Evidence of the redemption

- Compromised research programmes close; intelligence is turned over before it can be traded for leverage.
- Miranda can refuse orders and keep her operational authority. This is a concrete change in how the organisation functions.
- EDI is treated as an allied person. Cerberus accepts that geth warships can protect human colonies.
- A Cerberus escort interposes itself between a Reaper and a damaged turian ship. The decision is tactical and costly; nobody pauses for applause.
- The Black Fleet provides its telemetry and ammunition standards to coalition liaisons. Its captain obeys a withdrawal order from an allied commander.
- The Illusive Man authorises expenditure on evacuation, repair and other species' formations when those allocations preserve the campaign.

**Money:** the canon organisation has lucrative fronts and wealthy backers, but its finances are not an infinite galactic war budget [C09]. Avoid inventing a universal credits-per-dreadnought conversion. Saving Lazarus expenditure can fund useful programmes; it cannot by itself pay for the entire fleet expansion.

The proposed 420-ship Black Fleet is a mobilised network with state procurement access, leased yards and coalition contracts. Twelve dreadnoughts do not all emerge from one secret station. Much of the purchasing and training predates its public appearance.

## 8 Sol coalition order of battle

**All numbers in this section are AU.** The faction totals retain the earlier chart; the internal class breakdown is a new proposal. Fighters, shuttles, embarked ground forces and support ships are not counted in these warship totals.

| Command | Dreadnoughts | Carriers | Heavy cruisers | Other cruisers | Frigates | Corvettes | Warships |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Systems Alliance | 48 | 144 | 240 | 1,360 | 7,008 | 4,000 | 12,800 |
| Turian Hierarchy | 120 | 80 | 280 | 920 | 4,000 | 1,800 | 7,200 |
| Asari commands | 60 | 40 | 120 | 680 | 2,600 | 1,400 | 4,900 |
| Salarian Union | 32 | 80 | 64 | 424 | 1,800 | 1,200 | 3,600 |
| Quarian and geth joint command | 48 | 96 | 110 | 546 | 2,000 | 1,000 | 3,800 |
| Krogan assault and escort command | 0 | 40 | 20 | 180 | 1,200 | 960 | 2,400 |
| Batarian survivor commands | 20 | 20 | 50 | 310 | 1,000 | 500 | 1,900 |
| Other coalition members | 7 | 20 | 30 | 243 | 600 | 500 | 1,400 |
| Cerberus Black Fleet | 12 | 12 | 26 | 70 | 200 | 100 | 420 |
| **Total** | **347** | **532** | **940** | **4,733** | **20,408** | **11,460** | **38,420** |

**Heavy combatants = 347 dreadnoughts + 940 heavy cruisers = 1,287.** This reconciles the earlier heavy-combatant number without calling every carrier a gunship. The 612 fixed anti-Reaper platforms are additional installations, not part of the 38,420 mobile hulls or 1,287 heavy mobile combatants.

The Alliance also has 492 frigates outside Sol and its 2,000 support vessels. Most non-human numbers here describe the Sol commitment, not a complete species-wide inventory. Do not report 38,420 as the total surviving navy of the entire galaxy.

### Embarked strike craft and support

Use 48 strike/interceptor craft per carrier as a deliberately conservative SIM loading: 532 carriers support a nominal 25,536 craft. Readiness, hangar damage, pilot availability, recovery capacity and ammunition reduce actual sortie strength. A carrier's craft are not additional full-sized warships.

The Alliance's 2,000 support hulls cover tankers, hospital ships, repair vessels, ammunition transports, tugs, couriers and evacuation ships across the campaign. The simulator must also allocate non-Alliance logistics rather than silently assuming these 2,000 supply every allied formation.

### Making the mobilisation plausible

This establishment is an aggressive Apex premise. The games do not provide industrial statistics that prove it achievable in three years. It requires earlier preparation, conversions, allied procurement and preservation of forces that canon loses. Report those dependencies rather than claiming the canon already contained a hidden 15,000-ship Alliance.

1. Before Eden Prime: standardised components, contingency contracts, reserve crews and incomplete hulls exist. This is a stated AU divergence.
2. 2183: Sovereign's attack produces hard evidence. Emergency legislation finances work already technically possible.
3. 2184: common weapon mounts and fire-control protocols reduce repeated design work. Shared yards build components for one another.
4. 2184–2185: crews train together; auxiliaries and damaged ships are refitted. Merchant conversions carry lower combat ratings.
5. 2185–2186: early peace preserves the geth and quarian fleets. Asari and salarian information sharing removes research delays.
6. The coalition protects the relay, fuel, repair and training network. Output declines if those sites fall.

For an initial readiness distribution, assign 25% of mobile hulls veteran status, 45% regular status and 30% reserve/conversion status. Use weights 1.0, 0.85 and 0.60 respectively. This is a SIM approximation; it does not reduce a hull's physical weapon yield, but affects hit probability, execution and recovery from damage.

## 9 Reaper order of battle and campaign accounting

The accepted working invasion inventory remains **53,000 vessels**. This is a selected AU force, not a number derived from the age of the Reapers.

| Type | Initial invasion | Alpha loss at 25% | After Alpha |
| --- | ---: | ---: | ---: |
| Capital Reapers | 2,000 | 500 | 1,500 |
| Destroyers | 40,000 | 10,000 | 30,000 |
| Transports | 8,000 | 2,000 | 6,000 |
| Processors | 3,000 | 750 | 2,250 |
| **Total** | **53,000** | **13,250** | **39,750** |

Harbinger is included in the capital count, not added as a 2,001st ship. His exact dimensions, yield and power multiplier are unknown. The model can give him 1.5 times standard capital barrier and structure as an explicit SIM boss parameter; this is not canon.

### Alpha ambush

The 25% loss is the project's inherited high-success assumption. Canon supports catastrophic relay destruction in Bahak, not a documented destruction of one quarter of the armada [G03]. To use this figure, the AU must actually put that force inside the lethal region.

The coherent setup is an evacuated system, a concealed demolition mechanism, early warning of the inbound concentration and timing that catches the committed echelon before it disperses. Do not depict the canonical fleet already emerging from the Alpha Relay when its original purpose was to reach and exploit that relay.

The uncertainty is real: Reaper scouts can detect the preparations, the force can arrive in separated echelons, and the detonation can be too early or too late. Expose Alpha losses as a slider, with 0%, 10% and 25% presets. Do not grant 25% casualties and a separate duplicate delay bonus without accounting for why both occur.

### Proposed state at the start of the Sol battle

This table introduces a regional commitment rather than teleporting the entire surviving Reaper force to Earth.

| Type | Destroyed after Alpha but before Sol | Committed to Sol | Active elsewhere | Check against post-Alpha inventory |
| --- | ---: | ---: | ---: | ---: |
| Capitals | 420 | 480 | 600 | 1,500 |
| Destroyers | 8,500 | 12,000 | 9,500 | 30,000 |
| Transports | 500 | 1,800 | 3,700 | 6,000 |
| Processors | 200 | 750 | 1,300 | 2,250 |
| **Total** | **9,620** | **15,030** | **15,100** | **39,750** |

Sol therefore faces **12,480 Reaper combat vessels** plus 2,550 occupation/processing vessels. The coalition's larger hull count does not make it stronger in every local engagement. Light auxiliaries are not equivalent to destroyers, and Reaper capitals can destroy heavy ships very quickly.

Those 9,620 regional losses must be earned by earlier battles. A scenario starting before those battles must simulate them instead of removing the units for free. A Sol-only scenario may load the table as an explicit campaign-state assumption.

### What defeats the Reapers

- Deny their opening political and military decapitation. Keep the Citadel and the main fleets functioning.
- Preserve shipyards and trained crews instead of losing them while debating the threat.
- Fight at prepared objectives with fixed guns and established ranges. Reapers can bypass a position, but doing so concedes something they need to destroy or capture.
- Concentrate fire on selected capitals while screens occupy the destroyers. Do not spread every gun across every enemy.
- Shift targets as soon as a kill or mission kill is confirmed. Avoid firing another full salvo into a corpse.
- Withdraw damaged heavy ships behind fresh screens and repair them. Replace losses from reserves rather than requiring every initial ship to survive.
- Hunt exposed transports when it disrupts occupation, but do not pretend it deprives capital Reapers of conventional fuel.
- Force them to protect harvest infrastructure, split forces and commit to defended objectives. Their superior endurance remains dangerous.
- Keep pursuing. Losing Harbinger does not switch off independent Reapers.

The result can be a broken invasion, then a pursuit campaign. Breaking the siege of Earth within days and liberating its major occupied regions within weeks does not imply that every Reaper in the galaxy died in one afternoon.

### Why Javik recognises a different outcome

Javik's account of the Prothean empire is a warning against making every allied force depend on one political centre and one inherited doctrine [G05]. Apex coordination therefore preserves separate commanders, repair systems and tactical traditions while giving them compatible targeting and shared objectives.

The crucial break is operational. The Reapers encounter surviving institutions, encounter a local defeat they cannot cheaply reverse, and must choose between protecting their invasion structure and continuing the harvest. Their losses are not instantly replaceable. Their usual sequence of decapitation, isolation and defeat in detail has stopped working.

For the montage, an original Javik line can express this without a lecture: **“We made an empire. You made allies.”** It is AU dialogue, not a game quotation. Avoid claiming documentary knowledge of every previous cycle's military history.

## 10 Black Fleet drive sacrifices

This is an **AU PROPOSAL**, not a canonical FTL exploit. Its visual effect may resemble the clean suddenness of a high-speed collision, but its engineering must remain explicitly experimental.

### Preferred version

A crippled Cerberus heavy ship retains propulsion and enough control to commit to a terminal attack. Evacuated sections, failing power feeds and an unsafe mass-field transition make the attempt possible only under exceptional conditions. The captain chooses a collision corridor already cleared of friendly ships. The ship hits one Reaper or one tightly aligned group; other enemies manoeuvre or return fire.

Bypass the final damping/interlock systems in the fictional drive, not a vaguely named invulnerability switch. Keep the exact mechanism speculative. There is no reliable canon formula converting an FTL transit into delivered collision energy.

### Energy bookkeeping

For an ordinary sublight object, relativistic kinetic energy is:

`E = (gamma - 1) * m * c^2`, where `gamma = 1 / sqrt(1 - v^2/c^2)`.

One million tonnes is one billion kilograms. At 0.01c it has about **1.07 teratonnes TNT equivalent** in ordinary kinetic energy; at 0.1c, about **108 teratonnes**. These are arithmetic examples, not proof that a Mass Effect ship delivers those energies. Effective mass, field collapse, radiation, collision geometry and coupling remain unresolved.

If only 0.1% of the first example couples into a target, deposited energy is about **1.07 gigatonnes**. For the second, a 1% coupling would be about **1.08 teratonnes**. The coupling fractions are invented assumptions. They must never be reported as canonical drive performance.

### Simulator limits

- Off in the canon preset; available in Apex as a rare specialist event.
- At most three attempted heavy-ship drive attacks in the proposed Sol scenario.
- A 20–60 s commitment window exposes the attacker to interruption and evasion. Default 40 s.
- Eligibility requires a functioning propulsion path, adequate alignment, a cleared friendly corridor and an explicit terminal decision.
- Default completion probability before tactical interception: 0.25. This is SIM, not a historical success rate.
- A successful attack can destroy the intended capital; collateral kills require actual geometry. Never apply a gigaton label as a map-wide damage radius.
- A teraton-tier event belongs far from Earth, civilian habitats and friendly formations. The shot must show that location.
- A destroyed friendly ship, lost specialists and consumed propulsion hardware remain campaign losses.

A useful cinematic result is one spectacular confirmed capital kill, one interrupted attempt and one attack that damages a second capital while destroying its own ship. Treat this as a storyboard proposal, not the predetermined outcome of every simulation.

## 11 Simulator process

### Required state

Each unit or formation needs identity, faction, hull profile, position, velocity, orientation, effective-mass state, active tracks, weapons and ammunition, heat, barrier projectors, damaged systems, crew readiness, command links and retreat conditions.

Track magazines, repair capacity, fuel/propellant, core discharge opportunities, trained crews and transit access at campaign level. Reapers have a different logistical dependency model; do not give them organic tanker requirements just to make them beatable.

### Resolution order

1. Update observations with light delay, uncertainty and surviving communications.
2. Issue formation orders; allow local commanders to execute standing orders during link loss.
3. Move and orient ships. A spinal weapon cannot ignore its firing arc.
4. Test tracks, range, ammunition, heat and unobstructed lines before firing.
5. Advance projectiles by time of flight; resolve interceptions and manoeuvres.
6. Apply kinetic and thermal components, barrier loading and subsystem penetration.
7. Resolve failures, damage control, crew casualties and command transfers.
8. Assess withdrawal, reserve commitment, capture of objectives and campaign losses.

For a kinetic packet, a simple starting approximation is:

`barrier_load = kinetic_DKE * barrier_interaction_fraction`

`structure_damage = kinetic_spillthrough + thermal_DKE * thermal_coupling + internal_effects`

`barrier = min(capacity, surviving_barrier + recovery * dt)`

The interaction and coupling fractions are weapon/target model parameters. A thermal component is not automatically full internal damage: armour still matters. Recharge must stop or degrade when the appropriate machinery is destroyed.

Use analytic interception/closest-approach tests or adaptive substeps. A fixed one-second positional step can let fast projectiles pass through a target without registering a hit.

### Range and travel time

A 4,025 km/s round takes about 12.42 s to cross 50,000 km, before allowing for motion. Light takes about 0.167 s over the same distance. This is why target prediction and uncertain acceleration matter even in a technologically advanced fleet.

Do not render a spinal shot as a slow glowing ball if the camera is meant to show realistic travel at a short cinematic distance. An instantaneous-looking streak can be the compressed presentation of a simulated time of flight.

### Efficient large-fleet simulation

Run detailed physics around the visible or strategically decisive engagements. Resolve distant flotillas statistically using the same weapon and readiness parameters. Aggregate fighters into flights, but retain sortie inventories and attrition. Never run tens of thousands of fully connected AI-to-AI targeting comparisons every rendered frame.

Store event logs: shooter, target, firing solution, range, hit/interception result, barrier load, system damage and the cause of destruction. These logs produce credible captions and let you identify a broken balance rule.

### Presets

| Preset | Canon machinery | Inventories | Special systems | Outcome |
| --- | --- | --- | --- | --- |
| Canon ME3 reference | Canon descriptions with labelled SIM gaps | Known figures retained; unknown totals remain user-set | No Apex inventions | Not preselected |
| Apex core | Same machinery; faster adoption and expanded industry | Locked Alliance and Reaper settings plus proposed coalition roster | Titan/HADES limited; balanced Valkyrie; rare drive attacks optional | Not preselected |
| Apex legacy high power | Explicit additional AU capability | Same inventory by default | Near-c Nova and upper-tier drive attacks | Easier by design; separately labelled |
| Sensitivity run | Same as selected preset | Vary Alpha losses, readiness and Sol commitment | Independently toggle each capability | Measures dependence on assumptions |

Do not mix Cerberus Ascendant into Prime/Apex. That is a different preset with different Shepard and Reaper-control assumptions.

### Victory and defeat

**Sol operational victory:** Earth is no longer subject to organised orbital harvest; the relay approach and critical logistics remain usable; surviving coalition strength can prevent immediate Reaper re-entry.

**Strategic victory:** remaining Reaper combat forces are destroyed, captured only as inert wreckage, or isolated with a credible enforceable containment plan. A retreating live Reaper is unfinished work.

**Defeat:** capital and crew losses break the coalition's ability to defend production and civilian populations, even if it destroys many Reapers before doing so.

Use casualty and timing bands as story targets, not outputs: 15–35% coalition mobile hull losses in a hard-fought Sol victory; 1–3 days to break orbital control; weeks for major Earth liberation; additional months of pursuit. These bands have not been derived from a completed campaign run.

### Meaningful validation

Verify arithmetic and schema; then calibrate isolated weapons, range, shields and target selection. After that, run campaign ensembles with fixed seeds. Report distributions and failure causes, not a fabricated percentage chance of victory.

The delivered package checks inventories, accounting, energy arithmetic and the isolated shield benchmark. It does not claim a balanced fleet battle, industrial feasibility proof or a Monte Carlo victory forecast.

## 12 Continuity pitfalls

| Pitfall | Coherent replacement |
| --- | --- |
| Saren lives, but Sovereign still dies from Saren's death feedback | A prepared Citadel defence destroys Sovereign while it is committed inside a defended structure. The old explosion shot can be reused with changed causality. |
| Javik in 2183 knows every future operation | He supplies historical patterns, language and scepticism; modern intelligence still has to locate targets. |
| Shepard survives, but SR-1 is shown destroyed exactly as in canon | Interception, escorts and early warning change the Collector attack; retain SR-1 as a serving or preserved ship. |
| Trillions appear because Cerberus has billions | Coalition governments, credit, procurement and yards pay for mobilisation. Cerberus finances specific high-value gaps. |
| Genophage cure instantly supplies a new adult army | Existing krogan adults mobilise; births matter to the future. |
| Reaper wreckage is treated as safe salvage | Use remote, compartmented research and accept residual risk. |
| The Alpha explosion kills every Reaper anywhere | Its victims have to be inside the affected region. |
| Geth upload a victory virus into the Reapers | Geth improve coalition execution and logistics; Reaper autonomy remains dangerous. |
| Harbinger dies and the entire armada powers down | Other Reapers continue fighting, repositioning or retreating. |
| Every ship from every species arrives through one relay in seconds | Show echelons, prior deployments and editing across time. |
| Every capital is shown within a few kilometres of Earth | Mix distant engagements with recognisable orbit inserts; reserve close formations for specific tactical moments. |

## 13 Source register

The released games are the primary fictional authority. Codex mirrors reproduce that primary material but are not official EA engineering specifications. Wiki synthesis, forum arithmetic and fan ship charts are not promoted into canon. Several mirrors were searchable but blocked direct retrieval; use the named in-game entries to settle an edition-specific discrepancy.

| ID | Primary material and accessible reference | What it supports |
| --- | --- | --- |
| C01 | ME1–ME3 codex, Ships and Vehicles. [Accessible transcription](https://masseffect.fandom.com/wiki/Codex/Ships_and_Vehicles) | Dreadnought gun, Thanix history, Normandy upgrades and propulsion constraints |
| C02 | ME3 codex, The Reapers, especially Reaper Variants, Reaper Capabilities and Reaper Vulnerabilities. [Transcription](https://masseffect.fandom.com/wiki/Codex/The_Reapers) | Variant sizes, main-gun estimates, concentration-of-fire benchmark, transit and vulnerabilities |
| C03 | ME1 codex, Starships Dreadnought. [Legacy transcription](https://www.gamebanshee.com/cgi-bin/search/banshee_search.pl?_cgifunction=search&_layout=masseffect_codex_page&masseffect_codex.entry=%22starships%3A+dreadnought%22) | 2183 inventories and the legacy numerical discrepancy |
| C04 | ME1 codex, Treaty of Farixen. [Transcription](https://www.gamebanshee.com/cgi-bin/search/banshee_search.pl?_cgifunction=search&_layout=masseffect_codex_page&masseffect_codex.entry=%22treaty+of+farixen%22) | Treaty ratio, not an automatic wartime suspension |
| C05 | ME1 codex, Space Combat General Tactics. [Transcription](https://www.gamebanshee.com/cgi-bin/search/banshee_search.pl?_cgifunction=search&_layout=masseffect_codex_page&masseffect_codex.entry=space+combat%3A+general+tactics) | Engagement layers, manoeuvre and useful firing ranges |
| C06 | ME1 codex, Quarians and Quarians Migrant Fleet. [Transcription](https://masseffect.fandom.com/wiki/Codex/Aliens%3A_Non-Council_Races) | Civilian nature and approximate size of the flotilla |
| C07 | ME1–ME3 codex, Kinetic Barriers. [Transcription](https://masseffect.fandom.com/wiki/Codex/Weapons%2C_Armor_and_Equipment) | Protection mechanism and thermal/radiation limitations |
| C08 | ME1–ME3 codex, Communications and QEC. [Transcription](https://masseffect.fandom.com/wiki/Codex/Technology) | Buoy networks, local lag and paired QEC links; fictional setting physics |
| C09 | ME2–ME3 codex, Cerberus and The Illusive Man. [Transcription](https://masseffect.fandom.com/wiki/Codex/Organizations) | Corporate network, secrecy and canonical ideological baseline |
| C10 | ME1 codex, Citadel Conventions. [Transcription](https://masseffect.fandom.com/wiki/Codex/Citadel_and_Galactic_Government) | Environmental-destruction restrictions; distinct from Farixen |
| C11 | ME3 war asset, Volus Dreadnought Kwunu. [Transcription](https://masseffect.fandom.com/wiki/War_Assets/Alien) | The named ship and its Thanix armament; asset points are not ship statistics |
| G01 | Mass Effect, released game: Eden Prime, Virmire, Ilos and the Citadel finale | Scene causality and Sovereign's canonical defeat |
| G02 | Mass Effect 2, released game: opening, EDI conversations, Reaper IFF and suicide mission | Lazarus loss of time, Cerberus context and dangerous wreck research |
| G03 | Mass Effect 2 Arrival, released DLC | Bahak, the Alpha Relay and the original civilian catastrophe |
| G04 | Mass Effect Evolution, released Dark Horse comic | Harper's pre-trilogy artefact contact; Apex must change that history |
| G05 | Mass Effect 3, released game and From Ashes | Javik, Tuchanka, Rannoch, the final fleet battle and the canonical ending choices |

The earlier Apex Battle of Sol image is a continuity reference only. Its generated text and arithmetic are not external lore evidence. The corrected accounting in this edition takes precedence for the accompanying dataset.
