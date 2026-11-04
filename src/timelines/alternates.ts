import { CANON_FLEETS, CANON_SPECIAL, CANON_STRATEGIC, CANON_TECH, cloneRules, type RuleSet, type TechModifiers } from './rules';
import type { ThreatTier } from './threat';

/**
 * Ten alternate-universe timelines (docs/apex/TIMELINES_V2.md §2). Every one
 * diverges at a named event of established Mass Effect history, is canon up
 * to that point, and changes only what follows from it. Every text is
 * original writing. Their threat tiers are measured, not asserted: the
 * generated `threatMeasured.ts` decides the label, and the test of
 * `tests/alternateTimelines.test.ts` requires it to agree with `declaredTier`.
 *
 * This module imports only `./rules` (and a type from `./threat`); it must
 * not import `./presets`, which imports it.
 */

const tech = (p: Partial<TechModifiers> = {}): TechModifiers => ({ ...CANON_TECH, ...p });

/** Freezes an object and everything inside it. */
function deepFreeze<T extends object>(o: T): T {
  for (const v of Object.values(o)) if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v as object);
  return Object.freeze(o);
}

/**
 * A preset literal, frozen to the bottom like the canon preset: nothing can
 * change a built-in timeline in place. Every consumer works on a copy
 * (`getPreset`, `cloneRules`, `withLever`, the timelines editor).
 */
const preset = (r: RuleSet): RuleSet => deepFreeze(r);

/** Prefix for every alternate-universe line shown outside the preset itself (codex, tooltips, world-state notes). */
export const auPrefix = (name: string): string => `ALTERNATE UNIVERSE (${name}): `;

/** A world-state value the timeline's story fixes, with the reason shown beside the locked control. */
export interface WorldStateLock {
  value: string;
  why: string;
}

export interface AlternateMeta {
  /** Divergence point inside established Mass Effect history. */
  divergence: { year: number; approximate?: boolean; event: string };
  /** Established canon up to the divergence, in original wording: the codex "established canon" block. */
  canonBasis: string;
  provenance: 'AU_MODIFIED';
  /** Intended tier; tests/alternateTimelines.test.ts requires the generated table to agree (TIMELINES_V2.md §1.8). */
  declaredTier: ThreatTier;
  /**
   * The one knob a release may move to keep the declared tier, its story-safe range and its step
   * (0.05 for multipliers, 0.02 where the story-safe range is narrower than 0.1; 'count' for a fleet
   * lever, which moves to the next value that changes the reference counts). `scripts/timeline-threat.ts` measures both ends (TIMELINES_V2.md §1.8).
   */
  lever: { key: string; min: number; max: number; step: number | 'count' };
  /**
   * World-state values the story implies, keyed by world-state option id. Campaign setup and the
   * Quick Battle briefing preselect and lock them; a key a scenario does not expose is applied silently
   * and listed in the briefing note; a value a scenario's option does not offer is not applied there.
   */
  worldState?: Record<string, WorldStateLock>;
  /** What the campaign cannot express of this premise; shown AU-prefixed in campaign setup and the codex. */
  campaignNote?: string;
}

