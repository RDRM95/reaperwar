import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BattleSimulation } from '@/simulation/battle';
import { SIM_DT, mountWorldPosition } from '@/simulation/battle';
import type { BattleEvent, ShipState, WeaponState } from '@/simulation/types';
import { getFaction } from '@/data/factions';
import { CameraRig, type CameraSubject } from './cameras';
import type { CameraDriver, SubjectPose, SubjectRef } from './cameraDriver';
import type { ShipRef } from '@/simulation/types';
import { EffectsSystem } from './effects';
import { buildEnvironment, type EnvironmentBuild } from './environment';
import { KM } from './geometry';
import { getShipTemplate, instantiateShip, type BuiltShip } from './ships';
import { ShipBatches } from './shipBatches';
import { DETAIL_MESH_NAMES, detailedHullBudget, farPointCapacity, lodLevelSquared, type LodLevel } from './lod';
import { nearestDetailedShipIds } from './nearestDetailed';
import { FpsMeter, pixelRatioFor, presetFor, type QualityPreset } from './quality';

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
  /** Current level of detail. */
  lod: LodLevel;
}

export interface GraphicsSettings {
  /** Render preset (src/rendering/quality.ts). Ultra is meant for a dedicated GPU (the Local Edition starts there). */
  quality: 'low' | 'medium' | 'high' | 'ultra';
  showEngineGlow: boolean;
  pixelRatioCap: number;
  /** Distance-based level of detail (default on). */
  lod?: boolean;
  /** True once the player has changed a graphics setting; until then the Local Edition starts at Ultra. Read with a default of false. */
  chosen?: boolean;
  /** Render limit; 0 means unlimited. Local Edition defaults to 144 FPS. */
  frameCap?: number;
}

/** Anisotropic filtering on every texture map below `root`. */
function applyAnisotropy(root: THREE.Object3D, anisotropy: number): void {
  root.traverse((o) => {
    const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) map.anisotropy = anisotropy;
    }
  });
}

// Start with a small GPU buffer and grow only when a battle requires it.
const INITIAL_FAR_POINTS = 2048;

