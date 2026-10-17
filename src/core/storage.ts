/**
 * Local save system. Uses IndexedDB when available and falls back to
 * localStorage. No account, no server. All records are plain JSON.
 */
import type { BattleResult } from '@/simulation/types';
import type { RuleSet } from '@/timelines/rules';
import type { GraphicsSettings } from '@/rendering/battleView';
import type { AudioSettings } from '@/audio/engine';

export interface Preferences {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  subtitles: boolean;
  lastTimelineId: string;
  lastScenarioId: string;
  showOverlay: boolean;
}

export interface SaveData {
  version: number;
  savedAt: string;
  preferences: Preferences;
  customTimelines: RuleSet[];
  battleHistory: BattleResult[];
  customBattle?: unknown;
  campaign?: unknown;
  postwar?: unknown;
  /** Named save slots: index plus data keyed by slot id. */
  saveSlots?: unknown[];
  slotData?: Record<string, unknown>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  graphics: { quality: 'high', showEngineGlow: true, pixelRatioCap: 2 },
  audio: { master: 0.8, sfx: 0.9, music: 0.5, muted: false },
  subtitles: true,
  lastTimelineId: 'canon_me3',
  lastScenarioId: 'battle_of_earth',
  showOverlay: true,
};

const DB_NAME = 'reaperwar';
const STORE = 'kv';
const LS_PREFIX = 'reaperwar:';

function openDb(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(undefined);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export class Storage {
  private db?: IDBDatabase;
  private ready: Promise<void>;
  private cache = new Map<string, unknown>();

  constructor() {
    this.ready = openDb().then((db) => {
      this.db = db;
    });
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    await this.ready;
    if (this.cache.has(key)) return this.cache.get(key) as T;
    if (this.db) {
      const v = await new Promise<unknown>((resolve) => {
        const tx = this.db!.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      });
      if (v !== undefined) {
        this.cache.set(key, v);
        return v as T;
      }
    }
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      if (raw) {
        const v = JSON.parse(raw) as T;
        this.cache.set(key, v);
        return v;
      }
    } catch {
      /* ignore */
    }
    return fallback;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.ready;
    this.cache.set(key, value);
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch {
      /* quota or private mode */
    }
    if (this.db) {
      await new Promise<void>((resolve) => {
        const tx = this.db!.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  }

  async exportAll(): Promise<SaveData> {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      preferences: await this.get('preferences', DEFAULT_PREFERENCES),
      customTimelines: await this.get<RuleSet[]>('customTimelines', []),
      battleHistory: await this.get<BattleResult[]>('battleHistory', []),
      customBattle: await this.get('customBattle', undefined),
      campaign: await this.get('campaign', undefined),
      postwar: await this.get('postwar', undefined),
      saveSlots: await this.get<unknown[]>('saveSlots', []),
      slotData: await this.slotData(),
    };
  }

  private async slotData(): Promise<Record<string, unknown>> {
    const idx = await this.get<{ id: string }[]>('saveSlots', []);
    const out: Record<string, unknown> = {};
    for (const m of Array.isArray(idx) ? idx : []) {
      const d = await this.get(`slot:${m.id}`, undefined);
      if (d !== undefined) out[m.id] = d;
    }
    return out;
  }

  async importAll(data: unknown): Promise<string[]> {
    const warnings: string[] = [];
    if (typeof data !== 'object' || data === null) return ['Save file is not an object'];
    const d = data as Partial<SaveData>;
    if (d.preferences && typeof d.preferences === 'object') await this.set('preferences', { ...DEFAULT_PREFERENCES, ...d.preferences });
    else warnings.push('No preferences in save');
    if (Array.isArray(d.customTimelines)) await this.set('customTimelines', d.customTimelines);
    if (Array.isArray(d.battleHistory)) await this.set('battleHistory', d.battleHistory.slice(-50));
    if (d.customBattle) await this.set('customBattle', d.customBattle);
    if (d.campaign && typeof d.campaign === 'object') await this.set('campaign', d.campaign);
    if (d.postwar && typeof d.postwar === 'object') await this.set('postwar', d.postwar);
    if (Array.isArray(d.saveSlots) && d.slotData && typeof d.slotData === 'object') {
      const existing = await this.get<{ id: string }[]>('saveSlots', []);
      const merged = [...(Array.isArray(existing) ? existing : [])];
      for (const m of d.saveSlots as { id: string }[]) {
        if (!m || typeof m.id !== 'string') continue;
        const data = (d.slotData as Record<string, unknown>)[m.id];
        if (data === undefined) continue;
        await this.set(`slot:${m.id}`, data);
        const i = merged.findIndex((x) => x.id === m.id);
        if (i >= 0) merged[i] = m;
        else merged.push(m);
      }
      await this.set('saveSlots', merged);
    }
    return warnings;
  }
}

export const storage = new Storage();
