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

/** A line formation puts at most this many groups abreast; further groups form staggered echelons behind (brief §22). */
export const LINE_RANK_GROUPS = 5;
/** Line formations whose frontage grows with the number of groups (Q1b wraps them into echelons). */
const LINE_FORMATIONS: ReadonlySet<FormationType> = new Set<FormationType>(['line_abreast', 'layered_line', 'fighter_screen', 'static']);

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
const SCREEN_AHEAD = 4.6;
const SCREEN_AZIMUTH = (40 * Math.PI) / 180;
const SCREEN_ELEVATION = (30 * Math.PI) / 180;
/** Carriers sit behind and above their group's capital. */
const CARRIER_BACK = 3.6;
const CARRIER_UP = 3.0;
/** Craft fly ahead of and above the screen. */
const CRAFT_AHEAD = 2.5;
/** Clear space between neighbouring groups' outer hulls (so a camera tells the groups apart). */
const GROUP_GAP = 1.5;
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
  const nominal = new Map<string, Vec3>();
  const groupOf = new Map<string, number>();
  const leaders = new Map<string, string>();
  if (groups.length > 0) {
    placeGroupCentres(groups, formation, opts.range !== undefined ? opts.range / k : undefined, seed);
    groups.forEach((g, gi) => {
      placeGroup(g, formation, jit, nominal);
      const lead = g.leaders[0];
      for (const s of [...g.leaders, ...g.members]) {
        groupOf.set(s.id, gi);
        if (s !== lead) leaders.set(s.id, lead.id);
      }
    });
  }
  const slots = new Map<string, Vec3>();
  for (const [id, p] of nominal) slots.set(id, v3(p.x * k, p.y * k, p.z * k));
  spacingGuard(ships, slots);
  breakRows(ships, slots, jit);
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
    return { leaders, members: [], ring: ESCORT_RING, pairHalf: 0, centre: v3(), phase: r.next() * Math.PI * 2, mirror: r.next() < 0.5 ? -1 : 1, tilt: r.next() };
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

/** Fixed-pattern height sequence in [−1, 1]: no three neighbouring groups at one height. */
const heightPattern = (g: number): number => [0, 0.85, -0.7, 0.45, -1, 0.7, -0.4, 1, -0.85, 0.25][g % 10];

/**
 * Group centres (nominal) by formation: the formation's character at group scale. `d` is the centre spacing of the
 * groups (twice the largest escort ring plus a clear gap), `h` a height step, `e` a depth (echelon) step. Each
 * centre then takes a small seeded offset from its leader's generator.
 */
