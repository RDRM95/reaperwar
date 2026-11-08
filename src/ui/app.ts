import { audio, type SoundId } from '@/audio/engine';
import { DEFAULT_PREFERENCES, storage, type Preferences } from '@/core/storage';
import { DEFAULT_PERF_BUDGET, type PerfBudget } from '@/core/perfGovernor';
import { schedulePresentation } from '@/core/frameLimiter';
import { BattleView } from '@/rendering/battleView';
import { BATCH_EVENT_THRESHOLD } from '@/rendering/eventBatching';
import { startupGraphics, webglAvailable } from '@/rendering/localHardware';
import type { CameraMode } from '@/rendering/cameras';
import { BattleSimulation } from '@/simulation/battle';
import type { BattleConfig, BattleEvent, BattleResult, FleetOrders } from '@/simulation/types';
import { FrameStats, NORMAL_SPEED_INDEX, PLAYBACK_SPEEDS, PlaybackClock, runToResult, type RunToResultOutcome } from './playback';
import { LocalSimDriver } from './simDriver';
import { PRESETS, getPreset } from '@/timelines/presets';
import { cloneRules, type RuleSet } from '@/timelines/rules';
import { normaliseRules } from '@/timelines/schema';
import type { ComparisonReport } from '@/scenarios/comparison';
import { clear, el, fmtTime } from './dom';
import { applyUiScale, normaliseUiScale } from './tvDisplay';
import { TacticalOverlay } from './overlay';
import { createHud, type Hud } from './screens/hud';
import { renderMenu } from './screens/menu';
import { renderBriefing } from './screens/briefing';
import { renderResults } from './screens/results';
import { renderComparison } from './screens/comparison';
import { renderCodex } from './screens/codex';
import { renderDatabase } from './screens/database';
import { renderCustom } from './screens/custom';
import { renderTimelines } from './screens/timelines';
import { renderSettings } from './screens/settings';
import { renderCampaign, renderCampaignSetup } from './screens/campaign';
import { renderPostWar } from './screens/postwar';
import { renderSaves } from './screens/saves';
import { createPostWar, type PostWarState } from '@/campaign/postwar';
import { applyEngagementResult, createCampaign, type CampaignOptions } from '@/campaign/engine';
import { normaliseCampaign } from '@/campaign/depth';
import type { CampaignState, PendingEngagement } from '@/campaign/state';

export type ScreenName = 'menu' | 'briefing' | 'battle' | 'results' | 'comparison' | 'codex' | 'database' | 'custom' | 'timelines' | 'settings' | 'campaign' | 'campaign_setup' | 'postwar' | 'saves';

export interface CampaignBattleLink {
  state: CampaignState;
  pending: PendingEngagement;
}

export interface LastBattle {
  sim: BattleSimulation;
  result: BattleResult;
  config: BattleConfig;
  comparison?: ComparisonReport;
  comparisonSide?: 'a' | 'b';
  campaign?: CampaignBattleLink;
}

/** Speed steps available to the player (src/ui/playback.ts). */
export const SPEEDS: readonly number[] = PLAYBACK_SPEEDS;
/** The tactical overlay's draw rate at 4× and above (Hz); below that it draws every frame. */
export const FAST_OVERLAY_HZ = 30;
/** HUD refresh cadence (s); at 4× and above the HUD's event feed is batched to it as well. */
const HUD_REFRESH_S = 0.25;
/** Progress overlay updates during Fast-forward (ms between DOM writes). */
const FF_PROGRESS_MS = 100;
/** Shot and impact audio hooks per batched frame: the audio engine plays at most 11 one-shots per 100 ms anyway. */
const FAST_AUDIO_HOOKS = 24;

/** A running Fast-forward to result (brief §19.1). */
export interface FastForwardState {
  /** Set to stop before the next slice; the run ends at the time reached and playback resumes at `resumeIndex`. */
  cancel: boolean;
  /** Speed step to resume at when cancelled (1× for the Cancel button; a speed button sets its own). */
  resumeIndex: number;
  startedAt: number;
  startTime: number;
  /** Ticks run by the fast-forward so far. */
  ticks: number;
}

const ema = (prev: number, x: number, a: number): number => (prev === 0 ? x : prev + a * (x - prev));