export const SOVEREIGNS_TRIUMPH: RuleSet = preset({
  id: 'sovereigns_triumph',
  name: 'Sovereign’s Triumph',
  tagline: 'The Citadel relay opened in 2183. The Reapers did not have to wait three more years.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. In 2183 Saren’s lock on the Citadel is never broken: the station’s arms stay sealed, the Council dies aboard the Destiny Ascension and Sovereign opens the Citadel relay for the fleet waiting in dark space. The Reapers enter the heart of Council space three years before canon, with no Sovereign wreck left behind to teach anyone the Thanix and no time to search Prothean ruins for a Crucible. Each species meets the harvest alone, and every battle faces more Reapers than the canon war ever did.',
  historyChanges: [
    '2183: Saren’s override of the Citadel holds; the arms stay sealed and Sovereign opens the Citadel relay to dark space.',
    'The Council dies aboard the Destiny Ascension; the Citadel Fleet and the Alliance Fifth Fleet are destroyed in the Serpent Nebula, and Shepard falls in the Presidium.',
    'No Reaper wreck is salvaged, so the Thanix cannon is never developed.',
    'The harvest begins at the Citadel; nobody searches the Prothean archive on Mars, and there is no Crucible.',
    'No geth fight beside the organics: the heretics serve the harvest and the rest stay behind the Perseus Veil.',
    'Without a Council or a shared command, every species defends its own space alone.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL, thanixAvailability: 'none' },
  fleetStrength: { ...CANON_FLEETS, alliance: 0.8, turian: 0.6, asari: 0.5, salarian: 0.85, geth: 0, reaper: 1.3 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.1, indoctrinationEffectiveness: 1.5, reaperCompetence: 1.1, reaperReinforcements: 1.5, crucibleAvailable: false, shepardAlive: false, shepardEffectiveness: 0 },
});

export const COLLECTORS_HARVEST: RuleSet = preset({
  id: 'collectors_harvest',
  name: 'The Collectors’ Harvest',
  tagline: 'The Normandy never came back through the Omega 4 relay. The human Reaper was never stopped, and the Reapers came early.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. In 2185 the Normandy is destroyed beyond the Omega 4 relay: Shepard and the crew are lost and the Collector base survives. The Collectors go on taking human colonies, and nothing stops the human Reaper. With no Shepard to reach the Bahak system, the indoctrinated team watching the Alpha relay is never stopped, the relay stands, and the Reapers pour through it into batarian space months ahead of canon and all at once. They find the Alliance at its peacetime stations, the quarians and the geth at war, and no one left to unite the Council races.',
  historyChanges: [
    '2185: the Normandy SR-2 is destroyed at the Collector base; Shepard and the crew are killed, and the base survives.',
    'The Collectors keep taking human colonies, and the human Reaper is completed when the harvest arrives (story only: one more Reaper does not change the battles).',
    'Nobody stops the indoctrinated Project team in the Bahak system: the Alpha relay is never destroyed, and the Reapers come through it months ahead of canon, together.',
    'The Alliance meets the invasion with its fleets at peacetime stations, without the months the loss of the Alpha relay bought in canon.',
    'Rannoch stays at war and no one unites the Council races: neither the quarian nor the geth fleet joins the coalition.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, alliance: 0.8, quarian: 0, geth: 0, reaper: 1.15 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.25, indoctrinationEffectiveness: 1.3, reaperCompetence: 1.1, reaperReinforcements: 1.3, shepardAlive: false, shepardEffectiveness: 0 },
});

export const INDOCTRINATED_COUNCIL: RuleSet = preset({
  id: 'indoctrinated_council',
  name: 'The Indoctrinated Council',
  tagline: 'A dead Reaper was towed home for study. By 2186 it had friends on the Council.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. After Shepard’s team recovers the Reaper IFF in 2185, an STG task force that had been tracking Cerberus reaches the derelict Reaper over Mnemosyne before it falls and tows it to a hidden Council research station. The dead machine still indoctrinates: through its researchers its influence reaches the councillors’ staffs and the turian, asari and salarian admiralties. By 2186 fleets are held back on plausible pretexts, fire-control and sensor software is quietly corrupted, and every deployment reaches the Reapers before it reaches the front.',
  historyChanges: [
    '2185: an STG task force salvages the derelict Reaper at Mnemosyne instead of letting it fall into the brown dwarf.',
    'The wreck’s residual indoctrination spreads from the research station into the councillors’ staffs and the turian, asari and salarian admiralties.',
    'Compromised admirals hold fleets in reserve and corrupt fire control, sensors and electronic warfare across the Council navies.',
    'The Reapers learn every deployment in advance; the Alliance, kept outside the programme, is untouched.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {
    turian: { accuracy: 0.7, sensors: 0.8, crewQuality: 0.85 },
    asari: { accuracy: 0.75, sensors: 0.8, electronicWarfare: 0.8 },
    salarian: { accuracy: 0.75, sensors: 0.8, electronicWarfare: 0.7 },
  },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, turian: 0.7, asari: 0.7, salarian: 0.6 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.2, indoctrinationEffectiveness: 2, reaperCompetence: 1.3 },
});

export const LEVIATHANS_BARGAIN: RuleSet = preset({
  id: 'leviathans_bargain',
  name: 'Leviathan’s Bargain',
  tagline: 'The Reapers found Despoina first. To outlive the cycle, the Leviathans lent the harvest their hold on organic minds.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. In 2186 an indoctrinated member of Dr. Ann Bryson’s research circle passes her findings to the Reapers, and the Reapers reach Despoina before Shepard does. The last Leviathans, who made the intelligence that built the Reapers, buy their survival with service and turn the thralls they keep in every port and fleet against the war. Sensor officers and fire-control crews see only what the Leviathans let them see, and Reaper hulls slip out of firing solutions computed by people who are no longer entirely their own.',
  historyChanges: [
    '2186: an indoctrinated member of Dr. Ann Bryson’s research circle passes her findings to the Reapers, who reach Despoina before Shepard.',
    'Spared in exchange for service, the surviving Leviathans turn their thralls in allied ports and fleets against the war effort.',
    'Thralled sensor officers and fire-control crews see what the Leviathans let them see: Reaper hulls slip out of the firing solutions they compute.',
    'Indoctrination and thrall control reinforce each other, and trust between allied commands collapses.',
  ],
  organic: tech({ crewQuality: 0.8, accuracy: 0.9 }),
  reaper: tech({ electronicWarfare: 1.85, sensors: 1.4 }),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.3, indoctrinationEffectiveness: 2, reaperCompetence: 1.4 },
});

