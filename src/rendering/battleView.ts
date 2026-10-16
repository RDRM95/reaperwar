import * as THREE from 'three';
import type { BattleSimulation } from '@/simulation/battle';
import { SIM_DT } from '@/simulation/battle';
import type { BattleEvent, ShipState } from '@/simulation/types';
import { getFaction } from '@/data/factions';
import { CameraRig, type CameraSubject } from './cameras';
import { EffectsSystem } from './effects';
import { buildEnvironment, type EnvironmentBuild } from './environment';
import { KM } from './geometry';
import { instantiateShip, type BuiltShip } from './ships';

/**
 * Binds a BattleSimulation to a Three.js scene. The simulation owns all
 * state; this class only reads it (with interpolation between fixed steps)
 * and reacts to its events.
 */

export interface ShipVisual {
  ship: ShipState;
  built: BuiltShip;
  glows: THREE.Sprite[];
  dying?: { timer: number; duration: number; nextSecondary: number };
  removed: boolean;
  /** Unique materials for damage tinting (cloned lazily on first damage). */
  tinted: boolean;
}

export interface GraphicsSettings {
  quality: 'low' | 'medium' | 'high';
  showEngineGlow: boolean;
  pixelRatioCap: number;
}

export class BattleView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly effects = new EffectsSystem();
  readonly visuals = new Map<string, ShipVisual>();
  env!: EnvironmentBuild;
  sim: BattleSimulation;
  /** Interpolation alpha within the current fixed step (0..1). */
  alpha = 0;
  selectedIds = new Set<string>();
  followId?: string;
  /** Cinematic director state. */
  private cine: { fromId?: string; toId?: string; age: number; hold: number } = { age: 0, hold: 0 };
  private projectileTrack?: { id: number };
  private readonly glowTex: THREE.Texture;
  private sunLight: THREE.DirectionalLight;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly fwd = new THREE.Vector3(0, 0, 1);
  settings: GraphicsSettings;
  private eventQueue: BattleEvent[] = [];

  constructor(canvas: HTMLCanvasElement, sim: BattleSimulation, settings: GraphicsSettings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.sim = sim;

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(c);

    this.sunLight = new THREE.DirectionalLight(0xfff2e0, 2.6);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1420, 0.55));
    this.scene.add(new THREE.AmbientLight(0x404a60, 0.35));
    this.scene.add(this.effects.group);
    this.bind(sim);
  }

  /** Attach to a (new) simulation, rebuilding the scene content. */
  bind(sim: BattleSimulation): void {
    this.sim = sim;
    for (const v of this.visuals.values()) this.scene.remove(v.built.group);
    this.visuals.clear();
    this.effects.clear();
    if (this.env) this.scene.remove(this.env.group);
    this.env = buildEnvironment(sim.config.environment);
    this.scene.add(this.env.group);
    this.sunLight.position.copy(this.env.sunDirection).multiplyScalar(10_000);
    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight.target);
    for (const s of sim.ships) this.ensureVisual(s);
    sim.onEvent = (e) => this.eventQueue.push(e);
    this.selectedIds.clear();
    this.followId = undefined;
    this.cine = { age: 0, hold: 0 };
    // Frame the player's fleet.
    const centre = this.sideCentre(sim.config.perspectiveSide);
    this.rig.focus.copy(centre);
    this.rig.distance = 320;
    this.rig.yaw = Math.PI + 0.6;
    this.rig.pitch = 0.42;
  }

  private ensureVisual(ship: ShipState): ShipVisual {
    let v = this.visuals.get(ship.id);
    if (v) return v;
    const built = instantiateShip(ship.classId);
    const glows: THREE.Sprite[] = [];
    if (this.settings.showEngineGlow) {
      const color = getFaction(ship.faction).engineColourHex;
      for (const node of built.engineNodes) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
        sp.position.copy(node);
        const s = Math.max(0.3, built.lengthUnits * (ship.faction === 'reaper' ? 0.12 : 0.11));
        sp.scale.set(s, s, 1);
        built.group.add(sp);
        glows.push(sp);
      }
    }
    built.group.name = ship.id;
    built.group.userData.shipId = ship.id;
    this.scene.add(built.group);
    v = { ship, built, glows, removed: false, tinted: false };
    this.visuals.set(ship.id, v);
    this.placeVisual(v, 1);
    return v;
  }

  private placeVisual(v: ShipVisual, alpha: number): void {
    const s = v.ship;
    const g = v.built.group;
    g.position.set(
      (s.prevPos.x + (s.pos.x - s.prevPos.x) * alpha) * KM,
      (s.prevPos.y + (s.pos.y - s.prevPos.y) * alpha) * KM,
      (s.prevPos.z + (s.pos.z - s.prevPos.z) * alpha) * KM,
    );
    this.tmpA.set(s.prevHeading.x + (s.heading.x - s.prevHeading.x) * alpha, s.prevHeading.y + (s.heading.y - s.prevHeading.y) * alpha, s.prevHeading.z + (s.heading.z - s.prevHeading.z) * alpha).normalize();
    this.tmpQ.setFromUnitVectors(this.fwd, this.tmpA);
    g.quaternion.copy(this.tmpQ);
    // Subtle bank for small ships based on lateral velocity.
    if (s.role === 'fighter' || s.role === 'frigate') {
      const right = this.tmpB.set(this.tmpA.z, 0, -this.tmpA.x);
      const lat = s.vel.x * right.x + s.vel.z * right.z;
      g.rotateZ(-lat * (s.role === 'fighter' ? 0.5 : 0.25));
    }
  }

  // ------------------------------------------------------------- per frame

  update(dt: number, alpha: number): void {
    this.alpha = alpha;
    this.processEvents();
    const sim = this.sim;
    for (const ship of sim.ships) {
      const v = this.ensureVisual(ship);
      if (v.removed) continue;
      if (!ship.alive) {
        this.updateDying(v, dt);
        continue;
      }
      if (ship.escaped) {
        v.built.group.visible = false;
        continue;
      }
      this.placeVisual(v, alpha);
      // Engine glow intensity follows throttle.
      const speedFrac = Math.min(1, Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) / Math.max(0.01, ship.maxSpeed));
      for (const gl of v.glows) (gl.material as THREE.SpriteMaterial).opacity = 0.35 + 0.6 * speedFrac * ship.subsystems.engines;
      // Damage tint.
      const hullFrac = ship.hull / ship.maxHull;
      if (hullFrac < 0.6 && !v.tinted) this.tintDamage(v);
      if (v.tinted) {
        const t = 1 - hullFrac;
        v.built.group.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial && o.name === 'hull') {
            m.emissive.setRGB(0.25 * t * (0.6 + 0.4 * Math.sin(sim.time * 7 + ship.id.length)), 0.05 * t, 0);
            m.emissiveIntensity = 1;
          }
        });
      }
    }
    // Effects from sim state.
    const tracers = sim.projectiles.map((p) => ({ pos: p.pos, vel: p.vel, big: p.weapon.damage >= 600 }));
    this.effects.setTracers(tracers, alpha, SIM_DT);
    this.effects.setMissiles(sim.missiles.filter((m) => m.alive).map((m) => ({ pos: m.pos, vel: m.vel })), alpha, SIM_DT);
    const beams: { start: THREE.Vector3; end: THREE.Vector3; kind: 'thanix' | 'reaper_beam'; intensity: number }[] = [];
    for (const ship of sim.ships) {
      if (!ship.alive) continue;
      for (const w of ship.weapons) {
        if (w.beamRemaining > 0 && w.beamStart && w.beamEnd) {
          const kind = w.def.kind === 'thanix' ? 'thanix' : 'reaper_beam';
          const v = this.visuals.get(ship.id);
          // Start the beam at the model muzzle for Reapers (the eye), else at the hardpoint.
          let start: THREE.Vector3;
          if (v && v.built.muzzle && (ship.faction === 'reaper' || w.def.kind === 'thanix')) start = v.built.group.localToWorld(v.built.muzzle.clone());
          else start = new THREE.Vector3(w.beamStart.x * KM, w.beamStart.y * KM, w.beamStart.z * KM);
          const t = w.beamTargetId ? sim.getShip(w.beamTargetId) : undefined;
          const end = w.beamHit && t ? new THREE.Vector3(t.pos.x * KM, t.pos.y * KM, t.pos.z * KM) : new THREE.Vector3(w.beamEnd.x * KM, w.beamEnd.y * KM, w.beamEnd.z * KM);
          const intensity = kind === 'reaper_beam' ? (ship.role === 'reaper_capital' ? 1.3 : 0.7) : 0.9;
          beams.push({ start, end, kind, intensity });
        }
      }
    }
    this.effects.setBeams(beams);
    this.effects.setPointDefence(sim.flashes.map((f) => ({ from: new THREE.Vector3(f.from.x * KM, f.from.y * KM, f.from.z * KM), to: new THREE.Vector3(f.to.x * KM, f.to.y * KM, f.to.z * KM), reaper: f.kind === 'reaper_pd' })));
    this.effects.update(dt);

    // Camera.
    this.cine.age += dt;
    this.updateCamera(dt);
    // Sky objects follow the camera so the starfield never parallaxes.
    for (const o of this.env.skyObjects) if (o.name !== 'sun') o.position.copy(this.rig.camera.position);
    this.env.group.getObjectByName('sun')?.position.copy(this.rig.camera.position).addScaledVector(this.env.sunDirection, 150_000);
  }

  private tintDamage(v: ShipVisual): void {
    v.built.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name === 'hull') mesh.material = (mesh.material as THREE.Material).clone();
    });
    v.tinted = true;
  }

  private updateDying(v: ShipVisual, dt: number): void {
    const ship = v.ship;
    if (!v.dying) {
      const big = ship.role === 'dreadnought' || ship.role === 'carrier' || ship.role === 'reaper_capital';
      v.dying = { timer: 0, duration: big ? 2.2 : ship.role === 'cruiser' || ship.role === 'reaper_destroyer' ? 0.9 : 0.15, nextSecondary: 0 };
      if (!big && v.dying.duration < 0.2) {
        this.finishDeath(v);
        return;
      }
    }
    const d = v.dying;
    d.timer += dt;
    // Keep drifting on last velocity, shedding secondary explosions.
    v.built.group.position.add(this.tmpA.set(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM * dt * 0.6));
    v.built.group.rotateX(dt * 0.05);
    if (d.timer >= d.nextSecondary) {
      d.nextSecondary = d.timer + 0.12 + Math.random() * 0.25;
      const p = v.built.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * v.built.lengthUnits, (Math.random() - 0.5) * v.built.lengthUnits * 0.3, (Math.random() - 0.5) * v.built.lengthUnits));
      this.effects.secondary(p, v.built.lengthUnits * 0.5);
    }
    if (d.timer >= d.duration) this.finishDeath(v);
  }

  private finishDeath(v: ShipVisual): void {
    const ship = v.ship;
    const pos = v.built.group.position.clone();
    const pieces: THREE.Object3D[] = [];
    // Break the model apart: each merged part becomes a debris chunk.
    if (ship.role !== 'fighter') {
      for (const child of [...v.built.group.children]) {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = (mesh.material as THREE.Material).clone();
          pieces.push(mesh);
        }
      }
    }
    const vel = new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM * 0.5);
    this.effects.explosion(pos, v.built.lengthUnits, ship.faction === 'reaper', pieces, vel);
    for (const gl of v.glows) gl.visible = false;
    this.scene.remove(v.built.group);
    v.removed = true;
    const camDist = this.rig.camera.position.distanceTo(pos);
    this.rig.addShake(Math.min(1, (v.built.lengthUnits * 30) / Math.max(50, camDist)));
    if (this.followId === ship.id) this.followId = undefined;
    this.selectedIds.delete(ship.id);
  }

  private processEvents(): void {
    const q = this.eventQueue;
    this.eventQueue = [];
    for (const e of q) {
      switch (e.type) {
        case 'weapon_fired': {
          if (e.kind !== 'mass_accelerator') break;
          const ship = this.sim.getShip(e.shipId);
          const v = ship ? this.visuals.get(ship.id) : undefined;
          if (!ship || !v) break;
          const w = ship.weapons[e.weaponIndex];
          if (!w) break;
          const big = w.def.damage >= 600;
          if (!big && Math.random() > 0.35) break; // thin out small-gun flashes
          const local = big && v.built.muzzle ? v.built.muzzle.clone() : new THREE.Vector3(w.offset.x * KM, w.offset.y * KM, w.offset.z * KM);
          const world = v.built.group.localToWorld(local);
          const dir = new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z);
          this.effects.muzzleFlash(world, dir, big ? 6 : 1.4, ship.faction === 'reaper');
          if (big && this.rig.mode === 'cinematic' && Math.random() < 0.3) this.cine.hold = 0;
          if (big && this.rig.mode === 'projectile') this.projectileTrack = { id: this.sim.projectiles[this.sim.projectiles.length - 1]?.id ?? 0 };
          break;
        }
        case 'projectile_impact': {
          const t = this.sim.getShip(e.targetId);
          const v = t ? this.visuals.get(t.id) : undefined;
          const pos = new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM);
          this.effects.impact(pos, e.barrierDamage, e.hullDamage, v ? v.built.lengthUnits * 0.55 : 2, () => (v && !v.removed ? v.built.group.position : undefined), e.damageType);
          break;
        }
        case 'missile_intercepted': {
          this.effects.impact(new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM), 0, 30, 1, () => undefined, 'warhead');
          break;
        }
        case 'ship_destroyed': {
          const v = this.visuals.get(e.shipId);
          if (v && (e.role === 'dreadnought' || e.role === 'reaper_capital' || e.role === 'carrier')) {
            // Cinematic director jumps to capital ship deaths.
            this.cine = { fromId: e.shipId, toId: undefined, age: 0, hold: 4 };
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------- cameras

  private subjectFor(ship: ShipState | undefined): CameraSubject | undefined {
    if (!ship) return undefined;
    const v = this.visuals.get(ship.id);
    if (!v) return undefined;
    return {
      position: v.built.group.position.clone(),
      velocity: new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM),
      heading: new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z),
      size: v.built.lengthUnits,
    };
  }

  sideCentre(side: 'A' | 'B'): THREE.Vector3 {
    const c = new THREE.Vector3();
    let n = 0;
    for (const s of this.sim.ships) {
      if (s.side !== side || !s.alive || s.escaped || s.role === 'fighter') continue;
      c.add(this.tmpA.set(s.pos.x, s.pos.y, s.pos.z).multiplyScalar(KM));
      n++;
    }
    return n > 0 ? c.multiplyScalar(1 / n) : c;
  }

  private updateCamera(dt: number): void {
    const sim = this.sim;
    const fleetCentre = this.sideCentre(sim.config.perspectiveSide);
    let subject: CameraSubject | undefined;
    if (this.rig.mode === 'follow') {
      const id = this.followId ?? [...this.selectedIds][0];
      const ship = id ? sim.getShip(id) : undefined;
      subject = this.subjectFor(ship && ship.alive ? ship : undefined);
      if (!subject) {
        // Default to the most valuable friendly ship.
        const best = sim.ships.filter((s) => s.alive && !s.escaped && s.side === sim.config.perspectiveSide).sort((a, b) => b.pointValue - a.pointValue)[0];
        if (best) this.followId = best.id;
        subject = this.subjectFor(best);
      }
    } else if (this.rig.mode === 'reaper') {
      const id = this.followId;
      let ship = id ? sim.getShip(id) : undefined;
      if (!ship || !ship.alive || ship.faction !== 'reaper') {
        ship = sim.ships.filter((s) => s.alive && !s.escaped && s.faction === 'reaper').sort((a, b) => b.pointValue - a.pointValue)[0];
        if (ship) this.followId = ship.id;
      }
      subject = this.subjectFor(ship);
    }
    let cinematic: { from: CameraSubject; to?: CameraSubject; age: number } | undefined;
    if (this.rig.mode === 'cinematic') {
      this.cine.hold -= dt;
      const from = this.cine.fromId ? sim.getShip(this.cine.fromId) : undefined;
      if (this.cine.hold <= 0 || !from || !from.alive) this.pickCinematicShot();
      const f = this.cine.fromId ? sim.getShip(this.cine.fromId) : undefined;
      const t = this.cine.toId ? sim.getShip(this.cine.toId) : undefined;
      const fs = this.subjectFor(f);
      if (fs) cinematic = { from: fs, to: this.subjectFor(t && t.alive ? t : undefined), age: this.cine.age };
    }
    let projectile: CameraSubject | undefined;
    if (this.rig.mode === 'projectile') {
      let p = this.projectileTrack ? sim.projectiles.find((x) => x.id === this.projectileTrack!.id) : undefined;
      if (!p) {
        p = [...sim.projectiles].sort((a, b) => b.weapon.damage - a.weapon.damage)[0];
        if (p) this.projectileTrack = { id: p.id };
      }
      if (p) {
        projectile = {
          position: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z).multiplyScalar(KM),
          velocity: new THREE.Vector3(p.vel.x, p.vel.y, p.vel.z).multiplyScalar(KM),
          heading: new THREE.Vector3(p.vel.x, p.vel.y, p.vel.z).normalize(),
          size: 2,
        };
      } else {
        // Between shots: hover near the biggest active beam or the fleet.
        const beamShip = sim.ships.find((s) => s.alive && s.weapons.some((w) => w.beamRemaining > 0 && w.def.kind === 'reaper_beam'));
        subject = this.subjectFor(beamShip);
        if (subject) {
          projectile = { position: subject.position.clone().addScaledVector(subject.heading, subject.size * 0.6), velocity: subject.heading.clone().multiplyScalar(50), heading: subject.heading, size: 2 };
        }
      }
    }
    this.rig.update(dt, { subject, cinematic, projectile, fleetCentre });
  }

  private pickCinematicShot(): void {
    const sim = this.sim;
    const alive = sim.ships.filter((s) => s.alive && !s.escaped && s.role !== 'fighter');
    if (alive.length === 0) return;
    // Prefer ships that are currently firing beams, then big ships with a target.
    const beaming = alive.filter((s) => s.weapons.some((w) => w.beamRemaining > 0));
    const pool = beaming.length > 0 && Math.random() < 0.6 ? beaming : alive.filter((s) => s.targetId && (s.role === 'dreadnought' || s.role === 'reaper_capital' || s.role === 'reaper_destroyer' || s.role === 'cruiser'));
    const from = (pool.length > 0 ? pool : alive)[Math.floor(Math.random() * (pool.length > 0 ? pool : alive).length)];
    const to = from.targetId ? sim.getShip(from.targetId) : undefined;
    this.cine = { fromId: from.id, toId: to && to.alive ? to.id : undefined, age: 0, hold: 5 + Math.random() * 4 };
  }

  // ------------------------------------------------------------ picking

  /** Pick the ship nearest to a screen point (CSS px). */
  pick(x: number, y: number, width: number, height: number): ShipState | undefined {
    const cam = this.rig.camera;
    let best: ShipState | undefined;
    let bestD = Infinity;
    for (const v of this.visuals.values()) {
      if (!v.ship.alive || v.ship.escaped || v.removed) continue;
      const p = this.tmpA.copy(v.built.group.position).project(cam);
      if (p.z > 1) continue;
      const sx = (p.x * 0.5 + 0.5) * width;
      const sy = (-p.y * 0.5 + 0.5) * height;
      const dist = cam.position.distanceTo(v.built.group.position);
      const radiusPx = Math.max(14, ((v.built.lengthUnits * 0.5) / Math.max(1, dist)) * (height / (2 * Math.tan((cam.fov * Math.PI) / 360))));
      const d = Math.hypot(sx - x, sy - y);
      if (d < radiusPx + 6 && d < bestD) {
        bestD = d;
        best = v.ship;
      }
    }
    return best;
  }

  /** Project a world position (km) to screen; returns undefined when behind the camera. */
  project(pos: { x: number; y: number; z: number }, width: number, height: number): { x: number; y: number; depth: number } | undefined {
    const p = this.tmpA.set(pos.x * KM, pos.y * KM, pos.z * KM);
    const depth = p.distanceTo(this.rig.camera.position);
    p.project(this.rig.camera);
    if (p.z > 1) return undefined;
    return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, depth };
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / Math.max(1, height));
  }

  render(): void {
    this.renderer.render(this.scene, this.rig.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
