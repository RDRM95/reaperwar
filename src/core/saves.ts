import type { CampaignState } from '@/campaign/state';
import type { PostWarState } from '@/campaign/postwar';
import { storage, type Storage } from './storage';

/**
 * Named save slots on top of the key/value store. The autosave keys
 * ('campaign', 'postwar') keep working as quick slots; manual slots are
 * indexed under 'saveSlots' with their data under 'slot:<id>'.
 */

export type SaveKind = 'campaign' | 'postwar';

export interface SaveSlotMeta {
  id: string;
  name: string;
  kind: SaveKind;
  savedAt: string;
  /** Week (campaign) or quarter (post-war). */
  turn: number;
  rulesName: string;
  summary: string;
}

const INDEX_KEY = 'saveSlots';
const slotKey = (id: string): string => `slot:${id}`;

export function describeSave(kind: SaveKind, state: CampaignState | PostWarState): { turn: number; rulesName: string; summary: string } {
  if (kind === 'campaign') {
    const c = state as CampaignState;
    const allied = c.fleets.filter((f) => f.allegiance === 'allied').length;
    const occupied = Object.values(c.systems).filter((s) => s.controller === 'reaper').length;
    return { turn: c.tick, rulesName: c.rules.name, summary: c.outcome ? `${c.outcome.kind.toUpperCase()} · week ${c.outcome.tick}` : `Week ${c.tick} · ${allied} allied fleets · ${occupied} systems occupied · Crucible ${c.crucible.available ? `${Math.round(c.crucible.progress * 100)}%` : 'n/a'}` };
  }
  const p = state as PostWarState;
  return { turn: p.quarter, rulesName: 'Cerberus Ascendant', summary: p.outcome ? `${p.outcome.kind.toUpperCase()} · quarter ${p.outcome.quarter}` : `${Math.floor(p.year)} Q${(p.quarter % 4) + 1} · ${p.controlledReapers} Reapers controlled · fleet ${p.conventionalFleet.toLocaleString()}` };
}

export class SaveSlots {
  constructor(private readonly store: Storage = storage) {}

  async list(): Promise<SaveSlotMeta[]> {
    const idx = await this.store.get<SaveSlotMeta[]>(INDEX_KEY, []);
    return Array.isArray(idx) ? [...idx].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : [];
  }

  /** Create a new slot or overwrite an existing one by id. */
  async save(kind: SaveKind, state: CampaignState | PostWarState, name: string, id?: string): Promise<SaveSlotMeta> {
    const idx = await this.list();
    const meta: SaveSlotMeta = { id: id ?? `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, name: name.trim() || `${kind === 'campaign' ? 'Campaign' : 'Post-war'} save`, kind, savedAt: new Date().toISOString(), ...describeSave(kind, state) };
    const next = idx.filter((m) => m.id !== meta.id);
    next.push(meta);
    await this.store.set(slotKey(meta.id), JSON.parse(JSON.stringify(state)));
    await this.store.set(INDEX_KEY, next);
    return meta;
  }

  async load<T = CampaignState | PostWarState>(id: string): Promise<T | undefined> {
    const idx = await this.list();
    if (!idx.some((m) => m.id === id)) return undefined;
    const data = await this.store.get<T | undefined>(slotKey(id), undefined);
    // Always hand out a copy: the store caches objects, and the loaded game is mutated in play.
    return data === undefined ? undefined : (JSON.parse(JSON.stringify(data)) as T);
  }

  async rename(id: string, name: string): Promise<void> {
    const idx = await this.list();
    const m = idx.find((x) => x.id === id);
    if (!m) return;
    m.name = name.trim() || m.name;
    await this.store.set(INDEX_KEY, idx);
  }

  async remove(id: string): Promise<void> {
    const idx = await this.list();
    await this.store.set(INDEX_KEY, idx.filter((m) => m.id !== id));
    await this.store.set(slotKey(id), undefined);
  }
}

export const saveSlots = new SaveSlots();
