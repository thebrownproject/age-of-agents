"""
GameState, PlayerState, Unit dataclasses — JSON-serialisable.
"""
from __future__ import annotations
import copy
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from config import ZONES, STARTING_RESOURCES, TOWN_CENTER_HP, UNITS


@dataclass
class ProductionItem:
    unit_type: str
    turns_left: int

    def to_dict(self) -> dict:
        return {"unit_type": self.unit_type, "turns_left": self.turns_left}


@dataclass
class PlayerState:
    player_id: str          # "A" or "B"
    base_zone: str          # "Base_A" or "Base_B"
    resources: Dict[str, int] = field(default_factory=lambda: dict(STARTING_RESOURCES))
    # units[zone][unit_type] = count
    units: Dict[str, Dict[str, int]] = field(default_factory=dict)
    # buildings[zone] = list of building names
    buildings: Dict[str, List[str]] = field(default_factory=dict)
    town_center_hp: int = TOWN_CENTER_HP
    production_queue: List[ProductionItem] = field(default_factory=list)
    resources_banked: int = 0   # cumulative resources ever spent (for scoring)
    # New fields
    age: int = 1
    villager_tasks: Dict[str, int] = field(default_factory=dict)
    building_hp: Dict[str, Dict[str, int]] = field(default_factory=dict)
    upgrades: List[str] = field(default_factory=list)
    attack_bonus: int = 0
    armor_bonus: int = 0
    units_killed: int = 0   # cumulative enemy units this player has killed
    units_lost: int = 0     # cumulative own units this player has lost

    def __post_init__(self):
        for zone in ZONES:
            if zone not in self.units:
                self.units[zone] = {}
            if zone not in self.buildings:
                self.buildings[zone] = []
            if zone not in self.building_hp:
                self.building_hp[zone] = {}
        # Start with 3 Villagers in home base
        self.units[self.base_zone]["Villager"] = 3

    def unit_count(self, zone: str, unit_type: str) -> int:
        return self.units.get(zone, {}).get(unit_type, 0)

    def total_units_in_zone(self, zone: str) -> Dict[str, int]:
        return {k: v for k, v in self.units.get(zone, {}).items() if v > 0}

    def has_building(self, zone: str, building: str) -> bool:
        return building in self.buildings.get(zone, [])

    def any_building(self, building: str) -> bool:
        return any(building in blist for blist in self.buildings.values())

    def score(self) -> int:
        from config import UNIT_VALUE, BUILDING_VALUE
        unit_score = sum(
            UNIT_VALUE.get(ut, 0) * count
            for zone_units in self.units.values()
            for ut, count in zone_units.items()
        )
        building_score = sum(
            len(blist) * BUILDING_VALUE
            for blist in self.buildings.values()
        )
        return self.resources_banked + unit_score * 2 + building_score

    def to_dict(self) -> dict:
        return {
            "player_id": self.player_id,
            "base_zone": self.base_zone,
            "resources": dict(self.resources),
            "units": {z: dict(u) for z, u in self.units.items()},
            "buildings": {z: list(b) for z, b in self.buildings.items()},
            "town_center_hp": self.town_center_hp,
            "production_queue": [p.to_dict() for p in self.production_queue],
            "resources_banked": self.resources_banked,
            "age": self.age,
            "villager_tasks": dict(self.villager_tasks),
            "building_hp": {z: dict(hp) for z, hp in self.building_hp.items()},
            "upgrades": list(self.upgrades),
            "attack_bonus": self.attack_bonus,
            "armor_bonus": self.armor_bonus,
            "units_killed": self.units_killed,
            "units_lost":   self.units_lost,
        }


@dataclass
class GameState:
    turn: int = 1
    players: Dict[str, PlayerState] = field(default_factory=dict)
    log: List[str] = field(default_factory=list)
    winner: Optional[str] = None  # "A", "B", "draw", or None

    @classmethod
    def new_game(cls) -> "GameState":
        gs = cls()
        gs.players["A"] = PlayerState(player_id="A", base_zone="Base_A")
        gs.players["B"] = PlayerState(player_id="B", base_zone="Base_B")
        return gs

    def add_log(self, msg: str):
        self.log.append(f"[T{self.turn}] {msg}")

    def recent_log(self, n: int = 5) -> List[str]:
        return self.log[-n:]

    def to_dict(self) -> dict:
        return {
            "turn": self.turn,
            "players": {pid: p.to_dict() for pid, p in self.players.items()},
            "log": self.log,
            "winner": self.winner,
        }

    def deep_copy(self) -> "GameState":
        return copy.deepcopy(self)
