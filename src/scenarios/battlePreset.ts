import { FACTIONS } from '@/data/factions';
import { SHIP_CLASSES } from '@/data/ships';
import { UNIQUE_CLASS_IDS } from '@/data/types';
import { CUSTOM_DEFAULT_DURATION, type CustomBattleInput, type CustomFaction, type CustomFleetInput } from '@/scenarios';
import { FORMATION_LABELS, type Environment, type FormationType } from '@/simulation/types';

/** Shareable, strictly validated ChatGPT -> Custom Battle preset. Everything stays local. */
export const BATTLE_PRESET_FORMAT = 'reaperwar-battle-v1';

const ENVIRONMENTS: readonly Environment[] = [
  'earth_orbit', 'palaven_orbit', 'thessia_orbit', 'rannoch_orbit',
  'surkesh_orbit', 'citadel', 'deep_space', 'relay',
];
const FACTION_IDS = Object.keys(FACTIONS) as CustomFaction[];
const UNIQUE_IDS = new Set(UNIQUE_CLASS_IDS);
const MAX_FLEETS_PER_SIDE = 32;
type JsonObject = Record<string, unknown>;

function object(value: unknown, location: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(location + ' must be an object.');
  }
  return value as JsonObject;
}

function onlyKeys(value: JsonObject, keys: readonly string[], location: string): void {
  const extra = Object.keys(value).find((key) => !keys.includes(key));
  if (extra) throw new Error(location + ' contains unsupported field "' + extra + '".');
}

function number(value: unknown, location: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max ||
    (integer && !Number.isInteger(value))) {
    throw new Error(location + ' must be ' + (integer ? 'an integer' : 'a number') +
      ' from ' + min + ' to ' + max + '.');
  }
  return value;
}

function fleet(value: unknown, location: string, namedShips: Map<string, number>): CustomFleetInput {
  const data = object(value, location);
  onlyKeys(data, ['faction', 'name', 'formation', 'arrivalTime', 'ships'], location);
  if (!FACTION_IDS.includes(data.faction as CustomFaction)) {
    throw new Error(location + '.faction is not a supported faction.');
  }
  const faction = data.faction as CustomFaction;
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 120) {
    throw new Error(location + '.name must be 1-120 characters.');
  }
  const formation = data.formation ?? 'line_abreast';
  if (typeof formation !== 'string' || !(formation in FORMATION_LABELS)) {
    throw new Error(location + '.formation is not recognised.');
  }
  const arrivalTime = number(data.arrivalTime ?? 0, location + '.arrivalTime', 0, 86400, true);
  const ships = object(data.ships, location + '.ships');
  const counts: Record<string, number> = {};
  for (const [id, raw] of Object.entries(ships)) {
    const cls = SHIP_CLASSES[id];
    if (!cls) throw new Error(location + '.ships contains unknown ship class "' + id + '".');
    if (cls.faction !== faction) {
      throw new Error(location + '.ships.' + id + ' belongs to ' + cls.faction + ', not ' + faction + '.');
    }
    if (cls.role === 'fighter') {
      throw new Error(location + '.ships.' + id + ' is a fighter; fighters launch from carriers.');
    }
    const amount = number(raw, location + '.ships.' + id, 0, 100000, true);
    if (UNIQUE_IDS.has(id)) {
      namedShips.set(id, (namedShips.get(id) ?? 0) + amount);
      if (namedShips.get(id)! > 1) {
        throw new Error('Unique flagship "' + id + '" may appear only once across both sides.');
      }
    }
    if (amount > 0) counts[id] = amount;
  }
  if (!Object.keys(counts).length) throw new Error(location + ' needs at least one ship.');
  return { faction, name: data.name.trim(), formation: formation as FormationType, arrivalTime, counts };
}

function readSide(value: unknown, location: string, unique: Map<string, number>): CustomFleetInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FLEETS_PER_SIDE) {
    throw new Error(location + ' must be an array of 1-' + MAX_FLEETS_PER_SIDE + ' fleets.');
  }
  return value.map((f, i) => fleet(f, location + '[' + i + ']', unique));
}

