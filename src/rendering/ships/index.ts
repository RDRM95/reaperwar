import * as THREE from 'three';
import { buildAllianceCarrier, buildAllianceCruiser, buildAllianceDreadnought, buildAllianceFighter, buildAllianceFrigate } from './alliance';
import { buildAsariCruiser, buildAsariDreadnought, buildDestinyAscension } from './asari';
import { buildCerberusCruiser, buildCerberusDreadnought, buildCerberusFighter, buildCerberusFrigate } from './cerberus';
import { buildGethCruiser, buildGethDreadnought, buildGethFighter, buildGethFrigate } from './geth';
import { buildQuarianCruiser, buildQuarianFighter, buildQuarianHeavy, buildQuarianLiveship } from './quarian';
import { buildHarbinger, buildReaperCapital, buildReaperDestroyer } from './reaper';
import { buildSalarianCruiser, buildSalarianDreadnought, buildSalarianFighter, buildStgFrigate } from './salarian';
import { buildTurianCruiser, buildTurianDreadnought, buildTurianFighter, buildTurianFrigate } from './turian';
import { SHIP_CLASSES } from '@/data/ships';
import type { ShipRole } from '@/data/types';
import type { BuiltShip } from './types';

export type { BuiltShip } from './types';

const BUILDERS: Record<string, () => BuiltShip> = {
  alliance_dreadnought: buildAllianceDreadnought,
  alliance_carrier: buildAllianceCarrier,
  alliance_cruiser: buildAllianceCruiser,
  alliance_frigate: () => buildAllianceFrigate(false),
  alliance_frigate_thanix: () => buildAllianceFrigate(true),
  alliance_fighter: buildAllianceFighter,
  turian_dreadnought: buildTurianDreadnought,
  turian_cruiser: buildTurianCruiser,
  turian_frigate: buildTurianFrigate,
  turian_fighter: buildTurianFighter,
  asari_dreadnought: buildAsariDreadnought,
  asari_cruiser: buildAsariCruiser,
  destiny_ascension: buildDestinyAscension,
  salarian_dreadnought: buildSalarianDreadnought,
  salarian_cruiser: buildSalarianCruiser,
  salarian_frigate: buildStgFrigate,
  salarian_fighter: buildSalarianFighter,
  cerberus_dreadnought: buildCerberusDreadnought,
  cerberus_cruiser: buildCerberusCruiser,
  cerberus_frigate: buildCerberusFrigate,
  cerberus_fighter: buildCerberusFighter,
  geth_dreadnought: buildGethDreadnought,
  geth_cruiser: buildGethCruiser,
  geth_frigate: buildGethFrigate,
  geth_fighter: buildGethFighter,
  quarian_liveship: buildQuarianLiveship,
  quarian_heavy: buildQuarianHeavy,
  quarian_cruiser: buildQuarianCruiser,
  quarian_fighter: buildQuarianFighter,
  reaper_capital: buildReaperCapital,
  reaper_destroyer: buildReaperDestroyer,
  harbinger: buildHarbinger,
};

/** Cache of template groups per class; instances are cloned (sharing geometry). */
const templates = new Map<string, BuiltShip>();

/** Role-based stand-ins for classes without a model builder yet (one warning per class id). */
const PLACEHOLDER_BY_ROLE: Record<ShipRole, (faction: string) => BuiltShip> = {
  fighter: (faction) => (faction === 'reaper' ? buildReaperDrone() : buildAllianceFighter()),
  frigate: () => buildAllianceFrigate(false),
  cruiser: () => buildAllianceCruiser(),
  dreadnought: () => buildAllianceDreadnought(),
  super_dreadnought: () => buildAllianceDreadnought(),
  carrier: () => buildAllianceCarrier(),
  fixed_platform: () => buildAllianceDreadnought(),
  reaper_destroyer: () => buildReaperDestroyer(),
  reaper_capital: () => buildReaperCapital(),
};

/** A small Reaper drone: a sphere in the eye material's colour. */
function buildReaperDrone(): BuiltShip {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1a1418, emissive: 0xff3a20, emissiveIntensity: 1.2, roughness: 0.6, metalness: 0.4 }));
  body.name = 'hull';
  group.add(body);
  return { group, engineNodes: [new THREE.Vector3(0, 0, -0.06)], lengthUnits: 0.12, muzzle: new THREE.Vector3(0, 0, 0.06), glowColor: 0xff3a20 };
}

const placeholderWarned = new Set<string>();

/**
 * Placeholder for a class id without a builder: the role's generic hull
 * scaled to the class length (lengthM / 100 render units), cached like a real
 * template. The renderer therefore never throws inside the render loop for a
 * class whose model has not landed yet; `hasModel` stays strict.
 */
function buildPlaceholder(classId: string): BuiltShip {
  const cls = SHIP_CLASSES[classId];
  if (!cls) throw new Error(`No ship model builder for ${classId}`);
  if (!placeholderWarned.has(classId)) {
    placeholderWarned.add(classId);
    console.warn(`No ship model builder for ${classId}: rendering a ${cls.role} placeholder`);
  }
  const base = PLACEHOLDER_BY_ROLE[cls.role](cls.faction);
  const target = cls.lengthM.value / 100;
  const k = base.lengthUnits > 0 ? target / base.lengthUnits : 1;
  const group = new THREE.Group();
  base.group.scale.setScalar(k);
  group.add(base.group);
  return {
    group,
    engineNodes: base.engineNodes.map((n) => n.clone().multiplyScalar(k)),
    lengthUnits: target,
    muzzle: base.muzzle?.clone().multiplyScalar(k),
    glowColor: base.glowColor,
    glowScales: base.glowScales,
  };
}

export function getShipTemplate(classId: string): BuiltShip {
  let t = templates.get(classId);
  if (!t) {
    const builder = BUILDERS[classId];
    t = builder ? builder() : buildPlaceholder(classId);
    templates.set(classId, t);
  }
  return t;
}

export function instantiateShip(classId: string): BuiltShip {
  const t = getShipTemplate(classId);
  const group = t.group.clone(true);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).matrixAutoUpdate = true;
  });
  return { ...t, group, engineNodes: t.engineNodes.map((v) => v.clone()), muzzle: t.muzzle?.clone() };
}

export const hasModel = (classId: string): boolean => classId in BUILDERS;
export const MODELLED_CLASS_IDS = Object.keys(BUILDERS);
