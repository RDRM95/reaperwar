import { Rng } from '@/core/rng';
import { v3, type Vec3 } from '@/core/vec3';
import type { ShipRole } from '@/data/types';
import type { FormationType } from './types';
import { BATTLESPACE_SCALE } from './constants';

/**
 * Battlegroup formations (brief §22, the owner's "not lined up in rows"; brief §8.2; PACING_PLAN.md §3.1 Q1/Q1b).
 *
 * Every formation deploys its fleet as battlegroups: each capital — or each pair of capitals once a fleet carries
 * more than `PAIR_CAPITALS_ABOVE` of them — with its share of cruisers, frigates, carriers and craft in a loose 3D
 * cluster round it: cruisers (Reaper destroyers) on a shell above, below and beside the capital, frigates screening
 * ahead, carriers behind and above, craft ahead of the screen. The formation type places the groups — a wide line
 * of staggered echelons, a two-rank screen, a wedge, a deep column, a box, a descending swarm — in depth and height,
 * never on one row. Each group turns and mirrors its own pattern (seeded from its leader), and every hull carries
 * seeded variation (an `Rng` seeded from the battle seed and the ship id): its spacing ±15–25 %, lateral, vertical
 * and depth offsets and a slight yaw of its station facing, so no hulls form a straight row or column. A fleet
 * without capitals forms its groups round its cruisers (or frigate flights).
 *
 * Slots are fleet-local (+z the fleet's facing, +x right, +y up). The layouts are written in nominal formation km
 * and compressed by `SLOT_COMPRESSION` (the formation keeps its size relative to the weapon ranges, Q1); hull
 * clearances are hull-scale km (`minSeparationKm`): capitals at least `CAPITAL_SEPARATION_LENGTHS` of their own
 * lengths apart, every other pair `SLOT_SPACING_FACTOR` × the longer hull. A line wider than `FRONTAGE_RANGES` ×
 * the fleet's engagement range wraps into a second echelon (Q1b). Deterministic: the same ships, formation and seed
 * give the same slots. All values SIMULATION_ESTIMATE.
 */

export interface SlotShip {
  id: string;
  role: ShipRole;
  lengthKm: number;
}

/** Nominal formation km → simulation km: spacing compresses with the battlespace, but never below 0.55. */
export const SLOT_COMPRESSION = Math.max(BATTLESPACE_SCALE, 0.55);
/** Clearance of any pair but two capitals: this × the longer hull (CINEMATIC_DESIGN.md §7.2). */
export const SLOT_SPACING_FACTOR = 1.7;
/** Two capitals keep at least this many lengths of the longer one between them (brief §22). */
export const CAPITAL_SEPARATION_LENGTHS = 3;
/** More capitals than this and a battlegroup forms round a pair of them (brief §22, "very large fleets"). */
export const PAIR_CAPITALS_ABOVE = 16;
/** Q1b (PACING_PLAN.md §3.1): no line wider than this many fleet engagement ranges; wider lines wrap into echelons. */
export const FRONTAGE_RANGES = 3;
/** Per-hull spacing variation: the hull's distance from its group's capital varies by ±15–25 % (brief §22). */
export const SPACING_VARIATION = [0.15, 0.25] as const;
/** Per-hull yaw of the station facing: ±1.5–4.5° (brief §22, "a slight yaw"). */
export const STATION_YAW_DEG = [1.5, 4.5] as const;

const tier = (role: ShipRole): number => {
  switch (role) {
    case 'reaper_capital':
    case 'dreadnought':
    case 'super_dreadnought':
    case 'carrier':
    case 'fixed_platform':
      return 0;
    case 'cruiser':
    case 'reaper_destroyer':
      return 1;
    case 'frigate':
      return 2;
    case 'fighter':
      return 3;
  }
};

/** Capital hulls (tier 0, carriers included) keep capital clearance from each other. */
export const isCapitalTier = (role: ShipRole): boolean => tier(role) === 0;
/** Hulls that lead a battlegroup when the fleet has them: the capitals other than carriers. */
export const isGroupCapital = (role: ShipRole): boolean => tier(role) === 0 && role !== 'carrier';

/**
 * Minimum separation of two hulls (km): `CAPITAL_SEPARATION_LENGTHS` × the longer hull between two capitals,
 * `SLOT_SPACING_FACTOR` × the longer hull for every other pair. Scales with hull size (brief §22).
 */
export function minSeparationKm(a: { role: ShipRole; lengthKm: number }, b: { role: ShipRole; lengthKm: number }): number {
  const len = Math.max(a.lengthKm, b.lengthKm);
  return (isCapitalTier(a.role) && isCapitalTier(b.role) ? CAPITAL_SEPARATION_LENGTHS : SLOT_SPACING_FACTOR) * len;
}

/** Symmetric spread of n items along an axis: 0, +1, −1, +2, −2, ... */
function spreadIndex(i: number): number {
  if (i === 0) return 0;
  const k = Math.ceil(i / 2);
  return i % 2 === 1 ? k : -k;
}

/** Fractional part of i × the golden ratio: a deterministic, well-spread sequence in [0, 1). */
const golden = (i: number): number => (i * 0.6180339887) % 1;

/** The 3D formations of the V2 roster (CINEMATIC_DESIGN.md §7.2); the other six are the v0.11 layouts. */
export const FORMATIONS_3D: readonly FormationType[] = ['layered_line', 'stacked_wedge', 'box', 'swarm_descent', 'broadside_line', 'static'];

export interface SlotOptions {
  /** Battle seed: every hull's variation comes from an `Rng` seeded from it and the ship id. */
  seed?: number;
  /** The fleet's engagement range (simulation km): bounds the frontage of a line (Q1b). */
  range?: number;
}

