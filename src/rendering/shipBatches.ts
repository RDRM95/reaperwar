import * as THREE from 'three';
import type { ShipState } from '@/simulation/types';
import { getShipTemplate } from './ships';
import { DETAIL_MESH_NAMES, type LodLevel } from './lod';

/**
 * Draw-call batching for large fleets: repeated ships of the same class share
 * geometry and material. Each instance receives its own 3D transform.
 * Hero/selected/followed ships keep standalone models and effects.
 */
interface BatchPart {
  mesh: THREE.InstancedMesh;
  localMatrix: THREE.Matrix4;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

interface Batch {
  capacity: number;
  count: number;
  parts: BatchPart[];
}

const FORWARD = new THREE.Vector3(0, 0, 1);
const UNIT = new THREE.Vector3(1, 1, 1);

export class ShipBatches {
  private readonly batches = new Map<string, Batch>();
  private readonly baseCapacities = new Map<string, number>();
  private readonly pose = new THREE.Matrix4();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();

  constructor(private readonly scene: THREE.Scene, ships: readonly ShipState[]) {
    for (const ship of ships) this.baseCapacities.set(ship.classId, (this.baseCapacities.get(ship.classId) ?? 0) + 1);
  }

  private createBatch(classId: string, level: 'full' | 'reduced', capacity: number): Batch {
    const template = getShipTemplate(classId);
    template.group.updateMatrixWorld(true);
    const parts: BatchPart[] = [];
    template.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      if (level === 'reduced' && DETAIL_MESH_NAMES.has(mesh.name)) return;
      const geometry = mesh.geometry;
      if (!geometry || !geometry.isBufferGeometry) return;
      const material = mesh.material;
      const instance = new THREE.InstancedMesh(geometry, material, capacity);
      instance.name = 'fleet-batch:' + classId + ':' + level + ':' + mesh.name;
      instance.frustumCulled = false;
      instance.count = 0;
      instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(instance);
      parts.push({ mesh: instance, localMatrix: mesh.matrixWorld.clone(), geometry, material });
    });
    return { capacity, count: 0, parts };
  }

  private grow(batch: Batch, required: number): void {
    const capacity = Math.max(required, batch.capacity * 2);
    for (const part of batch.parts) {
      const old = part.mesh;
      this.scene.remove(old);
      old.dispose(); // release the prior instance-matrix GPU buffers
      const replacement = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      replacement.name = old.name;
      replacement.frustumCulled = false;
      replacement.count = 0;
      replacement.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(replacement);
      part.mesh = replacement;
    }
    batch.capacity = capacity;
  }

  beginFrame(): void {
    for (const batch of this.batches.values()) batch.count = 0;
  }

  submit(ship: ShipState, level: LodLevel, x: number, y: number, z: number): void {
    if (level === 'point') return;
    const key = ship.classId + ':' + level;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = this.createBatch(ship.classId, level, Math.max(16, this.baseCapacities.get(ship.classId) ?? 16));
      this.batches.set(key, batch);
    }
    if (batch.count === batch.capacity) this.grow(batch, batch.count + 1);
    const index = batch.count++;
    this.position.set(x, y, z);
    this.heading.set(ship.heading.x, ship.heading.y, ship.heading.z);
    if (this.heading.lengthSq() < 1e-10) this.heading.copy(FORWARD);
    else this.heading.normalize();
    this.rotation.setFromUnitVectors(FORWARD, this.heading);
    this.pose.compose(this.position, this.rotation, UNIT);
    for (const part of batch.parts) {
      this.matrix.multiplyMatrices(this.pose, part.localMatrix);
      part.mesh.setMatrixAt(index, this.matrix);
    }
  }

  endFrame(): void {
    for (const batch of this.batches.values()) {
      for (const part of batch.parts) {
        part.mesh.count = batch.count;
        if (batch.count > 0) part.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  clear(): void {
    for (const batch of this.batches.values()) {
      for (const part of batch.parts) {
        this.scene.remove(part.mesh);
        part.mesh.dispose(); // do not dispose shared template geometry/material
      }
    }
    this.batches.clear();
  }
}
