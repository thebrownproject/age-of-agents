"""
Game constants: unit stats, costs, buildings, turn limits, zone names.
"""

TURN_LIMIT = 50

ZONES = ["Base_A", "Top_A", "Mid_A", "Bot_A", "Top_B", "Mid_B", "Bot_B", "Base_B"]

ADJACENCY = {
    "Base_A": {"Top_A", "Mid_A", "Bot_A"},
    "Top_A":  {"Base_A", "Mid_A", "Top_B"},
    "Mid_A":  {"Base_A", "Top_A", "Bot_A", "Mid_B"},
    "Bot_A":  {"Base_A", "Mid_A", "Bot_B"},
    "Top_B":  {"Top_A", "Mid_B", "Base_B"},
    "Mid_B":  {"Mid_A", "Top_B", "Bot_B", "Base_B"},
    "Bot_B":  {"Bot_A", "Mid_B", "Base_B"},
    "Base_B": {"Top_B", "Mid_B", "Bot_B"},
}

STARTING_RESOURCES = {"food": 200, "wood": 150, "gold": 50}

GOLD_TRICKLE = 5  # per turn passive

VILLAGER_TASK_RATES = {"food": 15, "wood": 12, "gold": 8}
VILLAGER_IDLE_RATES = {"food": 3, "wood": 2}

TOWN_CENTER_HP = 200

AGE_NAMES = {1: "Dark", 2: "Feudal", 3: "Castle", 4: "Imperial"}

AGE_ADVANCE_COSTS = {
    2: {"food": 400, "wood": 200},
    3: {"food": 500, "wood": 300, "gold": 200},
    4: {"wood": 800, "gold": 500},
}

# Minimum age required to train each unit
UNIT_AGE_REQUIREMENT = {
    "Villager": 1,
    "Militia": 2,
    "Archer": 2,
    "Knight": 3,
    "Catapult": 3,
}

# Minimum age required to build each building
BUILDING_AGE_REQUIREMENT = {
    "Barracks": 2,
    "Range": 2,
    "Wall": 3,
    "Tower": 3,
    "Blacksmith": 3,
}

# Unit definitions: cost, hp, atk, counter (unit type it deals x1.5 vs), train_turns
UNITS = {
    "Villager": {
        "cost": {"food": 50, "wood": 0, "gold": 0},
        "hp": 5,
        "atk": 1,
        "counter": None,
        "train_turns": 1,
    },
    "Militia": {
        "cost": {"food": 60, "wood": 0, "gold": 0},
        "hp": 8,
        "atk": 3,
        "counter": None,
        "train_turns": 1,
    },
    "Archer": {
        "cost": {"food": 0, "wood": 60, "gold": 0},
        "hp": 6,
        "atk": 4,
        "counter": "Infantry",  # counters Militia/Villager (infantry class)
        "train_turns": 2,
    },
    "Knight": {
        "cost": {"food": 0, "wood": 0, "gold": 80},
        "hp": 15,
        "atk": 6,
        "counter": "Archer",
        "train_turns": 3,
    },
    "Catapult": {
        "cost": {"food": 0, "wood": 50, "gold": 100},
        "hp": 10,
        "atk": 12,
        "counter": "Building",
        "train_turns": 4,
    },
}

# Infantry class (units that Archer counters)
INFANTRY_TYPES = {"Villager", "Militia"}

# Military unit types (not Villager)
MILITARY_UNIT_TYPES = {"Militia", "Archer", "Knight", "Catapult"}

# Buildings
BUILDINGS = {
    "Barracks": {
        "cost": {"food": 0, "wood": 100, "gold": 0},
        "hp": 50,
        "enables": ["Militia", "Knight"],
        "age": 2,
    },
    "Range": {
        "cost": {"food": 0, "wood": 80, "gold": 0},
        "hp": 40,
        "enables": ["Archer"],
        "age": 2,
    },
    "Wall": {
        "cost": {"food": 0, "wood": 50, "gold": 0},
        "hp": 100,
        "enables": [],
        "age": 3,
    },
    "Tower": {
        "cost": {"food": 0, "wood": 80, "gold": 50},
        "hp": 60,
        "damage_per_turn": 8,
        "enables": [],
        "age": 3,
    },
    "Blacksmith": {
        "cost": {"food": 0, "wood": 150, "gold": 100},
        "hp": 0,
        "enables": [],
        "age": 3,
    },
}

# Unit upgrades researched at Blacksmith
UPGRADES = {
    "attack_1": {
        "cost": {"food": 200, "wood": 0, "gold": 100},
        "attack_bonus": 2,
        "armor_bonus": 0,
        "age": 3,
        "requires_building": "Blacksmith",
        "requires_upgrade": None,
    },
    "armor_1": {
        "cost": {"food": 0, "wood": 200, "gold": 100},
        "attack_bonus": 0,
        "armor_bonus": 3,
        "age": 3,
        "requires_building": "Blacksmith",
        "requires_upgrade": None,
    },
    "attack_2": {
        "cost": {"food": 0, "wood": 0, "gold": 400},
        "attack_bonus": 3,
        "armor_bonus": 0,
        "age": 4,
        "requires_building": "Blacksmith",
        "requires_upgrade": "attack_1",
    },
    "armor_2": {
        "cost": {"food": 0, "wood": 300, "gold": 200},
        "attack_bonus": 0,
        "armor_bonus": 5,
        "age": 4,
        "requires_building": "Blacksmith",
        "requires_upgrade": "armor_1",
    },
}

# Unit value for scoring (score = resources + unit_value*2 + buildings*10)
UNIT_VALUE = {
    "Villager": 25,
    "Militia": 30,
    "Archer": 30,
    "Knight": 40,
    "Catapult": 75,
}

BUILDING_VALUE = 10

COUNTER_BONUS = 1.5
