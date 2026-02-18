/**
 * Validate and sanitise raw LLM action dicts — port of engine/validator.py
 */

import {
  UNITS,
  BUILDINGS,
  ZONES,
  ADJACENCY,
  UNIT_AGE_REQUIREMENT,
  BUILDING_AGE_REQUIREMENT,
  AGE_ADVANCE_COSTS,
  UPGRADES,
  Zone,
} from "@/lib/config";
import { PlayerState, anyBuilding, unitCount, totalVillagers } from "@/lib/engine/state";

export interface TrainItem   { unit: string; count: number }
export interface BuildItem   { building: string; zone?: Zone }
export interface MoveItem    { unit: string; count: number; from: Zone; to: Zone }
export interface ResearchItem { upgrade: string }

export interface CleanAction {
  train: TrainItem[];
  build: BuildItem[];
  move: MoveItem[];
  attack: never[];
  advance_age: boolean;
  task_villagers: Partial<Record<"food" | "wood" | "gold", number>>;
  research: ResearchItem[];
}

const EMPTY_ACTION: CleanAction = {
  train: [],
  build: [],
  move: [],
  attack: [],
  advance_age: false,
  task_villagers: {},
  research: [],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateAction(raw: any, player: PlayerState): CleanAction {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_ACTION };
  }

  return {
    train:          validateTrain(raw.train, player),
    build:          validateBuild(raw.build, player),
    move:           validateMove(raw.move, player),
    attack:         [],
    advance_age:    validateAdvanceAge(raw.advance_age, player),
    task_villagers: validateTaskVillagers(raw.task_villagers, player),
    research:       validateResearch(raw.research, player),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateTrain(items: any, player: PlayerState): TrainItem[] {
  if (!Array.isArray(items)) return [];
  const valid: TrainItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const unit: string = item.unit;
    const count: number = typeof item.count === "number" ? item.count : 1;

    if (!UNITS[unit]) continue;
    if (typeof count !== "number" || count < 1) continue;
    if (player.age < (UNIT_AGE_REQUIREMENT[unit] ?? 1)) continue;

    if ((unit === "Militia" || unit === "Knight") && !anyBuilding(player, "Barracks")) continue;
    if (unit === "Archer" && !anyBuilding(player, "Range")) continue;

    const cost = UNITS[unit].cost;
    const maxAffordable = maxCanAfford(player.resources, cost, count);
    if (maxAffordable < 1) continue;

    valid.push({ unit, count: maxAffordable });
  }
  return valid;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateBuild(items: any, player: PlayerState): BuildItem[] {
  if (!Array.isArray(items)) return [];
  const valid: BuildItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const building: string = item.building;
    if (!BUILDINGS[building]) continue;
    if (player.age < (BUILDING_AGE_REQUIREMENT[building] ?? 1)) continue;

    const cost = BUILDINGS[building].cost;
    if (!canAfford(player.resources, cost)) continue;

    // Zone is optional — resolver defaults to baseZone
    const zone: Zone | undefined = item.zone;
    valid.push({ building, zone });
  }
  return valid;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateMove(items: any, player: PlayerState): MoveItem[] {
  if (!Array.isArray(items)) return [];
  const valid: MoveItem[] = [];
  const zoneSet = new Set<string>(ZONES);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const unit: string = item.unit;
    const count: number = item.count;
    const fromZone: Zone = item.from;
    const toZone: Zone = item.to;

    if (!UNITS[unit]) continue;
    if (!zoneSet.has(fromZone) || !zoneSet.has(toZone)) continue;
    if (!(ADJACENCY[fromZone]?.has(toZone))) continue;
    if (typeof count !== "number" || count < 1) continue;

    const available = unitCount(player, fromZone, unit);
    if (available < 1) continue;

    valid.push({ unit, count: Math.min(count, available), from: fromZone, to: toZone });
  }
  return valid;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateAdvanceAge(flag: any, player: PlayerState): boolean {
  if (!flag) return false;
  if (player.age >= 4) return false;
  const nextAge = player.age + 1;
  const cost = AGE_ADVANCE_COSTS[nextAge] ?? {};
  return canAfford(player.resources, cost);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateTaskVillagers(tasks: any, player: PlayerState): Partial<Record<"food" | "wood" | "gold", number>> {
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) return {};
  const validResources = new Set(["food", "wood", "gold"]);
  const cleaned: Record<string, number> = {};

  for (const [res, cnt] of Object.entries(tasks)) {
    if (!validResources.has(res)) continue;
    if (typeof cnt !== "number" || cnt < 0) continue;
    cleaned[res] = cnt;
  }

  const totalVils = totalVillagers(player);
  let totalTasked = Object.values(cleaned).reduce((s, n) => s + n, 0);

  if (totalTasked > totalVils && totalTasked > 0) {
    const scale = totalVils / totalTasked;
    for (const res of Object.keys(cleaned)) {
      cleaned[res] = Math.floor(cleaned[res] * scale);
    }
    totalTasked = Object.values(cleaned).reduce((s, n) => s + n, 0);
  }

  // Remove zeros
  return Object.fromEntries(Object.entries(cleaned).filter(([, n]) => n > 0)) as Partial<Record<"food" | "wood" | "gold", number>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateResearch(items: any, player: PlayerState): ResearchItem[] {
  if (!Array.isArray(items)) return [];
  const valid: ResearchItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const upgradeName: string = item.upgrade;
    if (!UPGRADES[upgradeName]) continue;
    if (player.upgrades.includes(upgradeName)) continue;

    const upg = UPGRADES[upgradeName];
    if (player.age < upg.age) continue;
    if (upg.requires_building && !anyBuilding(player, upg.requires_building)) continue;
    if (upg.requires_upgrade && !player.upgrades.includes(upg.requires_upgrade)) continue;
    if (!canAfford(player.resources, upg.cost)) continue;

    valid.push({ upgrade: upgradeName });
  }
  return valid;
}

// Deduct resource costs for validated build actions only.
// Train costs are deducted in resolver's processTrain.
export function deductCosts(action: CleanAction, player: PlayerState): void {
  for (const item of action.build) {
    const cost = BUILDINGS[item.building]?.cost ?? {};
    for (const [res, amount] of Object.entries(cost)) {
      (player.resources as Record<string, number>)[res] =
        ((player.resources as Record<string, number>)[res] ?? 0) - amount;
      player.resourcesBanked += amount;
    }
  }
}

// Deduct age advance cost
export function deductAdvanceAge(player: PlayerState): void {
  const nextAge = player.age + 1;
  const cost = AGE_ADVANCE_COSTS[nextAge] ?? {};
  for (const [res, amount] of Object.entries(cost)) {
    const a = amount ?? 0;
    player.resources[res] = (player.resources[res] ?? 0) - a;
    player.resourcesBanked += a;
  }
}

// Helpers
function canAfford(resources: Record<string, number>, cost: Partial<Record<string, number>>): boolean {
  return Object.entries(cost).every(([r, amount]) => (resources[r] ?? 0) >= (amount ?? 0));
}

function maxCanAfford(resources: Record<string, number>, cost: Record<string, number>, requested: number): number {
  let maxCount = requested;
  for (const [res, amount] of Object.entries(cost)) {
    if (amount > 0) {
      maxCount = Math.min(maxCount, Math.floor((resources[res] ?? 0) / amount));
    }
  }
  return Math.max(0, maxCount);
}