/**
 * Drives a live battle: fixed-step simulation at the chosen speed, the 3D
 * view, the tactical overlay, the HUD and all input.
 *
 * Playback (brief §19.1, docs/apex/PLAYBACK_PERF.md): the controller reaches the simulation only through its
 * SimDriver, and the PlaybackClock decides how many fixed ticks each presented frame runs within an adaptive budget;
 * the controller never mutates the simulation or draws from its generator, so the battle computed is the same at
 * every speed and frame rate. The owner's presentation limiter (src/core/frameLimiter.ts) decides which animation
 * frames present; the clock composes with it.
 */
export class BattleController {
  sim: BattleSimulation;
  /** The worker seam (src/ui/simDriver.ts): stepping, the end flag, the result and the event feed. */
  readonly driver: LocalSimDriver;
  /** Ticks per frame, the simulation budget, the bounded backlog and the achieved speed. */
  readonly clock: PlaybackClock;
  /** Per-frame cost averages for the performance HUD (F3). */
  readonly stats = new FrameStats();
  readonly view: BattleView;
  readonly overlay: TacticalOverlay;
  hud: Hud;
  hudHidden = false;
  /** A Fast-forward to result in progress. */
  fastForward?: FastForwardState;
  private lastFrame = performance.now();
  private nextPresentAt = 0;
  /** Recent main-thread costs; excludes GPU execution time. */
  simStepMs = 0;
  renderCpuMs = 0;
  private raf = 0;
  private disposed = false;
  private keys = new Set<string>();
  private dragging: { button: number; x: number; y: number; moved: boolean } | null = null;
  private hudTimer = 0;
  private overlayTimer = 0;
  /** Real seconds accumulated for the HUD's event feed since it was last fed (batched at fast speed). */
  private feedDt = 0;
  private ended = false;
  /** Events consumed by the HUD since it was last fed. */
  private pendingEvents: BattleEvent[] = [];
  readonly isReplay: boolean;
  /** Set when this battle resolves a campaign engagement. */
  campaignLink?: CampaignBattleLink;
  /** Coordinated-volley entry point for the HUD (stage B wires it; the HUD renders without it while undefined). */
  volley?: () => void;
  /** Showcase player state (stage B). */
  showcase?: unknown;

  constructor(
    readonly app: App,
    readonly config: BattleConfig,
    private canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    isReplay: boolean,
  ) {
    this.isReplay = isReplay;
    this.sim = new BattleSimulation(config);
    // The driver attaches after the constructor's battle_start and opening comms: as before, those are not fed back.
    this.driver = new LocalSimDriver(this.sim);
    this.clock = new PlaybackClock();
    this.view = new BattleView(canvas, this.sim, app.prefs.graphics);
    this.overlay = new TacticalOverlay(overlayCanvas);
    this.overlay.visible = app.prefs.showOverlay;
    this.hud = createHud(app, this);
    this.resize();
    this.bindInput();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    audio.startAmbience();
  }

  get speed(): number {
    return this.clock.speed;
  }
  /** Current speed step (index into SPEEDS). */
  get speedIndex(): number {
    return this.clock.speedIndex;
  }
  get paused(): boolean {
    return this.clock.paused;
  }
  set paused(v: boolean) {
    this.clock.paused = v;
  }

  get playerFleetIds(): string[] {
    return this.config.fleets.filter((f) => f.playerControlled).map((f) => f.id);
  }

  setSpeed(i: number): void {
    const index = Math.max(0, Math.min(SPEEDS.length - 1, Math.round(i)));
    if (this.fastForward) {
      // A speed chosen during a fast-forward ends it and resumes there.
      this.fastForward.resumeIndex = index;
      this.cancelFastForward();
      return;
    }
    this.clock.setSpeed(index);
    this.hud.refresh();
  }
  togglePause(): void {
    this.clock.paused = !this.clock.paused;
    this.hud.refresh();
  }
  setCamera(mode: CameraMode): void {
    this.view.rig.setMode(mode);
    this.hud.refresh();
  }
  /** Cycles full HUD → minimal (top bar only) → none (clean frame for recordings). */
  hudLevel: 'full' | 'minimal' | 'none' = 'full';
  toggleHud(): void {
    this.hudLevel = this.hudLevel === 'full' ? 'minimal' : this.hudLevel === 'minimal' ? 'none' : 'full';
    this.hudHidden = this.hudLevel !== 'full';
    this.hud.root.classList.toggle('hidden', this.hudHidden);
    this.hud.root.classList.toggle('none', this.hudLevel === 'none');
    this.overlay.visible = !this.hudHidden && this.app.prefs.showOverlay;
  }

