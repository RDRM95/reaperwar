import type { App } from '../app';
import { el } from '../dom';
import { storage } from '@/core/storage';

export function renderSettings(app: App): HTMLElement {
  const p = app.prefs;
  const slider = (label: string, get: () => number, set: (v: number) => void) =>
    el('label', { class: 'field' }, [`${label}: ${Math.round(get() * 100)}%`, el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: get(), oninput: (e: Event) => {
      set(Number((e.target as HTMLInputElement).value));
      (e.target as HTMLElement).parentElement!.firstChild!.textContent = `${label}: ${Math.round(get() * 100)}%`;
      void app.savePrefs();
    } })]);

  const body = el('div', { class: 'screen-body' }, [
    el('div', { class: 'grid3' }, [
      el('div', { class: 'panel' }, [
        el('div', { class: 'panel-title' }, 'GRAPHICS'),
        el('label', { class: 'field' }, ['Quality', el('select', { onchange: (e: Event) => {
          p.graphics.quality = (e.target as HTMLSelectElement).value as typeof p.graphics.quality;
          p.graphics.pixelRatioCap = p.graphics.quality === 'high' ? 2 : p.graphics.quality === 'medium' ? 1.5 : 1;
          void app.savePrefs();
        } }, ['low', 'medium', 'high'].map((q) => el('option', { value: q, selected: p.graphics.quality === q }, q)))]),
        el('label', { class: 'field' }, ['Engine glow sprites', el('select', { onchange: (e: Event) => {
          p.graphics.showEngineGlow = (e.target as HTMLSelectElement).value === 'on';
          void app.savePrefs();
        } }, [el('option', { value: 'on', selected: p.graphics.showEngineGlow }, 'On'), el('option', { value: 'off', selected: !p.graphics.showEngineGlow }, 'Off')])]),
        el('label', { class: 'field' }, ['Level of detail', el('select', { onchange: (e: Event) => {
          p.graphics.lod = (e.target as HTMLSelectElement).value === 'on';
          void app.savePrefs();
        } }, [el('option', { value: 'on', selected: p.graphics.lod !== false }, 'On: distant ships simplify to hull and points'), el('option', { value: 'off', selected: p.graphics.lod === false }, 'Off: full detail at any distance')])]),
        el('label', { class: 'field' }, ['Tactical overlay', el('select', { onchange: (e: Event) => {
          p.showOverlay = (e.target as HTMLSelectElement).value === 'on';
          void app.savePrefs();
        } }, [el('option', { value: 'on', selected: p.showOverlay }, 'On'), el('option', { value: 'off', selected: !p.showOverlay }, 'Off')])]),
        el('p', { class: 'dim', style: { fontSize: '12px' } }, 'Changes apply to the next battle. Low quality disables antialiasing and caps the render resolution.'),
      ]),
      el('div', { class: 'panel orange' }, [
        el('div', { class: 'panel-title' }, 'AUDIO'),
        el('label', { class: 'field' }, ['Mute', el('select', { onchange: (e: Event) => {
          p.audio.muted = (e.target as HTMLSelectElement).value === 'muted';
          void app.savePrefs();
        } }, [el('option', { value: 'on', selected: !p.audio.muted }, 'Sound on'), el('option', { value: 'muted', selected: p.audio.muted }, 'Muted')])]),
        slider('Master volume', () => p.audio.master, (v) => (p.audio.master = v)),
        slider('Effects', () => p.audio.sfx, (v) => (p.audio.sfx = v)),
        slider('Ambience', () => p.audio.music, (v) => (p.audio.music = v)),
        el('label', { class: 'field' }, ['Comms subtitles', el('select', { onchange: (e: Event) => {
          p.subtitles = (e.target as HTMLSelectElement).value === 'on';
          void app.savePrefs();
        } }, [el('option', { value: 'on', selected: p.subtitles }, 'On'), el('option', { value: 'off', selected: !p.subtitles }, 'Off')])]),
        el('p', { class: 'dim', style: { fontSize: '12px' } }, 'All audio is synthesised in the browser with the Web Audio API. Sound starts after your first click, as browsers require.'),
      ]),
      el('div', { class: 'panel' }, [
        el('div', { class: 'panel-title' }, 'SAVE DATA'),
        el('p', { class: 'dim', style: { fontSize: '12px' } }, 'Preferences, custom timelines, custom battle setup and battle history are stored locally in your browser (IndexedDB with localStorage fallback). No account is required.'),
        el('div', { class: 'col' }, [
          el('button', { class: 'btn', onclick: async () => {
            const data = await storage.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `reaperwar-save-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          } }, 'Export save data'),
          el('button', { class: 'btn', onclick: () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'application/json';
            inp.onchange = async () => {
              const f = inp.files?.[0];
              if (!f) return;
              try {
                const warnings = await storage.importAll(JSON.parse(await f.text()));
                await app.init();
                app.toast(warnings.length ? `IMPORTED (${warnings.length} WARNINGS)` : 'SAVE IMPORTED');
                app.show('settings');
              } catch (e) {
                app.toast(`IMPORT FAILED: ${(e as Error).message}`);
              }
            };
            inp.click();
          } }, 'Import save data'),
          el('button', { class: 'btn danger', onclick: async () => {
            if (!confirm('Clear all local save data?')) return;
            await storage.set('preferences', undefined);
            await storage.set('customTimelines', []);
            await storage.set('battleHistory', []);
            await storage.set('customBattle', undefined);
            location.reload();
          } }, 'Clear save data'),
        ]),
        el('h3', { style: { marginTop: '16px' } }, 'Battle history'),
        app.history.length === 0 ? el('p', { class: 'dim' }, 'No battles recorded yet.') : el('div', { class: 'scroll mono', style: { maxHeight: '200px', fontSize: '11px' } }, [...app.history].reverse().slice(0, 20).map((r) => el('div', {}, `${r.outcome.toUpperCase().padEnd(8)} ${r.scenarioId} · ${r.rulesName} · seed ${r.seed} · ${Math.round(r.duration)}s`))),
      ]),
    ]),
  ]);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'SETTINGS'), el('span', { class: 'sub' }, 'SYSTEM CONFIGURATION')]),
    body,
    el('div', { class: 'screen-footer' }, [el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu')]),
  ]);
}
