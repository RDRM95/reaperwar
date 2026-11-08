import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '@/rendering/cameras';

describe('camera control', () => {
  it('a drag in a director-driven mode hands the camera to a free orbit from exactly where it is', () => {
    for (const mode of ['cinematic', 'projectile', 'reaper', 'command', 'shot'] as const) {
      const rig = new CameraRig(16 / 9);
      rig.setMode(mode);
      rig.camera.position.set(120, 80, -300);
      // The rig looks at the origin (its starting look point); a zero-length drag takes control without moving.
      rig.orbit(0, 0);
      expect(rig.mode).toBe('tactical');
      const off = new THREE.Vector3(Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch)).multiplyScalar(rig.distance);
      const pos = rig.focus.clone().add(off);
      expect(pos.distanceTo(rig.camera.position)).toBeLessThan(1e-6);
    }
  });

  it('the wheel also takes control, and zoom spans hull scale to the whole battlespace', () => {
    const rig = new CameraRig(1);
    rig.setMode('cinematic');
    rig.zoom(-1e9);
    expect(rig.mode).toBe('tactical');
    expect(rig.distance).toBe(CameraRig.MIN_DISTANCE);
    rig.zoom(1e9);
    expect(rig.distance).toBe(CameraRig.MAX_DISTANCE);
  });

  it('player-driven modes keep their own controls', () => {
    for (const mode of ['tactical', 'follow', 'free'] as const) {
      const rig = new CameraRig(1);
      rig.setMode(mode);
      rig.orbit(10, 10);
      expect(rig.mode).toBe(mode);
    }
  });

  it('orbit pitch stops just short of the poles', () => {
    const rig = new CameraRig(1);
    rig.orbit(0, 1e6);
    expect(rig.pitch).toBeCloseTo(CameraRig.MAX_PITCH, 6);
    rig.orbit(0, -1e6);
    expect(rig.pitch).toBeCloseTo(-CameraRig.MAX_PITCH, 6);
  });
});
