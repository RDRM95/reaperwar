/**
 * Calibration harness (BALANCE_AUDIT.md §12 recreated; ADOPTION_PLAN.md §3.3–§3.5;
 * WORK_BREAKDOWN.md §1.5–§1.6.1). Shared by `tests/calibration.test.ts` and
 * `scripts/calibration.ts`. Everything is deterministic: every draw comes from a
 * seeded `Rng` and the live duels are headless `BattleSimulation`s.
 */
import { Rng } from '@/core/rng';
import { getShipClass } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { applyDamage } from '@/simulation/damage';
import type { BattleEvent, ShipState, Side } from '@/simulation/types';
import { CANON_ME3 } from '@/timelines/presets';
import { applyRulesToWeapon, type RuleSet } from '@/timelines/rules';

// ------------------------------------------------------------- isolated bench

export interface BenchOptions {
  /** Dreadnought rounds per synchronised volley. */
  dreadnoughts: number;
  target?: 'reaper_capital' | 'harbinger';
  /** Probability that each round hits (1 = all hits); drawn from `seed`. */
  hitChance?: number;
  seed?: number;
  /** Seconds between volleys (the canon 2.0 s cadence). */
  cadence?: number;
  /** Trial length in seconds. */
  duration?: number;
  rules?: RuleSet;
}

export interface BenchResult {
  /** First second the barrier reached zero, or undefined. */
  downAt?: number;
  /** Second the hull reached zero, or undefined. */
  killedAt?: number;
  /** Lowest barrier fraction seen. */
  minBarrierFrac: number;
  /** Hull fraction at the end (0 when killed). */
  hullFracAtEnd: number;
  /** Per-second barrier fraction trace. */
  trace: number[];
}

/** A stationary target hull built from the catalogue through the real simulation constructor. */
function bareTarget(classId: 'reaper_capital' | 'harbinger', rules: RuleSet): ShipState {
  const sim = new BattleSimulation(
    buildCustomBattle(
      {
        seed: 1,
        rulesId: rules.id,
        environment: 'deep_space',
        startingDistanceKm: 240,
        maxDuration: 60,
        sideA: { faction: 'alliance', name: 'bench', formation: 'line_abreast', counts: { alliance_frigate: 1 } },
        sideB: { faction: 'reaper', name: 'target', formation: 'capital_column', counts: { [classId]: 1 } },
      },
      rules,
    ),
  );
  return sim.ships.find((s) => s.classId === classId)!;
}

/**
 * The analytic benchmark (BALANCE_AUDIT.md §5): N full dreadnought rounds every
 * `cadence` seconds against a stationary Reaper hull, `applyDamage` for the hit
 * and the M1 recovery formula applied every `SIM_DT` between volleys.
 */
export function barrierBench(opts: BenchOptions): BenchResult {
  const rules = opts.rules ?? CANON_ME3;
  const target = bareTarget(opts.target ?? 'reaper_capital', rules);
  const gun = applyRulesToWeapon(WEAPONS.alliance_dn_main, 'alliance', getShipClass('alliance_dreadnought'), rules, WEAPONS);
  const rng = new Rng(opts.seed ?? 1);
  const hitChance = opts.hitChance ?? 1;
  const cadence = opts.cadence ?? 2;
  const duration = opts.duration ?? 240;
  const steps = Math.round(duration / SIM_DT);
  const volleyEvery = Math.round(cadence / SIM_DT);
  const out: BenchResult = { minBarrierFrac: 1, hullFracAtEnd: 1, trace: [] };
  for (let i = 1; i <= steps; i++) {
    const t = i * SIM_DT;
    if (i % volleyEvery === 0) {
      for (let n = 0; n < opts.dreadnoughts; n++) {
        if (hitChance < 1 && !rng.chance(hitChance)) continue;
        const r = applyDamage(target, gun.damage, gun, rng, t);
        if (r.barriersCollapsed && out.downAt === undefined) out.downAt = t;
        if (r.destroyed) {
          out.killedAt = t;
          break;
        }
      }
    }
    if (!target.alive) break;
    // M1 between volleys: full recovery after a 3 s pause, the under-fire fraction otherwise.
    const frac = t - target.lastHitAt > 3 ? 1 : target.barrierRegenUnderFire;
    if (frac > 0 && target.barriers < target.maxBarriers) target.barriers = Math.min(target.maxBarriers, target.barriers + target.barrierRegen * frac * SIM_DT);
    out.minBarrierFrac = Math.min(out.minBarrierFrac, target.barriers / target.maxBarriers);
    if (i % Math.round(1 / SIM_DT) === 0) out.trace.push(target.barriers / target.maxBarriers);
  }
  out.hullFracAtEnd = target.alive ? target.hull / target.maxHull : 0;
  return out;
}

