import { apexCaption } from '@/data/apexScale';
import { SHIP_CLASSES } from '@/data/ships';
import { FACTIONS } from '@/data/factions';
import type { FactionId } from '@/data/types';
import { beatPreview, clampBeatScale } from '@/simulation/beats';
import type { Beat, BeatEvent, BeatScript, FleetSpec } from '@/simulation/types';
import { isApexScenario, type RuleSet } from '@/timelines/rules';

/**
 * The Final Battle of Earth's cinematic opening (ADOPTION_PLAN.md §4.3; CINEMATIC_DESIGN.md §1.4; WORK_BREAKDOWN.md
 * §1.3.12): the default beat table in scene seconds at `beatScale 1`, and the script a battle runs — filtered by the
 * world state (`Beat.when`) and the rule set (the Apex-figure captions only under `isApexScenario`), paced by
 * `ws.beat_scale`, with the player locked out until 80 s × pace. Nothing in a playable battle is forced: the beats
 * order, hold, mark and release; the outcomes come from the simulation.
 */

/** Fleet ids of the default combined fleet, the Reaper blockade and the platform fleet (the builder uses them). */
export const FINAL_BATTLE_FLEET_IDS = {
  alliance: 'sword-alliance',
  /** The Apex heavy line (AU: the Valkyrie and SSV Omaha), arriving with the Alliance wave. */
  heavy: 'sword-heavy',
  turian: 'sword-turian',
  asari: 'sword-asari',
  salarian: 'sword-salarian',
  quarian: 'sword-quarian',
  geth: 'sword-geth',
  cerberus: 'sword-cerberus',
  blockade: 'reaper-blockade',
  reserve: 'reaper-blockade-2',
  platforms: 'sol-platforms',
  hostileCerberus: 'cerberus-hostile',
} as const;

/** The arrival waves of the table in faction order: beat id, faction, scene time, stagger (AP §4.3). */
export const FINAL_BATTLE_ARRIVALS: readonly { id: string; faction: FactionId; at: number; stagger: number }[] = [
  { id: 'arrive_alliance', faction: 'alliance', at: 0.0, stagger: 3.0 },
  { id: 'arrive_turian', faction: 'turian', at: 3.0, stagger: 2.5 },
  { id: 'arrive_asari', faction: 'asari', at: 5.5, stagger: 2.0 },
  { id: 'arrive_salarian', faction: 'salarian', at: 7.0, stagger: 2.0 },
  { id: 'arrive_quarian', faction: 'quarian', at: 8.0, stagger: 2.5 },
  { id: 'arrive_geth', faction: 'geth', at: 9.5, stagger: 2.0 },
  { id: 'arrive_cerberus', faction: 'cerberus', at: 12.0, stagger: 1.5 },
];

/** Beats that carry an Apex figure: kept only under the Apex scenarios (`isApexScenario`, AP §4.3 `*`). */
export const APEX_ONLY_BEATS: readonly string[] = ['scale_caption', 'platforms'];

/** The mark (scene seconds): after the last arrival flash (the last wave at 12 s with its 1.5–3 s stagger). */
export const MARK_AT = 15;

/** When the player gets the battle (scene seconds; × pace). */
export const FINAL_BATTLE_LOCK_UNTIL = 80;

/** The Reaper answer's per-ship target: the nearest line hull of side A — never a platform (AP §4.2, §4.3). */
const LINE_TARGET = { query: 'nearest', side: 'A', roles: ['cruiser', 'dreadnought', 'super_dreadnought'] } as const;

const blockade = { fleetIds: [FINAL_BATTLE_FLEET_IDS.blockade] };
const sideA = { side: 'A' } as const;

/**
 * The default table (AP §4.3; ids fixed). Where the plan puts two events on one row, the second is its own beat at the
 * same time, right after the first (`mark_priority`, `fighters_drones`, `free_play_hades`). The arrival waves name
 * the default fleets; with campaign forces `finalBattleScript` rewrites them to wave selectors.
 */