export interface FormationLayout {
  /** Fleet-local slot of every hull (simulation km). */
  slots: Map<string, Vec3>;
  /** The hull each one keeps station on (its group's lead capital; absent for a group leader). */
  leaders: Map<string, string>;
  /** The slot of each hull's group reference (its leader's slot; a leader's own slot). */
  groupSlots: Map<string, Vec3>;
  /** Battlegroup index of every hull (0 = the centre group). */
  groups: Map<string, number>;
  /** Yaw offset of each hull's station facing (rad). */
  yaw: Map<string, number>;
}

/** Per-hull variation, drawn in a fixed order from the hull's own generator (seed × ship id). */
interface Jitter {
  /** Spacing factor: 1 ± 15–25 %. */
  spacing: number;
  /** Angle offsets (rad). */
  azimuth: number;
  elevation: number;
  /** Offsets as fractions of the group's escort ring radius: lateral ±(0.05–0.18), vertical and depth ±(0.08–0.3). */
  lateral: number;
  vertical: number;
  depth: number;
  /** Station facing yaw (rad). */
  yaw: number;
  /** A uniform draw for choices. */
  u: number;
}

/** The generator of one hull (or group): the battle seed and an id (brief §22; the determinism rule). */
export const hullRng = (seed: number, id: string): Rng => new Rng(((Math.imul(seed >>> 0, 0x9e3779b1) ^ Rng.hashString(id)) >>> 0) || 0x6d2b79f5);

function jitterFor(seed: number, id: string): Jitter {
  const r = hullRng(seed, id);
  const signed = (lo: number, hi: number): number => (r.next() < 0.5 ? -1 : 1) * (lo + (hi - lo) * r.next());
  return {
    spacing: 1 + signed(SPACING_VARIATION[0], SPACING_VARIATION[1]),
    azimuth: signed(0.04, 0.3),
    elevation: signed(0.04, 0.25),
    lateral: signed(0.05, 0.18),
    vertical: signed(0.08, 0.3),
    depth: signed(0.08, 0.3),
    yaw: (signed(STATION_YAW_DEG[0], STATION_YAW_DEG[1]) * Math.PI) / 180,
    u: r.next(),
  };
}

// ----------------------------------------------------------------- nominal layout constants (formation km)

/** Radius of the cruiser / destroyer shell round a group's capital. */
const ESCORT_RING = 3.4;
/** The frigate screen sits this far ahead of its group's capital, on a cap ±40° wide and ±30° high. */
const SCREEN_AHEAD = 4.0;
const SCREEN_AZIMUTH = (40 * Math.PI) / 180;
const SCREEN_ELEVATION = (30 * Math.PI) / 180;
/** Carriers sit behind and above their group's capital. */
const CARRIER_BACK = 3.6;
const CARRIER_UP = 3.0;
/** Craft fly ahead of and above the screen. */
const CRAFT_AHEAD = 2.5;
/**
 * Clear space between neighbouring battlegroups (brief §22, "groups separated so a camera can tell them apart"): this
 * × the largest group's radius, and at least `GROUP_GAP_MIN` nominal km, between the outer hulls of two groups.
 */
export const GROUP_GAP_FRACTION = 0.6;
const GROUP_GAP_MIN = 2;
/** The escort shell sits at least this × the capital–escort clearance from the capital. */
const RING_CLEARANCE = 1.15;

interface Group {
  leaders: SlotShip[];
  members: SlotShip[];
  /** Escort shell radius (nominal), at least `RING_CLEARANCE` × the clearance from its capital. */
  ring: number;
  /** Half the separation of a capital pair (nominal; 0 for one leader). */
  pairHalf: number;
  centre: Vec3;
  /** The group's own pattern: shell phase, mirror and elevation phase (seeded from its leader). */
  phase: number;
  mirror: number;
  tilt: number;
  /** Every hull's offset from the group's centre (nominal, fleet axes), before the centre is placed. */
  local: Map<string, Vec3>;
}

/** The largest extent of any group round its centre (nominal; small craft excluded): left, right, ahead, behind, up, down. */
interface Extent {
  xl: number;
  xr: number;
  zf: number;
  zb: number;
  yu: number;
  yd: number;
}

/**
 * Slots for a fleet (simulation km). Backward compatible: without options the seed is 0 and the frontage unbounded.
 */
export function assignSlots(ships: SlotShip[], formation: FormationType, opts: SlotOptions = {}): Map<string, Vec3> {
  return layoutFormation(ships, formation, opts).slots;
}

/** The full battlegroup layout: slots, group leaders, group references, groups and station yaw. */
export function layoutFormation(ships: SlotShip[], formation: FormationType, opts: SlotOptions = {}): FormationLayout {
  const seed = opts.seed ?? 0;
  const k = SLOT_COMPRESSION;
  const jit = new Map<string, Jitter>();
  for (const s of ships) jit.set(s.id, jitterFor(seed, s.id));
  const groups = formGroups(ships, seed);
  // Each group's own cluster first, so the formation spaces the groups by their real size.
  for (const g of groups) placeGroup(g, formation, jit);
  const ext = groups.length > 0 ? extentOf(groups, ships) : undefined;
  const rangeNom = opts.range !== undefined ? opts.range / k : undefined;
  const bound = opts.range !== undefined ? FRONTAGE_RANGES * opts.range : Infinity;
  let cap = Infinity;
  for (;;) {
    const abreast = ext ? placeGroupCentres(groups, formation, rangeNom, seed, ext, cap) : Infinity;
    const layout = settle(ships, groups, jit);
    // Q1b holds on the hulls themselves: a line the seeded offsets and the clearances pushed past it loses a group abreast.
    if (abreast <= 1 || !Number.isFinite(abreast) || frontageOf([...layout.slots.values()]) <= bound + 1e-9) return layout;
    cap = abreast - 1;
  }
}