export const VIGILS_WARNING: RuleSet = preset({
  id: 'vigils_warning',
  name: 'Vigil’s Warning',
  tagline: 'The Council read the Protheans’ own account in 2183, believed every word, and told no one.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. After the Battle of the Citadel a Council recovery team returns to Ilos and brings out what remains of Vigil’s archive. Council scientists authenticate it and the Council believes it: the Reapers open every war by seizing the Citadel and the relays, after indoctrinated agents have hollowed out the commands that should resist them. Fearing panic, the Council buries the archive. The navies quietly screen their officers for indoctrination, guard the Keepers and the Citadel’s controls, and plan for a war fought with the relays lost, but no budget can pass for warships nobody may be told about, and none are built.',
  historyChanges: [
    '2183: after the Battle of the Citadel, a Council recovery team returns to Ilos and recovers what remains of Vigil’s archive.',
    'Council scientists authenticate the archive; the Council believes it and classifies it to prevent panic.',
    'The navies quietly screen their officers for indoctrination, secure the Keepers and the Citadel’s controls, and drill for a war fought with the relays lost.',
    'The Mars archive is searched in secret from 2184 (story only: the campaign’s Crucible clock is unchanged).',
    'No budget can pass for ships nobody may be told about: no extra warships are built, and the archive holds no weapon.',
  ],
  organic: tech({ crewQuality: 1.04 }),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.55, indoctrinationEffectiveness: 0.4 },
});