export const FINAL_BATTLE_BEATS: Beat[] = [
  { id: 'title', at: 0.5, label: 'Title', event: { kind: 'caption', text: 'SOL · 2186', duration: 3.5, style: 'title' } },
  ...FINAL_BATTLE_ARRIVALS.map(
    (a): Beat => ({
      id: a.id,
      at: a.at,
      label: `Arrival: ${FACTIONS[a.faction].shortName}`,
      event:
        a.faction === 'alliance'
          ? { kind: 'spawn_wave', fleets: { fleetIds: [FINAL_BATTLE_FLEET_IDS.alliance, FINAL_BATTLE_FLEET_IDS.heavy] }, stagger: a.stagger }
          : { kind: 'spawn_wave', fleetId: FINAL_BATTLE_FLEET_IDS[a.faction as keyof typeof FINAL_BATTLE_FLEET_IDS], stagger: a.stagger },
      ...(a.faction === 'salarian' ? { when: { genophage: ['sabotaged'] } } : {}),
      ...(a.faction === 'cerberus' ? { when: { cerberus: ['allied'] } } : {}),
    }),
  ),
  // HADES penetrators are held for the player until free play (a no-op without Titan guns); every anti-ship mount
  // stays held until the volley (the opening hold, `finalBattle.ts`).
  { id: 'form_up', at: 12.0, label: 'Form up', event: { kind: 'set_fleet_order', fleets: sideA, patch: { order: 'advance', holdFire: 'all', holdSpecialAmmo: true } } },
  // The blockade climbs 12 km into the coalition's plane while it advances (AP §4.2).
  { id: 'reapers_advance', at: 20.0, label: 'Reapers advance', event: { kind: 'set_fleet_order', fleets: blockade, patch: { order: 'advance', holdFire: 'beams', anchorGoal: { y: 0 } } } },
  { id: 'oculus_launch', at: 24.0, label: 'Oculus launch', event: { kind: 'launch_drones', fleets: blockade, burst: 8 } },
  { id: 'scale_caption', at: 26.0, label: 'Scale caption (AU)', event: { kind: 'caption', text: apexCaption('warships', 0), duration: 4, style: 'tactical', au: true } },
  { id: 'platforms', at: 28.0, label: 'Platform caption (AU)', event: { kind: 'caption', text: apexCaption('platforms', 4), duration: 4, style: 'tactical', au: true } },
  // The mark: every coalition hull tracks its nearest Reaper capital, so the held spinal mounts' solutions mature (AP
  // §19 8.7). Given once the last wave has flashed in (15 s) and held through the answer (48 s): at the opening's
  // 15–20 km a solution builds ≈ 0.03 per second (solutions.ts), so the plan's "q ≥ 0.6 at release" needs ≈ 20 s
  // of tracking, not the 10 s a mark at 28 s would leave.
  { id: 'mark_priority', at: MARK_AT, label: 'Mark Reaper capitals', event: { kind: 'set_fleet_order', fleets: sideA, patch: { priority: 'reaper_capitals' } } },
  { id: 'mark', at: MARK_AT, label: 'Mark Reaper capitals', event: { kind: 'force_target', fleets: sideA, target: { query: 'nearest', side: 'B', roles: ['reaper_capital'] }, seconds: 48 - MARK_AT } },
  { id: 'line_holds', at: 34.0, label: 'Line holds', event: { kind: 'set_fleet_order', fleets: sideA, patch: { order: 'attack' } } },
  { id: 'volley', at: 36.0, label: 'Fleet volley', event: { kind: 'fleet_volley', fleets: sideA, lead: 2.0, window: 1.5, mounts: 'spinal', anchor: { name: 'SSV Kilimanjaro' } } },
  // The answer: the beams spread over the nearest line hulls (per ship, weighted by how many Reapers already chose a
  // hull), so cruisers and the dreadnoughts just behind them take beams — the platforms are excluded (AP §4.2).
  { id: 'reaper_answer', at: 42.0, label: 'Reaper answer', event: { kind: 'fleet_volley', fleets: blockade, lead: 2.0, window: 2.0, mounts: 'beams', target: { ...LINE_TARGET, roles: [...LINE_TARGET.roles] }, spread: true } },
  { id: 'fighters', at: 48.0, label: 'Fighter screen', event: { kind: 'set_fleet_order', fleets: sideA, patch: { fightersDeployed: true } } },
  { id: 'fighters_drones', at: 48.0, label: 'Fighter screen', event: { kind: 'launch_drones', fleets: blockade, burst: 6 } },
  { id: 'free_play', at: FINAL_BATTLE_LOCK_UNTIL, label: 'Orders unlock', event: { kind: 'player_control', locked: false } },
  { id: 'free_play_hades', at: FINAL_BATTLE_LOCK_UNTIL, label: 'Orders unlock', event: { kind: 'set_fleet_order', fleets: sideA, patch: { holdSpecialAmmo: false } } },
];

/** What the builder knows that the table cannot: the simulated counts for the AU captions and the campaign's waves. */
export interface FinalBattleScriptOptions {
  /** The battle's fleets: side-A hull and platform counts fill the Apex captions; campaign waves are read from them. */
  fleets?: readonly FleetSpec[];
  /** The side-A beat fleets are campaign fleets: the arrival beats address waves by faction order (AP §4.3). */
  campaignWaves?: boolean;
}

