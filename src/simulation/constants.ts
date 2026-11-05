/**
 * Battlespace compression. Catalogue ranges and speeds are expressed in
 * "nominal km"; the simulation multiplies every distance and speed by this
 * factor so that a two-kilometre Reaper and a forty-kilometre engagement
 * range can share a camera frame. Ship lengths are NOT scaled, so hulls read
 * at their true relative sizes. Flight times, closing times and the balance
 * are unaffected because speeds and ranges scale together.
 */
export const BATTLESPACE_SCALE = 0.4;

/**
 * Vertical reach of an arc-limited mount: it bears only on a target with |Δy| / distance below this (about ±37°,
 * world frame — the hull's own pitch does not change it). Turreted mounts (arc 360) cover every bearing.
 */
export const ARC_VERTICAL_REACH = 0.6;

/** The fixed simulation step (20 Hz). Re-exported by `battle.ts`, where consumers import it from. */
export const SIM_DT = 0.05;
