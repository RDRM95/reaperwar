import type { Rng } from '@/core/rng';
import { AU_SCENARIO_SUFFIX, apexCaption, formatCount } from '@/data/apexScale';
import type { BattleConfig, BattleEvent, DistantGroup, DistantLayerConfig, DistantState, ShipState, Side } from './types';

export type { DistantGroup, DistantGroupState, DistantLayerConfig, DistantState } from './types';

/**
 * The distant engagement layer (ADOPTION_PLAN.md §13.3, §4.4; CINEMATIC_DESIGN.md §5.1; WORK_BREAKDOWN.md T15): the
 * part of the war the live simulation does not field, as statistics — groups whose counts tick down with the real
 * battle's tempo, for the far drive lights and tracer sparks, the HUD counter and the captions. It is isolated from
 * the real outcome by construction: it advances at the very end of `step()` (after `checkEnd`), reads only a view of
 * the real battle, draws only from its own child generator (`sim.rng.fork('distant')`, taken once in the constructor
 * — forking draws nothing from the main stream) and writes only its own state and `distant_*` events, which nothing
 * in the simulation reads. `BattleResult` ignores it. Under canon it carries no absolute numbers (captions say
 * "statistical", the counter shows percentages); under the Apex scenarios its counts are AU scenario values.
 */

/** The model's constants (AP §13.3). */
export const DISTANT = {
  /** Loss rate per group per second: `baseRate × pressure + realLossWeight × realLoss / realLossWindow`. */
  baseRate: 0.0009,
  realLossWeight: 0.6,
  /** The real-loss window (s): the fraction of a side's deployed combat hulls destroyed in the last 20 s. */
  realLossWindow: 20,
  /** `pressure = clamp(enemy points / own points, 0.3, 3)`. */
  pressureMin: 0.3,
  pressureMax: 3,
  /** No distant losses before the first real `ship_destroyed` or this many seconds, whichever comes first. */
  firstLossAfter: 30,
  /** `distant_update` cadence (s). */
  updateEvery: 5,
  /** A group below this fraction of its count is broken (`distant_group_broken`, once). */
  brokenBelow: 0.1,
  /** `firingRate`: the share of the side's live combat hulls that fired in the last 2 s. */
  engagedWindow: 2,
} as const;

/** What a resolver sees of one side of the real battle (plain numbers; never the simulation itself). */
export interface DistantSideView {
  pressure: number;
  realLoss: number;
  engagedFraction: number;
}

/** What a resolver sees of the real battle in one step. */
export interface DistantBattleView {
  time: number;
  dt: number;
  /** Losses may start: the first real `ship_destroyed` has happened or `firstLossAfter` has passed. */
  lossesActive: boolean;
  sides: Record<Side, DistantSideView>;
}

/**
 * A distant-engagement resolver — the seam a later multi-scale sector resolver implements (brief §17, INTEGRATION_NOTES:
 * the distant layer as a sector-resolver seam). It advances the groups' state from the view, drawing only from `rng`.
 * `STATISTICAL_RESOLVER` is the V2 model of AP §13.3.
 */
export interface DistantResolver {
  readonly id: string;
  advance(groups: readonly DistantGroup[], state: DistantState, view: DistantBattleView, rng: Rng): void;
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** The V2 model (AP §13.3): per group and second `λ = 0.0009 × pressure + 0.6 × realLoss / 20`, stochastic rounding. */
export const STATISTICAL_RESOLVER: DistantResolver = {
  id: 'statistical',
  advance(groups, state, view, rng) {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const s = state.groups[i];
      const side = view.sides[g.side];
      s.firingRate = clamp(side.engagedFraction, 0, 1);
      if (!view.lossesActive || s.remaining <= 0) continue;
      const lambda = DISTANT.baseRate * side.pressure + (DISTANT.realLossWeight * side.realLoss) / DISTANT.realLossWindow;
      const expected = s.remaining * lambda * view.dt;
      const whole = Math.floor(expected);
      const n = Math.min(s.remaining, whole + (rng.chance(expected - whole) ? 1 : 0));
      s.remaining -= n;
      s.losses += n;
    }
  },
};

