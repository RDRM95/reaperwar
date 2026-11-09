import type { FactionId } from '@/data/types';
import { isGroupCapital } from '@/simulation/formations';
import type { FleetState, ShipState, Side } from '@/simulation/types';

/**
 * Battlegroups and fleets as the overlay labels and the large-battle HUD lists show them (brief §12, §22; stage L2).
 * Read-only views of the simulation's state, recomputed on demand; nothing here feeds back into a battle.
 *
 * A hull's battlegroup is the one 0.12.3's formations gave it (formations.ts): the group of the capital it keeps
 * station on (`ShipState.groupLeaderId`), or its own group when it leads one. A hull with neither — not a group
 * capital, no leader and nobody keeping station on it — is shown with the nearest live group capital of its fleet. A
 * group whose leader is lost is named after its most valuable surviving hull (the simulation re-forms the escorts
 * round the nearest capital when the fleet still has one, formations' `noteLoss`; when it has none they stay
 * together). Fighters and Oculi are in no group.
 */

export interface Battlegroup {
  /** Group key: the formation leader's id. */
  id: string;
  fleetId: string;
  /** The hull the group is named after: its formation leader while it lives, else its most valuable live hull. */
  leader: ShipState;
  /** Every hull of the group, lost ones included: the leader first, then by value (and id). */
  members: ShipState[];
  /** Hulls still in the fight (alive, not escaped). */
  live: ShipState[];
}

export interface FleetGroups {
  /** Group key of every hull but fighters. */
  groupOf: Map<string, string>;
  groups: Map<string, Battlegroup>;
}

export interface FleetSummary {
  id: string;
  name: string;
  side: Side;
  faction: FactionId;
  /** Every hull of the fleet but fighters, lost ones included, by value (and id). */
  members: ShipState[];
  /** Hulls still in the fight. */
  live: ShipState[];
  /** Hulls deployed so far (`members.length`). */
  deployed: number;
  /** Fighter craft of the fleet still in the fight (a flight stands for several craft; the HUD and the labels count them). */
  craft: number;
  /** Remaining hull and barrier points as a fraction of the deployed hulls' maxima. */
  hull: number;
  barriers: number;
  /** Its battlegroups, by leader value (live groups first). */
  groups: Battlegroup[];
}

export const inFight = (s: ShipState): boolean => s.alive && !s.escaped;
const byValue = (a: ShipState, b: ShipState): number => b.pointValue - a.pointValue || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Battlegroups of the given hulls (fighters are skipped). */
export function battlegroups(ships: readonly ShipState[]): FleetGroups {
  const hulls = ships.filter((s) => s.role !== 'fighter');
  const byId = new Map(hulls.map((s) => [s.id, s]));
  const led = new Set<string>();
  for (const s of hulls) if (s.groupLeaderId) led.add(s.groupLeaderId);
  const groupOf = new Map<string, string>();
  const keyOf = (s: ShipState): string => s.groupLeaderId ?? s.id;
  for (const s of hulls) {
    let key = keyOf(s);
    if (!s.groupLeaderId && !isGroupCapital(s.role) && !led.has(s.id) && inFight(s)) {
      // No group of its own: shown with the nearest live group capital of its fleet (ties by id).
      let best: ShipState | undefined;
      let bd = Infinity;
      for (const c of hulls) {
        if (c === s || c.fleetId !== s.fleetId || !isGroupCapital(c.role) || !inFight(c)) continue;
        const d = Math.hypot(c.pos.x - s.pos.x, c.pos.y - s.pos.y, c.pos.z - s.pos.z);
        if (d < bd || (d === bd && best && c.id < best.id)) {
          bd = d;
          best = c;
        }
      }
      if (best) key = keyOf(best);
    }
    groupOf.set(s.id, key);
  }
  const lists = new Map<string, ShipState[]>();
  for (const s of hulls) {
    const key = groupOf.get(s.id)!;
    let list = lists.get(key);
    if (!list) lists.set(key, (list = []));
    list.push(s);
  }
  const groups = new Map<string, Battlegroup>();
  for (const [key, list] of lists) {
    const live = list.filter(inFight).sort(byValue);
    const formationLeader = byId.get(key);
    const leader = formationLeader && inFight(formationLeader) ? formationLeader : (live[0] ?? formationLeader ?? [...list].sort(byValue)[0]);
    const members = [leader, ...list.filter((s) => s !== leader).sort(byValue)];
    groups.set(key, { id: key, fleetId: leader.fleetId, leader, members, live });
  }
  return { groupOf, groups };
}

/** Every deployed fleet of the battle, in deployment order, with its battlegroups and remaining strength. */
export function fleetSummaries(ships: readonly ShipState[], fleets: ReadonlyMap<string, FleetState>, bg: FleetGroups = battlegroups(ships)): FleetSummary[] {
  const byFleet = new Map<string, ShipState[]>();
  const craftOf = new Map<string, number>();
  for (const s of ships) {
    if (s.role === 'fighter') {
      if (inFight(s)) craftOf.set(s.fleetId, (craftOf.get(s.fleetId) ?? 0) + (s.flight?.craft ?? 1));
      continue;
    }
    let list = byFleet.get(s.fleetId);
    if (!list) byFleet.set(s.fleetId, (list = []));
    list.push(s);
  }
  const groupsOf = new Map<string, Battlegroup[]>();
  for (const g of bg.groups.values()) {
    let list = groupsOf.get(g.fleetId);
    if (!list) groupsOf.set(g.fleetId, (list = []));
    list.push(g);
  }
  const out: FleetSummary[] = [];
  for (const [id, fleet] of fleets) {
    const members = (byFleet.get(id) ?? []).sort(byValue);
    if (members.length === 0) continue;
    const live = members.filter(inFight);
    let hull = 0;
    let maxHull = 0;
    let barriers = 0;
    let maxBarriers = 0;
    for (const s of members) {
      maxHull += s.maxHull;
      maxBarriers += s.maxBarriers;
      if (!inFight(s)) continue;
      hull += s.hull;
      barriers += s.barriers;
    }
    const groups = (groupsOf.get(id) ?? []).sort((a, b) => Number(b.live.length > 0) - Number(a.live.length > 0) || byValue(a.leader, b.leader));
    out.push({
      id,
      name: fleet.spec.name,
      side: fleet.spec.side,
      faction: fleet.spec.faction,
      members,
      live,
      deployed: members.length,
      craft: craftOf.get(id) ?? 0,
      hull: maxHull > 0 ? hull / maxHull : 0,
      barriers: maxBarriers > 0 ? barriers / maxBarriers : 0,
      groups,
    });
  }
  return out;
}
