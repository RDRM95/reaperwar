import * as THREE from 'three';
import { at, merge, plateStrip, rot, taperedBox, wedge, zCylinder } from '../geometry';
import { paletteFor } from '../materials';
import type { BuiltShip } from './types';

/**
 * Systems Alliance hull family. Design language: functional military
 * architecture, angular hulls, long spinal mass accelerator, flat armour
 * facets, blue drive illumination, white/grey plating with dark panel bands
 * and a blue identification stripe. All dimensions in render units (100 m).
 *
 * Original fan models; proportions follow the trilogy's Alliance silhouettes.
 */

function engineBlock(width: number, height: number, length: number, nozzles: { x: number; y: number; r: number }[], parts: Parts): void {
  parts.hullDark.push(at(taperedBox(width, height, length, 1, 0.85), 0, 0, 0));
  for (const n of nozzles) {
    parts.hullDark.push(at(zCylinder(n.r * 1.05, n.r * 0.9, length * 0.35, 14, true), n.x, n.y, -length * 0.55));
    parts.engine.push(at(zCylinder(n.r * 0.8, n.r * 0.55, 0.12, 14), n.x, n.y, -length * 0.7));
  }
}

interface Parts {
  hull: THREE.BufferGeometry[];
  hullDark: THREE.BufferGeometry[];
  accent: THREE.BufferGeometry[];
  engine: THREE.BufferGeometry[];
  windows: THREE.BufferGeometry[];
}

const newParts = (): Parts => ({ hull: [], hullDark: [], accent: [], engine: [], windows: [] });

function assemble(parts: Parts, faction: string, engineNodes: THREE.Vector3[], lengthUnits: number, muzzle?: THREE.Vector3): BuiltShip {
  const p = paletteFor(faction);
  const group = new THREE.Group();
  const add = (g: THREE.BufferGeometry[], m: THREE.Material, name: string) => {
    if (g.length === 0) return;
    const mesh = new THREE.Mesh(merge(g), m);
    mesh.name = name;
    mesh.castShadow = false;
    group.add(mesh);
  };
  add(parts.hull, p.hull, 'hull');
  add(parts.hullDark, p.hullDark, 'hullDark');
  add(parts.accent, p.accent, 'accent');
  add(parts.engine, p.engine, 'engine');
  add(parts.windows, p.windows, 'windows');
  return { group, engineNodes, lengthUnits, muzzle, glowColor: 0x4fb8ff };
}