// ------------------------------------------------------------------ live duels

export interface DuelOptions {
  a: Record<string, number>;
  b: Record<string, number>;
  seed: number;
  rulesId?: string;
  distanceKm?: number;
  maxDuration?: number;
  aFaction?: 'alliance' | 'turian' | 'asari' | 'salarian' | 'quarian' | 'geth' | 'cerberus';
  aFormation?: 'line_abreast' | 'strike_wedge' | 'defensive_screen' | 'dispersed';
}

/** Two-fleet custom battle (deep space, 40 km by default): side A organic, side B Reaper. */
export function duelConfig(o: DuelOptions) {
  return buildCustomBattle({
    seed: o.seed,
    rulesId: o.rulesId ?? 'canon_me3',
    environment: 'deep_space',
    startingDistanceKm: o.distanceKm ?? 40,
    maxDuration: o.maxDuration ?? 600,
    sideA: { faction: o.aFaction ?? 'alliance', name: 'A', formation: o.aFormation ?? 'line_abreast', counts: o.a },
    sideB: { faction: 'reaper', name: 'B', formation: 'capital_column', counts: o.b },
  });
}

/** Silence every mount of a side (infinite cooldowns), including craft launched later. */
export function mute(sim: BattleSimulation, side: Side): void {
  const muted = new Set<string>();
  const apply = () => {
    for (const s of sim.ships) {
      if (s.side !== side || muted.has(s.id)) continue;
      muted.add(s.id);
      for (const w of s.weapons) w.cooldown = Infinity;
    }
  };
  apply();
  const prev = sim.onEvent;
  sim.onEvent = (e) => {
    if (e.type === 'ship_deployed' && sim.getShip(e.shipId)?.side === side) apply();
    prev?.(e);
  };
}

export interface DuelRecord {
  winner: Side | 'draw';
  duration: number;
  /** Lowest barrier fraction of the first side-B hull. */
  minBarrierFrac: number;
  /** First time that hull's barrier reached zero. */
  downAt?: number;
  /** Time that hull was destroyed. */
  killedAt?: number;
  /** Side-A hulls (non-fighter) destroyed. */
  aLost: number;
  /** Side-A dreadnoughts destroyed. */
  aDreadnoughtsLost: number;
  bCapitalsLost: number;
  /** Any side-A dreadnought ever `overheated`. */
  aDreadnoughtOverheated: boolean;
  /** Peak heat fraction over side-A dreadnoughts. */
  aDreadnoughtPeakHeat: number;
  /** Spinal (anti-capital, arc ≤ 20) hit fraction of side A. */
  spinalHitFrac: number;
  hades: HadesStats;
  reaperLossesByCause: Record<string, number>;
  oculusStats?: { lastSmallCraftDeath?: number; tridentsLost: number; oculiLost: number };
}

export interface HadesStats {
  /** HADES rounds that left a Titan gun. */
  fired: number;
  /** Titan shots at a Reaper capital fired as slugs while the mount still had penetrators (the gate held them). */
  held: number;
  /** Warheads that detonated. */
  detonated: number;
}