  /** Issue a fleet order to all player fleets (or one fleet). */
  order(patch: Partial<FleetOrders>, fleetId?: string): void {
    const ids = fleetId ? [fleetId] : this.playerFleetIds;
    for (const id of ids) this.sim.issueOrders(id, patch);
    this.app.playUi('ui_confirm');
    this.hud.refresh();
    if (patch.order) this.hud.toast(`ORDER: ${patch.order.replace('_', ' ').toUpperCase()}`);
    if (patch.formation) this.hud.toast(`FORMATION: ${patch.formation.replace('_', ' ').toUpperCase()}`);
  }

  /** Right-click / attack command for the current selection. */
  attackWithSelection(targetId: string): void {
    const sel = [...this.view.selectedIds].filter((id) => {
      const s = this.sim.getShip(id);
      return s && s.side === this.config.perspectiveSide && s.alive;
    });
    if (sel.length > 0) this.sim.orderShipsAttack(sel, targetId);
    else for (const id of this.playerFleetIds) this.sim.issueOrders(id, { order: 'attack_target', targetId });
    this.app.playUi('ui_confirm');
    const t = this.sim.getShip(targetId);
    this.hud.toast(`ATTACK: ${(t?.name ?? targetId).toUpperCase()}`);
  }

  select(id: string | undefined, additive = false): void {
    if (!additive) this.view.selectedIds.clear();
    if (id) {
      if (additive && this.view.selectedIds.has(id)) this.view.selectedIds.delete(id);
      else this.view.selectedIds.add(id);
      this.view.followId = id;
    }
    this.hud.refresh();
  }

  selectFleet(): void {
    this.view.selectedIds.clear();
    for (const s of this.sim.ships) if (s.alive && !s.escaped && s.side === this.config.perspectiveSide && s.role !== 'fighter') this.view.selectedIds.add(s.id);
    this.hud.refresh();
  }

  focusOn(id: string): void {
    const s = this.sim.getShip(id);
    if (!s) return;
    this.view.rig.focus.set(s.pos.x * 10, s.pos.y * 10, s.pos.z * 10);
    this.view.followId = id;
  }

  private onSimEvent(e: BattleEvent): void {
    // Audio hooks with camera distance attenuation.
    const cam = this.view.rig.camera.position;
    const dist = (p: { x: number; y: number; z: number }) => Math.hypot(p.x * 10 - cam.x, p.y * 10 - cam.y, p.z * 10 - cam.z) / 10;
    switch (e.type) {
      case 'weapon_fired': {
        const s = this.sim.getShip(e.shipId);
        if (!s) break;
        const d = dist(s.pos);
        if (e.kind === 'mass_accelerator') {
          const w = s.weapons[e.weaponIndex];
          if (w && w.def.damage >= 600) audio.play('ma_large', d);
          else if (s.role !== 'fighter') audio.play('ma_small', d, 0.6);
        } else if (e.kind === 'reaper_beam') audio.play('reaper_beam', d, s.role === 'reaper_capital' ? 1 : 0.6);
        else if (e.kind === 'thanix') audio.play('thanix', d);
        else if (e.kind === 'gardian') audio.play('gardian', d, 0.4);
        else if (e.kind === 'disruptor_torpedo') audio.play('torpedo', d, 0.5);
        break;
      }
      case 'projectile_impact': {
        if (e.damage < 100) break;
        const d = dist(e.pos);
        if (e.barrierDamage > e.hullDamage) audio.play('impact_barrier', d, Math.min(1, e.damage / 800));
        else audio.play('impact_hull', d, Math.min(1, e.damage / 600));
        break;
      }
      case 'ship_destroyed': {
        const d = dist(e.pos);
        const big = e.role === 'dreadnought' || e.role === 'carrier' || e.role === 'reaper_capital';
        audio.play(big || e.role === 'cruiser' || e.role === 'reaper_destroyer' ? 'explosion_large' : 'explosion_small', d, big ? 1 : 0.6);
        break;
      }
      case 'reinforcement_arrival':
        audio.play('alert');
        this.hud.toast('REINFORCEMENTS DETECTED');
        break;
      case 'battle_end':
        this.ended = true;
        break;
      default:
        break;
    }
  }

