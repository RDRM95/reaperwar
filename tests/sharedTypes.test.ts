import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { CAPITAL_ROLES, HADES_FUSE, HADES_GATE, NAMED_FLAGSHIPS, UNIQUE_CLASS_IDS, isAuClass, isCapitalRole, type ShipRole } from '@/data/types';
import { WEAPONS } from '@/data/weapons';
import { getShipClass } from '@/data/ships';
import { BattleSimulation } from '@/simulation/battle';
import { applyDamage } from '@/simulation/damage';
import { assignSlots } from '@/simulation/formations';
import { PROFILE_PHASES } from '@/simulation/profile';
import { FORMATION_LABELS, type FormationType } from '@/simulation/types';
import { applyRulesToWeapon } from '@/timelines/rules';
import { CANON_ME3 } from '@/timelines/presets';
import { buildScenario } from '@/scenarios';

/**
 * The V2 shared-type contract (WORK_BREAKDOWN.md §1.3.1–§1.3.4): every new
 * field is optional or defaulted so v0.11 configs keep building, and the
 * required runtime fields are initialised by the simulation.
 */

const ALL_FORMATIONS: FormationType[] = ['defensive_screen', 'line_abreast', 'strike_wedge', 'capital_column', 'fighter_screen', 'dispersed', 'layered_line', 'stacked_wedge', 'box', 'swarm_descent', 'broadside_line', 'static'];
const ALL_ROLES: ShipRole[] = ['fighter', 'frigate', 'cruiser', 'dreadnought', 'super_dreadnought', 'carrier', 'fixed_platform', 'reaper_destroyer', 'reaper_capital'];

describe('shared types', () => {
  it('labels every formation id, including the six 3D formations', () => {
    for (const f of ALL_FORMATIONS) expect(FORMATION_LABELS[f]).toBeTruthy();
    expect(FORMATION_LABELS.layered_line).toBe('Layered line (3D)');
    expect(FORMATION_LABELS.static).toBe('Static (platforms)');
    expect(Object.keys(FORMATION_LABELS).sort()).toEqual([...ALL_FORMATIONS].sort());
  });

  it('counts super-dreadnoughts and fixed platforms as capital hulls', () => {
    expect(isCapitalRole('super_dreadnought')).toBe(true);
    expect(isCapitalRole('fixed_platform')).toBe(true);
    expect(isCapitalRole('cruiser')).toBe(false);
    expect([...CAPITAL_ROLES].sort()).toEqual(['carrier', 'dreadnought', 'fixed_platform', 'reaper_capital', 'super_dreadnought']);
  });

  it('carries the HADES fuse, gate, unique hulls and named flagships', () => {
    expect(HADES_FUSE.residualFraction).toBe(0.5);
    expect(HADES_GATE.barrierFractionBelow).toBeGreaterThanOrEqual(0.1);
    expect(HADES_GATE.barrierFractionBelow).toBeLessThanOrEqual(0.35);
    expect(UNIQUE_CLASS_IDS).toEqual(['harbinger', 'destiny_ascension', 'normandy_sr2', 'normandy_valkyrie']);
    expect(NAMED_FLAGSHIPS).toContain('SSV Normandy SR-2');
    expect(isAuClass('alliance_dreadnought')).toBe(false);
    expect(isAuClass('no_such_class')).toBe(false);
  });

  it('assigns a slot to every ship under every formation id, 3D ids included, for every role', () => {
    const ships = ALL_ROLES.flatMap((role, i) => [0, 1, 2].map((k) => ({ id: `${role}-${k}`, role, lengthKm: role === 'reaper_capital' ? 2 : role === 'fighter' ? 0.02 : 0.5 + i * 0.1 })));
    for (const f of ALL_FORMATIONS) {
      const slots = assignSlots(ships, f);
      for (const s of ships) expect(slots.has(s.id), `${f} ${s.id}`).toBe(true);
    }
  });

  it('initialises the new runtime fields and reports the destruction cause', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_the_citadel', 'canon_me3', 2));
    for (const s of sim.ships) {
      expect(s.solutions).toEqual([]);
      expect(s.recentHitTimes).toEqual([]);
      expect(s.flagshipEvents).toEqual({ destroyed: false, missionKill: false });
      expect(s.regenSuppressedUntil).toBe(0);
      expect(s.rogue).toBe(false);
      expect(s.stats.recentDamage).toBe(0);
      expect(typeof s.flagship).toBe('boolean');
    }
    expect(sim.ships.find((s) => s.name === 'Sovereign')?.flagship).toBe(true);
    expect(sim.ships.find((s) => s.role === 'cruiser' && s.name !== 'Sovereign')?.flagship).toBe(false);
    for (const f of sim.fleets.values()) {
      expect(f.static).toBe(false);
      expect(f.headingLocked).toBe(false);
      expect(f.doctrineFacing).toBe('bow');
      expect(Math.hypot(f.approachBearing.x, f.approachBearing.y, f.approachBearing.z)).toBeCloseTo(1, 6);
    }
    for (let i = 0; i < 1200 && !sim.events.some((e) => e.type === 'ship_destroyed'); i++) sim.step();
    const kills = sim.events.filter((e) => e.type === 'ship_destroyed');
    expect(kills.length).toBeGreaterThan(0);
    for (const k of kills) {
      if (k.type !== 'ship_destroyed') continue;
      expect(['kinetic', 'thanix_stream', 'reaper_beam', 'warhead', 'laser']).toContain(k.cause);
      expect(typeof k.weaponId).toBe('string');
    }
    for (const p of sim.projectiles) expect(p.special).toBe(false);
  });

  it('exposes a disabled profiler that records nothing', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 1));
    expect(sim.profile.enabled).toBe(false);
    for (let i = 0; i < 20; i++) sim.step();
    expect(sim.profile.steps).toBe(0);
    expect(sim.profile.totalMs).toBe(0);
    for (const p of PROFILE_PHASES) expect(sim.profile.phases[p]).toBe(0);
  });

  it('reports the residual energy that passed the barrier', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 1));
    const frigate = sim.ships.find((s) => s.classId === 'alliance_frigate')!;
    const slug = applyRulesToWeapon(WEAPONS.alliance_frigate_main, 'alliance', getShipClass('alliance_frigate'), CANON_ME3, WEAPONS);
    const absorbed = applyDamage(frigate, 70, slug, new Rng(1), 0);
    expect(absorbed.residual).toBe(0);
    frigate.barriers = 0;
    const through = applyDamage(frigate, 70, slug, new Rng(1), 0);
    expect(through.residual).toBe(70);
  });
});
