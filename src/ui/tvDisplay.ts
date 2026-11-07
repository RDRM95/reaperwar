/**
 * TV / 4K UI scaling. Changes only the HTML HUD and menus, never the WebGL
 * canvas or the simulation pixel ratio. Inverse layout dimensions keep all
 * four edges reachable when the interface is enlarged.
 */
export const UI_SCALE_LEVELS = [0.85, 1, 1.15, 1.3, 1.5, 1.75] as const;

export function normaliseUiScale(value: unknown, viewportWidth = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const match = UI_SCALE_LEVELS.find((level) => Math.abs(level - value) < 0.001);
    if (match !== undefined) return match;
  }
  return viewportWidth >= 2500 ? 1.3 : 1;
}

export function applyUiScale(ui: HTMLElement, scale: number): void {
  const s = normaliseUiScale(scale);
  ui.style.right = 'auto';
  ui.style.bottom = 'auto';
  ui.style.width = (100 / s) + '%';
  ui.style.height = (100 / s) + '%';
  ui.style.transformOrigin = 'top left';
  ui.style.transform = 'scale(' + s + ')';
}

/** Recovery shortcuts work even if Windows display scaling hides a setting. */
export function installUiScaleHotkeys(get: () => number, set: (scale: number) => void): void {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!event.ctrlKey || !event.altKey) return;
    if (event.code === 'Digit0' || event.code === 'Numpad0') {
      event.preventDefault();
      set(1);
      return;
    }
    if (event.code !== 'ArrowUp' && event.code !== 'ArrowDown') return;
    event.preventDefault();
    const current = normaliseUiScale(get());
    const index = UI_SCALE_LEVELS.indexOf(current as typeof UI_SCALE_LEVELS[number]);
    const direction = event.code === 'ArrowUp' ? 1 : -1;
    set(UI_SCALE_LEVELS[Math.max(0, Math.min(UI_SCALE_LEVELS.length - 1, index + direction))]);
  }, { capture: true });
}