  private loop(now: number): void {
    if (this.disposed) return;
    // Cap actual rendering, not the simulation's fixed timestep. A 144 Hz
    // monitor presents at most 144 frames; spare main-thread time goes to the
    // game's simulation rather than unnecessary offscreen frames. A skipped
    // callback advances nothing: the next presented frame's interval includes it.
    const gate = schedulePresentation(now, this.nextPresentAt, this.app.prefs.graphics.frameCap ?? 0);
    this.nextPresentAt = gate.nextAtMs;
    if (!gate.present) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const dtReal = Math.max(0, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    // Camera input and effects follow real time, capped so a stalled frame never jumps the view.
    const dtView = Math.min(0.1, dtReal);
    this.handleKeys(dtView);
    const fastForward = this.clock.mode === 'result';
    const t0 = performance.now();
    // 1. Simulation: the clock runs the ticks this frame owes, within its budget (none during a fast-forward, which
    //    steps in runToResult's own slices between frames).
    const report = this.clock.frame(dtReal, this.driver);
    const t1 = performance.now();
    // 2. The events of the ticks run: view queue, HUD feed and audio, outside any step. A fast-forward shows nothing of
    //    its stretch (its events are dropped from the effects, never from the simulation's log).
    const events = this.driver.drain();
    if (fastForward) {
      for (const e of events) if (e.type === 'battle_end') this.ended = true;
    } else this.dispatchEvents(events);
    const t2 = performance.now();
    const fast = this.clock.fast;
    let t3 = t2;
    let t4 = t2;
    let t5 = t2;
    if (!fastForward) {
      // 3. The 3D view, once per presented frame; at 4× and above the frame's effects are batched (render only).
      const alpha = this.paused ? 1 : this.clock.alpha;
      this.view.update(dtView, alpha, fast || events.length > BATCH_EVENT_THRESHOLD);
      t3 = performance.now();
      this.view.render();
      t4 = performance.now();
      // 4. The tactical overlay: every frame, or FAST_OVERLAY_HZ at 4× and above (the previous drawing stays up).
      this.overlayTimer += dtReal;
      if (!fast || this.overlayTimer >= 1 / FAST_OVERLAY_HZ) {
        this.overlayTimer = fast ? this.overlayTimer % (1 / FAST_OVERLAY_HZ) : 0;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.overlay.draw(this.view, w, h, this.view.rig.mode);
      }
      t5 = performance.now();
    }
    // 5. HUD: the event feed every frame, or batched with the refresh at 4× and above; the refresh four times a second.
    this.hudTimer -= dtReal;
    this.feedDt += dtReal;
    if (!fast || fastForward || this.hudTimer <= 0) {
      this.hud.tick(this.feedDt, this.pendingEvents);
      this.pendingEvents = [];
      this.feedDt = 0;
    }
    if (this.hudTimer <= 0) {
      this.hudTimer = HUD_REFRESH_S;
      this.hud.refresh();
      if (this.hud.perf.visible) this.hud.perf.refresh();
    }
    const t6 = performance.now();
    // The frame's non-simulation cost sets the next budget (fast-forward frames draw nothing and say nothing about it).
    if (!fastForward) this.clock.endFrame(t6 - t1);
    this.stats.record({ frame: dtReal * 1000, sim: t1 - t0, events: t2 - t1, view: t3 - t2, render: t4 - t3, overlay: t5 - t4, hud: t6 - t5, ticks: report.ran }, t6);
    this.simStepMs = ema(this.simStepMs, t1 - t0, 0.15);
    this.renderCpuMs = ema(this.renderCpuMs, t5 - t2, 0.15);
    if (this.ended && this.sim.result && !fastForward) {
      this.ended = false;
      this.hud.showEnd(this.sim.result);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Hand a frame's events to the view, the HUD feed and the audio: the controller's event hooks, run once per frame outside any step. */
  dispatchEvents(events: readonly BattleEvent[]): void {
    if (events.length === 0) return;
    this.view.pushEvents(events);
    for (const e of events) this.pendingEvents.push(e);
    // At fast speed only the first shots and impacts of a frame reach the audio hooks (camera-distance attenuation
    // costs a few microseconds each, and the engine plays at most 11 one-shots per 100 ms); losses and alerts always do.
    const budgeted = this.clock.fast || events.length > BATCH_EVENT_THRESHOLD;
    let oneShots = 0;
    for (const e of events) {
      if (budgeted && (e.type === 'weapon_fired' || e.type === 'projectile_impact') && ++oneShots > FAST_AUDIO_HOOKS) continue;
      this.onSimEvent(e);
    }
  }

  /**
   * Fast-forward to result (brief §19.1): step the battle to its end in time slices between frames, drawing nothing
   * meanwhile, with a progress overlay and Cancel; then open the normal results flow. Every tick is the same `step()`
   * normal playback runs, so the result, the losses, the hits and the event log are the ones normal playback computes.
   */
  fastForwardToResult(): void {
    if (this.fastForward || this.sim.finished || this.disposed) return;
    this.clock.setMode('result');
    const state: FastForwardState = { cancel: false, resumeIndex: NORMAL_SPEED_INDEX, startedAt: performance.now(), startTime: this.sim.time, ticks: 0 };
    this.fastForward = state;
    this.hud.fastForward.show();
    this.hud.refresh();
    let shownAt = 0;
    void runToResult(this.driver, {
      shouldCancel: () => state.cancel || this.disposed,
      isPaused: () => this.paused,
      onProgress: (p) => {
        state.ticks = p.ticks;
        const t = performance.now();
        if (t - shownAt >= FF_PROGRESS_MS) {
          shownAt = t;
          this.hud.fastForward.update();
        }
      },
    }).then((outcome) => this.endFastForward(outcome));
  }

  /** Stop a running fast-forward before its next slice; playback resumes at 1× from the time reached. */
  cancelFastForward(): void {
    if (this.fastForward) this.fastForward.cancel = true;
  }

  private endFastForward(outcome: RunToResultOutcome): void {
    const state = this.fastForward;
    this.fastForward = undefined;
    if (!state || this.disposed) return;
    // The skipped stretch is not drawn: drop its events from the effects and the hulls it lost from the scene (render
    // state only; the simulation's log holds every event).
    this.driver.drain();
    this.hud.fastForward.hide();
    this.view.catchUp();
    if (outcome.finished && this.sim.result) {
      this.ended = false;
      this.hud.viewResults();
      return;
    }
    this.clock.setMode('normal', state.resumeIndex);
    this.lastFrame = performance.now();
    this.hud.refresh();
    this.hud.toast(`FAST-FORWARD CANCELLED · ${this.speed}× FROM ${fmtTime(this.sim.time)}`);
  }

  private handleKeys(dt: number): void {
    const k = this.keys;
    if (this.view.rig.mode === 'free') {
      const f = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
      const s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
      const u = (k.has('r') ? 1 : 0) - (k.has('f') ? 1 : 0);
      if (f || s || u) this.view.rig.freeMove(f, s, u, dt, k.has('shift'));
    } else if (this.view.rig.mode === 'tactical' || this.view.rig.mode === 'command') {
      const f = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
      const s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
      if (f || s) this.view.rig.pan(s * 300 * dt, -f * 300 * dt);
      if (k.has('q')) this.view.rig.orbit(-120 * dt, 0);
      if (k.has('e')) this.view.rig.orbit(120 * dt, 0);
    }
  }

  private bindInput(): void {
    const c = this.canvas;
    // Touch: track active pointers for pinch-to-zoom.
    const touches = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let pinchCentre: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement) !== c) return;
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
          pinchCentre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          this.dragging = null; // two fingers: zoom and pan, not orbit
          return;
        }
      }
      this.dragging = { button: e.button, x: e.clientX, y: e.clientY, moved: false };
      c.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect();
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size >= 2) {
          const [a, b] = [...touches.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchDistance > 0 && Math.abs(d - pinchDistance) > 1) this.view.rig.zoom((pinchDistance - d) * 4);
          pinchDistance = d;
          // Two-finger drag pans: move by the centroid delta.
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          if (pinchCentre) this.view.rig.pan(cx - pinchCentre.x, cy - pinchCentre.y);
          pinchCentre = { x: cx, y: cy };
          return;
        }
      }
      if (this.dragging) {
        const dx = e.clientX - this.dragging.x;
        const dy = e.clientY - this.dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.dragging.moved = true;
        if (this.dragging.moved) {
          if (this.dragging.button === 0 || this.dragging.button === 2) this.view.rig.orbit(dx, dy);
          else this.view.rig.pan(dx, dy);
          this.dragging.x = e.clientX;
          this.dragging.y = e.clientY;
        }
      } else {
        const hit = this.view.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
        this.overlay.hoverId = hit?.id;
        c.style.cursor = hit ? 'pointer' : 'default';
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId);
        if (touches.size < 2) {
          pinchDistance = 0;
          pinchCentre = null;
        }
      }
      if (!this.dragging) return;
      const d = this.dragging;
      this.dragging = null;
      c.releasePointerCapture(e.pointerId);
      if (d.moved) return;
      const rect = c.getBoundingClientRect();
      const hit = this.view.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
      if (d.button === 0) {
        this.select(hit?.id, e.shiftKey);
        if (hit) this.app.playUi('ui_click');
      } else if (d.button === 2) {
        if (hit && hit.side !== this.config.perspectiveSide) this.attackWithSelection(hit.id);
        else if (hit && hit.side === this.config.perspectiveSide) {
          this.select(hit.id);
          this.view.rig.setMode('follow');
          this.hud.refresh();
        }
      }
    };
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.rig.zoom(e.deltaY);
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      const rect = c.getBoundingClientRect();
      const hit = this.view.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
      if (hit) {
        this.focusOn(hit.id);
        this.select(hit.id);
      }
    });
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onResize = this.onResize.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === 'shift') this.keys.add('shift');
    switch (k) {
      case ' ':
        e.preventDefault();
        this.togglePause();
        break;
      case '+':
      case '=':
      case ']':
        this.setSpeed(this.speedIndex + 1);
        break;
      case '-':
      case '[':
        this.setSpeed(this.speedIndex - 1);
        break;
      case 'h':
        this.toggleHud();
        break;
      case '1':
        this.setCamera('tactical');
        break;
      case '2':
        this.setCamera('cinematic');
        break;
      case '3':
        this.setCamera('follow');
        break;
      case '4':
        this.setCamera('free');
        break;
      case '5':
        this.setCamera('projectile');
        break;
      case '6':
        this.setCamera('reaper');
        break;
      case '7':
        this.setCamera('command');
        break;
      case 'tab':
        e.preventDefault();
        this.selectFleet();
        break;
      case 'escape':
        this.hud.toggleMenu();
        break;
      case 'end':
        e.preventDefault();
        if (this.fastForward) this.cancelFastForward();
        else this.fastForwardToResult();
        break;
      case 'f3':
        e.preventDefault();
        this.hud.perf.toggle();
        break;
      default:
        break;
    }
  }
  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
  }
  private onResize(): void {
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.view.resize(w, h);
    this.overlay.resize(w, h, Math.min(window.devicePixelRatio, 2));
  }

  dispose(): void {
    this.disposed = true;
    // A fast-forward in progress stops before its next slice (its continuation sees `disposed` and does nothing).
    this.cancelFastForward();
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.hud.root.remove();
    this.view.dispose();
    this.overlay.resize(1, 1, 1);
  }
}

