import * as THREE from 'three';

/**
 * Shared materials. Ships use a small palette per faction so that a fleet of
 * forty vessels costs few material switches.
 */

export interface FactionPalette {
  hull: THREE.MeshStandardMaterial;
  hullDark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  engine: THREE.MeshStandardMaterial;
  windows: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
}

const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.48, ...opts });

export const PALETTES: Record<string, FactionPalette> = {
  alliance: {
    hull: std(0xb9c1cc, { metalness: 0.5, roughness: 0.42 }),
    hullDark: std(0x3b4350, { metalness: 0.6, roughness: 0.5 }),
    accent: std(0x1f5fb3, { metalness: 0.4, roughness: 0.4 }),
    engine: new THREE.MeshStandardMaterial({ color: 0x5fb8ff, emissive: 0x3c9dff, emissiveIntensity: 3.2, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xcfe8ff, emissive: 0x9fd0ff, emissiveIntensity: 1.6, roughness: 0.6 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  cerberus: {
    hull: std(0xe8e8e4, { metalness: 0.45, roughness: 0.38 }),
    hullDark: std(0x1a1b1e, { metalness: 0.7, roughness: 0.45 }),
    accent: std(0xff8a1f, { metalness: 0.3, roughness: 0.4 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9a3c, emissiveIntensity: 3, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffd9a0, emissiveIntensity: 1.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  reaper: {
    hull: std(0x3c414b, { metalness: 0.75, roughness: 0.38, emissive: 0x140404, emissiveIntensity: 0.6 }),
    hullDark: std(0x24272e, { metalness: 0.8, roughness: 0.35, emissive: 0x100303, emissiveIntensity: 0.5 }),
    accent: std(0x4a505c, { metalness: 0.7, roughness: 0.42 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0xff2a10, emissiveIntensity: 4, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xff5030, emissive: 0xff3018, emissiveIntensity: 2.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xff3018, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  turian: {
    hull: std(0x8a98a8, { metalness: 0.6, roughness: 0.4 }),
    hullDark: std(0x2e3540, { metalness: 0.65 }),
    accent: std(0x7fd1e8),
    engine: new THREE.MeshStandardMaterial({ color: 0x9fe0ff, emissive: 0x7fd1ff, emissiveIntensity: 3 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xe0f4ff, emissive: 0xa0e0ff, emissiveIntensity: 1.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
};

export const paletteFor = (faction: string): FactionPalette => PALETTES[faction] ?? PALETTES.alliance;

export const ADDITIVE_WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
