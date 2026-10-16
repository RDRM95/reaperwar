import type { App } from '../app';
import { el, setChildren } from '../dom';
import { CODEX, CODEX_CATEGORIES, type CodexEntry } from '@/codex/entries';

export function renderCodex(app: App): HTMLElement {
  const rules = app.currentRules();
  let current: CodexEntry = CODEX[0];
  const bodyPane = el('div', { class: 'codex-body scroll' });
  const nav = el('div', { class: 'codex-nav scroll' });

  const renderEntry = () => {
    const e = current;
    const auLines = [...(e.au?.[rules.id] ?? []), ...(e.auDynamic?.(rules) ?? [])];
    setChildren(bodyPane,
      el('h2', {}, e.title),
      el('div', { class: 'dim mono', style: { fontSize: '11px', marginBottom: '14px' } }, e.category.toUpperCase()),
      e.canon.length > 0 ? el('div', { class: 'entry-block' }, [el('div', { class: 'panel-title' }, [el('span', { class: 'badge canon' }, 'established canon')]), ...e.canon.map((p) => el('p', {}, p))]) : null,
      e.estimate && e.estimate.length > 0 ? el('div', { class: 'entry-block' }, [el('div', { class: 'panel-title' }, [el('span', { class: 'badge estimate' }, 'simulation estimate')]), ...e.estimate.map((p) => el('p', {}, p))]) : null,
      auLines.length > 0 ? el('div', { class: 'entry-block au' }, [el('div', { class: 'panel-title' }, [el('span', { class: 'badge au' }, `AU — ${rules.name}`)]), ...auLines.map((p) => el('p', {}, p))]) : null,
      rules.category === 'canon' && e.au && Object.keys(e.au).length > 0 ? el('p', { class: 'dim', style: { fontSize: '12px' } }, `This entry changes in: ${Object.keys(e.au).map((id) => app.allTimelines().find((t) => t.id === id)?.name ?? id).join(', ')}. Select that timeline to see the alternate history.`) : null,
    );
    for (const b of nav.querySelectorAll<HTMLButtonElement>('[data-entry]')) b.classList.toggle('active', b.dataset.entry === e.id);
  };

  for (const cat of CODEX_CATEGORIES) {
    nav.append(el('div', { class: 'cat' }, cat.toUpperCase()));
    for (const e of CODEX.filter((x) => x.category === cat)) {
      const changed = !!(e.au?.[rules.id] || e.auDynamic?.(rules));
      nav.append(el('button', { class: 'btn', 'data-entry': e.id, onclick: () => {
        current = e;
        app.playUi('ui_click');
        renderEntry();
      } }, [e.title, changed ? el('span', { class: 'tag' }, 'AU') : null]));
    }
  }
  renderEntry();

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'CODEX'), el('span', { class: 'sub' }, `TIMELINE: ${rules.name.toUpperCase()}`)]),
    el('div', { class: 'screen-body' }, [el('div', { class: 'codex' }, [nav, bodyPane])]),
    el('div', { class: 'screen-footer' }, [el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'), el('button', { class: 'btn', onclick: () => app.show('timelines') }, 'Change timeline')]),
  ]);
}
