import { v3, type Vec3 } from '@/core/vec3';
import { isAuClass, type FactionId } from '@/data/types';
import { clampBeatScale } from '@/simulation/beats';
import type { BattleConfig, FleetOrders, FleetSpec, FormationType, Readiness } from '@/simulation/types';
import { isApexRules, type RuleSet } from '@/timelines/rules';
import { distantLayerFor } from './distantGroups';
import { FINAL_BATTLE_FLEET_IDS as ID, finalBattleScript } from './finalBattleBeats';
import { base, fleet, reaperFleet, scenarioAt, scenarioSecs, type FleetOpts } from './fleets';
import { FINAL_BATTLE_WORLD_STATE, campaignForces, resolveWorldState, type CampaignAlliedFleet } from './worldState';

/**
 * The Final Battle of Earth builder (ADOPTION_PLAN.md §4; WORK_BREAKDOWN.md T16). The world state is resolved here
 * (`resolveWorldState`), so a briefing, a test or a campaign that calls the builder directly gets the same battle as
 * `buildScenario`. Composition: the default combined fleet — the Sword Alliance line with the Kilimanjaro-class pair
 * (SSV Kilimanjaro, SSV Orizaba) and four Everest-class dreadnoughts so the volley anchor exists, two SR-2-pattern
 * stealth frigates under canon (three under the Apex mechanics, built in numbers), the Normandy when the world state
 * says so; under the Apex flags the Valkyrie, one Olympus-class (SSV Omaha) and one Praetor-class heavy dreadnought —,
 * the Sol platforms (two standard; two heavy more under `heavyPlatforms`), the Cerberus world state (allied by beat,
 * hostile as a rogue strike group at 150 s, or absent) and the distant layer; or the saved campaign's fleets. With the
 * cinematic opening the fleets take the AP §4.2 geometry and the beat table runs; without it today's geometry and
 * orders stand (with the platforms and the K-class pair).
 */

/** The Sword fleets' nominal anchors and formations in the cinematic opening (AP §4.2). */
const CINEMATIC: Record<'alliance' | 'turian' | 'asari' | 'salarian' | 'quarian' | 'geth' | 'cerberus', { pos: Vec3; formation: FormationType }> = {
  alliance: { pos: v3(-18, 0, -26), formation: 'layered_line' },
  turian: { pos: v3(20, 0, -28), formation: 'layered_line' },
  asari: { pos: v3(0, 4, -36), formation: 'defensive_screen' },
  salarian: { pos: v3(0, -6, -42), formation: 'line_abreast' },
  quarian: { pos: v3(-38, 0, -34), formation: 'defensive_screen' },
  geth: { pos: v3(38, 0, -32), formation: 'stacked_wedge' },
  // Arriving last (12 s), the Black Fleet takes its place in the gap between the Alliance and the Hierarchy a little
  // ahead of AP §4.2's (2, 0, −30), so its guns reach the Reaper line by the volley like everyone else's.
  cerberus: { pos: v3(2, 0, -24), formation: 'strike_wedge' },
};

/**
 * The Apex heavy line (AU): the Valkyrie and SSV Omaha sail as their own group behind and above the Sword line, so
 * their slower drives and longer guns set their own pace and standoff (the owner's Omaha doctrine: long range, bow
 * solution) instead of holding the whole Alliance line out of its cruisers' reach.
 */
const HEAVY_CINEMATIC = v3(-16, 4, -34);
const HEAVY_STANDARD = scenarioAt(-18, 4, -42);

/** Today's anchors (the opening off), at the scenarios' §22 spacing (`SCENARIO_SPACING`). */
const STANDARD: Record<'alliance' | 'turian' | 'asari' | 'salarian' | 'quarian' | 'geth' | 'cerberus', { pos: Vec3; formation: FormationType }> = {
  alliance: { pos: scenarioAt(-20, 0, -34), formation: 'line_abreast' },
  turian: { pos: scenarioAt(18, 0, -38), formation: 'line_abreast' },
  asari: { pos: scenarioAt(0, 4, -48), formation: 'defensive_screen' },
  salarian: { pos: scenarioAt(0, -6, -56), formation: 'line_abreast' },
  quarian: { pos: scenarioAt(-40, 0, -46), formation: 'defensive_screen' },
  geth: { pos: scenarioAt(40, 0, -44), formation: 'strike_wedge' },
  cerberus: { pos: scenarioAt(2, 0, -42), formation: 'strike_wedge' },
};

