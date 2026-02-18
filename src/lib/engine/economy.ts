/**
 * Economy tick — port of engine/economy.py
 */

import { VILLAGER_TASK_RATES, VILLAGER_IDLE_RATES, GOLD_TRICKLE } from "@/lib/config";
import { GameState, PlayerState, ProductionItem, addLog, totalVillagers } from "@/lib/engine/state";

export function economyTick(gs: GameState): void {
  for (const pid of ["A", "B"] as const) {
    applyIncome(gs.players[pid], gs);
    decrementQueue(gs.players[pid], gs);
  }
}

function applyIncome(player: PlayerState, gs: GameState): void {
  const totalVils = totalVillagers(player);

  // Scale down villager tasks if villagers died since last update
  let tasks = { ...(player.villagerTasks as Record<string, number>) };
  let totalTasked = Object.values(tasks).reduce((s, n) => s + n, 0);

  if (totalTasked > totalVils && totalVils > 0) {
    const scale = totalVils / totalTasked;
    tasks = Object.fromEntries(
      Object.entries(tasks).map(([res, n]) => [res, Math.floor(n * scale)]),
    );
    totalTasked = Object.values(tasks).reduce((s, n) => s + n, 0);
  } else if (totalVils === 0) {
    tasks = {};
    totalTasked = 0;
  }

  const idleVillagers = Math.max(0, totalVils - totalTasked);

  let foodGain = (tasks["food"] ?? 0) * VILLAGER_TASK_RATES.food;
  let woodGain = (tasks["wood"] ?? 0) * VILLAGER_TASK_RATES.wood;
  let goldGain = (tasks["gold"] ?? 0) * VILLAGER_TASK_RATES.gold;

  foodGain += idleVillagers * VILLAGER_IDLE_RATES.food;
  woodGain += idleVillagers * VILLAGER_IDLE_RATES.wood;
  goldGain += GOLD_TRICKLE;

  player.resources.food += foodGain;
  player.resources.wood += woodGain;
  player.resources.gold += goldGain;

  addLog(
    gs,
    `P${player.playerId} income: +${foodGain}f +${woodGain}w +${goldGain}g ` +
      `(total: ${player.resources.food}f ${player.resources.wood}w ${player.resources.gold}g)`,
  );
}

function decrementQueue(player: PlayerState, gs: GameState): void {
  const stillTraining: ProductionItem[] = [];

  for (const item of player.productionQueue) {
    item.turnsLeft -= 1;
    if (item.turnsLeft <= 0) {
      const zoneUnits = player.units[player.baseZone];
      zoneUnits[item.unitType] = (zoneUnits[item.unitType] ?? 0) + 1;
      addLog(gs, `P${player.playerId} trained ${item.unitType} → ${player.baseZone}`);
    } else {
      stillTraining.push(item);
    }
  }

  player.productionQueue = stillTraining;
}
