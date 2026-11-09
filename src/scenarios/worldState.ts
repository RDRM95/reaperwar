import type { FactionId } from '@/data/types';
import { isApexScenario, type RuleSet } from '@/timelines/rules';

/**
 * Declared world state (CUSTOM_BATTLE_DESIGN.md §3.2, ADOPTION_PLAN.md §4.1, WORK_BREAKDOWN.md §1.3.12): the options a
 * scenario offers, how a stored or hand-made record resolves against a rule set (`resolveWorldState`), and the options
 * the Final Battle of Earth and the Sol scenarios share. A builder always receives a resolved record: no missing key,
 * no `'auto'`, no choice the rules cannot field; every coercion leaves a note for the briefing.
 */

export interface WorldStateChoice {
  id: string;
  label: string;
  description: string;
  /** The choice exists only under these rules; otherwise it resolves to the option's default, with a note. */
  availableWhen?: (rules: RuleSet) => boolean;
  /** What the choice needs, for that note ("a timeline in which Cerberus cooperates"). */
  requires?: string;
  /** Alternate-universe content (the briefing badges it). */
  au?: boolean;
}

export interface WorldStateOption {
  id: string;
  label: string;
  /** Provenance category for the UI. */
  kind: 'player_dependent' | 'extrapolation' | 'au';
  description: string;
  choices: WorldStateChoice[];
  /** The default choice id. `'auto'` (offered as a choice) resolves through `defaultFor`. */
  default: string;
  /**
   * Resolves `'auto'` and a missing key from the rules and the options resolved before this one (the second
   * argument; options resolve in declaration order). Callers that pass the rules alone get the rules-only answer.
   */
  defaultFor?: (rules: RuleSet, ws?: Record<string, string>) => string;
  /** Hide the option entirely under these rules (its key is dropped from the resolved record). */
  showWhen?: (rules: RuleSet) => boolean;
  /** Only meaningful under a condition: the reason it is disabled; the value then resolves to `disabledChoice`. */
  disabledWhen?: (rules: RuleSet, ws: Record<string, string>) => string | undefined;
  /** The choice a disabled option resolves to (default: its resolved default). */
  disabledChoice?: string;
  /** The description under these rules (the distant layer's canon line versus the Apex line, AP §4.1). */
  descriptionFor?: (rules: RuleSet) => string;
}

/** The `'auto'` choice id: resolved by the option's `defaultFor`. */
export const AUTO = 'auto';

/** Anything that declares world state (a `ScenarioDef`). */
export interface WorldStateHost {
  worldState?: WorldStateOption[];
}

/** The option's description under these rules. */
export const describeOption = (o: WorldStateOption, rules: RuleSet): string => o.descriptionFor?.(rules) ?? o.description;

/**
 * Resolves a world-state record for a scenario under a rule set (pure, total, idempotent). In declaration order, each
 * option: hidden (`showWhen` false) → its key is dropped; missing or `'auto'` → `defaultFor(rules, resolved so far)`
 * or `default`; an unknown choice or one whose `availableWhen` fails → the resolved default, with a note; disabled
 * (`disabledWhen` gives a reason) → `disabledChoice` (or the resolved default), with the reason as a note when that
 * changes the value. Keys no option declares (campaign forces, `fleet_scaling`) pass through untouched.
 */
export function resolveWorldState(s: WorldStateHost, rules: RuleSet, ws: Record<string, string>): { ws: Record<string, string>; notes: string[] } {
  const out: Record<string, string> = { ...ws };
  const notes: string[] = [];
  for (const o of s.worldState ?? []) {
    if (o.showWhen && !o.showWhen(rules)) {
      delete out[o.id];
      continue;
    }
    const find = (id: string | undefined): WorldStateChoice | undefined => (id === undefined ? undefined : o.choices.find((c) => c.id === id));
    const available = (c: WorldStateChoice | undefined): boolean => c !== undefined && c.id !== AUTO && (!c.availableWhen || c.availableWhen(rules));
    const label = (id: string): string => find(id)?.label ?? id;
    // The resolved default: defaultFor (or default), never 'auto', always a choice these rules can field.
    let def = o.defaultFor ? o.defaultFor(rules, out) : o.default;
    if (!available(find(def))) def = o.choices.find((c) => available(c))?.id ?? def;
    let v = out[o.id];
    if (v === undefined || v === AUTO) v = def;
    else {
      const c = find(v);
      if (c === undefined) {
        notes.push(`${o.label}: unknown choice “${v}”; resolved to “${label(def)}”.`);
        v = def;
      } else if (!available(c)) {
        notes.push(`${o.label}: “${c.label}” needs ${c.requires ?? 'another timeline'}; resolved to “${label(def)}” under ${rules.name}.`);
        v = def;
      }
    }
    const disabled = o.disabledWhen?.(rules, out);
    if (disabled !== undefined) {
      const forced = o.disabledChoice ?? def;
      if (v !== forced) notes.push(disabled);
      v = forced;
    }
    out[o.id] = v;
  }
  return { ws: out, notes };
}

