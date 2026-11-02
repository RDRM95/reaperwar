/**
 * Camera driver contract (WORK_BREAKDOWN.md §1.3.14). Types only, Node-safe,
 * FROZEN after CORE: the cinematic director and the showcase shot-list player
 * (stage B) implement `CameraDriver`; `BattleView` (stage A) resolves
 * `SubjectRef`s and feeds the driver every frame and every event.
 */
import type * as THREE from 'three';
import type { Vec3 } from '@/core/vec3';
import type { BattleEvent, ShipRef, Side } from '@/simulation/types';

export interface CameraPose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  roll: number;
}

export interface SubjectPose {
  position: THREE.Vector3;
  heading: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
}

export type SubjectRef =
  | { ship: ShipRef }
  | { fleetCentre: Side | string }
  | { point: Vec3 }
  | { between: [SubjectRef, SubjectRef]; t?: number }
  | { lastEvent: 'drive_run_impact' | 'hades_detonation' | 'ship_destroyed' | 'ship_arrival_flash' | 'flagship_destroyed'; filter?: { role?: string; side?: Side } }
  | { projectile: 'newest_heavy' }
  | { planetLimb: true }
  | { camera: true };

export interface CameraDriver {
  /** Returns the pose for this frame, or undefined to let the view fall back to its own camera path. */
  update(renderTime: number, resolve: (ref: SubjectRef) => SubjectPose | undefined): CameraPose | undefined;
  onEvent(e: BattleEvent): void;
  /** True once the driver has nothing more to show (the showcase player treats it as "scene over"). */
  readonly exhausted?: boolean;
}