function placeGroupCentres(groups: Group[], formation: FormationType, rangeNom: number | undefined, seed: number): void {
  const G = groups.length;
  const ring = Math.max(...groups.map((g) => g.ring));
  const d = 2 * ring + GROUP_GAP;
  const h = 0.4 * d;
  const e = 0.32 * d;
  const centres: Vec3[] = [];
  /** A line of groups, alternately forward and back (echelons), at most `LINE_RANK_GROUPS` abreast and never wider than Q1b. */
  const line = (spacing: number, heights: (g: number) => number, stagger: number): void => {
    let perRank = Math.min(G, LINE_RANK_GROUPS);
    if (rangeNom !== undefined && LINE_FORMATIONS.has(formation)) {
      const maxWidth = FRONTAGE_RANGES * rangeNom - 2 * ring;
      perRank = Math.max(1, Math.min(perRank, Math.floor(maxWidth / spacing) + 1));
    }
    for (let g = 0; g < G; g++) {
      const rank = Math.floor(g / perRank);
      const j = g % perRank;
      const x = spreadIndex(j) * spacing + (rank % 2 === 1 ? spacing / 2 : 0);
      const z = (j % 2 === 1 ? -1 : 1) * stagger * e - rank * 1.7 * e;
      centres.push(v3(x, heights(g) * h, z));
    }
  };
  /** Two staggered ranks: the even groups forward, the odd ones behind and between them. */
  const ranks = (spacing: number, depth: number, curve: number): void => {
    const front = Math.ceil(G / 2);
    const half = Math.max(1, (front - 1) / 2);
    for (let g = 0; g < G; g++) {
      const back = g % 2 === 1;
      const j = Math.floor(g / 2);
      const x = (spreadIndex(j) + (back ? (j % 2 === 0 ? 0.5 : -0.5) : 0)) * spacing;
      const f = Math.min(1, Math.abs(x) / (half * spacing));
      centres.push(v3(x, heightPattern(g) * h, (back ? -depth : 0) + curve * f * f));
    }
  };
  switch (formation) {
    case 'line_abreast':
      line(0.72 * d, (g) => 1.9 * heightPattern(g), 0.6);
      break;
    case 'fighter_screen':
      line(0.7 * d, (g) => 1.8 * heightPattern(g), 0.55);
      break;
    case 'layered_line':
      // Three height layers, the groups closer laterally (the layers keep them apart).
      line(0.62 * d, (g) => [0, 1.9, -1.9][g % 3] + 0.25 * heightPattern(g + 3), 0.5);
      break;
    case 'static':
      line(Math.max(0.85 * d, 6 / SLOT_COMPRESSION), (g) => (g === 0 ? 0 : g % 2 ? 0.55 : -0.55) + 0.9 * heightPattern(g + 5), 0.4);
      for (const c of centres) c.z -= 0.012 * c.x * c.x;
      break;
    case 'broadside_line':
      // A column along the heading, zig-zagging side to side: the doctrine facing turns it 90° once locked, into a
      // line of battle with the escorts on the enemy (+x) side.
      for (let g = 0; g < G; g++) centres.push(v3((g % 2 ? 0.35 : -0.35) * d * (g > 0 ? 1 : 0), heightPattern(g) * 0.8 * h, -(g - (G - 1) / 2) * 0.62 * d));
      break;
    case 'defensive_screen':
      // Two staggered ranks on a shallow concave arc (flanks forward), groups at staggered heights.
      ranks(0.78 * d, 1.2 * e, 1.0 * e);
      break;
    case 'strike_wedge':
    case 'stacked_wedge': {
      // A 3D arrowhead: the apex group leads; each rank behind it holds up to three groups (left, right, and above
      // or below), stepping out and back; the stacked wedge spreads every rank over three heights.
      let g = 1;
      centres.push(v3(0, 0, 0));
      for (let r = 1; g < G; r++) {
        const slotsInRank = [
          v3(-0.5 * r * d, (formation === 'stacked_wedge' ? -1.2 : -0.6) * h, -r * 0.42 * d),
          v3(0.5 * r * d, (formation === 'stacked_wedge' ? 1.2 : 0.55) * h, -r * 0.42 * d),
          v3((r % 2 ? 0.18 : -0.18) * d, (r % 2 ? 1.25 : -1.25) * h, -r * 0.5 * d),
        ];
        for (const p of slotsInRank) {
          if (g >= G) break;
          centres.push(p);
          g++;
        }
      }
      break;
    }
    case 'capital_column':
      // A deep column, zig-zagging and stepping in height.
      for (let g = 0; g < G; g++) centres.push(v3((g % 2 ? 0.38 : -0.38) * d * (g > 0 ? 1 : 0), (g % 2 ? 0.5 : -0.5) * h * (g > 0 ? 1 : 0), -g * 0.62 * d));
      break;
    case 'box': {
      // Groups on a 3D grid round the centre.
      const n = Math.max(1, Math.ceil(Math.cbrt(G)));
      const layers = Math.max(1, Math.ceil(G / (n * n)));
      for (let g = 0; g < G; g++) {
        const ix = g % n;
        const iy = Math.floor(g / n) % n;
        const iz = Math.floor(g / (n * n));
        centres.push(v3((ix - (n - 1) / 2) * 0.8 * d, (iy - (n - 1) / 2) * 0.75 * d, -(iz - (layers - 1) / 2) * 0.8 * d));
      }
      break;
    }
    case 'swarm_descent': {
      // Short descending columns of three groups (each lower and further back), staggered left and right.
      const cols = Math.ceil(G / 3);
      for (let g = 0; g < G; g++) {
        const col = Math.floor(g / 3);
        const kk = g % 3;
        const x = (cols > 1 ? spreadIndex(col) * 0.95 * d : 0) + (kk === 1 ? 0.32 : kk === 2 ? -0.32 : 0) * d;
        centres.push(v3(x, (1 - kk) * 1.05 * h, -kk * 0.5 * d - col * 0.22 * d));
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
        centres.push(v3((c - (cols - 1) / 2) * 1.1 * d + (golden(g + 1) - 0.5) * 0.4 * d, heightPattern(g + 1) * 1.3 * h, -(r - (rows - 1) / 2) * 0.95 * d + (golden(g + 7) - 0.5) * 0.4 * d));
      }
      break;
    }
  }
  groups.forEach((g, gi) => {
    const c = centres[gi];
    const r = hullRng(seed, `group:${g.leaders[0].id}`);
    const s = (): number => r.next() * 2 - 1;
    g.centre = v3(c.x + s() * 0.08 * d, c.y + s() * 0.3 * h, c.z + s() * 0.35 * e);
  });
}

