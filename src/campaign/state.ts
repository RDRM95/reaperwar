import type { FactionId } from '@/data/types';
import type { RuleSet } from '@/timelines/rules';
import type { SystemId } from './galaxy';

/**
 * Campaign state is plain JSON so it can be saved, exported and tested.
 * Fleets are abstract (ship counts by class); engagements expand them into
 * the battle simulation.
 */

export type Allegiance = 'allied' | 'reaper' | 'cerberus' | 'neutral';

export interface CampaignFleet {
  id: string;
  name: string;
  faction: FactionId;
  allegiance: Allegiance;
  location: SystemId;
  /** Next relay hop when moving; arrives next tick. */
  destination?: SystemId;
  /** Remaining hops after `destination`. */
  route?: SystemId[];
  counts: Record<string, number>;
  /** 0..1 readiness; low readiness lowers crew effectiveness. */
  readiness: number;
  /** Player can issue orders to this fleet. */
  playerControlled: boolean;
  /** AI standing order. */
  posture: 'defend' | 'reinforce' | 'offensive';
}

export interface SystemState {
  id: SystemId;
  controller: Allegiance;
  /** 0..1: fraction of population surviving. */
  population: number;
  /** 0..1: fraction of industry intact. */
  industry: number;
  /** 0..1: orbital defence condition. */
  defence: number;
  /** 0..1 Reaper ground presence (harvest progress). */
  reaperPresence: number;
  /** Reaper indoctrination pressure 0..1. */
  indoctrination: number;
  /** 0..1 ground forces: slow the harvest and hold the surface while the fleet is away. */
  ground: number;
  /** Last engagement summary for the intel panel. */
  lastBattle?: { tick: number; winner: Allegiance | 'draw'; summary: string };
}

export interface FactionStatus {
  faction: FactionId;
  morale: number; // 0..1
  /** Production points accumulated toward the next hull. */
  productionPool: number;
  /** Ships lost / built counters. */
  lost: number;
  built: number;
  cooperation: number; // 0..1 willingness to commit fleets away from home
}

export interface CampaignEvent {
  tick: number;
  kind: 'move' | 'battle' | 'harvest' | 'production' | 'political' | 'crucible' | 'intel' | 'victory' | 'defeat' | 'arrival' | 'research' | 'ground';
  text: string;
  system?: SystemId;
}

export interface PendingEngagement {
  system: SystemId;
  alliedFleetIds: string[];
  reaperFleetIds: string[];
  /** Whether the player may fight this in 3D (a player fleet is present). */
  playerInvolved: boolean;
}

export interface CampaignState {
  id: string;
  name: string;
  version: number;
  rulesId: string;
  /** Snapshot of the rule set at campaign start (custom timelines are embedded). */
  rules: RuleSet;
  seed: number;
  tick: number;
  /** In-universe date label. */
  startDate: string;
  systems: Record<SystemId, SystemState>;
  fleets: CampaignFleet[];
  factions: Record<FactionId, FactionStatus>;
  crucible: { progress: number; available: boolean; complete: boolean; docked: boolean };
  reaper: { strength: number; competence: number; reinforcementPool: number; lostValue: number; killedValue: number };
  warAssets: number;
  /** Research: one active project at a time; completed projects apply fleet-wide. */
  research: { active?: string; progress: number; completed: string[] };
  /** 0..1 refugee pressure on the Citadel and the allied economy. */
  refugees: number;
  /** One-shot / cooldown flags for political events (tick of last firing). */
  flags: Record<string, number>;
  events: CampaignEvent[];
  pending?: PendingEngagement;
  outcome?: { kind: 'victory' | 'defeat'; reason: string; tick: number };
  worldState: Record<string, string>;
  nextFleetId: number;
}