/** The groups' clusters on their centres, in simulation km, with the clearances, the row breaker and the group check. */
function settle(ships: SlotShip[], groups: Group[], jit: Map<string, Jitter>): FormationLayout {
  const k = SLOT_COMPRESSION;
  const slots = new Map<string, Vec3>();
  const groupOf = new Map<string, number>();
  const leaders = new Map<string, string>();
  groups.forEach((g, gi) => {
    const lead = g.leaders[0];
    for (const s of [...g.leaders, ...g.members]) {
      const o = g.local.get(s.id)!;
      slots.set(s.id, v3((g.centre.x + o.x) * k, (g.centre.y + o.y) * k, (g.centre.z + o.z) * k));
      groupOf.set(s.id, gi);
      if (s !== lead) leaders.set(s.id, lead.id);
    }
  });
  spacingGuard(ships, slots);
  breakRows(ships, slots, jit, groupOf, groups.length > 0 ? groupClearKm(groups, ships) : 0);
  joinNearestGroup(ships, slots, groups, groupOf, leaders);
  const groupSlots = new Map<string, Vec3>();
  for (const s of ships) {
    const lead = leaders.get(s.id);
    const ref = slots.get(lead ?? s.id) ?? slots.get(s.id)!;
    groupSlots.set(s.id, v3(ref.x, ref.y, ref.z));
  }
  const yaw = new Map<string, number>();
  for (const s of ships) yaw.set(s.id, s.role === 'fighter' || s.role === 'fixed_platform' ? 0 : jit.get(s.id)!.yaw);
  return { slots, leaders, groupSlots, groups: groupOf, yaw };
}

/**
 * Battlegroups: the leaders are the capitals (carriers excepted), paired above `PAIR_CAPITALS_ABOVE`; without one,
 * the cruisers (one group per three) or the frigates (one per four) lead; carriers and escorts are dealt to the
 * groups in deployment order, each tier round the groups in turn, so every group gets its share.
 */
function formGroups(ships: SlotShip[], seed: number): Group[] {
  const capitals = ships.filter((s) => isGroupCapital(s.role));
  const carriers = ships.filter((s) => s.role === 'carrier');
  const t1 = ships.filter((s) => tier(s.role) === 1);
  const t2 = ships.filter((s) => tier(s.role) === 2);
  const t3 = ships.filter((s) => tier(s.role) === 3);
  let leaderSets: SlotShip[][];
  const evenly = (pool: SlotShip[], n: number): SlotShip[] => Array.from({ length: n }, (_, g) => pool[Math.min(pool.length - 1, Math.floor(((g + 0.5) * pool.length) / n))]);
  if (capitals.length > 0) {
    const pairs = capitals.length > PAIR_CAPITALS_ABOVE && !capitals.every((c) => c.role === 'fixed_platform');
    leaderSets = [];
    for (let i = 0; i < capitals.length; i += pairs ? 2 : 1) leaderSets.push(capitals.slice(i, i + (pairs ? 2 : 1)));
  } else if (t1.length > 0) leaderSets = evenly(t1, Math.max(1, Math.round(t1.length / 3))).map((s) => [s]);
  else if (carriers.length > 0) leaderSets = carriers.map((s) => [s]);
  else if (t2.length > 0) leaderSets = evenly(t2, Math.max(1, Math.round(t2.length / 4))).map((s) => [s]);
  else if (t3.length > 0) leaderSets = [[t3[0]]];
  else return [];
  const isLeader = new Set(leaderSets.flat().map((s) => s.id));
  const groups: Group[] = leaderSets.map((leaders) => {
    const r = hullRng(seed, `pattern:${leaders[0].id}`);
    return { leaders, members: [], ring: ESCORT_RING, pairHalf: 0, centre: v3(), phase: r.next() * Math.PI * 2, mirror: r.next() < 0.5 ? -1 : 1, tilt: r.next(), local: new Map() };
  });
  const G = groups.length;
  for (const pool of [carriers, t1, t2, t3]) {
    let i = 0;
    for (const s of pool) {
      if (isLeader.has(s.id)) continue;
      groups[i % G].members.push(s);
      i++;
    }
  }
  const k = SLOT_COMPRESSION;
  for (const g of groups) {
    const lead = g.leaders[0];
    let ring = ESCORT_RING;
    // The shell and screen keep their clearance from the capital; carriers sit behind and above (scaled in placeGroup).
    for (const m of g.members) if (m.role !== 'carrier') ring = Math.max(ring, (RING_CLEARANCE * minSeparationKm(lead, m)) / k);
    if (g.leaders.length > 1) {
      const pair = (1.15 * minSeparationKm(g.leaders[0], g.leaders[1])) / k;
      g.pairHalf = pair / 2;
      ring += g.pairHalf * 0.6;
    }
    g.ring = ring;
  }
  return groups;
}

/** The largest extent of the groups' clusters round their centres (nominal), small craft excluded. */
function extentOf(groups: Group[], ships: SlotShip[]): Extent {
  const role = new Map(ships.map((s) => [s.id, s.role]));
  const e: Extent = { xl: 0, xr: 0, zf: 0, zb: 0, yu: 0, yd: 0 };
  for (const g of groups) {
    for (const [id, o] of g.local) {
      if (role.get(id) === 'fighter') continue;
      e.xl = Math.max(e.xl, -o.x);
      e.xr = Math.max(e.xr, o.x);
      e.zf = Math.max(e.zf, o.z);
      e.zb = Math.max(e.zb, -o.z);
      e.yu = Math.max(e.yu, o.y);
      e.yd = Math.max(e.yd, -o.y);
    }
  }
  // A lone capital still takes up its own clearance.
  const floor = Math.max(...groups.map((g) => g.ring)) * 0.5;
  return { xl: Math.max(e.xl, floor), xr: Math.max(e.xr, floor), zf: Math.max(e.zf, floor), zb: Math.max(e.zb, floor), yu: Math.max(e.yu, floor * 0.5), yd: Math.max(e.yd, floor * 0.5) };
}