/** Live hulls a fleet spec fields (small craft excluded). */
const hullsOf = (f: FleetSpec): number => f.ships.reduce((a, s) => (SHIP_CLASSES[s.classId]?.role === 'fighter' ? a : a + s.count), 0);
const platformsOf = (f: FleetSpec): number => f.ships.reduce((a, s) => (SHIP_CLASSES[s.classId]?.role === 'fixed_platform' ? a + s.count : a), 0);

/** Faction order of the arrival waves (the table's order: Alliance, turian, asari, salarian, quarian, geth, Cerberus). */
const FACTION_ORDER: readonly FactionId[] = Object.keys(FACTIONS) as FactionId[];

/**
 * The campaign arrival beats: the side-A beat fleets in wave order (faction order, then authoring order — exactly
 * `FleetSel { side, wave }`), each at its faction's arrival time (a second fleet of a faction 1 s after the first,
 * never after 12 s, so the form-up catches every wave).
 */
function campaignArrivals(fleets: readonly FleetSpec[]): Beat[] {
  const waves = fleets
    .filter((f) => f.side === 'A' && f.arrivalMode === 'beat')
    .map((f, i) => ({ f, i, r: FACTION_ORDER.indexOf(f.faction) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.f);
  const seen = new Map<FactionId, number>();
  return waves.map((f, wave) => {
    const k = seen.get(f.faction) ?? 0;
    seen.set(f.faction, k + 1);
    const slot = FINAL_BATTLE_ARRIVALS.find((a) => a.faction === f.faction) ?? FINAL_BATTLE_ARRIVALS[FINAL_BATTLE_ARRIVALS.length - 1];
    const event: BeatEvent = { kind: 'spawn_wave', fleets: { side: 'A', wave }, stagger: slot.stagger };
    return { id: k === 0 ? slot.id : `${slot.id}_${k + 1}`, at: Math.min(12, slot.at + k), label: `Arrival: ${f.name}`, event };
  });
}

/**
 * The script the battle runs (AP §4.3): the table filtered by the rules (the `*` captions only under the Apex
 * scenarios; the AU tag caption under every non-canon preset), the Apex captions filled with the simulated counts,
 * campaign waves when the side-A fleets come from a campaign, pace from `ws.beat_scale` (0.5–2), player lock until
 * 80 s. `Beat.when` conditions stay on the beats; the simulation and the briefing's `beatPreview` filter them by the
 * resolved world state.
 */
export function finalBattleScript(rules: RuleSet, ws: Record<string, string>, opts: FinalBattleScriptOptions = {}): BeatScript {
  const apex = isApexScenario(rules);
  const fleets = opts.fleets ?? [];
  const simulatedA = fleets.filter((f) => f.side === 'A').reduce((a, f) => a + hullsOf(f), 0);
  const platforms = fleets.reduce((a, f) => a + platformsOf(f), 0);
  let beats: Beat[] = [];
  for (const b of FINAL_BATTLE_BEATS) {
    if (APEX_ONLY_BEATS.includes(b.id) && !apex) continue;
    if (b.id === 'scale_caption' && opts.fleets) beats.push({ ...b, event: { ...(b.event as Extract<BeatEvent, { kind: 'caption' }>), text: apexCaption('warships', simulatedA) } });
    else if (b.id === 'platforms' && opts.fleets) beats.push({ ...b, event: { ...(b.event as Extract<BeatEvent, { kind: 'caption' }>), text: apexCaption('platforms', platforms) } });
    else beats.push(b);
    // Under every alternate-universe preset a tag caption stays up through the opening (AP §4.3 `title`).
    if (b.id === 'title' && rules.category !== 'canon') {
      beats.push({ id: 'title_tag', at: b.at, label: 'AU tag', event: { kind: 'caption', text: `ALTERNATE UNIVERSE · ${rules.name.toUpperCase()}`, duration: FINAL_BATTLE_LOCK_UNTIL, style: 'tag', au: true } });
    }
  }
  if (opts.campaignWaves) {
    const arrivals = new Set(FINAL_BATTLE_ARRIVALS.map((a) => a.id));
    const at = beats.findIndex((b) => arrivals.has(b.id));
    beats = beats.filter((b) => !arrivals.has(b.id));
    beats.splice(Math.max(0, at), 0, ...campaignArrivals(fleets));
  }
  return { version: 1, beats, beatScale: clampBeatScale(Number(ws.beat_scale ?? '1')), lockPlayerUntil: FINAL_BATTLE_LOCK_UNTIL, scripted: true };
}

/** The briefing's beat list for these rules and this world state (pace applied, `when` and the Apex captions filtered). */
export const finalBattlePreview = (rules: RuleSet, ws: Record<string, string>): { id: string; at: number; label: string }[] => beatPreview(finalBattleScript(rules, ws).beats, ws);