/** Collect the HADES counters from the event stream (sim state is read at emission time). */
export function hadesCounter(sim: BattleSimulation): HadesStats {
  const stats: HadesStats = { fired: 0, held: 0, detonated: 0 };
  const prev = sim.onEvent;
  sim.onEvent = (e: BattleEvent) => {
    if (e.type === 'weapon_fired' && e.weaponId === 'apex_hyper_ma') {
      if (e.special) stats.fired++;
      else {
        const shooter = sim.getShip(e.shipId);
        const target = sim.getShip(e.targetId);
        if (target?.role === 'reaper_capital' && (shooter?.weapons[e.weaponIndex]?.specialAmmo ?? 0) > 0) stats.held++;
      }
    }
    if (e.type === 'hades_detonation') stats.detonated++;
    prev?.(e);
  };
  return stats;
}

/**
 * Step a battle to its end (or `untilTime`) while recording the duel metrics.
 * `onStep` lets a caller yield to the event loop between chunks (tests).
 */
export function runInstrumented(sim: BattleSimulation, opts: { untilTime?: number } = {}): DuelRecord {
  const hades = hadesCounter(sim);
  const target = sim.ships.find((s) => s.side === 'B');
  const dreadnoughts = () => sim.ships.filter((s) => s.side === 'A' && (s.role === 'dreadnought' || s.role === 'super_dreadnought'));
  let minBarrierFrac = 1;
  let downAt: number | undefined;
  let overheated = false;
  let peakHeat = 0;
  const limit = opts.untilTime ?? Infinity;
  while (!sim.finished && sim.time < limit) {
    sim.step();
    if (target) {
      const f = target.maxBarriers > 0 ? target.barriers / target.maxBarriers : 0;
      minBarrierFrac = Math.min(minBarrierFrac, f);
      if (downAt === undefined && target.barriers <= 0) downAt = sim.time;
    }
    for (const d of dreadnoughts()) {
      if (d.overheated) overheated = true;
      peakHeat = Math.max(peakHeat, d.heatCapacity > 0 ? d.heat / d.heatCapacity : 0);
    }
  }
  return finishRecord(sim, { hades, minBarrierFrac, downAt, overheated, peakHeat, target });
}