// ------------------------------------------------------------ shared options

/** Shepard's Normandy (AP §22.1: exactly one `normandy_sr2` where the world state says so). */
export const SHEPARD_WORLD_STATE: WorldStateOption = {
  id: 'normandy',
  label: 'Normandy SR-2 present',
  kind: 'player_dependent',
  description: 'Whether Shepard’s Normandy takes part in the engagement.',
  choices: [
    { id: 'yes', label: 'Normandy present', description: 'The Normandy SR-2 joins the fleet with its Thanix cannon.' },
    { id: 'no', label: 'Normandy absent', description: 'The Normandy is elsewhere.' },
  ],
  default: 'yes',
};

/** The distant engagement layer's canon description (AP §4.1). */
export const DISTANT_LAYER_CANON_TEXT = 'Distant engagement layer: a visual extrapolation of the unknown remainder of the fleets; canon gives no hull count; it never changes the result';
/** The sentence the Apex scenarios add (AP §4.1, §13.2). */
export const DISTANT_LAYER_APEX_TEXT = '38,420 is an AU scenario value';

/**
 * The distant engagement layer (AP §4.1, §4.4, §13.3): an extrapolation, on by default and switchable under every
 * preset; under the Apex scenarios (`isApexScenario`, never the Apex flags) its description names the AU figure.
 */
export const DISTANT_LAYER_OPTION: WorldStateOption = {
  id: 'distant_layer',
  label: 'Distant engagement layer',
  kind: 'extrapolation',
  description: DISTANT_LAYER_CANON_TEXT,
  descriptionFor: (rules) => (isApexScenario(rules) ? `${DISTANT_LAYER_CANON_TEXT}; ${DISTANT_LAYER_APEX_TEXT}` : DISTANT_LAYER_CANON_TEXT),
  choices: [
    { id: 'on', label: 'On (statistical)', description: 'Distant echelons fight statistically beyond the simulated fleets; the result is never affected.' },
    { id: 'off', label: 'Off', description: 'Only the simulated fleets.' },
  ],
  default: 'on',
};

// ------------------------------------------------------------ campaign forces

/** One allied campaign fleet as the briefing passes it (`ws.campaignAllied`, JSON). */
export interface CampaignAlliedFleet {
  name: string;
  faction: FactionId;
  counts: Record<string, number>;
}