/** A fresh state for a layer config: every group at its full count. */
export function createDistantState(cfg: DistantLayerConfig): DistantState {
  return { groups: cfg.groups.map((g) => ({ id: g.id, remaining: Math.max(0, Math.round(g.count)), losses: 0, firingRate: 0 })), lastUpdate: 0 };
}

/** What the layer reads from the simulation (`battle.ts` builds it once). */
export interface DistantHost {
  readonly time: number;
  readonly ships: readonly ShipState[];
  readonly events: readonly BattleEvent[];
  pending(ship: ShipState): boolean;
  emit(e: BattleEvent): void;
}

const isDistantEvent = (e: BattleEvent): boolean => e.type === 'distant_update' || e.type === 'distant_group_broken';

/** The runtime of an enabled layer: the state, its generator and the bookkeeping that builds the view each step. */
export class DistantLayer {
  readonly state: DistantState;
  private readonly cfg: DistantLayerConfig;
  private readonly rng: Rng;
  private readonly resolver: DistantResolver;
  private cursor = 0;
  private firstRealLossAt: number | undefined;
  private readonly lossTimes: Record<Side, number[]> = { A: [], B: [] };
  private readonly lastFired = new Map<string, number>();
  private readonly broken = new Set<string>();

  constructor(cfg: DistantLayerConfig, rng: Rng, resolver: DistantResolver = STATISTICAL_RESOLVER) {
    this.cfg = cfg;
    this.rng = rng;
    this.resolver = resolver;
    this.state = createDistantState(cfg);
  }

  /** One step, after `checkEnd`. `final`: the battle ended this step — the last `distant_update` is emitted. */
  advance(host: DistantHost, dt: number, final = false): void {
    const t = host.time;
    // The real events since the last step: losses of combat hulls by side, the first real loss, who fired.
    const events = host.events;
    for (; this.cursor < events.length; this.cursor++) {
      const e = events[this.cursor];
      if (e.type === 'ship_destroyed') {
        this.firstRealLossAt ??= e.t;
        if (e.role !== 'fighter') this.lossTimes[e.side].push(e.t);
      } else if (e.type === 'weapon_fired') this.lastFired.set(e.shipId, e.t);
    }
    const view: DistantBattleView = {
      time: t,
      dt,
      lossesActive: this.firstRealLossAt !== undefined || t >= (this.cfg.firstLossAfter ?? DISTANT.firstLossAfter) - 1e-9,
      sides: { A: this.sideView(host, 'A', t), B: this.sideView(host, 'B', t) },
    };
    this.resolver.advance(this.cfg.groups, this.state, view, this.rng);
    this.cfg.groups.forEach((g, i) => {
      const s = this.state.groups[i];
      if (!this.broken.has(g.id) && g.count > 0 && s.remaining < DISTANT.brokenBelow * g.count) {
        this.broken.add(g.id);
        host.emit({ t, type: 'distant_group_broken', id: g.id });
      }
    });
    if (t >= this.state.lastUpdate + DISTANT.updateEvery - 1e-9 || (final && t > this.state.lastUpdate)) {
      this.state.lastUpdate = t;
      host.emit({ t, type: 'distant_update', groups: this.state.groups.map((s) => ({ id: s.id, remaining: s.remaining, losses: s.losses })) });
    }
    // Our own events were appended after the scan: skip them next step.
    this.cursor = events.length;
  }

  /** One side of the real battle: pressure from the live points, real losses in the window, the engaged share. */
  private sideView(host: DistantHost, side: Side, t: number): DistantSideView {
    let deployed = 0;
    let live = 0;
    let engaged = 0;
    let own = 0;
    let enemy = 0;
    for (const s of host.ships) {
      if (s.role === 'fighter' || host.pending(s)) continue;
      const alive = s.alive && !s.escaped;
      if (s.side !== side) {
        if (alive) enemy += s.pointValue;
        continue;
      }
      deployed++;
      if (!alive) continue;
      live++;
      own += s.pointValue;
      const f = this.lastFired.get(s.id);
      if (f !== undefined && f >= t - DISTANT.engagedWindow - 1e-9) engaged++;
    }
    const times = this.lossTimes[side];
    while (times.length > 0 && times[0] < t - DISTANT.realLossWindow) times.shift();
    return {
      pressure: own > 0 ? clamp(enemy / own, DISTANT.pressureMin, DISTANT.pressureMax) : DISTANT.pressureMax,
      realLoss: deployed > 0 ? times.length / deployed : 0,
      engagedFraction: live > 0 ? engaged / live : 0,
    };
  }
}

