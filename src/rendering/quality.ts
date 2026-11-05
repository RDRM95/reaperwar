import type { GraphicsSettings } from './battleView';

/**
 * Graphics quality presets and the render-side maths they drive. Pure (no
 * Three.js, no DOM) so the unit tests run it in Node. Nothing here reaches
 * the simulation: a battle has the same result at every quality.
 */

export type GraphicsQuality = GraphicsSettings['quality'];

export interface QualityPreset {
  /** Label in the Settings screen. */
  label: string;
  /** Highest device pixel ratio rendered: 1 draws CSS pixels, devicePixelRatio draws the display's native pixels. */
  pixelRatioCap: number;
  /** WebGL multisample antialiasing. */
  antialias: boolean;
  /** Multiplier on the level-of-detail distances (full detail, hull only, far point). */
  lodDistanceScale: number;
  /** Multiplier on the effects system's pools and caps (sparks, tracers, barrier shells, debris). */
  effectBudgetScale: number;
  /** Use the GPU's maximum anisotropic filtering on the textures the renderer generates. */
  maxAnisotropy: boolean;
  /** Cube size of the image-based-lighting environment map (PMREM). */
  envMapSize: number;
}

/** Ultra: the display's native resolution up to 3× pixel density. */
export const ULTRA_PIXEL_RATIO_CAP = 3;

export const QUALITY_PRESETS: Readonly<Record<GraphicsQuality, QualityPreset>> = {
  low: { label: 'Low', pixelRatioCap: 1, antialias: false, lodDistanceScale: 1, effectBudgetScale: 1, maxAnisotropy: false, envMapSize: 256 },
  medium: { label: 'Medium', pixelRatioCap: 1.5, antialias: true, lodDistanceScale: 1, effectBudgetScale: 1, maxAnisotropy: false, envMapSize: 256 },
  high: { label: 'High', pixelRatioCap: 2, antialias: true, lodDistanceScale: 1, effectBudgetScale: 1, maxAnisotropy: false, envMapSize: 256 },
  ultra: { label: 'Ultra — local GPU', pixelRatioCap: ULTRA_PIXEL_RATIO_CAP, antialias: true, lodDistanceScale: 2.5, effectBudgetScale: 2, maxAnisotropy: true, envMapSize: 512 },
};

/** Settings-screen order. */
export const QUALITY_ORDER: readonly GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];

/** The preset for a stored quality (an unknown value reads as High). */
export function presetFor(settings: Pick<GraphicsSettings, 'quality'>): QualityPreset {
  return QUALITY_PRESETS[settings.quality] ?? QUALITY_PRESETS.high;
}

/**
 * Renderer pixel ratio. Ultra renders at the display's own density
 * (devicePixelRatio), capped only at 3; Low, Medium and High keep their
 * stored cap (1, 1.5, 2).
 */
export function pixelRatioFor(settings: Pick<GraphicsSettings, 'quality' | 'pixelRatioCap'>, devicePixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const cap = settings.quality === 'ultra' ? ULTRA_PIXEL_RATIO_CAP : settings.pixelRatioCap;
  return Math.min(dpr, Number.isFinite(cap) && cap > 0 ? cap : 1);
}

/** Graphics settings switched to a quality: its pixel-ratio cap, and engine glow on for Ultra. */
export function withQuality(settings: GraphicsSettings, quality: GraphicsQuality): GraphicsSettings {
  const preset = QUALITY_PRESETS[quality];
  return { ...settings, quality, pixelRatioCap: preset.pixelRatioCap, ...(quality === 'ultra' ? { showEngineGlow: true } : {}) };
}

/** Frames per second measured over a window of real time (0 until the first window completes). */
export class FpsMeter {
  fps = 0;
  private frames = 0;
  private windowStart = Number.NaN;
  private readonly windowMs: number;

  constructor(windowMs = 500) {
    this.windowMs = windowMs;
  }

  /** Record a frame drawn at `nowMs` (performance.now()); returns the current reading. */
  tick(nowMs: number): number {
    if (Number.isNaN(this.windowStart)) {
      this.windowStart = nowMs;
      return this.fps;
    }
    this.frames++;
    const elapsed = nowMs - this.windowStart;
    if (elapsed >= this.windowMs) {
      this.fps = (this.frames * 1000) / elapsed;
      this.frames = 0;
      this.windowStart = nowMs;
    }
    return this.fps;
  }
}
