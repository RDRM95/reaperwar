import type { ShipState } from '@/simulation/types';
import type { Vec3 } from '@/core/vec3';

/**
 * Select the same nearest non-escaped ships as stable full-array sorting, but
 * keep only K candidate records. For huge battles K is 24 or fewer; avoiding
 * sorting every ship eight times a second cuts render-thread work.
 */
export function nearestDetailedShipIds(
  ships: readonly Pick<ShipState,'id'|'alive'|'escaped'|'role'|'pos'>[],
  camera: Vec3, kmScale: number, limit: number, skipFighters: boolean,
): Set<string> {
  const closest: { id: string; d2: number }[] = [];
  if (limit <= 0) return new Set();
  for (const ship of ships) {
    if (!ship.alive || ship.escaped || (skipFighters && ship.role === 'fighter')) continue;
    const x = ship.pos.x * kmScale - camera.x;
    const y = ship.pos.y * kmScale - camera.y;
    const z = ship.pos.z * kmScale - camera.z;
    const d2 = x*x + y*y + z*z;
    if (closest.length >= limit && d2 >= closest[closest.length - 1].d2) continue;
    let insert = closest.length;
    while (insert > 0 && d2 < closest[insert-1].d2) insert--;
    closest.splice(insert, 0, { id: ship.id, d2 });
    if (closest.length > limit) closest.pop();
  }
  return new Set(closest.map(ship => ship.id));
}
