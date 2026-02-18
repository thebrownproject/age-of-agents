/**
 * Orchestrates one full turn — port of engine/resolver.py
 *
 * Key difference: engine functions use structuredClone at top,
 * returning new state (no in-place mutation of caller's reference).
 * Resolver mutates its local clone and returns it.
 *
 * Fix: buildings are placed in the zone specified by the action (defaulting to baseZone).
 */

import { ZONES, UNITS, BUILDINGS, AGE_ADVANCE_COSTS, UPGRADES, AGE_NAMES, Zone } from "@/lib/config";
import { GameState, PlayerState, addLog, score } from "@/lib/engine/state";
import { economyTick } from "@/lib/engine/economy";
import { resolveCombat } from "@/lib/engine/combat";
import { validateAction, deductCosts, CleanAction } from "@/lib/engine/validator";
import { buildObservation } from "@/lib/prompts/builder";

export interface Agent {
  getAction(observation: object): Promise<object>;
}

export async function runTurn(
  gs: GameState,
  agentA: Agent,
  agentB: Agent,
): Promise<GameState> {
  // Work on a deep clone so callers can compare old vs new
  const state = structuredClone(gs);

  // 1. Economy tick
  economyTick(state);

  // 2. Build observations
  const obsA = buildObservation(state, "A");
  const obsB = buildObservation(state, "B");

  // 3. Parallel API calls — log errors instead of silently swallowing them
  const [rawA, rawB] = await Promise.all([
    agentA.getAction(obsA).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(state, `⚠ PA error: ${msg.slice(0, 120)}`);
      return {};
    }),
    agentB.getAction(obsB).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(state, `⚠ PB error: ${msg.slice(0, 120)}`);
      return {};
    }),
  ]);

  // 4. Validate actions
  const actionA = validateAction(rawA, state.players["A"]);
  const actionB = validateAction(rawB, state.players["B"]);

  addLog(state, `A actions: train=${JSON.stringify(actionA.train)} build=${JSON.stringify(actionA.build)} move=${JSON.stringify(actionA.move)}`);
  addLog(state, `B actions: train=${JSON.stringify(actionB.train)} build=${JSON.stringify(actionB.build)} move=${JSON.stringify(actionB.move)}`);

  // 5a. Advance age
  processAdvanceAge(state, "A", actionA);
  processAdvanceAge(state, "B", actionB);

  // 5b. Task villagers
  processTaskVillagers(state, "A", actionA);
  processTaskVillagers(state, "B", actionB);

  // 5c. Research
  processResearch(state, "A", actionA);
  processResearch(state, "B", actionB);

  // 5d. Builds
  processBuilds(state, "A", actionA);
  processBuilds(state, "B", actionB);

  // 5e. Trains (deducts costs internally)
  processTrains(state, "A", actionA);
  processTrains(state, "B", actionB);

  // 6. Deduct costs (builds only — train costs already done)
  deductCosts(actionA, state.players["A"]);
  deductCosts(actionB, state.players["B"]);

  // 7. Process moves
  processMoves(state, "A", actionA);
  processMoves(state, "B", actionB);

  // 8. Combat for each zone
  for (const zone of ZONES) {
    resolveCombat(state, zone);
  }

  // 9. Victory check
  checkVictory(state);

  state.turn += 1;
  return state;
}

function processAdvanceAge(gs: GameState, pid: "A" | "B", action: CleanAction): void {
  if (!action.advance_age) return;
  const player = gs.players[pid];
  const nextAge = player.age + 1;
  const cost = AGE_ADVANCE_COSTS[nextAge] ?? {};
  if (!canAfford(player, cost)) return;

  for (const [res, amount] of Object.entries(cost)) {
    player.resources[res] -= amount ?? 0;
    player.resourcesBanked += amount ?? 0;
  }
  player.age = nextAge as 1 | 2 | 3 | 4;
  addLog(gs, `P${pid} advanced to Age ${nextAge} (${AGE_NAMES[nextAge]})`);
}

function processTaskVillagers(gs: GameState, pid: "A" | "B", action: CleanAction): void {
  const tasks = action.task_villagers;
  if (!tasks || Object.keys(tasks).length === 0) return;
  gs.players[pid].villagerTasks = { ...tasks };
  addLog(gs, `P${pid} tasked villagers: ${JSON.stringify(tasks)}`);
}

