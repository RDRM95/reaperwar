import type { GraphicsSettings } from './battleView';
import { withQuality } from './quality';

/**
 * Local Edition: the build that scripts/local/serve.mjs serves to this
 * machine and scripts/local/launch.mjs opens in Chrome or Edge with GPU
 * flags (README, "Run it locally on your own GPU"). Render-side only.
 */

export interface LocationLike {
  readonly search: string;
  readonly hostname: string;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

/**
 * True in the Local Edition: the launcher's ?local=1, or a cross-origin
 * isolated page served from this machine (serve.mjs opened without the
 * parameter). The inputs are injectable for tests.
 */
export function isLocalEdition(
  loc: LocationLike | undefined = typeof location === 'undefined' ? undefined : location,
  crossOriginIsolated: boolean = typeof self !== 'undefined' && self.crossOriginIsolated === true,
): boolean {
  // The stand-alone launcher build (opened from disk by the Play launchers) is always the Local Edition.
  if (typeof __LAUNCHER_BUILD__ !== 'undefined' && __LAUNCHER_BUILD__) return true;
  if (!loc) return false;
  if (new URLSearchParams(loc.search).get('local') === '1') return true;
  return crossOriginIsolated && LOOPBACK_HOSTS.has(loc.hostname);
}

/**
 * The graphics settings the app starts with. In the Local Edition a player
 * who has not made a graphics choice yet (graphics.chosen unset) starts at
 * Ultra; a stored choice always wins, and the web build is unchanged.
 */
export function startupGraphics(graphics: GraphicsSettings, local: boolean = isLocalEdition()): GraphicsSettings {
  if (!local || graphics.chosen === true) return graphics;
  return withQuality(graphics, 'ultra');
}

let rendererCache: string | null | undefined;
let webglCache: boolean | undefined;

/**
 * The GPU renderer string, from WEBGL_debug_renderer_info when the browser
 * exposes it (else the plain RENDERER string). Probed once with a throwaway
 * context that is released straight away; undefined without WebGL, or when the
 * browser does not name the renderer (webglAvailable() tells the two apart).
 */
export function gpuRenderer(): string | undefined {
  if (rendererCache !== undefined) return rendererCache ?? undefined;
  rendererCache = null;
  if (typeof document === 'undefined') return undefined;
  webglCache = false;
  try {
    const canvas = document.createElement('canvas');
    const gl: WebGL2RenderingContext | WebGLRenderingContext | null = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) {
      webglCache = true;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const raw: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      if (typeof raw === 'string' && raw.trim() !== '') rendererCache = raw.trim();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* no WebGL: the renderer stays unnamed */
  }
  return rendererCache ?? undefined;
}

/** Whether this window can create a WebGL context at all (battles need one). Probed once, with gpuRenderer(). */
export function webglAvailable(): boolean {
  if (webglCache === undefined) gpuRenderer();
  return webglCache !== false;
}

/** Renderer strings of software rasterisers: the browser is not using the GPU. */
export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** The Settings screen's Local Edition line; a software renderer or a missing WebGL is called out, never reported as the GPU. */
export function localEditionStatus(renderer: string | undefined, webgl: boolean = true): string {
  if (!webgl) {
    return 'Local Edition: WebGL is not available in this window, so battles cannot be drawn: turn on graphics acceleration in the browser or update the graphics driver.';
  }
  if (renderer && SOFTWARE_RENDERER.test(renderer)) {
    return `Local Edition: software rendering (${renderer}). The GPU is not in use: update the graphics driver; on a laptop, also set Chrome or Edge to High performance in the system's graphics settings.`;
  }
  return `Local Edition: running on this machine's GPU${renderer ? ` (${renderer})` : ''}`;
}

/** Cross-origin isolation and CPU threads, for the Settings screen. */
export function localEditionDetails(
  isolated: boolean = typeof self !== 'undefined' && self.crossOriginIsolated === true,
  threads: number = typeof navigator === 'undefined' ? 0 : navigator.hardwareConcurrency || 0,
): string {
  const iso = isolated ? 'Cross-origin isolated (ready for a multi-threaded simulation)' : 'Not cross-origin isolated';
  return threads > 0 ? `${iso} · ${threads} CPU threads; the simulation uses one for now.` : `${iso}.`;
}
