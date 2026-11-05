import type { CommsEvent } from '@/data/factions';
import type { DamageType } from '@/data/types';
import type { ArrivalProfile, BattleEvent, DestructionCause, FleetOrders, FleetSpec, FleetState, ShipState, Side } from './types';

/**
 * The simulation's internal plumbing for the beat scheduler (`beats.ts`) and the scripted specials (`specials.ts`):
 * closures over `BattleSimulation`'s private methods, so the public surface (WORK_BREAKDOWN.md §1.3.5) stays as the
 * contract lists it. Not for the render, UI or showcase stages: they use `sim.special`, `sim.orderVolley`,
 * `sim.issueOrders` and the event log.
 */
export interface SimKernel {
  emit(e: BattleEvent): void;
  destroyShip(ship: ShipState, killer?: ShipState, cause?: DestructionCause | DamageType, weaponId?: string): void;
  comms(side: Side | undefined, kind: CommsEvent, shipName?: string, fleet?: FleetState): void;
  noteFlightLosses(ship: ShipState): void;
  /** Whether a hull is still waiting for its arrival flash (inert). */
  pending(ship: ShipState): boolean;
  /** Tactical withdrawal to the hull's recovery station, with `ship_withdrawing`. */
  withdraw(ship: ShipState): void;
  /** Deploys an `arrivalMode: 'beat'` fleet through the arrival kinematics (once; undefined when already deployed). */
  spawnBeatFleet(spec: FleetSpec, opts: { stagger?: number; run?: Partial<ArrivalProfile> }): FleetState | undefined;
  /** Applies an order patch; `'beat'` passes the player lock and spares scripted forced targets. */
  applyOrders(fleetId: string, patch: Partial<FleetOrders>, source: 'beat' | 'player'): 'issued' | 'rejected';
}