function processResearch(gs: GameState, pid: "A" | "B", action: CleanAction): void {
  const player = gs.players[pid];
  for (const item of action.research) {
    const upgName = item.upgrade;
    if (!UPGRADES[upgName] || player.upgrades.includes(upgName)) continue;
    const upg = UPGRADES[upgName];
    const cost = upg.cost;
    if (!canAfford(player, cost)) continue;

    for (const [res, amount] of Object.entries(cost)) {
      (player.resources as Record<string, number>)[res] -= amount;
      player.resourcesBanked += amount;
    }
    player.upgrades.push(upgName);
    player.attackBonus += upg.attack_bonus;
    player.armorBonus += upg.armor_bonus;
    addLog(gs, `P${pid} researched ${upgName} (+${upg.attack_bonus} atk, +${upg.armor_bonus} armor)`);
  }
}

function processBuilds(gs: GameState, pid: "A" | "B", action: CleanAction): void {
  const player = gs.players[pid];
  for (const item of action.build) {
    const building = item.building;
    const cost = BUILDINGS[building]?.cost ?? {};
    if (!canAfford(player, cost)) continue;

    // FIX: use zone from action if provided, otherwise default to baseZone
    const zone: Zone = (item.zone as Zone) || player.baseZone;

    player.buildings[zone].push(building);

    if (building === "Wall" || building === "Tower") {
      if (!player.buildingHp[zone]) player.buildingHp[zone] = {};
      player.buildingHp[zone][building] =
        (player.buildingHp[zone][building] ?? 0) + (BUILDINGS[building].hp ?? 0);
    }

    addLog(gs, `P${pid} built ${building} in ${zone}`);
  }
}

function processTrains(gs: GameState, pid: "A" | "B", action: CleanAction): void {
  const player = gs.players[pid];
  for (const item of action.train) {
    const { unit, count } = item;
    const turns = UNITS[unit]?.train_turns ?? 1;
    const cost = UNITS[unit]?.cost ?? {};

    let queued = 0;
    for (let i = 0; i < count; i++) {
      if (!canAfford(player, cost)) break;
      for (const [res, amount] of Object.entries(cost)) {
        (player.resources as Record<string, number>)[res] -= amount;
        player.resourcesBanked += amount;
      }
      player.productionQueue.push({ unitType: unit, turnsLeft: turns });
      queued++;
    }
    if (queued > 0) addLog(gs, `P${pid} queued ${queued}×${unit} (${turns} turn(s) each)`);
  }
}

function processMoves(gs: GameState, pid: "A" | "B", action: CleanAction): void {
  const player = gs.players[pid];
  const opponent = gs.players[pid === "A" ? "B" : "A"];

  for (const item of action.move) {
    const { unit, count, from: fromZone, to: toZone } = item;

    // Cannot leave a zone with enemy units present
    const contested = Object.values(opponent.units[fromZone] ?? {}).some((c) => c > 0);
    if (contested) continue;

    const available = player.units[fromZone]?.[unit] ?? 0;
    const actual = Math.min(count, available);
    if (actual < 1) continue;

    player.units[fromZone][unit] = available - actual;
    if (!player.units[toZone]) player.units[toZone] = {};
    player.units[toZone][unit] = (player.units[toZone][unit] ?? 0) + actual;
    addLog(gs, `P${pid} moved ${actual}×${unit}: ${fromZone}→${toZone}`);
  }
}

function checkVictory(gs: GameState): void {
  const tcA = gs.players["A"].townCenterHp;
  const tcB = gs.players["B"].townCenterHp;

  if (tcA <= 0 && tcB <= 0) {
    gs.winner = "draw";
    addLog(gs, "Draw — both Town Centers destroyed!");
    return;
  }
  if (tcB <= 0) {
    gs.winner = "A";
    addLog(gs, "Player A wins — destroyed B's Town Center!");
    return;
  }
  if (tcA <= 0) {
    gs.winner = "B";
    addLog(gs, "Player B wins — destroyed A's Town Center!");
    return;
  }
  if (gs.turn >= 50) {
    const scoreA = score(gs.players["A"]);
    const scoreB = score(gs.players["B"]);
    if (scoreA > scoreB) {
      gs.winner = "A";
      addLog(gs, `Turn limit! A wins by score (${scoreA} vs ${scoreB})`);
    } else if (scoreB > scoreA) {
      gs.winner = "B";
      addLog(gs, `Turn limit! B wins by score (${scoreB} vs ${scoreA})`);
    } else {
      gs.winner = "draw";
      addLog(gs, `Turn limit! Draw (${scoreA} each)`);
    }
  }
}

function canAfford(player: PlayerState, cost: Partial<Record<string, number>>): boolean {
  return Object.entries(cost).every(([r, amount]) => (player.resources[r] ?? 0) >= (amount ?? 0));
}
