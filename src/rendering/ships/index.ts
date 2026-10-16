import * as THREE from 'three';
import { buildAllianceCarrier, buildAllianceCruiser, buildAllianceDreadnought, buildAllianceFighter, buildAllianceFrigate } from './alliance';
import { buildHarbinger, buildReaperCapital, buildReaperDestroyer } from './reaper';
import type { BuiltShip } from './types';

export type { BuiltShip } from './types';

const BUILDERS: Record<string, () => BuiltShip> = {
  alliance_dreadnought: buildAllianceDreadnought,
  alliance_carrier: buildAllianceCarrier,
  alliance_cruiser: buildAllianceCruiser,
  alliance_frigate: () => buildAllianceFrigate(false),
  alliance_frigate_thanix: () => buildAllianceFrigate(true),
  alliance_fighter: buildAllianceFighter,
  reaper_capital: buildReaperCapital,
  reaper_destroyer: buildReaperDestroyer,
  harbinger: buildHarbinger,
};

/** Cache of template groups per class; instances are cloned (sharing geometry). */
const templates = new Map<string, BuiltShip>();

export function getShipTemplate(classId: string): BuiltShip {
  let t = templates.get(classId);
  if (!t) {
    const builder = BUILDERS[classId];
    if (!builder) throw new Error(`No ship model builder for ${classId}`);
    t = builder();
    templates.set(classId, t);
  }
  return t;
}

export function instantiateShip(classId: string): BuiltShip {
  const t = getShipTemplate(classId);
  const group = t.group.clone(true);
  // Materials are shared between instances; damage tinting clones lazily.
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).matrixAutoUpdate = true;
  });
  return { ...t, group, engineNodes: t.engineNodes.map((v) => v.clone()), muzzle: t.muzzle?.clone() };
}

export const hasModel = (classId: string): boolean => classId in BUILDERS;