export const GETH_QUARIAN_CONCORD: RuleSet = preset({
  id: 'geth_quarian_concord',
  name: 'The Geth–Quarian Concord',
  tagline: 'The quarians recognised the geth instead of shutting them down, and paid for it with their embassy. Rannoch builds warships for both.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. About three centuries before 2183 the quarians answer their creations’ first questions about themselves with recognition instead of a shutdown order. There is no Morning War and no exile. Recognising machine intelligences as people breaks Citadel law, and the quarians choose their children over their embassy: the Council expels them, and Rannoch lives under Citadel sanctions for three hundred years. When the Reapers come in 2186 the Concord joins the war by treaty, not as a Council member, with a homeworld navy whose quarian crews fly beside geth intelligences and a geth fleet that never split and never fought a war at Rannoch.',
  historyChanges: [
    'c. 1895: the quarian government recognises the geth as people; the order to shut them down is never given.',
    'No Morning War and no exile, but recognising artificial intelligences breaks Citadel law: the Council takes the quarian embassy and sanctions Rannoch for three centuries.',
    'The geth never divide and never fight their creators: there are no heretics for Sovereign, and no war at Rannoch in 2186 bleeds either fleet.',
    'Yards shared by quarians and geth build warships that fly with geth intelligences aboard, with better barriers, electronic warfare and crews than any refugee fleet could field.',
    'In 2186 the Concord joins the war against the Reapers by treaty, not as a member of the Council.',
    'Everything between 1895 and 2186 is alternate history; Shepard, the Normandy SR-2 and a hostile Cerberus are kept as stand-ins for this galaxy’s own.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {
    quarian: { crewQuality: 1.2, electronicWarfare: 1.4, accuracy: 1.1, kineticBarrierStrength: 1.2, barrierRegen: 1.3 },
    geth: { crewQuality: 1.2, barrierRegen: 1.3, sensors: 1.2, electronicWarfare: 1.3 },
  },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, quarian: 1.9, geth: 2.4 },
  strategic: { ...CANON_STRATEGIC },
});

export const ASARI_DISCLOSURE: RuleSet = preset({
  id: 'asari_disclosure',
  name: 'The Asari Disclosure',
  tagline: 'In 2183 the Republics opened the Temple of Athame. Their head start became everyone’s.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. Sovereign’s attack persuades the asari councillor and the matriarchs that a secret kept for millennia is no longer worth keeping, and in 2183 the Prothean beacon in the Temple of Athame is opened to Council scientists. Three years of shared study carry the Republics’ lead in barrier projection, sensors and element zero engineering to every navy, and the Republics, no longer hiding the source of their advantage, build openly. The galaxy meets the Reapers with asari-grade defences.',
  historyChanges: [
    '2183: the asari disclose the Prothean beacon hidden in the Temple of Athame to the Council.',
    'Joint research spreads asari barrier, sensor and element zero engineering to every Council navy by 2186.',
    'More efficient element zero cores let spinal guns hit harder, and hulls gain Prothean-pattern plating.',
    'The Republics expand their fleet openly, and trust between the Council races deepens.',
  ],
  organic: tech({ kineticBarrierStrength: 1.35, barrierRegen: 1.3, sensors: 1.25, massAcceleratorDamage: 1.15, armourStrength: 1.1, hullIntegrity: 1.05 }),
  reaper: tech(),
  factionOverrides: {
    asari: { kineticBarrierStrength: 1.15, crewQuality: 1.1 },
  },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, asari: 1.25 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.65 },
});

export const TURIAN_TOTAL_WAR: RuleSet = preset({
  id: 'turian_total_war',
  name: 'Turian Total War',
  tagline: 'After Sovereign, the Hierarchy did what turians do: every citizen served and every yard built warships.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. The Citadel Fleet’s losses in 2183 convince the Primarch that Shepard’s warning is a military fact, and the Hierarchy mobilises as only a society built on universal service can. For three years reserve fleets are recommissioned, colony yards build at war tempo and the volus treasury pays for it. By 2186 the Hierarchy fields about two and a half times its canon fleet with crews drilled for this war, while the other Council races, as alarmed by the build-up as they are reassured, mobilise no faster than in canon.',
  historyChanges: [
    'Late 2183: the Primarch places the Hierarchy on a total-war footing in answer to Sovereign’s attack.',
    'Reserve fleets are recommissioned and colony yards build at war tempo for three years, financed by the volus.',
    'The Hierarchy enters 2186 with about two and a half times its canon fleet and crews drilled against Reaper tactics.',
    'The other Council races watch the build-up warily and mobilise no faster than in canon.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {
    turian: { crewQuality: 1.1, accuracy: 1.05 },
  },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, turian: 2.5 },
  strategic: { ...CANON_STRATEGIC },
});