/** Group heights along a line, by position from left to right (in [−1, 1]): no three neighbours at one height. */
const lineHeight = (p: number): number => [0.55, -0.7, 0.15, 0.9, -0.4, -1, 0.65, -0.2, 0.95, -0.75][((p % 10) + 10) % 10];
/** Fixed-pattern height sequence in [−1, 1] by group index: no three neighbouring groups at one height. */
const heightPattern = (g: number): number => [0, 0.85, -0.7, 0.45, -1, 0.7, -0.4, 1, -0.85, 0.25][g % 10];

/** Lines (the line abreast, the fighter screen, the platforms' arc) put at most this many groups abreast before Q1b. */
export const LINE_RANK_GROUPS = 8;

/**
 * Group centres (nominal) by formation: the formation's character at group scale. The spacings come from the groups'
 * real extent (`Extent`): `gx` between the centres of two groups side by side, `gz` one behind the other, `gy` one
 * above the other — each the two groups' extents plus a clear gap (`GROUP_GAP_FRACTION`), so neighbouring groups stay
 * apart and a camera tells them apart. Lines are bounded by Q1b (`FRONTAGE_RANGES` × the fleet's range) and wrap into
 * staggered echelons behind. Each centre then takes a small seeded offset from its leader's generator.
 */
function placeGroupCentres(groups: Group[], formation: FormationType, rangeNom: number | undefined, seed: number, ext: Extent, cap = Infinity): number {
  const G = groups.length;
  const rad = Math.max(ext.xl, ext.xr, ext.zf, ext.zb, 1);
  const gap = Math.max(GROUP_GAP_MIN, GROUP_GAP_FRACTION * rad);
  const gx = ext.xl + ext.xr + gap;
  const gz = ext.zf + ext.zb + gap;
  const gy = ext.yu + ext.yd + gap;
  const width = ext.xl + ext.xr;
  const centres: Vec3[] = [];
  /** Most groups abreast that keep a line within Q1b (all of them when no range is given). */
  const abreast = (spacing: number): number => Math.min(cap, rangeNom === undefined ? Infinity : Math.max(1, Math.floor((FRONTAGE_RANGES * rangeNom - width) / spacing) + 1));
  /** The most groups any one rank of a line holds (Infinity for the formations Q1b does not bound). */
  let used = Infinity;
  /**
   * A line of groups at `spacing`, centre-out from the first (the flagship's) group, wrapped into ranks of equal size
   * `rankDepth` apart (odd ranks shifted half a spacing, so they sit in the gaps); along each rank the groups step
   * alternately forward and back by `echelon` and up and down by `rise` × the line's height pattern.
   */
  const line = (spacing: number, echelon: number, rankDepth: number, rise: number, maxAbreast = LINE_RANK_GROUPS): void => {
    const perMax = Math.max(1, Math.min(G, maxAbreast, abreast(spacing)));
    const ranks = Math.ceil(G / perMax);
    const per = Math.ceil(G / ranks);
    used = per;
    for (let g = 0; g < G; g++) {
      const rank = Math.floor(g / per);
      const n = Math.min(per, G - rank * per);
      const j = g - rank * per;
      // Position from the left, 0..n−1, of the j-th group placed centre-out.
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => spreadIndex(a) - spreadIndex(b));
      const p = order.indexOf(j);
      const shift = rank % 2 === 1 && n === per ? 0.5 : 0;
      const x = (p - (n - 1) / 2 + shift) * spacing;
      const z = (p % 2 === 0 ? 1 : -1) * echelon - rank * rankDepth;
      centres.push(v3(x, rise * lineHeight(p + 3 * rank), z));
    }
  };
  switch (formation) {
    case 'line_abreast':
      line(gx, 0.15 * gz, 0.9 * gz, 0.45 * gy);
      break;
    case 'fighter_screen':
      line(gx, 0.12 * gz, 0.85 * gz, 0.4 * gy);
      break;
    case 'layered_line': {
      // Three height layers (the line itself, above and below), the groups closer laterally since the layers keep
      // neighbours apart; bounded by Q1b like the line abreast.
      const spacing = 0.62 * gx;
      const perMax = Math.max(1, Math.min(G, 3 * LINE_RANK_GROUPS, abreast(spacing)));
      const ranks = Math.ceil(G / perMax);
      const per = Math.ceil(G / ranks);
      used = per;
      for (let g = 0; g < G; g++) {
        const rank = Math.floor(g / per);
        const n = Math.min(per, G - rank * per);
        const j = g - rank * per;
        const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => spreadIndex(a) - spreadIndex(b));
        const p = order.indexOf(j);
        const layer = [0, 1, -1][p % 3];
        centres.push(v3((p - (n - 1) / 2) * spacing, layer * 0.95 * gy + 0.15 * gy * lineHeight(p), (p % 2 ? -0.12 : 0.12) * gz - rank * 0.9 * gz));
      }
      break;
    }
    case 'static': {
      // Platforms on a shallow arc across the bearing (6 km apart at least), alternately above and below the plane.
      const spacing = Math.max(gx, 6 / SLOT_COMPRESSION);
      line(spacing, 0.08 * gz, 0.9 * gz, 0.5 * gy, Infinity);
      for (const c of centres) c.z -= (0.012 * c.x * c.x) / Math.max(1, spacing / 6);
      break;
    }
    case 'broadside_line': {
      // A column along the heading, zig-zagging a little: the doctrine facing turns it 90° once locked, into a line of
      // battle with every group's escorts on the enemy (+x) side. A column longer than Q1b splits into columns side by
      // side, the further ones on the far (−x) side.
      const step = 0.85 * gz;
      const perMax = Math.max(1, Math.min(G, rangeNom === undefined ? G : Math.floor((FRONTAGE_RANGES * rangeNom - gz) / step) + 1));
      const cols = Math.ceil(G / perMax);
      const per = Math.ceil(G / cols);
      for (let g = 0; g < G; g++) {
        const col = Math.floor(g / per);
        const n = Math.min(per, G - col * per);
        const j = g - col * per;
        centres.push(v3((j % 2 ? 0.18 : -0.18) * gx * (n > 1 ? 1 : 0) - col * 1.1 * gx, heightPattern(j + 2 * col) * 0.4 * gy, -(j - (n - 1) / 2) * step));
      }
      break;
    }
    case 'defensive_screen': {
      // Two staggered ranks on a shallow concave arc (flanks forward): the even groups forward, the odd ones behind and
      // between them; further rank pairs behind when the front would pass Q1b.
      const perMax = Math.max(2, 2 * Math.min(G, abreast(gx)));
      const pairs = Math.ceil(G / perMax);
      const per = Math.ceil(G / pairs);
      used = Math.ceil(per / 2);
      for (let g = 0; g < G; g++) {
        const pr = Math.floor(g / per);
        const n = Math.min(per, G - pr * per);
        const i = g - pr * per;
        const back = i % 2 === 1;
        const front = Math.ceil(n / 2);
        const j = Math.floor(i / 2);
        const order = Array.from({ length: back ? n - front : front }, (_, q) => q).sort((a, b) => spreadIndex(a) - spreadIndex(b));
        const p = order.indexOf(j);
        const count = order.length;
        const x = (p - (count - 1) / 2 + (back && count === front ? 0.5 : 0)) * gx;
        const half = Math.max(1, ((front - 1) / 2) * gx);
        const f = Math.min(1, Math.abs(x) / half);
        centres.push(v3(x, (back ? -0.5 : 0.5) * gy * Math.abs(lineHeight(p + (back ? 5 : 0))) + 0.2 * gy * lineHeight(p + 2), (back ? -0.8 * gz : 0) + 0.3 * gz * f * f - pr * 1.7 * gz));
      }
      break;
    }
    case 'strike_wedge':
    case 'stacked_wedge': {
      // A 3D arrowhead: the apex group leads; each rank behind it holds up to three groups (left, right, and one above
      // or below the axis), stepping out and back; the stacked wedge spreads every rank over three heights.
      const stacked = formation === 'stacked_wedge';
      let g = 1;
      centres.push(v3(0, 0, 0));
      for (let r = 1; g < G; r++) {
        const rank = [
          v3(-0.66 * r * gx, (stacked ? -0.8 : -0.3) * gy, -0.5 * r * gz),
          v3(0.66 * r * gx, (stacked ? 0.8 : 0.3) * gy, -0.5 * r * gz),
          v3((r % 2 ? 0.15 : -0.15) * gx, (r % 2 ? 1 : -1) * (stacked ? 1.05 : 0.85) * gy, -(0.4 + 0.5 * r) * gz),
        ];
        for (const p of rank) {
          if (g >= G) break;
          centres.push(p);
          g++;
        }
      }
      break;
    }
    case 'capital_column': {
      // A deep column, zig-zagging and stepping in height; deeper than two ranges it splits into files side by side.
      const step = 0.6 * gz;
      const perMax = rangeNom === undefined ? G : Math.max(2, Math.floor((2 * rangeNom - (ext.zf + ext.zb)) / step) + 1);
      const files = Math.ceil(G / Math.min(G, perMax));
      const per = Math.ceil(G / files);
      for (let g = 0; g < G; g++) {
        const file = Math.floor(g / per);
        const j = g - file * per;
        const zig = j > 0 ? (j % 2 ? 0.3 : -0.3) : 0;
        centres.push(v3((file - (files - 1) / 2) * 1.2 * gx + zig * gx, (j > 0 ? (j % 2 ? 0.35 : -0.35) : 0) * gy, -j * step));
      }
      break;
    }
    case 'box': {
      // Groups on a 3D grid round the centre.
      const n = Math.max(1, Math.ceil(Math.cbrt(G)));
      const layers = Math.max(1, Math.ceil(G / (n * n)));
      for (let g = 0; g < G; g++) {
        const ix = g % n;
        const iy = Math.floor(g / n) % n;
        const iz = Math.floor(g / (n * n));
        centres.push(v3((ix - (n - 1) / 2) * 0.9 * gx, (iy - (n - 1) / 2) * 0.9 * gy, -(iz - (layers - 1) / 2) * 0.9 * gz));
      }
      break;
    }
    case 'swarm_descent': {
      // Short descending columns of three groups (each lower and further back), staggered left and right.
      const cols = Math.ceil(G / 3);
      for (let g = 0; g < G; g++) {
        const col = Math.floor(g / 3);
        const kk = g % 3;
        const x = (cols > 1 ? spreadIndex(col) * 1.05 * gx : 0) + (kk === 1 ? 0.3 : kk === 2 ? -0.3 : 0) * gx;
        centres.push(v3(x, (1 - kk) * 0.75 * gy, -kk * 0.6 * gz - col * 0.2 * gz));
      }
      break;
    }
    case 'dispersed':
    default: {
      // A loose scatter on a jittered grid.
      const cols = Math.max(1, Math.ceil(Math.sqrt(G * 1.5)));
      const rows = Math.max(1, Math.ceil(G / cols));
      for (let g = 0; g < G; g++) {
        const c = g % cols;
        const r = Math.floor(g / cols);
        centres.push(v3((c - (cols - 1) / 2) * 1.15 * gx + (golden(g + 1) - 0.5) * 0.35 * gx, heightPattern(g + 1) * 0.6 * gy, -(r - (rows - 1) / 2) * 1.05 * gz + (golden(g + 7) - 0.5) * 0.35 * gz));
      }
      break;
    }
  }
  groups.forEach((g, gi) => {
    const c = centres[gi];
    const r = hullRng(seed, `group:${g.leaders[0].id}`);
    const s = (): number => r.next() * 2 - 1;
    g.centre = v3(c.x + s() * 0.06 * gx, c.y + s() * 0.12 * gy, c.z + s() * 0.1 * gz);
  });
  separateGroups(groups, Math.max(GROUP_GAP_MIN, GROUP_CLEAR_FRACTION * rad));
  return used;
}

