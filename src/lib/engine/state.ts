/**
 * GameState, PlayerState, ProductionItem — port of engine/state.py
 */

import { ZONES, STARTING_RESOURCES, TOWN_CENTER_HP, UNIT_VALUE, BUILDING_VALUE, Zone } from "@/lib/config";

export interface Resources {
  food: number;
  wood: number;
  gold: number;
  [key: string]: number;
}

export interface ProductionItem {
  unitType: string;
  turnsLeft: number;
}

export interface PlayerState {
  playerId: "A" | "B";
  baseZone: Zone;
  resources: Resources;
  units: Record<Zone, Record<string, number>>;
  buildings: Record<Zone, string[]>;
  buildingHp: Record<Zone, Record<string, number>>;
  townCenterHp: number;
  productionQueue: ProductionItem[];
  resourcesBanked: number;
  age: 1 | 2 | 3 | 4;
  villagerTasks: Partial<Resources>;
  upgrades: string[];
  attackBonus: number;
  armorBonus: number;
  unitsKilled: number;
  unitsLost: number;
}

export interface GameState {
  turn: number;
  players: { A: PlayerState; B: PlayerState };
  log: string[];
  winner: "A" | "B" | "draw" | null;
}

function emptyZoneRecord<T>(defaultFn: () => T): Record<Zone, T> {
  const rec = {} as Record<Zone, T>;
  for (const z of ZONES) rec[z] = defaultFn();
  return rec;
}

function newPlayerState(playerId: "A" | "B"): PlayerState {
  const baseZone: Zone = playerId === "A" ? "Base_A" : "Base_B";
  const units = emptyZoneRecord<Record<string, number>>(() => ({}));
  units[baseZone] = { Villager: 3 };

  return {
    playerId,
    baseZone,
    resources: { ...STARTING_RESOURCES },
    units,
    buildings: emptyZoneRecord(() => []),
    buildingHp: emptyZoneRecord(() => ({})),
    townCenterHp: TOWN_CENTER_HP,
    productionQueue: [],
    resourcesBanked: 0,
    age: 1,
    villagerTasks: {},
    upgrades: [],
    attackBonus: 0,
    armorBonus: 0,
    unitsKilled: 0,
    unitsLost: 0,
  };
}

export function newGame(): GameState {
  return {
    turn: 1,
    players: {
      A: newPlayerState("A"),
      B: newPlayerState("B"),
    },
    log: [],
    winner: null,
  };
}

export function addLog(gs: GameState, msg: string): void {
  gs.log.push(`[T${gs.turn}] ${msg}`);
}

export function recentLog(gs: GameState, n = 5): string[] {
  return gs.log.slice(-n);
}

export function totalVillagers(player: PlayerState): number {
  return Object.values(player.units).reduce(
    (sum, zoneUnits) => sum + (zoneUnits["Villager"] ?? 0),
    0,
  );
}

export function anyBuilding(player: PlayerState, building: string): boolean {
  return Object.values(player.buildings).some((list) => list.includes(building));
}

export function unitCount(player: PlayerState, zone: Zone, unitType: string): number {
  return player.units[zone]?.[unitType] ?? 0;
}

export function score(player: PlayerState): number {
  const unitScore = Object.values(player.units).reduce((sum, zoneUnits) => {
    return sum + Object.entries(zoneUnits).reduce(
      (s, [ut, count]) => s + (UNIT_VALUE[ut] ?? 0) * count,
      0,
    );
  }, 0);
  const buildingScore = Object.values(player.buildings).reduce(
    (sum, list) => sum + list.length * BUILDING_VALUE,
    0,
  );
  return player.resourcesBanked + unitScore * 2 + buildingScore;
}
