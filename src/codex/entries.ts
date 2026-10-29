import type { RuleSet } from '@/timelines/rules';

/**
 * Codex content. Each entry separates established canon from simulation
 * estimates, and may add timeline-specific text that only appears when the
 * selected rule set changes the subject.
 */
export interface CodexEntry {
  id: string;
  category: 'Factions' | 'Ships' | 'Weapons' | 'Technology' | 'Locations' | 'Reaper War' | 'Doctrine' | 'Simulation';
  title: string;
  canon: string[];
  estimate?: string[];
  /** Keyed by rule set id; shown only when that timeline is active. */
  au?: Record<string, string[]>;
  /** Shown for any AU where predicate(rules) is true. */
  auDynamic?: (rules: RuleSet) => string[] | undefined;
}

export const CODEX: CodexEntry[] = [
  // --------------------------------------------------------------- Factions
  {
    id: 'alliance',
    category: 'Factions',
    title: 'Systems Alliance',
    canon: [
      'The Systems Alliance is humanity’s representative body in Citadel space, founded after the discovery of the Charon relay in 2149 and tempered by the First Contact War with the turians in 2157.',
      'The Alliance Navy is organised into numbered fleets. Humanity is the only Council race to field carriers, a doctrine other species consider wasteful of dreadnought-grade tonnage.',
      'Under the Treaty of Farixen the Alliance may build dreadnoughts at a 1:3 ratio against the Turian Hierarchy’s 1:5 primacy.',
    ],
    estimate: ['The simulator fields Alliance fleets of 4–8 dreadnoughts, 1–2 carriers and dozens of cruisers and frigates per engagement: compressed stand-ins for the much larger canon forces at Earth.'],
    au: {
      humanity_ascendant: ['In this timeline the Alliance discovered element zero a century early and fields a navy more than twice canon size with heavier mass accelerators.'],
      prime_apex: ['Prime/Apex: the Alliance of this timeline fields hyper-mass accelerators and HADES rounds. The Homeworld Defence Rule means Sol can be held without allied rescue.'],
    },
  },
  {
    id: 'reapers',
    category: 'Factions',
    title: 'Reapers',
    canon: [
      'The Reapers are a race of synthetic-organic starships that harvest advanced civilisations every fifty thousand years, using the mass relay network to control galactic development.',
      'Sovereign-class capital ships are roughly two kilometres long; destroyers around 160 metres. Both exceed any organic warship in barrier strength, armour and firepower.',
      'Reaper indoctrination subverts organic minds through prolonged exposure. Harbinger, the first Reaper, directs the harvest.',
    ],
    estimate: ['Reaper doctrine in the simulation: never withdraw, kill the most dangerous threats first, advance relentlessly. Their confidence derives from previous cycles; the Reaper Intelligence panel shows how that assessment changes when the data does.'],
    au: {
      cerberus_ascendant: ['Cerberus Ascendant: the Catalyst is destroyed and the Illusive Man alone controls the Reaper fleet. Harbinger remains independent and is hunted by the controlled Reapers.'],
      prime_apex: ['Prime/Apex: with the reaper command network vulnerable, each capital ship loss degrades the coordination of the rest for a time.'],
    },
  },
  {
    id: 'cerberus',
    category: 'Factions',
    title: 'Cerberus',
    canon: [
      'Cerberus is a human-supremacist paramilitary organisation led by the Illusive Man. In 2186 it fights the Alliance and the Council while pursuing control of Reaper technology.',
      'Its ships use a black, white and orange identification scheme. By the end of the war the Illusive Man is indoctrinated.',
    ],
    estimate: ['Simulation Cerberus hulls (fighter, frigate, cruiser) are original designs with better electronics than Alliance equivalents. The Black Fleet dreadnought is AU-only and does not exist in the trilogy. The Cerberus Intervention scenario is hostile under canon and cooperative under timelines where the Illusive Man is not indoctrinated.'],
    au: {
      cerberus_reformed: ['Cerberus Reformed: the Illusive Man is never indoctrinated and Cerberus cooperates with the Alliance against the Reapers while remaining pro-human and pragmatic.'],
      cerberus_ascendant: ['Cerberus Ascendant: with Shepard dead and the Collector Base preserved, Cerberus develops the control solution and takes the Reaper fleet.'],
      prime_apex: ['Prime/Apex: the optional Cerberus Black Fleet cooperates with Shepard and the Alliance. Cerberus remains recognisably Cerberus.'],
    },
  },
  {
    id: 'turian',
    category: 'Factions',
    title: 'Turian Hierarchy',
    canon: ['The Hierarchy maintains the largest fleet in Citadel space and is permitted the most dreadnoughts under the Treaty of Farixen. Palaven and its moon Menae are under heavy Reaper assault in 2186.'],
    estimate: ['Simulation doctrine: tight formations, aggressive closure, strong dreadnought line, withdrawal only below 12 % hull. Hierarchy hulls are original designs: tall angular bodies, split pincer bows, large dorsal fins, cyan lights.'],
    au: { prime_apex: ['Prime/Apex Homeworld Defence Rule: the Hierarchy can hold Palaven unaided, with hyper-mass accelerators on its dreadnoughts.'] },
  },
  {
    id: 'asari',
    category: 'Factions',
    title: 'Asari Republics',
    canon: ['The oldest Council race, with the most advanced warships in Citadel space but few dreadnoughts. Thessia is attacked in force in 2186 and falls; the Republics had concealed a Prothean beacon.'],
    estimate: ['Simulation doctrine: engage at range, protect the few capital ships, withdraw damaged hulls early. Asari hulls are original smooth lathe-turned designs with sweeping fins and violet lighting; barriers run well above Alliance values, plating below.'],
  },
  {
    id: 'salarian',
    category: 'Factions',
    title: 'Salarian Union',
    canon: [
      'The Salarian Union favours intelligence, pre-emption and technology over mass. Its Special Tasks Group runs covert operations across Council space; its navy is fast and sensor-heavy, with few dreadnoughts under the Treaty of Farixen.',
      'In 2186 the Dalatrass offers the Salarian First Fleet to the war effort only if Shepard sabotages the genophage cure. Sur’Kesh itself is not shown under heavy assault during the game.',
    ],
    estimate: [
      'Simulation doctrine: engage at range on sensor data, prioritise the most dangerous target, finish wounded ships, withdraw early (40 % threshold). Hulls are original: slender amphibian bodies with a bow sensor head, drive pods on swept booms and pale green lights. Union hulls trade plating for sensors, electronic warfare and accuracy; STG frigates have the lowest signature of any organic warship in the catalogue.',
      'The Defence of Sur’Kesh scenario is a simulation estimate of a raid, not a canon event. The genophage world state decides whether the First Fleet joins the campaign and the Final Battle of Earth.',
    ],
    au: { prime_apex: ['Prime/Apex: Union fleets receive the same hyper-mass accelerator and barrier improvements as the other Council navies.'] },
  },
  {
    id: 'geth',
    category: 'Factions',
    title: 'Geth',
    canon: ['Synthetic intelligences created by the quarians, exiled beyond the Perseus Veil. In 2186 the Reapers upgrade the geth with their code; depending on Shepard’s choices the geth are freed, destroyed, or make peace with the quarians.'],
    estimate: ['Simulation doctrine: 0.6-second decision cycles, near-perfect fire distribution, no withdrawal. The Rannoch scenario applies a +40 % barrier / +20 % accuracy upgrade when the Reaper code is active. Hulls are original: segmented white-grey bodies with a hooded forward optic.'],
  },
  {
    id: 'quarian',
    category: 'Factions',
    title: 'Quarian Migrant Fleet',
    canon: ['Fifty thousand ships carrying the quarian people since their exile. The Heavy Fleet, Patrol Fleet and Civilian Fleet protect three liveships whose loss would mean famine. In 2186 the Admiralty Board attacks the geth to retake Rannoch.'],
    estimate: ['Simulation doctrine: protect capital ships above everything (liveships are modelled as unarmed carrier-role hulls), withdraw damaged ships early. Hulls are original: converted bulk hulls with bolted-on modules and amber lights.'],
  },
  {
    id: 'battle_citadel_2183',
    category: 'Reaper War',
    title: 'Battle of the Citadel (2183)',
    canon: ['Sovereign and a geth fleet attack the Citadel while Saren seizes the Tower. The Citadel fleet and the Destiny Ascension are overwhelmed until the Alliance Fifth Fleet arrives; Shepard decides whether the Alliance saves the Ascension or concentrates on Sovereign. Sovereign’s barriers fail when Saren dies and the fleet destroys it.'],
    estimate: ['The scenario gives the fleets the task of overwhelming Sovereign conventionally; the Citadel is drawn with its canon Presidium ring diameter (7.2 km) and ward length (~44 km) at compressed scale.'],
  },
  {
    id: 'ship_destiny_ascension',
    category: 'Ships',
    title: 'Destiny Ascension',
    canon: ['Flagship of the Citadel fleet and the largest warship in Citadel space. Whether it survived Sovereign’s attack in 2183 is a player-dependent outcome. In ME1 its main gun is described as having more firepower than the entire Alliance fleet.'],
    estimate: ['The firepower line is treated as hyperbole: the simulation gives the main gun roughly 2.6× a dreadnought round. Hull 20,000 / barriers 14,000 / armour 200. The Fall of Thessia scenario lets you choose whether it is present.'],
  },
  {
    id: 'ship_turian_dreadnought',
    category: 'Ships',
    title: 'Hierarchy dreadnought',
    canon: ['Turian dreadnoughts are the most numerous capital ships in Citadel space.'],
    estimate: ['Simulation hull 9,500 / armour 150 / barriers 5,000 with a slightly heavier spinal gun than the Alliance Kilimanjaro-class, reflecting turian gunnery discipline. Original hull design.'],
  },
  // ------------------------------------------------------------------ Ships
  {
    id: 'ship_dreadnought',
    category: 'Ships',
    title: 'Alliance dreadnought',
    canon: [
      'A dreadnought is built around a spinal mass accelerator the length of the ship. The Everest-class gun is 800 metres long and fires a 20-kilogram slug at 4,025 km/s every two seconds — roughly 38 kilotons of TNT per round.',
      'Kilimanjaro-class dreadnoughts such as SSV Kilimanjaro and SSV Orizaba serve in the Reaper War.',
    ],
    estimate: ['Simulation hull 9,000 / armour 130 / barriers 5,200. One slug destroys a frigate outright. A Reaper capital ship beam guts a dreadnought in roughly two bursts.'],
    au: { prime_apex: ['Prime/Apex: dreadnought spinal guns are replaced by hyper-mass accelerators firing HADES rounds at ~3× canon yield with armour-defeating penetrators (AU weapon).'] },
  },
  {
    id: 'ship_reaper_capital',
    category: 'Ships',
    title: 'Sovereign-class Reaper capital ship',
    canon: [
      'Roughly two kilometres long, with a cuttlefish-like silhouette: a ridged central body and swept arms around a forward weapon aperture.',
      'Its magnetohydrodynamic main weapon yields 132–454 kilotons per shot and can destroy a dreadnought. Sovereign’s barriers withstood the combined Citadel fleet until Saren’s death dropped them.',
    ],
    estimate: ['Simulation hull 32,000 / armour 320 / barriers 42,000. In canon rules a full dreadnought group needs sustained concentrated fire to kill one capital ship, taking severe losses while doing so.'],
    au: { prime_apex: ['Prime/Apex: vulnerable to advanced hyper-mass accelerator strikes; HADES rounds bypass half of its armour and pierce barriers more efficiently. It remains the most dangerous unit on the field.'] },
  },
  {
    id: 'ship_reaper_destroyer',
    category: 'Ships',
    title: 'Reaper destroyer',
    canon: ['A 160-metre Reaper used for planetary assault and close support. Its beam cuts through frigates and cruisers; on Rannoch the Migrant Fleet needed a targeting laser and an orbital bombardment to kill one.'],
    estimate: ['Simulation hull 3,200 / armour 160 / barriers 6,500. Prioritising destroyers is the most reliable way for a canon Alliance fleet to score kills.'],
  },
  {
    id: 'ship_normandy',
    category: 'Ships',
    title: 'Normandy SR-2',
    canon: ['Cerberus-built successor to the SR-1, later retaken by the Alliance. Carries the Thanix cannon and an IES stealth system; crewed by Shepard’s team in 2186.'],
    estimate: ['Its Thanix cannon gives it cruiser-grade firepower; in the simulation its stealth is modelled as a high ECM rating that makes it hard to target.'],
  },
  {
    id: 'ship_carrier',
    category: 'Ships',
    title: 'Alliance carrier',
    canon: ['Humans are the only Council race that build carriers. They launch fighter squadrons whose disruptor torpedoes bypass kinetic barriers, forcing every fleet to carry GARDIAN defences.'],
    estimate: ['Simulation carriers hold 24 F-61 Trident fighters and hang back behind the line. Fighters are rendered at twice their true size so they remain visible next to two-kilometre Reapers.'],
  },
  // ---------------------------------------------------------------- Weapons
  {
    id: 'mass_accelerator',
    category: 'Weapons',
    title: 'Mass accelerators',
    canon: [
      'Mass accelerators use mass effect fields to reduce a projectile’s mass and electromagnetically launch it at enormous velocity. Larger ships mount proportionally larger spinal guns; damage scales with length.',
      'Rounds generate heat, and heat management limits sustained fire.',
    ],
    estimate: ['Battlespace is compressed: rounds travel at 22–48 km/s over ranges of 24–48 km so the engagement is watchable. Kinetic barriers absorb slugs fully until exhausted.'],
  },
  {
    id: 'thanix',
    category: 'Weapons',
    title: 'Thanix cannon',
    canon: ['Reverse-engineered by the turians from Sovereign’s wreckage: a stream of molten iron-uranium-tungsten alloy suspended in a mass effect field and accelerated to a fraction of light speed. It gives frigates cruiser-grade punch.'],
    estimate: ['Modelled as a 1.6-second stream; kinetic barriers absorb only ~45% of it.'],
    auDynamic: (r) => (r.special.thanixAvailability === 'fleetwide' ? ['This timeline fits Thanix cannons fleet-wide: cruisers replace their spinal guns with heavier Thanix mounts.'] : r.special.thanixAvailability === 'none' ? ['This timeline removes Thanix technology; Thanix-armed hulls fall back to conventional accelerators.'] : undefined),
  },
  {
    id: 'gardian',
    category: 'Weapons',
    title: 'GARDIAN point defence',
    canon: ['General ARea Defensive Integration Anti-spacecraft Network: infrared lasers that burn down fighters and missiles. Kinetic barriers do not stop lasers; heat build-up limits engagement time.'],
    estimate: ['Simulation GARDIAN prioritises missiles heading for the fleet, then fighters, and will scorch nearby hulls when nothing else is in range.'],
  },
  {
    id: 'reaper_weapon',
    category: 'Weapons',
    title: 'Reaper magnetohydrodynamic weapon',
    canon: ['The Reaper primary weapon fires a stream of molten metal at a fraction of light speed. Capital ship yields are 132–454 kilotons; the beam carves through conventional barriers and hull alike.'],
    estimate: ['Modelled as a 2.4–2.8 second burst: ~1,900 damage per second for capital ships, ~520 for destroyers. Barriers absorb about 40%.'],
  },
  {
    id: 'torpedo',
    category: 'Weapons',
    title: 'Disruptor torpedoes',
    canon: ['Fired at relatively slow velocity to pass through kinetic barriers, the warhead generates random mass effect fields that shear the target apart. The mainstay of fighter attacks on capital ships.'],
    estimate: ['Barriers absorb ~25% of a warhead. Torpedoes can be intercepted by GARDIAN fire before impact.'],
  },
  {
    id: 'hades',
    category: 'Weapons',
    title: 'HADES rounds and hyper-mass accelerators (AU)',
    canon: ['These weapons do not exist in the Mass Effect trilogy.'],
    au: { prime_apex: ['Prime/Apex AU weapons: HADES rounds are dense kinetic penetrators carrying a nuclear warhead fused to detonate after penetration, fired from advanced spinal accelerators at roughly three times canon slug energy. The penetrator bypasses half of a target’s armour and pierces barriers more efficiently; the warhead burns inside the hull. They are what make Reaper capital ships killable in this timeline.'] },
  },
  // ------------------------------------------------------------- Technology
  {
    id: 'kinetic_barriers',
    category: 'Technology',
    title: 'Kinetic barriers',
    canon: ['Kinetic barriers repel objects moving above a velocity threshold. They stop high-velocity slugs and shrapnel but not slow-moving objects, and not directed energy such as lasers.'],
    estimate: ['Per damage type the simulator absorbs: slugs 100%, disruptor warheads 25%, Thanix stream 45%, Reaper beam 40%, lasers 0%. Barriers regenerate three seconds after the last hit.'],
  },
  {
    id: 'eezo',
    category: 'Technology',
    title: 'Element zero and mass effect fields',
    canon: ['Element zero, when subjected to electric current, raises or lowers the mass of surrounding space-time. This underpins FTL travel, kinetic barriers, mass accelerators and biotics.'],
  },
  {
    id: 'indoctrination',
    category: 'Technology',
    title: 'Reaper indoctrination',
    canon: ['Prolonged exposure to a Reaper or Reaper artefact subverts organic minds, producing willing servants who believe they act freely. The Illusive Man is indoctrinated by 2186.'],
    estimate: ['At fleet scale the simulator models indoctrination pressure as a small crew-effectiveness penalty; some timelines disable it entirely.'],
  },
  // -------------------------------------------------------------- Locations
  {
    id: 'earth',
    category: 'Locations',
    title: 'Earth and the Sol system',
    canon: ['Humanity’s homeworld. The Reapers arrive through the Charon relay in 2186, destroy Arcturus Station and the Alliance Parliament, and invade Earth while the fleets fall back.'],
    estimate: ['Earth is drawn at compressed scale so a low-orbit battle can frame both planet and fleets. The battle itself is a stand-in for engagements that in canon involved far larger forces.'],
  },
  {
    id: 'citadel',
    category: 'Locations',
    title: 'The Citadel',
    canon: ['Seat of the Council and, unknown to its inhabitants, the Catalyst and the master relay of the harvest. Sovereign attacked it in 2183; the Reapers move it to Earth orbit at the end of the war.'],
  },
  {
    id: 'palaven',
    category: 'Locations',
    title: 'Palaven and Menae',
    canon: ['The turian homeworld is under full Reaper assault in 2186; the Hierarchy fights from the moon Menae while its fleets bleed in orbit.'],
    au: { prime_apex: ['Prime/Apex Homeworld Defence Rule: the Hierarchy can hold Palaven unaided.'] },
  },
  // ------------------------------------------------------------- Reaper War
  {
    id: 'timeline_2186',
    category: 'Reaper War',
    title: 'Reaper War timeline (canon)',
    canon: [
      '2183 — Sovereign attacks the Citadel and is destroyed.',
      '2185 — The Collectors are stopped at the galactic core; the Reapers begin their approach.',
      '2186 — The Reapers enter the Milky Way via Batarian space, then Earth. Palaven, Thessia and other homeworlds fall under assault. The Crucible is built from Prothean plans; the war ends at Earth.',
    ],
    estimate: ['Player-dependent outcomes (genophage cure, geth–quarian peace, Rachni, Council composition) are selected per scenario and never presented as fixed canon.'],
  },
  {
    id: 'crucible',
    category: 'Reaper War',
    title: 'The Crucible and the Catalyst',
    canon: ['A Prothean-derived superweapon completed by the allied races in 2186, docking with the Citadel to activate. The Catalyst — the intelligence that controls the Reapers — offers Shepard a choice of outcomes.'],
    au: {
      prime_apex: ['Prime/Apex Successful Refuse: Shepard rejects the Catalyst’s options. The Crucible destroys nothing automatically; victory must be won by the fleets in the simulated campaign.'],
      cerberus_ascendant: ['Cerberus Ascendant: the Catalyst is destroyed by Cerberus’ control solution. Indoctrination ends permanently.'],
    },
  },
  // --------------------------------------------------------------- Doctrine
  {
    id: 'doctrine_alliance',
    category: 'Doctrine',
    title: 'Alliance fleet doctrine',
    canon: ['Combined arms: dreadnoughts and cruisers deliver concentrated spinal fire; frigate wolfpacks screen and harass; carriers stand off and launch torpedo strikes.'],
    estimate: ['Simulation doctrine values: preferred range 85% of maximum, withdraws below 25% hull, strong focus fire and formation cohesion.'],
  },
  {
    id: 'doctrine_reaper',
    category: 'Doctrine',
    title: 'Reaper doctrine',
    canon: ['Reapers close with organic fleets and destroy the heaviest units first. They do not retreat.'],
    estimate: ['Simulation: preferred range 70% of maximum, never withdraw, very high threat prioritisation and 0.8-second decision cycles.'],
  },
  // ------------------------------------------------------------- Simulation
  {
    id: 'sim_model',
    category: 'Simulation',
    title: 'How the combat model works',
    canon: [],
    estimate: [
      'The battle runs at a fixed 20 Hz with a seeded random generator; the same scenario, timeline and seed always produces the same event log, which is what makes replays and canon-vs-AU comparisons valid.',
      'Mass accelerator rounds are real projectiles swept against ship bounding spheres; beams are hit-scan bursts dealing damage over their duration; torpedoes home and can be intercepted.',
      'Damage passes through barriers (type dependent), then armour (reduced by penetration, ablating slowly), then hull; large hits can disable engines, weapons or sensors.',
      'Alternate-universe rules change the effective statistics fed into this model — they are never flavour text.',
    ],
  },
];

export const CODEX_CATEGORIES = ['Factions', 'Ships', 'Weapons', 'Technology', 'Locations', 'Reaper War', 'Doctrine', 'Simulation'] as const;