/** Kilimanjaro-class dreadnought: ~888 m → 8.88 units. */
export function buildAllianceDreadnought(): BuiltShip {
  const L = 8.88;
  const parts = newParts();
  // Central spine (gun housing).
  parts.hull.push(taperedBox(0.78, 0.62, L * 0.78, 0.82, 1, { frontHeight: 0.8 }).translate(0, 0, L * 0.05));
  // Forward head: flat angular wedge over the muzzle.
  parts.hull.push(at(taperedBox(1.45, 0.86, 2.4, 0.55, 1, { frontHeight: 0.45 }), 0, 0.02, L * 0.3));
  parts.hullDark.push(at(wedge(1.1, 0.35, 1.6, 0.4), 0, -0.45, L * 0.3));
  // Muzzle.
  parts.hullDark.push(at(zCylinder(0.16, 0.2, 1.2, 12), 0, 0, L * 0.5 - 0.2));
  parts.accent.push(at(zCylinder(0.22, 0.22, 0.18, 12), 0, 0, L * 0.5 - 0.95));
  // Dorsal superstructure (command / sensor towers).
  parts.hull.push(at(taperedBox(0.55, 0.42, 1.9, 0.8, 1), 0, 0.5, 0.6));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.34, 0.5, 0.7), 0, 0.85, 0.2));
  parts.windows.push(at(new THREE.BoxGeometry(0.36, 0.05, 0.5), 0, 0.98, 0.25));
  parts.windows.push(...plateStrip(9, 0.08, 0.04, 0.3, new THREE.Vector3(0.4, 0.2, -2.8), new THREE.Vector3(0.4, 0.2, 2.6)));
  parts.windows.push(...plateStrip(9, 0.08, 0.04, 0.3, new THREE.Vector3(-0.4, 0.2, -2.8), new THREE.Vector3(-0.4, 0.2, 2.6)));
  // Lateral sponsons carrying broadside batteries.
  for (const s of [-1, 1]) {
    parts.hull.push(at(taperedBox(0.9, 0.3, 4.2, 0.7, 0.9), s * 0.78, -0.02, -0.4));
    parts.hullDark.push(at(new THREE.BoxGeometry(0.42, 0.14, 3.4), s * 1.12, 0.14, -0.3));
    parts.accent.push(at(new THREE.BoxGeometry(0.95, 0.06, 0.5), s * 0.78, 0.17, 1.2));
    // Broadside turrets.
    for (let i = 0; i < 4; i++) {
      parts.hullDark.push(at(new THREE.BoxGeometry(0.2, 0.12, 0.26), s * 1.0, 0.22, -1.5 + i * 0.85));
      parts.hullDark.push(at(rot(zCylinder(0.03, 0.03, 0.4, 6), 0, (s * Math.PI) / 2, 0), s * 1.22, 0.24, -1.5 + i * 0.85));
    }
    // Hull plating detail.
    parts.hullDark.push(...plateStrip(6, 0.12, 0.08, 0.5, new THREE.Vector3(s * 0.46, 0.33, -3.2), new THREE.Vector3(s * 0.46, 0.33, 1.6), 0.4));
  }
  // Ventral keel.
  parts.hullDark.push(at(taperedBox(0.4, 0.3, L * 0.55, 0.6, 0.9), 0, -0.4, -0.3));
  // Aft engine block with four main thrusters.
  const eb = new THREE.Group();
  void eb;
  const engParts = newParts();
  engineBlock(1.7, 1.0, 1.9, [
    { x: 0.5, y: 0.26, r: 0.22 },
    { x: -0.5, y: 0.26, r: 0.22 },
    { x: 0.5, y: -0.26, r: 0.22 },
    { x: -0.5, y: -0.26, r: 0.22 },
  ], engParts);
  for (const k of Object.keys(engParts) as (keyof Parts)[]) parts[k].push(...engParts[k].map((g) => g.translate(0, 0, -L * 0.5 + 1.1)));
  parts.accent.push(at(new THREE.BoxGeometry(1.75, 0.08, 0.3), 0, 0.52, -L * 0.5 + 1.6));
  // Faction stripe along the spine.
  parts.accent.push(at(new THREE.BoxGeometry(0.1, 0.03, L * 0.6), 0.3, 0.33, 0));
  parts.accent.push(at(new THREE.BoxGeometry(0.1, 0.03, L * 0.6), -0.3, 0.33, 0));
  const z0 = -L * 0.5 + 1.1 - 1.9 * 0.7;
  const engineNodes = [new THREE.Vector3(0.5, 0.26, z0), new THREE.Vector3(-0.5, 0.26, z0), new THREE.Vector3(0.5, -0.26, z0), new THREE.Vector3(-0.5, -0.26, z0)];
  return assemble(parts, 'alliance', engineNodes, L, new THREE.Vector3(0, 0, L * 0.5 + 0.4));
}

/** Alliance carrier: dreadnought-sized hull with a flight deck and hangar mouths. */
export function buildAllianceCarrier(): BuiltShip {
  const L = 9.0;
  const parts = newParts();
  parts.hull.push(taperedBox(1.4, 0.7, L * 0.8, 0.75, 1, { frontHeight: 0.7 }));
  // Flight deck slab.
  parts.hull.push(at(taperedBox(2.3, 0.22, L * 0.62, 0.8, 1), 0, 0.4, 0.2));
  parts.hullDark.push(at(new THREE.BoxGeometry(2.1, 0.03, L * 0.55), 0, 0.52, 0.2));
  parts.accent.push(at(new THREE.BoxGeometry(0.06, 0.04, L * 0.5), 0.5, 0.54, 0.2));
  parts.accent.push(at(new THREE.BoxGeometry(0.06, 0.04, L * 0.5), -0.5, 0.54, 0.2));
  // Hangar openings (recessed, lit).
  for (const s of [-1, 1]) {
    parts.hullDark.push(at(new THREE.BoxGeometry(0.1, 0.42, 2.6), s * 1.2, 0.0, 0.4));
    parts.windows.push(at(new THREE.BoxGeometry(0.04, 0.3, 2.4), s * 1.24, 0.0, 0.4));
    parts.hull.push(at(taperedBox(0.5, 0.5, 3.6, 0.7, 0.9), s * 1.0, -0.25, -0.8));
  }
  // Island / bridge.
  parts.hull.push(at(new THREE.BoxGeometry(0.5, 0.5, 1.4), 0.6, 0.85, -1.6));
  parts.windows.push(at(new THREE.BoxGeometry(0.52, 0.06, 1.0), 0.6, 1.0, -1.6));
  // Bow.
  parts.hull.push(at(wedge(1.3, 0.6, 1.6, 0.35), 0, 0, L * 0.4 + 0.6));
  // Engines.
  const engParts = newParts();
  engineBlock(2.0, 1.0, 1.8, [
    { x: 0.6, y: 0.2, r: 0.24 },
    { x: -0.6, y: 0.2, r: 0.24 },
    { x: 0, y: -0.25, r: 0.28 },
  ], engParts);
  for (const k of Object.keys(engParts) as (keyof Parts)[]) parts[k].push(...engParts[k].map((g) => g.translate(0, 0, -L * 0.5 + 1.0)));
  const z0 = -L * 0.5 + 1.0 - 1.8 * 0.7;
  return assemble(parts, 'alliance', [new THREE.Vector3(0.6, 0.2, z0), new THREE.Vector3(-0.6, 0.2, z0), new THREE.Vector3(0, -0.25, z0)], L);
}