function unwrapJson(text: string): string {
  const trimmed = text.trim();
  const tick = String.fromCharCode(96).repeat(3);
  if (!trimmed.startsWith(tick)) return trimmed;
  const lines = trimmed.split(/\r?\n/);
  if (![tick, tick + 'json', tick + 'JSON'].includes(lines[0].trim()) || lines[lines.length - 1] !== tick) {
    throw new Error('Copy only the JSON code block, with or without its code fences.');
  }
  return lines.slice(1, -1).join('\n');
}

/** Reject unsupported fields and mistaken ship IDs instead of silently discarding them. */
export function parseBattlePreset(text: string, validRulesIds: readonly string[]): CustomBattleInput {
  let raw: unknown;
  try {
    raw = JSON.parse(unwrapJson(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Invalid JSON. Copy the entire preset code block.');
    throw error;
  }
  const data = object(raw, 'Preset');
  onlyKeys(data, [
    'format', 'rulesId', 'environment', 'seed', 'startingDistanceKm',
    'maxDuration', 'sideA', 'sideB',
  ], 'Preset');
  if (data.format !== BATTLE_PRESET_FORMAT) {
    throw new Error('Preset.format must be "' + BATTLE_PRESET_FORMAT + '".');
  }
  if (typeof data.rulesId !== 'string' || !validRulesIds.includes(data.rulesId)) {
    throw new Error('Unknown timeline ID. Select a valid installed timeline.');
  }
  if (!ENVIRONMENTS.includes(data.environment as Environment)) {
    throw new Error('Unknown battlefield. Use earth_orbit, deep_space, citadel, etc.');
  }
  const unique = new Map<string, number>();
  const sideA = readSide(data.sideA, 'sideA', unique);
  const sideB = readSide(data.sideB, 'sideB', unique);
  return {
    seed: number(data.seed ?? 42, 'seed', 0, 2147483647, true),
    rulesId: data.rulesId,
    environment: data.environment as Environment,
    startingDistanceKm: number(data.startingDistanceKm ?? 122, 'startingDistanceKm', 30, 260),
    maxDuration: number(data.maxDuration ?? CUSTOM_DEFAULT_DURATION, 'maxDuration', 60, 36000, true),
    sideA: sideA[0],
    sideB: sideB[0],
    extraA: sideA.slice(1),
    extraB: sideB.slice(1),
    reinforcementTime: 0,
    reinforcementFaction: sideB[0].faction,
    reinforcementCounts: {},
  };
}

/** Export all visible custom fleets (including any side-B reinforcement wave). */
export function exportBattlePreset(input: CustomBattleInput): string {
  const convert = (f: CustomFleetInput) => ({
    faction: f.faction,
    name: f.name,
    formation: f.formation,
    arrivalTime: f.arrivalTime ?? 0,
    ships: Object.fromEntries(Object.entries(f.counts)
      .filter(([id, n]) => SHIP_CLASSES[id]?.faction === f.faction && n > 0)),
  });
  const sideB = [input.sideB, ...(input.extraB ?? [])];
  if (input.reinforcementTime && input.reinforcementTime > 0 &&
    Object.values(input.reinforcementCounts ?? {}).some((n) => n > 0)) {
    sideB.push({
      faction: input.reinforcementFaction ?? input.sideB.faction,
      name: 'Side B reinforcements',
      formation: input.sideB.formation,
      arrivalTime: input.reinforcementTime,
      counts: input.reinforcementCounts ?? {},
    });
  }
  return JSON.stringify({
    format: BATTLE_PRESET_FORMAT,
    rulesId: input.rulesId,
    environment: input.environment,
    seed: input.seed,
    startingDistanceKm: input.startingDistanceKm,
    maxDuration: input.maxDuration ?? CUSTOM_DEFAULT_DURATION,
    sideA: [input.sideA, ...(input.extraA ?? [])].map(convert),
    sideB: sideB.map(convert),
  }, null, 2);
}
