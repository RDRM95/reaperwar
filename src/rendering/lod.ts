import type { ShipRole } from '@/data/types';

/**
 * Level-of-detail policy for ship visuals. Pure so it can be unit tested.
 *
 * - full: every mesh, engine glow sprites.
 * - reduced: hull and dark hull only (windows, accents, lights, seams and glow sprites hidden).
 * - point: the mesh is hidden and the ship is drawn as one vertex of the shared far-point cloud.
 */
export type LodLevel = 'full' | 'reduced' | 'point';

/** Mesh names that only matter up close. */
export const DETAIL_MESH_NAMES = new Set(['windows', 'accent', 'engine', 'lights', 'seams', 'plates', 'eye']);

/** Distance (render units) beyond which detail meshes are dropped, per unit of ship length. */
export const REDUCED_FACTOR = 70;
/** Distance beyond which the ship becomes a point, per unit of ship length. */
export const POINT_FACTOR = 700;
/** Small craft switch to points much earlier: they are sub-pixel long before the generic rule. */
export const FIGHTER_POINT_DISTANCE = 90;
export const FIGHTER_REDUCED_DISTANCE = 30;

/**
 * `distanceScale` multiplies every threshold: the full-detail distance, the
 * hull-only distance and so where the far point cloud starts (Ultra: 2.5).
 */
export function lodLevel(distance: number, lengthUnits: number, role: ShipRole, enabled = true, distanceScale = 1): LodLevel {
  if (!enabled) return 'full';
  const d = distance / (distanceScale > 0 ? distanceScale : 1);
  if (role === 'fighter') {
    if (d > FIGHTER_POINT_DISTANCE) return 'point';
    return d > FIGHTER_REDUCED_DISTANCE ? 'reduced' : 'full';
  }
  const L = Math.max(0.5, lengthUnits);
  if (d > L * POINT_FACTOR) return 'point';
  if (d > L * REDUCED_FACTOR) return 'reduced';
  return 'full';
}
