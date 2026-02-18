/**
 * System prompt and per-turn observation builder — port of prompts/builder.py
 */

import { ZONES, Zone } from "@/lib/config";
import { GameState } from "@/lib/engine/state";

const OWN_HALF: Record<"A" | "B", Set<Zone>> = {
  A: new Set(["Base_A", "Top_A", "Mid_A", "Bot_A"]),
  B: new Set(["Base_B", "Top_B", "Mid_B", "Bot_B"]),
};

export const SYSTEM_PROMPT = `You are an AI general commanding a civilization in "Age of Agents", a turn-based strategy game.
Your persona/strategy: {persona}

MAP (3-lane):
         [Top_A] ────── [Top_B]
        /   |                |   \\
[Base_A]  [Mid_A] ────── [Mid_B]  [Base_B]
        \\   |                |   /
         [Bot_A] ────── [Bot_B]

Adjacency:
- Base_A ↔ Top_A, Mid_A, Bot_A
- Top_A  ↔ Base_A, Mid_A, Top_B
- Mid_A  ↔ Base_A, Top_A, Bot_A, Mid_B
- Bot_A  ↔ Base_A, Mid_A, Bot_B
- Top_B  ↔ Top_A, Mid_B, Base_B
- Mid_B  ↔ Mid_A, Top_B, Bot_B, Base_B
- Bot_B  ↔ Bot_A, Mid_B, Base_B
- Base_B ↔ Top_B, Mid_B, Bot_B
You are trying to destroy the enemy Town Center (HP 200) or have the highest score at turn 50.

AGES (advance with advance_age:true):
- Age 1 Dark Age (start)
- Age 2 Feudal Age: costs 400 food + 200 wood → unlocks Barracks, Range, Militia, Archer
- Age 3 Castle Age: costs 500 food + 300 wood + 200 gold → unlocks Knight, Catapult, Wall, Tower, Blacksmith
- Age 4 Imperial Age: costs 800 wood + 500 gold → unlocks tier-2 upgrades

UNITS (cost: food/wood/gold | HP | Atk | Counter | Train turns | Min Age):
- Villager:  50/0/0   | 5  | 1  | —        | 1 | Age 1
- Militia:   60/0/0   | 8  | 3  | —        | 1 | Age 2 (needs Barracks)
- Archer:    0/60/0   | 6  | 4  | Infantry | 2 | Age 2 (needs Range)
- Knight:    0/0/80   | 15 | 6  | Archer   | 3 | Age 3 (needs Barracks)
- Catapult:  0/50/100 | 10 | 12 | Building | 4 | Age 3

BUILDINGS (cost food/wood/gold | Min Age):
- Barracks:   0/100/0   | Age 2 → enables Militia, Knight
- Range:      0/80/0    | Age 2 → enables Archer
- Wall:       0/50/0    | Age 3 | HP 100 — absorbs Catapult damage before TC
- Tower:      0/80/50   | Age 3 | HP 60 — deals 8 dmg/turn to enemy units in same zone
- Blacksmith: 0/150/100 | Age 3 → enables upgrades

UPGRADES (research via research:[{"upgrade":"name"}], needs Blacksmith):
- attack_1: +2 atk to all units | 200 food + 100 gold | Age 3
- armor_1:  +3 HP to all units  | 200 wood + 100 gold | Age 3
- attack_2: +3 atk (stacks)     | 400 gold            | Age 4 + attack_1
- armor_2:  +5 HP (stacks)      | 300 wood + 200 gold | Age 4 + armor_1

ECONOMY:
- Villagers assigned to a task earn per turn: food-task=15f, wood-task=12w, gold-task=8g
- Idle villagers earn: 3 food + 2 wood each
- +5 gold per turn passively (always)
- Assign with task_villagers: {"food": N, "wood": N, "gold": N}

COMBAT: Units in same zone fight automatically. Towers fire before field combat.
Any units that reach the enemy base with NO defenders attack the Town Center directly
using their normal attack values (Wall absorbs damage first). Catapults deal the most
TC damage (12 atk each). Counter bonus = x1.5 damage. Invalid actions are dropped silently.

SCORING (if turn limit reached): resources_banked + unit_value*2 + buildings*10

ACTION SCHEMA (7 keys):
{
  "train": [{"unit": "<name>", "count": <int>}],
  "build": [{"building": "<name>", "zone": "<optional zone>"}],
  "move": [{"unit": "<name>", "count": <int>, "from": "<zone>", "to": "<zone>"}],
  "attack": [],
  "advance_age": <bool>,
  "task_villagers": {"food": <int>, "wood": <int>, "gold": <int>},
  "research": [{"upgrade": "<name>"}]
}

EARLY GAME PRIORITY (Age 1 Dark Age):
1. Immediately task ALL villagers: {"food": 2, "wood": 1} — never leave them idle.
2. Train extra Villagers (cost 50 food each) until you have 6+.
3. Advance to Age 2 (Feudal) as soon as you can afford 400 food + 200 wood.
4. Never submit an empty action — always at least task_villagers or train a Villager.

Always call submit_action (or output JSON) with your orders. Be strategic!
`;

export function buildSystemPrompt(persona: string): string {
  return SYSTEM_PROMPT.replace("{persona}", persona);
}

export function buildObservation(gs: GameState, pid: "A" | "B"): object {
  const player = gs.players[pid];
  const enemyPid = pid === "A" ? "B" : "A";
  const enemy = gs.players[enemyPid];

  // Zones where this player has units
  const playerOccupied = new Set(
    ZONES.filter((zone) =>
      Object.values(player.units[zone] ?? {}).some((v) => v > 0),
    ),
  );
  const visibleToPlayer = new Set([...playerOccupied, ...OWN_HALF[pid]]);

  const visibleZones: Record<string, { your_units: Record<string, number>; enemy_units: Record<string, number> }> = {};
  for (const zone of ZONES) {
    const myUnits = Object.fromEntries(
      Object.entries(player.units[zone] ?? {}).filter(([, v]) => v > 0),
    );
    const enemyUnits = visibleToPlayer.has(zone)
      ? Object.fromEntries(Object.entries(enemy.units[zone] ?? {}).filter(([, v]) => v > 0))
      : {};

    visibleZones[zone] = { your_units: myUnits, enemy_units: enemyUnits };
  }

  return {
    turn: gs.turn,
    you: pid,
    your_state: {
      resources: { ...player.resources },
      units: Object.fromEntries(
        ZONES.map((z) => [
          z,
          Object.fromEntries(Object.entries(player.units[z] ?? {}).filter(([, v]) => v > 0)),
        ]),
      ),
      buildings: Object.fromEntries(
        ZONES.filter((z) => (player.buildings[z]?.length ?? 0) > 0).map((z) => [z, player.buildings[z]]),
      ),
      building_hp: Object.fromEntries(
        ZONES.filter((z) => Object.keys(player.buildingHp[z] ?? {}).length > 0).map((z) => [z, player.buildingHp[z]]),
      ),
      town_center_hp: player.townCenterHp,
      production_queue: player.productionQueue.map((p) => ({ unit_type: p.unitType, turns_left: p.turnsLeft })),
      age: player.age,
      villager_tasks: { ...player.villagerTasks },
      upgrades: [...player.upgrades],
      attack_bonus: player.attackBonus,
      armor_bonus: player.armorBonus,
    },
    visible_zones: visibleZones,
    enemy_age: enemy.age,
    enemy_town_center_hp: enemy.townCenterHp,
    recent_events: gs.log.slice(-5),
  };
}
