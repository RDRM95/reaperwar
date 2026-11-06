import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ShipState } from '@/simulation/types';
import { ShipBatches } from '@/rendering/shipBatches';

const makeShip = (): ShipState => ({
  classId: 'alliance_frigate',
  heading: { x: 0, y: 0, z: 1 },
} as ShipState);

const active = (scene: THREE.Scene) => scene.children.filter(
  (object): object is THREE.InstancedMesh => (object as THREE.InstancedMesh).isInstancedMesh === true && (object as THREE.InstancedMesh).count > 0,
);

describe('large fleet instanced meshes', () => {
  it('submits identical vessels as instances instead of a clone for each ship', () => {
    const scene = new THREE.Scene();
    const ship = makeShip();
    const batches = new ShipBatches(scene, [ship, ship, ship]);
    batches.beginFrame();
    batches.submit(ship, 'full', 3, 4, 5);
    batches.submit(ship, 'full', 7, 8, 9);
    batches.endFrame();
    const meshes = active(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) expect(mesh.count).toBe(2);
    const matrix = new THREE.Matrix4();
    meshes[0].getMatrixAt(0, matrix);
    expect([matrix.elements[12], matrix.elements[13], matrix.elements[14]]).toEqual([3, 4, 5]);

    batches.beginFrame();
    batches.endFrame();
    expect(active(scene)).toHaveLength(0);
    batches.clear();
    expect(scene.children).toHaveLength(0);
  });

  it('keeps reduced geometry in a smaller batch and grows safely for reinforcements', () => {
    const scene = new THREE.Scene();
    const ship = makeShip();
    const batches = new ShipBatches(scene, [ship]);
    batches.beginFrame();
    for (let i = 0; i < 25; i++) batches.submit(ship, 'reduced', i, 0, 0);
    batches.endFrame();
    const meshes = active(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) expect(mesh.count).toBe(25);
    batches.clear();
    expect(scene.children).toHaveLength(0);
  });
});
