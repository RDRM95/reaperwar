import * as THREE from 'three';

/**
 * Battle camera rig. All modes write a desired position/look target; the rig
 * smooths toward them so switching modes produces a transition rather than a
 * cut. Positions are in render units.
 */
export type CameraMode = 'tactical' | 'cinematic' | 'follow' | 'free' | 'projectile' | 'reaper' | 'command';

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  tactical: 'Tactical',
  cinematic: 'Cinematic',
  follow: 'Ship follow',
  free: 'Free',
  projectile: 'Projectile',
  reaper: 'Reaper',
  command: 'Command',
};

export interface CameraSubject {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: THREE.Vector3;
  size: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'tactical';
  /** Orbit state for tactical camera. */
  yaw = 0.6;
  pitch = 0.55;
  distance = 900;
  focus = new THREE.Vector3();
  /** Free camera state. */
  freePos = new THREE.Vector3(0, 300, -900);
  freeYaw = 0;
  freePitch = -0.2;
  /** Smoothing. */
  private desiredPos = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private currentLook = new THREE.Vector3();
  private transition = 0;
  private shake = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 600_000);
    this.camera.position.set(0, 400, -1200);
    this.currentLook.set(0, 0, 0);
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    if (mode === 'free') {
      // Start free flight from where the camera currently is.
      this.freePos.copy(this.camera.position);
      const dir = this.tmp.copy(this.currentLook).sub(this.camera.position).normalize();
      this.freeYaw = Math.atan2(dir.x, dir.z);
      this.freePitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    }
    this.mode = mode;
    this.transition = 1;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  // --- Input hooks (called by the controller).
  orbit(dx: number, dy: number): void {
    if (this.mode === 'free') {
      this.freeYaw -= dx * 0.003;
      this.freePitch = THREE.MathUtils.clamp(this.freePitch - dy * 0.003, -1.5, 1.5);
      return;
    }
    this.yaw -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, -0.1, 1.5);
  }
  zoom(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(delta * 0.0012), 6, 60_000);
  }
  pan(dx: number, dy: number): void {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const k = this.distance * 0.0015;
    this.focus.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
  }
  freeMove(forward: number, strafe: number, up: number, dt: number, fast: boolean): void {
    const speed = (fast ? 2500 : 600) * dt;
    const dir = new THREE.Vector3(Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), Math.cos(this.freeYaw) * Math.cos(this.freePitch));
    const right = new THREE.Vector3(Math.cos(this.freeYaw), 0, -Math.sin(this.freeYaw));
    this.freePos.addScaledVector(dir, forward * speed).addScaledVector(right, strafe * speed).addScaledVector(new THREE.Vector3(0, 1, 0), up * speed);
  }

  /**
   * Per-frame update. `subject` is the followed ship for follow/reaper
   * modes; `cinematic` supplies a framing pair; `projectile` is the tracked
   * round. Any may be undefined, in which case the rig falls back to tactical.
   */
  update(dt: number, opts: { subject?: CameraSubject; cinematic?: { from: CameraSubject; to?: CameraSubject; age: number }; projectile?: CameraSubject; fleetCentre: THREE.Vector3 }): void {
    const cam = this.camera;
    let instant = false;
    switch (this.mode) {
      case 'tactical': {
        this.desiredLook.copy(this.focus);
        const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.distance);
        this.desiredPos.copy(this.focus).add(off);
        break;
      }
      case 'command': {
        this.desiredLook.copy(this.focus);
        this.desiredPos.copy(this.focus).add(new THREE.Vector3(Math.sin(this.yaw) * 0.08, 1, Math.cos(this.yaw) * 0.08).normalize().multiplyScalar(Math.max(this.distance, 1200)));
        break;
      }
      case 'follow': {
        const s = opts.subject;
        if (!s) return this.fallback(dt, opts.fleetCentre);
        const back = s.heading.clone().multiplyScalar(-s.size * 2.4 - 3);
        const up = new THREE.Vector3(0, s.size * 0.7 + 1.5, 0);
        const yawOff = new THREE.Vector3(Math.cos(this.yaw) * s.size * 1.1, 0, -Math.sin(this.yaw) * s.size * 1.1);
        this.desiredPos.copy(s.position).add(back).add(up).add(yawOff);
        this.desiredLook.copy(s.position).addScaledVector(s.heading, s.size * 1.2);
        break;
      }
      case 'reaper': {
        const s = opts.subject;
        if (!s) return this.fallback(dt, opts.fleetCentre);
        // Looking out from above and behind the Reaper's hood along its heading.
        this.desiredPos.copy(s.position).addScaledVector(s.heading, -s.size * 0.15).add(new THREE.Vector3(0, s.size * 0.5, 0));
        this.desiredLook.copy(s.position).addScaledVector(s.heading, s.size * 6).add(new THREE.Vector3(0, -s.size * 0.3, 0));
        break;
      }
      case 'projectile': {
        const p = opts.projectile;
        if (!p) return this.fallback(dt, opts.fleetCentre);
        const dir = p.velocity.clone().normalize();
        const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        this.desiredPos.copy(p.position).addScaledVector(dir, -40).addScaledVector(side, 14).add(new THREE.Vector3(0, 8, 0));
        this.desiredLook.copy(p.position).addScaledVector(dir, 60);
        instant = true;
        break;
      }
      case 'cinematic': {
        const c = opts.cinematic;
        if (!c) return this.fallback(dt, opts.fleetCentre);
        const from = c.from;
        const to = c.to;
        if (to) {
          // Frame both subjects from a point off the line between them.
          const mid = from.position.clone().add(to.position).multiplyScalar(0.5);
          const line = to.position.clone().sub(from.position);
          const dist = line.length();
          const side = new THREE.Vector3().crossVectors(line.normalize(), new THREE.Vector3(0, 1, 0)).normalize();
          const drift = Math.sin(c.age * 0.25) * 0.4;
          const back = Math.max(from.size * 3, dist * 0.45, 20);
          this.desiredPos.copy(from.position).addScaledVector(side, back * (0.8 + drift)).add(new THREE.Vector3(0, back * 0.35, 0)).addScaledVector(line, -from.size * 1.5);
          this.desiredLook.copy(mid).lerp(from.position, 0.35);
        } else {
          const ang = c.age * 0.12 + this.yaw;
          const r = from.size * 3.2 + 8;
          this.desiredPos.copy(from.position).add(new THREE.Vector3(Math.sin(ang) * r, from.size * 1.0 + 3, Math.cos(ang) * r));
          this.desiredLook.copy(from.position);
        }
        break;
      }
      case 'free': {
        this.desiredPos.copy(this.freePos);
        const dir = new THREE.Vector3(Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), Math.cos(this.freeYaw) * Math.cos(this.freePitch));
        this.desiredLook.copy(this.freePos).add(dir.multiplyScalar(100));
        instant = true;
        break;
      }
    }
    this.apply(dt, instant);
  }

  private fallback(dt: number, centre: THREE.Vector3): void {
    this.focus.lerp(centre, 0.05);
    this.desiredLook.copy(this.focus);
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.distance);
    this.desiredPos.copy(this.focus).add(off);
    this.apply(dt, false);
  }

  private apply(dt: number, instant: boolean): void {
    const cam = this.camera;
    if (this.transition > 0) this.transition = Math.max(0, this.transition - dt / 0.9);
    // Slower blend while transitioning, snappier otherwise.
    const k = instant && this.transition === 0 ? 1 : 1 - Math.exp(-dt * (this.transition > 0 ? 4 : 9));
    cam.position.lerp(this.desiredPos, k);
    this.currentLook.lerp(this.desiredLook, k);
    if (this.shake > 0) {
      const s = this.shake * 3;
      cam.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.currentLook);
    // Near plane scales with distance to focus for depth precision.
    const d = cam.position.distanceTo(this.currentLook);
    cam.near = THREE.MathUtils.clamp(d * 0.002, 0.2, 50);
    cam.updateProjectionMatrix();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