/** Alliance cruiser: ~520 m → 5.2 units. */
export function buildAllianceCruiser(): BuiltShip {
  const L = 5.2;
  const parts = newParts();
  parts.hull.push(taperedBox(0.62, 0.5, L * 0.74, 0.75, 1, { frontHeight: 0.75 }).translate(0, 0, L * 0.02));
  // Angular bow housing the spinal gun.
  parts.hull.push(at(taperedBox(0.9, 0.6, 1.5, 0.45, 1, { frontHeight: 0.4 }), 0, 0.02, L * 0.3));
  parts.hullDark.push(at(zCylinder(0.1, 0.13, 0.7, 10), 0, -0.02, L * 0.5 - 0.1));
  // Dorsal spine and bridge.
  parts.hullDark.push(at(taperedBox(0.3, 0.25, 2.2, 0.7, 1), 0, 0.33, 0.2));
  parts.hull.push(at(new THREE.BoxGeometry(0.28, 0.3, 0.5), 0, 0.5, -0.4));
  parts.windows.push(at(new THREE.BoxGeometry(0.3, 0.04, 0.36), 0, 0.6, -0.35));
  parts.windows.push(...plateStrip(6, 0.06, 0.03, 0.22, new THREE.Vector3(0.32, 0.12, -1.6), new THREE.Vector3(0.32, 0.12, 1.4)));
  parts.windows.push(...plateStrip(6, 0.06, 0.03, 0.22, new THREE.Vector3(-0.32, 0.12, -1.6), new THREE.Vector3(-0.32, 0.12, 1.4)));
  // Downswept lateral fins with broadside mounts.
  for (const s of [-1, 1]) {
    const fin = taperedBox(0.9, 0.12, 2.4, 0.6, 0.9);
    fin.rotateZ(s * -0.35);
    parts.hull.push(at(fin, s * 0.7, -0.22, -0.3));
    parts.accent.push(at(new THREE.BoxGeometry(0.5, 0.05, 0.3), s * 0.6, -0.08, 0.6));
    for (let i = 0; i < 2; i++) parts.hullDark.push(at(new THREE.BoxGeometry(0.16, 0.1, 0.2), s * 0.55, 0.1, -0.7 + i * 0.9));
  }
  // Twin engines.
  const engParts = newParts();
  engineBlock(1.1, 0.62, 1.2, [
    { x: 0.3, y: 0, r: 0.18 },
    { x: -0.3, y: 0, r: 0.18 },
  ], engParts);
  for (const k of Object.keys(engParts) as (keyof Parts)[]) parts[k].push(...engParts[k].map((g) => g.translate(0, 0, -L * 0.5 + 0.7)));
  parts.accent.push(at(new THREE.BoxGeometry(0.08, 0.03, 2.4), 0.2, 0.26, 0.3));
  parts.accent.push(at(new THREE.BoxGeometry(0.08, 0.03, 2.4), -0.2, 0.26, 0.3));
  const z0 = -L * 0.5 + 0.7 - 1.2 * 0.7;
  return assemble(parts, 'alliance', [new THREE.Vector3(0.3, 0, z0), new THREE.Vector3(-0.3, 0, z0)], L, new THREE.Vector3(0, -0.02, L * 0.5 + 0.3));
}

