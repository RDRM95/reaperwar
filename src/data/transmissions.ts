import { estimate, type Sourced } from '@/core/provenance';

/**
 * Final transmissions and fleet reactions for the flagship events
 * (ADOPTION_PLAN.md §22.2). Every line is ORIGINAL TEXT written for this
 * simulation — never a quotation from any game — and is tagged
 * SIMULATION_ESTIMATE; the UI footer says `ORIGINAL TEXT (SIM)` (plus `· AU`
 * under AU presets). Harbinger's lines are measured, declarative and
 * contemptuous; the organic lines are fleet-comms terse.
 */
export interface TransmissionSet {
  /** Spoken when the ship is mission-killed (weapons and engines crippled, hull intact). */
  missionKill: string[];
  /** Spoken as the ship is destroyed (the final transmission). */
  destroyed: string[];
  /** The other side's (or the fleet's) comms reaction to the loss. */
  reaction: string[];
}

export const TRANSMISSIONS: Record<'harbinger' | 'sovereign' | 'destiny_ascension' | 'normandy_sr2' | 'normandy_valkyrie', TransmissionSet> = {
  harbinger: {
    missionKill: ['This cycle is not concluded.'],
    destroyed: ['This vessel ends. The harvest does not.', 'You have removed one voice. The chorus remains.', 'Count this. It changes nothing.'],
    reaction: ['All ships: Harbinger is down. Press the attack.', 'Confirmed kill on the command vessel. Shift targets.'],
  },
  sovereign: {
    missionKill: ['You have silenced nothing that matters.'],
    destroyed: ['Your victory is a rounding error.'],
    reaction: ['Sovereign is breaking up. All ships, clear the debris field.'],
  },
  destiny_ascension: {
    missionKill: ['Ascension to all ships: main gun dark, barriers holding. We are still in this.'],
    destroyed: ['Ascension is lost. Hold the line for Thessia.'],
    reaction: ['The Ascension is gone. Close ranks.'],
  },
  normandy_sr2: {
    missionKill: ['Normandy actual — we are hit and drifting. Still transmitting.'],
    destroyed: ['Normandy actual — we are going down. Finish it without us.'],
    reaction: ['Normandy is gone. Every ship: keep firing.'],
  },
  normandy_valkyrie: {
    missionKill: ['Valkyrie actual — main array dark. Escorts, cover our drift.'],
    destroyed: ['Valkyrie to all ships: the line is yours.'],
    reaction: ['Valkyrie is down. The line holds without her.'],
  },
};

/** Provenance of every transmission string: original text, a simulation estimate. */
export const TRANSMISSIONS_PROVENANCE: Sourced<string> = estimate('original text', 'Never a game quotation; the UI footer reads ORIGINAL TEXT (SIM), plus · AU under AU presets.');

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The transmission set a ship uses: unique classes by class id, Sovereign by name (it is a plain reaper_capital). */
export function transmissionKey(ship: { classId: string; name: string }): keyof typeof TRANSMISSIONS | undefined {
  if (hasOwn(TRANSMISSIONS, ship.classId)) return ship.classId as keyof typeof TRANSMISSIONS;
  if (ship.classId === 'reaper_capital' && ship.name === 'Sovereign') return 'sovereign';
  return undefined;
}
