"""
Builds system prompt (rules) and per-turn observation prompt.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from engine.state import GameState

from config import ZONES

OWN_HALF = {
    "A": {"Base_A", "Top_A", "Mid_A", "Bot_A"},
    "B": {"Base_B", "Top_B", "Mid_B", "Bot_B"},
}

SYSTEM_PROMPT = """\
You are an AI general commanding a civilization in "Age of Agents", a turn-based strategy game.
Your persona/strategy: {persona}

MAP (3-lane):
         [Top_A] ────── [Top_B]
        /   |                |   \\
[Base_A]  [Mid_A] ────── [Mid_B]  [Base_B]
        \\   |                |   /
         [Bot_A] ────── [Bot_B]

Adjacency:
- Base_A ↔ Top_A, Mid_A, Bot_A
- Top_A  ↔ Base_A, Mid_A, Top_B    (jungle: Top_A↔Mid_A)
- Mid_A  ↔ Base_A, Top_A, Bot_A, Mid_B
- Bot_A  ↔ Base_A, Mid_A, Bot_B    (jungle: Bot_A↔Mid_A)
- Top_B  ↔ Top_A, Mid_B, Base_B    (jungle: Top_B↔Mid_B)
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

UPGRADES (research via research:[{{"upgrade":"name"}}], needs Blacksmith):
- attack_1: +2 atk to all units | 200 food + 100 gold | Age 3
- armor_1:  +3 HP to all units  | 200 wood + 100 gold | Age 3
- attack_2: +3 atk (stacks)     | 400 gold            | Age 4 + attack_1
- armor_2:  +5 HP (stacks)      | 300 wood + 200 gold | Age 4 + armor_1

ECONOMY:
- Villagers assigned to a task earn per turn: food-task=15f, wood-task=12w, gold-task=8g
- Idle villagers earn: 3 food + 2 wood each
- +5 gold per turn passively (always)
- Assign with task_villagers: {{"food": N, "wood": N, "gold": N}}

COMBAT: Units in same zone fight automatically. Towers fire before field combat.
Any units that reach the enemy base with NO defenders attack the Town Center directly
using their normal attack values (Wall absorbs damage first). Catapults deal the most
TC damage (12 atk each). Counter bonus = x1.5 damage. Invalid actions are dropped silently.

SCORING (if turn limit reached): resources_banked + unit_value*2 + buildings*10

ACTION SCHEMA (7 keys):
{{
  "train": [{{"unit": "<name>", "count": <int>}}],
  "build": [{{"building": "<name>"}}],
  "move": [{{"unit": "<name>", "count": <int>, "from": "<zone>", "to": "<zone>"}}],
  "attack": [],
  "advance_age": <bool>,
  "task_villagers": {{"food": <int>, "wood": <int>, "gold": <int>}},
  "research": [{{"upgrade": "<name>"}}]
}}

Always call submit_action (or output JSON) with your orders. Be strategic!
"""


def build_observation(gs: "GameState", pid: str) -> dict:
    """
    Build a per-player observation dict (fog of war applied).
    """
    player = gs.players[pid]
    enemy_pid = "B" if pid == "A" else "A"
    enemy = gs.players[enemy_pid]

    # Determine which zones are visible
    # Always see own half; also see enemy zones where player has units
    player_occupied = {zone for zone, units in player.units.items()
                       if any(v > 0 for v in units.values())}
    visible_to_player = player_occupied | OWN_HALF[pid]

    visible_zones = {}
    for zone in ZONES:
        my_units = {k: v for k, v in player.units.get(zone, {}).items() if v > 0}
        if zone in visible_to_player:
            enemy_units = {k: v for k, v in enemy.units.get(zone, {}).items() if v > 0}
        else:
            enemy_units = {}
        visible_zones[zone] = {
            "your_units": my_units,
            "enemy_units": enemy_units,
        }

    obs = {
        "turn": gs.turn,
        "you": pid,
        "your_state": {
            "resources": dict(player.resources),
            "units": {
                zone: {k: v for k, v in units.items() if v > 0}
                for zone, units in player.units.items()
            },
            "buildings": {
                zone: list(blist)
                for zone, blist in player.buildings.items()
                if blist
            },
            "building_hp": {
                zone: dict(hp)
                for zone, hp in player.building_hp.items()
                if hp
            },
            "town_center_hp": player.town_center_hp,
            "production_queue": [p.to_dict() for p in player.production_queue],
            "age": player.age,
            "villager_tasks": dict(player.villager_tasks),
            "upgrades": list(player.upgrades),
            "attack_bonus": player.attack_bonus,
            "armor_bonus": player.armor_bonus,
        },
        "visible_zones": visible_zones,
        "enemy_age": enemy.age,
        "enemy_town_center_hp": enemy.town_center_hp,
        "recent_events": gs.recent_log(5),
    }
    return obs