/** No two hulls of different groups nearer than this × the largest group's radius (nominal; brief §22). */
export const GROUP_CLEAR_FRACTION = 0.5;

/** The clear space kept between hulls of different groups (km): `separateGroups`' distance, a little relaxed. */
function groupClearKm(groups: Group[], ships: SlotShip[]): number {
  const e = extentOf(groups, ships);
  return 0.8 * Math.max(GROUP_GAP_MIN, GROUP_CLEAR_FRACTION * Math.max(e.xl, e.xr, e.zf, e.zb, 1)) * SLOT_COMPRESSION;
}

/**
 * Keep the groups apart (brief §22): wherever two hulls of different groups sit nearer than `clear` (nominal), the later
 * group moves straight away from the earlier one until they are clear; the first group (the flagship's) never moves.
 * The formations' diagonal ranks and echelons are tight by design, so this settles them. Deterministic: fixed order.
 */
function separateGroups(groups: Group[], clear: number): void {
  const pts = groups.map((g) => [...g.local.values()]);
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let j = 1; j < groups.length; j++) {
      for (let i = 0; i < j; i++) {
        const a = groups[i].centre;
        const b = groups[j].centre;
        let least = Infinity;
        for (const p of pts[i]) for (const q of pts[j]) least = Math.min(least, Math.hypot(b.x + q.x - a.x - p.x, b.y + q.y - a.y - p.y, b.z + q.z - a.z - p.z));
        if (least >= clear - 1e-9) continue;
        let ux = b.x - a.x;
        let uy = b.y - a.y;
        let uz = b.z - a.z;
        const l = Math.hypot(ux, uy, uz);
        if (l < 1e-9) {
          ux = 1;
          uy = 0;
          uz = 0;
        } else {
          ux /= l;
          uy /= l;
          uz /= l;
        }
        const push = (clear - least) * 1.05 + 1e-3;
        groups[j].centre = v3(b.x + ux * push, b.y + uy * push, b.z + uz * push);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Unit vector at azimuth θ (from +z toward +x) and elevation φ. */
const dir = (theta: number, phi: number): Vec3 => v3(Math.sin(theta) * Math.cos(phi), Math.sin(phi), Math.cos(theta) * Math.cos(phi));
const scaleV = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);

/**
 * One group's cluster round its centre (nominal, fleet axes; `g.local`): its capital(s) at the centre; cruisers on a
 * shell round it (spread over the forward 300° from the group's own phase, mirrored as the group draws, alternately
 * above and below; a Reaper capital's destroyers beside, above, below and behind it — the capital leads); frigates on
 * a cap ahead; carriers behind and above; craft ahead of the screen. A broadside line keeps its escorts on its +x
 * (enemy) side. Every hull takes its jitter.
 */
function placeGroup(g: Group, formation: FormationType, jit: Map<string, Jitter>): void {
  const ring = g.ring;
  const broadside = formation === 'broadside_line';
  const reaper = g.leaders[0].role === 'reaper_capital';
  // A broadside line keeps every escort on its +x side; any other group may mirror its pattern.
  const mirror = broadside ? 1 : g.mirror;
  const out = g.local;
  const put = (s: SlotShip, p: Vec3): void => {
    const j = jit.get(s.id)!;
    out.set(s.id, v3(mirror * p.x + j.lateral * ring * 0.6, p.y + j.vertical * ring * 0.6, p.z + j.depth * ring * 0.6));
  };
  // The capital(s): one at the centre, a pair side by side with a stagger in height and depth.
  g.leaders.forEach((s, i) => {
    if (g.leaders.length === 1) put(s, v3(0, 0, 0));
    else {
      const side = i === 0 ? -1 : 1;
      put(s, v3(side * g.pairHalf, side * 0.35 * g.pairHalf, -side * 0.25 * g.pairHalf));
    }
  });
  const byTier = (t: number): SlotShip[] => g.members.filter((s) => tier(s.role) === t && s.role !== 'carrier');
  // Shell escorts (cruisers, Reaper destroyers): azimuths over the forward 300° from the group's phase (the broadside
  // line's over its +x side), alternately above and below by the group's tilt.
  const shell = byTier(1);
  shell.forEach((s, i) => {
    const j = jit.get(s.id)!;
    const n = shell.length;
    const slot = (i + 0.5) / n;
    // A Reaper capital leads its destroyers (they swarm beside, above, below and behind it, never screening it).
    const theta = broadside ? ((20 + 140 * slot) * Math.PI) / 180 : reaper ? ((75 + 210 * slot) * Math.PI) / 180 + g.phase / (2 * n) : ((-150 + 300 * slot) * Math.PI) / 180 + g.phase / n;
    const up = (i + (g.tilt < 0.5 ? 0 : 1)) % 2 === 0 ? 1 : -1;
    const phi = up * (0.22 + 0.4 * golden(i + 2 + Math.floor(g.tilt * 7))) + j.elevation;
    put(s, scaleV(dir(theta + j.azimuth, phi), ring * j.spacing));
  });
  // The frigate screen: a cap ahead of the capital (for a broadside line: out on its +x side), scattered by the
  // golden sequence from the group's phase.
  const screen = byTier(2);
  const off = Math.floor(g.phase * 10);
  screen.forEach((s, i) => {
    const j = jit.get(s.id)!;
    const n = screen.length;
    const a = n > 1 ? golden(i + off + 1) - 0.5 : 0;
    const b = n > 1 ? golden(2 * i + off + 4) - 0.5 : 0;
    const theta = (broadside ? Math.PI / 2 : 0) + 2 * a * SCREEN_AZIMUTH + j.azimuth;
    const phi = 2 * b * SCREEN_ELEVATION * (g.tilt < 0.5 ? 1 : -1) + j.elevation;
    // A cloud, not a shell: the screen has depth as well as width and height.
    const reach = (SCREEN_AHEAD + ring - ESCORT_RING) * j.spacing + (j.u - 0.5) * 0.5 * ring;
    put(s, scaleV(dir(theta, phi), reach));
  });
  // Carriers: behind and above, a pair side by side.
  const carriers = g.members.filter((s) => s.role === 'carrier');
  const lead = g.leaders[0];
  carriers.forEach((s, i) => {
    const j = jit.get(s.id)!;
    const x = carriers.length > 1 ? spreadIndex(i + 1) * 0.55 * ring : 0;
    // Never inside its capital clearance from the group's capital(s).
    const reach = Math.hypot(x, CARRIER_UP, CARRIER_BACK) * j.spacing;
    const need = (RING_CLEARANCE * minSeparationKm(lead, s)) / SLOT_COMPRESSION + g.pairHalf;
    const f = Math.max(1, need / reach) * j.spacing;
    put(s, v3(x * f, CARRIER_UP * f, -CARRIER_BACK * f));
  });
  // Craft: ahead of and above the screen.
  const craft = byTier(3);
  craft.forEach((s, i) => {
    const j = jit.get(s.id)!;
    const a = craft.length > 1 ? golden(i + off + 5) - 0.5 : 0;
    const ahead = SCREEN_AHEAD + ring - ESCORT_RING + CRAFT_AHEAD;
    if (broadside) put(s, v3(ahead * j.spacing, 1.5 + golden(i + 2) * 1.5, a * ring * 1.6));
    else put(s, v3(a * ring * 1.6, 1.5 + golden(i + 2) * 1.5, ahead * j.spacing));
  });
}

/**
 * The spacing guard (CINEMATIC_DESIGN.md §7.2, brief §22): slots are settled one at a time in tier order (capitals
 * first, then cruisers, frigates, small craft; deployment order inside a tier), and a slot inside the clearance of
 * an already-settled one (`minSeparationKm`) is pushed straight away from it until it is clear of all of them.
 * Deterministic: no randomness, fixed order.
 */
function spacingGuard(ships: SlotShip[], slots: Map<string, Vec3>): void {
  const order = ships
    .map((s, i) => ({ s, i, t: tier(s.role) }))
    .filter((e) => slots.has(e.s.id))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  const settled: { p: Vec3; s: SlotShip }[] = [];
  for (const { s, i } of order) {
    const p = slots.get(s.id)!;
    for (let attempt = 0; attempt < 96; attempt++) {
      let moved = false;
      for (const q of settled) {
        const need = minSeparationKm(q.s, s);
        const dx = p.x - q.p.x;
        const dy = p.y - q.p.y;
        const dz = p.z - q.p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= need - 1e-9) continue;
        // Push straight away from the settled slot; coincident slots split along a deterministic direction.
        let ux: number;
        let uy: number;
        let uz: number;
        if (d > 1e-6) {
          ux = dx / d;
          uy = dy / d;
          uz = dz / d;
        } else {
          const a = golden(i + 1) * Math.PI * 2;
          ux = Math.cos(a) * 0.96;
          uy = 0.28;
          uz = Math.sin(a) * 0.96;
        }
        const push = need - d + 1e-3;
        p.x += ux * push;
        p.y += uy * push;
        p.z += uz * push;
        moved = true;
      }
      if (!moved) break;
    }
    settled.push({ p, s });
  }
}

