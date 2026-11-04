import type { ShipState, Side } from './types';

/**
 * Flights (ADOPTION_PLAN.md §21.3; WORK_BREAKDOWN.md T11). When a side's live small craft — fighters and Oculi,
 * flight members counted — would exceed `FLIGHT_THRESHOLD`, every further launch creates a flight instead of single
 * craft: one `ShipState` (a persistent squadron object with its own id, brief §17) carrying `flight: { classId,
 * craft, maxCraft }`, a hull pool of `maxCraft × craft hull`, the armour and barriers of one craft, `maxCraft ×` the
 * point value and the craft's speed and turn. Damage removes one member per craft hull lost (`flight_member_lost`),
 * each mount fires one shot per member per volley (one `weapon_fired` with `shots`), target scoring weighs a flight
 * as its members, results count craft, and a recovered flight returns its surviving members to the hangar. Every
 * decision depends only on live counts at launch time: no randomness here.
 */
export const FLIGHT_THRESHOLD = 64;
export const FLIGHT_SIZE = 4;

/** A small craft simulated as several (two or more members). */
export const isFlight = (ship: ShipState): boolean => ship.flight !== undefined && ship.flight.maxCraft > 1;

/** Small craft a hull stands for: a flight's live members, any other craft 1, every other hull 0. */
export const craftCount = (ship: ShipState): number => (ship.role !== 'fighter' ? 0 : ship.flight ? ship.flight.craft : 1);

/** Live, present small craft of a side (flight members counted). */
export function liveCraft(ships: readonly ShipState[], side: Side): number {
  let n = 0;
  for (const s of ships) if (s.side === side && s.alive && !s.escaped) n += craftCount(s);
  return n;
}

/** Whether a launch of `n` craft becomes flights: the side would field more than `FLIGHT_THRESHOLD` live craft. */
export const launchAsFlights = (live: number, n: number): boolean => live + n > FLIGHT_THRESHOLD;

/**
 * Split a launch of `n` craft into launch units: single craft below the threshold, otherwise flights of up to
 * `FLIGHT_SIZE` (a lone remainder of one flies as a single craft).
 */
export function launchUnits(live: number, n: number): number[] {
  if (n <= 0) return [];
  if (!launchAsFlights(live, n)) return Array.from({ length: n }, () => 1);
  const units: number[] = [];
  let left = n;
  while (left > 0) {
    const k = Math.min(FLIGHT_SIZE, left);
    units.push(k);
    left -= k;
  }
  return units;
}

/** Turn a freshly built craft into a flight of `craft` members (hull pool and points scale; armour and barriers stay per craft). */
export function formFlight(ship: ShipState, craft: number): void {
  if (craft <= 1) return;
  ship.flight = { classId: ship.classId, craft, maxCraft: craft };
  ship.maxHull *= craft;
  ship.hull = ship.maxHull;
  ship.pointValue *= craft;
}

/** Hull of one member of a flight. */
export const memberHull = (ship: ShipState): number => (ship.flight ? ship.maxHull / ship.flight.maxCraft : ship.maxHull);

/** Members a flight's hull pool still carries (0 once the pool is gone). */
export function membersLeft(ship: ShipState): number {
  if (!ship.flight) return ship.alive ? 1 : 0;
  if (ship.hull <= 0) return 0;
  return Math.min(ship.flight.craft, Math.max(1, Math.ceil(ship.hull / memberHull(ship) - 1e-9)));
}