/** The real event log without the layer's own events (what `BattleResult.eventCount` counts). */
export const realEventCount = (events: readonly BattleEvent[]): number => {
  let n = 0;
  for (const e of events) if (!isDistantEvent(e)) n++;
  return n;
};

/** Per side: what is left of the distant groups (the HUD counter, the results line). Empty without an enabled layer. */
export function distantSummary(sim: { config: BattleConfig; distant?: DistantState }): { side: Side; remainingPercent: number; remaining: number; losses: number; captioned: boolean }[] {
  const cfg = sim.config.distant;
  const st = sim.distant;
  if (!cfg?.enabled || !st) return [];
  const captioned = cfg.captions === 'apex';
  const out: { side: Side; remainingPercent: number; remaining: number; losses: number; captioned: boolean }[] = [];
  for (const side of ['A', 'B'] as const) {
    let count = 0;
    let remaining = 0;
    let losses = 0;
    cfg.groups.forEach((g, i) => {
      if (g.side !== side) return;
      count += Math.max(0, Math.round(g.count));
      remaining += st.groups[i].remaining;
      losses += st.groups[i].losses;
    });
    if (count > 0) out.push({ side, remainingPercent: (100 * remaining) / count, remaining, losses, captioned });
  }
  return out;
}

/** How a side's distant groups are named in a caption without numbers. */
function sideWords(cfg: DistantLayerConfig, side: Side): string {
  const groups = cfg.groups.filter((g) => g.side === side);
  if (groups.length > 0 && groups.every((g) => g.faction === 'reaper')) return 'REAPER ARMADA';
  return side === 'A' ? 'ALLIED ECHELONS' : 'HOSTILE ECHELONS';
}

/**
 * The layer's captions (AP §15): under the Apex scenarios the AU scale figures with the live simulated count, each
 * ending in `· AU SCENARIO VALUE`; under every other rule set one line without a single digit (no canon source gives a
 * hull count); none when the layer is off or `captions: 'none'`.
 */
export function distantCaptions(sim: { config: BattleConfig; simulatedHullCount(side?: Side): number }): string[] {
  const cfg = sim.config.distant;
  if (!cfg?.enabled) return [];
  switch (cfg.captions) {
    case 'apex':
      return [apexCaption('warships', sim.simulatedHullCount('A')), apexCaption('reapers', sim.simulatedHullCount('B'))];
    case 'canon':
      return [`DISTANT ENGAGEMENT · STATISTICAL · ${sideWords(cfg, 'A')} vs ${sideWords(cfg, 'B')}`];
    case 'none':
      return [];
  }
}

/** The results screen's line (AP §13.3, §15): `DISTANT ENGAGEMENT (STATISTICAL)`, counts plus the AU suffix under Apex, percentages otherwise. */
export function distantResultLine(sim: { config: BattleConfig; distant?: DistantState }): string | undefined {
  const rows = distantSummary(sim);
  if (rows.length === 0) return undefined;
  if (rows[0].captioned) {
    const parts = rows.map((r) => `${r.side}: ${formatCount(r.remaining)} remaining, ${formatCount(r.losses)} lost`);
    return `DISTANT ENGAGEMENT (STATISTICAL) · ${parts.join(' · ')} ${AU_SCENARIO_SUFFIX}`;
  }
  return `DISTANT ENGAGEMENT (STATISTICAL) · ${rows.map((r) => `${r.side} ${Math.round(r.remainingPercent)} %`).join(' · ')}`;
}

