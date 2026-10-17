import { audio, type SoundId } from '@/audio/engine';
import { DEFAULT_PREFERENCES, storage, type Preferences } from '@/core/storage';
import { BattleView } from '@/rendering/battleView';
import type { CameraMode } from '@/rendering/cameras';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import type { BattleConfig, BattleEvent, BattleResult, FleetOrders } from '@/simulation/types';
import { PRESETS, getPreset } from '@/timelines/presets';
import { cloneRules, type RuleSet } from '@/timelines/rules';
import type { ComparisonReport } from '@/scenarios/comparison';
import { clear, el } from './dom';
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

/** Speed steps available to the player. */
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

/**
 * Drives a live battle: fixed-step simulation at the chosen speed, the 3D
 * view, the tactical overlay, the HUD and all input.
 */
export class BattleController {
  sim: BattleSimulation;
  readonly view: BattleView;
  readonly overlay: TacticalOverlay;
  hud: Hud;
  speedIndex = 2;
  paused = false;
  hudHidden = false;
  private accumulator = 0;
  private lastFrame = performance.now();
  private raf = 0;
  private disposed = false;
  private keys = new Set<string>();
  private dragging: { button: number; x: number; y: number; moved: boolean } | null = null;
  private hudTimer = 0;
  private ended = false;
  /** Events consumed by the HUD since last frame. */
  private pendingEvents: BattleEvent[] = [];
  readonly isReplay: boolean;
  /** Set when this battle resolves a campaign engagement. */
  campaignLink?: CampaignBattleLink;

  constructor(
    readonly app: App,
    readonly config: BattleConfig,
    private canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    isReplay: boolean,
  ) {
    this.isReplay = isReplay;
    this.sim = new BattleSimulation(config);
    this.view = new BattleView(canvas, this.sim, app.prefs.graphics);
    this.overlay = new TacticalOverlay(overlayCanvas);
    this.overlay.visible = app.prefs.showOverlay;
    const prevOnEvent = this.sim.onEvent;
    this.sim.onEvent = (e) => {
      prevOnEvent?.(e);
      this.pendingEvents.push(e);
      this.onSimEvent(e);
    };
    this.hud = createHud(app, this);
    this.resize();
    this.bindInput();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    audio.startAmbience();
  }

  get speed(): number {
    return SPEEDS[this.speedIndex];
  }

  get playerFleetIds(): string[] {
    return this.config.fleets.filter((f) => f.playerControlled).map((f) => f.id);
  }

  setSpeed(i: number): void {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.hud.refresh();
  }
  togglePause(): void {
    this.paused = !this.paused;
    this.hud.refresh();
  }
  setCamera(mode: CameraMode): void {
    this.view.rig.setMode(mode);
    this.hud.refresh();
  }
  toggleHud(): void {
    this.hudHidden = !this.hudHidden;
    this.hud.root.classList.toggle('hidden', this.hudHidden);
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
    const dtReal = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.handleKeys(dtReal);
    if (!this.paused && !this.sim.finished) {
      this.accumulator += dtReal * this.speed;
      // Step until caught up, but never spend more than ~40 ms of wall time
      // per frame so slow machines degrade to slower simulation, not a hang.
      const budgetEnd = performance.now() + 40;
      while (this.accumulator >= SIM_DT) {
        this.sim.step();
        this.accumulator -= SIM_DT;
        if (performance.now() > budgetEnd) {
          this.accumulator = Math.min(this.accumulator, SIM_DT);
          break;
        }
      }
    }
    const alpha = this.paused ? 1 : Math.min(1, this.accumulator / SIM_DT);
    this.view.update(dtReal, alpha);
    this.view.render();
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.overlay.draw(this.view, w, h, this.view.rig.mode);
    this.hudTimer -= dtReal;
    this.hud.tick(dtReal, this.pendingEvents);
    this.pendingEvents = [];
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.hud.refresh();
    }
    if (this.ended && this.sim.result) {
      this.ended = false;
      this.hud.showEnd(this.sim.result);
    }
    this.raf = requestAnimationFrame(this.loop);
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
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement) !== c) return;
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
          this.dragging = null; // two fingers: zoom, not orbit
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
        if (touches.size < 2) pinchDistance = 0;
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
  }

  async init(): Promise<void> {
    this.prefs = { ...DEFAULT_PREFERENCES, ...(await storage.get('preferences', DEFAULT_PREFERENCES)) };
    this.prefs.graphics = { ...DEFAULT_PREFERENCES.graphics, ...this.prefs.graphics };
    this.prefs.audio = { ...DEFAULT_PREFERENCES.audio, ...this.prefs.audio };
    this.customTimelines = await storage.get('customTimelines', []);
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
    if (c) return cloneRules(c);
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

  async savePrefs(): Promise<void> {
    await storage.set('preferences', this.prefs);
    audio.settings = { ...this.prefs.audio };
    audio.applySettings();
  }

  playUi(id: SoundId): void {
    audio.play(id);
  }

  // ---------------------------------------------------------------- screens

  show(screen: ScreenName, params?: unknown): void {
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
    if (this.battle) this.battle.dispose();
    clear(this.ui);
    this.screen = 'battle';
    this.canvas.style.visibility = 'visible';
    const controller = new BattleController(this, config, this.canvas, this.overlayCanvas, !!opts.replay);
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

  toast(text: string): void {
    const t = el('div', { class: 'toast' }, text);
    this.ui.appendChild(t);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.remove(), 2200);
  }
}