/** Alliance frigate / Normandy-style hull: ~170–216 m. */
export function buildAllianceFrigate(normandy = false): BuiltShip {
  const L = normandy ? 2.16 : 1.7;
  const parts = newParts();
  // Fuselage.
  parts.hull.push(taperedBox(0.28, 0.2, L * 0.72, 0.45, 0.9, { frontHeight: 0.5 }).translate(0, 0.02, L * 0.08));
  // Raised cockpit / neck.
  parts.hull.push(at(taperedBox(0.2, 0.14, 0.5, 0.7, 1), 0, 0.12, L * 0.28));
  parts.windows.push(at(new THREE.BoxGeometry(0.16, 0.03, 0.14), 0, 0.2, L * 0.36));
  // Swept wings with tip nacelles.
  for (const s of [-1, 1]) {
    const wing = taperedBox(0.75, 0.05, 0.5, 0.5, 1);
    wing.rotateY(s * -0.45);
    wing.rotateZ(s * 0.12);
    parts.hull.push(at(wing, s * 0.42, -0.02, -0.25));
    parts.hullDark.push(at(zCylinder(0.07, 0.08, 0.7, 10), s * 0.78, -0.06, -0.4));
    parts.engine.push(at(zCylinder(0.055, 0.04, 0.06, 10), s * 0.78, -0.06, -0.78));
    parts.accent.push(at(new THREE.BoxGeometry(0.12, 0.03, 0.18), s * 0.5, 0.02, -0.2));
  }
  // Dorsal fin and ventral weapon bay.
  parts.hullDark.push(at(taperedBox(0.04, 0.16, 0.5, 0.5, 1), 0, 0.18, -0.35));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.16, 0.07, 0.5), 0, -0.1, 0.1));
  // Main thrusters.
  parts.hullDark.push(at(new THREE.BoxGeometry(0.34, 0.16, 0.3), 0, 0.0, -L * 0.42));
  parts.engine.push(at(zCylinder(0.05, 0.04, 0.05, 10), 0.09, 0.0, -L * 0.5 + 0.02));
  parts.engine.push(at(zCylinder(0.05, 0.04, 0.05, 10), -0.09, 0.0, -L * 0.5 + 0.02));
  // Stripe (Normandy: black/white with blue; standard: blue).
  parts.accent.push(at(new THREE.BoxGeometry(0.3, 0.02, 0.5), 0, 0.12, -0.1));
  if (normandy) parts.hullDark.push(at(new THREE.BoxGeometry(0.29, 0.21, 0.25), 0, 0.02, -0.55));
  const engineNodes = [new THREE.Vector3(0.78, -0.06, -0.8), new THREE.Vector3(-0.78, -0.06, -0.8), new THREE.Vector3(0.09, 0, -L * 0.5), new THREE.Vector3(-0.09, 0, -L * 0.5)];
  return assemble(parts, 'alliance', engineNodes, L, new THREE.Vector3(0, -0.02, L * 0.5));
}

/** F-61 Trident fighter (rendered ×2 for visibility; see KNOWN_ISSUES). */
export function buildAllianceFighter(): BuiltShip {
  const scale = 2;
  const L = 0.18 * scale;
  const parts = newParts();
  parts.hull.push(taperedBox(0.05 * scale, 0.035 * scale, L, 0.3, 0.9));
  const wing = taperedBox(0.2 * scale, 0.01 * scale, 0.08 * scale, 0.4, 1);
  parts.hull.push(at(wing, 0, 0, -0.02 * scale));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.03 * scale, 0.02 * scale, 0.06 * scale), 0.03 * scale, 0, -0.07 * scale));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.03 * scale, 0.02 * scale, 0.06 * scale), -0.03 * scale, 0, -0.07 * scale));
  parts.engine.push(at(zCylinder(0.012 * scale, 0.01 * scale, 0.01 * scale, 6), 0.03 * scale, 0, -0.1 * scale));
  parts.engine.push(at(zCylinder(0.012 * scale, 0.01 * scale, 0.01 * scale, 6), -0.03 * scale, 0, -0.1 * scale));
  parts.windows.push(at(new THREE.BoxGeometry(0.02 * scale, 0.012 * scale, 0.03 * scale), 0, 0.02 * scale, 0.02 * scale));
  return assemble(parts, 'alliance', [new THREE.Vector3(0.03 * scale, 0, -0.1 * scale), new THREE.Vector3(-0.03 * scale, 0, -0.1 * scale)], L);
}
