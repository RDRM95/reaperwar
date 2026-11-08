import type { BattleEvent } from '@/simulation/types';

/**
 * Render-side batching of a frame's simulation events at high playback speed (brief §19.1: "ticks batched per frame
 * without rendering intermediate steps"; docs/apex/PLAYBACK_PERF.md finding 5).
 *
 * At 4× and above a display frame runs several ticks, so the view receives their events in one batch. Spawning an
 * effect for each of them makes the effect count scale with the speed (effects live in real seconds, their causes
 * arrive in simulated seconds): 802 sparks and 441 debris pieces in the Final Battle's 8× window against 460 and 90
 * at 1×. This module groups the batch so that the view spawns one muzzle flash per firing ship (its newest shot), one
 * impact per target with the batch's damage merged into it, a bounded number of missile intercepts, and every
 * destruction, and counts what it merged.
 *
 * Pure and Node-testable. It reads events and never writes them: the simulation's own log (`sim.events`) is not
 * touched, so the result, the destruction log and the event order are the same whatever the speed; only what is
 * drawn for them changes.
 */

export type WeaponFiredEvent = Extract<BattleEvent, { type: 'weapon_fired' }>;
export type ProjectileImpactEvent = Extract<BattleEvent, { type: 'projectile_impact' }>;
export type MissileInterceptedEvent = Extract<BattleEvent, { type: 'missile_intercepted' }>;

/** A target's impacts of one frame, merged: the newest event carries the position and damage type, the sums the size. */
export interface MergedImpact {
  /** The newest impact on the target. */
  last: ProjectileImpactEvent;
  barrierDamage: number;
  hullDamage: number;
  /** Impacts merged into this one. */
  count: number;
}

export interface EventBatch {
  /** Newest `weapon_fired` per firing ship, in the order the ships first fired. */
  fires: WeaponFiredEvent[];
  /** Impacts merged per target, in the order the targets were first hit. */
  impacts: MergedImpact[];
  /** Missile intercepts kept (the first MAX_INTERCEPTS of the frame). */
  intercepts: MissileInterceptedEvent[];
  /** Every other event, in order (every `ship_destroyed` among them: a destruction is never merged away). */
  rest: BattleEvent[];
  /** Events the batch merged or dropped from the effects (not from the log): the figure the performance HUD shows. */
  merged: number;
  /** Events in the frame. */
  total: number;
}

/** From this many events in one frame the view batches whatever the speed (an external advance, a long stall). */
export const BATCH_EVENT_THRESHOLD = 300;
/** Missile intercept flashes drawn per batched frame at most. */
export const MAX_INTERCEPTS = 12;

/** Group one frame's events for the effects (see the module comment). `events` is read only. */
export function batchEvents(events: readonly BattleEvent[]): EventBatch {
  const fires = new Map<string, WeaponFiredEvent>();
  const impacts = new Map<string, MergedImpact>();
  const intercepts: MissileInterceptedEvent[] = [];
  const rest: BattleEvent[] = [];
  let merged = 0;
  for (const e of events) {
    switch (e.type) {
      case 'weapon_fired':
        if (fires.has(e.shipId)) merged++;
        fires.set(e.shipId, e);
        break;
      case 'projectile_impact': {
        const m = impacts.get(e.targetId);
        if (m) {
          m.last = e;
          m.barrierDamage += e.barrierDamage;
          m.hullDamage += e.hullDamage;
          m.count++;
          merged++;
        } else impacts.set(e.targetId, { last: e, barrierDamage: e.barrierDamage, hullDamage: e.hullDamage, count: 1 });
        break;
      }
      case 'missile_intercepted':
        if (intercepts.length < MAX_INTERCEPTS) intercepts.push(e);
        else merged++;
        break;
      default:
        rest.push(e);
        break;
    }
  }
  return { fires: [...fires.values()], impacts: [...impacts.values()], intercepts, rest, merged, total: events.length };
}