/**
 * Escorts belong to the group whose capital is nearest (brief §22: a group is a capital with the escorts round it):
 * after the jitter and the guard, an escort nearer another group's capital than its own joins that group.
 */
function joinNearestGroup(ships: SlotShip[], slots: Map<string, Vec3>, groups: Group[], groupOf: Map<string, number>, leaders: Map<string, string>): void {
  const caps = ships.filter((s) => isGroupCapital(s.role) && slots.has(s.id));
  if (caps.length < 2) return;
  const lead = new Map<number, string>();
  groups.forEach((g, gi) => lead.set(gi, g.leaders[0].id));
  for (const s of ships) {
    if (isGroupCapital(s.role) || !slots.has(s.id)) continue;
    const p = slots.get(s.id)!;
    let best: SlotShip | undefined;
    let bd = Infinity;
    for (const c of caps) {
      const q = slots.get(c.id)!;
      const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) continue;
    const g = groupOf.get(best.id);
    if (g === undefined || g === groupOf.get(s.id)) continue;
    groupOf.set(s.id, g);
    leaders.set(s.id, lead.get(g)!);
  }
}

/** Above this many hulls the row breaker only looks at hulls within a share of the frontage of each other. */
const ROW_CHECK_FULL = 200;
/** The row breaker's tolerance, a little wider than the "no rows" bound (2 % of the frontage). */
export const ROW_TOLERANCE_FRONTAGE = 0.025;