/** The saved campaign's forces carried in the world state (`campaignAllied` / `campaignReaper`), or undefined. */
export function campaignForces(ws: Record<string, string>): { allied: CampaignAlliedFleet[]; reaper: Record<string, number> } | undefined {
  if (!ws.campaignAllied || !ws.campaignReaper) return undefined;
  try {
    const allied = JSON.parse(ws.campaignAllied) as unknown;
    const reaper = JSON.parse(ws.campaignReaper) as unknown;
    if (!Array.isArray(allied) || allied.length === 0 || reaper === null || typeof reaper !== 'object' || Array.isArray(reaper)) return undefined;
    const fleets = (allied as CampaignAlliedFleet[]).filter((f) => f && typeof f.name === 'string' && typeof f.faction === 'string' && f.counts && typeof f.counts === 'object');
    return fleets.length > 0 ? { allied: fleets, reaper: reaper as Record<string, number> } : undefined;
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------ the Final Battle of Earth

const cerberusCooperates = (rules: RuleSet): boolean => rules.strategic.cerberusStance === 'cooperative' || rules.strategic.cerberusStance === 'controls_reapers';

/** The Cerberus option's hostile line (AP §4.1): shown in the briefing whenever the hostile group is chosen. */
export const CERBERUS_HOSTILE_TEXT = 'Extrapolation: Cerberus forces were not at the Battle of Earth in ME3';

/** The pace knob's choices (AP §4.1). */
export const BEAT_SCALE_CHOICES = ['0.5', '0.75', '1', '1.25', '1.5', '2'] as const;

/**
 * The Final Battle of Earth's options in display order (AP §4.1; CUSTOM_BATTLE_DESIGN.md §3.2): `normandy`,
 * `ascension`, `forces`, `genophage`, `cerberus`, `cinematic_arrival`, `beat_scale`, `distant_layer`.
 */
export const FINAL_BATTLE_WORLD_STATE: WorldStateOption[] = [
  SHEPARD_WORLD_STATE,
  {
    id: 'ascension',
    label: 'Destiny Ascension',
    kind: 'player_dependent',
    description: 'Whether the Destiny Ascension survived the Battle of the Citadel (2183) and sails with Sword.',
    choices: [
      { id: 'present', label: 'Ascension present', description: 'The asari flagship anchors the Republics’ line.' },
      { id: 'absent', label: 'Ascension lost or elsewhere', description: 'No asari flagship.' },
    ],
    default: 'present',
  },
  {
    id: 'forces',
    label: 'Order of battle',
    kind: 'extrapolation',
    description: 'Use the current campaign’s fleets, or the default combined fleet.',
    choices: [
      { id: 'campaign', label: 'From campaign (if one is saved)', description: 'Surviving allied fleets vs remaining Reaper fleets.' },
      { id: 'default', label: 'Default combined fleet', description: 'Alliance, Hierarchy, Republics, Migrant Fleet and geth vs Harbinger’s armada.' },
    ],
    default: 'campaign',
    disabledWhen: (_rules, ws) => (campaignForces(ws) ? undefined : 'No saved campaign: the default combined fleet is used.'),
    disabledChoice: 'default',
  },
  {
    id: 'genophage',
    label: 'Genophage cure',
    kind: 'player_dependent',
    description: 'In canon the Dalatrass commits the Salarian First Fleet only if Shepard sabotages the cure.',
    choices: [
      { id: 'cured', label: 'Cure deployed', description: 'No salarian fleet joins Sword (krogan ground forces instead, not modelled here).' },
      { id: 'sabotaged', label: 'Cure sabotaged', description: 'The Salarian First Fleet joins the default combined fleet.' },
    ],
    default: 'cured',
  },
  {
    id: 'cerberus',
    label: 'Cerberus at Sol',
    kind: 'extrapolation',
    description: 'Whether a Cerberus fleet takes part in the battle for Earth, and on whose side.',
    choices: [
      { id: AUTO, label: 'By timeline', description: 'Allied when the timeline’s Cerberus cooperates, hostile otherwise.' },
      {
        id: 'allied',
        label: 'Allied (AU)',
        description: 'Alternate universe: a Cerberus fleet arrives beside Sword (Black Fleet hulls under the Apex timelines).',
        availableWhen: cerberusCooperates,
        requires: 'a timeline in which Cerberus cooperates',
        au: true,
      },
      { id: 'hostile', label: 'Hostile', description: `${CERBERUS_HOSTILE_TEXT}. A strike group arrives at 150 s, hostile to both sides; it counts with the Reapers for the result.` },
      { id: 'absent', label: 'Absent', description: 'No Cerberus fleet at Sol.' },
    ],
    default: AUTO,
    defaultFor: (rules) => (cerberusCooperates(rules) ? 'allied' : 'hostile'),
    disabledWhen: (_rules, ws) => (ws.forces === 'campaign' ? 'The campaign’s fleets decide; Cerberus campaign fleets at Sol are not modelled (absent).' : undefined),
    disabledChoice: 'absent',
  },
  {
    id: 'cinematic_arrival',
    label: 'Cinematic opening',
    kind: 'extrapolation',
    description: 'Stage the first 80 seconds on a fixed beat table (arrival waves, form-up, the Reaper advance, a simultaneous volley); player orders unlock at 01:20.',
    choices: [
      { id: AUTO, label: 'By order of battle', description: 'On with the default combined fleet, off with the campaign’s fleets.' },
      { id: 'on', label: 'On', description: 'The fleets arrive in waves and open with a coordinated volley; orders unlock when the opening ends.' },
      { id: 'off', label: 'Off', description: 'The fleets start in position and the battle is yours from the first second.' },
    ],
    default: AUTO,
    defaultFor: (_rules, ws) => (ws?.forces === 'campaign' ? 'off' : 'on'),
  },
  {
    id: 'beat_scale',
    label: 'Opening pace',
    kind: 'extrapolation',
    description: 'Stretches or compresses the cinematic opening’s beat table (times and captions; the physics do not scale).',
    choices: BEAT_SCALE_CHOICES.map((id) => ({ id, label: `× ${id}`, description: id === '1' ? 'The default pace.' : Number(id) < 1 ? 'A faster opening.' : 'A slower opening.' })),
    default: '1',
    disabledWhen: (_rules, ws) => (ws.cinematic_arrival === 'off' ? 'Opening pace applies only with the cinematic opening.' : undefined),
    disabledChoice: '1',
  },
  DISTANT_LAYER_OPTION,
];