/** The same as `runInstrumented`, yielding every `chunkSteps` steps (for the 60 s worker limit in tests). */
export async function runInstrumentedAsync(sim: BattleSimulation, opts: { untilTime?: number; chunkSteps?: number } = {}): Promise<DuelRecord> {
  const hades = hadesCounter(sim);
  const target = sim.ships.find((s) => s.side === 'B');
  const dreadnoughts = () => sim.ships.filter((s) => s.side === 'A' && (s.role === 'dreadnought' || s.role === 'super_dreadnought'));
  let minBarrierFrac = 1;
  let downAt: number | undefined;
  let overheated = false;
  let peakHeat = 0;
  const limit = opts.untilTime ?? Infinity;
  const chunk = opts.chunkSteps ?? 200;
  while (!sim.finished && sim.time < limit) {
    for (let i = 0; i < chunk && !sim.finished && sim.time < limit; i++) {
      sim.step();
      if (target) {
        const f = target.maxBarriers > 0 ? target.barriers / target.maxBarriers : 0;
        minBarrierFrac = Math.min(minBarrierFrac, f);
        if (downAt === undefined && target.barriers <= 0) downAt = sim.time;
      }
      for (const d of dreadnoughts()) {
        if (d.overheated) overheated = true;
        peakHeat = Math.max(peakHeat, d.heatCapacity > 0 ? d.heat / d.heatCapacity : 0);
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return finishRecord(sim, { hades, minBarrierFrac, downAt, overheated, peakHeat, target });
}

function finishRecord(sim: BattleSimulation, m: { hades: HadesStats; minBarrierFrac: number; downAt?: number; overheated: boolean; peakHeat: number; target?: ShipState }): DuelRecord {
  const r = sim.result;
  const a = sim.ships.filter((s) => s.side === 'A' && s.role !== 'fighter');
  // Spinal guns: dreadnought-class accelerators (anti-capital, arc ≤ 20, ≥ 600 points a round). An impact carries
  // no weapon id, so a kinetic impact of ≥ 600 points by a side-A hull is taken as a spinal hit (broadsides,
  // cruiser and frigate rounds stay under 600 under every preset; Thanix is a beam and never impacts).
  const spinal = sim.ships.filter((s) => s.side === 'A').flatMap((s) => s.weapons.filter((w) => w.def.antiCapital && w.def.arc <= 20 && w.def.kind === 'mass_accelerator' && w.def.damage >= 600));
  const spinalIds = new Set(spinal.map((w) => w.def.id));
  const spinalShots = sim.events.filter((e) => e.type === 'weapon_fired' && spinalIds.has(e.weaponId) && sim.getShip(e.shipId)?.side === 'A');
  const spinalHits = sim.events.filter((e) => e.type === 'projectile_impact' && e.damageType === 'kinetic' && e.damage >= 600 && sim.getShip(e.shipId)?.side === 'A');
  const byCause: Record<string, number> = {};
  for (const e of sim.events) if (e.type === 'ship_destroyed' && e.faction === 'reaper' && e.role !== 'fighter') byCause[e.cause] = (byCause[e.cause] ?? 0) + 1;
  const small = sim.events.filter((e) => e.type === 'ship_destroyed' && e.role === 'fighter');
  return {
    winner: r?.winner ?? 'draw',
    duration: sim.time,
    minBarrierFrac: m.minBarrierFrac,
    downAt: m.downAt,
    killedAt: m.target && !m.target.alive ? m.target.destroyedAt : undefined,
    aLost: a.filter((s) => !s.alive).length,
    aDreadnoughtsLost: a.filter((s) => (s.role === 'dreadnought' || s.role === 'super_dreadnought') && !s.alive).length,
    bCapitalsLost: sim.ships.filter((s) => s.side === 'B' && s.role === 'reaper_capital' && !s.alive).length,
    aDreadnoughtOverheated: m.overheated,
    aDreadnoughtPeakHeat: m.peakHeat,
    spinalHitFrac: spinalShots.length > 0 ? spinalHits.length / spinalShots.length : 0,
    hades: m.hades,
    reaperLossesByCause: byCause,
    oculusStats: small.length > 0 ? { lastSmallCraftDeath: Math.max(...small.map((e) => e.t)), tridentsLost: small.filter((e) => e.type === 'ship_destroyed' && e.classId === 'alliance_fighter').length, oculiLost: small.filter((e) => e.type === 'ship_destroyed' && e.classId === 'reaper_oculus').length } : undefined,
  };
}

// ------------------------------------------------------------ reference runs

/** The reference engagement (fixed fleets) under a preset, or the Battle of Earth. */
export function referenceSim(scenario: 'alliance_fleet_engagement' | 'battle_of_earth' | 'prime_apex_sol_defence' | 'final_battle_of_earth', rulesId: string, seed: number): BattleSimulation {
  const ws: Record<string, string> = scenario === 'alliance_fleet_engagement' ? { fleet_scaling: 'fixed' } : scenario === 'final_battle_of_earth' ? { forces: 'default' } : {};
  return new BattleSimulation(buildScenario(scenario, rulesId, seed, ws));
}

/** The isolated Oculus screen: one carrier (24 Tridents) against one capital re-stocked with 24 Oculi, hulls muted, both sides on fighters. */
export function oculusScreen(seed: number): BattleSimulation {
  const sim = new BattleSimulation(duelConfig({ a: { alliance_carrier: 1 }, b: { reaper_capital: 1 }, seed, distanceKm: 40, maxDuration: 400 }));
  const capital = sim.ships.find((s) => s.classId === 'reaper_capital')!;
  const carrier = sim.ships.find((s) => s.classId === 'alliance_carrier')!;
  capital.hangar!.remaining = 24;
  for (const w of capital.weapons) w.cooldown = Infinity;
  for (const w of carrier.weapons) w.cooldown = Infinity;
  sim.issueOrders('custom-a', { priority: 'fighters' });
  sim.issueOrders('custom-b', { priority: 'fighters' });
  return sim;
}