/** A frontage tolerance up to this × the median neighbour distance is attainable for the row breaker. */
const ROW_ATTAINABLE = 0.65;
/** A dense fleet's row tolerance: this × its median neighbour distance… */
const ROW_DENSE_SPACING = 0.32;
/** …among the hulls within this × the spacing (a chain of four adjacent hulls). */
const ROW_DENSE_REACH = 8;
/** Fleets above this many hulls are judged in the dense way whatever their frontage. */
export const ROW_DENSE_HULLS = 64;

/** Median distance from each point to its nearest neighbour (km). */
export function medianNeighbour(points: readonly Vec3[]): number {
  if (points.length < 2) return 1;
  const nn = points.map((p, i) => {
    let best = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      const q = points[j];
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  });
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)];
}

/** Frontage of a set of slots (lateral extent, km), at least 1. */
export function frontageOf(points: readonly Vec3[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p.x);
    hi = Math.max(hi, p.x);
  }
  return Math.max(1, hi - lo);
}

/**
 * Hulls in a row with `a` and `b`: those within `tol` of the horizontal line through the two at their mean height
 * (the formation-plane lines of brief §22's no-rows rule). The count includes `a` and `b` when they are within `tol`
 * themselves (their height difference ≤ 2 tol). `among` restricts the count to those indices.
 */
