import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getShipTemplate } from '@/rendering/ships';
import { cornerSolid, mirrorX, spindle, wingPanel } from '@/rendering/ships/fighterKit';
import { engineGlowSize } from '@/rendering/visualWeight';

/**
 * Fighters are craft, not boxes with lights on. Owner's report: fighters "draw too much visual attention ... like
 * sparks", "correct colour for actual organic fighters", "improve ship". Rendered close, each fighter was four to
 * six boxes with a canopy drawn as a cube in the lit-window material, and each of its engines carried a 30 m glow
 * on a 36 m craft: at any distance a white spark in a blue ball, whatever the faction's colours.
 */
const FIGHTERS = ['alliance_fighter', 'turian_fighter', 'salarian_fighter', 'cerberus_fighter', 'geth_fighter', 'quarian_fighter'] as const;
const meshes = (id: string) => getShipTemplate(id).group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
/** Signed volume of a triangle soup: positive when its faces wind outward. */
const volume = (geometry: THREE.BufferGeometry): number => {
  const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) v += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
  return v;
};
const size = (id: string) => new THREE.Box3().setFromObject(getShipTemplate(id).group).getSize(new THREE.Vector3());

describe('fighter models', () => {
  it('the kit builds closed solids whose faces wind outward, mirrored or not', () => {
    const box = cornerSolid([[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]]);
    expect(volume(box)).toBeCloseTo(1, 6);
    const panel = wingPanel(1, 1, 0.5, 0.3, 0.1);
    expect(volume(panel)).toBeGreaterThan(0);
    expect(volume(mirrorX(panel))).toBeCloseTo(volume(panel), 6);
    // The mirrored panel lies on the other side.
    expect(new THREE.Box3().setFromBufferAttribute(mirrorX(panel).getAttribute('position') as THREE.BufferAttribute).max.x).toBeCloseTo(0, 6);
    const body = spindle([{ z: -1, r: 0 }, { z: -0.5, r: 0.5 }, { z: 0.5, r: 0.5 }, { z: 1, r: 0 }], 8, 1);
    expect(volume(body)).toBeGreaterThan(0.5);
    // Stations run tail to nose: the nose station is at +z.
    expect(new THREE.Box3().setFromBufferAttribute(body.getAttribute('position') as THREE.BufferAttribute).max.z).toBeCloseTo(1, 3);
  });

  it.each(FIGHTERS)('%s is a winged craft of its stated length with its faces outward, within a small triangle budget', (id) => {
    const ship = getShipTemplate(id), box = size(id);
    let triangles = 0;
    for (const mesh of meshes(id)) {
      const count = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
      triangles += count;
      expect(volume(mesh.geometry), `${id} ${mesh.name}`).toBeGreaterThan(0);
      expect(['hull', 'hullDark', 'accent', 'engine', 'windows']).toContain(mesh.name);
    }
    // Measured: 220 to 380 triangles. Fighters are drawn as models only within 9 km of the camera at the
    // default detail scale, and as points beyond.
    expect(triangles).toBeGreaterThan(180);
    expect(triangles).toBeLessThanOrEqual(420);
    // Nose to exhaust is the stated length (the exhaust discs stand just proud of the nozzles).
    expect(box.z).toBeGreaterThan(ship.lengthUnits * 0.98);
    expect(box.z).toBeLessThan(ship.lengthUnits * 1.04);
    // Wings: half to four fifths as wide as long; and a flat craft, not a block.
    expect(box.x / box.z).toBeGreaterThan(0.45);
    expect(box.x / box.z).toBeLessThan(0.85);
    expect(box.y / box.z).toBeLessThan(0.42);
    // Every engine glow is attached at the stern.
    expect(ship.engineNodes.length).toBeGreaterThanOrEqual(1);
    for (const node of ship.engineNodes) expect(node.z).toBeLessThan(-ship.lengthUnits * 0.48);
    expect(ship.muzzle?.z).toBeCloseTo(ship.lengthUnits / 2, 6);
  });

  it('no piloted fighter has a lit canopy; the geth fighter has one small lens', () => {
    for (const id of FIGHTERS) {
      const lit = meshes(id).find((m) => m.name === 'windows');
      if (id !== 'geth_fighter') { expect(lit, id).toBeUndefined(); continue; }
      const lens = new THREE.Box3().setFromObject(lit!).getSize(new THREE.Vector3());
      expect(Math.max(lens.x, lens.y, lens.z)).toBeLessThan(getShipTemplate(id).lengthUnits * 0.08);
    }
  });

  it('each faction has its own silhouette', () => {
    const shapes = FIGHTERS.map((id) => { const b = size(id); return [b.x / b.z, b.y / b.z]; });
    for (let i = 0; i < shapes.length; i++) for (let j = 0; j < i; j++) {
      const apart = Math.hypot(shapes[i][0] - shapes[j][0], shapes[i][1] - shapes[j][1]);
      expect(apart, `${FIGHTERS[i]} and ${FIGHTERS[j]}`).toBeGreaterThan(0.02);
    }
  });

  it("a fighter's engine glow is a fifth of its length, where it was most of it; larger hulls are unchanged", () => {
    const trident = getShipTemplate('alliance_fighter').lengthUnits;
    expect(engineGlowSize(trident, 'fighter', false)).toBeCloseTo(0.072, 6);
    expect(engineGlowSize(trident, 'fighter', false) / trident).toBeLessThan(0.25);
    // The Oculus is drawn as a 12 m drone: its glow was 30 m and is 5 m.
    expect(engineGlowSize(getShipTemplate('reaper_oculus').lengthUnits, 'fighter', true)).toBe(0.05);
    // Hulls keep the rule they had: a ninth of the length, never under 30 m.
    expect(engineGlowSize(1.7, 'frigate', false)).toBe(0.3);
    expect(engineGlowSize(8.88, 'dreadnought', false)).toBeCloseTo(8.88 * 0.11, 9);
    expect(engineGlowSize(20, 'reaper_capital', true)).toBeCloseTo(2.4, 9);
  });
});