/** Unit vector at azimuth θ (from +z toward +x) and elevation φ. */
const dir = (theta: number, phi: number): Vec3 => v3(Math.sin(theta) * Math.cos(phi), Math.sin(phi), Math.cos(theta) * Math.cos(phi));
const scaleV = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);

/**
 * One group (nominal, fleet-local): its capital(s) at the centre; cruisers on a shell round it (spread over the
 * forward 300° from the group's own phase, mirrored as the group draws, alternately above and below; a Reaper
 * capital's destroyers beside, above, below and behind it — the capital leads);
 * frigates on a cap ahead; carriers behind and above; craft ahead of the screen. A broadside line keeps its escorts
 * on its +x (enemy) side. Every hull takes its jitter.
 */
function placeGroup(g: Group, formation: FormationType, jit: Map<string, Jitter>, out: Map<string, Vec3>): void {
  const c = g.centre;
  const ring = g.ring;
  const broadside = formation === 'broadside_line';
  const reaper = g.leaders[0].role === 'reaper_capital';
  // A broadside line keeps every escort on its +x side; any other group may mirror its pattern.
  const mirror = broadside ? 1 : g.mirror;
  const put = (s: SlotShip, p: Vec3): void => {
    const j = jit.get(s.id)!;
    out.set(s.id, v3(c.x + mirror * p.x + j.lateral * ring * 0.6, c.y + p.y + j.vertical * ring * 0.6, c.z + p.z + j.depth * ring * 0.6));
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
    const reach = (SCREEN_AHEAD + ring - ESCORT_RING) * j.spacing + (j.u - 0.5) * 0.8 * ring;
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
    if (isCapitalTier(s.role) || !slots.has(s.id)) continue;
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
function breakRows(ships: SlotShip[], slots: Map<string, Vec3>, jit: Map<string, Jitter>): void {
  const live = ships.filter((s) => slots.has(s.id) && s.role !== 'fighter');
  if (live.length < 4) return;
  const pts = live.map((s) => slots.get(s.id)!);
  const frontage = frontageOf(pts);
  // The frontage tolerance where it is attainable. In a dense fleet — 2 % of a wide frontage close to its own hull
  // spacing, where near-collinear quadruples follow from density alone — rows are judged at a third of the spacing,
  // among neighbours (a row is a chain of adjacent hulls).
  const spacing = medianNeighbour(pts);
  const frontTol = ROW_TOLERANCE_FRONTAGE * frontage;
  const dense = frontTol > ROW_ATTAINABLE * spacing || live.length > ROW_DENSE_HULLS;
  const tol = dense ? ROW_DENSE_SPACING * spacing : frontTol;
  const local = dense || live.length > ROW_CHECK_FULL;
  const near = dense ? ROW_DENSE_REACH * spacing : live.length > ROW_CHECK_FULL ? frontage / 3 : Infinity;
  const neighbours = (i: number): number[] => {
    const out: number[] = [];
    for (let j = 0; j < pts.length; j++) if (Math.abs(pts[j].x - pts[i].x) <= near && Math.abs(pts[j].z - pts[i].z) <= near) out.push(j);
    return out;
  };
  const clear = (i: number, p: Vec3): boolean => {
    for (let j = 0; j < live.length; j++) {
      if (j === i) continue;
      const q = pts[j];
      if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < minSeparationKm(live[i], live[j]) - 1e-9) return false;
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
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < live.length; i++) {
      if (!onRow(i)) continue;
      const sign = jit.get(live[i].id)!.u < 0.5 ? 1 : -1;
      const p = pts[i];
      const base = v3(p.x, p.y, p.z);
      let done = false;
      for (let step = 1; step <= 6 && !done; step++) {
        for (const s of [sign, -sign]) {
          p.x = base.x;
          p.y = base.y + s * 0.7 * tol * step;
          p.z = base.z + (step % 2 ? s : -s) * 0.45 * tol * step;
          if (clear(i, p) && !onRow(i)) {
            done = true;
            changed = true;
            break;
          }
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