export function rowCount(points: readonly Vec3[], a: number, b: number, tol: number, limit = Infinity, among?: readonly number[]): number {
  const pa = points[a];
  const pb = points[b];
  const ux = pb.x - pa.x;
  const uz = pb.z - pa.z;
  const ul = Math.hypot(ux, uz);
  if (ul < 1e-9) return 0;
  const nx = ux / ul;
  const nz = uz / ul;
  const y0 = (pa.y + pb.y) / 2;
  const tol2 = tol * tol;
  let n = 0;
  const count = (i: number): boolean => {
    const p = points[i];
    const w = (p.x - pa.x) * nz - (p.z - pa.z) * nx;
    const dy = p.y - y0;
    return w * w + dy * dy <= tol2;
  };
  if (among) {
    for (const i of among) if (count(i) && ++n >= limit) return n;
  } else {
    for (let i = 0; i < points.length; i++) if (count(i) && ++n >= limit) return n;
  }
  return n;
}

/**
 * Row breaker (brief §22, "no hulls form a straight row or column"): after the jitter and the spacing guard, a hull
 * that makes a fourth on a horizontal line with three others (within `ROW_TOLERANCE_FRONTAGE` × the frontage) is
 * lifted or lowered (and shifted in depth) — away from the line, by its own seeded choice, at most about 4 tolerances — until no such line passes
 * through it, keeping every clearance. Fleets above `ROW_CHECK_FULL` hulls are checked within a neighbourhood of a
 * third of the frontage. Deterministic.
 */
function breakRows(ships: SlotShip[], slots: Map<string, Vec3>, jit: Map<string, Jitter>, groupOf: Map<string, number>, groupClear: number): void {
  const live = ships.filter((s) => slots.has(s.id) && s.role !== 'fighter');
  if (live.length < 4) return;
  const pts = live.map((s) => slots.get(s.id)!);
  const frontage = frontageOf(pts);
  // The frontage tolerance where it is attainable. In a dense fleet — 2 % of a wide frontage close to its own hull
  // spacing, where near-collinear quadruples follow from density alone — rows are judged at a third of the spacing,
  // among neighbours (a row is a chain of adjacent hulls).
  const spacing = medianNeighbour(pts);
  const frontTol = ROW_TOLERANCE_FRONTAGE * frontage;
  const dense = live.length > ROW_DENSE_HULLS && frontTol > ROW_ATTAINABLE * spacing;
  const tol = dense ? ROW_DENSE_SPACING * spacing : frontTol;
  const local = dense || live.length > ROW_CHECK_FULL;
  const near = dense ? ROW_DENSE_REACH * spacing : live.length > ROW_CHECK_FULL ? frontage / 3 : Infinity;
  const neighbours = (i: number): number[] => {
    const out: number[] = [];
    for (let j = 0; j < pts.length; j++) if (Math.abs(pts[j].x - pts[i].x) <= near && Math.abs(pts[j].z - pts[i].z) <= near) out.push(j);
    return out;
  };
  // A moved hull keeps every clearance and stays out of the other groups' space (`groupClear`, brief §22).
  const clear = (i: number, p: Vec3): boolean => {
    const gi = groupOf.get(live[i].id);
    for (let j = 0; j < live.length; j++) {
      if (j === i) continue;
      const q = pts[j];
      const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      if (d < minSeparationKm(live[i], live[j]) - 1e-9) return false;
      if (gi !== undefined && groupOf.get(live[j].id) !== gi && d < groupClear) return false;
    }
    return true;
  };
  const onRow = (i: number): boolean => {
    const among = local ? neighbours(i) : undefined;
    for (const j of among ?? pts.keys()) {
      if (j === i) continue;
      if (rowCount(pts, i, j, tol, 4, among) >= 4) return true;
    }
    return false;
  };
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (let i = 0; i < live.length; i++) {
      if (!onRow(i)) continue;
      const sign = jit.get(live[i].id)!.u < 0.5 ? 1 : -1;
      const p = pts[i];
      const base = v3(p.x, p.y, p.z);
      let done = false;
      // Lift or lower it (and shift it in depth) a little further each step, its own way first.
      for (let step = 1; step <= 8 && !done; step++) {
        for (const s of [sign, -sign]) {
          for (const dz of [step % 2 ? s : -s, 0, step % 2 ? -s : s]) {
            p.x = base.x;
            p.y = base.y + s * 0.55 * tol * step;
            p.z = base.z + dz * 0.25 * tol * step;
            if (clear(i, p) && !onRow(i)) {
              done = true;
              changed = true;
              break;
            }
          }
          if (done) break;
        }
      }
      if (!done) {
        p.x = base.x;
        p.y = base.y;
        p.z = base.z;
      }
    }
    if (!changed) break;
  }
}

/** Convert a fleet-local slot to world space given anchor position and heading (unit, y≈0). */
export function slotToWorld(anchor: Vec3, heading: Vec3, slot: Vec3): Vec3 {
  // right = heading × up
  const rx = heading.z;
  const rz = -heading.x;
  return v3(
    anchor.x + rx * slot.x + heading.x * slot.z,
    anchor.y + slot.y,
    anchor.z + rz * slot.x + heading.z * slot.z,
  );
}

/** Rotate a fleet-local offset into world space (no translation). */
export function offsetToWorld(heading: Vec3, off: Vec3): Vec3 {
  return v3(heading.z * off.x + heading.x * off.z, off.y, -heading.x * off.x + heading.z * off.z);
}