export const LEVIATHANS_COVENANT: RuleSet = preset({
  id: 'leviathans_covenant',
  name: 'Leviathan’s Covenant',
  tagline: 'At Despoina the Leviathans stopped hiding. The makers of the Reapers’ maker went to war.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. When Shepard reaches Despoina in 2186, the Leviathans conclude that hiding has failed and commit everything they have to the war. Their hold over minds shields allied crews from indoctrination, their thralls across the galaxy report every Reaper movement, and their knowledge of how the Reapers were made shows gunners where the plating is thinnest. They cannot command a Reaper, but their presence unsettles one: Reaper fire control and coordination falter wherever the Leviathans fight.',
  historyChanges: [
    '2186: the Leviathans of Despoina join the war openly rather than as a hidden asset.',
    'Leviathan mental shielding protects allied crews; indoctrination no longer reaches the fleets.',
    'Thralls in every sector track Reaper movements, and Leviathan knowledge of Reaper construction guides allied targeting.',
    'Leviathan interference degrades Reaper targeting, electronic warfare and coordination in battle.',
  ],
  organic: tech({ sensors: 1.3, accuracy: 1.15, massAcceleratorPenetration: 1.3 }),
  reaper: tech({ accuracy: 0.75, electronicWarfare: 0.6 }),
  factionOverrides: {},
  special: { ...CANON_SPECIAL, indoctrinationDisabled: true, reaperCommandVulnerability: true },
  fleetStrength: { ...CANON_FLEETS },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.7, indoctrinationEffectiveness: 0, reaperCompetence: 0.6 },
});