export class App {
  readonly ui: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  prefs: Preferences = { ...DEFAULT_PREFERENCES };
  customTimelines: RuleSet[] = [];
  history: BattleResult[] = [];
  battle?: BattleController;
  lastBattle?: LastBattle;
  screen: ScreenName = 'menu';
  campaign?: CampaignState;
  postwar?: PostWarState;
  /** Set when returning to the campaign screen after a fought battle. */
  campaignResume = false;
  private toastTimer = 0;

  constructor() {
    this.ui = document.getElementById('ui')!;
    this.canvas = document.getElementById('battle-canvas') as HTMLCanvasElement;
    this.overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement;
    const unlock = () => {
      audio.init();
      audio.settings = { ...this.prefs.audio };
      audio.applySettings();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    this.ui.addEventListener('change', (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && (target.type === 'range' || target.type === 'checkbox'))) {
        this.playUi('ui_click');
      }
    });
  }

  async init(): Promise<void> {
    const savedPreferences = await storage.get<Partial<Preferences>>('preferences', DEFAULT_PREFERENCES);
    this.prefs = { ...DEFAULT_PREFERENCES, ...savedPreferences };
    this.prefs.uiScale = normaliseUiScale(savedPreferences?.uiScale, window.innerWidth);
    applyUiScale(this.ui, this.prefs.uiScale);
    this.prefs.graphics = startupGraphics({ ...DEFAULT_PREFERENCES.graphics, ...this.prefs.graphics });
    this.prefs.audio = { ...DEFAULT_PREFERENCES.audio, ...this.prefs.audio };
    this.prefs.showcase = { ...DEFAULT_PREFERENCES.showcase, ...this.prefs.showcase };
    this.prefs.perf = { ...DEFAULT_PREFERENCES.perf, ...this.prefs.perf, budget: { ...DEFAULT_PERF_BUDGET, ...this.prefs.perf?.budget } };
    this.customTimelines = (await storage.get<RuleSet[]>('customTimelines', [])).map(normaliseRules);
    this.history = await storage.get('battleHistory', []);
    audio.settings = { ...this.prefs.audio };
    this.show('menu');
    document.getElementById('boot')?.classList.add('hidden');
  }

  // ------------------------------------------------------------- timelines

  allTimelines(): RuleSet[] {
    return [...PRESETS, ...this.customTimelines];
  }
  getTimeline(id: string): RuleSet {
    const c = this.customTimelines.find((t) => t.id === id);
    if (c) return normaliseRules(cloneRules(c));
    try {
      return getPreset(id);
    } catch {
      return getPreset('canon_me3');
    }
  }
  currentRules(): RuleSet {
    return this.getTimeline(this.prefs.lastTimelineId);
  }
  selectTimeline(id: string): void {
    this.prefs.lastTimelineId = id;
    void this.savePrefs();
  }
  saveCustomTimeline(rules: RuleSet): void {
    const i = this.customTimelines.findIndex((t) => t.id === rules.id);
    if (i >= 0) this.customTimelines[i] = rules;
    else this.customTimelines.push(rules);
    void storage.set('customTimelines', this.customTimelines);
  }
  deleteCustomTimeline(id: string): void {
    this.customTimelines = this.customTimelines.filter((t) => t.id !== id);
    if (this.prefs.lastTimelineId === id) this.prefs.lastTimelineId = 'canon_me3';
    void storage.set('customTimelines', this.customTimelines);
  }

  /** Measure the machine's performance budget (stage B's controller measurement loop replaces the stub, which returns the stored budget). */
  async measurePerfBudget(): Promise<PerfBudget> {
    return this.prefs.perf.budget;
  }

  async savePrefs(): Promise<void> {
    applyUiScale(this.ui, this.prefs.uiScale);
    await storage.set('preferences', this.prefs);
    audio.settings = { ...this.prefs.audio };
    audio.applySettings();
  }

  playUi(id: SoundId): void {
    audio.play(id);
  }

  // ---------------------------------------------------------------- screens

  show(screen: ScreenName, params?: unknown): void {
    if (screen !== this.screen && screen !== 'battle') this.playUi('ui_open');
    if (screen !== 'battle' && this.battle) {
      this.battle.dispose();
      this.battle = undefined;
      this.canvas.style.visibility = 'hidden';
    }
    this.screen = screen;
    clear(this.ui);
    let node: HTMLElement;
    switch (screen) {
      case 'menu':
        node = renderMenu(this);
        break;
      case 'briefing':
        node = renderBriefing(this, params as { scenarioId?: string } | undefined);
        break;
      case 'results':
        node = renderResults(this);
        break;
      case 'comparison':
        node = renderComparison(this, params as { report?: ComparisonReport } | undefined);
        break;
      case 'codex':
        node = renderCodex(this);
        break;
      case 'database':
        node = renderDatabase(this);
        break;
      case 'custom':
        node = renderCustom(this);
        break;
      case 'timelines':
        node = renderTimelines(this, params as { editId?: string } | undefined);
        break;
      case 'settings':
        node = renderSettings(this);
        break;
      case 'campaign_setup':
        node = renderCampaignSetup(this);
        break;
      case 'campaign':
        node = this.campaign ? renderCampaign(this, this.campaign) : renderMenu(this);
        break;
      case 'postwar':
        node = this.postwar ? renderPostWar(this, this.postwar) : renderMenu(this);
        break;
      case 'saves':
        node = renderSaves(this, params as { saveCurrent?: 'campaign' | 'postwar' } | undefined);
        break;
      case 'battle':
        node = el('div');
        break;
    }
    this.ui.appendChild(node);
  }

  /** Start (or replay) a battle. */
  startCampaign(opts: CampaignOptions): void {
    this.campaign = createCampaign(opts);
    void storage.set('campaign', this.campaign);
    this.show('campaign');
  }

  startPostWar(rules: RuleSet, seed: number): void {
    this.postwar = createPostWar(rules, seed);
    void storage.set('postwar', this.postwar);
    this.show('postwar');
  }

  async loadPostWar(): Promise<boolean> {
    const saved = await storage.get<PostWarState | undefined>('postwar', undefined);
    if (!saved || typeof saved !== 'object' || !saved.metrics) return false;
    this.postwar = saved;
    this.show('postwar');
    return true;
  }

  async loadCampaign(): Promise<boolean> {
    const saved = await storage.get<CampaignState | undefined>('campaign', undefined);
    if (!saved || typeof saved !== 'object' || !saved.systems || !saved.fleets) return false;
    this.resumeCampaign(saved);
    return true;
  }

  /** Resume a campaign from slot data: it becomes the active game and the autosave. */
  resumeCampaign(state: CampaignState): void {
    this.campaign = normaliseCampaign(state);
    void storage.set('campaign', this.campaign);
    this.show('campaign');
  }

  resumePostWar(state: PostWarState): void {
    this.postwar = state;
    void storage.set('postwar', this.postwar);
    this.show('postwar');
  }

  startBattle(config: BattleConfig, opts: { replay?: boolean; comparison?: ComparisonReport; comparisonSide?: 'a' | 'b'; campaign?: CampaignBattleLink } = {}): void {
    if (this.battle) {
      this.battle.dispose();
      this.battle = undefined;
    }
    clear(this.ui);
    this.screen = 'battle';
    this.canvas.style.visibility = 'visible';
    let controller: BattleController;
    try {
      controller = new BattleController(this, config, this.canvas, this.overlayCanvas, !!opts.replay);
    } catch (err) {
      // Without WebGL (graphics acceleration off, a crashed GPU process, a remote desktop) the 3D view
      // cannot be created: go back to the menu and say why, instead of leaving a blank screen.
      console.error(err);
      this.canvas.style.visibility = 'hidden';
      // A campaign engagement stays pending: back on the campaign map it can still be auto-resolved.
      this.show(opts.campaign ? 'campaign' : 'menu');
      this.toast(
        webglAvailable()
          ? 'THE BATTLE COULD NOT START: SEE THE BROWSER CONSOLE (F12)'
          : 'NO WEBGL 2: BATTLES CANNOT BE DRAWN. TURN ON GRAPHICS ACCELERATION IN THE BROWSER OR UPDATE THE GRAPHICS DRIVER',
        10_000,
      );
      return;
    }
    this.battle = controller;
    this.ui.appendChild(controller.hud.root);
    controller.hud.setComparison(opts.comparison, opts.comparisonSide);
    controller.campaignLink = opts.campaign;
    if (config.scenarioId !== 'campaign') {
      this.prefs.lastScenarioId = config.scenarioId;
      void this.savePrefs();
    }
  }

  /** Called by the HUD when a battle ends and the player views results. */
  finishBattle(comparison?: ComparisonReport, comparisonSide?: 'a' | 'b'): void {
    const b = this.battle;
    if (!b || !b.sim.result) return;
    this.lastBattle = { sim: b.sim, result: b.sim.result, config: b.config, comparison, comparisonSide, campaign: b.campaignLink };
    if (b.campaignLink && b.campaignLink.state.pending) {
      applyEngagementResult(b.campaignLink.state, b.campaignLink.pending, b.sim.result);
      this.campaign = b.campaignLink.state;
      this.campaignResume = true;
      void storage.set('campaign', this.campaign);
    }
    if (!b.isReplay) {
      this.history.push(b.sim.result);
      this.history = this.history.slice(-50);
      void storage.set('battleHistory', this.history);
    }
    this.show('results');
  }

  toast(text: string, ms = 2200): void {
    const t = el('div', { class: 'toast' }, text);
    this.ui.appendChild(t);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.remove(), ms);
  }
}
