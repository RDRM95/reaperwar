/** Minimal DOM builder: el('div', { class: 'x', onclick }, [children]) */
type Child = Node | string | number | null | undefined | false | Child[];

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, children: Child = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v as Record<string, string>);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') e.innerHTML = String(v);
    else if (k in e && k !== 'list') (e as unknown as Record<string, unknown>)[k] = v;
    else e.setAttribute(k, String(v));
  }
  append(e, children);
  return e;
}

export function append(parent: Node, children: Child): void {
  if (children === null || children === undefined || children === false) return;
  if (Array.isArray(children)) {
    for (const c of children) append(parent, c);
    return;
  }
  if (children instanceof Node) parent.appendChild(children);
  else parent.appendChild(document.createTextNode(String(children)));
}

/** replaceChildren that tolerates null/false entries. */
export const setChildren = (parent: HTMLElement, ...children: (Node | string | null | undefined | false)[]): void => {
  parent.replaceChildren(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
};

export const clear = (e: HTMLElement): void => {
  while (e.firstChild) e.removeChild(e.firstChild);
};

export const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export const fmtNum = (n: number, d = 0): string => n.toLocaleString(undefined, { maximumFractionDigits: d });

export function provenanceBadge(p: string): HTMLElement {
  const cls = p === 'CANON_CONFIRMED' ? 'canon' : p === 'CANON_INFERRED' ? 'inferred' : p === 'AU_MODIFIED' ? 'au' : 'estimate';
  const label = p === 'CANON_CONFIRMED' ? 'canon' : p === 'CANON_INFERRED' ? 'inferred' : p === 'AU_MODIFIED' ? 'AU' : 'estimate';
  return el('span', { class: `badge ${cls}` }, label);
}