export const CONDUIT_PROTOCOL: RuleSet = preset({
  id: 'conduit_protocol',
  name: 'The Conduit Protocol',
  tagline: 'The Protheans built one relay of their own. By 2186 the galaxy could lock the rest against their builders.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. After 2183 the Conduit, the small relay the Prothean scientists of Ilos built for themselves, is studied by a joint Alliance and Salarian Union team. Its design shows how a relay chooses what it carries, and by 2186 the Council can lock the relays the Reapers built against the Reapers themselves. The harvest has to cross the galaxy at ordinary faster-than-light speeds and reaches each battle in scattered groups, while the organic fleets still move through the network at will.',
  historyChanges: [
    '2183–2185: a joint Alliance–STG team studies the Prothean Conduit on Ilos.',
    '2186: the Council deploys relay locks, and the Reapers can no longer travel through the network they built.',
    'Reaper fleets cross between systems at ordinary FTL speeds and reach each battle in scattered groups.',
    'The organic fleets keep the relay network and concentrate faster than the Reapers can.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, reaper: 0.4 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.7, reaperReinforcements: 0.3, conventionalVictoryPossible: true },
});

/** In declared-tier order, then by divergence year (TIMELINES_V2.md §2). */
export const ALTERNATE_PRESETS: RuleSet[] = [
  SOVEREIGNS_TRIUMPH,
  COLLECTORS_HARVEST,
  INDOCTRINATED_COUNCIL,
  LEVIATHANS_BARGAIN,
  VIGILS_WARNING,
  GETH_QUARIAN_CONCORD,
  ASARI_DISCLOSURE,
  TURIAN_TOTAL_WAR,
  LEVIATHANS_COVENANT,
  CONDUIT_PROTOCOL,
];

const NO_CURE: WorldStateLock = {
  value: 'sabotaged',
  why: 'With Shepard dead, no one ever cures the genophage, so the krogan stay on Tuchanka. This is the setting’s “cure sabotaged” state, in which the Salarian First Fleet still joins the war: the simulator has no separate state for a cure never made.',
};

export const ALTERNATE_META: Record<string, AlternateMeta> = {
  sovereigns_triumph: {
    divergence: { year: 2183, event: 'Battle of the Citadel: Saren’s override of the Citadel holds and Sovereign opens the Citadel relay to dark space.' },
    canonBasis: 'In 2183 Saren reached the Citadel through the Conduit and locked its arms while Sovereign and a geth fleet attacked. Shepard broke the lock with data recovered on Ilos, and the combined fleets destroyed Sovereign after Saren died.',
    provenance: 'AU_MODIFIED',
    declaredTier: 1,
    lever: { key: 'fleetStrength.reaper', min: 1.25, max: 1.5, step: 'count' },
    worldState: {
      ascension: { value: 'absent', why: 'The Council and the Destiny Ascension were lost at the Citadel in 2183.' },
      rannoch: { value: 'war', why: 'No one makes peace between the quarians and the geth.' },
      outcome: { value: 'war', why: 'No one makes peace between the quarians and the geth.' },
      normandy: { value: 'no', why: 'Shepard died at the Citadel in 2183 and the Normandy SR-2 was never built.' },
      genophage: NO_CURE,
    },
    campaignNote: 'The campaign opens on the 2186 map: the fall of the Citadel in 2183 and the earlier start of the harvest are not modelled, so the Citadel and its fleets begin in allied hands.',
  },
  collectors_harvest: {
    divergence: { year: 2185, event: 'The assault on the Collector base fails beyond the Omega 4 relay.' },
    canonBasis: 'In 2185 Shepard, rebuilt by Cerberus, took the Normandy SR-2 through the Omega 4 relay to the Collector base near the galactic core and destroyed the human Reaper the Collectors were building from abducted colonists. Later that year Shepard destroyed the Alpha relay in the Bahak system, delaying the Reaper arrival by months.',
    provenance: 'AU_MODIFIED',
    declaredTier: 2,
    lever: { key: 'fleetStrength.reaper', min: 1.1, max: 1.2, step: 'count' },
    worldState: {
      rannoch: { value: 'war', why: 'No one brokers peace at Rannoch.' },
      outcome: { value: 'war', why: 'No one brokers peace at Rannoch, and no one cuts the Reaper signal to the geth.' },
      normandy: { value: 'no', why: 'Shepard and the Normandy SR-2 were lost at the Collector base in 2185.' },
      genophage: NO_CURE,
    },
    campaignNote: 'The campaign opens at the canon 2186 start: the earlier arrival is expressed only through the smaller Alliance fleet, the larger Reaper groups and the Reaper reinforcement pool.',
  },
  indoctrinated_council: {
    divergence: { year: 2185, event: 'A Council salvage task force recovers the derelict Reaper at Mnemosyne instead of letting it fall into the brown dwarf.' },
    canonBasis: 'In 2185 Shepard’s team boarded a Reaper that had been dead for millions of years in orbit of the brown dwarf Mnemosyne and recovered its IFF. The Cerberus scientists studying the wreck had been indoctrinated by it, and the derelict was lost to the brown dwarf after the team escaped.',
    provenance: 'AU_MODIFIED',
    declaredTier: 2,
    lever: { key: 'factionOverrides.turian.accuracy', min: 0.55, max: 0.85, step: 0.05 },
  },
  leviathans_bargain: {
    divergence: { year: 2186, event: 'An indoctrinated member of Dr. Ann Bryson’s research circle passes her findings to the Reapers, who reach Despoina before Shepard; the surviving Leviathans bargain for their survival.' },
    canonBasis: 'In 2186 Dr. Ann Bryson’s research put Shepard on the trail of the Leviathans, the race that created the intelligence that created the Reapers, hidden for aeons on Despoina behind thralls who kept their secret. In canon Shepard found them first and persuaded them to join the war.',
    provenance: 'AU_MODIFIED',
    declaredTier: 2,
    lever: { key: 'reaper.electronicWarfare', min: 1.5, max: 2, step: 0.05 },
  },
  vigils_warning: {
    divergence: { year: 2183, event: 'After the Battle of the Citadel a Council recovery team brings Vigil’s archive out of Ilos, and the Council believes it in secret.' },
    canonBasis: 'In 2183 Shepard reached Ilos, where Vigil, a Prothean VI, explained how the Reapers had used the Citadel and the relays to cut off the Prothean empire’s leadership after indoctrinated agents had weakened it, and gave Shepard the data that broke Saren’s hold on the Citadel. With Vigil’s power failing, Shepard went straight on through the Conduit.',
    provenance: 'AU_MODIFIED',
    declaredTier: 3,
    lever: { key: 'organic.crewQuality', min: 1, max: 1.08, step: 0.02 },
  },
  geth_quarian_concord: {
    divergence: { year: 1895, approximate: true, event: 'The quarian government recognises the geth instead of ordering their shutdown; the Morning War never happens.' },
    canonBasis: 'About three hundred years before 2183 the quarians’ geth servants began to show signs of self-awareness. The quarians tried to shut them down, lost the Morning War and fled Rannoch in the Migrant Fleet; the Council closed the quarian embassy for creating the geth, and by 2183 a heretic faction of geth served Sovereign.',
    provenance: 'AU_MODIFIED',
    declaredTier: 4,
    lever: { key: 'factionOverrides.geth.electronicWarfare', min: 1, max: 1.6, step: 0.05 },
    worldState: {
      rannoch: { value: 'peace', why: 'There was no Morning War: the quarians and the geth fight the Reapers together as the Concord.' },
      outcome: { value: 'peace', why: 'There was no Morning War: the quarians and the geth fight the Reapers together as the Concord.' },
    },
    campaignNote: 'In the campaign the Concord’s two fleets keep the Migrant Fleet and Geth Consensus Fleet names and hull lists, liveships included, as stand-ins for the Rannoch Navy and the geth fleet.',
  },
  asari_disclosure: {
    divergence: { year: 2183, event: 'After Sovereign’s attack the asari councillor and the matriarchs disclose the Prothean beacon in the Temple of Athame.' },
    canonBasis: 'The asari kept a Prothean beacon hidden in the Temple of Athame on Thessia for thousands of years, and it fed their technological lead; the secret came out only in 2186, when the Reapers attacked Thessia.',
    provenance: 'AU_MODIFIED',
    declaredTier: 4,
    lever: { key: 'organic.massAcceleratorDamage', min: 1.1, max: 1.2, step: 0.05 },
  },
  turian_total_war: {
    divergence: { year: 2183, event: 'After the Battle of the Citadel the Primarch places the Hierarchy on a total-war footing.' },
    canonBasis: 'Turians serve in the military from the age of fifteen, the Hierarchy fields the largest navy in Citadel space and the volus are its client race. The Citadel Fleet took heavy losses against Sovereign in 2183, but the Hierarchy did not mobilise against the Reapers before they struck Palaven in 2186.',
    provenance: 'AU_MODIFIED',
    declaredTier: 5,
    lever: { key: 'fleetStrength.turian', min: 2.2, max: 2.8, step: 'count' },
  },
  leviathans_covenant: {
    divergence: { year: 2186, event: 'At Despoina the Leviathans join the war openly instead of as a hidden asset.' },
    canonBasis: 'In 2186 Shepard followed Dr. Ann Bryson’s research to Despoina, where the Leviathans, who created the intelligence that created the Reapers, had hidden for aeons behind their thralls; the first Reaper had been made in their image. Shepard persuaded them to join the war.',
    provenance: 'AU_MODIFIED',
    declaredTier: 5,
    lever: { key: 'reaper.accuracy', min: 0.7, max: 0.8, step: 0.05 },
  },
  conduit_protocol: {
    divergence: { year: 2183, event: 'A joint Alliance–STG team begins studying the Prothean Conduit on Ilos.' },
    canonBasis: 'The Conduit on Ilos was a small mass relay built by Prothean scientists, and Saren and Shepard used it in 2183 to reach the Citadel. The Reapers built the mass relay network, and the Citadel itself is a relay to dark space.',
    provenance: 'AU_MODIFIED',
    declaredTier: 6,
    lever: { key: 'fleetStrength.reaper', min: 0.35, max: 0.41, step: 'count' },
    campaignNote: 'The campaign still moves Reaper fleets along the relay lanes: the locks are expressed only through the smaller Reaper fleets and the reduced reinforcement pool.',
  },
};

/** The metadata of a new timeline, or undefined for every other rule set. */
export const alternateMeta = (id: string): AlternateMeta | undefined => ALTERNATE_META[id];

// ------------------------------------------------------------------ levers

const leverPath = (key: string): string[] => key.split('.');

/** The current value of a lever key ('fleetStrength.reaper', 'factionOverrides.turian.accuracy', 'organic.crewQuality', …). */
export function getLever(rules: RuleSet, key: string): number {
  let v: unknown = rules;
  for (const part of leverPath(key)) v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[part] : undefined;
  if (typeof v === 'number') return v;
  // A faction override that leaves the key unset inherits the organic value.
  const [head, faction, k] = leverPath(key);
  if (head === 'factionOverrides' && faction && k) return (rules.organic as unknown as Record<string, number>)[k];
  throw new Error(`lever ${key}: not a numeric key of ${rules.id}`);
}

/** A clone of `rules` with the lever key set to `value`. */
export function withLever(rules: RuleSet, key: string, value: number): RuleSet {
  const r = cloneRules(rules);
  const path = leverPath(key);
  let o = r as unknown as Record<string, unknown>;
  for (const part of path.slice(0, -1)) {
    if (o[part] === undefined || o[part] === null) o[part] = {};
    o = o[part] as Record<string, unknown>;
  }
  o[path[path.length - 1]] = value;
  return r;
}

// ------------------------------------------------------------------ world state

/** World-state values the campaign setup offers (src/ui/screens/campaign.ts), with its defaults. */
export const CAMPAIGN_WORLD_STATE_CHOICES: Readonly<Record<string, readonly string[]>> = {
  ascension: ['present', 'absent'],
  rachni: ['saved', 'killed'],
  rannoch: ['war', 'peace'],
  genophage: ['cured', 'sabotaged'],
  crucible: ['use', 'refuse'],
};
export const CAMPAIGN_WORLD_STATE_DEFAULTS: Readonly<Record<string, string>> = { ascension: 'present', rannoch: 'war', crucible: 'use', genophage: 'cured', rachni: 'saved' };

export interface LockedWorldState {
  /** The world state with the timeline's values applied. */
  ws: Record<string, string>;
  /** Exposed options this timeline locks, with the reason. */
  locked: Record<string, WorldStateLock>;
  /** Keys applied although the screen offers no control for them (scenarios read some world state without an option). */
  hidden: Record<string, WorldStateLock>;
}

/**
 * Applies a timeline's world-state locks. `choices` lists the options the
 * screen exposes and the values each offers. A locked key the screen exposes
 * is set only when its value is one of the offered choices; with
 * `applyHidden`, a key the screen does not expose is set as well.
 */
export function lockWorldState(rules: Pick<RuleSet, 'id'>, ws: Record<string, string>, choices: Readonly<Record<string, readonly string[]>>, applyHidden = true): LockedWorldState {
  const out: LockedWorldState = { ws: { ...ws }, locked: {}, hidden: {} };
  const locks = ALTERNATE_META[rules.id]?.worldState;
  if (!locks) return out;
  for (const [key, lock] of Object.entries(locks)) {
    const offered = choices[key];
    if (offered) {
      if (!offered.includes(lock.value)) continue;
      out.ws[key] = lock.value;
      out.locked[key] = lock;
    } else if (applyHidden) {
      out.ws[key] = lock.value;
      out.hidden[key] = lock;
    }
  }
  return out;
}
