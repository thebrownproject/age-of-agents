/**
 * Game constants — port of config.py
 */

export const TURN_LIMIT = 50;

export const ZONES = ["Base_A", "Top_A", "Mid_A", "Bot_A", "Top_B", "Mid_B", "Bot_B", "Base_B"] as const;
export type Zone = typeof ZONES[number];

export const ADJACENCY: Record<Zone, Set<Zone>> = {
  Base_A: new Set(["Top_A", "Mid_A", "Bot_A"]),
  Top_A:  new Set(["Base_A", "Mid_A", "Top_B"]),
  Mid_A:  new Set(["Base_A", "Top_A", "Bot_A", "Mid_B"]),
  Bot_A:  new Set(["Base_A", "Mid_A", "Bot_B"]),
  Top_B:  new Set(["Top_A", "Mid_B", "Base_B"]),
  Mid_B:  new Set(["Mid_A", "Top_B", "Bot_B", "Base_B"]),
  Bot_B:  new Set(["Bot_A", "Mid_B", "Base_B"]),
  Base_B: new Set(["Top_B", "Mid_B", "Bot_B"]),
};

export const STARTING_RESOURCES = { food: 200, wood: 150, gold: 50 };

export const GOLD_TRICKLE = 5;

export const VILLAGER_TASK_RATES = { food: 15, wood: 12, gold: 8 };
export const VILLAGER_IDLE_RATES = { food: 3, wood: 2 };

export const TOWN_CENTER_HP = 200;

export const AGE_NAMES: Record<number, string> = { 1: "Dark", 2: "Feudal", 3: "Castle", 4: "Imperial" };

export const AGE_ADVANCE_COSTS: Record<number, Partial<Record<string, number>>> = {
  2: { food: 400, wood: 200 },
  3: { food: 500, wood: 300, gold: 200 },
  4: { wood: 800, gold: 500 },
};

export const UNIT_AGE_REQUIREMENT: Record<string, number> = {
  Villager: 1,
  Militia:  2,
  Archer:   2,
  Knight:   3,
  Catapult: 3,
};

export const BUILDING_AGE_REQUIREMENT: Record<string, number> = {
  Barracks:   2,
  Range:      2,
  Wall:       3,
  Tower:      3,
  Blacksmith: 3,
};

export interface UnitDef {
  cost: Record<string, number>;
  hp: number;
  atk: number;
  counter: string | null;
  train_turns: number;
}

export const UNITS: Record<string, UnitDef> = {
  Villager: { cost: { food: 50, wood: 0, gold: 0 }, hp: 5,  atk: 1,  counter: null,       train_turns: 1 },
  Militia:  { cost: { food: 60, wood: 0, gold: 0 }, hp: 8,  atk: 3,  counter: null,       train_turns: 1 },
  Archer:   { cost: { food: 0, wood: 60, gold: 0 },  hp: 6,  atk: 4,  counter: "Infantry", train_turns: 2 },
  Knight:   { cost: { food: 0, wood: 0, gold: 80 },  hp: 15, atk: 6,  counter: "Archer",   train_turns: 3 },
  Catapult: { cost: { food: 0, wood: 50, gold: 100 }, hp: 10, atk: 12, counter: "Building", train_turns: 4 },
};

export const INFANTRY_TYPES = new Set(["Villager", "Militia"]);

export const MILITARY_UNIT_TYPES = new Set(["Militia", "Archer", "Knight", "Catapult"]);

export interface BuildingDef {
  cost: Record<string, number>;
  hp: number;
  enables: string[];
  age: number;
  damage_per_turn?: number;
}

export const BUILDINGS: Record<string, BuildingDef> = {
  Barracks:   { cost: { food: 0, wood: 100, gold: 0 },  hp: 50, enables: ["Militia", "Knight"], age: 2 },
  Range:      { cost: { food: 0, wood: 80,  gold: 0 },  hp: 40, enables: ["Archer"],            age: 2 },
  Wall:       { cost: { food: 0, wood: 50,  gold: 0 },  hp: 100, enables: [],                   age: 3 },
  Tower:      { cost: { food: 0, wood: 80,  gold: 50 }, hp: 60, enables: [],                    age: 3, damage_per_turn: 8 },
  Blacksmith: { cost: { food: 0, wood: 150, gold: 100 }, hp: 0,  enables: [],                   age: 3 },
};

export interface UpgradeDef {
  cost: Record<string, number>;
  attack_bonus: number;
  armor_bonus: number;
  age: number;
  requires_building: string | null;
  requires_upgrade: string | null;
}

export const UPGRADES: Record<string, UpgradeDef> = {
  attack_1: { cost: { food: 200, wood: 0,   gold: 100 }, attack_bonus: 2, armor_bonus: 0, age: 3, requires_building: "Blacksmith", requires_upgrade: null       },
  armor_1:  { cost: { food: 0,   wood: 200, gold: 100 }, attack_bonus: 0, armor_bonus: 3, age: 3, requires_building: "Blacksmith", requires_upgrade: null       },
  attack_2: { cost: { food: 0,   wood: 0,   gold: 400 }, attack_bonus: 3, armor_bonus: 0, age: 4, requires_building: "Blacksmith", requires_upgrade: "attack_1" },
  armor_2:  { cost: { food: 0,   wood: 300, gold: 200 }, attack_bonus: 0, armor_bonus: 5, age: 4, requires_building: "Blacksmith", requires_upgrade: "armor_1"  },
};

export const UNIT_VALUE: Record<string, number> = {
  Villager: 25,
  Militia:  30,
  Archer:   30,
  Knight:   40,
  Catapult: 75,
};

export const BUILDING_VALUE = 10;

export const COUNTER_BONUS = 1.5;