/** The Reaper blockade starts below the coalition's plane and climbs into it (AP §4.2). */
const BLOCKADE_CINEMATIC = v3(0, -12, 28);
const BLOCKADE_STANDARD = scenarioAt(0, 0, 46);
/** Platforms sit on an arc 8–14 km ahead of the defending line (AP §4.2; the static formation alternates y ±2 km). */
const PLATFORMS_CINEMATIC = v3(1, 0, -16);
const PLATFORMS_STANDARD = scenarioAt(-1, 0, -25);
/**
 * The Reaper reserve and the hostile Cerberus flank group (CINEMATIC_DESIGN.md §1.4). Without the opening the reserve
 * keeps today's position and arrival at the §22 spacing; the opening and the hostile group take the plan's values.
 */
const RESERVE_POS = v3(-50, 0, 76);
const RESERVE_STANDARD = scenarioAt(-50, 0, 76);
const RESERVE_HEADING = v3(0.4, 0, -1);
const HOSTILE_CERBERUS_POS = v3(-60, 0, 20);
const HOSTILE_CERBERUS_HEADING = v3(0.8, 0, -0.3);

/**
 * The cinematic anchors' z at pace 1 (SIMULATION_ESTIMATE): 0.85 × the AP §4.2 values. The battlegroup formations of
 * release 0.12.3 hold the escorts on their group leaders and keep the cruisers' screens back on the approach, so at
 * the plan's depths the shorter-ranged cruiser mounts (the Apex Thanix cruisers above all) were still out of reach
 * at the volley's release and too few rounds landed (AP §4.3's floor 0.3 × fired); at 0.85 every measured seed clears
 * the floor (0.37–0.49 landed, ≥ 0.73 fired, seeds 1–3, canon and Apex).
 */
export const CINEMATIC_DEPTH = 0.85;

/**
 * The opening's z scaling (AP §4.2's purpose: "so the volley always has solutions"): a faster pace leaves the lines
 * less time to close before the volley, so they start nearer; a slower one, farther. `clamp(beatScale, 0.85, 1.25)`.
 */
export const openingDepthScale = (beatScale: number): number => Math.min(1.25, Math.max(0.7, beatScale));

/**
 * The coalition's orders in the opening (AP §4.2): hold formation, no small craft yet, and every anti-ship mount held
 * (point defence always fires) — the plan's spinal hold extended to the screens, because the 3D formations put the
 * coalition's frigate dome and the swarm's destroyer shell within each other's reach from the first second; the
 * volley opens the battle and the hold lifts when its window closes (AP §20: the volley, then the first losses).
 */
const OPENING_ORDERS: Partial<FleetOrders> = { order: 'hold_formation', holdFire: 'all', fightersDeployed: false };

/** Readiness tiers of the named Apex compositions (AP §1.6); canon never sets one. */
const APEX_READINESS: Partial<Record<FactionId | 'platforms', Readiness>> = { alliance: 'veteran', turian: 'veteran', geth: 'veteran', cerberus: 'veteran', platforms: 'veteran', asari: 'regular', salarian: 'regular', quarian: 'regular' };

/** Whether any fleet fields an alternate-universe hull (the HUD's `ALTERNATE UNIVERSE CONTENT`). */
export const fieldsAuContent = (fleets: readonly FleetSpec[]): boolean => fleets.some((f) => f.ships.some((s) => s.count > 0 && isAuClass(s.classId)));

/** The default combined fleet's compositions (AP §4.2, §22.1; CINEMATIC_DESIGN.md §7.9). */
function swordCounts(rules: RuleSet, ws: Record<string, string>): Record<'alliance' | 'turian' | 'asari' | 'salarian' | 'quarian' | 'geth', Record<string, number>> {
  const sp = rules.special;
  return {
    alliance: {
      alliance_dreadnought_k: 2,
      alliance_dreadnought: 4,
      alliance_carrier: 2,
      alliance_cruiser: 16,
      alliance_frigate: 24,
      alliance_frigate_thanix: isApexRules(rules) ? 3 : 2,
      normandy_sr2: ws.normandy === 'no' ? 0 : 1,
    },
    turian: { turian_super_dreadnought: sp.superDreadnoughts ? 1 : 0, turian_dreadnought: 5, turian_cruiser: 10, turian_frigate: 16 },
    asari: { destiny_ascension: ws.ascension === 'absent' ? 0 : 1, asari_dreadnought: 2, asari_cruiser: 8 },
    salarian: { salarian_dreadnought: 2, salarian_cruiser: 8, salarian_frigate: 12 },
    quarian: { quarian_heavy: 3, quarian_cruiser: 10 },
    geth: { geth_dreadnought: 1, geth_cruiser: 8, geth_frigate: 12 },
  };
}

const SWORD_NAMES: Record<'alliance' | 'turian' | 'asari' | 'salarian' | 'quarian' | 'geth', string> = {
  alliance: 'Sword Fleet (Alliance)',
  turian: 'Sword Fleet (Hierarchy)',
  asari: 'Sword Fleet (Republics)',
  salarian: 'Salarian First Fleet',
  quarian: 'Migrant Fleet detachment',
  geth: 'Geth fleet',
};