export class BattleView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly effects: EffectsSystem;
  /** Render preset for this battle's quality (fixed for the battle's lifetime). */
  readonly preset: QualityPreset;
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
  private fillLight: THREE.DirectionalLight;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly fwd = new THREE.Vector3(0, 0, 1);
  settings: GraphicsSettings;
  private eventQueue: BattleEvent[] = [];
  /** Beam mounts are indexed once per fixed simulation tick, not at every render frame. */
  private activeBeamTick = -1;
  private readonly activeBeamMounts: { ship: ShipState; weapon: WeaponState }[] = [];
  /** Shared point cloud for ships beyond mesh range (one draw call). */
  private readonly farPoints: THREE.Points;
  /** GPU instancing: many identical ships rendered with one draw per mesh part. */
  private shipBatches: ShipBatches;
  private farPositions = new Float32Array(INITIAL_FAR_POINTS * 3);
  private farColours = new Float32Array(INITIAL_FAR_POINTS * 3);
  private readonly tmpColour = new THREE.Color();
  private readonly farColourCache = new Map<string, readonly [number, number, number]>();
  /** The closest detailed hulls in a large battle; others stay in the GPU point cloud. */
  private detailedShips?: Set<string>;
  private detailBudgetFrame = 0;
  /** Draw calls of the last rendered frame. */
  drawCalls = 0;
  lodCounts = { full: 0, reduced: 0, point: 0 };
  /** Camera driver (director or shot-list player); undefined keeps today's camera paths. */
  driver?: CameraDriver;
  /** Interpolated simulation time of the frame being rendered: sim.time − SIM_DT + alpha × SIM_DT. */
  renderTime = 0;
  private readonly fpsMeter = new FpsMeter();

  constructor(canvas: HTMLCanvasElement, sim: BattleSimulation, settings: GraphicsSettings) {
    this.settings = settings;
    this.preset = presetFor(settings);
    this.effects = new EffectsSystem(this.preset.effectBudgetScale);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(pixelRatioFor(settings, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    // Image-based lighting so metallic hull plating reads as metal rather than
    // black: a neutral PMREM environment at low intensity (a larger map on Ultra).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: this.preset.envMapSize }).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
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
    if (this.preset.maxAnisotropy) {
      this.glowTex.anisotropy = this.maxAnisotropy;
      this.effects.setAnisotropy(this.maxAnisotropy);
    }

    this.sunLight = new THREE.DirectionalLight(0xfff2e0, 2.6);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1420, 0.7));
    this.scene.add(new THREE.AmbientLight(0x404a60, 0.45));
    // Camera-relative fill so hulls stay readable when viewed against the sun.
    this.fillLight = new THREE.DirectionalLight(0xb8c8e8, 0.9);
    this.scene.add(this.fillLight, this.fillLight.target);
    this.scene.add(this.effects.group);
    const farGeom = new THREE.BufferGeometry();
    farGeom.setAttribute('position', new THREE.BufferAttribute(this.farPositions, 3));
    farGeom.setAttribute('color', new THREE.BufferAttribute(this.farColours, 3));
    farGeom.setDrawRange(0, 0);
    this.farPoints = new THREE.Points(farGeom, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.farPoints.frustumCulled = false;
    this.farPoints.name = 'far-points';
    this.scene.add(this.farPoints);
    this.shipBatches = new ShipBatches(this.scene, sim.ships);
    this.bind(sim);
  }

  /** Attach to a (new) simulation, rebuilding the scene content. */
  bind(sim: BattleSimulation): void {
    this.sim = sim;
    this.activeBeamTick = -1;
    this.activeBeamMounts.length = 0;
    for (const v of this.visuals.values()) this.scene.remove(v.built.group);
    this.visuals.clear();
    this.shipBatches.clear();
    this.shipBatches = new ShipBatches(this.scene, sim.ships);
    this.detailedShips = undefined;
    this.detailBudgetFrame = 0;
    this.effects.clear();
    if (this.env) this.scene.remove(this.env.group);
    this.env = buildEnvironment(sim.config.environment);
    if (this.preset.maxAnisotropy) applyAnisotropy(this.env.group, this.maxAnisotropy);
    this.scene.add(this.env.group);
    this.sunLight.position.copy(this.env.sunDirection).multiplyScalar(10_000);
    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight.target);
    this.ensureFarCapacity(sim.ships.length);
    // Large engagements use GPU instances and lazy hero models. Do not create
    // thousands of cloned Three.js objects just to hide most of them as points.
    if (sim.ships.length < 500) for (const s of sim.ships) this.ensureVisual(s);
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

  /** Grow the one-draw-call far-ship cloud; never silently drop ships beyond 2,048. */
  private ensureFarCapacity(required: number): void {
    if (required <= this.farPositions.length / 3) return;
    const capacity = farPointCapacity(this.farPositions.length / 3, required);
    this.farPositions = new Float32Array(capacity * 3);
    this.farColours = new Float32Array(capacity * 3);
    this.farPoints.geometry.setAttribute('position', new THREE.BufferAttribute(this.farPositions, 3));
    this.farPoints.geometry.setAttribute('color', new THREE.BufferAttribute(this.farColours, 3));
  }

  private ensureVisual(ship: ShipState): ShipVisual {
    let v = this.visuals.get(ship.id);
    if (v) return v;
    const built = instantiateShip(ship.classId);
    const glows: THREE.Sprite[] = [];
    if (this.settings.showEngineGlow) {
      const color = getFaction(ship.faction).engineColourHex;
      built.engineNodes.forEach((node, i) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
        sp.position.copy(node);
        const s = Math.max(0.3, built.lengthUnits * (ship.faction === 'reaper' ? 0.12 : 0.11)) * (built.glowScales?.[i] ?? 1);
        sp.scale.set(s, s, 1);
        built.group.add(sp);
        glows.push(sp);
      });
    }
    built.group.name = ship.id;
    built.group.userData.shipId = ship.id;
    this.scene.add(built.group);
    v = { ship, built, glows, removed: false, tinted: false, lod: 'full' };
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

  /** Apply a level of detail to a visual: toggles detail meshes, glow sprites and the far-point fallback. */
  private applyLod(v: ShipVisual, level: LodLevel): void {
    if (v.lod === level) return;
    v.lod = level;
    const g = v.built.group;
    g.visible = level !== 'point';
    for (const child of g.children) {
      if ((child as THREE.Sprite).isSprite) child.visible = level === 'full';
      else if (DETAIL_MESH_NAMES.has(child.name)) child.visible = level === 'full';
    }
  }

  /** Attach (or detach, with undefined) a camera driver for the shot and cinematic modes. */
  attachDriver(driver?: CameraDriver): void {
    this.driver = driver;
  }

  update(dt: number, alpha: number): void {
    this.alpha = alpha;
    this.renderTime = this.sim.time - SIM_DT + alpha * SIM_DT;
    this.processEvents();
    const sim = this.sim;
    const cam = this.rig.camera.position;
    const lodOn = this.settings.lod !== false;
    const useBatches = sim.ships.length >= 500;
    this.shipBatches.beginFrame();
    // Ultra quality must not hold thousands of distant individual hull meshes
    // on screen. The camera still preserves full detail for close subjects.
    const lodScale = sim.ships.length >= 1500
      ? Math.min(this.preset.lodDistanceScale, 1.5)
      : sim.ships.length >= 500
        ? Math.min(this.preset.lodDistanceScale, 2)
        : this.preset.lodDistanceScale;
    this.ensureFarCapacity(sim.ships.length);
    // A finite draw-call budget matters more than raw GPU throughput when
    // thousands of hulls each have multiple meshes. Keep nearest models at
    // full fidelity; draw the rest as one GPU point cloud. Reassess 8 times
    // per eight frames rather than sorting every animation frame.
    const meshBudget = useBatches ? 24 : detailedHullBudget(sim.ships.length);
    if (!Number.isFinite(meshBudget)) this.detailedShips = undefined;
    else if (!this.detailedShips || ++this.detailBudgetFrame % 8 === 0) {
      this.detailedShips = nearestDetailedShipIds(sim.ships, cam, KM, meshBudget, useBatches);
    }
    let far = 0;
    this.lodCounts = { full: 0, reduced: 0, point: 0 };
    for (const ship of sim.ships) {
      let v = this.visuals.get(ship.id);
      if (v?.removed) continue;
      if (!ship.alive) {
        if (v) this.updateDying(v, dt);
        continue;
      }
      if (ship.escaped) {
        if (v) v.built.group.visible = false;
        continue;
      }
      // Do not recompute heading/quaternion for distant point-only ships.
      const point = this.tmpA.set(
        (ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * alpha) * KM,
        (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * alpha) * KM,
        (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * alpha) * KM,
      );
      const dx = point.x - cam.x, dy = point.y - cam.y, dz = point.z - cam.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      const selected = this.selectedIds.size <= 12 && this.selectedIds.has(ship.id);
      const hero = selected || this.followId === ship.id || (useBatches && distanceSquared < 700 * 700 && this.detailedShips?.has(ship.id));
      const lengthUnits = v?.built.lengthUnits ?? getShipTemplate(ship.classId).lengthUnits;
      const level = hero ? 'full' : useBatches
        ? lodLevelSquared(distanceSquared, lengthUnits, ship.role, lodOn, lodScale)
        : (!this.detailedShips || this.detailedShips.has(ship.id)) ? lodLevelSquared(distanceSquared, lengthUnits, ship.role, lodOn, lodScale) : 'point';
      if (useBatches && !hero) {
        if (v) { this.applyLod(v, 'point'); v.built.group.visible = false; }
        if (level !== 'point') {
          this.shipBatches.submit(ship, level, point.x, point.y, point.z);
          this.lodCounts[level]++;
          continue;
        }
      }
      if (level === 'point') {
        if (v) { this.applyLod(v, 'point'); v.built.group.visible = false; }
      } else {
        v = v ?? this.ensureVisual(ship);
        this.placeVisual(v, alpha);
        this.applyLod(v, level);
        v.built.group.visible = true;
      }
      this.lodCounts[level]++;
      if (level === 'point') {
        this.farPositions[far * 3] = point.x;
        this.farPositions[far * 3 + 1] = point.y;
        this.farPositions[far * 3 + 2] = point.z;
        let colour = this.farColourCache.get(ship.faction);
        if (!colour) {
          this.tmpColour.setHex(getFaction(ship.faction).engineColourHex);
          colour = [this.tmpColour.r, this.tmpColour.g, this.tmpColour.b];
          this.farColourCache.set(ship.faction, colour);
        }
        this.farColours[far * 3] = colour[0];
        this.farColours[far * 3 + 1] = colour[1];
        this.farColours[far * 3 + 2] = colour[2];
        far++;
        continue;
      }
      // Engine glow intensity follows throttle.
      const speedFrac = Math.min(1, Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) / Math.max(0.01, ship.maxSpeed));
      if (level === 'full' && v) for (const gl of v.glows) (gl.material as THREE.SpriteMaterial).opacity = 0.35 + 0.6 * speedFrac * ship.subsystems.engines;
      // Damage tint.
      const hullFrac = ship.hull / ship.maxHull;
      if (v && hullFrac < 0.6 && !v.tinted) this.tintDamage(v);
      if (v?.tinted) {
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
    this.shipBatches.endFrame();
    const farGeom = this.farPoints.geometry;
    farGeom.setDrawRange(0, far);
    (farGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (farGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.farPoints.visible = far > 0;
    // Effects from sim state.
    this.effects.setTracers(sim.projectiles, alpha, SIM_DT);
    this.effects.setMissiles(sim.missiles, alpha, SIM_DT);
    if (this.activeBeamTick !== sim.tick) {
      this.activeBeamTick = sim.tick;
      this.activeBeamMounts.length = 0;
      for (const ship of sim.ships) {
        if (!ship.alive) continue;
        for (const weapon of ship.weapons) {
          if (weapon.beamRemaining > 0 && weapon.beamStart && weapon.beamEnd)
            this.activeBeamMounts.push({ ship, weapon });
        }
      }
    }
    const beams: { start: THREE.Vector3; end: THREE.Vector3; kind: 'thanix' | 'reaper_beam'; intensity: number }[] = [];
    for (const { ship, weapon: w } of this.activeBeamMounts) {
      if (ship.alive && w.beamRemaining > 0 && w.beamStart && w.beamEnd) {
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
    this.effects.setBeams(beams);
    this.effects.setPointDefence(sim.flashes.map((f) => ({ from: new THREE.Vector3(f.from.x * KM, f.from.y * KM, f.from.z * KM), to: new THREE.Vector3(f.to.x * KM, f.to.y * KM, f.to.z * KM), reaper: f.kind === 'reaper_pd' })));
    this.effects.update(dt);

    // Camera.
    this.cine.age += dt;
    this.updateCamera(dt);
    // Fill light rides with the camera.
    this.fillLight.position.copy(this.rig.camera.position);
    this.fillLight.target.position.copy(this.rig.camera.position).add(this.rig.camera.getWorldDirection(this.tmpB).multiplyScalar(100));
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
      this.driver?.onEvent(e);
      switch (e.type) {
        case 'weapon_fired': {
          if (e.kind !== 'mass_accelerator') break;
          const ship = this.sim.getShip(e.shipId);
          if (!ship) break;
          const v = this.visuals.get(ship.id);
          const w = ship.weapons[e.weaponIndex];
          if (!w) break;
          const big = w.def.damage >= 600;
          if (!big && Math.random() > 0.35) break; // thin out small-gun flashes
          const local = v && big && v.built.muzzle ? v.built.muzzle.clone() : undefined;
          const mount = local ? undefined : mountWorldPosition(ship, e.weaponIndex);
          const world = v && local ? v.built.group.localToWorld(local)
            : mount ? new THREE.Vector3(mount.x * KM, mount.y * KM, mount.z * KM)
            : new THREE.Vector3(ship.pos.x * KM, ship.pos.y * KM, ship.pos.z * KM);
          const dir = new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z);
          this.effects.muzzleFlash(world, dir, big ? 6 : 1.4, ship.faction === 'reaper');
          if (big && this.rig.mode === 'cinematic' && this.cine.age > 4 && Math.random() < 0.2) this.cine.hold = 0;
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
          const ship = this.sim.getShip(e.shipId);
          // Instanced hulls have no individual death object to animate. Still
          // emit the normal explosion, at the ship's real simulated position.
          if (!v && ship) {
            const pos = new THREE.Vector3(ship.pos.x * KM, ship.pos.y * KM, ship.pos.z * KM);
            this.effects.explosion(pos, getShipTemplate(ship.classId).lengthUnits, ship.faction === 'reaper');
          }
          if ((v || ship) && (e.role === 'dreadnought' || e.role === 'reaper_capital' || e.role === 'carrier')) {
            this.cine = { fromId: e.shipId, toId: undefined, age: 0, hold: 7 };
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
    return {
      position: v ? v.built.group.position.clone() : new THREE.Vector3(ship.pos.x * KM, ship.pos.y * KM, ship.pos.z * KM),
      velocity: new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM),
      heading: new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z),
      size: v?.built.lengthUnits ?? getShipTemplate(ship.classId).lengthUnits,
    };
  }

  /** Resolve a beat-style ship reference; the simulation's own resolver is used once it exists (beats task), else id / name / fleet refs only. */
  private findShip(ref: ShipRef): ShipState | undefined {
    const sim = this.sim as BattleSimulation & { resolveShipRef?: (r: ShipRef) => ShipState | undefined };
    if (typeof sim.resolveShipRef === 'function') return sim.resolveShipRef(ref);
    if ('id' in ref) return sim.getShip(ref.id);
    if ('name' in ref) return sim.ships.find((s) => s.name === ref.name);
    if ('fleetId' in ref) {
      const matches = sim.ships.filter((s) => s.fleetId === ref.fleetId && (!ref.classId || s.classId === ref.classId) && (!ref.role || s.role === ref.role));
      return matches[ref.nth ?? 0];
    }
    return undefined;
  }

  /**
   * Resolve a camera subject for a driver. The CORE stub resolves ship,
   * fleetCentre and point references; stage A adds the rest (between,
   * lastEvent, projectile, planetLimb, camera).
   */
  resolveSubject(ref: SubjectRef): SubjectPose | undefined {
    if ('ship' in ref) {
      const ship = this.findShip(ref.ship);
      return this.subjectFor(ship && ship.alive ? ship : undefined);
    }
    if ('fleetCentre' in ref) {
      const key = ref.fleetCentre;
      const members = key === 'A' || key === 'B' ? this.sim.ships.filter((s) => s.side === key) : this.sim.ships.filter((s) => s.fleetId === key);
      const alive = members.filter((s) => s.alive && !s.escaped && s.role !== 'fighter');
      if (alive.length === 0) return undefined;
      const position = new THREE.Vector3();
      let size = 0;
      for (const s of alive) {
        position.add(new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z).multiplyScalar(KM));
        size = Math.max(size, this.visuals.get(s.id)?.built.lengthUnits ?? s.lengthKm * KM);
      }
      position.multiplyScalar(1 / alive.length);
      const fleet = key === 'A' || key === 'B' ? undefined : this.sim.fleets.get(key);
      const h = fleet ? fleet.heading : alive[0].heading;
      return { position, heading: new THREE.Vector3(h.x, h.y, h.z), velocity: new THREE.Vector3(), size: Math.max(size, 20) };
    }
    if ('point' in ref) {
      return { position: new THREE.Vector3(ref.point.x, ref.point.y, ref.point.z).multiplyScalar(KM), heading: new THREE.Vector3(0, 0, 1), velocity: new THREE.Vector3(), size: 2 };
    }
    return undefined;
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
    // A camera driver (shot list or director) owns the shot and cinematic modes while it returns poses;
    // when it returns nothing the view falls back to its own paths below.
    if (this.driver && (this.rig.mode === 'shot' || this.rig.mode === 'cinematic')) {
      const pose = this.driver.update(this.renderTime, (ref) => this.resolveSubject(ref));
      if (pose) {
        this.rig.setPose(pose, true);
        this.rig.update(dt, { fleetCentre });
        return;
      }
    }
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
    this.cine = { fromId: from.id, toId: to && to.alive ? to.id : undefined, age: 0, hold: 11 + Math.random() * 7 };
  }

  // ------------------------------------------------------------ picking

  /** Pick the ship nearest to a screen point (CSS px). */
  pick(x: number, y: number, width: number, height: number): ShipState | undefined {
    const cam = this.rig.camera;
    let best: ShipState | undefined;
    let bestD = Infinity;
    for (const ship of this.sim.ships) {
      if (!ship.alive || ship.escaped) continue;
      const v = this.visuals.get(ship.id);
      if (v?.removed) continue;
      const origin = this.tmpB.set(
        (ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * this.alpha) * KM,
        (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * this.alpha) * KM,
        (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * this.alpha) * KM,
      );
      const p = this.tmpA.copy(origin).project(cam);
      if (p.z > 1) continue;
      const sx = (p.x * 0.5 + 0.5) * width;
      const sy = (-p.y * 0.5 + 0.5) * height;
      const dist = cam.position.distanceTo(origin);
      const lengthUnits = v?.built.lengthUnits ?? getShipTemplate(ship.classId).lengthUnits;
      const radiusPx = Math.max(14, ((lengthUnits * 0.5) / Math.max(1, dist)) * (height / (2 * Math.tan((cam.fov * Math.PI) / 360))));
      const d = Math.hypot(sx - x, sy - y);
      if (d < radiusPx + 6 && d < bestD) {
        bestD = d;
        best = ship;
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
    // The window may have moved to a display with another pixel density.
    this.renderer.setPixelRatio(pixelRatioFor(this.settings, window.devicePixelRatio));
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / Math.max(1, height));
  }

  /** The GPU's maximum anisotropic filtering level. */
  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  /** Frames per second actually drawn (shown on the HUD at Ultra). */
  get fps(): number {
    return this.fpsMeter.fps;
  }

  render(): void {
    this.renderer.render(this.scene, this.rig.camera);
    this.drawCalls = this.renderer.info.render.calls;
    this.fpsMeter.tick(performance.now());
  }

  dispose(): void {
    this.shipBatches.clear();
    this.renderer.dispose();
  }
}
