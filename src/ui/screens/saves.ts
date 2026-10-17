import type { App } from '../app';
import { el, setChildren } from '../dom';
import { describeSave, saveSlots, type SaveKind, type SaveSlotMeta } from '@/core/saves';
import { storage } from '@/core/storage';
import type { CampaignState } from '@/campaign/state';
import type { PostWarState } from '@/campaign/postwar';

/**
 * Load / save screen: autosaves (one per mode) plus named slots with
 * rename and delete. Opened from the main menu (Load Game) and from the
 * campaign and post-war screens (Save slot…).
 */
export function renderSaves(app: App, params?: { saveCurrent?: SaveKind }): HTMLElement {
  const list = el('div', { class: 'col' });
  const nameInput = el('input', { type: 'text', value: '', placeholder: 'Slot name', 'data-field': 'slot-name' }) as HTMLInputElement;
  const current = params?.saveCurrent === 'campaign' ? app.campaign : params?.saveCurrent === 'postwar' ? app.postwar : undefined;
  const kind = params?.saveCurrent;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  const row = (meta: SaveSlotMeta, opts: { autosave?: boolean }) =>
    el('div', { class: 'entry-block', 'data-slot': meta.id }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        el('b', {}, [meta.name, ' ', el('span', { class: 'tag', style: { marginLeft: '6px' } }, meta.kind === 'campaign' ? 'CAMPAIGN' : 'POST-WAR'), opts.autosave ? el('span', { class: 'tag', style: { marginLeft: '6px' } }, 'AUTOSAVE') : null]),
        el('span', { class: 'mono dim', style: { fontSize: '11px' } }, fmtDate(meta.savedAt)),
      ]),
      el('div', { class: 'dim', style: { fontSize: '12px', margin: '4px 0' } }, `${meta.rulesName} · ${meta.summary}`),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn small primary', 'data-action': opts.autosave ? `load-autosave-${meta.kind}` : 'load-slot', onclick: () => void load(meta, opts.autosave ?? false) }, 'Load'),
        opts.autosave
          ? null
          : el('button', { class: 'btn small', 'data-action': 'rename-slot', onclick: () => {
              const name = window.prompt('Rename slot', meta.name);
              if (name !== null) void saveSlots.rename(meta.id, name).then(refresh);
            } }, 'Rename'),
        opts.autosave
          ? null
          : el('button', { class: 'btn small danger', 'data-action': 'delete-slot', onclick: () => {
              if (window.confirm(`Delete "${meta.name}"?`)) void saveSlots.remove(meta.id).then(refresh);
            } }, 'Delete'),
      ]),
    ]);

  const load = async (meta: SaveSlotMeta, autosave: boolean) => {
    app.playUi('ui_confirm');
    if (autosave) {
      const ok = meta.kind === 'campaign' ? await app.loadCampaign() : await app.loadPostWar();
      if (!ok) app.toast('AUTOSAVE UNREADABLE');
      return;
    }
    const data = await saveSlots.load(meta.id);
    if (!data) return app.toast('SLOT UNREADABLE');
    if (meta.kind === 'campaign') app.resumeCampaign(data as CampaignState);
    else app.resumePostWar(data as PostWarState);
  };

  const refresh = async () => {
    const slots = await saveSlots.list();
    const auto: HTMLElement[] = [];
    const campaignAuto = await storage.get<CampaignState | undefined>('campaign', undefined);
    if (campaignAuto && typeof campaignAuto === 'object' && campaignAuto.systems) auto.push(row({ id: 'auto-campaign', name: campaignAuto.name, kind: 'campaign', savedAt: '', ...describeSave('campaign', campaignAuto) }, { autosave: true }));
    const postwarAuto = await storage.get<PostWarState | undefined>('postwar', undefined);
    if (postwarAuto && typeof postwarAuto === 'object' && postwarAuto.metrics) auto.push(row({ id: 'auto-postwar', name: 'Cerberus Ascendant plan', kind: 'postwar', savedAt: '', ...describeSave('postwar', postwarAuto) }, { autosave: true }));
    setChildren(
      list,
      auto.length === 0 && slots.length === 0 ? el('p', { class: 'dim' }, 'No saved games yet. Campaigns autosave every week; use "Save slot…" on the campaign screen to keep named copies.') : null,
      ...auto,
      ...slots.map((m) => row(m, {})),
    );
  };

  const saveForm = current && kind
    ? el('div', { class: 'panel orange' }, [
        el('div', { class: 'panel-title' }, kind === 'campaign' ? 'SAVE CURRENT CAMPAIGN TO A SLOT' : 'SAVE CURRENT PLAN TO A SLOT'),
        el('div', { class: 'dim', style: { fontSize: '12px', marginBottom: '6px' } }, describeSave(kind, current).summary),
        el('div', { class: 'row' }, [
          nameInput,
          el('button', { class: 'btn primary', 'data-action': 'save-slot', onclick: () => {
            void saveSlots.save(kind, current, nameInput.value || `${kind === 'campaign' ? (current as CampaignState).name : 'Post-war plan'} — ${describeSave(kind, current).summary.split(' · ')[0]}`).then(() => {
              app.toast('SAVED');
              nameInput.value = '';
              void refresh();
            });
          } }, 'Save to new slot'),
        ]),
      ])
    : null;

  void refresh();
  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'SAVED GAMES'), el('span', { class: 'sub' }, 'LOCAL STORAGE · NO ACCOUNT')]),
    el('div', { class: 'screen-body' }, [
      el('div', { class: 'grid3' }, [
        el('div', { class: 'col', style: { gridColumn: 'span 2' } }, [saveForm, el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'SLOTS'), list])]),
        el('div', { class: 'panel' }, [
          el('div', { class: 'panel-title' }, 'ABOUT SAVES'),
          el('p', { class: 'dim', style: { fontSize: '12px' } }, 'Saves live in this browser (IndexedDB, with localStorage fallback). Export everything from Settings to move them between machines. Loading a slot replaces the autosave on the next turn.'),
        ]),
      ]),
    ]),
    el('div', { class: 'screen-footer' }, [
      el('button', { class: 'btn', onclick: () => app.show(kind === 'campaign' && app.campaign ? 'campaign' : kind === 'postwar' && app.postwar ? 'postwar' : 'menu') }, kind ? '← Back' : '← Main menu'),
    ]),
  ]);
}