/** Named single hulls of the compositions never scale with fleet strength (the K-class pair, the heavy dreadnoughts, the Black Fleet's named hulls). */
const FIXED = ['alliance_dreadnought_k', 'alliance_super_dreadnought', 'turian_super_dreadnought', 'destiny_ascension', 'geth_dreadnought', 'cerberus_dreadnought', 'cerberus_heavy_cruiser'];

export function buildFinalBattle(rules: RuleSet, seed: number, input: Record<string, string>): BattleConfig {
  const { ws, notes } = resolveWorldState({ worldState: FINAL_BATTLE_WORLD_STATE }, rules, input);
  const cinematic = ws.cinematic_arrival === 'on';
  const beatScale = clampBeatScale(Number(ws.beat_scale ?? '1'));
  const depth = cinematic ? CINEMATIC_DEPTH * openingDepthScale(beatScale) : 1;
  const apex = isApexRules(rules);
  const readiness = (key: FactionId | 'platforms'): Readiness | undefined => (apex ? APEX_READINESS[key] : undefined);
  const campaign = ws.forces === 'campaign' ? campaignForces(ws) : undefined;
  const layout = cinematic ? CINEMATIC : STANDARD;
  const at = (p: Vec3): Vec3 => v3(p.x, p.y, p.z * depth);
  const opening = (extra?: Partial<FleetOrders>): Partial<FleetOrders> | undefined => (cinematic ? { ...OPENING_ORDERS, ...(extra ?? {}) } : extra);
  const fleets: FleetSpec[] = [];

  if (campaign) {
    // The saved war's surviving allied fleets: wave n is the n-th by faction order (AP §4.3), today's layout otherwise.
    const perFaction = new Map<FactionId, number>();
    campaign.allied.forEach((f: CampaignAlliedFleet, i) => {
      const k = perFaction.get(f.faction) ?? 0;
      perFaction.set(f.faction, k + 1);
      const slot = cinematic ? layout[f.faction as keyof typeof CINEMATIC] ?? CINEMATIC.cerberus : undefined;
      const position = slot ? at(v3(slot.pos.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 10, slot.pos.y, slot.pos.z - Math.ceil(k / 2) * 6)) : scenarioAt(-24 + (i % 4) * 16, 0, -34 - Math.floor(i / 4) * 8);
      const opts: FleetOpts = {
        counts: f.counts,
        name: f.name,
        position,
        formation: slot ? slot.formation : i === 0 ? 'line_abreast' : 'defensive_screen',
        mult: 1,
        initialOrder: opening(),
        ...(cinematic ? { arrivalMode: 'beat' as const } : {}),
      };
      fleets.push(fleet(`sword-${i}`, f.faction, rules, opts));
    });
  } else {
    const counts = swordCounts(rules, ws);
    const sword = (faction: 'alliance' | 'turian' | 'asari' | 'salarian' | 'quarian' | 'geth'): FleetSpec =>
      fleet(ID[faction], faction, rules, {
        counts: counts[faction],
        fixedClasses: FIXED,
        name: SWORD_NAMES[faction],
        position: at(layout[faction].pos),
        formation: layout[faction].formation,
        ws,
        initialOrder: opening(),
        readiness: readiness(faction),
        ...(cinematic ? { arrivalMode: 'beat' as const } : {}),
      });
    fleets.push(sword('alliance'));
    // The Apex heavy line (AU): the Valkyrie (`valkyrieAvailable`) and one Olympus-class heavy dreadnought, SSV Omaha
    // (`superDreadnoughts`; the owner's lead ship of the line), arriving with the Alliance wave.
    const heavy = { normandy_valkyrie: rules.special.valkyrieAvailable ? 1 : 0, alliance_super_dreadnought: rules.special.superDreadnoughts ? 1 : 0 };
    if (heavy.normandy_valkyrie + heavy.alliance_super_dreadnought > 0) {
      fleets.push(
        fleet(ID.heavy, 'alliance', rules, {
          counts: heavy,
          fixedClasses: FIXED,
          name: 'Sword heavy line (AU)',
          position: at(cinematic ? HEAVY_CINEMATIC : HEAVY_STANDARD),
          formation: 'line_abreast',
          ws,
          initialOrder: opening(),
          readiness: readiness('alliance'),
          ...(cinematic ? { arrivalMode: 'beat' as const } : {}),
        }),
      );
    }
    fleets.push(sword('turian'), sword('asari'));
    if (ws.genophage === 'sabotaged') fleets.push(sword('salarian'));
    fleets.push(sword('quarian'), sword('geth'));
    // Cerberus allied (AU): the Black Fleet under the Apex mechanics, canon Cerberus hulls otherwise; by beat in the
    // opening, at 12 s without it (AP §4.1).
    if (ws.cerberus === 'allied') {
      fleets.push(
        fleet(ID.cerberus, 'cerberus', rules, {
          counts: apex ? { cerberus_dreadnought: 2, cerberus_heavy_cruiser: 2, cerberus_cruiser: 6, cerberus_frigate: 10 } : { cerberus_cruiser: 6, cerberus_frigate: 10 },
          fixedClasses: FIXED,
          name: apex ? 'Cerberus Black Fleet' : 'Cerberus expeditionary fleet',
          position: at(layout.cerberus.pos),
          formation: layout.cerberus.formation,
          ws,
          initialOrder: opening(),
          readiness: readiness('cerberus'),
          ...(cinematic ? { arrivalMode: 'beat' as const } : { arrivalTime: 12 }),
        }),
      );
    }
  }

  // The Sol platforms: two dreadnought-grade stations under every preset (SIMULATION_ESTIMATE), two heavy
  // super-accelerator stations more under `heavyPlatforms` (AU); static, defending their positions.
  fleets.push(
    fleet(ID.platforms, 'alliance', rules, {
      counts: { sol_defence_platform: 2, sol_platform_heavy: rules.special.heavyPlatforms ? 2 : 0 },
      name: 'Sol defence platforms',
      position: at(cinematic ? PLATFORMS_CINEMATIC : PLATFORMS_STANDARD),
      formation: 'static',
      mult: 1,
      static: true,
      initialOrder: { order: 'defend_position', ...(cinematic ? { holdFire: 'all' as const } : {}) },
      readiness: readiness('platforms'),
    }),
  );

  // The Reaper blockade (Harbinger commands it in person) and the reserve.
  // In the opening the blockade holds its formation and its beams (the plan's `reapers_advance` hold, from the start:
  // the swarm's forward destroyers and Harbinger's beams reach the coalition's screen long before the volley).
  const blockadeOrders: Partial<FleetOrders> | undefined = cinematic ? { order: 'hold_formation', holdFire: 'beams', fightersDeployed: false } : undefined;
  if (campaign) {
    fleets.push(
      fleet(ID.blockade, 'reaper', rules, {
        counts: campaign.reaper,
        fixedClasses: ['harbinger'],
        name: 'Reaper blockade',
        side: 'B',
        position: cinematic ? at(BLOCKADE_CINEMATIC) : BLOCKADE_STANDARD,
        heading: v3(0, 0, -1),
        formation: cinematic ? 'swarm_descent' : 'strike_wedge',
        mult: 1,
        initialOrder: blockadeOrders,
      }),
    );
  } else {
    fleets.push(
      reaperFleet(ID.blockade, rules, {
        capitals: 6,
        destroyers: 14,
        harbinger: true,
        name: 'Reaper blockade',
        position: cinematic ? at(BLOCKADE_CINEMATIC) : BLOCKADE_STANDARD,
        formation: cinematic ? 'swarm_descent' : undefined,
        ws,
        initialOrder: blockadeOrders,
      }),
    );
    fleets.push(reaperFleet(ID.reserve, rules, { capitals: 3, destroyers: 8, name: 'Reaper reserve', position: cinematic ? RESERVE_POS : RESERVE_STANDARD, heading: RESERVE_HEADING, arrivalTime: cinematic ? 110 : scenarioSecs(90), ws, ...(cinematic ? { arrivalFlash: true } : {}) }));
  }

  // Cerberus hostile (extrapolation): a strike group on side B for the bookkeeping, hostile to both sides in battle.
  if (ws.cerberus === 'hostile') {
    fleets.push(
      fleet(ID.hostileCerberus, 'cerberus', rules, {
        counts: { cerberus_cruiser: 8, cerberus_frigate: 12 },
        name: 'Cerberus strike group (hostile)',
        side: 'B',
        position: HOSTILE_CERBERUS_POS,
        heading: HOSTILE_CERBERUS_HEADING,
        formation: 'strike_wedge',
        ws,
        arrivalTime: 150,
        playerControlled: false,
        rogue: true,
        initialOrder: { priority: 'capitals' },
        ...(cinematic ? { arrivalFlash: true } : {}),
      }),
    );
    notes.push('CERBERUS (HOSTILE): the strike group fires at both sides; for the result it counts with the Reapers (the simulation keeps two sides).');
  }

  const config = base('final_battle_of_earth', 'Final Battle of Earth', 'final_battle_of_earth', seed, rules, 'earth_orbit', scenarioSecs(540), 'Break the Reaper blockade of Earth.', ws, fleets);
  if (cinematic) config.beats = finalBattleScript(rules, ws, { fleets, campaignWaves: campaign !== undefined });
  if (ws.distant_layer === 'on') config.distant = distantLayerFor(rules, fleets);
  if (fieldsAuContent(fleets)) config.auContent = true;
  if (notes.length > 0) config.notes = notes;
  return config;
}
