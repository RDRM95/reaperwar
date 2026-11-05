import type { Rng } from '@/core/rng';
import { clone } from '@/core/vec3';
import { TRANSMISSIONS, transmissionKey, type TransmissionSet } from '@/data/transmissions';
import type { DamageType } from '@/data/types';
import type { EffectiveWeapon } from '@/timelines/rules';
import type { BattleEvent, DestructionCause, FlagshipEventBase, ShipState } from './types';

/**
 * The flagship events (ADOPTION_PLAN.md §22.2; WORK_BREAKDOWN.md §1.3.7, T13): `flagship_destroyed` right after the
 * `ship_destroyed` of a flagship, `flagship_mission_kill` from `Specials.missionKill`; each at most once per ship
 * (`ShipState.flagshipEvents`). The final transmission and the fleet reaction are original text
 * (`src/data/transmissions.ts`) drawn from `sim.rng` in step order.
 */

/** Hits a flagship took in its last seconds count as the "final salvo" (AP §22.2: the last 3 s). */
export const FINAL_SALVO_SECONDS = 3;

/** The damage types a destruction cause carries (a scripted or drive-attack destruction carries none). */
const DAMAGE_TYPES: ReadonlySet<string> = new Set<DamageType>(['kinetic', 'thanix_stream', 'laser', 'warhead', 'reaper_beam']);
export const isDamageType = (cause: string): cause is DamageType => DAMAGE_TYPES.has(cause);

/** `'harbinger'` for Harbinger, `'flagship'` for every other flagship, undefined for an ordinary hull. */
export function flagshipTier(ship: ShipState): 'harbinger' | 'flagship' | undefined {
  if (!ship.flagship) return undefined;
  return ship.classId === 'harbinger' || ship.name === 'Harbinger' ? 'harbinger' : 'flagship';
}

/** Flagships named by `NAMED_FLAGSHIPS` on a class without its own transmission set fall back by name. */
const BY_NAME: Record<string, keyof typeof TRANSMISSIONS> = {
  Harbinger: 'harbinger',
  Sovereign: 'sovereign',
  'Destiny Ascension': 'destiny_ascension',
  'SSV Normandy SR-2': 'normandy_sr2',
  'SSV Normandy Valkyrie': 'normandy_valkyrie',
};

function transmissionsOf(ship: ShipState): TransmissionSet | undefined {
  const key = transmissionKey(ship) ?? BY_NAME[ship.name];
  return key ? TRANSMISSIONS[key] : undefined;
}

const pickLine = (rng: Rng, lines: readonly string[] | undefined): string => (lines && lines.length > 0 ? rng.pick(lines) : '');

/** Hits taken within the final-salvo window before `time` (from `ShipState.recentHitTimes`). */
export function finalSalvoHits(ship: ShipState, time: number): number {
  let n = 0;
  for (const t of ship.recentHitTimes) if (t >= time - FINAL_SALVO_SECONDS - 1e-9) n++;
  return n;
}

function base(ship: ShipState, tier: 'harbinger' | 'flagship', transmission: string, reaction: string): FlagshipEventBase {
  return { shipId: ship.id, name: ship.name, classId: ship.classId, faction: ship.faction, side: ship.side, pos: clone(ship.pos), tier, transmission, reaction };
}

/**
 * The `flagship_destroyed` event of a flagship that just died, or undefined (not a flagship, or already reported).
 * Marks the ship so a second call returns undefined. `weapon` is the killing mount's definition (its `name` becomes
 * `killer.weaponName`).
 */
export function flagshipDestroyedEvent(
  rng: Rng,
  time: number,
  ship: ShipState,
  killer: ShipState | undefined,
  cause: DestructionCause | DamageType,
  weapon: Pick<EffectiveWeapon, 'id' | 'name'> | undefined,
): Extract<BattleEvent, { type: 'flagship_destroyed' }> | undefined {
  const tier = flagshipTier(ship);
  if (!tier || ship.flagshipEvents.destroyed) return undefined;
  ship.flagshipEvents.destroyed = true;
  const set = transmissionsOf(ship);
  const transmission = pickLine(rng, set?.destroyed);
  const reaction = pickLine(rng, set?.reaction);
  return {
    t: time,
    type: 'flagship_destroyed',
    ...base(ship, tier, transmission, reaction),
    ...(killer
      ? { killer: { shipId: killer.id, name: killer.name, classId: killer.classId, faction: killer.faction, ...(weapon ? { weaponId: weapon.id, weaponName: weapon.name } : {}) } }
      : {}),
    ...(isDamageType(cause) ? { damageType: cause } : {}),
    finalSalvoHits: finalSalvoHits(ship, time),
  };
}

/** The `flagship_mission_kill` event of a flagship just mission-killed, or undefined (not a flagship, or already reported). */
export function flagshipMissionKillEvent(rng: Rng, time: number, ship: ShipState): Extract<BattleEvent, { type: 'flagship_mission_kill' }> | undefined {
  const tier = flagshipTier(ship);
  if (!tier || ship.flagshipEvents.missionKill) return undefined;
  ship.flagshipEvents.missionKill = true;
  const set = transmissionsOf(ship);
  const transmission = pickLine(rng, set?.missionKill);
  const reaction = pickLine(rng, set?.reaction);
  return { t: time, type: 'flagship_mission_kill', ...base(ship, tier, transmission, reaction) };
}

/** The heaviest anti-capital mount of a hull (highest damage per shot, ties by mount index): the weapon a scripted kill names. */
export function heaviestAntiCapitalMount<W extends { def: EffectiveWeapon; index: number }>(weapons: readonly W[]): W | undefined {
  let best: W | undefined;
  for (const w of weapons) {
    if (!w.def.antiCapital) continue;
    if (!best || w.def.damage > best.def.damage) best = w;
  }
  return best;
}
