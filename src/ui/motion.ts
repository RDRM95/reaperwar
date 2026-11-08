/**
 * Decorative motion for menu screens that never keeps the browser busy.
 *
 * A continuous CSS animation makes the browser produce frames for as long as it runs. With the browser's
 * own frame cap lifted, which the Play launchers and the Local Edition do, that means frames back to back
 * on every screen the animation is on: as a CSS animation, the main menu's grid drift cost about four
 * cores of software rendering, and would keep a real GPU producing frames at its maximum rate. A drift
 * stepped from script changes the layer's transform a few times a second instead, so the browser
 * composites only then and idles in between.
 */

export interface DriftSpec {
  /** Pixels moved along x per cycle. */
  dx: number;
  /** Pixels moved along y per cycle. */
  dy: number;
  /** Length of one cycle in milliseconds. */
  periodMs: number;
  /** Steps per second (default 12: at a few pixels per second each step is a fraction of a pixel). */
  rate?: number;
}

/** The drift offset at `elapsedMs`, wrapping once per cycle. */
export function driftOffset(elapsedMs: number, spec: DriftSpec): { x: number; y: number } {
  if (!(spec.periodMs > 0)) return { x: 0, y: 0 };
  const phase = ((elapsedMs / spec.periodMs) % 1 + 1) % 1;
  return { x: spec.dx * phase, y: spec.dy * phase };
}

/**
 * Steps the custom properties `--drift-x` and `--drift-y` on `el` (its stylesheet applies them as a
 * transform) until the element leaves the document; honours prefers-reduced-motion by not moving at
 * all. Returns a function that stops the drift early.
 */
export function steppedDrift(el: HTMLElement, spec: DriftSpec): () => void {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const start = performance.now();
  let seen = false;
  let timer = 0;
  const stop = () => window.clearInterval(timer);
  const tick = () => {
    if (el.isConnected) seen = true;
    else if (seen) {
      stop();
      return;
    }
    const { x, y } = driftOffset(performance.now() - start, spec);
    el.style.setProperty('--drift-x', `${x.toFixed(2)}px`);
    el.style.setProperty('--drift-y', `${y.toFixed(2)}px`);
  };
  timer = window.setInterval(tick, 1000 / (spec.rate ?? 12));
  return stop;
}
